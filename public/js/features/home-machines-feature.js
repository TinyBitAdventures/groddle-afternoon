/**
 * Machines set down in a home (lane MACHINES; Austin 2026-11-01: "Let
 * owners set an assembled machine down on their street, as the original
 * did.", then lane HOMES2: "Machines may stand on the home street, in the
 * house and in the Tower"). The rules, the copy and their sources are
 * js/home-machines.js.
 *
 * - Place (a machine in the pack, in your own home: the home street, any
 *   floor of the house (G1249) or a Tower floor): it stands where you are, with its tank
 *   (machine_stand.js canDrop: not within 200 px of another in the same
 *   place, nor 70 px of an end of the street or a room's inner wall).
 * - Anyone on the street: Use opens the Make panel on it (the room
 *   machines' panel, engine.openMakeStation); Make puts the ingredients in
 *   and starts a job (count * wait_ms + 2200 ms); while it runs nobody else
 *   can use it; when it is done the output waits in it for whoever made it,
 *   who collects it. Refuel takes Fuel Cells (+50 each). The maker's iMG and
 *   badge counters are their own game's when the job finishes, wherever they
 *   are (finishMakingKnown), as for a room machine.
 * - The owner or a key-holder: Pick up puts it back in the pack, tank and
 *   all (never while it runs; other players' output in it is lost, after a
 *   warning).
 * - Art: the machine's own SWF states (js/machine-art.js, Tiny Speck's sheets,
 *   the same as the Community Machine Rooms'): assembled, loadOpen/loadClose/
 *   active through a job, ready while your output waits, collectOpen/Close.
 *
 * Multiplayer: the machine is the site's (src/HomeMachines.php) and the
 * realtime server carries each act (home_machines.go): everyone on the street
 * sees one machine, its fuel, the job in it and whose output waits, and it
 * stays put while its owner is offline. A finished job by someone who is not
 * the owner adds 7 to the owner's Magic Rock pool there. The ingredients and
 * Fuel Cells leave the pack and the output arrives through the ledger, once
 * each (the trade slice's applied list, ledgerReceipt); setting it down and
 * picking it up are applied once from this feature's slice (placed, taken).
 * Solo: the same rules on this feature's slice (machines).
 *
 * The Community Machine Rooms (lane machines, report #152; Austin
 * 2026-11-08: "Allow machines in the community machine rooms only."): in
 * the Meadow, Besara and Forest rooms anyone may set their own machine down
 * where canDrop allows (200 px from any machine, the room's own included;
 * 70 px from the room's ends). Anyone uses, refuels and collects there as at
 * a home (contents per player, everyone's going after 6 game days, the
 * owner's too: no POL), a finished job rolls the room's Altar bonus for its
 * maker (machine-rooms-feature payAltarBonus), and only the owner picks it
 * up. Online the site keeps every room machine (the same table, place
 * "mr:<room>", owner its owner: GET groddle/v1/machine-rooms/<room>/machines
 * lists them all) and the realtime server carries each act for anyone in
 * the room, telling everyone in it and the owner. A machine stays where it
 * was set down while its owner is away, for good if they never come back
 * (as the original left a placed machine).
 *
 * QA: solo ?autostart=1&fresh=1&resetgame=1&questoffer=off&homedemo=home
 * &homemachinedemo=fuelmaker|blockmaker|woodworker|metalmaker grants the
 * machine, its skill, Engineering and two jobs' ingredients on your home
 * street. window.groddleHomeMachines: state(), place(classTsid), act(index,
 * verb), make(index, recipeKey, qty), standNear(index), refresh(); canvas data hmMachines (id:class:fuel:job:waiting
 * per machine here, ';'), hmWhere (own:<place> | visit:<owner>:<place> | room:<place> | ''), hmLast.
 * In a machine room: doordemo into it (machine-rooms-feature's routes) plus
 * &homemachinedemo=<machine>; window.groddleHomeMachines.placeAt(classTsid, x)
 * stands you at room x and sets it down.
 */

import {
  HOME_MACHINES_ID,
  HOME_MACHINES_INTERIOR,
  HOME_MACHINES_STREET,
  HOME_MACHINE_TEXT as T,
  PLACE_HOUSE,
  housePlace,
  isRoomPlace,
  placeIsAltar,
  roomFixedXs,
  roomMachineSpan,
  roomName,
  roomPlaceOf,
  PLACE_STREET,
  ROOM_GROUND_Y,
  roomSpan,
  towerPlace,
  isHomeMachineClass,
  isMachineOp,
  jobFuel,
  jobLimit,
  jobOutputs,
  jobRunning,
  machineLabel,
  machineSubtitle,
  normalizeMachine,
  normalizeSlice,
  othersInside,
  moveCheck,
  placeCheck,
  placedMachineVerbs,
  slidePlace,
  secondsToString,
  settleSolo,
  expireSolo,
  tankOf,
  TAKEN_KEEP,
} from '../home-machines.js?v=c72cb353';
import { CALL_PLAYER_LINES, MACHINE_HITBOX, MACHINE_SKILLS, collectLine, machineJobMs, machineMadeLine, refuelCount, runningSoundKey, takeJobIngredients } from '../machine-rooms.js?v=4b6ade29';
import { MACHINE_ART_SHEETS, LOW_FUEL_BUBBLE_MS, LOW_FUEL_LINE, isLowFuel, machineFrame, machineFrameRect, machineSheetDef, roomMachineState } from '../machine-art.js?v=57cc0f50';
import { FUEL_CELL, FUEL_PER_CELL, MAX_FUEL } from '../machines.js?v=93a736f2';
import { ITEM_CATALOG, addItem, countItem, ensureItem, removeItem } from '../inventory.js?v=3be7988a';
import { receiveToolCopy, takeToolCopy } from '../tools.js?v=4156bba8';
import { markLeaving, takeCopies } from '../copy-picks.js?v=b368fd49';
import { RECIPE_CATALOG } from '../making.js?v=dc595568';
import { getSkillCatalog } from '../content-catalogs.js?v=c9b84764';
import { createBackYardState, homeStreetLayout, normalizeCultivationState } from '../home-cultivation.js?v=122d6f45';
import { lookOf, poseOf } from './realtime-feature.js?v=087837ca';
import { insideQuery, readVisitScene } from '../neighbours-mp.js?v=0896a4d7';
import { saveStore } from '../save-store.js?v=1ccb1d6b';
import { frameTexture, sourceFromUrl, textureFromUrl } from '../textures.js?v=b8e38103';
import { createSheetLoader } from '../sprite-sheets.js?v=37ad5c9f';
import { STREET_GROUND_Y, homesFeature } from './homes-feature.js?v=f8a3284c';
import { payAltarBonus } from './machine-rooms-feature.js?v=0cf03bb7';
import { worldToScreen } from '../street-model.js?v=a9a05f9d';
import { nearestSurfaceY } from '../walk-surface.js?v=76def2f6';
import { standOnFeet } from '../sprite-feet.js?v=6283b688';
import { offlineLine } from '../online-request.js?v=5fa7a635';
import { DRAG_DIST } from '../ui/home-builder.js?v=26dcf346';
import { LONG_PRESS_SLOP } from '../ui/context-menu.js?v=0266831a';

export { HOME_MACHINES_ID };

const ME_SOLO = 'you';
/** QA (solo): one job's ingredients per machine (catalog_recipes.js), as machine-rooms-feature's demo. */
const DEMO_ITEMS = Object.freeze({
  fuelmaker: { fuel_cell: 1, jellisac_clump: 24, peat: 16, white_gas: 4 },
  blockmaker: { fuel_cell: 1, earth: 10, loam: 4, heavy_gas: 2 },
  woodworker: { fuel_cell: 1, plank: 8 },
  metalmaker: { fuel_cell: 1, tin: 2, plain_metal: 2 },
});
let demoDone = false;
const ASK_MS = 9000;
const OWN_FETCH_MS = 60000;

let session = null;
let savedSlice = null;
let sheetLoader = null;

