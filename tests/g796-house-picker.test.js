/**
 * G796 (Austin 2026-11-22: build all ten, free, move saves onto the originals): the house on the
 * home street is Glitch's furniture_chassis, one of ten houses with a choice per part, from the
 * CC0 SWFs (tools/house-art/build.mjs), customized with the house's Customize verb
 * (furniture_chassis.js verbs.customize; the client's ChassisManager / ConfiggerUI), free.
 * This file: the Customize window, free (ui/house-picker.js, the door's customize verb, Classic).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultHouseConfig } from '../public/js/home-house.js?v=3c88c47c';
import { createHomeState, setHomeHouse } from '../public/js/homes.js?v=dca6b2cd';
import { homesFeature } from '../public/js/features/homes-feature.js?v=cbae6b43';
import { HOUSE_PICKER_TEXT } from '../public/js/ui/house-picker.js?v=20aaba5c';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

describe('the Customize window', () => {
  it('every house and part is free: changing it takes nothing (Glitch sold six for credits)', () => {
    const state = createHomeState({ owned: true, style: 'meadow' });
    const r = setHomeHouse(state, { chassis: 'whimsy', config: { top: 4 }, facingRight: true });
    assert.equal(r.ok, true);
    assert.deepEqual(state.house, { chassis: 'whimsy', config: { ...defaultHouseConfig('whimsy'), top: 4 }, facingRight: true });
    assert.match(HOUSE_PICKER_TEXT.note, /free/);
    assert.doesNotMatch(read('public/js/ui/house-picker.js'), /imagination|currants|credits:/);
    const inv = JSON.parse(read('tools/inventions/inventions.json')).entries;
    assert.ok(inv.some((e) => e.id === 'house-styles-free'));
  });

  it('the house door offers customize on your own home street only', () => {
    const verbs = [{ id: 'enter_house', label: 'enter house', sort: 10 }];
    const away = { homeContext: () => ({ inHome: false }) };
    assert.equal(homesFeature.decorateVerbs({ classId: 'home_door', state: { room: 'street' } }, verbs, away), null);
    assert.equal(homesFeature.decorateVerbs({ classId: 'npc_mailbox', state: {} }, verbs, away), null);
    assert.equal(homesFeature.runVerbOverride({ classId: 'home_door' }, 'enter_house', away), null);
  });

  it('has a Classic look under the Classic root, with no original-game name in it', () => {
    const css = read('public/css/classic.css');
    assert.match(css, /:root\[data-ui="classic"\] \.house-picker \.hp-card \{/);
    assert.match(css, /:root\[data-ui="classic"\] \.house-picker \.hp-rows \{/);
    assert.doesNotMatch(css, /Glitch/);
  });
});

// G1178 (#625): on a phone the window covered the whole screen upright, so the house was hidden
// while you changed it. Glitch docked its configger and fitted the viewport into the room left
// (ChassisManager.as scaleVP 189-247); the phone now docks the window and fits the street beside it.
describe('the Customize window on a phone (G1178)', () => {
  it('docks as a sheet along the bottom upright and a column at the left sideways', async () => {
    const { housePickerDockOf } = await import('../public/js/ui/house-picker.js?v=20aaba5c');
    const rootRect = { left: 0, top: 0, right: 402, bottom: 812, width: 402, height: 812 };
    assert.deepEqual(housePickerDockOf({ left: 0, top: 455, right: 402, bottom: 812, width: 402, height: 357 }, rootRect, true), { side: 'bottom', css: 357 });
    const wide = { left: 0, top: 0, right: 812, bottom: 402, width: 812, height: 402 };
    assert.deepEqual(housePickerDockOf({ left: 4, top: 48, right: 304, bottom: 398, width: 300, height: 350 }, wide, false), { side: 'left', css: 304 });
    assert.equal(housePickerDockOf({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }, rootRect, true), null, 'not laid out');
  });

  it('the street fits the room the sheet leaves, the whole house in it, for every house', async () => {
    const { stageFor, stageRoomBeside } = await import('../public/js/location-view.js?v=b178fe66');
    const { HOUSE_HEADROOM, HOUSE_STYLE_IDS, houseFitViewH, houseLot } = await import('../public/js/home-house.js?v=3c88c47c');
    assert.deepEqual(stageRoomBeside(402, 812, null), { width: 402, height: 812, left: 0 });
    assert.deepEqual(stageRoomBeside(402, 812, { side: 'bottom', css: 357 }), { width: 402, height: 455, left: 0 });
    assert.deepEqual(stageRoomBeside(812, 402, { side: 'left', css: 304 }), { width: 508, height: 402, left: 304 });
    for (const [W, H, dock] of [[402, 812, { side: 'bottom', css: 357 }], [390, 844, { side: 'bottom', css: 371 }], [812, 402, { side: 'left', css: 304 }], [844, 390, { side: 'left', css: 304 }]]) {
      const room = stageRoomBeside(W, H, dock);
      for (const id of HOUSE_STYLE_IDS) {
        const lot = houseLot(id);
        const fitViewH = houseFitViewH(id, null, true, { groundY: 870, worldH: 972 });
        const s = stageFor({ width: room.width, height: room.height, packReserve: 132, sceneWidth: 3000, sceneHeight: 972, phone: true, fitViewH });
        assert.ok(s.cssWidth <= room.width + 0.5 && s.cssHeight <= room.height + 0.5, `${W}x${H} ${id}: the canvas stays beside the sheet`);
        assert.ok(s.viewW >= lot.bounds.r - lot.bounds.l, `${W}x${H} ${id}: the house's width shows (${s.viewW})`);
        // The house and its soil; the headroom over it may go on a short sideways phone, where the
        // fit stops at LANDSCAPE_PHONE_FIT_MIN_SHARE (Austin 2026-11-22: cap it).
        const house = fitViewH - HOUSE_HEADROOM;
        assert.ok(s.viewH >= house, `${W}x${H} ${id}: the house's height shows (${s.viewH} >= ${house})`);
      }
    }
  });

  it('the sheet, the styles row and the wiring', () => {
    const src = read('public/js/ui/house-picker.js');
    assert.match(src, /@media \(orientation:portrait\)\{\n:root\.touch-phone \.house-picker\{align-items:flex-end;padding:0\}/);
    assert.match(src, /:root\.touch-phone \.house-picker \.hp-card\{width:100%;height:min\(44dvh,380px\)/, 'a sheet of a fixed height: changing the house never moves the street');
    assert.match(src, /@media \(orientation:landscape\)\{[\s\S]*?:root\.touch-phone \.house-picker \.hp-card\{width:min\(300px,40vw\)/);
    assert.match(src, /:root\.touch-phone \.house-picker \.hp-styles\{display:flex;[^}]*overflow-x:auto/, 'the styles as one scrolling row');
    assert.match(src, /:has\(#house-picker:not\(\[hidden\]\)\) :is\(\.pack-bar,\.touch-controls\)\{visibility:hidden\}/);
    assert.match(src, /classList\.contains\('touch-phone'\)\) return null/, 'a computer never docks');
    assert.match(read('public/style.css'), /\.vog-overlay, \.hp-card[^)]*\) \{ max-width: calc\(100vw - 8px\); \}/, 'the sheet runs edge to edge');
    const homes = read('public/js/features/homes-feature.js');
    assert.match(homes, /onDock: \(dock\) => \{\n\s+houseDocked = Boolean\(dock\);\n\s+engine\.setStageDock\?\.\(dock\);/);
    const game = read('public/game.js');
    // #654: upright on the phone layout the room is then cut to the street's band (stageRoomInBand).
    assert.match(game, /const whole = stageRoomBeside\(root\.clientWidth, root\.clientHeight, dock\);\n.*\n\s+const room = stageRoomInBand\(whole, activeStageFrame\(\)\);\n\s+return \{\n\s+width: room\.width,\n\s+height: room\.height,/);
    assert.match(game, /function activeStageDock\(\) \{\n\s+return TOUCH_PHONE && PINNED_VIEW_H <= 0 && stageDock \? stageDock : null;/);
  });
});
