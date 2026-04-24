/**
 * Cube REST /load client with Continue-wait polling and AbortSignal threading.
 * Per Phase 5 D-15, D-16, D-17.
 *
 * Pitfall 2: Cube returns HTTP 200 with `{"error":"Continue wait"}` while a query
 * is still computing. Always parse the body before deciding success/failure.
 */
import { CUBE_DATA_CONFIG } from "../config";

export interface CubeQuery {
  measures?: string[];
  dimensions?: string[];
  filters?: Array<{ member: string; operator: string; values: unknown[] }>;
  timeDimensions?: Array<{ dimension: string; dateRange?: string | string[]; granularity?: string }>;
  order?: Array<[string, "asc" | "desc"]>;
  limit?: number;
  offset?: number;
}

export interface CubeLoadResponse {
  data: Record<string, unknown>[];
  annotation: {
    measures: Record<string, { title: string; type: string }>;
    dimensions: Record<string, { title: string; type: string }>;
  };
  query: CubeQuery;
  lastRefreshTime?: string;
}

const POLL_INTERVAL_MS = 1000; // D-16
const TIMEOUT_MS = 60_000; // D-16

export async function loadCubeData(
  query: CubeQuery,
  options: { signal?: AbortSignal } = {}
): Promise<CubeLoadResponse> {
  const url = `${CUBE_DATA_CONFIG.baseUrl}/cubejs-api/v1/load`;
  const start = Date.now();

  while (true) {
    if (options.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    if (Date.now() - start > TIMEOUT_MS) {
      throw new Error(`Cube didn't return data within ${TIMEOUT_MS / 1000} seconds.`);
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CUBE_DATA_CONFIG.jwt}`,
      },
      body: JSON.stringify({ query }),
      signal: options.signal,
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error("Cube authentication failed. The JWT may be invalid or expired.");
      }
      throw new Error(`Couldn't reach Cube: HTTP ${response.status}.`);
    }

    const body = await response.json();

    // Pitfall 2: Continue wait is HTTP 200 with an error body.
    if (body?.error === "Continue wait") {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      continue;
    }

    if (body?.error) {
      throw new Error(body.error);
    }

    if (!body?.data) {
      throw new Error("Cube returned an unexpected response shape.");
    }

    return body as CubeLoadResponse;
  }
}
