/**
 * Procedural looks for the house wallpaper / floor / ceiling swatches.
 *
 * The source swatches lived in home_wallpaper.swf, which is not among the
 * recovered assets. Each visible swatch keeps its source key, name and
 * category (js/homes-catalog.js HOME_TEXTURE_CONFIGS) and is redrawn here as a
 * clean, seamless tile that matches its name: stucco, stripes, brick, wood,
 * carpet, stone and the novelty motifs. Browser only (canvas); the look tables
 * are plain data so tests can check every visible swatch has one.
 */

export const WALL_LOOKS = Object.freeze({
  '8bit': { type: 'pixel', base: '#8fd0f0', color: '#5aa83f' },
  lightbrown_stucco: { type: 'stucco', base: '#e3cfae' },
  brown_molding: { type: 'stucco', base: '#e3cfae', wainscot: '#9a7350' },
  color_brick: { type: 'brick', base: '#8d8a86', mortar: '#cfcac0' },
  creamy_stripes: { type: 'stripes', a: '#f1e4c6', b: '#e3d0a8' },
  blue_stripes: { type: 'rainbow', colors: ['#bfe3f2', '#a6d2ea', '#8fbfe0', '#a6d2ea'] },
  brown_boghouse: { type: 'planks', base: '#7b5537' },
  brown_stripes: { type: 'stripes', a: '#a07a55', b: '#8c6746' },
  brownbaseboard_molding: { type: 'stucco', base: '#57524f' },
  forest_papercut: { type: 'motif', base: '#d5e6c4', motif: 'mushroom', color: '#93b97c' },
  tealgreen_stucco: { type: 'stucco', base: '#2f6f6a' },
  darktealbaseboard_molding: { type: 'stucco', base: '#3a7a74', wainscot: '#1f4f4b' },
  dark_uralia: { type: 'motif', base: '#3b2f5c', motif: 'leaf', color: '#5a4a86' },
  grey_unfinished: { type: 'drywall', base: '#cbc6bb' },
  fabric_sky: { type: 'motif', base: '#9fd2ee', motif: 'cloud', color: '#ffffff' },
  lackblue_stucco: { type: 'stucco', base: '#7fb9b4' },
  tealgreen_molding: { type: 'stucco', base: '#7fb9b4', pillars: '#5e9893' },
  goldyellow_stucco: { type: 'stucco', base: '#e8c35a' },
  green_stripes: { type: 'stripes', a: '#bcd8a0', b: '#a1c582' },
  grey_brick: { type: 'brick', base: '#8f9294', mortar: '#c8c9c6' },
  grey_stripes: { type: 'stripes', a: '#c8c8c4', b: '#b0b0ad' },
  grey_stucco: { type: 'stucco', base: '#b8b6b1' },
  grey_molding: { type: 'stucco', base: '#b8b6b1', wainscot: '#8d8b87' },
  hell_fire: { type: 'motif', base: '#5a1d16', motif: 'flame', color: '#c4471f' },
  lime_stucco: { type: 'stucco', base: '#c6dc78' },
  blue_stucco: { type: 'stucco', base: '#8db8dc' },
  cave: { type: 'rock', base: '#5f6b4e', moss: '#86a456' },
  navy_stucco: { type: 'stucco', base: '#33446f' },
  navy_molding: { type: 'stucco', base: '#33446f', wainscot: '#1f2b4b' },
  olive_stucco: { type: 'stucco', base: '#8a8a4a' },
  orange_tiles: { type: 'tiles', base: '#e59a4a', grout: '#f4e2c4' },
  lightblue_stucco: { type: 'stucco', base: '#c3dce9' },
  babyblue_molding: { type: 'stucco', base: '#c3dce9', wainscot: '#8fb3c8' },
  bluepillar_molding: { type: 'stucco', base: '#c3dce9', pillars: '#9cc0d4' },
  kids_room: { type: 'motif', base: '#f3e6c8', motif: 'monster', color: '#86b86a' },
  yellowgreen_stucco: { type: 'stucco', base: '#a3bd70' },
  yellowgreen_molding: { type: 'stucco', base: '#a3bd70', wainscot: '#728c46' },
  pink_heart: { type: 'motif', base: '#f6c6d3', motif: 'heart', color: '#e7869f', stripes: '#f9d5de' },
  pink_stucco: { type: 'stucco', base: '#efbcc7' },
  purple_stripes: { type: 'stripes', a: '#a891c7', b: '#937bb5' },
  longred_brick: { type: 'brick', base: '#9c4a37', mortar: '#d9c3a8', long: true },
  red_darkcreepy: { type: 'panels', base: '#5a1e22', panel: '#3e1215' },
  rock_cave: { type: 'rock', base: '#7a7068' },
  heartred_stucco: { type: 'stucco', base: '#d9a3a6' },
  coralpillar_molding: { type: 'stucco', base: '#d9a3a6', pillars: '#c28084' },
  spaceship: { type: 'panels', base: '#9aa3ad', panel: '#7d8792', rivets: true },
  spanishred_stucco: { type: 'stucco', base: '#b5533c' },
  red_molding: { type: 'stucco', base: '#b5533c', wainscot: '#8a3a28' },
  star_darksky_wallpaper: { type: 'motif', base: '#1d2346', motif: 'star', color: '#f4e6a1' },
  sweetpuple_stucco: { type: 'stucco', base: '#b99cd3' },
  white_stars: { type: 'motif', base: '#f2f2ee', motif: 'star', color: '#c9cfe0', small: true },
  uralia_wallpaper: { type: 'motif', base: '#6b5b95', motif: 'leaf', color: '#9384c4' },
  white_stucco: { type: 'stucco', base: '#ecebe5' },
  creamybaseboard_molding: { type: 'stucco', base: '#ecebe5', wainscot: '#4f4b4a' },
  whitepillar_molding: { type: 'stucco', base: '#ecebe5', pillars: '#d3d0c6' },
  wooden_cave: { type: 'planks', base: '#6b4a2f', rough: true },
  red_brick: { type: 'brick', base: '#a8553c', mortar: '#e0cdb5' },
  yellow_boghouse: { type: 'planks', base: '#c9a35a' },
  sea_wallpaper: { type: 'motif', base: '#3e8fb0', motif: 'bubble', color: '#a6dcef' },
  yellow_cubimal: { type: 'motif', base: '#f3dc7c', motif: 'cube', color: '#d9b13c' },
  pink_cubimal: { type: 'motif', base: '#f3bfd0', motif: 'cube', color: '#d9879f' },
  bacon: { type: 'bacon' },
  rook_forest_line: { type: 'motif', base: '#e9e1cf', motif: 'tree', color: '#4a473f' },
  wooden_vege_broccoli: { type: 'motif', base: '#d9c49a', motif: 'broccoli', color: '#5f8f3a' },
  ioletoyageky: { type: 'motif', base: '#5b3f86', motif: 'star', color: '#d7b6ff' },
});

