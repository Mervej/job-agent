/**
 * Tests for robust file-input selector + MAIN-world fill messaging.
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { TextEncoder } from 'util';

function loadScript(filename: string, exports: string[], env: Record<string, unknown> = {}) {
  const file = path.join(__dirname, '..', filename);
  const code = fs.readFileSync(file, 'utf8');
  const ctx: Record<string, unknown> = {
    ...env,
    console,
    setTimeout,
    clearTimeout,
    Object,
    Date,
    Uint8Array,
    atob: (s: string) => Buffer.from(s, 'base64').toString('binary'),
    Event: class Event {
      type: string;
      bubbles: boolean;
      cancelable: boolean;
      constructor(type: string, init: { bubbles?: boolean; cancelable?: boolean } = {}) {
        this.type = type;
        this.bubbles = !!init.bubbles;
        this.cancelable = !!init.cancelable;
      }
    },
  };
  const assign = exports.map((e) => `this.${e} = ${e};`).join('\n');
  vm.runInNewContext(`${code}\n${assign}`, ctx);
  return ctx as Record<string, Function>;
}

describe('makeSelector for nameless file inputs (Rippling)', () => {
  it('prefers data-testid over fragile nth-of-type', () => {
    const { makeSelector } = loadScript('field-extractor.js', ['makeSelector']);
    const el = {
      tagName: 'INPUT',
      id: '',
      name: '',
      type: 'file',
      placeholder: '',
      getAttribute(attr: string) {
        if (attr === 'aria-label') return null;
        if (attr === 'data-testid') return 'file-input-resume';
        return null;
      },
    };
    expect(makeSelector(el, 8)).toBe('input[data-testid="file-input-resume"]');
  });

  it('uses stamped data-job-agent selector when no id/name/testid', () => {
    const attrs: Record<string, string> = {};
    const { makeSelector } = loadScript('field-extractor.js', ['makeSelector']);
    const el = {
      tagName: 'INPUT',
      id: '',
      name: '',
      type: 'file',
      placeholder: '',
      getAttribute(attr: string) {
        return attrs[attr] ?? null;
      },
      setAttribute(attr: string, value: string) {
        attrs[attr] = value;
      },
    };
    const sel = makeSelector(el, 3);
    expect(sel).toContain('file');
    expect(sel).toContain('data-job-agent');
  });
});

describe('fillFileInput MAIN-world messaging', () => {
  it('stamps the input and sends FILL_FILE_INPUT to the background', async () => {
    const sent: unknown[] = [];
    const attrs: Record<string, string> = {};
    const inputEl: any = {
      getAttribute: (a: string) => attrs[a] ?? null,
      setAttribute: (a: string, v: string) => { attrs[a] = v; },
      closest: () => ({ innerText: 'Resume upload' }),
      parentElement: null,
    };

    const { fillFileInput } = loadScript('field-filler.js', ['fillFileInput'], {
      File: class {},
      DataTransfer: class { items = { add() {} }; files = { length: 0 }; },
      window: { HTMLInputElement: { prototype: {} } },
      document: { body: { innerText: '', textContent: '' } },
      chrome: {
        runtime: {
          sendMessage: (msg: unknown, cb: (r: { ok: boolean }) => void) => {
            sent.push(msg);
            cb({ ok: true });
          },
          lastError: null,
        },
      },
    });

    const pdfBytes = new TextEncoder().encode('%PDF-1.4');
    const value = `${Buffer.from(pdfBytes).toString('base64')},Mervej_Raj.pdf`;
    const ok = await fillFileInput(inputEl, value);

    expect(ok).toBe(true);
    expect(sent).toHaveLength(1);
    expect((sent[0] as { type: string }).type).toBe('FILL_FILE_INPUT');
    expect((sent[0] as { filename: string }).filename).toBe('Mervej_Raj.pdf');
    expect(attrs['data-job-agent']).toBeTruthy();
  });
});
