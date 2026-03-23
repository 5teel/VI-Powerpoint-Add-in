/**
 * Layout constants, colors, fonts, and template geometries for slide rendering.
 * All position/size values are in PowerPoint points (1 pt = 1/72 inch).
 * Values are sourced from the UI-SPEC (02-UI-SPEC.md).
 */

import { LayoutRegion } from "./types";

// --- Slide dimensions (D-01) ---

export const WIDESCREEN = { width: 960, height: 540 } as const;
export const STANDARD = { width: 720, height: 540 } as const;

// --- Spacing tokens (UI-SPEC Spacing Scale) ---

export const MARGIN = 36;
export const REGION_GAP = 24;
export const ELEMENT_GAP = 16;
export const INNER_PADDING = 12;
export const BULLET_INDENT = 18;
export const TABLE_CELL_PAD = 6;

// --- Colors (UI-SPEC Color section) ---

export const COLORS = {
  SUMMIT_NAVY: "#0F1330",
  BODY_TEXT: "#333333",
  TABLE_HEADER_BG: "#0F1330",
  TABLE_HEADER_TEXT: "#FFFFFF",
  TABLE_BODY_EVEN: "#FFFFFF",
  TABLE_BODY_ODD: "#F2F4F8",
  TABLE_BORDER: "#D1D5DB",
  CALLOUT_BG: "#EBF0FA",
  CALLOUT_BORDER: "#0F1330",
  CALLOUT_TEXT: "#0F1330",
  ACCENT: "#2563EB",
  PLACEHOLDER_FILL: "#E5E7EB",
  PLACEHOLDER_BORDER: "#9CA3AF",
} as const;

// --- Font constants (UI-SPEC Typography) ---

export const FONT = {
  FAMILY: "Calibri",
  TITLE_SIZE: 28,
  INSIGHT_SIZE: 22,
  BODY_SIZE: 18,
  TABLE_SIZE: 14,
} as const;

// --- Template layouts (UI-SPEC Layout Contract, all for 960x540 widescreen) ---

/** Template 1: Text-Only */
export const TEXT_ONLY = {
  TITLE: { left: 36, top: 36, width: 888, height: 44 } as LayoutRegion,
  BODY: { left: 36, top: 100, width: 888, height: 260 } as LayoutRegion,
  CALLOUT: { left: 36, top: 384, width: 888, height: 120 } as LayoutRegion,
} as const;

/** Template 2: Chart + Text */
export const CHART_TEXT = {
  TITLE: { left: 36, top: 36, width: 888, height: 44 } as LayoutRegion,
  CHART: { left: 36, top: 100, width: 528, height: 380 } as LayoutRegion,
  TEXT: { left: 588, top: 100, width: 336, height: 240 } as LayoutRegion,
  CALLOUT: { left: 588, top: 364, width: 336, height: 116 } as LayoutRegion,
} as const;

/** Template 3: Table + Text */
export const TABLE_TEXT = {
  TITLE: { left: 36, top: 36, width: 888, height: 44 } as LayoutRegion,
  TABLE: { left: 36, top: 100, width: 888, height: 300 } as LayoutRegion,
  SUMMARY: { left: 36, top: 420, width: 888, height: 84 } as LayoutRegion,
} as const;

/** Template 4: Full Combination */
export const FULL_COMBINATION = {
  TITLE: { left: 36, top: 36, width: 888, height: 44 } as LayoutRegion,
  CHART: { left: 36, top: 100, width: 432, height: 280 } as LayoutRegion,
  TABLE: { left: 492, top: 100, width: 432, height: 280 } as LayoutRegion,
  CALLOUT: { left: 36, top: 404, width: 888, height: 100 } as LayoutRegion,
} as const;

// --- Adaptive scaling (D-01) ---

/**
 * Adapts a widescreen (960pt) layout region to a different slide width.
 * Scales left and width proportionally; top and height remain unchanged
 * (both formats share 540pt height).
 *
 * Returns the region unmodified if slideWidth === 960.
 */
export function adaptLayout(region: LayoutRegion, slideWidth: number): LayoutRegion {
  if (slideWidth === WIDESCREEN.width) {
    return region;
  }
  const scale = slideWidth / WIDESCREEN.width;
  return {
    left: Math.round(region.left * scale),
    top: region.top,
    width: Math.round(region.width * scale),
    height: region.height,
  };
}
