// Quest rooms (js/quest-rooms/kit.js deco) take a deco's sharp copy at the screen's density, as
// streets and home looks do (js/deco-hires.js sharpRoomDeco), and tools/deco-pipeline/sharp.py
// measures their placements (room_placements) so the copies exist. The Penalty Cell's trunk and
// bars drew 1.6 device px per texel from the 3x file on a 4x backing store.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
const plan = JSON.parse(readFileSync(join(root, 'tools/deco-pipeline/plan-sharp.json'), 'utf8'));
const rows = new Map(plan.decos.map((r) => [r.name, r]));
const url = (name) => `assets/decos/groddle/${name}.png`;

async function withRenderer(resolution, fn) {
  const hires = await import('../public/js/deco-hires.js?v=8dbbe0f7');
  const renderer = { resolution, gl: { MAX_TEXTURE_SIZE: 1, getParameter: () => 16384 } };
  hires.installHiresDecos({ addUrlRoute() {} }, { renderer: () => renderer });
  try {
    return fn(hires);
  } finally {
    hires.installHiresDecos({ addUrlRoute() {} }, { renderer: () => null });
  }
}

test("the Penalty Cell's trunk and bars take their sharp copies at R 4 and keep their files on a phone", async () => {
  await withRenderer(4, ({ sharpRoomDeco }) => {
    const trunk = sharpRoomDeco(url('penaltybox_trunk'), 0.62);
    assert.match(trunk.url, /^assets\/decos\/groddle\/penaltybox_trunk\.svg\?r=[\d.]+$/);
    assert.equal(trunk.opts.raw, true);
    // Rasterised at 4 x 0.62 / (4/3) texels per logical px or more, its logical size unchanged.
    assert.ok(trunk.opts.resolution >= (4 * 0.62) / (4 / 3) - 1e-3, `${trunk.opts.resolution}`);
    const bar = sharpRoomDeco(url('penaltybox_bar_1'), 0.62);
    assert.ok(bar && bar.url !== 'assets/decos/groddle/penaltybox_bar_1@1.5x.webp', bar?.url);
  });
  await withRenderer(1, ({ sharpRoomDeco }) => {
    assert.equal(sharpRoomDeco(url('penaltybox_trunk'), 0.62), null);
    assert.equal(sharpRoomDeco(url('penaltybox_bar_1'), 0.62), null);
  });
});

test('no sharp copy before the renderer starts, nor for a file outside the deco folder', async () => {
  const { sharpRoomDeco } = await import('../public/js/deco-hires.js?v=8dbbe0f7');
  assert.equal(sharpRoomDeco(url('penaltybox_trunk'), 0.62), null);
  await withRenderer(4, ({ sharpRoomDeco: pick }) => {
    assert.equal(pick('assets/sprites/icons/apple.webp', 2), null);
  });
});

test('kit.deco asks for the sharp copy at its own scale and keeps the sprite at that scale', () => {
  const kit = readFileSync(join(pub, 'js/quest-rooms/kit.js'), 'utf8');
  assert.match(kit, /import \{ sharpRoomDeco \} from '\.\.\/deco-hires\.js\?v=[0-9a-f]+';/);
  assert.match(kit, /const sharp = sharpRoomDeco\(url, Math\.max\(Math\.abs\(s\), Math\.abs\(opts\.sy \?\? s\)\)\);/);
  assert.match(kit, /new PIXI\.Sprite\(sharp \? textureFromUrl\(sharp\.url, sharp\.opts\) : textureFromUrl\(url\)\)/);
  assert.match(kit, /spr\.scale\.set\(opts\.flip \? -s : s, opts\.sy \?\? s\);/);
});

test('sharp.py measures the quest rooms: every hard-edged blurry room deco has its copy', async () => {
  const { HIRES_DECOS } = await import('../public/js/deco-hires-list.js?v=60fcf361');
  const out = execFileSync('/opt/homebrew/bin/python3.11', ['-I', '-c', [
    'import sys, json',
    "sys.argv = ['x']",
    "sys.path.insert(0, 'tools/deco-pipeline')",
    'import sharp, build',
    "plan = build.read_plan()['decos']",
    'print(json.dumps(sharp.room_placements(plan)))',
  ].join('\n')], { cwd: root, encoding: 'utf8' });
  const placements = JSON.parse(out);
  const penalty = placements.filter((p) => p.street === 'quest room penalty').map((p) => p.sprite);
  for (const name of ['penaltybox_trunk', 'penaltybox_bar_1', 'penaltybox_bar_2', 'penaltybox_cell_background', 'penaltybox_roof']) assert.ok(penalty.includes(name), name);
  const notSharp = new Set([...plan.soft, ...plan.skipped].map((r) => r.name));
  const counted = new Set();
  for (const p of placements) {
    if (notSharp.has(p.sprite)) continue;
    const r = rows.get(p.sprite);
    if (!r) continue;
    const per = Math.max(p.w / r.size2[0], p.h / r.size2[1]);
    // sharp.py: view px x R 4 over the texels of the file loaded there (3x where there is one).
    if ((4 * per) / (HIRES_DECOS.has(p.sprite) ? 1.5 : 1) < plan.settings.ratio_min) continue;
    assert.ok(r.sh >= per - 1e-3, `${p.tsid}: ${p.sprite} at ${per} (sh ${r.sh})`);
    counted.add(p.sprite);
  }
  assert.ok(counted.has('penaltybox_trunk') && counted.size >= 15, `${counted.size} room decos sharp`);
});
