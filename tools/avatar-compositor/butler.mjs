/**
 * Butler rig: flatten glitch-items' bag_butler.swf into the data the
 * browser paints (js/butler-rig.js), part by part, at any of its 1082 frames.
 *
 *   node tools/avatar-compositor/butler.mjs [--swf=...] [--out=public/assets/butler-rig] [--work=DIR] [--check]
 *
 * Source facts (glitch-items/misc/npc_mailbox/bag_butler/bag_butler.as):
 *  - animatee = butlerDoll_mc (1082 frames, 24 labels); animated_mcs =
 *    ['face', 'skull']: the client's frame recorder steps those clips with
 *    the doll (ItemFrameCollectionRecorder: mc[name].nextFrame()), and every
 *    face1-8 timeline carries the doll's labels at the same frames, so a
 *    face shows its own frame n at doll frame n. face9-13 and every skull
 *    are one frame.
 *  - initializehead attaches each part as the only child of its container
 *    (addArticleToContainer: container emptied, article added at index 0
 *    with an identity matrix): accessoryOver<N> / accessoryUnder<N>, the
 *    body class (body1-16), the skull and face classes inside
 *    headContainer_mc, closeArmLower/Upper<N>, farArmLower/Upper<N>,
 *    closeLegLower/Upper<N>, farLegLower/Upper<N>. The close lower leg's
 *    container symbol is spelled closeLefLowerContainer; its instance is
 *    closeLegLowerContainer_mc.
 *  - config_options: accessory 1-12, bod body1-16, skull skull1-22,
 *    face face1-13, closeArm/farArm 1-12, closeLeg 1-13, farLeg 1-11.
 *
 * Output (one JSON, shapes shared by every part):
 *   { v, fps, labels: { anim: [first, count] }, slots: [paint order],
 *     poses: [[matrix per slot]], frames: [pose index per doll frame],
 *     box: { anim: [x0, y0, x1, y1] } (union over every part choice),
 *     parts: { className: ops | { frames: [variant per frame], variants: [ops] } },
 *     shapes: { id: { b, p } } }
 * ops = [{ s, m, a? }] in the part's own space (shapes.mjs format).
 *
 * SWF files are untrusted data: only bytes are read, no ActionScript runs.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { displayListAt, readSwf } from './swf.mjs';
import { exportShapes } from './shapes.mjs';
import { flattenPart, flattenSprite, mul, roundMatrix, shapeIds } from './rig.mjs';
import { BUTLER_OPTIONS } from '../../public/js/butler.js?v=814ee05f';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
export const BUTLER_SWF = join(os.homedir(), 'Documents/glitch-audit/glitch-items/misc/npc_mailbox/bag_butler/bag_butler.swf');

/** bag_butler.as config_options (the values the GSJS instance props hold): js/butler.js. */
export { BUTLER_OPTIONS };

/**
 * Doll containers in paint order (depth), with the config option that fills
 * each and the class name a value attaches (initializehead).
 */
export const BUTLER_SLOTS = Object.freeze([
  { slot: 'farArmUpper', container: 'farArmUpperContainer_mc', option: 'farArm', cls: (v) => `farArmUpper${v}` },
  { slot: 'farArmLower', container: 'farArmLowerContainer_mc', option: 'farArm', cls: (v) => `farArmLower${v}` },
  { slot: 'farLegLower', container: 'farLegLowerContainer_mc', option: 'farLeg', cls: (v) => `farLegLower${v}` },
  { slot: 'farLegUpper', container: 'farLegUpperContainer_mc', option: 'farLeg', cls: (v) => `farLegUpper${v}` },
  { slot: 'bod', container: 'bodyContainer_mc', option: 'bod', cls: (v) => v },
  { slot: 'skull', container: 'headContainer_mc/skullContainer_mc', option: 'skull', cls: (v) => v },
  { slot: 'face', container: 'headContainer_mc/faceContainer_mc', option: 'face', cls: (v) => v },
  { slot: 'closeLegLower', container: 'closeLegLowerContainer_mc', option: 'closeLeg', cls: (v) => `closeLegLower${v}` },
  { slot: 'accessoryUnder', container: 'accessoryUnderContainer_mc', option: 'accessory', cls: (v) => `accessoryUnder${v}` },
  { slot: 'closeLegUpper', container: 'closeLegUpperContainer_mc', option: 'closeLeg', cls: (v) => `closeLegUpper${v}` },
  { slot: 'closeArmUpper', container: 'closeArmUpperContainer_mc', option: 'closeArm', cls: (v) => `closeArmUpper${v}` },
  { slot: 'accessoryOver', container: 'accessoryOverContainer_mc', option: 'accessory', cls: (v) => `accessoryOver${v}` },
  { slot: 'closeArmLower', container: 'closeArmLowerContainer_mc', option: 'closeArm', cls: (v) => `closeArmLower${v}` },
]);

