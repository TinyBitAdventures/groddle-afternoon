/**
 * Authored state for the Phantom Glitch quest pair.
 *
 * GSJS anchors:
 * - quests/phantom_glitch.js
 * - quests/remember_ghosts_1.js
 * - items/faded_heart.js
 */

export const PHANTOM_QUEST_ID = 'phantom_glitch';
export const REMEMBER_QUEST_ID = 'remember_ghosts_1';
export const FADED_HEART_ID = 'faded_heart';
export const PHANTOM_HAUNT_COUNT = 7;
export const REMEMBER_HAUNT_COUNT = 13;
export const HEART_MEMORY_COOLDOWN_MS = 15_000;
/**
 * phantom_glitch.swf sprite 65: `appear` is 46 frames (3-48) and `giveHeart`
 * 76 frames (236-311), authored at 30 fps. The OGA sheets hold exactly those
 * frames in 6 columns of 147x214 cells.
 */
export const PHANTOM_SWF_FPS = 30;
export const PHANTOM_APPEAR_FRAME_COUNT = 46;
export const PHANTOM_GIVE_HEART_FRAME_COUNT = 76;
/**
 * Pixi speed at a 60 fps ticker that plays the SWF's own 30 fps. The
 * "Receiving the Faded Heart" recording agrees: the Phantom has faded about
 * 1.2 s after the last response (frame 36 of the sheet), the heart lands at
 * about 1.7 s (frame 52), and it is gone about 3.2 s in, which is the 2,533 ms
 * animation plus the reveal hold. The final appear takes about 1.5 s in the
 * GlitchAddict quest recording, also 30 fps.
 */
export const PHANTOM_GIVE_HEART_ANIMATION_SPEED = PHANTOM_SWF_FPS / 60;
export const PHANTOM_APPEAR_ANIMATION_SPEED = PHANTOM_SWF_FPS / 60;
/** Echoes and the Remember memory keep their slower, dreamier playback. */
export const PHANTOM_ECHO_APPEAR_ANIMATION_SPEED = 0.136;
export const PHANTOM_MEMORY_ANIMATION_SPEED = 0.128;
export const PHANTOM_HEART_REVEAL_HOLD_MS = 700;

export function phantomAnimationDurationMs(
  frameCount,
  animationSpeed,
  tickerFps = 60
) {
  const frames = Math.max(1, Number(frameCount) || 1);
  const speed = Math.max(0.001, Number(animationSpeed) || 0.001);
  const fps = Math.max(1, Number(tickerFps) || 60);
  return Math.round((frames / (speed * fps)) * 1000);
}

export const PHANTOM_GIVE_HEART_DURATION_MS = phantomAnimationDurationMs(
  PHANTOM_GIVE_HEART_FRAME_COUNT,
  PHANTOM_GIVE_HEART_ANIMATION_SPEED
);

/**
 * Original production haunting streets, all 50 of phantom_glitch.js's
 * `locations` (prod_tsid, in source order). The location import often exposes
 * the same ids with a G prefix, so selection resolves both forms.
 */
