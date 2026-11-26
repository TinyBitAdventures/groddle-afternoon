/**
 * The Vine Radio on a home street (register G1245, report #661; rules and sources in js/vine-radio.js).
 * Ours: Glitch had no radio a player could own.
 *
 * - Drawn: the vine radio decoration (Tiny Speck, CC0, Ix set) where its owner stood it in Cultivate
 *   (homes-feature homeRadio; a visitor's from the owner's saved street, homeRadioVisit). While it
 *   plays, notes drift up from it and a small label names the music; stopped, it stands still.
 * - The owner's menu: Stop (Play when stopped), Choose music, Next track, Examine. A visitor's: Hear
 *   street music instead (just for them, on this visit; then Hear the radio) and Examine.
 * - Choose music: a side sheet of the panel shell (on the left in Modern, a bottom sheet on a phone
 *   through the phone layout, a 2012 window in Classic: css/classic.css lists #vine-radio-panel with
 *   the other windows), tabs Regions, Theme tracks and Musicblocks, Street style music first. Listen
 *   plays the pick on your street for a short while, for you only.
 * - Music: game.js asks streetMusicOverride whenever it sets a street's music; the radio's playlist
 *   streams as street music does (only the playing track loads; phones start it after the first tap
 *   with the rest of the sound). Every 400 ms the radio checks the street music is what it should be
 *   and how loud it is where you stand (radioNearLevel, game.js setStreetMusicNear).
 * - Unlocks kept in this feature's slice: the regions you have visited (hubs_visited counters, and
 *   the streets already in your save: engine.visitedHubs) and the theme tracks you have heard where
 *   the game plays them (game.js noteMusicHeard).
 *
 * QA: &radiodemo=owned (own it without the quest), out (and stand it out on your home street),
 * play:<pick> (and play that: region:<hub>, track:<id>, blocks), visit (a visitor's view: another
 * player's home street, built from a made-up save, with its radio playing Alakol), sheet (open Choose
 * music when the radio is there). &radiotab=regions|themes|blocks picks the sheet's tab.
 * Canvas: radio ('own'|'visit'|''), radioPlaying (the playlist key or ''), radioLabel, radioNear
 * (0..1), radioX, radioOptOut, radioSheet (the tab, '' when closed), radioPick (the sheet's selection),
 * radioPreview, radioHubs, radioHeard, radioLast.
 */

import { getAmbientMusicConfig } from '../ambient-music.js?v=4b3c6041';
import { MUSICBLOCK_CATALOG } from '../musicblocks.js?v=8e985753';
import { musicblocksInPack } from '../crabs.js?v=5a43743d';
import { standOnFeet } from '../sprite-feet.js?v=6358a697';
import { textureFromUrl } from '../textures.js?v=b8e38103';
import { WORLD_FONT_FAMILY } from '../world-text.js?v=6b49f88c';
import { SIDE_SHEET_IDS, bindTabs, selectTab } from '../ui/panel-shell.js?v=5efb38c6';
import { homeStreetName, possessive, visitSceneTsid } from '../neighbours-mp.js?v=f43b50c8';
import { visitorHomeScene } from './homes-feature.js?v=6243f555';
import {
  PREVIEW_MS,
  RADIO_ART,
  RADIO_CLASS,
  RADIO_FEATURE_ID,
  RADIO_PANEL_ID,
  RADIO_TEXT,
  cleanPick,
  heardTrackId,
  normalizeRadioState,
  pickOpen,
  radioLabel,
  radioNearLevel,
  radioOwned,
  radioPlaylist,
  radioSubtitle,
  radioUnlocks,
} from '../vine-radio.js?v=5436aa09';

const HOME_STREET_TSID = 'RH_HOME_EXT';
const SCAN_MS = 400;
const NOTE_EVERY_MS = 700;
const NOTE_LIFE_MS = 2600;
const NOTE_GLYPHS = ['♪', '♫', '♪', '♬'];
const NOTE_COLOURS = [0x6a3d9a, 0x2f6b3a, 0x8a4b14];

/** Saved unlock memory: regions visited (hub ids), theme tracks heard (ids). */
let memory = { hubs: [], heard: [] };
/** On the street now: { mode: 'own'|'visit', sprite, target, fx, label, notes, x, y }. */
let radio = null;
/** A visited home street's radio, from neighbours-mp-feature: { tsid, owner, name, x, y }. */
let visit = null;
/** A visitor chose street music for this visit (the visit scene's tsid), or ''. */
let optedOut = '';
/** The visit scene whose radio line was given (once a visit, not at every door). */
let announced = '';
/** The owner's Listen: { pick, until }. */
let preview = null;
let lastScan = 0;
let lastNote = 0;
let last = '';
let demoOwned = false;
let demoStep = '';
let sheet = null;
let sheetTab = 'regions';
let sheetPick = '';
let listCache = null;

