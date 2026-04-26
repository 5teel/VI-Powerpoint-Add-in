import React, { useCallback, useRef, useState } from "react";
import { Button, Input, Spinner, Text } from "@fluentui/react-components";
import type { WizardData, BuildState, ComposedSlideContent } from "../../slide/types";
import {
  streamCubeAI,
  type CubeSqlApiToolCall,
  type StreamPhase,
} from "../../services/cubeai";
import { SlidePreview, type SlidePreviewStage } from "../SlidePreview";
import { classifyRefinement } from "../../services/refinementClassifier";
import { composeWithRetry } from "../../services/compositionRetry";
import { loadCubeData } from "../../services/cubeDataClient";
import { translateSql } from "../../services/sqlTranslator";
import { renderVegaToBase64Png } from "../../services/vegaRenderer";
import { insertSlide } from "../../services/slideRenderer";
import type { CompositionPlan } from "../../services/compositionSchema";
import { logEvent } from "../../services/telemetry";

const SUMMIT_NAVY = "#0F1330";

/**
 * Phase 6 Wave 7 — last-build context threaded from WizardPanel.
 * Drives the "Refine this slide" affordance per D-03 (composer-only vs
 * cube-ai+composer routing) and D-16 (Wizard scope: D-01 through D-04 apply,
 * D-05 through D-09 multi-slide does NOT).
 */
export interface WizardLastBuildContext {
  toolCall: CubeSqlApiToolCall | null;
  commentary: string;
  lastSlideTitle: string;
  chatId: string | null;
  rows: unknown[];
}

interface ReviewStepProps {
  data: WizardData;
  buildState: BuildState;
  onBuild: () => void;
  onReset: () => void;
  /** Phase 5 D-02: when present, SlidePreview drives the composition pipeline. */
  toolCall?: CubeSqlApiToolCall | null;
  /** CMPS-03 grounding anchor — Cube AI assistant text threaded into composer.cubeMeta.commentary. */
  commentary?: string;
  /** Parent setter used by SlidePreview to report stage / success / failure. */
  onBuildStateChange?: (next: BuildState) => void;
  /** Mapping helper — parent owns so the translation stays in one place. */
  mapStageToBuildState?: (stage: SlidePreviewStage) => BuildState;
  /** Phase 6 Wave 7 — drives the Refine-this-slide affordance after built. */
  lastBuildContext?: WizardLastBuildContext | null;
}

