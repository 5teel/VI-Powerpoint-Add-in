/**
 * Hardcoded test content for slide rendering verification.
 * One constant per layout template, using realistic business data
 * from the UI-SPEC Copywriting Contract.
 */

import {
  TextOnlyContent,
  TableTextContent,
  ChartTextContent,
  FullCombinationContent,
} from "./types";

export const TEXT_ONLY_TEST: TextOnlyContent = {
  type: "text-only",
  title: "Q3 2024 Revenue Analysis",
  bullets: [
    "Total revenue increased 12% year-over-year",
    "North region led growth at $4.2M (+18%)",
    "New client acquisition up 23% vs. prior quarter",
    "Operating margin improved to 34.1%",
  ],
  insight:
    "North region's 18% growth rate significantly outpaced other regions, driven by 3 enterprise deals closed in September.",
};

export const TABLE_TEXT_TEST: TableTextContent = {
  type: "table-text",
  title: "Regional Performance Summary",
  headers: ["Region", "Revenue", "Growth", "Margin"],
  rows: [
    ["North", "$4.2M", "+18%", "36.2%"],
    ["South", "$3.1M", "+8%", "31.5%"],
    ["East", "$2.8M", "+11%", "33.8%"],
    ["West", "$3.4M", "+14%", "35.1%"],
  ],
  summary:
    "All four regions showed positive growth, with North leading at 18% and an industry-best 36.2% margin.",
};

export const CHART_TEXT_TEST: ChartTextContent = {
  type: "chart-text",
  title: "Revenue by Region — Q3 2024",
  chartImageBase64: undefined, // Phase 5 fills this; placeholder renders for now
  summaryBullets: [
    "North region dominates with 31% of total revenue",
    "West region shows strongest quarter-over-quarter acceleration",
    "Combined revenue exceeds $13.5M target by 4%",
  ],
  insight:
    "Revenue concentration in North region presents both opportunity and risk — diversification strategy recommended for Q4.",
};

export const FULL_COMBO_TEST: FullCombinationContent = {
  type: "full-combination",
  title: "Q3 2024 Executive Dashboard",
  chartImageBase64: undefined,
  headers: ["Metric", "Q2", "Q3", "Change"],
  rows: [
    ["Revenue", "$12.1M", "$13.5M", "+11.6%"],
    ["Margin", "32.8%", "34.1%", "+1.3pp"],
    ["Clients", "847", "1,042", "+23%"],
  ],
  insight:
    "Q3 marks the strongest quarter in company history, with revenue and client acquisition both exceeding targets.",
};
