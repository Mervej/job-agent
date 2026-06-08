/**
 * Fills a single form field identified by `selector` with `value`.
 * Dispatches synthetic input/change events so React/Vue state updates.
 */
async function fillField(selector, value, elementType, inputType, isCombobox) {
  const el = document.querySelector(selector);
  if (!el) return false;

  try {
    // Always check the actual element — elementType/inputType args may be missing
    const tag = el.tagName.toLowerCase();
    const elInputType = el.type || inputType;

    if (elInputType === 'file') return await fillFileInput(el, value);
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

// ─── Field-type fillers ───────────────────────────────────────────────────────

function fillText(el, value) {
  // React/Vue track value via native input descriptor
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
    || Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;

  if (nativeInputValueSetter) {
    nativeInputValueSetter.call(el, value);
  } else {
    el.value = value;
  }

  dispatch(el, 'input');
  dispatch(el, 'change');
  return true;
}

function fillSelect(el, value) {
  const lower = value.toLowerCase();

  // Try exact value match first
  for (const opt of el.options) {
    if (opt.value.toLowerCase() === lower || opt.text.toLowerCase() === lower) {
      el.value = opt.value;
      dispatch(el, 'change');
      return true;
    }
  }

  // Try partial text match
  for (const opt of el.options) {
    if (opt.text.toLowerCase().includes(lower) || lower.includes(opt.text.toLowerCase())) {
      el.value = opt.value;
      dispatch(el, 'change');
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
  // Find the radio with matching label or value
  const nameMatch = selectorBase.match(/\[name="([^"]+)"\]/);
  if (!nameMatch) return false;

  const radios = document.querySelectorAll(`input[type="radio"][name="${nameMatch[1]}"]`);
  const lower = value.toLowerCase();

  for (const radio of radios) {
    const label = getRadioLabel(radio);
    if (
      radio.value.toLowerCase() === lower ||
      label.toLowerCase() === lower ||
      label.toLowerCase().includes(lower) ||
      lower.includes(label.toLowerCase())
    ) {
      radio.click();
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
function fillFileInput(el, value) {
  if (!value) return false;
  try {
    const separatorIdx = value.lastIndexOf(',');
    const base64 = value.slice(0, separatorIdx);
    const filename = value.slice(separatorIdx + 1) || 'resume.pdf';
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const file = new File([bytes], filename, { type: 'application/pdf' });
    const dt = new DataTransfer();
    dt.items.add(file);
    el.files = dt.files;

    // Dispatch both native and React-synthetic events to cover all frameworks
    dispatch(el, 'change');
    dispatch(el, 'input');

    // React uses its own internal fiber — set value via descriptor if available
    const nativeDescriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'files');
    if (nativeDescriptor && nativeDescriptor.set) {
      nativeDescriptor.set.call(el, dt.files);
      dispatch(el, 'change');
    }

    return true;
  } catch {
    return false;
  }
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
