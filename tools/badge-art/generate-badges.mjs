// Reimagined achievement badge art for catalog rows with no archived official PNG.
//
// Usage:
//   node tools/badge-art/generate-badges.mjs            # write missing badges + manifest
//   node tools/badge-art/generate-badges.mjs --preview shots/badge-preview [--only a,b]
//       render designs for any rows (official or not) into a scratch dir for QA
//
// Every design is deterministic: a medallion in the official layout (textured rim,
// glossy category-coloured disc, embossed count, laurel or star flourishes) around
// a recovered CC0 item icon or a vector glyph, rasterised to 180x180 with the
// Playwright Chromium already in devDependencies. Official art always wins: rows
// listed in badge-icons.json are never generated into public/.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../../public');
const catalog = JSON.parse(readFileSync(join(root, 'assets/content/achievements.json'), 'utf8'));
const official = JSON.parse(readFileSync(join(root, 'assets/content/badge-icons.json'), 'utf8'));
const specs = JSON.parse(readFileSync(join(here, 'badge-specs.json'), 'utf8'));

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const previewDir = flag('--preview');
const only = (flag('--only') || '').split(',').filter(Boolean);

export const DISCS = {
  purple: { light: '#f0c8f0', base: '#a95eae', dark: '#56245e', ink: '#6b2c74', leaf: '#f4def6' },
  red: { light: '#ffc0aa', base: '#e2553f', dark: '#8a1d1a', ink: '#8c2419', leaf: '#ffe1d8' },
  green: { light: '#f0ffa8', base: '#93c93f', dark: '#3c7616', ink: '#2f5f10', leaf: '#efffd0' },
  teal: { light: '#c3f4ea', base: '#56ad9f', dark: '#1d5953', ink: '#1d5650', leaf: '#ddfaf3' },
  pink: { light: '#ffd0ee', base: '#ec6dbc', dark: '#962a6f', ink: '#9b2a73', leaf: '#ffe6f6' },
  yellow: { light: '#fffbbf', base: '#f3cf3b', dark: '#ad7a10', ink: '#8b5a08', leaf: '#fff7d8' },
  orange: { light: '#ffdcb0', base: '#ee8d40', dark: '#9c4419', ink: '#8c3b12', leaf: '#ffeedd' },
  blue: { light: '#c6d8ff', base: '#5574c4', dark: '#1f2f6a', ink: '#f6e7a4', inkStroke: '#7a5a12', leaf: '#e3ebff' },
  slate: { light: '#dfe7ee', base: '#7c8d9c', dark: '#34404d', ink: '#2b3642', leaf: '#eef3f7' },
};

const CATEGORY_DISC = {
  trees: 'green', gardens: 'green', cultivation: 'green', harvesting: 'yellow',
  animals: 'pink', social: 'pink', cooking: 'purple', alchemy: 'teal',
  industrial: 'orange', projects: 'orange', furniture: 'orange', exploring: 'blue',
  player: 'blue', 'player ability': 'blue', giants: 'yellow', feats: 'yellow',
  trophies: 'orange', seasonal: 'red', games: 'red', '': 'slate',
};

const TIER_RIMS = ['white', 'sage', 'slate', 'wood', 'gold'];

