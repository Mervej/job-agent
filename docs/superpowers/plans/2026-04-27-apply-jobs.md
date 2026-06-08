# apply-jobs Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a `/apply-jobs` Claude Code skill that starts the job-agent backend, calls the apply API with given job URLs, verifies all critical form fields are filled in the browser via claude-in-chrome, and autonomously debugs + fixes the TypeScript source if any fields fail — iterating up to 3 times before escalating.

**Architecture:** A single skill file (`~/.claude/skills/apply-jobs/SKILL.md`) that orchestrates three logical agents (Runner, Verifier, Fixer) using the Node.js debugger MCP (port 9229) and claude-in-chrome MCP. No new TypeScript files are added — the skill drives existing `src/agents/` and `src/services/` via direct file edits and MCP tools.

**Tech Stack:** Claude Code skill (markdown), Node.js debugger MCP, claude-in-chrome MCP, Bash, TypeScript (existing codebase)

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `~/.claude/skills/apply-jobs/SKILL.md` | Create | The slash command skill |
| `docs/superpowers/specs/2026-04-27-apply-jobs-design.md` | Already exists | Design doc (reference) |
| `README.md` | Modify | Add `/apply-jobs` skill to the docs |

---

## Task 1: Create skill scaffold with frontmatter and arg parsing

**Files:**
- Create: `~/.claude/skills/apply-jobs/SKILL.md`

- [ ] **Step 1: Create the skill directory**

```bash
mkdir -p ~/.claude/skills/apply-jobs
```

- [ ] **Step 2: Create SKILL.md with frontmatter and arg-parsing section**

Create `~/.claude/skills/apply-jobs/SKILL.md` with this exact content as the start:

```markdown
---
name: apply-jobs
description: Start the job-agent backend, apply to given job URLs, verify all form fields are filled in the browser, and auto-fix if any fields are missing. Usage: /apply-jobs <url1> [url2 ...] [--resume-id <id>]
---

# apply-jobs

Autonomously apply to jobs, verify form fields in the browser, and fix the TypeScript source if anything is wrong. Leaves the browser tab open for manual review and submission.

## Parse Arguments

Extract from the skill invocation args:
- `jobUrls`: all positional args (strings starting with `http`)
- `resumeId`: value after `--resume-id` flag, default `11`
- `backendUrl`: `http://localhost:3001`
- `maxIterations`: `3`

If no URLs provided, stop immediately and tell the user:
> "Usage: /apply-jobs <url1> [url2 ...] [--resume-id <id>]"
```

- [ ] **Step 3: Verify the file exists**

```bash
cat ~/.claude/skills/apply-jobs/SKILL.md
```
Expected: frontmatter + Parse Arguments section visible.

---

## Task 2: Runner Agent section

**Files:**
- Modify: `~/.claude/skills/apply-jobs/SKILL.md`

- [ ] **Step 1: Append the Runner section to the skill file**

Append this section to `~/.claude/skills/apply-jobs/SKILL.md`:

````markdown
## Runner Agent

**Goal:** Ensure the backend is running and trigger the apply flow.

### 1. Check if backend is up

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/
```

If response is not `200` or connection refused:

```bash
cd /Users/mervej.raj/Documents/Projects/Personal/job-agent && npm run dev &
```

Then poll until the server is up (up to 30s):
```bash
for i in $(seq 1 30); do
  curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/ | grep -q "200" && break
  sleep 1
done
```

### 2. Connect Node.js debugger

Use `mcp__nodejs-debugger__retry_connect` to connect to port 9229. If it fails, the server may not have started with `--inspect`. Check by running:
```bash
ps aux | grep "node --inspect"
```

### 3. Call the apply API

```bash
curl -s -X POST http://localhost:3001/apply/jobs \
  -H "Content-Type: application/json" \
  -d "{\"jobUrls\": [\"$JOB_URL\"], \"resumeId\": $RESUME_ID}"
```

Capture the full response JSON. If status is not 200, read console output:

Use `mcp__nodejs-debugger__get_console_output` to get server logs.

Surface the error to the user and stop.

### 4. Extract apply link

From the API response, the `results[0].jobUrl` contains the original job URL.
For Workable URLs like `https://apply.workable.com/org/j/JOBID/`, the apply link is `https://apply.workable.com/org/j/JOBID/apply/`.

Construct `applyLink` = `jobUrl.replace(/\/?$/, '/apply/')` if not already ending in `/apply/`.

Store for Verifier Agent: `{ applyLink, consoleOutput, apiResponse }`
````

- [ ] **Step 2: Confirm section appended**

```bash
grep -c "Runner Agent" ~/.claude/skills/apply-jobs/SKILL.md
```
Expected: `1`

