/**
 * #737: the Ball moved a fixed 200 px per hit on every street. Plexus is a low-gravity street
 * (gravity 345 against the normal 1190, GHVDIELDQQ7228K.xml physics), yet the ball went "a tiny bit
 * away and then stopped". Austin's ruling: it flies by the street's gravity. Glitch's ball.js called
 * apiHitTheBall(200, 10, 0.5), whose engine code is lost, so 200 px is the normal-gravity hit; the
 * same knock under less gravity carries farther, higher and longer (a launch's range and height go
 * as 1/g). It stays inside the street, and online each player keeps their own ball.
 * Run: node --test tests/ball-gravity-737.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BALL_HIT, ballHitPose, planBallHit } from '../public/js/small-items.js?v=0b9ea3fa';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(here, '..', rel), 'utf8');
const street = (tsid) => JSON.parse(read(`public/assets/streets/${tsid}.json`));
const gravityOf = (tsid) => street(tsid).physics?.setting?.gravity ?? 1190;
const PLEXUS = 'GHVDIELDQQ7228K';
const NANDU_PITHA = 'GA9DURMSIAA2S1T';
const wide = { minX: 40, maxX: 5960 };
const flight = (plan) => Math.abs(plan.to - plan.from);
const peak = (plan) => Math.max(...Array.from({ length: plan.frames + 1 }, (_, f) => ballHitPose(plan, f).lift));

describe('#737 the Ball flies by the street\'s gravity', () => {
  it('the two Ball streets: Plexus at 345, Nandu Pitha at the normal 1190', () => {
    assert.equal(gravityOf(PLEXUS), 345);
    assert.equal(gravityOf(NANDU_PITHA), 1190);
  });

  it('normal gravity keeps the 200 px hit of ball.js apiHitTheBall(200, 10, 0.5)', () => {
    for (const plan of [planBallHit(3000, 2900, wide), planBallHit(3000, 2900, { ...wide, gravity: 1190 })]) {
      assert.equal(flight(plan), BALL_HIT.distance);
      assert.equal(plan.frames, BALL_HIT.riseFrames * 4);
    }
  });

  it('on Plexus it floats: farther, higher and longer, by 1190 / 345', () => {
    const normal = planBallHit(3000, 2900, { ...wide, gravity: gravityOf(NANDU_PITHA) });
    const plexus = planBallHit(3000, 2900, { ...wide, gravity: gravityOf(PLEXUS) });
    const k = 1190 / 345;
    assert.equal(flight(plexus), Math.round(BALL_HIT.distance * k));
    assert.ok(flight(plexus) > 3 * flight(normal), `${flight(plexus)} px vs ${flight(normal)} px`);
    assert.equal(plexus.frames, Math.round(BALL_HIT.riseFrames * 4 * k));
    assert.ok(peak(plexus) > 3 * peak(normal));
    // It still comes down where it was going, with its half-height bounce.
    const end = ballHitPose(plexus, plexus.frames);
    assert.equal(Math.round(end.x), plexus.to);
    assert.ok(end.lift < 1e-6);
    assert.equal(end.done, true);
  });

  it('stays inside the street: the ends clamp it, and a ceiling caps how high it goes', () => {
    const g = gravityOf(PLEXUS);
    assert.equal(planBallHit(5700, 5600, { ...wide, gravity: g }).to, 5960);
    assert.equal(planBallHit(300, 400, { ...wide, gravity: g }).to, 40);
    const capped = planBallHit(3000, 2900, { ...wide, gravity: g, maxLift: 120 });
    assert.ok(peak(capped) <= 120);
    // A nonsense gravity neither stops the ball nor sends it off for ever.
    for (const bad of [0, -5, NaN, 'x']) assert.equal(flight(planBallHit(3000, 2900, { ...wide, gravity: bad })), BALL_HIT.distance, String(bad));
    assert.ok(flight(planBallHit(3000, 2900, { ...wide, gravity: 1 })) <= BALL_HIT.distance * 5);
  });

  it('the hit reads the street\'s gravity (location events), its ceiling, and nothing goes online', () => {
    const feature = read('public/js/features/small-items-feature.js');
    const hit = feature.slice(feature.indexOf('export function hitBall('), feature.indexOf('function tickBall('));
    assert.match(hit, /gravity: engine\.query\?\.\('streetGravity', engine\)/);
    assert.match(hit, /maxLift:/);
    assert.doesNotMatch(hit, /realtime|send\(|broadcast/);
    const events = read('public/js/features/location-events-feature.js');
    assert.match(events, /\n  streetGravity\(engine\) \{/);
  });
});
