# AI Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace N sequential per-field AI calls with one batched structured call, add JD requirements extraction, and make cover letters use real JD requirements and structured experience data.

**Architecture:** (1) Two new functions in `ai.service.ts` — `extractJDRequirements` (one LLM call → bullet list of JD requirements) and `generateStructuredFields` (one JSON-mode LLM call → all AI field answers at once). (2) `field-mapper.service.ts` calls both, passes `jdSummary` and `structuredResume` through to field answering and cover letter generation. (3) `cover-letter-generator.ts` uses `jdSummary` and structured experience instead of the hardcoded "Not specified" placeholder.

**Tech Stack:** TypeScript, Jest (ts-jest), OpenAI API JSON mode, axios, supertest

## Global Constraints

- TypeScript — no new `any` types; existing `any` usages are acceptable
- Jest — run `npm test` after every task; all tests must pass before moving on
- OpenAI and Groq: use `response_format: { type: 'json_object' }` for `generateStructuredFields`
- Ollama: no JSON mode — fall back to `generateText` and parse `{...}` from the response
- Do NOT change `getFieldSemanticType()`, `mapEntryFields()`, or Tier 1 direct lookups
- Do NOT change the `/apply/map-fields` route request/response shape
- `jdSummary` and `structuredResume` parameters on `generateCoverLetter` must have defaults so existing call sites compile without changes

---

## File Map

| File | Change |
|---|---|
| `src/services/ai.service.ts` | Add `FieldSpec` interface, `extractJDRequirements()`, `generateStructuredFields()` |
| `src/services/field-mapper.service.ts` | Add `buildFormatHint()`, rewrite `generateAnswersForAIFields()`, update `mapFields()` |
| `src/services/cover-letter-generator.ts` | Update `generateCoverLetter()` and `buildUserPrompt()` signatures |
| `src/services/__tests__/ai.service.test.ts` | New test file |
| `src/services/__tests__/field-mapper.service.test.ts` | Update mocks for new AI service exports |

---

### Task 1: Add `extractJDRequirements` and `generateStructuredFields` to `ai.service.ts`

**Files:**
- Modify: `src/services/ai.service.ts`
- Create: `src/services/__tests__/ai.service.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  // New interface exported from ai.service.ts
  export interface FieldSpec {
    id: string;       // generated index key: "f0", "f1", ...
    label: string;    // field label / question text
    formatHint: string; // how to format the answer
  }

  export async function extractJDRequirements(jobText: string): Promise<string>
  // Returns 5-7 bullet points, e.g. "- 5+ years Node.js\n- TypeScript required"

  export async function generateStructuredFields(
    fields: FieldSpec[],
    structuredResume: StructuredResume,
    jdSummary: string
  ): Promise<Record<string, string>>
  // Returns { "f0": "answer", "f1": "answer", ... }
  ```

- [ ] **Step 1: Write failing tests**

Create `src/services/__tests__/ai.service.test.ts`:

