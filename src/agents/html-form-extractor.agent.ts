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
  section?: string;     // nearest ancestor region/section heading
  maxLength?: number;   // maxlength attribute of the element, if set
}

// Step 2 output: field with AI-generated answer attached
export interface AIField extends ExtractedField {
  answer: string;
}

// ─── Batch system prompt ──────────────────────────────────────────────────────

const BATCH_SYSTEM_PROMPT = `You are filling a job application form on behalf of a candidate.

Given structured XML describing every form field and the candidate's resume, return a JSON array with the best answer for every field.

OUTPUT FORMAT — return ONLY valid JSON, no markdown, no code fences:
[
  {"selector": "...", "label": "...", "type": "...", "required": true, "options": [], "answer": "..."},
  ...
]

RULES:
- Copy selector, label, type, and required EXACTLY from the XML — do not modify them
- For "options": parse the <options> child element as a JSON array of strings (e.g. ["India", "United States"]); use [] if no <options> element
- For "answer":
  - text/email/tel: extract exact value from resume (e.g. full email address, full phone number with country code)
  - textarea for cover letter (label contains "cover letter" or "motivation letter"): use the provided cover letter text verbatim
  - textarea for other fields: write a relevant answer in first person, no markdown, no headings
  - if the field has a maxlength attribute in the XML, keep your answer within that many characters
  - select/radio: return EXACTLY one of the <options> values, word-for-word
  - file input with label containing "cover letter": return "COVER_LETTER_FILE"
  - file input (resume/cv): return "RESUME_FILE"
  - EEO/demographic fields (gender, race, ethnicity, disability, veteran status, pronouns): return the option that means "decline to answer / prefer not to say", or "" if none exists
  - dial code dropdowns (options are international codes like +1, +44, +91): return "+91" or the exact India option text
  - fields with no matching information in the resume: return ""
- NEVER return "N/A", "not provided", "not available", or explanations — only the value or ""
- Include EVERY field from the XML in the output — do not skip any`;

// ─── Agent ────────────────────────────────────────────────────────────────────

export class HtmlFormExtractorAgent {
  /**
   * Builds a compact, structured field summary from the page and all child frames.
   *
   * Instead of sending raw page HTML (which can be 200K+ chars and full of noise like
   * dial-code tables, SVGs, scripts), this walks the DOM and emits one <field> tag per
   * visible form control. The result is typically under 3K chars — well within any model's
   * context window.
   *
   * Output format (XML-like, easy for small models to parse):
   *   <field type="text" selector="input[name='firstname']" required="true">
   *     <label>First Name</label>
   *   </field>
   *   <field type="select" selector="select[name='country']" required="false">
   *     <label>Country</label>
   *     <options>India, United States, United Kingdom</options>
   *   </field>
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

        // Extract only direct text nodes from an element, ignoring nested form controls
        const directText = (el: Element): string => {
          let text = '';
          el.childNodes.forEach(node => {
            if (node.nodeType === Node.TEXT_NODE) {
              text += node.textContent || '';
            } else if (node.nodeType === Node.ELEMENT_NODE) {
              const tag = (node as Element).tagName.toLowerCase();
              // Skip nested inputs, buttons, and interactive elements
              if (!['input', 'select', 'textarea', 'button', 'svg'].includes(tag)) {
                text += directText(node as Element);
              }
            }
          });
          return text.replace(/\s+/g, ' ').replace(/[*]/g, '').trim();
        };

        const getLabel = (el: HTMLElement): string => {
          // aria-label (most reliable)
          const aria = el.getAttribute('aria-label');
          if (aria?.trim()) return aria.trim();

          // aria-labelledby → text of referenced elements
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

          // <label for="id">
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

          // Name-based fallback: more reliable than scanning a wide group container.
          // Convert name attribute to a readable label (e.g. "phone" → "Phone", "start_date" → "Start Date").
          // Only use for clean snake_case names — skip machine-generated IDs like "CA_39286".
          const elName = (el as HTMLInputElement).name || '';
          if (elName && /^[a-z][a-z0-9_]*$/.test(elName)) {
            return elName.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
          }

          // Last resort: nearby label in same form-group.
          // Placed last because it often returns wrong labels when the group spans multiple fields.
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

        // Use single quotes inside attribute selectors to avoid breaking JSON serialization
        const makeSelector = (el: HTMLElement): string => {
          const tag = el.tagName.toLowerCase();
          const id = (el as HTMLInputElement).id;
          const name = (el as HTMLInputElement).name;
          const type = (el as HTMLInputElement).type;
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

        // Get the nearest ancestor region/section heading for a given element
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

        // Inject unique index on every control so selector is always unique
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

          // Deduplicate radio groups — one entry per name group
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

          // Name-based label overrides for date/common fields that get misidentified
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

          // Options for select
          if (tag === 'select') {
            const opts = Array.from((el as HTMLSelectElement).options)
              .map(o => o.text.trim())
              .filter(t => t && !/^(select|choose|--)/i.test(t));
            if (opts.length) lines.push(`    <options>${opts.join(', ')}</options>`);
          }

          // Options for radio group
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

    // Check child frames (Greenhouse, Lever etc embed in iframes)
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
    options?: { coverLetterText?: string }
  ): Promise<AIField[]> {
    const coverLetterBlock = options?.coverLetterText
      ? `\n\nCOVER LETTER (use this text verbatim for cover letter textarea fields):\n${options.coverLetterText}`
      : '';

    const userPrompt = `FORM FIELDS:\n${formHTML}\n\nCANDIDATE RESUME:\n${resumeText}${coverLetterBlock}\n\nReturn ONLY the JSON array.`;

    const MAX_ATTEMPTS = 3;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      console.log(`[HtmlExtractor] Batch answering fields (attempt ${attempt}/${MAX_ATTEMPTS}) for ${formHTML.length} char form...`);

      let response: string;
      try {
        response = await generateText(BATCH_SYSTEM_PROMPT, userPrompt, 8000);
      } catch (err) {
        console.log(`[HtmlExtractor] generateText error on attempt ${attempt}:`, err);
        continue;
      }
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
      if (Array.isArray(parsed)) {
        const valid = parsed.filter((obj: any) => obj.selector && obj.label && obj.type !== undefined);
        if (valid.length > 0) return valid.map((obj: any) => ({ ...obj, answer: obj.answer ?? '' })) as AIField[];
      }
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
