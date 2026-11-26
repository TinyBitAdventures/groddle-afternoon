// G970 (root R13): one way to change energy and mood. Every write goes through js/metabolics.js:
// gainMetabolic (metabolics_add_*: the gain door, capped at the tank, never lowering a stat above
// it), loseEnergy / loseMood / spendMetabolic (metabolics_lose_*), shiftMetabolic (a signed
// delta), setMetabolic (metabolics_set_*: capped, through the doors) and forceMetabolic /
// topUpMetabolic (a raw set for dying, resurrecting, a new day, tutorial scenes and QA kits).
// Before this, 116 sites wrote pc.energy / pc.mood by hand with 7 different caps; the G608 #156
// bug (a gain capped at a flat 100 pushed a stat above 100 down) lived in 25 of them.
import { afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  forceMetabolic,
  gainMetabolic,
  setMetabolic,
  setMetabolicGainGate,
  setMetabolicLossGate,
  setMoodLossNotice,
  spendMetabolic,
  topUpMetabolic,
} from '../public/js/metabolics.js?v=48f784bf';
import { metabolicGate, normalizeHellState } from '../public/js/hell.js?v=d77f15ef';
import { applyDropResult } from '../public/js/drop-tables.js?v=1ed0b596';
import { performEmotionalBearAction, normalizeEmotionalBearState } from '../public/js/emotional-bear.js?v=1c88a46a';
import { createInventory, useItem } from '../public/js/inventory.js?v=6414dbdc';
import { loadContentCatalogsFromDir } from '../public/js/content-catalogs.js?v=c9b84764';
import { applySetFree } from '../public/js/animal-set-free.js?v=6fcd8355';
import { butterUpChicken } from '../public/js/animal-flattery.js?v=3374cf3a';
import { creditQuoinStat } from '../public/js/quoins.js?v=5abad2c7';
import { ITEM_VERBS, runItemVerb } from '../public/js/item-verbs.js?v=ecade42e';
import { reconcilePlayerProgression } from '../public/js/progression.js?v=05ff0260';

const here = dirname(fileURLToPath(import.meta.url));
const pub = join(here, '../public');

/** Every game script: game.js plus public/js. */
function gameScripts() {
  const out = [join(pub, 'game.js')];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith('.js')) out.push(full);
    }
  };
  walk(join(pub, 'js'));
  return out;
}

/** Drop comments so doc lines may still show the old shapes. */
const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, '')).replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

// The player's stats, under the names the game scripts give the player object.
const PC = String.raw`(?:\b(?:pc|player)|\bengine\??\.pc|\bctx\??\.pc|\bctx\.engine\??\.pc|\bengineRef\??\.pc|\bthis\.pc)`;
const ASSIGN = String.raw`(?:=(?!=)|\+=|-=|\*=|\/=|\?\?=|\|\|=|&&=|\+\+|--)`;
const WRITES = [
  // pc.energy = ..., engine.pc.mood += ..., ctx.pc.mood = Math.min(...)
  new RegExp(String.raw`${PC}\s*\.\s*(?:energy|mood)\s*${ASSIGN}`, 'g'),
  // ++pc.energy, --pc.mood
  new RegExp(String.raw`(?:\+\+|--)\s*${PC}\s*\.\s*(?:energy|mood)\b`, 'g'),
  // pc[stat] = ..., pc[q.type] = ... (the quoin and grant helpers wrote the stat by name)
  new RegExp(String.raw`${PC}\s*\[[^\]]+\]\s*${ASSIGN}`, 'g'),
  // Object.assign(engine.pc, { energy, mood }) (hell's metabolics effect)
  new RegExp(String.raw`Object\.assign\(\s*${PC}\s*,[^;]*\b(?:energy|mood)\b`, 'g'),
];
const OWNER = 'js/metabolics.js';

function offenders(text, rel = 'x.js') {
  const out = [];
  code(text).split('\n').forEach((line, i) => {
    for (const re of WRITES) for (const m of line.matchAll(re)) out.push(`${rel}:${i + 1} ${m[0]}`);
  });
  return out;
}

describe('G970: energy and mood change only through js/metabolics.js', () => {
  it('no game script writes pc.energy or pc.mood outside the stat API', () => {
    const found = [];
    for (const file of gameScripts()) {
      const rel = relative(pub, file).split('\\').join('/');
      if (rel === OWNER) continue;
      found.push(...offenders(readFileSync(file, 'utf8'), rel));
    }
    assert.deepEqual(found, [], 'use gainMetabolic / loseEnergy / loseMood / shiftMetabolic / setMetabolic / forceMetabolic from js/metabolics.js');
  });

  it('the scan catches the old shapes, and leaves other objects and reads alone', () => {
    const old = [
      "if (metabolicGain('mood').ok) pc.mood = Math.min(moodMax(pc), before + 2);",
      'pc.energy = Math.min(energyCap(), (pc.energy || 0) + eaten.energy);',
      'else pc[q.type] = Math.min(100, (pc[q.type] || 0) + q.amount);',
      'engine.pc.energy = Math.max(engine.pc.energy || 0, 900);',
      'ctx.pc.mood = Math.min(cap, before + ANTIDOTE_MOOD);',
      'ctx.engine.pc.energy = 60;',
      'player.mood = clampMood(before + 20);',
      'pc.energy += 5;',
      'pc.mood++;',
      'Object.assign(engine.pc, { mood: 0, energy: 0 });',
    ].join('\n');
    assert.equal(offenders(old).length, 10);
    const fine = [
      'effects.mood = pc.mood - before;',
      'const e = pc.energy === 0;',
      'if (pc.energy >= 10) go();',
      's.mood = clamp(s.mood, 0, 2);',
      "// pc.energy = 0 in a comment",
      'pc.xp = (pc.xp || 0) + 5;',
    ].join('\n');
    assert.deepEqual(offenders(fine), []);
  });
});

