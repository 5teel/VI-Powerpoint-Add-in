# Phase 1: Foundation - Context

**Gathered:** 2026-03-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Scaffold a working Office Web Add-in (taskpane) for PowerPoint using the official Yeoman generator, load it via sideload, display Summit VI branding, and prove connectivity to the Cube AI Chat API. CORS validation is the day-one gate — if it fails, scope a REST proxy endpoint on the existing MCP server before proceeding.

</domain>

<decisions>
## Implementation Decisions

### Taskpane UI Shell
- **D-01:** Chat-style layout — message input at bottom, response/output area above. Familiar AI chat pattern (like Copilot sidebar).
- **D-02:** Summit logo + name header at the top of the taskpane. Logo asset provided (mountain/chart mark wordmark). Include as PNG/SVG asset.
- **D-03:** Primary brand color is `#0F1330` (dark navy). Use as header background and accent color. Keep the rest of the palette neutral/clean for the demo.

### Cube AI Connectivity
- **D-04:** API key stored in a hardcoded config file (e.g., `config.ts` or `.env`) — simplest approach for internal demo. Not exposed to end users. Will be replaced with proper auth for client-facing release.
- **D-05:** CORS must be tested on day one before investing in scaffold work. Minimal fetch call to `ai.gcp-us-central1.cubecloud.dev` from an Office WebView2 context to confirm or deny CORS access.

### CORS Fallback
- **D-06:** If CORS fails (Cube AI endpoint doesn't return appropriate headers for Office WebView2 origin), the fallback is to add a REST endpoint to the existing MCP server at `C:\Development\Summit MCP Server - Claude`. This server already has the Cube AI client code, auth, and streaming logic — avoids building a new proxy service.

### Dev Environment
- **D-07:** React 18 + Fluent UI v9 for the taskpane UI. Standard Microsoft recommendation for Office add-ins. Provides component library and chat UI building blocks.
- **D-08:** Scaffold via Microsoft's official Yeoman generator (`yo office`). Generates manifest (XML, not JSON unified — JSON is still preview), webpack config, HTTPS dev certs, and project structure.

### Claude's Discretion
- Connectivity test display format — Claude decides whether to show raw response, formatted preview, or status indicator when Cube AI responds successfully. Pick whatever best demonstrates the connection is working.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Cube AI Integration
- `.planning/research/STACK.md` — Technology stack recommendations including Office.js API surface, PptxGenJS, and Fluent UI v9
- `.planning/research/ARCHITECTURE.md` — Component boundaries, data flow, and Office.js API capabilities
- `.planning/research/PITFALLS.md` — 14 domain-specific pitfalls including CORS, NDJSON buffering, and API limitations

### Existing MCP Server (CORS fallback reference)
- `C:\Development\Summit MCP Server - Claude\src\cubeai.ts` — Cube AI streaming client implementation (request format, NDJSON parsing, auth)
- `C:\Development\Summit MCP Server - Claude\src\config.ts` — Cube AI API configuration (base URL, API key, timeout, external ID)
- `C:\Development\Summit MCP Server - Claude\.env.example` — Required environment variables for Cube AI connectivity

### Project Context
- `.planning/PROJECT.md` — Project vision, constraints, key decisions
- `.planning/REQUIREMENTS.md` — v1 requirements with phase traceability

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Cube AI client** (`C:\Development\Summit MCP Server - Claude\src\cubeai.ts`): Complete streaming NDJSON client with line buffering, chatId extraction, and timeout handling. Can be referenced or adapted for the add-in's direct API calls (or used as-is if CORS fallback is needed).
- **Config pattern** (`C:\Development\Summit MCP Server - Claude\src\config.ts`): Environment variable validation pattern for Cube AI credentials.

### Established Patterns
- Cube AI Chat API: POST to base URL with `{ input, sessionSettings: { externalId, chatId? } }`, authenticated via `Api-Key` header. Streams NDJSON with delta messages, state messages (chatId), and final complete message.

### Integration Points
- If CORS fallback: MCP server at `C:\Development\Summit MCP Server - Claude` needs a new REST endpoint (bypassing MCP protocol) that the Office add-in can call via simple fetch.

</code_context>

<specifics>
## Specific Ideas

- Summit logo provided as image — mountain/chart silhouette with "summit" wordmark in `#0F1330` navy. Must be included in the add-in assets directory.
- Chat-style UI should feel similar to the Copilot sidebar in Office apps — users will have that mental model.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-foundation*
*Context gathered: 2026-03-23*