```typescript
import axios from 'axios';
import { extractJDRequirements, generateStructuredFields, FieldSpec } from '../ai.service';
import { StructuredResume } from '../resume';

jest.mock('axios');
jest.mock('../config/ai.config', () => ({
  default: {
    provider: 'openai',
    model: 'gpt-4o-mini',
    openai: { apiKey: 'test-key' },
    groq: { apiKey: 'test-groq-key', model: 'llama-3.3-70b-versatile' },
    ollama: { url: 'http://localhost:11434', model: 'qwen2.5:7b', visionModel: 'llava-phi3' },
  },
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;

const mockResume: StructuredResume = {
  profileDetails: { name: 'Jane Doe', email: 'jane@example.com' },
  experience: [
    { company: 'Acme', role: 'Engineer', startDate: '01/2020', endDate: 'Present', description: 'Built things' },
  ],
  education: [{ institution: 'MIT', degree: 'B.Tech', startDate: '2016', endDate: '2020' }],
  skills: ['Node.js', 'TypeScript'],
};

describe('extractJDRequirements', () => {
  beforeEach(() => {
    mockedAxios.post.mockResolvedValue({
      data: { choices: [{ message: { content: '- 5+ years Node.js\n- TypeScript required' } }] },
    });
  });

  it('calls OpenAI with a recruiter system prompt', async () => {
    await extractJDRequirements('We need a senior Node.js engineer');

    const [, body] = mockedAxios.post.mock.calls[0];
    const systemMsg = (body as any).messages[0];
    expect(systemMsg.role).toBe('system');
    expect(systemMsg.content).toMatch(/recruiter/i);
  });

  it('sends the job text as the user message', async () => {
    await extractJDRequirements('We need a senior Node.js engineer');

    const [, body] = mockedAxios.post.mock.calls[0];
    const userMsg = (body as any).messages[1];
    expect(userMsg.content).toBe('We need a senior Node.js engineer');
  });

  it('returns the model response text', async () => {
    const result = await extractJDRequirements('job text');
    expect(result).toBe('- 5+ years Node.js\n- TypeScript required');
  });
});

describe('generateStructuredFields', () => {
  const fields: FieldSpec[] = [
    { id: 'f0', label: 'Years of experience', formatHint: 'number only, e.g. 8' },
    { id: 'f1', label: 'Why do you want this role?', formatHint: '1-3 sentences, first person' },
  ];

  beforeEach(() => {
    mockedAxios.post.mockResolvedValue({
      data: { choices: [{ message: { content: JSON.stringify({ f0: '8', f1: 'I love distributed systems' }) } }] },
    });
  });

  it('uses JSON mode response_format for OpenAI', async () => {
    await generateStructuredFields(fields, mockResume, '- Node.js required');

    const [, body] = mockedAxios.post.mock.calls[0];
    expect((body as any).response_format).toEqual({ type: 'json_object' });
  });

  it('includes the structured resume in the system prompt', async () => {
    await generateStructuredFields(fields, mockResume, '- Node.js required');

    const [, body] = mockedAxios.post.mock.calls[0];
    const systemContent = (body as any).messages[0].content as string;
    expect(systemContent).toContain('Jane Doe');
  });

  it('returns parsed JSON mapping field ids to answer strings', async () => {
    const result = await generateStructuredFields(fields, mockResume, '- Node.js required');
    expect(result).toEqual({ f0: '8', f1: 'I love distributed systems' });
  });

  it('returns empty object for empty fields array', async () => {
    const result = await generateStructuredFields([], mockResume, '');
    expect(result).toEqual({});
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('batches into multiple calls when fields exceed 25', async () => {
    const manyFields: FieldSpec[] = Array.from({ length: 30 }, (_, i) => ({
      id: `f${i}`,
      label: `Field ${i}`,
      formatHint: 'value only',
    }));

    mockedAxios.post
      .mockResolvedValueOnce({ data: { choices: [{ message: { content: JSON.stringify(Object.fromEntries(manyFields.slice(0, 25).map(f => [f.id, 'answer']))) } }] } })
      .mockResolvedValueOnce({ data: { choices: [{ message: { content: JSON.stringify(Object.fromEntries(manyFields.slice(25).map(f => [f.id, 'answer']))) } }] } });

    const result = await generateStructuredFields(manyFields, mockResume, '');
    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    expect(Object.keys(result)).toHaveLength(30);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --testPathPattern="ai.service.test" 2>&1 | tail -20
```

Expected: FAIL — `extractJDRequirements is not a function` or similar.

- [ ] **Step 3: Add `FieldSpec` interface and `extractJDRequirements` to `ai.service.ts`**

Add after the existing imports at the top of `src/services/ai.service.ts`:

```typescript
import { StructuredResume } from './resume';

export interface FieldSpec {
  id: string;
  label: string;
  formatHint: string;
}
```

Add at the bottom of `src/services/ai.service.ts` (after `analyzeScreenshot`):

```typescript
export async function extractJDRequirements(jobText: string): Promise<string> {
  const systemPrompt =
    'You are a technical recruiter. Extract the key hiring requirements from the job description below. ' +
    'Return ONLY a bullet list of 5-7 items covering required skills, experience level, domain, and nice-to-haves. ' +
    'Format each item as "- <requirement>". No preamble, no headers, just the bullet list.';
  return generateText(systemPrompt, jobText, 300);
}
```

- [ ] **Step 4: Add `generateStructuredFields` to `ai.service.ts`**

Add after `extractJDRequirements`:

