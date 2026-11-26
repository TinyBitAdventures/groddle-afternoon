/**
 * Giant Icons (js/giant-icons.js) as a feature module.
 *
 *  - Emblems in the pack: Iconize (11 of one Giant), Caress (+25 mood),
 *    Consider (+20 energy), Contemplate (+30 iMG), each once a game day.
 *  - Icons in the pack: Ruminate (mood), Revere (energy), Reflect (iMG), each
 *    once a game day and one of the Icon's 20 actions; Tithe (121 currants,
 *    +5 actions at 10 or fewer, doubles your next gift from it); Place.
 *  - Placed on a street, an Icon checks once a minute per Giant as you walk
 *    past and, 5% of the time, bestows Giant Love (mood, energy, iMG or
 *    favor) with the ICON_GIANT_LOVE sound and a heart burst; out of actions
 *    it asks for a tithe.
 *  - #697 (G1302, Austin: as Glitch): your home is a POL (locations/inc_pols.js
 *    731), so Place works on your home street, in your house and on a Tower
 *    floor with no "picked up by anyone" prompt (include/icon.js 27-45); it
 *    stands there, saved, and only you pick it up (canPickup 1-12); Ruminate,
 *    Revere and Reflect show on it (52, 118, 183), and it bestows as anywhere.
 *    Online, a visitor sees your Icons on your home street (in the house and
 *    on a Tower floor too for whoever may be there, G1018: the site's list with
 *    the visit, src/Neighbours.php iconRows, through neighbours-mp-feature
 *    homeVisitIcons) and may Ruminate, Revere and Reflect on them, once a game
 *    day per Icon class from their own save, the rewards theirs, and gets its
 *    bestowments from their own clock. What the source kept on the Icon is the
 *    Icon's, for everyone (Austin 2026-11-25: "match Glitch's shared use"):
 *    its actions (every use, by anyone, spends one) and its last tither (a
 *    visitor may Tithe it: the payer's currants, +5 actions, the payer's next
 *    use or bestowment doubled). An Icon in a home keeps its tither on itself
 *    (row.tither: a player's id, 0 solo). Online each use goes through the
 *    site (src/HomeIcons.php: one count, checked under a lock) and its proof
 *    through the realtime server (home_icon_tell, home_iconed) to the owner
 *    and everyone there; the owner's game reads its Icons' count from the site
 *    when it comes home (homeIcons). Every floor of the house is the house (R5,
 *    G1313): an upper floor's Icons are shared as the ground floor's. Public streets online stay refused (M20, G945). From level 10 it calls out and offers its
 *    recorded "Voices of the Giants" message (111 iMG) by the source's
 *    conversation rules, and a walk-in that brings an offer bestows nothing
 *    (include/icon.js 565-575, G214); Talk to then tells it (G202: the shared record,
 *    js/conversations.js, and features/conversations-feature.js, which owns
 *    the verb). Pick it back up any time.
 *  - The first Icon completes "Loyalty's Rich Reward" (icons_created, offered
 *    by the Magic Rock once a Giant has given you four emblems); Icons of
 *    all eleven Giants grant Giant Lover.
 *
 * QA: ?autostart=1&fresh=1&resetgame=1&questoffer=off&icondemo=1 grants 11
 *     Emblems of Alph, an Icon of Mab down to 3 actions, level 20 and 2,000
 *     currants. &iconautoplay=1 iconizes, caresses/considers/contemplates,
 *     ruminates/reveres/reflects, tithes the Mab icon, places the Alph icon,
 *     walks into it with the source testing flag (always bestows), waits for
 *     its conversation offer (that collision bestows nothing, G214), talks
 *     to it, answers every line, walks out and back in for a bestowment and
 *     picks it up (add &convo=dev for the source's dev-server offer rules, otherwise
 *     the offer waits 5 minutes after load and on donate_to_all_shrines).
 *     &iconautoplay=home with &homedemo=home (#697) places the Alph icon on your
 *     home street and ruminates on it there (canvas iconHere home:street).
 *     &icontesting=1 alone keeps placed icons in testing
 *     mode; &iconlover=1 adds 11 emblems of every Giant. Canvas: iconPack,
 *     iconPlaced, iconLast, iconBestowed, iconAutoplay, iconActions,
 *     iconOfferCollisions (walk-ins that offered instead of bestowing).
 */

import { addItem, countItem, ensureItem } from '../inventory.js?v=3be7988a';
import { getGameDayKey } from '../game-day.js?v=57fecfcb';
import { XP_FOR_LEVEL } from '../progression.js?v=05ff0260';
import { emblemCostFor } from '../shrines.js?v=48318bec';
import { giantDisplayName } from '../giant-names.js?v=0e295891';
import { landingY } from '../walk-surface.js?v=f21ce37b';
import {
  EMBLEM_VERBS,
  GIANT_ICON_DATA,
  GIANT_ICON_IDS,
  GIANT_LOVER,
  GIANT_LOVE_MS,
  ICON_VERBS,
  ICONIZE_COUNT,
  adoreCheck,
  adoreIcon,
  adoreShared,
  bestowCheck,
  bestowMessage,
  createIconState,
  emblemVerbCheck,
  giantForEmblem,
  giantForIcon,
  homePlaceKey,
  iconize,
  isHomePlaceKey,
  legacyIconTalks,
  pickUpIcon,
  placeIcon,
  rollIconDay,
  shiftHomeIcons,
  syncPackIcons,
  titheCheck,
  titheCost,
  titheIcon,
  titheMessage,
  useEmblem,
} from '../giant-icons.js?v=3f078775';
import { textureFromUrl } from '../textures.js?v=b8e38103';
import { playSheetOverlay } from '../overlay-art.js?v=e50bacca';
import { grantMoodXp } from '../mood-xp.js?v=e311b45c';
import { forceMetabolic, gainMetabolic } from '../metabolics.js?v=48f784bf';
import { CONVERSATION_RULES, adoptLegacyTalks, conversationRecord, hasCompleted, toldRecord } from '../conversations.js?v=7cbdfea4';
import { TELLERS } from '../conversations-data.js?v=f11b7e02';
import { itemZ } from '../item-bands.js?v=ec366be3';
import { publicStreet } from '../shared-street.js?v=dce5694b';
import { insideProof, readVisitScene } from '../neighbours-mp.js?v=83f2fdf4';
import { isHousePlace } from '../home-floors.js?v=444d18d7';
import { createMinnAccount } from '../minn-account.js?v=7e3d7279';
import { saveStore, savedThrough } from '../save-store.js?v=1ccb1d6b';
import { HOME_INTERIOR_TSID, HOME_STREET_TSID } from '../homes.js?v=dca6b2cd';
import { gnomePlaceFor, visitGnomePlace } from '../garden-gnome.js?v=73026b57';
import { homesFeature } from './homes-feature.js?v=5585ecdb';
import { standOnFeet } from '../sprite-feet.js?v=6358a697';

