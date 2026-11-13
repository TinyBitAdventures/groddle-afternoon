// Ticket 37 follow-up (mr granberry, 2026-11-02): after reports 32/37 a quoin at head height was taken
// walking on a street, but not in Radial Heights or the other "Ticket to ..." courses, which kept their
// own 34-47 px circle 30 px over the feet, nor in the quest rooms with their own small boxes. Glitch had
// one rule for every quoin: items/quoin.js onPlayerCollision 156-159 runs for streets, games, races,
// rainbow_run and isParadiseLocation() alike (only the daily limit differs), on the 59 x 112 player box.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { quoinTouches } from '../public/js/quoins.js?v=61be601c';
import { PARADISE_COURSES, PARADISE_STAR_COURSES, paradisePickupTouches, paradiseQuoinScale } from '../public/js/paradise-flight.js?v=fdc76095';
import { touchesQuoin } from '../public/js/quest-rooms/kit.js?v=c436cb8a';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const gsjs = join(root, '../glitch-GameServerJS');
const FEET = { x: 500, y: 800 };
const at = (lift, dx = 0) => ({ x: FEET.x + dx, y: FEET.y - lift });

describe('ticket 37: head-height quoins are taken walking everywhere, as on a street', () => {
  it('Radial Heights and Slip \'N Slide stars: head height walking, beside the body not', () => {
    for (const id of PARADISE_STAR_COURSES) {
      const course = PARADISE_COURSES[id];
      for (const radius of [12, 17, 23]) {
        for (const lift of [30, 58, 92]) assert.ok(paradisePickupTouches(course, { ...at(lift), radius }, FEET), `${id} r${radius} ${lift} up`);
        assert.equal(paradisePickupTouches(course, { ...at(92, 60 + radius), radius }, FEET), false, `${id} r${radius} beside`);
        assert.equal(paradisePickupTouches(course, { ...at(112 + radius + 4), radius }, FEET), false, `${id} r${radius} over the head`);
      }
    }
  });

  it('Paradise quoin courses: the drawn coin on the street box, at head height walking', () => {
    for (const course of Object.values(PARADISE_COURSES)) {
      if (PARADISE_STAR_COURSES.includes(course.id)) continue;
      for (const lift of [58, 92]) assert.ok(paradisePickupTouches(course, at(lift), FEET), `${course.id} ${lift} up`);
      // The same box as quoinTouches with the course's drawn scale.
      const k = paradiseQuoinScale(course.id);
      for (const [lift, dx] of [[92, 40], [92, 46], [140, 0], [150, 0]]) {
        assert.equal(paradisePickupTouches(course, at(lift, dx), FEET), quoinTouches(at(lift, dx), FEET.x, FEET.y, { quoinScale: k }), `${course.id} ${lift}/${dx}`);
      }
    }
    // The old circle (47 px around 30 px over the feet) missed a head-height quoin: 62 px away.
    assert.ok(Math.hypot(0, 92 - 30) > 47);
  });

  it('a shrunk avatar\'s box shrinks with it', () => {
    const course = PARADISE_COURSES.radial_heights;
    assert.ok(paradisePickupTouches(course, { ...at(92), radius: 12 }, FEET));
    assert.equal(paradisePickupTouches(course, { ...at(92), radius: 12 }, FEET, { scale: 0.42 }), false);
  });

  it('quest-room quoins (kit.js touchesQuoin): the street rule, scaled with the coin and the avatar', () => {
    const ctx = (scale = 1) => ({ player: { ...FEET }, bodyScale: () => scale });
    const coin = (lift, dx = 0, spriteScale = 0.7) => ({ ...at(lift, dx), type: 'xp', spr: { scale: { y: spriteScale } } });
    for (const lift of [30, 58, 92]) assert.ok(touchesQuoin(ctx(), coin(lift)), `${lift} up`);
    assert.equal(touchesQuoin(ctx(), coin(140)), false, 'over the head takes a jump');
    assert.equal(touchesQuoin(ctx(), coin(58, 45)), false, 'beside the body');
    assert.equal(touchesQuoin(ctx(0.42), coin(92)), false, 'a shrunk avatar reaches less high');
    assert.equal(touchesQuoin({ player: null }, coin(58)), false);
    assert.equal(touchesQuoin(ctx(), coin(92)), quoinTouches(at(92), FEET.x, FEET.y, { quoinScale: 0.7 }));
  });

  it('no room or course keeps its own pickup distance', () => {
    const game = read('public/game.js');
    assert.doesNotMatch(game, /Math\.hypot\(entry\.sprite\.x - player\.x, entry\.sprite\.y - \(player\.y - 30\)\)/);
    assert.match(game, /paradisePickupTouches\(course, pick, player, \{ scale: bodyScale, typeId: entry\.typeId, drawnScale: entry\.sprite\.baseScale \}\)/);
    const rooms = {
      'public/js/quest-rooms/puzzle-kit.js': /if \(touchesQuoin\(ctx, q\)\) \{/,
      'public/js/quest-rooms/clubhouse.js': /if \(ctx\.kit\.touchesQuoin\(ctx, q\)\) \{/,
      'public/js/quest-rooms/top-of-tree.js': /if \(ctx\.kit\.touchesQuoin\(ctx, q\)\) \{/,
      'public/js/quest-rooms/gwendolyn.js': /if \(ctx\.kit\.touchesQuoin\(ctx, q\)\) \{/,
      'public/js/quest-rooms/le-miserable.js': /!ctx\.kit\.touchesQuoin\(ctx, q\)/,
      'public/js/quest-rooms/rainbow-run.js': /if \(touchesQuoin\(ctx, \{ \.\.\.c, type: COIN_TYPE \}\)\) \{/,
      'public/js/quest-rooms/an-autumn-day.js': /ctx\.kit\.touchesQuoin\(ctx, \{ \.\.\.q, type: 'qurazy' \}\)/,
      'public/js/features/puzzle-scenes-feature.js': /!quoinTouches\(\{ x: q\.x, y: q\.y, typeId: q\.type \}, p\.x, p\.y, \{ scale, quoinScale \}\)/,
      'public/js/features/purple-journey-feature.js': /if \(quoinTouches\(\{ x: q\.x, y: q\.y, typeId: q\.type \}, p\.x, p\.y, \{ scale, quoinScale \}\)\) \{/,
    };
    for (const [rel, re] of Object.entries(rooms)) assert.match(read(rel), re, rel);
    assert.equal((read('public/js/quest-rooms/esquibeth.js').match(/ctx\.kit\.touchesQuoin\(ctx, q\)/g) || []).length, 2);
  });

  it('the source runs one collision for every quoin', { skip: !existsSync(gsjs) && 'needs glitch-GameServerJS beside the repo' }, () => {
    const q = readFileSync(join(gsjs, 'items/quoin.js'), 'utf8').split('\n');
    assert.match(q[155], /^function onPlayerCollision\(pc\)\{/);
    assert.match(q[158], /isInstance\('rainbow_run'\) && !this\.container\.isParadiseLocation\(\)/);
  });
});
