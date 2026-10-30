/**
 * Room 23 (G71): where Gwendolyn's Task begins. Pure data, rules and a
 * builder (no Pixi, no DOM); features/gwendolyn-room-23-feature.js runs it.
 *
 * What survives in the source:
 *   inc_data_maps_prod.js hub 79: LCR8MORFJI12IR4 "Room 23", beside Area 42,
 *     The Outer Mind, The Inner Mind and Gwendolyn's Chamber (the quest's four
 *     instances) and the Rook Museum. Hub 79 has no name of its own.
 *   Corridor Five (GTJ10M515812V0C.xml) door_1304678396366: a
 *     door_asset_jethimadh_tower_interior_lock02 door at world 132,-549,
 *     key_id 5 (the Red-Green Triangle Key, Room 16's), target
 *     LCR8MORFJI12IR4 "Room 23", arriving at -1919,-135. Room 23 is a private
 *     per-player instance (player.js teleportToLocation instances_instance_me;
 *     npc_widget.js checks container.isInstance('tower_quest')).
 *   items/npc_widget.js, Greeterbot Sentry G-42 (instance variant widgetTin;
 *     both Snaps and the Mezzanine show the wooden one): on collision
 *     (apiSetHitBox 400 x 400) it talks you through one of three openings by
 *     level and quest state, leads you to x 1250 (leadToGwen) and says "That's
 *     it. Just up to your right."; too young (under level 12) or declining the
 *     paid repeat earns 50 currants and a teleport back to Corridor Five
 *     (LTJ10M515812V0C 102,-534); a repeat costs 100 currants and clears the
 *     chain from the quest log (repeatingTower). Each greeting schedules the
 *     instance's "Are you stuck?" prompt for 2 minutes later.
 *   items/npc_gwendolyn.js, the Ghost of Gwendolyn: on collision (400 x 400)
 *     she offers tower_quest (with tower_quest_part3, or part3repeat on a paid
 *     repeat) unless part 3 or its repeat is done. tower_quest's onAccepted
 *     opens Area 42 (js/quest-rooms/gwendolyn.js).
 * The room's geometry is lost (no G/L XML, no street JSON). Two player Snaps
 * (research/wayback/raw/snaps/gwendolyn_room_23/, reference only) lay it out:
 *   S1 PHV2FDTQK362HC8 (2012-11-20, "weird lil dude"): black, a big red-brown
 *      ringed trunk with the Greeterbot hovering at its foot beside the
 *      avatar, stacked brown rock ledges stepping up to the right, bamboo
 *      posts hanging over them with gold tassels and a faint up arrow;
 *   S2 PUV6JI38G573EC3 (2012-12-09, "I believe this is yours?"): a black void
 *      over a dark dirt mound, roots with seed pods hanging from above, the
 *      pale ghost on the left and a big ribbed orange gourd with dark slits on
 *      the right.
 * Every piece is a firebog.swf street deco (CC0, glitch-locations): the
 * trunk legs_moss_1, the ledges front_ground_set_1..3, the mound
 * ground_generic_1/2, the posts firebog_ladder_tile_center_01_vine with
 * charm_1/2 tassels, the roots hanging_braches1/2, the gourd bottletree_body2
 * with bottletree_face1 slits; the up arrow
 * (firebog_up_arrows) is rendered by tools/room-art/build.py (set
 * gwendolyn_room_23) and drawn by the feature. No Snap pixels ship.
 *
 * Layout (remake, from the Snaps round the source points): you arrive at the
 * left by the trunk and the Greeterbot ("Proceed upstairs"); three ledges
 * climb to a long upper walk the Greeterbot leads you along to x 1250; one
 * more step "up to your right" is the mound under the roots where Gwendolyn
 * waits, the gourd at the far end. The way out stands where you arrive, as in
 * the rebuilt tower rooms.
 *
 * tools/build-tower-rooms.mjs writes the street JSON with the tower rooms and
 * links Corridor Five's door.
 */

import { towerRoomIndexEntry } from './tower-rooms.js?v=7b2aa06a';
import { anyTowerRoomStreet, barriersFor, collector, flat } from './tower-challenge-rooms.js?v=9e39f503';

