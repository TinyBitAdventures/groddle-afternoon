/**
 * Large and Medium Petrified Rocks (G125, G345): Feat rewards for the top
 * contributors. The Large rock is "drawn to the 13 who contributed the most
 * awe" (items/petrified_rock_large.js:8), so places 1 to 13 of a shared Feat
 * get one and places 14 to 26 a Medium one; solo Feats give Small rocks only
 * (G143), so both rocks are multiplayer (tools/inventory/overrides.json).
 * Run: node --test tests/petrified-rocks-mp.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { LARGE_PLACES, ROCK_LARGE, ROCK_MEDIUM, TOP_PLACES } from '../public/js/feats-mp.js?v=3aa606d6';
import { featTable } from '../tools/build-realtime-feats.mjs';
import { CRACK_STEPS } from '../public/js/artifacts.js?v=fc419ecf';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const GSJS = join(homedir(), 'Documents/glitch-audit/glitch-GameServerJS');

describe('Petrified Rocks for the top contributors', () => {
  it('the Large rock goes to the 13 who contributed the most (petrified_rock_large.js:8)', () => {
    assert.equal(LARGE_PLACES, 13);
    assert.ok(LARGE_PLACES < TOP_PLACES);
    const file = join(GSJS, 'items/petrified_rock_large.js');
    if (existsSync(file)) assert.match(readFileSync(file, 'utf8'), /drawn to the 13 who contributed the most awe to the act/);
  });

  it('the server table carries the tiers', () => {
    const t = featTable();
    assert.equal(t.reward.largePlaces, 13);
    assert.equal(t.reward.topPlaces, 26);
    assert.equal(t.reward.large, ROCK_LARGE);
    assert.equal(t.reward.medium, ROCK_MEDIUM);
  });

  it('a Large rock can crack into a Medium one (2%), as the source', () => {
    const step = CRACK_STEPS.petrified_rock_large.find((s) => s.items);
    assert.equal(step.chance, 0.02);
    assert.deepEqual(step.items, [['petrified_rock_small', 1], ['petrified_rock_medium', 1]]);
  });

  it('the inventory judges both rocks multiplayer (solo Feats give Small rocks only)', () => {
    const o = JSON.parse(readFileSync(join(root, 'tools/inventory/overrides.json'), 'utf8'));
    for (const id of ['petrified_rock_large', 'petrified_rock_medium']) {
      const row = o[`item:${id}`];
      assert.ok(row?.mp, `${id} has its multiplayer proof`);
      assert.match(row.mpReason, /feats\.go/);
    }
  });
});
