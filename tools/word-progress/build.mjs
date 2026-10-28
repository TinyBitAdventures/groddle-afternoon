#!/usr/bin/env node
/**
 * The original's word progress bar art (tinyspeck/glitch-client, CC0), for the
 * word that fills while a verb runs (public/js/word-progress.js).
 *
 * Source: TSEngineAssets/src/assets/swfs/word_progress_bar.swf exports 26
 * words, progress_<word>. Every word sprite has the same four layers:
 *   depth 1     the white bubble letters with their shadow (the empty word)
 *   depth 2     a mask (clipDepth 6) of the letter shapes
 *   depth 4     fill_mc, a rectangle with a vertical gradient under that mask
 *   depth 8/9   a highlight over the letters (progress_milk has none)
 * WordProgressBar.as animateNextRound sets fill_mc.width = 0 and tweens it to
 * current_word.width (linear), so the coloured fill grows from the word's left
 * edge to its right. The fill is flat across, so its stretch is a reveal.
 *
 * This tool draws each word three times with FFDec, as three layers of the same
 * size (base, fill, top): every layer stays placed in every render and the
 * hidden ones get a colour transform of alpha 0, so the bounds never change.
 * fill_mc is drawn at its full in-game width (the word's width). The game stacks
 * base, fill (clipped on the right by the progress) and top.
 *
 * Writes public/assets/sprites/word-progress/:
 *   words.png        1x atlas (zoom 1: 1 SWF px = 1 world px, WordProgressBar SCALE 1)
 *   words@3x.webp    the same atlas drawn at zoom 3
 *   cancel.png, cancel_hover.png   word_dismisser_cancel(_hover).png, copied as-is
 * and public/js/word-progress-art.js (atlas cells, the fill box, file sizes and
 * hashes, the SWF's sha1).
 *
 * Usage: node tools/word-progress/build.mjs [--work <dir>] [--keep]
 *        node tools/word-progress/build.mjs --check
 * Rendering needs Java 21 + FFDec (glitch-audit/tools/ffdec) and ImageMagick
 * (magick). --check needs neither: it checks the module against the files (and
 * against the SWF when glitch-client is beside the game). The SWF is data:
 * FFDec reads it, nothing runs it.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const spike = join(here, '../..');
const audit = join(spike, '..');
const CLIENT = join(audit, 'glitch-client');
const SWF = join(CLIENT, 'TSEngineAssets/src/assets/swfs/word_progress_bar.swf');
const CANCEL = {
  cancel: join(CLIENT, 'TSEngineAssets/src/assets/graphics/word_dismisser_cancel.png'),
  cancel_hover: join(CLIENT, 'TSEngineAssets/src/assets/graphics/word_dismisser_cancel_hover.png'),
};
const OUT = join(spike, 'public/assets/sprites/word-progress');
const OUT_JS = join(spike, 'public/js/word-progress-art.js');
const URL_DIR = 'assets/sprites/word-progress';
const JAVA = '/opt/homebrew/opt/openjdk@21/bin/java';
const FFDEC = join(audit, 'tools/ffdec/ffdec.jar');
const LAYERS = ['base', 'fill', 'top'];
const PAD = 2; // 1x px between cells (6 at 3x), so a cell never samples its neighbour
const WEBP_QUALITY = 92;

const sha = (buf, alg = 'sha256') => createHash(alg).update(buf).digest('hex');

/** Width and height from a PNG's IHDR or a WebP's VP8X / VP8L / VP8 header. */
export function imageSize(buf) {
  if (buf.subarray(1, 4).toString('latin1') === 'PNG') return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') {
    const kind = buf.subarray(12, 16).toString('latin1');
    if (kind === 'VP8X') return [1 + buf.readUIntLE(24, 3), 1 + buf.readUIntLE(27, 3)];
    if (kind === 'VP8L') {
      const b = buf.readUInt32LE(21);
      return [1 + (b & 0x3fff), 1 + ((b >> 14) & 0x3fff)];
    }
    if (kind === 'VP8 ') return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
  }
  throw new Error('not a PNG or WebP');
}

