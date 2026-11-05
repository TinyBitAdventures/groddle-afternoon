/**
 * The /compare/ page: research about other Glitch remakes must carry a source
 * and a checked date for every claim, every matrix cell must have a known
 * status, our column must come from the restoration data, and the page's
 * links must point at files that exist.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { STATUS_KEYS, FROM_RESTORATION, UNGROUPED, factText, matrixSections, oursCell, oursNumbers } from '../public/compare/compare-data.js?v=8b025e0c';
import { STATUS as RESTORATION_STATUS } from '../tools/restoration/checklist.mjs';
import { servedByMinn } from './minn-served.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'public/compare');
const data = JSON.parse(readFileSync(join(dir, 'compare.json'), 'utf8'));
const restoration = JSON.parse(readFileSync(join(root, 'public/restoration/data.json'), 'utf8'));
const html = readFileSync(join(dir, 'index.html'), 'utf8');
const DATE = /^\d{4}-\d{2}-\d{2}$/;

describe('compare research data', () => {
  it('every source has a title, a link and a checked date', () => {
    for (const [id, s] of Object.entries(data.sources)) {
      assert.ok(s.title, `${id} title`);
      assert.ok(/^https:\/\//.test(s.url) || s.url.startsWith('../'), `${id} url ${s.url}`);
      assert.match(s.checked, DATE, `${id} checked`);
    }
    assert.match(data.checked, DATE);
  });

  it('every project fact is sourced', () => {
    assert.ok(data.projects.length >= 4);
    assert.equal(data.projects.filter((p) => p.ours).length, 1);
    for (const p of data.projects) {
      for (const k of ['id', 'name', 'years', 'approach', 'summary']) assert.ok(p[k], `${p.id}.${k}`);
      assert.ok(p.badge?.label && p.badge?.tone, `${p.id} badge`);
      assert.ok(p.link?.url, `${p.id} link`);
      for (const label of ['Client', 'Server and rules', 'Platform', 'Licence and code', 'Status', 'How to play', 'Team']) {
        assert.ok(p.facts.some((f) => f.label === label), `${p.id} needs a ${label} fact`);
      }
      for (const f of p.facts) {
        assert.ok(f.sources.length, `${p.id} / ${f.label} needs a source`);
        for (const id of f.sources) assert.ok(data.sources[id], `${p.id} / ${f.label}: unknown source ${id}`);
      }
    }
  });

  it('every matrix cell has a known status, a note and real sources', () => {
    const others = data.projects.filter((p) => !p.ours);
    assert.deepEqual(Object.keys(data.statuses).sort(), [...STATUS_KEYS].sort());
    const ids = new Set();
    for (const row of data.rows) {
      assert.ok(!ids.has(row.id), `duplicate row ${row.id}`);
      ids.add(row.id);
      assert.deepEqual(Object.keys(row.cells).sort(), others.map((p) => p.id).sort(), `${row.id} columns`);
      for (const [pid, cell] of Object.entries(row.cells)) {
        assert.ok(STATUS_KEYS.includes(cell.status), `${row.id}/${pid}: ${cell.status}`);
        assert.ok(cell.note, `${row.id}/${pid} note`);
        for (const id of cell.sources) assert.ok(data.sources[id], `${row.id}/${pid}: unknown source ${id}`);
        if (cell.status !== 'unknown') assert.ok(cell.sources.length, `${row.id}/${pid}: a ${cell.status} needs a source`);
      }
    }
  });

  it('every row sits in a named section, and every section has rows', () => {
    const ids = data.groups.map((g) => g.id);
    assert.equal(new Set(ids).size, ids.length, 'unique section ids');
    for (const g of data.groups) {
      assert.ok(g.name && !g.name.includes('—'), g.id);
      assert.ok(data.rows.some((r) => r.group === g.id), `${g.id} has no rows`);
    }
    for (const row of data.rows) assert.ok(ids.includes(row.group), `${row.id}: section ${row.group}`);
    // Rows are listed in their section's order, so the file reads as the page does.
    const order = data.rows.map((r) => ids.indexOf(r.group));
    assert.deepEqual(order, [...order].sort((a, b) => a - b));
    assert.deepEqual(matrixSections(data).map((g) => g.id), ids);
  });

  it('a row with no known section still shows, under Other systems', () => {
    const copy = structuredClone(data);
    copy.rows[0].group = 'nowhere';
    const sections = matrixSections(copy);
    assert.equal(sections.at(-1).id, UNGROUPED);
    assert.equal(sections.at(-1).name, 'Other systems');
    assert.deepEqual(matrixSections({ rows: [] }), []);
  });

  it('cites exact coUserver files for the systems added on 2026-11-04, not folders', () => {
    for (const [id, s] of Object.entries(data.sources)) {
      if (s.checked !== '2026-11-04' || !s.url.includes('ChildrenOfUr/coUserver')) continue;
      assert.match(s.url, /\/blob\/master\/lib\/.+\.(dart|json)$/, id);
    }
  });

  it('archives and other efforts carry links and checked dates', () => {
    for (const r of [...data.resources, ...data.others]) {
      assert.match(r.url, /^https:\/\//, r.name);
      assert.match(r.checked, DATE, r.name);
      assert.ok(r.text, r.name);
    }
  });

  it('copy has no em-dashes', () => {
    assert.ok(!JSON.stringify(data).includes('—'), 'compare.json');
    const text = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
    assert.ok(!text.includes('—'), 'index.html');
  });
});

describe('our column', () => {
  it('maps every restoration status', () => {
    for (const s of Object.keys(RESTORATION_STATUS)) assert.ok(STATUS_KEYS.includes(FROM_RESTORATION[s]), s);
  });

  it('every row names restoration items that exist, so it reads live data', () => {
    for (const row of data.rows) {
      assert.ok(row.ours?.length, `${row.id} needs restoration items`);
      for (const id of row.ours) assert.ok(restoration.items.some((it) => it.id === id), `${row.id}: no restoration item ${id}`);
      const cell = oursCell(row, restoration);
      assert.ok(STATUS_KEYS.includes(cell.status) && cell.status !== 'unknown', `${row.id}: ${cell.status}`);
      assert.deepEqual(cell.items, row.ours);
    }
  });

  it('follows the restoration data when a status changes', () => {
    const row = data.rows.find((r) => r.id === 'mining');
    const copy = structuredClone(restoration);
    copy.items.find((it) => it.id === 'mining').status = 'missing';
    assert.equal(oursCell(row, copy).status, 'no');
    copy.items.find((it) => it.id === 'mining').status = 'solo';
    assert.equal(oursCell(row, copy).status, 'partial');
    const players = data.rows.find((r) => r.id === 'players');
    // Multiplayer has street, party, global, help, trade and group chat, buddies and blocks (G326).
    assert.equal(oursCell(players, restoration).status, 'yes', 'other players and chat are back, in multiplayer');
  });

  it('a row\'s oursCell override replaces the derived mark and leads the note', () => {
    // Rook attacks and the races run between real players by the source rules online (rook.go, races.go,
    // hoghaul.go, crowns.go), but solo still plays lighter (ROOK_SOLO, stand-in rivals): Partly (Austin 2026-11-04).
    for (const id of ['rooks', 'races']) {
      const row = data.rows.find((r) => r.id === id);
      const derived = oursCell({ ...row, oursCell: undefined }, restoration);
      assert.equal(derived.status, 'yes', `${id}: the checklist still reads yes`);
      const cell = oursCell(row, restoration);
      assert.equal(cell.status, 'partial', id);
      assert.ok(cell.override, id);
      assert.ok(cell.note.startsWith(row.oursCell.note), `${id}: the override note shows first`);
      assert.ok(cell.note.includes(derived.note), `${id}: the checklist detail follows`);
      assert.deepEqual(cell.items, row.ours);
    }
    assert.match(data.rows.find((r) => r.id === 'rooks').oursCell.note, /solo keeps lighter rules/);
    assert.match(data.rows.find((r) => r.id === 'races').oursCell.note, /stand-in rival/);
    // Rows without one still follow the checklist.
    assert.equal(oursCell(data.rows.find((r) => r.id === 'players'), restoration).override, undefined);
  });

  it('every oursCell override names a status the page knows and carries a plain note', () => {
    const overrides = data.rows.filter((r) => r.oursCell);
    assert.ok(overrides.length >= 2);
    for (const row of overrides) {
      assert.ok(STATUS_KEYS.includes(row.oursCell.status) && data.statuses[row.oursCell.status], `${row.id}: ${row.oursCell.status}`);
      assert.ok(row.oursCell.note?.trim(), `${row.id} note`);
      assert.doesNotMatch(row.oursCell.note, /—/, row.id);
      assert.deepEqual(Object.keys(row.oursCell).sort(), ['note', 'status'], row.id);
    }
    // An override with a status the page does not know is ignored, never drawn.
    const row = { ...data.rows.find((r) => r.id === 'rooks'), oursCell: { status: 'partly', note: 'x' } };
    assert.equal(oursCell(row, restoration).status, 'yes');
  });

  it('headline numbers come from data.json', () => {
    const nums = Object.fromEntries(oursNumbers(restoration).map((n) => [n.id, n]));
    assert.equal(nums.quests.num, restoration.quests.playable);
    assert.equal(nums.streets.num, restoration.streets.imported);
    assert.equal(nums.rooms.of, restoration.rooms.total);
    for (const n of Object.values(nums)) assert.ok(Number.isFinite(n.num), n.id);
  });
});

describe('compare page', () => {
  const localRefs = (source) => [...source.matchAll(/\b(?:href|src)="([^"#]+)(?:#[^"]*)?"/g)]
    .map((m) => m[1].split('?')[0])
    .filter((u) => u && !/^(https?:|mailto:|data:)/.test(u));

  it('links and assets resolve to files that exist', () => {
    const refs = localRefs(html);
    assert.ok(refs.includes('../restoration/'), 'links to the restoration report');
    assert.ok(refs.includes('compare.js') && refs.includes('compare.css') && refs.includes('../restoration/restoration.css'));
    for (const ref of refs.filter((r) => !servedByMinn(r))) {
      const target = resolve(dir, ref);
      const file = ref.endsWith('/') ? join(target, 'index.html') : target;
      assert.ok(existsSync(file), `${ref} -> ${file}`);
    }
    for (const p of data.projects.filter((p) => !/^https?:/.test(p.link.url))) {
      assert.ok(existsSync(join(resolve(dir, p.link.url), 'index.html')), p.link.url);
    }
  });

  it('the restoration report links back', () => {
    const rest = readFileSync(join(root, 'public/restoration/index.html'), 'utf8');
    assert.ok(rest.includes('href="../compare/"'));
  });

  it('hosts no other project\'s images', () => {
    for (const m of html.matchAll(/<img[^>]+src="([^"]+)"/g)) assert.ok(m[1].startsWith('../assets/') || m[1].startsWith('../favicon.svg'), m[1]);
    assert.ok(!/<img[^>]+src="https?:/.test(html));
  });

  it('our Status names the live version from the restoration data, never a typed-in one', () => {
    const ours = data.projects.find((p) => p.ours);
    const status = ours.facts.find((f) => f.label === 'Status').text;
    assert.ok(status.includes('{release}'), status);
    for (const p of data.projects.filter((x) => x.ours)) for (const f of p.facts) assert.doesNotMatch(f.text, /version \d+\.\d+/, f.label);
    const restoration = JSON.parse(readFileSync(join(root, 'public/restoration/data.json'), 'utf8'));
    assert.match(factText(status, restoration), new RegExp(`development: version ${restoration.release.game.replace(/\./g, '\\.')} came out on \\d+ [A-Z][a-z]+ \\d{4}\\. The source`));
    assert.equal(factText(status, { release: { game: '1.2.3', deployed: '2026-11-03' } }).includes('version 1.2.3 came out on 3 November 2026.'), true);
    assert.match(factText(status, null), /still in active development\. The source/);
    assert.equal(factText('No token here.', restoration), 'No token here.');
  });

  it('the page states its research date as compare.json does', () => {
    for (const id of ['checked-date', 'foot-checked']) {
      assert.match(html, new RegExp(`<time id="${id}" datetime="${data.checked}">`), id);
    }
  });

  it('the matrix is an accessible table', () => {
    assert.match(html, /<table class="matrix"[^>]*>\s*<caption/);
    assert.match(html, /<thead><\/thead>/);
    // Each section is a tbody led by a row-group header the cells' row headers sit under.
    const js = readFileSync(join(dir, 'compare.js'), 'utf8');
    assert.match(js, /el\('tbody', \{ class: 'matrix-section', 'aria-labelledby': `matrix-group-\$\{g\.id\}` \}/);
    assert.match(js, /el\('th', \{ scope: 'rowgroup', colspan: String\(projects\.length \+ 1\), id: `matrix-group-\$\{g\.id\}` \}/);
    assert.match(js, /el\('th', \{ scope: 'row' \}, row\.name\)/);
    // The section headers take their colours from tokens both themes define.
    const css = readFileSync(join(dir, 'compare.css'), 'utf8');
    const rule = css.slice(css.indexOf('.matrix .matrix-group th {'), css.indexOf('}', css.indexOf('.matrix .matrix-group th {')));
    assert.match(rule, /background: var\(--track\); color: var\(--lead\);/);
    assert.doesNotMatch(rule, /#[0-9a-f]{3,8}\b|rgba?\(/i);
    assert.match(html, /role="region"[^>]*aria-labelledby="matrix-caption"|aria-labelledby="matrix-caption"[^>]*role="region"/);
  });
});
