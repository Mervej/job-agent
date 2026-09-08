import express from 'express';
import { FieldMapperService } from '../services/field-mapper.service';

const router = express.Router();
const fieldMapper = new FieldMapperService();

// Chrome extension endpoint: map extracted form fields to resume values
router.post('/map-fields', async (req, res) => {
  const { fields, resumeId, jobUrl, jobText, jobTitle, company } = req.body;

  if (!resumeId) return res.status(400).json({ error: 'resumeId is required' });
  if (!jobUrl) return res.status(400).json({ error: 'jobUrl is required' });
  if (!Array.isArray(fields)) return res.status(400).json({ error: 'fields must be an array' });

  try {
    const result = await fieldMapper.mapFields(fields, resumeId, jobUrl, jobText, jobTitle, company);
    res.json(result);
  } catch (error: any) {
    if (error.message === 'Resume not found') {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

// Standalone cover-letter generation for the extension's manual "Generate Cover Letter" button
router.post('/generate-cover-letter', async (req, res) => {
  const { resumeId, jobUrl, jobText, jobTitle, company } = req.body;

  if (!resumeId) return res.status(400).json({ error: 'resumeId is required' });
  if (!jobUrl) return res.status(400).json({ error: 'jobUrl is required' });

  try {
    const result = await fieldMapper.generateCoverLetterOnly(resumeId, jobUrl, jobText, jobTitle, company);
    res.json(result);
  } catch (error: any) {
    if (error.message === 'Resume not found') {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

// Map fields for a single structured entry (experience/education/project)
router.post('/map-entry-fields', (req, res) => {
  const { fields, entryType, entryData, resumeText, isCurrentJob } = req.body;
  if (!fields || !entryType || !entryData) {
    return res.status(400).json({ error: 'fields, entryType and entryData are required' });
  }
  try {
    console.log('[map-entry-fields]', entryType, 'entryData keys:', Object.keys(entryData), 'values:', JSON.stringify(entryData));
    const mappings = fieldMapper.mapEntryFields(fields, entryType, entryData, resumeText || '', !!isCurrentJob);
    console.log('[map-entry-fields] mappings:', mappings.map((m: any) => `${m.selector.slice(-30)} → "${m.value}"`).join(' | '));
    res.json({ mappings });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Generate a PDF from cover letter text — used by extension for cover letter file inputs
router.post('/cover-letter-pdf', (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'text is required' });

  try {
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ margin: 72, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="cover-letter.pdf"');
    doc.pipe(res);
    doc.font('Helvetica').fontSize(11).text(text, { lineGap: 4 });
    doc.end();
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
