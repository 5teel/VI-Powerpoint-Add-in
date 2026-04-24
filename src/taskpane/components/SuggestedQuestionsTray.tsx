import React from "react";
import { SUGGESTED_QUESTIONS } from "../constants/suggestedQuestions";

/**
 * Phase 6 D-12: Suggested-questions tray.
 *
 * Horizontal strip of 5 pill chips below the chat input. Clicking a chip
 * invokes onSelect with the full prompt text — the caller is responsible
 * for populating the input and auto-submitting (ChatPanel wiring in wave 6).
 *
 * Layout is nowrap + overflowX:auto per 06-UI-SPEC §Suggested-Questions Tray
 * so the strip horizontally scrolls at 320px taskpane width. Tray hides via
 * `disabled` prop while a build is in progress (phase !== null).
 */

const SUMMIT_NAVY = "#0F1330";
const CHIP_BG = "rgba(15, 19, 48, 0.06)";
const CHIP_BG_HOVER = "rgba(15, 19, 48, 0.10)";
const CHIP_BORDER = "rgba(15, 19, 48, 0.12)";
const CHIP_BORDER_HOVER = "rgba(15, 19, 48, 0.25)";

export interface SuggestedQuestionsTrayProps {
  onSelect: (prompt: string) => void;
  disabled?: boolean;
}

export const SuggestedQuestionsTray: React.FC<SuggestedQuestionsTrayProps> = ({
  onSelect,
  disabled,
}) => {
  if (disabled) return null;
  return (
    <div
      role="region"
      aria-label="Suggested questions"
      style={{
        display: "flex",
        flexWrap: "nowrap",
        gap: 8,
        padding: "8px 12px",
        overflowX: "auto",
        alignItems: "center",
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      {SUGGESTED_QUESTIONS.map((prompt) => (
        <button
          key={prompt}
          type="button"
          aria-label={`Ask: ${prompt}`}
          onClick={() => onSelect(prompt)}
          style={{
            flexShrink: 0,
            padding: "6px 10px",
            borderRadius: 16,
            backgroundColor: CHIP_BG,
            border: `1px solid ${CHIP_BORDER}`,
            color: SUMMIT_NAVY,
            fontSize: 12,
            fontWeight: 400,
            cursor: "pointer",
            whiteSpace: "nowrap",
            transition: "background-color 0.15s, border-color 0.15s",
            fontFamily: "inherit",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = CHIP_BG_HOVER;
            e.currentTarget.style.borderColor = CHIP_BORDER_HOVER;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = CHIP_BG;
            e.currentTarget.style.borderColor = CHIP_BORDER;
          }}
        >
          {prompt}
        </button>
      ))}
    </div>
  );
};

export default SuggestedQuestionsTray;
