/**
 * Player profiles in multiplayer (register G338). Every Glitch had a page on
 * glitch.com (/profiles/<tsid>/): the avatar, level, badges, the bio the
 * player wrote and their home street. The Groddle site draws the same at
 * /players/<name>/ (groddle-afternoon-site src/PlayerPages.php) from what
 * this feature sends it (src/Profiles.php):
 *
 * - The avatar. The original client drew a player's stills in the browser
 *   and posted them to the website (glitch-client AvatarSheetMaker.as
 *   save_all_singles, ss_singles_post_url; PNGUtil.as
 *   saveSinglesFromAvatarMc 77-160: image.png 172x248 at scale 1.76 facing
 *   left, image_100.png at 100/172). This draws the same two with the
 *   game's own compositor (js/avatar-compositor.js), at 2x, whenever the
 *   look differs from the one the site holds, while the character saves to
 *   the site (not after a save conflict or a sign-out).
 * - The home street, as the player sees it: the view drawn by the renderer
 *   (engine.snapshotView) after a few settled seconds on their own home
 *   street, when the site has none or the home's key moved on (its style,
 *   or six hours: decorating shows the next visit). The website's profile
 *   header was a panorama of the home street (homes/.../header-*.jpg).
 * - The description: Menu > Account gets "Your profile" (a text box with a
 *   character count, Save, and "See your profile"), through the
 *   accountProfile query account-backup-feature asks.
 *
 * Uploads are throttled (profiles.js shouldUpload: one try a minute, five
 * minutes after a failure; the site refuses a second within 15 s).
 * Multiplayer only: solo never loads a profile or draws anything.
 * QA: window.groddleProfiles (state, uploadAvatar, uploadHome); canvas data
 * profileAvatar / profileHome (idle, uploading, uploaded, failed),
 * profileAboutSaved (saved, failed).
 */

import { createMinnAccount } from '../minn-account.js?v=nbhome-1';
import { drawListFor, loadCatalog, paintItems, prepareLook } from '../avatar-compositor.js';
import { drawListBounds } from '../avatar-rig.js';
import { lookKey, resolveLook } from '../avatar-looks.js';
import {
  AVATAR_FRAME, AVATAR_STILL, AVATAR_TILE, FAILURE_BACKOFF_MS, HOME_MAX_BYTES, HOME_SETTLE_MS, HOME_WIDTHS, PICTURE_RESOLUTION, PROFILE_COPY,
  aboutCounter, avatarKeyOf, base64Bytes, homeKeyOf, pngBase64, shouldUpload, stillTransform,
} from '../profiles.js?v=play-1';

export const PROFILES_FEATURE_ID = 'profiles';

/** How often the feature looks at the look and the home (ms). */
const CHECK_MS = 1000;

let state = null;

function create(engine) {
  // The REST nonce /play/online/ booted with (js/online-boot.js), as buddies-feature and realtime-feature use.
  const boot = globalThis.GRODDLE_MP_BOOT || {};
  const account = createMinnAccount({ baseUri: document.baseURI, nonce: boot.nonce || '' });
  const s = {
    account,
    profile: null,
    loading: null,
    loadedAt: 0,
    checkAt: 0,
    homeSince: 0,
    avatar: { lastTry: 0, failedAt: 0, busy: false, status: 'idle' },
    home: { lastTry: 0, failedAt: 0, busy: false, status: 'idle' },
  };
  globalThis.groddleProfiles = {
    state: () => ({ profile: s.profile, avatar: { ...s.avatar }, home: { ...s.home }, homeSince: s.homeSince }),
    uploadAvatar: () => uploadAvatar(engine, s, { force: true }),
    uploadHome: () => uploadHome(engine, s, { force: true }),
  };
  return s;
}

function mark(engine, s, which, status) {
  s[which].status = status;
  engine.setData?.(which === 'avatar' ? 'profileAvatar' : 'profileHome', status);
}

/** The profile the site holds (once, then after each write). */
async function load(s) {
  if (s.profile) return s.profile;
  if (!s.loading) {
    s.loading = s.account.profile().then((p) => {
      s.profile = p;
      s.loadedAt = Date.now();
      return p;
    }).finally(() => { s.loading = null; });
  }
  return s.loading;
}

/** The character saves to the server (save-store.js data-save-state): not refused, signed out or failing. */
function saving() {
  const st = document.documentElement?.dataset?.saveState;
  return !['conflict', 'signed-out', 'error'].includes(st);
}

