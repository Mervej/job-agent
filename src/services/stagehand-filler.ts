import type { Stagehand as StagehandType } from '@browserbasehq/stagehand';
import type { Page } from 'playwright';
import config from '../config/ai.config';
import { UserProfile } from './cover-letter-generator';
import { StructuredResume } from './resume';
import { ApplicationResult } from './application-filler';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

type ApplicationInput = {
  jobUrl: string;
  coverLetter: string;
  resumePath: string;
  applyLink?: string;
  resumeText: string;
  structuredResume?: StructuredResume | null;
};

export class StagehandFiller {
  private stagehand: StagehandType | null = null;

  private async buildStagehandOptions() {
    const { Stagehand, CustomOpenAIClient } = await import('@browserbasehq/stagehand');
    const headless = process.env.BROWSER_HEADLESS === 'true';
    const localBrowserLaunchOptions = { headless };

    if (config.provider === 'groq') {
      process.env.GROQ_API_KEY = config.groq.apiKey;
      return { Stagehand, opts: { env: 'LOCAL' as const, model: 'groq-llama-3.3-70b-versatile' as const, localBrowserLaunchOptions, verbose: 1 as const } };
    }

    if (config.provider === 'ollama') {
      const { default: OpenAI } = await import('openai');
      const openaiClient = new OpenAI({ apiKey: 'ollama', baseURL: `${config.ollama.url}/v1` });
      const llmClient = new CustomOpenAIClient({ modelName: config.ollama.model, client: openaiClient as any });
      return { Stagehand, opts: { env: 'LOCAL' as const, llmClient, localBrowserLaunchOptions, verbose: 1 as const } };
    }

    process.env.OPENAI_API_KEY = config.openai.apiKey;
    return { Stagehand, opts: { env: 'LOCAL' as const, model: config.model as string, localBrowserLaunchOptions, verbose: 1 as const } };
  }

  async init() {
    const { Stagehand, opts } = await this.buildStagehandOptions();
    this.stagehand = new Stagehand(opts as any);
    await this.stagehand.init();
    console.log(`[Stagehand] Initialized — provider: ${config.provider}`);
  }

  async processMultipleApplications(
    applications: ApplicationInput[],
    userProfile: UserProfile
  ): Promise<ApplicationResult[]> {
    const results: ApplicationResult[] = [];
    for (const app of applications) {
      results.push(await this.processSingleApplication(app, userProfile));
      await new Promise((r) => setTimeout(r, 5000));
    }
    return results;
  }

