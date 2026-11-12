#!/usr/bin/env node
/**
 * LEVEL BUILDER art pack: an art bible and one image-model prompt per piece of a zone's art, so
 * a person (or later an API) can make a zone's art with an image model, one layer or one object
 * per picture, in Tiny Speck's style. tools/builder/art-intake.mjs takes the pictures back.
 *
 *   node tools/builder/art-bible.mjs <draft id | file:zone.json> [--brief <brief.json>] [--out <dir>]
 *       [--no-refs] [--streets 8] [--refs 8]
 *
 * Reads the zone (a draft is pulled with the builder key, as cli.mjs does), its brief
 * (tools/builder/art/briefs/<zone id>.json by default: the zone in words, its colours and each
 * piece's description), Tiny Speck's shipped streets with tools/builder/deco-palette.json (each
 * library deco's measured colour) and the style profiles (public/assets/content/style-profiles.json).
 * Writes into --out:
 *
 *   art-bible.md     the look in plain words: palette swatches (the brief's, and the nearest
 *                    tones measured from the closest Tiny Speck streets), light, line, shading,
 *                    texture, what to avoid, each layer's depth cues, and the references
 *   prompts/NN-<piece>.txt   one self-contained prompt per piece (exact size, one layer or one
 *                    object only, the background rule, seams for strips, the style paragraph)
 *   pack.md          the steps in T3 Chat: which files to attach, what to save each result as
 *   pieces.json      the same for tools (art-intake.mjs reads it)
 *   ref-NN-<deco>.png, ref-sheet.png   Tiny Speck CC0 decos chosen by colour and subject, on a
 *                    neutral grey, to attach as style references (refs.json has their sources);
 *                    needs ImageMagick 7, skipped with --no-refs
 *   drop/            where the person saves the pictures
 *
 * Everything but the reference pictures is a pure function of its inputs (buildPack), so the same
 * zone, brief and streets write the same bytes.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { glitchLayerMatrix, DECO_TWINS } from '../../public/js/street-render.js?v=6ce3fc08';
import { layerRole } from '../../public/js/builder/layer-role.js?v=e585f610';
import { isZoneTsid } from '../../public/js/zone-streets.js?v=b40010d5';
import { platformsScreen, isStandable, worldToScreen } from '../../public/js/street-model.js?v=b6cb6a4e';
import { hexToRgb, rgbToHex, rgbToLab, deltaE, hslToRgb } from './art-image.mjs';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'));
const r1 = (n) => Math.round(n * 10) / 10;
const r2 = (n) => Math.round(n * 100) / 100;
const byName = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** The magenta a model fills the background with when it cannot make transparency. */
export const KEY_HEX = '#FF00FF';
export const PROMPT_MAX = 4000; // the provenance row keeps at most 4,000 characters (BuilderIntake)
const ROLE_ORDER = ['sky', 'bg', 'middleground', 'middleplus', 'foreground'];
/**
 * Library art that is light, shade or a filler box rather than a drawn thing: left out of the
 * measured tones and the references (a blur box or a shadow gradient says nothing about style).
 */
export const NOT_ART = /(blur|shadow|gradient|light_?spot|light_?beam|penaltybox|_filler|^box_|vignette|darkness|overlay)/i;
const KIND_WORDS = { strip: 'background strip', object: 'object', topper: 'walkable ledge', particle: 'particle', ground: 'ground strip', support: 'support under a ledge', wall: 'rock wall', stream: 'falling stream' };
/**
 * The kinds of piece. Besides the four the zone shows by itself (strip, object, topper, particle),
 * a brief can name the pieces that stand a street on the ground (Tiny Speck's own streets do: the
 * floor's art runs to the street's bottom edge and low ledges stand on rock; see the bible's
 * "Standing on the ground"):
 *   ground   a seamless floor strip: a flat walkable top, solid rock or earth running off the
 *            bottom edge of the picture, no underside;
 *   support  what a low ledge stands on: a pillar, buttress or rock mass with a flat top, running
 *            off the bottom edge, tileable top to bottom so it can be any height;
 *   wall     a big rock face behind the play area that ledges jut out of, tileable top to bottom;
 *   stream   a plain vertical stream (a lava fall, a waterfall) that tiles downward: no lip, no pool
 *            (those are pieces of their own).
 */
export const KINDS = Object.freeze(Object.keys(KIND_WORDS));
/** A brief's ledges: grounded (the default: a thick shelf with a short, flat-ish underside) or floating (lumps may hang under it). */
export const LEDGES = Object.freeze(['grounded', 'floating']);
export const ledgesOf = (brief = {}) => (brief.ledges === 'floating' ? 'floating' : 'grounded');

// —— Pieces: what the zone draws, and how ——

/** PURE: the drop name of a piece (its name without gz_, gz_ai_ or a placeholder's gz_ph_). */
export const shortName = (name) => String(name).replace(/^gz_(ai_|ph_)?/, '');

/**
 * PURE: every piece of new art the zone uses, with how it is used: roles, placements, drawn
 * sizes, whether copies sit edge to edge (a seamless strip), whether a walkable line runs along
 * its top (a topper), whether only effects use it (a particle). The brief's `kind` wins over the
 * guess. Pieces the brief names that the zone lacks are added from the brief's own w, h and role.
 */
