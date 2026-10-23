#!/usr/bin/env node
/**
 * Bake what the Flash client's sprite-sheet recorder drew for a timeline
 * animated item, so FFDec renders the same frames.
 *
 * The client (glitch-client ItemFrameCollectionRecorder.recordState) calls
 * the item's playAnimation(label), which does gotoAndPlay(label) on the
 * animatee and on every clip in the item's `animated_mcs`, then records one
 * frame at a time with animatee.nextFrame() and nextFrame() on each of those
 * clips, in one synchronous loop. So:
 *  - each synced clip shows its own copy of the label, `k` frames in;
 *  - every other nested clip never ticks: it stays on frame 1.
 * FFDec instead plays every nested clip on its own clock from when it was
 * placed. The Juju Bandit (holder, face and both hands in animated_mcs, the
 * holder one frame behind the root because the root starts with `iconic`)
 * came out with the wrong hands and spawn sparkles.
 *
 * This writes a work copy where sprite `rootId` keeps its frame count and
 * FrameLabels but each frame shows one baked, one-frame sprite: the root's
 * display list at that frame with every nested sprite replaced, all the way
 * down, by a one-frame copy of its display list at the frame the recorder
 * would show (synced clips: their label start + k; others: frame 1).
 *
 * `place: true` also applies the transform the main timeline places the
 * animatee with (the flamingo is drawn mirrored and turned 5 degrees).
 *
 * Usage (from build.mjs, job "record": { "clips": ["<class or id>", ...], "place"?: true }):
 *   recordState(inFile, outFile, rootId, { clips, classes })
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const END = 0;
const SHOW_FRAME = 1;
const PLACE = 4;
const REMOVE = 5;
const PLACE2 = 26;
const REMOVE2 = 28;
const SPRITE = 39;
const FRAME_LABEL = 43;
const PLACE3 = 70;
/** New character ids count down from here (SWF ids are 16-bit). */
const FIRST_NEW_ID = 65000;

function inflate(buf) {
  const sig = buf.toString('ascii', 0, 3);
  if (sig === 'FWS') return Buffer.from(buf);
  if (sig === 'CWS') {
    const out = Buffer.concat([buf.subarray(0, 8), zlib.inflateSync(buf.subarray(8))]);
    out.write('FWS', 0, 'ascii');
    return out;
  }
  throw new Error(`unsupported SWF signature ${sig}`);
}

function firstTag(buf) {
  return 8 + Math.ceil((5 + 4 * (buf[8] >> 3)) / 8) + 4;
}

function tags(buf, start, end) {
  const out = [];
  let p = start;
  while (p < end) {
    const head = buf.readUInt16LE(p);
    const code = head >> 6;
    let len = head & 0x3f;
    let body = p + 2;
    if (len === 0x3f) {
      len = buf.readUInt32LE(p + 2);
      body = p + 6;
    }
    out.push({ code, start: p, body, len, end: body + len });
    p = body + len;
    if (code === END) break;
  }
  return out;
}

function tagBytes(code, body) {
  const head = Buffer.alloc(6);
  head.writeUInt16LE((code << 6) | 0x3f, 0);
  head.writeUInt32LE(body.length, 2);
  return Buffer.concat([head, body]);
}

function bitReader(buf, at) {
  let bit = 0;
  return {
    read(n) {
      let v = 0;
      for (let i = 0; i < n; i++) {
        v = (v << 1) | ((buf[at + (bit >> 3)] >> (7 - (bit & 7))) & 1);
        bit += 1;
      }
      return v;
    },
    bytes: () => Math.ceil(bit / 8),
  };
}

function matrixBytes(buf, at) {
  const r = bitReader(buf, at);
  if (r.read(1)) r.read(r.read(5) * 2);
  if (r.read(1)) r.read(r.read(5) * 2);
  r.read(r.read(5) * 2);
  return r.bytes();
}

function cxformBytes(buf, at) {
  const r = bitReader(buf, at);
  const hasAdd = r.read(1);
  const hasMult = r.read(1);
  const n = r.read(4);
  if (hasMult) r.read(n * 4);
  if (hasAdd) r.read(n * 4);
  return r.bytes();
}

function cstring(buf, at) {
  let q = at;
  while (buf[q] !== 0) q += 1;
  return q + 1 - at;
}

