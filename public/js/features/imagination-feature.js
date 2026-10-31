/**
 * Imagination ("iMG") upgrade shop: the late-Glitch hand of three upgrade
 * cards dealt from the upgrade tree, bought with spendable iMG.
 *
 * Rules: js/imagination.js (GameServerJS players/inc_imagination.js over
 * inc_data_imagination.js). Effects other modules read: js/imagination-effects.js.
 * What each card does here: js/imagination-remake.js (the shop deals only
 * wired cards).
 *
 * Card art is the original imagination_cards.swf kit (bg, pattern, suit,
 * art, icon layers on a 230x310 frame) exported by build-imagination.mjs.
 * The card flips to its back for the description and Get Upgrade button,
 * like ImgCardUI.as.
 *
 * Owns: pc.imaginationUpgrades (owned ids, read by quoins/food/movement/
 * trants/garden/patches/skills), the save slice (hand, history, brain
 * capacity, energy tank bonus, daily re-deal), movement physics for the
 * walk/jump cards, the skill-time query, and the two keepable cards.
 *
 * QA: ?imgdemo=1 opens the shop with plenty of iMG (&imglevel=N sets the
 * level, &imgseed=N makes the deal deterministic, &imgflip=0-2 shows a card's
 * back, &imgview=owned opens the owned list, &imgcard=<id> deals that card
 * into slot 1); &imgautoplay=buy buys the
 * first affordable card, uses the free re-deal and buys again; =owned opens
 * the owned list after buying; =card buys slot 1. Canvas attributes: imgHand, imgOwned,
 * imgLast, imgShuffled, imgAutoplay, imgBrain, imgEnergyMax.
 */

import { addItem, countItem, ensureItem, removeItem } from '../inventory.js?v=85d4faba';
import { getGameDayKey } from '../game-day.js?v=3095e05b';
import { quoinDailyLimitFor } from '../quoins.js?v=d4f4772b';
import { XP_FOR_LEVEL } from '../progression.js?v=33462eaa';
import {
  CARD_ART_LAYERS,
  HAND_SIZE,
  IMAGINATION_UPGRADES,
  buildDeck,
  STARTER_UPGRADES,
  canFreeReshuffle,
  cardText,
  createImaginationState,
  dealHand,
  grantStarterUpgrades,
  grantUpgrade,
  learnTimeReductions,
  normalizeImaginationState,
  ownedUpgradeList,
  purchaseCard,
  remakeMovementMultipliers,
  reshuffleHand,
} from '../imagination.js?v=b4f0eaf6';
import { brainCapacityRescale, skillTimeFactor } from '../imagination-effects.js?v=70169933';
import { betterLearningDiscount } from '../better-learning.js?v=044ff9ff';
import { rescaleStudiesForLearningModifier } from '../skills.js?v=4542bdf9';
import { isOfferedInRemake, remakeStatus } from '../imagination-remake.js?v=ca0a48d5';
import { hellFeature } from './hell-feature.js?v=2d9958f9';

const ART = 'assets/imagination/cards/';
const UI = 'assets/imagination/ui/';
const BASE_ENERGY_TANK = 100;
const RESHUFFLE_CARD = 'upgrade_card_reshuffle';
const RESURRECTION_CARD = 'upgrade_card_instant_resurrection';

const KEEPABLE_ITEMS = {
  [RESHUFFLE_CARD]: {
    label: 'Reshuffle Card',
    namePlural: 'Reshuffle Cards',
    desc: "Swap this card for a free reshuffle of your Upgrade Cards.",
    baseCost: 100,
    stackMax: 50,
    sellable: false,
  },
  [RESURRECTION_CARD]: {
    label: 'Get Out of Hell Free Card',
    namePlural: 'Get Out of Hell Free Cards',
    desc: 'Used while dead, this card resurrects you at once with a full tank of energy and mood.',
    baseCost: 100,
    stackMax: 50,
    sellable: false,
  },
};

let state = createImaginationState();
let engineRef = null;
let panel = null;
let view = 'hand';
let flipped = -1;
let busyAnim = false;
let lastResult = '';
let autoplayDone = false;
let rng = Math.random;

// ---------------------------------------------------------------------------
// Context and stats
// ---------------------------------------------------------------------------

function owned(engine = engineRef) {
  const pc = engine?.pc;
  if (!pc) return [];
  if (!Array.isArray(pc.imaginationUpgrades)) pc.imaginationUpgrades = [];
  return pc.imaginationUpgrades;
}

function energyMax(engine = engineRef) {
  return BASE_ENERGY_TANK + state.energyTankBonus;
}

function ctxFor(engine = engineRef) {
  const pc = engine?.pc || {};
  return {
    level: Number(pc.level) || 1,
    owned: owned(engine),
    learned: engine?.learnedSkills || [],
    achievements: engine?.unlockedAchievements || [],
    questsDone: engine?.questState?.completed || [],
    maxEnergy: energyMax(engine),
    quoinMultiplier: Number(engine?.quoinState?.multiplier) || 1,
    brainCapacity: state.brainCapacity,
    inTutorial: false,
    offerable: engine?.mode === 'multiplayer' ? offeredInMultiplayer : isOfferedInRemake,
  };
}

/**
 * Cards that need other players, dealt in multiplayer only: Trade Channelling
 * opens the Trade Channel there (register G326, groups-feature; player.js:3404
 * canJoinTradeChat); the Transcendental cards change a radiation between real
 * players (G330, radiance.go: Radius I-III the range, Prolonger and
 * Prolongest the time; Transcendental Highway the radiator's bonus,
 * meditation-feature); Mantra Meditation keeps your own chat from breaking a
 * meditation, and Tune Out The Chatter, which lets an incoming instant message
 * by (players/player.js:1854-1859), is dealt as its prerequisite
 * (inc_data_imagination.js:5192). Solo deals what it always did.
 */
