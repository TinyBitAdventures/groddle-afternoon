/**
 * The encyclopedia's Feats and street projects (tools/encyclopedia/feats.mjs):
 * a page for every production Feat and every playable street project phase
 * (and the group halls'), each with the status the game gives it (solo,
 * online only or not yet), its goals and rewards linked to their item pages,
 * the streets that offer a project linked to their place on a region page,
 * and every page in the search.
 *
 * Run: node --test tests/encyclopedia-feats.test.js
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { INVENTORY_DB } from '../tools/catalog/build.mjs';
import { SOLO_FEATS } from '../public/js/solo-feats.js?v=40f8c7b5';
import { mpGoals } from '../public/js/feats-mp.js?v=b5e2f816';
import { soloNeed } from '../public/js/street-jobs.js?v=68562ef0';
import { denied, pageText } from './player-copy-dev-refs.js';
import { servedByMinn } from './minn-served.js';

const spike = join(import.meta.dirname, '..');
const pub = join(spike, 'public');
const dir = join(pub, 'encyclopedia', 'feats');
const skip = existsSync(INVENTORY_DB) && existsSync(join(dir, 'index.html')) ? false : `needs the coverage inventory at ${INVENTORY_DB} and a built encyclopedia`;
const read = (id) => readFileSync(join(dir, id, 'index.html'), 'utf8');
const jobs = JSON.parse(readFileSync(join(pub, 'assets/content/street-jobs.json'), 'utf8'));
const used = new Set(Object.values(jobs.jobs).flatMap((j) => j.phases.map((p) => p.classTsid)));
const playable = Object.entries(jobs.classes).filter(([id, c]) => !c.excluded && used.has(id)).map(([id]) => id);
const halls = Object.keys(jobs.halls.classes).filter((id) => !playable.includes(id));
const pill = (html) => /<span class="pill st-([a-z_]+)">/.exec(html)?.[1];

/** Every link of a page that points into the build, resolved to a file and an anchor. */
function links(id) {
  const file = join(dir, id, 'index.html');
  return [...read(id).matchAll(/ href="([^"#?]+)(?:#([^"]+))?"/g)].filter(([, h]) => !/^[a-z]+:/i.test(h) && !servedByMinn(h)).map(([, h, hash]) => {
    const target = resolve(file, '..', h);
    return { href: h, hash, file: h.endsWith('/') ? join(target, 'index.html') : target };
  });
}

describe('encyclopedia: Feats and street projects', { skip }, () => {
  it('has a page for every production Feat, playable project phase and group hall phase, and no other', () => {
    const have = readdirSync(dir, { withFileTypes: true }).filter((x) => x.isDirectory()).map((x) => x.name).sort();
    const want = [...SOLO_FEATS.map((f) => f.id), ...playable, ...halls].sort();
    assert.deepEqual(have, want);
    assert.equal(SOLO_FEATS.length, 15);
    assert.ok(playable.length > 80, `${playable.length} project phases`);
  });

  it('marks each Feat solo, online only or not in the remake, and gives the goals of both', () => {
    for (const f of SOLO_FEATS) {
      const html = read(f.id);
      const want = f.wired ? 'source' : f.mp ? 'multiplayer' : f.id === 'makeup_feat_1' ? 'lost' : 'missing';
      assert.equal(pill(html), want, f.id);
      if (f.wired) assert.ok(html.includes(`Goal: ${f.goal.toLocaleString('en-US')} `), `${f.id}: solo goal`);
      else assert.ok(!html.includes('id="solo-h"'), `${f.id}: no solo goal`);
      const g = mpGoals(f.id);
      if (g) assert.ok(html.includes(`a minimum of ${g.goal.toLocaleString('en-US')} `) && html.includes(`supermegabonus goal of ${g.super.toLocaleString('en-US')}`), `${f.id}: shared goals`);
      else assert.ok(!html.includes('id="online-h"'), `${f.id}: no shared goals`);
      // Tiny Speck's line, its count filled in.
      assert.ok(!html.includes('{remaining}'), f.id);
    }
    // The reasons are ours, never the code's.
    const lost = read('mihceal_conch');
    assert.match(lost, /Not in the remake\. It counted Conch tunes/);
    assert.ok(!/items\/|requires_target_pc|\.js/.test(pageText(lost)));
  });

  it('links a Feat\'s rewards to their item pages and the other Feats of its epic both ways', () => {
    const html = read('meditation_of_groddlocritus');
    for (const rock of ['petrified_rock_small', 'petrified_rock_medium', 'petrified_rock_large']) assert.ok(html.includes(`encyclopedia/items/${rock}/"`), rock);
    assert.match(html, /272 iMG/);
    const epic = SOLO_FEATS.filter((f) => f.epic_id === 4).map((f) => f.id);
    for (const a of epic) for (const b of epic) if (a !== b) assert.ok(read(a).includes(`encyclopedia/feats/${b}/"`), `${a} -> ${b}`);
  });

  it('shows a project phase\'s needs at the remake\'s amounts, with the original beside them', () => {
    for (const id of playable) {
      const html = read(id);
      assert.equal(pill(html), 'source', id);
      for (const r of jobs.classes[id].requirements) {
        if (r.type === 'item') assert.ok(html.includes(`encyclopedia/items/${r.classId}/"`), `${id}: ${r.classId}`);
        assert.ok(html.includes(`${r.num.toLocaleString('en-US')} in the original`), `${id}: ${r.id}`);
        if (r.type === 'work') assert.ok(html.includes(` ${soloNeed(r.num).toLocaleString('en-US')} time`), `${id}: ${r.id} work`);
      }
      assert.ok(!html.includes('{job_'), `${id}: a placeholder left`);
    }
    for (const id of halls) assert.equal(pill(read(id)), 'multiplayer', id);
    // Favor with one Giant links that Giant's page.
    assert.match(read('job_street_baq_01'), /href="[./]*encyclopedia\/giants\/grendaline\/"/);
  });

  it('links the streets that offer a project to their place on a region page', () => {
    let anchors = 0;
    for (const id of [...playable, ...halls]) {
      for (const l of links(id)) {
        assert.ok(existsSync(l.file), `${id}: ${l.href}`);
        if (l.hash && l.href.includes('/places/')) {
          assert.ok(readFileSync(l.file, 'utf8').includes(` id="${l.hash}"`), `${id}: ${l.href}#${l.hash}`);
          anchors += 1;
        }
      }
    }
    assert.ok(anchors > 1000, `${anchors} street links`);
  });

  it('is in the search and the section list, and cites no code in its text', () => {
    const search = JSON.parse(readFileSync(join(pub, 'encyclopedia', 'search.json'), 'utf8'));
    assert.ok(search.sections.some((s) => s.key === 'feats'));
    const rows = new Set(search.entries.filter((e) => e.s === 'feats').map((e) => e.id));
    for (const id of [...SOLO_FEATS.map((f) => f.id), ...playable, ...halls]) assert.ok(rows.has(id), id);
    const index = readFileSync(join(dir, 'index.html'), 'utf8');
    for (const g of ['Feats', 'Street project phases', 'Group halls']) assert.ok(index.includes(`data-group="${g}"`), g);
    const bad = [];
    for (const id of readdirSync(dir).filter((x) => existsSync(join(dir, x, 'index.html')))) {
      for (const line of pageText(read(id)).split('\n')) { const d = denied(line); if (d) bad.push(`${id}: ${d.rule} ${d.match}`); }
    }
    assert.deepEqual(bad, []);
    assert.ok(!readFileSync(join(spike, 'tools/encyclopedia/feats.mjs'), 'utf8').includes('—'));
  });
});
