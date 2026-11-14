#!/usr/bin/env node
/**
 * The Map's other views (G471): the GO buttons' colours, the world map and the subway map.
 *
 * GO buttons (MapHubButton.as 45-53, 81, 145-150): each exit to another region is drawn in that
 * region's own colour, its ring filled with it and its "To: <region>" written in it. GSJS fills
 * the colour from the target hub's map data when the exit has none of its own
 * (locations/location.js get_map 2990-2996: `o.color = config.data_maps.maps[o.hub_id].color`),
 * and the client puts back a missing "#" and falls back to #cc0000. The colours come from
 * inc_data_maps_prod.js maps_get_maps() as HUB_COLOURS.
 *
 * World map (HubMapDialog.as loadWorldMapIfNeeded 267-332, showYouOnWorld 368-388): one overlay,
 * GSJS inc_data_overlays.js 'world_map' (c2.glitch.bz/overlays/2012-11-27/1354075991_1812.swf), whose
 * CC0 source is glitch-overlays/world_map.fla. Its stage is the map's 760 x 460 and holds, bottom to
 * top: `bg` (world_map_locked.jpg, the sketched chart), `bg_reveal` (world_map_unlocked.jpg, the
 * painted one, unmasked by the client where regions may be clicked), `locked` (119 faint tiles at
 * 14% over the unbuilt land), `outlines` (one sketched frame per region at 50%) and `FlashAICB`
 * (47 region clips, region_<hub id>: an invisible frame you click, which on hover plays "over" up
 * to a card with the region's thumbnail and its hand-lettered name). The document class that
 * masked the reveal (world_map.as) is not in the FLA; the Tribute Blog's world maps of
 * Nov 2012 (posts 38005474341, 45119695823, 49865657967, 49872342514: one world map at four
 * dates, reference only) show the painted chart glowing through round each region's frames.
 *
 * Hover cards at 2x (Austin, 2026-11-13: sharpen the cards with the World map's 2x charts): a card
 * draws its region's 150 x 91 thumbnail (z_hub_maps_small/sm_*.jpg, a quality-50 JPEG) at about
 * 133 x 81 map units, soft on a Retina screen. Every region the cards show now has a full painting
 * (public/assets/maps/art/bg, tools/map-backgrounds/build.mjs), and a thumbnail is that painting's
 * whole frame scaled (tools/map-backgrounds/build.mjs; the repaints were made from the thumbnails
 * over the same 760 x 460 frame). So the card's picture is the region's painting (its @2x file)
 * scaled to the thumbnail's box at 2x, CARD_PICTURE, as WebP (CARD_RECIPE), still embedded as a
 * data: URI (a card is drawn as an SVG image, where an outside reference does not load) and still
 * drawn at the thumbnail's 150 x 91 (the frame, the lettering and every placement as Tiny Speck drew
 * them). The thumbnail itself then ships in no card. A card whose thumbnail has no region painting
 * keeps Tiny Speck's thumbnail. Baqala's card (region_86) drew Zhambu's thumbnail in the FLA; it
 * now carries Baqala's own painting. Which card carries which painting: CARDS_MANIFEST. Encoding needs
 * ImageMagick 7 (magick); a picture is encoded again only when its painting or the recipe changes,
 * and --check (no ImageMagick) checks each embedded picture against the manifest's hashes.
 *
 * Writes
 *   public/assets/maps/art/world/world_map_locked.jpg  the FLA's locked chart, its JPEG as is
 *       (world_map_unlocked.jpg is already there, byte for byte the FLA's; both charts' Retina twins,
 *       world_map_*@2x.webp, are shipped files the module only names: tools/provenance/world-map-2x.json)
 *   public/assets/maps/art/world/frames.svg  the `locked` and `outlines` layers: each frame
 *       drawing once as a <symbol>, one <use> a frame (the FLA's vectors through
 *       tools/overlay-art/xfl-svg.mjs)
 *   public/assets/maps/art/world/cards/<hub id>.svg  each region's hover card at its "over" stop
 *       (frame 10): the sketched frame, the region's painting at 2x in the thumbnail's 150 x 91 box
 *       (Tiny Speck's thumbnail where there is no painting), the lettered name
 *   public/assets/maps/art/world/cards/cards.json  which card carries which painting (hashes, recipe)
 *   public/js/map-views-data.js  HUB_COLOURS and WORLD_MAP (each region's click frame as a
 *       quad, its centre for the "you" star, its card's placement)
 *
 *   node tools/map-views/build.mjs          build (ImageMagick 7 when a card picture needs encoding)
 *   node tools/map-views/build.mjs --check  exit 1 when any output is stale (tests/map-views.test.js)
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { readZip } from '../avatar-compositor/xfl.mjs';
import { frameSvg, loadFla } from '../overlay-art/xfl-svg.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const spike = join(here, '../..');
const audit = join(spike, '..');
export const FLA = 'glitch-overlays/world_map.fla';
const GSJS_MAPS = 'glitch-GameServerJS/inc_data_maps_prod.js';
const WORLD_DIR = 'public/assets/maps/art/world';
const MODULE = 'public/js/map-views-data.js';
/** URLs as the game fetches them (relative to /play/). */
const URL_DIR = 'assets/maps/art/world';
export const FRAME = Object.freeze([760, 460]);
/** The region clip's "over" playhead stops on frame 10 (index 9, stop()); 12 ticks from "over" is past it. */
const CARD_TICK = 12;
/** The thumbnails' library folder in the FLA (sm_<region>.jpg, 150 x 91). */
const THUMB_FOLDER = 'z_hub_maps_small/';
/** The region paintings' manifest (tools/map-backgrounds/build.mjs). */
const BACKGROUNDS = 'public/assets/maps/art/bg/backgrounds.json';
export const CARDS_MANIFEST = `${WORLD_DIR}/cards/cards.json`;
/** A card's picture: the thumbnail's 150 x 91 box at 2x. */
export const CARD_PICTURE = Object.freeze([300, 182]);
/** The painting (its 1520 x 920 @2x file) to CARD_PICTURE: ImageMagick steps, WebP to stdout. */
export const CARD_RECIPE = Object.freeze(['-filter', 'Lanczos', '-resize', `${CARD_PICTURE[0]}x${CARD_PICTURE[1]}!`, '-strip', '-quality', '75', '-define', 'webp:method=6']);
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

