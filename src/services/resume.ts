import fs from 'fs';
import pdf from 'pdf-parse';

export async function parseResume(filePath: string) {
  const data = fs.readFileSync(filePath);
  const parsed = await pdf(data);
  return parsed.text;
}
