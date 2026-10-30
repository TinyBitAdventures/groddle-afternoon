import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ROOK_HALL_QUEST_ID,
  ROOK_HALL_START_QUEST_ID,
  ROOK_MUSEUM_COMPLETION,
  ROOK_MUSEUM_EXHIBIT_COUNT,
  ROOK_MUSEUM_EXHIBITS,
  ROOK_MUSEUM_GREETING,
  ROOK_MUSEUM_HALL,
  ROOK_MUSEUM_PAINTING_ART,
  ROOK_MUSEUM_PAINTING_LOOP,
  ROOK_MUSEUM_PRODUCTION_TSID,
  ROOK_MUSEUM_SOURCE,
  ROOK_MUSEUM_STAND_ART,
  ROOK_MUSEUM_REWARD,
  ROOK_MUSEUM_STREET_ID,
  ROOK_MUSEUM_TOUR_INTRO,
  ROOK_MUSEUM_WORLD,
  beginRookMuseumTour,
  completeRookMuseum,
  createRookMuseumState,
  getRookMuseumExhibit,
  rookMuseumObjective,
  rookMuseumOverlayPoint,
  rookMuseumPaintingAlphas,
  rookMuseumWorldPoint,
  visitRookMuseumExhibit,
} from '../public/js/rook-museum.js?v=g455-1';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Museum of the Rook preserves the two-part production quest contract', () => {
  assert.equal(ROOK_HALL_START_QUEST_ID, 'rook_hall_start');
  assert.equal(ROOK_HALL_QUEST_ID, 'rook_hall');
  assert.equal(ROOK_MUSEUM_PRODUCTION_TSID, 'LA91BDTNHS82D36');
  assert.equal(ROOK_MUSEUM_STREET_ID, 'INSTANCE_ROOK_MUSEUM');
  assert.deepEqual(ROOK_MUSEUM_REWARD, { xp: 400 });
  assert.equal(ROOK_MUSEUM_EXHIBIT_COUNT, 6);
  assert.equal(ROOK_MUSEUM_EXHIBITS.length, 6);
  assert.equal(ROOK_MUSEUM_GREETING.length, 3);
  assert.equal(ROOK_MUSEUM_TOUR_INTRO.length, 4);
  assert.equal(ROOK_MUSEUM_COMPLETION.length, 5);
});

test('the tour cannot progress before Greeterbot starts it', () => {
  const state = createRookMuseumState({
    sourceLocation: { tsid: 'GLI2V0UN7RD1T2J', x: 100, y: 200 },
    enteredAt: 50,
  });
  assert.equal(state.status, 'arrival');
  assert.equal(rookMuseumObjective(state), 'Speak with Greeterbot Sentry G-42');
  assert.equal(visitRookMuseumExhibit(state, 'button_1').reason, 'tour_not_started');
  assert.equal(beginRookMuseumTour(state).ok, true);
  assert.equal(state.status, 'touring');
  assert.equal(beginRookMuseumTour(state).reason, 'already_started');
});

test('all six unique speaker buttons are required and repeat listening is safe', () => {
  const state = createRookMuseumState();
  beginRookMuseumTour(state);
  const first = visitRookMuseumExhibit(state, 'button_1');
  assert.equal(first.firstVisit, true);
  assert.equal(first.visited, 1);
  assert.equal(visitRookMuseumExhibit(state, 'button_1').firstVisit, false);
  assert.equal(state.visited.length, 1);

  for (const exhibit of ROOK_MUSEUM_EXHIBITS.slice(1)) {
    visitRookMuseumExhibit(state, exhibit.id);
  }
  assert.equal(state.status, 'ready');
  assert.equal(state.visited.length, 6);
  assert.equal(rookMuseumObjective(state), 'Return to Greeterbot Sentry G-42');
});

test('completion is gated, exact, and idempotent', () => {
  const state = createRookMuseumState();
  beginRookMuseumTour(state);
  assert.equal(completeRookMuseum(state).reason, 'exhibits_remaining');
  for (const exhibit of ROOK_MUSEUM_EXHIBITS) {
    visitRookMuseumExhibit(state, exhibit.id);
  }
  const done = completeRookMuseum(state, 12345);
  assert.equal(done.ok, true);
  assert.deepEqual(done.reward, { xp: 400 });
  assert.equal(state.status, 'complete');
  assert.equal(state.completedAt, 12345);
  assert.equal(completeRookMuseum(state).reason, 'already_complete');
});

