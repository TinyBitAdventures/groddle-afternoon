#!/usr/bin/env node
/**
 * LEVEL BUILDER art pack: takes the pictures a person saved from an image model (art-bible.mjs's
 * pack, `drop/<piece>.png|webp|jpg`) and makes each one ready for the builder's asset intake
 * (spec 9.1), with its provenance:
 *
 *   1. the background: the picture's own alpha when it has one; else a flat magenta (#FF00FF, or
 *      whatever magenta the model painted) keyed out from the border in, the key unmixed from soft
 *      edges; a painted grey checkerboard (a fake transparency) is refused;
 *   2. trimmed to what shows;
 *   3. a seamless strip's ends checked and, when they do not meet, crossfaded;
 *   4. scaled to the piece's size (strips and ledges to its width, objects to fit its box; Lanczos 3,
 *      upscaling only when the model gave less, and said);
 *   5. its colours pulled lightly toward the bible's palette (--snap 0 turns it off);
 *   6. measured: sharpness, how far it was upscaled, a ledge's walkable surface, its top edge;
 *   7. written to ready/<gz_ai_<tag>_<piece>>.png with ready/intake.json: per piece the file, sha256,
 *      size, what was done, warnings, and provenance (licence ai-generated, CC0 1.0: author, the
 *      model named in drop/model.txt or --model, the prompt text, the date, and the inputs: the
 *      Tiny Speck CC0 reference decos the prompt attached, as deco:<name>). A picture
 *      art-generate.mjs made (its sha256 in drop/generated.json) keeps that run's record instead:
 *      the model, the prompt actually sent (with any corrective line), the date it was made, and
 *      "via the Gemini API" in place of T3 Chat.
 *
 *   node tools/builder/art-intake.mjs <pack dir> [--model "<name>"] [--tag t3] [--snap 0.12] [--only a,b]
 *
 * Pieces with no picture in drop/ are listed as waiting. Exit 1 when a picture was refused.
 * tools/builder/art-apply.mjs then puts ready/ into a copy of the draft.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readImage, writePng, alphaShare, estimateKey, keyOut, looksLikeCheckerboard, clearHidden, opaqueBox, crop,
  seamScore, fixSeam, resize, snapToPalette, sharpness, surfaceRow, topAt, isImageFile, rgbToHex,
} from './art-image.mjs';

export const AUTHOR = 'Austin Ginder (prompted in T3 Chat)';
export const AUTHOR_GENERATED = 'Austin Ginder (generated with tools/builder/art-generate.mjs)';
export const SEAM_BAD = 2.5;
export const TOOL_MAX = 120;
const r3 = (n) => Math.round(n * 1000) / 1000;

/** PURE: the gz_ name a generated piece is kept under (beside the code-drawn art, never over it). */
export function newName(piece, tag = 't3') {
  return `gz_ai_${tag}_${piece.short}`.toLowerCase().replace(/[^a-z0-9_]+/g, '_').slice(0, 96);
}

/** PURE: the tool line provenance keeps (the model as the person reported it; 120 characters at most). */
export function toolLine(model, via = 'T3 Chat') {
  const base = `${String(model).trim()} via ${via}; post-processed by tools/builder/art-intake.mjs`;
  return base.length <= TOOL_MAX ? base : `${String(model).trim().slice(0, TOOL_MAX - 6 - via.length)} via ${via}`;
}

/** art-generate.mjs's record of the pictures it made (drop/generated.json): short name -> entry. */
export function generatedRecord(dir) {
  const f = join(dir, 'drop/generated.json');
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')).pieces || {} : {};
}

/** PURE: the size a picture is scaled to: strips and ledges to the target width, the rest to fit the box. */
export function fitSize(piece, w, h) {
  const t = piece.target;
  const s = piece.kind === 'strip' || piece.kind === 'topper' ? t.w / w : Math.min(t.w / w, t.h / h);
  let W = Math.max(1, Math.round(w * s));
  let H = Math.max(1, Math.round(h * s));
  const over = Math.max(W, H) / 4096;
  if (over > 1) {
    W = Math.round(W / over);
    H = Math.round(H / over);
  }
  return { w: W, h: H, scale: r3(W / w) };
}

/**
 * PURE (on the picture): one piece's picture made ready. Answers { img, report } or
 * { refused, report } when the picture cannot be used.
 */
