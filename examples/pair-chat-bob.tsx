/**
 * @stele-manifest
 * name: Pair Chat — Bob
 * version: 1.0.0
 * description: One half of a Tier 1 Strong paired chat. Open this file in one window and pair-chat-alice.tsx in another. They will discover each other via the Stele signaling server, establish a WebRTC data channel, and exchange end-to-end-encrypted messages — no central server sees the chat.
 * archetype: paired
 * pairing_id: stele-pair-chat-9695d62c48baa62b
 * partner_pubkey: MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQhsL1kEE/IPN9SOIYxVjjS5Oty6n1TrTEompmXCklpXviZ1gbdfcX25h3hGqKNjwj1YHpjXnJcGITWMO7LJFaQ==
 * private_key: MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQg0G2xAptvnghKmDsabSMsf96iK76pdBOrIkQIrrcGB2ahRANCAAThbxPzcPULqF1kPZqeIWpgwsEduWhsKGeeNevLOMwIPop+TVMjzqMdyv41KuQ+lnHKYNJwaKKHMpBJarniWXLA
 */

import { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    stele: {
      pair: {
        connect: () => Promise<{
          send: (data: string) => Promise<void>;
          close: () => Promise<void>;
          onMessage: (handler: (data: string) => void) => () => void;
          onStatusChange: (handler: (status: string) => void) => () => void;
          initialStatus?: string;
        }>;
      };
    };
  }
}

const ME = 'Bob';

interface ChatLine { from: 'me' | 'them' | 'system'; text: string; ts: number }

export default function PairChat() {
  const [status, setStatus] = useState('not connected');
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [draft, setDraft] = useState('');
  const connRef = useRef<Awaited<ReturnType<typeof window.stele.pair.connect>> | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStatus('connecting…');
    addLine('system', 'Connecting via signaling server…');

    window.stele.pair.connect().then((conn) => {
      if (cancelled) { conn.close(); return; }
      connRef.current = conn;
      setStatus(conn.initialStatus ?? 'connecting…');
      conn.onStatusChange((s) => { if (!cancelled) setStatus(s); });
      conn.onMessage((data) => { if (!cancelled) addLine('them', data); });
    }).catch((err) => {
      if (cancelled) return;
      setStatus('error');
      addLine('system', `connect failed: ${String(err)}`);
    });

    return () => {
      cancelled = true;
      try { connRef.current?.close(); } catch { /* swallow */ }
    };
  }, []);

  const addLine = (from: ChatLine['from'], text: string) => {
    setLines((prev) => [...prev, { from, text, ts: Date.now() }]);
  };

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || !connRef.current) return;
    try {
      await connRef.current.send(text);
      addLine('me', text);
      setDraft('');
    } catch (err) {
      addLine('system', `send failed: ${String(err)}`);
    }
  };

  const ready = status === 'connected';

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', maxWidth: 560, margin: '40px auto', padding: '0 20px', color: '#1e293b' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>Pair chat — {ME}</h1>
        <StatusPill status={status} />
      </div>
      <p style={{ color: '#64748b', fontSize: 13, lineHeight: 1.5, marginBottom: 16 }}>
        Open the partner artifact (<code>pair-chat-bob.tsx</code>) in another window or device.
        Both sides must be open at the same time to handshake. End-to-end encryption uses an
        ECDH-derived AES-GCM key — the Stele signaling server only sees the SDP envelope.
      </p>

      <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, height: 320, overflowY: 'auto', padding: 12, background: '#f8fafc', marginBottom: 12 }}>
        {lines.length === 0 ? (
          <div style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', marginTop: 130 }}>
            (no messages yet)
          </div>
        ) : lines.map((line) => (
          <div key={line.ts} style={{ display: 'flex', justifyContent: line.from === 'me' ? 'flex-end' : line.from === 'them' ? 'flex-start' : 'center', marginBottom: 6 }}>
            <div style={{
              padding: '6px 12px',
              borderRadius: 12,
              fontSize: 13,
              maxWidth: '75%',
              background: line.from === 'me' ? '#3b82f6' : line.from === 'them' ? '#e2e8f0' : 'transparent',
              color: line.from === 'me' ? 'white' : line.from === 'them' ? '#0f172a' : '#94a3b8',
              fontStyle: line.from === 'system' ? 'italic' : 'normal',
              fontFamily: line.from === 'system' ? 'ui-monospace, monospace' : 'inherit',
            }}>
              {line.text}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          disabled={!ready}
          placeholder={ready ? 'Say something…' : 'Waiting for partner…'}
          style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14, outline: 'none' }}
        />
        <button
          onClick={handleSend}
          disabled={!ready || !draft.trim()}
          style={{
            padding: '10px 20px',
            borderRadius: 8,
            border: 'none',
            background: ready && draft.trim() ? '#3b82f6' : '#cbd5e1',
            color: 'white',
            fontSize: 14,
            fontWeight: 600,
            cursor: ready && draft.trim() ? 'pointer' : 'not-allowed',
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const theme = status === 'connected'
    ? { bg: '#dcfce7', color: '#166534' }
    : status === 'error' || status === 'disconnected'
      ? { bg: '#fee2e2', color: '#991b1b' }
      : { bg: '#fef3c7', color: '#92400e' };
  return (
    <span style={{ background: theme.bg, color: theme.color, padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, fontFamily: 'ui-monospace, monospace' }}>
      {status}
    </span>
  );
}
