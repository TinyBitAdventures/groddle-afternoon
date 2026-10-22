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
 *                with its Greeter Twig relic.
 *
 * Opt-in: a brand-new save's start card offers "Start with the tutorial" or
 * "Skip to Ur"; existing saves and autostart routes are never redirected.
 * QA: ?autostart=1&fresh=1&resetgame=1&questoffer=off&newxp=1 (or
 * =training1|training2|house|skill|island) forces it; &newxpautoplay=1 runs
 * it end to end (&newxphold=<stage> stops on reaching that stage,
 * &newxpskill=animalkinship_1|ezcooking_1|light_green_thumb_1,
 * &newxpstyle=meadow|firebog|uralia). Canvas data: newxpStatus, newxpStage,
 * newxpStep, newxpUpgrades, newxpIsland, newxpAutoplay, newxpLast.
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
  ISLAND_CURRANTS,
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
  talkPages,
  training1Layout,
  training2Layout,
  tutorialPhysics,
  vogPages,
} from '../newxp.js';
import { addItem, countItem, ensureItem, removeItem } from '../inventory.js?v=catalog-unified-3';
import { QUOIN_SHEET, QUOIN_TYPES } from '../quoins.js';
import { IMAGINATION_UPGRADES } from '../imagination.js';
import { assignQuest, completeQuest } from '../quests.js';
import { acceptOffer, enqueueQuestOffer, questAwardPayload, turnInQuest } from '../quest-offers.js';
import { getQuestCatalog } from '../content-catalogs.js';
import { locationEventsApi } from './location-events-feature.js?v=location-events-1';
import * as kit from '../quest-rooms/kit.js?v=qi-1';

export const NEWXP_FEATURE_ID = 'newxp';
const ART = 'assets/sprites/newxp/';
const CARD_ART = 'assets/imagination/cards/';
const HOME_STREET_TSID = 'RH_HOME_EXT';
const DEFAULT_START = 'GLI2V0UN7RD1T2J'; // Hechey Track (index default)

ensureItem('homestreet_ticket', { label: 'Home Street Ticket', desc: 'Good for one home street, in the style of your choosing.', baseCost: 0, sellable: false, donatable: false });
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
body.nx-hide-actions .top-actions>:not(#mute-btn),body.nx-hide-actions .quest-tracker{visibility:hidden}
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
    if (typeof confirm === 'function' && !auto && !confirm('Skip the rest of the tutorial and head into Ur?')) return;
    skipTutorial(engineRef);
  });
  // Enter advances conversations (the source's button_instructions overlay);
  // capture it before the game opens a verb menu.
  window.addEventListener('keydown', (e) => {
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
  ui.instr.style.top = `${r.top + Math.min(r.height - 60, 408 * (r.width / 960) - 44)}px`;
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
function say(who, text, ms = 3000) {
  ensureUi();
  ui.sayFor = who;
  ui.say.innerHTML = text;
  ui.say.hidden = false;
  ui.sayUntil = Date.now() + ms;
  positionBubbles();
  engineRef?.pushActivity(`${who?.name || 'Someone'}: ${plain(text)}`);
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
  const u = imgOf(buy);
  const cost = NEWXP_UPGRADES[buy]?.cost ?? u.cost ?? 0;
  ui.card.innerHTML = `<div class="nx-got"><h3>Got it! ${u.name || buy}</h3><p>${u.desc || ''}</p><button type="button" data-nx-got>OK</button></div>`;
  engineRef.playSound('IMAGINATION_PURCHASE', { volume: 0.5 });
  // Spend the iMG the quoins gave; the walk/jump physics apply in the training levels.
  const pc = engineRef.pc;
  pc.imagination = Math.max(0, (Number(pc.imagination) || 0) - cost);
  if (!save.upgrades.includes(buy)) save.upgrades.push(buy);
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
}

function showPill(on) {
  ensureUi();
  ui.pill.hidden = !on;
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
    modes: { idle: ['rock_read', 9, 2, 18], talk: ['rock_talk', 13, 7, 91], appear: ['rock_appear', 10, 2, 20] },
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
      else sheet.base.once('loaded', () => setTimeout(apply, 0));
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
    const base = PIXI.BaseTexture.from(QUOIN_SHEET.url);
    quoinFrames = {};
    for (const def of Object.values(QUOIN_TYPES)) {
      quoinFrames[def.id] = new PIXI.Texture(base, new PIXI.Rectangle(0, def.row * QUOIN_SHEET.frameHeight, QUOIN_SHEET.frameWidth, QUOIN_SHEET.frameHeight));
    }
  }
  return quoinFrames[type] || quoinFrames.xp;
}

/** An iMG quoin with a location_event_id; `onTake` runs once when touched. */
function addQuoin(engine, id, x, y, onTake) {
  const spr = new engine.PIXI.Sprite(quoinTexture(engine.PIXI, 'xp'));
  spr.anchor.set(0.5, 0.5);
  spr.scale.set(0.6);
  spr.x = x;
  spr.y = y;
  spr.zIndex = 30;
  engine.entityLayer.addChild(spr);
  const q = { id, x, y, spr, taken: false, onTake };
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
    if (Math.abs(q.x - p.x) < 34 && q.y > p.y - 78 && q.y < p.y + 12) takeQuoin(engine, q);
  }
}

