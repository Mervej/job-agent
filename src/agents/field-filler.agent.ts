import { Page, Frame } from 'playwright';
import { FieldMapping, FillAttempt, FillResult } from './types';

export class FieldFillerAgent {
  async fillAll(mappings: FieldMapping[], page: Page): Promise<FillResult> {
    const successful: FieldMapping[] = [];
    const failed: FillAttempt[] = [];

    for (const mapping of mappings) {
      if (mapping.mappedData === undefined || mapping.mappedData === null) continue;

      const attempt = await this.fill(mapping, page);
      if (attempt.success) {
        successful.push(mapping);
      } else {
        failed.push(attempt);
      }
    }

    console.log(`[FieldFiller] Filled ${successful.length} fields, ${failed.length} failed.`);
    if (failed.length > 0) {
      console.log(
        '[FieldFiller] Failed fields:',
        failed.map((f) => f.mapping.field.label || f.mapping.field.fieldName)
      );
    }

    return { successful, failed };
  }

  async fill(mapping: FieldMapping, page: Page): Promise<FillAttempt> {
    const field = mapping.field;
    const value = mapping.mappedData!;

    if (!field.frame) {
      return { mapping, success: false, error: 'No frame reference on field' };
    }

    try {
      const frame = field.frame as Frame;
      const elementHandle = await frame.$(field.selector);

      if (!elementHandle) {
        return { mapping, success: false, error: `Selector not found: ${field.selector}` };
      }

      if (field.elementType === 'input') {
        const inputType = field.inputType || 'text';

        if (inputType === 'checkbox') {
          const v = value.toLowerCase();
          const shouldCheck = ['yes', 'true', '1', 'agree', 'accept', 'authoriz'].some((kw) =>
            v.includes(kw)
          );
          await elementHandle.setChecked(shouldCheck);

        } else if (inputType === 'radio') {
          const matched = await this.fillRadio(frame, field.fieldName, value, field.options);
          if (!matched) {
            return { mapping, success: false, error: `No matching radio option for value: ${value}` };
          }

        } else if (inputType === 'file') {
          // Handled separately by uploadResume()
          return { mapping, success: true };

        } else if (inputType === 'date' || inputType === 'datetime-local') {
          const normalized = this.normalizeDateValue(value, inputType);
          if (!normalized) {
            return { mapping, success: false, error: `Could not normalize date value: ${value}` };
          }
          await elementHandle.evaluate(
            (el: HTMLInputElement, val) => {
              el.value = val;
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
            },
            normalized
          );

        } else if (field.isCombobox) {
          // Combobox input (<input role="combobox" aria-haspopup="listbox">)
          // Interaction: click to open listbox → click matching [role="option"]
          const result = await this.fillCombobox(frame, page, field.selector, value);
          if (!result) {
            return { mapping, success: false, error: `Combobox option not found for value: "${value}"` };
          }
          return { mapping, success: true };

        } else {
          // Plain text input
          await elementHandle.fill(value);
          await elementHandle.dispatchEvent('change');
        }

      } else if (field.elementType === 'textarea') {
        await elementHandle.fill(value);

      } else if (field.elementType === 'div') {
        // contenteditable div (used by some ATSes for rich text fields)
        await elementHandle.evaluate((el: HTMLElement, val: string) => {
          el.focus();
          el.innerText = val;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }, value);

      } else if (field.elementType === 'select') {
        const result = await this.fillSelect(frame, page, field.selector, value);
        if (!result) {
          return { mapping, success: false, error: `Could not select option "${value}"` };
        }
        return { mapping, success: true };
      }

      return { mapping, success: true };
    } catch (error: any) {
      return { mapping, success: false, error: error?.message || String(error) };
    }
  }

