/**
 * Pictures a report or a reply carries (Austin 2026-11-15: "The picture taking for reports is a
 * bit rough. Only allows for ingame screenshots and only 1 extra per posting... open it up for
 * uploads... drag/drop any image format... thumbnails with clickable previews before they submit").
 *
 * A message carries up to REPORT_PICTURES.max pictures (the site's ReportPicture::MAX_PER_MESSAGE);
 * a new report's own picture of the game counts as one of them. A picture can be any image the
 * browser can open (PNG, JPEG, WebP, the first frame of a GIF, AVIF, BMP; HEIC where Safari opens
 * it): it is decoded here and drawn again as a JPEG within the site's limits (js/reports.js
 * REPORT_PICTURE: 1280x1280, 300 KiB, the same as the game's own picture), so the file's own bytes
 * never leave the browser and the site checks every picture the one way it always has
 * (groddle-afternoon-site src/ReportPicture.php). JPEG, not WebP: the site keeps JPEGs only, and
 * Safari before 17 cannot write WebP from a canvas. A picture smaller than the site's 64 px side
 * is set on a white margin (the site refuses smaller ones); transparency goes white, as the
 * game's own picture's does. Anything the browser cannot open is refused with words that name
 * the file.
 *
 * The rules are pure (pictureAttempts, roomFor, refusalWords); convertPicture takes its decoder
 * and drawer, so the tests run it without a page (tests/report-pictures.test.js).
 */

import { REPORT_PICTURE, base64Size, pictureSize } from './reports.js?v=3c805cc4';

export const REPORT_PICTURES = Object.freeze({
  /** The most pictures one message carries (src/ReportPicture.php MAX_PER_MESSAGE). */
  max: 4,
  /** The site refuses a picture with a side under this (ReportPicture::MIN_SIDE): a smaller one gets a margin. */
  minSide: 64,
  /** A file bigger than this is not read at all (a photo is a few MB; this keeps a phone's memory safe). */
  maxFileBytes: 40 * 1024 * 1024,
  /** The file picker's filter: any image, and the photo types some systems give no image/ type to. */
  accept: 'image/*,.heic,.heif,.avif,.webp,.bmp',
});

/** The words (no dashes; a file is named as the player's system names it). */
export const PICTURE_TEXT = Object.freeze({
  add: 'Add pictures',
  addHint: 'Drop pictures here, paste one, or use Add pictures. Up to 4 a message; only you and the administrators see them.',
  reading: 'Reading the pictures…',
  remove: (n) => `Remove picture ${n}`,
  open: (n, of) => `Open picture ${n} of ${of}`,
  thumbAlt: (n) => `Picture ${n} for your message`,
  gameAlt: 'The game when you reported it',
  full: 'A message carries up to 4 pictures.',
  leftOut: (n) => (n === 1 ? 'A message carries up to 4 pictures, so 1 was left out.' : `A message carries up to 4 pictures, so ${n} were left out.`),
  notImage: (name) => `${name} is not a picture, so it was not added.`,
  unreadable: (name) => `${name} could not be opened as a picture in this browser, so it was not added.`,
  tooBig: (name) => `${name} is too big to read, so it was not added.`,
  dropHere: 'Drop the pictures to add them',
  sentWithout: 'Thanks! Your message was sent, without the pictures.',
  replyWithout: 'Reply sent, without the pictures.',
  counter: (n, of) => `${n} of ${of}`,
  prev: 'Previous picture (Left arrow)',
  next: 'Next picture (Right arrow)',
});

/** PURE: how many more pictures fit beside `count` already chosen (at most max a message). */
export function roomFor(count, max = REPORT_PICTURES.max) {
  return Math.max(0, max - Math.max(0, Number(count) || 0));
}

/** PURE: the files that fit the room, in order, and how many were left out. */
export function takeForRoom(files, room) {
  const list = Array.from(files || []);
  const n = Math.max(0, Math.min(list.length, Number(room) || 0));
  return { take: list.slice(0, n), over: list.length - n };
}

/** PURE: a file's name as the words show it (never empty, never very long). */
export function fileName(file) {
  const name = String(file?.name || '').trim() || 'That file';
  return name.length > 60 ? `${name.slice(0, 40)}…${name.slice(-12)}` : name;
}

/** PURE: whether a file may be a picture: an image/ type, or no type at all (some systems give a HEIC none). */
export function mayBePicture(file) {
  const type = String(file?.type || '').toLowerCase();
  return !type || type.startsWith('image/');
}

/**
 * PURE: the drawings to try for a w x h picture, largest first: the shape kept within the site's
 * box (each of limits.widths), set on a white margin up to minSide when a side is smaller, each
 * at each JPEG quality. { canvasW, canvasH, drawW, drawH, x, y, quality }.
 */
