/**
 * G777 (#354, #364): gardens on the outdoor home street are public, as in Glitch (the exterior
 * is_public, players/inc_houses.js 847; include/garden.js isPublic 1244-1247; main.js
 * doGardenAction 6513-6518): any visitor may plant, water, Guano, clear and harvest them, and the
 * planter has the first minute on the ripe crop (include/garden.js 384, 1042-1046, 1229-1231;
 * GardenView.as 481-486). The back yard's gardens stay the owner's and key-holders'. The game's
 * gate (features/neighbours-mp-feature.js) and the site's (src/HomeTending.php) agree; the site's
 * PHP runs here through php -r (skipped without the site or php).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  HOME_PLANTER_HOLD_LINE,
  HOME_PLANTER_HOLD_MS,
  applyTendAct,
  homePlotHeld,
  mayTendYard,
  normalizeTendActs,
} from '../public/js/neighbours-mp.js?v=a5cd63e7';
import { LOCK_LINE } from '../public/js/shared-gardens.js?v=464472e5';
import { GARDEN_WATER_MS, createGarden, harvestPlot, plotStageMs, sowPlot, tickGarden, waterAllPlots, wetPlot } from '../public/js/garden.js?v=fefa7bcd';
import { HAS_SITE, SITE_DIR } from '../tools/repos.mjs';
import { HAS_PHP, PHP } from './php.js';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const hasPhp = HAS_PHP;
const skipSite = !HAS_SITE ? 'no groddle-afternoon-site checkout' : !hasPhp ? 'no php' : false;

function php(body) {
  const code = `foreach (['Economy', 'LedgerMath', 'HomeTending'] as $c) require ${JSON.stringify(SITE_DIR)} . "/src/$c.php"; use Groddle\\Minn\\HomeTending; ${body}`;
  return JSON.parse(execFileSync(PHP, ['-r', code]).toString());
}

describe('G777: the home street\'s gardens are public (game)', () => {
  it('opens the home street to any visitor, the back yard to key-holders only', () => {
    assert.equal(mayTendYard('street', false), true);
    assert.equal(mayTendYard('back', false), false);
    assert.equal(mayTendYard('back', true), true);
    assert.equal(mayTendYard('street', true), true);
  });

  it('holds a ripe crop for its planter for a minute, then anyone may pick', () => {
    const ripe = 1_000_000;
    const plot = { state: 'crop', seed: 'seed_spinach', planter: 9, ripeAt: ripe, stageStartedAt: ripe };
    assert.equal(HOME_PLANTER_HOLD_MS, 60_000);
    assert.equal(homePlotHeld(plot, 9, 7, ripe + 1000), false, 'the planter picks at once');
    assert.equal(homePlotHeld(plot, 12, 7, ripe + 1000), true, 'another visitor waits');
    assert.equal(homePlotHeld(plot, 7, 7, ripe + 59_999), true, 'the owner waits too, as in Glitch');
    assert.equal(homePlotHeld(plot, 12, 7, ripe + 60_000), false, 'after the minute anyone picks');
    // No planter: the owner's own planting, held for the owner.
    const own = { state: 'crop', seed: 'seed_spinach', ripeAt: ripe };
    assert.equal(homePlotHeld(own, 7, 7, ripe + 10), false);
    assert.equal(homePlotHeld(own, 12, 7, ripe + 10), true);
    assert.equal(homePlotHeld({ ...plot, state: 'shoots' }, 12, 7, ripe + 10), false);
    // A crop with no ripe time (ripened before it was kept) is nobody's to wait for, as gardens.go reads it.
    assert.equal(homePlotHeld({ state: 'crop', seed: 'seed_spinach', planter: 9, stageStartedAt: ripe }, 12, 7, ripe + 10), false);
    assert.equal(HOME_PLANTER_HOLD_LINE, LOCK_LINE, 'the same feed line as the shared public gardens');
  });

  it('#550: the minute runs from when the crop ripened; watering it or that watering drying never restarts it', () => {
    const T = Date.UTC(2026, 10, 18, 12);
    const H = 3_600_000;
    const OWNER = 598;
    const VISITOR = 9;
    const g = createGarden({ cols: 2, rows: 1, now: T - H });
    for (const k of ['1-1', '2-1']) {
      applyTendAct(g, { yard: 'street', plot: k, act: 'plant', seed: 'seed_spinach', at: T, from: { id: VISITOR } }, tickGarden);
      applyTendAct(g, { yard: 'street', plot: k, act: 'water', seed: '', at: T + 1000, from: { id: VISITOR } }, tickGarden);
    }
    const p = g.plots['1-1'];
    // A fresh crop: the planter's minute from the moment it ripened, where tickGarden says it did.
    const need = plotStageMs(p, 'seeds') + plotStageMs(p, 'shoots');
    tickGarden(g, T + 1000 + need + 10);
    assert.equal(p.state, 'crop');
    assert.equal(p.ripeAt, T + 1000 + need);
    assert.equal(homePlotHeld(p, OWNER, OWNER, p.ripeAt + 30_000), true, 'the owner waits the planter\'s minute');
    assert.equal(homePlotHeld(p, VISITOR, OWNER, p.ripeAt + 30_000), false, 'the planter picks at once');
    // The owner waters in that minute: the minute still ends when it would have.
    const ripeAt = p.ripeAt;
    tickGarden(g, ripeAt + 30_000);
    p.wet = false;
    wetPlot(p, ripeAt + 30_000);
    assert.equal(p.ripeAt, ripeAt);
    assert.equal(homePlotHeld(p, OWNER, OWNER, ripeAt + 60_000), false);
    // A day later the ripe crop has dried; "Water all" and the drying 72 minutes on keep it pickable.
    let now = T + 25 * H;
    tickGarden(g, now);
    assert.equal(p.wet, false);
    assert.equal(homePlotHeld(p, OWNER, OWNER, now), false, 'ripe a day ago: anyone picks');
    waterAllPlots(g, { energy: 500, mood: 100 }, { now, requireTool: false, maxLuck: true, rng: () => 0 });
    assert.equal(p.wet, true, 'the owner watered the ripe crop');
    assert.equal(homePlotHeld(p, OWNER, OWNER, now), false, 'watering a ripe crop does not hold it again');
    now = p.wetAt + GARDEN_WATER_MS + 5_000;
    tickGarden(g, now);
    assert.equal(p.wet, false);
    assert.equal(homePlotHeld(p, OWNER, OWNER, now), false, 'nor does that watering drying');
    // A visitor's water act arriving late, applied at its own time.
    now += 3 * H;
    applyTendAct(g, { yard: 'street', plot: '1-1', act: 'water', seed: '', at: now - 2000, from: { id: VISITOR } }, tickGarden);
    assert.equal(homePlotHeld(p, OWNER, OWNER, now), false);
    assert.equal(p.ripeAt, ripeAt, 'the crop keeps the time it ripened');
    // The pick ends it; a new sowing ripens with its own time.
    applyTendAct(g, { yard: 'street', plot: '1-1', act: 'harvest', seed: '', at: now, from: { id: OWNER } });
    assert.equal(p.ripeAt, undefined);
  });

  it('keeps a visitor\'s planting on the street as theirs; the pick or a new sowing ends it', () => {
    const g = createGarden({ cols: 2, rows: 1, now: 0 });
    const [act] = normalizeTendActs([{ yard: 'street', g: 'c1', p: '1-1', a: 'plant', s: 'seed_spinach', at: 10 }], { id: 9, name: 'Visitor' });
    assert.equal(act.from.id, 9, 'the realtime server names the tender once for its acts');
    assert.ok(applyTendAct(g, act));
    assert.equal(g.plots['1-1'].planter, 9);
    // The back yard is no public garden: no planter there.
    const back = createGarden({ cols: 1, rows: 1, now: 0 });
    applyTendAct(back, { yard: 'back', plot: '1-1', act: 'plant', seed: 'seed_spinach', at: 10, from: { id: 9 } });
    assert.equal(back.plots['1-1'].planter, undefined);
    // A visitor's pick clears it.
    g.plots['1-1'].state = 'crop';
    applyTendAct(g, { yard: 'street', plot: '1-1', act: 'harvest', seed: '', at: 20, from: { id: 9 } });
    assert.equal(g.plots['1-1'].planter, undefined);
    // The owner's own sowing and pick clear a stale one.
    g.plots['1-2'] = { ...g.plots['1-1'], planter: 4 };
    sowPlot(g.plots['1-2'], 'seed_spinach', 30);
    assert.equal(g.plots['1-2'].planter, undefined);
    g.plots['2-1'].state = 'crop';
    g.plots['2-1'].seed = 'seed_spinach';
    g.plots['2-1'].planter = 4;
    const r = harvestPlot(g, '2-1', {}, { energy: 100 }, { now: 40, maxLuck: true });
    assert.equal(r.ok, true);
    assert.equal(g.plots['2-1'].planter, undefined);
  });

  it('lets visitors tend a home-street bed without a key, refuses the crop in its planter\'s minute', () => {
    const src = read('public/js/features/neighbours-mp-feature.js');
    assert.match(src, /if \(session\.mayTend\(\) \|\| session\.publicBed\(target\)\) return null;/);
    assert.match(src, /if \(!mayTendYard\(bed\.yard, visit\.key\)\) continue;/);
    assert.match(src, /verbRefusedNow\(target, verbId, engine\) \{\n\s+if \(verbId !== 'harvest'/);
    assert.match(src, /normalizeTendActs\(msg\.acts, msg\.from\)/);
    assert.doesNotMatch(src, /if \(!visit\?\.key \|\| !visit\.beds\.size/);
  });
});

describe('G777: the site takes a visitor\'s tending on the home street', { skip: skipSite }, () => {
  it('needs a key only in the back yard', () => {
    const out = php(`echo json_encode([HomeTending::mayTend('street', false), HomeTending::mayTend('back', false), HomeTending::mayTend('back', true)]);`);
    assert.deepEqual(out, [true, false, true]);
    const src = readFileSync(join(SITE_DIR, 'src/HomeTending.php'), 'utf8');
    assert.match(src, /if \(!self::mayTend\(\$act\['yard'\], \$key\)\)/);
    assert.doesNotMatch(src, /\$owner === \$me \|\| !\(new Neighbours/);
  });

  it('keeps the planter and holds the crop for them a minute, as the game does', () => {
    const out = php(`
      $seeds = HomeTending::seeds();
      $p = (object) ['state' => 'clean'];
      HomeTending::applyAct($p, 'plant', 'seed_spinach', 1000, $seeds, 9);
      $planted = $p->planter ?? null;
      $p->state = 'crop';
      $p->ripeAt = 5000;
      $pub7 = ['me' => 12, 'owner' => 7];
      $other = HomeTending::refuse($p, ['act' => 'harvest', 'seed' => ''], 'default', 6000, $seeds, $pub7);
      $mine = HomeTending::refuse($p, ['act' => 'harvest', 'seed' => ''], 'default', 6000, $seeds, ['me' => 9, 'owner' => 7]);
      $later = HomeTending::refuse($p, ['act' => 'harvest', 'seed' => ''], 'default', 65000, $seeds, $pub7);
      $back = HomeTending::refuse($p, ['act' => 'harvest', 'seed' => ''], 'default', 6000, $seeds, null);
      $own = (object) ['state' => 'crop', 'seed' => 'seed_spinach', 'ripeAt' => 5000];
      $ownHeld = HomeTending::held($own, 12, 7, 6000);
      HomeTending::applyAct($p, 'harvest', '', 70000, $seeds);
      $homes = (object) ['cult' => (object) ['gardens' => (object) ['g1' => (object) ['gardenType' => 'default', 'plots' => (object) ['1-1' => (object) ['state' => 'clean']]]]]];
      $shown = HomeTending::overlay($homes, [['visitor_id' => 9, 'yard' => 'street', 'garden' => 'g1', 'plot' => '1-1', 'act' => 'plant', 'seed' => 'seed_spinach', 'at_ms' => 99]]);
      $picked = property_exists($p, 'planter') || property_exists($p, 'ripeAt');
      $old = HomeTending::held((object) ['state' => 'crop', 'seed' => 'seed_spinach', 'stageStartedAt' => 5000], 12, 7, 6000);
      echo json_encode([$planted, $other, $mine, $later, $back, $ownHeld, $picked, $shown->cult->gardens->g1->plots->{'1-1'}->planter ?? null, $old]);`);
    assert.deepEqual(out, [9, LOCK_LINE, null, null, null, true, false, 9, false]);
  });

  it('#550: runs the minute from when the crop ripened, as the game does; watering and drying never restart it', () => {
    const out = php(`
      $seeds = HomeTending::seeds();
      $T = 1763467200000; $H = 3600000;
      $p = (object) ['state' => 'clean'];
      HomeTending::applyAct($p, 'plant', 'seed_spinach', $T, $seeds, 9);
      HomeTending::applyAct($p, 'water', '', $T + 1000, $seeds);
      $need = HomeTending::stageMs($p, 'seeds', $seeds) + HomeTending::stageMs($p, 'shoots', $seeds);
      HomeTending::tickPlot($p, $T + 1000 + $need + 10, $seeds);
      $ripeAt = $p->ripeAt ?? null;
      $fresh = HomeTending::held($p, 598, 598, $ripeAt + 30000);
      $now = $T + 25 * $H;
      HomeTending::tickPlot($p, $now, $seeds);
      $dry = ($p->wet ?? false) === true;
      HomeTending::applyAct($p, 'water', '', $now, $seeds);
      $watered = HomeTending::held($p, 598, 598, $now + 1);
      $now = $now + HomeTending::waterMs($p, $seeds) + 5000;
      HomeTending::tickPlot($p, $now, $seeds);
      $dried = HomeTending::held($p, 598, 598, $now);
      $refuse = HomeTending::refuse($p, ['act' => 'harvest', 'seed' => ''], 'default', $now, $seeds, ['me' => 598, 'owner' => 598]);
      echo json_encode([$ripeAt === $T + 1000 + $need, $fresh, $dry, $watered, $dried, $refuse, $p->ripeAt === $ripeAt]);`);
    assert.deepEqual(out, [true, true, false, false, false, null, true]);
  });
});
