/**
 * Player profiles (register G338): the pure rules behind
 * features/profiles-feature.js. A multiplayer character has a public page
 * on the Groddle site (/players/<name>/, groddle-afternoon-site
 * src/PlayerPages.php) with their avatar, a picture of their home street,
 * the description they write and their badges, as every Glitch had one on
 * glitch.com (/profiles/<tsid>/). The game draws the pictures and uploads
 * them, as the original client did (glitch-client AvatarSheetMaker.as
 * save_all_singles posting to ss_singles_post_url; PNGUtil.as
 * saveSinglesFromAvatarMc 77-160).
 */

/** The description's cap in characters (site src/Profiles.php ABOUT_MAX). */
export const PROFILE_ABOUT_MAX = 500;

/** PNGUtil.as saveSinglesFromAvatarMc 87-89: the still is 172x248 with the avatar at scale 1.76. */
export const AVATAR_STILL = Object.freeze({ w: 172, h: 248, scale: 1.76 });
/** PNGUtil.as 134-135: the _100 picture is the still at 100/172 (100x144). */
export const AVATAR_TILE = Object.freeze({ w: 100, h: 144 });
/** The swf frame drawn: the stand (idle 801), as the home card's owner portrait (game.js ownerPortraitUrl). */
export const AVATAR_FRAME = 801;
/** Pictures are drawn at 2x for sharp screens; the site takes up to 2x. */
export const PICTURE_RESOLUTION = 2;

/** The largest home picture the site keeps (src/ProfilePng.php KINDS home). */
export const HOME_MAX_BYTES = 600 * 1024;
/** Widths tried for the home picture, widest first, until it fits HOME_MAX_BYTES. */
export const HOME_WIDTHS = Object.freeze([960, 720, 560]);

/** A new home picture at most this often while the player is home (the home's key changes with it). */
export const HOME_REFRESH_MS = 6 * 60 * 60 * 1000;
/** Seconds on the home street, settled, before the picture is taken. */
export const HOME_SETTLE_MS = 4000;
/** The least time between two upload tries of one picture, and after a failure. */
export const RETRY_MS = 60 * 1000;
export const FAILURE_BACKOFF_MS = 5 * 60 * 1000;

/** A description as the site keeps it: \n line breaks, no control characters, trimmed (site Profiles::about). */
export function cleanAbout(text) {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\p{C}]/gu, (c) => (c === '\n' ? c : ''))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Characters in a description, counted as the site counts them (code points, after cleanAbout). */
export function aboutLength(text) {
  return [...cleanAbout(text)].length;
}

/** "120 / 500" and whether it is over. */
export function aboutCounter(text, max = PROFILE_ABOUT_MAX) {
  const n = aboutLength(text);
  return { n, max, over: n > max, label: `${n} / ${max}` };
}

/** A character name as the site's path (site Profiles::slug): lower case, spaces, - and _ as one -. */
export function profileSlug(name) {
  return String(name ?? '').toLowerCase().replace(/[ _-]+/g, '-').replace(/^-+|-+$/g, '');
}

/** FNV-1a 32-bit, hex: a short stable key for a long string. */
export function shortHash(text) {
  let h = 0x811c9dc5;
  const s = String(text ?? '');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** The key an avatar picture is made from: the look (avatar-looks.js lookKey) and the drawing's version. */
export function avatarKeyOf(lookKeyText) {
  return `a1-${shortHash(lookKeyText)}-${String(lookKeyText ?? '').length.toString(36)}`;
}

/** The key a home picture is made from: the home's style and a HOME_REFRESH_MS bucket, so decorating shows within hours. */
export function homeKeyOf(style, now = Date.now()) {
  const safe = String(style || 'meadow').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24) || 'meadow';
  return `h1-${safe}-${Math.floor(Number(now) / HOME_REFRESH_MS).toString(36)}`;
}

/**
 * Whether to upload a picture now: the site has none, or one made from
 * another key; never twice within RETRY_MS, nor within FAILURE_BACKOFF_MS
 * of a failure.
 *
 * @param {{ held: { key?: string } | null, key: string, now: number, lastTry?: number, failedAt?: number }} s
 */
export function shouldUpload({ held, key, now, lastTry = 0, failedAt = 0 }) {
  if (!key) return false;
  if (held && held.key === key) return false;
  if (lastTry && now - lastTry < RETRY_MS) return false;
  if (failedAt && now - failedAt < FAILURE_BACKOFF_MS) return false;
  return true;
}

/**
 * Where and how big to draw the avatar in the still: scale 1.76 (PNGUtil),
 * smaller only when a tall hat or wide hair would leave the frame; feet on
 * the bottom edge, centred. bounds are the frame's [x0, y0, x1, y1] about
 * the feet, facing right; flip faces it left as the original stills did
 * (PNGUtil.as 100 scaleX = -scale).
 */
export function stillTransform(bounds, { w = AVATAR_STILL.w, h = AVATAR_STILL.h, scale = AVATAR_STILL.scale, pad = 4, resolution = 1, flip = true } = {}) {
  const b = Array.isArray(bounds) && bounds.length === 4 ? bounds : [-40, -120, 40, 0];
  const bw = Math.max(1, b[2] - b[0]);
  const bh = Math.max(1, b[3] - b[1]);
  const s = Math.min(scale, (w - 2 * pad) / bw, (h - 2 * pad) / bh) * resolution;
  const cx = (b[0] + b[2]) / 2;
  const tx = (w * resolution) / 2 - cx * s * (flip ? -1 : 1);
  const ty = h * resolution - pad * resolution - b[3] * s;
  return [flip ? -s : s, 0, 0, s, tx, ty];
}

/** The base64 inside a PNG data URL ('' for anything else). */
export function pngBase64(dataUrl) {
  const prefix = 'data:image/png;base64,';
  return typeof dataUrl === 'string' && dataUrl.startsWith(prefix) ? dataUrl.slice(prefix.length) : '';
}

/** Bytes a base64 string decodes to. */
export function base64Bytes(b64) {
  const s = String(b64 || '');
  const pad = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((s.length * 3) / 4) - pad);
}

/** Copy shown in Menu > Account, Your profile. */
export const PROFILE_COPY = Object.freeze({
  heading: 'Your profile',
  intro: 'Everyone can see your profile on the Groddle site: your Glitch, your home street, your badges and what you write here.',
  label: 'About you',
  placeholder: 'A few words for other players.',
  save: 'Save',
  saving: 'Saving…',
  saved: 'Saved.',
  over: (max) => `That is over ${max} characters.`,
  see: 'See your profile',
  failed: 'That didn\'t save. Try again in a moment.',
});
