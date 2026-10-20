/**
 * Game of Crowns: crown clock below the play line, tagging and locks, the
 * source reward, and the arena navigation graph on the archived street.
 * Run: node --test tests/game-of-crowns.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CROWNS_LOCK_RESPAWN_MS,
  CROWNS_PICKUP_LOCK_MS,
  CROWNS_STREET,
  CROWNS_TAG_LOCK_MS,
  CROWNS_TEXT,
  CROWNS_WIN_MS,
  CROWNS_WIN_REWARD,
  beginCrownsCountdown,
  buildNavGraph,
  createCrownsGame,
  crownRemainingSeconds,
  crownsCountdownCue,
  crownsLocked,
  crownsResult,
  crownsStandings,
  findNavPath,
  nearestNavNode,
  pickupCrownLock,
  placeCrownLocks,
  playLineScreenY,
  tagCrowns,
  tickCrowns,
} from '../public/js/game-of-crowns.js';
import { platformsScreen, wallsScreen } from '../public/js/street-model.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const players = [
  { id: 'you', name: 'You' },
  { id: 'Amp', name: 'Amp' },
  { id: 'Bumbishfish', name: 'Bumbishfish' },
  { id: 'Lily Linguistic', name: 'Lily Linguistic' },
];

function running(seed = {}) {
  const game = createCrownsGame({ now: 0, players, itId: 'you', ...seed });
  beginCrownsCountdown(game, 0);
  tickCrowns(game, 4000, {});
  return game;
}

describe('Game of Crowns rules', () => {
  it('counts down READY?/3/2/1/GO over 4 s', () => {
    const game = createCrownsGame({ now: 0, players, itRoll: 0 });
    assert.equal(game.itId, 'you');
    beginCrownsCountdown(game, 0);
    assert.equal(crownsCountdownCue(game, 100), 'READY?');
    assert.equal(crownsCountdownCue(game, 1500), '3');
    assert.deepEqual(tickCrowns(game, 4000, {}), [{ type: 'started', itId: 'you' }]);
    assert.equal(game.status, 'running');
  });

  it('only runs the crown clock below the play line', () => {
    const game = running();
    tickCrowns(game, 14_000, { you: false });
    assert.equal(game.players.you.crownMs, 0);
    tickCrowns(game, 24_000, { you: true });
    tickCrowns(game, 34_000, { you: true });
    assert.equal(game.players.you.crownMs, 10_000);
    assert.equal(crownRemainingSeconds(game, 'you'), 50);
    assert.equal(CROWNS_TEXT.youreIt(50), "You're it! Keep it for 50 seconds, and win!");
  });

  it('wins at 60 seconds with the source reward', () => {
    const game = running({ players: players.map((p) => (p.id === 'you' ? { ...p, crownMs: 55_000 } : p)) });
    tickCrowns(game, 5000, { you: true });
    const events = tickCrowns(game, 11_000, { you: true });
    assert.ok(events.some((e) => e.type === 'won' && e.winner === 'you'));
    const result = crownsResult(game, 'you');
    assert.equal(result.won, true);
    assert.deepEqual(result.reward, CROWNS_WIN_REWARD);
    assert.deepEqual(CROWNS_WIN_REWARD, { xp: 200, currants: 50 });
    assert.equal(CROWNS_WIN_MS, 60_000);
  });

  it('passes the crown on a tag and locks it for one second', () => {
    const game = running();
    assert.equal(crownsLocked(game, 'you', 4500), false);
    const out = tagCrowns(game, 'Amp', 'you', 5000);
    assert.deepEqual(out, { type: 'crown_passed', from: 'you', to: 'Amp' });
    assert.equal(game.players.Amp.lockUntil, 5000 + CROWNS_TAG_LOCK_MS);
    assert.equal(tagCrowns(game, 'you', 'Amp', 5500), null, 'locked crowns cannot be stolen');
    assert.ok(tagCrowns(game, 'you', 'Amp', 6100));
    assert.equal(tagCrowns(game, 'Bumbishfish', 'Lily Linguistic', 6200), null, 'neither holds it');
  });

  it('Crown Game Locks lock the holder for 4 s and respawn after 12 s', () => {
    const game = running();
    placeCrownLocks(game, [{ x: 10, y: 20 }, { x: 30, y: 40 }]);
    const got = pickupCrownLock(game, 'you', 0, 5000);
    assert.deepEqual(got, { ok: true, locked: true, text: '+4 seconds' });
    assert.equal(game.players.you.lockUntil, 5000 + CROWNS_PICKUP_LOCK_MS);
    assert.equal(pickupCrownLock(game, 'Amp', 0, 6000).ok, false);
    const other = pickupCrownLock(game, 'Amp', 1, 6000);
    assert.equal(other.locked, false, 'a lock only protects the holder');
    assert.equal(pickupCrownLock(game, 'Amp', 0, 5000 + CROWNS_LOCK_RESPAWN_MS).ok, true);
  });

  it('ranks the scoreboard by crown time', () => {
    const game = running();
    game.players.Amp.crownMs = 30_000;
    assert.equal(crownsStandings(game)[0].id, 'Amp');
  });
});

describe('Game of Crowns arena', () => {
  const street = JSON.parse(readFileSync(join(root, 'assets/streets', `${CROWNS_STREET}.json`), 'utf8'));

  it('uses the archived arena and its art', () => {
    assert.equal(street.label, 'Game of Crowns');
    assert.equal(playLineScreenY(street), 610);
    for (const name of ['crown_game_lock', 'game_crown_unlocked', 'game_crown_locked']) {
      assert.ok(existsSync(join(root, 'assets/sprites/races/crowns', `${name}.png`)), name);
    }
  });

  it('finds paths from the waiting ledges down into the play area', async () => {
    const { CROWNS_LADDERS: ladders } = await import('../public/js/game-of-crowns.js');
    assert.equal(ladders.length, 5);
    const withWalls = { ...street, walls: ladders.map((l) => ({ id: l.id, x: l.x, y: l.y - l.h, w: 50, h: l.h })) };
    const graph = buildNavGraph(platformsScreen(withWalls), wallsScreen(withWalls), { jumpScale: 1.15 });
    assert.ok(graph.nodes.length > 100);
    const top = nearestNavNode(graph, 1180, 243);
    const floor = nearestNavNode(graph, 2600, 1770);
    const path = findNavPath(graph, top, floor);
    assert.ok(path.length > 3, 'top → floor');
    assert.ok(path.some((step) => step.mode === 'drop' || step.mode === 'jump'));
    const climb = findNavPath(graph, nearestNavNode(graph, 1974, 1770), nearestNavNode(graph, 1960, 1302));
    assert.ok(climb.some((step) => step.mode === 'climb'), 'ladders are climbable');
  });
});
