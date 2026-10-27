/**
 * What else is on a real player's home street and in their house in
 * multiplayer (lane HOMES3, registers G328 and G332): the signpost with
 * friends' homes on its arms, Note Poles, furniture for sale and the Pile of
 * Currants a sale leaves, and restoring a friend's worn-out cultivations
 * together. The pure rules and the copy; the feature is
 * js/features/home-street-mp-feature.js, the site's routes are
 * groddle-afternoon-site src/HomeSignpost.php, HomeStreet.php and
 * LedgerFurniture.php, the realtime server's homes_street.go and
 * home_projects.go.
 *
 * Sources (GameServerJS, CC0): locations/home.js addNeighbor 222-256,
 * updateNeighborSignpost 287-327 and achievements/good_neighbour.js; the
 * client's SignpostDialog.as; items/note_pole.js and catalog_recipes.js
 * 303; furniture_base (items/furniture_bed.js 92-191, 344-375, 481-645) and
 * items/pile_of_currants.js; players/inc_jobs.js 420-470 and
 * achievements/philanthropic_member_of_the_social_construct.js.
 *
 * Solo never loads any of this.
 */

import { possessive } from './neighbours-mp.js?v=g328-4';

export const HOME_STREET_MP_ID = 'home-street-mp';

/** locations/home.js:226: positions 0-4. */
export const SIGNPOST_ARMS = 5;
/** achievements/good_neighbour.js condition 766: signpost:num_neighbors 5. */
export const GOOD_NEIGHBOUR_COUNTER = 'signpost:num_neighbors';
export const GOOD_NEIGHBOUR_AT = 5;
export const PHILANTHROPIC_BADGE = 'philanthropic_member_of_the_social_construct';

export const NOTE_POLE_CLASS = 'note_pole';
export const PILE_CLASS = 'pile_of_currants';
/** items/note_pole.js instancePropsChoices 33-38 and the defaults 22-25. */
export const POLE_SIZES = Object.freeze(['Tall', 'Medium', 'Short']);
export const POLE_STYLES = 10;
export const POLE_SIGNS = 9;
export const POLE_DEFAULT = Object.freeze({ size: 'Tall', pole: '1', sign: '1' });
/** note_pole.js onInputBoxResponse 342-343. */
export const POLE_TITLE_MAX = 150;
export const POLE_BODY_MAX = 1000;
/** Ours: poles one home keeps (the site reads at most this many). */
export const POLES_MAX = 24;

/** furniture_bed.js:154 input_max_chars 6. */
export const PRICE_MAX = 999999;
/** canSell 400-405. */
export const UNSELLABLE = Object.freeze(['furniture_chassis', 'furniture_tower_chassis', 'furniture_door']);

/** items/catalog_recipes.js recipes["303"] (6339-6360), in recipes.json's shape. */
export const NOTE_POLE_RECIPE = Object.freeze({
  id: '303',
  name: 'Note Pole',
  tool: 'construction_tool',
  energyCost: 50,
  xpReward: 24,
  waitMs: 3000,
  inputs: [
    { classTsid: 'wood_post', qty: 1 },
    { classTsid: 'metal_rod', qty: 2 },
    { classTsid: 'snail', qty: 4 },
    { classTsid: 'plank', qty: 2 },
  ],
  outputs: [{ classTsid: 'note_pole', qty: 1 }],
  skill: 'furnituremaking_1',
  skills: ['furnituremaking_1'],
  achievements: [],
  toolWear: 2,
  taskLimit: 20,
  learnt: 1,
  source: 'catalog_recipes.js recipes["303"] (multiplayer only: home-street-mp-feature)',
});

/** items/note_pole.js (label, description, base_cost, stackmax). */
export const NOTE_POLE_ITEM = Object.freeze({
  label: 'Note Pole',
  namePlural: 'Note Poles',
  desc: "I'm a little note pole which you can customize to your heart's desire and then place in your yard or your house. Post a note on me to amuse, astonish or edify your visitors.",
  baseCost: 600,
  stackMax: 1,
});

