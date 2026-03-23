# Phase 2: Slide Primitives - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-23
**Phase:** 02-slide-primitives
**Areas discussed:** Slide layout templates, Text formatting, Table styling, Trigger mechanism

---

## Slide Layout Templates

### Slide Size

| Option | Description | Selected |
|--------|-------------|----------|
| Widescreen 16:9 | Standard modern PowerPoint default (13.33" x 7.5") | |
| Standard 4:3 | Legacy format (10" x 7.5") | |
| Both | Support both with adaptive positioning | ✓ |

**User's choice:** Both
**Notes:** Adaptive positioning based on active presentation dimensions

### Layout Types

| Option | Description | Selected |
|--------|-------------|----------|
| Text-only | Title + bullet points + key insight callout | ✓ |
| Chart + text | Chart region with text summary alongside | ✓ |
| Table + text | Data table with title and summary text | ✓ |
| Full combination | Chart + table + text on one slide | ✓ |

**User's choice:** All four layout types
**Notes:** None

---

## Text Formatting

### Font

| Option | Description | Selected |
|--------|-------------|----------|
| Calibri | PowerPoint default, universally available | |
| Match active theme | Use presentation theme font | |
| Specific font | Summit brand font | |
| You decide | Pick professional defaults | ✓ |

**User's choice:** You decide
**Notes:** User requested UI-SPEC tool to improve visual decisions

### Key Insight Callout

| Option | Description | Selected |
|--------|-------------|----------|
| Highlighted box | Colored background rectangle with white text | |
| Bordered quote | Left border accent with bold text | |
| Large text | Oversized text, no box | |
| You decide | Whatever makes takeaway unmissable | ✓ |

**User's choice:** You decide
**Notes:** Deferred to UI-SPEC for precise visual treatment

---

## Table Styling

### Style

| Option | Description | Selected |
|--------|-------------|----------|
| Clean minimal | Light borders, alternating row shading | |
| Bold headers | Dark header row (Summit navy), white text, light body rows | ✓ |
| Borderless | No borders, spacing and alternating backgrounds | |
| You decide | Clean and professional | |

**User's choice:** Bold headers
**Notes:** Summit navy (#0F1330) for header row

### Number Formatting

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-format | Detect type: currency, percentages, plain numbers | ✓ |
| Raw values | Display exactly as Cube AI returns | |
| You decide | Pick best for readability | |

**User's choice:** Auto-format
**Notes:** None

---

## Trigger Mechanism

### Test Trigger

| Option | Description | Selected |
|--------|-------------|----------|
| Test buttons in taskpane | One button per layout type | |
| Single test button | One button cycling through types | |
| You decide | Whatever verifies each primitive | ✓ |

**User's choice:** You decide
**Notes:** Phase 4 replaces with real Cube AI pipeline

---

## Claude's Discretion

- Font family and sizes
- Key insight callout visual treatment
- Test trigger UI design
- Exact positioning and sizing of layout regions

## Deferred Ideas

None — discussion stayed within phase scope
