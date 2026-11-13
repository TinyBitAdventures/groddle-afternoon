// Walk-over (Austin's call, 2026-11-01): a verb on a thing more than reach away walks the
// avatar over first, then runs, as the original did; a thing no walk reaches is refused.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import {
  DEFAULT_VERB_RANGE,
  FAILED_LINE,
  HELL_VERB_RANGE,
  PICKUP_RANGE,
  baseVerb,
  inVerbReach,
  movingLine,
  verbRange,
  walkOverEnd,
  walkOverGoalX,
  walkOverGoals,
} from '../public/js/walk-over.js?v=277ab977';
import { VERB_RANGES } from '../public/js/verb-ranges-data.js?v=4d0a4515';
import { OUT_OF_REACH_LINE, avatarHitBox, behindFloor } from '../public/js/reach.js?v=8e52df56';
import { createUserPath, stepUserPath } from '../public/js/user-path.js?v=8880557f';
import { NORMAL_BUFF, avatarGround, stepAvatar, steerX } from '../public/js/avatar-step.js?v=43b1182e';
import { avatarHeadReach, groundBeneath, platformsScreen, barriersScreen, streetWidth } from '../public/js/street-model.js?v=b6cb6a4e';

const root = join(import.meta.dirname, '..');
const game = readFileSync(join(root, 'public/game.js'), 'utf8');
const gsjs = join(root, '../glitch-GameServerJS');
const client = join(root, '../glitch-client/com/tinyspeck/engine');