const gateFor = (hell, direction) => (stat) => {
  const g = metabolicGate(hell, stat, direction, Date.now());
  return g.allowed ? { ok: true } : { ok: false, msg: g.text };
};
const dead = () => normalizeHellState({ isDead: true });
const superPooped = () => normalizeHellState({ pooped: { kind: 'super_pooped', appliedAt: Date.now() - 1000, expiresAt: Date.now() + 3_600_000 } });

afterEach(() => {
  setMetabolicGainGate(null);
  setMetabolicLossGate(null);
  setMoodLossNotice(null);
});

describe('G970: the stat API', () => {
  it('setMetabolic is metabolics_set_*: capped at the tank, the change through the doors', () => {
    const pc = { energy: 40, mood: 150, energyMax: 160 };
    assert.equal(setMetabolic(pc, 'energy', 999), 120);
    assert.equal(pc.energy, 160);
    assert.equal(setMetabolic(pc, 'mood', 80), -70);
    assert.equal(pc.mood, 80);
    assert.equal(setMetabolic(pc, 'currants', 5), 0);
    setMetabolicGainGate(gateFor(superPooped(), 'gain'));
    setMetabolicLossGate(gateFor(superPooped(), 'loss'));
    assert.equal(setMetabolic(pc, 'energy', 10), -150, 'Super Pooped never refuses a loss');
    assert.equal(setMetabolic(pc, 'energy', 100), 0, 'nor lets energy in');
    assert.equal(setMetabolic(pc, 'mood', 100), 20, 'mood still lands');
    setMetabolicGainGate(gateFor(dead(), 'gain'));
    setMetabolicLossGate(gateFor(dead(), 'loss'));
    assert.equal(setMetabolic(pc, 'mood', 0), 0);
    assert.equal(setMetabolic(pc, 'mood', 160), 0);
    assert.deepEqual(pc, { energy: 10, mood: 100, energyMax: 160 });
  });

  it('setMetabolic sends a mood fall to the low-mood notice, like every loss', () => {
    const said = [];
    setMoodLossNotice((p) => said.push(p.mood));
    const pc = { energy: 50, mood: 90 };
    setMetabolic(pc, 'mood', 30);
    assert.deepEqual(said, [30]);
  });

  it('forceMetabolic writes past both doors, clamped to the tank unless overTank', () => {
    setMetabolicGainGate(gateFor(dead(), 'gain'));
    setMetabolicLossGate(gateFor(dead(), 'loss'));
    const pc = { energy: 30, mood: 30, energyMax: 120 };
    assert.equal(forceMetabolic(pc, 'energy', 0), -30);
    assert.equal(forceMetabolic(pc, 'mood', 500), 90);
    assert.equal(pc.mood, 120);
    assert.equal(forceMetabolic(pc, 'energy', -5), 0);
    assert.equal(forceMetabolic(pc, 'energy', 900, { overTank: true }), 900);
    assert.equal(forceMetabolic(pc, 'xp', 5), 0);
    assert.equal(pc.xp, undefined);
  });

  it('topUpMetabolic raises to a floor and never lowers', () => {
    const pc = { energy: 70, mood: 10 };
    assert.equal(topUpMetabolic(pc, 'energy', 60), 0);
    assert.equal(pc.energy, 70);
    assert.equal(topUpMetabolic(pc, 'mood', 60), 50);
    assert.equal(topUpMetabolic(pc, 'energy', 400, { overTank: true }), 330);
    assert.equal(pc.energy, 400);
  });

  it('spendMetabolic is loseEnergy / loseMood by name', () => {
    const pc = { energy: 5, mood: 5 };
    assert.equal(spendMetabolic(pc, 'energy', 9), 5);
    assert.equal(spendMetabolic(pc, 'mood', 2), 2);
    assert.equal(spendMetabolic(pc, 'currants', 2), 0);
    setMetabolicLossGate(gateFor(dead(), 'loss'));
    assert.equal(spendMetabolic(pc, 'mood', 2), 0);
    assert.deepEqual(pc, { energy: 0, mood: 3 });
  });

  it('gainMetabolic leaves a stat above the tank alone (#156)', () => {
    const pc = { energy: 180, mood: 140, energyMax: 100 };
    assert.equal(gainMetabolic(pc, 'energy', 10), 0);
    assert.equal(pc.energy, 180);
    assert.equal(gainMetabolic(pc, 'mood', 10), 0);
    assert.equal(pc.mood, 140);
  });
});

