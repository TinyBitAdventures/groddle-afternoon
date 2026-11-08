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
import { describe, it, mock } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { barriersScreen, platformsScreen, worldToScreen, streetWidth } from '../public/js/street-model.js?v=b6cb6a4e';
import { avatarGround, stepAvatar, JUMP_SPEED } from '../public/js/avatar-step.js?v=e8e9581f';
import { rawTripleJumpMultiplier, scaledTripleJumpMultiplier, TRIPLE_JUMP_UPGRADES } from '../public/js/movement.js?v=b30f84eb';
import { arrivalInTarget } from '../public/js/location-navigation.js?v=4be109b9';
import { inTeleporter, teleportersOn, PLAIN_JUMP_APEX } from '../public/js/hidden-floors.js?v=eb220641';
import { hiddenFloorsFeature } from '../public/js/features/hidden-floors-feature.js?v=f10cb41f';
import {
  NORTHWEST_PASSAGE_TSID,
  WINTRY_CAGE,
  WINTRY_PLACE_TSID,
  WINTRY_PORTAL_OBJREF,
  WINTRY_PORTAL_TELEPORTERS,
  wintryPortalTeleportersOn,
} from '../public/js/wintry-portal.js?v=1437deda';

const root = join(import.meta.dirname, '..');
const python = '/opt/homebrew/bin/python3.11';
const street = JSON.parse(readFileSync(join(root, 'public/assets/streets/GLI23D3LDHD1FQA.json'), 'utf8'));
const animDir = join(root, 'public/assets/decos/animated');
const wintry = JSON.parse(readFileSync(join(root, 'public/assets/streets/GM11E7ODKHO1QJE.json'), 'utf8'));
const audit = [process.env.GLITCH_AUDIT, dirname(root), join(homedir(), 'Documents/glitch-audit')]
  .find((d) => d && existsSync(join(d, 'streets/mnt/stos/location_data/LLI23D3LDHD1FQA.xml')) && existsSync(join(d, 'eleven-gsjs/items/teleporter.js')));
const portal = WINTRY_PORTAL_TELEPORTERS[0];
const walkway = worldToScreen(street, -2400, -700).y;

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

/*
 * Austin 2026-11-01 (live v0.11.0, Northwest Passage): "jumping into here I believe is supposed to
 * take you to a winter quest. Nothing happens." The portal is the secret entrance to Wintry Place:
 * the street's one Collision-triggered Teleporter (items/teleporter.js onPlayerCollision), which
 * the remake had left out, so the jump did nothing. js/wintry-portal.js.
 */
