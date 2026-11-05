/**
 * "What it is for" on the item pages (tools/catalog/build.mjs), for the items
 * the recipe, conversion and food rules there say nothing about (Austin
 * 2026-11-05: 419 of 844 in-remake items had an empty section). Every line is
 * what the remake does with the item, checked in its code:
 *
 *  - Generated from the remake's own data, so the numbers follow the game:
 *    furniture (js/homes-catalog.js FURNITURE_CATALOG, js/home-decor.js,
 *    js/furniture-upgrades.js, js/home-storage.js cabinets, js/home-street-mp.js
 *    sales), cultivation prototypes (CULTIVATION_CLASSES, js/home-cultivation.js),
 *    the Tower (js/home-tower.js), bags (js/pack-slots.js BAG_DEFS,
 *    js/bag-names.js, js/elemental-pouch.js), party packs (js/party-spaces.js)
 *    door keys (the locked doors in assets/streets/G*.json, js/doors.js) and
 *    street projects (assets/content/street-jobs.json: the item and work
 *    requirements of every project class a street, an upgrade or a yard
 *    restoration runs, js/street-jobs.js), on every item they name.
 *  - Written by hand in uses.json, one entry per item: { lines, evidence }
 *    where evidence names the remake's file:line for each claim (checked by
 *    tests/catalog-uses.test.js), or { none, evidence } for an item the
 *    remake gives no use: the page then says so plainly.
 *
 * Lines are plain text (the page escapes them); our own words, no em-dashes.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const here = join(import.meta.dirname);
export const USES_FILE = join(here, 'uses.json');
export const readCurated = () => JSON.parse(readFileSync(USES_FILE, 'utf8'));
const n = (x) => Number(x).toLocaleString('en-US');

/** Where a placed piece goes, by FURNITURE_CATALOG slot. */
const PLACE = {
  floor: 'Set it on the floor of your house, or of a Tower floor, in Decorate mode.',
  wall: 'Hang it on a wall of your house, or of a Tower floor, in Decorate mode.',
  ceiling: 'Hang it from the ceiling of your house, or of a Tower floor, in Decorate mode.',
  rug: 'Lay it on the floor of your house, or of a Tower floor, in Decorate mode.',
};

/** What a cultivation prototype grows into, by CULTIVATION_CLASSES kind (resource nodes by id). */
const GROWS = {
  rock: (d) => `It grows into a ${d.label} you can mine with a pick.`,
  garden: (d) => `It grows into a ${d.gardenType === 'herb' ? 'herb' : 'crop'} garden with ${d.cols * d.rows} plots to plant ${d.gardenType === 'herb' ? 'herb' : 'crop'} seeds in.`,
  patch: () => 'It grows into a Patch you can tend, dig, and plant a Seasoned Bean in to grow a tree.',
  hive: (d, cult) => `It grows into a Firefly Hive that lets out a Firefly every minute, up to ${cult.FIREFLY_HIVE.maxCount}, for you to whistle into a Firefly Jar.`,
  proto_jellisac_mound: () => 'It grows into a Jellisac Mound you can scoop for Clumps of Jellisac.',
  proto_barnacle_pod: () => 'It grows into a Barnacle Pod with Mortar Barnacles you can scrape.',
  proto_dirt_pile: () => 'It grows into a Dirt Pile you can dig with a Shovel.',
  proto_peat: () => 'It grows into a Peat Bog you can harvest for Peat.',
};

/** What a bag holds, by BAG_DEFS holds. */
const HOLDS = {
  any: (d) => `It holds ${d.capacity} stacks of almost anything in one pack slot; not another bag, furniture or Elements.`,
  tool: (d) => `It holds ${d.capacity} tools, one to a slot.`,
  spice: (d) => `It holds ${d.capacity} stacks of spices, and nothing else.`,
  compound: (d) => `It holds ${d.capacity} stacks of alchemical compounds, and nothing else.`,
  cubimal: (d) => `It holds ${d.capacity} Cubimals, and nothing else.`,
  element: (d, psd) => `It holds your Elements: one stack each of Red, Green, Blue and Shiny, up to ${n(psd.STACKMAX.get('element_red'))} of each.`,
};
const FIRST = { spice: 'spices', compound: 'compounds', cubimal: 'Cubimals', element: 'Elements' };

