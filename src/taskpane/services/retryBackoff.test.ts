import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  retryWithBackoff,
  isAnthropicRateLimit,
  backoffDelayMs,
} from "./retryBackoff";

/**
 * Phase 6 D-13 retry helper — exponential backoff with jitter, capped attempts,
 * Retry-After header precedence, AbortSignal support.
 *
 * Tests mirror compositionRetry.test.ts patterns but use vi.useFakeTimers() for
 * deterministic control over setTimeout-based delays.
 */
describe("isAnthropicRateLimit (D-13)", () => {
  it("D-13: returns true for err.status === 429", () => {
    expect(isAnthropicRateLimit({ status: 429 })).toBe(true);
  });

  it("D-13: returns true for err.name === 'RateLimitError'", () => {
    expect(isAnthropicRateLimit({ name: "RateLimitError" })).toBe(true);
  });

  it("D-13: returns false for status 500 / network errors / undefined", () => {
    expect(isAnthropicRateLimit({ status: 500 })).toBe(false);
    expect(isAnthropicRateLimit(new Error("network down"))).toBe(false);
    expect(isAnthropicRateLimit(undefined)).toBe(false);
    expect(isAnthropicRateLimit(null)).toBe(false);
    expect(isAnthropicRateLimit("string-error")).toBe(false);
  });
});

describe("backoffDelayMs (D-13)", () => {
  it("D-13: backoffDelayMs(1, defaults) in [800, 1200] (base=1000 ± 20%)", () => {
    // Sweep the RNG over the 0..1 range to confirm all outcomes stay in the
    // advertised jitter band.
    for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
      const d = backoffDelayMs(1, { rng: () => r });
      expect(d).toBeGreaterThanOrEqual(800);
      expect(d).toBeLessThanOrEqual(1200);
    }
  });

  it("D-13: backoffDelayMs(2, defaults) in [1600, 2400] (base=2000 ± 20%)", () => {
    for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
      const d = backoffDelayMs(2, { rng: () => r });
      expect(d).toBeGreaterThanOrEqual(1600);
      expect(d).toBeLessThanOrEqual(2400);
    }
  });

  it("D-13: backoffDelayMs(3, defaults) in [3200, 4800]", () => {
    for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
      const d = backoffDelayMs(3, { rng: () => r });
      expect(d).toBeGreaterThanOrEqual(3200);
      expect(d).toBeLessThanOrEqual(4800);
    }
  });

  it("D-13: backoffDelayMs respects capMs=30000 on large attempt numbers", () => {
    // 2^15 * 1000 = 32_768_000 → cap at 30_000. With ±20% jitter the result
    // stays within [24_000, 36_000]. Assert we never exceed cap * 1.2.
    for (const r of [0, 0.5, 1]) {
      const d = backoffDelayMs(15, { rng: () => r });
      expect(d).toBeLessThanOrEqual(36_000);
      expect(d).toBeGreaterThanOrEqual(24_000);
    }
  });
});

