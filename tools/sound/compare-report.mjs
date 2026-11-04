#!/usr/bin/env node
/**
 * The sound compare report: every sound key in assets/content/sound-keys.json, every
 * music theme and every street music_file key of assets/content/ambient-music.json,
 * each with what Glitch played (the original file, if one survives, and where it came
 * from), what the remake plays now (the same original, a stand-in, a synth recipe or
 * nothing), a status, and players for both. A second state (--base, a git ref) is
 * compared with the working tree, so a recovery shows what it changed; the Sounds.zip
 * verdicts (tools/sound/sounds-zip-map.json: wired, held and why) are on the rows.
 *
 *   node tools/sound/compare-report.mjs --out=<file.html> [--base=<git ref>] [--audio-base=<url>]
 *
 * The page is one self-contained file (no external scripts). Its players load
 * audio from --audio-base (default http://127.0.0.1:8797/, a tools/qa/serve.mjs
 * of public/; the page can change it), so serve public/ and open the file:
 *   node tools/qa/serve.mjs public 8797   then open <file.html> in a browser.
 * The held Sounds.zip candidates are not in public/: they are copied from the unzipped
 * zip (GLITCH_SOUNDS_ZIP, as tools/sound/install-sounds-zip.mjs) into held/ beside the
 * page, so they play from there.
 * Rerun after any recovery: it reads only the catalog, the music config and git.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GROUPS, keyState, loadSoundData, originalOf, streetMusicKeys, streetStatus, themeStatus } from './sound-model.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
const OUT = args.out;
if (!OUT || OUT === true) {
  console.error('usage: node tools/sound/compare-report.mjs --out=<file.html> [--base=<git ref>] [--audio-base=<url>]');
  process.exit(2);
}
const BASE = args.base && args.base !== true ? String(args.base) : 'main';
const AUDIO_BASE = args['audio-base'] && args['audio-base'] !== true ? String(args['audio-base']) : 'http://127.0.0.1:8797/';

const now = loadSoundData(root);
const fromGit = (path) => {
  try {
    return JSON.parse(execFileSync('git', ['show', `${BASE}:${path}`], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 }));
  } catch {
    return null;
  }
};
const before = {
  keys: fromGit('public/assets/content/sound-keys.json')?.keys || now.keys,
  music: fromGit('public/assets/content/ambient-music.json') || now.music,
};
const zipMap = existsSync(join(root, 'tools/sound/sounds-zip-map.json'))
  ? JSON.parse(readFileSync(join(root, 'tools/sound/sounds-zip-map.json'), 'utf8'))
  : { files: [], held: [], aliases: {}, aliasDoubts: {} };
const missingPath = join(root, '..', 'research/audio-hunt/missing-keys.json');
const missing = existsSync(missingPath) ? JSON.parse(readFileSync(missingPath, 'utf8')) : {};

const rows = [];
const verdictOf = new Map();
for (const f of zipMap.files) {
  // filename, note-set, batch and forum rows are wired on evidence (`why`); music_map and client-url are exact urls.
  const wired = f.why && !f.sameAs;
  const v = wired ? `wired: ${f.why}` : f.nearest ? `shipped, nearest surviving take: ${f.nearest}` : f.match === 'client-url' ? "shipped: the client's own url" : f.sameAs ? `shipped: already shipped as ${f.sameAs.split('/').pop()}` : 'shipped: exact music_map file';
  verdictOf.set(f.key, { verdict: f.nearest ? 'likely' : wired ? 'wired' : 'exact', text: v, zip: f.zip });
}
const ZIP_SRC = process.env.GLITCH_SOUNDS_ZIP
  || join(process.env.HOME || '', 'Documents/glitch-audit/research/audio-hunt/raw/sounds-zip-drive/x/Sounds');
mkdirSync(join(dirname(OUT), 'held'), { recursive: true });
for (const h of zipMap.held) {
  const src = join(ZIP_SRC, h.zip);
  let heldFile = null;
  if (existsSync(src)) {
    heldFile = `held/${h.key}${h.key === 'OPENING_SCREEN' ? '-1.6' : ''}.mp3`;
    copyFileSync(src, join(dirname(OUT), heldFile));
  }
  verdictOf.set(h.key, { verdict: 'held', text: `held: ${h.why}`, zip: h.zip, heldFile });
}
for (const [alias, target] of Object.entries(zipMap.aliases)) {
  const doubt = zipMap.aliasDoubts?.[alias];
  verdictOf.set(alias, { verdict: doubt ? 'alias-doubt' : 'alias', text: `alias of ${target}${doubt ? `; doubt: ${doubt}` : ''}` });
}

// Sound keys.
for (const key of Object.keys(now.keys).sort((a, b) => a.localeCompare(b))) {
  const row = now.keys[key];
  const after = keyState(now.keys, key);
  const was = keyState(before.keys, key);
  const orig = originalOf(now.keys, key);
  const v = verdictOf.get(key);
  rows.push({
    group: GROUPS[row.category] || row.category, kind: 'key', id: key, moment: row.moment || '',
    original: orig ? { file: orig.file, source: orig.source, note: orig.note, zip: orig.zip } : null,
    missing: orig ? null : (row.url || missing[key]?.url || (row.category === 'remake' ? 'no original (a remake-only moment)' : 'no surviving file and no known url')),
    now: after, before: was, changed: was.status !== after.status || was.file !== after.file,
    verdict: v?.verdict || '', verdictText: v?.text || '',
    heldZip: v?.verdict === 'held' ? v.zip : '',
    heldFile: v?.verdict === 'held' ? v.heldFile : null,
  });
}

// Held Sounds.zip files whose key is not catalogued (the Uralia big stars: their street's keys are lost).
for (const h of zipMap.held.filter((r) => !now.keys[r.key])) {
  const v = verdictOf.get(h.key);
  const none = { status: 'missing', label: 'nothing', file: null };
  rows.push({
    group: 'Held, no catalogued key', kind: 'key', id: h.key, moment: h.zip,
    original: null, missing: 'no key in the source plays it', now: none, before: none, changed: false,
    verdict: 'held', verdictText: v.text, heldZip: h.zip, heldFile: v.heldFile,
  });
}

// Music themes.
for (const id of Object.keys(now.music.themes)) {
  const t = now.music.themes[id];
  const after = themeStatus(now.music, now.keys, id);
  const was = themeStatus(before.music, before.keys, id);
  const originals = (t.gsjsKeys || []).map((k) => ({ key: k, file: originalOf(now.keys, k)?.file || null, url: now.keys[k]?.url || '' }));
  rows.push({
    group: 'Music themes', kind: 'theme', id, moment: `${t.label}${t.note ? `. ${t.note}` : ''}`,
    originals, now: after, before: was, changed: JSON.stringify(was.tracks) !== JSON.stringify(after.tracks),
    hubs: Object.entries(now.music.hubMap).filter(([, th]) => th === id).map(([h]) => h),
  });
}

// Street music_file keys, as streets name them.
const streetKeys = streetMusicKeys(now.music, root);
for (const [key, e] of [...streetKeys].sort((a, b) => b[1].n - a[1].n)) {
  const orig = originalOf(now.keys, key);
  const after = streetStatus(now.music, now.keys, key, e.hubId);
  const was = streetStatus(before.music, before.keys, key, e.hubId);
  rows.push({
    group: 'Street music keys', kind: 'street', id: key, moment: `${e.n} street${e.n === 1 ? '' : 's'}, e.g. ${e.example}`,
    original: orig ? { file: orig.file, source: orig.source, note: orig.note, zip: orig.zip } : null,
    missing: orig ? null : (key === 'NO_MUSIC' ? 'no file: the street is meant to be quiet' : now.keys[key]?.url || missing[key]?.url || 'no known url'),
    now: after, before: was, changed: JSON.stringify(was.tracks) !== JSON.stringify(after.tracks) || was.status !== after.status,
    verdict: verdictOf.get(key)?.verdict || '', verdictText: verdictOf.get(key)?.text || '',
  });
}

const counts = {};
for (const r of rows) {
  counts[r.group] ||= {};
  counts[r.group][r.now.status] = (counts[r.group][r.now.status] || 0) + 1;
}
const totals = {};
for (const r of rows) totals[r.now.status] = (totals[r.now.status] || 0) + 1;
const changed = rows.filter((r) => r.changed).length;
let commit = '';
try { commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(); } catch { /* */ }
let baseCommit = '';
try { baseCommit = execFileSync('git', ['rev-parse', '--short', BASE], { cwd: root, encoding: 'utf8' }).trim(); } catch { /* */ }

