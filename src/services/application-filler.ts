import { chromium, Browser, Page } from 'playwright';
import { UserProfile } from './cover-letter-generator';
import { generateText } from './ai.service';

export interface ApplicationResult {
  success: boolean;
  error?: string;
  screenshot?: Buffer;
  submittedAt?: Date;
}

export interface ParsedFieldOption {
  value: string;
  text: string;
}

export interface ParsedField {
  selector: string;
  elementType: 'input' | 'textarea' | 'select';
  inputType?: string; // for inputs: text, email, tel, url, checkbox, radio, date, etc.
  fieldName: string;
  placeholder?: string;
  label?: string;
  autocomplete?: string;
  required: boolean;
  currentValue?: string;
  options?: ParsedFieldOption[]; // for selects and radios
}

export interface FieldMapping {
  field: ParsedField;
  mappedData?: string;
  needsAI: boolean;
  aiPrompt?: string;
}

export class ApplicationFiller {
  private browser: Browser | null = null;

  async init() {
    this.browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }

  /**
   * Parse all form fields on the current page
   */
  private async parseFormFields(page: Page): Promise<ParsedField[]> {
    return await page.evaluate(() => {
      const fields: ParsedField[] = [] as any;

      // Supported inputs
      const formElements = document.querySelectorAll(
        [
          // text-like inputs
          'input[type="text"]',
          'input[type="email"]',
          'input[type="tel"]',
          'input[type="url"]',
          'input[type="number"]',
          'input[type="date"]',
          'input[type="datetime-local"]',
          'input[type="search"]',
          'input:not([type])',
          'input[type=""]',
          // rich text
          'textarea',
          // selects
          'select',
          // booleans
          'input[type="checkbox"]',
          'input[type="radio"]',
        ].join(', ')
      );

      const makeUniqueSelector = (el: Element): string => {
        const tag = el.tagName.toLowerCase();
        const id = (el as HTMLElement).id;
        const name = (el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).name;
        const type = (el as HTMLInputElement).type;
        const placeholder = (el as HTMLInputElement | HTMLTextAreaElement).placeholder;

        let sel = tag;
        if (type && tag === 'input') sel += `[type="${type}"]`;
        if (name) sel += `[name="${name}"]`;
        if (id) sel += `[id="${id}"]`;
        if (!name && !id && placeholder) sel += `[placeholder="${placeholder}"]`;

        if (sel === tag) {
          // fallback to nth-of-type within parent
          const parent = el.parentElement;
          if (parent) {
            const siblings = Array.from(parent.querySelectorAll(tag));
            const idx = siblings.indexOf(el);
            if (idx >= 0) sel += `:nth-of-type(${idx + 1})`;
          }
        }
        return sel;
      };

      const getLabelFor = (input: Element): string => {
        // explicit for="id"
        const id = (input as HTMLInputElement).id;
        if (id) {
          const forLabel = document.querySelector(`label[for="${id}"]`);
          if (forLabel) return forLabel.textContent?.trim() || '';
        }
        // wrapping label
        const parentLabel = input.closest('label');
        if (parentLabel) return parentLabel.textContent?.trim() || '';
        // previous sibling label in same group
        const group = input.closest('.form-group, .field, .form-row, .row, div');
        if (group) {
          const maybeLabel = group.querySelector('label');
          if (maybeLabel) return maybeLabel.textContent?.trim() || '';
        }
        return '';
      };

      formElements.forEach((element, index) => {
        const tagName = element.tagName.toLowerCase();
        const inputEl = element as HTMLInputElement;
        const textAreaEl = element as HTMLTextAreaElement;
        const selectEl = element as HTMLSelectElement;

        const type = tagName === 'input' ? inputEl.type || 'text' : tagName;

        // Skip hidden, submit, button, file inputs
        if (
          (tagName === 'input' &&
            (type === 'hidden' || type === 'submit' || type === 'button' || type === 'file')) ||
          (inputEl as any).style?.display === 'none' ||
          element.getAttribute('aria-hidden') === 'true'
        ) {
          return;
        }

        const required = !!(
          (tagName === 'input' && inputEl.required) ||
          (tagName === 'textarea' && textAreaEl.required) ||
          (tagName === 'select' && selectEl.required) ||
          element.getAttribute('aria-required') === 'true'
        );

        const placeholder =
          tagName === 'select' ? '' : inputEl.placeholder || textAreaEl.placeholder || '';
        const name = (inputEl.name || textAreaEl.name || selectEl.name || '').trim();
        const id = (inputEl.id || textAreaEl.id || selectEl.id || '').trim();
        const autocomplete = (inputEl.autocomplete || textAreaEl.autocomplete || '').trim();
        const label = getLabelFor(element);

        const parsed: ParsedField = {
          selector: makeUniqueSelector(element),
          elementType: tagName as ParsedField['elementType'],
          inputType: tagName === 'input' ? type : undefined,
          fieldName: name || id || `field_${index}`,
          placeholder: placeholder || undefined,
          label: label || undefined,
          autocomplete: autocomplete || undefined,
          required,
          currentValue:
            tagName === 'select'
              ? selectEl.value || undefined
              : inputEl.value || textAreaEl.value || undefined,
        };

        if (tagName === 'select') {
          parsed.options = Array.from(selectEl.options).map((opt) => ({
            value: opt.value,
            text: (opt.textContent || '').trim(),
          }));
        }

        if (type === 'radio') {
          // collect radio options by same name
          const radios = document.querySelectorAll(`input[type="radio"][name="${name}"]`);
          parsed.options = Array.from(radios).map((r) => ({
            value: (r as HTMLInputElement).value,
            text: getLabelFor(r) || r.getAttribute('value') || '',
          }));
        }

        fields.push(parsed);
      });

      return fields;
    });
  }

