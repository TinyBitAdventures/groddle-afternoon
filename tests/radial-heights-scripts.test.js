// G1119: Radial Heights runs its own location scripts (LHFQOLEIHN63P27.xml events, on the shared
// runtime js/location-events.js): stars hidden on arrival and lit when touched, the grey guide stars
// and their quoins revealed in spiral order after the flitterbug, and two endings. In order (verify_01
// to 53): "You're a star", COMEDIAN, "Exit's down here!" and four Qurazies, no moon. Any other order
// (master_check): the moon, "Good work, you've got all the stars!", the exit sign and one Qurazy.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  RADIAL_ARRIVAL_EVENTS,
  RADIAL_FLITTERBUG_EVENTS,
  createRadialSession,
  effectQuoins,
  eventQuoinReward,
  radialFire,
  radialStarEvents,
  radialStarNumbers,
  radialTick,
} from '../public/js/radial-heights.js?v=90fcc768';
import {
  PARADISE_COURSES,
  RADIAL_HEIGHTS_STAR_ART,
  collectParadiseEventQuoin,
  collectParadisePickup,
  createParadiseRun,
  paradiseSourcePoints,
} from '../public/js/paradise-flight.js?v=1bc7c0c5';
import { parseEventCode } from '../public/js/location-events.js?v=48938c8f';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const data = JSON.parse(readFileSync(join(ROOT, 'assets/streets/GHFQOLEIHN63P27.json'), 'utf8'));
const game = readFileSync(join(ROOT, 'game.js'), 'utf8');
const radial = PARADISE_COURSES.radial_heights;
const MOON = 'moon_asset_smile_1339642021284';
const EXIT_SIGN = 'groddle_sign_blank_1340666150610';
const GOOD_WORK = 'groddle_sign_blank_1340666150612';

function arrive() {
  const session = createRadialSession(data.events);
  const arrival = radialFire(session, RADIAL_ARRIVAL_EVENTS, 0);
  const reveal = radialFire(session, RADIAL_FLITTERBUG_EVENTS, 100);
  reveal.push(...radialTick(session, 100 + 53 * 25));
  return { session, arrival, reveal };
}
const shown = (effects) => effects.filter((fx) => fx.type === 'deco' && fx.visible).map((fx) => fx.id);
const qurazies = (effects) => effectQuoins(effects).filter((q) => q.props.type === 'qurazy').length;

