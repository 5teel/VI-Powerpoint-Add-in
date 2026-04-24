import React from "react";
import { Text } from "@fluentui/react-components";
import { DismissRegular } from "@fluentui/react-icons";

/**
 * Phase 6 D-02: Refining chip — above-composer indicator.
 *
 * Deterministic presentational atom consumed by ChatPanel in wave 6. Shows
 * "Refining: {slideTitle}" with an × dismiss control that lets the user
 * treat the next submit as a fresh question. Typography, palette, and copy
 * locked to 06-UI-SPEC §Refining Chip + §Copywriting Contract.
 */

const SUMMIT_NAVY = "#0F1330";
const STEADY_GREY = "#6B7280";
const SKELETON = "#F3F4F6";
const BORDER = "#E5E7EB";
const MAX_TITLE_CHARS = 40;

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}

export interface RefiningChipProps {
  slideTitle: string;
  onDismiss: () => void;
}

export const RefiningChip: React.FC<RefiningChipProps> = ({
  slideTitle,
  onDismiss,
}) => {
  const displayTitle = truncate(slideTitle, MAX_TITLE_CHARS);
  return (
    <div
      role="region"
      aria-label={`Refining ${displayTitle}. Press the dismiss button to start a new question.`}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        padding: "4px 8px 4px 10px",
        borderRadius: 6,
        backgroundColor: SKELETON,
        border: `1px solid ${BORDER}`,
        marginBottom: 8,
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 4,
          overflow: "hidden",
        }}
      >
        <Text size={100} style={{ color: STEADY_GREY, fontSize: 11 }}>
          Refining:
        </Text>
        <Text
          size={200}
          weight="semibold"
          style={{
            color: SUMMIT_NAVY,
            maxWidth: 260,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {displayTitle}
        </Text>
      </div>
      <button
        type="button"
        aria-label="Dismiss refining context"
        onClick={onDismiss}
        title="Treat as a new question"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 2,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          color: STEADY_GREY,
          borderRadius: 4,
          width: 16,
          height: 16,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = SUMMIT_NAVY)}
        onMouseLeave={(e) => (e.currentTarget.style.color = STEADY_GREY)}
      >
        <DismissRegular style={{ width: 12, height: 12 }} />
      </button>
    </div>
  );
};

export default RefiningChip;
