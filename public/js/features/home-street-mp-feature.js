/**
 * What else is on a real player's home street and in their house in
 * multiplayer (lane HOMES3; registers G328 and G332). The rules and copy are
 * js/home-street-mp.js; the sources are named there.
 *
 * - The signpost (locations/home.js addNeighbor, updateNeighborSignpost):
 *   on your home street, a post whose arms lead to up to five friends' home
 *   streets. Edit your signpost puts a buddy on an arm or takes one off (the
 *   site, src/HomeSignpost.php, checks they are your buddy, have a home and
 *   finished the tutorial); the fifth friend sets signpost:num_neighbors to
 *   5, the Good Neighbour badge. Anyone on the street (you, or a visitor)
 *   goes to an arm's home through the visit flow (neighbours-mp-feature).
 * - Note Poles (items/note_pole.js): recipe 303 joins the Construction Tool
 *   in multiplayer only; place one on your home street or in your house,
 *   post a note on it, customize its pole, sign and size, pick it up.
 *   Visitors read it (one click) and see who wrote it. Kept in this
 *   feature's slice of the save; the site sends visitors the poles as the
 *   stored save has them (src/HomeStreet.php).
 * - Furniture for sale (furniture_base): in your house, a placed piece has
 *   set sale price / edit sale price / don't sell (the site keeps the price,
 *   src/LedgerFurniture.php); a visitor in your house sees the price tag and
 *   buys it through the realtime server (homes_street.go furn_buy) and the
 *   site's ledger. The piece leaves your house and a Pile of Currants waits
 *   where it stood, for you alone; collect pays it out
 *   (items/pile_of_currants.js).
 * - Restorations (players/inc_jobs.js type 5): a worn-out cultivation's
 *   Restore project is shared in multiplayer by everyone at your home
 *   (projects.go kind "restore", home_projects.go): homes-feature registers
 *   yours with the server's id (homeRestoreWire), this feature hands the
 *   server the site's tokens, registers a friend's on a visit (their protos
 *   get a restore verb), and grants the Philanthropic Member of the Social
 *   Construct badge when the server says your share of someone else's was
 *   over half. home_restored brings your item back.
 *
 * Multiplayer only (engine.mode and engine.query('realtimeClient')): solo
 * never runs any of it, and the recipe is added only in multiplayer.
 *
 * QA: window.groddleHomeStreet in multiplayer; canvas data hsSignpost
 * (names on the arms), hsPoles (count:withNotes), hsTags (pieces on sale
 * here), hsPiles, hsRestores (shared restoration ids here), hsLast.
 */

import { ITEM_CATALOG, addItem, countItem, ensureItem, removeItem } from '../inventory.js?v=85d4faba';
import { RECIPE_CATALOG, isRecipeCatalogReady, setRecipeCatalog } from '../making.js?v=9e538296';
import { furnitureDef, furnitureScale, furnitureSize } from '../home-decor.js?v=cbf17565';
import { pieceLabel } from '../furniture-upgrades.js?v=c4ee77ed';
import { cultivationDef, homeStreetLayout } from '../home-cultivation.js?v=9d3a8ec3';
import { PROTO_DEPLETED_ART } from '../home-proto-art.js?v=68506420';
import { NOTE_POLE_CONTAINERS, NOTE_POLE_PARTS, NOTE_POLE_SIGN_Y } from '../note-pole-art.js?v=860d393a';
import { textureFromUrl } from '../textures.js?v=01a295a1';
import { signArmWidth } from '../street-render.js?v=6defedeb';
import { openNotePicker, openNoteView } from '../note-view.js?v=21c55475';
import { homeStreetName, possessive, readVisitScene } from '../neighbours-mp.js?v=31a75688';
import { BACK_YARD_GROUND_Y, STREET_GROUND_Y, homesFeature, visitorHomeState } from './homes-feature.js?v=d77d9eb8';
import { projectApi } from './street-jobs-feature.js?v=372b2ea1';
import { saveStore } from '../save-store.js?v=b74a8113';
import { giveCarriedNote, takeCarriedNote, writtenCarriedNotes } from './street-furniture-feature.js?v=4aafc245';
import {
  GOOD_NEIGHBOUR_AT,
  GOOD_NEIGHBOUR_COUNTER,
  HOME_STREET_MP_ID,
  HOME_STREET_TEXT as T,
  NOTE_POLE_CLASS,
  NOTE_POLE_ITEM,
  NOTE_POLE_RECIPE,
  PHILANTHROPIC_BADGE,
  POLES_MAX,
  POLE_SIGNS,
  POLE_SIZES,
  POLE_STYLES,
  canSellClass,
  normalizeHomeStreetSlice,
  normalizeListings,
  normalizePiles,
  normalizePole,
  normalizeRestores,
  noteSold,
  parsePrice,
  philanthropicReward,
  poleConfig,
  poleLayout,
  poleVerbs,
  readWireId,
  restoreWireId,
  saleVerbs,
  signpostArms,
  signpostCandidates,
} from '../home-street-mp.js?v=0fc12d80';

export { HOME_STREET_MP_ID };

const CLASS_SIGNPOST = 'mp_home_signpost';
const CLASS_POLE = 'mp_note_pole';
const CLASS_SALE = 'mp_furn_sale';
const CLASS_PILE = 'mp_currant_pile';
const CLASS_PROTO = 'mp_restore_proto';
const FLOOR_Y = 620;
const SIGN_ART = { post: 'assets/ui/signpost/signpost_post.png', arm: 'assets/ui/signpost/signpost_arm.png', shadow: 'assets/ui/signpost/signpost_shadow.png' };
const PILE_ART = 'assets/sprites/street-jobs/pile_of_currants.png';
const POLE_ART_DIR = 'assets/sprites/note-pole/';
const TOKENS_FRESH_MS = 10 * 60 * 1000;
const BIG_SPENDERS = [[1009, 'big_spender'], [2003, 'el_big_spenderino'], [5003, 'moneybags_magoo']];

