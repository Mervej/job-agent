import express from 'express';
import formidable from 'formidable';
import path from 'path';
import fs from 'fs';
import { parseResume } from '../services/resume';
import {
  insertResume,
  getAllResumes,
  getUserProfileFromResume,
  updateUserProfile,
} from '../services/db';

const router = express.Router();

router.post('/', (req, res) => {
  const uploadDir = path.join(__dirname, '..', 'data', 'resumes');

  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
  const form = formidable({ multiples: false, uploadDir, keepExtensions: true });

  form.parse(req, async (err, fields, files) => {
    if (err) return res.status(500).json({ error: err.message });

    const file = Array.isArray(files.file) ? files.file[0] : files.file;
    if (!file) return res.status(400).json({ error: 'file not provided' });

    const savedPath = (file as any).filepath || (file as any).path;

    // Extract user profile from form fields
    const getFieldValue = (field: string | string[] | undefined): string => {
      if (Array.isArray(field)) return field[0] || '';
      return field || '';
    };

    const userProfile = {
      name: getFieldValue(fields.name),
      email: getFieldValue(fields.email),
      phone: getFieldValue(fields.phone),
      location: getFieldValue(fields.location),
      linkedin: getFieldValue(fields.linkedin),
      github: getFieldValue(fields.github),
      experience: getFieldValue(fields.experience),
      skills: fields.skills ? JSON.parse(getFieldValue(fields.skills)) : [],
      achievements: fields.achievements ? JSON.parse(getFieldValue(fields.achievements)) : [],
    };

    const text = await parseResume(savedPath);
    const id = insertResume(path.basename(savedPath), text, userProfile);

    return res.json({
      id,
      filename: path.basename(savedPath),
      textSnippet: text.slice(0, 800),
      userProfile,
    });
  });
});

// Get all uploaded resumes
router.get('/', (req, res) => {
  try {
    const resumes = getAllResumes();
    res.json({ resumes });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get user profile for a specific resume
router.get('/:id/profile', (req, res) => {
  try {
    const resumeId = parseInt(req.params.id);
    if (isNaN(resumeId)) {
      return res.status(400).json({ error: 'Invalid resume ID' });
    }

    const userProfile = getUserProfileFromResume(resumeId);
    if (!userProfile) {
      return res.status(404).json({ error: 'Resume not found' });
    }

    res.json({ userProfile });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update user profile for a specific resume
router.put('/:id/profile', (req, res) => {
  try {
    const resumeId = parseInt(req.params.id);
    if (isNaN(resumeId)) {
      return res.status(400).json({ error: 'Invalid resume ID' });
    }

    const userProfile = req.body;
    const updated = updateUserProfile(resumeId, userProfile);

    if (!updated) {
      return res.status(404).json({ error: 'Resume not found' });
    }

    res.json({ message: 'User profile updated successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
