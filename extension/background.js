const PROD_URL = 'https://job-agent-backend-jg3v.onrender.com';
const LOCAL_URL = 'http://localhost:3000';

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
    FETCH_RESUME_FILE:   () => handleFetchResumeFile(message.resumeId, sendResponse),
    FETCH_COVER_LETTER_PDF: () => handleFetchCoverLetterPdf(message.text, sendResponse),
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
  };

  if (handlers[message.type]) {
    handlers[message.type]();
    return true;
  }
});

// ─── Handlers ─────────────────────────────────────────────────────────────────

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

async function handleFetchResumeFile(resumeId, sendResponse) {
  try {
    const url = await backendReady;
    const { apiKey } = await chrome.storage.local.get('apiKey');
    const res = await fetch(`${url}/resumes/${resumeId}/file`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    });
    if (!res.ok) throw new Error(`Backend returned ${res.status}`);
    const buffer = await res.arrayBuffer();
    sendResponse({ ok: true, base64: arrayBufferToBase64(buffer), filename: `resume-${resumeId}.pdf` });
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

async function handleFetchCoverLetterPdf(text, sendResponse) {
  try {
    const url = await backendReady;
    const res = await fetch(`${url}/apply/cover-letter-pdf`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error(`Backend returned ${res.status}`);
    const buffer = await res.arrayBuffer();
    sendResponse({ ok: true, base64: arrayBufferToBase64(buffer), filename: 'cover-letter.pdf' });
  } catch (err) {
    sendResponse({ ok: false, error: err.message });
  }
}

async function handleMapFields({ fields, resumeId, jobUrl }, sendResponse) {
  try {
    const url = await backendReady;
    const res = await fetch(`${url}/apply/map-fields`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ fields, resumeId, jobUrl }),
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