/** Placement of a named child path under a sprite at frame n (matrix product, depth). */
function placementAt(swf, spriteId, path, n) {
  let id = spriteId;
  let m = [1, 0, 0, 1, 0, 0];
  let depth = null;
  for (const name of path.split('/')) {
    const t = swf.sprites.get(id);
    const p = [...displayListAt(t, Math.min(n, t.frameCount)).values()].find((x) => x.name === name);
    if (!p) throw new Error(`${path}: ${name} missing at frame ${n}`);
    if (p.cxform && (p.cxform.m.some((v) => v !== 1) || p.cxform.o.some((v) => v))) throw new Error(`${path}: colour transforms are not supported`);
    if (p.blendMode && p.blendMode !== 'normal') throw new Error(`${path}: blend modes are not supported`);
    if (depth === null) depth = p.depth;
    m = mul(m, p.matrix);
    id = p.id;
  }
  return { m: roundMatrix(m), depth };
}

function boundsOf(ops, shapes, base, acc) {
  for (const o of ops) {
    const b = shapes.get(o.s)?.b;
    if (!b) continue;
    const m = mul(base, o.m);
    for (const [x, y] of [[b[0], b[1]], [b[2], b[1]], [b[0], b[3]], [b[2], b[3]]]) {
      const px = m[0] * x + m[2] * y + m[4];
      const py = m[1] * x + m[3] * y + m[5];
      acc[0] = Math.min(acc[0], px); acc[1] = Math.min(acc[1], py);
      acc[2] = Math.max(acc[2], px); acc[3] = Math.max(acc[3], py);
    }
  }
  return acc;
}