```typescript
export async function generateStructuredFields(
  fields: FieldSpec[],
  structuredResume: StructuredResume,
  jdSummary: string
): Promise<Record<string, string>> {
  if (fields.length === 0) return {};

  const BATCH_SIZE = 25;
  const results: Record<string, string> = {};

  for (let i = 0; i < fields.length; i += BATCH_SIZE) {
    const slice = fields.slice(i, i + BATCH_SIZE);
    const batch = await _generateFieldBatch(slice, structuredResume, jdSummary);
    Object.assign(results, batch);
  }

  return results;
}

async function _generateFieldBatch(
  fields: FieldSpec[],
  structuredResume: StructuredResume,
  jdSummary: string
): Promise<Record<string, string>> {
  const name = structuredResume.profileDetails?.name || 'the candidate';

  const systemPrompt = `You are filling a job application for ${name}.
Rules:
- Use ONLY data from the resume below. Do not invent facts not present in the resume.
- Follow each field's formatHint exactly — output only the value, nothing else.
- If information is not in the resume, output an empty string "" for that field.
- Return ONLY a valid JSON object mapping each field id to its answer string.

Resume:
${JSON.stringify(structuredResume, null, 2)}

Job requirements:
${jdSummary || 'Not provided'}`;

  const userPrompt =
    'Fill these application fields. Return a JSON object { id: answer }:\n' +
    JSON.stringify(fields.map(f => ({ id: f.id, label: f.label, formatHint: f.formatHint })));

  if (config.provider === 'openai') {
    const res = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 2000,
      },
      { headers: { Authorization: `Bearer ${config.openai.apiKey}` } }
    );
    try {
      return JSON.parse(res.data.choices[0].message.content) as Record<string, string>;
    } catch {
      return {};
    }
  }

  if (config.provider === 'groq') {
    const res = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: config.groq.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 2000,
        temperature: 0.3,
      },
      { headers: { Authorization: `Bearer ${config.groq.apiKey}` } }
    );
    try {
      return JSON.parse(res.data.choices[0].message.content) as Record<string, string>;
    } catch {
      return {};
    }
  }

  // Ollama fallback — no JSON mode, parse JSON from text response
  const raw = await generateText(systemPrompt, userPrompt, 2000);
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return {};
  try {
    return JSON.parse(jsonMatch[0]) as Record<string, string>;
  } catch {
    return {};
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm test -- --testPathPattern="ai.service.test" 2>&1 | tail -20
```

Expected: PASS — all 7 tests green.

- [ ] **Step 6: Commit**

```bash
git add src/services/ai.service.ts src/services/__tests__/ai.service.test.ts
git commit -m "feat: add extractJDRequirements and generateStructuredFields to ai.service"
```

---

### Task 2: Refactor `field-mapper.service.ts` to use batch AI answering

**Files:**
- Modify: `src/services/field-mapper.service.ts`
- Modify: `src/services/__tests__/field-mapper.service.test.ts`

**Interfaces:**
- Consumes:
  ```typescript
  import { extractJDRequirements, generateStructuredFields, FieldSpec } from './ai.service';
  // generateStructuredFields(fieldSpecs, structuredResume, jdSummary) → Record<string, string>
  // extractJDRequirements(jobText) → string
  ```
- `generateAnswersForAIFields` new signature:
  ```typescript
  private async generateAnswersForAIFields(
    mappings: FieldMapping[],
    resumeText: string,
    structuredResume: StructuredResume,
    jdSummary: string
  ): Promise<FieldMapping[]>
  ```

- [ ] **Step 1: Update the ai.service mock in the test file**

In `src/services/__tests__/field-mapper.service.test.ts`, replace the `jest.mock('../ai.service', ...)` block:

```typescript
jest.mock('../ai.service', () => ({
  generateText: jest.fn().mockResolvedValue('AI generated answer'),
  generateStructuredFields: jest.fn().mockResolvedValue({ f0: 'AI generated answer' }),
  extractJDRequirements: jest.fn().mockResolvedValue('- Node.js required\n- TypeScript preferred'),
}));
```

Also add a mock for Supabase (the current tests mock `db` but the service uses Supabase):

```typescript
jest.mock('../supabase', () => ({
  supabase: {
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: {
          id: 1,
          user_id: 'user-1',
          parsed_text: 'Mervej Raj\nSoftware Engineer\nmervejraj@gmail.com\n+91 97645 77845',
        },
        error: null,
      }),
    }),
  },
}));
```

Update the `describe('FieldMapperService.mapFields')` test that checks for `resumeId` not found:

```typescript
it('throws when resume is not found', async () => {
  const { supabase } = require('../supabase');
  supabase.from.mockReturnValueOnce({
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: null, error: new Error('not found') }),
  });

  await expect(service.mapFields([], '99', 'https://example.com/apply')).rejects.toThrow(
    'Resume not found'
  );
});
```