  /**
   * Map parsed fields to user data, using AI for missing information
   */
  private async mapFieldsToData(
    fields: ParsedField[],
    userProfile: UserProfile,
    coverLetter: string,
    resumeText: string
  ): Promise<FieldMapping[]> {
    const mappings: FieldMapping[] = [];

    for (const field of fields) {
      let mappedData: string | undefined;
      let needsAI = false;
      let aiPrompt: string | undefined;

      const info = `${field.label || ''} ${field.placeholder || ''} ${field.fieldName} ${
        field.autocomplete || ''
      } ${field.inputType || ''}`
        .toLowerCase()
        .trim();

      // Strong signals via autocomplete
      switch (field.autocomplete) {
        case 'given-name':
          mappedData = userProfile.name.split(' ')[0];
          break;
        case 'family-name':
          mappedData = userProfile.name.split(' ').slice(1).join(' ');
          break;
        case 'email':
          mappedData = userProfile.email;
          break;
        case 'tel':
          mappedData = userProfile.phone || '';
          break;
        case 'url':
          mappedData = userProfile.github || userProfile.linkedin || '';
          break;
      }

      if (!mappedData) {
        // Direct mappings from user profile
        if (info.includes('first') && info.includes('name')) {
          mappedData = userProfile.name.split(' ')[0];
        } else if (info.includes('last') && info.includes('name')) {
          mappedData = userProfile.name.split(' ').slice(1).join(' ');
        } else if (info.includes('email') || field.inputType === 'email') {
          mappedData = userProfile.email;
        } else if (info.includes('phone') || field.inputType === 'tel') {
          mappedData = userProfile.phone || '';
        } else if (info.includes('linkedin')) {
          mappedData = userProfile.linkedin || '';
        } else if (info.includes('github')) {
          mappedData = userProfile.github || '';
        } else if (
          info.includes('website') ||
          info.includes('portfolio') ||
          field.inputType === 'url'
        ) {
          mappedData = userProfile.github || userProfile.linkedin || '';
        } else if (info.includes('cover') && info.includes('letter')) {
          mappedData = coverLetter;
        } else if (info.includes('authorized') || info.includes('legally')) {
          // Default to Yes if authorization question
          mappedData = 'yes';
        } else if (info.includes('hear') && info.includes('about')) {
          // How did you hear -> choose LinkedIn if present
          mappedData = userProfile.linkedin ? 'LinkedIn' : '';
        }
      }

      // AI targets
      if (!mappedData) {
        if (info.includes('experience') || info.includes('years')) {
          needsAI = true;
          aiPrompt = `Extract total years of professional experience as a number (e.g., 5) from this resume: "${resumeText.slice(
            0,
            2000
          )}..."`;
        } else if (info.includes('salary') || info.includes('compensation')) {
          needsAI = true;
          aiPrompt = `Extract expected salary or suggest a reasonable range based on experience. Respond briefly. Resume: "${resumeText.slice(
            0,
            2000
          )}..."`;
        } else if (info.includes('location') || info.includes('city')) {
          needsAI = true;
          aiPrompt = `Extract current location/city from resume. Respond as "City, Country" if possible. Resume: "${resumeText.slice(
            0,
            2000
          )}..."`;
        } else if (
          info.includes('why') ||
          info.includes('motivation') ||
          info.includes('interest')
        ) {
          needsAI = true;
          aiPrompt = `In 2-3 sentences, explain why this candidate is a great fit for this role, based on resume: "${resumeText.slice(
            0,
            2000
          )}..."`;
        } else if (info.includes('skills') || info.includes('technologies')) {
          needsAI = true;
          aiPrompt = `List 8-12 key technical skills from the resume, comma-separated: "${resumeText.slice(
            0,
            2000
          )}..."`;
        } else if (
          info.includes('availability') ||
          info.includes('start') ||
          info.includes('notice')
        ) {
          needsAI = true;
          aiPrompt = `Suggest a realistic start date (e.g., "Within 2 weeks") based on resume context: "${resumeText.slice(
            0,
            2000
          )}..."`;
        } else {
          needsAI = true;
          aiPrompt = `Given this field description "${info}", provide a concise, professional value based on the resume: "${resumeText.slice(
            0,
            2000
          )}..."`;
        }
      }

      mappings.push({ field, mappedData, needsAI, aiPrompt });
    }

    // Process AI mappings
    for (const mapping of mappings) {
      if (mapping.needsAI && !mapping.mappedData && mapping.aiPrompt) {
        try {
          console.log(
            `[DEV] Using AI for field: ${mapping.field.fieldName} - ${
              mapping.field.label || mapping.field.placeholder
            }`
          );
          mapping.mappedData = await generateText(
            'You are an assistant helping fill out job application forms.',
            mapping.aiPrompt
          );
          console.log(`[DEV] AI generated: "${mapping.mappedData}"`);
        } catch (error) {
          console.log(
            `[DEV] AI generation failed for field ${mapping.field.fieldName}:`,
            error as any
          );
          mapping.mappedData = '';
        }
      }
    }

    return mappings;
  }

