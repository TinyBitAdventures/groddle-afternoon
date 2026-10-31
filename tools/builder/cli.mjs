#!/usr/bin/env node
/**
 * LEVEL BUILDER: the agent's command line (spec 8.1, 8.2). It speaks the same ops as the editor
 * (public/js/builder/ops.js) and gets the same findings (validate.js), either on a draft on the site
 * (--draft <id>: the REST routes, signed with a builder key) or on a zone file (file:<path>: ops,
 * validate and render run here, with the real modules).
 *
 *   node tools/builder/cli.mjs <command> [args] [--json] [--draft <id> | file:<path>]
 *
 * The key and the site come from GRODDLE_BUILDER_URL and GRODDLE_BUILDER_KEY (<key id>.<secret>, as
 * the console's Builder tab shows it once), else from ~/.config/groddle/builder.env. The draft last
 * named (new, pull, --draft) is remembered in ~/.config/groddle/builder-state.json, so later commands
 * may leave --draft out. GRODDLE_BUILDER_HOME moves both (tests).
 *
 * Commands (spec 8.2): drafts; new; pull; push; street add | fork; place; set; rm; platform; wall;
 * ladder; signpost; connect; link-world; populate; hub map; ops; decos; style; guide; validate;
 * render; asset add; play; history; restore; publish (P6); sign. `cli.mjs help` lists them.
 *
 * Exit status: 0 done; 1 validate found an error or a fatal finding; 2 refused or wrong usage.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { GAME_DIR } from '../repos.mjs';
import { signKey, parseKey, parseEnv, configDir, canonicalQuery } from './sign.mjs';
import { catalog, searchDecos, styleProfile } from './catalog.mjs';
import { builderGuide } from './guide.mjs';
import { applyOps, applyOp, nextDecoId, nextGeometryId, findGeometry, findDeco, GEOMETRY, OpError } from '../../public/js/builder/ops.js?v=28c0d569';
import { forkStreet, forkOps, newTsid, libraryAsset } from '../../public/js/builder/zone.js?v=9608addf';
import { arriveFor, newConnect, POST_W, POST_H, LADDER_W } from '../../public/js/builder/geometry-handles.js?v=54aaffb7';
import { platformsScreen, isStandable } from '../../public/js/street-model.js?v=23b926e5';
import { DECO_TWINS } from '../../public/js/street-render.js?v=3bcef6a7';

export const PERM_WORDS = Object.freeze({ floor: -1, roof: 1, soft: 0, hard: null });
const BOOLEAN_FLAGS = new Set(['json', 'dry-run', 'write', 'help', 'all', 'flip', 'reach']);
const pub = (p) => join(GAME_DIR, 'public', p);
const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'));
const clone = (v) => JSON.parse(JSON.stringify(v));

export class CliError extends Error {
  constructor(message, { code = 'builder_cli', status = 0, data = null, exit = 2 } = {}) {
    super(message);
    this.code = code;
    this.status = status;
    this.data = data;
    this.exit = exit;
  }
}

// —— Arguments ——

/** PURE: argv into { positionals, flags }; file:<path> anywhere becomes flags.file. */
export function parseArgs(argv) {
  const positionals = [];
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '-m') {
      flags.m = argv[++i];
    } else if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      const name = eq > 0 ? a.slice(2, eq) : a.slice(2);
      if (eq > 0) flags[name] = a.slice(eq + 1);
      else if (BOOLEAN_FLAGS.has(name) || i + 1 >= argv.length || (argv[i + 1].startsWith('--') && !/^--?\d/.test(argv[i + 1]))) flags[name] = true;
      else flags[name] = argv[++i];
    } else if (a.startsWith('file:')) {
      flags.file = a.slice(5);
    } else {
      positionals.push(a);
    }
  }
  if (typeof flags.draft === 'string' && flags.draft.startsWith('file:')) {
    flags.file = flags.draft.slice(5);
    delete flags.draft;
  }
  return { positionals, flags };
}

/** PURE: "x,y" into numbers. */
export function point(text, name) {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(String(text ?? ''));
  if (!m) throw new CliError(`${name} is x,y (numbers).`);
  return { x: Number(m[1]), y: Number(m[2]) };
}

const num = (v, name, { optional = false } = {}) => {
  if (v === undefined || v === true) {
    if (optional) return undefined;
    throw new CliError(`--${name} needs a number.`);
  }
  const n = Number(v);
  if (!Number.isFinite(n)) throw new CliError(`--${name} needs a number, not "${v}".`);
  return n;
};

