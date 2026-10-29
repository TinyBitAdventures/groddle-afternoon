/**
 * Newxp: Glitch's last new-player experience, restored as an opt-in start.
 * Rules, source data and layouts live in js/newxp.js (read its header for
 * the GSJS files and what was rebuilt).
 *
 * Flow (players/player.js goToNewNewStartingLevel onward):
 *  1. clouds     newxp_intro: fall into the clouds, "Use Arrow Keys to move",
 *                walk past the giant words, drop through (feature scene).
 *  2. training1  the Welcoming Flamingo: slow default walk, the first iMG
 *                quoin and Walk Speed I, mushrooms and High Jumper I, the
 *                sloth, the ladder, a name and a look, the tube (scene).
 *  3. training2  the Dustbunny: High Jumper II, food (energy), drinks
 *                (mood), the Egg Plant, Walk Speed II, the Magic Rock's
 *                Home Street ticket and the selection machine (scene).
 *  4. house      the Magic Rock on your new home street (engine.grantHome:
 *                the house is imagined for free, in the style you chose),
 *                then "Take your pick …" of three first skills.
 *  5. skill      the imported practice street for that skill (A L'il Animal
 *                Kinship / Lift Your Light Green Thumb) with the flamingo;
 *                EZ Cooking's street is lost, so it goes straight on.
 *  6. island     Gentle Island (hub 129, imported): the rock's bag quest
 *                (978 currants, buy_two_bags at the cheap bag vendor on
 *                Progress Way); then home (Progress Way is held: "Not so
 *                fast — head home first …") for the rock's Skill Learning
 *                Brain talk, which offers On to the Big Time; back on the
 *                island, Gentle Island Exit drops you on a random
 *                newxp_exits street, and 15 s later the quest completes
 *                with its Greeter Twig relic. Along the way the island's own
 *                scripts run: no map until the Surveyor's Stroll Qurazy opens
 *                the first upgrade hand (imagination_reduce_to_hand) and
 *                Mappery reveals the map on Progress Way; High Jumper's
 *                Gully's two quoins open more hands; the Exit's Qurazy points
 *                at the upgrade menu; hint signs, the Doonboggle Musicblock
 *                and Spinach garden, the Gameshow Ticket and the singing
 *                street spirit (see "Gentle Island scripts").
 *
 * Opt-in: a brand-new save's start card offers "Start with the tutorial" or
 * "Skip to Ur"; existing saves and autostart routes are never redirected.
 * Multiplayer: a new character (js/new-player.js) has only "Start", which
 * starts the tutorial, as every new player in the original did.
 * Solo or multiplayer is picked before the game, on the Play page
 * (/play/online/, js/online-boot.js): /play/ is the solo game.
 * QA: ?autostart=1&fresh=1&resetgame=1&questoffer=off&newxp=1 (or
 * =training1|training2|house|skill|island) forces it; &newxpautoplay=1 runs
 * it end to end (&newxphold=<stage> stops on reaching that stage, =sloth at
 * the sloth's poof with the puff frozen at &newxpholdms=<ms>,
 * &newxpskill=animalkinship_1|ezcooking_1|light_green_thumb_1,
 * &newxpstyle=meadow|firebog|uralia). Canvas data: newxpStatus, newxpStage,
 * newxpStep, newxpUpgrades, newxpIsland, newxpAutoplay, newxpLast, newxpFlags,
 * newxpCard (island:<hand>), newxpIslandCard, newxpStreetEvent, newxpGarden,
 * newxpSlothPoof, and on the practice street newxpAk (its trail), newxpAkTable
 * and newxpSigns (each shown hint sign: id tail @ x,y a alpha). The island
 * autoplay also tours the gully and Doonboggle (&newxpisland=quick
 * skips them); &newxpcard=<id> picks that card from an island hand.
 */

import {
  BAGS_NEEDED,
  BAG_REMINDER_MS,
  CHEAP_BAG_PRICE,
  FIRST_SKILLS,
  GENTLE_ISLAND,
  GENTLE_ISLAND_TSIDS,
  ISLAND_ARRIVAL,
  ISLAND_BOXES,
  ISLAND_CONFIRM,
  ISLAND_CURRANTS,
  ISLAND_LINES,
  ISLAND_MUSICBLOCKS,
  ISLAND_MUSICBLOCK_AT,
  ISLAND_QUOINS,
  ISLAND_SIGNS,
  ISLAND_TICKET_AT,
  SPIRIT_SING,
  islandBoxesFor,
  islandHand,
  reduceToHand,
  sourceToStreet,
  LEAVE_FLAG_DELAY_MS,
  LINES,
  NEWXP_UPGRADES,
  PRACTICE_ARRIVAL,
  QUOIN_BENEFITS,
  SCENE_STAGES,
  SCENE_TSIDS,
  STAGES,
  TRAINING2_DRINKS,
  TRAINING2_ENERGY_AFTER_EAT,
  TRAINING2_ENTER_METABOLICS,
  TRAINING2_FOOD,
  UPGRADE_HANDS,
  CLOUD_LETTERS,
  CLOUD_LETTER_FADE_MS,
  CLOUD_WORDS,
  CLOUD_WORD_FADE_MS,
  CLOUD_WORD_STAGGER_MS,
  cloudLetterDeco,
  cloudWordDeco,
  cloudsLayout,
  firstSkill,
  inBox,
  inHitBox,
  isNewxpSceneTsid,
  islandExitOpen,
  nextStage,
  normalizeNewxpSave,
  pickNewxpExit,
  shouldResume,
  startNewxp,
  street4Check,
  questQueueLine,
  talkPages,
  training1Layout,
  training2Layout,
  tutorialPhysics,
  vogPages,
} from '../newxp.js?v=g449-1';
import { ITEM_CATALOG, addItem, countItem, ensureItem, removeItem } from '../inventory.js?v=catalog-unified-7';
import { QUOIN_SHEET, QUOIN_TYPES, qrazyRewardForLevel } from '../quoins.js?v=g424-1';
import { soundForQuoin } from '../sound-moments.js?v=g393-1';
import { IMAGINATION_UPGRADES } from '../imagination.js?v=g403-1';
import { assignQuest, completeQuest } from '../quests.js?v=item-buffs-7';
import { acceptOffer, enqueueQuestOffer, questAwardPayload, turnInQuest } from '../quest-offers.js?v=g403-1';
import { getQuestCatalog } from '../content-catalogs.js?v=g403-1';
import { locationEventsApi } from './location-events-feature.js?v=location-events-9';
import * as kit from '../quest-rooms/kit.js?v=qi-1';
import { frameTexture, onLoaded, sourceFromUrl, textureFromUrl } from '../textures.js';
import { grantMoodXp } from '../mood-xp.js';
import { displayTopOf, itemstackOverlayPoint, playPoofIn, playSheetOverlay, poofInAlpha } from '../overlay-art.js?v=g446-2';
import { HOME_MACHINE } from '../home-ticket.js?v=g449-1';
import { createAnimalState } from '../animals.js?v=g414-1';
import {
  AK_ANIMALS,
  AK_BUBBLE,
  AK_EVENT_BOXES,
  AK_POOF_OUT,
  AK_QUOINS,
  AK_SIDE_TABLE,
  AK_SIGNS,
  AK_WALL_OFF_MS,
  SKILLQUEST_AK_SOURCE,
  SKILLQUEST_AK_TSID,
  akAnimalForEvent,
  akSideTablePlacement,
  akVerbReaction,
  createAkState,
} from '../skillquest-ak.js?v=g298-1';

export const NEWXP_FEATURE_ID = 'newxp';
/** newxp_training1.js 705-706 slothRemove: deleteWithPoof, then hideTree 0.5 s later. */
const SLOTH_TREE_HIDE_MS = 500;
/**
 * Every 1x sheet here is CC0 Tiny Speck art (G308, research/coverage/g308-provenance.md): the
 * flamingo_*, dustbunny_* and rock_* sheets are byte copies of the OGA dump's extracted_newxp
 * npc_flamingo, npc_newxp_dustbunny and magic_rock_book_orangeBook x1 sheets; sloth.png is frame 1
 * of glitch-items inhabitants/sloth/npc_sloth.swf sprite 123. The levels, not the art, were rebuilt
 * from the playthrough (geometry only: every word is from GSJS, the CC0 overlays or the remake, G310).
 */
const ART = 'assets/sprites/newxp/';
const CARD_ART = 'assets/imagination/cards/';
const HOME_STREET_TSID = 'RH_HOME_EXT';
const DEFAULT_START = 'GLI2V0UN7RD1T2J'; // Hechey Track (index default)

// homestreet_ticket is registered by js/home-ticket.js (homestreet_ticket.js text, G208).
ensureItem('greeter_twig', { label: 'Greeter Twig', desc: 'A relic of Gentle Island. Greeters once came when it was waved.', baseCost: 0, sellable: false });
ensureItem('bag_generic', { label: 'Generic Bag', desc: 'A plain, sturdy bag for carrying more stuff.', baseCost: 900 });

let save = normalizeNewxpSave();
let hadSave = false;
let engineRef = null;
let token = 0;
let run = null; // per-stage runtime: { stage, layout, views, quoins, pickups, npcs, data }
let rooted = false;
let ui = null;
let startCardShown = false;
let pendingStage = null;
let resumeChecked = false;
/** A reload found the tutorial in progress: the game starts straight back into it (no welcome card). */
let resumeQueued = false;
let lastTsid = '';
let lastData = 0;
let auto = false;
let holdAt = '';
let islandBusy = false;
let reminderAt = 0;
let exitArrivedAt = 0;
let jumpWatch = { onGround: true, count: 0 };

class Cancel extends Error {}

/* ------------------------------------------------------------------ */
/* Small async kit                                                      */
/* ------------------------------------------------------------------ */

function alive(t) {
  if (t !== token) throw new Cancel('newxp: stage changed');
}

function sleep(t, ms) {
  return new Promise((resolve) => setTimeout(resolve, auto ? Math.min(ms, 300) : ms)).then(() => alive(t));
}

/** Wait for fn() to be true. In autoplay, `help` runs once to make it so. */
async function until(t, fn, { help = null, every = 120 } = {}) {
  let helped = false;
  for (;;) {
    alive(t);
    if (fn()) return;
    if (auto && help && !helped) {
      helped = true;
      try { await help(); } catch (err) { if (err instanceof Cancel) throw err; }
    }
    await sleep(t, every);
  }
}

const P = () => engineRef?.player;

function place(x, y) {
  const p = P();
  if (!p) return;
  p.x = x;
  p.y = y;
  p.vx = 0;
  p.vy = 0;
  engineRef.snapCamera();
}

function nameVars(extra = {}) {
  return { name: save.name || 'friend', ...extra };
}

function setStep(step) {
  if (run) run.step = step;
  engineRef?.setData('newxpStep', step);
}

/* ------------------------------------------------------------------ */
/* DOM chrome: bubbles, VOG, overlays, cards, instructions, pill        */
/* ------------------------------------------------------------------ */

const CSS = `
.nx-bubble[hidden],.nx-say[hidden],.nx-vog[hidden],.nx-instr[hidden],.nx-card[hidden],.nx-pill[hidden],.nx-start[hidden]{display:none!important}
.nx-bubble{position:fixed;z-index:60;max-width:300px;min-width:150px;background:#fff;color:#3b3b3b;border-radius:12px;padding:10px 12px 9px;
  box-shadow:0 4px 14px rgba(0,0,0,.28);font:600 13px/1.35 Nunito,"Trebuchet MS",sans-serif;transform:translate(-50%,-100%);pointer-events:auto}
.nx-bubble::after{content:"";position:absolute;left:50%;bottom:-8px;margin-left:-8px;border:8px solid transparent;border-bottom:0;border-top-color:#fff}
.nx-bubble .nx-who{display:block;font-size:11px;color:#8a7f72;margin-bottom:2px;text-transform:uppercase;letter-spacing:.06em}
.nx-bubble .nx-btns{display:flex;gap:6px;justify-content:center;margin-top:7px;flex-wrap:wrap}
.nx-bubble button,.nx-card button,.nx-pill button,.nx-start button{font:800 12px Nunito,"Trebuchet MS",sans-serif;border:0;border-radius:6px;padding:5px 12px;cursor:pointer;
  background:linear-gradient(#ffd977,#f4b63b);color:#5b3a00;box-shadow:0 2px 0 #c98f1d}
.nx-bubble button.alt{background:#eee;color:#555;box-shadow:0 2px 0 #c9c9c9}
.nx-bubble input{font:inherit;width:100%;box-sizing:border-box;margin-top:6px;padding:5px 7px;border:1px solid #c9c0b3;border-radius:6px}
.nx-say{position:fixed;z-index:59;max-width:240px;background:#fff;color:#3b3b3b;border-radius:10px;padding:7px 10px;font:700 12.5px/1.3 Nunito,"Trebuchet MS",sans-serif;
  box-shadow:0 3px 10px rgba(0,0,0,.25);transform:translate(-50%,-100%);pointer-events:none}
.nx-vog{position:fixed;z-index:61;display:flex;align-items:center;justify-content:center;text-align:center;background:rgba(0,0,0,.45);cursor:pointer;
  color:#fff;font:800 26px/1.25 Nunito,"Trebuchet MS",sans-serif;text-shadow:0 2px 4px rgba(0,0,0,.5);padding:20px;box-sizing:border-box}
.nx-vog small{display:block;font-size:13px;font-weight:700;margin-top:10px;opacity:.8}
.nx-vog .nx-vog-body{max-width:640px}
.nx-vog .nx-vog-body p{margin:6px 0 0;font-size:16px;font-weight:700}
.nx-vog button{margin-top:14px;font:800 14px Nunito,"Trebuchet MS",sans-serif;border:0;border-radius:999px;padding:7px 18px;background:#fff;color:#2f3f75;cursor:pointer}
.nx-instr{position:fixed;z-index:58;transform:translateX(-50%);background:rgba(255,255,255,.92);color:#555;border-radius:999px;padding:6px 16px;
  font:700 14px Nunito,"Trebuchet MS",sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.2);pointer-events:none;white-space:nowrap}
.nx-instr b{color:#333}
/* G315: the hand's help text sits where the instruction overlay does; the client filled the viewport behind the hand
   (glitch-client ImgMenuView.as 323-336, beginFill(0, .7)), so an open card hides the instruction until it closes. */
body:has(.nx-card:not([hidden])) .nx-instr{visibility:hidden}
.nx-card{position:fixed;inset:0;z-index:62;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:rgba(10,10,20,.72);color:#fff;
  font:700 14px Nunito,"Trebuchet MS",sans-serif;text-align:center}
.nx-card h2{margin:0;font-size:34px;font-weight:800}
.nx-hand{display:flex;gap:16px;justify-content:center;flex-wrap:wrap}
.nx-up{position:relative;width:150px;height:202px;border:0;padding:0;border-radius:8px;overflow:hidden;cursor:pointer;background:#e2e7ea;box-shadow:0 6px 16px rgba(0,0,0,.45)}
.nx-up img{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.nx-up .nx-up-name{position:absolute;left:4px;right:4px;bottom:4px;padding:7px 6px;background:rgba(0,0,0,.3);color:#fff;font:800 12px Nunito,sans-serif;border-radius:0 0 3px 3px}
.nx-up .nx-up-cost{position:absolute;top:7px;right:9px;color:#fff;font:800 15px Nunito,sans-serif;text-shadow:0 -1px 1.5px rgba(0,0,0,.55)}
.nx-up.dim{opacity:.38;cursor:default}
.nx-got{max-width:360px;background:#f4f8fb;color:#33384a;border-radius:12px;padding:16px 18px;box-shadow:0 8px 24px rgba(0,0,0,.4)}
.nx-got h3{margin:0 0 6px;font-size:22px}
.nx-got p{margin:0 0 12px;font-weight:600}
.nx-pill{position:fixed;z-index:57;display:flex;gap:8px;align-items:center;background:rgba(255,255,255,.9);border-radius:999px;padding:4px 6px 4px 12px;
  font:800 12px Nunito,"Trebuchet MS",sans-serif;color:#4a4a58;box-shadow:0 2px 8px rgba(0,0,0,.2)}
.nx-pill button{background:#eceff5;color:#4a4a58;box-shadow:none;padding:3px 10px;border-radius:999px}
.nx-fade{position:fixed;z-index:63;background:#000;opacity:0;pointer-events:none;transition:opacity .35s}
.nx-start{margin:10px 0 6px;padding:10px 12px;border-radius:12px;background:#f3f7e8;border:1px solid #cfe0a8;text-align:center}
.nx-start p{margin:0 0 8px;font-size:13px}
.nx-start .nx-start-row{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}
.nx-start button.alt{background:#fff;color:#4a5a2a;box-shadow:0 2px 0 #cfe0a8}
body.nx-hide-meta .metabolics-cluster>:not(.meta-pill),body.nx-hide-energy .meta-pill.energy,body.nx-hide-mood .meta-pill.mood{visibility:hidden}
body.nx-hide-pack #pack-bar{visibility:hidden}
body.nx-hide-map #map-btn,body.nx-hide-map #street-nameplate,body.nx-hide-currants .meta-stat.currants{visibility:hidden}
body.nx-island-map #map-panel .map-feature-card:not(.nx-map-card),body.nx-island-map #map-panel .map-home-card,body.nx-island-map #map-panel .map-quest-teleport,body.nx-island-map #map-panel .map-hub-picker{display:none!important}
@keyframes nx-callout{0%,100%{box-shadow:0 0 0 0 rgba(255,214,90,.0)}50%{box-shadow:0 0 0 6px rgba(255,214,90,.85)}}
.nx-callout{animation:nx-callout .9s ease-in-out 4;border-radius:8px}
@keyframes nx-map-pulse{0%,100%{stroke:#ffd23f;stroke-width:9}50%{stroke:#fff6c2;stroke-width:13}}
#map-panel.nx-map-progress .map-street[data-tsid="GA94UK1BH3D3FJL"] .map-seg{animation:nx-map-pulse 1s ease-in-out infinite}
.nx-map-card{margin:0 0 8px;padding:8px 12px;border-radius:10px;background:#fff6d6;color:#5b4300;font:800 13px Nunito,"Trebuchet MS",sans-serif;text-align:center}
body.nx-hide-actions .top-actions>:not(#mute-btn),body.nx-hide-actions .quest-tracker{visibility:hidden}
body.nx-hide-chat #local-chat-dock{visibility:hidden}
`;

function el(tag, attrs = {}, html = '') {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === true) node.setAttribute(k, '');
    else if (v !== false && v != null) node.setAttribute(k, String(v));
  }
  if (html) node.innerHTML = html;
  return node;
}

function ensureUi() {
  if (ui || typeof document === 'undefined') return ui;
  if (!document.getElementById('newxp-style')) {
    const style = el('style', { id: 'newxp-style' });
    style.textContent = CSS;
    document.head.appendChild(style);
  }
  const host = document.body;
  ui = {
    bubble: el('div', { class: 'nx-bubble', id: 'newxp-bubble', hidden: true, role: 'dialog', 'aria-live': 'polite' }),
    say: el('div', { class: 'nx-say', id: 'newxp-say', hidden: true }),
    vog: el('div', { class: 'nx-vog', id: 'newxp-vog', hidden: true, role: 'dialog' }),
    instr: el('div', { class: 'nx-instr', id: 'newxp-instruction', hidden: true }),
    card: el('div', { class: 'nx-card', id: 'newxp-card', hidden: true, role: 'dialog' }),
    pill: el('div', { class: 'nx-pill', id: 'newxp-pill', hidden: true }, '<span data-nx-label>Tutorial</span><button type="button" data-nx-skip>Skip tutorial</button>'),
    fade: el('div', { class: 'nx-fade', id: 'newxp-fade' }),
    bubbleFor: null,
    sayFor: null,
    sayUntil: 0,
    instrSince: 0,
    resolve: null,
  };
  for (const node of [ui.bubble, ui.say, ui.vog, ui.instr, ui.card, ui.pill, ui.fade]) host.appendChild(node);
  ui.pill.querySelector('[data-nx-skip]').addEventListener('click', () => {
    if (engineRef?.mode === 'multiplayer') return;
    if (typeof confirm === 'function' && !auto && !confirm('Skip the rest of the tutorial and head into Ur?')) return;
    skipTutorial(engineRef);
  });
  // Enter advances conversations (the source's button_instructions overlay);
  // capture it before the game opens a verb menu.
  window.addEventListener('keydown', (e) => {
    // hideUIOnLoad 'map': no map on Gentle Island until Mappery.
    if ((e.key === 'g' || e.key === 'G') && document.body.classList.contains('nx-hide-map') && !e.target?.matches?.('input, textarea, select')) {
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    if (e.key !== 'Enter') return;
    const open = [ui.bubble, ui.vog, ui.card].find((n) => !n.hidden);
    if (!open) return;
    const b = open.querySelector('button:not(:disabled):not(.dim)');
    if (!b) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    b.click();
  }, true);
  return ui;
}

function canvasRect() {
  const c = document.querySelector('#game-root canvas') || document.querySelector('canvas');
  return c ? c.getBoundingClientRect() : { left: 0, top: 0, width: 960, height: 540 };
}

/** World point to viewport (fixed) pixels. */
function pageOf(wx, wy) {
  const r = canvasRect();
  const cam = engineRef?.camera || { x: 0, y: 0 };
  const s = r.width / 960;
  return { x: r.left + (wx - cam.x) * s, y: r.top + (wy - cam.y) * s, rect: r };
}

function positionBubbles() {
  if (!ui) return;
  const r = canvasRect();
  const clampX = (x) => Math.max(r.left + 160, Math.min(r.left + r.width - 160, x));
  const clampY = (y) => Math.max(r.top + 110, Math.min(r.top + r.height - 20, y));
  for (const [node, who] of [[ui.bubble, ui.bubbleFor], [ui.say, ui.sayFor]]) {
    if (node.hidden || !who) continue;
    let head = null;
    try { head = who.head ? who.head() : { x: who.x, y: who.y - 120 }; } catch { head = null; }
    if (!head) {
      if (node === ui.say) node.hidden = true;
      continue;
    }
    const p = pageOf(head.x, head.y);
    node.style.left = `${clampX(p.x)}px`;
    node.style.top = `${clampY(p.y)}px`;
  }
  if (ui.say && !ui.say.hidden && ui.sayUntil && Date.now() > ui.sayUntil) ui.say.hidden = true;
  ui.vog.style.left = `${r.left}px`;
  ui.vog.style.top = `${r.top}px`;
  ui.vog.style.width = `${r.width}px`;
  ui.vog.style.height = `${r.height}px`;
  ui.fade.style.left = `${r.left}px`;
  ui.fade.style.top = `${r.top}px`;
  ui.fade.style.width = `${r.width}px`;
  ui.fade.style.height = `${r.height}px`;
  ui.instr.style.left = `${r.left + r.width / 2}px`;
  ui.instr.style.top = `${r.top + Math.min(r.height - 60, (engineRef?.camera?.h || 408) * (r.width / 960) - 44)}px`;
  ui.pill.style.left = `${r.left + 10}px`;
  ui.pill.style.top = `${r.top + 10}px`;
}

const plain = (html) => String(html || '').replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

/**
 * NPC conversation (npc.talk / conversation_start): the source text's
 * <split butt_txt> pages, then `buttons` (labels) or `choices` ({label,
 * value}). Roots the avatar while it is open. Resolves with the value.
 */
async function talk(t, who, text, { buttons = ['OK'], choices = null, vars = {}, input = null, free = false, mode = null } = {}) {
  alive(t);
  ensureUi();
  const finalChoices = choices || buttons.map((label, i) => ({ label, value: i === 0 ? 'ok' : label }));
  const pages = talkPages(text, nameVars(vars), finalChoices[0].label);
  if (!free) rooted = true;
  who?.setMode?.(mode || 'talk');
  engineRef.pushActivity(`${who?.name || 'Someone'}: ${plain(pages.map((p) => p.text).join(' '))}`);
  try {
    for (let i = 0; i < pages.length; i += 1) {
      const last = i === pages.length - 1;
      const opts = last ? finalChoices : [{ label: pages[i].button, value: 'next' }];
      const value = await new Promise((resolve) => {
        ui.bubbleFor = who;
        ui.bubble.innerHTML = `${who?.name ? `<span class="nx-who">${who.name}</span>` : ''}<div>${pages[i].text}</div>`;
        let field = null;
        if (last && input) {
          field = el('input', { type: 'text', maxlength: input.max || 19, placeholder: input.placeholder || '', 'aria-label': input.placeholder || 'Name' });
          field.value = input.value || '';
          ui.bubble.appendChild(field);
        }
        const row = el('div', { class: 'nx-btns' });
        opts.forEach((opt, k) => {
          const b = el('button', { type: 'button', class: k ? 'alt' : '', 'data-nx-choice': opt.value });
          b.textContent = opt.label;
          b.addEventListener('click', () => resolve(field ? { value: opt.value, text: field.value } : opt.value), { once: true });
          row.appendChild(b);
        });
        ui.bubble.appendChild(row);
        ui.bubble.hidden = false;
        ui.resolve = resolve;
        positionBubbles();
        engineRef.setData('newxpTalk', plain(pages[i].text).slice(0, 80));
        if (field) setTimeout(() => field.focus(), 30);
        if (auto) setTimeout(() => resolve(field ? { value: opt0(opts), text: 'Tester' } : opt0(opts)), 260);
      });
      alive(t);
      if (last) return value;
    }
  } finally {
    if (ui) {
      ui.bubble.hidden = true;
      ui.resolve = null;
    }
    who?.setMode?.(null);
    if (!free) rooted = false;
    engineRef?.setData('newxpTalk', '');
  }
  return 'ok';
}

const opt0 = (opts) => {
  const want = engineRef?.param('newxpchoice');
  return (want && opts.find((o) => o.value === want)?.value) || opts[0].value;
};

/** sendBubble: a short line with no buttons. */
function say(who, text, ms = 3000, { log = true } = {}) {
  ensureUi();
  ui.sayFor = who;
  ui.say.innerHTML = text;
  ui.say.hidden = false;
  ui.sayUntil = Date.now() + ms;
  positionBubbles();
  if (log) engineRef?.pushActivity(`${who?.name || 'Someone'}: ${plain(text)}`);
}

/** announce_vog_fade: big words over the scene; '//' pages; click or wait. */
async function vog(t, text, { holdMs = null } = {}) {
  ensureUi();
  for (const page of vogPages(text)) {
    alive(t);
    ui.vog.innerHTML = `<div class="nx-vog-body">${page}<small>Click anywhere…</small></div>`;
    ui.vog.hidden = false;
    engineRef.setData('newxpVog', plain(page).slice(0, 80));
    const ms = holdMs ?? Math.max(2600, page.length * 70);
    await new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        ui.vog.removeEventListener('click', done);
        resolve();
      };
      const timer = setTimeout(done, auto ? 250 : ms);
      ui.vog.addEventListener('click', done);
      ui.vogDone = done;
    });
    ui.vog.hidden = true;
  }
  engineRef.setData('newxpVog', '');
  alive(t);
}