Update the dropdown option tests to use `generateStructuredFields` instead of `generateText`:

```typescript
describe('FieldMapperService - dropdown option enforcement', () => {
  let generateStructuredFields: jest.Mock;

  beforeEach(() => {
    generateStructuredFields = require('../ai.service').generateStructuredFields;
    generateStructuredFields.mockClear();
  });

  it('passes option texts to generateStructuredFields for dropdown fields', async () => {
    generateStructuredFields.mockResolvedValueOnce({ f0: '3-5 years' });

    const fields: ExtensionField[] = [
      field({
        selector: 'select[name="exp_level"]',
        elementType: 'select',
        fieldName: 'exp_level',
        label: 'Experience Level',
        options: [
          { value: '1', text: '0-2 years' },
          { value: '2', text: '3-5 years' },
          { value: '3', text: '6-10 years' },
        ],
      }),
    ];

    await service.mapFields(fields, '1', 'https://example.com/apply');

    const callArgs = JSON.stringify(generateStructuredFields.mock.calls[0]);
    expect(callArgs).toContain('0-2 years');
    expect(callArgs).toContain('3-5 years');
    expect(callArgs).toContain('6-10 years');
  });

  it('uses exact AI answer when it matches an available option', async () => {
    generateStructuredFields.mockResolvedValueOnce({ f0: '3-5 years' });

    const fields: ExtensionField[] = [
      field({
        selector: 'select[name="exp_level"]',
        elementType: 'select',
        fieldName: 'exp_level',
        label: 'Experience Level',
        options: [
          { value: '1', text: '0-2 years' },
          { value: '2', text: '3-5 years' },
          { value: '3', text: '6-10 years' },
        ],
      }),
    ];

    const result = await service.mapFields(fields, '1', 'https://example.com/apply');
    const mapping = result.mappings.find(m => m.selector === 'select[name="exp_level"]');
    expect(mapping?.value).toBe('3-5 years');
  });

  it('snaps AI answer to full option text when answer is a substring of an option', async () => {
    generateStructuredFields.mockResolvedValueOnce({ f0: 'I am authorized' });

    const fields: ExtensionField[] = [
      field({
        selector: 'select[name="work_auth"]',
        elementType: 'select',
        fieldName: 'work_auth',
        label: 'Preferred work arrangement',
        options: [
          { value: 'yes', text: 'I am authorized to work in the US' },
          { value: 'no', text: 'I will require sponsorship' },
        ],
      }),
    ];

    const result = await service.mapFields(fields, '1', 'https://example.com/apply');
    const mapping = result.mappings.find(m => m.selector === 'select[name="work_auth"]');
    expect(mapping?.value).toBe('I am authorized to work in the US');
  });

  it('leaves value empty and confidence 0 when AI answer matches no option', async () => {
    generateStructuredFields.mockResolvedValueOnce({ f0: 'Something completely unrelated' });

    const fields: ExtensionField[] = [
      field({
        selector: 'select[name="exp_level"]',
        elementType: 'select',
        fieldName: 'exp_level',
        label: 'Experience Level',
        options: [
          { value: '1', text: '0-2 years' },
          { value: '2', text: '3-5 years' },
          { value: '3', text: '6-10 years' },
        ],
      }),
    ];

    const result = await service.mapFields(fields, '1', 'https://example.com/apply');
    const mapping = result.mappings.find(m => m.selector === 'select[name="exp_level"]');
    expect(mapping?.value).toBe('');
    expect(mapping?.confidence).toBe(0);
  });
});
```

Add a new test for empty required field promotion:

```typescript
describe('FieldMapperService - empty required field promotion', () => {
  let generateStructuredFields: jest.Mock;

  beforeEach(() => {
    generateStructuredFields = require('../ai.service').generateStructuredFields;
    generateStructuredFields.mockClear();
  });

  it('promotes empty required Tier-1 field to AI batch', async () => {
    generateStructuredFields.mockResolvedValueOnce({ f0: '+1 555 0100' });

    const fields: ExtensionField[] = [
      field({
        selector: 'input[name="phone"]',
        label: 'Phone Number',
        fieldName: 'phone',
        required: true,
        // phone maps to Tier 1 but profile has no phone value → should be promoted
      }),
    ];

    // Override supabase mock: profile returns no phone
    const { supabase } = require('../supabase');
    supabase.from.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { id: 1, user_id: 'user-1', parsed_text: 'Jane Doe resume text' },
        error: null,
      }),
    }).mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { full_name: 'Jane Doe', email: 'jane@example.com', phone: null },
        error: null,
      }),
    });

    const result = await service.mapFields(fields, '1', 'https://example.com/apply');
    expect(generateStructuredFields).toHaveBeenCalled();
    const mapping = result.mappings.find(m => m.selector === 'input[name="phone"]');
    expect(mapping?.value).toBe('+1 555 0100');
  });
});
```