export const ROOM_23_TSID = 'GCR8MORFJI12IR4';
export const ROOM_23_SOURCE_TSID = 'LCR8MORFJI12IR4';
export const CORRIDOR_FIVE_TSID = 'GTJ10M515812V0C';
/** Corridor Five's archived locked door into Room 23 (key 5). */
export const ROOM_23_DOOR = Object.freeze({ id: 'door_1304678396366', x: 132, y: -549, key: 5, arrive: Object.freeze({ x: -1919, y: -135 }) });
/**
 * Hub 79: Corridor Five's door connects to hub_id 79 (GTJ10M515812V0C.xml
 * door_1304678396366), and inc_data_maps_prod.js maps_get_hubs() names hub 79
 * "Tower Quest" (maps_get_streets lists Room 23 under it). The street data keeps
 * that hub. A player stands in a tower_quest instance of the room, though
 * (npc_widget.js 423/431/499 isInstance('tower_quest')), and location.js 3311
 * sends an instance hub_name '', so the game shows no hub line there (G363,
 * features/gwendolyn-room-23-feature.js labelFor / prepareStreet).
 */
export const ROOM_23_HUB = Object.freeze({ hubId: '79', hubName: 'Tower Quest' });
export const ROOM_23_SOURCE = 'reconstruction: Room 23 (LCR8MORFJI12IR4, not in tinyspeck/glitch-locations); door, arrival and NPC rules from the archive and GSJS, layout from two player Snaps; art from firebog.swf (CC0)';
export const ROOM_23_ART_ROOT = 'assets/sprites/quest-rooms/gwendolyn/room_23/';

export const TASK = 'tower_quest';
export const PART2 = 'tower_quest_part2';
export const PART3 = 'tower_quest_part3';
export const PART3_REPEAT = 'tower_quest_part3repeat';

/* ------------------------------------------------------------------ */
/* Source rules (items/npc_widget.js, items/npc_gwendolyn.js)           */
/* ------------------------------------------------------------------ */

/** Both NPCs: apiSetHitBox(400, 400), so a collision is within 200 px each way. */
export const HIT_HALF = 200;
/** npc_widget onPlayerCollision: stats_get_level() < 12 is "not quite ready". */
export const MIN_LEVEL = 12;
/** npc_widget 'go-again': stats_has_currants(100) / stats_remove_currants(100). */
export const REPEAT_COST = 100;
/** npc_widget 'ok-too-young' and 'take-currants': stats_add_currants(50). */
export const CONSOLATION = 50;
/** npc_widget leadToGwen: apiFindPath(1250, this.y); npc_walk_speed 300. */
export const LEAD_X = 1250;
export const LEAD_SPEED = 300;
/** onPlayerCollision: instances_schedule_exit_prompt('tower_quest', 2*60). */
export const EXIT_PROMPT_MS = 2 * 60 * 1000;
/** npc_widget onConversation 'teleport': teleportToLocationDelayed('LTJ10M515812V0C', 102, -534). */
export const TELEPORT_OUT = Object.freeze({ tsid: CORRIDOR_FIVE_TSID, x: 102, y: -534 });

export const GREETERBOT_LABEL = 'Greeterbot Sentry G-42';
export const GWENDOLYN_LABEL = 'Ghost of Gwendolyn';

/**
 * npc_widget.js conversation beats, by talkChoice: [text, button, next].
 * `next` is the button's value; the keys are the source's own.
 */
