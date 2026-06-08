# Design: AI-Driven Form Filling

**Date:** 2026-04-27
**Status:** Approved

---

## Overview

Replace the unreliable phi3 per-field approach with a single GPT-4o-mini batch call for field mapping, add cover letter PDF generation and upload, and add screenshot-based verification via Claude's native image understanding. No hardcoded selectors, no sanitization hacks, no platform-specific logic — the AI handles all variance.

---

## Architecture

### What stays the same

- Playwright for browser automation (navigate, fill, upload files)
- `HtmlFormExtractorAgent` DOM extraction — produces an XML field summary from the live page (solid, no changes)
- `ApplicationFiller` orchestration flow
- `CoverLetterGenerator` text generation (provider switches to OpenAI)
- `FieldFillerAgent` Playwright fill mechanics (type, select, setInputFiles)

### What changes

| Component | Change |
|-----------|--------|
| `HtmlFormExtractorAgent.answerFields()` | Replace 20–30 serial phi3 calls with one GPT-4o-mini batch call |
| `CoverLetterGenerator` | Switch to OpenAI provider; add `generateCoverLetterPDF()` |
| `ApplicationFiller` | Save full-page screenshot after filling; pass `screenshotPath` in response |
| `.env.dev` | Set `AI_PROVIDER=openai`, `AI_MODEL=gpt-4o-mini` |
| `~/.claude/skills/apply-jobs/SKILL.md` | Update Verifier Agent section to read screenshot + evaluate visually |
| Removed | All sanitization regex, `grabCtx`, `isDateField`, `recencyHint`, deterministic hacks |

---

## Field Mapping — Batch GPT-4o-mini Call

### Input

- XML field summary from DOM extraction (existing output of `getFormHTML()`)
- Full resume text
- Generated cover letter text (if available)

### System prompt

```
You are filling a job application form on behalf of a candidate.

Given the form fields and the candidate's resume below, return a JSON array with the best answer for every field.

Rules:
- For file input fields whose label contains "cover letter": return value "COVER_LETTER_FILE"
- For file input fields whose label contains "resume" or "cv": return value "RESUME_FILE"
- For select/radio fields: return EXACTLY one of the listed options, word-for-word
- For fields with no matching info in the resume: return empty string ""
- Never return "N/A", "not provided", or any explanation — only the value or ""
- Return ONLY valid JSON, no markdown, no code fences
```

### Output

```json
[
  { "selector": "input[name='firstname']", "value": "Mervej" },
  { "selector": "input[name='email']", "value": "mervejraj@gmail.com" },
  { "selector": "input[name='linkedin']", "value": "https://linkedin.com/in/mervej-raj" },
  { "selector": "input[type='file'][name='cover_letter']", "value": "COVER_LETTER_FILE" },
  { "selector": "input[type='file'][name='resume']", "value": "RESUME_FILE" }
]
```

### What this fixes

- **Email truncation** — GPT-4o-mini reads and returns the full email string exactly
- **LinkedIn URL** — reads the URL from the resume profile section directly
- **Dates** — understands "2013–2017 B.Tech" and outputs `2013` / `2017`
- **Cover letter textarea** — GPT maps the label semantically and fills the generated text
- **Unknown custom fields** (e.g. "Average Sales Ticket Size?") — returns `""` cleanly, no hallucinated sentences
- **Any ATS** — no platform detection needed; GPT understands any label on any form

### Token budget

~5K tokens input, ~1K output per application. Cost: ~$0.001 per application.

---

## Cover Letter PDF

### Generation flow

1. `CoverLetterGenerator.generateCoverLetter()` returns cover letter text (unchanged)
2. New function `generateCoverLetterPDF(text: string, outputPath: string): Promise<void>` uses `pdfkit` to write a clean single-page PDF
3. Output path: `/tmp/cover-letter-{applicationId}.pdf`

### Upload flow

- The batch AI call returns `COVER_LETTER_FILE` for any `type: "file"` field whose label semantically matches "cover letter"
- `ApplicationFiller` uploads via `page.setInputFiles(selector, pdfPath)` — same mechanism as resume upload
- If the form has a cover letter **textarea** instead, GPT returns the full cover letter text directly into that field — no special handling needed

### Dependencies

- `pdfkit` npm package

---

## Verification

### Flow

1. After `FieldFillerAgent` completes all fills, `ApplicationFiller` calls `page.screenshot({ fullPage: true })`
2. Saves to `/tmp/job-agent-verify-{applicationId}.png`
3. Returns `screenshotPath` in the API response alongside `success` / `jobUrl`
4. The `/apply-jobs` skill reads the screenshot with the `Read` tool
5. Claude evaluates the image and produces a structured report:

```
✓ First name: Mervej
✓ Last name: Raj
✓ Email: mervejraj@gmail.com
✓ Phone: +91 9764577845
✓ Resume: uploaded
✓ Cover letter: uploaded
✗ LinkedIn: empty
✗ Notice period: not selected
```

6. If failures exist → Debugger/Fixer Agent maps them to source files, fixes, re-runs (existing iteration loop)
7. Final state: all fields pass, Playwright browser tab left open for manual review and submission

### Why not claude-in-chrome

Playwright opens its own Chromium instance separate from the user's Chrome browser — the extension cannot reach it. Screenshot + `Read` tool gives identical visual coverage without that constraint.

---

## Configuration Changes

`.env.dev`:
```
AI_PROVIDER=openai
AI_MODEL=gpt-4o-mini
```

No new API keys needed — `OPENAI_API_KEY` already present.

---

## Files

| File | Action |
|------|--------|
| `src/agents/html-form-extractor.agent.ts` | Rewrite `answerFields()` — one batch GPT call, remove all phi3 hacks |
| `src/services/cover-letter-generator.ts` | Add `generateCoverLetterPDF()` |
| `src/services/application-filler.ts` | Save screenshot after filling, pass `screenshotPath` in result |
| `src/services/ai.service.ts` | No change — OpenAI path already works |
| `.env.dev` | Switch `AI_PROVIDER` and `AI_MODEL` |
| `~/.claude/skills/apply-jobs/SKILL.md` | Update Verifier Agent to read screenshot + evaluate |
| `package.json` | Add `pdfkit` dependency |

---

## Exit Conditions

| Condition | Outcome |
|-----------|---------|
| All fields verified filled in screenshot | Success — tab left open |
| Fields missing after 3 fix iterations | Escalate with full report |
| GPT batch call fails | Abort, surface error |
| Cover letter PDF generation fails | Skip cover letter upload, continue with form |