- [ ] **Step 2: Run tests to verify the updated mocks compile but test expectations may fail**

```bash
npm test -- --testPathPattern="field-mapper" 2>&1 | tail -30
```

Expected: some tests fail due to the mock shape change — that's fine, we haven't changed the service yet.

- [ ] **Step 3: Add `buildFormatHint` helper to `field-mapper.service.ts`**

Add after the existing `buildAiFieldPrompt` function (keep `buildAiFieldPrompt` — it is still referenced by `mapFieldsToData` for edge cases):

```typescript
function buildFormatHint(field: ExtensionField): string {
  const validOptions = (field.options || []).filter(
    o => o.text?.trim() && !/^(-+|select\.?\.?\.?|choose\.?\.?\.?|please select)$/i.test(o.text.trim())
  );
  if (validOptions.length > 0) {
    return `respond with EXACTLY one of these options: ${validOptions.map(o => o.text).join(' | ')}`;
  }

  const question = (field.questionText || field.label || field.fieldName).replace(/[✱*]+$/, '').trim();
  const q = question.toLowerCase();

  if (question.includes('?') && /\b(do you|have you|are you|will you|can you|is your|did you|would you|are there)\b/i.test(question)) {
    return 'Yes or No only';
  }
  if (/\b(cgpa|gpa|percentage|score|grade)\b/.test(q) || (/\b%\b/.test(q) && !question.includes('?'))) {
    return 'value only, e.g. "8.5 CGPA" or "76%"';
  }
  if (/\btotal.*year|\byears? of experience|\bexperience.*year/.test(q)) {
    return 'number only, e.g. "8"';
  }
  if (/\b(year|date|month|when)\b/.test(q) && !question.includes('?')) {
    return 'MM/YYYY format only, e.g. "06/2019"';
  }
  if (/\b(list|all|mention|companies|achievements|provide all)\b/i.test(question)) {
    return 'clean list, one item per line';
  }
  if (question.length < 50 && !question.includes('?')) {
    return 'value only, no labels or extra text';
  }
  return '1-3 sentences, first person, no preamble or explanation';
}
```

- [ ] **Step 4: Replace `generateAnswersForAIFields` in `field-mapper.service.ts`**

Replace the entire `generateAnswersForAIFields` method with:

```typescript
private async generateAnswersForAIFields(
  mappings: FieldMapping[],
  resumeText: string,
  structuredResume: StructuredResume,
  jdSummary: string
): Promise<FieldMapping[]> {
  const aiMappings = mappings.filter(m => m.needsAI);
  if (aiMappings.length === 0) return mappings;

  const fieldSpecs: FieldSpec[] = aiMappings.map((m, i) => ({
    id: `f${i}`,
    label: m.field.questionText || m.field.label || m.field.fieldName,
    formatHint: buildFormatHint(m.field),
  }));

  const answers = await generateStructuredFields(fieldSpecs, structuredResume, jdSummary);

  for (let i = 0; i < aiMappings.length; i++) {
    const answer = answers[`f${i}`];
    if (!answer?.trim()) continue;

    const validOptions = (aiMappings[i].field.options || []).filter(
      o => o.text?.trim() && !/^(-+|select\.?\.?\.?|choose\.?\.?\.?|please select)$/i.test(o.text.trim())
    );

    if (validOptions.length > 0) {
      const matched = this.fuzzyMatchOption(answer.trim(), validOptions);
      if (matched) aiMappings[i].mappedData = matched;
    } else {
      aiMappings[i].mappedData = answer.trim();
    }
  }

  return mappings;
}
```

- [ ] **Step 5: Update imports in `field-mapper.service.ts`**

Replace the existing ai.service import:

```typescript
import { generateText, generateStructuredFields, extractJDRequirements, FieldSpec } from './ai.service';
```

