/**
 * LEVEL BUILDER: standing a street on the ground (lane GROUNDED, 2026-11-01). Austin, on the AI
 * art copy of Mount Ashomel: "everything looks like it's floating". Tiny Speck's own streets are
 * grounded: in about 3 streets of 4 the floor's art runs past the street's bottom edge, and about 3
 * walkable lines of 4 with FLOAT_REACH px or less to the surface below have art under them
 * (against about 1 in 2 of the higher ones); floating platforms are kept for heights and cloud
 * streets. Pure: no DOM, no Pixi. Two callers:
 *
 *   floatingLines(street, opts)   the walkable lines whose art has open space under it (ART-001)
 *   groundOps(zone, key, opts)    the ops that stand a street on the ground (cli.mjs ground)
 *
 * Coordinates are world space (platforms and middleground decos; y up is negative), the deco
 * anchor is bottom-centre. "Art under a line" is any middleground deco box in its column; the
 * pictures' own transparency is not looked at (a box is what the zone knows).
 */
import { isStandable } from '../street-model.js?v=b6cb6a4e';
import { nextDecoId } from './ops.js?v=27c7796f';

/**
 * A walkable line this close to the surface below it (px) is low: it should stand on something.
 * About three plain jumps (142 px, spec 2.3); over Tiny Speck's streets 75% of lines this low have
 * art under them and 55% of higher ones do, so higher lines may float or sit against a wall.
 */
export const FLOAT_REACH = 450;
/** Open space under a line's art (px) allowed before the line floats. */
export const FLOAT_OPEN = 24;
/** A line floats when over this share of its low samples (and at least two) have open space under them. */
export const FLOAT_SHARE = 1 / 3;
/** Floor art runs this far past the street's bottom edge: the camera's slack under the deepest floor (movement.js cameraBottomSlack, 40 px). */
export const FLOOR_SKIRT = 40;
/** Supports stay this far in from a line's ends, so the take-off and landing room of a jump is clear. */
export const SUPPORT_INSET = 60;
/** A support is at most this share of its line's length wide (it holds the ledge up; the ledge juts out over it). */
export const SUPPORT_SHARE = 0.7;
/** A support's top sits this far under the walkable surface (hidden behind the ledge's body), its foot this far into the surface below. */
export const SUPPORT_TUCK = 24;
export const SINK = 16;
/** Narrower than this, a support piece is left out. */
export const SUPPORT_MIN_W = 60;
/** A wall runs this far above the line that juts from it. */
export const WALL_ABOVE = 160;
/** Columns kept clear of supports, each side of the thing (px). */
export const CLEAR = Object.freeze({ ladder: 20, signpost: 20, door: 20, emitter: 24 });
/** The names the ground command gives its decos (so a second run replaces them). */
export const GROUND_NAMES = Object.freeze({ floor: 'ground:floor', support: 'ground:support', wall: 'ground:wall' });
const OWN = new Set([GROUND_NAMES.support, GROUND_NAMES.wall]);

const round = (n) => Math.round(n);

/** PURE: a line's world y at x (null when it does not span x). */
export function lineYAt(p, x) {
  const x0 = Math.min(p.x1, p.x2);
  const x1 = Math.max(p.x1, p.x2);
  if (x < x0 - 0.5 || x > x1 + 0.5) return null;
  if (p.x2 === p.x1) return Math.min(p.y1, p.y2);
  return p.y1 + ((p.y2 - p.y1) * (x - p.x1)) / (p.x2 - p.x1);
}

/** The walkable lines worth standing on (60 px or longer). */
function walkable(street) {
  return (street.platforms || []).filter((p) => isStandable(p) && Math.abs(p.x2 - p.x1) >= 60);
}

function middle(street) {
  return (street.layers || []).find((l) => l.id === 'middleground') || null;
}

/** PURE: the surface under (x, y): the nearest walkable line below, else the street's bottom edge. */
export function surfaceBelow(street, x, y, lines = walkable(street)) {
  let best = { y: street.bounds.b, line: null };
  for (const q of lines) {
    const qy = lineYAt(q, x);
    if (qy !== null && qy > y + 4 && qy < best.y) best = { y: qy, line: q.id };
  }
  return best;
}

/**
 * PURE: the middleground decos a line's art is made of: decos whose top sits on the line (the line
 * in the upper half of the deco, at most 8 px above its top) over at least half the deco's width.
 * The ground command's own supports and walls are not a line's art.
 */
