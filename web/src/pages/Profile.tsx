import { useEffect, useRef, useState } from 'react';
import { getProfile, updateProfile, uploadResume } from '../lib/api';

type ProfileData = {
  full_name?: string; email?: string; phone?: string;
  location?: string; linkedin?: string; github?: string;
  website?: string; summary?: string; skills?: string[];
  notice_period?: string; expected_ctc?: string; current_ctc?: string; work_authorization?: string;
  experience?: { title: string; company: string; start: string; end: string; description: string }[];
  education?: { degree: string; school: string; year: string }[];
};

export default function Profile() {
  const [form, setForm] = useState<ProfileData>({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getProfile().then(setForm).catch(() => {});
  }, []);

  function set(key: keyof ProfileData, value: unknown) {
    setForm(f => ({ ...f, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await updateProfile(form as Record<string, unknown>);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const parsed = await uploadResume(file);
      setForm(f => ({
        ...f,
        ...(parsed.userProfile ?? {}),
        ...(parsed.summary != null ? { summary: parsed.summary } : {}),
        ...(parsed.skills?.length ? { skills: parsed.skills } : {}),
        ...(parsed.experience?.length ? { experience: parsed.experience } : {}),
        ...(parsed.education?.length ? { education: parsed.education } : {}),
      }));
    } catch {
      alert('Upload failed');
    } finally {
      setUploading(false);
    }
  }

  const input = (label: string, key: keyof ProfileData, type = 'text') => (
    <div style={{ marginBottom: 16 }}>
      <label style={labelStyle}>{label}</label>
      <input
        type={type}
        value={(form[key] as string) || ''}
        onChange={e => set(key, e.target.value)}
        style={inputStyle}
      />
    </div>
  );

  return (
    <div style={{ maxWidth: 680 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: 0 }}>Profile</h1>
        <button onClick={handleSave} disabled={saving} style={btnStyle('#3b82f6')}>
          {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save changes'}
        </button>
      </div>

      {/* Resume upload */}
      <div style={{ background: '#f1f5f9', borderRadius: 8, padding: 16, marginBottom: 28, border: '2px dashed #cbd5e1' }}>
        <p style={{ margin: '0 0 10px', fontSize: 13, color: '#475569' }}>
          Upload a resume PDF to auto-populate fields below
        </p>
        <input type="file" accept=".pdf" ref={fileRef} onChange={handleUpload} style={{ display: 'none' }} />
        <button onClick={() => fileRef.current?.click()} disabled={uploading} style={btnStyle('#475569')}>
          {uploading ? 'Parsing…' : 'Upload Resume PDF'}
        </button>
      </div>

      <section>
        <h2 style={sectionHead}>Basic info</h2>
        {input('Full name', 'full_name')}
        {input('Email', 'email', 'email')}
        {input('Phone', 'phone', 'tel')}
        {input('Location', 'location')}
        {input('LinkedIn URL', 'linkedin')}
        {input('GitHub URL', 'github')}
        {input('Website', 'website')}
      </section>

      <section style={{ marginTop: 28 }}>
        <h2 style={sectionHead}>Summary</h2>
        <textarea
          value={form.summary || ''}
          onChange={e => set('summary', e.target.value)}
          rows={4}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </section>

      <section style={{ marginTop: 28 }}>
        <h2 style={sectionHead}>Job preferences</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            {input('Notice Period', 'notice_period')}
          </div>
          <div>
            {input('Work Authorization', 'work_authorization')}
          </div>
          <div>
            {input('Current CTC / Salary', 'current_ctc')}
          </div>
          <div>
            {input('Expected CTC / Salary', 'expected_ctc')}
          </div>
        </div>
      </section>

      <section style={{ marginTop: 28 }}>
        <h2 style={sectionHead}>Skills</h2>
        <input
          type="text"
          value={(form.skills || []).join(', ')}
          onChange={e => set('skills', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
          placeholder="React, TypeScript, Node.js, …"
          style={inputStyle}
        />
        <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>Comma-separated</p>
      </section>

      <section style={{ marginTop: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ ...sectionHead, margin: 0 }}>Work experience</h2>
          <button style={btnStyle('#6366f1')} onClick={() =>
            set('experience', [...(form.experience || []), { title: '', company: '', start: '', end: '', description: '' }])
          }>+ Add</button>
        </div>
        {(form.experience || []).map((exp, i) => (
          <div key={i} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, marginTop: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {(['title', 'company', 'start', 'end'] as const).map(f => (
                <div key={f}>
                  <label style={labelStyle}>{f.charAt(0).toUpperCase() + f.slice(1)}</label>
                  <input style={inputStyle} value={exp[f] || ''} onChange={e => {
                    const exps = [...(form.experience || [])];
                    exps[i] = { ...exps[i], [f]: e.target.value };
                    set('experience', exps);
                  }} />
                </div>
              ))}
            </div>
            <label style={{ ...labelStyle, marginTop: 8 }}>Description</label>
            <textarea rows={2} style={{ ...inputStyle, resize: 'vertical' }} value={exp.description || ''}
              onChange={e => {
                const exps = [...(form.experience || [])];
                exps[i] = { ...exps[i], description: e.target.value };
                set('experience', exps);
              }} />
            <button onClick={() => set('experience', (form.experience || []).filter((_, j) => j !== i))}
              style={{ marginTop: 8, fontSize: 12, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>
              Remove
            </button>
          </div>
        ))}
      </section>

      <section style={{ marginTop: 28, marginBottom: 48 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ ...sectionHead, margin: 0 }}>Education</h2>
          <button style={btnStyle('#6366f1')} onClick={() =>
            set('education', [...(form.education || []), { degree: '', school: '', year: '' }])
          }>+ Add</button>
        </div>
        {(form.education || []).map((edu, i) => (
          <div key={i} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, marginTop: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px', gap: 12 }}>
              {(['degree', 'school', 'year'] as const).map(f => (
                <div key={f}>
                  <label style={labelStyle}>{f.charAt(0).toUpperCase() + f.slice(1)}</label>
                  <input style={inputStyle} value={edu[f] || ''} onChange={e => {
                    const eds = [...(form.education || [])];
                    eds[i] = { ...eds[i], [f]: e.target.value };
                    set('education', eds);
                  }} />
                </div>
              ))}
            </div>
            <button onClick={() => set('education', (form.education || []).filter((_, j) => j !== i))}
              style={{ marginTop: 8, fontSize: 12, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>
              Remove
            </button>
          </div>
        ))}
      </section>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #e2e8f0',
  fontSize: 14, color: '#0f172a', background: '#fff', boxSizing: 'border-box',
};
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 500, color: '#475569', marginBottom: 4,
};
const sectionHead: React.CSSProperties = {
  fontSize: 15, fontWeight: 600, color: '#0f172a', marginBottom: 14, paddingBottom: 8,
  borderBottom: '1px solid #e2e8f0',
};
function btnStyle(bg: string): React.CSSProperties {
  return {
    padding: '8px 16px', background: bg, color: '#fff', border: 'none',
    borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 500,
  };
}
