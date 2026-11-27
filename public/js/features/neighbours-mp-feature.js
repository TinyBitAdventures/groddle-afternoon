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
 * - Ticket 112: the gift the owner leaves with the Butler for visitors is
 *   kept by the site (src/ButlerGifts.php), not the save, so a visitor gets
 *   one while the owner is away: the realtime server (homes_help.go) asks
 *   the site when a visitor comes onto the home street, which notes the
 *   visit and credits the visitor one of the gift, once per visitor per
 *   class (bag_butler.js giveGift); the visitor is told (butler_gift) and
 *   the owner, online, too (butler_visit). The owner's game reads the stock
 *   and the visits into its Butler (applyButlerStock) for the give verb and
 *   "who visited?", gives through the site (butlerApi.setGiftHook), and
 *   brings a gift its save held from before into the site's stock once
 *   (butler/stock/adopt).
 * - Visitors tend the owner's gardens: the home street's are public (G777,
 *   #354, #364: include/garden.js isPublic 1244-1247, main.js doGardenAction
 *   6513-6518), the back yard's need a key (garden_new.js tend: the owner or
 *   a key-holder). Their garden verbs run on their copy of the plots, and
 *   each water, plant, clear or harvest goes to the site
 *   (src/HomeTending.php), which checks it against the owner's stored
 *   gardens and keeps it; the owner's game applies the waiting acts to its
 *   own gardens (on load, and at once through home_tend_tell), and the
 *   others on that street see it too. A back yard garden without a key
 *   still says "That belongs to <name>." On the home street the planter
 *   has the first minute on the ripe crop (include/garden.js 1042-1046,
 *   GardenView.as 481-486; homePlotHeld), the owner's own planting too.
 * - Counted from these acts: neighbors_resources_tended, water_garden_for_others,
 *   give_bag_butler (reimagined: GSJS never counts them),
 *   herb_seeds_planted_for_others (include/garden.js:394-396), and the
 *   owner's hosted_party (crowded_house, house_party: locations/home.js:55-66,
 *   told by the server).
 *
 * A visited street's Patches, trees, animals, rocks and resource nodes and
 * their visitor verbs are features/yard-verbs-mp-feature.js; the Magic
 * Rock's daily iMG from visitors is features/home-pool-mp-feature.js.
 *
 * The Tower (MPVISIT): the owner's Tower stands on their street as they
 * built it (homes-feature visitorHomeScene, from the site's copy of their
 * Tower and its floors). The source's Tower is a public home location: anyone
 * the owner has not blocked may Enter it (locations/tower.js:2-22,
 * inc_pols.js:452-458) and ride the elevator to every floor (its signposts
 * lead back into the Tower with no check, tower.js:584-620). Its furniture
 * stays the owner's: furniture_base's pickup, flip, upgrade and style are
 * the owner's alone (furniture_tower_chassis.js:64-339), so a visitor looks.
 * Each floor is TOWER_<id>_<floor> on the realtime server, the owner's too,
 * so the owner and visitors on a floor see each other.
 * G795: once the owner starts a floor at the Workbench, a visitor may ride to
 * the floor under construction and help build it: its Workbench's construct
 * (items/tower_expander.js offerJobs; items/include/jobs.js has no owner
 * check) opens the floor's shared project (features/home-street-mp-feature.js
 * towerFloorVisit, the realtime server's kind "tower"). Starting a floor and
 * the Tower's other verbs stay the owner's. On that floor a visitor keeps to
 * the planks, as the owner does (tower_build_expansion, clampToExpansion).
 *
 * QA: canvas data neighboursVisit (owner:room), neighboursKeys (given/received
 * counts), neighboursLast, neighboursButler (the visitor Butler: name@x),
 * neighboursParcels (merged into my Butler), neighboursButlerStock (ticket
 * 112: my Butler's gift on the site, class:count, and the visits it noted),
 * neighboursButlerGifts (gifts a Butler gave me this session), neighboursTended (acts applied
 * to my gardens / acts the site took from me); window.groddleNeighbours in
 * multiplayer.
 */

import { createMinnAccount } from '../minn-account.js?v=7e3d7279';
import { runStreetTransition } from '../screen-fx.js?v=7cd62cca';
import { STREET_INDEX } from '../street-loader.js?v=10376267';
import { ITEM_CATALOG, addItem, countItem, listPackItemSlots, removeItem } from '../inventory.js?v=3be7988a';
import { copyPicks, leavingWire, markLeaving, receiveWire, takeCopies } from '../copy-picks.js?v=b368fd49';
import { cultivationDef, homeStreetLayout } from '../home-cultivation.js?v=b2868d29';
import { getPlot, tickGarden } from '../garden.js?v=fefa7bcd';
import { BUTLER_RIG_SCALE, ButlerPainter, butlerRigNow, loadButlerRig } from '../butler-rig.js?v=a709fbf2';
import { BUTLER, BUTLER_INFO, butlerInfoText, butlerPostRx, normalizeButlerParts } from '../butler.js?v=5d1199a7';
import { butlerApi } from './butler-feature.js?v=dd507f05';
import { homesFeature, visitorHomeScene, visitorHomeState } from './homes-feature.js?v=ac211489';
import { visitRadio } from '../vine-radio.js?v=5436aa09';
import { homeMusicFile } from '../homes.js?v=dca6b2cd';
import { streetStyleFor } from '../home-styles.js?v=ec5d2f69';
import { visitGardenPlots, visitSceneKey } from '../home-live.js?v=9c7abae7';
import {
  BUTLER_MESSAGE_MAX,
  KEY_VERB,
  NEIGHBOURS_TEXT as T,
  NEIGHBOUR_COUNTERS,
  VISITOR_BUTLER_CLASS,
  VISITOR_BUTLER_TEXT as BT,
  VISITOR_BUTLER_VERBS as BV,
  VISIT_VERB,
  applyButlerStock,
  applyTendAct,
  butlerGiftOp,
  createVisitPassKeeper,
  doorVerbs,
  givenLine,
  holdsKeyFrom,
  HOME_PLANTER_HOLD_LINE,
  homePlotHeld,
  homeStreetFor,
  homeStreetName,
  hostedCounters,
  houseName,
  isButlerVisitOp,
  isSiteParcel,
  keyCandidates,
  mayTendYard,
  mergeParcels,
  normalizeHomeView,
  normalizeKeys,
  normalizeNeighboursSlice,
  homeVisitKey,
  homeVisitSeen,
  normalizeParcels,
  normalizeButlerStock,
  normalizeGiftAnswer,
  normalizeTendActs,
  GIFT_QUEST,
  OWNER_STACK_TEXT,
  isOwnerStackId,
  ownerStacksFor,
  giftedThisQuest,
  noteGift,
  outText,
  plotsSnapshot,
  possessive,
  readVisitScene,
  receivedLine,
  sharedHomeStreet,
  summonHomePlace,
  tendAct,
  tendCounters,
  tendedText,
  TENDED_KEEP,
  takeFreshTendActs,
  visitedTowerName,
  visitSceneTsid,
  forgetInside,
  insideProof,
  rememberInside,
} from '../neighbours-mp.js?v=6d97fefa';
import { itemZ } from '../item-bands.js?v=ec366be3';
import { butlerCarries, registerButlerDrop } from '../butler-drop.js?v=c958ef1d';
import { takeDragged } from '../drag-stack.js?v=e0138d76';
import { worldPoint } from './world-drop-feature.js?v=707fc5a0';
import { clampToExpansion, elevatorStops, floorJobFor, TOWER_JOBS } from '../home-tower.js?v=a7fc0cce';

export const NEIGHBOURS_MP_FEATURE_ID = 'neighbours-mp';
const OWN_VERBS = new Set([VISIT_VERB.id, KEY_VERB.id, 'neighbour_noop']);
const BUTLER_VERB_IDS = new Set(Object.values(BV).map((v) => v.id));
const CLASS_DOOR = 'mp_home_door';
const CLASS_GATE = 'mp_home_gate';
const CLASS_FRONT = 'mp_home_front_door';
const CLASS_TOWER = 'mp_home_tower';
const CLASS_LIFT = 'mp_home_tower_elevator';
const CLASS_TOWER_EXIT = 'mp_home_tower_exit';
/** R5 (G1313): a Door between the visited house's floors (furniture_door.js: no verb asks who you are). */
const CLASS_STAIRS = 'mp_home_floor_door';
/** G795: the Workbench on the floor under construction (tower_expander). */
const CLASS_BENCH = 'mp_home_tower_bench';
/** gifts-feature's wrapped Gift Box (js/gifts.js GIFT_WRAPPED). */
const GIFT_WRAPPED_CLASS = 'bag_gift_box_wrapped';

const STYLE = `
.keys-shade { position: fixed; inset: 0; z-index: var(--z-screen); display: grid; place-items: center; padding: var(--sp-8); background: color-mix(in srgb, var(--c-sage-23) 45%, transparent); }
.keys-shade[hidden] { display: none; }
.keys-panel { width: min(30rem, 100%); max-height: calc(100vh - 2rem); max-height: calc(100dvh - 2rem); overflow: auto; overscroll-behavior: contain; border-radius: var(--radius-2xl); padding: var(--sp-8) var(--sp-9) var(--sp-9);
  background: var(--surface-card); color: var(--c-sand-28); box-shadow: var(--shadow-3); font: var(--fs-base)/var(--lh-loose) var(--font-system); }
.keys-panel h2 { margin: 0 0 var(--sp-1); font-size: var(--fs-xl); }
.keys-panel .keys-sub { margin: 0 0 var(--sp-5); opacity: 0.8; }
.keys-panel h3 { margin: var(--sp-7) 0 var(--sp-3); font-size: var(--fs-lg); color: var(--c-lime-49); }
.keys-panel p { margin: var(--sp-3) 0; }
.keys-panel .keys-close { float: right; border: 0; padding: 0.2rem 0.55rem; color: var(--c-sand-28); background: transparent; font-size: var(--fs-2xl); line-height: var(--lh-none); cursor: pointer; }
.keys-panel .keys-tabs { display: flex; gap: var(--sp-3); margin: 0.2rem 0 var(--sp-3); }
.keys-panel .keys-tabs button { font: inherit; font-weight: 700; border: 0; border-radius: var(--radius-pill); padding: 0.3rem 0.8rem; cursor: pointer; color: var(--text-heading); background: var(--surface-parchment); }
.keys-panel .keys-tabs button[aria-pressed="true"] { color: var(--text-inverse); background: var(--c-lime-60); }
.keys-panel ul { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--sp-3); }
.keys-panel li { display: flex; flex-wrap: wrap; align-items: center; gap: 0.3rem var(--sp-5); padding: 0.45rem var(--sp-5); border-radius: var(--radius-md); background: var(--surface-parchment); }
.keys-panel li .key-what { flex: 1 1 12rem; }
.keys-panel li .key-what small { display: block; opacity: 0.8; }
.keys-panel button.key-act { font: inherit; font-weight: 700; border: 0; border-radius: var(--radius-md); padding: 0.3rem var(--sp-5); cursor: pointer; color: var(--text-moss); background: var(--surface-moss); box-shadow: inset 0 0 0 2px var(--c-lime-85); }
.keys-panel button.key-act:disabled { opacity: 0.55; cursor: default; }
.keys-panel .keys-none { opacity: 0.75; font-style: italic; }
.keys-panel .keys-roommate { padding: 0.45rem var(--sp-5); border-radius: var(--radius-md); background: var(--status-warn-soft); }
.keys-panel .keys-note { min-height: 1.4em; margin-top: var(--sp-5); font-weight: 600; color: var(--c-lime-49); }
.keys-panel .keys-note[data-tone="bad"] { color: var(--text-danger); }
.keys-panel textarea { box-sizing: border-box; width: 100%; min-height: 5.5rem; margin: var(--sp-3) 0; padding: 0.45rem 0.55rem; border-radius: var(--radius-md); border: 2px solid var(--c-sand-86); font: inherit; resize: vertical; background: var(--surface-bright); color: var(--c-sand-28); }
/* Report 227: the buttons stay in view at the foot of a long pick list (the panel scrolls, they do not). */
.keys-panel .butler-actions { display: flex; flex-wrap: wrap; gap: var(--sp-4); justify-content: flex-end; align-items: center;
  position: sticky; bottom: calc(-1 * var(--sp-9)); z-index: var(--z-raised);
  margin: var(--sp-3) calc(-1 * var(--sp-9)) calc(-1 * var(--sp-9)); padding: var(--sp-5) var(--sp-9) var(--sp-9);
  background: var(--surface-card); box-shadow: 0 -6px 6px -6px color-mix(in srgb, var(--c-sand-28) 30%, transparent); }
.keys-panel .butler-stacks { display: grid; grid-template-columns: repeat(auto-fill, minmax(5.4rem, 1fr)); gap: var(--sp-3); }
.keys-panel .butler-stacks button { display: grid; justify-items: center; gap: var(--sp-1); padding: var(--sp-3) var(--sp-2); border: 0; border-radius: var(--radius-md); background: var(--surface-parchment); color: var(--c-sand-28); font: inherit; font-size: var(--fs-base); cursor: pointer; }
.keys-panel .butler-stacks button[aria-pressed="true"] { box-shadow: inset 0 0 0 2px var(--c-lime-60); background: var(--surface-moss); }
.keys-panel .butler-stacks img { width: 40px; height: 40px; object-fit: contain; }
.keys-panel input[type="number"] { width: 5rem; font: inherit; padding: var(--sp-2) var(--sp-3); border-radius: var(--radius-md); border: 2px solid var(--c-sand-86); }
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
  /** Visit scenes being shown now (show(): the visit is set before its scene is entered). */
  let showing = 0;
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
  /** The held gift quest's count (report 128), null when it is not held. */
  const giftsCounted = () => {
    const quest = engine.questState?.active?.[GIFT_QUEST];
    return quest ? Number(quest.progress?.[NEIGHBOUR_COUNTERS.gifts]) || 0 : null;
  };
  slice.gifted = giftedThisQuest(slice.gifted, giftsCounted());
  /** The owner's Butler on a visited street: { box, sprite, painter, source, target, t, greeted, busy }. */
  let vb = null;
  /** Acts on the owner's gardens waiting to go to the site; the site's answers counted. */
  let tendQueue = [];
  let tendTimer = 0;
  let tendSent = 0;
  let tendApplied = 0;
  let parcelsMerged = 0;
  let lastGardenScan = 0;
  let liveLast = '';
  let liveRebuilds = 0;

  const me = () => Number(client.me?.id) || 0;

  function publish() {
    engine.setData?.('neighboursVisit', visit ? `${visit.owner}:${visit.room}${visit.room === 'tower' || (visit.room === 'interior' && visit.floor) ? `:${visit.floor}` : ''}` : '');
    engine.setData?.('neighboursKeys', keys ? `${keys.given.length}/${keys.received.length}` : '');
    engine.setData?.('neighboursLast', last);
    engine.setData?.('neighboursAllow', visitors ? String(visitors.allow === true) : '');
    engine.setData?.('neighboursButler', vb?.target ? `${vb.name}@${Math.round(vb.box.x)}` : '');
    // PORCH: the owner's Mailbox on their street (where they moved it, else the house's sign corner).
    engine.setData?.('neighboursMailbox', visit?.room === 'street' && Number.isFinite(visit.mailboxX) ? String(Math.round(visit.mailboxX)) : '');
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

  // R31 (#522): a fresh pass from the site before this one runs out, and whenever the server refuses one.
  const passes = createVisitPassKeeper({
    fetchView: async (owner) => normalizeHomeView(await account.home(owner, insideProof(owner))),
    onView: (owner, view) => {
      if (visit?.owner !== owner) return;
      visit.view.pass = view.pass;
      visit.view.passTtl = view.passTtl;
      sendPass();
    },
    onGone: (owner, err) => {
      if (visit?.owner !== owner) return;
      notice(err?.message || T.passLost, 3600);
      goBack();
    },
    onLost: (owner) => {
      if (visit?.owner === owner) notice(T.passLost, 4200);
    },
  });

  /** The server refused the street (home_private) or the pass (homes): the pass again, or a fresh one, then the street. */
  function rejoin(code) {
    if (!visit) return;
    if (code === 'home_private') needRejoin = true;
    if (passes.owner !== visit.owner) passes.start(visit.owner, visit.view);
    if (passes.refused(code) === 'resend') sendPass();
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

  /**
   * houses_visit (or visiting_visit_random with ownerId 0): the site checks, then the owner's street.
   * G668: a summons there (`summoned`) lands in its room (`room`, `floor`) beside the summoner (`at`),
   * or (`door`) at the house's front door outside, where walking out of it leaves you (goOutside).
   */
  async function visitHome(ownerId, { random = false, name = '', room = 'street', floor = 0, at = null, summoned = false, door = false } = {}) {
    const block = visitBlock();
    if (block) {
      notice(block, 2600);
      return false;
    }
    if (busy) return false;
    if (!random && Number(ownerId) === me()) {
      engine.homeTravel?.(room === 'interior' ? 'teleport-inside' : 'teleport');
      return true;
    }
    busy = true;
    let view;
    try {
      view = normalizeHomeView(random ? await account.visitRandom() : await account.home(ownerId, insideProof(ownerId)));
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
    passes.start(visit.owner, view);
    sendPass();
    if (summoned) {
      // A Tower that is not built is no floor to land on: the home street then.
      const tower = room === 'tower' && visitorHomeState(view).tower;
      if (door) await show('street', { arrive: 'door' });
      // G1018: the house only when the site shows it (the summons' proof, home_inside); else its door.
      else if (room === 'interior' && !view.inside) await show('street', { arrive: 'door' });
      else await show(room === 'tower' && !tower ? 'street' : room, { floor, at });
      // inc_teleportation.js:676 achievements_increment('teleportation_others', 'summonee').
      engine.achievement?.('teleportation_others:summonee', 1);
      return true;
    }
    await show('street');
    if (view.random) engine.achievement?.(`visit_random:${view.owner.id}`, 1);
    notice(T.visited(visit.name), 3200);
    return true;
  }

  /** The visit scene for a room, through the loading card. */
  async function show(room, { arrive = '', floor = 0, via = '', at = null, doorX = null } = {}) {
    if (!visit) return;
    showing += 1;
    try {
      await showScene(room, { arrive, floor, via, at, doorX });
    } finally {
      showing -= 1;
    }
  }

  async function showScene(room, { arrive, floor, via, at, doorX = null, quiet = false }) {
    const built = visitorHomeScene(engine, visit.view, room, { returnLabel: wayOutOf(visit.returnTo).label, floor, via, doorX });
    const tower = room === 'tower' ? visitorHomeState(visit.view).tower : null;
    const stop = tower ? elevatorStops(tower).find((row) => row.index === built.floor) : null;
    const label = room === 'interior' ? houseName(visit.name) : room === 'tower' ? visitedTowerName(visit.name, tower) : homeStreetName(visit.name);
    let x = arrive === 'door' && room === 'street' ? built.doorX + 70 : built.spawnX;
    // #523: Glitch's Tower exit is the chassis x,y (inc_homes.js 3097-3112 tower_set_exit).
    if (arrive === 'tower' && room === 'street' && Number.isFinite(visit.towerX)) x = visit.towerX;
    // G668: summoned, beside the summoner (inc_teleportation.js:660, x + 20), inside the room.
    if (at != null && Number.isFinite(Number(at))) x = Math.max(40, Math.min(built.width - 40, Math.round(Number(at))));
    const scene = {
      tsid: visitSceneTsid(visit.owner, room, built.floor),
      label,
      hubName: stop ? stop.label : 'Homes',
      width: built.width,
      height: built.height,
      background: built.background,
      platforms: built.platforms,
      walls: [],
      spawn: { x, y: built.groundY },
      returnTo: visit.returnTo,
      // #474: the visited home's own music, as at your own. #661: its street style now (the owner's
      // Change Style rebuilds this scene in place, G944), not the look it was bought in.
      musicFile: homeMusicFile(streetStyleFor(visitorHomeState(visit.view).streetStyle, visitorHomeState(visit.view).style)),
      // G1245: the owner's Vine Radio, out on their street: its music plays here instead (street only).
      homeRadio: room === 'street' ? visitRadio(visitorHomeState(visit.view).cult, { owner: visit.name, ownerId: visit.owner }) : null,
      // G944: rebuilt in place for the owner's change: the windows open here stay.
      keepWindows: quiet,
    };
    const from = { label: engine.street?.label || '', hub: engine.street?.hubName || '' };
    // G1227 (#644): this home's own room remembers its last visit (a rebuild in place is no visit).
    const seen = quiet ? null : homeVisitSeen(slice, homeVisitKey(visit.owner, room, built.floor));
    if (seen) engine.save?.();
    const setup = () => {
      if (!visit) return;
      visit.room = room;
      // R5 (G1313): a floor of the house too (0 the ground floor), as a Tower floor.
      visit.floor = room === 'tower' || room === 'interior' ? Number(built.floor) || 0 : 0;
      visit.construction = room === 'tower' && built.construction === true;
      engine.enterScene(scene);
      dropButler();
      const spots = built.populate(engine);
      // G1190: the house's left end as drawn here, which the owner's stacks indoors are kept against.
      visit.roomX = room === 'interior' ? Number(spots?.roomX) || 0 : 0;
      engine.redrawDroppedStacks?.();
      registerTargets(room, spots);
      // HOMES3 (features/home-street-mp-feature.js): the signpost, Note Poles, furniture for sale and restorations here.
      if (room !== 'tower') engine.query?.('homeStreetVisit', { owner: visit.owner, name: visit.name, room, floor: visit.floor, key: visit.key, view: visit.view, built, spots }, engine);
      // G1245: the owner's Vine Radio (features/vine-radio-feature.js draws it, its notes and label; null when none stands here).
      engine.query?.('homeRadioVisit', { owner: visit.owner, name: visit.name, room, radio: room === 'street' ? spots?.radio || null : null, quiet: quiet === true }, engine);
      if (room === 'street') {
        spawnVisitorButler(built.groundY);
        // location.js:160-168: another player's home street (not their house), one label per street.
        engine.achievement?.(`player_streets_visited:${visitSceneTsid(visit.owner, 'street')}`, 1);
      }
      publish();
    };
    const fx = document.getElementById('screen-transition');
    if (!fx || quiet) setup();
    else {
      await runStreetTransition(fx, {
        fromLabel: from.label,
        fromHub: from.hub,
        toLabel: label,
        toHub: 'Homes',
        pol: { type: room === 'street' ? 'exterior' : 'interior', ownerName: visit.name, ...(seen ? { visit: seen } : {}) },
        onMid: setup,
      });
    }
  }

  function registerTargets(room, spots) {
    const t = {};
    if (room === 'street') {
      t.door = engine.register({ classId: CLASS_DOOR, featureId: NEIGHBOURS_MP_FEATURE_ID, label: houseName(visit.name), subtitle: `The indoor half of ${possessive(visit.name)} home`, sprite: spots.door, state: { owner: visit.owner } });
      // GATESIGN2: the signpost's top arm, Back to Ur; its tip the street the visitor came from.
      const way = wayOutOf(visit.returnTo);
      t.gate = engine.register({ classId: CLASS_GATE, featureId: NEIGHBOURS_MP_FEATURE_ID, label: 'Back to Ur', subtitle: `${way.label}${way.hubName && way.hubName !== way.label ? `, ${way.hubName}` : ''}`, sprite: spots.gate, state: { owner: visit.owner } });
      // FRIENDPOST: the arm itself takes you back (game.js takeSceneArm runs go_back); hovering it says where.
      for (const b of spots.gate?.signBoards || []) b.tip = way.label ? `Back to ${way.label}` : '';
      // MPVISIT: the owner's built Tower: Enter (furniture_tower_chassis enter; the owner's customize and flip are left off).
      visit.towerX = spots.tower?.box?.x;
      visit.mailboxX = spots.mailbox?.x;
      if (spots.tower?.built) {
        const tw = visitorHomeState(visit.view).tower;
        t.tower = engine.register({ classId: CLASS_TOWER, featureId: NEIGHBOURS_MP_FEATURE_ID, label: visitedTowerName(visit.name, tw), subtitle: `${tw.floors} floors`, sprite: spots.tower.box, state: { owner: visit.owner } });
      }
    } else if (room === 'tower') {
      const tw = visitorHomeState(visit.view).tower;
      const here = elevatorStops(tw).find((row) => row.index === visit.floor);
      t.lift = engine.register({ classId: CLASS_LIFT, featureId: NEIGHBOURS_MP_FEATURE_ID, label: 'Elevator', subtitle: `${here?.label || 'Ground Floor'} · ${towerStops(tw).length} stops`, sprite: spots.elevator, state: { owner: visit.owner } });
      if (spots.exit) t.exit = engine.register({ classId: CLASS_TOWER_EXIT, featureId: NEIGHBOURS_MP_FEATURE_ID, label: 'Exit', subtitle: `Back to ${homeStreetName(visit.name)}`, sprite: spots.exit, state: { owner: visit.owner } });
      // G795: the floor going up has its Workbench, and anyone here may help build it.
      if (spots.workbench) t.bench = engine.register({ classId: CLASS_BENCH, featureId: NEIGHBOURS_MP_FEATURE_ID, label: 'Workbench', subtitle: `Construct ${TOWER_JOBS[floorJobFor(tw.floors)]?.title || 'a new floor'}`, sprite: spots.workbench, state: { owner: visit.owner } });
    } else {
      // Only the ground floor has the front door (homes_get_floor_config); every floor its Doors between floors (R5).
      if (spots.door) t.front = engine.register({ classId: CLASS_FRONT, featureId: NEIGHBOURS_MP_FEATURE_ID, label: 'Front Door', subtitle: `Back to ${homeStreetName(visit.name)}`, sprite: spots.door, state: { owner: visit.owner } });
      t.stairs = (spots.doors || []).map((d) => engine.register({ classId: CLASS_STAIRS, featureId: NEIGHBOURS_MP_FEATURE_ID, label: 'Door', subtitle: d.label, sprite: d.sprite, state: { owner: visit.owner, dest: d.dest } }));
    }
    visit.targets = t;
    visit.gardens = new Set(spots.gardens || []);
    visit.beds = mapBeds(room, spots.gardens || []);
  }

  // G944 (M4): the owner changed their home while I am there.

  let homeReading = false;
  let homeAgain = false;

  /**
   * home_refresh "home" (features/home-live-feature.js, homes_street.go): the owner's home is read
   * again from the site. A different look (furniture, decor, cultivations, styles, the Tower)
   * builds the room I stand in again where I stand, with no loading card (Glitch sent the whole
   * location the new geometry: inc_homes.js apiGeometryUpdated); the same look with other crops
   * updates the gardens in place. `rebuild`: build it again whatever changed (the yard named
   * something new or gone, features/yard-verbs-mp-feature.js).
   */
  async function refreshHome({ rebuild = false } = {}) {
    if (!visit) return false;
    if (homeReading) {
      homeAgain = true;
      return true;
    }
    homeReading = true;
    const owner = visit.owner;
    try {
      // My own garden acts not yet sent go first, so the site's copy has them.
      lastGardenScan = 0;
      scanGardens(Date.now());
      const view = normalizeHomeView(await account.home(owner, insideProof(owner)));
      if (!view || visit?.owner !== owner || !readVisitScene(engine.streetTsid)) return false;
      const same = !rebuild && visitSceneKey(view) === visitSceneKey(visit.view);
      visit.view = view;
      visit.key = visit.key || view.key === true;
      // G1190: the owner's own stacks as the site read them now.
      engine.redrawDroppedStacks?.();
      if (same) applyGardens(view);
      else await rebuildRoom();
      liveLast = same ? 'gardens' : 'rebuilt';
      publish();
      return true;
    } catch (err) {
      console.warn('[neighbours]', err?.message || err);
      return false;
    } finally {
      homeReading = false;
      if (homeAgain) {
        homeAgain = false;
        refreshHome();
      }
    }
  }

  /** The room I stand in, built again from visit.view where I stand. */
  async function rebuildRoom() {
    if (!visit || showing) return false;
    showing += 1;
    try {
      await showScene(visit.room, { arrive: '', floor: visit.floor || 0, via: '', at: Math.round(engine.player?.x || 0), quiet: true });
    } finally {
      showing -= 1;
    }
    liveRebuilds += 1;
    return true;
  }

  /** Each garden drawn here takes its plots from the site's view (as revertPlot does for one). */
  function applyGardens(view) {
    for (const [e, bed] of visit.beds) {
      const plots = visitGardenPlots(view, bed.yard, bed.id);
      const garden = e.state?.garden;
      if (!plots || !garden?.plots) continue;
      for (const [key, plot] of Object.entries(plots)) {
        if (garden.plots[key] && plot && typeof plot === 'object') Object.assign(garden.plots[key], JSON.parse(JSON.stringify(plot)));
      }
      bed.snap = plotsSnapshot(garden);
      engine.refreshGarden?.(e);
    }
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
      // The site waters a neighbour's dry plots only (HomeTending.php refuse): js/garden.js plotNeedsWater.
      e.state.garden.dryOnly = true;
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

  /** A visitor's garden verbs changed their copy: what changed goes to the site (G777: the home street's beds need no key). */
  function scanGardens(now) {
    if (!visit?.beds.size || now - lastGardenScan < 300) return;
    lastGardenScan = now;
    for (const [e, bed] of visit.beds) {
      if (!mayTendYard(bed.yard, visit.key)) continue;
      const after = plotsSnapshot(e.state?.garden);
      for (const key of Object.keys(after)) {
        const a = tendAct(bed.snap[key], after[key]);
        if (!a) continue;
        tendQueue.push({ yard: bed.yard, garden: bed.id, plot: key, act: a.act, seed: a.seed, entity: e });
        // include/garden.js 384: my planting on the public street is mine for its minute (the site keeps the same).
        if (a.act === 'plant' && bed.yard === 'street' && me()) e.state.garden.plots[key].planter = me();
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

  /** Another visitor's acts (home_tended) on the copy this visit shows. */
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

  /**
   * My own gardens: what key-holders did while I was away (or just now). One ask at a time, and one
   * more after it when another was wanted meanwhile, so the site's answers are read in order
   * (takeFreshTendActs drops an id once an answer no longer lists it).
   */
  let tendLoading = null;
  let tendAgain = false;
  function loadTending() {
    if (tendLoading) {
      tendAgain = true;
      return tendLoading;
    }
    tendLoading = (async () => {
      let n = 0;
      do {
        tendAgain = false;
        n += await loadTendingOnce();
      } while (tendAgain);
      return n;
    })().finally(() => {
      tendLoading = null;
    });
    return tendLoading;
  }

  async function loadTendingOnce() {
    if (!homesFeature._state) return 0;
    let acts;
    try {
      acts = normalizeTendActs((await account.tending())?.acts);
    } catch (err) {
      console.warn('[neighbours]', err?.message || err);
      return 0;
    }
    const st = homesFeature._state();
    const take = takeFreshTendActs(acts, slice.tended);
    const fresh = take.fresh;
    const changed = new Set();
    for (const a of fresh) {
      const where = a.yard === 'back' ? st.backCult : st.cult;
      const garden = where?.gardens?.[a.garden];
      if (garden && applyTendAct(garden, a, tickGarden)) changed.add(garden);
    }
    // Every act still waiting is applied now: the save names each once, until the site lets it go.
    slice.tended = take.tended.slice(-TENDED_KEEP);
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
    // info: the owner's leave info line (bag_butler.js this.info), when the site sends it; butlerInfoText filters it.
    return b?.owned === true ? { name: String(b.name || '').slice(0, 19) || 'Butler', parts: normalizeButlerParts(b.parts), post: Number.isFinite(Number(b.post)) && b.post !== null ? Number(b.post) : null, info: typeof b.info === 'string' ? b.info.slice(0, BUTLER.INFO_MAX) : '' } : null;
  }

  function spawnVisitorButler(groundY) {
    const b = visit?.butler;
    if (!b || !engine.PIXI || !engine.entityLayer) return;
    const { PIXI } = engine;
    const layout = homeStreetLayout(visitorHomeState(visit.view).cult);
    // bag_butler.js target_loc: its post, else 660 right of the house, where the owner sees it stand (butlerPostRx).
    const x = Math.max(200, Math.min(layout.width - 200, layout.houseX + butlerPostRx(b.post)));
    const box = new PIXI.Container();
    box.zIndex = itemZ('bag_butler', 4);
    box.x = x;
    box.y = (Number(groundY) || engine.groundY || 0) + 2;
    engine.entityLayer.addChild(box);
    const me2 = { box, sprite: null, painter: null, source: null, target: null, t: 0, greeted: false, busy: false, full: '', name: b.name };
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
    return (visit?.key ? BT.friendGreeting(me3) : BT.strangerGreeting(me3, visit?.name || '')) + BT.visitorOwnerHome;
  }

  /**
   * Report 116: the owner's Butler goes with its street. clearWorldEntities only takes sprites
   * off the stage, so a Butler kept here went on ticking on the next street and greeted from a
   * visit that had ended (greeting read visit.key with no visit), which stopped the game loop.
   */
  function dropButler() {
    const b = vb;
    vb = null;
    if (!b) return;
    if (b.box && !b.box.destroyed) b.box.destroy({ children: true, texture: true, textureSource: true });
    b.painter = null;
    b.target = null;
    publish();
  }

  function tickButler(dtMs) {
    if (!vb || vb.box.destroyed || !visit) return;
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

  /**
   * tell me about... (bag_butler.js verbs.info 1580-1638): "This is <owner>'s home street.", then
   * "<owner> says: <info>" when the owner left any, and a Thanks! button. The Butler talks meanwhile.
   */
  function tellAbout() {
    if (!visit?.butler || vb?.busy) return;
    const out = butlerInfoText(visit.name, visit.butler.info);
    vb.busy = true;
    last = out.text;
    engine.setData?.('neighboursButlerInfo', out.text);
    openBox(visit.butler.name || 'Butler', (panel) => {
      const head = el('p', { class: 'keys-sub', 'data-butler-info-head': '' });
      head.append(el('strong', {}, out.head));
      panel.append(head);
      if (out.says) panel.append(el('p', { class: 'keys-sub', 'data-butler-info-says': '' }, out.says));
      const actions = el('div', { class: 'butler-actions' });
      const ok = el('button', { type: 'button', class: 'key-act', 'data-butler-info-ok': '' }, BUTLER_INFO.thanks);
      ok.addEventListener('click', () => closeBox(false));
      actions.append(ok);
      panel.append(actions);
    });
    publish();
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
      // G972: the one rule for the menu and a drag onto the Butler (js/butler-drop.js butlerCarries).
      if (!cls || cls === GIFT_WRAPPED_CLASS || !butlerCarries(cls)) continue;
      if (!seen.has(cls)) seen.set(cls, countItem(engine.inv, cls));
    }
    // R18 (G974): a class whose copies differ is one choice per copy (js/copy-picks.js), its note in the label.
    const out = [];
    for (const [c, n] of seen) {
      if (n <= 0) continue;
      const picks = engine.toolState ? copyPicks(engine.toolState, c) : null;
      if (!picks) out.push({ c, n });
      else for (const p of picks) out.push({ c, n: p.count, pick: { copy: p.copy, copies: p.copies, r: p.r, t: p.t }, note: p.note });
    }
    // G332, bag_butler.js:1013 and 1059: a wrapped Gift Box goes though it is no_trade; each box is its own choice.
    for (const b of engine.query?.('giftBoxList', engine) || []) {
      if (countItem(engine.inv, GIFT_WRAPPED_CLASS) < 1) break;
      out.push({ c: GIFT_WRAPPED_CLASS, n: 1, box: b });
    }
    return out;
  }

  /**
   * The count chooser's top: what is held, no more than the class's stackmax (main.js 5420-5425,
   * leave_package's limit_target_count_to_stackmax).
   */
  function leaveMax(st) {
    const cap = Number(ITEM_CATALOG[st.c]?.stackMax);
    return Math.max(1, Number.isFinite(cap) && cap > 0 ? Math.min(st.n, cap) : st.n);
  }

  /**
   * The Butler's leave package (its menu), or G972 a stack dragged onto it (`drop`: { cls, count }):
   * the same flow, the dragged class chosen. A single one goes straight to the Butler's question; a
   * stack opens the count chooser at the dragged count (LocationInputHandler.as 600-631 opened the
   * verb with the stack, requires_target_item_count).
   */
  function leavePackage(drop = null) {
    if (!visit?.butler || vb?.busy) return;
    const all = giftableStacks();
    const ofClass = drop ? all.filter((st) => st.c === drop.cls) : all;
    // A copy dragged (js/butler-drop.js passes its place among the class's copies) is that copy's choice.
    const dragged = drop && Number.isInteger(drop.copy) ? ofClass.filter((st) => st.pick?.copies.includes(drop.copy)) : [];
    const stacks = dragged.length ? dragged : ofClass;
    if (!stacks.length) return butlerSay(drop && all.length ? BT.packageTypeFail : BT.nothingToGive);
    if (drop && stacks.length === 1 && leaveMax(stacks[0]) === 1) {
      engine.setData?.('butlerLeaveFrom', 'drop');
      return confirmPackage(stacks[0].c, 1, stacks[0].box || null, stacks[0].pick || null, drop.ds || null);
    }
    engine.setData?.('butlerLeaveFrom', drop ? 'drop' : 'menu');
    vb.busy = true;
    let pick = stacks[0];
    const first = drop ? Math.min(leaveMax(pick), Math.max(1, Math.floor(Number(drop.count) || 1))) : 1;
    openBox(BT.pickTitle, (panel) => {
      panel.append(el('p', { class: 'keys-sub' }, BT.pickHint));
      const grid = el('div', { class: 'butler-stacks', 'data-butler-stacks': '' });
      const count = el('input', { type: 'number', min: '1', max: String(leaveMax(pick)), value: String(first), 'data-butler-count': '', 'aria-label': BT.howMany });
      count.value = String(first);
      for (const st of stacks) {
        const words = st.box ? boxLabel(st.box) : `${itemLabel(st.c, 1)}${st.note ? ` (${st.note})` : ''} ×${st.n}`;
        const b = el('button', { type: 'button', 'data-butler-stack': st.c, ...(st.box ? { 'data-butler-gift-box': st.box.id } : {}), ...(st.pick ? { 'data-butler-copy': String(st.pick.copy) } : {}), 'aria-pressed': String(st === pick), title: st.box ? words : `${itemLabel(st.c, st.n)}${st.note ? ` (${st.note})` : ''}` });
        const icon = ITEM_CATALOG[st.c]?.icon;
        if (icon) b.append(el('img', { src: icon, alt: '' }));
        b.append(document.createTextNode(words));
        b.addEventListener('click', () => {
          pick = st;
          count.max = String(leaveMax(st));
          count.value = String(Math.min(Number(count.value) || 1, leaveMax(st)));
          for (const o of grid.querySelectorAll('button')) o.setAttribute('aria-pressed', String(o === b));
        });
        grid.append(b);
      }
      const actions = el('div', { class: 'butler-actions' });
      const label = el('label', {}, `${BT.howMany} `);
      label.append(count);
      const ok = el('button', { type: 'button', class: 'key-act', 'data-butler-leave': '' }, BT.leave);
      ok.addEventListener('click', () => {
        const n = Math.max(1, Math.min(leaveMax(pick), Math.floor(Number(count.value) || 1)));
        closeBox(false);
        // #515: the stack dragged here gives the package (when it is still the class chosen).
        confirmPackage(pick.c, n, pick.box || null, pick.pick || null, drop?.ds?.cls === pick.c && !pick.box ? drop.ds : null);
      });
      actions.append(label, ok);
      panel.append(grid, actions);
    }, () => butlerSay(BT.packageNo));
  }

  /** leave_package's conversation (bag_butler.js 1100-1114), then the message (onLeavePackage 3830-3840). */
  /** A wrapped box in the pick list: whose it was and what is inside (the owner finds out when it is unwrapped). */
  function boxLabel(box) {
    return box.from?.name ? `${itemLabel(GIFT_WRAPPED_CLASS, 1)} from ${box.from.name}` : itemLabel(GIFT_WRAPPED_CLASS, 1);
  }

  /**
   * The copies chosen for the package under way (R18), or the stack dragged onto the Butler (#515,
   * `ds`, js/drag-stack.js): they leave when the Butler says it took it.
   */
  let leaving = null;

  function confirmPackage(c, n, box = null, chosen = null, ds = null) {
    if (!visit) return;
    vb && (vb.busy = true);
    const { owner, name } = visit;
    const words = itemLabel(c, n);
    const text = n > 1 ? BT.packageGivePlural(`${n} ${words}`, name) : BT.packageGiveSingle(words, name);
    butlerSay(text);
    const go = (yes) => {
      // #411: the prompt can be answered after the visit ended (or on another neighbour's
      // street); the Butler went with the visit, so the package stays in the pack.
      if (visit?.owner !== owner) {
        if (vb) vb.busy = false;
        return undefined;
      }
      if (!yes) {
        if (vb) vb.busy = false;
        return butlerSay(BT.packageNo);
      }
      butlerSay(BT.packageSuccess(name));
      // G974: the copy goes with its own wear and words (a named Cubimal arrives named).
      const item = box ? { c, n: 1, box: box.items, ref: box.id } : { c, n, ...leavingWire(engine.toolState, c, chosen, n) };
      leaving = chosen || ds ? { owner, c, pick: chosen, ds } : null;
      messageBox(BT.packageSuccess(name), (msg) => send({ item, text: msg, owner }), { optional: true });
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

  function send({ item = null, text = '', owner = visit?.owner }) {
    if (!visit || visit.owner !== owner) {
      if (vb) vb.busy = false;
      return;
    }
    if (!client.send('butler_leave', { owner: visit.owner, item, text })) {
      if (vb) vb.busy = false;
      notice(T.offline, 3000);
    }
  }

  // G972: a pack stack dragged onto the owner's Butler leaves it as a package (js/butler-drop.js), by
  // the mouse or the touch lift; the avatar walks into reach first, as the menu's leave package does.
  const gameCanvas = () => document.querySelector?.('#game-root > canvas') || null;

  function canLeave(cls) {
    if (cls === GIFT_WRAPPED_CLASS) return giftableStacks().some((st) => st.c === cls);
    return butlerCarries(cls) && countItem(engine.inv, cls) > 0;
  }

  function dropPackage(drop) {
    if (!visit?.butler || !vb?.target || vb.busy) return;
    const verb = { ...BV.leavePackage, enabled: true, reason: '' };
    if (!engine.requestVerb) return leavePackage(drop);
    engine.requestVerb(vb.target, verb, { run: () => leavePackage(drop) });
  }

  registerButlerDrop({
    engine,
    scope: gameCanvas,
    butlerAt(x, y) {
      if (!visit?.butler || !vb?.target) return null;
      const canvas = gameCanvas();
      const p = canvas && worldPoint(engine, canvas, x, y);
      if (!p || engine.interactableAt?.(p.x, p.y)?.classId !== VISITOR_BUTLER_CLASS) return null;
      return { target: vb.target, mine: visit.owner === me(), busy: vb.busy, full: vb.full || '' };
    },
    takes: canLeave,
    leave: dropPackage,
  });

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


  // —— Ticket 112: my Butler's gift for visitors and who came, kept by the site ——
  let stockReady = null;
  /** A gift my save held from before that the site could not take in yet (adopt refused: budget). */
  let legacyWaiting = false;
  let stockLast = '';
  let giftsGot = 0;

  function publishStock(st) {
    const g = st?.gift;
    stockLast = `${g ? `${g.classTsid}:${g.count}` : ''}/${Object.keys(st?.visitors || {}).length}`;
    engine.setData?.('neighboursButlerStock', stockLast);
  }

  async function loadStockNow() {
    const st = butlerApi.mpState?.(engine);
    if (!st?.owned) return 0;
    let stock;
    try {
      stock = normalizeButlerStock(await account.butlerStock());
    } catch (err) {
      console.warn('[neighbours]', err?.message || err);
      return 0;
    }
    legacyWaiting = false;
    if (stock.legacy && st.gift) {
      // The gift a save's Butler held before the site kept it: taken in once, so nothing is lost.
      let a = null;
      try {
        a = await account.butlerAdopt();
      } catch (err) {
        a = err?.data || null;
      }
      if (a?.status === 'adopted' || a?.status === 'done') {
        stock = normalizeButlerStock({ ...stock, gift: a.gift, legacy: false });
      } else if (a?.why === 'type') {
        // Not something the ledger carries: back to the pack, as the source's old gift came back.
        addItem(engine.inv, st.gift.classTsid, st.gift.count);
        engine.refreshPack?.();
        stock = normalizeButlerStock({ ...stock, gift: null, legacy: false });
      } else {
        legacyWaiting = true;
      }
    }
    const added = applyButlerStock(st, stock, { keepGift: legacyWaiting });
    engine.save?.();
    butlerApi.stockArrived?.(engine);
    publishStock(st);
    return added;
  }

  function loadStock() {
    stockReady = loadStockNow().finally(() => { stockReady = null; });
    return stockReady;
  }

  butlerApi.setGiftHook?.({
    /** onLeaveVisitorGift through the site: the stack leaves my ledger into the Butler's stock (once per give). */
    async give(eng, { c, n, keep, r = null, t = null }) {
      if (stockReady) await stockReady.catch(() => {});
      // Ours: a gift from before that the site could not take in yet stays until it can, so nothing is lost.
      if (legacyWaiting) return { ok: false, text: BT.giftWaiting };
      let a;
      try {
        a = normalizeGiftAnswer(await account.butlerGive({ op: butlerGiftOp(), c, n, keep, r, t }));
      } catch (err) {
        a = normalizeGiftAnswer(err?.data);
        if (!a) return { ok: false, text: err?.message || T.failed };
      }
      if (!a) return { ok: false, text: T.failed };
      if (!a.ok) return { ok: false, text: a.text };
      const applied = eng.query?.('ledgerReceipt', a.op, eng) !== false;
      publishStock({ gift: a.gift ? { classTsid: a.gift.c, count: a.gift.n } : null, visitors: butlerApi.mpState?.(eng)?.visitors });
      return { ok: true, applied, got: a.got, gift: a.gift };
    },
  });

  /**
   * GATESIGN: where the visit's way out leads (goBack: the spot you came from, else the arrival
   * street), with its name and hub, for the Back to Ur arm's tip and the Imagination menu's
   * Back to world (ImgMenuBackToWorld.as: label + ", " + hub).
   */
  function wayOutOf(spot) {
    const tsid = spot?.tsid || STREET_INDEX.default;
    const s = STREET_INDEX.streets || {};
    const t = String(tsid);
    const row = s[t] || s[t.replace(/^G/, 'L')] || s[t.replace(/^L/, 'G')];
    return { tsid, label: labelOf({ tsid }), hubName: row?.hubName || '' };
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
    dropButler();
    publish();
    if (back?.tsid) await engine.enter(back.tsid, { spawnX: back.x, spawnY: back.y, quiet: true, bypassFeatureGates: true });
    else await engine.enter(STREET_INDEX.default, { bypassFeatureGates: true });
  }

  /**
   * G1018: the house and back yard come from the site only to those it lets in (Neighbours::forVisitor):
   * the street's answer has none for a visitor, so at the door the site is asked again, with the
   * realtime server's let-in proof (rememberInside) for one let in, and in they go once it shows them.
   */
  let opening = false;
  async function goInside() {
    if (!visit || visit.room !== 'street' || opening) return;
    knocking = 0;
    if (!visit.view.inside) {
      const owner = visit.owner;
      opening = true;
      let view = null;
      try {
        view = normalizeHomeView(await account.home(owner, insideProof(owner)));
      } catch (err) {
        console.warn('[neighbours]', err?.message || err);
      } finally {
        opening = false;
      }
      if (!visit || visit.owner !== owner || visit.room !== 'street') return;
      if (!view?.inside) {
        notice(T.houseLocked, 3200);
        return;
      }
      visit.view = { ...view, pass: view.pass || visit.view.pass, passTtl: view.pass ? view.passTtl : visit.view.passTtl };
      visit.key = visit.key || view.key === true;
      sendPass();
    }
    show('interior');
  }

  function goOutside() {
    if (!visit || visit.room !== 'interior') return;
    show('street', { arrive: 'door' });
  }

  /**
   * R5 (G1313): through a Door between the house's floors, standing at the Door it leads to (the
   * owner's goToHouseFloor). The realtime server lets in whoever it let into the house (homes.go gate).
   */
  function goFloor(dest) {
    if (!visit || visit.room !== 'interior' || !dest || !Number.isInteger(dest.floor) || dest.floor === visit.floor) return;
    engine.playSound?.('DOOR_OPEN', { volume: 0.5 });
    show('interior', { floor: dest.floor, doorX: dest.x, via: 'door' });
  }

  /** MPVISIT: the floors a visitor may ride to; G795: the floor under construction too (its Workbench takes help). */
  function towerStops(tw) {
    return elevatorStops(tw);
  }

  function enterTower() {
    if (!visit || visit.room !== 'street') return;
    if (!visitorHomeState(visit.view).tower.built) return;
    show('tower', { floor: 0 });
  }

  function rideTo(floor) {
    if (!visit || visit.room !== 'tower') return;
    const stops = towerStops(visitorHomeState(visit.view).tower);
    if (!stops.some((row) => row.index === floor) || floor === visit.floor) return;
    show('tower', { floor, via: 'elevator' });
  }

  /** G795: the Workbench's construct: the floor's shared project (features/home-street-mp-feature.js). */
  function helpBuild(target) {
    if (!visit || visit.room !== 'tower' || !visit.construction) return;
    const opened = engine.query?.('towerFloorVisit', { owner: visit.owner, name: visit.name, target }, engine);
    if (!opened) notice(T.benchNotReady, 3200);
  }

  /** G795: tower_build_expansion, the floor under construction is walkable only from 130 to 290 (the owner's keepOnPlanks). */
  function keepOnPlanks() {
    if (!visit?.construction || visit.room !== 'tower' || readVisitScene(engine.streetTsid)?.owner !== visit.owner) return;
    const p = engine.player;
    if (!p || !Number.isFinite(p.x)) return;
    const x = clampToExpansion(p.x);
    if (x === p.x) return;
    if ((x > p.x && p.vx < 0) || (x < p.x && p.vx > 0)) p.vx = 0;
    p.x = x;
  }

  function leaveTower() {
    if (!visit || visit.room !== 'tower') return;
    show('street', { arrive: 'tower' });
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
  // G944 (M4): the owner changed their home (yard-verbs-mp-feature reads the yard on "home" and "yard").
  client.on('msg:home_refresh', (msg) => {
    if (msg.what === 'home' && visit && Number(msg.owner) === visit.owner) refreshHome();
  });
  client.on('msg:home_pass_ok', (msg) => {
    if (msg.inside) rememberInside(msg.owner, msg.inside);
    if (!visit || Number(msg.owner) !== visit.owner) return;
    passes.accepted();
    visit.key = visit.key || msg.key === true;
    if (needRejoin && client.wanted && engine.player) {
      needRejoin = false;
      client.join({ street: client.wanted, x: engine.player.x, y: engine.player.y, dir: engine.player.facing === 'left' ? -1 : 1, anim: engine.player.glitchState || 'stand', look: { v: 1, vector: engine.playerAppearance?.vector || {} } });
    }
  });
  client.on('error', ({ code, message }) => {
    if (!visit) return;
    if (code === 'home_private' || code === 'homes') {
      // R31 (#522): an expired pass sent again was refused ("homes") and ignored, so the server kept
      // the visitor on their last street while the game showed this one.
      rejoin(code);
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
  // G668 / G1018: summoned into the house: the site's proof for that arrival (before summon_go).
  client.on('msg:home_inside', (msg) => {
    rememberInside(msg.owner, msg.inside);
  });
  client.on('msg:home_open', (msg) => {
    if (msg.inside) rememberInside(msg.owner, msg.inside);
    if (!visit || Number(msg.owner) !== visit.owner) return;
    if (msg.why === 'let_in') visit.letIn = true;
    goInside();
  });
  client.on('msg:home_let_in', (msg) => {
    const owner = Number(msg.owner?.id) || 0;
    if (msg.inside) rememberInside(owner, msg.inside);
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
    forgetInside(msg.owner);
    if (!visit || Number(msg.owner) !== visit.owner) return;
    visit.letIn = false;
    // G1018: no longer let in (or the key taken back): the house and back yard leave this copy of the
    // home (the site would not send them now), and the door asks the site again.
    if (!visit.key || msg.why === 'revoked') {
      const homes = { ...(visit.view.homes || {}) };
      delete homes.decor;
      delete homes.floors;
      delete homes.backYard;
      delete homes.yardStyle;
      visit.view = { ...visit.view, homes, inside: false, backYardLive: false };
    }
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
      // G972: a Butler that said it is full refuses a drag in red from then on this visit (bag_butler.js 1032-1036).
      if (vb && msg.why === 'full' && msg.item) vb.full = String(msg.text || BT.packageFail);
      butlerSay(String(msg.text || BT.packageFail));
      return;
    }
    if (item?.c) {
      // Once per parcel (LedgerSpend's way: the trade slice remembers the op).
      const receipt = engine.query?.('ledgerReceipt', String(msg.op || ''), engine);
      const box = Array.isArray(msg.item.box) ? msg.item.box : null;
      if (receipt !== false && box) {
        // G332: the wrapped box leaves with what is inside (the site took the box and the stacks from the ledger).
        if (engine.query?.('giftBoxOut', String(msg.item.ref || ''), box, engine) !== true && countItem(engine.inv, item.c) > 0) removeItem(engine.inv, item.c, 1);
      } else if (receipt !== false && countItem(engine.inv, item.c) > 0) {
        // The copies chosen are the ones that go (js/copy-picks.js).
        const ours = leaving?.c === item.c && leaving.owner === visit.owner;
        if (ours && leaving.pick && engine.toolState && markLeaving(engine, item.c, leaving.pick, item.n)) takeCopies(engine.toolState, item.c, leaving.pick, item.n);
        else if (ours && leaving.ds) takeDragged(engine, leaving.ds, item.n);
        removeItem(engine.inv, item.c, Math.min(item.n, countItem(engine.inv, item.c)));
      }
      leaving = null;
      engine.refreshPack?.();
      // Report 128: each neighbour counts once from when the quest starts.
      const held = giftsCounted();
      const gift = noteGift(giftedThisQuest(slice.gifted, held), visit.owner);
      slice.gifted = held === null ? [] : gift.gifted;
      if (held !== null && gift.counted && receipt !== false) count(NEIGHBOUR_COUNTERS.gifts, 1);
      // G172: bag_butler.js:3802-3805, +2 to The Good Neighbor for the first package left with this
      // Butler. The shared Feat (feats-mp.js MP_ACTS visiting_stones) counts each neighbour's
      // HOME_<id> once a run, so every run of the Feat can count it again.
      if (receipt !== false) engine.featsIncrement?.('visiting_stones', 2, { act: 'package', street: homeStreetFor(visit.owner) });
      butlerSay(BT.packageConfirm(visit.name));
    } else {
      butlerSay(BT.messageSuccess(visit.name));
    }
    engine.save?.();
  });
  // Ticket 112: the owner's Butler gave me (a visitor) one of their gift; once per credit.
  client.on('msg:butler_gift', (msg) => {
    const op = String(msg.op || '');
    const c = String(msg.item?.c || '');
    const n = Math.max(0, Math.min(9999, Math.floor(Number(msg.item?.n) || 0)));
    if (!isButlerVisitOp(op) || !/^[a-z0-9_]{1,64}$/.test(c) || !n) return;
    if (engine.query?.('ledgerReceipt', op, engine) === false) return;
    addItem(engine.inv, c, n);
    receiveWire(engine.toolState, c, msg.item, n); // G974: the owner's own copy, its wear and words
    engine.refreshPack?.();
    engine.save?.();
    giftsGot += n;
    engine.setData?.('neighboursButlerGifts', String(giftsGot));
    const owner = Number(msg.owner) || 0;
    const here = () => Boolean(vb && !vb.box.destroyed && visit?.owner === owner && visit.room === 'street');
    engine.floatText?.(engine.player?.x ?? 0, (engine.player?.y ?? engine.groundY ?? 0) - 90, `+${itemLabel(c, n)}`, 0xf2c879);
    if (visit?.owner !== owner) {
      engine.pushActivity?.(`+${itemLabel(c, n)}`);
      return;
    }
    const text = BT.giftItem(itemLabel(c, 1), visit.name);
    // greetPlayer gave the gift with the greeting: the line comes after it, from the Butler when it stands here.
    const started = Date.now();
    let waited = false;
    const sayIt = () => {
      if (here() && !vb.greeted && Date.now() - started < 4000) {
        waited = true;
        setTimeout(sayIt, 400);
      } else if (here()) setTimeout(() => (here() ? butlerSay(text, 5000) : notice(text, 4200)), waited ? 5200 : 1200);
      else notice(text, 4200);
    };
    sayIt();
  });
  // Ticket 112: someone came onto my home street; the Butler's stock and visit list are current.
  client.on('msg:butler_visit', () => {
    loadStock();
  });
  client.on('msg:butler_parcel', (msg) => {
    notice(BT.parcelArrived(String(msg.from?.name || 'Someone'), msg.item === true, msg.message === true), 4200);
    loadParcels();
  });
  client.on('msg:home_tended', (msg) => {
    const owner = Number(msg.owner) || 0;
    if (owner === me()) loadTending();
    else if (visit?.owner === owner) applyToCopy(normalizeTendActs(msg.acts, msg.from));
  });
  client.on('msg:home_hosted', (msg) => {
    for (const counter of hostedCounters(msg)) engine.achievement?.(counter, 1);
  });

  // The owner's side: knocks and key-holders at my door.
  client.on('msg:home_knocked', (msg) => {
    const id = Number(msg.id) || 0;
    if (!id) return;
    // Someone you block: the server refuses their knock (homes.go blocked); if one comes, it goes unanswered.
    if (engine.query?.('realtimeHidden', id)) {
      client.send('home_answer', { id, allow: false });
      return;
    }
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
  loadStock();
  loadTending();

  return {
    client,
    get visit() { return visit; },
    /** G944: the visited home read again (rebuild: built again whatever changed). */
    refreshHome,
    /** QA: what the last owner's change did here ('gardens' | 'rebuilt') and how many rebuilds. */
    live: () => ({ last: liveLast, rebuilds: liveRebuilds }),
    /** G367: the owner's Butler says a line to the street you visit (butler_said): its name, or '' when not drawn here. */
    butlerSays(owner, text) {
      if (!vb?.target || vb.box.destroyed || visit?.owner !== Number(owner) || visit.room !== 'street' || !text) return '';
      butlerSay(String(text), 5000);
      return vb.name || 'Butler';
    },
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
    /** GATESIGN: the Imagination menu's Back to world on a visit (ImgMenuBackToWorld.as /leave), or null. */
    wayOut() {
      if (!visit || !readVisitScene(engine.streetTsid)) return null;
      return { ...wayOutOf(visit.returnTo), go: () => goBack() };
    },
    /** G668 (summonHomePlace): whether a summons may bring someone to the home you stand in, or null. */
    summonPlace() {
      const home = engine.homeContext?.() || {};
      return summonHomePlace({ street: this.street(), me: me(), inHome: home.inHome === true, visiting: Boolean(visit && readVisitScene(engine.streetTsid)) });
    },
    /**
     * G668 (summon-mp-feature): summoned to a home street, house or Tower floor, or (`door`) to the
     * front door of someone's house; true once the visit is under way.
     */
    summoned({ owner, room = 'street', floor = 0, at = null, door = false } = {}) {
      if (!(Number(owner) > 0) || busy) return false;
      // A refusal on the way (the site's houses_visit: blocked, the tutorial, no house) says why itself.
      visitHome(Number(owner), { room, floor, at, summoned: true, door: door === true });
      return true;
    },
    /** The street others share with you (realtimeStreet). */
    street() {
      const home = engine.homeContext?.() || {};
      // #465: a visit left by the Home button or /home (renderHomeScene runs no onStreetEnter, so
      // left() never heard) is over once its scene is gone and none is on its way; it kept you off
      // your own home street, so the server refused your yard's machines.
      if (visit && !showing && !readVisitScene(engine.streetTsid)) {
        visit = null;
        knocking = 0;
        dropButler();
        publish();
      }
      if (visit && readVisitScene(engine.streetTsid)?.owner !== visit.owner) return '';
      const scene = homesFeature._state?.().scene;
      // An upper house floor (G153, home-floors.js) is a room of its own, a street of its own (G1249: its
      // machines are the server's word), shared with the house's visitors (R5, G1313) as a Tower floor (MPVISIT).
      const houseFloor = Number(scene?.houseFloor) > 0 ? Number(scene.houseFloor) : 0;
      const ownTowerFloor = Number.isInteger(scene?.tower) ? scene.tower : null;
      return sharedHomeStreet({ visit, me: me(), inHome: home.inHome === true, room: home.room, houseFloor, ownTowerFloor });
    },
    /** The scene went away (an ordinary street, a reload): the visit is over. */
    left() {
      if (visit && !readVisitScene(engine.streetTsid)) {
        visit = null;
        knocking = 0;
        publish();
      }
      if (!visit) dropButler();
    },
    /** The street's entities are going (feature host onStreetClear): its Butler with them. */
    streetClear() {
      dropButler();
    },
    verbsFor(target) {
      if (!visit) return [];
      if (target.classId === VISITOR_BUTLER_CLASS) return this.butlerVerbs();
      if (target.classId === CLASS_DOOR) return doorVerbs({ key: visit.key, letIn: visit.letIn, ownerName: visit.name });
      if (target.classId === CLASS_GATE) return [{ id: 'go_back', label: T.goBackVerb, tooltip: `Back to ${labelOf(visit.returnTo)}`, enabled: true, reason: '' }];
      if (target.classId === CLASS_FRONT) return [{ id: 'go_outside', label: T.outsideVerb, tooltip: `Back to ${homeStreetName(visit.name)}`, enabled: true, reason: '' }];
      // R5 (G1313): furniture_door.js's way between floors, the owner's own Door verb (homes-feature doorVerbs).
      if (target.classId === CLASS_STAIRS) {
        const dest = target.state?.dest;
        return dest ? [{ id: 'floor_go', label: dest.dir === 'up' ? 'Go up' : 'Go down', tooltip: target.subtitle || '', enabled: true, reason: '', primary: true }] : [];
      }
      if (target.classId === CLASS_TOWER) return [{ id: 'enter_tower', label: 'enter', tooltip: `Go inside ${target.label}`, enabled: true, reason: '' }];
      if (target.classId === CLASS_TOWER_EXIT) return [{ id: 'leave_tower', label: 'leave tower', tooltip: `Back to ${homeStreetName(visit.name)}`, enabled: true, reason: '' }];
      // G795: tower_expander construct, "Construct a new floor" (anyone; the owner alone starts one).
      if (target.classId === CLASS_BENCH) return [{ id: 'construct', label: 'construct', tooltip: 'Construct a new floor', enabled: true, reason: '', primary: true }];
      if (target.classId === CLASS_LIFT) {
        return towerStops(visitorHomeState(visit.view).tower).map((row) => ({ id: `ride:${row.index}`, label: `ride to ${row.label}`, tooltip: 'Go to another floor', enabled: row.index !== visit.floor, reason: row.index === visit.floor ? 'You are here.' : '' }));
      }
      return [];
    },
    runVerb(target, verbId) {
      if (BUTLER_VERB_IDS.has(verbId)) return this.runButler(verbId);
      if (String(verbId).startsWith('ride:')) rideTo(Number(String(verbId).slice(5)));
      else if (verbId === 'enter_tower') enterTower();
      else if (verbId === 'leave_tower') leaveTower();
      else if (verbId === 'construct' && target.classId === CLASS_BENCH) helpBuild(target);
      else if (verbId === 'enter') goInside();
      else if (verbId === 'knock') knock();
      else if (verbId === 'go_back') goBack();
      else if (verbId === 'go_outside') goOutside();
      else if (verbId === 'floor_go' && target.classId === CLASS_STAIRS) goFloor(target.state?.dest);
      else return false;
      return true;
    },
    ownsGarden: (target) => Boolean(bedOf(target) || visit?.gardens?.has(target)),
    mayTend: () => visit?.key === true,
    /** G777: a garden bed on the visited home street (public), not the back yard's. */
    publicBed: (target) => {
      const e = bedOf(target);
      return Boolean(e && visit?.beds.get(e)?.yard === 'street');
    },
    /**
     * G777: the planter's minute on a ripe public crop (include/garden.js 1042-1046, GardenView.as
     * 481-486): on a visit, a home-street plot held for someone else; at home, a plot on my own
     * street a visitor planted. The feed line, or null.
     */
    heldLine(target, now = Date.now()) {
      if (target?.classId !== 'garden_plot') return null;
      const plot = getPlot(target.state?.garden, target.state?.plotKey);
      if (visit) return this.publicBed(target) && homePlotHeld(plot, me(), visit.owner, now) ? HOME_PLANTER_HOLD_LINE : null;
      const mine = Object.values(homesFeature._state?.()?.cult?.gardens || {});
      return mine.includes(target.state?.garden) && homePlotHeld(plot, me(), me(), now) ? HOME_PLANTER_HOLD_LINE : null;
    },
    ownerName: () => visit?.name || '',
    /** R31 (#522): the server has the visitor off this home's street: the pass again (or a fresh one), then the street. */
    rejoinVisit(owner) {
      if (!visit || Number(owner) !== visit.owner) return false;
      rejoin('home_private');
      return true;
    },
    tick(dtMs, now) {
      if (visit) {
        if (passes.owner !== visit.owner) passes.start(visit.owner, visit.view);
        passes.tick();
      } else if (passes.owner) passes.stop();
      tickButler(dtMs);
      scanGardens(now);
      keepOnPlanks();
    },
    butlerVerbs() {
      if (!vb || !visit) return [];
      const busy = vb.busy ? BT.interactFail : '';
      return [
        { ...BV.talk, enabled: true, reason: '' },
        { ...BV.leavePackage, enabled: !busy, reason: busy },
        { ...BV.leaveMessage, enabled: !busy, reason: busy },
        { ...BV.info, tooltip: BUTLER_INFO.visitorVerb.tooltip(visit?.name || 'the owner'), enabled: !busy, reason: busy },
      ];
    },
    runButler(verbId) {
      if (verbId === BV.talk.id) butlerSay(greeting());
      else if (verbId === BV.leavePackage.id) leavePackage();
      else if (verbId === BV.leaveMessage.id) leaveMessage();
      else if (verbId === BV.info.id) tellAbout();
      else return false;
      return true;
    },
    loadParcels,
    loadStock,
    /** QA, ticket 112: my Butler's gift on the site and the visits noted (class:count/visitors). */
    get stock() { return stockLast; },
    loadTending,
    /** QA: stand beside the visited Butler ('butler'), your own ('ownbutler'), the first garden bed ('garden') or a Door between floors ('stairs'), then E opens its menu. */
    standNear(what = 'butler') {
      const p = engine.player;
      let x = null;
      if (what === 'butler' && vb) x = vb.box.x - 60;
      else if (what === 'ownbutler') x = butlerApi.hiSpot?.(engine)?.x - 60;
      else if (what === 'garden') {
        const e = visit ? [...visit.beds.keys()][0] : (engine.interactables || []).find((t) => t.classId === 'garden_new');
        x = e?.sprite?.x;
      } else if (['tower', 'lift', 'exit'].includes(what) && visit?.targets?.[what]) x = visit.targets[what].sprite?.x;
      else if (what === 'stairs') x = visit?.targets?.stairs?.[0]?.sprite?.x;
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
    if (!s || (!s.tended.length && !s.gifted.length && !Object.keys(s.counts).length && !Object.keys(s.visits || {}).length)) return undefined;
    return { tended: s.tended, gifted: s.gifted, counts: s.counts, visits: s.visits || {} };
  },

  restore(slice, engine) {
    savedSlice = engine?.mode === 'multiplayer' ? normalizeNeighboursSlice(slice) : null;
  },

  onStreetEnter() {
    session?.left();
  },

  onStreetClear() {
    session?.streetClear();
  },

  /** realtime-feature: the street shared on someone's home (or yours), HOME_<id> or HOUSE_<id>. */
  realtimeStreet(engine) {
    if (!session || engine?.mode !== 'multiplayer') return null;
    return session.street() || null;
  },

  /**
   * G668 (teleportation-feature summonCtx): in a home, '' when a summons may come here, 'them' or
   * 'here' when not; null out of every home.
   */
  summonHomePlace(engine) {
    if (!session || engine?.mode !== 'multiplayer') return null;
    return session.summonPlace();
  },

  /** G668 (summon-mp-feature summon_go): summoned to someone's home ({ owner, room, floor, at, door }); true once under way. */
  neighboursSummoned(opts, engine) {
    if (!session || engine?.mode !== 'multiplayer') return null;
    return session.summoned(opts) || null;
  },

  /** R31 (#522, features/yard-verbs-mp-feature.js): a yard verb was refused as "away": back onto owner's home street. */
  neighboursRejoin(owner, engine) {
    if (!session || engine?.mode !== 'multiplayer') return null;
    return session.rejoinVisit(owner) || null;
  },

  /** G367 (features/butler-im-feature.js): the visited owner's Butler says a line; its name, or null. */
  visitorButlerSay(owner, text, engine) {
    if (!session || engine?.mode !== 'multiplayer') return null;
    return session.butlerSays(owner, text) || null;
  },

  /** G329 (features/quests-mp-feature.js): the other player's home you stand on, and whether you hold their key. */
  neighboursVisiting(engine) {
    if (!session?.visit || engine?.mode !== 'multiplayer') return null;
    return { owner: session.visit.owner, key: session.mayTend() };
  },

  /**
   * garden-gnome-feature: the Garden Gnomes of the home you stand in on a visit (the site's list,
   * js/garden-gnome.js normalizeVisitGnomes) and whose they are, or null anywhere else.
   */
  homeVisitGnomes(engine) {
    const v = session?.visit;
    if (!v || engine?.mode !== 'multiplayer' || readVisitScene(engine.streetTsid)?.owner !== v.owner) return null;
    return { owner: v.owner, name: v.name, gnomes: Array.isArray(v.view?.gnomes) ? v.view.gnomes : [] };
  },

  /**
   * #697, giant-icons-feature: the Giant Icons the owner of the home you stand in placed (the site's
   * list, js/giant-icons.js normalizeVisitIcons) and whose they are, or null anywhere else.
   */
  homeVisitIcons(engine) {
    const v = session?.visit;
    if (!v || engine?.mode !== 'multiplayer' || readVisitScene(engine.streetTsid)?.owner !== v.owner) return null;
    return { owner: v.owner, name: v.name, icons: Array.isArray(v.view?.icons) ? v.view.icons : [] };
  },

  /**
   * G1190, game.js refreshDroppedWorldItems: on a visit to someone's house or Tower floor, the stacks
   * the owner keeps there in their own save, drawn to look at (js/neighbours-mp.js ownerStacksFor).
   */
  sharedDroppedStacks(tsid, engine) {
    const v = session?.visit;
    if (!v || engine?.mode !== 'multiplayer' || String(tsid || '') !== String(engine.streetTsid || '')) return null;
    const seen = readVisitScene(tsid);
    if (!seen || seen.owner !== v.owner || (seen.room !== 'interior' && seen.room !== 'tower')) return null;
    const out = ownerStacksFor(v.view, seen.room, { floor: seen.floor, roomX: v.roomX, tsid });
    return out.length ? out : null;
  },

  /** G1190 (takeable.js 33-36): the owner's own stack on a visit is locked to its owner: Pick up is greyed with the source's line. */
  decorateVerbs(target, verbs) {
    if (target?.classId !== 'dropped_item' || !isOwnerStackId(target.state?.id) || !Array.isArray(verbs)) return null;
    return verbs.map((v) => (String(v?.id || '').split(':')[0] === 'pickup' ? { ...v, enabled: false, reason: OWNER_STACK_TEXT.locked } : v));
  },

  /** G1190: and no other way (a drag to the pack) takes it either. */
  groundPickupRefused(target) {
    return target?.classId === 'dropped_item' && isOwnerStackId(target.state?.id || target.worldItemId) ? OWNER_STACK_TEXT.locked : null;
  },

  /** G944 (yard-verbs-mp-feature): the yard I visit names something new or gone; true once the room is being built again. */
  homeVisitRebuild(engine) {
    if (!session?.visit || engine?.mode !== 'multiplayer' || !readVisitScene(engine.streetTsid)) return null;
    session.refreshHome({ rebuild: true });
    return true;
  },

  /** GATESIGN: game.js homeWayOut, the Imagination menu's Back to world while you visit a home. */
  homeVisitWayOut(engine) {
    if (!session || engine?.mode !== 'multiplayer') return null;
    return session.wayOut() || null;
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
      // garden_new.js tend conditions: the owner or a key-holder; G777: a home-street garden is public
      // (include/garden.js isPublic, main.js doGardenAction). The copy's own verbs run, and the site keeps the change.
      if (session.mayTend() || session.publicBed(target)) return null;
      return [{ id: 'neighbour_noop', label: 'Tend', tooltip: 'Do some gardening', enabled: false, reason: T.belongs(session.ownerName()) }];
    }
    return null;
  },

  /** game.js beginVerbAction: G777, a public home-street crop in its planter's minute. */
  verbRefusedNow(target, verbId, engine) {
    if (verbId !== 'harvest' || !session || engine?.mode !== 'multiplayer') return null;
    return session.heldLine(target) || null;
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
