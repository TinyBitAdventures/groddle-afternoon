// Bug report #1 (2026-10-30, Gentle Island Exit): the Egg Plant in the cave could be used from the floor above.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { OUT_OF_REACH_LINE, STAND_LIFT, avatarHitBox, behindFloor, bodyReachDistance, floorBetween, reachPoint } from '../public/js/reach.js?v=8e52df56';
import { EZ_COOKIN_TSID, EZ_COUNTERS, EZ_FOOD, EZ_KNIFE_AND_BOARD, practiceScreen } from '../public/js/practice-streets.js?v=557238c1';
import { avatarHeadReach, groundBeneath, platformsScreen } from '../public/js/street-model.js?v=b6cb6a4e';
import { serverPath, skipWithoutServer } from '../tools/repos.mjs';

const root = join(import.meta.dirname, '..');
const game = readFileSync(join(root, 'public/game.js'), 'utf8');
const client = join(root, '../glitch-client/com/tinyspeck/engine');
const street = (tsid) => JSON.parse(readFileSync(join(root, 'public/assets/streets', `${tsid}.json`), 'utf8'));
const HALF = avatarHeadReach(1).reach / 2;
const body = (x, feetY) => ({ x, y: feetY - HALF });
const boxAt = (x, y, w, h) => ({ left: x - w / 2, right: x + w / 2, top: y - h, bottom: y });

describe('reach: a floor between you and a thing (js/reach.js)', () => {
  const floor = { x1: 0, y1: 500, x2: 1000, y2: 500, pcPerm: -1 };
  const cave = { x1: 0, y1: 760, x2: 1000, y2: 760, pcPerm: -1 };

  it('a thing in the cave under your floor is behind it; beside it in the cave it is not', () => {
    const plant = boxAt(520, 760, 150, 210);
    assert.ok(behindFloor([floor, cave], body(500, 500), plant, null, { feetY: 500 }));
    assert.equal(behindFloor([floor, cave], body(460, 760), plant, null, { feetY: 760 }), false);
  });

  it('a thing on the floor over your head is behind it', () => {
    const piggy = boxAt(500, 500, 70, 50);
    assert.ok(behindFloor([floor, cave], body(480, 760), piggy, null, { feetY: 760 }));
  });

  it('a step up or down is not a floor between', () => {
    // Lower floor to x 300, then a step 40 px up.
    const low = { x1: 0, y1: 600, x2: 300, y2: 600, pcPerm: -1 };
    const high = { x1: 300, y1: 560, x2: 800, y2: 560, pcPerm: -1 };
    const plats = [low, high];
    assert.equal(behindFloor(plats, body(260, 600), boxAt(340, 560, 70, 50), null, { feetY: 600 }), false, 'piggy just above the step');
    assert.equal(behindFloor(plats, body(340, 560), boxAt(260, 600, 70, 50), null, { feetY: 560 }), false, 'piggy just below the step');
  });

  it('a tree up or down a slope stays in reach', () => {
    const slope = { x1: 0, y1: 800, x2: 600, y2: 500, pcPerm: -1 };
    const at = (x) => 800 - x / 2;
    assert.equal(behindFloor([slope], body(200, at(200)), boxAt(280, at(280), 150, 210), null, { feetY: at(200) }), false, 'uphill');
    assert.equal(behindFloor([slope], body(280, at(280)), boxAt(200, at(200), 150, 210), null, { feetY: at(280) }), false, 'downhill');
  });

  it('switched-off lines (pc_perm 0) never separate', () => {
    const off = { ...floor, pcPerm: 0 };
    assert.equal(behindFloor([off, cave], body(500, 500), boxAt(520, 760, 150, 210), null, { feetY: 500 }), false);
  });

  it('a line through your own body (a shelf at chest height) is not between', () => {
    const shelf = { x1: 400, y1: 470, x2: 600, y2: 470, pcPerm: -1 };
    const plats = [floor, shelf];
    assert.equal(behindFloor(plats, body(450, 500), boxAt(560, 500, 90, 60), null, { feetY: 500 }), false);
    assert.ok(floorBetween(plats, 450, 500 - HALF, 530, 470 + 20), 'without feetY the shelf would count');
  });

  it('aims just over the thing\'s own floor, unless it flies', () => {
    const b = boxAt(100, 500, 60, 40);
    assert.deepEqual(reachPoint(b, 0, 900), { x: 70, y: 500 - STAND_LIFT });
    assert.deepEqual(reachPoint(b, 0, 900, { airborne: true }), { x: 70, y: 500 });
  });

  it('a thing with no box is tested at its feet', () => {
    assert.ok(behindFloor([floor, cave], body(500, 500), null, { x: 520, y: 760 }, { feetY: 500 }));
  });
});

