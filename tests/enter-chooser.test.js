// G206: the Enter chooser ("Choose the thing you want to interact with:").
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ENTER_CHOOSER_TITLE,
  SORT_VALUES,
  buildEnterChoices,
  choiceKind,
  clientGridColumns,
  describeChoice,
  gridMove,
  itemSortValue,
  orderChoices,
  planEnter,
} from '../public/js/enter-chooser.js?v=4a3ea327';

const here = dirname(fileURLToPath(import.meta.url));
const game = readFileSync(join(here, '../public/game.js'), 'utf8');
const client = join(here, '../../glitch-client/com/tinyspeck/engine');

const t = (classId, extra = {}) => ({ classId, label: classId, sprite: {}, ...extra });
const near = (...rows) => rows.map(([target, distance]) => ({ target, distance }));

describe('Enter chooser order (InteractionMenuController.as 68-100)', () => {
  it('keeps the client title', () => {
    assert.equal(ENTER_CHOOSER_TITLE, 'Choose the thing you want to interact with:');
  });

  it('maps item classes the way LocationItemstackView.disambugate_sort_on does', () => {
    assert.equal(itemSortValue('street_spirit_groceries'), 10);
    assert.equal(itemSortValue('npc_rare_item_vendor'), 20);
    assert.equal(itemSortValue('npc_shrine_mab'), 30);
    assert.equal(itemSortValue('trant_fruit'), 40);
    assert.equal(itemSortValue('patch_dark'), 50);
    assert.equal(itemSortValue('npc_piggy'), 60);
    assert.equal(itemSortValue('npc_mailbox'), 60); // any other npc_* class
    assert.equal(itemSortValue('wood_tree'), 100); // not a trant
    assert.equal(itemSortValue('rock_metal_1'), 100);
    assert.equal(itemSortValue('apple'), 100);
  });

  it('sorts spirit, vendor, shrine, trant, patch, animal, signpost, door, ground item, player', () => {
    const order = buildEnterChoices({
      near: near(
        [t('pc_local'), 1],
        [t('apple'), 2],
        [t('street_door'), 3],
        [t('npc_piggy'), 4],
        [t('patch_seedling'), 5],
        [t('trant_bubble'), 6],
        [t('npc_shrine_mab'), 7],
        [t('npc_rare_item_vendor'), 8],
        [t('street_spirit_groceries'), 9],
      ),
      signpost: { signpost: { connects: [] }, distance: 0, labels: ['Grand Mile'] },
    }).map((c) => c.classId);
    assert.deepEqual(order, [
      'street_spirit_groceries', 'npc_rare_item_vendor', 'npc_shrine_mab', 'trant_bubble', 'patch_seedling',
      'npc_piggy', 'signpost', 'street_door', 'apple', 'pc_local',
    ]);
    assert.ok(SORT_VALUES.ladder > SORT_VALUES.animal && SORT_VALUES.ladder < SORT_VALUES.signpost);
  });

  it('breaks ties nearest first (sortOn had no stable order)', () => {
    const order = orderChoices([
      { kind: 'item', classId: 'npc_piggy', label: 'far', distance: 80 },
      { kind: 'item', classId: 'npc_chicken', label: 'near', distance: 10 },
    ]).map((c) => c.label);
    assert.deepEqual(order, ['near', 'far']);
  });

  it('never lists ladders on Enter (LocationInputHandler.as 214-226)', () => {
    assert.equal(choiceKind(t('wall_ladder')), 'ladder');
    const choices = buildEnterChoices({ near: near([t('wall_ladder'), 1], [t('npc_piggy'), 2]) });
    assert.deepEqual(choices.map((c) => c.classId), ['npc_piggy']);
  });

  it('lists a garden once and opens the plot nearest-first picks', () => {
    const garden = t('garden_new', { label: 'Herb Garden' });
    const plotA = t('garden_plot', { state: { gardenEntity: garden } });
    const plotB = t('garden_plot', { state: { gardenEntity: garden } });
    const choices = buildEnterChoices({ near: near([plotA, 40], [garden, 90], [plotB, 20], [t('npc_piggy'), 50]) });
    assert.deepEqual(choices.map((c) => c.classId), ['npc_piggy', 'garden_new']);
    assert.equal(choices[1].label, 'Herb Garden');
    assert.equal(choices[1].open, plotB);
  });
});