export const FLOOR_LOOKS = Object.freeze({
  bacon_floor: { type: 'bacon' },
  beige_carpet: { type: 'carpet', base: '#d8c7a2' },
  brown_boghouse_floor: { type: 'planks', base: '#6b4a2f', horizontal: true },
  darkuralia: { type: 'carpet', base: '#3b2f5c', fleck: '#5a4a86' },
  woodpanel_2: { type: 'planks', base: '#5e3d24', horizontal: true },
  grass_flower: { type: 'grass', base: '#77b04e', flowers: true },
  beige_carpet_blue: { type: 'carpet', base: '#8f99a6' },
  greystone_floor: { type: 'flagstone', base: '#8b8c89' },
  hell: { type: 'rock', base: '#5a1d16', moss: '#c4471f' },
  leopard_skin: { type: 'spots', base: '#e0b25e', spot: '#5b3b1c' },
  woodpanel_3_floor: { type: 'planks', base: '#c79a62', horizontal: true },
  marble_floor: { type: 'marble', base: '#ebe8e1' },
  marigold_carpet: { type: 'carpet', base: '#e0a93a' },
  metal_spaceship_floor: { type: 'panels', base: '#8d96a0', panel: '#737c87', rivets: true },
  moss: { type: 'grass', base: '#5f8a3e' },
  sea_sand_floor: { type: 'sand', base: '#e3cc94' },
  snow_leopard_skin: { type: 'spots', base: '#ece9e2', spot: '#77736b' },
  starter_crappy: { type: 'concrete', base: '#a39d93' },
  uralia_floor: { type: 'grass', base: '#6b5b95' },
  ioletoyage: { type: 'carpet', base: '#5b3f86', fleck: '#8a6cc0' },
  wood_cave_floor: { type: 'planks', base: '#7a5c40', horizontal: true, rough: true },
  whitewood_floor: { type: 'planks', base: '#e6dccb', horizontal: true },
  woodpanel: { type: 'planks', base: '#9a6a3f', horizontal: true },
});

