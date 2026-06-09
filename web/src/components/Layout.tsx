import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

const NAV_WIDTH = 240;

export default function Layout({ session }: { session: Session }) {
  const navigate = useNavigate();
  const user = session.user;
  const avatar = user.user_metadata?.avatar_url;
  const name = user.user_metadata?.full_name || user.email || '';

  async function signOut() {
    await supabase.auth.signOut();
    navigate('/login');
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Sidebar */}
      <aside style={{
        width: NAV_WIDTH,
        minWidth: NAV_WIDTH,
        background: '#0f172a',
        color: '#f8fafc',
        display: 'flex',
        flexDirection: 'column',
        padding: '0',
        position: 'sticky',
        top: 0,
        height: '100vh',
        overflowY: 'auto',
      }}>
        {/* Logo */}
        <div style={{ padding: '28px 24px 20px', borderBottom: '1px solid #1e293b' }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: '#60a5fa', letterSpacing: '-0.3px' }}>
            💼 Job Agent
          </div>
          <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>
            AI Application Assistant
          </div>
        </div>

        {/* Nav links */}
        <nav style={{ padding: '16px 12px', flex: 1 }}>
          {[
            { to: '/', label: 'Dashboard', icon: '⊞' },
            { to: '/profile', label: 'Profile', icon: '👤' },
            { to: '/settings', label: 'Settings', icon: '⚙' },
          ].map(({ to, label, icon }) => (
            <NavLink key={to} to={to} end={to === '/'} style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 12px',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: isActive ? 600 : 400,
              color: isActive ? '#fff' : '#94a3b8',
              background: isActive ? '#1e293b' : 'transparent',
              marginBottom: 2,
              transition: 'all 0.15s',
            })}>
              <span style={{ fontSize: 15 }}>{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div style={{ padding: '16px', borderTop: '1px solid #1e293b' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            {avatar
              ? <img src={avatar} alt="" style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0 }} />
              : <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>
                  {name[0]?.toUpperCase()}
                </div>
            }
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user.user_metadata?.full_name || 'User'}
              </div>
              <div style={{ fontSize: 11, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user.email}
              </div>
            </div>
          </div>
          <button onClick={signOut} style={{
            width: '100%',
            padding: '8px',
            background: 'transparent',
            color: '#64748b',
            border: '1px solid #1e293b',
            borderRadius: 6,
            fontSize: 13,
            transition: 'all 0.15s',
          }}>
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main style={{
        flex: 1,
        minWidth: 0,
        padding: '40px 48px',
        background: '#f8fafc',
        overflowY: 'auto',
        minHeight: '100vh',
      }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
