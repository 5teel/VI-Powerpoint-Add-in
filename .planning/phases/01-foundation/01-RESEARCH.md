# Phase 1: Foundation - Research

**Researched:** 2026-03-23
**Domain:** Office Web Add-in scaffolding, taskpane UI, Cube AI API connectivity
**Confidence:** HIGH

## Summary

Phase 1 scaffolds a working Office Web Add-in for PowerPoint using the Yeoman generator with the React TypeScript template, establishes Summit VI branding in the taskpane, and validates connectivity to the Cube AI Chat API. The critical gate is CORS: the add-in runs inside PowerPoint's WebView2 sandbox (on Windows desktop) or an iframe (on the web), and the Cube AI endpoint at `ai.gcp-us-central1.cubecloud.dev` must return appropriate `Access-Control-Allow-Origin` headers for the add-in's origin. If CORS fails, a REST proxy endpoint on the existing MCP server is the fallback.

The `yo office` generator provides a React + TypeScript template that scaffolds manifest.xml, Webpack 5, HTTPS dev certs, and sideloading tooling. Fluent UI v9 (`@fluentui/react-components`) is the standard UI library for Office add-ins and provides components for the chat-style layout. The project structure, build pipeline, and sideloading flow are well-documented and stable.

**Primary recommendation:** Use `yo office` with the "Office Add-in Task Pane project using React framework" template for PowerPoint, then customize the scaffold with Fluent UI v9 components, Summit VI branding, and a minimal Cube AI fetch test. Test CORS before investing in UI polish.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Chat-style layout -- message input at bottom, response/output area above. Familiar AI chat pattern (like Copilot sidebar).
- **D-02:** Summit logo + name header at the top of the taskpane. Logo asset provided (mountain/chart mark wordmark). Include as PNG/SVG asset.
- **D-03:** Primary brand color is `#0F1330` (dark navy). Use as header background and accent color. Keep the rest of the palette neutral/clean for the demo.
- **D-04:** API key stored in a hardcoded config file (e.g., `config.ts` or `.env`) -- simplest approach for internal demo. Not exposed to end users. Will be replaced with proper auth for client-facing release.
- **D-05:** CORS must be tested on day one before investing in scaffold work. Minimal fetch call to `ai.gcp-us-central1.cubecloud.dev` from an Office WebView2 context to confirm or deny CORS access.
- **D-06:** If CORS fails (Cube AI endpoint doesn't return appropriate headers for Office WebView2 origin), the fallback is to add a REST endpoint to the existing MCP server at `C:\Development\Summit MCP Server - Claude`. This server already has the Cube AI client code, auth, and streaming logic -- avoids building a new proxy service.
- **D-07:** React 18 + Fluent UI v9 for the taskpane UI. Standard Microsoft recommendation for Office add-ins.
- **D-08:** Scaffold via Microsoft's official Yeoman generator (`yo office`). Generates manifest (XML, not JSON unified -- JSON is still preview), webpack config, HTTPS dev certs, and project structure.

### Claude's Discretion
- Connectivity test display format -- Claude decides whether to show raw response, formatted preview, or status indicator when Cube AI responds successfully. Pick whatever best demonstrates the connection is working.

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BRND-01 | Taskpane displays "Summit VI" branding (name, minimal styling) | Fluent UI v9 provides theming tokens and layout components. Summit logo (PNG) exists at project root. Header with `#0F1330` background, logo, and name text. |
| TASK-02 | User sees loading/progress indication while Cube AI processes (3-15s) | Fluent UI v9 `Spinner` component. Phase 1 scope is proving API connectivity; a basic spinner during the test fetch satisfies this requirement at foundation level. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 18.3.1 | Taskpane UI framework | Fluent UI v9 built on React. `yo office` React template uses React 18. Do NOT use React 19 -- Fluent UI v9 has not validated against it. |
| react-dom | 18.3.1 | React DOM renderer | Paired with React 18. |
| @fluentui/react-components | 9.73.4 | Taskpane UI components (Fluent UI v9) | Microsoft's official design system for Office add-ins. Tree-shakeable. Provides Button, Input, Spinner, Card, tokens for theming. |
| TypeScript | ~5.4 (from yo office scaffold) | Type safety | Office.js type definitions are TypeScript-first. Scaffold pins version. |
| Webpack | 5.x (from yo office scaffold) | Module bundling | Scaffold provides Webpack 5 config with HtmlWebpackPlugin, HTTPS, and Office.js integration. Do NOT use Vite. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| office-js | CDN (not npm) | Office JavaScript API | Loaded via `<script>` tag from `https://appsource.microsoft.com/lib/office/office.js`. Never bundled. |
| @types/office-js | latest | TypeScript types for Office.js | Dev dependency for IntelliSense and compile-time checking. |
| office-addin-dev-certs | latest | Dev SSL certificates | Generates trusted self-signed certs for local HTTPS. Included by `yo office`. |
| office-addin-debugging | latest | Sideloading utilities | Handles sideloading the add-in into PowerPoint for testing. Included by `yo office`. |
| webpack-dev-server | 4.x or 5.x | Local HTTPS dev server | Pre-configured by scaffold for Office add-in HTTPS requirements. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Webpack 5 | Vite | Vite is not officially supported by Office add-in tooling. Generator and debugging tools assume Webpack. Not worth fighting for an internal demo. |
| Fluent UI v9 | Fluent UI v8 | v8 is in maintenance mode. v9 is actively developed with better tree-shaking. Microsoft recommends v9 for new projects. |
| React 18 | React 19 | React 19 is latest (19.2.4) but Fluent UI v9 has not validated against it. Risk of subtle breakage. |
| yo office scaffold | Manual setup | yo office generates manifest, webpack config, HTTPS certs, sideloading scripts. Manual setup would replicate all of this. |

**Installation:**
```bash
# Install Yeoman and generator globally (yo is not currently installed)
npm install -g yo generator-office

# Scaffold the project
yo office
# Choose: "Office Add-in Task Pane project using React framework"
# Choose: TypeScript
# Choose: PowerPoint
# Name: "Summit VI"

# After scaffold, pin React 18 (generator may install latest)
npm install react@18.3.1 react-dom@18.3.1

# Add Fluent UI v9 (if not already included by scaffold)
npm install @fluentui/react-components@9.73.4
```

**Version verification:** Verified against npm registry on 2026-03-23:
- react@18.3.1 (latest React 18.x)
- react-dom@18.3.1 (latest React DOM 18.x)
- @fluentui/react-components@9.73.4 (latest Fluent UI v9)
- generator-office@3.0.2 (latest)

## Architecture Patterns

### Recommended Project Structure (post-scaffold)
```
summit-vi/                    # or project root after yo office
├── manifest.xml              # Office add-in XML manifest (not JSON unified)
├── package.json
├── tsconfig.json
├── webpack.config.js         # Pre-configured by yo office
├── .env                      # Cube AI API key + config (gitignored)
├── src/
│   ├── taskpane/
│   │   ├── taskpane.html     # Entry HTML (loads Office.js CDN script)
│   │   ├── index.tsx         # React root + FluentProvider + Office.onReady
│   │   ├── components/
│   │   │   ├── App.tsx           # Main app shell
│   │   │   ├── Header.tsx        # Summit VI branded header
│   │   │   ├── ChatPanel.tsx     # Chat-style message area
│   │   │   └── ConnectivityTest.tsx  # Cube AI API test display
│   │   └── services/
│   │       └── cubeai.ts     # Cube AI API client (fetch + NDJSON parsing)
│   └── config.ts             # API configuration (reads from .env or hardcoded)
└── assets/
    └── summit-logo.png       # Summit VI logo (already exists at project root)
```

### Pattern 1: Office.onReady Initialization
**What:** All Office.js code must wait for the `Office.onReady()` callback before accessing Office APIs. The React app should not render until Office is ready.
**When:** App startup -- this is the very first thing that runs.
**Example:**
```typescript
// Source: Microsoft Learn - Office Add-ins quickstart
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { createRoot } from "react-dom/client";
import App from "./components/App";

Office.onReady((info) => {
  if (info.host === Office.HostType.PowerPoint) {
    const root = createRoot(document.getElementById("container")!);
    root.render(
      <FluentProvider theme={webLightTheme}>
        <App />
      </FluentProvider>
    );
  }
});
```

### Pattern 2: CORS Test-First Approach
**What:** Before building any UI beyond the shell, make a minimal fetch to the Cube AI endpoint and observe the result in the browser console / taskpane.
**When:** Day one, first task after scaffold loads.
**Example:**
```typescript
// Minimal CORS test -- run this from within the Office add-in taskpane
async function testCubeAICORS(): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch("https://ai.gcp-us-central1.cubecloud.dev/api/v1/public/summitinsights/agents/11/chat/stream-chat-state", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Api-Key YOUR_KEY_HERE",
      },
      body: JSON.stringify({
        input: "What is 1+1?",
        sessionSettings: { externalId: "cors-test@summit.com" },
      }),
    });
    // If we get here without a CORS error, CORS is working
    return { success: response.ok, error: response.ok ? undefined : `HTTP ${response.status}` };
  } catch (err) {
    // TypeError: Failed to fetch -- likely CORS
    return { success: false, error: String(err) };
  }
}
```

### Pattern 3: Cube AI NDJSON Streaming Client
**What:** The existing MCP server at `C:\Development\Summit MCP Server - Claude\src\cubeai.ts` contains a complete, tested NDJSON streaming client. Adapt this pattern for the browser context.
**When:** After CORS is confirmed working.
**Key adaptation notes:**
- The MCP server uses Node.js `fetch` -- the browser `fetch` API is identical for this use case
- The line-buffering pattern (`buffer.split('\n')`, keep last incomplete line) is correct and should be reused
- Message structure: `{ role: "assistant", content: "...", isDelta: true/false, isInProcess: true/false }` for content, `{ state: { chatId: "..." } }` for session state
- The `Authorization: Api-Key <key>` header format is required
- Request body: `{ input: <question>, sessionSettings: { externalId: <email>, chatId?: <id> } }`

### Pattern 4: Fluent UI v9 Theming with Custom Brand Color
**What:** Fluent UI v9 supports custom themes via `createDarkTheme` / `createLightTheme` with brand color ramps.
**When:** To apply Summit VI `#0F1330` navy as the brand color.
**Example:**
```typescript
import {
  FluentProvider,
  webLightTheme,
  tokens
} from "@fluentui/react-components";

// For the header, use inline styles or a CSS class with the brand color
const SUMMIT_NAVY = "#0F1330";

// The header component uses the brand color directly
// Fluent UI theming is used for the rest of the UI
```

### Anti-Patterns to Avoid
- **Bundling office-js via npm:** Office.js MUST be loaded via CDN `<script>` tag in the HTML file. Never `npm install office-js` and import it.
- **Using React 19:** Fluent UI v9 has not validated React 19 compatibility. Stick to React 18.3.1.
- **Using JSON unified manifest:** JSON manifests for PowerPoint add-ins are still in public developer preview. Use the stable XML manifest format.
- **Skipping CORS test:** Do not invest time in UI polish before confirming the Cube AI endpoint is accessible from the WebView2 sandbox.
- **Storing API keys in source code committed to git:** Use `.env` file (gitignored) or a separate `config.ts` that reads from environment. For the internal demo, hardcoding is acceptable but the file should be gitignored.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Office add-in project setup | Manual webpack/manifest/cert config | `yo office` generator | Generates manifest, webpack, HTTPS certs, sideloading scripts. Dozens of config details. |
| HTTPS dev certificates | Self-signed cert generation | `office-addin-dev-certs` (included in scaffold) | Handles trust store registration on Windows/Mac. Manual certs are painful. |
| UI component library | Custom buttons, inputs, spinners | `@fluentui/react-components` (Fluent UI v9) | Office-native look and feel. Accessible. Themed. Maintained by Microsoft. |
| NDJSON line buffering | Naive split-on-newline | Adapt pattern from existing MCP server `cubeai.ts` | Chunk boundary handling is deceptively tricky. The MCP server code is tested and correct. |
| Sideloading | Manual manifest registration | `npm start` from yo office scaffold | Handles registry entries, browser launch, add-in registration automatically. |

**Key insight:** The `yo office` generator eliminates the most error-prone part of Office add-in development -- the initial project configuration. Fighting the generator's choices (e.g., using Vite instead of Webpack) creates more problems than it solves for an internal demo.

## Common Pitfalls

### Pitfall 1: CORS Failure from WebView2 Origin
**What goes wrong:** The Office add-in runs inside WebView2 (Edge-based) on Windows desktop. The origin of the add-in is `https://localhost:3000` (or whatever port webpack-dev-server uses). If the Cube AI endpoint does not include this origin (or `*`) in its `Access-Control-Allow-Origin` response header, all fetch calls fail silently with a `TypeError: Failed to fetch`.
**Why it happens:** The Cube AI endpoint is a third-party hosted service. Its CORS configuration is unknown and outside our control. Office add-ins running on the web client have a different origin (the add-in's hosted URL) than those running on desktop (localhost during dev).
**How to avoid:** Test CORS as the very first task. Make a minimal POST to the Cube AI endpoint from within the loaded add-in taskpane. Check the browser developer tools (F12 in PowerPoint desktop opens DevTools for WebView2) for CORS errors. If CORS fails, switch to the proxy fallback (D-06).
**Warning signs:** `TypeError: Failed to fetch` in console with no response body. Network tab shows the request was made but no response headers are visible.

### Pitfall 2: yo office Generator Not Installed Globally
**What goes wrong:** Running `yo office` fails because neither `yo` nor `generator-office` are installed globally on this machine.
**Why it happens:** This is a fresh development environment. The `yo` command is not found in PATH, and `generator-office` is not in the global npm modules.
**How to avoid:** Run `npm install -g yo generator-office` before attempting to scaffold. Verified: `yo` is NOT currently installed; `generator-office` is NOT in global npm modules.
**Warning signs:** `yo: command not found` or `Error: generator-office not found`.

### Pitfall 3: React Version Mismatch
**What goes wrong:** The `yo office` React template may install the latest React (currently 19.2.4) rather than React 18. Fluent UI v9 has not validated React 19 support, leading to subtle rendering bugs or console warnings.
**Why it happens:** The generator's `package.json` template may specify `^18.0.0` (which resolves to 18.x) or it may specify `react` without a version constraint.
**How to avoid:** After scaffolding, immediately verify React version in `package.json`. If React 19 was installed, downgrade: `npm install react@18.3.1 react-dom@18.3.1`.
**Warning signs:** `package.json` shows `react: "^19.0.0"` or `react: "19.x.x"`.

### Pitfall 4: WebView2 Loopback Exemption on First Run
**What goes wrong:** On first Office add-in development on a machine, WebView2 cannot connect to `localhost` without a loopback exemption. The add-in fails to load with a "cannot open add-in from localhost" error.
**Why it happens:** Windows network isolation blocks loopback connections to WebView2 by default.
**How to avoid:** When prompted during `npm start`, enter `Y` to allow the loopback exemption. Administrator privileges are required. This is a one-time setup.
**Warning signs:** Add-in shows blank white pane or "We can't open this add-in from localhost" error.

### Pitfall 5: Office.js CDN Loading Failure
**What goes wrong:** The `<script src="https://appsource.microsoft.com/lib/office/office.js">` tag in `taskpane.html` fails to load, causing `Office.onReady()` to never fire and the React app to never render.
**Why it happens:** Network issues, corporate proxy blocking the CDN, or the script tag being removed/modified during customization.
**How to avoid:** Never remove or modify the Office.js CDN script tag. Verify it is present in `taskpane.html` after any modifications. Add a visible error state if `Office.onReady()` doesn't fire within 10 seconds.
**Warning signs:** Blank taskpane with no content rendered.

## Code Examples

### Cube AI API Request Format
```typescript
// Source: C:\Development\Summit MCP Server - Claude\src\cubeai.ts (verified)
// Request format for Cube AI Chat API
const response = await fetch(CUBEAI_BASE_URL, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Api-Key ${CUBEAI_API_KEY}`,
  },
  body: JSON.stringify({
    input: userQuestion,
    sessionSettings: {
      externalId: "user@summit.com",  // Required: email for session ID
      // chatId: "abc123",            // Optional: for multi-turn conversation
    },
  }),
});
```

### NDJSON Response Message Types
```typescript
// Source: C:\Development\Summit MCP Server - Claude\src\cubeai.ts (verified)
// Three message types in the NDJSON stream:

