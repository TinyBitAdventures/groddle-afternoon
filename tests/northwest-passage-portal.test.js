/**
 * Northwest Passage's wintry portal (Austin 2026-10-31, live v0.6.0: "You can jump into this
 * snow and get stuck"). Two faults met at one spot, x -2400 y -791 on GLI23D3LDHD1FQA:
 *
 * - The drawing. portal_wintry (groddle1.swf) is a white rectangle (alpha 189) with a
 *   rectangle-with-an-oval-hole erased from it (PlaceObject3 blend mode 12, Erase), blurred,
 *   with snowflakes falling inside. FFDec, which renders the animated strips, skips the Erase
 *   child, so the strip was the whole translucent rectangle: a pale box over the street.
 *   tools/deco-pipeline/animate.py now renders an erasing deco twice (as drawn, and with the
 *   eraser drawn normally) and cuts what the eraser covers (unerase()).
 * - The trap. The portal sits in a cage Tiny Speck built: two one-way walls (wall_1288127872349
 *   pc_perm 1 and wall_1288127892296 pc_perm -1) that let a player in and not out, over the soft
 *   line _pl1288127904595 (pc_perm 0). v0.6.0 stood the avatar on pc_perm 0 lines, so a Big 'Un
 *   triple jump landed you on the cage floor with no way out. The client never stands a player
 *   on a pc_perm 0 line (a531c873e, tests/soft-lines.test.js); this pins the cage itself.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { barriersScreen, platformsScreen, worldToScreen, streetWidth } from '../public/js/street-model.js?v=23b926e5';
import { avatarGround, stepAvatar, JUMP_SPEED } from '../public/js/avatar-step.js?v=c04c7c76';
import { rawTripleJumpMultiplier, scaledTripleJumpMultiplier, TRIPLE_JUMP_UPGRADES } from '../public/js/movement.js?v=a314f8a1';

const root = join(import.meta.dirname, '..');
const python = '/opt/homebrew/bin/python3.11';
const street = JSON.parse(readFileSync(join(root, 'public/assets/streets/GLI23D3LDHD1FQA.json'), 'utf8'));
const animDir = join(root, 'public/assets/decos/animated');

function world() {
  const platforms = platformsScreen(street);
  const barriers = barriersScreen(street);
  const bottom = platforms.reduce((m, p) => Math.max(m, p.y1, p.y2), 0);
  return {
    platforms,
    barriers,
    worldW: streetWidth(street),
    ground: (x, y, vy) => avatarGround(platforms, x, y, vy, { street, bottom }),
  };
}

/** Run frames of the stepper; `dir` steers each frame. Returns the body. */
function run(body, w, frames, dir = 0) {
  for (let f = 0; f < frames; f++) {
    if (dir) body.vx = Math.max(-4.4, Math.min(4.4, body.vx + 0.58 * dir));
    else body.vx = 0;
    stepAvatar(body, { platforms: w.platforms, barriers: w.barriers, worldW: w.worldW, ground: w.ground });
  }
  return body;
}

describe("Northwest Passage's wintry portal", () => {
  const cage = worldToScreen(street, -2447, -1059);
  const cageRight = worldToScreen(street, -2358, -859);
  const walkway = worldToScreen(street, -2400, -700).y;

  it('the archive builds the cage: one-way walls around a soft line under the portal', () => {
    const deco = street.layers.find((l) => l.id === 'middleground').decos.find((d) => d.sprite === 'portal_wintry');
    assert.deepEqual([deco.x, deco.y, deco.w, deco.h, deco.animated], [-2400, -791, 208, 270, true]);
    const walls = Object.fromEntries(street.barriers.map((b) => [b.id, b]));
    assert.equal(walls.wall_1288127872349.pc_perm, 1);
    assert.equal(walls.wall_1288127892296.pc_perm, -1);
    assert.equal(street.platforms.find((p) => p.id === '_pl1288127904595').pc_perm, 0);
  });

  it('a Big \'Un triple jump from the walkway reaches into the cage', () => {
    const w = world();
    const mult = scaledTripleJumpMultiplier(rawTripleJumpMultiplier(0, 1), TRIPLE_JUMP_UPGRADES[2].multiplier);
    const body = { x: (cage.x + cageRight.x) / 2, y: walkway, vx: 0, vy: JUMP_SPEED * mult, onGround: false };
    let top = body.y;
    for (let f = 0; f < 120; f++) {
      run(body, w, 1);
      top = Math.min(top, body.y);
    }
    assert.ok(top < cageRight.y, `the feet rise over the cage floor (${top.toFixed(0)} < ${cageRight.y})`);
    assert.ok(Math.abs(body.y - walkway) < 2 && body.onGround, `and land back on the walkway, not the cage floor (${body.y.toFixed(0)})`);
  });

  it('an avatar inside the cage falls through its floor and walks out either way', () => {
    const w = world();
    for (const dir of [-1, 1]) {
      const body = run({ x: (cage.x + cageRight.x) / 2, y: cageRight.y - 10, vx: 0, vy: 0, onGround: false }, w, 90);
      assert.ok(Math.abs(body.y - walkway) < 2 && body.onGround, `fell to the walkway (${body.y.toFixed(0)})`);
      run(body, w, 60, dir);
      assert.ok(dir < 0 ? body.x < cage.x - 40 : body.x > cageRight.x + 40, `walked out ${dir < 0 ? 'left' : 'right'} (${body.x.toFixed(0)})`);
    }
  });
});

