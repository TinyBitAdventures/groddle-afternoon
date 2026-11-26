/**
 * Pot Luck Day, part B (G982): the Harvest Table by the Groddle Forest Junction signpost, the quest
 * Pot's Empty Table, Harvest Stuffing and Pot's Cornucopia. The rules are js/pot-luck-feast.js
 * (all ours: Glitch never ran a Thanksgiving event); this module puts them in the world.
 *
 *  - The table: Tiny Speck's deco_table_wooden_ghtest three times, end to end, by the street's hub
 *    signpost, only while the season is on. Lay a dish or a crop on it (its Lay a dish verb, a
 *    picker of what the pack holds, or a stack dropped on it: js/world-drop.js lay_feast); the
 *    newest dishes stand on it, drawn with their own Tiny Speck icons, and its card counts them all;
 *    its Look opens the list of every offering it keeps, newest first, with who laid each.
 *    Online the table is the server's (harvest_table.go: everyone's offerings, broadcast, held
 *    across restarts, packed away at the season's end); solo keeps its own in the save.
 *  - Each player's first offering of a game day gives a little mood and favor with Pot (the
 *    server decides "first" online), through metabolics.js and the player's addGiantFavor.
 *  - The quest: the Magic Rock offers it once the season is on. Its three counted steps show in
 *    the quest log (questLogCards): harvest dishes cooked (making_recipe:<dish>), a Chicken dressed
 *    (lane A's chicken_dressed:<costume>) and harvest dishes laid on the table. Done, it gives Pot's
 *    Cornucopia (a trophy for the house), favor with Pot and the Feast Bringer badge.
 *  - Harvest Stuffing: an Awesome Pot recipe that cooks only during the season (making.js
 *    recipe.season).
 *
 * QA: ?seasondate=2026-11-26 (or &season=pot_luck_day); &feastdemo=1 stocks the pack for the quest, the table and
 * dressing (3 Turkey Tailfans and 3 Rooster Plumes: enough for Plume Fluffer I across the nearby streets), with the
 * tools, ingredients and cooking skills (through Master Chef I) to cook every harvest dish and Harvest Stuffing.
 * window.groddleFeast (qa-gate): lay(cls), state(), quest(), offer(), event(name), look(), list(),
 * seasonDate('2026-11-26') (online, where ?seasondate= cannot reach the page).
 * Canvas data: feastTable (on|off), feastCount, feastShown (classes drawn), feastQuest
 * (status:dishes/dressed/laid), feastLast, feastList (the Look list's row count, or closed).
 */

import { addItem, countItem, ensureItem, itemIcon, removeItem, registerItemUse, ITEM_CATALOG } from '../inventory.js?v=3be7988a';
import { dametimeParts, getGameDayKey } from '../game-day.js?v=beeaa24b';
import { RECIPE_CATALOG, isRecipeCatalogReady, setRecipeCatalog } from '../making.js?v=2a62a71a';
import { activeSeasons, parseSeasonDate, potLuckWindow, seasonYearKey } from '../seasons.js?v=5d8f545a';
import { shiftMetabolic } from '../metabolics.js?v=48f784bf';
import { landingY, nearestSurfaceY } from '../walk-surface.js?v=f21ce37b';
import { isLoaded, onLoaded, textureFromUrl } from '../textures.js?v=b8e38103';
import { WORLD_FONT_FAMILY } from '../world-text.js?v=6b49f88c';
import { exposeQA } from '../qa-gate.js?v=f4e2cd82';
import { SEED_CATALOG } from '../garden.js?v=fefa7bcd';
import { openListDialog } from '../ui/storage-windows.js?v=6b92c103';
import { feastDayKey, servingsText } from '../feast-day.js?v=3f2d4603';
import {
  DISHES_NEEDED,
  DISH_BOX,
  FEAST_BADGE,
  FEAST_SEASON,
  HARVEST_DISHES,
  KEEPSAKE,
  KEEPSAKE_ITEM,
  LAID_COUNTER,
  QUEST,
  QUEST_COUNTER,
  SEASON_NOTICES,
  STUFFING,
  STUFFING_ITEM,
  STUFFING_RECIPE,
  TABLE_AT,
  TABLE_CLASS,
  TABLE_DECO,
  TABLE_LINES,
  TABLE_RULES,
  TABLE_STREET,
  createQuestState,
  createTableState,
  cropClasses,
  dishClasses,
  dishSpots,
  layCheck,
  layOffering,
  layableKind,
  noticesDue,
  packAway,
  questComplete,
  layQuestNote,
  questEvent,
  questPinInfo,
  questRows,
  shownRows,
  tableCountLabel,
  tableList,
} from '../pot-luck-feast.js?v=971888be';

