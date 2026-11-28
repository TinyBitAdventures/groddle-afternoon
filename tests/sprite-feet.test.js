// R12 (G490, G515, G583, G510, G544, G650, G492, G516): things stand on the ground. Every sprite
// placed on a point stands on its art's measured foot (js/sprite-feet.js standOnFeet, from
// tools/sprite-feet/build.mjs), or says why it keeps its cell's plain bottom centre.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = join(import.meta.dirname, '..');
const pub = join(root, 'public');

function jsFiles(dir, out = []) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) jsFiles(p, out);
    else if (/\.m?js$/.test(ent.name)) out.push(p);
  }
  return out;
}

/** The game's code lines (comments dropped), with their file and line. */
function codeLines() {
  const files = [join(pub, 'game.js'), ...jsFiles(join(pub, 'js'))];
  const out = [];
  for (const f of files) {
    const rel = relative(pub, f);
    readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      const t = line.trim();
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;
      out.push({ rel, n: i + 1, line: line.replace(/\s\/\/.*$/, '') });
    });
  }
  return out;
}

// A hand-written bottom centre (or a hand-guessed foot just above it).
const HAND_FOOT = [
  /\banchor\.set\(\s*0\.5\s*,\s*(?:1(?:\.0+)?|0\.9\d*)\s*\)/,
  /\banchor\.y\s*=\s*(?:1(?:\.0+)?|0\.9\d*)\s*;/,
  /\banchor\s*:\s*\{\s*x\s*:\s*0\.5\s*,\s*y\s*:\s*(?:1(?:\.0+)?|0\.9\d*)\s*\}/,
];

test('no sprite is anchored on a hand-written bottom centre: standOnFeet, or anchorBottomCentre with a reason', () => {
  const found = codeLines()
    .filter(({ line }) => HAND_FOOT.some((re) => re.test(line)))
    .map(({ rel, n, line }) => `${rel}:${n}: ${line.trim()}`);
  assert.deepEqual(found, [], 'use standOnFeet(sprite) (js/sprite-feet.js), or anchorBottomCentre(obj, why) for text, decos and the like');
});