const r2 = (v) => Math.round(v * 100) / 100;
const mul = (p, q) => [
  p[0] * q[0] + p[2] * q[1], p[1] * q[0] + p[3] * q[1],
  p[0] * q[2] + p[2] * q[3], p[1] * q[2] + p[3] * q[3],
  p[0] * q[4] + p[2] * q[5] + p[4], p[1] * q[4] + p[3] * q[5] + p[5],
];
const apply = (m, p) => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
const I = [1, 0, 0, 1, 0, 0];

/** Hub id -> "#rrggbb" from GSJS maps_get_maps(), with the client's "#" put back (MapHubButton.as 53). */
export function hubColours(src = readFileSync(join(audit, GSJS_MAPS), 'utf8')) {
  const box = { config: {}, log: { info() {}, error() {} } };
  vm.runInNewContext(`${src}\nthis.maps = maps_get_maps();`, box);
  const out = {};
  for (const id of Object.keys(box.maps).sort((a, b) => Number(a) - Number(b))) {
    const c = String(box.maps[id]?.color || '').trim();
    if (!/^#?[0-9a-f]{6}$/i.test(c)) continue;
    out[id] = (c[0] === '#' ? c : `#${c}`).toLowerCase();
  }
  return out;
}

/** The trailing 16 bytes the FLA's bin keeps after a JPEG's end marker go. */
function jpegBytes(buf) {
  const end = buf.lastIndexOf(Buffer.from([0xff, 0xd9]));
  return end > 0 ? buf.subarray(0, end + 2) : buf;
}

/** Bounds of a list of elements (a frame's), in the space `m` maps to. */
function bounds(fla, els, m, acc = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }) {
  for (const e of els) {
    if (e.k === 'group') bounds(fla, e.members, m, acc);
    else if (e.k === 'shape') {
      const mm = mul(m, e.m);
      for (const d of e.paths.values()) {
        const n = String(d).match(/-?\d*\.?\d+(?:e-?\d+)?/g)?.map(Number) || [];
        for (let i = 0; i + 1 < n.length; i += 2) {
          const [px, py] = apply(mm, [n[i], n[i + 1]]);
          acc.x0 = Math.min(acc.x0, px); acc.y0 = Math.min(acc.y0, py);
          acc.x1 = Math.max(acc.x1, px); acc.y1 = Math.max(acc.y1, py);
        }
      }
    } else if (e.k === 'bmp') {
      const px = fla.bitmaps.get(e.lib)?.px;
      if (!px) continue;
      const mm = mul(m, e.m);
      for (const [x, y] of [[0, 0], [px.w, 0], [0, px.h], [px.w, px.h]]) {
        const [qx, qy] = apply(mm, [x, y]);
        acc.x0 = Math.min(acc.x0, qx); acc.y0 = Math.min(acc.y0, qy);
        acc.x1 = Math.max(acc.x1, qx); acc.y1 = Math.max(acc.y1, qy);
      }
    } else if (e.k === 'inst') {
      const sym = fla.symbols.get(e.lib);
      if (!sym) continue;
      for (const L of sym.layers) {
        const f = L.frames.find((fr) => fr.index <= 0 && fr.index + fr.duration > 0);
        if (f) bounds(fla, f.els, mul(m, e.m), acc);
      }
    }
  }
  return acc;
}