const now = () => Date.now();
const param = (engine, k) => String(engine?.param?.(k) || '');

/* ------------------------------------------------------------------ what plays */

function config() {
  return getAmbientMusicConfig();
}

function ownedBlocks(engine) {
  return musicblocksInPack(engine?.inv || {}).map((b) => b.classTsid);
}

const blockAudio = (classTsid) => MUSICBLOCK_CATALOG[classTsid]?.audio || '';

/** On your own home street, outside (not the house, a Tower floor or a back yard). */
function onOwnStreet(engine) {
  const home = engine?.homeContext?.();
  return Boolean(home?.inHome) && home.room === 'street' && engine.streetTsid === HOME_STREET_TSID;
}

/** The radio standing where you are: { mode, state, x?, owner? } or null. */
function radioHere(engine, street = engine?.street) {
  if (street?.tsid === HOME_STREET_TSID || (!street && onOwnStreet(engine))) {
    if (!onOwnStreet(engine)) return null;
    const home = engine.query?.('homeRadio', engine);
    return home ? { mode: 'own', state: normalizeRadioState(home.state), x: home.x, y: home.y } : null;
  }
  if (street?.homeRadio) {
    const at = visit && visit.tsid === street.tsid ? visit : null;
    return { mode: 'visit', state: normalizeRadioState(street.homeRadio.state), owner: street.homeRadio.owner, x: at?.x, y: at?.y };
  }
  return null;
}

/** The playlist the radio plays here now (null: the street's own music). */
function playlistFor(engine, here) {
  if (!here) return null;
  if (here.mode === 'own' && preview && preview.until > now()) {
    return radioPlaylist(preview.pick, { config: config(), blocks: ownedBlocks(engine), blockAudio });
  }
  if (!here.state.on || !here.state.pick) return null;
  if (here.mode === 'visit' && optedOut && optedOut === engine.streetTsid) return null;
  const blocks = here.mode === 'own' ? ownedBlocks(engine) : here.state.blocks || [];
  return radioPlaylist(here.state.pick, { config: config(), blocks, blockAudio });
}

/** The radio's own playlist as its label shows it, whether or not this visitor opted out. */
function radioList(engine, here) {
  if (!here) return null;
  if (here.mode === 'own' && preview && preview.until > now()) return radioPlaylist(preview.pick, { config: config(), blocks: ownedBlocks(engine), blockAudio });
  if (!here.state.on || !here.state.pick) return null;
  const blocks = here.mode === 'own' ? ownedBlocks(engine) : here.state.blocks || [];
  return radioPlaylist(here.state.pick, { config: config(), blocks, blockAudio });
}

function setState(engine, next, line = '') {
  const out = engine.query?.('homeRadioSet', next, engine);
  if (!out) return null;
  if (line) engine.pushActivity?.(line);
  engine.refreshStreetMusic?.();
  sync(engine, true);
  return out;
}

/* ------------------------------------------------------------------ drawing */

function spawn(engine, here) {
  const { PIXI } = engine;
  const spr = new PIXI.Sprite(textureFromUrl(RADIO_ART.url));
  // The decoration's feet, read from its art (js/sprite-feet.js), as the deco itself stands.
  standOnFeet(spr, RADIO_ART.url);
  spr.scale.set(RADIO_ART.scale);
  spr.x = here.x;
  spr.y = here.y;
  spr.zIndex = 31;
  engine.entityLayer.addChild(spr);
  const fx = new PIXI.Container();
  fx.zIndex = 45;
  engine.entityLayer.addChild(fx);
  const label = new PIXI.Container();
  const text = new PIXI.Text({ text: '', style: { fontFamily: WORLD_FONT_FAMILY, fontSize: 13, fontWeight: '700', fill: 0x3a2a12, padding: 2 } });
  text.resolution = 3;
  text.anchor.set(0.5);
  const bg = new PIXI.Graphics();
  label.addChild(bg, text);
  label.visible = false;
  fx.addChild(label);
  const owner = here.mode === 'own';
  const target = engine.register({
    classId: RADIO_CLASS,
    featureId: RADIO_FEATURE_ID,
    label: owner ? RADIO_TEXT.name : `${possessive(here.owner)} ${RADIO_TEXT.name}`,
    subtitle: RADIO_TEXT.stopped,
    sprite: spr,
    state: { owner },
  });
  return { mode: here.mode, sprite: spr, target, fx, label, text, bg, notes: [], x: here.x, y: here.y, shown: '' };
}

function clear(engine) {
  if (!radio) return;
  if (radio.target) engine.unregister?.(radio.target);
  if (radio.fx && !radio.fx.destroyed) {
    radio.fx.parent?.removeChild(radio.fx);
    radio.fx.destroy({ children: true });
  }
  radio = null;
  engine.setStreetMusicNear?.(1);
}

