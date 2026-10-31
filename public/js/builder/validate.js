/**
 * LEVEL BUILDER (spec 7): the validator. One pure module (no DOM, no Pixi) with three callers:
 * the editor (a Web Worker, js/builder/validate-worker.js, 400 ms after the last edit), the CLI
 * and calibration (Node: tools/builder/validator-context.mjs loads the data), and later the
 * builder worker behind the API.
 *
 *   validateZone(zone, ctx) -> { ok, counts, findings, reach: { <streetKey>: reachStreet(...) }, limits, ms }
 *   validateShippedStreet(street, arrivals, ctx) -> the reach rules (PHY-*) for a shipped street (calibration)
 *
 * Finding (spec 7.2): { rule, severity, street, at, message, where: {x, y, space}, data, fix,
 * fingerprint, waived? }. Severities: fatal blocks play-test, render and publish; error blocks
 * publish; warn blocks publish until acknowledged; info blocks nothing. A waiver (zone.waivers)
 * accepts one rule at one place with the same geometry fingerprint; fatal findings and AST-004 are
 * never waived.
 *
 * ctx (every field optional; a rule whose data is missing is skipped, never guessed):
 *   schema       zone.schema.json, for SCH-001
 *   index        { tsid: { label, hubId, hubName } } (the street index's rows)
 *   library      Set of library sprite names (assets/decos/manifest.json)
 *   catalog      Map name -> deco-catalog row (size2, hires, sharp)
 *   twins        { name: art } (street-render.js DECO_TWINS)
 *   animated     Set of sprites with a frame strip (deco-anim-list.js)
 *   sharp        Set of sprites with a sharp copy (deco-sharp-list.js)
 *   streetFor    (tsid) -> shipped street JSON or null (for NAV-002 on shipped targets)
 *   assetFiles   Map name -> { sha256 } of stored new art (AST-003)
 *   publish      true for the publish gate (NAV-004)
 *   rules        a list of rule ids or prefixes ("PHY-") to run; default all
 *   profiles     assets/content/style-profiles.json, for the STY rules (P5's js/builder/style-rules.js)
 */
import { compileSchema } from './schema-check.js?v=cc9d1af4';
import { reachStreet, REACH_LIMITS, TIGHT_MARGIN, LANDING_TRIES, AIR_JUMP_TRIES, LANDING_SHARE, streetBuff } from './reach-graph.js?v=0eb97168';
import { platformsScreen, barriersScreen, isStandable, isSolidFromBelow, isItemFloor, assertStreetGeometry, avatarHeadReach, platformYAt, worldToScreen, streetWidth, streetHeight } from '../street-model.js?v=23b926e5';
import { planStreetPlacements, populationForStreet } from '../street-ecology.js?v=7e30da8f';
import { JUMP_SPEED } from '../avatar-step.js?v=c04c7c76';
import { STY_RULES, styleFindings } from './style-rules.js?v=abf9bfae';
import { EFFECT_LIMITS, effectsCost, normaliseEmitter, rumbleShare, emitterAnchor } from '../street-effects.js?v=e427650f';
import { LICENCE_POLICY, provenanceProblems } from './new-art.js?v=29f0b13e';
import { postOffFloor, offFloorWords } from './posts.js?v=ebcf627c';

export const RULES = Object.freeze({
  'SCH-001': ['fatal', 'Zone does not fit the schema'],
  'STR-001': ['fatal', 'Duplicate id'],
  'STR-002': ['fatal', 'No middleground layer'],
  'STR-003': ['fatal', 'No floor'],
  'STR-004': ['error', 'Street smaller than the view'],
  'STR-005': ['warn', 'Parallax layer smaller than the view'],
  'STR-006': ['info', 'Healed geometry'],
  'STR-007': ['warn', 'Line steeper than 60 degrees'],
  'PHY-001': ['error', 'Arrival not on a floor'],
  'PHY-002': ['error', 'Arrival inside a wall or under a low ceiling'],
  'PHY-003': ['error', 'Signpost unreachable'],
  'PHY-004': ['error', 'Door unreachable'],
  'PHY-005': ['error', 'Trap: no way out'],
  'PHY-006': ['warn', 'Tight jump'],
  'PHY-007': ['info', 'Unreachable area'],
  'PHY-008': ['warn', 'Ladder with no deck'],
  'PHY-009': ['warn', 'Signpost off its floor'],
  'POP-001': ['warn', 'Population does not fit'],
  'POP-002': ['error', 'Nowhere to place things'],
  'NAV-001': ['fatal', 'Unknown destination'],
  'NAV-002': ['error', 'Arrival off the target\'s floor'],
  'NAV-003': ['warn', 'One-way road'],
  'NAV-004': ['error', 'Zone unreachable from the world'],
  'NAV-005': ['info', 'Arm label differs from street name'],
  'NAV-006': ['error', 'Hub map and streets disagree'],
  'AST-001': ['fatal', 'Missing art'],
  'AST-002': ['error', 'No provenance'],
  'AST-003': ['error', 'Wrong provenance'],
  'AST-004': ['error', 'Licence or provenance not allowed'],
  'AST-005': ['warn', 'Drawn too large'],
  'AST-006': ['warn', 'Not animated'],
  'TXT-001': ['error', 'Words not allowed'],
  'TXT-002': ['error', 'Name taken'],
  'PRF-001': ['warn', 'Too heavy'],
  // Zone ambient effects (js/street-effects.js, spec 15 Q12).
  'FX-001': ['error', 'Effect on a missing layer'],
  'FX-002': ['warn', 'Effect off its layer'],
  'FX-003': ['warn', 'Rumble too often or too strong'],
  'FX-004': ['info', 'Burst trimmed to its period'],
  // P5's style rules (js/builder/style-rules.js), run here with the rest.
  ...Object.fromEntries(STY_RULES.map((r) => [r.id, [r.severity, r.title]])),
});

/** Spec 12. */
export const LIMITS = Object.freeze({
  streets: 40, width: 8000, height: 6000, layers: 24, decos: 1500, platforms: 600,
  connects: 8, connectsWarn: 5, zoneBytes: 4 * 1024 * 1024, textureWarn: 150 * 1024 * 1024, textureError: 192 * 1024 * 1024,
  emitters: EFFECT_LIMITS.emitters, particles: EFFECT_LIMITS.particles, overdraw: EFFECT_LIMITS.overdraw,
});
/** The 2012 view (world-zoom.js), the smallest a builder street may be. */
export const MIN_VIEW = Object.freeze({ w: 1000, h: 600 });
/** The game's wide view: a parallax layer narrower than this shows its edges. */
export const PARALLAX_VIEW = Object.freeze({ w: 960, h: 600 });
export const LICENCES = Object.freeze(Object.keys(LICENCE_POLICY.licences));
const UNWAIVABLE = new Set(['AST-004']);
const SEVERITY_ORDER = { fatal: 0, error: 1, warn: 2, info: 3 };

