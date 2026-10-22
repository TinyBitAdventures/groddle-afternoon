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

import { STATUS_KEYS, FROM_RESTORATION, oursCell, oursNumbers } from '../public/compare/compare-data.js';
import { STATUS as RESTORATION_STATUS } from '../tools/restoration/checklist.mjs';

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
    assert.equal(oursCell(players, restoration).status, 'no', 'chat is single-player by design');
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
    for (const ref of refs) {
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
    for (const m of html.matchAll(/<img[^>]+src="([^"]+)"/g)) assert.ok(m[1].startsWith('../assets/'), m[1]);
    assert.ok(!/<img[^>]+src="https?:/.test(html));
  });

  it('the matrix is an accessible table', () => {
    assert.match(html, /<table class="matrix"[^>]*>\s*<caption/);
    assert.match(html, /<thead><\/thead>/);
    assert.match(html, /role="region"[^>]*aria-labelledby="matrix-caption"|aria-labelledby="matrix-caption"[^>]*role="region"/);
  });
});
