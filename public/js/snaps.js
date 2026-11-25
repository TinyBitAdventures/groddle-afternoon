/**
 * Snaps between real players (register G332): the pure rules behind
 * features/snaps-feature.js. A multiplayer player with the Snapshottery card
 * presses Enter in Camera Mode to take a Snap, which the site keeps
 * (groddle-afternoon-site src/Snaps.php); the Camera item's "take a picture
 * with" shows a random Snap by another player and offers to go there.
 *
 * Sources: GSJS players/player.js 2148-2173 getCameraAbilities (Snapshottery
 * to snap), inc_data_imagination.js 6990-7010 (the card, level 5),
 * items/camera.js 93-119 (take_picture), main.js 7605-7623 (snap_travel and
 * snap_travel_forget), items/catalog_buffs.js 361-376 (camera_recharging),
 * items/catalog_stores.js 1455-1458 (Toy Vendor, 1100); glitch-client
 * CameraManView.as 189-196, CameraMan.as 492-550, GlitchrSnapshotView.as
 * 98-160 and 427-455, GlitchroidSnapshot.as 35, GlitchrSavedDialog.as
 * 160-225, SnapTravelView.as (the travel screen).
 *
 * G1240 (Austin 2026-11-24, players: snaps were "very wee"): a Snap is taken
 * at the view's own pixels on this screen (the renderer's resolution, 2 on a
 * 2x screen), up to the site's 1920x1200, and made smaller only to fit its
 * 1 MB; the album shows each Snap in its own shape and opens a full-size
 * viewer; each Snap is private until its owner makes it public on their
 * profile (the saved dialog's View, Download and Make public / Copy link,
 * as GlitchrSavedDialog.as 165-169 gave the photo's page, a download and a
 * short URL).
 *
 * G1286 (Austin 2026-11-25): solo snaps too, with the same card, render and filters, saved to the
 * device instead of the site (snapFileName); a remake addition (inventions: camera-solo-download),
 * as Glitch had no solo game.
 */

import { filterText } from './word-filter.js?v=9a7a7ebb';

export const CAMERA_CLASS = 'camera';
export const RECHARGE_BUFF = 'camera_recharging';
export const SNAPSHOTTERY = 'snapshotting';
/** inc_data_imagination.js 6998-7004: the card's level. */
export const SNAPSHOTTERY_LEVEL = 5;
/** catalog_stores.js 1455-1458: the Toy Vendor's camera. */
export const CAMERA_OFFER = Object.freeze({ store: 'toys', classTsid: CAMERA_CLASS, label: 'Camera', cost: 1100 });
/** main.js 7621: Forget it leaves the camera recharging for 15 s (the buff's own 90 s on Go there!). */
export const FORGET_RECHARGE_SEC = 15;
/** GlitchrSnapshotView.as 153: the caption's length (site Snaps::CAPTION_MAX). */
export const CAPTION_MAX = 500;
/** Site SnapImage::MAX_BYTES. */
export const SNAP_MAX_BYTES = 1_000_000;
/** Site SnapImage::MAX_W, MAX_H, MIN_W, MIN_H: the sizes a Snap may be. */
export const SNAP_MAX_W = 1920;
export const SNAP_MAX_H = 1200;
export const SNAP_MIN_W = 320;
export const SNAP_MIN_H = 160;
/**
 * G1284 (Austin 2026-11-25): a whole-home Snap (Camera Mode's "Snap the whole house", js/home-shot.js)
 * may be taller and larger, so a 9-floor Tower (1178 x 4402 world px) keeps 963 px of width
 * instead of 320: up to 1920 x 3600 and 2 MB. The game sends `whole: true` with it and the site
 * checks these limits for those only (site SnapImage::WHOLE_MAX_H, WHOLE_MAX_BYTES).
 */
export const WHOLE_SNAP = Object.freeze({ maxW: 1920, maxH: 3600, maxBytes: 2_000_000 });

/** The widths a Snap steps down to, widest first, when its own size is over the site's 1 MB. */
export const SNAP_WIDTHS = Object.freeze([1920, 1600, 1280, 960, 800, 640]);
export const SNAP_QUALITY = 0.85;
/** The lower quality tried at each width before the next width down. */
export const SNAP_QUALITY_LOW = 0.72;

