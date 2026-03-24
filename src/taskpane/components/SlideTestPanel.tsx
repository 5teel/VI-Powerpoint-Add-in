import React, { useState } from "react";
import {
  Button,
  Spinner,
  MessageBar,
  MessageBarBody,
  Text,
  Badge,
} from "@fluentui/react-components";
import { SlideContent } from "../slide/types";
import { insertSlide } from "../services/slideRenderer";
import {
  TEXT_ONLY_TEST,
  TABLE_TEXT_TEST,
  CHART_TEXT_TEST,
  FULL_COMBO_TEST,
} from "../slide/testData";

type PanelState = "idle" | "loading" | "success" | "error";

interface TestButton {
  id: string;
  label: string;
  content: SlideContent;
}

const TEST_BUTTONS: TestButton[] = [
  { id: "text", label: "Insert Text Slide", content: TEXT_ONLY_TEST },
  { id: "table", label: "Insert Table Slide", content: TABLE_TEXT_TEST },
  { id: "chart", label: "Insert Chart+Text Slide", content: CHART_TEXT_TEST },
  { id: "full", label: "Insert Full Slide", content: FULL_COMBO_TEST },
];

const SlideTestPanel: React.FC = () => {
  const [panelState, setPanelState] = useState<PanelState>("idle");
  const [activeButton, setActiveButton] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const handleInsert = async (content: SlideContent, buttonId: string) => {
    if (panelState === "loading") return;
    setPanelState("loading");
    setActiveButton(buttonId);
    setErrorMessage("");
    try {
      await insertSlide(content);
      setPanelState("success");
      setTimeout(() => setPanelState("idle"), 2000);
    } catch (err) {
      setPanelState("error");
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  };

  const isLoading = panelState === "loading";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        overflow: "hidden",
        padding: "16px",
        gap: "16px",
      }}
    >
      <Text weight="semibold" size={400} block>
        Slide Options
      </Text>

      <Text size={300} style={{ color: "#616161" }}>
        Insert sample slides to preview each layout template.
      </Text>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {TEST_BUTTONS.map((btn) => (
          <Button
            key={btn.id}
            appearance="secondary"
            disabled={isLoading}
            onClick={() => handleInsert(btn.content, btn.id)}
            style={{ justifyContent: "flex-start" }}
          >
            {isLoading && activeButton === btn.id ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                <Spinner size="tiny" />
                {btn.label}
              </span>
            ) : panelState === "success" && activeButton === btn.id ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                <Badge color="success" shape="rounded" size="small">
                  Done
                </Badge>
                {btn.label}
              </span>
            ) : (
              btn.label
            )}
          </Button>
        ))}
      </div>

      {panelState === "error" && errorMessage && (
        <MessageBar intent="error">
          <MessageBarBody>
            Failed to insert slide: {errorMessage}. Ensure PowerPoint is open with an active
            presentation.
          </MessageBarBody>
        </MessageBar>
      )}
    </div>
  );
};

export default SlideTestPanel;