/** FILTERLIST byte length (SWF 8+ surface filters). */
function filterListBytes(buf, at) {
  const count = buf[at];
  let p = at + 1;
  for (let i = 0; i < count; i++) {
    const id = buf[p];
    p += 1;
    if (id === 0) p += 23; // drop shadow
    else if (id === 1) p += 9; // blur
    else if (id === 2) p += 15; // glow
    else if (id === 3) p += 27; // bevel
    else if (id === 4 || id === 7) p += 1 + 5 * buf[p] + 19; // gradient glow / bevel
    else if (id === 5) p += 15 + 4 * buf[p] * buf[p + 1]; // convolution
    else if (id === 6) p += 80; // colour matrix
    else throw new Error(`unknown filter ${id}`);
  }
  return p - at;
}

/**
 * A PlaceObject / PlaceObject2 / PlaceObject3 as raw field slices:
 * { depth, move, char, fields: { matrix, cxform, ratio, name, clipDepth,
 * filters, blend, cache, visible, bg } } (each a Buffer when present).
 */
function parsePlace(buf, t) {
  if (t.code === PLACE) {
    const char = buf.readUInt16LE(t.body);
    const depth = buf.readUInt16LE(t.body + 2);
    const m = matrixBytes(buf, t.body + 4);
    const fields = { matrix: buf.subarray(t.body + 4, t.body + 4 + m) };
    // PlaceObject's colour transform has no alpha; keep it out (rare in AS3 art).
    return { depth, move: false, char, fields };
  }
  const flags = buf[t.body];
  let p = t.body + 1;
  let flags2 = 0;
  if (t.code === PLACE3) {
    flags2 = buf[p];
    p += 1;
  }
  const depth = buf.readUInt16LE(p);
  p += 2;
  const hasChar = (flags & 0x02) !== 0;
  if (t.code === PLACE3 && (flags2 & 0x08 || (flags2 & 0x10 && hasChar))) p += cstring(buf, p);
  let char = null;
  if (hasChar) {
    char = buf.readUInt16LE(p);
    p += 2;
  }
  const fields = {};
  const take = (key, n) => {
    fields[key] = buf.subarray(p, p + n);
    p += n;
  };
  if (flags & 0x04) take('matrix', matrixBytes(buf, p));
  if (flags & 0x08) take('cxform', cxformBytes(buf, p));
  if (flags & 0x10) take('ratio', 2);
  if (flags & 0x20) take('name', cstring(buf, p));
  if (flags & 0x40) take('clipDepth', 2);
  if (t.code === PLACE3) {
    if (flags2 & 0x01) take('filters', filterListBytes(buf, p));
    if (flags2 & 0x02) take('blend', 1);
    if (flags2 & 0x04) take('cache', 1);
    if (flags2 & 0x20) take('visible', 1);
    if (flags2 & 0x40) take('bg', 4);
  }
  return { depth, move: (flags & 0x01) !== 0, char, fields };
}

/** One PlaceObject2 (or 3 when it needs filters/blend/cache/visibility) placing `char`. */
function placeTag(depth, char, f) {
  const po3 = f.filters || f.blend || f.cache || f.visible || f.bg;
  const flags = 0x02 | (f.matrix ? 0x04 : 0) | (f.cxform ? 0x08 : 0) | (f.ratio ? 0x10 : 0) | (f.name ? 0x20 : 0) | (f.clipDepth ? 0x40 : 0);
  const head = [flags];
  if (po3) head.push((f.filters ? 0x01 : 0) | (f.blend ? 0x02 : 0) | (f.cache ? 0x04 : 0) | (f.visible ? 0x20 : 0) | (f.bg ? 0x40 : 0));
  const d = Buffer.alloc(4);
  d.writeUInt16LE(depth, 0);
  d.writeUInt16LE(char, 2);
  const parts = [Buffer.from(head), d];
  for (const key of ['matrix', 'cxform', 'ratio', 'name', 'clipDepth']) if (f[key]) parts.push(f[key]);
  if (po3) for (const key of ['filters', 'blend', 'cache', 'visible', 'bg']) if (f[key]) parts.push(f[key]);
  return tagBytes(po3 ? PLACE3 : PLACE2, Buffer.concat(parts));
}