export const POT_LUCK_FEAST_ID = 'pot-luck-feast';
const OFFER_DELAY_MS = 20_000;

let season = { ids: [], via: 'none' };
let seasonCheckAt = 0;
let table = createTableState(); // solo: the save's; online: the server's last word
let quest = createQuestState();
let laidTotal = 0; // this player's offerings, all time (Good Neighbor counts them too)
let told = {}; // { season, feast }: the keys this player's notices were last shown for
let view = null; // { target, root, icons, label }
let recipeAdded = false;
let dishes = null;
const crops = cropClasses(SEED_CATALOG); // what a garden seed grows: Glitch's crops (is_crop)
let offerAt = 0;
let offerOpen = false;
let client = null;
let offs = [];
let online = null; // the server's table while online and on its street: { on, rows, total }
let pending = null; // { cls, at }: a lay the server has not answered
let syncAt = 0; // when the page last asked the server for the table (feast_sync)
let last = '';
let demoDone = false;
let engineRef = null;
let list = null; // the Look list's window while open (ui/storage-windows.js openListDialog)

let qaDate = null; // groddleFeast.seasonDate(): the online page takes no ?seasondate= (QA, local hosts only)
const nowForCalendar = (engine) => qaDate ?? parseSeasonDate(engine?.param?.('seasondate')) ?? Date.now();
const seasonOn = () => season.ids.includes(FEAST_SEASON);
const yearKey = (engine) => seasonYearKey(FEAST_SEASON, nowForCalendar(engine));
const label = (cls) => ITEM_CATALOG[cls]?.label || cls;
const onTableStreet = (engine) => String(engine?.streetTsid || '') === TABLE_STREET;

function refreshSeason(engine, force = false) {
  const now = Date.now();
  if (!force && now - seasonCheckAt < 2000) return false;
  seasonCheckAt = now;
  const was = seasonOn();
  season = activeSeasons(nowForCalendar(engine), { override: engine.param?.('season') || '', dametime: dametimeParts(now) });
  const key = seasonOn() ? yearKey(engine) : '';
  // Solo: a table from a season that is over, or another year's, is packed away.
  if (table.key !== key) {
    const had = table.total > 0;
    packAway(table, key);
    if (had && !key && engine.started) say(engine, TABLE_LINES.packed);
  }
  if (seasonOn()) quest = createQuestState(quest, key);
  return was !== seasonOn();
}

function publish(engine) {
  if (!engine?.setData) return;
  const t = shownTable();
  engine.setData('feastTable', view ? 'on' : 'off');
  engine.setData('feastCount', String(t.total || 0));
  engine.setData('feastShown', shownRows(t).map((r) => r.c).join(',') || 'none');
  engine.setData('feastQuest', `${quest.status || 'none'}:${quest.dishes}/${quest.dressed}/${quest.laid}`);
  engine.setData('feastLast', last || 'none');
  engine.setData('feastList', list && !list.closed ? String(listView(engine).rows.length) : 'closed');
}

function say(engine, msg, ok = true, effects = null) {
  last = String(msg || '').trim();
  if (effects && Object.keys(effects).length) engine.pushActivity?.({ base: last.replace(/\.$/, ''), effects });
  else engine.pushActivity?.(last);
  engine.toast?.(last, ok ? 3200 : 2600);
  publish(engine);
}

/** The table drawn now: the server's online, the save's solo. */
function shownTable() {
  return online || table;
}

/** Is the table out? Online the server's word decides (it sets the table out at the season's first second, harvest_table.go), else the calendar. */
function tableOn() {
  return online ? online.on : seasonOn();
}

/**
 * The festival's moment cards, once each per player: Pot Luck Day the first time they play during it,
 * the feast on Thanksgiving Day (SEASON_NOTICES). QA: &seasonnotice=off (or &questoffer=off) holds them.
 */
