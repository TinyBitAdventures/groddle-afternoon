/**
 * The sound model both the sound compare report (tools/sound/compare-report.mjs)
 * and the encyclopedia's Music and sounds section (tools/encyclopedia/sounds.mjs)
 * read: for every sound key of assets/content/sound-keys.json, every music
 * theme and every street music_file key of assets/content/ambient-music.json,
 * what Glitch played (the original file, if one survives, and where it came
 * from) and what the remake plays now (the same original, a stand-in, a synth
 * recipe or nothing).
 *
 * The functions take the catalog and the music config as arguments, so the
 * report can run them on an older state from git as well as on the working tree.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { recipeForKey } from '../../public/js/synth-sfx.js?v=9853c8e7';

const root = join(import.meta.dirname, '..', '..');

/** The catalog and the music config of the working tree. */
export function loadSoundData(base = root) {
  return {
    keys: JSON.parse(readFileSync(join(base, 'public/assets/content/sound-keys.json'), 'utf8')).keys,
    music: JSON.parse(readFileSync(join(base, 'public/assets/content/ambient-music.json'), 'utf8')),
  };
}

/** Where an original came from, by the catalog's `origin` (developer words, for the report). */
export const SOURCE = {
  'wayback-c2': 'c2.glitch.bz via the Wayback Machine',
  'sounds-zip': 'Sounds.zip (fan re-upload of the c2 files)',
  'archiveorg-sfx': 'archive.org Glitch sets',
  'overlay-fla': 'a CC0 overlay source (.fla)',
  'slack-mirror': "Slack's mirror (archive.org slack_sfx)",
  'downloads-best-fit': 'downloads page (best fit by name)',
};

/** The report's group for each catalog category. */
export const GROUPS = {
  ui: 'UI sounds', animal: 'Creatures', tool: 'Tools and verbs', making: 'Making and machines', nature: 'Trees and nature',
  item: 'Items', reward: 'Rewards', travel: 'Travel', event: 'Events and puzzles', music: 'Music keys', voice: 'Voices',
  quoin: 'Quoins', powder: 'Powders', remake: 'Remake-only (no original)', recovered: 'Recovered c2 files without a key',
  downloads: 'Downloads page',
};

/** What the catalog `keys` plays for `key`: { file, via, origin } or { file: null, recipe }. */
export function resolve(keys, key) {
  const row = keys[key];
  if (!row) return { file: null, recipe: null };
  if (row.file) return { file: row.file, via: key, origin: row.origin };
  if (row.alias && keys[row.alias]?.file) return { file: keys[row.alias].file, via: row.alias, origin: keys[row.alias].origin };
  return { file: null, recipe: recipeForKey(key, row.category) };
}

/** The original of a key, if it survives: { file, source, origin, note, zip } (an alias sharing its music_map url counts). */
export function originalOf(keys, key) {
  const row = keys[key];
  if (!row) return null;
  if (row.file) {
    const note = [row.fit && `best fit: ${row.fit}`, row.doubt].filter(Boolean).join('; ');
    return { file: row.file, source: SOURCE[row.origin] || row.origin, origin: row.origin, note, zip: row.zipFile || '', via: key };
  }
  const target = row.alias && keys[row.alias];
  if (target?.file && row.url && target.url === row.url) {
    return { file: target.file, source: `${SOURCE[target.origin] || target.origin} (same file as ${row.alias})`, origin: target.origin, note: row.doubt || '', zip: target.zipFile || '', via: row.alias };
  }
  return null;
}

/** What plays for a key now: status original | stand-in | synth | silent | missing | absent, a label and the file. */
export function keyState(keys, key) {
  const row = keys[key];
  if (!row) return { status: 'absent', label: 'not catalogued', file: null };
  const r = resolve(keys, key);
  const orig = originalOf(keys, key);
  if (row.dead) return { status: 'silent', label: 'nothing (dead in the final client)', file: null };
  if (r.file && orig && orig.file === r.file) return { status: 'original', label: 'the original', file: r.file };
  if (r.file) return { status: 'stand-in', label: `stand-in: ${r.via === key ? r.file.split('/').pop() : `${r.via}'s file`}`, file: r.file, via: r.via };
  if (r.recipe) return { status: 'synth', label: `synth: ${r.recipe}`, file: null, recipe: r.recipe };
  return { status: orig ? 'silent' : 'missing', label: 'nothing', file: null };
}

/** A music theme's state: original (every track the theme's own keys), mixed, stand-in or silent. */
export function themeStatus(music, keys, id) {
  const t = music.themes[id];
  if (!t) return { status: 'absent', label: 'no such theme', tracks: [] };
  const originals = (t.gsjsKeys || []).map((k) => originalOf(keys, k)?.file).filter(Boolean);
  const tracks = t.tracks || [];
  const own = tracks.filter((u) => originals.includes(u)).length;
  const status = !tracks.length ? 'silent' : own === tracks.length ? 'original' : own ? 'mixed' : 'stand-in';
  return { status, label: `${tracks.length} track${tracks.length === 1 ? '' : 's'}${t.order === 'library' ? ', played in order' : ', one looped per hub'}`, tracks };
}

/**
 * Every street music_file key, as the imported streets name it: key ->
 * { n, example, hubId, hubName, streets: [{ tsid, label, hubId }] }, most used
 * first; the config's streetMusic keys no imported street names come last, with n 0.
 */
export function streetMusicKeys(music, base = root) {
  const dir = join(base, 'public/assets/streets');
  const out = new Map();
  for (const name of readdirSync(dir).filter((f) => /^G[A-Z0-9]+\.json$/.test(f)).sort()) {
    const text = readFileSync(join(dir, name), 'utf8');
    if (!text.includes('"musicFile"')) continue;
    let s;
    try { s = JSON.parse(text); } catch { continue; }
    if (!s.musicFile) continue;
    const e = out.get(s.musicFile) || { n: 0, example: `${s.label} (${s.tsid})`, hubId: s.hubId, hubName: s.hubName, streets: [] };
    e.n += 1;
    e.streets.push({ tsid: s.tsid, label: s.label, hubId: s.hubId });
    out.set(s.musicFile, e);
  }
  for (const k of Object.keys(music.streetMusic || {})) if (!out.has(k)) out.set(k, { n: 0, example: 'no imported street (feature or party)', hubId: null, streets: [] });
  return new Map([...out].sort((a, b) => b[1].n - a[1].n));
}

/** What a street with music_file `key` plays: silence, its theme, or its hub's music. */
export function streetState(music, key, hubId) {
  if (key === 'NO_MUSIC') return { status: 'silent', label: 'silence (NO_MUSIC)', tracks: [] };
  const theme = music.streetMusic?.[key];
  if (theme && music.themes[theme]) return { status: 'theme', label: `theme ${theme}`, tracks: music.themes[theme].tracks, theme };
  const hubTheme = (hubId != null && music.hubMap[String(hubId)]) || music.defaultTheme;
  return { status: 'hub', label: `the hub's music (${hubTheme})`, tracks: music.themes[hubTheme]?.tracks || [], theme: hubTheme };
}

/** streetState as a status: original (it loops the key's own recording), stand-in or silent. */
export function streetStatus(music, keys, key, hubId) {
  const s = streetState(music, key, hubId);
  if (s.status === 'silent') return { ...s, status: 'silent' };
  const o = originalOf(keys, key);
  if (o && s.tracks.length === 1 && s.tracks[0] === o.file) return { ...s, status: 'original' };
  return { ...s, status: 'stand-in', label: `stand-in: ${s.label}` };
}