---

## Task 3: Verifier Agent section

**Files:**
- Modify: `~/.claude/skills/apply-jobs/SKILL.md`

- [ ] **Step 1: Append the Verifier section**

Append this section to `~/.claude/skills/apply-jobs/SKILL.md`:

````markdown
## Verifier Agent

**Goal:** Navigate to the apply form and confirm every critical field has a value.

### 1. Load chrome tools

Use `ToolSearch` with query `select:mcp__claude-in-chrome__tabs_context_mcp` then call `mcp__claude-in-chrome__tabs_context_mcp` to get current tabs.

Create a new tab: use `ToolSearch` with `select:mcp__claude-in-chrome__tabs_create_mcp` then `mcp__claude-in-chrome__tabs_create_mcp`.

### 2. Navigate to apply link

Use `ToolSearch` with `select:mcp__claude-in-chrome__navigate` then:
```
mcp__claude-in-chrome__navigate({ tabId, url: applyLink })
```

Wait 3 seconds for the page to load. Use `ToolSearch` with `select:mcp__claude-in-chrome__read_page` then read the full page DOM.

### 3. Check each critical field

Use `ToolSearch` with `select:mcp__claude-in-chrome__find` then `mcp__claude-in-chrome__javascript_tool` to inspect field values.

Run this JavaScript to extract all field values at once:

```javascript
const results = {};
// Text inputs and textareas
document.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"], textarea').forEach(el => {
  const label = el.closest('[data-ui]')?.querySelector('label')?.innerText 
    || el.labels?.[0]?.innerText 
    || el.placeholder 
    || el.name 
    || el.id;
  results[label] = { value: el.value, tag: el.tagName, type: el.type };
});
// File inputs
document.querySelectorAll('input[type="file"]').forEach(el => {
  results['__file_' + (el.name || el.id)] = { 
    value: el.files?.length > 0 ? el.files[0].name : '', 
    tag: 'file' 
  };
});
// Check for resume filename shown in UI (Workable shows it after upload)
const resumeLabel = document.querySelector('[data-ui="file-uploader"] .filename, [class*="filename"], [class*="file-name"]');
results['__resume_ui_label'] = { value: resumeLabel?.innerText || '' };
return results;
```

### 4. Evaluate results

Check each of the following. Mark as **PASS** or **FAIL**:

| Field | Pass condition |
|-------|---------------|
| First name | value non-empty |
| Last name | value non-empty |
| Email | value matches format `*@*.*` |
| Phone | value non-empty |
| Resume upload | `__file_*` has a filename OR `__resume_ui_label` non-empty |
| Cover letter / summary | textarea with ≥100 chars |
| LinkedIn URL | value non-empty (skip if field not present) |
| Experience section | at least one element with `[data-ui="experience"]` or `.experience` visible |

### 5. Take a screenshot for the report

Use `ToolSearch` with `select:mcp__claude-in-chrome__computer` then take a screenshot.

### 6. Return structured report

```
{
  passed: ["First name", "Email", ...],
  failed: [
    { field: "Cover letter", expected: "≥100 chars", actual: "0 chars" },
    { field: "Resume upload", expected: "file attached", actual: "none" }
  ],
  screenshot: <captured>,
  tabId: <keep open>
}
```

If `failed` is empty → print success report and **stop**. The browser tab stays open.

```
✓ All fields verified filled. Tab left open for your review.

Passed: First name, Last name, Email, Phone, Resume, Cover letter, LinkedIn

Open in Chrome to review and submit manually.
```
````

- [ ] **Step 2: Confirm section appended**

```bash
grep -c "Verifier Agent" ~/.claude/skills/apply-jobs/SKILL.md
```
Expected: `1`

---

## Task 4: Debugger/Fixer Agent section

**Files:**
- Modify: `~/.claude/skills/apply-jobs/SKILL.md`

- [ ] **Step 1: Append the Fixer section**

Append this section to `~/.claude/skills/apply-jobs/SKILL.md`:

````markdown
## Debugger/Fixer Agent

**Goal:** For each failed field, trace root cause in the TypeScript source, fix it, and return a change summary.

### 1. Map failed fields to source files

| Field failure | Primary file to investigate |
|--------------|----------------------------|
| First/Last name not filled | `src/agents/field-filler.agent.ts` — check `fill()` for `inputType === 'text'` path |
| Email not filled | `src/agents/field-filler.agent.ts` — same path |
| Phone not filled | `src/agents/field-filler.agent.ts` — same path |
| Resume not uploaded | `src/services/application-filler.ts` — search for `uploadResume` or `setInputFiles` |
| Cover letter/summary empty | `src/services/cover-letter-generator.ts` and `src/api/apply.ts` line ~91 |
| Experience section missing | `src/agents/form-analyzer.agent.ts` — `expandDynamicSections()` method |
| Field selector not found | `src/agents/html-form-extractor.agent.ts` — selector generation logic |

