/**
 * Runtime schema for the Composition AI plan (Phase 5 CMPS-01, CMPS-02).
 * Used by composer.ts for post-stream Zod.parse and by compositionRetry.ts
 * for the Vega-Lite secondary validation path.
 *
 * Source of truth: 05-AI-SPEC.md §4b.1. Any field change should be versioned
 * (bump const name to V2) to trigger a coordinated prompt/schema roll.
 */
import { z } from "zod";

export const RegionSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["title", "subtitle", "commentary", "chart", "table", "callout"]),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0).max(1),
  h: z.number().min(0).max(1),
});

export const DataFilterSchema = z.object({
  topN: z.number().int().positive().max(50).optional(),
  includeOthersBucket: z.boolean().optional(),
  orderBy: z.string().optional(),
  orderDir: z.enum(["asc", "desc"]).optional(),
});

export const TableSpecSchema = z.object({
  renderMode: z.enum(["native-tablev2", "image"]),
  columns: z.array(
    z.object({
      key: z.string(),
      header: z.string(),
      align: z.enum(["left", "right", "center"]).optional(),
    })
  ),
  showRowTotals: z.boolean().optional(),
  showColumnTotals: z.boolean().optional(),
  showPagination: z.boolean().optional(),
});

export const CompositionPlanSchema = z
  .object({
    layout: z.enum(["chart-only", "split", "stacked", "sidebar", "multi-element"]),
    regions: z.array(RegionSchema).min(1).max(6),
    title: z.string().min(1).max(120),
    subtitle: z.string().max(160).optional(),
    commentary: z.string().min(1).max(1200),
    chartSpec: z.record(z.any()).optional(),
    tableSpec: TableSpecSchema.optional(),
    dataFilter: DataFilterSchema.optional(),
  })
  // Reject unknown top-level keys so unexpected AI output (e.g., a hallucinated
  // "dangerouslyAllowScripts" top-level field) surfaces at Zod.parse rather than
  // silently passing through to downstream consumers. chartSpec itself remains
  // a z.record(z.any()) since Vega-Lite accepts many legitimate keys.
  .strict()
  .refine(
    (p) =>
      p.chartSpec !== undefined ||
      p.tableSpec !== undefined ||
      p.regions.every((r) => !["chart", "table"].includes(r.kind)),
    { message: "A chart or table region requires a corresponding chartSpec or tableSpec." }
  )
  .refine(
    (p) => p.regions.every((r) => r.x + r.w <= 1 && r.y + r.h <= 1),
    { message: "Region extends beyond canvas bounds." }
  );

export type CompositionPlan = z.infer<typeof CompositionPlanSchema>;
