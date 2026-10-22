/**
 * Harvestable resource nodes as a feature module (see js/feature-host.js).
 *
 * Rules live in js/resource-nodes.js; this file binds them to the world:
 * Fireflies (Firefly Jar), Salmon (pocket), Mortar Barnacles and Ice Nubbins
 * (Scraper), Jellisac Growths (scoop), Dirt Piles and Peat Bogs (Shovel),
 * Paper Trees (harvest / water / pet), Sloths (knock / feed Metal Rods) and
 * Dust Traps (walk into them).
 *
 * Placement: one shared-planner group per node class from the street
 * population's capped `resourceNodeClasses`, so every node stands on a real
 * platform. Node state persists per street in engine.streetSlot('resource-nodes')
 * keyed `<classTsid>:<index>`; the Firefly Jar and the one-time starter kit
 * flag live in this feature's save slice.
 *
 * Art: recovered CC0 OGA sheets under assets/sprites/resources/, loaded with
 * PIXI.Assets before any frame is sliced. Each sheet is scanned once for its
 * per-frame alpha bounds so growth states sit on the ground and the Firefly
 * glow follows the dot along its authored path. The Sloth has no public
 * raster, so it is drawn as SVG (rasterized at 2x) hanging from a branch.
 *
 * Firefly Whistling: GSJS grants `firefly_whistling` at the end of the
 * instanced Alphite-age lab quest `firefly_whistle` (players/player.js
 * fireflyWhistleSwallowed). That lab is not recoverable here, so the first
 * attempt to open a Firefly Jar near Fireflies grants it with the source text.
 *
 * QA: ?autostart=1&fresh=1&resdemo=<classTsid> places that node beside the
 * player on the first street entered (and grants any tool, rods, or skill it
 * needs); &resautoplay=1 performs its main verb once. Canvas data attributes:
 * resourceNodeCount, resourceNodeClasses, resourceLastHarvest, fireflyJar,
 * resourceDemo.
 */

import { ITEM_CATALOG } from '../inventory.js?v=catalog-unified-3';
import { platformYAt } from '../street-model.js';
import { hiresSpriteUrl } from '../sprite-hires.js';
import { rollResourceNodeDrop } from './drops-feature.js?v=drops-1';
import {
  DUST_TRAP_DROP_ITEM_DEFS,
  FIREFLY_WHISTLE_ACHIEVEMENT,
  RESOURCE_ITEM_DEFS,
  RESOURCE_NODE_CATALOG,
  createFireflyJarState,
  createResourceNode,
  ensureResourceItems,
  fireflyJarSheet,
  getResourceNodeDef,
  harvestResourceNode,
  normalizeFireflyJarState,
  normalizeResourceNode,
  resourceNodeFrame,
  resourceNodeStatusLabel,
  resourceNodeVerbs,
  sheetFrameRect,
  starterResourceTools,
  tickResourceNode,
} from '../resource-nodes.js';

export const RESOURCE_FEATURE_ID = 'resource-nodes';
export const RESOURCE_GROUP_PREFIX = 'resource:';

/** Planner clearance per class (px between neighbours on the same band). */
export const RESOURCE_PLACEMENT_CLEARANCE = Object.freeze({
  npc_firefly: 40,
  npc_salmon: 60,
  mortar_barnacle: 42,
  dust_trap: 52,
  ice_knob: 46,
  jellisac: 42,
  dirt_pile: 110,
  peat_1: 115,
  npc_sloth: 140,
  paper_tree: 135,
});

/** The verb each class's QA autoplay performs. */
export const RESOURCE_MAIN_VERB = Object.freeze({
  npc_firefly: 'open',
  npc_salmon: 'pocket',
  mortar_barnacle: 'scrape',
  ice_knob: 'scrape',
  jellisac: 'scoop',
  dirt_pile: 'dig',
  peat_1: 'harvest',
  paper_tree: 'harvest',
  npc_sloth: 'knock',
  dust_trap: 'trigger',
});

const TICK_MS = 500;
const SLOTH_SCALE = 0.8;
const SVG_SCALE = 2;
const WHISTLE_RADIUS = 500;
const Z = Object.freeze({ tree: 14, paper: 16, ground: 21, trap: 19, salmon: 24, firefly: 60 });

// ---------------------------------------------------------------------------
// Pure helpers (tested in tests/resource-nodes-feature.test.js)
// ---------------------------------------------------------------------------

function resolveClassId(classTsid) {
  return getResourceNodeDef(classTsid)?.classTsid || null;
}

/** Planner requests: one group per node class, counts from the capped spawn list. */
export function resourcePlacementGroups(population) {
  const counts = new Map();
  for (const raw of Array.isArray(population?.resourceNodeClasses) ? population.resourceNodeClasses : []) {
    const classTsid = resolveClassId(raw);
    if (!classTsid) continue;
    counts.set(classTsid, (counts.get(classTsid) || 0) + 1);
  }
  return [...counts.entries()].map(([classTsid, count]) => ({
    key: `${RESOURCE_GROUP_PREFIX}${classTsid}`,
    count,
    clearance: RESOURCE_PLACEMENT_CLEARANCE[classTsid] || 60,
  }));
}

/** Pair planner points with node keys; classes the planner could not seat are dropped. */
export function resourceSpawnPlan(population, placement) {
  const plan = [];
  for (const group of resourcePlacementGroups(population)) {
    const classTsid = group.key.slice(RESOURCE_GROUP_PREFIX.length);
    const points = (typeof placement === 'function' ? placement(group.key) : []) || [];
    points.slice(0, group.count).forEach((point, index) => {
      if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return;
      plan.push({ key: `${classTsid}:${index}`, classTsid, x: point.x, y: point.y });
    });
  }
  return plan;
}

/**
 * Reuse or create each planned node in the street slot. Saved nodes are
 * normalized; unknown or mismatched rows are replaced. Mutates slot.nodes and
 * returns [{ ...planItem, node }] where node is the live slot object.
 */
export function prepareStreetResourceNodes(slot, plan, { tsid = '', now = Date.now() } = {}) {
  if (!slot.nodes || typeof slot.nodes !== 'object' || Array.isArray(slot.nodes)) slot.nodes = {};
  const out = [];
  for (const item of plan) {
    let node = normalizeResourceNode(slot.nodes[item.key]);
    if (!node || node.classTsid !== item.classTsid) {
      node = createResourceNode(item.classTsid, { seed: `${tsid}:${item.key}`, now });
    }
    slot.nodes[item.key] = node;
    out.push({ ...item, node });
  }
  return out;
}

export function normalizeResourceFeatureSlice(slice) {
  return {
    jar: normalizeFireflyJarState(slice?.jar || {}),
    starterKit: slice?.starterKit === true,
  };
}

/**
 * One-time pack migration: grant the Scraper, Shovel and Firefly Jar to new
 * players and saves made before this feature. Only an absent entry is filled,
 * so a deliberate zero (sold or dropped) is preserved, and the flag stops the
 * grant from repeating once the tool has left the pack entirely.
 * @returns {string[]} granted class ids
 */
export function migrateResourceStarterKit(inv, sliceState) {
  if (!inv || !sliceState || sliceState.starterKit === true) return [];
  const granted = [];
  for (const [classTsid, qty] of Object.entries(starterResourceTools())) {
    if (inv[classTsid] === undefined) {
      inv[classTsid] = qty;
      granted.push(classTsid);
    }
  }
  sliceState.starterKit = true;
  return granted;
}

/** What a ?resdemo node needs so its main verb can succeed. */
export function resourceDemoKit(classTsid) {
  const id = resolveClassId(classTsid);
  const def = id ? RESOURCE_NODE_CATALOG[id] : null;
  if (!def) return null;
  const items = {};
  for (const verb of def.verbs) {
    const tool = verb.tools?.[verb.tools.length - 1];
    if (tool) items[tool] = 1;
    for (const input of verb.inputs || []) items[input.classTsid] = Math.max(items[input.classTsid] || 0, 3);
  }
  return {
    classTsid: id,
    items,
    skill: def.verbs.find((verb) => verb.skillGate)?.skillGate || null,
    verb: RESOURCE_MAIN_VERB[id] || def.verbs[0].id,
  };
}

