/**
 * Gameshow Ticket and Spinning Wheel rules recovered from:
 * - items/gameshow_ticket.js
 * - items/npc_spinning_wheel.js
 * - items/catalog_drop_tables.js (`spinning_wheel` and `sno_cones`)
 * - items/include/shrines.js
 */

import { addItem, ensureItem } from './inventory.js?v=catalog-unified-3';
import { musicblockItemMeta } from './musicblocks.js';

export const GAMESHOW_TICKET_ID = 'gameshow_ticket';
export const SPINNING_WHEEL_APPEAR_MS = 1_200;
export const SPINNING_WHEEL_REVEAL_MS = 2_500;
export const SPINNING_WHEEL_REWARD_MS = 4_000;
export const SPINNING_WHEEL_PRIZE_HOLD_MS = 3_000;
export const SPINNING_WHEEL_DISAPPEAR_MS = 600;
export const SPINNING_WHEEL_LIFETIME_MS = 5 * 60 * 1_000;

const ITEM_DEFS = Object.freeze({
  gameshow_ticket: Object.freeze({
    label: 'Gameshow Ticket',
    desc: "One glittery, razzling, dazzling game show ticket. Ain't nothing you can do but USE it.",
    baseCost: 0,
  }),
  musicblock_x_shiny_01: Object.freeze(musicblockItemMeta('musicblock_x_shiny_01')),
  musicblock_x_shiny_02: Object.freeze(musicblockItemMeta('musicblock_x_shiny_02')),
  musicblock_b_brown_03: Object.freeze(musicblockItemMeta('musicblock_b_brown_03')),
  musicblock_d_green_04: Object.freeze(musicblockItemMeta('musicblock_d_green_04')),
  musicblock_d_red_05: Object.freeze(musicblockItemMeta('musicblock_d_red_05')),
  cubimal_package: Object.freeze({
    label: 'Cubimal Series 1 Box',
    desc: 'Contains one Series 1 Cubimal. Open it up to find out which one is inside.',
    baseCost: 5_000,
  }),
  cubimal_package_2: Object.freeze({
    label: 'Cubimal Series 2 Box',
    desc: 'Contains one Series 2 Cubimal. Open it up to find out which one is inside.',
    baseCost: 5_000,
  }),
  sno_cone_blue: Object.freeze({
    label: 'Blue Sno Cone',
    desc: 'A delicious, refreshing Blue Sno Cone with a tangy hit of iMG.',
    baseCost: 75,
  }),
  sno_cone_green: Object.freeze({
    label: 'Green Sno Cone',
    desc: 'A bright green blend of ice, hooch, elements, and a modest hit of iMG.',
    baseCost: 150,
  }),
  sno_cone_orange: Object.freeze({
    label: 'Orange Sno Cone',
    desc: 'A chillingly refreshing Orange Sno Cone with a medium amount of iMG.',
    baseCost: 300,
  }),
  sno_cone_red: Object.freeze({
    label: 'Red Sno Cone',
    desc: 'A tongue-tingling, spine-shiveringly Red Sno Cone.',
    baseCost: 600,
  }),
  sno_cone_purple: Object.freeze({
    label: 'Purple Sno Cone',
    desc: 'A refreshing and delicious Purple Sno Cone with considerable iMG.',
    baseCost: 1_100,
  }),
});

export const SPINNING_WHEEL_DROP_TABLE = Object.freeze([
  Object.freeze({ cutoff: 14, kind: 'currants', amount: 5, baseCost: 5, label: '5 currants' }),
  Object.freeze({ cutoff: 24, kind: 'currants', amount: 25, baseCost: 25, label: '25 currants' }),
  Object.freeze({ cutoff: 33, kind: 'item', classTsid: 'musicblock_x_shiny_01', amount: 1 }),
  Object.freeze({ cutoff: 42, kind: 'drop_table', table: 'sno_cones' }),
  Object.freeze({ cutoff: 51, kind: 'item', classTsid: 'musicblock_x_shiny_02', amount: 1 }),
  Object.freeze({ cutoff: 59, kind: 'item', classTsid: 'bean_plain', amount: 1, baseCost: 1 }),
  Object.freeze({ cutoff: 67, kind: 'item', classTsid: 'musicblock_b_brown_03', amount: 1 }),
  Object.freeze({ cutoff: 74, kind: 'item', classTsid: 'musicblock_d_green_04', amount: 1 }),
  Object.freeze({ cutoff: 81, kind: 'currants', amount: 100, baseCost: 100, label: '100 currants' }),
  Object.freeze({ cutoff: 88, kind: 'item', classTsid: GAMESHOW_TICKET_ID, amount: 1, baseCost: 0 }),
  Object.freeze({ cutoff: 93, kind: 'item', classTsid: 'musicblock_d_red_05', amount: 1 }),
  Object.freeze({ cutoff: 97, kind: 'currants', amount: 500, baseCost: 500, label: '500 currants' }),
  Object.freeze({ cutoff: 99, kind: 'item', classTsid: 'cubimal_package_2', amount: 1 }),
  Object.freeze({ cutoff: 100, kind: 'item', classTsid: 'cubimal_package', amount: 1 }),
]);

