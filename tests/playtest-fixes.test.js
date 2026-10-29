// Austin's playtest, 2026-10-25 (register G245-G248): station stairs, Bureaucratic Hall clerks and room, pumpkin glow.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STATION_BOUNDS, STATION_X } from '../public/js/subway.js';
import { SUBWAY_ART } from '../public/js/subway-art.js';

const pub = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const read = (p) => readFileSync(join(pub, p), 'utf8');

test('G245 the station stairs stand flush with the station\'s left end', () => {
  assert.equal(STATION_X.stairs - SUBWAY_ART.door_asset_stairs[1] / 2, STATION_BOUNDS.l);
});

test('G246 clerk sheets stop before their empty cells and play at the SWF\'s 30 fps', () => {
  const game = read('game.js');
  for (let i = 0; i < 4; i += 1) {
    assert.match(game, new RegExp(`bureaucrat${i}Idle: \\{\\n[^}]*cols: 10, rows: 6, frameCount: 57,`));
    assert.match(game, new RegExp(`bureaucrat${i}Talk: \\{\\n[^}]*cols: 9, rows: 3, frameCount: 26,`));
  }
  const make = game.slice(game.indexOf('function makeLegalizeBureaucrat'), game.indexOf('function spawnLegalizeTransitGate'));
  assert.equal((make.match(/animationSpeed = 0\.5;/g) || []).length, 2);
});

test('G247 hall: glass doors, then the chairs, then the counter, none overlapping', () => {
  // BHALL: the chairs are Tiny Speck's, painted into bureaucratic_hall_bg (backdrop x 640-1230);
  // the doors sit on the desk room's wall and the counter starts at the helpers' limit.
  const game = read('game.js');
  assert.doesNotMatch(game, /for \(const x of \[250, 340, 430, 520\]\)/);
  const halls = read('js/features/bureaucratic-halls-feature.js');
  assert.match(game, /counter\.position\.set\(HALL_LAYOUT\.counterLeft, HALL\.ground \+ 4\);\n  counter\.width = 811;/);
  assert.match(halls, /counter\.position\.set\(HALL_LAYOUT\.counterLeft, HALL\.ground \+ 4\);\n  counter\.width = 811;/);
  assert.match(halls, /const EXIT_X = HALL_LAYOUT\.exitX;/);
  assert.match(read('js/bureaucratic-hall.js'), /exitX: 72,/);
});

test('G248 lit pumpkins have no drawn rings round them', () => {
  const seasons = read('js/features/seasons-feature.js');
  assert.doesNotMatch(seasons, /makeGlow/);
});
