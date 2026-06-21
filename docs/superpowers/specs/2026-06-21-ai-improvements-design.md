# AI Improvements Design

**Date:** 2026-06-21  
**Status:** Approved  
**Scope:** Field mapping accuracy, cover letter quality, unmapped field handling

---

## Problem Statement

Three active pain points in the current AI layer:

1. **Wrong field answers** — hallucinated facts, dates mixed between jobs, wrong format output
2. **Generic cover letters** — key requirements are literally `Not specified` in the prompt; experience section is always empty
3. **Unmapped fields** — fields typed as `other` fall through with weak generic prompts; rule-based answers that resolve to empty string for required fields are never promoted to AI

**Root causes:**
- Each AI field is answered in isolation — no cross-field coherence, no job context
- Raw `parsed_text` is used instead of the structured JSON already in Supabase
- Cover letter prompt is not wired to JD requirements extraction
- Sequential per-field LLM calls — N calls instead of 1

---

## Solution: Batch Structured Field Answering + JD Extraction

### Architecture

```
Current:
  fields → [rule-based]  → direct answer
         → [AI call 1]   → field answer
         → [AI call N]   → field answer
  JD (raw) → [AI call]   → cover letter

New:
  JD text → [extractJDRequirements()] → jdSummary (5-7 bullet points)

  structured resume (Supabase profiles JSON)  ─┐
  jdSummary                                   ─┤
  all AI-tier fields (batched, schema-driven) ─┴→ [generateStructuredFields(), JSON mode] → all answers

  structured resume + jdSummary → [LLM] → cover letter
```

No new services, no vector store, no infrastructure changes. Runs on the existing Express server with the same providers.

---

## Component Changes

### 1. `src/services/ai.service.ts`

**Add: `extractJDRequirements(jobText: string): Promise<string>`**

Single LLM call. Takes raw job description text, returns 5-7 bullet points of key requirements (required skills, experience level, domain, nice-to-haves).

```
System: "You are a technical recruiter. Extract the key requirements from this job description."
User:   <raw JD text>
Output: bullet list — e.g.
  - 5+ years backend experience (Node.js, TypeScript)
  - Experience with distributed systems
  - Strong SQL, PostgreSQL preferred
  - Nice to have: Kafka, Redis
```

**Add: `generateStructuredFields(fields, structuredResume, jdSummary): Promise<Record<string, string>>`**

Single LLM call with JSON mode (`response_format: { type: "json_object" }` for OpenAI). Returns a map of `fieldId → answer`.

Input fields shape:
```typescript
Array<{ id: string; label: string; formatHint: string; options?: string[] }>
```

`id` is a generated index key (`f0`, `f1`, `f2`, ...) assigned at call time. The caller retains the original field array so it can map `f0 → fields[0].selector`, `f1 → fields[1].selector`, etc. when applying answers.

System prompt includes:
- Full structured resume as JSON (from `StructuredResume` type)
- `jdSummary` from the extraction step
- Instruction to use ONLY resume data, no invention
- Instruction to follow `formatHint` exactly

Batching: if `fields.length > 50`, split into slices of ≤25 and merge results. Same prompt template for each slice. IDs remain globally unique across slices (first slice: `f0–f24`, second: `f25–f49`).

---

### 2. `src/services/field-mapper.service.ts`

**Change: `generateAnswersForAIFields()`**

Currently loops and calls `generateText()` per field (N sequential calls). Replace with:
1. Call `generateStructuredFields(aiFields, structuredResume, jdSummary)`
2. Map returned `fieldId → answer` back to `selector` using the field list

**Change: `mapFields()`**

- Accept `structuredResume: StructuredResume` (already fetched from Supabase — just pass it through instead of discarding it)
- Accept `jdSummary: string` (generated once upstream in the apply flow)
- After rule-based Tier 1 mapping: promote any Tier 1 result that is an empty string on a `required` field to the AI batch instead of returning empty

**No changes to:**
- `getFieldSemanticType()` — rule-based tier stays identical
- `mapEntryFields()` — entry fields (experience/education rows) stay rule-based
- Tier 1 direct profile lookups — untouched

---

### 3. `src/services/cover-letter-generator.ts`

**Change: `buildUserPrompt()`**

Replace `### KEY REQUIREMENTS\nNot specified` with `jdSummary` passed in as a parameter.

Replace `experience: ${user.experience}` (always empty string) with a formatted block from structured resume:

```
### CANDIDATE EXPERIENCE
- Software Engineer at Acme Corp (Jun 2022 – Present): Led migration of monolith to microservices...
- SDE-II at XYZ Ltd (Jan 2020 – May 2022): Built real-time data pipeline...

### EDUCATION
- B.Tech Computer Science, NIT Trichy (2016–2020)
```

**Change: `generateCoverLetter()` signature**

Add `jdSummary: string` and `structuredResume: StructuredResume` parameters.

---

### 4. `src/api/apply.ts`

**Orchestration order (new):**

```
1. Fetch resume + structured profile from Supabase (already done)
2. Resolve job description text (crawl or use provided jobText)
3. extractJDRequirements(jobText)  → jdSummary          [NEW — 1 LLM call]
4. fieldMapper.mapFields(..., jdSummary, structuredResume)  [N→1 LLM call]
5. coverLetterGenerator.generateCoverLetter(..., jdSummary, structuredResume)
```

Steps 4 and 5 can run in parallel (both depend on step 3 output but not on each other).

---

## Format Hints Reference

The `formatHint` sent per field in the batch call mirrors the existing `buildAiFieldPrompt()` logic, expressed as a data field rather than embedded in free-text. The hints map to the existing heuristics:

| Question type | formatHint |
|---|---|
| Yes/No question | `"Yes or No only"` |
| Years of experience | `"number only, e.g. 8"` |
| GPA / percentage | `"value only, e.g. 8.5 or 76%"` |
| Date | `"MM/YYYY format only"` |
| Short label field | `"value only, no labels"` |
| Narrative/descriptive | `"1-3 sentences, first person"` |
| Select with options | `"one of the listed options exactly"` |

---

## What This Fixes

| Pain point | Fix |
|---|---|
| Hallucinated facts | Structured resume JSON gives model clean, typed data to pull from — harder to confuse |
| Mixed-up dates/jobs | Model sees all fields at once — internally consistent across the response |
| Wrong format output | JSON mode + explicit `formatHint` per field — format enforced at API level |
| Generic cover letters | `jdSummary` replaces "Not specified"; structured experience replaces empty string |
| Unmapped / missed fields | All `other`-typed fields go into the batch; empty required fields promoted from Tier 1 |

---

## Out of Scope

- Agentic validation loop (verify answers after generation) — phase 2
- RAG / vector chunking — unnecessary, resume is small enough to fit in context
- Changing ATS pattern detection or the extension content-script
- Changing the rule-based Tier 1 field type detection

---

## Open Questions

None — all requirements resolved in design session.
