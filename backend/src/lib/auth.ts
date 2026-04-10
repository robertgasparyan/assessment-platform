import crypto from "node:crypto";

const HASH_DELIMITER = ".";
const KEY_LENGTH = 64;

function pbkdf2(password: string, salt: string) {
  return crypto.pbkdf2Sync(password, salt, 100_000, KEY_LENGTH, "sha512").toString("hex");
}

export function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = pbkdf2(password, salt);
  return `${salt}${HASH_DELIMITER}${hash}`;
}

export function verifyPassword(password: string, storedHash: string) {
  const [salt, originalHash] = storedHash.split(HASH_DELIMITER);
  if (!salt || !originalHash) {
    return false;
  }

  const candidateHash = pbkdf2(password, salt);
  const originalBuffer = Buffer.from(originalHash, "hex");
  const candidateBuffer = Buffer.from(candidateHash, "hex");

  if (originalBuffer.length !== candidateBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(originalBuffer, candidateBuffer);
}

export function createSessionToken() {
  return crypto.randomBytes(48).toString("hex");
}