/** A symbol's elements at a frame index (the keyframe whose span holds it), layer by layer. */
function elementsAt(sym, index) {
  const out = [];
  for (const L of sym.layers) {
    if (L.type === 'guide' || L.type === 'folder') continue;
    const f = L.frames.find((fr) => fr.index <= index && fr.index + fr.duration > index);
    if (f) out.push(...f.els);
  }
  return out;
}

/** Every bitmap a list of elements draws, on any frame of any symbol it holds (library names). */
function bitmapLibs(fla, els, acc = new Set(), seen = new Set()) {
  for (const e of els) {
    if (e.k === 'bmp') acc.add(e.lib);
    else if (e.k === 'group') bitmapLibs(fla, e.members, acc, seen);
    else if (e.k === 'inst' && !seen.has(e.lib)) {
      seen.add(e.lib);
      for (const L of fla.symbols.get(e.lib)?.layers || []) for (const f of L.frames) bitmapLibs(fla, f.els, acc, seen);
    }
  }
  return acc;
}

/** A one-layer main timeline holding these elements, for frameSvg. */
function stageOf(fla, els, frames = 1) {
  const main = {
    name: 'main',
    layers: [{ i: 0, name: 'build', type: 'normal', parent: null, visible: true, frames: [{ index: 0, duration: frames, tween: null, accel: 0, curves: null, single: true, rotate: 'auto', turns: 0, label: null, acts: [], els }] }],
    frameCount: frames,
    labels: new Map(),
    scripts: new Map(),
  };
  return { ...fla, main };
}

/** An SVG's body (between its <defs>..</defs> and </svg>), and its defs. */
function svgParts(svg) {
  const defs = svg.match(/<defs>([\s\S]*?)<\/defs>/)?.[1] || '';
  const body = svg.replace(/^[\s\S]*?<\/defs>/, '').replace(/<\/svg>\s*$/, '');
  return { defs, body };
}

const fmt = (m) => m.map(r2).join(' ');

/**
 * Everything the world map needs from the FLA: { locked (JPEG bytes), unlocked (JPEG bytes),
 * framesSvg, cards: Map<id, svg>, thumbs: Map<id, thumbnail library name>, regions }.
 * picture(id, thumb): a data: URL to draw in the thumbnail's box instead of the thumbnail, or null.
 */
