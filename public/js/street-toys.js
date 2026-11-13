/**
 * Street toys (register G679): the Clickable Broadcasters of the snow streets, rebuilt. Pure rules
 * and data; features/street-toys-feature.js runs them.
 *
 * What survives in source:
 * - items/clickable_broadcaster.js: an invisible 60 x 60 hit box (getAssetInfo position -30, -60,
 *   instanceProps.scale) whose one verb, click_broadcast, is its oneclick_verb. A click within
 *   `distance` (1000 px) of it broadcasts each event named in instanceProps.event (comma list) to the
 *   street (container.events_broadcast). The objrefs survive in each L*.xml, never their x, y or
 *   instanceProps: which event each one fired and where it stood are lost.
 * - The street's event scripts (assets/streets/<tsid>.json events, run by location-events-feature).
 *   Code the remake cannot run (loc.noteN on Lotha Harte) is done here (lothaNote).
 *
 * Where each one stood is OUR reading, with its why. A toy hangs its hit box on the deco it plays
 * (an icicle, a light), so the box follows that deco's parallax as the art does. Decos that carry
 * no id in the street data get one in prepareStreet (`deco.layer` + `deco.index`, checked by sprite
 * and x so a rebuilt street cannot shift it onto another deco).
 */

/** clickable_broadcaster.js instanceProps.distance. */
export const BROADCAST_DISTANCE = 1000;

export const STREET_TOYS = Object.freeze({
  GHV88RQU60B3Q0G: Object.freeze({
    name: 'Lotha Harte',
    script: 'lotha-notes',
    // LHV88RQU60B3Q0G.xml hidden_decos: the heart's rays, its nine light spots, the blue shaft and
    // the shooting star (wave3) start hidden; correct_order fades them in, light_fade out.
    hide: Object.freeze([
      'bureaucratic_hall_light_ray_1_1350095600640', 'bureaucratic_hall_light_ray_1_1350095600639',
      'light_spot_1350409141713', 'light_spot_1350409141712', 'light_spot_1350409141711', 'light_spot_1350409141714',
      'light_spot_1350409141715', 'light_spot_1350409141717', 'light_spot_1350409141716', 'light_spot_1350409141718',
      'light_spot_1350409141710', 'light_shafts_blue_1350409141709', 'wave3_1350409141719',
    ]),
    toys: Object.freeze([
      Object.freeze({
        id: 'lotha_note_1',
        deco: Object.freeze({ layer: 'T_1348191266333', index: 13, sprite: 'icicle_1a_al1', x: 6417 }),
        hit: 'tip',
        events: Object.freeze(['first_note']),
        why: 'Footage FPQqvshxqfA 4:56.5-4:57: the first click is on the tip of the longest icicle hanging right of the Ice Nubbin (the foreground layer\'s largest, 219 x 478); its low note WM_D1 is the longest icicle\'s.',
      }),
      Object.freeze({
        id: 'lotha_note_2',
        deco: Object.freeze({ layer: 'T_1348191266333', index: 2, sprite: 'icicle_1b_al1', x: 6115 }),
        hit: 'tip',
        events: Object.freeze(['second_note']),
        why: 'Footage FPQqvshxqfA 4:58-4:59.5: the second click is on the icicle 300 px left of the first (the art\'s spacing, 302 px), its tip 95 px higher; WM_D2.',
      }),
      Object.freeze({
        id: 'lotha_note_3',
        deco: Object.freeze({ layer: 'T_1348191266333', index: 3, sprite: 'icicle_1a_al1', x: 6227 }),
        hit: 'tip',
        events: Object.freeze(['third_note']),
        why: 'Footage FPQqvshxqfA 5:00-5:01: the third click is on the icicle between them, 190 px left of the first (art 190 px), the highest tip; WM_E2. The heart is lit by 5:10.',
      }),
    ]),
  }),
  GHF70EIUS0D3RDM: Object.freeze({
    name: 'Icicle Dangles',
    // Not reachable by road until the road to ice opens (G645); built because its places come from its own decos.
    hide: Object.freeze([]),
    toys: Object.freeze([1, 2, 3].map((n, i) => Object.freeze({
      id: `icicle_light_${n}`,
      deco: Object.freeze({ id: ['light_spot_2_groddle1_1352325189104', 'light_spot_2_groddle1_1352325189092', 'light_spot_2_groddle1_1352325189082'][i] }),
      hit: 'whole',
      events: Object.freeze([`shroom_light_${n}_on`, `shroom_light_${n}_off`]),
      why: `No footage: shroom_light_${n}_on and _off fade light_spot_2_groddle1 deco ${n} in and out (500 ms, 700 ms lockout) and are a toggle when one click broadcasts both, so the broadcaster stood on that light. The template draws the lights lit, so the first click puts one out.`,
    }))),
  }),
});

