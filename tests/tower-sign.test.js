/**
 * G392: a named Tower hangs its name on Tiny Speck's scaffolding sign (furniture_tower_chassis.js
 * getExtraConfig 422-443), at the chassis' own sign_pt when it has one (HandleSpecialConfigsCmd.as).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOWER_ART, TOWER_SIGN_KEY, TOWER_SIGN_POINTS, TOWER_SIGN_TEXT_DY, TOWER_SIGN_TEXT_WIDTH, towerSignPoint } from '../public/js/home-tower.js?v=0962d6c8';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const GS = join(root, '../glitch-GameServerJS');
const CLIENT = join(root, '../glitch-client');
const ITEMS = join(root, '../glitch-items/furniture');
const feature = readFileSync(join(root, 'public/js/features/home-tower-feature.js'), 'utf8');

const STYLES = {
  base: 'furniture_base/furniture_tower_chassis/furniture_tower_chassis',
  tree: 'furniture_tower_chassis/furniture_tower_chassis_tree_tower',
  quarry: 'furniture_tower_chassis/furniture_tower_chassis_rock_tower',
  mushroom: 'furniture_tower_chassis/furniture_tower_chassis_mushroom_tower',
  spaceship: 'furniture_tower_chassis/furniture_tower_chassis_spaceship_tower',
  adobe: 'furniture_tower_chassis/furniture_tower_chassis_basic_tower',
};

describe('the Tower name sign', () => {
  it('has a point for every style, flipping with the chassis', () => {
    assert.deepEqual(Object.keys(TOWER_SIGN_POINTS).sort(), Object.keys(TOWER_ART).sort());
    for (const [style, { dx, dy }] of Object.entries(TOWER_SIGN_POINTS)) {
      assert.deepEqual(towerSignPoint(style, true), { x: dx, y: dy, flipped: false }, style);
      assert.deepEqual(towerSignPoint(style, false), { x: -dx, y: dy, flipped: true }, style);
    }
    assert.deepEqual(towerSignPoint('nope'), { x: TOWER_SIGN_POINTS.base.dx, y: TOWER_SIGN_POINTS.base.dy, flipped: false });
  });

  it('is the source overlay and the source spacing', { skip: !existsSync(GS) }, () => {
    const src = readFileSync(join(GS, 'items/furniture_tower_chassis.js'), 'utf8');
    assert.match(src, /swf_url: overlay_key_to_url\('tower_sign_scaffolding_overlay'\),\s*delta_x: 8,\s*delta_y: -120,\s*no_display: true/);
    assert.match(src, /delta_y: scaffolding_sd\.delta_y-30,\s*width:250/);
    assert.match(src, /sign_sd\.label = this\.user_name\.toUpperCase\(\);\s*delete scaffolding_sd\.no_display;/);
    assert.equal(TOWER_SIGN_KEY, 'tower_sign_scaffolding_overlay');
    assert.equal(TOWER_SIGN_TEXT_DY, -30);
    assert.equal(TOWER_SIGN_TEXT_WIDTH, 250);
  });

  it('the client prefers the chassis sign_pt', { skip: !existsSync(CLIENT) }, () => {
    const as = readFileSync(join(CLIENT, 'com/tinyspeck/engine/view/itemstack/commands/HandleSpecialConfigsCmd.as'), 'utf8');
    assert.match(as, /var sign_pt:MovieClip = swf_data\.mc\.sign_pt;/);
    assert.match(as, /return \[-\(swf_data\.mc_w\/2\)\+sign_pt\.x, -\(swf_data\.mc_h\)\+sign_pt\.y\];/);
  });

  it('every point is the chassis FLA sign_pt from its own origin', { skip: !existsSync(ITEMS) }, () => {
    const matrix = (xml, name) => {
      const m = new RegExp(`<DOMSymbolInstance[^>]*name="${name}"[^>]*>\\s*<matrix>\\s*<Matrix([^/]*)/>`).exec(xml);
      if (!m) return null;
      return { x: Number(/tx="([-\d.]+)"/.exec(m[1])[1]), y: Number(/ty="([-\d.]+)"/.exec(m[1])[1]) };
    };
    const near = (a, b, label) => assert.ok(Math.abs(a - b) < 0.01, `${label}: ${a} vs ${b}`);
    for (const [style, base] of Object.entries(STYLES)) {
      let xml;
      try {
        xml = execFileSync('unzip', ['-p', join(ITEMS, `${base}.fla`), 'DOMDocument.xml'], { encoding: 'utf8', maxBuffer: 2 ** 28, stdio: ['ignore', 'pipe', 'ignore'] });
      } catch (e) { xml = e.stdout; } // These FLAs have a short central directory; unzip warns and still reads them.
      const main = matrix(xml, 'maincontainer_mc');
      const pt = matrix(xml, 'sign_pt');
      assert.ok(main, style);
      const want = TOWER_SIGN_POINTS[style];
      if (pt) {
        near(want.dx, pt.x - main.x, style);
        near(want.dy, pt.y - main.y, style);
      } else {
        assert.equal(style, 'mushroom', 'only the mushroom chassis has no sign_pt');
        const [w, h] = [408, 820.35];
        near(want.dx, w / 2 + 8 - main.x, style);
        near(want.dy, h - 120 - main.y, style);
      }
    }
  });

  it('the feature draws the overlay, not a plaque, for owners and visitors', () => {
    assert.match(feature, /playOverlay\(PIXI, TOWER_SIGN_KEY, \{ layer: scaffold,/);
    assert.match(feature, /scaffold\.scale\.x = at\.flipped \? -1 : 1;/);
    assert.doesNotMatch(feature, /roundRect\(-w \/ 2/);
    assert.match(feature, /nameSign\(PIXI, tower\.name, tower\.style, tower\.facingRight\)/);
    assert.match(feature, /nameSign\(PIXI, towerState\.name, towerState\.style, towerState\.facingRight\)/);
  });
});
