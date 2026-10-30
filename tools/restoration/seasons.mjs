/**
 * The restoration report's Seasons section (groddle/restoration-seasons,
 * drawn by groddle-afternoon-site/src/Restoration.php): one card per dated
 * holiday in js/seasons.js, then the all-year Egg Hunt (EGG_HUNT), written
 * into public/restoration/data.json by tools/build-restoration.mjs as
 * `seasons`.
 *
 * Everything comes from the game: names, windows and blurbs from SEASONS;
 * item names from Tiny Speck's item files (SEASON_DATA, making-items.json);
 * the numbers from the rules in seasons.js; the badges from achievements.json;
 * the Pi recipe from recipes.json; the Egg Plant's odds from its skill package
 * (skill-packages-data.js). The page decides which season is on now
 * from `when` (real-world windows the PHP evaluates on each request) and
 * `dametime` (Zilloween on Ur's own calendar), so nothing has to be rebuilt
 * for the "On now" mark to move.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CANDY_CLASSES,
  CANDY_DAILY_MAX,
  CARVE,
  CARVED_CLASSES,
  EGG_CLASSES,
  EGG_HUNT,
  LIGHT,
  LIT_CLASSES,
  NOG,
  REAL_WINDOWS,
  SEASONAL_STOCK,
  SEASONS,
  SEASON_IDS,
} from '../../public/js/seasons.js?v=fcb12a83';
import { SEASON_DATA } from '../../public/js/seasons-data.js?v=249cedba';
import { GAME_DAY_MS, GAME_EPOCH_MS, GAME_YEAR_MS, MONTH_LENGTHS, MONTH_NAMES } from '../../public/js/game-day.js?v=3095e05b';
import { SEASONAL_SEEDS } from '../../public/js/garden.js?v=9a8f8f72';
import { SEASONAL_RECIPES } from '../../public/js/making.js?v=9e538296';
import { SKILL_PACKAGES } from '../../public/js/skill-packages-data.js?v=cb4e9ab3';
import { TRANT_META } from '../../public/js/trants.js?v=9c2e8c0f';
import { playHref } from './play-links.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const pub = join(root, 'public');
const json = (p) => JSON.parse(readFileSync(join(pub, p), 'utf8'));

/** How much of each event survives (SEASONS[id].source), as the card's tag. */
export const SEASON_STATUS = Object.freeze({
  source: { label: 'Restored from source', tone: 'moss', note: 'Its items, verbs, words and badges come from Tiny Speck’s server code.' },
});

/** Each card's colour, a report tone token. */
const TONES = { zilloween: 'accent', glitchmas: 'sky', egg_hunt: 'plum', pi_day: 'moss' };

/** The badges and trophies that belong to each event, matched on their conditions. */
const BADGE_MATCH = {
  zilloween: /zilloween|pumpkins_/,
  glitchmas: /glitchmas/,
  egg_hunt: /egghunt_egg/,
  pi_day: null,
};

/**
 * The real-world window each event runs in, as data the page can test: fixed
 * dates (seasons.js REAL_WINDOWS, inclusive, may wrap the year) and Pi Day
 * (isPiDay: March 14 in UTC, plus twelve hours either side). The Egg Hunt is
 * always on, so it is never marked On now.
 */
const WHEN = {
  zilloween: { kind: 'dates', from: [...REAL_WINDOWS.zilloween.from], to: [...REAL_WINDOWS.zilloween.to] },
  glitchmas: { kind: 'dates', from: [...REAL_WINDOWS.glitchmas.from], to: [...REAL_WINDOWS.glitchmas.to] },
  pi_day: { kind: 'utc-day', month: 3, day: 14, slackHours: 12 },
  egg_hunt: { kind: 'always' },
};

/**
 * Each card's play link: a practice copy with the season switched on and its
 * pack stocked, or for the Egg Hunt one standing beside the Egg Plant on
 * Murrukku Meander (&caredemo=egg, its petting reset for the day).
 */