export const OFFICIAL_PHANTOM_HAUNTS = Object.freeze([
  'LCRHITPKONL1T7J',
  'LLIF6R3R9GE1GQB',
  'LCR101SU5VL1P09',
  'LCR195Q63RK143M',
  'LCR13NMUQEM1A2R',
  'LLI23Q4NDHD11EK',
  'LA5DVVGJQQ5237U',
  'LA51B2OQAK623EF',
  'LA912LITC492EU2',
  'LA9GT0J87H92MPR',
  'LHV2CGP55U22T4Q',
  'LHVH2BF13132CUF',
  'LHV12AQNBB32CJ2',
  'LTJ11HQLJUV1R15',
  'LTJ7GRG1VCV1VJD',
  'LIFAGDB0IGU1BCK',
  'LTJ1F3AER9V139B',
  'LTJ8GSQV1IV1FBE',
  'LIF8TUJ3HGU1G3J',
  'LTJ13TRDHKV1970',
  'LTJ2S0EVDSV1HQ0',
  'LIFNG7GD8OU17BO',
  'LTJ1FR102AV17DP',
  'LTJ1PV6RLCV1L08',
  'LIFDIDJT0GU1CR8',
  'LTJ18J9ASDU1UPS',
  'LTJ10HO3FAV1HDD',
  'LA91JU4QQ712DJN',
  'LA9114MS8B32FB2',
  'LA918AIN63127HB',
  'LM1TS65LBN12EIV',
  'LA9QR2STO832N8E',
  'LA912TJ0KF328Q3',
  'LA9DNT3I2U22RS7',
  'LA910DULG012JIE',
  'LM113VSD6922MRJ',
  'LHV15C8IEQ322UG',
  'LIF14N6MU872GGI',
  'LHH110KCF411NK6',
  'LHH1011JSO11ORS',
  'LHFUE6UMQ4D2K42',
  'LHFNIVJNP4D2IM6',
  'LHFNBKJMP4D2S9M',
  'LHFFH3GKN2D2BTS',
  'LHFTQ7GLV2D2GG1',
  'LDOOD6S77DD228S',
  'LDOVRMU9SCD2ASN',
  'LDOTQ8JCOCD20TU',
  'LDO8HM0S8DD240C',
  'LIF6RTBE48435HF',
]);

export const PHANTOM_WHISPERS = Object.freeze([
  '…',
  '… Please.',
  'Please, help me…',
  'I… I’m fading…',
  'Please… keep thinking.',
  'Think of me…',
  'What is not forgotten is never really lost.',
]);

/**
 * The final street-side conversation visible in the supplied
 * "Receiving the Faded Heart" recording. Keeping the beats in this pure
 * module makes the handoff testable and prevents the reward from being
 * collapsed into the first Talk to click.
 */
export const PHANTOM_FINALE_BEATS = Object.freeze([
  Object.freeze({
    text: "You don't know…",
    response: "Don't know what?",
  }),
  Object.freeze({
    text:
      "…how long I've been crying for passersby to notice me. It's as if my screams were only whispers.",
    response: 'I could barely hear you.',
  }),
  Object.freeze({
    text: 'And yet, you did. I want to thank you from the bottom of my heart.',
    response: 'Aw, shucks. It was nothing.',
  }),
  Object.freeze({
    text: "No, you… you remembered me when no one else would. I can't thank…",
    response: '?',
  }),
]);

function cleanId(value) {
  return String(value || '').trim().replace(/[^a-zA-Z0-9_:-]/g, '');
}

function uniqueIds(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(cleanId).filter(Boolean))];
}

function aliasCandidates(tsid) {
  const id = cleanId(tsid);
  const out = [id];
  if (id.startsWith('LLI')) out.push(`GLI${id.slice(3)}`);
  else if (id.startsWith('GLI')) out.push(`LLI${id.slice(3)}`);
  if (id.startsWith('L')) out.push(`G${id.slice(1)}`);
  else if (id.startsWith('G')) out.push(`L${id.slice(1)}`);
  return uniqueIds(out);
}

