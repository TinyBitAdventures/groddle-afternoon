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
 * Slice 2 (register G328):
 * - The owner's Butler stands at its post on their home street for visitors
 *   (drawn from the owner's save: name, parts, post), greets them and takes
 *   a package (a stack from the pack, with or without a message) or a
 *   message (bag_butler.js leave_package / leave_message). The realtime
 *   server (homes_help.go butler_leave) asks the site
 *   (src/ButlerParcels.php), which takes the package out of the visitor's
 *   ledger at once and keeps the parcel for the owner. The owner's game
 *   adds waiting parcels to its own Butler on load (and at once when told,
 *   butler_parcel); the Butler hands them over as it does a neighbour's
 *   (butler-feature handOver), the site moving a package into the owner's
 *   ledger first (butlerApi.setParcelHook).
 * - Key-holders tend the owner's gardens (garden_new.js tend: the owner or
 *   a key-holder): their garden verbs run on their copy of the plots, and
 *   each water, plant, clear or harvest goes to the site
 *   (src/HomeTending.php), which checks it against the owner's stored
 *   gardens and keeps it; the owner's game applies the waiting acts to its
 *   own gardens (on load, and at once through home_tend_tell), and the
 *   others on that street see it too. Without a key a garden still says
 *   "That belongs to <name>."
 * - Counted from these acts: neighbors_resources_tended, water_garden_for_others,
 *   give_bag_butler (reimagined: GSJS never counts them),
 *   herb_seeds_planted_for_others (include/garden.js:394-396), and the
 *   owner's hosted_party (crowded_house, house_party: locations/home.js:55-66,
 *   told by the server).
 *
 * Not yet: patches, resource nodes and the Tower on a visited street; the
 * Magic Rock's daily iMG for what visitors do on a home street (G119).
 *
 * QA: canvas data neighboursVisit (owner:room), neighboursKeys (given/received
 * counts), neighboursLast, neighboursButler (the visitor Butler: name@x),
 * neighboursParcels (merged into my Butler), neighboursTended (acts applied
 * to my gardens / acts the site took from me); window.groddleNeighbours in
 * multiplayer.
 */

import { createMinnAccount } from '../minn-account.js?v=nbhome-10';
import { runStreetTransition } from '../screen-fx.js?v=card-2';
import { STREET_INDEX } from '../street-loader.js';
import { ITEM_CATALOG, countItem, listPackItemSlots, removeItem } from '../inventory.js?v=catalog-unified-7';
import { cultivationDef, homeStreetLayout } from '../home-cultivation.js?v=home-cultivation-5';
import { tickGarden } from '../garden.js?v=g300-1';
import { BUTLER_RIG_SCALE, ButlerPainter, butlerRigNow, loadButlerRig } from '../butler-rig.js?v=butler-rig-1';
import { normalizeButlerParts } from '../butler.js?v=butler-9';
import { butlerApi } from './butler-feature.js?v=butler-feature-53';
import { homesFeature, visitorHomeScene, visitorHomeState } from './homes-feature.js?v=homes-53';
import {
  BUTLER_MESSAGE_MAX,
  KEY_VERB,
  NEIGHBOURS_TEXT as T,
  NEIGHBOUR_COUNTERS,
  VISITOR_BUTLER_CLASS,
  VISITOR_BUTLER_TEXT as BT,
  VISITOR_BUTLER_VERBS as BV,
  VISIT_VERB,
  applyTendAct,
  doorVerbs,
  givenLine,
  holdsKeyFrom,
  homeStreetName,
  hostedCounters,
  houseName,
  isSiteParcel,
  keyCandidates,
  mergeParcels,
  normalizeHomeView,
  normalizeKeys,
  normalizeNeighboursSlice,
  normalizeParcels,
  normalizeTendActs,
  noteGift,
  outText,
  plotsSnapshot,
  possessive,
  readVisitScene,
  receivedLine,
  sharedHomeStreet,
  tendAct,
  tendCounters,
  tendedText,
  TENDED_KEEP,
  visitSceneTsid,
} from '../neighbours-mp.js?v=g328-4';