const PLAY = {
  egg_hunt: `?autostart=1&fresh=1&resetgame=1&questoffer=off&streetdemo=GA51B2OQAK623EF&caredemo=egg&carereset=1`,
};
const play = (id) => playHref(PLAY[id] || `?autostart=1&fresh=1&resetgame=1&questoffer=off&season=${id}&seasondemo=1`);

const items = json('assets/content/making-items.json').items;
const label = (id) => SEASON_DATA.items[id]?.label || items[id]?.label || id;
const site = (path) => (existsSync(join(pub, path)) ? `/${path}` : null);

/** An item as the card shows it: its name and CC0 icon (with the 3x render where there is one). */
function item(id) {
  const icon = site(`assets/sprites/icons/${id}.png`);
  if (!icon) throw new Error(`seasons: no icon for ${id}`);
  return { id, name: label(id), icon, icon3x: site(`assets/sprites/icons/${id}@3x.png`) };
}

const list = (names) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);

/** Zilloween on the Dametime calendar (isDametimeZilloween: Remember 25 to the month's end), as offsets into a game year. */
export function dametimeWindow() {
  const month = MONTH_NAMES.indexOf('Remember');
  const before = MONTH_LENGTHS.slice(0, month).reduce((a, b) => a + b, 0);
  return {
    month: 'Remember',
    fromDay: 25,
    toDay: MONTH_LENGTHS[month],
    epochMs: GAME_EPOCH_MS,
    yearMs: GAME_YEAR_MS,
    fromMs: (before + 24) * GAME_DAY_MS,
    toMs: (before + MONTH_LENGTHS[month]) * GAME_DAY_MS,
  };
}

function piRecipe() {
  const id = Object.entries(SEASONAL_RECIPES).find(([, season]) => season === 'pi_day')?.[0];
  const recipe = Object.values(json('assets/content/recipes.json')).find((r) => String(r.id) === id);
  if (!recipe) throw new Error(`seasons: no Pi Day recipe ${id}`);
  return recipe;
}

