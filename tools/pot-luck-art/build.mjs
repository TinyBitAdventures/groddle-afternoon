#!/usr/bin/env node
/**
 * Pot Luck Day's chicken costumes (G982): every sheet the game's Chicken plays, drawn again in the
 * Turkey Tailfan and the Rooster Plume, and the pack icons of the two costumes and the Fancy
 * Feather. Made for Groddle, not Tiny Speck's: a parts edit of Tiny Speck's chicken FLA (CC0,
 * glitch-items inhabitants/chicken/npc_chicken.fla; tools/pot-luck-art/variants.mjs), rendered by
 * the same XFL renderer as the overlays (tools/overlay-art/xfl-svg.mjs) and Chromium.
 *
 * Each costume sheet keeps its chicken sheet's frames, one full 148 x 110 OGA cell each, in the
 * chicken sheet's columns, so cell k of the costume sheet is cell k of the chicken's (a packed
 * idle sheet's cell k, js/packed-sheets.js, is the k-th frame of its frameList). The cell sits at
 * stage (-74, 23) in the FLA, measured against the chicken's own 3x sheets: every plain chicken
 * frame this pipeline draws is scored against the chicken's sheet (the tools/vector-sprites
 * measure), and that score is the costume sheet's in tools/vector-sprites/results.json. The 3x
 * render is the art; the 1x is its 3:1 box downscale.
 *
 *   node tools/pot-luck-art/build.mjs                 render everything, register it, write built.json
 *   node tools/pot-luck-art/build.mjs --check         exit 1 when a file, the tool or the FLA changed since
 *   node tools/pot-luck-art/build.mjs --lineup <png>  the review lineup (plain, Turkey Tailfan, Rooster Plume, party hat)
 *   node tools/pot-luck-art/build.mjs --only party_hat  draw only those costumes; the rest stay as built.json has them
 *
 * The FLA is read from ~/Documents/glitch-audit/glitch-items (GRODDLE_GLITCH_ITEMS overrides).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { frameSvg } from '../overlay-art/xfl-svg.mjs';
import { crop, downscale, readImage, score, writeImage } from '../quoin-art/pixels.mjs';
import { encodeLosslessWebp } from '../webp-lossless.mjs';
import { CHICKEN_FLA_PATH, COSTUMES, iconArt, loadFla, makeVariant } from './variants.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const PUB = join(ROOT, 'public');
const ITEMS = process.env.GRODDLE_GLITCH_ITEMS || join(os.homedir(), 'Documents/glitch-audit/glitch-items');
const FLA_FILE = join(ITEMS, CHICKEN_FLA_PATH);
export const BUILT = join(HERE, 'built.json');
const RESULTS = join(ROOT, 'tools/vector-sprites/results.json');
const ICON_HIRES_JS = join(PUB, 'js/icon-hires.js');
const PROVENANCE = join(ROOT, 'tools/provenance/made-sprites.json');

/** The OGA chicken cell in FLA stage px: x, y, w, h (measured: see the header). */
export const CELL = Object.freeze([-74, 23, 148, 110]);
export const SCALE = 3;
export const OUT_DIR = 'assets/sprites/seasons/pot-luck';
/** A season's costume beyond Pot Luck Day keeps its sheets in its season's folder (js/pot-luck.js SEASON_COSTUMES). */
const COSTUME_DIRS = Object.freeze({ party_hat: 'assets/sprites/seasons/new-ur' });
/** The pack icons: [class, 1x width, 1x height]. */
export const ICONS = Object.freeze([['turkey_tailfan', 40, 40], ['rooster_plume', 40, 40], ['fancy_feather', 40, 40]]);

const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const fileSha = (rel) => sha(readFileSync(join(PUB, rel)));
/** The tool's own source, its module keys (?v=, tools/module-keys) left out: they change with other files. */
const toolSha = () => sha(['variants.mjs', 'build.mjs'].map((f) => readFileSync(join(HERE, f), 'utf8').replace(/\?v=[0-9a-f]{8}/g, '')).join('\n'));

/**
 * The chicken's sheets (tools/vector-sprites/animals.json jobs chicken and chicken-idles, the
 * packed idle states' boxes from js/packed-sheets-data.js): { clip, path, fw, fh, cols, frames,
 * at (packed: where its box sits in the cell, else null), flaFrames (0-based Chicken frames) }.
 */
