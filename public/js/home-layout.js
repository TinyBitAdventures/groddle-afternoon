/**
 * The home street as a layout (Austin 2026-11-02): what the profile page at
 * /players/<name>/ draws as a diorama from the game's own art, beside (and
 * later instead of) the picture the game uploads (js/profiles.js HOME_*).
 * The original website's profile header was a panorama of the home street
 * (homes/.../header-*.jpg); this keeps the street live on the page: each
 * thing on it can be hovered and named.
 *
 * features/profiles-feature.js walks the Pixi stage as the renderer draws it
 * (js/home-layout-scene.js) after the same settled seconds on the home street
 * as the picture, and this module turns what it found into the manifest the
 * site keeps (groddle-afternoon-site src/HomeLayout.php, PUT
 * groddle/v1/profile/home-layout). Nothing here re-derives a position: every
 * box comes from the game's own placement, read off the stage.
 *
 * Manifest, version 1 (the site validates every field again and keeps only
 * its normalized copy; numbers are view px, the picture's crop at 1x):
 *
 *   { v: 1, w, h,                        the stage: the location view (VIEW_W x LOCATION_VIEW_H)
 *     art: [path, ...],                  1x asset paths under assets/ (the site adds a @3x/@1.5x twin)
 *     draw: [entry, ...],                painter's order, back to front, one of:
 *       { sky: [#rgb, ...], x, y, w, h }              the sky gradient, top to bottom
 *       { col: '#rrggbb', x, y, w, h, o? }            a flat band (the field, the soil)
 *       { avatar: 1, x, y, w, h, f?, o?, s? }         the owner's avatar still (the site's own
 *                                                     picture), f 1 = facing right
 *       { txt, x, y, w, h, r?, s? }                   HOME_LAYOUT_TEXTS[txt] in that box (a sign's arm)
 *       { a, x, y, w, h, f?, r?, o?, t?, c?, s? }     art[a] in that box: f 1 = mirrored,
 *                                                     r degrees about the centre, o opacity,
 *                                                     t tint #rrggbb, c [x, y, w, h] the frame
 *                                                     cut from a sheet (art px), s its spot
 *     spots: [{ k, b: [x, y, w, h], i?, n?, s?, p?, f?, name? }, ...] }
 *
 * Spots are the things a visitor can point at: k is one of HOME_LAYOUT_KINDS,
 * i a class id (the site names it from the encyclopedia's item data), n a
 * count (a Tower's floors, a pole's notes, a signpost's friends), s a house
 * style key, p a project's percent, name a Tower's name (player text: the
 * site runs it through its word filter). The site writes every label itself;
 * nothing the game sends is shown as words except a Tower's filtered name.
 */
import { HIRES_SPRITES, SPLIT_SPRITES } from './sprite-hires.js?v=ac5f0e68';
import { HIRES_ICONS } from './icon-hires.js?v=165dbd6e';
import { CULTIVATION_CLASSES } from './homes-catalog.js?v=10ac34b6';
import { TOWER_CHASSIS, TOWER_PROTO } from './home-tower.js?v=087df38f';
import { GROWN_TREE_LABELS } from './patches.js?v=3103cc6a';
import { shortHash } from './profiles.js?v=054ca723';

export const HOME_LAYOUT_VERSION = 1;

/**
 * Version 2 (Austin 2026-11-03, "left/right arrow keys could allow the viewer to explore the html
 * mockup, like they were in camera mode"): the whole home street, not just the view. Each draw
 * entry sits in its layer's own coordinates, layers grouped back to front with the parallax factor
 * the game scrolls them by (homes-feature drawLandscape: a layer at f moves f px for each px the
 * camera moves; the street itself is 1, the sky 0), so the page can pan a camera along it.
 */
export const HOME_STREET_VERSION = 2;

/**
 * The site's limits (src/HomeLayout.php, a test holds them together): the
 * manifest as JSON, the stage's size, how many art paths, draw entries and
 * spots, and the reach of a box past the stage's edges.
 */
