/**
 * Neighbour home streets for the Visiting Stone (pure rules + authored data;
 * js/features/neighbours-feature.js builds the scenes).
 *
 * In Glitch a Visiting Stone's "visit" sent you to a random opted-in player's
 * home street (players/inc_visiting.js visiting_visit_random →
 * callbacks/player_random_go.php → houses_visit), and counted
 * `visit_random:<owner>`. The remake has no other players, so the stones send
 * you to a small set of named Glitch neighbours instead. Their home streets are
 * clean scenes built from recovered CC0 house and yard decos, each owner is
 * out (as owners usually were), and each leaves a note on the door and one
 * small thing to do: water a planter, take the porch gift, refill the
 * birdhouse, or light the lanterns. Doing it the first time brings a thank-you
 * letter by mail, and a note posted in their mailbox gets a reply.
 *
 * Opting in at a stone ("get visitors", which needs an unboxed Butler as
 * visiting_can_opt_in did) makes one neighbour drop by your own home street
 * each new game day. They hand the gift and their line to your Butler, as a
 * visiting player did with leave_package and leave_message (bag_butler.js),
 * and the Butler gives them to you ("packages" / "messages"). Without a Butler,
 * or when it can't carry any more, the visit arrives as a letter in the
 * mailbox. Thank-you letters and note replies come by post, so they stay mail.
 * Every reward and line here is remake design: the source had no solo
 * neighbours.
 */

export const NEIGHBOUR_SCENE_PREFIX = 'NB_';
export const NEIGHBOUR_SCENE = Object.freeze({ width: 2200, height: 700, groundY: 620 });
/** Letters arrive a little after the deed, like the mailbox's companion replies. */
export const LETTER_DELAY_MS = 20_000;
export const FIRST_VISIT_XP = 15;

/** One small job per home; rewards are remake design (no source equivalent). */
export const CHORES = Object.freeze({
  garden: Object.freeze({ id: 'tend', label: 'Tend', tooltip: 'Water the planter and pull the weeds', durationMs: 3000, energy: 3, mood: 6, xp: 8, done: 'Already tended today. The plants look smug.' }),
  gift: Object.freeze({ id: 'take_gift', label: 'Take the gift', tooltip: 'The tag says: For the next visitor!', durationMs: 0, energy: 0, mood: 3, xp: 4, done: 'You already took today\'s gift. Another one appears tomorrow.' }),
  birdhouse: Object.freeze({ id: 'refill', label: 'Refill', tooltip: 'Pour in a Grain for the birds', durationMs: 2000, energy: 0, mood: 8, xp: 10, needs: { classTsid: 'grain', count: 1 }, noItem: 'You need a Grain to refill the birdhouse.', done: 'The birds are full. They are pretending not to be.' }),
  lanterns: Object.freeze({ id: 'light', label: 'Light the lanterns', tooltip: 'So the owner can find the way home', durationMs: 2000, energy: 1, mood: 5, xp: 6, done: 'The lanterns are already glowing.' }),
});

const ITEM = (classTsid, count = 1) => Object.freeze({ classTsid, count });

/**
 * The neighbours. `house` is a recovered `door_asset_*` (or hut) deco: doorX
 * is the door's centre and saleX the centre of its painted For Sale sign, both
 * as fractions of the house width (-1: no sign). A bush (`cover`) is planted
 * over the sign and the neighbour's own mailbox stands beside it.
 */