describe('ENTERSHELF: Enter reaches a thing at the avatar\'s height (bodyReachDistance)', () => {
  const HEAD = (feetY) => avatarHitBox(0, feetY).top;
  // The remake's Enter (game.js interactReach): the nearer of the feet distance and this, under 100.
  const feetDistance = (b, x, feetY) => Math.hypot(Math.max(b.left - x, 0, x - b.right), Math.max(b.top - feetY, 0, feetY - b.bottom));
  const enterReach = (b, x, feetY) => Math.min(feetDistance(b, x, feetY), bodyReachDistance(b, x, feetY, HEAD(feetY)));

  it('a box down within the hit box\'s height is as near as it is across; higher or lower keeps the feet distance', () => {
    assert.equal(HEAD(500), 500 - 113, 'AbstractAvatarView.as 139-149: 123 tall, 10 under the feet');
    assert.equal(bodyReachDistance(boxAt(560, 400, 30, 30), 500, 500, HEAD(500)), 45);
    assert.equal(bodyReachDistance(boxAt(500, 400, 30, 30), 500, 500, HEAD(500)), 0);
    assert.equal(bodyReachDistance(boxAt(500, 380, 30, 30), 500, 500, HEAD(500)), Infinity, 'over the head');
    assert.equal(bodyReachDistance(boxAt(500, 560, 30, 30), 500, 500, HEAD(500)), Infinity, 'under the feet');
    assert.ok(enterReach(boxAt(500, 380, 30, 30), 500, 500) >= 100, 'a thing 120 over the feet is still out of reach');
  });

  it("Breezy, EZ Cookin': the food on each counter and the Knife & Board on its table, from the floor beside them", () => {
    const s = street(EZ_COOKIN_TSID);
    const plats = platformsScreen(s);
    // practice-kit.js addPickup: the icon bottom-centred 1 under its spot, food at 0.5, the Knife & Board at 0.7.
    const ICON = { cheese: [56, 46], tomato: [34, 32], bun: [41, 35], meat: [45, 27], knife_and_board: [68, 64] };
    const box = (row, scale) => {
      const p = practiceScreen(EZ_COOKIN_TSID, row.x, row.y);
      return boxAt(p.x, p.y + 1, ICON[row.classTsid][0] * scale, ICON[row.classTsid][1] * scale);
    };
    const rows = [...EZ_FOOD.map((f) => [f, box(f, 0.5)]), [EZ_KNIFE_AND_BOARD, box(EZ_KNIFE_AND_BOARD, 0.7)]];
    let wasOut = 0;
    for (const [row, b] of rows) {
      for (const dx of [-80, -40, 0, 40, 80]) {
        const x = practiceScreen(EZ_COOKIN_TSID, row.x + dx, 0).x;
        const g = groundBeneath(plats, x, b.bottom + 1);
        assert.ok(g && Math.abs(g.y - 908) < 2, `${row.id}: the lane under ${x}`);
        assert.ok(enterReach(b, x, g.y) < 100, `${row.id} from ${dx} beside it`);
        assert.equal(behindFloor(plats, body(x, g.y), b, null, { feetY: g.y, hitBox: avatarHitBox(x, g.y) }), false, `${row.id}: no floor between`);
        if (dx === 40 && feetDistance(b, x, g.y) >= 100) wasOut += 1;
      }
    }
    assert.equal(wasOut, EZ_FOOD.length, 'the feet distance alone missed every food item from 40 beside it (Austin: "Nothing nearby to interact with.")');
    for (const c of EZ_COUNTERS) {
      const mid = practiceScreen(EZ_COOKIN_TSID, c.x, 0).x;
      for (const [row, b] of rows.filter(([r]) => `trant${r.counter}` === c.id)) assert.ok(enterReach(b, mid, 908) < 100, `${row.id} from ${c.id}'s middle`);
    }
  });

  it('the Side Table\'s lotion on A L\'il Animal Kinship (an item-only shelf, plat_1342128759603) from the floor beside it', () => {
    const s = street('GHFRK14DDU53RQQ');
    const plats = platformsScreen(s);
    const shelf = s.platforms.find((p) => p.id === 'plat_1342128759603');
    const b = boxAt(1823 - s.bounds.l, shelf.y1 - s.bounds.t, 30, 30);
    for (const dx of [-80, 0, 80]) {
      const g = groundBeneath(plats, 1823 + dx - s.bounds.l, b.bottom + 1);
      assert.ok(enterReach(b, 1823 + dx - s.bounds.l, g.y) < 100, `from ${dx}`);
      assert.equal(behindFloor(plats, body(1823 + dx - s.bounds.l, g.y), b, null, { feetY: g.y }), false);
    }
  });

  it('a thing at head height on a floor over the avatar stays behind that floor', () => {
    const floor = { x1: 0, y1: 500, x2: 1000, y2: 500, pcPerm: -1 };
    const ledge = { x1: 540, y1: 400, x2: 700, y2: 400, pcPerm: -1 };
    const b = boxAt(600, 400, 30, 30);
    assert.ok(enterReach(b, 520, 500) < 100);
    assert.ok(behindFloor([floor, ledge], body(520, 500), b, null, { feetY: 500, hitBox: avatarHitBox(520, 500) }));
  });
});

