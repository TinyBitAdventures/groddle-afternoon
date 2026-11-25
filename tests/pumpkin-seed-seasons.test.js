/**
 * Pumpkin Seeds' seasons (Austin's ruling 2026-11-22, a live report on Pot Luck Day: bought from
 * the Gardening vendor, they would not plant in a herb or crop bed). Glitch: seed_pumpkin.js sold
 * all year, planted only during Zilloween (common.js isZilloween), and offered Lament out of season
 * (verbs.lament). The ruling adds Pot Luck Day (G982) to the seasons they plant in, and out of
 * season the Plant menu shows them greyed with the reason instead of hiding them.
 * One source: js/garden.js SEASONAL_SEEDS (a list of seasons per seed), read by planting, the Plant
 * menu, a seed dropped on a plot, Lament and the season cards.
 * Run: node --test tests/pumpkin-seed-seasons.test.js
 */
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SEASONAL_SEEDS,
  chosenSeedRefusal,
  createGarden,
  listPlantableSeeds,
  plantPlot,
  plantSeedChoices,
  seedDropCheck,
  seedInSeason,
  seedSeasonLine,
  setSeasonalSeedCheck,
} from '../public/js/garden.js?v=9c4cc027';
import { getVerbsFor } from '../public/content.js?v=ceaea1fe';
import { activeSeasons, parseSeasonDate } from '../public/js/seasons.js?v=5d8f545a';
import { seasonsFeature } from '../public/js/features/seasons-feature.js?v=8f120747';
import { createInventory, addItem } from '../public/js/inventory.js?v=6414dbdc';

const LINE = 'Pumpkins grow only during Zilloween and Pot Luck Day.';
const POT_LUCK = '2026-11-22';
const ZILLOWEEN = '2026-10-20';
const SUMMER = '2026-07-04';

/** The season test seasons-feature installs, for a calendar date (no Dametime Zilloween). */
function onDate(date) {
  const { ids } = activeSeasons(parseSeasonDate(date), { dametime: null });
  setSeasonalSeedCheck((seedId, seasonId) => ids.includes(seasonId));
  return ids;
}

function plotTarget(gardenType = 'default') {
  const garden = createGarden({ cols: 2, rows: 1, gardenType });
  return { garden, target: { classId: 'garden_plot', label: 'Plot 1-1', state: { garden, plotKey: '1-1', plot: garden.plots['1-1'], gardenEntity: {} } } };
}
const PC = () => ({ energy: 500, mood: 50, imaginationUpgrades: [] });
const plantVerb = (t, inv) => getVerbsFor(t, { inv, pc: PC() }).find((v) => v.id === 'plant');

afterEach(() => setSeasonalSeedCheck(null));

