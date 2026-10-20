/**
 * Party Spaces feature: Party Packs from the Toy Vendor open a timed private
 * party space (rules and source notes in js/party-spaces.js).
 *
 * - Pack Activate (first use shows the PARTY SPACE ASSEMBLY INSTRUCTIONS)
 *   consumes the pack, starts the party clock and opens a single-use
 *   teleporter 100 px to your right (1 s, then the 0.5 s appear, then the
 *   portal for 2 minutes). Walk into it, or click it, to enter.
 * - Inside: the template's imported street with its physics block, its
 *   archived goods on respawning spawners, tools, rocks and quoins, the Party
 *   ATM (extend the clock), party music, confetti and lights, and a few
 *   friends dancing (remake ambience: parties were multiplayer).
 * - signpost_1 is the instance exit: it points back to the street you came
 *   from and lands on the saved spot. Map travel is frozen inside; a reload
 *   resumes inside while the party lives, else on the saved street.
 * - The space warns at 5 minutes left and sends you home when it expires.
 *   Missed the teleporter? The Map's Party card makes a new one for the
 *   teleport cost (or 40% of max energy), like the source party chat prompt.
 *
 * QA: ?autostart=1&fresh=1&resetgame=1&questoffer=off&partydemo=<theme>
 * (moon|mazzala|rainbow|pitchen|nylon|val_holla|aquarius|glitchmas) enters
 * the space directly; add &partyautoplay=1 for the full loop from the pack
 * (activate, portal, pick up, ATM extend, guest, booster, Leave party) or
 * =hold to stop inside after the activities, =instructions to stop on the
 * first-use instructions, =portal to stop beside the open teleporter, =atm
 * to stop on the Party ATM's offer. &partytaster=1 uses the taster
 * pack; &partyexpire=<seconds> shortens the clock after entry.
 * Canvas data: partyStatus, partyTemplate, partyRemaining, partyInside,
 * partyReturn, partyStacks, partyAtm, partyGuests, partyPhysics, partyBoost,
 * partyAmbience, partyMusic, partyLast, partyDemo, partyTeleporter.
 */

import { addItem, countItem, ensureItem, removeItem, ITEM_CATALOG, itemIcon } from '../inventory.js?v=catalog-unified-3';
import { teleportEnergyCost } from '../teleportation.js';
import {
  PARTY_GUESTS,
  PARTY_PACKS,
  PARTY_SPACES,
  PARTY_TELEPORTER_APPEAR_MS,
  PARTY_TELEPORTER_PORTAL_MS,
  PARTY_TEXT,
  createPartyTeleporter,
  extendParty,
  formatPartyClock,
  isPartyPack,
  normalizePartyRecord,
  partyAlive,
  partyArrival,
  partyEcologyEntry,
  partyExitSignpost,
  partyExtendOptions,
  partyGuestLine,
  partyPackInfo,
  partyPhysics,
  partyRejoinEnergyCost,
  partyRemainingMs,
  partySpaceForStreet,
  partyStackGroups,
  partyWarningDue,
  stackAvailable,
  startParty,
  teleporterPhase,
} from '../party-spaces.js';

export const PARTY_FEATURE_ID = 'party-spaces';
const HOLD = 'party';
const ART = 'assets/sprites/parties/';
const PORTAL_COLS = 5;
const PORTAL_ROWS = 3;
const PORTAL_W = 143;
const PORTAL_H = 303;
const PORTAL_SCALE = 0.62;
const GUEST_SCALE = 1.35 * 0.4;
const DATA_MS = 250;
const LIVELY_MUSIC = 'PARTY_LIVELY';
const DEFAULT_STREET = { tsid: 'GA5101HF7F429V5', x: 900, y: 900 };
const DEMO_SLUGS = Object.freeze({
  moon: 'toxic_moon',
  mazzala: 'mazzala_gala',
  rainbow: 'double_rainbow',
  pitchen: 'pitchen_lilliputt',
  nylon: 'nylon_phool',
  val_holla: 'val_holla',
  aquarius: 'aquarius',
  glitchmas: 'winter_wingding',
});

let record = normalizePartyRecord({});
let engineRef = null;
let allowEnter = false;
let simMs = 0;
let lastData = 0;
let last = '';
let portalFrames = null;
let disappearFrames = null;

// Live world (rebuilt on every street entry)
let stacks = []; // { group, target, sprite, badge, takenAt: [] }
let atm = null; // { target, sprite, screen }
let guests = []; // { target, sprite, label, baseY, t, nextLine }
let booster = null; // { sprite, x, y, w, h, cooldownUntil }
let boostUntil = 0;
let overlay = null; // { root, bits, bulbs, kind, palette, t }
let teleporter = null; // { target, sprite, phase, gone }
let hud = null;
let modal = null;
let demo = null; // { stage, at, mode }

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

const party = () => record.party;
const space = () => (party() ? PARTY_SPACES[party().template] : null);
const onPartyStreet = (engine) => Boolean(partySpaceForStreet(engine.streetTsid));
const label = (classTsid) => ITEM_CATALOG[classTsid]?.label || String(classTsid).replace(/_/g, ' ');

function insideLiveParty(engine) {
  const p = party();
  return Boolean(p && partyAlive(p) && p.inside && space()?.streetTsid === engine.streetTsid);
}

function ensurePackItems() {
  for (const pack of Object.values(PARTY_PACKS)) {
    const extra = partyPackInfo(pack.classTsid).join(' ');
    ensureItem(pack.classTsid, {
      label: pack.label,
      desc: `${pack.desc} ${extra}`.trim(),
      baseCost: pack.baseCost,
      stackMax: 1,
      icon: itemIcon(pack.classTsid),
    });
  }
}

function sheetFrames(PIXI, url) {
  const base = PIXI.BaseTexture.from(url);
  const frames = [];
  for (let r = 0; r < PORTAL_ROWS; r += 1) {
    for (let c = 0; c < PORTAL_COLS; c += 1) {
      frames.push(new PIXI.Texture(base, new PIXI.Rectangle(c * PORTAL_W, r * PORTAL_H, PORTAL_W, PORTAL_H)));
    }
  }
  return frames;
}

function el(tag, attrs = {}, html = '') {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === true) node.setAttribute(k, '');
    else if (v !== false && v != null) node.setAttribute(k, String(v));
  }
  if (html) node.innerHTML = html;
  return node;
}

function energyMax(engine) {
  return Math.max(100, Number(engine.pc?.energyMax) || 100);
}

function rejoinCost(engine) {
  return partyRejoinEnergyCost(teleportEnergyCost(engine.learnedSkills || [], energyMax(engine)), energyMax(engine));
}

function note(engine, text) {
  last = text;
  engine.setData('partyLast', text);
}

/* ------------------------------------------------------------------ */
/* Chrome: HUD pill, ATM / instructions modal, Map card                */
/* ------------------------------------------------------------------ */

