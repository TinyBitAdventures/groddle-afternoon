// Player report 33 (2026-11-01): reach up and down, signposts far over the avatar, and a
// shared verb that swung and then failed.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { AVATAR_HIT_BOX, avatarHitBox, behindFloor, boxesTouch } from '../public/js/reach.js?v=4187d746';
import { avatarHeadReach, groundBeneath, isBuriedSignpost, isStandable, platformYAt, platformsScreen, signpostNear, signpostReachY, worldToScreen } from '../public/js/street-model.js?v=b6cb6a4e';
import { walkUpSignpostStreet } from '../public/js/ladder-top-signposts.js?v=046013b4';
import { planSignpostTravel } from '../public/js/travel.js?v=7fd6e363';
import { COPY, OBJECT_REACH, inObjectReach } from '../public/js/street-objects.js?v=c36a40da';
import { serverPath, skipWithoutServer } from '../tools/repos.mjs';

const root = join(import.meta.dirname, '..');
const game = readFileSync(join(root, 'public/game.js'), 'utf8');
const streetsDir = join(root, 'public/assets/streets');
const street = (tsid) => JSON.parse(readFileSync(join(streetsDir, `${tsid}.json`), 'utf8'));
const HALF = avatarHeadReach(1).reach / 2;
const boxAt = (x, y, w, h) => ({ left: x - w / 2, right: x + w / 2, top: y - h, bottom: y });
const client = join(root, '../glitch-client/com/tinyspeck/engine');
const gsjs = join(root, '../glitch-GameServerJS');

describe('33a: what the avatar\'s hit box touches is in reach, floor or not', () => {
  it('the client\'s box: 66 x 123, 10 px under the feet', () => {
    assert.deepEqual(avatarHitBox(500, 800), { left: 467, right: 533, top: 687, bottom: 810 });
    assert.deepEqual({ ...AVATAR_HIT_BOX }, { w: 66, h: 123, below: 10 });
  });

  it('a Piggy a little under the slope you stand on is in reach; one in the cave far below is not', () => {
    const slope = { x1: 0, y1: 600, x2: 1000, y2: 700, pcPerm: -1 };
    const at = (x) => 600 + x / 10;
    const piggy = boxAt(520, at(520) + 52, 70, 50); // sits 52 px under the line, its top just under it
    const feet = at(500);
    assert.ok(behindFloor([slope], { x: 500, y: feet - HALF }, piggy, null, { feetY: feet }), 'without the hit box the slope separates');
    assert.equal(behindFloor([slope], { x: 500, y: feet - HALF }, piggy, null, { feetY: feet, hitBox: avatarHitBox(500, feet) }), false);
    const cave = boxAt(520, feet + 230, 150, 210);
    assert.ok(behindFloor([slope], { x: 500, y: feet - HALF }, cave, null, { feetY: feet, hitBox: avatarHitBox(500, feet) }));
  });

  it('Gentle Island Exit (report #1) stays fixed: the Egg Plant in the cave is behind the floor', () => {
    const plats = platformsScreen(street('GA93VBH3H3D38HF'));
    const g = groundBeneath(plats, 3778, 700);
    assert.ok(behindFloor(plats, { x: 3778, y: g.y - HALF }, boxAt(3807, 958, 150, 210), null, { feetY: g.y, hitBox: avatarHitBox(3778, g.y) }));
  });

  it('sweep: no server-laid thing the standing hit box touches is refused', { skip: skipWithoutServer }, () => {
    const objs = JSON.parse(readFileSync(serverPath('data/objects.json'), 'utf8')).streets;
    const SIZE = { tree: [150, 200], rock: [90, 60], pig: [70, 50], chicken: [50, 45], node: [90, 60] };
    let touching = 0;
    let oldRefused = 0;
    const refused = [];
    for (const [tsid, o] of Object.entries(objs)) {
      const file = join(streetsDir, `${tsid}.json`);
      if (!existsSync(file)) continue;
      const plats = platformsScreen(street(tsid));
      const rows = [
        ...(o.trees || []).map((r) => ['tree', r[2], r[3]]),
        ...(o.rocks || []).map((r) => ['rock', r[2], r[3]]),
        ...(o.nodes || []).map((r) => ['node', r[2], r[3]]),
        ...(o.pigs || []).map((r) => ['pig', r[1], r[2]]),
        ...(o.chickens || []).map((r) => ['chicken', r[1], r[2]]),
      ];
      for (const [kind, x, y] of rows) {
        const box = boxAt(x, y, ...SIZE[kind]);
        for (let dx = -60; dx <= 60; dx += 20) {
          for (const p of plats) {
            if (!isStandable(p)) continue;
            const gy = platformYAt(p, x + dx, 0);
            if (gy == null || gy > y + 5 || gy < y - 200) continue;
            const hitBox = avatarHitBox(x + dx, gy);
            if (!boxesTouch(hitBox, box)) continue;
            touching += 1;
            const body = { x: x + dx, y: gy - HALF };
            if (behindFloor(plats, body, box, null, { feetY: gy })) oldRefused += 1;
            if (behindFloor(plats, body, box, null, { feetY: gy, hitBox })) refused.push(`${tsid} ${kind} ${x},${y}`);
          }
        }
      }
    }
    assert.ok(touching > 30000, `touching ${touching}`);
    assert.ok(oldRefused > 0, 'the old floor test refused some (22 when written)');
    assert.deepEqual(refused, []);
  });

  it('game.js passes the hit box', () => {
    assert.match(game, /const hitBox = avatarHitBox\(at\.x, at\.y, bodyScale\);/);
  });
});

