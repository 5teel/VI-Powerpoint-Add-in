/**
 * SectionStrip — Phase 6 D-07 multi-slide section preview.
 *
 * Renders a responsive grid (≥360px) or horizontal scroll row (<360px) of
 * N inline presentational mini slide cards (160×90 each) driven entirely by
 * sectionOrchestrator's onMiniChange state. The orchestrator is the single
 * source of truth for the composition pipeline; if SlidePreview were mounted
 * here it would attempt to run its own pipeline → double composition
 * (06-RESEARCH §Pattern 4).
 *
 * Wires `orchestrateSection` on mount; holds the outer AbortController for
 * the single Stop button (D-09). Already-inserted slides remain in the deck
 * when Stop is pressed; pending slides flip to "cancelled".
 *
 * Header copy exhausts all 5 strip-status states per 06-UI-SPEC
 * §Multi-Slide Section Strip Header:
 *   planning → "Planning section…"
 *   building → "Building {N} slides — {M} done"
 *   stopped  → "Stopped — {M} of {N} slides added"
 *   done     → "{N} slides added to your deck"
 *   failed   → "{M} of {N} slides added — slide {K+1} failed" OR "Section planning failed"
 *
 * State-badge palette per 06-UI-SPEC §Mini-Preview State Badges — all 7 statuses
 * (pending, fetching-data, composing, rendering, done, error, cancelled).
 *
 * Accessibility: role="region" on the outer container with aria-label announcing
 * the build; role="article" + aria-live="polite" on each mini card so screen
 * readers announce per-slide status changes.
 */
import React, { useEffect, useRef, useState } from "react";
import { Button, Text } from "@fluentui/react-components";
import {
  orchestrateSection,
  type MiniPreviewState,
  type SectionOrchestratorInput,
} from "../services/sectionOrchestrator";
import type { SectionPlan } from "../services/metaComposer";

const STEADY_GREY = "#6B7280";
const NARROW_THRESHOLD_PX = 360;

export interface SectionStripProps {
  input: SectionOrchestratorInput;
  onAllDone: () => void;
  onPlanError: (err: Error) => void;
}

type StripStatus = "planning" | "building" | "done" | "stopped" | "failed";