const STYLE = `
.party-hud { position: absolute; z-index: 54; top: 52px; left: 50%; transform: translateX(-50%);
  display: flex; align-items: center; gap: 8px; padding: 4px 6px 4px 8px; border-radius: 999px;
  color: #3b2410; background: rgba(255,248,222,.95); box-shadow: 0 4px 16px rgba(0,0,0,.35), inset 0 0 0 2px #f2c94c;
  font-weight: 800; font-size: .86rem; white-space: nowrap; max-width: calc(100% - 32px); }
.party-hud[hidden] { display: none; }
.party-hud img { width: 34px; height: auto; }
.party-hud b { overflow: hidden; text-overflow: ellipsis; }
.party-hud [data-party-clock] { font-variant-numeric: tabular-nums; padding: 1px 8px; border-radius: 999px; background: #3b2410; color: #ffe27a; }
.party-hud [data-party-clock].is-late { background: #b5361c; color: #fff; }
.party-hud button { border: 0; border-radius: 999px; padding: 4px 10px; font: inherit; font-size: .78rem; cursor: pointer;
  color: #fff; background: #7a4bd6; }
.party-modal-options { display: flex; flex-direction: column; align-items: center; gap: 6px; }
.party-modal-scroll { max-height: min(210px, 34vh); overflow-y: auto; margin: 0 0 6px; padding-right: 4px; }
.party-modal-list { text-align: left; font-size: .86rem; line-height: 1.35; margin: 0 0 8px; padding-left: 1.1em; }
.party-modal-list li { margin: 0 0 6px; }
.party-modal-small { text-align: left; font-size: .72rem; line-height: 1.3; color: #6b5a3a; margin: 0 0 10px; }
.party-map-card { display: flex; align-items: center; gap: 10px; margin: 0 0 10px; padding: 8px 10px; border-radius: 12px;
  background: linear-gradient(120deg, #fff6d6, #f7e3ff); box-shadow: inset 0 0 0 2px #e6c86e; color: #3b2410; }
.party-map-card img { width: 44px; height: auto; }
.party-map-card div { flex: 1; min-width: 0; display: grid; gap: 2px; }
.party-map-card span { font-size: .8rem; color: #6b5a3a; }
.party-map-card button { border: 0; border-radius: 999px; padding: 6px 12px; font-weight: 800; cursor: pointer; color: #fff; background: #7a4bd6; }
.party-map-card button:disabled { opacity: .5; cursor: default; }
@media (max-width: 520px) { .party-hud { top: 48px; font-size: .78rem; } .party-hud img { width: 26px; } }
`;

function buildChrome(engine) {
  if (hud || typeof document === 'undefined') return;
  if (!document.getElementById('party-feature-style')) {
    const style = el('style', { id: 'party-feature-style' });
    style.textContent = STYLE;
    document.head.appendChild(style);
  }
  const host = document.getElementById('hog-haul-hud')?.parentElement || document.body;
  const bar = el('section', { id: 'party-hud', class: 'party-hud', hidden: true, 'aria-live': 'polite' }, `
    <img alt="" data-party-icon />
    <b data-party-name></b>
    <span data-party-clock></span>
    <button type="button" data-party-leave>Leave party</button>`);
  host.appendChild(bar);
  bar.querySelector('[data-party-leave]').addEventListener('click', () => leaveParty(engine));
  hud = { bar };
}

function renderHud(engine) {
  if (!hud) return;
  const p = party();
  const show = insideLiveParty(engine);
  hud.bar.hidden = !show;
  if (!show) return;
  const s = space();
  hud.bar.querySelector('[data-party-icon]').src = itemIcon(p.packClass || `party_pack_${DEMO_SLUGS[p.template]}`);
  hud.bar.querySelector('[data-party-name]').textContent = s.label;
  const left = partyRemainingMs(p);
  const clock = hud.bar.querySelector('[data-party-clock]');
  clock.textContent = formatPartyClock(left);
  clock.classList.toggle('is-late', left <= 5 * 60 * 1000);
}

function ensureModal() {
  if (modal?.el?.isConnected) return modal;
  const host = document.getElementById('quest-dialogue')?.parentNode || document.body;
  const node = el('div', { id: 'party-modal', class: 'quest-dialogue glitch-modal', hidden: true, role: 'dialog', 'aria-modal': 'true' }, `
    <div class="quest-dialogue-shade"></div>
    <div class="quest-dialogue-card" style="background:linear-gradient(160deg,#fffdf4,#f3ead2);box-shadow:0 22px 70px rgba(0,0,0,.42),inset 0 0 0 1px #d9c48f">
      <img data-party-modal-art alt="" style="height:56px;margin:-4px auto 2px;display:block" />
      <p class="mr-kicker" data-party-modal-kicker></p>
      <div data-party-modal-body></div>
      <p data-party-modal-copy class="quest-dialogue-copy" style="min-height:0;margin-bottom:.7rem"></p>
      <div data-party-modal-buttons class="party-modal-options"></div>
    </div>`);
  host.appendChild(node);
  modal = { el: node, open: false, kind: '' };
  return modal;
}

function showModal(engine, { kind, art, kicker, body = '', copy = '', buttons = [] }) {
  const m = ensureModal();
  m.kind = kind;
  m.el.querySelector('[data-party-modal-art]').src = art;
  m.el.querySelector('[data-party-modal-kicker]').textContent = kicker;
  m.el.querySelector('[data-party-modal-body]').innerHTML = body;
  m.el.querySelector('[data-party-modal-copy]').textContent = copy;
  const box = m.el.querySelector('[data-party-modal-buttons]');
  box.innerHTML = '';
  for (const b of buttons) {
    const btn = el('button', { type: 'button', class: b.cancel ? 'quest-dialogue-cancel' : 'btn-glitch-primary', 'data-party-choice': b.id });
    btn.textContent = b.label;
    if (b.disabled) btn.disabled = true;
    btn.addEventListener('click', () => b.run());
    box.appendChild(btn);
  }
  m.el.hidden = false;
  m.open = true;
  engine.setData('partyModal', kind);
}

function closeModal(engine) {
  if (!modal) return;
  modal.el.hidden = true;
  modal.open = false;
  modal.kind = '';
  engine?.setData('partyModal', 'closed');
}

function buildMapCard(engine) {
  const p = party();
  if (!p || !partyAlive(p) || insideLiveParty(engine)) return null;
  buildChrome(engine);
  const s = space();
  const card = el('section', { class: 'party-map-card', 'data-party-card': '1' });
  const icon = el('img', { alt: '', src: itemIcon(p.packClass || `party_pack_${DEMO_SLUGS[p.template]}`) });
  const text = el('div');
  const title = el('strong');
  title.textContent = `Party Space: ${s.label}`;
  const sub = el('span');
  const tpUp = p.teleporter && teleporterPhase(p.teleporter) !== 'gone';
  const cost = rejoinCost(engine);
  sub.textContent = `${formatPartyClock(partyRemainingMs(p))} left · ${tpUp ? 'your teleporter is open' : `a teleporter costs ${cost} energy`}`;
  text.append(title, sub);
  const go = el('button', { type: 'button' });
  go.textContent = tpUp ? 'Open' : 'Join party';
  const blocked = engine.transientInstance() || engine.homeContext?.().inHome;
  go.disabled = Boolean(tpUp || blocked);
  if (blocked) go.title = "You can't make a party teleporter from here.";
  go.addEventListener('click', () => {
    engine.closeMap();
    rejoin(engine);
  });
  card.append(icon, text, go);
  return card;
}

