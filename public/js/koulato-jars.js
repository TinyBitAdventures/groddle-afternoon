/**
 * Koulato Cluster's three firefly jars (register G679; Jethimadh, GIF10RP1DBU11NU). Pure rules; the
 * koulato-jars feature runs them.
 *
 * What survives in source (LIF10RP1DBU11NU.xml events, all of them in the street JSON):
 * - player_enter: loc.num += 1; at 30, place_jars (reset_vars: num = 0, j1-3 false; the three jar5
 *   decos fade in; flag jars_on set, completed cleared). So the jars come out once every 30 arrivals.
 * - jarN_on / jarN_off (guarded by jars_on): a light pool and fireflies fade in or out over jar N and
 *   loc.jN follows; jarN_on then runs check_done: when j1, j2 and j3 are all true, complete and
 *   turn_off. Three Collision-triggered Event Boxes (objrefs IHV5MK0AH2E36A6, IHV5M2S9H2E3QCB,
 *   IHV5MDU9H2E3N6J) fired them, on enter and on exit: one Glitch on each jar at once, a puzzle for
 *   three.
 * - complete (once, flag completed): three larger light pools show, hide_all puts everything out a
 *   second later (3 s fade), jars_on clears, and three Firefly Jars with 7 Fireflies each
 *   (createItemStack firefly_jar, num_flies 7) appear at x -270, -98 and 62, y -800, above the jars,
 *   to fall to the ledge.
 *
 * The box places are lost. OUR reading: each stands on the walkable ledge in front of its jar. The
 * jars are drawn on a back layer (T_1352760858565, 4750 of the street's 5000) standing on rock above
 * the ledge, and Tiny Speck's reward points fall onto that ledge 15 px left of each jar; the still
 * "Koulato Cluster (with jars)" (GoodnightGroddleArchive full street) shows the three jars there.
 *
 * Ours: the arrivals counted are this player's own arrivals plus other players' arrivals seen on the
 * street online (the source counted every arrival by anyone); the count is saved. A jar lights for
 * any Glitch standing in its box, yours or another player's as drawn here. Each player's own game
 * runs the puzzle, so when it completes every player standing on a jar gets the one Firefly Jar that
 * fell at their jar (three players, three jars, as in the source). Solo, one Glitch cannot hold three
 * jars at once: the jars light under you and go out when you step off.
 */

export const KOULATO_TSID = 'GIF10RP1DBU11NU';

/** player_enter: loc.num >= 30 calls place_jars. */
export const JAR_ARRIVALS = 30;

/** firefly_jar.setInstanceProp('num_flies', 7). */
export const JAR_FLIES = 7;

/** Every deco the events show or hide (hide_all's list): hidden until place_jars. */
export const JAR_DECOS = Object.freeze([
  'jar5_1352760858569', 'jar5_1352760858571', 'jar5_1352760858570',
  'firebog_light_pool_1352760858566', 'firebog_light_pool_1352760858567', 'firebog_light_pool_1352760858568',
  'fireflies_1352760858572', 'fireflies_1352760858573', 'fireflies_1352760858574',
  'firebog_light_pool_1352766458727', 'firebog_light_pool_1352766458728', 'firebog_light_pool_1352766458729',
]);

/**
 * The three lost boxes, screen space, bottom-centre (like street.boxes), and where each jar's reward
 * lands (createItemStack point, world + 2500, + 1500). jarN_on lights the pool over that jar:
 * jar1_on firebog_light_pool_..568 (x 2166 of 4750), jar2 ..567 (2327), jar3 ..566 (2486).
 */
export const JAR_BOXES = Object.freeze([
  Object.freeze({ n: 1, x: 2245, y: 1180, w: 130, h: 220, drop: Object.freeze({ x: 2230, y: 700 }), why: 'Jar jar5_..569 at x 2133 of the 4750 back layer, seen at 2245 of 5000; the ledge under it (plat_1301558827647/48) at y 1165; the source drops its reward at x -270 (2230).' }),
  Object.freeze({ n: 2, x: 2416, y: 1180, w: 130, h: 220, drop: Object.freeze({ x: 2402, y: 700 }), why: 'Jar jar5_..571 at 2295 of 4750, seen at 2416; ledge plat_1301557357247/48 at 1167; reward x -98 (2402).' }),
  Object.freeze({ n: 3, x: 2582, y: 1180, w: 130, h: 220, drop: Object.freeze({ x: 2562, y: 700 }), why: 'Jar jar5_..570 at 2453 of 4750, seen at 2582; ledge plat_1301557357249/50 at 1169; reward x 62 (2562).' }),
]);

const sameTsid = (a, b) => String(a || '').slice(1) === String(b || '').slice(1);

/** Koulato Cluster (either TSID prefix). */
export const isKoulatoCluster = (tsid) => sameTsid(tsid, KOULATO_TSID);

/** Feet (screen space) inside a jar box. */
export function inJarBox(box, x, y) {
  return Math.abs(Number(x) - box.x) <= box.w / 2 && Number(y) <= box.y + 4 && Number(y) >= box.y - box.h;
}

/** Which jars have a Glitch on them: `feet` is every Glitch's feet [{ x, y }]. */
export function litJars(feet, boxes = JAR_BOXES) {
  return boxes.map((box) => (feet || []).some((p) => p && inJarBox(box, p.x, p.y)));
}

/** The saved slice: { arrivals, placed }. */
export function normalizeJarSave(seed) {
  const n = Math.floor(Number(seed?.arrivals));
  return { arrivals: Number.isFinite(n) && n > 0 ? Math.min(n, JAR_ARRIVALS) : 0, placed: seed?.placed === true };
}

/**
 * One arrival on the street (player_enter's loc.num += 1). Mutates the slice; answers true when
 * place_jars runs now (the count starts again at 0, reset_vars).
 */
export function countArrival(save) {
  save.arrivals += 1;
  if (save.arrivals < JAR_ARRIVALS) return false;
  save.arrivals = 0;
  save.placed = true;
  return true;
}