// 1. Delta message (streaming partial content)
{ "role": "assistant", "content": "partial text...", "isDelta": true, "isInProcess": true }

// 2. State message (contains chatId for conversation threading)
{ "state": { "chatId": "some-uuid" } }

// 3. Final message (complete response, not a delta)
{ "role": "assistant", "content": "full response text", "isDelta": false, "isInProcess": false }
```

### Cube AI Configuration Values
```typescript
// Source: C:\Development\Summit MCP Server - Claude\.env.example (verified)
// Required configuration for Cube AI connectivity:
const CUBEAI_BASE_URL = "https://ai.gcp-us-central1.cubecloud.dev/api/v1/public/summitinsights/agents/11/chat/stream-chat-state";
const CUBEAI_EXTERNAL_ID = "user-email@summit.com";
const CUBEAI_TIMEOUT_MS = 180000; // 3 minutes default
// API key: obtained from Cube Cloud Admin > Agents > API Key
```

### Office Add-in Manifest Minimum Requirement Set
```xml
<!-- Source: Microsoft Learn - PowerPoint API requirement sets -->
<!-- In manifest.xml, declare minimum requirement set for Phase 1 -->
<!-- Phase 1 only needs basic taskpane -- no specific PowerPointApi requirement set needed -->
<!-- Later phases will need PowerPointApi 1.8 for tables, image fills -->
<Requirements>
  <Sets DefaultMinVersion="1.1">
    <Set Name="PowerPointApi" MinVersion="1.1" />
  </Sets>