export const CEILING_LOOKS = Object.freeze({
  bacon_ceiling: { type: 'bacon' },
  brown_boghouse_ceiling: { type: 'planks', base: '#6b4a2f', horizontal: true },
  darkconcrete: { type: 'concrete', base: '#5c5853' },
  dark_uraliaceiling: { type: 'motif', base: '#2e244a', motif: 'star', color: '#6d5aa0', small: true },
  vege_ceiling: { type: 'motif', base: '#bfe0f0', motif: 'cloud', color: '#ffffff' },
  grey_crappy_ceiling: { type: 'stucco', base: '#b8b6b1' },
  ceilingshell: { type: 'rock', base: '#4a1814', moss: '#a8391c' },
  lightblue_crappy: { type: 'stucco', base: '#bfdbe9' },
  orange_crappy: { type: 'stucco', base: '#e9b071' },
  pink_crappy: { type: 'stucco', base: '#efbcc7' },
  lime_crappy_ceiling: { type: 'stucco', base: '#cfe08a' },
  spaceship_ceiling: { type: 'panels', base: '#9aa3ad', panel: '#7d8792', rivets: true },
  dark_start: { type: 'motif', base: '#1d2346', motif: 'star', color: '#f4e6a1', small: true },
  turquoise_stucco: { type: 'stucco', base: '#62b9b0' },
  starter_crappy_ceiling: { type: 'concrete', base: '#8f8a82' },
  uralia_ceiling: { type: 'motif', base: '#5b4d86', motif: 'star', color: '#c8bbf0', small: true },
  ioletoyageceiling: { type: 'motif', base: '#4a3370', motif: 'star', color: '#d7b6ff', small: true },
  white_crappy: { type: 'stucco', base: '#ecebe5' },
  whitewood_ceiling: { type: 'planks', base: '#e6dccb', horizontal: true },
  wood: { type: 'planks', base: '#8f6340', horizontal: true },
  wood_cave: { type: 'planks', base: '#6b4a2f', horizontal: true, rough: true },
});

export const LOOKS = Object.freeze({ wall: WALL_LOOKS, floor: FLOOR_LOOKS, ceiling: CEILING_LOOKS });

export function lookFor(kind, key) {
  return LOOKS[kind]?.[key] || { type: 'stucco', base: '#c9c4ba' };
}

// ---------------------------------------------------------------------------
// Canvas painters (browser only)
// ---------------------------------------------------------------------------

function hexToRgb(hex) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function shade(hex, amount) {
  const [r, g, b] = hexToRgb(hex);
  const f = (c) => Math.max(0, Math.min(255, Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount))));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

