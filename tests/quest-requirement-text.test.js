/**
 * Every quest requirement line reads as words in the quest log. GSJS left a few `desc`s as raw keys
 * ("black_pepper_made", "Gift_5_neighbors"); build-quests.mjs REQUIREMENT_TEXT gives them words.
 * Run: node --test tests/quest-requirement-text.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const quests = JSON.parse(readFileSync(join(root, 'public', 'assets', 'content', 'quests.json'), 'utf8'));

describe('quest requirement text', () => {
  it('has no raw keys in any requirement line', () => {
    const raw = [];
    for (const q of Object.values(quests)) {
      for (const r of q.requirements || []) {
        if (/^[A-Za-z0-9]+(_[A-Za-z0-9]+)+$/.test(String(r.desc || '').trim())) raw.push(`${q.classTsid} ${r.id}: ${r.desc}`);
      }
    }
    assert.deepEqual(raw, []);
  });

  it('words Umbrian Black and White and The nicest day in the neighborhood', () => {
    const desc = (id) => quests[id].requirements.map((r) => r.desc);
    assert.deepEqual(desc('umbra_black_white'), ['Make a mound of Black Pepper', 'Make a vial of White Gas', 'Make a piece of Licorice']);
    assert.deepEqual(desc('neighbor_gifts'), ['Leave gifts with the butlers of 5 neighbors']);
  });
});