export function lineArt(street, p) {
  const out = [];
  const x0 = Math.min(p.x1, p.x2);
  const x1 = Math.max(p.x1, p.x2);
  for (const d of middle(street)?.decos || []) {
    if (d.hidden || OWN.has(d.name) || !(d.w > 0) || !(d.h > 0)) continue;
    const cover = Math.min(d.x + d.w / 2, x1) - Math.max(d.x - d.w / 2, x0);
    if (cover < Math.min(d.w, x1 - x0) * 0.5) continue;
    const y = lineYAt(p, Math.max(x0, Math.min(x1, d.x)));
    const top = d.y - d.h;
    if (y !== null && y >= top - 8 && y <= top + d.h * 0.5) out.push(d);
  }
  return out;
}

/** PURE: the vertical runs [top, bottom] middleground art covers in the column at x. */
function columnCover(street, x) {
  const runs = [];
  for (const d of middle(street)?.decos || []) {
    if (d.hidden || !(d.w > 0) || !(d.h > 0) || Math.abs(x - d.x) > d.w / 2) continue;
    runs.push([d.y - d.h, d.y]);
  }
  return runs.sort((a, b) => a[0] - b[0]);
}

/** PURE: the longest stretch of [from, to] (world y, down is larger) that no run covers. */
export function openRun(runs, from, to) {
  let at = from;
  let open = 0;
  for (const [a, b] of runs) {
    if (b <= at) continue;
    if (a > at) open = Math.max(open, Math.min(a, to) - at);
    at = Math.max(at, b);
    if (at >= to) break;
  }
  if (at < to) open = Math.max(open, to - at);
  return Math.max(0, open);
}

/** PURE: sample x positions over [x0, x1], every `step` px (at least three). */
function samplesOver(x0, x1, step = 40) {
  if (x1 <= x0) return [(x0 + x1) / 2];
  const n = Math.max(2, Math.ceil((x1 - x0) / step));
  return Array.from({ length: n + 1 }, (_, i) => x0 + ((x1 - x0) * i) / n);
}

/**
 * PURE: the part of a line a support holds up: SUPPORT_INSET in from its ends (the take-off and
 * landing room of a jump), at most SUPPORT_SHARE of its length, centred. [x0, x1] world.
 */
export function supportSpan(p) {
  const len = Math.abs(p.x2 - p.x1);
  const inset = Math.min(SUPPORT_INSET, len * 0.15);
  const half = Math.max(0, Math.min(len - 2 * inset, len * SUPPORT_SHARE)) / 2;
  const mid = (p.x1 + p.x2) / 2;
  return [mid - half, mid + half];
}

/** PURE: whether a line is the floor: nothing walkable under its middle, the street's bottom edge within `reach`. */
export function isFloorLine(street, p, lines = walkable(street), reach = FLOAT_REACH) {
  const mid = (p.x1 + p.x2) / 2;
  const y = lineYAt(p, mid);
  const under = surfaceBelow(street, mid, y, lines);
  return under.line === null && under.y - y <= reach;
}

/**
 * PURE: the walkable lines that float: art on them, the surface below within `reach`, and more
 * than `open` px of the column under the art left open over a third of the line (nothing under it: no
 * support, no floor, no wall, no other art). The floor counts too: its surface below is the street's
 * bottom edge. A ledge is looked at where a support would hold it (supportSpan, inner 90%), leaving
 * out the columns kept clear for ladders, signposts, doors and effects; the floor along its whole
 * length (60 px in from its ends). Each row: { id, floor, x, y (world, the art's underside at the line's middle),
 * gap (line to surface), open (px), share (of the samples that float), surface (world y) }.
 */