/** Loads the remake's data: returns linesFor(id) -> { lines: [...] } | { none } | null. */
export async function loadUses(root) {
  const pub = join(root, 'public');
  const J = (p) => import(pathToFileURL(join(pub, 'js', p)).href);
  const [cat, decor, upg, storage, cult, tower, ps, psd, party, mp, bn, doors, pouch] = await Promise.all([
    J('homes-catalog.js'), J('home-decor.js'), J('furniture-upgrades.js'), J('home-storage.js'), J('home-cultivation.js'),
    J('home-tower.js'), J('pack-slots.js'), J('pack-slots-data.js'), J('party-spaces.js'), J('home-street-mp.js'), J('bag-names.js'),
    J('doors.js'), J('elemental-pouch.js'),
  ]);
  const curated = readCurated();
  const gen = new Map();

  // Furniture: where it goes, what rests on it, its styles, cabinets, sales online.
  for (const [id, def] of Object.entries(cat.FURNITURE_CATALOG)) {
    if (id === 'furniture_door') {
      gen.set(id, [
        `Set it down on the top floor of your house to start the Build a New Floor project; finishing it adds a floor, up to ${cat.HOME_LIMITS.MAX_FLOORS}, and the Door becomes the way between floors.`,
        'Once its project has started, it can no longer be picked up.',
      ]);
      continue;
    }
    const lines = [def.tabletop ? 'Set it on a table, desk, counter or other surface in your house or a Tower floor in Decorate mode (or on the floor).' : PLACE[def.slot]];
    if (!lines[0]) continue;
    const h = decor.surfaceHeight(id, '');
    if (h > 0 && def.slot === 'floor') lines.push('Tabletop pieces and things you set down in the room rest on top of it.');
    if (h > 0 && def.slot === 'wall') lines.push('Things you set down in the room can rest on it.');
    if (/lamp/.test(id)) lines.push('It casts a pool of warm light in the room.');
    if (storage.isCabinetClass(id)) {
      lines.push(`Open it to store things in its ${storage.cabinetDef(id).capacity} slots, one stack to a slot; it won't take contraband, Elements, furniture or trophies, and must be empty before you pick it up.`);
      lines.push('Online, players you give a key to can open it too.');
    }
    if (storage.isSdbClass(id)) {
      lines.push('Deposit one kind of item in it to show it off on your wall, as many as you like.');
      lines.push('Set a price and, online, visitors to your house can buy from it; collect the currants it earns from the box.');
    }
    const styles = upg.listUpgrades({ classTsid: id }, 'base').filter((r) => r.id !== '0');
    if (styles.length) {
      const free = styles.filter((r) => !r.credits).length;
      lines.push(free === styles.length ? `Upgrade it to one of ${styles.length} other styles, all free.` : `Upgrade it to one of ${styles.length} other styles: ${free} ${free === 1 ? 'is' : 'are'} free and the rest cost currants.`);
    }
    if (mp.canSellClass(id)) lines.push(storage.isStorageClass(id) ? 'Online, once it is empty, you can put it up for sale where it stands, and visitors to your house can buy it.' : 'Online, you can put it up for sale where it stands, and visitors to your house can buy it.');
    gen.set(id, lines);
  }

  // Cultivation prototypes: where, what it costs, what it grows into, how long it lasts.
  for (const [id, d] of Object.entries(cat.CULTIVATION_CLASSES)) {
    const grow = (GROWS[id] || GROWS[d.kind])?.(d, cult);
    if (!grow) continue;
    gen.set(id, [
      `Cultivate it in Cultivate mode on your home street or in your back yard${d.minLevel ? ` from level ${d.minLevel}` : ''}, for ${n(d.baseCost)} iMG or more (the price rises with each thing already growing there).`,
      grow,
      `After ${n(d.maxWear)} uses it wears out; start a Restore project on it to bring it back with more lifespan each time.`,
    ]);
  }
  gen.set('proto_furniture_tower_chassis', [
    `Cultivate it on your home street from level ${tower.TOWER_MIN_LEVEL}, for ${n(tower.TOWER_IMG_COST)} iMG; you can have one, and never in the back yard.`,
    'It stands as scaffolding until you finish its Tower project; then it becomes your Tower.',
  ]);
  gen.set('furniture_tower_chassis', [
    `Go in to reach its floors: it starts with ${tower.TOWER_CONFIG.START_FLOORS} and grows to ${tower.TOWER_CONFIG.MAX_FLOORS} through floor projects at its Workbench, and an elevator takes you between them.`,
    'Decorate each floor with your furniture, as you do your house.',
    `Customize it: pick one of ${Object.keys(tower.TOWER_STYLES).length} styles, choose its parts and paint a name on its sign.`,
  ]);

  // Bags.
  for (const [id, d] of Object.entries(ps.BAG_DEFS)) {
    const lines = [HOLDS[d.holds]?.(d, psd)].filter(Boolean);
    if (!lines.length) continue;
    if (d.limited && FIRST[d.holds]) lines.push(`New ${FIRST[d.holds]} go into it first, before your pack.`);
    if (ps.canSpecializeBag(id)) lines.push('With the Internal Sortitude card you can sort it for one kind of goods (keys, food, herbs, mining and more), and what you pick up goes there first.');
    if (id === 'bag_elemental_pouch') {
      const pct = (v) => Math.round(v * 100);
      const [a, b] = [pouch.SHAKE_DELTAS[pouch.SHAKE_CARD_1], pouch.SHAKE_DELTAS[pouch.SHAKE_CARD_2]];
      lines.push(`With Elemental Shake you can shake it once a day for ${pct(a[0])} to ${pct(a.at(-1))}% more of each Element (${pct(b[0])} to ${pct(b.at(-1))}% with Super Elemental Shake).`);
    }
    if (bn.RENAMABLE_BAGS.includes(id)) lines.push(`Rename it (up to ${bn.BAG_NAME_MAX} letters); drop it and it keeps what is inside until you pick it up again.`);
    gen.set(id, lines);
  }

  // Party packs (not containers): the space they open.
  for (const [id, p] of Object.entries(party.PARTY_PACKS)) {
    const s = party.PARTY_SPACES[p.template];
    if (!s) continue;
    const ext = party.partyExtendOptions({ template: p.template, taster: p.taster });
    gen.set(id, [
      `Activate it to open a private ${s.label} party space for ${p.durationSeconds / 60} minutes; a teleporter appears beside you to take you in.`,
      `Feed currants to the Party ATM inside for more time: ${ext.map((e) => `${e.minutes} minutes for ${n(e.cost)}`).join(' or ')}.`,
      'Online, everyone in your party is offered a way in.',
    ]);
  }

  // Door keys: every locked door in the streets that takes each key (js/doors.js checkDoorEntry uses one key a trip).
  const streetsDir = join(pub, 'assets', 'streets');
  const doorsByKey = new Map();
  for (const f of readdirSync(streetsDir).filter((x) => /^G[A-Z0-9]+\.json$/.test(x)).sort()) {
    const street = JSON.parse(readFileSync(join(streetsDir, f), 'utf8'));
    for (const door of doors.visibleDoors(street)) {
      if (!door.key_id || !doors.doorDestination(door, { current: street.tsid, rng: () => 0 })) continue;
      const to = door.connect?.label || 'somewhere else';
      const text = `from ${street.label}${street.hubName ? ` (${street.hubName})` : ''} to ${to}`;
      if (!doorsByKey.has(door.key_id)) doorsByKey.set(door.key_id, []);
      if (!doorsByKey.get(door.key_id).includes(text)) doorsByKey.get(door.key_id).push(text);
    }
  }
  for (const key of Object.keys(doors.DOOR_KEYS)) {
    const list = doorsByKey.get(Number(key)) || [];
    if (!list.length) continue;
    gen.set(doors.doorKeyClass(key), [
      `Opens the locked ${list.length === 1 ? 'door' : 'doors'} ${list.join('; ')}.`,
      'Each trip through a locked door uses up one key.',
    ]);
  }

  // Street projects: which items and tools the playable project classes ask for.
  const sj = JSON.parse(readFileSync(join(pub, 'assets', 'content', 'street-jobs.json'), 'utf8'));
  const asks = new Map();
  const note = (id, kind, key) => {
    if (!asks.has(id)) asks.set(id, { item: new Set(), work: new Set(), restore: new Set() });
    asks.get(id)[kind].add(key);
  };
  const runs = [...Object.entries(sj.jobs).map(([k, j]) => [`job:${k}`, j, false]), ...Object.entries(sj.restorations).map(([k, r]) => [`restore:${k}`, r, true])];
  for (const [key, job, restore] of runs) {
    for (const phase of job.phases || []) {
      for (const r of sj.classes[phase.classTsid]?.requirements || []) {
        if (r.type === 'item') note(r.classId, restore ? 'restore' : 'item', key);
        else if (r.type === 'work') for (const t of r.classIds || [r.classId]) note(t, restore ? 'restore' : 'work', key);
      }
    }
  }
  const projectLines = (id) => {
    const a = asks.get(id);
    if (!a) return [];
    const out = [];
    if (a.item.size) out.push(`${n(a.item.size)} street ${a.item.size === 1 ? 'project asks' : 'projects ask'} for it.`);
    if (a.work.size) out.push(`${n(a.work.size)} street ${a.work.size === 1 ? 'project needs' : 'projects need'} work done with it.`);
    if (a.restore.size) out.push('Restore projects for worn-out things in your yard ask for it too.');
    return out;
  };

  /** Whether the remake's data writes this item's lines (furniture, prototypes, bags, party packs, keys). */
  linesFor.generated = (id) => gen.has(id);
  return linesFor;
  function linesFor(id) {
    const c = curated[id];
    const g = gen.get(id);
    // Hand-written lines that already speak of street projects keep them in their own words.
    const jobs = (c?.lines || []).some((l) => /street project/i.test(l)) ? [] : projectLines(id);
    if (c?.none && !g && !jobs.length) return { none: c.none };
    const lines = [...(g || []), ...(c?.lines || []), ...jobs];
    return lines.length ? { lines } : null;
  }
}