describe('33d: a signpost far over (or under) the avatar is not in reach', () => {
  const at = (s, sp) => worldToScreen(s, sp.x, sp.y);

  it('The Other Drop: at the bottom, by the Level 4 East post, the Eastern Approach post 3,500 px up is not taken', () => {
    const s = street('GLI1D5DO1671QPA');
    const walk = walkUpSignpostStreet(s);
    const level4 = s.signposts.find((p) => p.connects.some((c) => c.label === 'Level 4 East'));
    const foot = at(s, level4);
    const feet = groundBeneath(platformsScreen(s), foot.x, foot.y - 100, 0).y;
    const x = foot.x - 17; // nearer across to the high post (x -845) than the low one (-828)
    assert.equal(signpostNear(walk, x, 140)?.signpost.connects[0].label, 'Eastern Approach', 'the bug: x only');
    assert.equal(signpostNear(walk, x, 140, feet)?.signpost.connects[0].label, 'Level 4 East');
    const plan = planSignpostTravel(walk, x, new Set(s.signposts.flatMap((p) => p.connects.map((c) => c.tsid))), 140, (p) => signpostReachY(s, p, feet));
    assert.equal(plan.label, 'Level 4 East');
  });

  it('Northwest Passage, lower left: the post 600 px up is out of reach, the one beside you is in', () => {
    const s = street('GLI23D3LDHD1FQA');
    const high = s.signposts.find((p) => p.x === -2900);
    const low = s.signposts.find((p) => p.x === -2800);
    const feet = groundBeneath(platformsScreen(s), at(s, low).x, at(s, low).y - 100, 0).y;
    assert.equal(signpostReachY(s, high, feet), false);
    assert.equal(signpostReachY(s, low, feet), true);
    assert.equal(signpostNear(walkUpSignpostStreet(s), at(s, high).x, 140, feet)?.signpost, low);
  });

  it('sweep: every walk-up post is in reach from a floor at its foot, but for the Moshi Moshi tube streets (their tubes and beams carry you)', () => {
    const bad = new Set();
    let posts = 0;
    for (const f of readdirSync(streetsDir)) {
      if (!/^[GL].*\.json$/.test(f)) continue;
      let s;
      try { s = JSON.parse(readFileSync(join(streetsDir, f), 'utf8')); } catch { continue; }
      if (!s.bounds || !s.signposts?.length) continue;
      const plats = platformsScreen(s);
      for (const sp of walkUpSignpostStreet(s).signposts || []) {
        if (isBuriedSignpost(s, sp)) continue;
        posts += 1;
        const p = at(s, sp);
        const h = sp.h || 200;
        const ok = [-60, -40, -20, 0, 20, 40, 60].some((dx) => {
          const g = groundBeneath(plats, p.x + dx, p.y - h, 0);
          return g && signpostReachY(s, sp, g.y);
        });
        if (!ok) bad.add(s.tsid);
      }
    }
    assert.ok(posts > 2500, `posts ${posts}`);
    // Shim Shiri (Light Beams), Bilicious Blues, Duodenal Browns, Organish Chute (tube teleports):
    // assets/content/puzzle-triggers.json; the client's box never reached those posts from the floor either.
    assert.deepEqual([...bad].sort(), ['GA9BT2I0ILD340S', 'GA9TCL1H7LD37DC', 'GA9TKSRJ7LD3SGK', 'GA9UCEFP7LD3523']);
  });

  it('game.js asks with the feet: Enter, the prompt and T', () => {
    // Enter, the T hint and the signpost arm keys (signpostAtHand).
    assert.equal((game.match(/signpostNear\(walkUpSignpostStreet\(currentStreet\), player\.x, 140, player\.y\)/g) || []).length, 3);
    assert.match(game, /planSignpostTravel\([\s\S]{0,160}\(s\) => signpostReachY\(currentStreet, s, player\.y\),/);
  });

  it('cites client lines that say what it says', { skip: !existsSync(client) && 'needs glitch-client beside the repo' }, () => {
    const mg = readFileSync(join(client, 'view/renderer/MiddleGroundRenderer.as'), 'utf8').split('\n');
    assert.match(mg.slice(1117, 1119).join('\n'), /glowSignPosts\(lq\.resultSignPosts\)/);
    assert.match(mg.slice(1157, 1167).join('\n'), /hit_target\.hitTestObject\(renderer\.hit_target\)/);
  });
});

describe('33b: a shared verb that starts also lands', () => {
  it('the server\'s reach, mirrored', { skip: skipWithoutServer }, () => {
    const go = readFileSync(serverPath('objects.go'), 'utf8');
    assert.match(go, new RegExp(`objReachX = ${OBJECT_REACH.x}\\b`));
    assert.match(go, new RegExp(`objReachY = ${OBJECT_REACH.y}\\b`));
    assert.match(go, new RegExp(`no\\("far", "${COPY.far.replace('.', '\\.')}"`));
  });

  it('in reach is the server\'s box from the feet to the spot', () => {
    assert.ok(inObjectReach(1000, 800, 1700, 1300));
    assert.equal(inObjectReach(1000, 800, 1701, 800), false);
    assert.equal(inObjectReach(1000, 800, 1000, 1301), false);
  });

  it('game.js refuses before the swing, with the server\'s line', () => {
    assert.match(game, /function beginVerbAction\(target, verb\) \{\s*if \(!target \|\| !verb \|\| currentAction\) return false;[\s\S]{0,300}const tooFar = features\.query\('verbOutOfReach', target, verb\.id, engine\);\s*if \(tooFar\) \{\s*toast\(tooFar, 2600\);/);
    const feature = readFileSync(join(root, 'public/js/features/street-objects-feature.js'), 'utf8');
    assert.match(feature, /verbOutOfReach\(target, verbId, engine, at\) \{\s*return outOfReach\(engine, target, verbId, at\);/);
    assert.match(feature, /\['rock', 'tree', 'node'\]\.includes\(idKind\(verb\.id\)\)/);
  });

  it('cites the source check at the start', { skip: !existsSync(gsjs) && 'needs glitch-GameServerJS beside the repo' }, () => {
    const main = readFileSync(join(gsjs, 'main.js'), 'utf8').split('\n');
    assert.match(main.slice(2939, 2970).join('\n'), /var required_range = 300;[\s\S]*Get closer:/);
  });
});