describe('Gentle Island Exit, the reported spot', () => {
  const s = street('GA93VBH3H3D38HF');
  const plats = platformsScreen(s);
  // The online layout (tools/build-realtime-objects.mjs): the Egg Plant at 3807,958 in the cave;
  // the player stood at 3778,726 on the floor above (post 111/115).
  const plant = boxAt(3807, 958, 150, 210);
  it('the top floor is behind the floor', () => {
    const g = groundBeneath(plats, 3778, 700);
    assert.ok(Math.abs(g.y - 726) < 3, `top floor at ${g.y}`);
    assert.ok(behindFloor(plats, body(3778, g.y), plant, null, { feetY: g.y }));
  });
  it('in the cave beside it, it is in reach', () => {
    const g = groundBeneath(plats, 3869, 940);
    assert.ok(Math.abs(g.y - 956) < 3, `cave floor at ${g.y}`);
    assert.equal(behindFloor(plats, body(3869, g.y), plant, null, { feetY: g.y }), false);
  });
});

describe('every server-laid tree, rock and piggy stays in reach from beside it', () => {
  it('no false blocks on any street', { skip: skipWithoutServer }, () => {
    const objs = JSON.parse(readFileSync(serverPath('data/objects.json'), 'utf8')).streets;
    const SIZE = { tree: [150, 200], rock: [90, 60], pig: [70, 50] };
    let checks = 0;
    const blocked = [];
    for (const [tsid, o] of Object.entries(objs)) {
      const file = join(root, 'public/assets/streets', `${tsid}.json`);
      if (!existsSync(file)) continue;
      const plats = platformsScreen(street(tsid));
      const rows = [
        ...(o.trees || []).map((r) => ['tree', r[1], r[2], r[3]]),
        ...(o.rocks || []).map((r) => ['rock', r[1], r[2], r[3]]),
        ...(o.pigs || []).map((r) => ['pig', 'npc_piggy', r[1], r[2]]),
      ];
      for (const [kind, cls, x, y] of rows) {
        const box = boxAt(x, y, ...SIZE[kind]);
        for (const dx of [-60, -30, 30, 60]) {
          const g = groundBeneath(plats, x + dx, y - 10, 30);
          if (!g || Math.abs(g.y - y) > 40) continue;
          checks += 1;
          if (behindFloor(plats, body(x + dx, g.y), box, null, { feetY: g.y })) blocked.push(`${tsid} ${cls} ${x},${y}`);
        }
      }
    }
    assert.ok(checks > 10000, `checks ${checks}`);
    assert.deepEqual(blocked, []);
  });
});

