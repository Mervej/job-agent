# AI-Driven Form Filling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace per-field phi3 AI calls with a single GPT-4o-mini batch call, add cover letter PDF upload, and add screenshot-based verification — making the form filler fully AI-driven with no hardcoded logic.

**Architecture:** `HtmlFormExtractorAgent` gets a new `extractAndAnswerFields()` method that sends the full form XML summary + resume text to GPT-4o-mini in one call and receives all field answers as JSON. `ApplicationFiller` saves a full-page screenshot after filling and returns its path. The `/apply-jobs` skill reads the screenshot with the `Read` tool and Claude evaluates it visually.

**Tech Stack:** TypeScript, OpenAI API (gpt-4o-mini), pdfkit, Playwright, Node.js/Express

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `.env.dev` | Modify | Switch AI_PROVIDER=openai, AI_MODEL=gpt-4o-mini |
| `src/agents/html-form-extractor.agent.ts` | Modify | Replace answerFields() + extractFields() with one batch call method |
| `src/services/cover-letter-generator.ts` | Modify | Add generateCoverLetterPDF() using pdfkit |
| `src/services/application-filler.ts` | Modify | Use new batch method; pass coverLetterPdfPath to filler; save screenshot to disk; add screenshotPath to result |
| `~/.claude/skills/apply-jobs/SKILL.md` | Modify | Update Verifier Agent to read screenshot file and evaluate visually |
| `package.json` | Modify | Add pdfkit + @types/pdfkit |

---

## Task 1: Switch to OpenAI provider

**Files:**
- Modify: `.env.dev`

- [ ] **Step 1: Update .env.dev**

Change these two lines in `.env.dev`:
```
AI_PROVIDER=openai
AI_MODEL=gpt-4o-mini
```

- [ ] **Step 2: Verify the server picks up the change**

```bash
cd /Users/mervej.raj/Documents/Projects/Personal/job-agent && grep "AI_PROVIDER\|AI_MODEL" .env.dev
```
Expected output:
```
AI_PROVIDER=openai
AI_MODEL=gpt-4o-mini
```

- [ ] **Step 3: Verify OpenAI path works in ai.service.ts**

Read `src/services/ai.service.ts` lines 1–20 and confirm the `openai` branch calls `https://api.openai.com/v1/chat/completions` with `config.openai.apiKey`. No code change needed — the path already exists.

- [ ] **Step 4: Commit**

```bash
git add .env.dev
git commit -m "config: switch AI provider to OpenAI gpt-4o-mini"
```

---

## Task 2: Install pdfkit

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install pdfkit**

```bash
cd /Users/mervej.raj/Documents/Projects/Personal/job-agent && npm install pdfkit && npm install --save-dev @types/pdfkit
```
Expected: pdfkit appears in `dependencies`, @types/pdfkit in `devDependencies`.

- [ ] **Step 2: Verify install**

```bash
ls node_modules/pdfkit/package.json
```
Expected: file exists.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "deps: add pdfkit for cover letter PDF generation"
```

---

## Task 3: Add generateCoverLetterPDF to CoverLetterGenerator

**Files:**
- Modify: `src/services/cover-letter-generator.ts`

- [ ] **Step 1: Add the import and method**

Add at the top of `src/services/cover-letter-generator.ts` after the existing import:
```typescript
import PDFDocument from 'pdfkit';
import fs from 'fs';
```

Add this method to the `CoverLetterGenerator` class after `generateMultipleCoverLetters()`:
```typescript
async generateCoverLetterPDF(text: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 72, size: 'A4' });
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);
    doc.fontSize(11).font('Helvetica').text(text, { lineGap: 4 });
    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/mervej.raj/Documents/Projects/Personal/job-agent && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors (or only pre-existing unrelated errors).

- [ ] **Step 3: Commit**

```bash
git add src/services/cover-letter-generator.ts
git commit -m "feat: add generateCoverLetterPDF to CoverLetterGenerator"
```

---

## Task 4: Replace per-field AI calls with batch GPT call in HtmlFormExtractorAgent

**Files:**
- Modify: `src/agents/html-form-extractor.agent.ts`

This is the core change. We add one new method `extractAndAnswerFields()` that replaces the `extractFields()` + `answerFields()` call chain. The old methods are removed.

- [ ] **Step 1: Remove everything after `getFormHTML()` and add the new batch method**

