#!/usr/bin/env node
/**
 * Swap the body parts a SWF places, for NPCs whose variants are picked at
 * runtime (bureaucrats: arms/hair/torso/tie...; Juju bandits: colours). The
 * Flash client attached exported part symbols by class name; FFDec renders
 * whatever the timeline places by default. This rewrites every PlaceObject2/3
 * that places character A to place B instead (same byte length), or drops the
 * placement when B is null (its tag code becomes an unknown, ignored tag).
 *
 * Usage (from build.mjs, job "parts": { "<class or id>": "<class or id>" | null }):
 *   swapParts(inFile, outFile, { hair04: 'hair01', glasses01: null })
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';
import zlib from 'node:zlib';
import { FFDEC, JAVA } from './swf-labels.mjs';

/** Exported class name -> character id (FFDec symbolClass export). */
export function symbolClasses(swf) {
  const dir = join(os.tmpdir(), `swf-symbols-${process.pid}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  try {
    execFileSync(JAVA, ['-jar', FFDEC, '-export', 'symbolClass', dir, swf], { stdio: 'ignore' });
    const out = new Map();
    for (const line of readFileSync(join(dir, 'symbols.csv'), 'utf8').split('\n')) {
      const m = /^(\d+);"(.*)"$/.exec(line.trim());
      if (m) out.set(m[2], Number(m[1]));
    }
    return out;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Uncompressed SWF bytes (FWS or CWS). */
function inflate(buf) {
  const sig = buf.toString('ascii', 0, 3);
  if (sig === 'FWS') return Buffer.from(buf);
  if (sig === 'CWS') {
    const body = zlib.inflateSync(buf.subarray(8));
    const out = Buffer.concat([buf.subarray(0, 8), body]);
    out.write('FWS', 0, 'ascii');
    return out;
  }
  throw new Error(`unsupported SWF signature ${sig}`);
}

/** Offset of the first tag (after the RECT, frame rate and count). */
function firstTag(buf) {
  const nbits = buf[8] >> 3;
  const rectBytes = Math.ceil((5 + 4 * nbits) / 8);
  return 8 + rectBytes + 4;
}

const UNKNOWN_TAG = 1000;

/**
 * Rewrite placements in tags [start, end). Returns how many were changed.
 * map: Map<fromId, toId | null>.
 */
function rewrite(buf, start, end, map) {
  let n = 0;
  let p = start;
  while (p < end) {
    const head = buf.readUInt16LE(p);
    let code = head >> 6;
    let len = head & 0x3f;
    let body = p + 2;
    if (len === 0x3f) {
      len = buf.readUInt32LE(p + 2);
      body = p + 6;
    }
    if (code === 39) {
      // DefineSprite: id, frame count, nested tags.
      n += rewrite(buf, body + 4, body + len, map);
    } else if (code === 26 || code === 70) {
      const flags = buf[body];
      const hasCharacter = (flags & 0x02) !== 0;
      let at = -1;
      if (code === 26 && hasCharacter) at = body + 3;
      if (code === 70 && hasCharacter) {
        const flags2 = buf[body + 1];
        at = body + 4;
        if (flags2 & 0x08 || flags2 & 0x10) {
          while (buf[at] !== 0) at += 1;
          at += 1;
        }
      }
      if (at >= 0) {
        const id = buf.readUInt16LE(at);
        if (map.has(id)) {
          const to = map.get(id);
          if (to === null) {
            code = UNKNOWN_TAG;
            buf.writeUInt16LE((code << 6) | (head & 0x3f), p);
          } else {
            buf.writeUInt16LE(to, at);
          }
          n += 1;
        }
      }
    }
    p = body + len;
  }
  return n;
}

/**
 * Write a copy of `inFile` to `outFile` with parts swapped. Keys and values
 * are exported class names or numeric ids; null drops the part. Returns the
 * number of placements changed.
 */
export function swapParts(inFile, outFile, parts) {
  const classes = symbolClasses(inFile);
  const idOf = (v) => {
    if (typeof v === 'number') return v;
    if (/^\d+$/.test(v)) return Number(v);
    if (!classes.has(v)) throw new Error(`no symbol ${v} in ${inFile}`);
    return classes.get(v);
  };
  const map = new Map(Object.entries(parts).map(([from, to]) => [idOf(from), to === null ? null : idOf(to)]));
  const buf = inflate(readFileSync(inFile));
  const n = rewrite(buf, firstTag(buf), buf.length, map);
  buf.writeUInt32LE(buf.length, 4);
  writeFileSync(outFile, buf);
  return n;
}
