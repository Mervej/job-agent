const PROD_URL = 'https://job-agent-backend-jg3v.onrender.com';
const LOCAL_URL = 'http://localhost:3000';

// MAIN-world file filler (must run in page JS context so File objects pass instanceof checks)
try {
  importScripts('utils/page-world-file-fill.js');
} catch (e) {
  console.error('[Job Agent] Failed to load page-world-file-fill.js', e);
}

// Resolved once on startup — all handlers await this before firing
const backendReady = (async () => {
  try {
    const res = await fetch(`${LOCAL_URL}/health`, { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      console.log('[Job Agent] Using local backend');
      return LOCAL_URL;
    }
  } catch {}
  console.log('[Job Agent] Using deployed backend');
  return PROD_URL;
})();

// ─── Toolbar click: force-open panel on any page ─────────────────────────────

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) return;
  await chrome.tabs.sendMessage(tab.id, { type: 'FORCE_OPEN' }).catch(() => {
    // Content script not ready (e.g. page still loading) — inject and retry
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.postMessage({ type: 'FORCE_OPEN' }, '*'),
    });
  });
});

// ─── Auth ─────────────────────────────────────────────────────────────────────

async function authHeaders(extra = {}) {
  const { apiKey } = await chrome.storage.local.get('apiKey');
  return {
    'Content-Type': 'application/json',
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    ...extra,
  };
}

// ─── Message handler ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const handlers = {
    FETCH_RESUMES:       () => handleFetchResumes(sendResponse),
    MAP_FIELDS:          () => handleMapFields(message.payload, sendResponse),
    GENERATE_COVER_LETTER: () => handleGenerateCoverLetter(message.payload, sendResponse),
    FETCH_RESUME_FILE:   () => handleFetchResumeFile(message.resumeId, message.profileName, sendResponse),
    FETCH_COVER_LETTER_PDF: () => handleFetchCoverLetterPdf(
      message.text,
      message.companyName,
      message.profileName,
      sendResponse,
      message.filename
    ),
    FILL_FILE_INPUT:     () => handleFillFileInput(message, _sender, sendResponse),
    MAP_ENTRY_FIELDS:    () => handleMapEntryFields(message.payload, sendResponse),
    SAVE_API_KEY: () => {
      chrome.storage.local.set({ apiKey: message.apiKey }, () => sendResponse({ ok: true }));
    },
    GET_API_KEY: () => {
      chrome.storage.local.get('apiKey', (d) => sendResponse({ apiKey: d.apiKey ?? null }));
      return true;
    },
    SAVE_RESUME_ID: () => {
      chrome.storage.local.set({ activeResumeId: message.resumeId });
      sendResponse({ ok: true });
      return false;
    },
    GET_RESUME_ID: () => {
      chrome.storage.local.get('activeResumeId', (d) => sendResponse({ resumeId: d.activeResumeId ?? null }));
      return true;
    },
    SAVE_JD: () => {
      chrome.storage.local.set({ pendingJD: message.jd }, () => sendResponse({ ok: true }));
    },
    GET_JD: () => {
      chrome.storage.local.get('pendingJD', (d) => sendResponse({ jd: d.pendingJD ?? null }));
      return true;
    },
  };

  if (handlers[message.type]) {
    handlers[message.type]();
    return true;
  }
});

// ─── Handlers ─────────────────────────────────────────────────────────────────

/**
 * Fill a file input in the page MAIN world so File objects share Rippling's JS realm.
 * Cross-world File objects from content scripts fail instanceof File / upload checks.
 */
