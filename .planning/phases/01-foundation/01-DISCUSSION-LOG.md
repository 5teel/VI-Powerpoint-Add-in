# Phase 1: Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-23
**Phase:** 01-foundation
**Areas discussed:** Taskpane UI shell, Cube AI connectivity, Dev environment, CORS fallback plan

---

## Taskpane UI Shell

| Option | Description | Selected |
|--------|-------------|----------|
| Chat-style | Message input at bottom, response area above — familiar AI chat pattern (like Copilot sidebar) | ✓ |
| Form-style | Question input at top, results below — more like a search tool | |
| Minimal blank | Just the input and a 'Generate' button — bare minimum for Phase 1 | |
| You decide | Claude picks the best approach for an internal demo | |

**User's choice:** Chat-style (Recommended)
**Notes:** None

### Branding

| Option | Description | Selected |
|--------|-------------|----------|
| Logo + name header | Summit VI logo/icon at top of taskpane with the name | ✓ |
| Text-only header | Just 'Summit VI' text in a styled header bar — no logo needed for demo | |
| Minimal watermark | Small 'Summit VI' text or badge, taskpane is mostly functional space | |
| You decide | Whatever looks clean for a demo | |

**User's choice:** Logo + name header
**Notes:** User provided Summit logo image (mountain/chart mark + "summit" wordmark in dark navy)

### Logo Source

| Option | Description | Selected |
|--------|-------------|----------|
| I'll provide one | I have a logo file I can share | ✓ |
| Placeholder for now | Use a styled text logo or simple icon — swap in real logo later | |
| SVG text treatment | Generate a clean text-based SVG wordmark ('Summit VI') as the logo | |

**User's choice:** Provided logo image
**Notes:** Logo is mountain/chart silhouette with "summit" text, rendered in #0F1330 navy

### Colors

| Option | Description | Selected |
|--------|-------------|----------|
| I'll share colors | I have specific Summit brand colors | ✓ |
| Neutral/clean | White/gray/blue professional palette — brand later | |
| You decide | Pick something that looks sharp for a demo | |

**User's choice:** #0F1330 (dark navy)
**Notes:** Primary brand color provided

---

## Cube AI Connectivity

### API Key Storage

| Option | Description | Selected |
|--------|-------------|----------|
| Hardcoded config | API key in a config file or env variable — simplest for internal demo, swap later | ✓ |
| Settings panel | User enters API key in a settings UI within the taskpane | |
| Environment variable | Read from build-time env var, not visible in client bundle | |
| You decide | Whatever's simplest and secure enough for internal use | |

**User's choice:** Hardcoded config (Recommended)
**Notes:** None

### Test Call Display

| Option | Description | Selected |
|--------|-------------|----------|
| Raw response in taskpane | Show the raw API response text — proves connectivity, good for debugging | |
| Formatted preview | Show a basic formatted version of the insight text — more polished even for Phase 1 | |
| Status indicator | Just show a green checkmark / 'Connected' status — minimal proof of life | |
| You decide | Whatever demonstrates connectivity best | ✓ |

**User's choice:** You decide
**Notes:** Claude has discretion on connectivity test display format

---

## Dev Environment

### Framework

| Option | Description | Selected |
|--------|-------------|----------|
| React | React 18 + Fluent UI v9 — standard for Office add-ins, component ecosystem, easier to build chat UI | ✓ |
| Vanilla TypeScript | No framework — lighter bundle, fewer dependencies, but more manual DOM work | |
| You decide | Pick what's best for an Office add-in with a chat-style UI | |

**User's choice:** React (Recommended)
**Notes:** None

### Scaffold

| Option | Description | Selected |
|--------|-------------|----------|
| Yeoman generator | Microsoft's official `yo office` generator — generates manifest, webpack config, HTTPS certs | ✓ |
| Manual setup | Set up from scratch — more control but more boilerplate work | |
| You decide | Whatever gets us to a working sideloaded add-in fastest | |

**User's choice:** Yeoman generator (Recommended)
**Notes:** None

---

## CORS Fallback Plan

### Fallback Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Lightweight proxy | Spin up a simple Express proxy on localhost that forwards requests to Cube AI | |
| Reuse MCP server | Add a REST endpoint to existing MCP server — it already has Cube AI connectivity | ✓ |
| Request CORS headers | Ask Cube Cloud support to whitelist the Office add-in origin | |
| You decide | Pick the best approach that unblocks us fastest | |

**User's choice:** Reuse MCP server
**Notes:** MCP server at C:\Development\Summit MCP Server - Claude already has the Cube AI client code and auth. Avoids building a new service.

### CORS Test Timing

| Option | Description | Selected |
|--------|-------------|----------|
| Day one | Test CORS immediately with a minimal fetch call before investing in scaffold | ✓ |
| After scaffold | Build the add-in first, test CORS when we have a real taskpane to test from | |

**User's choice:** Day one (Recommended)
**Notes:** None

---

## Claude's Discretion

- Connectivity test display format (raw response, formatted preview, or status indicator)

## Deferred Ideas

None — discussion stayed within phase scope