export const NEIGHBOURS = Object.freeze([
  Object.freeze({
    id: 'dorrit',
    name: 'Dorrit Applewhistle',
    first: 'Dorrit',
    style: 'meadow',
    house: { path: 'door_asset_house_large_05', w: 830, h: 668, scale: 0.5, doorX: 0.5, saleX: 0.1, cover: { s: 'bush_1', scale: 0.72 } },
    props: ['bench', 'flower_bush_5', 'groddle_flower_2'],
    chore: 'garden',
    doorNote: { title: 'Back soon!', text: 'Gone to the Fruit Tree festival. If the tomatoes look thirsty, they are. Thank you, whoever you are!' },
    thanks: { text: 'Somebody watered my tomatoes! They have never looked so pleased with themselves. Please take one, they insisted.', attachment: ITEM('tomato', 3) },
    visitor: 'I popped by your home street while you were out. Your mailbox is very handsome. I left you a few cherries.',
    visitorGift: ITEM('cherry', 5),
  }),
  Object.freeze({
    id: 'pemberton',
    name: 'Pemberton Fizz',
    first: 'Pemberton',
    style: 'firebog',
    house: { path: 'door_asset_house_medium_03', w: 764, h: 586, scale: 0.58, doorX: 0.55, saleX: 0.13, cover: { s: 'heights_bush_1', scale: 0.62 } },
    props: ['mushrooms', 'lantern_stacked', 'underground_plant_1'],
    chore: 'gift',
    gifts: [ITEM('mushroom', 2), ITEM('honey', 1), ITEM('plum', 3), ITEM('bun', 1)],
    doorNote: { title: 'Out foraging', text: 'Left a little something on the porch for whoever wanders by. Don\'t tell the Rook.' },
    thanks: { text: 'You found my porch present! I do love it when somebody does. Here is a spare jar for the walk home.', attachment: ITEM('honey', 1) },
    visitor: 'Knock knock! Nobody home, so I left a mushroom on your step. It is a good mushroom. It has a nice attitude.',
    visitorGift: ITEM('mushroom', 2),
  }),
  Object.freeze({
    id: 'juniper',
    name: 'Juniper Quoinsworth',
    first: 'Juniper',
    style: 'uralia',
    house: { path: 'door_asset_house_large_01', w: 830, h: 668, scale: 0.5, doorX: 0.5, saleX: 0.1, cover: { s: 'bush_1', scale: 0.72 } },
    props: ['bling_birdhouse_1', 'purple_mushroom_3', 'plant_fern_2'],
    chore: 'birdhouse',
    doorNote: { title: 'An arrangement', text: 'The birds and I have an arrangement. I feed them, they sing. I\'m away, so if you could keep up my end of the bargain, they\'ll keep up theirs.' },
    thanks: { text: 'The birds told me everything. They sang about you all evening. That is the highest honour a bird can give. Some whortleberries, with thanks.', attachment: ITEM('whortleberry', 3) },
    visitor: 'I passed your home street on my walk and the birds there said hello. I left some grain, in case they visit you next.',
    visitorGift: ITEM('grain', 4),
  }),
  Object.freeze({
    id: 'hadwin',
    name: 'Old Hadwin Mossbottom',
    first: 'Hadwin',
    style: 'meadow',
    house: { path: 'door_asset_house_small_01', w: 684, h: 570, scale: 0.6, doorX: 0.54, saleX: 0.12, cover: { s: 'bush_1', scale: 0.8 } },
    props: ['lantern', 'bush_1', 'groddle_grass_1'],
    chore: 'lanterns',
    doorNote: { title: 'Probably napping', text: 'Fell asleep at the shrine again, probably. If it gets dark, light my lanterns so I can find my way home.' },
    thanks: { text: 'I woke up at the shrine and there was my house, glowing like a birthday cake. I found my way straight home. Have a bun, young one.', attachment: ITEM('bun', 2) },
    visitor: 'I came to visit and nodded off on your doorstep. Lovely doorstep. Very restful. I left you a potato for your trouble.',
    visitorGift: ITEM('potato', 1),
  }),
  Object.freeze({
    id: 'tamsin',
    name: 'Tamsin Gloam',
    first: 'Tamsin',
    style: 'firebog',
    house: { path: 'background_bottletree_hut', w: 474, h: 616, scale: 0.66, doorX: 0.53, saleX: -1, noteY: 0.6 },
    props: ['mushrooms', 'grass_solid', 'background_bottletree_silhouette'],
    chore: 'garden',
    doorNote: { title: 'Shh', text: 'The spores are sleeping. Please water them gently. They are grumpy when woken, but grumpier when dry.' },
    thanks: { text: 'My spores woke up happy, which has never once happened before. I don\'t know what you did. Please do it again. A mushroom for you.', attachment: ITEM('mushroom', 3) },
    visitor: 'I walked through your home street at dusk. It glows nicely. Mine glows more, but yours glows with heart. Here is a plum.',
    visitorGift: ITEM('plum', 2),
  }),
  Object.freeze({
    id: 'fenwick',
    name: 'Wobbly Fenwick',
    first: 'Fenwick',
    style: 'snow',
    house: { path: 'k03_gingerbreadhouse_01', w: 1180, h: 1278, scale: 0.3, doorX: 0.4, saleX: -1 },
    props: ['k03_snowman_01', 'k03_treegroup_01'],
    chore: 'gift',
    gifts: [ITEM('cloudberry', 3), ITEM('bun', 1), ITEM('coffee', 1)],
    doorNote: { title: 'Please do not nibble the house', text: 'Yes, the house is gingerbread. No, please do not nibble the corners. Have something from the porch instead!' },
    thanks: { text: 'You took a porch treat and left my corners alone. You are a true neighbour. A coffee, to keep you warm out there.', attachment: ITEM('coffee', 1) },
    visitor: 'I tried to visit, but your house was not made of anything edible, so I left right away. Kidding! I left you some cloudberries.',
    visitorGift: ITEM('cloudberry', 3),
  }),
]);