export function zonePieces(zone, brief = {}) {
  const rows = zone.assets || {};
  const names = Object.keys(rows).filter((n) => rows[n]?.origin === 'new');
  // The brief names pieces gz_ai_<short>; a zone laid out with placeholders draws gz_ph_<short>: one piece.
  const briefOf = (n) => (brief.pieces || {})[n] || Object.entries(brief.pieces || {}).find(([k]) => shortName(k) === shortName(n))?.[1] || {};
  for (const [n, p] of Object.entries(brief.pieces || {})) if (!names.some((x) => shortName(x) === shortName(n)) && p.w && p.h) names.push(n);
  const use = new Map(names.map((n) => [n, { roles: new Map(), placements: 0, emitters: 0, streets: new Set(), drawn: [], edgeToEdge: 0, overlapping: 0, onLine: 0 }]));
  for (const { key, street } of zone.streets || []) {
    const floors = platformsScreen(street).filter(isStandable);
    for (const layer of street.layers || []) {
      const role = layerRole(layer, street);
      const decos = layer.decos || [];
      for (const d of decos) {
        const u = use.get(d.sprite);
        if (!u) continue;
        u.placements += 1;
        u.streets.add(key);
        u.roles.set(role, (u.roles.get(role) || 0) + 1);
        u.drawn.push([d.w, d.h]);
        // A copy of the same sprite on the same row: edge to edge (within 3%) or overlapping.
        const twin = decos.find((o) => o !== d && o.sprite === d.sprite && Math.abs(o.y - d.y) < 2 && o.x > d.x && o.x - d.x < d.w * 1.05);
        if (twin) {
          if (Math.abs(twin.x - d.x - d.w) <= d.w * 0.03) u.edgeToEdge += 1;
          else u.overlapping += 1;
        }
        // A walkable line along its top: on the middleground, crossing most of its width, in its upper half.
        if (layer.id === 'middleground' && !d.r) {
          const top = worldToScreen(street, d.x, d.y - d.h);
          const bot = worldToScreen(street, d.x, d.y);
          const left = top.x - d.w / 2;
          const right = top.x + d.w / 2;
          const hit = floors.some((p) => {
            const x0 = Math.min(p.x1, p.x2);
            const x1 = Math.max(p.x1, p.x2);
            const cover = Math.min(right, x1) - Math.max(left, x0);
            const y = (p.y1 + p.y2) / 2;
            return cover >= d.w * 0.5 && y >= top.y - 4 && y <= top.y + (bot.y - top.y) * 0.5;
          });
          if (hit) u.onLine += 1;
        }
      }
    }
    for (const e of street.emitters || []) {
      const u = use.get(e.sprite);
      if (u) {
        u.emitters += 1;
        u.streets.add(key);
      }
    }
  }
  const pieces = names.map((name) => {
    const row = rows[name] || {};
    const b = briefOf(name);
    const u = use.get(name);
    const roles = [...u.roles].sort((a, c) => c[1] - a[1] || ROLE_ORDER.indexOf(a[0]) - ROLE_ORDER.indexOf(c[0]));
    let role = b.role || roles[0]?.[0] || 'middleground';
    let kind = b.kind;
    if (!kind) {
      if (!u.placements && u.emitters) kind = 'particle';
      else if (u.edgeToEdge > 0) kind = 'strip';
      else if (u.onLine > 0 && u.onLine >= u.placements / 2) kind = 'topper';
      else kind = 'object';
    }
    if (kind && !KINDS.includes(kind)) throw new Error(`${name}: the brief's kind "${kind}" is not one of ${KINDS.join(', ')}.`);
    if (kind === 'particle') role = 'particle';
    // The brief's size wins when it gives one (a ground strip is taller than the ledge it replaces).
    const w = Number((b.w && b.h ? b.w : 0) || row.w || b.w);
    const h = Number((b.w && b.h ? b.h : 0) || row.h || b.h);
    return {
      name,
      short: shortName(name),
      kind,
      role,
      roles: Object.fromEntries(roles),
      target: { w, h },
      aspect: r2(w / h),
      placements: u.placements,
      emitters: u.emitters,
      streets: [...u.streets].sort(byName),
      seamless: kind === 'strip' || kind === 'ground',
      tilesDown: kind === 'support' || kind === 'wall' || kind === 'stream',
      overlapping: u.overlapping > 0,
      what: b.what || `${shortName(name).replace(/_/g, ' ')}.`,
      notes: b.notes || '',
    };
  });
  const rank = (p) => (p.kind === 'particle' ? 9 : ROLE_ORDER.indexOf(p.role));
  const kindRank = { strip: 0, wall: 1, object: 2, ground: 3, support: 4, topper: 5, stream: 6, particle: 7 };
  return pieces.sort((a, b) => rank(a) - rank(b) || kindRank[a.kind] - kindRank[b.kind] || b.target.w * b.target.h - a.target.w * a.target.h || byName(a.name, b.name));
}

// —— Tiny Speck's streets, by colour ——

/** PURE: a deco's mean colour (from its measured lightness, saturation and hue bins) as RGB. */
export function decoColour(row) {
  let x = 0;
  let y = 0;
  (row.hue || []).forEach((v, i) => {
    const a = ((i * 30 + 15) * Math.PI) / 180;
    x += Math.cos(a) * v;
    y += Math.sin(a) * v;
  });
  const grey = Math.hypot(x, y) < 1e-6;
  const h = grey ? 0 : ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  return hslToRgb(h, grey ? 0 : row.s, row.l);
}

/** PURE: an RGB colour through a layer's colour matrix (glitchLayerMatrix; offsets 0-1). */
export function applyMatrix(rgb, m) {
  if (!m) return rgb;
  const [r, g, b] = rgb.map((v) => v / 255);
  const c = (i) => Math.max(0, Math.min(1, m[i] * r + m[i + 1] * g + m[i + 2] * b + m[i + 3] + m[i + 4])) * 255;
  return [c(0), c(5), c(10)];
}

/**
 * PURE: one street's colours as the game draws them: per (layer, sprite), the deco's mean colour
 * through the layer's filters, weighted by drawn area times how much of the file is art.
 */
export function streetColours(street, palette, twins = DECO_TWINS) {
  const out = new Map();
  for (const layer of street.layers || []) {
    const role = layerRole(layer, street);
    const m = layer.filters ? glitchLayerMatrix(layer.filters) : null;
    for (const d of layer.decos || []) {
      const name = twins[d.sprite] || d.sprite;
      const row = palette.get(name);
      if (!row || NOT_ART.test(name)) continue;
      const k = `${layer.id}|${name}`;
      const wgt = Math.max(1, Number(d.w) || 0) * Math.max(1, Number(d.h) || 0) * (row.cover || 0.5);
      const hit = out.get(k);
      if (hit) hit.w += wgt;
      else out.set(k, { sprite: name, role, rgb: applyMatrix(decoColour(row), m), w: wgt });
    }
  }
  const list = [...out.values()];
  const total = list.reduce((t, c) => t + c.w, 0) || 1;
  for (const c of list) {
    c.w /= total;
    c.lab = rgbToLab(c.rgb);
  }
  return list;
}

/**
 * PURE: how far a street's look is from the target (lower is closer): its colours' weighted
 * distance to the nearest target colour, the target colours' distance to the nearest colour the
 * street shows (at least 2% of it), and its sky gradient against the zone's.
 */
export function streetDistance(colours, gradient, target) {
  if (!colours.length) return Infinity;
  const there = colours.reduce((t, c) => t + c.w * Math.min(...target.labs.map((l) => deltaE(c.lab, l))), 0);
  const shown = colours.filter((c) => c.w >= 0.02);
  const back = target.labs.reduce((t, l) => t + Math.min(...(shown.length ? shown : colours).map((c) => deltaE(c.lab, l))), 0) / target.labs.length;
  let sky = 30;
  if (gradient?.top && gradient?.bottom && target.gradient) {
    sky = (deltaE(rgbToLab(hexToRgb(gradient.top)), target.gradient.top) + deltaE(rgbToLab(hexToRgb(gradient.bottom)), target.gradient.bottom)) / 2;
  }
  return r2(there * 0.5 + back * 0.3 + sky * 0.2);
}

