import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !key) {
  console.error(
    '[Job Agent] Missing Supabase env vars. ' +
    'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment.'
  );
}

export const supabase = createClient(url || 'https://placeholder.supabase.co', key || 'placeholder');
export const supabaseReady = !!(url && key);
