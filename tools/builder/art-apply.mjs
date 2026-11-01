#!/usr/bin/env node
/**
 * LEVEL BUILDER art pack: puts the pictures art-intake.mjs made ready into a COPY of a draft, so
 * the new art can be compared with the old at the same places. The source draft is never written.
 *
 *   node tools/builder/art-apply.mjs <pack dir> --from <draft> --to <new draft> [--title T] [--dry-run]
 *
 * With the builder key (GRODDLE_BUILDER_KEY or ~/.config/groddle/builder.env, as cli.mjs; scopes
 * drafts:read, drafts:write, assets:write):
 *
 *   1. pulls --from and makes --to (refused when it exists): the same streets, geometry, decos,
 *      effects and ways in, under a hub id of its own, with the title "<title> (generated art)";
 *   2. sends each ready picture through the site's asset intake (spec 9.1; licence ai-generated,
 *      CC0 1.0) with its provenance from ready/intake.json: author, model, prompt, inputs;
 *   3. one batch of ops: the new art's asset rows, every deco and effect that drew the old piece
 *      now draws the new one (sized to the new picture's shape at the old drawn scale; strips,
 *      ledges and ground keep their drawn width, supports, walls and streams their drawn box; a
 *      ledge or ground strip set so its walkable top sits on its line again; an effect at a vent's mouth moved to the new
 *      mouth), and the old pieces' rows dropped where nothing uses them. Pieces with no new
 *      picture keep the old art.
 *
 * --dry-run works on the pulled zone only and prints the ops' count, sending nothing.
 *
 * Kept art belongs to the draft it came in through. The copy still draws the source's pieces it
 * did not replace (renders and the play-test fetch art by its sha256), but the site's validate
 * hands the validator only the copy's own art, so each piece left over shows as AST-003 "not at
 * hand" there. With every piece replaced there are none; a partial set is fine for comparing.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyOps } from '../../public/js/builder/ops.js?v=acf30407';
import { newHub, nextHubId } from '../../public/js/builder/templates.js?v=22093310';
import { isStandable } from '../../public/js/street-model.js?v=23b926e5';

const clone = (v) => JSON.parse(JSON.stringify(v));
const round = (n) => Math.round(n);

/** PURE: a standable line's world y at x, or null when it does not span x. */
function lineYAt(p, x) {
  const x0 = Math.min(p.x1, p.x2);
  const x1 = Math.max(p.x1, p.x2);
  if (x < x0 - 1 || x > x1 + 1) return null;
  if (p.x2 === p.x1) return Math.min(p.y1, p.y2);
  return p.y1 + ((p.y2 - p.y1) * (x - p.x1)) / (p.x2 - p.x1);
}

/**
 * PURE: the walkable line a middleground deco's top sits on: a standable line under its x, in the
 * upper half of the deco (world y, up is negative), nearest its top. Null when there is none.
 */
export function lineUnder(street, d) {
  const top = d.y - d.h;
  let best = null;
  for (const p of street.platforms || []) {
    if (!isStandable(p)) continue;
    const y = lineYAt(p, d.x);
    if (y === null || y < top - 4 || y > top + d.h * 0.5) continue;
    if (best === null || Math.abs(y - top) < Math.abs(best - top)) best = y;
  }
  return best;
}

/**
 * PURE: the ops that swap a zone's pieces for the ready ones. `ready` is intake.json's pieces;
 * `kept` maps each new name to the asset row the site's intake answered (its w and h are the kept
 * file's). Answers { ops, moved: {decos, emitters, ledges}, dropped: [old names] }.
 */
