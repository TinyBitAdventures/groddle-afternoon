#!/usr/bin/env node
/**
 * Writes public/restoration/gaps.json, the data of the public Known gaps page
 * (/restoration/gaps/, drawn by the site's groddle/restoration-gaps block,
 * groddle-afternoon-site src/RestorationGaps.php).
 *
 * Which gaps are public, and every word players read about them, come from
 * tools/gaps/public-gaps.json (curated by hand). Their state comes from the
 * private coverage register (research/coverage/register.md beside this repo,
 * or GRODDLE_REGISTER): a row's State column, and for a done row the release
 * that shipped the commits it cites (game, site or server hashes; a hash a
 * lane rebased is found again on the branch by its subject; a site or server
 * tag counts from the first game release tools/deploy/live.json paired it with).
 * Nothing else from the register is copied: its notes, sources and player
 * references never reach the page.
 *
 *   node tools/gaps/build-data.mjs                     write gaps.json
 *   node tools/gaps/build-data.mjs --check             exit 1 when gaps.json is stale or breaks the page's rules
 *   node tools/gaps/build-data.mjs --release=v0.36.0   at a release, before tagging: what is fixed on the branch counts as in it
 *   node tools/gaps/build-data.mjs --hash=<name>       print a name's deny.json hash
 *
 * Without the register (a public clone) the build stops, and --check only
 * checks the committed gaps.json against public-gaps.json and the page's
 * rules (no em-dashes, no paths, no @, no name on deny.json), so the public
 * test suite passes without research files.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { GAME_DIR, SERVER_DIR, SITE_DIR } from '../repos.mjs';

export const CURATED = join(GAME_DIR, 'tools/gaps/public-gaps.json');
export const DENY = join(GAME_DIR, 'tools/gaps/deny.json');
export const OUT = join(GAME_DIR, 'public/restoration/gaps.json');
export const REGISTER = process.env.GRODDLE_REGISTER || join(GAME_DIR, '..', 'research/coverage/register.md');

/** The states players see, in the order the page lists them, with each one's chip tone (restoration.css tokens). */
export const STATES = {
  fixing: { label: 'Being fixed', tone: 'sky', desc: 'Found and being worked on now.' },
  known: { label: 'Known', tone: 'sun', desc: 'We know about it and it is on the list.' },
  unreleased: { label: 'Fixed, not released yet', tone: 'plum', desc: 'Fixed, and out with the next release.' },
  fixed: { label: 'Fixed', tone: 'moss', desc: 'Fixed in the release named on it.' },
  lost: { label: 'Not possible', tone: 'stone', desc: 'No source survived, so it cannot be put back as it was.' },
  purpose: { label: 'On purpose', tone: 'dusk', desc: 'A difference from Glitch we chose, and why.' },
  idea: { label: 'Never built in Glitch', tone: 'sand', desc: 'Tiny Speck planned it but never finished or switched it on.' },
};
const LISTED = ['fixing', 'known', 'unreleased', 'fixed', 'lost'];
const REGISTER_STATES = { open: 'known', hunt: 'known', decision: 'known', blocked: 'known', sniff: 'known', idea: 'idea', done: 'done' };

const hash = (word) => createHash('sha256').update(word).digest('hex').slice(0, 16);

/**
 * What breaks the page's rules in `text` (one string or a whole JSON value):
 * an em-dash, a file path or file:line, an @, a web address, or a word on the
 * deny list. Returns the problems, empty when clean.
 */