</Requirements>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Fluent UI v8 (`@fluentui/react`) | Fluent UI v9 (`@fluentui/react-components`) | 2023+ | v9 is actively developed; v8 is maintenance-only. Use v9 for new projects. |
| JSON unified manifest | XML manifest (for PowerPoint) | Ongoing | JSON manifest for PowerPoint add-ins is still in public developer preview as of Dec 2025. Use XML. |
| `generator-office` v2.x | `generator-office` v3.0.2 | 2025 | v3 supports unified manifest preview. XML manifest path remains stable. |
| Fabric React | Fluent UI v9 | 2022+ | Office UI Fabric was renamed/evolved into Fluent UI. v9 is the current generation. |

**Deprecated/outdated:**
- `office-ui-fabric-react`: Replaced by `@fluentui/react` (v8), then by `@fluentui/react-components` (v9). Do not use.
- JSON unified manifest for PowerPoint: Preview only. Do not use in production or demo.

## Open Questions

1. **CORS Behavior of Cube AI Endpoint**
   - What we know: The endpoint is `https://ai.gcp-us-central1.cubecloud.dev/...`. It is a Cube Cloud hosted service. CORS headers are set server-side and cannot be modified by us.
   - What's unclear: Whether the endpoint returns `Access-Control-Allow-Origin: *` or specific allowed origins. Whether it allows the `Authorization` header in preflight (`Access-Control-Allow-Headers`). Whether the `Content-Type: application/json` triggers a preflight OPTIONS request (it does, since it's not a "simple" content type).
   - Recommendation: This MUST be tested empirically from the add-in context before any other work proceeds. The test is quick (one fetch call). Plan includes a CORS fallback path (D-06).

