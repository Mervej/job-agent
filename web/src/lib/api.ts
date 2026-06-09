import { supabase } from './supabase';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

async function authHeaders(): Promise<HeadersInit> {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    'Content-Type': 'application/json',
    ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
  };
}

export async function getProfile() {
  const res = await fetch(`${BASE}/profile`, { headers: await authHeaders() });
  if (!res.ok) throw new Error('Failed to fetch profile');
  return res.json();
}

export async function updateProfile(data: Record<string, unknown>) {
  const res = await fetch(`${BASE}/profile`, {
    method: 'PUT',
    headers: await authHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update profile');
  return res.json();
}

export async function getApiKey(): Promise<string> {
  const res = await fetch(`${BASE}/profile/api-key`, { headers: await authHeaders() });
  if (!res.ok) throw new Error('Failed to fetch API key');
  const { apiKey } = await res.json();
  return apiKey;
}

export async function uploadResume(file: File) {
  const { data: { session } } = await supabase.auth.getSession();
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${BASE}/upload`, {
    method: 'POST',
    headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
    body: form,
  });
  if (!res.ok) throw new Error('Upload failed');
  return res.json();
}