describe('G970: moved callers', () => {
  before(async () => {
    await loadContentCatalogsFromDir(join(pub, 'assets/content'));
  });

  it('a drop-table mood reaches the tank, not a flat 100 (inc_skill_packages.js 85: metabolics_add_mood)', () => {
    const pc = { energy: 50, mood: 95, energyMax: 160 };
    const { lines, landed } = applyDropResult({ items: [], favor: [], mood: 20, energy: 0 }, { inv: createInventory({}), pc });
    assert.equal(pc.mood, 115);
    assert.equal(landed.mood, 20);
    assert.ok(lines.includes('You got 20 mood!'));
  });

  it('a drop-table mood while dead gives 0 and still says so', () => {
    setMetabolicGainGate(gateFor(dead(), 'gain'));
    const pc = { energy: 50, mood: 50 };
    const { lines, landed } = applyDropResult({ items: [], favor: [], mood: 20, energy: 5 }, { inv: createInventory({}), pc });
    assert.deepEqual([pc.mood, pc.energy, landed.mood, landed.energy], [50, 50, 0, 0]);
    assert.ok(lines.includes('You got 0 mood!'));
  });

  it('the Emotional Bear hug: mood above 100 is no longer cut to 100 (emotional_bear.js 96 metabolics_add_mood)', () => {
    const pc = { energy: 50, mood: 140, energyMax: 160 };
    const state = normalizeEmotionalBearState({});
    const out = performEmotionalBearAction(state, pc, 'anthropomorphize', null, { dayKey: 'd1' });
    assert.equal(out.ok, true);
    assert.equal(pc.mood, 160);
    assert.equal(out.effects.mood, 20);
  });

  it('the Emotional Bear gives no mood while dead (inc_metabolics.js 79-86)', () => {
    setMetabolicGainGate(gateFor(dead(), 'gain'));
    const pc = { energy: 50, mood: 40 };
    const out = performEmotionalBearAction(normalizeEmotionalBearState({}), pc, 'anthropomorphize', null, { dayKey: 'd1' });
    assert.equal(out.ok, true);
    assert.equal(pc.mood, 40);
    assert.equal(out.effects.mood, 0);
  });

  // orange_juice.js drink_energy 15, drink_mood 20 (include/drink.js 66, 88: metabolics_add_*).
  it('a drink with energy above the tank leaves it there and shows no energy change (#156)', () => {
    const pc = { energy: 130, mood: 50, energyMax: 100 };
    const out = useItem(createInventory({ orange_juice: 1 }), pc, 'orange_juice');
    assert.equal(out.ok, true);
    assert.equal(pc.energy, 130);
    assert.equal(out.effects.energy, undefined);
    assert.equal(out.effects.mood, 20);
  });

  it('a drink still fills to the tank and reports what landed', () => {
    const pc = { energy: 95, mood: 90, energyMax: 100 };
    const out = useItem(createInventory({ orange_juice: 1 }), pc, 'orange_juice');
    assert.deepEqual([pc.energy, pc.mood, out.effects.energy, out.effects.mood], [100, 100, 5, 10]);
  });

  it('set free and butter up report the mood that landed', () => {
    const pc = { energy: 50, mood: 98, energyMax: 100 };
    assert.equal(applySetFree('npc_chicken', pc, 0).slugs.mood, 2);
    const pc2 = { energy: 50, mood: 96, energyMax: 100 };
    assert.equal(butterUpChicken({}, pc2).effects.mood, 4);
  });

  it('a Mustard plaster rise caps at the player tank, not a ctx cap that defaulted to 100 (mustard.js metabolics_add_energy)', () => {
    const mustard = ITEM_VERBS.find((v) => v.classTsid === 'mustard');
    const pc = { energy: 95, mood: 50, energyMax: 160 };
    const out = runItemVerb(mustard, pc);
    assert.equal(out.ok, true);
    assert.equal(pc.energy, 105);
    assert.equal(out.effects.energy, 10);
    const over = { energy: 150, mood: 50, energyMax: 100 };
    runItemVerb(mustard, over, { energyMax: 100 });
    assert.equal(over.energy, 150, 'never pushed down to the cap');
  });

  it('a quoin credit above the tank is left alone and says +0', () => {
    const pc = { energy: 150, mood: 10, energyMax: 100 };
    assert.equal(creditQuoinStat(pc, 'energy', 5), 0);
    assert.equal(pc.energy, 150);
    assert.equal(creditQuoinStat(pc, 'mood', 5), 5);
  });

  it('a level-up refills to the tank through the doors (inc_stats.js 363-370)', () => {
    setMetabolicGainGate(gateFor(superPooped(), 'gain'));
    const pc = { xp: 6085, level: 5, energy: 10, mood: 10, energyMax: 120, currants: 0 };
    const up = reconcilePlayerProgression(pc);
    assert.equal(up.leveledUp, true);
    assert.equal(pc.energy, 10, 'Super Pooped: no energy');
    assert.equal(pc.mood, 120);
    assert.equal(up.moodAdded, 110);
  });

});