/**
 * Platform surface under x nearest to a reference feet y (screen space), so a
 * QA node beside the avatar lands on the ground rather than mid-slope air.
 */
export function surfaceNear(platforms, x, refY) {
  let best = null;
  for (const platform of Array.isArray(platforms) ? platforms : []) {
    const y = platformYAt(platform, x, 0);
    if (y == null || y < refY - 90 || y > refY + 260) continue;
    if (best == null || Math.abs(y - refY) < Math.abs(best - refY)) best = y;
  }
  return best ?? refY;
}

/**
 * Fill GSJS tooltip templates ($energy_cost, $seconds) and drop the Flash-only
 * drag hint ("Or, drag scraper to barnacle.").
 */
export function verbTooltip(verb) {
  const seconds = Math.round(((verb?.durationMs || 0) / 1000) * 10) / 10;
  return String(verb?.tooltip || '')
    .replace(/^Or, drag [^.]*\.\s*/, '')
    .replace(/\$energy_cost/g, String(verb?.costs?.energy ?? 0))
    .replace(/\$seconds/g, String(seconds));
}

/** Menu id for a rules verb. game.js routes a bare `feed` to the animal food picker. */
export function menuVerbId(verbId) {
  return verbId === 'feed' ? 'feed_rod' : verbId;
}

export function rulesVerbId(menuId) {
  return menuId === 'feed_rod' ? 'feed' : menuId;
}

// ---------------------------------------------------------------------------
// Sloth art (no npc_sloth raster survives in the public OGA archives)
// ---------------------------------------------------------------------------

const SLOTH = Object.freeze({
  fur: '#8d6a47',
  furDark: '#5f4430',
  furLight: '#b38d63',
  mask: '#f2e6cc',
  stripe: '#4a3324',
  claw: '#e8dcc2',
  clawEdge: '#8a7a62',
  bandana: '#d8372f',
  bandanaDark: '#9e2621',
  jacket: '#2d3342',
  jacketLight: '#454e63',
  stud: '#dfe4ea',
});

/** Tree + branch + brass knocker. viewBox 300x300; trunk base (64, 296); grip (200, 74). */
const SLOTH_TREE = Object.freeze({ width: 300, height: 300, gripX: 200, gripY: 74, baseY: 296, branchTop: 68 });

function slothTreeSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">
  <defs>
    <linearGradient id="bark" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#5a3a22"/><stop offset="0.45" stop-color="#8a5e3a"/><stop offset="1" stop-color="#5b3b24"/></linearGradient>
    <linearGradient id="limb" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#94673f"/><stop offset="1" stop-color="#5d3d25"/></linearGradient>
    <radialGradient id="shade" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#2b2116" stop-opacity="0.35"/><stop offset="1" stop-color="#2b2116" stop-opacity="0"/></radialGradient>
  </defs>
  <ellipse cx="66" cy="294" rx="58" ry="7" fill="url(#shade)"/>
  <path d="M38 296 C48 276 50 244 50 206 C50 160 45 118 51 70 L81 66 C78 116 80 164 82 208 C84 248 88 278 100 296 Z" fill="url(#bark)" stroke="#4a2f1b" stroke-width="2" stroke-linejoin="round"/>
  <path d="M20 297 C32 292 42 286 48 274 L56 292 C46 296 34 298 20 297 Z" fill="#6a4529" stroke="#4a2f1b" stroke-width="1.5" stroke-linejoin="round"/>
  <path d="M116 297 C104 293 94 287 88 276 L84 292 C92 296 104 298 116 297 Z" fill="#6a4529" stroke="#4a2f1b" stroke-width="1.5" stroke-linejoin="round"/>
  <path d="M60 250 C62 230 61 205 63 180" stroke="#4a2f1b" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.55"/>
  <path d="M70 140 C71 120 69 104 70 86" stroke="#4a2f1b" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.5"/>
  <path d="M58 120 q4 -10 0 -18" stroke="#4a2f1b" stroke-width="1.6" fill="none" stroke-linecap="round" opacity="0.45"/>
  <path d="M74 78 C120 64 170 66 230 70 C252 71 270 68 290 60 L292 66 C272 76 252 80 230 81 C170 82 120 82 78 96 Z" fill="url(#limb)" stroke="#4a2f1b" stroke-width="2" stroke-linejoin="round"/>
  <path d="M250 74 C262 64 270 50 276 40" stroke="#5d3d25" stroke-width="4" fill="none" stroke-linecap="round"/>
  <path d="M150 72 C156 60 158 50 158 40" stroke="#5d3d25" stroke-width="3.5" fill="none" stroke-linecap="round"/>
  ${slothLeaves()}
  <rect x="58" y="166" width="16" height="20" rx="4" fill="#b88a34" stroke="#6e4f17" stroke-width="1.5"/>
  <circle cx="66" cy="190" r="9" fill="none" stroke="#d9ad4c" stroke-width="4"/>
  <circle cx="66" cy="190" r="9" fill="none" stroke="#6e4f17" stroke-width="1" opacity="0.6"/>
  <circle cx="66" cy="174" r="2.4" fill="#f3d58a"/>
</svg>`;
}

/** Clumps of small pointed leaves, in the paper tree's palette, around the crown and twigs. */
function slothLeaves() {
  const clumps = [
    [44, 52, 30, 18], [92, 46, 30, 20], [64, 26, 34, 18], [20, 38, 18, 14],
    [158, 38, 16, 12], [274, 34, 18, 14], [258, 24, 12, 9], [118, 66, 14, 8],
  ];
  const fills = ['#2f5524', '#3f6b2e', '#4f7f36', '#365f28'];
  const out = [];
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (const [cx, cy, rx, ry] of clumps) {
    const count = Math.round((rx * ry) / 22);
    for (let i = 0; i < count; i += 1) {
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand());
      const x = (cx + Math.cos(a) * rx * r).toFixed(1);
      const y = (cy + Math.sin(a) * ry * r).toFixed(1);
      const rot = Math.round(rand() * 360);
      const size = (0.8 + rand() * 0.5).toFixed(2);
      const fill = fills[Math.floor(rand() * fills.length)];
      out.push(`<g transform="translate(${x} ${y}) rotate(${rot}) scale(${size})"><path d="M-9 0 C-5 -6 5 -6 9 0 C5 6 -5 6 -9 0 Z" fill="${fill}" stroke="#203a17" stroke-width="0.8"/><path d="M-8 0 L7 0" stroke="#7ea65a" stroke-width="0.7" opacity="0.7"/></g>`);
    }
  }
  return out.join('');
}

function slothClaws(x, y, flip = 1) {
  const out = [];
  for (let i = 0; i < 3; i += 1) {
    const dx = (i - 1) * 5 * flip;
    const d = `M${x + dx - 2} ${y + 2} C${x + dx - 3} ${y - 8} ${x + dx + 4 * flip} ${y - 12} ${x + dx + 7 * flip} ${y - 4}`;
    out.push(`<path d="${d}" fill="none" stroke="${SLOTH.clawEdge}" stroke-width="4.4" stroke-linecap="round"/>`);
    out.push(`<path d="${d}" fill="none" stroke="${SLOTH.claw}" stroke-width="2.6" stroke-linecap="round"/>`);
  }
  return out.join('');
}

const SLOTH_DEFS = `<defs>
  <radialGradient id="furBody" cx="0.45" cy="0.4" r="0.7"><stop offset="0" stop-color="${SLOTH.furLight}"/><stop offset="1" stop-color="${SLOTH.fur}"/></radialGradient>
  <radialGradient id="furHead" cx="0.45" cy="0.35" r="0.7"><stop offset="0" stop-color="#a98157"/><stop offset="1" stop-color="${SLOTH.fur}"/></radialGradient>
  <linearGradient id="jacket" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="${SLOTH.jacket}"/><stop offset="0.5" stop-color="${SLOTH.jacketLight}"/><stop offset="1" stop-color="${SLOTH.jacket}"/></linearGradient>
  <linearGradient id="rod" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#d7dde4"/><stop offset="0.5" stop-color="#8f99a5"/><stop offset="1" stop-color="#5d6672"/></linearGradient>
