/**
 * #512 (R12): the Jellisac Mound grows three Jellisacs, as jellisac_mound.js made them, the third
 * keyed after the two a yard already saved; the mound, the Barnacle Pod and the Firefly Hive stand
 * on Glitch's registration (the SWF stage's bottom centre on the item's x,y), not their cut frame's.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CULTIVATION_CLASSES } from '../public/js/homes-catalog.js?v=0367f90f';
import { nodeKeyMap } from '../public/js/features/homes-feature.js?v=c571ad49';
import { homeNodes } from '../public/js/yard-stock-mp.js?v=bb32f8f6';
import { SPRITE_FEET } from '../public/js/sprite-feet-data.js?v=a34ca443';
import { stageFoot, swfStage } from '../tools/swf-stage.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const GS = join(root, '../glitch-GameServerJS');
const ITEMS = join(root, '../glitch-items');
const homes = readFileSync(join(root, 'public/js/features/homes-feature.js'), 'utf8');

const PODS = {
  proto_jellisac_mound: { item: 'jellisac_mound', swf: 'harvestable_resources/jellisac_mound/jellisac_mound.swf' },
  proto_barnacle_pod: { item: 'barnacle_pod', swf: 'harvestable_resources/barnacle_pod/barnacle_pod.swf' },
  proto_firefly_hive: { item: 'firefly_hive', swf: 'misc/spawner/firefly_hive/firefly_hive.swf' },
};

describe('pods and their nodes (#512)', () => {
  it('every node the source makes, in its order', { skip: !existsSync(GS) }, () => {
    for (const proto of ['proto_jellisac_mound', 'proto_barnacle_pod']) {
      const src = readFileSync(join(GS, `items/${PODS[proto].item}.js`), 'utf8');
      const made = [...src.matchAll(/createAndReturnItem\('(\w+)', 1, x([+-]\d+), y([+-]\d+), 0\)/g)]
        .map((m) => ({ classTsid: m[1], dx: Number(m[2]), dy: Number(m[3]) }));
      assert.ok(made.length === 3, proto);
      assert.deepEqual(CULTIVATION_CLASSES[proto].nodes, made, proto);
    }
  });

  it('a mound keys its third Jellisac after the two it had', () => {
    const items = [{ id: 1, protoClass: 'proto_jellisac_mound', rx: 0 }];
    assert.deepEqual(nodeKeyMap(items).get(1), ['jellisac:0', 'jellisac:1', 'jellisac:2']);
    const nodes = homeNodes(items);
    assert.deepEqual(nodes.map((n) => [n.key, n.rx, n.dy]), [['jellisac:0', 38, -44], ['jellisac:1', -45, -64], ['jellisac:2', -3, -86]]);
  });

  it('each pod\'s registration is its SWF stage\'s bottom centre', { skip: !existsSync(ITEMS) }, () => {
    for (const [proto, { item, swf }] of Object.entries(PODS)) {
      const def = CULTIVATION_CLASSES[proto];
      assert.equal(def.art, item);
      const [w, h] = def.artSize;
      // the frame the game draws (tools/sprite-feet measures every shipped image)
      const cell = SPRITE_FEET[`assets/sprites/cultivation/${item}.webp`];
      assert.deepEqual(cell.slice(0, 2), [w, h], `${item} frame`);
      assert.deepEqual(def.artFoot, stageFoot(join(ITEMS, swf), w, h), item);
      // the frame is what the stage draws (to a pixel), so the foot is read in it
      const { bounds } = swfStage(join(ITEMS, swf));
      assert.ok(Math.abs(bounds.x1 - bounds.x0 - w) <= 1.5 && Math.abs(bounds.y1 - bounds.y0 - h) <= 1, `${item} frame is the drawn bounds`);
      // Glitch's stage leaves room under the art: the art stands above the item's y, off its frame's centre.
      assert.ok(def.artFoot[1] > h + 3, `${item} y`);
      assert.ok(Math.abs(def.artFoot[0] - w / 2) > 4, `${item} x`);
    }
  });

  it('the yard and a visit draw them on the walk line from that point', () => {
    const draws = [...homes.matchAll(/textureFromUrl\(`assets\/sprites\/cultivation\/\$\{def\.art\}\.webp`\)\);\n(\s+)(\w+)\(spr(, art)?\);\n\s+spr\.x = [^;]+;\n\s+spr\.y = ([^;]+);/g)];
    // R5: one drawing (drawPodArt) for your own yard and a visited one.
    assert.equal(draws.length, 1, 'one pod-art drawing');
    assert.match(homes, /for \(const \{ item, def \} of each\('art'\)\) drawPodArt\(engine, def, cultivationWorldX\(item, st\), groundY\);/, 'own yard');
    assert.match(homes, /p\.part === 'art'\) \{\n\s+shown = drawPodArt\(engine, def, x, groundY\);/, 'a visited one');
    for (const m of draws) {
      assert.equal(m[2], 'standPodArt');
      assert.equal(m[4], 'groundY');
    }
    assert.match(homes, /spr\.anchor\.set\(art\.foot\[0\] \/ art\.w, art\.foot\[1\] \/ art\.h\);/);
  });
});
