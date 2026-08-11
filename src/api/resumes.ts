import express, { Response } from 'express';
import path from 'path';
import fs from 'fs';
import { supabase } from '../services/supabase';
import { AuthRequest } from '../middleware/auth';

const router = express.Router();

const resumesDir = () =>
  process.env.RESUMES_DIR || path.join(__dirname, '..', 'data', 'resumes');

/** Resolve resume PDF on disk — try exact name, then common dirs, then newest PDF (local-dev fallback). */
function resolveResumePath(filename: string): string | null {
  const dirs = [
    resumesDir(),
    path.join(process.cwd(), 'src', 'data', 'resumes'),
    path.join(process.cwd(), 'dist', 'data', 'resumes'),
  ];
  for (const dir of dirs) {
    const exact = path.join(dir, filename);
    if (fs.existsSync(exact)) return exact;
  }
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    const pdfs = fs
      .readdirSync(dir)
      .filter((f) => f.toLowerCase().endsWith('.pdf'))
      .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    if (pdfs.length > 0) {
      console.warn(`[resumes] "${filename}" not found; falling back to newest ${pdfs[0].f} in ${dir}`);
      return path.join(dir, pdfs[0].f);
    }
  }
  return null;
}

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

  const filePath = resolveResumePath(data.filename);
  if (!filePath) {
    return res.status(404).json({
      error: `File not on disk (${data.filename}). Re-upload your resume at the Job Agent dashboard.`,
    });
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${path.basename(filePath)}"`);
  fs.createReadStream(filePath).pipe(res);
});

export default router;