describe("Northwest Passage's wintry portal takes you to Wintry Place", () => {
  it('stands for the street\'s one Collision-triggered Teleporter, the secret entrance GSJS names', { skip: !audit && 'glitch-audit archive not found' }, () => {
    const xml = readFileSync(join(audit, 'streets/mnt/stos/location_data/LLI23D3LDHD1FQA.xml'), 'utf8');
    assert.equal((xml.match(/label="Collision-triggered Teleporter"/g) || []).length, 1);
    assert.ok(xml.includes(`<objref tsid="${WINTRY_PORTAL_OBJREF}" label="Collision-triggered Teleporter"/>`));
    const quest = readFileSync(join(audit, 'eleven-gsjs/quests/meditativearts_maintain_energy_in_wintry_place.js'), 'utf8');
    assert.match(quest, /secret entrances to Wintry Place are in <a [^>]*LLI23D3LDHD1FQA[^>]*>Northwest Passage/);
    const tp = readFileSync(join(audit, 'eleven-gsjs/items/teleporter.js'), 'utf8');
    assert.match(tp, /pc\.teleportToLocation\(this\.instanceProps\.target_tsid/);
  });

  it('is on Northwest Passage only and goes to Wintry Place', () => {
    assert.deepEqual(wintryPortalTeleportersOn(NORTHWEST_PASSAGE_TSID).map((r) => r.id), ['northwest_to_wintry']);
    assert.deepEqual(wintryPortalTeleportersOn('LLI23D3LDHD1FQA').map((r) => r.id), ['northwest_to_wintry']);
    assert.deepEqual(wintryPortalTeleportersOn(WINTRY_PLACE_TSID), []);
    assert.equal(portal.to, WINTRY_PLACE_TSID);
    assert.equal(wintry.label, 'Wintry Place');
  });

  it('sits in the cage round the portal art', () => {
    const deco = street.layers.find((l) => l.id === 'middleground').decos.find((d) => d.sprite === 'portal_wintry');
    const walls = Object.fromEntries(street.barriers.map((b) => [b.id, b]));
    assert.deepEqual([WINTRY_CAGE.x1, WINTRY_CAGE.x2], [walls.wall_1288127872349.x, walls.wall_1288127892296.x]);
    assert.equal(WINTRY_CAGE.floor, street.platforms.find((p) => p.id === '_pl1288127904595').y1);
    const { l } = street.bounds;
    assert.ok(Math.abs(portal.box.x + l - deco.x) < 5, 'centred under the portal');
    assert.ok(portal.box.x - portal.box.w / 2 + l > deco.x - deco.w / 2 && portal.box.x + portal.box.w / 2 + l < deco.x + deco.w / 2, 'inside the snowy oval');
  });

  it('standing or walking under the portal does nothing; a plain jump goes through', () => {
    const w = world();
    const { l } = street.bounds;
    // Walk the walkway from left of the portal to right of it: never in the box.
    const body = { x: -2650 - l, y: walkway, vx: 0, vy: 0, onGround: true };
    run(body, w, 5);
    for (let f = 0; f < 140; f++) {
      run(body, w, 1, 1);
      assert.equal(inTeleporter(portal, body.x, body.y), false, `walking at ${(body.x + l).toFixed(0)}, feet ${body.y.toFixed(0)}`);
    }
    assert.ok(body.x + l > -2300, 'walked past it');
    // A plain jump from anywhere under the cage reaches it.
    for (const wx of [-2470, -2400, -2335]) {
      const jumper = run({ x: wx - l, y: walkway, vx: 0, vy: 0, onGround: true }, w, 5);
      jumper.vy = JUMP_SPEED;
      jumper.onGround = false;
      let hit = false;
      for (let f = 0; f < 80 && !hit; f++) {
        run(jumper, w, 1);
        hit = inTeleporter(portal, jumper.x, jumper.y);
      }
      assert.ok(hit, `a plain jump at x ${wx} reaches the portal`);
    }
    // The rise it needs is well under a plain jump and well over the walkway's slope.
    const rise = walkway - portal.box.y;
    assert.ok(rise > 30 && rise < PLAIN_JUMP_APEX - 30, `rise ${rise}`);
  });

  it('lands on Wintry Place\'s snow floor, clear of any box, and the way back lands outside the portal', () => {
    const land = arrivalInTarget(wintry, portal.arrive.x + wintry.bounds.l, portal.arrive.y + wintry.bounds.t);
    assert.equal(land.snapped, true);
    assert.deepEqual({ x: land.x, y: land.y }, { ...portal.arrive });
    assert.deepEqual([...teleportersOn(WINTRY_PLACE_TSID), ...wintryPortalTeleportersOn(WINTRY_PLACE_TSID)], []);
    const back = wintry.signposts.find((s) => s.connects.some((c) => c.tsid === 'LLI23D3LDHD1FQA'));
    const arrive = back.connects[0].arrive;
    assert.equal(inTeleporter(portal, arrive.x, arrive.y), false, 'the signpost back does not bounce you straight in again');
    assert.ok(Math.abs(arrive.x + street.bounds.l - (-2400)) < 150, 'it lands beside the portal');
  });

  describe('hidden-floors feature', () => {
    const engineAt = (x, y, gate) => {
      const calls = { enter: [], toast: [] };
      const engine = {
        started: true,
        player: { x, y, vx: 0, vy: 0 },
        data: {},
        setData(k, v) { this.data[k] = v; },
        param: () => null,
        transientInstance: () => false,
        homeContext: () => ({}),
        acting: () => false,
        questDialogueOpen: () => false,
        travelGate: () => gate,
        toast: (m) => calls.toast.push(m),
        enter: async (tsid, opts) => { calls.enter.push([tsid, opts]); },
        save: () => {},
      };
      return { engine, calls };
    };

    it('a jump into the portal enters Wintry Place at the landing', async () => {
      let now = 1_000_000;
      mock.method(Date, 'now', () => now);
      try {
        const { engine, calls } = engineAt(portal.box.x, portal.box.y - 20, null);
        hiddenFloorsFeature.onStreetEnter(street, engine);
        assert.equal(engine.data.hiddenFloorBoxes, 'northwest_to_wintry');
        now += 2000;
        hiddenFloorsFeature.onTick(16, now, engine);
        await Promise.resolve();
        assert.deepEqual(calls.enter, [[WINTRY_PLACE_TSID, { spawnX: portal.arrive.x, spawnY: portal.arrive.y }]]);
        assert.equal(engine.data.hiddenFloorLast, 'northwest_to_wintry');
      } finally {
        hiddenFloorsFeature.onStreetClear();
        mock.restoreAll();
      }
    });

    it('standing under it does nothing, and a travel gate that refuses says why', async () => {
      let now = 2_000_000;
      mock.method(Date, 'now', () => now);
      try {
        const stand = engineAt(portal.box.x, walkway, null);
        hiddenFloorsFeature.onStreetEnter(street, stand.engine);
        now += 2000;
        hiddenFloorsFeature.onTick(16, now, stand.engine);
        assert.deepEqual(stand.calls.enter, []);
        const refused = engineAt(portal.box.x, portal.box.y - 20, { ok: false, msg: 'You are too pooped to travel.' });
        hiddenFloorsFeature.onStreetEnter(street, refused.engine);
        now += 2000;
        hiddenFloorsFeature.onTick(16, now, refused.engine);
        await Promise.resolve();
        assert.deepEqual(refused.calls.enter, []);
        assert.deepEqual(refused.calls.toast, ['You are too pooped to travel.']);
      } finally {
        hiddenFloorsFeature.onStreetClear();
        mock.restoreAll();
      }
    });

    it('not inside a quest instance', () => {
      const { engine } = engineAt(portal.box.x, portal.box.y - 20, null);
      engine.transientInstance = () => true;
      hiddenFloorsFeature.onStreetEnter(street, engine);
      assert.equal(engine.data.hiddenFloorBoxes, '');
      hiddenFloorsFeature.onStreetClear();
    });
  });
});