export const HOME_STREET_TEXT = Object.freeze({
  // SignpostDialog.as 85, 37, 541; main.js 6974, 6979, 6987.
  signpost: 'Signpost',
  editTitle: 'Edit your signpost',
  emptyArm: 'Click to add a friend',
  removeConfirm: (name) => `Are you sure you want to remove ${name} from your signpost?`,
  notAtHome: 'You are not at home',
  couldNotAdd: 'Could not add neighbor',
  yes: 'Yes',
  no: 'No',
  // Ours: the verbs and the dialog's plain words.
  goVerb: (name) => `Go to ${possessive(name)} Home Street`,
  editVerb: 'Edit your signpost',
  editTip: "Put your friends' homes on your signpost",
  chooseFriend: 'Choose a friend for this arm:',
  noFriends: 'Add some friends first (Menu, Buddies), then you can put their homes on your signpost.',
  remove: 'Remove',
  done: 'Done',
  noArms: "Nobody's home is on this signpost yet.",
  // note_pole.js verbs, conditions and readHelper.
  pole: 'Note Pole',
  readVerb: 'read',
  readTip: 'What does it say?',
  postVerb: 'post',
  postTip: 'Post a note',
  customizeVerb: 'customize',
  customizeTip: 'Make it your own',
  pickupVerb: 'pick up',
  pickupTip: 'Put it in your pack',
  placeVerb: 'place',
  placeTip: 'Put it here',
  nothingPosted: 'Nothing has been posted',
  noNotes: "You don't have any notes.",
  placeHome: 'Note Poles can only be placed at home.',
  notYours: 'This is not your note',
  aNote: 'A note!',
  posted: (title) => `You posted ${title ? `"${title}"` : 'a note'} on your Note Pole.`,
  backInPack: 'The note that was there went back in your pack.',
  // NoteView "Customize" (itemstack_config_start), in plain words: the config option names (note_pole.as 16-20).
  customizeTitle: 'Customize your Note Pole',
  poleLabel: 'Pole',
  signLabel: 'Sign',
  sizeLabel: 'Size',
  save: 'Save',
  cancel: 'Cancel',
  // furniture_bed.js 92-191, 344-375, 511-645.
  setPriceVerb: 'set sale price',
  setPriceTip: 'Start selling it',
  editPriceVerb: 'edit sale price',
  editPriceTip: 'Change the sale price',
  dontSellVerb: "don't sell",
  dontSellTip: 'Stop selling it',
  buyVerb: 'buy',
  buyTip: (price) => `Buy it for ${formatCurrants(price)}c`,
  priceTitle: 'Price',
  setPrice: 'Set price',
  stopFirst: 'You have to stop selling it first.',
  stopped: (label) => `You stopped selling a ${label}.`,
  forSale: (label, price) => `Your ${label} is for sale for ${currants(price)}.`,
  buying: (label) => `Buying ${label}`,
  buyConfirm: (label, price) => `Buy the ${label} for ${currants(price)}?`,
  buy: 'Buy',
  bought: (label, owner) => `You bought ${possessive(owner)} ${label}.`,
  soldToYou: (buyer, label, price) => `${buyer} just bought your ${label} for ${currants(price)}.`,
  afford: "Sorry, you can't afford that.",
  // items/pile_of_currants.js collect, onConversation, onPlayerCollision.
  pile: 'Pile of Currants',
  collectVerb: 'collect',
  collectTip: 'Add to your currants balance',
  pileSource: (buyer, label) => `${buyer} purchasing your ${label}`,
  pileHere: (n, source) => `Here ${n === 1 ? 'is' : 'are'} ${currants(n)}${source ? ` from ${source}` : ''}.`,
  pileCollected: (n, source) => `You collected ${currants(n)}.${source ? ` (From ${source})` : ''}`,
  pileBump: (n, source) => `I have ${currants(n)}${source ? ` from ${source}` : ''}!`,
  ok: 'OK',
  // players/inc_jobs.js 444-457: where a restoration is.
  restorePlace: (name, yard) => (yard === 'back' ? `in ${possessive(name)} yard` : `on ${possessive(name)} home street`),
  restoreKicker: (name, yard) => (yard === 'back' ? `${possessive(name)} yard` : `${possessive(name)} home street`),
  restoreVerb: 'restore',
  restoreTip: 'Start a project to restore it',
  wornOut: 'Worn out · help restore it',
  offline: 'You are offline right now.',
  failed: "That didn't work. Try again in a moment.",
});