function skillName(id) {
  return getSkillCatalog()?.[id]?.name || String(id || '').replace(/_\d+$/, '').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

/** The site's routes (the cookie with its REST nonce, refreshed once when stale), as yard-verbs-mp-feature reads them. */
function createSite() {
  const boot = globalThis.GRODDLE_MP_BOOT || {};
  let nonce = /^[0-9a-f]{10}$/.test(String(boot.nonce || '')) ? String(boot.nonce) : '';
  const api = new URL('wp-json/groddle/v1/', document.baseURI).href;
  const nonceUrl = boot.nonceUrl || new URL('wp-admin/admin-ajax.php?action=rest-nonce', document.baseURI).href;
  async function refresh() {
    try {
      const res = await fetch(nonceUrl, { credentials: 'same-origin', cache: 'no-store' });
      const text = String(await res.text()).trim();
      if (res.ok && /^[0-9a-f]{10}$/.test(text)) {
        nonce = text;
        return true;
      }
    } catch { /* the answer below stands */ }
    return false;
  }
  async function call(path) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const headers = nonce ? { 'X-WP-Nonce': nonce } : {};
      let res;
      try {
        res = await fetch(api + path, { credentials: 'same-origin', cache: 'no-store', headers });
      } catch {
        throw Object.assign(new Error(T.offline), { status: 0 });
      }
      const fresh = res.headers?.get?.('X-WP-Nonce');
      if (fresh) nonce = fresh;
      let data = null;
      try { data = await res.json(); } catch { /* not JSON */ }
      if (res.status === 403 && data?.code === 'rest_cookie_invalid_nonce' && attempt === 0 && (await refresh())) continue;
      if (!res.ok) throw Object.assign(new Error(typeof data?.message === 'string' ? data.message : T.failed), { status: res.status });
      return data;
    }
    throw new Error(T.failed);
  }
  return {
    // G1018: the house's machines come to those let in with the realtime server's proof (?in=).
    machines: (owner) => call(`homes/${Number(owner)}/machines${insideQuery(owner)}`),
    room: (place) => call(`machine-rooms/${roomName(place)}/machines`),
    mine: () => call('homes/machines'),
  };
}

