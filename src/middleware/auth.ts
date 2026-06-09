import { Request, Response, NextFunction } from 'express';
import { supabase } from '../services/supabase';

export interface AuthRequest extends Request {
  userId?: string;
  userEmail?: string;
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing authorization header' });
    return;
  }

  const token = authHeader.slice(7);

  // Try Supabase JWT first (web UI)
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (user) {
    req.userId = user.id;
    req.userEmail = user.email;
    return next();
  }

  // Fall back to API key (Chrome extension)
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('api_key', token)
    .single();

  if (profile) {
    req.userId = profile.id;
    return next();
  }

  res.status(401).json({ error: 'Invalid or expired token' });
}