/** utils.number_format. */
export function formatCurrants(n) {
  return Math.max(0, Math.floor(Number(n) || 0)).toLocaleString('en-US');
}

/** pluralize(n, 'currant', 'currants'). */
export function currants(n) {
  const k = Math.max(0, Math.floor(Number(n) || 0));
  return `${formatCurrants(k)} ${k === 1 ? 'currant' : 'currants'}`;
}

const whole = (v, d = 0) => (Number.isFinite(Number(v)) ? Math.floor(Number(v)) : d);
const clip = (s, n) => String(s ?? '').replace(/<[^>]*>/g, '').slice(0, n);

// —— The signpost ——

/** The five arms in order: { position, id, name } or null for an empty one. */
export function signpostArms(neighbors = []) {
  const arms = Array(SIGNPOST_ARMS).fill(null);
  for (const n of Array.isArray(neighbors) ? neighbors : []) {
    const p = whole(n?.position, -1);
    const id = whole(n?.id);
    if (p < 0 || p >= SIGNPOST_ARMS || id <= 0) continue;
    arms[p] = { position: p, id, name: clip(n.name, 40) || 'A friend' };
  }
  return arms;
}

/** Buddies not on the post already: the ones an arm can take. */
export function signpostCandidates(buddies = [], neighbors = []) {
  const on = new Set((Array.isArray(neighbors) ? neighbors : []).map((n) => whole(n?.id)));
  return (Array.isArray(buddies) ? buddies : [])
    .map((b) => ({ id: whole(b?.id), name: clip(b?.name, 40) }))
    .filter((b) => b.id > 0 && b.name && !on.has(b.id))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// —— Note Poles ——

export function poleConfig(cfg = {}) {
  const size = POLE_SIZES.includes(cfg?.size) ? cfg.size : POLE_DEFAULT.size;
  const pole = Math.max(1, Math.min(POLE_STYLES, whole(cfg?.pole, 1)));
  const sign = Math.max(1, Math.min(POLE_SIGNS, whole(cfg?.sign, 1)));
  return { size, pole: String(pole), sign: String(sign) };
}

export function normalizePoleNote(note) {
  if (!note || typeof note !== 'object') return null;
  const body = String(note.body ?? '').replace(/<[^>]*>/g, '').slice(0, POLE_BODY_MAX);
  const title = clip(note.title, POLE_TITLE_MAX).replace(/\s+/g, ' ').trim();
  if (!body && !title) return null;
  const by = note.by && typeof note.by === 'object' ? { id: Math.max(0, whole(note.by.id)), name: clip(note.by.name, 40) } : { id: 0, name: '' };
  return { title, body, by, at: Math.max(0, whole(note.at)) };
}

/** A pole as the save keeps it: id, room (street | house), rx (x from the house), cfg, note. */
export function normalizePole(row) {
  if (!row || typeof row !== 'object') return null;
  const id = whole(row.id);
  const rx = Number(row.rx);
  if (id <= 0 || !Number.isFinite(rx)) return null;
  return { id, room: row.room === 'house' ? 'house' : 'street', rx: Math.round(rx), cfg: poleConfig(row.cfg), note: normalizePoleNote(row.note) };
}

export function normalizeHomeStreetSlice(slice) {
  const poles = [];
  const seen = new Set();
  for (const row of Array.isArray(slice?.poles) ? slice.poles : []) {
    const p = normalizePole(row);
    if (!p || seen.has(p.id) || poles.length >= POLES_MAX) continue;
    seen.add(p.id);
    poles.push(p);
  }
  const maxId = poles.reduce((m, p) => Math.max(m, p.id), 0);
  const sold = (Array.isArray(slice?.sold) ? slice.sold : []).filter((op) => /^furn-[0-9a-f]{16}$/.test(String(op))).slice(-SOLD_KEEP);
  return { poles, nextPole: Math.max(maxId + 1, whole(slice?.nextPole, 1)), five: slice?.five === true, sold };
}

/** Sales of mine this save has applied (the piece taken out of the house), newest last. */
export const SOLD_KEEP = 64;

/** Remember a sale as applied; false when it was already. */
export function noteSold(slice, op) {
  if (!slice || slice.sold.includes(op)) return false;
  slice.sold = [...slice.sold, op].slice(-SOLD_KEEP);
  return true;
}

/** note_pole.js read_oneclick / read conditions: the owner reads with read, everyone else with one click. */
export function poleVerbs({ owner = false, hasNote = false, notes = 0 } = {}) {
  const T = HOME_STREET_TEXT;
  const read = { id: 'pole_read', label: T.readVerb, tooltip: T.readTip, enabled: hasNote, reason: hasNote ? '' : T.nothingPosted, primary: true };
  if (!owner) return [read];
  return [
    read,
    { id: 'pole_post', label: T.postVerb, tooltip: T.postTip, enabled: notes > 0, reason: notes > 0 ? '' : T.noNotes },
    { id: 'pole_customize', label: T.customizeVerb, tooltip: T.customizeTip, enabled: true, reason: '' },
    { id: 'pole_pickup', label: T.pickupVerb, tooltip: T.pickupTip, enabled: true, reason: '' },
  ];
}

/**
 * Where each part of a pole goes, from its base (the drawn pole's bottom,
 * centred): note_pole.as initializehead puts pole<Size>_<n> in
 * poleContainer_mc, sign_<n> and signNote_<n> at y 8/64/129.
 * art: js/note-pole-art.js ({ parts, containers, signY }).
 */
export function poleLayout(cfg, hasNote, art) {
  const c = poleConfig(cfg);
  const parts = art?.parts || {};
  const cont = art?.containers || { pole: [0, 0], sign: [0, 0], note: [0, 0] };
  const signY = art?.signY?.[c.size] ?? 8;
  const out = [];
  const add = (name, at, x, y) => {
    const p = parts[name];
    if (!p) return;
    out.push({ name, file: p[0], x: at[0] + x + p[1], y: at[1] + y + p[2], w: p[3], h: p[4] });
  };
  add(`pole${c.size}_${c.pole}`, cont.pole, 0, 0);
  add(`sign_${c.sign}`, cont.sign, 0, signY - cont.sign[1]);
  if (hasNote) add(`signNote_${c.sign}`, cont.note, 0, signY - cont.note[1]);
  const pole = out[0];
  if (!pole) return [];
  const baseX = pole.x + pole.w / 2;
  const baseY = pole.y + pole.h;
  return out.map((p) => ({ ...p, x: +(p.x - baseX).toFixed(2), y: +(p.y - baseY).toFixed(2) }));
}

// —— Furniture for sale ——

export function canSellClass(cls) {
  return typeof cls === 'string' && /^(furniture_|bag_furniture_)/.test(cls) && !UNSELLABLE.includes(cls);
}

/** A price as the site takes it: whole currants 0..999999 (0 stops the sale), or null. */
export function parsePrice(text) {
  const digits = String(text ?? '').replace(/[^0-9]/g, '').slice(0, 6);
  if (!digits) return null;
  const n = Number(digits);
  return Number.isInteger(n) && n >= 0 && n <= PRICE_MAX ? n : null;
}

/** furniture_base set_sale_price / edit_sale_price / dont_sell for the owner, buy for anyone else. */
export function saleVerbs({ owner = false, listing = null } = {}) {
  const T = HOME_STREET_TEXT;
  if (!owner) {
    if (!listing) return [];
    return [{ id: 'furn_buy', label: T.buyVerb, tooltip: T.buyTip(listing.price), enabled: true, reason: '', primary: true }];
  }
  if (!listing) return [{ id: 'furn_set_price', label: T.setPriceVerb, tooltip: T.setPriceTip, enabled: true, reason: '' }];
  return [
    { id: 'furn_edit_price', label: T.editPriceVerb, tooltip: T.editPriceTip, enabled: true, reason: '' },
    { id: 'furn_dont_sell', label: T.dontSellVerb, tooltip: T.dontSellTip, enabled: true, reason: '' },
  ];
}

export function normalizeListings(list) {
  const out = new Map();
  for (const l of Array.isArray(list) ? list : []) {
    const uid = whole(l?.uid);
    const price = whole(l?.price);
    if (uid <= 0 || price <= 0 || price > PRICE_MAX || !/^furn-[0-9a-f]{16}$/.test(String(l?.op || ''))) continue;
    out.set(uid, { op: String(l.op), uid, class: String(l.class || ''), price });
  }
  return out;
}

export function normalizePiles(list) {
  const out = [];
  for (const p of Array.isArray(list) ? list : []) {
    if (!/^furn-[0-9a-f]{16}$/.test(String(p?.op || ''))) continue;
    out.push({
      op: String(p.op),
      uid: whole(p.uid),
      class: String(p.class || ''),
      price: Math.max(0, whole(p.price)),
      x: whole(p.x),
      buyer: { id: whole(p.buyer?.id), name: clip(p.buyer?.name, 40) || 'Someone' },
    });
  }
  return out;
}

// —— Restorations ——

/** HomeStreet.php restore: h (the home street) or y (the back yard), the owner, the item, its cycle, base 36. */
export function restoreWireId(ownerId, item, yard = 'street') {
  const o = whole(ownerId);
  const id = whole(item?.id);
  const cycle = Math.max(1, whole(item?.cycle, 1));
  if (o <= 0 || id <= 0) return '';
  const wire = `${yard === 'back' ? 'y' : 'h'}${o.toString(36)}-${id.toString(36)}-${cycle.toString(36)}`;
  return wire.length <= 16 ? wire : '';
}

/** { owner, item, cycle, yard } a wire id names, or null. */
export function readWireId(wire) {
  const m = /^([hy])([0-9a-z]{1,8})-([0-9a-z]{1,4})-([0-9a-z]{1,2})$/.exec(String(wire || ''));
  if (!m) return null;
  return { owner: parseInt(m[2], 36), item: parseInt(m[3], 36), cycle: parseInt(m[4], 36), yard: m[1] === 'y' ? 'back' : 'street' };
}

/** The site's restorations, cleaned: { job, proto, yard, item, cycle, mult, token }. */
export function normalizeRestores(list) {
  const out = [];
  for (const r of Array.isArray(list) ? list : []) {
    const parsed = readWireId(r?.job);
    if (!parsed || typeof r.token !== 'string' || !/^proto_[a-z_]+$/.test(String(r.proto || ''))) continue;
    out.push({ job: String(r.job), proto: String(r.proto), yard: parsed.yard, item: parsed.item, cycle: parsed.cycle, mult: Number(r.mult) || 1, token: r.token });
  }
  return out;
}

/** players/inc_jobs.js:459-463, as the realtime server marks it: someone else's restoration, over half of it. */
export function philanthropicReward(msg, me) {
  return Boolean(msg && msg.philanthropic === true && Number(msg.owner) > 0 && Number(msg.owner) !== Number(me) && Number(msg.share) > 0.5);
}