function createSession(engine, client) {
  const mp = Boolean(client);
  const site = mp ? createSite() : null;
  let slice = normalizeSlice(savedSlice);
  const me = () => (mp ? String(Number(client.me?.id) || 0) : ME_SOLO);
  /** The home (or machine room) drawn now: { kind: 'own'|'visit'|'room', owner, place, name, x0, groundY, layout?, span?, fixed?, mayTake, key }. */
  let home = null;
  /** id -> { m, sprite, target, frames, frame, art, bar, near, collectedAt } */
  let drawn = new Map();
  let machines = new Map();
  let loading = '';
  let req = 0;
  const sent = new Map();
  let last = '';
  let ownAt = 0;
  let ownBusy = false;
  let lastKey = '';
  let lastScene = null;
  let retryAt = 0;
  /** #404: what was drawn when the street was cleared, for a rebuild in place (same key) to draw again at once. */
  let kept = null;
  let tickAt = 0;
  let loop = null;
  let loopKey = '';
  const checked = new Set();
  /** #730: a placed machine pressed (and, once moved, slid) by its owner: { id, pointerId, x, y, touch, held, dragging, deco, grabDx, rx }. */
  let slide = null;

  const say = (text, ms = 3200) => { if (text) engine.toast?.(text, ms); };
  const upgrades = () => engine.pc?.imaginationUpgrades || [];

  function publish() {
    const t = Date.now();
    engine.setData?.('hmMachines', [...machines.values()].map((m) => `${m.id}:${m.classTsid}:${m.fuel}:${m.job ? (jobRunning(m.job, t) ? 'run' : 'due') : '-'}:${m.waiting.join('+')}`).join(';'));
    engine.setData?.('hmWhere', home ? (home.kind === 'visit' ? `visit:${home.owner}:${home.place}` : `${home.kind}:${home.place}`) : '');
    engine.setData?.('hmLast', last);
  }

  // —— Where we are ——

  /** The place in a home a visit scene shows (MPH_<id>, _IN, _IN<n> an upper floor: R5, G1313, _T<n>). */
  function visitPlace(scene) {
    if (scene.room === 'street') return PLACE_STREET;
    if (scene.room === 'interior') return housePlace(scene.floor);
    if (scene.room === 'tower') return towerPlace(scene.floor);
    return '';
  }

  function where() {
    const tsid = engine.streetTsid;
    // A Community Machine Room: anyone's place to set their machine down (not a quest copy of one).
    const room = roomPlaceOf(tsid);
    if (room && !engine.transientInstance?.()) return { kind: 'room', owner: me(), place: room, key: `room:${room}` };
    const scene = readVisitScene(tsid);
    if (mp && scene) {
      const place = visitPlace(scene);
      return place ? { kind: 'visit', owner: scene.owner, place, key: `visit:${tsid}` } : null;
    }
    const ctx = engine.homeContext?.() || {};
    if (!ctx.inHome) return null;
    const st = homesFeature._state?.();
    const s = st?.scene;
    if (!s) return null;
    const owner = mp ? Number(me()) : ME_SOLO;
    if (s.room === 'street' && tsid === HOME_MACHINES_STREET) return { kind: 'own', owner, place: PLACE_STREET, key: `own:${PLACE_STREET}`, scene: s };
    if (s.room !== 'interior' || tsid !== HOME_MACHINES_INTERIOR) return null;
    // A Tower floor (scene.tower its index), or a floor of the house: G1249 (#669), Glitch's house was one
    // location, so a machine stood on any floor of it, and whoever may enter reaches every floor (R5, G1313).
    if (s.tower != null) return { kind: 'own', owner, place: towerPlace(s.tower), key: `own:${towerPlace(s.tower)}`, scene: s };
    const place = housePlace(s.houseFloor);
    return { kind: 'own', owner, place, key: `own:${place}`, scene: s };
  }

  /** Where a place's machines stand in this scene's world: x0 (rx 0), the walk line, and the street layout or a room's span. */
  function geometry(place, { cult = null, backYard = null, decor = null } = {}) {
    if (place === PLACE_STREET) {
      const layout = homeStreetLayout(cult);
      return { x0: layout.houseX, groundY: STREET_GROUND_Y, layout, span: null };
    }
    const span = roomSpan(place, decor);
    // The house's left end sits past its back yard (homes-feature houseX0: homeStreetLayout(backCult).houseX); an upper house floor and a Tower floor start at 0.
    const x0 = place === PLACE_HOUSE ? homeStreetLayout(createBackYardState(backYard || {})).houseX : 0;
    return { x0, groundY: ROOM_GROUND_Y, layout: null, span };
  }

  /** A machine room: room world x (-700..700) from its street's left end, the floor the room's own machines stand on. */
  function roomGeometry(place) {
    const street = engine.street;
    const bounds = street?.bounds || { l: -700, t: -700 };
    const p = street ? worldToScreen(street, 0, -130) : { x: -bounds.l, y: 570 };
    const floor = nearestSurfaceY(engine.platforms, p.x, p.y) ?? p.y;
    return { x0: p.x, groundY: floor + 2, layout: null, span: roomMachineSpan(), fixed: roomFixedXs(place) };
  }

  function ownGeometry(place) {
    const st = homesFeature._state?.() || {};
    const g = geometry(place, { cult: st.cult, decor: st.decor });
    // Your own house: the room's left end as the scene drew it.
    if (place === PLACE_HOUSE && Number.isFinite(st.scene?.background?.houseX)) g.x0 = st.scene.background.houseX;
    return g;
  }

  // —— Drawing ——

  function clearDrawn() {
    for (const e of drawn.values()) {
      if (e.target) engine.unregister?.(e.target);
      else if (e.sprite && !e.sprite.destroyed) e.sprite.destroy();
      if (e.bar && !e.bar.destroyed) e.bar.destroy();
    }
    drawn = new Map();
  }

  function loadArt(e) {
    const def = machineSheetDef(e.m.classTsid);
    if (!def || !engine.PIXI?.Rectangle) return;
    sheetLoader ||= createSheetLoader(engine.PIXI);
    sheetLoader.load(def).then(() => {
      if (drawn.get(e.m.id) !== e || e.sprite.destroyed) return;
      const frames = sheetLoader.frames(def);
      if (!frames.length) return;
      const s = MACHINE_ART_SHEETS[e.m.classTsid];
      e.frames = frames;
      e.sprite.anchor.set(s.ax / s.fw, s.ay / s.fh);
      e.frame = -1;
    });
  }

  /** Whose machine a subtitle names: the home's owner on a visit; in a room each machine's own (yours: none). */
  function ownerName(m) {
    if (home?.kind === 'visit') return home.name || '';
    if (home?.kind === 'room' && mp && m && String(m.owner) !== me()) return m.ownerName || 'Someone';
    return '';
  }

  /** Who may pick one up: the home's owner or a key-holder; in a room, only the machine's owner (solo: you). */
  function mayTake(m) {
    if (home?.kind === 'room') return !mp || String(m?.owner) === me();
    return Boolean(home?.mayTake);
  }

  /** Whether a machine the server or site names belongs to what is drawn now. */
  function isHere(owner, m, gone = '') {
    if (!home) return false;
    if (home.kind === 'room') return m ? m.place === home.place : machines.has(String(gone));
    return Number(owner) === Number(home.owner);
  }

  function drawOne(m) {
    const { PIXI } = engine;
    if (!PIXI || !engine.entityLayer || !home) return;
    const sprite = new PIXI.Sprite(textureFromUrl(`assets/sprites/icons/${m.classTsid}.webp`));
    standOnFeet(sprite);
    sprite.x = Math.round(home.x0 + m.rx);
    sprite.y = home.groundY;
    sprite.zIndex = 14;
    engine.entityLayer.addChild(sprite);
    const bar = new PIXI.Graphics();
    bar.zIndex = 15;
    engine.entityLayer.addChild(bar);
    const target = engine.register?.({
      classId: m.classTsid,
      featureId: HOME_MACHINES_ID,
      label: machineLabel(m.classTsid),
      subtitle: machineSubtitle(m, { me: me(), ownerName: ownerName(m) }),
      sprite,
      homeMachine: m.id,
    });
    const e = { m, sprite, target, bar, frames: null, frame: -1, art: '', near: false, collectedAt: 0, drawnBar: '' };
    drawn.set(m.id, e);
    loadArt(e);
  }

  function redraw() {
    clearDrawn();
    for (const m of machines.values()) drawOne(m);
    publish();
  }

  /** One machine's new state (from the site or solo), redrawn in place; one that stands elsewhere in the home is not drawn here. */
  function setMachine(m) {
    if (!m) return;
    if (home && m.place !== home.place) {
      if (machines.has(m.id)) dropMachine(m.id);
      return;
    }
    machines.set(m.id, m);
    const e = drawn.get(m.id);
    if (e && !e.sprite.destroyed) {
      e.m = m;
      // #730: one being slid stays under the pointer until it is let go.
      if (slide?.dragging && slide.id === m.id) return publish();
      e.sprite.x = Math.round(home.x0 + m.rx);
    } else if (home) drawOne(m);
    publish();
  }

  function dropMachine(id) {
    machines.delete(id);
    const e = drawn.get(id);
    if (e) {
      if (e.target) engine.unregister?.(e.target);
      if (e.bar && !e.bar.destroyed) e.bar.destroy();
      drawn.delete(id);
    }
    publish();
  }

  /** The machine as I should see it: a job of mine whose time is up already waits for me. */
  function seen(m, t = Date.now()) {
    if (m.job && !jobRunning(m.job, t) && m.job.user === me() && !m.waiting.includes(me())) return { ...m, waiting: [...m.waiting, me()] };
    return m;
  }

  function drawFrame(e, t) {
    if (!e.sprite || e.sprite.destroyed) return;
    const m = seen(e.m, t);
    const running = jobRunning(m.job, t);
    const mine = m.waiting.includes(me());
    const { state, since } = roomMachineState({ job: running ? m.job : null, waiting: !running && mine, collectedAt: e.collectedAt }, t);
    e.art = e.frames ? state : '';
    if (e.frames) {
      const k = machineFrame(m.classTsid, state, t - since);
      if (k >= 0 && k !== e.frame && e.frames[k]) {
        e.frame = k;
        e.sprite.texture = e.frames[k];
      }
    }
    const pct = running ? Math.max(0, Math.min(1, (t - m.job.startedAt) / Math.max(1, m.job.readyAt - m.job.startedAt))) : 0;
    const key = running ? `run:${Math.round(pct * 60)}:${e.sprite.x}` : 'idle';
    if (key !== e.drawnBar && e.bar && !e.bar.destroyed) {
      e.drawnBar = key;
      e.bar.clear();
      if (running) {
        const w = 54;
        const top = e.sprite.y + 10;
        e.bar.roundRect(e.sprite.x - w / 2, top, w, 8, 4).fill({ color: 0x2a2320, alpha: 0.72 });
        e.bar.roundRect(e.sprite.x - w / 2 + 1.5, top + 1.5, Math.max(2, (w - 3) * pct), 5, 2.5).fill({ color: 0x9ed36a, alpha: 0.98 });
      }
    }
  }

  // —— Coming home or visiting ——

  async function loadVisit(at) {
    if (loading === at.key) return;
    loading = at.key;
    try {
      const answer = at.kind === 'room' ? await site.room(at.place) : await site.machines(at.owner);
      const cur = where();
      if (!cur || cur.key !== at.key) return;
      const offset = Date.now() - (Number(answer?.now) || Date.now());
      machines = new Map();
      for (const raw of Array.isArray(answer?.machines) ? answer.machines : []) {
        const m = normalizeMachine(raw, offset);
        if (m && m.place === at.place) machines.set(m.id, m);
      }
      const g = at.kind === 'room'
        ? roomGeometry(at.place)
        : at.kind === 'visit'
          ? geometry(at.place, { cult: normalizeCultivationState(answer?.cult || {}), backYard: answer?.backYard || null, decor: { wallSegments: Number(answer?.segments) || undefined } })
          : ownGeometry(at.place);
      home = { kind: at.kind, owner: at.owner, place: at.place, name: String(answer?.name || ''), ...g, mayTake: answer?.mayTake === true, key: at.key };
      redraw();
    } catch (err) {
      console.warn('[home-machines]', err?.message || err);
      last = `load-failed:${err?.status ?? ''}`;
      // Try again in a moment (the tick draws afresh when the key is new).
      retryAt = Date.now() + 5000;
    } finally {
      loading = '';
    }
  }

  function enterSolo(at) {
    const room = at.kind === 'room';
    home = { kind: room ? 'room' : 'own', owner: ME_SOLO, place: at.place, name: '', ...(room ? roomGeometry(at.place) : ownGeometry(at.place)), mayTake: true, key: at.key };
    machines = new Map();
    for (const row of slice.machines) {
      // A room is no POL: the owner's output goes after 6 game days too (expireOldContents).
      expireSolo(row, isRoomPlace(row.place) ? null : ME_SOLO);
      if (row.place === at.place) machines.set(row.id, row);
    }
    redraw();
  }

  // —— My own game: what I set down, picked up and made ——

  /** The machine being set down online (R18): its copy, found again by its tank when the site answers. */
  let placing = null;

  /** Set down: the machine leaves the pack once, its tank going with it (the copy that leaves). */
  function applyPlaced(id, classTsid) {
    if (slice.placed.includes(id)) return false;
    slice.placed.push(id);
    if (countItem(engine.inv, classTsid) > 0) {
      // R18 (G974): the one chosen in the pack is the one set down (machine_base place took that itemstack).
      const chosen = placing?.classTsid === classTsid ? placing.pick : null;
      placing = null;
      if (engine.toolState && !(chosen && markLeaving(engine, classTsid, chosen, 1) && takeCopies(engine.toolState, classTsid, chosen, 1).length)) takeToolCopy(engine.toolState, classTsid);
      removeItem(engine.inv, classTsid, 1);
      engine.refreshPack?.();
    }
    return true;
  }

  /** Picked up: it comes back to the pack once, with its tank. */
  function applyTaken(op, classTsid, fuel) {
    if (slice.taken.includes(op) || !isHomeMachineClass(classTsid)) return false;
    slice.taken = [...slice.taken, op].slice(-TAKEN_KEEP);
    ensureItem(classTsid);
    addItem(engine.inv, classTsid, 1);
    if (engine.toolState) receiveToolCopy(engine.toolState, classTsid, Math.max(0, Math.min(MAX_FUEL, Number(fuel) || 0)));
    engine.refreshPack?.();
    return true;
  }

  async function loadOwn() {
    if (!mp || ownBusy) return;
    ownBusy = true;
    ownAt = Date.now();
    try {
      const a = await site.mine();
      let changed = false;
      const ids = [];
      for (const row of Array.isArray(a?.placed) ? a.placed : []) {
        if (!isMachineOp(row?.id)) continue;
        ids.push(row.id);
        changed = applyPlaced(row.id, String(row.class || '')) || changed;
      }
      // Only machines still standing keep their place in the list.
      slice.placed = slice.placed.filter((id) => ids.includes(id));
      for (const row of Array.isArray(a?.taken) ? a.taken : []) {
        if (isMachineOp(row?.op)) changed = applyTaken(row.op, String(row.class || ''), row.fuel) || changed;
      }
      if (changed) {
        engine.save?.();
        saveStore?.flush?.().catch?.(() => {});
      }
    } catch (err) {
      console.warn('[home-machines]', err?.message || err);
    } finally {
      ownBusy = false;
    }
  }

  /** finishMakingKnown for my own job, wherever I am: the iMG and the badge counters (the output waits in the machine). */
  function creditJobs(t) {
    for (const [op, job] of Object.entries(slice.jobs)) {
      if (t < job.readyAt) continue;
      delete slice.jobs[op];
      const recipe = RECIPE_CATALOG[job.key];
      const hold = { ...job.held };
      const scratch = tankOf({ classTsid: job.classTsid, fuel: MAX_FUEL });
      const res = engine.makeStationJob?.({ key: job.key, qty: job.qty, hold, tool: job.classTsid, toolState: scratch }) || { made: 0, xp: 0, msgs: [] };
      // finishMakingKnown 915-918: the "pick up your stuff soon" warning only away from your own home (a machine room is nobody's).
      const ownHome = !isRoomPlace(job.place) && (!mp || job.owner === Number(me()));
      const line = ownHome ? machineMadeLine(recipe?.name || job.key, job.qty, res.xp).replace(/ Make sure to pick up your stuff soon, or it might disappear!$/, '') : machineMadeLine(recipe?.name || job.key, job.qty, res.xp);
      engine.pushActivity?.(line);
      engine.playSound?.('READY', { volume: 0.55 });
      last = `done:${job.machine}`;
      const e = drawn.get(job.machine);
      if (e?.target) engine.say?.(e.target, CALL_PLAYER_LINES[Math.floor(Math.random() * CALL_PLAYER_LINES.length)], 3000);
      else engine.toast?.(`${machineLabel(job.classTsid)}: ${line}`, 4200);
      // onMakingComplete: a machine in a machine room rolls the Altar bonus for its maker (isInCraftingAltar).
      if (placeIsAltar(job.place) && res.made > 0) payAltarBonus(engine, job.classTsid, recipe?.id ?? '', res.made);
      // The site settles it (the owner's share too) when anyone next looks: ask now.
      if (mp && job.machine) {
        if (home && machines.has(job.machine) && (home.kind === 'room' || Number(home.owner) === job.owner)) act('check', machines.get(job.machine));
        else if (isRoomPlace(job.place)) site.room(job.place).catch(() => {});
        else site.machines(job.owner).catch(() => {});
      }
      engine.save?.();
    }
  }

  // —— Acts ——

  function send(verb, m, extra = {}, { retried = false } = {}) {
    if (!client || client.state !== 'online') {
      say(offlineLine(client));
      return false;
    }
    req += 1;
    sent.set(req, { verb, id: m?.id || '', at: Date.now(), extra, retried });
    // In a room the act names the machine's owner (a place names me: I set my own down).
    const owner = home.kind === 'room' ? Number(m ? m.owner : me()) : Number(home.owner);
    const ok = client.send('home_machine', { req, owner, verb, ...(m ? { id: m.id } : {}), ...extra });
    if (ok === false) {
      sent.delete(req);
      say(offlineLine(client));
      return false;
    }
    last = `sent:${verb}:${m?.id || extra.class || ''}`;
    publish();
    return true;
  }

  function act(verb, m, extra = {}) {
    if (mp) return send(verb, m, extra);
    return solo(verb, m, extra);
  }

  /** The Make panel's Make on a placed machine: the ingredients go in and the job starts. */
  function startJob(m, { key, recipe, qty }) {
    const t = Date.now();
    const cur = machines.get(m.id) || m;
    if (jobRunning(cur.job, t)) {
      say(cur.job.user === me() ? `The machine is still running. ${secondsToString(Math.round((cur.job.readyAt - t) / 1000))} remaining.` : `Someone else is using this. ${secondsToString(Math.round((cur.job.readyAt - t) / 1000))} remaining.`);
      return false;
    }
    if (seen(cur, t).waiting.includes(me())) {
      say(T.collectFirst);
      return false;
    }
    const n = Math.max(1, Math.floor(Number(qty) || 1));
    if (n > jobLimit(recipe.taskLimit, upgrades())) {
      say(T.tooMany);
      return false;
    }
    const need = jobFuel(cur.classTsid, recipe.toolWear, n, upgrades());
    if (cur.fuel < Math.max(1, need)) {
      say(T.noFuel(machineLabel(cur.classTsid)));
      return false;
    }
    if (mp) {
      // #689: offline the act can't go: say so and keep the Make panel open (false), as a refusal does.
      if (!client || client.state !== 'online') {
        say(offlineLine(client));
        return false;
      }
      // The ledger counts what the last save held: write it first, then ask.
      const go = () => send('use', cur, { key, qty: n });
      const f = saveStore?.flush?.();
      if (f?.then) f.then(go, go);
      else go();
      return true;
    }
    return solo('use', cur, { key, recipe, qty: n, need });
  }

  function useMachine(m) {
    engine.openMakeStation?.({
      tool: m.classTsid,
      toolState: tankOf(m),
      homeMachine: m.id,
      startJob: (job) => startJob(m, job),
    });
    last = `use:${m.id}`;
    publish();
  }

  function pickUp(m) {
    if (othersInside(m, me()) && engine.prompt) {
      engine.prompt({ modal: true, text: T.othersInside, choices: [{ label: 'Yes', value: true }, { label: 'No', value: false }], onChoice: (v) => { if (v === true) act('take', m, { force: true }); } });
      return;
    }
    act('take', m, othersInside(m, me()) ? { force: true } : {});
  }

  /**
   * #557: `count` Fuel Cells from Refuel's How many?. Online the realtime server takes one cell or all
   * that fit (home_machine refuel, `all`): all of them asks for all, any other count goes one at a
   * time, the next asked when the last has settled (onDone, refuelMore).
   */
  let refuelMore = null;
  function refuel(m, count = 1) {
    const n = Math.max(1, Math.floor(Number(count)) || 1);
    if (mp) {
      const most = Math.min(Math.floor((MAX_FUEL - m.fuel) / FUEL_PER_CELL), countItem(engine.inv, FUEL_CELL));
      const all = n > 1 && n >= most;
      refuelMore = all || n === 1 ? null : { id: m.id, left: n - 1 };
      sendRefuel(m, all);
      return;
    }
    solo('refuel', m, { count: n });
  }

  function sendRefuel(m, all = false) {
    const go = () => send('refuel', m, all ? { all: true } : {});
    const f = saveStore?.flush?.();
    if (f?.then) f.then(go, go);
    else go();
  }

  /**
   * Set a machine down from the pack: `copy`, the one its menu was about (its place among the class's copies).
   * G1303 (#669): `dropX`, a world x, is where a Decoration Mode drag let it go (HandOfDecorator.as
   * dropItemFromPackOnTargetPlatform 1673-1690 sent drop_x / drop_y and takeable.js 164-170 put it
   * there); without it, at your feet (takeable.js:164 dest_x = pc.x). The 200 px is from you either way
   * (placeCheck `from`: canDrop's findCloseStack measured from the player). Online the act carries where
   * this place's x 0 and walk line are as drawn here (ox, oy): the realtime server reads where you stand
   * from its own record of your moves against them and the site measures the 200 px from there
   * (home_machines.go machineFromPos, HomeMachines::placeWhy), the same rule as here.
   */
  function placeFromPack(classTsid, copy = null, dropX = null) {
    const at = where();
    if (!at || at.kind === 'visit' || !home || home.kind !== at.kind) return say(T.placeHome, 2600);
    if (countItem(engine.inv, classTsid) < 1) return false;
    const p = engine.player;
    const feet = Math.round((p?.x || 0) - home.x0);
    const rx = Number.isFinite(dropX) ? Math.round(dropX - home.x0) : feet;
    const from = { rx: feet, dy: Number.isFinite(p?.y) ? p.y - home.groundY : 0 };
    const check = placeCheck({ machines: [...machines.values()], rx, layout: home.layout, span: home.span, classTsid, fixed: home.fixed || [], from });
    if (!check.ok) return say(check.msg, 2600);
    const one = Number.isInteger(copy) && copy >= 0 && copy < countItem(engine.inv, classTsid) ? copy : null;
    const fuel = engine.toolState ? takeToolCopy(engine.toolState, classTsid, { copy: one ?? undefined, take: false }) : null;
    if (mp) {
      placing = one != null && Number.isFinite(fuel) ? { classTsid, pick: { copy: one, copies: [one], r: fuel, t: null } } : null;
      const origin = Number.isFinite(home.x0) && Number.isFinite(home.groundY) ? { ox: home.x0, oy: home.groundY } : {};
      return send('place', null, { class: classTsid, rx: check.rx, ...origin, ...(Number.isFinite(fuel) ? { fuel: Math.max(0, Math.min(MAX_FUEL, Math.round(fuel))) } : {}) });
    }
    return solo('place', null, { classTsid, rx: check.rx, copy: one });
  }

  // —— #730: the owner slides a placed machine along its floor ——

  /**
   * Whether I may slide this machine here (Austin 2026-11-27: "slide them as Glitch: drag to move, no
   * 200 px rule on a move"). Glitch: a machine is pickupable, so a press on it drags in play
   * (LocationInputHandler.as _locMouseDownHandler 431-435) and in Decoration Mode (HandOfDecorator.as
   * onMouseDown 2411-2427, startWithItemFromLocation 1259), and the drop lands precisely only where you
   * can decorate (locDragStartHandler 551-557): your own house or Tower (WorldModel.as 59, location.js
   * 2699-2706), and the move is the owner's (main.js doModifyItem 4853: "You are not at home"). So
   * never a visitor or a key-holder, never the home street or a machine room.
   */
  function canSlide(id) {
    const e = drawn.get(String(id || ''));
    const at = where();
    return Boolean(e && home && at && at.kind === 'own' && home.kind === 'own' && at.key === home.key && slidePlace(home.place) && String(home.owner) === me());
  }

  /** Slide machine `id` to room x `rx` on its floor (kept between the inner walls); its job and tank go with it. */
  function move(id, rx) {
    const m = machines.get(String(id || ''));
    if (!m || !canSlide(m.id)) return false;
    const check = moveCheck({ rx, span: home.span, place: home.place });
    if (!check.ok) return false;
    if (check.rx === m.rx) {
      placeDrawn(m.id);
      return true;
    }
    if (mp) {
      // Drawn where it was let go until the site answers (onDone puts it back on a refusal).
      const e = drawn.get(m.id);
      if (e && !e.sprite.destroyed) e.sprite.x = Math.round(home.x0 + check.rx);
      return send('move', m, { rx: check.rx });
    }
    return solo('move', m, { rx: check.rx });
  }

  /** A machine drawn where it stands (after a slide that went nowhere or was refused). */
  function placeDrawn(id) {
    const e = drawn.get(id);
    const m = machines.get(id);
    if (e && m && home && !e.sprite.destroyed) e.sprite.x = Math.round(home.x0 + m.rx);
  }

  /** The game canvas's client point in the world the machines are drawn in (homes-feature worldPoint). */
  function worldAt(ev) {
    const canvas = ev.target;
    const r = canvas?.getBoundingClientRect?.();
    if (!r?.width || !engine.entityLayer?.toLocal || !engine.PIXI?.Point) return null;
    const k = (engine.camera?.w || 960) / r.width;
    return engine.entityLayer.toLocal(new engine.PIXI.Point((ev.clientX - r.left) * k, (ev.clientY - r.top) * k));
  }

  /** The machine I may slide under a pointer on the game canvas, or null. */
  function slidableAt(ev) {
    if (ev.target?.tagName !== 'CANVAS' || home?.kind !== 'own' || !slidePlace(home.place) || drawn.size === 0) return null;
    const p = worldAt(ev);
    const t = p ? engine.interactableAt?.(p.x, p.y) : null;
    const e = t?.homeMachine ? drawn.get(t.homeMachine) : null;
    return e && canSlide(e.m.id) ? { e, p } : null;
  }

  const SLIDE_HOLD_MS = 350; // a finger holds still this long first (homes-feature LOOSE_HOLD_MS), so a swipe never moves it
  function onSlideDown(ev) {
    if (slide || (ev.pointerType === 'mouse' && (ev.button !== 0 || ev.ctrlKey))) return;
    const editing = homesFeature.homeEditMode?.() || null;
    if (editing && editing !== 'decorate') return;
    // A slide starts wherever a click on the world would act (worldPress's gates), so a New Quest card
    // or a notice up on the screen doesn't turn the drag into a text selection.
    if (!editing && (engine.worldPressBlocked ? engine.worldPressBlocked() || engine.acting?.() : engine.busy?.({ ignoreHome: true }))) return;
    const hit = slidableAt(ev);
    if (!hit) return;
    const touch = ev.pointerType !== 'mouse';
    slide = { id: hit.e.m.id, pointerId: ev.pointerId, x: ev.clientX, y: ev.clientY, touch, held: !touch, dragging: false, deco: editing === 'decorate', grabDx: hit.e.sprite.x - hit.p.x, rx: hit.e.m.rx };
    if (touch) {
      const mine = slide;
      mine.timer = setTimeout(() => { mine.held = true; }, SLIDE_HOLD_MS);
    }
    if (slide.deco) {
      ev.stopPropagation();
      ev.preventDefault();
    }
    // Out of Decoration Mode the press goes on to the world: a click still opens the machine's menu.
    window.addEventListener('pointermove', onSlideMove, true);
    window.addEventListener('pointerup', onSlideUp, true);
    window.addEventListener('pointercancel', onSlideUp, true);
  }

  function onSlideMove(ev) {
    if (!slide || ev.pointerId !== slide.pointerId) return;
    const e = drawn.get(slide.id);
    if (!e || e.sprite.destroyed || !home) return endSlide();
    if (!slide.dragging) {
      const moved = Math.hypot(ev.clientX - slide.x, ev.clientY - slide.y);
      if (slide.touch && !slide.held) {
        if (moved > LONG_PRESS_SLOP) endSlide();
        return;
      }
      if (moved < DRAG_DIST) return;
      slide.dragging = true;
      // The press opened the machine's menu (out of Decoration Mode): the drag takes over.
      engine.closeVerbMenu?.();
      e.sprite.alpha = 0.85;
      engine.setData?.('hmSlide', slide.id);
    }
    ev.preventDefault();
    const p = worldAt(ev);
    if (!p) return;
    const check = moveCheck({ rx: p.x + slide.grabDx - home.x0, span: home.span, place: home.place });
    if (!check.ok) return;
    slide.rx = check.rx;
    e.sprite.x = Math.round(home.x0 + check.rx);
  }

  function onSlideUp(ev) {
    if (!slide || ev.pointerId !== slide.pointerId) return;
    const was = slide;
    endSlide();
    if (!was.dragging) return;
    if (was.deco) ev.stopPropagation();
    if (ev.type === 'pointercancel') return placeDrawn(was.id);
    if (!move(was.id, was.rx)) placeDrawn(was.id);
  }

  function endSlide() {
    if (slide) {
      clearTimeout(slide.timer);
      const e = drawn.get(slide.id);
      if (e?.sprite && !e.sprite.destroyed) e.sprite.alpha = 1;
    }
    slide = null;
    engine.setData?.('hmSlide', '');
    if (typeof window === 'undefined' || !window.removeEventListener) return;
    window.removeEventListener('pointermove', onSlideMove, true);
    window.removeEventListener('pointerup', onSlideUp, true);
    window.removeEventListener('pointercancel', onSlideUp, true);
  }

  /** A hand over a machine you can slide (HandOfDecorator updateHighlightedLISView: what you could lift shows it). */
  let grabCursor = null;
  function onSlideHover(ev) {
    if (ev.pointerType !== 'mouse' || slide || ev.buttons) return;
    const hit = ev.target?.tagName === 'CANVAS' ? slidableAt(ev) : null;
    if (hit) {
      ev.target.style.cursor = 'grab';
      grabCursor = ev.target;
    } else if (grabCursor) {
      if (grabCursor.style.cursor === 'grab') grabCursor.style.cursor = '';
      grabCursor = null;
    }
  }

  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('pointerdown', onSlideDown, true);
    window.addEventListener('pointermove', onSlideHover);
  }

  // —— Solo: the rules on the slice ——

  function newId() {
    const hex = Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    return `hm-${hex}`;
  }

  function soloSaved() {
    // This place's machines as they stand, the rest of the home's as they were.
    slice.machines = [...slice.machines.filter((row) => row.place !== home?.place), ...machines.values()];
    engine.save?.();
    publish();
  }

  function solo(verb, m, extra) {
    const t = Date.now();
    if (verb === 'place') {
      if (Number.isInteger(extra.copy)) engine.query?.('packTakeUnit', extra.classTsid, extra.copy, 1, engine);
      const fuel = engine.toolState ? takeToolCopy(engine.toolState, extra.classTsid, Number.isInteger(extra.copy) ? { copy: extra.copy } : {}) : 50;
      removeItem(engine.inv, extra.classTsid, 1);
      engine.refreshPack?.();
      const row = { id: newId(), classTsid: extra.classTsid, owner: '', ownerName: '', place: home.place, rx: extra.rx, fuel: Math.max(0, Math.min(MAX_FUEL, Math.round(Number(fuel) || 0))), music: true, job: null, contents: {}, waiting: [] };
      machines.set(row.id, row);
      drawOne(row);
      say(T.placed(machineLabel(row.classTsid)));
      engine.pushActivity?.(T.placed(machineLabel(row.classTsid)));
      last = `placed:${row.id}`;
      soloSaved();
      return true;
    }
    const row = machines.get(m.id);
    if (!row) return false;
    if (verb === 'use') {
      const held = takeJobIngredients(engine.inv, extra.recipe, extra.qty, { count: countItem, remove: removeItem });
      if (!held) {
        say(T.ingredients);
        return false;
      }
      const ms = machineJobMs(extra.recipe.waitMs, extra.qty, 1);
      row.job = { user: ME_SOLO, key: extra.key, recipeId: String(extra.recipe.id ?? ''), name: extra.recipe.name || extra.key, qty: extra.qty, held, need: extra.need, startedAt: t, readyAt: t + ms };
      slice.jobs[row.id] = { key: extra.key, qty: extra.qty, classTsid: row.classTsid, readyAt: t + ms, held, owner: 0, machine: row.id, place: row.place };
      engine.toast?.(`${machineLabel(row.classTsid)}: making ${row.job.name} (x${extra.qty}), ${secondsToString(Math.round(ms / 1000))} to go.`, 2800);
      engine.refreshPack?.();
      last = `start:${row.id}:${extra.key}x${extra.qty}`;
      soloSaved();
      return true;
    }
    if (verb === 'collect') {
      settleSolo(row, jobOutputs(RECIPE_CATALOG[row.job?.key], row.job?.qty), t);
      const items = row.contents[ME_SOLO]?.items;
      if (!items) return false;
      delete row.contents[ME_SOLO];
      row.waiting = Object.keys(row.contents);
      for (const [cls, n] of Object.entries(items)) {
        ensureItem(cls);
        addItem(engine.inv, cls, n);
      }
      collected(row);
      soloSaved();
      return true;
    }
    if (verb === 'refuel') {
      const fit = Math.floor((MAX_FUEL - row.fuel) / FUEL_PER_CELL);
      const cells = Math.min(countItem(engine.inv, FUEL_CELL), fit, Math.max(1, Math.floor(Number(extra.count)) || 1));
      if (fit < 1) return say(`There is not enough space for a fuel cell. Current level: ${row.fuel}/${MAX_FUEL}`);
      if (cells < 1) return say("You don't have any fuel cells.");
      removeItem(engine.inv, FUEL_CELL, cells);
      row.fuel = Math.min(MAX_FUEL, row.fuel + cells * FUEL_PER_CELL);
      refuelled(row, cells);
      soloSaved();
      return true;
    }
    if (verb === 'take') {
      settleSolo(row, jobOutputs(RECIPE_CATALOG[row.job?.key], row.job?.qty), t);
      if (jobRunning(row.job, t)) return say(T.stillRunning);
      ensureItem(row.classTsid);
      addItem(engine.inv, row.classTsid, 1);
      if (engine.toolState) receiveToolCopy(engine.toolState, row.classTsid, row.fuel);
      engine.refreshPack?.();
      dropMachine(row.id);
      say(T.pickedUp(machineLabel(row.classTsid)));
      engine.pushActivity?.(T.pickedUp(machineLabel(row.classTsid)));
      last = `taken:${row.id}`;
      soloSaved();
      return true;
    }
    if (verb === 'music') {
      row.music = extra.on === true;
      soloSaved();
      return true;
    }
    if (verb === 'move') {
      // #730: the same machine, where it was let go (doModifyItem: apiPutItemIntoPosition), its job and tank with it.
      row.rx = extra.rx;
      placeDrawn(row.id);
      last = `moved:${row.id}:${row.rx}`;
      soloSaved();
      return true;
    }
    return false;
  }

  function collected(m) {
    const e = drawn.get(m.id);
    if (e) e.collectedAt = Date.now();
    engine.playSound?.('COLLECT', { volume: 0.6 });
    const line = collectLine(m.classTsid);
    engine.pushActivity?.(line);
    say(line);
    engine.updateHud?.();
    engine.refreshPack?.();
    last = `collected:${m.id}`;
  }

  function refuelled(m, cells) {
    engine.achievement?.('machines:refueled', 1);
    // refuel 549-551: refueled_for_others away from your own home (a visit, or a machine room).
    if (home && home.kind !== 'own') engine.achievement?.('machines:refueled_for_others', 1);
    const msg = `You added ${cells} Fuel Cell${cells === 1 ? '' : 's'}. Fuel: ${m.fuel}/${MAX_FUEL}.`;
    say(msg);
    engine.pushActivity?.(msg);
    engine.updateHud?.();
    last = `refuel:${m.id}:${m.fuel}`;
  }

  // —— The server's answers ——

  function applyGoods(goods, sign) {
    for (const row of Array.isArray(goods?.items) ? goods.items : []) {
      const cls = String(row?.c || '');
      const n = Math.max(0, Math.floor(Number(row?.n) || 0));
      if (!cls || !n) continue;
      if (sign > 0) {
        ensureItem(cls);
        addItem(engine.inv, cls, n);
      } else removeItem(engine.inv, cls, Math.min(n, countItem(engine.inv, cls)));
    }
  }

  function receipt(r, sign) {
    if (!r?.op || engine.query?.('ledgerReceipt', String(r.op), engine) === false) return false;
    applyGoods(sign > 0 ? r.got : r.gave, sign);
    engine.refreshPack?.();
    engine.updateHud?.();
    return true;
  }

  /**
   * #465: in your own home the server answers "You need to be in their home" when it does not
   * have you on your home street (home_machines.go machinePlace: cl.Street() is not HOME_<you>).
   * Stand on it again and ask once more; a second refusal says why.
   */
  function retryAway(msg, ask) {
    if (msg.why !== 'away' || !ask || ask.retried || home?.kind !== 'own' || Number(msg.owner) !== Number(me())) return false;
    if (!engine.homeContext?.().inHome) return false;
    const street = engine.query?.('realtimeStreet', engine);
    if (!street || !engine.player) return false;
    client.join({ street, ...poseOf(engine.player), look: lookOf(engine) });
    let done = false;
    const again = () => {
      if (done) return;
      done = true;
      off?.();
      send(ask.verb, ask.id ? machines.get(ask.id) || { id: ask.id } : null, ask.extra, { retried: true });
    };
    // The server's street answer (realtime-client 'roster'), or a short wait if none comes.
    const off = client.on?.('roster', again);
    setTimeout(again, 2000);
    last = `rejoin:${msg.verb}`;
    return true;
  }

  function onDone(msg) {
    const ask = sent.get(Number(msg.req));
    sent.delete(Number(msg.req));
    const offset = Date.now() - (Number(msg.now) || Date.now());
    const m = normalizeMachine(msg.machine, offset);
    const here = isHere(msg.owner, m, msg.gone);
    if (msg.status !== 'settled' && retryAway(msg, ask)) {
      publish();
      return;
    }
    if (msg.status !== 'settled') {
      if (msg.verb === 'refuel') refuelMore = null;
      // #730: a slide refused goes back where it stands.
      if (msg.verb === 'move' && ask?.id) placeDrawn(ask.id);
      last = `no:${msg.verb}:${msg.why || ''}`;
      say(String(msg.text || T.failed), 3000);
      engine.playSound?.('CLICK_FAILURE', { volume: 0.45 });
      if (here && m) setMachine(m);
      publish();
      return;
    }
    const verb = String(msg.verb || ask?.verb || '');
    if (verb === 'place' && m) {
      applyPlaced(m.id, m.classTsid);
      if (here) setMachine(m);
      say(T.placed(machineLabel(m.classTsid)));
      engine.pushActivity?.(T.placed(machineLabel(m.classTsid)));
      last = `placed:${m.id}`;
    } else if (verb === 'take' && msg.taken) {
      applyTaken(String(msg.taken.op || msg.op || ''), String(msg.taken.class || ''), msg.taken.fuel);
      if (msg.gone) dropMachine(String(msg.gone));
      say(T.pickedUp(machineLabel(String(msg.taken.class || ''))));
      engine.pushActivity?.(T.pickedUp(machineLabel(String(msg.taken.class || ''))));
      last = `taken:${msg.gone}`;
    } else if (verb === 'use' && m) {
      // The ingredients leave the pack once; the job is mine to be credited when it is done.
      receipt(msg.receipt, -1);
      if (m.job && isMachineOp(msg.op)) {
        slice.jobs[msg.op] = { key: ask?.extra?.key || '', qty: m.job.qty, classTsid: m.classTsid, readyAt: m.job.readyAt, held: heldOf(msg.receipt), owner: Number(msg.owner), machine: m.id, place: m.place };
        engine.toast?.(`${machineLabel(m.classTsid)}: making ${m.job.name} (x${m.job.qty}), ${secondsToString(Math.round((m.job.readyAt - Date.now()) / 1000))} to go.`, 2800);
      }
      if (here) setMachine(m);
      last = `start:${m.id}`;
    } else if (verb === 'refuel' && m) {
      receipt(msg.receipt, -1);
      if (here) setMachine(m);
      refuelled(m, Number(msg.cells) || 1);
      // #557: the next cell of a How many? count, one at a time.
      const more = refuelMore;
      refuelMore = null;
      if (more && more.id === m.id && more.left > 0 && m.fuel <= MAX_FUEL - FUEL_PER_CELL && countItem(engine.inv, FUEL_CELL) > 0) {
        refuelMore = more.left > 1 ? { id: m.id, left: more.left - 1 } : null;
        sendRefuel(m);
      }
    } else if (verb === 'collect' && m) {
      receipt(msg.receipt, 1);
      if (here) setMachine(m);
      collected(m);
    } else if (verb === 'move' && m) {
      if (here) setMachine(m);
      last = `moved:${m.id}:${m.rx}`;
    } else if (m && here) setMachine(m);
    engine.save?.();
    publish();
  }

  function heldOf(r) {
    const out = {};
    for (const row of Array.isArray(r?.gave?.items) ? r.gave.items : []) out[String(row.c)] = Math.max(0, Math.floor(Number(row.n) || 0));
    return out;
  }

  function onChanged(msg) {
    const owner = Number(msg.owner);
    if (owner === Number(me())) {
      for (const p of Array.isArray(msg.paid) ? msg.paid : []) {
        const who = Number(p?.user) === Number(msg.by?.id) ? String(msg.by?.name || 'Someone') : 'Someone';
        const cls = machines.get(String(p?.id || ''))?.classTsid || msg.machine?.class || '';
        const line = T.madeAtYours(who, machineLabel(cls));
        engine.pushActivity?.(line);
        last = `paid:${p?.user}:${p?.amount}`;
      }
    }
    const offset = Date.now() - (Number(msg.now) || Date.now());
    const m = normalizeMachine(msg.machine, offset);
    if (!isHere(owner, m, msg.gone)) return publish();
    if (msg.gone) dropMachine(String(msg.gone));
    if (m) setMachine(m);
    publish();
  }

  if (client) {
    client.on('msg:home_machine_done', onDone);
    client.on('msg:home_machine_changed', onChanged);
  }

  // —— Ticking ——

  function tickMachines(t) {
    const p = engine.player;
    for (const e of drawn.values()) {
      const m = seen(e.m, t);
      const sub = machineSubtitle(m, { me: me(), now: t, ownerName: ownerName(m) });
      if (e.target && e.target.subtitle !== sub) e.target.subtitle = sub;
      // onPlayerCollision: come near with your stuff waiting and it calls you.
      const near = p && Math.abs(p.x - e.sprite.x) <= MACHINE_HITBOX.w / 2 && Math.abs((p.y || 0) - e.sprite.y) <= MACHINE_HITBOX.h;
      if (near && !e.near && m.waiting.includes(me()) && !jobRunning(m.job, t) && e.target) engine.say?.(e.target, CALL_PLAYER_LINES[Math.floor(Math.random() * CALL_PLAYER_LINES.length)], 3000);
      e.near = near;
      // Solo: a job done settles on the slice (the output waits; the low fuel bubble).
      if (!mp && e.m.job && !jobRunning(e.m.job, t)) {
        settleSolo(e.m, jobOutputs(RECIPE_CATALOG[e.m.job.key], e.m.job.qty), t);
        if (isLowFuel(e.m.fuel) && e.target) engine.say?.(e.target, LOW_FUEL_LINE, LOW_FUEL_BUBBLE_MS);
        soloSaved();
      }
      // Anyone's job whose time is up: ask the site once, so everyone sees it done.
      if (mp && e.m.job && !jobRunning(e.m.job, t + 400) && !checked.has(`${e.m.id}:${e.m.job.readyAt}`) && e.m.job.user !== me()) {
        checked.add(`${e.m.id}:${e.m.job.readyAt}`);
        setTimeout(() => { if (machines.get(e.m.id)?.job) act('check', machines.get(e.m.id)); }, 1500 + Math.random() * 1500);
      }
    }
    // The hum while a job of mine runs here (onPlayerEnter, onMakingStart).
    const mineRunning = [...drawn.values()].find((e) => jobRunning(e.m.job, t) && e.m.job.user === me());
    const want = mineRunning ? runningSoundKey(mineRunning.m.classTsid, { upgrade: upgrades().includes('metalmaking_music'), musicOn: mineRunning.m.music }) : '';
    if (want !== loopKey) {
      loop?.stop?.();
      loop = want ? engine.playSoundLoop?.(want, { volume: want === 'METALMAKER' ? 0.5 : 0.36 }) || null : null;
      loopKey = want;
    }
    for (const [r, a] of sent) {
      if (t - a.at > ASK_MS) {
        sent.delete(r);
        if (a.verb === 'move' && a.id) placeDrawn(a.id);
        say(T.failed, 2400);
      }
    }
  }

  /** QA (solo): &homemachinedemo=<machine> on your home street: the machine, its skill, Engineering and two jobs' ingredients. */
  function demo(at) {
    const cls = engine.param?.('homemachinedemo');
    if (demoDone || mp || !at || at.kind === 'visit' || !DEMO_ITEMS[cls]) return;
    demoDone = true;
    for (const skill of ['engineering_1', MACHINE_SKILLS[cls]]) if (!(engine.learnedSkills || []).includes(skill)) engine.grantSkill?.(skill);
    if (countItem(engine.inv, cls) < 1 && ![...machines.values()].some((m) => m.classTsid === cls)) {
      ensureItem(cls);
      addItem(engine.inv, cls, 1);
      if (engine.toolState) receiveToolCopy(engine.toolState, cls, 50);
    }
    for (const [id, n] of Object.entries(DEMO_ITEMS[cls])) {
      ensureItem(id);
      const short = n - countItem(engine.inv, id);
      if (short > 0) addItem(engine.inv, id, short);
    }
    engine.refreshPack?.();
    engine.updateHud?.();
    last = `demo:${cls}`;
  }

  return {
    tick(now) {
      const at = where();
      demo(at);
      // Online, my own id comes with the socket's welcome: until then, nothing is mine to draw.
      if (mp && !(Number(me()) > 0)) return;
      if (retryAt && Date.now() >= retryAt) {
        retryAt = 0;
        // Machines still drawn from before a rebuild (#404) stay up while the fetch tries again.
        if (mp && home && at && at.key === home.key) loadVisit(at);
        else if (!home) lastKey = '';
      }
      const key = at ? (at.kind === 'own' || at.kind === 'room' ? `${at.key}:${engine.streetTsid}` : at.key) : '';
      const scene = at?.scene || null;
      // Off any machine place (a cleared street keys as ''): nothing is kept for a later visit.
      if (!at) kept = null;
      if (key !== lastKey || scene !== lastScene) {
        // #404: the home rebuilt in place (decorate, cultivate, a door): the same place again. Draw the
        // machines already loaded at once in the new scene's geometry; the fetch below still brings real changes.
        const prev = home && key === lastKey ? home : kept && key === kept.key ? kept.home : null;
        kept = null;
        lastKey = key;
        lastScene = scene;
        clearDrawn();
        home = null;
        if (mp && at && prev) {
          home = { ...prev, ...(at.kind === 'own' ? ownGeometry(at.place) : at.kind === 'room' ? roomGeometry(at.place) : {}) };
          redraw();
        } else machines = new Map();
        if (at) {
          if (mp) loadVisit(at);
          else enterSolo(at);
        }
        publish();
      }
      if (mp && engine.started && (!ownAt || ((at?.kind === 'own' || at?.kind === 'room') && now - ownAt > OWN_FETCH_MS))) loadOwn();
      creditJobs(Date.now());
      for (const e of drawn.values()) drawFrame(e, Date.now());
      if (now - tickAt < 250) return;
      tickAt = now;
      tickMachines(Date.now());
    },
    cleared() {
      for (const e of drawn.values()) if (e.target) engine.unregister?.(e.target);
      drawn = new Map();
      kept = home && lastKey ? { key: lastKey, home } : null;
      home = null;
      lastKey = '';
      loop?.stop?.();
      loop = null;
      loopKey = '';
    },
    verbsFor(target) {
      const e = drawn.get(target?.homeMachine);
      if (!e) return null;
      const t = Date.now();
      return placedMachineVerbs(seen(e.m, t), {
        me: me(),
        mayTake: mayTake(e.m),
        learned: engine.learnedSkills || [],
        fuelCells: countItem(engine.inv, FUEL_CELL),
        skillName,
        now: t,
        musicUpgrade: upgrades().includes('metalmaking_music'),
        making: engine.makingNow?.() === true,
      });
    },
    runVerb(target, verbId) {
      const e = drawn.get(target?.homeMachine);
      if (!e) return false;
      const m = seen(e.m);
      if (verbId === 'use') useMachine(m);
      else if (verbId === 'collect') act('collect', m);
      // #557: refuel:<n> from Refuel's How many? (plain refuel is one).
      else if (refuelCount(verbId)) refuel(m, refuelCount(verbId));
      else if (verbId === 'machine_pickup') pickUp(m);
      else if (verbId === 'music_off') act('music', m, { on: false });
      else if (verbId === 'music_on') act('music', m, { on: true });
      else return false;
      return true;
    },
    packVerbs(classTsid) {
      if (!isHomeMachineClass(classTsid) || countItem(engine.inv, classTsid) < 1) return [];
      const at = where();
      const ok = Boolean(at) && at.kind !== 'visit' && home?.kind === at.kind;
      return [{ id: 'machine_place', label: T.placeVerb, tooltip: T.placeTip, enabled: ok, reason: ok ? '' : T.placeHome }];
    },
    placeFromPack,
    canSlide,
    move,
    /** Tests: the page's listeners off (a fresh session after _reset). */
    dispose() {
      endSlide();
      if (typeof window !== 'undefined' && window.removeEventListener) {
        window.removeEventListener('pointerdown', onSlideDown, true);
        window.removeEventListener('pointermove', onSlideHover);
      }
    },
    /** QA: where a machine is drawn (world x), or null. */
    drawnX: (id) => drawn.get(String(id || ''))?.sprite?.x ?? null,
    /** QA: a machine's feet as a client point on the game canvas, and client px per world px (k). */
    clientOf(id) {
      const e = drawn.get(String(id || ''));
      const canvas = document.querySelector?.('canvas[aria-label="Groddle game world"]');
      const r = canvas?.getBoundingClientRect?.();
      if (!e || !r?.width || !engine.entityLayer?.toGlobal) return null;
      const k = (engine.camera?.w || 960) / r.width;
      const g = engine.entityLayer.toGlobal(new engine.PIXI.Point(e.sprite.x, e.sprite.y));
      return { x: r.left + g.x / k, y: r.top + g.y / k, k: 1 / k };
    },
    get slice() { return slice; },
    /** A save loaded again (restore): its slice, and the home drawn again from it. */
    reload(next) {
      slice = next;
      lastKey = '';
    },
    get home() { return home; },
    /** QA. */
    state() {
      return {
        mode: mp ? 'mp' : 'solo',
        where: home ? { kind: home.kind, owner: home.owner, place: home.place, mayTake: home.mayTake } : null,
        machines: [...machines.values()].map((m) => ({ id: m.id, classTsid: m.classTsid, owner: m.owner, place: m.place, rx: m.rx, fuel: m.fuel, job: m.job ? { user: m.job.user, qty: m.job.qty, left: Math.max(0, Math.round((m.job.readyAt - Date.now()) / 1000)) } : null, waiting: m.waiting, art: drawn.get(m.id)?.art || '' })),
        slice: { placed: slice.placed.length, taken: slice.taken.length, jobs: Object.keys(slice.jobs).length },
        last,
      };
    },
    place: (classTsid) => placeFromPack(classTsid),
    /** QA: stand at room (or home) x and set a machine down there. */
    placeAt(classTsid, x) {
      const p = engine.player;
      if (!p || !home) return false;
      p.x = home.x0 + Number(x);
      p.vx = 0;
      return placeFromPack(classTsid);
    },
    /** QA: how many of a class the pack holds, and a tool's fuel copies. */
    pack: (classTsid) => ({ n: countItem(engine.inv, classTsid), copies: engine.toolState?.condition?.[classTsid]?.copies || null }),
    act(index, verbId) {
      const m = [...machines.values()][Number(index) || 0];
      const e = m && drawn.get(m.id);
      if (!e?.target) return false;
      const verbs = this.verbsFor(e.target) || [];
      if (!verbId) return verbs.map((v) => `${v.id}${v.enabled === false ? '!' : ''}`);
      const row = verbs.find((v) => v.id === verbId);
      if (!row || row.enabled === false) return row?.reason || 'no such verb';
      return this.runVerb(e.target, verbId);
    },
    /** QA: Make in the panel this machine opened (the panel's own start). */
    make(index, key, qty = 1) {
      const m = [...machines.values()][Number(index) || 0];
      const recipe = RECIPE_CATALOG[key];
      if (!m || !recipe) return false;
      return startJob(seen(m), { key, recipe, qty });
    },
    standNear(index = 0) {
      const m = [...machines.values()][Number(index) || 0];
      const e = m && drawn.get(m.id);
      const p = engine.player;
      if (!p || !e) return false;
      p.x = e.sprite.x + 90;
      p.vx = 0;
      return true;
    },
    refresh() {
      lastKey = '';
    },
    loadOwn: () => loadOwn(),
    /** QA: what where() reads. */
    debug() {
      const st = homesFeature._state?.();
      const at = where();
      const ctx = engine.homeContext?.() || {};
      return { me: me(), street: engine.streetTsid, home: { inHome: ctx.inHome, owned: ctx.owned }, scene: st?.scene ? { room: st.scene.room, tower: st.scene.tower ?? null, houseFloor: st.scene.houseFloor || 0, houseX: st.scene.background?.houseX ?? null } : null, at: at ? { kind: at.kind, owner: at.owner, place: at.place, key: at.key } : null, drawn: home ? { kind: home.kind, owner: home.owner, place: home.place, x0: home.x0, groundY: home.groundY, span: home.span } : null, last };
    },
  };
}