  private normalizeYesNo(value: string | undefined): 'yes' | 'no' | undefined {
    if (!value) return undefined;
    const v = value.toLowerCase();
    if (['yes', 'y', 'true', '1'].some((k) => v.includes(k))) return 'yes';
    if (['no', 'n', 'false', '0'].some((k) => v.includes(k))) return 'no';
    return undefined;
  }

  private async selectBestOption(
    page: Page,
    selector: string,
    options: ParsedFieldOption[] | undefined,
    desired: string | undefined
  ): Promise<boolean> {
    try {
      const el = await page.$(selector);
      if (!el || !options || options.length === 0) return false;
      const target = (desired || '').toLowerCase().trim();

      // Try exact match by text or value
      let match = options.find(
        (o) => o.text.toLowerCase() === target || o.value.toLowerCase() === target
      );

      // Try includes match
      if (!match && target) {
        match = options.find(
          (o) => o.text.toLowerCase().includes(target) || o.value.toLowerCase().includes(target)
        );
      }

      // Special handling: years of experience numeric -> bucket
      if (!match && target) {
        const yearsMatch = target.match(/(\d+)(?:\+)?\s*years?/);
        if (yearsMatch) {
          const years = parseInt(yearsMatch[1], 10);
          const preferTexts = options.map((o) => o.text.toLowerCase());
          const bucket =
            years < 1
              ? '0-1'
              : years < 3
                ? '1-3'
                : years < 5
                  ? '3-5'
                  : years < 7
                    ? '5-7'
                    : years < 10
                      ? '7-10'
                      : '10+';
          match = options.find((o) => o.text.toLowerCase().includes(bucket));
        }
      }

      // Fallback: yes/no selects
      if (!match) {
        const yn = this.normalizeYesNo(desired);
        if (yn) {
          match = options.find(
            (o) => o.text.toLowerCase().includes(yn) || o.value.toLowerCase().includes(yn)
          );
        }
      }

      // Last resort: first non-empty option
      if (!match) match = options.find((o) => o.value || o.text);

      if (match) {
        await el.selectOption({ value: match.value });
        console.log(`[DEV] Selected option "${match.text}" for selector: ${selector}`);
        return true;
      }
    } catch (e) {
      // ignore
    }
    return false;
  }