(`generateText` is still needed by the cover letter path through `CoverLetterGenerator`.)

- [ ] **Step 6: Add empty required field promotion in `mapFieldsToData`**

In the `mapFieldsToData` method, after the `switch (semanticType)` block and before the `// ── Options handling` comment, add:

```typescript
// Promote empty required Tier-1 answers to AI batch
if (DIRECT_TYPES.has(semanticType) && !needsAI && (mappedData === '' || mappedData === undefined) && field.required) {
  needsAI = true;
  aiPrompt = undefined;
}
```

- [ ] **Step 7: Update `mapFields` to call `extractJDRequirements` and pass through `structuredResume` and `jdSummary`**

In `mapFields`, make the following changes:

**a.** Upgrade the `structuredResume` assembly to include `profileDetails`:

Replace the existing structuredResume block:
```typescript
const structuredResume: any = {
  profileDetails: {},
  experience: Array.isArray(profile?.experience) ? profile.experience : [],
  education: Array.isArray(profile?.education) ? profile.education : [],
  skills: Array.isArray(profile?.skills) ? profile.skills : [],
};
```

With:
```typescript
const structuredResume: StructuredResume = {
  profileDetails: {
    name: profile?.full_name || '',
    email: profile?.email || '',
    phone: profile?.phone || '',
    location: profile?.location || '',
    linkedin: profile?.linkedin || '',
    github: profile?.github || '',
  },
  experience: Array.isArray(profile?.experience) ? profile.experience : [],
  education: Array.isArray(profile?.education) ? profile.education : [],
  skills: Array.isArray(profile?.skills) ? profile.skills : [],
};
```

**b.** Add JD extraction after the job description is resolved. Replace the existing cover letter try/catch block:

```typescript
const coverLetterGenerator = new CoverLetterGenerator();
let coverLetter = '';

try {
  let jobDescription;
  if (jobText && jobText.trim().length > 100) {
    jobDescription = { title: '', company: '', description: jobText, url: jobUrl };
  } else {
    const jobCrawler = new JobCrawler();
    try {
      jobDescription = await jobCrawler.crawlJobDescription(jobUrl);
    } finally {
      await jobCrawler.close();
    }
  }
  coverLetter = await coverLetterGenerator.generateCoverLetter(jobDescription, userProfile, resumeText);
} catch {
  // Cover letter generation failure is non-fatal — proceed without it
}
```

With:

```typescript
const coverLetterGenerator = new CoverLetterGenerator();
let coverLetter = '';

let jobDescription: { title: string; company: string; description: string; url: string; location?: string } | undefined;
try {
  if (jobText && jobText.trim().length > 100) {
    jobDescription = { title: '', company: '', description: jobText, url: jobUrl };
  } else {
    const jobCrawler = new JobCrawler();
    try {
      jobDescription = await jobCrawler.crawlJobDescription(jobUrl);
    } finally {
      await jobCrawler.close();
    }
  }
} catch {
  // non-fatal
}

let jdSummary = '';
try {
  const jdText = jobDescription?.description || jobText || '';
  if (jdText.trim().length > 50) {
    jdSummary = await extractJDRequirements(jdText);
  }
} catch {
  // jdSummary stays ''
}

try {
  coverLetter = await coverLetterGenerator.generateCoverLetter(
    jobDescription || { title: '', company: '', description: '', url: jobUrl },
    userProfile,
    resumeText,
    jdSummary,
    structuredResume
  );
} catch {
  // non-fatal
}
```

**c.** Pass `structuredResume` and `jdSummary` to `generateAnswersForAIFields`. Replace:

```typescript
const resolved = await this.generateAnswersForAIFields(mappings, resumeText);
```

With:

```typescript
const resolved = await this.generateAnswersForAIFields(mappings, resumeText, structuredResume, jdSummary);
```

Also add `StructuredResume` to the import from `'./resume'`:
```typescript
import { StructuredResume } from './resume';
```
(It may already be imported — check and add only if missing.)

- [ ] **Step 8: Run all tests**

```bash
npm test 2>&1 | tail -30
```

Expected: PASS — all tests green.

- [ ] **Step 9: Commit**

```bash
git add src/services/field-mapper.service.ts src/services/__tests__/field-mapper.service.test.ts
git commit -m "feat: batch AI field answering with structured output and JD extraction"
```

---

