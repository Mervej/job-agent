// utils loaded as separate content scripts: ats-patterns.js, field-extractor.js, field-filler.js

const CONFIDENCE_THRESHOLD = 0.7;
const PANEL_WIDTH = 320;
const FILL_DELAY_MS = 120; // brief pause between fills for visibility

// ─── State (must be declared before init IIFE) ────────────────────────────────

let panelFrame = null;
let panelContainer = null;
let activeResumeId = null;
let isFilling = false;
let _flaggedFieldMeta = {}; // selector → fieldMeta, populated when flagging, used in CONTINUE

// ─── Bootstrap ───────────────────────────────────────────────────────────────

function init() {
  if (!isApplyPage(window.location.href) && !hasApplyForm()) return;

  // Avoid double-injection on re-runs
  if (document.getElementById('job-agent-panel-container')) return;

  injectPanel();
}

// Run on initial load
init();

// Re-run on SPA navigation (Workable, Greenhouse, Lever are SPAs)
let _lastUrl = location.href;
new MutationObserver(() => {
  if (location.href !== _lastUrl) {
    _lastUrl = location.href;
    init();
  }
}).observe(document.documentElement, { subtree: true, childList: true });

function injectPanel() {
  // Push page content left to make room
  document.body.style.marginRight = `${PANEL_WIDTH + 8}px`;
  document.body.style.transition = 'margin-right 0.25s ease';

  panelContainer = document.createElement('div');
  panelContainer.id = 'job-agent-panel-container';
  panelContainer.style.cssText = `
    position: fixed; top: 0; right: 0; width: ${PANEL_WIDTH}px; height: 100vh;
    z-index: 2147483647; box-shadow: -2px 0 16px rgba(0,0,0,0.15);
    background: #fff; border-left: 1px solid #e2e8f0;
    transform: translateX(${PANEL_WIDTH}px); transition: transform 0.25s ease;
  `;

  panelFrame = document.createElement('iframe');
  panelFrame.src = chrome.runtime.getURL('panel/panel.html');
  panelFrame.style.cssText = 'width:100%;height:100%;border:none;';

  panelContainer.appendChild(panelFrame);
  document.body.appendChild(panelContainer);

  // Slide in
  requestAnimationFrame(() => {
    panelContainer.style.transform = 'translateX(0)';
  });

  // Listen for messages from panel
  window.addEventListener('message', onPanelMessage);

  // Start flow once iframe loads
  panelFrame.addEventListener('load', startFlow);
}

// ─── Flow orchestration ───────────────────────────────────────────────────────

async function startFlow() {
  const { jobTitle, jobCompany } = detectJobInfo();

  // Fetch resumes and last-used resumeId from background
  const [resumesResp, storedId] = await Promise.all([
    sendToBackground({ type: 'FETCH_RESUMES' }),
    sendToBackground({ type: 'GET_RESUME_ID' }),
  ]);

  if (!resumesResp.ok) {
    postToPanel({ type: 'ERROR', message: 'Cannot reach backend. Is the server running?' });
    return;
  }

  const resumes = resumesResp.resumes || [];
  activeResumeId = storedId.resumeId ?? resumes[0]?.id ?? null;

  postToPanel({
    type: 'INIT',
    jobTitle,
    jobCompany,
    resumes,
    activeResumeId,
  });

  if (!activeResumeId) {
    postToPanel({ type: 'ERROR', message: 'No resume found. Upload one first.' });
    return;
  }

  await runFillCycle();
}

async function waitForFields(maxWaitMs = 12000) {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const fields = extractFields(document);
    if (fields.length > 2) return fields;
    await sleep(600);
  }
  return extractFields(document); // final attempt
}