/** The still and the tile of the player's look, as base64 PNGs, with its key. */
export async function drawAvatar(appearance) {
  const catalog = await loadCatalog();
  const look = resolveLook(appearance?.vector && typeof appearance.vector === 'object' ? appearance.vector : {}, catalog);
  const key = avatarKeyOf(lookKey(look));
  const prep = await prepareLook(look);
  const items = drawListFor(prep, AVATAR_FRAME);
  const bounds = drawListBounds(items, prep.shapeOf);
  const r = PICTURE_RESOLUTION;
  const still = document.createElement('canvas');
  still.width = AVATAR_STILL.w * r;
  still.height = AVATAR_STILL.h * r;
  paintItems(still.getContext('2d'), items, prep.sources, stillTransform(bounds, { resolution: r }));
  const tile = document.createElement('canvas');
  tile.width = AVATAR_TILE.w * r;
  tile.height = AVATAR_TILE.h * r;
  const tctx = tile.getContext('2d');
  tctx.imageSmoothingEnabled = true;
  tctx.imageSmoothingQuality = 'high';
  tctx.drawImage(still, 0, 0, tile.width, tile.height);
  return { key, avatar: pngBase64(still.toDataURL('image/png')), tile: pngBase64(tile.toDataURL('image/png')) };
}

/**
 * Nothing in front of the home street: no verb, dialogue, VOG or scene, and
 * no panel showing. (engine.busy counts a panel by its hidden attribute, and
 * the Account panel sits inside a hidden shade without one, so it is always
 * "open" in multiplayer; this asks whether a panel is actually drawn.)
 */
function viewClear(engine) {
  if (engine.acting?.() || engine.questDialogueOpen?.() || engine.vogOpen?.() || engine.inScene?.()) return false;
  for (const node of document.querySelectorAll('.glitch-modal:not([hidden]), [id$="-panel"]:not([hidden])')) {
    if (node.getClientRects().length) return false;
  }
  return true;
}

/** The key of the look the player wears now (cheap: no drawing). */
async function currentAvatarKey(engine) {
  const catalog = await loadCatalog();
  const vector = engine.playerAppearance?.vector;
  return avatarKeyOf(lookKey(resolveLook(vector && typeof vector === 'object' ? vector : {}, catalog)));
}

async function uploadAvatar(engine, s, { force = false } = {}) {
  if (s.avatar.busy || (!force && Date.now() - s.avatar.failedAt < FAILURE_BACKOFF_MS)) return false;
  s.avatar.busy = true;
  try {
    const profile = await load(s);
    const key = await currentAvatarKey(engine);
    const now = Date.now();
    if (!force && !shouldUpload({ held: profile?.avatar, key, now, lastTry: s.avatar.lastTry, failedAt: s.avatar.failedAt })) return false;
    s.avatar.lastTry = now;
    mark(engine, s, 'avatar', 'uploading');
    const pictures = await drawAvatar(engine.playerAppearance);
    s.profile = await s.account.uploadAvatar(pictures);
    s.avatar.failedAt = 0;
    mark(engine, s, 'avatar', 'uploaded');
    return true;
  } catch (err) {
    s.avatar.failedAt = Date.now();
    mark(engine, s, 'avatar', 'failed');
    console.warn('[profiles] avatar picture', err?.message || err);
    return false;
  } finally {
    s.avatar.busy = false;
  }
}

/** The home street as the player sees it, as a base64 PNG no larger than the site keeps. */
function drawHome(engine) {
  const view = engine.snapshotView?.({ resolution: 1 });
  if (!view?.width || !view?.height) return '';
  for (const width of HOME_WIDTHS) {
    const w = Math.min(width, view.width);
    const h = Math.round((view.height * w) / view.width);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(view, 0, 0, w, h);
    const b64 = pngBase64(c.toDataURL('image/png'));
    if (b64 && base64Bytes(b64) <= HOME_MAX_BYTES) return b64;
  }
  return '';
}

async function uploadHome(engine, s, { force = false } = {}) {
  if (s.home.busy || (!force && Date.now() - s.home.failedAt < FAILURE_BACKOFF_MS)) return false;
  const ctx = engine.homeContext?.();
  if (!ctx?.inHome || ctx.room !== 'street') return false;
  s.home.busy = true;
  try {
    const profile = await load(s);
    const key = homeKeyOf(ctx.style);
    const now = Date.now();
    if (!force && !shouldUpload({ held: profile?.home, key, now, lastTry: s.home.lastTry, failedAt: s.home.failedAt })) return false;
    s.home.lastTry = now;
    mark(engine, s, 'home', 'uploading');
    const home = drawHome(engine);
    if (!home) throw new Error('the view could not be drawn small enough');
    s.profile = await s.account.uploadHome({ key, home });
    s.home.failedAt = 0;
    mark(engine, s, 'home', 'uploaded');
    return true;
  } catch (err) {
    s.home.failedAt = Date.now();
    mark(engine, s, 'home', 'failed');
    console.warn('[profiles] home picture', err?.message || err);
    return false;
  } finally {
    s.home.busy = false;
  }
}

