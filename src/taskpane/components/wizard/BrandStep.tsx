import React from "react";
import { Input, Text } from "@fluentui/react-components";

interface BrandStepProps {
  brandName: string;
  onBrandChange: (name: string) => void;
}

const BrandStep: React.FC<BrandStepProps> = ({ brandName, onBrandChange }) => {
  return (
    <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
      <Text weight="semibold" size={400}>
        What brand should we focus on?
      </Text>
      <Input
        placeholder="e.g., Coca Cola, Red Bull..."
        value={brandName}
        onChange={(_, data) => onBrandChange(data.value)}
        style={{ width: "100%" }}
      />
      <Text size={200} style={{ color: "#616161" }}>
        Enter the brand name for your analysis
      </Text>
    </div>
  );
};

export default BrandStep;
