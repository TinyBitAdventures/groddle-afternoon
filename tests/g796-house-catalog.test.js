/**
 * G796 (Austin 2026-11-22: build all ten, free, move saves onto the originals): the house on the
 * home street is Glitch's furniture_chassis, one of ten houses with a choice per part, from the
 * CC0 SWFs (tools/house-art/build.mjs), customized with the house's Customize verb
 * (furniture_chassis.js verbs.customize; the client's ChassisManager / ConfiggerUI), free.
 * This file: the catalog and its rules (js/home-house.js).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HOUSE_ART,
  HOUSE_DEFAULT_CONFIG,
  HOUSE_STYLES,
  HOUSE_STYLE_IDS,
  composeHouse,
  defaultHouseConfig,
  flipHouse,
  houseBounds,
  houseConfigRows,
  houseLot,
  normalizeHouse,
  randomHouseConfig,
  setHouseStyle,
  stepHouseConfig,
} from '../public/js/home-house.js?v=3c88c47c';
import { HOUSE_LOT_W } from '../public/js/home-cultivation.js?v=122d6f45';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const GS = join(root, '../glitch-GameServerJS');

describe('the catalog: styles, start configs, rows (rules)', () => {
  it('each house fits its lot and stands under the street camera, its door on the walk line', () => {
    for (const id of HOUSE_STYLE_IDS) {
      for (const facing of [false, true]) {
        const b = houseBounds(composeHouse(id, null, facing));
        assert.ok(b.w > 250 && b.w <= HOUSE_LOT_W, `${id}: ${Math.round(b.w)} wide`);
        // inc_homes.js: the chassis stood on the street's door. The tallest: the Firebog House's bells
        // reach 735 above its foot (68 over its 666 stage), the House of Whimsy 667.
        assert.ok(b.h > 250 && b.h < 760, `${id}: ${Math.round(b.h)} tall`);
        assert.ok(b.b > -20 && b.b < 60, `${id}: its foot at ${Math.round(b.b)}`);
        const { door } = houseLot(id, null, facing);
        assert.ok(door.x1 < door.x2 && door.x1 >= b.l - 1 && door.x2 <= b.r + 1, `${id}: door on the house`);
      }
    }
  });

  it('names the nine upgrades of catalog_furniture.js and the Cottage, with their credits (all free here)', { skip: !existsSync(GS) }, () => {
    const cat = readFileSync(join(GS, 'items/catalog_furniture.js'), 'utf8');
    const block = cat.slice(cat.indexOf('this.furniture["furniture_chassis"]'), cat.indexOf('this.furniture["furniture_chassis"]') + 20000);
    for (const s of Object.values(HOUSE_STYLES)) {
      if (!s.upgradeId) continue;
      const m = new RegExp(`"${s.upgradeId}" : \\{\\s*name   : "([^"]+)"[\\s\\S]*?credits_cost : (\\d+)`).exec(block);
      assert.ok(m, s.id);
      assert.equal(m[1], s.name);
      assert.equal(Number(m[2]), s.credits);
    }
    assert.match(readFileSync(join(GS, 'items/furniture_chassis.js'), 'utf8'), /var label = "Groddle Cottage";/);
  });

  it('each style starts on its catalog config, every symbol one of its choices', () => {
    for (const id of HOUSE_STYLE_IDS) {
      const cfg = defaultHouseConfig(id);
      for (const part of HOUSE_ART[id].parts) {
        const want = HOUSE_DEFAULT_CONFIG[id][part.key];
        if (want) assert.equal(part.choices[cfg[part.key] - 1], want, `${id} ${part.key}`);
        else assert.equal(cfg[part.key], 1, `${id} ${part.key}: first choice`);
      }
      for (const key of Object.keys(HOUSE_DEFAULT_CONFIG[id])) assert.ok(HOUSE_ART[id].parts.some((p) => p.key === key), `${id}: ${key} is a part`);
    }
  });

  it('rows come sorted by label, as ConfigOption sorted them; back and next wrap; Randomize stays in range', () => {
    const rows = houseConfigRows('cottage').map((r) => r.label);
    assert.deepEqual(rows, ['Chimney', 'Door', 'Portico', 'Roof', 'Siding', 'Windows']);
    const cfg = defaultHouseConfig('cottage');
    assert.equal(stepHouseConfig('cottage', { ...cfg, door: 1 }, 'door', -1).door, 6);
    assert.equal(stepHouseConfig('cottage', { ...cfg, door: 6 }, 'door', 1).door, 1);
    const r = randomHouseConfig('firebog', () => 0.999);
    for (const part of HOUSE_ART.firebog.parts) assert.equal(r[part.key], part.choices.length);
    const h = normalizeHouse({ chassis: 'cottage' });
    assert.equal(setHouseStyle(h, 'shipwreck').ok, true);
    assert.deepEqual(h.config, defaultHouseConfig('shipwreck'));
    assert.equal(flipHouse(h), true);
    assert.equal(normalizeHouse({ chassis: 'tipi', config: { door: 99, roof: 3 } }).config.door, 1);
  });
});
