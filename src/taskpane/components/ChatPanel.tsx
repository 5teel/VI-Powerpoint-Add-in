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
import {
  streamCubeAI,
  StreamPhase,
  CubeAIStreamResult,
  CubeAIError,
  type CubeSqlApiToolCall,
} from "../services/cubeai";
import { buildSlidePrompt } from "../services/promptBuilder";
import { extractSlideContent, fallbackToTextOnly, summarizeSlideContent } from "../services/schemaParser";
import { insertSlide, type ComposedSlideContent } from "../services/slideRenderer";
import { routeCreateSlide, routeMessage, type MessageRoute } from "../services/slideRouter";
import { scoreRefinementIntent, REFINEMENT_SCORE_THRESHOLD, type RefinementContext } from "../services/refinementDetector";
import { classifyRefinement } from "../services/refinementClassifier";
import { loadCubeData } from "../services/cubeDataClient";
import { translateSql } from "../services/sqlTranslator";
import { composeWithRetry } from "../services/compositionRetry";
import type { CompositionPlan } from "../services/compositionSchema";
import { renderVegaToBase64Png } from "../services/vegaRenderer";
import { logEvent } from "../services/telemetry";
import { SlidePreview, type SlidePreviewStage } from "./SlidePreview";
import { RefiningChip } from "./RefiningChip";
import { SuggestedQuestionsTray } from "./SuggestedQuestionsTray";
import { SectionStrip } from "./SectionStrip";
import { planSection, type MetaComposerInput, type SectionPlan } from "../services/metaComposer";

const SUMMIT_NAVY = "#0F1330";

interface ChatMessage {
  role: "user" | "assistant" | "error";
  content: string;
  rawContent?: string; // Original response for slide creation (may contain JSON)
  error?: CubeAIError;
  slideState?:
    | "idle"
    | "creating"
    | "fetching-data"
    | "composing"
    | "rendering"
    | "created"
    | "failed";
  /** Finalised cubeSqlApi toolCall captured during the stream (D-02 router input). */
  toolCall?: CubeSqlApiToolCall;
  /** CMPS-03 grounding anchor — Cube AI assistant text captured alongside the toolCall (D-05). */
  commentary?: string;
  /**
   * Phase 6 D-03/D-04: When true, this assistant message is the result of a
   * refinement classification + externally-driven composition (runCompositionForRefinement).
   * Used by the render branch to mount <SlidePreview skipAutoStart awaitingChoice ... />
   * instead of the Phase 5 self-driving SlidePreview — prevents double-composition.
   */
  isRefinement?: boolean;
}

const PHASE_LABELS: Record<StreamPhase, string> = {
  connecting: "Connecting to Summit...",
  connected: "Analyzing your question...",
  streaming: "Building your slide...",
  complete: "",
};

/**
 * Phase 6 D-04 helper — delete a previously inserted slide by its captured
 * Office.js Slide.id. Throws on failure; the caller falls through to
 * insert-as-new so the user still receives their refined slide.
 */
async function deletePriorSlideBySlideId(slideId: string): Promise<void> {
  await PowerPoint.run(async (context) => {
    const slides = context.presentation.slides;
    slides.load("items");
    await context.sync();
    for (let i = 0; i < slides.items.length; i++) {
      slides.items[i].load("id");
    }
    await context.sync();
    const slide = slides.items.find((s) => s.id === slideId);
    if (!slide) {
      throw new Error(
        `Slide with id ${slideId} not found (may have been manually deleted)`
      );
    }
    slide.delete();
    await context.sync();
  });
}

/**
 * Phase 6 D-04 helper — capture the Office.js Slide.id of the slide that was
 * JUST inserted. Mirrors the post-insert id-load pattern in
 * layoutEngine.addSlideAtCurrentPosition. Returns null on failure so the next
 * turn's Replace silently degrades to insert-as-new (T-06-31 accept).
 */