/** Small seeded PRNG so textures are identical on every run. */
function rng(seedText) {
  let h = 2166136261;
  for (const ch of seedText) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

function rimDefs(rim, id) {
  const r = rng(`${rim}:${id}`);
  switch (rim) {
    case 'white':
      return {
        fill: 'url(#rimWhite)',
        defs: `<radialGradient id="rimWhite" cx="50%" cy="42%" r="58%"><stop offset="0.78" stop-color="#ffffff"/><stop offset="1" stop-color="#ebe7df"/></radialGradient>`,
        overlay: '',
      };
    case 'sage': {
      let dots = '';
      for (let i = 0; i < 140; i++) {
        const a = r() * Math.PI * 2;
        const d = 76 + r() * 12;
        dots += `<circle cx="${(90 + Math.cos(a) * d).toFixed(1)}" cy="${(90 + Math.sin(a) * d).toFixed(1)}" r="${(0.8 + r() * 1.6).toFixed(1)}" fill="${r() > 0.5 ? '#ffffff' : '#5f6b45'}" opacity="${(0.18 + r() * 0.2).toFixed(2)}"/>`;
      }
      return {
        fill: 'url(#rimSage)',
        defs: `<radialGradient id="rimSage" cx="50%" cy="40%" r="60%"><stop offset="0.75" stop-color="#b9c39d"/><stop offset="1" stop-color="#8e9a72"/></radialGradient>`,
        overlay: dots,
      };
    }
    case 'slate': {
      let dots = '';
      for (let i = 0; i < 190; i++) {
        const a = r() * Math.PI * 2;
        const d = 76 + r() * 12;
        dots += `<circle cx="${(90 + Math.cos(a) * d).toFixed(1)}" cy="${(90 + Math.sin(a) * d).toFixed(1)}" r="${(0.7 + r() * 1.9).toFixed(1)}" fill="#ffffff" opacity="${(0.12 + r() * 0.3).toFixed(2)}"/>`;
      }
      return {
        fill: 'url(#rimSlate)',
        defs: `<radialGradient id="rimSlate" cx="50%" cy="38%" r="62%"><stop offset="0.72" stop-color="#8a959d"/><stop offset="1" stop-color="#5b656d"/></radialGradient>`,
        overlay: dots,
      };
    }
    case 'wood': {
      let grain = '';
      for (let i = 0; i < 16; i++) {
        const y = 4 + i * 11 + r() * 5;
        const wob = 3 + r() * 5;
        grain += `<path d="M0 ${y.toFixed(1)} C 45 ${(y - wob).toFixed(1)}, 70 ${(y + wob).toFixed(1)}, 100 ${y.toFixed(1)} S 160 ${(y - wob).toFixed(1)}, 180 ${(y + 1).toFixed(1)}" fill="none" stroke="#7a4518" stroke-width="${(0.8 + r() * 1.4).toFixed(1)}" opacity="${(0.25 + r() * 0.3).toFixed(2)}"/>`;
      }
      return {
        fill: 'url(#rimWood)',
        defs: `<linearGradient id="rimWood" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c98a4b"/><stop offset="0.5" stop-color="#a8682f"/><stop offset="1" stop-color="#8a5223"/></linearGradient>`,
        overlay: `<g clip-path="url(#rimClip)">${grain}</g>`,
      };
    }
    case 'gold':
      return {
        fill: 'url(#rimGold)',
        defs: `<linearGradient id="rimGold" x1="0.1" y1="0" x2="0.9" y2="1"><stop offset="0" stop-color="#fbeab0"/><stop offset="0.35" stop-color="#d4ab52"/><stop offset="0.55" stop-color="#f3dc8f"/><stop offset="0.8" stop-color="#b48a35"/><stop offset="1" stop-color="#8f6a22"/></linearGradient>`,
        overlay: '',
      };
    default:
      return rimDefs('white', id);
  }
}

function sprig(x, y, flip, color, stroke) {
  const s = flip ? -1 : 1;
  const leaves = [
    [0, 0, -30], [7, -6, -48], [14, -10, -62], [2, 8, -8],
  ].map(([lx, ly, rot]) => `<ellipse cx="${lx}" cy="${ly}" rx="7.2" ry="3.6" transform="rotate(${rot} ${lx} ${ly})" fill="${color}" stroke="${stroke}" stroke-width="1.1"/>`).join('');
  return `<g transform="translate(${x} ${y}) scale(${s} 1) rotate(-10)"><path d="M-4 12 Q 4 0 18 -12" fill="none" stroke="${stroke}" stroke-width="1.6" stroke-linecap="round"/>${leaves}</g>`;
}

function star(x, y, size, fill = '#ffd640', stroke = '#9a6a08') {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? size * 0.46 : size;
    pts.push(`${(x + Math.cos(a) * rr).toFixed(2)},${(y + Math.sin(a) * rr).toFixed(2)}`);
  }
  return `<polygon points="${pts.join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="1.4" stroke-linejoin="round"/>`;
}

