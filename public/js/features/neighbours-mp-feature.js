/**
 * Visiting real players' homes in multiplayer, and house keys (register
 * G328). In the original you could walk onto anyone's home street (the
 * player menu's Visit Home Street, the keyring's Visit, a Visiting Stone's
 * random visit), see their house and yard as they kept them, and stand
 * there with them; their house let in a key-holder, or anyone the owner let
 * in after a knock. The rules and copy are js/neighbours-mp.js; the sources
 * are named there.
 *
 * - What a home looks like is the owner's save, read by the site
 *   (groddle-afternoon-site src/Neighbours.php, groddle/v1/homes/<id>), never
 *   anything a visitor sends. The homes feature builds the scene from it
 *   (homes-feature visitorHomeScene: the street's look and house, the yard's
 *   cultivations, the house's furniture and back yard), display only, with
 *   the visitor's own home put back untouched.
 * - Presence: the visitor and the owner share the realtime server's HOME_<id>
 *   (the street) or HOUSE_<id> (the house) through realtime-feature's
 *   realtimeStreet query; homes.go lets nobody but the owner onto either
 *   without the pass the site signed, and into the house only with a key or
 *   after the owner let them in.
 * - The door: Go inside with a key, else Knock on the door (the owner, at
 *   home, gets the source's prompt: Ok, let them in / Nope, don't answer the
 *   door, 20 seconds). A key-holder coming in is told to the owner.
 * - Keys: Menu, House Keys, and the Magic Rock's Keys on your home street
 *   ("Keys can be found at your Magic Rock."): the keyring (Keys from
 *   friends with Visit; Your house: give a buddy a key, revoke one). A key
 *   given or taken back reaches the holder at once through the realtime
 *   server, which walks a holder whose key was taken out of the house.
 * - Visiting Stones in multiplayer (street-furniture-feature asks
 *   neighboursMpApi): Visit goes to a random opted-in real player, Get
 *   visitors and Stop random visitors are the site's opt-in
 *   (visiting_can_opt_in: level 4, a home, 3 cultivated items, a Butler).
 *   Solo's authored neighbours (js/neighbours.js) are solo only.
 *
 * Multiplayer only (engine.mode and engine.query('realtimeClient')): in solo
 * nothing here runs and no hook answers.
 *
 * Not yet (register G328 slice 2): the owner's Butler taking packages and
 * messages from visitors, key-holders tending the owner's gardens, the
 * neighbour quests and badges, the Tower, patches and resource nodes on a
 * visited street.
 *
 * QA: canvas data neighboursVisit (owner:room), neighboursKeys (given/received
 * counts), neighboursLast; window.groddleNeighbours in multiplayer.
 */

import { createMinnAccount } from '../minn-account.js?v=nbhome-1';
import { runStreetTransition } from '../screen-fx.js?v=card-2';
import { STREET_INDEX } from '../street-loader.js';
import { homesFeature, visitorHomeScene } from './homes-feature.js?v=homes-43';
import {
  KEY_VERB,
  NEIGHBOURS_TEXT as T,
  VISIT_VERB,
  doorVerbs,
  givenLine,
  holdsKeyFrom,
  homeStreetName,
  houseName,
  keyCandidates,
  normalizeHomeView,
  normalizeKeys,
  outText,
  readVisitScene,
  receivedLine,
  sharedHomeStreet,
  visitSceneTsid,
} from '../neighbours-mp.js?v=g328-1';

export const NEIGHBOURS_MP_FEATURE_ID = 'neighbours-mp';
const OWN_VERBS = new Set([VISIT_VERB.id, KEY_VERB.id, 'neighbour_noop']);
const CLASS_DOOR = 'mp_home_door';
const CLASS_GATE = 'mp_home_gate';
const CLASS_FRONT = 'mp_home_front_door';

