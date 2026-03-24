import React from "react";
import type { WizardStep } from "../../slide/types";

const SUMMIT_NAVY = "#0F1330";
const STEP_BLUE = "#2563EB";

const STEP_LABELS = ["Brand", "Image", "Purpose", "Review"] as const;

interface StepIndicatorProps {
  currentStep: WizardStep;
}

const StepIndicator: React.FC<StepIndicatorProps> = ({ currentStep }) => {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "12px 8px", gap: "0" }}>
      {STEP_LABELS.map((label, index) => {
        const stepNum = (index + 1) as WizardStep;
        const isCurrent = stepNum === currentStep;
        const isCompleted = stepNum < currentStep;
        const isFuture = stepNum > currentStep;

        const circleColor = isCurrent ? SUMMIT_NAVY : isCompleted ? STEP_BLUE : "#D1D5DB";
        const textColor = isFuture ? "#9CA3AF" : "#FFFFFF";
        const labelColor = isCurrent ? SUMMIT_NAVY : isCompleted ? STEP_BLUE : "#9CA3AF";

        return (
          <React.Fragment key={stepNum}>
            {index > 0 && (
              <div
                style={{
                  flex: 1,
                  height: "2px",
                  backgroundColor: isCompleted || isCurrent ? STEP_BLUE : "#E5E7EB",
                  maxWidth: "24px",
                }}
              />
            )}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
              <div
                style={{
                  width: "24px",
                  height: "24px",
                  borderRadius: "50%",
                  backgroundColor: isFuture ? "transparent" : circleColor,
                  border: isFuture ? `2px solid ${circleColor}` : "none",
                  color: textColor,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "12px",
                  fontWeight: 600,
                }}
              >
                {stepNum}
              </div>
              <span style={{ fontSize: "10px", color: labelColor, fontWeight: isCurrent ? 600 : 400 }}>
                {label}
              </span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
};

export default StepIndicator;
