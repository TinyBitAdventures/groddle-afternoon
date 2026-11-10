import test from 'node:test';
import { imageSize } from '../tools/image-size.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

import {
  GAMESHOW_TICKET_ID,
  SPINNING_WHEEL_APPEAR_MS,
  SPINNING_WHEEL_REVEAL_MS,
  SPINNING_WHEEL_REWARD_MS,
  applySpinningWheelReward,
  canSpinWheel,
  createSpinningWheelState,
  ensureSpinningWheelItems,
  gameshowTicketChance,
  selectSpinningWheelReward,
  spinningWheelPhase,
  startSpinningWheel,
  wheelPrizeTier,
} from '../public/js/spinning-wheel.js?v=24c66e65';
import {
  ITEM_CATALOG,
  createInventory,
  listPackItemSlots,
} from '../public/js/inventory.js?v=60dfc9ca';
import {
  createShrineState,
  donateToShrine,
} from '../public/js/shrines.js?v=56ae73be';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function pngSize(file) {
  const bytes = fs.readFileSync(file);
  return { width: imageSize(bytes).w, height: imageSize(bytes).h };
}

test.describe('official Gameshow Ticket prize table', () => {
  test('preserves every outer cutoff and the nested Sno Cone table', () => {
    assert.deepEqual(selectSpinningWheelReward(0), {
      cutoff: 14,
      kind: 'currants',
      amount: 5,
      baseCost: 5,
      label: '5 currants',
    });
    assert.equal(selectSpinningWheelReward(0.14).amount, 25);
    assert.equal(selectSpinningWheelReward(0.24).classTsid, 'musicblock_x_shiny_01');
    assert.equal(selectSpinningWheelReward(0.33, 0).classTsid, 'sno_cone_blue');
    assert.equal(selectSpinningWheelReward(0.33, 0.4).classTsid, 'sno_cone_green');
    assert.equal(selectSpinningWheelReward(0.33, 0.67).classTsid, 'sno_cone_orange');
    assert.equal(selectSpinningWheelReward(0.33, 0.85).classTsid, 'sno_cone_red');
    assert.equal(selectSpinningWheelReward(0.33, 0.95).classTsid, 'sno_cone_purple');
    assert.equal(selectSpinningWheelReward(0.87).classTsid, GAMESHOW_TICKET_ID);
    assert.equal(selectSpinningWheelReward(0.96).amount, 500);
    assert.equal(selectSpinningWheelReward(0.98).classTsid, 'cubimal_package_2');
    assert.equal(selectSpinningWheelReward(0.99).classTsid, 'cubimal_package');
  });

  test('uses exact source base-cost tiers', () => {
    assert.equal(wheelPrizeTier(selectSpinningWheelReward(0)), 1);
    assert.equal(wheelPrizeTier(selectSpinningWheelReward(0.14)), 2);
    assert.equal(wheelPrizeTier(selectSpinningWheelReward(0.24)), 3);
    assert.equal(wheelPrizeTier(selectSpinningWheelReward(0.73)), 4);
    assert.equal(wheelPrizeTier(selectSpinningWheelReward(0.96)), 3);
  });

  test('ports the shrine ticket chance curve exactly', () => {
    assert.equal(gameshowTicketChance(5), 0);
    assert.equal(gameshowTicketChance(6), 0.04);
    assert.equal(gameshowTicketChance(79), 0.04);
    assert.equal(gameshowTicketChance(80), 0.04);
    assert.equal(gameshowTicketChance(200), 0.1);
    assert.equal(gameshowTicketChance(299), 0.1495);
    assert.equal(gameshowTicketChance(300), 0.15);
  });
});