2. **WebView2 Origin During Development**
   - What we know: During local dev, the add-in is served from `https://localhost:<port>`. On PowerPoint for the web, the origin is the hosted URL.
   - What's unclear: The exact origin string that WebView2 sends in CORS preflight requests. It may be `https://localhost:3000` or it may be a special WebView2 origin.
   - Recommendation: Inspect the `Origin` header in DevTools during the CORS test to understand exactly what origin the Cube AI server needs to allow.

3. **yo office React Template React Version**
   - What we know: The scaffold template may install a React version different from 18.3.1. We need React 18.x specifically.
   - What's unclear: The exact React version the current `generator-office@3.0.2` installs.
   - Recommendation: After scaffold, immediately check and pin React 18.3.1 if needed.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Build tooling, scaffold | Yes | 22.14.0 | -- |
| npm | Package management | Yes | 10.9.2 | -- |
| npx | Running generators | Yes | 10.9.2 | -- |
| yo (Yeoman) | Project scaffolding | No | -- | `npm install -g yo` |
| generator-office | Office add-in scaffold | No (not global) | 3.0.2 (on registry) | `npm install -g generator-office` |
| PowerPoint (desktop) | Sideload testing | Assumed (Windows 11 + M365) | -- | PowerPoint on the web |
| Cube AI API | Connectivity test | Unknown (CORS) | -- | Proxy via MCP server |

