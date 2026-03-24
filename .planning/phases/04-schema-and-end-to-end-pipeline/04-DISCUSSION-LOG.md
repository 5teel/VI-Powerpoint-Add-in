# Phase 4: Schema and End-to-End Pipeline - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-24
**Phase:** 04-schema-and-end-to-end-pipeline
**Areas discussed:** Schema prompting, Parser resilience, Slide trigger UX, Layout selection

---

## Schema Prompting

### How to instruct Cube AI to return slide-ready JSON

| Option | Description | Selected |
|--------|-------------|----------|
| Wrap user question | Prepend system instruction with JSON schema, single API call | ✓ |
| Two-step pipeline | First call gets answer, second structures it as JSON | |
| Post-process locally | Parse natural language ourselves, no schema dependency | |

**User's choice:** Wrap user question

### Schema inclusion frequency

| Option | Description | Selected |
|--------|-------------|----------|
| Every request | Include full schema in every prompt, stateless | ✓ |
| First turn only | Send schema once, rely on chatId context | |
| You decide | Claude picks | |

**User's choice:** Every request

---

## Parser Resilience

| Option | Description | Selected |
|--------|-------------|----------|
| Text-only slide | Fall back to text-only slide using raw response as bullets | ✓ |
| Show in chat only | Display response but don't create slide | |
| Error message | Show error, user retries | |

**User's choice:** Text-only slide

---

## Slide Trigger UX

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-create after response | Slide inserted automatically when streaming completes | |
| Button after response | "Create Slide" button appears, user reviews then clicks | ✓ |
| You decide | Claude picks | |

**User's choice:** Button after response

---

## Layout Selection

| Option | Description | Selected |
|--------|-------------|----------|
| Cube AI decides | Include layout type in JSON schema, AI picks based on data | ✓ |
| Our code decides | Analyze response content and pick layout automatically | |
| User picks | Show layout options, let user choose | |

**User's choice:** Cube AI decides

---

## Claude's Discretion

- JSON schema field names and structure
- System prompt wording
- JSON extraction strategy
- "Create Slide" button styling
- Confirmation message format

## Deferred Ideas

None — discussion stayed within phase scope