/**
 * The resolution to draw the view at for a Snap (G1240): the renderer's own
 * (the screen's pixels per view pixel, 2 on a 2x screen), no more than the
 * site's widest takes for this view. `viewW` is the location view's width
 * in view pixels (960 on a computer).
 */
export function snapResolution({ viewW = 960, resolution = 1 } = {}) {
  const r = Number(resolution) > 0 && Number.isFinite(Number(resolution)) ? Number(resolution) : 1;
  const w = Number(viewW) > 0 ? Number(viewW) : 960;
  return Math.max(0.25, Math.min(r, SNAP_MAX_W / w));
}

/**
 * The sizes and qualities to try for a picture `width` x `height`, in order:
 * its own size (fitted into the site's 1920x1200, or `maxW` x `maxH`) at SNAP_QUALITY, then at
 * SNAP_QUALITY_LOW, then each smaller SNAP_WIDTHS width the same way; never
 * under the site's least size. The first that fits 1 MB is kept.
 */
export function snapSteps(width, height, { maxW = SNAP_MAX_W, maxH = SNAP_MAX_H } = {}) {
  const W = Math.round(Number(width) || 0);
  const H = Math.round(Number(height) || 0);
  if (W < 1 || H < 1) return [];
  const fit = Math.min(1, maxW / W, maxH / H);
  const w0 = Math.max(1, Math.floor(W * fit));
  const widths = [w0, ...SNAP_WIDTHS.filter((w) => w < w0)];
  const out = [];
  for (const w of widths) {
    const h = Math.max(1, Math.round((H * w) / W));
    if (out.length && (w < SNAP_MIN_W || h < SNAP_MIN_H)) break;
    for (const quality of [SNAP_QUALITY, SNAP_QUALITY_LOW]) out.push({ w, h, quality });
  }
  return out;
}

/** SnapTravelView.as timings. */
export const TRAVEL = Object.freeze({
  /** SNAP_SHOW_DELAY_MS: the text alone before the snap. */
  showDelayMs: 2000,
  /** TIMEOUT_MS: no snap by then and the camera gives up. */
  timeoutMs: 10000,
  /** IMAGE_PADD: the white frame around the snap. */
  framePx: 16,
  /** player.js 516-530 teleportToLocationDelayed: 500 ms. */
  goDelayMs: 500,
  /** main.js 7611 playHitAnimation('hit1', 1000). */
  hitMs: 1000,
});

/** Copy, from the source where it exists. */
export const SNAP_COPY = Object.freeze({
  verb: 'take a picture with',
  verbLabel: 'Take a picture',
  verbTip: "Doesn't do exactly what it says on the tin",
  recharging: 'You need to wait for your camera to recharge',
  dead: 'The dead have no use for pictures',
  travel: (place) => `In Soviet ${place}, picture takes you!`,
  go: 'Go there!',
  forget: 'Forget it',
  someplace: 'Some interesting place',
  ur: 'Ur',
  by: (name) => `Snapshot taken by: ${name}`,
  byNobody: 'Snapshot by someone, but not sure who',
  wonky: 'Your camera seems to have gone all wonky. Give it another try soon.',
  hintSnap: 'Arrows to look, Enter to snap · C to return',
  hintSnapStreet: 'Arrows to look, Enter to snap · C to return · Eyeballery lets you look across the whole street',
  hintNoCard: 'Arrows to look · C to return · Purchase the Snapshottery upgrade so you can take photos.',
  // G1286: solo keeps no album, so its Snap goes to the device (snaps-feature openDownload).
  hintDevice: 'Arrows to look, Enter saves a snap to your device · C to return',
  hintDeviceStreet: 'Arrows to look, Enter saves a snap to your device · C to return · Eyeballery lets you look across the whole street',
  soloNote: 'Solo snaps save to your device, not to an album.',
  soloSaved: 'Saved to your downloads.',
  needCard: 'Get the Snapshottery upgrade first.',
  saving: "Hang on, I'm saving your photo right now!",
  caption: 'click to enter a caption...',
  save: 'Save snap',
  discard: 'discard',
  saved: 'Snap Saved!',
  savedBody: 'The snap has been saved to your snaps.',
  done: 'Done',
  error: (why) => `An error (${why}) occurred.\n\nSorry!`,
  ugh: 'Ugh!',
  menu: 'Snaps',
  menuTip: 'Your snaps',
  title: 'Your snaps',
  empty: 'No snaps yet. Press C for Camera Mode, then Enter to snap.',
  emptyNoCard: 'No snaps yet. The Snapshottery upgrade lets you take them in Camera Mode (C).',
  count: (n, max) => `${n} of ${max}`,
  remove: 'Delete',
  removing: 'Deleting…',
  close: 'Close',
  // G1240: the viewer, the saved dialog's links, public or private.
  view: 'View',
  viewer: 'Snap',
  prev: 'Previous',
  next: 'Next',
  download: 'Download',
  copyLink: 'Copy link',
  copied: 'Link copied.',
  copyFailed: 'Copy the link from here:',
  makePublic: 'Make public',
  makePrivate: 'Make private',
  publicBadge: 'Public',
  publicNote: 'Public: on your profile page, and other players\' Cameras may show it.',
  privateNote: 'Private: only you can see it.',
  madePublic: 'This snap is public now.',
  madePrivate: 'This snap is private now.',
  confirmDelete: 'Delete this snap? It can\'t be undone.',
  confirmYes: 'Yes, delete',
  confirmNo: 'Keep it',
  deleted: 'Snap deleted.',
  position: (n, of) => `${n} of ${of}`,
  failed: 'That didn\'t work. Try again in a moment.',
});