  async fillApplication(
    jobUrl: string,
    userProfile: UserProfile,
    coverLetter: string,
    resumePath: string,
    applyLink?: string, // If provided and different from jobUrl, navigate to this URL first
    resumeText?: string // Resume text for AI processing
  ): Promise<ApplicationResult> {
    if (!this.browser) {
      await this.init();
    }

    const page = await this.browser!.newPage();

    try {
      // Determine which URL to start from
      let formUrl = jobUrl;

      // Check if jobUrl already looks like an application page
      const jobUrlLower = jobUrl.toLowerCase();
      const isAlreadyApplyPage =
        jobUrlLower.includes('/apply') ||
        jobUrlLower.includes('/application') ||
        jobUrlLower.includes('application-form') ||
        jobUrlLower.includes('careers/apply');

      if (!isAlreadyApplyPage && applyLink && applyLink !== jobUrl) {
        formUrl = applyLink;
      }

      console.log(`[DEV] Filling application - Job URL: ${jobUrl}`);
      console.log(`[DEV] Navigating to form URL: ${formUrl}`);
      await page.goto(formUrl, { waitUntil: 'networkidle' });
      await page.waitForTimeout(3000);

      // Step 1: Parse all form fields on the page
      console.log(`[DEV] Parsing form fields on: ${formUrl}`);
      const parsedFields = await this.parseFormFields(page);
      console.log(`[DEV] Found ${parsedFields.length} form fields`);

      // If no form fields found, try different strategies
      if (parsedFields.length === 0) {
        // Strategy 1: If we have a valid applyLink, navigate to it
        if (applyLink && applyLink !== formUrl && !isAlreadyApplyPage) {
          console.log(
            `[DEV] No form fields found on job page, navigating to apply link: ${applyLink}`
          );
          await page.goto(applyLink, { waitUntil: 'networkidle' });
          await page.waitForTimeout(3000);

          // Re-parse fields on the apply page
          const applyPageFields = await this.parseFormFields(page);
          console.log(`[DEV] Found ${applyPageFields.length} form fields on apply page`);
          parsedFields.push(...applyPageFields);
        }

        // Strategy 2: If still no fields, try clicking apply buttons to trigger JavaScript navigation/forms
        if (parsedFields.length === 0) {
          console.log(`[DEV] No form fields found, trying to click apply buttons...`);

          // Look for apply buttons and click them
          const allButtons = await page.$$('[class*="apply"], button, a');
          const applyButtons: any[] = [];

          for (const el of allButtons) {
            const text = await el.textContent();
            const className = (await el.getAttribute('class')) || '';
            if (
              text?.toLowerCase().includes('apply') ||
              className.toLowerCase().includes('apply') ||
              className.toLowerCase().includes('cta')
            ) {
              applyButtons.push(el);
            }
          }

          console.log(`[DEV] Found ${applyButtons.length} potential apply buttons`);

          for (const button of applyButtons.slice(0, 3)) {
            // Try first 3 buttons
            try {
              const buttonText = await button.textContent();
              console.log(`[DEV] Clicking apply button: "${buttonText?.trim()}"`);

              await button.click();
              await page.waitForTimeout(2000); // Wait for potential navigation or form reveal

              // Check if URL changed (navigation)
              const currentUrl = page.url();
              console.log(`[DEV] After click, URL is: ${currentUrl}`);

              // Re-parse fields
              const newFields = await this.parseFormFields(page);
              console.log(`[DEV] After click, found ${newFields.length} form fields`);

              if (newFields.length > 0) {
                parsedFields.push(...newFields);
                break; // Stop trying other buttons if we found fields
              }
            } catch (error) {
              console.log(`[DEV] Error clicking button:`, error);
            }
          }
        }
      }

      // Log all found fields for debugging
      parsedFields.forEach((field) => {
        console.log(
          `[DEV] Field found: ${field.fieldName} (${field.elementType}${
            field.inputType ? `/${field.inputType}` : ''
          }) - Label: "${field.label}" - Placeholder: "${field.placeholder}" - Required: ${
            field.required
          }`
        );
      });

      // Step 2: Map fields to data, using AI where needed
      console.log(`[DEV] Mapping fields to data...`);
      const fieldMappings = await this.mapFieldsToData(
        parsedFields,
        userProfile,
        coverLetter,
        resumeText || ''
      );

      // Step 3: Fill all mapped fields
      console.log(`[DEV] Filling form fields...`);
      for (const mapping of fieldMappings) {
        const { field, mappedData } = mapping;
        try {
          if (field.elementType === 'select') {
            await this.selectBestOption(page, field.selector, field.options, mappedData);
            continue;
          }

          if (field.elementType === 'input' && field.inputType === 'checkbox') {
            const shouldCheck = (() => {
              // If label implies terms/privacy/consent and required, check it
              const label = (field.label || '').toLowerCase();
              if (label.includes('terms') || label.includes('privacy') || label.includes('consent'))
                return true;
              const yn = this.normalizeYesNo(mappedData);
              return yn === 'yes';
            })();
            const el = await page.$(field.selector);
            if (el) {
              const checked = await el.isChecked().catch(() => false as any);
              if (shouldCheck && !checked) {
                await el.check();
                console.log(`[DEV] Checked checkbox for "${field.fieldName}"`);
              }
            }
            continue;
          }

          if (field.elementType === 'input' && field.inputType === 'radio') {
            if (field.options && field.options.length > 0) {
              // choose best option by mappedData or default to first
              const yn = this.normalizeYesNo(mappedData);
              let target = mappedData || (yn ? yn : field.options[0].value);
              // try click radio with matching value
              const name = field.fieldName;
              const radios = await page.$$(`input[type="radio"][name="${name}"]`);
              let clicked = false;
              for (const r of radios) {
                const value = (await r.getAttribute('value')) || '';
                const labelText = (await r.textContent()) || '';
                if (
                  value.toLowerCase() === target.toLowerCase() ||
                  labelText.toLowerCase().includes((target || '').toLowerCase())
                ) {
                  await r.click();
                  console.log(`[DEV] Selected radio "${value}" for "${name}"`);
                  clicked = true;
                  break;
                }
              }
              if (!clicked && radios.length > 0) {
                await radios[0].click();
                console.log(`[DEV] Selected first radio option for "${name}"`);
              }
            }
            continue;
          }

          // Default: fill text-like inputs and textareas
          if (mappedData) {
            const el = await page.$(field.selector);
            if (el) {
              await el.fill(mappedData);
              console.log(
                `[DEV] Filled field "${field.fieldName}": "${mappedData.substring(0, 120)}${
                  mappedData.length > 120 ? '...' : ''
                }"`
              );
            } else {
              console.log(`[DEV] Could not find element for field: ${field.fieldName}`);
            }
          }
        } catch (error) {
          console.log(`[DEV] Error filling field "${field.fieldName}":`, error as any);
        }
      }

      // Step 4: Upload resume if needed
      await this.uploadResume(page, resumePath);

      // Step 5: Take screenshot before submission
      const screenshot = await page.screenshot({ fullPage: true });

      // Step 6: Find and click submit button
      console.log(`[DEV] Looking for submit button...`);
      let submitted = false;

      // Helper function to find button by text
      const findButtonByText = async (textPatterns: string[]): Promise<boolean> => {
        const buttons = await page.$$('button, input[type="submit"], input[type="button"]');

        for (const button of buttons) {
          const text = await button.textContent();
          const value = await button.getAttribute('value');
          const ariaLabel = await button.getAttribute('aria-label');

          const fullText = `${text} ${value} ${ariaLabel}`.toLowerCase();

          for (const pattern of textPatterns) {
            if (fullText.includes(pattern.toLowerCase())) {
              console.log(
                `[DEV] Clicking submit button: "${text || value || ariaLabel}" (matched pattern: "${pattern}")`
              );
              await button.click();
              return true;
            }
          }
        }
        return false;
      };

      // Priority order for finding submit button
      const submitTextPatterns = [
        ['submit', 'application'],
        ['apply', 'now'],
        ['submit'],
        ['apply'],
        ['send'],
      ];

      for (const patterns of submitTextPatterns) {
        if (await findButtonByText(patterns)) {
          submitted = true;
          break;
        }
      }

      // Fallback to CSS selector if text search fails
      if (!submitted) {
        const submitSelectors = [
          'button[type="submit"]',
          'input[type="submit"]',
          '[data-testid*="submit"]',
          '[data-testid*="apply"]',
        ];

        for (const selector of submitSelectors) {
          try {
            const submitButton = await page.$(selector);
            if (submitButton) {
              const buttonText = await submitButton.textContent();
              console.log(
                `[DEV] Clicking submit button via CSS selector: "${buttonText || 'button'}" (selector: ${selector})`
              );
              await submitButton.click();
              submitted = true;
              break;
            }
          } catch (error) {
            // Continue trying other selectors
          }
        }
      }

      if (!submitted) {
        console.log(`[DEV] Could not find submit button - application not submitted`);
        return {
          success: false,
          error: 'Could not find submit button',
          screenshot,
        };
      }

      // Wait for submission to complete
      await page.waitForTimeout(5000);

      console.log(`[DEV] Application submitted successfully at ${new Date().toISOString()}`);
      return {
        success: true,
        screenshot,
        submittedAt: new Date(),
      };
    } catch (error) {
      console.log(`[DEV] Application submission failed: ${error}`);
      const screenshot = await page.screenshot({ fullPage: true });
      return {
        success: false,
        error: `Application failed: ${error}`,
        screenshot,
      };
    } finally {
      await page.close();
    }
  }