/** A locking overlay with a title, body and one button (newxp_img*_overlay, first_*_overlay). */
async function overlay(t, { title = '', body = '', button = 'OK' } = {}) {
  ensureUi();
  alive(t);
  rooted = true;
  ui.vog.innerHTML = `<div class="nx-vog-body">${title}${body ? `<p>${body}</p>` : ''}<br><button type="button" data-nx-overlay>${button}</button></div>`;
  ui.vog.hidden = false;
  engineRef.setData('newxpOverlay', plain(title).slice(0, 60));
  engineRef.playSound('IMAGINATION_OPEN', { volume: 0.5 });
  await new Promise((resolve) => {
    const b = ui.vog.querySelector('button');
    b.addEventListener('click', () => resolve(), { once: true });
    setTimeout(() => b.focus?.(), 30);
    if (auto) setTimeout(() => resolve(), 260);
  });
  ui.vog.hidden = true;
  rooted = false;
  engineRef.setData('newxpOverlay', '');
  alive(t);
}

function instruction(text) {
  ensureUi();
  ui.instr.innerHTML = text.replace(/(Arrow Keys|Space Bar|Up\/Down Keys|Enter)/g, '<b>$1</b>');
  ui.instr.hidden = false;
  ui.instrSince = Date.now();
  engineRef?.setData('newxpInstruction', text);
}

function clearInstruction() {
  if (!ui) return;
  ui.instr.hidden = true;
  engineRef?.setData('newxpInstruction', '');
}

function cardLayers(config = {}) {
  return ['bg', 'pattern', 'suit', 'art', 'icon']
    .filter((f) => config[f])
    .map((f) => `<img src="${CARD_ART}${f}_${config[f]}.svg" alt="">`)
    .join('');
}

/**
 * The imagination menu the tutorial opens (showImaginationMenu): a hand of
 * three cards where only the earned one is affordable. Pick it, Get
 * Upgrade, then the "Got it!" card (upgrade_granted / upgrade_confirmed).
 */
async function upgradeHand(t, key) {
  ensureUi();
  const hand = UPGRADE_HANDS[key];
  const buy = hand.buy;
  rooted = true;
  const imgOf = (id) => IMAGINATION_UPGRADES[id] || {};
  const html = hand.cards.map((id) => {
    const u = imgOf(id);
    const cost = NEWXP_UPGRADES[id]?.cost ?? u.cost ?? 0;
    return `<button type="button" class="nx-up${id === buy ? '' : ' dim'}" data-nx-upgrade="${id}" ${id === buy ? '' : 'disabled'}>
      ${cardLayers(u.config)}<span class="nx-up-cost">${cost}i</span><span class="nx-up-name">${u.name || id}</span></button>`;
  }).join('');
  ui.card.innerHTML = `<h2>Upgrade</h2><div class="nx-hand">${html}</div><div>${LINES.upgradeHelp}</div>`;
  ui.card.hidden = false;
  engineRef.setData('newxpCard', `upgrade:${key}`);
  await new Promise((resolve) => {
    const b = ui.card.querySelector(`[data-nx-upgrade="${buy}"]`);
    b.addEventListener('click', () => resolve(), { once: true });
    if (auto) setTimeout(() => resolve(), 260);
  });
  alive(t);
  return gotCard(t, buy);
}

/** upgrade_granted / upgrade_confirmed: spend the iMG, then the "Got it!" card. */
async function gotCard(t, buy) {
  const imgOf = (id) => IMAGINATION_UPGRADES[id] || {};
  const u = imgOf(buy);
  const cost = NEWXP_UPGRADES[buy]?.cost ?? u.cost ?? 0;
  ui.card.innerHTML = `<div class="nx-got"><h3>Got it! ${u.name || buy}</h3><p>${u.desc || ''}</p><button type="button" data-nx-got>OK</button></div>`;
  engineRef.playSound('IMAGINATION_PURCHASE', { volume: 0.5 });
  // Spend the iMG the quoins gave; the walk/jump physics apply in the training levels.
  const pc = engineRef.pc;
  pc.imagination = Math.max(0, (Number(pc.imagination) || 0) - cost);
  if (!save.upgrades.includes(buy)) save.upgrades.push(buy);
  // The card is owned from now on (a no-op in solo, which starts owning every tutorial card).
  engineRef.query?.('grantTutorialUpgrade', buy, engineRef);
  engineRef.updateHud();
  engineRef.save();
  engineRef.setData('newxpUpgrades', save.upgrades.join(','));
  await new Promise((resolve) => {
    ui.card.querySelector('button').addEventListener('click', () => resolve(), { once: true });
    if (auto) setTimeout(() => resolve(), 260);
  });
  ui.card.hidden = true;
  rooted = false;
  engineRef.setData('newxpCard', '');
  alive(t);
  return buy;
}

/**
 * The island quoins' menu (open_img_menu section 'upgrades', hide_close):
 * the dealt hand, every affordable card buyable, no way to close it.
 */
async function islandUpgradeHand(t, cards) {
  ensureUi();
  rooted = true;
  const pc = engineRef.pc;
  const have = Number(pc.imagination) || 0;
  const imgOf = (id) => IMAGINATION_UPGRADES[id] || {};
  const html = cards.map((id) => {
    const u = imgOf(id);
    const cost = NEWXP_UPGRADES[id].cost;
    const ok = cost <= have;
    return `<button type="button" class="nx-up${ok ? '' : ' dim'}" data-nx-upgrade="${id}" ${ok ? '' : 'disabled'}>
      ${cardLayers(u.config)}<span class="nx-up-cost">${cost}i</span><span class="nx-up-name">${u.name || NEWXP_UPGRADES[id].name}</span></button>`;
  }).join('');
  ui.card.innerHTML = `<h2>Upgrade</h2><div class="nx-hand">${html}</div><div>${LINES.upgradeHelp}</div>`;
  ui.card.hidden = false;
  engineRef.playSound('IMAGINATION_OPEN', { volume: 0.5 });
  engineRef.setData('newxpCard', `island:${cards.join('+')}`);
  const affordable = cards.filter((id) => NEWXP_UPGRADES[id].cost <= have);
  const pick = await new Promise((resolve) => {
    ui.card.querySelectorAll('[data-nx-upgrade]:not([disabled])').forEach((b) => b.addEventListener('click', () => resolve(b.dataset.nxUpgrade), { once: true }));
    if (auto) {
      const want = engineRef.param('newxpcard');
      setTimeout(() => resolve(affordable.includes(want) ? want : affordable[0]), 260);
    }
  });
  alive(t);
  return gotCard(t, pick);
}

/** magic_rock.js showSkillChooser: three first skills. */
async function skillChooser(t) {
  ensureUi();
  rooted = true;
  const html = FIRST_SKILLS.map((s) => `<button type="button" class="nx-up" data-nx-skill="${s.id}">
      <img src="${CARD_ART}bg_green.svg" alt=""><img src="${CARD_ART}pattern_skill.svg" alt=""><img src="${CARD_ART}suit_skill.svg" alt="">
      <img src="${CARD_ART}art_skill_${s.art}.svg" alt=""><span class="nx-up-name">${s.name}</span></button>`).join('');
  ui.card.innerHTML = `<h2>Choose a skill</h2><div class="nx-hand">${html}</div><div>The Magic Rock can give you one skill instantly.</div>`;
  ui.card.hidden = false;
  engineRef.setData('newxpCard', 'skills');
  const pick = await new Promise((resolve) => {
    ui.card.querySelectorAll('[data-nx-skill]').forEach((b) => b.addEventListener('click', () => resolve(b.dataset.nxSkill), { once: true }));
    if (auto) setTimeout(() => resolve(firstSkill(engineRef.param('newxpskill'))?.id || 'animalkinship_1'), 260);
  });
  ui.card.hidden = true;
  rooted = false;
  engineRef.setData('newxpCard', '');
  alive(t);
  return firstSkill(pick);
}

async function fadeOut() {
  ensureUi();
  if (!ui) return;
  positionBubbles();
  ui.fade.style.opacity = '1';
  await new Promise((r) => setTimeout(r, 380));
}

function fadeIn() {
  if (ui) ui.fade.style.opacity = '0';
}

/* ------------------------------------------------------------------ */
/* HUD visibility (hideUIOnLoad)                                         */
/* ------------------------------------------------------------------ */

function hud(parts = {}) {
  if (typeof document === 'undefined') return;
  const b = document.body.classList;
  b.toggle('nx-hide-meta', Boolean(parts.meta));
  b.toggle('nx-hide-energy', Boolean(parts.energy));
  b.toggle('nx-hide-mood', Boolean(parts.mood));
  b.toggle('nx-hide-pack', Boolean(parts.pack));
  b.toggle('nx-hide-actions', Boolean(parts.actions));
  // Nobody else is in the clouds or the training rooms, so Local chat waits for the home street.
  b.toggle('nx-hide-chat', Boolean(parts.chat));
}

function showPill(on) {
  ensureUi();
  ui.pill.hidden = !on;
  // Multiplayer: no way out of the tutorial (players/player.js onCreate 1238-1239; Austin 2026-10-26).
  const skip = ui.pill.querySelector('[data-nx-skip]');
  if (skip) skip.hidden = engineRef?.mode === 'multiplayer';
  const label = ui.pill.querySelector('[data-nx-label]');
  if (label) label.textContent = `Tutorial · ${({ clouds: 'Welcome', training1: 'Training', training2: 'Training', house: 'Home Street', skill: 'Practice', island: 'Gentle Island' })[save.stage] || ''}`;
}

/* ------------------------------------------------------------------ */
/* Pixi views                                                           */
/* ------------------------------------------------------------------ */

const SHEETS = {
  flamingo: {
    name: 'Welcoming Flamingo', scale: 0.85, anchor: [0.5, 0.97], headY: 210,
    modes: { idle: ['flamingo_idle', 1, 1, 1], talk: ['flamingo_talk_tall', 13, 7, 89], short: ['flamingo_talk_short', 13, 7, 89], fly: ['flamingo_flying', 3, 4, 12], hover: ['flamingo_hover', 3, 4, 12] },
  },
  dustbunny: {
    name: 'Dustbunny', scale: 1.15, anchor: [0.5, 0.96], headY: 70,
    modes: { idle: ['dustbunny_idle', 9, 20, 172], talk: ['dustbunny_talk', 9, 6, 50], walk: ['dustbunny_walk', 8, 1, 8], walkRight: ['dustbunny_walk_right', 9, 1, 9] },
  },
  rock: {
    name: 'Magic Rock', scale: 1, anchor: [0.5, 0.95], headY: 80,
    modes: { idle: ['rock_read', 9, 2, 18], talk: ['rock_talk', 13, 7, 90], appear: ['rock_appear', 10, 2, 19] }, // G276: talk cell 90 and appear cell 19 are blank
  },
};

const sheetCache = new Map();
function framesFor(PIXI, file, cols, rows, count) {
  const key = `${file}`;
  if (!sheetCache.has(key)) sheetCache.set(key, kit.sheetFrames(PIXI, `${ART}${file}.png`, cols, rows, count));
  return sheetCache.get(key);
}

function makeNpc(engine, kind, x, y, extra = {}) {
  const { PIXI } = engine;
  const def = SHEETS[kind];
  const box = new PIXI.Container();
  box.x = x;
  box.y = y;
  box.zIndex = 25;
  const anim = new PIXI.AnimatedSprite([PIXI.Texture.EMPTY]);
  anim.anchor.set(def.anchor[0], def.anchor[1]);
  anim.scale.set(def.scale);
  anim.animationSpeed = 0.4;
  box.addChild(anim);
  engine.entityLayer.addChild(box);
  const npc = {
    kind,
    name: def.name,
    sprite: box,
    anim,
    get x() { return box.x; },
    set x(v) { box.x = v; },
    get y() { return box.y; },
    set y(v) { box.y = v; },
    mode: '',
    base: extra.base || 'idle',
    dest: null,
    head() {
      if (box.destroyed) return null;
      return { x: box.x, y: box.y - def.headY * def.scale - (npc.mode === 'hover' || npc.mode === 'fly' ? 20 : 0) };
    },
    setMode(mode) {
      const want = mode && def.modes[mode] ? mode : mode === 'talk' && kind === 'flamingo' ? 'talk' : npc.base;
      if (npc.mode === want) return;
      npc.mode = want;
      const [file, c, r, n] = def.modes[want];
      const sheet = framesFor(PIXI, file, c, r, n);
      const apply = () => {
        if (!sheet.frames.length || anim.destroyed) return;
        anim.textures = sheet.frames;
        anim.loop = want !== 'appear';
        anim.play();
      };
      if (sheet.ready()) apply();
      else onLoaded(sheet.base, () => setTimeout(apply, 0));
    },
    face(dir) {
      anim.scale.x = Math.abs(anim.scale.x) * (dir < 0 ? -1 : 1);
    },
    /** Walk/fly to a point at px/s; resolves on arrival. */
    moveTo(tx, ty = box.y, speed = 300, moveMode = null) {
      return new Promise((resolve) => {
        npc.dest = { x: tx, y: ty, speed, resolve, moveMode };
        if (moveMode) npc.setMode(moveMode);
      });
    },
  };
  npc.setMode(npc.base);
  if (extra.register) {
    npc.target = engine.register({ classId: extra.classId || `newxp_${kind}`, featureId: NEWXP_FEATURE_ID, label: def.name, subtitle: extra.subtitle || '', sprite: box, npc });
  }
  return npc;
}

function stepNpcs(dtMs) {
  if (!run) return;
  for (const npc of run.npcs) {
    const d = npc.dest;
    if (!d || npc.sprite.destroyed) continue;
    const dx = d.x - npc.x;
    const dy = d.y - npc.y;
    const dist = Math.hypot(dx, dy);
    const step = (d.speed * dtMs) / 1000;
    if (dist <= step || auto) {
      npc.x = d.x;
      npc.y = d.y;
      npc.dest = null;
      if (d.moveMode) npc.setMode(null);
      d.resolve();
    } else {
      npc.x += (dx / dist) * step;
      npc.y += (dy / dist) * step;
      if (Math.abs(dx) > 2) npc.face(dx);
    }
  }
}

let quoinFrames = null;
function quoinTexture(PIXI, type = 'xp') {
  if (!quoinFrames) {
    const base = sourceFromUrl(QUOIN_SHEET.url);
    quoinFrames = {};
    for (const def of Object.values(QUOIN_TYPES)) {
      quoinFrames[def.id] = frameTexture(base, new PIXI.Rectangle(0, def.row * QUOIN_SHEET.frameHeight, QUOIN_SHEET.frameWidth, QUOIN_SHEET.frameHeight));
    }
  }
  return quoinFrames[type] || quoinFrames.xp;
}

/**
 * deleteWithPoof (items/item.js 490-508): itemstack_overlay proto_puff at
 * the stack's display top plus delta_x / delta_y (2 s, its last frame
 * held), PROTO_PUFF, and the stack is gone (G285).
 */
function deleteWithPoof(engine, spr, dx = 0, dy = 0, { holdMs = null, x = spr?.x, top = null } = {}) {
  if (!spr || spr.destroyed) return null;
  const at = itemstackOverlayPoint(x, top ?? displayTopOf(spr), { dx, dy });
  engine.playSound('PROTO_PUFF', { volume: 0.5 });
  return playSheetOverlay(engine.PIXI, 'proto_puff', { layer: engine.fxLayer || engine.entityLayer, at: () => at, durationMs: 2000, loop: false, zIndex: 70, holdMs });
}

/** items/item.js 509 deleteWithPoof: apiSetTimer('apiDelete', 200), the stack goes 200 ms after the puff. */
const POOF_DELETE_MS = 200;

/**
 * G303: npc_sloth.swf (glitch-items/inhabitants/sloth) against the remake's
 * sloth.png. The client stands an itemstack_overlay on the stack's x plus
 * delta_x and its display top plus delta_y (InLocationAnnouncementOverlay.as
 * 84-101; the top is getYAboveDisplay, the drawn rect's top,
 * LocationItemstackView.as 633-654), the movie's stage bottom centre on the
 * stack's x,y (LocationItemstackView.as 853-854). The SWF's stage is
 * 260 x 240 with sloth_mc at (130, 114); hanging (sloth_mc frames 141-428:
 * the end of drop, hangIdle, talk) its drawn rect runs from 221 px above the
 * stack's y (the canopy shape over the branch) to 10 px above it, and the
 * sloth itself spans 11-117 px to one side of x and 10-134 px up. slothCreate
 * sets dir 'left' (newxp_training1.js 665-667), so it hangs 11-117 px left of
 * x, its middle 64 px left. deleteWithPoof(-50, 250) thus stands the puff
 * (proto_puff, 175 px above its point and 13 below) 39 px under the sloth's
 * feet and 14 px behind its middle: the puff covers it. The remake's
 * sloth.png is a tighter cut with no canopy shape, so its display top would
 * put the puff about 250 px down; these numbers measure from the drawn
 * sloth instead.
 */
export const SLOTH_POOF_ART = Object.freeze({
  /** The SWF's drawn top above the sloth's feet: 221 - 10. */
  topAboveFeet: 211,
  /** The stack's x from the sloth's middle, on its back side. */
  regFromMiddle: 64,
});

/**
 * Where slothRemove's deleteWithPoof(-50, 250) lands for a sloth drawn in
 * `bounds` ({ left, right, bottom } world px) facing `facing` (1 right, -1
 * left): { x, top } to hand deleteWithPoof as the stack's x and display top,
 * with delta_x mirrored to the sloth's facing (the source's dx is for one
 * facing left). Returns { x, top, dx }.
 */
export function slothPoofBase(bounds, facing = 1, dx = -50) {
  const middle = (bounds.left + bounds.right) / 2;
  const back = facing >= 0 ? -1 : 1;
  return {
    x: middle + back * SLOTH_POOF_ART.regFromMiddle,
    top: bounds.bottom - SLOTH_POOF_ART.topAboveFeet,
    dx: facing >= 0 ? -dx : dx,
  };
}

/**
 * QA: &newxphold=sloth stops the autoplay at the sloth's poof in training1 and
 * freezes the puff &newxpholdms=<ms> into its 2 s run (default 400) for a
 * screenshot (G298; canvas newxpAutoplay hold:sloth, newxpSlothPoof x,y).
 */
function slothHoldMs() {
  if (holdAt !== 'sloth') return null;
  const raw = engineRef?.param('newxpholdms');
  const ms = raw == null || raw === '' ? NaN : Number(raw);
  return Number.isFinite(ms) && ms >= 0 ? ms : 400;
}

/**
 * createItemStackWithPoof (locations/location.js 2054-2070) for a quoin:
 * poof_in with the given overlay (newxp_training1.js 444 passes
 * smoke_puff_overlay, the same FLA as smoke_puff), PROTO_PUFF, and the quoin
 * fading in (js/overlay-art.js playPoofIn, poofInAlpha).
 */
function poofInQuoin(engine, q, key = 'smoke_puff') {
  const h = q.spr.height || 0;
  q.poofAt = Date.now();
  q.spr.alpha = 0;
  engine.playSound('PROTO_PUFF', { volume: 0.5 });
  playPoofIn(engine.PIXI, { layer: engine.fxLayer || engine.entityLayer, x: q.x, bottom: q.y + h / 2, itemH: h, key });
}

/** An iMG quoin with a location_event_id; `onTake` runs once when touched. */
function addQuoin(engine, id, x, y, onTake, { type = 'xp', reach = 78, amount = null } = {}) {
  const spr = new engine.PIXI.Sprite(quoinTexture(engine.PIXI, type));
  spr.anchor.set(0.5, 0.5);
  spr.scale.set(0.6);
  spr.x = x;
  spr.y = y;
  spr.zIndex = 30;
  engine.entityLayer.addChild(spr);
  const q = { id, x, y, spr, taken: false, onTake, type, reach, amount };
  run.quoins.push(q);
  return q;
}

