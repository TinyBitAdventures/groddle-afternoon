/**
 * G1153: the tower lobbies' lifts are signposts drawn as their deco (signpost_asset_elevator), no
 * wooden post or arms, as Glitch's SignpostView.as render 155-178 drew a signpost with a deco;
 * a click on the lift offers the floors (LocationSelectorDialog), the lobby plate reads L.
 * Run: node --test tests/g1153-lift-signpost.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { convertLocationXml } from '../public/js/location-xml.js?v=32377f99';
import { buildSignDecoView, DECO_TWINS, signDecoDrawn, signpostBoardAt } from '../public/js/street-render.js?v=e7e9dfda';
import { TOWER_LIFT_PLATE, TOWERS } from '../public/js/tower-floors.js?v=91217aeb';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const streetsDir = join(root, 'public/assets/streets');
const street = (tsid) => JSON.parse(readFileSync(join(streetsDir, `${tsid}.json`), 'utf8'));
const liftOf = (s) => s.signposts.find((p) => p.connects.length > 1);

class Node {
  constructor() { this.children = []; this.anchor = { set() {} }; this.scale = { set() {} }; this.x = 0; this.y = 0; }
  addChild(c) { this.children.push(c); c.parent = this; return c; }
}
class Graphics extends Node {
  roundRect() { return this; }
  fill() { return this; }
}
class Sprite extends Node {
  constructor(texture) { super(); this.texture = texture; this.label = 'sprite'; }
}
class Text extends Node {
  constructor({ text }) { super(); this.text = text; }
}
const PIXI = { Container: Node, Graphics, Sprite, Text, BlurFilter: class {} };
const loaded = { source: {}, width: 784, height: 844, orig: { width: 784, height: 844 } };

describe('G1153: a signpost drawn as its deco', () => {
  it('the location XML keeps a signpost\'s deco', () => {
    const xml = `<game_object tsid="GTEST" label="Lobby"><object id="dynamic"><int id="l">-750</int><int id="r">750</int><int id="t">-642</int><int id="b">0</int>
      <object id="layers"><object id="middleground"><str id="name">middleground</str><int id="z">0</int>
      <object id="signposts"><object id="signpost_1"><object id="deco"><str id="sprite_class">signpost_asset_elevator</str><int id="h">422</int><int id="w">392</int></object>
      <int id="x">25</int><int id="y">-127</int><int id="w">392</int><int id="h">422</int>
      <object id="connects"><object id="1_1"><str id="hub_id">101</str><objref id="target" tsid="LFLOOR1" label="Floor 1"/></object></object></object>
      <object id="signpost_2"><int id="x">500</int><int id="y">-127</int><object id="connects"><object id="a"><objref id="target" tsid="LOUT" label="Out"/></object></object></object>
      </object></object></object></object></game_object>`;
    const s = convertLocationXml(xml);
    assert.deepEqual(s.signposts[0].deco, { sprite: 'signpost_asset_elevator', w: 392, h: 422 });
    assert.equal('deco' in s.signposts[1], false, 'an ordinary post has none');
  });

  it('every lobby lift is its XML deco with the L plate; every floor lift is the same art', () => {
    for (const t of TOWERS) {
      const lift = liftOf(street(t.lobby));
      assert.deepEqual(lift.deco, { sprite: t.liftArt, w: 392, h: 422 }, t.label);
      assert.equal(lift.plate, 'L', t.label);
      for (const f of t.floors) {
        const floor = street(f.tsid);
        assert.deepEqual(liftOf(floor).deco, { sprite: 'signpost_asset_elevator', w: 392, h: 422 }, f.label);
        const decos = floor.layers.flatMap((l) => l.decos);
        assert.equal(decos.some((d) => d.sprite === 'signpost_asset_elevator'), false, `${f.label}: the lift is drawn once, by its signpost`);
      }
    }
    assert.deepEqual(TOWERS.filter((t) => t.liftArt !== 'signpost_asset_elevator').map((t) => t.id), ['hauki', 'hakusan']);
    assert.equal(DECO_TWINS.signpost_asset_elevator_noBG, 'signpost_asset_elevator');
  });

  it('draws the lift and its plate, no post or arms, every floor a board over the lift', () => {
    const lift = liftOf(street('GIFI4FP9GRU2CC8'));
    const g = buildSignDecoView(PIXI, lift, { x: 775, y: 515 }, { art: loaded, plate: 'L' });
    const labels = g.children.map((c) => c.label);
    assert.ok(labels.includes('sign-deco-art'));
    assert.ok(!labels.some((l) => /sign-(post|arm|shadow)/.test(l || '')), labels.join());
    const plate = g.children.find((c) => c.label === 'sign-deco-plate');
    assert.equal(plate.text, 'L');
    // On the art's plate (117-212 x 562-696 of 784 x 844, drawn 392 x 422), as the floors' number.
    assert.deepEqual([plate.x, plate.y], [-114, -108]);
    assert.deepEqual(TOWER_LIFT_PLATE, { dx: -114, dy: 108 });
    assert.equal(g.signDeco, true);
    assert.deepEqual(g.signBoards.map((b) => b.key), lift.connects.map((_, i) => String(i + 1)));
    // A click on the lift door finds a board; a click beside the lift finds none.
    assert.ok(signpostBoardAt([g], 775 - 40, 515 - 100));
    assert.equal(signpostBoardAt([g], 775 + 160, 515 - 100), null);
    assert.equal(signpostBoardAt([g], 775, 515 - 320), null);
  });

  it('Hauki Seeks Manor already places the lift art at its post, so it is not drawn twice', () => {
    const hauki = street('GA9H1V6OGRU2FSB');
    assert.equal(signDecoDrawn(hauki, liftOf(hauki)), true);
    const sabudana = street('GIFI4FP9GRU2CC8');
    assert.equal(signDecoDrawn(sabudana, liftOf(sabudana)), false);
  });

  it('a click or Enter at the lift opens its floors as a menu', () => {
    const src = readFileSync(join(root, 'public/game.js'), 'utf8');
    assert.match(src, /if \(signMenuView\(signBoard\?\.view\)\) \{\s*openSignpostArmsMenu\(signBoard/);
    assert.match(src, /if \(signMenuView\(at\.view\)\) \{\s*openSignpostArmsMenu\(/);
    assert.match(src, /postAtHand\?\.view\?\.signDeco \? 'Choose a floor' : postAtHand\?\.view\?\.signQuarter \? 'Choose a block' : 'Choose a road'/);
    const render = readFileSync(join(root, 'public/js/street-render.js'), 'utf8');
    assert.match(render, /s\.deco\?\.sprite \? buildSignDecoView\(/);
  });
});