async function runFillCycle() {
  if (isFilling) return;
  isFilling = true;

  try {
    postToPanel({ type: 'STATUS', text: 'Waiting for form to load...', showSpinner: true });

    const fields = await waitForFields();
    if (fields.length === 0) {
      postToPanel({ type: 'STATUS', text: 'No form fields found on this page.', showSpinner: false });
      isFilling = false;
      return;
    }

    postToPanel({ type: 'STATUS', text: `Found ${fields.length} fields, mapping with AI...`, showSpinner: true });

    const resp = await sendToBackground({
      type: 'MAP_FIELDS',
      payload: { fields, resumeId: activeResumeId, jobUrl: window.location.href },
    });

    if (!resp.ok) {
      postToPanel({ type: 'ERROR', message: resp.error || 'Mapping failed' });
      isFilling = false;
      return;
    }

    const { mappings, coverLetter } = resp;
    const flagged = [];
    let filled = 0;

    for (const mapping of mappings) {
      const { selector, value, confidence } = mapping;
      const fieldMeta = fields.find((f) => f.selector === selector) || {};

      // Auto-fill file inputs — resume/CV gets the PDF; cover letter file fields are skipped
      if (fieldMeta.inputType === 'file') {
        const fieldInfo = `${fieldMeta.label || ''} ${fieldMeta.fieldName || ''} ${fieldMeta.placeholder || ''}`.toLowerCase();
        const isCoverLetter = fieldInfo.includes('cover') || fieldInfo.includes('motivation');

        if (isCoverLetter) {
          // Only upload a PDF if there's no text/textarea cover letter field on this page
          const hasTextCoverLetterField = fields.some(f =>
            f.inputType !== 'file' &&
            `${f.label || ''} ${f.fieldName || ''}`.toLowerCase().includes('cover')
          );

          if (hasTextCoverLetterField) {
            postToPanel({
              type: 'FIELD_FILLED',
              selector,
              label: fieldMeta.label || 'Cover Letter (file)',
              value: '— skipped (text filled)',
              filled: ++filled,
              total: mappings.length,
            });
            await sleep(FILL_DELAY_MS);
            continue;
          }

          // No text field — generate and upload a cover letter PDF if we have the text
          let clValue = '— no cover letter generated';
          if (coverLetter && coverLetter.trim().length > 50) {
            const clResp = await sendToBackground({ type: 'FETCH_COVER_LETTER_PDF', text: coverLetter });
            if (clResp.ok) {
              const ok = await fillField(selector, `${clResp.base64},${clResp.filename}`, 'input', 'file', false);
              clValue = ok ? '✓ uploaded PDF' : '✗ upload failed';
            } else {
              clValue = '✗ PDF generation failed';
            }
          }
          postToPanel({
            type: 'FIELD_FILLED',
            selector,
            label: fieldMeta.label || 'Cover Letter',
            value: clValue,
            filled: ++filled,
            total: mappings.length,
          });
          await sleep(FILL_DELAY_MS);
          continue;
        }

        // Resume / CV — fetch PDF from backend via background service worker
        const fileResp = await sendToBackground({ type: 'FETCH_RESUME_FILE', resumeId: activeResumeId });
        const ok = fileResp.ok
          ? await fillField(selector, `${fileResp.base64},${fileResp.filename}`, 'input', 'file', false)
          : false;
        postToPanel({
          type: 'FIELD_FILLED',
          selector,
          label: fieldMeta.label || 'Resume',
          value: ok ? '✓ uploaded' : '✗ failed',
          filled: ++filled,
          total: mappings.length,
        });
        await sleep(FILL_DELAY_MS);
        continue;
      }

      if (!value) continue;

      if (confidence < CONFIDENCE_THRESHOLD) {
        flagged.push({
          selector,
          label: fieldMeta.label || fieldMeta.fieldName || selector,
          value,
          isTextarea: fieldMeta.elementType === 'textarea' || fieldMeta.elementType === 'div',
        });
        _flaggedFieldMeta[selector] = fieldMeta;
        postToPanel({
          type: 'FIELD_FILLED',
          selector,
          label: fieldMeta.label || fieldMeta.fieldName || selector,
          value: '⚠ needs review',
          filled: ++filled,
          total: mappings.length,
        });
        continue;
      }

      const ok = await fillField(
        selector, value, fieldMeta.elementType, fieldMeta.inputType, fieldMeta.isCombobox
      );

      postToPanel({
        type: 'FIELD_FILLED',
        selector,
        label: fieldMeta.label || fieldMeta.fieldName || selector,
        value: ok ? value : '✗ failed',
        filled: ++filled,
        total: mappings.length,
      });

      await sleep(FILL_DELAY_MS);
    }

    // Second pass: catch conditional fields that appeared after filling
    await sleep(800);
    const newFields = extractFields(document).filter(
      f => !fields.some(existing => existing.selector === f.selector)
    );
    if (newFields.length > 0) {
      const resp2 = await sendToBackground({
        type: 'MAP_FIELDS',
        payload: { fields: newFields, resumeId: activeResumeId, jobUrl: window.location.href },
      });
      if (resp2.ok) {
        for (const m2 of resp2.mappings) {
          if (!m2.value || m2.confidence < CONFIDENCE_THRESHOLD) continue;
          const fm2 = newFields.find(f => f.selector === m2.selector) || {};
          await fillField(m2.selector, m2.value, fm2.elementType, fm2.inputType, fm2.isCombobox);
          await sleep(FILL_DELAY_MS);
        }
      }
    }

    // Structured sections (Experience, Education, Projects)
    if (resp.structuredResume) {
      await fillStructuredSections(resp.structuredResume, resp.resumeText || '');
    }

    // Show review panel if there are flagged fields
    if (flagged.length > 0) {
      postToPanel({ type: 'NEEDS_REVIEW', flagged });
      isFilling = false;
      return;
    }

    await advanceOrFinish();

  } catch (err) {
    postToPanel({ type: 'ERROR', message: err.message });
    isFilling = false;
  }
}

