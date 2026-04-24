/**
 * Offline LLM-judge harness for Phase 5 composition eval per 05-AI-SPEC.md §5.
 * Iterates tests/fixtures/composition/, invokes Anthropic judge on each, emits
 * reports/evals-judge.json.
 *
 * Full implementation is deferred — this stub exists so the Wave 0 test-infra
 * contract is complete and downstream plans can invoke `npm run evals:judge`.
 */
import Anthropic from "@anthropic-ai/sdk";

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error("ANTHROPIC_API_KEY is required for runLlmJudge");
  process.exit(2);
}

// Construct to assert the SDK imports correctly under Node — not used yet.
new Anthropic({ apiKey });

console.log("[evals:judge] TODO: iterate tests/fixtures/composition/ (Phase 5 plan 02+)");
process.exit(0);
