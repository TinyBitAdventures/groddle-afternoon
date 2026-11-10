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
 *   (engine.snapshotView, the Pixi stage only, so none of the HUD) at 2x
 *   after a few settled seconds on their own home street, when the site has
 *   none or the home's key moved on (its style, or six hours: decorating
 *   shows the next visit). Up to 1920 wide as WebP, or JPEG where the
 *   browser cannot write WebP (profiles.js HOME_*). The website's profile
 *   header was a panorama of the home street (homes/.../header-*.jpg).
 * - The home street as a layout (js/home-layout.js, js/home-layout-scene.js):
 *   the same settled moment, what is drawn in the view read off the stage
 *   (each image's art and box, the sky and field, the things on it), sent
 *   to profile/home-layout so the page draws a diorama from the game's own
 *   art. Sent when the site has none, or the layout's key moved on (the
 *   picture's style and six hours, or a change in what is on the street),
 *   and only to a site that answers with a homeLayout field, so the game
 *   can go live before the site. A site whose answer lists 2 in
 *   homeLayoutVersions gets version 2: the whole street in parallax layers,
 *   starting at this view, which the page pans along like Camera Mode
 *   (groddle-afternoon-site players/home-pan.js); else version 1, the view.
 *   QA in solo: &homelayoutdemo=1 gives window.groddleHomeLayout() (the
 *   whole street now; ({ street: false }) for the view).
 * - The description: Menu > Account gets "Your profile" (a text box with a
 *   character count, Save, and "See your profile"), through the
 *   accountProfile query account-backup-feature asks.
 *
 * - Open Profile Page (Austin 2026-11-03, right-click audit decision 2): another
 *   player's menu (their Glitch, by a left or a right click) starts with the
 *   client's "Open Profile Page ..." row (InteractionMenuController.as 573-578,
 *   sort_on -10; its choice opened the page in a new window, 829). It opens
 *   /players/<slug>.<id>/ (profiles.js profilePagePath) in a new tab. Whether
 *   the page is public is looked up once per player on the street (a GET of
 *   that page: below level 5 the site answers 404), so the row can say why it
 *   cannot open. The menu from a list (a chat name, a buddy row, a Chats row:
 *   js/ui/player-menu.js) looks its player up when it opens, with the same
 *   10-minute cache. Until the answer comes the row is off ("Looking for
 *   <name>'s page"), and it is drawn again in the open menu when the answer
 *   lands (engine.refreshPlayerMenu), so it never opens the site's not-found
 *   page; a lookup that fails says so and is tried again after 15 s.
 *
 * Uploads are throttled (profiles.js shouldUpload: one try a minute, five
 * minutes after a failure; the site refuses a second within 15 s).
 * Multiplayer only: solo never loads a profile or draws anything.
 * QA: window.groddleProfiles (state, uploadAvatar, uploadHome, layout,
 * uploadLayout); canvas data profileAvatar / profileHome / profileHomeLayout
 * (idle, uploading, uploaded, failed),
 * profileAboutSaved (saved, failed), profilePage (the last opened page's path),
 * profilePages (id:public|none, the players looked up).
 */

import { createMinnAccount } from '../minn-account.js?v=8f2741cd';
import { drawListFor, loadCatalog, paintItems, prepareLook } from '../avatar-compositor.js?v=b5fec8e6';
import { drawListBounds } from '../avatar-rig.js?v=b67f0da8';
import { lookKey, resolveLook } from '../avatar-looks.js?v=64fab53e';
import {
  AVATAR_FRAME, AVATAR_STILL, AVATAR_TILE, FAILURE_BACKOFF_MS, HOME_BACKDROP, HOME_MAX_BYTES, HOME_QUALITY, HOME_RESOLUTION, HOME_SETTLE_MS, HOME_TYPES,
  PICTURE_RESOLUTION, PROFILE_COPY, PROFILE_PAGE_VERB,
  aboutCounter, profilePagePath, profilePageVerb, avatarKeyOf, base64Bytes, homeKeyOf, homeSizes, imageBase64, pngBase64, shouldUpload, stillTransform,
} from '../profiles.js?v=054ca723';
import { homeLayoutJson, homeLayoutKeyOf, HOME_LAYOUT_LIMITS } from '../home-layout.js?v=0ed5f834';
import { collectHomeLayout } from '../home-layout-scene.js?v=c112c276';

export const PROFILES_FEATURE_ID = 'profiles';

/** How often the feature looks at the look and the home (ms). */
const CHECK_MS = 1000;

let state = null;

/** Open Profile Page: each player looked up (id -> { status: 'public'|'none'|'', path, at }), one fetch at a time. */
const pages = new Map();
let pageFetch = null;
/** A lookup is kept this long (a player who reaches level 5 gets a page). */
const PAGE_TTL_MS = 10 * 60 * 1000;
/** A lookup that failed (or never answered) is tried again after this long. */
const PAGE_RETRY_MS = 15 * 1000;

/** Whether a lookup still stands (or is under way), so no new one is needed. */
function lookupStands(entry, now = Date.now()) {
  if (!entry) return false;
  if (entry.pending) return true;
  return now - entry.at < (entry.status === 'public' || entry.status === 'none' ? PAGE_TTL_MS : PAGE_RETRY_MS);
}
/** Guards verbOverride's own call to engine.targetVerbs (the composed player menu). */
let menuGuard = false;

/** The page a player's row opens: the site's own address once looked up, else the id path. */
function pageFor(id, name) {
  const known = pages.get(String(id));
  return known?.path || profilePagePath(name, id);
}

/**
 * Looks up one player's page (a same-origin GET; below level 5 the site answers 404). The entry
 * is in `pages` at once (status '' until the answer), so a menu drawn meanwhile does not ask again.
 * When the answer lands, a menu open for that player is drawn again (engine.refreshPlayerMenu).
 */
function lookUpPage(id, name, engine) {
  const key = String(id);
  const path = profilePagePath(name, id);
  if (!path || typeof fetch !== 'function' || typeof document === 'undefined') return null;
  const entry = { status: '', path, at: Date.now(), pending: null };
  pages.set(key, entry);
  entry.pending = (async () => {
    try {
      const r = await fetch(new URL(path, document.baseURI).href, { credentials: 'same-origin', redirect: 'follow', headers: { Accept: 'text/html' } });
      if (r.ok) {
        entry.status = 'public';
        // The page's own address (the site sends /players/<slug>.<id>/ on to it).
        try { entry.path = new URL(r.url).pathname || path; } catch { entry.path = path; }
      } else entry.status = r.status === 404 ? 'none' : 'failed';
      r.body?.cancel?.().catch?.(() => {});
    } catch {
      entry.status = 'failed';
    }
    entry.at = Date.now();
    entry.pending = null;
    engine?.setData?.('profilePages', [...pages].map(([k, v]) => `${k}:${v.status || '?'}`).join(','));
    engine?.refreshPlayerMenu?.(Number(id));
  })();
  return entry.pending;
}

/**
 * Each tick: the first player on the street not looked up (or looked up long ago) gets looked up.
 * Returns the lookup running (tests wait on it), or null.
 */
export function lookUpPlayersHere(engine) {
  if (pageFetch) return pageFetch;
  const client = engine.query?.('realtimeClient');
  const now = Date.now();
  for (const p of client?.players || []) {
    if (lookupStands(pages.get(String(p.id)), now)) continue;
    const running = lookUpPage(p.id, p.name, engine);
    if (!running) return null;
    pageFetch = running.finally(() => { pageFetch = null; });
    return pageFetch;
  }
  return null;
}

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
    home: { lastTry: 0, failedAt: 0, busy: false, status: 'idle', picture: null },
    layout: { lastTry: 0, failedAt: 0, busy: false, status: 'idle', bytes: 0, key: '' },
  };
  globalThis.groddleProfiles = {
    state: () => ({ profile: s.profile, avatar: { ...s.avatar }, home: { ...s.home }, layout: { ...s.layout }, homeSince: s.homeSince }),
    uploadAvatar: () => uploadAvatar(engine, s, { force: true }),
    uploadHome: () => uploadHome(engine, s, { force: true }),
    layout: () => collectHomeLayout(engine, { street: true }),
    uploadLayout: () => uploadLayout(engine, s, { force: true }),
  };
  return s;
}