function tellSeason(engine) {
  if (engine.param?.('seasonnotice') === 'off' || engine.param?.('questoffer') === 'off') return;
  const now = nowForCalendar(engine);
  const key = yearKey(engine);
  const due = noticesDue(told, key, feastDayKey(now));
  if (!due.length) return;
  const y = Number(String(key).split(':')[1]) || new Date(now).getUTCFullYear();
  for (const which of due) {
    const n = which === 'season' ? SEASON_NOTICES.season(potLuckWindow(y).to[1]) : SEASON_NOTICES.feast;
    told = { ...told, [which]: which === 'season' ? key : feastDayKey(now) };
    engine.pushActivity?.(`${/[.!?]$/.test(n.title) ? n.title : `${n.title}.`} ${n.body}`);
    engine.award?.({ kind: 'season', kicker: n.kicker, title: n.title, body: n.body, iconUrl: n.icon, primaryLabel: 'OK' });
  }
  engine.save?.();
}

/* --------------------------------------------------------------- online */

function liveClient(engine) {
  return engine.mode === 'multiplayer' ? engine.query?.('realtimeClient') || null : null;
}

/** Online and on the table's street with the server: the table is everyone's. */
function shared(engine) {
  const c = liveClient(engine);
  return c && c.state === 'online' && onTableStreet(engine) ? c : null;
}

function watch(engine) {
  const c = liveClient(engine);
  if (c === client) return;
  for (const off of offs) off?.();
  offs = [];
  client = c;
  online = null;
  if (!c?.on) return;
  offs.push(c.on('msg:feast_state', (msg) => {
    online = { on: msg.on === true, rows: Array.isArray(msg.rows) ? msg.rows : [], total: Number(msg.total) || 0 };
    if (!online.on && view) say(engine, TABLE_LINES.packed);
    redraw(engine);
  }));
  offs.push(c.on('msg:feast_laid', (msg) => {
    if (!msg?.row?.c) return;
    online ||= { on: true, rows: [], total: 0 };
    online.rows = [...online.rows, msg.row].slice(-TABLE_RULES.keep);
    online.total = Number(msg.total) || online.total + 1;
    if (msg.mine) {
      pending = null;
      const use = msg.use && typeof msg.use === 'object' ? msg.use : null;
      // The ledger took the item: it leaves the pack once (the trade slice's applied list holds the op).
      const take = !use || engine.query?.('ledgerReceipt', String(use.op || ''), engine) !== false;
      if (take) removeItem(engine.inv, msg.row.c, 1);
      laid(engine, msg.row.c, msg.first === true);
    } else {
      engine.pushActivity?.(TABLE_LINES.laidOther(msg.row.name || 'Someone', label(msg.row.c)));
    }
    redraw(engine);
  }));
  offs.push(c.on('msg:feast_no', (msg) => {
    pending = null;
    engine.playSound?.('CLICK_FAILURE', { volume: 0.4 });
    say(engine, String(msg?.message || TABLE_LINES.notDish), false);
  }));
}

/* ---------------------------------------------------------------- table */

function groundAt(engine, x, refY) {
  return landingY(engine.platforms, x, (refY ?? engine.groundY) - 60)
    ?? nearestSurfaceY(engine.platforms, x, refY ?? engine.groundY)
    ?? engine.groundY;
}

function clearTable(engine) {
  closeList();
  if (!view) return;
  engine.unregister?.(view.target);
  view = null;
  publish(engine);
}

