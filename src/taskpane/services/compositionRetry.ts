/**
 * G1 (Zod) + G2 (Vega-Lite) guardrails with 1-retry-with-repair-hint discipline.
 * See 05-AI-SPEC.md §6 Guardrails table.
 */
import Ajv from "ajv";
import addFormats from "ajv-formats";
import vegaLiteSchema from "vega-lite/vega-lite-schema.json";
import { composeSlide, type ComposerInput, type ComposerCallbacks } from "./composer";
import type { CompositionPlan } from "./compositionSchema";
import { logEvent } from "./telemetry";

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
    let plan = await attempt();

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