const ReviewStep: React.FC<ReviewStepProps> = ({
  data,
  buildState,
  onBuild,
  onReset,
  toolCall,
  commentary,
  onBuildStateChange,
  mapStageToBuildState,
  lastBuildContext,
}) => {
  const showSlidePreview =
    (buildState === "fetching-data" ||
      buildState === "composing" ||
      buildState === "rendering") &&
    !!toolCall;

  return (
    <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "16px" }}>
      <Text weight="semibold" size={400}>
        Review your slide
      </Text>

      {/* Review card */}
      <div
        style={{
          borderRadius: "12px",
          border: "1px solid #E5E7EB",
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          backgroundColor: "#FAFAFA",
        }}
      >
        <div>
          <Text size={200} style={{ color: "#6B7280", display: "block", marginBottom: "2px" }}>
            Brand
          </Text>
          <Text weight="semibold" size={300}>
            {data.brandName}
          </Text>
        </div>

        <div>
          <Text size={200} style={{ color: "#6B7280", display: "block", marginBottom: "2px" }}>
            Analysis
          </Text>
          <Text size={300}>
            {data.purpose}
          </Text>
        </div>

        {data.productImageBase64 && (
          <div>
            <Text size={200} style={{ color: "#6B7280", display: "block", marginBottom: "4px" }}>
              Product Image
            </Text>
            <img
              src={`data:image/png;base64,${data.productImageBase64}`}
              alt="Product"
              style={{ maxWidth: "100%", maxHeight: "120px", borderRadius: "8px", objectFit: "contain" }}
            />
          </div>
        )}
      </div>

      {/* Build actions */}
      {buildState === "idle" && (
        <Button
          appearance="primary"
          onClick={onBuild}
          style={{ backgroundColor: SUMMIT_NAVY }}
        >
          Build Slide
        </Button>
      )}

      {buildState === "building" && (
        <Button appearance="primary" disabled>
          <Spinner size="tiny" /> Building...
        </Button>
      )}

      {/* Phase 5 D-02: live composition preview when Cube AI emitted a toolCall. */}
      {showSlidePreview && toolCall && (
        <SlidePreview
          toolCall={toolCall}
          userQuestion={`${data.purpose} for ${data.brandName}`}
          commentary={commentary ?? ""}
          onStageChange={(s) => {
            if (onBuildStateChange && mapStageToBuildState) {
              onBuildStateChange(mapStageToBuildState(s));
            }
          }}
          onSuccess={() => onBuildStateChange?.("built")}
          onError={() => onBuildStateChange?.("failed")}
        />
      )}

      {buildState === "built" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <Text size={300} style={{ color: "#107C10" }}>
            &#10003; Slide created!
          </Text>
          <Button onClick={onReset}>
            Start Over
          </Button>
        </div>
      )}

      {/* Phase 6 Wave 7 D-16 — Refine this slide affordance. Mounts only after
          a successful build with a non-null lastBuildContext. D-16 scope:
          single-slide refinement only (no multi-slide section work, no
          suggested-questions chips). */}
      {buildState === "built" && lastBuildContext && (
        <WizardRefineSection
          context={lastBuildContext}
          onRefineStarted={() => onBuildStateChange?.("fetching-data")}
          onRefineDone={() => onBuildStateChange?.("built")}
          onRefineFailed={() => onBuildStateChange?.("failed")}
        />
      )}

      {buildState === "failed" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <Text size={200} style={{ color: "#D13438" }}>
            Failed to create slide. Please try again.
          </Text>
          <Button onClick={onReset}>
            Try Again
          </Button>
        </div>
      )}
    </div>
  );
};

// ──────────────────────────────────────────────────────────────────────────
// WizardRefineSection — D-03 classifier-aware refinement sub-component.
// Honours BOTH branches per D-16 (Wizard inherits D-01 through D-04, which
// includes D-03 routing). composer-only reuses cached toolCall + rows;
// cube-ai+composer calls streamCubeAI(instruction, lastChatId) for a fresh
// toolCall before composing. SlidePreview is mounted with skipAutoStart +
// awaitingChoice — composition runs externally to prevent double-composition.
// ──────────────────────────────────────────────────────────────────────────

interface WizardRefineSectionProps {
  context: WizardLastBuildContext;
  onRefineStarted: () => void;
  onRefineDone: () => void;
  onRefineFailed: () => void;
}

interface RefineBuild {
  id: string;
  toolCall: CubeSqlApiToolCall;
  userQuestion: string;
  commentary: string;
  awaitingChoice?: { onReplace: () => void; onInsertNew: () => void };
}

