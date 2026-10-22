#!/usr/bin/env node
/**
 * Freeze the runtime state a SWF's ActionScript sets, so FFDec renders it.
 *
 * Harvestables (trants, the paper tree) pick their look in code: the client
 * calls gotoAndStop(health) on named child clips (bean branches, bubble
 * stalks, fruit-tree leaves) and hides fruit by name. FFDec runs no
 * ActionScript and draws every nested clip at its own timeline time. This
 * writes a work copy where, inside one DefineSprite:
 *  - `set: { "<instance name>": frame }` places a new one-frame DefineSprite
 *    (the child's display list at that frame) instead of the child, so it
 *    shows that frame at any time; `null` drops the placement (visible =
 *    false);
 *  - `pad: n` appends n frames holding the last frame's display list, so the
 *    sprite's frame F + k draws its still-playing children k frames later
 *    (fruit and bubbles animate on a stopped tree).
 *
 * Usage (from build.mjs, job "state": { "set": {...}, "pad": n }):
 *   freezeState(inFile, outFile, spriteId, { set, pad })
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const SHOW_FRAME = 1;
const PLACE = 4;
const REMOVE = 5;
const PLACE2 = 26;
const REMOVE2 = 28;
const SPRITE = 39;
const PLACE3 = 70;
const UNKNOWN_TAG = 1000;
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
  const nbits = buf[8] >> 3;
  return 8 + Math.ceil((5 + 4 * nbits) / 8) + 4;
}

/** Tags in [start, end): { code, start (header), body, len, end }. */
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
    if (code === 0) break;
  }
  return out;
}

function tagBytes(code, body) {
  const head = Buffer.alloc(6);
  head.writeUInt16LE((code << 6) | 0x3f, 0);
  head.writeUInt32LE(body.length, 2);
  return Buffer.concat([head, body]);
}

/** Character id and name of a PlaceObject2/3 (null when absent). */
function placement(buf, t) {
  if (t.code !== PLACE2 && t.code !== PLACE3) return null;
  const flags = t.body < buf.length ? buf[t.body] : 0;
  const hasChar = (flags & 0x02) !== 0;
  const hasMatrix = (flags & 0x04) !== 0;
  const hasCx = (flags & 0x08) !== 0;
  const hasRatio = (flags & 0x10) !== 0;
  const hasName = (flags & 0x20) !== 0;
  let p = t.body + 1;
  let flags2 = 0;
  if (t.code === PLACE3) {
    flags2 = buf[p];
    p += 1;
  }
  p += 2; // depth
  // Class name: hasClassName, or hasImage with a character.
  if (t.code === PLACE3 && (flags2 & 0x08 || (flags2 & 0x10 && hasChar))) {
    while (buf[p] !== 0) p += 1;
    p += 1;
  }
  let charAt = -1;
  if (hasChar) {
    charAt = p;
    p += 2;
  }
  if (hasMatrix) p += matrixBytes(buf, p);
  if (hasCx) p += cxformBytes(buf, p);
  if (hasRatio) p += 2;
  let name = null;
  if (hasName) {
    let q = p;
    while (buf[q] !== 0) q += 1;
    name = buf.toString('utf8', p, q);
  }
  return { charAt, char: charAt >= 0 ? buf.readUInt16LE(charAt) : null, name };
}

