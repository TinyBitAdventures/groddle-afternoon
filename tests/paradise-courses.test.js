import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  EXTRA_PARADISE_COURSES,
  EXTRA_PARADISE_COURSE_IDS,
  PARADISE_BODY,
  PARADISE_PICKUP_RADIUS,
  ARBOR_NEST,
  DRAFTY_UPLIFT_JOKES,
  PARADISE_UNCONFIRMED_RELEASE_LINE,
  SKY_PLUNGE_BACK_TO_TOP,
  SKY_PLUNGE_LANDING_SIGNS,
  SKY_PLUNGE_LANDING_Y,
  SKY_PLUNGE_QURAZY_INDEX,
  resolveParadiseCourseAlias,
  stepParadiseBody,
  usesParadiseBody,
} from '../public/js/paradise-courses.js?v=g403-1';
import {
  PARADISE_COURSES,
  PARADISE_DAILY_LIMIT,
  PARADISE_TICKET_IDS,
  activateParadiseTicket,
  collectParadisePickup,
  createParadiseRun,
  createParadiseState,
  finishParadiseRun,
  paradiseTicketCost,
  resolveParadiseReward,
} from '../public/js/paradise-flight.js';
import { QURAZY_REWARDS } from '../public/js/quoins.js';
import { remakeStatus } from '../public/js/imagination-remake.js?v=g403-1';

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(here, '..', 'public');

// source: config_prod.js paradise_locations + items/paradise_ticket_<id>.js
const SOURCE = {
  abysmal_thrill: ['LHF5NUH5UT53VSG', 'Abysmal Thrill', "Activate this card to explore the depths of Abysmal Thrill, floating up as you test your quoin-gettin' skills."],
  aerial_boost: ['LHF1CF7EER5306P', 'Aerial Boost', 'Activate this card to bounce atop fluffy clouds, grabbing quoins as you journey upwards.'],
  arbor_hollow: ['LHFDKS616Q23NT6', 'Arbor Hollow', 'Activate this card to climb to the tall of Arbor Hollow, grabbing quoins on the way up AND back down.'],
  bippity_bop: ['LHFS1L44SR53F5O', 'Bippity Bop', "Activate this card to bounce along a fluffy, joyful skyscape! You'll probably get some quoins out of it too."],
  cloud_flight: ['LHFOLH3T7I23A8M', 'Cloud Flight', 'Activate this card to sail about Cloud Flight. Tickle the tree-tops, collecting quoins as you fly.'],
  drafty_uplift: ['LHFRHB1SKR53402', 'Drafty Uplift', "Activate this card to chill out and enjoy a good joke. It's the little things that make life great, champ."],
  mountain_scaling: ['LHFSE9JCDR53EG8', 'Mountain Scaling', 'Activate this card to traipse along the tippity-top of a mountain landscape. Try not to fall down into the clouds!'],
  sky_plunge: ['LHFO01RM7I238UN', 'Sky Plunge', 'Activate this card to take the Sky Plunge! Swiftly drop through morning clouds, collecting quoins as you fall.'],
  updraft: ['LHF9DQTKQT53RDI', 'Updraft', 'Activate this card to ride the strong wind emanating from a mysterious cloud-hole in the sky. Glide right, and grab those quoins!'],
};

const touches = (pick, body) =>
  Math.hypot(pick.x - body.x, pick.y - (body.y - 30)) < PARADISE_PICKUP_RADIUS;

test('all nine missing production templates are registered with source names and tickets', () => {
  assert.deepEqual([...EXTRA_PARADISE_COURSE_IDS].sort(), Object.keys(SOURCE).sort());
  for (const [id, [tsid, name, desc]] of Object.entries(SOURCE)) {
    const course = PARADISE_COURSES[id];
    assert.ok(course, id);
    assert.equal(course.templateTsid, tsid);
    assert.equal(course.name, name);
    assert.equal(course.ticketDesc, desc);
    assert.equal(course.ticketId, `paradise_ticket_${id}`);
    assert.ok(PARADISE_TICKET_IDS.includes(course.ticketId));
    assert.equal(course.starterTicket, false, 'new tickets come from the imagination shop, not the starter pack');
    assert.equal(remakeStatus(`ticket_to_paradise_${id}`).status, 'live');
  }
  // The shipped four are untouched and Beam Me Down stays a puzzle scene;
  // its card is live because the puzzle-scenes feature activates the ticket.
  assert.equal(Object.keys(PARADISE_COURSES).length, 13);
  assert.equal(PARADISE_COURSES.beam_me_down, undefined);
  assert.equal(remakeStatus('ticket_to_paradise_beam_me_down').status, 'live');
});

