/**
 * #441 (G914, Austin 2026-11-17): every hub Completist needs every street of its hub,
 * as Ix (G871) and Brillah (G128) do. "Every street" is exploration.js
 * availableHubStreets: on the hub's street list, loadable, and counting by
 * location.js:2756-2770 countsTowardHubAchievement (no subway station, machine room or
 * start street). Badges already earned stay.
 * Run: node --test tests/g914-hub-completists.test.js
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAchievementState, applyAchievementProgress, unlockAchievement } from '../public/js/achievements.js?v=7a3a0e92';
import { loadContentCatalogsFromDir, getAchievementCatalog } from '../public/js/content-catalogs.js?v=b2a9a862';
import {
  GREETING_LOCATIONS, TRANSIT_STATIONS, applyStreetVisit, availableHubStreets, countsTowardHub, streetVisitCounters, topUpCompletists,
} from '../public/js/exploration.js?v=8f19e25d';
import { ACHIEVEMENT_CONDITION_OVERRIDES, withAchievementOverrides } from '../tools/achievement-overrides.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const publicRoot = join(root, 'public');
const index = JSON.parse(readFileSync(join(publicRoot, 'assets/streets/index.json'), 'utf8')).streets;
const gsjs = join(root, '../glitch-GameServerJS');

before(async () => {
  await loadContentCatalogsFromDir(join(publicRoot, 'assets/content'));
});

const hubCondition = (def) => (def.conditions || []).find((c) => c.group === 'streets_visited_in_hub' && /^number_\d+$/.test(c.name));
const walk = (state, hub, streets) => streets.flatMap((tsid) => applyStreetVisit({ state, tsid, hubId: hub, indexStreets: index, apply: (c, n) => applyAchievementProgress(state, c, n) }));
const topUp = (state) => topUpCompletists({ state, catalog: getAchievementCatalog(), indexStreets: index, unlock: (id) => unlockAchievement(state, id, null) });

const RAISED = {
  aranna_completist: ['101', 26, 28], besara_completist: ['98', 32, 34], bortola_completist: ['75', 35, 37],
  groddle_forest_completist: ['56', 41, 42], groddle_meadows_completist: ['58', 40, 43], muufo_completist: ['97', 32, 35],
  rasana_completist: ['109', 37, 38], tamila_completist: ['92', 31, 33], uralia_completist: ['51', 4, 6],
};

describe('#441 hub Completists: every street', () => {
  it('every hub Completist asks for exactly the streets the remake counts in its hub', () => {
    const cat = getAchievementCatalog();
    let n = 0;
    for (const [id, def] of Object.entries(cat)) {
      const c = hubCondition(def);
      if (!c) continue;
      const hub = c.name.slice('number_'.length);
      const streets = availableHubStreets(hub, index);
      if (hub === '40') { assert.equal(c.num, 7, 'Naraka: js/hell.js counts its seven streets (the Hell Bar is a room off its map)'); continue; }
      assert.equal(c.num, streets.length, `${id}: asks ${c.num}, hub ${hub} has ${streets.length}`);
      n++;
    }
    assert.ok(n > 40, String(n));
    execFileSync(process.execPath, [join(root, 'tools/achievement-overrides.mjs'), '--check'], { stdio: 'pipe' });
  });

  it('the raised badges keep their condition id and counter, from the cited table', () => {
    const cat = getAchievementCatalog();
    for (const [id, [hub, was, now]] of Object.entries(RAISED)) {
      const c = hubCondition(cat[id]);
      assert.equal(c.name, `number_${hub}`, id);
      assert.equal(c.num, now, id);
      const row = ACHIEVEMENT_CONDITION_OVERRIDES[id];
      assert.equal(row.conditions[0].id, c.id, `${id} condition id kept`);
      assert.equal(row.replaces[0].num, was, id);
      assert.match(row.source, /#441/);
      // A source that changes is noticed, not overwritten.
      const changed = withAchievementOverrides([{ id, conditions: [{ id: c.id, type: 'counter', group: 'streets_visited_in_hub', name: c.name, num: was + 100 }] }]);
      assert.equal(changed[0].conditions[0].num, was + 100, id);
    }
  });

  it('Tiny Speck\'s files ask for the old counts', { skip: !existsSync(gsjs) && 'no GSJS checkout' }, () => {
    for (const [id, [hub, was]] of Object.entries(RAISED)) {
      const src = readFileSync(join(gsjs, `achievements/${id}.js`), 'utf8');
      assert.match(src, new RegExp(`label\\s*: "number_${hub}",\\s*value\\s*: "${was}"`), id);
    }
  });

  it('start streets and subway stations never count toward a hub (location.js:2759, 2769)', { skip: !existsSync(gsjs) && 'no GSJS checkout' }, () => {
    const cfg = readFileSync(join(gsjs, 'config_prod.js'), 'utf8');
    const greet = cfg.slice(cfg.indexOf('var greeting_locations'), cfg.indexOf('];', cfg.indexOf('var greeting_locations')));
    const live = [...greet.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/tsid:\s*'L([A-Z0-9]+)'/g)].map((m) => `G${m[1]}`);
    assert.deepEqual([...GREETING_LOCATIONS].sort(), live.sort());
    assert.equal(TRANSIT_STATIONS.size, 12);
    assert.equal(countsTowardHub('GA9S5T1LA0D27NG', '75'), false, 'Bortola Start');
    assert.equal(countsTowardHub('GHV2CQPL1E32QM8', '75'), false, 'Mallos Means Subway Station');
    const visit = streetVisitCounters({ tsid: 'GHV2CQPL1E32QM8', hubId: '75', indexStreets: index });
    assert.deepEqual(visit.map((v) => v.counter), ['locations_visited:GHV2CQPL1E32QM8', 'hubs_visited:75'], 'still a location visited');
  });

  it('Uralia\'s badge text follows its count: six streets, not four (Austin 2026-11-17)', () => {
    const text = getAchievementCatalog().uralia_completist.statusText;
    assert.match(text, /roamed six streets/);
    assert.doesNotMatch(text, /four streets/);
    assert.equal(availableHubStreets('51', index).length, 6);
  });

  it('Groddle Meadow: 40 is no longer enough, all 43 earn it', () => {
    const streets = availableHubStreets('58', index);
    assert.equal(streets.length, 43);
    const state = createAchievementState();
    walk(state, '58', streets.slice(0, 42));
    assert.equal(state.unlocked.includes('groddle_meadows_completist'), false);
    walk(state, '58', [...TRANSIT_STATIONS].filter((t) => index[t]?.hubId === '58'));
    assert.equal(state.unlocked.includes('groddle_meadows_completist'), false, 'the station does not stand in for a street');
    const updates = walk(state, '58', streets.slice(42));
    assert.ok(state.unlocked.includes('groddle_meadows_completist'));
    assert.ok(updates.some((u) => u.classTsid === 'groddle_meadows_completist' && u.unlocked));
  });

  it('a badge earned under the old count stays; a save that walked every street gets it on load', () => {
    const state = createAchievementState();
    const def = getAchievementCatalog().bortola_completist;
    const saved = def.conditions;
    def.conditions = saved.map((c) => ({ ...c, num: 35 }));
    try {
      walk(state, '75', availableHubStreets('75', index).slice(0, 35));
    } finally {
      def.conditions = saved;
    }
    assert.ok(state.unlocked.includes('bortola_completist'));
    topUp(state);
    assert.ok(state.unlocked.includes('bortola_completist'), 'kept');

    const fresh = createAchievementState();
    fresh.groups.streets_visited_in_hub_92 = availableHubStreets('92', index);
    const row = topUp(fresh).find((u) => u.classTsid === 'tamila_completist');
    assert.ok(row?.unlocked);
  });
});
