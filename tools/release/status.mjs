#!/usr/bin/env node
/**
 * What a release would ship. For the game, the server and the site: the newest vX.Y.Z tag, what is
 * live (tools/deploy/live.json), and the commits on main since the tag, with the player-facing ones
 * (NEW, IMPROVE, FIX) drafted as release notes. For Minn Engine and Minn Admin: the commit live.json
 * pins and how far each has moved since.
 *
 *   node tools/release/status.mjs            all five
 *   node tools/release/status.mjs --notes    also print each repo's draft notes in full
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { GAME_DIR, HAS_SERVER, HAS_SITE, SERVER_DIR, SITE_DIR } from '../repos.mjs';

const GAME = GAME_DIR;
const live = JSON.parse(readFileSync(join(GAME, 'tools/deploy/live.json'), 'utf8'));
const notes = process.argv.includes('--notes');
const git = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim();

/** The newest vX.Y.Z tag reachable from main, or null. */
function lastTag(dir) {
  try {
    return git(dir, 'describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*', 'main');
  } catch {
    return null;
  }
}

/** Commits on main after a ref, newest first: { hash, subject }. */
function since(dir, ref) {
  const out = git(dir, 'log', '--format=%h %s', ref ? `${ref}..main` : 'main');
  return out ? out.split('\n').map((l) => ({ hash: l.slice(0, l.indexOf(' ')), subject: l.slice(l.indexOf(' ') + 1) })) : [];
}

/** Emoji-Log subjects a player would notice. */
const forNotes = (c) => /^(📦 NEW|👌 IMPROVE|🐛 FIX):/u.test(c.subject);

/** The next version: a minor bump when anything NEW landed, else a patch. */
function nextVersion(tag, commits) {
  const [maj, min, pat] = (tag || 'v0.0.0').slice(1).split('.').map(Number);
  return commits.some((c) => c.subject.startsWith('📦 NEW')) ? `v${maj}.${min + 1}.0` : `v${maj}.${min}.${pat + 1}`;
}

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
  for (const c of notes ? shown : shown.slice(0, 5)) console.log(`  - ${c.subject.replace(/^\S+ (NEW|IMPROVE|FIX): /u, '')} (${c.hash})`);
  if (!notes && shown.length > 5) console.log(`  ... ${shown.length - 5} more (--notes)`);
}

for (const [name, dir, key] of [
  ['Minn Engine', join(homedir(), 'Cove/Sites/minn-engine.localhost'), 'engine'],
  ['Minn Admin', join(homedir(), 'Cove/Sites/minnadmin.localhost/public/wp-content/plugins/minn-admin'), 'minnAdmin'],
]) {
  try {
    const ahead = since(dir, live[key]).length;
    console.log(`${name}: live ${String(live[key]).slice(0, 8)}, main ${git(dir, 'rev-parse', '--short=8', 'main')} (${ahead} commits since)`);
  } catch {
    console.log(`${name}: ${dir} not found`);
  }
}