export function contentProblems(value, deny = JSON.parse(readFileSync(DENY, 'utf8'))) {
  const strings = [];
  // Everything players can read; the file's own note (for whoever opens the JSON) names the builder's path.
  const walk = (v) => (typeof v === 'string' ? strings.push(v) : v && typeof v === 'object' && Object.entries(v).forEach(([k, x]) => k !== 'note' && walk(x)));
  walk(value);
  const any = new Set(deny.any);
  const exact = new Set(deny.exact);
  const problems = [];
  for (const s of strings) {
    const say = (why) => problems.push(`${why}: ${s.slice(0, 90)}`);
    if (s.includes('—')) say('em-dash');
    if (s.includes('@')) say('an @');
    if (/https?:|www\./i.test(s)) say('a web address');
    if (/[A-Za-z_][\w.-]*\/[\w.-]/.test(s) || /\.(?:js|mjs|php|json|as|go|py|md|fla|swf|html|css|tsv|sqlite)\b/i.test(s) || /\b\w+\.\w+:\d/.test(s)) say('a path');
    for (const word of s.match(/[A-Za-z0-9][A-Za-z0-9_-]*/g) || []) {
      if (exact.has(hash(word)) || any.has(hash(word.toLowerCase()))) say('a name on tools/gaps/deny.json');
    }
  }
  return problems;
}

/** The register's rows, by id: { state, text } (text is every cell after the area, for the commits it cites). */
export function readRegister(file = REGISTER) {
  const rows = new Map();
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!/^\| G\d/.test(line)) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    rows.set(cells[0], { state: cells[cells.length - 1], text: cells.slice(2).join(' | ') });
  }
  return rows;
}

