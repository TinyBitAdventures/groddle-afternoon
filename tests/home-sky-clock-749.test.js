/**
 * #749 at home (ours, Austin 2026-11-27): "It's currently night time and I'm seeing stars on public
 * streets but not my home street or inside my home in the backyard." The clock sky (js/sky-clock.js)
 * only ran on streets of a region (a numeric hubId); the home street (yours, hubId 'home', and a
 * visited one, hubId 'scene') and the back yard (inside the house scene) answered "not a street of
 * a region", so they kept their daytime sky under the night tint.
 *
 * Now the home street and the back yard follow the clock like a public street, from their own
 * style's sky (the home scenes carry `homePlace` and the style's sky as `gradient`); the house
 * rooms and Tower floors stay indoors. The yard's landscape keeps the clock's sky wherever it is
 * seen from (no flash at the door); standing in the room the world tint is the indoor one again,
 * eased over the atmosphere's 2 s. A style that paints its own night (its own stars, a dark sky)
 * keeps it, and NIGHT TINT off turns both off. Glitch drew every location's one gradient at every
 * hour (DrawUtil.drawVerticalGradientBG), homes too.
 * Run: node --test tests/home-sky-clock-749.test.js
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';

import { homePlaceAt, ownSkyReason, skyFollowsClock, skyLook } from '../public/js/sky-clock.js?v=dbd21266';
import { streetLook, yardLook } from '../public/js/home-styles.js?v=ec5d2f69';
import { BACK_YARD_GROUND_Y, STREET_GROUND_Y, drawLandscape } from '../public/js/features/homes-feature.js?v=86da0fc9';
import { Display, FakeEl, fakePixi } from './fake-scene.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(here, '..', rel), 'utf8');
const MEADOW = { top: 'a6effa', bottom: 'eafcfb' }; // the starting home street's sky

describe('#749 at home: which home places follow the clock', () => {
  it('your home street follows it (hubId home)', () => {
    const s = { tsid: 'RH_HOME_EXT', hubId: 'home', hubName: 'Homes', homePlace: 'street', gradient: MEADOW };
    assert.equal(ownSkyReason(s), null);
    assert.equal(skyFollowsClock(s), true);
  });

  it("another player's home street follows it too (a visit's scene, hubId scene)", () => {
    const s = { tsid: 'visit:P1:street', hubId: 'scene', hubName: 'Homes', homePlace: 'street', gradient: MEADOW };
    assert.equal(ownSkyReason(s), null);
  });

  it('the back yard follows it; the house rooms and Tower floors stay indoors', () => {
    assert.equal(ownSkyReason({ tsid: 'RH_HOME_INT', hubId: 'home', homePlace: 'yard', gradient: MEADOW }), null);
    assert.equal(ownSkyReason({ tsid: 'RH_HOME_INT', hubId: 'home', homePlace: 'room', gradient: MEADOW }), 'indoors');
    assert.equal(ownSkyReason({ tsid: 'RH_HOME_INT', hubId: 'home', homePlace: 'room' }), 'indoors');
  });

  it('where you stand in the house scene: left of the house is the yard, the rest the room', () => {
    assert.equal(homePlaceAt('yard', { houseX: 1400, x: 900 }), 'yard');
    assert.equal(homePlaceAt('yard', { houseX: 1400, x: 1400 }), 'room');
    assert.equal(homePlaceAt('yard', { houseX: 1400, x: 2100 }), 'room');
    assert.equal(homePlaceAt('yard', { houseX: undefined, x: 10 }), 'room', 'no house edge known: indoors');
    assert.equal(homePlaceAt('room', { houseX: 0, x: 400 }), 'room', 'a Tower floor');
    assert.equal(homePlaceAt('street', { x: 400 }), 'street');
    assert.equal(homePlaceAt(undefined, { x: 400 }), null, 'not a home');
  });

  it('a home style that paints its own night keeps it; NIGHT TINT off keeps every home sky', () => {
    // Midnight Glow and Toxic Moon: their own stars; a dark sky of its own by luma.
    assert.equal(skyFollowsClock({ hubId: 'home', homePlace: 'street', ownStars: true, gradient: { top: '1d1628', bottom: '2c2a58' } }), false);
    assert.equal(skyFollowsClock({ hubId: 'home', homePlace: 'yard', ownStars: true, gradient: { top: '1282a8', bottom: 'b9d9cc' } }), false);
    assert.equal(ownSkyReason({ hubId: 'home', homePlace: 'street', gradient: { top: '1c201e', bottom: '3a2c40' } }), 'a dark sky of its own');
    assert.equal(skyFollowsClock({ hubId: 'home', homePlace: 'street', gradient: MEADOW }, { on: false }), false);
  });

  it('a scene or home without a home place still keeps its sky (quest rooms, parties, races)', () => {
    assert.notEqual(ownSkyReason({ hubId: 'home', gradient: MEADOW }), null);
    assert.notEqual(ownSkyReason({ hubId: 'scene', gradient: MEADOW }), null);
  });
});

/** A fake Graphics that keeps its circles, so the stars can be counted. */
class DotGraphics extends Display {
  constructor() {
    super();
    this.dots = 0;
  }
  circle() {
    this.dots += 1;
    return this;
  }
  clear() {
    this.dots = 0;
    return this;
  }
  fill() {
    return this;
  }
}
const pixi = new Proxy({ Graphics: DotGraphics }, { get: (t, k) => (k in t ? t[k] : fakePixi[k]) });
const engine = { PIXI: pixi, renderer: null };

