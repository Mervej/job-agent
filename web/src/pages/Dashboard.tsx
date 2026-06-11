import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getProfile } from '../lib/api';

export default function Dashboard() {
  const [name, setName] = useState('');
  const [hasProfile, setHasProfile] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setName(data.session?.user.user_metadata?.full_name || '');
    });
    getProfile().then((p: any) => {
      setHasProfile(!!p?.full_name);
    }).catch(() => {});
  }, []);

  const firstName = name.split(' ')[0];

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>
          Welcome back{firstName ? `, ${firstName}` : ''} 👋
        </h1>
        <p style={{ fontSize: 15, color: '#64748b' }}>
          Here's your Job Agent dashboard. Set up your profile once, then let the extension fill applications for you.
        </p>
      </div>

      {/* Status banner */}
      {!hasProfile && (
        <div style={{
          background: '#fffbeb',
          border: '1px solid #fcd34d',
          borderRadius: 10,
          padding: '14px 18px',
          marginBottom: 28,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          fontSize: 14,
          color: '#92400e',
        }}>
          <span style={{ fontSize: 18 }}>⚠️</span>
          <span>Your profile is empty. <Link to="/profile" style={{ fontWeight: 600, color: '#b45309' }}>Upload your resume</Link> to get started.</span>
        </div>
      )}

      {/* Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, marginBottom: 40 }}>
        <StatCard icon="👤" label="Profile" value={hasProfile ? 'Set up' : 'Not set up'} ok={hasProfile} to="/profile" action="Edit profile" />
        <StatCard icon="🔑" label="Extension" value="Download & connect" ok={true} to="/settings" action="Set up" href="https://github.com/Mervej/job-agent/releases/download/v.1.0.1/job-agent-extension-v1.0.1.zip" />
        <StatCard icon="📋" label="Applications" value="0 filled" ok={true} />
      </div>

      {/* How it works */}
      <div style={{ background: '#fff', borderRadius: 12, padding: 28, border: '1px solid #e2e8f0' }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', marginBottom: 20 }}>How it works</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          {[
            { step: 1, icon: '📄', title: 'Upload resume', desc: 'Upload your PDF — fields are parsed automatically' },
            { step: 2, icon: '🔑', title: 'Connect extension', desc: 'Copy your API key and paste it into the extension settings' },
            { step: 3, icon: '🌐', title: 'Open a job page', desc: 'The extension detects the application form automatically' },
            { step: 4, icon: '✅', title: 'Review & submit', desc: 'Fields fill in — you review and click Submit yourself' },
          ].map(({ step, icon, title, desc }) => (
            <div key={step} style={{ textAlign: 'center', padding: '4px 8px' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>{icon}</div>
              <div style={{
                display: 'inline-block', width: 22, height: 22, background: '#3b82f6', color: '#fff',
                borderRadius: '50%', fontSize: 12, fontWeight: 700, lineHeight: '22px', marginBottom: 8,
              }}>{step}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>{title}</div>
              <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>{desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, ok, to, action, href }: {
  icon: string; label: string; value: string; ok: boolean; to?: string; action?: string; href?: string;
}) {
  return (
    <div style={{
      background: '#fff',
      borderRadius: 12,
      padding: '22px 24px',
      border: '1px solid #e2e8f0',
      borderTop: `3px solid ${ok ? '#22c55e' : '#f59e0b'}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 20 }}>{icon}</span>
        <span style={{ fontSize: 13, color: '#64748b', fontWeight: 500 }}>{label}</span>
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', marginBottom: to || href ? 12 : 0 }}>{value}</div>
      <div style={{ display: 'flex', gap: 12 }}>
        {href && (
          <a href={href} download style={{ fontSize: 13, color: '#3b82f6', fontWeight: 500 }}>Download →</a>
        )}
        {to && action && (
          <Link to={to} style={{ fontSize: 13, color: '#3b82f6', fontWeight: 500 }}>{action} →</Link>
        )}
      </div>
    </div>
  );
}
