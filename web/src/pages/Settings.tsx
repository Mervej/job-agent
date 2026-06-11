import { useEffect, useState } from 'react';
import { getApiKey } from '../lib/api';

export default function Settings() {
  const [apiKey, setApiKey] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getApiKey()
      .then(setApiKey)
      .catch(() => {});
  }, []);

  async function copy() {
    await navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>Settings</h1>
      <p style={{ color: '#64748b', marginBottom: 32 }}>
        Connect the Chrome extension to your account
      </p>

      <div
        style={{
          background: '#eff6ff',
          border: '1px solid #bfdbfe',
          borderRadius: 10,
          padding: '16px 20px',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <div>
          <p style={{ margin: '0 0 2px', fontSize: 14, fontWeight: 600, color: '#1e40af' }}>
            Don't have the extension yet?
          </p>
          <p style={{ margin: 0, fontSize: 13, color: '#3b82f6' }}>
            Download and install it first, then paste your API key below.
          </p>
        </div>
        <a
          href="https://github.com/Mervej/job-agent/releases/download/v1.0.2/job-agent-extension-v1.0.2.zip"
          style={{
            whiteSpace: 'nowrap',
            padding: '9px 18px',
            background: '#2563eb',
            color: '#fff',
            borderRadius: 7,
            fontSize: 13,
            fontWeight: 600,
            textDecoration: 'none',
            flexShrink: 0,
          }}
        >
          Download Extension
        </a>
      </div>

      <div
        style={{
          background: '#fff',
          borderRadius: 10,
          padding: 24,
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        }}
      >
        <h2 style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', margin: '0 0 4px' }}>
          API Key
        </h2>
        <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 16px' }}>
          Paste this key into the Job Agent Chrome extension settings once — it never expires.
        </p>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 24 }}>
          <input
            type={revealed ? 'text' : 'password'}
            value={apiKey}
            readOnly
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: 6,
              border: '1px solid #e2e8f0',
              fontSize: 14,
              fontFamily: 'monospace',
              background: '#f8fafc',
              color: '#0f172a',
            }}
          />
          <button onClick={() => setRevealed((r) => !r)} style={ghostBtn}>
            {revealed ? 'Hide' : 'Show'}
          </button>
          <button
            onClick={copy}
            style={{
              padding: '8px 16px',
              background: '#3b82f6',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            {copied ? 'Copied ✓' : 'Copy'}
          </button>
        </div>

        <div style={{ background: '#f1f5f9', borderRadius: 8, padding: 16 }}>
          <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: '#0f172a' }}>
            How to connect the extension
          </p>
          {[
            'Download and install the extension using the button above',
            'Copy the API key above',
            'Open Chrome and click the Job Agent icon in the toolbar',
            'Click the gear (⚙) icon in the panel',
            'Paste the key and click Save',
          ].map((step, i) => (
            <div
              key={i}
              style={{ display: 'flex', gap: 10, marginBottom: 6, fontSize: 13, color: '#475569' }}
            >
              <span
                style={{
                  minWidth: 20,
                  height: 20,
                  background: '#3b82f6',
                  color: '#fff',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {i + 1}
              </span>
              {step}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const ghostBtn: React.CSSProperties = {
  padding: '8px 12px',
  background: 'transparent',
  color: '#64748b',
  border: '1px solid #e2e8f0',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 13,
};