/** Vector glyphs for subjects with no recovered item icon. Drawn in a 100x100 box. */
const GLYPHS = {
  padlock: `
    <path d="M30 46 V34 a20 20 0 0 1 40 0 V46" fill="none" stroke="#5b5f66" stroke-width="10" stroke-linecap="round"/>
    <path d="M30 46 V34 a20 20 0 0 1 40 0 V46" fill="none" stroke="#c9ced6" stroke-width="5" stroke-linecap="round"/>
    <rect x="18" y="44" width="64" height="48" rx="10" fill="url(#gGold)" stroke="#6b4a0e" stroke-width="3"/>
    <rect x="24" y="49" width="52" height="10" rx="5" fill="#fff6c8" opacity="0.55"/>
    <circle cx="50" cy="66" r="7" fill="#4a3208"/>
    <path d="M46 68 L54 68 L52 82 L48 82 Z" fill="#4a3208"/>`,
  sneaker: `
    <path d="M10 70 C 10 52, 22 40, 34 38 L 46 36 C 50 46, 60 50, 70 52 C 82 54, 92 60, 92 72 L 92 78 L 10 78 Z" fill="url(#gShoe)" stroke="#3a3a46" stroke-width="3" stroke-linejoin="round"/>
    <path d="M30 40 L 46 36 C 50 46, 60 50, 70 52 L 64 60 C 52 58, 40 52, 34 44 Z" fill="#e2553f" stroke="#3a3a46" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M8 78 L 94 78 L 94 86 C 94 88, 92 90, 90 90 L 12 90 C 9 90, 8 88, 8 86 Z" fill="#5a5f6e" stroke="#3a3a46" stroke-width="3" stroke-linejoin="round"/>
    <path d="M16 64 C 22 52, 30 46, 40 44" fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round" opacity="0.9"/>
    <path d="M40 46 l8 -3 M44 52 l8 -3 M49 57 l8 -3" stroke="#3a3a46" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M-6 56 h14 M-12 66 h18 M-4 46 h10" stroke="#ffffff" stroke-width="4" stroke-linecap="round" opacity="0.85"/>`,
};

function iconMarkup(spec, box) {
  if (spec.glyph) {
    const g = GLYPHS[spec.glyph];
    if (!g) throw new Error(`unknown glyph ${spec.glyph}`);
    const s = box.w / 100;
    return `<g transform="translate(${box.x - box.w / 2} ${box.y - box.h / 2 + (box.h - box.w) / 2}) scale(${s})" filter="url(#iconShadow)">${g}</g>`;
  }
  const iconPath = join(root, 'assets/sprites/icons', `${spec.icon}.png`);
  const png = readFileSync(iconPath);
  const w = png.readUInt32BE(16);
  const h = png.readUInt32BE(20);
  const scale = Math.min(box.w / w, box.h / h, spec.maxScale || 2.4);
  const dw = w * scale;
  const dh = h * scale;
  return `<image href="data:image/png;base64,${png.toString('base64')}" x="${(box.x - dw / 2).toFixed(2)}" y="${(box.y + box.h / 2 - dh).toFixed(2)}" width="${dw.toFixed(2)}" height="${dh.toFixed(2)}" filter="url(#iconShadow)"/>`;
}

/** Giant emblem medallion at the upper left, as on the Hi-Sign badge series. */
function emblemMarkup(name) {
  const png = readFileSync(join(root, 'assets/sprites/icons', `${name}.png`));
  const w = png.readUInt32BE(16);
  const h = png.readUInt32BE(20);
  const s = Math.min(48 / w, 48 / h);
  return `<g filter="url(#iconShadow)">
    <circle cx="38" cy="38" r="28" fill="#2f2a4a" stroke="#f4f0e6" stroke-width="3.5"/>
    <circle cx="38" cy="38" r="24.5" fill="url(#emblemSky)"/>
    <image href="data:image/png;base64,${png.toString('base64')}" x="${(38 - (w * s) / 2).toFixed(2)}" y="${(38 - (h * s) / 2).toFixed(2)}" width="${(w * s).toFixed(2)}" height="${(h * s).toFixed(2)}"/>
  </g>`;
}

