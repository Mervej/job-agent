/**
 * Fills a single form field identified by `selector` with `value`.
 * Dispatches synthetic input/change events so React/Vue state updates.
 */
async function fillField(selector, value, elementType, inputType, isCombobox) {
  let el = document.querySelector(selector);

  // Fallback: CSS parsers fail on compound selectors when name contains brackets
  // (e.g. input[type="text"][name="foo[bar][][baz]"] returns null).
  // Extract the name and search directly.
  if (!el) {
    const nameMatch = selector.match(/\[name="([^"]+)"\]/);
    if (nameMatch) {
      const name = nameMatch[1];
      el = document.querySelector(`[name="${name}"]`)
        || [...document.querySelectorAll('input,textarea,select')].find(e => e.name === name)
        || null;
    }
  }

  // File inputs on Rippling/FileDrop often lack name/id — resolve by label/testid/stamp
  if (!el && (inputType === 'file' || /type="file"|data-job-agent|data-testid/.test(selector))) {
    el = findFileInput(selector, value);
  }

  if (!el) return false;

  try {
    // Always check the actual element — elementType/inputType args may be missing
    const tag = el.tagName.toLowerCase();
    const elInputType = el.type || inputType;

    if (elInputType === 'file' || (el.type || '').toLowerCase() === 'file') {
      return await fillFileInput(el, value);
    }
    if (isCombobox || el.getAttribute('role') === 'combobox') return await fillCombobox(el, value);
    if (elInputType === 'checkbox') return fillCheckbox(el, value);
    if (elInputType === 'radio') return fillRadio(selector, value);
    if (tag === 'select') return fillSelect(el, value);
    if (el.getAttribute('contenteditable') === 'true') return fillContentEditable(el, value);

    // Default: text / email / tel / number / textarea
    return fillText(el, value);
  } catch {
    return false;
  }
}

/**
 * Resolve a file input when the stored selector is stale or the ATS omitted name/id.
 */
function findFileInput(selector, valueHint) {
  const testIdMatch = selector.match(/data-testid="([^"]+)"/);
  if (testIdMatch) {
    const byTestId = document.querySelector(`[data-testid="${testIdMatch[1]}"]`);
    if (byTestId && (byTestId.type || '').toLowerCase() === 'file') return byTestId;
  }
  const stampMatch = selector.match(/data-job-agent="([^"]+)"/);
  if (stampMatch) {
    const byStamp = document.querySelector(`[data-job-agent="${stampMatch[1]}"]`);
    if (byStamp) return byStamp;
  }

  const files = [...document.querySelectorAll('input[type="file"], input[type="File"]')];
  if (files.length === 1) return files[0];

  const hint = `${valueHint || ''} ${selector}`.toLowerCase();
  const wantCover = /cover|motivation/.test(hint);
  for (const input of files) {
    const card = input.closest('[class*="file"], [class*="File"], [class*="upload"], [class*="Upload"], [class*="drop"], [role="group"]')
      || input.parentElement;
    const text = `${card?.innerText || ''} ${input.getAttribute('data-testid') || ''}`.toLowerCase();
    const isCover = /cover|motivation/.test(text);
    if (wantCover ? isCover : !isCover && /resume|cv|r[eé]sum|curriculum/.test(text)) return input;
  }
  return files[0] || null;
}

// ─── Field-type fillers ───────────────────────────────────────────────────────

function fillText(el, value) {
  // Use the correct prototype — calling HTMLInputElement's setter on a <textarea> throws TypeError
  const proto = el instanceof HTMLTextAreaElement
    ? window.HTMLTextAreaElement.prototype
    : window.HTMLInputElement.prototype;
  const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;

  if (nativeSetter) {
    nativeSetter.call(el, value);
  } else {
    el.value = value;
  }

  dispatch(el, 'input');
  dispatch(el, 'change');
  return true;
}