Replace the entire file content from the `extractFields()` method onwards (line 396 to end of file) with the following. Keep everything before line 396 unchanged (the interfaces, `EXTRACT_SYSTEM_PROMPT` is removed, helper functions are removed, `getFormHTML()` stays).

The new file from line 1 should be:

```typescript
import { Page, Frame } from 'playwright';
import { generateText } from '../services/ai.service';

// Step 1 output: fields extracted from HTML — no answers yet
export interface ExtractedField {
  label: string;
  type: 'text' | 'textarea' | 'select' | 'checkbox' | 'radio' | 'file';
  selector: string;
  required: boolean;
  options?: string[];
  placeholder?: string;
  section?: string;
  maxLength?: number;
}

// Step 2 output: field with AI-generated answer attached
export interface AIField extends ExtractedField {
  answer: string;
}

const BATCH_SYSTEM_PROMPT = `You are filling a job application form on behalf of a candidate.

Given structured XML describing every form field and the candidate's resume, return a JSON array with the best answer for every field.

OUTPUT FORMAT — return ONLY valid JSON, no markdown, no code fences:
[
  {"selector": "...", "label": "...", "type": "...", "required": true, "options": [], "answer": "..."},
  ...
]

RULES:
- Copy selector, label, type, required, and options EXACTLY from the XML — do not modify them
- For "answer":
  - text/email/tel: extract exact value from resume (e.g. full email address, full phone number with country code)
  - textarea for cover letter (label contains "cover letter" or "motivation letter"): return "COVER_LETTER_TEXTAREA"
  - textarea for other fields: write a relevant answer in first person, no markdown, no headings
  - select/radio: return EXACTLY one of the <options> values, word-for-word
  - file input with label containing "cover letter": return "COVER_LETTER_FILE"
  - file input (resume/cv): return "RESUME_FILE"
  - EEO/demographic fields (gender, race, ethnicity, disability, veteran status, pronouns): return the option that means "decline to answer / prefer not to say", or "" if none
  - dial code dropdowns (options are international codes like +1, +44, +91): return "+91" or the exact India option text
  - fields with no matching information in the resume: return ""
