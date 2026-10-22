#!/usr/bin/env node
/**
 * Vector Glitch avatar data and the default look's sheets, from Tiny Speck's
 * CC0 glitch-avatars SWFs (base_avatar/Avatar.swf + vanity/wardrobe parts).
 *
 *   node tools/avatar-compositor/build.mjs data     # rig, articles, catalog -> public/assets/avatar/
 *   node tools/avatar-compositor/build.mjs render   # default look -> assets/sprites/avatar/vector/ (+ @3x)
 *   node tools/avatar-compositor/build.mjs score    # pose alignment vs the 62d8 sheets
 *   node tools/avatar-compositor/build.mjs all
 *
 * data: Avatar.swf's avatarContainer (sprite 409) is flattened at every swf
 * frame the game's sheets use (js/avatar-anims.js SHEET_FRAMES); each
 * container keeps its per-frame matrix, so an article part placed in it
 * follows the limb exactly as AvatarSwf.addArticlePartToContainer did. Each
 * catalog article (tools/avatar-compositor/catalog.json) is flattened the
 * same way (face parts animate on the same frame numbers). Shapes come from
 * FFDec's SVG export. Colours: GSJS default colours per article and the
 * skin/hair palettes (data_avatar_colors), applied as the client's colour
 * matrices.
 *
 * render/score run js/avatar-compositor.js in Chromium (Playwright) against
 * a local static server, so the shipped files come from the same code the
 * character builder uses at runtime.
 *
 * Options: --work <dir> (FFDec cache; default $TMPDIR/avatar-compositor)
 */
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync, rmSync, readdirSync, copyFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import { readSwf } from './swf.mjs';
import { exportShapes } from './shapes.mjs';
import { buildRig, flattenPart, nodeContent, shapeIds } from './rig.mjs';
import { loadGsjsAvatarData, loadHatHairMap } from './gsjs.mjs';
import { ARTICLE_CONTAINERS, SLOT_PARTS } from '../../public/js/avatar-rig.js';
import { SHEET_FRAMES } from '../../public/js/avatar-anims.js';
import { resolveLook } from '../../public/js/avatar-looks.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const PUBLIC = join(ROOT, 'public');
const OUT = join(PUBLIC, 'assets/avatar');
const SHEETS_OUT = join(PUBLIC, 'assets/sprites/avatar/vector');
const AVATARS = join(os.homedir(), 'Documents/glitch-audit/glitch-avatars');
const CLIENT = join(os.homedir(), 'Documents/glitch-audit/glitch-client');
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const WORK = resolve(opt('work', join(os.tmpdir(), 'avatar-compositor')));
const cmd = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1]?.startsWith('--') !== true) || 'all';

/** Every swf frame a sheet holds, sorted. */
export const RIG_FRAMES = [...new Set(Object.values(SHEET_FRAMES).flat())].sort((a, b) => a - b);

const LEG_CONTAINERS = ['sideLegLowerCloseContainer_mc', 'sideLegLowerOffsideContainer_mc', 'backLegLowerLeftNakedContainer_mc', 'backLegLowerRightNakedContainer_mc'];

const roundShape = (sh) => sh;

function writeJson(file, data) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(data)}\n`);
  return statSync(file).size;
}

/** FFDec work dir per SWF (shapes cached by file name + size). */
function workFor(swf) {
  const dir = join(WORK, `${basename(swf, '.swf')}-${statSync(swf).size}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeBitmaps(bitmaps, ids, prefix) {
  const out = {};
  for (const id of ids) {
    const png = bitmaps.get(id);
    if (!png) continue;
    const file = `textures/${prefix}-${id}.png`;
    mkdirSync(join(OUT, 'textures'), { recursive: true });
    writeFileSync(join(OUT, file), png);
    out[id] = file;
  }
  return out;
}

function bitmapIdsOf(shapes) {
  const ids = new Set();
  for (const sh of Object.values(shapes)) for (const p of sh.p) if (p.f && p.f.t === 'b') ids.add(p.f.id);
  return ids;
}