const MULTIPLAYER_OFFERS = new Set([
  'trade_channel',
  'transcendental_radius_1',
  'transcendental_radius_2',
  'transcendental_radius_3',
  'transcendental_benefits_1',
  'transcendental_benefits_2',
  'transcendental_imagination',
  'meditative_arts_less_distraction',
  'meditative_arts_less_distraction_2',
  // G332: Snapshottery lets Enter take a Snap in Camera Mode (player.js 2148-2173, snaps-feature);
  // the filter packs stay out (the remake has no photo filters).
  'snapshotting',
]);
const offeredInMultiplayer = (id) => isOfferedInRemake(id) || MULTIPLAYER_OFFERS.has(id);

/** Keep the player's tank in step with purchased Energy Tank cards. */
function syncEnergyTank(engine = engineRef, refill = false) {
  const pc = engine?.pc;
  if (!pc) return;
  pc.energyMax = energyMax(engine);
  if (refill) pc.energy = pc.energyMax;
  else if (pc.energy > pc.energyMax) pc.energy = pc.energyMax;
}

function dayKey() {
  return getGameDayKey(Date.now());
}

function play(key, opts = {}) {
  try {
    engineRef?.playSound?.(key, { volume: 0.6, ...opts });
  } catch {
    /* audio is optional */
  }
}

// ---------------------------------------------------------------------------
// Granting
// ---------------------------------------------------------------------------

function ensureKeepableItems() {
  for (const [id, meta] of Object.entries(KEEPABLE_ITEMS)) ensureItem(id, meta);
}

/** Apply a grant effect to the world (stats, items) after the rules record it. */
function applyEffect(effect, engine = engineRef) {
  if (!effect || !engine) return [];
  const notes = [];
  if (effect.energyTank) {
    syncEnergyTank(engine, true);
    notes.push(`Energy tank ${energyMax(engine)}`);
  }
  if (effect.quoinMultiplier && engine.quoinState) {
    engine.quoinState.multiplier = Math.min(100, (Number(engine.quoinState.multiplier) || 1) + effect.quoinMultiplier);
    notes.push(`Quoin multiplier ×${engine.quoinState.multiplier.toFixed(2).replace(/\.?0+$/, '')}`);
  }
  if (effect.quoinLimit && engine.quoinState) {
    engine.quoinState.dailyLimit = Math.max(engine.quoinState.dailyLimit || 0, quoinDailyLimitFor(owned(engine)));
    notes.push(`Daily quoin limit ${engine.quoinState.dailyLimit}`);
  }
  if (effect.brainCapacity) notes.push(`Brain capacity ${state.brainCapacity}`);
  if (effect.item) {
    if (KEEPABLE_ITEMS[effect.item.classTsid]) ensureKeepableItems();
    addItem(engine.inv, effect.item.classTsid, effect.item.count);
    notes.push('Added to your pack');
  }
  return notes;
}

/**
 * skills_increase_brain_capacity: a bigger brain shortens the study in
 * progress by the new/old learning-time modifier (Stoot's 2012 fix).
 */
function rescaleStudyForBrainCapacity(engine, capacityBefore) {
  const queue = engine?.skillQueue;
  if (!queue || capacityBefore === state.brainCapacity) return null;
  const count = (engine.learnedSkills || []).length + Object.keys(queue).length;
  const percent = brainCapacityRescale(count, capacityBefore, state.brainCapacity);
  const result = rescaleStudiesForLearningModifier({ queue }, percent, Date.now());
  engine.setData('imgStudyRescale', result.ok
    ? `${percent.toFixed(4)}:${result.rescaled.map((row) => `${row.classTsid}-${row.timeChange}s`).join(',')}`
    : 'unchanged');
  return result;
}

// ---------------------------------------------------------------------------
// Shop actions
// ---------------------------------------------------------------------------

function refillHand(engine = engineRef) {
  dealHand(state, ctxFor(engine), rng);
}

function buySlot(slot, engine = engineRef) {
  if (!engine || busyAnim) return { ok: false, reason: 'busy' };
  const before = state.hand[slot];
  const pc = engine.pc;
  const wallet = { imagination: Number(pc.imagination) || 0 };
  const capacityBefore = state.brainCapacity;
  const result = purchaseCard(state, owned(engine), wallet, slot, ctxFor(engine), { rng });
  if (!result.ok) {
    play('CLICK_FAILURE');
    engine.toast(result.reason || 'You cannot buy that.');
    lastResult = `fail:${before?.class_tsid || ''}`;
    publish(engine);
    return result;
  }
  pc.imagination = wallet.imagination;
  const notes = applyEffect(result.effect, engine);
  if (result.effect?.brainCapacity) rescaleStudyForBrainCapacity(engine, capacityBefore);
  play('IMAGINATION_PURCHASE', { volume: 0.7 });
  const name = result.text?.name || result.card.class_tsid;
  engine.pushActivity(`You got the ${name} upgrade!`);
  lastResult = `bought:${result.card.class_tsid}`;
  engine.updateHud();
  engine.save();
  flipped = -1;
  celebrate(slot, result, notes);
  publish(engine);
  return result;
}

function freeRedeal(engine = engineRef) {
  const result = reshuffleHand(state, ctxFor(engine), { dayKey: dayKey(), free: true, rng });
  if (!result.ok) {
    play('CLICK_FAILURE');
    engine.toast(result.reason);
    return result;
  }
  afterRedeal(engine, 'Your upgrade cards have been re-dealt.');
  return result;
}

function useReshuffleCard(engine = engineRef) {
  if (!removeItem(engine.inv, RESHUFFLE_CARD, 1)) {
    engine.toast('You need a Reshuffle Card.');
    return { ok: false };
  }
  reshuffleHand(state, ctxFor(engine), { free: false, rng });
  afterRedeal(engine, 'You reshuffled the cards in your hand.');
  return { ok: true };
}