export function prepare(img, piece, { palette = [], snap = 0.12 } = {}) {
  const report = { source: { w: img.w, h: img.h }, steps: [], warnings: [] };
  const share = alphaShare(img);
  if (share.clear > 0.01) {
    report.background = 'alpha';
    report.steps.push(`used the picture's own transparency (${Math.round(share.clear * 100)}% clear)`);
  } else {
    const key = estimateKey(img);
    if (key) {
      const k = keyOut(img, key);
      report.background = 'magenta';
      report.key = rgbToHex(key);
      report.steps.push(`keyed out the ${rgbToHex(key)} background (${Math.round((k.cleared / (img.w * img.h)) * 100)}% cleared)`);
    } else if (looksLikeCheckerboard(img)) {
      report.background = 'checkerboard';
      report.refused = 'The background is a painted grey checkerboard, not transparency. Ask again: "on a flat #FF00FF background".';
      return { refused: true, report };
    } else {
      report.background = 'none';
      report.refused = 'The picture has neither a transparent nor a flat magenta background, so the piece cannot be cut out. Ask again with the background rule.';
      return { refused: true, report };
    }
  }
  clearHidden(img);
  if (report.background === 'magenta') {
    const pink = pinkShare(img);
    if (pink > 0.05) report.warnings.push(`${Math.round(pink * 100)}% of the art is still pink: a soft or see-through piece was painted into the magenta. Ask for a transparent background, or a solid piece.`);
  }
  const box = opaqueBox(img, 8);
  if (!box) {
    report.refused = 'Nothing is left once the background is gone.';
    return { refused: true, report };
  }
  let out = crop(img, box);
  report.trim = { x: box.x, y: box.y, w: box.w, h: box.h };
  if (box.x <= 1 || box.y <= 1 || box.x + box.w >= img.w - 1) {
    if (piece.kind !== 'strip') report.warnings.push('The art touches an edge of the picture: it may be cut off.');
  }
  if (piece.kind === 'strip') {
    const before = seamScore(out);
    report.seam = { before };
    if (before > SEAM_BAD) {
      out = fixSeam(out, 0.08);
      report.steps.push(`crossfaded the ends (seam ${before} before)`);
    }
  }
  const aspect = out.w / out.h;
  const want = piece.target.w / piece.target.h;
  if (Math.abs(Math.log(aspect / want)) > Math.log(1.25)) report.warnings.push(`Its shape is ${r3(aspect)}:1, asked for ${r3(want)}:1; the placements are resized to its shape.`);
  const size = fitSize(piece, out.w, out.h);
  report.scale = size.scale;
  if (size.w !== out.w || size.h !== out.h) {
    out = resize(out, size.w, size.h);
    report.steps.push(`${size.scale > 1 ? 'upscaled' : 'scaled'} ${report.trim.w} x ${report.trim.h} to ${size.w} x ${size.h} (x${size.scale}, Lanczos 3)`);
  }
  if (size.scale > 1.6) report.warnings.push(`Upscaled ${size.scale} times: it may look soft. A larger picture from the model would be sharper.`);
  if (piece.kind === 'strip') {
    report.seam.after = seamScore(out);
    if (report.seam.after > SEAM_BAD) report.warnings.push(`The ends still do not meet well (seam ${report.seam.after}).`);
  }
  if (snap > 0 && palette.length) {
    const m = snapToPalette(out, palette, { strength: snap });
    report.steps.push(`pulled colours toward the palette (strength ${snap}, ${Math.round((m.moved / (out.w * out.h)) * 100)}% of pixels moved)`);
  }
  clearHidden(out);
  report.size = { w: out.w, h: out.h };
  report.sharpness = sharpness(out);
  // The top edge across the width (21 columns), for placing effects at a vent's mouth.
  report.tops = Array.from({ length: 21 }, (_, i) => topAt(out, (i / 20) * (out.w - 1)));
  if (piece.kind === 'topper') {
    report.surface = surfaceRow(out);
    if (report.surface !== null && report.surface > out.h * 0.2) report.warnings.push(`Its walkable top is ${report.surface} px down (${Math.round((report.surface / out.h) * 100)}% of its height): check it reads as a ledge.`);
  }
  return { img: out, report };
}

/** PURE: the share of visible pixels that are magenta-pink (hue 285 to 335 degrees, saturated): key colour left in the art. */
export function pinkShare(img) {
  let vis = 0;
  let pink = 0;
  for (let i = 0; i < img.px.length; i += 4) {
    if (img.px[i + 3] < 128) continue;
    vis += 1;
    const r = img.px[i];
    const g = img.px[i + 1];
    const b = img.px[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max - min < 60 || g !== min) continue;
    const h = max === r ? 360 + (60 * (g - b)) / (max - min) : 240 + (60 * (r - g)) / (max - min);
    if (h >= 285 && h <= 335) pink += 1;
  }
  return vis ? pink / vis : 0;
}

const sha = (buf) => createHash('sha256').update(buf).digest('hex');

/** The drop file for a piece: drop/<short>.<png|webp|jpg|jpeg> (any case), or null. */
export function dropFile(dir, piece) {
  const drop = join(dir, 'drop');
  if (!existsSync(drop)) return null;
  const hit = readdirSync(drop).filter((f) => isImageFile(f) && basename(f, extname(f)).toLowerCase() === piece.short.toLowerCase()).sort();
  return hit.length ? join(drop, hit[0]) : null;
}