const STYLE = `
.account-profile { margin-top: 1rem; padding-top: 0.8rem; border-top: 1px solid #e2dcc6; }
.account-profile h3 { margin: 0 0 0.3rem; font-size: 1rem; }
.account-profile label { display: block; margin: 0.5rem 0 0.25rem; font-weight: 700; }
.account-profile textarea { box-sizing: border-box; width: 100%; min-height: 6.5rem; resize: vertical; padding: 0.5rem 0.6rem; border-radius: 9px;
  border: 2px solid #d8cfb2; background: #fffdf6; color: #2b2a22; font: inherit; }
.account-profile textarea:focus { outline: none; border-color: #e07a35; }
.account-profile .profile-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.5rem; margin-top: 0.45rem; }
.account-profile [data-profile-count] { font-variant-numeric: tabular-nums; opacity: 0.75; }
.account-profile [data-profile-count][data-over] { color: #a33b22; opacity: 1; font-weight: 700; }
`;

function el(tag, attrs = {}, text = '') {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === true) node.setAttribute(k, '');
    else if (v !== false && v != null) node.setAttribute(k, v);
  }
  if (text) node.textContent = text;
  return node;
}

/** Menu > Account, Your profile: the description, its count, Save, and the link to the page. */
function mountProfile(host, engine, s) {
  if (!document.getElementById('profiles-feature-css')) {
    const style = el('style', { id: 'profiles-feature-css' });
    style.textContent = STYLE;
    document.head.append(style);
  }
  const box = el('section', { class: 'account-profile', 'data-profile': '' });
  const area = el('textarea', { id: 'profile-about', rows: '4', placeholder: PROFILE_COPY.placeholder, 'data-profile-about': '', disabled: true });
  const count = el('span', { 'data-profile-count': '', 'aria-live': 'polite' });
  const save = el('button', { type: 'button', 'data-profile-save': '', disabled: true }, PROFILE_COPY.save);
  const note = el('p', { class: 'account-note', role: 'status', 'aria-live': 'polite', 'data-profile-note': '' });
  const link = el('a', { class: 'account-link alt', 'data-profile-link': '', target: '_blank', rel: 'noopener', hidden: true }, PROFILE_COPY.see);
  const row = el('div', { class: 'profile-row' });
  row.append(count, save);
  const actions = el('div', { class: 'account-actions' });
  actions.append(link);
  box.append(el('h3', {}, PROFILE_COPY.heading), el('p', {}, PROFILE_COPY.intro), el('label', { for: 'profile-about' }, PROFILE_COPY.label), area, row, note, actions);
  host.append(box);

  let max = 500;
  const recount = () => {
    const c = aboutCounter(area.value, max);
    count.textContent = c.label;
    count.toggleAttribute('data-over', c.over);
    save.disabled = c.over || area.disabled;
    return c;
  };
  const say = (text, tone = 'good') => {
    note.textContent = text;
    note.dataset.tone = tone;
  };
  const show = (p) => {
    max = Number(p?.aboutMax) || max;
    area.value = p?.about || '';
    area.disabled = false;
    if (p?.url) {
      link.href = new URL(p.url, document.baseURI).href;
      link.hidden = false;
    }
    recount();
  };
  area.addEventListener('input', () => {
    say('');
    recount();
  });
  save.addEventListener('click', async () => {
    const c = recount();
    if (c.over) {
      say(PROFILE_COPY.over(max), 'bad');
      return;
    }
    save.disabled = true;
    save.textContent = PROFILE_COPY.saving;
    try {
      s.profile = await s.account.saveAbout(area.value);
      show(s.profile);
      say(PROFILE_COPY.saved);
      engine.setData?.('profileAboutSaved', 'saved');
    } catch (err) {
      say(err?.message || PROFILE_COPY.failed, 'bad');
      engine.setData?.('profileAboutSaved', 'failed');
    } finally {
      save.textContent = PROFILE_COPY.save;
      recount();
    }
  });
  recount();
  s.profile = null;
  load(s).then(show).catch((err) => say(err?.message || PROFILE_COPY.failed, 'bad'));
  return box;
}

export const profilesFeature = {
  id: PROFILES_FEATURE_ID,

  init(engine) {
    if (engine.mode !== 'multiplayer' || typeof document === 'undefined' || globalThis.groddlePractice === true) return;
    state = create(engine);
  },

  onStreetEnter() {
    if (state) state.homeSince = 0;
  },

  onTick(dtMs, now, engine) {
    if (!state || engine.mode !== 'multiplayer' || !engine.started) return;
    const t = Date.now();
    if (t < state.checkAt) return;
    state.checkAt = t + CHECK_MS;
    if (!saving()) return;
    if (!state.avatar.busy) uploadAvatar(engine, state);
    const ctx = engine.homeContext?.();
    if (ctx?.inHome && ctx.room === 'street') {
      state.homeSince ||= t;
      if (t - state.homeSince >= HOME_SETTLE_MS && !state.home.busy && viewClear(engine)) uploadHome(engine, state);
    } else {
      state.homeSince = 0;
    }
  },

  /** account-backup-feature's multiplayer Account panel asks for the profile section. */
  accountProfile(host, engine) {
    if (!state || engine?.mode !== 'multiplayer' || !host) return null;
    mountProfile(host, engine, state);
    return true;
  },
};