/** Deterministic tiny PRNG so tiles never shimmer between rebuilds. */
function rng(seed) {
  let s = 0;
  for (const ch of String(seed)) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function speckle(ctx, w, h, base, rand, n = 900, amount = 0.07) {
  for (let i = 0; i < n; i += 1) {
    ctx.fillStyle = shade(base, (rand() - 0.5) * amount * 2);
    ctx.globalAlpha = 0.5;
    ctx.fillRect(rand() * w, rand() * h, 1 + rand() * 2, 1 + rand() * 2);
  }
  ctx.globalAlpha = 1;
}

function star(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

function heart(ctx, x, y, r) {
  ctx.beginPath();
  ctx.moveTo(x, y + r * 0.9);
  ctx.bezierCurveTo(x - r * 1.4, y - r * 0.1, x - r * 0.6, y - r * 1.1, x, y - r * 0.35);
  ctx.bezierCurveTo(x + r * 0.6, y - r * 1.1, x + r * 1.4, y - r * 0.1, x, y + r * 0.9);
  ctx.fill();
}

function motif(ctx, kind, x, y, r, color, rand) {
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  switch (kind) {
    case 'star':
      star(ctx, x, y, r);
      break;
    case 'heart':
      heart(ctx, x, y, r);
      break;
    case 'cloud':
      ctx.globalAlpha = 0.85;
      for (const [dx, dy, rr] of [[-r, 0, r * 0.7], [0, -r * 0.35, r], [r, 0, r * 0.75], [0, r * 0.25, r * 0.8]]) {
        ctx.beginPath();
        ctx.arc(x + dx, y + dy, rr, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      break;
    case 'bubble':
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      ctx.arc(x, y, r * 0.7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x - r * 0.25, y - r * 0.25, r * 0.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      break;
    case 'mushroom':
      ctx.beginPath();
      ctx.ellipse(x, y - r * 0.2, r, r * 0.6, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(x - r * 0.22, y - r * 0.2, r * 0.44, r * 0.9);
      break;
    case 'leaf':
      ctx.beginPath();
      ctx.ellipse(x, y, r * 0.45, r, (rand() - 0.5) * 1.2, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'flame':
      ctx.beginPath();
      ctx.moveTo(x, y - r * 1.3);
      ctx.quadraticCurveTo(x + r, y, x, y + r * 0.8);
      ctx.quadraticCurveTo(x - r, y, x, y - r * 1.3);
      ctx.fill();
      break;
    case 'cube':
      ctx.fillRect(x - r * 0.6, y - r * 0.6, r * 1.2, r * 1.2);
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillRect(x - r * 0.3, y - r * 0.25, r * 0.18, r * 0.18);
      ctx.fillRect(x + r * 0.12, y - r * 0.25, r * 0.18, r * 0.18);
      break;
    case 'monster':
      ctx.beginPath();
      ctx.ellipse(x, y, r * 0.8, r, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(x, y - r * 0.25, r * 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#333';
      ctx.beginPath();
      ctx.arc(x, y - r * 0.25, r * 0.12, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'tree':
      ctx.beginPath();
      ctx.moveTo(x, y - r * 1.4);
      ctx.lineTo(x + r * 0.8, y + r * 0.6);
      ctx.lineTo(x - r * 0.8, y + r * 0.6);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(x - r * 0.1, y + r * 0.6, r * 0.2, r * 0.5);
      break;
    case 'broccoli':
      for (const [dx, dy] of [[-0.45, 0], [0.45, 0], [0, -0.45]]) {
        ctx.beginPath();
        ctx.arc(x + dx * r, y + dy * r, r * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#9cbf6a';
      ctx.fillRect(x - r * 0.15, y + r * 0.2, r * 0.3, r * 0.8);
      break;
    default:
      ctx.beginPath();
      ctx.arc(x, y, r * 0.5, 0, Math.PI * 2);
      ctx.fill();
  }
}

function paintPlanks(ctx, w, h, look, rand) {
  const horizontal = look.horizontal === true;
  const count = 8;
  const size = (horizontal ? h : w) / count;
  for (let i = 0; i < count; i += 1) {
    ctx.fillStyle = shade(look.base, (rand() - 0.5) * 0.16);
    if (horizontal) ctx.fillRect(0, i * size, w, size);
    else ctx.fillRect(i * size, 0, size, h);
    // grain
    ctx.strokeStyle = shade(look.base, -0.18);
    ctx.globalAlpha = look.rough ? 0.35 : 0.18;
    for (let g = 0; g < 4; g += 1) {
      ctx.beginPath();
      if (horizontal) {
        const y = i * size + rand() * size;
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(w * 0.3, y + (rand() - 0.5) * 4, w * 0.7, y + (rand() - 0.5) * 4, w, y);
      } else {
        const x = i * size + rand() * size;
        ctx.moveTo(x, 0);
        ctx.bezierCurveTo(x + (rand() - 0.5) * 4, h * 0.3, x + (rand() - 0.5) * 4, h * 0.7, x, h);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = shade(look.base, -0.35);
    if (horizontal) {
      ctx.fillRect(0, i * size, w, 2);
      // staggered butt joints
      const jx = ((i * 0.37) % 1) * w;
      ctx.fillRect(jx, i * size, 2, size);
    } else {
      ctx.fillRect(i * size, 0, 2, h);
    }
  }
}

function paintBrick(ctx, w, h, look, rand) {
  ctx.fillStyle = look.mortar;
  ctx.fillRect(0, 0, w, h);
  const rows = 8;
  const bh = h / rows;
  const bw = look.long ? w / 2 : w / 4;
  for (let r = 0; r < rows; r += 1) {
    const off = r % 2 ? bw / 2 : 0;
    for (let x = -bw; x < w + bw; x += bw) {
      ctx.fillStyle = shade(look.base, (rand() - 0.5) * 0.22);
      ctx.fillRect(x + off + 2, r * bh + 2, bw - 4, bh - 4);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(x + off + 2, r * bh + 2, bw - 4, 3);
    }
  }
}

export function paintTile(kind, key, size = 256) {
  const look = lookFor(kind, key);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const w = size;
  const h = size;
  const rand = rng(`${kind}:${key}`);
  const base = look.base || '#c9c4ba';
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  switch (look.type) {
    case 'drywall': {
      speckle(ctx, w, h, base, rand, 700, 0.05);
      ctx.fillStyle = shade(base, 0.12);
      ctx.fillRect(w / 2 - 9, 0, 18, h);
      ctx.fillStyle = shade(base, -0.25);
      for (let y = 18; y < h; y += 48) {
        ctx.fillRect(18, y, 2, 2);
        ctx.fillRect(w - 20, y + 20, 2, 2);
      }
      break;
    }
    case 'stucco':
    case 'concrete':
      speckle(ctx, w, h, base, rand, look.type === 'concrete' ? 1400 : 1000, look.type === 'concrete' ? 0.1 : 0.06);
      if (look.type === 'concrete') {
        ctx.strokeStyle = shade(base, -0.2);
        ctx.globalAlpha = 0.4;
        ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
        ctx.globalAlpha = 1;
      }
      break;
    case 'stripes': {
      const n = 8;
      for (let i = 0; i < n; i += 1) {
        ctx.fillStyle = i % 2 ? look.b : look.a;
        ctx.fillRect((w / n) * i, 0, w / n, h);
      }
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      for (let i = 0; i < n; i += 2) ctx.fillRect((w / n) * i + 3, 0, 2, h);
      break;
    }
    case 'rainbow': {
      const n = 8;
      for (let i = 0; i < n; i += 1) {
        ctx.fillStyle = look.colors[i % look.colors.length];
        ctx.fillRect((w / n) * i, 0, w / n, h);
      }
      break;
    }
    case 'brick':
      paintBrick(ctx, w, h, look, rand);
      break;
    case 'tiles': {
      ctx.fillStyle = look.grout;
      ctx.fillRect(0, 0, w, h);
      const n = 4;
      for (let y = 0; y < n; y += 1) {
        for (let x = 0; x < n; x += 1) {
          ctx.fillStyle = shade(look.base, (rand() - 0.5) * 0.12);
          ctx.fillRect(x * (w / n) + 3, y * (h / n) + 3, w / n - 6, h / n - 6);
          ctx.fillStyle = 'rgba(255,255,255,0.22)';
          ctx.fillRect(x * (w / n) + 6, y * (h / n) + 6, w / n - 30, 4);
        }
      }
      break;
    }
    case 'planks':
      paintPlanks(ctx, w, h, look, rand);
      break;
    case 'rock': {
      for (let i = 0; i < 26; i += 1) {
        ctx.fillStyle = shade(base, (rand() - 0.5) * 0.3);
        ctx.beginPath();
        ctx.ellipse(rand() * w, rand() * h, 20 + rand() * 30, 14 + rand() * 20, rand() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
      if (look.moss) {
        ctx.fillStyle = look.moss;
        ctx.globalAlpha = 0.5;
        for (let i = 0; i < 14; i += 1) {
          ctx.beginPath();
          ctx.ellipse(rand() * w, rand() * h, 10 + rand() * 16, 5 + rand() * 8, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      break;
    }
    case 'panels': {
      const n = 2;
      for (let y = 0; y < n; y += 1) {
        for (let x = 0; x < n; x += 1) {
          ctx.fillStyle = look.panel;
          ctx.fillRect(x * (w / n) + 8, y * (h / n) + 8, w / n - 16, h / n - 16);
          ctx.fillStyle = 'rgba(255,255,255,0.12)';
          ctx.fillRect(x * (w / n) + 8, y * (h / n) + 8, w / n - 16, 3);
          if (look.rivets) {
            ctx.fillStyle = shade(base, 0.25);
            for (const [rx, ry] of [[14, 14], [w / n - 18, 14], [14, h / n - 18], [w / n - 18, h / n - 18]]) {
              ctx.beginPath();
              ctx.arc(x * (w / n) + rx, y * (h / n) + ry, 3, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      }
      break;
    }
    case 'motif': {
      if (look.stripes) {
        for (let i = 0; i < 8; i += 2) {
          ctx.fillStyle = look.stripes;
          ctx.fillRect((w / 8) * i, 0, w / 8, h);
        }
      }
      const cells = look.small ? 6 : 4;
      const cw = w / cells;
      for (let y = 0; y < cells; y += 1) {
        for (let x = 0; x < cells; x += 1) {
          const ox = (y % 2 ? cw / 2 : 0) + cw / 2;
          const r = (look.small ? 4 : 13) + rand() * (look.small ? 3 : 4);
          motif(ctx, look.motif, (x * cw + ox) % w, y * cw + cw / 2, r, look.color, rand);
        }
      }
      break;
    }
    case 'pixel': {
      const px = 16;
      for (let y = 0; y < h; y += px) {
        for (let x = 0; x < w; x += px) {
          const ground = y > h * 0.7;
          ctx.fillStyle = ground ? shade(look.color, (rand() - 0.5) * 0.2) : shade(base, (rand() - 0.5) * 0.06);
          ctx.fillRect(x, y, px, px);
        }
      }
      ctx.fillStyle = '#ffffff';
      for (const [cx, cy] of [[48, 48], [176, 96]]) {
        ctx.fillRect(cx, cy, 48, 16);
        ctx.fillRect(cx + 16, cy - 16, 16, 16);
      }
      break;
    }
    case 'bacon': {
      const n = 6;
      for (let i = 0; i < n; i += 1) {
        ctx.fillStyle = i % 2 ? '#b8473a' : '#e8b39a';
        ctx.beginPath();
        const y = (h / n) * i;
        ctx.moveTo(0, y);
        for (let x = 0; x <= w; x += 16) ctx.lineTo(x, y + Math.sin((x / w) * Math.PI * 4 + i) * 5);
        ctx.lineTo(w, y + h / n + 6);
        ctx.lineTo(0, y + h / n + 6);
        ctx.fill();
      }
      break;
    }
    case 'carpet':
      speckle(ctx, w, h, base, rand, 3500, 0.09);
      if (look.fleck) speckle(ctx, w, h, look.fleck, rand, 300, 0.05);
      break;
    case 'spots':
      speckle(ctx, w, h, base, rand, 1500, 0.06);
      for (let i = 0; i < 22; i += 1) {
        const x = rand() * w;
        const y = rand() * h;
        ctx.fillStyle = look.spot;
        ctx.beginPath();
        ctx.ellipse(x, y, 9 + rand() * 5, 7 + rand() * 4, rand() * 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = shade(base, -0.12);
        ctx.beginPath();
        ctx.ellipse(x, y, 4, 3, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'flagstone': {
      ctx.fillStyle = shade(base, -0.3);
      ctx.fillRect(0, 0, w, h);
      const rows = 4;
      for (let r = 0; r < rows; r += 1) {
        let x = r % 2 ? -40 : 0;
        while (x < w) {
          const sw = 50 + rand() * 50;
          ctx.fillStyle = shade(base, (rand() - 0.5) * 0.18);
          ctx.fillRect(x + 3, r * (h / rows) + 3, sw - 6, h / rows - 6);
          x += sw;
        }
      }
      break;
    }
    case 'marble': {
      speckle(ctx, w, h, base, rand, 600, 0.03);
      ctx.strokeStyle = shade(base, -0.2);
      ctx.globalAlpha = 0.45;
      for (let i = 0; i < 6; i += 1) {
        ctx.beginPath();
        let x = rand() * w;
        let y = 0;
        ctx.moveTo(x, y);
        while (y < h) {
          x += (rand() - 0.5) * 30;
          y += 20;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = shade(base, -0.1);
      ctx.strokeRect(0.5, 0.5, w / 2, h / 2);
      ctx.strokeRect(w / 2 + 0.5, h / 2 + 0.5, w / 2 - 1, h / 2 - 1);
      break;
    }
    case 'grass':
      speckle(ctx, w, h, base, rand, 2500, 0.15);
      if (look.flowers) {
        for (let i = 0; i < 18; i += 1) {
          ctx.fillStyle = ['#fff6c2', '#f3a7c0', '#ffffff', '#c9b6ff'][i % 4];
          ctx.beginPath();
          ctx.arc(rand() * w, rand() * h, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    case 'sand':
      speckle(ctx, w, h, base, rand, 2500, 0.08);
      ctx.fillStyle = '#f4ede0';
      for (let i = 0; i < 5; i += 1) {
        ctx.beginPath();
        ctx.ellipse(rand() * w, rand() * h, 5, 3, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    default:
      speckle(ctx, w, h, base, rand);
  }
  return canvas;
}