export const GREETER_LINES = Object.freeze({
  // onPlayerCollision openings.
  too_young: Object.freeze(['Hail, innocent wanderer. I have something to show you, but sense you are not quite ready.', 'If you say so', 'if-you-say-so']),
  done: Object.freeze(['By your radiant glow of self-awareness, I see that you have already followed the path of Gwendolyn.', 'Yes, s’true', 'yes-true']),
  first: Object.freeze(['Well met, adventurer. I am Greeterbot Sentry G-42. I sense you’re ready for what is about to be revealed.', 'OK', 'quest-ok']),
  // nextConversation.
  'if-you-say-so': Object.freeze(['Don’t worry, it’s not rude. Just come back when you have lived a little longer. Like, when you’ve hit level 12, perhaps?', 'OK', 'ok-too-young']),
  'ok-too-young': Object.freeze(['Thanks for your understanding. Here’s something for your trouble.', 'OK', 'teleport']),
  'yes-true': Object.freeze(['But self-awareness can be fleeting. Do you feel you are falling out of touch with your mind?', 'Well, now that you mention it …', 'out-of-touch']),
  'out-of-touch': Object.freeze(['I can admit you once again to visit my mistress and embark on the pilgrimage to your inner self for a cost of only 100 currants. Operating a vision quest isn\'t cheap, you understand.', 'I\'ll do it!', 'go-again']),
  'go-again': Object.freeze(['Very good. This way; follow me.', 'Lead on!', 'lead-on']),
  'go-again-broke': Object.freeze(['It seems you lack the necessary funds.', 'I\'m just a little down on my luck, is all.', 'take-currants']),
  'take-currants': Object.freeze(['Then go forth, and take a little curranty blessing as thanks for your repeat custom.', 'OK', 'teleport']),
  'quest-ok': Object.freeze(['I am not the one to reveal it though. Proceed upstairs. The Ghost of Gwendolyn is waiting to speak to you.', 'Ghost?', 'ghost']),
  ghost: Object.freeze(['Yes, Ghost. My mistress will tell you that story herself.', 'OK', 'see-gwen']),
  'see-gwen': Object.freeze(['This way; follow me.', 'Lead on!', 'lead-on']),
  // onPlayerCollision once it has led you (sendPlayerOn).
  'go-right': Object.freeze(['That’s it. Just up to your right.', 'Thanks.', 'go-right']),
});
/** 'out-of-touch' has a second button (and on_cancel 'take-currants'). */
export const REPEAT_DECLINE = 'Too rich for my blood.';
/** players/inc_instances.js instances_show_exit_prompt. */
export const EXIT_PROMPT = Object.freeze({ text: 'Are you stuck? Do you want to leave this place?', yes: 'Yes, please', no: 'No thanks' });

const questStatus = (qs, id) => {
  if (qs?.active?.[id]) return 'todo';
  return (qs?.completed || []).includes(id) ? 'done' : 'none';
};

/** npc_widget onPlayerCollision: which opening the Greeterbot speaks. */
export function greeterOpening(questState, level) {
  if ((Number(level) || 0) < MIN_LEVEL) return 'too_young';
  if (questStatus(questState, TASK) === 'done') return 'done';
  return 'first';
}

/**
 * The conversation after an opening, as the button presses walk it:
 * [{ key, text, button }] up to an ending ('teleport' or 'lead-on'), with
 * `currants` on the beat that pays (and `cost` on the paid repeat). For the
 * repeat, `canPay` picks 'go-again' or the "lack the necessary funds" branch;
 * `decline` takes the second button ("Too rich for my blood.").
 */
export function greeterScript(opening, { canPay = false, decline = false } = {}) {
  const beats = [];
  let key = opening;
  for (let guard = 0; guard < 12; guard += 1) {
    if (key === 'go-again' && !canPay) key = 'go-again-broke';
    const row = GREETER_LINES[key];
    if (!row) break;
    const beat = { key, text: row[0], button: row[1] };
    if (key === 'ok-too-young' || key === 'take-currants') beat.currants = CONSOLATION;
    if (key === 'go-again') beat.cost = REPEAT_COST;
    if (key === 'out-of-touch') beat.second = REPEAT_DECLINE;
    beats.push(beat);
    const next = key === 'out-of-touch' && decline ? 'take-currants' : row[2];
    if (next === 'teleport' || next === 'lead-on') return { beats, end: next };
    key = next;
  }
  return { beats, end: 'none' };
}

/**
 * 'go-again' (paid): quests_remove the whole chain so Gwendolyn offers it
 * again; the source sets pc.repeatingTower so the squid offers part3repeat.
 * The remake keeps part 3's first completion as that flag
 * (gwendolyn.js thirdPartFor) and drops the rest. Returns true when anything
 * changed.
 */
