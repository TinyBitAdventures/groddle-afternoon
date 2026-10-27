/**
 * What one player does to another, between real players in multiplayer
 * (Track M, lane VERBS). Rules and copy: js/player-verbs-mp.js; the
 * server that confirms each act: groddle-afternoon-server verbs.go.
 *
 * Multiplayer only (engine.mode and engine.query('realtimeClient')). In solo
 * nothing here runs and no hook answers: the bear's companions, the Plank,
 * the Watering Can, the musicblocks and the Charades Potion stay as before.
 *
 * - Another player's Glitch: the player menu gains the pack's emotes
 *   (main.js:3547-3580): Splank with a Plank, Hug and High five with an
 *   Emotional Bear, Kiss and Moon with its Lips and Moon upgrades. Off in a
 *   race with the source's reasons.
 * - The pack: Soak (Watering Can) and Play for (any musicblock) ask whom,
 *   from the players on the street.
 * - Each act goes to the server (verb_do). Only its verb_done charges the
 *   doer (energy and mood as the source) and counts: Hanky Splanky
 *   (players_splanked), Super Soaker (players_soaked, once per player while
 *   the quest runs), Blocks That Rock (a block's flag, each player once),
 *   Rising Moon and Spread the Garlic Love (once per player), Tickle Me Emo's
 *   hugs, Tottly's Toys. The target's game applies its side once per act id
 *   from the server's verb_got: mood, energy, iMG, the bear's animation, the
 *   sound, the line.
 * - Charades: potions-feature asks charadesCheck (somebody else here?) and
 *   charadesQuaff (the secret word box); the server keeps the word, watches
 *   the street's chat and says who won (charades_won pays the guesser 50 iMG
 *   and 250 currants, which the server also credits in the site's ledger).
 * - Epic Blowout: whether one of the four party buffs is on goes to the
 *   server (verbs_influence); its party_blowout counts attended_party:blowout.
 * - Quests (js/quests-mp.js): playerVerbsReady says the verbs are live;
 *   playerVerbsSoakReady says a Watering Can and another player are here.
 *
 * QA: canvas data verbsLast (the last thing done or got), verbsCharades
 * (none | playing:<word> | other:<name>), verbsInfluence (0|1);
 * window.groddlePlayerVerbs in multiplayer.
 */

import { countItem, removeItem } from '../inventory.js?v=catalog-unified-7';
import { gainMetabolic, loseEnergy, loseMood } from '../metabolics.js';
import { grantMoodXp } from '../mood-xp.js';
import { ensureQuestOfferState } from '../quest-offers.js';
import { getMusicblock, isMusicblock } from '../musicblocks.js';
import { GAME_DAY_MS } from '../game-day.js';
import { playSheetOverlay } from '../overlay-art.js?v=g311-1';
import {
  CHARADES_BUFF,
  CHARADES_POTION,
  CHARADES_TEXT,
  FEAT_ID,
  FEAT_VERBS,
  GARLIC_BREATH,
  MENU_PREFIX,
  PLAYER_VERBS,
  VERB_TEXT,
  WATERING_CAN,
  doerCounters,
  doerSide,
  emoteMenu,
  energyRefusal,
  hearMusicblock,
  isVerbRaceStreet,
  normalizeVerbsSlice,
  targetSide,
  underTheInfluence,
} from '../player-verbs-mp.js?v=verbs-1';

export const PLAYER_VERBS_FEATURE_ID = 'player-verbs-mp';
const PACK_SOAK = 'pverb_soak';
const PACK_PLAY_FOR = 'pverb_play_for';
const INFLUENCE_EVERY_MS = 1000;

const STYLE = `
.pverb-fx { position: fixed; left: 50%; top: 42%; z-index: 70; transform: translate(-50%, -50%); pointer-events: none; display: grid; justify-items: center; gap: 0.4rem; }
.pverb-fx[hidden] { display: none; }
.pverb-fx img { width: min(46vw, 260px); height: auto; filter: drop-shadow(0 6px 14px rgba(0, 0, 0, 0.35)); }
.pverb-fx.is-splank img { width: min(60vw, 360px); animation: pverb-splank 0.5s ease-in-out 0s 6 alternate; transform-origin: 80% 90%; }
.pverb-fx p { margin: 0; padding: 0.35rem 0.8rem; border-radius: 999px; background: rgba(32, 28, 20, 0.82); color: #fff; font: 600 15px/1.3 system-ui, sans-serif; }
@keyframes pverb-splank { from { transform: rotate(-28deg); } to { transform: rotate(12deg); } }
.pverb-pick-list { display: grid; gap: 0.35rem; padding: 0.2rem 0.85rem 0.85rem; }
.pverb-pick-list button { font: inherit; text-align: left; border: 1px solid #e4d9c4; border-radius: 8px; padding: 0.4rem 0.7rem; background: #fff; cursor: pointer; }
.pverb-pick-list button:hover, .pverb-pick-list button:focus-visible { background: #f2ecdc; }
.pverb-pick-list .pverb-none { opacity: 0.75; font-style: italic; }
`;