function drawLabel(words) {
  if (!radio || radio.shown === words) return;
  radio.shown = words;
  radio.label.visible = Boolean(words);
  if (!words) return;
  radio.text.text = words;
  const w = Math.ceil(radio.text.width) + 16;
  radio.bg.clear();
  radio.bg.roundRect(-w / 2, -12, w, 24, 8).fill({ color: 0xfff6dc, alpha: 0.94 }).stroke({ width: 2, color: 0x6a8a3a });
}

function tickNotes(engine, playing) {
  if (!radio || radio.fx.destroyed) return;
  const t = now();
  const top = radio.y - RADIO_ART.h * RADIO_ART.scale;
  radio.label.x = radio.x;
  // Over the Enter hint that sits on the radio's top when you stand by it.
  radio.label.y = top - 62;
  if (playing && t - lastNote > NOTE_EVERY_MS) {
    lastNote = t;
    const glyph = NOTE_GLYPHS[Math.floor(Math.random() * NOTE_GLYPHS.length)];
    const note = new engine.PIXI.Text({ text: glyph, style: { fontFamily: WORLD_FONT_FAMILY, fontSize: 22, fontWeight: '700', fill: NOTE_COLOURS[radio.notes.length % NOTE_COLOURS.length], padding: 4 } });
    note.resolution = 2;
    note.anchor.set(0.5);
    note.born = t;
    note.dx = (Math.random() - 0.5) * 50;
    note.x0 = radio.x + 6 + (Math.random() - 0.5) * 20;
    note.y0 = top + 30;
    radio.fx.addChild(note);
    radio.notes.push(note);
  }
  radio.notes = radio.notes.filter((n) => {
    const age = (t - n.born) / NOTE_LIFE_MS;
    if (age >= 1 || n.destroyed) {
      if (!n.destroyed) n.destroy();
      return false;
    }
    n.x = n.x0 + Math.sin(age * Math.PI * 2) * 8 + n.dx * age;
    n.y = n.y0 - 75 * age;
    n.alpha = age < 0.15 ? age / 0.15 : 1 - Math.max(0, age - 0.5) / 0.5;
    return true;
  });
}

/* ------------------------------------------------------------------ the 400 ms look */

function sync(engine, force = false) {
  const t = now();
  if (!force && t - lastScan < SCAN_MS) return;
  lastScan = t;
  if (preview && preview.until <= t) {
    preview = null;
    engine.refreshStreetMusic?.();
    renderSheet(engine);
  }
  // A visit ends when you leave that home (its street, house and Tower share the scene's prefix):
  // the radio comes back on your next visit, and its line is given again.
  const tsid = String(engine.streetTsid || '');
  const sameHome = (v) => tsid === v || tsid.startsWith(`${v}_`);
  if (optedOut && !sameHome(optedOut)) optedOut = '';
  if (announced && !sameHome(announced)) announced = '';
  const here = radioHere(engine);
  const placed = here && Number.isFinite(here.x) && Number.isFinite(here.y);
  if (radio && (!placed || radio.mode !== here.mode || radio.sprite.destroyed)) clear(engine);
  if (!radio && placed) radio = spawn(engine, here);
  if (radio && placed) {
    radio.x = here.x;
    radio.y = here.y;
    radio.sprite.x = here.x;
  }
  if (!here && sheet && !sheet.hidden) closeSheet(engine);
  // The owner's medley follows the blocks in the pack, saved so a visitor hears the same tunes.
  if (here?.mode === 'own' && here.state.pick === 'blocks') {
    const blocks = ownedBlocks(engine);
    if (blocks.join(',') !== (here.state.blocks || []).join(',')) engine.query?.('homeRadioSet', { ...here.state, blocks }, engine);
  }
  // The street music is the radio's (or the street's own again).
  const want = playlistFor(engine, here);
  const nowPlaying = engine.streetMusicNow?.();
  if (nowPlaying) {
    const key = want ? `radio:${want.key}` : '';
    if ((key && nowPlaying.theme !== key) || (!key && String(nowPlaying.theme).startsWith('radio:'))) engine.refreshStreetMusic?.();
  }
  const list = radioList(engine, here);
  listCache = list;
  const index = nowPlaying && list && nowPlaying.theme === `radio:${list.key}` ? nowPlaying.index : 0;
  if (radio) {
    const mine = radio.mode === 'visit' && optedOut === engine.streetTsid;
    radio.target.subtitle = radioSubtitle(list, index, { optedOut: mine });
    drawLabel(list ? radioLabel(list, index) : '');
  }
  // Louder near it (street only: the house and other streets have no radio).
  let near = 1;
  if (want && radio && engine.player) near = radioNearLevel(engine.player.x - radio.x);
  engine.setStreetMusicNear?.(near);
  publish(engine, { here, list, near });
}

