import express from 'express';
import { generateText } from '../services/ai.service';
import { insertApplication } from '../services/db';

const router = express.Router();

router.post('/cover-letter', async (req, res) => {
  try {
    const { jobTitle, company, jobDescription, resumeSnippet } = req.body;
    const system = 'You are a professional assistant that writes concise, tailored cover letters.';
    const userPrompt = `Write a 3-paragraph cover letter for ${jobTitle} at ${company}. Job description: ${jobDescription}. Candidate info: ${resumeSnippet}`;
    const out = await generateText(system, userPrompt);
    const id = insertApplication('manual_job', 'generated', out.slice(0, 2000));
    res.json({ coverLetter: out, applicationId: id });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