export function pictureAttempts(w, h, limits = REPORT_PICTURE, minSide = REPORT_PICTURES.minSide) {
  const out = [];
  for (const widest of limits.widths) {
    const [drawW, drawH] = pictureSize(w, h, Math.min(widest, limits.maxWidth), limits.maxHeight);
    if (!drawW || !drawH) return [];
    const canvasW = Math.max(drawW, minSide);
    const canvasH = Math.max(drawH, minSide);
    const x = Math.floor((canvasW - drawW) / 2);
    const y = Math.floor((canvasH - drawH) / 2);
    for (const quality of limits.qualities) out.push({ canvasW, canvasH, drawW, drawH, x, y, quality });
  }
  return out;
}

/** A refusal: code not_image | unreadable | too_big, with the file's name in its words. */
export function pictureError(code, file) {
  const name = fileName(file);
  const words = code === 'not_image' ? PICTURE_TEXT.notImage(name) : code === 'too_big' ? PICTURE_TEXT.tooBig(name) : PICTURE_TEXT.unreadable(name);
  return Object.assign(new Error(words), { code, file: name, words });
}

/** PURE: a refusal's words (convertPicture's), else the unreadable words for that file. */
export function refusalWords(err, file = null) {
  return typeof err?.words === 'string' && err.words ? err.words : PICTURE_TEXT.unreadable(fileName(file));
}

/**
 * Decodes an image file (the browser's own decoder): { source, width, height, close() }.
 * createImageBitmap first (it reads a GIF's first frame, AVIF, BMP, and the photo's turn from its
 * EXIF), then an <img> for what it cannot read (an SVG; HEIC in Safari).
 */
export async function decodeImage(file, env = globalThis) {
  if (typeof env.createImageBitmap === 'function') {
    try {
      const bmp = await env.createImageBitmap(file, { imageOrientation: 'from-image' });
      if (bmp?.width && bmp?.height) return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close?.() };
      bmp?.close?.();
    } catch { /* the <img> below */ }
  }
  const URLs = env.URL;
  if (typeof env.Image !== 'function' || !URLs?.createObjectURL) throw new Error('no decoder');
  const url = URLs.createObjectURL(file);
  try {
    const img = new env.Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    if (!img.naturalWidth || !img.naturalHeight) throw new Error('empty');
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URLs.revokeObjectURL(url) };
  } catch (err) {
    URLs.revokeObjectURL(url);
    throw err;
  }
}

/** A drawer over one canvas: draws a decoded picture as one attempt, and gives the JPEG data URL. */
export function canvasDrawer(doc = globalThis.document) {
  const c = doc.createElement('canvas');
  const ctx = c.getContext('2d');
  return (pic, a) => {
    if (!ctx) return '';
    c.width = a.canvasW;
    c.height = a.canvasH;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, a.canvasW, a.canvasH);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(pic.source, a.x, a.y, a.drawW, a.drawH);
    return c.toDataURL(REPORT_PICTURE.type, a.quality);
  };
}

/**
 * A file as a report's picture: { url (a JPEG data URL), width, height, bytes, name }, or a
 * refusal thrown (pictureError). decode(file) and draw(pic, attempt) are the page's
 * (decodeImage, canvasDrawer) unless a test gives its own.
 */
export async function convertPicture(file, { decode = decodeImage, draw = null, limits = REPORT_PICTURE, doc = globalThis.document } = {}) {
  if (!file || !mayBePicture(file)) throw pictureError('not_image', file);
  if (Number(file.size) > REPORT_PICTURES.maxFileBytes) throw pictureError('too_big', file);
  let pic = null;
  try { pic = await decode(file); } catch { pic = null; }
  if (!pic?.width || !pic?.height) throw pictureError(file.type ? 'unreadable' : 'not_image', file);
  try {
    const drawer = draw || canvasDrawer(doc);
    for (const a of pictureAttempts(pic.width, pic.height, limits)) {
      let url = '';
      try { url = drawer(pic, a); } catch { url = ''; }
      if (typeof url !== 'string' || !url.startsWith('data:image/jpeg;base64,')) throw pictureError('unreadable', file);
      const bytes = base64Size(url.slice(url.indexOf(',') + 1));
      if (bytes <= limits.maxBytes) return { url, width: a.canvasW, height: a.canvasH, bytes, name: fileName(file) };
    }
  } finally {
    try { pic.close?.(); } catch { /* gone */ }
  }
  throw pictureError('too_big', file);
}

/** The files a drop or a paste carries (DataTransfer files, else its file items), in order. */
export function filesOf(transfer) {
  if (!transfer) return [];
  const files = Array.from(transfer.files || []);
  if (files.length) return files;
  return Array.from(transfer.items || []).filter((i) => i?.kind === 'file').map((i) => i.getAsFile?.()).filter(Boolean);
}

/** Whether a drag carries files (its types name Files): only then does a box take the drop. */
export function dragHasFiles(transfer) {
  return Array.from(transfer?.types || []).includes('Files');
}