function stepQuoins(engine) {
  const p = P();
  if (!run || !p) return;
  const t = Date.now() / 300;
  for (const q of run.quoins) {
    if (q.taken || q.spr.destroyed) continue;
    q.spr.y = q.y + Math.sin(t + q.x) * 3;
    if (q.poofAt) q.spr.alpha = poofInAlpha(Date.now() - q.poofAt);
    if (Math.abs(q.x - p.x) < 34 && q.y > p.y - (q.reach || 78) && q.y < p.y + 12) takeQuoin(engine, q);
  }
}

function takeQuoin(engine, q) {
  if (q.taken) return;
  q.taken = true;
  q.spr.visible = false;
  const pc = engine.pc;
  // items/quoin.js 184, 209: stats_add_xp(amount, false) takes the mood bonus.
  const n = grantMoodXp(pc, q.amount ?? QUOIN_BENEFITS[q.id] ?? 1);
  engine.floatText(q.x, q.y - 14, q.type === 'qurazy' ? `Qurazy! +${n} iMG` : `+${n} iMG`, '#ffffff');
  engine.playSound(soundForQuoin(q.type || 'xp'), { volume: q.type === 'qurazy' ? 0.82 : 0.5, rate: q.type === 'qurazy' ? 1.2 : 1 });
  engine.updateHud();
  engine.setData('newxpLast', `quoin:${q.id}`);
  q.onTake?.(q);
}

/** A world item stack (createItemStack) the player picks up with Enter/click. */
function addPickup(engine, id, classTsid, count, x, y, onPick) {
  const { PIXI } = engine;
  const box = new PIXI.Container();
  const spr = new PIXI.Sprite(textureFromUrl(`assets/sprites/icons/${classTsid}.png`));
  spr.anchor.set(0.5, 1);
  spr.scale.set(0.8);
  box.addChild(spr);
  box.x = x;
  box.y = y;
  box.zIndex = 28;
  engine.entityLayer.addChild(box);
  const label = engine.inv && ITEM_LABEL(classTsid);
  const target = engine.register({ classId: 'newxp_item', featureId: NEWXP_FEATURE_ID, label: count > 1 ? `${label} ×${count}` : label, sprite: box, nxPickup: id });
  const row = { id, classTsid, count, target, sprite: box, picked: false, onPick };
  run.pickups.push(row);
  return row;
}

