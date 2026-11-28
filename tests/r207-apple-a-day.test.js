/**
 * Report #207: Apple a Day says "An additional energy boost at the end". In Glitch it lasted 30 s
 * with one tick at 30 s, and that tick added 5 energy (catalog_buffs.js 2816-2832). Ours gave the
 * energy but showed nothing; the tick now floats "+5 energy" and says so in Activity.
 * Run: node --test tests/r207-apple-a-day.test.js
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { before, describe, it } from 'node:test';
import { loadContentCatalogsFromDir } from '../public/js/content-catalogs.js?v=b6a173ae';
import { applyBuff, buffPhysics, createBuffState, hasBuff, listActiveBuffs, removeBuff, tickBuffs } from '../public/js/buffs.js?v=fc742885';

const pub = join(import.meta.dirname, '..', 'public');

before(async () => {
  await loadContentCatalogsFromDir(join(pub, 'assets/content'));
});

describe('report #207: Apple a Day', () => {
  it('gives 5 energy on its one tick, at the end, then fades', () => {
    const state = createBuffState();
    const pc = { energy: 50, mood: 50, energyMax: 100, moodMax: 100 };
    const t0 = 1_000_000;
    assert.equal(applyBuff(state, 'well_fed_energy', pc, t0).ok, true);
    assert.deepEqual(tickBuffs(state, pc, t0 + 29_000).filter((e) => e.type === 'tick'), [], 'nothing before the end');
    const events = tickBuffs(state, pc, t0 + 30_000);
    const tick = events.find((e) => e.type === 'tick' && e.classTsid === 'well_fed_energy');
    assert.ok(tick, 'the tick at 30 s');
    assert.equal(tick.effects.energy, 5);
    assert.equal(pc.energy, 55);
    assert.ok(events.some((e) => e.type === 'expired' && e.classTsid === 'well_fed_energy'), 'then it fades');
  });

  it('gives nothing past a full tank', () => {
    const state = createBuffState();
    const pc = { energy: 100, mood: 50, energyMax: 100, moodMax: 100 };
    applyBuff(state, 'well_fed_energy', pc, 0);
    const tick = tickBuffs(state, pc, 30_000).find((e) => e.type === 'tick');
    assert.ok(!tick.effects.energy, 'already full');
  });

  it('still lands when the frame reads the buffs first (the game runs buffPhysics every frame, tickBuffs every 24)', () => {
    // On main a reader (hasBuff, listActiveBuffs) at or after 30 s deleted the row silently, so
    // tickBuffs never saw the tick or the end: no +5, no "faded" (the player's "nothing happens").
    const state = createBuffState();
    const pc = { energy: 50, mood: 50, energyMax: 100, moodMax: 100 };
    applyBuff(state, 'well_fed_energy', pc, 0);
    buffPhysics(state, 30_010);
    assert.equal(hasBuff(state, 'well_fed_energy', 30_020), false, 'over at 30 s for the readers');
    assert.deepEqual(listActiveBuffs(state, 30_030), []);
    const events = tickBuffs(state, pc, 30_400);
    assert.equal(events.find((e) => e.type === 'tick' && e.classTsid === 'well_fed_energy')?.effects.energy, 5);
    assert.ok(events.some((e) => e.type === 'expired' && e.classTsid === 'well_fed_energy'), 'and it fades');
    assert.equal(pc.energy, 55);
  });

  it('a second apple restarts it: one +5, 30 s after the last (inc_buffs.js buffs_apply restart)', () => {
    const state = createBuffState();
    const pc = { energy: 50, mood: 50, energyMax: 100, moodMax: 100 };
    applyBuff(state, 'well_fed_energy', pc, 0);
    // buff-triggers restart(): remove, then apply (2 apples at once apply it once, apple.js 251-252).
    removeBuff(state, 'well_fed_energy', pc, 10_000);
    applyBuff(state, 'well_fed_energy', pc, 10_000);
    assert.deepEqual(tickBuffs(state, pc, 30_500).filter((e) => e.type === 'tick'), [], 'not at the first one\'s 30 s');
    hasBuff(state, 'well_fed_energy', 40_100);
    const ticks = tickBuffs(state, pc, 40_400).filter((e) => e.type === 'tick');
    assert.equal(ticks.length, 1);
    assert.equal(pc.energy, 55);
  });

  it('other ends survive a frame read too: Hungover on_remove, Smashed into Hungover', () => {
    const pc = { energy: 50, mood: 50, energyMax: 100, moodMax: 100 };
    const hung = createBuffState();
    const applied = applyBuff(hung, 'buff_hungover', pc, 0);
    const end = applied.buff.expiresAt;
    hasBuff(hung, 'buff_hungover', end + 10);
    const out = tickBuffs(hung, pc, end + 400).find((e) => e.type === 'expired' && e.classTsid === 'buff_hungover');
    assert.ok(out, 'Hungover fades');
    assert.equal(out.effects.mood, 10);
    assert.equal(out.effects.energy, 10);
    const smashed = createBuffState();
    const s0 = applyBuff(smashed, 'buff_smashed', pc, 0).buff.expiresAt;
    listActiveBuffs(smashed, s0 + 10);
    const follow = tickBuffs(smashed, pc, s0 + 400);
    assert.ok(follow.some((e) => e.type === 'activated' && e.classTsid === 'buff_hungover'), 'Smashed ends in Hungover');
  });

  it('the game shows the boost, or says the tank was already full', () => {
    const game = readFileSync(join(pub, 'game.js'), 'utf8');
    const branch = game.slice(game.indexOf("} else if (event.classTsid === 'well_fed_energy') {"), game.indexOf("} else if (event.classTsid === 'hairball_flower' && event.effects?.energy) {"));
    assert.match(branch, /'Apple a Day gives its energy boost'/);
    assert.match(branch, /'Apple a Day ends, but your energy is already full\.'/);
    assert.match(branch, /floatText\(player\.x, player\.y - 76, `\+\$\{got\} energy`\)/);
  });
});
