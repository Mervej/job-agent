import { Response, Router } from 'express';
import { AuthRequest } from '../middleware/auth';
import { supabase } from '../services/supabase';

const router = Router();

// GET /profile — fetch current user's profile
router.get('/', async (req: AuthRequest, res: Response) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', req.userId)
    .single();

  if (error && error.code !== 'PGRST116') {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json(data || {});
});

// PUT /profile — create or update profile fields
router.put('/', async (req: AuthRequest, res: Response) => {
  const allowed = [
    'full_name', 'email', 'phone', 'location', 'linkedin', 'github',
    'website', 'summary', 'skills', 'experience', 'education',
    'expected_ctc', 'current_ctc', 'notice_period', 'work_authorization',
  ];

  const updates: Record<string, unknown> = { id: req.userId, updated_at: new Date().toISOString() };
  for (const key of allowed) {
    if (key in req.body) updates[key] = req.body[key];
  }

  const { data, error } = await supabase
    .from('profiles')
    .upsert(updates)
    .select()
    .single();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json(data);
});

// GET /profile/me — current user identity (from Supabase Auth)
router.get('/me', async (req: AuthRequest, res: Response) => {
  const { data: { user } } = await supabase.auth.admin.getUserById(req.userId!);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json({
    id: user.id,
    email: user.email,
    name: user.user_metadata?.full_name,
    picture: user.user_metadata?.avatar_url,
  });
});

// GET /profile/api-key — return the user's API key
router.get('/api-key', async (req: AuthRequest, res: Response) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('api_key')
    .eq('id', req.userId)
    .single();

  if (error || !data) {
    res.status(404).json({ error: 'Profile not found' });
    return;
  }

  res.json({ apiKey: data.api_key });
});

export default router;