function publish(engine, { here, list, near } = {}) {
  engine.setData?.('radio', radio ? radio.mode : '');
  engine.setData?.('radioPlaying', list ? list.key : '');
  engine.setData?.('radioLabel', radio?.shown || '');
  engine.setData?.('radioNear', String(Math.round((near ?? 1) * 100) / 100));
  engine.setData?.('radioX', radio ? String(Math.round(radio.x)) : '');
  engine.setData?.('radioOptOut', optedOut && optedOut === engine.streetTsid ? '1' : '0');
  engine.setData?.('radioSheet', sheet && !sheet.hidden ? sheetTab : '');
  engine.setData?.('radioPick', sheet && !sheet.hidden ? sheetPick || 'street' : '');
  engine.setData?.('radioPreview', preview ? preview.pick : '');
  engine.setData?.('radioHubs', String(knownHubs(engine).length));
  engine.setData?.('radioHeard', String(memory.heard.length));
  engine.setData?.('radioLast', last);
  engine.setData?.('radioState', here ? `${here.state.on ? 'on' : 'off'}:${here.state.pick || 'street'}` : '');
}

/* ------------------------------------------------------------------ unlocks */

function knownHubs(engine) {
  return [...new Set([...memory.hubs, ...(engine?.visitedHubs?.() || [])])];
}

function unlocks(engine) {
  return radioUnlocks({ config: config(), hubs: knownHubs(engine), heard: memory.heard, blocks: ownedBlocks(engine) });
}

/* ------------------------------------------------------------------ verbs */

function ownerVerbs(engine) {
  const here = radioHere(engine);
  const st = here?.state || normalizeRadioState();
  const list = listCache;
  const verbs = [];
  if (st.on && st.pick) verbs.push({ id: 'radio_stop', label: RADIO_TEXT.stop, enabled: true, reason: '', tooltip: 'Your street plays its own music again', durationMs: 0 });
  else verbs.push({ id: 'radio_play', label: RADIO_TEXT.play, enabled: Boolean(st.pick), reason: st.pick ? '' : RADIO_TEXT.chooseFirst, tooltip: 'Play your pick on your street', durationMs: 0 });
  verbs.push({ id: 'radio_choose', label: RADIO_TEXT.choose, enabled: true, reason: '', tooltip: 'Pick what your street plays. Your visitors hear it too.', durationMs: 0 });
  const steps = Boolean(st.on && list && list.tracks.length > 1);
  verbs.push({ id: 'radio_next', label: RADIO_TEXT.next, enabled: steps, reason: steps ? '' : st.on && list ? RADIO_TEXT.oneTrack : RADIO_TEXT.stopped, tooltip: '', durationMs: 0 });
  verbs.push({ id: 'radio_examine', label: RADIO_TEXT.examineVerb, enabled: true, reason: '', tooltip: '', durationMs: 0 });
  return verbs;
}

function visitorVerbs(engine) {
  const out = optedOut && optedOut === engine.streetTsid;
  return [
    out
      ? { id: 'radio_optin', label: RADIO_TEXT.hearRadio, enabled: true, reason: '', tooltip: RADIO_TEXT.hearRadioTip, durationMs: 0 }
      : { id: 'radio_optout', label: RADIO_TEXT.streetInstead, enabled: true, reason: '', tooltip: RADIO_TEXT.streetInsteadTip, durationMs: 0 },
    { id: 'radio_examine', label: RADIO_TEXT.examineVerb, enabled: true, reason: '', tooltip: '', durationMs: 0 },
  ];
}

function runRadioVerb(engine, verbId) {
  const here = radioHere(engine);
  if (!here) return false;
  if (verbId === 'radio_examine') {
    engine.say?.(radio?.target, RADIO_TEXT.examine, 6000);
    last = 'examine';
  } else if (here.mode === 'visit') {
    if (verbId === 'radio_optout') {
      optedOut = engine.streetTsid;
      engine.pushActivity?.(RADIO_TEXT.optedOut);
      last = 'optout';
    } else if (verbId === 'radio_optin') {
      optedOut = '';
      engine.pushActivity?.(RADIO_TEXT.optedIn);
      last = 'optin';
    }
    engine.refreshStreetMusic?.();
  } else if (verbId === 'radio_stop') {
    setState(engine, { ...here.state, on: false }, RADIO_TEXT.stoppedLine);
    last = 'stop';
  } else if (verbId === 'radio_play') {
    if (!here.state.pick) return true;
    const list = setState(engine, { ...here.state, on: true });
    if (list) engine.pushActivity?.(RADIO_TEXT.nowPlaying(radioList(engine, radioHere(engine))?.label || ''));
    last = 'play';
  } else if (verbId === 'radio_next') {
    engine.refreshStreetMusic?.({ next: true });
    last = 'next';
  } else if (verbId === 'radio_choose') {
    openSheet(engine);
  }
  sync(engine, true);
  return true;
}

