/**
 * G403: Guano on a garden plot by hand. include/garden.js 609-669, GardenPlotView.as 152-222,
 * GardenView.as onPlotClick 521-528, GardenManager.as 36-37, and the same act by a key-holder
 * through the site (src/HomeTending.php).
 * Run: node --test tests/garden-guano.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { HAS_SITE, SITE_DIR } from '../tools/repos.mjs';
import { GARDEN_SPEEDUP,
  FERTILIZE_TEXT,
  GARDEN_FERTILIZE_MS,
  GARDEN_WATER_MS,
  SEED_CATALOG,
  createGarden,
  fertilizeCheck,
  fertilizePlot,
  harvestPlot,
  plantPlot,
  plotWaterFraction,
  tickGarden,
  gardenActionProfile,
  gardenTalkbackKey,
} from '../public/js/garden.js?v=1420a6d6';
import { getVerbsFor, runVerb } from '../public/content.js?v=a5d648fd';
import { actionDurationFor, actionLabelFor } from '../public/js/action-timing.js?v=5db4e91b';
import { gardenPlotEvents } from '../public/js/quest-offers.js?v=89511e1e';
import { applyTendAct, normalizeTendActs, plotsSnapshot, tendAct, tendedText } from '../public/js/neighbours-mp.js?v=e141e898';
import { guanoOver, plotHit } from '../public/js/features/garden-guano-feature.js?v=45d52804';

const NOW = 1_000_000_000;

function bed(state = 'seeds', extra = {}) {
  const garden = createGarden({ cols: 2, rows: 1, now: NOW });
  Object.assign(garden.plots['1-1'], { state, seed: state === 'clean' ? null : 'seed_spinach', wet: true, wetAt: NOW, stageStartedAt: NOW, growthMs: 0, growModifier: 1, pace: GARDEN_SPEEDUP, wetPace: GARDEN_SPEEDUP }, extra);
  return { garden, plot: garden.plots['1-1'] };
}

describe('G403 the plot takes Guano', () => {
  it('needs seeds or shoots, no fertilizer yet, and 80% of the watering left', () => {
    assert.deepEqual(fertilizeCheck(bed('seeds').plot, NOW), { ok: true, tip: FERTILIZE_TEXT.tipOk });
    assert.deepEqual(fertilizeCheck(bed('shoots').plot, NOW), { ok: true, tip: FERTILIZE_TEXT.tipOk });
    assert.equal(fertilizeCheck(bed('crop').plot, NOW).tip, FERTILIZE_TEXT.tipNo);
    assert.equal(fertilizeCheck(bed('clean').plot, NOW).tip, FERTILIZE_TEXT.tipNo);
    assert.equal(fertilizeCheck(bed('shoots', { fertilized: true }).plot, NOW).tip, FERTILIZE_TEXT.tipFull);
    // Exactly 80% is enough; less is not (plot.water_time >= max_water_time * 0.8).
    const edge = NOW + GARDEN_WATER_MS * 0.2;
    assert.equal(fertilizeCheck(bed().plot, edge).ok, true);
    assert.equal(plotWaterFraction(bed().plot, edge), 0.8);
    assert.equal(fertilizeCheck(bed().plot, edge + 1).tip, FERTILIZE_TEXT.tipMore);
    assert.equal(fertilizeCheck(bed('seeds', { wet: false, wetAt: null }).plot, NOW).tip, FERTILIZE_TEXT.tipDry);
  });

  it('seeds jump to shoots and are not marked, and one Guano is spent', () => {
    const { garden, plot } = bed('seeds');
    const inv = { guano: 2 };
    const r = fertilizePlot(garden, '1-1', inv, { now: NOW + 1000 });
    assert.equal(r.ok, true);
    assert.deepEqual(r.msgs, ['You fertilized a plot.']);
    assert.equal(inv.guano, 1);
    assert.equal(plot.state, 'shoots');
    assert.equal(plot.stageStartedAt, NOW + 1000);
    assert.equal(plot.fertilized, undefined);
    assert.equal(garden.plots['2-1'].state, 'clean', 'the rest of the bed is left alone');
    // include/garden.js 625-629 sets no mark on seeds, so the shoots can take their own.
    assert.equal(fertilizePlot(garden, '1-1', inv, { now: NOW + 1000 }).ok, true);
    assert.equal(plot.fertilized, true);
    assert.equal(inv.guano ?? 0, 0);
  });

  it('shoots keep a tenth of what is left of the second grow', () => {
    const seed = SEED_CATALOG.seed_potato;
    const { garden, plot } = bed('shoots', { seed: 'seed_potato' });
    const spent = 4000;
    const left = seed.grow2Ms - spent;
    assert.equal(fertilizePlot(garden, '1-1', { guano: 1 }, { now: NOW + spent }).ok, true);
    assert.equal(plot.fertilized, true);
    assert.deepEqual(tickGarden(garden, NOW + spent + 0.1 * left - 1), []);
    assert.equal(plot.state, 'shoots');
    assert.deepEqual(tickGarden(garden, NOW + spent + 0.1 * left), ['1-1']);
    assert.equal(plot.state, 'crop');
  });

  it('refuses without Guano, and on a plot that cannot take it spends none', () => {
    const { garden } = bed('seeds');
    const empty = {};
    assert.deepEqual(fertilizePlot(garden, '1-1', empty, { now: NOW }).msgs, ["Oops. You don't have any guano!"]);
    const inv = { guano: 1 };
    const full = bed('shoots', { fertilized: true });
    assert.deepEqual(fertilizePlot(full.garden, '1-1', inv, { now: NOW }).msgs, ['Oops. There is nothing there to fertilize.']);
    const crop = bed('crop');
    assert.deepEqual(fertilizePlot(crop.garden, '1-1', inv, { now: NOW }).msgs, ['Oops. There is nothing there to fertilize.']);
    const dryish = bed('seeds');
    assert.equal(fertilizePlot(dryish.garden, '1-1', inv, { now: NOW + GARDEN_WATER_MS * 0.5 }).ok, false);
    assert.equal(inv.guano, 1);
  });

  it('picking ends the mark, so the next crop can take Guano (include/garden.js 553)', () => {
    const { garden, plot } = bed('crop', { fertilized: true });
    const r = harvestPlot(garden, '1-1', {}, { energy: 100 }, { now: NOW, maxLuck: true });
    assert.equal(r.ok, true);
    assert.equal(plot.fertilized, false);
  });

  it('a mark an older save kept on an empty plot goes when it is planted', () => {
    const { garden, plot } = bed('clean', { fertilized: true });
    assert.equal(plantPlot(garden, '1-1', { seed_spinach: 1 }, { energy: 100 }, 'seed_spinach', { now: NOW }).ok, true);
    assert.equal(plot.fertilized, false);
  });

  it('has the source packages, costs nothing and never talks', () => {
    const crop = gardenActionProfile('default', 'fertilize', []);
    const herb = gardenActionProfile('herb', 'fertilize', []);
    assert.equal(crop.package, 'croppery_fertilize');
    assert.equal(herb.package, 'herbalism_fertilize');
    for (const p of [crop, herb]) {
      assert.equal(p.energy, 0);
      assert.equal(p.mood, 0);
      assert.equal(p.xp, 0);
      assert.equal(p.successRate, 100);
    }
    assert.equal(gardenTalkbackKey('default', 'fertilize'), null);
    assert.equal(GARDEN_FERTILIZE_MS, 2000);
    assert.equal(actionDurationFor('garden_plot', 'fertilize'), 2000);
    assert.equal(actionLabelFor('fertilize', 'Plot 1-1'), 'Fertilizing Plot 1-1…');
  });
});

describe('G403 the plot verb', () => {
  const target = (b) => ({ classId: 'garden_plot', label: 'Plot 1-1', state: { garden: b.garden, plotKey: '1-1', plot: b.plot, gardenEntity: {} } });
  const verbs = (b, inv) => getVerbsFor(target(b), { inv, pc: { energy: 50, mood: 50 } }).map((v) => v.id);

  it('shows with Guano on a plot that can take it, and only then', () => {
    const wet = bed('seeds', { wetAt: Date.now() });
    assert.ok(verbs(wet, { guano: 1 }).includes('fertilize'));
    assert.ok(!verbs(wet, {}).includes('fertilize'));
    assert.ok(!verbs(bed('seeds', { wetAt: Date.now() - GARDEN_WATER_MS * 0.5 }), { guano: 1 }).includes('fertilize'));
    assert.ok(!verbs(bed('crop', { wetAt: Date.now() }), { guano: 1 }).includes('fertilize'));
    assert.ok(!verbs(bed('shoots', { wetAt: Date.now(), fertilized: true }), { guano: 1 }).includes('fertilize'));
  });

  it('runs and reports the counter by garden type', () => {
    const b = bed('seeds', { wetAt: Date.now() });
    const inv = { guano: 1 };
    const r = runVerb(target(b), 'fertilize', { inv, pc: { energy: 50, mood: 50 } });
    assert.equal(r.ok, true);
    assert.equal(inv.guano ?? 0, 0);
    assert.equal(r.gardenChanged, true);
    assert.equal(r.gardenPlot.verb, 'fertilize');
    assert.deepEqual(gardenPlotEvents(r.gardenPlot, 'LA1'), [{ event: 'garden_plots_fertilized:LA1_default', amount: 1 }]);
    assert.deepEqual(gardenPlotEvents({ verb: 'fertilize', gardenType: 'herb' }, 'LA1'), [{ event: 'garden_plots_fertilized:LA1_herb', amount: 1 }]);
  });
});

describe('G403 dragging it', () => {
  it('a drop asks the plot under the cursor, and without the verb says no', () => {
    const b = bed('seeds');
    const target = { state: { plot: b.plot } };
    const verb = { id: 'fertilize', enabled: true };
    assert.deepEqual(guanoOver(target, [verb], NOW), { verb, tip: FERTILIZE_TEXT.tipOk });
    // A visit without a key: the plot's only verb is the refused Tend.
    assert.deepEqual(guanoOver(target, [{ id: 'neighbour_noop', enabled: false }], NOW), { verb: null, tip: FERTILIZE_TEXT.tipNo });
    assert.deepEqual(guanoOver({ state: { plot: bed('crop').plot } }, [verb], NOW), { verb: null, tip: FERTILIZE_TEXT.tipNo });
  });

  it('hits the plot box from its bottom centre', () => {
    const t = { sprite: { x: 100, y: 200, _gardenHitW: 40, _gardenHitH: 30 } };
    assert.equal(plotHit(t, 100, 190), true);
    assert.equal(plotHit(t, 121, 190), false);
    assert.equal(plotHit(t, 100, 201), false);
    assert.equal(plotHit(t, 100, 169), false);
  });

  it('only listens: a gift to a player and a move into a bag keep their drag', () => {
    const src = readFileSync(new URL('../public/js/features/garden-guano-feature.js', import.meta.url), 'utf8');
    assert.doesNotMatch(src, /packDragStart\(/);
  });
});

describe('G403 by a key-holder on a visit', () => {
  it('tells Guano from growth', () => {
    const b = bed('seeds');
    const before = plotsSnapshot(b.garden);
    // Growth alone: seeds to shoots is no act.
    b.plot.state = 'shoots';
    assert.equal(tendAct(before['1-1'], plotsSnapshot(b.garden)['1-1']), null);
    const c = bed('seeds');
    const snap = plotsSnapshot(c.garden);
    fertilizePlot(c.garden, '1-1', { guano: 1 }, { now: NOW + 5 });
    assert.deepEqual(tendAct(snap['1-1'], plotsSnapshot(c.garden)['1-1']), { act: 'guano', seed: '' });
    // Seen once, not again.
    const after = plotsSnapshot(c.garden);
    assert.equal(tendAct(after['1-1'], plotsSnapshot(c.garden)['1-1']), null);
  });

  it('the owner applies it as the visitor saw it', () => {
    const b = bed('shoots', { seed: 'seed_potato' });
    const at = NOW + 4000;
    assert.equal(applyTendAct(b.garden, { plot: '1-1', act: 'guano', at }), true);
    assert.equal(b.plot.fertilized, true);
    const left = SEED_CATALOG.seed_potato.grow2Ms - 4000;
    tickGarden(b.garden, at + 0.1 * left);
    assert.equal(b.plot.state, 'crop');
    const seeds = bed('seeds');
    assert.equal(applyTendAct(seeds.garden, { plot: '1-1', act: 'guano', at }), true);
    assert.equal(seeds.plot.state, 'shoots');
    assert.equal(seeds.plot.fertilized, undefined);
    // A harvest by a key-holder ends the mark.
    const picked = bed('crop', { fertilized: true });
    applyTendAct(picked.garden, { plot: '1-1', act: 'harvest', at });
    assert.equal(picked.plot.fertilized, false);
  });

  it('comes through the site list and reads plainly', () => {
    assert.equal(normalizeTendActs([{ id: 'tend-1', garden: 'g', plot: '1-1', act: 'guano' }]).length, 1);
    assert.equal(tendedText('Bo', [{ act: 'guano' }]), 'Bo fertilized your garden.');
  });

  it('every act fits the site table\'s column (a longer one is cut short and the owner never applies it)', { skip: !HAS_SITE }, () => {
    const minn = readFileSync(`${SITE_DIR}/minn.json`, 'utf8');
    const width = Number(minn.match(/"act varchar\((\d+)\) NOT NULL"/)?.[1]);
    const src = readFileSync(`${SITE_DIR}/src/HomeTending.php`, 'utf8');
    const acts = src.match(/public const ACTS = \[([^\]]+)\]/)[1].match(/'[a-z]+'/g).map((a) => a.slice(1, -1));
    assert.ok(acts.includes('guano'));
    for (const act of acts) assert.ok(act.length <= width, `${act} in varchar(${width})`);
    assert.ok(normalizeTendActs(acts.map((act) => ({ id: 'x', garden: 'g', plot: '1-1', act }))).length === acts.length);
  });

  it('the site keeps the same rules (src/HomeTending.php)', { skip: !HAS_SITE || spawnSync('php', ['-v']).status !== 0 }, () => {
    const code = `foreach (['Economy', 'LedgerMath', 'WordFilter', 'ButlerParcels', 'ButlerGifts', 'HomeTending'] as $c) require ${JSON.stringify(SITE_DIR)} . "/src/$c.php"; use Groddle\\Minn\\HomeTending;
      $seeds = ['waterMs' => 43200000, 'seeds' => ['seed_potato' => ['t' => 'default', 'g1' => 48000, 'g2' => 44000]]];
      $wet = fn (string $state, array $o = []) => (object) ($o + ['state' => $state, 'seed' => 'seed_potato', 'wet' => true, 'wetAt' => 0, 'stageStartedAt' => 0, 'growthMs' => 0, 'growModifier' => 1]);
      $act = ['act' => 'guano', 'seed' => ''];
      $out = [
        HomeTending::refuse($wet('seeds'), $act, 'default', 0, $seeds),
        HomeTending::refuse($wet('seeds'), $act, 'default', 8640000, $seeds),
        HomeTending::refuse($wet('seeds'), $act, 'default', 8640001, $seeds),
        HomeTending::refuse($wet('shoots', ['fertilized' => true]), $act, 'default', 0, $seeds),
        HomeTending::refuse($wet('crop'), $act, 'default', 0, $seeds),
        HomeTending::refuse($wet('seeds', ['wet' => false]), $act, 'default', 0, $seeds),
      ];
      $seedsPlot = $wet('seeds');
      HomeTending::applyAct($seedsPlot, 'guano', '', 5000, $seeds);
      $out[] = [$seedsPlot->state, $seedsPlot->stageStartedAt, $seedsPlot->fertilized ?? null];
      $shoots = $wet('shoots');
      HomeTending::applyAct($shoots, 'guano', '', 4000, $seeds);
      $out[] = [$shoots->fertilized, $shoots->stageStartedAt];
      HomeTending::tickPlot($shoots, 7999, $seeds);
      $out[] = $shoots->state;
      HomeTending::tickPlot($shoots, 8000, $seeds);
      $out[] = $shoots->state;
      HomeTending::applyAct($shoots, 'harvest', '', 9000, $seeds);
      $out[] = $shoots->fertilized;
      echo json_encode($out);`;
    assert.deepEqual(JSON.parse(execFileSync('php', ['-r', code], { encoding: 'utf8' })), [
      null,
      null,
      'You need to water it more first!',
      'Oops. There is nothing there to fertilize.',
      'Oops. There is nothing there to fertilize.',
      'You need to water it more first!',
      ['shoots', 5000, null],
      // 44 s grow, 4 s in: 40 s left, and a tenth of that is 4 s.
      [true, 4000 - (44000 - 4000)],
      'shoots',
      'crop',
      false,
    ]);
  });
});