export const HOME_LAYOUT_LIMITS = Object.freeze({
  bytes: 48 * 1024,
  minW: 240,
  maxW: 2400,
  minH: 80,
  maxH: 1400,
  art: 160,
  draw: 400,
  spots: 80,
  reach: 4000,
  nameMax: 40,
});

/**
 * Version 2's limits over version 1's (src/HomeLayout.php the same): a home street is at most
 * 40 yard segments of 150 px and the 720 px lot (homes-catalog HOME_LIMITS, 6720 px).
 */
export const HOME_STREET_LIMITS = Object.freeze({
  bytes: 160 * 1024,
  maxSw: 8000,
  art: 240,
  draw: 1600,
  spots: 160,
  layers: 24,
});

/** The kinds of thing a spot can be (the site names each: src/HomeLayout.php KINDS). */
export const HOME_LAYOUT_KINDS = Object.freeze([
  'avatar', 'house', 'door', 'mailbox', 'signpost', 'dispatcher', 'tower', 'scaffolding',
  'cultivation', 'proto', 'note_pole', 'item',
]);

/** Path roots art may come from: Tiny Speck's CC0 decos and sprites, the home pieces. */
export const HOME_LAYOUT_ART_ROOTS = Object.freeze(['assets/decos/', 'assets/sprites/', 'assets/homes/', 'assets/ui/signpost/']);

/**
 * Words the game paints on the street that the page may show, by id: the site
 * holds the same table (src/HomeLayout.php TEXTS) and writes the words itself.
 */
export const HOME_LAYOUT_TEXTS = Object.freeze({ way_out: 'Back to Ur' });

/** New art (gz_ decos, made animals) is not Tiny Speck's: it never goes on a profile. */
const NOT_TINY_SPECK = /(^|\/)gz_|^assets\/sprites\/made\//;

const ART_PATH = /^assets\/[A-Za-z0-9_\-./@]+\.(png|webp|svg|jpg)$/;

/** HIRES_SPRITES values -> keys: a 3x sheet the textures loaded, as its 1x path. */
const SPRITE_1X = new Map([...HIRES_SPRITES].map(([one, three]) => [three, one]));

/** Split 3x parts (`<sheet>.p<n>@3x.webp`) -> their sheet and place (sprite-hires SPLIT_SPRITES). */
const SPLIT_PART = new Map();
for (const [sheet, split] of SPLIT_SPRITES) {
  for (const [url, from, count, cols] of split.parts) SPLIT_PART.set(url, { sheet, from, count, cols, fw: split.fw, fh: split.fh, sheetCols: split.cols });
}