/* ------------------------------------------------------------------ Choose music */

function el(tag, attrs = {}, text = '') {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'dataset') Object.assign(node.dataset, v);
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  if (text) node.textContent = text;
  return node;
}

function mountSheet(engine) {
  if (sheet || typeof document === 'undefined' || !document.getElementById) return sheet;
  const root = document.getElementById('game-root');
  if (!root) return null;
  sheet = el('div', { id: RADIO_PANEL_ID, class: 'side-panel vine-radio-panel ui-sheet', role: 'region', 'aria-labelledby': 'vine-radio-title', hidden: true });
  const card = el('div', { class: 'side-card ui-sheet-card' });
  const head = el('div', { class: 'side-head ui-sheet-head' });
  head.append(
    el('img', { class: 'ui-sheet-icon', src: RADIO_ART.url, alt: '', width: 22, height: 28 }),
    el('h2', { id: 'vine-radio-title', class: 'ui-sheet-title', tabindex: '-1' }, RADIO_TEXT.choose),
  );
  const close = el('button', { type: 'button', id: 'vine-radio-close', class: 'verb-menu-x ui-sheet-x', 'aria-label': 'Close Choose music (Esc)' }, '×');
  close.addEventListener('click', () => closeSheet(engine));
  head.append(close);
  const body = el('div', { class: 'ui-sheet-body vr-body' });
  body.append(el('p', { class: 'vr-lead' }, RADIO_TEXT.sheetLead));
  const nowBox = el('div', { class: 'vr-now', dataset: { vrNow: '' } });
  body.append(nowBox);
  const tabs = el('div', { class: 'ui-sheet-tabs vr-tabs', role: 'tablist', 'aria-label': RADIO_TEXT.choose });
  for (const id of ['regions', 'themes', 'blocks']) {
    tabs.append(el('button', { type: 'button', role: 'tab', class: 'vr-tab', dataset: { tab: id, vrTab: id }, 'aria-selected': id === sheetTab ? 'true' : 'false' }, RADIO_TEXT.tabs[id]));
  }
  bindTabs(tabs, { onSelect: (id) => { sheetTab = id; renderSheet(engine); } });
  body.append(tabs, el('div', { class: 'vr-list', dataset: { vrList: '' }, role: 'list' }));
  const foot = el('div', { class: 'ui-sheet-foot vr-foot' });
  const play = el('button', { type: 'button', class: 'content-action-btn vr-play', dataset: { vrPlay: '' } }, RADIO_TEXT.playOnStreet);
  play.addEventListener('click', () => applyPick(engine, sheetPick));
  const style = el('button', { type: 'button', class: 'content-action-btn vr-style', dataset: { vrStyle: '' } }, RADIO_TEXT.useStreetStyle);
  style.addEventListener('click', () => applyPick(engine, ''));
  foot.append(play, style);
  card.append(head, body, foot);
  sheet.append(card);
  root.append(sheet);
  engine.panelShell?.add?.({ id: RADIO_PANEL_ID, close: () => closeSheet(engine) });
  // Classic has no panel shell: one 2012 window at a time (as Projects does).
  if (typeof MutationObserver === 'function') {
    const watch = new MutationObserver(() => {
      if (!sheet || sheet.hidden || engine.panelShell) return;
      if (SIDE_SHEET_IDS.some((id) => id !== RADIO_PANEL_ID && document.getElementById(id) && !document.getElementById(id).hidden)) closeSheet(engine);
    });
    for (const id of SIDE_SHEET_IDS) {
      const node = document.getElementById(id);
      if (node && id !== RADIO_PANEL_ID) watch.observe(node, { attributes: true, attributeFilter: ['hidden'] });
    }
  }
  sheet.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      closeSheet(engine);
    }
  });
  return sheet;
}

function openSheet(engine) {
  const here = radioHere(engine);
  if (!here || here.mode !== 'own' || !mountSheet(engine)) return false;
  sheetPick = here.state.pick;
  const asked = param(engine, 'radiotab');
  if (['regions', 'themes', 'blocks'].includes(asked)) sheetTab = asked;
  else if (here.state.pick.startsWith('track:')) sheetTab = 'themes';
  else if (here.state.pick === 'blocks') sheetTab = 'blocks';
  // Modern: one side sheet at a time (the panel shell closes the others as this one opens).
  sheet.hidden = false;
  renderSheet(engine);
  sheet.querySelector('.ui-sheet-title')?.focus?.({ preventScroll: true });
  last = 'sheet';
  publish(engine);
  return true;
}

