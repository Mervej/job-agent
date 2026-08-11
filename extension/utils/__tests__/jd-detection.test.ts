/**
 * Loads extension/utils/ats-patterns.js into a VM so we can unit-test
 * pure JD-detection helpers without a browser.
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';

function loadAtsPatterns(): {
  isJobDescriptionPage: (url: string) => boolean;
  isApplyPage: (url: string) => boolean;
  shouldNavigateViaApplyButton: (
    fieldCount: number,
    hasApplyButton: boolean,
    hasSubstantialApplicationSignals: boolean
  ) => boolean;
  hasSubstantialApplicationSignals: (fields: Array<Record<string, unknown>>) => boolean;
} {
  const file = path.join(__dirname, '..', 'ats-patterns.js');
  const code = fs.readFileSync(file, 'utf8');
  const ctx: Record<string, unknown> = {};
  vm.runInNewContext(
    `${code}\n` +
      `this.isJobDescriptionPage = isJobDescriptionPage;\n` +
      `this.isApplyPage = isApplyPage;\n` +
      `this.shouldNavigateViaApplyButton = shouldNavigateViaApplyButton;\n` +
      `this.hasSubstantialApplicationSignals = hasSubstantialApplicationSignals;\n`,
    ctx
  );
  return ctx as ReturnType<typeof loadAtsPatterns>;
}

const {
  isJobDescriptionPage,
  isApplyPage,
  shouldNavigateViaApplyButton,
  hasSubstantialApplicationSignals,
} = loadAtsPatterns();

describe('Rippling JD vs apply URL', () => {
  const jdUrl =
    'https://ats.rippling.com/heymarvin/jobs/09ea7738-8da8-47cf-81e0-781740ddaa4c?jobSite=LinkedIn';
  const applyUrl =
    'https://ats.rippling.com/heymarvin/jobs/09ea7738-8da8-47cf-81e0-781740ddaa4c/apply';

  it('treats Rippling job detail URL as a JD page', () => {
    expect(isJobDescriptionPage(jdUrl)).toBe(true);
  });

  it('does NOT treat Rippling /apply URL as a JD page', () => {
    expect(isJobDescriptionPage(applyUrl)).toBe(false);
  });

  it('still matches both as ATS pages for panel injection', () => {
    expect(isApplyPage(jdUrl)).toBe(true);
    expect(isApplyPage(applyUrl)).toBe(true);
  });
});

describe('shouldNavigateViaApplyButton (general Apply CTA fast-path)', () => {
  it('navigates when Apply button exists and form is empty', () => {
    expect(shouldNavigateViaApplyButton(0, true, false)).toBe(true);
  });

  it('navigates when Apply button exists and only 1–2 incidental fields', () => {
    expect(shouldNavigateViaApplyButton(2, true, false)).toBe(true);
  });

  it('does not navigate without an Apply button', () => {
    expect(shouldNavigateViaApplyButton(0, false, false)).toBe(false);
  });

  it('does not navigate when a real application form is present', () => {
    expect(shouldNavigateViaApplyButton(1, true, true)).toBe(false);
  });

  it('does not navigate when many fields are already on the page', () => {
    expect(shouldNavigateViaApplyButton(5, true, false)).toBe(false);
  });
});

describe('hasSubstantialApplicationSignals', () => {
  it('detects email / resume / name fields as application form signals', () => {
    expect(
      hasSubstantialApplicationSignals([
        { inputType: 'email', label: 'Email', fieldName: 'email' },
      ])
    ).toBe(true);
    expect(
      hasSubstantialApplicationSignals([
        { inputType: 'file', label: 'Resume', fieldName: 'resume' },
      ])
    ).toBe(true);
    expect(
      hasSubstantialApplicationSignals([
        { inputType: 'text', label: 'First name', fieldName: 'first_name' },
      ])
    ).toBe(true);
  });

  it('ignores unrelated fields', () => {
    expect(
      hasSubstantialApplicationSignals([
        { inputType: 'text', label: 'Search', fieldName: 'q' },
      ])
    ).toBe(false);
  });
});
