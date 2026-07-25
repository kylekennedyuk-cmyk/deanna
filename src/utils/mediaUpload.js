const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { prisma } = require('../config/database');

const uploadDirectory = path.join(__dirname, '..', '..', 'public', 'uploads');
fs.mkdirSync(uploadDirectory, { recursive: true });

const mediaUpload = multer({
  storage: multer.diskStorage({
    destination: uploadDirectory,
    filename: (req, file, callback) => {
      const extension = path.extname(file.originalname).toLowerCase();
      const base = path
        .basename(file.originalname, extension)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 60);
      callback(null, `${Date.now()}-${base || 'image'}${extension}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']);
    if (!allowed.has(file.mimetype)) {
      return callback(new Error('Only JPG, PNG, WebP, GIF and SVG images are accepted.'));
    }
    return callback(null, true);
  },
});

function wantsJson(req) {
  const accept = String(req.get('accept') || '');
  return (
    req.xhr ||
    accept.includes('application/json') ||
    String(req.query.format || '') === 'json' ||
    String(req.get('x-requested-with') || '').toLowerCase() === 'xmlhttprequest'
  );
}

async function createMediaFromUpload(req) {
  if (!req.file) {
    const error = new Error('Choose an image to upload.');
    error.status = 400;
    throw error;
  }

  return prisma.media.create({
    data: {
      url: `/uploads/${req.file.filename}`,
      alt: req.body.alt ? String(req.body.alt).trim() : null,
      caption: req.body.caption ? String(req.body.caption).trim() : null,
      folder: req.body.folder ? String(req.body.folder).trim() : 'General',
    },
  });
}

function jsonUploadHandler(req, res, next) {
  mediaUpload.single('image')(req, res, async (uploadError) => {
    if (uploadError) {
      return res.status(400).json({ ok: false, error: uploadError.message });
    }
    try {
      const item = await createMediaFromUpload(req);
      return res.json({
        ok: true,
        id: item.id,
        url: item.url,
        alt: item.alt || '',
        caption: item.caption || '',
        folder: item.folder || 'General',
      });
    } catch (err) {
      if (err.status === 400) {
        return res.status(400).json({ ok: false, error: err.message });
      }
      return next(err);
    }
  });
}

async function listMediaJson(_req, res, next) {
  try {
    const media = await prisma.media.findMany({
      orderBy: [{ folder: 'asc' }, { uploadedAt: 'desc' }],
      select: {
        id: true,
        url: true,
        alt: true,
        caption: true,
        folder: true,
        uploadedAt: true,
      },
    });
    return res.json({ ok: true, media });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  uploadDirectory,
  mediaUpload,
  wantsJson,
  createMediaFromUpload,
  jsonUploadHandler,
  listMediaJson,
};
