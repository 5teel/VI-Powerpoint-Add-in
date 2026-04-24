/**
 * SlidePreview — Phase 5 live composition preview.
 *
 * 280x158 16:9 skeleton preview with a 5-stage state machine (idle → fetching-data →
 * composing → rendering → success | failed). Drives the full composition pipeline:
 * translateSql → loadCubeData → composeWithRetry (streaming partial plan) →
 * renderVegaToBase64Png (if chartSpec) → insertSlide into PowerPoint.
 *
 * Owns a single AbortController per mount, threaded through every async boundary.
 * Stop building aborts the controller; all in-flight fetches/streams terminate silently.
 *
 * Visual contract: 05-UI-SPEC.md. Shimmer uses a custom CSS keyframe (NOT Fluent Skeleton).
 * Reduced-motion users get a frozen fallback via prefers-reduced-motion (taskpane.css).
 */
import React, { useEffect, useRef, useState } from "react";
import { Button, Spinner, Text } from "@fluentui/react-components";
import {
  CheckmarkCircle16Filled,
  ArrowClockwise16Regular,
  ErrorCircle20Regular,
} from "@fluentui/react-icons";
import type { CubeSqlApiToolCall } from "../services/cubeai";
import { translateSql } from "../services/sqlTranslator";
import { loadCubeData } from "../services/cubeDataClient";
import { composeWithRetry } from "../services/compositionRetry";
import type { CompositionPlan } from "../services/compositionSchema";
import { renderVegaToBase64Png } from "../services/vegaRenderer";
import { insertSlide } from "../services/slideRenderer";
import type { ComposedSlideContent } from "../slide/types";
import { logEvent } from "../services/telemetry";

const SUMMIT_NAVY = "#0F1330";
const SUMMIT_BLUE = "#2563EB";
const SUCCESS_GREEN = "#107C10";
const DESTRUCTIVE_RED = "#D13438";

export type SlidePreviewStage =
  | "fetching-data"
  | "composing"
  | "rendering"
  | "success"
  | "failed";

export interface SlidePreviewProps {
  toolCall: CubeSqlApiToolCall;
  userQuestion: string;
  /**
   * CMPS-03 grounding anchor — Cube AI assistant commentary captured alongside
   * the tool-call. Parent surfaces (ChatPanel/WizardPanel) capture via onContent
   * or onComplete and thread the final value into this prop. Passed through to
   * the composer via cubeMeta.commentary (the composer treats it as the source-
   * of-truth narrative per D-05 so numeric claims and named entities stay
   * grounded in Cube REST rows).
   */
  commentary: string;
  onStageChange: (stage: SlidePreviewStage) => void;
  onSuccess: () => void;
  onError: (err: Error) => void;
}

const STAGE_LABELS: Record<SlidePreviewStage, string> = {
  "fetching-data": "Fetching data…",
  composing: "Composing slide…",
  rendering: "Inserting into PowerPoint…",
  success: "Slide added to your deck",
  failed: "Couldn't complete your slide",
};

type RegionFraction = CompositionPlan["regions"][number];

const DEFAULT_REGIONS: RegionFraction[] = [
  { id: "title", kind: "title", x: 0.04, y: 0.04, w: 0.92, h: 0.12 },
  { id: "subtitle", kind: "subtitle", x: 0.04, y: 0.17, w: 0.92, h: 0.06 },
  { id: "chart", kind: "chart", x: 0.04, y: 0.26, w: 0.56, h: 0.7 },
  { id: "commentary", kind: "commentary", x: 0.64, y: 0.26, w: 0.32, h: 0.7 },
];