/** PURE: a key=value's value: JSON when it parses (numbers, true, null, objects), else the text. */
export function parseValue(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** PURE: a --perm word into pc_perm. */
export function permOf(word, fallback) {
  if (word === undefined) return fallback;
  if (!Object.prototype.hasOwnProperty.call(PERM_WORDS, String(word))) throw new CliError('--perm is floor, roof, soft or hard.');
  return PERM_WORDS[word];
}

// —— Settings ——

export function settings(env = process.env) {
  const dir = configDir(env);
  const file = join(dir, 'builder.env');
  const fromFile = existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {};
  const url = (env.GRODDLE_BUILDER_URL || fromFile.GRODDLE_BUILDER_URL || 'https://groddle.localhost').replace(/\/+$/, '');
  const key = parseKey(env.GRODDLE_BUILDER_KEY || fromFile.GRODDLE_BUILDER_KEY || '');
  return { dir, url, key, stateFile: join(dir, 'builder-state.json') };
}

function remember(cfg, draft) {
  try {
    mkdirSync(cfg.dir, { recursive: true });
    writeFileSync(cfg.stateFile, `${JSON.stringify({ draft })}\n`, { mode: 0o600 });
  } catch { /* nothing to remember */ }
}

function remembered(cfg, env = process.env) {
  if (env.GRODDLE_BUILDER_DRAFT) return env.GRODDLE_BUILDER_DRAFT;
  try {
    return readJson(cfg.stateFile).draft || null;
  } catch {
    return null;
  }
}

// —— The site ——

/** A signed REST client for the builder routes. */
export function createClient({ url, key, fetchImpl = globalThis.fetch }) {
  async function call(method, path, { query = null, body = undefined, headers = {}, raw = false } = {}) {
    if (!key) throw new CliError('No builder key. Make one in the console\'s Builder tab and put GRODDLE_BUILDER_KEY=<key> in ~/.config/groddle/builder.env.', { code: 'builder_no_key' });
    const route = `/groddle/v1/admin/builder${path}`;
    const text = body === undefined ? '' : JSON.stringify(body);
    const qs = query ? canonicalQuery(query) : '';
    const res = await fetchImpl(`${url}/wp-json${route}${qs ? `?${qs}` : ''}`, {
      method,
      headers: {
        'X-Groddle-Builder': signKey({ keyId: key.keyId, secret: key.secret, method, route, query: qs, body: text }),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...headers,
      },
      body: body === undefined ? undefined : text,
    }).catch((e) => {
      throw new CliError(`Could not reach ${url}: ${e.cause?.code || e.message}`, { code: 'builder_unreachable' });
    });
    if (raw && res.ok) return res;
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new CliError(data?.message || `${method} ${path} answered ${res.status}.`, { code: data?.code || `http_${res.status}`, status: res.status, data: data?.data || null });
    }
    return { data, res };
  }
  return { call };
}

// —— Targets: a draft on the site, or a zone file ——

/** A zone file: every write applies the ops here and writes the file with the rev one on. */
export function fileTarget(path) {
  const file = resolve(path);
  const load = () => {
    if (!existsSync(file)) throw new CliError(`No zone file at ${file}.`, { code: 'builder_not_found' });
    return readJson(file);
  };
  return {
    kind: 'file',
    id: file,
    async zone() {
      const zone = load();
      return { zone, rev: zone.rev || 1 };
    },
    async write(build, note = '') {
      const zone = load();
      const ops = build(clone(zone));
      let changed;
      try {
        changed = applyOps(zone, ops).changed;
      } catch (e) {
        throw new CliError(e.message, { code: 'builder_invalid', status: 422, data: { op: e.index, reason: e.code } });
      }
      zone.rev = (zone.rev || 1) + 1;
      writeFileSync(file, `${JSON.stringify(zone, null, 1)}\n`);
      void note;
      return { rev: zone.rev, changed, ops };
    },
  };
}

/** A draft on the site: reads with drafts:read, writes ops with If-Match (rebuilt and retried on a 409). */
export function draftTarget(client, id) {
  const enc = encodeURIComponent(id);
  return {
    kind: 'draft',
    id,
    async zone() {
      const { data, res } = await client.call('GET', `/drafts/${enc}`);
      return { zone: data, rev: Number(String(res.headers.get('etag') || data.rev).replace(/\D/g, '')) || data.rev };
    },
    async write(build, note = '') {
      for (let attempt = 0; ; attempt += 1) {
        const { zone, rev } = await this.zone();
        const ops = build(clone(zone));
        // The batch is tried here first, so a bad op is named before it is sent.
        try {
          applyOps(clone(zone), ops);
        } catch (e) {
          throw new CliError(e.message, { code: 'builder_invalid', status: 422, data: { op: e.index, reason: e.code } });
        }
        try {
          const { data } = await client.call('POST', `/drafts/${enc}/ops`, { body: { ops, note: note || 'cli' }, headers: { 'If-Match': `"${rev}"` } });
          return { rev: data.rev, changed: data.changed, ops };
        } catch (e) {
          if (e.code === 'builder_rev_conflict' && attempt < 3) continue;
          throw e;
        }
      }
    },
  };
}

// —— Zone helpers (pure) ——

export function streetOf(zone, key) {
  const row = (zone.streets || []).find((s) => s.key === key);
  if (!row) throw new CliError(`This zone has no street "${key}". Its streets: ${(zone.streets || []).map((s) => s.key).join(', ') || 'none'}.`, { code: 'builder_not_found' });
  return row;
}

/** PURE: the kind of thing an id names on a street: deco, a geometry kind, or layer. */
export function kindOf(street, id) {
  if (findDeco(street, id)[0]) return 'deco';
  for (const kind of Object.keys(GEOMETRY)) if (findGeometry(street, kind, id)[1] >= 0) return kind;
  if ((street.layers || []).some((l) => l.id === id)) return 'layer';
  return null;
}

/** PURE: the highest standable floor at world x (world y), or null. */
export function highestFloorAt(street, wx) {
  const sx = wx - street.bounds.l;
  let best = null;
  for (const p of platformsScreen(street)) {
    if (!isStandable(p)) continue;
    const lo = Math.min(p.x1, p.x2);
    const hi = Math.max(p.x1, p.x2);
    if (sx < lo || sx > hi) continue;
    const y = p.x2 === p.x1 ? Math.min(p.y1, p.y2) : p.y1 + ((sx - p.x1) / (p.x2 - p.x1)) * (p.y2 - p.y1);
    if (best === null || y < best) best = y;
  }
  return best === null ? null : Math.round(best + street.bounds.t);
}

/**
 * PURE: an ops file made ready to send (spec 8.7's ops file): deco.add ops without an id get the next
 * free ones, and a library sprite the zone has no provenance row for gets its asset.set first
 * (tinyspeck-cc0, from the catalog), as `place` does.
 */