export function floatingLines(street, { reach = FLOAT_REACH, open = FLOAT_OPEN } = {}) {
  if (!street?.bounds || !middle(street)) return [];
  const lines = walkable(street);
  const clear = clearColumns(street);
  const out = [];
  for (const p of lines) {
    const art = lineArt(street, p);
    if (!art.length) continue; // a line with no art on it is another matter (it is invisible)
    const len = Math.abs(p.x2 - p.x1);
    let xs;
    if (isFloorLine(street, p, lines, reach)) {
      const inset = Math.min(SUPPORT_INSET, len * 0.15);
      xs = samplesOver(Math.min(p.x1, p.x2) + inset, Math.max(p.x1, p.x2) - inset);
    } else {
      const [a, c] = supportSpan(p);
      const pad = Math.max(10, (c - a) * 0.05);
      // A support never goes in a clear column, nor in a sliver beside one too narrow for it.
      const m = SUPPORT_MIN_W / 2;
      xs = samplesOver(a + pad, c - pad).filter((x) => !clear.some(([c0, c1]) => x >= c0 - m && x <= c1 + m));
    }
    let low = 0;
    let floating = 0;
    let worst = null;
    for (const x of xs) {
      const y = lineYAt(p, x);
      const under = surfaceBelow(street, x, y, lines);
      if (under.y - y > reach) continue;
      low += 1;
      const o = openRun(columnCover(street, x), y, under.y);
      if (o > open) {
        floating += 1;
        if (!worst || o > worst.open) worst = { x, y, open: o, surface: under.y, floor: under.line === null, gap: under.y - y };
      }
    }
    if (floating < 2 || floating / low <= FLOAT_SHARE) continue;
    const mid = (p.x1 + p.x2) / 2;
    const bottom = Math.max(...art.filter((d) => Math.abs(d.x - mid) <= d.w / 2).map((d) => d.y), lineYAt(p, mid));
    out.push({ id: p.id, floor: worst.floor, x: round(mid), y: round(bottom), gap: round(worst.gap), open: round(worst.open), share: Math.round((floating / low) * 100) / 100, surface: round(worst.surface) });
  }
  return out;
}

/** PURE: the x ranges (world) supports must leave clear: ladders, signposts, doors and effects. */
export function clearColumns(street) {
  const out = [];
  const l = street.bounds?.l || 0;
  for (const q of street.ladders || []) out.push([q.x - (q.w || 50) / 2 - CLEAR.ladder, q.x + (q.w || 50) / 2 + CLEAR.ladder, 'ladder']);
  for (const q of street.signposts || []) out.push([q.x - (q.w || 150) / 2 - CLEAR.signpost, q.x + (q.w || 150) / 2 + CLEAR.signpost, 'signpost']);
  // Doors are in screen space (x - bounds.l).
  for (const q of street.doors || []) out.push([q.x + l - (q.w || 100) / 2 - CLEAR.door, q.x + l + (q.w || 100) / 2 + CLEAR.door, 'door']);
  for (const e of street.emitters || []) {
    if ((e.layer || 'middleground') !== 'middleground') continue;
    const half = Math.max(40, (Number(e.spread) || 0) + (Number(e.size) || 40) / 2);
    out.push([e.x - half - CLEAR.emitter, e.x + half + CLEAR.emitter, 'effect']);
  }
  return out;
}

/** PURE: [a, b] with the clear ranges cut out: the pieces left, each at least `min` wide. */
export function cutRanges(a, b, clear, min = SUPPORT_MIN_W) {
  let pieces = [[a, b]];
  for (const [c0, c1] of clear) {
    const next = [];
    for (const [p0, p1] of pieces) {
      if (c1 <= p0 || c0 >= p1) next.push([p0, p1]);
      else {
        if (c0 > p0) next.push([p0, c0]);
        if (c1 < p1) next.push([c1, p1]);
      }
    }
    pieces = next;
  }
  return pieces.filter(([p0, p1]) => p1 - p0 >= min);
}

/**
 * PURE: copies of a tiling piece stacked to fill [top, bottom] at width w: as few copies as keep
 * each near its own shape (tile height w * h/w of the art), each stretched a little to fit.
 */
export function stack(top, bottom, w, aspect, { stretch = false } = {}) {
  const tile = w * aspect;
  const span = bottom - top;
  if (!(span > 0) || !(tile > 0)) return [];
  // A stand-in that does not tile (an object picture) goes in once, stretched to the gap.
  const n = stretch ? 1 : Math.max(1, Math.round(span / tile));
  const h = span / n;
  return Array.from({ length: n }, (_, i) => ({ y: top + h * (i + 1), h }));
}

/**
 * PURE: the ops that stand street `key` on the ground, and what they did. Re-runnable: the decos it
 * made before (named ground:support and ground:wall, and ground:floor when a floor piece is given)
 * are removed first.
 *
 * opts: floor, support, wall (sprite names; each optional), size(sprite) -> { w, h } the art's
 * drawn size (its shape: a tile's height is width * h / w), reach (FLOAT_REACH), stretch (one copy
 * per gap, stretched, for a stand-in picture that does not tile).
 *
 * - The floor (lines with nothing under them within `reach` of the street's bottom edge): its art
 *   runs FLOOR_SKIRT past the bottom edge, so no fill shows under it. With `floor`, the old floor
 *   art goes and the floor piece is laid along each floor line (tiles overlapping 8%), each tile
 *   from the line down past the bottom; without, the art on the floor is stretched down.
 * - Low lines (the surface below within `reach`) whose art has open space under it: `support`
 *   tiles stacked behind the line, from just under its surface down into the surface below, at
 *   most SUPPORT_SHARE of its length and SUPPORT_INSET in from its ends, leaving clear the columns
 *   of ladders, signposts, doors and effects, split where the surface below changes.
 * - High lines: with `wall`, a wall behind each, from WALL_ABOVE over the line down into the
 *   surface below; without, they stay floating (the brief's choice).
 */
