import express from 'express';
import formidable from 'formidable';
import path from 'path';
import fs from 'fs';
import { parseResume } from '../services/resume';
import { insertResume } from '../services/db';

const router = express.Router();

router.post('/', (req, res) => {
  const uploadDir = path.join(__dirname, '..', 'data', 'resumes');
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
  const form = formidable({ multiples: false, uploadDir, keepExtensions: true });
  form.parse(req, async (err, fields, files) => {
    if (err) return res.status(500).json({ error: err.message });
    const file = files.file as formidable.File;
    if (!file) return res.status(400).json({ error: 'file not provided' });
    const savedPath = (file as any).filepath || (file as any).path;
    const text = await parseResume(savedPath);
    const id = insertResume(path.basename(savedPath), text);
    return res.json({ id, filename: path.basename(savedPath), textSnippet: text.slice(0, 800) });
  });
});

export default router;
