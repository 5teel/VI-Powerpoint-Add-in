/**
 * D-02 router: decides whether a Cube AI chat message should trigger the
 * Phase 5 composition pipeline (SlidePreview) or fall back to the legacy
 * narrative insertSlide path.
 *
 * A "composition-capable" message is one where Cube AI emitted a finalised
 * cubeSqlApi toolCall alongside the assistant text. If the toolCall is absent
 * or still in-process, the narrative fallback path applies.
 */
import type { CubeSqlApiToolCall } from "./cubeai";

export interface RoutableMessage {
  toolCall?: CubeSqlApiToolCall | null;
}

export type SlideRoute = "composition" | "narrative";

export function routeCreateSlide(msg: RoutableMessage): SlideRoute {
  const tc = msg.toolCall;
  if (!tc) return "narrative";
  if (tc.name !== "cubeSqlApi") return "narrative";
  if (tc.isInProcess !== false) return "narrative";
  return "composition";
}

/**
 * Phase 6 message routes — widens the D-02 binary (composition|narrative) into
 * the four paths the ChatPanel / WizardPanel must dispatch between on submit.
 */
export type MessageRoute =
  | "new-composition"
  | "refinement"
  | "section-plan"
  | "narrative";

/**
 * Context the router needs in addition to the message itself.
 * refinementChipVisible is the Chip visibility flag (derived upstream from
 * scoreRefinementIntent + user dismissal state). sectionPlanHint comes from
 * the meta-composer's decision ("allow-multi") or an explicit single-slide
 * override ("force-single"). lastSlideTitle is informational — the router
 * does not read it, but ChatPanel threads it through for downstream display.
 */
export interface MessageRouteContext {
  refinementChipVisible: boolean;
  sectionPlanHint?: "force-single" | "allow-multi";
  lastSlideTitle?: string;
}

/**
 * Phase 6 message router — layers D-01/D-02 refinement and D-05 section-plan
 * decisions on top of the existing Phase 5 D-02 toolCall gate.
 *
 * Precedence (highest → lowest):
 *   1. routeCreateSlide(msg) === "narrative"  → "narrative"       (Phase 5 degrade path)
 *   2. ctx.sectionPlanHint === "allow-multi"  → "section-plan"    (D-05 meta-composer)
 *   3. ctx.refinementChipVisible              → "refinement"      (D-01/D-02 chip)
 *   4. default                                → "new-composition" (single-slide pipeline)
 *
 * Section-plan deliberately beats refinement — when the meta-composer has decided
 * the question needs multiple slides, that decision is authoritative regardless of
 * whether the chip was visible on submit.
 */
export function routeMessage(
  msg: RoutableMessage,
  ctx: MessageRouteContext
): MessageRoute {
  if (routeCreateSlide(msg) === "narrative") return "narrative";
  if (ctx.sectionPlanHint === "allow-multi") return "section-plan";
  if (ctx.refinementChipVisible) return "refinement";
  return "new-composition";
}
