#!/usr/bin/env node
/**
 * The Classic interface's chrome art (classic-spec assets.md): Tiny Speck's CC0
 * glitch-client, TSEngineAssets/src/assets, into public/assets/classic/ and the
 * generated module public/js/classic/classic-art.js (name -> url, w, h, sha1).
 *
 * tools/classic-art/manifest.json lists every piece:
 *   copy    PNGs shipped byte for byte. They are 1x: no vector source exists, and
 *           the browser scales them with the chrome (open question 12: accept the
 *           softness for v1).
 *   reuse   art the remake already ships elsewhere: checked against the same
 *           source, never copied twice.
 *   svg     vector symbols exported with FFDec, offline (no browser): `sprite`
 *           one DefineSprite by id, `frame` one stage frame, `strip` every stage
 *           frame side by side. None of them uses blend modes, filters or embedded
 *           images (classic-spec render-test, 2026-10-30), so they ship as plain
 *           SVG. The export is cleaned: FFDec's own namespace and attributes go,
 *           a stage export loses the stage's background rect, and a viewBox is
 *           added so CSS can scale it. Never rasterise these with ImageMagick: its
 *           SVG renderer drops their colour.
 *
 * The trademark never ships: a name, source path or file whose name or content
 * says "glitch" is refused, and so are the logo's bytes (logo_glitch.png,
 * glitch_logo.swf) whatever they are called. (The source folder's own name is
 * the one exception: only the part under TSEngineAssets/src/assets is checked.)
 *
 * Usage: node tools/classic-art/build.mjs           render (needs Java 21 + FFDec for the SVGs)
 *        node tools/classic-art/build.mjs --check   no Java: the files, the module and the
 *                                                   sources (when glitch-client is beside the game)
 * The SWFs are data: FFDec reads them, nothing runs them.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const SPIKE = join(here, '../..');
export const CLIENT = join(SPIKE, '..', 'glitch-client');
export const ASSETS = join(CLIENT, 'TSEngineAssets/src/assets');
export const OUT_DIR = join(SPIKE, 'public/assets/classic');
export const OUT_JS = join(SPIKE, 'public/js/classic/classic-art.js');
export const URL_DIR = 'assets/classic';
export const MANIFEST = join(here, 'manifest.json');
const JAVA = '/opt/homebrew/opt/openjdk@21/bin/java';
const FFDEC = join(SPIKE, '..', 'tools/ffdec/ffdec.jar');
const FFDEC_FALLBACK = join(process.env.HOME || '', 'Documents/glitch-audit/tools/ffdec/ffdec.jar');

/** The logo's bytes, refused under any name (sha1 of logo_glitch.png and glitch_logo.swf). */
export const LOGO_SHA1 = Object.freeze(['7cc11706eb69383565c61c95d4787937cc7bfe86', '72ba15a4dfabcc0ba7208d3d84e8d1b90a721572']);
export const TRADEMARK = /glitch/i;

export const sha1 = (buf) => createHash('sha1').update(buf).digest('hex');

/** Width and height of a PNG (IHDR) or an SVG (its width/height attributes). */
export function artSize(buf, name = '') {
  if (buf.subarray(1, 4).toString('latin1') === 'PNG') return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
  const head = buf.subarray(0, 2048).toString('utf8');
  const svg = /<svg\b[^>]*>/.exec(head);
  if (svg) {
    const w = /\swidth="([\d.]+)(?:px)?"/.exec(svg[0]);
    const h = /\sheight="([\d.]+)(?:px)?"/.exec(svg[0]);
    if (w && h) return [Number(w[1]), Number(h[1])];
  }
  throw new Error(`${name}: not a PNG or a sized SVG`);
}

/** Problems with one piece of art about to ship (empty when it may). */
export function trademarkProblems(name, buf) {
  const out = [];
  if (TRADEMARK.test(name)) out.push(`${name}: the name carries the trademark`);
  if (LOGO_SHA1.includes(sha1(buf))) out.push(`${name}: these are the logo's bytes`);
  if (TRADEMARK.test(buf.toString('latin1'))) out.push(`${name}: the content carries the trademark`);
  return out;
}

export function readManifest() {
  const m = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const names = new Set();
  const problems = [];
  for (const e of [...m.copy, ...m.reuse, ...m.svg]) {
    if (!/^[a-z0-9_]+$/.test(e.name)) problems.push(`${e.name}: names are lower case, digits and _`);
    if (names.has(e.name)) problems.push(`${e.name}: listed twice`);
    names.add(e.name);
    for (const s of [e.name, e.src || '', e.swf || '', e.path || '']) if (TRADEMARK.test(s)) problems.push(`${e.name}: "${s}" carries the trademark`);
  }
  if (problems.length) throw new Error(`manifest:\n  ${problems.join('\n  ')}`);
  return m;
}

// ------------------------------------------------------------------ SVG cleaning