describe('animated decos draw Flash\'s Erase blend (portal_wintry)', () => {
  const hasPython = existsSync(python);

  it('animate.py records the one eraser in animated.json', () => {
    const plan = JSON.parse(readFileSync(join(root, 'tools/deco-pipeline/animated.json'), 'utf8'));
    const erasing = plan.decos.filter((r) => r.erase).map((r) => [r.name, r.erase]);
    assert.deepEqual(erasing, [['portal_wintry', 1]]);
  });

  it('unerase() cuts what the eraser covers from a translucent layer', { skip: !hasPython && 'needs python3.11' }, () => {
    const code = `
import sys, json
sys.path.insert(0, sys.argv[1]); sys.dont_write_bytecode = True
import numpy as np
from PIL import Image
import animate
layer = np.zeros((1, 4, 4), np.uint8); layer[..., :3] = 255; layer[..., 3] = 189
drawn = layer.copy()
# The eraser drawn normally (opaque): over none, half, all and none of the four pixels.
for i, c in enumerate([0, 0.5, 1, 0]):
    drawn[0, i, 3] = round(189 * (1 - c) + 255 * c)
out = np.asarray(animate.unerase(Image.fromarray(layer, 'RGBA'), Image.fromarray(drawn, 'RGBA')))
print(json.dumps(out[0, :, 3].tolist()))
`;
    const alpha = JSON.parse(execFileSync(python, ['-I', '-c', code, join(root, 'tools/deco-pipeline')], { encoding: 'utf8' }));
    for (const [i, want] of [189, 95, 0, 189].entries()) assert.ok(Math.abs(alpha[i] - want) <= 1, `pixel ${i}: alpha ${alpha[i]}, want ${want}`);
  });

  it('every frame of the strip is an oval: corners clear, the middle the portal\'s pale white', { skip: !hasPython && 'needs python3.11' }, () => {
    const code = `
import sys, json
from PIL import Image
d = json.load(open(sys.argv[1] + '/portal_wintry.json'))
s = d['strips'][0]
im = Image.open(sys.argv[1] + '/' + s['file']).convert('RGBA')
W, H = round(d['size'][0] * s['res']), round(d['size'][1] * s['res'])
rows = []
for r in s['rects']:
    x, y, w, h, ox, oy = r
    f = Image.new('RGBA', (W, H)); f.paste(im.crop((x, y, x + w, y + h)), (ox, oy))
    a = f.getchannel('A')
    corners = [a.getpixel(p) for p in ((2, 2), (W - 3, 2), (2, H - 3), (W - 3, H - 3))]
    edges = [a.getpixel(p) for p in ((2, H // 2), (W - 3, H // 2), (W // 2, 2), (W // 2, H - 3))]
    rows.append([max(corners), max(edges), a.getpixel((W // 2 - 30, H // 2 + 20))])
print(json.dumps(rows))
`;
    const rows = JSON.parse(execFileSync(python, ['-I', '-c', code, animDir], { encoding: 'utf8' }));
    assert.equal(rows.length, 115);
    for (const [i, [corner, edge, middle]] of rows.entries()) {
      assert.equal(corner, 0, `frame ${i}: a corner is drawn (alpha ${corner}), the old rectangle`);
      assert.ok(edge < 40, `frame ${i}: the frame's edge is drawn (alpha ${edge})`);
      assert.ok(middle >= 170, `frame ${i}: the oval is missing (alpha ${middle})`);
    }
  });
});