/** The table, when the season is on and this is its street (online: while the server says it is on). */
function spawnTable(engine) {
  clearTable(engine);
  if (!tableOn() || !onTableStreet(engine) || engine.inScene?.()) return;
  const { PIXI } = engine;
  const l = engine.street?.bounds?.l || 0;
  const t = engine.street?.bounds?.t || 0;
  const x = TABLE_AT.x - l;
  const y = groundAt(engine, x, TABLE_AT.y - t);
  const root = new PIXI.Container();
  root.x = x;
  root.y = y + 2;
  // deco_table_wooden_ghtest is 492 x 188 in its 2x file: three of them at the drawn 186 x 71.
  const tex = textureFromUrl(`assets/decos/groddle/${TABLE_DECO}.webp`);
  const { w, h } = TABLE_AT.piece;
  const step = w - TABLE_AT.overlap;
  const half = ((TABLE_AT.pieces - 1) * step) / 2; // the middle of the end tables
  for (let k = 0; k < TABLE_AT.pieces; k += 1) {
    const piece = new PIXI.Sprite(tex);
    piece.anchor?.set?.(0.5, 1);
    piece.width = w;
    piece.height = h;
    // The right-hand one mirrored, so the long table's grain runs out to both ends.
    if (k === TABLE_AT.pieces - 1) piece.scale.x *= -1;
    piece.x = k * step - half;
    root.addChild(piece);
  }
  const icons = new PIXI.Container();
  root.addChild(icons);
  const label = new PIXI.Text({ text: '', style: { fontFamily: WORLD_FONT_FAMILY, fontSize: 13, fontWeight: '700', fill: 0xfff3d6, stroke: { color: 0x4a2c14, width: 3 } } });
  label.anchor?.set?.(0.5, 0);
  // The count stands on the right-hand table's apron, clear of the seams.
  label.x = half;
  label.y = -h + 17;
  root.addChild(label);
  root.zIndex = 2;
  root._worldHitW = half * 2 + w;
  root._worldHitH = h + 40;
  engine.entityLayer.addChild(root);
  const target = engine.register({
    classId: TABLE_CLASS,
    featureId: POT_LUCK_FEAST_ID,
    label: TABLE_LINES.title,
    subtitle: tableSubtitle(engine, shownTable().total),
    sprite: root,
    artHeight: h + 30,
  });
  view = { target, root, icons, label, w, h, step, half };
  redraw(engine);
}

/**
 * A dish icon scaled into its box, now and again when the icon arrives. It waits on the load
 * (textures.js onLoaded), never on a listener left on the shared cached texture: a sprite rebuilt
 * on the next lay left its once('update') behind, the dead sprite's fit threw when the icon came
 * and stopped the texture's other listeners, so new dishes stayed invisible until a reload.
 */
function fitIcon(s, tex, box) {
  const fit = () => {
    if (s.destroyed || s.texture !== tex) return;
    const k = Math.min(box / (tex.width || box), box / (tex.height || box), 1);
    s.scale.set(k);
  };
  fit();
  if (!isLoaded(tex)) onLoaded(tex, fit);
}

/** The table's card: its count, and on Thanksgiving Day the feast's servings left (G1009, feast-day-feature). */
function tableSubtitle(engine, total) {
  const left = engine.query?.('feastDayServings', engine);
  return Number.isFinite(left) ? `${TABLE_LINES.subtitle(total)} · ${servingsText(left)}` : TABLE_LINES.subtitle(total);
}

/** The newest dishes on the table top, left to right, and the count on its front. */
function redraw(engine) {
  if (!view || view.root.destroyed) {
    if (tableOn() && onTableStreet(engine) && engine.street) spawnTable(engine);
    publish(engine);
    return;
  }
  if (online && !online.on) {
    clearTable(engine);
    return;
  }
  const { PIXI } = engine;
  const t = shownTable();
  const rows = shownRows(t);
  const spots = dishSpots(rows.length);
  // One sprite a slot, kept from lay to lay: a slot whose dish changed only takes the new icon.
  const kids = view.icons.children;
  while (kids.length > rows.length) view.icons.removeChildAt(kids.length - 1).destroy();
  rows.forEach((row, i) => {
    const tex = textureFromUrl(`assets/sprites/icons/${row.c}.webp`);
    let s = kids[i];
    if (!s) {
      s = new PIXI.Sprite(tex);
      s.anchor?.set?.(0.5, 1);
      view.icons.addChild(s);
    } else if (s.texture !== tex) s.texture = tex;
    fitIcon(s, tex, DISH_BOX);
    s.x = spots[i].x;
    s.y = spots[i].y;
  });
  if (list && !list.closed) list.update(listView(engine));
  view.label.text = t.total ? tableCountLabel(t.total) : '';
  view.target.subtitle = tableSubtitle(engine, t.total);
  publish(engine);
}

/* -------------------------------------------------------- the Look list */

