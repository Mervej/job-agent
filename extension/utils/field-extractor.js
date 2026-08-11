/**
 * Extracts all visible, fillable form fields from the current document.
 * Returns an array of ExtensionField objects that the backend can map to resume values.
 */
function extractFields(doc = document) {
  const FIELD_SELECTOR = [
    'input[type="text"]', 'input[type="email"]', 'input[type="tel"]',
    'input[type="url"]', 'input[type="number"]', 'input[type="date"]',
    'input[type="search"]', 'input:not([type])', 'input[type=""]',
    'textarea',
    'div[contenteditable="true"]',
    'select',
    'input[type="checkbox"]', 'input[type="radio"]',
    'input[type="file"]', 'input[type="File"]',
  ].join(', ');

  const seen = new Set();
  const seenSelectors = new Set();
  const fields = [];

  doc.querySelectorAll(FIELD_SELECTOR).forEach((el, index) => {
    if (seen.has(el)) return;
    seen.add(el);

    const tag = el.tagName.toLowerCase();
    const inputType = tag === 'input' ? (el.type || 'text') : undefined;

    // Always include file inputs — they are typically hidden by ATS styling
    if (inputType !== 'file' && (isDisabled(el) || isHidden(el, tag === 'select'))) return;

    if (tag === 'input' && ['hidden', 'submit', 'button', 'reset'].includes(inputType)) return;

    const isContentEditable = tag === 'div' && el.getAttribute('contenteditable') === 'true';
    const label = getLabel(el);
    const questionText = getQuestionText(el);

    if (isContentEditable && !label && !questionText) return;

    const isCombobox =
      tag === 'input' &&
      el.getAttribute('role') === 'combobox' &&
      (el.getAttribute('aria-haspopup') === 'listbox' || el.getAttribute('aria-haspopup') === 'true');

    const field = {
      selector: makeSelector(el, index),
      elementType: isContentEditable ? 'div' : tag,
      inputType,
      isCombobox: isCombobox || undefined,
      fieldName: el.name || el.id || `field_${index}`,
      placeholder: (el.placeholder || el.getAttribute('data-placeholder') || undefined),
      label: label || undefined,
      questionText: questionText || undefined,
      autocomplete: (el.autocomplete || undefined),
      sectionHeading: getSectionHeading(el) || undefined,
      required: !!(el.required || el.getAttribute('aria-required') === 'true'),
      currentValue: getCurrentValue(el, tag, isContentEditable),
      options: getOptions(el, tag, inputType),
    };

    // Radio groups: deduplicate by selector so the backend only sees one field per group.
    // All radios in a group share the same name-based selector; only keep the first.
    if (inputType === 'radio') {
      if (seenSelectors.has(field.selector)) return;
      seenSelectors.add(field.selector);
    }

    fields.push(field);
  });

  return fields;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isDisabled(el) {
  return el.disabled || el.getAttribute('aria-disabled') === 'true';
}

function isHidden(el, isSelect) {
  if (isSelect) return false; // allow hidden selects (custom dropdowns)
  if (el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true') return true;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return true;
  const rect = el.getBoundingClientRect();
  return rect.width === 0 || rect.height === 0;
}

function makeSelector(el, index) {
  const tag = el.tagName.toLowerCase();
  const id = el.id;
  const name = el.name;
  const type = el.type;
  const placeholder = el.placeholder;
  const aria = el.getAttribute('aria-label');
  const testId = el.getAttribute('data-testid');

  // Radio buttons: always use name-based selector so the filler can scan the whole group.
  // id-based selectors only identify one option and break fillRadio's group lookup.
  if (type === 'radio' && name) return `${tag}[type="radio"][name="${name}"]`;

  if (id) return `${tag}[id="${id}"]`;
  // Rippling FileDrop and similar widgets expose data-testid but no name/id on the <input>
  if (testId) {
    const safe = (typeof CSS !== 'undefined' && CSS.escape)
      ? CSS.escape(testId)
      : testId.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `${tag}[data-testid="${safe}"]`;
  }
  // Only use [type] for <input> — textarea/select have a .type JS property but no type HTML attribute,
  // so textarea[type="textarea"] would match nothing in the DOM.
  // Also skip [type] when name contains brackets — CSS parsers miscount brackets in compound
  // attribute selectors, causing querySelector to return null.
  if (name && tag === 'input' && type && !name.includes('[') && !name.includes(']')) return `${tag}[type="${type}"][name="${name}"]`;
  if (name) return `${tag}[name="${name}"]`;
  if (aria) return `${tag}[aria-label="${aria}"]`;
  if (placeholder) return `${tag}[placeholder="${placeholder}"]`;

  // File inputs often have no stable attributes (Rippling, etc.). Stamp a unique marker so
  // fillField can reliably re-find the same element later.
  if (type === 'file') {
    const stamp = el.getAttribute('data-job-agent') || `file-${index}-${Date.now()}`;
    el.setAttribute('data-job-agent', stamp);
    return `input[type="file"][data-job-agent="${stamp}"]`;
  }

  return `${tag}:nth-of-type(${index + 1})`;
}

function getLabel(el) {
  // File uploads first: prefer "Resume" / "Cover letter" over dropzone helper text
  if ((el.type || '').toLowerCase() === 'file') {
    const fileTitle = getFileFieldTitle(el);
    if (fileTitle) return fileTitle;
  }

  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel?.trim() && !isDropzoneHelperText(ariaLabel)) return ariaLabel.trim();

  const ariaLabelledBy = el.getAttribute('aria-labelledby');
  if (ariaLabelledBy) {
    const text = ariaLabelledBy.split(/\s+/)
      .map(id => document.getElementById(id)?.textContent?.trim())
      .filter(Boolean).join(' ');
    if (text && !isDropzoneHelperText(text)) return text;
  }

  if (el.id) {
    const forLabel = document.querySelector(`label[for="${el.id}"]`);
    const t = forLabel?.textContent?.trim() || '';
    if (t && !isDropzoneHelperText(t)) return t;
  }

  const parentLabel = el.closest('label');
  if (parentLabel) {
    const t = parentLabel.textContent?.trim() || '';
    if (t && !isDropzoneHelperText(t) && t.length <= 80) return t;
  }

  // Previous sibling label — checked before the broad .closest('div') to avoid picking up
  // labels from other sections. Covers Lever's <div class="application-label">, Ashby,
  // and any ATS that places a label-like element before the field or its wrapper.
  for (const node of [el, el.parentElement]) {
    if (!node) continue;
    const prev = node.previousElementSibling;
    if (!prev) continue;
    const tag = prev.tagName?.toLowerCase();
    // Skip if prev IS an interactive element, or CONTAINS interactive elements (it's a question block)
    if (['input', 'select', 'textarea', 'button'].includes(tag)) continue;
    if (prev.querySelector('input, textarea, select')) continue;
    const t = (prev.textContent || '').trim();
    if (t && t.length <= 200 && !isDropzoneHelperText(t)) return t;
  }

  const group = el.closest('.form-group, .field, .form-row, .row');
  if (group) {
    const maybeLabel = group.querySelector('label');
    const t = maybeLabel?.textContent?.trim() || '';
    if (t && !isDropzoneHelperText(t)) return t;
  }

  const ph = el.placeholder?.trim() || '';
  return isDropzoneHelperText(ph) ? '' : ph;
}

function isDropzoneHelperText(text) {
  const t = (text || '').trim().toLowerCase();
  if (!t) return true;
  return (
    /^drop\b/.test(t) ||
    /\bselect\b.*\.(doc|pdf|docx)/i.test(t) ||
    /\(\.doc/.test(t) ||
    /drag\s*(and|&)\s*drop/.test(t) ||
    /browse\s*(files?|to upload)/.test(t) ||
    /click\s+to\s+upload/.test(t) ||
    /not\s*uploaded/.test(t)
  );
}

/** Find "Resume" / "Cover letter" / "Résumé" title near a file input. */
function getFileFieldTitle(el) {
  const start =
    el.closest('[class*="file"], [class*="File"], [class*="upload"], [class*="Upload"], [class*="drop"], [role="group"], fieldset')
    || el.parentElement?.parentElement
    || el.parentElement;
  if (!start) return '';

  let node = start;
  for (let depth = 0; node && depth < 6; depth++, node = node.parentElement) {
    const lines = (node.innerText || node.textContent || '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    const title = lines.find(
      (t) =>
        /^(resume|cv|curriculum\s*vitae|cover\s*letter|motivation\s*letter|r[eé]sum[eé])\b/i.test(t) &&
        t.length < 40 &&
        !isDropzoneHelperText(t)
    );
    if (title) return title;
  }
  return '';
}

function getQuestionText(el) {
  // Only treat text as a "question" if it's genuinely question-like (not a field label).
  // A short noun phrase like "First Name" or "Start Date" is a label, not a question.
  const isQuestionLike = (text) => {
    if (!text || text.length < 15 || text.length > 300) return false;
    if (/^[\d\s\-+*.]+$/.test(text)) return false;
    // Must contain a question word or be a multi-word sentence (i.e. not just a field label)
    return text.includes('?') || /\b(what|why|how|when|where|who|describe|explain|tell us|list|provide|do you|have you|are you|will you|would you|please)\b/i.test(text);
  };

  let ancestor = el.parentElement;
  let depth = 0;
  while (ancestor && depth < 4) {
    let prev = ancestor.previousElementSibling;
    let hops = 0;
    while (prev && hops < 5) {
      const tag = prev.tagName?.toLowerCase();
      if (!['input', 'select', 'textarea', 'button', 'form'].includes(tag)) {
        // Skip container elements that enclose interactive children — they're
        // question blocks or sections, not labels. Their textContent would bleed
        // the sibling question's text into unrelated fields.
        if (!prev.querySelector('input, textarea, select, button')) {
          const text = (prev.textContent || '').trim();
          if (isQuestionLike(text)) return text;
        }
      }
      prev = prev.previousElementSibling;
      hops++;
    }
    ancestor = ancestor.parentElement;
    depth++;
  }
  return '';
}

function getSectionHeading(el) {
  let ancestor = el.parentElement;
  while (ancestor) {
    const role = ancestor.getAttribute('role');
    const tag = ancestor.tagName.toLowerCase();
    if (role === 'region' || tag === 'section' || tag === 'fieldset') {
      const heading = ancestor.querySelector('h1,h2,h3,h4,h5,h6,legend,[role="heading"]');
      if (heading) return (heading.textContent || '').trim().toLowerCase();
    }
    ancestor = ancestor.parentElement;
  }
  return '';
}

function getCurrentValue(el, tag, isContentEditable) {
  if (isContentEditable) return el.innerText || undefined;
  if (tag === 'select') return el.value || undefined;
  return el.value || undefined;
}

function getOptions(el, tag, inputType) {
  if (tag === 'select') {
    return Array.from(el.options).map(opt => ({ value: opt.value, text: (opt.textContent || '').trim() }));
  }
  if (inputType === 'radio' && el.name) {
    let radios;
    try {
      radios = document.querySelectorAll(`input[type="radio"][name="${el.name}"]`);
    } catch (_) {
      radios = [...document.querySelectorAll('input[type="radio"]')].filter(r => r.name === el.name);
    }
    return Array.from(radios).map(r => ({ value: r.value, text: getLabel(r) || r.value }));
  }
  return undefined;
}