function takeQuoin(engine, q) {
  if (q.taken) return;
  q.taken = true;
  q.spr.visible = false;
  const n = QUOIN_BENEFITS[q.id] || 1;
  const pc = engine.pc;
  pc.xp = (Number(pc.xp) || 0) + n;
  pc.imagination = (Number(pc.imagination) || 0) + n;
  engine.floatText(q.x, q.y - 14, `+${n} iMG`, '#ffffff');
  engine.playSound('QUOIN_XP', { volume: 0.5 });
  engine.updateHud();
  engine.setData('newxpLast', `quoin:${q.id}`);
  q.onTake?.(q);
}

/** A world item stack (createItemStack) the player picks up with Enter/click. */
function addPickup(engine, id, classTsid, count, x, y, onPick) {
  const { PIXI } = engine;
  const box = new PIXI.Container();
  const spr = PIXI.Sprite.from(`assets/sprites/icons/${classTsid}.png`);
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

function drawPlatforms(PIXI, root, platforms) {
  const g = new PIXI.Graphics();
  for (const p of platforms) {
    if (p.style === 'invisible' || p.style === 'stars' || p.style === 'cloud' || p.tree) continue;
    if (p.style === 'mushroom') {
      g.ellipse((p.x1 + p.x2) / 2, p.y1 + 6, (p.x2 - p.x1) / 2 + 6, 14).fill(0xe8d6a8);
      g.ellipse((p.x1 + p.x2) / 2, p.y1 + 12, (p.x2 - p.x1) / 2, 8).fill(0xd8bf86);
      g.rect((p.x1 + p.x2) / 2 - 10, p.y1 + 14, 20, 60).fill(0xf3ead2);
      continue;
    }
    const w = p.x2 - p.x1;
    const cx = (p.x1 + p.x2) / 2;
    const top = { grass: 0x8cbf3f, pool: 0x4a8fe0, red: 0xc0564e }[p.style] || 0x8cbf3f;
    g.moveTo(p.x1, p.y1 + 4);
    g.quadraticCurveTo(cx, p.y1 + 70, p.x2, p.y1 + 4);
    g.closePath();
    g.fill(0x5b4636);
    g.ellipse(cx, p.y1 + 4, w / 2, 11).fill(top);
    g.ellipse(cx - w * 0.12, p.y1 + 1, w * 0.3, 4).fill({ color: 0xffffff, alpha: 0.12 });
  }
  root.addChild(g);
  return g;
}

/** Black void with a field of gold stars on the floor (the training levels). */
function starVoid(PIXI, root, width, height, floorY) {
  const bg = new PIXI.Graphics();
  bg.rect(-700, -500, width + 1400, height + 1000).fill(0x000000);
  root.addChild(bg);
  const glow = new PIXI.Graphics();
  for (let i = 0; i < 6; i++) {
    glow.ellipse(width / 2, floorY + 30, width / 2 + 300 - i * 40, 60 - i * 6).fill({ color: 0x2c2a10, alpha: 0.08 });
  }
  root.addChild(glow);
  for (let x = -200, i = 0; x < width + 200; x += 46, i += 1) {
    for (let row = 0; row < 3; row += 1) {
      const h = kit.hash01(`nxstar:${i}:${row}`);
      const s = kit.deco(PIXI, 'star_asset_01', x + h * 40, floorY + 6 + row * 22 + h * 10, { ay: 0.5, tint: 0xf0d27a, alpha: 0.75 + h * 0.25 });
      const size = 14 + h * 16 + row * 4;
      const fit = () => { s.width = size; s.height = size; };
      if (s.texture.valid) fit();
      else s.texture.baseTexture.once('loaded', fit);
      root.addChild(s);
    }
  }
}

function enterNewxpScene(engine, stage, layout, background, label) {
  engine.enterScene({
    tsid: SCENE_TSIDS[stage],
    label,
    hubName: 'Somewhere else entirely',
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

function buildClouds(engine) {
  const { PIXI } = engine;
  const L = cloudsLayout();
  const root = kit.sceneRoot(PIXI, L.width, L.height);
  const sky = root.layer(0, 0);
  sky.addChild(kit.gradient(PIXI, [[0, '#7ec4f2'], [0.6, '#cfeaf7'], [1, '#fdf3cf']], 960, 640));
  const far = root.layer(0.35, 1);
  for (let x = -200, i = 0; x < L.width; x += 330, i++) {
    far.addChild(kit.deco(PIXI, i % 2 ? 'cloud_fluffy_1' : 'cloud_fluffy_2', x, 260 + (i % 3) * 40, { scale: 0.6, alpha: 0.65 }));
  }
  const world = root.layer(1, 2);
  const beats = L.beats.map((b) => {
    const text = kit.label(PIXI, b.text, b.x, b.y, { size: b.text.length < 12 ? 64 : 34, fill: 0xffffff, wrap: 560, stroke: 0x6fa7c9, strokeThickness: 2 });
    text.alpha = 0;
    world.addChild(text);
    return text;
  });
  for (let x = -260, i = 0; x < 3420; x += 200, i++) {
    world.addChild(kit.deco(PIXI, i % 2 ? 'cloud_fluffy_1' : 'cloud_fluffy_2', x, L.cloudY + 110 + (i % 2) * 14, { scale: 0.95 }));
  }
  const fill = new PIXI.Graphics();
  fill.rect(-300, L.cloudY + 90, 3640, 600).fill(0xf7fbff);
  world.addChildAt(fill, 0);
  enterNewxpScene(engine, 'clouds', L, root, 'Somewhere above');
  run.views = { beats, root };
  return L;
}

async function runClouds(t) {
  const engine = engineRef;
  hud({ meta: true, energy: true, mood: true, pack: true, actions: true });
  const L = buildClouds(engine);
  fadeIn();
  await until(t, () => P()?.onGround);
  setStep('move');
  instruction(LINES.moveInstructions);
  const startX = P().x;
  // checkMovement: dismissed once the avatar is 50 px right of where it landed.
  await until(t, () => P().x - startX > 50, { help: () => place(startX + 80, P().y) });
  clearInstruction();
  setStep('walk');
  await until(t, () => P().x > L.dropX && P().y > L.dropY, { help: () => place(L.dropX + 60, L.dropY + 60) });
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
  // The mushroom stack (shroom_fade) under the three caps.
  const shrooms = new PIXI.Container();
  shrooms.alpha = 0;
  for (const cap of L.platforms.filter((q) => q.style === 'mushroom')) {
    const h = L.floorY - cap.y1 + 26;
    shrooms.addChild(kit.deco(PIXI, 'mushroom_funnel_1', (cap.x1 + cap.x2) / 2, L.floorY + 8, { scale: h / 184 }));
  }
  root.addChild(shrooms);
  drawPlatforms(PIXI, root, L.platforms);
  // The sloth's tree: its branches become platforms once it hides (hideTree).
  // A clean vector tree on isle_b (the archive has no newxp tree art).
  const tree = new PIXI.Graphics();
  tree.poly([2282, 1352, 2318, 1352, 2310, 1180, 2296, 1060, 2290, 1180]).fill(0x6e4a2b);
  tree.moveTo(2300, 1200).lineTo(2180, 1110);
  tree.moveTo(2302, 1160).lineTo(2420, 1080);
  tree.stroke({ width: 10, color: 0x6e4a2b, alpha: 1 });
  for (const [x, y, r] of [[2296, 1040, 70], [2200, 1090, 50], [2400, 1060, 56], [2250, 1000, 46], [2350, 990, 50]]) {
    tree.circle(x, y, r).fill({ color: 0x3f7f3a, alpha: 0.95 });
    tree.circle(x - r * 0.25, y - r * 0.25, r * 0.55).fill({ color: 0x5aa04a, alpha: 0.6 });
  }
  root.addChild(tree);
  const branches = new PIXI.Graphics();
  for (const p of L.platforms.filter((q) => q.tree)) kit.drawPlatform(branches, { ...p, style: 'branch' });
  branches.alpha = 0;
  root.addChild(branches);
  const ladder = new PIXI.Graphics();
  for (const l of L.ladders) kit.drawLadder(ladder, l, { rail: 0xc8b85a, rung: 0xe4d67a });
  root.addChild(ladder);
  // wall1: a dim glass wall until Walk Speed I.
  const wall = new PIXI.Graphics();
  wall.roundRect(1740, L.floorY - 400, 20, 400, 8).fill({ color: 0x8fb8ff, alpha: 0.12 });
  root.addChild(wall);
  // The tube (the teleport to training2) on the top island.
  const tube = new PIXI.Graphics();
  tube.roundRect(L.tube.x - 70, L.tube.y - 330, 140, 60, 12).fill(0x9aa3ad);
  tube.rect(L.tube.x - 50, L.tube.y - 270, 100, 270).fill({ color: 0xcfe9ff, alpha: 0.28 });
  tube.ellipse(L.tube.x, L.tube.y, 70, 12).fill(0x9aa3ad);
  root.addChild(tube);
  enterNewxpScene(engine, 'training1', L, root, 'Training: Movement');
  run.views = { shrooms, tree, branches, wall };
  return L;
}

async function runTraining1(t) {
  const engine = engineRef;
  hud({ meta: true, energy: true, mood: true, pack: true, actions: true });
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
  addQuoin(engine, 'img_pickup_walk', coinX, L.walkCoin.y, () => { got = true; });
  engine.playSound('TELEPORTER_VISIBLE_APPEAR', { volume: 0.4 });
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
  const sloth = engine.PIXI.Sprite.from(`${ART}sloth.png`);
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
  const hideTree = () => {
    if (treeGone) return;
    treeGone = true;
    sloth.visible = false;
    engine.playSound('SLOTH_ARRIVES', { volume: 0.3 });
    if (run?.views) {
      run.views.tree.alpha = 0.25;
      run.views.branches.alpha = 1;
    }
    addPlatforms(engine, L.platforms.filter((p) => p.tree));
    engine.setData('newxpLast', 'treeplats_on');
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
    if (treeGone && inBox(L.boxes.upDownForLadders, p.x, p.y) && !run.data.climb) {
      run.data.climb = true;
      instruction(LINES.climbInstructions);
    }
    return ladderCoin;
  }, {
    help: async () => {
      place(2300, 1350);
      slothShownAt = Date.now() - 8000;
      hideTree();
      await new Promise((r) => setTimeout(r, 150));
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
  // door_show1-3: the flamingo poofs; walk into the tube.
  await sleep(t, 1000);
  engine.playSound('TELEPORTER_VISIBLE_DISAPPEARS', { volume: 0.4 });
  fl.sprite.visible = false;
  if (fl.target) engine.unregister(fl.target);
  await sleep(t, 1000);
  rooted = false;
  setStep('tube');
  await until(t, () => inBox(L.tube.box, P().x, P().y), { help: () => place(L.tube.x, L.tube.y) });
  // 'tp' hitbox: playHitAnimation('hit1', 5 s), teleport to training2.
  engine.playHit('hit1', 1200);
  engine.playSound('TELEPORT_AWAY', { volume: 0.5 });
  await sleep(t, 1200);
  return 'training2';
}

/* ------------------------------------------------------------------ */
/* Stage: training2 (the Dustbunny)                                      */
/* ------------------------------------------------------------------ */

function buildTraining2(engine) {
  const { PIXI } = engine;
  const L = training2Layout();
  const root = new PIXI.Container();
  root.worldH = L.height;
  starVoid(PIXI, root, L.width, L.height, L.floorY);
  drawPlatforms(PIXI, root, L.platforms);
  const g = new PIXI.Graphics();
  // Table one (white cloth) and the wooden drinks bench.
  g.ellipse(L.tables.food.x, L.floorY - 76, 120, 18).fill(0xf4f4f4);
  g.rect(L.tables.food.x - 120, L.floorY - 76, 240, 70).fill(0xe6e6e6);
  g.roundRect(L.tables.drinks.x - 130, L.floorY - 70, 260, 66, 8).fill(0x9a5a2b);
  g.roundRect(L.tables.drinks.x - 130, L.floorY - 74, 260, 10, 4).fill(0xb87240);
  root.addChild(g);
  const walls = {};
  for (const b of L.barriers.filter((w) => w.id !== 'left')) {
    const w = new PIXI.Graphics();
    w.roundRect(b.x - (b.id === 'tube_building' ? 40 : 10), b.y, b.id === 'tube_building' ? 80 : 20, b.h, 10);
    w.fill({ color: b.id === 'tube_building' ? 0x3d4450 : 0x8fb8ff, alpha: b.id === 'tube_building' ? 0.95 : 0.14 });
    root.addChild(w);
    walls[b.id] = w;
  }
  // Egg Plant (trant_egg) on its ledge.
  const egg = PIXI.Sprite.from('assets/sprites/trants/frames/trant_egg_m10.png');
  egg.anchor.set(0.5, 1);
  egg.x = L.eggPlant.x;
  egg.y = L.eggPlant.y + 8;
  egg.scale.set(0.8);
  // The Home Street Selection Machine behind the tube wall.
  const machine = new PIXI.Container();
  const body = new PIXI.Graphics();
  body.roundRect(3620, L.floorY - 470, 440, 90, 30).fill(0x7d858f);
  for (let i = 0; i < 12; i++) body.circle(3660 + i * 34, L.floorY - 425, 8);
  body.fill(0x5d6570);
  machine.addChild(body);
  const panelColors = { meadow: 0x6fb45a, firebog: 0xb5543c, uralia: 0x7a5fb0 };
  for (const c of L.machine.choices) {
    const p = new PIXI.Graphics();
    p.roundRect(c.x - 58, L.floorY - 190, 116, 150, 10).fill(panelColors[c.style]);
    p.roundRect(c.x - 52, L.floorY - 182, 104, 64, 8).fill({ color: 0x1d2a44, alpha: 0.85 });
    machine.addChild(p);
    machine.addChild(kit.label(PIXI, c.label.replace('CHOOSE ', 'CHOOSE\n'), c.x, L.floorY - 150, { size: 11, fill: 0xffffff }));
  }
  root.addChild(machine);
  machine.addChild(kit.label(PIXI, LINES.machine, 3840, L.floorY - 360, { size: 15, fill: 0xd7dde5 }));
  enterNewxpScene(engine, 'training2', L, root, 'Training: Stuff');
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
  hud({ meta: true, energy: true, mood: true, pack: true, actions: true });
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
  await overlay(t, { title: LINES.firstInventory, button: 'OK' });
  hud({ meta: true, energy: true, mood: true, pack: false, actions: true });
  // food_wait_eat: the slot callout and the nagging.
  setStep('food_wait_eat');
  run.data.eaten = false;
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
  hud({ meta: true, energy: false, mood: true, pack: false, actions: true });
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
  hud({ meta: true, energy: false, mood: false, pack: false, actions: true });
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
    return registerFixture(engine, spr, 'newxp_machine', c.label.replace('CHOOSE ', 'Choose ').replace(' STYLE', ' style'), { nxStyle: c.style });
  });
  run.data.panels = panels;
  run.data.style = '';
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
  for (const ev of ['wall_off', 'sign1', 'sign2', 'sign3', 'sign4', 'lotion', 'wateringcan_on', 'bottom1', 'bottom2', 'bottom3']) fireSafe(ev);
  // The practice tool waiting on the street (createItemStack in reset()).
  const tool = skill.id === 'animalkinship_1'
    ? { id: 'butterfly_lotion', classTsid: 'butterfly_lotion', x: 1823, y: 810, off: 'lotion_off' }
    : { id: 'watering_can', classTsid: 'watering_can', x: 650, y: 900, off: 'wateringcan_off' };
  const groundAt = (x, y) => groundBelow(engine, x, y);
  addPickup(engine, tool.id, tool.classTsid, 1, tool.x, groundAt(tool.x, tool.y), () => fireSafe(tool.off));
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
  await until(t, () => inBox(finish, P().x, P().y), { help: () => place(finish.x, finish.y - 20) });
  return 'island';
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
    // revealCurrants: the counter appears, then +978.
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
    if (auto) autoBags(engine, t);
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
    declineLabel: 'Not right now',
    onAccept: () => {
      acceptOffer(engine.questState, 'leave_gentle_island', questCtx(engine));
      save.island = 'leaving';
      engine.save();
      engine.setData('newxpIsland', save.island);
      engine.toast('Find the way off Gentle Island: Progress Way, then Gentle Island Exit.', 4000);
      if (auto) autoLeave(engine, t);
    },
    onDecline: () => { run.data.leaveDeclined = Date.now(); },
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

/** player.js teleportHome: choose_one(config.newxp_exits). */
async function leaveIsland(engine) {
  if (!islandExitOpen(save.island)) return;
  const exit = pickNewxpExit(Math.random, (tsid) => engine.streetExists(tsid));
  if (!exit) return;
  save.island = 'exited';
  save.exit = { tsid: exit.tsid, x: exit.x };
  engine.save();
  engine.setData('newxpExit', exit.tsid);
  await fadeOut();
  await engine.enter(exit.tsid, { quiet: true, bypassFeatureGates: true });
  // player.js teleportHome: the source x, dropped in from above.
  const b = engine.street?.bounds;
  if (b && engine.streetTsid === exit.tsid) place(Math.max(60, Math.min(b.r - b.l - 60, exit.x - b.l)), 40);
  fadeIn();
  islandEnter(engine);
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
  // newbie_island.js street4_check: Progress Way is held until On to the
  // Big Time is accepted (no bags: back 250; bags but not home yet: back 150).
  const gate = ISLAND_BOXES.street4_check;
  const block = tsid === gate.tsid && inHitBox(gate, p.x, p.y) ? street4Check(save.island, questDone(engine, 'buy_two_bags')) : null;
  // One message per bump: walking straight back in re-pushes without stacking VoGs.
  const speak = block && now - (run.data.gateAt || 0) > 4000;
  if (speak) run.data.gateAt = now;
  if (block === 'noBags') {
    place(p.x - 250, p.y);
    if (speak) vog(token, LINES.noBagsYet).catch(() => {});
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
  if (save.island === 'bags_done' && !islandBusy && !run.data.afterBags) {
    run.data.afterBags = true;
    afterBags(engine, token);
  }
  // home.js playerEnterCallback (is_postnewxp): the rock's wrap-up at home.
  if (save.island === 'go_home' && tsid === HOME_STREET_TSID && !islandBusy && !run.data.homeTalk) {
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
  hud({});
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
  if (stage !== 'clouds' && !save.name) save.name = 'Tester';
  // A forced later stage still has the home street the house stage imagines.
  if (STAGES.indexOf(stage) > STAGES.indexOf('house') && !engine.homeOwned?.()) {
    engine.grantHome?.(save.homeStyle || engine.param('newxpstyle') || 'meadow');
  }
  if (STAGES.indexOf(stage) >= STAGES.indexOf('training2')) {
    for (const id of ['walk_speed_1', 'jump_1']) if (!save.upgrades.includes(id)) save.upgrades.push(id);
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
  const box = el('div', { class: 'nx-start', id: 'newxp-start' }, `
    <p><strong>New to Ur?</strong> Fall out of the clouds and meet the Welcoming Flamingo,
      the Dustbunny and your Magic Rock, then find your way off Gentle Island.</p>
    <div class="nx-start-row">
      <button type="button" data-nx-start>Start with the tutorial</button>
      <button type="button" class="alt" data-nx-skipstart>Skip to Ur</button>
    </div>`);
  startBtn.hidden = true;
  startBtn.parentNode.insertBefore(box, startBtn);
  box.querySelector('[data-nx-start]').addEventListener('click', () => {
    pendingStage = 'clouds';
    startBtn.click();
  });
  box.querySelector('[data-nx-skipstart]').addEventListener('click', () => {
    save.status = 'skipped';
    startBtn.click();
  });
  engine.setData('newxpStartCard', 'shown');
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
    }
  },

  onStreetEnter(street, engine) {
    if (!engine.started && !hadSave && !engine.param('autostart') && !engine.param('newxp')) showStartCard(engine);
    if (active() && save.stage === 'island' && run && !isNewxpSceneTsid(street?.tsid)) islandEnter(engine);
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
    }
    if (ui) {
      ui.bubbleFor = null;
      ui.say.hidden = true;
    }
  },

  ecologyOverride(street) {
    // skillquest_ak_v2.js spawns a chicken, a piggy and a butterfly to practise on.
    if (street?.tsid === 'GHFRK14DDU53RQQ') {
      return { label: 'A L\'il Animal Kinship', sourceTsid: 'LHFRK14DDU53RQQ', counts: { npc_chicken: 1, npc_piggy: 1, npc_butterfly: 1 } };
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
    stepNpcs(dtMs);
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
    if (run.stage === 'training2') {
      if (TRAINING2_FOOD.some((f) => f.classTsid === cls) && verb && verb !== 'pickup') run.data.eaten = true;
      if (TRAINING2_DRINKS.some((d) => d.classTsid === cls) && verb && verb !== 'pickup') run.data.drank = true;
    }
  },

  physics(engine) {
    if (rooted && active() && (inTutorialScene(engine) || ui?.bubble?.hidden === false || ui?.card?.hidden === false)) {
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

  holdQuestOffers() {
    return active() ? true : null;
  },

  travelGate(tsid, engine) {
    if (!active()) return null;
    if (inTutorialScene(engine)) return { ok: false, msg: 'Follow the tutorial (or skip it from the Tutorial card).' };
    if (save.stage === 'island' && save.island !== 'exited' && !GENTLE_ISLAND_TSIDS.includes(tsid)) return { ok: false, msg: 'You can\'t do that yet' };
    return null;
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
      case 'newxp_machine': return [{ id: 'choose', label: 'Choose this style', enabled: true, durationMs: 0 }];
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
      if (countItem(engine.inv, 'homestreet_ticket') < 1) engine.toast('You need your Home Street Ticket.', 2500);
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
};
