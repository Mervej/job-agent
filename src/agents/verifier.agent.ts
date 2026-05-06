import { Page, Frame } from 'playwright';
import { analyzeScreenshot } from '../services/ai.service';
import { FillAttempt, VerificationResult } from './types';

export class VerifierAgent {
  /**
   * Item 4: Takes a screenshot and asks moondream whether all required fields
   * are filled. Returns ready=true if the form looks complete.
   * Falls back to ready=true if the vision model is unavailable.
   */
  async verify(page: Page): Promise<VerificationResult> {
    console.log('[Verifier] Taking screenshot for form verification...');
    const screenshot = await page.screenshot({ fullPage: true });

    try {
      const response = await analyzeScreenshot(
        screenshot,
        'Look at this job application form. Are all required fields (marked with * or labeled as "required") filled in? List any empty required fields by their label name, one per line. If everything looks complete and all required fields have values, say only "ready".'
      );

      console.log('[Verifier] Vision response:\n', response);

      const trimmed = response.trim().toLowerCase();
      if (trimmed.startsWith('ready') || trimmed === '') {
        return { ready: true, issues: [] };
      }

      const issues = response
        .split('\n')
        .map((l) => l.replace(/^[-*•\d.)\s]+/, '').trim())
        .filter((l) => l.length > 0 && !l.toLowerCase().startsWith('ready'));

      return { ready: issues.length === 0, issues };
    } catch (err) {
      console.log('[Verifier] Vision model unavailable, assuming form is ready:', err);
      return { ready: true, issues: [] };
    }
  }

  /**
   * Item 6: For each failed fill attempt, takes a screenshot and asks moondream
   * to describe how to interact with that field, then tries an alternative strategy.
   */
  async retryFailed(page: Page, failed: FillAttempt[]): Promise<void> {
    if (failed.length === 0) return;
    console.log(`[Verifier] Retrying ${failed.length} failed field(s)...`);

    for (const attempt of failed) {
      await this.retryOne(page, attempt);
    }
  }

  private async retryOne(page: Page, attempt: FillAttempt): Promise<void> {
    const field = attempt.mapping.field;
    const value = attempt.mapping.mappedData;

    if (!value) return;

    const label = field.label || field.fieldName;
    console.log(`[Verifier] Retrying field: "${label}" (previous error: ${attempt.error})`);

    // Ask moondream how to interact with this specific field
    let hint = '';
    try {
      const screenshot = await page.screenshot({ fullPage: true });
      hint = await analyzeScreenshot(
        screenshot,
        `I need to fill a form field labeled "${label}". Looking at this job application form, is this field a date picker, custom dropdown, toggle, text input, or something else? Describe in one sentence how to interact with it.`
      );
      console.log(`[Verifier] Hint for "${label}": ${hint}`);
    } catch (_) {
      // No vision — try generic fallback
    }

    await this.applyRetryStrategy(page, attempt, hint);
  }

  private async applyRetryStrategy(
    page: Page,
    attempt: FillAttempt,
    hint: string
  ): Promise<void> {
    const field = attempt.mapping.field;
    const value = attempt.mapping.mappedData!;
    const frame = field.frame as Frame;

    if (!frame) return;

    const el = await frame.$(field.selector).catch(() => null);
    if (!el) {
      console.log(`[Verifier] Still cannot find selector "${field.selector}", skipping retry.`);
      return;
    }

    const h = hint.toLowerCase();

    try {
      if (h.includes('date') || h.includes('calendar') || h.includes('picker')) {
        // Click to open, wait for calendar widget, then type
        await el.click();
        await page.waitForTimeout(400);
        await el.fill('');
        await el.type(value, { delay: 80 });
        await page.keyboard.press('Escape');
        console.log(`[Verifier] Retried "${field.label}" via click + type (date picker)`);

      } else if (h.includes('dropdown') || h.includes('select') || h.includes('custom')) {
        // Try setting value via JS evaluate for custom dropdowns
        await el.click();
        await page.waitForTimeout(300);
        const args = { selector: field.selector, val: value };
        await frame.evaluate(({ selector, val }: { selector: string; val: string }) => {
          const el = document.querySelector(selector) as HTMLSelectElement;
          if (!el) return;
          el.value = val;
          el.dispatchEvent(new Event('change', { bubbles: true }));
          const opt = Array.from(el.options).find(
            (o) => o.text.toLowerCase() === val.toLowerCase()
          );
          if (opt) opt.selected = true;
        }, args);
        console.log(`[Verifier] Retried "${field.label}" via evaluate (dropdown)`);

      } else {
        // Generic: triple-click to select all, then type slowly
        await el.click({ clickCount: 3 });
        await page.waitForTimeout(100);
        await el.type(value, { delay: 60 });
        await page.keyboard.press('Tab');
        console.log(`[Verifier] Retried "${field.label}" via slow type (generic)`);
      }
    } catch (err) {
      console.log(`[Verifier] Retry still failed for "${field.label}":`, err);
    }
  }
}
