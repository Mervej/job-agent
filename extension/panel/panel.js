// panel.js — runs inside the iframe, communicates with content-script via postMessage

const $ = (id) => document.getElementById(id);

let resumes = [];
let flaggedEdits = {};
let settingsOpen = false;

// ─── postMessage listener ────────────────────────────────────────────────────

window.addEventListener('message', (event) => {
  // Only accept messages from the parent page (content-script injects the iframe)
  const msg = event.data;
  if (!msg || typeof msg.type !== 'string') return;

  switch (msg.type) {
    case 'INIT': return onInit(msg);
    case 'FIELD_FILLED': return onFieldFilled(msg);
    case 'NEEDS_REVIEW': return onNeedsReview(msg);
    case 'STEP_DONE': return onStepDone(msg);
    case 'ALL_DONE': return onAllDone();
    case 'ERROR': return onError(msg.message);
    case 'STATUS': return setStatus(msg.text, msg.showSpinner !== false);
    case 'NO_API_KEY': return onNoApiKey();
    case 'API_KEY_LOADED': return onApiKeyLoaded(msg.apiKey);
    case 'API_KEY_SAVED': return onApiKeySaved();
  }
});

// ─── Event handlers ──────────────────────────────────────────────────────────

function onInit({ jobTitle, jobCompany, resumes: resumeList, activeResumeId }) {
  $('jobTitle').textContent = jobTitle || 'Unknown role';
  $('jobCompany').textContent = jobCompany || '';

  resumes = resumeList || [];
  const select = $('resumeSelect');
  select.innerHTML = '';

  if (resumes.length === 0) {
    select.innerHTML = '<option value="">No resumes uploaded</option>';
  } else {
    resumes.forEach((r) => {
      const opt = document.createElement('option');
      opt.value = r.id;
      opt.textContent = r.name ? `${r.name} (${r.filename})` : r.filename;
      if (r.id === activeResumeId) opt.selected = true;
      select.appendChild(opt);
    });
  }

  setStatus('Scanning form fields...', true);
}

function onFieldFilled({ selector, label, value, total, filled }) {
  $('fieldListSection').style.display = '';
  $('progressWrap').style.display = '';

  const pct = total > 0 ? Math.round((filled / total) * 100) : 0;
  $('progressFill').style.width = `${pct}%`;
  $('progressCount').textContent = `${filled}/${total} fields`;

  let item = document.querySelector(`[data-selector="${CSS.escape(selector)}"]`);
  if (!item) {
    item = document.createElement('div');
    item.className = 'field-item';
    item.dataset.selector = selector;
    item.innerHTML = `<span class="field-name">${escapeHtml(label || selector)}</span><span class="field-value filling">⟳</span>`;
    $('fieldList').appendChild(item);
  }
  const valueEl = item.querySelector('.field-value');
  // Status messages (✗ failed, ⚠ needs review, ⬇ downloaded, — skipped, etc.) already
  // carry their own glyph — only prepend a checkmark for plain successfully-filled values.
  const hasOwnStatusGlyph = /^[✗⚠⬇—]/.test(String(value || ''));
  valueEl.textContent = hasOwnStatusGlyph ? truncate(value, 40) : `✓ ${truncate(value, 20)}`;
  valueEl.title = String(value || '');
  valueEl.className = 'field-value filled';

  setStatus(`Filling fields... (${filled}/${total})`, true);
}

function onNeedsReview({ flagged }) {
  if (!flagged || flagged.length === 0) return;

  $('reviewSection').style.display = '';
  $('actions').style.display = '';
  $('reviewBannerTitle').textContent = `⚠ ${flagged.length} field${flagged.length > 1 ? 's' : ''} need your input`;

  const list = $('flaggedFieldList');
  list.innerHTML = '';
  flaggedEdits = {};

  flagged.forEach(({ selector, label, value, isTextarea }) => {
    flaggedEdits[selector] = value || '';

    const wrap = document.createElement('div');
    wrap.className = 'flagged-item';

    const lbl = document.createElement('div');
    lbl.className = 'flagged-label';
    lbl.textContent = label || selector;

    const input = isTextarea
      ? document.createElement('textarea')
      : document.createElement('input');
    input.className = 'flagged-input';
    if (!isTextarea) input.type = 'text';
    input.value = value || '';
    input.placeholder = 'Enter value...';
    input.addEventListener('input', () => { flaggedEdits[selector] = input.value; });

    wrap.appendChild(lbl);
    wrap.appendChild(input);
    list.appendChild(wrap);
  });

  setStatus('Review required', false);
}