/** What the Look list shows: every kept offering, newest first, its icon, name and who laid it. */
function listView(engine) {
  const t = shownTable();
  const { rows, older } = tableList(t);
  const me = Number(liveClient(engine)?.me?.id) || 0;
  return {
    sub: TABLE_LINES.subtitle(t.total),
    rows: rows.map((r, i) => ({
      key: `${r.c}:${i}`,
      icon: ITEM_CATALOG[r.c]?.icon || itemIcon(r.c),
      name: label(r.c),
      // Solo rows carry no name: the player laid them all. Online, by is the layer's player id.
      note: TABLE_LINES.listBy(r.name, !r.name || (me && Number(r.by) === me)),
    })),
    last: older ? TABLE_LINES.listMore(older) : '',
  };
}

/** The table's Look: the list of everything on it (a bare table says so). */
function openList(engine) {
  const t = shownTable();
  if (!t.total) return say(engine, TABLE_LINES.look0);
  if (typeof document === 'undefined') return;
  list?.close?.();
  list = openListDialog({ title: TABLE_LINES.listTitle, ...listView(engine), onClose: () => { list = null; publish(engine); } });
  publish(engine);
}

function closeList() {
  list?.close?.();
  list = null;
}

/* ------------------------------------------------------------- the lay */

function dishSet() {
  if (!dishes || dishes.size < 10) dishes = dishClasses(RECIPE_CATALOG);
  return dishes;
}

function kindOf(cls) {
  return layableKind(cls, crops, dishSet());
}

/** The pack's dishes and crops, for the picker. */
function choices(engine) {
  const out = [];
  for (const [cls, n] of Object.entries(engine.inv || {})) {
    if (!(Number(n) > 0) || !kindOf(cls)) continue;
    out.push({ classTsid: cls, label: label(cls), have: Number(n) });
  }
  return out.sort((a, b) => (HARVEST_DISHES.includes(b.classTsid) - HARVEST_DISHES.includes(a.classTsid)) || a.label.localeCompare(b.label));
}

/** Lay one `cls` on the table: the checks, then the server's word online, else the save's table. */
function lay(engine, cls) {
  const c = String(cls || '');
  const check = layCheck({ season: tableOn(), kind: kindOf(c), have: countItem(engine.inv, c), label: label(c) });
  if (!check.ok) {
    engine.playSound?.('CLICK_FAILURE', { volume: 0.4 });
    say(engine, check.msg, false);
    return false;
  }
  const live = shared(engine);
  if (live) {
    if (pending && Date.now() - pending.at < 8000) return say(engine, TABLE_LINES.slow, false), false;
    if (live.send('feast_lay', { c })) {
      pending = { cls: c, at: Date.now() };
      return true;
    }
  }
  // Online the table is the server's: with no connection nothing is laid (the pack keeps it).
  if (engine.mode === 'multiplayer') return say(engine, TABLE_LINES.offline, false), false;
  removeItem(engine.inv, c, 1);
  const res = layOffering(table, { c, who: 'me', day: getGameDayKey(Date.now()), name: '' });
  laid(engine, c, res.first);
  redraw(engine);
  return true;
}

/** An offering of this player's on the table: the day's reward, the badge counter, the quest. */
function laid(engine, cls, first) {
  laidTotal += 1;
  engine.playSound?.('ITEM_DROP', { volume: 0.5 });
  let effects = null;
  if (first) {
    const mood = engine.pc ? Math.round(shiftMetabolic(engine.pc, 'mood', TABLE_RULES.mood)) : 0;
    // stats_add_favor_points: favor up to the emblem target and no further (shrines.js addGiantFavor).
    const rows = typeof engine.pc?.addGiantFavor === 'function' ? engine.pc.addGiantFavor(TABLE_RULES.giant, TABLE_RULES.favor) : [];
    const favor = Array.isArray(rows) ? rows.reduce((a, r) => a + (Number(r?.change) || 0), 0) : 0;
    effects = {};
    if (mood) effects.mood = mood;
    if (favor) effects.favor = favor;
    engine.updateHud?.();
  }
  // #610: whether it counted for Pot's Empty Table, in the same line (before the quest counts it).
  const note = layQuestNote(quest, cls);
  say(engine, `${TABLE_LINES.laid(label(cls))}${first ? ` ${TABLE_LINES.first}` : ''}${note ? ` ${note}` : ''}`, true, effects);
  engine.achievement?.(LAID_COUNTER, 1);
  questStep(engine, 'harvest_table:laid', { cls });
  engine.refreshPack?.();
  engine.save?.();
}

/* ---------------------------------------------------------------- quest */