export const ICONS_FEATURE_ID = 'giant-icons';
const WORLD_ART = (iconClass) => `assets/sprites/giant-icons/${iconClass}.webp`;
const COLLIDE_W = 150; // apiSetHitBox(300, 250) is centred on the icon
const COLLIDE_H = 250;

let state = createIconState();
let last = '';
let views = [];
let fx = []; // playSheetOverlay handles (icon_giant_love)
let demoDone = false;
let autoplayAt = 0;
let autoplayStep = 0;
let autoplayLog = [];
let autoplayTalkUntil = 0;
/** Collisions that made a conversation offer instead of a bestowment (QA: iconOfferCollisions). */
let offerCollisions = 0;
/** #697: the home place whose Icons are drawn now (home:<place>, or visit:<owner>:<place>), or null. */
let drawnHome = null;
let homePollAt = 0;

const dayKey = () => getGameDayKey(Date.now());
const owned = (engine) => engine.pc?.imaginationUpgrades || [];
const level = (engine) => Math.max(1, Number(engine.pc?.level) || 1);
const ctxFor = (engine, pol = false) => ({ level: level(engine), upgrades: owned(engine), skills: engine.learnedSkills || [], pol, me: meId(engine) });

/* ------------------------------------------- #697: a home's Icons, shared online */

/** The places a visitor can reach, whose Icons the site keeps one count for (HomeIcons::act): every floor of the house too (R5, G1313). */
const SHARED_PLACE = { test: (place) => /^(street|tower:\d)$/.test(String(place || '')) || isHousePlace(place) };
/** { client, account, busy } online (the realtime client and the site), or null solo. */
let net = null;

/** Who you are: your player id online, 0 solo (a home Icon's tither). */
function meId(engine) {
  if (engine?.mode !== 'multiplayer') return 0;
  return Number(net?.client?.me?.id) || Number(globalThis.GRODDLE_MP_BOOT?.player?.id) || 0;
}

function online(engine) {
  if (engine?.mode !== 'multiplayer') return null;
  if (net) return net;
  if (typeof document === 'undefined') return null;
  const client = engine.query?.('realtimeClient');
  if (!client) return null;
  const boot = globalThis.GRODDLE_MP_BOOT || {};
  return wireNet(engine, client, createMinnAccount({ baseUri: document.baseURI, nonce: boot.nonce || '' }));
}

function wireNet(engine, client, account) {
  net = { client, account, busy: new Set(), synced: '' };
  client.on?.('msg:home_iconed', (msg) => heardIcon(engine, msg));
  // Back online: read my own Icons again on the next look.
  client.on?.('hello', () => {
    if (net) net.synced = '';
  });
  return net;
}

/** Where a drawn Icon's shared count is kept: { owner, place }, or null (solo, a public street). */
function sharedAt(engine, v) {
  if (!v?.home || !online(engine)) return null;
  const place = v.visit ? v.row.place : String(v.key).slice(HOME_PREFIX_LEN);
  if (!SHARED_PLACE.test(place)) return null;
  return { owner: v.visit ? v.visit.owner : meId(engine), place };
}
const HOME_PREFIX_LEN = homePlaceKey('x').length - 1;

/** A shared Icon's count and tither as the site or the realtime server says them. */
function setShared(v, icon) {
  if (!icon) return;
  if (Number.isFinite(Number(icon.actions ?? icon.n))) v.row.actions = Math.max(0, Math.floor(Number(icon.actions ?? icon.n)));
  const t = 'tither' in icon ? icon.tither : icon.t;
  if (Number.isInteger(t) && t > 0) v.row.tither = t;
  else delete v.row.tither;
  if (v.target) v.target.subtitle = subtitleFor(v.row, v.visit);
}

/**
 * One act on a shared Icon through the site (POST groddle/v1/homes/{owner}/icons). Your own Icon
 * just set down may not be in the stored save yet: write it and ask once more. Null when it could
 * not be asked (the reason said); else the site's answer, already laid on the Icon and told.
 */
async function siteAct(engine, v, act) {
  const n = online(engine);
  const at = sharedAt(engine, v);
  if (!n || !at || n.busy.has(v.row.id)) return null;
  n.busy.add(v.row.id);
  const ask = () => n.account.iconAct(at.owner, { icon: v.row.id, place: at.place, act }, v.visit && isHousePlace(at.place) ? insideProof(at.owner) : '');
  let res = null;
  try {
    try {
      res = await ask();
    } catch (err) {
      if (v.visit || err?.code !== 'groddle_icon_gone') throw err;
      engine.save?.();
      await savedThrough(saveStore);
      res = await ask();
    }
  } catch (err) {
    say(engine, err?.message || "The Icon can't be reached right now.", false);
    return null;
  } finally {
    n.busy.delete(v.row.id);
  }
  setShared(v, res?.icon);
  if (typeof res?.tell === 'string' && res.tell) n.client.send?.('home_icon_tell', { token: res.tell });
  if (!v.visit) engine.save?.();
  publish(engine);
  return res;
}

