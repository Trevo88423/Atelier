/**
 * @stele-manifest
 * name: Pair Crypto Test
 * version: 1.0.0
 * description: Encrypts a string with the paired ECDH-derived key and decrypts it back. Verifies that ciphertext bytes are different from plaintext (no accidental passthrough) and that the round-trip recovers the original message.
 * archetype: paired
 * pairing_id: stele-pair-crypto-test-001
 * partner_pubkey: MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE4A7CfNHC6MQ46Zg6d2wVjkaDBYi5VUTk3N+ptP1gCQZNbVXMpb5aj4G38YSG+E80xMDf51wA/Gqg4Qew4TGnew==
 * private_key: MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgv6ggtWh5GBDM4zy711fWou4xlAv7IOiCal+lQCutWqyhRANCAAT5ulpQNFNh4sB+tOZeNu7FFFtqYZphR/ai+6+T4tpxFEc0jF5RxFDNoAXmMGezdr7qJtt5jcsD0+jrjo8yVMkz
 */

import { useState, useEffect } from 'react';

declare global {
  interface Window {
    stele: {
      pair: {
        encrypt: (plaintext: string) => Promise<{ ciphertext: string; iv: string }>;
        decrypt: (ciphertext: string, iv: string) => Promise<string>;
      };
    };
  }
}

type Status = 'pending' | 'pass' | 'fail';
interface Result { status: Status; detail: string }
const PENDING: Result = { status: 'pending', detail: 'Running…' };

function Row({ name, status, detail }: { name: string } & Result) {
  const color = status === 'pass' ? '#16a34a' : status === 'fail' ? '#dc2626' : '#64748b';
  const emoji = status === 'pass' ? '✅' : status === 'fail' ? '❌' : '⏳';
  return (
    <div style={{ padding: '14px 16px', borderBottom: '1px solid #e2e8f0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <span style={{ fontSize: 20 }}>{emoji}</span>
        <div style={{ fontWeight: 500 }}>{name}</div>
      </div>
      <div style={{ fontSize: 12, color, paddingLeft: 30, fontFamily: 'ui-monospace, monospace', wordBreak: 'break-all' }}>{detail}</div>
    </div>
  );
}

export default function PairCryptoTest() {
  const [encryptResult, setEncryptResult] = useState<Result>(PENDING);
  const [roundTrip, setRoundTrip] = useState<Result>(PENDING);
  const [tamperResult, setTamperResult] = useState<Result>(PENDING);
  const [details, setDetails] = useState<{ ciphertext?: string; iv?: string }>({});

  useEffect(() => {
    (async () => {
      const plaintext = `hello, paired world — ${Date.now()}`;

      let ciphertext = '';
      let iv = '';

      // Test 1 — encrypt produces non-trivial ciphertext.
      try {
        const result = await window.stele.pair.encrypt(plaintext);
        ciphertext = result.ciphertext;
        iv = result.iv;
        setDetails({ ciphertext, iv });
        const looksRandom = ciphertext.length > 16 && !atob(ciphertext).includes(plaintext);
        setEncryptResult(looksRandom
          ? { status: 'pass', detail: `${ciphertext.length} chars of ciphertext (base64), iv ${iv.length} chars` }
          : { status: 'fail', detail: 'Ciphertext too short or contains plaintext bytes — encryption no-op?' });
      } catch (err) {
        setEncryptResult({ status: 'fail', detail: String(err) });
        return;
      }

      // Test 2 — decrypt with the right ciphertext + iv recovers the original plaintext.
      try {
        const recovered = await window.stele.pair.decrypt(ciphertext, iv);
        setRoundTrip(recovered === plaintext
          ? { status: 'pass', detail: `recovered: "${recovered}"` }
          : { status: 'fail', detail: `expected "${plaintext}", got "${recovered}"` });
      } catch (err) {
        setRoundTrip({ status: 'fail', detail: String(err) });
      }

      // Test 3 — tampered ciphertext fails the AES-GCM auth tag check.
      try {
        // Flip a byte in the middle of the ciphertext.
        const bytes = Uint8Array.from(atob(ciphertext), (c) => c.charCodeAt(0));
        const mid = Math.floor(bytes.length / 2);
        bytes[mid] = bytes[mid] ^ 0xff;
        let tampered = '';
        for (let i = 0; i < bytes.length; i++) tampered += String.fromCharCode(bytes[i]);
        const tamperedB64 = btoa(tampered);
        try {
          await window.stele.pair.decrypt(tamperedB64, iv);
          setTamperResult({ status: 'fail', detail: 'tampered ciphertext decrypted without throwing — auth tag broken' });
        } catch {
          setTamperResult({ status: 'pass', detail: 'tampered ciphertext rejected (AES-GCM auth tag held)' });
        }
      } catch (err) {
        setTamperResult({ status: 'fail', detail: `setup error: ${String(err)}` });
      }
    })();
  }, []);

  const allPass = [encryptResult, roundTrip, tamperResult].every((r) => r.status === 'pass');
  const anyFail = [encryptResult, roundTrip, tamperResult].some((r) => r.status === 'fail');

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', maxWidth: 720, margin: '40px auto', padding: '0 20px', color: '#1e293b' }}>
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>Tier 1 paired crypto test</h1>
      <p style={{ color: '#64748b', lineHeight: 1.5, marginBottom: 24 }}>
        Encrypts and decrypts a fresh string via the ECDH-derived shared key declared
        in this artifact's manifest. Same artifact does both halves so the same shared
        key is used — a real paired artifact would have the partner on the other end.
      </p>

      <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', background: 'white' }}>
        <Row name="encrypt produces non-trivial ciphertext" {...encryptResult} />
        <Row name="encrypt → decrypt round-trip recovers the plaintext" {...roundTrip} />
        <Row name="tampered ciphertext fails AES-GCM auth tag" {...tamperResult} />
      </div>

      <div style={{
        marginTop: 20, padding: '12px 16px', borderRadius: 8, fontWeight: 500,
        background: allPass ? '#dcfce7' : anyFail ? '#fee2e2' : '#f1f5f9',
        color: allPass ? '#166534' : anyFail ? '#991b1b' : '#475569',
      }}>
        {allPass ? 'All checks passed — Tier 1 paired crypto pipeline is solid.'
          : anyFail ? 'One or more checks failed — investigate.'
          : 'Running…'}
      </div>

      {details.ciphertext && (
        <details style={{ marginTop: 20, fontSize: 12, color: '#475569' }}>
          <summary style={{ cursor: 'pointer' }}>Show ciphertext + iv</summary>
          <pre style={{ background: '#0f172a', color: '#e2e8f0', padding: 14, borderRadius: 8, marginTop: 8, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{`ciphertext (base64): ${details.ciphertext}\niv (base64):         ${details.iv}`}</pre>
        </details>
      )}
    </div>
  );
}