/* ------------------------------------------------------------------ */
/* Activation and the teleporter                                      */
/* ------------------------------------------------------------------ */

function activationBlock(engine, classTsid) {
  const p = party();
  if (p && partyAlive(p)) return PARTY_TEXT.alreadyGoing;
  if (engine.transientInstance() || engine.homeContext?.().inHome || onPartyStreet(engine)) {
    return "You can't start a party from here.";
  }
  const target = PARTY_SPACES[PARTY_PACKS[classTsid]?.template];
  if (!target || !engine.streetExists(target.streetTsid)) return 'That party space is not here yet.';
  allowEnter = true;
  const gate = engine.travelGate(target.streetTsid);
  allowEnter = false;
  if (gate && gate.ok === false) return gate.msg || "You can't start a party right now.";
  return '';
}

function instructionsBody() {
  return `<div class="party-modal-scroll"><ol class="party-modal-list">${PARTY_TEXT.instructions.map((line) => `<li>${line.replace(/^\d+\.\s*/, '')}</li>`).join('')}</ol>
    <p class="party-modal-small">SMALL PRINT:<br>${PARTY_TEXT.smallPrint.join('<br>')}</p></div>`;
}

function activatePack(engine, classTsid, { skipInstructions = false } = {}) {
  const block = activationBlock(engine, classTsid);
  if (block) {
    engine.toast(block);
    note(engine, block);
    return false;
  }
  if (!record.instructionsRead && !skipInstructions) {
    record.instructionsRead = true;
    engine.save();
    showModal(engine, {
      kind: 'instructions',
      art: itemIcon(classTsid),
      kicker: PARTY_TEXT.instructionsTitle,
      body: instructionsBody(),
      copy: PARTY_TEXT.permits,
      buttons: [
        { id: 'go', label: 'PARTY HARD', run: () => { closeModal(engine); activatePack(engine, classTsid, { skipInstructions: true }); } },
        { id: 'later', label: 'Not yet', cancel: true, run: () => closeModal(engine) },
      ],
    });
    return true;
  }
  record.instructionsRead = true;
  if (countItem(engine.inv, classTsid) < 1) return false;
  const res = startParty(party(), classTsid, { now: Date.now() });
  if (!res.ok) {
    engine.toast(res.error);
    return false;
  }
  removeItem(engine.inv, classTsid, 1);
  record.party = res.party;
  record.partiesThrown += 1;
  if (!record.themes.includes(res.party.template)) record.themes.push(res.party.template);
  resetSpaceWorld(engine, res.party.template);
  engine.toast(res.announce, 3600);
  engine.pushActivity(res.announce);
  note(engine, res.announce);
  engine.achievement(`party_space_started:${res.party.template}`, 1);
  openTeleporter(engine);
  engine.refreshPack();
  engine.save();
  publish(engine, true);
  return true;
}

/** A fresh instance: rocks, quoins and trees start over for every party. */
function resetSpaceWorld(engine, template) {
  const world = engine.streetWorld?.(PARTY_SPACES[template].streetTsid);
  if (!world) return;
  for (const key of Object.keys(world)) delete world[key];
}

function openTeleporter(engine) {
  const p = party();
  if (!p || !engine.player) return;
  p.teleporter = createPartyTeleporter({ tsid: engine.streetTsid, x: engine.player.x, y: engine.player.y, now: Date.now() });
  engine.playSound('TELEPORTER_VISIBLE_APPEAR', { volume: 0.6 });
  setTimeout(() => {
    if (party()?.teleporter) engine.playSound('TELEPORTER_VISIBLE_PORTAL', { volume: 0.6 });
  }, PARTY_TELEPORTER_APPEAR_MS);
  spawnTeleporter(engine);
}

function rejoin(engine) {
  const p = party();
  if (!p || !partyAlive(p)) {
    engine.toast(PARTY_TEXT.alreadyExpired);
    return false;
  }
  if (engine.transientInstance() || engine.homeContext?.().inHome) {
    engine.toast("You can't make a party teleporter from here.");
    return false;
  }
  const cost = rejoinCost(engine);
  if ((Number(engine.pc.energy) || 0) <= cost) {
    engine.toast(PARTY_TEXT.noEnergy);
    note(engine, PARTY_TEXT.noEnergy);
    return false;
  }
  engine.pc.energy -= cost;
  engine.updateHud();
  openTeleporter(engine);
  engine.save();
  return true;
}

function spawnTeleporter(engine) {
  const p = party();
  const tp = p?.teleporter;
  if (!tp || tp.tsid !== engine.streetTsid || teleporter) return;
  const { PIXI } = engine;
  portalFrames ||= sheetFrames(PIXI, `${ART}teleporter_visible_portal.png`);
  const sprite = new PIXI.AnimatedSprite(portalFrames);
  sprite.anchor.set(0.5, 0.94);
  sprite.scale.set(PORTAL_SCALE);
  sprite.animationSpeed = 0.3;
  sprite.x = tp.x;
  sprite.y = tp.y;
  sprite.zIndex = 21;
  sprite.alpha = 0;
  sprite.eventMode = 'static';
  sprite.cursor = 'pointer';
  sprite.play();
  engine.entityLayer.addChild(sprite);
  const target = engine.register({
    classId: 'teleporter_visible',
    featureId: PARTY_FEATURE_ID,
    label: 'Party Teleporter',
    subtitle: `To ${space().label}`,
    sprite,
  });
  teleporter = { target, sprite, phase: 'waiting', gone: 0 };
}

function despawnTeleporter(engine, { vanish = false } = {}) {
  if (!teleporter) return;
  const { sprite, target } = teleporter;
  teleporter = null;
  if (vanish && sprite && !sprite.destroyed) {
    const { PIXI } = engine;
    disappearFrames ||= sheetFrames(PIXI, `${ART}teleporter_visible_disappear.png`);
    const fx = new PIXI.AnimatedSprite(disappearFrames);
    fx.anchor.set(0.5, 0.94);
    fx.scale.set(PORTAL_SCALE);
    fx.x = sprite.x;
    fx.y = sprite.y;
    fx.zIndex = 21;
    fx.loop = false;
    fx.animationSpeed = 0.35;
    fx.onComplete = () => fx.destroy();
    fx.play();
    engine.entityLayer.addChild(fx);
  }
  engine.unregister(target);
}