</defs>`;

function slothArm(x1, y1, x2, y2) {
  const mx = (x1 + x2) / 2 + (x1 < 65 ? -6 : 6);
  const my = (y1 + y2) / 2;
  const d = `M${x1} ${y1} Q${mx} ${my} ${x2} ${y2}`;
  return `<path d="${d}" stroke="${SLOTH.furDark}" stroke-width="15" fill="none" stroke-linecap="round"/>
  <path d="${d}" stroke="${SLOTH.fur}" stroke-width="12" fill="none" stroke-linecap="round"/>
  <path d="M${x1 + (x1 < 65 ? 2 : -2)} ${y1 - 6} Q${mx} ${my} ${x2} ${y2 + 8}" stroke="${SLOTH.furLight}" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.6"/>`;
}

function slothHead(mouth) {
  const mouthSvg = mouth === 'open'
    ? `<ellipse cx="65" cy="73" rx="5" ry="4" fill="#5a2a22"/><ellipse cx="65" cy="75" rx="3" ry="1.6" fill="#d86a62"/>`
    : mouth === 'chew'
      ? `<path d="M58 72 Q65 70 72 72" stroke="${SLOTH.stripe}" stroke-width="2" fill="none" stroke-linecap="round"/><ellipse cx="80" cy="68" rx="5" ry="4" fill="#c79a6c" opacity="0.7"/>`
      : `<path d="M58 71 Q65 77 72 71" stroke="${SLOTH.stripe}" stroke-width="2" fill="none" stroke-linecap="round"/>`;
  return `<circle cx="65" cy="60" r="28" fill="url(#furHead)" stroke="${SLOTH.furDark}" stroke-width="2"/>
  <path d="M40 66 l-5 4 6 -1 z M90 66 l5 4 -6 -1 z" fill="${SLOTH.furDark}"/>
  <ellipse cx="65" cy="65" rx="22" ry="17" fill="${SLOTH.mask}"/>
  <path d="M47 58 C52 54 60 56 61 61 C60 67 54 72 49 71 C45 69 44 62 47 58 Z" fill="${SLOTH.stripe}"/>
  <path d="M83 58 C78 54 70 56 69 61 C70 67 76 72 81 71 C85 69 86 62 83 58 Z" fill="${SLOTH.stripe}"/>
  <circle cx="55.5" cy="61" r="3.4" fill="#120c08"/><circle cx="74.5" cy="61" r="3.4" fill="#120c08"/>
  <circle cx="56.6" cy="59.8" r="1.2" fill="#fff"/><circle cx="75.6" cy="59.8" r="1.2" fill="#fff"/>
  <ellipse cx="65" cy="67" rx="5" ry="3.4" fill="#3a2a20"/><ellipse cx="64" cy="66" rx="1.6" ry="0.9" fill="#8b7462"/>
  ${mouthSvg}
  <path d="M38 52 C40 34 52 30 65 30 C80 30 91 36 92 52 C84 46 74 44 65 44 C55 44 45 46 38 52 Z" fill="${SLOTH.bandana}" stroke="${SLOTH.bandanaDark}" stroke-width="1.6" stroke-linejoin="round"/>
  <path d="M90 45 C98 40 104 42 106 48 C101 47 97 48 94 52 Z" fill="${SLOTH.bandana}" stroke="${SLOTH.bandanaDark}" stroke-width="1.4"/>
  <path d="M91 49 C97 52 99 58 97 63 C94 59 91 56 88 54 Z" fill="${SLOTH.bandana}" stroke="${SLOTH.bandanaDark}" stroke-width="1.4"/>
  <circle cx="91" cy="48" r="3.2" fill="${SLOTH.bandanaDark}"/>
  <g fill="#fbe9e4"><circle cx="52" cy="40" r="1.6"/><circle cx="64" cy="36" r="1.6"/><circle cx="77" cy="39" r="1.6"/><circle cx="58" cy="45" r="1.1"/><circle cx="71" cy="44" r="1.1"/><circle cx="86" cy="45" r="1.2"/></g>`;
}

function slothTorso() {
  const leg = (d) => `<path d="${d}" stroke="${SLOTH.furDark}" stroke-width="13" fill="none" stroke-linecap="round"/><path d="${d}" stroke="${SLOTH.fur}" stroke-width="10" fill="none" stroke-linecap="round"/>`;
  const toes = '<path d="M44 170 q-2 6 2 8"/><path d="M49 171 q0 6 4 7"/><path d="M80 171 q0 6 -4 7"/><path d="M85 170 q2 6 -2 8"/>';
  return `<path d="M30 104 C28 80 44 70 65 70 C86 70 102 80 100 104 C100 132 92 150 65 152 C38 150 30 132 30 104 Z" fill="url(#furBody)" stroke="${SLOTH.furDark}" stroke-width="2"/>
  <path d="M34 128 l-6 8 9 -3 z M96 128 l6 8 -9 -3 z M48 148 l-3 8 7 -5 z M82 148 l3 8 -7 -5 z" fill="${SLOTH.fur}" stroke="${SLOTH.furDark}" stroke-width="1.2" stroke-linejoin="round"/>
  <path d="M33 92 C38 78 50 74 58 76 L56 120 C50 132 40 134 34 128 C30 116 30 102 33 92 Z" fill="url(#jacket)" stroke="#1b1f29" stroke-width="1.6" stroke-linejoin="round"/>
  <path d="M97 92 C92 78 80 74 72 76 L74 120 C80 132 90 134 96 128 C100 116 100 102 97 92 Z" fill="url(#jacket)" stroke="#1b1f29" stroke-width="1.6" stroke-linejoin="round"/>
  <ellipse cx="65" cy="104" rx="10" ry="22" fill="#c7a47c" opacity="0.85"/>
  <g fill="${SLOTH.stud}" stroke="#7d8794" stroke-width="0.6"><circle cx="55" cy="84" r="1.8"/><circle cx="54.5" cy="96" r="1.8"/><circle cx="54" cy="108" r="1.8"/><circle cx="75" cy="84" r="1.8"/><circle cx="75.5" cy="96" r="1.8"/><circle cx="76" cy="108" r="1.8"/></g>
  ${leg('M48 146 C46 156 46 162 48 168')}${leg('M82 146 C84 156 84 162 82 168')}
  <g stroke="${SLOTH.clawEdge}" stroke-width="3.4" fill="none" stroke-linecap="round">${toes}</g>
  <g stroke="${SLOTH.claw}" stroke-width="1.8" fill="none" stroke-linecap="round">${toes}</g>`;
}

/** Hanging body. viewBox 130x184; the hands grip the branch at (65, 12). */
const SLOTH_BODY = Object.freeze({ width: 130, height: 184, gripX: 65, gripY: 12, mouthX: 65, mouthY: 73 });

function slothBodySvg(pose = 'idle', mouth = 'smile') {
  const eating = pose === 'eating';
  const arms = eating
    ? `${slothArm(40, 84, 42, 14)}${slothClaws(42, 14, -1)}`
    : `${slothArm(40, 84, 44, 14)}${slothArm(90, 84, 86, 14)}${slothClaws(44, 14, -1)}${slothClaws(86, 14, 1)}`;
  const rod = eating
    ? `<g transform="rotate(-24 84 76)"><rect x="70" y="72" width="44" height="7" rx="3" fill="url(#rod)" stroke="#4a525d" stroke-width="1.2"/><rect x="72" y="73" width="38" height="1.6" fill="#eef2f6" opacity="0.7"/></g>
  ${slothArm(92, 92, 98, 80)}<circle cx="99" cy="79" r="7" fill="${SLOTH.fur}" stroke="${SLOTH.furDark}" stroke-width="1.6"/>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="130" height="184" viewBox="0 0 130 184">${SLOTH_DEFS}
  ${arms}${slothTorso()}${slothHead(mouth)}${rod}
</svg>`;
}