### 2. Read the failing source file

Read the relevant file. Look for:
- Conditions that would cause the field to be skipped (`continue`, early `return`)
- Selector mismatches (wrong CSS selector for the field type)
- AI mapping returning `undefined` or empty string
- File upload path being wrong

### 3. Set a breakpoint and inspect live values (if server running with inspector)

Use `mcp__nodejs-debugger__set_breakpoint` on the suspected line. Then re-trigger the apply call:

```bash
curl -s -X POST http://localhost:3001/apply/jobs \
  -H "Content-Type: application/json" \
  -d "{\"jobUrls\": [\"$JOB_URL\"], \"resumeId\": $RESUME_ID}"
```

Use `mcp__nodejs-debugger__inspect_variables` to see actual values at the breakpoint.
Use `mcp__nodejs-debugger__continue` to resume after inspection.

### 4. Fix the file

Make the minimal targeted edit to fix the root cause. Do not refactor surrounding code.

After editing, read back the changed lines to confirm the edit is correct.

### 5. Restart the server to pick up changes

The `npm run dev` nodemon process will auto-restart on file changes. Wait for:
```bash
# poll for restart
sleep 3 && curl -s http://localhost:3001/ 
```

### 6. Return change summary

```
Fixed: src/agents/field-filler.agent.ts
- Line 63: file input type was returning early without checking for the uploadResume path
- Changed: added fallback to re-attempt file upload via page.setInputFiles()

Iteration N/3 complete. Re-running Runner + Verifier...
```

Then loop back to **Runner Agent** with the same `jobUrls` and `resumeId`.

---

## Iteration Loop

```
iteration = 1
while iteration ≤ 3:
  run Runner Agent
  run Verifier Agent
  if all passed → DONE (keep tab open)
  run Debugger/Fixer Agent
  iteration += 1

if iteration > 3 and failures remain:
  print escalation report:
  "⚠ Could not fix all fields after 3 iterations.
   
   Still failing: [field list]
   Files edited: [list]
   Last console output: [paste]
   
   Please review the above and fix manually."
```
````

- [ ] **Step 2: Confirm fixer section present**

```bash
grep -c "Debugger/Fixer Agent" ~/.claude/skills/apply-jobs/SKILL.md
```
Expected: `1`

---

## Task 5: Update README

**Files:**
- Modify: `README.md` in project root

- [ ] **Step 1: Add skill documentation to README**

In `README.md`, find the `## API Endpoints` section and add a new section before it:

```markdown
## Claude Code Skill

### `/apply-jobs`

Autonomously applies to jobs, verifies all form fields are filled, and fixes issues in the source code if needed.

**Usage:**
```
/apply-jobs <url1> [url2 ...] [--resume-id <id>]
```

**Example:**
```
/apply-jobs https://apply.workable.com/innovaccer-analytics/j/71B3042036/ --resume-id 11
```

**What it does:**
1. Starts the backend on port 3001 if not already running
2. Calls `POST /apply/jobs` to trigger the full apply flow
3. Opens the Workable apply form in Chrome and verifies each critical field
4. If any field is empty, debugs the TypeScript source and fixes it
5. Iterates up to 3 times, then escalates with a report
6. Leaves the browser tab open for you to review and submit manually

**Prerequisites:** Claude Code with claude-in-chrome extension installed and Node.js debugger MCP configured.
```

- [ ] **Step 2: Verify README updated**

```bash
grep -A 3 "Claude Code Skill" /Users/mervej.raj/Documents/Projects/Personal/job-agent/README.md
```
Expected: skill section visible.

---

## Task 6: Smoke test the skill

- [ ] **Step 1: Confirm skill is discoverable**

In a new Claude Code session, type `/` and verify `apply-jobs` appears in the autocomplete list.

- [ ] **Step 2: Run a dry smoke test**

Invoke:
```
/apply-jobs https://apply.workable.com/innovaccer-analytics/j/71B3042036/ --resume-id 11
```

Expected flow:
1. Runner starts backend (or detects it's already running)
2. API call succeeds with `200` response
3. Verifier opens Chrome tab at `https://apply.workable.com/innovaccer-analytics/j/71B3042036/apply/`
4. Field report printed — each field either PASS or FAIL
5. If failures: Fixer reads source, sets breakpoints, edits, re-runs
6. Final state: all critical fields PASS, tab left open

- [ ] **Step 3: Confirm tab stays open**

After skill completes, verify Chrome still has the Workable apply tab open (do not close it).