function tickTeleporter(engine, now) {
  const tp = party()?.teleporter;
  if (!tp) {
    if (teleporter) despawnTeleporter(engine);
    return;
  }
  if (tp.tsid !== engine.streetTsid) return;
  if (!teleporter) spawnTeleporter(engine);
  if (!teleporter) return;
  const phase = teleporterPhase(tp, now);
  const { sprite } = teleporter;
  teleporter.phase = phase;
  if (phase === 'gone' || !partyAlive(party(), now)) {
    party().teleporter = null;
    engine.playSound('TELEPORTER_VISIBLE_DISAPPEARS', { volume: 0.5 });
    despawnTeleporter(engine, { vanish: true });
    engine.save();
    return;
  }
  if (phase === 'waiting') sprite.alpha = 0;
  else if (phase === 'appear') {
    const k = Math.min(1, (now - tp.createdAt - PARTY_TELEPORTER_APPEAR_MS) / PARTY_TELEPORTER_PORTAL_MS);
    sprite.alpha = k;
    sprite.scale.set(PORTAL_SCALE * (0.4 + 0.6 * k), PORTAL_SCALE);
  } else {
    sprite.alpha = 0.92 + Math.sin(now / 180) * 0.08;
    sprite.scale.set(PORTAL_SCALE);
    const p = engine.player;
    if (p && !engine.acting() && Math.abs(p.x - tp.x) < 34 && Math.abs(p.y - tp.y) < 120) useTeleporter(engine);
  }
}

function useTeleporter(engine) {
  const p = party();
  if (!p?.teleporter || teleporterPhase(p.teleporter) !== 'portal') return false;
  if (!partyAlive(p)) {
    engine.toast(PARTY_TEXT.alreadyExpired);
    return false;
  }
  p.teleporter = null;
  engine.playSound('TELEPORTER_VISIBLE_DISAPPEARS', { volume: 0.6 });
  despawnTeleporter(engine, { vanish: true });
  enterParty(engine);
  return true;
}

/* ------------------------------------------------------------------ */
/* Entering, leaving, expiry                                          */
/* ------------------------------------------------------------------ */

async function enterParty(engine) {
  const p = party();
  const s = space();
  if (!p || !s) return;
  if (!onPartyStreet(engine)) {
    p.returnTo = {
      tsid: engine.streetTsid,
      label: engine.street?.label || '',
      x: Math.round(engine.player.x),
      y: Math.round(engine.player.y),
    };
  }
  p.inside = true;
  engine.instanceHold = HOLD;
  engine.save();
  const arrive = partyArrival(p.template);
  await engine.enter(s.streetTsid, { spawnX: arrive.x, spawnY: arrive.y, bypassFeatureGates: true });
}

async function leaveParty(engine, { reason = '' } = {}) {
  const p = party();
  const back = p?.returnTo || DEFAULT_STREET;
  if (p) p.inside = false;
  engine.instanceHold = null;
  closeModal(engine);
  engine.save();
  if (reason) note(engine, reason);
  if (onPartyStreet(engine)) {
    await engine.enter(back.tsid, { spawnX: back.x, spawnY: back.y, bypassFeatureGates: true });
  }
  publish(engine, true);
}

function expire(engine) {
  const inside = insideLiveParty(engine) || (party()?.inside && onPartyStreet(engine));
  const back = party()?.returnTo || DEFAULT_STREET;
  engine.toast(PARTY_TEXT.expired, 4200);
  engine.pushActivity(PARTY_TEXT.expired);
  note(engine, PARTY_TEXT.expired);
  record.party = null;
  if (teleporter) despawnTeleporter(engine, { vanish: true });
  engine.save();
  if (inside || onPartyStreet(engine)) {
    engine.instanceHold = null;
    closeModal(engine);
    engine.enter(back.tsid, { spawnX: back.x, spawnY: back.y, bypassFeatureGates: true });
  }
}

function tickClock(engine, now) {
  const p = party();
  if (!p) return;
  if (!partyAlive(p, now)) {
    expire(engine);
    return;
  }
  if (partyWarningDue(p, now)) {
    p.warned = true;
    engine.toast(PARTY_TEXT.warning, 4200);
    engine.pushActivity(PARTY_TEXT.warning);
    note(engine, PARTY_TEXT.warning);
    engine.save();
  }
}

/* ------------------------------------------------------------------ */
/* The space: stacks, ATM, guests, booster, ambience                   */
/* ------------------------------------------------------------------ */

function setupSpace(street, engine) {
  const p = party();
  const s = space();
  const { PIXI } = engine;
  engine.instanceHold = HOLD;
  simMs = 0;
  boostUntil = 0;
  const arrive = partyArrival(p.template);
  // Keep provisions off the doorways (Mazza'la Gala's rooms) so a click on a
  // stack never opens the door instead.
  const doors = street.doors || [];
  const clearOfDoors = (pt) => !doors.some((d) => Math.abs(d.x - pt.x) < 110 && Math.abs(d.y - pt.y) < 160);
  const points = [...engine.placement('partySpots')]
    .filter(clearOfDoors)
    .sort((a, b) => Math.hypot(a.x - arrive.x, a.y - arrive.y) - Math.hypot(b.x - arrive.x, b.y - arrive.y));
  const take = () => points.shift() || { x: arrive.x + (Math.random() - 0.5) * 300, y: arrive.y };
  // The ATM and the dancing friends greet you on the arrival floor (the
  // source marker_teleport spots are lost); the planner places the rest.
  const dir = arrive.x < (s.bounds.r - s.bounds.l) / 2 ? 1 : -1;
  const near = (dx) => {
    const pt = groundNear(engine, arrive.x + dir * dx, arrive.y);
    return pt && clearOfDoors(pt) ? pt : null;
  };
  spawnAtm(engine, near(210) || take());
  const guestPoints = [near(340) || take(), near(420) || take(), near(500) || take()];
  if (s.event) {
    const far = points.length > 3 ? points.splice(Math.floor(points.length / 3), 1)[0] : take();
    spawnBooster(engine, far);
  }
  for (const group of partyStackGroups(p.template)) spawnStack(engine, group, take());
  PARTY_GUESTS.forEach((g, i) => spawnGuest(engine, g, guestPoints[i], i));
  buildOverlay(engine, s);
  engine.playSound('LONELINESS_FIREWORKS', { volume: 0.45 });
  engine.pushActivity(`Welcome to ${s.label}! ${s.desc}`);
  const expireParam = Number(engine.param('partyexpire'));
  if (expireParam > 0 && demo && !demo.expireSet) {
    demo.expireSet = true;
    p.expiresAt = Date.now() + expireParam * 1000;
    p.warned = false;
  }
  void PIXI;
}

