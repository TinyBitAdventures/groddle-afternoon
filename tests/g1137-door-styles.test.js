/**
 * G1137 / #612: a placed Door can be restyled. Glitch offered Upgrade on a Door (items/furniture_door.js
 * verbs.upgrade 320-342, sort_on 53) and Change Style after (412-435, 54), from the 32 Door styles in
 * catalog_furniture.js. The style is the SWF; its config only picks the frame inside it (getUserConfig
 * 546-562 keeps the door key from getDefaultUpgradeConfig: door_up, door_down, door_up_job), so each
 * style is rendered once per role (tools/furniture-upgrades render.py `parts`, cropped alike) and a
 * restyled Door still shows up, down or building a floor. Costs follow the other styles (credits at
 * CURRANTS_PER_CREDIT, free ones free).
 * Run: node --test tests/g1137-door-styles.test.js
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FURNITURE_UPGRADES, FURNITURE_UPGRADES_LEFT_OUT } from '../public/js/furniture-upgrades-data.js?v=0b2cf3cc';
import { applyUpgrade, listUpgrades, styleCurrants, upgradeArt, upgradeVerb } from '../public/js/furniture-upgrades.js?v=f563b304';
import { DOOR_CLASS } from '../public/js/home-floors.js?v=73a434ce';
import { normalizeHomeDecorState } from '../public/js/home-decor.js?v=3a84d959';

const pub = join(import.meta.dirname, '..', 'public');
const read = (rel) => readFileSync(join(pub, 'js', rel), 'utf8');

/** WebP canvas size (VP8X, VP8L or VP8 header). */
function webpSize(file) {
  const b = readFileSync(file);
  const kind = b.toString('ascii', 12, 16);
  if (kind === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
  if (kind === 'VP8L') {
    const bits = b.readUInt32LE(21);
    return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 };
  }
  return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
}

describe('G1137: Door styles', () => {
  it('offers the 32 catalog Door styles, each with art for every role, cropped alike', () => {
    assert.equal('furniture_door' in FURNITURE_UPGRADES_LEFT_OUT, false);
    const door = FURNITURE_UPGRADES[DOOR_CLASS];
    assert.equal(door.canRevert, true);
    const rows = Object.entries(door.upgrades);
    assert.equal(rows.length, 32);
    // catalog_furniture.js: Turtle Shell Door (271) is 40 credits.
    assert.deepEqual([door.upgrades['271'].name, door.upgrades['271'].credits], ['Turtle Shell Door', 40]);
    for (const [id, row] of rows) {
      assert.deepEqual(Object.keys(row.doorArt).sort(), ['down', 'up', 'up_job'], id);
      assert.equal(row.doorArt.up_job, row.art.path, `${id}: the piece's own art is the floor-building Door, as the plain Door's`);
      const sizes = Object.values(row.doorArt).map((path) => {
        assert.ok(existsSync(join(pub, path)), path);
        return JSON.stringify(webpSize(join(pub, path)));
      });
      assert.equal(new Set(sizes).size, 1, `${id}: one crop for every role, so the Door keeps its place`);
      assert.deepEqual(JSON.parse(sizes[0]), { w: row.art.w * 3, h: row.art.h * 3 });
    }
  });

  it('a placed Door takes Upgrade, then Change Style, paid like any other style', () => {
    const state = normalizeHomeDecorState({ geo: 2, placed: [{ id: 1, classTsid: DOOR_CLASS, x: 600, y: 555 }], nextId: 2 });
    const piece = state.placed[0];
    assert.equal(upgradeVerb(piece).id, 'upgrade');
    const turtle = listUpgrades(piece, 'Door').find((row) => row.id === '271');
    assert.equal(turtle.currants, styleCurrants(40));
    assert.equal(applyUpgrade(piece, '271', { currants: 0 }).reason, 'currants');
    const ok = applyUpgrade(piece, '271', { currants: styleCurrants(40) });
    assert.deepEqual([ok.ok, ok.cost, piece.upgradeId], [true, styleCurrants(40), '271']);
    assert.equal(upgradeVerb(piece).id, 'change_style');
    assert.equal(upgradeArt(DOOR_CLASS, '271').path, FURNITURE_UPGRADES[DOOR_CLASS].upgrades['271'].art.path);
    // The style survives a save and load.
    const again = normalizeHomeDecorState(JSON.parse(JSON.stringify(state)));
    assert.equal(again.placed[0].upgradeId, '271');
  });

  it('a restyled Door draws its role inside its style, and offers the verb on the Door itself', () => {
    const src = read('features/homes-feature.js');
    assert.match(src, /const row = upgradeRow\(DOOR_CLASS, doorUpgradeId\(item\)\);\n {2}if \(row\?\.doorArt\) return row\.doorArt\[key\] \|\| row\.art\.path;/);
    assert.match(src, /dressDoorSprite\(spr, item, floor\);/);
    assert.match(src, /refreshDoorTargets\(engine\);/);
    assert.match(src, /id: `door_\$\{row\.id\}`, label: row\.label, sort: row\.id === 'upgrade' \? 53 : 54/);
    assert.match(src, /verbId === 'door_upgrade' \|\| verbId === 'door_change_style'/);
    assert.match(src, /return doorVerbs\(target, engine\);/);
  });
});
