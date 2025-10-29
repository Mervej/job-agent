import { chromium } from 'playwright';

export async function autoApplyStub(jobUrl: string, applicant: { name: string; email: string }, resumePath: string, coverLetter: string) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto(jobUrl, { waitUntil: 'domcontentloaded' });
    const screenshot = await page.screenshot();
    await browser.close();
    return { success: true, screenshot };
  } catch (err) {
    await browser.close();
    return { success: false, error: String(err) };
  }
}
