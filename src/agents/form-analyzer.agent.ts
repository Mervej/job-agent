import { Page, Frame } from 'playwright';
import { FormAnalysis } from './types';

export class FormAnalyzerAgent {
  /**
   * Detects the ATS platform and whether the form spans multiple pages,
   * using DOM signals (URL, class names, step indicators).
   */
  async analyze(context: Page | Frame): Promise<FormAnalysis> {
    const result = await context.evaluate(() => {
      const url = window.location.href;
      const bodyText = document.body.innerText.toLowerCase();

      let platform: FormAnalysis['platform'] = 'generic';
      if (url.includes('myworkdayjobs') || url.includes('workday.com')) platform = 'workday';
      else if (url.includes('greenhouse.io') || url.includes('boards.greenhouse.io')) platform = 'greenhouse';
      else if (url.includes('jobs.lever.co') || url.includes('lever.co')) platform = 'lever';
      else if (url.includes('workable.com') || url.includes('apply.workable.com')) platform = 'workable';
      else if (url.includes('smartrecruiters.com')) platform = 'smartrecruiters';
      else if (url.includes('jobvite.com')) platform = 'jobvite';

      const hasStepIndicator = !!document.querySelector(
        '[class*="step"], [class*="wizard"], [class*="stepper"], [role="progressbar"]'
      );
      const hasPagePattern = /\bstep \d+ of \d+|\bpage \d+ of \d+/i.test(bodyText);

      return { platform, isMultiPage: hasStepIndicator || hasPagePattern };
    });

    // Detect isMultiPage from body text too (some ATSes use visible step text without DOM indicators)
    console.log(`[FormAnalyzer] Platform: ${result.platform}, Multi-page: ${result.isMultiPage}`);
    return result as FormAnalysis;
  }

  /**
   * Finds buttons/links that reveal hidden form sections (Education, Experience, etc.)
   * by scanning the DOM for "Add …" style triggers — no vision model required.
   *
   * Runs in up to MAX_ROUNDS. Each round: find all matching triggers, click them one by
   * one, wait for the DOM to settle, then check whether new fields appeared. Stops when
   * no new fields are added or all triggers have been exhausted.
   */
  async expandDynamicSections(
    context: Page | Frame,
    getFieldCount: () => Promise<number>
  ): Promise<void> {
    console.log('[FormAnalyzer] Scanning for dynamic section buttons (DOM-based)...');

    const MAX_ROUNDS = 5;
    const clicked = new Set<string>();
    const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const previousCount = await getFieldCount();

      // Find all visible "add section" buttons using:
      //  1. data-ui="add-section" (Workable)
      //  2. aria-label starting with "Add " on a button
      //  3. Button text matching add-like patterns (generic)
      const triggers = await context.evaluate(() => {
        const results: { key: string; ariaLabel: string; text: string }[] = [];

        const isVisible = (el: HTMLElement) => {
          if (el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true') return false;
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') return false;
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        };

        const TEXT_PATTERNS = [
          /^\+\s*add/i,       // "+ Add"  (Workable)
          /^add\b/i,          // "Add" / "Add experience"
          /^\+$/,             // lone "+"
          /^add (another|more|new)\b/i,
          /^add (experience|education|employment|work|job|school|degree|certification|language|skill|project|reference)/i,
          /^insert\b/i,
        ];

        // These are handled by fillStructuredEntries — skip them here to avoid
        // pre-populating empty entry forms that break field extraction.
        const SKIP_PATTERNS = [
          /^add (experience|education|employment|work history|job history|school|degree|qualification|certification)/i,
        ];

        const els = document.querySelectorAll(
          'button, a[role="button"], [role="button"], [data-ui="add-section"]'
        );

        els.forEach((el) => {
          const htmlEl = el as HTMLElement;
          if (!isVisible(htmlEl)) return;

          const text = (htmlEl.innerText || htmlEl.textContent || '').trim();
          const ariaLabel = htmlEl.getAttribute('aria-label') || '';
          const dataUi = htmlEl.getAttribute('data-ui') || '';

          const isAddSection =
            dataUi === 'add-section' ||
            /^add /i.test(ariaLabel) ||
            TEXT_PATTERNS.some((re) => re.test(text));

          if (!isAddSection) return;

          // Skip experience/education entry buttons — those are handled by fillStructuredEntries
          const matchText = ariaLabel || text;
          if (SKIP_PATTERNS.some((re) => re.test(matchText))) return;

          // Use ariaLabel as the unique key when available (more descriptive than "+ Add")
          const key = (ariaLabel || text).toLowerCase().trim();
          if (!results.find((r) => r.key === key)) {
            results.push({ key, ariaLabel, text });
          }
        });

        return results;
      });

      if (triggers.length === 0) {
        console.log(`[FormAnalyzer] Round ${round + 1}: no add-section buttons found`);
        break;
      }

      console.log(
        `[FormAnalyzer] Round ${round + 1}: found ${triggers.length} button(s):`,
        triggers.map((t) => `"${t.ariaLabel || t.text}"`).join(', ')
      );

      let clickedAny = false;
      for (const trigger of triggers) {
        if (clicked.has(trigger.key)) continue;

        try {
          let locator;

          if (trigger.ariaLabel) {
            // Most reliable: match by aria-label
            locator = context.locator(`[aria-label="${trigger.ariaLabel}"]`);
          } else {
            locator = context.getByRole('button', { name: new RegExp(escapeRegex(trigger.text), 'i') });
          }

          if ((await locator.count()) > 0) {
            await locator.first().scrollIntoViewIfNeeded();
            await locator.first().click();
            clicked.add(trigger.key);
            clickedAny = true;
            console.log(`[FormAnalyzer] Clicked: "${trigger.ariaLabel || trigger.text}"`);
            await delay(800);
          }
        } catch (err) {
          console.log(`[FormAnalyzer] Could not click "${trigger.ariaLabel || trigger.text}": ${err}`);
        }
      }

      if (!clickedAny) break;

      const newCount = await getFieldCount();
      console.log(`[FormAnalyzer] Round ${round + 1}: fields before=${previousCount}, after=${newCount}`);
      if (newCount <= previousCount) break;
    }

    console.log('[FormAnalyzer] Dynamic section expansion complete.');
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