describe('Pumpkin Seeds plant during Zilloween and Pot Luck Day (Austin 2026-11-22)', () => {
  it('one list of seasons per seed is the source', () => {
    assert.deepEqual([...SEASONAL_SEEDS.seed_pumpkin], ['zilloween', 'pot_luck_day']);
    assert.equal(seedSeasonLine('seed_pumpkin'), LINE);
    assert.equal(seedSeasonLine('seed_spinach'), '');
    assert.doesNotMatch(LINE, /—/);
  });

  for (const [name, date, season] of [['Pot Luck Day', POT_LUCK, 'pot_luck_day'], ['Zilloween', ZILLOWEEN, 'zilloween']]) {
    it(`plants on a ${name} date, in a crop bed and in an herb bed`, () => {
      assert.ok(onDate(date).includes(season));
      assert.equal(seedInSeason('seed_pumpkin'), true);
      for (const bed of ['default', 'herb']) {
        const { garden } = plotTarget(bed);
        const inv = { seed_pumpkin: 2, seed_spinach: 1 };
        const r = plantPlot(garden, '1-1', inv, PC(), 'seed_pumpkin', { exactSeed: true });
        assert.equal(r.ok, true, `${bed}: ${r.msgs?.join(' ')}`);
        assert.equal(garden.plots['1-1'].seed, 'seed_pumpkin');
      }
      assert.equal(chosenSeedRefusal({ seed_pumpkin: 1 }, 'seed_pumpkin', 'herb'), null);
      assert.equal(seedDropCheck({ state: 'clean' }, 'seed_pumpkin', 'default').ok, true);
      assert.equal(plantSeedChoices({ seed_pumpkin: 1, seed_spinach: 1 }).find((c) => c.classTsid === 'seed_pumpkin').disabled, undefined);
    });
  }

  it('another date: refused with the new reason, by name, by drop, and as the only seed', () => {
    assert.deepEqual(onDate(SUMMER), []);
    assert.equal(seedInSeason('seed_pumpkin'), false);
    assert.deepEqual(chosenSeedRefusal({ seed_pumpkin: 1 }, 'seed_pumpkin', 'default'), { reason: 'season', msg: LINE });
    const { garden } = plotTarget();
    const named = plantPlot(garden, '1-1', { seed_pumpkin: 1, seed_spinach: 1 }, PC(), 'seed_pumpkin', { exactSeed: true });
    assert.deepEqual([named.ok, named.reason, named.msgs], [false, 'season', [LINE]]);
    const only = plantPlot(garden, '1-1', { seed_pumpkin: 1 }, PC());
    assert.deepEqual([only.ok, only.reason, only.msgs], [false, 'season', [LINE]]);
    assert.deepEqual(seedDropCheck({ state: 'clean' }, 'seed_pumpkin', 'herb'), { ok: false, tip: LINE });
    assert.equal(garden.plots['1-1'].state, 'clean');
    // Spinach still plants beside them.
    assert.equal(plantPlot(garden, '1-1', { seed_pumpkin: 1, seed_spinach: 1 }, PC()).ok, true);
  });

  it('out of season the Plant menu lists them greyed with the reason, not hidden', () => {
    onDate(SUMMER);
    const inv = { seed_pumpkin: 3, seed_spinach: 2 };
    assert.deepEqual(plantSeedChoices(inv, 'default'), [
      { classTsid: 'seed_pumpkin', label: 'Pumpkin Seed', have: 3, disabled: true, reason: LINE },
      { classTsid: 'seed_spinach', label: 'Spinach Seed', have: 2 },
    ]);
    assert.deepEqual(plantSeedChoices(inv, 'herb').map((c) => [c.classTsid, c.disabled]), [['seed_pumpkin', true]]);
    // Not plantable, so automatic planting and master gardens skip them.
    assert.deepEqual(listPlantableSeeds(inv, 'default').map((s) => s.seedId), ['seed_spinach']);
    // The Plant row opens the seed choice so the greyed seed shows...
    const both = plantVerb(plotTarget().target, inv);
    assert.equal(both.enabled, true);
    assert.equal(both.picker, 'plant');
    // ...and with only Pumpkin Seeds the row itself is greyed with the reason (was "Need crop seeds").
    const alone = plantVerb(plotTarget('herb').target, { seed_pumpkin: 3 });
    assert.deepEqual([alone.enabled, alone.reason, alone.picker], [false, LINE, undefined]);
    // In season they are a plain choice again.
    onDate(POT_LUCK);
    assert.equal(plantVerb(plotTarget('herb').target, { seed_pumpkin: 3 }).enabled, true);
  });
});

describe('Lament (seed_pumpkin.js verbs.lament) only while the seeds will not plant', () => {
  function engineFor(season) {
    const inv = createInventory();
    addItem(inv, 'seed_pumpkin', 2);
    return {
      pc: { energy: 50, mood: 50, xp: 0 },
      inv,
      started: false,
      param: (k) => (k === 'season' ? season : null),
      toast: () => {},
      pushActivity: () => {},
      updateHud: () => {},
      save: () => {},
      setData: () => {},
      grant: () => 0,
    };
  }
  const laments = (engine) => seasonsFeature.packVerbs('seed_pumpkin', engine).some((r) => r.id === 'lament');

  for (const season of ['zilloween', 'pot_luck_day']) {
    it(`not offered during ${season}`, () => {
      seasonsFeature._reset();
      const engine = engineFor(season);
      seasonsFeature.init(engine);
      assert.equal(seedInSeason('seed_pumpkin'), true);
      assert.equal(laments(engine), false);
    });
  }

  it('offered out of season', () => {
    seasonsFeature._reset();
    const engine = engineFor('none');
    seasonsFeature.init(engine);
    assert.equal(seedInSeason('seed_pumpkin'), false);
    assert.equal(laments(engine), true);
  });
});
