import { useState, useEffect } from 'react';

type Theme = 'dark' | 'light' | 'system';

function getStoredTheme(): Theme {
  return (localStorage.getItem('atelier:theme') as Theme) || 'dark';
}

export default function Settings() {
  const [theme, setTheme] = useState<Theme>(getStoredTheme);

  useEffect(() => {
    localStorage.setItem('atelier:theme', theme);
  }, [theme]);

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div style={{
      background: '#1e293b',
      borderRadius: '12px',
      padding: '20px 24px',
      border: '1px solid #334155',
      marginBottom: '16px',
    }}>
      <h2 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: 600, color: '#e2e8f0' }}>
        {title}
      </h2>
      {children}
    </div>
  );

  const RadioOption = ({ label, value, current, onChange }: {
    label: string; value: string; current: string; onChange: (v: any) => void;
  }) => (
    <label style={{
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      padding: '8px 0',
      cursor: 'pointer',
      fontSize: '14px',
      color: value === current ? '#e2e8f0' : '#94a3b8',
    }}>
      <div style={{
        width: '18px',
        height: '18px',
        borderRadius: '50%',
        border: `2px solid ${value === current ? '#3b82f6' : '#475569'}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {value === current && (
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#3b82f6' }} />
        )}
      </div>
      {label}
    </label>
  );

  return (
    <div style={{ padding: '24px', flex: 1, overflow: 'auto', maxWidth: '640px' }}>
      <h1 style={{ margin: '0 0 24px', fontSize: '22px', fontWeight: 700, color: '#e2e8f0' }}>
        Settings
      </h1>

      <Section title="Appearance">
        <RadioOption label="Dark" value="dark" current={theme} onChange={setTheme} />
        <RadioOption label="Light" value="light" current={theme} onChange={setTheme} />
        <RadioOption label="System" value="system" current={theme} onChange={setTheme} />
        <div style={{ marginTop: '8px', fontSize: '12px', color: '#475569' }}>
          Theme switching will be fully implemented in a future release.
        </div>
      </Section>

      <Section title="Watched Folders">
        <div style={{ color: '#94a3b8', fontSize: '14px' }}>
          No watched folders configured.
        </div>
        <div style={{ marginTop: '8px', fontSize: '12px', color: '#475569' }}>
          Watched folders will auto-import new artifacts. Coming soon.
        </div>
      </Section>

      <Section title="File Associations">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {['jsx', 'tsx', 'html', 'svg', 'md', 'mermaid'].map(ext => (
            <span key={ext} style={{
              padding: '4px 10px',
              borderRadius: '6px',
              background: '#0f172a',
              border: '1px solid #334155',
              fontSize: '13px',
              color: '#94a3b8',
            }}>
              .{ext}
            </span>
          ))}
        </div>
        <div style={{ marginTop: '8px', fontSize: '12px', color: '#475569' }}>
          File associations are registered at install time via Tauri.
        </div>
      </Section>

      <Section title="About">
        <div style={{ fontSize: '14px', color: '#94a3b8', lineHeight: 1.8 }}>
          <div><strong style={{ color: '#e2e8f0' }}>Atelier</strong> v0.1.0-alpha</div>
          <div>The player for what Claude builds.</div>
          <div style={{ marginTop: '8px', fontSize: '12px', color: '#475569' }}>
            Built with Tauri, React, and esbuild-wasm.
          </div>
        </div>
      </Section>
    </div>
  );
}
