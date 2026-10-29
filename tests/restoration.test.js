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
import { buildRestorationData, comparable, historyLog } from '../tools/build-restoration.mjs';
import { QUEST_ROOMS } from '../public/js/quest-rooms/catalog.js';
import { ROOM_NOTES } from '../tools/restoration/rooms.mjs';
import { DESIGNER_LEVELS, TEXT_LEVELS } from '../tools/restoration/designer-levels.mjs';

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

  it('says in one sentence what works between real players, only on systems that are back (G324)', async () => {
    const mp = CHECKLIST.filter((i) => i.multiplayer != null);
    assert.ok(mp.length >= 10, `${mp.length} multiplayer items`);
    for (const item of mp) {
      assert.equal(typeof item.multiplayer, 'string', item.id);
      assert.ok(item.multiplayer.length > 20 && /\.$/.test(item.multiplayer), `${item.id}: one sentence`);
      assert.ok(!/—/.test(item.multiplayer), `${item.id}: no em-dashes`);
      assert.ok(PLAYABLE.has(item.status), `${item.id} is ${item.status}`);
    }
    const data = await buildRestorationData();
    assert.equal(data.multiplayer, mp.length);
    assert.deepEqual(data.items.filter((i) => i.multiplayer).map((i) => i.id), mp.map((i) => i.id));
  });

  it('every diorama spot on the page opens a checklist item', () => {
    const html = readFileSync(join(root, 'public/restoration/index.html'), 'utf8');
    const spots = new Set([...html.matchAll(/data-spot="([^"]+)"/g)].map((m) => m[1]));
    assert.ok(spots.size >= 12);
    for (const spot of spots) assert.ok(CHECKLIST.some((i) => i.spot === spot), spot);
  });

  it('screenshot keys name checklist items, quest rooms or designer levels', () => {
    const rooms = new Set(Object.values(QUEST_ROOMS));
    const levels = new Set([...DESIGNER_LEVELS, ...TEXT_LEVELS].map((l) => l.shot));
    for (const key of Object.keys(SHOTS)) {
      if (key.startsWith('room:')) assert.ok(rooms.has(key.slice(5)), key);
      else if (key.startsWith('level:')) assert.ok(levels.has(key), key);
      else assert.ok(CHECKLIST.some((i) => i.id === key), key);
    }
  });
});

describe('quest room explainers', () => {
  it('every room has a complete explainer', () => {
    for (const room of new Set(Object.values(QUEST_ROOMS))) {
      const note = ROOM_NOTES[room];
      assert.ok(note, `${room} needs an entry in tools/restoration/rooms.mjs`);
      for (const field of ['tagline', 'about', 'play', 'source', 'rebuilt']) assert.ok(note[field], `${room}.${field}`);
      for (const f of note.footage) assert.match(f.id, /^[\w-]{11}$/, `${room} footage id`);
    }
    for (const id of Object.keys(ROOM_NOTES)) assert.ok(Object.values(QUEST_ROOMS).includes(id), `stale note ${id}`);
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

  it('every room card shows a name, never its code id (firefly_whistle, 2026-10-29)', async () => {
    const data = await buildRestorationData();
    for (const room of data.rooms.rooms) {
      assert.notEqual(room.title, room.id, `${room.id} shows its code name`);
      assert.doesNotMatch(room.title, /^[a-z0-9]+(?:_[a-z0-9]+)+$/, `${room.id}: ${room.title}`);
    }
    const firefly = data.rooms.rooms.find((r) => r.id === 'firefly_whistle');
    assert.equal(firefly?.title, 'Firefly Whistle', "GSJS quests/firefly_whistle.js title");
  });
});

describe('every-change history', () => {
  it('lists player-visible commits newest first, with their bullets', () => {
    const { changes, since } = historyLog();
    assert.ok(changes.length > 100, `only ${changes.length} changes`);
    for (const c of changes) {
      assert.ok(['new', 'improve', 'fix'].includes(c.kind), c.hash);
      assert.match(c.date, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(c.text.length > 0 && Array.isArray(c.details), c.hash);
    }
    assert.ok(changes[0].date >= changes[changes.length - 1].date);
    assert.equal(since, changes[changes.length - 1].date);
  });

  it('has a page that reads history.json and is linked from the report', () => {
    const page = readFileSync(join(root, 'public/restoration/history/index.html'), 'utf8');
    assert.match(page, /history\.js/);
    assert.match(readFileSync(join(root, 'public/restoration/history/history.js'), 'utf8'), /\.\.\/history\.json/);
    assert.match(readFileSync(join(root, 'public/restoration/index.html'), 'utf8'), /href="history\/"/);
  });
});
