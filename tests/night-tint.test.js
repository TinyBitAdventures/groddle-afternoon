/**
 * NIGHT TINT (POLISH 2026-10-30): the remake darkens the world with the game clock
 * (js/game-day.js daylightState); the 2012 client had no world tint. A device setting,
 * "Night tint", on by default, turns it off: no tint at any hour. It sits in the Menu's
 * Settings group under Zoom and in Preferences on `,`, and lives in localStorage like
 * the zoom.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  NIGHT_TINT_DEFAULT,
  NIGHT_TINT_LABEL,
  NIGHT_TINT_STORAGE_KEY,
  createNightTint,
  loadNightTint,
  parseNightTint,
  saveNightTint,
  worldTintOpacity,
} from '../public/js/night-tint.js?v=917a2caa';
import { daylightState, timestampForGameHour } from '../public/js/game-day.js?v=3095e05b';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

function memoryStorage(init = {}) {
  const map = new Map(Object.entries(init));
  return { map, getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) };
}

describe('the setting', () => {
  it('is on by default and reads only off as off', () => {
    assert.equal(NIGHT_TINT_DEFAULT, true);
    assert.equal(NIGHT_TINT_LABEL, 'Night tint');
    assert.equal(NIGHT_TINT_STORAGE_KEY, 'groddle.nightTint');
    assert.equal(parseNightTint(null), true);
    assert.equal(parseNightTint('junk'), true);
    assert.equal(parseNightTint('off'), false);
    assert.equal(parseNightTint('on'), true);
  });

  it('is stored per device, in try/catch', () => {
    const store = memoryStorage();
    assert.equal(loadNightTint(store), true);
    saveNightTint(false, store);
    assert.equal(store.map.get('groddle.nightTint'), 'off');
    assert.equal(loadNightTint(store), false);
    const broken = { getItem() { throw new Error('private window'); }, setItem() { throw new Error('private window'); } };
    assert.equal(loadNightTint(broken), true);
    assert.doesNotThrow(() => saveNightTint(false, broken));
    assert.equal(loadNightTint(null), true);
  });

  it('tells its listeners and remembers the choice', () => {
    const store = memoryStorage({ 'groddle.nightTint': 'off' });
    const tint = createNightTint({ win: null, storage: store });
    assert.equal(tint.get(), false);
    const seen = [];
    tint.onChange((on) => seen.push(on));
    tint.set(true);
    tint.set(true);
    assert.deepEqual(seen, [true], 'a change only');
    assert.equal(store.map.get('groddle.nightTint'), 'on');
  });

  it('off means no tint at any hour; own light never tints', () => {
    for (const hour of [0, 3, 6, 9, 12, 18, 20, 23]) {
      const light = daylightState(timestampForGameHour(Date.now(), hour, 30));
      assert.equal(worldTintOpacity(light.opacity, { on: false }), 0, `hour ${hour}`);
      assert.equal(worldTintOpacity(light.opacity, { on: true, ownLight: true }), 0, `hour ${hour}`);
      assert.equal(worldTintOpacity(light.opacity, { on: true }), light.opacity, `hour ${hour}: on is the current look`);
    }
    const night = daylightState(timestampForGameHour(Date.now(), 23, 30));
    assert.ok(worldTintOpacity(night.opacity) > 0.25, 'on by default: night is tinted');
  });
});

describe('the wiring', () => {
  it('game.js tints through the setting and redraws when it changes', () => {
    const game = read('public/game.js');
    assert.match(game, /import \{ nightTint, nightTintOn, onNightTintChange, worldTintOpacity \} from '\.\/js\/night-tint\.js\?v=[0-9a-f]+';/);
    assert.match(game, /onNightTintChange\(\(\) => updateDametimeChrome\(\)\);/);
    assert.match(game, /installTopBar\(document, \{[\s\S]{0,300}\n\s+nightTint,\n/);
  });

  it('the Menu has it under Zoom in Settings, and Preferences has it too', () => {
    const topbar = read('public/js/ui/topbar.js');
    assert.match(topbar, /const zoom = settings\.querySelector\('\[data-menu-control="zoom"\]'\);\n\s+if \(zoom\) zoom\.after\(row\);/);
    assert.match(topbar, /installNightTint\(doc, opts\.nightTint\);/);
    assert.match(topbar, /input\[type="checkbox"\]'\)\]\.filter/, 'arrow keys reach the switch in the Menu');
    const prefs = read('public/js/classic/classic-prefs.js');
    assert.match(prefs, /win\.append\(close, title, group, parts\.sizeRow, zoomBox, tintRow, (mapRow, )?foot\);/);
    assert.match(prefs, /parts\.tint\.addEventListener\('change', \(\) => setNightTint\(parts\.tint\.checked\)\);/);
  });
});
