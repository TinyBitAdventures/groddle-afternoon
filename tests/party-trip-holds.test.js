/**
 * G904 (Austin 2026-11-16: follow Glitch): a party teleporter from a quest room keeps the room.
 * Glitch made the teleporter wherever you stood (GSJS players/inc_party.js 479-520); the party space
 * is an instance, and leaving an instance for another instance kept it and your membership
 * (groups/instance.js player_exited_location 343-363, "If we have left for another instance, persist
 * this place"); leaving the party sent you back to the exact spot (players/inc_instances.js
 * instances_enter 71-111, instances_left 135-180). The remake holds the run (its clock and stuck
 * wait stop while away), parks the room's scene whole, saves the held run so a reload at the party
 * keeps it, and puts you back on the spot you left.
 * Run: node --test tests/party-trip-holds.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createQuestInstance,
  heldRunSave,
  holdQuestInstance,
  normalizeInstanceSave,
  plainRoomData,
  resumeQuestInstance,
  runFromHeld,
  setRunFlag,
  stepQuestInstance,
  stuckPromptDue,
} from '../public/js/quest-instance.js?v=15090adc';
import { normalizePartyRecord } from '../public/js/party-spaces.js?v=4e1ca2a5';
import { partySpacesFeature, partyTeleporterSpot } from '../public/js/features/party-spaces-feature.js?v=cdcffabd';
import { questInstancesFeature } from '../public/js/features/quest-instances-feature.js?v=5306f321';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GSJS = join(ROOT, '../glitch-GameServerJS');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const MOON = 'GDOBUP8IR8E2IPH';
const OUTSIDE = { tsid: 'GLI2V0UN7RD1T2J', x: 3082, y: 192 };

describe('the teleporter opens in a room that holds you (partyTeleporterSpot)', () => {
  it('hold and forfeit plans open it in an instance; an instance nobody holds still refuses', () => {
    assert.equal(partyTeleporterSpot({ transient: true, plan: 'hold' }), 'hold');
    assert.equal(partyTeleporterSpot({ transient: true, plan: 'forfeit' }), 'forfeit');
    assert.equal(partyTeleporterSpot({ transient: true, plan: '' }), '');
    assert.equal(partyTeleporterSpot({ transient: true }), '');
    assert.equal(partyTeleporterSpot({ plan: 'hold' }), 'world', 'a street is a street');
  });

  it('a quest room with a run open answers hold; the Pack activates there', () => {
    partySpacesFeature.restore({});
    const engine = {
      streetTsid: 'QI_LIGHT_PERSPECTIVE_MAIN',
      transientInstance: () => true,
      homeContext: () => ({ inHome: false }),
      inScene: () => true,
      streetExists: () => true,
      travelGate: () => ({ ok: false, msg: 'Find the exit, or use Leave.' }),
      param: () => null,
      query: (hook, action) => (hook === 'partyTrip' && action === 'plan' ? { kind: 'hold', label: 'Walk Toward the Light' } : null),
    };
    const verb = partySpacesFeature.packVerbs('party_pack_taster_aquarius', engine)[0];
    assert.equal(verb.enabled, true, 'the room keeps its own travel rule; the party is not refused by it');
    assert.equal(partySpacesFeature.packVerbs('party_pack_taster_aquarius', { ...engine, query: () => null })[0].enabled, false, 'no owner, no teleporter');
  });

  it('a quest room answers hold only while a run is open', () => {
    questInstancesFeature.restore({});
    assert.equal(questInstancesFeature.partyTrip('plan', {}), null);
    assert.equal(questInstancesFeature.partyTrip('resume', {}, { hold: 'puzzles' }), null, 'someone else\'s hold');
    assert.equal(questInstancesFeature.partyTrip('inside', {}), null, 'the party answers that');
  });
});

describe('the held run (js/quest-instance.js)', () => {
  it('its clock and the "Are you stuck?" wait stop while away and carry on after', () => {
    const t0 = 1_000_000;
    const run = createQuestInstance({ questId: 'mental_block', roomId: 'mental_block', now: t0, durationMs: 60_000, exitPromptMs: 30_000 });
    assert.equal(holdQuestInstance(run, t0 + 10_000), true);
    assert.equal(holdQuestInstance(run, t0 + 11_000), false, 'once');
    // Ten minutes at the party: nothing expires, nothing asks.
    assert.equal(resumeQuestInstance(run, t0 + 610_000), 600_000);
    assert.equal(run.expiresAt, t0 + 660_000);
    assert.equal(run.stuckAt, t0 + 630_000);
    assert.equal(stepQuestInstance(run, t0 + 650_000).expired, false, '50 s left as when you left');
    assert.equal(stuckPromptDue(run, t0 + 629_000), false);
    assert.equal(stuckPromptDue(run, t0 + 631_000), true);
  });

  it('saved whole and back: stage, status, flags, time left, the spot and the room\'s plain state', () => {
    const t0 = 2_000_000;
    const run = createQuestInstance({ questId: 'puzzle_level_light_perspective', roomId: 'light_perspective', now: t0, durationMs: 120_000, returnTo: OUTSIDE, stage: 'main' });
    setRunFlag(run, 'orb_1', t0 + 5);
    run.status = 'solved';
    holdQuestInstance(run, t0 + 20_000);
    const sprite = new (class Sprite {})();
    const saved = JSON.parse(JSON.stringify(heldRunSave(run, { x: 524, y: 800, scale: 0.5, data: { picks: { a: 'red' }, sprite, fn: () => 1, falls: 2, _sceneTsid: 'QI_X' } })));
    assert.deepEqual(normalizeInstanceSave({ away: saved, questId: 'puzzle_level_light_perspective' }).away, saved);
    assert.equal(saved.leftMs, 100_000);
    assert.deepEqual(saved.data, { picks: { a: 'red' }, falls: 2 }, 'sprites, functions and _keys drop out');
    const back = runFromHeld(saved, t0 + 900_000);
    assert.equal(back.status, 'solved');
    assert.equal(back.stage, 'main');
    assert.deepEqual(back.flags, { orb_1: t0 + 5 });
    assert.deepEqual(back.returnTo, OUTSIDE);
    assert.equal(back.heldAt, t0 + 900_000, 'still held until the room is on screen');
    resumeQuestInstance(back, t0 + 905_000);
    assert.equal(back.expiresAt, t0 + 1_005_000, '100 s left');
  });

  it('plainRoomData keeps numbers, strings and plain objects only', () => {
    assert.deepEqual(plainRoomData({ a: 1, b: 'x', c: [1, { d: true }], e: new Map(), f: null, _g: 1 }), { a: 1, b: 'x', c: [1, { d: true }], f: null });
  });
});

describe('a reload at the party neither fails nor loses the run (quest-instances-feature)', () => {
  const held = () => {
    const run = createQuestInstance({ questId: 'mental_block', roomId: 'mental_block', now: 5_000, durationMs: 0, exitPromptMs: 300_000, returnTo: OUTSIDE });
    holdQuestInstance(run, 9_000);
    return JSON.parse(JSON.stringify(heldRunSave(run, { x: 700, y: 400 })));
  };

  it('restore keeps the held run: no retry, no failed mark', () => {
    questInstancesFeature.restore({ questId: 'mental_block', roomId: 'mental_block', returnTo: OUTSIDE, away: held(), memory: {} });
    const { save } = questInstancesFeature._state();
    assert.equal(save.away.questId, 'mental_block');
    assert.equal(save.retry.mental_block, undefined);
    assert.equal(save.memory.mental_block?.interrupted, undefined);
    assert.equal(questInstancesFeature.deadEndRun(), 'quest-room', 'no EXIT sign while the room waits');
    assert.equal(questInstancesFeature.holdQuestOffers(), true, 'no other room starts meanwhile');
  });

  it('while the party lives you stay in its space; once it has ended you go back toward the room', () => {
    questInstancesFeature.restore({ questId: 'mental_block', roomId: 'mental_block', returnTo: OUTSIDE, away: held(), memory: {} });
    const party = (inside) => ({ query: (hook, action) => (hook === 'partyTrip' && action === 'inside' ? inside : null) });
    assert.equal(questInstancesFeature.reloadLocation({ tsid: MOON }, party(true)), null);
    assert.deepEqual(questInstancesFeature.reloadLocation({ tsid: MOON }, party(false)), OUTSIDE);
    assert.ok(questInstancesFeature._state().save.away, 'kept: the room is entered again from there');
  });

  it('a run open without a hold is still failed by a reload (unchanged)', () => {
    questInstancesFeature.restore({ questId: 'mental_block', roomId: 'mental_block', returnTo: OUTSIDE, memory: {} });
    assert.ok(questInstancesFeature._state().save.retry.mental_block);
  });
});

describe('the way back from the party (party-spaces-feature)', () => {
  const live = (returnTo) => ({ party: { template: 'moon', startedAt: Date.now(), expiresAt: Date.now() + 600_000, inside: true, returnTo } });

  it('the record keeps who holds your place and the spot', () => {
    const rec = normalizePartyRecord(live({ ...OUTSIDE, label: 'Mental Block', hold: 'quest-instances', at: { x: 700.4, y: 400 } }));
    assert.deepEqual(rec.party.returnTo, { ...OUTSIDE, label: 'Mental Block', hold: 'quest-instances', at: { x: 700, y: 400 } });
    assert.equal(normalizePartyRecord(live({ ...OUTSIDE, hold: 'Bad Hold!' })).party.returnTo.hold, undefined);
  });

  it('the exit signpost and Leave party ask the holder to put you back; the street only if it cannot', async () => {
    partySpacesFeature.restore(live({ ...OUTSIDE, label: 'Mental Block', hold: 'quest-instances', at: { x: 700, y: 400 } }));
    const calls = [];
    const engine = {
      streetTsid: MOON,
      street: { label: 'Toxic Moon' },
      instanceHold: 'party',
      setData() {},
      save() {},
      enter: async (tsid, opts) => calls.push(['enter', tsid, opts.spawnX]),
      query: (hook, action, _engine, back) => {
        if (hook !== 'partyTrip' || action !== 'resume') return null;
        calls.push(['resume', back.hold, back.at.x]);
        return Promise.resolve(calls.length < 2);
      },
    };
    const gate = partySpacesFeature.travelGate(OUTSIDE.tsid, engine, { via: 'signpost' });
    assert.deepEqual(gate, { ok: false, msg: 'Back to Mental Block.' });
    await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual(calls, [['resume', 'quest-instances', 700]], 'the room, not the street');
    // A resume that fails (the quest left the log meanwhile) falls back to the street.
    partySpacesFeature.restore(live({ ...OUTSIDE, label: 'Mental Block', hold: 'quest-instances', at: { x: 700, y: 400 } }));
    partySpacesFeature.travelGate(OUTSIDE.tsid, engine, { via: 'signpost' });
    await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual(calls.slice(1), [['resume', 'quest-instances', 700], ['enter', OUTSIDE.tsid, OUTSIDE.x]]);
  });

  it('enterParty asks the room to depart before the visit rule, and the room parks its scene', () => {
    const src = read('public/js/features/party-spaces-feature.js');
    const enter = src.slice(src.indexOf('async function enterParty('), src.indexOf('async function leaveParty('));
    assert.ok(enter.indexOf("teleporterSpot(engine) === 'visit'") < enter.indexOf("'partyTrip', 'depart'"));
    const qi = read('public/js/features/quest-instances-feature.js');
    const depart = qi.slice(qi.indexOf('function departForParty('), qi.indexOf('async function resumeFromParty('));
    assert.match(depart, /engine\.parkScene\?\.\(\{ sprites: ctx\.sprites, targets: ctx\.targets \}\)/);
    assert.match(depart, /holdQuestInstance\(run\)/);
    const game = read('public/game.js');
    assert.match(game, /parkScene\(\{ sprites = \[\], targets = \[\] \} = \{\}\) \{/);
    assert.match(game, /resumeScene\(parked, spot = null\) \{\s*if \(!parked\?\.bg/);
  });

  it('Glitch kept the instance you left for another instance', { skip: !existsSync(GSJS) && 'no GSJS checkout' }, () => {
    const inst = readFileSync(join(GSJS, 'groups/instance.js'), 'utf8');
    assert.match(inst, /If we have left for another instance, persist this place\s*if \(!loc\.isInstance\(\) \|\| this\.instance_id == 'hell_one'\) this\.player_exit\(pc\);/);
    const ins = readFileSync(join(GSJS, 'players/inc_instances.js'), 'utf8');
    assert.match(ins, /this\.instances\.previously\[id\] = this\.get_simple_location\(\);/);
  });
});