/** The view drawn for a shared Icon: yours by place and id, or one on the visit you are on. */
function sharedView(owner, place, id, engine) {
  return views.find((v) => v.home && v.row.id === id && (v.visit ? v.visit.owner === owner && v.row.place === place : owner === meId(engine) && v.key === homePlaceKey(place))) || null;
}

/** home_iconed (homes_help.go iconTell): someone used an Icon in a home: its new count. */
function heardIcon(engine, msg) {
  const owner = Number(msg?.owner) || 0;
  const a = msg?.act || {};
  const id = String(a.i || '');
  const place = String(a.pl || '');
  if (!owner || !id || !SHARED_PLACE.test(place)) return;
  if (owner === meId(engine)) {
    const row = (state.placed[homePlaceKey(place)] || []).find((r) => r.id === id);
    if (!row) return;
    setShared({ row, visit: null, target: sharedView(owner, place, id, engine)?.target }, a);
    engine.save?.();
  } else {
    const v = sharedView(owner, place, id, engine);
    if (v) setShared(v, a);
  }
  publish(engine);
}

/** Your own Icons' count as the site keeps it (the owner's catch-up: uses while you were away). */
async function syncOwn(engine) {
  const n = online(engine);
  if (!n?.account?.homeIcons) return;
  let answer;
  try {
    answer = await n.account.homeIcons();
  } catch (err) {
    console.warn('[giant-icons]', err?.message || err);
    return;
  }
  let changed = false;
  for (const icon of Array.isArray(answer?.icons) ? answer.icons : []) {
    const place = String(icon?.place || '');
    const row = (state.placed[homePlaceKey(place)] || []).find((r) => r.id === String(icon?.id || ''));
    if (!row) continue;
    const before = `${row.actions}:${row.tither ?? ''}`;
    setShared({ row, visit: null, target: sharedView(meId(engine), place, row.id, engine)?.target }, icon);
    if (`${row.actions}:${row.tither ?? ''}` !== before) changed = true;
  }
  if (changed) engine.save?.();
  publish(engine);
}

/**
 * #697: the place in your own home you stand in (street, house, house:<floor>, tower:<floor>: the
 * Garden Gnome's rule, js/garden-gnome.js gnomePlaceFor), or null: anywhere else, or online in
 * someone else's home.
 */
function homePlace(engine) {
  const tsid = engine.streetTsid;
  const home = engine.homeContext?.() || {};
  if (!home.inHome || engine.transientInstance?.()) return null;
  if (engine.mode === 'multiplayer' && readVisitScene(tsid)) return null;
  if (tsid !== HOME_STREET_TSID && tsid !== HOME_INTERIOR_TSID) return null;
  // The homes feature's scene names the floor; before it has one, the home's own room.
  const scene = homesFeature._state?.()?.scene || (home.room ? { room: home.room } : null);
  if (scene?.room === 'street' && tsid !== HOME_STREET_TSID) return null;
  if (scene?.room === 'interior' && tsid !== HOME_INTERIOR_TSID) return null;
  return gnomePlaceFor(scene, { inHome: true });
}

/** Where a placed Icon here is kept in the save: home:<place> at home, else the street's tsid. */
function placeKey(engine) {
  return homePlaceKey(homePlace(engine)) || engine.streetTsid;
}

/**
 * #697: the Icons to draw in a home room now: your own ({ key, own: true, rows }), or online on a
 * visit the owner's in the room you stand in ({ key: visit:<owner>:<place>, own: false, owner,
 * name, rows }); null anywhere else (a street's Icons are drawn on street entry).
 */
function homeShown(engine) {
  const place = homePlace(engine);
  if (place) {
    const key = homePlaceKey(place);
    return { key, own: true, rows: state.placed[key] || [] };
  }
  if (engine.mode !== 'multiplayer') return null;
  const scene = readVisitScene(engine.streetTsid);
  const there = visitGnomePlace(scene);
  if (!there) return null;
  const visit = engine.query?.('homeVisitIcons', engine);
  if (!visit || visit.owner !== scene.owner) return null;
  const rows = (Array.isArray(visit.icons) ? visit.icons : []).filter((r) => r.place === there);
  return { key: `visit:${visit.owner}:${there}`, own: false, owner: visit.owner, name: String(visit.name || 'someone'), rows };
}

function publish(engine) {
  if (!engine?.setData) return;
  const inv = engine.inv || {};
  engine.setData('iconPack', GIANT_ICON_IDS.filter((g) => countItem(inv, GIANT_ICON_DATA[g].iconClass) > 0).map((g) => `${g}:${(state.pack[g] || []).join('/')}`).join(',') || 'none');
  const here = drawnHome?.startsWith('visit:') ? views.filter((v) => v.visit).map((v) => v.row) : state.placed[drawnHome || engine.streetTsid] || [];
  engine.setData('iconPlaced', here.map((r) => `${r.giant}:${r.actions}`).join(',') || 'none');
  engine.setData('iconHere', drawnHome || '');
  engine.setData('iconLast', last || 'none');
  engine.setData('iconBestowed', String(state.bestowed));
  engine.setData('iconIconized', state.iconized.join(',') || 'none');
  const v = views[views.length - 1];
  engine.setData('iconSprite', v ? `${Math.round(v.sprite.x)},${Math.round(v.baseY)},${v.sprite.texture?.width || 0}x${v.sprite.texture?.height || 0},player=${Math.round(engine.player?.x || 0)},${Math.round(engine.player?.y || 0)}` : 'none');
}

/** "+25 mood", "+20 energy", "+30 iMG": what landed, for the popup (item.js transformEffects). */
function effectWords(effects) {
  return Object.entries(effects || {})
    .filter(([, v]) => Number(v))
    .map(([k, v]) => `${v > 0 ? '+' : ''}${v} ${k === 'xp' ? 'iMG' : k}`)
    .join(', ');
}