function ITEM_LABEL(classTsid) {
  if (ITEM_CATALOG[classTsid]?.label) return ITEM_CATALOG[classTsid].label;
  return classTsid.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function pickUp(engine, row) {
  if (!row || row.picked) return;
  row.picked = true;
  addItem(engine.inv, row.classTsid, row.count);
  engine.unregister(row.target);
  engine.refreshPack();
  engine.playSound('ITEM_PICKUP', { volume: 0.5 });
  engine.pushActivity(`You picked up ${row.count > 1 ? `${row.count} ` : ''}${ITEM_LABEL(row.classTsid)}.`);
  engine.setData('newxpLast', `pickup:${row.id}`);
  row.onPick?.(row);
}

function registerFixture(engine, sprite, classId, label, extra = {}) {
  engine.entityLayer.addChild(sprite);
  return engine.register({ classId, featureId: NEWXP_FEATURE_ID, label, sprite, ...extra });
}

/* ------------------------------------------------------------------ */
/* Scene building                                                       */
/* ------------------------------------------------------------------ */

function newRun(stage, layout = null) {
  return { stage, layout, npcs: [], quoins: [], pickups: [], fixtures: [], data: {}, step: '', views: {} };
}

/** Stage sizes of the newxpblack floating platforms (newxp_cloud.swf, CC0). */
const PLATFORM_ART_SIZE = Object.freeze({ small: [188, 65], green_small: [190, 71], medium: [397, 105] });
/** Where a floating platform's walking line sits under its art's top (the middle of its top face). */
export const PLATFORM_ART_TOP = 0.14;

/**
 * A layout platform drawn as its Tiny Speck floating platform (`art`): 12% wider than the walking
 * line, as tall as that scale allows up to 1.5x, the walking line across the middle of its top face.
 */
export function platformArtFit(p) {
  const size = p.art?.includes('_medium_') ? PLATFORM_ART_SIZE.medium : p.art?.includes('green_small') ? PLATFORM_ART_SIZE.green_small : PLATFORM_ART_SIZE.small;
  const sx = ((p.x2 - p.x1) * 1.12) / size[0];
  const sy = Math.min(sx, 1.5);
  return { x: (p.x1 + p.x2) / 2, y: p.y1 - size[1] * PLATFORM_ART_TOP * sy, sx, sy };
}

function drawPlatforms(PIXI, root, platforms) {
  const layer = new PIXI.Container();
  for (const p of platforms) {
    if (!p.art || p.tree) continue;
    const f = platformArtFit(p);
    layer.addChild(stageDeco(PIXI, p.art, f.x, f.y, { ay: 0, sx: f.sx, sy: f.sy }));
  }
  root.addChild(layer);
  return layer;
}

/**
 * The training rooms' black space and its star field: Tiny Speck's groundstars rows
 * (newxp_cloud.swf groundstars_*_newxpblack), far rows above the walking line, nearer and
 * bigger ones under it, as the recording's floor reads (K2q5GXruLvE 1:28-5:20).
 */
const STAR_ROWS = Object.freeze([
  ['groundstars_bg2_01a_newxpblack', -34], ['groundstars_bg1_01a_newxpblack', -22], ['groundstars_middleback_01a_newxpblack', -8],
  ['groundstars_row_6a_newxpblack', 4], ['groundstars_middle_01a_newxpblack', 16], ['groundstars_row_4a_newxpblack', 34],
  ['groundstars_row_3a_newxpblack', 52], ['groundstars_row_2a_newxpblack', 72], ['groundstars_middleplus_01a_newxpblack', 96],
  ['groundstars_row_1a_newxpblack', 124],
]);
function starVoid(PIXI, root, width, height, floorY) {
  const bg = new PIXI.Graphics();
  bg.rect(-700, -500, width + 1400, height + 1000).fill(0x000000);
  root.addChild(bg);
  STAR_ROWS.forEach(([name, dy], row) => {
    for (let x = -400 + (row % 3) * 230, i = 0; x < width + 400; x += 860, i++) {
      root.addChild(stageDeco(PIXI, name, x, floorY + dy, { sx: i % 2 ? -1 : 1, sy: 1 }));
    }
  });
}

/** A dark wall (newxpblack_wallcover_middle_01a) standing for a barrier until it opens. */
function wallArt(PIXI, b) {
  return stageDeco(PIXI, 'newxpblack_wallcover_middle_01a', b.x, b.y + b.h, { ay: 1, sx: 1, sy: b.h / 1000 });
}

function enterNewxpScene(engine, stage, layout, background, label) {
  engine.enterScene({
    tsid: SCENE_TSIDS[stage],
    label,
    hubName: 'Tutorial', // remake label (G310: no source names the newxp levels' region)
    width: layout.width,
    height: layout.height,
    background,
    platforms: layout.platforms.map((p) => ({ ...p })),
    walls: (layout.ladders || []).map((l) => ({ x: l.x, yTop: l.yTop, yBot: l.yBot })),
    spawn: layout.spawn,
  });
  if (engine.street) engine.street.barriers = (layout.barriers || []).map((b) => ({ ...b }));
}

function openWall(engine, id) {
  const w = (engine.street?.barriers || []).find((b) => b.id === id);
  if (w) w.pc_perm = 0;
  engine.setData('newxpLast', `wall:${id}`);
}

function addPlatforms(engine, list) {
  const plats = engine.platforms;
  for (const p of list) if (!plats.some((q) => q.id === p.id)) plats.push({ ...p });
}

/* ------------------------------------------------------------------ */
/* Stage: clouds (newxp_intro)                                          */
/* ------------------------------------------------------------------ */

/** A deco at its stage size (decos ship at 2x, js/deco-hires.js): centre-anchored unless told. */
function stageDeco(PIXI, name, x, y, { ax = 0.5, ay = 0.5, scale = 1, sx = null, sy = null, rot = 0, alpha = 1, flipY = false } = {}) {
  const spr = kit.deco(PIXI, name, x, y, { ax, ay, scale: 0.5 * scale });
  if (sx != null) spr.scale.x = 0.5 * sx;
  if (sy != null) spr.scale.y = 0.5 * sy;
  if (flipY) spr.scale.y *= -1;
  if (rot) spr.rotation = (rot * Math.PI) / 180;
  spr.alpha = alpha;
  return spr;
}

/** Camera look while you wait at the chain: shows the arrow's bottom (world y 667) in a 408 px view. */
const CHAIN_LOOK_Y = 370;

/** newxp_chain's 58 x 505 x1 sheets (OGA extracted_newxp newxp_chain, CC0): hang loops, pull plays once. */
const CHAIN_ART = Object.freeze({
  hang: { url: `${ART}chain_hang.png`, cols: 15, rows: 4, count: 60 },
  pull: { url: `${ART}chain_pull.png`, cols: 16, rows: 3, count: 45 },
});

function buildClouds(engine) {
  const { PIXI } = engine;
  const L = cloudsLayout();
  const root = kit.sceneRoot(PIXI, L.width, L.height);
  const sky = root.layer(0, 0);
  sky.addChild(kit.gradient(PIXI, [[0, '#7ec4f2'], [0.6, '#cfeaf7'], [1, '#fdf3cf']], 960, 640));
  // sun_01a_newxp, the low sun of the recording's sky (K2q5GXruLvE 0:20-1:20), fixed to the view.
  sky.addChild(stageDeco(PIXI, 'sun_01a_newxp', 780, 470, { alpha: 0.85 }));
  const far = root.layer(0.35, 1);
  for (let x = -200, i = 0; x < L.width; x += 420, i++) {
    far.addChild(stageDeco(PIXI, i % 2 ? 'clouds_bg_1_01a_newxp' : 'clouds_bg_2_01a_newxp', x, 700 + (i % 3) * 420, { alpha: 0.7 }));
  }
  const world = root.layer(1, 2);
  // The chain hangs under the ceiling (items/newxp_chain.js): click it, or press Enter, to pull.
  const chain = kit.animated(PIXI, CHAIN_ART.hang.url, CHAIN_ART.hang.cols, CHAIN_ART.hang.rows, { count: CHAIN_ART.hang.count, ax: 0.5, ay: 0, speed: 0.4 });
  chain.x = L.chain.x;
  chain.y = L.chain.top;
  chain.eventMode = 'static';
  chain.cursor = 'pointer';
  chain.hitArea = new PIXI.Rectangle(-29, 230, 58, 250);
  chain.on('pointertap', () => pullChain(engine));
  world.addChild(chain);
  // newxp_clicktopull_arrow: blinks under the handle while you wait (K2q5GXruLvE 0:22-0:24).
  const arrow = stageDeco(PIXI, 'newxp_clicktopull_arrow', L.chain.x, L.chain.top + 540, { alpha: 0 });
  world.addChild(arrow);
  // The stone GLITCH, unlit, with its lit copy over it (CLOUD_LETTERS).
  const letters = new PIXI.Container();
  const lit = [];
  for (const [c, dx, base, ms] of CLOUD_LETTERS) {
    letters.addChild(stageDeco(PIXI, cloudLetterDeco(c, true), L.letters.x + dx, L.letters.y + base, { ay: 1 }));
    const on = stageDeco(PIXI, cloudLetterDeco(c), L.letters.x + dx, L.letters.y + base, { ay: 1, alpha: 0 });
    letters.addChild(on);
    lit.push({ spr: on, ms });
  }
  world.addChild(letters);
  // The phrases: every word hidden until its cloud is reached (geo_deco_toggle_visibility fades).
  const phrases = [];
  for (const t of L.terraces.filter((q) => q.phrase)) {
    const words = CLOUD_WORDS[t.phrase].map(([w, dx, dy, deg, scale = 1]) => {
      const spr = stageDeco(PIXI, cloudWordDeco(w), t.at + dx, t.y + dy, { rot: deg, scale, alpha: 0 });
      world.addChild(spr);
      return spr;
    });
    phrases.push({ id: t.phrase, terrace: t, words, shownAt: 0 });
  }
  // The clouds you walk on, upper first so each lower one draws over the one above's underside.
  for (const t of L.terraces) world.addChild(cloudFloor(PIXI, t));
  // The ceiling: the newxp cloud banks upside down over a soft white band, drawn over the avatar
  // (bgLayer.frontView, game.js syncStreetFront) so you wait hidden above it.
  const front = new PIXI.Container();
  const band = new PIXI.Graphics();
  band.rect(-300, -500, 2400, 500 + L.ceilingY - 60).fill(0xf7fbff);
  band.filters = [new PIXI.BlurFilter({ strength: 18, quality: 3 })];
  front.addChild(band);
  for (let x = -200, i = 0; x < 2100; x += 380, i++) {
    front.addChild(stageDeco(PIXI, i % 2 ? 'clouds_bg_middleplus_01b_newxp' : 'clouds_bg_middleplus_01a_newxp', x, L.ceilingY - 70 + (i % 2) * 18, { flipY: true }));
  }
  root.frontView = front;
  // Scene names: the source files' header comments (newxp_intro.js 1, newxp_training1.js 3, newxp_training2.js 3).
  enterNewxpScene(engine, 'clouds', L, root, 'Cloud Level');
  run.views = { root, chain, arrow, lit, phrases };
  return L;
}

/** The last cloud's right end: walking past it falls to Training Level One. */
export function cloudEdge(L) {
  return L.platforms.find((p) => p.id === 'cloud')?.x2 ?? L.dropX;
}

/**
 * Past a cloud's edge the game's ground slack (street-model.js platformYAt's
 * 4 px margin, game.js resolveGround's 8 px seam bridge) held an avatar that
 * stepped off slowly standing on air against the cloud's side until pushed
 * again. Feet standing past the edge are moved just clear of that slack, so
 * the avatar falls at once. Returns the x to move to, or null.
 */
export const CLOUD_EDGE_CLEAR = 9;
export function cloudStepOff(edge, p) {
  if (!Number.isFinite(edge) || !p?.onGround || !(p.x > edge) || p.x >= edge + CLOUD_EDGE_CLEAR) return null;
  return edge + CLOUD_EDGE_CLEAR;
}

/** The same at every cloud's edge (each drops onto the next): the terrace whose walking line the feet are on. */
export function cloudStepOffAny(terraces, p) {
  for (const t of terraces || []) {
    if (Math.abs((p?.y ?? NaN) - t.y) > 12) continue;
    const x = cloudStepOff(t.x2, p);
    if (x != null) return x;
  }
  return null;
}

/**
 * Puffs (x from the edge, y from the floor's top, radius) that round each
 * cloud's end and tuck it in underneath, so it ends as a cloud, not a white
 * block's hard side: simple Pixi shapes in the floor's own colour, blurred to
 * the soft edge of the newxp cloud decos over them (G395 lane).
 */
export const CLOUD_END_PUFFS = Object.freeze([
  [-90, 20, 90], [-60, 120, 80], [-100, 220, 90], [-170, 320, 100],
]);
/** How far a cloud's body reaches under its walking line: less than the drop to the next one. */
export const CLOUD_BODY_DEPTH = 420;

function cloudFloor(PIXI, terrace) {
  const { x1, x2: edge } = terrace;
  const top = terrace.y + 60;
  const root = new PIXI.Container();
  const colour = 0xf7fbff;
  const body = new PIXI.Graphics();
  body.rect(x1 - 300, top, edge - 160 - x1 + 300, CLOUD_BODY_DEPTH - 60).fill(colour);
  for (const [dx, dy, r] of CLOUD_END_PUFFS) body.circle(edge + dx, top + dy, r).fill(colour);
  // Blurred whole, so the floor's top meets the deco row softly too (no ruled line).
  body.filters = [new PIXI.BlurFilter({ strength: 18, quality: 3 })];
  root.addChild(body);
  // Tiny Speck's own cloud banks along the top (clouds_bg_middleplus, clouds_bg_middle); the row stops at the edge.
  for (let x = x1 - 120, i = 0; x < edge - 150; x += 300, i++) {
    const name = ['clouds_bg_middleplus_01a_newxp', 'clouds_bg_middle_01a_newxp', 'clouds_bg_middleplus_01b_newxp'][i % 3];
    root.addChild(stageDeco(PIXI, name, x + 120, terrace.y + 70 + (i % 2) * 16, { ay: 1 }));
  }
  root.addChild(stageDeco(PIXI, 'clouds_bg_middleplus_01b_newxp', edge - 140, terrace.y + 150, { ay: 1 }));
  root.addChild(stageDeco(PIXI, 'clouds_bg_middle_01a_newxp', edge - 230, terrace.y + 300, { ay: 1, alpha: 0.95 }));
  return root;
}

/** items/newxp_chain.js pull: the pull animation, CHAIN_PULL, and the location event "glitch" drops you. */
function pullChain(engine) {
  if (!run || run.stage !== 'clouds' || run.data.pulled) return;
  run.data.pulled = true;
  const { chain, arrow } = run.views;
  if (arrow) arrow.visible = false;
  if (chain && !chain.destroyed) {
    const pull = kit.sheetFrames(engine.PIXI, CHAIN_ART.pull.url, CHAIN_ART.pull.cols, CHAIN_ART.pull.rows, CHAIN_ART.pull.count);
    const go = () => {
      if (chain.destroyed || !pull.frames.length) return;
      chain.textures = pull.frames;
      chain.loop = false;
      chain.onComplete = () => { chain.visible = false; };
      chain.gotoAndPlay(0);
    };
    if (pull.ready()) go();
    else onLoaded(pull.base, () => setTimeout(go, 0));
    chain.eventMode = 'none';
    chain.cursor = 'default';
  }
  engine.playSound('CHAIN_PULL', { volume: 0.6 });
  const plats = engine.platforms;
  const i = plats.findIndex((p) => p.id === 'perch');
  if (i >= 0) plats.splice(i, 1);
  const p = P();
  if (p) p.onGround = false;
  rooted = false;
  engine.setData('newxpLast', 'chain:pulled');
}

/** The letters lighten from the middle out once you land (CLOUD_LETTERS), each over CLOUD_LETTER_FADE_MS. */
function lightLetters(now) {
  const views = run?.views;
  if (!views?.lit || !run.data.landedAt) return;
  for (const { spr, ms } of views.lit) {
    const k = (now - run.data.landedAt - ms) / CLOUD_LETTER_FADE_MS;
    spr.alpha = Math.max(0, Math.min(1, k));
  }
}

/** A phrase's words appear one after another once you stand past its spot on its cloud. */
function revealPhrases(now, p) {
  for (const ph of run?.views?.phrases || []) {
    const t = ph.terrace;
    if (!ph.shownAt && p && p.x >= t.box && p.x <= t.x2 + 40 && Math.abs(p.y - t.y) < 60) {
      ph.shownAt = now;
      engineRef?.setData('newxpLast', `words:${ph.id}`);
    }
    if (!ph.shownAt) continue;
    ph.words.forEach((spr, i) => {
      spr.alpha = Math.max(0, Math.min(1, (now - ph.shownAt - i * CLOUD_WORD_STAGGER_MS) / CLOUD_WORD_FADE_MS));
    });
  }
}

async function runClouds(t) {
  const engine = engineRef;
  hud({ meta: true, energy: true, mood: true, pack: true, actions: true, chat: true });
  const L = buildClouds(engine);
  fadeIn();
  // newxp_chain: you wait hidden above the ceiling until the chain is pulled.
  setStep('chain');
  rooted = true;
  // Frame the hanging chain and its click-to-pull arrow (world y ~230-670) below the hidden avatar:
  // the camera stops at the level's top, which left the arrow under the bottom edge.
  engine.setCameraLook?.(0, CHAIN_LOOK_Y);
  engine.snapCamera?.();
  const waitAt = Date.now();
  // Enter pulls it; taken first (capture) so the game's own Enter does not say "Nothing nearby".
  const onKey = (e) => {
    if (e.key !== 'Enter' || run?.stage !== 'clouds' || run.data.pulled) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    pullChain(engine);
  };
  if (typeof window !== 'undefined') window.addEventListener('keydown', onKey, true);
  try {
    await until(t, () => {
      const arrow = run.views.arrow;
      // The arrow shows after a few seconds and blinks (reconstructed from K2q5GXruLvE 0:22-0:24).
      if (arrow && !run.data.pulled) {
        const ms = Date.now() - waitAt - 4000;
        arrow.alpha = ms < 0 ? 0 : (Math.floor(ms / 600) % 2 ? 0.35 : 1);
      }
      return run.data.pulled;
    }, { help: () => pullChain(engine) });
  } finally {
    if (typeof window !== 'undefined') window.removeEventListener('keydown', onKey, true);
    engine.setCameraLook?.(0, 0);
  }
  const first = L.terraces[0];
  await until(t, () => P()?.onGround && Math.abs(P().y - first.y) < 12, { help: () => place(L.spawn.x, first.y) });
  run.data.landedAt = Date.now();
  run.data.terraces = L.terraces;
  setStep('move');
  instruction(LINES.moveInstructions);
  const startX = P().x;
  // checkMovement: dismissed once the avatar is 50 px right of where it landed.
  await until(t, () => P().x - startX > 50, { help: () => place(startX + 80, P().y) });
  clearInstruction();
  setStep('walk');
  // Past the last edge and falling: on to training1. Testing the edge itself (not dropX, 10 px on)
  // means an avatar that steps off slowly never lands on the catch floor below and stands
  // against the cloud's side.
  const edge = cloudEdge(L);
  run.data.cloudEdge = edge;
  await until(t, () => P().x > edge && P().y > L.dropY, { help: () => place(L.dropX + 60, L.dropY + 60) });
  return 'training1';
}

/* ------------------------------------------------------------------ */
/* Stage: training1 (the Welcoming Flamingo)                             */
/* ------------------------------------------------------------------ */

function buildTraining1(engine) {
  const { PIXI } = engine;
  const L = training1Layout();
  const root = new PIXI.Container();
  root.worldH = L.height;
  starVoid(PIXI, root, L.width, L.height, L.floorY);
  // You arrive down a striped shaft from a hole in green ground (K2q5GXruLvE 1:22-1:26):
  // newxp_t1_striations_bg_01a, _01a, _middleplus_01a and _sun_01a over the spawn.
  const sx = L.spawn.x;
  root.addChild(stageDeco(PIXI, 'newxp_t1_striations_bg_01a', sx + 120, 235, { ay: 1 }));
  root.addChild(stageDeco(PIXI, 'newxp_t1_striations_sun_01a', sx + 470, 70, { alpha: 0.9 }));
  root.addChild(stageDeco(PIXI, 'newxp_t1_striations_01a', sx, 158, { ay: 0 }));
  root.addChild(stageDeco(PIXI, 'newxp_t1_striations_middleplus_01a', sx, 166));
  // The flamingo's rocks (rock_rubble_*_al1, newxp_misc.swf), where it waits (1:42-2:28).
  root.addChild(stageDeco(PIXI, 'rock_rubble_01e_al1', 1240, L.floorY + 20, { ay: 1, scale: 0.55 }));
  root.addChild(stageDeco(PIXI, 'rock_rubble_01a_al1', L.mushroom.x, L.floorY + 20, { ay: 1, scale: 0.7 }));
  // The mushroom stack (shroom_fade): mushroom_funnel_2 caps on the green glow, fading in.
  const shrooms = new PIXI.Container();
  shrooms.alpha = 0;
  const caps = L.platforms.filter((q) => q.style === 'mushroom');
  shrooms.addChild(stageDeco(PIXI, 'greenbase_01a_newxpblack', (caps[0].x1 + caps.at(-1).x2) / 2, L.floorY + 6));
  for (const cap of caps) {
    const s = ((cap.x2 - cap.x1) * 1.2) / 94;
    shrooms.addChild(stageDeco(PIXI, 'mushroom_funnel_2', (cap.x1 + cap.x2) / 2, cap.y1 - 8 * s, { ay: 0, scale: s }));
  }
  shrooms.addChild(stageDeco(PIXI, 'bling_mushroom_bunch_ground_1', caps[0].x1 - 20, L.floorY + 8, { ay: 1 }));
  root.addChild(shrooms);
  drawPlatforms(PIXI, root, L.platforms);
  // The sloth's tree on the blue island (tree_plane_*_g1, newxp_misc.swf; Snap TR1 PIF5BPPLOK535TE 58004):
  // its branches become platforms once it hides (hideTree).
  const isle = L.platforms.find((q) => q.id === 'isle_b');
  const tree = new PIXI.Container();
  tree.addChild(stageDeco(PIXI, 'tree_plane_trunk_01c_g1', (isle.x1 + isle.x2) / 2, isle.y1 + 6, { ay: 1 }));
  tree.addChild(stageDeco(PIXI, 'tree_plane_foliage_01a_g1', (isle.x1 + isle.x2) / 2 - 5, 1075, { scale: 0.8 }));
  root.addChild(tree);
  const branches = new PIXI.Container();
  for (const p of L.platforms.filter((q) => q.tree)) {
    branches.addChild(stageDeco(PIXI, 'tree_plane_branch_01a_g1', (p.x1 + p.x2) / 2, p.y1 - 6, { ay: 0, sx: ((p.x2 - p.x1) * 1.1) / 86, sy: 1.2 }));
  }
  branches.alpha = 0;
  root.addChild(branches);
  // The starry ladder (ladder_starry_1a_newxpblack), two lengths up to the top (3:08-3:14).
  for (const l of L.ladders) {
    const half = (l.yBot - l.yTop) / 2;
    for (let i = 0; i < 2; i++) root.addChild(stageDeco(PIXI, 'ladder_starry_1a_newxpblack', l.x, l.yBot - i * half, { ay: 1, sx: 1, sy: half / 232.7 }));
  }
  // wall1: a dark wall until Walk Speed I.
  const wall = wallArt(PIXI, L.barriers.find((b) => b.id === 'wall1'));
  root.addChild(wall);
  // The tube (the teleport to training2) on the top island: Teleporter_Base and its beam (newxp_misc.swf).
  root.addChild(stageDeco(PIXI, 'Teleporter_Base', L.tube.x, L.tube.y + 14, { ay: 1 }));
  const beam = stageDeco(PIXI, 'Teleporter_Beam', L.tube.x, L.tube.y + 14, { ay: 1, alpha: 0 });
  root.addChild(beam);
  enterNewxpScene(engine, 'training1', L, root, 'Training Level One');
  run.views = { shrooms, tree, branches, wall, beam };
  return L;
}

async function runTraining1(t) {
  const engine = engineRef;
  hud({ meta: true, energy: true, mood: true, pack: true, actions: true, chat: true });
  const L = buildTraining1(engine);
  fadeIn();
  const fl = makeNpc(engine, 'flamingo', L.flamingo.x, L.flamingo.y, { register: true, subtitle: 'Not a patient Flamingo' });
  run.npcs.push(fl);
  fl.face(-1);
  await until(t, () => P()?.onGround);
  // intro_greet + intro_greet_pause
  setStep('intro_greet');
  rooted = true;
  await sleep(t, 1300);
  const instrTimer = setTimeout(() => instruction(LINES.buttonInstructions), auto ? 0 : 2000);
  const shownAt = Date.now() + 2000;
  await talk(t, fl, LINES.t1Talk1, { buttons: ['Uh …'] });
  clearTimeout(instrTimer);
  setTimeout(() => clearInstruction(), Math.max(0, shownAt + 4000 - Date.now()));
  await talk(t, fl, LINES.t1Talk2, { buttons: ['OK!'], mode: 'short' });
  // intro_hover1 / intro_flyaway1
  setStep('flyaway');
  fl.setMode('hover');
  await sleep(t, 2000);
  rooted = false;
  fl.moveTo(L.flyaway, L.flamingo.y - 140, 420, 'fly');
  await until(t, () => inBox(L.boxes.pre_pickup_walk, P().x, P().y), { help: () => place(L.boxes.pre_pickup_walk.x, L.floorY) });
  // intro_flyback1 / intro_hover2
  await fl.moveTo(P().x + 400, L.flamingo.y - 140, 500, 'fly');
  alive(t);
  rooted = true;
  await fl.moveTo(P().x + 280, L.flamingo.y, 300, 'hover');
  alive(t);
  setStep('slow_talk');
  await talk(t, fl, LINES.t1Slow1, { buttons: ['!!!!!!!'] });
  await talk(t, fl, LINES.t1Slow2, { buttons: ['Hmm?'], mode: 'short' });
  // slow_tmp: fly to the mushroom; slow_create_coin
  fl.moveTo(L.mushroom.x, L.mushroom.y - 160, 500, 'fly');
  await sleep(t, 1000);
  setStep('walk_coin');
  const coinX = Math.min(P().x + 300, L.walkCoin.maxX);
  let got = false;
  // slow_create_coin (newxp_training1.js 439-450): the quoin poofs in on smoke_puff_overlay.
  poofInQuoin(engine, addQuoin(engine, 'img_pickup_walk', coinX, L.walkCoin.y, () => { got = true; }));
  await until(t, () => got, { help: () => place(coinX, L.floorY) });
  await sleep(t, 600);
  await overlay(t, LINES.img1);
  await upgradeHand(t, 'walk');
  openWall(engine, 'wall1');
  if (run.views.wall) run.views.wall.visible = false;
  engine.pushActivity(LINES.t1CatchUp);
  engine.toast(LINES.t1CatchUp, 3000);
  // slow_flyaway2: wait to bump into the flamingo at the mushroom
  setStep('catch_up');
  await fl.moveTo(L.mushroom.x, L.mushroom.y, 400, 'fly');
  alive(t);
  await until(t, () => Math.abs(P().x - fl.x) < 70 && Math.abs(P().y - fl.y) < 80, { help: () => place(fl.x - 50, L.floorY) });
  await talk(t, fl, LINES.t1JumpTalk, { buttons: ['Ok'] });
  // jump_mushroom: three jumps, the shrooms fade in, the coin waits above
  setStep('jump_mushroom');
  fl.moveTo(fl.x, L.doorway.y - 120, 150, 'hover');
  setTimeout(() => { if (run?.views?.shrooms) run.views.shrooms.alpha = 1; }, auto ? 0 : 3000);
  let jumpCoin = false;
  addQuoin(engine, 'img_pickup_jump', L.jumpCoin.x, L.jumpCoin.y, () => { jumpCoin = true; });
  jumpWatch = { onGround: true, count: 0 };
  const jumpsAtStart = 0;
  run.data.watchJumps = true;
  let nagAt = Date.now() + 15000;
  await until(t, () => {
    if (inBox(L.boxes.jumpInstructions, P().x, P().y) && !run.data.jumpInstr) {
      run.data.jumpInstr = true;
      instruction(LINES.jumpInstructions);
    }
    if (Date.now() > nagAt && !jumpCoin) {
      nagAt = Date.now() + 10000;
      engine.toast(run.data.nagged ? LINES.t1JumpHigher : LINES.t1GoGetQuoin, 3000);
      run.data.nagged = true;
    }
    return jumpCoin || jumpWatch.count - jumpsAtStart >= 3;
  }, { help: () => { jumpWatch.count = 3; } });
  clearInstruction();
  setStep('jump_coin');
  await until(t, () => jumpCoin, { help: () => place(L.jumpCoin.x, L.jumpCoin.y + 28) });
  // jump_get_coin: moveAvatar(1422, -116), the img2 overlay, High Jumper I
  place(L.afterJumpCoin.x, L.afterJumpCoin.y);
  await overlay(t, LINES.img2);
  await upgradeHand(t, 'jump');
  // door_flamingo: the flamingo heads up to the door; the sloth waits in the tree
  setStep('climb');
  fl.moveTo(L.doorway.x, L.doorway.y, 400, 'fly').then(() => fl.setMode(null));
  const sloth = new engine.PIXI.Sprite(textureFromUrl(`${ART}sloth.png`));
  sloth.anchor.set(0.35, 0.1);
  sloth.x = L.sloth.x;
  sloth.y = L.sloth.y;
  sloth.alpha = 0;
  sloth.zIndex = 24;
  engine.entityLayer.addChild(sloth);
  run.fixtures.push(sloth);
  const slothWho = { name: 'Sloth', head: () => ({ x: sloth.x + 30, y: sloth.y - 10 }) };
  let ladderCoin = false;
  addQuoin(engine, 'img_pickup_ladder', L.ladderCoin.x, L.ladderCoin.y, () => { ladderCoin = true; });
  let slothShownAt = 0;
  let treeGone = false;
  let treeHidden = false;
  const hideTree = () => {
    if (treeGone) return;
    treeGone = true;
    // slothRemove (newxp_training1.js 695-708): deleteWithPoof(-50, 250), the tree right after.
    const holdMs = slothHoldMs();
    if (sloth.alpha > 0 && sloth.visible) {
      // G303: measured from the drawn sloth (SLOTH_POOF_ART); sloth.png faces right.
      const lb = sloth.getLocalBounds();
      const sx = sloth.scale?.x ?? 1;
      const sy = sloth.scale?.y ?? 1;
      const base = slothPoofBase({
        left: sloth.x + Math.min(lb.x * sx, (lb.x + lb.width) * sx),
        right: sloth.x + Math.max(lb.x * sx, (lb.x + lb.width) * sx),
        bottom: sloth.y + (lb.y + lb.height) * sy,
      }, sx >= 0 ? 1 : -1);
      deleteWithPoof(engine, sloth, base.dx, 250, { holdMs, x: base.x, top: base.top });
      engine.setData('newxpSlothPoof', `${Math.round(sloth.x)},${Math.round(sloth.y)}`);
      engine.setData('newxpSlothPuff', `${Math.round(base.x + base.dx)},${Math.round(base.top + 250)}`);
      if (holdMs != null) {
        auto = false;
        engine.setData('newxpAutoplay', 'hold:sloth');
      }
    }
    // The sloth stays until apiDelete, 200 ms after the puff (kept under a held puff before that).
    setTimeout(() => {
      if (t === token && (holdMs == null || holdMs >= POOF_DELETE_MS)) sloth.visible = false;
    }, POOF_DELETE_MS);
    engine.playSound('SLOTH_ARRIVES', { volume: 0.3 });
    // apiSetTimer('hideTree', 0.5*1000): treehide and plat1 half a second after the poof (G290).
    setTimeout(() => {
      if (t !== token) return;
      treeHidden = true;
      if (run?.views) {
        run.views.tree.alpha = 0.25;
        run.views.branches.alpha = 1;
      }
      addPlatforms(engine, L.platforms.filter((p) => p.tree));
      engine.setData('newxpLast', 'treeplats_on');
    }, SLOTH_TREE_HIDE_MS);
  };
  await until(t, () => {
    const p = P();
    if (inBox(L.boxes.spacebarPlusArrows, p.x, p.y) && !run.data.across) {
      run.data.across = true;
      instruction(LINES.jumpAcrossInstructions);
    }
    // slothPeek: the sloth drops in and talks (newxp_talk), gone after 3.5-7.5 s.
    if (!slothShownAt && inBox(L.sloth.peekBox, p.x, p.y)) {
      slothShownAt = Date.now();
      clearInstruction();
      sloth.alpha = 1;
      engine.playSound('SLOTH_ARRIVES', { volume: 0.5 });
      say(slothWho, LINES.sloth, 3000);
    }
    const shown = slothShownAt ? Date.now() - slothShownAt : 0;
    if (slothShownAt && !treeGone && (shown > 7500 || (shown > 3500 && p.y < 1290))) hideTree();
    if (treeHidden && inBox(L.boxes.upDownForLadders, p.x, p.y) && !run.data.climb) {
      run.data.climb = true;
      instruction(LINES.climbInstructions);
    }
    return ladderCoin;
  }, {
    help: async () => {
      place(2300, 1350);
      // &newxphold=sloth: stand in the peek box and let the sloth show, talk and poof (slothHoldMs).
      if (slothHoldMs() != null) return;
      slothShownAt = Date.now() - 8000;
      hideTree();
      await new Promise((r) => setTimeout(r, SLOTH_TREE_HIDE_MS + 150));
      place(L.ladderCoin.x, L.ladderCoin.y + 30);
    },
  });
  clearInstruction();
  await overlay(t, LINES.img3);
  setStep('to_door');
  await until(t, () => inBox(L.boxes.at_door, P().x, P().y) && P().onGround, { help: () => place(2680, L.door.y) });
  // door_talk1-6
  rooted = true;
  fl.face(-1);
  await talk(t, fl, LINES.t1Door1, { buttons: ['Guess so!'], mode: 'short' });
  if (!save.name) {
    await talk(t, fl, LINES.t1Name, { buttons: ['Hmm …'] });
    const res = await talk(t, fl, LINES.t1NamePrompt, { buttons: ['OK'], input: { max: 19, placeholder: 'Your name' } });
    const name = String(res?.text || '').replace(/[<>]/g, '').trim().slice(0, 19);
    save.name = name || 'Glitchling';
    engine.save();
  }
  await talk(t, fl, LINES.t1Look, { buttons: ['OK'] });
  if (!auto && typeof document !== 'undefined') {
    document.getElementById('avatar-btn')?.click();
    await sleep(t, 400);
    await until(t, () => document.getElementById('avatar-panel')?.hidden !== false);
  }
  rooted = true;
  await talk(t, fl, LINES.t1Bye, { buttons: ['Thank you'] });
  // door_show1-3: the flamingo poofs (door_show2, newxp_training1.js 629-631:
  // deleteWithPoof(10, 170)); walk into the tube.
  await sleep(t, 1000);
  deleteWithPoof(engine, fl.sprite, 10, 170);
  fl.sprite.visible = false;
  if (fl.target) engine.unregister(fl.target);
  await sleep(t, 1000);
  rooted = false;
  setStep('tube');
  await until(t, () => inBox(L.tube.box, P().x, P().y), { help: () => place(L.tube.x, L.tube.y) });
  // 'tp' hitbox: playHitAnimation('hit1', 5 s), teleport to training2; the tube's beam lights (5:08-5:12).
  if (run.views.beam) run.views.beam.alpha = 1;
  engine.playHit('hit1', 1200);
  engine.playSound('TELEPORT_AWAY', { volume: 0.5 });
  await sleep(t, 1200);
  return 'training2';
}

/* ------------------------------------------------------------------ */
/* Stage: training2 (the Dustbunny)                                      */
/* ------------------------------------------------------------------ */

/** Each style's station (K2q5GXruLvE 7:36-7:56): tube, target ring, CHOOSE board and picture. */
const STYLE_TARGETS = Object.freeze({ meadow: 'newxpblack_target_01a', firebog: 'newxpblack_target_01b', uralia: 'newxpblack_target_01c' });

function buildTraining2(engine) {
  const { PIXI } = engine;
  const L = training2Layout();
  const root = new PIXI.Container();
  root.worldH = L.height;
  starVoid(PIXI, root, L.width, L.height, L.floorY);
  // The green glow the tables stand on (greenbase_01a_newxpblack, 4:04-6:32).
  for (const tab of Object.values(L.tables)) root.addChild(stageDeco(PIXI, 'greenbase_01a_newxpblack', tab.x, L.floorY + 4, { scale: 0.95 }));
  drawPlatforms(PIXI, root, L.platforms);
  const g = new PIXI.Graphics();
  // Table one (white cloth) and the wooden drinks bench: no Tiny Speck art for them survives in
  // the CC0 sets, so they stay drawn.
  g.ellipse(L.tables.food.x, L.floorY - 76, 120, 18).fill(0xf4f4f4);
  g.rect(L.tables.food.x - 120, L.floorY - 76, 240, 70).fill(0xe6e6e6);
  g.roundRect(L.tables.drinks.x - 130, L.floorY - 70, 260, 66, 8).fill(0x9a5a2b);
  g.roundRect(L.tables.drinks.x - 130, L.floorY - 74, 260, 10, 4).fill(0xb87240);
  root.addChild(g);
  // The walls are Tiny Speck's dark wall panels (the tube building's, 7:20-7:32).
  const walls = {};
  for (const b of L.barriers.filter((w) => w.id !== 'left')) {
    const w = wallArt(PIXI, b);
    root.addChild(w);
    walls[b.id] = w;
  }
  // Egg Plant (trant_egg) on its ledge.
  const egg = new PIXI.Sprite(textureFromUrl('assets/sprites/trants/frames/trant_egg_m10.png'));
  egg.anchor.set(0.5, 1);
  egg.x = L.eggPlant.x;
  egg.y = L.eggPlant.y + 8;
  egg.scale.set(0.8);
  // The Go talk to your Magic Rock sign, on the way to the rock (sign_t2streetstyle_newxp, 7:36).
  root.addChild(stageDeco(PIXI, 'sign_t2streetstyle_newxp', 3150, L.floorY + 6, { ay: 1 }));
  // The Home Street Selection Machine: a station per style (homestreet_ticket_dispenser.js choices).
  const machine = new PIXI.Container();
  const first = L.machine.choices[0];
  machine.addChild(stageDeco(PIXI, 'newxp_homestreetchoosingfacilitysign', first.x - 160, L.floorY - 290));
  for (const c of L.machine.choices) {
    machine.addChild(stageDeco(PIXI, STYLE_TARGETS[c.style], c.x, L.floorY + 4));
    machine.addChild(stageDeco(PIXI, 'newxpblack_tube_metal_01a_back', c.x, L.floorY - 240, { ay: 1 }));
    machine.addChild(stageDeco(PIXI, 'newxpblack_tube_metal_01a_front', c.x, L.floorY - 230, { ay: 1 }));
    machine.addChild(stageDeco(PIXI, `newxpblack_choosestreetstyle_blueprint_${c.style}`, c.x - 160, L.floorY - 96));
    machine.addChild(stageDeco(PIXI, 'newxpblack_choosestreetstyle_pole', c.x + 222, L.floorY + 2, { ay: 1 }));
    machine.addChild(stageDeco(PIXI, `newxpblack_choosestreetstyle_${c.style}`, c.x + 160, L.floorY - 104));
  }
  root.addChild(machine);
  enterNewxpScene(engine, 'training2', L, root, 'Training Level Two');
  run.views = { walls, root };
  run.data.egg = egg;
  return L;
}

function clickPackUse(engine, classTsid) {
  const slot = document.querySelector(`#pack-items [data-tsid="${classTsid}"], #pack-tools [data-tsid="${classTsid}"]`);
  slot?.click();
  setTimeout(() => document.querySelector('#pack-popover [data-pack-use]')?.click(), 120);
  return Boolean(slot);
}

async function runTraining2(t) {
  const engine = engineRef;
  // hideUIOnLoad: pack until the first pickup, energy until food, mood until a drink.
  hud({ meta: true, energy: true, mood: true, pack: true, actions: true, chat: true });
  const L = buildTraining2(engine);
  fadeIn();
  const pc = engine.pc;
  pc.energy = Math.max(pc.energy || 0, TRAINING2_ENTER_METABOLICS);
  pc.mood = Math.max(pc.mood || 0, TRAINING2_ENTER_METABOLICS);
  engine.updateHud();
  const db = makeNpc(engine, 'dustbunny', L.dustbunny.initial, L.floorY, { register: true, classId: 'newxp_dustbunny', subtitle: 'An aficionado of EGGs' });
  run.npcs.push(db);
  db.face(-1);
  const eggTarget = registerFixture(engine, run.data.egg, 'newxp_egg_plant', 'Egg Plant', { subtitle: 'Harvest it' });
  run.data.eggTarget = eggTarget;
  await until(t, () => P()?.onGround);
  setStep('dustbunny_start');
  rooted = true;
  await sleep(t, 800);
  await talk(t, db, LINES.t2Talk1, { buttons: ['Hm?'] });
  await db.moveTo(L.dustbunny.initial - 50, L.floorY, 250);
  alive(t);
  await talk(t, db, LINES.t2Talk5, { buttons: ['OK'] });
  // dustbunny_talk6: it runs to the table; the first quoin waits on the way.
  db.moveTo(L.dustbunny.table1a, L.floorY, 150, 'walkRight');
  let q1 = false;
  addQuoin(engine, 'img_pickup_1', L.quoins.img_pickup_1.x, L.quoins.img_pickup_1.y, () => { q1 = true; });
  setStep('upgrade');
  await until(t, () => q1, { help: () => place(L.quoins.img_pickup_1.x, L.floorY) });
  await sleep(t, 600);
  await upgradeHand(t, 'jump2');
  // Food.
  setStep('dustbunny_food');
  await until(t, () => inBox(L.boxes.to_food, P().x, P().y), { help: () => place(L.boxes.to_food.x, L.floorY) });
  await talk(t, db, LINES.t2Food, { buttons: ['ok'] });
  instruction(LINES.interactInstructions);
  db.moveTo(L.dustbunny.table1b, L.floorY, 250, 'walkRight');
  let firstPick = null;
  for (const f of TRAINING2_FOOD) {
    const spot = L.items[f.id];
    addPickup(engine, f.id, f.classTsid, f.count, spot.x, spot.y, (row) => { firstPick ||= row; });
  }
  await until(t, () => firstPick, { help: () => pickUp(engine, run.pickups.find((r) => r.id === 'food_2')) });
  clearInstruction();
  // first_inv_overlay, then the pack appears.
  await overlay(t, LINES.firstInventory);
  hud({ meta: true, energy: true, mood: true, pack: false, actions: true, chat: true });
  // food_wait_eat: the slot callout and the nagging.
  setStep('food_wait_eat');
  run.data.eaten = false;
  // "Eat This" / "Drink This": glitch-client graphics/callout_eat.png and callout_drink.png; the rest is remake copy.
  instruction(`Eat This: click the ${ITEM_LABEL(firstPick.classTsid)} in your pack, then Eat`);
  let nag = 0;
  let nagAt = Date.now() + 3000;
  await until(t, () => {
    if (Date.now() > nagAt) {
      say(db, LINES.t2EatNag[nag % 2], 3000);
      nag += 1;
      nagAt = Date.now() + 6000;
    }
    return run.data.eaten;
  }, { help: () => { if (!clickPackUse(engine, firstPick.classTsid)) run.data.eaten = true; setTimeout(() => { run.data.eaten = true; }, 900); } });
  clearInstruction();
  // food_eaten: energy to 80, the overlay, then the energy meter appears.
  if (ui) ui.say.hidden = true;
  pc.energy = TRAINING2_ENERGY_AFTER_EAT;
  engine.updateHud();
  await overlay(t, { title: LINES.firstEat, button: 'OK' });
  rooted = true;
  hud({ meta: true, energy: false, mood: true, pack: false, actions: true, chat: true });
  instruction(LINES.watchEnergy);
  await sleep(t, 4000);
  clearInstruction();
  rooted = false;
  const foodLeft = () => run.pickups.filter((r) => !r.picked && TRAINING2_FOOD.some((f) => f.id === r.id)).length;
  if (foodLeft()) await talk(t, db, LINES.t2FoodRest, { buttons: ['OK'] });
  // pickup_item5 / dustbunny_drink1: on to the drinks (the leave_food box opens the wall).
  setStep('dustbunny_drink');
  db.moveTo(L.dustbunny.table2a, L.floorY, 250, 'walkRight');
  await until(t, () => inBox(L.boxes.leave_food, P().x, P().y), {
    help: () => {
      for (const r of run.pickups) if (!r.picked) pickUp(engine, r);
      place(L.boxes.leave_food.x, L.floorY);
    },
  });
  openWall(engine, 'wall_to_drinks');
  if (run.views.walls.wall_to_drinks) run.views.walls.wall_to_drinks.visible = false;
  await talk(t, db, LINES.t2Drinks, { buttons: ['ok'] });
  db.moveTo(L.dustbunny.table2b, L.floorY, 250, 'walkRight');
  let drinkPick = null;
  for (const d of TRAINING2_DRINKS) {
    const spot = L.items[d.id];
    addPickup(engine, d.id, d.classTsid, d.count, spot.x, spot.y, (row) => { drinkPick ||= row; });
  }
  instruction(LINES.interactInstructions);
  // leave_drink before drinking: back you go.
  await until(t, () => {
    if (inBox(L.boxes.leave_drink, P().x, P().y)) {
      place(1928, L.floorY);
      say(db, LINES.t2DrinkFirst, 3000);
    }
    return drinkPick;
  }, { help: () => pickUp(engine, run.pickups.find((r) => r.id === 'drink_1')) });
  clearInstruction();
  await overlay(t, { title: LINES.firstDrink, button: 'OK' });
  setStep('drink_wait_drink');
  run.data.drank = false;
  instruction(`Drink This: click the ${ITEM_LABEL(drinkPick.classTsid)} in your pack, then Drink`);
  setTimeout(() => { if (run?.stage === 'training2' && !run.data.drank) say(db, LINES.t2DrinkIt, 3000); }, 2000);
  await until(t, () => {
    if (inBox(L.boxes.leave_drink, P().x, P().y)) {
      place(1928, L.floorY);
      say(db, LINES.t2DrinkFirst, 3000);
    }
    return run.data.drank;
  }, { help: () => { if (!clickPackUse(engine, drinkPick.classTsid)) run.data.drank = true; setTimeout(() => { run.data.drank = true; }, 900); } });
  clearInstruction();
  // drink_drank: the mood meter appears with its callout.
  rooted = true;
  await sleep(t, 2000);
  hud({ meta: true, energy: false, mood: false, pack: false, actions: true, chat: true });
  instruction(LINES.keepMood);
  await sleep(t, 3750);
  clearInstruction();
  rooted = false;
  const drinksLeft = () => run.pickups.filter((r) => !r.picked && TRAINING2_DRINKS.some((d) => d.id === r.id)).length;
  if (drinksLeft()) await talk(t, db, LINES.t2DrinkRest, { buttons: ['ok'] });
  // dustbunny_egg0: the wall to the Egg Plant opens.
  setStep('dustbunny_egg');
  openWall(engine, 'wall_to_eggplant');
  if (run.views.walls.wall_to_eggplant) run.views.walls.wall_to_eggplant.visible = false;
  db.moveTo(L.dustbunny.eggs1, L.floorY, 250, 'walkRight');
  await until(t, () => inBox(L.boxes.dustbunny_egg, P().x, P().y), {
    help: () => {
      for (const r of run.pickups) if (!r.picked) pickUp(engine, r);
      place(L.boxes.dustbunny_egg.x, L.floorY);
    },
  });
  await talk(t, db, LINES.t2Egg1, { buttons: ['Uh huh'] });
  await sleep(t, 1000);
  await talk(t, db, LINES.t2Egg1c, { buttons: ['OK'] });
  setTimeout(() => engine.pushActivity(LINES.t2Egg2), 1000);
  engine.toast(LINES.t2Egg2, 4000);
  db.moveTo(L.dustbunny.eggs2, L.floorY, 250, 'walkRight').then(() => {
    if (run?.stage !== 'training2') return;
    say(db, LINES.t2Egg3, 4000);
    setTimeout(() => { if (run?.stage === 'training2') db.moveTo(L.dustbunny.building, L.floorY, 250, 'walkRight'); }, auto ? 0 : 4000);
  });
  // The ledges hold two more quoins: Walk Speed II.
  let eggQuoins = 0;
  const onEggQuoin = () => {
    eggQuoins += 1;
    if (eggQuoins === 2) run.data.walk2 = upgradeHand(t, 'walk2').catch(() => {});
  };
  addQuoin(engine, 'img_pickup_egg_a', L.quoins.img_pickup_egg_a.x, L.quoins.img_pickup_egg_a.y, onEggQuoin);
  addQuoin(engine, 'img_pickup_egg_b', L.quoins.img_pickup_egg_b.x, L.quoins.img_pickup_egg_b.y, onEggQuoin);
  // dustbunny_egg4b: harvest the Egg Plant, give the egg.
  setStep('egg_give');
  run.data.eggGiven = false;
  let lastNear = 0;
  await until(t, () => {
    const near = Math.abs(P().x - db.x) < 70 && Math.abs(P().y - db.y) < 60;
    if (near && Date.now() - lastNear > 6000 && !db.dest) {
      lastNear = Date.now();
      if (countItem(engine.inv, 'egg_plain') > 0) say(db, LINES.t2HaveEgg, 3000);
      else say(db, LINES.t2NoEgg.replace(/<br>/g, ' '), 3000);
      engine.pushActivity(LINES.t2GiveHint);
    }
    return run.data.eggGiven;
  }, {
    help: async () => {
      for (const q of run.quoins) if (!q.taken) takeQuoin(engine, q);
      await (run.data.walk2 || Promise.resolve());
      place(L.eggPlant.x - 40, L.eggPlant.y);
      harvestEgg(engine);
      place(db.x - 50, L.floorY);
      giveEgg(engine);
    },
  });
  if (run.data.walk2) await run.data.walk2;
  // dustbunny_egg5/6: bounce, thanks, the walls come down.
  setStep('thanks');
  rooted = true;
  for (let i = 0; i < 2; i++) {
    await db.moveTo(db.x, L.floorY - 10, 200);
    await db.moveTo(db.x, L.floorY, 200);
  }
  alive(t);
  say(db, LINES.t2Delicious, 2000);
  await sleep(t, 3000);
  await talk(t, db, LINES.t2Thanks, { buttons: ['OK'] });
  openWall(engine, 'tube_building');
  if (run.views.walls.tube_building) run.views.walls.tube_building.visible = false;
  setTimeout(() => engine.pushActivity(LINES.t2FindRock), 3000);
  await sleep(t, 1000);
  await talk(t, db, LINES.t2Bye, { buttons: ['Bye'] });
  // dustbunny_done1: it runs off; the Magic Rock waits on its ledge.
  db.moveTo(db.x - 700, L.floorY, 250, 'walk').then(() => { db.sprite.visible = false; if (db.target) engine.unregister(db.target); });
  const rock = makeNpc(engine, 'rock', L.rock.x, L.rock.y, { register: true, classId: 'newxp_rock', subtitle: 'Reading' });
  run.npcs.push(rock);
  rock.face(-1);
  setStep('magicrock');
  await until(t, () => inBox(L.boxes.magicrock_reveal, P().x, P().y) || P().x > L.boxes.magicrock_reveal.x, { help: () => place(L.boxes.magicrock_reveal.x, L.floorY) });
  await sleep(t, 1500);
  await talk(t, rock, LINES.rockUpHere, { buttons: ['OK'] });
  await until(t, () => inBox(L.boxes.magicrock_talk, P().x, P().y), { help: () => place(L.rock.x - 50, L.rock.y) });
  await talk(t, rock, LINES.rockTicket, { buttons: ['OK'] });
  rock.setMode('idle');
  await sleep(t, 1000);
  await talk(t, rock, LINES.rockOhRight, { buttons: ['Yes …'] });
  // magicrock_talk6 / done: the Home Street Ticket.
  if (countItem(engine.inv, 'homestreet_ticket') < 1) addItem(engine.inv, 'homestreet_ticket', 1);
  engine.refreshPack();
  engine.pushActivity('The Magic Rock gave you a Home Street Ticket.');
  setStep('machine');
  const panels = L.machine.choices.map((c) => {
    const spr = new engine.PIXI.Container();
    spr.x = c.x;
    spr.y = L.floorY;
    const hit = new engine.PIXI.Graphics();
    hit.rect(-58, -190, 116, 190).fill({ color: 0xffffff, alpha: 0.001 });
    spr.addChild(hit);
    return registerFixture(engine, spr, 'newxp_machine', c.label, { nxStyle: c.style });
  });
  run.data.panels = panels;
  run.data.style = '';
  // QA: &newxphold=machine stops the autoplay here, so the stations can be walked to and stood on.
  if (holdAt === 'machine' && auto) {
    auto = false;
    engine.setData('newxpAutoplay', 'hold:machine');
  }
  await until(t, () => {
    const p = P();
    const c = L.machine.choices.find((m) => Math.abs(p.x - m.x) < 40 && p.y > L.floorY - 20);
    if (c && countItem(engine.inv, 'homestreet_ticket') > 0 && !run.data.style) run.data.style = c.style;
    return run.data.style;
  }, { help: () => { run.data.style = engine.param('newxpstyle') || 'meadow'; } });
  removeItem(engine.inv, 'homestreet_ticket', 1);
  engine.refreshPack();
  save.homeStyle = run.data.style;
  engine.playSound('TELEPORT_AWAY', { volume: 0.5 });
  engine.save();
  return 'house';
}

function harvestEgg(engine) {
  if (!run || run.data.eggHarvested) {
    engine.toast('The Egg Plant has nothing left to give.', 2000);
    return false;
  }
  run.data.eggHarvested = true;
  addItem(engine.inv, 'egg_plain', 1);
  engine.refreshPack();
  engine.playSound('HARVEST', { volume: 0.5 });
  engine.pushActivity('You harvested 1 Egg.');
  engine.setData('newxpLast', 'harvest:egg_plain');
  return true;
}

function giveEgg(engine) {
  if (!run || run.stage !== 'training2' || run.step !== 'egg_give') return false;
  if (countItem(engine.inv, 'egg_plain') < 1) {
    engine.toast('Get an Egg from the Egg Plant first.', 2000);
    return false;
  }
  removeItem(engine.inv, 'egg_plain', 1);
  engine.refreshPack();
  run.data.eggGiven = true;
  engine.setData('newxpLast', 'egg_given');
  return true;
}

/* ------------------------------------------------------------------ */
/* Stage: house (the Magic Rock on your new home street)                 */
/* ------------------------------------------------------------------ */

async function runHouse(t) {
  const engine = engineRef;
  hud({});
  const style = save.homeStyle || 'meadow';
  const owned = engine.homeOwned?.() || engine.grantHome?.(style) === true;
  if (owned) {
    await engine.enter(HOME_STREET_TSID, { spawnX: 250 });
  }
  fadeIn();
  alive(t);
  await sleep(t, 600);
  const p = P();
  const rock = makeNpc(engine, 'rock', (p?.x || 250) + 240, owned ? engine.groundY : p.y, { register: true, classId: 'newxp_rock', subtitle: 'Your Magic Rock', base: 'idle' });
  run.npcs.push(rock);
  rock.face(-1);
  rock.setMode('appear');
  setStep('ooof');
  await sleep(t, 1000);
  say(rock, LINES.ooof, 1500);
  await sleep(t, 2500);
  rock.setMode('idle');
  await talk(t, rock, LINES.homeStreet, { buttons: ['I bet'] });
  setStep('choose_skill');
  let answer = await talk(t, rock, LINES.chooseSkill, { choices: [{ label: 'I’m ready now', value: 'learn-skill' }, { label: 'Give me a minute', value: 'give-me-a-minute' }] });
  while (answer !== 'learn-skill') {
    await talk(t, rock, LINES.giveMinute, { buttons: ['OK'] });
    run.data.rockTalk = false;
    await until(t, () => run.data.rockTalk, { help: () => { run.data.rockTalk = true; } });
    answer = 'learn-skill';
  }
  await talk(t, rock, LINES.takePick, { buttons: ['OK'] });
  const skill = await skillChooser(t);
  engine.grantSkill(skill.id);
  giveFinished(engine, skill.quest);
  save.skill = skill.id;
  engine.save();
  engine.updateHud();
  await talk(t, rock, LINES.goodChoice, { buttons: ['OK'], vars: { skill: skill.name } });
  return 'skill';
}

/** quests_give_finished: done with no rewards; the chain offer still follows (onComplete_custom). */
function giveFinished(engine, questId) {
  const qs = engine.questState;
  const def = getQuestCatalog()[questId];
  if (!qs || !def || qs.completed.includes(questId)) return false;
  if (!qs.active[questId]) assignQuest(qs, questId, { ignorePrereq: true });
  completeQuest(qs, questId, null);
  for (const next of def.chainOffers || []) enqueueQuestOffer(qs, next);
  engine.setData('newxpLast', `given_finished:${questId}`);
  return true;
}

/** The first walk line at or below y at x (street platforms). */
function groundBelow(engine, x, y) {
  let best = null;
  for (const pl of engine.platforms || []) {
    if (x < Math.min(pl.x1, pl.x2) || x > Math.max(pl.x1, pl.x2)) continue;
    const sy = pl.y1 + ((x - pl.x1) / ((pl.x2 - pl.x1) || 1)) * (pl.y2 - pl.y1);
    if (sy >= y - 20 && (best == null || sy < best)) best = sy;
  }
  return best ?? y;
}

/* ------------------------------------------------------------------ */
/* Stage: skill (practice street)                                       */
/* ------------------------------------------------------------------ */

async function runSkill(t) {
  const engine = engineRef;
  hud({});
  const skill = firstSkill(save.skill) || FIRST_SKILLS[0];
  if (!skill.street || !engine.streetExists(skill.street)) {
    // EZ Cooking's practice street is not in the archive.
    engine.pushActivity(`${skill.name}: the practice place is lost, so straight on to the Island.`);
    return 'island';
  }
  await engine.enter(skill.street, { spawnX: PRACTICE_ARRIVAL.x, spawnY: PRACTICE_ARRIVAL.y, quiet: true, bypassFeatureGates: true });
  fadeIn();
  alive(t);
  const street = engine.street;
  const boxes = street?.boxes || [];
  const box = (id) => boxes.find((b) => b.id === id);
  // Signs and walls the location script broadcast (wall_off, sign*, lotion).
  // (Only the deco/wall events: a few carry broken client-side activity text.)
  const SAFE = new Set(['deco_show', 'deco_hide', 'wall', 'plat', 'flag_set', 'flag_has_exit', 'flag_clear']);
  const fireSafe = (ev) => {
    const actions = street?.events?.[ev];
    if (Array.isArray(actions) && actions.every((a) => SAFE.has(a.type))) locationEventsApi.fire(engine, ev);
  };
  const ak = skill.id === 'animalkinship_1' && engine.streetTsid === SKILLQUEST_AK_TSID;
  if (ak) {
    // skillquest_ak.js: wall_off after 1 s; the signs and animals come from the event boxes (G290).
    run.data.ak = { ...createAkState(), animals: {}, inBox: new Set() };
    const mine = run.data.ak;
    setTimeout(() => { if (run?.data?.ak === mine) fireSafe('wall_off'); }, AK_WALL_OFF_MS);
    islandSigns(engine, AK_SIGNS, { follow: true });
  } else {
    for (const ev of ['wall_off', 'sign1', 'sign2', 'sign3', 'sign4', 'lotion', 'wateringcan_on', 'bottom1', 'bottom2', 'bottom3']) fireSafe(ev);
  }
  // The practice tool waiting on the street (createItemStack in reset()).
  const tool = skill.id === 'animalkinship_1'
    ? { id: 'butterfly_lotion', classTsid: 'butterfly_lotion', x: 1823, y: 810, off: 'lotion_off' }
    : { id: 'watering_can', classTsid: 'watering_can', x: 650, y: 900, off: 'wateringcan_off' };
  const groundAt = (x, y) => groundBelow(engine, x, y);
  addPickup(engine, tool.id, tool.classTsid, 1, tool.x, groundAt(tool.x, tool.y), () => fireSafe(tool.off));
  if (ak) akSideTable(engine);
  // flamingo_talk1: the flamingo pops in to say hello.
  const fl = makeNpc(engine, 'flamingo', 370, groundAt(370, 880), { register: true });
  run.npcs.push(fl);
  fl.face(-1);
  setStep('practice_hello');
  await until(t, () => P()?.onGround);
  await sleep(t, 1000);
  await talk(t, fl, skill.practice, { buttons: [skill.reply] });
  fl.moveTo(2750, fl.y - 200, 500, 'fly').then(() => { fl.sprite.visible = false; if (fl.target) engine.unregister(fl.target); });
  setStep('practice');
  const finish = box(skill.finishBox) || { x: (street?.bounds ? street.bounds.r - street.bounds.l : 3400) - 300, y: 900, w: 200, h: 800 };
  engine.toast(`Practise ${skill.name}, then head right to the EXIT.`, 4000);
  if (ak && auto) await akAutoplay(t, engine, fireSafe);
  await until(t, () => {
    if (ak) akTick(engine, fireSafe);
    return inBox(finish, P().x, P().y);
  }, { help: () => place(finish.x, finish.y - 20) });
  return 'island';
}

/* ------------------------------------------------------------------ */
/* skillquest_ak: the practice animals (js/skillquest-ak.js, G290)      */
/* ------------------------------------------------------------------ */

/** The Side Table the lotion stands on (js/skillquest-ak.js AK_SIDE_TABLE, G298): scenery, as a stack with no verbs. */
function akSideTable(engine) {
  const bounds = engine.street?.bounds;
  const plat = AK_SIDE_TABLE.platform;
  const top = sourceToStreet(bounds, (plat.x1 + plat.x2) / 2, plat.y);
  const floor = groundBelow(engine, top.x, top.y + 25);
  const at = akSideTablePlacement(floor + (bounds?.t ?? 0));
  const spr = new engine.PIXI.Sprite(textureFromUrl(AK_SIDE_TABLE.art));
  spr.anchor.set(0.5, 1);
  spr.x = top.x;
  spr.y = floor + 2;
  spr.width = at.width;
  spr.height = at.height;
  spr.zIndex = 26;
  spr.eventMode = 'none';
  engine.entityLayer.addChild(spr);
  run.fixtures.push(spr);
  engine.setData('newxpAkTable', `${Math.round(spr.x)},${Math.round(floor)},${at.width}x${at.height}`);
}

/** QA trail on the canvas (data-newxp-ak): what the practice street did, in order. */
function akLog(engine, what) {
  const ak = run?.data?.ak;
  if (ak) (ak.log ||= []).push(what);
  engine.setData('newxpAk', (ak?.log || [what]).slice(-16).join(','));
}

/** The rebuilt Collision-triggered Event Boxes (enter edge), then the signs. */
function akTick(engine, fireSafe) {
  const ak = run?.data?.ak;
  const p = P();
  if (!ak || !p) return;
  for (const box of AK_EVENT_BOXES) {
    if (!inHitBox(box, p.x, p.y)) {
      ak.inBox.delete(box.id);
      continue;
    }
    if (ak.inBox.has(box.id)) continue;
    ak.inBox.add(box.id);
    for (const ev of box.events) {
      const classId = akAnimalForEvent(ev);
      if (classId) akSpawn(engine, classId);
      else fireSafe(ev);
    }
  }
  syncSigns(engine);
}

function akFrames(engine, classId) {
  const t = engine.textures || {};
  if (classId === 'npc_piggy') return (t.piggyWalk?.frames || []).slice(0, 8);
  if (classId === 'npc_chicken') return (t.chickenWalk?.frames || []).slice(0, 6);
  return (t.butterfly?.frames || []).slice(0, 12);
}

/**
 * spawnChicken / spawnPiggy / spawnButterfly (skillquest_ak.js 227-250):
 * once per visit, createItemStackWithPoof at the location target (proto_puff,
 * PROTO_PUFF, the stack fading in), a fresh animal (reset() made new ones),
 * and its bubble 2 s later for 5 s.
 */
function akSpawn(engine, classId) {
  const ak = run?.data?.ak;
  const def = AK_ANIMALS[classId];
  if (!ak || !def || ak.spawned[classId]) return null;
  ak.spawned[classId] = true;
  const { PIXI } = engine;
  const at = sourceToStreet(engine.street?.bounds, def.x, def.y);
  const frames = akFrames(engine, classId);
  const spr = new PIXI.AnimatedSprite(frames.length ? frames : [PIXI.Texture.EMPTY]);
  const scale = classId === 'npc_piggy' ? 0.97 : 0.7;
  spr.anchor.set(0.5, def.airborne ? 0.5 : 1);
  spr.baseScale = scale;
  spr.scale.set(scale);
  spr.animationSpeed = def.airborne ? 0.25 : 0.13;
  spr.zIndex = def.airborne ? 40 : 20;
  spr.x = at.x;
  spr.y = def.airborne ? at.y : groundBelow(engine, at.x, at.y - 20) + 2;
  spr.alpha = 0;
  spr.play();
  engine.entityLayer.addChild(spr);
  const textures = engine.textures || {};
  const playOnce = (key, n, walkKey, walkN, speed) => (durationMs = 0) => {
    const actionFrames = (textures[key]?.frames || []).slice(0, n);
    if (!actionFrames.length || spr.destroyed) return;
    spr.textures = actionFrames;
    spr.loop = false;
    spr.animationSpeed = durationMs > 0 ? Math.min(0.3, Math.max(0.025, actionFrames.length / (60 * (durationMs / 1000)))) : 0.18;
    spr.gotoAndPlay(0);
    spr.onComplete = () => {
      if (spr.destroyed) return;
      spr.loop = true;
      spr.textures = (textures[walkKey]?.frames || []).slice(0, walkN);
      spr.animationSpeed = speed;
      spr.gotoAndPlay(0);
      spr.onComplete = null;
    };
  };
  if (classId === 'npc_piggy') {
    spr.playPet = playOnce('piggyNibble', 10, 'piggyWalk', 8, 0.13);
    spr.playNibble = spr.playPet;
  } else if (classId === 'npc_chicken') {
    spr.playSqueeze = playOnce('chickenPeck', 6, 'chickenWalk', 6, 0.12);
  }
  const target = engine.register({
    classId,
    label: def.label,
    sprite: spr,
    airborne: Boolean(def.airborne),
    state: createAnimalState(classId),
    akAnimal: true,
  });
  const h = spr.height || 0;
  const row = { classId, sprite: spr, target, baseX: at.x, baseY: spr.y, vx: classId === 'npc_piggy' ? 0.45 : -0.5, phase: 0, poofAt: Date.now(), gone: false };
  ak.animals[classId] = row;
  engine.playSound('PROTO_PUFF', { volume: 0.5 });
  playPoofIn(PIXI, { layer: engine.fxLayer || engine.entityLayer, x: spr.x, bottom: def.airborne ? spr.y + h / 2 : spr.y, itemH: h });
  setTimeout(() => {
    if (run?.data?.ak !== ak || row.gone || spr.destroyed) return;
    engine.say(target, def.bubble, AK_BUBBLE.durationMs);
  }, AK_BUBBLE.delayMs);
  akLog(engine, `spawn:${classId}`);
  return row;
}

/** Each frame: the poof-in fade, a short wander (the source animals walk about), the butterfly's flutter. */
function akStep(dtMs) {
  const ak = run?.data?.ak;
  if (!ak) return;
  for (const row of Object.values(ak.animals)) {
    const spr = row.sprite;
    if (row.gone || !spr || spr.destroyed) continue;
    spr.alpha = poofInAlpha(Date.now() - row.poofAt);
    row.phase += dtMs / 1000;
    if (row.classId === 'npc_butterfly') {
      spr.x = row.baseX + Math.sin(row.phase * 0.6) * 24;
      spr.y = row.baseY + Math.sin(row.phase * 1.3) * 10;
      continue;
    }
    if (!spr.loop) continue; // mid squeeze / pet / nibble
    spr.x += row.vx * (dtMs / 16.7);
    if (spr.x > row.baseX + 70) row.vx = -Math.abs(row.vx);
    if (spr.x < row.baseX - 70) row.vx = Math.abs(row.vx);
    spr.scale.x = (row.vx < 0 ? -1 : 1) * Math.abs(spr.baseScale || spr.scale.x);
  }
}

/** eventScriptEventFired (skillquest_ak.js 103-143): what a successful verb sets off, 2.5 s later. */
function akVerb(engine, cls, verb) {
  const ak = run?.data?.ak;
  if (!ak || !AK_ANIMALS[cls]) return;
  akLog(engine, `verb:${cls}:${verb}`);
  const alive = (classId) => Boolean(ak.animals[classId] && !ak.animals[classId].gone);
  const r = akVerbReaction(ak, verb, alive);
  if (!r) return;
  akLog(engine, `${verb}:${r.poof || ''}:${r.event || ''}`);
  setTimeout(() => {
    if (run?.data?.ak !== ak) return;
    if (r.poof) akPoofOut(engine, r.poof);
    if (r.event) fireStreetEvent(engine, r.event);
  }, AK_POOF_OUT.delayMs);
}

/** deleteWithPoof(20, 100) (items/item.js 490-510): the puff, PROTO_PUFF, and gone 200 ms later. */
function akPoofOut(engine, classId) {
  const ak = run?.data?.ak;
  const row = ak?.animals[classId];
  if (!row || row.gone) return;
  row.gone = true;
  deleteWithPoof(engine, row.sprite, AK_POOF_OUT.dx, AK_POOF_OUT.dy);
  setTimeout(() => {
    if (run?.data?.ak !== ak) return;
    engine.unregister(row.target);
    akLog(engine, `gone:${classId}`);
  }, AK_POOF_OUT.deleteMs);
}

/** &newxpautoplay=1: walk the boxes and do each verb the signs ask for. */
async function akAutoplay(t, engine, fireSafe) {
  const ak = run?.data?.ak;
  if (!ak) return;
  const tick = () => akTick(engine, fireSafe);
  // Real time (sleep() caps at 300 ms in autoplay), so the poofs and bubbles play out on screen.
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)).then(() => alive(t));
  const visit = async (box) => {
    place(box.x, box.y - 20);
    await until(t, () => { tick(); return ak.inBox.has(box.id); });
    await wait(2600);
  };
  // game.js isScreenFxBlocking stops a verb under these screens.
  const awardUp = () => typeof document !== 'undefined' && ['award-screen', 'new-day-screen', 'screen-transition'].some((id) => {
    const el = document.getElementById(id);
    return Boolean(el && !el.hidden && el.classList.contains('is-visible'));
  });
  const heard = (classId, verbId) => (ak.log || []).filter((x) => x === `verb:${classId}:${verbId}`).length;
  // An award screen popping up can stop a verb, so each one is tried until its success event comes.
  const doVerb = async (classId, verbId) => {
    const before = heard(classId, verbId);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const row = ak.animals[classId];
      if (!row || row.gone) return false;
      await until(t, () => !awardUp() && !engine.currentAction);
      place(row.sprite.x - 60, AK_ANIMALS[classId].airborne ? row.sprite.y + 60 : row.sprite.y - 10);
      await wait(300);
      const verb = (engine.targetVerbs(row.target) || []).find((v) => v.id === verbId && v.enabled !== false);
      if (!verb) {
        akLog(engine, `autoplay:no-${verbId}`);
        await wait(700);
        continue;
      }
      akLog(engine, `do:${verbId}:${engine.beginVerb(row.target, verb) ? 'ok' : 'busy'}`);
      await until(t, () => { tick(); return !engine.currentAction; });
      await wait(500);
      if (heard(classId, verbId) > before) return true;
    }
    return false;
  };
  const [chicken, pig, lotion, butterfly] = AK_EVENT_BOXES;
  await visit(chicken);
  await doVerb('npc_chicken', 'squeeze');
  await doVerb('npc_chicken', 'squeeze');
  await wait(3200);
  await visit(pig);
  await doVerb('npc_piggy', 'pet');
  await doVerb('npc_piggy', 'nibble');
  await wait(3200);
  await visit(lotion);
  const bottle = run.pickups.find((row) => row.classTsid === 'butterfly_lotion' && !row.picked);
  if (bottle) pickUp(engine, bottle);
  await wait(1500);
  await visit(butterfly);
  await doVerb('npc_butterfly', 'massage');
  await doVerb('npc_butterfly', 'milk');
  await wait(3200);
}