- NEVER return "N/A", "not provided", "not available", or explanations — only the value or ""
- Include EVERY field from the XML in the output — do not skip any`;

// ─── Agent ────────────────────────────────────────────────────────────────────

export class HtmlFormExtractorAgent {
  /**
   * Builds a compact, structured field summary from the page and all child frames.
   */
  async getFormHTML(page: Page): Promise<string> {
    const extractFromFrame = async (frame: Frame): Promise<string> => {
      return frame.evaluate(() => {
        const isVisible = (el: HTMLElement): boolean => {
          if (el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true') return false;
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') return false;
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        };

        const directText = (el: Element): string => {
          let text = '';
          el.childNodes.forEach(node => {
            if (node.nodeType === Node.TEXT_NODE) {
              text += node.textContent || '';
            } else if (node.nodeType === Node.ELEMENT_NODE) {
              const tag = (node as Element).tagName.toLowerCase();
              if (!['input', 'select', 'textarea', 'button', 'svg'].includes(tag)) {
                text += directText(node as Element);
              }
            }
          });
          return text.replace(/\s+/g, ' ').replace(/[*]/g, '').trim();
        };

        const getLabel = (el: HTMLElement): string => {
          const aria = el.getAttribute('aria-label');
          if (aria?.trim()) return aria.trim();

          const labelledBy = el.getAttribute('aria-labelledby');
          if (labelledBy) {
            const parts = labelledBy.split(' ')
              .map(id => {
                const ref = document.getElementById(id);
                return ref ? directText(ref) : '';
              })
              .filter(Boolean);
            if (parts.length) return parts.join(' ');
          }

          const id = (el as HTMLInputElement).id;
          if (id) {
            const lbl = document.querySelector(`label[for="${id}"]`);
            if (lbl) {
              const t = directText(lbl);
              if (t) return t;
            }
          }

          if ((el as HTMLInputElement).placeholder?.trim()) {
            return (el as HTMLInputElement).placeholder.trim();
          }

          const elName = (el as HTMLInputElement).name || '';
          if (elName && /^[a-z][a-z0-9_]*$/.test(elName)) {
            return elName.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
          }

          const group = el.closest('[class*="field"], [class*="form"], [class*="row"], [class*="group"], li, section');
          if (group) {
            const lbl = group.querySelector('label, legend');
            if (lbl) {
              const t = directText(lbl);
              if (t) return t;
            }
          }

          return '';
        };

        const makeSelector = (el: HTMLElement): string => {
          const tag = el.tagName.toLowerCase();
          const id = (el as HTMLInputElement).id;
          const name = (el as HTMLInputElement).name;
          const ariaLabel = el.getAttribute('aria-label');
          const dataUi = el.getAttribute('data-ui');
          const placeholder = (el as HTMLInputElement).placeholder;

          if (id) return `${tag}[id='${id}']`;
          if (name) return `${tag}[name='${name}']`;
          if (dataUi) return `${tag}[data-ui='${dataUi}']`;
          if (ariaLabel) return `${tag}[aria-label='${ariaLabel}']`;
          if (placeholder) return `${tag}[placeholder='${placeholder}']`;
          const autofillIdx = el.dataset.autofillIdx;
          return autofillIdx ? `${tag}[data-autofill-idx='${autofillIdx}']` : tag;
        };

        const lines: string[] = ['<form-fields>'];
        const seenRadioGroups = new Set<string>();

        const getSectionHeading = (el: HTMLElement): string => {
          let ancestor = el.parentElement;
          while (ancestor) {
            const role = ancestor.getAttribute('role');
            const tag = ancestor.tagName.toLowerCase();
            if (role === 'region' || tag === 'section' || tag === 'fieldset') {
              const heading = ancestor.querySelector('h1,h2,h3,h4,h5,h6,legend,[role="heading"]');
              if (heading) {
                const text = (heading.textContent || '').trim();
                if (text) return text;
              }
            }
            ancestor = ancestor.parentElement;
          }
          return '';
        };

        let autofillIdx = 0;
        document.querySelectorAll<HTMLElement>(
          'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]),' +
          'textarea,select'
        ).forEach(el => { el.dataset.autofillIdx = String(autofillIdx++); });

        const controls = document.querySelectorAll<HTMLElement>(
          'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([disabled]),' +
          'textarea:not([disabled]),' +
          'select:not([disabled])'
        );

        controls.forEach(el => {
          if (!isVisible(el)) return;

          const tag = el.tagName.toLowerCase();
          const inputType = (el as HTMLInputElement).type || 'text';
          const name = (el as HTMLInputElement).name || '';

          if (inputType === 'radio') {
            if (seenRadioGroups.has(name)) return;
            seenRadioGroups.add(name);
          }

          const selector = makeSelector(el);
          const rawLabel = getLabel(el);
          const sectionHeading = getSectionHeading(el);
          const required = (el as HTMLInputElement).required ||
            el.getAttribute('aria-required') === 'true';

          let type = 'text';
          if (tag === 'textarea') type = 'textarea';
          else if (tag === 'select') type = 'select';
          else if (inputType === 'radio') type = 'radio';
          else if (inputType === 'checkbox') type = 'checkbox';
          else if (inputType === 'file') type = 'file';

          const DATE_NAME_LABELS: Record<string, string> = {
            start_date: 'Start Date', end_date: 'End Date',
            from_date: 'From Date', to_date: 'To Date',
            graduation_date: 'Graduation Date',
          };
          const label = DATE_NAME_LABELS[name] || rawLabel;
          const placeholder = (el as HTMLInputElement).placeholder?.trim() || '';
          const maxLength = (el as HTMLTextAreaElement).maxLength > 0 ? (el as HTMLTextAreaElement).maxLength : null;

          lines.push(`  <field type="${type}" selector="${selector}" required="${required}"${placeholder ? ` placeholder="${placeholder}"` : ''}${maxLength ? ` maxlength="${maxLength}"` : ''}${sectionHeading ? ` section="${sectionHeading}"` : ''}>`);
          lines.push(`    <label>${label}</label>`);

          if (tag === 'select') {
            const opts = Array.from((el as HTMLSelectElement).options)
              .map(o => o.text.trim())
              .filter(t => t && !/^(select|choose|--)/i.test(t));
            if (opts.length) lines.push(`    <options>${opts.join(', ')}</options>`);
          }

          if (inputType === 'radio' && name) {
            const radios = document.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${name}"]`);
            const opts: string[] = [];
            radios.forEach(r => {
              const id = r.id;
              const lbl = id ? document.querySelector(`label[for="${id}"]`)?.textContent?.trim() : '';
              const val = lbl || r.value;
              if (val) opts.push(val);
            });
            if (opts.length) lines.push(`    <options>${opts.join(', ')}</options>`);
          }

          lines.push('  </field>');
        });

        lines.push('</form-fields>');
        return lines.join('\n');
      }).catch(() => '');
    };

    const parts: string[] = [];
    const main = await extractFromFrame(page.mainFrame());
    if (main.trim().length > 20) parts.push(main);

    const collectFrames = async (frames: Frame[]): Promise<void> => {
      for (const frame of frames) {
        try {
          const fHtml = await extractFromFrame(frame);
          if (fHtml && fHtml.trim().length > 50) {
            parts.push(`<!-- iframe: ${frame.url()} -->\n${fHtml}`);
          }
          await collectFrames(frame.childFrames());
        } catch { /* cross-origin or detached */ }
      }
    };
    await collectFrames(page.mainFrame().childFrames());

    const result = parts.join('\n\n');
    console.log(`[HtmlExtractor] Form summary built: ${result.length} chars`);
    return result;
  }

  /**
   * Single batch call: sends form XML + resume to GPT-4o-mini, returns all field answers at once.
   * Replaces the old extractFields() + answerFields() two-step pipeline.
   */
  async extractAndAnswerFields(
    formHTML: string,
    resumeText: string,
    options?: { coverLetterText?: string; isStructuredEntry?: boolean }
  ): Promise<AIField[]> {
    const coverLetterBlock = options?.coverLetterText
      ? `\n\nCOVER LETTER (use this text verbatim for cover letter textarea fields):\n${options.coverLetterText}`
      : '';

    const userPrompt = `FORM FIELDS:\n${formHTML}\n\nCANDIDATE RESUME:\n${resumeText}${coverLetterBlock}\n\nReturn ONLY the JSON array.`;

    const MAX_ATTEMPTS = 3;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      console.log(`[HtmlExtractor] Batch answering fields (attempt ${attempt}/${MAX_ATTEMPTS}) for ${formHTML.length} char form...`);

      const response = await generateText(BATCH_SYSTEM_PROMPT, userPrompt, 4000);
      if (!response?.trim()) {
        console.log(`[HtmlExtractor] Empty response on attempt ${attempt}`);
        continue;
      }

      const fields = this.parseAnswersRobust(response.trim());
      if (fields.length > 0) {
        console.log(`[HtmlExtractor] Batch answered ${fields.length} fields:`);
        fields.forEach(f => console.log(`  • "${f.label}" → "${String(f.answer).slice(0, 60)}"`));
        return fields;
      }

      console.log(`[HtmlExtractor] Got 0 fields on attempt ${attempt}, retrying...`);
    }

    console.log('[HtmlExtractor] All batch attempts failed, returning empty');
    return [];
  }

  private parseAnswersRobust(raw: string): AIField[] {
    let cleaned = raw.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

    // Strip markdown code fences if present
    const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) cleaned = fenceMatch[1].trim();

    // Try full parse first
    try {
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) return parsed as AIField[];
    } catch { /* fall through */ }

    // Partial recovery: extract each complete {...} object
    const fields: AIField[] = [];
    let depth = 0;
    let start = -1;
    for (let i = 0; i < cleaned.length; i++) {
      if (cleaned[i] === '{') {
        if (depth === 0) start = i;
        depth++;
      } else if (cleaned[i] === '}') {
        depth--;
        if (depth === 0 && start !== -1) {
          const fragment = cleaned.slice(start, i + 1);
          try {
            const obj = JSON.parse(fragment);
            if (obj.selector && obj.label && obj.type !== undefined) {
              fields.push({ ...obj, answer: obj.answer ?? '' } as AIField);
            }
          } catch { /* malformed fragment */ }
          start = -1;
        }
      }
    }

    if (fields.length > 0) {
      console.log(`[HtmlExtractor] Partial recovery: ${fields.length} field(s)`);
    }
    return fields;
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/mervej.raj/Documents/Projects/Personal/job-agent && npx tsc --noEmit 2>&1 | head -30
```
Expected: no new errors from `html-form-extractor.agent.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/agents/html-form-extractor.agent.ts
git commit -m "feat: replace per-field phi3 loop with single GPT-4o-mini batch call"
```

---

## Task 5: Wire batch call into ApplicationFiller

**Files:**
- Modify: `src/services/application-filler.ts`

The main orchestrator `processSingleApplication()` currently calls `extractFields()` then `answerFields()` (lines ~2410–2435). Replace those two calls with `extractAndAnswerFields()`. Also: generate cover letter PDF before filling, save screenshot to disk, return `screenshotPath`.

- [ ] **Step 1: Add screenshotPath to ApplicationResult type**

Find `ApplicationResult` (line ~13) and add `screenshotPath`:
```typescript
export interface ApplicationResult {
  success: boolean;
  error?: string;
  screenshot?: Buffer;
  screenshotPath?: string;
  submittedAt?: Date;
}
```

- [ ] **Step 2: Replace extractFields + answerFields with extractAndAnswerFields**

In `processSingleApplication()`, find this block (~lines 2409–2435):
```typescript
// 5a. Get cleaned form HTML → AI extracts field schema (no answers yet)
const formHTML = await this.htmlExtractor.getFormHTML(page);
const extractedFields = await this.htmlExtractor.extractFields(formHTML);