function afterRedeal(engine, message) {
  flipped = -1;
  lastResult = 'redeal';
  play('CLICK_SUCCESS');
  engine.pushActivity(message);
  engine.refreshPack?.();
  engine.save();
  render(true);
  publish(engine);
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

const PANEL_CSS = `
#imagination-panel{background:color-mix(in srgb, var(--c-navy-16) 45%, transparent)}
.img-card-shell{position:relative;width:min(760px,96vw);max-height:min(86vh,700px,calc(100% - 16px));overflow:auto;border-radius:var(--radius-2xl);
  background:var(--c-violet-20) url(${UI}imagination_space.png) center/341px 187px repeat;box-shadow:0 18px 50px color-mix(in srgb, var(--c-black) 45%, transparent);
  color:var(--c-mauve-95);padding:var(--sp-7) var(--sp-9) var(--sp-8);border:1px solid color-mix(in srgb, var(--c-violet-79) 25%, transparent)}
.img-card-shell::before{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;
  background:radial-gradient(ellipse at 50% 0%,color-mix(in srgb, var(--c-violet-64) 28%, transparent),transparent 60%),radial-gradient(ellipse at 50% 110%,color-mix(in srgb, var(--c-blue-74) 18%, transparent),transparent 55%)}
.img-head{position:relative;display:flex;align-items:center;gap:var(--sp-6);flex-wrap:wrap}
.img-head h2{margin:0;font-size:var(--fs-3xl);font-weight:800;letter-spacing:.01em;color:var(--text-inverse);text-shadow:0 2px 0 color-mix(in srgb, var(--c-black) 35%, transparent)}
.img-head .img-kicker{margin:0;font-size:var(--fs-sm);text-transform:uppercase;letter-spacing:.12em;color:var(--c-violet-83)}
.img-balance{margin-left:auto;display:flex;align-items:center;gap:var(--sp-4);background:color-mix(in srgb, var(--surface-bright) 10%, transparent);border:1px solid color-mix(in srgb, var(--c-white) 18%, transparent);
  border-radius:var(--radius-pill);padding:var(--sp-2) var(--sp-6) var(--sp-2) var(--sp-3);font-weight:700}
.img-balance img{width:38px;height:30px}
.img-balance strong{font-size:var(--fs-lg)}
.img-x{background:color-mix(in srgb, var(--surface-bright) 12%, transparent);color:var(--text-inverse);border:0;border-radius:var(--radius-round);width:30px;height:30px;font-size:var(--fs-2xl);line-height:28px;cursor:pointer}
.img-x:hover{background:color-mix(in srgb, var(--surface-bright) 25%, transparent)}
.img-tabs{position:relative;display:flex;gap:var(--sp-3);margin:var(--sp-6) 0 var(--sp-2)}
.img-tabs button{font:inherit;font-size:var(--fs-md);font-weight:700;color:var(--c-violet-88);background:color-mix(in srgb, var(--surface-bright) 8%, transparent);border:1px solid color-mix(in srgb, var(--c-white) 14%, transparent);
  border-radius:var(--radius-pill);padding:var(--sp-2) var(--sp-6);cursor:pointer}
.img-tabs button[aria-selected="true"]{background:var(--surface-bright);color:var(--c-violet-30)}
.img-hand{position:relative;display:flex;justify-content:center;gap:var(--sp-9);padding:var(--sp-8) 0 var(--sp-3);perspective:1100px;flex-wrap:wrap}
.img-card{--w:207px;--h:279px;position:relative;width:var(--w);height:var(--h);border:0;padding:0;background:none;cursor:pointer;
  transform-style:preserve-3d;transition:transform .5s cubic-bezier(.2,.7,.2,1);border-radius:var(--radius-md);outline-offset:4px}
.img-card.dealing{animation:img-deal .55s cubic-bezier(.2,.8,.25,1) both}
.img-card.dealing:nth-child(2){animation-delay:.09s}.img-card.dealing:nth-child(3){animation-delay:.18s}
@keyframes img-deal{from{transform:translateY(-90px) rotate(-8deg) scale(.7);opacity:0}to{transform:none;opacity:1}}
.img-card:hover:not(.flipped){transform:translateY(-6px)}
.img-card.flipped{transform:rotateY(180deg) scale(1.05);animation:none}
.img-card.bought{animation:img-bought .9s ease-in forwards;pointer-events:none}
@keyframes img-bought{0%{transform:rotateY(0) scale(1)}35%{transform:translateY(-24px) scale(1.12);filter:brightness(1.4)}100%{transform:translateY(-180px) scale(.4);opacity:0}}
.img-face{position:absolute;inset:0;border-radius:var(--radius-md);overflow:hidden;backface-visibility:hidden;-webkit-backface-visibility:hidden;
  box-shadow:0 6px 16px color-mix(in srgb, var(--c-black) 45%, transparent);background:var(--c-grey-94)}
.img-face::after{content:"";position:absolute;inset:0;border-radius:var(--radius-md);box-shadow:inset 0 0 0 4.5px color-mix(in srgb, var(--c-white) 30%, transparent);pointer-events:none}
.img-face img.layer{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;user-select:none}
.img-front .img-title{position:absolute;left:4.5px;right:4.5px;bottom:4.5px;padding:var(--sp-5) var(--sp-6) 11px;background:color-mix(in srgb, var(--c-black) 30%, transparent);
  border-radius:0 0 var(--radius-xs) var(--radius-xs);color:var(--text-inverse);font-weight:800;font-size:var(--fs-base);line-height:var(--lh-tight);text-align:center;text-shadow:0 2px 2px color-mix(in srgb, var(--c-black) 30%, transparent)}
.img-front .img-cost{position:absolute;top:9px;right:12px;color:var(--text-inverse);font-weight:800;font-size:var(--fs-lg);text-shadow:0 -1px 1.5px color-mix(in srgb, var(--c-black) 55%, transparent)}
.img-front.keepable .img-title{background:none;color:var(--c-grey-45);text-shadow:none;bottom:31px}
.img-front.keepable .img-cost{color:var(--c-grey-53);text-shadow:none}
.img-card.poor .img-front .img-cost{color:var(--c-red-90)}
.img-card.poor .img-front img.art,.img-card.poor .img-front img.icon{opacity:.35}
.img-card.poor .img-front .img-title{background:color-mix(in srgb, var(--surface-bright) 30%, transparent)}
.img-back{transform:rotateY(180deg);color:var(--c-navy-36);text-align:left}
.img-back .img-back-text{position:absolute;inset:0;padding:var(--sp-8) var(--sp-8) var(--sp-6);display:flex;flex-direction:column}
.img-back h3{margin:0 0 var(--sp-4);font-size:var(--fs-base);line-height:var(--lh-tight);color:var(--text);text-shadow:0 1px 0 var(--c-white)}
.img-back p{margin:0;font-size:var(--fs-sm);line-height:var(--lh-normal);color:var(--c-mauve-40);text-shadow:0 1px 0 color-mix(in srgb, var(--c-white) 70%, transparent)}
.img-back .img-note{margin-top:var(--sp-3);font-size:var(--fs-xs);color:var(--c-violet-48c);font-style:italic}
.img-back .img-buy{margin-top:auto;font:inherit;font-weight:800;font-size:var(--fs-base);border:0;border-radius:var(--radius-sm);padding:9px var(--sp-5);cursor:pointer;
  background:linear-gradient(var(--c-green-78),var(--c-green-63));color:var(--text-inverse);text-shadow:0 1px 0 color-mix(in srgb, var(--c-black) 25%, transparent);box-shadow:0 3px 0 var(--c-green-52)}
.img-back .img-buy:disabled{background:var(--c-grey-84);color:var(--c-slate-58b);box-shadow:0 3px 0 var(--c-slate-74b);cursor:not-allowed;text-shadow:none}
.img-back .img-back-cost{align-self:flex-end;margin-top:var(--sp-3);font-weight:800;font-size:var(--fs-lg);color:var(--c-navy-36);text-shadow:0 1px 0 var(--c-white)}
.img-help{position:relative;text-align:center;font-size:var(--fs-md);color:var(--c-violet-88);margin:var(--sp-2) 0 var(--sp-5)}
.img-foot{position:relative;display:flex;align-items:center;justify-content:center;gap:var(--sp-7);flex-wrap:wrap}
.img-foot button{font:inherit;font-size:var(--fs-md);font-weight:700;display:inline-flex;align-items:center;gap:7px;color:var(--text-inverse);
  background:linear-gradient(var(--c-violet-59),var(--c-violet-48b));border:1px solid color-mix(in srgb, var(--c-white) 25%, transparent);border-radius:var(--radius-pill);padding:var(--sp-3) var(--sp-7);cursor:pointer;
  box-shadow:0 2px 0 color-mix(in srgb, var(--c-black) 35%, transparent)}
.img-foot button:hover:not(:disabled){filter:brightness(1.1)}
.img-foot button:disabled{opacity:.45;cursor:not-allowed}
.img-foot img{width:16px;height:17px}
.img-foot small{display:block;width:100%;text-align:center;font-size:var(--fs-sm);color:var(--c-violet-83)}
.img-empty{position:relative;text-align:center;padding:var(--sp-20) var(--sp-5);color:var(--c-violet-88)}
.img-owned{position:relative;display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:var(--sp-6);padding:var(--sp-6) 0 var(--sp-2)}
.img-mini{position:relative;text-align:center;font-size:var(--fs-sm);line-height:var(--lh-tight);color:var(--c-mauve-93)}
.img-mini .img-mini-card{position:relative;width:92px;height:124px;margin:0 auto 5px;border-radius:var(--radius-sm);overflow:hidden;box-shadow:0 3px 8px color-mix(in srgb, var(--c-black) 45%, transparent)}
.img-mini .img-mini-card img{position:absolute;inset:0;width:100%;height:100%}
.img-mini b{display:block;color:var(--text-inverse)}
.img-mini .img-tag{display:inline-block;margin-top:var(--sp-1);padding:1px var(--sp-3);border-radius:var(--radius-pill);background:color-mix(in srgb, var(--surface-bright) 14%, transparent);font-size:var(--fs-2xs);color:var(--c-violet-88)}
.img-mini .img-count{position:absolute;top:2px;right:calc(50% - 50px);background:var(--c-gold-89);color:var(--c-umber-30);font-weight:800;border-radius:var(--radius-pill);padding:0 var(--sp-3);font-size:var(--fs-xs)}
.img-celebrate{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:var(--sp-5);
  background:color-mix(in srgb, var(--c-navy-16) 78%, transparent);border-radius:inherit;z-index:calc(var(--z-raised) + 2);animation:img-fade .25s ease-out;text-align:center;padding:var(--sp-8)}
.img-celebrate .img-card{pointer-events:none;animation:img-pop .6s cubic-bezier(.2,1.4,.4,1) both}
@keyframes img-pop{from{transform:scale(.4) rotate(-6deg);opacity:0}to{transform:none;opacity:1}}
@keyframes img-fade{from{opacity:0}to{opacity:1}}
.img-celebrate h3{margin:0;font-size:var(--fs-2xl);color:var(--text-inverse)}
.img-celebrate p{margin:0;font-size:var(--fs-base);color:var(--c-violet-88)}
.img-celebrate button{font:inherit;font-weight:800;border:0;border-radius:var(--radius-pill);padding:7px var(--sp-9);background:var(--c-gold-89);color:var(--c-umber-30);cursor:pointer}
.img-sparkle{position:absolute;inset:0;pointer-events:none;background-image:radial-gradient(circle,color-mix(in srgb, var(--surface-bright) 95%, transparent) 0 1.4px,transparent 2px);
  background-size:38px 46px;opacity:.0;animation:img-sparkle 2.4s linear infinite;mix-blend-mode:screen}
@keyframes img-sparkle{0%{opacity:0;background-position:0 0}50%{opacity:.55}100%{opacity:0;background-position:19px 23px}}
.meta-stat.img-stat-link{cursor:pointer}
.meta-stat.img-stat-link:hover{filter:brightness(1.08)}
@media (max-width:640px){.img-card{--w:150px;--h:202px}.img-front .img-title{font-size:var(--fs-sm);padding:7px var(--sp-4)}.img-front .img-cost{font-size:var(--fs-base)}
  .img-back h3{font-size:var(--fs-md)}.img-back p{font-size:var(--fs-2xs)}.img-back .img-back-text{padding:var(--sp-5)}.img-hand{gap:var(--sp-5)}}
@media (max-width:480px){.img-card{--w:132px;--h:178px}}
`;

function el(tag, attrs = {}, text = '') {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  if (text) node.textContent = text;
  return node;
}

function layer(name, cls = '') {
  return el('img', { class: `layer ${cls}`.trim(), src: `${ART}${name}.svg`, alt: '', draggable: 'false' });
}

function frontLayers(config) {
  const out = [];
  for (const field of ['bg', 'pattern', 'suit', 'art', 'icon']) {
    if (config[field]) out.push(layer(`${field}_${config[field]}`, field));
  }
  return out;
}

function formatCost(n) {
  return `${Math.round(n).toLocaleString('en-US')}i`;
}

function buildCard(card, slot, ctx, { dealing = false } = {}) {
  const text = cardText(card, ctx);
  const affordable = (Number(engineRef?.pc?.imagination) || 0) >= card.cost;
  const btn = el('button', {
    type: 'button',
    class: `img-card${dealing ? ' dealing' : ''}${affordable ? '' : ' poor'}${flipped === slot ? ' flipped' : ''}`,
    dataset: { slot: String(slot), upgrade: card.class_tsid },
    'aria-label': `${text.name}, ${formatCost(card.cost)}`,
  });
  // The deal animation holds its last frame (fill both), which would override
  // the flip and hover transforms; drop it once the card has landed.
  if (dealing) btn.addEventListener('animationend', () => btn.classList.remove('dealing'), { once: true });
  const front = el('div', { class: `img-face img-front${text.keepable ? ' keepable' : ''}` });
  front.append(...frontLayers(text.config));
  if (text.config.bg === 'gold') front.append(el('div', { class: 'img-sparkle' }));
  if (!text.config.hide_front_name) front.append(el('div', { class: 'img-title' }, text.name));
  if (!text.keepable || card.cost) front.append(el('div', { class: 'img-cost' }, formatCost(card.cost)));
  const back = el('div', { class: 'img-face img-back' });
  back.append(layer('bg_back'));
  // Keepable cards have no suit back in the client art (build-imagination.mjs).
  const suitBack = `suit_${text.config.suit}_back`;
  if (text.config.suit && CARD_ART_LAYERS.includes(suitBack)) back.append(layer(suitBack));
  const bt = el('div', { class: 'img-back-text' });
  bt.append(el('h3', {}, text.name), el('p', {}, text.desc));
  const status = remakeStatus(card.class_tsid);
  if (status.status === 'partial') bt.append(el('p', { class: 'img-note' }, status.note));
  const buy = el('button', { type: 'button', class: 'img-buy', dataset: { buy: String(slot) }, disabled: !affordable }, affordable ? 'Get Upgrade' : 'Need more iMG');
  bt.append(buy, el('div', { class: 'img-back-cost' }, formatCost(card.cost)));
  back.append(bt);
  btn.append(front, back);
  return btn;
}

function ensurePanel() {
  if (panel) return panel;
  if (!document.getElementById('img-css')) {
    const style = document.createElement('style');
    style.id = 'img-css';
    style.textContent = PANEL_CSS;
    document.head.appendChild(style);
  }
  // MPANELS: the modern skin gives it the panel shell's centred frame (style.css .ui-sheet-*): the
  // head (icon, title, balance, U key cap, close), the tabs, a body that scrolls and the footer
  // with Re-deal. The parts marked mp-modern-only are the modern skin's alone.
  panel = el('div', { id: 'imagination-panel', class: 'glitch-modal imagination-panel ui-sheet ui-sheet-center', hidden: true });
  panel.innerHTML = `<div class="img-card-shell ui-sheet-card" role="dialog" aria-modal="true" aria-labelledby="img-title">
    <div class="img-head ui-sheet-head">
      <img class="ui-sheet-icon img-head-icon mp-modern-only" src="${UI}imagination_button.png" alt="" />
      <div class="img-head-title"><p class="img-kicker">Imagination</p><h2 id="img-title" class="ui-sheet-title" tabindex="-1">Upgrade</h2></div>
      <div class="img-balance" title="Spendable imagination"><img src="${UI}imagination_button.png" alt="iMG" /><strong data-img-balance>0</strong></div>
      <span class="kcap ui-sheet-key mp-modern-only" aria-hidden="true">U</span>
      <button type="button" class="img-x ui-sheet-x" data-img-close aria-label="Close Upgrades (Esc)">×</button>
    </div>
    <div class="img-tabs ui-sheet-tabs" role="tablist" aria-label="Upgrades">
      <button type="button" role="tab" data-img-tab="hand" aria-selected="true">Your hand</button>
      <button type="button" role="tab" data-img-tab="owned" aria-selected="false" tabindex="-1">Your upgrades</button>
    </div>
    <div class="img-body ui-sheet-body" data-img-body></div>
    <div class="img-foot-bar ui-sheet-foot" data-img-foot></div>
  </div>`;
  const host = document.getElementById('make-panel')?.parentElement || document.body;
  host.appendChild(panel);
  panel.addEventListener('click', onPanelClick);
  window.addEventListener('keydown', onKeyDown, true);
  return panel;
}

function onPanelClick(e) {
  if (e.target === panel || e.target.closest('[data-img-close]')) {
    closePanel();
    return;
  }
  const tab = e.target.closest('[data-img-tab]');
  if (tab) {
    view = tab.dataset.imgTab;
    flipped = -1;
    render();
    return;
  }
  if (e.target.closest('[data-img-continue]')) {
    panel.querySelector('.img-celebrate')?.remove();
    busyAnim = false;
    render(true);
    return;
  }
  const buy = e.target.closest('[data-buy]');
  if (buy) {
    e.stopPropagation();
    buySlot(Number(buy.dataset.buy));
    return;
  }
  if (e.target.closest('[data-img-redeal]')) {
    freeRedeal();
    return;
  }
  if (e.target.closest('[data-img-reshuffle-card]')) {
    useReshuffleCard(engineRef);
    return;
  }
  const card = e.target.closest('.img-hand .img-card');
  if (card && !busyAnim) {
    const slot = Number(card.dataset.slot);
    flipped = flipped === slot ? -1 : slot;
    play(flipped === slot ? 'FLIP_OVER' : 'FLIP_BACK');
    for (const node of panel.querySelectorAll('.img-hand .img-card')) {
      node.classList.toggle('flipped', Number(node.dataset.slot) === flipped);
    }
  }
}

/** Home is an instance but not busy for X and U; Decorate and Cultivate are (as Camera Mode). */
const blocked = () => !engineRef || engineRef.busy({ ignoreHome: true }) || Boolean(engineRef.query?.('homeEditMode', engineRef));

function onKeyDown(e) {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
  if (!panel || panel.hidden) {
    // HUB: while the modern skin's Imagination hub is up it has the keys (js/ui/imagination-hub.js).
    if (engineRef?.imaginationHubOpen?.()) return;
    if (!typing && (e.key === 'x' || e.key === 'X') && !e.metaKey && !e.ctrlKey && !e.altKey && !blocked()) {
      e.preventDefault();
      // X is the Imagination menu (ImgMenuView): the hub in the modern skin, else the panel.
      if (!engineRef.imaginationHub?.()) openPanel();
    }
    // G221: U opens the upgrade cards (TSMainView.as 663, uKeyHandler 996-1010:
    // ImgMenuView with Cloud.TYPE_UPGRADES). KeyBeacon.as 288-295 sends Shift+U as
    // SHIFT_PLUS_ U, which nothing hears, and a held key does not fire again.
    if (!typing && (e.key === 'u' || e.key === 'U') && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey && !e.repeat &&
        engineRef?.started && !blocked()) {
      e.preventDefault();
      e.stopImmediatePropagation();
      openPanel({ view: 'hand' });
    }
    return;
  }
  // The shop is modal: keep keys away from the avatar while it is open.
  e.stopImmediatePropagation();
  if (e.key === 'Escape' || e.key === 'x' || e.key === 'X') {
    e.preventDefault();
    if (panel.querySelector('.img-celebrate')) {
      panel.querySelector('.img-celebrate').remove();
      busyAnim = false;
      render(true);
    } else closePanel();
  } else if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key) && e.target?.closest?.('[data-img-tab]')) {
    // MPANELS: the tabs move with the arrow keys (the tab follows focus).
    e.preventDefault();
    view = e.key === 'Home' ? 'hand' : e.key === 'End' ? 'owned' : view === 'hand' ? 'owned' : 'hand';
    flipped = -1;
    render();
    panel.querySelector(`[data-img-tab="${view}"]`)?.focus({ preventScroll: true });
  } else if (['1', '2', '3'].includes(e.key) && view === 'hand' && !busyAnim) {
    const slot = Number(e.key) - 1;
    flipped = flipped === slot ? -1 : slot;
    render();
  } else if (e.key === 'Enter' && flipped >= 0 && !busyAnim) {
    e.preventDefault();
    buySlot(flipped);
  }
}