### Task 3: Update `cover-letter-generator.ts` to use `jdSummary` and structured experience

**Files:**
- Modify: `src/services/cover-letter-generator.ts`

**Interfaces:**
- Consumes: `StructuredResume` from `'./resume'`
- `generateCoverLetter` new signature (existing callers still compile because new params have defaults):
  ```typescript
  async generateCoverLetter(
    jobDescription: JobDescription,
    userProfile: UserProfile,
    resumeText: string,
    jdSummary = '',
    structuredResume?: StructuredResume
  ): Promise<string>
  ```

- [ ] **Step 1: Write failing test**

Create `src/services/__tests__/cover-letter-generator.test.ts`:

```typescript
import { CoverLetterGenerator } from '../cover-letter-generator';
import { StructuredResume } from '../resume';

jest.mock('../ai.service', () => ({
  generateText: jest.fn().mockResolvedValue('Dear Hiring Manager, this is a great cover letter.'),
}));

jest.mock('../config/ai.config', () => ({
  default: {
    provider: 'openai',
    model: 'gpt-4o-mini',
    openai: { apiKey: 'test-key' },
    groq: { apiKey: '', model: '' },
    ollama: { url: '', model: '', visionModel: '' },
  },
}));

const jobDescription = {
  title: 'Senior Engineer',
  company: 'Acme Corp',
  url: 'https://acme.com/apply',
  description: 'We need a senior Node.js engineer with 5+ years experience.',
  location: 'Remote',
};

const userProfile = {
  name: 'Jane Doe',
  email: 'jane@example.com',
  experience: '',
  skills: ['Node.js', 'TypeScript'],
  achievements: [],
};

const mockStructuredResume: StructuredResume = {
  profileDetails: { name: 'Jane Doe' },
  experience: [
    { company: 'Acme', role: 'Senior Engineer', startDate: '01/2020', endDate: 'Present', description: 'Led backend team' },
    { company: 'StartupXYZ', role: 'Engineer', startDate: '06/2018', endDate: '12/2019', description: 'Built APIs' },
  ],
  education: [
    { institution: 'MIT', degree: 'B.Tech', fieldOfStudy: 'Computer Science', startDate: '2014', endDate: '2018' },
  ],
  skills: ['Node.js', 'TypeScript'],
};

describe('CoverLetterGenerator.generateCoverLetter', () => {
  let generateText: jest.Mock;

  beforeEach(() => {
    generateText = require('../ai.service').generateText;
    generateText.mockClear();
  });

  it('includes jdSummary in the prompt under KEY REQUIREMENTS', async () => {
    const generator = new CoverLetterGenerator();
    await generator.generateCoverLetter(
      jobDescription,
      userProfile,
      'resume text',
      '- 5+ years Node.js\n- TypeScript required',
    );

    const promptArg = generateText.mock.calls[0].flat().join('\n');
    expect(promptArg).toContain('5+ years Node.js');
    expect(promptArg).toContain('TypeScript required');
  });

  it('does NOT contain "Not specified" when jdSummary is provided', async () => {
    const generator = new CoverLetterGenerator();
    await generator.generateCoverLetter(
      jobDescription,
      userProfile,
      'resume text',
      '- 5+ years Node.js',
    );

    const promptArg = generateText.mock.calls[0].flat().join('\n');
    expect(promptArg).not.toContain('Not specified');
  });

  it('includes structured experience entries in the prompt', async () => {
    const generator = new CoverLetterGenerator();
    await generator.generateCoverLetter(
      jobDescription,
      userProfile,
      'resume text',
      '- Node.js required',
      mockStructuredResume
    );

    const promptArg = generateText.mock.calls[0].flat().join('\n');
    expect(promptArg).toContain('Senior Engineer at Acme');
    expect(promptArg).toContain('Engineer at StartupXYZ');
  });

  it('includes education in the prompt when structuredResume is provided', async () => {
    const generator = new CoverLetterGenerator();
    await generator.generateCoverLetter(
      jobDescription,
      userProfile,
      'resume text',
      '',
      mockStructuredResume
    );

    const promptArg = generateText.mock.calls[0].flat().join('\n');
    expect(promptArg).toContain('B.Tech');
    expect(promptArg).toContain('MIT');
  });

  it('still works when called without jdSummary and structuredResume (backwards compat)', async () => {
    const generator = new CoverLetterGenerator();
    const result = await generator.generateCoverLetter(jobDescription, userProfile, 'resume text');
    expect(result).toBe('Dear Hiring Manager, this is a great cover letter.');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --testPathPattern="cover-letter-generator" 2>&1 | tail -20
```