/** Tiny Speck's shipped streets (no zone streets), sorted by tsid, with their index label and hub. */
export function loadShippedStreets(root = ROOT) {
  const dir = join(root, 'public/assets/streets');
  const index = readJson(join(dir, 'index.json')).streets;
  return readdirSync(dir).filter((f) => /^[GL][A-Z0-9]+\.json$/.test(f) && !isZoneTsid(f.slice(0, -5))).sort().map((f) => {
    const s = readJson(join(dir, f));
    const row = index[s.tsid] || {};
    return { tsid: s.tsid, label: row.label || s.label || s.tsid, hub: row.hubName || s.hubName || '', layers: s.layers || [], gradient: s.gradient || null };
  });
}

export function loadPalette(root = ROOT) {
  return new Map(readJson(join(root, 'tools/builder/deco-palette.json')).decos.map((r) => [r.name, r]));
}

/** PURE: the target look: the brief's colours (Lab) and the zone's sky gradient (its first street's). */
export function targetOf(zone, brief) {
  const hexes = (brief.palette || []).map((p) => p.hex);
  const g = (zone.streets || []).map((s) => s.street.gradient).find((x) => x?.top && x?.bottom);
  if (g) hexes.push(`#${g.top}`, `#${g.bottom}`);
  return {
    labs: hexes.map((h) => rgbToLab(hexToRgb(h))),
    gradient: g ? { top: rgbToLab(hexToRgb(g.top)), bottom: rgbToLab(hexToRgb(g.bottom)), hex: { top: `#${g.top.toUpperCase()}`, bottom: `#${g.bottom.toUpperCase()}` } } : null,
  };
}

/** PURE: the `count` shipped streets closest to the target, closest first (ties by tsid). */
export function closestStreets(streets, palette, target, count = 8) {
  const scored = [];
  for (const s of streets) {
    const decos = s.layers.reduce((t, l) => t + (l.decos || []).length, 0);
    if (decos < 20) continue;
    const colours = streetColours(s, palette);
    scored.push({ tsid: s.tsid, label: s.label, hub: s.hub, distance: streetDistance(colours, s.gradient, target), colours, gradient: s.gradient });
  }
  scored.sort((a, b) => a.distance - b.distance || byName(a.tsid, b.tsid));
  // At most two streets from one hub, so the references are not one place seen eight times.
  const perHub = new Map();
  const out = [];
  for (const s of scored) {
    const n = perHub.get(s.hub) || 0;
    if (n >= 2) continue;
    perHub.set(s.hub, n + 1);
    out.push(s);
    if (out.length >= count) break;
  }
  return out;
}

/**
 * PURE: the closest streets' colours gathered into `k` swatches (weighted k-means in Lab, seeded
 * from the heaviest colour then the farthest, so it is deterministic). Each swatch: hex, its share,
 * the layer role it is mostly on, and the deco and street that show it most.
 */
export function swatches(streets, k = 10) {
  const pts = [];
  for (const s of streets) for (const c of s.colours) pts.push({ ...c, street: s.label, w: c.w / streets.length });
  if (!pts.length) return [];
  pts.sort((a, b) => b.w - a.w || byName(a.sprite, b.sprite) || byName(a.street, b.street));
  const centres = [pts[0].lab.slice()];
  while (centres.length < Math.min(k, pts.length)) {
    let best = null;
    let bestD = -1;
    for (const p of pts) {
      const d = Math.min(...centres.map((c) => deltaE(c, p.lab))) * Math.sqrt(p.w);
      if (d > bestD) {
        bestD = d;
        best = p;
      }
    }
    centres.push(best.lab.slice());
  }
  let assign = [];
  for (let it = 0; it < 12; it += 1) {
    assign = pts.map((p) => {
      let bi = 0;
      let bd = Infinity;
      centres.forEach((c, i) => {
        const d = deltaE(c, p.lab);
        if (d < bd) {
          bd = d;
          bi = i;
        }
      });
      return bi;
    });
    centres.forEach((c, i) => {
      let t = 0;
      const sum = [0, 0, 0];
      const rgb = [0, 0, 0];
      pts.forEach((p, j) => {
        if (assign[j] !== i) return;
        t += p.w;
        for (let q = 0; q < 3; q += 1) {
          sum[q] += p.lab[q] * p.w;
          rgb[q] += p.rgb[q] * p.w;
        }
      });
      if (t > 0) for (let q = 0; q < 3; q += 1) c[q] = sum[q] / t;
    });
  }
  const out = centres.map((c, i) => {
    const members = pts.filter((_, j) => assign[j] === i);
    const share = members.reduce((t, p) => t + p.w, 0);
    if (!share) return null;
    const rgb = [0, 1, 2].map((q) => members.reduce((t, p) => t + p.rgb[q] * p.w, 0) / share);
    const roles = new Map();
    for (const p of members) roles.set(p.role, (roles.get(p.role) || 0) + p.w);
    const role = [...roles].sort((a, b) => b[1] - a[1] || byName(a[0], b[0]))[0][0];
    const top = [...members].sort((a, b) => b.w - a.w || byName(a.sprite, b.sprite))[0];
    return { hex: rgbToHex(rgb), share: r1(share * 100), role, example: top.sprite, street: top.street, lab: rgbToLab(rgb) };
  }).filter(Boolean);
  // A tone under half a percent of what the streets show is a stray, not part of their look.
  return out.filter((s) => s.share >= 0.5).sort((a, b) => a.lab[0] - b.lab[0] || byName(a.hex, b.hex)).map(({ lab, ...s }) => s);
}

/**
 * PURE: the reference decos: library art placed on the closest streets, close to the target's
 * colours, preferring subjects the brief names (refWords) and art placed often; `back` from the
 * sky and bg layers (wide pieces), the rest from the middleground and in front, one per name
 * family. Answers [{ name, role, source, size2, placements, why }].
 */
