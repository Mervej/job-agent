import express, { Response } from 'express';
import formidable from 'formidable';
import path from 'path';
import fs from 'fs';
import { parseResume, parseResumeToStructured } from '../services/resume';
import { supabase } from '../services/supabase';
import { AuthRequest } from '../middleware/auth';

function extractContactInfo(text: string) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  const email = text.match(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i)?.[0] || null;
  const phone = text.match(/(\+?[\d][\d\s\-().]{7,}\d)/)?.[0]?.trim() || null;

  const linkedinSlug = text.match(/linkedin\.com\/in\/([\w%-]+)/i);
  const linkedin = linkedinSlug ? `https://linkedin.com/in/${linkedinSlug[1]}` : null;

  const githubSlug = text.match(/github\.com\/([\w-]+)/i);
  const github = githubSlug ? `https://github.com/${githubSlug[1]}` : null;

  const websiteMatch = text.match(/https?:\/\/(?!(?:www\.)?(linkedin|github)\.com)[\w.-]+\.[a-z]{2,}[\w./?=#%-]*/i);
  const website = websiteMatch?.[0] || null;

  const location =
    text.match(/\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)?,\s*(?:[A-Z]{2}|India|USA|UK|Canada|Remote)\b/)?.[0] ||
    text.match(/\b(Remote|Bangalore|Mumbai|Delhi|Hyderabad|Chennai|Pune|London|New York|San Francisco)\b/i)?.[0] ||
    null;

  const name = lines.find(l =>
    l.length > 2 && l.length < 60 &&
    !l.includes('@') && !l.includes('http') && !l.includes('|') &&
    !/^[A-Z\s]+$/.test(l) &&
    /[a-z]/.test(l)
  ) || null;

  return { name, email, phone, linkedin, github, website, location };
}

const router = express.Router();

router.post('/', async (req: AuthRequest, res: Response) => {
  const uploadDir = path.join(__dirname, '..', 'data', 'resumes');
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

  const form = formidable({ multiples: false, uploadDir, keepExtensions: true });

  form.parse(req, async (err, _fields, files) => {
    if (err) return res.status(500).json({ error: err.message });

    const file = Array.isArray(files.file) ? files.file[0] : files.file;
    if (!file) return res.status(400).json({ error: 'file not provided' });

    const savedPath = (file as any).filepath || (file as any).path;
    const filename = path.basename(savedPath);

    const text = await parseResume(savedPath);
    const structured = await parseResumeToStructured(text);

    // Contact info: regex is more reliable than AI for these fields
    const regex = extractContactInfo(text);

    // Only include a field if parsed — never overwrite existing DB value with null
    const profileUpdate: Record<string, unknown> = {};
    const set = (k: string, v: unknown) => { if (v != null && v !== '') profileUpdate[k] = v; };

    set('full_name', regex.name || structured.profileDetails.name);
    set('email',     regex.email || structured.profileDetails.email);
    set('phone',     regex.phone || structured.profileDetails.phone);
    set('location',  regex.location || structured.profileDetails.location);
    set('linkedin',  regex.linkedin || structured.profileDetails.linkedin);
    set('github',    regex.github || structured.profileDetails.github);
    set('website',   regex.website || structured.profileDetails.website);

    // Map AI-returned field names to the shape the UI expects
    const experience = (structured.experience || []).map(e => ({
      title: e.role,
      company: e.company,
      start: e.startDate,
      end: e.endDate,
      description: [e.description, ...(e.achievements || [])].filter(Boolean).join('\n'),
    }));

    const education = (structured.education || []).map(e => ({
      degree: e.degree,
      school: e.institution,
      year: e.endDate,
    }));

    const { data: resumeRow, error: resumeErr } = await supabase
      .from('resumes')
      .upsert({ user_id: req.userId, filename, parsed_text: text }, { onConflict: 'user_id' })
      .select()
      .single();

    if (resumeErr) return res.status(500).json({ error: resumeErr.message });

    const dbUpdate: Record<string, unknown> = {
      id: req.userId,
      ...profileUpdate,
      updated_at: new Date().toISOString(),
    };
    if (structured.summary?.trim())  dbUpdate.summary = structured.summary;
    if (structured.skills?.length)   dbUpdate.skills = structured.skills;
    if (experience.length)           dbUpdate.experience = experience;
    if (education.length)            dbUpdate.education = education;

    await supabase.from('profiles').upsert(dbUpdate);

    return res.json({
      id: resumeRow.id,
      filename,
      textSnippet: text.slice(0, 800),
      userProfile: profileUpdate,
      ...(experience.length ? { experience } : {}),
      ...(education.length ? { education } : {}),
      ...(structured.summary?.trim() ? { summary: structured.summary } : {}),
      ...(structured.skills?.length ? { skills: structured.skills } : {}),
    });
  });
});

router.get('/', async (req: AuthRequest, res: Response) => {
  const { data, error } = await supabase
    .from('resumes')
    .select('id, filename, created_at')
    .eq('user_id', req.userId)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ resumes: data });
});

router.get('/:id/file', async (req: AuthRequest, res: Response) => {
  const { data, error } = await supabase
    .from('resumes')
    .select('filename')
    .eq('id', req.params.id)
    .eq('user_id', req.userId)
    .single();

  if (error || !data) return res.status(404).json({ error: 'Not found' });

  const filePath = path.join(__dirname, '..', 'data', 'resumes', data.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not on disk' });

  res.download(filePath);
});

export default router;
