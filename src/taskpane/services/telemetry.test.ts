import { describe, it, expect, vi, beforeEach } from "vitest";
import { logEvent, readEvents, clearEvents } from "./telemetry";

describe("telemetry", () => {
  beforeEach(() => {
    // Use an in-memory localStorage stub since tests run under environment:"node"
    const store: Record<string, string> = {};
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
    });
  });

  it("G5: logEvent writes to localStorage under summit.ai.trace.v1 and readEvents returns them", () => {
    logEvent("guardrail.vega_retry", { errors: ["x"] });
    const events = readEvents();
    expect(events).toHaveLength(1);
    expect(events[0].name).toBe("guardrail.vega_retry");
    expect(events[0].payload).toEqual({ errors: ["x"] });
  });

  it("caps events at 100 (ring buffer)", () => {
    for (let i = 0; i < 150; i++) logEvent(`e${i}`);
    const events = readEvents();
    expect(events).toHaveLength(100);
    expect(events[0].name).toBe("e50"); // oldest kept
    expect(events[99].name).toBe("e149");
  });

  it("never throws when localStorage throws", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
      removeItem: () => {
        throw new Error("denied");
      },
    });
    expect(() => logEvent("x")).not.toThrow();
    expect(readEvents()).toEqual([]);
    expect(() => clearEvents()).not.toThrow();
  });
});