export function chooseRefs(streets, catalogRows, palette, target, brief = {}, { back = 3, front = 5 } = {}) {
  const words = new Set((brief.refWords || []).map((w) => w.toLowerCase()));
  // The brief can leave a deco out (one with lettering on it, say: a reference with text invites text).
  const exclude = new Set(brief.refExclude || []);
  const seen = new Map();
  for (const s of streets) {
    for (const c of s.colours) {
      const k = c.sprite;
      const hit = seen.get(k) || { name: k, roles: new Map(), weight: 0, streets: new Set() };
      hit.roles.set(c.role, (hit.roles.get(c.role) || 0) + c.w);
      hit.weight += c.w;
      hit.streets.add(s.label);
      seen.set(k, hit);
    }
  }
  const families = new Set();
  const pick = (wantBack, n) => {
    const cands = [];
    for (const h of seen.values()) {
      const cat = catalogRows.get(h.name);
      const pal = palette.get(h.name);
      if (!cat || !pal || cat.animated || exclude.has(h.name) || NOT_ART.test(h.name)) continue;
      const [w2, h2] = cat.size2 || [0, 0];
      const role = [...h.roles].sort((a, b) => b[1] - a[1] || byName(a[0], b[0]))[0][0];
      const isBack = role === 'sky' || role === 'bg';
      if (isBack !== wantBack) continue;
      if (Math.max(w2, h2) < (wantBack ? 500 : 180) || (pal.cover || 0) < 0.08) continue;
      const lab = rgbToLab(decoColour(pal));
      const near = Math.min(...target.labs.map((l) => deltaE(lab, l)));
      const tokens = h.name.toLowerCase().split(/[_\d]+/).filter(Boolean);
      const subject = tokens.some((t) => words.has(t));
      const score = near - (subject ? 12 : 0) - Math.log10(1 + (cat.placements || 0)) * 3 - Math.min(10, h.weight * 100);
      cands.push({ subject, name: h.name, family: cat.family || tokens[0] || h.name, role, source: cat.source || '', size2: cat.size2, placements: cat.placements || 0, streets: [...h.streets].sort(byName).slice(0, 3), score: r2(score), why: `${subject ? 'subject and ' : ''}colour (${r1(near)} from the nearest target colour)` });
    }
    // Subjects the brief names come first, then the rest by colour.
    cands.sort((a, b) => Number(b.subject) - Number(a.subject) || a.score - b.score || byName(a.name, b.name));
    const out = [];
    for (const c of cands) {
      if (families.has(c.family)) continue;
      families.add(c.family);
      out.push(c);
      if (out.length >= n) break;
    }
    return out;
  };
  return [...pick(true, back), ...pick(false, front)].map(({ subject, family, ...r }) => r);
}

// —— Words ——

const ratioWords = (w, h) => {
  const a = w / h;
  const shape = a >= 1.25 ? 'landscape (wide)' : a <= 0.8 ? 'portrait (tall)' : 'square';
  return { ratio: a >= 1 ? `${r2(a)}:1` : `1:${r2(1 / a)}`, shape };
};

/** PURE: the style paragraph every prompt carries (Tiny Speck's way of drawing, in words). */
export function styleParagraph(brief) {
  return [
    "Style: hand-painted 2D side-scrolling game art in the manner of Tiny Speck's game Glitch (2011), whose art is public domain (CC0).",
    'Soft vector-painted shapes with rounded, chunky, slightly whimsical forms; each shape filled with gentle gradients and soft painted shading for volume; a subtle mottled texture, never photographic.',
    'Outlines, where there are any, are thin (2 to 4 px at this size) and a darker shade of the fill colour, never pure black.',
    'Colours rich but a little muted and warm, never neon. A flat side view as in a platform game: no perspective tilt, no 3D render look.',
    brief.texture ? `Texture: ${brief.texture}` : '',
  ].filter(Boolean).join(' ');
}

const DEPTH_WORDS = {
  sky: 'It is far away, behind everything: very low contrast, very little detail, soft edges, no outlines, hazy and muted, its colours close to the sky.',
  bg: 'It is in the background, behind the play area, and must stay quiet so the ledges in front stand out: about half the contrast of the play area, broad simple shapes, little detail, few or no cracks, seams or glowing lines, a soft haze over it that pulls its colours toward the sky, thin or no outlines.',
  middleground: 'It is in the play area, beside the character: the crispest, most detailed and most contrasty art in the scene.',
  middleplus: 'It stands just in front of the play area: crisp, a little darker.',
  foreground: 'It is in the very front: dark, simple shapes, little detail.',
  particle: 'It is a tiny effect sprite, drawn small and many times: a simple soft shape, no outline.',
};

/** PURE: the filter the game puts on a piece's layer, in words (first layer of the role found). */
function layerFilterWords(zone, piece) {
  for (const { street } of zone.streets || []) {
    for (const layer of street.layers || []) {
      if (!(layer.decos || []).some((d) => d.sprite === piece.name)) continue;
      const f = layer.filters || {};
      const parts = ['brightness', 'contrast', 'saturation'].filter((k) => f[k]).map((k) => `${k} ${f[k] > 0 ? '+' : ''}${f[k]}`);
      return parts.length ? `The game dims its layer a little (${parts.join(', ')}), so paint it at full colour.` : '';
    }
  }
  return '';
}

/** PURE: a piece's shape in words ("about as wide as it is tall", "about 3.9 times as wide as it is tall"). */
export function shapeWords(w, h) {
  const a = w / h;
  if (a >= 0.87 && a <= 1.15) return 'about as wide as it is tall';
  return a > 1 ? `about ${r1(a)} times as wide as it is tall` : `about ${r1(1 / a)} times as tall as it is wide`;
}

/** The first line of each kind's description ("ONE ... ONLY:"), and the word for the thing. */
const HEADS = { strip: ['ONE LAYER ONLY', 'strip'], particle: ['ONE SPRITE ONLY', 'sprite'], ground: ['ONE GROUND STRIP ONLY', 'strip'], support: ['ONE ROCK SUPPORT ONLY', 'support'], wall: ['ONE ROCK WALL ONLY', 'wall'], stream: ['ONE STREAM ONLY', 'stream'] };
const NOTHING_ELSE = 'nothing else: no ground under it, no scenery, no other objects, no cast shadow, no frame, no text, no lettering, no signature, no watermark.';
const TILE_DOWN = 'SEAMLESS TOP TO BOTTOM: copies are stacked one above another to make it any height, so the bottom edge must continue exactly into the top edge (tileable vertically).';