/** A walkable floor point at x within reach of y (screen space), or null. */
function groundNear(engine, x, y) {
  let best = null;
  for (const p of engine.platforms || []) {
    if (Number(p.pc_perm) === 0 || p.hidden) continue;
    const lo = Math.min(p.x1, p.x2) + 20;
    const hi = Math.max(p.x1, p.x2) - 20;
    if (x < lo || x > hi) continue;
    const t = p.x2 === p.x1 ? 0 : (x - p.x1) / (p.x2 - p.x1);
    const py = p.y1 + t * (p.y2 - p.y1);
    if (py < y - 90 || py > y + 120) continue;
    if (!best || Math.abs(py - y) < Math.abs(best.y - y)) best = { x, y: py };
  }
  return best;
}

function spawnAtm(engine, point) {
  const { PIXI } = engine;
  const sprite = new PIXI.Container();
  const art = PIXI.Sprite.from(`${ART}party_atm.png`);
  art.anchor.set(0.5, 1);
  art.scale.set(0.9);
  const screen = new PIXI.Text('', { fontFamily: 'Courier New, monospace', fontSize: 13, fontWeight: '700', fill: 0x8dff8d });
  screen.anchor.set(0.5, 0.5);
  screen.y = -112;
  sprite.addChild(art, screen);
  sprite.x = point.x;
  sprite.y = point.y + 2;
  sprite.zIndex = 19;
  sprite.eventMode = 'static';
  sprite.cursor = 'pointer';
  engine.entityLayer.addChild(sprite);
  const target = engine.register({
    classId: 'party_atm',
    featureId: PARTY_FEATURE_ID,
    label: PARTY_TEXT.atmLabel,
    subtitle: PARTY_TEXT.atmDesc,
    sprite,
  });
  atm = { target, sprite, screen };
}

function spawnStack(engine, group, point) {
  const { PIXI } = engine;
  const sprite = new PIXI.Container();
  const icon = PIXI.Sprite.from(itemIcon(group.classTsid));
  icon.anchor.set(0.5, 1);
  icon.scale.set(0.85);
  const badge = new PIXI.Text('', { fontFamily: 'Arial', fontSize: 12, fontWeight: '800', fill: 0xffffff, stroke: 0x3b2410, strokeThickness: 3 });
  badge.anchor.set(0, 1);
  badge.x = 12;
  badge.y = -2;
  sprite.addChild(icon, badge);
  sprite.x = point.x;
  sprite.y = point.y + 2;
  sprite.zIndex = 18;
  sprite.eventMode = 'static';
  sprite.cursor = 'pointer';
  engine.entityLayer.addChild(sprite);
  const target = engine.register({
    classId: 'party_stack',
    featureId: PARTY_FEATURE_ID,
    label: label(group.classTsid),
    subtitle: group.respawns ? 'Party provisions (they keep coming)' : 'Party provisions',
    sprite,
    state: { classTsid: group.classTsid },
  });
  const row = { group, target, sprite, icon, badge, takenAt: [] };
  stacks.push(row);
  refreshStack(row, Date.now());
}

function stackCount(row, now) {
  return stackAvailable(row.group, row.takenAt, now, party()?.taken?.[row.group.classTsid] || 0);
}

function refreshStack(row, now) {
  const n = stackCount(row, now);
  row.icon.alpha = n > 0 ? 1 : 0.22;
  row.badge.text = n > 1 ? `x${n}` : '';
  row.target.subtitle = n > 0
    ? (row.group.respawns ? 'Party provisions (they keep coming)' : 'Party provisions')
    : row.group.respawns ? 'More on the way…' : 'All gone';
}

function pickUp(engine, row) {
  const now = Date.now();
  if (stackCount(row, now) < 1) {
    engine.say(row.target, row.group.respawns ? 'More on the way…' : 'All gone.', 2200);
    return;
  }
  addItem(engine.inv, row.group.classTsid, 1);
  if (row.group.respawns) row.takenAt.push(now);
  else {
    const p = party();
    p.taken[row.group.classTsid] = (p.taken[row.group.classTsid] || 0) + 1;
  }
  engine.playSound('ITEM_PICKUP', { volume: 0.5 });
  engine.floatText(row.sprite.x, row.sprite.y - 40, `+1 ${label(row.group.classTsid)}`, 0xfff1a8);
  engine.pushActivity(`You picked up a ${label(row.group.classTsid)}.`);
  engine.achievement(`party_space_pickup:${row.group.classTsid}`, 1);
  refreshStack(row, now);
  engine.refreshPack();
  engine.save();
  note(engine, `pickup:${row.group.classTsid}`);
}

function spawnGuest(engine, guest, point, index) {
  const { PIXI } = engine;
  const frames = engine.textures?.avatarStyledWalk?.frames || [];
  if (!frames.length || !point) return;
  const sprite = new PIXI.AnimatedSprite(frames);
  sprite.anchor.set(0.5, 1);
  sprite.animationSpeed = 0.16 + index * 0.02;
  sprite.scale.set(GUEST_SCALE);
  sprite.tint = guest.tint;
  sprite.x = point.x;
  sprite.y = point.y + 2;
  sprite.zIndex = 30;
  sprite.eventMode = 'static';
  sprite.cursor = 'pointer';
  sprite.play();
  engine.entityLayer.addChild(sprite);
  const name = new PIXI.Text(guest.name, { fontFamily: 'Arial', fontSize: 12, fontWeight: '700', fill: 0xffffff, stroke: 0x2a1d14, strokeThickness: 3 });
  name.anchor.set(0.5, 1);
  name.zIndex = 31;
  engine.entityLayer.addChild(name);
  const target = engine.register({
    classId: 'party_guest',
    featureId: PARTY_FEATURE_ID,
    label: guest.name,
    subtitle: 'Party guest',
    sprite,
  });
  guests.push({ target, sprite, name, baseY: sprite.y, t: index * 1.3, nextLine: Date.now() + 5000 + index * 4200, line: index });
}

function tickGuests(engine, dtMs, now) {
  for (const g of guests) {
    if (g.sprite.destroyed) continue;
    g.t += dtMs / 1000;
    const beat = g.t * 4.2;
    const hop = Math.max(0, Math.sin(beat)) * (Math.floor(g.t / 2.4) % 3 === 0 ? 14 : 5);
    g.sprite.y = g.baseY - hop;
    const flip = Math.floor(g.t / 0.9) % 2 === 0 ? 1 : -1;
    g.sprite.scale.set(GUEST_SCALE * flip, GUEST_SCALE);
    g.name.x = g.sprite.x;
    g.name.y = g.sprite.y - g.sprite.height - 4;
    // engine.busy() is always true inside the instance hold.
    if (now >= g.nextLine && !engine.acting() && !engine.questDialogueOpen() && !modal?.open) {
      g.nextLine = now + 14000 + Math.random() * 9000;
      g.line += 3;
      engine.say(g.target, partyGuestLine(g.line), 3200);
    }
  }
}

