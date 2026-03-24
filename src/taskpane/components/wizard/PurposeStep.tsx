import React from "react";
import { Input, Text } from "@fluentui/react-components";

const SUMMIT_NAVY = "#0F1330";

interface PurposeOption {
  label: string;
  description: string;
}

const PURPOSE_OPTIONS: PurposeOption[] = [
  { label: "Range Review", description: "Analyze product range performance and distribution" },
  { label: "Performance Breakdown", description: "Deep dive into sales and growth metrics" },
  { label: "Competitor Comparison", description: "Compare against key competitors" },
  { label: "Category Overview", description: "High-level category trends and insights" },
  { label: "Custom", description: "Enter your own analysis type" },
];

interface PurposeStepProps {
  purpose: string;
  onPurposeChange: (purpose: string) => void;
}

const PurposeStep: React.FC<PurposeStepProps> = ({ purpose, onPurposeChange }) => {
  const isCustomSelected = !PURPOSE_OPTIONS.slice(0, 4).some((opt) => opt.label === purpose) && purpose !== "";
  const selectedLabel = PURPOSE_OPTIONS.slice(0, 4).find((opt) => opt.label === purpose)?.label ?? (isCustomSelected ? "Custom" : null);

  const handleOptionClick = (option: PurposeOption) => {
    if (option.label === "Custom") {
      // Clear purpose so user can type, but mark custom as selected
      onPurposeChange(" ");
    } else {
      onPurposeChange(option.label);
    }
  };

  return (
    <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
      <Text weight="semibold" size={400}>
        What type of analysis?
      </Text>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {PURPOSE_OPTIONS.map((option) => {
          const isSelected = option.label === "Custom" ? isCustomSelected || (purpose === " ") : option.label === selectedLabel;

          return (
            <button
              key={option.label}
              onClick={() => handleOptionClick(option)}
              style={{
                padding: "10px",
                borderRadius: "8px",
                border: isSelected ? `2px solid ${SUMMIT_NAVY}` : "1px solid #D1D5DB",
                backgroundColor: isSelected ? "rgba(15, 19, 48, 0.04)" : "#FFFFFF",
                cursor: "pointer",
                textAlign: "left",
                transition: "border-color 0.15s, background-color 0.15s",
              }}
            >
              <div style={{ fontWeight: 600, fontSize: "13px", color: "#1F2937", marginBottom: "2px" }}>
                {option.label}
              </div>
              <div style={{ fontSize: "11px", color: "#6B7280" }}>
                {option.description}
              </div>
            </button>
          );
        })}
      </div>

      {(isCustomSelected || purpose === " ") && (
        <Input
          placeholder="Describe your analysis..."
          value={purpose === " " ? "" : purpose}
          onChange={(_, data) => onPurposeChange(data.value || " ")}
          style={{ width: "100%" }}
        />
      )}
    </div>
  );
};

export default PurposeStep;