/** PURE: the lines that say what a piece is and how it sits in the street, by kind. */
function kindLines(piece, brief) {
  const L = [];
  const [head] = HEADS[piece.kind] || ['ONE OBJECT ONLY'];
  L.push(`${head}: ${piece.what}`);
  switch (piece.kind) {
    case 'strip':
      L.push('Just this one strip of scenery. Nothing in front of it, no characters, no plants, no sky painted behind it (the game paints the sky itself), no text.');
      L.push('SEAMLESS: copies are placed side by side, so the right edge must continue exactly into the left edge (tileable horizontally). The rock and the skyline run off both side edges at the same height; do not round off or end the strip at the sides.');
      break;
    case 'ground':
      L.push('Just this strip of ground: nothing standing on it, no characters, no plants, no sky behind it, no text.');
      L.push('Its top is walked on: a nearly flat, level top edge along the whole width, right at the top of the picture.');
      L.push('SOLID TO THE BOTTOM: under the top, solid rock or earth fills the picture all the way down and runs off the BOTTOM edge, cut straight by the frame. No underside, no hanging lumps, no drips, no rounded or ragged bottom, nothing see-through below the top: it is the ground the whole street stands on.');
      L.push('SEAMLESS: copies are placed side by side, so the right edge must continue exactly into the left edge (tileable horizontally); the top runs off both side edges at the same height.');
      break;
    case 'support':
      L.push(`Just this one support, ${NOTHING_ELSE.replace('no ground under it, ', '')}`);
      L.push('A walkable ledge rests on it: its top is flat and level across its whole width, right at the top of the picture, so a ledge sits on it with no gap.');
      L.push(`It runs off the BOTTOM edge, cut straight by the frame: no base, no foot, no rounded bottom. Its left and right sides are its own rough rock outline, with the background beyond them. ${TILE_DOWN}`);
      break;
    case 'wall':
      L.push('A big rock face that stands behind the play area; walkable ledges jut out of it. Just the rock face: no ledges, no plants, no sky, no text.');
      L.push(`It runs off the TOP and BOTTOM edges of the picture. Its left and right sides are its own rough outline, with the background beyond them. ${TILE_DOWN}`);
      L.push('Keep its face fairly plain (broad planes, a few cracks), so the ledges in front of it read clearly.');
      break;
    case 'stream':
      L.push('Only the falling stream itself: a plain vertical stream falling straight down, filling the picture from the top edge to the bottom edge and running off both. No rock lip at the top, no pool, splash or rocks at the bottom, no cliff behind it: the lip and the pool are separate pieces.');
      L.push(TILE_DOWN.replace('stacked one above another to make it any height', 'stacked one under another to make a fall of any height'));
      break;
    default:
      L.push(`Centred, the whole of it in the picture, ${NOTHING_ELSE}`);
  }
  if (piece.kind === 'topper') {
    L.push('Its top is walked on: a nearly flat, level top edge across about 90% of its width, right at the top of the object; everything else is below that edge.');
    if (ledgesOf(brief) === 'floating') L.push('It floats in the air: rounded lumps of rock may hang underneath it.');
    else L.push('It is a thick shelf: its underside is short and nearly flat (gently uneven), with no lumps, spikes or drips hanging underneath, because in the game it rests on a rock support or juts out of a cliff.');
    if (piece.overlapping) L.push('Copies overlap end to end, so give it rounded ends.');
  }
  if (piece.kind === 'particle' || piece.kind === 'object') {
    const { w, h } = piece.target;
    L.push(`SHAPE: keep it ${shapeWords(w, h)} (${w} x ${h}); do not flatten, stretch or squash it.`);
  }
  return L;
}

/** PURE: the prompt for one piece: self-contained (an image tool remembers nothing between chats). */
export function promptText(piece, { zone, brief, refs }) {
  const { w, h } = piece.target;
  const { ratio, shape } = ratioWords(w, h);
  const thing = (HEADS[piece.kind] || [null, 'object'])[1];
  const lines = [];
  const gist = brief.summary ? brief.summary.split('. ')[0].replace(/\.$/, '') : 'a new place';
  lines.push(`Make one picture for a 2D side-scrolling game. The place, ${brief.title || zone.title}: ${gist.charAt(0).toLowerCase()}${gist.slice(1)}.`);
  lines.push('');
  lines.push(...kindLines(piece, brief));
  if (piece.notes) lines.push(piece.notes);
  lines.push('');
  lines.push(`SIZE: the finished file is ${w} x ${h} px (${ratio}, ${shape}); the game draws it at half that, so make it as large and sharp as you can. If you cannot make exactly that size, use a ${shape.split(' ')[0]} canvas and shape the ${thing} to ${ratio}: it will be trimmed and scaled.`);
  lines.push(`BACKGROUND: transparent (a PNG with alpha). If you cannot make a transparent background, fill everything that is not the ${thing} with one flat pure magenta ${KEY_HEX}, edge to edge: no gradient, no shadow, no checkerboard, no pattern. Use no magenta or pink in the ${thing} itself.`);
  lines.push('');
  lines.push(styleParagraph(brief));
  lines.push([DEPTH_WORDS[piece.role] || DEPTH_WORDS.middleground, layerFilterWords(zone, piece)].filter(Boolean).join(' '));
  if (brief.light) lines.push(`Light: ${brief.light}`);
  const pal = (brief.palette || []).map((p) => `${p.name} ${p.hex}`).join(', ');
  if (pal) lines.push(`Palette: ${pal}.`);
  lines.push(`Avoid: photorealism, 3D rendering, glossy plastic, airbrushed gradients across the whole picture, lens blur, bloom, text of any kind${(brief.avoid || []).length ? `, ${brief.avoid.join(', ')}` : ''}.`);
  if (refs.length) lines.push(`The attached pictures are Tiny Speck's public-domain (CC0) art from Glitch. Copy how they are drawn (shapes, outlines, shading, texture, level of detail), not their subjects or colours.`);
  return `${lines.join('\n')}\n`;
}

/** PURE: the references a prompt attaches: the sheet, then the two closest to its role. */
export function refsFor(piece, refs) {
  const back = piece.role === 'sky' || piece.role === 'bg';
  const same = refs.filter((r) => (r.role === 'sky' || r.role === 'bg') === back);
  return ['ref-sheet.png', ...same.slice(0, 2).map((r) => r.file)];
}

const md = (s) => String(s).replace(/\|/g, '\\|');