const BY_ID = new Map(NEIGHBOURS.map((n) => [n.id, n]));

/** GSJS name/plural/base cost/description for every item a neighbour gives. */
export const NEIGHBOUR_ITEMS = Object.freeze({
  tomato: { label: 'Tomato', namePlural: 'Tomatoes', baseCost: 5, desc: 'A ripe, heirloom-quality tomato.' },
  cherry: { label: 'Cherry', namePlural: 'Cherries', baseCost: 1, desc: 'A basic cherry, freshly picked from a Fruit Tree.' },
  mushroom: { label: 'Mushroom', namePlural: 'Mushrooms', baseCost: 3, desc: 'An unusually sporous mushroom.' },
  honey: { label: 'Honey', namePlural: 'Honey', baseCost: 4, desc: 'A brimful jar of raw golden honey.' },
  plum: { label: 'Plum', namePlural: 'Plums', baseCost: 3, desc: 'A plummy plum.' },
  bun: { label: 'Bun', namePlural: 'Buns', baseCost: 9, desc: 'A nice round bun.' },
  whortleberry: { label: 'Whortleberry', namePlural: 'Whortleberries', baseCost: 5, desc: 'A single delectable whortleberry.' },
  grain: { label: 'Grain', namePlural: 'Grains', baseCost: 1, desc: 'Some plain grain.' },
  potato: { label: 'Potato', namePlural: 'Potatoes', baseCost: 7, desc: 'A humble potato.' },
  cloudberry: { label: 'Cloudberry', namePlural: 'Cloudberries', baseCost: 2, desc: 'A pleasingly tart cloudberry.' },
  coffee: { label: 'Coffee', namePlural: 'Coffees', baseCost: 5, desc: 'A steaming mug of strong, life-affirming coffee.' },
});

export function neighbourById(id) {
  return BY_ID.get(String(id || '')) || null;
}

export function neighbourSceneTsid(id) {
  return `${NEIGHBOUR_SCENE_PREFIX}${id}`;
}

export function isNeighbourSceneTsid(tsid) {
  return String(tsid || '').startsWith(NEIGHBOUR_SCENE_PREFIX) && Boolean(neighbourById(String(tsid).slice(NEIGHBOUR_SCENE_PREFIX.length)));
}

export function neighbourFromScene(tsid) {
  return isNeighbourSceneTsid(tsid) ? neighbourById(String(tsid).slice(NEIGHBOUR_SCENE_PREFIX.length)) : null;
}

export function homeStreetLabel(neighbour) {
  return `${neighbour.name}'s Home Street`;
}

/** A random neighbour that is not the one just visited (rand in [0, 1)). */
export function pickNeighbour(rand = Math.random(), excludeId = '') {
  const pool = NEIGHBOURS.filter((n) => n.id !== excludeId);
  const r = Number.isFinite(rand) ? Math.min(0.999999, Math.max(0, rand)) : 0;
  return pool[Math.floor(r * pool.length)] || NEIGHBOURS[0];
}

