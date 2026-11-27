#!/usr/bin/env node
/**
 * What's new (#745): the few player-facing lines per release that the loading card shows after an
 * update and the What's new window shows from the Menu (js/whats-new.js, js/ui/whats-new-window.js).
 * Two files, the same format: public/play/whats-new-all.json holds every release since v0.1.0 (the
 * window's All versions list, fetched only when it opens) and public/play/whats-new.json its newest
 * KEEP_RELEASES (read on every load). This tool writes both from the first. The lines start from
 * the release notes draft (tools/release/notes.mjs, the same Emoji-Log subjects tools/release/status.mjs
 * --notes prints).
 *
 *   node tools/release/whats-new.mjs                    print the draft for the next release, write nothing
 *   node tools/release/whats-new.mjs --release=vX.Y.Z   add the release's entry (today's date, the first
 *                                                       MAX_LINES drafted lines, NEW first) and print it;
 *                                                       then trim it in whats-new-all.json to what players
 *                                                       will notice most, in short plain words, rerun with
 *                                                       --sync, and rerun tools/data-versions/build.mjs
 *   node tools/release/whats-new.mjs --backfill         draft an entry for every vX.Y.Z tag the file lacks
 *                                                       from its published GitHub release notes (gh release
 *                                                       view; --from=DIR reads DIR/<tag>.json saved from
 *                                                       `gh release view <tag> --json body,publishedAt,tagName`
 *                                                       instead), dated the day it was published; --print
 *                                                       shows the drafts and writes nothing. Edit the lines
 *                                                       by hand after, as for --release.
 *   node tools/release/whats-new.mjs --sync             rewrite whats-new.json from whats-new-all.json
 *   node tools/release/whats-new.mjs --check            exit 1 when a file is malformed, the two disagree,
 *                                                       a tag has no entry or the newest is behind the tag
 *                                                       (tests/whats-new.test.js runs it)
 *
 * --release and --backfill never overwrite an entry the file already has (a hand-trimmed entry stays)
 * unless --force. --date=YYYY-MM-DD sets --release's date.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAME_DIR } from '../repos.mjs';
import { forNotes, git, lastTag, nextVersion, noteText, since } from './notes.mjs';
import {
  KEEP_RELEASES, MAX_LINE, MAX_LINES, WHATS_NEW_ALL_PATH, WHATS_NEW_FORMAT, WHATS_NEW_PATH, compareVersions, validateWhatsNew,
} from '../../public/js/whats-new.js?v=c410d2ba';

export const FILE = join(GAME_DIR, 'public', WHATS_NEW_PATH);
export const ALL_FILE = join(GAME_DIR, 'public', WHATS_NEW_ALL_PATH);

const ABOUT = 'What the loading card shows after an update (#745): per release, newest first, up to five short player-facing lines. Written by tools/release/whats-new.mjs.';
const ABOUT_ALL = "Every release's few player-facing lines, newest first, for the What's new window's All versions list (#745). whats-new.json is its newest releases. Written by tools/release/whats-new.mjs.";

const ORDER = ['📦 NEW', '👌 IMPROVE', '🐛 FIX'];

/** The drafted lines for the commits since the last tag: NEW, then IMPROVE, then FIX, newest first in each. */
export function draftLines(commits) {
  const rank = (c) => ORDER.findIndex((p) => c.subject.startsWith(p));
  return commits
    .filter(forNotes)
    .map((c, i) => ({ c, i }))
    .sort((a, b) => rank(a.c) - rank(b.c) || a.i - b.i)
    .map(({ c }) => noteText(c.subject).replace(/\s*[–—]\s*/g, ', '));
}

export function readFile(file = ALL_FILE) {
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { format: WHATS_NEW_FORMAT, about: file === FILE ? ABOUT : ABOUT_ALL, releases: [] };
}

export const formatFile = (data) => `${JSON.stringify(data, null, 2)}\n`;

/** PURE: the short file (whats-new.json) from the whole history: its newest KEEP_RELEASES releases. */
export function recentOf(all) {
  return { format: WHATS_NEW_FORMAT, about: ABOUT, releases: (all?.releases || []).slice(0, KEEP_RELEASES) };
}

/** Writes the whole history and the short file from it. */
export function writeFiles(all, { file = FILE, allFile = ALL_FILE } = {}) {
  const whole = { format: WHATS_NEW_FORMAT, about: all.about || ABOUT_ALL, releases: all.releases };
  writeFileSync(allFile, formatFile(whole));
  writeFileSync(file, formatFile(recentOf(whole)));
}

/** Every vX.Y.Z tag reachable from `ref`, newest first. */
export function tagsAt(dir = GAME_DIR, ref = 'HEAD') {
  let out = '';
  try {
    out = git(dir, 'tag', '--merged', ref, '--list', 'v[0-9]*');
  } catch {
    return [];
  }
  return out.split('\n').filter((t) => /^v\d+\.\d+\.\d+$/.test(t)).sort((a, b) => compareVersions(b, a));
}