export function readWorldMap(flaPath = join(audit, FLA), picture = () => null) {
  const fla = loadFla(flaPath);
  const zip = readZip(flaPath);
  const layer = (name) => fla.main.layers.find((l) => l.name === name)?.frames[0]?.els || [];
  const bitmap = (name) => {
    const item = [...zip.read('DOMDocument.xml').toString('utf8').matchAll(/<DOMBitmapItem [^>]*>/g)]
      .map((m) => m[0]).find((t) => t.includes(`name="${name}"`));
    const href = item?.match(/bitmapDataHRef="([^"]+)"/)?.[1];
    if (!href) throw new Error(`${FLA}: no bitmap ${name}`);
    return jpegBytes(zip.read(`bin/${href}`));
  };

  // The frames: each distinct (symbol, colour) drawn once, then placed.
  const symbols = new Map();
  const uses = [];
  const place = (inst, m) => {
    const key = `${inst.lib}|${(inst.ct || []).join(',')}`;
    if (!symbols.has(key)) {
      const svg = frameSvg(stageOf(fla, [{ ...inst, m: I }]), 0, {});
      symbols.set(key, { id: `f${symbols.size}`, ...svgParts(svg) });
    }
    uses.push(`<use href="#${symbols.get(key).id}" transform="matrix(${fmt(m)})"/>`);
  };
  for (const inst of layer('locked')) if (inst.k === 'inst') place(inst, inst.m);
  for (const inst of layer('outlines')) {
    if (inst.k !== 'inst') continue;
    // An outline symbol is its frame drawing at 50%: place that drawing.
    for (const inner of elementsAt(fla.symbols.get(inst.lib), 0)) if (inner.k === 'inst') place(inner, mul(inst.m, inner.m));
  }
  const defs = [...symbols.values()].map((s) => `${s.defs}<symbol id="${s.id}" overflow="visible">${s.body}</symbol>`).join('');
  const [W, H] = FRAME;
  const framesSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${defs}</defs>${uses.join('')}</svg>\n`;

  // The regions.
  const regions = {};
  const cards = new Map();
  const thumbs = new Map();
  for (const inst of layer('FlashAICB')) {
    const id = inst.k === 'inst' ? inst.lib.match(/\/region_(\d+)$/)?.[1] : null;
    if (!id) continue;
    const sym = fla.symbols.get(inst.lib);
    // The click frame: the frame drawing on frame 1 (alpha 0, the clip's hit area).
    const hit = elementsAt(sym, 0).find((e) => e.k === 'inst');
    const fb = bounds(fla, [hit], I);
    const quad = [[fb.x0, fb.y0], [fb.x1, fb.y0], [fb.x1, fb.y1], [fb.x0, fb.y1]].map((p) => apply(inst.m, p).map(r2));
    const cx = r2(quad.reduce((s, p) => s + p[0], 0) / 4);
    const cy = r2(quad.reduce((s, p) => s + p[1], 0) / 4);
    // The card: the "over" stop's drawing, in the clip's own space, then placed by the clip's
    // matrix and slid inside the map where it would run past an edge.
    const over = elementsAt(sym, 9);
    const cb = bounds(fla, over, I);
    const pad = 4;
    const box = [cb.x0 - pad, cb.y0 - pad, cb.x1 - cb.x0 + pad * 2, cb.y1 - cb.y0 + pad * 2].map(r2);
    const corners = [[box[0], box[1]], [box[0] + box[2], box[1]], [box[0], box[1] + box[3]], [box[0] + box[2], box[1] + box[3]]].map((p) => apply(inst.m, p));
    const wx0 = Math.min(...corners.map((p) => p[0]));
    const wx1 = Math.max(...corners.map((p) => p[0]));
    const wy0 = Math.min(...corners.map((p) => p[1]));
    const wy1 = Math.max(...corners.map((p) => p[1]));
    const dx = wx0 < 2 ? 2 - wx0 : wx1 > W - 2 ? W - 2 - wx1 : 0;
    const dy = wy0 < 2 ? 2 - wy0 : wy1 > H - 2 ? H - 2 - wy1 : 0;
    const m = [inst.m[0], inst.m[1], inst.m[2], inst.m[3], inst.m[4] + dx, inst.m[5] + dy].map(r2);
    // The card's thumbnail: the one bitmap from the thumbnails' folder the clip draws.
    const thumb = [...bitmapLibs(fla, [inst])].filter((l) => l.startsWith(THUMB_FOLDER));
    if (thumb.length !== 1) throw new Error(`${FLA}: region_${id} draws ${thumb.length} thumbnails`);
    thumbs.set(id, thumb[0]);
    const url = picture(id, thumb[0]);
    let cardFla = fla;
    if (url) {
      // The picture takes the thumbnail's place at the thumbnail's own size (one bitmap pixel is
      // one stage unit), so the card draws exactly as before, only sharper.
      const b = fla.bitmaps.get(thumb[0]);
      cardFla = { ...fla, bitmaps: new Map(fla.bitmaps).set(thumb[0], { ...b, px: { ...b.px, url } }) };
    }
    const card = frameSvg(stageOf(cardFla, [{ ...inst, m: I }], 30), CARD_TICK, { box, start: { [inst.lib]: 'over' } });
    cards.set(id, `${card}\n`);
    regions[id] = { quad, centre: [cx, cy], card: { box, m } };
  }
  return { locked: bitmap('zz_background/world_map_locked'), unlocked: bitmap('zz_background/world_map_unlocked'), framesSvg, cards, thumbs, regions };
}

export function moduleText(colours, world) {
  const ids = Object.keys(world.regions).sort((a, b) => Number(a) - Number(b));
  const rows = ids.map((id) => {
    const r = world.regions[id];
    return `    ${JSON.stringify(id)}: Object.freeze({ quad: ${JSON.stringify(r.quad)}, centre: ${JSON.stringify(r.centre)}, card: Object.freeze({ href: '${URL_DIR}/cards/${id}.svg', box: ${JSON.stringify(r.card.box)}, m: ${JSON.stringify(r.card.m)} }) }),`;
  });
  return `// Generated by tools/map-views/build.mjs from ${GSJS_MAPS} (maps_get_maps) and