test('official 33x44 ticket icons ship for every new course', () => {
  for (const id of EXTRA_PARADISE_COURSE_IDS) {
    const file = path.join(publicDir, 'assets', 'sprites', 'icons', `paradise_ticket_${id}.png`);
    const png = fs.readFileSync(file);
    assert.equal(png.readUInt32BE(16), 33, id);
    assert.equal(png.readUInt32BE(20), 44, id);
  }
});

test('new tickets share the source price curve, eleven-a-day cap and four-minute run', () => {
  assert.equal(paradiseTicketCost(1), 20);
  const now = Date.UTC(2026, 9, 21);
  const state = createParadiseState({}, now);
  for (let index = 0; index < PARADISE_DAILY_LIMIT; index += 1) {
    const id = EXTRA_PARADISE_COURSE_IDS[index % EXTRA_PARADISE_COURSE_IDS.length];
    assert.equal(activateParadiseTicket(state, id, { imagination: 9999, now }).ok, true);
  }
  assert.equal(activateParadiseTicket(state, 'updraft', { imagination: 9999, now }).reason, 'daily_limit');
  assert.equal(state.visits.aerial_boost, 2);
  const run = createParadiseRun('mountain_scaling', { now: 0 });
  assert.equal(run.expiresAt, 240000);
  assert.equal(finishParadiseRun(run, 1000).reason, 'objective_incomplete');
  for (let index = 0; index < PARADISE_COURSES.mountain_scaling.pickupCount; index += 1) {
    assert.equal(collectParadisePickup(run, index, 2000).ok, true);
  }
  assert.equal(finishParadiseRun(run, 3000).completionReward.amount, 1098);
});

test('rewards line up one-to-one with pickups and keep recorded amounts', () => {
  const types = new Set(['xp', 'currants', 'mood', 'energy', 'favor']);
  const giants = new Set(['alph', 'cosma', 'friendly', 'grendaline', 'humbaba', 'lem', 'mab', 'pot', 'spriggan', 'ti', 'zille']);
  for (const course of Object.values(EXTRA_PARADISE_COURSES)) {
    assert.equal(course.rewards.length, course.pickupCount, course.id);
    assert.ok(course.pickupCount >= 20, course.id);
    for (const entry of course.rewards) {
      if (entry.type === 'qurazy') {
        // Level-indexed when collected (resolveParadiseReward).
        assert.equal(course.id, 'sky_plunge');
        continue;
      }
      assert.ok(types.has(entry.type), `${course.id} ${entry.type}`);
      assert.ok(entry.amount > 0);
      if (entry.type === 'favor') assert.ok(giants.has(entry.giantId), entry.giantId);
    }
    assert.match(course.objective, new RegExp(String(course.pickupCount)));
    for (const pick of course.pickups) {
      assert.ok(pick.x > 0 && pick.x < course.width && pick.y > 0 && pick.y < course.height, course.id);
    }
    assert.equal(course.palette.length, 4);
  }
  // Recorded endings: Mountain Scaling +1098, Abysmal / Arbor / Cloud Flight +954, Bippity Bop +858.
  assert.equal(EXTRA_PARADISE_COURSES.mountain_scaling.completionReward.amount, 1098);
  assert.equal(EXTRA_PARADISE_COURSES.abysmal_thrill.completionReward.amount, 954);
  assert.equal(EXTRA_PARADISE_COURSES.arbor_hollow.completionReward.amount, 954);
  assert.equal(EXTRA_PARADISE_COURSES.cloud_flight.completionReward.amount, 954);
  assert.equal(EXTRA_PARADISE_COURSES.bippity_bop.completionReward.amount, 858);
  assert.equal(EXTRA_PARADISE_COURSES.mountain_scaling.rewards.at(-1).amount, 3000);
  assert.equal(EXTRA_PARADISE_COURSES.mountain_scaling.rewards.find((r) => r.type === 'favor').giantId, 'zille');
  assert.equal(EXTRA_PARADISE_COURSES.abysmal_thrill.rewards.find((r) => r.type === 'favor').giantId, 'ti');
  // The Arbor nest quoin is the +3000 one.
  const arbor = EXTRA_PARADISE_COURSES.arbor_hollow;
  const nestIndex = arbor.pickups.findIndex((pick) => pick.y < ARBOR_NEST.y && pick.x === 800);
  assert.equal(arbor.rewards[nestIndex].amount, 3000);
});

