/**
 * Self-contained function injected into the page MAIN world via chrome.scripting.executeScript.
 * Must not close over extension-world variables — File/DataTransfer must be the page's.
 *
 * @param {string} selector
 * @param {string} base64
 * @param {string} filename
 * @param {string} labelHint
 * @returns {Promise<{ok: boolean, error?: string, detail?: string}>}
 */
async function pageWorldFillFileInput(selector, base64, filename, labelHint) {
  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function findInput() {
    let el = null;
    try {
      el = document.querySelector(selector);
    } catch { /* invalid selector */ }
    if (el && (el.type || '').toLowerCase() === 'file') return el;

    const files = [...document.querySelectorAll('input[type="file"], input[type="File"]')];
    if (files.length === 1) return files[0];

    const hint = `${labelHint || ''} ${selector}`.toLowerCase();
    const wantCover = /cover|motivation/.test(hint);
    for (const input of files) {
      const card =
        input.closest(
          '[class*="file"], [class*="File"], [class*="upload"], [class*="Upload"], [class*="drop"], [role="group"]'
        ) || input.parentElement;
      const text = `${card?.innerText || ''} ${input.getAttribute('data-testid') || ''}`.toLowerCase();
      const isCover = /cover|motivation/.test(text);
      if (wantCover ? isCover : !isCover && /resume|cv|r[eé]sum|curriculum/.test(text)) return input;
    }
    return files[0] || null;
  }

  function invokeReactOnChange(el) {
    // Prefer walking the fiber tree — more reliable than __reactProps$ alone
    const fiberKey = Object.keys(el).find((k) => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
    if (fiberKey) {
      let fiber = el[fiberKey];
      for (let i = 0; fiber && i < 25; i++, fiber = fiber.return) {
        const props = fiber.memoizedProps || fiber.pendingProps;
        if (props && typeof props.onChange === 'function') {
          const fakeEvent = {
            target: el,
            currentTarget: el,
            type: 'change',
            bubbles: true,
            cancelable: true,
            defaultPrevented: false,
            isTrusted: false,
            nativeEvent: { target: el, type: 'change' },
            preventDefault() {
              this.defaultPrevented = true;
            },
            stopPropagation() {},
            persist() {},
            isDefaultPrevented() {
              return !!this.defaultPrevented;
            },
            isPropagationStopped() {
              return false;
            },
          };
          try {
            props.onChange(fakeEvent);
            return true;
          } catch {
            /* try next fiber */
          }
        }
      }
    }

    const propsKey = Object.keys(el).find(
      (k) => k.startsWith('__reactProps$') || k.startsWith('__reactEventHandlers$')
    );
    if (propsKey && typeof el[propsKey]?.onChange === 'function') {
      try {
        el[propsKey].onChange({
          target: el,
          currentTarget: el,
          persist() {},
          preventDefault() {},
          stopPropagation() {},
        });
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  function uploadAccepted(el, name) {
    const base = name.replace(/\.[^.]+$/, '');
    if (el.files && el.files.length > 0) {
      const n = el.files[0]?.name || '';
      if (n === name || (base && n.includes(base))) return true;
    }
    const card =
      el.closest(
        '[class*="file"], [class*="File"], [class*="upload"], [class*="Upload"], [class*="drop"], [role="group"]'
      ) || el.parentElement;
    const text = `${card?.innerText || ''} ${card?.textContent || ''}`;
    if (/not\s*uploaded/i.test(text) && !text.includes(name) && !(base && text.includes(base))) {
      return false;
    }
    if (text.includes(name)) return true;
    if (base.length > 3 && text.includes(base)) return true;
    // Progress complete / chip
    if (card?.querySelector?.('[class*="chip"], [class*="Chip"], [class*="filename"], [class*="fileName"]')) {
      const chipText = card.textContent || '';
      if (chipText.includes(name) || (base.length > 3 && chipText.includes(base))) return true;
    }
    return false;
  }

  try {
    const el = findInput();
    if (!el) return { ok: false, error: 'file input not found' };

    if (el.disabled) el.disabled = false;

    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const file = new File([bytes], filename, { type: 'application/pdf' });
    const dt = new DataTransfer();
    dt.items.add(file);

    const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'files');
    if (desc && desc.set) desc.set.call(el, dt.files);
    else {
      try {
        el.files = dt.files;
      } catch (e) {
        return { ok: false, error: 'cannot set files: ' + (e && e.message) };
      }
    }

    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    const reacted = invokeReactOnChange(el);

    // Drop on nearest zone (FileDrop also listens for drop)
    const zone =
      el.closest(
        '[class*="drop"], [class*="Drop"], [class*="upload"], [class*="Upload"], [class*="file"], [class*="File"]'
      ) || el.parentElement;
    if (zone) {
      for (const type of ['dragenter', 'dragover', 'drop']) {
        try {
          let ev;
          try {
            ev = new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt });
          } catch {
            ev = new Event(type, { bubbles: true, cancelable: true });
            Object.defineProperty(ev, 'dataTransfer', { get: () => dt });
          }
          zone.dispatchEvent(ev);
        } catch { /* ignore */ }
      }
    }

    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      if (uploadAccepted(el, filename)) {
        return { ok: true, detail: reacted ? 'react+ui' : 'ui' };
      }
      await sleep(300);
    }

    // Native files still attached counts as partial success for simple inputs
    if (el.files && el.files.length > 0) {
      return { ok: true, detail: 'native-files-only' };
    }
    return { ok: false, error: 'upload UI did not accept file', detail: reacted ? 'react-called' : 'no-react' };
  } catch (e) {
    return { ok: false, error: (e && e.message) || String(e) };
  }
}

// Export for service worker importScripts / tests
if (typeof self !== 'undefined') {
  self.pageWorldFillFileInput = pageWorldFillFileInput;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { pageWorldFillFileInput };
}
