/**
 * Mystery quoins, reimagined (Austin 2026-10-29). GameServerJS
 * items/quoin.js onPlayerCollision (156-260) works out an amount for a
 * mystery quoin but adds no stat for it, and the client has no mystery
 * handling, so the source never defined a reward. The remake places them
 * itself (js/quoins.js STREET_SEQUENCE, one spot in eight) and now rolls one
 * of the four basic kinds uniformly, pays that kind's normal amount and says
 * what it turned into. Solo rolls with opts.rng; multiplayer takes the
 * realtime server's roll (quoins.go resolve).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MYSTERY_QUOIN_KINDS,
  QUOIN_TYPES,
  STREET_QUOIN_CLASSES,
  collectQuoin,
  createQuoinState,
  mysteryClassFor,
  planStreetQuoins,
  rollMysteryKind,
  streetQuoinClass,
} from '../public/js/quoins.js';
import { setMetabolicGainGate } from '../public/js/metabolics.js';
import { CHECKLIST } from '../tools/restoration/checklist.mjs';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const pcFor = () => ({ imagination: 0, xp: 0, energy: 10, mood: 50, moodMax: 100, energyMax: 100, currants: 0, level: 5 });
const at = (r) => () => r;

describe('the roll', () => {
  it('is one of the four basic kinds, each a quarter of [0, 1); never favor or time', () => {
    assert.deepEqual(MYSTERY_QUOIN_KINDS, ['xp', 'mood', 'energy', 'currants']);
    assert.deepEqual([0, 0.24, 0.25, 0.49, 0.5, 0.74, 0.75, 0.9999].map((r) => rollMysteryKind(at(r))),
      ['xp', 'xp', 'mood', 'mood', 'energy', 'energy', 'currants', 'currants']);
    assert.equal(rollMysteryKind(at(1)), 'currants', 'clamped below 1');
    assert.equal(rollMysteryKind(at(NaN)), 'xp');
    const seen = new Set();
    for (let i = 0; i < 400; i += 1) seen.add(rollMysteryKind());
    assert.deepEqual([...seen].sort(), [...MYSTERY_QUOIN_KINDS].sort(), 'Math.random reaches every kind');
  });

  it('maps a mystery spot\'s class to the same tier of the rolled kind', () => {
    assert.equal(mysteryClassFor('small random xp', 'mood'), 'small random mood');
    assert.equal(mysteryClassFor('slow medium-large xp', 'currants'), 'slow medium-large currants');
    assert.equal(mysteryClassFor('small random xp', 'xp'), 'small random xp');
    assert.equal(mysteryClassFor('fast tiny currants', 'currants'), 'fast tiny currants', 'a class of the rolled kind is its own');
    assert.equal(mysteryClassFor('fast tiny currants', 'mood'), '', 'in no street pair: the base amount');
    assert.equal(mysteryClassFor('', 'mood'), '');
    assert.equal(mysteryClassFor('small random xp', 'favor'), '');
    // The planner's mystery spots use the iMG pair, so every one maps.
    const plan = planStreetQuoins('GLI2V0UN7RD1T2J', 8);
    const i = plan.indexOf('mystery');
    assert.ok(i >= 0, 'one spot in eight is a mystery');
    assert.ok(STREET_QUOIN_CLASSES.xp.includes(streetQuoinClass('GLI2V0UN7RD1T2J', i, 'mystery')));
  });
});

describe('collecting one', () => {
  it('reaches every kind and pays its class amount (small random: 2 to 6)', () => {
    const want = { xp: 'imagination', mood: 'mood', energy: 'energy', currants: 'currants' };
    for (const [n, kind] of MYSTERY_QUOIN_KINDS.entries()) {
      const pc = pcFor();
      const state = createQuoinState();
      // One rng for the kind and the class roll: n/4 + 0.1 picks kind n and 2 + floor(r * 5).
      const r = n / 4 + 0.1;
      const res = collectQuoin(state, 'mystery', pc, { className: 'small random xp', rng: at(r) });
      assert.equal(res.ok, true);
      assert.equal(res.typeId, 'mystery', 'the quoin stays a mystery quoin');
      assert.equal(res.resolvedTypeId, kind);
      assert.equal(res.quoinClass, `small random ${kind}`);
      assert.equal(res.baseAmount, 2 + Math.floor(r * 5));
      assert.ok(res.baseAmount >= 2 && res.baseAmount <= 6);
      assert.ok(pc[want[kind]] > pcFor()[want[kind]], `${kind} landed`);
      assert.deepEqual(state.byType, { [kind]: 1 }, 'counted as the kind it paid');
      assert.deepEqual(state.dailyByType, { [kind]: 1 });
    }
  });

  it('pays the big tier as the rolled kind\'s 25, times the multiplier', () => {
    const pc = pcFor();
    const state = createQuoinState({ multiplier: 3 });
    const res = collectQuoin(state, 'mystery', pc, { className: 'slow medium-large xp', rng: at(0.8) });
    assert.deepEqual([res.resolvedTypeId, res.baseAmount, res.amount, res.actual, pc.currants], ['currants', 25, 75, 75, 75]);
  });

  it('with no class (quest and demo quoins) pays the rolled kind\'s base amount', () => {
    for (const [n, kind] of MYSTERY_QUOIN_KINDS.entries()) {
      const res = collectQuoin(createQuoinState(), 'mystery', pcFor(), { rng: at(n / 4) });
      assert.equal(res.baseAmount, QUOIN_TYPES[kind].baseAmount, kind);
    }
  });

  it('takes the realtime server\'s kind and amount in multiplayer, ignoring anything else', () => {
    const pc = pcFor();
    const res = collectQuoin(createQuoinState({ multiplier: 2 }), 'mystery', pc, { className: 'small random xp', resolvedType: 'energy', amount: 4, rng: at(0.9) });
    assert.deepEqual([res.resolvedTypeId, res.baseAmount, res.amount, pc.energy], ['energy', 4, 8, 18]);
    const odd = collectQuoin(createQuoinState(), 'mystery', pcFor(), { resolvedType: 'favor', rng: at(0) });
    assert.equal(odd.resolvedTypeId, 'xp', 'favor and time are never a mystery quoin\'s kind');
    const plain = collectQuoin(createQuoinState(), 'xp', pcFor(), { resolvedType: 'mood' });
    assert.equal(plain.resolvedTypeId, 'xp', 'only a mystery quoin resolves');
  });

  it('still counts toward the daily limit, and is refused at it', () => {
    const state = createQuoinState({ dailyLimit: 2 });
    assert.equal(collectQuoin(state, 'mystery', pcFor(), { rng: at(0.3) }).dailyCount, 1);
    const second = collectQuoin(state, 'mystery', pcFor(), { rng: at(0.6) });
    assert.equal(second.hitLimit, true);
    const pc = pcFor();
    const third = collectQuoin(state, 'mystery', pc, { rng: at(0.9) });
    assert.deepEqual([third.ok, third.reason], [false, 'daily_limit']);
    assert.equal(pc.currants, 0, 'nothing lands past the limit');
    assert.equal(state.totalCollected, 2);
  });

  it('a rolled mood or energy still asks the metabolic gate', () => {
    setMetabolicGainGate(() => ({ ok: false, msg: 'no' }));
    try {
      const pc = pcFor();
      const res = collectQuoin(createQuoinState(), 'mystery', pc, { rng: at(0.6) });
      assert.deepEqual([res.resolvedTypeId, res.actual, res.blocked, pc.energy], ['energy', 0, 'no', 10]);
    } finally {
      setMetabolicGainGate(null);
    }
  });
});

describe('what the player sees', () => {
  const game = read('public/game.js');
  it('the notice, float and sound use the rolled kind, iMG for xp', () => {
    // NOTIFY: a plain quoin is a gain (its float and a log line); a mystery one still says what it was.
    // Its notice is not logged: the gain line below is the log's ("You collected a mystery quoin. +3 energy.").
    assert.match(game, /if \(result\.typeId === 'mystery'\) notify\.notice\(wholeStatAmounts\(`Mystery quoin: \$\{copy\}`\), \{ log: false \}\);/);
    assert.match(game, /if \(result\.resolvedTypeId === 'xp'\) return `\+\$\{amount\} iMG`;/);
    assert.match(game, /const rewardDef = QUOIN_TYPES\[result\.resolvedTypeId\] \|\| q\.def;/);
    assert.match(game, /floatText\(q\.x, q\.y - 20, copy, rewardDef\.color\);/);
    assert.match(game, /soundForQuoin\(result\.resolvedTypeId\)/);
    assert.match(game, /resolvedType: shared\.resolved/, 'multiplayer passes the server\'s roll');
  });

  it('a mystery grab shards as a mystery quoin: not at all (quoin.js 84)', () => {
    assert.match(game, /features\.query\('quoinShards', \{\s+grabber: 'player',\s+typeId: result\.typeId,/);
  });

  it('is marked reimagined on the restoration page', () => {
    const row = CHECKLIST.find((item) => item.id === 'mystery-quoins');
    assert.ok(row, 'checklist row');
    assert.equal(row.status, 'reimagined');
    assert.equal(row.group, 'economy');
    assert.match(row.blurb, /mystery/i);
    assert.ok(!/—/.test(row.blurb), 'no em dashes');
  });
});