/** DefineSprites by id: { tag, frames, nested, labels: Map(name -> start frame) }. */
function spriteTable(buf) {
  const out = new Map();
  for (const t of tags(buf, firstTag(buf), buf.length)) {
    if (t.code !== SPRITE) continue;
    const nested = tags(buf, t.body + 4, t.end);
    const labels = new Map();
    let frame = 1;
    for (const n of nested) {
      if (n.code === SHOW_FRAME) frame += 1;
      else if (n.code === FRAME_LABEL) {
        const name = buf.toString('utf8', n.body, n.body + cstring(buf, n.body) - 1);
        if (!labels.has(name)) labels.set(name, frame);
      }
    }
    out.set(buf.readUInt16LE(t.body), { tag: t, frames: buf.readUInt16LE(t.body + 2), nested, labels });
  }
  return out;
}

/** The display list of a sprite at `frame`: Map(depth -> { char, fields }). */
function displayList(buf, src, frame) {
  const list = new Map();
  let shown = 1;
  const want = Math.max(1, Math.min(src.frames, frame));
  for (const t of src.nested) {
    if (t.code === SHOW_FRAME) {
      if (shown === want) break;
      shown += 1;
      continue;
    }
    if (t.code === REMOVE || t.code === REMOVE2) {
      list.delete(buf.readUInt16LE(t.code === REMOVE2 ? t.body : t.body + 2));
      continue;
    }
    if (![PLACE, PLACE2, PLACE3].includes(t.code)) continue;
    const pl = parsePlace(buf, t);
    const prev = list.get(pl.depth);
    if (pl.move && prev) {
      list.set(pl.depth, { char: pl.char ?? prev.char, fields: { ...prev.fields, ...pl.fields } });
    } else if (pl.char !== null) {
      list.set(pl.depth, { char: pl.char, fields: { ...pl.fields } });
    }
  }
  return list;
}

/** The label a frame is in and how far into it: { name, k } (null before any label). */
function labelAt(src, frame) {
  let best = null;
  for (const [name, start] of src.labels) if (start <= frame && (!best || start >= best.start)) best = { name, start };
  return best ? { name: best.name, k: frame - best.start } : null;
}

/**
 * Write `outFile`: `inFile` with sprite `rootId` replaced by recorder
 * frames. `clips` are the animated_mcs symbols (class names or ids);
 * `classes` maps class names to ids (swf-parts.mjs symbolClasses).
 * `frames` (optional [from, to] list) limits which root frames are baked;
 * the others are left empty. Returns { frames, sprites }.
 */
