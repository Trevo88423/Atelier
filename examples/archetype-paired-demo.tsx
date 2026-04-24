/**
 * @stele-manifest
 * name: Paired Demo
 * version: 1.0.0
 * description: Placeholder artifact that declares the paired archetype so you can see the purple viewer badge. Pairing keys are fake — cryptographic runtime ships later.
 * archetype: paired
 * pairing_id: demo-pair-0001
 * partner_pubkey: MCowBQYDK2VwAyEAzK5rQ3rJ2fV8uWbDqYp9VxH4kL6mN8oPqRsTuVwXyZ0=
 */

export default function PairedDemo() {
  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', maxWidth: 640, margin: '40px auto', padding: '0 20px', color: '#1e293b' }}>
      <div style={{
        display: 'inline-block',
        fontSize: 11,
        padding: '3px 8px',
        borderRadius: 4,
        background: '#1f0f3a',
        color: '#c4b5fd',
        border: '1px solid #4c1d95',
        fontWeight: 500,
        marginBottom: 16,
      }}>
        paired
      </div>

      <h1 style={{ fontSize: 22, marginBottom: 8 }}>Archetype C demo</h1>
      <p style={{ color: '#64748b', lineHeight: 1.6 }}>
        This artifact declares <code>archetype: paired</code> with a <code>pairing_id</code>
        and a fake <code>partner_pubkey</code>. The viewer header should show the purple
        badge.
      </p>
      <p style={{ color: '#64748b', lineHeight: 1.6 }}>
        The paired runtime — ECDH key derivation, WebRTC connection to the partner artifact,
        signaling server — is a v0.4+ piece. Today this artifact just proves the manifest
        parser recognises the archetype and the viewer surfaces it.
      </p>
    </div>
  );
}