function fillSelect(el, value) {
  const lower = value.toLowerCase();
  const nativeSelectSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set;

  const setVal = (optValue) => {
    if (nativeSelectSetter) nativeSelectSetter.call(el, optValue);
    else el.value = optValue;
    dispatch(el, 'input');
    dispatch(el, 'change');
  };

  // Try exact value match first
  for (const opt of el.options) {
    if (opt.value.toLowerCase() === lower || opt.text.toLowerCase() === lower) {
      setVal(opt.value);
      return true;
    }
  }

  // Try partial text match
  for (const opt of el.options) {
    if (opt.text.toLowerCase().includes(lower) || lower.includes(opt.text.toLowerCase())) {
      setVal(opt.value);
      return true;
    }
  }

  return false;
}

function fillCheckbox(el, value) {
  const shouldCheck = /^(yes|true|1|on)$/i.test(String(value).trim());
  if (el.checked !== shouldCheck) {
    el.click();
    dispatch(el, 'change');
  }
  return true;
}

function fillRadio(selectorBase, value) {
  const nameMatch = selectorBase.match(/\[name="([^"]+)"\]/);

  let groupName;
  if (nameMatch) {
    groupName = nameMatch[1];
  } else {
    const anchor = document.querySelector(selectorBase);
    if (!anchor || !anchor.name) return false;
    groupName = anchor.name;
  }

  // Try CSS selector first; fall back to scanning all radios by .name property
  // (the CSS selector can throw if the name contains special characters)
  let radios;
  try {
    radios = document.querySelectorAll(`input[type="radio"][name="${groupName}"]`);
  } catch (_) {
    radios = [...document.querySelectorAll('input[type="radio"]')].filter(r => r.name === groupName);
  }

  if (!radios.length) return false;

  const lower = value.toLowerCase();

  for (const radio of radios) {
    const label = getRadioLabel(radio);
    if (
      radio.value.toLowerCase() === lower ||
      label.toLowerCase() === lower ||
      label.toLowerCase().includes(lower) ||
      lower.includes(label.toLowerCase())
    ) {
      // Use native checked setter to ensure React's internal state syncs
      const nativeCheckedSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'checked')?.set;
      if (nativeCheckedSetter) nativeCheckedSetter.call(radio, true);
      else radio.checked = true;
      radio.click();
      dispatch(radio, 'input');
      dispatch(radio, 'change');
      return true;
    }
  }
  return false;
}

function fillContentEditable(el, value) {
  el.focus();
  // execCommand works with Quill, Draft.js, and plain contenteditable
  document.execCommand('selectAll', false, null);
  document.execCommand('insertText', false, value);
  dispatch(el, 'input');
  dispatch(el, 'blur');
  return true;
}