**Missing dependencies with no fallback:**
- None blocking. `yo` and `generator-office` just need to be installed globally before scaffolding.

**Missing dependencies with fallback:**
- `yo` + `generator-office`: Not installed globally. Install with `npm install -g yo generator-office`.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None yet -- greenfield project, scaffold creates no test config |
| Config file | None -- see Wave 0 |
| Quick run command | `npm test` (after test framework setup) |
| Full suite command | `npm test` (after test framework setup) |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BRND-01 | Taskpane displays Summit VI branding | manual | Visual inspection of loaded add-in | N/A |
| TASK-02 | Loading/progress indication during API call | manual + unit | Unit test for spinner state during fetch | Wave 0 |

### Sampling Rate
- **Per task commit:** Visual inspection of taskpane in PowerPoint
- **Per wave merge:** Full manual sideload test + CORS verification
- **Phase gate:** Add-in loads in PowerPoint, branding visible, Cube AI test call succeeds

### Wave 0 Gaps
- [ ] No test framework exists -- defer test infrastructure to Phase 2+ (Phase 1 is scaffolding + connectivity proof; manual verification is appropriate)
- [ ] CORS test is inherently manual (must run inside Office WebView2 context)
- [ ] Branding verification is visual (screenshot or manual check)

**Rationale for minimal automated testing in Phase 1:** This phase is entirely scaffolding and connectivity proof-of-concept. The success criteria (taskpane loads, branding visible, API call succeeds) are best verified by manual sideload testing. Automated unit tests become valuable starting in Phase 2 when business logic exists.

