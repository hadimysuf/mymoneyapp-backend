const crypto = require('crypto');
const { normalizeString } = require('./common');

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const passwordHash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${passwordHash}`;
}

function verifyPassword(password, storedHash) {
  const normalizedHash = normalizeString(storedHash);
  const [salt, hash] = normalizedHash.split(':');

  if (!salt || !hash) {
    return false;
  }

  const derivedHash = crypto.scryptSync(password, salt, 64);
  const storedBuffer = Buffer.from(hash, 'hex');

  if (storedBuffer.length !== derivedHash.length) {
    return false;
  }

  return crypto.timingSafeEqual(storedBuffer, derivedHash);
}

module.exports = {
  hashPassword,
  verifyPassword
};