function whole(value, max = Number.MAX_SAFE_INTEGER) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? Math.max(0, Math.min(max, n)) : 0;
}

function cleanMap(seed, valueOk) {
  const out = {};
  if (!seed || typeof seed !== 'object') return out;
  for (const [key, value] of Object.entries(seed)) {
    if (BY_ID.has(key) && valueOk(value)) out[key] = value;
  }
  return out;
}

function cleanReturn(seed) {
  if (!seed || typeof seed.tsid !== 'string' || !seed.tsid || isNeighbourSceneTsid(seed.tsid)) return null;
  return { tsid: seed.tsid, x: Number.isFinite(seed.x) ? seed.x : null, y: Number.isFinite(seed.y) ? seed.y : null };
}

export function normalizeNeighbourState(seed = {}) {
  return {
    visits: cleanMap(seed.visits, (v) => whole(v) > 0),
    chores: cleanMap(seed.chores, (v) => typeof v === 'string' && v.length > 0),
    thanked: cleanMap(seed.thanked, (v) => v === true),
    posted: cleanMap(seed.posted, (v) => typeof v === 'string' && v.length > 0),
    lastId: BY_ID.has(seed.lastId) ? seed.lastId : '',
    allowVisits: seed.allowVisits === true,
    lastVisitorDay: typeof seed.lastVisitorDay === 'string' ? seed.lastVisitorDay : '',
    returnTo: cleanReturn(seed.returnTo),
  };
}

/** Record an arrival; the first visit to each neighbour is worth a little iMG. */
export function recordVisit(state, neighbour) {
  const visits = whole(state.visits[neighbour.id]) + 1;
  state.visits[neighbour.id] = visits;
  state.lastId = neighbour.id;
  return { first: visits === 1, visits, xp: visits === 1 ? FIRST_VISIT_XP : 0, counter: `visit_random:${neighbour.id}` };
}

