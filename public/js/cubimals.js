/**
 * Cubimal Series 1/2 boxes and collectible figures.
 *
 * Source:
 * - items/cubimal_package.js
 * - items/cubimal_package_2.js
 * - items/npc_cubimal_*.js
 */

import {
  addItem,
  countItem,
  ensureItem,
  removeItem,
} from './inventory.js?v=catalog-unified-3';

export const CUBIMAL_PACKAGE_IDS = Object.freeze({
  1: 'cubimal_package',
  2: 'cubimal_package_2',
});

function cubimal(slug, label, cutoff, setFreeImg = 0) {
  return Object.freeze({
    classTsid: `npc_cubimal_${slug}`,
    slug,
    label,
    cutoff,
    setFreeImg,
  });
}

export const CUBIMAL_SERIES = Object.freeze({
  1: Object.freeze([
    cubimal('chick', 'Chick Cubimal', 17, 400),
    cubimal('piggy', 'Piggy Cubimal', 34, 400),
    cubimal('butterfly', 'Butterfly Cubimal', 50, 400),
    cubimal('crab', 'Crab Cubimal', 58, 500),
    cubimal('batterfly', 'Batterfly Cubimal', 66, 500),
    cubimal('frog', 'Frog Cubimal', 74, 500),
    cubimal('firefly', 'Firefly Cubimal', 82, 500),
    cubimal('bureaucrat', 'Bureaucrat Cubimal', 84, 1_000),
    cubimal('cactus', 'Cactus Cubimal', 86, 1_000),
    cubimal('snoconevendor', 'Sno Cone Vendor Cubimal', 88, 1_000),
    cubimal('squid', 'Squid Cubimal', 90, 1_000),
    cubimal('juju', 'JuJu Cubimal', 92, 1_000),
    cubimal('smuggler', 'Smuggler Cubimal', 93.25),
    cubimal('deimaginator', 'Deimaginator Cubimal', 94.5),
    cubimal('greeterbot', 'Greeterbot Cubimal', 95.75),
    cubimal('dustbunny', 'Dustbunny Cubimal', 97),
    cubimal('gwendolyn', 'Gwendolyn Cubimal', 97.5),
    cubimal('unclefriendly', 'Uncle Friendly Cubimal', 98),
    cubimal('helga', 'Helga Cubimal', 98.5),
    cubimal('magicrock', 'Magic Rock Cubimal', 99),
    cubimal('yeti', 'Yeti Cubimal', 99.5),
    cubimal('rube', 'Rube Cubimal', 99.75),
    cubimal('rook', 'Rook Cubimal', 100),
  ]),
  2: Object.freeze([
    cubimal('fox', 'Fox Cubimal', 14.5, 400),
    cubimal('sloth', 'Sloth Cubimal', 29, 400),
    cubimal('emobear', 'Emo-Bear Cubimal', 37, 500),
    cubimal('foxranger', 'Fox Ranger Cubimal', 45, 500),
    cubimal('groddlestreetspirit', 'Groddle Street Spirit Cubimal', 54, 500),
    cubimal('uraliastreetspirit', 'Uralia Street Spirit Cubimal', 61, 500),
    cubimal('firebogstreetspirit', 'Firebog Street Spirit Cubimal', 69, 500),
    cubimal('gnome', 'Gnome Cubimal', 77, 500),
    cubimal('butler', 'Butler Cubimal', 81, 750),
    cubimal('craftybot', 'Craftybot Cubimal', 85, 750),
    cubimal('phantom', 'Phantom Cubimal', 89, 750),
    cubimal('ilmenskiejones', 'Ilmenskie Jones Cubimal', 93, 750),
    cubimal('trisor', 'Trisor Cubimal', 94),
    cubimal('toolvendor', 'Tool Vendor Cubimal', 95),
    cubimal('mealvendor', 'Meal Vendor Cubimal', 96),
    cubimal('gardeningtoolsvendor', 'Gardening Tools Vendor Cubimal', 97),
    cubimal('maintenancebot', 'Maintenance Bot Cubimal', 98),
    cubimal('senorfunpickle', 'Señor Funpickle Cubimal', 99),
    cubimal('hellbartender', 'Hell Bartender Cubimal', 99.5),
    cubimal('scionofpurple', 'Scion of Purple Cubimal', 100),
  ]),
});

const PACKAGE_META = Object.freeze({
  cubimal_package: Object.freeze({
    series: 1,
    label: 'Cubimal Series 1 Box',
    desc: 'Contains one (1) Series 1 Cubimal. Open it up to find out which one is inside. Collect them all!',
  }),
  cubimal_package_2: Object.freeze({
    series: 2,
    label: 'Cubimal Series 2 Box',
    desc: "Contains one (1) Series 2 Cubimal. Open it up to find out which one is inside. Collect 'em all!",
  }),
});

