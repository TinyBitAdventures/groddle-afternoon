/**
 * Teleportation points, teleporting and Teleportation Scripts
 * (players/inc_teleportation.js, items/paper.js, items/teleportation_script.js).
 * Run: node --test tests/teleportation.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SCRIPT_CLASS,
  TELEPORT_TEXT,
  canCreateScript,
  canSetTarget,
  createScript,
  createTeleportState,
  listTargets,
  maxMapTeleports,
  maxTargets,
  reconcileScripts,
  rollTeleportDay,
  scriptLabel,
  setTarget,
  teleportCooldownSeconds,
  teleportEnergyCost,
  teleportToPoint,
  useScript,
} from '../public/js/teleportation.js?v=48e4e8de';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const T1 = ['meditativearts_1', 'teleportation_1'];
const T4 = ['teleportation_1', 'teleportation_2', 'teleportation_3', 'teleportation_4', 'penmanship_1'];
const MEADOW = { tsid: 'GLI2V0UN7RD1T2J', x: 900, y: 400, label: 'Hechey Track', hubId: '56', hubName: 'Groddle Forest' };
const XALANGA = { tsid: 'GXAL', x: 10, y: 20, label: 'Xalanga Street', hubId: '95', hubName: 'Xalanga' };

describe('rank tables', () => {
  it('matches get_energy_cost, get_max_targets, cooldown and map teleports', () => {
    const ranks = [1, 2, 3, 4, 5].map((n) => Array.from({ length: n }, (_, i) => `teleportation_${i + 1}`));
    assert.deepEqual(ranks.map((r) => teleportEnergyCost(r, 100)), [33, 25, 20, 15, 10]);
    assert.deepEqual(ranks.map((r) => maxTargets(r)), [1, 2, 3, 3, 3]);
    assert.deepEqual(ranks.map((r) => teleportCooldownSeconds(r)), [5, 5, 5, 5, 5]);
    assert.deepEqual(ranks.map((r) => maxMapTeleports(r)), [0, 0, 0, 1000, 1000]);
    assert.equal(teleportEnergyCost([], 100), null);
  });

  it('has recovered icons for the script, imbued script and quill', () => {
    for (const cls of [SCRIPT_CLASS, 'teleportation_script_imbued', 'quill', 'paper']) {
      assert.ok(existsSync(join(root, `assets/sprites/icons/${cls}.png`)), cls);
    }
  });
});

describe('teleportation points', () => {
  it('needs the skill, a savable place and a valid slot', () => {
    assert.equal(canSetTarget({}, 1, { learned: [] }).error, TELEPORT_TEXT.noSkill);
    assert.equal(canSetTarget({}, 1, { learned: T1, unsavable: true }).error, TELEPORT_TEXT.cantSave);
    assert.equal(canSetTarget({}, 2, { learned: T1 }).error, TELEPORT_TEXT.invalidId);
    assert.equal(canSetTarget({}, 1, { learned: T1, dead: true }).error, TELEPORT_TEXT.dead);
    assert.equal(canSetTarget({}, 1, { learned: T1 }).ok, true);
  });

  it('remembers the point and emits the set events (Xalanga flag too)', () => {
    const out = setTarget({}, 1, XALANGA, { learned: T1 });
    assert.equal(out.ok, true);
    assert.deepEqual(out.state.targets[1], XALANGA);
    assert.deepEqual(out.events.map((e) => e.counter), ['teleport_point_set:GXAL', 'teleport_point_set:xalanga']);
    assert.deepEqual(listTargets(out.state, T1), [{ id: 1, target: XALANGA }]);
  });

  it('teleports for 33 energy, then cools down for 5 s', () => {
    const set = setTarget({}, 1, MEADOW, { learned: T1 }).state;
    const ctx = { learned: T1, energy: 80, now: 1000, currentTsid: 'GOTHER', fromHubId: '63' };
    const out = teleportToPoint(set, 1, ctx);
    assert.equal(out.ok, true);
    assert.equal(out.energyCost, 33);
    assert.equal(out.state.cooldownUntil, 6000);
    assert.deepEqual(out.events.map((e) => e.counter), [
      'teleportation_self:plain',
      'teleported',
      'teleported_to:GLI2V0UN7RD1T2J',
    ]);
    const again = teleportToPoint(out.state, 1, { ...ctx, now: 3000, currentTsid: 'GOTHER2' });
    assert.equal(again.error, TELEPORT_TEXT.cooldown);
  });

  it('refuses without energy, from the same street, or to a missing point', () => {
    const set = setTarget({}, 1, MEADOW, { learned: T1 }).state;
    assert.equal(teleportToPoint(set, 1, { learned: T1, energy: 33, currentTsid: 'X' }).error, TELEPORT_TEXT.energy);
    assert.equal(teleportToPoint(set, 1, { learned: T1, energy: 90, currentTsid: MEADOW.tsid }).error, TELEPORT_TEXT.alreadyThere);
    assert.equal(teleportToPoint({}, 1, { learned: T1, energy: 90 }).error, TELEPORT_TEXT.noDestination);
    assert.equal(
      teleportToPoint(set, 1, { learned: T1, energy: 90, currentTsid: 'X', exists: () => false }).error,
      TELEPORT_TEXT.gone
    );
  });

  it('flags zone and Xalanga travel', () => {
    const set = setTarget({}, 1, { ...XALANGA }, { learned: T1 }).state;
    const out = teleportToPoint(set, 1, { learned: T1, energy: 90, currentTsid: 'X', fromHubId: '56' });
    assert.ok(out.events.some((e) => e.counter === 'teleported_to:xalanga'));
    const zone = setTarget({}, 1, { ...MEADOW, hubId: '92' }, { learned: T1 }).state;
    const z = teleportToPoint(zone, 1, { learned: T1, energy: 90, currentTsid: 'X', fromHubId: '63' });
    assert.ok(z.events.some((e) => e.counter === 'teleported_between_zones'));
  });

  it('resets the daily map counter at a new game day', () => {
    const s = rollTeleportDay({ dayKey: 'a', mapTeleportsToday: 4 }, 'b');
    assert.equal(s.mapTeleportsToday, 0);
    assert.equal(s.dayKey, 'b');
  });
});

describe('teleportation scripts', () => {
  it('needs Teleportation IV (hidden), Penpersonship, a Quill and Paper', () => {
    assert.equal(canCreateScript({}, { learned: T1 }).hidden, true);
    assert.equal(canCreateScript({}, { learned: ['teleportation_1', 'teleportation_4'] }).error, TELEPORT_TEXT.needPenmanship);
    assert.equal(canCreateScript({}, { learned: T4, paper: 1 }).error, TELEPORT_TEXT.needQuill);
    assert.equal(canCreateScript({}, { learned: T4, quillWorking: true }).error, TELEPORT_TEXT.needPaper);
    assert.equal(canCreateScript({}, { learned: T4, quillWorking: true, paper: 1 }).ok, true);
  });

  it('writes a one-way script to the current spot for 1 paper, 1 quill wear and 1 energy', () => {
    const out = createScript({}, MEADOW, { learned: T4, quillWorking: true, paper: 3, now: 5 });
    assert.equal(out.ok, true);
    assert.deepEqual(out.costs, { paper: 1, quillWear: 1, energy: 1 });
    assert.equal(out.script.title, 'Teleport to Hechey Track, Groddle Forest');
    assert.equal(scriptLabel(out.script), 'Teleportation Script to Hechey Track, Groddle Forest');
    assert.equal(out.message, TELEPORT_TEXT.scriptCreated);
  });

  it('uses Teleportation I energy, consumes the script and starts the cooldown', () => {
    const made = createScript({}, MEADOW, { learned: T4, quillWorking: true, paper: 1 });
    const out = useScript(made.state, made.script.id, { learned: T1, energy: 50, now: 100, currentTsid: 'X' });
    assert.equal(out.ok, true);
    assert.equal(out.energyCost, 33);
    assert.equal(out.state.scripts.length, 0);
    assert.equal(out.state.cooldownUntil, 5100);
    assert.equal(useScript(made.state, made.script.id, { learned: [] }).error, TELEPORT_TEXT.scriptSkill);
  });

  it('refunds 100 iMG when the destination has vanished', () => {
    const made = createScript({}, MEADOW, { learned: T4, quillWorking: true, paper: 1 });
    const out = useScript(made.state, made.script.id, { learned: T1, energy: 50, exists: () => false });
    assert.equal(out.vanished, true);
    assert.equal(out.refundImg, 100);
    assert.equal(out.state.scripts.length, 0);
  });

  it('keeps script destinations through a drop and pick up', () => {
    let s = createScript({}, MEADOW, { learned: T4, quillWorking: true, paper: 2 }).state;
    s = createScript(s, XALANGA, { learned: T4, quillWorking: true, paper: 1 }).state;
    const dropped = reconcileScripts(s, 1);
    assert.equal(dropped.state.scripts.length, 1);
    assert.equal(dropped.state.looseScripts.length, 1);
    const back = reconcileScripts(dropped.state, 2);
    assert.deepEqual(back.state.scripts.map((r) => r.destination.tsid), [MEADOW.tsid, XALANGA.tsid]);
    assert.equal(reconcileScripts(createTeleportState(), 1).unknown, 1);
  });
});
