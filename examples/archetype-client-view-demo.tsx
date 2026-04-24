/**
 * @stele-manifest
 * name: Client-View Demo
 * version: 1.0.0
 * description: Placeholder artifact that declares the client-view archetype so you can see the blue viewer badge. No handshake behaviour yet — that ships with the v0.3 Archetype B protocol.
 * archetype: client-view
 * server: https://api.example.com
 */

export default function ClientViewDemo() {
  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', maxWidth: 640, margin: '40px auto', padding: '0 20px', color: '#1e293b' }}>
      <div style={{
        display: 'inline-block',
        fontSize: 11,
        padding: '3px 8px',
        borderRadius: 4,
        background: '#0f1e3a',
        color: '#93c5fd',
        border: '1px solid #1e3a8a',
        fontWeight: 500,
        marginBottom: 16,
      }}>
        client view · api.example.com
      </div>

      <h1 style={{ fontSize: 22, marginBottom: 8 }}>Archetype B demo</h1>
      <p style={{ color: '#64748b', lineHeight: 1.6 }}>
        This artifact declares <code>archetype: client-view</code> and a <code>server:</code>
        endpoint. The viewer header should show the blue badge with the server host.
      </p>
      <p style={{ color: '#64748b', lineHeight: 1.6 }}>
        The Archetype B runtime — token handshake, server API surface, auth injection — is
        the next v0.3 piece. Until then this artifact has no live server behaviour; it just
        exercises the manifest parser and the transparency UI.
      </p>
    </div>
  );
}
