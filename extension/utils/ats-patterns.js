// URL patterns for known ATS platforms — matched against window.location.href
const ATS_PATTERNS = [
  // Workable
  /apply\.workable\.com\/.+\/apply/,
  /jobs\.workable\.com\/.+\/apply/,

  // Greenhouse
  /boards\.greenhouse\.io\/.+\/jobs\//,
  /job-boards\.greenhouse\.io\//,
  /greenhouse\.io\/applications\//,
  /greenhouse\.io\/embed\/job_app/,

  // Lever
  /jobs\.lever\.co\/.+\/apply/,

  // Ashby (hosted + embedded via ashby_jid query param on company career pages)
  /app\.ashbyhq\.com\/.*\/application/,
  /jobs\.ashbyhq\.com\//,
  /[?&]ashby_jid=/,

  // SmartRecruiters
  /careers\.smartrecruiters\.com\/.+\/apply/,
  /jobs\.smartrecruiters\.com\//,

  // Breezy
  /app\.breezy\.hr\/.+\/apply/,
  /breezy\.hr\/.+\/apply/,

  // Jobvite
  /jobs\.jobvite\.com\/.+\/apply/,

  // iCIMS
  /careers.*\.icims\.com\/.+\/apply/,

  // Workday
  /.*\.myworkdayjobs\.com\/.+\/apply/,

  // BambooHR
  /.*\.bamboohr\.com\/careers\/.+\/apply/,

  // Freshteam (Freshworks)
  /.*\.freshteam\.com\/jobs\/.+\/apply/,
  /.*\.freshteam\.com\/jobs\//,

  // Rippling ATS
  /ats\.rippling\.com\/.+\/jobs/,

  // Recruitee
  /\.recruitee\.com\/o\//,

  // Personio
  /\.jobs\.personio\.(com|de)\//,

  // Taleo (Oracle)
  /\.taleo\.net\/careersection\/.+\/jobapply\.ftl/,

  // Darwinbox
  /\.darwinbox\.in\/ms\/candidatev2\//,

  // Instahyre
  /instahyre\.com\/job\//,

  // Cutshort
  /cutshort\.io\/.+\/jobs\//,

  // Naukri
  /naukri\.com\/job-listings-/,

  // Generic apply page detection (fallback — checked last)
  /[?&/]apply($|[/?&#])/,
  /[?&/]application($|[/?&#])/,
];

// URL patterns for pages that are JD/listing pages (not the actual application form).
// On these pages the extension should immediately extract the JD and look for an Apply button
// rather than waiting 12 seconds for form fields that will never appear.
const JD_PAGE_PATTERNS = [
  // Ashby: job listing page (without /application suffix)
  { pattern: /jobs\.ashbyhq\.com\/[^/]+\/[^/]+$/, exclude: /\/application/ },
  // Ashby with embed params but still the JD page
  { pattern: /jobs\.ashbyhq\.com\/[^/]+\/[^/?]+\?/, exclude: /\/application/ },
  // Lever: job listing page (without /apply suffix)
  { pattern: /jobs\.lever\.co\/[^/]+\/[^/]+$/, exclude: /\/apply/ },
  // LinkedIn job description pages
  { pattern: /linkedin\.com\/jobs\/(view|collections)\//, exclude: null },
  // Indeed job description pages
  { pattern: /indeed\.com\/viewjob/, exclude: null },
  // Freshteam: job listing page (without /apply suffix)
  { pattern: /.*\.freshteam\.com\/jobs\/[^/]+\/[^/]+$/, exclude: /\/apply/ },
  // Recruitee: job listing page (without /c/new apply suffix)
  { pattern: /\.recruitee\.com\/o\/[^/?]+$/, exclude: /\/c\/new/ },
  // Personio: job listing page (without /apply suffix)
  { pattern: /\.jobs\.personio\.(com|de)\/job\/\d+$/, exclude: /\/apply/ },
  // Taleo: job detail page (before the jobapply step)
  { pattern: /\.taleo\.net\/careersection\/.+\/jobdetail\.ftl/, exclude: null },
  // Naukri: individual job listing page
  { pattern: /naukri\.com\/job-listings-/, exclude: null },
  // Wellfound: individual job page on company profile
  { pattern: /wellfound\.com\/company\/[^/]+\/jobs\/[^/]+$/, exclude: null },
  // ZipRecruiter: individual job page
  { pattern: /ziprecruiter\.com\/c\/[^/]+\/Job\//, exclude: null },
  // Rippling: job detail page (form lives at .../jobs/{id}/apply)
  { pattern: /ats\.rippling\.com\/[^/]+\/jobs\/[^/?]+/, exclude: /\/apply/ },
  // Instahyre / Cutshort / Darwinbox listing pages
  { pattern: /instahyre\.com\/job\//, exclude: null },
  { pattern: /cutshort\.io\/.+\/jobs\//, exclude: null },
  { pattern: /\.darwinbox\.in\/ms\/candidatev2\//, exclude: /\/apply/ },
  // Generic job boards — has no /apply or /application in path
  { pattern: /greenhouse\.io\/jobs\/\d+$/, exclude: null },
];

// Google Forms — never auto-detected as an apply page; only opened via manual
// FORCE_OPEN (toolbar icon click), since forms.gle links are used for all kinds
// of surveys, not just job applications.
const GOOGLE_FORMS_PATTERN = /(docs\.google\.com\/forms\/|forms\.gle\/)/;

/**
 * Returns true if the given URL matches a known ATS apply page.
 * @param {string} url
 * @returns {boolean}
 */
function isApplyPage(url) {
  return ATS_PATTERNS.some((pattern) => pattern.test(url));
}

/**
 * Returns true if the URL is a Google Forms page.
 * @param {string} url
 * @returns {boolean}
 */
function isGoogleFormPage(url) {
  return GOOGLE_FORMS_PATTERN.test(url);
}

/**
 * Returns true if the URL is a known JD/listing page where there will be no form fields.
 * @param {string} url
 * @returns {boolean}
 */
function isJobDescriptionPage(url) {
  return JD_PAGE_PATTERNS.some(({ pattern, exclude }) =>
    pattern.test(url) && (!exclude || !exclude.test(url))
  );
}

/**
 * True when extracted fields look like a real application form (not a JD page).
 * @param {Array<{inputType?: string, label?: string, fieldName?: string, placeholder?: string}>} fields
 * @returns {boolean}
 */
function hasSubstantialApplicationSignals(fields) {
  return (fields || []).some((f) => {
    const info = `${f.label || ''} ${f.fieldName || ''} ${f.placeholder || ''} ${f.inputType || ''}`.toLowerCase();
    if (f.inputType === 'email' || f.inputType === 'file' || f.inputType === 'tel') return true;
    return /email|resume|curriculum|phone|first.?name|last.?name|cover.?letter|linkedin/.test(info);
  });
}

/**
 * General fast-path: any page with an Apply CTA and no real application form yet
 * should capture the JD and navigate — not wait 12s for fields that will never appear.
 * @param {number} fieldCount
 * @param {boolean} hasApplyButton
 * @param {boolean} hasSubstantialApplicationSignals
 * @returns {boolean}
 */
function shouldNavigateViaApplyButton(fieldCount, hasApplyButton, hasSubstantialApplicationSignals) {
  if (!hasApplyButton) return false;
  if (hasSubstantialApplicationSignals) return false;
  if (fieldCount > 2) return false;
  return true;
}