## Sources

### Primary (HIGH confidence)
- [Build first PowerPoint task pane add-in](https://learn.microsoft.com/en-us/office/dev/add-ins/quickstarts/powerpoint-quickstart-yo) -- Yeoman generator setup, sideloading, project structure (updated Dec 2025)
- [Fluent UI React in Office Add-ins](https://learn.microsoft.com/en-us/office/dev/add-ins/quickstarts/fluent-react-quickstart) -- React template with Fluent UI v9 integration (updated Nov 2025)
- [Address same-origin policy limitations](https://learn.microsoft.com/en-us/office/dev/add-ins/develop/addressing-same-origin-policy-limitations) -- CORS handling for Office add-ins (updated Mar 2026)
- [PowerPoint API requirement sets](https://learn.microsoft.com/en-us/javascript/api/requirement-sets/powerpoint/powerpoint-api-requirement-sets) -- API version compatibility matrix (updated Dec 2025)
- `.planning/research/STACK.md` -- Project-level technology stack research (2026-03-23)
- `.planning/research/ARCHITECTURE.md` -- Component boundaries, data flow, Office.js API surface (2026-03-23)
- `.planning/research/PITFALLS.md` -- 14 domain-specific pitfalls (2026-03-23)
- `C:\Development\Summit MCP Server - Claude\src\cubeai.ts` -- Verified Cube AI streaming client implementation
- `C:\Development\Summit MCP Server - Claude\.env.example` -- Cube AI configuration values

### Secondary (MEDIUM confidence)
- [OfficeDev/generator-office (DeepWiki)](https://deepwiki.com/OfficeDev/generator-office/1-overview) -- Generator architecture and template system
- npm registry -- Version verification for react, @fluentui/react-components, generator-office (2026-03-23)

### Tertiary (LOW confidence)
- WebView2 CORS origin behavior -- Multiple Stack Overflow / GitHub issues suggest `https://localhost:<port>` is the origin, but this must be verified empirically in the actual Office add-in context.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- All packages verified against npm registry. `yo office` generator is official Microsoft tooling.
- Architecture: HIGH -- Project structure follows official Microsoft quickstart patterns. Cube AI client code is verified from existing MCP server.
- Pitfalls: HIGH for known issues (CORS, React version, loopback). LOW for CORS outcome (must be tested empirically).

**Research date:** 2026-03-23
**Valid until:** 2026-04-23 (stable domain; only CORS outcome is unknown)
