import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
} from '../public/js/spinning-wheel.js';
import {
  ITEM_CATALOG,
  createInventory,
  listPackItemSlots,
} from '../public/js/inventory.js?v=catalog-unified-7';
import {
  createShrineState,
  donateToShrine,
} from '../public/js/shrines.js?v=spinning-wheel-test-9';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function pngSize(file) {
  const bytes = fs.readFileSync(file);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
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
      'assets/sprites/icons/musicblock_x_shiny_01.png');
  });

  test('ships complete clean sprite sheets and runtime wiring', () => {
    const spriteDir = path.join(root, 'public/assets/sprites/spinning-wheel');
    assert.deepEqual(pngSize(path.join(spriteDir, 'appear.png')), {
      width: 3_598,
      height: 900,
    });
    assert.deepEqual(pngSize(path.join(spriteDir, 'red-spin.png')), {
      width: 3_598,
      height: 3_600,
    });
    assert.deepEqual(pngSize(path.join(spriteDir, 'red-end.png')), {
      width: 514,
      height: 3_600,
    });
    for (const file of [
      'disappear.png',
      'green-spin.png',
      'green-end.png',
      'white-spin.png',
      'white-end.png',
      'stoot-doll.png',
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
    assert.match(html, /wheel=1/);
  });
});