// ---------------------------------------------------------------------------
// data
// ---------------------------------------------------------------------------

function buildBase() {
  const file = join(AVATARS, 'base_avatar/Avatar.swf');
  const swf = readSwf(file);
  const rootId = swf.classes.get('avatarContainer');
  const rig = buildRig(swf, rootId, RIG_FRAMES, ARTICLE_CONTAINERS, LEG_CONTAINERS);
  const { shapes: allShapes, bitmaps } = exportShapes(file, workFor(file), swf.shapeBounds);
  const nodes = rig.nodes.map((n) => {
    const { ops } = nodeContent(swf, rootId, n);
    return { name: n.name, ops };
  });
  // The eye/mouth mask is a fresh sideSkull at skull.x/y: the skull node's
  // own matrix must be a pure translation for the node world matrix to match.
  const ids = new Set();
  for (const n of nodes) shapeIds(n.ops, ids);
  for (const rows of rig.table) for (const r of rows) if (r.s !== undefined) ids.add(r.s);
  const shapes = {};
  for (const id of [...ids].sort((a, b) => a - b)) shapes[id] = roundShape(allShapes.get(id));
  const bmp = writeBitmaps(bitmaps, bitmapIdsOf(shapes), 'base');
  const data = {
    source: 'glitch-avatars/base_avatar/Avatar.swf (CC0), sprite avatarContainer',
    frames: RIG_FRAMES,
    nodes,
    ...packTable(rig),
    shapes,
    bitmaps: bmp,
  };
  const bytes = writeJson(join(OUT, 'base.json'), data);
  console.log(`base.json: ${nodes.length} body parts, ${Object.keys(shapes).length} shapes, ${RIG_FRAMES.length} frames, ${(bytes / 1024).toFixed(0)} KB`);
  return { swf, data };
}

/**
 * Compact frame table (js/avatar-rig.js expandRig reads it): each row is
 * [ref, a, b, c, d, tx, ty, alpha?] where ref >= 0 is a body-part node and
 * ref < 0 is slot -(ref + 1); face slots move in the head container's
 * space, kept once per frame in `head`.
 */
function packTable(rig) {
  const slots = [];
  const slotIndex = new Map();
  const head = [];
  const table = rig.table.map((rows, f) => rows.map((r) => {
    let ref;
    if (r.slot) {
      if (!slotIndex.has(r.slot)) { slotIndex.set(r.slot, slots.length); slots.push(r.slot); }
      ref = -(slotIndex.get(r.slot) + 1);
      if (r.pm) {
        if (head[f] && head[f].join() !== r.pm.join()) throw new Error(`frame ${rig.frames?.[f]}: face slots in different parents`);
        head[f] = r.pm;
      }
    } else if (r.n !== undefined) ref = r.n;
    else throw new Error('loose shape in the rig table');
    const row = [ref, ...r.m];
    if (r.a !== undefined && r.a < 1) row.push(r.a);
    return row;
  }));
  return { slots, table, head, containers: rig.containers };
}

/** Article SWF for a catalog entry. */
function articleSwf(type, name, asset) {
  const dirs = { eyes: 'vanity/eyes', mouth: 'vanity/mouth', nose: 'vanity/nose', ears: 'vanity/ears', hair: 'vanity/hair' };
  const rel = asset ? (dirs[type] ? `vanity/${asset}` : `wardrobe/${asset}`) : `${dirs[type] || `wardrobe/${type}`}/${name}.swf`;
  const file = join(AVATARS, rel);
  if (!existsSync(file)) throw new Error(`no SWF for ${type}/${name} (${rel})`);
  return file;
}