if (extractedFields.length === 0) {
  console.log('[Orchestrator] AI returned no fields — taking screenshot and aborting fill.');
  const screenshot = await page.screenshot({ fullPage: true });
  return { success: false, screenshot, error: 'AI could not extract any form fields from the page HTML.' };
}

// 5b. Augment resume text with profile fields the AI won't find in raw PDF text
const augmentedResume = [
  resumeText,
  '\n--- Additional Profile Details ---',
  userProfile.phone        ? `Phone: ${userProfile.phone}` : '',
  userProfile.location     ? `Location: ${userProfile.location}` : '',
  userProfile.linkedin     ? `LinkedIn: ${userProfile.linkedin}` : '',
  userProfile.github       ? `GitHub: ${userProfile.github}` : '',
  userProfile.currentCTC   ? `Current CTC: ${userProfile.currentCTC}` : '',
  userProfile.expectedCTC  ? `Expected CTC: ${userProfile.expectedCTC}` : '',
  userProfile.noticePeriod ? `Notice Period: ${userProfile.noticePeriod}` : '',
].filter(Boolean).join('\n');

// 5c. For each field, make a separate AI call to generate the answer.
const aiFields = await this.htmlExtractor.answerFields(extractedFields, augmentedResume, {
  coverLetter: coverLetter || undefined,
});
```

Replace with:
```typescript
// 5a. Get cleaned form HTML
const formHTML = await this.htmlExtractor.getFormHTML(page);

