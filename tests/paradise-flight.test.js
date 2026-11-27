import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PARADISE_COURSES,
  PARADISE_DAILY_LIMIT,
  PARADISE_EXIT_PROMPT_MS,
  PARADISE_HELL_BLOCK,
  PARADISE_TICKET_EAT,
  CLOUD_RING_ART,
  cloudRingOpening,
  cloudRingPasses,
  RADIAL_HEIGHTS_MOON,
  STARLIT_NIGHT_MOON,
  STARLIT_NIGHT_MOON_FADE_MS,
  STARLIT_NIGHT_STAR_FADE_MS,
  STARLIT_NIGHT_STAR_FIELDS,
  SLIP_N_SLIDE_LANDMARKS,
  SLIP_N_SLIDE_TREE_SPRITES,
  activateParadiseTicket,
  collectParadisePickup,
  createParadiseRun,
  createParadiseState,
  eatParadiseTicket,
  finishParadiseRun,
  paradiseExitClosedLine,
  paradiseObjective,
  paradiseObjectiveComplete,
  paradiseRunProgress,
  paradiseTicketCost,
  passParadiseRing,
  quoteParadiseTicket,
  slipTerrainSlope,
  slipTerrainY,
  starlitMoonPlainAlpha,
  starlitRevealAlpha,
} from '../public/js/paradise-flight.js?v=ab7d41ec';

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(here, '..', 'public');

test('the supplied Paradise videos map to source production templates', () => {
  assert.equal(PARADISE_COURSES.cloud_rings.templateTsid, 'LHFVPPKQSR53T1L');
  assert.equal(PARADISE_COURSES.radial_heights.templateTsid, 'LHFR8BRSVT33AE0');
  assert.equal(PARADISE_COURSES.starlit_night.templateTsid, 'LHFD3EU3SH2307J');
  assert.equal(PARADISE_COURSES.slip_n_slide.templateTsid, 'LHFQVU11DR53IKB');
  assert.equal(PARADISE_COURSES.radial_heights.pickupCount, 53);
  assert.equal(PARADISE_COURSES.starlit_night.pickupCount, 22);
  assert.equal(PARADISE_COURSES.slip_n_slide.pickupCount, 18);
  assert.equal(PARADISE_COURSES.slip_n_slide.movement, 'slide');
});

test("Slip 'N Slide terrain is smooth, bounded, and alternates hills with valleys", () => {
  const course = PARADISE_COURSES.slip_n_slide;
  const samples = Array.from({ length: course.width / 10 + 1 }, (_, index) =>
    slipTerrainY(index * 10)
  );
  assert.ok(samples.every((y) => y >= 580 && y <= 760));
  assert.ok(Math.max(...samples.slice(1).map((y, index) => Math.abs(y - samples[index]))) < 10);
  assert.ok(slipTerrainSlope(470) > 0, 'the first descent should accelerate rightward');
  assert.ok(slipTerrainSlope(720) < 0, 'the next climb should bleed rightward speed');
  assert.equal(slipTerrainY(-100), slipTerrainY(0));
  assert.equal(slipTerrainY(course.width + 100), slipTerrainY(course.width));
});

test('Radial Heights restores its giant smiling moon at source coordinates', () => {
  assert.deepEqual(RADIAL_HEIGHTS_MOON, {
    asset: 'moon_asset_smile.svg',
    x: 885,
    y: 1094,
    width: 322,
    height: 322,
  });
  assert.equal(
    fs.existsSync(path.join(
      publicDir,
      'assets',
      'decos',
      'groddle',
      RADIAL_HEIGHTS_MOON.asset
    )),
    true
  );
});