/**
 * G1286: a solo Snap's file name, as the client named its snapshot (CameraMan.as snap 541: the
 * location's label with "_" for spaces, then StringUtil.getUrlDate 387-389, YYYY_MM_DD-HH_MM_SS),
 * as a .jpg (the Snap is the same JPEG online keeps). Characters a file name cannot hold are dropped.
 */
export function snapFileName(label, date = new Date()) {
  const place = String(label || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '').trim().replace(/\s+/g, '_') || 'Snap';
  const d = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${place}_${d.getFullYear()}_${p(d.getMonth() + 1)}_${p(d.getDate())}-${p(d.getHours())}_${p(d.getMinutes())}_${p(d.getSeconds())}.jpg`;
}

/** take_picture's conditions (camera.js 104-111). */
export function takePictureState({ recharging = false, dead = false } = {}) {
  if (recharging) return { enabled: false, reason: SNAP_COPY.recharging };
  if (dead) return { enabled: false, reason: SNAP_COPY.dead };
  return { enabled: true, reason: '' };
}

/** getCameraAbilities can_snap: the Snapshottery card (dealt from level 5). */
export function canSnap(upgrades = []) {
  return Array.isArray(upgrades) && upgrades.includes(SNAPSHOTTERY);
}

/** A street a Snap can lead to (site Snaps::STREET): an ordinary street's tsid, never a private place. */
export function isSnapStreet(tsid) {
  return /^[GL][A-Z0-9]{8,20}$/.test(String(tsid || ''));
}

/**
 * The street a new Snap records: the realtime street the player is on, when
 * it is the street the game shows, public (no "_": homes, party spaces),
 * not a Tower floor's own place (dropTsid) nor a quest room, and in the
 * street index; else '' (kept, never offered to the Camera).
 */
export function snapStreet({ realtime = '', street = '', dropTsid = '', transient = false, inHome = false, indexed = () => true } = {}) {
  const s = String(street || '');
  if (!s || transient || inHome) return '';
  if (String(realtime || '') !== s) return '';
  if (dropTsid && String(dropTsid) !== s) return '';
  if (!isSnapStreet(s) || !indexed(s)) return '';
  return s;
}

/** The travel screen's place lines (SnapTravelView.as onAPIComplete): the street, then "in <hub>". */
export function snapPlace(meta) {
  return {
    label: meta?.label || SNAP_COPY.someplace,
    hub: meta?.hubName || SNAP_COPY.ur,
  };
}

/** "Snapshot taken by: <name>" (or nobody known). */
export function snapAuthor(owner) {
  const name = typeof owner?.name === 'string' ? owner.name.trim() : '';
  return name ? SNAP_COPY.by(name) : SNAP_COPY.byNobody;
}

/** A caption as the site keeps it (Snaps::caption): one line, no control characters, trimmed. */
export function cleanCaption(text) {
  const s = String(text ?? '')
    .replace(/\s+/gu, ' ')
    .replace(/\p{C}/gu, '')
    .trim();
  return filterText([...s].slice(0, CAPTION_MAX).join('')); // the remake's own word filter (the site's Snaps::caption too)
}

/**
 * A Snap picture URL the game will load: the site's own route
 * (PlayerPages::snapPicture, which checks who may see it; G1240), never a
 * file's address or anywhere else.
 */
export function isSnapUrl(url) {
  return /^\/players\/\d{1,12}\/snaps\/\d{1,12}\/(?:picture|small)$/.test(String(url || ''));
}

/** A Snap's download URL from the site (the same route, as a file named for its street and date). */
export function isSnapDownload(url) {
  return /^\/players\/\d{1,12}\/snaps\/\d{1,12}\/download$/.test(String(url || ''));
}

/** A public Snap's page on its owner's profile (the link Copy link gives). */
export function isSnapPage(url) {
  return /^\/players\/[a-z0-9][a-z0-9.-]{0,80}\/snaps\/\d{1,12}\/$/.test(String(url || ''));
}

/** The album's Snaps the game shows: the site's own pictures only. */
export function albumSnaps(list) {
  return (Array.isArray(list) ? list : []).filter((x) => isSnapUrl(x?.url));
}

/** The viewer's next (dir 1) or previous (dir -1) Snap's index in a list of `count`, or -1 at either end. */
export function viewerStep(count, index, dir) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  const i = Math.floor(Number(index));
  if (!n || !Number.isFinite(i) || i < 0 || i >= n) return -1;
  const next = i + (dir < 0 ? -1 : 1);
  return next >= 0 && next < n ? next : -1;
}

/**
 * The viewer's actions for one of your Snaps, in order: Download, Copy link
 * (only when public: a private Snap has no page to share), Make public or
 * Make private, Delete.
 */
export function viewerActions(snap) {
  if (!snap) return [];
  const out = [];
  if (isSnapDownload(snap.download)) out.push('download');
  const pub = snap.public === true;
  if (pub && isSnapPage(snap.page)) out.push('copy');
  out.push(pub ? 'private' : 'public');
  out.push('delete');
  return out;
}

/** The saved dialog's links (GlitchrSavedDialog.as 165-169: the photo's page, download, short URL): View, Download, then Make public or Copy link. */
export function savedActions(snap) {
  if (!snap || !isSnapUrl(snap.url)) return [];
  const out = ['view'];
  if (isSnapDownload(snap.download)) out.push('download');
  out.push(snap.public === true && isSnapPage(snap.page) ? 'copy' : 'public');
  return out;
}

/** A Snap's date as the viewer says it ("November 24, 2026"), from the site's ISO time; '' when unknown. */
export function snapDate(at) {
  const t = Date.parse(String(at || ''));
  if (!Number.isFinite(t)) return '';
  return new Date(t).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

/** The full address of a public Snap's page, for Copy link ('' when it has none). */
export function snapShareUrl(page, base) {
  if (!isSnapPage(page)) return '';
  try {
    return new URL(page, base).href;
  } catch {
    return '';
  }
}

/** The Toy Vendor's stock with the Camera added (multiplayer); null when nothing changes. */
export function withCamera(profile) {
  if (!profile || profile.key !== CAMERA_OFFER.store || !Array.isArray(profile.offers)) return null;
  if (profile.offers.some((o) => o?.classTsid === CAMERA_CLASS)) return null;
  const buyMultiplier = Number(profile.buyMultiplier) || 0.66;
  return {
    ...profile,
    offers: [...profile.offers, { classTsid: CAMERA_CLASS, label: CAMERA_OFFER.label, buyPrice: CAMERA_OFFER.cost, sellPrice: Math.max(1, Math.floor(CAMERA_OFFER.cost * buyMultiplier)) }],
  };
}

/** Bytes a base64 string decodes to. */
export function base64Bytes(b64) {
  const s = String(b64 || '');
  const pad = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((s.length * 3) / 4) - pad);
}

/** The base64 inside a JPEG data URL ('' for anything else). */
export function jpegBase64(dataUrl) {
  const prefix = 'data:image/jpeg;base64,';
  return typeof dataUrl === 'string' && dataUrl.startsWith(prefix) ? dataUrl.slice(prefix.length) : '';
}
