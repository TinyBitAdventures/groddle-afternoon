#!/usr/bin/env node
/**
 * Before/after sheet for the reimagined wardrobe (row G52): every catalog
 * article marked `reimagined` drawn on the default Glitch look at the stand
 * frame (swf 801), once as the greyscale master SWF draws it (no colour
 * filters) and once per reimagined colourway (up to --max, default 3),
 * composited by js/avatar-compositor.js in Chromium like build.mjs render.
 *
 *   node tools/avatar-compositor/showcase.mjs --out <dir>              # <dir>/g52-before-after.png + .webp, <dir>/pairs/<item>.png
 *   node tools/avatar-compositor/showcase.mjs --out <dir> --scale 2    # figure scale (default 3)
 *   node tools/avatar-compositor/showcase.mjs --out <dir> --figures    # also <dir>/figures/<item>-<n>.png, bare transparent figures (0 = original)
 *   node tools/avatar-compositor/showcase.mjs --out <dir> --diag       # slot map: each colour_N a flat hue, beside its sibling
 *
 * Nothing is written into public/: placement is decided after review.
 */
import { mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { expandCatalog, resolveLook } from '../../public/js/avatar-looks.js';
import { withPage } from './build.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const OUT = resolve(opt('out', join(ROOT, 'shots/showcase')));
const SCALE = Number(opt('scale', 3));
const MAX = Number(opt('max', 3));
const DIAG = args.includes('--diag');
/** --names a,b: only these articles; --band y0,y1: crop figures to that height range (avatar units, y down; the default look spans about -75 to 61). */
const NAMES = opt('names', null)?.split(',');
const BAND = opt('band', null)?.split(',').map(Number);
const STAND = 801;

/** Flat, distinct hues for the slot map (colour_1 red, colour_2 green, ...). */
export const DIAG_HUES = Object.freeze(['ff0000', '00c000', '0060ff', 'ffd000', 'ff00ff', '00e0e0', 'ff8000', '8000ff', '804000', '000000', 'ff80c0', '808000', '008080']);
const diagColors = () => Object.fromEntries(DIAG_HUES.map((h, i) => [`color_${i + 1}`, { tintColor: h, brightness: '0', saturation: '0', contrast: '0', tintAmount: '100', alpha: '100' }]));

/** Candidate colour sources shown beside each master in --diag. */
const DIAG_SIBLINGS = {
  Women_Plain_Hat: ['dress/Women_Plain_Dress'],
  banana_hat: ['coat/banana_coat'],
  real_bowler_hat: ['hat/bowler_hat'],
  alph_lem_mab: ['coat/alph_lem', 'coat/mab'],
  banana_coat: ['hat/banana_hat'],
  chaulkywhite_shirtvest: ['shirt/chaulkywhite_coatshirtvest'],
  frilly_tank_blouse_belly: ['shirt/frilly_tank_blouse'],
  mushroom_shirt_light: ['shirt/mushroom_shirt'],
  nintendo_shirt_lighter: ['shirt/nintendo_shirt'],
  kiss_pants: ['coat/kissballoon_hoodie'],
  mongolia_fighting_pants: ['coat/mongolian_fighting'],
  rainbow_leggings: ['pants/rainbow_pan', 'pants/duotone_leggings'],
  bell_skirt: ['shirt/bell_top', 'coat/bell_hoodie'],
  slouch_boots: ['shoes/top_fur_boots', 'shoes/women_pirate_boot'],
  sweet_heart_shoes: ['skirt/sweet_heart_skirt', 'shirt/sweet_heart'],
};

const catalog = expandCatalog(JSON.parse(readFileSync(join(ROOT, 'public/assets/avatar/catalog.json'), 'utf8')));
const itemOf = (type, name) => catalog.types[type]?.find((i) => i.name === name);

/** The default look wearing one article (a dress drops top and trousers, a skirt the trousers), with these colours. */
function lookWith(type, name, colors) {
  const outfit = { [type]: name };
  if (type === 'dress') Object.assign(outfit, { shirt: 'none', pants: 'none' });
  if (type === 'skirt') outfit.pants = 'none';
  const look = resolveLook({ ...catalog.defaultLook, outfit: { ...catalog.defaultLook.outfit, ...outfit } }, catalog);
  look.outfit[type] = { name, colors };
  return look;
}

/** Cards: { name, title, note, figures: [{ caption, look }] }. */
function cards() {
  const out = [];
  for (const [type, list] of Object.entries(catalog.types)) {
    for (const it of list) {
      if (!it.reimagined || (NAMES && !NAMES.includes(it.name))) continue;
      const figures = [{ caption: 'Original file', look: lookWith(type, it.name, {}) }];
      if (DIAG) {
        figures.push({ caption: 'Slots', look: lookWith(type, it.name, diagColors()) });
        for (const sib of DIAG_SIBLINGS[it.name] || []) {
          const [t, n] = sib.split('/');
          const s = itemOf(t, n);
          if (!s) continue;
          figures.push({ caption: `${s.label} slots`, look: lookWith(t, n, diagColors()) });
          figures.push({ caption: s.label, look: lookWith(t, n, s.variants?.[0]?.colors || {}) });
        }
      } else {
        it.variants.slice(0, MAX).forEach((v, i) => figures.push({ caption: it.variants.length > 1 ? `Reimagined ${i + 1}` : 'Reimagined', look: lookWith(type, it.name, v.colors) }));
      }
      const note = it.borrowedLabel ? `Colours borrowed from ${it.borrowedLabel}` : 'Colours designed from the Glitch palette';
      out.push({ name: it.name, title: it.label, note, figures, designed: Boolean(it.designedColours) });
    }
  }
  return out;
}

/** In the page: paint every figure at the stand frame, feet on a shared baseline, then lay out the sheet and each card alone. */
async function paintInPage({ cards: list, scale, frame, band }) {
  const { prepareLook, drawListFor, paintItems } = await import('/js/avatar-compositor.js');
  const { drawListBounds } = await import('/js/avatar-rig.js');
  const C = { bg: '#dcefc9', surface: '#fbfaf2', fg: '#30462c', muted: '#697164', border: '#b8c9aa', accent: '#e58b3f' };
  const display = "600 FONT 'Iowan Old Style', Charter, Georgia, serif";
  const body = "FONT 'Trebuchet MS', -apple-system, sans-serif";
  const font = (f, px) => f.replace('FONT', `${px}px`);
  // Draw lists and the union bounds: every figure shares one origin, so feet line up.
  let u = null;
  for (const card of list) {
    for (const fig of card.figures) {
      const prep = await prepareLook(fig.look, '/assets/avatar/');
      fig.prep = prep;
      fig.items = drawListFor(prep, frame);
      const b = drawListBounds(fig.items, prep.shapeOf);
      if (b) u = u ? [Math.min(u[0], b[0]), Math.min(u[1], b[1]), Math.max(u[2], b[2]), Math.max(u[3], b[3])] : b;
    }
  }
  if (band) u = [u[0], band[0], u[2], band[1]];
  const pad = 10 * scale;
  const figW = Math.ceil((u[2] - u[0]) * scale) + 2 * pad;
  const figH = Math.ceil((u[3] - u[1]) * scale) + pad;
  const capH = 12 * scale;
  const titleH = 22 * scale;
  const inner = 8 * scale;
  const slots = Math.max(...list.map((c) => c.figures.length));
  const cardW = slots * figW + 2 * inner;
  const cardH = titleH + figH + capH + 2 * inner;
  const drawCard = (ctx, card, x, y, w = cardW) => {
    ctx.fillStyle = C.surface;
    ctx.strokeStyle = C.border;
    ctx.lineWidth = Math.max(1, scale / 2);
    ctx.beginPath();
    ctx.roundRect(x, y, w, cardH, 6 * scale);
    ctx.fill();
    ctx.stroke();
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillStyle = C.fg;
    ctx.font = font(display, 8 * scale);
    ctx.fillText(card.title, x + inner, y + inner + 8 * scale);
    ctx.fillStyle = C.muted;
    ctx.font = font(body, 4.6 * scale);
    ctx.fillText(card.note, x + inner, y + inner + 16 * scale);
    const used = card.figures.length * figW;
    const x0 = x + inner + (w - 2 * inner - used) / 2;
    card.figures.forEach((fig, i) => {
      const fx = x0 + i * figW;
      const fy = y + inner + titleH;
      if (i === 0) {
        ctx.fillStyle = '#eeeee8';
        ctx.beginPath();
        ctx.roundRect(fx + scale, fy, figW - 2 * scale, figH + capH - scale, 4 * scale);
        ctx.fill();
      }
      // Feet at the slot's baseline, the union box centred in the slot.
      const ox = fx + pad - u[0] * scale;
      const oy = fy + pad - u[1] * scale;
      ctx.save();
      ctx.beginPath();
      ctx.rect(fx, fy, figW, figH);
      ctx.clip();
      paintItems(ctx, fig.items, fig.prep.sources, [scale, 0, 0, scale, ox, oy]);
      ctx.restore();
      ctx.textAlign = 'center';
      ctx.fillStyle = i === 0 ? C.muted : C.fg;
      ctx.font = font(i === 0 ? body : `700 ${body}`, 4.8 * scale);
      ctx.fillText(fig.caption, fx + figW / 2, fy + figH + capH * 0.6);
    });
  };
  const gap = 8 * scale;
  const cols = Math.max(1, Math.min(list.length, Math.round(Number(window.__cols) || 2)));
  const rows = Math.ceil(list.length / cols);
  const headH = 34 * scale;
  const sheet = document.createElement('canvas');
  sheet.width = cols * cardW + (cols + 1) * gap;
  sheet.height = headH + rows * cardH + (rows + 1) * gap;
  const ctx = sheet.getContext('2d');
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, sheet.width, sheet.height);
  ctx.fillStyle = C.fg;
  ctx.font = font(display, 13 * scale);
  ctx.fillText(window.__title || 'Restored, and reimagined', gap, gap + 13 * scale);
  ctx.fillStyle = C.muted;
  ctx.font = font(body, 5.4 * scale);
  ctx.fillText(window.__subtitle || '', gap, gap + 23 * scale);
  list.forEach((card, i) => drawCard(ctx, card, gap + (i % cols) * (cardW + gap), headH + gap + Math.floor(i / cols) * (cardH + gap)));
  // Each card alone, as wide as its own figures.
  const pairs = {};
  for (const card of list) {
    const w = card.figures.length * figW + 2 * inner;
    const c = document.createElement('canvas');
    c.width = w + 2 * gap;
    c.height = cardH + 2 * gap;
    const cx = c.getContext('2d');
    cx.fillStyle = C.bg;
    cx.fillRect(0, 0, c.width, c.height);
    drawCard(cx, card, gap, gap, w);
    pairs[card.name] = c.toDataURL('image/png');
  }
  // Each figure alone on a transparent canvas, for pages that draw their own frames (--figures).
  const figures = {};
  for (const card of list) {
    figures[card.name] = card.figures.map((fig) => {
      const c = document.createElement('canvas');
      c.width = figW;
      c.height = figH;
      paintItems(c.getContext('2d'), fig.items, fig.prep.sources, [scale, 0, 0, scale, pad - u[0] * scale, pad - u[1] * scale]);
      return c.toDataURL('image/png');
    });
  }
  return { sheet: sheet.toDataURL("image/png"), pairs, figures, size: [sheet.width, sheet.height], fig: [figW, figH], union: u };
}