describe('Enter plan (one opens directly, several choose)', () => {
  it('opens a single target and chooses among several', () => {
    assert.equal(planEnter([]).mode, 'none');
    const one = buildEnterChoices({ near: near([t('npc_piggy'), 5]) });
    assert.equal(planEnter(one).mode, 'single');
    assert.equal(planEnter(one).choice.classId, 'npc_piggy');
    const two = buildEnterChoices({ near: near([t('npc_piggy'), 5], [t('trant_fruit'), 50]) });
    assert.equal(planEnter(two).mode, 'chooser');
  });

  it('counts a signpost in reach as a target', () => {
    const choices = buildEnterChoices({ near: near([t('npc_piggy'), 5]), signpost: { signpost: {}, distance: 30, labels: ['Thicket'] } });
    assert.equal(planEnter(choices).mode, 'chooser');
  });
});

describe('Chooser line under the title (InteractionMenu.as 1957-2003)', () => {
  it('names signposts by their roads, stacks by count, and the cancel tile', () => {
    assert.equal(describeChoice({ kind: 'signpost', labels: ['Grand Mile', 'Thicket'] }), 'Signpost to Grand Mile, Thicket');
    assert.equal(describeChoice({ kind: 'signpost', labels: [] }), 'Signpost');
    const stack = t('dropped_item', { label: 'Cherry', state: { count: 7 } });
    assert.equal(describeChoice(buildEnterChoices({ near: near([stack, 1]) })[0]), 'Cherry (7)');
    assert.equal(describeChoice({ kind: 'cancel' }), 'Cancel');
    assert.equal(describeChoice({ kind: 'item', label: 'Piggy', target: t('npc_piggy') }), 'Piggy');
  });
});

describe('Chooser keys (InteractionMenu.as 1631-1678, 2011-2097)', () => {
  it('steps left and right with wrap', () => {
    assert.equal(gridMove(0, 'ArrowRight', 4, 4), 1);
    assert.equal(gridMove(3, 'ArrowRight', 4, 4), 0);
    assert.equal(gridMove(0, 'ArrowLeft', 4, 4), 3);
    assert.equal(gridMove(2, 'a', 4, 4), 1);
    assert.equal(gridMove(2, 'D', 4, 4), 3);
  });

  it('ignores up and down on a single row', () => {
    assert.equal(gridMove(1, 'ArrowUp', 4, 4), 1);
    assert.equal(gridMove(1, 'ArrowDown', 4, 4), 1);
  });

  it('moves between rows like focusUpChoice and focusDownChoice', () => {
    // 6 tiles in 4 columns: row 0 = 0..3, row 1 = 4..5.
    assert.equal(gridMove(1, 'ArrowDown', 6, 4), 5);
    assert.equal(gridMove(2, 'ArrowDown', 6, 4), 2); // no tile below: back to the top of the column
    assert.equal(gridMove(5, 'ArrowDown', 6, 4), 1); // last row wraps to the top
    assert.equal(gridMove(1, 'ArrowUp', 6, 4), 5); // top row wraps to the bottom
    assert.equal(gridMove(3, 'ArrowUp', 6, 4), 3); // bottom of column 3 is empty: one row up is itself
    assert.equal(gridMove(4, 'w', 6, 4), 0);
  });

  it('keeps the client grid widths for reference', () => {
    assert.equal(clientGridColumns(3), 3);
    assert.equal(clientGridColumns(7), 7);
    assert.equal(clientGridColumns(9), 7);
    assert.equal(clientGridColumns(16), 8);
  });
});