function spawnBooster(engine, point) {
  if (!point) return;
  const { PIXI } = engine;
  const pad = new PIXI.Graphics();
  const s = space();
  const color = s.palette[0];
  pad.beginFill(0x2b2b44, 0.85).drawRoundedRect(-34, -8, 68, 10, 5).endFill();
  pad.beginFill(color, 1).drawRoundedRect(-28, -12, 56, 6, 3).endFill();
  for (let i = -1; i <= 1; i += 1) {
    pad.beginFill(0xffffff, 0.85).drawPolygon([i * 16 - 6, -16, i * 16 + 6, -16, i * 16, -26]).endFill();
  }
  pad.x = point.x;
  pad.y = point.y + 2;
  pad.zIndex = 17;
  pad.eventMode = 'none';
  engine.entityLayer.addChild(pad);
  booster = { sprite: pad, x: point.x, y: point.y, w: 70, h: 40, cooldownUntil: 0 };
}

function tickBooster(engine) {
  if (!booster || !engine.player) return;
  const p = engine.player;
  const pulse = 0.75 + Math.sin(simMs / 160) * 0.25;
  booster.sprite.alpha = simMs < boostUntil ? 1 : pulse;
  if (simMs < booster.cooldownUntil) return;
  if (Math.abs(p.x - booster.x) <= booster.w / 2 && p.y <= booster.y + 6 && p.y >= booster.y - booster.h) {
    fireBooster(engine);
  }
}

function fireBooster(engine) {
  const ev = space()?.event;
  if (!ev) return;
  boostUntil = simMs + ev.durationMs;
  if (booster) booster.cooldownUntil = simMs + ev.durationMs + 600;
  engine.playSound('SPINACHJUMP', { volume: 0.55 });
  note(engine, `event:${ev.id}`);
  engine.achievement(`party_space_event:${ev.id}`, 1);
}

/* Screen-space festive layer: confetti, bubbles, snow or sparkles + lights. */
function buildOverlay(engine, s) {
  const stage = engine.stage;
  if (!stage) return;
  const { PIXI } = engine;
  const root = new PIXI.Container();
  root.eventMode = 'none';
  const cam = engine.camera;
  const W = cam.w;
  const H = cam.h;
  const kind = s.ambience || 'confetti';
  const bits = [];
  const n = kind === 'snow' ? 70 : kind === 'sparkles' ? 46 : kind === 'bubbles' ? 38 : 64;
  for (let i = 0; i < n; i += 1) {
    const g = new PIXI.Graphics();
    const color = s.palette[i % s.palette.length];
    if (kind === 'bubbles') g.lineStyle(1.5, 0xffffff, 0.75).beginFill(color, 0.18).drawCircle(0, 0, 3 + (i % 5) * 1.6).endFill();
    else if (kind === 'snow') g.beginFill(0xffffff, 0.9).drawCircle(0, 0, 1.4 + (i % 4) * 0.8).endFill();
    else if (kind === 'sparkles') g.beginFill(color, 1).drawPolygon([0, -5, 1.4, -1.4, 5, 0, 1.4, 1.4, 0, 5, -1.4, 1.4, -5, 0, -1.4, -1.4]).endFill();
    else g.beginFill(color, 1).drawRect(-3, -1.6, 6, 3.2).endFill();
    g.x = Math.random() * W;
    g.y = Math.random() * H;
    root.addChild(g);
    bits.push({ g, vx: (Math.random() - 0.5) * 0.6, vy: kind === 'bubbles' ? -(0.4 + Math.random() * 0.8) : kind === 'sparkles' ? 0 : 0.5 + Math.random() * 1.1, spin: (Math.random() - 0.5) * 0.2, phase: Math.random() * 6.28 });
  }
  const bulbs = [];
  if (kind !== 'bubbles') {
    const wire = new PIXI.Graphics();
    const sag = 22;
    wire.lineStyle(2, 0x2a1d14, 0.7).moveTo(0, 4);
    for (let x = 0; x <= W; x += 24) wire.lineTo(x, 4 + sag * Math.sin((x / W) * Math.PI));
    root.addChild(wire);
    for (let i = 0; i < 18; i += 1) {
      const x = (i + 0.5) * (W / 18);
      const b = new PIXI.Graphics();
      b.beginFill(0xffffff, 1).drawEllipse(0, 0, 4, 6).endFill();
      b.x = x;
      b.y = 10 + sag * Math.sin((x / W) * Math.PI);
      root.addChild(b);
      bulbs.push(b);
    }
  }
  stage.addChild(root);
  overlay = { root, bits, bulbs, kind, palette: s.palette, t: 0, W, H };
  engine.setData('partyAmbience', kind);
}

function tickOverlay(dtMs) {
  if (!overlay || overlay.root.destroyed) return;
  const f = Math.min(3, dtMs / 16.67);
  overlay.t += dtMs / 1000;
  const { W, H } = overlay;
  for (const b of overlay.bits) {
    const g = b.g;
    if (overlay.kind === 'sparkles') {
      g.alpha = 0.25 + 0.75 * Math.abs(Math.sin(overlay.t * 1.7 + b.phase));
      g.rotation += b.spin * f;
      continue;
    }
    g.x += (b.vx + Math.sin(overlay.t * 1.3 + b.phase) * 0.35) * f;
    g.y += b.vy * f;
    g.rotation += b.spin * f;
    if (g.y > H + 8) { g.y = -8; g.x = Math.random() * W; }
    if (g.y < -10) { g.y = H + 6; g.x = Math.random() * W; }
    if (g.x < -8) g.x = W + 6;
    if (g.x > W + 8) g.x = -6;
  }
  overlay.bulbs.forEach((bulb, i) => {
    const step = Math.floor(overlay.t * 2.5) + i;
    bulb.tint = overlay.palette[step % overlay.palette.length];
    bulb.alpha = 0.7 + 0.3 * Math.sin(overlay.t * 3 + i);
  });
}

function destroyOverlay() {
  if (overlay?.root && !overlay.root.destroyed) {
    overlay.root.parent?.removeChild(overlay.root);
    overlay.root.destroy({ children: true });
  }
  overlay = null;
}

/* ------------------------------------------------------------------ */
/* Party ATM                                                          */
/* ------------------------------------------------------------------ */

function openAtm(engine) {
  const p = party();
  if (!p || !partyAlive(p)) {
    if (atm) engine.say(atm.target, PARTY_TEXT.atmTooLate, 3000);
    return;
  }
  const options = partyExtendOptions(p);
  showModal(engine, {
    kind: 'atm',
    art: `${ART}party_atm.png`,
    kicker: PARTY_TEXT.atmLabel,
    body: `<p style="margin:0 0 4px;font-weight:800">${formatPartyClock(partyRemainingMs(p))} left · you have ${Math.floor(Number(engine.pc.currants) || 0)}c</p>`,
    copy: PARTY_TEXT.atmQuestion,
    buttons: [
      ...options.map((o) => ({ id: String(o.minutes), label: o.label, run: () => chooseExtend(engine, o.minutes) })),
      { id: 'no', label: PARTY_TEXT.atmNo, cancel: true, run: () => closeModal(engine) },
    ],
  });
}

