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
  ROOK_MUSEUM_PRODUCTION_TSID,
  ROOK_MUSEUM_REWARD,
  ROOK_MUSEUM_STREET_ID,
  ROOK_MUSEUM_TOUR_INTRO,
  beginRookMuseumTour,
  completeRookMuseum,
  createRookMuseumState,
  getRookMuseumExhibit,
  rookMuseumObjective,
  visitRookMuseumExhibit,
} from '../public/js/rook-museum.js';

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