export function swapOps(zone, ready, kept) {
  const ops = [];
  const moved = { decos: 0, emitters: 0, ledges: 0 };
  const byOld = new Map(ready.map((r) => [r.replaces, r]));
  for (const r of ready) ops.push({ op: 'asset.set', name: r.name, asset: kept[r.name] });
  for (const { key, street } of zone.streets || []) {
    const vents = [];
    for (const layer of street.layers || []) {
      for (const d of layer.decos || []) {
        const r = byOld.get(d.sprite);
        if (!r) continue;
        const old = zone.assets?.[d.sprite] || {};
        const k = kept[r.name];
        const sx = old.w ? d.w / old.w : 0.5;
        const sy = old.h ? d.h / old.h : 0.5;
        const set = { sprite: r.name };
        let w = round(k.w * sx);
        let h = round(k.h * sy);
        // Strips, ledges and ground keep their drawn width (they tile or cover a line); their height follows the new shape.
        if (r.kind === 'strip' || r.kind === 'topper' || r.kind === 'ground') {
          w = d.w;
          h = round((d.w * k.h) / k.w);
        }
        // Supports, walls and streams fill the gap they were placed to fill (they tile down): the drawn box stays.
        if (r.kind === 'support' || r.kind === 'wall' || r.kind === 'stream') {
          w = d.w;
          h = d.h;
        }
        set.w = w;
        set.h = h;
        if ((r.kind === 'topper' || r.kind === 'ground') && layer.id === 'middleground' && Number.isFinite(r.report?.surface)) {
          const line = lineUnder(street, d);
          if (line !== null) {
            set.y = round(line + h * (1 - r.report.surface / k.h));
            moved.ledges += 1;
          }
        }
        ops.push({ op: 'deco.set', street: key, id: d.id, set });
        moved.decos += 1;
        if (r.kind === 'object' && Array.isArray(r.report?.tops)) vents.push({ layer: layer.id, old: d, w, h, y: set.y ?? d.y, tops: r.report.tops, kh: k.h });
      }
    }
    for (const e of street.emitters || []) {
      const set = {};
      const r = byOld.get(e.sprite);
      if (r) set.sprite = r.name;
      // An effect at the mouth of a swapped piece (inside it, in its upper half) moves to the new top there.
      const layer = e.layer || 'middleground';
      const v = vents.find((q) => q.layer === layer && Math.abs(e.x - q.old.x) <= q.old.w / 2 && e.y <= q.old.y && e.y >= q.old.y - q.old.h);
      if (v && e.y <= v.old.y - v.old.h * 0.5) {
        const t = Math.max(0, Math.min(20, Math.round(((e.x - (v.old.x - v.w / 2)) / v.w) * 20)));
        const top = v.tops[t];
        if (top !== null && top !== undefined) set.y = round(v.y - v.h + (top / v.kh) * v.h + v.h * 0.04);
      }
      if (Object.keys(set).length) {
        ops.push({ op: 'emitter.set', street: key, id: e.id, set });
        moved.emitters += 1;
      }
    }
  }
  // Old rows nothing draws any more go.
  const trial = clone(zone);
  applyOps(trial, ops.map(clone));
  const used = new Set();
  for (const { street } of trial.streets || []) {
    for (const layer of street.layers || []) for (const d of layer.decos || []) used.add(d.sprite);
    for (const e of street.emitters || []) if (e.sprite) used.add(e.sprite);
  }
  const dropped = [];
  for (const r of ready) {
    if (zone.assets?.[r.replaces] && !used.has(r.replaces)) {
      ops.push({ op: 'asset.set', name: r.replaces, asset: null });
      dropped.push(r.replaces);
    }
  }
  return { ops, moved, dropped };
}

/** PURE: the copy of a zone under a new id, title and hub id (every hubId / hub_id that named the old hub). */
export function copyZone(zone, { id, title, hubId }) {
  const out = clone(zone);
  const oldHub = zone.hub?.id;
  out.id = id;
  out.title = title;
  out.rev = 1;
  if (oldHub && hubId) {
    const walk = (v) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') {
        for (const k of Object.keys(v)) {
          if ((k === 'hubId' || k === 'hub_id') && String(v[k]) === String(oldHub)) v[k] = String(hubId);
          else walk(v[k]);
        }
      }
    };
    walk(out);
    out.hub.id = String(hubId);
  }
  for (const s of out.streets || []) if (typeof s.street?.source === 'string') s.street.source = s.street.source.replace(/^groddle-builder \S+/, `groddle-builder ${id}`);
  return out;
}

