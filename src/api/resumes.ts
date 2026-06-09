import express, { Response } from 'express';
import path from 'path';
import fs from 'fs';
import { supabase } from '../services/supabase';
import { AuthRequest } from '../middleware/auth';

const router = express.Router();

const resumesDir = () =>
  process.env.RESUMES_DIR || path.join(__dirname, '..', 'data', 'resumes');

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

  const filePath = path.join(resumesDir(), data.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not on disk' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${data.filename}"`);
  fs.createReadStream(filePath).pipe(res);
});

export default router;
