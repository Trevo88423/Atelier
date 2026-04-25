/**
 * Tier 1 paired-artifact cryptography.
 *
 * Each paired artifact carries its own ECDH P-256 private key plus the
 * partner artifact's public key. Both sides derive the same AES-256-GCM
 * shared key via ECDH and use it to encrypt and decrypt payloads.
 *
 * This is the "Simple" Tier 1 design from STELE-BUILD §11: anyone holding
 * a single artifact can derive the shared key and decrypt locally — useful
 * for casual two-party use cases (games, journals, dual-signature notes).
 * It does NOT defend against an attacker with both files. Stronger tiers
 * (key-fragment server, hardware-backed) come later.
 *
 * The artifact never sees raw key material; encrypt/decrypt run in the host
 * and are exposed via window.stele.pair.{encrypt,decrypt} over RPC.
 */

const SUBTLE: SubtleCrypto = (globalThis.crypto ?? (globalThis as unknown as { msCrypto?: Crypto }).msCrypto)?.subtle as SubtleCrypto;

if (!SUBTLE) {
  throw new Error('Web Crypto SubtleCrypto is unavailable in this environment.');
}

const ECDH_PARAMS: EcKeyImportParams = { name: 'ECDH', namedCurve: 'P-256' };
const AES_PARAMS = { name: 'AES-GCM', length: 256 } as const;

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  // Allocate an explicit ArrayBuffer (not ArrayBufferLike) so the result
  // satisfies BufferSource for the Web Crypto SubtleCrypto methods.
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes as Uint8Array<ArrayBuffer>;
}

function bytesToBase64(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]);
  return btoa(binary);
}

export async function importPrivateKey(base64Pkcs8: string): Promise<CryptoKey> {
  return SUBTLE.importKey('pkcs8', base64ToBytes(base64Pkcs8), ECDH_PARAMS, false, ['deriveKey']);
}

export async function importPublicKey(base64Spki: string): Promise<CryptoKey> {
  return SUBTLE.importKey('spki', base64ToBytes(base64Spki), ECDH_PARAMS, false, []);
}

export async function deriveSharedAesKey(privateKey: CryptoKey, publicKey: CryptoKey): Promise<CryptoKey> {
  return SUBTLE.deriveKey(
    { name: 'ECDH', public: publicKey },
    privateKey,
    AES_PARAMS,
    false,
    ['encrypt', 'decrypt'],
  );
}

export interface PairCiphertext {
  ciphertext: string; // base64
  iv: string;         // base64
}

export async function encryptWithSharedKey(key: CryptoKey, plaintext: string): Promise<PairCiphertext> {
  const ivBuffer = new ArrayBuffer(12);
  const iv = new Uint8Array(ivBuffer) as Uint8Array<ArrayBuffer>;
  crypto.getRandomValues(iv);
  const data = new TextEncoder().encode(plaintext);
  const ct = await SUBTLE.encrypt({ name: 'AES-GCM', iv }, key, data);
  return { ciphertext: bytesToBase64(ct), iv: bytesToBase64(iv) };
}

export async function decryptWithSharedKey(key: CryptoKey, ciphertextB64: string, ivB64: string): Promise<string> {
  const iv = base64ToBytes(ivB64);
  const data = base64ToBytes(ciphertextB64);
  const pt = await SUBTLE.decrypt({ name: 'AES-GCM', iv }, key, data);
  return new TextDecoder().decode(pt);
}

/**
 * Convenience: full pipeline from manifest fields → derived AES-GCM key.
 * Hosts can cache the result per artifact id since manifest fields don't
 * change without an artifact reload.
 */
export async function deriveSharedKeyFromBase64(
  privateKeyPkcs8: string,
  partnerPublicKeySpki: string,
): Promise<CryptoKey> {
  const [priv, pub] = await Promise.all([
    importPrivateKey(privateKeyPkcs8),
    importPublicKey(partnerPublicKeySpki),
  ]);
  return deriveSharedAesKey(priv, pub);
}