// ─── Structured section filler ───────────────────────────────────────────────

const SECTION_TYPES = [
  { type: 'experience', keywords: ['experience', 'work history', 'employment', 'work experience'] },
  { type: 'education',  keywords: ['education', 'academic', 'degree', 'school', 'qualification'] },
  { type: 'project',    keywords: ['project', 'portfolio', 'work sample'] },
];

function formatEntryDate(dateStr) {
  if (!dateStr || dateStr === 'Present') return '';
  if (/^\d{2}\/\d{4}$/.test(dateStr)) return dateStr;
  if (/^\d{1}\/\d{4}$/.test(dateStr)) return '0' + dateStr;
  const iso = dateStr.match(/^(\d{4})-(\d{2})/);
  if (iso) return `${iso[2]}/${iso[1]}`;
  const months = {jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12'};
  const m = dateStr.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (m) { const mm = months[m[1].slice(0,3).toLowerCase()]; return mm ? `${mm}/${m[2]}` : dateStr; }
  return dateStr;
}

function mapEntryField(field, entryType, entryData, isCurrentJob) {
  const info = `${field.label || ''} ${field.placeholder || ''} ${field.fieldName || ''} ${field.questionText || ''}`.toLowerCase();

  if (entryType === 'experience') {
    if (/\btitle\b|position|job title/.test(info))                                return { value: entryData.role || '', isCheckbox: false };
    if (/company|employer|org(?:aniz)?/.test(info))                               return { value: entryData.company || '', isCheckbox: false };
    if (/industry|sector/.test(info))                                             return { value: '', isCheckbox: false };
    if (/current(?:ly)?.*work|still.*work|i currently|ongoing/.test(info))        return { value: isCurrentJob ? 'true' : 'false', isCheckbox: true };
    if (/start.*(?:date|mm)|(?:from|begin).*date|^from$|^start$/.test(info))      return { value: formatEntryDate(entryData.startDate), isCheckbox: false };
    if (/end.*(?:date|mm)|(?:to|until).*date|^to$|^end$/.test(info))             return { value: isCurrentJob ? '' : formatEntryDate(entryData.endDate), isCheckbox: false };
    if (/description|responsibilit|duties|detail|summary|about|what/.test(info)) {
      const parts = [entryData.description, entryData.achievements].filter(Boolean);
      return { value: parts.join('\n').trim(), isCheckbox: false };
    }
    if (/location|city|country/.test(info))                                       return { value: entryData.location || '', isCheckbox: false };
  }

  if (entryType === 'education') {
    if (/school|university|college|institution/.test(info))    return { value: entryData.institution || '', isCheckbox: false };
    if (/degree|qualification|level|award/.test(info))         return { value: entryData.degree || '', isCheckbox: false };
    if (/field|major|subject|study|discipline/.test(info))     return { value: entryData.fieldOfStudy || '', isCheckbox: false };
    if (/start.*(?:date|mm)|from|begin/.test(info))            return { value: formatEntryDate(entryData.startDate), isCheckbox: false };
    if (/end.*(?:date|mm)|graduation|to\b|until/.test(info))   return { value: formatEntryDate(entryData.endDate), isCheckbox: false };
    if (/grade|gpa|score|result/.test(info))                   return { value: entryData.grade || '', isCheckbox: false };
  }

  if (entryType === 'project') {
    if (/name|title/.test(info))                               return { value: entryData.name || '', isCheckbox: false };
    if (/description|detail|about|summary/.test(info))         return { value: entryData.description || '', isCheckbox: false };
    if (/url|link|website/.test(info))                         return { value: entryData.url || '', isCheckbox: false };
    if (/tech|stack|language|tools|built/.test(info))          return { value: entryData.technologies || '', isCheckbox: false };
    if (/start.*(?:date|mm)|from/.test(info))                  return { value: formatEntryDate(entryData.startDate), isCheckbox: false };
    if (/end.*(?:date|mm)|to\b/.test(info))                    return { value: formatEntryDate(entryData.endDate), isCheckbox: false };
  }

  return { value: '', isCheckbox: false };
}

// Use MutationObserver to capture exactly which controls appear after clicking Add
function waitForNewControls(timeoutMs = 4000) {
  const CONTROL_SEL = 'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), textarea, select, div[contenteditable="true"]';
  return new Promise(resolve => {
    const found = new Set();
    const observer = new MutationObserver(mutations => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.matches && node.matches(CONTROL_SEL)) found.add(node);
          if (node.querySelectorAll) node.querySelectorAll(CONTROL_SEL).forEach(el => found.add(el));
        }
      }
      if (found.size > 0) { clearTimeout(timer); observer.disconnect(); resolve([...found]); }
    });
    const timer = setTimeout(() => { observer.disconnect(); resolve([...found]); }, timeoutMs);
    observer.observe(document.body, { childList: true, subtree: true });
  });
}

