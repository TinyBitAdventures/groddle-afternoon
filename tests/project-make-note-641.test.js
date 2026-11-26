/**
 * #641: the home street Tower project asks for 16 Wall Segments, and nothing on it said that making
 * one needs Furnituremaking II (and Engineering I). Glitch's job window linked each item to its info
 * card, which said how it is made (JobDetailsUI.as 195-197); the remake's project rows now say it,
 * the Tower's and the street projects' alike (js/street-job-asks.js itemMakeNote).
 * Run: node --test tests/project-make-note-641.test.js
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { itemMakeNote, skillRankLabel } from '../public/js/street-job-asks.js?v=84b712a3';
import { listRecipesProducing, loadRecipeCatalogFromFile } from '../public/js/making.js?v=dc595568';
import { TOWER_JOBS } from '../public/js/home-tower.js?v=a7fc0cce';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const ctx = (learned = []) => ({ recipesFor: listRecipesProducing, skillLabel: (id) => skillRankLabel(id), itemName: (c) => ({ construction_tool: 'Construction Tool', metalmaker: 'Metal Machine' })[c] || c, learned });

describe('#641: a project part says what it takes to make', () => {
  before(() => loadRecipeCatalogFromFile(join(root, 'public/assets/content/recipes.json')));

  it('Wall Segments: the Construction Tool, Engineering I and Furnituremaking II, the one you lack marked', () => {
    const r = { type: 'item', classId: 'wall_segment' };
    assert.deepEqual(itemMakeNote(r, ctx(['engineering_1'])), {
      text: "Made with a Construction Tool, needs Engineering I and Furnituremaking II; you don't know Furnituremaking II yet",
      missing: ['furnituremaking_2'],
    });
    assert.deepEqual(itemMakeNote(r, ctx(['engineering_1', 'furnituremaking_2'])).missing, []);
    assert.equal(itemMakeNote({ ...r, done: true }, ctx()), null, 'a step done says nothing');
    assert.equal(itemMakeNote({ type: 'item', classId: 'snail' }, ctx()), null, 'nothing made: nothing said');
    assert.equal(itemMakeNote({ type: 'work', classId: 'wall_segment' }, ctx()), null);
  });

  it('every item the Tower and its floors ask for that a recipe makes names its skills', () => {
    let named = 0;
    for (const [id, job] of Object.entries(TOWER_JOBS)) {
      for (const r of job.requirements.filter((x) => x.type === 'item')) {
        const made = listRecipesProducing(r.classId).some((x) => (x.skills?.length || x.skill));
        const note = itemMakeNote(r, ctx());
        assert.equal(Boolean(note), made, `${id} ${r.classId}`);
        if (note) named += 1;
      }
    }
    assert.ok(named >= 2, `${named} parts`);
  });

  it('the Tower panel and the street project board both show it', () => {
    const tower = read('public/js/features/home-tower-feature.js');
    assert.match(tower, /const make = itemMakeNote\(r, \{ recipesFor: listRecipesProducing,/);
    assert.match(tower, /const getLink = getItLink\(engine, itemAskSubject\(r, itemLabel\)\);/);
    const board = read('public/js/features/street-jobs-feature.js');
    assert.match(board, /const make = itemMakeNote\(r, \{ recipesFor: listRecipesProducing,/);
  });
});
