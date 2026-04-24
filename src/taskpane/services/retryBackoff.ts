/**
 * Phase 6 D-13 retry helper — exponential backoff with jitter, capped attempts,
 * Retry-After header precedence, AbortSignal support.
 *
 * Defaults (06-UI-SPEC §Stage-Specific Inline Errors):
 *   baseMs:      1000   (first retry after ~1s)
 *   jitterPct:   0.20   (±20% uniform jitter)
 *   capMs:       30_000 (hard ceiling per attempt)
 *   maxAttempts: 3      (1 + 2 retries)
 *
 * Total worst-case retry time ≈ 1 + 2 + 4 = 7s base (+ jitter) before rethrow.
 * Wraps Anthropic rate-limit retries per 06-UI-SPEC §Stage-Specific Inline Errors.
 */

export interface BackoffDelayOpts {
  baseMs?: number;
  jitterPct?: number;
  capMs?: number;
  /** Override the RNG for deterministic tests. Defaults to Math.random. */
  rng?: () => number;
}

/**
 * Pure helper — computes the delay for attempt N with exponential growth,
 * bounded by capMs, modulated by symmetric ±jitterPct random jitter.
 * Attempt numbering starts at 1 (first retry).
 */
export function backoffDelayMs(attempt: number, opts?: BackoffDelayOpts): number {
  const baseMs = opts?.baseMs ?? 1000;
  const jitterPct = opts?.jitterPct ?? 0.2;
  const capMs = opts?.capMs ?? 30_000;
  const rng = opts?.rng ?? Math.random;

  const safeAttempt = Math.max(0, attempt - 1);
  // Cap exponential growth BEFORE applying jitter so the jitter band scales
  // against the capped value, not the unbounded 2^N product.
  const exp = Math.min(capMs, baseMs * Math.pow(2, safeAttempt));
  const jitter = exp * jitterPct * (rng() * 2 - 1);
  return Math.max(0, Math.round(exp + jitter));
}

/**
 * Classifies an error as an Anthropic rate-limit / 429 event. Retry-safe errors
 * MUST match this predicate; everything else rethrows immediately from
 * retryWithBackoff.
 */
export function isAnthropicRateLimit(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { status?: number; name?: string };
  return e.status === 429 || e.name === "RateLimitError";
}

export interface RetryOpts {
  maxAttempts?: number;
  baseMs?: number;
  capMs?: number;
  jitter?: number;
  /** Classifier — return true to trigger a retry; false rethrows immediately. */
  isRetryable: (err: unknown) => boolean;
  /** Fired after each failed attempt with the attempt number + planned wait. */
  onBackoff?: (attempt: number, waitMs: number) => void;
  /** Cancels the retry loop; throws AbortError if aborted mid-wait. */
  signal?: AbortSignal;
}

function makeAbortError(): DOMException {
  // DOMException is available in all modern browser + node 18+ runtimes.
  // Fall back to a plain Error with name="AbortError" if DOMException is missing.
  if (typeof DOMException !== "undefined") {
    return new DOMException("aborted", "AbortError");
  }
  const err = new Error("aborted");
  err.name = "AbortError";
  return err as unknown as DOMException;
}

/**
 * Run fn up to maxAttempts times, retrying only on errors that pass isRetryable.
 * Between attempts, waits according to Retry-After header (if present on the
 * error) or backoffDelayMs otherwise. Aborts immediately if signal is aborted.
 */
export async function retryWithBackoff<T>(
  fn: (attempt: number) => Promise<T>,
  opts: RetryOpts
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const baseMs = opts.baseMs ?? 1000;
  const capMs = opts.capMs ?? 30_000;
  const jitter = opts.jitter ?? 0.2;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (opts.signal?.aborted) throw makeAbortError();
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      if (opts.signal?.aborted) throw makeAbortError();
      if (!opts.isRetryable(err) || attempt === maxAttempts) throw err;

      // Prefer a server-provided Retry-After header when present; otherwise
      // fall back to the exponential+jitter curve.
      const e = err as { headers?: { get?: (n: string) => string | null } };
      const retryAfter = e?.headers?.get?.("retry-after");
      const retryAfterMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 0;
      const waitMs =
        Number.isFinite(retryAfterMs) && retryAfterMs > 0
          ? retryAfterMs
          : backoffDelayMs(attempt, { baseMs, capMs, jitterPct: jitter });

      opts.onBackoff?.(attempt, waitMs);

      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          opts.signal?.removeEventListener("abort", onAbort);
          resolve();
        }, waitMs);
        const onAbort = () => {
          clearTimeout(timer);
          opts.signal?.removeEventListener("abort", onAbort);
          reject(makeAbortError());
        };
        if (opts.signal) opts.signal.addEventListener("abort", onAbort, { once: true });
      });
    }
  }
  throw lastErr;
}
