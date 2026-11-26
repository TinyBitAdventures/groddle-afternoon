/**
 * G796 (Austin 2026-11-22: build all ten, free, move saves onto the originals): the house on the
 * home street is Glitch's furniture_chassis, one of ten houses with a choice per part, from the
 * CC0 SWFs (tools/house-art/build.mjs), customized with the house's Customize verb
 * (furniture_chassis.js verbs.customize; the client's ChassisManager / ConfiggerUI), free.
 * This file: the home street draws the house (homes-feature) and the profile diorama names it.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HOUSE_STYLES, HOUSE_STYLE_IDS } from '../public/js/home-house.js?v=3c88c47c';
import { createHomeState, imagineHome } from '../public/js/homes.js?v=dca6b2cd';
import { HOUSE_STYLE_KEYS, houseDoorway, houseFixtureX, houseFront } from '../public/js/features/homes-feature.js?v=c3d5991d';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE_DIR = process.env.GRODDLE_SITE_DIR || join(root, '../groddle-afternoon-site');

describe('the home street draws the chosen house', () => {
  it('a new home gets its style\'s house; the street draws it, no door deco (homes-feature)', () => {
    const state = createHomeState();
    imagineHome(state, 'firebog', 1);
    assert.equal(state.house.chassis, 'firebog');
    assert.deepEqual(HOUSE_STYLE_KEYS, HOUSE_STYLE_IDS);
    const layout = { houseX: 1000 };
    for (const id of HOUSE_STYLE_KEYS) {
      const door = houseDoorway(layout, id);
      const front = houseFront(layout, id);
      const fx = houseFixtureX(layout, id);
      assert.ok(front.x1 <= door.x1 && door.x2 <= front.x2, id);
      assert.ok(fx.signX < door.x1, `${id}: the Mailbox clear of the door`);
    }
    // An old style key still finds its house (a layout or test from before).
    assert.deepEqual(houseDoorway(layout, 'uralia'), houseDoorway(layout, 'hominid'));
  });

  it('the profile diorama names the ten houses (HomeLayout::HOUSE_STYLES)', { skip: !existsSync(join(SITE_DIR, 'src/HomeLayout.php')) && 'no site checkout' }, () => {
    const src = readFileSync(join(SITE_DIR, 'src/HomeLayout.php'), 'utf8');
    const block = /public const HOUSE_STYLES = \[([^\]]*)\]/.exec(src)[1];
    assert.deepEqual([...block.matchAll(/'(\w+)' =>/g)].map((m) => m[1]), HOUSE_STYLE_IDS);
    for (const s of Object.values(HOUSE_STYLES)) assert.ok(block.includes(`'${s.name}'`), s.name);
  });
});