const data = { generated: new Date().toISOString().slice(0, 16).replace('T', ' '), commit, base: `${BASE} (${baseCommit})`, audioBase: AUDIO_BASE, totals, counts, changed, rows };

const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Groddle Afternoon: sound compare report</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
body{font:14px/1.45 -apple-system,system-ui,sans-serif;margin:0;background:#fafaf7;color:#222}
header{padding:16px 22px;background:#fff;border-bottom:1px solid #ddd;position:sticky;top:0;z-index:2}
h1{font-size:19px;margin:0 0 4px}
.meta{color:#666;font-size:12px}
.controls{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:10px}
.controls input[type=search]{width:240px;padding:5px 8px}
.controls select,.controls input{font:inherit}
.counts{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.chip{border:1px solid #ccc;border-radius:12px;padding:2px 9px;background:#fff;cursor:pointer;font-size:12px}
.chip.on{background:#222;color:#fff;border-color:#222}
table{border-collapse:collapse;width:100%;background:#fff}
th,td{border-bottom:1px solid #eee;padding:6px 8px;vertical-align:top;text-align:left}
th{background:#f3f3ee;position:sticky;top:var(--head,150px);font-size:12px}
td.key{font-family:ui-monospace,Menlo,monospace;font-size:12px;word-break:break-all;width:170px}
.moment,.small{color:#666;font-size:12px}
.st{display:inline-block;border-radius:4px;padding:1px 6px;font-size:12px;font-weight:600}
.st-original{background:#d9f2dc;color:#145c1e}.st-stand-in{background:#fdf0c9;color:#6b4d00}.st-mixed{background:#fde5c9;color:#6b3a00}
.st-synth{background:#e3e6fb;color:#2a347a}.st-silent{background:#eee;color:#555}.st-missing{background:#f8d9d9;color:#7a1c1c}
.chg{background:#fff7d6}
.verdict{font-size:12px;margin-top:4px}
.v-wired,.v-exact{color:#145c1e}.v-held{color:#7a1c1c}.v-likely,.v-alias-doubt{color:#6b4d00}
audio{height:28px;width:220px;display:block;margin:2px 0}
.trk{font-size:11px;color:#555;font-family:ui-monospace,Menlo,monospace}
.group-row td{background:#f0efe8;font-weight:700}
</style></head><body>
<header>
<h1>Sound compare report</h1>
<div class="meta">Built <span id="gen"></span> from <span id="commit"></span>; before = <span id="base"></span>. <span id="chgn"></span> rows changed. Audio from <input id="ab" size="28"> (serve public/ with tools/qa/serve.mjs).</div>
<div class="controls">
<input type="search" id="q" placeholder="Search keys, moments, files">
<select id="grp"><option value="">All groups</option></select>
<select id="st"><option value="">Every status now</option></select>
<select id="vd"><option value="">Any Sounds.zip verdict</option><option value="any">Has a verdict</option><option>wired</option><option>held</option><option>likely</option><option>exact</option><option>alias</option><option>alias-doubt</option></select>
<label><input type="checkbox" id="chg"> Changed on this branch only</label>
<span class="small" id="shown"></span>
</div>
<div class="counts" id="counts"></div>
</header>
<table><thead><tr><th>Key</th><th>What Glitch played</th><th>Before</th><th>Now</th><th>Sounds.zip verdict</th></tr></thead><tbody id="rows"></tbody></table>
<script>
const DATA = ${JSON.stringify(data).replace(/</g, '\\u003c')};
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
let base = localStorage.getItem('soundCompareBase') || DATA.audioBase;
$('ab').value = base;
$('ab').onchange = () => { base = $('ab').value.replace(/\\/?$/, '/'); localStorage.setItem('soundCompareBase', base); render(); };
$('gen').textContent = DATA.generated; $('commit').textContent = DATA.commit; $('base').textContent = DATA.base; $('chgn').textContent = DATA.changed;
const groups = [...new Set(DATA.rows.map((r) => r.group))];
for (const g of groups) $('grp').insertAdjacentHTML('beforeend', '<option>' + esc(g) + '</option>');
for (const s of Object.keys(DATA.totals)) $('st').insertAdjacentHTML('beforeend', '<option>' + esc(s) + '</option>');
$('counts').innerHTML = Object.entries(DATA.totals).map(([s, n]) => '<span class="chip" data-s="' + esc(s) + '"><span class="st st-' + esc(s) + '">' + esc(s) + '</span> ' + n + '</span>').join('')
  + groups.map((g) => '<span class="chip" data-g="' + esc(g) + '">' + esc(g) + ': ' + Object.entries(DATA.counts[g]).map(([s, n]) => s + ' ' + n).join(', ') + '</span>').join('');
$('counts').onclick = (e) => { const c = e.target.closest('.chip'); if (!c) return; if (c.dataset.s) $('st').value = $('st').value === c.dataset.s ? '' : c.dataset.s; if (c.dataset.g) $('grp').value = $('grp').value === c.dataset.g ? '' : c.dataset.g; render(); };
const player = (file) => file ? '<audio controls preload="none" src="' + esc((file.startsWith('held/') ? '' : base) + file) + '"></audio><div class="trk">' + esc(file.split('/').pop()) + '</div>' : '';
const players = (tracks) => tracks.map(player).join('');
function cellOriginal(r) {
  if (r.kind === 'theme') return r.originals.map((o) => o.file ? player(o.file).replace('<div class="trk">', '<div class="trk">' + esc(o.key) + ': ') : '<div class="trk">' + esc(o.key) + ': missing ' + esc(o.url) + '</div>').join('');
  if (r.original) return player(r.original.file) + '<div class="small">' + esc(r.original.source) + (r.original.zip ? ': ' + esc(r.original.zip) : '') + (r.original.note ? '. ' + esc(r.original.note) : '') + '</div>' + heldCell(r);
  return '<span class="st st-missing">missing</span><div class="small">' + esc(r.missing) + '</div>' + heldCell(r);
}
function heldCell(r) {
  return r.heldZip ? '<div class="small">Held candidate, not shipped: ' + esc(r.heldZip) + '</div>' + player(r.heldFile) : '';
}
function cellState(s, r) {
  const files = s.tracks ? s.tracks : (s.file ? [s.file] : []);
  const same = r.original && files.length === 1 && files[0] === r.original.file;
  return '<span class="st st-' + esc(s.status) + '">' + esc(s.status) + '</span> <span class="small">' + esc(s.label) + '</span>' + (same ? '' : players(files));
}
function render() {
  const q = $('q').value.toLowerCase(), g = $('grp').value, st = $('st').value, vd = $('vd').value, chg = $('chg').checked;
  const list = DATA.rows.filter((r) => (!g || r.group === g) && (!st || r.now.status === st) && (!chg || r.changed)
    && (!vd || (vd === 'any' ? r.verdict : r.verdict === vd))
    && (!q || (r.id + ' ' + r.moment + ' ' + JSON.stringify(r.now) + ' ' + (r.verdictText || '') + ' ' + JSON.stringify(r.original || r.originals || '')).toLowerCase().includes(q)));
  let html = '', last = '';
  for (const r of list.slice(0, 1500)) {
    if (r.group !== last) { html += '<tr class="group-row"><td colspan="5">' + esc(r.group) + '</td></tr>'; last = r.group; }
    html += '<tr class="' + (r.changed ? 'chg' : '') + '"><td class="key">' + esc(r.id) + (r.changed ? '<div class="small">changed</div>' : '') + '<div class="moment">' + esc(r.moment) + (r.hubs && r.hubs.length ? ' Hubs ' + esc(r.hubs.join(', ')) + '.' : '') + '</div></td>'
      + '<td>' + cellOriginal(r) + '</td><td>' + (r.changed ? cellState(r.before, r) : '<span class="small">same</span>') + '</td><td>' + cellState(r.now, r) + '</td>'
      + '<td>' + (r.verdict ? '<div class="verdict v-' + esc(r.verdict) + '">' + esc(r.verdictText) + '</div>' : '') + '</td></tr>';
  }
  $('rows').innerHTML = html;
  $('shown').textContent = list.length + ' of ' + DATA.rows.length + ' rows';
  document.documentElement.style.setProperty('--head', document.querySelector('header').offsetHeight + 'px');
}
for (const id of ['q', 'grp', 'st', 'vd', 'chg']) $(id).addEventListener('input', render);
render();
</script></body></html>
`;
if (/—/.test(html)) throw new Error('the page has an em dash');
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, html);
console.log(`${rows.length} rows (${changed} changed vs ${BASE}) -> ${OUT}`);
console.log(JSON.stringify(totals));
