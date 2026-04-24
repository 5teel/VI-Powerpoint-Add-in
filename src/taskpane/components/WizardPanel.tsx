import React, { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@fluentui/react-components";
import type { WizardData, WizardStep, BuildState } from "../slide/types";
import StepIndicator from "./wizard/StepIndicator";
import BrandStep from "./wizard/BrandStep";
import ImageStep from "./wizard/ImageStep";
import PurposeStep from "./wizard/PurposeStep";
import ReviewStep from "./wizard/ReviewStep";
import { buildGuidedPrompt } from "../services/promptBuilder";
import { streamCubeAI, type CubeSqlApiToolCall } from "../services/cubeai";
import { extractSlideContent, fallbackToTextOnly } from "../services/schemaParser";
import { insertSlide } from "../services/slideRenderer";
import { routeCreateSlide } from "../services/slideRouter";
import type { SlidePreviewStage } from "./SlidePreview";

const SUMMIT_NAVY = "#0F1330";

const DEFAULT_DATA: WizardData = {
  brandName: "",
  productImageBase64: null,
  purpose: "",
};

const WizardPanel: React.FC = () => {
  const [step, setStep] = useState<WizardStep>(1);
  const [data, setData] = useState<WizardData>(DEFAULT_DATA);
  const [buildState, setBuildState] = useState<BuildState>("idle");
  const controllerRef = useRef<AbortController | null>(null);
  // Phase 5 D-02 + CMPS-03 capture — refs so streamCubeAI callbacks can mutate
  // without triggering re-renders mid-stream.
  const toolCallRef = useRef<CubeSqlApiToolCall | null>(null);
  const commentaryRef = useRef<string>("");

  // Abort in-flight request on unmount
  useEffect(() => {
    return () => {
      controllerRef.current?.abort();
    };
  }, []);

  const canAdvance = (): boolean => {
    switch (step) {
      case 1: return data.brandName.trim().length > 0;
      case 2: return data.productImageBase64 !== null;
      case 3: return data.purpose.trim().length > 0;
      case 4: return true;
      default: return false;
    }
  };

  const goBack = () => setStep((s) => (s > 1 ? (s - 1) as WizardStep : s));
  const goNext = () => {
    if (canAdvance() && step < 4) {
      setStep((s) => (s + 1) as WizardStep);
    }
  };

  const handleBrandChange = useCallback((name: string) => {
    setData((prev) => ({ ...prev, brandName: name }));
  }, []);

  const handleImageSelected = useCallback((base64: string) => {
    setData((prev) => ({ ...prev, productImageBase64: base64 }));
  }, []);

  const handlePurposeChange = useCallback((purpose: string) => {
    setData((prev) => ({ ...prev, purpose }));
  }, []);

  const handleBuild = useCallback(() => {
    setBuildState("building");
    // Reset Phase 5 D-02 + CMPS-03 capture refs at the start of every build.
    toolCallRef.current = null;
    commentaryRef.current = "";

    const prompt = buildGuidedPrompt(data.brandName, data.purpose);
    const controller = streamCubeAI(prompt, null, {
      onPhaseChange: () => {},
      onContent: (content: string) => {
        // CMPS-03 grounding: capture the final assistant text alongside any toolCall.
        commentaryRef.current = content;
      },
      onToolCall: (tc: CubeSqlApiToolCall) => {
        toolCallRef.current = tc;
      },
      onComplete: async (result) => {
        try {
          const raw = result.content || "";
          // Phase 5 D-02: if Cube AI emitted a finalised cubeSqlApi toolCall,
          // hand off to SlidePreview (ReviewStep mounts it). CMPS-03 ensures
          // the commentary ref is populated before SlidePreview reads it.
          if (routeCreateSlide({ toolCall: toolCallRef.current }) === "composition") {
            if (!commentaryRef.current) commentaryRef.current = raw;
            setBuildState("fetching-data");
            return;
          }
          // Legacy narrative fallback — unchanged.
          const content = extractSlideContent(raw) ?? fallbackToTextOnly(raw);
          await insertSlide(content, data.productImageBase64 ?? undefined);
          setBuildState("built");
        } catch {
          setBuildState("failed");
        }
      },
      onError: () => {
        setBuildState("failed");
      },
    });

    controllerRef.current = controller;
  }, [data]);

  /** Map SlidePreviewStage → BuildState (success → built, failed → failed, rest passes through). */
  const mapStageToBuildState = (s: SlidePreviewStage): BuildState =>
    s === "success" ? "built" : s === "failed" ? "failed" : s;

  const handleReset = useCallback(() => {
    setStep(1);
    setData(DEFAULT_DATA);
    setBuildState("idle");
  }, []);

  const renderStep = () => {
    switch (step) {
      case 1:
        return <BrandStep brandName={data.brandName} onBrandChange={handleBrandChange} />;
      case 2:
        return <ImageStep imageBase64={data.productImageBase64} onImageSelected={handleImageSelected} />;
      case 3:
        return <PurposeStep purpose={data.purpose} onPurposeChange={handlePurposeChange} />;
      case 4:
        return (
          <ReviewStep
            data={data}
            buildState={buildState}
            onBuild={handleBuild}
            onReset={handleReset}
            toolCall={toolCallRef.current}
            commentary={commentaryRef.current}
            onBuildStateChange={(next) => setBuildState(next)}
            mapStageToBuildState={mapStageToBuildState}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      {/* Step indicator at top */}
      <div style={{ flexShrink: 0 }}>
        <StepIndicator currentStep={step} />
      </div>

      {/* Step content fills middle */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {renderStep()}
      </div>

      {/* Navigation buttons pinned at bottom */}
      {step < 4 && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "8px 16px",
            borderTop: "1px solid #E0E0E0",
            flexShrink: 0,
          }}
        >
          <Button
            disabled={step === 1}
            onClick={goBack}
          >
            Back
          </Button>
          <Button
            appearance="primary"
            disabled={!canAdvance()}
            onClick={goNext}
            style={{ backgroundColor: canAdvance() ? SUMMIT_NAVY : undefined }}
          >
            Next
          </Button>
        </div>
      )}

      {step === 4 && buildState !== "idle" && buildState !== "building" && (
        <div
          style={{
            display: "flex",
            justifyContent: "flex-start",
            padding: "8px 16px",
            borderTop: "1px solid #E0E0E0",
            flexShrink: 0,
          }}
        >
          <Button
            onClick={goBack}
          >
            Back
          </Button>
        </div>
      )}

      {step === 4 && (buildState === "idle" || buildState === "building") && (
        <div
          style={{
            display: "flex",
            justifyContent: "flex-start",
            padding: "8px 16px",
            borderTop: "1px solid #E0E0E0",
            flexShrink: 0,
          }}
        >
          <Button
            onClick={goBack}
          >
            Back
          </Button>
        </div>
      )}
    </div>
  );
};

export default WizardPanel;