// ---------------------------------------------------------------- SWF XML

const attrs = (s) => Object.fromEntries([...s.matchAll(/(\w+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));

function parseSwfXml(xml) {
  const shapes = new Map();
  for (const m of xml.matchAll(/<item type="DefineShape\d?Tag"[^>]*shapeId="(\d+)"[^>]*>\s*<shapeBounds ([^>]*)\/>/g)) {
    const b = attrs(m[2]);
    shapes.set(Number(m[1]), [Number(b.Xmin), Number(b.Ymin), Number(b.Xmax), Number(b.Ymax)]);
  }
  const sprites = new Map();
  for (const m of xml.matchAll(/<item type="DefineSpriteTag"[^>]*spriteId="(\d+)">\s*<subTags>([\s\S]*?)<\/subTags>/g)) {
    const places = [];
    for (const p of m[2].matchAll(/<item type="PlaceObject2Tag" ([^>]*)>\s*<matrix ([^>]*)\/>/g)) {
      const a = attrs(p[1]);
      const mx = attrs(p[2]);
      if (mx.hasRotate === 'true') throw new Error(`sprite ${m[1]}: a rotated placement`);
      places.push({
        depth: Number(a.depth),
        id: Number(a.characterId),
        name: a.name || '',
        clip: a.placeFlagHasClipDepth === 'true',
        sx: mx.hasScale === 'true' ? Number(mx.scaleX) : 1,
        sy: mx.hasScale === 'true' ? Number(mx.scaleY) : 1,
        tx: Number(mx.translateX),
        ty: Number(mx.translateY),
      });
    }
    sprites.set(Number(m[1]), places);
  }
  const symbols = xml.match(/<item type="SymbolClassTag"[\s\S]*?<tags>([\s\S]*?)<\/tags>\s*<names>([\s\S]*?)<\/names>/);
  const ids = [...symbols[1].matchAll(/<item>(\d+)<\/item>/g)].map((m) => Number(m[1]));
  const names = [...symbols[2].matchAll(/<item>([^<]+)<\/item>/g)].map((m) => m[1]);
  const words = {};
  ids.forEach((id, i) => {
    if (names[i].startsWith('progress_')) words[names[i].slice('progress_'.length)] = id;
  });
  return { shapes, sprites, words };
}

function boundsOf(swf, id) {
  if (swf.shapes.has(id)) return swf.shapes.get(id);
  const places = swf.sprites.get(id);
  if (!places) throw new Error(`no character ${id}`);
  let box = null;
  for (const p of places) {
    const [x0, y0, x1, y1] = boundsOf(swf, p.id);
    const b = [p.tx + x0 * p.sx, p.ty + y0 * p.sy, p.tx + x1 * p.sx, p.ty + y1 * p.sy];
    box = box ? [Math.min(box[0], b[0]), Math.min(box[1], b[1]), Math.max(box[2], b[2]), Math.max(box[3], b[3])] : b;
  }
  return box;
}

/** A word's layers, its bounds without fill_mc, and fill_mc's scale for the full width (twips). */
function wordPlan(swf, word, id) {
  const places = swf.sprites.get(id);
  const role = (p) => (p.name === 'fill_mc' ? 'fill' : p.clip ? 'mask' : p.depth === 1 ? 'base' : 'top');
  const roles = places.map(role);
  if (roles.filter((r) => r === 'fill').length !== 1 || roles[0] !== 'base' || !roles.includes('mask')) {
    throw new Error(`${word}: unexpected layers ${roles.join(',')}`);
  }
  let box = null;
  for (const p of places) {
    if (role(p) === 'fill') continue;
    const [x0, y0, x1, y1] = boundsOf(swf, p.id);
    const b = [p.tx + x0 * p.sx, p.ty + y0 * p.sy, p.tx + x1 * p.sx, p.ty + y1 * p.sy];
    box = box ? [Math.min(box[0], b[0]), Math.min(box[1], b[1]), Math.max(box[2], b[2]), Math.max(box[3], b[3])] : b;
  }
  const fill = places.find((p) => role(p) === 'fill');
  const [fx0, , fx1] = boundsOf(swf, fill.id);
  const [, fy0, , fy1] = boundsOf(swf, fill.id);
  const width = box[2] - box[0];
  const fillScaleX = width / (fx1 - fx0);
  const fillBox = [fill.tx + fx0 * fillScaleX, fill.ty + fy0 * fill.sy, fill.tx + fx1 * fillScaleX, fill.ty + fy1 * fill.sy];
  // What FFDec draws: every layer's bounds, fill_mc at its full width included.
  const render = [Math.min(box[0], fillBox[0]), Math.min(box[1], fillBox[1]), Math.max(box[2], fillBox[2]), Math.max(box[3], fillBox[3])];
  return { word, id, roles, box, render, fill, fillScaleX, fillLeft: fillBox[0], width };
}

/** The SWF XML with every word drawing only `keep` (others at alpha 0) and fill_mc at full width. */
function variantXml(xml, plans, keep) {
  const byId = new Map(plans.map((p) => [p.id, p]));
  return xml.replace(/(<item type="DefineSpriteTag"[^>]*spriteId="(\d+)">\s*<subTags>)([\s\S]*?)(<\/subTags>)/g, (all, head, sid, body, tail) => {
    const plan = byId.get(Number(sid));
    if (!plan) return all;
    let i = 0;
    const next = body.replace(/<item type="PlaceObject2Tag" ([^>]*)>\s*(<matrix [^>]*\/>)\s*(<colorTransform [^>]*\/>)?\s*<\/item>/g, (m, a, matrix, ct) => {
      const r = plan.roles[i++];
      if (r === 'fill') {
        matrix = matrix.replace(/scaleX="[^"]*"/, `scaleX="${plan.fillScaleX.toFixed(7)}"`);
        if (!/hasScale="true"/.test(matrix)) throw new Error(`${plan.word}: fill_mc has no scale`);
      }
      const visible = keep === '*' || r === 'mask' || r === keep;
      if (!visible) {
        a = a.replace('placeFlagHasColorTransform="false"', 'placeFlagHasColorTransform="true"');
        ct = '<colorTransform type="CXFORMWITHALPHA" alphaAddTerm="0" alphaMultTerm="0" blueAddTerm="0" blueMultTerm="256" greenAddTerm="0" greenMultTerm="256" hasAddTerms="false" hasMultTerms="true" nbits="10" redAddTerm="0" redMultTerm="256"/>';
      }
      return `<item type="PlaceObject2Tag" ${a}>\n          ${matrix}${ct ? `\n          ${ct}` : ''}\n        </item>`;
    });
    if (i !== plan.roles.length) throw new Error(`${plan.word}: ${i} placements rewritten of ${plan.roles.length}`);
    return head + next + tail;
  });
}

// ---------------------------------------------------------------- build

function ffdec(args) {
  execFileSync(JAVA, ['-jar', FFDEC, ...args], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 300000 });
}

function build(work) {
  const xmlPath = join(work, 'word_progress_bar.xml');
  ffdec(['-swf2xml', SWF, xmlPath]);
  const xml = readFileSync(xmlPath, 'utf8');
  const swf = parseSwfXml(xml);
  const plans = Object.entries(swf.words).sort(([a], [b]) => a.localeCompare(b)).map(([w, id]) => wordPlan(swf, w, id));
  if (plans.length !== 26) throw new Error(`${plans.length} words`);
  const select = plans.map((p) => p.id).join(',');
  const renders = {};
  for (const layer of [...LAYERS, 'full']) {
    const vx = join(work, `${layer}.xml`);
    const vs = join(work, `${layer}.swf`);
    writeFileSync(vx, layer === 'full' ? variantXml(xml, plans, '*') : variantXml(xml, plans, layer));
    ffdec(['-xml2swf', vx, vs]);
    for (const zoom of [1, 3]) {
      const out = join(work, `${layer}@${zoom}`);
      mkdirSync(out, { recursive: true });
      ffdec(['-format', 'sprite:png', '-zoom', String(zoom), '-selectid', select, '-export', 'sprite', out, vs]);
      for (const p of plans) {
        const dir = readdirSync(out).find((d) => d === `DefineSprite_${p.id}_progress_${p.word}`);
        if (!dir) throw new Error(`${layer}@${zoom}: no render of ${p.word}`);
        renders[`${layer}@${zoom}:${p.word}`] = join(out, dir, '1.png');
      }
    }
  }
  // 'full' keeps every layer visible (keep '*' hides none but the mask rule keeps the mask): a check that
  // base + fill + top drawn over each other is the word as FFDec draws it.
  for (const p of plans) {
    const size = (k) => imageSize(readFileSync(renders[k]));
    for (const zoom of [1, 3]) {
      const ref = size(`base@${zoom}:${p.word}`).join('x');
      for (const layer of [...LAYERS, 'full']) {
        const got = size(`${layer}@${zoom}:${p.word}`).join('x');
        if (got !== ref) throw new Error(`${p.word}@${zoom}: ${layer} is ${got}, base ${ref}`);
      }
    }
    const stack = join(work, `stack-${p.word}.png`);
    execFileSync('magick', [renders[`base@3:${p.word}`], renders[`fill@3:${p.word}`], '-composite', renders[`top@3:${p.word}`], '-composite', stack]);
    let diff = '0';
    try {
      diff = execFileSync('magick', ['compare', '-metric', 'AE', '-fuzz', '6%', stack, renders[`full@3:${p.word}`], 'null:'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      diff = String(err.stderr || err.stdout || '').trim();
    }
    const px = Number.parseFloat(diff) || 0;
    if (px > 40) throw new Error(`${p.word}: the three layers differ from the whole word in ${px} px`);
  }

  // Atlas: one row per word, cells base | fill | top.
  const cells = {};
  let y = PAD;
  let atlasW = 0;
  for (const p of plans) {
    const [w1, h1] = imageSize(readFileSync(renders[`base@1:${p.word}`]));
    const [w3, h3] = imageSize(readFileSync(renders[`base@3:${p.word}`]));
    const w = Math.max(w1, Math.ceil(w3 / 3));
    const h = Math.max(h1, Math.ceil(h3 / 3));
    const row = {};
    LAYERS.forEach((layer, i) => {
      row[layer] = [PAD + i * (w + PAD), y];
    });
    // Where the fill starts and how far it grows, in cell px (1x). FFDec crops the render to the
    // word's bounds; the fill's left edge is fill_mc's own x (0 in every word).
    const scaleX = w1 / ((p.render[2] - p.render[0]) / 20);
    cells[p.word] = {
      id: p.id,
      w,
      h,
      ...row,
      fill: row.fill,
      fillBox: [
        Math.round(((p.fillLeft - p.render[0]) / 20) * scaleX * 100) / 100,
        Math.round((p.width / 20) * scaleX * 100) / 100,
      ],
      top: p.roles.includes('top') ? row.top : null,
      bounds: p.render.map((v) => Math.round(v * 5) / 100),
    };
    atlasW = Math.max(atlasW, PAD + 3 * (w + PAD));
    y += h + PAD;
  }
  const atlasH = y;
  mkdirSync(OUT, { recursive: true });
  for (const zoom of [1, 3]) {
    const args = ['-size', `${atlasW * zoom}x${atlasH * zoom}`, 'xc:none'];
    for (const p of plans) {
      for (const layer of LAYERS) {
        if (layer === 'top' && !cells[p.word].top) continue;
        const [cx, cy] = cells[p.word][layer];
        args.push(renders[`${layer}@${zoom}:${p.word}`], '-geometry', `+${cx * zoom}+${cy * zoom}`, '-composite');
      }
    }
    if (zoom === 1) execFileSync('magick', [...args, '-strip', `PNG32:${join(OUT, 'words.png')}`]);
    else execFileSync('magick', [...args, '-strip', '-quality', String(WEBP_QUALITY), '-define', 'webp:alpha-quality=100', '-define', 'webp:method=6', join(OUT, 'words@3x.webp')]);
  }
  for (const [key, src] of Object.entries(CANCEL)) copyFileSync(src, join(OUT, `${key}.png`));
  writeModule({ cells, atlasW, atlasH });
  return plans.length;
}

function fileRow(name) {
  const buf = readFileSync(join(OUT, name));
  const [w, h] = imageSize(buf);
  return { url: `${URL_DIR}/${name}`, w, h, bytes: buf.length, sha256: sha(buf) };
}

function writeModule({ cells, atlasW, atlasH }) {
  const art = {
    source: 'tinyspeck/glitch-client TSEngineAssets/src/assets/swfs/word_progress_bar.swf (CC0)',
    swfSha1: sha(readFileSync(SWF), 'sha1'),
    atlas: { w: atlasW, h: atlasH, x1: fileRow('words.png'), x3: fileRow('words@3x.webp') },
    cancel: {
      source: 'tinyspeck/glitch-client TSEngineAssets/src/assets/graphics/word_dismisser_cancel(_hover).png (CC0)',
      normal: fileRow('cancel.png'),
      hover: fileRow('cancel_hover.png'),
    },
    words: cells,
  };
  writeFileSync(OUT_JS, `/**
 * The word progress bar's art (generated by tools/word-progress/build.mjs from the
 * CC0 tinyspeck/glitch-client word_progress_bar.swf). Do not edit by hand.
 * words.<word>: the cell size (1x px), each layer's cell in the atlas (base, fill, top;
 * top is null when the word has no highlight), fillBox [x, w] where the fill starts and
 * how wide it grows, and the SWF bounds (px) the render covers.
 */
export const WORD_PROGRESS_ART = Object.freeze(${JSON.stringify(art, null, 1)});
`);
}

async function check() {
  const problems = [];
  if (!existsSync(OUT_JS)) {
    console.error('word-progress-art.js is missing: run node tools/word-progress/build.mjs');
    process.exit(1);
  }
  const { WORD_PROGRESS_ART: art } = await import(`${pathToFileURL(OUT_JS).href}?t=${Date.now()}`);
  if (existsSync(SWF) && sha(readFileSync(SWF), 'sha1') !== art.swfSha1) problems.push('word_progress_bar.swf changed');
  const rows = [art.atlas.x1, art.atlas.x3, art.cancel.normal, art.cancel.hover];
  for (const row of rows) {
    const file = join(spike, 'public', row.url);
    if (!existsSync(file)) {
      problems.push(`${row.url} is missing`);
      continue;
    }
    const buf = readFileSync(file);
    const [w, h] = imageSize(buf);
    if (buf.length !== row.bytes || sha(buf) !== row.sha256 || w !== row.w || h !== row.h) problems.push(`${row.url} differs`);
  }
  if (art.atlas.x1.w !== art.atlas.w || art.atlas.x3.w !== art.atlas.w * 3) problems.push('atlas sizes');
  for (const [key, src] of Object.entries(CANCEL)) {
    if (existsSync(src) && sha(readFileSync(src)) !== art.cancel[key === 'cancel' ? 'normal' : 'hover'].sha256) problems.push(`${key}.png is not the client's`);
  }
  if (Object.keys(art.words).length !== 26) problems.push('26 words');
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  console.log(`word progress art is current (${Object.keys(art.words).length} words)`);
}

const argv = process.argv.slice(2);
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (argv.includes('--check')) {
    await check();
  } else {
    const i = argv.indexOf('--work');
    const work = i >= 0 ? argv[i + 1] : mkdtempSync(join(tmpdir(), 'word-progress-'));
    mkdirSync(work, { recursive: true });
    try {
      const n = build(work);
      console.log(`${n} words -> ${OUT}`);
    } finally {
      if (!argv.includes('--keep')) rmSync(work, { recursive: true, force: true });
    }
  }
}