describe('game.js wiring', () => {
  it('Enter, the chooser and the prompt drop things behind a floor', () => {
    assert.match(game, /import \{ avatarHitBox, behindFloor, bodyReachDistance, OUT_OF_REACH_LINE \} from '\.\/js\/reach\.js\?v=[0-9a-f]{8}'/);
    assert.match(game, /function behindFloorFromPlayer\(t, at = player\) \{/);
    assert.match(game, /const hitBox = avatarHitBox\(at\.x, at\.y, bodyScale\);\s*return behindFloor\([\s\S]{0,200}feetY: at\.y, hitBox \}\);/);
    assert.match(game, /function interactReach\(t\) \{[\s\S]{0,420}if \(d < 160 && behindFloorFromPlayer\(t\)\) return Infinity;/);
    assert.match(game, /avatarHeadReach\(bodyScale\)\.reach \/ 2/);
    // ENTERSHELF: Enter measures a thing at the avatar's height across, before the floor test.
    assert.match(game, /let d = interactDistance\(t, player\.x, player\.y\);[\s\S]{0,160}if \(!t\.airborne\) d = Math\.min\(d, enterBodyDistance\(t\)\);\s*\/\/[^\n]*\n\s*if \(d < 160 && behindFloorFromPlayer\(t\)\) return Infinity;/);
    assert.match(game, /function enterBodyDistance\(t\) \{[\s\S]{0,260}return bodyReachDistance\(box, player\.x, player\.y, head\);/);
    assert.match(game, /withinReach\(recentInteractionTarget, 160\)\s*\) \{\s*openVerbMenu\(recentInteractionTarget\)/);
    assert.match(game, /withinReach\(hoverTarget, 160\)\) \{\s*openVerbMenu\(hoverTarget\)/);
    assert.match(game, /recent \|\| \(nearHover && withinReach\(nearHover, 160\)/);
  });

  it('a click on a thing behind a floor that no walk-over reaches says the client\'s line instead of opening its menu', () => {
    assert.equal(OUT_OF_REACH_LINE, 'Could not get close enough :(');
    assert.match(game, /if \(!\/\^pc_\/\.test\(String\(best\.classId \|\| ''\)\) && behindFloorFromPlayer\(best\) && !walkOverReaches\(best\)\) \{[\s\S]{0,140}toast\(OUT_OF_REACH_LINE\);\s*return;/);
  });

  it('cites client lines that say what it says', { skip: !existsSync(client) && 'needs glitch-client beside the repo' }, () => {
    const mg = readFileSync(join(client, 'view/renderer/MiddleGroundRenderer.as'), 'utf8').split('\n');
    assert.match(mg.slice(1157, 1167).join('\n'), /hit_target\.hitTestObject\(renderer\.hit_target\)/);
    const av = readFileSync(join(client, 'view/AbstractAvatarView.as'), 'utf8').split('\n');
    assert.match(av.slice(138, 149).join('\n'), /hit_box_width', 66\)[\s\S]*hit_box_height', 123\)/);
    const fc = readFileSync(join(client, 'control/TSFrontController.as'), 'utf8').split('\n');
    assert.match(fc[632], /Could not get close enough :\(/);
    const fv = readFileSync(join(client, '../bridge/FlashVarModel.as'), 'utf8').split('\n');
    assert.match(fv[209], /dont_move_for_item_menu:Boolean = true/);
  });
});