const DATA_KEYS = { avatar: 'profileAvatar', home: 'profileHome', layout: 'profileHomeLayout' };

function mark(engine, s, which, status) {
  s[which].status = status;
  engine.setData?.(DATA_KEYS[which], status);
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
  return !['conflict', 'elsewhere', 'signed-out', 'error'].includes(st);
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

/** Whether this browser's canvas writes each type (learned on the first try: Safari hands back a PNG for a type it cannot write). */
const encoders = {};

/** A canvas as a base64 picture of `type`, or null when the browser wrote another type. */
async function encodeCanvas(canvas, type) {
  let dataUrl = '';
  if (typeof canvas.toBlob === 'function' && typeof FileReader === 'function') {
    // toBlob encodes off the main thread where the browser can.
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, HOME_QUALITY));
    if (!blob || blob.type !== type) return null;
    dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } else {
    dataUrl = canvas.toDataURL(type, HOME_QUALITY);
  }
  const picture = imageBase64(dataUrl);
  return picture.type === type && picture.b64 ? picture : null;
}

/**
 * The home street as the player sees it: the view at 2x, the widest size
 * that fits the site's limit, as WebP (JPEG where the browser cannot write
 * WebP). { b64, type, w, h, bytes } or null.
 */
async function drawHome(engine) {
  const view = engine.snapshotView?.({ resolution: HOME_RESOLUTION });
  if (!view?.width || !view?.height) return null;
  try {
    for (const { w, h } of homeSizes(view.width, view.height)) {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      ctx.fillStyle = HOME_BACKDROP;
      ctx.fillRect(0, 0, w, h);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(view, 0, 0, w, h);
      for (const type of HOME_TYPES) {
        if (encoders[type] === false) continue;
        const picture = await encodeCanvas(c, type);
        encoders[type] = Boolean(picture);
        if (!picture) continue;
        const bytes = base64Bytes(picture.b64);
        if (bytes <= HOME_MAX_BYTES) return { ...picture, w, h, bytes };
        // Too large in the best type this browser writes: the next size down, not a larger type.
        break;
      }
    }
    return null;
  } finally {
    // The 2x view is large (about 3360 x 1440 on a big window): let it go now.
    view.width = 0;
    view.height = 0;
  }
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
    const picture = await drawHome(engine);
    if (!picture) throw new Error('the view could not be drawn small enough');
    s.home.picture = { type: picture.type, w: picture.w, h: picture.h, bytes: picture.bytes };
    const home = picture.b64;
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

/**
 * The home street's layout, sent beside the picture (js/home-layout.js). Only
 * to a site that knows layouts (its profile answer has a homeLayout field);
 * keyed by the picture's style and six hours and by what is on the street.
 */
async function uploadLayout(engine, s, { force = false } = {}) {
  if (s.layout.busy || (!force && Date.now() - s.layout.failedAt < FAILURE_BACKOFF_MS)) return false;
  const ctx = engine.homeContext?.();
  if (!ctx?.inHome || ctx.room !== 'street') return false;
  s.layout.busy = true;
  try {
    const profile = await load(s);
    if (!profile || !Object.hasOwn(profile, 'homeLayout')) return false;
    // Version 2 (the whole street, to pan along) to a site that says it takes it; else version 1.
    const layout = collectHomeLayout(engine, { street: Array.isArray(profile.homeLayoutVersions) && profile.homeLayoutVersions.includes(2) });
    if (!layout) return false;
    const key = homeLayoutKeyOf(layout, homeKeyOf(ctx.style));
    const now = Date.now();
    if (!force && !shouldUpload({ held: profile.homeLayout, key, now, lastTry: s.layout.lastTry, failedAt: s.layout.failedAt })) return false;
    const { bytes } = homeLayoutJson(layout);
    if (bytes > HOME_LAYOUT_LIMITS.bytes) throw new Error(`the layout is ${bytes} bytes`);
    s.layout.lastTry = now;
    s.layout.bytes = bytes;
    s.layout.key = key;
    mark(engine, s, 'layout', 'uploading');
    s.profile = await s.account.uploadHomeLayout({ key, layout });
    s.layout.failedAt = 0;
    mark(engine, s, 'layout', 'uploaded');
    return true;
  } catch (err) {
    s.layout.failedAt = Date.now();
    mark(engine, s, 'layout', 'failed');
    console.warn('[profiles] home layout', err?.message || err);
    return false;
  } finally {
    s.layout.busy = false;
  }
}

const STYLE = `
.account-profile { margin-top: var(--sp-8); padding-top: 0.8rem; border-top: 1px solid var(--border); }
.account-profile h3 { margin: 0 0 0.3rem; font-size: var(--fs-lg); }
.account-profile label { display: block; margin: var(--sp-4) 0 var(--sp-2); font-weight: 700; }
.account-profile textarea { box-sizing: border-box; width: 100%; min-height: 6.5rem; resize: vertical; padding: var(--sp-4) var(--sp-5); border-radius: var(--radius-md);
  border: 2px solid var(--c-sand-86); background: var(--surface-card); color: var(--c-sand-28); font: inherit; }
.account-profile textarea:focus { outline: none; border-color: var(--c-orange-68); }
.account-profile .profile-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--sp-4); margin-top: 0.45rem; }
.account-profile [data-profile-count] { font-variant-numeric: tabular-nums; opacity: 0.75; }
.account-profile [data-profile-count][data-over] { color: var(--text-danger); opacity: 1; font-weight: 700; }
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
    // QA (solo too): &homelayoutdemo=1 reads the home street's layout off the stage; nothing is sent.
    if (engine.param?.('homelayoutdemo') && typeof window !== 'undefined') window.groddleHomeLayout = (opts = { street: true }) => collectHomeLayout(engine, opts);
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
    lookUpPlayersHere(engine);
    if (!saving()) return;
    if (!state.avatar.busy) uploadAvatar(engine, state);
    const ctx = engine.homeContext?.();
    if (ctx?.inHome && ctx.room === 'street') {
      state.homeSince ||= t;
      if (t - state.homeSince >= HOME_SETTLE_MS && viewClear(engine)) {
        if (!state.layout.busy) uploadLayout(engine, state);
        if (!state.home.busy) uploadHome(engine, state);
      }
    } else {
      state.homeSince = 0;
    }
  },

  /**
   * Another player's Glitch (pc_remote, drawn by realtime and party): its menu starts with Open
   * Profile Page (the client's sort_on -10), disabled with the reason when they have no public page.
   */
  verbOverride(target, engine) {
    if (menuGuard || target?.classId !== 'pc_remote' || !target.playerId || engine?.mode !== 'multiplayer') return null;
    menuGuard = true;
    let base;
    try {
      base = engine.targetVerbs?.(target) || [];
    } finally {
      menuGuard = false;
    }
    const name = target.label || target.name || '';
    // Not known (a name in a list, a player just arrived): look them up now; the row is off until the answer.
    if (!lookupStands(pages.get(String(target.playerId)))) lookUpPage(target.playerId, name, engine);
    return [profilePageVerb(name, pages.get(String(target.playerId))?.status || ''), ...base.filter((v) => v.id !== PROFILE_PAGE_VERB)];
  },

  runVerbOverride(target, verbId, engine) {
    if (verbId !== PROFILE_PAGE_VERB || target?.classId !== 'pc_remote' || !target.playerId) return null;
    // Only a page known to be there (the row is off otherwise): never the site's not-found page.
    if (pages.get(String(target.playerId))?.status !== 'public') return true;
    const path = pageFor(target.playerId, target.label || target.name || '');
    if (!path || typeof window === 'undefined') return true;
    const url = new URL(path, document.baseURI).href;
    window.open(url, '_blank', 'noopener');
    engine?.setData?.('profilePage', path);
    return true;
  },

  /** account-backup-feature's multiplayer Account panel asks for the profile section. */
  accountProfile(host, engine) {
    if (!state || engine?.mode !== 'multiplayer' || !host) return null;
    mountProfile(host, engine, state);
    return true;
  },
};