/**
 * G1290 (#669): one machine for a whole-house picture of a floor nobody stands on, from what the
 * home keeps: its sheet's frame for the state it is in (a running job plays 'active', else
 * 'assembled'), standing on the room's walk line at the house's room x, as drawOne puts it.
 */
export function homeShotMachineSprite(PIXI, m, x0 = 0, t = Date.now()) {
  const s = MACHINE_ART_SHEETS[m.classTsid];
  let sprite;
  if (s) {
    const { state, since } = roomMachineState({ job: m.job && jobRunning(m.job, t) ? m.job : null, waiting: false, collectedAt: 0 }, t);
    const r = machineFrameRect(m.classTsid, Math.max(0, machineFrame(m.classTsid, state, t - since)));
    sprite = new PIXI.Sprite(frameTexture(sourceFromUrl(s.url), new PIXI.Rectangle(r.x, r.y, r.w, r.h)));
    sprite.anchor.set(s.ax / s.fw, s.ay / s.fh);
  } else {
    sprite = new PIXI.Sprite(textureFromUrl(`assets/sprites/icons/${m.classTsid}.webp`));
    standOnFeet(sprite);
  }
  sprite.x = Math.round(x0 + (Number(m.rx) || 0));
  sprite.y = ROOM_GROUND_Y;
  sprite.zIndex = 14;
  sprite.label = 'shot-machine';
  return sprite;
}