export function prepareOps(zone, ops, rows = catalog()) {
  const taken = new Map();
  const byName = new Map(rows.map((d) => [d.name, d]));
  const rowed = new Set(Object.keys(zone.assets || {}));
  for (const op of ops) if (op?.op === 'asset.set' && op.name) rowed.add(op.name);
  const out = [];
  for (const op of ops) {
    if (op?.op !== 'deco.add' || !op.deco) {
      out.push(op);
      continue;
    }
    let next = op;
    if (!op.deco.id) {
      const row = (zone.streets || []).find((s) => s.key === op.street);
      if (row) {
        const t = taken.get(op.street) || new Set();
        const id = nextDecoId(row.street, t);
        t.add(id);
        taken.set(op.street, t);
        next = { ...op, deco: { id, ...op.deco } };
      }
    }
    const sprite = op.deco.sprite;
    const art = byName.get(sprite) || byName.get(DECO_TWINS[sprite]);
    if (typeof sprite === 'string' && !rowed.has(sprite) && art) {
      out.push({ op: 'asset.set', name: sprite, asset: libraryAsset(art) });
      rowed.add(sprite);
    }
    out.push(next);
  }
  return out;
}

/** PURE: the ops that place a library (or zone) deco, with its provenance row when the zone lacks one. */
export function placeOps(zone, { street: key, layer = 'middleground', sprite, x, y, w, h, z, r = 0, flip = false }, rows = catalog()) {
  const row = streetOf(zone, key);
  const lay = (row.street.layers || []).find((l) => l.id === layer);
  if (!lay) throw new CliError(`Street "${key}" has no layer "${layer}". Its layers: ${(row.street.layers || []).map((l) => l.id).join(', ')}.`, { code: 'builder_not_found' });
  const byName = new Map(rows.map((d) => [d.name, d]));
  const art = byName.get(sprite) || byName.get(DECO_TWINS[sprite]);
  if (!art && !zone.assets?.[sprite]) throw new CliError(`No deco "${sprite}" in the library or this zone's art. Try: cli.mjs decos ${sprite.split('_')[0]}`, { code: 'builder_not_found' });
  const decoW = w ?? art?.drawn?.w_med ?? Math.round((art?.size2?.[0] || 200) / 2);
  const decoH = h ?? art?.drawn?.h_med ?? Math.round((art?.size2?.[1] || 200) / 2);
  const zs = (lay.decos || []).map((d) => Number(d.z) || 0);
  const id = nextDecoId(row.street);
  const deco = { id, sprite, x: Math.round(x), y: Math.round(y), w: Math.round(decoW), h: Math.round(decoH), z: z ?? (zs.length ? Math.max(...zs) + 1 : 0), r };
  if (flip) deco.flip = true;
  const ops = [];
  if (!zone.assets?.[sprite] && art) ops.push({ op: 'asset.set', name: sprite, asset: libraryAsset(art) });
  ops.push({ op: 'deco.add', street: key, layer, deco });
  return { ops, id };
}

/**
 * PURE: two-way signposts between two of the zone's streets (spec 8.7 `connect`): a post at each
 * facing end (A's right end, B's left end) on the highest floor there, unless posts are named; the
 * arms carry the target's label and hub, and arrive where build-street-navigation.mjs would put them.
 */
export function connectOps(zone, a, b, { aPost = null, bPost = null } = {}) {
  const A = streetOf(zone, a);
  const B = streetOf(zone, b);
  if (A === B) throw new CliError('Connect two different streets.');
  const work = clone(zone);
  const posts = [];
  const place = (rowKey, other, end, named) => {
    const row = streetOf(work, rowKey);
    const s = row.street;
    const target = streetOf(work, other).street;
    const arm = newConnect({ tsid: target.tsid, label: target.label, hubId: target.hubId });
    if (named) {
      if (findGeometry(s, 'signpost', named)[1] < 0) throw new CliError(`Street "${rowKey}" has no signpost ${named}.`, { code: 'builder_not_found' });
      applyOp(work, { op: 'connect.add', street: rowKey, signpost: named, connect: arm });
      posts.push({ street: rowKey, id: named, existing: true });
      return;
    }
    const x = end === 'right' ? s.bounds.r - 150 : s.bounds.l + 150;
    const y = highestFloorAt(s, x);
    if (y === null) throw new CliError(`Street "${rowKey}" has no floor at x ${x} for a signpost.`, { code: 'builder_invalid' });
    const id = nextGeometryId(s, 'signpost');
    applyOp(work, { op: 'signpost.add', street: rowKey, signpost: { id, x, y, w: POST_W, h: POST_H, connects: [arm] } });
    posts.push({ street: rowKey, id, existing: false });
  };
  place(a, b, 'right', aPost);
  place(b, a, 'left', bPost);
  // Now each post links back, the arrivals can be worked out on the target.
  const ops = [];
  for (const p of posts) {
    const s = streetOf(work, p.street).street;
    const other = p.street === a ? b : a;
    const target = streetOf(work, other).street;
    const [list, i] = findGeometry(s, 'signpost', p.id);
    const arm = list[i].connects[list[i].connects.length - 1];
    const arrive = arriveFor(target, s.tsid);
    if (arrive) arm.arrive = arrive;
    if (p.existing) ops.push({ op: 'connect.add', street: p.street, signpost: p.id, connect: arm });
    else ops.push({ op: 'signpost.add', street: p.street, signpost: clone(list[i]) });
  }
  return { ops, posts: posts.map((p) => `${p.street}/${p.id}`) };
}

/** PURE: the ops for `set <street>[/<id>[/<arm>]] key=value ...`. */
export function setOps(zone, target, pairs) {
  const [key, id, arm] = String(target).split('/');
  const row = streetOf(zone, key);
  const set = {};
  const unset = [];
  for (const p of pairs) {
    const eq = p.indexOf('=');
    if (eq < 1) throw new CliError(`"${p}" is not key=value.`);
    const k = p.slice(0, eq);
    const v = p.slice(eq + 1);
    if (v === '') unset.push(k);
    else set[k] = parseValue(v);
  }
  const extra = unset.length ? { unset } : {};
  if (!id) return [{ op: 'street.set', street: key, set, ...extra }];
  if (arm !== undefined) return [{ op: 'connect.set', street: key, signpost: id, at: Number(arm), set, ...extra }];
  const kind = kindOf(row.street, id);
  if (!kind) throw new CliError(`Street "${key}" has nothing with the id ${id}.`, { code: 'builder_not_found' });
  if (kind === 'deco') return [{ op: 'deco.set', street: key, id, set, ...extra }];
  if (kind === 'layer') return [{ op: 'layer.set', street: key, layer: id, set, ...extra }];
  return [{ op: `${kind}.set`, street: key, id, set, ...extra }];
}