function closeSheet(engine) {
  if (!sheet || sheet.hidden) return;
  sheet.hidden = true;
  if (preview) {
    preview = null;
    engine.refreshStreetMusic?.();
  }
  last = 'sheet:closed';
  publish(engine);
}

function applyPick(engine, pick) {
  const here = radioHere(engine);
  if (!here || here.mode !== 'own') return;
  const p = cleanPick(pick);
  if (p && !pickOpen(p, unlocks(engine))) return;
  preview = null;
  const next = p ? { on: true, pick: p, blocks: p === 'blocks' ? ownedBlocks(engine) : [] } : { on: false, pick: '' };
  setState(engine, next);
  const list = radioList(engine, radioHere(engine));
  engine.pushActivity?.(list ? RADIO_TEXT.nowPlaying(list.label) : RADIO_TEXT.streetStyleLine);
  engine.playSound?.('CLICK_SUCCESS', { volume: 0.45 });
  sheetPick = p;
  last = `pick:${p || 'street'}`;
  renderSheet(engine);
  publish(engine);
}

function listen(engine, pick) {
  const p = cleanPick(pick);
  if (!p || !pickOpen(p, unlocks(engine))) return;
  if (preview?.pick === p) {
    preview = null;
    last = 'listen:stop';
  } else {
    preview = { pick: p, until: now() + PREVIEW_MS };
    last = `listen:${p}`;
  }
  engine.refreshStreetMusic?.();
  renderSheet(engine);
  sync(engine, true);
}

function row(engine, { pick, name, sub, open = true, title = '' }) {
  const selected = sheetPick === pick;
  const r = el('div', { class: `vr-row${open ? '' : ' vr-locked'}${selected ? ' vr-selected' : ''}`, role: 'listitem', dataset: { vrPick: pick || 'street', vrOpen: open ? '1' : '0' } });
  const b = el('button', { type: 'button', class: 'vr-pick', 'aria-pressed': selected ? 'true' : 'false', disabled: !open, title });
  b.append(el('span', { class: 'vr-name' }, name), el('span', { class: 'vr-sub' }, sub));
  b.addEventListener('click', () => {
    sheetPick = pick;
    renderSheet(engine);
    publish(engine);
  });
  b.addEventListener('dblclick', () => applyPick(engine, pick));
  r.append(b);
  if (pick && open) {
    const on = preview?.pick === pick;
    const l = el('button', { type: 'button', class: 'vr-listen', dataset: { vrListen: pick }, 'aria-pressed': on ? 'true' : 'false' }, on ? RADIO_TEXT.listening : RADIO_TEXT.listen);
    l.addEventListener('click', () => listen(engine, pick));
    r.append(l);
  }
  return r;
}

function heading(words) {
  return el('h3', { class: 'vr-heading' }, words);
}