test('the source-authored Focusing Orb lesson retains its overload warning', () => {
  const orb = getRookMuseumExhibit('button_3');
  assert.equal(orb.kind, 'orb');
  assert.equal(orb.pages.length, 7);
  assert.match(orb.pages.join(' '), /cannot be harmed/);
  assert.match(orb.pages.join(' '), /others must join/);
  assert.match(orb.pages.join(' '), /Orb will be destroyed/);
  assert.equal(getRookMuseumExhibit('missing'), null);
});

test('client ships clean recovered museum art and full transient integration', () => {
  const game = fs.readFileSync(path.join(root, 'public/game.js'), 'utf8');
  const content = fs.readFileSync(path.join(root, 'public/content.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'public/play/index.html'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'public/style.css'), 'utf8');
  const assetRoot = path.join(root, 'public/assets/sprites/quests/rook-museum');

  for (let painting = 1; painting <= 4; painting += 1) {
    for (const frame of ['a', 'b', 'c']) {
      assert.equal(
        fs.existsSync(path.join(assetRoot, `paintings/painting-${painting}${frame}.jpg`)),
        true
      );
    }
  }
  assert.equal(
    fs.existsSync(
      path.join(assetRoot, 'rook_hall_focusing_orb__x1_1_png_1354835872.png')
    ),
    true
  );
  assert.equal(
    fs.existsSync(path.join(assetRoot, 'rook_hall_speaker__x1_stop_png_1354835940.png')),
    true
  );
  assert.equal(
    fs.existsSync(
      path.join(assetRoot, 'rook_hall_shrine_holofilm__x1_stop_png_1354835839.png')
    ),
    true
  );

  assert.match(game, /startRookMuseum/);
  assert.match(game, /handleRookMuseumTarget/);
  assert.match(game, /updateRookMuseum/);
  assert.match(game, /rookmuseumautoplay/);
  assert.match(game, /ROOK_MUSEUM_PRODUCTION_TSID/);
  assert.match(content, /rook_hall_speaker/);
  assert.match(content, /npc_quest_widget/);
  assert.match(html, /id="rook-museum-hud"/);
  assert.match(html, /id="rook-museum-exhibit"/);
  assert.match(css, /\.rook-museum-hud/);
  assert.match(css, /\.rook-museum-exhibit/);
});

test('the hall stands on the GSJS points of the lost instance', () => {
  const gsjs = path.join(root, '..', 'glitch-GameServerJS');
  if (fs.existsSync(gsjs)) {
    const speaker = fs.readFileSync(path.join(gsjs, 'items/rook_hall_speaker.js'), 'utf8');
    const hall = fs.readFileSync(path.join(gsjs, 'quests/rook_hall.js'), 'utf8');
    for (const [id, at] of Object.entries(ROOK_MUSEUM_SOURCE.overlays)) {
      assert.match(speaker, new RegExp(`case '${id}':\\s*var overlay = '${at.overlay}';\\s*var x = ${at.x};\\s*var y = ${at.y};`), id);
    }
    for (const [id, at] of Object.entries(ROOK_MUSEUM_SOURCE.avatar)) {
      assert.match(speaker, new RegExp(`case '${id}':[\\s\\S]{0,160}?move_avatar', x: ${at.x}, y: ${at.y}, face: '${at.face}'`), id);
    }
    const { entry, greeterStart, greeterEnd } = ROOK_MUSEUM_SOURCE;
    assert.match(hall, new RegExp(`questInstanceLocation\\(pc, 'rook_museum', ${entry.x}, ${entry.y}`));
    assert.match(hall, new RegExp(`createItemStack\\('npc_quest_widget', 1, ${greeterStart.x}, ${greeterStart.y}\\)`));
    assert.match(hall, new RegExp(`move_to_xy', \\{x: ${greeterEnd.x}, y: ${greeterEnd.y}\\}`));
  }
  // Source x + 2600, the floor (-94) at world y 500.
  assert.deepEqual(rookMuseumWorldPoint(-2270), { x: 330, y: ROOK_MUSEUM_WORLD.floorY });
  assert.deepEqual(rookMuseumOverlayPoint('button_1'), { x: 1420, y: 404 });
  assert.equal(rookMuseumOverlayPoint('button_3'), null);
  const xs = ROOK_MUSEUM_EXHIBITS.map((e) => e.x);
  assert.deepEqual(xs, [...xs].sort((a, b) => a - b), 'exhibits run left to right in button order');
  for (const e of ROOK_MUSEUM_EXHIBITS.filter((x) => x.kind === 'painting')) {
    assert.equal(e.x, rookMuseumOverlayPoint(e.id).x, e.id);
  }
  assert.equal(ROOK_MUSEUM_HALL.spawn.x, 330);
  assert.deepEqual(ROOK_MUSEUM_HALL.greeterEnd, { x: 4800, y: 494 });
  const width = ROOK_MUSEUM_WORLD.right - ROOK_MUSEUM_WORLD.left;
  for (const x of [ROOK_MUSEUM_HALL.door.x, ROOK_MUSEUM_HALL.greeterEnd.x, ...ROOK_MUSEUM_HALL.windows, ...xs]) {
    assert.ok(x > 0 && x < width, `${x} inside the hall`);
  }
  // Frames hang clear of each other: 429 px decos plus the speaker right of each.
  const paintings = ROOK_MUSEUM_EXHIBITS.filter((e) => e.kind === 'painting');
  for (let i = 1; i < paintings.length; i += 1) {
    assert.ok(paintings[i].x - paintings[i - 1].x > 429 + ROOK_MUSEUM_HALL.paintingSpeaker.dx, paintings[i].id);
  }
});

test('the paintings are their decos’ own frames over the overlay frames, cross-fading on its timeline', () => {
  const plan = JSON.parse(fs.readFileSync(path.join(root, 'tools/rook-art/plan.json'), 'utf8'));
  const stills = { 1: 'c', 2: 'a', 3: 'a', 4: 'c' };
  for (const n of [1, 2, 3, 4]) {
    const art = ROOK_MUSEUM_PAINTING_ART[n];
    const row = plan.pieces.find((p) => p.name === `rook_hall_painting_0${n}_deco`);
    assert.equal(row.source, `bundle:firebog.swf#rook_hall_painting_0${n}_deco`);
    assert.equal(art.file, `assets/${row.file.slice('assets/'.length)}`);
    assert.equal(fs.existsSync(path.join(root, 'public', art.file)), true);
    assert.deepEqual([...art.window], [17.95, 17.3, 400, 244]);
    assert.deepEqual(art.stage, [429, 313]);
    assert.equal(art.picture, `painting-${n}${stills[n]}.jpg`);
  }
  assert.equal(fs.existsSync(path.join(root, 'public', ROOK_MUSEUM_STAND_ART.file)), true);

  // 24 fps, 130 frames: c fades to a over 0-9, a to b over 39-49, b to c over 79-89.
  assert.equal(ROOK_MUSEUM_PAINTING_LOOP.fps, 24);
  assert.equal(ROOK_MUSEUM_PAINTING_LOOP.frames, 130);
  const at = (frame) => rookMuseumPaintingAlphas((frame * 1000) / 24 + 1);
  const top = (alphas) => ['c', 'b', 'a', 'c'][alphas.reduce((best, a, i) => (a >= 0.999 ? i : best), -1)];
  assert.deepEqual(at(0), [0, 0, 1, 1]);
  assert.equal(at(9)[3], 0);
  assert.equal(top(at(20)), 'a');
  assert.equal(top(at(60)), 'b');
  assert.equal(top(at(100)), 'c');
  assert.deepEqual(at(130), at(0), 'loops');
  assert.ok(at(44)[2] > 0 && at(44)[2] < 1, 'a mid-fade');
});

test('the hall draws Tiny Speck art only: no drawn walls, labels, Greeterbot or frame borders', () => {
  const game = fs.readFileSync(path.join(root, 'public/game.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'public/play/index.html'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'public/style.css'), 'utf8');
  const hall = game.slice(game.indexOf('function drawRookMuseumBackground()'), game.indexOf('function renderRookMuseumHud()'));
  assert.doesNotMatch(hall, /new PIXI\.Graphics/);
  assert.doesNotMatch(game, /makeRookMuseumPlacard/);
  for (const deco of ['jethimadh_int_bg_center', 'jethimadh_tower_window_1', 'rookhall_spotlight', 'door_asset_jethimadh_int', 'jethimadh_int_door_sign', 'sign_arrow_1', 'bench', 'firebog_linear_gradient_shadow']) {
    assert.match(hall, new RegExp(`'${deco}'`), deco);
    assert.equal(fs.existsSync(path.join(root, 'public/assets/decos/groddle', `${deco}.webp`)), true, deco);
  }
  assert.equal(fs.existsSync(path.join(root, 'public', ROOK_MUSEUM_HALL.greeterArt)), true);
  assert.match(html, /data-rook-museum-painting/);
  assert.equal((html.match(/data-rook-museum-layer="\d"/g) || []).length, 4);
  assert.match(html, /data-rook-museum-frame/);
  assert.doesNotMatch(css, /is-painting img \{[^}]*border: 10px/);
});