  /**
   * Fills an <input role="combobox" aria-haspopup="listbox"> by:
   *  1. Clicking the input to open the listbox
   *  2. Optionally typing to filter options
   *  3. Clicking the matching [role="option"]
   *
   * The selector may contain "||listbox:<id>" appended by the parser to
   * tell us which listbox element to look inside.
   */
  private async fillCombobox(
    frame: Frame,
    page: Page,
    selectorRaw: string,
    value: string
  ): Promise<boolean> {
    // Split out the optional listbox hint
    const [selector, listboxHint] = selectorRaw.split('||');
    const listboxId = listboxHint?.replace('listbox:', '') || '';

    const inputEl = await frame.$(selector);
    if (!inputEl) return false;

    // Click to open the dropdown
    await inputEl.click();
    await page.waitForTimeout(400);

    const v = value.toLowerCase();

    // Strategy A: look in the specific listbox (most reliable)
    if (listboxId) {
      const listbox = await page.$(`#${listboxId}`);
      if (listbox) {
        const options = await listbox.$$('[role="option"]');
        console.log(`[FieldFiller] Combobox listbox "${listboxId}" has ${options.length} options`);
        for (const opt of options) {
          const text = ((await opt.textContent()) || '').trim().toLowerCase();
          if (text === v || text.includes(v) || v.includes(text)) {
            await opt.click();
            console.log(`[FieldFiller] Combobox selected: "${text}"`);
            return true;
          }
        }
      }
    }

    // Strategy B: any visible [role="option"] on the page
    const optLocator = page.locator('[role="option"]');
    const count = await optLocator.count();
    console.log(`[FieldFiller] Combobox fallback: found ${count} [role="option"] elements`);
    for (let i = 0; i < count; i++) {
      const text = ((await optLocator.nth(i).textContent()) || '').trim().toLowerCase();
      if (text === v || text.includes(v) || v.includes(text)) {
        await optLocator.nth(i).click();
        console.log(`[FieldFiller] Combobox fallback selected: "${text}"`);
        return true;
      }
    }

    // Strategy C: type to filter, then click first visible option
    await inputEl.fill(value);
    await page.waitForTimeout(400);
    const filtered = page.locator('[role="option"]:visible');
    if ((await filtered.count()) > 0) {
      await filtered.first().click();
      console.log(`[FieldFiller] Combobox typed+selected first option`);
      return true;
    }

    await page.keyboard.press('Escape');
    return false;
  }

  /**
   * Fills a <select> element — handles both visible native selects and
   * custom dropdown components (react-select, headless-ui, etc.) that hide
   * the native select and replace it with a div-based UI.
   */
  private async fillSelect(
    frame: Frame,
    page: Page,
    selector: string,
    value: string
  ): Promise<boolean> {
    const selectEl = await frame.$(selector);
    if (!selectEl) return false;

    const label = selector;

    // Is the native select visible and interactable?
    const isVisible = await selectEl.evaluate((el: HTMLElement) => {
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity) > 0;
    });

    if (isVisible) {
      // Standard native select — Playwright selectOption handles it directly
      try {
        await selectEl.selectOption({ label: value });
        console.log(`[FieldFiller] Native select filled: "${value}"`);
        return true;
      } catch {
        try {
          await selectEl.selectOption({ value });
          return true;
        } catch {
          return false;
        }
      }
    }

    console.log(`[FieldFiller] Hidden select detected for "${label}", trying custom dropdown strategies...`);

    // Strategy 1: React-compatible JS set via native property descriptor
    const jsMatched = await selectEl.evaluate((el: HTMLSelectElement, val: string) => {
      const v = val.toLowerCase();
      const opt = Array.from(el.options).find(
        (o) =>
          o.text.toLowerCase() === v ||
          o.text.toLowerCase().includes(v) ||
          v.includes(o.text.toLowerCase())
      );
      if (!opt) return false;
      const nativeSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
      if (nativeSetter) nativeSetter.call(el, opt.value);
      else el.value = opt.value;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }, value);

    if (jsMatched) {
      console.log(`[FieldFiller] Strategy 1 (JS set) succeeded for "${value}"`);
      return true;
    }

    // Strategy 2: Find the visible dropdown trigger via ARIA, click to open, click option
    console.log(`[FieldFiller] Strategy 1 failed, trying Strategy 2 (click trigger)...`);

    const triggerSelector = await selectEl.evaluate((el: HTMLSelectElement) => {
      let ancestor: Element | null = el.parentElement;
      while (ancestor && ancestor !== document.body) {
        const trigger = ancestor.querySelector(
          '[aria-haspopup="listbox"], [aria-haspopup="true"], [role="combobox"], [aria-expanded], [tabindex="0"]:not(input):not(textarea)'
        ) as HTMLElement | null;
        if (trigger) {
          // Build a unique selector for this trigger
          if (trigger.id) return `#${CSS.escape(trigger.id)}`;
          if (trigger.getAttribute('aria-label')) return `[aria-label="${trigger.getAttribute('aria-label')}"]`;
          // Fallback: return a marker so caller knows we found something
          return '__found__';
        }
        ancestor = ancestor.parentElement;
      }
      return null;
    });

    if (!triggerSelector) {
      console.log(`[FieldFiller] No dropdown trigger found for "${label}"`);
      return false;
    }