test('every anchorBottomCentre names one of the reasons', async () => {
  const { BOTTOM_CENTRE } = await import('../public/js/sprite-feet.js?v=1c6452d9');
  const calls = codeLines().filter(({ rel, line }) => rel !== 'js/sprite-feet.js' && /\banchorBottomCentre\(/.test(line));
  assert.ok(calls.length > 50, `found ${calls.length}`);
  const bad = calls
    .filter(({ line }) => !new RegExp(`anchorBottomCentre\\([^,]+, '(${Object.keys(BOTTOM_CENTRE).join('|')})'\\)`).test(line))
    .map(({ rel, n, line }) => `${rel}:${n}: ${line.trim()}`);
  assert.deepEqual(bad, []);
  const feet = codeLines().filter(({ rel, line }) => rel !== 'js/sprite-feet.js' && /\bstandOnFeet\(/.test(line));
  assert.ok(feet.length > 100, `standOnFeet at ${feet.length} sites`);
});

// The walkers' + 2 (and the eyeballed + 1 to + 8 on mailboxes, boards, boxes, Rube, bots) made up
// for the cells' blank rows; on its measured feet a sprite stands on its line, as the client put an
// item's registration on its y (LocationItemstackView.as 853-854). Offsets that stay say why.
const KEPT_OFFSETS = [
  [/^game\.js: sprite\.position\.set\(hall\.shrineStand\.x, ROOK_MUSEUM_WORLD\.floorY - stand\.h \+ 83\)/, 'the speaker sits on its stand: the stand\'s height, not a gap'],
  [/^js\/features\/newxp-feature\.js: egg\.y = L\.eggPlant\.y \+ 2;/, 'trees stand 2 px into their line (js/enchanted-forests.js grimssea, measured on the snap)'],
  [/^js\/features\/enchanted-forest-feature\.js: sprite\.y = entity\.y \+ 2;/, 'trees stand 2 px into their line (the same snap)'],
  [/^js\/features\/giant-icons-feature\.js: spr\.y = row\.y \+ 2;/, 'world art is not measured (trimmed to its SWF state): nothing to make up for'],
  [/^js\/features\/hell-feature\.js: graveSprite\.y = marker\.y \+ 29;/, 'the source raises the grave marker 29 px above the croak point'],
  [/^js\/features\/graves-mp-feature\.js: sprite\.y = g\.y \+ 29;/, 'another player\'s grave, raised 29 px above the croak point as hell-feature\'s own'],
];

test('nothing on its measured feet is pushed into its line by hand (R12: the walkers\' + 2 and the like)', () => {
  const lines = codeLines();
  const found = [];
  lines.forEach(({ rel, line }, i) => {
    const m = /standOnFeet\(([\w.]+)\)/.exec(line);
    if (!m || rel === 'js/sprite-feet.js') return;
    const v = m[1].replace(/\./g, '\\.');
    const set = new RegExp(`^\\s*${v}\\.(?:y\\s*=|position\\.set\\().*\\+\\s*[1-9]\\d*\\s*(?:\\)|;)`);
    for (let j = i + 1; j < Math.min(lines.length, i + 16) && lines[j].rel === rel; j += 1) {
      if (set.test(lines[j].line)) found.push(`${rel}: ${lines[j].line.trim()}`);
    }
  });
  const left = found.filter((f) => !KEPT_OFFSETS.some(([re]) => re.test(f)));
  assert.deepEqual(left, [], 'stand it on its line, or list why the offset stays');
  for (const [re, why] of KEPT_OFFSETS) assert.ok(found.some((f) => re.test(f)), `unused allowance: ${why}`);
  // The walkers: the floor they follow, their spawns, a Chicken landing from a scare, a yard animal.
  const read = (p) => readFileSync(join(pub, p), 'utf8');
  // #497: the walkers' floor step lives in js/walk-surface.js walkerFloorY (no offset added there either).
  assert.match(read('game.js'), /function followWalkFloor[\s\S]{0,900}spr\.y = walkerFloorY\(streetPlatforms, spr\.x, spr\.y, dt\);/);
  assert.match(read('js/walk-surface.js'), /export function walkerFloorY[\s\S]{0,900}const d = near - y;/);
  assert.doesNotMatch(read('js/features/chicken-scare-feature.js'), /f\.y \+ 2|floor \+ 2/);
  assert.doesNotMatch(read('js/yard-wander.js'), /floor \+ 2/);
});

test('footOf reads the measured foot for the cut, and the bottom centre for anything else', async () => {
  const { footOf, feetKey } = await import('../public/js/sprite-feet.js?v=1c6452d9');
  const { SPRITE_FEET } = await import('../public/js/sprite-feet-data.js?v=e2217323');
  assert.deepEqual(footOf('assets/sprites/nothing-here.webp'), { x: 0.5, y: 1 });
  assert.equal(feetKey('https://x.test/assets/sprites/a.webp?v=3'), 'assets/sprites/a.webp');
  // A file cut at another size than the builder measured is not that measurement.
  assert.deepEqual(footOf('assets/sprites/npc_chicken__x1_walk_png_1354830385.webp', { width: 74, height: 55 }), { x: 0.5, y: 1 });
  // A routed 3x name finds its 1x file; a whole image before it loads (no cell yet) takes its one cut.
  const [cw, ch, fx, fy] = SPRITE_FEET['assets/sprites/trants/frames/trant_spice_m1.webp'];
  assert.deepEqual(footOf('assets/sprites/trants/frames/trant_spice_m1@3x.webp'), { x: fx / cw, y: fy / ch });
  // Hovering art stands on its own shadow (the door-drink portal floats over it).
  const [pw, ph, , py] = SPRITE_FEET['assets/sprites/door-drink/portal_sheet.webp'];
  assert.ok(py > ph * 0.9 && pw > 0, `portal foot ${py} of ${ph}`);
});

test('standOnFeet anchors on the art and follows a clip or picture swap', async () => {
  // A small stand-in for Pixi: sources and textures as js/textures.js makes them.
  class ImageSource { constructor(o) { Object.assign(this, o); } }
  class Texture { constructor({ source, frame }) { this.source = source; this.orig = frame || { width: 1, height: 1 }; } }
  globalThis.PIXI = { ImageSource, Texture };
  const { sourceFromUrl, frameTexture, textureFromUrl } = await import('../public/js/textures.js?v=8bb43102');
  const { standOnFeet, anchorBottomCentre } = await import('../public/js/sprite-feet.js?v=1c6452d9');
  const anchor = () => ({ x: 0, y: 0, set(x, y) { this.x = x; this.y = y; } });
  class Sprite {
    constructor(t) { this.anchor = anchor(); this._t = t; }
    get texture() { return this._t; }
    set texture(v) { this._t = v; }
  }
  class Animated extends Sprite {
    constructor(list) { super(list[0]); this._list = list; }
    get textures() { return this._list; }
    set textures(v) { this._list = v; this._t = v[0]; }
  }
  const cell = (url, w, h) => frameTexture(sourceFromUrl(url), { x: 0, y: 0, width: w, height: h });
  const walk = cell('assets/sprites/npc_chicken__x1_walk_png_1354830385.webp', 148, 110);
  const peck = cell('assets/sprites/npc_chicken__x1_pecking_once_png_1354830398.webp', 148, 110);
  const bird = standOnFeet(new Animated([walk]));
  assert.ok(Math.abs(bird.anchor.y * 110 - 96) < 1e-9 && Math.abs(bird.anchor.x * 148 - 101.5) < 1e-9);
  bird.textures = [peck];
  assert.ok(Math.abs(bird.anchor.y * 110 - 98) < 1e-9, 'the peck clip stands on its own feet');
  assert.ok(Math.abs(bird.anchor.x * 148 - 101.5) < 1e-9, 'and keeps the bird where it was');
  const tree = standOnFeet(new Sprite(textureFromUrl('assets/sprites/trants/frames/trant_spice_m1.webp')));
  assert.ok(Math.abs((1 - tree.anchor.y) * 250 - 36) < 1e-9);
  tree.texture = textureFromUrl('assets/sprites/trants/frames/trant_spice_m10.webp');
  assert.ok(Math.abs((1 - tree.anchor.y) * 250 - 6) < 1e-9, 'a grown tree re-reads its foot');
  const label = anchorBottomCentre({ anchor: anchor() }, 'text');
  assert.deepEqual([label.anchor.x, label.anchor.y], [0.5, 1]);
  assert.throws(() => anchorBottomCentre({ anchor: anchor() }, 'because'));
  delete globalThis.PIXI;
});

test('js/sprite-feet-data.js is up to date with the art and the sheets (tools/sprite-feet/build.mjs --check)', (t) => {
  try {
    execFileSync('node', [join(root, 'tools/sprite-feet/build.mjs'), '--check'], { encoding: 'utf8', stdio: 'pipe', timeout: 300000 });
  } catch (err) {
    const why = String(err.stderr || err);
    // No Pillow here, or a sparse checkout without some art: nothing to measure against.
    if (err.status === 2 || /ENOENT|No module named/.test(why)) return t.skip(why.trim().split('\n').pop());
    throw new Error(why);
  }
});
