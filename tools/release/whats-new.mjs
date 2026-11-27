#!/usr/bin/env node
/**
 * What's new (#745): public/play/whats-new.json, the few player-facing lines per release the loading
 * card shows after an update (js/whats-new.js). The lines start from the release notes draft
 * (tools/release/notes.mjs, the same Emoji-Log subjects tools/release/status.mjs --notes prints).
 *
 *   node tools/release/whats-new.mjs                    print the draft for the next release, write nothing
 *   node tools/release/whats-new.mjs --release=vX.Y.Z   add the release's entry (today's date, the first
 *                                                       MAX_LINES drafted lines, NEW first) and print it;
 *                                                       then trim it in the file to what players will
 *                                                       notice most, in short plain words, and rerun
 *                                                       tools/data-versions/build.mjs
 *   node tools/release/whats-new.mjs --check            exit 1 when the file is malformed or behind the
 *                                                       newest tag (tests/whats-new.test.js runs it)
 *
 * --release refuses a version the file already has (a hand-trimmed entry is not overwritten) unless
 * --force. --date=YYYY-MM-DD sets the date. The file keeps the newest KEEP_RELEASES releases.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAME_DIR } from '../repos.mjs';
import { forNotes, lastTag, nextVersion, noteText, since } from './notes.mjs';
import {
  KEEP_RELEASES, MAX_LINE, MAX_LINES, WHATS_NEW_FORMAT, WHATS_NEW_PATH, compareVersions, validateWhatsNew,
} from '../../public/js/whats-new.js?v=d6a97a9a';

export const FILE = join(GAME_DIR, 'public', WHATS_NEW_PATH);

const ABOUT = 'What the loading card shows after an update (#745): per release, newest first, up to five short player-facing lines. Written by tools/release/whats-new.mjs.';

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

export function readFile(file = FILE) {
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { format: WHATS_NEW_FORMAT, about: ABOUT, releases: [] };
}

export const formatFile = (data) => `${JSON.stringify(data, null, 2)}\n`;

/**
 * The problems with the file at `file` ([] when fine): its shape (validateWhatsNew), and its newest
 * release older than the newest vX.Y.Z tag at HEAD (a release that forgot its lines).
 */
export function checkFile(file = FILE, dir = GAME_DIR) {
  if (!existsSync(file)) return [`${WHATS_NEW_PATH} is missing`];
  let data;
  try {
    data = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    return [`${WHATS_NEW_PATH}: ${err.message}`];
  }
  const out = validateWhatsNew(data);
  const tag = lastTag(dir, 'HEAD');
  const newest = data?.releases?.[0]?.version;
  if (tag && newest && compareVersions(newest, tag) < 0) out.push(`newest entry ${newest} is behind the tag ${tag}: run node tools/release/whats-new.mjs --release=${tag}`);
  return out;
}

/** Adds (or with force replaces) a release's entry; returns the new file data. */
export function withRelease(data, { version, date, lines, force = false }) {
  const releases = Array.isArray(data.releases) ? data.releases.filter((r) => r.version !== version) : [];
  if (!force && releases.length !== (data.releases || []).length) throw new Error(`${version} is in ${WHATS_NEW_PATH} already (--force replaces it)`);
  releases.push({ version, date, lines: lines.slice(0, MAX_LINES) });
  releases.sort((a, b) => compareVersions(b.version, a.version));
  return { format: WHATS_NEW_FORMAT, about: data.about || ABOUT, releases: releases.slice(0, KEEP_RELEASES) };
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
    console.log(`whats-new: ${WHATS_NEW_PATH} ok (${readFile().releases.length} releases)`);
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
  writeFileSync(FILE, formatFile(next));
  console.log(`whats-new: wrote ${version} (${date}) to ${WHATS_NEW_PATH}:`);
  for (const l of next.releases.find((r) => r.version === version).lines) console.log(`  - ${l}`);
  console.log(`Trim these to the ${MAX_LINES} players will notice most (short, plain words, at most ${MAX_LINE} characters), then --check and node tools/data-versions/build.mjs.`);
  const problems = checkFile();
  for (const p of problems) console.log(`  still to fix: ${p}`);
}
