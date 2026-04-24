import React from "react";
import { Text } from "@fluentui/react-components";
import { CheckmarkCircle12Filled } from "@fluentui/react-icons";
import type { MissingCredential } from "../config";

/**
 * Phase 6 D-14: Setup-required fallback screen.
 *
 * Renders instead of the tab switcher when any required credential is missing
 * or placeholder (see config.ts `validateConfig`). Deliberately austere per
 * 06-UI-SPEC §Setup-Required Screen — no accent blue, no animation, neutral
 * grey + navy text + amber-on-missing-credential. Copy is locked verbatim in
 * the 06-UI-SPEC Copywriting Contract.
 */

const SUMMIT_NAVY = "#0F1330";
const DESTRUCTIVE_RED = "#D13438";
const SUCCESS_GREEN = "#107C10";
const STEADY_GREY = "#6B7280";
const BODY_DARK = "#1F2937";
const SKELETON = "#F3F4F6";
const BORDER = "#E5E7EB";

const ALL_KEYS: MissingCredential["key"][] = [
  "CUBEAI_API_KEY",
  "CUBE_DATA_BASE_URL",
  "CUBE_DATA_JWT",
  "ANTHROPIC_API_KEY",
];

const CREDENTIAL_PURPOSES: Record<MissingCredential["key"], string> = {
  CUBEAI_API_KEY:
    "Cube AI Chat API key — used to generate slide insights from your data questions.",
  CUBE_DATA_BASE_URL:
    "Cube REST data API base URL — points to your deployment-specific data endpoint (e.g., https://{deployment}.gcp-us-central1.cubecloud.dev).",
  CUBE_DATA_JWT:
    "Cube REST data API JWT — authenticates the data fetch for charts and tables.",
  ANTHROPIC_API_KEY:
    "Anthropic Claude API key — composes the final slide layout from Cube's response.",
};

function isRailway(): boolean {
  const h = typeof window !== "undefined" ? window.location.hostname : "";
  return h.includes("railway") || h.includes(".up.railway.app");
}

export interface SetupRequiredProps {
  missing: MissingCredential[];
}

export const SetupRequired: React.FC<SetupRequiredProps> = ({ missing }) => {
  const missingKeys = new Set(missing.map((m) => m.key));
  const codeHeading = isRailway()
    ? "Add to Railway environment variables:"
    : "Add to your local .env:";

  const codeBlockLines = missing
    .map(
      (m) =>
        `${m.railwayVarName}=your-${m.railwayVarName
          .toLowerCase()
          .replace(/_/g, "-")}-here`
    )
    .join("\n");

  return (
    <div
      role="main"
      style={{
        display: "flex",
        flexDirection: "column",
        padding: "32px 24px",
        maxWidth: 360,
        margin: "0 auto",
        overflowY: "auto",
        height: "100%",
        boxSizing: "border-box",
      }}
    >
      <Text
        as="h1"
        size={400}
        weight="semibold"
        style={{ color: SUMMIT_NAVY, margin: "32px 0 8px 0" }}
      >
        Setup required
      </Text>
      <Text size={300} style={{ color: BODY_DARK, marginBottom: 24 }}>
        Summit VI needs the following credentials before it can build slides. Add them to your environment and restart the add-in.
      </Text>

      <div
        style={{
          backgroundColor: "rgba(255, 255, 255, 0.85)",
          borderRadius: 12,
          padding: 16,
          border: `1px solid ${BORDER}`,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          marginBottom: 24,
        }}
      >
        {ALL_KEYS.map((key) => {
          const isMissing = missingKeys.has(key);
          return (
            <div
              key={key}
              role={isMissing ? "alert" : undefined}
              style={{
                borderLeft: `3px solid ${isMissing ? DESTRUCTIVE_RED : SUCCESS_GREEN}`,
                paddingLeft: 10,
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Text
                  size={300}
                  weight="semibold"
                  style={{
                    color: SUMMIT_NAVY,
                    fontFamily: "Consolas, 'Courier New', monospace",
                  }}
                >
                  {key}
                </Text>
                {!isMissing && (
                  <CheckmarkCircle12Filled primaryFill={SUCCESS_GREEN} />
                )}
              </div>
              <Text size={100} style={{ color: STEADY_GREY }}>
                {CREDENTIAL_PURPOSES[key]}
              </Text>
            </div>
          );
        })}
      </div>

      <Text
        size={300}
        weight="semibold"
        style={{ color: SUMMIT_NAVY, marginBottom: 8 }}
      >
        {codeHeading}
      </Text>
      <pre
        style={{
          backgroundColor: SKELETON,
          color: SUMMIT_NAVY,
          padding: "8px 12px",
          borderRadius: 4,
          whiteSpace: "pre",
          userSelect: "text",
          fontFamily: "Consolas, 'Courier New', monospace",
          fontSize: 12,
          margin: 0,
          overflowX: "auto",
        }}
      >
        {codeBlockLines}
      </pre>

      <Text size={100} style={{ color: STEADY_GREY, marginTop: 16 }}>
        After updating, refresh this taskpane (close and reopen).
      </Text>
    </div>
  );
};

export default SetupRequired;