function onStepDone() {
  setStatus('Step complete', false);
}

function onAllDone() {
  $('reviewSection').style.display = 'none';
  $('actions').style.display = 'none';
  $('doneNotice').style.display = '';
  setStatus('Done — submit when ready', false);
}

function onError(message) {
  $('errorNotice').style.display = '';
  $('errorText').textContent = message || 'An error occurred';
  setStatus('Paused', false);
}

// ─── User actions ─────────────────────────────────────────────────────────────

$('resumeSelect').addEventListener('change', (e) => {
  window.parent.postMessage({ type: 'RESUME_SELECTED', resumeId: Number(e.target.value) }, '*');
});

$('continueBtn').addEventListener('click', () => {
  $('reviewSection').style.display = 'none';
  $('actions').style.display = 'none';
  window.parent.postMessage({ type: 'CONTINUE', edits: flaggedEdits }, '*');
  setStatus('Continuing...', true);
  flaggedEdits = {};
});

$('closeBtn').addEventListener('click', () => {
  window.parent.postMessage({ type: 'CLOSE' }, '*');
});

$('genCoverLetterBtn').addEventListener('click', () => {
  $('genCoverLetterBtn').disabled = true;
  window.parent.postMessage({ type: 'GENERATE_COVER_LETTER' }, '*');
});

// ─── Settings ─────────────────────────────────────────────────────────────────

$('settingsBtn').addEventListener('click', () => {
  settingsOpen = !settingsOpen;
  $('settingsSection').style.display = settingsOpen ? '' : 'none';
  $('settingsStatus').textContent = '';
  if (settingsOpen) {
    window.parent.postMessage({ type: 'GET_API_KEY' }, '*');
  }
});

$('cancelSettingsBtn').addEventListener('click', () => {
  settingsOpen = false;
  $('settingsSection').style.display = 'none';
});

$('saveApiKeyBtn').addEventListener('click', () => {
  const key = $('apiKeyInput').value.trim();
  if (!key) { $('settingsStatus').textContent = 'Please enter an API key.'; return; }
  $('settingsStatus').textContent = 'Saving…';
  $('saveApiKeyBtn').disabled = true;
  window.parent.postMessage({ type: 'SAVE_API_KEY', apiKey: key }, '*');
});

function onNoApiKey() {
  settingsOpen = true;
  $('settingsSection').style.display = '';
  $('settingsStatus').textContent = 'Paste your API key from the Job Agent dashboard to get started.';
  setStatus('Connect your account to continue.', false);
}

function onApiKeyLoaded(apiKey) {
  if (apiKey) {
    $('apiKeyInput').value = apiKey;
    $('settingsStatus').textContent = 'Key saved. You can update it here.';
  } else {
    $('apiKeyInput').value = '';
    $('settingsStatus').textContent = '';
  }
}

function onApiKeySaved() {
  $('settingsStatus').textContent = 'Saved! Reconnecting…';
  $('saveApiKeyBtn').disabled = false;
  setTimeout(() => {
    settingsOpen = false;
    $('settingsSection').style.display = 'none';
  }, 1200);
}

// Request API key on startup to prefill settings if it opens
window.parent.postMessage({ type: 'GET_API_KEY' }, '*');

// ─── Helpers ─────────────────────────────────────────────────────────────────

$('rescanBtn').addEventListener('click', () => {
  $('rescanBtn').style.display = 'none';
  $('errorNotice').style.display = 'none';
  window.parent.postMessage({ type: 'RESCAN' }, '*');
});

function setStatus(text, showSpinner = true) {
  $('statusText').textContent = text;
  $('spinner').className = showSpinner ? 'spinner' : 'spinner hidden';
  // Show rescan button only when idle (no spinner)
  $('rescanBtn').style.display = showSpinner ? 'none' : '';
  // Idle again — re-enable the cover-letter button in case it triggered this status
  if (!showSpinner) $('genCoverLetterBtn').disabled = false;
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function truncate(str, maxLen) {
  const s = String(str || '');
  return s.length > maxLen ? s.slice(0, maxLen) + '…' : s;
}