let multiplayer = false;
let session = null;
let slice = normalizeVerbsSlice(null);
let guard = false;

function isMp(engine) {
  return engine?.mode === 'multiplayer' && Boolean(engine.query?.('realtimeClient'));
}

function el(tag, attrs = {}, text = '') {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text) node.textContent = text;
  return node;
}

function cleanName(v) {
  return String(v || '').replace(/[<>]/g, '').slice(0, 40) || 'A Glitch';
}

function createSession(engine, client) {
  if (typeof document !== 'undefined' && !document.getElementById('pverb-style')) {
    const style = el('style', { id: 'pverb-style' });
    style.textContent = STYLE;
    document.head.appendChild(style);
  }
  const pending = new Map(); // ref -> { verb, to, name, block, garlic, at }
  const seen = new Set(); // verb_got ids applied
  const others = new Map(); // drinker id -> { name, ends } (charades on this street)
  let mine = null; // { word, ends } my charades game
  let asking = false; // the secret word box is open
  let nextRef = 1;
  let last = '';
  let influence = null; // what the server was last told
  let nextInfluence = 0;
  let fxTimer = 0;
  let modal = null;

  const me = () => Number(client.me?.id) || 0;
  const pc = () => engine.pc;
  const street = () => engine.streetTsid || '';
  const here = () => (client.players || []).filter((p) => Number(p.id) && Number(p.id) !== me());

  function publish() {
    engine.setData?.('verbsLast', last);
    const other = [...others.values()][0];
    engine.setData?.('verbsCharades', mine ? `playing:${mine.word}` : other ? `other:${other.name}` : 'none');
    engine.setData?.('verbsInfluence', influence ? '1' : '0');
  }

  function note(text) {
    last = text;
    publish();
  }

  function say(text, ms = 3200) {
    if (!text) return;
    engine.pushActivity?.(text);
    engine.toast?.(text, ms);
  }

  // —— The target's overlay (vp_overlay: the bear's state, or the Plank's emote_animation) ——

  function showFx(overlay, caption) {
    if (typeof document === 'undefined' || !overlay) return;
    let fx = document.getElementById('pverb-fx');
    if (!fx) {
      fx = el('div', { id: 'pverb-fx', class: 'pverb-fx', 'aria-live': 'polite' });
      fx.append(el('img', { alt: '' }), el('p'));
      document.body.appendChild(fx);
    }
    const img = fx.querySelector('img');
    const splank = overlay.anim === 'splank';
    fx.classList.toggle('is-splank', splank);
    img.src = '';
    const src = splank ? 'assets/sprites/icons/plank@3x.png' : `assets/sprites/emotional-bear/${overlay.anim}.webp?play=${Date.now()}`;
    requestAnimationFrame(() => { img.src = src; });
    fx.querySelector('p').textContent = caption;
    fx.hidden = false;
    clearTimeout(fxTimer);
    fxTimer = setTimeout(() => { fx.hidden = true; img.src = ''; }, Math.max(1000, overlay.ms));
  }

  function rainbow() {
    const p = engine.player;
    if (!p || !engine.PIXI) return;
    // show_rainbow (players/player.js 3014-3029): 400 x 400 at the avatar, 4 s.
    playSheetOverlay(engine.PIXI, 'rainbow_youdidit', { layer: engine.entityLayer, at: () => ({ x: p.x, y: p.y }), wh: 400, durationMs: 4000, loop: false });
  }

  // —— Pickers ——

  function closeModal() {
    modal?.remove();
    modal = null;
  }

  function card(title) {
    closeModal();
    if (typeof document === 'undefined') return null;
    const host = document.getElementById('verb-menu')?.parentElement || document.body;
    const wrap = el('div', { class: 'verb-menu pverb-modal', id: 'pverb-modal', role: 'dialog', 'aria-modal': 'true' });
    wrap.innerHTML = `<div class="verb-menu-card"><div class="verb-menu-head"><div class="verb-menu-title"></div><button type="button" class="verb-menu-x" aria-label="Close">×</button></div><div class="pverb-body"></div></div>`;
    wrap.querySelector('.verb-menu-title').textContent = title;
    wrap.querySelector('.verb-menu-x').addEventListener('click', closeModal);
    wrap.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') closeModal();
    });
    host.appendChild(wrap);
    modal = wrap;
    return wrap.querySelector('.pverb-body');
  }

  /** requires_target_pc: whom, from the players on this street. */
  function pickPlayer(verbId, extra = {}) {
    const v = PLAYER_VERBS[verbId];
    const body = card(VERB_TEXT.pickTitle(v.label));
    if (!body) return false;
    const list = el('div', { class: 'pverb-pick-list' });
    const players = here();
    if (!players.length) list.append(el('p', { class: 'pverb-none' }, VERB_TEXT.nobody));
    for (const p of players) {
      const b = el('button', { type: 'button', 'data-pverb-to': String(p.id) }, cleanName(p.name));
      b.addEventListener('click', () => {
        closeModal();
        act(verbId, { id: Number(p.id), name: cleanName(p.name) }, extra);
      });
      list.append(b);
    }
    body.append(list);
    requestAnimationFrame(() => list.querySelector('button')?.focus());
    return true;
  }

  // —— Doing ——

  function act(verbId, to, extra = {}) {
    const v = PLAYER_VERBS[verbId];
    if (!v || !to?.id) return false;
    const garlic = verbId === 'kiss' && engine.hasBuff?.(GARLIC_BREATH) === true;
    const refusal = energyRefusal(verbId, { energy: pc()?.energy, garlic, name: to.name });
    if (refusal) {
      say(refusal);
      note(`${verbId}:tired`);
      return true;
    }
    for (const [ref, p] of pending) if (Date.now() - p.at > 5000) pending.delete(ref);
    const ref = `pv${me()}-${nextRef++}`;
    pending.set(ref, { verb: verbId, to: to.id, name: to.name, block: extra.block || '', garlic, at: Date.now() });
    client.send('verb_do', { verb: verbId, to: to.id, ref, ...(extra.block ? { block: extra.block } : {}), ...(verbId === 'kiss' ? { garlic } : {}) });
    note(`${verbId}:asked:${to.id}`);
    return true;
  }

  function countOnce(quest, counter, label, perTarget) {
    const qs = engine.questState;
    if (!qs?.active?.[quest]) return false;
    const offers = ensureQuestOfferState(qs);
    const key = perTarget ? 'played_for' : counter; // musicblock canPlayFor: each player once in the whole quest
    const seenList = ((offers.distinct[quest] ||= {})[key] ||= []);
    if (seenList.includes(label)) return false;
    seenList.push(label);
    engine.achievement?.(counter, 1);
    return true;
  }

  function onDone(m) {
    const p = pending.get(String(m?.ref || ''));
    if (p) pending.delete(String(m.ref));
    if (m?.status !== 'ok') {
      if (m?.text) say(String(m.text));
      note(`${m?.verb || 'verb'}:refused`);
      return;
    }
    const verbId = String(m.verb || '');
    const to = { id: Number(m.to?.id) || p?.to || 0, name: cleanName(m.to?.name || p?.name) };
    const block = String(m.block || p?.block || '');
    const garlic = m.garlic === true;
    const side = doerSide(verbId, { name: to.name, garlic, blockLabel: getMusicblock(block)?.label || '' });
    if (!side || !to.id) return;
    const player = pc();
    if (side.energy) loseEnergy(player, side.energy);
    if (side.mood) gainMetabolic(player, 'mood', side.mood);
    if (side.sound) engine.playSound?.(side.sound, { volume: 0.6 });
    say(side.text);
    if (engine.player) engine.floatText?.(engine.player.x, engine.player.y - 88, PLAYER_VERBS[verbId].label, 0xf09ac1);
    const counted = doerCounters(verbId, { to: to.id, garlic, block });
    for (const c of counted.achievements) engine.achievement?.(c, 1);
    for (const q of counted.quests) countOnce(q.quest, q.counter, q.label, q.perTarget);
    if (FEAT_VERBS.has(verbId)) {
      const key = `${verbId}:${to.id}`;
      if (!slice.feat.includes(key) && engine.featsIncrement?.(FEAT_ID, 1)) slice.feat = [...slice.feat, key].slice(-400);
    }
    note(`${verbId}:done:${to.id}`);
    engine.updateHud?.();
    engine.save?.();
  }

  function onGot(m) {
    const id = String(m?.id || '');
    if (!id || seen.has(id)) return;
    seen.add(id);
    if (seen.size > 300) seen.delete(seen.values().next().value);
    const verbId = String(m.verb || '');
    const from = { id: Number(m.from?.id) || 0, name: cleanName(m.from?.name) };
    const side = targetSide(verbId, { from: from.name, garlic: m.garlic === true });
    if (!side) return;
    const player = pc();
    let mood = 0;
    if (side.mood > 0) mood = gainMetabolic(player, 'mood', side.mood);
    else if (side.mood < 0) mood = -loseMood(player, -side.mood);
    if (side.energy > 0) gainMetabolic(player, 'energy', side.energy);
    if (side.xp) grantMoodXp(player, side.xp);
    if (verbId === 'play_for') {
      const block = String(m.block || '');
      if (isMusicblock(block)) {
        const heard = hearMusicblock(engine.musicblockHeard?.() || {}, block, { now: Date.now(), from: from.name, dayOf: (t) => Math.floor(Math.max(0, t) / GAME_DAY_MS) });
        const xp = heard.xp ? grantMoodXp(player, heard.xp) : 0;
        const label = engine.playMusicblockAudio?.(block) || getMusicblock(block)?.label || 'a musicblock';
        const fx = [mood ? `+${mood} mood` : '', xp ? `+${xp} iMG` : ''].filter(Boolean).join(', ');
        say(`${VERB_TEXT.heard(label, heard.lines)}${fx ? ` ${fx}` : ''}`, 4200);
        engine.achievement?.(`musicblocks_heard:${block}`, 1);
      }
    } else {
      if (side.sound) engine.playSound?.(side.sound, { volume: 0.7 });
      showFx(side.overlay, side.text);
      say(side.text);
      if (verbId === 'kiss' && from.id) engine.achievement?.(`been_kissed:${from.id}`, 1);
    }
    note(`${verbId}:got:${from.id}`);
    engine.updateHud?.();
    engine.save?.();
  }

  // —— Charades ——

  function charadesCheck() {
    if (mine || engine.hasBuff?.(CHARADES_BUFF)) return { ok: false, error: 'You are already playing charades.' };
    if (here().length < 1) return { ok: false, error: 'You need other people around to play Charades. Trying to play with yourself is grossly inappropriate.' };
    return { ok: true };
  }

  /** The secret word box's OK (input_min_chars 4 is the box's own rule). */
  function submitWord(value) {
    if (String(value || '').trim().length < CHARADES_TEXT.minChars) {
      engine.toast?.(CHARADES_TEXT.tooShort);
      return false;
    }
    client.send('charades_start', { word: String(value) });
    note('charades:asked');
    return true;
  }

  function askWord() {
    if (asking) return true;
    const body = card(CHARADES_TEXT.title);
    if (!body) return false;
    asking = true;
    const form = el('form', { style: 'padding:0.2rem 0.85rem 0.85rem;display:grid;gap:0.55rem' });
    const label = el('label', { style: 'font-size:0.82rem;opacity:0.75', for: 'pverb-word' }, CHARADES_TEXT.inputLabel);
    const input = el('input', { id: 'pverb-word', type: 'text', maxlength: String(CHARADES_TEXT.maxChars), autocomplete: 'off', spellcheck: 'false', style: 'font:inherit;padding:0.45rem 0.6rem;border:1px solid #d9ccb3;border-radius:8px;background:#fff' });
    const row = el('div', { style: 'display:flex;gap:0.5rem;justify-content:flex-end' });
    const cancel = el('button', { type: 'button', class: 'verb-choice', style: 'width:auto;border:1px solid #e4d9c4;border-radius:8px;padding:0.35rem 0.8rem' }, 'Cancel');
    const ok = el('button', { type: 'submit', class: 'verb-choice', style: 'width:auto;border:1px solid #9cc47a;border-radius:8px;padding:0.35rem 0.8rem;background:#e8f0dc;font-weight:700' }, 'OK');
    row.append(cancel, ok);
    form.append(label, input, row);
    body.append(form);
    const done = () => { asking = false; closeModal(); };
    cancel.addEventListener('click', done);
    modal.querySelector('.verb-menu-x').addEventListener('click', () => { asking = false; });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (submitWord(input.value)) done();
    });
    requestAnimationFrame(() => input.focus());
    return true;
  }

  function onStarted(m) {
    if (m?.status !== 'ok') {
      if (m?.text) say(String(m.text));
      note(`charades:refused:${m?.why || ''}`);
      return;
    }
    if (countItem(engine.inv, CHARADES_POTION) < 1) return;
    // onInputBoxResponse 521-531: the potion is gone, the buff on, the counter counted.
    removeItem(engine.inv, CHARADES_POTION, 1);
    engine.achievement?.(`potions_used:${CHARADES_POTION}`, 1);
    const left = Math.max(1, Math.round((Number(m.ends) - Date.now()) / 1000));
    engine.applyBuff?.(CHARADES_BUFF, { durationSec: Math.min(120, left) });
    mine = { word: String(m.word || ''), ends: Number(m.ends) || 0 };
    engine.pushActivity?.(CHARADES_TEXT.secret(mine.word));
    say(CHARADES_TEXT.everybody, 5000);
    note(`charades:playing:${mine.word}`);
    engine.refreshPack?.();
    engine.save?.();
  }

  function onEnd(m) {
    mine = null;
    if (engine.hasBuff?.(CHARADES_BUFF)) engine.removeBuff?.(CHARADES_BUFF);
    const why = String(m?.why || '');
    if (why === 'guessed') {
      engine.playSound?.('RAINBOW_YOUDIDIT', { volume: 0.7 });
      say(CHARADES_TEXT.guessed(cleanName(m.winner?.name)));
    } else if (why === 'ruined') {
      engine.playSound?.('FAILED_AT_CHARADES', { volume: 0.7 });
      say(CHARADES_TEXT.ruined);
    } else if (why === 'timeout') {
      engine.playSound?.('FAILED_AT_CHARADES', { volume: 0.7 });
      say(CHARADES_TEXT.timeout);
    } else if (why === 'left') {
      say(CHARADES_TEXT.left);
    }
    note(`charades:end:${why}`);
    engine.updateHud?.();
  }

  function onOn(m) {
    const id = Number(m?.from?.id) || 0;
    if (!id || id === me()) return;
    others.set(id, { name: cleanName(m.from?.name), ends: Number(m.ends) || 0 });
    if (m.text) say(String(m.text), 4200);
    note(`charades:on:${id}`);
  }

  function onOver(m) {
    const id = Number(m?.from?.id) || 0;
    others.delete(id);
    if (m?.text) engine.pushActivity?.(String(m.text));
    note(`charades:over:${m?.why || ''}`);
  }

  function onWon(m) {
    const player = pc();
    // main.js:1781-1786: +50 iMG, +250 currants, the rainbow (the currants are the server's credit too).
    const xp = grantMoodXp(player, Number(m?.xp) || 0);
    const currants = Math.max(0, Math.floor(Number(m?.currants) || 0));
    player.currants = (player.currants || 0) + currants;
    rainbow();
    say(String(m?.text || `You guessed correctly! +${xp} iMG, +${currants} currants`), 4200);
    others.delete(Number(m?.from?.id) || 0);
    note(`charades:won:${currants}`);
    engine.updateHud?.();
    engine.save?.();
  }

  // —— Epic Blowout ——

  function tickInfluence(now) {
    if (now < nextInfluence) return;
    nextInfluence = now + INFLUENCE_EVERY_MS;
    if (client.state !== 'online') return;
    const on = underTheInfluence(engine.activeBuffIds?.() || []);
    if (on === influence) return;
    influence = on;
    client.send('verbs_influence', { on });
    publish();
  }

  client.on('msg:verb_done', onDone);
  client.on('msg:verb_got', onGot);
  client.on('msg:charades_started', onStarted);
  client.on('msg:charades_end', onEnd);
  client.on('msg:charades_on', onOn);
  client.on('msg:charades_over', onOver);
  client.on('msg:charades_won', onWon);
  client.on('msg:party_blowout', () => {
    // home.js:216: achievements_increment('attended_party', 'blowout').
    engine.achievement?.('attended_party:blowout', 1);
    note('blowout');
  });
  client.on('roster', () => {
    // A new street (or a new socket): its games are told again; the server forgets a socket's word.
    others.clear();
    influence = null;
    nextInfluence = 0;
    publish();
  });

  return {
    client,
    get last() { return last; },
    get mine() { return mine; },
    /** QA: the player's tanks and purse. */
    snapshot() {
      const p = pc() || {};
      return { energy: p.energy, mood: p.mood, xp: p.xp, imagination: p.imagination, currants: p.currants, others: [...others.keys()] };
    },
    act,
    pickPlayer,
    askWord,
    submitWord,
    charadesCheck,
    tick(now) {
      tickInfluence(now);
      if (mine && mine.ends && Date.now() > mine.ends + 5000) mine = null; // the server's end was lost
    },
    menu() {
      return emoteMenu({ inv: engine.inv, upgrades: engine.emotionalBearUpgrades?.() || [], race: isVerbRaceStreet(street()) });
    },
    soakReady() {
      return countItem(engine.inv, WATERING_CAN) > 0 && here().length > 0;
    },
    here,
  };
}