async function captureInsertedSlideId(): Promise<string | null> {
  try {
    let captured: string | null = null;
    await PowerPoint.run(async (context) => {
      // Selection follows the freshly-inserted slide in PowerPoint Desktop.
      const selected = context.presentation.getSelectedSlides();
      selected.load("items");
      await context.sync();
      if (selected.items.length === 0) {
        // Fallback: last slide in deck.
        const slides = context.presentation.slides;
        slides.load("items");
        await context.sync();
        if (slides.items.length === 0) return;
        const last = slides.items[slides.items.length - 1];
        last.load("id");
        await context.sync();
        captured = last.id;
        return;
      }
      const slide = selected.items[0];
      slide.load("id");
      await context.sync();
      captured = slide.id;
    });
    return captured;
  } catch (err) {
    logEvent("replace.capture_id_failed", { err: String(err) });
    return null;
  }
}

const ChatPanel: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingContent, setStreamingContent] = useState<string>("");
  const [phase, setPhase] = useState<StreamPhase | null>(null);
  const [query, setQuery] = useState("");
  const [lastQuestion, setLastQuestion] = useState<string>("");
  const [chatId, setChatId] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // ── Phase 6 D-01/D-02 refinement-chip state ─────────────────────────────
  const [refinementScore, setRefinementScore] = useState<number>(0);
  const [chipDismissed, setChipDismissed] = useState<boolean>(false);
  const [lastSlideTitle, setLastSlideTitle] = useState<string | null>(null);
  const [lastSlideCreatedAtMs, setLastSlideCreatedAtMs] = useState<
    number | null
  >(null);

  // Phase 6 D-04 last-build context — populated at ALL 3 insertion success sites.
  const lastBuildRef = useRef<{
    slideId: string | null;
    toolCall: CubeSqlApiToolCall;
    rows: unknown[];
    commentary: string;
    userQuestion: string;
    title: string;
    createdAtMs: number;
    chatId: string | null;
  } | null>(null);

  // Phase 6 D-04 awaiting-choice gate (per-message-index).
  const [awaitingChoiceFor, setAwaitingChoiceFor] = useState<{
    messageIndex: number;
    onReplace: () => void;
    onInsertNew: () => void;
  } | null>(null);

  // ── Phase 6 Wave 7 D-05/D-07 section-plan build state ──────────────────
  // When set, the assistant message at `messageIndex` mounts <SectionStrip />
  // instead of the Phase 5 SlidePreview path. Cleared on onAllDone / onPlanError.
  const [sectionBuild, setSectionBuild] = useState<{
    messageIndex: number;
    input: {
      userQuestion: string;
      toolCall: CubeSqlApiToolCall;
      cubeRows: unknown[];
      commentary: string;
    };
  } | null>(null);

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

  // ── 200ms debounced refinement scoring on draft change (D-01) ───────────
  useEffect(() => {
    const REFINEMENT_DEBOUNCE_MS = 200; // setTimeout 200 ms — debounce window per 06-UI-SPEC §Refinement Detection.
    const handle = setTimeout(() => {
      const ctx: RefinementContext = {
        lastAssistantSlideState:
          lastSlideCreatedAtMs !== null ? "created" : undefined,
        lastSlideCreatedAtMs: lastSlideCreatedAtMs ?? undefined,
        nowMs: Date.now(),
      };
      const score = scoreRefinementIntent(query, ctx);
      setRefinementScore(score);
    }, REFINEMENT_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query, lastSlideCreatedAtMs]);

  // Reset chipDismissed when draft clears so a fresh draft re-evaluates from scratch.
  useEffect(() => {
    if (query.trim().length === 0) setChipDismissed(false);
  }, [query]);

  const chipVisible =
    refinementScore >= REFINEMENT_SCORE_THRESHOLD &&
    !chipDismissed &&
    phase === null &&
    lastSlideTitle !== null;

  /** Map SlidePreviewStage → ChatMessage.slideState (success → created, failed → failed). */
  const mapStageToSlideState = (
    s: SlidePreviewStage
  ): ChatMessage["slideState"] =>
    s === "success" ? "created" : s === "failed" ? "failed" : s;

  /** Walk backwards from `fromIdx` to find the last user message — question context for SlidePreview. */
  const findLastUserQuestion = useCallback(
    (fromIdx: number): string => {
      for (let i = fromIdx - 1; i >= 0; i--) {
        if (messages[i].role === "user") return messages[i].content;
      }
      return "";
    },
    [messages]
  );

  /**
   * Phase 6 — central helper that records a successful slide insertion at the
   * two refinement insertion sites (composer-only + cube-ai+composer). The
   * Phase 5 new-composition site (#1) writes lastBuildRef inline in its
   * SlidePreview.onSuccess callback.
   */
  const finalizeInsertionSuccess = useCallback(
    async (
      messageIndex: number,
      built: {
        slideId: string | null;
        toolCall: CubeSqlApiToolCall;
        rows: unknown[];
        commentary: string;
        userQuestion: string;
        title: string;
        chatId: string | null;
      }
    ) => {
      const createdAtMs = Date.now();
      lastBuildRef.current = {
        slideId: built.slideId,
        toolCall: built.toolCall,
        rows: built.rows,
        commentary: built.commentary,
        userQuestion: built.userQuestion,
        title: built.title,
        createdAtMs,
        chatId: built.chatId,
      };
      setLastSlideTitle(built.title);
      setLastSlideCreatedAtMs(createdAtMs);
      setMessages((prev) =>
        prev.map((m, i) =>
          i === messageIndex ? { ...m, slideState: "created" as const } : m
        )
      );
    },
    []
  );

  /**
   * Phase 6 D-03/D-04 — runs composeWithRetry + insertSlide EXTERNALLY for a
   * refinement message. SlidePreview is mounted with skipAutoStart=true so it
   * does NOT run its own pipeline — only ONE composition runs per refinement.
   * After the new slide is inserted, the user picks Replace (delete the prior
   * slide by id) or Insert as new (leave both).
   */
  const runCompositionForRefinement = useCallback(
    async (
      messageIndex: number,
      input: {
        userQuestion: string;
        toolCall: CubeSqlApiToolCall;
        rows: unknown[];
        commentary: string;
      }
    ) => {
      // Flip message into refinement render mode.
      setMessages((prev) =>
        prev.map((m, i) =>
          i === messageIndex
            ? { ...m, slideState: "composing", isRefinement: true }
            : m
        )
      );

      const ac = new AbortController();
      try {
        // 1) Fetch rows if not cached.
        let rows = input.rows;
        if (rows.length === 0) {
          const cubeQuery = translateSql(input.toolCall.input.sqlQuery);
          const resp = await loadCubeData(cubeQuery, { signal: ac.signal });
          rows = resp.data;
        }

        // 2) Compose.
        let finalPlan: CompositionPlan | null = null;
        await composeWithRetry(
          {
            userQuestion: input.userQuestion,
            cubeMeta: {
              queryTitle: input.toolCall.input.queryTitle,
              description: input.toolCall.input.description,
              vegaSpec: input.toolCall.input.vegaSpec,
              tableChartSpec: input.toolCall.input.tableChartSpec,
              commentary: input.commentary,
            },
            rows,
            canvas: { widthPx: 960, heightPx: 540 },
            signal: ac.signal,
          },
          {
            onPartialPlan: () => {
              /* refinement render branch shows the chooser only — no live preview */
            },
            onFinal: (p) => {
              finalPlan = p;
            },
            onError: () => {
              /* swallow — outer await rejects via composeWithRetry */
            },
          },
          input.toolCall.input.vegaSpec as object | undefined
        );
        if (!finalPlan)
          throw new Error("Composer resolved without finalPlan");
        // Capture for use inside the chooser handlers (TS narrowing across closures).
        const plan: CompositionPlan = finalPlan;

        // 3) Optional chart render.
        const chartPng = plan.chartSpec
          ? await renderVegaToBase64Png({
              spec: plan.chartSpec as Record<string, unknown>,
              rows: rows as Array<Record<string, unknown>>,
              signal: ac.signal,
            })
          : undefined;

        // 4) D-04 Replace-or-Add chooser — surfaced via SlidePreview
        //    skipAutoStart + awaitingChoice (mounted in the render branch below).
        await new Promise<void>((resolve) => {
          const onReplace = async () => {
            setAwaitingChoiceFor(null);
            let replacedInPlace = false;
            if (lastBuildRef.current?.slideId) {
              try {
                await deletePriorSlideBySlideId(
                  lastBuildRef.current.slideId
                );
                replacedInPlace = true;
              } catch (err) {
                logEvent("replace.delete_failed", { err: String(err) });
              }
            }
            const composed: ComposedSlideContent = {
              type: "composed",
              title: plan.title,
              subtitle: plan.subtitle,
              commentary: plan.commentary,
              regions: plan.regions,
              chartPngBase64: chartPng,
            };
            await insertSlide(composed);
            const newSlideId = await captureInsertedSlideId();
            await finalizeInsertionSuccess(messageIndex, {
              slideId: newSlideId,
              toolCall: input.toolCall,
              rows,
              commentary: input.commentary,
              userQuestion: input.userQuestion,
              title: plan.title,
              chatId,
            });
            logEvent("refinement.replace_applied", { replacedInPlace });
            resolve();
          };

          const onInsertNew = async () => {
            setAwaitingChoiceFor(null);
            const composed: ComposedSlideContent = {
              type: "composed",
              title: plan.title,
              subtitle: plan.subtitle,
              commentary: plan.commentary,
              regions: plan.regions,
              chartPngBase64: chartPng,
            };
            await insertSlide(composed);
            const newSlideId = await captureInsertedSlideId();
            await finalizeInsertionSuccess(messageIndex, {
              slideId: newSlideId,
              toolCall: input.toolCall,
              rows,
              commentary: input.commentary,
              userQuestion: input.userQuestion,
              title: plan.title,
              chatId,
            });
            logEvent("refinement.insert_new_applied", {});
            resolve();
          };

          setAwaitingChoiceFor({ messageIndex, onReplace, onInsertNew });
        });
      } catch (err) {
        setAwaitingChoiceFor(null);
        const msg = err instanceof Error ? err.message : String(err);
        setMessages((prev) =>
          prev.map((m, i) =>
            i === messageIndex
              ? {
                  ...m,
                  slideState: "failed" as const,
                  error: { message: msg, type: "unknown", retryable: false },
                }
              : m
          )
        );
        logEvent("refinement.failed", { err: msg });
      }
    },
    [chatId, finalizeInsertionSuccess]
  );

  const handleSubmit = useCallback(
    (question: string) => {
      if (!question.trim() || phase !== null) return;

      setLastQuestion(question);
      setMessages((prev) => [...prev, { role: "user", content: question }]);
      setQuery("");
      setStreamingContent("");

      const wrappedQuestion = buildSlidePrompt(question);

      // Phase 5 D-02 + CMPS-03 capture — populated during the stream.
      let capturedToolCall: CubeSqlApiToolCall | null = null;
      let capturedCommentary = "";

      // Snapshot refinement-chip state at submit time (debounce may race with submit).
      const isRefinementFlow = chipVisible;
      // Snapshot the title before the stream finishes — needed by classifier prompt.
      const submitLastSlideTitle = lastSlideTitle;

      const controller = streamCubeAI(wrappedQuestion, chatId, {
        onPhaseChange: (p: StreamPhase) => setPhase(p),
        onContent: (content: string) => {
          setStreamingContent(content);
          // CMPS-03: track the final assistant text. The stream fires onContent
          // throttled (~200ms) and once un-throttled at end-of-stream, so the
          // last value observed is the complete assistant commentary.
          capturedCommentary = content;
        },
        onToolCall: (tc: CubeSqlApiToolCall) => {
          capturedToolCall = tc;
        },
        onComplete: async (result: CubeAIStreamResult) => {
          const raw = result.content || "";
          const parsed = extractSlideContent(raw);
          const displayText = parsed
            ? summarizeSlideContent(parsed)
            : raw || "(No response received)";

          // Append assistant message and capture its index for downstream wiring.
          let newMsgIdx = -1;
          setMessages((prev) => {
            newMsgIdx = prev.length;
            return [
              ...prev,
              {
                role: "assistant",
                content: displayText,
                rawContent: raw,
                slideState: "idle",
                toolCall: capturedToolCall ?? undefined,
                // CMPS-03 grounding anchor.
                commentary: capturedCommentary || raw || undefined,
              },
            ];
          });
          setStreamingContent("");
          setPhase(null);
          if (result.chatId) setChatId(result.chatId);

          // ─────────────────────────────────────────────────────────────────
          // (A) Refinement short-circuit — PRESERVED from Plan 06-06.
          // Refinement NEVER goes multi-slide by contract — short-circuits
          // before planSection so the meta-composer never plans for a refinement.
          // ─────────────────────────────────────────────────────────────────
          if (
            isRefinementFlow &&
            capturedToolCall &&
            lastBuildRef.current
          ) {
            const routing = await classifyRefinement(
              question,
              submitLastSlideTitle ?? "",
              controller.signal
            );
            if (routing.path === "composer-only") {
              const last = lastBuildRef.current;
              await runCompositionForRefinement(newMsgIdx, {
                userQuestion: `${last.userQuestion}\n\nREFINEMENT: ${question}`,
                toolCall: last.toolCall,
                rows: last.rows,
                commentary: last.commentary,
              });
            } else {
              // cube-ai+composer: streamCubeAI already ran and produced a NEW
              // toolCall under the SAME chatId (CUBE-03 thread continuity).
              await runCompositionForRefinement(newMsgIdx, {
                userQuestion: question,
                toolCall: capturedToolCall,
                rows: [],
                commentary: capturedCommentary || raw,
              });
            }
            return;
          }

          // ─────────────────────────────────────────────────────────────────
          // (B) planSection preflight — D-05 LITERAL (Wave 7).
          // For EVERY composition-route message that is NOT a refinement, invoke
          // planSection via the callback adapter (mirrors sectionOrchestrator.ts
          // lines 138–169). No keyword/regex gate. On failure, default to a
          // single-slide plan and fall through to the Phase 5 path.
          // ─────────────────────────────────────────────────────────────────
          let sectionPlan: SectionPlan | null = null;
          let plannedSlideCount = 1;

          if (capturedToolCall && capturedToolCall.isInProcess === false) {
            const tc = capturedToolCall as CubeSqlApiToolCall;
            const input: MetaComposerInput = {
              userQuestion: question,
              cubeMeta: {
                queryTitle: tc.input.queryTitle ?? "",
                description: tc.input.description ?? "",
                commentary: capturedCommentary || raw,
                chartCategory: tc.input.chartCategory,
              },
              signal: controller.signal,
            };
            try {
              sectionPlan = await new Promise<SectionPlan>((resolve, reject) => {
                let settled = false;
                planSection(input, {
                  onPartialPlan: () => {
                    /* wave-7 ChatPanel scope: final-only */
                  },
                  onFinal: (p) => {
                    if (!settled) {
                      settled = true;
                      resolve(p);
                    }
                  },
                  onError: (e) => {
                    if (!settled) {
                      settled = true;
                      reject(e);
                    }
                  },
                });
              });
              plannedSlideCount = sectionPlan.slides.length;
              logEvent("planSection.completed", {
                plannedSlideCount,
                sectionTitle: sectionPlan.sectionTitle,
              });
            } catch (err) {
              // Meta-composer failure → graceful degrade to single-slide.
              logEvent("planSection.failed_defaulting_single", {
                err: String(err),
              });
              sectionPlan = null;
              plannedSlideCount = 1;
            }
          }

          // ─────────────────────────────────────────────────────────────────
          // (C) Route decision. routeMessage uses sectionPlanHint (force-single
          // vs allow-multi) derived from plannedSlideCount. If it returns
          // "section-plan", we mount SectionStrip; otherwise we fall through.
          // ─────────────────────────────────────────────────────────────────
          const ctxRoute = {
            refinementChipVisible: false, // refinement short-circuit returned above
            lastSlideTitle: submitLastSlideTitle ?? undefined,
            sectionPlanHint: (plannedSlideCount > 1
              ? "allow-multi"
              : "force-single") as "force-single" | "allow-multi",
          };
          const route: MessageRoute = routeMessage(
            { toolCall: capturedToolCall },
            ctxRoute
          );

          if (
            route === "section-plan" &&
            capturedToolCall &&
            sectionPlan
          ) {
            // Multi-slide path: fetch Cube data once, mount SectionStrip.
            const tc = capturedToolCall as CubeSqlApiToolCall;
            try {
              const cubeQuery = translateSql(tc.input.sqlQuery);
              const cubeResp = await loadCubeData(cubeQuery, {
                signal: controller.signal,
              });
              setSectionBuild({
                messageIndex: newMsgIdx,
                input: {
                  userQuestion: question,
                  toolCall: tc,
                  cubeRows: cubeResp.data,
                  commentary: capturedCommentary || raw,
                },
              });
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              setMessages((prev) => [
                ...prev,
                {
                  role: "error",
                  content: `Couldn't fetch section data: ${msg}`,
                },
              ]);
            }
            return;
          }

          // ─────────────────────────────────────────────────────────────────
          // (D) new-composition + narrative: existing Plan 06-06 / Phase 5
          // behavior — message sits idle until the user clicks Create Slide,
          // OR narrative renders plain assistant text.
          // ─────────────────────────────────────────────────────────────────
        },
        onError: (error: CubeAIError) => {
          setMessages((prev) => [...prev, { role: "error", content: error.message, error }]);
          setStreamingContent("");
          setPhase(null);
        },
      });

      controllerRef.current = controller;
    },
    [phase, chatId, chipVisible, lastSlideTitle, runCompositionForRefinement]
  );

  const handleStopQuery = useCallback(() => {
    controllerRef.current?.abort();
    setPhase(null);
    setStreamingContent("");
  }, []);

  const handleRetry = useCallback(() => {
    if (lastQuestion) handleSubmit(lastQuestion);
  }, [lastQuestion, handleSubmit]);

  const handleCreateSlide = useCallback(
    async (messageIndex: number) => {
      const msg = messages[messageIndex];
      if (!msg || msg.role !== "assistant" || msg.slideState !== "idle") return;

      // Phase 5 D-02: if Cube AI emitted a finalised cubeSqlApi toolCall, hand off
      // to SlidePreview (composition pipeline). SlidePreview owns the lifecycle;
      // this handler just flips slideState so the render branch mounts the preview.
      if (routeCreateSlide(msg) === "composition") {
        setMessages((prev) =>
          prev.map((m, i) =>
            i === messageIndex
              ? { ...m, slideState: "fetching-data" as const }
              : m
          )
        );
        return;
      }

      // Legacy narrative path — unchanged.
      setMessages((prev) =>
        prev.map((m, i) =>
          i === messageIndex ? { ...m, slideState: "creating" as const } : m
        )
      );

      try {
        const sourceText = msg.rawContent || msg.content;
        const content =
          extractSlideContent(sourceText) ?? fallbackToTextOnly(sourceText);
        await insertSlide(content);
        // ── Insertion site #3 (narrative path) — write lastBuildRef.
        const slideId = await captureInsertedSlideId();
        const titleFromContent = (content as { title?: string }).title ?? "Your slide";
        lastBuildRef.current = {
          slideId,
          toolCall:
            msg.toolCall ??
            ({
              name: "cubeSqlApi",
              isInProcess: false,
              input: {
                sqlQuery: "",
                queryTitle: titleFromContent,
                description: "",
                chartCategory: "table",
              },
            } as unknown as CubeSqlApiToolCall),
          rows: [],
          commentary: msg.commentary ?? "",
          userQuestion: findLastUserQuestion(messageIndex) || msg.content,
          title: titleFromContent,
          createdAtMs: Date.now(),
          chatId,
        };
        setLastSlideTitle(titleFromContent);
        setLastSlideCreatedAtMs(Date.now());
        setMessages((prev) =>
          prev.map((m, i) =>
            i === messageIndex ? { ...m, slideState: "created" as const } : m
          )
        );
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        setMessages((prev) =>
          prev.map((m, i) =>
            i === messageIndex
              ? {
                  ...m,
                  slideState: "failed" as const,
                  error: {
                    message: errMsg,
                    type: "unknown" as const,
                    retryable: false,
                  },
                }
              : m
          )
        );
      }
    },
    [messages, chatId, findLastUserQuestion]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape" && chipVisible) {
        e.preventDefault();
        setChipDismissed(true);
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit(query.trim());
      }
    },
    [chipVisible, query, handleSubmit]
  );

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
        {/* Welcome state — heading/body preserved; suggestion-button block deleted (Phase 6 D-12). */}
        {messages.length === 0 && !phase && (
          <div style={{ textAlign: "center", marginTop: "40px", padding: "0 12px" }}>
            <Text weight="semibold" size={400} block>
              Build your presentation with Summit
            </Text>
            <Text size={300} style={{ color: "#616161", marginTop: "8px", display: "block" }}>
              Ask a question and Summit will create a data-driven slide for your deck.
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
                    borderRadius: "12px",
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
                    borderRadius: "12px",
                    maxWidth: "85%",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  <Text size={300}>{msg.content}</Text>
                </div>
                {msg.slideState === "idle" && sectionBuild?.messageIndex !== i && (
                  <Button
                    appearance="primary"
                    size="small"
                    onClick={() => handleCreateSlide(i)}
                    style={{ marginTop: "4px", backgroundColor: SUMMIT_NAVY }}
                  >
                    Create Slide
                  </Button>
                )}

                {/* Phase 6 Wave 7 D-07 — multi-slide section strip mount. When a
                    section plan returned slides.length > 1, this branch renders
                    in place of the Phase 5 SlidePreview / Create Slide button. */}
                {msg.role === "assistant" && sectionBuild?.messageIndex === i && (
                  <SectionStrip
                    input={sectionBuild.input}
                    onAllDone={() => {
                      setSectionBuild(null);
                      setMessages((prev) =>
                        prev.map((m, mi) =>
                          mi === i
                            ? { ...m, slideState: "created" as const }
                            : m
                        )
                      );
                      // Note: SectionStrip handles each inserted slide's
                      // lifecycle via the orchestrator. The orchestrator does
                      // NOT expose a per-slide post-insert hook, so Replace-
                      // after-section-build is acceptable per D-04 (which
                      // governs single-slide replace only).
                    }}
                    onPlanError={(err) => {
                      setSectionBuild(null);
                      setMessages((prev) =>
                        prev.map((m, mi) =>
                          mi === i
                            ? {
                                ...m,
                                slideState: "failed" as const,
                                error: {
                                  message: err.message,
                                  type: "unknown",
                                  retryable: false,
                                },
                              }
                            : m
                        )
                      );
                    }}
                  />
                )}

                {/* Phase 6 refinement render branch — SlidePreview skipAutoStart so
                    runCompositionForRefinement is the SOLE composition driver (no double
                    composition). The chooser appears once awaitingChoiceFor is wired. */}
                {msg.isRefinement && msg.toolCall && (
                  <SlidePreview
                    toolCall={msg.toolCall}
                    userQuestion={findLastUserQuestion(i) || msg.content}
                    commentary={msg.commentary ?? ""}
                    skipAutoStart
                    onStageChange={() => {}}
                    onSuccess={() => {}}
                    onError={() => {}}
                    awaitingChoice={
                      awaitingChoiceFor?.messageIndex === i
                        ? {
                            onReplace: awaitingChoiceFor.onReplace,
                            onInsertNew: awaitingChoiceFor.onInsertNew,
                          }
                        : undefined
                    }
                  />
                )}

                {/* Phase 5 self-driving SlidePreview — UNCHANGED for new-composition path.
                    Suppressed when this message is being driven by SectionStrip (Wave 7). */}
                {!msg.isRefinement &&
                  sectionBuild?.messageIndex !== i &&
                  (msg.slideState === "fetching-data" ||
                    msg.slideState === "composing" ||
                    msg.slideState === "rendering") &&
                  msg.toolCall && (
                    <SlidePreview
                      toolCall={msg.toolCall}
                      userQuestion={findLastUserQuestion(i) || msg.content}
                      commentary={msg.commentary ?? ""}
                      onStageChange={(s) =>
                        setMessages((prev) =>
                          prev.map((m, idx) =>
                            idx === i
                              ? { ...m, slideState: mapStageToSlideState(s) }
                              : m
                          )
                        )
                      }
                      onSuccess={async () => {
                        // ── Insertion site #1 (Phase 5 new-composition success) — write lastBuildRef.
                        setMessages((prev) =>
                          prev.map((m, idx) =>
                            idx === i
                              ? { ...m, slideState: "created" as const }
                              : m
                          )
                        );
                        if (msg.toolCall) {
                          const title =
                            msg.toolCall.input.queryTitle || "Your slide";
                          const slideId = await captureInsertedSlideId();
                          lastBuildRef.current = {
                            slideId,
                            toolCall: msg.toolCall,
                            rows: [],
                            commentary: msg.commentary ?? "",
                            userQuestion:
                              findLastUserQuestion(i) || msg.content,
                            title,
                            createdAtMs: Date.now(),
                            chatId,
                          };
                          setLastSlideTitle(title);
                          setLastSlideCreatedAtMs(Date.now());
                        }
                      }}
                      onError={() =>
                        setMessages((prev) =>
                          prev.map((m, idx) =>
                            idx === i
                              ? { ...m, slideState: "failed" as const }
                              : m
                          )
                        )
                      }
                    />
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
                      Failed to create slide{msg.error?.message ? `: ${msg.error.message}` : ""}
                    </Text>
                    <Button
                      size="small"
                      onClick={() => {
                        setMessages((prev) =>
                          prev.map((m, idx) =>
                            idx === i
                              ? { ...m, slideState: "idle" as const }
                              : m
                          )
                        );
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

        {/* Phase-based spinner with stop control */}
        {phase && phase !== "complete" && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 0" }}>
            <Spinner size="tiny" />
            <Text size={200} style={{ color: "#6B7280", flex: 1 }}>{PHASE_LABELS[phase]}</Text>
            <Button size="small" appearance="subtle" onClick={handleStopQuery}>
              Stop
            </Button>
          </div>
        )}

        {/* Auto-scroll anchor */}
        <div ref={messagesEndRef} />
      </div>

      {/* Phase 6 D-02 — Refining chip (above input). */}
      {chipVisible && lastSlideTitle && (
        <div style={{ padding: "0 8px" }}>
          <RefiningChip
            slideTitle={lastSlideTitle}
            onDismiss={() => setChipDismissed(true)}
          />
        </div>
      )}

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
          placeholder="Ask Summit..."
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
          Go
        </Button>
      </div>

      {/* Phase 6 D-12 — Suggested-questions tray (below input). Hidden during in-flight builds. */}
      <SuggestedQuestionsTray
        onSelect={(prompt) => {
          setQuery(prompt);
          handleSubmit(prompt);
        }}
        disabled={phase !== null}
      />
    </div>
  );
};

export default ChatPanel;