/** PURE: the ops for `rm <street>[/<id>[/<arm>]]`. */
export function rmOps(zone, target) {
  const [key, id, arm] = String(target).split('/');
  const row = streetOf(zone, key);
  if (!id) return [{ op: 'street.remove', street: key }];
  if (arm !== undefined) return [{ op: 'connect.remove', street: key, signpost: id, at: Number(arm) }];
  const kind = kindOf(row.street, id);
  if (!kind || kind === 'layer') throw new CliError(`Street "${key}" has no deco or geometry ${id}.`, { code: 'builder_not_found' });
  return [{ op: kind === 'deco' ? 'deco.remove' : `${kind}.remove`, street: key, id }];
}

/** PURE: a population.set op from class=count words (spec 8.2 populate). */
export function populateOps(zone, key, words, quoins) {
  streetOf(zone, key);
  const counts = {};
  for (const w of words) {
    const m = /^([a-z0-9_]+)=(\d+)$/.exec(w);
    if (!m) throw new CliError(`"${w}" is class=count (npc_piggy=2).`);
    counts[m[1]] = Number(m[2]);
  }
  const population = { counts };
  if (quoins !== undefined) population.quoins = quoins;
  return [{ op: 'population.set', street: key, population }];
}

/**
 * PURE: link a zone street to a shipped one (spec 8.2 link-world): an arm on the shipped street's
 * post (edits[], op add-connect) that lands on the zone street, and an arm back from the zone street
 * (a new post at its left end, unless --post names one there).
 */
export function linkWorldOps(zone, key, shipped, { post = null, back = null } = {}) {
  const row = streetOf(zone, key);
  const s = row.street;
  const posts = (shipped.signposts || []).filter((p) => !p.hidden);
  const on = post ? posts.find((p) => p.id === post) : posts.slice().sort((p, q) => (p.connects || []).length - (q.connects || []).length)[0];
  if (!on) throw new CliError(post ? `${shipped.label} has no signpost ${post}.` : `${shipped.label} has no signpost to add an arm to.`, { code: 'builder_not_found' });
  const work = clone(zone);
  const ops = [];
  const arm = newConnect({ tsid: shipped.tsid, label: shipped.label, hubId: shipped.hubId });
  let backId = back;
  if (backId) {
    ops.push({ op: 'connect.add', street: key, signpost: backId, connect: arm });
  } else {
    const x = s.bounds.l + 150;
    const y = highestFloorAt(s, x);
    if (y === null) throw new CliError(`Street "${key}" has no floor at x ${x} for a signpost.`, { code: 'builder_invalid' });
    backId = nextGeometryId(s, 'signpost');
    ops.push({ op: 'signpost.add', street: key, signpost: { id: backId, x, y, w: POST_W, h: POST_H, connects: [arm] } });
  }
  applyOps(work, ops);
  const arrive = arriveFor(streetOf(work, key).street, shipped.tsid);
  const into = newConnect({ tsid: s.tsid, label: s.label, hubId: s.hubId, arrive });
  // The arm back lands beside the shipped post the edit adds to.
  const shippedArrive = arriveFor({ ...shipped, signposts: (shipped.signposts || []).map((p) => (p.id === on.id ? { ...p, connects: [...(p.connects || []), into] } : p)) }, s.tsid);
  if (shippedArrive) {
    const last = ops[ops.length - 1];
    if (last.op === 'signpost.add') last.signpost.connects[0].arrive = shippedArrive;
    else last.connect.arrive = shippedArrive;
  }
  ops.push({ op: 'edit.add', edit: { tsid: shipped.tsid, op: 'add-connect', signpost: on.id, connect: into } });
  return { ops, post: `${key}/${backId}`, on: on.id };
}

/** PURE: a hubmap.set op with this street's line on the zone's hub map. */
export function hubMapOps(zone, key, line) {
  const s = streetOf(zone, key).street;
  const m = /^\s*(\d+(?:\.\d+)?),(\d+(?:\.\d+)?),(\d+(?:\.\d+)?),(\d+(?:\.\d+)?)\s*$/.exec(String(line || ''));
  if (!m) throw new CliError('--line is x1,y1,x2,y2 on the 760 x 460 map.');
  const map = clone(zone.hub?.map || { streets: [] });
  map.streets = (map.streets || []).filter((r) => r.tsid !== s.tsid);
  map.streets.push({ tsid: s.tsid, name: s.label, x1: Number(m[1]), y1: Number(m[2]), x2: Number(m[3]), y2: Number(m[4]) });
  return [{ op: 'hubmap.set', map }];
}

// —— Words ——

