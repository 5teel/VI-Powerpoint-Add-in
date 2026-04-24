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
