/**
 * Artifacts, necklace beads and petrified rocks: pure rules (G122).
 * js/features/artifacts-feature.js binds them to the pack.
 *
 * Source map (GameServerJS, Dec 2012):
 *  - players/inc_artifacts.js: artifact_map (the ten artifacts and their
 *    pieces), artifact_necklaces (five bead counts), artifactPieceAdded (a
 *    piece entering the pack schedules createArtifact / createArtifactNecklace
 *    1 s later once the set is whole), createArtifact (5 s locking
 *    "You've combined all the artifact pieces to make a X!" overlay, one of
 *    each piece removed, the artifact arrives 5 s later, counter
 *    artifacts_made:<artifact>), createArtifactNecklace ("You've combined N
 *    beads to make a X!", N beads destroyed, necklaces_made:<necklace>).
 *  - players/inc_items.js 676-682: items_added calls artifactPieceAdded for
 *    any stack tagged `artifactpiece` (after the discovery dialog closes).
 *  - items/petrified_rock_small|medium|large.js: Crack (petrified_rock_base),
 *    a pack verb that needs a working tool from valid_tools; the tool takes
 *    one use, PETRIFIED_ROCK plays with a 2 s locking overlay, then onCrack
 *    consumes the rock and runs the size's drop tables; the results combine
 *    into one "You got A, B, and C!" line (runDropTable combine_messages).
 *  - items/catalog_drop_tables.js: artifact_pieces ("Feat Rewards: Artifact
 *    Pieces", ten weighted per-artifact tables), petrified_rock_small_crack
 *    (20% an artifact piece, else necklace beads), gem_equal_chance and the
 *    three currant tables. js/drop-tables-data.js carries them.
 *  - achievements/student_of_artifactology.js (3 different artifacts),
 *    qualified_artifactologist.js (10), bead_threader.js (1 necklace),
 *    threader_of_renown.js (5).
 *
 * Where rocks come from: only Feat rewards. The web side handed out rewards
 * per contributor ("everyone is guaranteed to get at least a small one; top
 * contributors, in various tiers, also get larger ones", The Epic of Feats,
 * glitch blog 2012-10-12; players/inc_feats.js feats_gather_rewards;
 * main.js doBreakIt is a recorded packet with one Small Petrified Rock).
 * The large rock's own 2% bonus is the only grant inside GSJS.
 *
 * Not built on purpose: the 46 artifact_* items with no artifact_map recipe
 * and the four orphaned artifact_butterlfy_hair_clip_piece* files (an older
 * spelling nothing grants; the live pieces and the drop table use
 * artifact_butterfly_hair_clip_piece*). Both are phase-2 ideas (G132).
 */

/** players/inc_artifacts.js artifact_map, in source order. */
export const ARTIFACT_MAP = Object.freeze({
  butterfly_hair_clip: { artifact: 'artifact_butterfly_hair_clip', pieces: ['artifact_butterfly_hair_clip_piece1', 'artifact_butterfly_hair_clip_piece2', 'artifact_butterfly_hair_clip_piece3', 'artifact_butterfly_hair_clip_piece4'] },
  chicken_brick: { artifact: 'artifact_chicken_brick', pieces: ['artifact_chicken_brick_piece1', 'artifact_chicken_brick_piece2', 'artifact_chicken_brick_piece3', 'artifact_chicken_brick_piece4', 'artifact_chicken_brick_piece5'] },
  glove_metal_finger: { artifact: 'artifact_glove_metal_finger', pieces: ['artifact_glove_metal_finger_piece1', 'artifact_glove_metal_finger_piece2', 'artifact_glove_metal_finger_piece3'] },
  magical_pendant: { artifact: 'artifact_magical_pendant', pieces: ['artifact_magical_pendant_piece1', 'artifact_magical_pendant_piece2', 'artifact_magical_pendant_piece3'] },
  mirror_with_scribbles: { artifact: 'artifact_mirror_with_scribbles', pieces: ['artifact_mirror_with_scribbles_piece1', 'artifact_mirror_with_scribbles_piece2', 'artifact_mirror_with_scribbles_piece3', 'artifact_mirror_with_scribbles_piece4', 'artifact_mirror_with_scribbles_piece5'] },
  mysterious_cube: { artifact: 'artifact_mysterious_cube', pieces: ['artifact_mysterious_cube_piece1', 'artifact_mysterious_cube_piece2', 'artifact_mysterious_cube_piece3', 'artifact_mysterious_cube_piece4', 'artifact_mysterious_cube_piece5'] },
  nose_of_china: { artifact: 'artifact_nose_of_china', pieces: ['artifact_nose_of_china_piece1', 'artifact_nose_of_china_piece2'] },
  platinumium_spork: { artifact: 'artifact_platinumium_spork', pieces: ['artifact_platinumium_spork_piece1', 'artifact_platinumium_spork_piece2'] },
  torn_manuscript: { artifact: 'artifact_torn_manuscript', pieces: ['artifact_torn_manuscript_piece1', 'artifact_torn_manuscript_piece2', 'artifact_torn_manuscript_piece3', 'artifact_torn_manuscript_piece4'] },
  wooden_apple: { artifact: 'artifact_wooden_apple', pieces: ['artifact_wooden_apple_piece1', 'artifact_wooden_apple_piece2', 'artifact_wooden_apple_piece3', 'artifact_wooden_apple_piece4'] },
});