/* ------------------------------------------------------------------ */
/* Stage: island (Gentle Island)                                         */
/* ------------------------------------------------------------------ */

function questCtx(engine) {
  return { inv: engine.inv, pc: engine.pc, level: engine.pc.level, skills: engine.learnedSkills, addItem, removeItem, countItem, now: Date.now() };
}

async function runIsland(t) {
  const engine = engineRef;
  hud({});
  if (!GENTLE_ISLAND_TSIDS.includes(engine.streetTsid) && save.island !== 'exited') {
    await engine.enter(ISLAND_ARRIVAL.tsid, { spawnX: ISLAND_ARRIVAL.x, spawnY: ISLAND_ARRIVAL.y, quiet: true, bypassFeatureGates: true });
  }
  fadeIn();
  alive(t);
  // The rest is event driven: islandEnter / islandTick.
  islandEnter(engine);
  await until(t, () => save.stage !== 'island' || save.status !== 'active', { every: 400 });
  return null;
}

function rockOnSurveyors(engine) {
  if (!run || run.data.rock || engine.streetTsid !== GENTLE_ISLAND.surveyors_stroll) return run?.data.rock || null;
  const ground = groundBelow(engine, 560, 700);
  const rock = makeNpc(engine, 'rock', 560, ground, { register: true, classId: 'newxp_rock', subtitle: 'Reading' });
  rock.face(-1);
  run.npcs.push(rock);
  run.data.rock = rock;
  return rock;
}