function buildArticle(type, name, gsjsEntry) {
  const file = articleSwf(type, name, gsjsEntry?.asset);
  const swf = readSwf(file);
  const partNames = [...new Set(Object.entries(SLOT_PARTS).filter(([t]) => t === type || (type === 'shoes' && t === 'boots')).flatMap(([, l]) => l.map(([p]) => p)))];
  if (type === 'hat') partNames.push('sideHatHairMask', 'backHatHairMask');
  const parts = {};
  const ids = new Set();
  for (const part of partNames) {
    const id = swf.classes.get(part);
    if (id === undefined || !swf.sprites.has(id)) continue;
    const flat = flattenPart(swf, id, RIG_FRAMES);
    if (!flat.variants.some((v) => v.length)) continue;
    parts[part] = flat;
    for (const v of flat.variants) shapeIds(v, ids);
  }
  const { shapes: allShapes, bitmaps } = exportShapes(file, workFor(file), swf.shapeBounds);
  const shapes = {};
  for (const id of [...ids].sort((a, b) => a - b)) shapes[id] = allShapes.get(id);
  const bmp = writeBitmaps(bitmaps, bitmapIdsOf(shapes), `${type}-${name}`);
  const groups = new Set();
  const collect = (ops) => { for (const o of ops) { if (o.g) o.g.forEach((g) => groups.add(g)); if (o.ops) { collect(o.ops); collect(o.clip); } } };
  for (const p of Object.values(parts)) p.variants.forEach(collect);
  const data = { name, type, source: `glitch-avatars/${relative(AVATARS, file)} (CC0)`, parts, groups: [...groups].sort(), shapes, bitmaps: bmp };
  const bytes = writeJson(join(OUT, 'articles', type, `${name}.json`), data);
  return { data, bytes };
}

function buildData() {
  const gs = loadGsjsAvatarData();
  const hatHair = loadHatHairMap(join(CLIENT, 'com/tinyspeck/core/data/AvatarSwfParticulars.as'));
  const manifest = JSON.parse(readFileSync(join(HERE, 'catalog.json'), 'utf8'));
  rmSync(join(OUT, 'articles'), { recursive: true, force: true });
  rmSync(join(OUT, 'textures'), { recursive: true, force: true });
  buildBase();
  const byClass = new Map();
  const variantsOf = new Map();
  for (const [id, c] of Object.entries(gs.clothing)) {
    if (!byClass.has(c.article_class_name)) byClass.set(c.article_class_name, { id, ...c });
    if (!variantsOf.has(c.article_class_name)) variantsOf.set(c.article_class_name, []);
    variantsOf.get(c.article_class_name).push({ id: Number(id), colors: c.colors || {} });
  }
  const faceByClass = new Map();
  for (const [id, c] of Object.entries(gs.faces)) if (!faceByClass.has(c.article_class_name)) faceByClass.set(c.article_class_name, { id, ...c });
  const catalog = { source: 'glitch-avatars + glitch-GameServerJS (CC0)', types: {}, hatHair: {}, palettes: {}, defaultLook: manifest.defaultLook, looks: manifest.looks || {} };
  let total = 0;
  for (const [type, entries] of Object.entries(manifest.articles)) {
    catalog.types[type] = [];
    for (const [index, e] of entries.entries()) {
      const name = typeof e === 'string' ? e : e.name;
      const g = byClass.get(name) || faceByClass.get(name);
      const { data, bytes } = buildArticle(type, name, g);
      total += bytes;
      const item = { name, label: e.label || labelOf(name, type, index), parts: Object.keys(data.parts), groups: data.groups };
      if (g?.id) item.gsjsId = Number(g.id);
      // Every GSJS colourway of the article (data_clothing has one id per colourway).
      const variants = variantsOf.get(name);
      if (variants?.length) item.variants = variants.sort((a, b) => a.id - b.id);
      catalog.types[type].push(item);
      if (type === 'hat' && hatHair[name]) catalog.hatHair[name] = hatHair[name];
      console.log(`  ${type}/${name}: ${Object.keys(data.parts).length} parts, groups ${data.groups.join(',') || '-'}, ${(bytes / 1024).toFixed(0)} KB`);
    }
  }
  for (const slot of ['skin', 'hair']) {
    catalog.palettes[slot] = Object.entries(gs.colors)
      .filter(([, c]) => c.slot === slot)
      .map(([id, c]) => ({ id: Number(id), color: String(c.color).toLowerCase(), colors: c.colors }));
  }
  catalog.defaults = gs.defaults;
  const bytes = writeJson(join(OUT, 'catalog.json'), catalog);
  console.log(`articles: ${(total / 1024).toFixed(0)} KB; catalog.json ${(bytes / 1024).toFixed(0)} KB`);
}

