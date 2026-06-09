import { supabase } from '../lib/supabase';

export default function Login() {
  async function signInWithGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      background: '#f8fafc',
    }}>
      {/* Left panel — branding */}
      <div style={{
        flex: 1,
        background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '60px 64px',
        color: '#f8fafc',
      }}>
        <div style={{ fontSize: 36, marginBottom: 16 }}>💼</div>
        <h1 style={{ fontSize: 36, fontWeight: 800, marginBottom: 16, lineHeight: 1.2 }}>
          Job Agent
        </h1>
        <p style={{ fontSize: 18, color: '#94a3b8', marginBottom: 48, maxWidth: 400, lineHeight: 1.6 }}>
          Upload your resume once. The AI fills every job application form for you — fields mapped, cover letters written, confidence scores shown.
        </p>
        {[
          '🎯 Detects 14+ ATS platforms automatically',
          '🤖 AI maps your resume to each form field',
          '✅ You always review before submitting',
        ].map(f => (
          <div key={f} style={{ fontSize: 14, color: '#94a3b8', marginBottom: 10, display: 'flex', gap: 10 }}>
            {f}
          </div>
        ))}
      </div>

      {/* Right panel — sign in */}
      <div style={{
        width: 460,
        minWidth: 460,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '60px 48px',
        background: '#fff',
      }}>
        <div style={{ width: '100%', maxWidth: 340 }}>
          <h2 style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>
            Sign in
          </h2>
          <p style={{ fontSize: 14, color: '#64748b', marginBottom: 32 }}>
            Use your Google account to get started
          </p>

          <button onClick={signInWithGoogle} style={{
            width: '100%',
            padding: '13px 20px',
            borderRadius: 8,
            border: '1px solid #e2e8f0',
            background: '#fff',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            fontSize: 15,
            fontWeight: 500,
            color: '#0f172a',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            transition: 'box-shadow 0.15s',
          }}>
            <svg width="20" height="20" viewBox="0 0 18 18">
              <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"/>
              <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"/>
              <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z"/>
              <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z"/>
            </svg>
            Continue with Google
          </button>

          <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 24, textAlign: 'center', lineHeight: 1.5 }}>
            Your resume data stays private. Only outbound calls are to your chosen AI provider.
          </p>
        </div>
      </div>
    </div>
  );
}
