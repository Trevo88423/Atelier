/**
 * Capability consent dialog.
 *
 * Shown when an artifact's manifest declares capabilities that the user
 * hasn't granted for this artifact yet. User can Allow (persists) or Block
 * (artifact runs with no granted capabilities — presentation-only fallback).
 */

import { CAPABILITY_LABELS, capabilityId, type Capability, type Manifest } from '../runtime/manifest';

interface PermissionDialogProps {
  manifest: Manifest;
  /** Capabilities declared in the manifest that are NOT yet granted. */
  pending: Capability[];
  onAllow: () => void;
  onBlock: () => void;
}

export default function PermissionDialog({ manifest, pending, onAllow, onBlock }: PermissionDialogProps) {
  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      background: 'rgba(2, 6, 23, 0.85)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
      backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        background: '#0f172a',
        border: '1px solid #334155',
        borderRadius: '12px',
        padding: '28px',
        width: '480px',
        maxWidth: 'calc(100vw - 48px)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        <div style={{ marginBottom: '20px' }}>
          <div style={{
            fontSize: '11px',
            fontWeight: 600,
            color: '#94a3b8',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            marginBottom: '6px',
          }}>
            Permission required
          </div>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 600, color: '#e2e8f0' }}>
            {manifest.name}
          </h2>
          {manifest.author && (
            <div style={{ marginTop: '4px', fontSize: '13px', color: '#94a3b8' }}>
              by {manifest.author}
              {!isTrustedAuthor(manifest.author) && (
                <span style={{ marginLeft: '8px', color: '#f59e0b', fontSize: '11px' }}>
                  · unverified
                </span>
              )}
            </div>
          )}
          {manifest.description && (
            <div style={{ marginTop: '10px', fontSize: '13px', color: '#cbd5e1', lineHeight: 1.5 }}>
              {manifest.description}
            </div>
          )}
        </div>

        <div style={{
          background: '#1e293b',
          border: '1px solid #334155',
          borderRadius: '8px',
          padding: '14px 16px',
          marginBottom: '20px',
        }}>
          <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '10px' }}>
            This artifact is asking for:
          </div>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {pending.map(cap => (
              <li
                key={capabilityId(cap)}
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: '8px',
                  fontSize: '13px',
                  color: '#e2e8f0',
                }}
              >
                <span style={{ color: '#3b82f6', fontSize: '14px' }}>•</span>
                <span>
                  {CAPABILITY_LABELS[cap.kind]}
                  {cap.kind === 'network' && (
                    <span style={{ color: '#94a3b8', fontFamily: 'monospace', fontSize: '12px' }}>
                      {' '}— {cap.origin}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div style={{
          fontSize: '12px',
          color: '#64748b',
          marginBottom: '20px',
          lineHeight: 1.5,
        }}>
          Stele runs this artifact in a sandbox. Granting permission lets it use these
          specific capabilities; it still cannot read your files, cookies, or other artifacts' data.
          You can revoke access any time in Settings.
        </div>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button
            onClick={onBlock}
            style={{
              padding: '8px 18px',
              borderRadius: '8px',
              border: '1px solid #334155',
              background: 'transparent',
              color: '#94a3b8',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Block
          </button>
          <button
            onClick={onAllow}
            style={{
              padding: '8px 20px',
              borderRadius: '8px',
              border: 'none',
              background: '#3b82f6',
              color: 'white',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Allow
          </button>
        </div>
      </div>
    </div>
  );
}

/** Placeholder — later becomes a signed-author check. */
function isTrustedAuthor(_author: string): boolean {
  return false;
}