/** PURE: art-bible.md. */
export function bibleText({ zone, brief, pieces, streets, palette, refs, profiles }) {
  const L = [];
  L.push(`# ${brief.title || zone.title}: art bible`);
  L.push('');
  L.push(`Zone \`${zone.id}\` (draft rev ${zone.rev}), ${pieces.length} pieces of art. Made by \`tools/builder/art-bible.mjs\` from the zone, its brief (\`tools/builder/art/briefs/${zone.id}.json\`), Tiny Speck's ${streets.total} shipped streets and the measured style profile. Every prompt in \`prompts/\` repeats what it needs from this page; this page is for people.`);
  L.push('');
  L.push('## The place');
  L.push('');
  L.push(brief.summary || zone.title);
  if ((brief.mood || []).length) L.push('', `Mood: ${brief.mood.join(', ')}.`);
  L.push('');
  L.push('## How a street is built (one picture per layer or object)');
  L.push('');
  L.push("A street in this game is not one painting. The game paints the sky gradient itself; behind the play area sit parallax layers (here: sky and bg) made of wide strips and big shapes, transparent wherever the layer behind shows through; the play area (middleground) holds the ledges the character walks on and props as separate transparent sprites; effects (steam, lava squirts, embers) are tiny particle sprites the game throws around. Image models answer with one flat picture unless asked for exactly one layer or one object, so every prompt asks for one piece only, on a transparent (or flat magenta) background.");
  L.push('');
  L.push('## Standing on the ground');
  L.push('');
  L.push("Tiny Speck's streets stand on something. Over the shipped streets (measured 2026-11-01): in about 3 streets of 4 the floor's art runs down past the street's bottom edge, and about 3 walkable lines of 4 with 450 px or less to the surface below have art under them (rock, trunks, hills). Floating platforms are the exception, kept for heights and cloud streets (High Jumper's Gully, Gentle Island). The alpine set shows how: a thin walkable cap (`platform_topper_01a_al1`) sits on separate rock masses (`cliff_face_skirt_01a_al1`, `cliff_face_mountaineering_01a_al1`), as on Rasal Hanoo (Haraiva).");
  L.push('');
  L.push(`So this pack asks for a ground strip that is solid to its bottom edge, ${ledgesOf(brief) === 'floating' ? 'ledges that float (this zone floats on purpose: lumps may hang under them)' : 'ledges that are thick shelves with a short, flat-ish underside'}, supports for low ledges to stand on and a rock wall for high ones to jut from (both tile top to bottom, so they can be any height), falls as a plain stream with the lip and the pool as pieces of their own, and quiet back layers so the play area wins. \`node tools/builder/cli.mjs ground\` stands a street on them.`);
  L.push('');
  const grad = targetOf(zone, brief).gradient;
  if (grad) L.push(`Sky gradient (drawn by the game, never painted into the art): top ${grad.hex.top}, bottom ${grad.hex.bottom}.`, '');
  L.push('| Layer | Depth (z) | Size (px) | Filters | Pieces on it |');
  L.push('|---|---|---|---|---|');
  const first = zone.streets?.[0]?.street;
  for (const layer of first?.layers || []) {
    const on = [...new Set((layer.decos || []).map((d) => d.sprite))].sort(byName);
    const f = layer.filters ? Object.entries(layer.filters).map(([k, v]) => `${k} ${v}`).join(', ') : 'none';
    L.push(`| ${layer.id} (${layerRole(layer, first)}) | ${layer.z ?? 0} | ${layer.w ?? first.bounds.r - first.bounds.l} x ${layer.h ?? first.bounds.b - first.bounds.t} | ${f} | ${on.map((n) => shortName(n)).join(', ') || 'none'} |`);
  }
  L.push('', `(${md(first?.label || '')}; the other streets have the same stack at their own sizes.)`, '');
  L.push('## Palette');
  L.push('');
  L.push("The zone's own colours (the brief). Prompts give these by name and hex; intake pulls each finished picture's colours lightly toward them and toward the Tiny Speck tones below.");
  L.push('');
  L.push('| Swatch | Name | Hex |');
  L.push('|---|---|---|');
  for (const p of brief.palette || []) L.push(`| <span style="background:${p.hex}">&nbsp;&nbsp;&nbsp;&nbsp;</span> | ${md(p.name)} | \`${p.hex}\` |`);
  L.push('');
  L.push(`Tones measured from the ${streets.list.length} closest Tiny Speck streets (each deco's measured colour through its layer's filters, weighted by drawn area; tools/builder/deco-palette.json):`);
  L.push('');
  L.push('| Swatch | Hex | Share | Mostly on | Seen most in |');
  L.push('|---|---|---|---|---|');
  for (const s of palette) L.push(`| <span style="background:${s.hex}">&nbsp;&nbsp;&nbsp;&nbsp;</span> | \`${s.hex}\` | ${s.share}% | ${s.role} | ${md(s.example)} on ${md(s.street)} |`);
  L.push('');
  L.push('The closest streets, closest first (lower is closer):');
  L.push('');
  for (const s of streets.list) L.push(`- ${md(s.label)} (${md(s.hub)}, \`${s.tsid}\`): ${s.distance}`);
  L.push('');
  L.push('## Light, line, shading, texture');
  L.push('');
  if (brief.light) L.push(`- **Light:** ${brief.light}`);
  L.push("- **Line:** thin outlines (2 to 4 px in a 2x file), a darker shade of the fill, never pure black; back layers mostly have none (Tiny Speck's convention, seen in the reference decos, not measured).");
  L.push('- **Shading:** soft painted gradients inside each shape for volume, light top-left, shade bottom-right; no hard cel bands, no airbrushed glow over the whole picture.');
  if (brief.texture) L.push(`- **Texture:** ${brief.texture}`);
  L.push('- **Shapes:** rounded, chunky and a little whimsical; a flat side view, as in a platform game.');
  L.push('');
  L.push("Depth, measured over Tiny Speck's streets (`public/assets/content/style-profiles.json`, median and p10 to p90): further back is more muted, lighter or darker toward the sky, softer and blurred.");
  L.push('');
  L.push('| Role | Art lightness | Art saturation | Layer saturation filter | Layer blur |');
  L.push('|---|---|---|---|---|');
  for (const role of ROLE_ORDER) {
    const p = profiles?.profiles?.default?.roles?.[role];
    if (!p) continue;
    const band = (b) => (b ? `${b[1]} (${b[0]} to ${b[2]})` : 'none');
    L.push(`| ${role} | ${band(p.palette?.l)} | ${band(p.palette?.s)} | ${band(p.filters?.saturation?.band)} | ${band(p.filters?.blur?.band)} |`);
  }
  L.push('');
  L.push('## Avoid');
  L.push('');
  for (const a of new Set(['photorealism and photo textures', '3D rendering, glossy or plastic surfaces', 'airbrushed gradients across a whole picture (Tiny Speck shades inside each shape)', 'lens blur, bloom, depth-of-field', 'text, letters, signatures, watermarks', 'pure black outlines', 'a painted sky behind a layer or object (the game paints the sky)', 'magenta or pink anywhere in the art (it is the key colour)', ...(brief.avoid || [])])) L.push(`- ${a}`);
  L.push('');
  L.push('## References (attach to every prompt)');
  L.push('');
  L.push("Tiny Speck's own CC0 decos from the library, chosen from the closest streets by colour and by subject, each flattened on a neutral grey. They are style references only: AI art made with them records them as its inputs (`deco:<name>`), which the licence policy allows (inputs must be CC0 or Austin's own).");
  L.push('');
  L.push('| File | Deco | Layer role | Source | Why |');
  L.push('|---|---|---|---|---|');
  for (const r of refs) L.push(`| \`${r.file}\` | ${md(r.name)} | ${r.role} | ${md(r.source)} | ${md(r.why)}; on ${md(r.streets.join(', '))} |`);
  L.push('');
  L.push('## Pieces');
  L.push('');
  L.push('| # | Piece | Kind | Layer | File size (px) | Used |');
  L.push('|---|---|---|---|---|---|');
  pieces.forEach((p, i) => L.push(`| ${i + 1} | ${p.short} | ${KIND_WORDS[p.kind]}${p.seamless ? ', seamless' : ''}${p.tilesDown ? ', tiles top to bottom' : ''} | ${p.role} | ${p.target.w} x ${p.target.h} | ${p.placements ? `${p.placements} placements` : ''}${p.emitters ? `${p.placements ? ', ' : ''}${p.emitters} effects` : ''}${p.streets.length ? ` on ${p.streets.join(', ')}` : 'not placed yet (the brief names it)'} |`));
  L.push('');
  return `${L.join('\n')}\n`;
}