function hash(value) {
  let h = 2166136261;
  for (const ch of String(value || '')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32: a seeded random for tests and QA (the game uses Math.random, as GSJS choose_one). */
function seededRng(seed) {
  let a = hash(seed) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rngFrom(opts) {
  if (typeof opts.rng === 'function') return opts.rng;
  if (opts.seed != null) return seededRng(opts.seed);
  return Math.random;
}

function pickRandom(list, count, rng) {
  const pool = [...list];
  const out = [];
  while (out.length < count && pool.length) {
    const i = Math.min(pool.length - 1, Math.floor(rng() * pool.length));
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}

/** A street test from a Set/array of reachable tsids (either prefix), or null when unknown. */
function reachTest(reachable) {
  if (!reachable) return null;
  if (typeof reachable === 'function') return (tsid) => aliasCandidates(tsid).some((t) => reachable(t));
  const set = reachable instanceof Set ? reachable : new Set(uniqueIds(reachable));
  return (tsid) => aliasCandidates(tsid).some((t) => set.has(t));
}

/** The official haunting streets present in the imported catalog, in its own tsid form. */
export function phantomHauntPool(availableTsids) {
  const availableSet = new Set(uniqueIds(availableTsids));
  const out = [];
  for (const tsid of OFFICIAL_PHANTOM_HAUNTS) {
    const resolved = aliasCandidates(tsid).find((candidate) => availableSet.has(candidate));
    if (resolved && !out.includes(resolved)) out.push(resolved);
  }
  return out;
}

/**
 * Streets that may stand in for an official haunt the player cannot reach (#145 fallback):
 * reachable streets in a region (hub) that holds an official haunt, never a subway station or a
 * machine room. `info(tsid)` gives { hubId, label } (assets/streets/index.json).
 */
function standInStreets(available, canReach, info, exclude) {
  if (!canReach || typeof info !== 'function') return [];
  const officialSet = new Set(phantomHauntPool(available));
  const hauntHubs = new Set([...officialSet].map((t) => String(info(t)?.hubId || '')).filter(Boolean));
  return available.filter((t) => {
    if (officialSet.has(t) || exclude.has(t) || !canReach(t) || t.includes('_')) return false;
    const row = info(t);
    if (!row || !hauntHubs.has(String(row.hubId || ''))) return false;
    return !/subway station|machine room/i.test(String(row.label || ''));
  });
}

/**
 * Seven haunting streets for one player (#145). phantom_glitch.js chooseHauntings
 * (373-397) takes seven at random from the 50 official streets, a new seven for
 * every player; the remake used to take the first seven, so everyone hunted the
 * same streets, most of them behind unbuilt street projects.
 *
 * opts.reachable (a Set of tsids, or a test): only streets a player can reach
 * now are picked (street-jobs-feature `streetsReachable`, the reach the On hold
 * quests use). The fallback, in order, when fewer reachable official streets are
 * left than needed (a fresh world reaches 6 of the 50: most stand on streets still
 * to be built): reachable stand-ins from the haunts' own regions (opts.info, see
 * standInStreets), then unreachable official streets (they open with their road,
 * and the quest shows On hold until then: quest-reach.js questStoryNeeds), then
 * any other street (only a catalog without the official streets, as in unit tests).
 * opts.exclude: streets already chosen or found. opts.count: how many (7).
 * opts.rng / opts.seed (or a seed string as the second argument): deterministic picks.
 */
export function choosePhantomHaunts(availableTsids, opts = {}) {
  if (typeof opts === 'string') opts = { seed: opts };
  const rng = rngFrom(opts);
  const canReach = reachTest(opts.reachable);
  const exclude = new Set(uniqueIds(opts.exclude));
  const count = Math.max(0, Math.floor(opts.count ?? PHANTOM_HAUNT_COUNT));
  const all = uniqueIds(availableTsids);
  const available = all.filter((tsid) => !exclude.has(tsid));
  const official = phantomHauntPool(available);
  const picked = pickRandom(canReach ? official.filter(canReach) : official, count, rng);
  if (picked.length < count) {
    const standIns = standInStreets(all, canReach, opts.info, new Set([...exclude, ...picked]));
    picked.push(...pickRandom(standIns, count - picked.length, rng));
  }
  if (picked.length < count) {
    picked.push(...pickRandom(official.filter((tsid) => !picked.includes(tsid)), count - picked.length, rng));
  }
  if (picked.length < count) {
    const seed = opts.seed ?? 'phantom_glitch';
    const others = available
      .filter((tsid) => !picked.includes(tsid))
      .sort((a, b) => hash(`${seed}:${a}`) - hash(`${seed}:${b}`) || a.localeCompare(b));
    const ordered = canReach ? [...others.filter(canReach), ...others.filter((t) => !canReach(t))] : others;
    picked.push(...ordered.slice(0, count - picked.length));
  }
  return picked;
}

export function createGhostQuestState(seed = {}) {
  const hauntStreets = uniqueIds(seed.hauntStreets);
  const foundStreets = uniqueIds(seed.foundStreets).filter((id) => hauntStreets.includes(id));
  const rememberedStreets = uniqueIds(seed.rememberedStreets);
  return {
    hauntStreets,
    foundStreets,
    finalReady: seed.finalReady === true || foundStreets.length >= PHANTOM_HAUNT_COUNT,
    heartGranted: seed.heartGranted === true,
    rememberedStreets,
    memoryCooldownUntil: Math.max(0, Number(seed.memoryCooldownUntil) || 0),
    // #145: the spots were chosen (or checked once) knowing which streets the player can reach.
    reachChecked: seed.reachChecked === true,
  };
}

/**
 * The player's spots, chosen when missing. opts.reset starts the hunt again (accepting the
 * quest). opts.reachable (see choosePhantomHaunts): known reach. A save whose spots were chosen
 * before reach was known (every save before #145, or a pick made while the roads were still
 * loading) is checked once, the first time reach is known: spots already found stay, and each
 * spot still to find that no open road reaches is swapped for a reachable official street not
 * already chosen, else a reachable stand-in (opts.info); with none left it stays (the quest
 * shows On hold until its road is built).
 */
export function ensureGhostQuestState(questState, availableTsids = [], opts = {}) {
  questState.story ||= {};
  const current = createGhostQuestState(questState.story.phantom);
  const canReach = reachTest(opts.reachable);
  if (opts.reset === true || current.hauntStreets.length < PHANTOM_HAUNT_COUNT) {
    if (opts.reset === true) {
      current.foundStreets = [];
      current.finalReady = false;
      current.heartGranted = false;
      current.rememberedStreets = [];
      current.memoryCooldownUntil = 0;
    }
    const kept = current.foundStreets.slice(0, PHANTOM_HAUNT_COUNT);
    current.hauntStreets = [
      ...kept,
      ...choosePhantomHaunts(availableTsids, {
        reachable: opts.reachable,
        info: opts.info,
        rng: opts.rng,
        seed: opts.seed,
        exclude: kept,
        count: PHANTOM_HAUNT_COUNT - kept.length,
      }),
    ];
    current.foundStreets = kept;
    current.reachChecked = Boolean(canReach);
  } else if (canReach && !current.reachChecked) {
    const blocked = current.hauntStreets.filter(
      (id) => !current.foundStreets.includes(id) && !canReach(id)
    );
    if (blocked.length) {
      const rng = rngFrom(opts);
      const all = uniqueIds(availableTsids);
      const taken = new Set(current.hauntStreets);
      const pool = phantomHauntPool(all).filter((id) => !taken.has(id) && canReach(id));
      const swaps = pickRandom(pool, blocked.length, rng);
      if (swaps.length < blocked.length) {
        const standIns = standInStreets(all, canReach, opts.info, new Set([...taken, ...swaps]));
        swaps.push(...pickRandom(standIns, blocked.length - swaps.length, rng));
      }
      swaps.forEach((to, i) => {
        current.hauntStreets[current.hauntStreets.indexOf(blocked[i])] = to;
      });
    }
    current.reachChecked = true;
  }
  questState.story.phantom = current;
  return current;
}

/**
 * The cold spots still to find, as a street-bound requirement for quest-reach.js
 * (questStoryNeeds): every one must be reached, so one no open road reaches puts
 * the quest On hold. Null when the hunt is over or the spots are all found.
 */
export function phantomPlaceNeed(questState) {
  if (!questState?.active?.[PHANTOM_QUEST_ID]) return null;
  const story = createGhostQuestState(questState?.story?.phantom);
  if (story.finalReady || story.heartGranted) return null;
  const streets = story.hauntStreets.filter((id) => !story.foundStreets.includes(id));
  if (!streets.length) return null;
  return { name: 'found_ghost', desc: 'Notice the Phantom on its cold spots', streets, need: streets.length };
}

export function ghostEncounterAt(questState, streetTsid) {
  const story = createGhostQuestState(questState?.story?.phantom);
  if (!questState?.active?.[PHANTOM_QUEST_ID] || story.heartGranted) return null;
  const street = cleanId(streetTsid);
  if (story.finalReady) {
    return { kind: 'final', streetTsid: street, found: story.foundStreets.length };
  }
  if (!story.hauntStreets.includes(street) || story.foundStreets.includes(street)) return null;
  return {
    kind: 'echo',
    streetTsid: street,
    found: story.foundStreets.length,
    remaining: Math.max(0, PHANTOM_HAUNT_COUNT - story.foundStreets.length),
    whisper: PHANTOM_WHISPERS[Math.min(story.foundStreets.length, PHANTOM_WHISPERS.length - 1)],
  };
}

export function noticePhantom(questState, streetTsid) {
  const story = createGhostQuestState(questState?.story?.phantom);
  const street = cleanId(streetTsid);
  if (!questState?.active?.[PHANTOM_QUEST_ID]) return { ok: false, reason: 'inactive' };
  if (!story.hauntStreets.includes(street)) return { ok: false, reason: 'not_a_haunt' };
  if (story.foundStreets.includes(street)) return { ok: false, reason: 'already_found' };
  story.foundStreets.push(street);
  story.finalReady = story.foundStreets.length >= PHANTOM_HAUNT_COUNT;
  questState.story ||= {};
  questState.story.phantom = story;
  return {
    ok: true,
    found: story.foundStreets.length,
    remaining: Math.max(0, PHANTOM_HAUNT_COUNT - story.foundStreets.length),
    finalReady: story.finalReady,
    whisper: PHANTOM_WHISPERS[Math.min(story.foundStreets.length - 1, PHANTOM_WHISPERS.length - 1)],
  };
}

export function grantFadedHeart(questState, inv) {
  const story = createGhostQuestState(questState?.story?.phantom);
  if (!story.finalReady) return { ok: false, reason: 'not_ready' };
  if (story.heartGranted) return { ok: false, reason: 'already_granted' };
  story.heartGranted = true;
  inv[FADED_HEART_ID] = Math.max(0, Number(inv[FADED_HEART_ID]) || 0) + 1;
  questState.story ||= {};
  questState.story.phantom = story;
  return { ok: true, classTsid: FADED_HEART_ID, count: inv[FADED_HEART_ID] };
}

export function rememberWithFadedHeart(questState, inv, streetTsid, now = Date.now()) {
  const story = createGhostQuestState(questState?.story?.phantom);
  const street = cleanId(streetTsid);
  if ((Number(inv?.[FADED_HEART_ID]) || 0) < 1) return { ok: false, reason: 'no_heart' };
  if (!questState?.active?.[REMEMBER_QUEST_ID]) return { ok: false, reason: 'inactive' };
  if (now < story.memoryCooldownUntil) {
    return {
      ok: false,
      reason: 'cooldown',
      remainingMs: story.memoryCooldownUntil - now,
    };
  }
  if (story.rememberedStreets.includes(street)) {
    return { ok: false, reason: 'already_remembered' };
  }
  story.rememberedStreets.push(street);
  story.memoryCooldownUntil = now + HEART_MEMORY_COOLDOWN_MS;
  questState.story ||= {};
  questState.story.phantom = story;
  return {
    ok: true,
    remembered: story.rememberedStreets.length,
    remaining: Math.max(0, REMEMBER_HAUNT_COUNT - story.rememberedStreets.length),
    cooldownUntil: story.memoryCooldownUntil,
  };
}