test('Starlit Night restores its source star field and plain-to-smile moon reveal', () => {
  const sourceStreet = JSON.parse(fs.readFileSync(
    path.join(publicDir, 'assets', 'streets', 'GHFCVOD2GN631RJ.json'),
    'utf8'
  ));
  const sourceStars = sourceStreet.layers
    .find((layer) => layer.name === 'middleground')
    .decos
    .filter((deco) => /^star_asset_0[12]$/.test(deco.sprite));
  assert.equal(sourceStars.length, 20);
  assert.equal(STARLIT_NIGHT_STAR_FIELDS.length, 8);
  assert.deepEqual(STARLIT_NIGHT_MOON, {
    plain: {
      asset: 'moon_asset_plain.svg',
      x: 1309,
      y: 257,
      width: 149,
      height: 149,
    },
    smile: {
      asset: 'moon_asset_smile.svg',
      x: 1308,
      y: 258,
      width: 150,
      height: 150,
    },
  });
  assert.equal(STARLIT_NIGHT_STAR_FADE_MS, 1000);
  assert.equal(STARLIT_NIGHT_MOON_FADE_MS, 1500);
  assert.equal(starlitRevealAlpha(0, 1000), 0);
  assert.equal(starlitRevealAlpha(1000, 1500), 0.5);
  assert.equal(starlitRevealAlpha(1000, 2200), 1);
  assert.equal(starlitMoonPlainAlpha(0, 1000), 1);
  assert.equal(starlitMoonPlainAlpha(1000, 1750), 0.5);
  assert.equal(starlitMoonPlainAlpha(1000, 2600), 0);
  for (const asset of [
    STARLIT_NIGHT_MOON.plain.asset,
    STARLIT_NIGHT_MOON.smile.asset,
    'stars_2.png',
    'star_asset_01.png',
    'star_asset_02.png',
  ]) {
    assert.equal(
      fs.existsSync(path.join(publicDir, 'assets', 'decos', 'groddle', asset.replace(/\.png$/, '.webp'))),
      true,
      `${asset} must exist as clean recovered art`
    );
  }
});

test("Slip 'N Slide uses the clean recovered K03 landmarks from the recording", () => {
  assert.equal(SLIP_N_SLIDE_LANDMARKS.length, 8);
  assert.deepEqual(
    SLIP_N_SLIDE_LANDMARKS.map((entry) => entry.id),
    [
      'welcome-snowman',
      'first-cabin',
      'first-ice-spire',
      'first-pine-copse',
      'second-cabin',
      'second-ice-spire',
      'second-pine-copse',
      'way-home-castle',
    ]
  );
  const sprites = [
    ...SLIP_N_SLIDE_LANDMARKS.map((entry) => entry.sprite),
    ...SLIP_N_SLIDE_TREE_SPRITES,
  ];
  for (const sprite of sprites) {
    assert.equal(
      fs.existsSync(path.join(publicDir, 'assets', 'decos', 'groddle', `${sprite}.webp`)),
      true,
      `${sprite} must exist as clean recovered art`
    );
  }
  assert.ok(SLIP_N_SLIDE_LANDMARKS.every((entry) => entry.x >= 0 && entry.x <= 3600));
});