test.describe('owner-only one-spin lifecycle', () => {
  test('waits for appearance, reveals color, awards, and disappears on source timing', () => {
    const wheel = createSpinningWheelState('ur', 1_000);
    assert.equal(spinningWheelPhase(wheel, 1_000), 'appear');
    assert.equal(canSpinWheel(wheel, 'ur', 1_000).reason, 'appearing');
    assert.equal(spinningWheelPhase(wheel, 1_000 + SPINNING_WHEEL_APPEAR_MS), 'ready');
    assert.equal(canSpinWheel(wheel, 'someone-else', 2_200).reason, 'owner');

    const result = startSpinningWheel(wheel, 'ur', {
      now: 2_200,
      rewardRoll: 0.96,
      colorRoll: 0.9,
      responseRoll: 0,
    });
    assert.equal(result.ok, true);
    assert.equal(result.color, 'red');
    assert.equal(result.reward.amount, 500);
    assert.equal(startSpinningWheel(wheel, 'ur', { now: 2_201 }).reason, 'spun');
    assert.equal(spinningWheelPhase(wheel, 2_200), 'spin');
    assert.equal(
      spinningWheelPhase(wheel, 2_200 + SPINNING_WHEEL_REVEAL_MS),
      'red_spin'
    );
    assert.equal(
      spinningWheelPhase(wheel, 2_200 + SPINNING_WHEEL_REWARD_MS),
      'red_end'
    );
    assert.equal(spinningWheelPhase(wheel, wheel.disappearAt), 'disappear');
    assert.equal(spinningWheelPhase(wheel, wheel.destroyAt), 'destroyed');
  });

  test('applies a prize exactly once, including another ticket', () => {
    const wheel = createSpinningWheelState('ur', 0);
    const inv = createInventory();
    const pc = { currants: 10 };
    startSpinningWheel(wheel, 'ur', {
      now: SPINNING_WHEEL_APPEAR_MS,
      rewardRoll: 0.87,
      colorRoll: 0,
      responseRoll: 0,
    });
    const won = applySpinningWheelReward(wheel, inv, pc);
    assert.equal(won.ok, true);
    assert.equal(inv.gameshow_ticket, 1);
    assert.equal(pc.currants, 10);
    assert.equal(applySpinningWheelReward(wheel, inv, pc).reason, 'already_applied');
    assert.equal(inv.gameshow_ticket, 1);
  });
});

