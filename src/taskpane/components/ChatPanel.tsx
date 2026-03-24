import React, { useState } from "react";
import {
  Input,
  Button,
  Spinner,
  Badge,
  Card,
  CardHeader,
  MessageBar,
  MessageBarBody,
  Text,
} from "@fluentui/react-components";
import { streamCubeAI, CubeAIStreamResult, CubeAIError } from "../services/cubeai";

const SUMMIT_NAVY = "#0F1330";

type PanelState = "idle" | "loading" | "success" | "error";

interface LegacyResult {
  success: boolean;
  content?: string;
  error?: string;
  responseTimeMs?: number;
}

const ChatPanel: React.FC = () => {
  const [query, setQuery] = useState("");
  const [panelState, setPanelState] = useState<PanelState>("idle");
  const [result, setResult] = useState<LegacyResult | null>(null);

  const handleSubmit = async () => {
    if (!query.trim() || panelState === "loading") return;
    setPanelState("loading");
    setResult(null);

    const startTime = performance.now();
    streamCubeAI(query.trim(), null, {
      onPhaseChange: () => {},
      onContent: () => {},
      onComplete: (streamResult: CubeAIStreamResult) => {
        const elapsed = Math.round(performance.now() - startTime);
        setResult({
          success: true,
          content: streamResult.content.substring(0, 500),
          responseTimeMs: elapsed,
        });
        setPanelState("success");
      },
      onError: (err: CubeAIError) => {
        setResult({ success: false, error: err.message });
        setPanelState("error");
      },
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const isSubmitting = panelState === "loading";

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      {/* Response area */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        {panelState === "idle" && (
          <div style={{ textAlign: "center", marginTop: "48px" }}>
            <Text weight="semibold" size={400} block>
              Test Cube AI Connection
            </Text>
            <Text size={300} style={{ color: "#616161", marginTop: "8px", display: "block" }}>
              Type a question below to verify the API connection is working.
            </Text>
          </div>
        )}

        {panelState === "loading" && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              justifyContent: "center",
              marginTop: "48px",
            }}
          >
            <Spinner size="small" label="Connecting to Cube AI..." />
          </div>
        )}

        {panelState === "success" && result && (
          <Card>
            <CardHeader
              header={
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Badge color="success" shape="rounded">
                    Connected
                  </Badge>
                  <Text weight="semibold">Connection Successful</Text>
                </div>
              }
              description={`Cube AI responded in ${result.responseTimeMs}ms. CORS is working.`}
            />
            <div style={{ padding: "0 16px 16px" }}>
              <Text size={200} style={{ color: "#616161", display: "block", marginBottom: "4px" }}>
                Response preview:
              </Text>
              <div
                style={{
                  backgroundColor: "#F5F5F5",
                  padding: "8px",
                  borderRadius: "4px",
                  fontSize: "12px",
                  lineHeight: "16px",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  maxHeight: "200px",
                  overflowY: "auto",
                }}
              >
                {result.content || "(empty response)"}
              </div>
            </div>
          </Card>
        )}

        {panelState === "error" && result && (
          <MessageBar intent="error">
            <MessageBarBody>
              {result.error || "Something went wrong. Try again or check the browser console for details."}
            </MessageBarBody>
          </MessageBar>
        )}
      </div>

      {/* Input area */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          padding: "8px",
          borderTop: "1px solid #E0E0E0",
          flexShrink: 0,
        }}
      >
        <Input
          style={{ flex: 1 }}
          placeholder="Ask a question to test the connection..."
          value={query}
          onChange={(_, data) => setQuery(data.value)}
          onKeyDown={handleKeyDown}
          disabled={isSubmitting}
        />
        <Button
          appearance="primary"
          disabled={!query.trim() || isSubmitting}
          onClick={handleSubmit}
          style={{
            backgroundColor: !query.trim() || isSubmitting ? undefined : SUMMIT_NAVY,
            minWidth: "100px",
            minHeight: "32px",
          }}
        >
          Send Query
        </Button>
      </div>
    </div>
  );
};

export default ChatPanel;