/** players/inc_artifacts.js artifact_necklaces: bead class -> beads needed, necklace made. */
export const ARTIFACT_NECKLACES = Object.freeze({
  artifact_necklace_amazonite_piece: { required: 17, produces: 'artifact_necklace_amazonite' },
  artifact_necklace_rhyolite_piece: { required: 17, produces: 'artifact_necklace_rhyolite' },
  artifact_necklace_onyx_piece: { required: 19, produces: 'artifact_necklace_onyx' },
  artifact_necklace_redtigereye_piece: { required: 19, produces: 'artifact_necklace_redtigereye' },
  artifact_necklace_imperial_piece: { required: 23, produces: 'artifact_necklace_imperial' },
});

/** artifactPieceAdded -> apiSetTimerX('createArtifact', 1*1000); the overlay lasts 5000; createItemFromGround after 5000. */
export const ASSEMBLE_DELAY_MS = 1000;
export const OVERLAY_MS = 5000;
export const ARRIVE_DELAY_MS = 5000;
/** petrified_rock_base crack: apiSetTimerX('onCrack', 2000) under a 2000 ms locking overlay. */
export const CRACK_MS = 2000;
export const CRACK_SOUND = 'PETRIFIED_ROCK';

/** petrified_rock_base valid_tools, in source order. */
export const CRACK_TOOLS = Object.freeze([
  'ace_of_spades', 'class_axe', 'fancy_pick', 'grand_ol_grinder', 'hatchet',
  'high_class_hoe', 'hoe', 'ore_grinder', 'pick', 'shovel',
]);

export const CRACK_COPY = Object.freeze({
  // petrified_rock_base verbs.crack conditions / valid_items
  noTool: "You don't have anything to crack it with.",
  tooltip: 'Crack it open',
  // inc_artifacts.js createArtifact / createArtifactNecklace overlay text
  combined: (label) => `You've combined all the artifact pieces to make a ${label}!`,
  combinedBeads: (n, label) => `You've combined ${n} beads to make a ${label}!`,
});

const ROCK_TAGS = Object.freeze(['no_rube', 'no_trade', 'no_auction', 'collectible', 'petrified']);
const ARTIFACT_TAGS = Object.freeze(['collectible', 'artifact', 'no_rube', 'no_donate']);

