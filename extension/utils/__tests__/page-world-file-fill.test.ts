/**
 * Tests for MAIN-world page file filler (Rippling FileDrop requires page-realm File objects).
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';

describe('pageWorldFillFileInput', () => {
  it('sets files with page-world File and reports ok when UI shows filename', async () => {
    const inputEl: any = {
      type: 'file',
      disabled: false,
      _files: null,
      getAttribute: () => null,
      setAttribute: () => {},
      closest: () => ({
        innerText: 'Resume\nMervej_Raj.pdf',
        textContent: 'Resume\nMervej_Raj.pdf',
        querySelector: () => ({ textContent: 'Mervej_Raj.pdf' }),
      }),
      parentElement: null,
      dispatchEvent: () => true,
    };
    Object.defineProperty(inputEl, 'files', {
      get() { return inputEl._files; },
      set() { throw new TypeError('readonly'); },
      configurable: true,
    });

    const nativeProto: any = {};
    Object.defineProperty(nativeProto, 'files', {
      get() { return inputEl._files; },
      set(v: unknown) { inputEl._files = v; },
      configurable: true,
    });

    class FakeFile {
      name: string;
      type: string;
      constructor(_b: unknown, name: string, opts: { type: string }) {
        this.name = name;
        this.type = opts.type;
      }
    }
    class FakeDataTransfer {
      private _f: FakeFile | null = null;
      items = { add: (f: FakeFile) => { this._f = f; } };
      get files() { return { length: 1, 0: this._f, item: () => this._f }; }
    }

    const sandboxCode = fs.readFileSync(path.join(__dirname, '..', 'page-world-file-fill.js'), 'utf8');
    const sandbox: any = {
      module: { exports: {} },
      self: {},
      console,
      setTimeout,
      clearTimeout,
      Object,
      Date,
      Uint8Array,
      atob: (s: string) => Buffer.from(s, 'base64').toString('binary'),
      File: FakeFile,
      DataTransfer: FakeDataTransfer,
      Event: class {
        type: string;
        constructor(type: string) { this.type = type; }
      },
      DragEvent: class {
        type: string;
        constructor(type: string) { this.type = type; }
      },
      window: { HTMLInputElement: { prototype: nativeProto } },
      document: {
        querySelector: (sel: string) => (sel.includes('data-job-agent') ? inputEl : null),
        querySelectorAll: () => [inputEl],
      },
    };
    vm.runInNewContext(sandboxCode, sandbox);
    const fill = sandbox.module.exports.pageWorldFillFileInput || sandbox.self.pageWorldFillFileInput;

    const pdf = Buffer.from('%PDF-1.4').toString('base64');
    const result = await fill('input[data-job-agent="x"]', pdf, 'Mervej_Raj.pdf', 'Resume');

    expect(result.ok).toBe(true);
    expect(inputEl._files[0].name).toBe('Mervej_Raj.pdf');
    expect(inputEl._files[0]).toBeInstanceOf(FakeFile);
  });
});