function offerQuest(engine) {
  if (!seasonOn() || quest.status || offerOpen || !engine.offerQuestDialogue) return false;
  offerOpen = true;
  engine.offerQuestDialogue({
    title: QUEST.title,
    kicker: QUEST.kicker,
    beats: QUEST.offer.map((b) => ({ ...b })),
    acceptLabel: QUEST.offer[QUEST.offer.length - 1].response,
    declinable: false,
    onAccept: () => {
      offerOpen = false;
      quest.status = 'active';
      quest.key = yearKey(engine);
      say(engine, QUEST.accepted);
      engine.save?.();
      engine.updateHud?.();
    },
  });
  return true;
}

function questStep(engine, event, detail = {}) {
  if (quest.status !== 'active') return;
  const res = questEvent(quest, event, detail);
  if (res.step) say(engine, QUEST.stepDone[res.step]);
  if (res.done) completeQuest(engine);
  else if (res.step) engine.save?.();
  engine.updateHud?.();
  publish(engine);
}

function completeQuest(engine) {
  if (quest.status !== 'active' || !questComplete(quest)) return false;
  quest.status = 'done';
  const r = QUEST.rewards;
  if (typeof engine.pc?.addGiantFavor === 'function') engine.pc.addGiantFavor(r.favor.giant, r.favor.points);
  if (engine.pc && r.xp) {
    engine.pc.xp = (engine.pc.xp || 0) + r.xp;
    engine.pc.imagination = (engine.pc.imagination || 0) + r.xp;
  }
  // The keepsake waits with the furniture, as a trophy does (home-trophies.js).
  addItem(engine.inv, KEEPSAKE, 1);
  engine.playSound?.('QUEST_COMPLETE', { volume: 0.6 });
  engine.scriptedDialogue?.({ title: QUEST.title, kicker: 'Quest complete', beats: [{ text: QUEST.completion, response: 'OK' }] });
  engine.achievement?.(QUEST_COUNTER, 1);
  say(engine, `${QUEST.title} complete. You got ${KEEPSAKE_ITEM.label}: display it from the Furniture tab when you Decorate your house.`, true, { favor: r.favor.points, xp: r.xp });
  engine.updateHud?.();
  engine.save?.();
  return true;
}

function questCard() {
  if (typeof document === 'undefined' || !quest.status || quest.status === 'offered') return [];
  const done = quest.status === 'done';
  const card = document.createElement('div');
  card.className = `q-card${done ? ' done' : ''}`;
  // An active card names its quest, so it can be pinned (game.js questPinButton) while it runs this season.
  if (questPinInfo(quest, seasonOn())) card.dataset.quest = QUEST.id;
  card.dataset.feastQuest = QUEST.id;
  const title = document.createElement('div');
  title.className = 'q-title';
  title.textContent = `${QUEST.title}${done ? ' ✓' : ''}`;
  card.appendChild(title);
  for (const r of questRows(quest)) {
    const row = document.createElement('div');
    row.className = 'q-req';
    row.textContent = `${r.desc}: ${r.current}/${r.num}`;
    card.appendChild(row);
  }
  return [card];
}

/* ----------------------------------------------------------------- items */

function addRecipe() {
  if (recipeAdded || !isRecipeCatalogReady()) return;
  recipeAdded = true;
  dishes = null;
  if (!RECIPE_CATALOG[STUFFING]) setRecipeCatalog({ ...RECIPE_CATALOG, [STUFFING]: { ...STUFFING_RECIPE, inputs: STUFFING_RECIPE.inputs.map((i) => ({ ...i })), outputs: STUFFING_RECIPE.outputs.map((o) => ({ ...o })), skills: [...STUFFING_RECIPE.skills], achievements: [] } });
}

/** &feastdemo=1's cooking skills: Master Chef I (Awesome Pot) and Cheffery III (the Frying Pan dishes), prerequisites first. */
const DEMO_COOK_SKILLS = Object.freeze(['ezcooking_1', 'cheffery_1', 'cheffery_2', 'cheffery_3', 'saucery_1', 'grilling_1', 'blending_1', 'masterchef_1']);