const STYLE = `
.keys-shade { position: fixed; inset: 0; z-index: 80; display: grid; place-items: center; padding: 1rem; background: rgba(20, 34, 16, 0.45); }
.keys-shade[hidden] { display: none; }
.keys-panel { width: min(30rem, 100%); max-height: calc(100vh - 2rem); overflow: auto; border-radius: 14px; padding: 1rem 1.1rem 1.1rem;
  background: #fbf8ef; color: #2b2a22; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35); font: 14px/1.45 system-ui, sans-serif; }
.keys-panel h2 { margin: 0 0 0.1rem; font-size: 1.15rem; }
.keys-panel .keys-sub { margin: 0 0 0.6rem; opacity: 0.8; }
.keys-panel h3 { margin: 0.9rem 0 0.35rem; font-size: 0.95rem; color: #4c6b2e; }
.keys-panel p { margin: 0.35rem 0; }
.keys-panel .keys-close { float: right; border: 0; padding: 0.2rem 0.55rem; color: #2b2a22; background: transparent; font-size: 1.2rem; line-height: 1; cursor: pointer; }
.keys-panel .keys-tabs { display: flex; gap: 0.4rem; margin: 0.2rem 0 0.4rem; }
.keys-panel .keys-tabs button { font: inherit; font-weight: 700; border: 0; border-radius: 999px; padding: 0.3rem 0.8rem; cursor: pointer; color: #3a3340; background: #efe9d8; }
.keys-panel .keys-tabs button[aria-pressed="true"] { color: #fff; background: #5f8f3a; }
.keys-panel ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.4rem; }
.keys-panel li { display: flex; flex-wrap: wrap; align-items: center; gap: 0.3rem 0.6rem; padding: 0.45rem 0.6rem; border-radius: 9px; background: #f0ead8; }
.keys-panel li .key-what { flex: 1 1 12rem; }
.keys-panel li .key-what small { display: block; opacity: 0.8; }
.keys-panel button.key-act { font: inherit; font-weight: 700; border: 0; border-radius: 9px; padding: 0.3rem 0.65rem; cursor: pointer; color: #2e5a20; background: #eef6e4; box-shadow: inset 0 0 0 2px #b9d8a0; }
.keys-panel button.key-act:disabled { opacity: 0.55; cursor: default; }
.keys-panel .keys-none { opacity: 0.75; font-style: italic; }
.keys-panel .keys-roommate { padding: 0.45rem 0.6rem; border-radius: 9px; background: #fff3d6; }
.keys-panel .keys-note { min-height: 1.4em; margin-top: 0.6rem; font-weight: 600; color: #4c6b2e; }
.keys-panel .keys-note[data-tone="bad"] { color: #a33b22; }
`;

function el(tag, attrs = {}, text = '') {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === true) node.setAttribute(k, '');
    else if (v !== false && v != null) node.setAttribute(k, v);
  }
  if (text) node.textContent = text;
  return node;
}

