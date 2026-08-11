/**
 * Tests for hardened file-input filling (MAIN-world + isolated fallback).
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { TextEncoder } from 'util';

function b64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

function loadFiller(env: Record<string, unknown>) {
  const file = path.join(__dirname, '..', 'field-filler.js');
  const code = fs.readFileSync(file, 'utf8');
  const ctx: Record<string, unknown> = {
    ...env,
    console,
    setTimeout,
    clearTimeout,
    Object,
    Date,
    File: env.File,
    DataTransfer: env.DataTransfer,
    Uint8Array,
    atob: (s: string) => Buffer.from(s, 'base64').toString('binary'),
    chrome: env.chrome || {
      runtime: {
        sendMessage: (_m: unknown, cb: (r: { ok: boolean; error?: string }) => void) => {
          cb({ ok: false, error: 'test-fallback' });
        },
        lastError: null,
      },
    },
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
  vm.runInNewContext(
    `${code}\nthis.fillFileInput = fillFileInput;\nthis.fileUploadAccepted = fileUploadAccepted;\n`,
    ctx
  );
  return ctx as {
    fillFileInput: (el: unknown, value: string) => Promise<boolean>;
    fileUploadAccepted: (el: unknown, filename: string) => boolean;
  };
}

class FakeFile {
  name: string;
  type: string;
  constructor(_bits: unknown, name: string, opts: { type: string }) {
    this.name = name;
    this.type = opts.type;
  }
}

class FakeDataTransfer {
  private _file: FakeFile | null = null;
  items = {
    add: (f: FakeFile) => {
      this._file = f;
    },
  };
  get files() {
    const f = this._file;
    return {
      length: f ? 1 : 0,
      0: f,
      item: (i: number) => (i === 0 ? f : null),
    };
  }
}

describe('fillFileInput', () => {
  it('falls back to isolated-world fill when MAIN world fails', async () => {
    const events: string[] = [];
    const attrs: Record<string, string> = {};
    const inputEl: any = {
      _files: null,
      getAttribute: (a: string) => attrs[a] ?? null,
      setAttribute: (a: string, v: string) => { attrs[a] = v; },
      closest: () => null,
      parentElement: null,
      dispatchEvent(ev: { type: string }) {
        events.push(ev.type);
        return true;
      },
    };

    Object.defineProperty(inputEl, 'files', {
      get() { return inputEl._files; },
      set() { throw new TypeError('Cannot set property files'); },
      configurable: true,
    });

    const nativeProto: any = {};
    Object.defineProperty(nativeProto, 'files', {
      get() { return inputEl._files; },
      set(v: unknown) { inputEl._files = v; },
      configurable: true,
    });

    const { fillFileInput } = loadFiller({
      File: FakeFile,
      DataTransfer: FakeDataTransfer,
      window: { HTMLInputElement: { prototype: nativeProto } },
      document: { body: { innerText: '', textContent: '' } },
    });

    const pdfBytes = new TextEncoder().encode('%PDF-1.4 test');
    const ok = await fillFileInput(inputEl, `${b64(pdfBytes)},Mervej_Raj.pdf`);

    expect(ok).toBe(true);
    expect(events).toContain('change');
    expect(inputEl._files[0].name).toBe('Mervej_Raj.pdf');
  });

  it('returns true when MAIN-world FILL_FILE_INPUT succeeds', async () => {
    const attrs: Record<string, string> = {};
    const inputEl: any = {
      getAttribute: (a: string) => attrs[a] ?? null,
      setAttribute: (a: string, v: string) => { attrs[a] = v; },
      closest: () => ({ innerText: 'Resume' }),
      parentElement: null,
    };

    const { fillFileInput } = loadFiller({
      File: FakeFile,
      DataTransfer: FakeDataTransfer,
      window: { HTMLInputElement: { prototype: {} } },
      document: { body: { innerText: '', textContent: '' } },
      chrome: {
        runtime: {
          sendMessage: (msg: { type: string }, cb: (r: { ok: boolean }) => void) => {
            expect(msg.type).toBe('FILL_FILE_INPUT');
            cb({ ok: true });
          },
          lastError: null,
        },
      },
    });

    const ok = await fillFileInput(inputEl, `${b64(new TextEncoder().encode('%PDF'))},resume.pdf`);
    expect(ok).toBe(true);
  });

  it('fileUploadAccepted is true when nearby UI shows the filename', () => {
    const { fileUploadAccepted } = loadFiller({
      File: FakeFile,
      DataTransfer: FakeDataTransfer,
      window: { HTMLInputElement: { prototype: {} } },
      document: { body: { innerText: '', textContent: '' } },
    });

    const el = {
      files: { length: 0 },
      closest() {
        return {
          textContent: 'Resume\nMervej_Raj.pdf\n10 KB',
          innerText: 'Resume\nMervej_Raj.pdf\n10 KB',
          querySelector: () => ({ textContent: 'Mervej_Raj.pdf' }),
        };
      },
      parentElement: null,
    };

    expect(fileUploadAccepted(el, 'Mervej_Raj.pdf')).toBe(true);
  });

  it('fileUploadAccepted is false when UI still says Not uploaded', () => {
    const { fileUploadAccepted } = loadFiller({
      File: FakeFile,
      DataTransfer: FakeDataTransfer,
      window: { HTMLInputElement: { prototype: {} } },
      document: { body: { innerText: '', textContent: '' } },
    });

    const el = {
      files: { length: 0 },
      closest() {
        return {
          textContent: 'Resume Not uploaded',
          innerText: 'Resume Not uploaded',
          querySelector: () => null,
        };
      },
      parentElement: null,
    };

    expect(fileUploadAccepted(el, 'Mervej_Raj.pdf')).toBe(false);
  });
});