const CUBIMAL_BY_ID = Object.freeze(
  Object.fromEntries(
    Object.entries(CUBIMAL_SERIES).flatMap(([series, rows]) =>
      rows.map((row) => [row.classTsid, Object.freeze({ ...row, series: Number(series) })])
    )
  )
);

export const CUBIMAL_FREE_RESPONSES = Object.freeze([
  'I will remember you always.',
  'You have been, and will always be, my friend',
  'Live long and be merry',
  "Yay, I'm free!",
  "Yay, I'm off to Cosmaland!",
]);

export function cubimalPackageInfo(classTsid) {
  return PACKAGE_META[classTsid] || null;
}

export function cubimalInfo(classTsid) {
  return CUBIMAL_BY_ID[classTsid] || null;
}

export function isCubimalPackage(classTsid) {
  return Boolean(cubimalPackageInfo(classTsid));
}

export function isCubimal(classTsid) {
  return Boolean(cubimalInfo(classTsid));
}

/** Register both boxes and all 43 clean collectible figures in the shared pack catalog. */
export function ensureCubimalItems() {
  for (const [classTsid, meta] of Object.entries(PACKAGE_META)) {
    ensureItem(classTsid, {
      label: meta.label,
      desc: meta.desc,
      baseCost: 5_000,
      stackMax: 1,
    });
  }
  for (const [classTsid, meta] of Object.entries(CUBIMAL_BY_ID)) {
    ensureItem(classTsid, {
      label: meta.label,
      desc: `It's a ${meta.label}! Collect all Series ${meta.series} Cubimals!`,
      baseCost: 0,
      stackMax: 1,
      sellable: false,
      donatable: false,
    });
  }
}

/** Unique figures currently represented in the pack for one official series. */
export function cubimalCollectionProgress(inv, series) {
  const rows = CUBIMAL_SERIES[series] || [];
  const owned = rows.filter((row) => countItem(inv, row.classTsid) > 0);
  return {
    series: Number(series),
    owned: owned.length,
    total: rows.length,
    ids: owned.map((row) => row.classTsid),
  };
}

/** Select with the source cumulative percentage table. */
export function selectCubimal(packageClassTsid, roll = Math.random()) {
  const pack = cubimalPackageInfo(packageClassTsid);
  if (!pack) return null;
  const raw = Number(roll);
  const point = Math.max(0, Math.min(1, Number.isFinite(raw) ? raw : 0)) * 100;
  const rows = CUBIMAL_SERIES[pack.series];
  return rows.find((row) => point <= row.cutoff) || rows.at(-1);
}

/** Replace one box atomically with exactly one source-selected Cubimal. */
export function openCubimalPackage(inv, packageClassTsid, roll = Math.random()) {
  const pack = cubimalPackageInfo(packageClassTsid);
  if (!pack) return { ok: false, reason: 'not_package' };
  if (countItem(inv, packageClassTsid) < 1) {
    return { ok: false, reason: 'missing', message: 'That Cubimal box is no longer in your pack.' };
  }
  const prize = selectCubimal(packageClassTsid, roll);
  if (!prize) return { ok: false, reason: 'empty_table' };
  if (!removeItem(inv, packageClassTsid, 1)) {
    return { ok: false, reason: 'missing', message: 'That Cubimal box is no longer in your pack.' };
  }
  addItem(inv, prize.classTsid, 1);
  return {
    ok: true,
    reason: 'opened',
    package: { classTsid: packageClassTsid, ...pack },
    prize,
    collection: cubimalCollectionProgress(inv, pack.series),
    message: `You opened a ${pack.label}. You got a ${prize.label}!`,
  };
}

/** Source "set free, with love" reward. Rare figures with reward 0 cannot be freed. */
export function setCubimalFree(inv, pc, classTsid, responseRoll = Math.random()) {
  const info = cubimalInfo(classTsid);
  if (!info) return { ok: false, reason: 'not_cubimal' };
  if (!info.setFreeImg) {
    return {
      ok: false,
      reason: 'rare',
      message: `${info.label} is too rare to set free for Imagination.`,
    };
  }
  if (countItem(inv, classTsid) < 1 || !removeItem(inv, classTsid, 1)) {
    return { ok: false, reason: 'missing', message: 'That Cubimal is no longer in your pack.' };
  }
  if (pc) {
    pc.imagination = (Number(pc.imagination) || 0) + info.setFreeImg;
    pc.xp = (Number(pc.xp) || 0) + info.setFreeImg;
  }
  const rawRoll = Number(responseRoll);
  const responseIndex = Math.min(
    CUBIMAL_FREE_RESPONSES.length - 1,
    Math.floor(Math.max(0, Math.min(0.999999999, Number.isFinite(rawRoll) ? rawRoll : 0)) * CUBIMAL_FREE_RESPONSES.length)
  );
  return {
    ok: true,
    reason: 'freed',
    cubimal: info,
    reward: info.setFreeImg,
    response: CUBIMAL_FREE_RESPONSES[responseIndex],
    effects: { xp: info.setFreeImg },
    message: `You set ${info.label} free, with love.`,
  };
}
