import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { loadCubeData, type CubeQuery } from "./cubeDataClient";

describe("loadCubeData", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function mockFetch(responses: Array<{ status?: number; body: unknown }>) {
    let i = 0;
    return vi.fn(async () => {
      const resp = responses[Math.min(i, responses.length - 1)];
      i++;
      return {
        ok: (resp.status ?? 200) < 400,
        status: resp.status ?? 200,
        json: async () => resp.body,
      } as unknown as Response;
    });
  }

  it("DATA-01: polls on Continue wait then resolves with data", async () => {
    const fetchMock = mockFetch([
      { body: { error: "Continue wait" } },
      { body: { error: "Continue wait" } },
      { body: { data: [{ x: 1 }], annotation: { measures: {}, dimensions: {} }, query: {} } },
    ]);
    vi.stubGlobal("fetch", fetchMock);
    const promise = loadCubeData({ measures: ["sales.revenue"] });
    // Drain the two poll sleeps
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    const result = await promise;
    expect(result.data).toEqual([{ x: 1 }]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("DATA-01: times out at 60s when Continue wait never resolves", async () => {
    const fetchMock = mockFetch([{ body: { error: "Continue wait" } }]);
    vi.stubGlobal("fetch", fetchMock);
    const promise = loadCubeData({ measures: ["sales.revenue"] });
    const catcher = promise.catch((e) => e);
    await vi.advanceTimersByTimeAsync(61_000);
    const err = await catcher;
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/didn't return data within 60 seconds/);
  });

  it("DATA-01: rejects immediately on pre-aborted signal", async () => {
    const ac = new AbortController();
    ac.abort();
    vi.stubGlobal("fetch", vi.fn());
    await expect(loadCubeData({ measures: [] }, { signal: ac.signal })).rejects.toThrow(/Abort/i);
  });

  it("DATA-01: throws a real error (non-Continue-wait) body through", async () => {
    vi.stubGlobal("fetch", mockFetch([{ body: { error: "Schema not found" } }]));
    await expect(loadCubeData({ measures: [] })).rejects.toThrow(/Schema not found/);
  });

  it("DATA-01: maps HTTP 401/403 to auth-failed error", async () => {
    vi.stubGlobal("fetch", mockFetch([{ status: 401, body: {} }]));
    await expect(loadCubeData({ measures: [] })).rejects.toThrow(/authentication failed/i);
  });

  it("DATA-01: sends Bearer JWT and the query body", async () => {
    const fetchMock = mockFetch([
      { body: { data: [], annotation: { measures: {}, dimensions: {} }, query: {} } },
    ]);
    vi.stubGlobal("fetch", fetchMock);
    const query: CubeQuery = { measures: ["m"], dimensions: ["d"], limit: 10 };
    await loadCubeData(query);
    const init = (fetchMock.mock.calls[0] as unknown[])[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toMatch(/^Bearer /);
    expect(JSON.parse(init.body as string)).toEqual({ query });
  });
});