async function handleFillFileInput(message, sender, sendResponse) {
  try {
    const tabId = sender.tab?.id;
    if (!tabId) throw new Error('No tab id for file fill');
    if (typeof pageWorldFillFileInput !== 'function') {
      throw new Error('pageWorldFillFileInput not loaded');
    }
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: pageWorldFillFileInput,
      args: [
        message.selector || '',
        message.base64 || '',
        message.filename || 'resume.pdf',
        message.labelHint || '',
      ],
    });
    sendResponse(result || { ok: false, error: 'empty result from MAIN world' });
  } catch (err) {
    console.error('[Job Agent] FILL_FILE_INPUT failed', err);
    sendResponse({ ok: false, error: err.message || String(err) });
  }
}

async function handleFetchResumes(sendResponse) {
  try {
    const url = await backendReady;
    const res = await fetch(`${url}/resumes`, { headers: await authHeaders() });
    if (res.status === 401) {
      sendResponse({ ok: false, error: 'No API key set. Open extension settings and paste your key.' });
      return;
    }
    if (!res.ok) throw new Error(`Backend returned ${res.status}`);
    const data = await res.json();
    sendResponse({ ok: true, resumes: data.resumes ?? data });
  } catch (err) {
    sendResponse({ ok: false, error: err.message });
  }
}

async function handleFetchResumeFile(resumeId, profileName, sendResponse) {
  try {
    const url = await backendReady;
    const { apiKey } = await chrome.storage.local.get('apiKey');
    const res = await fetch(`${url}/resumes/${resumeId}/file`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Backend returned ${res.status}`);
    }
    const buffer = await res.arrayBuffer();
    const safeName = profileName
      ? profileName.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '')
      : `resume-${resumeId}`;
    sendResponse({ ok: true, base64: arrayBufferToBase64(buffer), filename: `${safeName}.pdf` });
  } catch (err) {
    sendResponse({ ok: false, error: err.message });
  }
}

async function handleMapEntryFields({ fields, entryType, entryData, resumeText, isCurrentJob }, sendResponse) {
  try {
    const url = await backendReady;
    const res = await fetch(`${url}/apply/map-entry-fields`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ fields, entryType, entryData, resumeText, isCurrentJob }),
    });
    if (!res.ok) throw new Error(`Backend returned ${res.status}`);
    const data = await res.json();
    sendResponse({ ok: true, ...data });
  } catch (err) {
    sendResponse({ ok: false, error: err.message });
  }
}

async function handleFetchCoverLetterPdf(text, companyName, profileName, sendResponse, explicitFilename) {
  try {
    const url = await backendReady;
    const res = await fetch(`${url}/apply/cover-letter-pdf`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error(`Backend returned ${res.status}`);
    const buffer = await res.arrayBuffer();
    const safePart = (s) =>
      (s || '')
        .trim()
        .replace(/\s+/g, '_')
        .replace(/[^a-zA-Z0-9_-]/g, '');
    const filename =
      (explicitFilename && String(explicitFilename).trim()) ||
      `${safePart(profileName) || 'candidate'}-${safePart(companyName) || 'company'}.pdf`;
    sendResponse({ ok: true, base64: arrayBufferToBase64(buffer), filename });
  } catch (err) {
    sendResponse({ ok: false, error: err.message });
  }
}

async function handleMapFields({ fields, resumeId, jobUrl, jobText }, sendResponse) {
  try {
    const url = await backendReady;
    const res = await fetch(`${url}/apply/map-fields`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ fields, resumeId, jobUrl, ...(jobText ? { jobText } : {}) }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Backend returned ${res.status}`);
    }
    const data = await res.json();
    sendResponse({ ok: true, ...data });
  } catch (err) {
    sendResponse({ ok: false, error: err.message });
  }
}

async function handleGenerateCoverLetter({ resumeId, jobUrl, jobText }, sendResponse) {
  try {
    const url = await backendReady;
    const res = await fetch(`${url}/apply/generate-cover-letter`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ resumeId, jobUrl, ...(jobText ? { jobText } : {}) }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Backend returned ${res.status}`);
    }
    const data = await res.json();
    sendResponse({ ok: true, ...data });
  } catch (err) {
    sendResponse({ ok: false, error: err.message });
  }
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}
