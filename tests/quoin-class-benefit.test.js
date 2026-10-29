// G227: a quoin spot's class sets what it gives as well as its timer
// (items/quoin.js 161-174, 321-650; Austin, desk QUOINCLASS), the game-day
// turn leaves timed spots alone, and the leftover energy/mood gains ask the
// metabolic gate (inc_metabolics.js 40-53, 79-86).
import { afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  FAVOR_GIANT_IDS,
  QUOIN_CLASSES,
  QUOIN_TYPES,
  STREET_QUOIN_CLASSES,
  collectQuoin,
  createQuoinState,
  quoinClassAmount,
  quoinClassGiant,
  quoinClassType,
  resetStreetQuoinsForNewDay,
  streetQuoinClass,
} from '../public/js/quoins.js';
import { setMetabolicGainGate } from '../public/js/metabolics.js';
import { applyDropResult, createDropResult } from '../public/js/drop-tables.js';
import { applyBuff, createBuffState, tickBuffs } from '../public/js/buffs.js?v=g403-1';
import { loadContentCatalogsFromDir } from '../public/js/content-catalogs.js?v=g403-1';
import { applyVerbReward } from '../public/js/verb-rewards.js';

const here = dirname(fileURLToPath(import.meta.url));
const pub = join(here, '../public');
const read = (rel) => readFileSync(join(pub, rel), 'utf8');
const gsjs = join(here, '../../glitch-GameServerJS');
const quoinJs = join(gsjs, 'items/quoin.js');
const game = read('game.js');

afterEach(() => setMetabolicGainGate(null));
before(async () => {
  await loadContentCatalogsFromDir(join(pub, 'assets/content'));
});

/** Every case of quoin.js onPropsChanged with the props it sets. */
function sourceClasses() {
  const lines = readFileSync(quoinJs, 'utf8').split('\n');
  const start = lines.findIndex((l) => l.startsWith('function onPropsChanged'));
  const rows = [];
  let cur = null;
  for (let i = start; i < start + 360; i += 1) {
    const l = lines[i].trim();
    const c = l.match(/^case '([^']*)':/);
    if (c) {
      cur = c[1] ? { name: c[1], props: {} } : null;
      if (cur) rows.push(cur);
      continue;
    }
    if (!cur) continue;
    const m = l.match(/^this\.instanceProps\.(\w+)\s*=\s*["']?([^"';]*)["']?;/);
    if (m) cur.props[m[1]] = m[2];
  }
  return rows;
}

const pcFor = () => ({ level: 1, xp: 0, imagination: 0, mood: 50, energy: 50, energyMax: 100, currants: 0 });