function openPanel(opts = {}) {
  if (!engineRef) return;
  ensurePanel();
  if (opts.view) view = opts.view;
  refillHand(engineRef);
  panel.hidden = false;
  flipped = -1;
  play('CARD_DEAL1');
  render(true);
  publish(engineRef);
}

function closePanel() {
  if (!panel) return;
  panel.hidden = true;
  panel.querySelector('.img-celebrate')?.remove();
  busyAnim = false;
  flipped = -1;
  if (engineRef) publish(engineRef);
}

function render(dealing = false) {
  if (!panel || panel.hidden) return;
  const engine = engineRef;
  const ctx = ctxFor(engine);
  panel.querySelector('[data-img-balance]').textContent = (Number(engine.pc.imagination) || 0).toLocaleString('en-US');
  const ownedList = ownedUpgradeList(state, owned(engine));
  for (const tab of panel.querySelectorAll('[data-img-tab]')) {
    tab.setAttribute('aria-selected', String(tab.dataset.imgTab === view));
    tab.tabIndex = tab.dataset.imgTab === view ? 0 : -1;
    if (tab.dataset.imgTab === 'owned') tab.textContent = `Your upgrades (${ownedList.length})`;
  }
  const body = panel.querySelector('[data-img-body]');
  body.replaceChildren();
  // The footer: Re-deal with the hand, the count of cards with Your upgrades; Esc in both.
  const footBar = panel.querySelector('[data-img-foot]') || body;
  if (footBar !== body) footBar.replaceChildren();
  const escHint = () => {
    if (footBar === body) return;
    const esc = el('span', { class: 'ui-sheet-esc mp-modern-only' });
    esc.append(el('span', { class: 'kcap' }, 'Esc'), document.createTextNode(' close'));
    footBar.append(esc);
  };
  if (view === 'owned') {
    renderOwned(body, ownedList);
    if (footBar !== body) footBar.append(el('p', { class: 'panel-meta img-foot-note mp-modern-only' }, `${ownedList.length} ${ownedList.length === 1 ? 'upgrade' : 'upgrades'} so far`));
    escHint();
    return;
  }
  const hand = el('div', { class: 'img-hand' });
  state.hand.forEach((card, slot) => {
    if (card) hand.append(buildCard(card, slot, ctx, { dealing }));
  });
  if (!hand.children.length) {
    body.append(el('div', { class: 'img-empty' }, 'Your hand is empty. Level up, learn skills and earn badges to unlock more upgrades.'));
  } else {
    body.append(hand, el('p', { class: 'img-help' }, 'Select a card above to learn about the upgrade'));
  }
  const foot = el('div', { class: 'img-foot' });
  const free = canFreeReshuffle(state, dayKey());
  const redeal = el('button', { type: 'button', dataset: { imgRedeal: '1' }, disabled: !free });
  redeal.append(el('img', { src: `${UI}${free ? 'redeal' : 'redeal_no'}.png`, alt: '' }), document.createTextNode('Re-deal cards'));
  foot.append(redeal);
  const cards = countItem(engine.inv, RESHUFFLE_CARD);
  if (cards > 0) {
    const use = el('button', { type: 'button', dataset: { imgReshuffleCard: '1' } });
    use.append(el('img', { src: 'assets/sprites/icons/upgrade_card_reshuffle.png', alt: '', style: 'width:14px;height:19px' }), document.createTextNode(`Use a Reshuffle Card (${cards})`));
    foot.append(use);
  }
  foot.append(el('small', {}, free ? 'You can re-deal once a day' : "You've already re-dealt today"));
  footBar.append(foot);
  escHint();
}

