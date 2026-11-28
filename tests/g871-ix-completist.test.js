/**
 * #408 (G871, Austin 2026-11-16): Ix Completist needs every Ix street, as Brillah
 * Completist does (G128). Tiny Speck's achievements/ix_completist.js:17-22 asks for 7
 * though its text says every location; the remake raises it to the 9 Ix streets, keeps
 * the badge for saves that already have it, and tops progress up on load.
 * Run: node --test tests/g871-ix-completist.test.js
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAchievementState, applyAchievementProgress, getAchievementProgress, unlockAchievement } from '../public/js/achievements.js?v=4af6091c';
import { loadContentCatalogsFromDir, getAchievementCatalog } from '../public/js/content-catalogs.js?v=b6a173ae';
import { applyStreetVisit, availableHubStreets, hubMapStreetCount, topUpCompletists } from '../public/js/exploration.js?v=8f19e25d';
import { ACHIEVEMENT_CONDITION_OVERRIDES, applyAchievementOverrides, withAchievementOverrides } from '../tools/achievement-overrides.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const publicRoot = join(root, 'public');
const index = JSON.parse(readFileSync(join(publicRoot, 'assets/streets/index.json'), 'utf8')).streets;
const gsjs = join(root, '../glitch-GameServerJS');

before(async () => {
  await loadContentCatalogsFromDir(join(publicRoot, 'assets/content'));
});

const ix = () => availableHubStreets('27', index);
const walk = (state, streets) => streets.flatMap((tsid) => applyStreetVisit({ state, tsid, hubId: '27', indexStreets: index, apply: (c, n) => applyAchievementProgress(state, c, n) }));
const topUp = (state) => topUpCompletists({ state, catalog: getAchievementCatalog(), indexStreets: index, unlock: (id) => unlockAchievement(state, id, null) });

describe('#408 Ix Completist: every Ix street', () => {
  it('Ix has 9 streets; the map\'s tenth is a test street the remake never had', () => {
    assert.equal(ix().length, 9);
    assert.equal(hubMapStreetCount('27'), 10);
    assert.equal(index.GM413CQ4TLUUS, undefined, 'GM413CQ4TLUUS, "cal test 5" in inc_data_maps_prod.js');
  });

  it('achievements.json asks for all 9, same condition id and counter, through the cited override table', () => {
    const def = getAchievementCatalog().ix_completist;
    assert.deepEqual(def.conditions.map(({ id, type, group, name, num }) => ({ id, type, group, name, num })), [
      { id: '592', type: 'counter', group: 'streets_visited_in_hub', name: 'number_27', num: ix().length },
    ]);
    assert.match(ACHIEVEMENT_CONDITION_OVERRIDES.ix_completist.source, /#408/);
    execFileSync(process.execPath, [join(root, 'tools/achievement-overrides.mjs'), '--check'], { stdio: 'pipe' });
  });

  it('replaces only Tiny Speck\'s 7: a source that changes is kept, and Brillah\'s rule is unchanged', () => {
    const ts = [{ id: '592', type: 'counter', group: 'streets_visited_in_hub', name: 'number_27', num: 7 }];
    assert.equal(withAchievementOverrides([{ id: 'ix_completist', conditions: ts }])[0].conditions[0].num, 9);
    assert.equal(withAchievementOverrides([{ id: 'ix_completist', conditions: [{ ...ts[0], num: 8 }] }])[0].conditions[0].num, 8);
    const cat = { ix_completist: { conditions: ts.map((c) => ({ ...c })) } };
    applyAchievementOverrides(cat);
    applyAchievementOverrides(cat);
    assert.equal(cat.ix_completist.conditions[0].num, 9, 'applied once, then left');
    const [kept] = withAchievementOverrides([{ id: 'brillah_completist', conditions: [{ id: '1', type: 'counter', group: 'x', name: 'y', num: 1 }] }]);
    assert.equal(kept.conditions[0].group, 'x');
  });

  it('the source asks for 7', { skip: !existsSync(gsjs) && 'no GSJS checkout' }, () => {
    const src = readFileSync(join(gsjs, 'achievements/ix_completist.js'), 'utf8');
    assert.match(src, /group\s*: "streets_visited_in_hub",\s*label\s*: "number_27",\s*value\s*: "7"/);
  });

  it('7 streets is no longer enough; all 9 earn it, and the panel shows x / 9', () => {
    const state = createAchievementState();
    walk(state, ix().slice(0, 7));
    assert.equal(state.unlocked.includes('ix_completist'), false);
    const p = getAchievementProgress(state, 'ix_completist');
    assert.equal(`${p.conditions[0].current} / ${p.conditions[0].num}`, '7 / 9');
    const updates = walk(state, ix().slice(7));
    assert.ok(state.unlocked.includes('ix_completist'));
    assert.ok(updates.some((u) => u.classTsid === 'ix_completist' && u.unlocked));
  });

  it('a save that earned it at 7 keeps it; the load top-up never takes it back', () => {
    const state = createAchievementState();
    const saved = getAchievementCatalog().ix_completist.conditions;
    getAchievementCatalog().ix_completist.conditions = saved.map((c) => ({ ...c, num: 7 }));
    try {
      walk(state, ix().slice(0, 7));
    } finally {
      getAchievementCatalog().ix_completist.conditions = saved;
    }
    assert.ok(state.unlocked.includes('ix_completist'), 'earned under the old rule');
    topUp(state);
    assert.ok(state.unlocked.includes('ix_completist'), 'kept');
    assert.deepEqual(topUp(state).filter((u) => u.classTsid === 'ix_completist' && u.unlocked), [], 'not awarded twice');
  });

  it('a save that walked all 9 without the badge gets it on load', () => {
    const state = createAchievementState();
    state.groups.streets_visited_in_hub_27 = ix();
    const row = topUp(state).find((u) => u.classTsid === 'ix_completist');
    assert.ok(row?.unlocked);
    assert.ok(state.unlocked.includes('ix_completist'));
  });
});