function renderSheet(engine) {
  if (!sheet || sheet.hidden) return;
  const here = radioHere(engine);
  const u = unlocks(engine);
  const nowBox = sheet.querySelector('[data-vr-now]');
  const list = radioList(engine, here);
  const playing = engine.streetMusicNow?.();
  const index = list && playing?.theme === `radio:${list.key}` ? playing.index : 0;
  nowBox.textContent = '';
  if (list) {
    nowBox.append(el('strong', {}, list.label), el('span', {}, list.tracks.length > 1 ? `Track ${index + 1} of ${list.tracks.length} · ${list.gapSec ? 'each tune once, then the next' : 'each track once, then the next'}` : 'one track, on repeat'));
    if (!preview) {
      const stop = el('button', { type: 'button', class: 'vr-stop', dataset: { vrStop: '' } }, RADIO_TEXT.stop);
      stop.addEventListener('click', () => runRadioVerb(engine, 'radio_stop'));
      nowBox.append(stop);
    }
  } else {
    nowBox.append(el('strong', {}, RADIO_TEXT.streetStyle), el('span', {}, RADIO_TEXT.streetStyleSub));
  }
  const openRegions = u.regions.filter((r) => r.open);
  const openTracks = u.tracks.filter((t) => t.open);
  const counts = { regions: `${openRegions.length}/${u.regions.length}`, themes: `${openTracks.length}/${u.tracks.length}`, blocks: `${u.blocks.length}/${Object.keys(MUSICBLOCK_CATALOG).length}` };
  for (const tab of sheet.querySelectorAll('[role="tab"]')) {
    tab.textContent = '';
    tab.append(document.createTextNode(RADIO_TEXT.tabs[tab.dataset.tab]), el('span', { class: 'vr-count' }, counts[tab.dataset.tab]));
  }
  selectTab(sheet.querySelector('[role="tablist"]'), sheetTab);
  const box = sheet.querySelector('[data-vr-list]');
  box.textContent = '';
  box.append(row(engine, { pick: '', name: RADIO_TEXT.streetStyle, sub: 'Your street style, the default' }));
  if (sheetTab === 'regions') {
    box.append(heading(RADIO_TEXT.heard));
    for (const r of openRegions) box.append(row(engine, { pick: `region:${r.hubId}`, name: r.name, sub: `${r.tracks} ${r.tracks === 1 ? 'track' : 'tracks'}` }));
    const locked = u.regions.filter((r) => !r.open);
    if (locked.length) {
      box.append(heading(RADIO_TEXT.notHeard));
      for (const r of locked) box.append(row(engine, { pick: `region:${r.hubId}`, name: r.name, sub: `Visit ${r.name} to hear it`, open: false }));
    }
  } else if (sheetTab === 'themes') {
    const heard = u.tracks.filter((t) => t.open && !t.withRadio);
    const withRadio = u.tracks.filter((t) => t.withRadio);
    const locked = u.tracks.filter((t) => !t.open);
    if (heard.length) {
      box.append(heading(RADIO_TEXT.heard));
      for (const t of heard) box.append(row(engine, { pick: `track:${t.id}`, name: t.title, sub: t.where }));
    }
    box.append(heading(RADIO_TEXT.comesWith));
    for (const t of withRadio) box.append(row(engine, { pick: `track:${t.id}`, name: t.title, sub: 'Theme track' }));
    if (locked.length) {
      box.append(heading(RADIO_TEXT.notHeard));
      for (const t of locked) box.append(row(engine, { pick: `track:${t.id}`, name: t.title, sub: t.where, open: false }));
    }
  } else {
    const n = u.blocks.length;
    box.append(row(engine, { pick: 'blocks', name: RADIO_TEXT.medley, sub: n ? `A medley of the ${n} ${n === 1 ? 'tune' : 'tunes'} you own, each once` : RADIO_TEXT.noBlocks, open: n > 0 }));
    const grid = el('div', { class: 'vr-blocks', dataset: { vrBlocks: '' } });
    const owned = new Set(u.blocks);
    for (const def of Object.values(MUSICBLOCK_CATALOG)) {
      const has = owned.has(def.classTsid);
      const tile = el('span', { class: `vr-block${has ? '' : ' vr-locked'}`, title: has ? def.label : `${def.label}: not in your pack`, dataset: { vrBlock: def.classTsid } });
      tile.append(el('img', { src: def.icon, alt: '', width: 36, height: 36 }), el('span', {}, String(def.label || '').replace(/^Musicblock /, '')));
      grid.append(tile);
    }
    box.append(grid);
  }
  const playBtn = sheet.querySelector('[data-vr-play]');
  const can = sheetPick && pickOpen(sheetPick, u);
  playBtn.disabled = !can;
  playBtn.hidden = !sheetPick;
  sheet.querySelector('[data-vr-style]').disabled = !here?.state.pick;
}

/* ------------------------------------------------------------------ QA demos */

function demo(engine) {
  const mode = demoStep;
  if (!mode || !engine.started) return;
  if (mode === 'visit') {
    demoStep = '';
    visitDemo(engine);
    return;
  }
  if (!onOwnStreet(engine)) return;
  const home = engine.query?.('homeRadio', engine);
  if (!home) {
    if (engine.query?.('homeRadioPutOut', engine)?.ok !== true) return;
    last = 'demo:out';
  }
  const pick = mode.startsWith('play:') ? cleanPick(mode.slice(5)) : '';
  if (pick) {
    if (pick.startsWith('region:')) memory.hubs = [...new Set([...memory.hubs, pick.slice(7)])];
    setState(engine, { on: true, pick, blocks: pick === 'blocks' ? ownedBlocks(engine) : [] });
  }
  demoStep = '';
  if (param(engine, 'radiodemo') === 'sheet' || param(engine, 'radiosheet') === '1') setTimeout(() => openSheet(engine), 500);
}

/** &radiodemo=visit: another player's home street from a made-up save, its radio playing Alakol. */
function visitDemo(engine) {
  const owner = { id: 4242, name: 'Pip' };
  const view = {
    owner,
    home: { style: 'meadow' },
    homes: { cult: { radioOut: true, radioRx: 520, radio: { on: true, pick: 'region:76' } }, streetStyle: 'meadow' },
  };
  const built = visitorHomeScene(engine, view, 'street', { returnLabel: engine.street?.label || '' });
  const tsid = visitSceneTsid(owner.id, 'street');
  engine.enterScene({
    tsid,
    label: homeStreetName(owner.name),
    hubName: 'Homes',
    width: built.width,
    height: built.height,
    background: built.background,
    platforms: built.platforms,
    walls: [],
    spawn: { x: built.spawnX, y: built.groundY },
    returnTo: { tsid: engine.streetTsid, x: Math.round(engine.player?.x || 0), y: Math.round(engine.player?.y || 0) },
    musicFile: 'HOME_STREET_GRODDLE_WHISTLE',
    homeRadio: { owner: owner.name, ownerId: String(owner.id), state: normalizeRadioState(view.homes.cult.radio) },
  });
  const spots = built.populate(engine);
  radioFeature.homeRadioVisit({ owner: owner.id, name: owner.name, room: 'street', radio: spots?.radio || null }, engine);
  last = 'demo:visit';
}

