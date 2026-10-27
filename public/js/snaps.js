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
 */

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
/** The widths a Snap is drawn at, widest first, until it fits the site's cap. */
export const SNAP_WIDTHS = Object.freeze([960, 800, 640]);
export const SNAP_QUALITY = 0.85;

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
});

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
  return [...s].slice(0, CAPTION_MAX).join('');
}

/** A served Snap URL the game will load: the site's own folder, a name Snaps wrote. */
export function isSnapUrl(url) {
  return /^\/wp-content\/uploads\/groddle-snaps\/[0-9a-f]{24}\.jpg$/.test(String(url || ''));
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