function islandEnter(engine) {
  if (!run || save.stage !== 'island') return;
  const tsid = engine.streetTsid;
  // Called from onStreetEnter and the stage runner: once per street visit.
  if (run.data.enteredTsid === tsid && run.data.rock && !run.data.rock.sprite.destroyed) return;
  run.data.enteredTsid = tsid;
  engine.setData('newxpIsland', save.island);
  if (GENTLE_ISLAND_TSIDS.includes(tsid) && run.data.scriptsTsid !== tsid) {
    run.data.scriptsTsid = tsid;
    islandStreetScripts(engine);
  }
  if (tsid === GENTLE_ISLAND.progress_way) {
    // The street spirit is the cheap bag vendor; if none spawned, a stall stands in.
    setTimeout(() => {
      if (!run || engine.streetTsid !== GENTLE_ISLAND.progress_way || run.data.stall) return;
      if ((engine.interactables || []).some((it) => String(it.classId || '').startsWith('street_spirit'))) return;
      const { PIXI } = engine;
      const stall = new PIXI.Container();
      const g = new PIXI.Graphics();
      g.roundRect(-60, -90, 120, 90, 8).fill(0x8a5a2e);
      g.roundRect(-70, -112, 140, 26, 6).fill(0xe9c46a);
      stall.addChild(g);
      stall.addChild(kit.icon(PIXI, 'bag_generic', 0, -40));
      stall.addChild(kit.label(PIXI, 'Cheap Bags', 0, -99, { size: 13, fill: 0x5b3a00 }));
      stall.x = 2300;
      stall.y = groundBelow(engine, 2300, 600);
      stall.zIndex = 22;
      run.data.stall = registerFixture(engine, stall, 'newxp_bag_vendor', 'Cheap Bag Vendor', { subtitle: 'Bags, cheap' });
    }, 900);
  }
  if (tsid === GENTLE_ISLAND.surveyors_stroll) {
    const rock = rockOnSurveyors(engine);
    if (save.island === 'arrive' && !islandBusy) islandRockScript(engine, token, rock);
  }
  if (save.exit && tsid === save.exit.tsid && save.island === 'exited') exitArrivedAt = Date.now();
}

async function islandRockScript(engine, t, rock) {
  islandBusy = true;
  try {
    setStep('island_rock');
    await sleep(t, 2000);
    const skill = firstSkill(save.skill) || FIRST_SKILLS[0];
    await talk(t, rock, LINES.islandHello, { choices: [{ label: 'Yes, I need some bags', value: 'give-quest' }], vars: { skill: skill.name } });
    await vog(t, LINES.watchThis);
    const ans = await talk(t, rock, LINES.explainQuest, { choices: [{ label: 'Currants? What are currants?', value: 'explain-currants' }] });
    if (ans) await vog(t, LINES.currants);
    // revealCurrants: the counter appears (callout), then +978.
    setFlag('currants_revealed');
    islandHud(engine);
    callout('.meta-stat.currants', 3000);
    await sleep(t, 2000);
    engine.pc.currants = (Number(engine.pc.currants) || 0) + ISLAND_CURRANTS;
    engine.floatText(P().x, P().y - 90, `+${ISLAND_CURRANTS} currants`, '#ffe28a');
    engine.playSound('QUOIN_CURRANTS', { volume: 0.4 });
    engine.updateHud();
    await sleep(t, 4000);
    await talk(t, rock, LINES.shortChange, { buttons: ['Thanks'] });
    await vog(t, LINES.thatWasQuest);
    // giveQuest: buy_two_bags straight into the log.
    const res = acceptOffer(engine.questState, 'buy_two_bags', questCtx(engine));
    engine.setData('newxpLast', `accept:buy_two_bags:${res.reason}`);
    engine.playSound('QUEST_ADDED', { volume: 0.6 });
    engine.pushActivity(LINES.questLogHint);
    engine.toast(LINES.questLogHint, 4000);
    save.island = 'quest_given';
    reminderAt = Date.now() + BAG_REMINDER_MS;
    engine.save();
    engine.updateHud();
    await sleep(t, 2000);
    say(rock, LINES.goodLuck, 3000);
    setStep('find_bags');
    if (auto) autoIslandTour(engine, t).then(() => autoBags(engine, t)).catch(() => {});
  } catch (err) {
    if (!(err instanceof Cancel)) console.warn('newxp island', err);
  } finally {
    islandBusy = false;
  }
}

/** The cheap bag vendor (Progress Way): Generic Bags at the rock's "about 500". */
function bagShopProfile() {
  return {
    key: 'newxp_bags',
    id: 'street_spirit_bags',
    badge: 'B',
    color: 0xc79a4a,
    label: 'Cheap Bag Vendor',
    desc: 'Bags, cheap.',
    buyMultiplier: 0.66,
    offers: [{ classTsid: 'bag_generic', label: 'Generic Bag', cost: CHEAP_BAG_PRICE, buyPrice: CHEAP_BAG_PRICE }],
  };
}

const bagsBought = (engine) => Number(engine.questState?.active?.buy_two_bags?.progress?.generic_bag_purchased) || 0;
const questDone = (engine, id) => (engine.questState?.completed || []).includes(id);

/**
 * How many bags the quest still wants, the way the original client said it
 * after each purchase (QuestQueue.as 142-181: the quest's title and
 * "Purchase a Generic Bag (1/2)" for four seconds, COMPLETE_QUEST_REQUIREMENT,
 * and "Quest Progress: ..." in the local log). Shown after each bag bought,
 * and again after the Progress Way gate's "You haven't bought your bags"
 * (a departure: the source said only that line there, and players with one
 * bag read it as a bug). Null when the quest isn't running.
 */
function bagProgress(engine, { sound = true } = {}) {
  const def = getQuestCatalog().buy_two_bags;
  const req = def?.requirements?.find((r) => r.name === 'generic_bag_purchased');
  const done = questDone(engine, 'buy_two_bags');
  if (!def || !req || (!done && !engine.questState?.active?.buy_two_bags)) return null;
  const q = questQueueLine(def.title, req.desc, done ? req.num : bagsBought(engine), req.num);
  engine.toast(`${q.title}: ${q.line}`, 4000);
  if (sound) engine.playSound('COMPLETE_QUEST_REQUIREMENT', { volume: 0.6 });
  engine.pushActivity(`Quest Progress: ${q.title}. ${q.line}`);
  engine.setData('newxpBagProgress', q.line);
  return q;
}

async function autoBags(engine, t) {
  try {
    await engine.enter(GENTLE_ISLAND.progress_way, { spawnX: 2300, quiet: true, bypassFeatureGates: true });
    alive(t);
    const pc = engine.pc;
    if ((pc.currants || 0) < CHEAP_BAG_PRICE * BAGS_NEEDED) pc.currants = CHEAP_BAG_PRICE * BAGS_NEEDED;
    for (let i = 0; i < BAGS_NEEDED; i++) {
      pc.currants -= CHEAP_BAG_PRICE;
      addItem(engine.inv, 'bag_generic', 1);
      engine.refreshPack();
      // The vendor's own event, so the managed quest advances the normal way.
      engine.achievement?.('vendor_bought:bag_generic', 1);
      await sleep(t, 300);
    }
    engine.updateHud();
  } catch (err) {
    if (!(err instanceof Cancel)) console.warn('newxp bags', err);
  }
}

async function afterBags(engine, t) {
  islandBusy = true;
  try {
    // Wait for the turn-in award screen (and any shop) to close.
    const awardOpen = () => {
      const a = document.getElementById('award-screen');
      return Boolean(a && !a.hidden && a.getClientRects().length);
    };
    await until(t, () => !awardOpen() && !engine.questDialogueOpen() && !engine.shopOpen(), { every: 300 });
    // buy_two_bags onComplete_custom, then revealImagination/openImagination:
    // the source opened the iMG menu on its "go home" callout; here the Home
    // panel opens on Teleport home.
    await vog(t, LINES.backAndForth);
    if (!engine.homeOwned?.()) engine.grantHome?.(save.homeStyle || 'meadow');
    save.island = 'go_home';
    engine.save();
    engine.setData('newxpIsland', save.island);
    setStep('go_home');
    openHomePanel(engine);
  } catch (err) {
    if (!(err instanceof Cancel)) console.warn('newxp after bags', err);
  } finally {
    islandBusy = false;
  }
}

/** The Home panel (#home-btn), standing in for the source iMG menu's go-home callout. */
function openHomePanel(engine) {
  const panel = document.getElementById('home-panel');
  if (panel && !panel.hidden) return;
  document.getElementById('home-btn')?.click();
  if (auto) {
    setTimeout(() => document.querySelector('#home-panel [data-home-action="teleport"]')?.click(), 400);
  }
}

/**
 * home.js (is_postnewxp) → magic_rock.js give-skill-learning → home.js
 * closedImaginationMenu / closedImaginationMenu2 → checkSideStreetsConvo
 * (force_bye) → remind-img → giveQuests. The remake grants the Skill
 * Learning card to every save, so the gift is the talk alone.
 */
async function homeWrapUp(engine, t) {
  islandBusy = true;
  try {
    setStep('home_gift');
    await sleep(t, 2000);
    const p = P();
    const rock = makeNpc(engine, 'rock', Math.min((p?.x || 250) + 240, (engine.street?.bounds?.r || 1500) - 80), engine.groundY, { register: true, classId: 'newxp_rock', subtitle: 'Your Magic Rock', base: 'idle' });
    run.npcs.push(rock);
    rock.face(-1);
    await talk(t, rock, LINES.homeGift, { buttons: ['Nice'] });
    const studying = document.getElementById('study-chip')?.hidden === false;
    if (!studying) {
      await talk(t, rock, LINES.skillBrain, { buttons: ['Will do'] });
      // open-skills: the Skills panel; the rock carries on when it closes.
      const panel = () => document.getElementById('skills-panel');
      if (!auto) document.getElementById('skills-btn')?.click();
      await sleep(t, 300);
      await until(t, () => !panel() || panel().hidden, { every: 300 });
    }
    await talk(t, rock, LINES.wellKid, { buttons: ['OK'] });
    await talk(t, rock, LINES.chapterBye, { buttons: ['Bye'] });
    await sleep(t, auto ? 300 : 4000);
    await vog(t, LINES.whenReady);
    save.island = 'home_done';
    engine.save();
    engine.setData('newxpIsland', save.island);
    setStep('leave_offer');
    offerLeave(engine, t);
  } catch (err) {
    if (!(err instanceof Cancel)) console.warn('newxp home', err);
  } finally {
    islandBusy = false;
  }
}

/** home.js giveQuests: quests_offer('leave_gentle_island'). */
function offerLeave(engine, t) {
  const def = getQuestCatalog().leave_gentle_island;
  if (!def || save.island !== 'home_done') return;
  const pages = talkPages(def.offer, {}, 'OK');
  engine.offerQuestDialogue({
    title: def.title,
    kicker: 'Magic Rock',
    beats: pages.map((p) => ({ text: p.text.replace(/<[^>]+>/g, ''), response: p.button })),
    acceptLabel: 'I’ll find it',
    // G255: leave_gentle_island has no onStarted: one button (quest.js get_status 1119-1124).
    // Closed unanswered, talking to the rock offers it again.
    declinable: false,
    onAccept: () => {
      acceptOffer(engine.questState, 'leave_gentle_island', questCtx(engine));
      save.island = 'leaving';
      engine.save();
      engine.setData('newxpIsland', save.island);
      engine.toast('Find the way off Gentle Island: Progress Way, then Gentle Island Exit.', 4000);
      if (auto) autoLeave(engine, t);
    },
  });
  if (auto) setTimeout(() => engine.acceptOpenOffer(), 300);
}

async function autoLeave(engine, t) {
  try {
    // From the home street, Return to Ur first (back to the remembered island street).
    if (engine.homeContext?.().inHome) {
      document.getElementById('home-btn')?.click();
      await sleep(t, 300);
      document.querySelector('#home-panel [data-home-action="return"]')?.click();
      await until(t, () => !engine.homeContext?.().inHome, { every: 300 });
      await sleep(t, 600);
    }
    await engine.enter(GENTLE_ISLAND.exit, { spawnX: 5600, quiet: true, bypassFeatureGates: true });
    alive(t);
    place(ISLAND_BOXES.gentle_island_exit.x, ISLAND_BOXES.gentle_island_exit.y - 40);
  } catch (err) {
    if (!(err instanceof Cancel)) console.warn('newxp leave', err);
  }
}

/* ------------------------------------------------------------------ */
/* Exits with a way out (G401)                                          */
/* ------------------------------------------------------------------ */

/** The Map's signpost graph (map-routes-feature, same URL so the browser keeps one copy). */
const EXIT_GRAPH_URL = 'assets/content/signpost-graph.json?v=g198-1';
let exitGraph = null;

/**
 * G401 (Austin 2026-10-28, stranded on Rappam Rolls after the tutorial): an exit only counts when its
 * roads lead back to the starting street. The remake opens most of Ur through street projects (a road
 * into a street still being built stays closed: js/street-jobs.js roadClosure), while newxp_exits is from
 * a world whose roads were all built, so on a fresh world 100 of the 115 drops were pockets with every
 * signpost closed ("still under construction"), and a new player has no Teleportation for the Map.
 * `graph` is assets/content/signpost-graph.json (signposts; doors, which no road closure holds, except
 * keyed ones), `closed` the streets whose roads are closed now (street-jobs-feature closedRoads),
 * `start` the street the open world grows from (Hechey Track: its roads are never closed).
 */
export function exitLeadsHome(tsid, { graph, closed = [], start = DEFAULT_START } = {}) {
  const g = (t) => { const s = String(t || ''); return s.startsWith('L') ? `G${s.slice(1)}` : s; };
  const from = g(tsid);
  const home = g(start);
  if (!from || !graph?.streets) return false;
  if (from === home) return true;
  const shut = new Set((closed || []).map(g));
  const keyed = new Set(Object.keys(graph.doorKeys || {}));
  const seen = new Set([from]);
  const queue = [from];
  for (let i = 0; i < queue.length; i += 1) {
    const at = queue[i];
    const next = [
      ...(graph.streets[at] || []).filter((to) => !shut.has(to)),
      ...(graph.doors?.[at] || []).filter((to) => !keyed.has(`${at}>${to}`)),
    ];
    for (const to of next) {
      if (to === home) return true;
      if (seen.has(to)) continue;
      seen.add(to);
      queue.push(to);
    }
  }
  return false;
}

/** player.js teleportHome's pick, kept to exits with a way out; the starting street when none has one. */
export function pickOpenExit(rng, exists, open) {
  if (!open) return pickNewxpExit(rng, exists);
  return pickNewxpExit(rng, (tsid) => exists(tsid) && open(tsid)) || { sourceTsid: '', tsid: DEFAULT_START, x: 0, y: 0 };
}

/** A predicate for streets a new player can walk out of; null while the roads or the graph are unknown. */
async function exitRoads(engine) {
  if (!exitGraph && typeof fetch === 'function') {
    exitGraph = fetch(EXIT_GRAPH_URL).then((r) => r.json()).catch(() => null);
  }
  const graph = await exitGraph;
  if (!graph?.streets) exitGraph = null; // a failed load is tried again next time
  const closed = engine.query?.('closedRoads', engine);
  if (!graph?.streets || !Array.isArray(closed)) return null;
  return (tsid) => exitLeadsHome(tsid, { graph, closed });
}

/** player.js teleportHome: the source x, dropped in from above (x 0 is mid-street). */
function dropAtExit(engine, exit) {
  const b = engine.street?.bounds;
  if (b && engine.streetTsid === exit.tsid) place(Math.max(60, Math.min(b.r - b.l - 60, exit.x - b.l)), 40);
}

/** The tutorial's chrome is down once the island is left: nothing of it holds the avatar on the exit street. */
function unrootForExit() {
  rooted = false;
  if (!ui) return;
  for (const n of [ui.bubble, ui.card, ui.vog, ui.instr]) n.hidden = true;
  ui.resolve = null;
}

/** player.js teleportHome: choose_one(config.newxp_exits). */
async function leaveIsland(engine) {
  if (!islandExitOpen(save.island)) return;
  const open = await exitRoads(engine);
  if (!islandExitOpen(save.island)) return;
  const exit = pickOpenExit(Math.random, (tsid) => engine.streetExists(tsid), open);
  if (!exit) return;
  save.island = 'exited';
  save.exit = { tsid: exit.tsid, x: exit.x };
  engine.save();
  engine.setData('newxpExit', exit.tsid);
  unrootForExit();
  await fadeOut();
  await engine.enter(exit.tsid, { quiet: true, bypassFeatureGates: true });
  dropAtExit(engine, exit);
  fadeIn();
  islandEnter(engine);
}

let strandChecked = '';
let strandRetryAt = 0;
/**
 * G401: a player already left on a street with every road still being built (dropped there before the
 * pick above, or on a world whose roads have closed since) is set down on an exit with a way out, once,
 * when the street is entered or the game reloads there.
 */