export async function chickenSheets() {
  const animals = JSON.parse(readFileSync(join(ROOT, 'tools/vector-sprites/animals.json'), 'utf8'));
  const { PACKED_SHEETS } = await import('../../public/js/packed-sheets-data.js?v=192c6f15');
  const packed = new Map(Object.values(PACKED_SHEETS.chicken).map((d) => [d.path, d]));
  const LABELS = { walk: 0, flying: 24, flying_no_feathers: 66, land: 108, pause: 201, verb: 332, pecking_twice: 387, pecking_once: 427, sit: 459, idle1: 669, idle2: 736, idle3: 783 };
  const out = [];
  for (const job of animals.jobs.filter((j) => j.name === 'chicken' || j.name === 'chicken-idles')) {
    for (const s of job.sheets) {
      const clip = /npc_chicken_stand\.webp$/.test(s.path) ? 'stand' : s.label;
      const p = packed.get(s.path);
      const flaFrames = s.frameList ? s.frameList.map((f) => f - 1) : Array.from({ length: s.frames }, (_, i) => LABELS[s.label] + (s.first || 0) + i);
      out.push({ clip, path: s.path, fw: s.fw, fh: s.fh, cols: s.cols, frames: s.frames, at: p ? p.at : null, flaFrames });
    }
  }
  return out;
}

/** Where a costume's sheet for one chicken clip lives (public/). */
export const costumePath = (costume, clip, hires = false) => `${COSTUME_DIRS[costume] || OUT_DIR}/chicken_${costume}_${clip}${hires ? '@3x' : ''}.webp`;

/** Synthetic labels "@<frame>" on the Chicken clip, so a render can start it on any frame. */
function frameLabels(fla, frames) {
  const tl = fla.symbols.get('Chicken');
  for (const f of frames) tl.labels.set(`@${f}`, f);
}

let browser = null;
async function page() {
  if (!browser) {
    const { chromium } = await import('playwright');
    // Playwright's own Chromium where it is installed, else the system Chrome (Linux, G1195).
    browser = await chromium.launch().catch(() => chromium.launch({ channel: process.env.GRODDLE_BROWSER_CHANNEL || 'chrome' }));
  }
  return browser.newPage({ deviceScaleFactor: 1 });
}

/** One sheet: the variant's frames as full cells at 3x, `cols` across, as an image. */
async function renderSheet(p, fla, frames, cols, tmp) {
  const W = CELL[2] * SCALE;
  const H = CELL[3] * SCALE;
  const svgs = frames.map((f) => frameSvg(fla, 0, { scale: SCALE, box: CELL, start: { Chicken: `@${f}` } }));
  const rows = Math.ceil(frames.length / cols);
  await p.setViewportSize({ width: cols * W, height: rows * H });
  await p.setContent(`<style>html,body{margin:0;background:transparent}#g{display:grid;grid-template-columns:repeat(${cols},${W}px);grid-auto-rows:${H}px;width:${cols * W}px;height:${rows * H}px}svg{display:block}</style><div id="g">${svgs.join('')}</div>`);
  await p.locator('#g').screenshot({ path: tmp, omitBackground: true });
  return readImage(tmp);
}

function writeWebp(img, rel, tmpDir) {
  const png = join(tmpDir, 'out.png');
  writeImage(img, png);
  mkdirSync(dirname(join(PUB, rel)), { recursive: true });
  encodeLosslessWebp(png, join(PUB, rel));
}

/** The plain chicken this pipeline draws, cell by cell, against the chicken's own 3x sheet. */
function alignScores(plain, sheet, hiresMap) {
  const three = readImage(join(PUB, hiresMap.get(sheet.path)));
  const W = CELL[2] * SCALE;
  const H = CELL[3] * SCALE;
  const scores = [];
  for (let k = 0; k < sheet.frames; k++) {
    let mine = crop(plain, (k % sheet.cols) * W, Math.floor(k / sheet.cols) * H, W, H);
    if (sheet.at) mine = crop(mine, sheet.at[0] * SCALE, sheet.at[1] * SCALE, sheet.fw * SCALE, sheet.fh * SCALE);
    const theirs = crop(three, (k % sheet.cols) * sheet.fw * SCALE, Math.floor(k / sheet.cols) * sheet.fh * SCALE, sheet.fw * SCALE, sheet.fh * SCALE);
    scores.push(Math.round(score(mine, theirs) * 1e4) / 1e4);
  }
  return scores;
}