function demoSetup(engine) {
  if (demoDone || !engine.param?.('feastdemo')) return;
  demoDone = true;
  const kit = [['pumpkin_pie', 2], ['hot_potatoes', 1], ['corny_fritter', 1], ['corn', 4], ['potato', 24], ['pinch_of_salt', 8], ['awesome_pot', 1], ['bun', 2], ['mushroom', 3], ['onion', 2], ['saffron', 1], ['turkey_tailfan', 3], ['rooster_plume', 3],
    // Every harvest dish can be cooked: Corny Fritter and Pumpkin Pie (Frying Pan), Wavy Gravy (Saucepan), Potcorn (Awesome Pot).
    ['frying_pan', 1], ['egg_plain', 2], ['flour', 1], ['honey', 1], ['butterfly_butter', 1], ['nutmeg', 1], ['pumpkin', 1],
    ['saucepan', 1], ['camphor', 1], ['stock_sauce', 1], ['olive_oil', 2], ['potoxin', 3], ['paper', 2]];
  for (const [cls, n] of kit) if (countItem(engine.inv, cls) < n) addItem(engine.inv, cls, n - countItem(engine.inv, cls));
  // The cooking skills those recipes and tools need, with their own prerequisites (skills.json reqSkills).
  for (const id of DEMO_COOK_SKILLS) if (!(engine.learnedSkills || []).includes(id)) engine.grantSkill?.(id);
  engine.refreshPack?.();
}

/* --------------------------------------------------------------- feature */

