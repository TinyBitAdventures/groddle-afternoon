/**
 * rules-a buffs (2026-11-12): buffs across a logout, as players/inc_buffs.js did it:
 * buffs_logout freezes them (107-111); buffs_login moves every event of a buff that is
 * not is_offline on by the time away (40-70, 243-250), and fires the past ticks and the
 * end of the is_offline ones, with their on_remove (260-320).
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { loadContentCatalogsFromDir, getBuffCatalog } from '../public/js/content-catalogs.js?v=10b118dd';
import { applyBuff, createBuffState, resumeBuffsAfterAway, tickBuffs } from '../public/js/buffs.js?v=c499cf1a';
import { normalizeBuffSnapshot } from '../public/js/player-save.js?v=9aed8356';

const MIN = 60_000;

before(async () => {
  await loadContentCatalogsFromDir(new URL('../public/assets/content', import.meta.url).pathname);
});

describe('buffs across a logout (inc_buffs.js)', () => {
  it('the catalog flags: Hungover freezes, Smashed runs on', () => {
    assert.equal(getBuffCatalog().buff_hungover.isOffline, false);
    assert.equal(getBuffCatalog().buff_smashed.isOffline, true);
  });

  it('a frozen buff (Hungover) carries on where it stopped, its time away not counted', () => {
    const t0 = 1_000_000;
    const state = createBuffState();
    const pc = { energy: 50, mood: 50, energyMax: 100, moodMax: 100 };
    applyBuff(state, 'buff_hungover', pc, t0);
    tickBuffs(state, pc, t0 + 1 * MIN + 10);
    const left = state.active.buff_hungover.expiresAt - (t0 + 1 * MIN + 10);
    assert.equal(state.seenAt, t0 + 1 * MIN + 10);
    // Saved and loaded a day later.
    const back = createBuffState(normalizeBuffSnapshot(JSON.parse(JSON.stringify(state))));
    const login = t0 + 1 * MIN + 10 + 24 * 60 * MIN;
    const events = resumeBuffsAfterAway(back, pc, login);
    assert.deepEqual(events.filter((e) => e.type === 'expired'), []);
    assert.equal(back.active.buff_hungover.expiresAt - login, left);
  });

  it('an offline buff (Smashed) ran out while away: its ticks fire, then its end gives Hungover', () => {
    const t0 = 2_000_000;
    const state = createBuffState();
    const pc = { energy: 50, mood: 50, energyMax: 100, moodMax: 100 };
    applyBuff(state, 'buff_smashed', pc, t0);
    tickBuffs(state, pc, t0 + 1000);
    const login = t0 + 24 * 60 * MIN;
    const events = resumeBuffsAfterAway(state, pc, login);
    const ticks = events.filter((e) => e.type === 'tick' && e.classTsid === 'buff_smashed').length;
    const def = getBuffCatalog().buff_smashed;
    assert.equal(ticks, Math.floor(def.duration / def.tickDuration));
    assert.ok(events.some((e) => e.type === 'expired' && e.classTsid === 'buff_smashed'));
    assert.ok(events.some((e) => e.type === 'activated' && e.classTsid === 'buff_hungover'));
    assert.ok(state.active.buff_hungover);
  });

  it('a save from before seenAt moves nothing, and a runs-out still ends with its on_remove (Hungover +10/+10)', () => {
    const t0 = 3_000_000;
    const state = createBuffState();
    const pc = { energy: 50, mood: 50, energyMax: 100, moodMax: 100 };
    applyBuff(state, 'buff_hungover', pc, t0);
    delete state.seenAt;
    const before = { ...pc };
    const events = resumeBuffsAfterAway(state, pc, t0 + 60 * MIN);
    const end = events.find((e) => e.type === 'expired' && e.classTsid === 'buff_hungover');
    assert.ok(end);
    assert.deepEqual([end.effects.mood, end.effects.energy], [10, 10]);
    assert.ok(pc.mood >= before.mood - 10);
  });
});
