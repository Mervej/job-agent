// Deployed backend. For local development, swap to 'http://localhost:3000'.
const BACKEND_URL = 'https://job-agent-backend-jg3v.onrender.com';

// ─── Message handler ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'FETCH_RESUMES') {
    handleFetchResumes(sendResponse);
    return true; // keep channel open for async response
  }

  if (message.type === 'MAP_FIELDS') {
    handleMapFields(message.payload, sendResponse);
    return true;
  }

  if (message.type === 'FETCH_RESUME_FILE') {
    handleFetchResumeFile(message.resumeId, sendResponse);
    return true;
  }

  if (message.type === 'FETCH_COVER_LETTER_PDF') {
    handleFetchCoverLetterPdf(message.text, sendResponse);
    return true;
  }

  if (message.type === 'MAP_ENTRY_FIELDS') {
    handleMapEntryFields(message.payload, sendResponse);
    return true;
  }

  if (message.type === 'SAVE_RESUME_ID') {
    chrome.storage.local.set({ activeResumeId: message.resumeId });
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === 'GET_RESUME_ID') {
    chrome.storage.local.get('activeResumeId', (data) => {
      sendResponse({ resumeId: data.activeResumeId ?? null });
    });
    return true;
  }
});

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function handleFetchResumes(sendResponse) {
  try {
    const res = await fetch(`${BACKEND_URL}/resumes`);
    if (!res.ok) throw new Error(`Backend returned ${res.status}`);
    const resumes = await res.json();
    sendResponse({ ok: true, resumes });
  } catch (err) {
    sendResponse({ ok: false, error: err.message });
  }
}

async function handleFetchResumeFile(resumeId, sendResponse) {
  try {
    const res = await fetch(`${BACKEND_URL}/resumes/${resumeId}/file`);
    if (!res.ok) throw new Error(`Backend returned ${res.status}`);
    const buffer = await res.arrayBuffer();
    const base64 = arrayBufferToBase64(buffer);
    sendResponse({ ok: true, base64, filename: `resume-${resumeId}.pdf` });
  } catch (err) {
    sendResponse({ ok: false, error: err.message });
  }
}

async function handleMapEntryFields({ fields, entryType, entryData, resumeText }, sendResponse) {
  try {
    const res = await fetch(`${BACKEND_URL}/apply/map-entry-fields`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields, entryType, entryData, resumeText }),
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
    const res = await fetch(`${BACKEND_URL}/apply/cover-letter-pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error(`Backend returned ${res.status}`);
    const buffer = await res.arrayBuffer();
    const base64 = arrayBufferToBase64(buffer);
    sendResponse({ ok: true, base64, filename: 'cover-letter.pdf' });
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

async function handleMapFields({ fields, resumeId, jobUrl }, sendResponse) {
  try {
    const res = await fetch(`${BACKEND_URL}/apply/map-fields`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
