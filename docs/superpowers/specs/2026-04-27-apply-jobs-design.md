# Design: `/apply-jobs` Claude Code Skill

**Date:** 2026-04-27  
**Status:** Approved

---

## Overview

A Claude Code skill (`/apply-jobs`) that takes a list of job URLs, runs the job-agent backend, calls the apply API, then autonomously verifies fields are filled correctly in the browser — and if not, debugs and fixes the TypeScript source code, iterating until all critical fields pass or a max retry limit is hit.

---

## Invocation

```
/apply-jobs <url1> [url2 ...] [--resume-id <id>]
```

**Defaults:**
- `--resume-id 11`
- Backend: `http://localhost:3001`
- Max iterations: 3

**Example:**
```
/apply-jobs https://apply.workable.com/innovaccer-analytics/j/71B3042036/
```

---

## Flow

```
Parse args
  → Runner Agent
      - Ensure backend running on :3001 (start if not)
      - POST /apply/jobs { jobUrls, resumeId }
      - Capture console output via Node.js debugger MCP
      ← { applyLink, apiResponse, consoleOutput }

  → Verifier Agent
      - Navigate to applyLink via claude-in-chrome
      - Screenshot each form section
      - Read DOM field values
      - Check all critical fields
      ← { passed[], failed[{ field, expected, actual }] }

  if all passed → DONE ✓

  if failures (iteration ≤ 3):
    → Debugger/Fixer Agent
        - Map failed fields to responsible source files
        - Set breakpoints, inspect live values
        - Identify root cause
        - Edit source file(s)
        ← { filesEdited[], fixDescription }
    → loop back to Runner Agent

  if iteration > 3 → escalate with full report
```

---

## Agent Responsibilities

### Runner Agent

**Goal:** Start the backend if needed and trigger the apply flow.

**Steps:**
1. Check if port 3001 is responding (`curl -s http://localhost:3001`)
2. If not, run `npm run dev` in background, wait for "Job Agent running" log
3. Call `POST http://localhost:3001/apply/jobs` with `{ jobUrls, resumeId }`
4. Connect Node.js debugger MCP on port 9229
5. Capture `get_console_output` for errors, warnings, AI responses
6. Return `applyLink` (from API response or constructed as `<jobUrl>apply/`)

**Error handling:** If API returns non-200, surface error and consoleOutput to Fixer Agent.

---

### Verifier Agent

**Goal:** Confirm each critical form field is correctly filled in the browser.

**Critical fields to verify:**

| Field | How to verify |
|-------|--------------|
| First name | Input value non-empty |
| Last name | Input value non-empty |
| Email | Input value matches resume email |
| Phone | Input value non-empty |
| Resume upload | File input has a file attached OR filename shown |
| Cover letter / summary | Textarea has ≥100 chars |
| LinkedIn URL | Input value non-empty (if field exists) |
| Website/Portfolio | Input value non-empty (if field exists) |
| Work experience entries | At least one experience block visible |
| Summary/Headline | Non-empty (if field exists) |

**Steps:**
1. Use `mcp__claude-in-chrome__navigate` to go to `applyLink`
2. Use `mcp__claude-in-chrome__read_page` to get DOM
3. Use `mcp__claude-in-chrome__find` for each field selector
4. Screenshot form sections with `mcp__claude-in-chrome__computer`
5. Return structured pass/fail report

---

### Debugger/Fixer Agent

**Goal:** Trace field failures to root cause in TypeScript source, fix, and report.

**Field → source file mapping:**

| Failure type | Files to investigate |
|-------------|---------------------|
| Field not filled at all | `src/agents/field-filler.agent.ts` |
| Wrong value mapped | `src/agents/form-analyzer.agent.ts` |
| Resume not uploaded | `src/services/application-filler.ts` (file upload logic) |
| Cover letter blank/short | `src/services/cover-letter-generator.ts`, `src/api/apply.ts` |
| Experience not filled | `src/agents/field-filler.agent.ts`, `src/agents/html-form-extractor.agent.ts` |
| Summary not filled | `src/agents/field-filler.agent.ts` |

**Steps:**
1. Read failure report from Verifier
2. Read relevant source file(s)
3. Set breakpoints via `mcp__nodejs-debugger__set_breakpoint` at suspected lines
4. Re-trigger the apply flow, inspect variables with `mcp__nodejs-debugger__inspect_variables`
5. Identify root cause
6. Edit the file with targeted fix
7. Return `{ filesEdited, fixDescription }`

---

## Files

| File | Action |
|------|--------|
| `~/.claude/skills/apply-jobs/SKILL.md` | Create — the skill |
| `docs/superpowers/specs/2026-04-27-apply-jobs-design.md` | This file |

No new TypeScript files. The skill drives existing `src/agents/` and `src/services/` via MCP tools and direct edits.

---

## Exit Conditions

| Condition | Outcome |
|-----------|---------|
| All critical fields verified filled | Success — report to user |
| Any field fails after 3 iterations | Escalate — print full debug report with remaining failures, files inspected, and fixes attempted |
| API error (non-200) on first call | Abort — surface error immediately |

---

## Post-Verification Behaviour

- **Do not click submit.** Leave the browser tab open so the user can review and submit manually.
- After all fields pass, print a summary report and exit — the Chrome window stays open.

## Out of Scope

- Clicking the final submit button
- Multi-page form navigation beyond the first apply page
- Support for job boards other than Workable in v1