function findingLine(f) {
  return `${f.severity.padEnd(5)} ${f.rule} ${f.at}  ${f.message}${f.fix ? `\n        ${f.fix}` : ''}`;
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export const HELP = `Groddle level builder (docs/level-builder/spec.md 8.2)
  node tools/builder/cli.mjs <command> [args] [--json] [--draft <id> | file:<zone.json>]

  drafts                                      list drafts
  new <id> --title T (--hub 58 | --new-hub N)  start a zone
  pull <id> [--out f]   push <f> [-m note]    copy a draft to a file and back
  street add --key k --label L [--template meadow] [--width 3000 --height 1000]
  street fork <shipped tsid> --key k --label L
  place --street k --layer middleground --sprite bush_3 --x 300 --y -60 [--w --h --flip --z --r]
  set <street>[/<id>[/<arm>]] key=value ...   (key= removes)    rm <street>[/<id>[/<arm>]]
  platform --street k --from x,y --to x,y [--perm floor|roof|soft|hard]
  wall --street k --x --y --h [--perm]   ladder --street k --x --y --h [--w]   signpost --street k --x --y [--w --h]
  connect <streetA> <streetB> [--a-post id] [--b-post id]
  link-world <street> --from <shipped tsid> [--post id] [--back id]
  populate --street k npc_piggy=2 trant_fruit=1 [--quoins 6]
  hub map --street k --line x1,y1,x2,y2
  ops <file.json>                             apply a batch atomically
  decos <query> [--layer sky] [--hub 58] [--limit 20]    style [hub-58|default]    guide
  validate [--rule PHY-*]                     exit 1 on an error or fatal finding
  render --street k [--view full|camera] [--x --y --w --h] [--scale 0.25] [--overlay geometry,reach,findings,grid] [--layers a,b] --out f.png
  asset add <file> --name gz_x --licence own-work-CC0|ai-generated --author A [--tool --prompt --inputs a,b --role --file3 f]
  play [--street k]   history   restore <rev>   publish (local, phase P6)
  sign METHOD ROUTE [BODY] [--query a=1&b=2]  the X-Groddle-Builder value for a request`;

// —— Commands ——

/** Runs one command; returns { out (for --json), text (for people), exit }. */
export async function run(argv, { env = process.env, fetchImpl = globalThis.fetch, renderer = null } = {}) {
  const { positionals, flags } = parseArgs(argv);
  const [cmd, ...args] = positionals;
  const cfg = settings(env);
  const client = createClient({ url: cfg.url, key: cfg.key, fetchImpl });
  if (!cmd || cmd === 'help' || flags.help) return { out: { help: HELP }, text: HELP, exit: 0 };

  const draftId = () => {
    const id = typeof flags.draft === 'string' ? flags.draft : remembered(cfg, env);
    if (!id) throw new CliError('Name the draft: --draft <id> (or file:<zone.json>).');
    return id;
  };
  const target = () => {
    if (flags.file) return fileTarget(flags.file);
    const id = draftId();
    if (typeof flags.draft === 'string') remember(cfg, id);
    return draftTarget(client, id);
  };
  const local = () => Boolean(flags.file);
  const wrote = (r, extra = {}, words = '') => ({ out: { rev: r.rev, changed: r.changed, ...extra }, text: `rev ${r.rev}${words ? `  ${words}` : ''}${r.changed?.length ? `  changed ${r.changed.join(', ')}` : ''}`, exit: 0 });

  switch (cmd) {
    case 'drafts': {
      const { data } = await client.call('GET', '/drafts', { query: flags.all ? { all: '1' } : null });
      const list = data.drafts.map((d) => ({ id: d.id, title: d.title, rev: d.rev, state: d.state, streets: d.streets.map((s) => s.key), updatedAt: d.updatedAt }));
      return { out: list, text: list.map((d) => `${d.id.padEnd(24)} rev ${String(d.rev).padEnd(4)} ${d.state.padEnd(8)} ${d.title}  (${d.streets.join(', ') || 'no streets'})`).join('\n') || 'No drafts.', exit: 0 };
    }

    case 'new': {
      const id = args[0];
      if (!/^[a-z][a-z0-9-]{2,47}$/.test(id || '')) throw new CliError('new <id>: 3 to 48 lowercase letters, digits and hyphens, starting with a letter.');
      const title = typeof flags.title === 'string' ? flags.title : '';
      if (!title) throw new CliError('new needs --title.');
      let hub = null;
      if (flags.hub !== undefined) {
        const hubId = String(flags.hub).replace(/^hub-/, '');
        const index = readJson(pub('assets/streets/index.json')).streets;
        const row = Object.values(index).find((r) => String(r.hubId) === hubId);
        if (!row) throw new CliError(`No shipped street is in hub ${hubId}.`, { code: 'builder_not_found' });
        hub = { id: hubId, name: row.hubName };
      } else if (typeof flags['new-hub'] === 'string') {
        let used = new Set();
        if (!local()) {
          const { data } = await client.call('GET', '/drafts', { query: { all: '1' } });
          const zones = await Promise.all(data.drafts.map((d) => client.call('GET', `/drafts/${encodeURIComponent(d.id)}`).then((r) => r.data).catch(() => null)));
          used = new Set(zones.map((z) => z?.hub?.isNew && z.hub.id).filter(Boolean));
        }
        let n = 900;
        while (used.has(String(n)) && n < 999) n += 1;
        hub = { id: String(n), name: flags['new-hub'].slice(0, 40), isNew: true };
      }
      if (local()) {
        const zone = { format: 'groddle-zone/1', id, title, rev: 1, ...(hub ? { hub } : {}), streets: [], edits: [], assets: {} };
        writeFileSync(resolve(flags.file), `${JSON.stringify(zone, null, 1)}\n`);
        return { out: { id, rev: 1, hub, file: resolve(flags.file) }, text: `${id} rev 1 in ${flags.file}`, exit: 0 };
      }
      const { data } = await client.call('POST', '/drafts', { body: { id, title, ...(hub ? { hub } : {}) } });
      remember(cfg, id);
      return { out: { id: data.id, rev: data.rev, hub: data.hub || null }, text: `${data.id} rev ${data.rev}${data.hub ? `  hub ${data.hub.id} ${data.hub.name}` : ''}`, exit: 0 };
    }

    case 'pull': {
      const id = args[0] || draftId();
      const t = draftTarget(client, id);
      const { zone, rev } = await t.zone();
      const out = resolve(typeof flags.out === 'string' ? flags.out : `${id}.zone.json`);
      writeFileSync(out, `${JSON.stringify(zone, null, 1)}\n`);
      remember(cfg, id);
      return { out: { id, rev, file: out }, text: `${id} rev ${rev} -> ${out}`, exit: 0 };
    }

    case 'push': {
      const file = args[0];
      if (!file || !existsSync(file)) throw new CliError('push <zone.json>');
      const zone = readJson(file);
      const id = typeof flags.draft === 'string' ? flags.draft : zone.id;
      const { data } = await client.call('PUT', `/drafts/${encodeURIComponent(id)}`, { body: zone, headers: { 'If-Match': `"${zone.rev}"` } });
      zone.rev = data.rev;
      writeFileSync(file, `${JSON.stringify(zone, null, 1)}\n`);
      return { out: { id, rev: data.rev }, text: `${id} rev ${data.rev}`, exit: 0 };
    }

    case 'street': {
      const verb = args[0];
      const key = flags.key;
      const label = flags.label;
      if (typeof key !== 'string' || typeof label !== 'string') throw new CliError(`street ${verb || '<add|fork>'} needs --key and --label.`);
      const t = target();
      if (verb === 'fork') {
        const tsid = args[1];
        const file = pub(`assets/streets/${tsid}.json`);
        if (!/^[GL][A-Z0-9]+$/.test(tsid || '') || !existsSync(file)) throw new CliError(`street fork <shipped tsid>: no street ${tsid}.`, { code: 'builder_not_found' });
        const shipped = readJson(file);
        const rows = new Map(catalog().map((d) => [d.name, d]));
        const ecology = readJson(pub('assets/content/street-ecology.json')).streets;
        const fresh = newTsid();
        const r = await t.write((zone) => {
          const fork = forkStreet(shipped, { zoneId: zone.id, key, label, tsid: fresh, catalog: rows, twins: DECO_TWINS, ecologyRow: ecology[tsid] || null });
          return forkOps(zone, fork);
        }, `fork ${tsid}`);
        return wrote(r, { street: fresh }, `street ${key} ${fresh}`);
      }
      if (verb === 'add') {
        const tpl = await templates();
        const r = await t.write((zone) => tpl.streetAddOps(zone, { key, label, template: flags.template || 'meadow', width: num(flags.width, 'width', { optional: true }) ?? 3000, height: num(flags.height, 'height', { optional: true }) ?? 1000 }), `street add ${key}`);
        const added = r.ops.find((o) => o.op === 'street.add');
        return wrote(r, { street: added?.draftStreet?.street?.tsid, layers: added?.draftStreet?.street?.layers?.map((l) => l.id) }, `street ${key}`);
      }
      throw new CliError('street add | street fork');
    }

    case 'place': {
      const t = target();
      let id;
      const r = await t.write((zone) => {
        const p = placeOps(zone, {
          street: flags.street, layer: typeof flags.layer === 'string' ? flags.layer : 'middleground', sprite: flags.sprite,
          x: num(flags.x, 'x'), y: num(flags.y, 'y'), w: num(flags.w, 'w', { optional: true }), h: num(flags.h, 'h', { optional: true }),
          z: num(flags.z, 'z', { optional: true }), r: num(flags.r, 'r', { optional: true }) ?? 0, flip: flags.flip === true || flags.flip === 'true',
        });
        id = p.id;
        return p.ops;
      }, `place ${flags.sprite}`);
      return wrote(r, { id: `${flags.street}/${id}` }, `${flags.street}/${id}`);
    }

    case 'set': {
      if (!args[0] || args.length < 2) throw new CliError('set <street>[/<id>] key=value ...');
      return wrote(await target().write((zone) => setOps(zone, args[0], args.slice(1)), `set ${args[0]}`));
    }

    case 'rm': {
      if (!args[0]) throw new CliError('rm <street>[/<id>]');
      return wrote(await target().write((zone) => rmOps(zone, args[0]), `rm ${args[0]}`));
    }

    case 'platform': {
      const from = point(flags.from, '--from');
      const to = point(flags.to, '--to');
      const perm = permOf(flags.perm, -1);
      const [a, b] = from.x <= to.x ? [from, to] : [to, from];
      let id;
      const r = await target().write((zone) => {
        id = nextGeometryId(streetOf(zone, flags.street).street, 'platform');
        return [{ op: 'platform.add', street: flags.street, platform: { id, x1: a.x, y1: a.y, x2: b.x, y2: b.y, pc_perm: perm, item_perm: flags['item-perm'] !== undefined ? permOf(flags['item-perm']) : perm } }];
      }, 'platform');
      return wrote(r, { id: `${flags.street}/${id}` }, `${flags.street}/${id}`);
    }

    case 'wall':
    case 'ladder':
    case 'signpost': {
      const kind = cmd === 'wall' ? 'barrier' : cmd;
      let id;
      const r = await target().write((zone) => {
        const s = streetOf(zone, flags.street).street;
        id = nextGeometryId(s, kind);
        const x = num(flags.x, 'x');
        const y = num(flags.y, 'y');
        const item = kind === 'barrier' ? { id, x, y, h: num(flags.h, 'h'), pc_perm: permOf(flags.perm, null) }
          : kind === 'ladder' ? { id, x, y, w: num(flags.w, 'w', { optional: true }) ?? LADDER_W, h: num(flags.h, 'h') }
            : { id, x, y, w: num(flags.w, 'w', { optional: true }) ?? POST_W, h: num(flags.h, 'h', { optional: true }) ?? POST_H, connects: [] };
        return [{ op: `${kind}.add`, street: flags.street, [kind]: item }];
      }, cmd);
      return wrote(r, { id: `${flags.street}/${id}` }, `${flags.street}/${id}`);
    }

    case 'connect': {
      if (args.length < 2) throw new CliError('connect <streetA> <streetB>');
      let posts;
      const r = await target().write((zone) => {
        const c = connectOps(zone, args[0], args[1], { aPost: flags['a-post'] || null, bPost: flags['b-post'] || null });
        posts = c.posts;
        return c.ops;
      }, `connect ${args[0]} ${args[1]}`);
      return wrote(r, { posts }, posts.join(' and '));
    }

    case 'link-world': {
      const key = args[0];
      const tsid = flags.from;
      const file = pub(`assets/streets/${tsid}.json`);
      if (!key || !/^[GL][A-Z0-9]+$/.test(tsid || '') || !existsSync(file)) throw new CliError('link-world <street> --from <shipped tsid>');
      const shipped = readJson(file);
      let made;
      const r = await target().write((zone) => {
        made = linkWorldOps(zone, key, shipped, { post: flags.post || null, back: flags.back || null });
        return made.ops;
      }, `link-world ${key} ${tsid}`);
      return wrote(r, { edits: 1, post: made.post, on: `${tsid}/${made.on}` }, `an arm on ${shipped.label} (${made.on}), back from ${made.post}`);
    }

    case 'populate': {
      const q = num(flags.quoins, 'quoins', { optional: true });
      return wrote(await target().write((zone) => populateOps(zone, flags.street, args, q), 'populate'));
    }

    case 'hub': {
      if (args[0] !== 'map') throw new CliError('hub map --street k --line x1,y1,x2,y2');
      return wrote(await target().write((zone) => hubMapOps(zone, flags.street, flags.line), 'hub map'));
    }

    case 'ops': {
      const file = args[0];
      if (!file || !existsSync(file)) throw new CliError('ops <file.json>');
      const body = readJson(file);
      const list = Array.isArray(body) ? body : body.ops;
      if (!Array.isArray(list) || !list.length) throw new CliError('The file holds {"ops": [...]}.');
      if (list.length > 500) throw new CliError('At most 500 ops in a batch.', { code: 'builder_too_large', status: 413 });
      return wrote(await target().write((zone) => prepareOps(zone, list), typeof flags.m === 'string' ? flags.m : `ops ${basename(file)}`));
    }

    case 'decos': {
      const rows = searchDecos(catalog(), { q: args.join(' '), layer: flags.layer, hub: flags.hub, family: flags.family, animated: flags.animated, limit: flags.limit });
      const out = rows.map((d) => ({ name: d.name, family: d.family, placements: d.placements, ...(d.inHub !== undefined ? { inHub: d.inHub } : {}), size2: d.size2, drawn: d.drawn, layers: d.layers, animated: d.animated }));
      return { out, text: out.map((d) => `${d.name.padEnd(32)} ${String(d.placements).padStart(6)} placed${d.inHub !== undefined ? ` (${d.inHub} in hub)` : ''}  drawn ${d.drawn?.w_med}x${d.drawn?.h_med}`).join('\n') || 'No decos match.', exit: 0 };
    }

    case 'style': {
      const p = styleProfile(args[0] || 'default');
      if (!p) throw new CliError(`No style profile "${args[0]}". Try default or hub-<id>.`, { code: 'builder_not_found' });
      const text = [`${p.profile}: ${p.streets} streets, width ${p.size.w.join('/')}, height ${p.size.h.join('/')}`,
        ...Object.entries(p.layers).map(([role, r]) => `  ${role.padEnd(13)} z ${r.z?.join(' ')}  w ${r.w?.join('/')}  decos/1000px ${r.density?.join('/')}`)].join('\n');
      return { out: p, text, exit: 0 };
    }

    case 'guide': {
      const g = builderGuide();
      return { out: g, text: JSON.stringify(g, null, 1), exit: 0 };
    }

    case 'validate': {
      const rules = flags.rule ? String(flags.rule).split(',').map((r) => r.trim().replace(/\*$/, '')) : null;
      let report;
      let rev;
      if (local()) {
        const { validateZone } = await import('../../public/js/builder/validate.js?v=f15a39d0');
        const { loadValidatorContext } = await import('./validator-context.mjs');
        const zone = readJson(resolve(flags.file));
        rev = zone.rev;
        report = validateZone(zone, { ...loadValidatorContext(), ...(rules ? { rules } : {}) });
        delete report.reach;
      } else {
        const id = draftId();
        const { data } = await client.call('POST', `/drafts/${encodeURIComponent(id)}/validate`, { body: rules ? { rules } : {} });
        report = data;
        rev = data.rev;
      }
      const out = { ok: report.ok, rev, counts: report.counts, findings: report.findings };
      const c = report.counts;
      const text = [`rev ${rev}: ${plural(c.fatal, 'fatal')}, ${plural(c.error, 'error')}, ${plural(c.warn, 'warning')}, ${plural(c.info, 'note')}`, ...report.findings.map(findingLine)].join('\n');
      return { out, text, exit: report.ok ? 0 : 1 };
    }

    case 'render': {
      const key = flags.street;
      if (typeof key !== 'string') throw new CliError('render needs --street <key>.');
      const outFile = resolve(typeof flags.out === 'string' ? flags.out : `${key}.png`);
      const params = {
        street: key,
        view: typeof flags.view === 'string' ? flags.view : 'full',
        ...(flags.x !== undefined ? { x: num(flags.x, 'x') } : {}),
        ...(flags.y !== undefined ? { y: num(flags.y, 'y') } : {}),
        ...(flags.w !== undefined ? { w: num(flags.w, 'w') } : {}),
        ...(flags.h !== undefined ? { h: num(flags.h, 'h') } : {}),
        scale: num(flags.scale, 'scale', { optional: true }) ?? 0.25,
        overlay: typeof flags.overlay === 'string' ? flags.overlay.split(',').filter(Boolean) : [],
        layers: typeof flags.layers === 'string' ? flags.layers.split(',').filter(Boolean) : [],
      };
      let png;
      let rev;
      let counts;
      let size;
      if (local()) {
        const { createRenderer, renderInput } = await import('./render.mjs');
        const { loadValidatorContext } = await import('./validator-context.mjs');
        const zone = readJson(resolve(flags.file));
        rev = zone.rev;
        let input;
        try {
          input = renderInput(zone, key, loadValidatorContext(), params);
        } catch (e) {
          throw new CliError(e.message, { code: e.code || 'builder_invalid', status: e.status || 422, data: e.data || null });
        }
        const r = renderer || createRenderer({ idleMs: 1000 });
        try {
          const out = await r.render(input);
          png = out.png;
          size = `${out.width}x${out.height}`;
        } finally {
          if (!renderer) await r.close();
        }
        counts = `${input.counts.fatal + input.counts.error},${input.counts.warn}`;
      } else {
        const id = draftId();
        const query = { street: key, view: params.view, scale: String(params.scale) };
        for (const k of ['x', 'y', 'w', 'h']) if (params[k] !== undefined) query[k] = String(params[k]);
        if (params.overlay.length) query.overlay = params.overlay.join(',');
        if (params.layers.length) query.layers = params.layers.join(',');
        const res = await client.call('GET', `/drafts/${encodeURIComponent(id)}/render.png`, { query, raw: true });
        png = Buffer.from(await res.arrayBuffer());
        rev = Number(res.headers.get('x-builder-rev'));
        counts = res.headers.get('x-builder-findings') || '0,0';
        size = res.headers.get('x-builder-size') || '';
      }
      writeFileSync(outFile, png);
      const [errors, warns] = counts.split(',').map(Number);
      return { out: { file: outFile, size, rev, findings: { error: errors, warn: warns } }, text: `${basename(outFile)} ${size}  rev ${rev}  findings ${plural(errors, 'error')}, ${plural(warns, 'warning')}`, exit: 0 };
    }

    case 'asset': {
      if (args[0] !== 'add' || !args[1] || !existsSync(args[1])) throw new CliError('asset add <file> --name gz_x --licence own-work-CC0|ai-generated --author A');
      const id = draftId();
      const body = {
        draft: id,
        name: flags.name,
        file2: readFileSync(args[1]).toString('base64'),
        licence: flags.licence,
        author: flags.author,
        ...(typeof flags.file3 === 'string' ? { file3: readFileSync(flags.file3).toString('base64') } : {}),
        ...(typeof flags.tool === 'string' ? { tool: flags.tool } : {}),
        ...(typeof flags.prompt === 'string' ? { prompt: flags.prompt } : {}),
        ...(typeof flags.inputs === 'string' ? { inputs: flags.inputs.split(',').map((s) => s.trim()).filter(Boolean) } : {}),
        ...(typeof flags.role === 'string' ? { role: flags.role } : {}),
      };
      const { data } = await client.call('POST', '/assets', { body });
      const r = await draftTarget(client, id).write(() => [data.op], `asset ${flags.name}`);
      return wrote(r, { asset: data.asset, report: data.report }, `${flags.name} kept (${data.asset.sha256.slice(0, 12)})`);
    }

    case 'play': {
      const id = draftId();
      const street = typeof flags.street === 'string' ? `&street=${encodeURIComponent(flags.street)}` : '';
      const url = `${cfg.url}/play/?practice=1&autostart=1&draft=${encodeURIComponent(id)}${street}`;
      return { out: { url }, text: url, exit: 0 };
    }

    case 'history': {
      const { data } = await client.call('GET', `/drafts/${encodeURIComponent(draftId())}/revisions`);
      return { out: data.revisions, text: data.revisions.map((r) => `rev ${String(r.rev).padEnd(4)} ${r.at}  ${r.author.padEnd(22)} ${r.note || r.ops}`).join('\n'), exit: 0 };
    }

    case 'restore': {
      const rev = Number(args[0]);
      if (!Number.isInteger(rev) || rev < 1) throw new CliError('restore <rev>');
      const id = draftId();
      const { rev: now } = await draftTarget(client, id).zone();
      const { data } = await client.call('POST', `/drafts/${encodeURIComponent(id)}/restore`, { body: { rev }, headers: { 'If-Match': `"${now}"` } });
      return { out: data, text: `rev ${data.rev} (rev ${rev} copied forward)`, exit: 0 };
    }

    case 'publish':
      throw new CliError('Publishing comes with phase P6 (spec 11): publish --dry-run | --write in a clean worktree.', { code: 'builder_not_yet' });

    case 'sign': {
      const [method, route, body = ''] = args;
      if (!method || !route) throw new CliError('sign METHOD ROUTE [BODY] [--query a=1&b=2]');
      if (!cfg.key) throw new CliError('No builder key (GRODDLE_BUILDER_KEY).', { code: 'builder_no_key' });
      const header = signKey({ keyId: cfg.key.keyId, secret: cfg.key.secret, method, route: route.replace(/^\/wp-json/, ''), query: typeof flags.query === 'string' ? flags.query : '', body });
      return { out: { header }, text: header, exit: 0 };
    }

    default:
      throw new CliError(`No command "${cmd}". Try: node tools/builder/cli.mjs help`);
  }
}

/** P3's street templates (street add). Wired at the rebase onto P3; until then a clear refusal. */
async function templates() {
  throw new CliError('street add needs the street templates that come with P3 (new zones). Fork a shipped street for now: street fork <tsid> --key k --label L.', { code: 'builder_not_yet' });
}

export async function main(argv = process.argv.slice(2), opts = {}) {
  const json = argv.includes('--json');
  try {
    const r = await run(argv, opts);
    process.stdout.write(`${json ? JSON.stringify(r.out) : r.text}\n`);
    return r.exit;
  } catch (e) {
    if (!(e instanceof CliError) && !(e instanceof OpError)) {
      process.stderr.write(`${e.stack || e.message}\n`);
      return 2;
    }
    const err = { code: e.code, message: e.message, ...(e.status ? { status: e.status } : {}), ...(e.data ? { data: e.data } : {}) };
    if (json) process.stdout.write(`${JSON.stringify({ error: err })}\n`);
    else process.stderr.write(`${e.message}${e.data?.op !== undefined ? ` (op ${e.data.op})` : ''}\n`);
    return e.exit ?? 2;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().then((code) => process.exit(code));
}