function say(engine, msg, ok = true, effects = null) {
  last = String(msg || '').trim();
  if (effects) engine.pushActivity?.({ base: last.replace(/\.$/, ''), effects });
  else engine.pushActivity?.(last);
  // Ticket 48: the popup says what you got, as the source's verb message did (item.js
  // buildVerbMessage 26-74: "You caressed an Emblem of Lem. +25 Mood"); nothing when nothing landed.
  const words = effects ? effectWords(effects) : '';
  engine.toast?.(words ? `${last} ${words}` : last, ok ? 2800 : 2400);
  engine.refreshPack?.();
  publish(engine);
}

/** Pay a metabolic/iMG reward the way other features do; returns what actually landed. */
function grant(engine, stat, amount) {
  const pc = engine.pc;
  if (stat === 'xp') {
    // include/icon.js 230, 455 and emblem_*.js: stats_add_xp(n, false) takes the mood bonus.
    const landed = grantMoodXp(pc, amount);
    engine.updateHud?.();
    return landed;
  }
  // Ticket 48: the real limits (metabolics_recalc_limits: mood shares the energy tank), and a gain
  // never lowers the stat: mood 134 with a +25 Caress was cut to the old fixed 100 (-34).
  // metabolics_add_mood / add_energy (inc_metabolics.js 40-98) add nothing while dead.
  const landed = gainMetabolic(pc, stat, amount);
  engine.updateHud?.();
  return Math.round(landed);
}

function grantFavor(engine, giant, amount) {
  const shrine = engine.shrineState;
  const favor = shrine?.favor || engine.pc?.giantFavor;
  if (!favor) return 0;
  const cap = shrine ? emblemCostFor(shrine, giant) : Infinity;
  const before = favor[giant] || 0;
  favor[giant] = Math.min(cap, before + amount);
  engine.updateHud?.();
  return Math.round(favor[giant] - before);
}

/* ---------------------------------------------------------- pack verbs */

function emblemPackVerbs(giant, engine) {
  const inv = engine.inv;
  const def = GIANT_ICON_DATA[giant];
  const rows = [];
  if (countItem(inv, def.emblemClass) >= ICONIZE_COUNT) {
    rows.push({ id: 'iconize', label: 'Iconize', enabled: true, tooltip: `Combine 11 Emblems of ${giantDisplayName(giant)} to form an Icon`, primary: true });
  }
  for (const [verb, v] of Object.entries(EMBLEM_VERBS)) {
    const check = emblemVerbCheck(state, giant, verb);
    rows.push({ id: verb, label: verb.charAt(0).toUpperCase() + verb.slice(1), enabled: check.ok, reason: check.msg || '', tooltip: v.tooltip });
  }
  return rows;
}

/** Place's refusals: one not on a street or at home, someone else's home, and (M20) one others share online. */
export const PLACE_TEXT = Object.freeze({
  notStreet: 'Icons can only be placed on a street or in your home.',
  // ours: icon_place_conditions hid Place in someone else's POL (state null); a disabled row says why.
  theirHome: 'You can only place an Icon in your own home.',
  // ours: a placed Icon is kept in your own save, so online others would never see or take it.
  shared: "Other players can't see a placed Icon yet, so it stays in your pack here.",
});

/**
 * Why Place is refused here, or ''. icon_place_conditions (include/icon.js 18-24) only refuses
 * someone else's POL, and on a public street icon_place warns "it can be picked up by anyone"
 * (icon.js 26-46, canPickup 1-12). Your own home is a POL (inc_pols.js 731): Place works there
 * with no prompt (#697). Online (audit M20, G945) a placed Icon on a street is still per player
 * (no realtime code holds it), so on a street others share it stays in the pack until the
 * server can share it; a place Glitch kept to one player is yours alone, so Place works there.
 */
function placeRefusal(engine) {
  if (homePlace(engine)) return '';
  if (engine.mode === 'multiplayer' && readVisitScene(engine.streetTsid)) return PLACE_TEXT.theirHome;
  if (engine.transientInstance?.() || engine.homeContext?.().inHome) return PLACE_TEXT.notStreet;
  if (engine.mode === 'multiplayer' && publicStreet(engine)) return PLACE_TEXT.shared;
  return '';
}

function iconPackVerbs(giant, engine) {
  syncPackIcons(state, engine.inv);
  const ctx = ctxFor(engine);
  const rows = [];
  const tithe = titheCheck(state, { giant }, { ...ctx, currants: engine.pc.currants });
  const cost = titheCost(ctx.level, ctx.upgrades);
  rows.push({ id: 'tithe', label: `Tithe ${cost}c`, enabled: tithe.ok, reason: tithe.msg || '', tooltip: `Insert ${cost} currants to support the Icon`, primary: tithe.ok });
  for (const [verb, v] of Object.entries(ICON_VERBS)) {
    const check = adoreCheck(state, { giant }, verb, ctx);
    rows.push({ id: verb, label: v.label, enabled: check.ok, reason: check.msg || '', tooltip: `${v.label}: ${v.stat === 'xp' ? 'iMG' : v.stat} from the Icon (${(state.pack[giant] || [])[0] ?? 0} actions left)` });
  }
  const refused = placeRefusal(engine);
  rows.push({ id: 'place', label: 'Place', enabled: !refused, reason: refused || PLACE_TEXT.notStreet, tooltip: 'Place this Icon on the ground' });
  return rows;
}

function runEmblemVerb(giant, verbId, engine) {
  if (verbId === 'iconize') {
    const res = iconize(state, engine.inv, giant);
    if (!res.ok) return say(engine, res.msg, false), true;
    engine.playSound?.('DONATION_RECIEVE_EMBLEM', { volume: 0.6 });
    say(engine, res.msg);
    // quests_inc_counter('icons_created') + achievements VERB:iconize.
    engine.achievement?.('icons_created', 1);
    engine.achievement?.(`VERB:iconize:${GIANT_ICON_DATA[giant].emblemClass}`, 1);
    if (res.giantLover) engine.grantAchievement?.(GIANT_LOVER);
    engine.save?.();
    return true;
  }
  const res = useEmblem(state, giant, verbId);
  if (!res.ok) return say(engine, res.msg, false), true;
  const actual = grant(engine, res.stat, res.amount);
  say(engine, res.msg, true, { [res.stat]: actual });
  engine.save?.();
  return true;
}