describe('Radial Heights scripts (G1119)', () => {
  it('arrival hides the 53 yellow stars, the 39 grey stars, the moon, the star art and both signs', () => {
    const { arrival } = arrive();
    const hidden = new Set(arrival.filter((fx) => fx.type === 'deco' && !fx.visible).map((fx) => fx.id));
    const points = paradiseSourcePoints(radial, data);
    assert.equal(points.length, 53);
    for (const p of points) assert.ok(hidden.has(p.id), `yellow ${p.id}`);
    for (const id of [MOON, RADIAL_HEIGHTS_STAR_ART.id, EXIT_SIGN, GOOD_WORK]) assert.ok(hidden.has(id), id);
    assert.equal(hidden.size, 96);
  });

  it('the flitterbug reveals the 39 grey stars in spiral order, 25 ms apart, and sets down 14 quoins', () => {
    const session = createRadialSession(data.events);
    radialFire(session, RADIAL_ARRIVAL_EVENTS, 0);
    const first = radialFire(session, RADIAL_FLITTERBUG_EVENTS, 1000);
    assert.equal(effectQuoins(first).length, 1, 'hide_cover_01 sets down its quoin at once');
    assert.equal(shown(radialTick(session, 1024)).filter((id) => id.startsWith('star_asset_02')).length, 0);
    assert.deepEqual(shown(radialTick(session, 1025)), ['star_asset_02_1339609697569']);
    const rest = radialTick(session, 1000 + 53 * 25);
    assert.equal(shown(rest).length, 38);
    assert.equal(effectQuoins(rest).length, 13);
    // Each star's number is the show_star_NN that lights it, one each.
    assert.equal(new Set(radialStarNumbers(data.events).values()).size, 53);
  });

  it('in order: "You\'re a star", COMEDIAN, the exit sign and four Qurazies, and no moon', () => {
    const { session } = arrive();
    const end = [];
    for (let n = 1; n <= 53; n += 1) end.push(...radialFire(session, radialStarEvents(n), 5000));
    const ids = shown(end);
    assert.ok(ids.includes(RADIAL_HEIGHTS_STAR_ART.id));
    assert.ok(ids.includes(EXIT_SIGN));
    assert.ok(!ids.includes(MOON) && !ids.includes(GOOD_WORK));
    assert.equal(qurazies(end), 4);
    assert.ok(end.some((fx) => fx.type === 'sound' && fx.name === 'COMEDIAN'));
  });

  it('out of order: the moon, "Good work", the exit sign and one Qurazy, and no star art', () => {
    const { session } = arrive();
    const end = [];
    for (const n of [2, 1, ...Array.from({ length: 51 }, (_, i) => i + 3)]) end.push(...radialFire(session, radialStarEvents(n), 5000));
    const ids = shown(end);
    assert.ok(ids.includes(MOON) && ids.includes(GOOD_WORK) && ids.includes(EXIT_SIGN));
    assert.ok(!ids.includes(RADIAL_HEIGHTS_STAR_ART.id));
    assert.equal(qurazies(end), 1);
    assert.ok(end.some((fx) => fx.type === 'sound' && fx.name === 'MOON_APPEARS'));
  });

  it('a star touched again later still counts for the order (its box fires on each way in)', () => {
    const { session } = arrive();
    const end = [];
    end.push(...radialFire(session, radialStarEvents(2), 5000));
    for (let n = 1; n <= 53; n += 1) end.push(...radialFire(session, radialStarEvents(n), 6000));
    assert.equal(qurazies(end), 4);
  });

  it('stars pay nothing themselves; the scripted quoins pay as items/quoin.js', () => {
    const run = createParadiseRun('radial_heights', { now: 0 });
    const touch = collectParadisePickup(run, 0, 1);
    assert.equal(touch.ok, true);
    assert.equal(touch.reward, null);
    assert.deepEqual(eventQuoinReward({ class_name: 'paradise iMG' }), { type: 'xp', benefit: 1, giantId: null });
    assert.deepEqual(eventQuoinReward({ class_name: '', type: 'xp', is_random: 1, benefit_floor: 2, benefit_ceil: 6 }, () => 0.5), { type: 'xp', benefit: 4, giantId: null });
    assert.deepEqual(eventQuoinReward({ type: 'favor', benefit: 1, giant: 'cosma' }), { type: 'favor', benefit: 1, giantId: 'cosma' });
    assert.equal(eventQuoinReward({ type: 'qurazy' }).type, 'qurazy');
    const paid = collectParadiseEventQuoin(run, 'q1', eventQuoinReward({ type: 'xp', benefit: 25 }), 2, { multiplier: 3 });
    assert.equal(paid.reward.amount, 75);
    assert.equal(collectParadiseEventQuoin(run, 'q1', eventQuoinReward({ type: 'xp', benefit: 25 }), 3).ok, false);
    assert.equal(eventQuoinReward({ type: 'qurazy' }).type, 'qurazy');
  });

  it('the event builder keeps a script\'s quoins', () => {
    assert.deepEqual(parseEventCode("var s = loc.createItemStack('quoin', 1, -400, -500);\n\ns.setInstanceProp('class_name', '');\ns.setInstanceProp('type', 'qurazy');"), { type: 'quoin', x: -400, y: -500, props: { class_name: '', type: 'qurazy' } });
    assert.equal(effectQuoins(data.events.spawn_reward_2.map((a) => a.code)).length, 4);
  });

  it('game.js runs the scripts on the course', () => {
    assert.match(game, /function startRadialScripts\(data\) \{[^]*radialFire\(paradiseRadial\.session, RADIAL_ARRIVAL_EVENTS/);
    assert.match(game, /radialFire\(paradiseRadial\.session, RADIAL_FLITTERBUG_EVENTS, Date\.now\(\)\)/);
    assert.match(game, /radialFire\(paradiseRadial\.session, radialStarEvents\(entry\.starNumber\), now\)/);
    assert.match(game, /applyParadiseEventEffects\(radialTick\(paradiseRadial\.session, now\)\)/);
    assert.match(game, /fx\.type === 'quoin'\) \{\n\s*spawnParadiseEventQuoin\(fx\)/);
    assert.deepEqual(radial.rewards, []);
  });
});
