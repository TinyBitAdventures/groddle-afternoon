/**
 * What an owner set down on their home street for their animals, as a visitor sees it in
 * multiplayer: the Magic Sticks. Pure (no Pixi, no DOM); features/yard-verbs-mp-feature.js draws
 * them on a visit, from the site's view of the owner's stored save (groddle-afternoon-site
 * src/HomeYard.php: "sticks").
 *
 * In the original each was an item in the location, so everyone standing there saw it:
 * - A Magic Stick someone else placed: Pick up is there but disabled, "This Magic Pig Stick belongs
 *   to somebody else. Get your own!" (GameServerJS items/magic_pig_stick.js verbs.pickup 137-158,
 *   magic_chicken_stick.js:155, magic_butterfly_stick.js:167); changing its range is the owner's
 *   (change_radius 116-121: hidden).
 */

const DIR = 'assets/sprites/animals/';

/** The verb a visitor finds on a placed stick, as the source words it. */
export const STICK_PICKUP = Object.freeze({ id: 'pickup', label: 'pick up', tooltip: 'Put it in your pack' });

/**
 * Each class as animal-husbandry-feature draws the owner's own (its art, world scale and hit box)
 * and names it (js/animal-husbandry.js MAGIC_STICKS). `locked`: the stick's refusal to anyone but
 * its owner.
 */
export const YARD_FIXTURES = Object.freeze({
  magic_pig_stick: Object.freeze({ kind: 'stick', label: 'Pig Stick', art: `${DIR}magic_pig_stick_placed.webp`, scale: 0.5, hitW: 50, hitH: 90, locked: 'This Magic Pig Stick belongs to somebody else. Get your own!' }),
  magic_chicken_stick: Object.freeze({ kind: 'stick', label: 'Chicken Stick', art: `${DIR}magic_chicken_stick_placed.webp`, scale: 0.5, hitW: 50, hitH: 90, locked: 'This Chicken Stick belongs to somebody else. Get your own!' }),
  magic_butterfly_stick: Object.freeze({ kind: 'stick', label: 'Butterfly Stick', art: `${DIR}magic_butterfly_stick_placed.webp`, scale: 0.5, hitW: 50, hitH: 90, locked: 'This Butterfly Stick belongs to somebody else. Get your own!' }),
});

/**
 * What to draw on a visit: the view's sticks, each { id, kind, classTsid, x } with its class's
 * label, art, scale and hit box.
 */
export function yardFixtureRows(view) {
  const out = [];
  for (const [list, kind] of [[view?.sticks, 'stick']]) {
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

/** A visitor's menu on one: a stick's disabled Pick up with its refusal. */
export function yardFixtureVerbs(row) {
  if (row?.kind !== 'stick') return [];
  return [{ ...STICK_PICKUP, enabled: false, reason: row.locked }];
}