async function rescueStranded(engine) {
  const tsid = engine.streetTsid;
  if (!save.exit || tsid !== save.exit.tsid || !(save.status === 'done' || save.island === 'exited')) return false;
  const open = await exitRoads(engine);
  if (!open) return 'unknown';
  if (open(tsid) || engine.streetTsid !== tsid) return false;
  const exit = pickOpenExit(Math.random, (t) => engine.streetExists(t), open);
  if (!exit || exit.tsid === tsid) return false;
  const from = engine.street?.label || 'this street';
  save.exit = { tsid: exit.tsid, x: exit.x };
  engine.save();
  engine.setData('newxpExit', exit.tsid);
  engine.setData('newxpRescued', `${tsid}>${exit.tsid}`);
  unrootForExit();
  await fadeOut();
  await engine.enter(exit.tsid, { quiet: true, bypassFeatureGates: true });
  dropAtExit(engine, exit);
  fadeIn();
  strandChecked = engine.streetTsid;
  engine.toast?.(`The roads out of ${from} are still under construction, so you were set down on ${engine.street?.label || 'a street nearby'}.`, 6000);
  return true;
}

async function finishTutorial(engine, t) {
  islandBusy = true;
  try {
    const qs = engine.questState;
    if (!qs.active.leave_gentle_island) acceptOffer(qs, 'leave_gentle_island', questCtx(engine));
    const quest = qs.active.leave_gentle_island;
    if (quest) {
      quest.progress ||= {};
      quest.progress.leave_gentle_island = 1;
      const done = turnInQuest(qs, 'leave_gentle_island', engine.pc, { ...questCtx(engine), force: true });
      if (done.ok) {
        engine.playSound('COMPLETE_QUEST_REQUIREMENT', { volume: 0.6 });
        engine.pushActivity(`Quest complete: ${done.def.title}`);
        engine.updateHud();
        await engine.award(questAwardPayload(done.def, done.rewards || {}));
      }
    }
    alive(t);
    // onComplete_custom: the Greeter Twig, a relic of the Island.
    await sleep(t, 2000);
    await vog(t, LINES.relic);
    addItem(engine.inv, 'greeter_twig', 1);
    engine.refreshPack();
    await vog(t, LINES.greeterTwig);
    await vog(t, LINES.explore);
    save.status = 'done';
    save.stage = 'done';
    save.doneAt = Date.now();
    engine.save();
    teardown(engine);
  } catch (err) {
    if (!(err instanceof Cancel)) console.warn('newxp finish', err);
  } finally {
    islandBusy = false;
  }
}

function islandTick(engine, now) {
  if (!run || save.stage !== 'island' || save.status !== 'active') return;
  const p = P();
  if (!p) return;
  const tsid = engine.streetTsid;
  islandHud(engine);
  if (GENTLE_ISLAND_TSIDS.includes(tsid)) islandScriptsTick(engine, now);
  // newbie_island.js street4_check: Progress Way is held until On to the
  // Big Time is accepted (no bags: back 250; bags but not home yet: back 150).
  const gate = ISLAND_BOXES.street4_check;
  const block = tsid === gate.tsid && inHitBox(gate, p.x, p.y) ? street4Check(save.island, questDone(engine, 'buy_two_bags')) : null;
  // One message per bump: walking straight back in re-pushes without stacking VoGs.
  const speak = block && now - (run.data.gateAt || 0) > 4000;
  if (speak) run.data.gateAt = now;
  if (block === 'noBags') {
    place(p.x - 250, p.y);
    if (speak) vog(token, LINES.noBagsYet).then(() => bagProgress(engine, { sound: false })).catch(() => {});
  } else if (block === 'notSoFast') {
    place(p.x - 150, p.y);
    if (speak) vog(token, LINES.notSoFast).then(() => { if (save.island === 'go_home') openHomePanel(engine); }).catch(() => {});
  }
  const exitBox = ISLAND_BOXES.gentle_island_exit;
  if (tsid === exitBox.tsid && inHitBox(exitBox, p.x, p.y) && islandExitOpen(save.island) && !run.data.leaving) {
    run.data.leaving = true;
    leaveIsland(engine).finally(() => { if (run) run.data.leaving = false; });
  }
  if (save.island === 'quest_given' && questDone(engine, 'buy_two_bags') && !islandBusy) {
    save.island = 'bags_done';
    engine.save();
  }
  if (save.island === 'bags_done' && !islandBusy && !scriptBusy && !run.data.afterBags) {
    run.data.afterBags = true;
    afterBags(engine, token);
  }
  // home.js playerEnterCallback (is_postnewxp): the rock's wrap-up at home.
  if (save.island === 'go_home' && tsid === HOME_STREET_TSID && !islandBusy && !scriptBusy && !run.data.homeTalk) {
    run.data.homeTalk = true;
    homeWrapUp(engine, token);
  }
  if (save.island === 'quest_given' && now > reminderAt && GENTLE_ISLAND_TSIDS.includes(tsid)) {
    reminderAt = now + BAG_REMINDER_MS;
    engine.pushActivity(LINES.bagReminder);
  }
  if (save.island === 'exited' && save.exit && tsid === save.exit.tsid && exitArrivedAt && now - exitArrivedAt > (auto ? 1500 : LEAVE_FLAG_DELAY_MS) && !islandBusy) {
    exitArrivedAt = 0;
    finishTutorial(engine, token);
  }
  engine.setData('newxpBags', bagsBought(engine));
}

/* ------------------------------------------------------------------ */
/* Gentle Island scripts: upgrade quoins, Mappery, signs, side streets  */
/* ------------------------------------------------------------------ */

const hasFlag = (f) => save.flags.includes(f);
function setFlag(f) {
  if (save.flags.includes(f)) return;
  save.flags.push(f);
  engineRef?.save();
  engineRef?.setData('newxpFlags', save.flags.join(','));
}

const onIsland = (engine) => GENTLE_ISLAND_TSIDS.includes(engine.streetTsid);
const islandLive = (engine) => active() && save.stage === 'island' && onIsland(engine);
let scriptBusy = false;

/** newbie_island.js hideUIOnLoad: no map or location until Mappery; Surveyor's Stroll hides currants until the rock's gift. */
function islandHud(engine) {
  if (typeof document === 'undefined') return;
  const live = islandLive(engine);
  const b = document.body.classList;
  b.toggle('nx-hide-map', live && !save.upgrades.includes('mappery'));
  // hideUIOnLoad 'world_map' / 'home_street_visiting': the island map shows only the island.
  b.toggle('nx-island-map', live);
  b.toggle('nx-hide-currants', live && engine.streetTsid === GENTLE_ISLAND.surveyors_stroll && save.island === 'arrive' && !hasFlag('currants_revealed'));
}

/** ui_callout: a short pulse on one piece of chrome. */
function callout(selector, ms = 3600) {
  if (typeof document === 'undefined') return;
  const node = document.querySelector(selector);
  if (!node) return;
  node.classList.remove('nx-callout');
  void node.offsetWidth;
  node.classList.add('nx-callout');
  setTimeout(() => node.classList.remove('nx-callout'), ms);
}

/** vp_canvas: a black wash over the street at `alpha` (0 clears it). */
function dim(alpha) {
  ensureUi();
  positionBubbles();
  ui.fade.style.opacity = String(alpha);
}

/** A screen point on this street from source coordinates. */
function streetPoint(engine, src) {
  return sourceToStreet(engine.street?.bounds, src.x, src.y);
}

/** Spawn the island event quoins for this street that are still to find. */
function islandQuoins(engine) {
  for (const def of ISLAND_QUOINS) {
    if (def.tsid !== engine.streetTsid || hasFlag(def.event)) continue;
    if (run.quoins.some((q) => q.id === def.id && !q.taken)) continue;
    let at;
    if (def.source) {
      at = streetPoint(engine, def.source);
      at.y -= 30; // the item's registration point is its bottom; the sprite is centred
    } else {
      const ground = groundBelow(engine, def.rebuilt.x, 0);
      at = { x: def.rebuilt.x, y: ground - def.rebuilt.above };
    }
    const amount = def.type === 'qurazy' ? qrazyRewardForLevel(engine.pc.level) : QUOIN_TYPES.xp.baseAmount;
    addQuoin(engine, def.id, at.x, at.y, () => islandQuoinEvent(engine, def), { type: def.type, reach: 110, amount });
  }
}

/** The quoin's location_event_id. */
async function islandQuoinEvent(engine, def) {
  if (hasFlag(def.event)) return;
  setFlag(def.event);
  const t = token;
  scriptBusy = true;
  try {
    engine.setData('newxpLast', `island_event:${def.event}`);
    if (def.event === 'explain_upgrades') {
      // pc_vog, then callout_upgrades: open_img_menu + the upgrades callout.
      await vog(t, ISLAND_LINES.explainUpgrades);
      if (typeof document !== 'undefined') {
        document.getElementById('img-btn')?.click();
        callout('#img-btn');
      }
      return;
    }
    const hand = islandHand(save.upgrades);
    if (!hand.length) return;
    // imagination_reduce_to_hand, then (2 s later for Mappery) the menu with no close button.
    engine.pc.imagination = reduceToHand(hand, engine.pc.imagination);
    engine.updateHud();
    if (def.event === 'mappery_upgrade') await sleep(t, 2000);
    const id = await islandUpgradeHand(t, hand);
    engine.setData('newxpIslandCard', id);
    await upgradeConfirmed(engine, t, id);
  } catch (err) {
    if (!(err instanceof Cancel)) console.warn('newxp island quoin', err);
  } finally {
    scriptBusy = false;
  }
}

/** newbie_island.js upgradeConfirmed (2 s after the card). */
async function upgradeConfirmed(engine, t, id) {
  if (id === 'mappery') return revealMappery(engine, t);
  const key = ISLAND_CONFIRM[id];
  if (!key) return null;
  await sleep(t, 2000);
  await vog(t, ISLAND_LINES[key]);
  return null;
}

/** upgradeConfirmed('mappery') → revealMappery → revealMappery2 → calloutMap. */
async function revealMappery(engine, t) {
  setStep('mappery');
  await sleep(t, 2000);
  await vog(t, ISLAND_LINES.mappery);
  // A 0.3 black canvas for a moment, the map and location come on, the minimap callout.
  islandHud(engine);
  dim(0.3);
  callout('#street-nameplate');
  await sleep(t, 3000);
  dim(0);
  await vog(t, ISLAND_LINES.mappery2);
  // calloutMap: the map icon, the hub map opened on Progress Way, the activity line.
  callout('#map-btn');
  if (run) run.data.mapHint = true;
  engine.pushActivity(ISLAND_LINES.mapperyActivity);
  setStep('map_progress_way');
  await sleep(t, 800);
  if (engine.streetTsid === GENTLE_ISLAND.progress_way) return null;
  await engine.openMap(String(engine.street?.hubId || '129'));
  if (typeof document !== 'undefined') document.getElementById('map-panel')?.classList.add('nx-map-progress');
  if (auto) {
    // A street click opens its Set as Destination / Teleport Here menu (G356) and never travels, so
    // autoplay just closes the Map, as a player who has read it would; the tour walks on by itself.
    await sleep(t, 400);
    engine.closeMap?.();
  }
  return null;
}

/** The hint signs' text (the client printed sign_txt over the invisible groddle_sign_blank decos). */
function islandSigns(engine, table = ISLAND_SIGNS, { follow = false } = {}) {
  const street = engine.street;
  if (!street || !run) return;
  run.data.signs = [];
  for (const layer of street.layers || []) {
    const raw = layer.id !== 'middleground' && layer.w > 0 && layer.h > 0;
    for (const deco of layer.decos || []) {
      const sign = table[deco.id];
      if (!sign?.face) continue;
      const pos = raw || /^T_/.test(String(layer.id || '')) ? { x: deco.x, y: deco.y } : sourceToStreet(street.bounds, deco.x, deco.y);
      const h = deco.h || 248;
      const label = new engine.PIXI.Text({
        text: sign.text.replace(/<br>\s*/g, '\n'),
        style: {
          fontFamily: 'Nunito, "Trebuchet MS", sans-serif',
          fontWeight: '800',
          fontSize: sign.plaque ? 20 : 22,
          fill: 0xffffff,
          align: 'center',
          wordWrap: true,
          wordWrapWidth: Math.max(160, (deco.w || 400) * 0.9),
          dropShadow: { color: 0x5b3a1a, alpha: 1, blur: 0, distance: 3, angle: Math.PI / 3 },
        },
      });
      label.anchor.set(0.5, 0.5);
      label.x = pos.x;
      label.y = pos.y - h / 2;
      label.zIndex = 3;
      label.visible = false;
      engine.entityLayer.addChild(label);
      run.fixtures.push(label);
      run.data.signs.push({ id: deco.id, label, follow: follow ? h / 2 : 0 });
    }
  }
}

/** Follow each sign deco's show/hide (and its fade) from the street's own events. */
function syncSigns(engine) {
  const views = engine.decoViews;
  for (const row of run?.data?.signs || []) {
    if (row.label.destroyed) continue;
    const view = views?.get(row.id);
    row.label.visible = Boolean(view && !view.destroyed && view.visible);
    row.label.alpha = view ? view.alpha : 0;
    // `follow`: ride the deco through its own (parallax) layer, centred on it.
    if (row.follow && row.label.visible && view.parent && engine.entityLayer) {
      const at = engine.entityLayer.toLocal(view.parent.toGlobal({ x: view.x, y: view.y - row.follow }));
      row.label.x = at.x;
      row.label.y = at.y;
    }
  }
  // QA (data-newxp-signs): each shown sign's deco id tail and label centre in world px.
  const shown = (run?.data?.signs || []).filter((row) => row.label.visible && !row.label.destroyed)
    .map((row) => `${row.id.slice(-4)}@${Math.round(row.label.x)},${Math.round(row.label.y)}a${row.label.alpha.toFixed(2)}`).join(' ');
  if (shown !== lastSignsData) {
    lastSignsData = shown;
    engine.setData('newxpSigns', shown);
  }
}
let lastSignsData = null;

function fireStreetEvent(engine, name) {
  const ok = locationEventsApi.fire(engine, name);
  engine.setData('newxpStreetEvent', name);
  return ok;
}

/** The Collision-triggered Event Boxes, rebuilt (enter edge). */
function islandBoxes(engine, p) {
  run.data.inBox ||= new Set();
  // has_ak: the source hid the butterfly hints from players who know Animal Kinship. Every remake save
  // starts with it as a demo skill, so the tutorial asks whether it was the skill the rock gave.
  const hasAk = save.skill === 'animalkinship_1';
  for (const box of islandBoxesFor(engine.streetTsid)) {
    const key = `${box.tsid}:${box.event}`;
    const inside = inHitBox({ x: box.x, y: box.y, w: box.w, h: box.h }, p.x, p.y);
    if (!inside) {
      run.data.inBox.delete(key);
      continue;
    }
    if (run.data.inBox.has(key)) continue;
    run.data.inBox.add(key);
    if (box.unlessAk && hasAk) continue;
    if (box.event === 'crazy') {
      // flag cray: once; and only while the Qurazy is still there.
      if (hasFlag('cray') || hasFlag('mappery_upgrade')) continue;
      setFlag('cray');
      vog(token, `${ISLAND_LINES.crazy}//${ISLAND_LINES.crazy2}`).catch(() => {});
      continue;
    }
    const offFlag = `${box.event.replace(/_on$/, '')}_off_called`;
    if (hasFlag(offFlag)) continue;
    fireStreetEvent(engine, box.event);
  }
}

/** eventFired: items_added / verb_activate / verb_massage turn the hints off. */
function islandHints(engine) {
  const tsid = engine.streetTsid;
  const inv = engine.inv;
  const d = run.data;
  if (tsid === GENTLE_ISLAND.high_jumpers_gully) {
    const spinach = countItem(inv, 'spinach');
    if (d.spinachSeen == null) d.spinachSeen = spinach;
    if (spinach > d.spinachSeen && !hasFlag('spinach_hint_off_called')) {
      setFlag('spinach_hint_off_called');
      fireStreetEvent(engine, 'spinach_hint_off');
    }
    d.spinachSeen = spinach;
    if (engine.hasBuff?.('spinach') && !hasFlag('spinach_hint2_off_called')) {
      setFlag('spinach_hint2_off_called');
      fireStreetEvent(engine, 'spinach_hint2_off');
    }
  }
  if (tsid === GENTLE_ISLAND.progress_way || tsid === GENTLE_ISLAND.diversionary_path) {
    const lotion = countItem(inv, 'butterfly_lotion');
    if (d.lotionSeen == null) d.lotionSeen = lotion;
    if (lotion > d.lotionSeen && !hasFlag('butterfly_lotion_msg_off_called')) {
      setFlag('butterfly_lotion_msg_off_called');
      fireStreetEvent(engine, 'butterfly_lotion_msg_off');
    }
    d.lotionSeen = lotion;
  }
}

/** NB_Side_Street2: a random Musicblock at (-988, -467) and the garden full of Spinach. */
function doonboggleSetup(engine) {
  if (!hasFlag('musicblock')) {
    if (!save.musicblock) {
      save.musicblock = ISLAND_MUSICBLOCKS[Math.floor(Math.random() * ISLAND_MUSICBLOCKS.length)];
      engine.save();
    }
    const at = streetPoint(engine, ISLAND_MUSICBLOCK_AT);
    addPickup(engine, 'musicblock', save.musicblock, 1, at.x, groundBelow(engine, at.x, at.y - 40), () => {
      setFlag('musicblock');
      if (!hasFlag('musicblock_msg_off_called')) {
        setFlag('musicblock_msg_off_called');
        fireStreetEvent(engine, 'musicblock_msg_off');
      }
    });
  }
  if (!hasFlag('garden')) {
    // garden.js setNewXPGarden: every plot a ripe Spinach crop.
    setTimeout(() => {
      if (!run || engine.streetTsid !== GENTLE_ISLAND.doonboggle_trail) return;
      const target = (engine.interactables || []).find((it) => it.classId === 'garden_new');
      const garden = target?.state?.garden;
      if (!garden?.plots) return;
      const now = Date.now();
      for (const plot of Object.values(garden.plots)) {
        plot.seed = 'seed_spinach';
        plot.state = 'crop';
        plot.stageStartedAt = now;
        plot.growthMs = 0;
      }
      engine.refreshGarden(target);
      setFlag('garden');
      engine.setData('newxpGarden', Object.keys(garden.plots).length);
    }, 300);
  }
}

/** High Jumper's Gully: the Gameshow Ticket on its stand (gst_off / hide_gst once taken). */
function gullySetup(engine) {
  if (hasFlag('gst')) {
    fireStreetEvent(engine, 'hide_gst');
    return;
  }
  const at = streetPoint(engine, ISLAND_TICKET_AT);
  addPickup(engine, 'gameshow_ticket', 'gameshow_ticket', 1, at.x, groundBelow(engine, at.x, at.y - 40), () => {
    setFlag('gst');
    fireStreetEvent(engine, 'gst_off');
    fireStreetEvent(engine, 'hide_gst');
  });
}

/** Progress Way: the street spirit sings until you walk up to her (singTo / onPlayerCollision). */
function spiritWho(engine) {
  const it = (engine.interactables || []).find((x) => String(x.classId || '').startsWith('street_spirit'));
  const sprite = it?.sprite || run?.data?.stall;
  if (!sprite || sprite.destroyed) return null;
  return { name: 'Street Spirit', x: sprite.x, head: () => (sprite.destroyed ? null : { x: sprite.x, y: sprite.y - 130 }) };
}

function spiritTick(engine, now, p) {
  if (hasFlag('spirit_sang') || engine.streetTsid !== GENTLE_ISLAND.progress_way || scriptBusy) return;
  const who = spiritWho(engine);
  if (!who) return;
  const d = run.data;
  if (Math.abs(p.x - who.x) <= SPIRIT_SING.hitW / 2 && p.y > who.head().y - SPIRIT_SING.hitH + 130 && !engine.acting() && !islandBusy) {
    setFlag('spirit_sang');
    spiritOh(engine, token, who);
    return;
  }
  if (!d.singAt || now >= d.singAt) {
    d.singAt = now + SPIRIT_SING.everyMs;
    d.songIndex = ((d.songIndex ?? -1) + 1) % ISLAND_LINES.song.length;
    say(who, ISLAND_LINES.song[d.songIndex], 3000, { log: d.songIndex === 0 && !d.sangOnce });
    d.sangOnce = true;
  }
}

async function spiritOh(engine, t, who) {
  scriptBusy = true;
  try {
    rooted = true;
    if (ui) ui.say.hidden = true;
    await sleep(t, SPIRIT_SING.lockMs);
    await talk(t, who, ISLAND_LINES.spiritOh, { buttons: ['OK'] });
  } catch (err) {
    if (!(err instanceof Cancel)) console.warn('newxp spirit', err);
  } finally {
    rooted = false;
    scriptBusy = false;
  }
}

/** Per street entry on Gentle Island during the tutorial. */
function islandStreetScripts(engine) {
  const tsid = engine.streetTsid;
  islandHud(engine);
  islandSigns(engine);
  islandQuoins(engine);
  if (tsid === GENTLE_ISLAND.doonboggle_trail) doonboggleSetup(engine);
  if (tsid === GENTLE_ISLAND.high_jumpers_gully) gullySetup(engine);
  if (tsid === GENTLE_ISLAND.progress_way && run?.data.mapHint) {
    run.data.mapHint = false;
    if (typeof document !== 'undefined') document.getElementById('map-panel')?.classList.remove('nx-map-progress');
  }
}

/** Per frame on Gentle Island during the tutorial. */
function islandScriptsTick(engine, now) {
  const p = P();
  if (!p || !run) return;
  islandHud(engine);
  syncSigns(engine);
  islandBoxes(engine, p);
  islandHints(engine);
  spiritTick(engine, now, p);
}

/** Autoplay: the island's own beats (the Qurazy and Mappery, the gully's quoins, the side streets). */
async function autoIslandTour(engine, t) {
  const grab = async (id) => {
    const q = run?.quoins.find((x) => x.id === id && !x.taken);
    if (!q) return;
    place(q.x, q.y + 40);
    await until(t, () => q.taken, { every: 120 });
    await until(t, () => !scriptBusy && ui?.card.hidden !== false && ui?.vog.hidden !== false, { every: 200 });
  };
  await grab('qurazy_stroll');
  await until(t, () => engine.streetTsid === GENTLE_ISLAND.progress_way || !engine.busy(), { every: 300 });
  if (engine.param('newxpautoplay') !== '1' || engine.param('newxpisland') === 'quick') return;
  for (const tsid of [GENTLE_ISLAND.high_jumpers_gully, GENTLE_ISLAND.doonboggle_trail]) {
    await engine.enter(tsid, { quiet: true, bypassFeatureGates: true });
    alive(t);
    await sleep(t, 600);
    if (tsid === GENTLE_ISLAND.high_jumpers_gully) {
      await grab('zoom_upgrade');
      await grab('other_upgrade');
      const ticket = run?.pickups.find((r) => r.id === 'gameshow_ticket' && !r.picked);
      if (ticket) pickUp(engine, ticket);
    } else {
      const block = run?.pickups.find((r) => r.id === 'musicblock' && !r.picked);
      if (block) pickUp(engine, block);
    }
    await sleep(t, 400);
  }
}

/* ------------------------------------------------------------------ */
/* Stage driver                                                         */
/* ------------------------------------------------------------------ */

const RUNNERS = { clouds: runClouds, training1: runTraining1, training2: runTraining2, house: runHouse, skill: runSkill, island: runIsland };

function clearRun(engine) {
  if (!run) return;
  for (const npc of run.npcs) if (npc.target) engine.unregister(npc.target);
  for (const row of run.pickups) if (!row.picked) engine.unregister(row.target);
  for (const q of run.quoins) if (q.spr && !q.spr.destroyed) q.spr.destroy();
  for (const f of run.fixtures) if (f && !f.destroyed) f.destroy?.({ children: true });
  for (const target of run.data.panels || []) engine.unregister(target);
  if (run.data.eggTarget) engine.unregister(run.data.eggTarget);
  run = null;
}

