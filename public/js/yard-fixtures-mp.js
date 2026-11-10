/**
 * What an owner set down on their home street for their animals, as a visitor sees it in
 * multiplayer: the Magic Sticks and Remote Herdkeeping's machines. Pure (no Pixi, no DOM);
 * features/yard-verbs-mp-feature.js draws them on a visit, from the site's view of the owner's
 * stored save (groddle-afternoon-site src/HomeYard.php: "sticks", "machines").
 *
 * In the original each was an item in the location, so everyone standing there saw it:
 * - A Magic Stick someone else placed: Pick up is there but disabled, "This Magic Pig Stick belongs
 *   to somebody else. Get your own!" (GameServerJS items/magic_pig_stick.js verbs.pickup 137-158,
 *   magic_chicken_stick.js:155, magic_butterfly_stick.js:167); changing its range is the owner's
 *   (change_radius 116-121: hidden).
 * - A Meat Collector or Butterfly Milker: someone who is not the owner and holds no key has no
 *   verb on it (meat_collector.js collect 131-134 and canPickup 171-180 with takeable.js 20-25:
 *   hidden; butterfly_milker.js 131-134, 172-181).
 * - A Piggy Feeder: Pick up is hidden the same way (piggy_feeder.js canPickup 242-250).
 *
 * Ours: a visitor only looks. In the source a key-holder could collect from the owner's collector
 * and milker, and anyone who knew Remote Herdkeeping could stock a Piggy Feeder (piggy_feeder.js
 * deposit 93-113 asks for no owner); here what a machine holds and takes stays its owner's game's,
 * and the site does not send it.
 */

const DIR = 'assets/sprites/animals/';

/** The verb a visitor finds on a placed stick, as the source words it. */
export const STICK_PICKUP = Object.freeze({ id: 'pickup', label: 'pick up', tooltip: 'Put it in your pack' });

/**
 * Each class as animal-husbandry-feature draws the owner's own (its art, world scale and hit box)
 * and names it (js/animal-husbandry.js MAGIC_STICKS, REMOTE_MACHINES). `locked`: the stick's
 * refusal to anyone but its owner.
 */
export const YARD_FIXTURES = Object.freeze({
  magic_pig_stick: Object.freeze({ kind: 'stick', label: 'Pig Stick', art: `${DIR}magic_pig_stick_placed.webp`, scale: 0.5, hitW: 50, hitH: 90, locked: 'This Magic Pig Stick belongs to somebody else. Get your own!' }),
  magic_chicken_stick: Object.freeze({ kind: 'stick', label: 'Chicken Stick', art: `${DIR}magic_chicken_stick_placed.webp`, scale: 0.5, hitW: 50, hitH: 90, locked: 'This Chicken Stick belongs to somebody else. Get your own!' }),
  magic_butterfly_stick: Object.freeze({ kind: 'stick', label: 'Butterfly Stick', art: `${DIR}magic_butterfly_stick_placed.webp`, scale: 0.5, hitW: 50, hitH: 90, locked: 'This Butterfly Stick belongs to somebody else. Get your own!' }),
  meat_collector: Object.freeze({ kind: 'machine', label: 'Meat Collector', art: `${DIR}meat_collector.webp`, scale: 1, hitW: 70, hitH: 80 }),
  butterfly_milker: Object.freeze({ kind: 'machine', label: 'Butterfly Milker', art: `${DIR}butterfly_milker.webp`, scale: 1, hitW: 70, hitH: 80 }),
  piggy_feeder: Object.freeze({ kind: 'machine', label: 'Piggy Feeder', art: `${DIR}piggy_feeder.webp`, scale: 1, hitW: 70, hitH: 80 }),
});

/** The most machines one view shows (the site's HomeYard::YARD_MACHINES_MAX). */
export const YARD_MACHINES_MAX = 24;

/** The site's "machines" rows, checked: [{ classTsid, x }]. */
export function normalizeYardMachines(list) {
  return (Array.isArray(list) ? list : [])
    .filter((m) => YARD_FIXTURES[m?.classTsid]?.kind === 'machine' && Number.isFinite(Number(m.x)))
    .slice(0, YARD_MACHINES_MAX)
    .map((m) => ({ classTsid: m.classTsid, x: Math.round(Number(m.x)) }));
}

/**
 * What to draw on a visit: the view's sticks, then its machines, each { id, kind, classTsid, x }
 * with its class's label, art, scale and hit box.
 */
export function yardFixtureRows(view) {
  const out = [];
  for (const [list, kind] of [[view?.sticks, 'stick'], [view?.machines, 'machine']]) {
    (Array.isArray(list) ? list : []).forEach((row, i) => {
      const def = YARD_FIXTURES[row?.classTsid];
      if (def?.kind !== kind || !Number.isFinite(Number(row.x))) return;
      out.push({ ...def, id: `${kind}:${i}`, classTsid: row.classTsid, x: Math.round(Number(row.x)) });
    });
  }
  return out;
}

/** What is drawn, as one string: a change means the owner set something down or took it up since. */
export function yardFixturesKey(rows) {
  return (Array.isArray(rows) ? rows : []).map((r) => `${r.classTsid}@${r.x}`).join(',');
}

/** A visitor's menu on one: a stick's disabled Pick up with its refusal; nothing on a machine. */
export function yardFixtureVerbs(row) {
  if (row?.kind !== 'stick') return [];
  return [{ ...STICK_PICKUP, enabled: false, reason: row.locked }];
}
