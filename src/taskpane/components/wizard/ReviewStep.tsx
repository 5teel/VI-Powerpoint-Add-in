import React from "react";
import { Button, Spinner, Text } from "@fluentui/react-components";
import type { WizardData, BuildState } from "../../slide/types";
import type { CubeSqlApiToolCall } from "../../services/cubeai";
import { SlidePreview, type SlidePreviewStage } from "../SlidePreview";

const SUMMIT_NAVY = "#0F1330";

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

export default ReviewStep;
