---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: unknown
stopped_at: Phase 7 context gathered
last_updated: "2026-04-29T11:34:21.294Z"
progress:
  total_phases: 9
  completed_phases: 7
  total_plans: 25
  completed_plans: 24
  percent: 96
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-23)

**Core value:** User types a business question, gets a professionally laid-out PowerPoint slide with real data — no manual data pulling, no manual formatting
**Current focus:** Phase 06 — polish-and-demo-readiness

## Current Position

Phase: 06 (polish-and-demo-readiness) — EXECUTING
Plan: 7 of 8

## Performance Metrics

**Velocity:**

- Total plans completed: 4
- Average duration: —
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 05 | 4 | - | - |

**Recent Trend:**

- Last 5 plans: none yet
- Trend: —

*Updated after each plan completion*
| Phase 01-foundation P01 | 8min | 2 tasks | 13 files |
| Phase 02 P01 | 4min | 2 tasks | 4 files |
| Phase 02 P02 | 3min | 2 tasks | 4 files |
| Phase 03 P01 | 4min | 2 tasks | 5 files |
| Phase 03 P02 | 8min | 2 tasks | 1 files |
| Phase 04 P01 | 3min | 2 tasks | 4 files |
| Phase 04 P02 | 2min | 1 tasks | 1 files |
| Phase 04 P02 | 2 | 2 tasks | 1 files |
| Phase 04.1 P01 | 5min | 2 tasks | 7 files |
| Phase 04.1 P02 | 3min | 2 tasks | 7 files |
| Phase 04.2 P01 | 4min | 3 tasks | 9 files |
| Phase 06 P01 | 10min | 2 tasks | 9 files |
| Phase Phase 06 PP02 | 11min | 2 tasks | 9 files |
| Phase Phase 06 PP03 | 8min | 1 tasks | 2 files |
| Phase 06 P04 | 7min | 2 tasks | 6 files |
| Phase 06 P06 | 7min | 1 tasks | 1 files |
| Phase 06 P06 | 37min | 1 tasks | 1 files |
| Phase Phase 06 PP07 | 108min | 2 tasks tasks | 3 files files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- All phases: No chart API in Office.js — all charts are canvas-to-image (Chart.js → ShapeFill.setImage)
- Phase 1: CORS validation is day-one gate — if Cube AI blocks WebView2 origin, a proxy server must be scoped before Phase 3
- Phase 4: Cube AI response format must be observed empirically before finalizing SlideLayout schema parser
- Phase 5: ShapeFill.setImage() is GA primary path; addPicture() is Preview enhancement only
- [Phase 01-foundation]: Used yo office plain TS template + manual React setup (generator --framework react flag non-functional in v3.0.2)
- [Phase 01-foundation]: Babel preset-react with automatic JSX runtime for cleaner component files
- [Phase 02]: Used as const assertions for immutable layout/color/font constants
- [Phase 02]: Callout box renders as two independent shapes without grouping (Pitfall 5)
- [Phase 02]: Used specificCellProperties (API 1.8) for table formatting — style requires API 1.9
- [Phase 02]: PREVIEW API runtime check via isSetSupported for slide insertion index, GA fallback appends to end
- [Phase 03]: Callback-based streaming over async iterators for simpler 200ms throttle integration
- [Phase 03]: Removed testCubeAIConnection entirely -- streamCubeAI serves all use cases
- [Phase 03]: Used internalId instead of externalId for Cube Cloud internal user authentication
- [Phase 03]: Added JSON-RPC error handling in NDJSON parser for malformed stream events
- [Phase 04]: 3-stage JSON extraction: direct parse, markdown fence regex, brace substring
- [Phase 04]: Always delete chartImageBase64 from parsed output (Pitfall 3)
- [Phase 04]: Per-message slideState field for independent Create Slide button lifecycle tracking
- [Phase 04]: Per-message slideState field ('idle'|'creating'|'created'|'failed') tracks Create Slide button lifecycle independently per message — prevents duplicate slide creation without any global lock
- [Phase 04]: Wrapped question (buildSlidePrompt) sent to Cube AI; original question stored in messages state — schema injection is transparent to the chat UI
- [Phase 04.1]: IMAGE_REGION reuses CHART_TEXT.CHART position for layout consistency
- [Phase 04.1]: Used vi.stubGlobal for FileReader/Image mocking in node test environment
- [Phase 04.1]: display:none pattern for tab switching preserves wizard state without lifting state to App
- [Phase 04.2]: DefinePlugin with JSON.stringify for build-time config injection replacing hardcoded secrets
- [Phase 04.2]: npm ci --ignore-scripts in Docker to avoid sharp native module build errors on Alpine
- [Phase 04.2]: envsubst at container CMD time for Railway dynamic PORT injection
- [Phase 06]: Staleness penalty (-1) in refinementDetector when no recent slide — encodes 'cannot refine what does not exist'
- [Phase 06]: Retry-After header wins over exponential backoff with NO jitter applied — server directives authoritative
- [Phase 06]: validateConfigInternal dual-export pattern: pure fn for fixture tests + module-scope wrapper for App.tsx mount
- [Phase 06]: routeMessage precedence: narrative > section-plan > refinement > new-composition (section-plan beats refinement when both set)
- [Phase 06]: Classifier fallback returns cube-ai+composer (safer route) — preserves Cube AI chatId context vs shipping stale data
- [Phase 06]: 429 retry wrapper applied ONLY to first attempt — G1/G2 repair-hint retries are orthogonal (correctness, not rate-limit) and must not compound
- [Phase 06]: Meta-composer uses messages.stream (not create) so orchestrator can mount slides[0] SlidePreview the instant partial.slides[0] arrives
- [Phase 06]: ComposerCallbacks.onRateLimitRetry is optional — backward-compatible with all existing call sites (SlidePreview, WizardPanel, tests)
- [Phase 06]: OrderedInsertionMutex (pre-chained slots) over FIFO SerialMutex — preserves plan order when concurrency>1 causes out-of-order composition finish
- [Phase 06]: Orchestrator uses ComposedSlideContent shape from SlidePreview.tsx (title/subtitle/commentary/regions + buildComposedTableSpec) — plan sketch had wrong shape
- [Phase 06]: enteredMutex tracking + insertionMutex.skip(idx) on bail-out — prevents deadlock when a slide aborts/errors before calling mutex.run
- [Phase 06]: CONCURRENCY_CAP=2 Semaphore gates composeWithRetry — keeps 6-slide section under Anthropic Tier-1 50 RPM even with retry escalation
- [Phase 06]: Hard clamp plan.slides.slice(0, 6) post-Zod — defense-in-depth for Pitfall 3 (forced tool_choice occasionally bypasses schema)
- [Phase 06]: SetupRequired keeps Header visible + renders all 4 credential rows with green borders for present, red for missing — positive feedback reduces setup-screen anxiety
- [Phase 06]: Railway detection = hostname.includes('railway') || hostname.includes('.up.railway.app') — covers preview + custom domains; non-Railway falls through to local .env variant
- [Phase 06]: ReplaceOrAddChooser Esc routes to onInsertNew (safer non-destructive) not onReplace — Enter already covers the destructive happy path
- [Phase 06]: ElapsedTimeCounter owns its own setInterval — isolated child prevents 1Hz tick re-renders from propagating to parent SlidePreview's canvas + shimmer (06-RESEARCH Pattern 9)
- [Phase 06]: ChatPanel refinement pipeline uses skipAutoStart=true on SlidePreview to delegate composition to runCompositionForRefinement — eliminates double-composition class of bug
- [Phase 06]: D-04 honest Replace via Office.js slide-id capture (presentation.getSelectedSlides + load('id') AFTER insertSlide) and slide.delete() — null-id failure path falls through to insert-as-new for graceful degrade (T-06-31)
- [Phase 06]: lastBuildRef hydrated at ALL insertion success sites (Phase 5 SlidePreview.onSuccess, composer-only refinement, cube-ai+composer refinement, narrative handleCreateSlide) — single source of truth for prior-slide context
- [Phase 06]: Snapshot isRefinementFlow + submitLastSlideTitle at submit time (not lookup at onComplete time) — debounce/state races between submit and async onComplete cannot flip routing decision mid-flight
- [Phase 06]: planSection callback-adapter Promise wrapper (mirrors sectionOrchestrator.ts) for D-05 literal — refinement short-circuit AT TOP of onComplete preserves Plan 06-06 behavior
- [Phase 06]: Branch decision uses sectionPlan.slides.length (NOT slideCount field — does not exist on SectionPlanSchema)
- [Phase 06]: Wizard inherits D-01 through D-04 (D-16) — WizardRefineSection implements BOTH classifier branches (composer-only + cube-ai+composer); ZERO SectionStrip/planSection/SuggestedQuestionsTray refs in Wizard surfaces
- [Phase 06]: WizardRefineSection narrative-build defensive fallback — composer-only is impossible without cached toolCall, so narrative prior auto-routes through cube-ai+composer

### Roadmap Evolution

- Phase 4.1 inserted after Phase 4: Guided Slide Builder — step-by-step wizard with brand selection, image upload, analysis purpose, slide design approval (INSERTED)
- Phase 7 added 2026-04-29 (during Phase 6 Wave 8 UAT): Conversational Routing & Response Taxonomy — judgement layer that classifies every assistant turn (clarify / data / modify / variant / section / refuse) and routes to the right pipeline. Resolves the Wave 8 UAT gap where the addin treats agent responses as binary (toolCall vs no toolCall). Phase 6 Wave 8 UAT deferred until Phase 7 lands.

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 1: CORS behavior for ai.gcp-us-central1.cubecloud.dev from WebView2 origin is unverified — proxy server may be required
- Phase 4: Cube AI prompt engineering for structured JSON output will require empirical tuning (1-2 days estimated)
- General: Target users must be on Microsoft 365 subscription builds (PowerPointApi 1.8 requirement excludes LTSC/volume-licensed Office)

## Session Continuity

Last session: --stopped-at
Stopped at: Phase 7 context gathered
Resume file: --resume-file

**Planned Phase:** 6 (Polish and Demo Readiness) — 8 plans — 2026-04-24T05:52:40.645Z
