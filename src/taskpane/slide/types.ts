/**
 * TypeScript interfaces for slide content structures.
 * All position/size values are in PowerPoint points (1 pt = 1/72 inch).
 */

/** Rectangular region on a slide, all values in points. */
export interface LayoutRegion {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Result of formatting a cell value for display in a table. */
export interface FormatResult {
  display: string;
  isNumeric: boolean;
}

// --- Slide content discriminated union ---

export interface TextOnlyContent {
  type: "text-only";
  title: string;
  bullets: string[];
  insight: string;
}

export interface ChartTextContent {
  type: "chart-text";
  title: string;
  chartImageBase64?: string;
  summaryBullets: string[];
  insight: string;
}

export interface TableTextContent {
  type: "table-text";
  title: string;
  headers: string[];
  rows: (string | number)[][];
  summary: string;
}

export interface FullCombinationContent {
  type: "full-combination";
  title: string;
  chartImageBase64?: string;
  headers: string[];
  rows: (string | number)[][];
  insight: string;
}

/** Discriminated union of all slide content types. */
export type SlideContent =
  | TextOnlyContent
  | ChartTextContent
  | TableTextContent
  | FullCombinationContent;

// --- Guided slide builder types ---

/** Data collected by the wizard across all steps. */
export interface WizardData {
  brandName: string;
  productImageBase64: string | null;
  purpose: string;
}

/** Wizard step number (1=Brand, 2=Image, 3=Purpose, 4=Review). */
export type WizardStep = 1 | 2 | 3 | 4;

/** Build lifecycle state for the guided slide builder. */
export type BuildState = "idle" | "building" | "built" | "failed";
