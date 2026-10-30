/**
 * The full skill tree model behind the Skills panel (js/skill-tree.js):
 * categories, families, honest remake notes, prerequisite chains, search
 * and filters, and the Giant emblem skill unlocks (items/emblem_base).
 * Run: node --test tests/skill-tree.test.js
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

import { loadContentCatalogsFromDir, getSkillCatalog } from '../public/js/content-catalogs.js?v=10b118dd';
import { createSkillState, grantSkill } from '../public/js/skills.js?v=4542bdf9';
import {
  SKILL_REMAKE_NOTES,
  SKILL_CATEGORIES,
  skillAuditTable,
  skillFamilies,
  skillTreeEntry,
  filterSkillTree,
  skillTreeCounts,
  prerequisiteChain,
  emblemUnlockFor,
  spendEmblemForSkill,
  skillTitle,
} from '../public/js/skill-tree.js?v=cf7bc81f';

const root = join(import.meta.dirname, '..', 'public');

before(async () => {
  await loadContentCatalogsFromDir(join(root, 'assets/content'));
});

describe('the full skill tree', () => {
  it('covers all 105 skills and Better Learning I to V, every family has an honest remake note', () => {
    const catalog = getSkillCatalog();
    assert.equal(Object.keys(catalog).length, 110);
    for (const family of skillFamilies()) {
      assert.ok(SKILL_REMAKE_NOTES[family.name], `missing note for ${family.name}`);
      assert.ok(SKILL_CATEGORIES[family.categoryId], `unknown category for ${family.name}`);
    }
    const table = skillAuditTable();
    assert.equal(table.length, 110);
    const counts = table.reduce((acc, row) => ({ ...acc, [row.status]: (acc[row.status] || 0) + 1 }), {});
    assert.ok(counts.live >= 70, JSON.stringify(counts));
  });

  it('titles ranks with roman numerals like the client', () => {
    assert.equal(skillTitle(getSkillCatalog().animalkinship_7), 'Animal Kinship VII');
    assert.equal(skillTitle(getSkillCatalog().botany_1), 'Botany');
  });

  it('builds prerequisite chains and status rows', () => {
    const chain = prerequisiteChain('metalwork_1');
    for (const id of ['tinkering_1', 'tinkering_2', 'tinkering_3', 'engineering_1', 'alchemy_2', 'elementhandling_1']) {
      assert.ok(chain.includes(id), id);
    }
    const state = createSkillState();
    const entry = skillTreeEntry(state, 'alchemy_2', { level: 10 });
    assert.equal(entry.status, 'locked');
    assert.deepEqual(entry.prerequisites.map((row) => row.kind), ['skill', 'skill', 'quest']);
    grantSkill(state, 'animalkinship_1', true);
    assert.equal(skillTreeEntry(state, 'animalkinship_1', {}).status, 'learned');
    assert.equal(skillTreeEntry(state, 'animalkinship_2', {}).status, 'available');
  });

  it('searches and filters by status and category', () => {
    const state = createSkillState();
    grantSkill(state, 'mining_1', true);
    const mining = filterSkillTree(state, { query: 'mining' }, { level: 99 });
    assert.ok(mining.groups.some((g) => g.families.some((f) => f.name === 'Mining')));
    const learned = filterSkillTree(state, { filter: 'learned' }, { level: 99 });
    assert.equal(learned.total, 1);
    const cooking = filterSkillTree(state, { category: 8 }, { level: 99 });
    assert.deepEqual(cooking.groups.map((g) => g.name), ['Cooking']);
    const counts = skillTreeCounts(state, { level: 99 });
    // 105 from inc_data_skills.js plus Better Learning I to V (G62).
    assert.equal(counts.all, 110);
    assert.equal(counts.learned + counts.available + counts.learning + counts.locked, 110);
  });

  it('spends a Giant emblem for its skill unlock badge', () => {
    assert.deepEqual(emblemUnlockFor('mining_3'), {
      achievement: 'emblem_skill_unlock_zille_1',
      giant: 'zille',
      emblem: 'emblem_zille',
    });
    const inv = { emblem_zille: 1 };
    const unlocked = [];
    assert.equal(spendEmblemForSkill({}, unlocked, 'mining_3').reason, 'no_emblem');
    const spent = spendEmblemForSkill(inv, unlocked, 'mining_3');
    assert.equal(spent.ok, true);
    assert.equal(inv.emblem_zille, undefined);
    assert.equal(spendEmblemForSkill({ emblem_zille: 1 }, ['emblem_skill_unlock_zille_1'], 'mining_3').reason, 'already_unlocked');
    assert.equal(emblemUnlockFor('mining_1'), null);
  });
});

describe('Skills panel wiring', () => {
  it('game.js renders the tree module and the stylesheet styles it', async () => {
    const { readFileSync } = await import('node:fs');
    const game = readFileSync(join(root, 'game.js'), 'utf8');
    const css = readFileSync(join(root, 'style.css'), 'utf8');
    assert.match(game, /renderSkillTreePanel\(\{/);
    assert.match(game, /spendEmblemForSkill\(inv, achieveState\.unlocked, classTsid\)/);
    assert.match(game, /bootParams\.has\('skilltree'\)/);
    for (const selector of ['.skill-tree-toolbar', '.skill-tree-chip.is-active', '.skill-pip.is-learned', '.skill-remake.is-later']) {
      assert.ok(css.includes(selector), selector);
    }
  });
});
