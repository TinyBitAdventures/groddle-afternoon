/**
 * Generate public/js/seasons-data.js from Tiny Speck's GameServerJS (CC0):
 * every holiday item's label/description/price, the pumpkin carving lines,
 * the Glitchmas 2011 cracker jokes, fun facts and card poems, both Glitchmas
 * Yeti dolls' pull-string quotes, and the 2010 "A Holiday Thing" quest text.
 *
 * Run from spike root:
 *   node build-seasons.mjs
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = dirname(fileURLToPath(import.meta.url));
const gsjs = process.env.GSJS_ROOT || decodeURIComponent(new URL('../glitch-GameServerJS', import.meta.url).pathname);
const outPath = join(root, 'public/js/seasons-data.js');

const src = (rel) => readFile(join(gsjs, rel), 'utf8');

// The Glitchmas Yeti's letter (players/player.js, the 2011 Glitchmas mail): exact [from, to] swaps on
// the GSJS text; the build fails when a `from` is no longer in it, and when an em dash is left.
// Deviation from GSJS, recorded here and in the commit (lane HOMEMAP, Austin 2026-10-31: "sign it as
// Groddle Afternoon"): it is signed Groddle Afternoon, not "— Tiny Speck"; no em dashes in player
// copy; and its two <split butt_txt> beats (a conversation's buttons, which a letter has none of: the
// mail reader showed them as raw markup) become paragraph breaks.
const YETI_MAIL_OVERRIDES = [
  ['We’re not sure what they are — though from', 'We’re not sure what they are, though from'],
  ['explosive …<split butt_txt="Wot?" />', 'explosive …\n\n'],
  ['as soon as possible. So we passed them on to you!<split butt_txt="Hmm. Thanks." />', 'as soon as possible. So we passed them on to you!\n\n'],
  ['Happy Glitchmas! — Tiny Speck', 'Happy Glitchmas!\n\nGroddle Afternoon'],
];

function overrideText(name, text, swaps) {
  let out = text;
  for (const [from, to] of swaps) {
    if (!out.includes(from)) throw new Error(`${name}: "${from}" is not in its GSJS text any more`);
    out = out.replace(from, to);
  }
  if (out.includes('—')) throw new Error(`${name}: an em dash is left in player copy`);
  return out;
}

/** A JS string literal from `var name = "..."`, decoded the way Rhino would. */
function varString(text, name) {
  const m = text.match(new RegExp(`^var ${name} = ("(?:[^"\\\\]|\\\\.)*");`, 'm'));
  return m ? JSON.parse(m[1].replace(/\\'/g, "'").replace(/\\\//g, '/')) : null;
}
const varNumber = (text, name) => Number(text.match(new RegExp(`^var ${name} = ([\\d.]+);`, 'm'))?.[1] || 0);

async function itemMeta(classTsid) {
  const text = await src(`items/${classTsid}.js`);
  const factor = Number(text.match(/"energy_factor"\s*:\s*"([\d.]+)"/)?.[1] || 0);
  const tags = [...(text.match(/^var tags = \[([\s\S]*?)\];/m)?.[1] || '').matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  return {
    label: varString(text, 'label'),
    namePlural: varString(text, 'name_plural'),
    desc: varString(text, 'description'),
    baseCost: varNumber(text, 'base_cost'),
    stackMax: varNumber(text, 'stackmax') || 1,
    ...(factor ? { energyFactor: factor } : {}),
    tags,
  };
}

/** Evaluate a function body that returns a literal (GSJS getQuotes / getJokes ...). */
function runReturn(text, fnName) {
  const m = text.match(new RegExp(`function ${fnName}\\(\\)\\s*\\{[\\s\\S]*?\\n\\}`, 'm'));
  if (!m) throw new Error(`no ${fnName}`);
  const sandbox = {};
  vm.runInNewContext(`${m[0]}\nthis.out = ${fnName}();`, sandbox);
  return sandbox.out;
}

const ITEMS = [
  'pumpkin', 'seed_pumpkin', 'pepitas', 'pumpkin_pie', 'pumpkin_ale',
  ...[1, 2, 3, 4, 5].map((n) => `pumpkin_carved_${n}`),
  ...[1, 2, 3, 4, 5].map((n) => `pumpkin_lit_${n}`),
  'birch_candy', 'corn_syrup_squares', 'carobish_treats',
  'glitchmas_cracker', 'glitchmas_cracker_joke', 'glitchmas_cracker_factoid', 'glitchmas_card',
  'glitchmas_present', 'collectors_edition_2010_glitchmas_yeti', 'limited_edition_imitation_grichmas_yeti',
  ...[1, 2, 3, 4, 5].map((n) => `egghunt_egg_${n}`), 'trophy_egghunt', 'pi', 'egg_plain',
];

const items = {};
for (const id of ITEMS) items[id] = await itemMeta(id);

const pumpkinJs = await src('items/pumpkin.js');
const growlBlock = pumpkinJs.match(/var growls = \[([\s\S]*?)\];/)[1];
const growlBox = {};
vm.runInNewContext(`this.g = [${growlBlock}];`, growlBox);
const growls = growlBox.g;

const g2011 = await src('items/include/glitchmas_2011.js');
const jokes = runReturn(g2011, 'getJokes');
const factoids = runReturn(g2011, 'getFactoids').map((row) => row.fact);
const poems = runReturn(g2011, 'getPoemChoices').map((row) => ({ title: row.title, contents: row.contents }));

const yetiQuotes = runReturn(await src('items/collectors_edition_2010_glitchmas_yeti.js'), 'getQuotes');
const imitationQuotes = runReturn(await src('items/limited_edition_imitation_grichmas_yeti.js'), 'getQuotes');

const quest = await src('quests/glitchmas2010.js');
const holidayQuest = {
  id: 'glitchmas2010',
  title: varString(quest, 'title'),
  desc: varString(quest, 'desc'),
  offer: varString(quest, 'offer'),
  completion: varString(quest, 'completion'),
  rewards: { mood: 10, items: [{ classTsid: 'glitchmas_present', count: 1 }] },
};

const player = await src('players/player.js');
const mailMatch = player.match(/mail_send_special_item\('glitchmas_cracker', 1, "((?:[^"\\]|\\.)*)"\)/);
const yetiMail = mailMatch ? overrideText('yetiMail', JSON.parse(`"${mailMatch[1]}"`), YETI_MAIL_OVERRIDES) : null;

const data = {
  items,
  carveGrowls: growls,
  crackerJokes: jokes,
  crackerFactoids: factoids,
  cardPoems: poems,
  yetiQuotes,
  imitationYetiQuotes: imitationQuotes,
  holidayQuest,
  yetiMail,
};

const banner = `/**
 * Generated by build-seasons.mjs from glitch-GameServerJS (CC0): items/*.js
 * labels and prices, items/pumpkin.js carve lines, items/include/glitchmas_2011.js
 * jokes/facts/poems, the two Glitchmas Yeti dolls' getQuotes, quests/glitchmas2010.js
 * and the 2011 Glitchmas mail in players/player.js (yetiMail with build-seasons.mjs's
 * recorded YETI_MAIL_OVERRIDES). Do not edit by hand.
 */
`;
await writeFile(outPath, `${banner}\nexport const SEASON_DATA = Object.freeze(${JSON.stringify(data, null, 2)});\n`);
console.log(`Wrote ${Object.keys(items).length} items, ${growls.length} growls, ${jokes.length} jokes, ${factoids.length} facts, ${poems.length} poems, ${yetiQuotes.length}+${imitationQuotes.length} yeti quotes -> ${outPath}`);
