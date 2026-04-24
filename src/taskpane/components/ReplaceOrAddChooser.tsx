import React, { useEffect, useRef } from "react";
import { Button, Text } from "@fluentui/react-components";

/**
 * Phase 6 D-04: Replace-or-Add Chooser inline chip.
 *
 * Amber-warning chip that renders directly under the SlidePreview between
 * refinement-composition success and PowerPoint insertion. Asks the user
 * whether to replace the previously inserted slide or insert as a new one.
 *
 * Defaults per 06-UI-SPEC:
 *   - Focus → Replace button on mount (Enter activates Replace)
 *   - Esc → Insert as new (safer non-destructive default)
 *
 * Palette = existing Phase 5 G2/G3 warning-amber chip — no new color tokens.
 */

const SUMMIT_NAVY = "#0F1330";
const AMBER_BG = "rgba(245, 158, 11, 0.10)";
const AMBER_BORDER = "rgba(245, 158, 11, 0.25)";
const AMBER_TEXT = "#92400E";

export interface ReplaceOrAddChooserProps {
  onReplace: () => void;
  onInsertNew: () => void;
}

export const ReplaceOrAddChooser: React.FC<ReplaceOrAddChooserProps> = ({
  onReplace,
  onInsertNew,
}) => {
  const replaceBtnRef = useRef<HTMLButtonElement | null>(null);

  // D-04: default focus → Replace; Enter key activates Replace.
  useEffect(() => {
    replaceBtnRef.current?.focus();
  }, []);

  // Esc → Insert as new (safer non-destructive default).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onInsertNew();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onInsertNew]);

  return (
    <div
      role="dialog"
      aria-label="Where should this refinement appear?"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 12px",
        borderRadius: 8,
        backgroundColor: AMBER_BG,
        border: `1px solid ${AMBER_BORDER}`,
        marginTop: 8,
        gap: 12,
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      <Text size={200} style={{ color: AMBER_TEXT, flexShrink: 0 }}>
        Replace previous slide?
      </Text>
      <div style={{ display: "flex", gap: 8 }}>
        <Button
          size="small"
          appearance="primary"
          ref={replaceBtnRef}
          aria-label="Replace previous slide (default — press Enter)"
          onClick={onReplace}
          style={{ backgroundColor: SUMMIT_NAVY }}
        >
          Replace
        </Button>
        <Button
          size="small"
          appearance="subtle"
          aria-label="Insert as new slide"
          onClick={onInsertNew}
        >
          Insert as new
        </Button>
      </div>
    </div>
  );
};

export default ReplaceOrAddChooser;
