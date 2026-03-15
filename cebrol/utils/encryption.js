/**
 * AES-256-CBC file encryption/decryption helpers.
 *
 * Uses `CEB_ENCRYPTION_SECRET` env var (32-char / 256-bit hex key).
 * A random 16-byte IV is generated per encryption and returned alongside
 * the ciphertext so it can be stored in the database.
 *
 * NOTE: DO NOT store the secret key in the database — only the IV.
 */
import crypto from "crypto";

const ALGORITHM = "aes-256-cbc";
const KEY_LEN   = 32; // 256 bits

/**
 * Returns the 32-byte Buffer key derived from CEB_ENCRYPTION_SECRET.
 */
function getKey() {
  const secret = process.env.CEB_ENCRYPTION_SECRET ?? "";
  if (!secret) {
    throw new Error("CEB_ENCRYPTION_SECRET environment variable is not set.");
  }
  // Derive a fixed-length key via SHA-256 so any secret length works.
  return crypto.createHash("sha256").update(secret).digest();
}

/**
 * Encrypt a Buffer.
 * @param {Buffer} buffer
 * @returns {{ cipher: Buffer, iv: string }}  cipher is the encrypted bytes; iv is hex.
 */
export function encryptBuffer(buffer) {
  const key = getKey();
  const iv  = crypto.randomBytes(16);
  const ciph = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([ciph.update(buffer), ciph.final()]);
  return { cipher: encrypted, iv: iv.toString("hex") };
}

/**
 * Decrypt a Buffer.
 * @param {Buffer} cipher
 * @param {string} ivHex  — hex string stored in the DB
 * @returns {Buffer}
 */
export function decryptBuffer(cipher, ivHex) {
  const key  = getKey();
  const iv   = Buffer.from(ivHex, "hex");
  const dec  = crypto.createDecipheriv(ALGORITHM, key, iv);
  return Buffer.concat([dec.update(cipher), dec.final()]);
}