export const potLuckFeastFeature = {
  id: POT_LUCK_FEAST_ID,

  init(engine) {
    engineRef = engine;
    ensureItem(STUFFING, { ...STUFFING_ITEM, tags: [...STUFFING_ITEM.tags] });
    registerItemUse(STUFFING, { kind: 'food', verb: 'Eat', energy: STUFFING_ITEM.baseCost, source: 'ours (G982): base cost 72 x energy_factor 1, as include/food.js food_eat' }, { label: STUFFING_ITEM.label });
    ensureItem(KEEPSAKE, { label: KEEPSAKE_ITEM.label, namePlural: KEEPSAKE_ITEM.namePlural, desc: KEEPSAKE_ITEM.desc, baseCost: 0, stackMax: 1, tags: ['no_trade'] });
    refreshSeason(engine, true);
    offerAt = Date.now() + OFFER_DELAY_MS;
    exposeQA('groddleFeast', {
      lay: (cls) => lay(engine, cls),
      state: () => ({ season: seasonOn(), online: Boolean(online), table: shownTable(), quest: { ...quest }, laidTotal, view: Boolean(view) }),
      quest: () => questRows(quest),
      offer: () => offerQuest(engine),
      event: (name, detail) => questStep(engine, name, detail),
      choices: () => choices(engine),
      /** The Look list as it shows: { open, sub, rows: [{ name, note }], last }. look() opens it. */
      list: () => ({ open: Boolean(list && !list.closed), ...listView(engine), rows: listView(engine).rows.map(({ name, note }) => ({ name, note })) }),
      look: () => openList(engine),
      /** ?seasondate= for a page that cannot take it (/play/online/ strips its params): 'YYYY-MM-DD' or ''. */
      seasonDate: (text) => {
        qaDate = parseSeasonDate(text);
        refreshSeason(engine, true);
        if (engine.street) spawnTable(engine);
        return seasonOn();
      },
    });
    publish(engine);
  },

  onStreetEnter(street, engine) {
    refreshSeason(engine, true);
    demoSetup(engine);
    watch(engine);
    spawnTable(engine);
  },

  onStreetClear(engine) {
    clearTable(engine);
    pending = null;
    online = null;
    syncAt = 0;
  },

  onNewDay(now, engine) {
    publish(engine);
  },

  onTick(dtMs, now, engine) {
    addRecipe();
    watch(engine);
    // A feast_state sent before this page listened (a reload, a quick join) is asked for again.
    if (!online && now - syncAt > 5000 && shared(engine)) {
      syncAt = now;
      shared(engine).send('feast_sync', {});
    }
    if (refreshSeason(engine) && engine.street) {
      // The calendar turned (the season's start or end): online, ask the server for its word again
      // rather than keep the one from this street's join (a table seen packed away before the start).
      if (online && shared(engine)) shared(engine).send('feast_sync', {});
      spawnTable(engine);
    }
    if (!engine.started || !seasonOn()) return;
    tellSeason(engine);
    if (quest.status === '' && now >= offerAt && engine.param?.('questoffer') !== 'off' && !engine.query?.('holdQuestOffers', engine) && !engine.questDialogueOpen?.()) {
      offerAt = now + 10 * 60_000;
      offerQuest(engine);
    }
    if (offerOpen && !engine.questDialogueOpen?.()) offerOpen = false;
  },

  onEvent(counter, amount, engine) {
    const c = String(counter || '');
    if (/^making_recipe:/.test(c) || /^chicken_dressed(?::|$)/.test(c)) {
      for (let i = 0; i < Math.max(1, Math.floor(Number(amount) || 1)); i += 1) questStep(engine, c);
    }
  },

  verbsFor(target, engine) {
    if (!view || target !== view.target) return null;
    const ok = tableOn();
    const has = choices(engine).length > 0;
    return [
      { id: 'lay', label: TABLE_LINES.verb, sort: 50, picker: 'lay', emptyMsg: TABLE_LINES.none, tooltip: TABLE_LINES.verbTip, enabled: ok && has, reason: ok ? TABLE_LINES.none : TABLE_LINES.noSeason, energy: 0, durationMs: 0 },
      { id: 'look', label: TABLE_LINES.look, sort: 60, enabled: true, tooltip: TABLE_LINES.lookTip, energy: 0, durationMs: 0 },
    ];
  },

  runVerb(target, verbId, engine) {
    if (!view || target !== view.target) return false;
    const [verb, cls] = String(verbId || '').split(':');
    if (verb === 'lay' && cls) return lay(engine, cls), true;
    if (verb === 'lay') return engine.openPicker?.(target, { id: 'lay', picker: 'lay', emptyMsg: TABLE_LINES.none }), true;
    if (verb === 'look') return openList(engine), true;
    return false;
  },

  /** The Lay a dish picker: the pack's dishes and crops (still.js verbs.distill's target-item step). */
  pickerChoices(target, verbId, engine) {
    if (verbId !== 'lay' || !view || target !== view.target) return null;
    return choices(engine);
  },

  pickerTakesCount(target, verbId) {
    return verbId === 'lay' && view && target === view.target ? false : null;
  },

  /**
   * The table under a world point for a dragged dish or crop (world-drop-feature overAt asks it first):
   * a street Piggy or a Chicken standing in front of the table never takes a drop meant for it.
   */
  dropTargetAt(x, y, cls, engine) {
    if (!view || view.root.destroyed || !kindOf(cls)) return null;
    const reach = view.half + view.w / 2;
    const top = view.root.y - view.h - 30;
    return Math.abs(x - view.root.x) <= reach && y >= top && y <= view.root.y + 6 ? view.target : null;
  },

  /** js/world-drop.js lay_feast: a dish or crop dragged onto the table. */
  feastTakes(target, cls, engine) {
    if (!view || target !== view.target) return null;
    return Boolean(kindOf(cls)) && countItem(engine.inv, cls) > 0;
  },

  /** G1009: the solo table's lays this season by class, the feast's pool (feast-day-feature); null online. */
  feastLayCounts(engine) {
    return engine?.mode === 'multiplayer' ? null : { ...(table.counts || {}) };
  },

  /** G1009: the feast changed: the table's card says the servings left again. */
  feastTableRedraw(engine) {
    if (!view) return null;
    view.target.subtitle = tableSubtitle(engine, shownTable().total);
    return true;
  },

  /** The quest's card in the log while it runs, and after (the Done tab). */
  questLogCards() {
    return questCard();
  },

  /**
   * VERBS pins: the quest's title and steps for the tracker under the left pill and its card's head,
   * while it runs this season; null for another id, once done or out of season (the pin goes).
   */
  questPinInfo(id) {
    return String(id || '') === QUEST.id ? questPinInfo(quest, seasonOn()) : null;
  },

  save() {
    return { table: engineRef?.mode === 'multiplayer' ? undefined : table, quest, laidTotal, told };
  },

  restore(slice, engine) {
    const s = slice && typeof slice === 'object' ? slice : {};
    table = createTableState(s.table || {});
    quest = createQuestState(s.quest || {});
    laidTotal = Math.max(0, Math.floor(Number(s.laidTotal) || 0));
    told = s.told && typeof s.told === 'object' ? { season: String(s.told.season || ''), feast: String(s.told.feast || '') } : {};
    if (engine) {
      refreshSeason(engine, true);
      publish(engine);
    }
  },
};