function runIconVerb(giant, verbId, engine, ref = { giant }) {
  const ctx = ctxFor(engine);
  if (verbId === 'tithe') {
    const res = titheIcon(state, ref, engine.pc, ctx);
    if (!res.ok) return say(engine, res.msg, false), true;
    engine.playSound?.('PAY_50_CURRANTS', { volume: 0.6 });
    say(engine, res.msg);
    engine.save?.();
    return true;
  }
  if (verbId === 'place') {
    const refused = placeRefusal(engine);
    if (refused) return say(engine, refused, false), true;
    const p = engine.player;
    const x = (p?.x || 0) + 70 * (p?.scale?.x < 0 ? -1 : 1);
    const y = landingY(engine.platforms, x, (p?.y || engine.groundY) - 40) ?? p?.y ?? engine.groundY;
    const key = placeKey(engine);
    const res = placeIcon(state, engine.inv, giant, key, x, y, { me: meId(engine) });
    if (!res.ok) return say(engine, res.msg, false), true;
    if (!isHomePlaceKey(key) || key === drawnHome) spawnIcon(engine, res.row, { key });
    engine.playSound?.('ITEM_DROP', { volume: 0.5 });
    say(engine, res.msg);
    engine.save?.();
    return true;
  }
  if (ICON_VERBS[verbId]) {
    const res = adoreIcon(state, ref, verbId, ref.pol ? { ...ctx, pol: true } : ctx);
    if (!res.ok) return say(engine, res.msg, false), true;
    const actual = grant(engine, res.stat, res.amount);
    say(engine, res.msg, true, { [res.stat]: actual });
    engine.save?.();
    return true;
  }
  return false;
}

function confirmPlace(giant, engine) {
  // icon_place on a public street: "it can be picked up by anyone. Proceed?"; in a POL
  // (your own home, #697) it is set down at once (takeable_drop, icon.js 42-44).
  const refused = placeRefusal(engine);
  if (refused) return say(engine, refused, false), true;
  if (engine.param?.('iconautoplay') || homePlace(engine)) return runIconVerb(giant, 'place', engine);
  engine.offerQuestDialogue?.({
    title: GIANT_ICON_DATA[giant].label,
    kicker: 'Place',
    beats: [{ text: 'If you place this icon here, it can be picked up by anyone. Proceed?', response: 'Yes' }],
    acceptLabel: 'Yes',
    declineLabel: 'No',
    onAccept: () => runIconVerb(giant, 'place', engine),
  });
  return true;
}

/* -------------------------------------------------------------- world */

/** The line under a placed Icon's name. */
const subtitleFor = (row, visit) => `${visit ? `${visit.name}'s Icon. ` : ''}${row.actions > 0 ? `${row.actions} actions before a tithe` : 'A tithe is due'}`;

/**
 * Draws a placed Icon. key: where it is kept (a street tsid, or home:<place> in your own home);
 * visit: { owner, name } for someone else's Icon on a visit (#697), kept in their save.
 */
function spawnIcon(engine, row, { key = engine.streetTsid, visit = null } = {}) {
  const { PIXI } = engine;
  const def = GIANT_ICON_DATA[row.giant];
  const spr = new PIXI.Sprite(textureFromUrl(WORLD_ART(def.iconClass)));
  standOnFeet(spr);
  spr.x = row.x;
  spr.y = row.y + 2;
  spr.zIndex = itemZ(def.iconClass, 2);
  spr._worldHitW = 90;
  spr._worldHitH = 110;
  engine.entityLayer.addChild(spr);
  const target = engine.register({
    classId: def.iconClass,
    featureId: ICONS_FEATURE_ID,
    label: def.label,
    subtitle: subtitleFor(row, visit),
    sprite: spr,
    iconId: row.id,
  });
  views.push({ row, sprite: spr, target, baseY: spr.y, t: Math.random() * 6, key, home: isHomePlaceKey(key) || Boolean(visit), visit });
  publish(engine);
}

function viewFor(target) {
  if (!target) return null;
  return views.find((v) => v.target === target) || views.find((v) => !v.visit && v.row.id === target.iconId) || null;
}

function dropView(engine, v) {
  engine.unregister?.(v.target);
  if (v.sprite && !v.sprite.destroyed) v.sprite.destroy();
  views = views.filter((x) => x !== v);
}

/** #697: the home room's Icons drawn again (a new room, or a visit's list came). */
function redrawHome(engine, here) {
  for (const v of views.filter((x) => x.home)) dropView(engine, v);
  drawnHome = here?.key || null;
  // Coming home online: the uses made while you were away (HomeIcons).
  if (here?.own && online(engine) && net.synced !== here.key) {
    net.synced = here.key;
    syncOwn(engine);
  }
  if (here && engine.PIXI && engine.entityLayer) {
    for (const row of here.rows) spawnIcon(engine, row, { key: here.key, visit: here.own ? null : { owner: here.owner, name: here.name } });
  }
  publish(engine);
}

/** A placed Icon's adoration ref: yours by id, or (a visit) the owner's row as it was shown, never changed here. */
function adoreRef(v) {
  return v.visit ? { row: { ...v.row }, owner: v.visit.owner, pol: true } : { placedId: v.row.id, pol: v.home };
}

/**
 * #697: a tithe, ruminate, revere or reflect on a shared Icon online: your own checks first (your
 * day's use, your level and currants, as the source checked the pc), then the site spends the
 * Icon's action (or adds its tithe) and says whether you were its last tither; then your reward.
 */
