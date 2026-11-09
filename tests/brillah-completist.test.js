/**
 * #154: Brillah Completist can be earned (Eleven Giants' rule), and saves that
 * walked Brillah before the condition existed get it on load.
 * Run: node --test tests/brillah-completist.test.js
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createAchievementState,
  applyAchievementProgress,
  getAchievementProgress,
  unlockAchievement,
} from '../public/js/achievements.js?v=2e4aa9cb';
import { loadContentCatalogsFromDir, getAchievementCatalog } from '../public/js/content-catalogs.js?v=10b118dd';
import { applyStreetVisit, availableHubStreets, topUpCompletists } from '../public/js/exploration.js?v=68f27989';
import { ACHIEVEMENT_CONDITION_OVERRIDES, withAchievementOverrides } from '../tools/achievement-overrides.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const publicRoot = join(root, 'public');
const index = JSON.parse(readFileSync(join(publicRoot, 'assets/streets/index.json'), 'utf8')).streets;
const gsjs = join(root, '../glitch-GameServerJS');
const eleven = join(root, '../eleven-gsjs');
const game = readFileSync(join(publicRoot, 'game.js'), 'utf8');

before(async () => {
  await loadContentCatalogsFromDir(join(publicRoot, 'assets/content'));
});

const brillah = () => availableHubStreets('112', index);

/** A save from before the fix: the streets were walked while the badge had no conditions. */
function oldSave() {
  const state = createAchievementState();
  const saved = getAchievementCatalog().brillah_completist.conditions;
  getAchievementCatalog().brillah_completist.conditions = [];
  try {
    for (const tsid of brillah()) {
      applyStreetVisit({ state, tsid, hubId: '112', indexStreets: index, apply: (c, n) => applyAchievementProgress(state, c, n) });
    }
  } finally {
    getAchievementCatalog().brillah_completist.conditions = saved;
  }
  return state;
}

const topUp = (state) => topUpCompletists({
  state,
  catalog: getAchievementCatalog(),
  indexStreets: index,
  unlock: (id) => unlockAchievement(state, id, null),
});

describe('#154 Brillah Completist', () => {
  it('has Eleven Giants\' condition in achievements.json, through the cited override table', () => {
    const def = getAchievementCatalog().brillah_completist;
    assert.deepEqual(def.conditions.map(({ type, group, name, num }) => ({ type, group, name, num })), [
      { type: 'counter', group: 'streets_visited_in_hub', name: 'number_112', num: 27 },
    ]);
    assert.equal(ACHIEVEMENT_CONDITION_OVERRIDES.brillah_completist.source, 'eleven-gsjs/achievements/brillah_completist.js:18-23');
    execFileSync(process.execPath, [join(root, 'tools/achievement-overrides.mjs'), '--check'], { stdio: 'pipe' });
  });

  it('the inventory judges it with the override, only while the GSJS file has none', () => {
    const [row] = withAchievementOverrides([{ id: 'brillah_completist', conditions: [] }]);
    assert.equal(row.conditions[0].name, 'number_112');
    const [kept] = withAchievementOverrides([{ id: 'brillah_completist', conditions: [{ id: '1', type: 'counter', group: 'x', name: 'y', num: 1 }] }]);
    assert.equal(kept.conditions[0].group, 'x');
    assert.match(readFileSync(join(root, 'tools/inventory/build.mjs'), 'utf8'), /withAchievementOverrides\(G\.readAchievements\(gsjs\)\)/);
  });

  it('the sources: Tiny Speck left it empty, Eleven Giants wired it', { skip: (!existsSync(gsjs) || !existsSync(eleven)) && 'no GSJS checkouts' }, () => {
    const ts = readFileSync(join(gsjs, 'achievements/brillah_completist.js'), 'utf8');
    assert.match(ts, /var conditions = \{\s*\};/);
    const eg = readFileSync(join(eleven, 'achievements/brillah_completist.js'), 'utf8');
    assert.match(eg, /group\s*: "streets_visited_in_hub",\s*label\s*: "number_112",\s*value\s*: "27"/);
  });

  it('Brillah keeps all 27 streets of its map', () => {
    assert.equal(brillah().length, 27);
  });

  it('is earned by walking Brillah, and the panel shows x / 27', () => {
    const state = createAchievementState();
    const updates = [];
    for (const tsid of brillah().slice(0, 5)) {
      updates.push(...applyStreetVisit({ state, tsid, hubId: '112', indexStreets: index, apply: (c, n) => applyAchievementProgress(state, c, n) }));
    }
    const p = getAchievementProgress(state, 'brillah_completist');
    assert.equal(`${p.conditions[0].current} / ${p.conditions[0].num}`, '5 / 27');
    for (const tsid of brillah().slice(5)) {
      updates.push(...applyStreetVisit({ state, tsid, hubId: '112', indexStreets: index, apply: (c, n) => applyAchievementProgress(state, c, n) }));
    }
    assert.ok(state.unlocked.includes('brillah_completist'));
    assert.ok(updates.some((u) => u.classTsid === 'brillah_completist' && u.unlocked));
  });

  it('a save that walked all 27 before the fix gets it on load, once', () => {
    const state = oldSave();
    assert.equal(state.unlocked.includes('brillah_completist'), false);
    assert.equal(state.groups.streets_visited_in_hub_112.length, 27);
    const updates = topUp(state);
    const row = updates.find((u) => u.classTsid === 'brillah_completist');
    assert.ok(row?.unlocked, 'awarded');
    assert.equal(row.rewards?.xp, 150);
    assert.ok(state.unlocked.includes('brillah_completist'));
    assert.deepEqual(topUp(state).filter((u) => u.classTsid === 'brillah_completist'), []);
  });

  it('a part-walked old save gets its progress, not the badge', () => {
    const state = oldSave();
    state.groups.streets_visited_in_hub_112 = state.groups.streets_visited_in_hub_112.slice(0, 9);
    const updates = topUp(state);
    assert.equal(updates.find((u) => u.classTsid === 'brillah_completist')?.unlocked, false);
    assert.equal(getAchievementProgress(state, 'brillah_completist').conditions[0].current, 9);
  });

  it('covers every hub Completist, never lowers progress, and leaves Naraka to hell.js', () => {
    const state = createAchievementState();
    state.groups = { streets_visited_in_hub_56: ['not-a-street', ...availableHubStreets('56', index).slice(0, 3)], streets_visited_in_hub_40: ['GHH101'] };
    state.progress.groddle_forest_completist = { progress: { number_56: 2 } };
    topUp(state);
    assert.equal(state.progress.groddle_forest_completist.progress.number_56, 3);
    state.progress.groddle_forest_completist.progress.number_56 = 10;
    topUp(state);
    assert.equal(state.progress.groddle_forest_completist.progress.number_56, 10);
    assert.equal(state.progress.naraka_completist, undefined);
    // Haraiva's is a group_count over the street list.
    state.groups.streets_visited_in_hub_116 = availableHubStreets('116', index).slice(0, 4);
    topUp(state);
    assert.equal(state.progress.haraiva_completist.progress[getAchievementCatalog().haraiva_completist.conditions[0].name], 4);
  });

  it('game.js tops Completists up on load and announces what it awards', () => {
    const fn = game.slice(game.indexOf('function backfillStreetVisits'), game.indexOf('function emitGameEvent'));
    assert.match(fn, /topUpCompletists\(\{/);
    assert.match(fn, /unlock: \(id\) => unlockAchievement\(achieveState, id, pc\)/);
    assert.match(fn, /announceAchievementUpdates\(updates\)/);
  });
});
