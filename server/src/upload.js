const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const config = require('./config');
const { HttpError } = require('./util');

fs.mkdirSync(config.uploadDir, { recursive: true });

const ALLOWED = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
};

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, config.uploadDir),
    filename: (req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex') + (ALLOWED[file.mimetype] || '')),
  }),
  limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 5 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED[file.mimetype]) return cb(null, true);
    return cb(new HttpError(400, `${file.originalname}: only PDF, JPG and PNG files are accepted`));
  },
});

const memoryUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024, files: 1 } });

function discard(files) {
  for (const f of files || []) fs.unlink(f.path, () => {});
}

function filePath(storedName) {
  const p = path.join(config.uploadDir, path.basename(storedName));
  return p;
}

module.exports = { upload, memoryUpload, discard, filePath };
