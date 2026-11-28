/**
 * Report #757 (2026-11-27, desktop Firefox 2208x1120, Undermine Hollows GLIFINFQT8G13OU): "Are there
 * supposed to be two vendors on this street?" The Street Spirit's stand-in (game.js spawnVendorNpc:
 * the beehive vendor art and the vendor's name) is dressed in the real spirit once its art loads
 * (street-spirits-feature.js dress). dress read the stand-in as `const [body, label] = g.children`;
 * since #712 the reach or hover glow puts a cyan rim in the Container just before the body, so a
 * player in reach before the art loaded had the rim hidden and the beehive lifted over the spirit.
 * Glitch drew one Street Spirit (the street's map_stores makes it the Hardware vendor).
 * Reproduction: /play/?autostart=1&fresh=1&questoffer=off&streetdemo=GLIFINFQT8G13OU&streetx=330 at
 * 2208x1120 with a cold cache (arrival in reach, art late).
 * Run: node --test tests/r757-spirit-dress.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dress, streetSpiritsFeature } from '../public/js/features/street-spirits-feature.js?v=232351d1';
import { spiritCell, spiritForStreet } from '../public/js/street-spirits.js?v=8ff6ed59';
import { rimArtParts } from '../public/js/enter-chooser.js?v=b37c63e0';

const ROOT = join(import.meta.dirname, '..');
const game = readFileSync(join(ROOT, 'public/game.js'), 'utf8');

class Container {
  constructor() { this.children = []; this.visible = true; this.y = 0; this.label = ''; }
  addChild(k) { k.parent = this; this.children.push(k); return k; }
  addChildAt(k, i) { k.parent = this; this.children.splice(i, 0, k); return k; }
  getChildIndex(k) { return this.children.indexOf(k); }
}
class Sprite extends Container {
  constructor(texture) {
    super();
    this.texture = texture;
    this.anchor = { x: 0, y: 0, set(x, y) { this.x = x; this.y = y; } };
  }
}
class AnimatedSprite extends Sprite {
  constructor(textures) { super(textures[0]); }
}
class Text extends Container {}
const EMPTY = { orig: { width: 1, height: 1 }, source: {} };
const PIXI = { Container, Sprite, AnimatedSprite, Text, Texture: { EMPTY } };
const art = () => ({ orig: { width: 40, height: 60 }, source: {} });

/** The stand-in as game.js spawnVendorNpc builds it: the beehive body, then the name at -124. */
function standIn() {
  const g = new Container();
  const body = g.addChild(new Sprite(art()));
  body.label = 'vendor-loading-body';
  const label = g.addChild(new Text());
  label.label = 'vendor-name';
  label.y = -124;
  return { g, body, label };
}
/** A glow rim as game.js addSpriteRim puts one: in the part's holder, just before it. */
function rim(part) {
  const r = new Container();
  r.label = 'hover-outline';
  r._outlineSource = part;
  part.parent.addChildAt(r, part.parent.getChildIndex(part));
  return r;
}

const pick = spiritForStreet({ tsid: 'GLIFINFQT8G13OU' });
const engine = { PIXI, setData() {}, param: () => '' };
// The feature's sheet loader (nothing is fetched: the idle frames are not there, as before they load).
streetSpiritsFeature.init(engine);

describe('#757: a Street Spirit glowing before its art loads is dressed as one spirit', () => {
  it('the stand-in hides, the real spirit shows, the name lifts, no beehive left over it', () => {
    const { g, body, label } = standIn();
    const glow = rim(body);
    assert.equal(g.children[0], glow, 'the rim sits first, as in the report');
    const target = { sprite: g, state: {} };
    const s = dress(engine, target, pick.variant, pick.look);
    assert.equal(body.visible, false, 'the beehive stand-in is hidden');
    assert.equal(s.sprite.parent, g);
    assert.notEqual(s.sprite.visible, false, 'the real spirit shows');
    assert.equal(label.y, -spiritCell(pick.variant, pick.look).crop.h - 8, 'the name sits over the spirit');
    const shown = g.children.filter((c) => c.visible !== false && c instanceof Sprite);
    assert.deepEqual(shown, [s.sprite], 'one spirit drawn, no stray beehive');
  });

  it('a stand-in with no rim dresses the same', () => {
    const { g, body, label } = standIn();
    const s = dress(engine, { sprite: g, state: {} }, pick.variant, pick.look);
    assert.equal(body.visible, false);
    assert.equal(label.y, -spiritCell(pick.variant, pick.look).crop.h - 8);
    assert.equal(g.children[0], s.sprite);
  });

  it('the rim made on the stand-in is stale after dressing and is made again on the spirit', async () => {
    const { rimsTraceParts } = await import('../public/js/enter-chooser.js?v=b37c63e0');
    assert.equal(typeof rimsTraceParts, 'function');
    const { g, body } = standIn();
    const glow = rim(body);
    assert.equal(rimsTraceParts([glow], rimArtParts(g, PIXI)), true, 'before dressing the rim traces the stand-in');
    const s = dress(engine, { sprite: g, state: {} }, pick.variant, pick.look);
    s.sprite.texture = art(); // the idle frames arrive
    const parts = rimArtParts(g, PIXI);
    assert.deepEqual(parts, [s.sprite], 'the spirit is what glows now, never the hidden stand-in');
    assert.equal(rimsTraceParts([glow], parts), false, 'the old rim is stale');
    const again = rim(parts[0]);
    assert.equal(rimsTraceParts([again], rimArtParts(g, PIXI)), true, 'the new rim holds');
  });

  it('game.js: the stand-in is named and the hover and reach rims redraw when the art changes', () => {
    assert.match(game, /body\.label = VENDOR_STAND_IN_LABEL;/);
    assert.match(game, /label\.label = VENDOR_NAME_LABEL;/);
    assert.match(game, /rimsTraceParts\(rims, rimParts\(target\)\)/);
    assert.match(game, /rimsStale\(target\._hoverGlow, target\)/);
    assert.match(game, /rimsStale\(reachGlows\.get\(t\), t\)/);
    const feature = readFileSync(join(ROOT, 'public/js/features/street-spirits-feature.js'), 'utf8');
    assert.doesNotMatch(feature, /=\s*g\.children\b/, 'dress never reads the stand-in by place');
  });
});