/** The model each piece was made with: --model, else drop/model.txt; drop/models.json overrides per piece. */
export function modelsFor(dir, fallback = '') {
  const one = fallback || (existsSync(join(dir, 'drop/model.txt')) ? readFileSync(join(dir, 'drop/model.txt'), 'utf8').trim().split('\n')[0].trim() : '');
  const per = existsSync(join(dir, 'drop/models.json')) ? JSON.parse(readFileSync(join(dir, 'drop/models.json'), 'utf8')) : {};
  return (short) => per[short] || per[`${short}.png`] || one;
}

export function runIntake(dir, { model = '', tag = 't3', snap = 0.12, only = null, today = new Date().toISOString().slice(0, 10) } = {}) {
  const pack = JSON.parse(readFileSync(join(dir, 'pieces.json'), 'utf8'));
  const modelOf = modelsFor(dir, model);
  const generated = generatedRecord(dir);
  const readyDir = join(dir, 'ready');
  mkdirSync(readyDir, { recursive: true });
  const done = [];
  const waiting = [];
  const refused = [];
  for (const piece of pack.pieces) {
    if (only && !only.has(piece.short)) continue;
    const file = dropFile(dir, piece);
    if (!file) {
      waiting.push(piece.short);
      continue;
    }
    const raw = readFileSync(file);
    // A picture art-generate.mjs made (the same bytes it recorded) keeps that run's provenance.
    const gen = generated[piece.short]?.sha256 === sha(raw) ? generated[piece.short] : null;
    const m = gen?.model || modelOf(piece.short);
    if (!m) throw new Error(`No model named for ${piece.short}: put it in drop/model.txt (or pass --model).`);
    const { img, report, refused: no } = prepare(readImage(file), piece, { palette: pack.palette, snap });
    const name = newName(piece, tag);
    const row = { name, replaces: piece.name, piece: piece.short, kind: piece.kind, role: piece.role, drop: basename(file), dropSha256: sha(raw), madeOn: gen?.date || statSync(file).mtime.toISOString().slice(0, 10), report };
    if (gen) row.generated = { model: gen.model, via: gen.via, attempt: gen.attempt, flags: gen.flags || [] };
    if (no) {
      refused.push(row);
      continue;
    }
    const buf = writePng(join(readyDir, `${name}.png`), img);
    row.file = `${name}.png`;
    row.sha256 = sha(buf);
    row.w = img.w;
    row.h = img.h;
    const prompt = gen?.prompt || readFileSync(join(dir, piece.promptFile), 'utf8');
    row.provenance = {
      licence: 'ai-generated',
      author: gen ? AUTHOR_GENERATED : AUTHOR,
      tool: gen ? toolLine(m, 'the Gemini API') : toolLine(m),
      model: m,
      prompt: prompt.slice(0, 4000),
      inputs: piece.attach.includes('ref-sheet.png') ? pack.inputs : pack.refs.filter((r) => piece.attach.includes(r.file)).map((r) => `deco:${r.name}`),
      date: gen?.date || today,
      role: piece.role === 'particle' ? 'middleground' : piece.role,
    };
    done.push(row);
  }
  const out = { format: 'groddle-art-intake/1', zone: pack.zone, tag, snap, pieces: done, refused, waiting };
  writeFileSync(join(readyDir, 'intake.json'), `${JSON.stringify(out, null, 1)}\n`);
  return out;
}

async function main(argv) {
  const opt = (k) => {
    const i = argv.indexOf(k);
    return i >= 0 ? argv[i + 1] : null;
  };
  const valued = new Set(['--model', '--tag', '--snap', '--only']);
  const dir = argv.find((a, i) => !a.startsWith('--') && !valued.has(argv[i - 1]));
  if (!dir || !existsSync(join(dir, 'pieces.json'))) {
    process.stderr.write('node tools/builder/art-intake.mjs <pack dir (with pieces.json)> [--model "<name>"] [--tag t3] [--snap 0.12] [--only a,b]\n');
    return 2;
  }
  const r = runIntake(resolve(dir), {
    model: opt('--model') || '',
    tag: opt('--tag') || 't3',
    snap: opt('--snap') !== null ? Number(opt('--snap')) : 0.12,
    only: opt('--only') ? new Set(opt('--only').split(',')) : null,
  });
  for (const p of r.pieces) process.stdout.write(`ready    ${p.file.padEnd(40)} ${p.w}x${p.h}  ${p.report.background}${p.report.seam ? `  seam ${p.report.seam.before} -> ${p.report.seam.after}` : ''}  sharp ${p.report.sharpness}${p.report.warnings.length ? `\n         warn: ${p.report.warnings.join(' | ')}` : ''}\n`);
  for (const p of r.refused) process.stdout.write(`REFUSED  ${p.drop}: ${p.report.refused}\n`);
  if (r.waiting.length) process.stdout.write(`waiting  ${r.waiting.join(', ')}\n`);
  process.stdout.write(`${r.pieces.length} ready, ${r.refused.length} refused, ${r.waiting.length} waiting -> ${join(resolve(dir), 'ready/intake.json')}\n`);
  return r.refused.length ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (e) => {
    process.stderr.write(`${e.message}\n`);
    process.exit(2);
  });
}