function getFieldLabel(el) {
  const aria = el.getAttribute('aria-label');
  if (aria && aria.trim()) return aria.trim();
  if (el.id) {
    const lbl = document.querySelector('label[for="' + el.id + '"]');
    if (lbl) return (lbl.textContent || '').replace(/\*/g, '').trim();
  }
  const parentLbl = el.closest('label');
  if (parentLbl) return (parentLbl.textContent || '').trim();
  const group = el.closest('[class*="field"],[class*="form"],[class*="row"],[class*="group"],li');
  if (group) {
    const lbl = group.querySelector('label, legend');
    if (lbl) return (lbl.textContent || '').replace(/\*/g, '').trim();
  }
  return el.placeholder || el.name || '';
}

async function fillFieldEl(el, value, elementType, inputType, isCombobox) {
  if (!el || !document.contains(el)) return false;
  if (elementType === 'select') {
    const lower = value.toLowerCase();
    for (const opt of el.options) {
      if (opt.text.toLowerCase() === lower || opt.text.toLowerCase().includes(lower)) {
        el.value = opt.value;
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
    }
    return false;
  }
  if (elementType === 'div' && el.getAttribute('contenteditable') === 'true') {
    el.focus();
    document.execCommand('selectAll', false, null);
    document.execCommand('insertText', false, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
    return true;
  }
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value') &&
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set ||
    Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value') &&
    Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
  if (setter) setter.call(el, value); else el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

function findAddButtons() {
  const all = [...document.querySelectorAll('button, [role="button"], a')];
  return all.filter(el => {
    const text = (el.textContent || '').trim().toLowerCase().replace(/\s+/g, ' ');
    return (text === 'add' || text.startsWith('+ ') || /^add\b/.test(text)) &&
      !text.includes('file') && !text.includes('attach');
  });
}

function countExistingEntries(addButton) {
  const section = addButton.closest('section, fieldset, [class*="section"], [class*="group"], [class*="block"]') || addButton.parentElement;
  if (!section) return 0;
  const ENTRY_ACTIONS = ['delete', 'remove', 'edit'];
  const actionBtns = [...section.querySelectorAll('button, [role="button"]')].filter(b => {
    const t = (b.textContent || b.getAttribute('aria-label') || '').trim().toLowerCase();
    return ENTRY_ACTIONS.some(a => t.includes(a));
  });
  const ancestors = new Set(actionBtns.map(b => {
    let el = b;
    for (let d = 0; d < 3 && el.parentElement && el.parentElement !== section; d++) el = el.parentElement;
    return el;
  }));
  return ancestors.size;
}

async function findAddButtonWithRetry(keywords, maxRetries = 4, delayMs = 600) {
  for (let i = 0; i < maxRetries; i++) {
    const btn = findAddButtons().find(b => {
      const ctx = ((b.closest('section,fieldset,[class*="section"],[class*="group"],div') || document.body).textContent + ' ' + (b.textContent || '')).toLowerCase().slice(0, 400);
      return keywords.some(k => ctx.includes(k));
    });
    if (btn) return btn;
    await sleep(delayMs);
  }
  return null;
}

function findSaveButton(newControls) {
  if (!newControls.length) return null;
  let ancestor = newControls[0].parentElement;
  while (ancestor) {
    if (newControls.every(el => ancestor.contains(el))) break;
    ancestor = ancestor.parentElement;
  }
  if (!ancestor) return null;
  const SAVE_TEXTS = ['save', 'add', 'done', 'ok', 'confirm', 'apply'];
  return [...ancestor.querySelectorAll('button, [role="button"]')].find(btn => {
    const t = (btn.textContent || '').trim().toLowerCase();
    return SAVE_TEXTS.some(s => t === s || t.startsWith(s));
  }) || null;
}

function flattenEntryData(entry) {
  const flat = {};
  for (const [k, v] of Object.entries(entry || {})) {
    flat[k] = Array.isArray(v) ? v.join('. ') : String(v || '');
  }
  return flat;
}

async function fillStructuredSections(structuredResume) {
  for (const { type, keywords } of SECTION_TYPES) {
    const allEntries = structuredResume[type] || structuredResume[type + 's'] || [];
    if (!allEntries.length) continue;

    const addBtn = await findAddButtonWithRetry(keywords, 2, 300);
    if (!addBtn) continue;

    const alreadyFilled = countExistingEntries(addBtn);
    const toAdd = allEntries.slice(alreadyFilled);
    if (!toAdd.length) continue;

    postToPanel({ type: 'STATUS', text: `Adding ${toAdd.length} ${type} ${toAdd.length > 1 ? 'entries' : 'entry'}...`, showSpinner: true });

    for (let i = 0; i < toAdd.length; i++) {
      const entryData = flattenEntryData(toAdd[i]);
      const resumeEntryIndex = alreadyFilled + i;
      const isCurrentJob = type === 'experience' && resumeEntryIndex === 0 &&
        (!entryData.endDate || entryData.endDate === 'Present' || entryData.endDate === '');

      const freshBtn = await findAddButtonWithRetry(keywords, 5, 600);
      if (!freshBtn) { console.warn('[JobAgent] Add button not found for', type, 'entry', i); break; }

      // Start observing before click to catch all mutations
      const newControlsPromise = waitForNewControls(4000);
      freshBtn.scrollIntoViewIfNeeded && freshBtn.scrollIntoViewIfNeeded();
      freshBtn.click();
      const newControls = await newControlsPromise;

      if (!newControls.length) { console.warn('[JobAgent] No new controls after clicking Add for', type); continue; }

      // Build field metadata from new DOM elements directly — no backend needed
      const newFields = newControls.map((el, idx) => ({
        el,
        label: getFieldLabel(el),
        placeholder: el.placeholder || '',
        fieldName: el.name || el.id || ('field_' + idx),
        elementType: el.tagName.toLowerCase(),
        inputType: el.tagName.toLowerCase() === 'input' ? (el.type || 'text') : undefined,
        isCombobox: el.getAttribute('role') === 'combobox',
      }));

      // Checkboxes first — they may show/hide other fields (e.g. end date)
      const sorted = [
        ...newFields.filter(f => f.inputType === 'checkbox'),
        ...newFields.filter(f => f.inputType !== 'checkbox'),
      ];

      for (const field of sorted) {
        const { value, isCheckbox } = mapEntryField(field, type, entryData, isCurrentJob);
        if (!document.contains(field.el)) continue;

        if (isCheckbox) {
          const shouldCheck = value === 'true';
          if (field.el.checked !== shouldCheck) { field.el.click(); await sleep(400); }
          continue;
        }

        if (!value) continue;
        // Skip end date for current job — it's hidden after the checkbox is checked
        if (isCurrentJob && /end.*(?:date|mm)|^to$|until/i.test(field.label + ' ' + field.placeholder)) continue;

        await fillFieldEl(field.el, value, field.elementType, field.inputType, field.isCombobox);
        await sleep(FILL_DELAY_MS);
      }

      const saveBtn = findSaveButton(newControls);
      if (saveBtn) { await sleep(500); saveBtn.click(); await sleep(1200); }
    }
  }
}

async function advanceOrFinish() {
  isFilling = false;

  if (isFinalReviewPage()) {
    postToPanel({ type: 'ALL_DONE' });
    return;
  }

  const nextBtn = findNextButton();
  if (nextBtn) {
    postToPanel({ type: 'STATUS', text: 'Advancing to next step...', showSpinner: true });
    await sleep(400);
    nextBtn.click();
    await sleep(1500);
    await runFillCycle();
  } else {
    postToPanel({ type: 'ALL_DONE' });
  }
}

// ─── Panel message handler ────────────────────────────────────────────────────

async function onPanelMessage(event) {
  const msg = event.data;
  if (!msg || typeof msg.type !== 'string') return;

  if (msg.type === 'RESUME_SELECTED') {
    activeResumeId = msg.resumeId;
    sendToBackground({ type: 'SAVE_RESUME_ID', resumeId: msg.resumeId });
  }

  if (msg.type === 'CONTINUE') {
    if (msg.edits) {
      for (const [selector, value] of Object.entries(msg.edits)) {
        if (!value) continue;
        // Use stored metadata — avoids re-extracting after page re-renders
        const fieldMeta = _flaggedFieldMeta[selector] || {};
        // fillField now checks the actual element type — no need to special-case here
        await fillField(selector, value, fieldMeta.elementType, fieldMeta.inputType, fieldMeta.isCombobox);
        await sleep(FILL_DELAY_MS);
      }
    }
    _flaggedFieldMeta = {};
    await advanceOrFinish();
  }

  if (msg.type === 'CLOSE') {
    closePanel();
  }
}

// ─── DOM helpers ─────────────────────────────────────────────────────────────

function hasApplyForm() {
  const url = window.location.href.toLowerCase();
  if (!url.includes('apply') && !url.includes('application')) return false;
  const fields = document.querySelectorAll(
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select'
  );
  const hasSubmit = !!document.querySelector('button[type="submit"], input[type="submit"], button');
  return fields.length > 3 && hasSubmit;
}

function detectJobInfo() {
  const ogTitle = document.querySelector('meta[property="og:title"]') &&
    document.querySelector('meta[property="og:title"]').getAttribute('content') || '';
  const title = ogTitle || document.title || '';
  const parts = title.split(/\s*[\|—\-]\s*/);
  return { jobTitle: parts[0] && parts[0].trim() || title, jobCompany: parts[1] && parts[1].trim() || '' };
}

function isFinalReviewPage() {
  const bodyText = document.body.innerText.toLowerCase();
  const submitBtn = document.querySelector(
    'button[type="submit"], input[type="submit"], button[aria-label*="submit"], button[aria-label*="Submit"]'
  );
  return !!submitBtn && (
    bodyText.includes('review your application') ||
    bodyText.includes('confirm your application') ||
    bodyText.includes('submit application') ||
    bodyText.includes('review and submit')
  );
}

function findNextButton() {
  const NEXT_TEXTS = ['next', 'continue', 'proceed', 'save & continue', 'next step'];
  const buttons = document.querySelectorAll('button, [role="button"], input[type="button"]');
  for (const btn of buttons) {
    const text = (btn.textContent || btn.value || btn.getAttribute('aria-label') || '').trim().toLowerCase();
    if (NEXT_TEXTS.some(t => text.includes(t))) {
      if (btn.type === 'submit' && isFinalReviewPage()) continue;
      return btn;
    }
  }
  return null;
}

function closePanel() {
  if (panelContainer) {
    panelContainer.style.transform = `translateX(${PANEL_WIDTH}px)`;
    document.body.style.marginRight = '';
    setTimeout(() => panelContainer.remove(), 300);
  }
  window.removeEventListener('message', onPanelMessage);
}

// ─── Messaging ────────────────────────────────────────────────────────────────

function postToPanel(msg) {
  if (panelFrame && panelFrame.contentWindow) panelFrame.contentWindow.postMessage(msg, '*');
}

function sendToBackground(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      resolve(response || { ok: false, error: 'No response from background' });
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