    // Click the trigger — use the select's bounding box to click nearby if we only got __found__
    try {
      if (triggerSelector === '__found__') {
        // Click the parent container of the select (the custom dropdown wrapper)
        await selectEl.evaluate((el) => {
          let ancestor: Element | null = el.parentElement;
          while (ancestor && ancestor !== document.body) {
            const trigger = ancestor.querySelector(
              '[aria-haspopup="listbox"], [aria-haspopup="true"], [role="combobox"], [aria-expanded], [tabindex="0"]:not(input):not(textarea)'
            ) as HTMLElement | null;
            if (trigger) { trigger.click(); return; }
            ancestor = ancestor.parentElement;
          }
        });
      } else {
        await page.click(triggerSelector);
      }
    } catch (err) {
      console.log(`[FieldFiller] Could not click dropdown trigger: ${err}`);
      return false;
    }

    await page.waitForTimeout(500);

    // Find and click the matching option from the open dropdown
    const v = value.toLowerCase();
    const optionSelectors = [
      '[role="option"]',
      '[role="listbox"] li',
      '[role="listbox"] [role="option"]',
      '[role="menuitem"]',
      'li[data-value]',
    ];

    for (const sel of optionSelectors) {
      const locator = page.locator(sel);
      const count = await locator.count();
      if (count === 0) continue;

      console.log(`[FieldFiller] Found ${count} options via "${sel}"`);
      for (let i = 0; i < count; i++) {
        const text = ((await locator.nth(i).textContent()) || '').trim().toLowerCase();
        if (text === v || text.includes(v) || v.includes(text)) {
          await locator.nth(i).click();
          console.log(`[FieldFiller] Strategy 2 clicked option: "${text}"`);
          return true;
        }
      }
    }

    await page.keyboard.press('Escape');
    console.log(`[FieldFiller] No matching option found for "${value}" in open dropdown`);
    return false;
  }

  /**
   * Checks a radio button by matching the given value against option labels.
   */
  private async fillRadio(
    frame: Frame,
    fieldName: string,
    value: string,
    options?: { value: string; text: string }[]
  ): Promise<boolean> {
    const v = value.toLowerCase();

    // Prefer pre-extracted options list (more reliable than re-querying)
    if (options && options.length > 0) {
      for (const opt of options) {
        const optText = (opt.text || opt.value).toLowerCase();
        if (v === optText || v.includes(optText) || optText.includes(v)) {
          const radio = await frame.$(`input[type="radio"][value="${opt.value}"]`);
          if (radio) {
            await radio.check();
            return true;
          }
        }
      }
    }

    // Fallback: query radios by name and match their labels
    const radios = await frame.$$(`input[type="radio"][name="${fieldName}"]`);
    for (const radio of radios) {
      const optionLabel = await frame.evaluate((el) => {
        const input = el as HTMLInputElement;
        if (input.id) {
          const lbl = document.querySelector(`label[for="${input.id}"]`);
          if (lbl) return lbl.textContent?.trim() || '';
        }
        const parent = input.closest('label');
        return parent ? parent.textContent?.trim() || '' : input.value || '';
      }, radio);

      const o = optionLabel.toLowerCase();
      if (optionLabel && (v === o || v.includes(o) || o.includes(v))) {
        await radio.check();
        return true;
      }
    }

    return false;
  }

  /**
   * Converts resume date strings to the format required by native date inputs.
   * Handles: "MM/YYYY", "YYYY", "MM/DD/YYYY", "Present/Current", "YYYY-MM-DD"
   */
  normalizeDateValue(value: string, inputType: string): string | null {
    if (!value) return null;
    const v = value.trim();

    if (/^\d{4}-\d{2}-\d{2}$/.test(v))
      return inputType === 'datetime-local' ? `${v}T00:00` : v;

    if (/^(present|current|now)$/i.test(v)) {
      const today = new Date().toISOString().slice(0, 10);
      return inputType === 'datetime-local' ? `${today}T00:00` : today;
    }

    const mmyyyy = v.match(/^(\d{1,2})\/(\d{4})$/);
    if (mmyyyy) {
      const f = `${mmyyyy[2]}-${mmyyyy[1].padStart(2, '0')}-01`;
      return inputType === 'datetime-local' ? `${f}T00:00` : f;
    }

    const yyyy = v.match(/^(\d{4})$/);
    if (yyyy) {
      const f = `${yyyy[1]}-01-01`;
      return inputType === 'datetime-local' ? `${f}T00:00` : f;
    }

    const mddyyyy = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (mddyyyy) {
      const f = `${mddyyyy[3]}-${mddyyyy[1].padStart(2, '0')}-${mddyyyy[2].padStart(2, '0')}`;
      return inputType === 'datetime-local' ? `${f}T00:00` : f;
    }

    return null;
  }
}