function chooseExtend(engine, minutes) {
  const p = party();
  const res = extendParty(p, minutes, engine.pc, { now: Date.now() });
  closeModal(engine);
  if (res.ok) {
    record.extensions += 1;
    engine.playSound('PURCHASE_ITEM', { volume: 0.55 });
    engine.toast(res.announce, 3200);
    engine.pushActivity(res.announce);
    engine.achievement(`party_space_extended:${p.template}`, minutes);
    engine.updateHud();
    engine.save();
  } else {
    engine.playSound('CLICK_FAILURE', { volume: 0.5 });
  }
  if (res.reply && atm) engine.say(atm.target, res.reply, 3200);
  note(engine, res.reply || 'atm');
  if (res.expired) expire(engine);
  return res;
}

/* ------------------------------------------------------------------ */
/* QA                                                                  */
/* ------------------------------------------------------------------ */

function publish(engine, force = false) {
  const now = Date.now();
  if (!force && now - lastData < DATA_MS) return;
  lastData = now;
  const p = party();
  const inside = insideLiveParty(engine);
  const status = !p ? 'idle' : inside ? 'inside' : p.teleporter ? 'teleporter' : 'waiting';
  engine.setData('partyStatus', status);
  engine.setData('partyTemplate', p?.template || '');
  engine.setData('partyRemaining', p ? String(Math.ceil(partyRemainingMs(p, now) / 1000)) : '0');
  engine.setData('partyInside', inside ? '1' : '0');
  engine.setData('partyReturn', p?.returnTo ? `${p.returnTo.tsid}@${p.returnTo.x},${p.returnTo.y}` : '');
  engine.setData('partyTeleporter', teleporter ? teleporter.phase : p?.teleporter ? 'elsewhere' : 'none');
  engine.setData('partyStacks', stacks.map((r) => `${r.group.classTsid}:${stackCount(r, now)}/${r.group.max}`).join(','));
  engine.setData('partyAtm', atm ? '1' : '0');
  engine.setData('partyGuests', String(guests.length));
  const phys = inside ? partyPhysics(engine.street?.physics?.setting || null) : null;
  engine.setData('partyPhysics', phys ? `speed=${phys.speed.toFixed(3)},jump=${phys.jump.toFixed(3)},gravity=${phys.gravity.toFixed(3)},jetpack=${phys.jetpack ? 1 : 0}` : inside ? 'normal' : '');
  engine.setData('partyBoost', simMs < boostUntil ? 'on' : booster ? 'ready' : 'none');
  engine.setData('partyMusic', inside ? String(engine.street?.musicFile || '') : '');
  engine.setData('partyThrown', String(record.partiesThrown));
  engine.setData('partyLast', last);
  engine.setData('partyDemo', demo ? demo.stage : '');
}

function packFor(template, taster) {
  const slug = DEMO_SLUGS[template];
  return slug ? `party_pack_${taster ? 'taster_' : ''}${slug}` : null;
}

function startDemo(engine) {
  const template = engine.param('partydemo');
  if (!PARTY_SPACES[template]) {
    demo = { stage: 'bad-template', at: 0 };
    return;
  }
  const classTsid = packFor(template, engine.param('partytaster') === '1');
  const mode = engine.param('partyautoplay') || '';
  record.party = null;
  engine.instanceHold = null;
  addItem(engine.inv, classTsid, 1);
  if ((Number(engine.pc.currants) || 0) < 40000) engine.pc.currants = 40000;
  engine.refreshPack();
  if (!mode) {
    record.instructionsRead = true;
    activatePack(engine, classTsid);
    demo = { stage: 'entering', at: 0, mode, classTsid };
    useTeleporterNow(engine);
    return;
  }
  record.instructionsRead = false;
  demo = { stage: 'activate', at: Date.now() + 900, mode, classTsid };
}

function useTeleporterNow(engine) {
  const tp = party()?.teleporter;
  if (!tp) return;
  tp.createdAt -= PARTY_TELEPORTER_APPEAR_MS + PARTY_TELEPORTER_PORTAL_MS;
  useTeleporter(engine);
}

function stepDemo(engine, now) {
  if (!demo || !demo.at || now < demo.at) return;
  const set = (stage, delay = 900) => {
    demo.stage = stage;
    demo.at = now + delay;
    publish(engine, true);
  };
  switch (demo.stage) {
    case 'activate':
      activatePack(engine, demo.classTsid);
      if (demo.mode === 'instructions') {
        demo.at = 0;
        demo.stage = 'instructions-hold';
        return undefined;
      }
      return set('instructions', 900);
    case 'instructions':
      modal?.el.querySelector('[data-party-choice="go"]')?.click();
      return set('portal', 2000);
    case 'portal': {
      const tp = party()?.teleporter;
      if (!tp || teleporterPhase(tp, now) !== 'portal') return set('portal', 400);
      if (demo.mode === 'portal') {
        demo.at = 0;
        demo.stage = 'portal-hold';
        return undefined;
      }
      engine.player.x = tp.x;
      engine.player.y = tp.y;
      return set('entering', 1500);
    }
    case 'entering':
      if (!insideLiveParty(engine) || !atm) return set('entering', 500);
      return set('pickup', 1500);
    case 'pickup': {
      const row = stacks.find((r) => stackCount(r, now) > 0);
      if (row) {
        engine.player.x = row.sprite.x;
        pickUp(engine, row);
      }
      return set('atm', 1200);
    }
    case 'atm':
      engine.player.x = atm.sprite.x + 40;
      openAtm(engine);
      if (demo.mode === 'atm') {
        demo.at = 0;
        demo.stage = 'atm-hold';
        return undefined;
      }
      return set('extend', 1200);
    case 'extend': {
      const first = partyExtendOptions(party())[0];
      if (first) chooseExtend(engine, first.minutes);
      return set('guest', 1200);
    }
    case 'guest':
      if (guests[0]) engine.say(guests[0].target, partyGuestLine(0), 3000);
      return set(space()?.event ? 'boost' : demo.mode === 'hold' ? 'hold' : 'leave', 1500);
    case 'boost':
      if (booster) {
        engine.player.x = booster.x;
        engine.player.y = booster.y;
        engine.player.vy = 0;
        engine.player.onGround = true;
      }
      fireBooster(engine);
      return set(demo.mode === 'hold' ? 'hold' : 'leave', 2200);
    case 'leave':
      leaveParty(engine);
      return set('returned', 1500);
    case 'returned':
    case 'returning':
      demo.stage = onPartyStreet(engine) ? 'returning' : 'done';
      demo.at = demo.stage === 'done' ? 0 : now + 500;
      publish(engine, true);
      return undefined;
    default:
      demo.at = 0;
  }
  return undefined;
}

/* ------------------------------------------------------------------ */
/* Feature                                                            */
/* ------------------------------------------------------------------ */