/** FFDec's SVG made plain: no ffdec namespace, no stage background, a viewBox, ids prefixed. */
export function cleanSvg(text, { stage = false, prefix = '' } = {}) {
  let s = text.replace(/^<\?xml[^>]*\?>\s*/, '');
  s = s.replace(/\s+xmlns:ffdec="[^"]*"/g, '').replace(/\s+ffdec:[\w-]+="[^"]*"/g, '');
  const root = /<svg\b[^>]*>/.exec(s)[0];
  const rawW = /\swidth="([\d.]+)/.exec(root)[1];
  const rawH = /\sheight="([\d.]+)/.exec(root)[1];
  const w = Number(rawW);
  const h = Number(rawH);
  if (stage) {
    // The stage's background colour: a rect the stage's size, first in the stage's own group.
    const esc = (v) => v.replace(/\./g, '\\.');
    const bg = new RegExp(`<rect fill="#[0-9a-fA-F]{6}" height="${esc(rawH)}px" width="${esc(rawW)}px"\\/>\\s*`);
    if (!bg.test(s)) throw new Error('a stage export without its background rect: FFDec changed?');
    s = s.replace(bg, '');
  }
  if (prefix) s = s.replace(/\sid="([^"]+)"/g, ` id="${prefix}$1"`).replace(/(xlink:href|href)="#([^"]+)"/g, `$1="#${prefix}$2"`);
  const fresh = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`;
  s = s.replace(root, fresh);
  return { svg: `${s.trim()}\n`, w, h };
}

/** Frames side by side in one SVG (each frame's ids prefixed so they cannot collide). */
export function stripSvg(frames) {
  const cleaned = frames.map((f, i) => cleanSvg(f, { stage: true, prefix: `f${i + 1}-` }));
  const w = cleaned[0].w;
  const h = cleaned[0].h;
  const body = cleaned.map((c, i) => {
    const inner = c.svg.replace(/^<svg\b[^>]*>/, '').replace(/<\/svg>\s*$/, '').trim();
    return `<g transform="translate(${Math.round(i * w * 1000) / 1000} 0)">\n${inner}\n</g>`;
  }).join('\n');
  const W = Math.round(w * frames.length * 1000) / 1000;
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${h}" viewBox="0 0 ${W} ${h}">\n${body}\n</svg>\n`, w: W, h, frame: [w, h] };
}