test('G1160: Cloud Rings uses five upright cloud hoops at the snaps\' size, lavender until flown through and gold after', () => {
  assert.equal(PARADISE_COURSES.cloud_rings.ringCount, 5);
  assert.equal(CLOUD_RING_ART.sprite, 'gz_ai_cr_ring');
  // The players' full-street snaps: about 170 x 330, opening about 60 x 180 on the hoop's left.
  assert.ok(CLOUD_RING_ART.height === 330 && Math.abs(CLOUD_RING_ART.width - 170) <= 10);
  assert.ok(fs.existsSync(path.join(publicDir, 'assets', 'decos', 'groddle', 'gz_ai_cr_ring.webp')));
  const rgb = (c) => [(c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff];
  const [lr, lg, lb] = rgb(CLOUD_RING_ART.tint);
  assert.ok(lb > lr && lr > lg, 'lavender before');
  const [gr, gg, gb] = rgb(CLOUD_RING_ART.passedTint);
  assert.ok(gr > gg && gg > gb && gb < 0x80, 'gold after');
  const opening = cloudRingOpening(1000, 500);
  assert.ok(opening.x < 1000, 'the opening is on the left of the hoop');
  assert.ok(opening.rx * 2 >= 44 && opening.ry * 2 >= 165 && opening.ry * 2 < CLOUD_RING_ART.height);
  assert.ok(cloudRingPasses(opening, opening.x, opening.y));
  assert.ok(cloudRingPasses(opening, opening.x, opening.y + opening.ry - 2));
  assert.ok(!cloudRingPasses(opening, 1000 + CLOUD_RING_ART.width / 2 - 10, 500), 'the thick rim on the right is not the way through');
  assert.ok(!cloudRingPasses(opening, opening.x, 500 - CLOUD_RING_ART.height / 2 - 5), 'over the top is not through');
});

test('ticket pricing, eleven-ticket daily gate, and daily reset match GSJS', () => {
  assert.equal(paradiseTicketCost(1), 20);
  assert.equal(paradiseTicketCost(40), 800);
  assert.equal(paradiseTicketCost(44), 924);
  assert.equal(paradiseTicketCost(120), 4200);
  const state = createParadiseState({}, Date.UTC(2026, 6, 25));
  for (let index = 0; index < PARADISE_DAILY_LIMIT; index += 1) {
    assert.equal(activateParadiseTicket(state, 'cloud_rings', {
      imagination: 999999,
      quoinMultiplier: 1,
      now: Date.UTC(2026, 6, 25),
    }).ok, true);
  }
  assert.equal(activateParadiseTicket(state, 'cloud_rings', {
    imagination: 999999,
    now: Date.UTC(2026, 6, 25),
  }).reason, 'daily_limit');
  assert.equal(activateParadiseTicket(state, 'starlit_night', {
    imagination: 999999,
    now: Date.UTC(2026, 6, 26),
  }).ok, true);
  assert.equal(state.ticketsToday, 1);
});

test('private runs have no time limit (Glitch asked "Are you stuck?" at four minutes) and paradise pickups are unique', () => {
  // paradise_ticket.js launchInstance 296: instances_schedule_exit_prompt(instance_id, 4*60).
  assert.equal(PARADISE_EXIT_PROMPT_MS, 240000);
  const run = createParadiseRun('starlit_night', { now: 1000 });
  assert.equal(run.expiresAt, undefined);
  assert.equal(collectParadisePickup(run, 0, 1200).reward.type, 'energy');
  assert.equal(collectParadisePickup(run, 0, 1300).reason, 'already_collected');
  assert.equal(collectParadisePickup(run, 1, 241000).ok, true, 'still running after four minutes');
  assert.equal(run.status, 'running');
});

test('course endings enforce their source objectives and reward once', () => {
  const cloud = createParadiseRun('cloud_rings', { now: 0 });
  for (let index = 0; index < 5; index += 1) {
    assert.equal(passParadiseRing(cloud, index, 1000 + index).ok, true);
  }
  assert.equal(paradiseRunProgress(cloud).complete, true);
  assert.match(paradiseObjective(cloud), /way home/i);
  // #560: the recorded +500 is benefit 4, paid times the multiplier (1 here).
  assert.equal(finishParadiseRun(cloud, 2000).completionReward.amount, 4);
  assert.equal(finishParadiseRun(cloud, 2100).reason, 'complete');

  const radial = createParadiseRun('radial_heights', { now: 0 });
  assert.equal(finishParadiseRun(radial, 1000).reason, 'objective_incomplete');
  for (let index = 0; index < PARADISE_COURSES.radial_heights.pickupCount; index += 1) {
    collectParadisePickup(radial, index, 1100 + index);
  }
  assert.equal(finishParadiseRun(radial, 2000).ok, true);
});

test('client ships real ticket art, a flight HUD, and deterministic QA entry', () => {
  const game = fs.readFileSync(path.join(publicDir, 'game.js'), 'utf8');
  const html = fs.readFileSync(path.join(publicDir, 'play/index.html'), 'utf8');
  const css = fs.readFileSync(path.join(publicDir, 'style.css'), 'utf8');
  for (const course of Object.values(PARADISE_COURSES)) {
    assert.equal(fs.existsSync(path.join(
      publicDir,
      'assets',
      'sprites',
      'icons',
      `${course.ticketId}.webp`
    )), true);
  }
  assert.match(game, /updateParadiseFlight/);
  assert.match(game, /paradiseautoplay/);
  assert.match(game, /handleParadiseSlideInput/);
  assert.match(game, /paradiseSlidePhysics/);
  assert.match(game, /dataset\.paradiseSpeed/);
  assert.match(game, /dataset\.paradiseSlipArt = 'recovered-k03-landmarks'/);
  assert.match(game, /dataset\.paradiseRadialArt = 'source-moon-and-stars'/);
  assert.match(game, /loadTexture\(src, \{ width: RADIAL_HEIGHTS_MOON\.width/);
  assert.match(game, /paradisepreview'\) === 'moon'/);
  assert.match(game, /dataset\.paradiseStarlitArt = 'source-starfield-and-moon-states'/);
  assert.match(game, /course\.id === 'starlit_night' && sourcePoints\.length/);
  assert.match(game, /starlitMoonPlainAlpha\(bgLayer\.paradiseMoonFadeStartedAt, now\)/);
  assert.match(game, /starlitPreview === 'smile'/);
  assert.match(game, /paradiseObjectiveComplete\(paradiseRun\) && starlitRevealComplete/);
  assert.match(game, /loadTexture\(`assets\/decos\/groddle\/\$\{sprite\}\.png`\)/);
  assert.match(game, /paradisepreview'\) === 'finish'/);
  assert.match(game, /dataset\.paradiseRingArt = CLOUD_RING_ART\.sprite/);
  assert.match(game, /hoop\.tint = CLOUD_RING_ART\.tint;/);
  assert.match(game, /_cloudHoop\.tint = CLOUD_RING_ART\.passedTint;/);
  assert.match(game, /cloudRingPasses\(entry\.opening, player\.x, player\.y - 34\)/);
  assert.match(game, /paradisepreview'\) === 'ring'/);
  assert.match(game, /Keep the dedicated visual-QA route framed on the first tunnel/);
  assert.match(html, /id="paradise-flight-hud"/);
  assert.match(html, /data-paradise-controls/);
  assert.match(css, /\.paradise-flight-hud/);
});

test('eating a ticket gives 20 iMG and 1 energy with one of the eight source quips (paradise_ticket.js verbs.eat)', () => {
  assert.equal(PARADISE_TICKET_EAT.imagination, 20);
  assert.equal(PARADISE_TICKET_EAT.energy, 1);
  assert.equal(PARADISE_TICKET_EAT.tooltip, 'Eat this to gain 20 iMG and 1 energy');
  assert.deepEqual([...PARADISE_TICKET_EAT.quips], [
    'Yum!',
    'Hmm, slightly stale.',
    'Tastes like chicken!',
    'The paper got stuck in your teeth.',
    'Yum!',
    'You got a papercut on your tongue. Ouch!',
    'Mmm, not bad.',
    'Mmm, tasty.',
  ]);
  const eaten = eatParadiseTicket({ rng: () => 0 });
  assert.deepEqual(eaten, { count: 1, imagination: 20, energy: 1, quip: 'Yum!' });
  assert.equal(eatParadiseTicket({ rng: () => 0.999 }).quip, 'Mmm, tasty.');
  assert.equal(eatParadiseTicket({ rng: () => 0.5 }).quip, 'Yum!');
  assert.equal(eatParadiseTicket({ count: 3, rng: () => 0.3 }).imagination, 60);
  // metabolics_add_energy: the dead (and super pooped) gain no energy, the iMG still lands.
  assert.deepEqual(
    eatParadiseTicket({ rng: () => 0.3, energyAllowed: false }),
    { count: 1, imagination: 20, energy: 0, quip: 'Tastes like chicken!' }
  );
});

test("the dead can't activate a ticket, checked before the daily limit", () => {
  assert.equal(PARADISE_HELL_BLOCK, "You can't just magically ascend from Hell!");
  const now = Date.UTC(2026, 9, 23);
  const state = createParadiseState({}, now);
  const dead = quoteParadiseTicket(state, 'cloud_rings', { imagination: 999999, now, dead: true });
  assert.equal(dead.ok, false);
  assert.equal(dead.reason, 'dead');
  const refused = activateParadiseTicket(state, 'cloud_rings', { imagination: 999999, now, dead: true });
  assert.equal(refused.reason, 'dead');
  assert.equal(state.ticketsToday, 0);
  state.ticketsToday = PARADISE_DAILY_LIMIT;
  assert.equal(quoteParadiseTicket(state, 'cloud_rings', { imagination: 999999, now, dead: true }).reason, 'dead');
  assert.equal(quoteParadiseTicket(state, 'cloud_rings', { imagination: 999999, now }).reason, 'daily_limit');
});

test('the pack popover offers Eat beside Activate and asks Hell before activating', () => {
  const game = fs.readFileSync(path.join(publicDir, 'game.js'), 'utf8');
  assert.match(game, /attrs: 'data-pack-eat-ticket', cls: 'pack-bear-action', label: 'Eat one', tip: PARADISE_TICKET_EAT\.tooltip/);
  assert.match(game, /function eatPackedParadiseTicket\(classTsid, count = 1\)/);
  assert.match(game, /features\.query\('isDead', engine\) === true/);
  assert.match(game, /quote\.reason === 'dead'\s*\? PARADISE_HELL_BLOCK/);
  assert.match(game, /Ticket to Paradise cards per day\./);
  // Both the quote and the confirmed activation pass the Hell state.
  assert.equal((game.match(/dead: playerIsDead\(\)/g) || []).length >= 3, true);
});

test('report 131: the shut way home names how many are left', () => {
  const rings = createParadiseRun('cloud_rings', { now: 1000 });
  assert.equal(paradiseExitClosedLine(rings), 'The way home is shut until you fly through all 5 rings: 5 more to go.');
  rings.rings.push(0, 1, 2, 3);
  assert.equal(paradiseExitClosedLine(rings), 'The way home is shut until you fly through all 5 rings: 1 more to go.');
  rings.rings.push(4);
  assert.equal(paradiseObjectiveComplete(rings), true);
  assert.equal(paradiseExitClosedLine(rings), '');
  assert.match(paradiseExitClosedLine(createParadiseRun('radial_heights', { now: 1000 })), /collect all 53 stars: 53 more to go\.$/);
  assert.match(paradiseExitClosedLine(createParadiseRun('starlit_night', { now: 1000 })), /collect all 22 quoins: 22 more to go\.$/);
});

test('report 131: the sky runs on below every course and the closed exit shows its boards', () => {
  const game = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../public/game.js'), 'utf8');
  const paint = game.slice(game.indexOf('function paintParadiseSky('), game.indexOf('const stars = new PIXI.Graphics();', game.indexOf('function paintParadiseSky(')));
  assert.match(paint, /sky\.rect\(0, course\.height, course\.width, PARADISE_SKY_BELOW\)/);
  const below = Number(/const PARADISE_SKY_BELOW = (\d+);/.exec(game)[1]);
  // The camera shows at most the pack allowance plus the pack strip past the course: 132 + 132 px at most.
  assert.ok(below >= 600, 'more than any window shows');
  assert.doesNotMatch(game, /paradiseExit\.shut/); // G978: no SHUT boards; the closed exit is dimmed
  assert.match(game, /paradiseExitClosedLine\(paradiseRun\)/);
});
