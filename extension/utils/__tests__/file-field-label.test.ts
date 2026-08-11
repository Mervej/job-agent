import fs from 'fs';
import path from 'path';
import vm from 'vm';

function loadExtractor() {
  const code = fs.readFileSync(path.join(__dirname, '..', 'field-extractor.js'), 'utf8');
  const ctx: Record<string, unknown> = { console, document: { getElementById: () => null, querySelector: () => null } };
  vm.runInNewContext(
    `${code}\nthis.isDropzoneHelperText = isDropzoneHelperText;\nthis.getFileFieldTitle = getFileFieldTitle;\n`,
    ctx
  );
  return ctx as {
    isDropzoneHelperText: (t: string) => boolean;
    getFileFieldTitle: (el: unknown) => string;
  };
}

describe('file field labeling (Rippling dropzone)', () => {
  const { isDropzoneHelperText, getFileFieldTitle } = loadExtractor();

  it('treats Drop or select helper text as non-labels', () => {
    expect(isDropzoneHelperText('Drop or select (.doc / .docx / .pdf)')).toBe(true);
    expect(isDropzoneHelperText('Resume')).toBe(false);
    expect(isDropzoneHelperText('Cover letter')).toBe(false);
  });

  it('finds Resume / Cover letter titles in nearby card text', () => {
    const makeEl = (cardText: string) => {
      const card = {
        innerText: cardText,
        textContent: cardText,
        parentElement: null as unknown,
        closest() { return this; },
      };
      return {
        type: 'file',
        parentElement: card,
        closest() { return card; },
      };
    };

    expect(getFileFieldTitle(makeEl('Resume\nDrop or select (.doc / .docx / .pdf)\nNot uploaded'))).toBe('Resume');
    expect(getFileFieldTitle(makeEl('Cover letter\nDrop or select (.doc / .docx / .pdf)'))).toMatch(/Cover letter/i);
  });
});
