import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  Input,
  Button,
  Spinner,
  MessageBar,
  MessageBarBody,
  MessageBarActions,
  Text,
} from "@fluentui/react-components";
import { streamCubeAI, StreamPhase, CubeAIStreamResult, CubeAIError } from "../services/cubeai";
import { buildSlidePrompt } from "../services/promptBuilder";
import { extractSlideContent, fallbackToTextOnly } from "../services/schemaParser";
import { insertSlide } from "../services/slideRenderer";

const SUMMIT_NAVY = "#0F1330";

interface ChatMessage {
  role: "user" | "assistant" | "error";
  content: string;
  error?: CubeAIError;
  slideState?: "idle" | "creating" | "created" | "failed";
}

const PHASE_LABELS: Record<StreamPhase, string> = {
  connecting: "Connecting to Cube AI...",
  connected: "Analyzing your question...",
  streaming: "Generating response...",
  complete: "",
};

const ChatPanel: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingContent, setStreamingContent] = useState<string>("");
  const [phase, setPhase] = useState<StreamPhase | null>(null);
  const [query, setQuery] = useState("");
  const [lastQuestion, setLastQuestion] = useState<string>("");
  const [chatId, setChatId] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Abort in-flight request on unmount (Pitfall 2)
  useEffect(() => {
    return () => {
      controllerRef.current?.abort();
    };
  }, []);

  // Auto-scroll to bottom when messages or streaming content change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent, phase]);

  const handleSubmit = useCallback(
    (question: string) => {
      if (!question.trim() || phase !== null) return;

      setLastQuestion(question);
      setMessages((prev) => [...prev, { role: "user", content: question }]);
      setQuery("");
      setStreamingContent("");

      const wrappedQuestion = buildSlidePrompt(question);
      const controller = streamCubeAI(wrappedQuestion, chatId, {
        onPhaseChange: (p: StreamPhase) => setPhase(p),
        onContent: (content: string) => setStreamingContent(content),
        onComplete: (result: CubeAIStreamResult) => {
          setMessages((prev) => [...prev, {
            role: "assistant",
            content: result.content || "(No response received)",
            slideState: "idle",
          }]);
          setStreamingContent("");
          setPhase(null);
          if (result.chatId) setChatId(result.chatId);
        },
        onError: (error: CubeAIError) => {
          setMessages((prev) => [...prev, { role: "error", content: error.message, error }]);
          setStreamingContent("");
          setPhase(null);
        },
      });

      controllerRef.current = controller;
    },
    [phase, chatId]
  );

  const handleRetry = useCallback(() => {
    if (lastQuestion) handleSubmit(lastQuestion);
  }, [lastQuestion, handleSubmit]);

  const handleCreateSlide = useCallback(async (messageIndex: number) => {
    const msg = messages[messageIndex];
    if (!msg || msg.role !== "assistant" || msg.slideState !== "idle") return;

    setMessages(prev => prev.map((m, i) =>
      i === messageIndex ? { ...m, slideState: "creating" as const } : m
    ));

    try {
      const content = extractSlideContent(msg.content) ?? fallbackToTextOnly(msg.content);
      await insertSlide(content);
      setMessages(prev => prev.map((m, i) =>
        i === messageIndex ? { ...m, slideState: "created" as const } : m
      ));
    } catch (err) {
      setMessages(prev => prev.map((m, i) =>
        i === messageIndex ? { ...m, slideState: "failed" as const } : m
      ));
    }
  }, [messages]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(query.trim());
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      {/* Message area */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "4px",
        }}
      >
        {/* Welcome state */}
        {messages.length === 0 && !phase && (
          <div style={{ textAlign: "center", marginTop: "48px" }}>
            <Text weight="semibold" size={400} block>
              Ask a question about your data
            </Text>
            <Text size={300} style={{ color: "#616161", marginTop: "8px", display: "block" }}>
              Type a question below and Cube AI will generate insights.
            </Text>
          </div>
        )}

        {/* Message list */}
        {messages.map((msg, i) => (
          <div key={i}>
            {msg.role === "user" && (
              <div style={{ textAlign: "right", marginBottom: "12px" }}>
                <div
                  style={{
                    display: "inline-block",
                    backgroundColor: SUMMIT_NAVY,
                    color: "white",
                    padding: "8px 12px",
                    borderRadius: "8px",
                    maxWidth: "85%",
                    textAlign: "left",
                  }}
                >
                  <Text size={300} style={{ color: "white" }}>
                    {msg.content}
                  </Text>
                </div>
              </div>
            )}
            {msg.role === "assistant" && (
              <div style={{ marginBottom: "12px" }}>
                <div
                  style={{
                    backgroundColor: "#F5F5F5",
                    padding: "8px 12px",
                    borderRadius: "8px",
                    maxWidth: "85%",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  <Text size={300}>{msg.content}</Text>
                </div>
                {msg.slideState === "idle" && (
                  <Button
                    appearance="primary"
                    size="small"
                    onClick={() => handleCreateSlide(i)}
                    style={{ marginTop: "4px", backgroundColor: SUMMIT_NAVY }}
                  >
                    Create Slide
                  </Button>
                )}
                {msg.slideState === "creating" && (
                  <Button
                    appearance="primary"
                    size="small"
                    disabled
                    style={{ marginTop: "4px" }}
                  >
                    <Spinner size="tiny" /> Creating...
                  </Button>
                )}
                {msg.slideState === "created" && (
                  <Text
                    size={200}
                    style={{ marginTop: "4px", color: "#107C10", display: "block" }}
                  >
                    &#10003; Slide created
                  </Text>
                )}
                {msg.slideState === "failed" && (
                  <div style={{ marginTop: "4px" }}>
                    <Text size={200} style={{ color: "#D13438" }}>
                      Failed to create slide
                    </Text>
                    <Button
                      size="small"
                      onClick={() => {
                        setMessages(prev => prev.map((m, idx) =>
                          idx === i ? { ...m, slideState: "idle" as const } : m
                        ));
                      }}
                      style={{ marginLeft: "8px" }}
                    >
                      Retry
                    </Button>
                  </div>
                )}
              </div>
            )}
            {msg.role === "error" && (
              <div style={{ marginBottom: "12px" }}>
                <MessageBar intent="warning">
                  <MessageBarBody>{msg.content}</MessageBarBody>
                  <MessageBarActions>
                    {msg.error?.retryable && (
                      <Button size="small" onClick={handleRetry}>
                        Try again
                      </Button>
                    )}
                  </MessageBarActions>
                </MessageBar>
              </div>
            )}
          </div>
        ))}

        {/* Streaming content (in progress) */}
        {streamingContent && (
          <div style={{ marginBottom: "12px" }}>
            <div
              style={{
                backgroundColor: "#F5F5F5",
                padding: "8px 12px",
                borderRadius: "8px",
                maxWidth: "85%",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              <Text size={300}>{streamingContent}</Text>
            </div>
          </div>
        )}

        {/* Phase-based spinner (per D-07, D-08) */}
        {phase && phase !== "complete" && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 0" }}>
            <Spinner size="small" label={PHASE_LABELS[phase]} />
          </div>
        )}

        {/* Auto-scroll anchor */}
        <div ref={messagesEndRef} />
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
          placeholder="Ask a question about your data..."
          value={query}
          onChange={(_, data) => setQuery(data.value)}
          onKeyDown={handleKeyDown}
          disabled={phase !== null}
        />
        <Button
          appearance="primary"
          disabled={!query.trim() || phase !== null}
          onClick={() => handleSubmit(query.trim())}
          style={{
            backgroundColor: !query.trim() || phase !== null ? undefined : SUMMIT_NAVY,
            minWidth: "100px",
            minHeight: "32px",
          }}
        >
          Send
        </Button>
      </div>
    </div>
  );
};

export default ChatPanel;
