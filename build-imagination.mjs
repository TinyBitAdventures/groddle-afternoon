/**
 * Build the Imagination upgrade card catalog and card art from Tiny Speck's
 * GameServerJS and client sources (all CC0).
 *
 * Reads:
 *   inc_data_imagination.js            all 275 upgrade cards (name, desc,
 *                                      cost, deal chance, max uses, card art
 *                                      config, conditions, rewards, options)
 *   players/inc_imagination.js         the Reshuffle Card price table
 *   opengameart/extracted_imagination/swf/DefineSprite_<id>_<name>/1.svg
 *                                      card layers exported by JPEXS from
 *                                      glitch-client/TSEngineAssets/src/assets/swfs/imagination_cards.swf
 *                                      (bg_*, pattern_*, suit_*, art_*, icon_*, sparkle)
 *
 * Writes:
 *   public/js/imagination-data.js      frozen ES module
 *   public/assets/imagination/cards/<layer>.svg
 *                                      each layer the catalog uses, placed on
 *                                      the client's 230x310 card frame
 *
 * The JPEXS frame export crops every symbol to its own bounds and moves it
 * to the origin. The client adds every layer at the card's top-left
 * (ImgCardUI.buildFront), so the crop offset is undone here and every SVG
 * gets a 0 0 230 310 viewBox. Coordinates are rounded to 2 decimals.
 *
 * Export the layers first (once):
 *   java -jar tools/ffdec/ffdec.jar -format sprite:svg -export sprite \
 *     opengameart/extracted_imagination/swf \
 *     glitch-client/TSEngineAssets/src/assets/swfs/imagination_cards.swf
 *
 * Run from spike root:
 *   node build-imagination.mjs
 */

import vm from 'node:vm';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const AUDIT = join(process.env.HOME || '', 'Documents/glitch-audit');
const GSJS = process.env.GLITCH_GSJS || join(AUDIT, 'glitch-GameServerJS');
const LAYERS = process.env.GLITCH_IMAGINATION_SWF || join(AUDIT, 'opengameart/extracted_imagination/swf');
const OUT = join(root, 'public/js/imagination-data.js');
const ART_OUT = join(root, 'public/assets/imagination/cards');

const ctx = {};
vm.createContext(ctx);
vm.runInContext(
  `${readFileSync(join(GSJS, 'inc_data_imagination.js'), 'utf8')}\n;this.__upgrades = data_imagination_upgrades;`,
  ctx
);
const raw = ctx.__upgrades;
if (!raw || typeof raw !== 'object') throw new Error('data_imagination_upgrades not found');

const playerSrc = readFileSync(join(GSJS, 'players/inc_imagination.js'), 'utf8');
const shuffleMatch = playerSrc.match(/var imagination_shuffle_card_cost = \[([\s\S]*?)\];/);
if (!shuffleMatch) throw new Error('imagination_shuffle_card_cost not found');
const SHUFFLE_CARD_COST = shuffleMatch[1].split(',').map((v) => Number(v.trim())).filter(Number.isFinite);

const CONDITION_KEYS = { 2: 'level', 3: 'imagination_id', 4: 'skill_id', 5: 'achievement_id', 6: 'quest_id', 7: 'max_energy' };

function cleanCondition(c) {
  const type = Number(c.type);
  if (type === 1) return { type };
  const key = CONDITION_KEYS[type];
  const value = c.data?.[key];
  return key ? { type, [key]: typeof value === 'string' ? value : Number(value) } : { type };
}

function cleanReward(r) {
  const data = {};
  for (const [k, v] of Object.entries(r.data || {})) if (v !== null && v !== undefined) data[k] = v;
  return { type: Number(r.type), data };
}

const upgrades = {};
for (const [id, u] of Object.entries(raw)) {
  const row = {
    name: String(u.name),
    desc: String(u.desc),
    cost: Number(u.cost) || 0,
    chance: Number(u.chance) || 0,
    max_uses: Number(u.max_uses) || 0,
    config: { ...u.config },
    conditions: (u.conditions || []).map(cleanCondition),
    rewards: (u.rewards || []).map(cleanReward),
  };
  if (u.is_secret) row.is_secret = true;
  if (u.options) row.options = u.options;
  upgrades[id] = row;
}