export const SNO_CONE_DROP_TABLE = Object.freeze([
  Object.freeze({ cutoff: 40, classTsid: 'sno_cone_blue' }),
  Object.freeze({ cutoff: 67, classTsid: 'sno_cone_green' }),
  Object.freeze({ cutoff: 85, classTsid: 'sno_cone_orange' }),
  Object.freeze({ cutoff: 95, classTsid: 'sno_cone_red' }),
  Object.freeze({ cutoff: 100, classTsid: 'sno_cone_purple' }),
]);

export const SPINNING_WHEEL_RESPONSES = Object.freeze({
  spin_me: Object.freeze([
    'Spin me!',
    'Give me a whirl!',
    'Spin me right round, baby. Right round!',
    'Spin, spin, spin the wheel of prizes!',
    'Roll right up! Spin it till you win it!',
  ]),
  tier1: Object.freeze([
    "Congratu... Oh. Well, it's still a prize.",
    'Come on down! The prize is ... terrible!',
    "Hmn. Well, you're not going home empty handed, right?",
    'Booby prize!!! Heh. I said Booby. Heh heh heh.',
    'Try again... You smell lucky today...',
  ]),
  tier2: Object.freeze([
    'A win of mediocre value is still a win!',
    'A prize just above the level of booby prize! Gratz!',
    'Winner winner chicken dinner! Or something of equal value!',
    "Nicely done, you've got a knack for this...",
    'I see even better luck in your future. Try again soon!',
  ]),
  tier3: Object.freeze([
    'A triumph! Well, almost. Two thirds, maybe. A Biumph!',
    'Oooh! A whiff of the jackpot! Maybe next time...',
    'Congratu - medium-sized - lations!',
    'Use it wisely, spend it well, winner!',
    'Ah, the luck of the Irish. Are you Irish?',
  ]),
  tier4: Object.freeze([
    "Wheeeeeeeee! Who's a super-special Glitch then?!",
    'Oooooh! We have a WINNER, laydeez and gentlegiants!',
    'Oh my! I believe you have hit the jackpot!',
    'BULLSEYE!',
    "Didn't you do WELL?! Spin again! Tell your friends!",
  ]),
});

function normalizedRoll(value) {
  const roll = Number(value);
  if (!Number.isFinite(roll)) return 0;
  return Math.max(0, Math.min(0.999999999, roll));
}

function percentile(value) {
  return Math.floor(normalizedRoll(value) * 100) + 1;
}

function pickByRoll(rows, roll) {
  const point = percentile(roll);
  return rows.find((row) => point <= row.cutoff) || rows[rows.length - 1];
}

export function ensureSpinningWheelItems() {
  for (const [classTsid, def] of Object.entries(ITEM_DEFS)) {
    ensureItem(classTsid, def);
  }
}

export function gameshowTicketChance(baseCost) {
  const value = Math.max(0, Number(baseCost) || 0);
  if (value < 6) return 0;
  if (value < 80) return 0.04;
  if (value < 300) return 0.0005 * value;
  return 0.15;
}

export function selectSpinningWheelReward(rewardRoll, snoConeRoll = rewardRoll) {
  const selected = pickByRoll(SPINNING_WHEEL_DROP_TABLE, rewardRoll);
  if (selected.kind === 'drop_table') {
    const snoCone = pickByRoll(SNO_CONE_DROP_TABLE, snoConeRoll);
    const def = ITEM_DEFS[snoCone.classTsid];
    return {
      kind: 'item',
      classTsid: snoCone.classTsid,
      amount: 1,
      label: def.label,
      baseCost: def.baseCost,
      table: 'sno_cones',
    };
  }
  if (selected.kind === 'item') {
    const def = ITEM_DEFS[selected.classTsid];
    return {
      ...selected,
      label: def?.label || selected.classTsid.replace(/_/g, ' '),
      baseCost: selected.baseCost ?? def?.baseCost ?? 0,
    };
  }
  return { ...selected };
}

export function wheelPrizeTier(reward) {
  const baseCost = Math.max(0, Number(reward?.baseCost) || 0);
  if (baseCost <= 10) return 1;
  if (baseCost <= 100) return 2;
  if (baseCost <= 500) return 3;
  return 4;
}