export const NEIGHBOURS_MP_FEATURE_ID = 'neighbours-mp';
const OWN_VERBS = new Set([VISIT_VERB.id, KEY_VERB.id, 'neighbour_noop']);
const BUTLER_VERB_IDS = new Set(Object.values(BV).map((v) => v.id));
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
.keys-panel textarea { box-sizing: border-box; width: 100%; min-height: 5.5rem; margin: 0.4rem 0; padding: 0.45rem 0.55rem; border-radius: 9px; border: 2px solid #d8cfb6; font: inherit; resize: vertical; background: #fff; color: #2b2a22; }
.keys-panel .butler-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; justify-content: flex-end; margin-top: 0.4rem; }
.keys-panel .butler-stacks { display: grid; grid-template-columns: repeat(auto-fill, minmax(5.4rem, 1fr)); gap: 0.4rem; }
.keys-panel .butler-stacks button { display: grid; justify-items: center; gap: 0.15rem; padding: 0.35rem 0.25rem; border: 0; border-radius: 9px; background: #f0ead8; color: #2b2a22; font: inherit; font-size: 0.85rem; cursor: pointer; }
.keys-panel .butler-stacks button[aria-pressed="true"] { box-shadow: inset 0 0 0 2px #5f8f3a; background: #eef6e4; }
.keys-panel .butler-stacks img { width: 40px; height: 40px; object-fit: contain; }
.keys-panel input[type="number"] { width: 5rem; font: inherit; padding: 0.25rem 0.4rem; border-radius: 7px; border: 2px solid #d8cfb6; }
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
  /** Slice 2: the slice saved with the game (tending applied, owners gifted). */
  const slice = normalizeNeighboursSlice(savedSlice);
  /** The owner's Butler on a visited street: { box, sprite, painter, source, target, t, greeted, busy }. */
  let vb = null;
  /** Acts on the owner's gardens waiting to go to the site; the site's answers counted. */
  let tendQueue = [];
  let tendTimer = 0;
  let tendSent = 0;
  let tendApplied = 0;
  let parcelsMerged = 0;
  let lastGardenScan = 0;

  const me = () => Number(client.me?.id) || 0;

  function publish() {
    engine.setData?.('neighboursVisit', visit ? `${visit.owner}:${visit.room}` : '');
    engine.setData?.('neighboursKeys', keys ? `${keys.given.length}/${keys.received.length}` : '');
    engine.setData?.('neighboursLast', last);
    engine.setData?.('neighboursAllow', visitors ? String(visitors.allow === true) : '');
    engine.setData?.('neighboursButler', vb?.target ? `${vb.name}@${Math.round(vb.box.x)}` : '');
    engine.setData?.('neighboursParcels', String(parcelsMerged));
    engine.setData?.('neighboursTended', `${tendApplied}/${tendSent}`);
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
    visit = { owner: view.owner.id, name: view.owner.name || name, view, room: 'street', returnTo, key: view.key || holdsKeyFrom(keys, view.owner.id), letIn: false, targets: {}, gardens: new Set(), beds: new Map(), watered: new Set(), butler: answerButler(view) };
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
      vb = null;
      const spots = built.populate(engine);
      registerTargets(room, spots);
      // HOMES3 (features/home-street-mp-feature.js): the signpost, Note Poles, furniture for sale and restorations here.
      engine.query?.('homeStreetVisit', { owner: visit.owner, name: visit.name, room, key: visit.key, view: visit.view, built, spots }, engine);
      if (room === 'street') {
        spawnVisitorButler(built.groundY);
        // location.js:160-168: another player's home street (not their house), one label per street.
        engine.achievement?.(`player_streets_visited:${visitSceneTsid(visit.owner, 'street')}`, 1);
      }
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
    visit.beds = mapBeds(room, spots.gardens || []);
  }

  // —— Slice 2: the owner's gardens on a visit ——

  /** Each garden bed drawn on the visit, with the owner's cultivation it is (by where it stands). */
  function mapBeds(room, entities) {
    const v = visitorHomeState(visit.view);
    const yard = room === 'interior' ? 'back' : 'street';
    const st = yard === 'back' ? v.backCult : v.cult;
    const houseX = homeStreetLayout(st).houseX;
    const beds = new Map();
    for (const e of entities) {
      const item = (st.items || []).find((it) => cultivationDef(it.protoClass)?.kind === 'garden' && !it.depleted && Math.abs(houseX + it.rx - (e.sprite?.x ?? NaN)) < 2);
      if (!item || !e.state?.garden) continue;
      const herb = cultivationDef(item.protoClass)?.gardenType === 'herb';
      beds.set(e, { yard, id: String(item.id), herb, snap: plotsSnapshot(e.state.garden) });
    }
    return beds;
  }

  function bedOf(target) {
    if (!visit) return null;
    const e = target?.classId === 'garden_plot' ? target.state?.gardenEntity : target;
    return visit.beds.get(e) ? e : null;
  }

  /** A neighbour counter: the quests' event (quest-offers routes it to an accepted quest) and the slice's tally. */
  function count(counter, n = 1) {
    slice.counts[counter] = (slice.counts[counter] || 0) + n;
    engine.achievement?.(counter, n);
  }

  /** A key-holder's garden verbs changed their copy: what changed goes to the site. */
  function scanGardens(now) {
    if (!visit?.key || !visit.beds.size || now - lastGardenScan < 300) return;
    lastGardenScan = now;
    for (const [e, bed] of visit.beds) {
      const after = plotsSnapshot(e.state?.garden);
      for (const key of Object.keys(after)) {
        const a = tendAct(bed.snap[key], after[key]);
        if (a) tendQueue.push({ yard: bed.yard, garden: bed.id, plot: key, act: a.act, seed: a.seed, entity: e });
      }
      bed.snap = after;
    }
    if (tendQueue.length && !tendTimer) tendTimer = setTimeout(flushTend, 500);
  }

  async function flushTend() {
    tendTimer = 0;
    if (!visit || !tendQueue.length) return;
    const owner = visit.owner;
    const batch = tendQueue.splice(0, 8);
    let answer;
    try {
      answer = await account.tend(owner, batch.map(({ entity, ...a }) => a));
    } catch (err) {
      notice(err?.message || T.failed, 3600);
      for (const a of batch) revertPlot(a, null);
      if (tendQueue.length) tendTimer = setTimeout(flushTend, 500);
      return;
    }
    const done = [];
    (answer?.acts || []).forEach((r, i) => {
      const a = batch[i];
      if (!a) return;
      if (r?.ok) done.push(a);
      else revertPlot(a, r?.plot || null, r?.text);
    });
    tendSent += done.length;
    if (done.length && visit?.owner === owner) {
      const herbGardens = new Set([...visit.beds.values()].filter((b) => b.herb).map((b) => `${b.yard}:${b.id}`));
      for (const [counter, n] of tendCounters(done, { herbGardens, wateredThisVisit: visit.watered })) count(counter, n);
      engine.save?.();
    }
    if (typeof answer?.tell === 'string' && answer.tell) client.send('home_tend_tell', { token: answer.tell });
    publish();
    if (tendQueue.length) tendTimer = setTimeout(flushTend, 500);
  }

  /** The site said no: the copy shows the plot as the site holds it. */
  function revertPlot(a, plot, text = '') {
    const garden = a.entity?.state?.garden;
    if (garden?.plots?.[a.plot] && plot && typeof plot === 'object') Object.assign(garden.plots[a.plot], plot);
    const bed = visit?.beds.get(a.entity);
    if (bed && garden) bed.snap = plotsSnapshot(garden);
    if (a.entity) engine.refreshGarden?.(a.entity);
    if (text) notice(text, 3200);
  }

  /** Another key-holder's acts (home_tended) on the copy this visit shows. */
  function applyToCopy(acts) {
    if (!visit) return;
    for (const act of acts) {
      for (const [e, bed] of visit.beds) {
        if (bed.yard !== act.yard || bed.id !== act.garden) continue;
        if (applyTendAct(e.state.garden, act, tickGarden)) {
          bed.snap = plotsSnapshot(e.state.garden);
          engine.refreshGarden?.(e);
        }
      }
    }
  }

  /** My own gardens: what key-holders did while I was away (or just now). */
  async function loadTending() {
    if (!homesFeature._state) return 0;
    let acts;
    try {
      acts = normalizeTendActs((await account.tending())?.acts);
    } catch (err) {
      console.warn('[neighbours]', err?.message || err);
      return 0;
    }
    const st = homesFeature._state();
    const fresh = acts.filter((a) => !slice.tended.includes(a.id));
    const changed = new Set();
    for (const a of fresh) {
      const where = a.yard === 'back' ? st.backCult : st.cult;
      const garden = where?.gardens?.[a.garden];
      if (garden && applyTendAct(garden, a, tickGarden)) changed.add(garden);
      slice.tended = [...slice.tended, a.id].slice(-TENDED_KEEP);
    }
    if (!fresh.length) return 0;
    tendApplied += fresh.length;
    for (const t of engine.interactables || []) {
      if (t.classId === 'garden_new' && changed.has(t.state?.garden)) engine.refreshGarden?.(t);
    }
    const byName = new Map();
    for (const a of fresh) byName.set(a.from.name, [...(byName.get(a.from.name) || []), a]);
    for (const [who, list] of byName) notice(tendedText(who, list), 3600);
    engine.save?.();
    publish();
    return fresh.length;
  }

  // —— Slice 2: the owner's Butler, met as a visitor ——

  function answerButler(view) {
    const b = view?.butler;
    return b?.owned === true ? { name: String(b.name || '').slice(0, 19) || 'Butler', parts: normalizeButlerParts(b.parts), post: Number.isFinite(Number(b.post)) && b.post !== null ? Number(b.post) : null } : null;
  }

  function spawnVisitorButler(groundY) {
    const b = visit?.butler;
    if (!b || !engine.PIXI || !engine.entityLayer) return;
    const { PIXI } = engine;
    const layout = homeStreetLayout(visitorHomeState(visit.view).cult);
    // bag_butler.js target_loc: its post, else 300 px right of the house (butler-feature BOX_RX).
    const x = Math.max(60, Math.min(layout.width - 60, layout.houseX + (b.post ?? 300)));
    const box = new PIXI.Container();
    box.zIndex = 29;
    box.x = x;
    box.y = (Number(groundY) || engine.groundY || 0) + 2;
    engine.entityLayer.addChild(box);
    const me2 = { box, sprite: null, painter: null, source: null, target: null, t: 0, greeted: false, busy: false, name: b.name };
    vb = me2;
    const paint = (rig) => {
      if (vb !== me2 || box.destroyed || !rig) return;
      me2.painter = new ButlerPainter(rig, b.parts, BUTLER_RIG_SCALE);
      me2.source = new PIXI.CanvasSource({ resource: me2.painter.canvas, resolution: BUTLER_RIG_SCALE, scaleMode: 'linear' });
      me2.sprite = new PIXI.Sprite(new PIXI.Texture({ source: me2.source }));
      const a = me2.painter.anchor();
      me2.sprite.anchor.set(a.x, a.y);
      box.addChild(me2.sprite);
      me2.painter.draw('idle0', 0);
      me2.source.update();
    };
    const rig = butlerRigNow();
    if (rig) paint(rig);
    else loadButlerRig().then(paint).catch(() => {});
    // A hit box from the start (the rig paints a moment later), the Butler's own size: the painter's
    // canvas spans every clip, wider than the door it stands beside.
    const hit = new PIXI.Graphics();
    hit.rect(-28, -120, 56, 120).fill({ color: 0xffffff, alpha: 0.001 });
    box.addChild(hit);
    box._worldHitW = 56;
    box._worldHitH = 120;
    me2.target = engine.register({ classId: VISITOR_BUTLER_CLASS, featureId: NEIGHBOURS_MP_FEATURE_ID, label: b.name, subtitle: `${possessive(visit.name)} Butler`, sprite: box, state: { owner: visit.owner } });
  }

  function butlerSay(text, ms = 4200) {
    if (!text) return;
    last = text;
    engine.setData?.('neighboursButlerSaid', text);
    if (vb?.target) engine.say?.(vb.target, text, ms);
    engine.pushActivity?.(`${vb?.name || 'Butler'}: ${text}`);
    publish();
  }

  function greeting() {
    const me3 = client.me?.name || engine.pc?.name || 'friend';
    // greetPlayer: a friend of the owner hears friendGreeting (a key-holder is one), anyone else strangerGreeting.
    return (visit.key ? BT.friendGreeting(me3) : BT.strangerGreeting(me3, visit.name)) + BT.visitorOwnerHome;
  }

  function tickButler(dtMs) {
    if (!vb || vb.box.destroyed) return;
    vb.t += (dtMs * 30) / 1000;
    if (vb.painter) {
      const frames = vb.painter.frames('idle0') || 1;
      if (vb.painter.draw('idle0', Math.floor(vb.t) % frames)) vb.source.update();
    }
    const p = engine.player;
    if (!p) return;
    // The art faces left: turn to the visitor.
    if (vb.sprite) vb.sprite.scale.x = p.x > vb.box.x ? -1 : 1;
    // After the arrival line (greetPlayer runs once the visitor is on the street), within 550 px (far_dist).
    if (!vb.greeted && vb.t > 45 && Math.abs(p.x - vb.box.x) <= 550) {
      vb.greeted = true;
      butlerSay(greeting(), 5000);
    }
  }

  // The picker and the message box (the source's choices list and input box), in the keyring's look.
  const bshade = el('div', { id: 'butler-shade', class: 'keys-shade', hidden: true, 'data-butler-shade': '' });
  const bpanel = el('div', { class: 'keys-panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'butler-title', 'data-butler-panel': '' });
  bshade.append(bpanel);
  document.body.append(bshade);
  bshade.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') closeBox();
  });
  let boxCancel = null;

  function closeBox(cancelled = true) {
    if (bshade.hidden) return;
    bshade.hidden = true;
    engine.setData?.('butlerBox', 'closed');
    const c = boxCancel;
    boxCancel = null;
    if (cancelled && c) c();
    if (vb) vb.busy = false;
  }

  function openBox(title, build, onCancel) {
    bpanel.replaceChildren();
    const x = el('button', { type: 'button', class: 'keys-close', 'aria-label': 'Close' }, '×');
    x.addEventListener('click', () => closeBox());
    bpanel.append(x, el('h2', { id: 'butler-title' }, title));
    build(bpanel);
    boxCancel = onCancel || null;
    bshade.hidden = false;
    engine.setData?.('butlerBox', 'open');
    bpanel.querySelector('textarea, input, button.key-act')?.focus();
  }

  /** onLeaveMessage / packageSuccess: the message box; done(text) with '' for none. */
  function messageBox(label, done, { optional = false } = {}) {
    openBox(label, (panel) => {
      const area = el('textarea', { maxlength: String(BUTLER_MESSAGE_MAX), 'data-butler-text': '', 'aria-label': label });
      const ok = el('button', { type: 'button', class: 'key-act', 'data-butler-send': '' }, BT.send);
      const actions = el('div', { class: 'butler-actions' });
      ok.addEventListener('click', () => {
        const text = area.value.trim().slice(0, BUTLER_MESSAGE_MAX);
        if (!text && !optional) return;
        closeBox(false);
        done(text);
      });
      if (optional) {
        const skip = el('button', { type: 'button', class: 'key-act', 'data-butler-skip': '' }, BT.skip);
        skip.addEventListener('click', () => { closeBox(false); done(''); });
        actions.append(skip);
      }
      actions.append(ok);
      panel.append(area, actions);
    }, () => (optional ? done('') : butlerSay(BT.messageNo)));
  }

  function itemLabel(cls, n) {
    const meta = ITEM_CATALOG[cls] || {};
    const single = meta.label || String(cls).replace(/_/g, ' ');
    return n === 1 ? single : (meta.namePlural || `${single}s`);
  }

  /** leave_package valid_items: what can be given (not a trophy, furniture, a bag or no_trade). */
  function giftableStacks() {
    const seen = new Map();
    for (const slot of listPackItemSlots(engine.inv) || []) {
      const cls = slot.classTsid;
      const tags = ITEM_CATALOG[cls]?.tags || [];
      if (!cls || tags.includes('no_trade') || tags.includes('quest-item') || tags.includes('no_drop') || /^(bag_|furniture_|trophy_)/.test(cls)) continue;
      if (!seen.has(cls)) seen.set(cls, countItem(engine.inv, cls));
    }
    return [...seen].filter(([, n]) => n > 0).map(([c, n]) => ({ c, n }));
  }

  function leavePackage() {
    if (!visit?.butler || vb?.busy) return;
    const stacks = giftableStacks();
    if (!stacks.length) return butlerSay(BT.nothingToGive);
    vb.busy = true;
    let pick = stacks[0];
    openBox(BT.pickTitle, (panel) => {
      panel.append(el('p', { class: 'keys-sub' }, BT.pickHint));
      const grid = el('div', { class: 'butler-stacks', 'data-butler-stacks': '' });
      const count = el('input', { type: 'number', min: '1', max: String(pick.n), value: '1', 'data-butler-count': '', 'aria-label': BT.howMany });
      for (const st of stacks) {
        const b = el('button', { type: 'button', 'data-butler-stack': st.c, 'aria-pressed': String(st === pick), title: itemLabel(st.c, st.n) });
        const icon = ITEM_CATALOG[st.c]?.icon;
        if (icon) b.append(el('img', { src: icon, alt: '' }));
        b.append(document.createTextNode(`${itemLabel(st.c, 1)} ×${st.n}`));
        b.addEventListener('click', () => {
          pick = st;
          count.max = String(st.n);
          count.value = String(Math.min(Number(count.value) || 1, st.n));
          for (const o of grid.querySelectorAll('button')) o.setAttribute('aria-pressed', String(o === b));
        });
        grid.append(b);
      }
      const actions = el('div', { class: 'butler-actions' });
      const label = el('label', {}, `${BT.howMany} `);
      label.append(count);
      const ok = el('button', { type: 'button', class: 'key-act', 'data-butler-leave': '' }, BT.leave);
      ok.addEventListener('click', () => {
        const n = Math.max(1, Math.min(pick.n, Math.floor(Number(count.value) || 1)));
        closeBox(false);
        confirmPackage(pick.c, n);
      });
      actions.append(label, ok);
      panel.append(grid, actions);
    }, () => butlerSay(BT.packageNo));
  }

  /** leave_package's conversation (bag_butler.js 1100-1114), then the message (onLeavePackage 3830-3840). */
  function confirmPackage(c, n) {
    if (!visit) return;
    vb && (vb.busy = true);
    const words = itemLabel(c, n);
    const text = n > 1 ? BT.packageGivePlural(`${n} ${words}`, visit.name) : BT.packageGiveSingle(words, visit.name);
    butlerSay(text);
    const go = (yes) => {
      if (!yes) {
        if (vb) vb.busy = false;
        return butlerSay(BT.packageNo);
      }
      butlerSay(BT.packageSuccess(visit.name));
      messageBox(BT.packageSuccess(visit.name), (msg) => send({ item: { c, n }, text: msg }), { optional: true });
    };
    if (!engine.prompt) return go(true);
    engine.prompt({ text, choices: [{ label: BT.yes, value: true }, { label: BT.keep, value: false }], onChoice: (v) => go(v === true) });
    return undefined;
  }

  function leaveMessage() {
    if (!visit?.butler || vb?.busy) return;
    vb.busy = true;
    butlerSay(BT.messageResponse);
    messageBox(BT.messageResponse, (text) => send({ text }));
  }

  function send({ item = null, text = '' }) {
    if (!visit || !client.send('butler_leave', { owner: visit.owner, item, text })) {
      if (vb) vb.busy = false;
      notice(T.offline, 3000);
    }
  }

  // —— Slice 2: my own Butler, holding what real visitors left ——

  async function loadParcels() {
    const st = butlerApi.mpState?.(engine);
    if (!st?.owned) return 0;
    let parcels;
    try {
      parcels = normalizeParcels(await account.butlerParcels());
    } catch (err) {
      console.warn('[neighbours]', err?.message || err);
      return 0;
    }
    const added = mergeParcels(st, parcels);
    if (added) {
      parcelsMerged += added;
      engine.save?.();
      butlerApi.parcelsArrived?.(engine);
    }
    publish();
    return added;
  }

  butlerApi.setParcelHook?.({
    owns: isSiteParcel,
    /** giveStack: the site moves a package into my ledger first; true when the pack should get it. */
    async take(eng, id) {
      try {
        const a = await account.takeParcel(id);
        if (!a?.item || !a.credit) return false;
        // Once per credit (the trade slice remembers it, so the ledger counts it once).
        return eng.query?.('ledgerReceipt', String(a.credit), eng) !== false;
      } catch (err) {
        notice(err?.message || T.failed, 3600);
        return false;
      }
    },
  });


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
  // Slice 2: the Butler's answer to me as a visitor; parcels and tending for me as the owner.
  client.on('msg:butler_left', (msg) => {
    if (vb) vb.busy = false;
    if (!visit || Number(msg.owner) !== visit.owner) return;
    const item = msg.item && typeof msg.item === 'object' ? { c: String(msg.item.c || ''), n: Math.max(0, Math.floor(Number(msg.item.n) || 0)) } : null;
    if (msg.status !== 'settled') {
      butlerSay(String(msg.text || BT.packageFail));
      return;
    }
    if (item?.c) {
      // Once per parcel (LedgerSpend's way: the trade slice remembers the op).
      const receipt = engine.query?.('ledgerReceipt', String(msg.op || ''), engine);
      if (receipt !== false && countItem(engine.inv, item.c) > 0) removeItem(engine.inv, item.c, Math.min(item.n, countItem(engine.inv, item.c)));
      engine.refreshPack?.();
      const gift = noteGift(slice.gifted, visit.owner);
      slice.gifted = gift.gifted;
      if (gift.counted && receipt !== false) {
        count(NEIGHBOUR_COUNTERS.gifts, 1);
        // bag_butler.js:3802-3805: the first package left with this Butler.
        engine.featsIncrement?.('visiting_stones', 2);
      }
      butlerSay(BT.packageConfirm(visit.name));
    } else {
      butlerSay(BT.messageSuccess(visit.name));
    }
    engine.save?.();
  });
  client.on('msg:butler_parcel', (msg) => {
    notice(BT.parcelArrived(String(msg.from?.name || 'Someone'), msg.item === true, msg.message === true), 4200);
    loadParcels();
  });
  client.on('msg:home_tended', (msg) => {
    const owner = Number(msg.owner) || 0;
    if (owner === me()) loadTending();
    else if (visit?.owner === owner) applyToCopy(normalizeTendActs(msg.acts));
  });
  client.on('msg:home_hosted', (msg) => {
    for (const counter of hostedCounters(msg)) engine.achievement?.(counter, 1);
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
  loadParcels();
  loadTending();

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
      const scene = homesFeature._state?.().scene;
      // A Tower floor or an upper house floor (G153, home-floors.js) is a room of its own: not the street visitors share.
      const ownRoom = scene?.tower != null || Number(scene?.houseFloor) > 0;
      return sharedHomeStreet({ visit, me: me(), inHome: home.inHome === true, room: home.room, towerFloor: ownRoom });
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
      if (target.classId === VISITOR_BUTLER_CLASS) return this.butlerVerbs();
      if (target.classId === CLASS_DOOR) return doorVerbs({ key: visit.key, letIn: visit.letIn, ownerName: visit.name });
      if (target.classId === CLASS_GATE) return [{ id: 'go_back', label: T.goBackVerb, tooltip: `Back to ${labelOf(visit.returnTo)}`, enabled: true, reason: '' }];
      if (target.classId === CLASS_FRONT) return [{ id: 'go_outside', label: T.outsideVerb, tooltip: `Back to ${homeStreetName(visit.name)}`, enabled: true, reason: '' }];
      return [];
    },
    runVerb(target, verbId) {
      if (BUTLER_VERB_IDS.has(verbId)) return this.runButler(verbId);
      if (verbId === 'enter') goInside();
      else if (verbId === 'knock') knock();
      else if (verbId === 'go_back') goBack();
      else if (verbId === 'go_outside') goOutside();
      else return false;
      return true;
    },
    ownsGarden: (target) => Boolean(bedOf(target) || visit?.gardens?.has(target)),
    mayTend: () => visit?.key === true,
    ownerName: () => visit?.name || '',
    tick(dtMs, now) {
      tickButler(dtMs);
      scanGardens(now);
    },
    butlerVerbs() {
      if (!vb || !visit) return [];
      const busy = vb.busy ? BT.interactFail : '';
      return [
        { ...BV.talk, enabled: true, reason: '' },
        { ...BV.leavePackage, enabled: !busy, reason: busy },
        { ...BV.leaveMessage, enabled: !busy, reason: busy },
      ];
    },
    runButler(verbId) {
      if (verbId === BV.talk.id) butlerSay(greeting());
      else if (verbId === BV.leavePackage.id) leavePackage();
      else if (verbId === BV.leaveMessage.id) leaveMessage();
      else return false;
      return true;
    },
    loadParcels,
    loadTending,
    /** QA: stand beside the visited Butler ('butler'), your own ('ownbutler'), or the first garden bed ('garden'), then E opens its menu. */
    standNear(what = 'butler') {
      const p = engine.player;
      let x = null;
      if (what === 'butler' && vb) x = vb.box.x - 60;
      else if (what === 'ownbutler') x = butlerApi.hiSpot?.(engine)?.x - 60;
      else if (what === 'garden') {
        const e = visit ? [...visit.beds.keys()][0] : (engine.interactables || []).find((t) => t.classId === 'garden_new');
        x = e?.sprite?.x;
      }
      if (!p || !Number.isFinite(x)) return false;
      p.x = x;
      p.vx = 0;
      return true;
    },
    /** QA: how many of a class the pack holds. */
    count: (c) => countItem(engine.inv, String(c)),
    /** QA: the visit's garden beds and their plots as the copy shows them. */
    beds: () => (visit ? [...visit.beds.values()].map((b) => ({ yard: b.yard, id: b.id, herb: b.herb, plots: b.snap })) : []),
    get slice() { return slice; },
    get butler() { return vb; },
  };
}

let session = null;
let guard = false;
/** The slice restored before the session starts (the session keeps it from then on). */
let savedSlice = null;

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
    ensure(engine)?.tick(dtMs, now);
  },

  /** Slice 2: the acts of key-holders my save has applied, and the owners I have left a package with. */
  save() {
    const s = session?.slice || (savedSlice ? normalizeNeighboursSlice(savedSlice) : null);
    if (!s || (!s.tended.length && !s.gifted.length && !Object.keys(s.counts).length)) return undefined;
    return { tended: s.tended, gifted: s.gifted, counts: s.counts };
  },

  restore(slice, engine) {
    savedSlice = engine?.mode === 'multiplayer' ? normalizeNeighboursSlice(slice) : null;
  },

  onStreetEnter() {
    session?.left();
  },

  /** realtime-feature: the street shared on someone's home (or yours), HOME_<id> or HOUSE_<id>. */
  realtimeStreet(engine) {
    if (!session || engine?.mode !== 'multiplayer') return null;
    return session.street() || null;
  },

  /** G329 (features/quests-mp-feature.js): the other player's home you stand on, and whether you hold their key. */
  neighboursVisiting(engine) {
    if (!session?.visit || engine?.mode !== 'multiplayer') return null;
    return { owner: session.visit.owner, key: session.mayTend() };
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
      // garden_new.js tend conditions: the owner or a key-holder; the copy's own verbs run, and the site keeps the change.
      if (session.mayTend()) return null;
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
