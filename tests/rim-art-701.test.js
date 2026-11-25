/**
 * Reports #701 and #702 (2026-11-25, live v0.73.0): on the home street the world blinked out or went
 * blank once the house was in reach or under the mouse. The house's target is a PIXI.Graphics hit
 * box (the house art paints its own door); v0.73.0's reach glow (#669) and the hover rim it made
 * visible again gave the rim's copies that Graphics' non-texture, Pixi threw mid-render with the
 * rim's filter pushed, and every later frame broke until a reload.
 * Reproduction: /play/?autostart=1&fresh=1&resetgame=1&questoffer=off&homedemo=home at 1453x805,
 * avatar beside the house: groddleQA.frameStageThrows() counted render throws; none now.
 * Run: node --test tests/rim-art-701.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spriteHasRimArt } from '../public/js/enter-chooser.js?v=38d401c2';

const ROOT = join(import.meta.dirname, '..');
const game = readFileSync(join(ROOT, 'public/game.js'), 'utf8');

class Container {}
class Sprite extends Container {
  constructor(texture) { super(); this.texture = texture; }
}
class AnimatedSprite extends Sprite {}
class Graphics extends Container {}
const EMPTY = { orig: { width: 1, height: 1 }, source: {} };
const PIXI = { Sprite, Texture: { EMPTY } };
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
    assert.match(game, /if \(rimArt\(target\.sprite\)\) target\._hoverGlow = addSpriteRim\(target\.sprite\);/);
    assert.match(game, /\.filter\(\(t\) => rimArt\(t\?\.sprite\)\);/);
    assert.match(game, /signpostGlowParts\(v\)\)\.filter\(rimArt\)/);
    assert.match(game, /if \(!src \|\| src\.destroyed \|\| !rimArt\(src\)\) \{\s*outline\.visible = false;/);
    assert.match(game, /new PIXI\.Sprite\(rimArt\(source\) \? source\.texture : PIXI\.Texture\.EMPTY\)/);
  });
});