/** What to do in each event: a line of our own words over the game's numbers, and the items it is about. */
function facts(id) {
  if (id === 'zilloween') {
    const [[, pepitas]] = CARVE.outputs;
    const seeds = Object.entries(SEASONAL_SEEDS).filter(([, s]) => s === 'zilloween').map(([seed]) => seed);
    return [
      { label: 'Carve', text: `Carve a Pumpkin with a ${label('pick')} and a ${label('knife_and_board')} for ${CARVE.energy} energy. Each one comes out with one of five faces, plus ${pepitas} ${label('pepitas')} and a ${label('jellisac_clump')}.`, items: CARVED_CLASSES.map(item) },
      { label: 'Light', text: `Light a carved pumpkin with a full ${label('firefly_jar')} (${LIGHT.flies} fireflies), place it at home and teach it phrases to say. Carved pumpkins rot when Zilloween ends.`, items: LIT_CLASSES.map(item) },
      { label: 'Candy', text: `The Jack-O-Lanterns on the streets answer Trick or treat once a game day. Candy gives a Sugar Rush, ${CANDY_DAILY_MAX} a game day at most (the last one brings toothache), or give it to Piggies, Chickens, Butterflies and Street Spirits.`, items: CANDY_CLASSES.map(item) },
      { label: 'Grow', text: `${list(seeds.map((s) => SEASON_DATA.items[s]?.namePlural || label(s)))} only grow during Zilloween.`, items: seeds.map(item) },
    ];
  }
  if (id === 'glitchmas') {
    const toys = SEASONAL_STOCK.glitchmas.toys;
    const quest = SEASON_DATA.holidayQuest;
    const prize = quest.rewards.items.map((r) => r.classTsid);
    return [
      { label: 'Shop', text: `The Toy Vendor sells ${list(toys.map((t) => `${t.label}s (${t.cost} currants)`))}. Pull a cracker with a nearby critter’s help for a joke or a fun fact; sign a card and mail it.`, items: toys.map((t) => item(t.classTsid)) },
      { label: 'Quest', text: `${quest.title}: ${quest.desc} The present holds a ${label('collectors_edition_2010_glitchmas_yeti')}.`, items: [...prize, 'collectors_edition_2010_glitchmas_yeti'].map(item) },
      { label: 'Nog', text: `Nog an ${label('egg_plain')} once a game day for ${NOG.xp} iMG. From December 24 the Glitchmas Yeti mails you a cracker.`, items: [item('egg_plain')] },
    ];
  }
  if (id === 'egg_hunt') {
    const skills = Object.entries(SKILL_PACKAGES[EGG_HUNT.pet.package].skills);
    const chance = (skill) => skills.find(([k]) => k === skill)?.[1].drop_chance;
    const ranks = skills.filter(([k]) => k !== 'no_skill').map(([, s]) => `${s.drop_chance}%`);
    const works = skills.find(([k]) => k === 'no_skill')[1].success_rate;
    return [
      { label: 'Pet', text: `Pet an ${TRANT_META[EGG_HUNT.pet.trant].label} once a game day for a ${chance('no_skill')}% chance of a chocolate egg, rising to ${list(ranks)} with Light Green Thumb I, II and III. Without the skill only ${works}% of pettings take. Each of the five eggs is as likely, and they drop all year.`, items: EGG_CLASSES.map(item) },
      { label: 'Trophy', text: `Collect all five and the ${label(EGG_HUNT.trophy)} takes one of each in exchange.`, items: [item(EGG_HUNT.trophy)] },
    ];
  }
  if (id === 'pi_day') {
    const recipe = piRecipe();
    const inputs = recipe.inputs.map((i) => `${i.qty} ${label(i.classTsid)}`);
    return [
      { label: 'Cook', text: `Cook Pi in a ${label(recipe.tool)} from ${list(inputs)}. The recipe only works on Pi Day.`, items: [item('pi')] },
      { label: 'Estimate', text: 'With a Pi in your pack, Estimate Pi once a game day. Each digit you get is favor with Tii the first time each year, and mood after that.', items: [] },
    ];
  }
  return [];
}

function badges(id, achievements) {
  const match = BADGE_MATCH[id];
  if (!match) return { badges: [], secret: 0 };
  const hits = Object.values(achievements).filter((a) => match.test(JSON.stringify(a.conditions || [])));
  const shown = hits.filter((a) => !a.isSecret).sort((a, b) => {
    // Counted badges in the order you earn them, then the rest by name.
    const num = (x) => Math.max(0, ...(x.conditions || []).map((c) => Number(c.num) || 0));
    return a.category === b.category ? num(a) - num(b) || a.name.localeCompare(b.name) : a.category.localeCompare(b.category);
  });
  return {
    badges: shown.map((a) => ({ id: a.classTsid, name: a.name, desc: a.desc, icon: site(`assets/badges/${a.classTsid}.png`) })),
    secret: hits.length - shown.length,
  };
}

/** The `seasons` block of public/restoration/data.json. */
export function seasonsData() {
  const achievements = json('assets/content/achievements.json');
  const seasons = [...SEASON_IDS.map((id) => SEASONS[id]), EGG_HUNT].map((s) => {
    const { id } = s;
    const status = SEASON_STATUS[s.source];
    if (!status) throw new Error(`seasons: no status for ${id} (${s.source})`);
    return {
      id,
      label: s.label,
      tone: TONES[id],
      icon: item(s.icon),
      status: s.source,
      window: s.window,
      blurb: s.blurb,
      when: WHEN[id],
      dametime: id === 'zilloween',
      facts: facts(id),
      ...badges(id, achievements),
      play: play(id),
    };
  });
  return { status: SEASON_STATUS, dametime: dametimeWindow(), seasons };
}