export const SlidePreview: React.FC<SlidePreviewProps> = ({
  toolCall,
  userQuestion,
  commentary,
  onStageChange,
  onSuccess,
  onError,
}) => {
  const [stage, setStage] = useState<SlidePreviewStage>("fetching-data");
  const [partial, setPartial] = useState<Partial<CompositionPlan>>({});
  const [error, setError] = useState<Error | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const acRef = useRef<AbortController | null>(null);

  // Keep parent's onStageChange in sync with local stage transitions.
  useEffect(() => {
    onStageChange(stage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  useEffect(() => {
    const ac = new AbortController();
    acRef.current = ac;
    let cancelled = false;

    (async () => {
      try {
        // Stage 1: fetch data.
        setStage("fetching-data");
        setPartial({});
        setError(null);
        const cubeQuery = translateSql(toolCall.input.sqlQuery);
        const cubeResponse = await loadCubeData(cubeQuery, { signal: ac.signal });
        if (cancelled || ac.signal.aborted) return;

        // Stage 2: compose (streaming partial plan into local state for the canvas).
        setStage("composing");
        let finalPlan: CompositionPlan | null = null;
        await composeWithRetry(
          {
            userQuestion,
            cubeMeta: {
              queryTitle: toolCall.input.queryTitle,
              description: toolCall.input.description,
              vegaSpec: toolCall.input.vegaSpec,
              tableChartSpec: toolCall.input.tableChartSpec,
              // CMPS-03 grounding anchor — Cube AI assistant commentary threaded
              // from parent surface. Must be non-empty when Cube AI streamed both
              // a toolCall and assistant content in the same stream; the composer
              // uses it as the source-of-truth narrative per D-05.
              commentary: commentary ?? "",
            },
            rows: cubeResponse.data,
            canvas: { widthPx: 960, heightPx: 540 },
            signal: ac.signal,
          },
          {
            onPartialPlan: (snap) => {
              if (!cancelled) setPartial(snap);
            },
            onFinal: (plan) => {
              finalPlan = plan;
            },
            // Do not re-throw here — composeWithRetry already rejects the outer
            // promise on error (see the settled-guard in attempt()). Re-throwing
            // from inside composer's try/catch would cause recursive cb.onError
            // dispatch and defeat the reject handoff.
            onError: () => {
              /* swallow — outer await will reject via composeWithRetry */
            },
          },
          toolCall.input.vegaSpec as object | undefined
        );
        if (cancelled || ac.signal.aborted) return;
        if (!finalPlan) throw new Error("Composition returned no plan");
        const plan: CompositionPlan = finalPlan;

        // Stage 3: render chart + insert slide.
        setStage("rendering");
        let chartPngBase64: string | undefined;
        if (plan.chartSpec) {
          chartPngBase64 = await renderVegaToBase64Png({
            spec: plan.chartSpec,
            rows: cubeResponse.data,
          });
        }
        if (cancelled || ac.signal.aborted) return;

        const composedContent: ComposedSlideContent = {
          type: "composed",
          title: plan.title,
          subtitle: plan.subtitle,
          commentary: plan.commentary,
          regions: plan.regions,
          chartPngBase64,
          tableSpec: buildComposedTableSpec(plan, cubeResponse.data, toolCall.input.tableChartSpec),
        };
        await insertSlide(composedContent);
        if (cancelled) return;

        // Stage 4: success — hold 1200ms before onSuccess collapses the preview.
        setStage("success");
        setTimeout(() => {
          if (!cancelled) onSuccess();
        }, 1200);
      } catch (err) {
        if (ac.signal.aborted || cancelled) return; // silent abort
        const e = err as Error;
        setError(e);
        setStage("failed");
        onError(e);
        logEvent("slidepreview.failed", { message: e.message });
      }
    })();

    return () => {
      cancelled = true;
      ac.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toolCall, userQuestion, commentary, resetKey]);

  const handleStop = (): void => {
    acRef.current?.abort();
  };

  const handleRetry = (): void => {
    setError(null);
    setPartial({});
    setResetKey((k) => k + 1);
  };

  return (
    <div
      style={{
        borderRadius: "12px",
        border: `1px solid ${stage === "failed" ? DESTRUCTIVE_RED : "#E5E7EB"}`,
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        backgroundColor: "#FAFAFA",
        marginTop: "8px",
      }}
      role="group"
      aria-live="polite"
    >
      <StageLabelStrip stage={stage} />
      <PreviewCanvas stage={stage} partial={partial} />
      <ActionRow stage={stage} error={error} onStop={handleStop} onRetry={handleRetry} />
    </div>
  );
};

function buildComposedTableSpec(
  plan: CompositionPlan,
  rows: Array<Record<string, unknown>>,
  tableChartSpec: CubeSqlApiToolCall["input"]["tableChartSpec"]
): ComposedSlideContent["tableSpec"] | undefined {
  if (!plan.tableSpec) return undefined;
  return {
    renderMode: plan.tableSpec.renderMode,
    columns: plan.tableSpec.columns,
    rows,
    showRowTotals: plan.tableSpec.showRowTotals ?? tableChartSpec?.showRowTotals,
    showColumnTotals: plan.tableSpec.showColumnTotals ?? tableChartSpec?.showColumnTotals,
    showRowNumbers: tableChartSpec?.showRowNumbers ?? false,
    showPagination: plan.tableSpec.showPagination ?? tableChartSpec?.showPagination,
  };
}

// ─── Sub-components (inline for locality) ──────────────────────────────────

const StageLabelStrip: React.FC<{ stage: SlidePreviewStage }> = ({ stage }) => {
  const active = stage === "fetching-data" || stage === "composing" || stage === "rendering";
  const color =
    stage === "success"
      ? SUCCESS_GREEN
      : stage === "failed"
      ? DESTRUCTIVE_RED
      : active
      ? SUMMIT_BLUE
      : "#6B7280";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        {active && <Spinner size="tiny" />}
        {stage === "success" && <CheckmarkCircle16Filled style={{ color: SUCCESS_GREEN }} />}
        {stage === "failed" && <ErrorCircle20Regular style={{ color: DESTRUCTIVE_RED }} />}
        <Text size={200} weight="regular" style={{ color }}>
          {STAGE_LABELS[stage]}
        </Text>
      </div>
      {active && (
        <div style={{ height: "2px", backgroundColor: "#E5E7EB", overflow: "hidden" }}>
          <div
            className="indeterminate-bar"
            style={{ height: "2px", backgroundColor: SUMMIT_BLUE, transform: "scaleX(0)" }}
          />
        </div>
      )}
    </div>
  );
};

const PreviewCanvas: React.FC<{ stage: SlidePreviewStage; partial: Partial<CompositionPlan> }> = ({
  stage,
  partial,
}) => {
  const CANVAS_WIDTH = 280;
  const CANVAS_HEIGHT = 158;
  const regions = partial.regions ?? DEFAULT_REGIONS;
  return (
    <div
      style={{
        position: "relative",
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        backgroundColor: "rgba(255, 255, 255, 0.85)",
        borderRadius: "4px",
        overflow: "hidden",
      }}
      aria-busy={stage !== "success" && stage !== "failed"}
    >
      {regions.map((r, idx) => {
        const rect = {
          left: r.x * CANVAS_WIDTH,
          top: r.y * CANVAS_HEIGHT,
          width: r.w * CANVAS_WIDTH,
          height: r.h * CANVAS_HEIGHT,
        };
        return (
          <div
            key={r.id ?? idx}
            style={{
              position: "absolute",
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
              padding: "6px",
              boxSizing: "border-box",
              overflow: "hidden",
            }}
          >
            <RegionContent region={r} partial={partial} stage={stage} />
          </div>
        );
      })}
    </div>
  );
};

const RegionContent: React.FC<{
  region: RegionFraction;
  partial: Partial<CompositionPlan>;
  stage: SlidePreviewStage;
}> = ({ region, partial }) => {
  if (region.kind === "title" && partial.title) {
    return (
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          lineHeight: "14px",
          color: SUMMIT_NAVY,
          display: "block",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {partial.title}
      </span>
    );
  }
  if (region.kind === "subtitle" && partial.subtitle) {
    return (
      <span style={{ fontSize: 9, fontWeight: 400, lineHeight: "12px", color: "#6B7280" }}>
        {partial.subtitle}
      </span>
    );
  }
  if (region.kind === "commentary" && partial.commentary) {
    return (
      <p
        style={{
          fontSize: 9,
          fontWeight: 400,
          lineHeight: "13px",
          color: "#1F2937",
          margin: 0,
          overflow: "hidden",
        }}
      >
        {partial.commentary}
      </p>
    );
  }
  return (
    <div
      className="shimmer-region"
      style={{ width: "100%", height: "100%", borderRadius: "2px" }}
    />
  );
};

const ActionRow: React.FC<{
  stage: SlidePreviewStage;
  error: Error | null;
  onStop: () => void;
  onRetry: () => void;
}> = ({ stage, error, onStop, onRetry }) => {
  if (stage === "success") return null;
  if (stage === "failed") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <Text size={200} style={{ color: DESTRUCTIVE_RED }}>
          {error?.message ?? "Something went wrong."}
        </Text>
        <Button
          size="small"
          appearance="primary"
          icon={<ArrowClockwise16Regular />}
          onClick={onRetry}
          style={{ backgroundColor: SUMMIT_NAVY }}
        >
          Try again
        </Button>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", justifyContent: "flex-end" }}>
      <Button size="small" appearance="subtle" onClick={onStop}>
        Stop building
      </Button>
    </div>
  );
};

export default SlidePreview;