test('recorded on-screen text is kept verbatim; description-only courses are flagged', () => {
  const bippity = EXTRA_PARADISE_COURSES.bippity_bop.signs.map((sign) => sign.text.replace(/\n/g, ' '));
  assert.deepEqual(bippity, [
    'Ever wonder what being inside a cloud would feel like?',
    'Fluffy. Like marshmallows and cotton candy.',
  ]);
  assert.equal(EXTRA_PARADISE_COURSES.abysmal_thrill.signs[0].text.replace(/\n/g, ' '), 'Jump to float up');
  assert.equal(
    EXTRA_PARADISE_COURSES.mountain_scaling.completion,
    "Whether you're big or small, scaling mountains is some tough business! Congratulations! You made it!"
  );
  for (const id of ['updraft', 'drafty_uplift']) {
    assert.equal(EXTRA_PARADISE_COURSES[id].reference, 'description');
  }
  assert.equal(EXTRA_PARADISE_COURSES.sky_plunge.reference, 'card-forum');
  for (const id of ['aerial_boost', 'mountain_scaling', 'abysmal_thrill', 'arbor_hollow', 'bippity_bop', 'cloud_flight']) {
    assert.equal(EXTRA_PARADISE_COURSES[id].reference, 'video');
  }
  assert.equal(DRAFTY_UPLIFT_JOKES.length, 5);
});

test('?paradise= aliases resolve every new course', () => {
  assert.equal(resolveParadiseCourseAlias('mountain'), 'mountain_scaling');
  assert.equal(resolveParadiseCourseAlias('Aerial-Boost'), 'aerial_boost');
  assert.equal(resolveParadiseCourseAlias('bop'), 'bippity_bop');
  assert.equal(resolveParadiseCourseAlias('skyplunge'), 'sky_plunge');
  assert.equal(resolveParadiseCourseAlias('cloudflight'), 'cloud_flight');
  assert.equal(resolveParadiseCourseAlias('cloud'), null, 'cloud stays Cloud Rings in game.js');
  for (const id of EXTRA_PARADISE_COURSE_IDS) assert.equal(resolveParadiseCourseAlias(id), id);
});

// --- physics -------------------------------------------------------------

function body(x, y, extra = {}) {
  return { x, y, vx: 0, vy: 0, onGround: true, ...extra };
}

function run(course, b, frames, input = {}) {
  const events = [];
  for (let index = 0; index < frames; index += 1) {
    events.push(...stepParadiseBody(course, b, index === 0 ? input : { ...input, jumpPressed: false }, 1).events);
  }
  return events;
}

test('platform jumps use the normal avatar arc (about 110 px apex)', () => {
  const course = EXTRA_PARADISE_COURSES.mountain_scaling;
  const b = body(150, 640);
  let apex = b.y;
  for (let index = 0; index < 60; index += 1) {
    stepParadiseBody(course, b, { jumpPressed: index === 0 }, 1);
    apex = Math.min(apex, b.y);
  }
  assert.ok(640 - apex > 100 && 640 - apex < 115, `apex ${640 - apex}`);
  assert.equal(b.onGround, true);
  assert.equal(b.y, 640);
});

test('rock blocks stop walking into a cliff face and the clouds return you to the last rock', () => {
  const course = EXTRA_PARADISE_COURSES.mountain_scaling;
  const b = body(800, 620);
  run(course, b, 60, { right: true });
  assert.ok(b.x <= 860 - PARADISE_BODY.halfWidth + 0.01, `stopped at ${b.x}`);
  const faller = body(300, 640);
  faller.safe = { x: 300, y: 640 };
  faller.x = 430; // over the gap between the start crag and the first pillar
  faller.onGround = false;
  const events = run(course, faller, 200);
  assert.ok(events.includes('respawn'));
  assert.deepEqual([faller.x, faller.y], [300, 640]);
});

