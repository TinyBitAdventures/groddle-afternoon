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
import { loadContentCatalogsFromDir } from '../public/js/content-catalogs.js?v=10b118dd';
import { applyBuff, createBuffState, tickBuffs } from '../public/js/buffs.js?v=fd309a67';

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

  it('the game shows the boost, or says the tank was already full', () => {
    const game = readFileSync(join(pub, 'game.js'), 'utf8');
    const branch = game.slice(game.indexOf("} else if (event.classTsid === 'well_fed_energy') {"), game.indexOf("} else if (event.classTsid === 'hairball_flower' && event.effects?.energy) {"));
    assert.match(branch, /'Apple a Day gives its energy boost'/);
    assert.match(branch, /'Apple a Day ends, but your energy is already full\.'/);
    assert.match(branch, /floatText\(player\.x, player\.y - 76, `\+\$\{got\} energy`\)/);
  });
});