function createSession(engine, client) {
  const boot = globalThis.GRODDLE_MP_BOOT || {};
  const account = createMinnAccount({ baseUri: document.baseURI, nonce: boot.nonce || '' });
  /** The home being visited: { owner, name, view, room, returnTo, key, letIn, targets, gardens }. */
  let visit = null;
  let keys = null;
  let visitors = null;
  let busy = false;
  let knocking = 0;
  let needRejoin = false;
  let last = '';
  let tab = 'received';
  let choosing = false;
  let note = '';
  let noteTone = 'good';
  /** Knocks at my door now: visitor id -> prompt uid. */
  const knocks = new Map();

  const me = () => Number(client.me?.id) || 0;

  function publish() {
    engine.setData?.('neighboursVisit', visit ? `${visit.owner}:${visit.room}` : '');
    engine.setData?.('neighboursKeys', keys ? `${keys.given.length}/${keys.received.length}` : '');
    engine.setData?.('neighboursLast', last);
    engine.setData?.('neighboursAllow', visitors ? String(visitors.allow === true) : '');
  }

  function notice(text, ms = 3600) {
    if (!text) return;
    last = text;
    engine.toast?.(text, ms);
    engine.pushActivity?.(text);
    publish();
  }

  // —— The site ——
  async function loadKeys() {
    try {
      keys = normalizeKeys(await account.houseKeys());
    } catch (err) {
      console.warn('[neighbours]', err?.message || err);
    }
    if (visit) visit.key = visit.key || holdsKeyFrom(keys, visit.owner);
    render();
    publish();
    return keys;
  }

  async function loadVisitors() {
    try {
      visitors = await account.visitors();
    } catch (err) {
      console.warn('[neighbours]', err?.message || err);
    }
    publish();
    return visitors;
  }

  function sendPass() {
    if (visit?.view?.pass && client.state === 'online') client.send('home_pass', { token: visit.view.pass });
  }

  // —— Visiting ——
  function visitBlock() {
    if (engine.transientInstance?.() && !readVisitScene(engine.streetTsid)) return T.cantFromHere;
    if (client.state !== 'online') return T.offline;
    return '';
  }

  /** Where Go back returns to: the street you left (your home's own way back, from your home). */
  function returnPoint() {
    if (visit?.returnTo) return visit.returnTo;
    const home = engine.homeContext?.() || {};
    if (home.inHome) return home.returnLocation?.tsid ? { tsid: home.returnLocation.tsid, x: home.returnLocation.x, y: home.returnLocation.y } : null;
    return { tsid: engine.streetTsid, x: Math.round(engine.player?.x || 0), y: Math.round(engine.player?.y || 0) };
  }

  /** houses_visit (or visiting_visit_random with ownerId 0): the site checks, then the owner's street. */
  async function visitHome(ownerId, { random = false, name = '' } = {}) {
    const block = visitBlock();
    if (block) {
      notice(block, 2600);
      return false;
    }
    if (busy) return false;
    if (!random && Number(ownerId) === me()) {
      engine.homeTravel?.('teleport');
      return true;
    }
    busy = true;
    let view;
    try {
      view = normalizeHomeView(random ? await account.visitRandom() : await account.home(ownerId));
    } catch (err) {
      notice(err?.message || T.failed, 3600);
      return false;
    } finally {
      busy = false;
    }
    if (!view) {
      notice(T.failed, 3000);
      return false;
    }
    const returnTo = returnPoint();
    visit = { owner: view.owner.id, name: view.owner.name || name, view, room: 'street', returnTo, key: view.key || holdsKeyFrom(keys, view.owner.id), letIn: false, targets: {}, gardens: new Set() };
    sendPass();
    await show('street');
    if (view.random) engine.achievement?.(`visit_random:${view.owner.id}`, 1);
    notice(T.visited(visit.name), 3200);
    return true;
  }

  /** The visit scene for a room, through the loading card. */
  async function show(room, { arrive = '' } = {}) {
    if (!visit) return;
    const built = visitorHomeScene(engine, visit.view, room);
    const label = room === 'interior' ? houseName(visit.name) : homeStreetName(visit.name);
    const x = arrive === 'door' && room === 'street' ? built.doorX + 70 : built.spawnX;
    const scene = {
      tsid: visitSceneTsid(visit.owner, room),
      label,
      hubName: 'Home',
      width: built.width,
      height: built.height,
      background: built.background,
      platforms: built.platforms,
      walls: [],
      spawn: { x, y: built.groundY },
      returnTo: visit.returnTo,
    };
    const from = { label: engine.street?.label || '', hub: engine.street?.hubName || '' };
    const setup = () => {
      if (!visit) return;
      visit.room = room;
      engine.enterScene(scene);
      const spots = built.populate(engine);
      registerTargets(room, spots);
      publish();
    };
    const fx = document.getElementById('screen-transition');
    if (!fx) setup();
    else {
      await runStreetTransition(fx, {
        fromLabel: from.label,
        fromHub: from.hub,
        toLabel: label,
        toHub: 'Home',
        pol: { type: room === 'interior' ? 'interior' : 'exterior', ownerName: visit.name },
        onMid: setup,
      });
    }
  }

  function registerTargets(room, spots) {
    const t = {};
    if (room === 'street') {
      t.door = engine.register({ classId: CLASS_DOOR, featureId: NEIGHBOURS_MP_FEATURE_ID, label: houseName(visit.name), subtitle: `The indoor half of ${visit.name}'s home`, sprite: spots.door, state: { owner: visit.owner } });
      t.gate = engine.register({ classId: CLASS_GATE, featureId: NEIGHBOURS_MP_FEATURE_ID, label: 'World Gate', subtitle: `Back to ${labelOf(visit.returnTo)}`, sprite: spots.gate, state: { owner: visit.owner } });
    } else {
      t.front = engine.register({ classId: CLASS_FRONT, featureId: NEIGHBOURS_MP_FEATURE_ID, label: 'Front Door', subtitle: `Back to ${homeStreetName(visit.name)}`, sprite: spots.door, state: { owner: visit.owner } });
    }
    visit.targets = t;
    visit.gardens = new Set(spots.gardens || []);
  }

  /** The public name of a street tsid (buddies-feature's streetLabel). */
  function labelOf(spot) {
    if (!spot?.tsid) return 'the world';
    const feature = engine.query?.('labelFor', spot.tsid, engine);
    if (feature?.street) return feature.street;
    const s = STREET_INDEX.streets || {};
    const t = String(spot.tsid);
    return (s[t] || s[t.replace(/^G/, 'L')] || s[t.replace(/^L/, 'G')])?.label || 'the world';
  }

  async function goBack() {
    const back = visit?.returnTo;
    visit = null;
    knocking = 0;
    publish();
    if (back?.tsid) await engine.enter(back.tsid, { spawnX: back.x, spawnY: back.y, quiet: true, bypassFeatureGates: true });
    else await engine.enter(STREET_INDEX.default, { bypassFeatureGates: true });
  }

  function goInside() {
    if (!visit || visit.room !== 'street') return;
    knocking = 0;
    show('interior');
  }

  function goOutside() {
    if (!visit || visit.room !== 'interior') return;
    show('street', { arrive: 'door' });
  }

  function knock() {
    if (!visit) return;
    if (visit.key || visit.letIn) return goInside();
    if (knocking === visit.owner) {
      notice(`You've already asked ${visit.name} if you can enter - be patient!`, 3000);
      return;
    }
    if (client.send('home_knock', { owner: visit.owner })) knocking = visit.owner;
  }

  // —— The keyring (port/ACLDialog.as) ——
  const style = el('style', { id: 'keys-css' });
  style.textContent = STYLE;
  document.head.append(style);
  const shade = el('div', { id: 'keys-shade', class: 'keys-shade', hidden: true, 'data-keys-shade': '' });
  const panel = el('div', { class: 'keys-panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'keys-title', 'data-keys-panel': '' });
  shade.append(panel);
  document.body.append(shade);
  shade.addEventListener('pointerdown', (e) => { if (e.target === shade) closeKeys(); });
  shade.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') closeKeys();
  });
  const menu = document.getElementById?.('more-list');
  if (menu) {
    const btn = el('button', { id: 'keys-btn', type: 'button', class: 'chrome-btn', title: T.keyringTitle }, 'House Keys');
    btn.addEventListener('click', () => openKeys());
    const before = document.getElementById?.('signout-btn');
    if (before && before.parentElement === menu) menu.insertBefore(btn, before);
    else menu.append(btn);
  }

  function openKeys(which = null) {
    if (which) tab = which;
    choosing = false;
    note = '';
    shade.hidden = false;
    engine.setData?.('keysPanel', 'open');
    render();
    loadKeys();
  }

  function closeKeys() {
    shade.hidden = true;
    engine.setData?.('keysPanel', 'closed');
  }

  function say(text, tone = 'good') {
    note = text;
    noteTone = tone;
    render();
  }

  function row(entry, line, buttons) {
    const li = el('li', { 'data-key': String(entry.id) });
    const what = el('span', { class: 'key-what' });
    what.append(document.createTextNode(entry.name), el('small', {}, line));
    li.append(what);
    for (const b of buttons) {
      const button = el('button', { type: 'button', class: 'key-act', [`data-key-${b.kind}`]: String(entry.id), title: b.title || '' }, b.label);
      button.disabled = busy || b.disabled === true;
      button.addEventListener('click', b.run);
      li.append(button);
    }
    return li;
  }

  function render() {
    publish();
    if (shade.hidden) return;
    panel.replaceChildren();
    const x = el('button', { type: 'button', class: 'keys-close', 'aria-label': 'Close' }, '×');
    x.addEventListener('click', closeKeys);
    panel.append(x, el('h2', { id: 'keys-title' }, T.keyringTitle), el('p', { class: 'keys-sub' }, tab === 'house' ? T.giveSubtitle : T.receivedSubtitle));
    const tabs = el('div', { class: 'keys-tabs', role: 'group' });
    for (const [id, label] of [['received', T.keysFromFriends], ['house', T.yourHouse]]) {
      const b = el('button', { type: 'button', 'data-keys-tab': id, 'aria-pressed': String(tab === id) }, label);
      b.addEventListener('click', () => { tab = id; choosing = false; note = ''; render(); });
      tabs.append(b);
    }
    panel.append(tabs);
    if (!keys) panel.append(el('p', {}, 'Loading…'));
    else if (tab === 'received') {
      if (!keys.received.length) panel.append(el('p', { class: 'keys-none' }, T.receivedEmpty));
      else {
        const ul = el('ul', { 'data-keys-received': '' });
        for (const k of keys.received) {
          const here = visit?.owner === k.id;
          ul.append(row(k, receivedLine(k.at), [{ kind: 'visit', label: T.visit, disabled: here, title: here ? T.alreadyHere : '', run: () => { closeKeys(); visitHome(k.id, { name: k.name }); } }]));
        }
        panel.append(ul);
      }
    } else if (!keys.hasHouse) {
      panel.append(el('p', { class: 'keys-none' }, T.noHouse));
    } else if (choosing) {
      panel.append(el('p', {}, T.chooseFriend));
      const friends = keyCandidates(globalThis.groddleBuddies?.list?.buddies || [], keys);
      if (!friends.length) panel.append(el('p', { class: 'keys-none' }, T.noFriends));
      else {
        const ul = el('ul', { 'data-keys-friends': '' });
        for (const f of friends) ul.append(row(f, '', [{ kind: 'give', label: T.sendKey, run: () => give(f) }]));
        panel.append(ul);
      }
      panel.append(el('p', { class: 'keys-roommate' }, T.roommate));
      const back = el('button', { type: 'button', class: 'key-act', 'data-keys-back': '' }, T.backToKeyring);
      back.addEventListener('click', () => { choosing = false; render(); });
      panel.append(back);
    } else {
      panel.append(el('p', {}, T.wantToLet));
      const give = el('button', { type: 'button', class: 'key-act', 'data-keys-giveout': '' }, T.giveOut);
      give.disabled = busy;
      give.addEventListener('click', () => { choosing = true; note = ''; render(); });
      panel.append(give, el('h3', {}, T.givenHeader));
      if (!keys.given.length) panel.append(el('p', { class: 'keys-none' }, T.givenEmpty));
      else {
        const ul = el('ul', { 'data-keys-given': '' });
        for (const k of keys.given) ul.append(row(k, givenLine(k.at), [{ kind: 'revoke', label: T.revoke, run: () => confirmRevoke(k) }]));
        panel.append(ul);
      }
    }
    panel.append(el('p', { class: 'keys-note', role: 'status', 'aria-live': 'polite', 'data-tone': noteTone }, note));
  }

  async function act(run, ok) {
    if (busy) return false;
    busy = true;
    render();
    try {
      const answer = await run();
      keys = normalizeKeys(answer);
      if (typeof answer?.told === 'string' && answer.told) client.send('home_key_tell', { token: answer.told });
      ok?.(answer);
      return true;
    } catch (err) {
      say(err?.message || T.failed, 'bad');
      engine.toast?.(err?.message || T.failed, 3600);
      return false;
    } finally {
      busy = false;
      render();
    }
  }

  function give(friend) {
    return act(() => account.giveKey(friend.id), () => {
      choosing = false;
      say(`${T.success} ${friend.name} has a key to your house.`);
      engine.pushActivity?.(`You gave ${friend.name} a key to your house.`);
    });
  }

  function confirmRevoke(k) {
    const yes = () => act(() => account.revokeKey(k.id), () => {
      say(`You took back ${k.name}'s key.`);
      engine.pushActivity?.(`You took back ${k.name}'s key to your house.`);
    });
    if (!engine.prompt) return yes();
    engine.prompt({ modal: true, text: T.revokeConfirm(k.name), choices: [{ label: T.yes, value: true }, { label: T.no, value: false }], onChoice: (v) => { if (v === true) yes(); } });
    return true;
  }

  // —— Messages ——
  client.on('hello', () => {
    // A new socket: the server forgot the pass (it goes with a socket that dropped).
    sendPass();
  });
  client.on('msg:home_pass_ok', (msg) => {
    if (!visit || Number(msg.owner) !== visit.owner) return;
    visit.key = visit.key || msg.key === true;
    if (needRejoin && client.wanted && engine.player) {
      needRejoin = false;
      client.join({ street: client.wanted, x: engine.player.x, y: engine.player.y, dir: engine.player.facing === 'left' ? -1 : 1, anim: engine.player.glitchState || 'stand', look: { v: 1, vector: engine.playerAppearance?.vector || {} } });
    }
  });
  client.on('error', ({ code, message }) => {
    if (!visit) return;
    if (code === 'home_private') {
      needRejoin = true;
      sendPass();
    } else if (code === 'home_blocked') {
      notice(message, 3600);
      goBack();
    } else if (code === 'home_locked' && visit.room === 'interior') {
      goOutside();
    }
  });
  client.on('msg:home_knock_sent', (msg) => {
    engine.playSound?.('POL_GATE_KNOCKED', { volume: 0.6 });
    notice(String(msg.text || T.knockSent), 3600);
  });
  client.on('msg:home_refused', (msg) => {
    if (visit && Number(msg.owner) === visit.owner) knocking = 0;
    notice(String(msg.text || T.failed), 3600);
  });
  client.on('msg:home_open', (msg) => {
    if (!visit || Number(msg.owner) !== visit.owner) return;
    if (msg.why === 'let_in') visit.letIn = true;
    goInside();
  });
  client.on('msg:home_let_in', (msg) => {
    const owner = Number(msg.owner?.id) || 0;
    if (!visit || owner !== visit.owner) return;
    visit.letIn = true;
    knocking = 0;
    last = String(msg.text || T.letYouIn(visit.name));
    engine.pushActivity?.(last);
    // house_set_auth 77-96: the prompt, "Very well"; walking in is the door's.
    if (engine.prompt) engine.prompt({ text: last, choices: [{ label: T.veryWell, value: 'ok' }], timeout: 20, onChoice: () => goInside() });
    else goInside();
    publish();
  });
  client.on('msg:home_answered', (msg) => {
    if (!visit || Number(msg.owner) !== visit.owner || msg.allow) return;
    knocking = 0;
    notice(T.noAnswer(visit.name), 3200);
  });
  client.on('msg:home_out', (msg) => {
    if (!visit || Number(msg.owner) !== visit.owner) return;
    visit.letIn = false;
    if (msg.why === 'revoked') visit.key = false;
    notice(outText(msg.why, visit.name), 4200);
    if (visit.room === 'interior') goOutside();
  });
  client.on('msg:home_key', (msg) => {
    const from = { id: Number(msg.from?.id) || 0, name: String(msg.from?.name || 'Someone') };
    if (msg.on) {
      last = String(msg.text || T.keyGiven(from.name));
      engine.pushActivity?.(last);
      engine.prompt?.({ text: last, choices: [{ label: 'OK', value: 'ok' }] });
      if (visit?.owner === from.id) visit.key = true;
    } else {
      notice(T.keyTaken(from.name), 3600);
      if (visit?.owner === from.id) visit.key = false;
    }
    loadKeys();
  });
  // The owner's side: knocks and key-holders at my door.
  client.on('msg:home_knocked', (msg) => {
    const id = Number(msg.id) || 0;
    if (!id) return;
    engine.playSound?.('POL_GATE_KNOCKED', { volume: 0.7 });
    const text = String(msg.text || T.knocking(String(msg.name || 'Someone')));
    last = text;
    publish();
    const uid = engine.prompt?.({
      text,
      choices: [{ label: T.letIn, value: 'allow' }, { label: T.dontAnswer, value: 'dismiss' }],
      timeout: 20,
      timeoutValue: 'dismiss',
      iconButtons: true,
      onChoice: (v) => {
        knocks.delete(id);
        client.send('home_answer', { id, allow: v === 'allow' });
      },
      onTimeout: () => knocks.delete(id),
    });
    knocks.set(id, uid || '');
  });
  client.on('msg:home_knock_over', (msg) => {
    const id = Number(msg.id) || 0;
    const uid = knocks.get(id);
    knocks.delete(id);
    if (uid) engine.removePrompt?.(uid);
  });
  client.on('msg:home_entered', (msg) => {
    const text = String(msg.text || T.entered(String(msg.name || 'Someone')));
    last = text;
    publish();
    engine.prompt?.({ text, choices: [{ label: 'OK', value: 'ok' }], timeout: 20 });
  });

  loadKeys();
  loadVisitors();

  return {
    client,
    get visit() { return visit; },
    get keys() { return keys; },
    get visitors() { return visitors; },
    visitHome,
    goBack,
    goInside,
    goOutside,
    knock,
    openKeys,
    closeKeys,
    loadKeys,
    loadVisitors,
    /** QA: the Home panel's travel (engine.homeTravel: teleport, teleport-inside, inside, outside, return). */
    home: (action) => engine.homeTravel?.(action),
    async optIn() {
      try {
        // The stone says the source's line (STONE_TEXT optedIn / optedOut); the site's text is the same.
        visitors = await account.optInVisitors();
        return true;
      } catch (err) {
        notice(err?.message || T.failed, 3600);
        return false;
      } finally {
        publish();
      }
    },
    async optOut() {
      try {
        // The stone says the source's line (STONE_TEXT optedIn / optedOut); the site's text is the same.
        visitors = await account.optOutVisitors();
        return true;
      } catch (err) {
        notice(err?.message || T.failed, 3600);
        return false;
      } finally {
        publish();
      }
    },
    /** The street others share with you (realtimeStreet). */
    street() {
      const home = engine.homeContext?.() || {};
      if (visit && readVisitScene(engine.streetTsid)?.owner !== visit.owner) return '';
      const tower = homesFeature._state?.().scene?.tower != null;
      return sharedHomeStreet({ visit, me: me(), inHome: home.inHome === true, room: home.room, towerFloor: tower });
    },
    /** The scene went away (an ordinary street, a reload): the visit is over. */
    left() {
      if (visit && !readVisitScene(engine.streetTsid)) {
        visit = null;
        knocking = 0;
        publish();
      }
    },
    verbsFor(target) {
      if (!visit) return [];
      if (target.classId === CLASS_DOOR) return doorVerbs({ key: visit.key, letIn: visit.letIn, ownerName: visit.name });
      if (target.classId === CLASS_GATE) return [{ id: 'go_back', label: T.goBackVerb, tooltip: `Back to ${labelOf(visit.returnTo)}`, enabled: true, reason: '' }];
      if (target.classId === CLASS_FRONT) return [{ id: 'go_outside', label: T.outsideVerb, tooltip: `Back to ${homeStreetName(visit.name)}`, enabled: true, reason: '' }];
      return [];
    },
    runVerb(target, verbId) {
      if (verbId === 'enter') goInside();
      else if (verbId === 'knock') knock();
      else if (verbId === 'go_back') goBack();
      else if (verbId === 'go_outside') goOutside();
      else return false;
      return true;
    },
    ownsGarden: (target) => Boolean(visit?.gardens?.has(target)),
    ownerName: () => visit?.name || '',
  };
}