test('bounce clouds launch, and holding Space on landing bounces higher', () => {
  const course = EXTRA_PARADISE_COURSES.bippity_bop;
  const apexFrom = (held) => {
    const b = body(1000, 700, { onGround: false });
    let apex = 900;
    let bounced = false;
    for (let index = 0; index < 200; index += 1) {
      const { events } = stepParadiseBody(course, b, { jumpHeld: held }, 1);
      if (events.includes('bounce')) bounced = true;
      if (bounced) apex = Math.min(apex, b.y);
    }
    return 790 - apex;
  };
  const normal = apexFrom(false);
  const boosted = apexFrom(true);
  assert.ok(normal > 250 && normal < 285, `normal ${normal}`);
  assert.ok(boosted > 345 && boosted < 380, `boosted ${boosted}`);
  // Bounce clouds never let you stand still.
  const aerial = EXTRA_PARADISE_COURSES.aerial_boost;
  const b = body(420, 3500, { onGround: false });
  const events = run(aerial, b, 30);
  assert.ok(events.includes('bounce'));
  assert.equal(b.onGround, false);
});

test('Abysmal water: each stroke floats you up under low gravity', () => {
  const course = EXTRA_PARADISE_COURSES.abysmal_thrill;
  const b = body(500, 3280);
  let apex = b.y;
  for (let index = 0; index < 120; index += 1) {
    stepParadiseBody(course, b, { jumpPressed: index === 0 }, 1);
    apex = Math.min(apex, b.y);
  }
  assert.ok(3280 - apex > 150 && 3280 - apex < 260, `stroke rise ${3280 - apex}`);
  // Sinking is slow: terminal fall stays well under the land terminal speed.
  const sinker = body(500, 1000, { onGround: false });
  run(course, sinker, 240);
  assert.ok(sinker.vy <= 6.41);
  assert.ok(usesParadiseBody(course));
  assert.equal(usesParadiseBody(EXTRA_PARADISE_COURSES.cloud_flight), false);
});

test('dt larger than one frame is substepped without tunnelling through platforms', () => {
  const course = EXTRA_PARADISE_COURSES.arbor_hollow;
  const b = body(1150, 600, { onGround: false, vy: 11 });
  for (let index = 0; index < 400 && !b.onGround; index += 1) stepParadiseBody(course, b, {}, 2.5);
  assert.equal(b.y, 3180, 'the drop lands on the forest floor, not inside it');
});

// --- reachability ----------------------------------------------------------

/**
 * Breadth-first search over platforms with the real body step: from sampled
 * standing points (or bounce contacts) try walking, jumping and steering
 * left/none/right with a few release timings. Every pickup and the exit must
 * be reached by some trajectory from the spawn.
 */
function explorePlatformCourse(course) {
  const platforms = course.platforms;
  const exitIndex = platforms.findIndex((p) =>
    course.exit.x >= p.x1 && course.exit.x <= p.x2 && Math.abs(course.exit.y - p.y) < 1
  );
  const spawnIndex = platforms.findIndex((p) =>
    course.spawn.x >= p.x1 && course.spawn.x <= p.x2 && Math.abs(course.spawn.y - p.y) < 1
  );
  assert.ok(spawnIndex >= 0 && exitIndex >= 0, `${course.id} spawn/exit sit on platforms`);
  const seen = new Set([spawnIndex]);
  const queue = [spawnIndex];
  const got = new Set();
  while (queue.length) {
    const index = queue.shift();
    const plat = platforms[index];
    const span = plat.x2 - plat.x1;
    const step = Math.max(16, span / 24);
    for (let x = plat.x1 + 4; x <= plat.x2 - 4; x += step) {
      for (const dir of [-1, 0, 1]) {
        for (const release of [Infinity, 16]) {
          for (const mode of plat.bounce ? ['bounce', 'boost'] : ['jump', 'walk']) {
            if (mode === 'walk' && dir === 0) continue;
            const b = {
              x, y: plat.y, vx: dir * PARADISE_BODY.maxVx * 0.6,
              vy: mode === 'bounce' ? -plat.bounce : mode === 'boost' ? -plat.boost : 0,
              onGround: !plat.bounce,
            };
            for (let frame = 0; frame < 260; frame += 1) {
              const held = frame < release ? dir : 0;
              const input = {
                left: held < 0, right: held > 0,
                jumpPressed: frame === 0 && mode === 'jump',
                jumpHeld: mode === 'boost',
              };
              const { events } = stepParadiseBody(course, b, input, 1);
              course.pickups.forEach((pick, pickIndex) => { if (touches(pick, b)) got.add(pickIndex); });
              if (events.includes('respawn')) break;
              const landed = events.includes('land') || events.includes('bounce');
              if (landed && frame > 0) {
                const next = b.onGround ? b.groundIndex : b.lastBounce;
                if (!seen.has(next)) { seen.add(next); queue.push(next); }
                if (!(mode === 'walk' && next === index)) break;
              }
            }
          }
        }
      }
    }
  }
  return { reached: seen, exitIndex, got };
}