function bitReader(buf, at) {
  let bit = 0;
  return {
    read(n) {
      let v = 0;
      for (let i = 0; i < n; i++) {
        const byte = buf[at + (bit >> 3)];
        v = (v << 1) | ((byte >> (7 - (bit & 7))) & 1);
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
  // CXFORMWITHALPHA: four terms each.
  if (hasMult) r.read(n * 4);
  if (hasAdd) r.read(n * 4);
  return r.bytes();
}

/** The DefineSprite tags of a SWF by id: { tag, frames, nested }. */
function spriteTable(buf) {
  const out = new Map();
  for (const t of tags(buf, firstTag(buf), buf.length)) {
    if (t.code !== SPRITE) continue;
    const id = buf.readUInt16LE(t.body);
    out.set(id, { tag: t, frames: buf.readUInt16LE(t.body + 2), nested: tags(buf, t.body + 4, t.end) });
  }
  return out;
}

/** A one-frame copy of sprite `src` showing its display list at `frame`. */
function frozenSprite(buf, src, frame, newId) {
  const keep = [];
  let shown = 0;
  const want = Math.max(1, Math.min(src.frames, frame));
  for (const t of src.nested) {
    if (t.code === SHOW_FRAME) {
      shown += 1;
      if (shown === want) break;
      continue;
    }
    if ([PLACE, PLACE2, PLACE3, REMOVE, REMOVE2].includes(t.code)) keep.push(buf.subarray(t.start, t.end));
  }
  const head = Buffer.alloc(4);
  head.writeUInt16LE(newId, 0);
  head.writeUInt16LE(1, 2);
  const body = Buffer.concat([head, ...keep, Buffer.from([0x40, 0x00]), Buffer.from([0, 0])]);
  return tagBytes(SPRITE, body);
}

/**
 * Write `outFile`: `inFile` with sprite `spriteId`'s named children frozen
 * (or dropped) and `pad` frames appended. Returns a report of what changed.
 */
export function freezeState(inFile, outFile, spriteId, { set = {}, pad = 0 } = {}) {
  const buf = inflate(readFileSync(inFile));
  const sprites = spriteTable(buf);
  const target = sprites.get(spriteId);
  if (!target) throw new Error(`no DefineSprite ${spriteId} in ${inFile}`);
  const wanted = new Map(Object.entries(set));
  const frozen = new Map(); // `${char}:${frame}` -> new id
  const newTags = [];
  const report = { placements: 0, dropped: 0, frozen: 0, missing: [] };
  const seen = new Set();
  let nextId = FIRST_NEW_ID;
  // Rewrite the target sprite's nested tags in a copy of its body.
  const body = Buffer.from(buf.subarray(target.tag.body, target.tag.end));
  const rel = (abs) => abs - target.tag.body;
  for (const t of target.nested) {
    const pl = placement(buf, t);
    if (!pl?.name || !wanted.has(pl.name)) continue;
    seen.add(pl.name);
    const frame = wanted.get(pl.name);
    if (frame === null) {
      body.writeUInt16LE((UNKNOWN_TAG << 6) | (buf.readUInt16LE(t.start) & 0x3f), rel(t.start));
      report.dropped += 1;
      continue;
    }
    if (pl.char === null) continue;
    const src = sprites.get(pl.char);
    if (!src) throw new Error(`${pl.name} places character ${pl.char}, not a sprite`);
    const key = `${pl.char}:${frame}`;
    if (!frozen.has(key)) {
      const id = nextId++;
      frozen.set(key, id);
      newTags.push(frozenSprite(buf, src, frame, id));
      report.frozen += 1;
    }
    body.writeUInt16LE(frozen.get(key), rel(pl.charAt));
    report.placements += 1;
  }
  report.missing = [...wanted.keys()].filter((n) => !seen.has(n));
  // Pad: n more ShowFrames before the End tag.
  let spriteBody = body;
  if (pad > 0) {
    const end = target.nested[target.nested.length - 1];
    const cut = end.code === 0 ? rel(end.start) : body.length;
    spriteBody = Buffer.concat([body.subarray(0, cut), Buffer.alloc(pad * 2, 0), body.subarray(cut)]);
    for (let i = 0; i < pad; i++) spriteBody.writeUInt16LE(SHOW_FRAME << 6, cut + i * 2);
    spriteBody.writeUInt16LE(target.frames + pad, 2);
  }
  const out = Buffer.concat([
    buf.subarray(0, target.tag.start),
    ...newTags,
    tagBytes(SPRITE, spriteBody),
    buf.subarray(target.tag.end),
  ]);
  out.writeUInt32LE(out.length, 4);
  writeFileSync(outFile, out);
  return report;
}

/** Named placements on the root timeline: [{ name, char, frames }]. */
export function rootChildren(file) {
  const buf = inflate(readFileSync(file));
  const sprites = spriteTable(buf);
  const out = [];
  for (const t of tags(buf, firstTag(buf), buf.length)) {
    const pl = placement(buf, t);
    if (pl?.name) out.push({ name: pl.name, char: pl.char, frames: sprites.get(pl.char)?.frames ?? null });
  }
  return out;
}

/** Named child placements of a sprite: [{ name, char, frames }]. */
export function spriteChildren(file, spriteId) {
  const buf = inflate(readFileSync(file));
  const sprites = spriteTable(buf);
  const target = sprites.get(spriteId);
  if (!target) throw new Error(`no DefineSprite ${spriteId}`);
  const out = [];
  for (const t of target.nested) {
    const pl = placement(buf, t);
    if (pl?.name) out.push({ name: pl.name, char: pl.char, frames: sprites.get(pl.char)?.frames ?? null });
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [file, id] = process.argv.slice(2);
  for (const c of spriteChildren(file, Number(id))) console.log(`${c.name}\t${c.char}\t${c.frames}`);
}