function ensure(engine) {
  if (session) return session;
  if (!isMp(engine)) return null;
  session = createSession(engine, engine.query('realtimeClient'));
  globalThis.groddlePlayerVerbs = session;
  return session;
}

export const playerVerbsMpFeature = {
  id: PLAYER_VERBS_FEATURE_ID,

  init(engine) {
    multiplayer = engine?.mode === 'multiplayer';
  },

  onTick(dtMs, now, engine) {
    if (engine.mode !== 'multiplayer' || !engine.started) return;
    ensure(engine)?.tick(now);
  },

  /** Another player's Glitch: its menu plus the pack's emotes (main.js:3547-3580). */
  verbOverride(target, engine) {
    if (guard || !session || target?.classId !== 'pc_remote' || !target.playerId || engine?.mode !== 'multiplayer') return null;
    guard = true;
    let base;
    try {
      base = engine.targetVerbs?.(target) || [];
    } finally {
      guard = false;
    }
    const mine = session.menu();
    if (!mine.length) return null;
    return [...base.filter((v) => !String(v.id).startsWith(MENU_PREFIX)), ...mine];
  },

  runVerbOverride(target, verbId) {
    const id = String(verbId || '');
    if (!session || !id.startsWith(MENU_PREFIX) || !target?.playerId) return null;
    const verb = id.slice(MENU_PREFIX.length);
    if (!PLAYER_VERBS[verb]?.emote) return null;
    return session.act(verb, { id: Number(target.playerId), name: cleanName(target.label || target.name) });
  },

  /** The pack: Soak (Watering Can) and Play for (a musicblock) ask whom. */
  packVerbs(classTsid, engine) {
    if (!multiplayer || !session || engine?.mode !== 'multiplayer') return null;
    const c = String(classTsid || '');
    const anyone = session.here().length > 0;
    if (c === WATERING_CAN) {
      return [{ id: PACK_SOAK, label: PLAYER_VERBS.soak.label, enabled: anyone, reason: anyone ? '' : VERB_TEXT.nobody, tooltip: PLAYER_VERBS.soak.tooltip }];
    }
    if (isMusicblock(c)) {
      return [{ id: PACK_PLAY_FOR, label: PLAYER_VERBS.play_for.label, enabled: anyone, reason: anyone ? '' : VERB_TEXT.nobody, tooltip: PLAYER_VERBS.play_for.tooltip }];
    }
    return null;
  },

  runPackVerb(classTsid, verbId) {
    if (!session) return false;
    if (verbId === PACK_SOAK) return session.pickPlayer('soak');
    if (verbId === PACK_PLAY_FOR && isMusicblock(classTsid)) return session.pickPlayer('play_for', { block: String(classTsid) });
    return false;
  },

  /** potions-feature: canQuaff with real players (potion_charades.js 511-517). */
  charadesCheck(engine) {
    if (engine?.mode !== 'multiplayer') return null;
    return ensure(engine)?.charadesCheck() || null;
  },

  /** potions-feature: onQuaff's askPlayer (541-552); the potion goes when the server takes the word. */
  charadesQuaff(engine) {
    if (engine?.mode !== 'multiplayer') return null;
    const s = ensure(engine);
    if (!s) return null;
    s.askWord();
    return { ok: true, noUse: true, tag: 'charades_ask' };
  },

  /** quests-mp-feature: the verbs on another player are live. */
  playerVerbsReady(engine) {
    return engine?.mode === 'multiplayer' && session ? true : null;
  },

  /** quests-mp-feature (Super Soaker's offer): a Watering Can and another player here. */
  playerVerbsSoakReady(engine) {
    return engine?.mode === 'multiplayer' && session?.soakReady() ? true : null;
  },

  save() {
    if (!multiplayer || !slice.feat.length) return undefined;
    return { feat: slice.feat };
  },

  restore(s, engine) {
    multiplayer = engine?.mode === 'multiplayer';
    slice = multiplayer ? normalizeVerbsSlice(s) : normalizeVerbsSlice(null);
  },
};