/** Item copy the drop-table data does not carry (items/<class>.js label, plurals, description, stackmax). */
export const EXTRA_ITEMS = Object.freeze({
  petrified_rock_small: {
    label: 'Small Petrified Rock', single: 'Small Petrified Rock', plural: 'Small Petrified Rocks', stackMax: 5, tags: ROCK_TAGS,
    desc: 'A once-modest small rock, frozen into a state of petrified awe when it witnessed a truly epic feat, then drawn, like a magnet, to the contributors of whatever act of rock-debilitating awesomenity petrified it. When cracked open, a small selection of rare delights may be found.',
  },
  petrified_rock_medium: {
    label: 'Medium Petrified Rock', single: 'Medium Petrified Rock', plural: 'Medium Petrified Rocks', stackMax: 5, tags: ROCK_TAGS,
    desc: 'A once-vibrant medium-sized rock, shocked into a state of frozen fossilized awe when it witnessed an epic feat, and drawn, like a magnet, to the generous contributors who brought about the most awe. The fragile structure of elements in its core suggest that a modest selection of rare delights may be found when it is cracked open.',
  },
  petrified_rock_large: {
    label: 'Large Petrified Rock', single: 'Large Petrified Rock', plural: 'Large Petrified Rocks', stackMax: 5, tags: ROCK_TAGS,
    desc: 'A once-stable living rock, shocked and shaken to its very core by witnessing a truly awesome feat, and drawn to the 13 who contributed the most awe to the act. The pulverising and rejigging of its internal components mean that, when cracked open, a large selection of rare delights may be recovered.',
  },
  artifact_necklace_amazonite: {
    label: 'Nyanite Necklace', single: 'Nyanite Necklace', plural: 'Nyanite Necklaces', stackMax: 1, tags: ARTIFACT_TAGS,
    desc: 'A necklace of 17 pleasingly square beads, given by devotees of Mab to celebrate Croppaday. Based on a necklace owned by an ancient Mabbite priest called Timbernasleigh which would, when placed around the right neck, play the most alluring yet annoying tune Ur had ever heard so repetitiously that anyone within earshot could never unhear it. This replica, thank Mab, does not do that.',
  },
  artifact_necklace_rhyolite: {
    label: 'Caiyotite Necklace', single: 'Caiyotite Necklace', plural: 'Caiyotite Necklaces', stackMax: 1, tags: ARTIFACT_TAGS,
    desc: 'A necklace of 17 multi-coloured beads, traditionally given as gifts between the ancients to celebrate a successful Feat. Possibly the most democratically forged (and cheap) ancient jewellery, the beads were first forged when devotees of all the giants came together, each bringing their sacred stones and melding them over intense heat to form this marbled, chaotic but undeniably pleasing piece.',
  },
  artifact_necklace_onyx: {
    label: 'Gnipperite Gnecklace', single: 'Gnipperite Gnecklace', plural: 'Gnipperite Gnecklaces', stackMax: 1, tags: ARTIFACT_TAGS,
    desc: 'A necklace of 19 beads, as black as night. Given by the followers of Friendly to their loved ones on Recurse Eve, in mourning for the year that had passed and holding the promise of Recurse and the year to come. It was also said that the original Gnipperite Gnecklace, owned by a ancient called Masha, had hollow beads, each big enough to hold a stiff swig of hooch. But this reproduction, cheaper version, is boringly solid.',
  },
  artifact_necklace_redtigereye: {
    label: 'Red Tiger Eye Necklace', single: 'Red Tiger Eye Necklace', plural: 'Red Tiger Eye Necklaces', stackMax: 1, tags: ARTIFACT_TAGS,
    desc: 'A necklace of 19 rich red beads, given one year during the annual festival of Alphcon to all who attended the festival or bought anything at it. No one knows why the name is given. There have never been Red Tigers in Ur, or, for that matter, Tigers with Red Eyes. So not only were no tigers harmed in the making of this necklace, no tigers existed to be harmed in the first place. Also: what are tigers?',
  },
  artifact_necklace_imperial: {
    label: 'Ouzian Necklace', single: 'Ouzian Necklace', plural: 'Ouzian Necklaces', stackMax: 1, tags: ARTIFACT_TAGS,
    desc: 'A necklace of 23 swirling blue beads, traditionally given to family (and those loved like family) to celebrate the feast of the Sprinkling. Based on the necklace of ancient Mistress of the Water-filled Can, Nephelokokkygia (though not named after her, because during Sprinkling most people tended to lose the ability to pronounce her name).',
  },
});

/** Pieces stack to 5, finished artifacts to 1, beads to their necklace's count (items/<class>.js stackmax). */
export function stackMaxFor(classTsid) {
  if (ARTIFACT_NECKLACES[classTsid]) return ARTIFACT_NECKLACES[classTsid].required;
  if (EXTRA_ITEMS[classTsid]) return EXTRA_ITEMS[classTsid].stackMax;
  if (PIECE_TO_SET.has(classTsid)) return 5;
  if (ARTIFACT_IDS.includes(classTsid)) return 1;
  return undefined;
}

export const ROCK_IDS = Object.freeze(['petrified_rock_small', 'petrified_rock_medium', 'petrified_rock_large']);
export const ARTIFACT_IDS = Object.freeze(Object.values(ARTIFACT_MAP).map((a) => a.artifact));
export const NECKLACE_IDS = Object.freeze(Object.values(ARTIFACT_NECKLACES).map((n) => n.produces));
export const BEAD_IDS = Object.freeze(Object.keys(ARTIFACT_NECKLACES));
export const PIECE_IDS = Object.freeze(Object.values(ARTIFACT_MAP).flatMap((a) => a.pieces));

const PIECE_TO_SET = new Map(Object.entries(ARTIFACT_MAP).flatMap(([type, a]) => a.pieces.map((p) => [p, type])));

/** Every class the system names (pieces, beads, artifacts, necklaces, rocks). */
export const ALL_ARTIFACT_CLASSES = Object.freeze([...PIECE_IDS, ...BEAD_IDS, ...ARTIFACT_IDS, ...NECKLACE_IDS, ...ROCK_IDS]);