let session = null;
let guard = false;

function ensure(engine) {
  if (session) return session;
  if (engine?.mode !== 'multiplayer' || typeof document === 'undefined') return null;
  const client = engine.query?.('realtimeClient');
  if (!client) return null;
  session = createSession(engine, client);
  globalThis.groddleNeighbours = session;
  return session;
}

/** The base menu of a target, through every other feature's override. */
function baseVerbs(engine, target) {
  guard = true;
  try {
    return engine.targetVerbs?.(target) || [];
  } finally {
    guard = false;
  }
}

/**
 * For street-furniture-feature's Visiting Stones in multiplayer (one-way
 * import, no cycle): a random real player's home and the site's opt-in.
 */
export const neighboursMpApi = {
  /** Multiplayer with the session up: the stones use real players. */
  active: (engine) => engine?.mode === 'multiplayer' && Boolean(ensure(engine)),
  visitRandom: (engine) => ensure(engine)?.visitHome(0, { random: true }) ?? Promise.resolve(false),
  optIn: (engine) => ensure(engine)?.optIn() ?? Promise.resolve(false),
  optOut: (engine) => ensure(engine)?.optOut() ?? Promise.resolve(false),
  /** The site's opt-in (pc.home_allow_visits), or null before it has answered. */
  allowVisits: () => (session?.visitors ? session.visitors.allow === true : null),
  /** visiting_can_opt_in's cultivation check (inc_visiting.js:17-25): items cultivated on the home street. */
  cultivations: () => homesFeature._state?.().cult?.items?.length || 0,
};