async function sharedVerb(engine, v, verbId) {
  const ctx = ctxFor(engine, true);
  const ref = adoreRef(v);
  if (verbId === 'tithe') {
    const check = titheCheck(state, v.visit ? ref : { placedId: v.row.id }, { ...ctx, currants: engine.pc.currants });
    if (!check.ok) return say(engine, check.msg, false);
    const res = await siteAct(engine, v, 'tithe');
    if (!res) return;
    if (!res.ok) return say(engine, res.text || '', false);
    engine.pc.currants = Math.max(0, (Number(engine.pc.currants) || 0) - check.cost);
    engine.playSound?.('PAY_50_CURRANTS', { volume: 0.6 });
    engine.updateHud?.();
    say(engine, titheMessage(v.row.giant, check.cost, true));
    engine.save?.();
    return;
  }
  const check = adoreCheck(state, ref, verbId, ctx);
  if (!check.ok) return say(engine, check.msg, false);
  const res = await siteAct(engine, v, verbId);
  if (!res) return;
  if (!res.ok) return say(engine, res.code === 'tithe_due' ? adoreCheck(state, adoreRef(v), verbId, ctx).msg || res.text : res.text, false);
  const out = adoreShared(state, v.row.giant, verbId, ctx, res.tither === true);
  const actual = grant(engine, out.stat, out.amount);
  say(engine, out.msg, true, { [out.stat]: actual });
  engine.save?.();
}

/**
 * showBonus (items/include/icon.js 585-600): pc_overlay icon_giant_love,
 * 300 x 300 (the 233 x 233 stage fitted), delta_y -30, 3.25 s: Tiny Speck's
 * own art (tools/overlay-art, G272), the "giant love" letters arcing over a
 * golden heart in a sunburst, following the avatar.
 */
const GIANT_LOVE_OVERLAY = Object.freeze({ key: 'icon_giant_love', wh: 300, dy: -30 });

function giantLoveFx(engine) {
  const p = engine.player;
  if (!engine.PIXI || !p || !engine.fxLayer) return;
  for (const old of fx) old.stop();
  const h = playSheetOverlay(engine.PIXI, GIANT_LOVE_OVERLAY.key, {
    layer: engine.fxLayer,
    at: () => ({ x: p.x, y: (p.y || engine.groundY) + GIANT_LOVE_OVERLAY.dy }),
    wh: GIANT_LOVE_OVERLAY.wh,
    durationMs: GIANT_LOVE_MS,
    loop: false,
  });
  fx = [h];
  h.done.then(() => { fx = fx.filter((x) => x !== h); });
}

function bestowFor(engine, view, now) {
  const shrine = engine.shrineState;
  const giant = view.row.giant;
  const favorGiant = giant;
  const res = bestowCheck(state, view.row, {
    // #697: an Icon in a home keeps its last tither on itself.
    shared: view.home,
    me: meId(engine),
    now,
    level: level(engine),
    skills: engine.learnedSkills || [],
    upgrades: owned(engine),
    favor: shrine?.favor?.[favorGiant] || engine.pc?.giantFavor?.[favorGiant] || 0,
    favorMax: shrine ? emblemCostFor(shrine, favorGiant) : 1000,
    testing: engine.param?.('icontesting') === '1' || view.testing === true,
  });
  if (!res) return;
  if (res.kind === 'tithe') {
    engine.say?.(view.target, res.bubble, 4000);
    return;
  }
  engine.setData?.('iconRoll', `${res.roll}/${10 * res.chance}`);
  if (res.kind !== 'bestow') return;
  // The last tither's double is the Icon's to spend (icon.js 401-480: this.tither = null): solo at
  // once, online through the site, which says whether someone else tithed since.
  if (view.home && res.tither) {
    if (sharedAt(engine, view)) {
      siteAct(engine, view, 'bestow').then((r) => payBestow(engine, view, res, r?.ok ? res.amount : res.fallback));
      return;
    }
    delete view.row.tither;
  }
  payBestow(engine, view, res, res.amount);
}

function payBestow(engine, view, res, amount) {
  engine.playSound?.('ICON_GIANT_LOVE', { volume: 0.7 });
  giantLoveFx(engine);
  const actual = res.type === 'favor' ? grantFavor(engine, res.favorGiant, amount) : grant(engine, res.type, amount);
  say(engine, bestowMessage(view.row.giant, res.type, actual));
  engine.save?.();
}

/* --------------------------------------------------------------- QA */

function demoSetup(engine) {
  const demo = engine.param?.('icondemo');
  if (demoDone || !demo) return;
  demoDone = true;
  const pc = engine.pc;
  const lvl = Math.max(20, Number(engine.param('iconlevel')) || 20);
  pc.xp = Math.max(Number(pc.xp) || 0, XP_FOR_LEVEL[Math.min(XP_FOR_LEVEL.length, lvl) - 2] || 0);
  pc.level = lvl;
  pc.currants = Math.max(pc.currants || 0, 2000);
  forceMetabolic(pc, 'mood', Math.min(pc.mood || 0, 40));
  forceMetabolic(pc, 'energy', Math.min(pc.energy || 0, 60));
  const inv = engine.inv;
  const need = (id, n) => {
    if (countItem(inv, id) < n) addItem(inv, id, n - countItem(inv, id));
  };
  need('emblem_alph', ICONIZE_COUNT);
  if (engine.param('iconlover')) for (const g of GIANT_ICON_IDS) need(GIANT_ICON_DATA[g].emblemClass, ICONIZE_COUNT);
  if (countItem(inv, 'icon_mab') < 1) {
    addItem(inv, 'icon_mab', 1);
    syncPackIcons(state, inv);
    state.pack.mab[state.pack.mab.length - 1] = 3;
  }
  syncPackIcons(state, inv);
  engine.updateHud?.();
  if (engine.param('iconautoplay')) autoplayAt = Date.now() + 1500;
  publish(engine);
}

/** #697 QA (&iconautoplay=home, with &homedemo=home): place at home, ruminate on it there, keep it. */
const AUTOPLAY_HOME = [
  ['pack', 'emblem_alph', 'iconize'],
  ['pack', 'icon_alph', 'place'],
  ['placed', 'ruminate'],
];

