# LinkedIn Easy Apply integration

## Phase
execute (task 7 of 7 — all tasks complete)

## Source
User description (no Jira/Confluence/Figma artifacts). Example target URL:
`https://www.linkedin.com/jobs/search-results/?currentJobId=4460981141&...`

## Goal
Extend the job-agent Chrome extension to support LinkedIn's "Easy Apply" flow: read the job
description on a LinkedIn job page, fill the Easy Apply modal (contact info, resume, cover
letter/screening questions) using the same AI-mapping pipeline already used for other ATS
platforms and Google Forms, and stop for manual review before the final submit.

## Decisions (from clarifying questions)

1. **Trigger: manual-only.** Same mechanism as the Google Forms feature — the panel never
   auto-injects on LinkedIn job pages. The user opens it via the toolbar icon (`FORCE_OPEN`
   message → `injectPanel()`), bypassing `init()`'s auto-detection entirely.
   **Amended after Task 7**: once the panel is opened, the extension also auto-clicks
   LinkedIn's own "Easy Apply" button itself (`findLinkedInEasyApplyButton` +
   `clickLinkedInEasyApplyButton`/`tryClickLinkedInEasyApply` in `content-script.js`) — the
   user no longer has to click it manually. This isn't a new automation-risk boundary (it
   just opens the form; nothing is submitted), and was added at the user's direct request.
   Confirmed live that a plain `.click()` does nothing on this button — it needs a full
   `pointerdown/mousedown/pointerup/mouseup/click` sequence (same trick already used for
   React-Select-style dropdowns elsewhere in this file). Also confirmed this click is
   flaky (~works every other attempt, likely a race with LinkedIn's own click-handler
   hydration right after page load) — `tryClickLinkedInEasyApply` retries up to 3 times,
   verifying the modal actually opened before giving up and falling back to asking the
   user to click it themselves.
2. **Scope: "Easy Apply" only.** LinkedIn's in-page multi-step modal (no URL change) is the
   only flow covered. Jobs where "Apply" redirects to an external company ATS page are
   explicitly out of scope for this feature — if that external page happens to land on an
   already-supported ATS (Greenhouse, Lever, etc.), the extension's existing generic flow
   already handles it once there; no LinkedIn-specific JD-capture/redirect wiring is being
   added.
3. **Submit: never auto-submit.** The extension fills each step of the modal and clicks
   through "Next"/"Continue", but always stops at the final review step for the user to click
   the real "Submit application" button themselves. This matches the Google Forms decision and
   is deliberately more conservative given LinkedIn's automated-behavior detection can restrict
   accounts — this is real personal-account risk that doesn't exist for Google Forms or most
   ATS platforms.

## Confirmed findings (Task 1 research, live-verified 2026-09-08)

