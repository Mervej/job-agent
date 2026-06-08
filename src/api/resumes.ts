import express from 'express';
import path from 'path';
import fs from 'fs';
import { getAllResumes, getResumeById } from '../services/db';

const router = express.Router();

const getResumesDir = () =>
  process.env.RESUMES_DIR || path.join(__dirname, '..', 'data', 'resumes');

router.get('/', (req, res) => {
  try {
    const resumes = getAllResumes();
    res.json(resumes);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id/file', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid resume ID' });
  }

  const resume = getResumeById(id) as any;
  if (!resume) {
    return res.status(404).json({ error: 'Resume not found' });
  }

  const filePath = path.join(getResumesDir(), resume.filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Resume file not found on disk' });
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${resume.filename}"`);
  fs.createReadStream(filePath).pipe(res);
});

export default router;
