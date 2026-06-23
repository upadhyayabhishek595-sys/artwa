// config/encryption.js
// AES-256-GCM encryption for WhatsApp access tokens at rest.
// Set ENCRYPTION_KEY in .env — must be 64 hex chars (32 bytes).

const crypto = require('crypto');

const ALGO    = 'aes-256-gcm';
const KEY_HEX = process.env.ENCRYPTION_KEY;

function getKey() {
  if (!KEY_HEX || KEY_HEX.length !== 64)
    throw new Error('ENCRYPTION_KEY must be 64 hex characters (32 bytes). Generate: openssl rand -hex 32');
  return Buffer.from(KEY_HEX, 'hex');
}

/**
 * Encrypt a plaintext string.
 * Returns "iv:authTag:ciphertext" (all hex), safe to store in VARCHAR(255).
 */
function encrypt(plaintext) {
  if (!plaintext) return null;
  const key = getKey();
  const iv  = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc  = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag  = cipher.getAuthTag();
  return [iv.toString('hex'), tag.toString('hex'), enc.toString('hex')].join(':');
}

/**
 * Decrypt a value produced by encrypt().
 */
function decrypt(stored) {
  if (!stored) return null;
  const key = getKey();
  const [ivHex, tagHex, encHex] = stored.split(':');
  const iv      = Buffer.from(ivHex,  'hex');
  const tag     = Buffer.from(tagHex, 'hex');
  const encData = Buffer.from(encHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encData), decipher.final()]).toString('utf8');
}

module.exports = { encrypt, decrypt };