const AUTOPLAY = [
  ['pack', 'emblem_alph', 'iconize'],
  ['pack', 'icon_alph', 'ruminate'],
  ['pack', 'icon_alph', 'revere'],
  ['pack', 'icon_alph', 'reflect'],
  ['pack', 'icon_mab', 'tithe'],
  ['pack', 'icon_mab', 'ruminate'],
  ['pack', 'icon_alph', 'place'],
  ['walk'],
  ['wait'],
  ['talk'],
  ['answer'],
  // G214: the walk-in that brought the offer bestowed nothing; walk out and in again for one.
  ['away'],
  ['walk'],
  ['wait'],
  ['pick'],
];

function autoplay(engine, now) {
  const step = (engine.param('iconautoplay') === 'home' ? AUTOPLAY_HOME : AUTOPLAY)[autoplayStep];
  if (!step) {
    engine.setData('iconAutoplay', 'done');
    engine.setData('iconSteps', autoplayLog.join('|'));
    autoplayAt = 0;
    return;
  }
  if (engine.param('iconautoplay') === 'place' && step[0] === 'walk') {
    autoplayStep = AUTOPLAY.length;
    return autoplay(engine, now);
  }
  autoplayStep += 1;
  autoplayAt = now + 900;
  if (step[0] === 'pack') {
    giantIconsFeature.runPackVerb(step[1], step[2], engine);
    autoplayLog.push(`${step[2]}:${last.slice(0, 28)}`);
    if (step[2] === 'iconize') {
      for (const v of Object.keys(EMBLEM_VERBS)) giantIconsFeature.runPackVerb('emblem_alph', v, engine);
    }
  } else if (step[0] === 'placed') {
    const v = views[views.length - 1];
    if (v) giantIconsFeature.runVerb(v.target, step[1], engine);
    autoplayLog.push(`${step[1]}:${v ? last.slice(0, 28) : 'none'}`);
  } else if (step[0] === 'walk') {
    const v = views[views.length - 1];
    if (v) {
      v.testing = true;
      engine.player.x = v.sprite.x - 20;
    }
    autoplayLog.push('walk');
  } else if (step[0] === 'away') {
    const v = views[views.length - 1];
    if (v) engine.player.x = v.sprite.x + 600;
    autoplayLog.push('away');
  } else if (step[0] === 'wait') {
    autoplayAt = now + 2500;
  } else if (step[0] === 'talk') {
    // The conversations feature offers on collision (its rules) and owns Talk to.
    const v = views[views.length - 1];
    const verb = v && (engine.targetVerbs?.(v.target) || []).find((r) => r.id === 'convo_talk');
    if (v && !verb && !autoplayTalkUntil) autoplayTalkUntil = now + 30_000;
    if (v && !verb && now < autoplayTalkUntil) {
      autoplayStep -= 1;
      autoplayAt = now + 500;
      return publish(engine);
    }
    if (verb) engine.beginVerb?.(v.target, verb);
    autoplayLog.push(verb ? 'talk' : 'talk:none');
    autoplayAt = now + 800;
  } else if (step[0] === 'answer') {
    if (engine.questDialogueOpen?.()) {
      if (typeof document !== 'undefined') document.getElementById('quest-dialogue-next')?.click();
      autoplayStep -= 1;
      autoplayAt = now + 500;
      return publish(engine);
    }
    const v = views[views.length - 1];
    const id = TELLERS[GIANT_ICON_DATA[v?.row.giant]?.iconClass]?.list[0];
    autoplayLog.push(`told:${id && hasCompleted(conversationRecord(), id) ? id : 'none'}`);
  } else if (step[0] === 'pick') {
    const v = views[views.length - 1];
    if (v && engine.param('iconautoplay') !== 'hold') giantIconsFeature.runVerb(v.target, 'pickup', engine);
    autoplayLog.push(`pick:${last.slice(0, 20)}`);
  }
  publish(engine);
}

/* ------------------------------------------------------------ feature */

