/**
 * G978 (Austin 2026-11-17, R16 calls): the inventions he ruled out are gone from the game and
 * recorded as dropped in tools/inventions/inventions.json with the ruling. Each test reads the
 * code that drew one, so it cannot come back unregistered.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { VENDOR_PROFILES } from '../public/js/vendor.js?v=f9bee39e';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const game = read('public/game.js');
const register = JSON.parse(read('tools/inventions/inventions.json'));
const entry = (id) => register.entries.find((e) => e.id === id);
const fn = (src, name) => {
  const at = src.indexOf(`function ${name}(`);
  assert.ok(at >= 0, name);
  return src.slice(at, src.indexOf('\n}\n', at) + 2);
};

function dropped(id) {
  const e = entry(id);
  assert.equal(e?.status, 'dropped', id);
  assert.match(e.ruling, /Austin 2026-11-17 \(G978/, id);
  assert.ok(e.rows.includes('G978'), id);
}

describe('G978: dropped inventions stay gone', () => {
  it('the vendor crest: no disc or store letter on a Street Spirit (GSJS spirits have only store_id)', () => {
    dropped('vendor-crest');
    const spawn = fn(game, 'spawnVendorNpc');
    assert.doesNotMatch(spawn, /crest|badge|\.circle\(/);
    for (const v of Object.values(VENDOR_PROFILES)) assert.equal('badge' in v, false, v.key);
    assert.doesNotMatch(read('build-stores.mjs'), /badge/);
    assert.match(read('public/js/features/street-spirits-feature.js'), /const \[body, label\] = g\.children;/);
  });
});

describe('G978: no dot bursts', () => {
  it('nothing scatters coloured dots round the avatar after an action (no client counterpart)', () => {
    dropped('burst-dots');
    assert.doesNotMatch(game, /\bburst\(/);
    assert.doesNotMatch(game, /\bparticles\b/);
    assert.doesNotMatch(read('public/js/paradise-course-runtime.js'), /host\.burst/);
    assert.doesNotMatch(read('public/js/features/seasons-feature.js'), /\bburst\(|tickFx/);
  });
});

describe('G978: flyers fly on (npc_butterfly.js flyAround)', () => {
  it('a yard Butterfly never stops in the air and flies level at its own height; street flyers too', async () => {
    dropped('flyer-hover-bob');
    const { YARD_WANDER, yardPlan, yardWanderAt } = await import('../public/js/yard-wander.js?v=28f55f45');
    const { CREATURE_PATHS, flierAt, flierPlan } = await import('../public/js/street-creatures.js?v=5ca995d4');
    assert.equal('pauses' in YARD_WANDER.npc_butterfly, false);
    assert.equal('bob' in YARD_WANDER.npc_butterfly, false);
    const plan = yardPlan({ id: 'a5', classId: 'npc_butterfly', left: 300, right: 800 });
    assert.ok(plan.segs.every((s) => s.pose === 'walk'), 'no hover');
    const animal = { id: 'a5', classId: 'npc_butterfly', homeX: 500, worldW: 2000 };
    const lifts = new Set();
    for (let t = 0; t < 60_000; t += 500) lifts.add(yardWanderAt(animal, t).lift);
    assert.equal(lifts.size, 1, 'one height, no bob');
    // A street flyer: no bob either. Between two places it climbs or sinks straight (lane flyk:
    // apiStartFlyingInTheArea's random heights), never a wave.
    assert.equal('fly' in CREATURE_PATHS, false);
    const home = { seed: 7, worldW: 2000, groundY: 400 };
    const { legs, offset } = flierPlan(home);
    const leg = legs[2];
    const at = (u) => flierAt(home, leg.at + leg.ms * u - offset);
    for (const u of [0.2, 0.4, 0.6]) assert.ok(Math.abs(at(u).y + at(u + 0.2).y - 2 * at(u + 0.1).y) < 1e-6, 'no bob');
    assert.doesNotMatch(game, /b\.phase/);
  });
});

describe('G978: the party booster is an invisible box', () => {
  it('no pad, bulbs or confetti in a party space (players/inc_physics.js physics_event_run: a Collision-triggered Event Box)', async () => {
    dropped('party-booster-pad');
    const feature = read('public/js/features/party-spaces-feature.js');
    assert.doesNotMatch(feature, /Overlay|bulbs|confetti/);
    assert.match(fn(feature, 'spawnBooster'), /booster = \{ x: point\.x, y: point\.y, w: 70, h: 40, cooldownUntil: 0 \};/);
    assert.doesNotMatch(fn(feature, 'spawnBooster'), /PIXI|Graphics/);
    const { PARTY_SPACES } = await import('../public/js/party-spaces.js?v=b026ad60');
    for (const s of Object.values(PARTY_SPACES)) assert.ok(!('ambience' in s) && !('palette' in s), s.id);
  });
});

describe('G978: the Rook has no stun ring or drawn feathers', () => {
  it('only Tiny Speck\'s rook_feathers_falling and the badge stars (the client shows rook_feathers_falling only)', () => {
    dropped('rook-stun-ring');
    const rook = read('public/js/features/rook-attack-feature.js');
    assert.doesNotMatch(rook, /spawnFeathers|updateFeathers|ui\.rookStars|drawStar|\.ellipse\(/);
    assert.match(rook, /playOverlay\(engine\.PIXI, 'rook_feathers_falling'/);
  });
});

describe('G978: no falling snow on the Winter Walk', () => {
  it('the snow and its veil are gone; the blizzard bank at the portal stays (Glitch had no weather)', () => {
    dropped('winter-walk-snow');
    assert.doesNotMatch(game, /winterSnow|_winterFlake|_winterVeil/);
    assert.match(game, /function spawnWinterPortal\(/);
  });
});

describe('G978: the dead-end exit is a wall sign', () => {
  it('no post: the arrow hangs as the practice streets\' EXIT, the source\'s wall sign', async () => {
    dropped('dead-end-standing-sign');
    assert.equal(entry('dead-end-exit-sign').status, 'kept');
    const { DEAD_END_EXIT } = await import('../public/js/dead-ends.js?v=8b015857');
    assert.equal('post' in DEAD_END_EXIT, false);
    assert.equal(DEAD_END_EXIT.hang, 62);
    const view = fn(read('public/js/features/dead-ends-feature.js'), 'buildView');
    assert.doesNotMatch(view, /post|roundRect|ellipse/);
    assert.match(view, /board\.y = -e\.hang;/);
  });
});

describe('G978: no exit sign in Storyland', () => {
  it('the theatre GNVD57N9ERF3TNH has no signpost; the HUD Leave returns you', () => {
    dropped('storyland-exit-sign');
    // The made-up sign stays gone; Glitch's own walk-in exit box (instance_exit, G1163) is the way out again.
    assert.doesNotMatch(game, /greedy_story_exit|createGreedyExitSprite|RETURN TO UR/);
    assert.match(read('public/js/greedy-street-spirit.js'), /GREEDY_EXIT_BOX_ID = 'instance_exit'/);
    assert.doesNotMatch(read('public/content.js'), /leave_storyland/);
    assert.match(game, /getElementById\('greedy-street-leave-btn'\)\?\.addEventListener\('click', confirmLeaveGreedyStreetSpirit\)/);
  });
});

describe('G978: no Stoot memorial on unnnn', () => {
  it('no plaque or installed doll on GIFPV9EMLT72DP4 (a dev street with no such plaque); the doll is still an item', () => {
    dropped('stoot-memorial-plaque');
    assert.doesNotMatch(game, /spawnStootMemorial|stootDollTarget|An old friend, still making Ur brighter/);
    assert.match(game, /function pullPackedStootDoll\(/);
    assert.match(game, /data\.hubName = 'Jethimadh Tower: Mid'/);
  });
});

describe('G978: no SHUT planks over a closed Paradise exit', () => {
  it('the closed exit is only dimmed until the goal is met', () => {
    dropped('paradise-exit-shut-sign');
    assert.doesNotMatch(game, /paradiseExitShutSign|text: 'SHUT'|paradiseExit\.shut/);
    assert.match(fn(game, 'spawnParadiseExit'), /root\.alpha = 0\.82;/);
    assert.match(fn(game, 'unlockParadiseExit'), /paradiseExit\.sprite\.alpha = 1;/);
  });
});

describe('G978: Paradise skies are Radial Heights\' gradient', () => {
  it('top and bottom 222E (GHFQOLEIHN63P27.xml), no table of palettes in game.js; G1160: the snaps\' own skies (js/paradise-flight.js PARADISE_SKIES) where a course has them', () => {
    dropped('paradise-sky-palettes');
    assert.match(game, /const PARADISE_SKY_GRADIENT = Object\.freeze\(\{ top: 0x00222e, bottom: 0x00222e \}\);/);
    const paint = fn(game, 'paintParadiseSky');
    assert.doesNotMatch(paint, /const palettes|cloud_rings: \[/);
    assert.match(paint, /const stops = paradiseSkyStops\(course, PARADISE_SKY_GRADIENT\);/);
    const street = JSON.parse(read('public/assets/streets/GHFQOLEIHN63P27.json'));
    assert.deepEqual(street.gradient, { top: '00222E', bottom: '00222E' });
  });
});

describe('G978: no dots in place of a lonely spirit\'s fireworks', () => {
  it('without the fireworks art nothing is drawn', () => {
    dropped('lonely-fireworks-dots');
    const lonely = read('public/js/features/spirit-loneliness-feature.js');
    assert.doesNotMatch(lonely, /function burst\(|lonely-fireworks|'dots'/);
    assert.match(lonely, /rt\.fireworksArt = ok \? 'under' : 'none';/);
  });
});