export function buildButlerRig(swfFile = BUTLER_SWF, workDir = join(os.tmpdir(), 'butler-compositor')) {
  const swf = readSwf(swfFile);
  const dollId = swf.classes.get('butlerDoll');
  const doll = swf.sprites.get(dollId);
  if (!doll) throw new Error('butlerDoll not exported');
  const nFrames = doll.frameCount;
  const labels = {};
  doll.labels.forEach((l, i) => {
    const end = i + 1 < doll.labels.length ? doll.labels[i + 1].frame : nFrames + 1;
    labels[l.name] = [l.frame, end - l.frame];
  });

  // Container matrices per frame, deduplicated into poses.
  const poses = [];
  const poseKeys = new Map();
  const frames = [];
  for (let n = 1; n <= nFrames; n++) {
    let lastDepth = -1;
    const pose = BUTLER_SLOTS.map(({ container }) => {
      const { m, depth } = placementAt(swf, dollId, container, n);
      if (depth < lastDepth) throw new Error(`${container}: paint order differs from the doll depths at frame ${n}`);
      lastDepth = depth;
      return m;
    });
    const key = JSON.stringify(pose);
    if (!poseKeys.has(key)) { poseKeys.set(key, poses.length); poses.push(pose); }
    frames.push(poseKeys.get(key));
  }

  // Parts: every class a config value attaches.
  const parts = {};
  const used = new Set();
  const allFrames = Array.from({ length: nFrames }, (_, i) => i + 1);
  const classesFor = new Map();
  for (const s of BUTLER_SLOTS) {
    const list = BUTLER_OPTIONS[s.option].map((v) => s.cls(v));
    classesFor.set(s.slot, list);
    for (const cls of list) {
      if (parts[cls]) continue;
      const id = swf.classes.get(cls);
      if (id === undefined) throw new Error(`${cls} not exported`);
      const t = swf.sprites.get(id);
      if (t.frameCount > 1) {
        if (t.frameCount !== nFrames) throw new Error(`${cls}: ${t.frameCount} frames, the doll has ${nFrames}`);
        const fp = flattenPart(swf, id, allFrames);
        parts[cls] = fp.frames === 0 ? fp.variants[0] : fp;
        for (const v of fp.variants) shapeIds(v, used);
      } else {
        parts[cls] = flattenSprite(swf, id, 1);
        shapeIds(parts[cls], used);
      }
      const check = (ops) => { for (const o of ops) if (o.clip || o.bm || o.cx || o.g) throw new Error(`${cls}: masks, blends and colour groups are not supported`); };
      if (Array.isArray(parts[cls])) check(parts[cls]); else parts[cls].variants.forEach(check);
    }
  }

  const { shapes } = exportShapes(swfFile, workDir, swf.shapeBounds);
  const outShapes = {};
  for (const id of [...used].sort((a, b) => a - b)) {
    const sh = shapes.get(id);
    if (!sh) throw new Error(`shape ${id} missing from the FFDec export`);
    outShapes[id] = { b: sh.b, p: sh.p };
  }

  // Conservative boxes per label: every choice of every slot.
  const box = {};
  const shapeMap = new Map(Object.entries(outShapes).map(([k, v]) => [Number(k), v]));
  for (const [name, [first, count]] of Object.entries(labels)) {
    const acc = [Infinity, Infinity, -Infinity, -Infinity];
    for (let n = first; n < first + count; n++) {
      const pose = poses[frames[n - 1]];
      BUTLER_SLOTS.forEach((s, i) => {
        for (const cls of classesFor.get(s.slot)) {
          const p = parts[cls];
          const ops = Array.isArray(p) ? p : p.variants[p.frames[n - 1]];
          boundsOf(ops, shapeMap, pose[i], acc);
        }
      });
    }
    box[name] = acc.map((v, i) => (i < 2 ? Math.floor(v) - 1 : Math.ceil(v) + 1));
  }

  return {
    v: 1,
    source: 'glitch-items/misc/npc_mailbox/bag_butler/bag_butler.swf',
    fps: swf.frameRate,
    labels,
    slots: BUTLER_SLOTS.map((s) => s.slot),
    options: BUTLER_OPTIONS,
    poses,
    frames,
    box,
    parts,
    shapes: outShapes,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (k, d) => (args.find((a) => a.startsWith(`--${k}=`)) || '').split('=').slice(1).join('=') || d;
  const out = resolve(opt('out', join(ROOT, 'public/assets/butler-rig')));
  const rig = buildButlerRig(opt('swf', BUTLER_SWF), resolve(opt('work', join(os.tmpdir(), 'butler-compositor'))));
  const text = `${JSON.stringify(rig)}\n`;
  const file = join(out, 'butler.json');
  if (args.includes('--check')) {
    const same = existsSync(file) && readFileSync(file, 'utf8') === text;
    console.log(same ? 'butler rig up to date' : 'butler rig is stale: rerun tools/avatar-compositor/butler.mjs');
    process.exit(same ? 0 : 1);
  }
  mkdirSync(out, { recursive: true });
  writeFileSync(file, text);
  console.log(`${file}: ${(text.length / 1024).toFixed(0)} KB, ${rig.poses.length} poses / ${rig.frames.length} frames, ${Object.keys(rig.parts).length} parts, ${Object.keys(rig.shapes).length} shapes`);
}