export function groundOps(zone, key, { floor = null, support = null, wall = null, size = () => null, reach = FLOAT_REACH, stretch = false } = {}) {
  const row = (zone.streets || []).find((s) => s.key === key);
  if (!row?.street) throw Object.assign(new Error(`This zone has no street "${key}".`), { code: 'builder_not_found' });
  const street = row.street;
  const mg = middle(street);
  if (!mg) throw Object.assign(new Error(`Street "${key}" has no middleground layer.`), { code: 'builder_not_found' });
  const aspectOf = (sprite, what) => {
    const s = size(sprite);
    if (!s || !(s.w > 0) || !(s.h > 0)) throw Object.assign(new Error(`No art "${sprite}" for --${what}: name a sprite in this zone's art or the library.`), { code: 'builder_not_found' });
    return { w: s.w, h: s.h, aspect: s.h / s.w };
  };
  const floorArt = floor ? aspectOf(floor, 'floor') : null;
  const supportArt = support ? aspectOf(support, 'support') : null;
  const wallArt = wall ? aspectOf(wall, 'wall') : null;

  const ops = [];
  const done = { removed: 0, floor: { lines: 0, laid: 0, stretched: 0 }, supports: [], walls: [], floating: [], high: [] };
  const drop = new Set([...OWN, ...(floor ? [GROUND_NAMES.floor] : [])]);
  // A working copy without our old decos, so every measure below sees the street as it will be.
  const work = JSON.parse(JSON.stringify(street));
  const wmg = middle(work);
  wmg.decos = (wmg.decos || []).filter((d) => {
    if (!drop.has(d.name)) return true;
    ops.push({ op: 'deco.remove', street: key, id: d.id });
    done.removed += 1;
    return false;
  });
  const lines = walkable(work);
  const zs = (mg.decos || []).map((d) => Number(d.z) || 0);
  const back = (zs.length ? Math.min(...zs) : 0) - 1;
  const taken = new Set((mg.decos || []).map((d) => d.id));
  const add = (deco, at = null) => {
    const id = nextDecoId(work, taken);
    taken.add(id);
    const full = { id, ...deco, x: round(deco.x), y: round(deco.y), w: round(deco.w), h: round(deco.h) };
    ops.push({ op: 'deco.add', street: key, layer: 'middleground', deco: full, ...(at === null ? {} : { at }) });
    // Later measures see it (supports under one line count for the next).
    wmg.decos.push(full);
    return id;
  };
  const b = work.bounds.b;
  const clear = clearColumns(work);

  // The floor.
  const floors = lines.filter((p) => isFloorLine(work, p, lines, reach));
  const floorIds = new Set(floors.map((p) => p.id));
  for (const p of floors) {
    done.floor.lines += 1;
    const art = lineArt(work, p);
    if (floorArt) {
      // Old floor art goes (the new piece replaces it); the floor piece is laid along the line.
      for (const d of art) {
        if (!d.name?.startsWith('ground:')) {
          ops.push({ op: 'deco.remove', street: key, id: d.id });
          wmg.decos = wmg.decos.filter((x) => x.id !== d.id);
        }
      }
      const x0 = Math.min(p.x1, p.x2);
      const x1 = Math.max(p.x1, p.x2);
      const tw = floorArt.w;
      const step = tw * 0.92;
      const n = Math.max(1, Math.ceil((x1 - x0 + tw * 0.08) / step));
      const z = Math.max(...zs, 0) + 1;
      for (let i = 0; i < n; i += 1) {
        const cx = x0 + tw / 2 - tw * 0.04 + i * step;
        const top = lineYAt(p, Math.max(x0, Math.min(x1, cx))) - 2;
        const bottom = Math.max(top + tw * floorArt.aspect, b + FLOOR_SKIRT);
        add({ sprite: floor, name: GROUND_NAMES.floor, x: cx, y: bottom, w: tw, h: bottom - top, z, r: 0 });
        done.floor.laid += 1;
      }
    } else {
      for (const d of art) {
        if (d.y >= b + FLOOR_SKIRT) continue;
        const top = d.y - d.h;
        const y = b + FLOOR_SKIRT;
        ops.push({ op: 'deco.set', street: key, id: d.id, set: { y: round(y), h: round(y - top) } });
        d.h = round(y - top);
        d.y = round(y);
        done.floor.stretched += 1;
      }
    }
  }

  // Each line, split where the surface below it changes: the low parts that float get supports,
  // the high parts a wall (or they float, the brief's choice).
  const groupsOver = (p, a, c) => {
    // Contiguous runs of one surface (a boundary halfway between samples); a run too narrow for
    // a piece joins its neighbour and goes down to the deeper surface of the two (not past `reach`).
    const groups = [];
    const step = Math.max(5, Math.min(20, (c - a) / 4));
    let prev = a;
    for (let x = a; x <= c + 0.5; x += step) {
      const xx = Math.min(x, c);
      const s = surfaceBelow(work, xx, lineYAt(p, xx), lines).y;
      const g = groups.at(-1);
      if (g && Math.abs(g.s - s) <= 8) g.x1 = xx;
      else {
        if (g) g.x1 = (prev + xx) / 2;
        groups.push({ x0: g ? (prev + xx) / 2 : a, x1: xx, s });
      }
      prev = xx;
    }
    for (let i = 0; i < groups.length && groups.length > 1;) {
      const g = groups[i];
      if (g.x1 - g.x0 >= SUPPORT_MIN_W) {
        i += 1;
        continue;
      }
      const j = i > 0 ? i - 1 : i + 1;
      const n = groups[j];
      n.x0 = Math.min(n.x0, g.x0);
      n.x1 = Math.max(n.x1, g.x1);
      // The deeper surface, unless that would make a low part high (a sliver over a far drop).
      const y = lineYAt(p, (n.x0 + n.x1) / 2);
      if (g.s - y <= reach || n.s - y > reach) n.s = Math.max(n.s, g.s);
      groups.splice(i, 1);
      i = 0;
    }
    return groups.filter((g) => g.x1 - g.x0 >= SUPPORT_MIN_W);
  };
  const topDown = [...lines].sort((a, c) => Math.min(a.y1, a.y2) - Math.min(c.y1, c.y2) || String(a.id).localeCompare(String(c.id)));
  for (const p of topDown) {
    if (floorIds.has(p.id) || !lineArt(work, p).length) continue;
    const len = Math.abs(p.x2 - p.x1);
    const lineTop = Math.min(lineYAt(p, p.x1), lineYAt(p, p.x2));
    const floats = floatingLines(work, { reach }).some((f) => f.id === p.id);
    let supports = 0;
    if (floats) {
      const [s0, s1] = supportSpan(p);
      for (const [a, c] of cutRanges(s0, s1, clear)) {
        for (const g of groupsOver(p, a, c)) {
          const cx = (g.x0 + g.x1) / 2;
          if (g.s - lineYAt(p, cx) > reach) continue;
          if (!supportArt) continue;
          const top = lineYAt(p, cx) + SUPPORT_TUCK;
          for (const t of stack(top, g.s + SINK, g.x1 - g.x0, supportArt.aspect, { stretch })) {
            add({ sprite: support, name: GROUND_NAMES.support, x: cx, y: t.y, w: g.x1 - g.x0, h: t.h, z: back, r: 0 }, 0);
            supports += 1;
          }
        }
      }
    }
    // The high parts: over the line's middle 80%, clear columns or not (a ladder leans on a wall).
    const highs = groupsOver(p, Math.min(p.x1, p.x2) + len * 0.1, Math.max(p.x1, p.x2) - len * 0.1).filter((g) => g.s - lineYAt(p, (g.x0 + g.x1) / 2) > reach);
    let walls = 0;
    if (wallArt) {
      for (const g of highs) {
        const cx = (g.x0 + g.x1) / 2;
        // A wall already behind this part (one put up for a line above) serves this line too.
        if (openRun(columnCover(work, cx), lineTop - WALL_ABOVE / 2, g.s) <= FLOAT_OPEN) continue;
        const w = Math.min(g.x1 - g.x0, wallArt.w);
        for (const t of stack(lineTop - WALL_ABOVE, g.s + SINK, w, wallArt.aspect, { stretch })) {
          add({ sprite: wall, name: GROUND_NAMES.wall, x: cx, y: t.y, w, h: t.h, z: back, r: 0 }, 0);
          walls += 1;
        }
      }
    }
    if (supports) done.supports.push(p.id);
    if (walls) done.walls.push(p.id);
    if (highs.length && !wallArt) done.high.push(p.id);
  }
  // What still floats once everything is in (the validator's ART-001 on the result).
  done.floating = floatingLines(work, { reach }).map((f) => f.id);
  return { ops, done };
}