function ffdec(args) {
  const jar = existsSync(FFDEC) ? FFDEC : FFDEC_FALLBACK;
  if (!existsSync(JAVA) || !existsSync(jar)) throw new Error(`rendering the SVGs needs Java 21 (${JAVA}) and FFDec (${jar})`);
  execFileSync(JAVA, ['-jar', jar, ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
}

const numeric = (a, b) => Number(a.replace(/\D/g, '')) - Number(b.replace(/\D/g, ''));

function renderSvg(e, work) {
  const swf = join(ASSETS, e.swf);
  const dir = join(work, e.name);
  if (e.sprite != null) {
    ffdec(['-selectid', String(e.sprite), '-format', 'sprite:svg', '-export', 'sprite', dir, swf]);
    const sub = readdirSync(dir).find((d) => d.startsWith(`DefineSprite_${e.sprite}_`) || d === `DefineSprite_${e.sprite}`);
    if (!sub) throw new Error(`${e.name}: FFDec wrote no sprite ${e.sprite}`);
    return cleanSvg(readFileSync(join(dir, sub, '1.svg'), 'utf8'));
  }
  ffdec(['-format', 'frame:svg', '-export', 'frame', dir, swf]);
  const files = readdirSync(dir).filter((f) => f.endsWith('.svg')).sort(numeric);
  if (e.strip) {
    if (files.length !== e.frames) throw new Error(`${e.name}: the SWF has ${files.length} frames, the manifest says ${e.frames}`);
    return stripSvg(files.map((f) => readFileSync(join(dir, f), 'utf8')));
  }
  return cleanSvg(readFileSync(join(dir, `${e.frame}.svg`), 'utf8'), { stage: true });
}

// ------------------------------------------------------------------ the module

/** The generated module's text for the art as it is on disk. */
export function moduleText(m) {
  const rows = [];
  const meta = (e) => {
    const x = {};
    for (const k of ['frames', 'cell', 'perRow', 'loop', 'sprite', 'frame']) if (e[k] != null) x[k] = e[k];
    if (e.strip) x.strip = true;
    return x;
  };
  for (const e of m.copy) rows.push({ name: e.name, file: `${URL_DIR}/${e.name}.png`, kind: 'copy', src: e.src, ...meta(e) });
  for (const e of m.reuse) rows.push({ name: e.name, file: e.path, kind: 'reuse', src: e.src });
  for (const e of m.svg) rows.push({ name: e.name, file: `${URL_DIR}/${e.name}.svg`, kind: 'svg', src: e.swf, ...meta(e) });
  rows.sort((a, b) => a.name.localeCompare(b.name));
  const lines = rows.map((r) => {
    const buf = readFileSync(join(SPIKE, 'public', r.file));
    const [w, h] = artSize(buf, r.name);
    const { name, file, ...rest } = r;
    return `  ${name}: ${JSON.stringify({ url: file, w, h, bytes: buf.length, sha1: sha1(buf), ...rest })},`;
  });
  return `// GENERATED by tools/classic-art/build.mjs from tools/classic-art/manifest.json. Do not edit by hand.
// The Classic interface's chrome art: Tiny Speck's CC0 client art (TSEngineAssets/src/assets).
// url is relative to the site root; w and h are 1x px (SVGs in their own units, scaled by CSS).
export const CLASSIC_ART = Object.freeze({
${lines.join('\n')}
});

/** The url of one piece, or throws on a name the manifest does not list. */
export function classicArtUrl(name) {
  const a = CLASSIC_ART[name];
  if (!a) throw new Error(\`no Classic art named \${name}\`);
  return a.url;
}
`;
}

// ------------------------------------------------------------------ build and check

export function check() {
  const problems = [];
  let m;
  try { m = readManifest(); } catch (err) { return [err.message]; }
  const shipped = new Map();
  for (const e of m.copy) shipped.set(`${e.name}.png`, e);
  for (const e of m.svg) shipped.set(`${e.name}.svg`, e);
  const onDisk = existsSync(OUT_DIR) ? readdirSync(OUT_DIR) : [];
  for (const f of onDisk) {
    if (!shipped.has(f)) problems.push(`${URL_DIR}/${f}: not in the manifest`);
    const buf = readFileSync(join(OUT_DIR, f));
    problems.push(...trademarkProblems(`${URL_DIR}/${f}`, buf));
  }
  for (const f of shipped.keys()) if (!onDisk.includes(f)) problems.push(`${URL_DIR}/${f}: missing (run node tools/classic-art/build.mjs)`);
  for (const e of m.reuse) {
    const p = join(SPIKE, 'public', e.path);
    if (!existsSync(p)) problems.push(`${e.path}: the remake no longer ships it`);
  }
  if (problems.length) return problems;
  // Sources, when glitch-client is beside the game: copies and reuses are its bytes.
  if (existsSync(ASSETS)) {
    for (const e of m.copy) {
      const src = join(ASSETS, e.src);
      if (!existsSync(src)) problems.push(`${e.src}: no such source`);
      else if (sha1(readFileSync(src)) !== sha1(readFileSync(join(OUT_DIR, `${e.name}.png`)))) problems.push(`${e.name}.png differs from ${e.src}`);
    }
    for (const e of m.reuse) {
      const src = join(ASSETS, e.src);
      if (existsSync(src) && sha1(readFileSync(src)) !== sha1(readFileSync(join(SPIKE, 'public', e.path)))) problems.push(`${e.path} differs from ${e.src}`);
    }
    for (const e of m.svg) if (!existsSync(join(ASSETS, e.swf))) problems.push(`${e.swf}: no such source`);
  }
  const want = moduleText(m);
  const have = existsSync(OUT_JS) ? readFileSync(OUT_JS, 'utf8') : '';
  if (want !== have) problems.push(`${relative(SPIKE, OUT_JS)} is stale (run node tools/classic-art/build.mjs)`);
  return problems;
}

export function build({ keep = false } = {}) {
  const m = readManifest();
  if (!existsSync(ASSETS)) throw new Error(`no glitch-client beside the game (${ASSETS})`);
  mkdirSync(OUT_DIR, { recursive: true });
  for (const f of readdirSync(OUT_DIR)) rmSync(join(OUT_DIR, f));
  for (const e of m.copy) {
    const src = join(ASSETS, e.src);
    const bad = trademarkProblems(e.name, readFileSync(src));
    if (bad.length) throw new Error(bad.join('\n'));
    copyFileSync(src, join(OUT_DIR, `${e.name}.png`));
  }
  const work = mkdtempSync(join(tmpdir(), 'classic-art-'));
  try {
    for (const e of m.svg) {
      const out = renderSvg(e, work);
      const buf = Buffer.from(out.svg, 'utf8');
      const bad = trademarkProblems(e.name, buf);
      if (bad.length) throw new Error(bad.join('\n'));
      if (/<image\b|mix-blend-mode|<filter\b/.test(out.svg)) throw new Error(`${e.name}: uses images, blends or filters; ship a PNG instead`);
      writeFileSync(join(OUT_DIR, `${e.name}.svg`), buf);
    }
  } finally {
    if (!keep) rmSync(work, { recursive: true, force: true });
    else console.log(`work kept in ${work}`);
  }
  mkdirSync(dirname(OUT_JS), { recursive: true });
  writeFileSync(OUT_JS, moduleText(m));
  const files = readdirSync(OUT_DIR);
  const bytes = files.reduce((n, f) => n + readFileSync(join(OUT_DIR, f)).length, 0);
  return { files: files.length, bytes, reuse: m.reuse.length };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  if (process.argv.includes('--check')) {
    const problems = check();
    if (problems.length) {
      console.error(problems.join('\n'));
      process.exit(1);
    }
    console.log(`${relative(SPIKE, OUT_JS)} and ${URL_DIR}/ are current`);
  } else {
    const r = build({ keep: process.argv.includes('--keep') });
    console.log(`${r.files} files, ${r.bytes} bytes in ${URL_DIR}/ (+ ${r.reuse} reused), ${relative(SPIKE, OUT_JS)} written`);
  }
}
