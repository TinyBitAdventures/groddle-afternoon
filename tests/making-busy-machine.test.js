/**
 * #247 side note (Dr Flavius): a machine job could start while a hand tool made something, but a
 * hand tool's job blocked a machine without a word. Glitch had the same rule and said why:
 * players/inc_making.js making_is_making (1736-1756) counts a hand tool's job, never a machine's;
 * making_check_allowed (86-87) greys the machine's Use with "You are making something else.";
 * making_make_known (325-327) refuses a make that still gets through with "You are already making
 * something". The remake now does both; the reverse order still works.
 * Run: node --test tests/making-busy-machine.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MAKING_BUSY } from '../public/js/make-tools.js?v=86877c3e';
import { machineTank, roomMachineVerbs } from '../public/js/machine-rooms.js?v=62bf02ed';
import { normalizeMachine, placedMachineVerbs } from '../public/js/home-machines.js?v=bc3d0938';

const root = join(import.meta.dirname, '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const gsjs = join(root, '..', 'glitch-GameServerJS');
let source = '';
try { source = readFileSync(join(gsjs, 'players/inc_making.js'), 'utf8'); } catch { source = ''; }

describe('a hand tool making something blocks a machine, as in Glitch (#247)', () => {
  it('uses the source\'s words', { skip: !source && 'no glitch-GameServerJS beside the repo' }, () => {
    assert.ok(source.includes(`return {state:'disabled', reason:"${MAKING_BUSY.verb}"};`), 'making_check_allowed');
    assert.ok(source.includes(`return this.apiSendMsg(make_fail_rsp(msg, 0, "${MAKING_BUSY.make}"));`), 'making_make_known');
  });

  it('greys a room machine\'s Use with the reason, after its own running lock', () => {
    const tank = machineTank(null, 'fuelmaker');
    const ctx = { learned: ['fuelmaking_1'], fuelCells: 0, now: 1000 };
    const free = roomMachineVerbs('fuelmaker', tank, ctx).find((v) => v.id === 'use');
    assert.equal(free.enabled, true);
    const busy = roomMachineVerbs('fuelmaker', tank, { ...ctx, making: true }).find((v) => v.id === 'use');
    assert.equal(busy.enabled, false);
    assert.equal(busy.reason, 'You are making something else.');
    // Ahead of a missing skill (making_check_allowed asks making_is_making first) ...
    assert.equal(roomMachineVerbs('fuelmaker', tank, { ...ctx, learned: [], making: true }).find((v) => v.id === 'use').reason, MAKING_BUSY.verb);
    // ... but the machine's own running job speaks first (fuelmaker.js use conditions 652-671).
    const job = { key: 'fuel_cell', readyAt: 61_000, user: 'solo' };
    assert.match(roomMachineVerbs('fuelmaker', tank, { ...ctx, job, user: 'solo', making: true }).find((v) => v.id === 'use').reason, /^The machine is still running\./);
    // Refuel is not making: it stays as it was.
    assert.deepEqual(roomMachineVerbs('fuelmaker', tank, { ...ctx, making: true }).find((v) => v.id === 'refuel'), roomMachineVerbs('fuelmaker', tank, ctx).find((v) => v.id === 'refuel'));
  });

  it('greys a placed machine\'s Use the same way', () => {
    const m = normalizeMachine({ id: 'hm-00000000000000aa', class: 'woodworker', rx: 0, fuel: 50, place: 'mr:forest', owner: 7, job: null, waiting: [] });
    const ctx = { learned: ['woodworking_1', 'engineering_1'], fuelCells: 1, now: 5, me: '7', mayTake: true };
    assert.equal(placedMachineVerbs(m, ctx).find((v) => v.id === 'use').enabled, true);
    const use = placedMachineVerbs(m, { ...ctx, making: true }).find((v) => v.id === 'use');
    assert.deepEqual([use.enabled, use.reason], [false, MAKING_BUSY.verb]);
  });

  it('the features ask the engine, and the game refuses a machine\'s Make while a hand tool makes', () => {
    for (const f of ['public/js/features/machine-rooms-feature.js', 'public/js/features/home-machines-feature.js']) {
      assert.match(read(f), /making: engine\.makingNow\?\.\(\) === true,/, f);
    }
    const game = read('public/game.js');
    // Only a hand tool's job or a Test Tube try counts: a machine's job never does, so a hand tool still starts while one runs.
    assert.match(game, /function makingNow\(\) \{\n\s*return Boolean\(activeCraftSession\) \|\| testTubePanel\.busy\(\);\n\}/);
    assert.match(game, /makingNow: \(\) => makingNow\(\),/);
    assert.match(game, /if \(typeof station\?\.tool === 'string' && makingNow\(\)\) \{\n\s*toast\(MAKING_BUSY\.make\);\n\s*return;\n\s*\}/);
    assert.match(game, /function runMakeCraft\(key, qty\) \{\n[^\n]*\n\s*if \(activeCraftSession\) \{\n\s*toast\(MAKING_BUSY\.make\);\n\s*return;\n\s*\}/);
    // A machine job closes the panel and sets no session (the reverse order).
    const run = game.slice(game.indexOf('function runMakeCraft('), game.indexOf('const timer = createCraftSession({', game.indexOf('function runMakeCraft(')));
    assert.match(run, /if \(opts\.station\.startJob\(\{ key, recipe, qty: n, waitMultiplier \}\) !== false\) closeMakePanel\(\);\n\s*return;/);
    assert.doesNotMatch(run, /activeCraftSession = /);
  });
});