// 5b. Augment resume text with structured profile fields
const augmentedResume = [
  resumeText,
  '\n--- Additional Profile Details ---',
  userProfile.phone        ? `Phone: ${userProfile.phone}` : '',
  userProfile.location     ? `Location: ${userProfile.location}` : '',
  userProfile.linkedin     ? `LinkedIn: ${userProfile.linkedin}` : '',
  userProfile.github       ? `GitHub: ${userProfile.github}` : '',
  userProfile.currentCTC   ? `Current CTC: ${userProfile.currentCTC}` : '',
  userProfile.expectedCTC  ? `Expected CTC: ${userProfile.expectedCTC}` : '',
  userProfile.noticePeriod ? `Notice Period: ${userProfile.noticePeriod}` : '',
].filter(Boolean).join('\n');

// 5c. Single batch AI call: form XML + resume → all field answers at once
const aiFields = await this.htmlExtractor.extractAndAnswerFields(formHTML, augmentedResume, {
  coverLetterText: coverLetter || undefined,
});

if (aiFields.length === 0) {
  console.log('[Orchestrator] AI returned no fields — taking screenshot and aborting fill.');
  const screenshot = await page.screenshot({ fullPage: true });
  return { success: false, screenshot, error: 'AI could not extract any form fields from the page HTML.' };
}
```

- [ ] **Step 3: Generate cover letter PDF before filling**

In `processSingleApplication()`, find the `// 6. Fill all fields` comment (~line 2445) and add PDF generation just before it:

