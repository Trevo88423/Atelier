/**
 * @stele-manifest
 * name: Site Pre-Start Check
 * version: 0.1.0
 * author: TPB Kitchens
 * description: Daily site safety check — records location, photo, and sign-off, submits to site office.
 * requires:
 *   - geolocation
 *   - camera
 *   - network: https://httpbin.org
 */

import { useState, useEffect } from 'react';

interface Coords { lat: number; lon: number; accuracy: number }

export default function PreStartCheck() {
  const [worker, setWorker] = useState('');
  const [checks, setChecks] = useState({
    ppe: false,
    tools: false,
    hazards: false,
    firstAid: false,
    swms: false,
  });
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [coordsError, setCoordsError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<{ id: string; at: string } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) {
      setCoordsError('Geolocation not supported');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => setCoords({
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      }),
      err => setCoordsError(err.message),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }, []);

  async function capturePhoto() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      const video = document.createElement('video');
      video.srcObject = stream;
      await video.play();
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d')!.drawImage(video, 0, 0);
      stream.getTracks().forEach(t => t.stop());
      setPhotoDataUrl(canvas.toDataURL('image/jpeg', 0.7));
    } catch (err) {
      alert('Camera error: ' + (err instanceof Error ? err.message : String(err)));
    }
  }

  const allChecked = Object.values(checks).every(Boolean);
  const canSubmit = worker.trim() && allChecked && coords && photoDataUrl && !submitting;

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload = {
        worker: worker.trim(),
        checks,
        coords,
        photo: photoDataUrl,
        submittedAt: new Date().toISOString(),
      };
      // httpbin.org/post echoes the request back — stand-in for a real webhook.
      const resp = await fetch('https://httpbin.org/post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      setSubmitted({ id: Math.random().toString(36).slice(2, 10), at: payload.submittedAt });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div style={{ padding: '32px', maxWidth: '520px', margin: '0 auto', fontFamily: 'system-ui' }}>
        <div style={{ fontSize: '48px', textAlign: 'center', marginBottom: '16px' }}>✓</div>
        <h2 style={{ margin: '0 0 8px', textAlign: 'center' }}>Check submitted</h2>
        <div style={{ color: '#64748b', fontSize: '14px', textAlign: 'center' }}>
          Confirmation: <code>{submitted.id}</code>
        </div>
        <div style={{ color: '#64748b', fontSize: '12px', textAlign: 'center', marginTop: '4px' }}>
          {new Date(submitted.at).toLocaleString()}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', maxWidth: '560px', margin: '0 auto', fontFamily: 'system-ui', color: '#1e293b' }}>
      <h1 style={{ fontSize: '22px', margin: '0 0 4px' }}>Site Pre-Start Check</h1>
      <div style={{ color: '#64748b', fontSize: '13px', marginBottom: '24px' }}>
        Complete before starting work on site.
      </div>

      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Worker name</label>
      <input
        value={worker}
        onChange={e => setWorker(e.target.value)}
        placeholder="Your name"
        style={{
          width: '100%', padding: '10px 12px', fontSize: '15px',
          border: '1px solid #cbd5e1', borderRadius: '8px', marginBottom: '20px',
          boxSizing: 'border-box',
        }}
      />

      <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '10px', marginBottom: '20px' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '10px' }}>Safety checks</div>
        {[
          ['ppe', 'PPE worn and fit for task'],
          ['tools', 'Tools inspected, no damage'],
          ['hazards', 'Site hazards identified and reviewed'],
          ['firstAid', 'First-aid kit location known'],
          ['swms', 'SWMS reviewed and signed'],
        ].map(([key, label]) => (
          <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0', fontSize: '14px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={(checks as Record<string, boolean>)[key]}
              onChange={e => setChecks(c => ({ ...c, [key]: e.target.checked }))}
              style={{ width: '18px', height: '18px' }}
            />
            {label}
          </label>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
        <div style={{ flex: 1, background: '#f8fafc', padding: '12px', borderRadius: '10px' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>
            Location
          </div>
          {coords ? (
            <div style={{ fontSize: '12px', fontFamily: 'monospace', color: '#1e293b' }}>
              {coords.lat.toFixed(5)}, {coords.lon.toFixed(5)}
              <div style={{ color: '#64748b', fontSize: '11px' }}>±{Math.round(coords.accuracy)}m</div>
            </div>
          ) : coordsError ? (
            <div style={{ fontSize: '12px', color: '#ef4444' }}>{coordsError}</div>
          ) : (
            <div style={{ fontSize: '12px', color: '#64748b' }}>Locating…</div>
          )}
        </div>

        <div style={{ flex: 1, background: '#f8fafc', padding: '12px', borderRadius: '10px' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>
            Site photo
          </div>
          {photoDataUrl ? (
            <img src={photoDataUrl} alt="site" style={{ width: '100%', maxHeight: '80px', objectFit: 'cover', borderRadius: '4px' }} />
          ) : (
            <button
              onClick={capturePhoto}
              style={{
                padding: '6px 12px', fontSize: '12px', borderRadius: '6px',
                border: '1px solid #cbd5e1', background: 'white', cursor: 'pointer',
              }}
            >
              Take photo
            </button>
          )}
        </div>
      </div>

      {submitError && (
        <div style={{ padding: '10px 14px', background: '#fef2f2', color: '#991b1b', borderRadius: '8px', fontSize: '13px', marginBottom: '16px' }}>
          Submit failed: {submitError}
        </div>
      )}

      <button
        onClick={submit}
        disabled={!canSubmit}
        style={{
          width: '100%', padding: '14px', fontSize: '15px', fontWeight: 600,
          borderRadius: '10px', border: 'none',
          background: canSubmit ? '#0f766e' : '#cbd5e1',
          color: 'white',
          cursor: canSubmit ? 'pointer' : 'not-allowed',
        }}
      >
        {submitting ? 'Submitting…' : 'Submit Check'}
      </button>
    </div>
  );
}