describe('game.js wiring', () => {
  it('imports the chooser under one key and opens it from Enter / E', () => {
    const keys = [...game.matchAll(/enter-chooser\.js\?v=([\w-]+)/g)].map((m) => m[1]);
    assert.equal(new Set(keys).size, 1, 'one key for enter-chooser.js');
    assert.match(game, /const plan = planEnter\(enterChoicesHere\(\)\);/);
    assert.match(game, /tryOpenNearestMenu\(\{ nearestFirst: e\.isTrusted === false \}\)/);
  });

  it('keeps nearest-first for &enterchooser=nearest and blocks play while open', () => {
    assert.match(game, /get\('enterchooser'\) === 'nearest'/);
    assert.match(game, /Boolean\(enterChooser\?\.isOpen\(\)\)/);
  });

  it('uses one reach for the nearest pick and the chooser', () => {
    const nearest = game.slice(game.indexOf('function nearestInteractable('), game.indexOf('function nearestInteractable(') + 400);
    assert.match(nearest, /interactReach\(t\)/);
    const here = game.slice(game.indexOf('function enterChoicesHere('), game.indexOf('function enterChoicesHere(') + 400);
    assert.match(here, /interactReach\(t\)/);
    assert.match(here, /if \(d < 100\)/);
  });

  it('ticket 80: a stack on the ground shows its item icon, never its count badge', () => {
    const at = game.indexOf('function enterChoiceIcon(');
    const icon = game.slice(at, game.indexOf('\n}\n', at));
    // Every dropped stack (not only the classes in content.js ITEM_ICONS) takes the item's icon.
    assert.match(icon, /if \(dropped && cls\) return itemIconUrl\(cls\);/);
    assert.ok(icon.indexOf('itemIconUrl(cls)') < icon.indexOf('renderer.extract'), 'before any drawing');
    // A drawn sprite with a count badge child is drawn from its own frame, without the badge.
    assert.match(icon, /const badged = Boolean\(spr\.countBadge \|\| spr\._countBadge\);/);
    assert.match(icon, /spr\.texture && \(!spr\.children\?\.length \|\| badged\) \? new PIXI\.Sprite\(spr\.texture\) : spr/);
    // The stack's badge lives on the sprite as countBadge, the guano pile's as _countBadge.
    assert.match(game, /spr\.countBadge = badge;\n\s+spr\.addChild\(badge\);/);
  });
});

