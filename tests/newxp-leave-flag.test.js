/**
 * Ticket 26 (player report 2026-11-01): "On to the Big Time" did not complete when the player left
 * Gentle Island; they could not get off at first and left on a later load. The remake only counted the
 * 15 s on the one exit street the island picked, from that same arrival, so walking on, a reload or a
 * different way off never finished it. The original sets the flag 15 s after entering any location that
 * is not an instance or a home, alive, while the quest is todo (locations/location.js onPlayerEnter
 * 686-688), whatever the session; Gentle Island and the practice streets were per-player instances.
 */
import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

import { GENTLE_ISLAND, LEAVE_FLAG_DELAY_MS, leaveFlagStreet, normalizeNewxpSave } from '../public/js/newxp.js?v=12f236c7';
import { __newxpTest } from '../public/js/features/newxp-feature.js?v=d46b505c';
import { loadContentCatalogsFromDir } from '../public/js/content-catalogs.js?v=10b118dd';
import { acceptOffer } from '../public/js/quest-offers.js?v=89511e1e';
import { createQuestState } from '../public/js/quests.js?v=40c71a37';

const root = join(import.meta.dirname, '..');
const GRIDDLE_MEADOW = 'GLI32G3NUTD100I';
const HECHEY = 'GLI2V0UN7RD1T2J';

function stubEngine(extra = {}) {
  const questState = createQuestState();
  return {
    started: true,
    mode: 'multiplayer',
    data: {},
    activity: [],
    awards: [],
    inv: {},
    pc: { level: 3, xp: 0, currants: 0, energy: 50, mood: 50, energyMax: 100, moodMax: 100 },
    learnedSkills: [],
    questState,
    streetTsid: GRIDDLE_MEADOW,
    street: { label: 'Griddle Meadow' },
    param: () => null,
    setData(k, v) { this.data[k] = v; },
    inScene: () => false,
    transientInstance: () => false,
    homeContext: () => ({ inHome: false }),
    busy: () => false,
    save() {},
    refreshPack() {},
    updateHud() {},
    playSound() {},
    pushActivity(line) { this.activity.push(line); },
    async award(payload) { this.awards.push(payload); },
    query: () => null,
    ...extra,
  };
}

describe('On to the Big Time completes on any real street (ticket 26)', () => {
  before(async () => {
    await loadContentCatalogsFromDir(join(root, 'public/assets/content'));
  });
  beforeEach(() => {
    __newxpTest.resetLeave();
    // A later session: the tutorial's own state is over (or lost), the quest still todo.
    __newxpTest.save = normalizeNewxpSave({ status: 'done', stage: 'done', island: 'home_done' });
  });

  it('counts real streets only: not the island, the practice streets, scenes, homes, instances or the dead', () => {
    assert.equal(leaveFlagStreet({ tsid: GRIDDLE_MEADOW }), true);
    assert.equal(leaveFlagStreet({ tsid: HECHEY }), true);
    for (const tsid of Object.values(GENTLE_ISLAND)) assert.equal(leaveFlagStreet({ tsid }), false, tsid);
    assert.equal(leaveFlagStreet({ tsid: 'GUVCT29PSU53G9V' }), false, 'the Light Green Thumb practice street');
    assert.equal(leaveFlagStreet({ tsid: 'NEWXP_CLOUDS' }), false);
    assert.equal(leaveFlagStreet({ tsid: GRIDDLE_MEADOW, inHome: true }), false);
    assert.equal(leaveFlagStreet({ tsid: GRIDDLE_MEADOW, instance: true }), false);
    assert.equal(leaveFlagStreet({ tsid: GRIDDLE_MEADOW, dead: true }), false);
    assert.equal(leaveFlagStreet({}), false);
  });

  it('turns the quest in after 15 s on a street that is not the island\'s exit, in a later session', async () => {
    const engine = stubEngine();
    acceptOffer(engine.questState, 'leave_gentle_island', { inv: engine.inv });
    const t0 = 1_000_000;
    __newxpTest.leaveFlagTick(engine, t0);
    __newxpTest.leaveFlagTick(engine, t0 + LEAVE_FLAG_DELAY_MS - 1);
    assert.ok(engine.questState.active.leave_gentle_island, 'not before 15 s');
    __newxpTest.leaveFlagTick(engine, t0 + LEAVE_FLAG_DELAY_MS);
    await new Promise((r) => setTimeout(r, 0));
    assert.ok(engine.questState.completed.includes('leave_gentle_island'));
    assert.equal(engine.questState.active.leave_gentle_island, undefined);
    assert.equal(engine.awards.length, 1);
    assert.equal(engine.inv.greeter_twig, 1, 'the relic of the Island (leave_gentle_island.js onComplete_custom 59-75)');
    assert.ok(engine.activity.includes('Quest complete: On to the Big Time'));
    assert.equal(__newxpTest.leaveFinishing, false);
  });

  it('starts the 15 s over on the island and never counts while dead there or anywhere', async () => {
    const engine = stubEngine({ streetTsid: GENTLE_ISLAND.exit });
    acceptOffer(engine.questState, 'leave_gentle_island', { inv: engine.inv });
    __newxpTest.leaveFlagTick(engine, 0);
    __newxpTest.leaveFlagTick(engine, LEAVE_FLAG_DELAY_MS * 2);
    assert.ok(engine.questState.active.leave_gentle_island, 'the island never counts');
    engine.streetTsid = GRIDDLE_MEADOW;
    engine.query = (hook) => (hook === 'isDead' ? true : null);
    __newxpTest.leaveFlagTick(engine, LEAVE_FLAG_DELAY_MS * 3);
    __newxpTest.leaveFlagTick(engine, LEAVE_FLAG_DELAY_MS * 5);
    assert.ok(engine.questState.active.leave_gentle_island, 'not while dead');
    engine.query = () => null;
    __newxpTest.leaveFlagTick(engine, LEAVE_FLAG_DELAY_MS * 6);
    __newxpTest.leaveFlagTick(engine, LEAVE_FLAG_DELAY_MS * 7);
    await new Promise((r) => setTimeout(r, 0));
    assert.ok(engine.questState.completed.includes('leave_gentle_island'));
  });

  it('does nothing without the quest, and only once with it', async () => {
    const engine = stubEngine();
    __newxpTest.leaveFlagTick(engine, 0);
    __newxpTest.leaveFlagTick(engine, LEAVE_FLAG_DELAY_MS + 1);
    assert.equal(engine.awards.length, 0);
    assert.ok(!engine.questState.completed.includes('leave_gentle_island'));
    acceptOffer(engine.questState, 'leave_gentle_island', { inv: engine.inv });
    __newxpTest.leaveFlagTick(engine, 0);
    __newxpTest.leaveFlagTick(engine, LEAVE_FLAG_DELAY_MS);
    await new Promise((r) => setTimeout(r, 0));
    __newxpTest.leaveFlagTick(engine, LEAVE_FLAG_DELAY_MS * 2);
    __newxpTest.leaveFlagTick(engine, LEAVE_FLAG_DELAY_MS * 4);
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(engine.awards.length, 1);
  });
});
