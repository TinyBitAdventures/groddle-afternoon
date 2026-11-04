/**
 * Never released in Glitch (Austin 2026-11-03): Updraft, Aerial Boost and
 * Drafty Uplift stay in the game, and their tickets' encyclopedia pages say
 * Tiny Speck built them but players could never visit them. The list is
 * tools/encyclopedia/never-released.mjs; the item pages (tools/catalog/build.mjs)
 * carry the note and a "Never released" tag, and the catalog grid
 * (public/encyclopedia/items/catalog.js) tags their cards. No other page does.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { GSJS } from '../tools/catalog/build.mjs';
import {
  NEVER_RELEASED, NEVER_RELEASED_REASONS, NEVER_RELEASED_TAG, neverReleased, neverReleasedNote, neverReleasedTag,
} from '../tools/encyclopedia/never-released.mjs';
import { denied } from './player-copy-dev-refs.js';

const spike = join(import.meta.dirname, '..');
const pub = join(spike, 'public');
const ency = join(pub, 'encyclopedia');
const THREE = ['paradise_ticket_aerial_boost', 'paradise_ticket_drafty_uplift', 'paradise_ticket_updraft'];
const NOTE = NEVER_RELEASED_REASONS['paradise-course'].note;
const REMAKE = NEVER_RELEASED_REASONS['paradise-course'].remake;

/** Every built page under public/encyclopedia/. */
function pages(dir = ency, out = []) {
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, d.name);
    if (d.isDirectory()) pages(path, out);
    else if (d.name.endsWith('.html')) out.push(path);
  }
  return out;
}
const all = pages();
const pageOf = (id) => join(ency, 'items', id, 'index.html');

describe('never released in Glitch', () => {
  it('lists the three Paradise courses players could never visit, each with a reason', () => {
    assert.deepEqual(Object.keys(NEVER_RELEASED).sort(), THREE.map((id) => `item:${id}`));
    for (const [key, reason] of Object.entries(NEVER_RELEASED)) {
      assert.ok(NEVER_RELEASED_REASONS[reason], `${key}: reason ${reason}`);
      assert.equal(neverReleased(key).note, NEVER_RELEASED_REASONS[reason].note);
    }
    assert.equal(neverReleased('item:paradise_ticket_cloud_rings'), null);
    assert.equal(NEVER_RELEASED_TAG, 'Never released');
  });

  it('writes the note in plain player words: no source files, no em-dashes', () => {
    assert.equal(NOTE, 'Never released in Glitch: this course was in Tiny Speck’s code but wasn’t among the Paradise courses players could visit.');
    for (const words of Object.values(NEVER_RELEASED_REASONS).flatMap((r) => [r.note, r.remake])) {
      assert.equal(denied(words), null, words);
      assert.doesNotMatch(words, /—/);
    }
    assert.ok(!readFileSync(join(spike, 'tools/encyclopedia/never-released.mjs'), 'utf8').includes('—'));
  });

  it('puts the note, the tag and the remake line on the three ticket pages', () => {
    for (const id of THREE) {
      const page = readFileSync(pageOf(id), 'utf8');
      assert.ok(page.includes(neverReleasedNote(neverReleased(`item:${id}`))), `${id}: note`);
      assert.match(page, /<span class="pill st-unbuilt_original">Never finished<\/span> <span class="ency-unreleased">Never released<\/span>/, `${id}: tag`);
      assert.ok(page.includes(`<p class="cat-status-text">${REMAKE}</p>`), `${id}: remake line`);
      // The usual "nothing to restore" and "no way to get it" lines would contradict the kept course.
      assert.ok(!page.includes('nothing to restore'), id);
      assert.ok(!page.includes('There is no way to get it in the remake.'), id);
    }
  });

  it('puts them on no other page', () => {
    const mine = new Set(THREE.map(pageOf));
    for (const path of all) {
      if (mine.has(path)) continue;
      const page = readFileSync(path, 'utf8');
      assert.ok(!page.includes(NOTE), `${path}: note`);
      assert.ok(!page.includes(neverReleasedTag()), `${path}: tag`);
      assert.ok(!page.includes('ency-unreleased'), `${path}: tag class`);
    }
    assert.ok(all.length > 2000, `${all.length} pages`);
  });

  it('tags exactly their cards in the catalog grid', () => {
    const data = JSON.parse(readFileSync(join(ency, 'items', 'data.json'), 'utf8'));
    assert.deepEqual(data.items.filter((i) => i.nr).map((i) => i.id).sort(), THREE);
    for (const i of data.items) if (!THREE.includes(i.id)) assert.equal(i.nr, undefined, i.id);
    const grid = readFileSync(join(ency, 'items', 'catalog.js'), 'utf8');
    assert.match(grid, /item\.nr \? '<span class="ency-unreleased cat-card-tag">Never released/);
    assert.match(grid, /cat-card\$\{item\.nr \? ' cat-card-nr' : ''\}/);
    const css = readFileSync(join(ency, 'items', 'catalog.css'), 'utf8');
    for (const cls of ['.ency-unreleased {', '.ency-unreleased-note {', '.cat-card.cat-card-nr {']) assert.ok(css.includes(cls), cls);
  });
});

/*
 * The evidence in the source, so the list stays honest: GSJS defines the three
 * tickets and their courses, but nothing hands them out, and they alone have
 * no info page.
 */
describe('never released: the source agrees', { skip: !existsSync(GSJS) }, () => {
  const read = (rel) => readFileSync(join(GSJS, rel), 'utf8');
  const config = read('config_prod.js');
  const block = config.slice(config.indexOf('var paradise_locations = {'), config.indexOf('};', config.indexOf('var paradise_locations = {')));
  const courses = [...block.matchAll(/^\t(\w+): \{template_tsid/gm)].map((m) => m[1]);
  const imagination = read('inc_data_imagination.js');
  const dealt = new Set([...imagination.matchAll(/"item_tsid":"paradise_ticket_(\w+)"/g)].map((m) => m[1]));

  it('has fourteen courses, eleven of them dealt as upgrade cards', () => {
    assert.equal(courses.length, 14);
    assert.equal(dealt.size, 11);
    const undealt = courses.filter((c) => !dealt.has(c)).sort();
    assert.deepEqual(undealt.map((c) => `paradise_ticket_${c}`), THREE);
  });

  it('gives only the three tickets no info page', () => {
    for (const c of courses) {
      const id = `paradise_ticket_${c}`;
      const m = /^var has_infopage = (true|false);/m.exec(read(`items/${id}.js`));
      assert.equal(m[1], THREE.includes(id) ? 'false' : 'true', id);
    }
  });

  it('names the three tickets nowhere that could hand them out', () => {
    const named = [];
    const walk = (dir) => {
      for (const d of readdirSync(join(GSJS, dir), { withFileTypes: true })) {
        const rel = dir ? `${dir}/${d.name}` : d.name;
        if (d.isDirectory()) walk(rel);
        else if (d.name.endsWith('.js') && /paradise_ticket_(?:aerial_boost|drafty_uplift|updraft)\b/.test(readFileSync(join(GSJS, rel), 'utf8'))) named.push(rel);
      }
    };
    walk('');
    // Their own item files, the item list, the tag lists and the generic craftytasking specs; no store, drop table, quest or card.
    assert.deepEqual(named.sort(), [
      'items/catalog.js', 'items/catalog_craftytasking.js', 'items/catalog_tags.js',
      'items/paradise_ticket_aerial_boost.js', 'items/paradise_ticket_drafty_uplift.js', 'items/paradise_ticket_updraft.js',
    ]);
  });
});