/** PURE: pack.md, the person's steps. */
export function packText({ zone, brief, pieces, outDir }) {
  const L = [];
  L.push(`# ${brief.title || zone.title}: making the art in T3 Chat`);
  L.push('');
  L.push(`${pieces.length} pictures, one chat each. Read \`art-bible.md\` once for the look; the prompts carry everything the image model needs.`);
  L.push('');
  L.push('## Which model');
  L.push('');
  L.push("- **Use an OpenAI GPT Image model if T3 Chat lists one** (the gpt-image family). OpenAI's image API can return a truly transparent PNG. I could not check whether T3 Chat passes that option through, so every prompt also says: if you cannot do transparency, use a flat magenta #FF00FF background. Intake handles both.");
  L.push("- A Gemini image model (\"Nano Banana\") follows reference pictures well but, as far as I know, does not make transparent PNGs; it should give the magenta background. Fine too.");
  L.push('- Use **one model for all pieces** so they match, and pick the highest quality or largest size T3 Chat offers. Note its name exactly as T3 Chat shows it: provenance records it.');
  L.push("- If the model cannot take attached pictures, send the prompt without them; the style paragraph still describes the look.");
  L.push('');
  L.push('## Steps');
  L.push('');
  L.push('1. Open T3 Chat and pick the image model.');
  L.push('2. For each row below, in order: start a **new chat** (an image model remembers nothing useful between pieces, and a long chat drifts), attach the files in the Attach column from this folder, paste the whole prompt file, send.');
  L.push('3. Check the picture: one thing only, nothing else in it; a transparent or flat magenta background (a grey-and-white checkerboard is a painted fake: ask again, "on a flat #FF00FF background"); no text. If it is wrong, regenerate or say what to fix in the same chat.');
  L.push('4. Download it and save it into `drop/` under the exact name in the Save as column (`.png`, `.webp` or `.jpg` are all fine).');
  L.push('5. When done (or part done), put the model name in `drop/model.txt` (one line, as T3 Chat shows it; if some pieces used another model, `drop/models.json` maps a save-as name to its model) and tell Claude the pictures are in.');
  L.push('');
  L.push('Pieces left out keep the code-drawn art, so a partial set already makes a comparison. The first rows matter most: the back layers and the ledges are most of what you see.');
  L.push('');
  L.push(`Drop folder: \`${join(outDir, 'drop')}\``);
  L.push('');
  L.push('| # | Prompt | Attach | Save as | What | Size |');
  L.push('|---|---|---|---|---|---|');
  pieces.forEach((p, i) => L.push(`| ${i + 1} | \`${p.promptFile}\` | ${p.attach.map((a) => `\`${a}\``).join(', ')} | \`drop/${p.short}.png\` | ${KIND_WORDS[p.kind]}${p.seamless ? ' (seamless)' : ''}${p.tilesDown ? ' (tiles top to bottom)' : ''} | ${p.target.w} x ${p.target.h} |`));
  L.push('');
  L.push('## Afterwards (Claude)');
  L.push('');
  L.push('```sh');
  L.push(`node tools/builder/art-intake.mjs ${outDir}            # key, trim, seams, palette, size, provenance -> ready/`);
  L.push(`node tools/builder/art-apply.mjs ${outDir} --from ${zone.id} --to ${zone.id}-gen   # a new draft with the new art`);
  L.push('```');
  L.push('');
  return `${L.join('\n')}\n`;
}

/**
 * PURE: the whole pack as { files: {path: text}, pieces, refs, palette, streets }, given the zone,
 * its brief, the shipped streets, the deco palette and catalog rows, and the style profiles.
 */
export function buildPack({ zone, brief, shipped, palette, catalogRows, profiles, outDir = 'pack', streetCount = 8, refCount = 8 }) {
  const target = targetOf(zone, brief);
  const list = closestStreets(shipped, palette, target, streetCount);
  const sw = swatches(list, 10);
  const back = Math.max(2, Math.round(refCount * 0.375));
  const refs = chooseRefs(list, catalogRows, palette, target, brief, { back, front: refCount - back }).map((r, i) => ({ ...r, file: `ref-${String(i + 1).padStart(2, '0')}-${r.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png` }));
  const pieces = zonePieces(zone, brief).map((p, i) => ({ ...p, promptFile: `prompts/${String(i + 1).padStart(2, '0')}-${p.short}.txt`, attach: refsFor(p, refs) }));
  const files = {};
  for (const p of pieces) {
    const text = promptText(p, { zone, brief, refs });
    if (text.length > PROMPT_MAX) throw new Error(`${p.name}'s prompt is ${text.length} characters; provenance keeps ${PROMPT_MAX}.`);
    files[p.promptFile] = text;
  }
  const streets = { total: shipped.length, list: list.map(({ colours, gradient, ...s }) => s) };
  files['art-bible.md'] = bibleText({ zone, brief, pieces, streets, palette: sw, refs, profiles });
  files['pack.md'] = packText({ zone, brief, pieces, outDir });
  const snap = [...new Set([...(brief.palette || []).map((p) => p.hex.toUpperCase()), ...sw.map((s) => s.hex)])];
  const manifest = {
    format: 'groddle-art-pack/1',
    zone: zone.id,
    rev: zone.rev,
    title: brief.title || zone.title,
    key: KEY_HEX,
    ledges: ledgesOf(brief),
    palette: snap,
    refs: refs.map(({ file, name, role, source }) => ({ file, name, role, source })),
    inputs: refs.map((r) => `deco:${r.name}`),
    pieces: pieces.map((p) => ({ name: p.name, short: p.short, kind: p.kind, role: p.role, target: p.target, seamless: p.seamless, tilesDown: p.tilesDown, overlapping: p.overlapping, promptFile: p.promptFile, attach: p.attach, save: `drop/${p.short}.png` })),
  };
  files['pieces.json'] = `${JSON.stringify(manifest, null, 1)}\n`;
  files['refs.json'] = `${JSON.stringify(refs.map(({ file, name, role, source, size2, placements, streets: on, why }) => ({ file, name, role, licence: 'CC0-1.0', source, size2, placements, streets: on, why })), null, 1)}\n`;
  return { files, pieces, refs, palette: sw, streets };
}