// —— Fingerprints ——

/** PURE: 64-bit FNV-1a of a string as 16 hex (two 32-bit lanes; sync, so the worker and Node agree). */
export function hash16(text) {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ ((c * 31) & 0xffff), 0x01000193) >>> 0;
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

/** PURE: the geometry a street's physics findings are computed from. */
export function geometrySignature(street) {
  return JSON.stringify([street.bounds, street.platforms, street.barriers || [], street.ladders || [], street.signposts || [], street.doors || [], street.physics || null]);
}

// —— Small helpers ——

const lc = (s) => String(s ?? '').toLowerCase();
const round = (n) => Math.round(Number(n) || 0);
const pt = (x, y, space = 'screen') => ({ x: round(x), y: round(y), space });

function aliases(tsid) {
  const out = [tsid];
  if (/^L/.test(tsid)) out.push(`G${tsid.slice(1)}`);
  if (/^G/.test(tsid)) out.push(`L${tsid.slice(1)}`);
  return out;
}

/** PURE: the index key a tsid names, after L/G aliasing, or null. */
export function resolveTsid(index, tsid) {
  if (!index || !tsid) return null;
  for (const a of aliases(String(tsid))) if (Object.prototype.hasOwnProperty.call(index, a)) return a;
  return null;
}

/** PURE: the placement requests game.js makes for a street's population (startStreet). */
export function placementRequests(pop) {
  return [
    { key: 'player', count: 1, clearance: 190 },
    { key: 'trees', count: pop.treeClasses.length, clearance: 135 },
    { key: 'gardens', count: pop.gardens, clearance: 165 },
    { key: 'vendor', count: pop.vendor ? 1 : 0, clearance: 120 },
    { key: 'shrine', count: pop.shrine ? 1 : 0, clearance: 135 },
    { key: 'rocks', count: pop.rockClasses.length, clearance: 74 },
    { key: 'piggies', count: pop.piggies, clearance: 92 },
    { key: 'chickens', count: pop.chickens, clearance: 86 },
    { key: 'butterflies', count: pop.butterflies, clearance: 62 },
    { key: 'flyingButterflies', count: pop.flyingButterflies, clearance: 58 },
    { key: 'apples', count: pop.apples, clearance: 30 },
    { key: 'musicblocks', count: pop.musicblocks, clearance: 45 },
    { key: 'quoins', count: pop.quoins, clearance: 28 },
  ];
}

/** PURE: the words a text breaks (TXT-001): "glitch" in any case, or an em dash. */
export function badWords(text) {
  const out = [];
  if (/glitch/i.test(String(text || ''))) out.push('glitch');
  if (/\u2014/.test(String(text || ''))) out.push('em dash');
  return out;
}

/**
 * PURE: the ops that heal a street's lines (STR-006, LocationPhysicsHealer): every line left to
 * right, its ends inside the bounds. The editor applies them; the validator only reports.
 */
export function healOps(key, street) {
  const ops = [];
  const { l, r, t, b } = street.bounds;
  for (const p of street.platforms || []) {
    let { x1, y1, x2, y2 } = p;
    if (x1 > x2) [x1, y1, x2, y2] = [x2, y2, x1, y1];
    const clip = (x, y, ox, oy) => {
      const nx = Math.max(l, Math.min(r, x));
      const ny = nx === x || ox === x ? y : oy + ((y - oy) * (nx - ox)) / (x - ox);
      return [nx, Math.max(t, Math.min(b, ny))];
    };
    [x1, y1] = clip(x1, y1, x2, y2);
    [x2, y2] = clip(x2, y2, x1, y1);
    const set = {};
    for (const [k, v] of Object.entries({ x1: round(x1), y1: round(y1), x2: round(x2), y2: round(y2) })) if (p[k] !== v) set[k] = v;
    if (Object.keys(set).length) ops.push({ op: 'platform.set', street: key, id: p.id, set });
  }
  return ops;
}

/** PURE: a plain jump's apex with these multipliers, stepped as the game steps it (105 px at normal). */
export function plainApex(buff = {}) {
  let vy = JUMP_SPEED * (buff.jump ?? 1);
  let y = 0;
  let top = 0;
  for (let i = 0; i < 1000 && vy < 0; i += 1) {
    vy += 0.42 * (buff.gravity ?? 1);
    y += vy;
    top = Math.min(top, y);
  }
  return -top;
}

// —— Arrivals ——

/**
 * PURE: every arrival on each zone street (screen space of that street): connects from the zone's
 * other streets and from edits[], plus editor.spawn. Returns Map key -> [{x, y, from}].
 */
export function zoneArrivals(zone) {
  const byTsid = new Map((zone.streets || []).map((s) => [s.street?.tsid, s.key]));
  const rowOf = new Map((zone.streets || []).map((s) => [s.key, s.street]));
  const out = new Map((zone.streets || []).map((s) => [s.key, []]));
  // The post on the target street where an arm lands: at the arrival's x, leading back (arriveFor).
  const postAt = (key, x, fromTsid) => {
    const t = rowOf.get(key);
    if (!t?.bounds) return null;
    return (t.signposts || []).find((p) => Math.abs(p.x - t.bounds.l - x) <= 2 && (p.connects || []).some((c) => c.tsid === fromTsid))?.id || null;
  };
  for (const s of zone.streets || []) {
    for (const post of s.street?.signposts || []) {
      for (const c of post.connects || []) {
        const key = byTsid.get(c.tsid);
        if (key && c.arrive && !c.hidden) out.get(key).push({ x: c.arrive.x, y: c.arrive.y, from: `${s.key}/${post.id}`, post: postAt(key, c.arrive.x, s.street.tsid) });
      }
    }
    const sp = s.editor?.spawn;
    if (sp && Number.isFinite(sp.x) && Number.isFinite(sp.y)) out.get(s.key).push({ x: sp.x, y: sp.y, from: 'spawn' });
  }
  for (const e of zone.edits || []) {
    const c = e.connect || e.newSignpost?.connects?.[0];
    const key = c && byTsid.get(c.tsid);
    if (key && c.arrive) out.get(key).push({ x: c.arrive.x, y: c.arrive.y, from: `world:${e.tsid}`, post: postAt(key, c.arrive.x, e.tsid) });
  }
  return out;
}

