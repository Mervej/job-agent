import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    // Check for OAuth error in URL (e.g. database error, cancelled flow)
    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    const error = params.get('error') || hashParams.get('error');
    if (error) {
      console.error('OAuth error:', params.get('error_description') || error);
      navigate('/login', { replace: true });
      return;
    }

    // Supabase auto-detects the ?code= param and exchanges it (PKCE).
    // onAuthStateChange fires with SIGNED_IN once the exchange completes.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        navigate('/', { replace: true });
      } else if (event === 'SIGNED_OUT') {
        navigate('/login', { replace: true });
      }
    });

    // In case the session was already established before this component mounted
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate('/', { replace: true });
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  return <div className="loading">Signing you in…</div>;
}