describe("retryWithBackoff (D-13)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("D-13: retries rate-limit errors up to 3 attempts then rethrows the final one", async () => {
    const rateLimitErr = { status: 429, message: "rate limited" };
    const fn = vi
      .fn<(attempt: number) => Promise<string>>()
      .mockRejectedValue(rateLimitErr);

    const promise = retryWithBackoff(fn, {
      isRetryable: isAnthropicRateLimit,
      maxAttempts: 3,
    });
    // Catch the eventual rejection immediately to avoid unhandled-rejection noise
    // while we drain timers.
    const guarded = promise.catch((e) => e);
    await vi.runAllTimersAsync();
    const err = await guarded;
    expect(fn).toHaveBeenCalledTimes(3);
    expect(err).toBe(rateLimitErr);
  });

  it("D-13: succeeds on attempt 2 (after 1 rate-limit then success) — fn called 2x, onBackoff fired once", async () => {
    let n = 0;
    const fn = vi
      .fn<(attempt: number) => Promise<string>>()
      .mockImplementation(async () => {
        n++;
        if (n === 1) throw { status: 429 };
        return "ok";
      });
    const onBackoff = vi.fn();
    const promise = retryWithBackoff(fn, {
      isRetryable: isAnthropicRateLimit,
      onBackoff,
    });
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
    expect(onBackoff).toHaveBeenCalledTimes(1);
    const [attempt, waitMs] = onBackoff.mock.calls[0];
    expect(attempt).toBe(1);
    // Base=1000ms ± 20% jitter → waitMs ∈ [800, 1200]
    expect(waitMs).toBeGreaterThanOrEqual(800);
    expect(waitMs).toBeLessThanOrEqual(1200);
  });

  it("D-13: does NOT retry non-retryable errors (throws immediately, fn called 1x)", async () => {
    const fn = vi
      .fn<(attempt: number) => Promise<string>>()
      .mockRejectedValue(new Error("network down"));
    const promise = retryWithBackoff(fn, {
      isRetryable: isAnthropicRateLimit,
    });
    await expect(promise).rejects.toThrow(/network down/);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("D-13: fires onBackoff(attempt, waitMs) between attempts", async () => {
    let n = 0;
    const fn = vi
      .fn<(attempt: number) => Promise<string>>()
      .mockImplementation(async () => {
        n++;
        if (n < 3) throw { status: 429 };
        return "ok";
      });
    const onBackoff = vi.fn();
    const promise = retryWithBackoff(fn, {
      isRetryable: isAnthropicRateLimit,
      onBackoff,
    });
    await vi.runAllTimersAsync();
    await promise;
    expect(onBackoff).toHaveBeenCalledTimes(2);
    expect(onBackoff.mock.calls[0][0]).toBe(1); // first attempt failed
    expect(onBackoff.mock.calls[1][0]).toBe(2); // second attempt failed
  });

  it("D-13: aborts via AbortSignal — throws AbortError, fn called once, no timer drain", async () => {
    const ac = new AbortController();
    let n = 0;
    const fn = vi
      .fn<(attempt: number) => Promise<string>>()
      .mockImplementation(async () => {
        n++;
        if (n === 1) {
          ac.abort();
          throw { status: 429 };
        }
        return "ok";
      });
    const promise = retryWithBackoff(fn, {
      isRetryable: isAnthropicRateLimit,
      signal: ac.signal,
    });
    // Drain timers; abort should short-circuit the wait.
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toSatisfy((err: unknown) => {
      return err instanceof Error && (err.name === "AbortError" || /abort/i.test(err.message));
    });
    // fn called exactly once — we aborted inside attempt 1; attempt 2 never runs.
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("D-13: respects Retry-After header — err.headers.get('retry-after') returns '3' → waits ~3000ms, not exponential 1000ms", async () => {
    let n = 0;
    const rateLimitErrWithHeader = {
      status: 429,
      headers: {
        get: (name: string) => (name === "retry-after" ? "3" : null),
      },
    };
    const fn = vi
      .fn<(attempt: number) => Promise<string>>()
      .mockImplementation(async () => {
        n++;
        if (n === 1) throw rateLimitErrWithHeader;
        return "ok";
      });
    const onBackoff = vi.fn();
    const promise = retryWithBackoff(fn, {
      isRetryable: isAnthropicRateLimit,
      onBackoff,
    });
    await vi.runAllTimersAsync();
    await promise;
    const [, waitMs] = onBackoff.mock.calls[0];
    // Retry-After header wins over exponential: 3s = 3000ms exactly (no jitter applied
    // when the server tells us what to do).
    expect(waitMs).toBe(3000);
  });

  it("D-13: aborts before first attempt when signal pre-aborted", async () => {
    const ac = new AbortController();
    ac.abort();
    const fn = vi.fn<(attempt: number) => Promise<string>>();
    const promise = retryWithBackoff(fn, {
      isRetryable: isAnthropicRateLimit,
      signal: ac.signal,
    });
    await expect(promise).rejects.toSatisfy((err: unknown) => {
      return err instanceof Error && (err.name === "AbortError" || /abort/i.test(err.message));
    });
    expect(fn).not.toHaveBeenCalled();
  });
});