/** A pack icon: the costume's own parts, fitted to w x h (3x render, 1x its box downscale). */
async function renderIcon(p, base, cls, w, h, tmp) {
  const svg = iconArt(cls, base, frameSvg);
  await p.setViewportSize({ width: 600, height: 600 });
  await p.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block}</style>${svg}`);
  const box = await p.evaluate(() => {
    const s = document.querySelector('svg');
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    [...s.children].filter((c) => c.tagName !== 'defs').forEach((c) => g.appendChild(c));
    s.appendChild(g);
    const r = g.getBBox();
    return [r.x, r.y, r.width, r.height];
  });
  const pad = 0.06;
  const side = Math.max(box[2] / w, box[3] / h) * (1 + 2 * pad);
  const vw = side * w;
  const vh = side * h;
  const vx = box[0] + box[2] / 2 - vw / 2;
  const vy = box[1] + box[3] / 2 - vh / 2;
  await p.setViewportSize({ width: w * SCALE, height: h * SCALE });
  await p.evaluate(([vx, vy, vw, vh, W, H]) => {
    const s = document.querySelector('svg');
    s.setAttribute('viewBox', `${vx} ${vy} ${vw} ${vh}`);
    s.setAttribute('width', W);
    s.setAttribute('height', H);
  }, [vx, vy, vw, vh, w * SCALE, h * SCALE]);
  await p.locator('svg').screenshot({ path: tmp, omitBackground: true });
  return readImage(tmp);
}

/** The 3x icon list (js/icon-hires.js HIRES_ICONS, which tools/icon-hires/hires.py writes from the @3x files on disk) with ours in it. */
export function iconHiresText(src = readFileSync(ICON_HIRES_JS, 'utf8')) {
  const m = /^export const HIRES_ICONS = new Set\((\[.*\])\);$/m.exec(src);
  const ids = [...new Set([...JSON.parse(m[1]), ...ICONS.map(([id]) => id)])].sort();
  return src.replace(m[0], `export const HIRES_ICONS = new Set(${JSON.stringify(ids, null, 0).replace(/","/g, '", "')});`);
}

/** tools/vector-sprites/results.json rows for the costume sheets (js/sprite-hires.js is written from them). */
function resultRows(sheets, align, costumes = COSTUMES) {
  const rows = {};
  for (const costume of costumes) {
    for (const s of sheets) {
      const one = costumePath(costume, s.clip);
      const hires = costumePath(costume, s.clip, true);
      const frameScores = align[s.clip];
      rows[one] = {
        animal: 'pot-luck', character: 'pot-luck', source: 'tools/pot-luck-art', status: 'ok', hires,
        bytes: statSync(join(PUB, hires)).size, cells: s.frames, fw: CELL[2], fh: CELL[3], cols: s.cols,
        scoreKind: "the plain chicken drawn by this pipeline vs the chicken's own 3x sheet (the tools/vector-sprites measure); the costume is drawn inside the same rig; the 1x is the 3x render's 3:1 box downscale",
        score: Math.round((frameScores.reduce((a, b) => a + b, 0) / frameScores.length) * 1e4) / 1e4,
        minFrame: Math.min(...frameScores), drift: [], frameScores,
      };
    }
  }
  return rows;
}

/**
 * only: the costumes to draw (default all). The others' files, rows and align scores stay as built.json
 * has them (G1195: the party hat was added on Linux's Chrome; Pot Luck Day's sheets were drawn on the Mac).
 */
async function build(only = COSTUMES) {
  if (!existsSync(FLA_FILE)) throw new Error(`no chicken FLA at ${FLA_FILE} (set GRODDLE_GLITCH_ITEMS)`);
  const partial = only.length < COSTUMES.length;
  const before = partial && existsSync(BUILT) ? JSON.parse(readFileSync(BUILT, 'utf8')) : null;
  const sheets = await chickenSheets();
  const base = loadFla(FLA_FILE);
  frameLabels(base, sheets.flatMap((s) => s.flaFrames));
  const { HIRES_SPRITES } = await import('../../public/js/sprite-hires.js?v=dd070ce8');
  const tmpDir = mkdtempSync(join(os.tmpdir(), 'pot-luck-art-'));
  const tmp = join(tmpDir, 'shot.png');
  const p = await page();
  const files = before ? Object.fromEntries(Object.entries(before.files).filter(([rel]) => !only.some((c) => sheets.some((s) => rel === costumePath(c, s.clip) || rel === costumePath(c, s.clip, true))))) : {};
  const align = {};
  try {
    for (const s of sheets) {
      align[s.clip] = alignScores(await renderSheet(p, base, s.flaFrames, s.cols, tmp), s, HIRES_SPRITES);
      process.stdout.write(`${s.clip} ${Math.min(...align[s.clip])} `);
    }
    for (const costume of only) {
      const v = makeVariant(costume, base);
      for (const s of sheets) {
        const img = await renderSheet(p, v, s.flaFrames, s.cols, tmp);
        writeWebp(img, costumePath(costume, s.clip, true), tmpDir);
        writeWebp(downscale(img, SCALE), costumePath(costume, s.clip), tmpDir);
        for (const rel of [costumePath(costume, s.clip), costumePath(costume, s.clip, true)]) files[rel] = fileSha(rel);
        process.stdout.write(`\n${costume}/${s.clip}`);
      }
    }
    for (const [cls, w, h] of partial ? [] : ICONS) {
      const img = await renderIcon(p, base, cls, w, h, tmp);
      for (const [rel, im] of [[`assets/sprites/icons/${cls}@3x.webp`, img], [`assets/sprites/icons/${cls}.webp`, downscale(img, SCALE)]]) {
        writeWebp(im, rel, tmpDir);
        files[rel] = fileSha(rel);
      }
    }
  } finally {
    await browser?.close();
    rmSync(tmpDir, { recursive: true, force: true });
  }
  // Register the 3x sheets and icons where the game looks them up.
  const results = JSON.parse(readFileSync(RESULTS, 'utf8'));
  Object.assign(results, resultRows(sheets, align, only));
  writeFileSync(RESULTS, `${JSON.stringify(results, null, 1)}\n`);
  const { writeModule } = await import('../vector-sprites/build.mjs');
  writeModule(results);
  writeFileSync(ICON_HIRES_JS, iconHiresText());
  // The made-art provenance (tools/provenance/made-sprites.json, the Made for Groddle page) hashes each costume's stand.
  const prov = JSON.parse(readFileSync(PROVENANCE, 'utf8'));
  for (const c of only) if (prov.sprites[`chicken_${c}`]) prov.sprites[`chicken_${c}`].sha256 = files[costumePath(c, 'stand', true)];
  writeFileSync(PROVENANCE, `${JSON.stringify(prov, null, 2)}\n`);
  const built = {
    about: 'Written by tools/pot-luck-art/build.mjs (G982). Do not edit: rerun it. fla: the chicken FLA it read; tool: variants.mjs + build.mjs; files: each output and its sha256; align: the plain chicken against its own 3x sheets, per clip, the worst frame.',
    fla: { path: CHICKEN_FLA_PATH, sha256: sha(readFileSync(FLA_FILE)) },
    tool: toolSha(),
    cell: CELL,
    align: before ? before.align : Object.fromEntries(Object.entries(align).map(([k, v]) => [k, Math.min(...v)])),
    files,
  };
  writeFileSync(BUILT, `${JSON.stringify(built, null, 1)}\n`);
  console.log(`\nwrote ${Object.keys(files).length} files; registered in tools/vector-sprites/results.json, js/sprite-hires.js and js/icon-hires.js`);
}

/** What is stale: [] when the files, the tool and the FLA (when it is here) match built.json. */
export async function problems() {
  const bad = [];
  if (!existsSync(BUILT)) return ['tools/pot-luck-art/built.json is missing'];
  const built = JSON.parse(readFileSync(BUILT, 'utf8'));
  if (built.tool !== toolSha()) bad.push('variants.mjs or build.mjs changed since the art was built');
  if (existsSync(FLA_FILE) && sha(readFileSync(FLA_FILE)) !== built.fla.sha256) bad.push('the chicken FLA changed');
  for (const [rel, h] of Object.entries(built.files)) {
    if (!existsSync(join(PUB, rel))) bad.push(`${rel} is missing`);
    else if (fileSha(rel) !== h) bad.push(`${rel} changed`);
  }
  const sheets = await chickenSheets();
  // The game's table of the same sheets (js/pot-luck.js, which cuts the twins) must agree with this one.
  const { CHICKEN_SHEETS, costumeSheetPath } = await import('../../public/js/pot-luck.js?v=e704c060');
  const game = JSON.stringify(CHICKEN_SHEETS.map(({ clip, path, fw, fh, cols, frames }) => [clip, path, fw, fh, cols, frames]));
  if (game !== JSON.stringify(sheets.map(({ clip, path, fw, fh, cols, frames }) => [clip, path, fw, fh, cols, frames]))) bad.push('public/js/pot-luck.js CHICKEN_SHEETS differs from the chicken sheets this tool draws');
  for (const c of COSTUMES) for (const s of sheets) if (costumeSheetPath(c, s.clip) !== costumePath(c, s.clip)) bad.push(`js/pot-luck.js names ${costumePath(c, s.clip)} differently`);
  for (const c of COSTUMES) for (const s of sheets) for (const hi of [false, true]) if (!built.files[costumePath(c, s.clip, hi)]) bad.push(`${costumePath(c, s.clip, hi)} was never built`);
  const results = JSON.parse(readFileSync(RESULTS, 'utf8'));
  for (const c of COSTUMES) for (const s of sheets) if (results[costumePath(c, s.clip)]?.hires !== costumePath(c, s.clip, true)) bad.push(`${costumePath(c, s.clip)} is not in tools/vector-sprites/results.json`);
  const prov = JSON.parse(readFileSync(PROVENANCE, 'utf8'));
  for (const c of COSTUMES) {
    const row = prov.sprites[`chicken_${c}`];
    if (!row || row.file !== `public/${costumePath(c, 'stand', true)}` || row.sha256 !== built.files[costumePath(c, 'stand', true)]) bad.push(`tools/provenance/made-sprites.json chicken_${c} does not record its stand`);
  }
  const { moduleText } = await import('../vector-sprites/build.mjs');
  if (readFileSync(join(PUB, 'js/sprite-hires.js'), 'utf8') !== moduleText(results)) bad.push('public/js/sprite-hires.js is stale');
  if (readFileSync(ICON_HIRES_JS, 'utf8') !== iconHiresText()) bad.push('public/js/icon-hires.js does not list the costume icons');
  return bad;
}

/** The review lineup: plain chicken, Turkey Tailfan, Rooster Plume on the same frames, then the icons. */
async function lineup(out) {
  const base = loadFla(FLA_FILE);
  const shots = [['walk', 0], ['walk', 12], ['pecking_once', 12], ['idle1', 30], ['idle2', 20], ['idle3', 40], ['verb', 25], ['sit', 10], ['flying', 10], ['land', 12]];
  const L = { walk: 0, flying: 24, land: 108, verb: 332, pecking_once: 427, sit: 459, idle1: 669, idle2: 736, idle3: 783 };
  frameLabels(base, shots.map(([c, n]) => L[c] + n));
  const box = [CELL[0] + 20, CELL[1], CELL[2] - 20, CELL[3]];
  const names = { chicken: 'Chicken (Tiny Speck)', turkey_tailfan: 'Turkey Tailfan', rooster_plume: 'Rooster Plume', party_hat: 'Party hat (New Ur)' };
  const rows = ['chicken', ...COSTUMES].map((kind) => {
    const v = makeVariant(kind, base);
    return `<div class="row"><div class="name">${names[kind]}</div>${shots.map(([c, n]) => `<figure>${frameSvg(v, 0, { scale: 1.6, box, start: { Chicken: `@${L[c] + n}` } })}<figcaption>${c} ${n}</figcaption></figure>`).join('')}</div>`;
  });
  const icons = ICONS.map(([cls]) => `<figure><img src="data:image/webp;base64,${readFileSync(join(PUB, `assets/sprites/icons/${cls}@3x.webp`)).toString('base64')}" width="120" height="120"><figcaption>${cls}</figcaption></figure>`).join('');
  const p = await page();
  await p.setViewportSize({ width: 1700, height: 900 });
  await p.setContent(`<style>body{margin:0;padding:12px;background:#dfe8cf;font:13px system-ui;color:#333}.row{display:flex;align-items:center;gap:4px;margin-bottom:6px}.name{width:130px;font-weight:600}figure{margin:0;background:#f1f5e8;border-radius:6px;text-align:center}figcaption{font-size:11px;color:#667}h1{font-size:16px;margin:0 0 8px}</style><h1>Pot Luck Day chicken costumes (G982): same frames, three looks, for review</h1>${rows.join('')}<div class="row"><div class="name">Pack icons (3x)</div>${icons}</div>`);
  mkdirSync(dirname(out), { recursive: true });
  await p.screenshot({ path: out, fullPage: true });
  await browser.close();
  console.log(`lineup: ${out}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes('--check')) {
    const bad = await problems();
    if (bad.length) {
      console.error(`pot-luck-art: stale (run node tools/pot-luck-art/build.mjs):\n  ${bad.join('\n  ')}`);
      process.exit(1);
    }
    console.log('pot-luck-art: up to date');
  } else if (args.includes('--lineup')) {
    await lineup(args[args.indexOf('--lineup') + 1] || join(ROOT, 'lineup-costumes.png'));
  } else {
    const i = args.indexOf('--only');
    await build(i >= 0 ? args[i + 1].split(',').filter((c) => COSTUMES.includes(c)) : COSTUMES);
  }
}