export const giantIconsFeature = {
  id: ICONS_FEATURE_ID,

  init(engine) {
    for (const g of GIANT_ICON_IDS) {
      const def = GIANT_ICON_DATA[g];
      ensureItem(def.iconClass, {
        label: def.label,
        namePlural: def.namePlural,
        desc: def.desc,
        baseCost: 0,
        stackMax: 1,
        sellable: false,
        donatable: false,
        tags: ['no_rube', 'no_vendor', 'no_donate', 'icon', 'emblems_icons'],
      });
    }
    rollIconDay(state, dayKey());
    publish(engine);
  },

  onStreetEnter(street, engine) {
    rollIconDay(state, dayKey());
    syncPackIcons(state, engine.inv);
    demoSetup(engine);
    if (!engine.transientInstance?.()) for (const row of state.placed[engine.streetTsid] || []) spawnIcon(engine, row);
    publish(engine);
  },

  onStreetClear() {
    views = [];
    drawnHome = null;
    // Each way into a home room reads its Icons' count again (syncOwn).
    if (net) net.synced = '';
    for (const f of fx) f.stop();
    fx = [];
  },

  onNewDay() {
    rollIconDay(state, dayKey());
  },

  onTick(dtMs, now, engine) {
    // #697: a home scene runs no street hooks (game.js renderHomeScene), so the room's Icons are
    // drawn when the room changes, as the Garden Gnome's are.
    if (engine.started !== false && now - homePollAt >= 250) {
      homePollAt = now;
      const here = homeShown(engine);
      if (here) demoSetup(engine);
      if ((here?.key || null) !== drawnHome) redrawHome(engine, here);
    }
    if (autoplayAt && now >= autoplayAt) autoplay(engine, now);
    const p = engine.player;
    for (const v of views) {
      v.t += dtMs / 1000;
      v.sprite.y = v.baseY - 3 - Math.sin(v.t * 1.6) * 3;
      if (!p) continue;
      // include/icon.js onPlayerCollision 565-575: a conversation offer comes
      // first and returns, so that collision bestows nothing (G214). The
      // conversations feature keeps its own hit box and enter edge.
      if (engine.query?.('tellerCollision', v.target, engine) === true) {
        v.offered = true;
        offerCollisions += 1;
        engine.setData?.('iconOfferCollisions', String(offerCollisions));
      }
      const inside = Math.abs(p.x - v.sprite.x) <= COLLIDE_W && Math.abs((p.y || 0) - v.baseY) <= COLLIDE_H;
      // Leaving ends the collision; the next walk-in may bestow again.
      if (!inside) v.offered = false;
      if (!inside || v.offered || engine.busy?.()) continue;
      bestowFor(engine, v, now);
    }
  },

  packVerbs(classTsid, engine) {
    rollIconDay(state, dayKey());
    const emblem = giantForEmblem(classTsid);
    if (emblem) return emblemPackVerbs(emblem, engine);
    const icon = giantForIcon(classTsid);
    if (icon) return iconPackVerbs(icon, engine);
    return [];
  },

  runPackVerb(classTsid, verbId, engine) {
    rollIconDay(state, dayKey());
    const emblem = giantForEmblem(classTsid);
    if (emblem && (verbId === 'iconize' || EMBLEM_VERBS[verbId])) return runEmblemVerb(emblem, verbId, engine);
    const icon = giantForIcon(classTsid);
    if (!icon) return false;
    syncPackIcons(state, engine.inv);
    if (verbId === 'place') return confirmPlace(icon, engine);
    return runIconVerb(icon, verbId, engine);
  },

  verbsFor(target, engine) {
    const v = viewFor(target);
    if (!v) return [];
    const ctx = ctxFor(engine, v.home);
    const cost = titheCost(ctx.level, ctx.upgrades);
    // Talk to (verbs.talk_to, icon_alph.js 269-308) is added by the conversations feature while one is offered.
    const rows = [];
    // icon_tithe_conditions (240-262): anyone may tithe, a visitor too (#697: the Icon's count is shared).
    if (!v.visit || sharedAt(engine, v)) {
      const tithe = titheCheck(state, v.visit ? adoreRef(v) : { placedId: v.row.id }, { ...ctx, currants: engine.pc.currants });
      rows.push({ id: 'tithe', label: `Tithe ${cost}c`, enabled: tithe.ok, reason: tithe.msg || '', tooltip: `Insert ${cost} currants to support the Icon`, durationMs: 0 });
    }
    // In a POL (a home) ruminate / revere / reflect show on a placed Icon (icon.js 52, 118, 183); elsewhere state null.
    if (v.home) {
      for (const [verb, def] of Object.entries(ICON_VERBS)) {
        const check = adoreCheck(state, adoreRef(v), verb, ctx);
        if (check.hidden) continue;
        rows.push({ id: verb, label: def.label, enabled: check.ok, reason: check.msg || '', tooltip: `${def.label}: ${def.stat === 'xp' ? 'iMG' : def.stat} from the Icon`, durationMs: 0 });
      }
    }
    // canPickup (icon.js 1-12): in a POL only its owner picks it up.
    if (!v.visit) rows.push({ id: 'pickup', label: 'Pick up', enabled: true, tooltip: 'Put it in your pack', durationMs: 0 });
    return rows;
  },

  runVerb(target, verbId, engine) {
    const v = viewFor(target);
    if (!v) return false;
    if (verbId === 'pickup') {
      if (v.visit) return false;
      const res = pickUpIcon(state, engine.inv, v.key, v.row.id, { me: meId(engine) });
      if (res.ok) dropView(engine, v);
      say(engine, res.msg, res.ok);
      engine.save?.();
      return true;
    }
    if ((verbId === 'tithe' || (ICON_VERBS[verbId] && v.home)) && sharedAt(engine, v)) {
      sharedVerb(engine, v, verbId);
      return true;
    }
    if (verbId === 'tithe') {
      if (v.visit) return false;
      runIconVerb(v.row.giant, 'tithe', engine, { placedId: v.row.id });
      target.subtitle = subtitleFor(v.row, v.visit);
      return true;
    }
    if (ICON_VERBS[verbId] && v.home && !v.visit) {
      runIconVerb(v.row.giant, verbId, engine, adoreRef(v));
      target.subtitle = subtitleFor(v.row, v.visit);
      return true;
    }
    return false;
  },

  /**
   * #697: homes-feature's shiftShownRoom says a home room's contents moved by dx (the home street
   * grew to the left, or the back yard did): your Icons there move with the house, as a Garden
   * Gnome does. homes-feature saves after asking. Null so every feature hears it.
   */
  homeRoomShifted(room, dx, engine) {
    const moved = shiftHomeIcons(state, room, dx);
    for (const v of views) if (!v.visit && moved.includes(v.row) && v.sprite && !v.sprite.destroyed) v.sprite.x = v.row.x;
    if (moved.length && engine) publish(engine);
    return null;
  },

  /** version 2: the conversations told live in the shared record (G202), not here. */
  save() {
    return { version: 2, ...state };
  },

  /**
   * A version 1 save's `talked` list is handed to the shared record once
   * (in either restore order, js/conversations.js adoptLegacyTalks), told
   * long enough ago that no offer waits on it.
   */
  restore(slice) {
    state = createIconState(slice || {});
    const told = legacyIconTalks(slice);
    if (told.length) adoptLegacyTalks(toldRecord(told, Date.now() - CONVERSATION_RULES.offerTimeoutMs - 60_000));
  },

  /** QA / tests. */
  _state() {
    return state;
  },
  _reset() {
    state = createIconState();
    last = '';
    views = [];
    fx = [];
    demoDone = false;
    autoplayAt = 0;
    autoplayStep = 0;
    autoplayLog = [];
    autoplayTalkUntil = 0;
    offerCollisions = 0;
    drawnHome = null;
    homePollAt = 0;
    net = null;
  },
  /** Tests: the realtime client and the site account the online path uses. */
  _setNet(engine, client, account) {
    return wireNet(engine, client, account);
  },
};