for (const id of ['mountain_scaling', 'aerial_boost', 'bippity_bop', 'arbor_hollow']) {
  test(`${id}: every quoin and the exit are reachable with real jumps`, () => {
    const course = EXTRA_PARADISE_COURSES[id];
    const { reached, exitIndex, got } = explorePlatformCourse(course);
    assert.ok(reached.has(exitIndex), 'exit platform reachable');
    const missing = course.pickups.map((_, index) => index).filter((index) => !got.has(index));
    assert.deepEqual(missing, [], `unreachable pickups ${missing.map((i) => JSON.stringify(course.pickups[i]))}`);
  });
}

/**
 * A simple greedy pilot (left/right toward the next quoin, rise/sink by its
 * height, the source controls only) must finish free-movement courses well
 * inside the four-minute instance.
 */
function pilot(course, maxFrames = 4 * 60 * 60, skip = () => false) {
  const b = { x: course.spawn.x, y: course.spawn.y, vx: 0, vy: 0, onGround: true };
  const left = new Set(course.pickups.map((_, index) => index));
  let falls = 0;
  let frame = 0;
  let strokeCooldown = 0;
  for (; frame < maxFrames; frame += 1) {
    let target = course.exit;
    let best = Infinity;
    const ordered = course.movement === 'plunge'
      ? [...left].filter((index) => !skip(index, falls) && course.pickups[index].y + 30 >= b.y - 10).slice(0, 1)
      : left;
    for (const index of ordered) {
      const pick = course.pickups[index];
      const score = course.movement === 'glide' ? pick.x : Math.abs(pick.y - b.y) * 2 + Math.abs(pick.x - b.x);
      if (course.movement === 'glide' && pick.x < b.x - 60) continue;
      if (course.movement === 'plunge' && pick.y + 30 < b.y - 10) continue;
      if (score < best) { best = score; target = pick; }
    }
    if (course.movement === 'plunge' && left.size && target === course.exit) {
      // Nothing left below: walk to the landing's Back to Top door to go up
      // for another fall.
      target = course.backToTop;
    }
    const goalY = left.size && target !== course.backToTop ? target.y + 30 : target.y;
    const dx = target.x - b.x;
    const dy = goalY - b.y;
    const input = { left: dx < -10, right: dx > 10 };
    if (course.movement === 'swim') {
      strokeCooldown -= 1;
      if (dy < -20 && b.vy > -3 && strokeCooldown <= 0) { input.jumpPressed = true; strokeCooldown = 8; }
    } else if (course.movement === 'glide') {
      input.up = dy < -10;
      input.down = dy > 40;
      if (b.onGround) input.jumpPressed = true;
      if (dx < 0) { input.left = false; input.right = false; }
    } else if (course.movement === 'plunge') {
      // Float when the quoin is further across than a free fall allows.
      input.up = dy > 0 && Math.abs(dx) / Math.max(1, dy) > 0.6;
      input.down = Math.abs(dx) < 40 && dy > 220;
      if (b.onGround && frame < 5) input.right = true;
    } else if (course.movement === 'updraft') {
      if (b.onGround) input.jumpPressed = true;
      input.up = dy < -150;
      input.down = dy > 20;
    }
    const { events } = stepParadiseBody(course, b, input, 1);
    if (events.includes('respawn') || events.includes('back_to_top')) falls += 1;
    for (const index of [...left]) {
      if (skip(index, falls)) continue;
      if (touches(course.pickups[index], b)) left.delete(index);
    }
    if (!left.size && Math.hypot(course.exit.x - b.x, course.exit.y - b.y) < 74) break;
  }
  return { frame, falls, left: [...left], at: { x: Math.round(b.x), y: Math.round(b.y) } };
}

for (const id of ['abysmal_thrill', 'updraft', 'sky_plunge', 'drafty_uplift']) {
  test(`${id}: a greedy pilot collects every quoin and exits inside four minutes`, () => {
    const course = EXTRA_PARADISE_COURSES[id];
    const result = pilot(course);
    assert.deepEqual(result.left, [], `missed ${JSON.stringify(result)}`);
    assert.ok(result.frame < 4 * 60 * 60, `took ${result.frame} frames, ended at ${JSON.stringify(result.at)}`);
  });
}