describe('class benefits against items/quoin.js', { skip: !existsSync(quoinJs) && 'glitch-GameServerJS not beside the spike' }, () => {
  it('every class: benefit, or floor and ceil when is_random, and the Giant it names', () => {
    const rows = sourceClasses();
    assert.equal(rows.length, 44);
    for (const { name, props } of rows) {
      const mine = QUOIN_CLASSES[name];
      if (props.is_random === '1') {
        assert.equal(mine.floor, Number(props.benefit_floor), name);
        assert.equal(mine.ceil, Number(props.benefit_ceil), name);
        assert.equal(mine.benefit, undefined, name);
      } else {
        assert.equal(props.is_random, '0', name);
        assert.equal(mine.benefit, Number(props.benefit), name);
        assert.equal(mine.floor, undefined, name);
      }
      assert.equal(mine.giant ?? null, props.giant ?? null, name);
    }
  });

  it('a grab rolls randInt(floor, ceil), inclusive, then the multiplier, rounded', () => {
    const src = readFileSync(quoinJs, 'utf8');
    assert.match(src, /if \(this\.instanceProps\.is_random == 1\)\{\s*var amount = randInt\(intval\(this\.instanceProps\.benefit_floor\), intval\(this\.instanceProps\.benefit_ceil\)\);/);
    assert.match(src, /amount = Math\.round\(amount \* personal_multiplier\);/);
    assert.match(src, /pc\.sendActivity\("\+"\+amount\+" favor with all giants!"\);/);
    const common = readFileSync(join(gsjs, 'common.js'), 'utf8');
    assert.match(common, /function randInt\(lo, hi\)\{\s*return lo \+ Math\.floor\(Math\.random\(\)\*\(1\+hi-lo\)\);/);
    const stats = readFileSync(join(gsjs, 'players/inc_stats.js'), 'utf8');
    assert.match(stats, /if \(giant == 'all'\)\{\s*for \(var i=0; i<config\.giants\.length; i\+\+\)\{\s*this\.stats_add_favor_points\(config\.giants\[i\], value\);\s*\}\s*return value;/);
    const config = readFileSync(join(gsjs, 'config_base.js'), 'utf8');
    const giants = config.match(/var giants = \[([^\]]*)\]/)[1].match(/'(\w+)'/g).map((g) => g.slice(1, -1));
    assert.deepEqual([...FAVOR_GIANT_IDS], giants);
  });
});

describe('quoinClassAmount', () => {
  it('fixed classes give their benefit; random ones span floor to ceil', () => {
    assert.equal(quoinClassAmount('fast tiny currants', 'currants'), 1);
    assert.equal(quoinClassAmount('slow medium-large xp', 'xp'), 25);
    assert.equal(quoinClassAmount('long large random time', 'time'), 30);
    assert.equal(quoinClassAmount('long random large energy', 'energy', () => 0), 2);
    assert.equal(quoinClassAmount('long random large energy', 'energy', () => 0.999999), 100);
    assert.equal(quoinClassAmount('small random mood', 'mood', () => 0.5), 4);
    const seen = new Set();
    for (let i = 0; i < 400; i += 1) seen.add(quoinClassAmount('small random xp', 'xp'));
    assert.deepEqual([...seen].sort(), [2, 3, 4, 5, 6]);
  });

  it('none for an unknown class or one of another type', () => {
    assert.equal(quoinClassAmount('', 'xp'), null);
    assert.equal(quoinClassAmount('no such class', 'xp'), null);
    assert.equal(quoinClassAmount('fast tiny xp', 'mystery'), null, 'mystery spots borrow the iMG timers only');
    assert.equal(quoinClassAmount('fast tiny xp', 'currants'), null);
    assert.equal(quoinClassAmount('placement tester', 'mood'), 0, 'the tester has no type of its own');
  });

  it('the Giant and the type a class sets', () => {
    assert.equal(quoinClassGiant('small random favor'), 'all');
    assert.equal(quoinClassGiant('random baqala favor'), 'all');
    assert.equal(quoinClassGiant('slow medium random favor'), null);
    assert.equal(quoinClassType('long random large currants'), 'currants');
    assert.equal(quoinClassType('quoin hub fast iMG'), 'xp');
    assert.equal(quoinClassType('nope'), '');
  });

  it('every street tier has a benefit', () => {
    for (const [type, list] of Object.entries(STREET_QUOIN_CLASSES)) {
      for (const name of list) assert.ok(Number.isInteger(quoinClassAmount(name, type, () => 0)), name);
    }
  });
});

describe('collectQuoin with a class', () => {
  it('the class sets the base, the multiplier scales it, and shards see the base', () => {
    const state = createQuoinState({ multiplier: 3 });
    const pc = pcFor();
    const r = collectQuoin(state, 'currants', pc, { className: 'slow medium-large currants' });
    assert.equal(r.baseAmount, 25);
    assert.equal(r.amount, 75);
    assert.equal(r.actual, 75);
    assert.equal(pc.currants, 75);
    assert.equal(r.quoinClass, 'slow medium-large currants');
    const half = collectQuoin(createQuoinState({ multiplier: 1.5 }), 'currants', pc, { className: 'small random currants', rng: () => 0.99 });
    assert.equal(half.baseAmount, 6);
    assert.equal(half.amount, 9, 'Math.round(6 * 1.5)');
  });

  it('an explicit amount still wins; no class keeps the type default', () => {
    const pc = pcFor();
    assert.equal(collectQuoin(createQuoinState(), 'xp', pc, { className: 'slow medium-large xp', amount: 3 }).baseAmount, 3);
    assert.equal(collectQuoin(createQuoinState(), 'xp', pc).baseAmount, QUOIN_TYPES.xp.baseAmount);
    assert.equal(collectQuoin(createQuoinState(), 'xp', pc, { className: 'nope' }).quoinClass, null);
  });

  it('mystery pays its rolled kind\'s class of the same tier, and qurazy keeps its level reward, whatever the class', () => {
    const pc = pcFor();
    const m = collectQuoin(createQuoinState(), 'mystery', pc, { className: 'slow medium-large xp', rng: () => 0.3 });
    assert.deepEqual([m.resolvedTypeId, m.quoinClass, m.baseAmount], ['mood', 'slow medium-large mood', 25]);
    const q = collectQuoin(createQuoinState(), 'qurazy', pc, { className: 'slow medium-large xp' });
    assert.equal(q.baseAmount, 10);
    assert.equal(q.quoinClass, null);
  });

  it('energy and mood classes still ask the gate', () => {
    setMetabolicGainGate(() => ({ ok: false, msg: 'no' }));
    const pc = pcFor();
    const r = collectQuoin(createQuoinState(), 'energy', pc, { className: 'slow medium-large energy' });
    assert.equal(r.baseAmount, 25);
    assert.equal(r.actual, 0);
    assert.equal(pc.energy, 50);
  });

  it('time classes set the seconds of study acceleration', () => {
    let asked = 0;
    const r = collectQuoin(createQuoinState(), 'time', pcFor(), {
      className: 'long large random time',
      accelerateStudy: (s) => { asked = s; return { ok: true, applied: s }; },
    });
    assert.equal(asked, 30);
    assert.equal(r.actual, 30);
  });

  it('small random favor goes to every Giant; the other favor classes to the street\'s', () => {
    const favor = { lem: 4, ti: 999 };
    const caps = { ti: 1000 };
    const r = collectQuoin(createQuoinState(), 'favor', pcFor(), {
      className: 'small random favor', giantId: 'lem', favor, favorCap: (id) => caps[id] ?? 1000, rng: () => 0.99,
    });
    assert.equal(r.giantId, 'all');
    assert.equal(r.actual, 3, 'stats_add_favor_points(all) returns the value asked for');
    for (const id of FAVOR_GIANT_IDS) assert.ok(favor[id] >= 1, id);
    assert.equal(favor.lem, 7);
    assert.equal(favor.ti, 1000, 'each Giant still caps at its emblem target');
    assert.equal(favor.all, undefined);
    const one = {};
    const s = collectQuoin(createQuoinState(), 'favor', pcFor(), { className: 'long large random favor', giantId: 'Spriggan', favor: one });
    assert.equal(s.giantId, 'spriggan');
    assert.deepEqual(one, { spriggan: 10 });
  });
});

describe('the game-day turn (no day reset for quoins in the source)', () => {
  it('keeps spots waiting on a timer, frees the rest', () => {
    const street = { collectedQuoins: [0, 2, 5, 7], quoinRespawn: { 0: 1000, 5: 99_999, 9: 5 } };
    assert.equal(resetStreetQuoinsForNewDay(street), 2);
    assert.deepEqual(street.collectedQuoins, [0, 5]);
    assert.deepEqual(street.quoinRespawn, { 0: 1000, 5: 99_999 });
    const bare = { collectedQuoins: [1] };
    assert.equal(resetStreetQuoinsForNewDay(bare), 1);
    assert.deepEqual(bare.collectedQuoins, []);
    assert.equal(resetStreetQuoinsForNewDay(null), 0);
  });
});

describe('game.js and the shard feature use the class', () => {
  it('the grab passes the spot\'s class; a forced class sets spot 0\'s type', () => {
    assert.match(game, /collectQuoin\(quoinState, q\.typeId, pc, \{\s*\/\/ G227[^\n]*\n\s*className: q\.quoinClass,/);
    assert.match(game, /const forcedType = quoinClassType\(params\.get\('quoinclass'\)\);\s*if \(forcedType && QUOIN_TYPES\[forcedType\]\) plan\[0\] = forcedType;/);
    assert.match(game, /if \(result\.giantId === 'all'\) return `\+\$\{amount\} favor with all giants`;/);
    assert.equal(streetQuoinClass('GLI2V0UN7RD1T2J', 2, 'currants'), streetQuoinClass('GLI2V0UN7RD1T2J', 2, 'currants'));
  });

  it('a companion grab shards the class benefit', () => {
    const shards = read('js/features/quoin-shards-feature.js');
    assert.match(shards, /baseAmount: quoinClassAmount\(q\.quoinClass, q\.typeId\) \?\? QUOIN_TYPES\[q\.typeId\]\?\.baseAmount,/);
    assert.match(shards, /&quoinclass=slow medium-large xp/);
  });
});

describe('other energy and mood gains ask the gate', () => {
  const refuse = () => setMetabolicGainGate((stat) => ({ ok: false, msg: `no ${stat}` }));

  it('drop tables: nothing lands, and the line says 0 (inc_skill_packages.js 85-101)', () => {
    refuse();
    const pc = pcFor();
    const result = { ...createDropResult(null), mood: 5, energy: 7 };
    const { lines, landed } = applyDropResult(result, { pc });
    assert.equal(pc.mood, 50);
    assert.equal(pc.energy, 50);
    assert.equal(landed.energy, 0);
    assert.ok(lines.includes('You got 0 energy!'), lines.join(' | '));
    setMetabolicGainGate(null);
    const ok = applyDropResult(result, { pc });
    assert.equal(ok.landed.energy, 7);
  });

  it('buffs: start and tick rises are refused, losses still land', () => {
    refuse();
    const pc = pcFor();
    const state = createBuffState();
    applyBuff(state, 'rookswort', pc, 0);
    assert.equal(pc.energy, 50, 'no +3 energy');
    assert.equal(pc.mood, 48, 'the -2 mood still lands');
    const nn = pcFor();
    applyBuff(createBuffState(), 'no_no_powder', nn, 0);
    assert.equal(nn.energy, 50);
    assert.equal(nn.mood, 50);
  });

  it('skill package verbs: the mood bonus is refused while dead', () => {
    refuse();
    const pc = pcFor();
    const r = applyVerbReward(pc, { energyCost: 2, moodGain: 3, xpGain: 0 });
    assert.equal(r.ok, true);
    assert.equal(r.mood, 0);
    assert.equal(pc.mood, 50);
    assert.equal(pc.energy, 48);
  });

  it('crabs: settle rewards and verb rises ask the gate (static)', () => {
    const crabs = read('js/features/crabs-feature.js');
    assert.match(crabs, /if \(r\.mood > 0 && metabolicGain\('mood'\)\.ok\) \{/);
    assert.match(crabs, /if \(r\.energy > 0 && metabolicGain\('energy'\)\.ok\) \{/);
    // G300: verb changes go through both doors (shiftMetabolic: gains ask the gain gate).
    assert.match(crabs, /const mood = shiftMetabolic\(pc, 'mood', result\.mood\);/);
    assert.match(crabs, /const energy = shiftMetabolic\(pc, 'energy', result\.energy\);/);
  });

  it('tickBuffs still runs with the gate open', () => {
    const pc = pcFor();
    const state = createBuffState();
    applyBuff(state, 'no_no_powder', pc, 0);
    assert.equal(pc.energy, 100);
    tickBuffs(state, pc, 1000);
  });
});