export function recordState(inFile, outFile, rootId, { clips = [], classes = new Map(), frames: ranges = null, place = false } = {}) {
  const buf = inflate(readFileSync(inFile));
  const sprites = spriteTable(buf);
  const root = sprites.get(rootId);
  if (!root) throw new Error(`no DefineSprite ${rootId} in ${inFile}`);
  const synced = new Set(clips.map((c) => {
    if (typeof c === 'number' || /^\d+$/.test(String(c))) return Number(c);
    if (!classes.has(c)) throw new Error(`no symbol ${c} in ${inFile}`);
    return classes.get(c);
  }));
  // Does a sprite (or anything it ever places) contain a synced clip?
  const syncMemo = new Map();
  const hasSync = (id, seen = new Set()) => {
    if (syncMemo.has(id)) return syncMemo.get(id);
    if (synced.has(id)) return true;
    const src = sprites.get(id);
    if (!src || seen.has(id)) return false;
    seen.add(id);
    let out = false;
    for (const t of src.nested) {
      if (![PLACE, PLACE2, PLACE3].includes(t.code)) continue;
      const pl = parsePlace(buf, t);
      if (pl.char !== null && hasSync(pl.char, seen)) { out = true; break; }
    }
    syncMemo.set(id, out);
    return out;
  };
  let nextId = FIRST_NEW_ID;
  const memo = new Map();
  const out = [];
  const used = new Set(sprites.keys());
  /** A one-frame sprite of `id` at `frame`, its children baked for label position `at`. */
  const bake = (id, frame, at) => {
    const src = sprites.get(id);
    if (!src) return id; // shapes, morphs, text, bitmaps draw as they are
    const key = `${id}:${frame}:${hasSync(id) && at ? `${at.name}+${at.k}` : ''}`;
    if (memo.has(key)) return memo.get(key);
    const list = displayList(buf, src, frame);
    const body = [];
    for (const [depth, { char, fields }] of [...list].sort((a, b) => a[0] - b[0])) {
      let childFrame = 1;
      if (synced.has(char) && at) {
        const start = sprites.get(char)?.labels.get(at.name);
        childFrame = start ? Math.min(sprites.get(char).frames, start + at.k) : 1;
      }
      body.push(placeTag(depth, bake(char, childFrame, at), fields));
    }
    while (used.has(nextId)) nextId -= 1;
    const newId = nextId;
    used.add(newId);
    nextId -= 1;
    if (nextId <= Math.max(...sprites.keys())) throw new Error('ran out of character ids');
    const head = Buffer.alloc(4);
    head.writeUInt16LE(newId, 0);
    head.writeUInt16LE(1, 2);
    out.push(tagBytes(SPRITE, Buffer.concat([head, ...body, Buffer.from([SHOW_FRAME << 6, 0]), Buffer.from([0, 0])])));
    memo.set(key, newId);
    return newId;
  };
  const wanted = (n) => !ranges || ranges.some(([a, b]) => n >= a && n <= b);
  // The new root: same labels, one baked sprite per frame at depth 1.
  const labelTags = new Map();
  let frame = 1;
  for (const t of root.nested) {
    if (t.code === SHOW_FRAME) frame += 1;
    else if (t.code === FRAME_LABEL) {
      if (!labelTags.has(frame)) labelTags.set(frame, []);
      labelTags.get(frame).push(buf.subarray(t.start, t.end));
    }
  }
  // place: keep the transform the item's main timeline gives the animatee
  // (the flamingo is placed mirrored and turned 5 degrees there).
  let rootFields = {};
  if (place) {
    const at = tags(buf, firstTag(buf), buf.length).find((t) => [PLACE2, PLACE3].includes(t.code) && parsePlace(buf, t).char === rootId);
    if (!at) throw new Error(`sprite ${rootId} is not placed on the main timeline`);
    const { matrix, cxform } = parsePlace(buf, at).fields;
    rootFields = { ...(matrix ? { matrix } : {}), ...(cxform ? { cxform } : {}) };
  }
  const rootBody = [];
  const head = Buffer.alloc(4);
  head.writeUInt16LE(rootId, 0);
  head.writeUInt16LE(root.frames, 2);
  rootBody.push(head);
  let placed = false;
  let baked = 0;
  for (let n = 1; n <= root.frames; n++) {
    for (const l of labelTags.get(n) || []) rootBody.push(l);
    if (wanted(n)) {
      const at = labelAt(root, n);
      const id = bake(rootId, n, at);
      if (place) {
        if (placed) rootBody.push(tagBytes(REMOVE2, Buffer.from([1, 0])));
        rootBody.push(placeTag(1, id, rootFields));
      } else {
        const b = Buffer.alloc(5);
        b[0] = placed ? 0x03 : 0x02; // move + character replaces the last frame's
        b.writeUInt16LE(1, 1);
        b.writeUInt16LE(id, 3);
        rootBody.push(tagBytes(PLACE2, b));
      }
      placed = true;
      baked += 1;
    } else if (placed) {
      const b = Buffer.alloc(2);
      b.writeUInt16LE(1, 0);
      rootBody.push(tagBytes(REMOVE2, b));
      placed = false;
    }
    rootBody.push(Buffer.from([SHOW_FRAME << 6, 0]));
  }
  rootBody.push(Buffer.from([0, 0]));
  // The baked sprites go right before the root (they only use earlier definitions).
  const result = Buffer.concat([
    buf.subarray(0, root.tag.start),
    ...out,
    tagBytes(SPRITE, Buffer.concat(rootBody)),
    buf.subarray(root.tag.end),
  ]);
  result.writeUInt32LE(result.length, 4);
  writeFileSync(outFile, result);
  return { frames: baked, sprites: out.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [inFile, outFile, id, ...clips] = process.argv.slice(2);
  const { symbolClasses } = await import('./swf-parts.mjs');
  console.log(recordState(inFile, outFile, Number(id), { clips, classes: symbolClasses(inFile) }));
}