Expected: FAIL — test file compiles but assertions fail because the current prompt has "Not specified" and no structured experience.

- [ ] **Step 3: Add `StructuredResume` import and update `generateCoverLetter` signature**

In `src/services/cover-letter-generator.ts`, add to imports:

```typescript
import { StructuredResume } from './resume';
```

Update the `generateCoverLetter` method signature:

```typescript
async generateCoverLetter(
  jobDescription: JobDescription,
  userProfile: UserProfile,
  resumeText: string,
  jdSummary = '',
  structuredResume?: StructuredResume
): Promise<string> {
```

Update the call to `buildUserPrompt` at the bottom of the method:

```typescript
const userPrompt = this.buildUserPrompt(jobDescription, userProfile, resumeText, jdSummary, structuredResume);
```

- [ ] **Step 4: Replace `buildUserPrompt` in `cover-letter-generator.ts`**

Replace the entire `buildUserPrompt` method:

```typescript
private buildUserPrompt(
  job: JobDescription,
  user: UserProfile,
  resumeText: string,
  jdSummary: string,
  structuredResume?: StructuredResume
): string {
  const experienceBlock = structuredResume?.experience?.length
    ? structuredResume.experience
        .map(e => `- ${e.role} at ${e.company} (${e.startDate} – ${e.endDate || 'Present'}): ${e.description || ''}`)
        .join('\n')
    : user.experience || 'See resume';

  const educationBlock = structuredResume?.education?.length
    ? structuredResume.education
        .map(e => `- ${e.degree}${e.fieldOfStudy ? ` in ${e.fieldOfStudy}` : ''}, ${e.institution} (${e.startDate}–${e.endDate})`)
        .join('\n')
    : '';

  return `
Write a tailored cover letter based on the following structured data.

### JOB DETAILS
- Title: ${job.title}
- Company: ${job.company}
- Location: ${job.location || 'Not specified'}
- URL: ${job.url}

### KEY REQUIREMENTS
${jdSummary || 'See job description below'}

### JOB DESCRIPTION
${job.description || 'Not provided'}

### CANDIDATE PROFILE
- Name: ${user.name}
- Email: ${user.email}
${user.linkedin ? `- LinkedIn: ${user.linkedin}` : ''}
${user.github ? `- GitHub: ${user.github}` : ''}
${user.location ? `- Location: ${user.location}` : ''}

### CANDIDATE EXPERIENCE
${experienceBlock}
${educationBlock ? `\n### EDUCATION\n${educationBlock}` : ''}

### SKILLS
${user.skills.join(', ')}

### RESUME
${resumeText}

### GUIDANCE
Generate a polished, personal, job-specific cover letter that clearly connects the candidate's background to the KEY REQUIREMENTS above. Use warm professional language, first-person perspective, and avoid clichés.
  `.trim();
}
```

- [ ] **Step 5: Run all tests**

```bash
npm test 2>&1 | tail -30
```

Expected: PASS — all tests green including the new cover letter tests.

- [ ] **Step 6: Commit**

```bash
git add src/services/cover-letter-generator.ts src/services/__tests__/cover-letter-generator.test.ts
git commit -m "feat: cover letter uses jdSummary and structured experience"
```

---

## Self-Review Checklist

### Spec coverage

| Spec requirement | Task |
|---|---|
| Add `extractJDRequirements()` to `ai.service.ts` | Task 1 |
| Add `generateStructuredFields()` with JSON mode | Task 1 |
| Batch AI fields in one call (N→1) | Task 2 |
| Use structured resume JSON instead of raw text | Task 2 (Step 7a) |
| Pass `jdSummary` to field answering | Task 2 (Step 7c) |
| Promote empty required Tier-1 fields to AI batch | Task 2 (Step 6) |
| Batch limit: split at 25 fields | Task 1 (Step 4) |
| `extractJDRequirements` called in `mapFields` | Task 2 (Step 7b) |
| Cover letter uses `jdSummary` (no "Not specified") | Task 3 |
| Cover letter uses structured experience | Task 3 |
| Backwards compatibility: existing callers compile | Task 3 (optional params) |
| `getFieldSemanticType`, `mapEntryFields` unchanged | Enforced — not touched |

### No gaps found.