// value is expected to be "{base64},{filename}" — set by content-script after fetching via background
async function fillFileInput(el, value) {
  if (!value) return false;
  try {
    const separatorIdx = value.lastIndexOf(',');
    const base64 = value.slice(0, separatorIdx);
    const filename = value.slice(separatorIdx + 1) || 'resume.pdf';

    // Stamp the element so the MAIN-world script can find the exact same DOM node
    let stamp = el.getAttribute('data-job-agent');
    if (!stamp) {
      stamp = `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      el.setAttribute('data-job-agent', stamp);
    }
    const selector = `input[data-job-agent="${stamp}"]`;
    const labelHint = (
      el.closest('[class*="file"], [class*="File"], [class*="upload"], [class*="Upload"], [role="group"]')
      || el.parentElement
      || el
    ).innerText?.slice(0, 240) || '';

    // CRITICAL: create File + fire React handlers in the page MAIN world.
    // Content-script File objects live in an isolated world; Rippling's upload
    // pipeline does instanceof File checks and rejects cross-world Files.
    const resp = await new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(
          { type: 'FILL_FILE_INPUT', selector, base64, filename, labelHint },
          (r) => resolve(r || { ok: false, error: chrome.runtime.lastError?.message || 'no response' })
        );
      } catch (e) {
        resolve({ ok: false, error: e.message });
      }
    });

    if (resp && resp.ok) return true;

    // Fallback: isolated-world attempt (works on simpler ATS forms)
    console.warn('[Job Agent] MAIN-world file fill failed, trying isolated world:', resp?.error || resp?.detail);
    return await fillFileInputIsolated(el, base64, filename);
  } catch (e) {
    console.warn('[Job Agent] fillFileInput error', e);
    return false;
  }
}

async function fillFileInputIsolated(el, base64, filename) {
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const file = new File([bytes], filename, { type: 'application/pdf' });
    const dt = new DataTransfer();
    dt.items.add(file);

    const nativeDescriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'files');
    if (nativeDescriptor && nativeDescriptor.set) {
      nativeDescriptor.set.call(el, dt.files);
    } else {
      try {
        el.files = dt.files;
      } catch {
        return false;
      }
    }

    dispatch(el, 'input');
    dispatch(el, 'change');
    invokeReactFileOnChange(el);
    dispatchFileDrop(el, dt);
    return await waitForFileUploadAcceptance(el, filename, 8000);
  } catch {
    return false;
  }
}

/**
 * Call React's onChange prop directly — required for Rippling FileDrop / one-ui File inputs
 * that upload to S3 only from their React handler, not from a bare DOM change event.
 */
function invokeReactFileOnChange(el) {
  const reactKey = Object.keys(el).find(
    (k) => k.startsWith('__reactProps$') || k.startsWith('__reactEventHandlers$')
  );
  if (!reactKey) return false;
  const props = el[reactKey];
  const handler = props?.onChange || props?.onInput;
  if (typeof handler !== 'function') return false;

  const fakeEvent = {
    target: el,
    currentTarget: el,
    type: 'change',
    bubbles: true,
    cancelable: true,
    defaultPrevented: false,
    isTrusted: false,
    nativeEvent: { target: el, type: 'change' },
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() {},
    persist() {},
    isDefaultPrevented() { return this.defaultPrevented; },
    isPropagationStopped() { return false; },
  };
  try {
    handler(fakeEvent);
    return true;
  } catch {
    return false;
  }
}

function dispatchFileDrop(el, dt) {
  const zone =
    el.closest('[class*="drop"], [class*="Drop"], [class*="upload"], [class*="Upload"], [class*="file"], [class*="File"]')
    || el.parentElement;
  if (!zone) return;
  try {
    for (const type of ['dragenter', 'dragover', 'drop']) {
      let event;
      try {
        event = new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt });
      } catch {
        event = new Event(type, { bubbles: true, cancelable: true });
        try {
          Object.defineProperty(event, 'dataTransfer', { get: () => dt });
        } catch { /* ignore */ }
      }
      zone.dispatchEvent(event);
    }
  } catch { /* DragEvent unsupported or blocked */ }
}

/**
 * True when the ATS upload widget (or native input) has accepted the file.
 * Used by Rippling FileDrop which stores S3 URLs in React state after upload.
 */
function fileUploadAccepted(el, filename) {
  if (!filename) return false;
  const baseName = filename.replace(/\.[^.]+$/, '');

  // Native file still attached
  if (el.files && el.files.length > 0) {
    const attached = el.files[0]?.name || '';
    if (attached === filename || (baseName && attached.includes(baseName))) return true;
  }

  const container =
    el.closest('[class*="file"], [class*="File"], [class*="upload"], [class*="Upload"], [class*="drop"], [data-testid*="file"]')
    || el.closest('fieldset, label, [role="group"]')
    || el.parentElement;

  const containerText = `${container?.innerText || ''} ${container?.textContent || ''}`;
  if (/not\s*uploaded/i.test(containerText) && !containerText.includes(filename) && !(baseName && containerText.includes(baseName))) {
    return false;
  }

  if (containerText.includes(filename)) return true;
  if (baseName.length > 3 && containerText.includes(baseName)) return true;

  const chip = container?.querySelector?.(
    '[class*="filename"], [class*="file-name"], [class*="fileName"], [class*="chip"], [class*="Chip"], [class*="uploaded"]'
  );
  const chipText = chip?.textContent || '';
  if (chipText.includes(filename) || (baseName.length > 3 && chipText.includes(baseName))) return true;

  // Broader scan of the form/main for the filename after async upload
  const scope = el.closest('form, main, [role="main"], [class*="application"]') || document.body;
  const scopeText = scope?.innerText || scope?.textContent || '';
  if (scopeText.includes(filename)) return true;
  if (baseName.length > 5 && scopeText.includes(baseName) && !/not\s*uploaded/i.test(scopeText)) return true;

  return false;
}

function hasNearbyUploadWidget(el) {
  const root =
    el.closest('[class*="file"], [class*="File"], [class*="upload"], [class*="Upload"], [class*="drop"]')
    || el.parentElement;
  if (!root) return false;
  const text = (root.textContent || '').toLowerCase();
  return /upload|drop|browse|resume|cover|attach/.test(text)
    || !!root.querySelector('[role="progressbar"], [class*="progress"], [class*="Progress"]');
}

async function waitForFileUploadAcceptance(el, filename, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  const uploadWidget = hasNearbyUploadWidget(el);

  // Immediate success: native files set and no async upload widget
  if (!uploadWidget && el.files && el.files.length > 0) return true;
  if (fileUploadAccepted(el, filename)) return true;

  while (Date.now() < deadline) {
    await sleep(250);
    if (fileUploadAccepted(el, filename)) return true;
  }

  // Final check — native files still count as success for simple inputs
  if (el.files && el.files.length > 0) return true;
  return fileUploadAccepted(el, filename);
}

async function fillCombobox(el, value) {
  // Scope all queries to the closest container so we never grab a listbox/option
  // from a different combobox elsewhere on the page (e.g. the phone dial-code list).
  const shell = el.closest('[class*="select-shell"], [class*="select__container"], [class*="combo-box"], [class*="dropdown"]')
    || el.parentElement?.parentElement?.parentElement
    || document.body;

  const listboxId = el.getAttribute('aria-owns') || el.getAttribute('aria-controls');

  const getListbox = () => listboxId
    ? document.getElementById(listboxId)
    : shell.querySelector('[role="listbox"]');

  const lower = value.toLowerCase();

  const matchInListbox = (lb) => {
    const opts = lb.querySelectorAll('[role="option"]');
    for (const opt of opts) {
      const text = (opt.textContent || '').trim().toLowerCase();
      if (text === lower || text.includes(lower) || lower.includes(text)) {
        opt.click();
        return true;
      }
    }
    return false;
  };

  // Fast path: try a direct click + keyboard open (works for aria-controlled listboxes
  // and some ATSes; ArrowDown opens React Select when the input is focused).
  el.focus();
  el.click();
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
  await sleep(300);
  const quickListbox = getListbox();
  if (quickListbox && quickListbox.querySelector('[role="option"]') && matchInListbox(quickListbox)) {
    return true;
  }

  // Primary path: type the value to trigger React Select's filter/search.
  // This opens the menu even when a programmatic click doesn't (React Select uses
  // onMouseDown on the control div, not on the input, so el.click() is insufficient).
  fillText(el, value);

  // Poll for the listbox to appear with options — handles both instant in-memory
  // filtering and async API-fetched option lists (up to 8 × 300 ms = 2.4 s).
  let listbox = null;
  for (let i = 0; i < 8; i++) {
    await sleep(300);
    const candidate = getListbox();
    if (candidate && candidate.querySelector('[role="option"]')) {
      listbox = candidate;
      break;
    }
  }

  if (listbox && matchInListbox(listbox)) return true;

  // Last resort: click the first visible option scoped to this shell
  const firstVisible = shell.querySelector('[role="option"]');
  if (firstVisible) { firstVisible.click(); return true; }

  return false;
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function dispatch(el, eventName) {
  el.dispatchEvent(new Event(eventName, { bubbles: true, cancelable: true }));
}

function getRadioLabel(radio) {
  const ariaLabel = radio.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel;
  if (radio.id) {
    const label = document.querySelector(`label[for="${radio.id}"]`);
    if (label) return label.textContent?.trim() || '';
  }
  const parentLabel = radio.closest('label');
  return parentLabel ? (parentLabel.textContent || '').trim() : radio.value;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
