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

/**
 * Phase 5 composed-slide variant — arbitrary fractional regions (CMPS-02).
 * Produced by the composer (Plan 02); rendered by composedRenderer.ts (Plan 03).
 *
 * Unlike the legacy template variants, regions are sourced from a CompositionPlan
 * at runtime rather than from fixed layout constants. x/y/w/h are fractions of
 * the 16:9 canvas; the renderer multiplies by slide width/height in points.
 */
export interface ComposedSlideContent {
  type: "composed";
  title: string;
  subtitle?: string;
  commentary: string;
  regions: Array<{
    id: string;
    kind: "title" | "subtitle" | "commentary" | "chart" | "table" | "callout" | "image";
    /** Fraction [0, 1] of slide width (left edge). */
    x: number;
    /** Fraction [0, 1] of slide height (top edge). */
    y: number;
    /** Fraction [0, 1] of slide width. */
    w: number;
    /** Fraction [0, 1] of slide height. */
    h: number;
  }>;
  /** Raw base64 PNG (NO "data:" prefix) for the chart region. Absent → chart region skipped. */
  chartPngBase64?: string;
  /**
   * Table specification for the table region. Mirrors the composer's tableSpec
   * plus `rows` (resolved data) and `showRowNumbers` (threaded from Cube AI's
   * tableChartSpec per TABL-NATV-01 — not part of the composition plan itself).
   */
  tableSpec?: {
    renderMode: "native-tablev2" | "image";
    columns: Array<{
      key: string;
      header: string;
      align?: "left" | "right" | "center";
    }>;
    rows: Array<Record<string, unknown>>;
    showRowTotals?: boolean;
    showColumnTotals?: boolean;
    showRowNumbers?: boolean;
    showPagination?: boolean;
  };
  /** Optional callout text for callout-kind regions. Absent → callout region skipped. */
  calloutText?: string;
  /** Base64 PNG (no "data:" prefix) for image-kind regions. Absent → image region skipped. */
  generatedImageBase64?: string;
}

/** Discriminated union of all slide content types. */
export type SlideContent =
  | TextOnlyContent
  | ChartTextContent
  | TableTextContent
  | FullCombinationContent
  | ComposedSlideContent;

// --- Guided slide builder types ---

/** Data collected by the wizard across all steps. */
export interface WizardData {
  brandName: string;
  productImageBase64: string | null;
  purpose: string;
}

/** Wizard step number (1=Brand, 2=Image, 3=Purpose, 4=Review). */
export type WizardStep = 1 | 2 | 3 | 4;

/** Build lifecycle state for the guided slide builder.
 *
 * Phase 5 widens this union to include the SlidePreview composition stages
 * (`fetching-data | composing | rendering`) so WizardPanel can drive a live
 * preview when Cube AI emits a cubeSqlApi toolCall. Legacy narrative builds
 * still use `building` only and transition to `built` / `failed`.
 */
export type BuildState =
  | "idle"
  | "building"
  | "fetching-data"
  | "composing"
  | "rendering"
  | "built"
  | "failed";