async function beginStage(engine, stage) {
  token += 1;
  const t = token;
  if (ui) {
    ui.bubble.hidden = true;
    ui.card.hidden = true;
    ui.vog.hidden = true;
    ui.say.hidden = true;
  }
  clearInstruction();
  rooted = false;
  if (SCENE_STAGES.includes(stage) && engine.started) await fadeOut();
  if (t !== token) return;
  clearRun(engine);
  run = newRun(stage);
  save.stage = stage;
  save.status = 'active';
  engine.save();
  showPill(true);
  engine.setData('newxpStage', stage);
  engine.setData('newxpStatus', 'active');
  if (holdAt && holdAt === stage) {
    engine.setData('newxpAutoplay', `hold:${stage}`);
    auto = false;
  }
  const runner = RUNNERS[stage];
  if (!runner) return;
  try {
    const next = await runner(t);
    if (t !== token || !next) return;
    await beginStage(engine, next);
  } catch (err) {
    if (!(err instanceof Cancel)) console.warn('newxp stage', stage, err);
  }
}

function teardown(engine) {
  token += 1;
  clearRun(engine);
  rooted = false;
  scriptBusy = false;
  hud({});
  if (typeof document !== 'undefined') document.body.classList.remove('nx-hide-map', 'nx-hide-currants', 'nx-island-map');
  if (ui) {
    for (const n of [ui.bubble, ui.vog, ui.card, ui.say, ui.instr]) n.hidden = true;
    ui.pill.hidden = true;
    ui.fade.style.opacity = '0';
  }
  engine.setData('newxpStatus', save.status);
  engine.setData('newxpStage', save.stage);
  if (auto) engine.setData('newxpAutoplay', save.status === 'done' ? 'done' : save.status);
}

async function skipTutorial(engine) {
  save.status = 'skipped';
  engine.save();
  const inScene = engine.inScene() && isNewxpSceneTsid(engine.streetTsid);
  teardown(engine);
  if (inScene || GENTLE_ISLAND_TSIDS.includes(engine.streetTsid)) {
    await engine.enter(DEFAULT_START, { quiet: true, bypassFeatureGates: true });
  }
  engine.toast('Welcome to Ur. The tutorial is skipped.', 3000);
}

function startTutorial(engine, stage = 'clouds') {
  save = startNewxp(save, stage);
  if (stage !== 'clouds' && !save.skill && STAGES.indexOf(stage) > STAGES.indexOf('house')) save.skill = firstSkill(engine.param('newxpskill'))?.id || 'animalkinship_1';
  // The rock grants the chosen skill before the practice street (runHouse); a forced later stage does too (G290).
  if (STAGES.indexOf(stage) > STAGES.indexOf('house') && save.skill && !(engine.learnedSkills || []).includes(save.skill)) engine.grantSkill(save.skill);
  if (stage !== 'clouds' && !save.name) save.name = 'Tester';
  // A forced later stage still has the home street the house stage imagines.
  if (STAGES.indexOf(stage) > STAGES.indexOf('house') && !engine.homeOwned?.()) {
    engine.grantHome?.(save.homeStyle || engine.param('newxpstyle') || 'meadow');
  }
  if (STAGES.indexOf(stage) >= STAGES.indexOf('training2')) {
    for (const id of ['walk_speed_1', 'jump_1']) if (!save.upgrades.includes(id)) save.upgrades.push(id);
  }
  // training2 sold High Jumper II and Walk Speed II.
  if (STAGES.indexOf(stage) > STAGES.indexOf('training2')) {
    for (const id of ['jump_2', 'walk_speed_2']) if (!save.upgrades.includes(id)) save.upgrades.push(id);
  }
  engine.stopFollowing?.();
  engine.closeMap?.();
  beginStage(engine, save.stage);
}

/* ------------------------------------------------------------------ */
/* Start card (brand-new saves only)                                     */
/* ------------------------------------------------------------------ */

function showStartCard(engine) {
  if (startCardShown || typeof document === 'undefined') return;
  const card = document.querySelector('#overlay .card');
  const startBtn = document.getElementById('start-btn');
  if (!card || !startBtn) return;
  ensureUi();
  startCardShown = true;
  const box = el('div', { class: 'nx-start', id: 'newxp-start' }, '');
  startBtn.hidden = true;
  startBtn.parentNode.insertBefore(box, startBtn);
  const tutorialChoice = () => {
    box.dataset.step = 'tutorial';
    // Multiplayer: every new player went through the tutorial (players/player.js onCreate
    // 1238-1239 goToNewNewStartingLevel; skipping was only a testing flag), so there is no Skip to Ur.
    if (engine.mode === 'multiplayer') {
      box.innerHTML = `
    <p><strong>Welcome to Ur.</strong> Every new Glitch starts in the clouds: meet the Welcoming Flamingo,
      the Dustbunny and your Magic Rock, then find your way off Gentle Island.</p>
    <div class="nx-start-row">
      <button type="button" data-nx-start>Start</button>
    </div>`;
      box.querySelector('[data-nx-start]').addEventListener('click', () => {
        pendingStage = 'clouds';
        startBtn.click();
      });
      engine.setData('newxpStartCard', 'tutorial-only');
      return;
    }
    box.innerHTML = `
    <p><strong>New to Ur?</strong> Fall out of the clouds and meet the Welcoming Flamingo,
      the Dustbunny and your Magic Rock, then find your way off Gentle Island.</p>
    <div class="nx-start-row">
      <button type="button" data-nx-start>Start with the tutorial</button>
      <button type="button" class="alt" data-nx-skipstart>Skip to Ur</button>
    </div>`;
    box.querySelector('[data-nx-start]').addEventListener('click', () => {
      // Austin 2026-10-28: a brand-new solo game that takes the tutorial starts as a new
      // multiplayer character does, from zero (game.js startAsNewPlayer, js/new-player.js;
      // players/player.js onCreate 1188-1243). Skip to Ur keeps the demo kit.
      const fresh = engine.startAsNewPlayer?.() === true;
      engine.setData('newxpFreshStart', fresh ? '1' : '0');
      pendingStage = 'clouds';
      startBtn.click();
    });
    box.querySelector('[data-nx-skipstart]').addEventListener('click', () => {
      save.status = 'skipped';
      startBtn.click();
    });
    // "Customize look first" on a brand-new save is the tutorial's own path with the look
    // builder opened first (Austin 2026-10-28): from zero, into the clouds. game.js opens the
    // builder on the same click; this capture listener runs before it.
    document.getElementById('start-customize-btn')?.addEventListener('click', () => {
      if (save.status === 'skipped' || pendingStage) return;
      const fresh = engine.startAsNewPlayer?.() === true;
      engine.setData('newxpFreshStart', fresh ? '1' : '0');
      pendingStage = 'clouds';
    }, { capture: true, once: true });
    engine.setData('newxpStartCard', 'shown');
  };
  // Solo or multiplayer is chosen before the game, on the Play page (/play/online/: sign in, or
  // Play solo; Austin 2026-10-26), so a new solo game goes straight to the tutorial choice.
  tutorialChoice();
}

/**
 * A reload with the tutorial in progress: no welcome card ("Welcome to a scrap
 * of Ur" over Hechey Track); the game starts by itself once the page has booted
 * and onTick's resume puts the player back in the stage it was on. The scenes
 * and the house and practice stages start again from their top; the island
 * resumes where the player stood. Sound waits for the first key or click
 * (game.js resumeAudioOnGesture), as under ?autostart.
 */
function resumeOnReload(engine) {
  if (resumeQueued || typeof document === 'undefined') return;
  const overlay = document.getElementById('overlay');
  const startBtn = document.getElementById('start-btn');
  if (!overlay || !startBtn) return;
  resumeQueued = true;
  overlay.classList.add('hidden');
  engine.setData('newxpResume', save.stage);
  const go = () => {
    if (engine.started) return;
    if (document.body.classList.contains('is-booting')) {
      setTimeout(go, 60);
      return;
    }
    startBtn.click();
  };
  setTimeout(go, 0);
}

/* ------------------------------------------------------------------ */
/* Feature                                                              */
/* ------------------------------------------------------------------ */

function active() {
  return save.status === 'active';
}

function inTutorialScene(engine) {
  return active() && SCENE_STAGES.includes(save.stage) && engine.inScene() && isNewxpSceneTsid(engine.streetTsid);
}

function publish(engine, now) {
  if (now - lastData < 300) return;
  lastData = now;
  engine.setData('newxpStatus', save.status);
  engine.setData('newxpStage', save.stage);
  engine.setData('newxpUpgrades', save.upgrades.join(','));
  engine.setData('newxpIsland', save.island);
  engine.setData('newxpRooted', rooted ? '1' : '0');
  engine.setData('newxpFlags', save.flags.join(','));
}

export const newxpFeature = {
  id: NEWXP_FEATURE_ID,

  init(engine) {
    engineRef = engine;
    const want = engine.param('newxp');
    auto = engine.param('newxpautoplay') === '1';
    holdAt = String(engine.param('newxphold') || '');
    if (want) {
      pendingStage = STAGES.includes(want) && want !== 'done' ? want : 'clouds';
      engine.setData('newxpAutoplay', auto ? 'running' : 'off');
    } else if (engine.newPlayer) {
      // A new multiplayer character starts in the tutorial however the game is started.
      pendingStage = 'clouds';
    }
  },

  onStreetEnter(street, engine) {
    if (!engine.started && !hadSave && !engine.param('autostart') && !engine.param('newxp')) showStartCard(engine);
    if (!engine.started && hadSave && !engine.param('autostart') && !engine.param('newxp')
      && shouldResume(save, { fresh: engine.param('fresh') != null, resetgame: engine.param('resetgame') != null })) resumeOnReload(engine);
    if (active() && save.stage === 'island' && run && !isNewxpSceneTsid(street?.tsid)) islandEnter(engine);
    // players/inc_newxp.js newxpReturnToGentleIsland: back on the island after finishing it.
    if (save.status === 'done' && GENTLE_ISLAND_TSIDS.includes(street?.tsid) && !hasFlag('returned') && engine.started) {
      setFlag('returned');
      setTimeout(() => vog(token, ISLAND_LINES.returnToIsland).catch(() => {}), 1500);
    }
  },

  onStreetClear(engine) {
    if (!run) return;
    // Scene and street changes destroy world entities; drop our references.
    run.npcs = [];
    run.quoins = [];
    run.pickups = [];
    run.fixtures = [];
    if (run.data) {
      run.data.panels = [];
      run.data.eggTarget = null;
      run.data.rock = null;
      run.data.stall = null;
      run.data.enteredTsid = '';
      run.data.scriptsTsid = '';
      run.data.signs = [];
      run.data.inBox = null;
      run.data.spinachSeen = null;
      run.data.lotionSeen = null;
      run.data.singAt = 0;
      run.data.ak = null;
    }
    if (ui) {
      ui.bubbleFor = null;
      ui.say.hidden = true;
    }
  },

  ecologyOverride(street) {
    // skillquest_ak.js reset() removes every npc_chicken, npc_piggy and npc_butterfly; the
    // event boxes poof one of each in (akSpawn, G290), so the street itself has none.
    // LHFRK14DDU53RQQ.xml items (273-290) are the whole street: ten event boxes, 3 Coins
    // (items/quoin.js), a Side Table (akSideTable) and a hidden teleporter (the EXIT, our
    // finish box). As an exact row (street-ecology.js `interior`, like tower-rooms-feature)
    // it gets those 3 quoins and no apples, Musicblocks or seasonal decor (G298).
    if (street?.tsid === SKILLQUEST_AK_TSID) {
      return { label: 'A L\'il Animal Kinship', sourceTsid: SKILLQUEST_AK_SOURCE, counts: {}, interior: true, quoins: AK_QUOINS };
    }
    return null;
  },

  onTick(dtMs, now, engine) {
    if (!engine.started) return;
    if (!resumeChecked) {
      resumeChecked = true;
      if (pendingStage) {
        const stage = pendingStage;
        pendingStage = null;
        startTutorial(engine, stage);
      } else if (shouldResume(save, { fresh: engine.param('fresh') != null, resetgame: engine.param('resetgame') != null })) {
        // Training scenes restart at the top (reset()); the island resumes in place.
        if (SCENE_STAGES.includes(save.stage) || ['house', 'skill'].includes(save.stage)) beginStage(engine, save.stage);
        else beginStage(engine, save.stage);
      }
    }
    // G401: once a street is settled (no card, panel or transition up), a player stranded on the exit street is moved on.
    if (save.exit && engine.streetTsid !== strandChecked && now >= strandRetryAt && !islandBusy && !engine.busy?.()) {
      strandChecked = engine.streetTsid;
      rescueStranded(engine)
        .then((res) => {
          // The street projects or the graph still loading: look again in a moment.
          if (res === 'unknown') { strandChecked = ''; strandRetryAt = Date.now() + 2000; }
        })
        .catch((err) => console.warn('newxp stranded', err));
    }
    if (!active()) {
      publish(engine, now);
      return;
    }
    if (engine.streetTsid !== lastTsid) {
      lastTsid = engine.streetTsid;
    }
    // Autoplay presses the award screens (quest turn-ins) as they come.
    if (auto && now - (run?.data?.awardAt || 0) > 700) {
      if (run) run.data.awardAt = now;
      const next = document.querySelector('#award-screen [data-award-next]');
      if (next && !next.closest('[hidden]')) next.click();
    }
    if (run?.stage === 'clouds' && run.data.terraces) {
      const p = P();
      const x = cloudStepOffAny(run.data.terraces, p);
      if (x != null) {
        p.x = x;
        p.onGround = false;
      }
      lightLetters(Date.now());
      revealPhrases(Date.now(), p);
    }
    stepNpcs(dtMs);
    akStep(dtMs);
    // The practice street's hint signs follow their decos' fades and parallax every frame (G298).
    if (run?.data?.ak) syncSigns(engine);
    stepQuoins(engine);
    // Three jumps (countJumps): a take-off from the ground.
    const p = P();
    if (p && run?.data.watchJumps) {
      if (jumpWatch.onGround && !p.onGround && p.vy < -2) jumpWatch.count += 1;
      jumpWatch.onGround = Boolean(p.onGround);
    }
    if (ui && (!ui.bubble.hidden || !ui.say.hidden)) positionBubbles();
    else if (ui && (!ui.instr.hidden || !ui.pill.hidden)) positionBubbles();
    islandTick(engine, now);
    publish(engine, now);
  },

  onEvent(counter, amount, engine) {
    if (!active() || !run) return;
    const [cls, verb] = String(counter).split(':');
    // newbie_island.js eventFired verb_massage: the flying-butterflies hint is done.
    if (cls === 'npc_butterfly' && /massage/.test(String(verb)) && islandLive(engine) && !hasFlag('butterfly_msg_off_called')) {
      setFlag('butterfly_msg_off_called');
      fireStreetEvent(engine, 'butterfly_msg_off');
    }
    // A bag bought at the cheap vendor: the quest's progress, as the original client showed it (after the
    // vendor's own toast has had a moment).
    if (/^vendor_bought:bag_(generic|bigger)$/.test(String(counter)) && save.stage === 'island') {
      setTimeout(() => bagProgress(engine), 1500);
    }
    // skillquest_ak eventScriptEventFired: verb_<x>_success from the practice animals.
    if (run.data?.ak && verb) akVerb(engine, cls, verb);
    if (run.stage === 'training2') {
      if (TRAINING2_FOOD.some((f) => f.classTsid === cls) && verb && verb !== 'pickup') run.data.eaten = true;
      if (TRAINING2_DRINKS.some((d) => d.classTsid === cls) && verb && verb !== 'pickup') run.data.drank = true;
    }
  },

  physics(engine) {
    // Rooted only while the tutorial runs and the island is not yet left (G401: never on the exit street).
    if (rooted && active() && save.island !== 'exited' && (inTutorialScene(engine) || ui?.bubble?.hidden === false || ui?.card?.hidden === false)) {
      return { speed: 0.0001, jump: 0, gravity: 1, tripleJump: 0 };
    }
    if (!inTutorialScene(engine)) return null;
    const ph = tutorialPhysics(save.upgrades);
    // can_3_jump 0: no Triple Jump in the training levels.
    return { speed: ph.speed, jump: ph.jump, gravity: 1, tripleJump: 0 };
  },

  metabolicGate(stat, direction, engine) {
    // metabolics_lose_energy/mood: no loss in the intro and training1.
    if (direction === 'loss' && active() && ['clouds', 'training1'].includes(save.stage) && inTutorialScene(engine)) return { ok: false, msg: '' };
    return null;
  },

  /**
   * No quest offers while the tutorial runs: from the start card's choice
   * (pendingStage, before the first stage has begun) to leaving Gentle Island,
   * and never in its scenes. inc_quests.js quests_offer 622-624 held every
   * offer while !has_done_intro, on an is_newxp location or on newbie_island
   * before buy_two_bags, and quests_give_level_do 1035-1036 gave none during
   * newxp. The tutorial's own quests (buy_two_bags, leave_gentle_island) are
   * accepted by this feature directly, not offered.
   */
  holdQuestOffers(engine) {
    if (pendingStage || active()) return true;
    return isNewxpSceneTsid(engine?.streetTsid) ? true : null;
  },

  /**
   * G339: the street under the tutorial's scenes says nothing on arrival (no
   * "loaded" toast or new-afternoon line, no Qurazy roll) while the tutorial is
   * about to start or running, or a new save's start card is still up.
   */
  arrivalQuiet(engine) {
    if (pendingStage || inTutorialScene(engine)) return true;
    // A stage before the island (resumed after a reload, or between scenes): no arrival lines.
    if (active() && save.stage !== 'island') return true;
    return !engine?.started && startCardShown && !hadSave ? true : null;
  },

  /**
   * G231: true while the tutorial's own Magic Rock has your home street (the
   * house stage, runHouse; the wrap-up, homeWrapUp, until the street is left),
   * so homes-feature keeps its street rock away: one rock a street. In the
   * source both are the one magic_rock item (newxp_house_exterior.js createRock
   * 43-50, home.js 101-136; inc_homes.js homes_demo_frontyard 2469-2471).
   */
  homeRockHeld(engine) {
    if (!active() || engine?.streetTsid !== HOME_STREET_TSID) return null;
    if (run?.stage === 'house' || save.island === 'go_home') return true;
    return run?.npcs?.some((npc) => npc.kind === 'rock' && npc.sprite && !npc.sprite.destroyed) ? true : null;
  },

  travelGate(tsid, engine) {
    if (!active()) return null;
    if (inTutorialScene(engine)) return { ok: false, msg: 'Follow the tutorial (or skip it from the Tutorial card).' };
    if (save.stage === 'island' && save.island !== 'exited' && !GENTLE_ISLAND_TSIDS.includes(tsid)) return { ok: false, msg: 'You can\'t do that yet' };
    return null;
  },

  mapCards(engine) {
    if (!run?.data?.mapHint || !islandLive(engine) || typeof document === 'undefined') return [];
    return [el('div', { class: 'nx-map-card', 'data-newxp-map': 'progress-way' }, ISLAND_LINES.mapperyActivity)];
  },

  reloadLocation(saved, engine) {
    // A reload inside a training scene restarts that scene once the game starts.
    if (isNewxpSceneTsid(saved?.tsid)) return { tsid: DEFAULT_START, x: 0, y: 0 };
    return null;
  },

  verbsFor(target) {
    switch (target?.classId) {
      case 'newxp_item': return [{ id: 'pickup', label: 'Pick up', enabled: true, durationMs: 0 }];
      case 'newxp_egg_plant': return [{ id: 'harvest', label: 'Harvest', enabled: !run?.data.eggHarvested, reason: 'Nothing left to harvest', durationMs: 2000 }];
      case 'newxp_dustbunny': return [{ id: 'give_egg', label: 'Give Egg', enabled: true, durationMs: 0 }];
      case 'newxp_bag_vendor': return [{ id: 'buy', label: 'Buy', enabled: true, durationMs: 0 }];
      // homestreet_ticket_dispenser.js 43-143: "Pick <Style> Style" and its tooltip.
      case 'newxp_machine': return [{ id: 'choose', label: HOME_MACHINE.verb(target.nxStyle).name, tooltip: HOME_MACHINE.verb(target.nxStyle).tooltip, enabled: true, durationMs: 0 }];
      case 'newxp_rock':
      case 'newxp_flamingo': return [{ id: 'talk', label: 'Talk to', enabled: true, durationMs: 0 }];
      default: return [];
    }
  },

  runVerb(target, verbId, engine) {
    if (!run) return false;
    if (target?.classId === 'newxp_item' && verbId === 'pickup') {
      const p = engine.player;
      if (p && (Math.abs(p.x - target.sprite.x) > 220 || Math.abs(p.y - target.sprite.y) > 160)) {
        engine.toast('Get a little closer first.', 2000);
        return true;
      }
      pickUp(engine, run.pickups.find((r) => r.target === target));
      return true;
    }
    if (target?.classId === 'newxp_egg_plant' && verbId === 'harvest') {
      const p = engine.player;
      if (p && (Math.abs(p.x - target.sprite.x) > 170 || Math.abs(p.y - target.sprite.y) > 60)) {
        engine.toast('Jump up to the Egg Plant first.', 2500);
        return true;
      }
      if (!run.data.eggHarvested) engine.pushActivity(LINES.t2Harvest);
      harvestEgg(engine);
      return true;
    }
    if (target?.classId === 'newxp_dustbunny' && verbId === 'give_egg') {
      giveEgg(engine);
      return true;
    }
    if (target?.classId === 'newxp_machine' && verbId === 'choose') {
      if (countItem(engine.inv, 'homestreet_ticket') < 1) engine.toast(HOME_MACHINE.needTicket, 2500);
      else run.data.style = target.nxStyle;
      return true;
    }
    if (target?.classId === 'newxp_rock' && verbId === 'talk') {
      run.data.rockTalk = true;
      if (save.stage === 'island' && save.island === 'home_done') offerLeave(engine, token);
      else if (save.stage === 'island' && target.npc) say(target.npc, LINES.goodLuck, 2500);
      return true;
    }
    if (target?.classId === 'newxp_bag_vendor' && verbId === 'buy') {
      engine.openShop(bagShopProfile());
      return true;
    }
    if (target?.classId === 'newxp_flamingo' && verbId === 'talk') return true;
    return false;
  },

  verbOverride(target, engine) {
    // Progress Way's street spirit is the cheap bag vendor while the bag quest runs.
    if (!target?.classId?.startsWith?.('street_spirit') || engine.streetTsid !== GENTLE_ISLAND.progress_way) return null;
    if (!engine.questState?.active?.buy_two_bags) return null;
    return [{ id: 'newxp_buy_bags', label: 'Buy', enabled: true, durationMs: 0, tooltip: 'The cheap bag vendor' }];
  },

  runVerbOverride(target, verbId, engine) {
    if (verbId !== 'newxp_buy_bags') return null;
    engine.openShop(bagShopProfile());
    return true;
  },

  save() {
    return save;
  },

  restore(slice) {
    hadSave = true;
    save = normalizeNewxpSave(slice);
  },
};

/** Test hooks (pure state only). */
export const __newxpTest = {
  get save() { return save; },
  set save(v) { save = normalizeNewxpSave(v); },
  bagShopProfile,
  // G401: the exit pick and the stranded rescue, with a stub engine and fetch.
  leaveIsland,
  rescueStranded,
  get rooted() { return rooted; },
  set rooted(v) { rooted = Boolean(v); },
  resetExits() { exitGraph = null; strandChecked = ''; strandRetryAt = 0; },
};