export const neighboursMpFeature = {
  id: NEIGHBOURS_MP_FEATURE_ID,

  onTick(dtMs, now, engine) {
    if (engine.mode !== 'multiplayer' || !engine.started) return;
    ensure(engine);
  },

  onStreetEnter() {
    session?.left();
  },

  /** realtime-feature: the street shared on someone's home (or yours), HOME_<id> or HOUSE_<id>. */
  realtimeStreet(engine) {
    if (!session || engine?.mode !== 'multiplayer') return null;
    return session.street() || null;
  },

  /** buddies-feature's Visit button. */
  canVisitHomes(engine) {
    return session && engine?.mode === 'multiplayer' ? true : null;
  },

  visitHome(id, name, engine) {
    if (!session || engine?.mode !== 'multiplayer') return null;
    session.visitHome(id, { name: String(name || '') });
    return true;
  },

  verbsFor(target) {
    return session ? session.verbsFor(target) : [];
  },

  runVerb(target, verbId) {
    return session ? session.runVerb(target, verbId) : false;
  },

  /**
   * Another player's Glitch: Visit Home Street (InteractionMenuController.as
   * 622-628); your home street's Magic Rock: Keys (inc_acl_keys.js:57 "Keys
   * can be found at your Magic Rock."); the owner's gardens on a visited
   * street: theirs, not yours to tend.
   */
  verbOverride(target, engine) {
    if (guard || !session || engine?.mode !== 'multiplayer' || !target) return null;
    if (target.classId === 'pc_remote' && target.playerId) {
      const base = baseVerbs(engine, target).filter((v) => !OWN_VERBS.has(v.id));
      return [...base, { ...VISIT_VERB, enabled: true, reason: '' }];
    }
    if (target.classId === 'magic_rock' && engine.homeContext?.().inHome) {
      const base = baseVerbs(engine, target).filter((v) => !OWN_VERBS.has(v.id));
      return [...base, { ...KEY_VERB, enabled: true, reason: '' }];
    }
    if (session.ownsGarden(target)) {
      return [{ id: 'neighbour_noop', label: 'Tend', tooltip: 'Do some gardening', enabled: false, reason: T.belongs(session.ownerName()) }];
    }
    return null;
  },

  runVerbOverride(target, verbId) {
    if (!session || !OWN_VERBS.has(verbId)) return null;
    if (verbId === VISIT_VERB.id && target?.playerId) {
      session.visitHome(target.playerId, { name: target.label || target.name || '' });
      return true;
    }
    if (verbId === KEY_VERB.id) {
      session.openKeys('house');
      return true;
    }
    return true;
  },
};