function seriesTier(def) {
  const n = Number(def.conditions?.[0]?.num || 0);
  const words = `${def.classTsid} ${def.name}`.toLowerCase();
  if (/novice|entry|first|apprentice|beginner|1star|amateur/.test(words)) return 0;
  if (/intermediate|journeyman|2star|second|betterthan|about_average/.test(words)) return 1;
  if (/expert|advanced|3star|pro\b|notquitepro|senior/.test(words)) return 2;
  if (/master|4star|tycoon|chief|executive/.test(words)) return 3;
  if (/legend|grand|5star|supreme|ultimate|record|highest/.test(words)) return 4;
  if (n >= 1000) return 4;
  if (n >= 200) return 3;
  if (n >= 60) return 2;
  if (n >= 20) return 1;
  return 0;
}

export function designFor(id) {
  const def = catalog[id] || { classTsid: id, name: id, category: '' };
  const override = specs.badges?.[id] || {};
  const firstCond = def.conditions?.length === 1 ? def.conditions[0] : null;
  const autoIcon = firstCond && existsSync(join(root, 'assets/sprites/icons', `${firstCond.name}.png`))
    ? firstCond.name
    : specs.categoryIcons?.[def.category] || null;
  const tier = override.tier ?? seriesTier(def);
  return {
    id,
    name: def.name,
    category: def.category,
    disc: override.disc || CATEGORY_DISC[def.category] || 'slate',
    rim: override.rim || TIER_RIMS[tier],
    tier,
    number: override.number ?? (firstCond ? String(firstCond.num) : ''),
    deco: override.deco || (tier >= 3 ? 'stars' : 'laurel'),
    icon: override.glyph ? null : override.icon || autoIcon,
    glyph: override.glyph || (autoIcon ? null : 'padlock'),
    accentStar: Boolean(override.accentStar),
    emblem: override.emblem || null,
    topStar: Boolean(override.topStar),
    subject: override.subject || '',
  };
}