const sameTsid = (a, b) => String(a || '').slice(1) === String(b || '').slice(1);

/** The street's toys entry (either TSID prefix), or null. */
export function streetToysFor(tsid) {
  for (const [key, def] of Object.entries(STREET_TOYS)) if (sameTsid(key, tsid)) return def;
  return null;
}

/** The deco id a toy plays (its own, or the one prepareStreet gives an id-less deco). */
export function toyDecoId(toy) {
  return toy?.deco?.id || `streetfx_${toy?.id || ''}`;
}

/**
 * Before the street is built: give id-less toy decos their id and mark the hidden decos hidden.
 * Mutates the street; answers { tagged, hidden, missing: [toy ids] }.
 */
export function prepareToyStreet(street, def = streetToysFor(street?.tsid)) {
  const out = { tagged: 0, hidden: 0, missing: [] };
  if (!street || !def) return out;
  const hide = new Set(def.hide || []);
  for (const layer of street.layers || []) {
    for (const deco of layer.decos || []) {
      if (deco?.id && hide.has(deco.id) && !deco.hidden) {
        deco.hidden = true;
        out.hidden += 1;
      }
    }
  }
  for (const toy of def.toys || []) {
    if (toy.deco?.id) {
      if (!(street.layers || []).some((l) => (l.decos || []).some((d) => d?.id === toy.deco.id))) out.missing.push(toy.id);
      continue;
    }
    const layer = (street.layers || []).find((l) => l.id === toy.deco.layer);
    const deco = layer?.decos?.[toy.deco.index];
    if (!deco || deco.sprite !== toy.deco.sprite || Math.round(deco.x) !== toy.deco.x) {
      out.missing.push(toy.id);
      continue;
    }
    if (deco.id !== toyDecoId(toy)) {
      deco.id = toyDecoId(toy);
      out.tagged += 1;
    }
  }
  return out;
}

/**
 * The hit box of a toy in the layer's own space, from its deco (x, y = the art's bottom centre):
 * `tip` covers an icicle's lower half, `whole` the deco. { x, y, w, h }, bottom-centre.
 */
export function toyHitBox(toy, deco) {
  const w = Math.max(30, Number(deco?.w) || 60);
  const h = Math.max(30, Number(deco?.h) || 60);
  const x = Number(deco?.x) || 0;
  const y = Number(deco?.y) || 0;
  if (toy?.hit === 'tip') return { x, y: y + 8, w: Math.max(40, w * 0.7), h: Math.max(60, h * 0.5) };
  return { x, y, w, h };
}

/** Within click_broadcast's distance of the toy (avatar feet to the toy's box foot). */
export function inBroadcastReach(px, py, tx, ty, distance = BROADCAST_DISTANCE) {
  return Math.hypot(Number(px) - Number(tx), Number(py) - Number(ty)) <= distance;
}

/** Lotha Harte's loc.note1..3 (LHV88RQU60B3Q0G.xml first/second/third_note code). */
export function createNoteState() {
  return { note1: false, note2: false, note3: false };
}

/**
 * One note event after its sound has played and its flag check passed (no `lock`): the source's
 * code, statement by statement. Answers true when the order is right (call correct_order).
 * first_note: loc.note1 = true. second_note: note2 = true if note1, else all false.
 * third_note: if note1 and note2, note3 = true and correct_order; else all false. reset (after
 * light_fade) sets all false: done here once the heart is lit, as nothing reads them while locked.
 */
export function lothaNote(state, event) {
  const clear = () => { state.note1 = false; state.note2 = false; state.note3 = false; };
  if (event === 'first_note') {
    state.note1 = true;
    return false;
  }
  if (event === 'second_note') {
    if (state.note1) state.note2 = true;
    else clear();
    return false;
  }
  if (event === 'third_note') {
    if (state.note1 && state.note2) {
      state.note3 = true;
      clear();
      return true;
    }
    clear();
  }
  return false;
}