```typescript
// 5d. Generate cover letter PDF if cover letter text is available
let coverLetterPdfPath: string | undefined;
if (coverLetter) {
  coverLetterPdfPath = path.join(os.tmpdir(), `cover-letter-${Date.now()}.pdf`);
  try {
    const { CoverLetterGenerator } = await import('./cover-letter-generator');
    await new CoverLetterGenerator().generateCoverLetterPDF(coverLetter, coverLetterPdfPath);
    console.log(`[Orchestrator] Cover letter PDF written to ${coverLetterPdfPath}`);
  } catch (err) {
    console.log('[Orchestrator] Cover letter PDF generation failed, skipping:', err);
    coverLetterPdfPath = undefined;
  }
}
```

- [ ] **Step 4: Pass coverLetterPdfPath to fillFromAIFields**

Find the `fillFromAIFields` call (~line 2446):
```typescript
await this.fillFromAIFields(page, aiFields, resumePath);
```

Replace with:
```typescript
await this.fillFromAIFields(page, aiFields, resumePath, coverLetterPdfPath);
```

Update the `fillFromAIFields` signature (find it at line ~2163):
```typescript
private async fillFromAIFields(
  page: Page,
  fields: AIField[],
  resumePath: string,
  coverLetterPdfPath?: string
): Promise<{ filled: number; failed: number }> {
```

Update the `COVER_LETTER_FILE:` branch inside `fillFromAIFields` (find at line ~2182):
```typescript
if (field.answer === 'COVER_LETTER_FILE') {
  if (coverLetterPdfPath) {
    await el.setInputFiles(coverLetterPdfPath);
    console.log(`[AIFill] cover letter PDF "${label}" → ${coverLetterPdfPath}`);
  } else {
    console.log(`[AIFill] cover letter file "${label}" → no PDF available, skipping`);
  }
  handled = true;
} else if (field.answer === 'COVER_LETTER_TEXTAREA') {
  // handled below as a regular textarea fill with the cover letter text
  // the answer will be overwritten to the actual text in extractAndAnswerFields output
  handled = false;
} else if (field.type === 'file' || field.answer === 'RESUME_FILE') {
```

Note: `COVER_LETTER_TEXTAREA` answer from the batch call will actually contain the literal text (since extractAndAnswerFields puts the cover letter text as the answer for textarea fields). No special case needed — it flows through the normal textarea fill path. Only `COVER_LETTER_FILE` (for file inputs) needs special handling.

- [ ] **Step 5: Save screenshot to disk and return screenshotPath**

Find the screenshot block (~line 2453):
```typescript
// 7. Take screenshot
const screenshot = await page.screenshot({ fullPage: true });
```

Replace with:
```typescript
// 7. Take screenshot and save to disk for skill verification
const screenshot = await page.screenshot({ fullPage: true });
const screenshotPath = path.join(os.tmpdir(), `job-agent-verify-${Date.now()}.png`);
fs.writeFileSync(screenshotPath, screenshot);
console.log(`[Orchestrator] Verification screenshot saved: ${screenshotPath}`);
```

Then update the two `return` statements that follow to include `screenshotPath`:
```typescript
// non-auto-submit path:
return { success: true, screenshot, screenshotPath, submittedAt: undefined };

// auto-submit path:
return {
  success: submitted,
  screenshot,
  screenshotPath,
  submittedAt: submitted ? new Date() : undefined,
  error: submitted ? undefined : 'Form submission might have failed or not detected.',
};
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd /Users/mervej.raj/Documents/Projects/Personal/job-agent && npx tsc --noEmit 2>&1 | head -30
```
Expected: no errors from the changed files.

- [ ] **Step 7: Commit**

```bash
git add src/services/application-filler.ts
git commit -m "feat: batch AI field answering, cover letter PDF upload, screenshot to disk"
```

---

## Task 6: Expose screenshotPath in API response

**Files:**
- Modify: `src/api/apply.ts`

- [ ] **Step 1: Add screenshotPath to savedResults**

In `apply.ts`, find the `savedResults.push(...)` block (~line 135):
```typescript
savedResults.push({
  jobUrl: jobDesc.url,
  jobTitle: jobDesc.title,
  company: jobDesc.company,
  applicationId,
  success: result.success,
  error: result.error,
});
```

