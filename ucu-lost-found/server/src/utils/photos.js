// Photo upload handling: in-memory multer + magic-byte check, stored in MySQL.
const multer = require('multer');
const config = require('../config');
const { badRequest } = require('./errors');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxPhotoBytes, files: 1 },
});

/** Wrap multer so its errors become friendly 400 responses. */
function photoUpload(req, res, next) {
  upload.single('photo')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(badRequest('The photo is larger than 2 MB. Please choose a smaller image or reduce its size.',
        { fields: { photo: 'Photo must be 2 MB or smaller.' } }));
    }
    return next(badRequest('The photo could not be uploaded. Please try a different image.',
      { fields: { photo: 'Upload a single JPG, PNG or WebP image.' } }));
  });
}

/** Detect the real image type from the file's first bytes (do not trust the browser's mimetype). */
function detectImageType(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'image/webp';
  return null;
}

/**
 * Remove EXIF/XMP metadata (APP1 segments) from a JPEG. Phone photos often embed GPS
 * coordinates and device details, which must not leak through a public listing.
 */
function stripJpegMetadata(buf) {
  const parts = [buf.slice(0, 2)]; // SOI
  let i = 2;
  while (i + 4 <= buf.length && buf[i] === 0xff) {
    const marker = buf[i + 1];
    if (marker === 0xda) { parts.push(buf.slice(i)); return Buffer.concat(parts); } // start of scan: rest is image data
    const len = buf.readUInt16BE(i + 2);
    if (marker !== 0xe1) parts.push(buf.slice(i, i + 2 + len)); // drop APP1 (EXIF/XMP)
    i += 2 + len;
  }
  return buf; // unexpected structure: leave unchanged rather than corrupt the image
}

function checkPhoto(file) {
  if (!file) return null;
  const mime = detectImageType(file.buffer);
  if (!mime) {
    throw badRequest('That file is not a supported image.',
      { fields: { photo: 'Upload a JPG, PNG or WebP image (max 2 MB).' } });
  }
  const data = mime === 'image/jpeg' ? stripJpegMetadata(file.buffer) : file.buffer;
  return { mime, data, size: data.length };
}

module.exports = { photoUpload, checkPhoto, stripJpegMetadata };
