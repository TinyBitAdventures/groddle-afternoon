/**
 * #722 (a player asked; ours, Austin 2026-11-26): the Map's Shortcuts home card has House and
 * Tower buttons beside its Home button. Glitch's map had no home buttons, only the /home, /house
 * and /tower chat commands (main.js doChatCommand), so the buttons run those commands' own checks
 * and travel (features/slash-commands-feature.js runSlashCommand), not a copy of them. House once
 * you have a home street (without one the card's button is "Get your home street"); Tower once the
 * Tower is built (the check /tower makes, slashContext towerBuilt).
 *
 * Run: node --test tests/map-home-shortcuts-722.test.js
 */
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAP_HOME_SHORTCUTS, mapHomeShortcuts, slashCommandsFeature } from '../public/js/features/slash-commands-feature.js?v=7d168307';
import { towerApi } from '../public/js/features/home-tower-feature.js?v=93b1bf27';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const part = (src, from, to) => src.slice(src.indexOf(from), src.indexOf(to, src.indexOf(from)));

function fakeEngine(over = {}) {
  const data = {};
  const log = [];
  const trips = [];
  return {
    data,
    log,
    trips,
    setData: (k, v) => { data[k] = v; },
    pushActivity: (t) => log.push(t),
    toast: () => {},
    save: () => {},
    param: () => null,
    homeContext: () => ({ inHome: false, room: 'street', owned: true }),
    whoIsHere: () => ['Ur'],
    acting: () => false,
    transientInstance: () => false,
    homeTravel: async (step) => { trips.push(step); return { ok: true }; },
    enter: async (tsid) => { trips.push(`enter:${tsid}`); },
    refreshHomeScene: async (opts) => { trips.push(`refresh:${opts?.arrive}`); return true; },
    ...over,
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  slashCommandsFeature._reset();
  towerApi.state().built = false;
  towerApi.clearFloor();
});

describe('#722 House and Tower on the Map\'s home card', () => {
  it('House once you have a home street, Tower only once the Tower is built (what /tower checks)', () => {
    const engine = fakeEngine();
    assert.deepEqual(MAP_HOME_SHORTCUTS.map((s) => s.command), ['/house', '/tower']);
    assert.deepEqual(mapHomeShortcuts(engine).map((s) => s.label), ['House']);
    assert.deepEqual(slashCommandsFeature.mapHomeShortcuts(engine).map((s) => s.command), ['/house']);
    towerApi.state().built = true;
    assert.deepEqual(mapHomeShortcuts(engine).map((s) => s.label), ['House', 'Tower']);
    for (const s of MAP_HOME_SHORTCUTS) assert.doesNotMatch(`${s.label} ${s.tip}`, /—/);
    // No home street yet: the card's own button is "Get your home street", so no House beside it.
    towerApi.state().built = false;
    const homeless = fakeEngine({ homeContext: () => ({ owned: false, inHome: false, room: 'street' }) });
    assert.deepEqual(mapHomeShortcuts(homeless), []);
  });

  it('House travels as /house does: away, into the house; from the tower, to the house', async () => {
    let home = { owned: true, inHome: false, room: 'street' };
    const engine = fakeEngine({ homeContext: () => home });
    assert.equal(slashCommandsFeature.mapHomeShortcut('/house', engine), true);
    await flush();
    assert.deepEqual(engine.trips, ['teleport-inside']);
    assert.equal(engine.data.slashLast, '/house:teleport-inside');
    towerApi.state().built = true;
    towerApi.state().floor = 0;
    home = { owned: true, inHome: true, room: 'interior' };
    slashCommandsFeature.mapHomeShortcut('/house', engine);
    await flush();
    assert.deepEqual(engine.trips.slice(-1), ['refresh:door']);
    // A button is not the typed command: the Butler's hints that teach /house and /tower stay.
    assert.deepEqual(slashCommandsFeature._state().used, { house: false, tower: false });
  });

  it('Tower travels as /tower does, and both stop where the commands stop', async () => {
    towerApi.state().built = true;
    const engine = fakeEngine();
    slashCommandsFeature.mapHomeShortcut('/tower', engine);
    await flush();
    await flush();
    assert.deepEqual(engine.trips, ['teleport', 'enter:RH_HOME_INT']);
    assert.equal(towerApi.currentFloor(), 0);
    // Busy, or in a quest instance: the commands' own refusals, no travel.
    const busy = fakeEngine({ acting: () => true });
    slashCommandsFeature.mapHomeShortcut('/house', busy);
    slashCommandsFeature.mapHomeShortcut('/tower', busy);
    assert.equal(busy.trips.length, 0);
    assert.equal(busy.log.length, 2);
    const away = fakeEngine({ transientInstance: () => true });
    slashCommandsFeature.mapHomeShortcut('/tower', away);
    assert.equal(away.trips.length, 0);
    assert.equal(away.data.slashLast, '/tower:say');
    // Only the card's two commands; anything else is not a shortcut.
    assert.equal(slashCommandsFeature.mapHomeShortcut('/leave', engine), null);
  });

  it('game.js draws them beside the Home button and runs them through the command feature', () => {
    const card = part(read('public/game.js'), 'function renderHomeMapCallout(panel) {', '\n}\n');
    assert.match(card, /features\.query\('mapHomeShortcuts', engine\)/);
    assert.match(card, /closeMap\(\);\s+features\.query\('mapHomeShortcut', shortcut\.command, engine\);/);
    assert.match(card, /actions\.className = 'map-home-actions';/);
    assert.doesNotMatch(card, /homeTravel|towerApi|goToFloor/, 'no travel of its own');
    // Buttons wrap on a phone rather than run off the card.
    const css = read('public/style.css');
    assert.match(css, /\n\.map-home-actions \{[^}]*flex-wrap: wrap;[^}]*margin-left: auto;/);
  });

  it('is in the Inventions list as ours', () => {
    const entry = JSON.parse(read('tools/inventions/inventions.json')).entries.find((e) => e.id === 'map-home-shortcuts');
    assert.ok(entry, 'map-home-shortcuts entry');
    assert.equal(entry.kind, 'UI');
    assert.equal(entry.status, 'kept');
    assert.match(entry.ruling, /#722/);
  });
});