function ensure(engine) {
  if (session) return session;
  if (typeof document === 'undefined' || !engine?.started) return null;
  const mp = engine.mode === 'multiplayer';
  const client = mp ? engine.query?.('realtimeClient') : null;
  if (mp && !client) return null;
  session = createSession(engine, client);
  globalThis.groddleHomeMachines = session;
  return session;
}

export const homeMachinesFeature = {
  id: HOME_MACHINES_ID,

  onTick(dtMs, now, engine) {
    if (!engine.started) return;
    ensure(engine)?.tick(now);
  },

  onStreetClear() {
    session?.cleared();
  },

  verbsFor(target) {
    return session ? session.verbsFor(target) : null;
  },

  runVerb(target, verbId) {
    return session ? session.runVerb(target, verbId) : false;
  },

  /** A machine in the pack: Place, on your own home street. */
  packVerbs(classTsid, engine) {
    if (!isHomeMachineClass(classTsid)) return [];
    const s = ensure(engine);
    return s ? s.packVerbs(classTsid) : [];
  },

  runPackVerb(classTsid, verbId, engine, opts = {}) {
    if (verbId !== 'machine_place' || !isHomeMachineClass(classTsid)) return false;
    ensure(engine)?.placeFromPack(classTsid, opts?.copy ?? null);
    return true;
  },

  /**
   * G1303 (#669, Austin 2026-11-25): a machine dragged from the pack in Decoration Mode is set down
   * where it is let go (`at.pointer`, from homes-feature's Decorate drop: HandOfDecorator.as
   * dropItemFromPackOnTargetPlatform 1673-1690), the 200 px still measured from you. #730 (G1333):
   * any other drop of a machine (a drag onto the street outside Decoration Mode, Drop) is set down at
   * your feet as Place is, or refused with Place's reason, never left as a loose stack: Glitch's drop
   * ran the machine's canDrop at pc.x (takeable.js 164, machine_stand.js 770-794).
   */
  packDrop(classTsid, at, engine) {
    if (!isHomeMachineClass(classTsid)) return null;
    const s = ensure(engine);
    if (!s) return null;
    const pointer = Boolean(at?.pointer) && Number.isFinite(at?.x);
    const copy = Number.isInteger(at?.copy) ? at.copy : null;
    if (!s.placeFromPack(classTsid, copy, pointer ? at.x : null)) return { ok: false, reason: 'blocked', msg: '' };
    return { ok: true, classTsid, count: 1, own: true };
  },

  /**
   * G1290 (#669): the machines a house or Tower floor keeps (`place`: house, house:1, tower:2),
   * drawn into a whole-house picture's `layer` with the room's left end at `x0`. Returns how many.
   */
  drawHomeShotMachines(place, layer, x0, engine) {
    const s = session ? session.slice : savedSlice ? normalizeSlice(savedSlice) : null;
    if (!s || !layer || !engine?.PIXI) return 0;
    let n = 0;
    for (const m of s.machines) {
      if (m.place !== place) continue;
      layer.addChild(homeShotMachineSprite(engine.PIXI, m, x0));
      n += 1;
    }
    return n;
  },

  save() {
    const s = session ? session.slice : savedSlice ? normalizeSlice(savedSlice) : null;
    if (!s) return undefined;
    const out = {};
    if (s.placed.length) out.placed = s.placed;
    if (s.taken.length) out.taken = s.taken;
    if (Object.keys(s.jobs).length) out.jobs = s.jobs;
    if (s.machines.length) out.machines = s.machines.map((m) => ({ id: m.id, classTsid: m.classTsid, place: m.place, rx: m.rx, fuel: m.fuel, music: m.music, job: m.job ? { ...m.job } : null, contents: m.contents || {} }));
    return Object.keys(out).length ? out : undefined;
  },

  restore(slice) {
    savedSlice = slice || null;
    session?.reload(normalizeSlice(savedSlice));
  },

  /** QA / tests. */
  _reset() {
    session?.dispose?.();
    session = null;
    savedSlice = null;
  },
};