export const partySpacesFeature = {
  id: PARTY_FEATURE_ID,

  init(engine) {
    engineRef = engine;
    ensurePackItems();
  },

  save() {
    return record;
  },

  restore(slice) {
    record = normalizePartyRecord(slice || {});
  },

  /** Inside a live party a reload resumes there; otherwise on the saved street. */
  reloadLocation(saved) {
    if (!partySpaceForStreet(saved?.tsid)) return null;
    const p = party();
    if (p && partyAlive(p) && p.inside && PARTY_SPACES[p.template].streetTsid === saved.tsid) return null;
    const back = p?.returnTo || DEFAULT_STREET;
    if (p) p.inside = false;
    return { tsid: back.tsid, x: back.x, y: back.y };
  },

  ecologyOverride(street) {
    const s = partySpaceForStreet(street?.tsid);
    return s ? partyEcologyEntry(s.id) : null;
  },

  prepareStreet(street) {
    const s = partySpaceForStreet(street?.tsid);
    if (!s) return;
    street.hubName = 'Party Locations';
    street.hubId = street.hubId || '108';
    // Spaces with no music_file fell back to the hub's unmapped ambient.
    if (!street.musicFile) street.musicFile = LIVELY_MUSIC;
    const p = party();
    const exit = p && p.template === s.id ? partyExitSignpost(s.id, p.returnTo) : null;
    street.signposts = exit ? [exit] : [];
  },

  placementGroups(population, street) {
    const s = partySpaceForStreet(street?.tsid);
    if (!s) return [];
    const p = party();
    const groups = p && p.template === s.id ? partyStackGroups(s.id).length : 0;
    // Extra spots so the ones in doorways can be dropped.
    return [{ key: 'partySpots', count: groups + 1 + PARTY_GUESTS.length + (s.event ? 1 : 0) + (street.doors?.length || 0) * 2, clearance: 46 }];
  },

  onStreetEnter(street, engine) {
    buildChrome(engine);
    const s = partySpaceForStreet(street.tsid);
    const p = party();
    if (s) {
      if (!p || !partyAlive(p) || p.template !== s.id) {
        // Nobody's party lives here: back to the saved street.
        const back = p?.returnTo || DEFAULT_STREET;
        engine.instanceHold = null;
        setTimeout(() => engine.enter(back.tsid, { spawnX: back.x, spawnY: back.y, bypassFeatureGates: true }), 300);
        return;
      }
      p.inside = true;
      setupSpace(street, engine);
      if (demo && !demo.mode && demo.stage === 'entering') demo.stage = 'inside';
    } else {
      if (p?.inside) p.inside = false;
      if (engine.instanceHold === HOLD) engine.instanceHold = null;
      if (p?.teleporter) spawnTeleporter(engine);
      if (!demo && engine.param('partydemo') && engine.started) startDemo(engine);
    }
    publish(engine, true);
  },

  onStreetClear(engine) {
    stacks = [];
    atm = null;
    guests = [];
    booster = null;
    teleporter = null;
    destroyOverlay();
    closeModal(engine || engineRef);
  },

  travelGate(tsid, engine, meta = {}) {
    if (allowEnter || tsid === engine.streetTsid) return null;
    const target = partySpaceForStreet(tsid);
    if (target) return { ok: false, msg: 'Party spaces are private. Activate a Party Pack to throw a party.' };
    if (onPartyStreet(engine) && party()?.inside) {
      const back = party().returnTo;
      if (meta.via === 'signpost' && back && back.tsid === tsid) return null;
      return { ok: false, msg: 'This party has no map routes. Take the signpost or use Leave party.' };
    }
    return null;
  },

  physics(engine) {
    if (!insideLiveParty(engine)) return null;
    const setting = engine.street?.physics?.setting || null;
    const ev = space()?.event;
    const boosting = ev && simMs < boostUntil;
    if (!setting && !boosting) return null;
    // Both recovered event boxes (booster, waterjet) multiply gravity.
    return partyPhysics(setting || {}, boosting ? { gravity: ev.gravity } : null);
  },

  onTick(dtMs, now, engine) {
    if (demo === null && engine.started && engine.param('partydemo') && !onPartyStreet(engine)) startDemo(engine);
    simMs += dtMs;
    tickClock(engine, now);
    tickTeleporter(engine, now);
    if (insideLiveParty(engine)) {
      for (const row of stacks) refreshStack(row, now);
      if (atm) atm.screen.text = formatPartyClock(partyRemainingMs(party(), now));
      tickGuests(engine, dtMs, now);
      tickBooster(engine);
      tickOverlay(dtMs);
    }
    stepDemo(engine, now);
    renderHud(engine);
    publish(engine);
  },

  verbsFor(target, engine) {
    switch (target.classId) {
      case 'party_atm':
        return [{ id: 'extend', label: 'Extend', enabled: Boolean(party() && partyAlive(party())), tooltip: PARTY_TEXT.atmTooltip }];
      case 'party_stack': {
        const row = stacks.find((r) => r.target === target);
        const n = row ? stackCount(row, Date.now()) : 0;
        return [{ id: 'pick_up', label: 'Pick up', enabled: n > 0, reason: n > 0 ? '' : row?.group.respawns ? 'More on the way.' : 'All gone.', tooltip: 'Put it in your pack' }];
      }
      case 'party_guest':
        return [{ id: 'talk_to', label: 'Talk to', enabled: true, tooltip: 'Say hello' }];
      case 'teleporter_visible':
        return [{ id: 'enter', label: 'Enter', enabled: teleporter?.phase === 'portal', tooltip: `Teleport to ${space()?.label || 'the party'}` }];
      default:
        return null;
    }
  },

  runVerb(target, verbId, engine) {
    switch (target.classId) {
      case 'party_atm':
        if (verbId === 'extend') openAtm(engine);
        return true;
      case 'party_stack': {
        const row = stacks.find((r) => r.target === target);
        if (row && verbId === 'pick_up') pickUp(engine, row);
        return true;
      }
      case 'party_guest': {
        const g = guests.find((x) => x.target === target);
        if (g) {
          g.line += 1;
          engine.say(target, partyGuestLine(g.line), 3200);
        }
        return true;
      }
      case 'teleporter_visible':
        useTeleporter(engine);
        return true;
      default:
        return false;
    }
  },

  packVerbs(classTsid, engine) {
    if (!isPartyPack(classTsid)) return [];
    const block = activationBlock(engine, classTsid);
    return [{ id: 'activate', label: 'Activate', primary: true, enabled: !block, reason: block, tooltip: PARTY_TEXT.activateTooltip }];
  },

  runPackVerb(classTsid, verbId, engine) {
    if (!isPartyPack(classTsid) || verbId !== 'activate') return false;
    activatePack(engine, classTsid);
    return true;
  },

  mapCards(engine) {
    const card = buildMapCard(engine);
    return card ? [card] : [];
  },

  /** QA / tests. */
  _state() {
    return { record, demo, stacks: stacks.length, guests: guests.length, atm: Boolean(atm), booster: Boolean(booster) };
  },
};
