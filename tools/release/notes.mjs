/**
 * The release notes draft, shared by tools/release/status.mjs (--notes, what a release would ship)
 * and tools/release/whats-new.mjs (#745, the few lines the loading card shows after an update):
 * the Emoji-Log subjects on main since the last vX.Y.Z tag that a player would notice.
 */
import { execFileSync } from 'node:child_process';

export const git = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim();

/** The newest vX.Y.Z tag reachable from `ref` (main by default), or null. */
export function lastTag(dir, ref = 'main') {
  try {
    return git(dir, 'describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*', ref);
  } catch {
    return null;
  }
}

/** Commits on `head` (main by default) after a ref, newest first: { hash, subject }. */
export function since(dir, ref, head = 'main') {
  const out = git(dir, 'log', '--format=%h %s', ref ? `${ref}..${head}` : head);
  return out ? out.split('\n').map((l) => ({ hash: l.slice(0, l.indexOf(' ')), subject: l.slice(l.indexOf(' ') + 1) })) : [];
}

/** Emoji-Log subjects a player would notice. */
export const forNotes = (c) => /^(📦 NEW|👌 IMPROVE|🐛 FIX):/u.test(c.subject);

/** A note's words: the subject without its Emoji-Log prefix. */
export const noteText = (subject) => String(subject).replace(/^\S+ (NEW|IMPROVE|FIX): /u, '');

/** The next version: a minor bump when anything NEW landed, else a patch. */
export function nextVersion(tag, commits) {
  const [maj, min, pat] = (tag || 'v0.0.0').slice(1).split('.').map(Number);
  return commits.some((c) => c.subject.startsWith('📦 NEW')) ? `v${maj}.${min + 1}.0` : `v${maj}.${min}.${pat + 1}`;
}
