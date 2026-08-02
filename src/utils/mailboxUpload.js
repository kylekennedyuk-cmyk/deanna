const path = require('path');
const multer = require('multer');

const MAX_FILES = 5;
const MAX_FILE_SIZE = 10 * 1024 * 1024;

const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/x-zip-compressed',
  'application/octet-stream',
]);

const ALLOWED_EXT = new Set([
  '.pdf',
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.txt',
  '.csv',
  '.zip',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: MAX_FILES,
  },
  fileFilter: (req, file, callback) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      return callback(
        new Error('That file type is not allowed. Use PDF, images, Office docs, text, or zip.')
      );
    }
    const mime = String(file.mimetype || '').toLowerCase();
    // Browsers often send odd/empty MIME; extension is the gate. Reject only clearly bad types.
    if (mime && !ALLOWED_MIME.has(mime) && mime !== 'application/octet-stream') {
      // Still allow known extensions — many Office/ZIP uploads arrive with vendor-specific MIME.
      if (!mime.startsWith('image/') && !mime.startsWith('text/') && !mime.startsWith('application/')) {
        return callback(
          new Error('That file type is not allowed. Use PDF, images, Office docs, text, or zip.')
        );
      }
    }
    return callback(null, true);
  },
});

const mailboxAttachments = upload.array('attachments', MAX_FILES);

function mailboxUploadError(err) {
  if (!err) return null;
  if (err.code === 'LIMIT_FILE_SIZE') {
    return 'Each attachment must be 10MB or smaller.';
  }
  if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
    return 'You can attach up to 5 files.';
  }
  return err.message || 'Attachment upload failed.';
}

module.exports = {
  ALLOWED_EXT,
  ALLOWED_MIME,
  MAX_FILE_SIZE,
  MAX_FILES,
  mailboxAttachments,
  mailboxUploadError,
};