const STYLE = `
.hs-shade { position: fixed; inset: 0; z-index: calc(var(--z-screen) + 2); display: grid; place-items: center; padding: var(--sp-8); background: color-mix(in srgb, var(--c-sage-23) 45%, transparent); }
.hs-shade[hidden] { display: none; }
.hs-panel { width: min(26rem, 100%); max-height: calc(100vh - 2rem); overflow: auto; border-radius: var(--radius-2xl); padding: var(--sp-8) var(--sp-9) var(--sp-9);
  background: var(--surface-card); color: var(--c-sand-28); box-shadow: var(--shadow-3); font: var(--fs-base)/var(--lh-loose) var(--font-system); }
.hs-panel h2 { margin: 0 0 var(--sp-5); font-size: var(--fs-xl); }
.hs-panel p { margin: var(--sp-3) 0; }
.hs-panel .hs-close { float: right; border: 0; padding: 0.2rem 0.55rem; color: var(--c-sand-28); background: transparent; font-size: var(--fs-2xl); line-height: var(--lh-none); cursor: pointer; }
.hs-panel ul { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--sp-3); }
.hs-panel li { display: flex; flex-wrap: wrap; align-items: center; gap: 0.3rem var(--sp-5); padding: 0.45rem var(--sp-5); border-radius: var(--radius-md); background: var(--surface-parchment); }
.hs-panel li .hs-what { flex: 1 1 10rem; }
.hs-panel li .hs-what.is-empty { opacity: 0.7; font-style: italic; }
.hs-panel button.hs-act { font: inherit; font-weight: 700; border: 0; border-radius: var(--radius-md); padding: 0.3rem var(--sp-5); cursor: pointer; color: var(--text-moss); background: var(--surface-moss); box-shadow: inset 0 0 0 2px var(--c-lime-85); }
.hs-panel button.hs-act:disabled { opacity: 0.55; cursor: default; }
.hs-panel .hs-actions { display: flex; flex-wrap: wrap; gap: var(--sp-4); justify-content: flex-end; margin-top: 0.7rem; }
.hs-panel .hs-note { min-height: 1.4em; margin-top: var(--sp-5); font-weight: 600; color: var(--text-danger); }
.hs-panel label { display: grid; gap: 0.2rem; margin: var(--sp-3) 0; font-weight: 600; }
.hs-panel input, .hs-panel select { font: inherit; padding: 0.3rem 0.45rem; border-radius: var(--radius-md); border: 2px solid var(--c-sand-86); background: var(--surface-bright); color: var(--c-sand-28); }
.hs-panel .hs-price { display: flex; align-items: center; gap: var(--sp-3); }
.hs-panel .hs-price input { width: 8rem; }
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

/** The site's routes for this feature (the cookie with its REST nonce, refreshed once when stale). */
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
  async function call(path, { method = 'GET', body } = {}) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const headers = {};
      if (nonce) headers['X-WP-Nonce'] = nonce;
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      let res;
      try {
        res = await fetch(api + path, { method, credentials: 'same-origin', cache: 'no-store', headers, body: body === undefined ? undefined : JSON.stringify(body) });
      } catch {
        throw Object.assign(new Error(T.offline), { status: 0 });
      }
      const fresh = res.headers?.get?.('X-WP-Nonce');
      if (fresh) nonce = fresh;
      let data = null;
      try { data = await res.json(); } catch { /* not JSON */ }
      if (res.status === 403 && data?.code === 'rest_cookie_invalid_nonce' && attempt === 0 && (await refresh())) continue;
      if (!res.ok) throw Object.assign(new Error(typeof data?.message === 'string' ? data.message : T.failed), { status: res.status, code: data?.code || '' });
      return data;
    }
    throw new Error(T.failed);
  }
  return {
    street: (owner) => call(`homes/${Number(owner)}/street`),
    signpost: () => call('homes/signpost'),
    addNeighbor: (position, id) => call('homes/signpost', { method: 'PUT', body: { position, id } }),
    removeNeighbor: (position) => call(`homes/signpost/${Number(position)}`, { method: 'DELETE' }),
    sales: () => call('homes/sales'),
    price: (uid, price) => call('homes/sales', { method: 'PUT', body: { uid, price } }),
    dontSell: (uid) => call(`homes/sales/${Number(uid)}`, { method: 'DELETE' }),
    collect: (op) => call(`homes/sales/${op}/collect`, { method: 'POST' }),
  };
}

let session = null;
let savedSlice = null;
let recipeAdded = false;

/** Writes the save now and waits for it to land (street-jobs-feature persist): the site reads the stored save. */
async function flush(engine) {
  engine.save?.();
  if (typeof saveStore?.flush !== 'function') return true;
  for (let i = 0; i < 6; i += 1) {
    try {
      await saveStore.flush();
    } catch {
      return false;
    }
    if (saveStore.state === 'saved') return true;
    if (['conflict', 'signed-out', 'error', 'offline'].includes(saveStore.state)) return false;
  }
  return saveStore.state === 'saved';
}

function createSession(engine, client) {
  const boot = globalThis.GRODDLE_MP_BOOT || {};
  const site = createSite();
  const slice = normalizeHomeStreetSlice(savedSlice);
  /** My own home: the post's arms, my pieces on sale, my piles, the restorations I sent tokens for. */
  const own = { neighbors: null, listed: new Map(), piles: [], tokens: new Map(), loading: false, loadedAt: 0 };
  /** The home I visit now: { owner, name, room, key, view, data, listed, pieces, roomX, houseX }. */
  let visit = null;
  /** What this feature drew in the scene now (the engine clears sprites and targets with the scene). */
  let drawn = { where: '', signpost: null, poles: new Map(), sales: new Map(), piles: new Map(), protos: new Map() };
  /** The homes-feature scene my own home's things were drawn in (a new one means draw again). */
  let drawnScene = null;
  let last = '';
  let busy = false;
  let lastSceneKey = '';
  let tickAt = 0;

  const me = () => Number(client.me?.id) || Number(boot.player?.id) || 0;
  const myName = () => String(client.me?.name || boot.player?.name || engine.pc?.name || 'You');

  function publish() {
    engine.setData?.('hsSignpost', (where() === 'visit' ? visit?.data?.signpost || [] : own.neighbors || []).map((n) => n.name).join(','));
    const poles = currentPoles();
    engine.setData?.('hsPoles', `${poles.length}:${poles.filter((p) => p.note).length}`);
    engine.setData?.('hsTags', [...drawn.sales.values()].filter((s) => s.listing).map((s) => `${s.uid}=${s.listing.price}`).join(','));
    engine.setData?.('hsPiles', [...drawn.piles.values()].map((p) => `${p.pile.op}:${p.pile.price}`).join(','));
    engine.setData?.('hsRestores', [...drawn.protos.values()].map((p) => p.wire).join(','));
    engine.setData?.('hsLast', last);
  }

  function notice(text, ms = 3600) {
    if (!text) return;
    last = text;
    engine.toast?.(text, ms);
    engine.pushActivity?.(text);
    publish();
  }

  // —— Where am I ——

  /** 'visit' (someone's home), 'street' / 'house' (my own home street, my house's ground floor), or ''. */
  function where() {
    if (visit && readVisitScene(engine.streetTsid)?.owner === visit.owner) return 'visit';
    const home = engine.homeContext?.() || {};
    if (!home.inHome) return '';
    const st = homesFeature._state?.();
    const scene = st?.scene;
    if (!scene) return '';
    if (scene.room === 'street') return 'street';
    if (scene.room === 'interior' && scene.tower == null && !scene.houseFloor) return 'house';
    return '';
  }

  function ownGeometry() {
    const st = homesFeature._state?.();
    return {
      street: { houseX: homeStreetLayout(st?.cult).houseX, groundY: STREET_GROUND_Y },
      house: { roomX: st?.scene?.background?.houseX || 0, floorY: FLOOR_Y, yardHouseX: homeStreetLayout(st?.backCult).houseX },
    };
  }

  function currentPoles() {
    const w = where();
    if (w === 'street' || w === 'house') return slice.poles.filter((p) => p.room === w);
    if (w === 'visit') return (visit?.data?.poles || []).map(normalizePole).filter((p) => p && p.room === (visit.room === 'interior' ? 'house' : 'street'));
    return [];
  }

  // —— Drawing ——

  /** Takes away everything drawn (a scene that went already took its sprites: unregistering again is harmless). */
  function clearDrawn() {
    drop(drawn.signpost);
    for (const m of [drawn.poles, drawn.sales, drawn.piles, drawn.protos]) for (const e of m.values()) drop(e);
    drawn = { where: '', signpost: null, poles: new Map(), sales: new Map(), piles: new Map(), protos: new Map() };
  }

  function addTarget(spec) {
    return engine.register({ featureId: HOME_STREET_MP_ID, ...spec });
  }

  function hitBox(PIXI, x, y, w, h) {
    const g = new PIXI.Graphics();
    g.rect(x, y, w, h).fill({ color: 0xffffff, alpha: 0.001 });
    return g;
  }

  function drop(entry) {
    if (!entry) return;
    if (entry.target) engine.unregister?.(entry.target);
    else if (entry.box && !entry.box.destroyed) entry.box.destroy({ children: true });
    if (entry.tag && !entry.tag.destroyed) entry.tag.destroy({ children: true });
  }

  /** SignpostView-style post (street-render's art): arms with the neighbours' names, alternating. */
  function drawSignpost(x, groundY, neighbors, { owner }) {
    const { PIXI } = engine;
    if (!PIXI || !engine.entityLayer) return;
    drop(drawn.signpost);
    const arms = (neighbors || []).slice(0, 5);
    const box = new PIXI.Container();
    box.x = Math.round(x);
    box.y = groundY + 2;
    // Over the World Gate's board beside it, so every name reads.
    box.zIndex = 21;
    const holder = new PIXI.Container();
    holder.scale.set(0.8);
    box.addChild(holder);
    const shadow = new PIXI.Sprite(textureFromUrl(SIGN_ART.shadow));
    shadow.anchor.set(0.5, 1);
    shadow.y = 6;
    shadow.alpha = 0.75;
    holder.addChild(shadow);
    const post = new PIXI.Sprite(textureFromUrl(SIGN_ART.post));
    post.anchor.set(0.5, 1);
    holder.addChild(post);
    const postH = 200;
    arms.forEach((n, i) => {
      const left = Boolean(i % 2);
      const arm = new PIXI.Container();
      arm.y = -postH + i * 28 + 32;
      arm.x = left ? -2 : 2;
      arm.rotation = ((left ? 5.5 : -5.5) * Math.PI) / 180;
      const w = signArmWidth(PIXI, n.name);
      const board = new PIXI.Sprite(textureFromUrl(SIGN_ART.arm));
      board.anchor.set(0, 0.5);
      board.width = w;
      board.height = 30;
      if (left) board.scale.x *= -1;
      const label = new PIXI.Text({ text: n.name, style: { fontFamily: 'Trebuchet MS, Georgia, serif', fontSize: 14, fontWeight: '700', fill: 0x2a1a08, padding: 3 } });
      label.resolution = 3;
      label.anchor.set(0.5);
      label.x = left ? -w / 2 : w / 2;
      label.y = -1;
      arm.addChild(board, label);
      holder.addChild(arm);
    });
    box.addChild(hitBox(PIXI, -70, -170, 140, 172));
    box._worldHitW = 140;
    box._worldHitH = 172;
    engine.entityLayer.addChild(box);
    const label = owner ? T.signpost : T.signpost;
    const subtitle = arms.length ? arms.map((n) => n.name).join(', ') : T.noArms;
    drawn.signpost = { target: addTarget({ classId: CLASS_SIGNPOST, label, subtitle, sprite: box, state: { owner } }), neighbors: arms, owner };
  }

  /** note_pole.as: the pole, the sign and (posted) the note, from the pole's base. */
  function poleSprite(pole) {
    const { PIXI } = engine;
    const box = new PIXI.Container();
    for (const p of poleLayout(pole.cfg, Boolean(pole.note), { parts: NOTE_POLE_PARTS, containers: NOTE_POLE_CONTAINERS, signY: NOTE_POLE_SIGN_Y })) {
      const spr = new PIXI.Sprite(textureFromUrl(POLE_ART_DIR + p.file));
      spr.x = p.x;
      spr.y = p.y;
      spr.width = p.w;
      spr.height = p.h;
      box.addChild(spr);
    }
    box.addChild(hitBox(PIXI, -26, -185, 52, 187));
    box._worldHitW = 52;
    box._worldHitH = 187;
    return box;
  }

  function drawPoles() {
    for (const e of drawn.poles.values()) drop(e);
    drawn.poles = new Map();
    const w = where();
    if (!w || !engine.PIXI) return;
    const geo = ownGeometry();
    for (const pole of currentPoles()) {
      let x;
      let y;
      if (w === 'visit') {
        x = (visit.room === 'interior' ? visit.roomX : visit.houseX) + pole.rx;
        y = visit.room === 'interior' ? FLOOR_Y : STREET_GROUND_Y;
      } else if (w === 'street') {
        x = geo.street.houseX + pole.rx;
        y = geo.street.groundY;
      } else {
        x = geo.house.roomX + pole.rx;
        y = geo.house.floorY;
      }
      const box = poleSprite(pole);
      box.x = Math.round(x);
      box.y = y + 2;
      box.zIndex = 17;
      engine.entityLayer.addChild(box);
      const owner = w !== 'visit';
      const title = pole.note?.title || '';
      const target = addTarget({ classId: CLASS_POLE, label: title || T.pole, subtitle: pole.note ? (owner ? 'Your Note Pole' : `${possessive(visit.name)} Note Pole`) : T.nothingPosted, sprite: box, state: { pole: pole.id, owner } });
      drawn.poles.set(pole.id, { target, pole });
    }
  }

  /** furn_price_tag (furniture_base getExtraConfig): the price over a piece on sale. */
  function priceTag(price) {
    const { PIXI } = engine;
    const tag = new PIXI.Container();
    const text = new PIXI.Text({ text: `${Math.max(0, Math.floor(price)).toLocaleString('en-US')}c`, style: { fontFamily: 'Trebuchet MS, sans-serif', fontSize: 13, fontWeight: '700', fill: 0x3a2a12, padding: 2 } });
    text.resolution = 3;
    text.anchor.set(0.5);
    const w = Math.ceil(text.width) + 14;
    const bg = new PIXI.Graphics();
    bg.roundRect(-w / 2, -11, w, 22, 6).fill({ color: 0xfff2b8 }).stroke({ width: 2, color: 0x9a7a2a });
    bg.circle(-w / 2 + 6, 0, 2.2).fill({ color: 0x9a7a2a });
    tag.addChild(bg, text);
    tag.zIndex = 40;
    return tag;
  }

  /** A piece's hit box and tag; rows are { uid, classTsid, x, y } in world x. */
  function drawSales(rows, listed, { owner }) {
    for (const e of drawn.sales.values()) drop(e);
    drawn.sales = new Map();
    const { PIXI } = engine;
    if (!PIXI) return;
    for (const row of rows) {
      const def = furnitureDef(row.classTsid);
      const listing = listed.get(row.uid) || null;
      if (!def || (!owner && !listing) || (owner && !canSellClass(row.classTsid))) continue;
      // G358: an upgraded piece's own size and name.
      const { w, h } = furnitureSize(row.classTsid, row.upgradeId);
      const ceiling = def.slot === 'ceiling';
      const box = new PIXI.Container();
      box.x = Math.round(row.x);
      box.y = Math.round(row.y);
      box.zIndex = 13;
      box.addChild(hitBox(PIXI, -w / 2, ceiling ? 0 : -h, w, h));
      box._worldHitW = w;
      box._worldHitH = h;
      engine.entityLayer.addChild(box);
      let tag = null;
      if (listing) {
        tag = priceTag(listing.price);
        tag.x = box.x;
        tag.y = ceiling ? box.y + h + 14 : box.y - h - 12;
        engine.entityLayer.addChild(tag);
      }
      const label = pieceLabel(row, def.label) || ITEM_CATALOG[row.classTsid]?.label || row.classTsid;
      const subtitle = listing ? T.buyTip(listing.price) : 'Yours';
      const target = addTarget({ classId: CLASS_SALE, label, subtitle, sprite: box, state: { uid: row.uid, owner } });
      drawn.sales.set(row.uid, { target, tag, uid: row.uid, classTsid: row.classTsid, label, listing, x: row.x });
    }
  }

  function drawPiles() {
    for (const e of drawn.piles.values()) drop(e);
    drawn.piles = new Map();
    if (where() !== 'house' || !engine.PIXI) return;
    const geo = ownGeometry();
    for (const pile of own.piles) {
      const { PIXI } = engine;
      const box = new PIXI.Container();
      const spr = new PIXI.Sprite(textureFromUrl(PILE_ART));
      spr.anchor.set(0.5, 1);
      spr.width = 34;
      spr.height = 40;
      box.addChild(spr, hitBox(PIXI, -20, -42, 40, 44));
      box._worldHitW = 40;
      box._worldHitH = 44;
      box.x = Math.round(geo.house.roomX + pile.x);
      box.y = FLOOR_Y + 2;
      box.zIndex = 16;
      engine.entityLayer.addChild(box);
      const source = T.pileSource(pile.buyer.name, labelOf(pile.class));
      const target = addTarget({ classId: CLASS_PILE, label: T.pile, subtitle: T.pileBump(pile.price, source), sprite: box, state: { op: pile.op } });
      drawn.piles.set(pile.op, { target, pile, source, bumped: false });
    }
  }

  function labelOf(cls) {
    return furnitureDef(cls)?.label || ITEM_CATALOG[cls]?.label || String(cls || '').replace(/_/g, ' ');
  }

  /** My own home: what this scene shows of it. */
  function drawOwn() {
    const w = where();
    clearDrawn();
    drawn.where = w;
    if (!w) return;
    if (w === 'street') {
      const st = homesFeature._state?.();
      const layout = homeStreetLayout(st?.cult);
      if (own.neighbors) drawSignpost(signpostX(layout), STREET_GROUND_Y, own.neighbors, { owner: true });
    }
    drawPoles();
    if (w === 'house') {
      drawOwnSales();
      drawPiles();
    }
    publish();
  }

  function signpostX(layout) {
    // locations/home.js:212-218 puts the post at x -328, where the remake's World Gate stands: ours is just left of the gate.
    return layout.lotLeft - 70;
  }

  function drawOwnSales() {
    const st = homesFeature._state?.();
    const decor = st?.houseDecor;
    if (!decor) return;
    const geo = ownGeometry();
    drawSales(decor.placed.map((p) => ({ uid: p.id, classTsid: p.classTsid, upgradeId: p.upgradeId, x: geo.house.roomX + p.x, y: p.y })), own.listed, { owner: true });
  }

  // —— My own home: the site's word ——

  async function loadOwn({ force = false } = {}) {
    if (own.loading || (!force && Date.now() - own.loadedAt < 4000)) return;
    own.loading = true;
    try {
      const [street, sales] = await Promise.all([site.street(me()), site.sales()]);
      own.neighbors = signpostArms(street?.signpost).filter(Boolean);
      own.listed = normalizeListings(sales?.listed);
      own.piles = normalizePiles(sales?.piles);
      own.loadedAt = Date.now();
      sendTokens(normalizeRestores(street?.restores));
      applySales();
      // locations/home.js:35-37: coming home to a post with five friends on it.
      if (own.neighbors.length >= GOOD_NEIGHBOUR_AT) goodNeighbour();
    } catch (err) {
      console.warn('[home-street]', err?.message || err);
    } finally {
      own.loading = false;
    }
    if (where() === 'street' || where() === 'house') drawOwn();
  }

  function goodNeighbour() {
    if (slice.five) return;
    slice.five = true;
    // home.js achievements_set('signpost', 'num_neighbors', 5).
    engine.resetAchievementCounter?.(GOOD_NEIGHBOUR_COUNTER);
    engine.achievement?.(GOOD_NEIGHBOUR_COUNTER, GOOD_NEIGHBOUR_AT);
    engine.save?.();
  }

  /** The realtime server's restorations at my home (or a visited one): each token once while it is fresh. */
  function sendTokens(restores) {
    if (client.state !== 'online') return;
    const now = Date.now();
    let sent = 0;
    for (const r of restores) {
      const at = own.tokens.get(r.job);
      if (at && now - at < TOKENS_FRESH_MS) continue;
      own.tokens.set(r.job, now);
      client.send('project_home', { token: r.token });
      sent += 1;
    }
    if (sent) setTimeout(() => globalThis.groddleProjects?.sync?.(), 400);
  }

  /** furn_sold, or a sale I missed: the piece leaves my house (once: the trade slice remembers op-o). */
  function applySales() {
    const st = homesFeature._state?.();
    const decor = st?.houseDecor;
    if (!decor) return;
    let changed = false;
    for (const pile of own.piles) {
      if (slice.sold.includes(pile.op)) continue;
      const receipt = engine.query?.('ledgerReceipt', `${pile.op}-o`, engine);
      noteSold(slice, pile.op);
      changed = true;
      // false: a load applied it already (the site's catch-up took the piece out).
      if (receipt === false || receipt == null) continue;
      const i = decor.placed.findIndex((p) => p.id === pile.uid && p.classTsid === pile.class);
      if (i >= 0) {
        decor.placed.splice(i, 1);
        for (const p of decor.placed) if (p.on === pile.uid) p.on = null;
      } else if (decor.storage[pile.class] > 0) {
        decor.storage[pile.class] -= 1;
        if (decor.storage[pile.class] <= 0) delete decor.storage[pile.class];
      } else if (countItem(engine.inv, pile.class) > 0) {
        removeItem(engine.inv, pile.class, 1);
      }
      own.listed.delete(pile.uid);
      changed = true;
    }
    if (changed) {
      engine.save?.();
      if (where() === 'house') engine.refreshHomeScene?.();
    }
  }

  // —— Visiting ——

  async function onVisit(info) {
    visit = { owner: info.owner, name: info.name, room: info.room, key: info.key === true, view: info.view, data: null, listed: new Map(),
      pieces: info.spots?.pieces || [], roomX: Number(info.spots?.roomX) || 0, houseX: 0 };
    const v = visitorHomeState(info.view);
    visit.houseX = homeStreetLayout(v.cult).houseX;
    visit.yardHouseX = homeStreetLayout(v.backCult).houseX;
    visit.state = v;
    clearDrawn();
    drawn.where = 'visit';
    const owner = visit.owner;
    let data;
    try {
      data = await site.street(owner);
    } catch (err) {
      console.warn('[home-street]', err?.message || err);
      return;
    }
    if (!visit || visit.owner !== owner || where() !== 'visit') return;
    visit.data = data;
    visit.listed = normalizeListings(data?.sales);
    drawVisit();
  }

  function drawVisit() {
    if (!visit?.data || where() !== 'visit') return;
    for (const e of drawn.protos.values()) drop(e);
    drawn.protos = new Map();
    if (visit.room === 'street') {
      const layout = homeStreetLayout(visit.state.cult);
      drawSignpost(signpostX(layout), STREET_GROUND_Y, signpostArms(visit.data.signpost).filter(Boolean), { owner: false });
    }
    drawPoles();
    if (visit.room === 'interior') {
      drawSales(visit.pieces.map(({ item, box }) => ({ uid: Number(item.id), classTsid: item.classTsid, upgradeId: item.upgradeId, x: visit.roomX + Number(item.x), y: Number(item.y), box })), visit.listed, { owner: false });
    }
    drawVisitProtos();
    publish();
  }

  /** A friend's worn-out cultivations here: their shared Restore project (quest.js type 5). */
  function drawVisitProtos() {
    const restores = normalizeRestores(visit.data?.restores).filter((r) => (visit.room === 'interior' ? r.yard === 'back' : r.yard === 'street'));
    if (!restores.length || !engine.PIXI) return;
    const { PIXI } = engine;
    const st = visit.room === 'interior' ? visit.state.backCult : visit.state.cult;
    const houseX = visit.room === 'interior' ? visit.yardHouseX : visit.houseX;
    const groundY = visit.room === 'interior' ? BACK_YARD_GROUND_Y : STREET_GROUND_Y;
    for (const r of restores) {
      const item = (st.items || []).find((row) => Number(row.id) === r.item && row.depleted);
      if (!item) continue;
      if (!registerVisitRestore(r)) continue;
      const art = PROTO_DEPLETED_ART[r.proto];
      const [, ox, oy, w, h] = art || ['', 40, 60, 80, 60];
      const box = new PIXI.Container();
      box.x = Math.round(houseX + item.rx);
      box.y = groundY + 6;
      box.zIndex = 15;
      box.addChild(hitBox(PIXI, -ox, -oy, w, h));
      box._worldHitW = w;
      box._worldHitH = h;
      engine.entityLayer.addChild(box);
      const label = cultivationDef(r.proto)?.label || 'Worn out';
      const target = addTarget({ classId: CLASS_PROTO, label, subtitle: T.wornOut, sprite: box, state: { wire: r.job } });
      drawn.protos.set(r.job, { target, wire: r.job });
    }
    sendTokens(restores);
  }

  /** projectApi: the friend's restoration under the server's id, so the board's shared path runs it. */
  function registerVisitRestore(r) {
    if (projectApi.registered(r.job)) return true;
    const cat = projectApi.catalog?.();
    const rest = cat?.restorations?.[r.proto];
    if (!rest) return false;
    const first = cat.classes[rest.phases[0].classTsid];
    const name = visit.name;
    const job = {
      kind: 'restore',
      title: first?.title || rest.label,
      label: cultivationDef(r.proto)?.label || rest.label,
      desc: first?.desc || '',
      phases: rest.phases,
      divisor: 1,
      rewardMultiplier: r.mult,
      wire: r.job,
    };
    return projectApi.register(r.job, job, {
      kicker: T.restoreKicker(name, r.yard),
      place: T.restorePlace(name, r.yard),
      iconUrl: `assets/sprites/cultivation/proto/${PROTO_DEPLETED_ART[r.proto]?.[0] || `${r.proto}.webp`}`,
      target: () => drawn.protos.get(r.job)?.target || null,
    });
  }

  // —— Verbs ——

  function verbsFor(target) {
    const w = where();
    if (target.classId === CLASS_SIGNPOST) {
      const arms = drawn.signpost?.neighbors || [];
      const out = arms.map((n) => ({ id: `sign_go_${n.position}`, label: T.goVerb(n.name), tooltip: homeStreetName(n.name), enabled: n.id !== visit?.owner, reason: '' }));
      if (w === 'street') out.push({ id: 'sign_edit', label: T.editVerb, tooltip: T.editTip, enabled: true, reason: '' });
      return out;
    }
    if (target.classId === CLASS_POLE) {
      const e = [...drawn.poles.values()].find((p) => p.target === target);
      if (!e) return [];
      return poleVerbs({ owner: w !== 'visit', hasNote: Boolean(e.pole.note), notes: w !== 'visit' ? writtenCarriedNotes(engine).length : 0 });
    }
    if (target.classId === CLASS_SALE) {
      const e = drawn.sales.get(target.state?.uid);
      if (!e) return [];
      return saleVerbs({ owner: w === 'house', listing: e.listing });
    }
    if (target.classId === CLASS_PILE) return [{ id: 'pile_collect', label: T.collectVerb, tooltip: T.collectTip, enabled: true, reason: '', primary: true }];
    if (target.classId === CLASS_PROTO) return [{ id: 'restore', label: T.restoreVerb, tooltip: T.restoreTip, enabled: true, reason: '', primary: true }];
    return [];
  }

  function runVerb(target, verbId) {
    if (verbId.startsWith('sign_go_')) {
      const n = (drawn.signpost?.neighbors || []).find((a) => `sign_go_${a.position}` === verbId);
      if (n) engine.query?.('visitHome', n.id, n.name, engine);
      return true;
    }
    if (verbId === 'sign_edit') return openSignpost(), true;
    if (target.classId === CLASS_POLE) return runPole(target, verbId), true;
    if (target.classId === CLASS_SALE) return runSale(target, verbId), true;
    if (target.classId === CLASS_PILE) return collectPile(target.state?.op), true;
    if (target.classId === CLASS_PROTO) return projectApi.open(engine, target.state?.wire), true;
    return false;
  }

  // —— The signpost dialog (SignpostDialog.as) ——
  const style = el('style', { id: 'hs-css' });
  style.textContent = STYLE;
  document.head.append(style);
  const shade = el('div', { class: 'hs-shade', hidden: true, 'data-hs-shade': '' });
  const panel = el('div', { class: 'hs-panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'hs-title', 'data-hs-panel': '' });
  shade.append(panel);
  document.body.append(shade);
  shade.addEventListener('pointerdown', (e) => { if (e.target === shade) closePanel(); });
  shade.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') closePanel();
  });
  let panelKind = '';

  function closePanel() {
    shade.hidden = true;
    panelKind = '';
    engine.setData?.('hsPanel', '');
  }

  function openPanel(kind, title, build) {
    panel.replaceChildren();
    const x = el('button', { type: 'button', class: 'hs-close', 'aria-label': 'Close' }, '×');
    x.addEventListener('click', closePanel);
    panel.append(x, el('h2', { id: 'hs-title' }, title));
    build(panel);
    panelKind = kind;
    shade.hidden = false;
    engine.setData?.('hsPanel', kind);
    panel.querySelector('input, select, button.hs-act')?.focus();
  }

  function panelNote(text) {
    let n = panel.querySelector('.hs-note');
    if (!n) {
      n = el('p', { class: 'hs-note', role: 'status' });
      panel.append(n);
    }
    n.textContent = text || '';
  }

  function openSignpost(choosingFor = null) {
    if (where() !== 'street') return notice(T.notAtHome, 2600);
    const arms = signpostArms(own.neighbors || []);
    openPanel('signpost', T.editTitle, (p) => {
      if (choosingFor != null) {
        p.append(el('p', {}, T.chooseFriend));
        const friends = signpostCandidates(globalThis.groddleBuddies?.list?.buddies || [], own.neighbors || []);
        if (!friends.length) p.append(el('p', {}, T.noFriends));
        const ul = el('ul', { 'data-hs-friends': '' });
        for (const f of friends) {
          const li = el('li');
          li.append(el('span', { class: 'hs-what' }, f.name));
          const b = el('button', { type: 'button', class: 'hs-act', 'data-hs-pick': String(f.id) }, 'Add');
          b.addEventListener('click', () => addNeighbor(choosingFor, f));
          li.append(b);
          ul.append(li);
        }
        p.append(ul);
        const actions = el('div', { class: 'hs-actions' });
        const back = el('button', { type: 'button', class: 'hs-act' }, 'Back');
        back.addEventListener('click', () => openSignpost());
        actions.append(back);
        p.append(actions);
        return;
      }
      const ul = el('ul', { 'data-hs-arms': '' });
      arms.forEach((n, i) => {
        const li = el('li', { 'data-hs-arm': String(i) });
        li.append(el('span', { class: `hs-what${n ? '' : ' is-empty'}` }, n ? n.name : T.emptyArm));
        const b = el('button', { type: 'button', class: 'hs-act', [`data-hs-${n ? 'remove' : 'add'}`]: String(i) }, n ? T.remove : 'Add');
        b.disabled = busy;
        b.addEventListener('click', () => (n ? confirmRemove(n) : openSignpost(i)));
        li.append(b);
        ul.append(li);
      });
      p.append(ul);
      const actions = el('div', { class: 'hs-actions' });
      const done = el('button', { type: 'button', class: 'hs-act' }, T.done);
      done.addEventListener('click', closePanel);
      actions.append(done);
      p.append(actions);
    });
  }

  async function signpostChange(run, ok) {
    if (busy) return;
    busy = true;
    try {
      const answer = await run();
      own.neighbors = signpostArms(answer?.neighbors).filter(Boolean);
      ok?.(answer);
      if (answer?.five === true || own.neighbors.length >= GOOD_NEIGHBOUR_AT) goodNeighbour();
      client.send('home_refresh', { what: 'signpost' });
      openSignpost();
    } catch (err) {
      panelNote(err?.message || T.couldNotAdd);
      notice(err?.message || T.couldNotAdd, 3000);
    } finally {
      busy = false;
      if (where() === 'street') drawOwn();
    }
  }

  function addNeighbor(position, friend) {
    return signpostChange(() => site.addNeighbor(position, friend.id), () => engine.pushActivity?.(`You put ${homeStreetName(friend.name)} on your signpost.`));
  }

  function confirmRemove(n) {
    const yes = () => signpostChange(() => site.removeNeighbor(n.position), () => engine.pushActivity?.(`You took ${homeStreetName(n.name)} off your signpost.`));
    if (!engine.prompt) return yes();
    closePanel();
    engine.prompt({ modal: true, text: T.removeConfirm(n.name), choices: [{ label: T.yes, value: true }, { label: T.no, value: false }], onChoice: (v) => (v === true ? yes() : openSignpost()) });
    return true;
  }

  // —— Note Poles ——

  function poleOf(target) {
    return [...drawn.poles.values()].find((p) => p.target === target)?.pole || null;
  }

  function myPole(id) {
    return slice.poles.find((p) => p.id === id) || null;
  }

  function runPole(target, verbId) {
    const pole = poleOf(target);
    if (!pole) return;
    if (verbId === 'pole_read') return readPole(pole, where() !== 'visit');
    if (where() === 'visit') return;
    const mine = myPole(pole.id);
    if (!mine) return;
    if (verbId === 'pole_post') return postOnPole(mine);
    if (verbId === 'pole_customize') return customizePole(mine);
    if (verbId === 'pole_pickup') return pickUpPole(mine);
  }

  /** note_pole.js readHelper: the note_view, read-only for anyone but the owner. */
  function readPole(pole, owner) {
    if (!pole.note) return notice(T.nothingPosted, 2400);
    const when = pole.note.at ? new Date(pole.note.at).toLocaleDateString() : '';
    const by = pole.note.by?.name ? `${pole.note.by.name}${when ? ` · ${when}` : ''}` : when;
    openNoteView({ kicker: T.pole, title: pole.note.title || T.aNote, body: pole.note.body, byline: by, reason: owner ? '' : T.notYours, editable: false });
    engine.setData?.('hsRead', pole.note.title || T.aNote);
    if (!owner) engine.pushActivity?.(`You read ${possessive(visit?.name || 'their')} Note Pole.`);
  }

  function authorOf(note) {
    if (note.author === 'player') return { id: me(), name: myName() };
    const m = /^player:(\d+)$/.exec(String(note.author || ''));
    const id = m ? Number(m[1]) : 0;
    const buddy = (globalThis.groddleBuddies?.list?.buddies || []).find((b) => Number(b.id) === id);
    return { id, name: buddy?.name ? String(buddy.name).slice(0, 40) : '' };
  }

  /** note_pole.js post 117-171: the note leaves the pack; one already there comes back. */
  function postOnPole(pole) {
    const notes = writtenCarriedNotes(engine);
    if (!notes.length) return notice(T.noNotes, 2400);
    const post = (id) => {
      const note = notes.find((n) => n.id === id);
      if (!note || !takeCarriedNote(engine, id)) return;
      if (pole.note) {
        giveCarriedNote(engine, { title: pole.note.title, body: pole.note.body, lastEditor: pole.note.by?.id === me() ? 'player' : pole.note.by?.id ? `player:${pole.note.by.id}` : null, lastEdited: Math.floor((pole.note.at || Date.now()) / 1000) });
        engine.pushActivity?.(T.backInPack);
      }
      pole.note = { title: String(note.title || '').slice(0, 150), body: String(note.body || '').slice(0, 1000), by: authorOf(note), at: Date.now() };
      engine.pushActivity?.(T.posted(pole.note.title));
      saved('poles');
      drawPoles();
    };
    if (notes.length === 1) return post(notes[0].id);
    openNotePicker({ kicker: T.pole, title: 'Which note?', notes: notes.map((n) => ({ id: n.id, title: n.title })), onPick: post });
    return undefined;
  }

  function customizePole(pole) {
    openPanel('customize', T.customizeTitle, (p) => {
      const pick = (label, name, values, current) => {
        const l = el('label', {}, label);
        const s = el('select', { [`data-hs-${name}`]: '' });
        for (const v of values) {
          const o = el('option', { value: v }, v);
          if (v === current) o.selected = true;
          s.append(o);
        }
        l.append(s);
        p.append(l);
        return s;
      };
      const poleSel = pick(T.poleLabel, 'pole', Array.from({ length: POLE_STYLES }, (_, i) => String(i + 1)), pole.cfg.pole);
      const signSel = pick(T.signLabel, 'sign', Array.from({ length: POLE_SIGNS }, (_, i) => String(i + 1)), pole.cfg.sign);
      const sizeSel = pick(T.sizeLabel, 'size', POLE_SIZES, pole.cfg.size);
      const actions = el('div', { class: 'hs-actions' });
      const cancel = el('button', { type: 'button', class: 'hs-act' }, T.cancel);
      cancel.addEventListener('click', closePanel);
      const save = el('button', { type: 'button', class: 'hs-act', 'data-hs-save': '' }, T.save);
      save.addEventListener('click', () => {
        pole.cfg = poleConfig({ pole: poleSel.value, sign: signSel.value, size: sizeSel.value });
        closePanel();
        saved('poles');
        drawPoles();
      });
      actions.append(cancel, save);
      p.append(actions);
    });
  }

  /** takeable pickup (note_pole.js canPickup: at home). The posted note comes back to the pack (ours: a pack item keeps no note). */
  function pickUpPole(pole) {
    slice.poles = slice.poles.filter((p) => p.id !== pole.id);
    addItem(engine.inv, NOTE_POLE_CLASS, 1);
    if (pole.note) {
      giveCarriedNote(engine, { title: pole.note.title, body: pole.note.body, lastEditor: 'player', lastEdited: Math.floor((pole.note.at || Date.now()) / 1000) });
      engine.pushActivity?.(T.backInPack);
    }
    engine.refreshPack?.();
    engine.pushActivity?.('You picked up a Note Pole.');
    saved('poles');
    drawPoles();
  }

  /** note_pole.js place: only at home; it stands where you are. */
  function placePole() {
    const w = where();
    if (w !== 'street' && w !== 'house') return notice(T.placeHome, 2600);
    if (countItem(engine.inv, NOTE_POLE_CLASS) < 1) return false;
    if (slice.poles.length >= POLES_MAX) return notice('You have a lot of Note Poles out already.', 2600);
    const geo = ownGeometry();
    const x = Math.round(engine.player?.x || 0);
    const rx = w === 'street' ? x - geo.street.houseX : x - geo.house.roomX;
    removeItem(engine.inv, NOTE_POLE_CLASS, 1);
    engine.refreshPack?.();
    slice.poles.push({ id: slice.nextPole, room: w, rx, cfg: poleConfig({}), note: null });
    slice.nextPole += 1;
    engine.pushActivity?.('You put a Note Pole here.');
    saved('poles');
    drawPoles();
    return true;
  }

  /** The save first, then everyone at my home reads the site again (homes_street.go home_refresh). */
  async function saved(what) {
    engine.save?.();
    publish();
    try {
      await flush(engine);
    } catch { /* the refresh still goes; visitors read the last stored save */ }
    client.send('home_refresh', { what });
  }

  // —— Furniture for sale ——

  function runSale(target, verbId) {
    const e = drawn.sales.get(target.state?.uid);
    if (!e) return;
    if (verbId === 'furn_set_price' || verbId === 'furn_edit_price') return priceDialog(e);
    if (verbId === 'furn_dont_sell') return setPrice(e, 0);
    if (verbId === 'furn_buy') return buy(e);
  }

  /** set_sale_price's input (furniture_bed.js 149-163): Price, digits only, at most 6, Set price. */
  function priceDialog(e) {
    openPanel('price', T.priceTitle, (p) => {
      p.append(el('p', {}, e.label));
      const row = el('label', { class: 'hs-price' }, '');
      const input = el('input', { type: 'text', inputmode: 'numeric', maxlength: '6', 'data-hs-price': '', 'aria-label': T.priceTitle });
      input.value = String(e.listing?.price || 1);
      input.addEventListener('input', () => { input.value = input.value.replace(/[^0-9]/g, '').slice(0, 6); });
      row.append(input, document.createTextNode('currants'));
      p.append(row);
      const actions = el('div', { class: 'hs-actions' });
      const cancel = el('button', { type: 'button', class: 'hs-act' }, T.cancel);
      cancel.addEventListener('click', closePanel);
      const ok = el('button', { type: 'button', class: 'hs-act', 'data-hs-setprice': '' }, T.setPrice);
      ok.addEventListener('click', () => {
        const price = parsePrice(input.value);
        if (price == null) return panelNote('Name a price of 1 to 999999 currants.');
        closePanel();
        return setPrice(e, price);
      });
      input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') ok.click(); });
      actions.append(cancel, ok);
      p.append(actions);
    });
  }

  async function setPrice(e, price) {
    if (busy) return false;
    busy = true;
    try {
      // The site checks the stored house: what is placed now must be saved first.
      await flush(engine);
      const answer = price > 0 ? await site.price(e.uid, price) : await site.dontSell(e.uid);
      own.listed = normalizeListings(answer?.listed);
      own.piles = normalizePiles(answer?.piles);
      notice(price > 0 ? T.forSale(e.label, price) : T.stopped(e.label), 3000);
      client.send('home_refresh', { what: 'tags' });
      return true;
    } catch (err) {
      notice(err?.message || T.failed, 3200);
      return false;
    } finally {
      busy = false;
      if (where() === 'house') drawOwnSales();
      publish();
    }
  }

  /** buy (furniture_bed.js 344-375): the store window's one item, here a confirm; the server and the site do the rest. */
  function buy(e) {
    if (!visit || !e.listing) return;
    if ((engine.pc?.currants || 0) < e.listing.price) return notice(T.afford, 2600);
    const go = () => {
      if (!client.send('furn_buy', { owner: visit.owner, op: e.listing.op, price: e.listing.price })) notice(T.offline, 2600);
    };
    if (!engine.prompt) return go();
    engine.prompt({ modal: true, title: T.buying(e.label), text: T.buyConfirm(e.label, e.listing.price), choices: [{ label: T.buy, value: true }, { label: T.cancel, value: false }], onChoice: (v) => { if (v === true) go(); } });
    return undefined;
  }

  function bought(msg) {
    if (!visit || Number(msg.owner) !== visit.owner) return;
    if (msg.status !== 'settled') return notice(String(msg.text || T.failed), 3600);
    const price = Math.max(0, Math.floor(Number(msg.price) || 0));
    const cls = String(msg.class || '');
    // Once per sale: the trade slice remembers the op (the ledger's own id for the buyer's side).
    const receipt = engine.query?.('ledgerReceipt', String(msg.op || ''), engine);
    if (receipt !== false && cls) {
      engine.pc.currants = Math.max(0, (engine.pc.currants || 0) - price);
      ensureItem(cls);
      addItem(engine.inv, cls, 1);
      engine.refreshPack?.();
      engine.updateHud?.();
      engine.playSound?.('PURCHASE_ITEM', { volume: 0.6 });
      // furniture_bed.js 614-624.
      for (const [at, badge] of BIG_SPENDERS) if (price >= at) engine.grantAchievement?.(badge);
    }
    notice(T.bought(labelOf(cls), visit.name), 3600);
    gone(Number(msg.uid));
    engine.save?.();
  }

  /** furn_gone / my own purchase: the piece leaves this copy of the house. */
  function gone(uid) {
    const e = drawn.sales.get(uid);
    if (e) {
      drop(e);
      drawn.sales.delete(uid);
    }
    visit?.listed.delete(uid);
    for (const p of visit?.pieces || []) if (Number(p.item.id) === uid && p.box && !p.box.destroyed) p.box.visible = false;
    publish();
  }

  async function sold(msg) {
    // owner.prompts_add_simple (furniture_bed.js:606).
    const text = T.soldToYou(String(msg.buyer?.name || 'Someone'), labelOf(String(msg.class || '')), Number(msg.price) || 0);
    last = text;
    engine.pushActivity?.(text);
    engine.prompt?.({ text, choices: [{ label: T.ok, value: 'ok' }] });
    await loadOwn({ force: true });
  }

  /** pile_of_currants.js collect: "Here are N currants from …", OK, then the currants. */
  function collectPile(op) {
    const e = drawn.piles.get(op);
    if (!e) return;
    const text = T.pileHere(e.pile.price, e.source);
    const go = async () => {
      try {
        const a = await site.collect(op);
        if (a?.credit && engine.query?.('ledgerReceipt', String(a.credit), engine) !== false) {
          engine.pc.currants = (engine.pc.currants || 0) + (Number(a.currants) || 0);
          engine.updateHud?.();
        }
        own.piles = own.piles.filter((p) => p.op !== op);
        drop(e);
        drawn.piles.delete(op);
        notice(T.pileCollected(e.pile.price, e.source), 3600);
        engine.save?.();
      } catch (err) {
        notice(err?.message || T.failed, 3200);
      }
    };
    if (!engine.prompt) return go();
    engine.prompt({ modal: true, title: T.pile, text, choices: [{ label: T.ok, value: true }], onChoice: () => go() });
    return undefined;
  }

  // —— Messages ——
  client.on('msg:furn_bought', (msg) => bought(msg));
  client.on('msg:furn_sold', (msg) => sold(msg));
  client.on('msg:furn_gone', (msg) => {
    if (visit && Number(msg.owner) === visit.owner) gone(Number(msg.uid));
  });
  client.on('msg:home_refresh', async (msg) => {
    if (!visit || Number(msg.owner) !== visit.owner || where() !== 'visit') return;
    try {
      const data = await site.street(visit.owner);
      if (!visit || Number(msg.owner) !== visit.owner) return;
      visit.data = data;
      visit.listed = normalizeListings(data?.sales);
      drawVisit();
    } catch (err) {
      console.warn('[home-street]', err?.message || err);
    }
  });
  client.on('msg:project_reward', (msg) => {
    // players/inc_jobs.js:459-463, decided by the realtime server.
    if (philanthropicReward(msg, me())) engine.grantAchievement?.(PHILANTHROPIC_BADGE);
  });
  client.on('msg:home_restored', (msg) => {
    const id = String(msg.id || '');
    // doJobEffects type 5: my item comes back through its Restore project's own hook; acked once it took.
    if (projectApi.restored(engine, String(msg.job || ''))) {
      engine.save?.();
      flush(engine).catch(() => {}).finally(() => client.send('project_ack', { id }));
      return;
    }
    // Not registered here yet (away from home): it comes again on a later sync. A proto that is already gone is acked.
    const parsed = readWireId(msg.job);
    const st = homesFeature._state?.();
    const yard = parsed?.yard === 'back' ? st?.backCult : st?.cult;
    const item = yard?.items?.find((row) => Number(row.id) === parsed?.item);
    if (!item?.depleted || (item.cycle || 1) !== parsed.cycle) client.send('project_ack', { id });
  });

  savedSlice = null;
  if (where() === 'street' || where() === 'house') loadOwn({ force: true });

  return {
    client,
    get slice() { return slice; },
    get own() { return own; },
    get visit() { return visit; },
    get drawn() { return drawn; },
    where,
    verbsFor,
    runVerb,
    onVisit,
    placePole,
    loadOwn,
    left() {
      if (visit && !readVisitScene(engine.streetTsid)) visit = null;
    },
    restoreWire(item, yard) {
      return restoreWireId(me(), item, yard) || null;
    },
    saleLock(decor, id) {
      const st = homesFeature._state?.();
      if (!st || decor !== st.houseDecor) return null;
      return own.listed.has(Number(id)) ? T.stopFirst : null;
    },
    tick(now) {
      const w = where();
      const st = homesFeature._state?.();
      const key = w === 'visit' ? '' : `${w}:${engine.streetTsid}`;
      if ((w === 'street' || w === 'house') && (st?.scene !== drawnScene || key !== lastSceneKey)) {
        lastSceneKey = key;
        drawnScene = st?.scene || null;
        drawOwn();
        loadOwn();
      } else if (!w && lastSceneKey) {
        lastSceneKey = '';
      }
      if (now - tickAt < 250) return;
      tickAt = now;
      // pile_of_currants.js onPlayerCollision: the pile speaks up to its owner.
      const p = engine.player;
      for (const e of drawn.piles.values()) {
        const near = p && e.target?.sprite && Math.abs(p.x - e.target.sprite.x) < 60;
        if (near && !e.bumped) {
          e.bumped = true;
          engine.say?.(e.target, T.pileBump(e.pile.price, e.source), 5000);
        } else if (!near) e.bumped = false;
      }
    },
    /** QA: stand beside something this feature drew ('signpost', 'pole', 'pile', 'sale:<uid>', 'proto'). */
    standNear(what = 'signpost') {
      const p = engine.player;
      let x = null;
      if (what === 'signpost') x = drawn.signpost?.target?.sprite?.x;
      else if (what === 'pole') x = [...drawn.poles.values()][0]?.target?.sprite?.x;
      else if (what === 'pile') x = [...drawn.piles.values()][0]?.target?.sprite?.x;
      else if (what === 'proto') x = [...drawn.protos.values()][0]?.target?.sprite?.x;
      else if (what.startsWith('sale:')) x = drawn.sales.get(Number(what.slice(5)))?.target?.sprite?.x;
      if (!p || !Number.isFinite(x)) return false;
      p.x = x - 30;
      p.vx = 0;
      return true;
    },
    /** QA: stand at a world x (dx from where you are when relative). */
    standAt(x, relative = false) {
      const p = engine.player;
      if (!p || !Number.isFinite(Number(x))) return false;
      p.x = relative ? p.x + Number(x) : Number(x);
      p.vx = 0;
      return true;
    },
    /** QA: run a verb on something drawn here. */
    act(what, verbId) {
      let t = null;
      if (what === 'signpost') t = drawn.signpost?.target;
      else if (what === 'pole') t = [...drawn.poles.values()][0]?.target;
      else if (what === 'pile') t = [...drawn.piles.values()][0]?.target;
      else if (what === 'proto') t = [...drawn.protos.values()][0]?.target;
      else if (what.startsWith('sale:')) t = drawn.sales.get(Number(what.slice(5)))?.target;
      if (!t) return false;
      if (!verbId) return verbsFor(t).map((v) => `${v.id}${v.enabled === false ? '!' : ''}`);
      return runVerb(t, verbId);
    },
    /** QA: what where() reads. */
    debug() {
      const st = homesFeature._state?.();
      return { home: engine.homeContext?.(), scene: st?.scene ? { room: st.scene.room, tower: st.scene.tower ?? null, floor: st.scene.houseFloor ?? null } : null, me: me() };
    },
    /** QA: whether a piece of my house is held by its sale (homes-feature's pickup asks the same). */
    locked(uid) {
      return this.saleLock(homesFeature._state?.()?.houseDecor, uid);
    },
    setPrice: (uid, price) => {
      const e = drawn.sales.get(Number(uid));
      return e ? setPrice(e, price) : Promise.resolve(false);
    },
    get panel() { return panelKind; },
  };
}

function ensure(engine) {
  if (session) return session;
  if (engine?.mode !== 'multiplayer' || typeof document === 'undefined') return null;
  const client = engine.query?.('realtimeClient');
  if (!client) return null;
  session = createSession(engine, client);
  globalThis.groddleHomeStreet = session;
  return session;
}

/** Recipe 303 joins the Construction Tool in multiplayer only (solo's catalog stays as build-recipes.mjs wrote it). */
function addRecipe() {
  if (recipeAdded || !isRecipeCatalogReady()) return;
  recipeAdded = true;
  ensureItem(NOTE_POLE_CLASS, { ...NOTE_POLE_ITEM });
  if (!RECIPE_CATALOG[NOTE_POLE_CLASS]) setRecipeCatalog({ ...RECIPE_CATALOG, [NOTE_POLE_CLASS]: { ...NOTE_POLE_RECIPE } });
}

export const homeStreetMpFeature = {
  id: HOME_STREET_MP_ID,

  onTick(dtMs, now, engine) {
    if (engine.mode !== 'multiplayer' || !engine.started) return;
    addRecipe();
    ensure(engine)?.tick(now);
  },

  onStreetClear() {
    session?.left();
  },

  save() {
    const s = session?.slice || (savedSlice ? normalizeHomeStreetSlice(savedSlice) : null);
    if (!s || (!s.poles.length && !s.five && !s.sold.length)) return undefined;
    return { poles: s.poles, nextPole: s.nextPole, five: s.five, sold: s.sold };
  },

  restore(slice, engine) {
    savedSlice = engine?.mode === 'multiplayer' ? slice || null : null;
  },

  /** neighbours-mp-feature: a visit scene was built ({ owner, name, room, key, view, built, spots }). */
  homeStreetVisit(info, engine) {
    if (engine?.mode !== 'multiplayer') return null;
    const s = ensure(engine);
    if (!s || !info?.owner) return null;
    s.onVisit(info);
    return true;
  },

  /** homes-feature registerRestore: the realtime server's id for my restoration (multiplayer only). */
  homeRestoreWire(item, yard, engine) {
    if (engine?.mode !== 'multiplayer') return null;
    return ensure(engine)?.restoreWire(item, yard) || null;
  },

  /** homes-feature runFurnitureAction: a piece on sale can't be picked up. */
  furnitureSaleLock(decor, id, engine) {
    if (engine?.mode !== 'multiplayer') return null;
    return session?.saleLock(decor, id) || null;
  },

  verbsFor(target) {
    return session ? session.verbsFor(target) : [];
  },

  runVerb(target, verbId) {
    return session ? session.runVerb(target, verbId) : false;
  },

  /** note_pole.js place (pack). */
  packVerbs(classTsid, engine) {
    if (classTsid !== NOTE_POLE_CLASS || engine?.mode !== 'multiplayer' || countItem(engine.inv, NOTE_POLE_CLASS) < 1) return [];
    const s = ensure(engine);
    const w = s?.where();
    const ok = w === 'street' || w === 'house';
    return [{ id: 'place_note_pole', label: T.placeVerb, tooltip: T.placeTip, enabled: ok, reason: ok ? '' : T.placeHome, primary: true }];
  },

  runPackVerb(classTsid, verbId, engine) {
    if (classTsid !== NOTE_POLE_CLASS || verbId !== 'place_note_pole') return false;
    ensure(engine)?.placePole();
    return true;
  },
};