describe('how near a verb needs you (main.js doVerb 2939-2967)', () => {
  it('300 px, the verb\'s own override, 150 in Hell', () => {
    assert.equal(DEFAULT_VERB_RANGE, 300);
    assert.equal(verbRange('trant_fruit', 'harvest'), 300);
    assert.equal(verbRange('rock_beryl_1', 'mine'), 150);
    assert.equal(verbRange('npc_piggy', 'pet'), 800);
    assert.equal(verbRange('npc_piggy', 'feed:apple:2'), 800);
    assert.equal(verbRange('npc_chicken', 'squeeze'), 800);
    assert.equal(verbRange('apple', 'pickup'), PICKUP_RANGE);
    assert.equal(verbRange('trant_fruit', 'harvest', { inHell: true }), HELL_VERB_RANGE);
  });

  it('no check: give, a pickup at home, a Fox, players and "disable_proximity" verbs', () => {
    assert.equal(verbRange('apple', 'give'), null);
    assert.equal(verbRange('apple', 'pickup', { atHome: true }), null);
    assert.equal(verbRange('npc_fox', 'brush'), null);
    assert.equal(verbRange('pc_remote', 'follow'), null);
    assert.equal(verbRange('npc_shrine_alph', 'check_favor'), null);
    assert.equal(verbRange('npc_butterfly', 'massage'), null);
    assert.equal(verbRange('npc_butterfly', 'massage', { inHell: true }), null);
    assert.equal(baseVerb('feed:apple:2'), 'feed');
  });

  it('the table is the build\'s (tools/build-verb-ranges.mjs --check)', { skip: !existsSync(join(gsjs, 'items')) && 'needs glitch-GameServerJS beside the repo' }, () => {
    execFileSync(process.execPath, [join(root, 'tools/build-verb-ranges.mjs'), gsjs, '--check'], { stdio: 'pipe' });
    assert.ok(Object.keys(VERB_RANGES).length > 100);
  });

  it('cites the server check and the client walk', { skip: !(existsSync(gsjs) && existsSync(client)) && 'needs glitch-GameServerJS and glitch-client beside the repo' }, () => {
    const main = readFileSync(join(gsjs, 'main.js'), 'utf8').split('\n');
    assert.match(main.slice(2925, 2975).join('\n'), /var required_range = 300;[\s\S]*proximity_override[\s\S]*disable_proximity[\s\S]*msg\.verb == 'give'[\s\S]*at_home && msg\.verb == 'pickup'[\s\S]*Get closer:/);
    // Hell's 150 px is in Eleven's copy of the server (eleven-gsjs main.js 2963-2966), not Tiny Speck's release.
    const eleven = join(root, '../eleven-gsjs/main.js');
    if (existsSync(eleven)) assert.match(readFileSync(eleven, 'utf8').split('\n').slice(2955, 2968).join('\n'), /isInHell\(\)\) \{\s*required_range = 150;/);
    const fc = readFileSync(join(client, 'control/TSFrontController.as'), 'utf8').split('\n');
    assert.match(fc.slice(437, 453).join('\n'), /Moving you in order to/);
    assert.match(fc.slice(612, 636).join('\n'), /dist <= model\.physicsModel\.required_verb_proximity[\s\S]*Could not get close enough :\(/);
    assert.match(fc.slice(1886, 1900).join('\n'), /Math\.min\(\(liv\.itemstack\.client::physWidth\/2\)\+30, pm\.required_verb_proximity-pm\.path_end_allowance\)/);
  });
});

describe('the walk (moveAvatarToLIVandDoVerbOrAction, AvatarController.beginPath)', () => {
  it('stops on your side, short by half the way, at most half the thing\'s width + 30', () => {
    assert.equal(walkOverGoalX({ targetX: 1000, targetW: 100, fromX: 200 }), 920);
    assert.equal(walkOverGoalX({ targetX: 1000, targetW: 100, fromX: 1800 }), 1080);
    assert.equal(walkOverGoalX({ targetX: 1000, targetW: 100, fromX: 1100 }), 1050);
    // ...and inside the range less the path's 20 px end allowance.
    assert.equal(walkOverGoalX({ targetX: 1000, targetW: 600, fromX: 0, range: 150 }), 870);
    assert.equal(walkOverGoalX({ targetX: NaN, fromX: 0 }), null);
  });

  it('report #232: your side first, then the thing\'s other side as far past its middle', () => {
    assert.deepEqual(walkOverGoals({ targetX: 1000, targetW: 100, fromX: 200 }), [920, 1080]);
    assert.deepEqual(walkOverGoals({ targetX: 1000, targetW: 100, fromX: 1100 }), [1050, 920]);
    assert.deepEqual(walkOverGoals({ targetX: 1000, targetW: 600, fromX: 0, range: 150 }), [870, 1130]);
    // Hechey Track's front left herb plot (box 3159-3215) from where the player stood.
    assert.deepEqual(walkOverGoals({ targetX: 3187, targetW: 56, fromX: 3173 }), [3180, 3245]);
    assert.deepEqual(walkOverGoals({ targetX: NaN, fromX: 0 }), []);
  });

  it('report #232: Hechey Track\'s front left herb plot is behind the hump from your side, in reach from its other side', () => {
    const street = JSON.parse(readFileSync(join(root, 'public/assets/streets/GLI2V0UN7RD1T2J.json'), 'utf8'));
    const platforms = platformsScreen(street);
    // The herb bed (data/gardens.json herb at 3261.5) draws plot 1-2 here (game.js spriteWorldHitBox, measured in the game).
    const plot = { left: 3159, right: 3215, top: 831, bottom: 847 };
    const behindFrom = (x) => {
      const feet = groundBeneath(platforms, x, 700, 0);
      const body = { x, y: feet.y - avatarHeadReach(1).reach / 2 };
      return behindFloor(platforms, body, plot, { x: 3187, y: 847 }, { feetY: feet.y, hitBox: avatarHitBox(x, feet.y, 1) });
    };
    const [near, far] = walkOverGoals({ targetX: 3187, targetW: 56, fromX: 3173 });
    assert.equal(Math.round(groundBeneath(platforms, 3173, 700, 0).y), 811, 'the player stood on the hump\'s slope');
    assert.equal(behindFrom(3173), true);
    assert.equal(behindFrom(near), true, 'the only stop before: "Could not get close enough :("');
    assert.equal(behindFrom(far), false);
  });

  it('every end but a new street, a menu or a new walk measures again', () => {
    for (const r of ['arrived', 'key', 'jump', 'wall']) assert.equal(walkOverEnd(r), 'measure', r);
    for (const r of ['street', 'held', 'game', 'replaced', 'gone']) assert.equal(walkOverEnd(r), 'drop', r);
  });

  it('in reach: near enough, not behind a floor, and the realtime server would take it', () => {
    assert.equal(inVerbReach({ dist: 299, range: 300 }), true);
    assert.equal(inVerbReach({ dist: 301, range: 300 }), false);
    assert.equal(inVerbReach({ dist: 5000, range: null }), true);
    assert.equal(inVerbReach({ dist: 10, range: 300, behind: true }), false);
    assert.equal(inVerbReach({ dist: 10, range: 300, serverFar: true }), false);
  });

  it('the client\'s lines, lower-case verb as its labels were', () => {
    assert.equal(movingLine('Harvest'), 'Moving you in order to "harvest"');
    assert.equal(FAILED_LINE, OUT_OF_REACH_LINE);
  });

  it('a dry run with the avatar\'s own step walks a real street to the goal (Groddle Forest Junction)', () => {
    const street = JSON.parse(readFileSync(join(root, 'public/assets/streets/GLI3272LOTD1B1F.json'), 'utf8'));
    const platforms = platformsScreen(street);
    const worldW = streetWidth(street);
    const startX = 400;
    const start = groundBeneath(platforms, startX, 0, 0);
    const body = { x: startX, y: start.y, vx: 0, vy: 0, onGround: true };
    const goal = startX + 900;
    const path = createUserPath({ kind: 'point', x: goal }, { fromX: body.x, tsid: 't', worldW });
    const opts = { dt: 1, buff: NORMAL_BUFF, platforms, barriers: barriersScreen(street), worldW, ground: (x, y, vy) => avatarGround(platforms, x, y, vy ?? 0, { street }) };
    let end = null;
    for (let i = 0; i < 2000 && !end; i += 1) {
      const step = stepUserPath(path, { x: body.x, tsid: 't' });
      if (step.end) end = step.end;
      else {
        body.vx = steerX(body.vx, step.dir, body.onGround, opts.buff);
        stepAvatar(body, opts);
      }
    }
    assert.equal(end, 'arrived');
    assert.ok(Math.abs(body.x - goal) < 20);
  });
});

describe('game.js wiring', () => {
  it('a menu choice, the pack picker and a mailbox click ask requestVerb', () => {
    assert.match(game, /closeVerbMenu\(\);\s*requestVerb\(target, v\);/);
    assert.match(game, /return requestVerb\(target, \{\s*id: counted/);
    assert.match(game, /requestVerb\(best, \{ id: 'view_inbox'/);
  });

  it('in reach runs at once; else a dry run of the walk, then the walk or the refusal', () => {
    assert.match(game, /if \(verbReachFrom\(target, verb\.id\)\) return go\(\);/);
    assert.match(game, /const \{ goalX, ahead \} = walkOverStop\(target, verb\.id, verbWalkRange\(target, verb\.id\) \?\? 300\);\s*if \(!ahead \|\| !verbReachFrom\(target, verb\.id, ahead\)\) \{\s*toast\(FAILED_LINE/);
    // Report #232: each of walkOverGoals' stops is dry run; the first that reaches is taken.
    assert.match(game, /function walkOverStop\(target, verbId, range = 300\) \{[\s\S]{0,300}walkOverGoals\(\{[\s\S]{0,200}for \(const goalX of goals\) \{\s*const ahead = dryRunWalk\(goalX\);\s*if \(ahead && verbReachFrom\(target, verbId, ahead\)\) return \{ goalX, ahead \};/);
    assert.match(game, /function walkOverReaches\(target\) \{[\s\S]{0,120}walkOverStop\(target, 'use'\)/);
    assert.match(game, /avatarWalk\.verbWalk = \{ target, verb, go, street: currentStreetTsid \};/);
    assert.match(game, /function dryRunWalk\(goalX\) \{[\s\S]{0,700}stepUserPath\(path[\s\S]{0,300}stepAvatar\(body, opts\)/);
  });

  it('the walk\'s end measures again, where the thing is now', () => {
    assert.match(game, /if \(w\.verbWalk\) \{\s*finishVerbWalk\(w\.verbWalk, reason\);/);
    assert.match(game, /function finishVerbWalk\(vw, reason\) \{[\s\S]{0,400}if \(!verbReachFrom\(vw\.target, vw\.verb\.id\)\) \{\s*toast\(FAILED_LINE/);
  });

  it('online, the realtime server\'s reach is asked where the feet will be', () => {
    assert.match(game, /features\.query\('verbOutOfReach', target, verbId, engine, \{ x: at\.x, y: at\.y \}\)/);
  });

  it('physics and the dry run step with the same options', () => {
    assert.match(game, /function avatarStepOptions\(dt = 1\) \{\s*return \{\s*dt,\s*buff: combinedPhysics\(\),\s*platforms: streetPlatforms,\s*barriers: barriersScreen\(currentStreet\),\s*worldW: WORLD_W,/);
    assert.match(game, /stepAvatar\(player, \{\s*dt,\s*buff: combinedPhysics\(\),\s*platforms: streetPlatforms,\s*barriers: barriersScreen\(currentStreet\),\s*worldW: WORLD_W,/);
    assert.match(game, /const opts = \{ \.\.\.avatarStepOptions\(1\), ground: /);
  });
});

describe('ticket 189: feet under a ledge are not put on it', () => {
  it('walking off the end of a floor over an open shaft falls instead of rising onto a line far overhead', async () => {
    const { avatarGround, UNDER_LINE_SLACK } = await import('../public/js/avatar-step.js?v=43b1182e');
    // Greyving Grays, screen space: the lower gut floor ends at x 2509 (y 3731); at x 2560 the only
    // standable line is the upper bend, 2,300 px over the feet.
    const platforms = [
      { id: 'floor', x1: 2443, y1: 3659, x2: 2509, y2: 3731, pc_perm: -1 },
      { id: 'bend', x1: 2358, y1: 1470, x2: 2578, y2: 1408, pc_perm: -1 },
      { id: 'shaft_floor', x1: 180, y1: 3993, x2: 454, y2: 3993, pc_perm: -1 },
    ];
    const floor = avatarGround(platforms, 2560, 3700, 1);
    assert.ok(floor > 3700, `fell to ${floor}, not up to the bend`);
    // A seam a few px over the feet still holds them (the slack).
    const seam = [{ id: 'a', x1: 0, y1: 500, x2: 100, y2: 500, pc_perm: -1 }];
    assert.equal(avatarGround(seam, 104, 500 + UNDER_LINE_SLACK - 4, 1), 500);
  });
});