// Card art layers -------------------------------------------------------
const wanted = new Set(['bg_back', 'sparkle']);
for (const u of Object.values(upgrades)) {
  for (const field of ['bg', 'pattern', 'suit', 'art', 'icon']) {
    if (u.config[field]) wanted.add(`${field}_${u.config[field]}`);
  }
  if (u.config.suit) wanted.add(`suit_${u.config.suit}_back`);
}
// G225: skill tiles no upgrade card names, for the familiar's skill-learned
// panel (js/familiar.js skillArtFor). Same SWF, same placement. The SWF has
// no art_skill_mastergardener, so Master Gardener keeps art_brain.
for (const family of ['bureaucraticarts', 'eyeballery', 'martialimagination', 'nudgery', 'penmanship', 'teleportation', 'woodworking']) {
  wanted.add(`art_skill_${family}`);
}

const round = (s) => s.replace(/-?\d+\.\d{3,}/g, (n) => String(Math.round(Number(n) * 100) / 100));
const layers = {};
if (existsSync(LAYERS)) {
  for (const dir of readdirSync(LAYERS)) {
    const m = dir.match(/^DefineSprite_\d+_(.+)$/);
    if (m) layers[m[1]] = join(LAYERS, dir, '1.svg');
  }
  mkdirSync(ART_OUT, { recursive: true });
}
const art = [];
const missingArt = [];
for (const name of [...wanted].sort()) {
  const file = layers[name];
  if (!file || !existsSync(file)) {
    // The client tolerates a missing suit back (keepable cards have none).
    if (!/_back$/.test(name)) missingArt.push(name);
    continue;
  }
  let svg = readFileSync(file, 'utf8');
  // Undo the JPEXS crop: the first <g> carries matrix(a, b, c, d, -left, -top).
  svg = svg.replace(
    /<svg([^>]*?)height="[^"]*" width="[^"]*"([^>]*)>\s*<g transform="matrix\(([^,]+), ([^,]+), ([^,]+), ([^,]+), [^,]+, [^)]+\)">/,
    (_all, pre, post, a, b, c, d) =>
      `<svg${pre}width="230" height="310" viewBox="0 0 230 310"${post}>\n  <g transform="matrix(${a}, ${b}, ${c}, ${d}, 0, 0)">`
  );
  if (!svg.includes('viewBox="0 0 230 310"')) throw new Error(`could not normalise ${name}`);
  writeFileSync(join(ART_OUT, `${name}.svg`), round(svg));
  art.push(name);
}
if (existsSync(LAYERS) && missingArt.length) throw new Error(`missing card layers: ${missingArt.join(', ')}`);

const header = `/**
 * GENERATED by build-imagination.mjs from GameServerJS inc_data_imagination.js
 * and players/inc_imagination.js (CC0). Do not edit by hand; re-run the builder.
 * ${Object.keys(upgrades).length} upgrade cards; ${art.length} card art layers in assets/imagination/cards/.
 */
`;
const body = `${header}
export const IMAGINATION_UPGRADES = Object.freeze(${JSON.stringify(upgrades, null, 1)});

/** imagination_shuffle_card_cost, indexed by level - 5 (keepable_reshuffle needs level 5). */
export const SHUFFLE_CARD_COST = Object.freeze(${JSON.stringify(SHUFFLE_CARD_COST)});

/** Card art layers shipped in assets/imagination/cards/ (layer name = file stem). */
export const CARD_ART_LAYERS = Object.freeze(${JSON.stringify(art)});
`;
writeFileSync(OUT, body);
console.log(`${Object.keys(upgrades).length} upgrades, ${SHUFFLE_CARD_COST.length} shuffle costs, ${art.length} art layers → ${OUT}`);
