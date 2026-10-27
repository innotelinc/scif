export type WrappedPrivateKey = { salt: string; iv: string; ciphertext: string };
export type Envelope = { ephemeralPublicKey: string; salt: string; iv: string; ciphertext: string };
export type Identity = { privateKey: CryptoKey; publicKey: string };
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const bytesToB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
const b64ToBytes = (value: string) => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')), (c) => c.charCodeAt(0));

const asBuffer = (bytes: Uint8Array): ArrayBuffer => bytes.slice().buffer as ArrayBuffer;

function requireCrypto(): SubtleCrypto {
  if (!globalThis.crypto?.subtle) throw new Error('Secure cryptography requires HTTPS or a native app build.');
  return crypto.subtle;
}

async function wrappingKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const subtle = requireCrypto();
  const material = await subtle.importKey('raw', asBuffer(encoder.encode(password)), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey({ name: 'PBKDF2', salt: asBuffer(salt), iterations: 310000, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function createIdentity(password: string): Promise<{ identity: Identity; wrappedPrivateKey: WrappedPrivateKey }> {
  const subtle = requireCrypto();
  const pair = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair;
  const privateBytes = new Uint8Array(await subtle.exportKey('pkcs8', pair.privateKey));
  const nonExtractablePrivateKey = await subtle.importKey('pkcs8', privateBytes, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  const publicBytes = new Uint8Array(await subtle.exportKey('raw', pair.publicKey));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await wrappingKey(password, salt);
  const ciphertext = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv: asBuffer(iv) }, key, asBuffer(privateBytes)));
  privateBytes.fill(0);
  return {
    identity: { privateKey: nonExtractablePrivateKey, publicKey: bytesToB64(publicBytes) },
    wrappedPrivateKey: { salt: bytesToB64(salt), iv: bytesToB64(iv), ciphertext: bytesToB64(ciphertext) }
  };
}

export async function unlockIdentity(password: string, publicKey: string, wrapped: WrappedPrivateKey): Promise<Identity> {
  const subtle = requireCrypto();
  const key = await wrappingKey(password, b64ToBytes(wrapped.salt));
  let raw: ArrayBuffer;
  try { raw = await subtle.decrypt({ name: 'AES-GCM', iv: asBuffer(b64ToBytes(wrapped.iv)) }, key, asBuffer(b64ToBytes(wrapped.ciphertext))); }
  catch { throw new Error('Could not unlock your account keys. Check your passphrase.'); }
  const privateKey = await subtle.importKey('pkcs8', raw, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  new Uint8Array(raw).fill(0);
  return { privateKey, publicKey };
}

async function envelopeFor(text: string, recipientPublicB64: string, aad: string): Promise<Envelope> {
  const subtle = requireCrypto();
  const ephemeral = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair;
  const recipient = await subtle.importKey('raw', asBuffer(b64ToBytes(recipientPublicB64)), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const secret = await subtle.deriveBits({ name: 'ECDH', public: recipient }, ephemeral.privateKey, 256);
  const material = await subtle.importKey('raw', secret, 'HKDF', false, ['deriveKey']);
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const key = await subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: asBuffer(salt), info: asBuffer(encoder.encode(`scif-dm-v1:${aad}`)) }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv: asBuffer(iv), additionalData: asBuffer(salt) }, key, asBuffer(encoder.encode(text))));
  const ephemeralPublicKey = new Uint8Array(await subtle.exportKey('raw', ephemeral.publicKey));
  return { ephemeralPublicKey: bytesToB64(ephemeralPublicKey), salt: bytesToB64(salt), iv: bytesToB64(iv), ciphertext: bytesToB64(ciphertext) };
}

export async function encryptForBoth(text: string, sender: Identity, recipientPublicKey: string, aad: string): Promise<{ envelopeSender: Envelope; envelopeRecipient: Envelope }> {
  const [envelopeSender, envelopeRecipient] = await Promise.all([
    envelopeFor(text, sender.publicKey, aad), envelopeFor(text, recipientPublicKey, aad)
  ]);
  return { envelopeSender, envelopeRecipient };
}

export async function decryptEnvelope(envelope: Envelope, identity: Identity, aad: string): Promise<string> {
  const subtle = requireCrypto();
  const saltB64 = envelope.salt;
  const ivB64 = envelope.iv;
  if (!saltB64 || !ivB64) throw new Error('Encrypted message envelope is invalid.');
  const ephemeralPublic = await subtle.importKey('raw', asBuffer(b64ToBytes(envelope.ephemeralPublicKey)), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const secret = await subtle.deriveBits({ name: 'ECDH', public: ephemeralPublic }, identity.privateKey, 256);
  const material = await subtle.importKey('raw', secret, 'HKDF', false, ['deriveKey']);
  const salt = b64ToBytes(saltB64);
  const key = await subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt, info: encoder.encode(`scif-dm-v1:${aad}`) }, material, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  try {
    const plaintext = await subtle.decrypt({ name: 'AES-GCM', iv: asBuffer(b64ToBytes(ivB64)), additionalData: asBuffer(salt) }, key, asBuffer(b64ToBytes(envelope.ciphertext)));
    return decoder.decode(plaintext);
  } catch { throw new Error('Message authentication failed. Verify this contact’s identity key.'); }
}

export async function fingerprint(publicKey: string): Promise<string> {
  const digest = new Uint8Array(await requireCrypto().digest('SHA-256', asBuffer(b64ToBytes(publicKey))));
  return Array.from(digest.slice(0, 16), (byte) => byte.toString(16).padStart(2, '0')).join('').match(/.{4}/g)!.join(' ');
}
