#!/usr/bin/env node
/**
 * What a release would ship. For the game, the server and the site: the newest vX.Y.Z tag, what is
 * live (tools/deploy/live.json), and the commits on main since the tag, with the player-facing ones
 * (NEW, IMPROVE, FIX) drafted as release notes. For Minn Engine and Minn Admin: the commit live.json
 * pins and how far each has moved since.
 *
 * The game's published zones (level builder, docs/level-builder/spec.md 11) are listed too: each
 * zone file with its streets and the files publishing derived from it, and whether each is new
 * since the tag, changed since, or not committed yet.
 *
 *   node tools/release/status.mjs            all five
 *   node tools/release/status.mjs --notes    also print each repo's draft notes in full
 *
 * The notes draft itself (which subjects, in what words) is tools/release/notes.mjs, shared with
 * tools/release/whats-new.mjs (the loading card's What's new, #745).
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { GAME_DIR, HAS_SERVER, HAS_SITE, SERVER_DIR, SITE_DIR } from '../repos.mjs';
import { forNotes, git, lastTag, nextVersion, noteText, since } from './notes.mjs';

const GAME = GAME_DIR;
const live = JSON.parse(readFileSync(join(GAME, 'tools/deploy/live.json'), 'utf8'));
const notes = process.argv.includes('--notes');

for (const [name, dir, key] of [['game', GAME, 'game'], ['server', HAS_SERVER && SERVER_DIR, 'server'], ['site', HAS_SITE && SITE_DIR, 'site']]) {
  if (!dir) {
    console.log(`${name}: not cloned beside the game`);
    continue;
  }
  const tag = lastTag(dir);
  const commits = since(dir, tag);
  const shown = commits.filter(forNotes);
  const dirty = git(dir, 'status', '--porcelain', '--untracked-files=no') ? ', uncommitted changes in the working tree' : '';
  console.log(`${name}: live ${live[key] || '?'}, last tag ${tag || 'none'}, ${commits.length} commits since (${shown.length} for the notes)${dirty}`);
  if (commits.length) console.log(`  next: ${nextVersion(tag, commits)}`);
  for (const c of notes ? shown : shown.slice(0, 5)) console.log(`  - ${noteText(c.subject)} (${c.hash})`);
  if (!notes && shown.length > 5) console.log(`  ... ${shown.length - 5} more (--notes)`);
  if (key === 'game') for (const line of zoneLines(dir, tag)) console.log(line);
}

/**
 * The game's published zones (spec 11): one line a zone, then its files (the zone file, its street
 * files, its hub map, its new art and the shipped streets its ways in are on), each marked new,
 * changed or uncommitted against the tag.
 */
function zoneLines(dir, tag) {
  const zonesDir = join(dir, 'public/assets/zones');
  const names = existsSync(zonesDir) ? readdirSync(zonesDir).filter((f) => f.endsWith('.json')).sort() : [];
  if (!names.length) return ['  zones: none published'];
  let since = new Map();
  try {
    const out = git(dir, 'diff', '--name-status', tag ? `${tag}..main` : 'main', '--', 'public/assets', 'tools/provenance', 'public/js/deco-new-list.js');
    since = new Map(out.split('\n').filter(Boolean).map((l) => [l.split('\t').pop(), l[0] === 'A' ? 'new since the tag' : 'changed since the tag']));
  } catch { /* no tag or no main */ }
  let open = new Set();
  try {
    open = new Set(git(dir, 'status', '--porcelain', '--untracked-files=all', '--', 'public/assets', 'tools/provenance', 'public/js').split('\n').filter(Boolean).map((l) => l.slice(3)));
  } catch { /* not a checkout */ }
  const mark = (p) => (open.has(p) ? 'not committed' : since.get(p) || 'unchanged since the tag');
  const lines = [`  zones: ${names.length} published`];
  for (const f of names) {
    const zone = JSON.parse(readFileSync(join(zonesDir, f), 'utf8'));
    const streets = (zone.streets || []).map((s) => s.street);
    const paths = [`public/assets/zones/${f}`, ...streets.map((s) => `public/assets/streets/${s.tsid}.json`)];
    if (zone.hub?.isNew) paths.push(`public/assets/maps/hubs/hub-${zone.hub.id}.json`);
    for (const [name, a] of Object.entries(zone.assets || {})) if (a?.origin === 'new') paths.push(`public/assets/decos/groddle/${name}.webp`);
    for (const t of [...new Set((zone.edits || []).map((e) => e.tsid))]) paths.push(`public/assets/streets/${t.replace(/^L/, 'G')}.json`);
    lines.push(`  - ${zone.title} (${zone.id}): ${streets.map((s) => s.label).join(', ')}; hub ${zone.hub?.name || '?'} (${zone.hub?.id || '?'})`);
    for (const p of paths) if (existsSync(join(dir, p))) lines.push(`      ${p}  ${mark(p)}`);
  }
  return lines;
}


for (const [name, dir, key] of [
  ['Minn Engine', join(homedir(), 'Cove/Sites/minn-engine.localhost'), 'engine'],
  ['Minn Admin', join(homedir(), 'Cove/Sites/minnadmin.localhost/public/wp-content/plugins/minn-admin'), 'minnAdmin'],
]) {
  if (!live[key]) {
    console.log(`${name}: not pinned; the live site updates it itself`);
    continue;
  }
  try {
    const ahead = since(dir, live[key]).length;
    console.log(`${name}: live ${String(live[key]).slice(0, 8)}, main ${git(dir, 'rev-parse', '--short=8', 'main')} (${ahead} commits since)`);
  } catch {
    console.log(`${name}: ${dir} not found`);
  }
}
