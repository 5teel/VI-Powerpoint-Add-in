# Summit VI for PowerPoint

## What This Is

A Microsoft Office Web Add-in (taskpane) for PowerPoint that connects directly to Summit's Cube AI Chat API, allowing users to ask natural language business questions and have the answers rendered as fully populated PowerPoint slides — complete with text summaries, charts, and data tables. Cube AI handles insight generation and slide layout design; the plugin executes those designs as native PowerPoint elements.

## Core Value

Users can ask a business question in natural language and get a professionally laid-out PowerPoint slide populated with real data insights — no manual data pulling, no manual formatting.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Natural language question input via taskpane
- [ ] Direct API integration with Cube AI Chat API
- [ ] JSON slide schema as intermediary between Cube AI responses and PowerPoint rendering
- [ ] Slide creation with text elements (titles, bullet points, key findings)
- [ ] Native PowerPoint chart generation (bar, line, pie) from data
- [ ] Embedded image fallback for complex visualizations
- [ ] Data table rendering on slides
- [ ] Multi-turn conversation support via Cube AI chatId
- [ ] Summit VI minimal branding in taskpane UI

### Out of Scope

- Full Summit Visual Insights branding/design system — defer to post-demo
- MCP server integration (plugin calls Cube AI directly, bypassing MCP)
- Template library / pre-built report types — v2 feature
- User authentication / multi-tenant isolation — not needed for internal demo
- Deployment to Microsoft AppSource — internal sideload only for v1
- Offline mode / caching of insights

## Context

- **Existing infrastructure:** Summit Visual Insights is a proprietary data & insights database. Cube AI is an agentic model hosted on Cube Cloud (GCP US-Central1) that runs SQL against VI and returns natural language answers.
- **Cube AI Chat API:** REST endpoint at `ai.gcp-us-central1.cubecloud.dev`, authenticated via API key, returns streaming NDJSON responses with conversation threading via `chatId`.
- **Cube AI capability:** Cube AI can return structured JSON if prompted — we will define a slide layout JSON schema and instruct Cube AI to return it alongside its natural language insights.
- **Existing MCP server:** A working MCP server exists at `C:\Development\Summit MCP Server - Claude` that bridges Claude to Cube AI. The PowerPoint plugin will bypass this and call Cube AI directly since Office add-ins run in a browser sandbox and can make direct HTTPS calls.
- **Target audience:** Internal Summit analysts first, then external clients. v1 is an internal demo.

## Constraints

- **Platform:** Microsoft Office Web Add-in (Office.js) — must run in PowerPoint's taskpane sandbox (browser-based)
- **API:** Cube AI Chat API (streaming NDJSON over HTTPS, API key auth)
- **Charts:** Native PowerPoint charts via Office.js where possible, embedded images as fallback for complex visuals
- **Scope:** Internal demo — working prototype, not production-polished
- **Branding:** Minimal — "Summit VI" name only, detailed brand treatment deferred

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Build from scratch (no fork) | No existing Claude for PowerPoint plugin exists to fork | — Pending |
| Direct Cube AI API calls | Office add-ins run in browser sandbox; MCP protocol adds unnecessary complexity | — Pending |
| JSON slide schema intermediary | Cube AI returns natural language but can output structured JSON; schema ensures reliable PPT rendering | — Pending |
| Native PPT charts + image fallback | Best editing experience for users; images cover edge cases | — Pending |
| Office Web Add-in (taskpane) | Standard Microsoft approach for PPT integrations; works across desktop and web | — Pending |

---
*Last updated: 2026-03-23 after initialization*
