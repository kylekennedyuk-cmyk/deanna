const crypto = require('crypto');
const { prisma } = require('./database');

const ENCRYPTED_PREFIX = 'enc:v1:';

function encryptionKey() {
  return crypto
    .createHash('sha256')
    .update(process.env.SETTINGS_ENCRYPTION_KEY || process.env.SESSION_SECRET || 'development-only')
    .digest();
}

function encryptSecret(value) {
  if (!value) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENCRYPTED_PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

function decryptSecret(value) {
  if (!value) return '';
  if (!String(value).startsWith(ENCRYPTED_PREFIX)) return String(value);

  try {
    const [ivValue, tagValue, encryptedValue] = String(value).split(':').slice(2);
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      encryptionKey(),
      Buffer.from(ivValue, 'base64')
    );
    decipher.setAuthTag(Buffer.from(tagValue, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return '';
  }
}

async function getSettings() {
  const rows = await prisma.siteSetting.findMany();
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

async function setSetting(key, value) {
  return prisma.siteSetting.upsert({
    where: { key },
    update: { value: String(value ?? '') },
    create: { key, value: String(value ?? '') },
  });
}

async function setSettings(values) {
  return Promise.all(
    Object.entries(values).map(([key, value]) => setSetting(key, value))
  );
}

module.exports = {
  decryptSecret,
  encryptSecret,
  getSettings,
  setSetting,
  setSettings,
};
