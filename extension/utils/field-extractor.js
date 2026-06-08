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
    'input[type="file"]',
  ].join(', ');

  const seen = new Set();
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

  if (id) return `${tag}[id="${id}"]`;
  if (name && type) return `${tag}[type="${type}"][name="${name}"]`;
  if (name) return `${tag}[name="${name}"]`;
  if (aria) return `${tag}[aria-label="${aria}"]`;
  if (placeholder) return `${tag}[placeholder="${placeholder}"]`;
  return `${tag}:nth-of-type(${index + 1})`;
}

function getLabel(el) {
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel?.trim()) return ariaLabel.trim();

  const ariaLabelledBy = el.getAttribute('aria-labelledby');
  if (ariaLabelledBy) {
    const text = ariaLabelledBy.split(/\s+/)
      .map(id => document.getElementById(id)?.textContent?.trim())
      .filter(Boolean).join(' ');
    if (text) return text;
  }

  if (el.id) {
    const forLabel = document.querySelector(`label[for="${el.id}"]`);
    if (forLabel) return forLabel.textContent?.trim() || '';
  }

  const parentLabel = el.closest('label');
  if (parentLabel) return parentLabel.textContent?.trim() || '';

  const group = el.closest('.form-group, .field, .form-row, .row, div');
  if (group) {
    const maybeLabel = group.querySelector('label');
    if (maybeLabel) return maybeLabel.textContent?.trim() || '';
  }

  return el.placeholder?.trim() || '';
}

function getQuestionText(el) {
  const isQuestionLike = (text) => text && text.length > 3 && text.length < 300 && !/^[\d\s\-+*.]+$/.test(text);

  // Check previous siblings up to 3 levels
  let ancestor = el.parentElement;
  let depth = 0;
  while (ancestor && depth < 4) {
    let prev = ancestor.previousElementSibling;
    let hops = 0;
    while (prev && hops < 5) {
      const tag = prev.tagName?.toLowerCase();
      if (!['input', 'select', 'textarea', 'button', 'form'].includes(tag)) {
        const text = (prev.textContent || '').trim();
        if (isQuestionLike(text)) return text;
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
    const radios = document.querySelectorAll(`input[type="radio"][name="${el.name}"]`);
    return Array.from(radios).map(r => ({ value: r.value, text: getLabel(r) || r.value }));
  }
  return undefined;
}
