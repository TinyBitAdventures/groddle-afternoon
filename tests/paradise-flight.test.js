import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PARADISE_COURSES,
  PARADISE_DAILY_LIMIT,
  PARADISE_DURATION_MS,
  CLOUD_RING_PROFILES,
  RADIAL_HEIGHTS_MOON,
  STARLIT_NIGHT_MOON,
  STARLIT_NIGHT_MOON_FADE_MS,
  STARLIT_NIGHT_STAR_FADE_MS,
  STARLIT_NIGHT_STAR_FIELDS,
  SLIP_N_SLIDE_LANDMARKS,
  SLIP_N_SLIDE_TREE_SPRITES,
  activateParadiseTicket,
  cloudRingPuffLayout,
  collectParadisePickup,
  createParadiseRun,
  createParadiseState,
  finishParadiseRun,
  paradiseObjective,
  paradiseRemainingMs,
  paradiseRunProgress,
  paradiseTicketCost,
  passParadiseRing,
  slipTerrainSlope,
  slipTerrainY,
  starlitMoonPlainAlpha,
  starlitRevealAlpha,
} from '../public/js/paradise-flight.js';

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

test('Cloud Rings uses five tall, navigable tunnels built from clean cloud puffs', () => {
  assert.equal(CLOUD_RING_PROFILES.length, 5);
  for (let index = 0; index < CLOUD_RING_PROFILES.length; index += 1) {
    const profile = CLOUD_RING_PROFILES[index];
    const puffs = cloudRingPuffLayout(index);
    assert.equal(puffs.length, 32);
    assert.ok(profile.outerRy >= 304, 'source rings fill most of the location viewport');
    assert.ok(profile.outerRy > profile.outerRx, 'source rings are vertically elongated');
    assert.ok(profile.innerRx >= 101, 'opening must clear the avatar horizontally');
    assert.ok(profile.innerRy >= 196, 'opening must clear the avatar vertically');
    assert.ok(puffs.every((puff) => puff.textureVariant === 1 || puff.textureVariant === 2));
    assert.ok(puffs.every((puff) => puff.tint === profile.tint));
    assert.ok(puffs.every((puff) => puff.shadowTint === profile.shadowTint));
  }
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

test('private runs last exactly four minutes and paradise pickups are unique', () => {
  assert.equal(PARADISE_DURATION_MS, 240000);
  const run = createParadiseRun('starlit_night', { now: 1000 });
  assert.equal(paradiseRemainingMs(run, 240999), 1);
  assert.equal(collectParadisePickup(run, 0, 1200).reward.type, 'energy');
  assert.equal(collectParadisePickup(run, 0, 1300).reason, 'already_collected');
  assert.equal(collectParadisePickup(run, 1, 241000).reason, 'expired');
});

test('course endings enforce their source objectives and reward once', () => {
  const cloud = createParadiseRun('cloud_rings', { now: 0 });
  for (let index = 0; index < 5; index += 1) {
    assert.equal(passParadiseRing(cloud, index, 1000 + index).ok, true);
  }
  assert.equal(paradiseRunProgress(cloud).complete, true);
  assert.match(paradiseObjective(cloud), /way home/i);
  assert.equal(finishParadiseRun(cloud, 2000).completionReward.amount, 500);
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
      `${course.ticketId}.png`
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
  assert.match(game, /dataset\.paradiseRingArt = 'clean-cloud-puffs'/);
  assert.match(game, /cloudRingPuffLayout\(index\)/);
  assert.match(game, /native-resolution vector lobes/);
  assert.match(game, /paradisepreview'\) === 'ring'/);
  assert.match(game, /Keep the dedicated visual-QA route framed on the first tunnel/);
  assert.match(html, /id="paradise-flight-hud"/);
  assert.match(html, /data-paradise-controls/);
  assert.match(css, /\.paradise-flight-hud/);
});
