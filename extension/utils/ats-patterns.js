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

  // Generic apply page detection (fallback — checked last)
  /[?&/]apply($|[/?&#])/,
  /[?&/]application($|[/?&#])/,
];

/**
 * Returns true if the given URL matches a known ATS apply page.
 * @param {string} url
 * @returns {boolean}
 */
function isApplyPage(url) {
  return ATS_PATTERNS.some((pattern) => pattern.test(url));
}
