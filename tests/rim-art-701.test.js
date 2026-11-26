/**
 * Reports #701 and #702 (2026-11-25, live v0.73.0): on the home street the world blinked out or went
 * blank once the house was in reach or under the mouse. The house's target is a PIXI.Graphics hit
 * box (the house art paints its own door); v0.73.0's reach glow (#669) and the hover rim it made
 * visible again gave the rim's copies that Graphics' non-texture, Pixi threw mid-render with the
 * rim's filter pushed, and every later frame broke until a reload.
 * Reproduction: /play/?autostart=1&fresh=1&resetgame=1&questoffer=off&homedemo=home at 1453x805,
 * avatar beside the house: groddleQA.frameStageThrows() counted render throws; none now.
 * #703 (the same day): Helga's rim sat off her body in some animations; a vendor's states have their
 * own anchors and the rim copies took the anchor only when made.
 * #712 (the same day): rocks and Street Spirits never glowed: their targets are Containers, and only
 * a target that was itself a Sprite took a rim. rimArtParts gives a Container's art Sprites (never a
 * Graphics box, a hidden part, a shadow or a rim), each rimmed in its own holder.
 * Run: node --test tests/rim-art-701.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { rimArtParts, spriteHasRimArt } from '../public/js/enter-chooser.js?v=44aef7b2';

const ROOT = join(import.meta.dirname, '..');
const game = readFileSync(join(ROOT, 'public/game.js'), 'utf8');

class Container {
  constructor() { this.children = []; this.visible = true; }
  add(...kids) { for (const k of kids) { k.parent = this; this.children.push(k); } return this; }
}
class Sprite extends Container {
  constructor(texture) { super(); this.texture = texture; }
}
class AnimatedSprite extends Sprite {}
class Graphics extends Container {}
const EMPTY = { orig: { width: 1, height: 1 }, source: {} };
const PIXI = { Sprite, Graphics, Texture: { EMPTY } };
const art = () => ({ orig: { width: 40, height: 60 }, source: {} });

describe('#701/#702: only real sprite art takes the cyan rim', () => {
  it('a sprite or animated sprite with a texture does', () => {
    assert.equal(spriteHasRimArt(new Sprite(art()), PIXI), true);
    assert.equal(spriteHasRimArt(new AnimatedSprite(art()), PIXI), true);
  });

  it('a Graphics hit box, a plain container, an empty or destroyed texture and a destroyed sprite do not', () => {
    const g = new Graphics();
    g.texture = { source: {} }; // a texture-like value with no orig, as the house door's
    assert.equal(spriteHasRimArt(g, PIXI), false);
    assert.equal(spriteHasRimArt(new Container(), PIXI), false);
    assert.equal(spriteHasRimArt(new Sprite(EMPTY), PIXI), false);
    assert.equal(spriteHasRimArt(new Sprite({ ...art(), destroyed: true }), PIXI), false);
    assert.equal(spriteHasRimArt(new Sprite({ source: {} }), PIXI), false);
    const gone = new Sprite(art());
    gone.destroyed = true;
    assert.equal(spriteHasRimArt(gone, PIXI), false);
    assert.equal(spriteHasRimArt(null, PIXI), false);
  });

  it('game.js: every rim (hover, reach, signpost) asks first, and a rim whose art goes hides', () => {
    assert.match(game, /const rimArt = \(spr\) => spriteHasRimArt\(spr, PIXI\);/);
    // #712: the hover and reach rims trace rimArtParts (a Container's art Sprites, each one checked).
    assert.match(game, /const rimParts = \(target\) => rimArtParts\(target\?\.sprite, PIXI\);/);
    assert.match(game, /function addTargetRims\(target\) \{\s*return rimParts\(target\)\.map\(addSpriteRim\);/);
    assert.match(game, /target\._hoverGlow = addTargetRims\(target\);/);
    assert.match(game, /\.filter\(\(t\) => rimParts\(t\)\.length > 0\);/);
    assert.doesNotMatch(game, /addSpriteRim\(t(arget)?\.sprite\)/, 'no rim straight on a target\'s sprite');
    assert.match(game, /signpostGlowParts\(v\)\)\.filter\(rimArt\)/);
    assert.match(game, /if \(!src \|\| src\.destroyed \|\| !rimArt\(src\)\) \{\s*outline\.visible = false;/);
    assert.match(game, /new PIXI\.Sprite\(rimArt\(source\) \? source\.texture : PIXI\.Texture\.EMPTY\)/);
  });
});

describe('#712: a Container target\'s art takes the rim', () => {
  it('a Sprite target is its own art; a Graphics box, an empty container and nothing have none', () => {
    const spr = new Sprite(art());
    assert.deepEqual(rimArtParts(spr, PIXI), [spr]);
    assert.deepEqual(rimArtParts(new Graphics().add(new Sprite(art())), PIXI), []);
    assert.deepEqual(rimArtParts(new Container(), PIXI), []);
    assert.deepEqual(rimArtParts(null, PIXI), []);
    const g = new Container().add(new Graphics());
    assert.deepEqual(rimArtParts(g, PIXI), [], 'a new garden\'s bare bed (a Graphics in a Container)');
  });

  it('a rock\'s root gives its rockSprite; a Street Spirit gives its body, not its hidden stand-in or name', () => {
    const rock = new Sprite(art());
    assert.deepEqual(rimArtParts(new Container().add(rock), PIXI), [rock]);
    const body = new AnimatedSprite(art());
    const standIn = new Sprite(art());
    standIn.visible = false;
    const name = new Container(); // a Text: not a Sprite in Pixi 8
    assert.deepEqual(rimArtParts(new Container().add(body, standIn, name), PIXI), [body]);
  });

  it('nested art is found; shadows, rims, texture-less sprites and destroyed parts are not', () => {
    const post = new Sprite(art());
    post.label = 'sign-post';
    const arm = new Sprite(art());
    arm.label = 'sign-arm';
    const shadow = new Sprite(art());
    shadow.label = 'sign-shadow';
    const rim = new Container().add(new Sprite(art()));
    rim.label = 'hover-outline';
    const loading = new AnimatedSprite(EMPTY);
    const gone = new Sprite(art());
    gone.destroyed = true;
    const marker = new Container().add(new Container().add(shadow, rim, post, new Container().add(new Graphics(), arm), loading, gone));
    assert.deepEqual(rimArtParts(marker, PIXI), [post, arm]);
  });

  it('a hit box names its art (rimArt), checked like any other', () => {
    const piece = new Sprite(art());
    const box = new Container().add(new Graphics());
    box.rimArt = () => piece;
    assert.deepEqual(rimArtParts(box, PIXI), [piece]);
    box.rimArt = () => null;
    assert.deepEqual(rimArtParts(box, PIXI), []);
    box.rimArt = () => new Graphics();
    assert.deepEqual(rimArtParts(box, PIXI), []);
    box.rimArt = () => { throw new Error('scene gone'); };
    assert.deepEqual(rimArtParts(box, PIXI), []);
  });

  it('game.js: a part\'s rim sits in the part\'s own holder just below it, out of the holder\'s bounds', () => {
    assert.match(game, /if \(holder && holder !== entityLayer\) \{\s*outline\._zGap = 0;\s*holder\.addChildAt\(outline, holder\.getChildIndex\(spr\)\);/);
    assert.match(game, /outline\.measurable = false;/);
    assert.match(game, /outline\.zIndex = \(Number\(src\.zIndex\) \|\| 0\) - \(outline\._zGap \?\? 1\);/);
  });
});

describe('#703: the rim follows a vendor\'s anchor from state to state', () => {
  it('each vendor state has its own anchor, so the copies take it at every sync, not only when made', () => {
    const feature = readFileSync(join(ROOT, 'public/js/features/vendor-npcs-feature.js'), 'utf8');
    assert.match(feature, /const anchor = vendorAnchor\(npc\.classTsid, state\);\s*npc\.sprite\.anchor\.set\(anchor\.x, anchor\.y\);/);
    assert.match(game, /if \(ax != null && \(s\.anchor\.x !== ax \|\| s\.anchor\.y !== ay\)\) s\.anchor\.set\(ax, ay\);/);
  });
});