export const SectionStrip: React.FC<SectionStripProps> = ({
  input,
  onAllDone,
  onPlanError,
}) => {
  const [plan, setPlan] = useState<SectionPlan | null>(null);
  const [slideStates, setSlideStates] = useState<MiniPreviewState[]>([]);
  const [stripStatus, setStripStatus] = useState<StripStatus>("planning");
  const [isNarrow, setIsNarrow] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth < NARROW_THRESHOLD_PX;
  });
  const controllerRef = useRef<AbortController | null>(null);

  // T-06-25 mitigation — cleanup removes resize listener on unmount.
  useEffect(() => {
    const onResize = (): void => setIsNarrow(window.innerWidth < NARROW_THRESHOLD_PX);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Mount-only orchestrator kick-off (D-07). Input is considered stable for the
  // lifetime of this strip; if the caller wants a fresh section, they remount.
  useEffect(() => {
    const controller = orchestrateSection(input, {
      onSectionPlan: (p) => {
        setPlan(p);
        setSlideStates(p.slides.map((s) => ({ status: "pending", title: s.titleHint })));
        setStripStatus("building");
      },
      onMiniChange: (idx, state) => {
        setSlideStates((prev) => prev.map((s, i) => (i === idx ? state : s)));
      },
      onAllDone: () => {
        setStripStatus((s) => (s === "stopped" || s === "failed" ? s : "done"));
        onAllDone();
      },
      onPlanError: (err) => {
        setStripStatus("failed");
        onPlanError(err);
      },
    });
    controllerRef.current = controller;
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // orchestrate on mount only

  const doneCount = slideStates.filter((s) => s.status === "done").length;
  const totalCount = slideStates.length;

  // Header copy per 06-UI-SPEC §Multi-Slide Section Strip Header.
  const header = ((): string => {
    if (stripStatus === "planning") return `Planning section…`;
    if (stripStatus === "stopped") return `Stopped — ${doneCount} of ${totalCount} slides added`;
    if (stripStatus === "done") return `${totalCount} slides added to your deck`;
    if (stripStatus === "failed") {
      const firstFailedIdx = slideStates.findIndex((s) => s.status === "error");
      if (firstFailedIdx >= 0) {
        return `${doneCount} of ${totalCount} slides added — slide ${firstFailedIdx + 1} failed`;
      }
      return `Section planning failed`;
    }
    return `Building ${totalCount} slides — ${doneCount} done`;
  })();

  const hasActive = slideStates.some(
    (s) =>
      s.status === "pending" ||
      s.status === "fetching-data" ||
      s.status === "composing" ||
      s.status === "rendering"
  );
  const showStop = stripStatus === "building" && hasActive;

  const handleStop = (): void => {
    controllerRef.current?.abort();
    setStripStatus("stopped");
    // Orchestrator transitions any in-flight slides to "cancelled" itself, but
    // pending slides that never entered the semaphore also need flipping — the
    // orchestrator handles that via its per-slide outer.signal.aborted check
    // before the semaphore.acquire / inside the try block.
  };

  return (
    <div
      role="region"
      aria-label={`Building ${totalCount} slides`}
      style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Text size={100} style={{ color: STEADY_GREY, fontSize: 11 }}>
          {header}
        </Text>
        {showStop && (
          <Button
            size="small"
            appearance="subtle"
            aria-label={`Stop building remaining slides. ${doneCount} of ${totalCount} slides have been added.`}
            onClick={handleStop}
            title="Cancel remaining slides. Already-inserted slides stay in your deck."
          >
            Stop
          </Button>
        )}
      </div>

      <div
        style={
          isNarrow
            ? { display: "flex", gap: 8, overflowX: "auto", alignItems: "flex-start" }
            : {
                display: "grid",
                gridTemplateColumns: "repeat(2, 160px)",
                gap: "12px 8px",
                justifyContent: "start",
              }
        }
      >
        {plan?.slides.map((slideEntry, idx) => {
          const state =
            slideStates[idx] ?? ({ status: "pending", title: slideEntry.titleHint } as MiniPreviewState);
          return (
            <div
              key={idx}
              role="article"
              aria-live="polite"
              aria-label={`Slide ${idx + 1}: ${state.title ?? "pending"}, status: ${state.status}`}
              style={{
                width: 160,
                height: 90,
                border: "1px solid #E5E7EB",
                borderRadius: 6,
                backgroundColor: "rgba(255, 255, 255, 0.85)",
                position: "relative",
                padding: 4,
                boxSizing: "border-box",
                overflow: "hidden",
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  fontSize: 8,
                  fontWeight: 600,
                  color: "#0F1330",
                  lineHeight: "10px",
                  maxHeight: 20,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                }}
              >
                {state.title ?? slideEntry.titleHint}
              </div>
              {/* Shimmer field behind badge — neutral when done/cancelled/error, animated otherwise. */}
              <div
                className={
                  state.status === "done" ||
                  state.status === "cancelled" ||
                  state.status === "error"
                    ? undefined
                    : "shimmer-region"
                }
                style={{
                  position: "absolute",
                  left: 4,
                  right: 4,
                  top: 24,
                  bottom: 16,
                  borderRadius: 4,
                  backgroundColor:
                    state.status === "done" ? "rgba(255, 255, 255, 0.85)" : "#F3F4F6",
                }}
              />
              <StateBadge state={state} />
            </div>
          );
        })}
      </div>
    </div>
  );
};

// 06-UI-SPEC §Mini-Preview State Badges (exact palette — 7 statuses).
const StateBadge: React.FC<{ state: MiniPreviewState }> = ({ state }) => {
  const map: Record<
    MiniPreviewState["status"],
    { text: string; bg: string; color: string; border: string }
  > = {
    pending: {
      text: "Pending",
      bg: "transparent",
      color: "#6B7280",
      border: "1px solid #E5E7EB",
    },
    "fetching-data": {
      text: "Fetching…",
      bg: "rgba(37, 99, 235, 0.10)",
      color: "#2563EB",
      border: "1px solid rgba(37, 99, 235, 0.25)",
    },
    composing: {
      text: "Composing…",
      bg: "rgba(37, 99, 235, 0.10)",
      color: "#2563EB",
      border: "1px solid rgba(37, 99, 235, 0.25)",
    },
    rendering: {
      text: "Inserting…",
      bg: "rgba(37, 99, 235, 0.10)",
      color: "#2563EB",
      border: "1px solid rgba(37, 99, 235, 0.25)",
    },
    done: {
      text: "Done",
      bg: "rgba(16, 124, 16, 0.10)",
      color: "#107C10",
      border: "1px solid rgba(16, 124, 16, 0.25)",
    },
    error: {
      text: "Error",
      bg: "rgba(209, 52, 56, 0.10)",
      color: "#D13438",
      border: "1px solid rgba(209, 52, 56, 0.25)",
    },
    cancelled: {
      text: "Cancelled",
      bg: "transparent",
      color: "#6B7280",
      border: "1px solid #E5E7EB",
    },
  };
  const s = map[state.status];
  return (
    <span
      style={{
        position: "absolute",
        bottom: 4,
        right: 4,
        fontSize: 7,
        fontWeight: 600,
        padding: "2px 6px",
        borderRadius: 4,
        backgroundColor: s.bg,
        color: s.color,
        border: s.border,
        lineHeight: "9px",
      }}
    >
      {s.text}
    </span>
  );
};

export default SectionStrip;