Replace with:
```typescript
savedResults.push({
  jobUrl: jobDesc.url,
  jobTitle: jobDesc.title,
  company: jobDesc.company,
  applicationId,
  success: result.success,
  error: result.error,
  screenshotPath: result.screenshotPath,
});
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/mervej.raj/Documents/Projects/Personal/job-agent && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/api/apply.ts
git commit -m "feat: include screenshotPath in apply API response"
```

---

## Task 7: Update /apply-jobs skill Verifier Agent

**Files:**
- Modify: `~/.claude/skills/apply-jobs/SKILL.md`

- [ ] **Step 1: Replace the Verifier Agent section**

In `~/.claude/skills/apply-jobs/SKILL.md`, find and replace the entire `## Verifier Agent` section with:

````markdown
## Verifier Agent

**Goal:** Visually confirm every critical field is filled by reading the screenshot Claude saved after form filling.

### 1. Extract screenshotPath from API response

The API response from Runner Agent contains `results[0].screenshotPath` — a path like `/tmp/job-agent-verify-1234567890.png`.

If `screenshotPath` is missing or null, ask the user to check server logs and stop.

### 2. Read the screenshot

Use the `Read` tool with `file_path: screenshotPath`. Claude will see the filled form visually.

### 3. Evaluate each critical field

Look at the screenshot and assess:

| Field | Pass condition |
|-------|---------------|
| First name | Non-empty value visible in input |
| Last name | Non-empty value visible in input |
| Email | Value matches email format |
| Phone | Non-empty value visible |
| Resume upload | Filename shown OR file attached indicator visible |
| Cover letter | Textarea has text OR file upload indicator visible |
| LinkedIn URL | Non-empty value visible (skip if field not in form) |
| Work experience | At least one experience block visible with content |
| Custom/screening fields | Any non-empty value OR left empty if info not in resume |

### 4. Produce structured report

```
✓ First name: Mervej
✓ Last name: Raj
✓ Email: mervejraj@gmail.com
✓ Phone: +91 9764577845
✓ Resume: uploaded
✓ Cover letter: [text filled / PDF uploaded]
✗ LinkedIn: empty
✗ Notice period: not selected
```

If `failed` list is empty → print success and **stop**. The Playwright browser window stays open for manual review.

```
✓ All fields verified. Browser tab left open — review and submit manually.
```

### 5. If failures exist

Pass the failed field list to Debugger/Fixer Agent. After fixes, re-run Runner Agent and Verifier Agent (iteration loop).
````

- [ ] **Step 2: Confirm section updated**

```bash
grep -c "screenshotPath" ~/.claude/skills/apply-jobs/SKILL.md
```
Expected: `1`

- [ ] **Step 3: Commit**

```bash
git add ~/.claude/skills/apply-jobs/SKILL.md
git commit -m "feat: update apply-jobs skill verifier to use screenshot Read tool"
```

---

## Task 8: End-to-end smoke test

- [ ] **Step 1: Ensure backend is running with new config**

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/
```
Expected: `404` (server up, route not found at root is fine).

If not running:
```bash
cd /Users/mervej.raj/Documents/Projects/Personal/job-agent && npm run dev &
sleep 5
```

- [ ] **Step 2: Run apply for the Workable test URL**

```bash
curl -s -X POST http://localhost:3001/apply/jobs \
  -H "Content-Type: application/json" \
  -d '{"jobUrls": ["https://apply.workable.com/innovaccer-analytics/j/E9E2A42099/"], "resumeId": 11}'
```

Expected response shape:
```json
{
  "results": [{
    "success": true,
    "screenshotPath": "/tmp/job-agent-verify-XXXXXXXXXX.png"
  }]
}
```

- [ ] **Step 3: Read the screenshot and verify fields**

Use the `Read` tool on the `screenshotPath` from Step 2. Confirm the following fields are visibly filled in the screenshot:
- First name, Last name, Email, Phone (from profile details)
- Resume uploaded
- No phi3-style "not provided" text in any field

- [ ] **Step 4: Verify cover letter PDF upload works (if form has file input)**

For a form with a cover letter file input, confirm the API logs show:
```
[Orchestrator] Cover letter PDF written to /tmp/cover-letter-XXXXX.pdf
[AIFill] cover letter PDF "Cover Letter" → /tmp/cover-letter-XXXXX.pdf
```

- [ ] **Step 5: Final commit if any fixes made during smoke test**

```bash
git add -p
git commit -m "fix: smoke test corrections"
```