export function clearChainForRepeat(questState) {
  if (!questState) return false;
  let changed = false;
  questState.active ||= {};
  for (const id of [TASK, PART2, PART3, PART3_REPEAT]) {
    if (questState.active[id]) {
      delete questState.active[id];
      changed = true;
    }
  }
  const before = (questState.completed || []).length;
  questState.completed = (questState.completed || []).filter((id) => id !== TASK && id !== PART2 && id !== PART3_REPEAT);
  if (questState.completed.length !== before) changed = true;
  const managed = questState.offers?.managed;
  if (managed) for (const id of [TASK, PART2, PART3_REPEAT]) delete managed[id];
  return changed;
}

/**
 * npc_gwendolyn onPlayerCollision: offerQuests unless part 3 (or its repeat)
 * is done; a paid repeat cleared them in the source, the remake's flag says so.
 */
export function gwendolynOffers(questState, { repeatPaid = false } = {}) {
  if (questStatus(questState, TASK) !== 'none') return false;
  const done = questStatus(questState, PART3) === 'done' || questStatus(questState, PART3_REPEAT) === 'done';
  return !done || repeatPaid;
}

/* ------------------------------------------------------------------ */
/* Layout (world)                                                       */
/* ------------------------------------------------------------------ */

const BELOW_FLOOR = 300;
export const ROOM_23 = Object.freeze({
  bounds: Object.freeze({ l: -2150, r: 2050, t: -1300, b: BELOW_FLOOR }),
  floor: -135,
  /** Three ledges up from the floor (85 px each: one plain jump), then the walk and the mound. */
  tiers: Object.freeze([
    Object.freeze({ id: 't1', x1: -1600, x2: -1300, y: -220 }),
    Object.freeze({ id: 't2', x1: -1300, x2: -1000, y: -305 }),
    Object.freeze({ id: 'walk', x1: -1000, x2: 1300, y: -390 }),
    Object.freeze({ id: 'mound', x1: 1300, x2: 2010, y: -470 }),
  ]),
  floorRight: -1600,
  greeter: Object.freeze({ x: -1730, hover: 40 }),
  gwen: Object.freeze({ x: 1580 }),
  gourd: Object.freeze({ x: 1860 }),
  posts: Object.freeze({ x1: -1330, x2: -1110, top: -1300, bottom: -520 }),
  arrow: Object.freeze({ x: -1070, y: -500 }),
});

/** The Greeterbot's way to x 1250: up the ledges to the walk (it hovers; npc_can_climb is false, so it glides). */
export function leadPath() {
  const f = ROOM_23.floor;
  const [t1, t2, walk] = ROOM_23.tiers;
  return [
    { x: ROOM_23.greeter.x, y: f },
    { x: t1.x1 + 40, y: f },
    { x: t1.x1 + 120, y: t1.y },
    { x: t2.x1 + 120, y: t2.y },
    { x: walk.x1 + 120, y: walk.y },
    { x: LEAD_X, y: walk.y },
  ];
}

function mg(sprite, x, y, w, h, z, extra = {}) {
  return { sprite, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), z, r: 0, ...extra, layer: 'mg' };
}

/**
 * S1's stacked rock ledges: front_ground_set rows under a tier's top, from
 * its walking line down past the level below (each row 160 px, the top row in
 * front), tiled across its width.
 */
function ledgeDecos(decos, tier, downTo, zBase) {
  const sets = [['front_ground_set_1', 309, 191.6], ['front_ground_set_3', 383.5, 209.7], ['front_ground_set_2', 310, 135.5]];
  const width = tier.x2 - tier.x1;
  const n = Math.max(1, Math.round(width / 300));
  const w = (width / n) * 1.3;
  const rowH = 160;
  let row = 0;
  for (let top = tier.y - 14; top < downTo; top += rowH - 30, row += 1) {
    for (let i = 0; i < n; i += 1) {
      const [sprite] = sets[(i + row) % sets.length];
      const cx = tier.x1 + (i + 0.5) * (width / n);
      decos.push(mg(sprite, cx, top + rowH, w, rowH, zBase - row, (i + row) % 2 ? { flip: true } : {}));
    }
  }
}