/* ------------------------------------------------------------------ feature */

export const radioFeature = {
  id: RADIO_FEATURE_ID,

  init(engine) {
    const mode = param(engine, 'radiodemo');
    demoOwned = Boolean(mode);
    demoStep = mode && mode !== 'owned' ? mode : '';
  },

  onStreetClear(engine) {
    clear(engine);
    preview = null;
    if (sheet && !sheet.hidden) closeSheet(engine);
  },

  onTick(dtMs, t, engine) {
    if (!engine.started || !engine.player) return;
    demo(engine);
    sync(engine);
    tickNotes(engine, Boolean(radio?.shown));
  },

  /** game.js setAmbientForStreet: the radio's playlist on its home street, else null. */
  streetMusicOverride(street, engine) {
    const list = playlistFor(engine, radioHere(engine, street));
    return list ? { key: list.key, tracks: list.tracks, loop: list.loop, gapSec: list.gapSec, start: 0 } : null;
  },

  /** game.js noteMusicHeard: a downloads-page track the game played; one the radio needs hearing for counts. */
  musicHeard(url, engine) {
    const id = heardTrackId(config(), url);
    if (!id || memory.heard.includes(id)) return null;
    const track = radioUnlocks({ config: config() }).tracks.find((r) => r.id === id);
    if (!track?.played) return null;
    memory.heard = [...memory.heard, id];
    engine?.save?.();
    return null;
  },

  /** hubs_visited:<hub> (js/exploration.js): a region visited opens its music. */
  onEvent(counter, amount, engine) {
    const m = /^hubs_visited:(\d+)$/.exec(String(counter || ''));
    if (!m || memory.hubs.includes(m[1])) return;
    memory.hubs = [...memory.hubs, m[1]];
  },

  /** neighbours-mp-feature: a visited home street was set up (its radio's spot, or null). */
  homeRadioVisit(info, engine) {
    const tsid = engine.streetTsid;
    if (optedOut && optedOut !== tsid) optedOut = '';
    visit = info?.radio ? { tsid, owner: info.owner, name: info.name, x: Math.round(info.radio.x), y: Math.round(info.radio.y) } : null;
    clear(engine);
    sync(engine, true);
    const list = visit ? radioList(engine, radioHere(engine)) : null;
    if (list && !info.quiet && announced !== tsid) {
      announced = tsid;
      engine.pushActivity?.(`${possessive(info.name)} radio is playing ${list.label}.`);
    }
    return null;
  },

  /** homes-feature: put out or away, look again now. */
  vineRadioSync(engine) {
    sync(engine, true);
    engine.refreshStreetMusic?.();
    return true;
  },

  /** homes-feature ownsRadio: QA's &radiodemo owns it without the quest. */
  vineRadioOwned(engine) {
    return demoOwned || radioOwned(engine?.questState) ? true : null;
  },

  verbsFor(target, engine) {
    if (!radio || radio.target !== target) return null;
    return radio.mode === 'own' ? ownerVerbs(engine) : visitorVerbs(engine);
  },

  runVerb(target, verbId, engine) {
    if (!radio || radio.target !== target) return false;
    return runRadioVerb(engine, verbId);
  },

  save() {
    return { hubs: [...memory.hubs], heard: [...memory.heard] };
  },

  restore(slice) {
    const s = slice && typeof slice === 'object' ? slice : {};
    memory = {
      hubs: [...new Set((Array.isArray(s.hubs) ? s.hubs : []).map(String).filter((h) => /^\d+$/.test(h)))],
      heard: [...new Set((Array.isArray(s.heard) ? s.heard : []).map(String).filter((h) => /^[A-Za-z0-9_.-]+$/.test(h)))],
    };
  },

  /** QA / tests. */
  _state: () => ({ memory, radio: radio ? { mode: radio.mode, x: radio.x, y: radio.y, label: radio.shown } : null, visit, optedOut, preview, last, sheetTab, sheetPick }),
  _openSheet: (engine) => openSheet(engine),
  _applyPick: (engine, pick) => applyPick(engine, pick),
  _verb: (engine, id) => runRadioVerb(engine, id),
};
