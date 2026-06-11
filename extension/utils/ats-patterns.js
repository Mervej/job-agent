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
  // Generic job boards — has no /apply or /application in path
  { pattern: /greenhouse\.io\/jobs\/\d+$/, exclude: null },
];

/**
 * Returns true if the given URL matches a known ATS apply page.
 * @param {string} url
 * @returns {boolean}
 */
function isApplyPage(url) {
  return ATS_PATTERNS.some((pattern) => pattern.test(url));
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