async function main(argv) {
  const opt = (k) => {
    const i = argv.indexOf(k);
    return i >= 0 ? argv[i + 1] : null;
  };
  const valued = new Set(['--from', '--to', '--title']);
  const dir = argv.find((a, i) => !a.startsWith('--') && !valued.has(argv[i - 1]));
  const from = opt('--from');
  const to = opt('--to');
  if (!dir || !from || !to) {
    process.stderr.write('node tools/builder/art-apply.mjs <pack dir> --from <draft> --to <new draft> [--title T] [--dry-run]\n');
    return 2;
  }
  if (from === to) throw new Error('--to must be a new draft: the source draft is never written.');
  const intakeFile = join(resolve(dir), 'ready/intake.json');
  if (!existsSync(intakeFile)) throw new Error(`No ${intakeFile}: run art-intake.mjs first.`);
  const intake = JSON.parse(readFileSync(intakeFile, 'utf8'));
  if (!intake.pieces.length) throw new Error('intake.json has no ready pieces.');
  const { settings, createClient, draftTarget } = await import('./cli.mjs');
  const cfg = settings(process.env);
  const client = createClient({ url: cfg.url, key: cfg.key });
  const { zone: source } = await draftTarget(client, from).zone();
  const missing = intake.pieces.filter((p) => !source.assets?.[p.replaces]).map((p) => p.replaces);
  if (missing.length) process.stderr.write(`Not in ${from} (skipped): ${missing.join(', ')}\n`);
  const ready = intake.pieces.filter((p) => source.assets?.[p.replaces]);
  if (argv.includes('--dry-run')) {
    const kept = Object.fromEntries(ready.map((r) => [r.name, { origin: 'new', w: r.w, h: r.h }]));
    const { ops, moved, dropped } = swapOps(source, ready, kept);
    process.stdout.write(`dry run: ${ops.length} ops (${moved.decos} decos, ${moved.ledges} ledges reset on their lines, ${moved.emitters} effects), drops ${dropped.length} old rows\n`);
    return 0;
  }
  const exists = await client.call('GET', `/drafts/${encodeURIComponent(to)}`).then(() => true, (e) => (e.status === 404 ? false : Promise.reject(e)));
  if (exists) throw new Error(`The draft ${to} exists already; pick a new --to (nothing was changed).`);
  const { data: list } = await client.call('GET', '/drafts', { query: { all: '1' } });
  const hubId = source.hub?.isNew ? nextHubId(list.drafts.map((d) => d.hub?.isNew && d.hub.id).filter(Boolean)) : source.hub?.id;
  const title = opt('--title') || `${source.title} (generated art)`.slice(0, 80);
  await client.call('POST', '/drafts', { body: { id: to, title, ...(source.hub ? { hub: source.hub.isNew ? newHub({ id: hubId, name: source.hub.name }) : { id: source.hub.id, name: source.hub.name } } : {}) } });
  const copy = copyZone(source, { id: to, title, hubId });
  const put = await client.call('PUT', `/drafts/${encodeURIComponent(to)}`, { body: copy, headers: { 'If-Match': '"1"' } });
  process.stdout.write(`${to}: a copy of ${from} rev ${source.rev} (rev ${put.data.rev}, hub ${hubId})\n`);
  const kept = {};
  for (const r of ready) {
    const p = r.provenance;
    const body = { draft: to, name: r.name, file2: readFileSync(join(resolve(dir), 'ready', r.file)).toString('base64'), licence: p.licence, author: p.author, tool: p.tool, prompt: p.prompt, inputs: p.inputs, role: p.role };
    const { data } = await client.call('POST', '/assets', { body });
    kept[r.name] = data.asset;
    const warn = (data.report?.findings || []).filter((f) => f.severity === 'warn').map((f) => f.code || f.message);
    process.stdout.write(`  intake ${r.name} ${data.asset.w}x${data.asset.h}${warn.length ? `  warn: ${warn.join(', ')}` : ''}\n`);
  }
  let summary = null;
  const w = await draftTarget(client, to).write((zone) => {
    summary = swapOps(zone, ready, kept);
    return summary.ops;
  }, `generated art: ${ready.length} pieces`);
  process.stdout.write(`${to} rev ${w.rev}: ${ready.length} pieces in, ${summary.moved.decos} decos and ${summary.moved.emitters} effects swapped, ${summary.moved.ledges} ledges set on their lines, ${summary.dropped.length} old rows dropped\n`);
  const reused = Object.keys(copy.assets || {}).filter((n) => copy.assets[n]?.origin === 'new' && !summary.dropped.includes(n));
  if (reused.length) process.stdout.write(`  ${reused.length} pieces still draw ${from}'s art; validate names them AST-003 (not at hand), which only publishing minds\n`);
  process.stdout.write(`  play: ${cfg.url}/play/?practice=1&autostart=1&draft=${to}\n`);
  writeFileSync(join(resolve(dir), 'ready/applied.json'), `${JSON.stringify({ from, fromRev: source.rev, to, rev: w.rev, hub: hubId, pieces: ready.map((r) => r.name), moved: summary.moved, dropped: summary.dropped }, null, 1)}\n`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (e) => {
    process.stderr.write(`${e.message}\n`);
    process.exit(2);
  });
}