function renderOwned(body, list) {
  if (!list.length) {
    body.append(el('div', { class: 'img-empty' }, 'No upgrades yet.'));
    return;
  }
  const grid = el('div', { class: 'img-owned' });
  for (const row of list) {
    const status = remakeStatus(row.id);
    const mini = el('div', { class: 'img-mini', title: `${row.desc}\n\nIn this remake: ${status.note}` });
    const card = el('div', { class: 'img-mini-card' });
    card.append(...frontLayers(row.config));
    mini.append(card);
    if (row.count > 1) mini.append(el('span', { class: 'img-count' }, `×${row.count}`));
    mini.append(el('b', {}, row.name));
    const live = status.status === 'live' || (engineRef?.mode === 'multiplayer' && MULTIPLAYER_OFFERS.has(row.id));
    const tag = row.starter ? 'Tutorial card' : live ? '' : status.status === 'partial' ? 'Partly here' : 'Not here yet';
    if (tag) mini.append(el('span', { class: 'img-tag' }, tag));
    grid.append(mini);
  }
  body.append(grid);
}

function celebrate(slot, result, notes) {
  if (!panel || panel.hidden) return;
  busyAnim = true;
  const node = panel.querySelector(`.img-hand .img-card[data-slot="${slot}"]`);
  node?.classList.add('bought');
  const shell = panel.querySelector('.img-card-shell');
  const overlay = el('div', { class: 'img-celebrate' });
  const card = buildCard({ ...result.card }, -2, ctxFor(engineRef));
  card.classList.remove('poor');
  overlay.append(card, el('h3', {}, `You got the ${result.text?.name || 'upgrade'} upgrade!`));
  const status = remakeStatus(result.card.class_tsid);
  const lines = [result.text?.desc?.replace(/ Your current .*$/, ''), ...notes];
  if (status.status === 'partial') lines.push(status.note);
  overlay.append(el('p', {}, lines.filter(Boolean).join(' · ')));
  overlay.append(el('button', { type: 'button', dataset: { imgContinue: '1' } }, 'Nice!'));
  setTimeout(() => {
    if (!panel || panel.hidden) return;
    shell.append(overlay);
    panel.querySelector('[data-img-balance]').textContent = (Number(engineRef.pc.imagination) || 0).toLocaleString('en-US');
  }, node ? 420 : 0);
}