/** Builder label: words from the class name, or "Eyes 3" for coded names. */
function labelOf(name, type, index) {
  const rest = name.replace(/^(eyes?|mouth|nose|ears|hair)_?/i, '');
  const typeLabel = { eyes: 'Eyes', mouth: 'Mouth', nose: 'Nose', ears: 'Ears', hair: 'Hair' }[type];
  if (typeLabel && (!rest || /^[A-Z]?\d+[A-Z]?$/i.test(rest) || /^\d{6,}/.test(rest))) return `${typeLabel} ${index + 1}`;
  return rest.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\s+/g, ' ').trim().replace(/^\w/, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// render / score (Chromium)
// ---------------------------------------------------------------------------

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.css': 'text/css' };

function serve() {
  return new Promise((resolveServer) => {
    const server = createServer((req, res) => {
      const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      const file = url.startsWith('/tools/') ? join(ROOT, url) : join(PUBLIC, url);
      if (!file.startsWith(ROOT) || !existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
      res.end(readFileSync(file));
    });
    server.listen(0, '127.0.0.1', () => resolveServer(server));
  });
}

async function withPage(fn) {
  const { chromium } = await import('playwright');
  const server = await serve();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`http://127.0.0.1:${server.address().port}/tools/avatar-compositor/harness.html`);
    await page.waitForFunction(() => window.harnessReady === true);
    const out = await fn(page);
    if (errors.length) console.log('page errors:', errors.slice(0, 5));
    return out;
  } finally {
    await browser.close();
    server.close();
  }
}

/**
 * Write a sheet losslessly: PNG, or WebP when it saves a fifth (the same
 * rule as tools/vector-sprites). Returns the file written; removes the other.
 */
function saveSheet(stem, dataUrl) {
  mkdirSync(dirname(stem), { recursive: true });
  const png = `${stem}.png`;
  const webp = `${stem}.webp`;
  writeFileSync(png, Buffer.from(dataUrl.split(',')[1], 'base64'));
  execFileSync('magick', [png, '-define', 'png:compression-level=9', '-define', 'png:compression-filter=5', '-strip', `PNG32:${png}`]);
  execFileSync('cwebp', ['-quiet', '-lossless', '-exact', '-z', '9', png, '-o', webp]);
  if (statSync(webp).size < statSync(png).size * 0.8) { rmSync(png); return webp; }
  rmSync(webp);
  return png;
}

async function render() {
  const catalog = JSON.parse(readFileSync(join(OUT, 'catalog.json'), 'utf8'));
  const look = resolveLook(catalog.defaultLook, catalog);
  const result = await withPage((page) => page.evaluate(async (l) => window.renderLook(l, [1, 3]), look));
  rmSync(SHEETS_OUT, { recursive: true, force: true });
  const defs = {};
  for (const [name, r] of Object.entries(result)) {
    const f1 = saveSheet(join(SHEETS_OUT, name), r[1]);
    const f3 = saveSheet(join(SHEETS_OUT, `${name}@3x`), r[3]);
    defs[name] = { ...r.def, file: basename(f1), hires: basename(f3) };
    const mb = (r.def.cols * r.def.fw * 3 * r.def.rows * r.def.fh * 3 * 4) / 2 ** 20;
    console.log(`  ${name}: ${r.def.cells} cells ${r.def.fw}x${r.def.fh} in ${r.def.cols}x${r.def.rows}, 1x ${(statSync(f1).size / 1024).toFixed(0)} KB, 3x ${(statSync(f3).size / 1024).toFixed(0)} KB (${mb.toFixed(1)} MB decoded)`);
  }
  writeSheetsModule(defs);
  // Poses must match the recovered sheets before the files are listed for 3x.
  const { score } = await import('./score.mjs');
  const report = await score();
  if (!report.pass) throw new Error('composed poses do not match the 62d8 sheets (tools/avatar-compositor/score.json)');
  await registerHires(defs, report);
  return defs;
}