/** Tucked up in the leaves on top of the branch. viewBox 130x70; branch top at y = 52. */
const SLOTH_HIDDEN = Object.freeze({ width: 130, height: 70, branchX: 65, branchY: 52 });

/** SVG sources, exported for the preview harness and tests. */
export const SLOTH_ART = Object.freeze({
  tree: () => slothTreeSvg(),
  hidden: () => slothHiddenSvg(),
  body: (pose, mouth) => slothBodySvg(pose, mouth),
});

function slothHiddenSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="130" height="70" viewBox="0 0 130 70">${SLOTH_DEFS}
  <ellipse cx="65" cy="38" rx="40" ry="22" fill="url(#furBody)" stroke="${SLOTH.furDark}" stroke-width="2"/>
  <path d="M30 40 l-6 4 7 0 z M100 40 l6 4 -7 0 z M50 18 l-2 -6 6 4 z M78 17 l3 -6 1 7 z" fill="${SLOTH.fur}" stroke="${SLOTH.furDark}" stroke-width="1.2" stroke-linejoin="round"/>
  <path d="M52 30 C58 22 74 22 80 30 C78 26 70 24 66 24 C60 24 55 26 52 30 Z" fill="${SLOTH.bandana}" stroke="${SLOTH.bandanaDark}" stroke-width="1.2"/>
  <path d="M56 36 q5 3 9 0" stroke="${SLOTH.stripe}" stroke-width="2" fill="none" stroke-linecap="round"/>
  <path d="M68 36 q5 3 9 0" stroke="${SLOTH.stripe}" stroke-width="2" fill="none" stroke-linecap="round"/>
  ${[[16, 46, 0], [30, 50, 40], [104, 44, 160], [114, 50, 200], [92, 52, 130]].map(([x, y, r]) => `<g transform="translate(${x} ${y}) rotate(${r}) scale(1.1)"><path d="M-9 0 C-5 -6 5 -6 9 0 C5 6 -5 6 -9 0 Z" fill="#3f6b2e" stroke="#203a17" stroke-width="0.8"/></g>`).join('')}
  ${slothClaws(46, 62, -1)}${slothClaws(84, 62, 1)}
</svg>`;
}

/** Soft additive glow for Fireflies. */
function glowSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><defs><radialGradient id="g" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#fff7b0" stop-opacity="0.95"/><stop offset="0.25" stop-color="#ffe866" stop-opacity="0.55"/><stop offset="1" stop-color="#ffd23a" stop-opacity="0"/></radialGradient></defs><circle cx="32" cy="32" r="32" fill="url(#g)"/></svg>`;
}

function svgDataUrl(svg) {
  return `data:image/svg+xml;charset=utf8,${encodeURIComponent(svg)}`;
}

// ---------------------------------------------------------------------------
// Runtime state
// ---------------------------------------------------------------------------

let jar = createFireflyJarState();
const kit = { starterKit: false };
let entities = [];
let effects = [];
let generation = 0;
let lastTickAt = 0;
let lastHarvest = '';
let demoUsed = false;
let demoEntity = null;
let autoplayTimer = null;
let jarFx = null;

/** path -> { base, bounds } once loaded; promises while loading. */
const sheets = new Map();
const sheetLoads = new Map();
const frameTextures = new Map();
let svgTextures = null;
let svgLoad = null;