export function badgeSvg(d) {
  const disc = DISCS[d.disc] || DISCS.slate;
  const rim = rimDefs(d.rim, d.id);
  const num = String(d.number || '');
  const fontSize = num.length <= 2 ? 40 : num.length === 3 ? 37 : num.length === 4 ? 33 : 28;
  const hasNum = num.length > 0;
  const iconBox = hasNum ? { x: 90, y: 112, w: 96, h: 72 } : { x: 90, y: 94, w: 104, h: 92 };
  const decoY = 48;
  const halfText = (fontSize * 0.56 * Math.max(num.length, 1)) / 2;
  const decoX = Math.max(halfText + 22, 40);
  const deco = !hasNum
    ? ''
    : d.deco === 'stars'
      ? star(90 - decoX + 6, decoY + 4, 8.5) + star(90 + decoX - 6, decoY + 4, 8.5)
      : sprig(90 - decoX, decoY, false, disc.leaf, disc.dark) + sprig(90 + decoX, decoY, true, disc.leaf, disc.dark);
  const inkStroke = disc.inkStroke || 'none';
  const numberText = hasNum
    ? `<g font-family="'Arial Rounded MT Bold','Arial Rounded MT','Arial',sans-serif" font-weight="700" font-size="${fontSize}" text-anchor="middle" letter-spacing="${num.length >= 4 ? -1 : 0}">
        <text x="90" y="${63 + 1.6}" fill="#ffffff" opacity="0.55">${num}</text>
        <text x="90" y="63" fill="${disc.ink}" stroke="${inkStroke}" stroke-width="${inkStroke === 'none' ? 0 : 2}" paint-order="stroke">${num}</text>
      </g>`
    : '';
  const accent = d.accentStar ? star(126, 128, 14, '#ffe36b', '#8a5a00') : '';
  const emblem = d.emblem ? emblemMarkup(d.emblem) : '';
  const topStar = d.topStar ? star(118, 44, 13, '#ffd640', '#8a5a00') : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 180 180">
  <defs>
    ${rim.defs}
    <clipPath id="rimClip"><circle cx="90" cy="90" r="88"/></clipPath>
    <radialGradient id="disc" cx="48%" cy="36%" r="66%">
      <stop offset="0" stop-color="${disc.light}"/>
      <stop offset="0.55" stop-color="${disc.base}"/>
      <stop offset="1" stop-color="${disc.dark}"/>
    </radialGradient>
    <linearGradient id="gloss" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.6"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="bottomGlow" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0.35"/>
    </linearGradient>
    <radialGradient id="emblemSky" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#5d5790"/><stop offset="1" stop-color="#26213f"/></radialGradient>
    <linearGradient id="gShoe" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#d9dce6"/></linearGradient>
    <linearGradient id="gGold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffe789"/><stop offset="0.5" stop-color="#e8b93a"/><stop offset="1" stop-color="#b9851c"/>
    </linearGradient>
    <filter id="iconShadow" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="2.5" stdDeviation="2" flood-color="#000000" flood-opacity="0.38"/>
    </filter>
    <filter id="rimShade" x="-10%" y="-10%" width="120%" height="120%">
      <feGaussianBlur stdDeviation="1.4"/>
    </filter>
  </defs>
  <circle cx="90" cy="90" r="88.5" fill="${rim.fill}"/>
  ${rim.overlay}
  <circle cx="90" cy="90" r="88.5" fill="none" stroke="#000000" stroke-opacity="0.16" stroke-width="1"/>
  <circle cx="90" cy="92" r="75" fill="#000000" opacity="0.28" filter="url(#rimShade)"/>
  <circle cx="90" cy="90" r="74.5" fill="#ffffff" opacity="0.7"/>
  <circle cx="90" cy="90" r="72.5" fill="${disc.dark}"/>
  <circle cx="90" cy="90" r="70.5" fill="url(#disc)"/>
  <circle cx="90" cy="90" r="67" fill="none" stroke="${disc.dark}" stroke-opacity="0.35" stroke-width="5"/>
  <path d="M 32 118 A 64 64 0 0 0 148 118 A 70 70 0 0 1 32 118 Z" fill="url(#bottomGlow)"/>
  <ellipse cx="90" cy="54" rx="56" ry="32" fill="url(#gloss)" opacity="0.75"/>
  ${deco}
  ${numberText}
  <ellipse cx="90" cy="${iconBox.y + iconBox.h / 2 - 2}" rx="${iconBox.w * 0.34}" ry="5" fill="${disc.dark}" opacity="0.28"/>
  ${iconMarkup(d, iconBox)}
  ${accent}
  ${topStar}
  ${emblem}
</svg>`;
}

async function render(designs, outDir) {
  mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 180, height: 180 }, deviceScaleFactor: 1 });
  for (const d of designs) {
    await page.setContent(`<html><body style="margin:0;background:transparent">${badgeSvg(d)}</body></html>`);
    await page.evaluate(() => document.fonts.ready);
    await page.locator('svg').screenshot({ path: join(outDir, `${d.id}.png`), omitBackground: true });
  }
  await browser.close();
}

const ids = only.length
  ? only
  : previewDir
    ? Object.keys(catalog)
    : Object.keys(catalog).filter((id) => !official[id]);
const designs = ids.map(designFor);

if (previewDir) {
  await render(designs, previewDir);
  console.log(`preview: ${designs.length} badges -> ${previewDir}`);
} else {
  const targets = designs.filter((d) => !official[d.id]);
  await render(targets, join(root, 'assets/badges'));
  const manifest = {};
  for (const d of targets) {
    manifest[d.id] = {
      path: `assets/badges/${d.id}.png`,
      generated: true,
      subject: d.subject || (d.icon ? `icon:${d.icon}` : `glyph:${d.glyph}`),
    };
  }
  writeFileSync(
    join(root, 'assets/content/badge-icons-generated.json'),
    JSON.stringify(manifest, null, 1) + '\n'
  );
  console.log(`generated: ${targets.length} reimagined badges (official kept: ${Object.keys(official).length})`);
}