function buildRoom23() {
  const c = collector();
  const R = ROOM_23;
  const { bounds, floor } = R;
  const decos = c.decos;
  const t = Object.fromEntries(R.tiers.map((tier) => [tier.id, tier]));

  // Platforms and the ledge faces (walls, solid both ways, from each tier's
  // top down past the level below).
  const why = {
    floor: 'Arrival -1919,-135 (Corridor Five door_1304678396366 connect x/y): the floor you land on.',
    ledges: 'S1: stacked rock ledges step up to the right of the trunk; the Greeterbot says "Proceed upstairs". Remake: three rises of 85 px (one plain jump each).',
    walk: 'npc_widget leadToGwen: apiFindPath(1250, this.y): the Greeterbot leads you along one level to x 1250. Remake: the walk on top of the ledges.',
    mound: 'npc_widget: "That’s it. Just up to your right." S2: a dark mound in a black void, roots overhead, the ghost and the gourd. Remake: one more 80 px step right of x 1300.',
  };
  c.platforms.push(flat('r23_floor', bounds.l + 40, R.floorRight + 20, floor, why.floor));
  c.platforms.push(flat('r23_t1', t.t1.x1, t.t1.x2 + 20, t.t1.y, why.ledges));
  c.platforms.push(flat('r23_t2', t.t2.x1, t.t2.x2 + 20, t.t2.y, why.ledges));
  c.platforms.push(flat('r23_walk', t.walk.x1, t.walk.x2 + 20, t.walk.y, why.walk));
  c.platforms.push(flat('r23_mound', t.mound.x1, t.mound.x2, t.mound.y, why.mound));
  const faces = [
    ['r23_face_t1', t.t1.x1, t.t1.y, floor],
    ['r23_face_t2', t.t2.x1, t.t2.y, t.t1.y],
    ['r23_face_walk', t.walk.x1, t.walk.y, t.t2.y],
    ['r23_face_mound', t.mound.x1, t.mound.y, t.walk.y],
  ];
  const barriers = [
    ...barriersFor(bounds, 'r23'),
    ...faces.map(([id, x, top, below]) => ({ id: `wall_${id}`, x, y: top, h: below - top + 30, pc_perm: null, why: 'Ledge face: climb it with a jump.' })),
  ];

  // S1, left: the trunk the Greeterbot hovers by, dirt underfoot.
  decos.push(mg('legs_moss_1', -1760, floor + 40, 380, 1120, 2));
  decos.push(mg('legs_moss_2', -2080, floor + 30, 300, 520, 1, { flip: true }));
  for (let x = bounds.l + 120, i = 0; x < R.floorRight + 100; x += 300, i += 1) {
    decos.push(mg('front_ground_set_2', x, floor + 150, 330, 165, 4, i % 2 ? { flip: true } : {}));
  }
  // S1: the ledges, each stacked down past the level below.
  ledgeDecos(decos, t.t1, floor + 60, 12);
  ledgeDecos(decos, t.t2, floor + 60, 9);
  ledgeDecos(decos, t.walk, floor + 60, 6);
  ledgeDecos(decos, t.mound, floor + 60, 15);
  // S2: the mound's dark dirt on top of the last ledge.
  for (let x = t.mound.x1 + 120, i = 0; x < t.mound.x2; x += 240, i += 1) {
    decos.push(mg(i % 2 ? 'ground_generic_2' : 'ground_generic_1', x, t.mound.y + 34, 300, 70, 18));
  }
  // S1, right: bamboo posts hanging over the ledges, gold tassels at their feet.
  const posts = R.posts;
  const tile = { w: 24, h: 66 };
  let p = 0;
  for (let x = posts.x1; x <= posts.x2; x += 52, p += 1) {
    const bottom = posts.bottom - (p % 2) * 40;
    for (let y = bottom; y > posts.top - tile.h; y -= tile.h) decos.push(mg('firebog_ladder_tile_center_01_vine', x, y, tile.w, tile.h, 20));
    decos.push(mg(p % 2 ? 'charm_2' : 'charm_1', x, bottom + 78, 30, 96, 21));
  }
  // S2: roots with seed pods hanging over the mound, the gourd at the far end.
  decos.push(mg('hanging_braches1', 1080, -640, 520, 440, 3, { flip: true }));
  decos.push(mg('hanging_braches1', 1440, -660, 600, 500, 3));
  decos.push(mg('hanging_braches2', 1800, -650, 440, 450, 3));
  decos.push(mg('hanging_braches2', 640, -620, 380, 390, 3));
  decos.push(mg('hanging_braches1', 160, -640, 480, 410, 3));
  decos.push(mg('hanging_braches2', -420, -630, 360, 370, 3, { flip: true }));
  decos.push(mg('bottletree_body2', R.gourd.x, t.mound.y + 18, 300, 352, 16));
  decos.push(mg('bottletree_face1', R.gourd.x + 70, t.mound.y - 120, 120, 30, 17, { r: -70 }));
  decos.push(mg('bottletree_face1', R.gourd.x + 105, t.mound.y - 175, 90, 24, 17, { r: -78 }));
  decos.push(mg('bottletree_face2', R.gourd.x + 20, t.mound.y - 70, 110, 26, 17, { r: -64 }));

  return {
    tsid: ROOM_23_TSID,
    sourceTsid: ROOM_23_SOURCE_TSID,
    label: 'Room 23',
    hub: ROOM_23_HUB,
    swf: 'firebog.swf',
    bounds,
    platforms: c.platforms,
    barriers,
    decos,
    ladders: [],
    doors: [
      {
        id: 'door_r23_wayout',
        x: ROOM_23_DOOR.arrive.x,
        y: floor,
        w: 150,
        h: 190,
        sprite: 'door_asset_bottletree',
        connect: { tsid: 'LTJ10M515812V0C', label: 'Corridor Five', x: ROOM_23_DOOR.x, y: ROOM_23_DOOR.y, hub_id: '77' },
        why: 'Remake: back through Corridor Five\'s Room 23 door (world 132,-549), the way you came in, standing where you arrive as in the rebuilt tower rooms. The source left by the instance\'s exit prompt or the Greeterbot\'s teleport.',
      },
    ],
    spots: [],
    why: {
      room: 'Maps hub 79: LCR8MORFJI12IR4 "Room 23" (the tower_quest instance). npc_widget.js / npc_gwendolyn.js: the Greeterbot greets you here, Gwendolyn offers Gwendolyn\'s Task here.',
      size: 'Remake: 4200 x 1300 above y 0 (plus 300 under the floor). The source fixes the arrival (-1919,-135) and the Greeterbot\'s lead to x 1250; the rest is laid out from the two Snaps.',
      decor: 'Firebog street decos matched to the Snaps (see the file header) in a black void.',
    },
  };
}

