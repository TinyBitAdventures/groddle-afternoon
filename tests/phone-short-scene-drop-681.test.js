/**
 * #681 (the Greedy Street Spirit's room, an upright 402 x 874 iPhone): the top of the room sat under the
 * band. Upright the camera drops below a short scene's bottom so the feet clear the stick, Act and Jump
 * (game.js activeCameraWorldHeight, phoneFeetWorldHeight: camera top 305 world px down the room), but
 * phoneStage held the canvas at the scene's height, so the canvas began 305 px down the room.
 * Austin's ruling (2026-11-25): the canvas grows up by the camera's drop on a short scene, so the scene
 * shows whole and the band fills only above it; tall streets the camera scrolls stay as they were.
 * Browser check (WebKit 402 x 874): the room's canvas 417 -> 636 CSS px tall, camera top 305 -> 0, the
 * feet where they were; Hell Bar, a subway station, Firebog Deeps and Bulaa Clacks show their tops;
 * Downside Up (6000 px) and sideways (874 x 402) unchanged.
 * Run: node --test tests/phone-short-scene-drop-681.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MIN_PACK_HEIGHT, VIEW_HOLD_H, phoneSceneDrop, phoneStage, stageFor } from '../public/js/location-view.js?v=4c2530a9';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const game = readFileSync(join(root, 'public/game.js'), 'utf8');

const PHONE = { width: 402, height: 874, packReserve: MIN_PACK_HEIGHT };
// The Greedy Street Spirit's room: 600 px tall, its ground line at 581.
const ROOM = { ...PHONE, sceneWidth: 2000, sceneHeight: 600, groundLine: 581 };

describe('#681: a short scene upright shows whole', () => {
  it('the room\'s held canvas, the camera\'s drop and the canvas grown by it', () => {
    const held = phoneStage(ROOM);
    assert.equal(held.viewH, 449);
    assert.ok(held.cssHeight < 874, 'held under the window');
    // The camera's world height (the feet over the controls): 754, so its top dropped 305 down the room.
    const drop = phoneSceneDrop({ stage: held, height: 874, sceneBottom: 581, cameraWorldH: 754 });
    assert.equal(drop, 305);
    const grown = phoneStage({ ...ROOM, sceneDrop: drop });
    assert.equal(grown.scale, held.scale, 'the same scale: nothing drawn bigger or smaller');
    assert.equal(grown.viewW, held.viewW);
    assert.equal(grown.viewH, 754, 'the view reaches the camera\'s world height: its top is the room\'s');
    assert.ok(grown.cssHeight > held.cssHeight && grown.cssHeight < 874, 'taller, and a band still above it');
    assert.deepEqual(stageFor({ ...ROOM, phone: true, sceneDrop: drop }), grown, 'stageFor passes it on');
  });
  it('the canvas never grows past the window', () => {
    const grown = phoneStage({ ...ROOM, sceneDrop: 5000 });
    assert.equal(grown.cssHeight, 874);
    assert.ok(grown.viewH < 5000);
  });
  it('no drop, a tall street, sideways, a canvas that fills the window: nothing grows', () => {
    const held = phoneStage(ROOM);
    assert.equal(phoneSceneDrop({ stage: held, height: 874, sceneBottom: 581, cameraWorldH: 449 }), 0, 'the camera stays at the top');
    // A tall street the camera scrolls (Downside Up): the scene is taller than the canvas.
    const tall = phoneStage({ ...PHONE, sceneWidth: 3000, sceneHeight: 6000 });
    assert.equal(tall.viewH, VIEW_HOLD_H);
    assert.equal(phoneSceneDrop({ stage: tall, height: 874, sceneBottom: 6000, cameraWorldH: 6000 }), 0);
    // A street held to a shorter view than its height (HELD_VIEW_H): its bottom is past the canvas.
    const heldStreet = phoneStage({ ...PHONE, sceneWidth: 3000, sceneHeight: 800 });
    assert.equal(phoneSceneDrop({ stage: heldStreet, height: 874, sceneBottom: 1400, cameraWorldH: 1400 }), 0);
    const side = stageFor({ width: 874, height: 402, packReserve: MIN_PACK_HEIGHT, sceneWidth: 2000, sceneHeight: 600, phone: true });
    assert.equal(phoneSceneDrop({ stage: side, height: 402, sceneBottom: 600, cameraWorldH: 900 }), 0);
    const full = { ...held, cssHeight: 874 };
    assert.equal(phoneSceneDrop({ stage: full, height: 874, sceneBottom: 581, cameraWorldH: 900 }), 0);
    assert.equal(phoneSceneDrop({ stage: { ...held, phone: false }, height: 874, sceneBottom: 581, cameraWorldH: 900 }), 0, 'a computer');
  });
  it('game.js measures the drop for the stage it is about to take', () => {
    const body = game.slice(game.indexOf('function measureStage('), game.indexOf('function measureStage(') + 900);
    assert.match(body, /phoneSceneDrop\(\{/);
    assert.match(body, /sceneBottom: sceneBottomLine\(bgLayer\)/);
    assert.match(body, /activeCameraWorldHeight\(streetCameraAnchor\(\{ viewH: stage\.viewH, scale: stage\.scale \}\), \{ viewH: stage\.viewH, scale: stage\.scale \}\)/);
    assert.match(body, /stageFor\(\{ \.\.\.args, sceneDrop \}\)/);
    assert.match(game, /function activeCameraWorldHeight\(anchorRatio = 0\.75, \{ viewH = LOCATION_VIEW_H, scale = STAGE_SCALE \} = \{\}\)/);
  });
});