const WizardRefineSection: React.FC<WizardRefineSectionProps> = ({
  context,
  onRefineStarted,
  onRefineDone,
  onRefineFailed,
}) => {
  const [refineText, setRefineText] = useState("");
  const [refineBuilds, setRefineBuilds] = useState<RefineBuild[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [chatId, setChatId] = useState<string | null>(context.chatId);

  // Local equivalent of ChatPanel's lastBuildRef — successive Wizard refinements
  // stack against the most recent built slide. Initialised from the prop and
  // updated after each refinement insert.
  const lastBuildRef = useRef<WizardLastBuildContext>(context);

  /**
   * runRefinement — pure D-03 happy path: fetch rows if empty, composeWithRetry,
   * render chart, surface SlidePreview chooser, await the user's pick, insert.
   * Both Replace and Insert-as-new currently invoke insertSlide (Wizard does not
   * track inserted slide IDs — Replace falls back to insert-as-new for now).
   */
  const runRefinement = useCallback(
    async (
      instruction: string,
      toolCall: CubeSqlApiToolCall,
      cubeMetaCommentary: string,
      baseUserQuestion: string,
      rows: unknown[]
    ): Promise<void> => {
      const ac = new AbortController();

      // 1) Fetch rows if not cached.
      let workingRows = rows;
      if (workingRows.length === 0) {
        const cubeQuery = translateSql(toolCall.input.sqlQuery);
        const resp = await loadCubeData(cubeQuery, { signal: ac.signal });
        workingRows = resp.data;
      }

      // 2) Compose.
      const userQuestionAugmented = `${baseUserQuestion}\n\nREFINEMENT: ${instruction}`;
      let finalPlan: CompositionPlan | null = null;
      await composeWithRetry(
        {
          userQuestion: userQuestionAugmented,
          cubeMeta: {
            queryTitle: toolCall.input.queryTitle,
            description: toolCall.input.description,
            vegaSpec: toolCall.input.vegaSpec,
            tableChartSpec: toolCall.input.tableChartSpec,
            commentary: cubeMetaCommentary,
          },
          rows: workingRows,
          canvas: { widthPx: 960, heightPx: 540 },
          signal: ac.signal,
        },
        {
          onPartialPlan: () => {
            /* refinement render branch shows the chooser only */
          },
          onFinal: (p) => {
            finalPlan = p;
          },
          onError: () => {
            /* swallow — outer await rejects via composeWithRetry */
          },
        },
        toolCall.input.vegaSpec as object | undefined
      );
      if (!finalPlan)
        throw new Error("Composer resolved without finalPlan");
      // Capture for use inside chooser handlers (TS narrowing across closures).
      const plan: CompositionPlan = finalPlan;

      // 3) Optional chart render.
      const chartPng = plan.chartSpec
        ? await renderVegaToBase64Png({
            spec: plan.chartSpec as Record<string, unknown>,
            rows: workingRows as Array<Record<string, unknown>>,
            signal: ac.signal,
          })
        : undefined;

      // 4) D-04 chooser surfaced via SlidePreview skipAutoStart + awaitingChoice.
      const buildId = `refine-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      setRefineBuilds((prev) => [
        ...prev,
        {
          id: buildId,
          toolCall,
          userQuestion: userQuestionAugmented,
          commentary: cubeMetaCommentary,
        },
      ]);

      await new Promise<void>((resolve) => {
        const onReplace = async (): Promise<void> => {
          // Wizard scope: no slide-id tracking — best-effort insert-as-new.
          // Future enhancement: hoist captureInsertedSlideId / deletePriorSlideBySlideId
          // from ChatPanel into shared utils so Wizard refinement can do honest replace.
          const composed: ComposedSlideContent = {
            type: "composed",
            title: plan.title,
            subtitle: plan.subtitle,
            commentary: plan.commentary,
            regions: plan.regions,
            chartPngBase64: chartPng,
          };
          await insertSlide(composed);
          lastBuildRef.current = {
            toolCall,
            commentary: cubeMetaCommentary,
            lastSlideTitle: plan.title,
            rows: workingRows,
            chatId,
          };
          setRefineBuilds((prev) =>
            prev.map((b) =>
              b.id === buildId ? { ...b, awaitingChoice: undefined } : b
            )
          );
          logEvent("wizard.refinement.replace_applied", {
            replacedInPlace: false,
          });
          resolve();
        };
        const onInsertNew = async (): Promise<void> => {
          const composed: ComposedSlideContent = {
            type: "composed",
            title: plan.title,
            subtitle: plan.subtitle,
            commentary: plan.commentary,
            regions: plan.regions,
            chartPngBase64: chartPng,
          };
          await insertSlide(composed);
          lastBuildRef.current = {
            toolCall,
            commentary: cubeMetaCommentary,
            lastSlideTitle: plan.title,
            rows: workingRows,
            chatId,
          };
          setRefineBuilds((prev) =>
            prev.map((b) =>
              b.id === buildId ? { ...b, awaitingChoice: undefined } : b
            )
          );
          logEvent("wizard.refinement.insert_new_applied", {});
          resolve();
        };
        setRefineBuilds((prev) =>
          prev.map((b) =>
            b.id === buildId ? { ...b, awaitingChoice: { onReplace, onInsertNew } } : b
          )
        );
      });
    },
    [chatId]
  );

  const handleSubmit = useCallback(async () => {
    if (!refineText.trim() || submitting) return;
    if (!lastBuildRef.current.toolCall && lastBuildRef.current.rows.length === 0) {
      // Narrative-only build: composer-only path has nothing to reuse. Fall
      // through to cube-ai+composer (the safer route — fresh toolCall via
      // streamCubeAI). The classifier may still pick composer-only, but the
      // branch below detects the missing toolCall and falls back too.
    }
    setSubmitting(true);
    onRefineStarted();
    const instruction = refineText;
    try {
      // D-03 — classify refinement and branch. Honours BOTH paths per D-16.
      const routing = await classifyRefinement(
        instruction,
        lastBuildRef.current.lastSlideTitle
      );
      logEvent("wizard.refinement.routed", {
        path: routing.path,
        rationale: routing.rationale,
      });

      if (routing.path === "cube-ai+composer" || !lastBuildRef.current.toolCall) {
        // D-03 cube-ai+composer: stream a fresh Cube AI turn for a new toolCall.
        let freshToolCall: CubeSqlApiToolCall | null = null;
        let freshCommentary = "";
        await new Promise<void>((resolve, reject) => {
          streamCubeAI(instruction, chatId, {
            onPhaseChange: (_p: StreamPhase) => {
              /* Wizard refinement does not surface phase chrome */
            },
            onContent: (c: string) => {
              freshCommentary = c;
            },
            onToolCall: (tc: CubeSqlApiToolCall) => {
              freshToolCall = tc;
            },
            onComplete: (result) => {
              if (result.chatId) setChatId(result.chatId);
              resolve();
            },
            onError: (err) => reject(new Error(err.message)),
          });
        });
        if (!freshToolCall) {
          throw new Error("Cube AI returned no toolCall for refinement");
        }
        // Re-fetch rows (workingRows: []) inside runRefinement.
        await runRefinement(
          instruction,
          freshToolCall,
          freshCommentary,
          instruction,
          []
        );
      } else {
        // D-03 composer-only: reuse cached toolCall + rows from lastBuildRef.
        const last = lastBuildRef.current;
        if (!last.toolCall) {
          throw new Error("No prior build context for composer-only refinement");
        }
        await runRefinement(
          instruction,
          last.toolCall,
          last.commentary,
          last.lastSlideTitle,
          last.rows
        );
      }
      setRefineText("");
      onRefineDone();
    } catch (err) {
      logEvent("wizard.refinement.failed", {
        err: err instanceof Error ? err.message : String(err),
      });
      onRefineFailed();
    } finally {
      setSubmitting(false);
    }
  }, [
    refineText,
    submitting,
    chatId,
    runRefinement,
    onRefineStarted,
    onRefineDone,
    onRefineFailed,
  ]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        marginTop: 24,
        paddingTop: 24,
        borderTop: "1px solid #E5E7EB",
      }}
    >
      <Text size={400} weight="semibold" style={{ color: SUMMIT_NAVY }}>
        Refine this slide
      </Text>
      <Text size={300} style={{ color: "#1F2937" }}>
        Tweak the result without starting over.
      </Text>
      <div style={{ display: "flex", gap: 8 }}>
        <Input
          value={refineText}
          placeholder="e.g., change to a pie chart, highlight the top performer"
          aria-label="Refine your slide. Type a tweak instruction."
          onChange={(_, d) => setRefineText(d.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handleSubmit();
            }
          }}
          disabled={submitting}
          style={{ flex: 1 }}
        />
        <Button
          size="small"
          appearance="primary"
          aria-label="Submit refinement"
          onClick={() => void handleSubmit()}
          disabled={submitting || refineText.trim().length === 0}
          style={{ backgroundColor: SUMMIT_NAVY }}
        >
          Refine
        </Button>
      </div>
      {refineBuilds.map((b) => (
        <SlidePreview
          key={b.id}
          toolCall={b.toolCall}
          userQuestion={b.userQuestion}
          commentary={b.commentary}
          skipAutoStart
          onStageChange={() => {
            /* refinement render branch is parent-driven */
          }}
          onSuccess={() => {
            /* finalisation handled inside chooser */
          }}
          onError={() => onRefineFailed()}
          awaitingChoice={b.awaitingChoice}
        />
      ))}
    </div>
  );
};

export default ReviewStep;