/** PURE: stand-in arrivals for a street nothing leads to yet: the floor at each signpost. */
function fallbackArrivals(street) {
  const lines = platformsScreen(street);
  const out = [];
  for (const s of street.signposts || []) {
    const p = worldToScreen(street, s.x, s.y);
    let best = null;
    for (const q of lines) {
      if (!isStandable(q)) continue;
      const y = platformYAt(q, p.x, 4);
      if (y == null || y < p.y - 40) continue;
      if (!best || y < best) best = y;
    }
    if (best != null) out.push({ x: p.x, y: best, from: `post:${s.id}`, fallback: true });
  }
  return out;
}

// —— The reach rules for one street ——

/**
 * PURE: the PHY rules for one street from its arrivals. `key` names the street in `at`; `buff`
 * defaults to the street's own physics. Returns { findings, reach }.
 */
export function reachFindings(key, street, arrivals, { want = () => true, reach = null, buff = null, zoneStreet = false } = {}) {
  const findings = [];
  const sig = geometrySignature(street);
  const add = (rule, at, message, where, data, fix) => {
    if (!want(rule)) return;
    findings.push({ rule, severity: RULES[rule][0], street: key, at: `${key}/${at}`, message, where, data, fix, fingerprint: hash16(`${rule}|${key}/${at}|${sig}`) });
  };
  const lines = platformsScreen(street);
  const barriers = barriersScreen(street);
  const head = avatarHeadReach(streetBuff(street).scale);
  const named = new Set();
  // PHY-001, PHY-002: each arrival stands on a floor, clear of walls and low ceilings.
  arrivals.forEach((a, i) => {
    if (a.fallback) return;
    const at = a.from === 'spawn' ? 'spawn' : `arrival:${i + 1}`;
    const floorBelow = lines.some((p) => {
      if (!isStandable(p)) return false;
      const y = platformYAt(p, a.x, 4);
      return y != null && y - a.y >= -2 && y - a.y <= 12;
    });
    if (!floorBelow) {
      // P7: the arm lands at a post here; when the post is the problem, the finding names it.
      const post = a.post ? (street.signposts || []).find((p) => p.id === a.post) : null;
      const off = post ? postOffFloor(street, post) : null;
      if (post && off) {
        named.add(post.id);
        add('PHY-001', post.id, `${offFloorWords(post, off)} The arm from ${a.from} lands there, at ${round(a.x)}, ${round(a.y)}, with no floor within 12 px under it.`, pt(a.x, a.y), { from: a.from, post: post.id, gap: off.gap, floor: off.floor?.line ?? null }, 'Stand the post on its floor and work the arrivals out again: cli.mjs arrivals --posts, or "Stand it on the floor" in the inspector.');
      } else if (post) {
        add('PHY-001', at, `The arm from ${a.from} still lands at ${round(a.x)}, ${round(a.y)}, where signpost ${post.id} stood; there is no floor within 12 px under it now.`, pt(a.x, a.y), { from: a.from, post: post.id }, 'Work the arrivals out again: cli.mjs arrivals, or "Work it out" on the arm.');
      } else {
        add('PHY-001', at, `The arrival at ${round(a.x)}, ${round(a.y)} (from ${a.from}) has no floor within 12 px under it.`, pt(a.x, a.y), { from: a.from }, 'Move the arrival onto a floor line, or draw a floor under it.');
      }
    }
    const wall = barriers.find((w) => Math.abs(w.x - a.x) <= 2 && Math.min(a.y, w.yBot) - Math.max(a.y - 80, w.yTop) > 0);
    const ceiling = lines.find((p) => {
      if (!isSolidFromBelow(p)) return false;
      const y = platformYAt(p, a.x, 0);
      return y != null && y < a.y && a.y - y < head.reach;
    });
    if (wall || ceiling) {
      add('PHY-002', at, wall
        ? `The arrival at ${round(a.x)}, ${round(a.y)} is inside wall ${wall.id}.`
        : `The arrival at ${round(a.x)}, ${round(a.y)} is under a ceiling ${round(a.y - platformYAt(ceiling, a.x, 0))} px over the feet (the head needs ${head.reach}).`,
      pt(a.x, a.y), { from: a.from, wall: wall?.id, ceiling: ceiling?.id }, 'Move the arrival clear of the wall or ceiling.');
    }
  });
  const r = reach || reachStreet(street, arrivals, buff ? { buff } : {});
  const real = arrivals.filter((a) => !a.fallback);
  const fromWords = (t) => {
    const i = t.reachedFrom.findIndex((x) => !x);
    const a = r.arrivals[i];
    return a ? `${round(a.x)}, ${round(a.y)}` : 'the arrival';
  };
  // PHY-003, PHY-004: every exit from every arrival.
  for (const t of r.targets) {
    const missed = t.reachedFrom.some((x) => !x);
    const rule = t.kind === 'door' ? 'PHY-004' : 'PHY-003';
    if (missed && r.arrivals.length) {
      const what = t.kind === 'door' ? `Door ${t.id}` : `Signpost ${t.id}`;
      const closest = t.closest ? { ...t.closest, jump: Math.round(plainApex(streetBuff(street).buff)) } : null;
      add(rule, t.id, `${what}${t.label ? ` (to ${t.label})` : ''} cannot be reached from the arrival at ${fromWords(t)}.`, pt(t.x, t.y), {
        from: r.arrivals.filter((a, i) => !t.reachedFrom[i]).map((a) => a.from),
        closest,
        fallback: real.length === 0,
      }, closest && closest.rise > 0
        ? `The nearest place you can stand is ${closest.rise} px under it. Lower its ledge to 100 px or less over a floor you can reach, or add a ladder.`
        : 'Add a floor, a ledge within a jump, or a ladder up to it.');
    } else if (t.reached && t.margin >= 0 && t.margin < 1) {
      // The route's tightest jump: too little height to spare, or (P7) a landing so near a ledge's
      // end that a keyboard player's takeoff, a few px early or late, misses it.
      const j = t.tight || {};
      const what = t.kind === 'door' ? `Door ${t.id}` : `Signpost ${t.id}`;
      const rise = Number.isFinite(j.rise) ? Math.round(j.rise * 10) / 10 : null;
      const share = Number.isFinite(j.share) ? j.share : null;
      const byHeight = rise != null && rise / TIGHT_MARGIN <= (share == null ? Infinity : share / LANDING_SHARE);
      const from = Number.isFinite(j.x) ? ` (the ${j.air ? 'walk-off and air jump' : `${j.run ? 'running ' : ''}jump`} from ${round(j.x)}, ${round(j.y)} to ${round(j.lx)}, ${round(j.ly)})` : '';
      const tries = j.air ? `of air jumps pressed up to 3 frames early or late, ${Math.round((share ?? 0) * AIR_JUMP_TRIES.length)} in ${AIR_JUMP_TRIES.length}` : `of takeoffs up to 12 px early or late, ${Math.round((share ?? 0) * LANDING_TRIES.length)} in ${LANDING_TRIES.length}`;
      add('PHY-006', t.id, byHeight
        ? `${what} needs a jump with only ${Math.round(rise)} px to spare${from}.`
        : `${what} needs a landing a keyboard player often misses${from}: ${tries} land on ${j.line || 'that ledge'}.`,
      pt(t.x, t.y), { margin: rise, landing: share == null ? null : Math.round(share * 100) / 100, kind: byHeight ? 'height' : 'landing', line: j.line ?? null, air: Boolean(j.air), from: Number.isFinite(j.x) ? { x: round(j.x), y: round(j.y) } : null, to: Number.isFinite(j.lx) ? { x: round(j.lx), y: round(j.ly) } : null, run: Boolean(j.run), dir: j.dir ?? 0 },
      byHeight ? 'Lower the ledge or close the gap by at least 8 px.' : 'Widen the ledge it lands on, or move it so the jump lands 15 px or more from its ends.');
    }
  }
  // PHY-005: places you can get to and never leave.
  for (const trap of r.traps) {
    add('PHY-005', trap.line, `Line ${trap.line} can be reached but no exit can be reached from it.`, pt(trap.x, trap.y), { points: trap.points }, 'Add a way back up (a ledge within a jump or a ladder), or a signpost there.');
  }
  // PHY-007: standable lines no arrival reaches (scenery is fine; listed).
  for (const u of r.unreached) {
    add('PHY-007', u.line, `Line ${u.line} cannot be reached from any arrival.`, pt((u.x1 + u.x2) / 2, (u.y1 + u.y2) / 2), {}, 'Fine for scenery. Otherwise give it a way up.');
  }
  // PHY-008: ladders with no floor at the foot or no deck at the top.
  for (const d of r.deckless) {
    add('PHY-008', d.id, `Ladder ${d.id} has ${!d.foot ? 'no floor at its foot' : 'no deck to step onto at its top'}.`, pt(d.x, d.foot ? d.yTop : d.yBot), { foot: d.foot, deck: d.deck }, d.foot ? 'Put a floor line within 48 px of the ladder\'s top.' : 'Stand the ladder on a floor line.');
  }
  // PHY-009 (P7): a signpost floating over its floor or sunk into it, as after its floor moved.
  // Zone streets only (shipped streets keep Tiny Speck's posts as they are).
  if (zoneStreet) {
    for (const post of street.signposts || []) {
      if (named.has(post.id)) continue;
      const off = postOffFloor(street, post);
      if (!off) continue;
      const foot = worldToScreen(street, post.x, post.y);
      add('PHY-009', post.id, offFloorWords(post, off), pt(foot.x, foot.y), { gap: off.gap, floor: off.floor?.line ?? null, why: off.why }, off.why === 'none' ? 'Move the post over a floor, or draw a floor under it.' : 'Stand it on the floor: cli.mjs arrivals --posts, or "Stand it on the floor" in the inspector (the arms landing there follow).');
    }
  }
  return { findings, reach: r };
}