describe('#749 at home: the home landscape draws the clock sky', () => {
  const saved = {};
  before(() => {
    saved.document = globalThis.document;
    saved.PIXI = globalThis.PIXI;
    globalThis.PIXI = pixi;
    globalThis.document = { baseURI: 'https://groddle.localhost/', createElement: (t) => new FakeEl(t), head: new FakeEl('head'), body: new FakeEl('body'), getElementById: () => null, querySelector: () => null };
  });
  after(() => {
    globalThis.document = saved.document;
    globalThis.PIXI = saved.PIXI;
  });

  const draw = (look, groundY) => {
    const root = new pixi.Container();
    const land = drawLandscape(engine, root, look, 'test', { width: 2400, groundY, lift: groundY - 620 });
    return { root, land };
  };
  const farLayers = (root) => root.children.filter((c) => Number.isFinite(c.parallaxF) && c.zIndex > -99);
  const stars = (root) => root.children.find((c) => c.label === 'sky-stars');

  it("the home street's sky is its style's: top and bottom of the style's gradient", () => {
    const look = streetLook('meadow_ext_default_high');
    const { land } = draw(look, STREET_GROUND_Y);
    assert.deepEqual({ top: land.skyGradient.top, bottom: land.skyGradient.bottom }, MEADOW);
    assert.equal(land.skyGradient.ownStars, false);
    assert.equal(draw(streetLook('uralia_2a_high'), STREET_GROUND_Y).land.skyGradient.ownStars, true, 'Midnight Glow has its own stars');
  });

  it('at night: stars over the sky, the far layers tinted by depth, the sky fill colour dark', () => {
    const look = streetLook('meadow_ext_default_high');
    const { root, land } = draw(look, STREET_GROUND_Y);
    const dayTop = root.skyTop;
    const night = skyLook(land.skyGradient.top, land.skyGradient.bottom, 23.5);
    assert.equal(land.setSkyLook(night), true);
    assert.equal(land.setSkyLook(night), false, 'an unchanged look does nothing');
    land.update(0, 0, 1280, 800);
    const s = stars(root);
    assert.ok(s && s.visible && s.dots > 50, 'a star field');
    assert.equal(s.alpha, 1);
    const layers = farLayers(root);
    assert.ok(layers.length >= 2);
    assert.ok(layers.every((lc) => lc.tint !== 0xffffff), 'every far layer tinted');
    assert.notEqual(layers[0].tint, layers.at(-1).tint, 'the furthest the most');
    assert.notEqual(root.skyTop, dayTop);
    assert.equal(land.skyLookNow(), night);
  });

  it("by day the style's own sky comes back: no stars, layers untinted", () => {
    const { root, land } = draw(streetLook('meadow_ext_default_high'), STREET_GROUND_Y);
    const dayTop = root.skyTop;
    land.setSkyLook(skyLook(MEADOW.top, MEADOW.bottom, 23.5));
    land.setSkyLook(skyLook(MEADOW.top, MEADOW.bottom, 12.5));
    assert.equal(stars(root).visible, false);
    assert.ok(farLayers(root).every((lc) => lc.tint === 0xffffff));
    assert.equal(root.skyTop, dayTop);
    assert.equal(land.skyLookNow(), null);
  });

  it('the back yard draws it the same way, from its own style', () => {
    const look = yardLook('meadows_int_default__high');
    const { root, land } = draw(look, BACK_YARD_GROUND_Y);
    land.setSkyLook(skyLook(land.skyGradient.top, land.skyGradient.bottom, 23.5));
    land.update(0, 0, 400, 700);
    assert.ok(stars(root)?.visible);
  });
});

describe('#749 at home: the game hands the home scenes to the clock sky', () => {
  const game = read('public/game.js');
  const homes = read('public/js/features/homes-feature.js');
  it('the home street, the house with its yard and a Tower floor say which place they are', () => {
    const street = homes.slice(homes.indexOf('function streetBackground('), homes.indexOf('function streetFixtureAt('));
    assert.match(street, /root\.homePlace = 'street';/);
    assert.match(street, /root\.setSkyLook = land\.setSkyLook;/);
    const inside = homes.slice(homes.indexOf('function interiorBackground('), homes.indexOf('function interiorBackground(') + 4000);
    assert.match(inside, /root\.homePlace = opts\.yard \? 'yard' : 'room';/);
    assert.match(inside, /root\.setSkyLook = land\.setSkyLook;/);
  });
  it('your home and a visited one (enterScene) carry the place and the sky onto the street', () => {
    const home = game.slice(game.indexOf('async function renderHomeScene('), game.indexOf('async function renderHomeScene(') + 4000);
    assert.match(home, /\.\.\.homeSkyFields\(bgLayer\),/);
    assert.match(home, /applySkyClock\(\);/);
    const scene = game.slice(game.indexOf('  enterScene(scene) {'), game.indexOf('  enterScene(scene) {') + 3000);
    assert.match(scene, /\.\.\.homeSkyFields\(scene\.background\),/);
    assert.match(scene, /applySkyClock\(\);/);
  });
  it('in the house the world tint follows where you stand (the yard outdoors, the room indoors)', () => {
    const apply = game.slice(game.indexOf('function applySkyClock('), game.indexOf('const ATMOSPHERE_EASE_MS'));
    assert.match(apply, /homePlaceAt\(currentStreet\?\.homePlace, \{ houseX: view\.houseX, x: player\?\.x \}\)/);
    assert.match(apply, /skyClock\.place === place/);
  });
});