describe('client source', { skip: !existsSync(client) && 'glitch-client not beside the spike' }, () => {
  it('still says what the chooser follows', () => {
    const imc = readFileSync(join(client, 'control/InteractionMenuController.as'), 'utf8');
    assert.match(imc, /present\('Choose the thing you want to interact with:'\)/);
    assert.match(imc, /newA\.sortOn\(\['disambugate_sort_on'\], \[Array\.NUMERIC\]\)/);
    const lih = readFileSync(join(client, 'view/renderer/LocationInputHandler.as'), 'utf8');
    assert.match(lih, /if \(!\(interaction_sprite is LadderView\)/);
    const lisv = readFileSync(join(client, 'view/itemstack/LocationItemstackView.as'), 'utf8');
    assert.match(lisv, /indexOf\('street_spirit'\) > -1\) \{\s*return 10;/);
  });
});

describe('tile art crop', () => {
  it('finds the drawn box in an RGBA buffer', async () => {
    const { alphaBox } = await import('../public/js/enter-chooser.js?v=4a3ea327');
    const w = 4;
    const h = 3;
    const rgba = new Uint8ClampedArray(w * h * 4);
    rgba[(1 * w + 2) * 4 + 3] = 255;
    rgba[(2 * w + 1) * 4 + 3] = 255;
    assert.deepEqual(alphaBox(rgba, w, h), { x: 1, y: 1, width: 2, height: 2 });
    assert.equal(alphaBox(new Uint8ClampedArray(w * h * 4), w, h), null);
  });
});

// Report 2026-11-12: a young Bean Tree's tile was blocky. Its trant cell is about 270 units tall
// at every stage and the young tree a few dozen rows at its foot; the resolution came from the
// cell, so the art was drawn a few px across and the 50 px tile stretched it.
describe('tile art at the tile\'s pixel size', () => {
  /** A fake extract: a thing whose art is the local box `art` inside `bounds`, drawn at a resolution. */
  function fakeThing(bounds, art) {
    const calls = [];
    const extract = ({ resolution, frame }) => {
      calls.push({ resolution, frame });
      const f = frame || bounds;
      const width = Math.max(1, Math.ceil(f.width * resolution));
      const height = Math.max(1, Math.ceil(f.height * resolution));
      const data = new Uint8ClampedArray(width * height * 4);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const lx = f.x + (x + 0.5) / resolution;
          const ly = f.y + (y + 0.5) / resolution;
          if (lx >= art.x && lx < art.x + art.width && ly >= art.y && ly < art.y + art.height) data[(y * width + x) * 4 + 3] = 255;
        }
      }
      return { width, height, getContext: () => ({ getImageData: () => ({ data }) }) };
    };
    return { extract, calls };
  }

  it('fills the tile at the device pixel ratio, from the art and not the frame', async () => {
    const { tileArtResolution, TILE_ICON_CSS } = await import('../public/js/enter-chooser.js?v=4a3ea327');
    assert.equal(TILE_ICON_CSS, 50);
    assert.equal(tileArtResolution(50, 50, { dpr: 2 }), 2);
    assert.equal(tileArtResolution(100, 100, { dpr: 3 }), 1.5);
    // A DPR past 3 draws as 3; under 1 as 1.
    assert.equal(tileArtResolution(50, 50, { dpr: 4 }), 3);
    assert.equal(tileArtResolution(50, 50, { dpr: 0.5 }), 1);
    // Tiny art is capped at 4x, and a large frame keeps the drawing at most 1024 px.
    assert.equal(tileArtResolution(5, 5, { dpr: 2 }), 4);
    assert.equal(tileArtResolution(20, 900, { dpr: 3 }), 1024 / 900);
    assert.equal(tileArtResolution(0), 1);
  });

  it('draws a young tree (small art at the foot of a tall cell) sharp: art px >= tile px', async () => {
    const { drawTileArt, alphaBox } = await import('../public/js/enter-chooser.js?v=4a3ea327');
    // A trant cell, anchored at its foot: 220 x 270 units; the young tree 40 x 45 at the bottom.
    const bounds = { x: -110, y: -270, width: 220, height: 270 };
    const art = { x: -18, y: -59, width: 40, height: 45 };
    const { extract, calls } = fakeThing(bounds, art);
    const canvas = drawTileArt({ extract, bounds, dpr: 2 });
    assert.ok(canvas);
    // The second pass draws only the art's box, at the resolution that makes it 100 px (50 CSS at 2x).
    assert.equal(calls.length, 2);
    assert.equal(calls[0].frame, undefined);
    const { frame, resolution } = calls[1];
    assert.ok(frame.x <= art.x && frame.y <= art.y, 'the art is inside the frame drawn');
    assert.ok(frame.x + frame.width >= art.x + art.width && frame.y + frame.height >= art.y + art.height);
    assert.ok(frame.width < 60 && frame.height < 60, 'only the art, not the cell');
    const box = alphaBox(canvas.getContext('2d').getImageData().data, canvas.width, canvas.height);
    assert.ok(Math.max(box.width, box.height) >= 96, `art drawn ${box.width}x${box.height} px for a 100 px tile`);
    assert.ok(Math.max(canvas.width, canvas.height) <= 112);
    // The old resolution, min(2, 100 / the frame's longer side), drew the same tree 17 px tall.
    const old = Math.min(2, 100 / 270);
    assert.ok(Math.round(art.height * old) < 20);
    assert.ok(resolution > old * 5);
  });

  it('keeps a thing that fills its frame (a MoeBot) at the same sharpness', async () => {
    const { drawTileArt } = await import('../public/js/enter-chooser.js?v=4a3ea327');
    const bounds = { x: -30, y: -80, width: 60, height: 80 };
    const { extract, calls } = fakeThing(bounds, bounds);
    const canvas = drawTileArt({ extract, bounds, dpr: 2 });
    assert.ok(canvas.height >= 100 && canvas.height <= 106);
    // The art's own height (the probe's box) makes 100 px; the frame drawn has a pixel of margin.
    assert.ok(calls[1].resolution >= 100 / 82 && calls[1].resolution <= 100 / 79, String(calls[1].resolution));
  });

  it('returns null for nothing drawn or no bounds', async () => {
    const { drawTileArt } = await import('../public/js/enter-chooser.js?v=4a3ea327');
    const bounds = { x: 0, y: 0, width: 10, height: 10 };
    assert.equal(drawTileArt({ extract: fakeThing(bounds, { x: 0, y: 0, width: 0, height: 0 }).extract, bounds }), null);
    assert.equal(drawTileArt({ extract: () => null, bounds: { x: 0, y: 0, width: 0, height: 0 } }), null);
    assert.equal(drawTileArt({ bounds }), null);
  });

  it('game.js draws each tile through drawTileArt at the device pixel ratio', () => {
    const at = game.indexOf('function enterChoiceIcon(');
    const icon = game.slice(at, game.indexOf('\n}\n', at));
    assert.match(icon, /drawTileArt\(\{/);
    assert.match(icon, /dpr: window\.devicePixelRatio \|\| 1/);
    assert.match(icon, /frame: new PIXI\.Rectangle\(frame\.x, frame\.y, frame\.width, frame\.height\)/);
    assert.doesNotMatch(icon, /100 \/ max/, 'no resolution from the frame size');
  });
});