/** Tagged artifactpiece in the source: the pieces and the beads. */
export function isArtifactPiece(classTsid) {
  return PIECE_TO_SET.has(classTsid) || Boolean(ARTIFACT_NECKLACES[classTsid]);
}

/** inc_artifacts.js findArtifactForPiece. */
export function findArtifactForPiece(classTsid) {
  return PIECE_TO_SET.get(classTsid) || null;
}

const have = (inv, id, n = 1) => (Number(inv?.[id]) || 0) >= n;

/**
 * inc_artifacts.js artifactPieceAdded: what a newly added piece completes.
 * Returns { kind: 'necklace', bead, required, produces } |
 *         { kind: 'artifact', type, artifact, pieces } | null.
 */
export function assemblyFor(inv, classTsid) {
  const necklace = ARTIFACT_NECKLACES[classTsid];
  if (necklace) {
    return have(inv, classTsid, necklace.required)
      ? { kind: 'necklace', bead: classTsid, required: necklace.required, produces: necklace.produces }
      : null;
  }
  const type = findArtifactForPiece(classTsid);
  const def = type && ARTIFACT_MAP[type];
  if (!def) return null;
  for (const piece of def.pieces) if (!have(inv, piece)) return null;
  return { kind: 'artifact', type, artifact: def.artifact, pieces: [...def.pieces] };
}

/** Pieces held towards each artifact and beads towards each necklace (for the pack card and QA). */
export function collectionProgress(inv) {
  const artifacts = Object.entries(ARTIFACT_MAP).map(([type, def]) => ({
    type,
    artifact: def.artifact,
    have: def.pieces.filter((p) => have(inv, p)).length,
    need: def.pieces.length,
  }));
  const necklaces = Object.entries(ARTIFACT_NECKLACES).map(([bead, def]) => ({
    bead,
    necklace: def.produces,
    have: Math.min(def.required, Number(inv?.[bead]) || 0),
    need: def.required,
  }));
  return { artifacts, necklaces };
}

/**
 * createArtifact / createArtifactNecklace's pack change: removes the pieces
 * (one of each) or the beads. The artifact itself is added later
 * (createItemFromGround after 5 s). Returns false when the set is no longer
 * whole (a piece left the pack during the 1 s wait; the source would have
 * made the artifact anyway, see the feature's note).
 */
export function consumeForAssembly(inv, plan) {
  if (!plan || !inv) return false;
  if (plan.kind === 'necklace') {
    if (!have(inv, plan.bead, plan.required)) return false;
    inv[plan.bead] -= plan.required;
    return true;
  }
  if (!plan.pieces.every((p) => have(inv, p))) return false;
  for (const p of plan.pieces) inv[p] -= 1;
  return true;
}

/** The counter the source increments: artifacts_made:<artifact> or necklaces_made:<necklace>. */
export function assemblyCounter(plan) {
  return plan.kind === 'necklace' ? `necklaces_made:${plan.produces}` : `artifacts_made:${plan.artifact}`;
}

/* ------------------------------------------------------------------ rocks */

/**
 * onCrack per size, as ordered steps. `table` runs a drop table, `chance`
 * gates a step with is_chance(p), `items` is createItemFromFamiliar plus a
 * pushed "1 X" line, `tableMissing` is a runDropTable call on a table that
 * does not exist (it returns false, which wipes the combined message).
 */
export const CRACK_STEPS = Object.freeze({
  // petrified_rock_small.js onCrack
  petrified_rock_small: [
    { table: 'petrified_rock_small_crack' },
    { table: 'gem_equal_chance', chance: 0.1 },
    { table: 'petrified_rock_small_currants' },
  ],
  // petrified_rock_medium.js onCrack
  petrified_rock_medium: [
    { table: 'artifact_pieces' },
    { table: 'artifact_pieces' },
    { table: 'gem_equal_chance', chance: 0.5 },
    { table: 'petrified_rock_medium_currants' },
  ],
  // petrified_rock_large.js onCrack
  petrified_rock_large: [
    { table: 'artifact_pieces' },
    { table: 'artifact_pieces' },
    { table: 'artifact_pieces' },
    { table: 'artifact_pieces', chance: 0.2 },
    { table: 'gem_equal_chance' },
    { table: 'petrified_rock_large_currants' },
    // runDropTable("petrified_rock_small"): no such drop table in catalog_drop_tables.js.
    { tableMissing: 'petrified_rock_small', chance: 0.05 },
    { items: [['petrified_rock_small', 1], ['petrified_rock_medium', 1]], chance: 0.02 },
  ],
});

