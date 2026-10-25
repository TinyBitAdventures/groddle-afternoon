// G216: quoins respawn on their class's timer (items/quoin.js 305, 320-662),
// moving quoins, and the Grab 'Em Good QA option that puts the rival close.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  QUOIN_CLASSES,
  QUOIN_TYPES,
  STREET_BIG_QUOIN_CHANCE,
  STREET_QUOIN_CLASSES,
  noteQuoinRespawn,
  quoinRespawnMs,
  releaseQuoinRespawns,
  streetQuoinClass,
} from '../public/js/quoins.js';
import { normalizeWorldSnapshot } from '../public/js/player-save.js?v=player-save-16';

const here = dirname(fileURLToPath(import.meta.url));
const pub = join(here, '../public');
const read = (rel) => readFileSync(join(pub, rel), 'utf8');
const gsjs = join(here, '../../glitch-GameServerJS');
const quoinJs = join(gsjs, 'items/quoin.js');
const game = read('game.js');

/** Every case of quoin.js onPropsChanged: name, type, respawn_time (s), line. */
function sourceClasses() {
  const lines = readFileSync(quoinJs, 'utf8').split('\n');
  const start = lines.findIndex((l) => l.startsWith('function onPropsChanged'));
  const rows = [];
  let cur = null;
  for (let i = start; i < start + 360; i += 1) {
    const l = lines[i].trim();
    const c = l.match(/^case '([^']*)':/);
    if (c) {
      cur = c[1] ? { name: c[1], line: i + 1, type: '' } : null;
      if (cur) rows.push(cur);
      continue;
    }
    if (!cur) continue;
    const t = l.match(/^this\.instanceProps\.type = ["'](\w+)["'];/);
    if (t) cur.type = t[1];
    const r = l.match(/^this\.instanceProps\.respawn_time = ([\d*]+);/);
    // eslint-disable-next-line no-new-func
    if (r) cur.respawnSec = Function(`return ${r[1]}`)();
  }
  return rows;
}

describe('quoin classes against items/quoin.js', { skip: !existsSync(quoinJs) && 'glitch-GameServerJS not beside the spike' }, () => {
  it('every class_name, its type, respawn_time and line, exactly', () => {
    const rows = sourceClasses();
    assert.equal(rows.length, 44);
    assert.deepEqual(Object.keys(QUOIN_CLASSES), rows.map((r) => r.name));
    for (const r of rows) {
      const mine = QUOIN_CLASSES[r.name];
      assert.equal(mine.respawnSec, r.respawnSec, r.name);
      assert.equal(mine.type, r.type, r.name);
      assert.equal(mine.line, r.line, r.name);
    }
    const secs = rows.filter((r) => !['placement tester', 'rainbow run'].includes(r.name) && r.respawnSec < 400000).map((r) => r.respawnSec);
    assert.equal(Math.min(...secs), 40, '40 s');
    assert.equal(Math.max(...secs), 3600, '60 min');
  });

  it('respawns after respawn_time except in races and games; a qurazy quoin is deleted', () => {
    const src = readFileSync(quoinJs, 'utf8');
    assert.match(src, /if \(!this\.container\.is_race && !this\.container\.is_game && this\.container\.game_type != 'cloudhopolis' && !this\.container\.isInstance\('top_of_tree'\)\) this\.apiSetTimer\("onRespawn", 1000 \* this\.instanceProps\.respawn_time\);/);
    assert.match(src, /if \(this\.instanceProps\.type == 'qurazy'\)\{\s*pc\.announce_sound\('QUORAZY_QUOIN'\);[\s\S]{0,200}return this\.apiDelete\(\);/);
    assert.match(src, /function onRespawn\(\)\{ \/\/ defined by quoin\s*this\.spawned = 1;/);
  });

  it('moving quoins: a spawner class the remake has no placements for (moving_quoin.js keeps its own distributeQuoinShards)', () => {
    const moving = readFileSync(join(gsjs, 'items/moving_quoin.js'), 'utf8');
    assert.match(moving, /function distributeQuoinShards\(pc, amount\)\{ \/\/ defined by quoin/);
    assert.match(moving, /function onDoneMoving\(\)\{ \/\/ defined by moving_quoin\s*this\.apiDelete\(\);/);
    assert.doesNotMatch(game, /moving_quoin/);
  });
});

describe('street quoin classes', () => {
  it('each type draws from its own street tiers; qurazy never respawns', () => {
    for (const [type, list] of Object.entries(STREET_QUOIN_CLASSES)) {
      for (const name of list) assert.equal(QUOIN_CLASSES[name].type, type, name);
      assert.ok(QUOIN_TYPES[type], type);
    }
    assert.equal(streetQuoinClass('GLI2V0UN7RD1T2J', 0, 'qurazy'), '');
    assert.equal(quoinRespawnMs(''), Infinity);
    assert.ok(STREET_QUOIN_CLASSES.xp.includes(streetQuoinClass('GLI2V0UN7RD1T2J', 3, 'mystery')), 'mystery uses the iMG tiers');
  });

  it('is stable per street spot; about 5% are the big class (G257, purple_emperor.js 58-75)', () => {
    const a = streetQuoinClass('GLI2V0UN7RD1T2J', 2, 'currants');
    assert.equal(streetQuoinClass('GLI2V0UN7RD1T2J', 2, 'currants'), a);
    let big = 0;
    const n = 4000;
    for (let i = 0; i < n; i += 1) if (streetQuoinClass(`street${i}`, i % 8, 'currants') === 'slow medium-large currants') big += 1;
    assert.ok(big / n > 0.035 && big / n < 0.065, `${big} of ${n}`);
    assert.equal(STREET_BIG_QUOIN_CHANCE, 0.05);
  });

  it('fast tiny currants: back 40 s after the grab, not before', () => {
    const street = { collectedQuoins: [0, 3], quoinRespawn: {} };
    const t = 1_000_000;
    assert.equal(quoinRespawnMs('fast tiny currants'), 40_000);
    noteQuoinRespawn(street, 0, quoinRespawnMs('fast tiny currants'), t);
    noteQuoinRespawn(street, 3, quoinRespawnMs('long random large xp'), t);
    assert.deepEqual(releaseQuoinRespawns(street, t + 39_999), []);
    assert.deepEqual(street.collectedQuoins, [0, 3]);
    assert.deepEqual(releaseQuoinRespawns(street, t + 40_000), [0]);
    assert.deepEqual(street.collectedQuoins, [3]);
    assert.deepEqual(releaseQuoinRespawns(street, t + 3_599_999), []);
    assert.deepEqual(releaseQuoinRespawns(street, t + 3_600_000), [3]);
    assert.deepEqual(street.collectedQuoins, []);
  });

  it('a quoin with no respawn stays collected until the day turns', () => {
    const street = { collectedQuoins: [5] };
    assert.equal(noteQuoinRespawn(street, 5, Infinity, 0), null);
    assert.deepEqual(releaseQuoinRespawns(street, 1e15), []);
    assert.deepEqual(street.collectedQuoins, [5]);
  });

  it('the save keeps respawn times for collected spots only', () => {
    const world = normalizeWorldSnapshot({
      streets: { GLI2V0UN7RD1T2J: { collectedQuoins: [1, 4], quoinRespawn: { 1: 123456, 4: 'x', 7: 999, '-2': 5 } } },
    });
    assert.deepEqual(world.streets.GLI2V0UN7RD1T2J.quoinRespawn, { 1: 123456 });
  });

  it('game.js notes the respawn on a grab, releases due ones on arrival and while you stay', () => {
    assert.match(game, /const respawnMs = quoinRespawnMs\(q\.quoinClass\);\s*noteQuoinRespawn\(streetWorldState\(\), q\.naturalQuoinIndex, respawnMs, Date\.now\(\)\);/);
    assert.match(game, /releaseQuoinRespawns\(world, Date\.now\(\)\);\s*const collected = new Set\(world\.collectedQuoins\);/);
    assert.match(game, /\/\/ quoin auto collect\s*tickQuoinRespawns\(\);/);
    // G227: the day turn keeps timed spots (resetStreetQuoinsForNewDay, tests/quoin-class-benefit.test.js).
    assert.match(game, /n \+= resetStreetQuoinsForNewDay\(street\);/);
  });
});

describe('Grab \'Em Good: &racerival=close', () => {
  const races = read('js/features/races-feature.js');
  it('is documented and only for the quoin game', () => {
    assert.match(races, /&racerival=close {21}the rival keeps 90 px ahead of you/);
    assert.match(races, /rivalClose = course\.kind === 'quoins' && params\.get\('racerival'\) === 'close';/);
  });
  it('the rival takes what it touches instead of its timeline, so shards go both ways', () => {
    assert.match(races, /rivalMs: rivalFrozen \|\| rivalClose \? Infinity : timeAtIndex\(rivalTimeline, q\.rivalAt\),/);
    assert.match(races, /const rival = !touched && \(rivalClose\s*\? Boolean\(rivalSprite && !rivalSprite\.destroyed && Math\.abs\(rivalSprite\.x - q\.x\) <= 40/);
    // The shard call itself is unchanged (G212): `others` names the rival on your grabs, `at` is the rival on its own.
    assert.match(races, /others: touched && rivalAt \? \[rivalAt\] : \[\],/);
  });
});