test.describe('shrine source and client integration', () => {
  test('a qualifying donation can award one Gameshow Ticket deterministically', () => {
    const state = createShrineState();
    const inv = createInventory({ sammich: 1 });
    const pc = { mood: 50, xp: 0, imagination: 0 };
    const result = donateToShrine(state, 'mab', inv, pc, 'sammich', 1, {
      rng: () => 0.5,
      ticketRoll: 0.03,
    });
    assert.equal(result.ok, true);
    assert.equal(result.ticketChance, 0.04);
    assert.equal(result.gameshowTicket, true);
    assert.equal(inv.gameshow_ticket, 1);
  });

  test('registers accurate prize metadata and keeps custom icons in the pack', () => {
    ensureSpinningWheelItems();
    assert.equal(ITEM_CATALOG.musicblock_d_green_04.baseCost, 600);
    const slots = listPackItemSlots(createInventory({ musicblock_x_shiny_01: 1 }));
    assert.equal(slots.find((slot) => slot.classTsid === 'musicblock_x_shiny_01').icon,
      'assets/sprites/icons/musicblock_x_shiny_01.webp');
  });

  test('ships complete clean sprite sheets and runtime wiring', () => {
    const spriteDir = path.join(root, 'public/assets/sprites/spinning-wheel');
    // The OGA 514x450 cells cropped to the wheel's 172x267 box (WHEEL_TRIM, see below).
    assert.deepEqual(pngSize(path.join(spriteDir, 'appear.webp')), {
      width: 7 * 172,
      height: 2 * 267,
    });
    assert.deepEqual(pngSize(path.join(spriteDir, 'red-spin.webp')), {
      width: 7 * 172,
      height: 8 * 267,
    });
    assert.deepEqual(pngSize(path.join(spriteDir, 'red-end.webp')), {
      width: 172,
      height: 8 * 267,
    });
    for (const file of [
      'disappear.webp',
      'green-spin.webp',
      'green-end.webp',
      'white-spin.webp',
      'white-end.webp',
      'stoot-doll.webp',
    ]) {
      assert.equal(fs.existsSync(path.join(spriteDir, file)), true, file);
    }
    const game = fs.readFileSync(path.join(root, 'public/game.js'), 'utf8');
    const content = fs.readFileSync(path.join(root, 'public/content.js'), 'utf8');
    const html = fs.readFileSync(path.join(root, 'public/play/index.html'), 'utf8');
    assert.match(game, /function useGameshowTicket\(/);
    assert.match(game, /function updateSpinningWheel\(/);
    const soundKeys = fs.readFileSync(path.join(root, 'public/js/sound-keys.js'), 'utf8');
    assert.match(soundKeys, /"SPINNING_WHEEL": "assets\/audio\/ambient\/Spinning-Wheel_1292034939\.mp3"/);
    assert.match(game, /playSfx\('spinningWheel'/);
    assert.match(game, /data(?:set)?\.spinningWheelRewardApplied/);
    assert.match(game, /stootdemo/);
    assert.match(content, /classId === 'npc_spinning_wheel'/);
    assert.match(html, /"game\.js\?v=[0-9a-f]{8}"/);
  });
});

// The wheel was soft on a Retina screen next to the 3x avatar (Austin 2026-11-02, "is the spinning
// wheel slightly blurry?"): it drew the OGA 1x raster sheets at 0.72 x the stage x the screen's
// density. Every sheet now has a 3x render of npc_spinning_wheel.swf (glitch-items, CC0) sprite 290
// (tools/vector-sprites/spinning-wheel.json), loaded when the wheel spawns (firstDraw sheets).
test.describe('sharp Spinning Wheel sheets', () => {
  const WHEEL = Object.freeze({
    wheelAppear: { file: 'appear', label: 'appear', swfFrames: [19, 32], n: 14 },
    wheelWhiteSpin: { file: 'white-spin', label: 'white_spin', swfFrames: [154, 206], n: 53 },
    wheelWhiteEnd: { file: 'white-end', label: 'white_spin_end', swfFrames: [207, 214], n: 8 },
    wheelGreenSpin: { file: 'green-spin', label: 'green_spin', swfFrames: [93, 145], n: 53 },
    wheelGreenEnd: { file: 'green-end', label: 'green_spin_end', swfFrames: [146, 153], n: 8 },
    wheelRedSpin: { file: 'red-spin', label: 'red_spin', swfFrames: [215, 267], n: 53 },
    wheelRedEnd: { file: 'red-end', label: 'red_spin_end', swfFrames: [268, 275], n: 8 },
    // The smoke fills the whole cell; cells 9-17 are empty (the wheel is gone) and stay 1x.
    wheelDisappear: { file: 'disappear', label: 'disappear', swfFrames: [276, 284], n: 18, art: 9 },
  });
  const sheetPath = (file) => `assets/sprites/spinning-wheel/${file}.webp`;

  async function wheelRows() {
    const { gameSheetTable } = await import('./sheet-sources.js');
    return new Map(gameSheetTable().filter((r) => r.name in WHEEL).map((r) => [r.name, r]));
  }

  /** Lossless WebP (VP8L) or extended (VP8X) canvas size. */
  function webpSize(file) {
    const b = fs.readFileSync(file);
    assert.equal(b.subarray(8, 12).toString(), 'WEBP', file);
    const chunk = b.subarray(12, 16).toString();
    if (chunk === 'VP8L') {
      return {
        width: 1 + (((b[22] & 0x3f) << 8) | b[21]),
        height: 1 + (((b[24] & 0x0f) << 10) | (b[23] << 2) | ((b[22] & 0xc0) >> 6)),
      };
    }
    assert.equal(chunk, 'VP8X', file);
    return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
  }

  test('frame counts and timings are the original sheets\', the crop gives each frame its whole cell back', async () => {
    const rows = await wheelRows();
    assert.equal(rows.size, Object.keys(WHEEL).length);
    for (const [name, want] of Object.entries(WHEEL)) {
      const r = rows.get(name);
      assert.equal(r.path, sheetPath(want.file), name);
      assert.equal(r.n, want.n, `${name} frames`);
      const size = pngSize(path.join(root, 'public', r.path));
      assert.deepEqual(size, { width: r.cols * r.fw, height: r.rows * r.fh }, `${name} grid`);
      if (name === 'wheelDisappear') {
        assert.deepEqual([r.fw, r.fh, r.trim], [514, 450, undefined], 'the smoke keeps the whole cell');
        continue;
      }
      // The 514x450 OGA cell, its art cropped to one shared box (WHEEL_TRIM in game.js).
      assert.deepEqual([r.fw, r.fh], [172, 267], name);
      assert.deepEqual(r.trim, { x: 170, y: 181, w: 514, h: 450 }, name);
      assert.ok(r.trim.x + r.fw <= r.trim.w && r.trim.y + r.fh <= r.trim.h, `${name} crop inside the cell`);
    }
    const game = fs.readFileSync(path.join(root, 'public/game.js'), 'utf8');
    // The wheel's lifecycle (1.2 s appear, 0.6 s disappear; js/spinning-wheel.js times the phases).
    assert.match(game, /sprite\.animationSpeed = 14 \/ 72;/);
    assert.match(game, /sprite\.animationSpeed = 18 \/ 36;/);
    assert.match(game, /if \(trim\) trimFrame\(frame, trim\);/);
    assert.match(game, /texture\.orig = new PIXI\.Rectangle\(0, 0, w, h\);/);
  });

  test('the crop keeps all of the wheel: no cell\'s art reaches the crop\'s edge', async () => {
    const rows = [...(await wheelRows()).values()].filter((r) => r.trim)
      .map((r) => ({ ...r, path: path.join(root, 'public', r.path) }));
    const py = `import json,sys
from PIL import Image
out=[]
for r in json.load(sys.stdin):
    a=Image.open(r['path']).convert('RGBA').getchannel('A')
    for i in range(r['n']):
        x,y=(i%r['cols'])*r['fw'],(i//r['cols'])*r['fh']
        b=a.crop((x,y,x+r['fw'],y+r['fh'])).getbbox()
        if not b or b[0]<1 or b[1]<1 or b[2]>r['fw']-1 or b[3]>r['fh']-1: out.append(f"{r['name']} cell {i} {b}")
print(json.dumps(out))`;
    let bad;
    try {
      bad = JSON.parse(execFileSync('python3.11', ['-I', '-c', py], { input: JSON.stringify(rows), encoding: 'utf8' }));
    } catch (err) {
      if (/ENOENT|No module named/.test(String(err))) return;
      throw err;
    }
    assert.deepEqual(bad, []);
  });

  test('every sheet has a 3x render from npc_spinning_wheel.swf, matched to the 1x frame for frame', async () => {
    const { HIRES_SPRITES, SPLIT_SPRITES, FIRST_DRAW_SPRITES } = await import('../public/js/sprite-hires.js?v=dd5da64c');
    const results = JSON.parse(fs.readFileSync(path.join(root, 'tools/vector-sprites/results.json'), 'utf8'));
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'tools/vector-sprites/spinning-wheel.json'), 'utf8'));
    assert.deepEqual(
      manifest.jobs.flatMap((j) => j.sheets.map((s) => s.path)).sort(),
      Object.values(WHEEL).map((w) => sheetPath(w.file)).sort(),
    );
    const rows = await wheelRows();
    for (const [name, want] of Object.entries(WHEEL)) {
      const key = sheetPath(want.file);
      const r = rows.get(name);
      const result = results[key];
      assert.equal(result?.status, 'ok', key);
      assert.equal(result.swf, 'misc/npc/npc_spinning_wheel/npc_spinning_wheel.swf');
      assert.equal(result.sprite, 290);
      assert.equal(result.label, want.label, key);
      assert.deepEqual(result.swfFrames, want.swfFrames, `${key}: one SWF frame per cell, in order`);
      const art = want.art ?? want.n;
      assert.equal(result.cells, art, key);
      assert.equal(result.frameScores.length, art, key);
      // The silhouette match after the 3:1 downscale (the Chicken's stand scored 0.963).
      assert.ok(Math.min(...result.frameScores) >= 0.97, `${key} min ${Math.min(...result.frameScores)}`);
      assert.ok(FIRST_DRAW_SPRITES.has(key), `${key} waits for the wheel (game.js preloadWheelSheets)`);
      const split = SPLIT_SPRITES.get(key);
      if (!split) {
        const twin = HIRES_SPRITES.get(key);
        assert.match(twin || '', /@3x\.webp$/, key);
        assert.deepEqual(webpSize(path.join(root, 'public', twin)), { width: 3 * r.cols * r.fw, height: 3 * r.rows * r.fh }, twin);
        continue;
      }
      assert.ok(!HIRES_SPRITES.has(key), key);
      assert.deepEqual([split.fw, split.fh, split.cols], [r.fw, r.fh, r.cols], key);
      let next = 0;
      for (const [url, from, count, cols] of split.parts) {
        assert.equal(from, next, `${url} follows the last part`);
        next += count;
        assert.match(url, /\.p\d@3x\.webp$/);
        const size = webpSize(path.join(root, 'public', url));
        assert.deepEqual(size, { width: 3 * cols * r.fw, height: 3 * Math.ceil(count / cols) * r.fh }, url);
        assert.ok(size.width <= 8192 && size.height <= 8192 && size.width * size.height * 4 <= 64 * 2 ** 20, `${url} in the texture budget`);
      }
      assert.equal(next, art, `${key}: parts cover the cells with art`);
    }
    // Files exactly 3x their 1x sheet and js/sprite-hires.js current (no FFDec needed).
    const vs = path.join(root, 'tools/vector-sprites');
    const out = execFileSync(process.execPath, [path.join(vs, 'build.mjs'), '--manifest', path.join(vs, 'spinning-wheel.json'), '--check'], { encoding: 'utf8' });
    assert.match(out, /spinning-wheel\.json: ok/);
  });

  test('the 3x covers the wheel\'s draw scale on a 2x laptop at Original zoom, and loads before it plays', async () => {
    const { stageFor } = await import('../public/js/location-view.js?v=f1f922b4');
    const game = fs.readFileSync(path.join(root, 'public/game.js'), 'utf8');
    const scale = Number(/new PIXI\.AnimatedSprite\(textures\.wheelAppear\.frames\);\n\s+sprite\.anchor\.set\(0\.5, 1\);\n\s+sprite\.scale\.set\(([\d.]+)\);/.exec(game)?.[1]);
    assert.equal(scale, 0.72);
    for (const [w, h] of [[1280, 740], [1512, 880], [1728, 1010]]) {
      const draw = scale * stageFor({ width: w, height: h, sceneWidth: 4000, sceneHeight: 1000, zoom: 1 }).scale * 2;
      assert.ok(draw > 1 && draw <= 3, `${w} x ${h}: drawn ${draw.toFixed(2)}x`);
    }
    assert.match(game, /preloadWheelSheets\(\['wheelAppear', 'wheelWhiteSpin', 'wheelDisappear'\]\);\n\s+setSpinningWheelVisual\(spinningWheelTarget, 'appear'\);/);
    assert.match(game, /preloadWheelSheets\(\[wheelSheetKey\(`\$\{result\.color\}_spin`\), wheelSheetKey\(`\$\{result\.color\}_end`\)\]\);/);
  });
});