/** A URL or path as a path from `assets/`, with no query, hash or origin ('' if none). */
function assetPath(url) {
  let s = String(url || '');
  const cut = s.search(/[?#]/);
  if (cut >= 0) s = s.slice(0, cut);
  const at = s.indexOf('assets/');
  if (at < 0) return '';
  s = s.slice(at);
  try {
    s = decodeURIComponent(s);
  } catch {
    return '';
  }
  return s;
}

/**
 * PURE: the 1x asset path a texture was loaded from, as the site serves it,
 * or null when it is none of Tiny Speck's art files. The loader's routes are
 * undone (js/textures.js addUrlRoute): a deco asked for as `<name>.png` ships
 * as `<name>.webp` (js/deco-hires.js; `@1.5x` is its twin), a 3x sprite sheet
 * is its HIRES_SPRITES key, a 3x icon its 1x `.webp`.
 */
export function layoutArtPath(url) {
  let s = assetPath(url);
  if (!s) return null;
  const deco = /^(assets\/decos\/groddle\/[^/]+?)(?:@1\.5x)?\.(png|webp)$/.exec(s);
  if (deco) s = `${deco[1]}.webp`;
  else if (SPRITE_1X.has(s)) s = SPRITE_1X.get(s);
  else {
    const icon = /^assets\/sprites\/icons\/([a-z0-9_]+)@3x\.webp$/.exec(s);
    if (icon && HIRES_ICONS.has(icon[1])) s = `assets/sprites/icons/${icon[1]}.webp`;
  }
  if (s.includes('..') || s.includes('//') || /@\d/.test(s)) return null;
  if (!ART_PATH.test(s) || NOT_TINY_SPECK.test(s)) return null;
  if (!HOME_LAYOUT_ART_ROOTS.some((root) => s.startsWith(root))) return null;
  return s;
}

/**
 * PURE: a frame of a split 3x part (js/sprite-hires.js pointAtPart moved the
 * frame there) as the same frame on its 1x sheet: { sheet, frame } or null.
 * frame is { x, y, width, height } in the part's 1x units.
 */
export function splitFrameToSheet(partUrl, frame) {
  const part = SPLIT_PART.get(assetPath(partUrl));
  if (!part || !frame) return null;
  const col = Math.floor((frame.x + 0.5) / part.fw);
  const row = Math.floor((frame.y + 0.5) / part.fh);
  if (col >= part.cols) return null;
  const j = row * part.cols + col;
  if (j >= part.count) return null;
  const cell = part.from + j;
  const dx = frame.x - col * part.fw;
  const dy = frame.y - row * part.fh;
  return {
    sheet: part.sheet,
    frame: {
      x: (cell % part.sheetCols) * part.fw + dx,
      y: Math.floor(cell / part.sheetCols) * part.fh + dy,
      width: frame.width,
      height: frame.height,
    },
  };
}

/** Class ids of what a cultivation becomes (CULTIVATION_CLASSES endItems), the trees a Patch grows, and the Patch's stages. */
const CULTIVATED = new Set([
  ...Object.values(CULTIVATION_CLASSES).flatMap((def) => def.endItems || []),
  ...Object.keys(GROWN_TREE_LABELS),
  'patch', 'patch_dark', 'patch_seedling',
]);

/** Targets the game registers on a home street, by class id: their kind. */
const KIND_BY_CLASS = Object.freeze({
  home_door: 'door',
  npc_mailbox: 'mailbox',
  home_return_marker: 'signpost',
  mp_home_signpost: 'signpost',
  npc_mail_dispatcher: 'dispatcher',
  mp_note_pole: 'note_pole',
  [TOWER_CHASSIS]: 'tower',
  [TOWER_PROTO]: 'scaffolding',
  mp_restore_proto: 'proto',
});

/** Class ids that are parts of something else (a garden's plots) or not things at all. */
const NOT_A_SPOT = new Set(['garden_plot', 'pc_player', 'mp_furn_sale', 'mp_currant_pile', 'npc_firefly']);

const CLASS_ID = /^[a-z0-9_]{1,64}$/;

/**
 * PURE: what a registered target on the home street is, as a spot's
 * description ({ k, i?, n? } without its box), or null when it is not one.
 * `tag` is a display object's own homeLayout description (the house, a
 * Tower, a garden), which wins.
 */
export function describeHomeThing({ classId, state, tag } = {}) {
  if (tag && HOME_LAYOUT_KINDS.includes(tag.k)) return cleanSpot(tag);
  const id = String(classId || '');
  if (!CLASS_ID.test(id) || NOT_A_SPOT.has(id)) return null;
  const kind = KIND_BY_CLASS[id];
  if (kind === 'signpost') return { k: 'signpost', ...(Array.isArray(state?.arms) ? { n: state.arms.length } : {}) };
  if (kind === 'proto') return null; // a friend's shared restore: the proto's own target names it
  if (kind) return { k: kind };
  if (CULTIVATION_CLASSES[id]) return { k: 'proto', i: id };
  if (CULTIVATED.has(id)) return { k: 'cultivation', i: id };
  return { k: 'item', i: id };
}

/** A spot description with only the fields the manifest knows, each in range. */
function cleanSpot(tag) {
  const out = { k: tag.k };
  if (typeof tag.i === 'string' && CLASS_ID.test(tag.i)) out.i = tag.i;
  if (Number.isFinite(tag.n)) out.n = Math.max(0, Math.min(99, Math.round(tag.n)));
  if (typeof tag.s === 'string' && CLASS_ID.test(tag.s)) out.s = tag.s;
  if (Number.isFinite(tag.p)) out.p = Math.max(0, Math.min(100, Math.round(tag.p)));
  if (tag.f === 1) out.f = 1;
  if (typeof tag.name === 'string') {
    const name = tag.name.replace(/[\p{C}]/gu, '').trim().slice(0, HOME_LAYOUT_LIMITS.nameMax);
    if (name) out.name = name;
  }
  return out;
}

/** Spots that may have no art of their own: a door is painted on the house. */
const SPOT_WITHOUT_ART = new Set(['door']);

const round = (v) => Math.round(Number(v) || 0);
const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const HEX = /^#[0-9a-f]{6}$/;

/** A colour (0xrrggbb number or '#rrggbb') as '#rrggbb', or null. */
export function hexColour(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return `#${(Math.max(0, Math.min(0xffffff, Math.round(value)))).toString(16).padStart(6, '0')}`;
  const s = String(value ?? '').toLowerCase();
  return HEX.test(s) ? s : null;
}

/**
 * PURE: an image's box from its four corners in stage px (top-left, top-right,
 * bottom-right, bottom-left of the art as drawn): the unrotated size, the
 * centre, whether it is mirrored and its rotation, and its bounding box.
 */
export function boxFromCorners([p0, p1, , p3]) {
  const ux = { x: p1.x - p0.x, y: p1.y - p0.y };
  const uy = { x: p3.x - p0.x, y: p3.y - p0.y };
  const w = Math.hypot(ux.x, ux.y);
  const h = Math.hypot(uy.x, uy.y);
  const mirrored = ux.x * uy.y - ux.y * uy.x < 0;
  const ax = mirrored ? -ux.x : ux.x;
  const ay = mirrored ? -ux.y : ux.y;
  let r = (Math.atan2(ay, ax) * 180) / Math.PI;
  if (Math.abs(r) < 0.05) r = 0;
  const cx = p0.x + (ux.x + uy.x) / 2;
  const cy = p0.y + (ux.y + uy.y) / 2;
  const xs = [p0.x, p1.x, p0.x + ux.x + uy.x, p3.x];
  const ys = [p0.y, p1.y, p0.y + ux.y + uy.y, p3.y];
  return {
    w, h, cx, cy, mirrored, r,
    aabb: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
  };
}

const overlaps = (a, w, h) => a[2] > 0 && a[3] > 0 && a[0] < w && a[1] < h;

/**
 * PURE: the manifest from what the scene walk found (js/home-layout-scene.js):
 *
 *   { w, h, draw: [record, ...], spots: [{ desc, aabb? }, ...] }
 *   record: { art, corners, frame?, sheet?, alpha?, tint?, spot? }   an image
 *         | { col, rect: [x, y, w, h], alpha? }                      a band
 *         | { sky: [colour, ...], rect: [x, y, w, h] }               the sky
 *
 * Off-stage and invisible entries are dropped, art paths deduplicated, each
 * spot's box made the union of its images (or its own bounds when it has
 * none), and the counts kept under HOME_LAYOUT_LIMITS: scenery goes first,
 * smallest first, never a spot's own art. Returns null when there is no stage.
 */
export function buildHomeLayout({ w, h, draw = [], spots = [], street = null } = {}) {
  const L = street ? { ...HOME_LAYOUT_LIMITS, ...HOME_STREET_LIMITS } : HOME_LAYOUT_LIMITS;
  const W = round(w);
  const H = round(h);
  if (!(W >= L.minW && W <= L.maxW && H >= L.minH && H <= L.maxH)) return null;
  // Version 2: the street's width and where the camera stood (the picture's frame).
  const SW = street ? Math.max(W, Math.min(L.maxSw, round(street.sw))) : W;
  const camX = street ? Math.max(0, Math.min(SW - W, Number(street.camX) || 0)) : 0;
  const factor = (rec) => (street ? Math.max(0, Math.min(1, Math.round((Number.isFinite(rec.f) ? rec.f : 1) * 1000) / 1000)) : 1);
  // A layer at f is in view from 0 to W + (SW - W) * f of its own x as the camera crosses the street.
  const span = (f) => W + (SW - W) * f;
  const clampReach = (v) => Math.max(-L.reach, Math.min(L.reach + (SW - W), round(v)));
  // Spots: the described ones, in order, with their own box when they have no art.
  const spotOut = [];
  const spotIndex = new Map();
  spots.forEach((spot, i) => {
    if (!spot?.desc || !HOME_LAYOUT_KINDS.includes(spot.desc.k)) return;
    spotIndex.set(i, spotOut.length);
    // Its own bounds were read on stage: on the street (f 1) that is camX further along.
    const own = Array.isArray(spot.aabb) ? [spot.aabb[0] + camX, spot.aabb[1], spot.aabb[2] + camX, spot.aabb[3]] : null;
    spotOut.push({ desc: cleanSpot(spot.desc), aabb: own, union: null });
  });
  // Draw entries on the stage.
  let entries = [];
  for (const raw of draw) {
    if (!raw) continue;
    const f = factor(raw);
    const dx = camX * f;
    const xMax = span(f);
    const rec = dx ? shifted(raw, dx) : raw;
    const alpha = rec.alpha == null ? 1 : Math.max(0, Math.min(1, Number(rec.alpha)));
    if (!(alpha >= 0.02)) continue;
    if (rec.avatar) {
      const [x, y, rw, rh] = (rec.rect || []).map(Number);
      if (![x, y, rw, rh].every(Number.isFinite) || rw < 1 || rh < 1) continue;
      const aabb = [x, y, x + rw, y + rh];
      if (!overlaps(aabb, xMax, H)) continue;
      const out = { avatar: 1, x: clampReach(x), y: clampReach(y), w: Math.min(L.reach, round(rw)), h: Math.min(L.reach, round(rh)) };
      if (rec.mirrored) out.f = 1;
      if (alpha < 1) out.o = round2(alpha);
      const spot = spotIndex.has(rec.spot) ? spotIndex.get(rec.spot) : null;
      entries.push({ kind: 'avatar', out, spot, area: rw * rh, aabb, f });
      continue;
    }
    if (rec.txt) {
      if (!Object.hasOwn(HOME_LAYOUT_TEXTS, rec.txt) || !Array.isArray(rec.corners) || rec.corners.length !== 4) continue;
      const box = boxFromCorners(rec.corners);
      if (!(box.w >= 1 && box.h >= 1) || !overlaps(box.aabb, xMax, H)) continue;
      const out = { txt: rec.txt, x: clampReach(box.cx - box.w / 2), y: clampReach(box.cy - box.h / 2), w: Math.max(1, round(box.w)), h: Math.max(1, round(box.h)) };
      if (box.r) out.r = Math.round((box.mirrored ? box.r + 180 : box.r) * 10) / 10;
      const spot = spotIndex.has(rec.spot) ? spotIndex.get(rec.spot) : null;
      entries.push({ kind: 'txt', out, spot, area: box.w * box.h, aabb: box.aabb, f });
      continue;
    }
    if (rec.sky || rec.col) {
      const [x, y, rw, rh] = (rec.rect || []).map(Number);
      if (![x, y, rw, rh].every(Number.isFinite) || rw < 1 || rh < 1) continue;
      const x0 = Math.max(0, x);
      const y0 = Math.max(0, y);
      const x1 = Math.min(rec.sky ? W : xMax, x + rw);
      const y1 = Math.min(H, y + rh);
      if (x1 - x0 < 1 || y1 - y0 < 1) continue;
      if (rec.sky) {
        const stops = rec.sky.map(hexColour).filter(Boolean).slice(0, 6);
        if (!stops.length) continue;
        // The gradient spans the sky sprite, not just the part on stage.
        entries.push({ kind: 'sky', out: { sky: stops, x: round(x), y: round(y), w: round(rw), h: round(rh) }, area: (x1 - x0) * (y1 - y0), f: street ? 0 : 1 });
      } else {
        const col = hexColour(rec.col);
        if (!col) continue;
        const out = { col, x: round(x0), y: round(y0), w: Math.min(L.reach + (SW - W), round(x1 - x0)), h: Math.min(L.reach, round(y1 - y0)) };
        if (alpha < 1) out.o = round2(alpha);
        entries.push({ kind: 'col', out, area: (x1 - x0) * (y1 - y0), f });
      }
      continue;
    }
    const art = layoutArtPath(rec.art);
    if (!art || !Array.isArray(rec.corners) || rec.corners.length !== 4) continue;
    const box = boxFromCorners(rec.corners);
    if (!(box.w >= 1 && box.h >= 1) || !overlaps(box.aabb, xMax, H)) continue;
    const out = { art, x: clampReach(box.cx - box.w / 2), y: Math.max(-L.reach, Math.min(L.reach, round(box.cy - box.h / 2))), w: Math.max(1, Math.min(L.reach, round(box.w))), h: Math.max(1, Math.min(L.reach, round(box.h))) };
    if (box.mirrored) out.f = 1;
    if (box.r) out.r = Math.round(box.r * 10) / 10;
    if (alpha < 1) out.o = round2(alpha);
    const tint = hexColour(rec.tint);
    if (tint && tint !== '#ffffff') out.t = tint;
    const fr = rec.frame;
    if (fr && [fr.x, fr.y, fr.width, fr.height].every(Number.isFinite) && fr.width >= 1 && fr.height >= 1) {
      const full = rec.sheet && Math.abs(fr.x) < 0.5 && Math.abs(fr.y) < 0.5 && Math.abs(fr.width - rec.sheet.width) < 0.5 && Math.abs(fr.height - rec.sheet.height) < 0.5;
      if (!full) out.c = [round(fr.x), round(fr.y), round(fr.width), round(fr.height)];
    }
    // A spot is on the street itself (f 1): art in a parallax layer is scenery.
    const spot = spotIndex.has(rec.spot) && f === 1 ? spotIndex.get(rec.spot) : null;
    entries.push({ kind: 'img', out, spot, area: box.w * box.h, aabb: box.aabb, f });
  }
  // Caps: scenery images go first, the smallest first; spot art and bands stay.
  const maxDraw = L.draw;
  if (entries.length > maxDraw) {
    const drop = new Set(entries.filter((e) => e.kind === 'img' && e.spot == null).sort((a, b) => a.area - b.area).slice(0, entries.length - maxDraw));
    entries = entries.filter((e) => !drop.has(e));
  }
  // Art paths, each once, in first-drawn order; the rarest past the cap go with their images.
  const artCount = new Map();
  for (const e of entries) if (e.kind === 'img') artCount.set(e.out.art, (artCount.get(e.out.art) || 0) + 1);
  if (artCount.size > L.art) {
    // A spot's own art first, then the art drawn most often.
    const keep = new Set(entries.filter((e) => e.kind === 'img' && e.spot != null).map((e) => e.out.art).slice(0, L.art));
    for (const [path] of [...artCount].sort((a, b) => b[1] - a[1])) {
      if (keep.size >= L.art) break;
      keep.add(path);
    }
    entries = entries.filter((e) => e.kind !== 'img' || keep.has(e.out.art));
  }
  const art = [];
  const artIndex = new Map();
  const drawOut = [];
  const drawF = new Map();
  const push = (item, e) => {
    drawF.set(item, e.f ?? 1);
    drawOut.push(item);
  };
  for (const e of entries.slice(0, maxDraw)) {
    if (e.kind === 'avatar') {
      // One avatar: the owner's.
      if (drawOut.some((d) => d.avatar)) continue;
      const item = { ...e.out };
      if (e.spot != null) {
        item.s = e.spot;
        spotOut[e.spot].union = [...e.aabb];
      }
      push(item, e);
      continue;
    }
    if (e.kind === 'txt') {
      const item = { ...e.out };
      if (e.spot != null) item.s = e.spot;
      push(item, e);
      continue;
    }
    if (e.kind !== 'img') {
      push(e.out, e);
      continue;
    }
    if (!artIndex.has(e.out.art)) {
      if (art.length >= L.art) continue;
      artIndex.set(e.out.art, art.length);
      art.push(e.out.art);
    }
    const { art: path, ...rest } = e.out;
    const item = { a: artIndex.get(path), ...rest };
    if (e.spot != null) {
      item.s = e.spot;
      const u = spotOut[e.spot];
      u.union = u.union ? [Math.min(u.union[0], e.aabb[0]), Math.min(u.union[1], e.aabb[1]), Math.max(u.union[2], e.aabb[2]), Math.max(u.union[3], e.aabb[3])] : [...e.aabb];
    }
    push(item, e);
  }
  // Each spot's box: its images' union, else its own bounds; on stage, or it goes. Only a door
  // (painted on the house's art) is a spot without art of its own: a thing drawn some other way
  // (the Butler's rig, a vector avatar) would be an empty box on the page.
  const finalIndex = new Map();
  const spotsOut = [];
  spotOut.forEach((spot, i) => {
    if (!spot.union && !SPOT_WITHOUT_ART.has(spot.desc.k)) return;
    const a = spot.union || spot.aabb;
    if (!a || !overlaps(a, SW, H) || spotsOut.length >= L.spots) return;
    const x0 = Math.max(-L.reach, a[0]);
    const y0 = Math.max(-L.reach, a[1]);
    const bw = Math.min(L.reach + (SW - W), a[2]) - x0;
    const bh = Math.min(L.reach, a[3]) - y0;
    if (bw < 1 || bh < 1) return;
    finalIndex.set(i, spotsOut.length);
    spotsOut.push({ ...spot.desc, b: [round(x0), round(y0), Math.max(1, round(bw)), Math.max(1, round(bh))] });
  });
  for (const item of drawOut) {
    if (item.s == null) continue;
    if (finalIndex.has(item.s)) item.s = finalIndex.get(item.s);
    else delete item.s;
  }
  if (!street) return { v: HOME_LAYOUT_VERSION, w: W, h: H, art, draw: drawOut, spots: spotsOut };
  // Layers: runs of one parallax factor, back to front (the street's own art runs between them).
  const layers = [];
  for (const item of drawOut) {
    const f = drawF.get(item);
    const last = layers[layers.length - 1];
    if (last && last.f === f) last.draw.push(item);
    else layers.push({ f, draw: [item] });
  }
  if (layers.length > L.layers) return null;
  return { v: HOME_STREET_VERSION, w: W, h: H, sw: SW, cx: round(camX), art, layers, spots: spotsOut };
}

/** A walk record moved dx px along x (its layer's own coordinates). */
function shifted(rec, dx) {
  const out = { ...rec };
  if (Array.isArray(rec.corners)) out.corners = rec.corners.map((p) => ({ x: p.x + dx, y: p.y }));
  if (Array.isArray(rec.rect)) out.rect = [rec.rect[0] + dx, ...rec.rect.slice(1)];
  return out;
}

/** PURE: the manifest as the JSON the site takes, and its size in bytes. */
export function homeLayoutJson(layout) {
  const json = JSON.stringify(layout);
  return { json, bytes: new TextEncoder().encode(json).length };
}

/**
 * PURE: the key a layout is sent under (the site keeps it, like a picture's):
 * the version, the home's style, HOME_REFRESH_MS's bucket (the picture's own,
 * profiles.js homeKeyOf) and what is on the street: the spots' kinds and
 * class ids, never where the avatar stood, so a new layout goes up when the
 * picture would, or when something on the street changes.
 */
export function homeLayoutKeyOf(layout, pictureKey) {
  const things = (layout?.spots || []).filter((s) => s.k !== 'avatar').map((s) => [s.k, s.i || '', s.n ?? '', s.s || '', s.p ?? '', s.name || ''].join(':')).join('|');
  const base = String(pictureKey || '').replace(/^h\d+-/, '');
  return `l${layout?.v === HOME_STREET_VERSION ? HOME_STREET_VERSION : HOME_LAYOUT_VERSION}-${base}-${shortHash(things)}`.slice(0, 64);
}