/** The porch gift rotates through the neighbour's list by game day. */
export function porchGift(neighbour, dayKey = '') {
  const list = neighbour?.gifts || [];
  if (!list.length) return null;
  let h = 0;
  for (const ch of String(dayKey)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return list[h % list.length];
}

/** The chore verb for this neighbour's one job (once per game day). */
export function choreVerb(state, neighbour, ctx = {}) {
  const chore = CHORES[neighbour.chore];
  if (!chore) return null;
  const base = { id: chore.id, label: chore.label, tooltip: chore.tooltip, durationMs: chore.durationMs, energy: chore.energy || 0 };
  if (state.chores[neighbour.id] === ctx.dayKey) return { ...base, enabled: false, reason: chore.done };
  if (chore.needs && whole(ctx.have?.[chore.needs.classTsid]) < chore.needs.count) {
    return { ...base, enabled: false, reason: chore.noItem };
  }
  if (chore.energy && whole(ctx.energy) < chore.energy) return { ...base, enabled: false, reason: "You don't have enough energy." };
  return { ...base, enabled: true, reason: '' };
}

/**
 * Do the chore: mutates pc (energy/mood/xp/imagination) and returns the items
 * to take and give, plus the thank-you letter on the first time ever.
 */
export function doChore(state, neighbour, pc, ctx = {}) {
  const verb = choreVerb(state, neighbour, ctx);
  if (!verb || !verb.enabled) return { ok: false, msg: verb?.reason || 'Nothing to do here.' };
  const chore = CHORES[neighbour.chore];
  state.chores[neighbour.id] = ctx.dayKey;
  const energy = Math.min(chore.energy || 0, whole(pc.energy));
  pc.energy = whole(pc.energy) - energy;
  const maxMood = Number.isFinite(pc.maxMood) ? pc.maxMood : 100;
  const before = whole(pc.mood);
  pc.mood = Math.min(maxMood, before + chore.mood);
  pc.xp = whole(pc.xp) + chore.xp;
  if (pc.imagination != null) pc.imagination = whole(pc.imagination) + chore.xp;
  const take = chore.needs ? [{ ...chore.needs }] : [];
  const give = neighbour.chore === 'gift' ? [porchGift(neighbour, ctx.dayKey)].filter(Boolean).map((g) => ({ ...g })) : [];
  let letter = null;
  if (!state.thanked[neighbour.id]) {
    state.thanked[neighbour.id] = true;
    letter = {
      sender: neighbour.name,
      text: neighbour.thanks.text,
      attachment: { ...neighbour.thanks.attachment },
      deliveryAt: whole(ctx.now) + LETTER_DELAY_MS,
    };
  }
  return { ok: true, chore, effects: { energy: -energy, mood: pc.mood - before, xp: chore.xp }, take, give, letter };
}

/** Posting a carried note in a neighbour's mailbox: one reply per game day. */
export function postNoteVerb(state, neighbour, ctx = {}) {
  const base = { id: 'post_note', label: 'Post a note', tooltip: `Leave ${neighbour.first} a note` };
  if (whole(ctx.carried) < 1) return { ...base, enabled: false, reason: 'You have no notes to post!' };
  if (state.posted[neighbour.id] === ctx.dayKey) return { ...base, enabled: false, reason: `${neighbour.first} hasn't read your last note yet.` };
  return { ...base, enabled: true, reason: '' };
}

export function postNoteReply(state, neighbour, note, ctx = {}) {
  state.posted[neighbour.id] = ctx.dayKey;
  const title = String(note?.title || note?.initialTitle || '').trim() || 'your note';
  const quoted = title.length > 44 ? `${title.slice(0, 43)}…` : title;
  return {
    sender: neighbour.name,
    text: `I found your note, “${quoted}”, in my mailbox when I got home. It made my whole day. Come by again soon!`,
    deliveryAt: whole(ctx.now) + LETTER_DELAY_MS,
  };
}

/**
 * Random visitors (get visitors): one neighbour drops by per new game day while
 * opted in and the player has a home. Returns the letter, or null; the
 * street-furniture feature hands it to the Butler (butlerApi.receiveVisitor)
 * before falling back to engine.deliverMail.
 */
export function visitorLetter(state, ctx = {}) {
  if (!state.allowVisits || !ctx.homeOwned || !ctx.dayKey || state.lastVisitorDay === ctx.dayKey) return null;
  state.lastVisitorDay = ctx.dayKey;
  let h = 0;
  for (const ch of String(ctx.dayKey)) h = (h * 33 + ch.charCodeAt(0)) >>> 0;
  const neighbour = NEIGHBOURS[h % NEIGHBOURS.length];
  return {
    neighbourId: neighbour.id,
    sender: neighbour.name,
    text: neighbour.visitor,
    attachment: { ...neighbour.visitorGift },
    deliveryAt: whole(ctx.now),
  };
}

// ---------------------------------------------------------------------------
// Scene layout (deterministic per neighbour)
// ---------------------------------------------------------------------------

export function hash01(seed) {
  let s = 2166136261;
  for (const ch of String(seed)) s = Math.imul(s ^ ch.charCodeAt(0), 16777619) >>> 0;
  return (s % 10000) / 10000;
}

/**
 * Where everything stands on the home street. The arrival stone is at the
 * left end ("dead-end locations"), the house a little right of centre.
 */
export function neighbourLayout(neighbour) {
  const { width, groundY } = NEIGHBOUR_SCENE;
  const h = neighbour.house;
  const houseW = h.w * h.scale;
  const houseX = Math.round(1250 + (hash01(`${neighbour.id}:house`) - 0.5) * 120);
  const left = houseX - houseW / 2;
  const right = houseX + houseW / 2;
  const doorX = Math.round(left + houseW * h.doorX);
  const coverX = h.saleX >= 0 ? Math.round(left + houseW * h.saleX) : null;
  const mailboxX = Math.round(coverX != null ? coverX - 90 : left - 60);
  const choreX = Math.round(right + 150 + hash01(`${neighbour.id}:chore`) * 60);
  return {
    width,
    groundY,
    stoneX: 180,
    spawnX: 300,
    houseX,
    houseW,
    doorX,
    coverX,
    mailboxX,
    choreX,
    benchX: Math.round(left - 300 - hash01(`${neighbour.id}:bench`) * 60),
    propSpots: [Math.round(left - 520), Math.round(right + 430), width - 170],
  };
}
