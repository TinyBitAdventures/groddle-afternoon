/**
 * The tool at work on a Barnacle, an Ice Nubbin, a Dirt Pile and Peat (js/node-tools.js,
 * features/resource-nodes-feature.js; lane refsart): the Scraper or Shovel you use plays its own
 * tool_animation on the node, as the source's skill package overlay did. Read against Tiny
 * Speck's files when they are beside the repo; the grids against the shipped sheets.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NODE_TOOLS, NODE_TOOL_DELTAS, nodeToolOverlay, nodeToolSheet } from '../public/js/node-tools.js?v=833c759b';
import { PACKED_SHEETS } from '../public/js/packed-sheets-data.js?v=32023e3a';
import { packedCell, packedFrameAt } from '../public/js/packed-sheets.js?v=cb13ee62';
import { RESOURCE_NODE_CATALOG } from '../public/js/resource-nodes.js?v=7a77fd73';
import { imageSize } from '../tools/image-size.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, 'public', rel), 'utf8');
const GSJS = join(root, '..', 'glitch-GameServerJS');

describe('the source says which tool, and where', { skip: existsSync(join(GSJS, 'items/mortar_barnacle.js')) ? false : 'clone tinyspeck/glitch-GameServerJS beside the repo' }, () => {
  const item = (name) => readFileSync(join(GSJS, 'items', `${name}.js`), 'utf8');

  it('a Barnacle and an Ice Nubbin pass the scraper with deltas 40 and 80; a Dirt Pile and Peat pass the shovel with none', () => {
    assert.match(item('mortar_barnacle'), /pc\.runSkillPackage\('scraping', this, \{[\s\S]{0,80}?tool_item: scraper, source_delta_y: 80, source_delta_x: 40,/);
    assert.match(item('ice_knob'), /pc\.runSkillPackage\('ice_scraping', this, \{[\s\S]{0,80}?tool_item: scraper, source_delta_y: 80, source_delta_x: 40,/);
    assert.match(item('dirt_pile'), /pc\.runSkillPackage\('dig_dirt_pile', this, \{tool_item: shovel, word_progress: [^}]*\}\);/);
    for (const peat of ['peat_1', 'peat_2', 'peat_3']) {
      assert.match(item(peat), /pc\.runSkillPackage\('peat_harvest', this, \{tool_item: shovel, word_progress: [^}]*\}\);/, peat);
    }
    assert.deepEqual({ ...NODE_TOOL_DELTAS.mortar_barnacle }, { dx: 40, dy: 80 });
    assert.deepEqual({ ...NODE_TOOL_DELTAS.ice_knob }, { dx: 40, dy: 80 });
    assert.deepEqual({ ...NODE_TOOL_DELTAS.default }, { dx: 10, dy: 20 });
  });

  it('the skill package puts the tool on the thing, mirrored and on its right when it is left of you', () => {
    const src = readFileSync(join(GSJS, 'players/inc_skill_packages.js'), 'utf8');
    assert.match(src, /var state = '-tool_animation';\s+var delta_x = 0;[\s\S]{0,120}?if \(source_item\.x < this\.x\)\{\s+delta_x = args\.source_delta_x !== undefined \? args\.source_delta_x : 10;/);
    assert.match(src, /state = 'tool_animation';\s+delta_x = args\.source_delta_x !== undefined \? \(args\.source_delta_x \* -1\) : -10;/);
    assert.match(src, /type: 'itemstack_overlay',[\s\S]{0,200}?itemstack_tsid: source_item\.tsid,\s+delta_x: delta_x,\s+delta_y: args\.source_delta_y \? args\.source_delta_y : 20,/);
    assert.match(src, /annc\['item_class'\] = args\.tool_item\.class_tsid;\s+annc\['state'\] = state;/);
  });
});

describe('where the tool stands', () => {
  it('on the node, toward you: 40 px over and 80 down for a Barnacle or Ice Nubbin, 10 and 20 for the rest', () => {
    assert.deepEqual(nodeToolOverlay('mortar_barnacle', 300, 500), { flipped: true, deltaX: 40, deltaY: 80 });
    assert.deepEqual(nodeToolOverlay('ice_knob', 700, 500), { flipped: false, deltaX: -40, deltaY: 80 });
    assert.deepEqual(nodeToolOverlay('dirt_pile', 300, 500), { flipped: true, deltaX: 10, deltaY: 20 });
    assert.deepEqual(nodeToolOverlay('peat_2', 700, 500), { flipped: false, deltaX: -10, deltaY: 20 });
  });

  it('the four node kinds are the only ones whose verbs take a Scraper or a Shovel', () => {
    const tooled = {};
    for (const def of Object.values(RESOURCE_NODE_CATALOG)) {
      for (const verb of def.verbs) {
        const tools = verb.tools.filter((t) => NODE_TOOLS.includes(t));
        if (tools.length) tooled[`${def.classTsid}:${verb.id}`] = tools.join(',');
      }
    }
    assert.deepEqual(tooled, {
      'mortar_barnacle:scrape': 'super_scraper,scraper',
      'ice_knob:scrape': 'super_scraper,scraper',
      'dirt_pile:dig': 'ace_of_spades,shovel',
      // The remake's one Peat Bog class (peat_2 and peat_3 are its other looks).
      'peat_1:harvest': 'ace_of_spades,shovel',
    });
  });
});

describe('the sheets', () => {
  // Measured from Tiny Speck's OGA sheets: size, grid, cell, frames.
  const MEASURED = {
    scraper: { size: [924, 390], grid: [11, 5], cell: [84, 78], frames: 51, swf: [3, 53] },
    super_scraper: { size: [871, 280], grid: [13, 4], cell: [67, 70], frames: 51, swf: [2, 52] },
    ace_of_spades: { size: [882, 316], grid: [14, 4], cell: [63, 79], frames: 53, swf: [4, 56] },
  };

  it('Scraper, Super Scraper and Ace of Spades: the measured grids, every frame of the SWF scene', () => {
    assert.deepEqual(Object.keys(PACKED_SHEETS.tools).sort(), Object.keys(MEASURED).sort());
    const results = JSON.parse(readFileSync(join(root, 'tools/packed-sheets/results.json'), 'utf8')).sheets;
    const hires = read('js/sprite-hires.js');
    const first = hires.slice(hires.indexOf('FIRST_DRAW_SPRITES'));
    for (const [tool, m] of Object.entries(MEASURED)) {
      const def = nodeToolSheet(tool);
      const row = results.find((r) => r.set === 'tools' && r.name === tool);
      assert.deepEqual(row.oga.size, m.size, tool);
      assert.deepEqual([row.oga.cols, row.oga.rows], m.grid, tool);
      assert.deepEqual([...def.cell], m.cell, tool);
      assert.equal(def.plays, m.frames, tool);
      assert.equal(def.loop, true, `${tool}: tool_animation loops`);
      assert.equal(def.fps, 30, tool);
      assert.equal(Math.min(...row.frameList), m.swf[0], tool);
      assert.ok(Math.max(...row.frameList) <= m.swf[1], tool);
      const { w, h } = imageSize(join(root, 'public', def.path));
      assert.deepEqual([w, h], [def.cols * def.fw, Math.ceil(def.frames / def.cols) * def.fh], def.path);
      const twin = def.path.replace('.webp', '@3x.webp');
      const big = imageSize(join(root, 'public', twin));
      assert.deepEqual([big.w, big.h], [w * 3, h * 3], twin);
      assert.ok(first.includes(`"${def.path}"`), `${def.path} waits for its first draw`);
    }
    // A swing ends where it began: the last frame is the first picture again.
    assert.equal(packedCell(nodeToolSheet('scraper'), 50), 0);
    assert.equal(packedFrameAt(nodeToolSheet('scraper'), 1700), 0, '51 frames: it loops every 1.7 s');
  });

  it('the Shovel is the sheet the Patches already use: 14 x 4 cells of 65 x 82, 53 frames', () => {
    const def = nodeToolSheet('shovel');
    assert.deepEqual([def.path, def.fw, def.fh, def.cols, def.frames, def.plays], ['assets/sprites/soil/shovel-tool.webp', 65, 82, 14, 53, 53]);
    const { w, h } = imageSize(join(root, 'public', def.path));
    assert.deepEqual([w, h], [910, 328]);
    assert.match(read('js/features/patches-feature.js'), /shovel: Object\.freeze\(\{ url: 'assets\/sprites\/soil\/shovel-tool\.webp', fw: 65, fh: 82, cols: 14, count: 53 \}\)/);
    assert.equal(def.keep, true, 'shared with the Patches: never unloaded');
    assert.equal(nodeToolSheet('pick'), null);
    assert.equal(nodeToolSheet('watering_can'), null);
  });

  it('the vector manifest is current', () => {
    const out = execFileSync('node', [join(root, 'tools/vector-sprites/build.mjs'), '--manifest', join(root, 'tools/vector-sprites/node-tools.json'), '--check'], { encoding: 'utf8' });
    assert.match(out, /node-tools\.json: ok/);
  });
});

describe('the feature', () => {
  it('starts the tool when the verb starts, for the verb\'s own time, and stops it if the verb is cancelled or the street changes', () => {
    const src = read('js/features/resource-nodes-feature.js');
    assert.match(src, /verbStarted\(target, verb, engine\) \{[\s\S]{0,400}?const rule = resourceNodeVerbs\(entity\.node, engine\.inv, engine\.pc, verbContext\(engine, entity\)\)\.find\(\(v\) => v\.id === rulesVerbId\(verb\?\.id\)\);\s+const def = nodeToolSheet\(rule\?\.tool\);/);
    assert.match(src, /const place = nodeToolOverlay\(entity\.classTsid, spr\.x, engine\.player\?\.x\);/);
    assert.match(src, /durationMs: verb\.durationMs,/);
    assert.match(src, /itemstackOverlayPoint\(spr\.x, displayTopOf\(spr\), \{ dx: place\.deltaX, dy: place\.deltaY \}\)/);
    assert.match(src, /verbCancelled\(target\) \{\s+if \(entities\.some\(\(row\) => row\.target === target\)\) stopNodeTool\(\);/);
    assert.match(src, /onStreetClear\(\) \{\s+stopNodeTool\(\);/);
  });
});
