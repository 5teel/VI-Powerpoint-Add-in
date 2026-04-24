/**
 * G1 (Zod) + G2 (Vega-Lite) guardrails with 1-retry-with-repair-hint discipline.
 * See 05-AI-SPEC.md §6 Guardrails table.
 *
 * Phase 6 D-13: the FIRST attempt is wrapped with retryWithBackoff keyed on
 * isAnthropicRateLimit, so transient Anthropic 429s auto-retry 1s/2s/4s up to
 * 3 attempts before surfacing. G1/G2 repair-hint retries are orthogonal —
 * they handle correctness-of-output failures, not rate-limit failures — and
 * are NOT wrapped (we don't want to compound retries).
 */
import Ajv from "ajv";
import addFormats from "ajv-formats";
import vegaLiteSchema from "vega-lite/vega-lite-schema.json";
import { composeSlide, type ComposerInput, type ComposerCallbacks } from "./composer";
import type { CompositionPlan } from "./compositionSchema";
import { logEvent } from "./telemetry";
import { retryWithBackoff, isAnthropicRateLimit } from "./retryBackoff";

// Compile validator once at module load — O(ms) cost paid once per bundle lifetime.
const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);
export const validateVegaLite = ajv.compile(vegaLiteSchema as object);

export async function composeWithRetry(
  input: ComposerInput,
  cb: ComposerCallbacks,
  originalVegaSpec?: object
): Promise<CompositionPlan> {
  const attempt = (repairHint?: string) =>
    new Promise<CompositionPlan>((resolve, reject) => {
      const augmented = repairHint
        ? {
            ...input,
            userQuestion: `${input.userQuestion}\n\nREPAIR INSTRUCTIONS (previous attempt failed):\n${repairHint}`,
          }
        : input;
      // Guard against double-settle: composeSlide may call onFinal AND onError
      // (e.g., stream "error" event + try/catch), or either twice on edge paths.
      // Only the first call wins — subsequent calls are ignored.
      let settled = false;
      composeSlide(augmented, {
        onPartialPlan: cb.onPartialPlan,
        onFinal: (p) => {
          if (settled) return;
          settled = true;
          resolve(p);
        },
        onError: (e) => {
          if (settled) return;
          settled = true;
          reject(e);
        },
      });
    });

  try {
    // Phase 6 D-13: wrap the first attempt with retryWithBackoff to auto-retry
    // Anthropic 429s. G1 (Zod) and G2 (Vega-Lite) retries below are orthogonal —
    // they handle correctness-of-output failures, not rate-limit failures. Do NOT
    // compound (no 429 wrapper around the repair-hint retry below).
    let plan = await retryWithBackoff(
      (_attemptNum) => attempt(),
      {
        maxAttempts: 3,
        baseMs: 1000,
        capMs: 30000,
        jitter: 0.2,
        isRetryable: isAnthropicRateLimit,
        onBackoff: (attemptN, waitMs) => {
          logEvent("stage_retry_invoked", {
            stage: "composing",
            attempt: attemptN,
            reason: "rate-limit",
            waitMs,
          });
          cb.onRateLimitRetry?.(attemptN, waitMs);
        },
        signal: input.signal,
      }
    ).catch((err) => {
      if (isAnthropicRateLimit(err)) {
        logEvent("stage_retry_invoked", {
          stage: "composing",
          attempt: 3,
          reason: "rate-limit-exhausted",
        });
      }
      throw err;
    });

    if (plan.chartSpec && !validateVegaLite(plan.chartSpec)) {
      const errs = (validateVegaLite.errors ?? [])
        .slice(0, 5)
        .map((e) => `- ${e.instancePath || "(root)"}: ${e.message}`)
        .join("\n");
      logEvent("guardrail.vega_retry", { errors: validateVegaLite.errors });
      try {
        plan = await attempt(
          `Your previous chartSpec failed Vega-Lite v5 validation:\n${errs}\nEmit a corrected chartSpec that passes the v5 schema.`
        );
      } catch (retryErr) {
        // Retry threw (network, stream error) — fall through to G2 final fallback below.
        logEvent("guardrail.vega_retry_failed", { err: String(retryErr) });
      }

      if (plan.chartSpec && !validateVegaLite(plan.chartSpec)) {
        // G2 final fallback: swap in the original unmutated Vega spec.
        logEvent("guardrail.vega_fallback", {});
        plan = { ...plan, chartSpec: (originalVegaSpec ?? plan.chartSpec) as Record<string, unknown> };
      }
    }

    cb.onFinal(plan);
    return plan;
  } catch (err) {
    cb.onError(err as Error);
    throw err;
  }
}