// —— The disk ——

/** Copy the reference decos as PNGs on a neutral grey (at most 1024 px a side) and a contact sheet. */
export function writeRefs(outDir, refs, root = ROOT) {
  const made = [];
  for (const r of refs) {
    const src = join(root, 'public/assets/decos/groddle', `${r.name}.webp`);
    const dst = join(outDir, r.file);
    execFileSync('magick', [src, '-resize', '1024x1024>', '-background', '#8C8A86', '-gravity', 'center', '-extent', '%[fx:w+64]x%[fx:h+64]', '-flatten', '-strip', `PNG24:${dst}`]);
    made.push(dst);
  }
  if (made.length) {
    const tile = (f) => ['(', f, '-resize', '480x480', '-background', '#8C8A86', '-gravity', 'center', '-extent', '512x512', ')'];
    const half = Math.ceil(made.length / 2);
    const row = (list, f) => execFileSync('magick', [...list.flatMap(tile), '+append', f]);
    const a = join(outDir, '.sheet-a.png');
    const b = join(outDir, '.sheet-b.png');
    row(made.slice(0, half), a);
    row(made.slice(half), b);
    execFileSync('magick', [a, b, '-background', '#8C8A86', '-gravity', 'west', '-append', '-strip', `PNG24:${join(outDir, 'ref-sheet.png')}`]);
    execFileSync('rm', ['-f', a, b]);
  }
  return made;
}

/**
 * Rewriting a pack keeps the prompts its pictures were made from. A piece whose prompt text changed
 * gets its old prompt copied to prompts/archive/<short>.until-<time>.txt, a `history` row
 * ({file, until}) and `since` (when the new text started); art-intake.mjs then records, for a
 * picture saved before `since`, the prompt it was really made from. Prompt files no piece names
 * any more go (the archive stays). Answers the manifest with since/history added, and the archived files.
 */
export function keepPromptHistory(outDir, files, now = new Date().toISOString()) {
  const manifest = JSON.parse(files['pieces.json']);
  const oldFile = join(outDir, 'pieces.json');
  const old = existsSync(oldFile) ? JSON.parse(readFileSync(oldFile, 'utf8')) : null;
  const before = new Map((old?.pieces || []).map((p) => [p.short, p]));
  const archived = [];
  const stamp = now.slice(0, 19).replace(/[-:]/g, '');
  for (const p of manifest.pieces) {
    const was = before.get(p.short);
    if (!was) continue;
    const wasFile = join(outDir, was.promptFile);
    const wasText = existsSync(wasFile) ? readFileSync(wasFile, 'utf8') : null;
    let history = was.history || [];
    let since = was.since || null;
    if (wasText !== null && wasText !== files[p.promptFile]) {
      const keep = `prompts/archive/${p.short}.until-${stamp}.txt`;
      mkdirSync(join(outDir, 'prompts/archive'), { recursive: true });
      writeFileSync(join(outDir, keep), wasText);
      archived.push(keep);
      history = [...history, { file: keep, until: now }];
      since = now;
    }
    if (since) p.since = since;
    if (history.length) p.history = history;
  }
  const named = new Set(manifest.pieces.map((p) => p.promptFile));
  const promptDir = join(outDir, 'prompts');
  if (existsSync(promptDir)) {
    for (const f of readdirSync(promptDir)) {
      if (f.endsWith('.txt') && !named.has(`prompts/${f}`)) execFileSync('rm', ['-f', join(promptDir, f)]);
    }
  }
  return { manifest, archived };
}

async function loadZone(spec) {
  if (spec.startsWith('file:')) return readJson(resolve(spec.slice(5)));
  if (existsSync(spec) && spec.endsWith('.json')) return readJson(resolve(spec));
  const { settings, createClient, draftTarget } = await import('./cli.mjs');
  const cfg = settings(process.env);
  const { zone } = await draftTarget(createClient({ url: cfg.url, key: cfg.key }), spec).zone();
  return zone;
}

async function main(argv) {
  const opt = (k) => {
    const i = argv.indexOf(k);
    return i >= 0 ? argv[i + 1] : null;
  };
  const valued = new Set(['--brief', '--out', '--streets', '--refs']);
  const spec = argv.find((a, i) => !a.startsWith('--') && !valued.has(argv[i - 1]));
  if (!spec || argv.includes('--help')) {
    process.stdout.write('node tools/builder/art-bible.mjs <draft id | file:zone.json> [--brief <brief.json>] [--out <dir>] [--no-refs] [--streets 8] [--refs 8]\n');
    return spec ? 0 : 2;
  }
  const zone = await loadZone(spec);
  const briefFile = opt('--brief') || join(ROOT, 'tools/builder/art/briefs', `${zone.id}.json`);
  const brief = existsSync(briefFile) ? readJson(briefFile) : {};
  if (!existsSync(briefFile)) process.stderr.write(`No brief at ${briefFile}: the prompts fall back to the pieces' names.\n`);
  const outDir = resolve(opt('--out') || `${zone.id}-art`);
  const catalogRows = new Map(readJson(join(ROOT, 'public/assets/content/deco-catalog.json')).decos.map((r) => [r.name, r]));
  const pack = buildPack({
    zone,
    brief,
    shipped: loadShippedStreets(),
    palette: loadPalette(),
    catalogRows,
    profiles: readJson(join(ROOT, 'public/assets/content/style-profiles.json')),
    outDir,
    streetCount: Number(opt('--streets')) || 8,
    refCount: Number(opt('--refs')) || 8,
  });
  mkdirSync(join(outDir, 'prompts'), { recursive: true });
  mkdirSync(join(outDir, 'drop'), { recursive: true });
  const { manifest, archived } = keepPromptHistory(outDir, pack.files);
  pack.files['pieces.json'] = `${JSON.stringify(manifest, null, 1)}\n`;
  for (const [p, text] of Object.entries(pack.files)) writeFileSync(join(outDir, p), text);
  if (archived.length) process.stdout.write(`  ${archived.length} changed prompts: the old text kept in prompts/archive/ for the pictures made from it\n`);
  if (!argv.includes('--no-refs')) writeRefs(outDir, pack.refs);
  process.stdout.write(`${outDir}\n  ${pack.pieces.length} prompts, ${pack.refs.length} references, ${pack.palette.length} measured tones from ${pack.streets.list.map((s) => s.label).join(', ')}\n`);
  for (const p of pack.pieces) process.stdout.write(`  ${p.promptFile.padEnd(40)} ${p.kind.padEnd(8)} ${p.role.padEnd(12)} ${p.target.w}x${p.target.h}\n`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (e) => {
    process.stderr.write(`${e.message}\n`);
    process.exit(2);
  });
}
