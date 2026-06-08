# Dropdown Option Enforcement Design

**Date:** 2026-05-29
**File:** `src/services/field-mapper.service.ts`

## Problem

When the Chrome extension sends form fields to `/map-fields`, the `FieldMapperService` builds an `aiPrompt` that includes the available dropdown options (via `buildOptionsPrompt`). However, `generateAnswersForAIFields` strips the options list out before calling the AI — it regex-extracts only the question text and discards the rest. The AI therefore sees no options constraint and returns arbitrary free-text, which doesn't match any dropdown option.

## Root Cause

In `generateAnswersForAIFields` (line ~369):

```typescript
const questionMatch = prompt.match(/Question:\s*([\s\S]+?)(?:\nResume:|\nCandidate resume:|$)/);
const question = questionMatch?.[1].trim() || mapping.field.label || ...;
const answer = await generateText(systemPrompt, question, maxTokens);
```

`buildOptionsPrompt` uses `Field:` not `Question:`, so the regex never matches. The code falls through to `mapping.field.label`, stripping the options constraint entirely.

## Design

### Fix 1 — Pass full `aiPrompt` for dropdown fields

In `generateAnswersForAIFields`, detect whether the field has valid options. If so:
- Use `"You are filling a job application form."` as the system prompt
- Pass the **full `aiPrompt`** (which already embeds options + resume) as the user message

If no options, keep existing behavior (resume as system prompt, label as user message).

### Fix 2 — Post-generation fuzzy validation

After the AI responds for a field with options, run fuzzy matching before storing:
1. Exact match (case-insensitive)
2. Substring match (answer ⊆ option text, or option text ⊆ answer)
3. Match found → snap to the canonical option text
4. No match → set `mappedData = undefined` (extension flags for manual input)

### Fix 3 — New private helper `fuzzyMatchOption`

```typescript
private fuzzyMatchOption(answer: string, options: {value: string; text: string}[]): string | null
```

Returns the best matching option text or `null`. Reusable across the service.

## Constraints

- Changes confined to `field-mapper.service.ts`
- No new dependencies
- Existing behavior for text/textarea/non-options fields is unchanged
- If fuzzy match fails for a dropdown, field is left undefined (safe default) rather than using the wrong option