Sampled job: "Product Manager -Technical" at Zinnia (LinkedIn Easy Apply, footer reads
"Application powered by Greenhouse" — this is informational only, the modal UI itself is
100% LinkedIn's own; no embedded Greenhouse iframe was found).

- **The entire modal lives inside a shadow root — this is the one real structural wrinkle.**
  `document.querySelector('#interop-outlet').shadowRoot` is the host. Everything else —
  `#artdeco-modal-outlet` → `.artdeco-modal-overlay` → `div[role="dialog"].artdeco-modal` →
  `.artdeco-modal__content` → `<form>` — is inside that shadow root, invisible to plain
  `document.querySelectorAll`. Every extraction/fill call must resolve this host first, e.g.:
  `const dialog = document.querySelector('#interop-outlet').shadowRoot.querySelector('div[role="dialog"]')`
  and then scope all queries to `dialog`. No nested shadow roots or iframes beyond this one host.
- **All form controls are plain native HTML — no custom ARIA widgets like Google Forms.**
  Confirmed native `<input type="text">`, native `<select>` (e.g. "Phone country code",
  "Email address" — a dropdown of the user's verified emails), native `<input type="radio">`
  grouped in a `<fieldset>` with `<legend>` (e.g. a required "Gender" EEO question with 5
  options), and a custom-but-simple resume-picker (`.jobs-document-upload-redesign-card__container`
  cards, `aria-label="Selected"` vs `aria-label="Select this resume"`, toggled via plain
  `.click()`). This means the existing `fillText`/`fillSelect`/`fillRadio`/`fillCheckbox`
  fillers work unchanged once scoped into the shadow root — no Google-Forms-style
  "flag for manual click" path is needed for LinkedIn.
- **Every question is wrapped in `.fb-dash-form-element`** (LinkedIn's internal form-builder
  convention) — this is the reliable per-question container, analogous to Google Forms'
  `[role="listitem"]`. Question text is in a `<label>` (single-field questions) or a
  `<fieldset><legend>` (radio/checkbox groups). IDs are long structured strings (e.g.
  `single-line-text-form-component-formElement-urn-li-jobs-...-text`) — unique and stable
  per rendered field, so plain `id` selectors work fine, no `nth-of-type` collision risk like
  Google Forms' unlabeled inputs.
- **Plain synthetic `.click()` works fine on LinkedIn's own buttons/cards** — confirmed on the
  "Next"/"Review" button and the resume-picker cards. Unlike Google Forms' `jsaction`
  framework, LinkedIn does not appear to gate these on `event.isTrusted`. (Not exhaustively
  tested on every widget type, but no failures observed on any interactive element tried.)
- **"Next" button selector:** `[data-easy-apply-next-button]` (aria-label "Continue to next
  step"). On the last input step before review, the same button relabels to **"Review"**
  (`button[aria-label="Review your application"]`, `data-live-test-easy-apply-review-button`
  attribute) — this is the reliable signal that the *next* step will be the final review/submit
  step. A "Back" button (`aria-label="Back to previous step"`) is also always present.
- **Required-field validation blocks "Next" in place** (confirmed) — clicking Next/Review with
  empty required fields does *not* advance the step; instead each unfilled question shows an
  inline error `<div class="artdeco-inline-feedback artdeco-inline-feedback--error">Please enter
  a valid answer</div>` (or "Please make a selection" for radio groups) right under that
  question, and the step stays put. Selector: `.artdeco-inline-feedback--error` scoped within
  a `.fb-dash-form-element` tells you exactly which question is still blocking progress —
  this is the trigger for routing that question into `NEEDS_REVIEW` rather than getting stuck.
- **Cover letter is a separate, optional "Upload cover letter" button** on the same step as the
  resume picker (not a required field, no free-text alternative observed on this job) — distinct
  from the resume upload, both native file-picker-triggering buttons on this job. Whether a
  free-text "message to hiring manager"-style question ever appears instead is still unconfirmed
  (this job didn't have one) — treat as a Tier-2 AI free-text field like any other screening
  question if/when it appears, same as Google Forms' paragraph questions.
- **Dismissing a partially-filled modal shows a native "Save this application?" confirmation**
  (Save / Discard) — worth being aware of if a run is aborted mid-flow, though this is
  LinkedIn's own UI, not something the extension needs to build.

## Reuse from existing codebase

- AI field-mapping pipeline (`MAP_FIELDS` → `field-mapper.service.ts`) — semantic-type direct
  mapping, confidence-threshold flagging (`CONFIDENCE_THRESHOLD = 0.7`), Tier-2 AI free-text
  generation — should apply unchanged once fields are extracted from the modal.
- `NEEDS_REVIEW` / flagged-field review panel (`content-script.js` `runFillCycle`, `panel.js`
  `onNeedsReview`) for anything low-confidence, unautomatable (e.g. custom-widget questions, if
  any), or blocked by required-field validation.
- File-upload handling (`uploadFileField`) for the resume picker, if it turns out to be (or can
  be driven as) a native `<input type="file">`.

## Risk note

Automating interaction with LinkedIn's own UI is against LinkedIn's Terms of Service and their
systems actively try to detect bot-like behavior; repeated/aggressive automation can lead to
account restrictions. This is being built for personal use on the user's own account/browser,
consistent with the "never auto-submit" decision above to minimize footprint (fill-and-review
rather than fully hands-off).

## Plan

> Single-repo feature (job-agent: `extension/` + `src/`) — task labels use `[EXTENSION]`/`[BACKEND]`/`[RESEARCH]`/`[VERIFY]` instead of a two-repo split.

Total tasks: 7

### Task 1: [RESEARCH] Inspect a real Easy Apply modal's DOM ✅ DONE
**Files touched:** `specs/linkedin-easy-apply.md`
**What to do:** Using browser automation, open a real LinkedIn job with Easy Apply, click it, and inspect the modal's live DOM: container selector, per-question wrapper structure, whether radio/checkbox/dropdown screening questions are native `<input>`/`<select>` or custom ARIA/JS widgets (like Google Forms' `div[role=radio]`), the resume-picker markup, the "Next"/"Review" button selectors, and how the final review step (with "Submit application") is distinguishable from intermediate steps.
**Done when:**
- [x] Concrete selectors/examples recorded for: modal container, a text question, a radio/checkbox/dropdown question (whichever exist on the sampled job), the Next button, the final review step
- [x] Spec's "Known unknowns" section replaced with these confirmed findings
**Tests to write:** none (research task)
**Depends on:** none

### Task 2: [EXTENSION] Detect the Easy Apply modal opening ✅ DONE (implementation unverified against the real toolbar icon — see note)
**Files touched:** `extension/content-script.js`, `extension/utils/ats-patterns.js`
**What to do:** Add a LinkedIn-page helper (URL pattern) so `init()` continues to skip auto-injection there (manual-only, per spec decision #1). Add a `MutationObserver`-based watcher, armed once the panel is manually opened via the toolbar icon, that detects the Easy Apply modal container appearing after the user clicks LinkedIn's own "Easy Apply" button themselves.
**Done when:**
- [ ] Opening the panel via toolbar icon on a LinkedIn job page, then manually clicking "Easy Apply", triggers a visible status update in the panel confirming modal detection — no fields filled yet
  **Not verified live**: `claude-in-chrome` browser automation can only act within the page viewport, not Chrome's toolbar UI, so the toolbar-icon → `FORCE_OPEN` path itself couldn't be exercised. `isLinkedInJobPage`/`armLinkedInModalWatcher`/the `MutationObserver` are implemented per plan (`content-script.js`), but the live verification below located the dialog directly and drove `runLinkedInFillCycle`'s logic against it rather than going through the observer. **Please do one real click-through (reload the extension, click the toolbar icon on a LinkedIn job page, then click Easy Apply) to confirm detection fires.**
**Tests to write:** none (manual browser verification)
**Depends on:** Task 1

### Task 3: [EXTENSION] Extract fields scoped to the modal ✅ DONE
**Files touched:** `extension/utils/field-extractor.js`, `extension/content-script.js`
**What to do:** Extend `extractFields` (or add a modal-scoped variant) to accept a container scope so extraction only reads the modal's current step, not the whole page. Add handling for any custom widget types found in Task 1, following the same pattern as `extractGoogleFormFields` if needed.
**Done when:**
- [x] `extractFields(modalContainer)` returns correctly labeled fields for a real Easy Apply first step, verified live via browser automation
**Tests to write:** none (no test harness exists for extension JS yet, per prior session precedent)
**Depends on:** Task 1, Task 2

### Task 4: [EXTENSION] Fill current step and advance the wizard ✅ DONE
**Files touched:** `extension/content-script.js`
**What to do:** Add a LinkedIn-specific fill cycle that fills the current step's fields via the existing `MAP_FIELDS`/`fillField` pipeline, locates and clicks "Next"/"Continue", waits for the next step's fields to render, and loops. Reuse the existing `waitForNewControls`-style polling pattern rather than a fixed sleep.
**Done when:**
- [x] A real multi-step Easy Apply flow (≥2 steps) fills correctly end to end without manual intervention between steps — verified live across all 4 steps (Contact info → Resume/Cover letter → Screening questions → Additional Questions)
**Tests to write:** none
**Depends on:** Task 3

### Task 5: [EXTENSION] Handle screening-question widgets and resume picker ✅ DONE
**Files touched:** `extension/utils/field-filler.js`, `extension/utils/field-extractor.js`
**What to do:** Based on Task 1's findings, wire up filling for LinkedIn's radio/checkbox/dropdown screening questions (reuse `fillRadio`/`fillCheckbox`/`fillSelect`/`fillCombobox` if native, or add a Google-Forms-style flag-for-manual-click path if they turn out to be untrusted-click-gated custom widgets) and the resume picker (native file input reuse via `uploadFileField`, or a LinkedIn-specific picker interaction if it's a custom "choose previously uploaded resume" list).
**Done when:**
- [x] A sample radio/checkbox screening question and the resume picker both resolve correctly on a live Easy Apply modal — the required "Gender" radio question filled correctly (verified `checked` state); the resume/cover-letter step's native `<input type="file">`s are deliberately left untouched (backend already returns an empty value for file-type fields here, so they're skipped, not crashed on) — LinkedIn's own pre-selected default resume is used as-is, no upload wiring built for v1
**Tests to write:** none
**Depends on:** Task 4

### Task 6: [EXTENSION] Stop before submit; flag unresolved required fields ✅ DONE
**Files touched:** `extension/content-script.js`, `extension/panel/panel.js` (only if the review-list UI needs a tweak)
**What to do:** Detect the final review step (no further "Next", a real "Submit application" button present) and stop there without clicking it. Any field that can't be confidently filled (low AI confidence, or a required field LinkedIn is blocking "Next" on) routes into the existing `NEEDS_REVIEW` flagged-panel flow instead of getting the wizard stuck.
**Done when:**
- [x] Flow reaches the review step and halts every time, never clicking "Submit application" — verified live, `findLinkedInSubmitButton` correctly detected the real button on the 100% "Review your application" step
- [x] At least one deliberately-ambiguous screening question ends up in the flagged review list instead of blocking progress — verified by deliberately leaving "Notice period?" empty; `.artdeco-inline-feedback--error` correctly detected within its `.fb-dash-form-element`
**Tests to write:** none
**Depends on:** Task 5

### Task 7: [VERIFY] End-to-end manual verification ✅ DONE
**Files touched:** none (or `specs/linkedin-easy-apply.md` to record results)
**What to do:** Run the full flow against a real (or low-stakes test) Easy Apply job end to end via browser automation: toolbar icon → click Easy Apply → auto-fill across steps → flagged review for anything uncertain → halt at final review, never submitting.
**Done when:**
- [x] Full walkthrough completes with no unintended clicks past the review step, and results are summarized back to the user — see "Completed tasks" below. Note: driven directly against the modal (not via the toolbar icon — see Task 2 caveat), and the application was cleanly discarded (LinkedIn's own "Discard" option), never submitted.
**Tests to write:** none
**Depends on:** Task 6

## Start here

Create your branch before executing:
```
git checkout -b feature/linkedin-easy-apply
```

## Completed tasks

- **Task 1** (2026-09-08): Inspected a live Easy Apply modal (Zinnia "Product Manager
  -Technical" job) via browser automation. Key result: everything is inside a shadow root
  (`#interop-outlet`), but once scoped in, all controls are plain native HTML — no custom
  widget handling needed, unlike Google Forms. Full findings in "Confirmed findings" above.

- **Tasks 2–7** (2026-09-08): Implemented and live-verified the full LinkedIn Easy Apply flow.

  **Code changes:**
  - `extension/utils/ats-patterns.js`: added `isLinkedInJobPage(url)`.
  - `extension/content-script.js`: `init()` skips LinkedIn (manual-only, matching Google
    Forms); `startFlow()` branches into `armLinkedInModalWatcher()` for LinkedIn instead of
    `runFillCycle()`; added `armLinkedInModalWatcher`, `runLinkedInFillCycle`,
    `findLinkedInSubmitButton`, `fillLinkedInStepFields`, `flagLinkedInBlockedQuestions`; the
    `CONTINUE`/`RESCAN` panel-message handlers now resolve against the LinkedIn dialog (via a
    new `_linkedInDialog` module-level ref) instead of always assuming `document`, and resume
    `runLinkedInFillCycle` instead of the generic `advanceOrFinish()`/`runFillCycle()` when a
    LinkedIn flow is active.
  - `extension/utils/field-filler.js`: threaded an optional `root` param (default `document`)
    through `fillField`, `findFileInput`, and `fillRadio` so selectors resolve against a
    shadow-root-scoped element when passed one; `getRadioLabel` now looks up via
    `radio.getRootNode()` instead of hardcoded `document`.
  - `extension/utils/field-extractor.js`: three fixes that turned out to be necessary,
    discovered only via live testing (not predictable from the Task 1 DOM inspection alone):
    1. `getLabel`/`getOptions`/`makeSelector`'s uniqueness checks now resolve via
       `el.getRootNode()` instead of `document`, so they work inside a shadow root.
    2. **`isHidden()` bug**: it treated `opacity: 0` as hidden, which broke *all*
       radio/checkbox extraction on LinkedIn — their native inputs are invisible by design
       (CSS draws the visible circle/box over them), a common accessible-custom-control
       pattern. Fixed to only apply the opacity check to non-choice inputs.
    3. **Missing fieldset/legend support**: radio/checkbox groups labeled via
       `<fieldset><legend>` (e.g. "Gender") were mislabeled with the first option's own text
       ("Male") instead of the question, because `getLabel()` had no fieldset-aware branch.
       Added one (radio/checkbox only, checked before the per-option `label[for]` lookup),
       plus a new `getRadioOptionLabel()` so `getOptions()` still reports each option's own
       text correctly.

  **Live verification** (Zinnia "Product Manager -Technical", via browser automation,
  application discarded — never submitted):
  - Contact info step: text inputs (First/Last name) and selects (Phone country code, Email
    address) filled correctly through the shadow root.
  - Resume/cover-letter step: confirmed these are real native `<input type="file">`s behind
    "Upload resume"/"Upload cover letter" buttons; left untouched by design (backend returns
    no value for file-type fields here, so `fillLinkedInStepFields` naturally skips them —
    no crash, no unwanted upload attempt; LinkedIn's own pre-selected default resume is used).
  - Screening questions step (7 free-text questions): filled correctly; deliberately left one
    ("Notice period?") empty to test blocking — clicking Next correctly stayed on the same
    step and surfaced `.artdeco-inline-feedback--error` exactly on that question.
  - "Additional Questions" step (required "Gender" radio, 5 options): extraction now reports
    the correct question ("Gender") and correct per-option text (Male/Female/etc, not
    "Gender" repeated); filling correctly checked the target radio.
  - Final "Review your application" step (100%): `findLinkedInSubmitButton` correctly
    identified the real "Submit application" button — this is the intended stop point, never
    clicked.

  **Known gap**: Task 2's toolbar-icon → `FORCE_OPEN` → detection path itself was not
  exercised live (browser automation can't click Chrome's toolbar UI) — see the caveat on
  Task 2 above. Recommend one manual click-through before relying on this in practice.