const git = (dir, ...args) => {
  try {
    return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 256 * 1024 * 1024 }).trim();
  } catch {
    return null;
  }
};
const semver = (tag) => (/^v(\d+)\.(\d+)\.(\d+)$/.exec(tag || '') || []).slice(1).map(Number);
const newer = (a, b) => {
  const [x, y] = [semver(a), semver(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return (x[i] ?? -1) > (y[i] ?? -1);
  return false;
};

/** Finds where the commits a row cites were released. */
export class Releases {
  constructor() {
    this.repos = { game: GAME_DIR, site: SITE_DIR, server: SERVER_DIR };
    this.subjects = {};
    this.cache = new Map();
    // Which site and server tags each game release went out with (live.json's history, oldest first).
    this.pairs = [];
    for (const commit of (git(GAME_DIR, 'log', '--reverse', '--format=%H', 'HEAD', '--', 'tools/deploy/live.json') || '').split('\n').filter(Boolean)) {
      try {
        const live = JSON.parse(git(GAME_DIR, 'show', `${commit}:tools/deploy/live.json`));
        if (semver(live.game).length) this.pairs.push(live);
      } catch { /* an older shape */ }
    }
  }

  /** A commit on the branch: the hash itself, or the commit with its subject when a lane's hash was rebased away. */
  onBranch(repo, short) {
    const dir = this.repos[repo];
    const full = git(dir, 'rev-parse', '--verify', '--quiet', `${short}^{commit}`);
    if (!full) return null;
    if (git(dir, 'merge-base', '--is-ancestor', full, 'HEAD') !== null) return full;
    const subject = git(dir, 'log', '-1', '--format=%s', full);
    if (!this.subjects[repo]) {
      this.subjects[repo] = new Map();
      for (const line of (git(dir, 'log', '--format=%H%x09%s', 'HEAD') || '').split('\n')) {
        const [h, s] = line.split('\t');
        this.subjects[repo].set(s, h);
      }
    }
    return this.subjects[repo].get(subject) || null;
  }

  /** The first v* tag holding a commit, or null. */
  firstTag(repo, commit) {
    const tags = (git(this.repos[repo], 'tag', '--contains', commit, '--list', 'v*') || '').split('\n').filter((t) => semver(t).length);
    return tags.reduce((best, t) => (best === null || newer(best, t) ? t : best), null);
  }

  /**
   * The game release that shipped `repo`'s commit `short`: { tag } (a game
   * tag, or null when it is fixed on the branch but not released), or null
   * when the hash is in none of the three repos' branches.
   */
  release(repo, short) {
    const key = `${repo}:${short}`;
    if (this.cache.has(key)) return this.cache.get(key);
    let out = null;
    const commit = this.repos[repo] && this.onBranch(repo, short);
    // A 🚀 RELEASE commit records a release after its tag (live.json); a row citing one names the release, not a fix.
    if (commit && (git(this.repos[repo], 'log', '-1', '--format=%s', commit) || '').startsWith('🚀 RELEASE')) out = { skip: true };
    else if (commit) {
      const tag = this.firstTag(repo, commit);
      if (repo === 'game' || tag === null) out = { tag };
      else {
        const pair = this.pairs.find((p) => semver(p[repo]).length && !newer(tag, p[repo]));
        out = { tag: pair ? pair.game : null };
      }
    }
    this.cache.set(key, out);
    return out;
  }

  /** Where the hashes in a row's text (or a curated commits list) were released: 'v0.31.0', null (not yet), or undefined (none found). */
  shipped(hashes) {
    const found = [];
    for (const h of hashes) {
      const [repo, short] = h.includes(':') ? h.split(':') : [null, h];
      for (const r of repo ? [repo] : ['game', 'site', 'server']) {
        const rel = this.release(r, short);
        if (rel) {
          if (!rel.skip) found.push(rel.tag);
          break;
        }
      }
    }
    if (found.length === 0) return undefined;
    if (found.includes(null)) return null;
    return found.reduce((a, b) => (newer(b, a) ? b : a));
  }
}

/** The hex hashes a register row's text cites (7 to 12 digits, at least one letter, so numbers and ids are not taken for commits). */
export const citedHashes = (text) => [...new Set(text.match(/\b(?=[0-9a-f]*[a-f])(?=[0-9a-f]*[0-9])[0-9a-f]{7,12}\b/g) || [])];

/** The newest release tag the branch holds (or --release). */
function currentRelease(release) {
  if (release) return release;
  const tag = git(GAME_DIR, 'describe', '--tags', '--abbrev=0', '--match', 'v*', 'HEAD');
  return semver(tag).length ? tag : null;
}

/**
 * gaps.json from the curated list. `register` is the readRegister map (or
 * null: then only the curated words and the override states are joined, as
 * --check does without research files, and states from the register are
 * taken from `previous`, the committed file).
 */
export function build(curated, { register, releases, release = null, previous = null }) {
  const before = new Map();
  for (const a of previous?.areas || []) for (const it of a.items) before.set(it.id, it);
  for (const it of previous?.purpose || []) before.set(it.id, { ...it, state: 'purpose' });
  for (const it of previous?.ideas || []) before.set(it.id, { ...it, state: 'idea' });

  const areas = [];
  const purpose = [];
  const ideas = [];
  const missing = [];
  for (const g of curated.gaps) {
    const item = { id: g.id, text: g.text, ...(g.report ? { report: g.report } : {}) };
    let state;
    let version = null;
    if (g.show === 'purpose') state = 'purpose';
    else if (!register) {
      const was = before.get(g.id);
      state = was?.state ?? (g.show === 'fixing' ? 'fixing' : 'known');
      version = was?.version ?? null;
    } else {
      const row = /^G\d/.test(g.id) ? register.get(g.id) : null;
      if (/^G\d/.test(g.id) && !row) missing.push(g.id);
      const regState = row ? REGISTER_STATES[row.state] || 'known' : null;
      const hashes = g.commits || (regState === 'done' ? citedHashes(row.text) : []);
      const shipped = hashes.length ? releases.shipped(hashes) : undefined;
      const fixed = regState === 'done' || (g.commits && shipped !== undefined);
      if (fixed) {
        const tag = shipped === null && release ? release : shipped;
        state = tag === null ? 'unreleased' : 'fixed';
        version = tag || null;
      } else if (g.show === 'lost') state = 'lost';
      else if (g.show === 'fixing') state = 'fixing';
      else state = regState || 'known';
    }
    if (state === 'purpose') purpose.push({ ...item, area: g.area });
    else if (state === 'idea') ideas.push({ ...item, area: g.area });
    else {
      let area = areas.find((a) => a.name === g.area);
      if (!area) areas.push(area = { name: g.area, items: [] });
      area.items.push({ ...item, state, ...(version ? { version } : {}) });
    }
  }
  if (missing.length) throw new Error(`not in the register: ${missing.join(', ')}`);
  for (const a of areas) a.items.sort((x, y) => LISTED.indexOf(x.state) - LISTED.indexOf(y.state));
  const counts = Object.fromEntries(Object.keys(STATES).map((s) => [s, 0]));
  for (const a of areas) for (const it of a.items) counts[it.state]++;
  counts.purpose = purpose.length;
  counts.idea = ideas.length;
  return {
    note: 'Written by tools/gaps/build-data.mjs from tools/gaps/public-gaps.json and the coverage register. Edit those, never this file.',
    release: register ? currentRelease(release) : previous?.release ?? null,
    states: STATES,
    counts,
    areas,
    purpose,
    ideas,
  };
}

/** The curated list's own rules: unique ids, known shows, every word clean. */
export function curatedProblems(curated) {
  const problems = [];
  const seen = new Set();
  for (const g of curated.gaps) {
    if (seen.has(g.id)) problems.push(`${g.id}: listed twice`);
    seen.add(g.id);
    if (!/^(G\d+[a-z]?|F\d+|P\d+)$/.test(g.id)) problems.push(`${g.id}: ids are register rows (G...) or F... and P...`);
    if (g.show && !['lost', 'purpose', 'fixing'].includes(g.show)) problems.push(`${g.id}: show is lost, purpose or fixing`);
    if (/^[FP]/.test(g.id) && !g.show) problems.push(`${g.id}: an item with no register row needs a show`);
    if (!g.area || !g.text) problems.push(`${g.id}: needs an area and a text`);
    if (g.report !== undefined && !Number.isInteger(g.report)) problems.push(`${g.id}: report is a report number`);
    for (const c of g.commits || []) if (!/^(game|site|server):[0-9a-f]{7,40}$/.test(c)) problems.push(`${g.id}: commits are game:, site: or server: hashes`);
  }
  return [...problems, ...contentProblems(curated.gaps.map((g) => [g.area, g.text]))];
}

const stringify = (data) => `${JSON.stringify(data, null, 2)}\n`;

function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
  if (args.hash) {
    console.log(`any ${hash(String(args.hash).toLowerCase())}  exact ${hash(String(args.hash))}`);
    return;
  }
  const curated = JSON.parse(readFileSync(CURATED, 'utf8'));
  const problems = curatedProblems(curated);
  const previous = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : null;
  const hasRegister = existsSync(REGISTER);
  if (!hasRegister && !args.check) {
    console.error(`no register at ${REGISTER} (set GRODDLE_REGISTER); gaps.json needs it to build`);
    process.exit(1);
  }
  const data = build(curated, { register: hasRegister ? readRegister() : null, releases: hasRegister ? new Releases() : null, release: args.release || null, previous });
  problems.push(...contentProblems(data));
  if (problems.length) {
    console.error(`gaps: ${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }
  if (args.check) {
    if (!previous) {
      console.error('public/restoration/gaps.json is missing: run node tools/gaps/build-data.mjs');
      process.exit(1);
    }
    if (stringify(previous) !== stringify(data)) {
      console.error(`public/restoration/gaps.json is stale${hasRegister ? '' : ' against tools/gaps/public-gaps.json'}: run node tools/gaps/build-data.mjs`);
      process.exit(1);
    }
    console.log(`gaps.json current${hasRegister ? '' : ' (no register here: checked against public-gaps.json and the page rules only)'}`);
    return;
  }
  writeFileSync(OUT, stringify(data));
  const c = data.counts;
  console.log(`wrote public/restoration/gaps.json: ${Object.entries(c).map(([k, n]) => `${k} ${n}`).join(', ')}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