export function isPetrifiedRock(classTsid) {
  return Boolean(CRACK_STEPS[classTsid]);
}

/**
 * The working valid tools the player holds, in source order (valid_items:
 * one choice per tool class). `inv` counts tools; `isWorking(id)` says the
 * tool is not broken.
 */
export function crackToolChoices(inv, isWorking = () => true) {
  return CRACK_TOOLS.filter((id) => have(inv, id) && isWorking(id));
}

/** verbs.crack conditions. */
export function canCrack(inv, classTsid, isWorking) {
  if (!isPetrifiedRock(classTsid) || !have(inv, classTsid)) return { ok: false, msg: '' };
  const tools = crackToolChoices(inv, isWorking);
  if (!tools.length) return { ok: false, msg: CRACK_COPY.noTool };
  return { ok: true, tools };
}

/**
 * Roll a crack: returns { rolls: [{ step, result }], items: [[id, n]],
 * currants, lines: [...combined parts], messageLost } without touching the pack.
 * `rollTable(tableId)` is drop-tables.js rollDropTable bound to an RNG.
 * `meta(id)` gives { single, plural } names.
 */
export function rollCrack(classTsid, { rng = Math.random, rollTable, meta = () => null } = {}) {
  const steps = CRACK_STEPS[classTsid] || [];
  const out = { rolls: [], items: [], currants: 0, lines: [], messageLost: false };
  const name = (id, n) => {
    const m = meta(id) || EXTRA_ITEMS[id] || {};
    return n === 1 ? `1 ${m.single || m.label || id}` : `${n} ${m.plural || `${m.single || id}s`}`;
  };
  for (const step of steps) {
    if (step.chance != null && !(rng() < step.chance)) continue;
    if (step.tableMissing) {
      out.messageLost = true;
      continue;
    }
    if (step.items) {
      for (const [id, n] of step.items) {
        out.items.push([id, n]);
        out.lines.push(name(id, n));
      }
      continue;
    }
    const result = rollTable(step.table, rng);
    out.rolls.push({ step: step.table, result });
    for (const it of result.items) {
      out.items.push([it.classTsid, it.qty]);
      out.lines.push(name(it.classTsid, it.qty));
    }
    if (result.currants) {
      out.currants += result.currants;
      out.lines.push(result.currants === 1 ? '1 currant' : `${result.currants} currants`);
    }
  }
  return out;
}

/** onCrack's activity line: "You got A!" or "You got A, B, and C!" (none when the message was lost). */
export function crackMessage(lines, messageLost = false) {
  if (messageLost || !lines.length) return '';
  if (lines.length === 1) return `You got ${lines[0]}!`;
  const rest = lines.slice(0, -1);
  return `You got ${rest.join(', ')}, and ${lines[lines.length - 1]}!`;
}

/** buildVerbMessage(1, 'crack', 'cracked'): "You cracked a Small Petrified Rock." */
export function crackStartMessage(classTsid) {
  return `You cracked a ${EXTRA_ITEMS[classTsid]?.single || classTsid}.`;
}

/** Odds (0..1) that one artifact_pieces roll yields a given piece (for the info card / tests). */
export function pieceOdds(tables, pieceId) {
  const top = tables.artifact_pieces;
  if (!top) return 0;
  let prev = -1;
  let odds = 0;
  for (const [threshold, entries] of top.rows) {
    const width = (Math.min(100, threshold) - prev) / 101;
    prev = Math.min(100, threshold);
    for (const e of entries) {
      if (!e.table) continue;
      const sub = tables[e.table];
      if (!sub) continue;
      let p2 = -1;
      for (const [t2, es2] of sub.rows) {
        const w2 = (Math.min(100, t2) - p2) / 101;
        p2 = Math.min(100, t2);
        if (es2.some((x) => x.item === pieceId)) odds += width * w2;
      }
    }
  }
  return odds;
}

/* ------------------------------------------------------------------ state */

export function createArtifactState(seed = {}) {
  return normalizeArtifactState(seed);
}

const countMap = (m) => {
  const out = {};
  if (!m || typeof m !== 'object') return out;
  for (const [k, v] of Object.entries(m)) {
    const n = Math.max(0, Math.floor(Number(v) || 0));
    if (n && /^[a-z0-9_]{1,64}$/.test(k)) out[k] = n;
  }
  return out;
};

/** Saved totals: rocks cracked by size, artifacts and necklaces made by class. */
export function normalizeArtifactState(seed = {}) {
  const s = seed && typeof seed === 'object' ? seed : {};
  return { version: 1, cracked: countMap(s.cracked), made: countMap(s.made) };
}
