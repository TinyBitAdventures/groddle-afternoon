/**
 * Retired blocks in street projects (register row G15): Bricks and Grade A /
 * AAA Earth Blocks became Urth Blocks on 2012-03-26 (items/brick.js,
 * grade_a_earth_block.js, grade_aaa_earth_block.js onLoad replaceWith), so a
 * job row for one asks for Urth Blocks at the same rate; the Bureaucrat sells
 * the Card-Carrying Qualification (catalog_stores.js store 17, npc_bureaucrat.js
 * getItems). Run: node --test tests/retired-blocks.test.js
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInventory, countItem } from '../public/js/inventory.js?v=catalog-unified-3';
import { createToolConditionState, getToolCondition } from '../public/js/tools.js';
import { RECIPE_CATALOG, craftRecipe, loadRecipeCatalogFromFile } from '../public/js/making.js';
import { BUREAUCRACY_ITEMS, CARD_BADGE, buyDocument, clerkOffers } from '../public/js/bureaucracy.js';
import { phaseRequirements, normalizeStreetJobState, contributeItems } from '../public/js/street-jobs.js';
import { loadRetiredItems, retireRequirement } from '../tools/retired-items.mjs';
import { obtainableItems } from '../tools/job-obtainable.mjs';

const SPIKE = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const GSJS = process.env.GRODDLE_GSJS || '/Users/austin/Documents/glitch-audit/glitch-GameServerJS';
const catalog = JSON.parse(readFileSync(join(SPIKE, 'assets/content/street-jobs.json'), 'utf8'));
const RETIRED = ['brick', 'grade_a_earth_block', 'grade_aaa_earth_block'];

before(async () => {
  await loadRecipeCatalogFromFile(join(SPIKE, 'assets/content/recipes.json'));
});

describe('retired blocks (tools/retired-items.mjs)', () => {
  it('reads the replacement rate from each item file onLoad', async () => {
    const r = await loadRetiredItems(GSJS, [...RETIRED, 'grade_aa_earth_block', 'metal_rock', 'no_such_item']);
    assert.deepEqual(r.brick, { to: 'grade_aa_earth_block', per: 2, label: 'Bricks', toPlural: 'Urth Blocks', toBaseCost: 150 });
    assert.equal(r.grade_a_earth_block.per, 1);
    assert.equal(r.grade_aaa_earth_block.per, 1);
    assert.equal(r.grade_aaa_earth_block.to, 'grade_aa_earth_block');
    for (const id of ['grade_aa_earth_block', 'metal_rock', 'no_such_item']) assert.equal(r[id], null, id);
  });

  it('turns a Brick row into twice the Urth Blocks and keeps the source amount', async () => {
    const retired = await loadRetiredItems(GSJS, RETIRED);
    const row = { id: 'r353', type: 'item', classId: 'brick', num: 50, baseCost: 280, desc: 'Contribute Bricks - 50 needed!' };
    assert.deepEqual(retireRequirement(row, retired), {
      id: 'r353',
      type: 'item',
      classId: 'grade_aa_earth_block',
      num: 100,
      baseCost: 150,
      desc: 'Contribute Urth Blocks - 100 needed!',
      retired: { classId: 'brick', num: 50, baseCost: 280, per: 2 },
    });
    const work = { id: 'r1', type: 'work', classId: 'brick', num: 5 };
    assert.equal(retireRequirement(work, retired), work);
  });

  it('the catalog asks for Urth Blocks wherever GSJS asked for retired blocks', () => {
    const ph2 = catalog.classes.job_street_ph2_02;
    assert.ok(ph2, 'job_street_ph2_02 (Begin to Build) is playable');
    const brick = ph2.requirements.find((r) => r.retired?.classId === 'brick');
    assert.deepEqual([brick.classId, brick.num, brick.retired.num], ['grade_aa_earth_block', 100, 50]);
    const aaa = ph2.requirements.find((r) => r.retired?.classId === 'grade_aaa_earth_block');
    assert.equal(aaa.classId, 'grade_aa_earth_block');
    assert.equal(aaa.num, aaa.retired.num);
    for (const def of Object.values(catalog.classes)) {
      for (const r of def.requirements) assert.ok(!RETIRED.includes(r.classId), `${r.classId} still asked for`);
    }
    for (const row of Object.values(catalog.excluded)) {
      for (const id of [...RETIRED, 'card_carrying_qualification']) assert.ok(!row.reason.includes(id), `${row.reason}`);
    }
  });

  it('opens 229 more projects; only seed_grain (deleted in the source) still blocks one', () => {
    assert.equal(catalog.counts.playableJobs, 689);
    assert.equal(catalog.counts.excludedJobs['needs items the remake cannot make yet'], 1);
    const blocked = Object.entries(catalog.excluded).filter(([, r]) => r.reason.startsWith('needs items'));
    assert.deepEqual(blocked.map(([id, r]) => [id, r.reason]), [['166', 'needs items the remake cannot make yet: seed_grain']]);
    // Clam Calumny (Shimla Mirch) needed Bricks and Grade AAA Earth Blocks.
    assert.equal(catalog.jobs['176'].label, 'Clam Calumny');
    assert.ok(catalog.byStreet.GM11HIDASHO1THR.includes('176'));
  });

  it('a former Brick row takes Urth Blocks for real', () => {
    // Phase 2 of Build Clam Calumny is Begin to Build (job_street_ph2_02).
    const state = normalizeStreetJobState({ jobs: { 176: { phase: 1, startedAt: 1 } } });
    const reqs = phaseRequirements(state, catalog, '176');
    const urth = reqs.filter((r) => r.classId === 'grade_aa_earth_block');
    assert.ok(urth.some((r) => r.retired?.classId === 'brick'));
    const inv = { grade_aa_earth_block: 10 };
    const first = urth.find((r) => r.open);
    const res = contributeItems(state, catalog, '176', 'grade_aa_earth_block', first.need, inv, 10 ** 13);
    assert.equal(res.ok, true, res.msg);
    assert.equal(res.amount, first.need);
    assert.equal(res.baseCost, first.need * 150);
  });
});

describe('Urth Blocks from the Blockmaker (catalog_recipes.js 190)', () => {
  it('makes one from 5 Earth, 2 Loam, 1 Heavy Gas and 5 tank fuel with Blockmaking I', () => {
    const r = RECIPE_CATALOG.grade_aa_earth_block;
    assert.deepEqual([r.id, r.tool, r.skill, r.waitMs, r.fuel, r.xpReward, r.taskLimit], ['190', 'blockmaker', 'blockmaking_1', 15000, 5, 5, 10]);
    const tools = createToolConditionState({ condition: { blockmaker: { remaining: 50 } } });
    const inv = createInventory({ blockmaker: 1, earth: 5, loam: 2, heavy_gas: 1 });
    const pc = { energy: 100, imagination: 0, xp: 0 };
    assert.equal(craftRecipe(inv, pc, 'grade_aa_earth_block', { learned: [], toolState: tools }).ok, false);
    const made = craftRecipe(inv, pc, 'grade_aa_earth_block', { learned: ['blockmaking_1'], toolState: tools });
    assert.equal(made.ok, true, made.msgs?.[0]);
    assert.equal(countItem(inv, 'grade_aa_earth_block'), 1);
    for (const id of ['earth', 'loam', 'heavy_gas']) assert.equal(countItem(inv, id), 0, id);
    assert.equal(getToolCondition(tools, 'blockmaker').remaining, 45);
  });

  it('no Blockmaker recipe makes a retired block (189/191/193 are gone)', () => {
    for (const r of Object.values(RECIPE_CATALOG)) {
      for (const o of r.outputs || []) assert.ok(!RETIRED.includes(o.classTsid), `${r.id} makes ${o.classTsid}`);
    }
  });
});

describe('Card-Carrying Qualification from the Bureaucrat (store 17)', () => {
  it('sells the card for 50c to anyone without its badge, no Bureaucratic Arts needed', () => {
    assert.equal(BUREAUCRACY_ITEMS.card_carrying_qualification.cost, 50);
    const offers = clerkOffers([], []);
    const card = offers.find((o) => o.classTsid === 'card_carrying_qualification');
    assert.deepEqual([card.ok, card.cost], [true, 50]);
    assert.equal(offers.find((o) => o.classTsid === 'your_papers').ok, false);
    const pc = { currants: 120 };
    const inv = createInventory({});
    assert.equal(buyDocument(pc, inv, 'card_carrying_qualification', [], []).ok, true);
    assert.equal(buyDocument(pc, inv, 'card_carrying_qualification', [], []).ok, true);
    assert.equal(countItem(inv, 'card_carrying_qualification'), 2);
    assert.equal(pc.currants, 20);
  });

  it('drops the card from the menu once you hold the badge', () => {
    const offers = clerkOffers(['bureaucraticarts_1', 'bureaucraticarts_2'], [CARD_BADGE]);
    assert.deepEqual(offers.map((o) => o.classTsid), ['your_papers', 'general_building_permit']);
    assert.ok(offers.every((o) => o.ok));
    assert.equal(buyDocument({ currants: 500 }, createInventory({}), 'card_carrying_qualification', [], [CARD_BADGE]).reason, 'unknown');
  });

  it('counts as obtainable for street projects', async () => {
    const { items, sources } = await obtainableItems();
    assert.ok(items.has('card_carrying_qualification'));
    assert.equal(sources.card_carrying_qualification, 'vendor:bureaucracy');
    for (const id of RETIRED) assert.ok(!items.has(id), `${id} stays retired`);
    assert.ok(!items.has('seed_grain'));
  });
});
