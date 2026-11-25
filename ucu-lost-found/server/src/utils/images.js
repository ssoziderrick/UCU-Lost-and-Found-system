// Image uploads: type detection from the file's bytes, dimension checks and metadata removal.
// Photos from phones often carry GPS coordinates and device details; those must never reach a listing.
const multer = require('multer');
const { badRequest } = require('./errors');

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_FILES = 4;
const MAX_SIDE = 6000;

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES, files: MAX_FILES, fields: 30 } });

/** Accepts up to 4 files in the "photos" field; multer errors become friendly 400s. */
function photosUpload(req, res, next) {
  upload.array('photos', MAX_FILES)(req, res, (err) => {
    if (!err) return next();
    const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Each photo must be 5 MB or smaller. Choose a smaller image.'
      : err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE' ? `Add at most ${MAX_FILES} photos.`
        : 'The photos could not be uploaded. Try different images.';
    return next(badRequest(msg, { fields: { photos: msg } }));
  });
}

/** Real image type from the first bytes (the browser-supplied type and file name are not trusted). */
function detectImageType(buf) {
  if (!buf || buf.length < 16) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

// --- JPEG ---------------------------------------------------------------------------------------
/** Drops APP1 segments (EXIF, XMP). Leaves the file unchanged if its structure is unexpected. */
function stripJpegMetadata(buf) {
  const parts = [buf.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= buf.length && buf[i] === 0xff) {
    const marker = buf[i + 1];
    if (marker === 0xda) { parts.push(buf.subarray(i)); return Buffer.concat(parts); } // start of scan
    const len = buf.readUInt16BE(i + 2);
    if (marker !== 0xe1) parts.push(buf.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  return buf;
}

function jpegSize(buf) {
  let i = 2;
  while (i + 9 < buf.length && buf[i] === 0xff) {
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    // SOF0-SOF15 except DHT (C4), JPG (C8) and DAC (CC) carry the frame size.
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return null;
}

// --- PNG ----------------------------------------------------------------------------------------
const PNG_DROP = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME']);
/** Removes text, time and EXIF chunks; image data and colour chunks are kept byte-for-byte. */
function stripPngMetadata(buf) {
  const parts = [buf.subarray(0, 8)];
  let i = 8;
  while (i + 12 <= buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.subarray(i + 4, i + 8).toString('latin1');
    const end = i + 12 + len;
    if (end > buf.length) return buf;
    if (!PNG_DROP.has(type)) parts.push(buf.subarray(i, end));
    i = end;
    if (type === 'IEND') break;
  }
  return Buffer.concat(parts);
}
const pngSize = (buf) => (buf.subarray(12, 16).toString('latin1') === 'IHDR'
  ? { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) } : null);

// --- WebP ---------------------------------------------------------------------------------------
/** Removes EXIF and XMP chunks and clears their flags in the VP8X header. */
function stripWebpMetadata(buf) {
  const chunks = [];
  let i = 12;
  while (i + 8 <= buf.length) {
    const id = buf.subarray(i, i + 4).toString('latin1');
    const len = buf.readUInt32LE(i + 4);
    const end = i + 8 + len + (len % 2);
    if (end > buf.length + 1) return buf;
    if (id !== 'EXIF' && id !== 'XMP ') {
      const chunk = Buffer.from(buf.subarray(i, Math.min(end, buf.length)));
      if (id === 'VP8X') chunk[8] &= ~0x0c; // bit 3 = EXIF, bit 2 = XMP
      chunks.push(chunk);
    }
    i = end;
  }
  const body = Buffer.concat(chunks);
  const header = Buffer.from(buf.subarray(0, 12));
  header.writeUInt32LE(body.length + 4, 4);
  return Buffer.concat([header, body]);
}

function webpSize(buf) {
  const id = buf.subarray(12, 16).toString('latin1');
  if (id === 'VP8X') return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
  if (id === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  if (id === 'VP8L') {
    const b = buf.readUInt32LE(21);
    return { width: 1 + (b & 0x3fff), height: 1 + ((b >> 14) & 0x3fff) };
  }
  return null;
}

/**
 * Validates one uploaded file and returns { mime, data, size, width, height } with metadata removed.
 * Throws a 400 naming the file when it isn't a usable image.
 */
function prepareImage(file) {
  const label = `"${String(file.originalname || 'photo').slice(0, 60)}"`;
  const mime = detectImageType(file.buffer);
  if (!mime) throw badRequest(`${label} isn't a JPG, PNG or WebP image.`, { fields: { photos: 'Upload JPG, PNG or WebP images only.' } });
  let size = null;
  let data = file.buffer;
  try {
    if (mime === 'image/jpeg') { size = jpegSize(data); data = stripJpegMetadata(data); }
    if (mime === 'image/png') { size = pngSize(data); data = stripPngMetadata(data); }
    if (mime === 'image/webp') { size = webpSize(data); data = stripWebpMetadata(data); }
  } catch {
    size = null;
  }
  if (!size || !size.width || !size.height) {
    throw badRequest(`${label} looks damaged and can't be used.`, { fields: { photos: 'One of the photos could not be read. Try exporting it again.' } });
  }
  if (size.width > MAX_SIDE || size.height > MAX_SIDE) {
    throw badRequest(`${label} is ${size.width}×${size.height} pixels. The limit is ${MAX_SIDE} on each side.`,
      { fields: { photos: `Photos can be at most ${MAX_SIDE} pixels wide or tall.` } });
  }
  return { mime, data, size: data.length, width: size.width, height: size.height };
}

module.exports = {
  photosUpload, prepareImage, detectImageType, stripJpegMetadata, stripPngMetadata, stripWebpMetadata, MAX_FILES,
};