/** The words a player would not want on a highlight: the pairing line, links, developer asides. */
const NOT_FOR_PLAYERS = /pairs with|groddle-afternoon-(server|site)|\b(server|site) v\d|https?:|\/users\/|\/home\/|pull request|\bCI\b|\btests?\b/i;
/** A section a player would not read for what changed in the game. */
const DEV_SECTION = /developer|contributor|under the hood|internal/i;

/** PURE: one release-notes bullet in a highlight's words: plain, no ticket numbers, at most MAX_LINE characters. */
export function highlightOf(bullet) {
  let t = String(bullet)
    .replace(/\*\*|__|`/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\s*\((?:[^()]*#\d+[^()]*)\)/g, '')
    .replace(/\s*#\d+\b/g, '')
    .replace(/\s*[–—]\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return '';
  if (t.length > MAX_LINE) {
    // The first sentence, else the words up to a clause break, else whole words.
    const sentence = /^(.{30,}?[.!?])\s/.exec(t);
    if (sentence && sentence[1].length <= MAX_LINE) t = sentence[1];
    else {
      const head = t.slice(0, MAX_LINE);
      const cut = Math.max(head.lastIndexOf(': '), head.lastIndexOf('; '), head.lastIndexOf(', '));
      t = `${(cut >= 40 ? head.slice(0, cut) : head.slice(0, head.lastIndexOf(' '))).replace(/[,;:\s]+$/, '')}.`;
    }
  }
  if (!/[.!?)]$/.test(t)) t += '.';
  return t.length > MAX_LINE ? `${t.slice(0, t.lastIndexOf(' ', MAX_LINE - 1))}.` : t;
}

/**
 * PURE: a release's drafted highlights from its published notes (a GitHub release body): the
 * top-level bullets in order, sections for developers left out, each made a highlight.
 */
export function draftFromBody(body) {
  const out = [];
  let dev = false;
  for (const raw of String(body || '').split('\n')) {
    const heading = /^\s*(?:#{1,6}\s+(.+)|\*\*(.+?)\*\*\s*:?\s*)$/.exec(raw);
    if (heading) {
      dev = DEV_SECTION.test(heading[1] || heading[2]);
      continue;
    }
    const bullet = /^[-*] (.+)$/.exec(raw);
    if (!bullet || dev || NOT_FOR_PLAYERS.test(bullet[1])) continue;
    const line = highlightOf(bullet[1]);
    if (line && !out.includes(line)) out.push(line);
  }
  return out;
}

/** The day a release was published (YYYY-MM-DD), on the studio's clock (US Eastern). */
export function publishedDay(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** A tag's published release notes: { body, publishedAt, tagName }, from DIR/<tag>.json or gh. */
export function releaseNotes(tag, { from = '' } = {}) {
  if (from) return JSON.parse(readFileSync(join(from, `${tag}.json`), 'utf8'));
  return JSON.parse(execFileSync('gh', ['release', 'view', tag, '-R', 'TinyBitAdventures/groddle-afternoon', '--json', 'body,publishedAt,tagName'], { encoding: 'utf8' }));
}

/**
 * PURE: the history with an entry for every tag it lacks, drafted from `notesOf(tag)`; `force`
 * redrafts every tag. Returns { data, added }.
 */
export function withBackfill(data, tags, notesOf, { force = false } = {}) {
  const have = new Set((data.releases || []).map((r) => r.version));
  let next = { format: WHATS_NEW_FORMAT, about: data.about || ABOUT_ALL, releases: [...(data.releases || [])] };
  const added = [];
  for (const tag of tags) {
    if (have.has(tag) && !force) continue;
    const notes = notesOf(tag);
    const lines = draftFromBody(notes.body).slice(0, MAX_LINES);
    next = withRelease(next, { version: tag, date: publishedDay(notes.publishedAt), lines, force: true, keep: Infinity });
    added.push(tag);
  }
  return { data: next, added };
}

function parse(file, rel) {
  if (!existsSync(file)) return { problem: `${rel} is missing` };
  try {
    return { data: JSON.parse(readFileSync(file, 'utf8')) };
  } catch (err) {
    return { problem: `${rel}: ${err.message}` };
  }
}

/**
 * The problems with the two files ([] when fine): each one's shape (validateWhatsNew), the short file
 * not the newest KEEP_RELEASES of the whole history, a vX.Y.Z tag at HEAD with no entry, and the
 * newest entry older than the newest tag (a release that forgot its lines).
 */
export function checkFile(file = FILE, dir = GAME_DIR, allFile = ALL_FILE) {
  const recent = parse(file, WHATS_NEW_PATH);
  const whole = parse(allFile, WHATS_NEW_ALL_PATH);
  const out = [recent.problem, whole.problem].filter(Boolean);
  if (out.length) return out;
  out.push(...validateWhatsNew(recent.data), ...validateWhatsNew(whole.data, { all: true }).map((p) => `all: ${p}`));
  if (JSON.stringify(recent.data.releases) !== JSON.stringify(recentOf(whole.data).releases)) {
    out.push(`${WHATS_NEW_PATH} is not the newest ${KEEP_RELEASES} releases of ${WHATS_NEW_ALL_PATH}: run node tools/release/whats-new.mjs --sync`);
  }
  const have = new Set(whole.data.releases.map((r) => r?.version));
  const missing = tagsAt(dir, 'HEAD').filter((t) => !have.has(t));
  if (missing.length) out.push(`no entry for ${missing.join(', ')}: run node tools/release/whats-new.mjs --backfill`);
  const tag = lastTag(dir, 'HEAD');
  const newest = whole.data.releases[0]?.version;
  if (tag && newest && compareVersions(newest, tag) < 0) out.push(`newest entry ${newest} is behind the tag ${tag}: run node tools/release/whats-new.mjs --release=${tag}`);
  return out;
}

/** Adds (or with force replaces) a release's entry; returns the new data, at most `keep` releases. */
export function withRelease(data, { version, date, lines, force = false, keep = Infinity }) {
  const releases = Array.isArray(data.releases) ? data.releases.filter((r) => r.version !== version) : [];
  if (!force && releases.length !== (data.releases || []).length) throw new Error(`${version} is in ${WHATS_NEW_ALL_PATH} already (--force replaces it)`);
  releases.push({ version, date, lines: lines.slice(0, MAX_LINES) });
  releases.sort((a, b) => compareVersions(b.version, a.version));
  return { format: WHATS_NEW_FORMAT, about: data.about || ABOUT_ALL, releases: releases.slice(0, keep) };
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const opt = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  if (args.includes('--check')) {
    const problems = checkFile();
    for (const p of problems) console.error(`whats-new: ${p}`);
    if (problems.length) process.exit(1);
    console.log(`whats-new: ${WHATS_NEW_ALL_PATH} ok (${readFile().releases.length} releases), ${WHATS_NEW_PATH} its newest ${readFile(FILE).releases.length}`);
    process.exit(0);
  }
  if (args.includes('--sync')) {
    writeFiles(readFile());
    console.log(`whats-new: wrote ${WHATS_NEW_PATH} from ${WHATS_NEW_ALL_PATH}`);
    process.exit(0);
  }
  if (args.includes('--backfill')) {
    const from = opt('from') || '';
    const { data, added } = withBackfill(readFile(), tagsAt(), (tag) => releaseNotes(tag, { from }), { force: args.includes('--force') });
    for (const r of data.releases.filter((x) => added.includes(x.version))) {
      console.log(`${r.version} (${r.date}):`);
      for (const l of r.lines) console.log(`  - ${l}`);
    }
    if (!args.includes('--print')) writeFiles(data);
    console.log(`whats-new: ${added.length} drafted${args.includes('--print') ? ' (--print: nothing written)' : `, written to ${WHATS_NEW_ALL_PATH}; edit them to the few lines players notice most, then --sync and --check`}`);
    process.exit(0);
  }
  const tag = lastTag(GAME_DIR, 'HEAD');
  const commits = since(GAME_DIR, tag, 'HEAD');
  const lines = draftLines(commits);
  const version = opt('release') || nextVersion(tag, commits);
  if (!opt('release')) {
    console.log(`Draft for ${version} (${lines.length} player-facing commits since ${tag || 'the start'}); --release=${version} writes the first ${MAX_LINES}:`);
    for (const l of lines) console.log(`  - ${l}${l.length > MAX_LINE ? `  (${l.length} chars: shorten)` : ''}`);
    process.exit(0);
  }
  if (!/^v\d+\.\d+\.\d+$/.test(version)) {
    console.error(`whats-new: --release=${version} is not vX.Y.Z`);
    process.exit(2);
  }
  const date = opt('date') || today();
  let next;
  try {
    next = withRelease(readFile(), { version, date, lines, force: args.includes('--force') });
  } catch (err) {
    console.error(`whats-new: ${err.message}`);
    process.exit(1);
  }
  writeFiles(next);
  console.log(`whats-new: wrote ${version} (${date}) to ${WHATS_NEW_ALL_PATH} and ${WHATS_NEW_PATH}:`);
  for (const l of next.releases.find((r) => r.version === version).lines) console.log(`  - ${l}`);
  console.log(`Trim these in ${WHATS_NEW_ALL_PATH} to the ${MAX_LINES} players will notice most (short, plain words, at most ${MAX_LINE} characters), then --sync, --check and node tools/data-versions/build.mjs.`);
  const problems = checkFile();
  for (const p of problems) console.log(`  still to fix: ${p}`);
}