// ${FLA} (Tiny Speck, CC0). Do not edit.

/** Hub id -> its map colour, the colour of a GO button that leads there (MapHubButton.as; GSJS location.js get_map 2996). */
export const HUB_COLOURS = Object.freeze(${JSON.stringify(colours)});

/**
 * The world map (world_map.fla, HubMapDialog.as): the locked and painted charts (760 x 460, and
 * their 1520 x 920 Retina twins, sharpened from them: tools/provenance/world-map-2x.json), the frames
 * overlay, and the 47 regions by hub id: the clip's click frame as a quad (map units), its
 * centre (where the client put the "you" star, showYouOnWorld 374-381) and its hover card
 * (drawn in the clip's own space over box [x, y, w, h], placed by matrix m).
 */
export const WORLD_MAP = Object.freeze({
  w: ${FRAME[0]},
  h: ${FRAME[1]},
  locked: '${URL_DIR}/world_map_locked.jpg',
  unlocked: '${URL_DIR}/world_map_unlocked.jpg',
  lockedHi: '${URL_DIR}/world_map_locked@2x.webp',
  unlockedHi: '${URL_DIR}/world_map_unlocked@2x.webp',
  frames: '${URL_DIR}/frames.svg',
  regions: Object.freeze({
${rows.join('\n')}
  }),
});
`;
}

const readJsonIf = (rel) => {
  try {
    return JSON.parse(readFileSync(join(spike, rel), 'utf8'));
  } catch {
    return null;
  }
};

/** The WebP pictures a card file embeds now (bytes), to keep one whose painting and recipe stand. */
function embeddedPictures(id) {
  const abs = join(spike, WORLD_DIR, 'cards', `${id}.svg`);
  if (!existsSync(abs)) return [];
  return [...readFileSync(abs, 'utf8').matchAll(/href="data:image\/webp;base64,([A-Za-z0-9+/=]+)"/g)].map((m) => Buffer.from(m[1], 'base64'));
}

/**
 * The cards' pictures: a picture(id, thumb) for readWorldMap and the manifest it fills.
 * encode: run ImageMagick for a picture that cannot be kept (otherwise it comes out empty, and so stale).
 */
export function cardPictures({ encode = false } = {}) {
  const bg = readJsonIf(BACKGROUNDS)?.regions || {};
  const bySymbol = new Map(Object.entries(bg).filter(([, r]) => r.symbol).map(([id, r]) => [r.symbol, { id, ...r }]));
  const old = readJsonIf(CARDS_MANIFEST);
  const sameRecipe = JSON.stringify(old?.recipe) === JSON.stringify(CARD_RECIPE);
  const cards = {};
  const picture = (id, thumb) => {
    // The card's own region's painting. Tiny Speck's Baqala card (region_86) draws Zhambu's
    // thumbnail (sm_zhambu; sm_baqala is in the FLA but on no card): a slip with no use, so the
    // card gets Baqala's painting and the manifest says what the FLA drew (`thumbOf`).
    // The paintings' manifest names a thumbnail without its .jpg (z_hub_maps_small/sm_ix).
    const r = bg[id] ? { id, ...bg[id] } : null;
    const of = bySymbol.get(thumb.replace(/\.jpg$/i, ''))?.id;
    const drew = of && of !== id ? { thumb, thumbOf: of } : { thumb };
    if (!r) {
      cards[id] = { ...drew, painting: null };
      return null;
    }
    const painting = readFileSync(join(spike, 'public', r.x2));
    const paintingSha = sha256(painting);
    const was = old?.cards?.[id];
    let pic = sameRecipe && was?.painting?.sha256 === paintingSha
      ? embeddedPictures(id).find((b) => sha256(b) === was.picture?.sha256) : null;
    if (!pic && encode) pic = execFileSync('magick', [join(spike, 'public', r.x2), ...CARD_RECIPE, 'webp:-'], { maxBuffer: 1 << 24 });
    pic ||= Buffer.alloc(0);
    cards[id] = {
      hubName: r.hubName,
      ...drew,
      painting: { file: r.x2, kind: r.repainted ? 'made for Groddle' : 'Tiny Speck\'s thumbnail enlarged', provenance: r.repainted || BACKGROUNDS.replace(/^public\//, ''), sha256: paintingSha },
      picture: { type: 'image/webp', w: CARD_PICTURE[0], h: CARD_PICTURE[1], bytes: pic.length, sha256: sha256(pic) },
    };
    return `data:image/webp;base64,${pic.toString('base64')}`;
  };
  const manifest = () => ({
    note: 'The World map\'s hover cards (glitch-overlays/world_map.fla region clips, Tiny Speck, CC0): each card\'s 150 x 91 thumbnail replaced by its region\'s painting at 2x (the painting\'s provenance in the file named; a painting made for Groddle is the same CC0 picture its region map shows), drawn in the thumbnail\'s box. `thumbOf`: the FLA\'s card drew another region\'s thumbnail (Baqala\'s drew Zhambu\'s); the card carries its own region\'s painting. A card with `painting: null` keeps Tiny Speck\'s thumbnail. Built by tools/map-views/build.mjs; do not edit.',
    source: { fla: FLA, folder: `LIBRARY/${THUMB_FOLDER}` },
    picture: CARD_PICTURE,
    recipe: CARD_RECIPE,
    cards: Object.fromEntries(Object.entries(cards).sort(([a], [b]) => Number(a) - Number(b))),
  });
  return { picture, manifest };
}

/** Every output as [path, Buffer|string]. */
export function outputs({ encode = false } = {}) {
  const colours = hubColours();
  const pics = cardPictures({ encode });
  const world = readWorldMap(join(audit, FLA), pics.picture);
  const files = [
    [`${WORLD_DIR}/world_map_locked.jpg`, world.locked],
    [`${WORLD_DIR}/world_map_unlocked.jpg`, world.unlocked],
    [`${WORLD_DIR}/frames.svg`, world.framesSvg],
    [MODULE, moduleText(colours, world)],
  ];
  for (const [id, svg] of [...world.cards].sort((a, b) => Number(a[0]) - Number(b[0]))) files.push([`${WORLD_DIR}/cards/${id}.svg`, svg]);
  files.push([CARDS_MANIFEST, `${JSON.stringify(pics.manifest(), null, 2)}\n`]);
  return files;
}

function main() {
  const check = process.argv.includes('--check');
  const files = outputs({ encode: !check });
  const stale = [];
  for (const [rel, data] of files) {
    const abs = join(spike, rel);
    const want = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const have = existsSync(abs) ? readFileSync(abs) : null;
    if (have && have.equals(want)) continue;
    stale.push(rel);
    if (!check) {
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, want);
    }
  }
  // Cards for regions the FLA no longer holds.
  const cardDir = join(spike, WORLD_DIR, 'cards');
  const keep = new Set(files.map(([rel]) => rel));
  for (const f of existsSync(cardDir) ? readdirSync(cardDir) : []) {
    const rel = `${WORLD_DIR}/cards/${f}`;
    if (keep.has(rel)) continue;
    stale.push(rel);
    if (!check) rmSync(join(cardDir, f));
  }
  if (check) {
    if (stale.length) {
      console.error(`map views stale: ${stale.join(', ')} (node tools/map-views/build.mjs)`);
      process.exit(1);
    }
    console.log(`map views up to date (${files.length} files)`);
    return;
  }
  console.log(stale.length ? `wrote ${stale.length} of ${files.length} files` : `up to date (${files.length} files)`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
