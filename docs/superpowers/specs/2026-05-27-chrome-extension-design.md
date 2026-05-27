# Chrome Extension Job Agent — Design Spec
**Date:** 2026-05-27  
**Status:** Approved

---

## Overview

Replace the Playwright headless browser filler with a Chrome extension that runs inside the user's real browser session. The extension auto-detects job application pages, fills form fields using the existing Express backend for AI logic, and shows a side panel for real-time status and user intervention.

---

## Goals

- Eliminate anti-bot detection failures by running in real Chrome with real cookies/sessions
- Keep the existing backend (resume storage, cover letter generation, AI field mapping) intact
- Automate as much as possible while allowing the user to intervene on flagged fields
- Support Workable, Greenhouse, Lever, Ashby natively, and any other ATS via generic fallback

---

## Architecture

### Extension (new)

```
extension/
  manifest.json          — MV3, permissions: activeTab, sidePanel, storage
  background.js          — service worker; relays messages between content script and backend
  content-script.js      — detects form, extracts fields, fills fields, auto-advances steps
  panel/
    panel.html           — side panel UI injected as iframe into the page
    panel.js             — resume dropdown, field status list, flagged field editors
    panel.css
  utils/
    ats-patterns.js      — URL patterns for known ATSes
    field-extractor.js   — simplified port of existing DOM parser
    field-filler.js      — fills fields by selector (input, select, file, combobox)
```

The side panel is injected as an iframe into the page (not Chrome's native sidePanel API) for maximum control and compatibility.

### Backend (minimal changes)

Two new endpoints added to the existing Express server:

| Endpoint | Input | Output |
|---|---|---|
| `GET /resumes` | — | `[{id, filename, name}]` |
| `GET /resumes/:id/file` | — | PDF binary (for panel download link) |
| `POST /apply/map-fields` | `{fields[], resumeId, jobUrl}` | `{mappings: [{selector, value, confidence}], coverLetter}` |

All existing endpoints remain unchanged. CORS must allow `chrome-extension://` origin.

### What gets replaced

The extension replaces the Playwright browser launch, `application-filler.ts` (2,559 lines), and `stagehand-filler.ts`. All backend AI logic, resume storage, cover letter generation, and the SQLite application log are kept as-is.

---

## UX Flow

### Activation

The extension auto-detects application pages via a two-layer strategy:

1. **URL pattern match** — high-confidence match against known ATS URL patterns (Workable, Greenhouse, Lever, Ashby, + ~10 more). Activates immediately.
2. **DOM heuristic** — generic fallback: page has >3 visible form fields + URL contains "apply" or "application" + a `<form>` or submit button is present.

On detection, the side panel slides in from the right automatically. No user action required.

### Side Panel States

**State 1 — Detecting**  
Panel opens. Shows detected job title + company (parsed from page title/meta). Resume dropdown populated from `GET /resumes` with last-used resume pre-selected. Field scanning begins immediately.

**State 2 — Filling**  
Shows a live field-by-field status list with a progress bar (e.g. "Step 1 of 3 — Personal Info, 5/8 fields"). Each field shows its filled value as it's written. Flagged fields are marked ⚠.

**State 3 — Needs review**  
When flagged fields exist or a step is fully filled, filling pauses. Panel highlights flagged fields with editable inputs (pre-filled with AI's best guess). User reviews and edits as needed, then clicks "Continue to Next Step →".

### Multi-step Forms

After all fields on a step are filled and any flagged fields are resolved, the agent automatically clicks the "Next" button and repeats the fill cycle on the new page. This continues until the final Review/Confirm page, where the agent stops and waits for the user to submit manually.

**Submit is always manual.** The agent never clicks the final submit button.

### Intervention Triggers

| Scenario | Behaviour |
|---|---|
| AI confidence below threshold (e.g. salary, notice period) | ⚠ Flag for review, pre-fill best guess |
| Field not derivable from resume (diversity, veteran status) | ⚠ Flag as blank, user fills |
| File upload (resume, cover letter PDF) | ⚠ Panel shows download link; user clicks to download PDF then attaches manually |
| CAPTCHA detected | ⛔ Pause, notify user to solve manually |
| Login wall before apply page | ⛔ Pause, user logs in, then agent resumes |

---

## Data Flow

```
User navigates to apply page
  → content-script detects form (URL pattern or DOM heuristic)
  → panel iframe injected, slides in
  → GET /resumes → populate resume dropdown
  → content-script extracts DOM fields → [{selector, label, type, options}]
  → background.js POST /apply/map-fields {fields, resumeId, jobUrl}
  → backend: generate cover letter + AI map resume→fields
  → returns {mappings: [{selector, value, confidence}], coverLetter}
  → content-script fills fields one by one, panel updates in real-time
  → low-confidence fields flagged in panel
  → user reviews flagged fields
  → agent clicks Next → repeat for each step
  → agent stops on final Review page
  → user submits manually
```

Messages within the extension:
- `content-script → background.js`: `chrome.runtime.sendMessage`
- `background.js → content-script`: `chrome.tabs.sendMessage`
- `content-script ↔ panel iframe`: `window.postMessage`

---

## Backend Changes

### `GET /resumes`
New endpoint on existing Express server. Calls `getAllResumes()` from `db.ts` and returns a list for the panel dropdown.

### `POST /apply/map-fields`
New endpoint. Accepts `{fields, resumeId, jobUrl}`. Internally:
1. Loads structured resume via `getStructuredResumeById(resumeId)`
2. Generates cover letter via `CoverLetterGenerator` (crawls job URL for description)
3. Runs AI field mapping (reuses logic from `application-filler.ts#mapFieldsToData`)
4. Returns `{mappings: [{selector, value, confidence}], coverLetter}`

The `confidence` field (0–1) is used by the extension to decide what to flag. Threshold: flag if confidence < 0.7.

The response also includes a `resumeDownloadUrl` pointing to `GET /resumes/:id/file` so the panel can offer a one-click download link for file upload fields (browser security prevents content scripts from setting file inputs programmatically).

### CORS
Add `chrome-extension://*` to the Express CORS allowlist.

---

## Out of Scope

- Auto-submit (always manual)
- Multi-resume tailoring per job (user picks from dropdown)
- Extension publishing to Chrome Web Store (personal use only for now)
- Mobile or Firefox support