// ---------------------------------------------------------------------------
// HUD entry points
// ---------------------------------------------------------------------------

function installChrome() {
  if (document.getElementById('img-btn')) return;
  ensurePanel();
  const skills = document.getElementById('skills-btn');
  const btn = el('button', { id: 'img-btn', type: 'button', class: 'chrome-btn img-chrome-btn', title: 'Imagination upgrades (U)' });
  // Text only, like the rest of the menu (Austin 2026-10-29); the iMG mark stays on the panel itself.
  btn.append(document.createTextNode('Upgrades'));
  btn.addEventListener('click', () => (panel && !panel.hidden ? closePanel() : openPanel()));
  if (skills?.parentElement) skills.parentElement.insertBefore(btn, skills.nextSibling);
  const stat = document.getElementById('stat-img')?.closest('.meta-stat');
  if (stat) {
    stat.classList.add('img-stat-link');
    stat.title = 'Spend imagination on upgrades (X)';
    stat.addEventListener('click', () => openPanel());
  }
}

// ---------------------------------------------------------------------------
// QA
// ---------------------------------------------------------------------------

function seededRng(seed) {
  let s = (Number(seed) || 1) >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function publish(engine = engineRef) {
  if (!engine) return;
  engine.setData('imgHand', state.hand.map((c) => (c ? `${c.class_tsid}:${c.cost}` : '-')).join(','));
  engine.setData('imgOwned', String(owned(engine).length));
  engine.setData('imgLast', lastResult || 'none');
  engine.setData('imgShuffled', canFreeReshuffle(state, dayKey()) ? 'no' : 'yes');
  engine.setData('imgBrain', String(state.brainCapacity));
  engine.setData('imgEnergyMax', String(energyMax(engine)));
  engine.setData('imgOpen', panel && !panel.hidden ? 'yes' : 'no');
}

let demoStarted = false;

function setupDemo(engine) {
  if (demoStarted || !engine.param('imgdemo')) return;
  demoStarted = true;
  const pc = engine.pc;
  const level = Math.min(XP_FOR_LEVEL.length, Math.floor(Number(engine.param('imglevel')) || 0));
  if (level > 1) {
    pc.xp = Math.max(Number(pc.xp) || 0, XP_FOR_LEVEL[level - 2]);
    pc.level = level;
  }
  pc.imagination = Math.max(Number(pc.imagination) || 0, 250000);
  if (engine.param('imgseed')) rng = seededRng(engine.param('imgseed'));
  state.hand = Array(HAND_SIZE).fill(null);
  state.shuffledDay = null;
  setTimeout(() => {
    openPanel({ view: engine.param('imgview') === 'owned' ? 'owned' : 'hand' });
    const forced = engine.param('imgcard');
    if (forced && IMAGINATION_UPGRADES[forced]) {
      // QA: put one exact card in the first slot, priced the way the deck would.
      const row = buildDeck({ ...ctxFor(engine), offerable: null }).find((c) => c.class_tsid === forced);
      state.hand[0] = row
        ? { class_tsid: row.class_tsid, amount: row.amount || 0, cost: row.cost }
        : { class_tsid: forced, amount: 0, cost: IMAGINATION_UPGRADES[forced].cost };
      render();
      publish(engine);
    }
    const flip = Number(engine.param('imgflip'));
    if (Number.isInteger(flip) && flip >= 0 && flip < HAND_SIZE && engine.param('imgflip') !== null) {
      flipped = flip;
      render();
    }
    const auto = engine.param('imgautoplay');
    if (auto) runAutoplay(engine, auto);
  }, 400);
}

function cheapestAffordableSlot(engine) {
  let best = -1;
  state.hand.forEach((card, i) => {
    if (card && card.cost <= engine.pc.imagination && (best < 0 || card.cost < state.hand[best].cost)) best = i;
  });
  return best;
}

function runAutoplay(engine, mode) {
  if (mode === 'card') {
    setTimeout(() => {
      flipped = 0;
      render();
    }, 700);
    setTimeout(() => buySlot(0, engine), 1600);
    setTimeout(() => {
      autoplayDone = true;
      engine.setData('imgAutoplay', 'done');
      publish(engine);
    }, 2400);
    return;
  }
  const steps = [
    () => {
      const slot = cheapestAffordableSlot(engine);
      if (slot >= 0) {
        flipped = slot;
        render();
      }
    },
    () => {
      const slot = flipped >= 0 ? flipped : cheapestAffordableSlot(engine);
      if (slot >= 0) buySlot(slot, engine);
    },
    () => {
      panel.querySelector('.img-celebrate')?.remove();
      busyAnim = false;
      render(true);
      freeRedeal(engine);
    },
    () => {
      const slot = cheapestAffordableSlot(engine);
      if (slot >= 0) buySlot(slot, engine);
    },
    () => {
      if (mode === 'owned') {
        panel.querySelector('.img-celebrate')?.remove();
        busyAnim = false;
        view = 'owned';
        render();
      }
      autoplayDone = true;
      engine.setData('imgAutoplay', 'done');
      publish(engine);
    },
  ];
  steps.forEach((fn, i) => setTimeout(fn, 900 + i * 1500));
}

// ---------------------------------------------------------------------------
// Feature
// ---------------------------------------------------------------------------

export const imaginationFeature = {
  id: 'imagination',

  init(engine) {
    engineRef = engine;
    ensureKeepableItems();
    installChrome();
    // Fresh games never call restore(): grant the tutorial cards here too.
    // A new multiplayer player (js/new-player.js) buys them in the tutorial
    // instead (grantTutorialUpgrade), so they are marked as handled, not granted.
    if (engine.newPlayer) state.starterGranted = true;
    else grantStarterUpgrades(state, owned(engine));
    syncEnergyTank(engine);
    publish(engine);
  },

  onStreetEnter(street, engine) {
    setupDemo(engine);
    publish(engine);
  },

  save() {
    return state;
  },

  restore(slice, engine) {
    engineRef = engine || engineRef;
    state = normalizeImaginationState(slice);
    if (engineRef?.pc) {
      // Every save gets the tutorial cards once (fresh games and saves from
      // before the shop). Triple Jump granted by the old stopgap stays owned.
      grantStarterUpgrades(state, owned(engineRef));
      syncEnergyTank(engineRef);
    }
  },

  onNewDay(now, engine) {
    publish(engine);
    if (panel && !panel.hidden) render();
  },

  /**
   * A card bought in the tutorial (newxp-feature gotCard) becomes owned
   * (imagination_grant). Solo already owns every tutorial card, so this only
   * adds cards for a new multiplayer player.
   */
  grantTutorialUpgrade(id, engine) {
    const list = owned(engine || engineRef);
    if (!IMAGINATION_UPGRADES[id] || list.includes(id)) return null;
    grantUpgrade(state, list, id, { history: false });
    publish(engine || engineRef);
    return true;
  },

  physics(engine) {
    return remakeMovementMultipliers(owned(engine));
  },

  /** skills_points_to_seconds factor for one skill (brain capacity + category cards + Better Learning). */
  skillTimeFactor(def, engine) {
    const learned = engine?.learnedSkills || [];
    // skills_learn computes the duration before queuing a new skill, but a
    // resumed one is already in the queue and counts (inc_skills.js:815-821).
    const queued = Object.keys(engine?.skillQueue || {}).length;
    return skillTimeFactor({
      count: learned.length + queued,
      brainCapacity: state.brainCapacity,
      categoryId: def?.categoryId ?? null,
      reductions: learnTimeReductions(owned(engine)),
      // G62: Better Learning I to V cut every study by 2 to 20%.
      discount: betterLearningDiscount(learned),
    });
  },

  packVerbs(classTsid, engine) {
    if (classTsid === RESHUFFLE_CARD) {
      return [{ id: 'img_reshuffle', label: 'Reshuffle', enabled: true, primary: true, tooltip: 'Reshuffle the cards in your hand' }];
    }
    if (classTsid === RESURRECTION_CARD) {
      const dead = Boolean(hellFeature.isDead?.());
      return [{
        id: 'img_resurrect',
        label: 'Resurrect',
        enabled: dead,
        primary: true,
        reason: dead ? '' : 'You can only use this when you are dead.',
        tooltip: 'Get out of Hell at once, fully refreshed',
      }];
    }
    return [];
  },

  runPackVerb(classTsid, verbId, engine) {
    if (verbId === 'img_reshuffle' && classTsid === RESHUFFLE_CARD) {
      openPanel({ view: 'hand' });
      useReshuffleCard(engine);
      return true;
    }
    if (verbId === 'img_resurrect' && classTsid === RESURRECTION_CARD) {
      if (!hellFeature.isDead?.()) {
        engine.toast('You can only use this when you are dead.');
        return true;
      }
      if (typeof hellFeature.resurrectNow !== 'function' || !removeItem(engine.inv, RESURRECTION_CARD, 1)) return true;
      const ok = hellFeature.resurrectNow(engine, { full: true });
      if (!ok) addItem(engine.inv, RESURRECTION_CARD, 1);
      engine.refreshPack?.();
      return true;
    }
    return false;
  },

  /** QA and other features. */
  open: (opts) => openPanel(opts),
  close: () => closePanel(),
  isOpen: () => Boolean(panel && !panel.hidden),
  _state: () => state,
  energyMax: () => energyMax(engineRef),
};

export { STARTER_UPGRADES, IMAGINATION_UPGRADES };
