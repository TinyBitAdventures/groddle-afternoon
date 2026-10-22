/**
 * The restoration walkthrough (/restoration/) stays in sync with the code:
 * checklist evidence exists, every diorama spot has an item, and
 * public/restoration/data.json matches what tools/build-restoration.mjs
 * computes now. When this fails after landing work, update
 * tools/restoration/checklist.mjs and run node tools/build-restoration.mjs.
 * Run: node --test tests/restoration.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHECKLIST, GROUPS, STATUS } from '../tools/restoration/checklist.mjs';
import { SHOTS } from '../tools/restoration/shots.mjs';
import { buildRestorationData, comparable } from '../tools/build-restoration.mjs';
import { QUEST_ROOMS } from '../public/js/quest-rooms/catalog.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PLAYABLE = new Set(['source', 'rebuilt', 'reimagined', 'solo']);

describe('restoration checklist', () => {
  it('uses known statuses and groups, and unique ids', () => {
    const ids = new Set();
    for (const item of CHECKLIST) {
      assert.ok(STATUS[item.status], `${item.id}: ${item.status}`);
      assert.ok(GROUPS.some((g) => g.id === item.group), `${item.id}: ${item.group}`);
      assert.ok(!ids.has(item.id), `duplicate ${item.id}`);
      ids.add(item.id);
      assert.ok(item.blurb && item.name, item.id);
    }
  });

  it('every playable item points at files that exist', () => {
    for (const item of CHECKLIST.filter((i) => PLAYABLE.has(i.status))) {
      assert.ok(item.evidence.length, `${item.id} needs evidence`);
      for (const p of item.evidence) assert.ok(existsSync(join(root, p)), `${item.id}: ${p}`);
    }
  });

  it('every diorama spot on the page opens a checklist item', () => {
    const html = readFileSync(join(root, 'public/restoration/index.html'), 'utf8');
    const spots = new Set([...html.matchAll(/data-spot="([^"]+)"/g)].map((m) => m[1]));
    assert.ok(spots.size >= 12);
    for (const spot of spots) assert.ok(CHECKLIST.some((i) => i.spot === spot), spot);
  });

  it('screenshot keys name checklist items or quest rooms', () => {
    const rooms = new Set(Object.values(QUEST_ROOMS));
    for (const key of Object.keys(SHOTS)) {
      if (key.startsWith('room:')) assert.ok(rooms.has(key.slice(5)), key);
      else assert.ok(CHECKLIST.some((i) => i.id === key), key);
    }
  });
});

describe('restoration data', () => {
  it('public/restoration/data.json is current (run node tools/build-restoration.mjs)', async () => {
    const file = JSON.parse(readFileSync(join(root, 'public/restoration/data.json'), 'utf8'));
    const now = await buildRestorationData();
    assert.equal(comparable(file), comparable(now));
  });

  it('lists every quest room', async () => {
    const data = await buildRestorationData();
    assert.equal(data.rooms.total, new Set(Object.values(QUEST_ROOMS)).size);
    assert.ok(data.quests.playable > 100);
  });
});