export function wheelResponse(tier, roll = 0) {
  const pool = SPINNING_WHEEL_RESPONSES[`tier${tier}`] || SPINNING_WHEEL_RESPONSES.tier1;
  return pool[Math.floor(normalizedRoll(roll) * pool.length)] || pool[0];
}

export function spinMeResponse(roll = 0) {
  const pool = SPINNING_WHEEL_RESPONSES.spin_me;
  return pool[Math.floor(normalizedRoll(roll) * pool.length)] || pool[0];
}

export function createSpinningWheelState(ownerId = 'player', now = Date.now()) {
  return {
    ownerId: String(ownerId || 'player'),
    createdAt: now,
    readyAt: now + SPINNING_WHEEL_APPEAR_MS,
    expiresAt: now + SPINNING_WHEEL_LIFETIME_MS,
    spun: false,
    spinStartedAt: 0,
    revealAt: 0,
    rewardAt: 0,
    disappearAt: 0,
    destroyAt: 0,
    color: '',
    reward: null,
    response: '',
    rewardApplied: false,
  };
}

export function canSpinWheel(state, ownerId = 'player', now = Date.now()) {
  if (!state) return { ok: false, reason: 'missing' };
  if (state.ownerId !== String(ownerId || 'player')) {
    return { ok: false, reason: 'owner', message: "This wheel isn't here for you." };
  }
  if (state.spun) return { ok: false, reason: 'spun', message: 'This wheel has already been spun.' };
  if (now < state.readyAt) return { ok: false, reason: 'appearing', message: 'The wheel is still appearing.' };
  if (now >= state.expiresAt) return { ok: false, reason: 'expired', message: 'The wheel has disappeared.' };
  return { ok: true };
}

export function startSpinningWheel(
  state,
  ownerId = 'player',
  {
    rewardRoll = Math.random(),
    snoConeRoll = Math.random(),
    colorRoll = Math.random(),
    responseRoll = Math.random(),
    now = Date.now(),
  } = {}
) {
  const gate = canSpinWheel(state, ownerId, now);
  if (!gate.ok) return gate;
  const colors = ['green', 'white', 'red'];
  const reward = selectSpinningWheelReward(rewardRoll, snoConeRoll);
  const tier = wheelPrizeTier(reward);
  state.spun = true;
  state.spinStartedAt = now;
  state.revealAt = now + SPINNING_WHEEL_REVEAL_MS;
  state.rewardAt = now + SPINNING_WHEEL_REWARD_MS;
  state.disappearAt = state.rewardAt + SPINNING_WHEEL_PRIZE_HOLD_MS;
  state.destroyAt = state.disappearAt + SPINNING_WHEEL_DISAPPEAR_MS;
  state.color = colors[Math.floor(normalizedRoll(colorRoll) * colors.length)] || colors[0];
  state.reward = reward;
  state.response = wheelResponse(tier, responseRoll);
  return { ok: true, color: state.color, reward, tier, response: state.response };
}

export function spinningWheelPhase(state, now = Date.now()) {
  if (!state) return 'destroyed';
  if (state.spun) {
    if (now >= state.destroyAt) return 'destroyed';
    if (now >= state.disappearAt) return 'disappear';
    if (now >= state.rewardAt) return `${state.color}_end`;
    if (now >= state.revealAt) return `${state.color}_spin`;
    return 'spin';
  }
  if (now >= state.expiresAt + SPINNING_WHEEL_DISAPPEAR_MS) return 'destroyed';
  if (now >= state.expiresAt) return 'disappear';
  if (now >= state.readyAt) return 'ready';
  return 'appear';
}

export function applySpinningWheelReward(state, inv, pc) {
  if (!state?.spun || !state.reward) return { ok: false, reason: 'not_spun' };
  if (state.rewardApplied) return { ok: false, reason: 'already_applied' };
  const reward = state.reward;
  if (reward.kind === 'currants') {
    pc.currants = (Number(pc.currants) || 0) + reward.amount;
  } else if (reward.kind === 'item') {
    ensureSpinningWheelItems();
    addItem(inv, reward.classTsid, reward.amount);
  } else {
    return { ok: false, reason: 'unknown_reward' };
  }
  state.rewardApplied = true;
  return {
    ok: true,
    reward,
    tier: wheelPrizeTier(reward),
    response: state.response,
    label: reward.kind === 'currants'
      ? `${reward.amount} currants`
      : `${reward.amount > 1 ? `${reward.amount} × ` : ''}${reward.label}`,
  };
}