/**
 * public/js/avatar-vector-sheets.js: the default look's sheet layout (the
 * GLITCH_AVATAR shape js/avatar-anims.js uses, plus cols/rows) and its 3x
 * files for js/sprite-hires.js.
 */
function writeSheetsModule(defs) {
  const dir = relative(PUBLIC, SHEETS_OUT);
  const sheets = Object.entries(defs).map(([name, d]) => `    ${name}: Object.freeze(${JSON.stringify({ file: d.file, cells: d.cells, fw: d.fw, fh: d.fh, cols: d.cols, rows: d.rows, feetY: d.feetY, midX: d.midX })}),`).join('\n');
  writeFileSync(join(PUBLIC, 'js/avatar-vector-sheets.js'), `/**
 * The default vector Glitch look's sheets (generated by
 * tools/avatar-compositor/build.mjs render; do not edit by hand). Composited
 * from Tiny Speck's CC0 avatar SWFs at every swf frame of
 * js/avatar-anims.js SHEET_FRAMES; same layout as GLITCH_AVATAR, wrapped
 * into rows (cols x rows). feetY/midX: the standing pose's feet.
 */
export const VECTOR_AVATAR = Object.freeze({
  id: 'vector-default',
  dir: '${dir}/',
  sheets: Object.freeze({
${sheets}
  }),
  scale: 1,
  facesRight: true,
});

/** 1x sheet path -> 3x file (registered with js/sprite-hires.js). */
export const VECTOR_AVATAR_HIRES = Object.freeze({
${Object.values(defs).map((d) => `  ${JSON.stringify(`${dir}/${d.file}`)}: ${JSON.stringify(`${dir}/${d.hires}`)},`).join('\n')}
});
`);
}

/**
 * List the default sheets in tools/vector-sprites/results.json and
 * regenerate public/js/sprite-hires.js, so the game's Texture.from route
 * swaps them to 3x on first draw like the other vector sheets.
 */
async function registerHires(defs, report) {
  const { writeModule } = await import('../vector-sprites/build.mjs');
  const resultsFile = join(ROOT, 'tools/vector-sprites/results.json');
  const results = existsSync(resultsFile) ? JSON.parse(readFileSync(resultsFile, 'utf8')) : {};
  const dir = relative(PUBLIC, SHEETS_OUT);
  for (const [k, r] of Object.entries(results)) if (r.source === 'tools/avatar-compositor') delete results[k];
  for (const [name, d] of Object.entries(defs)) {
    results[`${dir}/${d.file}`] = {
      animal: 'avatar-vector',
      character: 'avatar-vector',
      source: 'tools/avatar-compositor',
      status: 'ok',
      hires: `${dir}/${d.hires}`,
      bytes: statSync(join(SHEETS_OUT, d.hires)).size,
      cells: d.cells,
      fw: d.fw,
      fh: d.fh,
      firstDraw: true,
      sheet: name,
      // Silhouette agreement with the recovered 62d8dab1 sheet, frame for frame (score.mjs).
      scoreKind: 'pose vs glitch-62d8',
      score: report.sheets[name].mean,
      minFrame: report.sheets[name].min,
      drift: report.sheets[name].drift,
      frameScores: report.sheets[name].frames.map((f) => f.score),
    };
  }
  writeFileSync(resultsFile, `${JSON.stringify(results, null, 1)}\n`);
  writeModule(results);
}

export { buildData, render, withPage, RIG_FRAMES as FRAMES };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const run = async () => {
    if (cmd === 'data' || cmd === 'all') buildData();
    if (cmd === 'render' || cmd === 'all') await render();
    if (cmd === 'score') {
      const { score } = await import('./score.mjs');
      await score();
    }
  };
  run().catch((err) => { console.error(err); process.exit(1); });
}
