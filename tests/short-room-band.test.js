/**
 * G863 (#422): on an upright phone the band above a short room (game.js syncLocationViewHeight,
 * --stage-sky) and the canvas above the room's ceiling showed the page's sky blue in Tower floors and
 * quest rooms. A kit-built room gives the top of its backmost sky gradient (as a street's gradient top,
 * #348), or the narrow street's dark border with no sky; a Tower or upper house floor gives the timber
 * wall drawn outside the house; the canvas clears to the band's colour while there is a band.
 * Run: node --test tests/short-room-band.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHORT_SCENE_BAND, shortSceneBand } from '../public/js/location-view.js?v=f0a5f17d';
import { stageSkyColour } from '../public/js/street-render.js?v=e7e9dfda';
import { ROOM_NO_SKY, gradientTop, sceneRoot } from '../public/js/quest-rooms/kit.js?v=2c203c2c';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

class FakeContainer {
  constructor() { this.children = []; this.zIndex = 0; }
  addChild(...c) { this.children.push(...c); return c[0]; }
}
const PIXI = { Container: FakeContainer };

describe('G863: a short room\'s band colour', () => {
  it('a gradient\'s top is its lowest stop, as CSS', () => {
    assert.equal(gradientTop([[0, '#08150E'], [0.6, '#11271a'], [1, '#1a3523']]), '#08150e');
    assert.equal(gradientTop([[1, 0x102030], [0, 0x0a0b0c]]), '#0a0b0c');
    assert.equal(gradientTop([[0, 'rgba(0,0,0,0)']]), null);
    assert.equal(gradientTop([]), null);
    assert.equal(gradientTop(null), null);
  });

  it('a kit room gives its backmost sky\'s top, or the dark border with no sky', () => {
    const room = sceneRoot(PIXI, 1600, 760);
    assert.equal(room.skyTop, ROOM_NO_SKY);
    assert.equal(ROOM_NO_SKY, '#2a2a2a');
    assert.match(read('public/style.css'), /--c-grey-29: #2a2a2a;/);
    assert.match(read('public/style.css'), /#game-root\[data-stage-bordered\] \{ background: var\(--c-grey-29\); \}/);
    const front = room.layer(1, 5);
    front.addChild({ skyTop: '#ffffff' });
    const sky = room.layer(0, 0);
    sky.addChild({ skyTop: '#08150e' });
    assert.equal(room.skyTop, '#08150e', 'the backmost layer\'s gradient');
    assert.match(read('public/js/quest-rooms/kit.js'), /sprite\.skyTop = gradientTop\(stops\);/);
  });

  it('a Tower floor or upper house floor gives the timber wall drawn outside the house; the yard floor keeps its sky', () => {
    const homes = read('public/js/features/homes-feature.js');
    assert.match(homes, /const HOME_OUTSIDE_FILL = 0x2a2019;/);
    assert.match(homes, /outside\.rect\(x0, top, x1 - x0, bottom - top\)\.fill\(HOME_OUTSIDE_FILL\);/);
    assert.match(homes, /if \(!opts\.yard\) root\.skyTop = HOME_OUTSIDE_SKY;/);
  });

  it('game.js: the band and the canvas clear take the scene\'s colour while there is a band, the page blue otherwise', () => {
    const game = read('public/game.js');
    // SKY FILL (2026-11-24): a computer's narrow window takes shortSceneBand, an upright phone the scene's sky (stageBandColour).
    assert.match(game, /const sceneSky = band >= 1 \? stageBandColour\(sceneBandSky\(viewSceneLayer\), \{ phone: stageSkyFill \}\) : '';/);
    assert.match(read('public/js/location-view.js'), /if \(!phone\) return shortSceneBand\(css\);/);
    assert.match(game, /const colour = \/\^#\[0-9a-f\]\{6\}\$\/i\.test\(clear\) \? parseInt\(clear\.slice\(1\), 16\) : STAGE_CLEAR;/);
    assert.match(game, /const STAGE_CLEAR = 0x8ec8e8;/);
    assert.match(game, /background: STAGE_CLEAR,/);
    assert.match(read('public/style.css'), /--c-sky-80: #8ec8e8;/);
  });
});

describe('G880 (Austin 2026-11-16): the band is dark where a scene is shorter than a computer\'s narrow window (an upright phone carries the scene\'s sky on up since 2026-11-24, tests/g1167-sky-gradient-layer.test.js SKY FILL)', () => {
  const street = (tsid) => JSON.parse(read(`public/assets/streets/${tsid}.json`));
  it('a scene\'s own dark top keeps it; a light one (a street\'s sky, the yard, a sunny room) gets the dark border', () => {
    assert.equal(SHORT_SCENE_BAND, ROOM_NO_SKY);
    // G863's dark colours stay: a Tower floor's timber, the Back Alley's forest, a room with no sky.
    assert.equal(shortSceneBand('#2a2019'), '#2a2019');
    assert.equal(shortSceneBand('#08150E'), '#08150e');
    assert.equal(shortSceneBand(ROOM_NO_SKY), ROOM_NO_SKY);
    // A street's sky (#348's Froughtful Fen olive, the painted fallback), a light room sky, the yard (no colour).
    assert.equal(shortSceneBand(stageSkyColour(street('GTJ103U2KJK1BLG'))), SHORT_SCENE_BAND);
    assert.equal(shortSceneBand(stageSkyColour({})), SHORT_SCENE_BAND);
    assert.equal(shortSceneBand('#3d637a'), SHORT_SCENE_BAND, 'Operation Grow\'s sky top');
    assert.equal(shortSceneBand(undefined), SHORT_SCENE_BAND);
    assert.equal(shortSceneBand('rgba(0,0,0,0)'), SHORT_SCENE_BAND);
  });
});