test('Cloud Flight keeps every quoin inside the shipped flight bounds', () => {
  const course = EXTRA_PARADISE_COURSES.cloud_flight;
  assert.equal(course.movement, undefined, 'uses the shipped Space/W flight runtime');
  for (const pick of course.pickups) {
    assert.ok(pick.y > 72 + 30 && pick.y < course.height - 45, JSON.stringify(pick));
    assert.ok(pick.x > 34 && pick.x < course.width - 34);
  }
});

test('game.js wires the new courses in through small additive hooks', () => {
  const game = fs.readFileSync(path.join(publicDir, 'game.js'), 'utf8');
  const flight = fs.readFileSync(path.join(publicDir, 'js', 'paradise-flight.js'), 'utf8');
  const has = (source, pattern) => assert.ok(pattern.test(source), String(pattern));
  has(flight, /\.\.\.EXTRA_PARADISE_COURSES/);
  has(game, /from '\.\/js\/paradise-course-runtime\.js/);
  has(game, /paradiseCourseRuntime\.input\(/);
  has(game, /paradiseCourseRuntime\.physics\(/);
  has(game, /paradiseCourseRuntime\.tick\(/);
  has(game, /buildParadiseCourseArt\(/);
  has(game, /resolveParadiseCourseAlias\(/);
  has(game, /paradiseticket/);
  const runtime = fs.readFileSync(path.join(publicDir, 'js', 'paradise-course-runtime.js'), 'utf8');
  has(runtime, /paradiseCourseArt/);
  assert.ok(!/reference-videos|\.mp4/.test(runtime), 'no footage paths in the runtime');
});

// --- Sky Plunge (card, card art and player reports) -------------------------

test('Sky Plunge keeps the card copy and the card art palette', () => {
  const course = EXTRA_PARADISE_COURSES.sky_plunge;
  // source: inc_data_imagination.js:7407
  assert.equal(course.cardDesc, 'Take the plunge! A fast drop through soft, morning clouds. Can you collect every quoin?');
  // art_keepable_t2p_skyplunge.png: mint (#c7f1e2) at the top to pale yellow (#d9e4b8) low down.
  const [top, , , bottom] = course.palette;
  const rgb = (c) => [(c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff];
  assert.ok(rgb(top)[1] > rgb(top)[0] && rgb(top)[2] > rgb(bottom)[2], 'mint top, yellower bottom');
  assert.ok(rgb(bottom)[0] > rgb(top)[0] && rgb(bottom)[2] < rgb(bottom)[1], 'pale yellow bottom');
  assert.match(course.objective, /every quoin/);
  assert.match(course.completion, /every quoin/);
});

test('Sky Plunge lands on the Snap\'s cloud floor, with Back to Top on the left and EXIT on the right', () => {
  const course = EXTRA_PARADISE_COURSES.sky_plunge;
  // research/wayback/raw/snaps/paradise_sky_plunge/ (Festeus, 2012-10-01): the only image of the course.
  const landing = course.platforms.find((plat) => plat.id === 'landing');
  assert.deepEqual([landing.x1, landing.x2, landing.y], [0, course.width, SKY_PLUNGE_LANDING_Y]);
  assert.equal(course.fallY, undefined, 'no cloud sea: the floor catches every fall');
  assert.equal(course.backToTop, SKY_PLUNGE_BACK_TO_TOP);
  assert.equal(course.backToTop.label, 'Back to Top');
  assert.ok(course.backToTop.x < course.width * 0.25 && course.exit.x > course.width * 0.75, 'Back to Top left, EXIT right');
  assert.equal(course.exit.y, SKY_PLUNGE_LANDING_Y);
  assert.deepEqual(SKY_PLUNGE_LANDING_SIGNS.map((sign) => sign.text), ['AHHHHH YEAHHHH!!!!!', 'Back to Top', 'EXIT']);
  const [lettering, back, exit] = SKY_PLUNGE_LANDING_SIGNS;
  assert.ok(lettering.y < back.y && back.y < SKY_PLUNGE_LANDING_Y, 'the lettering is high in the sky, the signs over the doors');
  assert.ok(back.x <= course.backToTop.x && exit.x >= course.exit.x, 'signs lean outward over their doors, as in the Snap');
  // No quoin is in reach of the door, so a fall never sends you up by accident.
  for (const pick of course.pickups) assert.ok(Math.abs(pick.x - course.backToTop.x) > course.backToTop.reach + 30);
  // Land, walk left into the door: back up to the start cloud.
  const b = body(500, SKY_PLUNGE_LANDING_Y - 60, { onGround: false, vy: 3 });
  run(course, b, 40);
  assert.equal(b.onGround, true);
  assert.equal(b.y, SKY_PLUNGE_LANDING_Y);
  let up = false;
  for (let index = 0; index < 400 && !up; index += 1) {
    up = stepParadiseBody(course, b, { left: true }, 1).events.includes('back_to_top');
  }
  assert.ok(up);
  assert.deepEqual([b.x, b.y, b.onGround], [course.spawn.x, course.spawn.y, true]);
  // Walking right along the landing never passes the door: EXIT is the other way.
  const c = body(700, SKY_PLUNGE_LANDING_Y);
  assert.ok(!run(course, c, 300, { right: true }).includes('back_to_top'));
  // The Snap's landing sky is cream-gold (#eee0b6); the card's mint stays at the top.
  const bottom = course.palette[3];
  assert.ok(Math.abs(((bottom >> 16) & 0xff) - 0xee) < 8 && Math.abs(((bottom >> 8) & 0xff) - 0xe0) < 8 && Math.abs((bottom & 0xff) - 0xb6) < 8);
  // The doors are CC0 location art rendered by tools/room-art.
  const art = fs.readFileSync(path.join(publicDir, 'js', 'sky-plunge-art.js'), 'utf8');
  const file = /door_asset_heights_interior: \['([^']+)'/.exec(art)[1];
  assert.ok(fs.existsSync(path.join(publicDir, 'assets', 'sprites', 'paradise', 'sky_plunge', file)));
  // Mountain Scaling still returns you to the last rock.
  assert.ok(EXTRA_PARADISE_COURSES.mountain_scaling.fallY);
});

test('Sky Plunge: a pilot who misses quoins on the first fall finishes on later falls inside four minutes', () => {
  const course = EXTRA_PARADISE_COURSES.sky_plunge;
  // Ignore every quoin on the right on the first fall.
  const result = pilot(course, 4 * 60 * 60, (index, falls) => falls === 0 && course.pickups[index].x > 700);
  assert.deepEqual(result.left, [], `missed ${JSON.stringify(result)}`);
  assert.ok(result.falls >= 1, 'needed another fall');
  assert.ok(result.frame < 4 * 60 * 60, `took ${result.frame} frames`);
});

test('Sky Plunge has one Qurazy quoin among the last two, paid by the level table', () => {
  const course = EXTRA_PARADISE_COURSES.sky_plunge;
  const qurazies = course.rewards.map((entry, index) => (entry.type === 'qurazy' ? index : -1)).filter((index) => index >= 0);
  assert.deepEqual(qurazies, [SKY_PLUNGE_QURAZY_INDEX]);
  assert.ok(SKY_PLUNGE_QURAZY_INDEX >= course.pickupCount - 2);
  // Pickups are in fall order, so the Qurazy is one of the last two you reach.
  const ys = course.pickups.map((pick) => pick.y);
  assert.deepEqual(ys, [...ys].sort((a, b) => a - b));
  // GSJS items/quoin.js:207-209: config.qurazy_rewards[level - 1] iMG, no multiplier.
  assert.deepEqual(resolveParadiseReward(course.rewards[SKY_PLUNGE_QURAZY_INDEX], { level: 12 }),
    { type: 'xp', amount: QURAZY_REWARDS[11], giantId: null, quoin: 'qurazy' });
  const run1 = createParadiseRun('sky_plunge', { now: 0 });
  const result = collectParadisePickup(run1, SKY_PLUNGE_QURAZY_INDEX, 1000, { level: 5 });
  assert.equal(result.reward.type, 'xp');
  assert.equal(result.reward.amount, 30);
  assert.equal(result.reward.quoin, 'qurazy');
  assert.equal(run1.rewardTotals.xp, 30);
  // Other rewards pass through untouched.
  assert.equal(resolveParadiseReward(course.rewards[0]), course.rewards[0]);
});

test('Sky Plunge plays the Rainbow Run A Cappella cuts: CLOUD_DROP_2 loop, intro on every quoin', () => {
  const course = EXTRA_PARADISE_COURSES.sky_plunge;
  assert.equal(course.musicFile, 'CLOUD_DROP_2');
  assert.equal(course.completionSound, 'CLOUD_DROP_2_INTRO');
  const music = JSON.parse(fs.readFileSync(path.join(publicDir, 'assets', 'content', 'ambient-music.json'), 'utf8'));
  const theme = music.themes[music.streetMusic.CLOUD_DROP_2];
  assert.ok(theme, 'CLOUD_DROP_2 maps to a theme');
  assert.deepEqual(theme.tracks, ['assets/audio/sfx/CLOUD_DROP_2.mp3']);
  assert.ok(theme.gsjsKeys.includes('TICKET_TO_PARADISE1'));
  const keys = JSON.parse(fs.readFileSync(path.join(publicDir, 'assets', 'content', 'sound-keys.json'), 'utf8'));
  for (const key of ['CLOUD_DROP_2', 'CLOUD_DROP_2_INTRO']) {
    assert.match(keys.keys?.[key]?.url || keys[key]?.url || '', /Rainbow_Run_A_Capp?ella/, key);
    assert.ok(fs.existsSync(path.join(publicDir, 'assets', 'audio', 'sfx', `${key}.mp3`)), key);
  }
  const game = fs.readFileSync(path.join(publicDir, 'game.js'), 'utf8');
  assert.match(game, /musicFile: course\.musicFile/);
  assert.match(game, /if \(course\.musicFile\) setAmbientForStreet\(currentStreet\)/);
  assert.match(game, /if \(course\.completionSound\) playSound\(course\.completionSound/);
  assert.match(game, /collectParadisePickup\(paradiseRun, entry\.index, Date\.now\(\), \{ level: pc\.level \}\)/);
});

test('Updraft and Drafty Uplift carry an unconfirmed-release note shown to players', () => {
  assert.equal(PARADISE_UNCONFIRMED_RELEASE_LINE, 'Tiny Speck built this course, but it may never have reached players.');
  assert.doesNotMatch(PARADISE_UNCONFIRMED_RELEASE_LINE, /—/);
  for (const id of ['updraft', 'drafty_uplift']) {
    assert.equal(EXTRA_PARADISE_COURSES[id].releaseNote, 'unconfirmed', id);
    assert.equal(EXTRA_PARADISE_COURSES[id].releaseLine, PARADISE_UNCONFIRMED_RELEASE_LINE, id);
  }
  // The other eleven went live (forum general/9830 update log; one upgrade card each).
  for (const id of EXTRA_PARADISE_COURSE_IDS.filter((entry) => !['updraft', 'drafty_uplift'].includes(entry))) {
    assert.equal(EXTRA_PARADISE_COURSES[id].releaseNote, undefined, id);
  }
  // GSJS deals a card for 11 Paradise tickets only (skipped where the audit tree is absent).
  const gsjs = path.join(here, '..', '..', 'glitch-GameServerJS', 'inc_data_imagination.js');
  if (fs.existsSync(gsjs)) {
    const cards = fs.readFileSync(gsjs, 'utf8').match(/function imagination_get_ticket_to_paradise_\w+/g) || [];
    assert.equal(cards.length, 11);
    assert.ok(!cards.some((name) => /updraft|drafty_uplift/.test(name)));
  }
  const runtime = fs.readFileSync(path.join(publicDir, 'js', 'paradise-course-runtime.js'), 'utf8');
  assert.match(runtime, /if \(course\.releaseLine\) releaseNoteSign\(/);
  const game = fs.readFileSync(path.join(publicDir, 'game.js'), 'utf8');
  assert.match(game, /course\.releaseLine \? `\$\{course\.ticketDesc\} \$\{course\.releaseLine\}`/);
});

test('Abysmal Thrill water is the clearer teal-blue of its Snap, never near-black (G79)', () => {
  const course = EXTRA_PARADISE_COURSES.abysmal_thrill;
  const lum = (c) => 0.299 * ((c >> 16) & 0xff) + 0.587 * ((c >> 8) & 0xff) + 0.114 * (c & 0xff);
  // The Snap's mid-depth water samples #0c2134 (luminance ~29); the old bottom stop was #03060c (~5).
  for (const c of course.palette) {
    assert.ok(lum(c) >= 25, `0x${c.toString(16)} too dark`);
    assert.ok((c & 0xff) > ((c >> 16) & 0xff), `0x${c.toString(16)} is blue over red`);
  }
});