  private async processSingleApplication(
    app: ApplicationInput,
    userProfile: UserProfile
  ): Promise<ApplicationResult> {
    if (!this.stagehand) throw new Error('StagehandFiller not initialized — call init() first');

    // Get the Playwright page from Stagehand's context
    const page = this.stagehand.context.activePage() as unknown as Page;

    try {
      const targetUrl = app.applyLink || app.jobUrl;
      console.log(`[Stagehand] Navigating to ${targetUrl}`);
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2000);

      // Upload resume + cover letter via file inputs — works on any ATS
      await this.uploadFiles(page, app.resumePath, app.coverLetter);
      await page.waitForTimeout(2000);

      // Direct Playwright fills for common fields — no LLM, runs on every site
      await this.fillCommonFields(page, userProfile);
      await page.waitForTimeout(1000);

      // Personal info
      await this.safeAct(
        `Fill in all personal information fields you can find with:
        Full Name: ${userProfile.name}
        Email: ${userProfile.email}
        Phone: ${userProfile.phone || ''}
        Location/City: ${userProfile.location || 'India'}
        LinkedIn URL: ${userProfile.linkedin || ''}
        GitHub/Portfolio URL: ${userProfile.github || ''}`,
        page
      );

      // Work experience — one act() per entry so Add buttons are triggered naturally
      const experiences = app.structuredResume?.experience ?? [];
      for (let i = 0; i < experiences.length; i++) {
        const exp = experiences[i];
        if (i > 0) {
          await this.safeAct(
            'Click the "Add Experience", "Add Position", "+ Add", or similar button to open a new work experience entry',
            page
          );
          await page.waitForTimeout(1500);
        }
        const endDateInstruction =
          exp.endDate === 'Present'
            ? 'check the "I currently work here" or "Current" checkbox'
            : `${exp.endDate} — if a date picker, click to open then select the correct month and year`;

        await this.safeAct(
          `Fill work experience entry ${i + 1}:
          Company: ${exp.company}
          Job Title: ${exp.role}
          Start Date: ${exp.startDate} — if a date picker, click to open then select the correct month and year
          End Date: ${endDateInstruction}
          Location: ${exp.location || ''}
          Description: ${exp.description || exp.achievements?.join('. ') || ''}`,
          page
        );
        await page.waitForTimeout(500);
      }

      // Education
      const educations = app.structuredResume?.education ?? [];
      for (let i = 0; i < educations.length; i++) {
        const edu = educations[i];
        if (i > 0) {
          await this.safeAct(
            'Click the "Add Education", "Add Degree", "+ Add", or similar button to open a new education entry',
            page
          );
          await page.waitForTimeout(1500);
        }
        await this.safeAct(
          `Fill education entry ${i + 1}:
          School/University: ${edu.institution}
          Degree: ${edu.degree}
          Field of Study: ${edu.fieldOfStudy || ''}
          Start Year: ${edu.startDate}
          End Year / Graduation Year: ${edu.endDate}`,
          page
        );
        await page.waitForTimeout(500);
      }

      // Remaining fields: dropdowns, salary, authorization, EEO, etc.
      const extras = [
        app.structuredResume?.skills?.length
          ? `Skills: ${app.structuredResume.skills.slice(0, 12).join(', ')}`
          : '',
        userProfile.currentCTC ? `Current CTC/Salary: ${userProfile.currentCTC}` : '',
        userProfile.expectedCTC ? `Expected CTC/Salary: ${userProfile.expectedCTC}` : '',
        userProfile.noticePeriod ? `Notice Period: ${userProfile.noticePeriod}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      await this.safeAct(
        `Fill any remaining unfilled required fields on the form using:
        ${extras}
        Years of total experience: 8+
        Work authorization: Yes, authorized to work
        For EEO / diversity / demographic questions: select "Decline to answer" or equivalent
        For dropdown fields: pick the closest matching option
        Skip fields that are already filled`,
        page
      );

      const screenshot = await page.screenshot({ fullPage: true });
      const screenshotPath = path.join(os.tmpdir(), `job-agent-stagehand-${Date.now()}.png`);
      fs.writeFileSync(screenshotPath, screenshot);
      console.log(`[Stagehand] Screenshot saved: ${screenshotPath}`);

      return { success: true, screenshot, screenshotPath, submittedAt: new Date() };
    } catch (error: any) {
      console.error('[Stagehand] Fatal error:', error);
      const screenshot = await page.screenshot({ fullPage: true }).catch(() => undefined);
      let screenshotPath: string | undefined;
      if (screenshot) {
        screenshotPath = path.join(os.tmpdir(), `job-agent-stagehand-err-${Date.now()}.png`);
        fs.writeFileSync(screenshotPath, screenshot);
      }
      return { success: false, error: error.message, screenshot, screenshotPath };
    }
  }

  // Upload a file by clicking an "Attach" button and intercepting the file chooser.
  // This triggers React's synthetic event system so the UI updates properly.
  private async uploadViaAttachButton(page: Page, buttonLocator: any, filePath: string, label: string) {
    try {
      const [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 5000 }),
        buttonLocator.click(),
      ]);
      await fileChooser.setFiles(filePath);
      console.log(`[Stagehand] ${label} uploaded via file chooser`);
      return true;
    } catch (err: any) {
      console.log(`[Stagehand] ${label} upload failed:`, err.message);
      return false;
    }
  }

  // Upload resume and cover letter. Clicks each "Attach" button so the native
  // file chooser fires — this triggers React/Vue event handlers and the UI updates.
  // Falls back to setInputFiles for plain HTML file inputs.
  private async uploadFiles(page: Page, resumePath: string, coverLetterText?: string) {
    let coverLetterPath: string | undefined;
    if (coverLetterText) {
      coverLetterPath = path.join(os.tmpdir(), `cover-letter-${Date.now()}.txt`);
      fs.writeFileSync(coverLetterPath, coverLetterText, 'utf8');
    }

    // Strategy 1: find "Attach" buttons by their surrounding label context and click them.
    // Works for Greenhouse, Lever, and any ATS that uses a button-triggered file picker.
    const attachButtons = page.locator('button, a, label').filter({ hasText: /^Attach$|^Upload$/i });
    const btnCount = await attachButtons.count();

    let resumeUploaded = false;
    let coverUploaded = false;

    for (let i = 0; i < btnCount; i++) {
      const btn = attachButtons.nth(i);
      // Determine context from the nearest section heading or label
      const context = await page.evaluate((idx: number) => {
        const buttons = Array.from(document.querySelectorAll('button, a, label')).filter(
          (el) => /^(Attach|Upload)$/i.test(el.textContent?.trim() ?? '')
        );
        const btn = buttons[idx];
        if (!btn) return '';
        let node = btn.parentElement;
        for (let j = 0; j < 8; j++) {
          if (!node) break;
          const t = node.textContent?.toLowerCase() ?? '';
          if (t.includes('cover')) return 'cover';
          if (t.includes('resume') || t.includes('cv')) return 'resume';
          node = node.parentElement;
        }
        return '';
      }, i).catch(() => '');

      const isCover = context === 'cover';
      const isResume = context === 'resume' || (!isCover && !resumeUploaded);

      if (isResume && !resumeUploaded) {
        resumeUploaded = await this.uploadViaAttachButton(page, btn, resumePath, 'Resume');
      } else if (isCover && coverLetterPath && !coverUploaded) {
        coverUploaded = await this.uploadViaAttachButton(page, btn, coverLetterPath, 'Cover letter');
      }
    }

    // Strategy 2: fallback to setInputFiles for plain (non-React) file inputs
    if (!resumeUploaded || (coverLetterPath && !coverUploaded)) {
      const inputs = page.locator('input[type="file"]');
      const inputCount = await inputs.count();
      for (let i = 0; i < inputCount; i++) {
        if (resumeUploaded && (!coverLetterPath || coverUploaded)) break;
        const input = inputs.nth(i);
        if (!resumeUploaded) {
          try {
            await input.setInputFiles(resumePath);
            resumeUploaded = true;
            console.log('[Stagehand] Resume uploaded via setInputFiles fallback');
          } catch { /* skip */ }
        } else if (coverLetterPath && !coverUploaded) {
          try {
            await input.setInputFiles(coverLetterPath);
            coverUploaded = true;
            console.log('[Stagehand] Cover letter uploaded via setInputFiles fallback');
          } catch { /* skip */ }
        }
      }
    }

    if (!resumeUploaded) console.log('[Stagehand] Resume upload: no suitable button or input found');
    if (coverLetterPath && !coverUploaded) console.log('[Stagehand] Cover letter upload: no suitable button or input found');
  }

  // Direct Playwright fills for common personal-info fields — no LLM, works on most ATS platforms.
  private async fillCommonFields(page: Page, userProfile: UserProfile) {
    const tryFill = async (selector: string, value: string) => {
      if (!value) return false;
      try {
        const loc = page.locator(selector).first();
        if ((await loc.count()) === 0) return false;
        await loc.fill(value);
        return true;
      } catch { return false; }
    };

    const [first, ...rest] = (userProfile.name || '').split(' ');
    const last = rest.join(' ');

    // First name — Greenhouse, Lever, Workable, generic autocomplete
    await tryFill(
      '#first_name, input[name*="first_name" i], input[name*="firstName" i], input[autocomplete="given-name"]',
      first
    );
    // Last name
    await tryFill(
      '#last_name, input[name*="last_name" i], input[name*="lastName" i], input[autocomplete="family-name"]',
      last
    );
    // Full name fallback (single name field)
    await tryFill(
      'input[name*="full_name" i], input[name*="fullName" i], input[placeholder*="full name" i]',
      userProfile.name || ''
    );
    // Email
    await tryFill(
      '#email, input[type="email"], input[name*="email" i], input[autocomplete="email"]',
      userProfile.email || ''
    );
    // Phone
    await tryFill(
      '#phone, input[type="tel"], input[name*="phone" i], input[autocomplete="tel"]',
      userProfile.phone || ''
    );
    // Location / city
    await tryFill(
      '#job_application_location, input[id*="location" i], input[name*="location" i], input[placeholder*="city" i]',
      userProfile.location || ''
    );
    // LinkedIn
    await tryFill(
      'input[id*="linkedin" i], input[name*="linkedin" i], input[placeholder*="linkedin" i], input[aria-label*="linkedin" i]',
      userProfile.linkedin || ''
    );
    // Website / portfolio
    if (userProfile.github) {
      await tryFill(
        'input[id*="website" i], input[name*="website" i], input[id*="portfolio" i], input[name*="github" i]',
        userProfile.github
      );
    }

    console.log('[Stagehand] Common fields fill attempted');
  }

  private async safeAct(instruction: string, page: Page) {
    try {
      await this.stagehand!.act(instruction, { page });
    } catch (err) {
      console.log(`[Stagehand] act() skipped: ${instruction.slice(0, 80)}...`);
    }
  }

  async close() {
    if (this.stagehand) {
      await this.stagehand.close();
      this.stagehand = null;
    }
  }
}