// —— The whole zone ——

/** PURE: validate a zone. See the header for ctx. */
export function validateZone(zone, ctx = {}) {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const want = (rule) => !ctx.rules || ctx.rules.some((r) => rule === r || rule.startsWith(r));
  const findings = [];
  const reach = {};
  const add = (rule, streetKey, at, message, where = null, data = {}, fix = '', sig = '') => {
    if (!want(rule)) return;
    const full = streetKey ? `${streetKey}/${at}` : at;
    findings.push({ rule, severity: RULES[rule][0], street: streetKey || null, at: full, message, where, data, fix, fingerprint: hash16(`${rule}|${full}|${sig}`) });
  };
  const streets = Array.isArray(zone?.streets) ? zone.streets : [];

  // SCH-001.
  if (ctx.schema && want('SCH-001')) {
    const check = ctx.schemaCheck || compileSchema(ctx.schema);
    for (const e of check(zone).slice(0, 50)) {
      const key = /^\/streets\/(\d+)/.exec(e.path);
      add('SCH-001', key ? streets[Number(key[1])]?.key : null, e.path || '/', `${e.path || 'The zone'}: ${e.message}`, null, { path: e.path, keyword: e.keyword }, 'Fix the field the path names.');
    }
  }

  // PRF-001: the document and the zone.
  const bytes = JSON.stringify(zone).length;
  if (bytes > LIMITS.zoneBytes * 0.8) add('PRF-001', null, 'zone', `The zone is ${Math.round(bytes / 1024)} KB (the limit is ${LIMITS.zoneBytes / 1024} KB).`, null, { bytes }, 'Split it into two zones.');
  if (streets.length > LIMITS.streets) add('PRF-001', null, 'zone', `The zone has ${streets.length} streets (at most ${LIMITS.streets}).`, null, { streets: streets.length });

  const zoneTsids = new Map(streets.map((s) => [s.street?.tsid, s]));
  const arrivals = zoneArrivals(zone);
  const labelOf = (tsid) => zoneTsids.get(tsid)?.street?.label ?? ctx.index?.[resolveTsid(ctx.index, tsid)]?.label ?? null;
  // A published zone's own index rows (spec 11) are not "shipped" names it could clash with.
  const shippedLabels = ctx.shippedLabels || (ctx.index ? new Set(Object.entries(ctx.index).filter(([t, r]) => !zoneTsids.has(t) && !(zone?.id && r?.zone === zone.id)).map(([, r]) => lc(r.label))) : null);
  /** Whether a shipped street leads back to a zone street: its own arms, or a zone edit on it. */
  const leadsBack = (shipped, zoneTsid) => {
    const own = aliases(shipped);
    if ((zone.edits || []).some((e) => own.includes(e.tsid) && [e.connect, ...(e.newSignpost?.connects || [])].some((c) => c && c.tsid === zoneTsid && !c.hidden))) return true;
    const target = ctx.streetFor ? ctx.streetFor(shipped) : null;
    // Without the shipped street to look at, give it the benefit of the doubt.
    if (!ctx.streetFor) return true;
    return (target?.signposts || []).some((p) => (p.connects || []).some((c) => c.tsid === zoneTsid && !c.hidden));
  };

  for (const row of streets) {
    const key = row.key;
    const s = row.street;
    if (!s || typeof s !== 'object') continue;
    const sig = s.bounds && s.platforms ? geometrySignature(s) : '';
    const f = (rule, at, message, where, data, fix) => add(rule, key, at, message, where, data, fix, sig);

    // STR-001: ids unique per kind; layer ids unique; deco ids unique across the street.
    const dup = (kind, list) => {
      const seen = new Set();
      for (const item of list || []) {
        if (item?.id == null) continue;
        if (seen.has(item.id)) f('STR-001', item.id, `Two ${kind} share the id ${item.id}.`, null, { kind, id: item.id }, 'Give one of them a new id.');
        seen.add(item.id);
      }
    };
    dup('platforms', s.platforms);
    dup('walls', s.barriers);
    dup('ladders', s.ladders);
    dup('signposts', s.signposts);
    dup('effects', s.emitters);
    dup('doors', s.doors);
    dup('layers', s.layers);
    dup('decos', (s.layers || []).flatMap((l) => l.decos || []));
    // STR-002.
    const mids = (s.layers || []).filter((l) => l.id === 'middleground').length;
    if (mids !== 1) f('STR-002', 'layers', mids ? `The street has ${mids} middleground layers; it needs exactly one.` : 'The street has no middleground layer.', null, { count: mids }, 'Keep exactly one layer with the id middleground.');
    // STR-003.
    let geometryOk = true;
    try {
      assertStreetGeometry(s);
    } catch (err) {
      geometryOk = false;
      f('STR-003', 'platforms', `The street will not load: ${err.message}.`, null, {}, 'Add a floor line and at least one deco.');
    }
    if (geometryOk && !(s.platforms || []).some(isStandable)) {
      geometryOk = false;
      f('STR-003', 'platforms', 'The street has no line to stand on.', null, {}, 'Draw a floor line (Q).');
    }
    if (!s.bounds) continue;
    const W = streetWidth(s);
    const H = streetHeight(s);
    // STR-004, PRF-001 size.
    if (W < MIN_VIEW.w || H < MIN_VIEW.h) f('STR-004', 'bounds', `The street is ${W} by ${H}; the view is ${MIN_VIEW.w} by ${MIN_VIEW.h}.`, null, { w: W, h: H }, 'Make it at least 1000 wide and 600 tall.');
    if (W > LIMITS.width || H > LIMITS.height) f('PRF-001', 'bounds', `The street is ${W} by ${H} (at most ${LIMITS.width} by ${LIMITS.height}).`, null, { w: W, h: H });
    // STR-005.
    for (const l of s.layers || []) {
      if (l.id === 'middleground' || !(l.w > 0 && l.h > 0)) continue;
      if (l.w < PARALLAX_VIEW.w || l.h < PARALLAX_VIEW.h) f('STR-005', l.id, `Layer ${l.name || l.id} is ${l.w} by ${l.h}; its edges show in a ${PARALLAX_VIEW.w} by ${PARALLAX_VIEW.h} view.`, null, { w: l.w, h: l.h }, 'Make the layer at least 960 wide and 600 tall.');
    }
    // STR-006, STR-007.
    const heal = healOps(key, s);
    if (heal.length) f('STR-006', 'platforms', `${heal.length} line${heal.length === 1 ? '' : 's'} ran right to left or past the street's edge; the editor heals them.`, null, { ops: heal }, '');
    for (const p of s.platforms || []) {
      const dx = Math.abs(p.x2 - p.x1);
      const dy = Math.abs(p.y2 - p.y1);
      if (dy > 1.73 * dx) {
        const a = worldToScreen(s, (p.x1 + p.x2) / 2, (p.y1 + p.y2) / 2);
        f('STR-007', p.id, `Line ${p.id} is steeper than 60 degrees; the avatar walks it badly.`, pt(a.x, a.y), { dx, dy }, 'Use a wall for a vertical edge.');
      }
    }
    // PRF-001 counts.
    const decoCount = (s.layers || []).reduce((n, l) => n + (l.decos || []).length, 0);
    const counts = [['layers', (s.layers || []).length, LIMITS.layers], ['decos', decoCount, LIMITS.decos], ['platforms', (s.platforms || []).length, LIMITS.platforms]];
    for (const [what, n, max] of counts) {
      if (n > max) f('PRF-001', what, `${n} ${what} (at most ${max}).`, null, { n, max });
      else if (n > max * 0.8) add('PRF-001', key, what, `${n} ${what}, near the limit of ${max}.`, null, { n, max, warn: true }, '', sig);
    }
    // PRF-001 texture memory: each distinct sprite's 2x file, 4 bytes a pixel.
    if (ctx.catalog) {
      let tex = 0;
      const seen = new Set();
      for (const l of s.layers || []) for (const d of l.decos || []) {
        if (seen.has(d.sprite)) continue;
        seen.add(d.sprite);
        const size = ctx.catalog.get(d.sprite)?.size2;
        if (size) tex += size[0] * size[1] * 4;
      }
      if (tex > LIMITS.textureError) f('PRF-001', 'textures', `Its art needs about ${Math.round(tex / 1048576)} MB of texture memory (at most ${LIMITS.textureError / 1048576}).`, null, { bytes: tex });
      else if (tex > LIMITS.textureWarn) f('PRF-001', 'textures', `Its art needs about ${Math.round(tex / 1048576)} MB of texture memory (warn at ${LIMITS.textureWarn / 1048576}).`, null, { bytes: tex, warn: true });
    }
    // Connects per signpost.
    for (const p of s.signposts || []) {
      const n = (p.connects || []).length;
      if (n > LIMITS.connects) f('PRF-001', p.id, `Signpost ${p.id} has ${n} arms (at most ${LIMITS.connects}).`, null, { n });
      else if (n > LIMITS.connectsWarn) f('PRF-001', p.id, `Signpost ${p.id} has ${n} arms (more than ${LIMITS.connectsWarn} crowd the post).`, null, { n, warn: true });
    }

    // Zone ambient effects: FX-001..004, PRF-001 (emitters, live particles, overdraw).
    if (Array.isArray(s.emitters) && s.emitters.length) {
      const cost = effectsCost(s);
      for (const [what, n, max, words] of [['emitters', cost.emitters, LIMITS.emitters, 'effects'], ['particles', cost.particles, LIMITS.particles, 'particles alive at once'], ['overdraw', cost.overdraw, LIMITS.overdraw, 'screens of particle overdraw']]) {
        if (n > max) f('PRF-001', `effects/${what}`, `The street's effects make ${n} ${words} (at most ${max}).`, null, { n, max, cost }, 'Lower the rate or size of the busiest effects, or remove some.');
        else if (n > max * 0.8) f('PRF-001', `effects/${what}`, `The street's effects make ${n} ${words}, near the limit of ${max}.`, null, { n, max, cost, warn: true }, 'Lower the rate or size of the busiest effects.');
      }
      for (const e of s.emitters) {
        if (!e || typeof e !== 'object') continue;
        const n = normaliseEmitter(e);
        const layer = (s.layers || []).find((l) => l.id === n.layer);
        if (!layer) {
          f('FX-001', e.id, `Effect ${e.id} is on layer "${n.layer}", which this street does not have.`, null, { layer: n.layer }, `Put it on one of the street's layers: ${(s.layers || []).map((l) => l.id).join(', ')}.`);
          continue;
        }
        const a = emitterAnchor(s, n);
        const lw = n.layer === 'middleground' ? W : Number(layer.w) || W;
        const lh = n.layer === 'middleground' ? H : Number(layer.h) || H;
        if (a.x < 0 || a.x > lw || a.y < 0 || a.y > lh) f('FX-002', e.id, `Effect ${e.id} sits at ${n.x}, ${n.y}, outside its layer (${n.layer}, ${lw} by ${lh}), so nobody will see it.`, n.layer === 'middleground' ? pt(a.x, a.y) : null, { x: n.x, y: n.y }, 'Move it onto the layer.');
        if (Array.isArray(e.period) && Number(e.burst) > Math.min(...e.period.map(Number))) f('FX-004', e.id, `Effect ${e.id} bursts for ${e.burst} s but restarts every ${e.period.join(' to ')} s; the burst is trimmed to ${n.burst} s.`, null, { burst: e.burst, period: e.period }, 'Shorten the burst, or leave out the period to keep it going.');
      }
    }
    if (s.rumble && typeof s.rumble === 'object') {
      const share = rumbleShare(s.rumble);
      if (share > EFFECT_LIMITS.rumbleShare) f('FX-003', 'rumble', `The rumble shakes ${Math.round(share * 100)}% of the time (${s.rumble.duration} s every ${(s.rumble.every || []).join(' to ')} s); more than a third wears players out.`, null, { share }, 'Space the rumbles further apart, or make them shorter.');
      if (Number(s.rumble.strength) > EFFECT_LIMITS.rumbleStrong) f('FX-003', 'rumble', `The rumble shakes ${s.rumble.strength} px; over ${EFFECT_LIMITS.rumbleStrong} px is hard on some players.`, null, { strength: s.rumble.strength }, `Keep it at ${EFFECT_LIMITS.rumbleStrong} px or less.`);
    }

    // PHY-*.
    if (geometryOk && Object.keys(RULES).some((r) => r.startsWith('PHY-') && want(r))) {
      let arr = arrivals.get(key) || [];
      if (!arr.length) arr = fallbackArrivals(s);
      const r = reachFindings(key, s, arr, { want, zoneStreet: true });
      reach[key] = r.reach;
      findings.push(...r.findings);
    }

    // POP-001, POP-002.
    if (row.population && geometryOk) {
      const total = Object.values(row.population.counts || {}).reduce((n, v) => n + (Number(v) || 0), 0) + (row.population.quoins || 0);
      const lines = platformsScreen(s);
      if (total > 0 && !lines.some(isItemFloor)) {
        f('POP-002', 'population', 'The street has a population but no floor that holds items.', null, {}, 'Give a floor line item_perm -1 (Floor).');
      } else if (total > 0) {
        const pop = populationForStreet(s.tsid, { ...row.population, counts: row.population.counts || {} });
        const plan = planStreetPlacements(lines, placementRequests(pop), { worldW: W, seed: s.tsid });
        const short = placementRequests(pop).filter((q) => (plan.groups[q.key] || []).length < q.count).map((q) => ({ key: q.key, wanted: q.count, placed: (plan.groups[q.key] || []).length }));
        if (short.length) f('POP-001', 'population', `The planner could not place everything: ${short.map((x) => `${x.placed} of ${x.wanted} ${x.key}`).join(', ')}.`, null, { short }, 'Lengthen the floors, or ask for fewer.');
      }
    }

    // NAV-001, NAV-002, NAV-003, NAV-005; TXT-001 on arms.
    for (const post of s.signposts || []) {
      (post.connects || []).forEach((c, i) => {
        const at = `${post.id}/${i}`;
        const inZone = zoneTsids.get(c.tsid);
        const shipped = ctx.index ? resolveTsid(ctx.index, c.tsid) : null;
        if (!inZone && ctx.index && !shipped) {
          f('NAV-001', at, `Signpost ${post.id} leads to ${c.tsid}, which is neither a shipped street nor one of this zone's.`, null, { tsid: c.tsid }, 'Pick the destination from the street list.');
          return;
        }
        if (c.hidden) return;
        if (!c.arrive) {
          f('NAV-002', at, `Signpost ${post.id}'s arm to ${c.label} has no arrival point.`, null, { tsid: c.tsid }, 'Set where the arm lands on the target street.');
        } else if (!inZone && ctx.streetFor) {
          const target = ctx.streetFor(shipped);
          if (target && !platformsScreen(target).some((p) => {
            if (!isStandable(p)) return false;
            const y = platformYAt(p, c.arrive.x, 4);
            return y != null && y - c.arrive.y >= -2 && y - c.arrive.y <= 12;
          })) {
            f('NAV-002', at, `The arm to ${c.label} lands at ${c.arrive.x}, ${c.arrive.y}, off that street's floor.`, null, { tsid: c.tsid, arrive: c.arrive }, 'Move the arrival onto a floor of the target street.');
          }
        }
        if (inZone && !(inZone.street.signposts || []).some((p) => (p.connects || []).some((x) => x.tsid === s.tsid && !x.hidden))) {
          f('NAV-003', at, `${s.label} leads to ${inZone.street.label}, but no signpost there leads back.`, null, { to: inZone.key }, 'Add an arm back on the other street.');
        }
        // P3: a road out to a shipped street needs a way back in: the shipped street's own arm
        // (a fork's) or an edits[] connect from it (spec 4, 11).
        if (!inZone && shipped && !leadsBack(shipped, s.tsid)) {
          f('NAV-003', at, `${s.label} leads to ${labelOf(c.tsid) || c.tsid}, but nothing there leads back.`, null, { to: shipped }, `Open ${labelOf(c.tsid) || 'that street'}, pick a signpost and add a way into this draft.`);
        }
        const target = labelOf(c.tsid);
        if (target != null && c.label !== target) f('NAV-005', at, `The arm reads "${c.label}"; the street is called "${target}".`, null, { label: c.label, street: target }, '');
        const bad = badWords(c.label);
        if (bad.length) f('TXT-001', at, `The arm "${c.label}" uses ${bad.join(' and ')}.`, null, { words: bad }, 'Reword it.');
      });
    }

    // TXT-001, TXT-002 on the street's own words.
    for (const [what, text] of [['label', s.label], ['hubName', s.hubName]]) {
      const bad = badWords(text);
      if (bad.length) f('TXT-001', what, `The street's ${what === 'label' ? 'name' : 'hub name'} "${text}" uses ${bad.join(' and ')}.`, null, { words: bad }, 'Reword it.');
    }
    for (const l of s.layers || []) for (const d of l.decos || []) {
      const bad = badWords(d.signText);
      if (bad.length) f('TXT-001', d.id, `Sign ${d.id} says "${d.signText}", which uses ${bad.join(' and ')}.`, null, { words: bad }, 'Reword it.');
    }
    if (shippedLabels && shippedLabels.has(lc(s.label))) f('TXT-002', 'label', `A shipped street is already called "${s.label}".`, null, { label: s.label }, 'Pick another name, so /tp and the map stay clear.');

    // AST-001, AST-005, AST-006.
    for (const l of s.layers || []) for (const d of l.decos || []) {
      const art = ctx.twins?.[d.sprite] || d.sprite;
      const inLibrary = ctx.library ? ctx.library.has(d.sprite) || ctx.library.has(art) : true;
      if (ctx.library && !inLibrary && !zone.assets?.[d.sprite]) {
        f('AST-001', d.id, `Deco ${d.id} uses ${d.sprite}, which is neither in the library nor in this zone's art.`, null, { sprite: d.sprite }, 'Pick a library deco, or add the art through intake.');
      }
      const row = ctx.catalog?.get(art);
      if (row?.size2 && !(ctx.sharp?.has(art) || row.sharp)) {
        const k = row.hires ? 1.5 : 1;
        const over = Math.max((Number(d.w) || 0) / (row.size2[0] * k), (Number(d.h) || 0) / (row.size2[1] * k));
        if (over > 1.05) f('AST-005', d.id, `Deco ${d.id} (${d.sprite}) is drawn at ${round(d.w)} by ${round(d.h)}, larger than its art (${Math.round(row.size2[0] * k)} by ${Math.round(row.size2[1] * k)}); it will look soft.`, null, { scale: Math.round(over * 100) / 100 }, 'Draw it smaller, or use a larger deco.');
      }
      if (d.animated && ctx.animated && !ctx.animated.has(art)) f('AST-006', d.id, `Deco ${d.id} is marked animated, but ${d.sprite} has no frames.`, null, { sprite: d.sprite }, 'Clear its animated box.');
    }
    for (const e of s.emitters || []) {
      if (typeof e?.sprite !== 'string' || !e.sprite || !ctx.library) continue;
      const art = ctx.twins?.[e.sprite] || e.sprite;
      if (!ctx.library.has(e.sprite) && !ctx.library.has(art) && !zone.assets?.[e.sprite]) {
        f('AST-001', e.id, `Effect ${e.id} uses ${e.sprite}, which is neither in the library nor in this zone's art.`, null, { sprite: e.sprite }, 'Pick a library deco, add the art through intake, or leave the sprite out for the built-in shape.');
      }
    }
  }

  // Assets: AST-002, AST-003, AST-004 (decos' sprites and effects' particle sprites).
  const used = new Set();
  for (const row of streets) for (const l of row.street?.layers || []) for (const d of l.decos || []) used.add(d.sprite);
  for (const row of streets) for (const e of row.street?.emitters || []) if (typeof e?.sprite === 'string' && e.sprite) used.add(e.sprite);
  for (const name of used) {
    const a = zone.assets?.[name];
    if (!a) {
      add('AST-002', null, `asset:${name}`, `${name} is used but has no provenance row.`, null, { sprite: name }, 'Fork or paste it again so the row is filled, or add it through intake.');
      continue;
    }
    if (a.origin === 'tinyspeck-cc0' && ctx.library && !ctx.library.has(name) && !ctx.library.has(ctx.twins?.[name])) {
      add('AST-003', null, `asset:${name}`, `${name} is marked as library art but is not in the library.`, null, { sprite: name });
    }
    if (a.origin === 'new' && ctx.assetFiles) {
      const file = ctx.assetFiles.get(name);
      // No file at hand is not a mismatch: say so (publish without --art gave every piece as "does not match").
      if (!file) add('AST-003', null, `asset:${name}`, `${name}'s file is not at hand, so its bytes cannot be checked against its provenance.`, null, { sprite: name, missing: true }, 'Give publish --art <folder> with the files intake kept (/builder-art/<sha256>).');
      else if (file.sha256 !== a.sha256) add('AST-003', null, `asset:${name}`, `${name}'s stored file does not match its provenance (sha256).`, null, { sprite: name });
    }
  }
  for (const [name, a] of Object.entries(zone.assets || {})) {
    // The licence policy (js/builder/new-art.js, tools/builder/licence-policy.json): CC0 1.0 only,
    // provenance complete, inputs CC0 or Austin's own.
    const why = provenanceProblems(name, a, { library: ctx.library || null }).map((p) => p.message.replace(/\.$/, ''));
    if (why.length) add('AST-004', null, `asset:${name}`, `${name}: ${why.join('; ')}.`, null, { why }, 'Complete the provenance (section 10 of the spec).');
  }

  // NAV-004 (publish only), NAV-006, TXT-001 on the hub.
  if (ctx.publish && streets.length) {
    const tsids = new Set(streets.map((s) => s.street?.tsid));
    const linked = (zone.edits || []).some((e) => tsids.has(e.connect?.tsid) || (e.newSignpost?.connects || []).some((c) => tsids.has(c.tsid)));
    if (!linked) add('NAV-004', null, 'zone', 'Nothing in the shipped world leads into this zone.', null, {}, 'Link a shipped street to one of the zone\'s streets (edits).');
  }
  // P3: the zone's edits (spec 4, 11), the ways in from shipped streets: each names a shipped
  // street (and an existing signpost on it), leads to one of this zone's streets, and lands on a
  // floor there. NAV-001, NAV-002, NAV-003, NAV-005 and TXT-001, as for the zone's own arms.
  (Array.isArray(zone.edits) ? zone.edits : []).forEach((e, i) => {
    const at = `edit/${i}`;
    const shipped = ctx.index ? resolveTsid(ctx.index, e?.tsid) : e?.tsid;
    const from = labelOf(e?.tsid) || e?.tsid;
    if (ctx.index && !shipped) {
      add('NAV-001', null, at, `Edit ${i} adds a way in from ${e?.tsid}, which is not a shipped street.`, null, { tsid: e?.tsid }, 'Pick the street from the list.');
      return;
    }
    const target = shipped && ctx.streetFor ? ctx.streetFor(shipped) : null;
    if (e?.op === 'add-connect' && target && !(target.signposts || []).some((p) => p.id === e.signpost)) {
      add('NAV-001', null, at, `Edit ${i} adds an arm to signpost ${e.signpost} on ${from}, which has no such signpost.`, null, { tsid: e.tsid, signpost: e.signpost }, 'Pick one of that street\'s signposts.');
    }
    const conns = e?.op === 'add-connect' ? [e.connect] : (e?.newSignpost?.connects || []);
    for (const c of conns) {
      if (!c) continue;
      const into = zoneTsids.get(c.tsid);
      if (!into) {
        add('NAV-001', null, at, `Edit ${i} on ${from} leads to ${c.tsid}, which is not one of this zone's streets.`, null, { tsid: c.tsid }, 'Lead it to one of the zone\'s streets.');
        continue;
      }
      if (c.hidden) continue;
      if (!c.arrive) {
        add('NAV-002', null, at, `The way in from ${from} to ${into.street.label} has no arrival point.`, null, { tsid: c.tsid }, 'Work out the arrival: a signpost on the zone street that leads back, standing on a floor.');
      } else if (into.street.bounds && !platformsScreen(into.street).some((q) => {
        if (!isStandable(q)) return false;
        const y = platformYAt(q, c.arrive.x, 4);
        return y != null && y - c.arrive.y >= -2 && y - c.arrive.y <= 12;
      })) {
        add('NAV-002', null, at, `The way in from ${from} lands at ${c.arrive.x}, ${c.arrive.y} on ${into.street.label}, off its floor.`, null, { tsid: c.tsid, arrive: c.arrive }, 'Move the arrival onto a floor.');
      }
      if (shipped && !(into.street.signposts || []).some((p) => (p.connects || []).some((x) => aliases(shipped).includes(x.tsid) && !x.hidden))) {
        add('NAV-003', null, at, `${from} leads to ${into.street.label}, but no signpost there leads back.`, null, { to: into.key, from: shipped }, `Add an arm to ${from} on ${into.street.label}.`);
      }
      if (c.label !== into.street.label) add('NAV-005', null, at, `The arm on ${from} reads "${c.label}"; the street is called "${into.street.label}".`, null, { label: c.label, street: into.street.label }, '');
      const bad = badWords(c.label);
      if (bad.length) add('TXT-001', null, at, `The arm "${c.label}" on ${from} uses ${bad.join(' and ')}.`, null, { words: bad }, 'Reword it.');
    }
  });
  if (zone.hub?.isNew && zone.hub.map) {
    const mapped = new Set((zone.hub.map.streets || []).map((x) => x.tsid));
    const have = new Set(streets.map((s) => s.street?.tsid));
    const missing = [...have].filter((t) => !mapped.has(t));
    const extra = [...mapped].filter((t) => !have.has(t));
    if (missing.length || extra.length) add('NAV-006', null, 'hub', `The hub map ${missing.length ? `is missing ${missing.map(labelOf).join(', ')}` : ''}${missing.length && extra.length ? ' and ' : ''}${extra.length ? `lists streets not in the zone (${extra.join(', ')})` : ''}.`, null, { missing, extra }, 'Draw each of the zone\'s streets on the hub map, and only those.');
  }
  if (zone.hub) {
    const bad = badWords(zone.hub.name);
    if (bad.length) add('TXT-001', null, 'hub', `The hub name "${zone.hub.name}" uses ${bad.join(' and ')}.`, null, { words: bad }, 'Reword it.');
  }

  // STY-001..005 (spec 7.3, 9.2): P5's style rules, one draft street at a time.
  if (Object.keys(RULES).some((r) => r.startsWith('STY-') && want(r))) {
    for (const row of streets) {
      if (!row?.street || typeof row.street !== 'object') continue;
      for (const x of styleFindings(row, { profiles: ctx.profiles || null, catalog: ctx.catalog || null })) if (want(x.rule)) findings.push(x);
    }
  }

  return report(findings, zone.waivers || [], { reach, ms: (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0 });
}

/** PURE: waivers, counts and order. */
export function report(findings, waivers = [], extra = {}) {
  for (const x of findings) {
    if (x.severity === 'fatal' || UNWAIVABLE.has(x.rule)) continue;
    const w = waivers.find((v) => v.rule === x.rule && v.at === x.at && v.fingerprint === x.fingerprint);
    if (w) x.waived = { by: w.by, reason: w.reason };
  }
  findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.rule.localeCompare(b.rule) || String(a.at).localeCompare(String(b.at)));
  const counts = { fatal: 0, error: 0, warn: 0, info: 0 };
  for (const x of findings) if (!x.waived) counts[x.severity] += 1;
  return { ok: counts.fatal === 0 && counts.error === 0, counts, findings, limits: REACH_LIMITS, ...extra };
}

/**
 * PURE: the reach rules on a shipped street (calibration, spec 7.4), with the street's own
 * physics. `arrivals` are the shipped connects' arrive points on it. Returns { findings, reach }.
 */
export function validateShippedStreet(street, arrivals, { rules = null, buff = null } = {}) {
  const want = (rule) => !rules || rules.some((r) => rule === r || rule.startsWith(r));
  return reachFindings(street.tsid, street, arrivals, { want, buff });
}