  private async fillField(
    page: Page,
    selectors: string[],
    value: string,
    fieldName?: string
  ): Promise<boolean> {
    for (const selector of selectors) {
      try {
        const field = await page.$(selector);
        if (field) {
          await field.fill(value);
          // Dev logging - show which field was filled and what value
          if (fieldName) {
            console.log(`[DEV] Filled ${fieldName}: "${value}" (using selector: ${selector})`);
          }
          return true;
        }
      } catch (error) {
        // Continue trying other selectors
      }
    }
    if (fieldName) {
      console.log(
        `[DEV] Could not find field for ${fieldName} - tried selectors: ${selectors.join(', ')}`
      );
    }
    return false;
  }

  private async uploadResume(page: Page, resumePath: string): Promise<boolean> {
    const fileInputSelectors = [
      'input[type="file"]',
      'input[name*="resume"]',
      'input[name*="cv"]',
      'input[id*="resume"]',
      'input[id*="cv"]',
    ];

    for (const selector of fileInputSelectors) {
      try {
        const fileInput = await page.$(selector);
        if (fileInput) {
          await fileInput.setInputFiles(resumePath);
          console.log(`[DEV] Uploaded resume: "${resumePath}" (using selector: ${selector})`);
          return true;
        }
      } catch (error) {
        // Continue trying other selectors
      }
    }
    console.log(
      `[DEV] Could not find resume upload field - tried selectors: ${fileInputSelectors.join(', ')}`
    );
    return false;
  }

  async processMultipleApplications(
    applications: Array<{
      jobUrl: string;
      coverLetter: string;
      resumePath: string;
      applyLink?: string; // Optional link to apply page if different from job page
      resumeText?: string; // Resume text for AI processing
    }>,
    userProfile: UserProfile
  ): Promise<ApplicationResult[]> {
    const results: ApplicationResult[] = [];

    for (const app of applications) {
      try {
        const result = await this.fillApplication(
          app.jobUrl,
          userProfile,
          app.coverLetter,
          app.resumePath,
          app.applyLink,
          app.resumeText
        );
        results.push(result);

        // Add delay between applications
        await new Promise((resolve) => setTimeout(resolve, 5000));
      } catch (error) {
        results.push({
          success: false,
          error: `Failed to process application: ${error}`,
        });
      }
    }

    return results;
  }
}