function hash(value) {
  let h = 2166136261;
  for (const char of String(value || '')) {
    h ^= char.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Per-frame alpha bounds so growth states sit on the ground. */
function scanBounds(source, def) {
  if (typeof document === 'undefined' || !source) return [];
  try {
    const canvas = document.createElement('canvas');
    canvas.width = def.width;
    canvas.height = def.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    // Drawn at the sheet's 1x size, so a 3x source scans in the same cells.
    ctx.drawImage(source, 0, 0, def.width, def.height);
    const { data } = ctx.getImageData(0, 0, def.width, def.height);
    const out = [];
    for (let i = 0; i < def.frameCount; i += 1) {
      const r = sheetFrameRect(def, i);
      let l = r.w;
      let t = r.h;
      let rr = -1;
      let b = -1;
      for (let y = 0; y < r.h; y += 1) {
        const row = (r.y + y) * def.width;
        for (let x = 0; x < r.w; x += 1) {
          if (data[(row + r.x + x) * 4 + 3] <= 24) continue;
          if (x < l) l = x;
          if (x > rr) rr = x;
          if (y < t) t = y;
          if (y > b) b = y;
        }
      }
      out.push(b < 0 ? null : { l, t, r: rr + 1, b: b + 1, cx: (l + rr + 1) / 2, cy: (t + b + 1) / 2 });
    }
    return out;
  } catch {
    return [];
  }
}

function ensureSheet(engine, def) {
  if (sheets.has(def.path)) return Promise.resolve(sheets.get(def.path));
  if (!sheetLoads.has(def.path)) {
    sheetLoads.set(
      def.path,
      engine.PIXI.Assets.load(hiresSpriteUrl(def.path) || def.path)
        .then((texture) => {
          const base = texture.baseTexture;
          const entry = { base, bounds: scanBounds(base.resource?.source, def) };
          sheets.set(def.path, entry);
          return entry;
        })
        .catch(() => null)
    );
  }
  return sheetLoads.get(def.path);
}

function frameTexture(engine, def, index) {
  const sheet = sheets.get(def.path);
  if (!sheet) return null;
  const rect = sheetFrameRect(def, index);
  const key = `${def.path}#${rect.index}`;
  if (!frameTextures.has(key)) {
    frameTextures.set(key, new engine.PIXI.Texture(sheet.base, new engine.PIXI.Rectangle(rect.x, rect.y, rect.w, rect.h)));
  }
  return frameTextures.get(key);
}

function frameBounds(def, index) {
  return sheets.get(def.path)?.bounds?.[index] || null;
}

function footAnchor(def, index) {
  const bounds = frameBounds(def, index);
  return bounds ? bounds.b / def.frameHeight : 1;
}

function sheetFrames(engine, def) {
  return Array.from({ length: def.frameCount }, (_, i) => frameTexture(engine, def, i)).filter(Boolean);
}

function ensureSvgTextures(engine) {
  if (svgTextures) return Promise.resolve(svgTextures);
  if (!svgLoad) {
    const { PIXI } = engine;
    const load = (svg) => PIXI.Assets.load({ src: svgDataUrl(svg), data: { resourceOptions: { scale: SVG_SCALE } } })
      .catch(() => PIXI.Texture.from(svgDataUrl(svg), { resourceOptions: { scale: SVG_SCALE } }));
    svgLoad = Promise.all([
      load(slothTreeSvg()),
      load(slothHiddenSvg()),
      load(slothBodySvg('idle', 'smile')),
      load(slothBodySvg('eating', 'open')),
      load(slothBodySvg('eating', 'chew')),
      load(glowSvg()),
    ]).then(([tree, hidden, idle, eatOpen, eatChew, glow]) => {
      svgTextures = { tree, hidden, idle, eatOpen, eatChew, glow };
      return svgTextures;
    });
  }
  return svgLoad;
}

/** Sheets a node needs for its current look (others load on demand). */
function sheetsNeeded(node) {
  const def = getResourceNodeDef(node.classTsid);
  if (!def || def.art !== 'raster') return [];
  if (node.classTsid === 'npc_salmon') return [def.sprite.sheets.swimRight, def.sprite.sheets.turnRight];
  if (node.classTsid === 'dust_trap') return Object.values(def.sprite.sheets);
  const frame = resourceNodeFrame(node);
  return frame?.sheet ? [frame.sheet] : [];
}

// ---------------------------------------------------------------------------
// QA data
// ---------------------------------------------------------------------------

function publish(engine) {
  const counts = {};
  for (const entity of entities) counts[entity.classTsid] = (counts[entity.classTsid] || 0) + 1;
  engine.setData('resourceNodeCount', String(entities.length));
  engine.setData(
    'resourceNodeClasses',
    Object.keys(counts).sort().map((id) => `${id}:${counts[id]}`).join(',')
  );
  engine.setData('resourceLastHarvest', lastHarvest);
  engine.setData('fireflyJar', String(jar.flies));
  engine.setData(
    'resourceDemo',
    demoEntity ? `${demoEntity.classTsid}:${demoEntity.node.units}:${resourceNodeStatusLabel(demoEntity.node)}` : ''
  );
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

function targetFor(engine, entity, sprite, extra = {}) {
  const def = getResourceNodeDef(entity.classTsid);
  return engine.register({
    classId: entity.classTsid,
    featureId: RESOURCE_FEATURE_ID,
    label: def.label,
    subtitle: resourceNodeStatusLabel(entity.node) || def.verbs[0].tooltip,
    sprite,
    resourceKey: entity.key,
    ...extra,
  });
}

function dropTarget(engine, entity) {
  if (entity.target) engine.unregister(entity.target);
  entity.target = null;
  entity.view = null;
}

function buildGroundView(engine, entity) {
  const { PIXI } = engine;
  const frame = resourceNodeFrame(entity.node);
  const texture = frame?.sheet ? frameTexture(engine, frame.sheet, frame.frameIndex) : null;
  const sprite = new PIXI.Sprite(texture || PIXI.Texture.EMPTY);
  sprite.anchor.set(0.5, frame?.sheet ? footAnchor(frame.sheet, frame.frameIndex) : 1);
  sprite.x = entity.x;
  sprite.y = entity.y + 2;
  sprite.zIndex = entity.classTsid === 'paper_tree' ? Z.paper : Z.ground;
  if (entity.classTsid !== 'paper_tree') {
    sprite._worldHitW = Math.max(46, frame?.sheet?.frameWidth || 46);
    sprite._worldHitH = Math.max(40, frame?.sheet?.frameHeight || 40);
  }
  engine.entityLayer.addChild(sprite);
  entity.view = { kind: 'ground', sprite, sheetPath: frame?.sheet?.path, frameIndex: frame?.frameIndex };
  entity.target = targetFor(engine, entity, sprite);
}

function buildFireflyView(engine, entity) {
  const { PIXI } = engine;
  const frame = resourceNodeFrame(entity.node);
  const frames = sheetFrames(engine, frame.sheet);
  if (!frames.length) return;
  const root = new PIXI.Container();
  root.zIndex = Z.firefly;
  root._worldHitW = 72;
  root._worldHitH = 64;
  const glow = new PIXI.Sprite(svgTextures?.glow || PIXI.Texture.EMPTY);
  glow.anchor.set(0.5);
  glow.blendMode = PIXI.BLEND_MODES.ADD;
  glow.scale.set(0.5);
  const fly = new PIXI.AnimatedSprite(frames);
  fly.anchor.set(0.5);
  fly.y = -32;
  fly.animationSpeed = 0.45;
  fly.gotoAndPlay(hash(entity.key) % frames.length);
  root.addChild(glow, fly);
  engine.entityLayer.addChild(root);
  const seed = hash(entity.key);
  entity.view = {
    kind: 'firefly',
    sprite: root,
    fly,
    glow,
    sheet: frame.sheet,
    phase: (seed % 628) / 100,
    hover: 74 + (seed % 70),
    t: 0,
  };
  entity.target = targetFor(engine, entity, root, { airborne: true });
  placeFirefly(entity, 0);
}

function placeFirefly(entity, dtMs) {
  const view = entity.view;
  view.t += dtMs / 1000;
  const t = view.t;
  // GSJS wanders inside a fly box around the spawn point; ease through it.
  view.sprite.x = entity.x + Math.sin(t * 0.37 + view.phase) * 96 + Math.sin(t * 0.91 + view.phase * 2) * 22;
  view.sprite.y = entity.y - view.hover + Math.sin(t * 0.53 + view.phase * 3) * 24 + 32;
  const bounds = frameBounds(view.sheet, view.fly.currentFrame);
  view.glow.x = bounds ? bounds.cx - view.sheet.frameWidth / 2 : 0;
  view.glow.y = view.fly.y + (bounds ? bounds.cy - view.sheet.frameHeight / 2 : 0);
  view.glow.alpha = 0.55 + 0.3 * Math.sin(t * 3.1 + view.phase);
}

function buildSalmonView(engine, entity) {
  const { PIXI } = engine;
  const def = getResourceNodeDef('npc_salmon');
  const swim = sheetFrames(engine, def.sprite.sheets.swimRight);
  if (!swim.length) return;
  const root = new PIXI.Container();
  root.zIndex = Z.salmon;
  root._worldHitW = 64;
  root._worldHitH = 44;
  const fish = new PIXI.AnimatedSprite(swim);
  fish.anchor.set(0.5);
  fish.y = -22;
  fish.animationSpeed = 0.4;
  fish.play();
  root.addChild(fish);
  engine.entityLayer.addChild(root);
  const seed = hash(entity.key);
  const dir = seed % 2 ? 1 : -1;
  fish.scale.x = dir;
  entity.view = {
    kind: 'salmon',
    sprite: root,
    fish,
    swim,
    turn: sheetFrames(engine, def.sprite.sheets.turnRight),
    dir,
    turning: false,
    offset: ((seed % 200) - 100) * 0.8,
    range: 130 + (seed % 60),
    depth: 42 + (seed % 5) * 14,
    phase: (seed % 628) / 100,
    t: 0,
  };
  entity.target = targetFor(engine, entity, root);
  placeSalmon(entity, 0);
}

function placeSalmon(entity, dtMs) {
  const view = entity.view;
  view.t += dtMs / 1000;
  if (!view.turning) {
    view.offset += view.dir * 0.042 * dtMs;
    if (Math.abs(view.offset) >= view.range && Math.sign(view.offset) === view.dir) {
      view.turning = true;
      // turnRight turns a left-facing fish to face right; mirrored, it turns a right-facing one left.
      if (view.turn.length) {
        view.fish.scale.x = -view.dir;
        view.fish.textures = view.turn;
        view.fish.loop = false;
        view.fish.animationSpeed = 0.42;
        view.fish.onComplete = () => {
          view.dir = -view.dir;
          view.fish.scale.x = view.dir;
          view.fish.textures = view.swim;
          view.fish.loop = true;
          view.fish.animationSpeed = 0.4;
          view.fish.onComplete = null;
          view.fish.play();
          view.turning = false;
        };
        view.fish.gotoAndPlay(0);
      } else {
        view.dir = -view.dir;
        view.fish.scale.x = view.dir;
        view.turning = false;
      }
    }
  }
  view.sprite.x = entity.x + view.offset;
  view.sprite.y = entity.y - view.depth + Math.sin(view.t * 1.7 + view.phase) * 7 + 22;
}

function buildDustTrapView(engine, entity) {
  const { PIXI } = engine;
  const sprite = new PIXI.Sprite(PIXI.Texture.EMPTY);
  sprite.x = entity.x;
  sprite.y = entity.y + 2;
  sprite.zIndex = Z.trap;
  engine.entityLayer.addChild(sprite);
  // Collision-only in GSJS: no menu target, so E never selects it by accident.
  entity.view = { kind: 'trap', sprite };
  refreshTrap(engine, entity);
}

function refreshTrap(engine, entity) {
  const frame = resourceNodeFrame(entity.node);
  const texture = frame?.sheet ? frameTexture(engine, frame.sheet, frame.frameIndex) : null;
  if (!texture) return;
  const sprite = entity.view.sprite;
  sprite.texture = texture;
  sprite.anchor.set(0.5, footAnchor(frame.sheet, 0));
}

function slothGripY() {
  return -(SLOTH_TREE.baseY - SLOTH_TREE.gripY) * SLOTH_SCALE;
}

function buildSlothView(engine, entity) {
  const { PIXI } = engine;
  if (!svgTextures) return;
  const s = SLOTH_SCALE / SVG_SCALE;
  const root = new PIXI.Container();
  root.x = entity.x;
  root.y = entity.y + 2;
  root.zIndex = Z.tree;
  // Hit box: the hanging column under the branch, so the avatar can reach it from the ground.
  root._worldHitW = 120;
  root._worldHitH = (SLOTH_TREE.baseY - SLOTH_TREE.branchTop + 30) * SLOTH_SCALE;
  const tree = new PIXI.Sprite(svgTextures.tree);
  tree.anchor.set(SLOTH_TREE.gripX / SLOTH_TREE.width, SLOTH_TREE.baseY / SLOTH_TREE.height);
  tree.scale.set(s);
  const hidden = new PIXI.Sprite(svgTextures.hidden);
  hidden.anchor.set(SLOTH_HIDDEN.branchX / SLOTH_HIDDEN.width, SLOTH_HIDDEN.branchY / SLOTH_HIDDEN.height);
  hidden.scale.set(s);
  hidden.y = -(SLOTH_TREE.baseY - SLOTH_TREE.branchTop) * SLOTH_SCALE + 4;
  const body = new PIXI.Sprite(svgTextures.idle);
  body.anchor.set(SLOTH_BODY.gripX / SLOTH_BODY.width, SLOTH_BODY.gripY / SLOTH_BODY.height);
  body.scale.set(s);
  body.y = slothGripY();
  root.addChild(tree, body, hidden);
  engine.entityLayer.addChild(root);
  entity.view = { kind: 'sloth', sprite: root, body, hidden, t: (hash(entity.key) % 100) / 10, drop: 0, chewAt: 0, chew: false, spits: [] };
  entity.target = targetFor(engine, entity, root, { airborne: true });
  refreshSloth(entity);
}

function refreshSloth(entity) {
  const view = entity.view;
  const frame = resourceNodeFrame(entity.node);
  const state = frame?.state || 'hidden';
  const wasHidden = view.state === 'hidden';
  view.state = state;
  view.hidden.visible = state === 'hidden';
  view.body.visible = state !== 'hidden';
  if (state === 'idle') view.body.texture = svgTextures.idle;
  if (state === 'eating') view.body.texture = view.chew ? svgTextures.eatChew : svgTextures.eatOpen;
  if (wasHidden && state !== 'hidden') view.drop = 1;
}

function placeSloth(engine, entity, dtMs, now) {
  const view = entity.view;
  view.t += dtMs / 1000;
  if (view.drop > 0) view.drop = Math.max(0, view.drop - dtMs / 450);
  const ease = view.drop * view.drop;
  view.body.y = slothGripY() - ease * 60;
  view.body.alpha = 1 - ease * 0.6;
  view.body.rotation = Math.sin(view.t * 1.15) * (view.state === 'eating' ? 0.025 : 0.06);
  if (view.state === 'eating' && now - view.chewAt > 230) {
    view.chewAt = now;
    view.chew = !view.chew;
    view.body.texture = view.chew ? svgTextures.eatChew : svgTextures.eatOpen;
  }
  while (view.spits.length && now >= view.spits[0]) {
    view.spits.shift();
    spitSnail(engine, entity);
  }
}

function spawnView(engine, entity) {
  if (entity.view) return;
  const def = getResourceNodeDef(entity.classTsid);
  if (def.art === 'vector') return buildSlothView(engine, entity);
  if (entity.classTsid === 'dust_trap') return buildDustTrapView(engine, entity);
  const frame = resourceNodeFrame(entity.node);
  if (frame?.hidden) return;
  if (entity.classTsid === 'npc_firefly') return buildFireflyView(engine, entity);
  if (entity.classTsid === 'npc_salmon') return buildSalmonView(engine, entity);
  return buildGroundView(engine, entity);
}

/** Bring the view in line with node state (frames, respawns, captures). */
function refreshEntity(engine, entity) {
  const myGeneration = generation;
  const missing = sheetsNeeded(entity.node).filter((def) => !sheets.has(def.path));
  if (missing.length) {
    Promise.all(missing.map((def) => ensureSheet(engine, def))).then(() => {
      if (myGeneration === generation && entities.includes(entity)) refreshEntity(engine, entity);
    });
    return;
  }
  const frame = resourceNodeFrame(entity.node);
  if (frame?.hidden) {
    if (entity.view) dropTarget(engine, entity);
    return;
  }
  if (!entity.view) {
    spawnView(engine, entity);
    return;
  }
  if (entity.view.kind === 'sloth') refreshSloth(entity);
  else if (entity.view.kind === 'trap') refreshTrap(engine, entity);
  else if (entity.view.kind === 'ground' && frame?.sheet) {
    if (entity.view.sheetPath !== frame.sheet.path || entity.view.frameIndex !== frame.frameIndex) {
      const texture = frameTexture(engine, frame.sheet, frame.frameIndex);
      if (texture) {
        entity.view.sprite.texture = texture;
        entity.view.sprite.anchor.set(0.5, footAnchor(frame.sheet, frame.frameIndex));
        entity.view.sheetPath = frame.sheet.path;
        entity.view.frameIndex = frame.frameIndex;
      }
    }
  }
  if (entity.target) entity.target.subtitle = resourceNodeStatusLabel(entity.node) || entity.target.subtitle;
}

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------

function addEffect(engine, display, update) {
  engine.fxLayer.addChild(display);
  effects.push({ display, update, t: 0 });
}

function clearEffects() {
  for (const fx of effects) {
    fx.display.parent?.removeChild(fx.display);
    if (!fx.display.destroyed) fx.display.destroy({ children: true });
  }
  effects = [];
  jarFx = null;
}

function tickEffects(dtMs) {
  effects = effects.filter((fx) => {
    fx.t += dtMs;
    const alive = fx.update(fx.t, fx.display) !== false && !fx.display.destroyed;
    if (!alive) {
      fx.display.parent?.removeChild(fx.display);
      if (!fx.display.destroyed) fx.display.destroy({ children: true });
    }
    return alive;
  });
}

/** Captured Fireflies stream into the jar at the avatar's hand. */
function flyToPlayer(engine, from, delayMs) {
  if (!svgTextures?.glow) return;
  const { PIXI } = engine;
  const dot = new PIXI.Sprite(svgTextures.glow);
  dot.anchor.set(0.5);
  dot.blendMode = PIXI.BLEND_MODES.ADD;
  dot.scale.set(0.45);
  dot.x = from.x;
  dot.y = from.y;
  addEffect(engine, dot, (t) => {
    const k = Math.min(1, Math.max(0, (t - delayMs) / 700));
    const player = engine.player;
    const tx = player.x + 18;
    const ty = player.y - 64;
    const e = k * k * (3 - 2 * k);
    dot.x = from.x + (tx - from.x) * e + Math.sin(k * Math.PI * 3) * 14 * (1 - k);
    dot.y = from.y + (ty - from.y) * e - Math.sin(k * Math.PI) * 30;
    dot.scale.set(0.45 * (1 - k * 0.6));
    return k < 1;
  });
}

function showJar(engine, flies, state = 'closing') {
  const def = fireflyJarSheet(flies, state);
  ensureSheet(engine, def).then((sheet) => {
    if (!sheet || !engine.player) return;
    const frames = sheetFrames(engine, def);
    if (!frames.length) return;
    if (jarFx && !jarFx.destroyed) jarFx.alpha = 0;
    const jarSprite = new engine.PIXI.AnimatedSprite(frames);
    jarSprite.anchor.set(0.5, 1);
    jarSprite.scale.set(0.7);
    jarSprite.loop = false;
    jarSprite.animationSpeed = 0.35;
    jarSprite.play();
    jarFx = jarSprite;
    addEffect(engine, jarSprite, (t) => {
      jarSprite.x = engine.player.x + 30;
      jarSprite.y = engine.player.y - 58;
      jarSprite.alpha = t < 1600 ? 1 : Math.max(0, 1 - (t - 1600) / 400);
      return t < 2000 && jarSprite.alpha > 0;
    });
  });
}

function spitSnail(engine, entity) {
  const { PIXI } = engine;
  const snail = PIXI.Sprite.from('assets/sprites/icons/snail.png');
  snail.anchor.set(0.5);
  snail.scale.set(0.6);
  const from = {
    x: entity.x + (SLOTH_BODY.mouthX - SLOTH_BODY.gripX) * SLOTH_SCALE,
    y: entity.y + slothGripY() + (SLOTH_BODY.mouthY - SLOTH_BODY.gripY) * SLOTH_SCALE,
  };
  const to = { x: engine.player.x, y: engine.player.y - 40 };
  addEffect(engine, snail, (t) => {
    const k = Math.min(1, t / 650);
    snail.x = from.x + (to.x - from.x) * k;
    snail.y = from.y + (to.y - from.y) * k - Math.sin(k * Math.PI) * 70;
    snail.rotation = k * 6;
    snail.alpha = k > 0.85 ? (1 - k) / 0.15 : 1;
    return k < 1;
  });
}

// ---------------------------------------------------------------------------
// Verbs
// ---------------------------------------------------------------------------

function whistleUnlocked(engine) {
  return engine.unlockedAchievements.includes(FIREFLY_WHISTLE_ACHIEVEMENT);
}

function nearbyFireflies(engine, entity) {
  const px = engine.player.x;
  const py = engine.player.y;
  return entities
    .filter((other) => other !== entity && other.classTsid === 'npc_firefly' && other.view)
    .map((other) => ({ other, d: Math.hypot(other.view.sprite.x - px, other.view.sprite.y - py) }))
    .filter((row) => row.d <= WHISTLE_RADIUS)
    .sort((a, b) => a.d - b.d)
    .map((row) => row.other.node);
}

function verbContext(engine, entity, verbId) {
  return {
    verbId,
    skills: engine.learnedSkills,
    // Imagination upgrades (scraping/scooping speed, ice and peat yield, dirt and peat daily limits).
    upgrades: engine.pc?.imaginationUpgrades || [],
    achievements: engine.unlockedAchievements,
    toolState: engine.toolState,
    now: Date.now(),
    jar,
    nearby: entity.classTsid === 'npc_firefly' ? nearbyFireflies(engine, entity) : [],
    // The QA Sloth skips the Animal Kinship 3 gate; real Sloths keep it.
    requireSkill: entity !== demoEntity,
    // First Firefly attempt grants Firefly Whistling (see header).
    requireAchievement: entity.classTsid === 'npc_firefly' ? whistleUnlocked(engine) : true,
  };
}

/**
 * Stand-in for the firefly_whistle lab: the source announcement, the swallow
 * line, then the real badge (its rewards come from the achievement catalog).
 */
function grantWhistle(engine) {
  if (whistleUnlocked(engine)) return;
  engine.toast('What ho! ... Fireflies!', 2200);
  if (engine.grantAchievement(FIREFLY_WHISTLE_ACHIEVEMENT)) {
    engine.pushActivity('Oops, you swallowed the whistle! I guess that still counts?');
  }
}

function itemLabel(classTsid, qty) {
  const def = RESOURCE_ITEM_DEFS[classTsid] || DUST_TRAP_DROP_ITEM_DEFS[classTsid];
  if (def) return `${qty} ${qty === 1 ? def.label : def.plural}`;
  const item = ITEM_CATALOG[classTsid];
  const label = item?.label || String(classTsid).replace(/_/g, ' ');
  return `${qty} ${qty === 1 ? label : item?.namePlural || label}`;
}

function notePublishResult(result) {
  const outs = (result.outputs || []).map((o) => `${o.classTsid}x${o.qty}`).join('+');
  lastHarvest = [result.classTsid || '', result.verbId || '', result.ok ? 'ok' : result.reason || 'fail', outs].join(':');
}

function sfxFor(result) {
  if (result.jarFull) return 'COMPLETE_QUEST_REQUIREMENT';
  if (result.classTsid === 'paper_tree') return result.verbId === 'pet' ? 'PET_TRANT' : result.verbId === 'water' ? 'WATERING_CAN' : 'PAPER_TREE';
  if (result.classTsid === 'dust_trap') return 'DUST_TRAP_SMACK_DOWN';
  if (result.classTsid === 'npc_sloth') return result.verbId === 'knock' ? 'SLOTH_KNOCKER' : 'SLOTH_EAT';
  if (result.classTsid === 'npc_salmon') return 'SALMON_CATCH';
  if (result.classTsid === 'npc_firefly') return 'BUTTERFLY_SING';
  return { scrape: 'SCRAPER', scoop: 'SCOOPED_JELLISAC', dig: 'SHOVEL', harvest: 'HOE' }[result.verbId] || 'ITEM_PICKUP';
}

function applyResult(engine, entity, result) {
  notePublishResult(result);
  if (!result.ok) {
    engine.toast(result.message, 2400);
    publish(engine);
    return;
  }
  const anchorX = entity.view?.sprite?.x ?? entity.x;
  const anchorY = (entity.view?.sprite?.y ?? entity.y) - 60;
  for (const line of result.msgs || []) engine.pushActivity(line);
  let lift = 0;
  const merged = new Map();
  for (const out of result.outputs || []) merged.set(out.classTsid, (merged.get(out.classTsid) || 0) + out.qty);
  for (const [classTsid, qty] of merged) {
    engine.floatText(anchorX, anchorY - lift, `+${itemLabel(classTsid, qty)}`, 0xfff4d6);
    lift += 18;
  }
  if (result.costs?.xp) engine.floatText(anchorX, anchorY - lift, `+${result.costs.xp} iMG`, 0xd7b8ff);
  for (const counter of result.achievementCounters || []) engine.achievement(counter.counter, counter.amount);
  // Skill-package rare drops (scraping, jellisac, peat, paper tree): features/drops-feature.js.
  rollResourceNodeDrop(engine, result);
  engine.playSound(sfxFor(result), { volume: 0.6, jitter: 0.05 });

  if (entity.classTsid === 'npc_firefly') {
    jar = normalizeFireflyJarState(result.jar || jar);
    (result.captured || []).forEach((node, index) => {
      const owner = entities.find((other) => other.node === node);
      if (owner?.view) {
        flyToPlayer(engine, { x: owner.view.sprite.x, y: owner.view.sprite.y - 32 }, index * 140);
        dropTarget(engine, owner);
      }
    });
    showJar(engine, jar.flies);
  } else if (entity.classTsid === 'npc_sloth' && result.verbId === 'feed') {
    const view = entity.view;
    if (view) {
      const now = Date.now();
      const spits = Math.min(5, result.outputs?.[0]?.qty || 1);
      const span = Math.max(600, (result.durationMs || 3000) - 1500);
      view.spits = Array.from({ length: spits }, (_, i) => now + 900 + (span * i) / spits);
    }
    if ((result.achievementCounters || []).some((c) => c.counter === 'sloth:fed_until_full')) {
      engine.toast('Metal forever!', 2000);
    }
  }
  refreshEntity(engine, entity);
  engine.refreshPack();
  engine.save();
  publish(engine);
}

function performVerb(engine, entity, verbId) {
  if (entity.classTsid === 'npc_firefly' && verbId === 'open') grantWhistle(engine);
  const result = harvestResourceNode(entity.node, engine.inv, engine.pc, verbContext(engine, entity, verbId));
  applyResult(engine, entity, result);
  return result;
}

// ---------------------------------------------------------------------------
// Street lifecycle
// ---------------------------------------------------------------------------

function demoPlacement(engine, classTsid) {
  const player = engine.player;
  const side = player.x > engine.worldW - 260 ? -1 : 1;
  const offset = { npc_sloth: 120, paper_tree: 150, dirt_pile: 140, peat_1: 150, dust_trap: 90 }[classTsid] || 95;
  const x = player.x + side * offset;
  return { x, y: surfaceNear(engine.platforms, x, player.y) };
}

function setupDemo(engine, plan) {
  if (demoUsed) return plan;
  const kitInfo = resourceDemoKit(engine.param('resdemo'));
  if (!kitInfo) return plan;
  demoUsed = true;
  for (const [classTsid, qty] of Object.entries(kitInfo.items)) {
    engine.inv[classTsid] = Math.max(qty, engine.inv[classTsid] || 0);
  }
  if (engine.pc.energy < 60) engine.pc.energy = 60;
  const at = demoPlacement(engine, kitInfo.classTsid);
  const extra = [{ key: `demo:${kitInfo.classTsid}`, classTsid: kitInfo.classTsid, x: at.x, y: at.y, demo: true }];
  if (kitInfo.classTsid === 'npc_firefly') {
    // A small swarm, so one whistle shows several Fireflies streaming in.
    extra.push({ key: 'demo:npc_firefly:2', classTsid: 'npc_firefly', x: at.x + 70, y: at.y, demo: true });
    extra.push({ key: 'demo:npc_firefly:3', classTsid: 'npc_firefly', x: at.x - 40, y: at.y, demo: true });
  }
  engine.refreshPack();
  return [...plan, ...extra];
}

function scheduleAutoplay(engine) {
  if (!demoEntity || engine.param('resautoplay') !== '1') return;
  clearTimeout(autoplayTimer);
  const verb = resourceDemoKit(demoEntity.classTsid).verb;
  autoplayTimer = setTimeout(() => {
    if (!entities.includes(demoEntity)) return;
    if (demoEntity.classTsid === 'dust_trap') {
      triggerTrap(engine, demoEntity);
      return;
    }
    performVerb(engine, demoEntity, verb);
    if (demoEntity.classTsid === 'npc_sloth') {
      autoplayTimer = setTimeout(() => {
        if (entities.includes(demoEntity)) performVerb(engine, demoEntity, 'feed');
      }, 900);
    }
  }, 1200);
}

async function spawnStreet(engine, items, myGeneration) {
  const needs = new Map();
  for (const item of items) for (const def of sheetsNeeded(item.node)) needs.set(def.path, def);
  const fireflies = items.some((item) => item.classTsid === 'npc_firefly');
  await Promise.all([
    ...[...needs.values()].map((def) => ensureSheet(engine, def)),
    fireflies || items.some((item) => item.classTsid === 'npc_sloth') ? ensureSvgTextures(engine) : null,
  ]);
  if (myGeneration !== generation) return;
  const now = Date.now();
  for (const item of items) {
    tickResourceNode(item.node, now);
    const entity = { ...item, target: null, view: null };
    entities.push(entity);
    if (item.demo && !demoEntity) demoEntity = entity;
    spawnView(engine, entity);
  }
  publish(engine);
  scheduleAutoplay(engine);
}

function triggerTrap(engine, entity) {
  const result = harvestResourceNode(entity.node, engine.inv, engine.pc, {
    verbId: 'trigger',
    now: Date.now(),
  });
  if (result.ok && result.baqalaSeconds) {
    engine.floatText(entity.x, entity.y - 120, `+${result.baqalaSeconds}s`, 0xbfe6ff);
  }
  applyResult(engine, entity, result);
}

function checkTraps(engine) {
  const player = engine.player;
  if (!player) return;
  for (const entity of entities) {
    if (entity.classTsid !== 'dust_trap' || entity.node.depleted || !entity.view) continue;
    // GSJS hitbox 25 x 200 above the trap's foot.
    if (Math.abs(player.x - entity.x) <= 18 && player.y <= entity.y + 10 && player.y >= entity.y - 200) {
      triggerTrap(engine, entity);
    }
  }
}

// ---------------------------------------------------------------------------
// Feature
// ---------------------------------------------------------------------------

export const resourceNodesFeature = {
  id: RESOURCE_FEATURE_ID,

  init(engine) {
    ensureResourceItems();
    migrateResourceStarterKit(engine.inv, kit);
    publish(engine);
  },

  save() {
    return { jar: { ...jar }, starterKit: kit.starterKit };
  },

  restore(slice, engine) {
    const normalized = normalizeResourceFeatureSlice(slice);
    jar = normalized.jar;
    kit.starterKit = normalized.starterKit;
    if (engine) migrateResourceStarterKit(engine.inv, kit);
  },

  placementGroups(population) {
    return resourcePlacementGroups(population);
  },

  onStreetEnter(street, engine) {
    generation += 1;
    const myGeneration = generation;
    const slot = engine.streetSlot(RESOURCE_FEATURE_ID);
    const planned = resourceSpawnPlan(engine.population, (key) => engine.placement(key));
    const items = prepareStreetResourceNodes(slot, planned, { tsid: engine.streetTsid, now: Date.now() });
    const all = setupDemo(engine, items).map((item) => (
      item.demo ? { ...item, node: createResourceNode(item.classTsid, { seed: item.key, now: Date.now() }) } : item
    ));
    publish(engine);
    if (all.length) spawnStreet(engine, all, myGeneration);
  },

  onStreetClear() {
    generation += 1;
    clearTimeout(autoplayTimer);
    clearEffects();
    entities = [];
    demoEntity = null;
  },

  onTick(dtMs, now, engine) {
    if (!entities.length && !effects.length) return;
    for (const entity of entities) {
      const view = entity.view;
      if (!view) continue;
      if (view.kind === 'firefly') placeFirefly(entity, dtMs);
      else if (view.kind === 'salmon') placeSalmon(entity, dtMs);
      else if (view.kind === 'sloth') placeSloth(engine, entity, dtMs, now);
      else if (view.kind === 'trap' && entity.node.depleted) refreshTrap(engine, entity);
    }
    tickEffects(dtMs);
    if (engine.started && !engine.transientInstance()) checkTraps(engine);
    if (now - lastTickAt < TICK_MS) return;
    lastTickAt = now;
    for (const entity of entities) {
      if (tickResourceNode(entity.node, now)) refreshEntity(engine, entity);
      else if (entity.target) entity.target.subtitle = resourceNodeStatusLabel(entity.node, now) || entity.target.subtitle;
    }
    if (demoEntity) publish(engine);
  },

  verbsFor(target, engine) {
    const entity = entities.find((row) => row.target === target);
    if (!entity) return [];
    const ctx = verbContext(engine, entity);
    return resourceNodeVerbs(entity.node, engine.inv, engine.pc, ctx).map((verb) => ({
      id: menuVerbId(verb.id),
      label: verb.label,
      enabled: verb.enabled,
      tooltip: entity.classTsid === 'npc_firefly' && !whistleUnlocked(engine)
        ? `${verbTooltip(verb)}. Your first try teaches you Firefly Whistling.`
        : verbTooltip(verb),
      reason: verb.enabled ? '' : verb.message,
      durationMs: verb.enabled ? verb.durationMs : 0,
      energy: verb.costs?.energy || 0,
    }));
  },

  runVerb(target, verbId, engine) {
    const entity = entities.find((row) => row.target === target);
    if (!entity) return true;
    performVerb(engine, entity, rulesVerbId(verbId));
    return true;
  },

  /** QA / tests. */
  _state() {
    return { jar: { ...jar }, starterKit: kit.starterKit, entities: entities.length };
  },
};