async function main() {
  const list = cards();
  if (!list.length) throw new Error('no reimagined articles in the catalog');
  const looks = list.map((c) => ({ ...c, figures: c.figures.map((f) => ({ caption: f.caption, look: f.look })) }));
  const n = list.length;
  const designed = list.filter((c) => c.designed).length;
  const subtitle = DIAG
    ? 'Slot map: colour_1 red, 2 green, 3 blue, 4 yellow, 5 magenta, 6 cyan, 7 orange, 8 violet, 9 brown, 10 black, 11 pink, 12 olive, 13 teal'
    : `${n} wardrobe files Tiny Speck left in greyscale, worn by the default Glitch. Left: the original file. Right: colours borrowed from a sibling article${designed ? ` (${designed} with none to borrow from: colours designed in the same palette)` : ''}.`;
  const result = await withPage(async (page) => {
    await page.evaluate(({ cols, title, sub }) => { window.__cols = cols; window.__title = title; window.__subtitle = sub; }, { cols: DIAG ? 1 : 2, title: DIAG ? 'G52 slot map' : 'Restored, and reimagined', sub: subtitle });
    return page.evaluate(paintInPage, { cards: looks, scale: SCALE, frame: STAND, band: BAND });
  });
  mkdirSync(join(OUT, 'pairs'), { recursive: true });
  const stem = join(OUT, opt('name', DIAG ? 'g52-slot-map' : 'g52-before-after'));
  writeFileSync(`${stem}.png`, Buffer.from(result.sheet.split(',')[1], 'base64'));
  console.log(`${stem}.png ${result.size.join('x')} ${(statSync(`${stem}.png`).size / 1024).toFixed(0)} KB (figure cell ${result.fig.join("x")}, union ${result.union.map(Math.round)})`);
  if (DIAG) return;
  for (const [name, url] of Object.entries(result.pairs)) writeFileSync(join(OUT, 'pairs', `${name}.png`), Buffer.from(url.split(',')[1], 'base64'));
  console.log(`${Object.keys(result.pairs).length} pairs in ${join(OUT, 'pairs')}`);
  if (args.includes('--figures')) {
    // <dir>/figures/<item>-0.png is the original file, -1.. the reimagined colourways.
    mkdirSync(join(OUT, 'figures'), { recursive: true });
    for (const [name, urls] of Object.entries(result.figures)) {
      urls.forEach((url, i) => writeFileSync(join(OUT, 'figures', `${name}-${i}.png`), Buffer.from(url.split(',')[1], 'base64')));
    }
    console.log(`figures in ${join(OUT, 'figures')}`);
  }
  // Web copy: about 1600 px wide, lossy WebP under 400 KB.
  const webp = `${stem}.webp`;
  for (const q of [82, 74, 66, 58, 50]) {
    execFileSync('magick', [`${stem}.png`, '-resize', '1600x>', '-strip', '-quality', String(q), '-define', 'webp:method=6', webp]);
    if (statSync(webp).size <= 400 * 1024) break;
  }
  console.log(`${webp} ${(statSync(webp).size / 1024).toFixed(0)} KB`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((err) => { console.error(err); process.exit(1); });