export const ROOM_23_ROOM = buildRoom23();
export const GWENDOLYN_ROOMS = Object.freeze([ROOM_23_ROOM]);
/** Corridor Five's archived door into the room (tools/build-tower-rooms.mjs links it). */
export const GWENDOLYN_DOOR_LINKS = Object.freeze([{ street: CORRIDOR_FIVE_TSID, door: ROOM_23_DOOR.id, room: ROOM_23_TSID }]);

export const isRoom23 = (tsid) => tsid === ROOM_23_TSID || tsid === ROOM_23_SOURCE_TSID;

/** World point -> street screen point. */
export const toScreen = (x, y) => ({ x: x - ROOM_23.bounds.l, y: y - ROOM_23.bounds.t });

/** Feet line (world) of the surface under x, the topmost one at or below `nearY`. */
export function surfaceY(x, nearY = Infinity) {
  let best = null;
  for (const p of ROOM_23_ROOM.platforms) {
    if (x < Math.min(p.x1, p.x2) || x > Math.max(p.x1, p.x2)) continue;
    if (p.y1 > nearY + 1) continue;
    if (best == null || p.y1 > best) best = p.y1;
  }
  if (best != null) return best;
  for (const p of ROOM_23_ROOM.platforms) {
    if (x < Math.min(p.x1, p.x2) || x > Math.max(p.x1, p.x2)) continue;
    if (best == null || p.y1 < best) best = p.y1;
  }
  return best;
}

/** The street JSON: the tower rooms' format. */
export function room23Street(room = ROOM_23_ROOM) {
  return { ...anyTowerRoomStreet(room), source: ROOM_23_SOURCE };
}

/** The index.json row: hub 79. */
export function room23IndexEntry(room = ROOM_23_ROOM) {
  return { ...towerRoomIndexEntry(room), hubId: ROOM_23_HUB.hubId, hubName: ROOM_23_HUB.hubName };
}
