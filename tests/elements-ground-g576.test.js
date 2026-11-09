/**
 * G576 (live reports 2026-11-08): #139 elements on the ground, and an empty verb menu's
 * "Nothing to do here." shown twice.
 *
 * The source: element_base canDrop and canPickup return {ok: 0} (element_red.js 143-149), so
 * takeable_drop_conditions and takeable_pickup_conditions hide both verbs (takeable.js 20-25,
 * 110-116): an element never reached the ground, and Disperse worked in the pack and on the
 * ground (ok_states in_location, in_pack: element_red.js 93-141). v0.23.0 (24f913f27a) took Pick up
 * away but left Drop. Now Drop is gone as in the source, and a stack already down goes back into a
 * pouch only (the rule 24f913f27a protects: elements live in Elemental Pouches) or is dispersed.
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PACK_COPY, roomFor } from '../public/js/pack-slots.js?v=6cf9f397';
import { getVerbsFor } from '../public/content.js?v=108ab200';
import { loadContentCatalogsFromDir } from '../public/js/content-catalogs.js?v=10b118dd';
import { itemVerbsMoreFeature, disperseGroundElements } from '../public/js/features/item-verbs-more-feature.js?v=ceffd94a';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const GS = join(root, '../glitch-GameServerJS');
const game = readFileSync(join(root, 'public/game.js'), 'utf8');
before(async () => loadContentCatalogsFromDir(join(root, 'public/assets/content')));

const ground = (classTsid, extra = {}) => ({ classId: 'dropped_item', label: 'Red Element', state: { id: 'd1', classTsid, count: 40, ...extra } });

describe('the source', { skip: !existsSync(GS) && 'glitch-GameServerJS is not beside the game' }, () => {
  it('elements can be neither dropped nor picked up, and Disperse works on the ground', () => {
    for (const cls of ['element_red', 'element_green', 'element_blue', 'element_shiny']) {
      const src = readFileSync(join(GS, `items/${cls}.js`), 'utf8');
      assert.match(src, /function canDrop\(pc, drop_stack\)\{ \/\/ defined by element_base\s*return \{ok: 0\};/, cls);
      assert.match(src, /verbs\.disperse = \{[\s\S]{0,120}"ok_states"\s*: \["in_location","in_pack"\]/, cls);
    }
    const takeable = readFileSync(join(GS, 'items/include/takeable.js'), 'utf8');
    assert.match(takeable, /var can_drop = this\.canDrop\(pc, drop_stack\);\s*if \(!can_drop\['ok'\]\)\{\s*if \(!can_drop\['error'\]\) return \{state:null\};/);
  });
});

describe('#139 Drop', () => {
  it('every way down refuses an element (packDropBlockReason), a pouch still goes down whole', () => {
    assert.match(game, /if \(!inBag && isElementClass\(classTsid\)\) return PACK_COPY\.elementNoDrop;/);
    assert.match(game, /box\.slots\.some\(\(s\) => packDropBlockReason\(s\.cls, \{ inBag: true \}\)\)/);
    // Drop, the drop chooser and Decoration Mode all ask packDropBlockReason first.
    assert.match(game, /function dropPackItem\(classTsid, requested = 1\) \{\s*if \([^)]*\) return;\s*const blocked = packDropBlockReason\(classTsid\);/);
    assert.match(game, /dropPackStackAt\(classTsid, count, x, y\) \{[\s\S]{0,140}const blocked = packDropBlockReason\(classTsid\);/);
  });

  it("an element's pack menu has no Drop row (state null hides it)", () => {
    assert.match(game, /if \(!isElementClass\(classTsid\)\) rows\.push\(\{\s*attrs: 'data-pack-drop',/);
  });
});

describe('#139 a stack already on the ground', () => {
  it('Pick up goes to a pouch only: none, no room, room', () => {
    const pick = (inv) => getVerbsFor(ground('element_red'), { pc: {}, inv }).find((v) => v.id === 'pickup');
    assert.deepEqual([pick({}).enabled, pick({}).reason], [false, PACK_COPY.elementNoPouch]);
    assert.equal(pick({ bag_elemental_pouch: 1 }).enabled, true);
    // The pouch's room is what the pick up takes (game.js pickupDroppedWorldItem asks packRoom).
    assert.equal(roomFor({ bag_elemental_pouch: 1, element_red: 4990 }, null, 'element_red', 40), 10);
    assert.equal(roomFor({ bag_elemental_pouch: 1, element_red: 5000 }, null, 'element_red', 40), 0);
    assert.equal(roomFor({ apple: 1 }, null, 'element_red', 40), 0);
    assert.match(game, /const element = isElementClass\(wantClass\);/);
    assert.match(game, /if \(room === 0 \|\| \(element && room == null\)\) \{/);
  });

  it('Disperse is on the menu of your own stack, not a shared one or anything else', () => {
    const verbs = (t) => itemVerbsMoreFeature.decorateVerbs(t, getVerbsFor(t, { pc: {}, inv: {} }));
    assert.deepEqual(verbs(ground('element_red')).map((v) => v.id), ['pickup', 'disperse']);
    assert.equal(verbs(ground('element_red', { shared: true })), null);
    assert.equal(verbs(ground('apple')), null);
  });

  it('Disperse takes the whole stack and gives count / 20 iMG, as from the pack', () => {
    const lines = [];
    const counters = [];
    const engine = {
      pc: { xp: 0, imagination: 0, energy: 100, mood: 100 },
      inv: {},
      takeDroppedStack: (id) => (id === 'd1' ? { ok: true, classTsid: 'element_red', count: 40 } : { ok: false }),
      pushActivity: (t) => lines.push(t),
      toast() {},
      achievement: (c, n) => counters.push([c, n]),
      playSound() {},
      setData() {},
      updateHud() {},
      refreshPack() {},
      save() {},
    };
    const out = disperseGroundElements(engine, ground('element_red'));
    assert.equal(out.ok, true);
    assert.equal(out.xp, 2);
    assert.match(lines[0], /Those elements done gone back to the universe\. \(\+2 iMG\)/);
    assert.ok(counters.some(([c]) => c === 'element_red:disperse'));
    assert.equal(itemVerbsMoreFeature.runVerbOverride(ground('apple'), 'disperse', engine), null);
  });
});

describe('an empty verb menu', () => {
  it('says "Nothing to do here." once: the row, not the footer too', () => {
    const at = game.indexOf("li.textContent = 'Nothing to do here.';");
    assert.ok(at > 0);
    const block = game.slice(game.lastIndexOf('if (!verbs.length) {', at), at);
    assert.doesNotMatch(block, /vmDefault/);
    assert.equal(game.match(/Nothing to do here\./g).length, 1);
  });
});
