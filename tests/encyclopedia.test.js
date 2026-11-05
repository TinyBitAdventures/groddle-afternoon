/**
 * The Groddle Encyclopedia (tools/encyclopedia/build.mjs -> public/encyclopedia/,
 * spec docs/encyclopedia.md): a page for every entry the inventory keeps and
 * none other, statuses from the inventory, every link resolving, each cross
 * link shown both ways (item pages included), the shared header, our words free
 * of em dashes, and the built files current.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { INVENTORY_DB } from '../tools/catalog/build.mjs';
import { BUILT_SECTIONS, loadEncyclopedia, readInventoryAll } from '../tools/encyclopedia/data.mjs';
import { pathOf } from '../tools/encyclopedia/parts.mjs';
import { servedByMinn } from './minn-served.js';

const spike = join(import.meta.dirname, '..');
const pub = join(spike, 'public');
const dir = join(pub, 'encyclopedia');
const skipWithoutInventory = existsSync(INVENTORY_DB) ? false : `needs the coverage inventory at ${INVENTORY_DB}`;
const d = skipWithoutInventory ? null : await loadEncyclopedia();
const search = JSON.parse(readFileSync(join(dir, 'search.json'), 'utf8'));
const read = (rel) => readFileSync(join(pub, rel), 'utf8');
const pageOf = (key) => `${pathOf(key)}index.html`;

describe('encyclopedia', () => {
  it('has a page for every entry and no other', { skip: skipWithoutInventory }, () => {
    for (const sec of BUILT_SECTIONS) {
      const want = [...d.entries.values()].filter((e) => e.section === sec).map((e) => e.id).sort();
      assert.ok(want.length > 10, `${sec}: only ${want.length}`);
      // Music and sounds keeps its Still missing list beside the entries.
      const have = readdirSync(join(dir, sec), { withFileTypes: true }).filter((x) => x.isDirectory() && !(sec === 'sounds' && x.name === 'still-missing')).map((x) => x.name).sort();
      assert.deepEqual(have, want, sec);
    }
    for (const name of readdirSync(dir, { withFileTypes: true }).filter((x) => x.isDirectory()).map((x) => x.name)) {
      // items/ is the Item catalog's (tools/catalog/build.mjs, tests/catalog.test.js).
      assert.ok(BUILT_SECTIONS.includes(name) || name === 'items', `stray section ${name}`);
    }
  });

  it('lists every quest, skill and achievement the inventory keeps, with its status', { skip: skipWithoutInventory }, () => {
    const inv = readInventoryAll();
    const kinds = { quests: 'quest', skills: 'skill', achievements: 'achievement' };
    for (const [sec, kind] of Object.entries(kinds)) {
      if (!BUILT_SECTIONS.includes(sec)) continue;
      const kept = [...inv[kind]].filter(([, r]) => r.status !== 'excluded').map(([id]) => id);
      const built = [...d.entries.values()].filter((e) => e.section === sec);
      // Every kept row with Tiny Speck's data behind it (quests.json, skills.json, achievements.json) is listed.
      assert.ok(built.length >= kept.length - 12, `${sec}: ${built.length} of ${kept.length}`);
      for (const e of built) {
        assert.equal(e.status, inv[kind].get(e.id).status, e.key);
        assert.match(read(pageOf(e.key)), new RegExp(`<span class="pill st-${e.status}">`), e.key);
      }
    }
    for (const e of [...d.entries.values()].filter((x) => x.section === 'animals' || x.section === 'people')) {
      const r = inv.npc.get(e.id) || inv.item.get(e.id);
      if (r) assert.equal(e.status, r.status, e.key);
    }
  });

  it('answers the stuck-player questions on a quest page: how to get it, steps, where, rewards', { skip: skipWithoutInventory }, () => {
    const html = read('encyclopedia/quests/animalkinship_nibble_meat/index.html');
    if (BUILT_SECTIONS.includes('skills')) assert.match(html, /Offered when you learn <a href="\.\.\/\.\.\/\.\.\/encyclopedia\/skills\/animalkinship_3\/">Animal Kinship III<\/a>\./);
    else assert.match(html, /Offered when you learn /);
    assert.match(html, /<ol class="ency-steps"><li><p class="ency-step-title">Collect Meat<\/p>/);
    assert.match(html, /href="\.\.\/\.\.\/\.\.\/encyclopedia\/items\/meat\/"><span class="ency-tile-pic">[\s\S]*?<span class="ency-n">×13<\/span>/);
    assert.match(html, /within 4 h: a countdown runs/);
    assert.match(html, /Hand it in to your Magic Rock/);
    assert.match(html, /175 iMG[\s\S]*120 currants[\s\S]*15 favor with Humbaba/);
    // Tiny Speck's own words, with their item links pointing at our pages.
    assert.match(html, /<a href="\.\.\/\.\.\/\.\.\/encyclopedia\/animals\/npc_piggy\/">Piggies<\/a> are smarter than dogs you know\./);
  });

  it('resolves every link and picture on every page, anchors included', () => {
    const files = [];
    const walk = (rel) => {
      for (const x of readdirSync(join(pub, rel), { withFileTypes: true })) {
        if (x.isDirectory()) walk(`${rel}/${x.name}`);
        else if (x.name.endsWith('.html')) files.push(`${rel}/${x.name}`);
      }
    };
    walk('encyclopedia');
    assert.ok(files.length > (d ? d.entries.size : 200), `${files.length} pages`);
    const ids = new Map();
    for (const file of files) {
      const html = read(file);
      for (const [, href] of html.matchAll(/ (?:href|src|data-icon)="([^"]+)"/g)) {
        if (/^(?:https?|mailto):/.test(href) || servedByMinn(href)) continue;
        const [path, hash] = href.replace(/\?[^#]*/, '').split('#');
        const target = resolve(pub, file, '..', path);
        const f = path.endsWith('/') || path === '' ? join(target, 'index.html') : target;
        assert.ok(existsSync(f), `${file}: ${href}`);
        if (hash) {
          if (!ids.has(f)) ids.set(f, new Set([...readFileSync(f, 'utf8').matchAll(/ id="([^"]+)"/g)].map((m) => m[1])));
          assert.ok(ids.get(f).has(hash), `${file}: ${href}`);
        }
      }
    }
  });

  it('shows each cross link both ways, item pages included', { skip: skipWithoutInventory }, () => {
    // The relations each page draws a way back for (the rest are one-way by design: a creature naming an item in its description, a store's stock, a skill's recipes).
    const SHOWN = {
      quests: null, // every relation of a quest
      animals: ['gives', 'skill'],
      people: ['gives', 'skill'],
      skills: ['needs-skill', 'after'],
      achievements: ['counts', 'rewards'],
      places: ['lives'],
      sounds: null, // every relation of a sound: its item, creature, person, quest and place pages list it
      // The sections of tools/encyclopedia/sections.mjs: a card's page lists the cards that need it, a buff what comes after it,
      // a Feat the others of its epic, a shrine its Giant;
      // their links to items, skills, quests and achievements are one-way until those pages read them back.
      imagination: ['needs-card'],
      recipes: [],
      buffs: ['after'],
      giants: ['shrine'],
    };
    let checked = 0;
    const cache = new Map();
    const page = (key) => { if (!cache.has(key)) cache.set(key, read(pageOf(key))); return cache.get(key); };
    for (const e of d.entries.values()) {
      for (const r of e.refs) {
        if (SHOWN[e.section] && !SHOWN[e.section].includes(r.rel)) continue;
        if (r.to.startsWith('item:') && !existsSync(join(pub, pageOf(r.to)))) continue;
        if (r.to.startsWith('people:vendor-') && r.rel === 'lives') continue;
        const back = `/${pathOf(e.key)}"`;
        assert.ok(page(r.to).includes(back), `${r.to} does not link back to ${e.key} (${r.rel})`);
        checked += 1;
      }
    }
    assert.ok(checked > 500, `only ${checked} links checked`);
  });

  it('searches every entry of every section, items included', { skip: skipWithoutInventory }, () => {
    const keys = new Set(search.entries.map((x) => `${x.s}:${x.id}`));
    for (const e of d.entries.values()) assert.ok(keys.has(e.key), e.key);
    for (const id of d.items.keys()) assert.ok(keys.has(`items:${id}`), id);
    for (const x of search.entries) assert.ok(existsSync(join(pub, x.h, 'index.html')), x.h);
  });

  it('carries the site header, the theme script and the shared catalog styles', () => {
    for (const rel of ['encyclopedia/index.html', ...BUILT_SECTIONS.map((s) => `encyclopedia/${s}/index.html`)]) {
      const html = read(rel);
      const p = '../'.repeat(rel.split('/').length - 1);
      assert.ok(html.includes('<nav class="site-nav"'), rel);
      assert.ok(html.includes(`<script src="${p}site/theme.js"></script>`), rel);
      assert.ok(html.includes(`<link rel="stylesheet" href="${p}encyclopedia/items/catalog.css`), rel);
      assert.match(html, /<a href="[./]*encyclopedia\/items\/" aria-current="page">Items<\/a>/, rel);
    }
  });

  it('writes no em dashes in its own words', () => {
    for (const f of ['tools/encyclopedia/build.mjs', 'tools/encyclopedia/data.mjs', 'tools/encyclopedia/parts.mjs', 'tools/encyclopedia/sounds.mjs', 'tools/encyclopedia/sections.mjs', 'tools/encyclopedia/imagination.mjs', 'tools/encyclopedia/recipes.mjs', 'tools/encyclopedia/buffs.mjs', 'tools/encyclopedia/giants.mjs', 'public/encyclopedia/sections.css', 'tools/sound/sound-model.mjs', 'public/encyclopedia/encyclopedia.js', 'public/encyclopedia/items/combobox.js', 'docs/encyclopedia.md']) {
      assert.ok(!readFileSync(join(spike, f), 'utf8').includes('—'), f);
    }
    assert.ok(!read('encyclopedia/index.html').includes('—'));
  });

  it('draws the Category, Sold by and section filters as the themed combobox over their selects', () => {
    const items = read('encyclopedia/items/index.html');
    assert.match(items, /<select id="cat">[\s\S]*data-icon="\.\.\/\.\.\/assets\/sprites\/icons\/[a-z0-9_]+\.png"/);
    if (BUILT_SECTIONS.includes('people')) assert.match(items, /<select id="sold">[\s\S]*<option value="produce" data-icon="\.\.\/\.\.\/assets\/sprites\/icons\/street_spirit\.png">Produce Vendor \(\d+\)<\/option>/);
    const js = readFileSync(join(dir, 'items', 'catalog.js'), 'utf8');
    assert.match(js, /combobox\(cat\);\n\s*combobox\(sold\);/);
    const cbx = readFileSync(join(dir, 'items', 'combobox.js'), 'utf8');
    for (const want of ['role="combobox"', 'role="listbox"', 'role="option"', 'aria-activedescendant', "'ArrowDown'", "'ArrowUp'", "'Home'", "'End'", "'Enter'", "'Escape'", "dispatchEvent(new Event('change'"]) {
      assert.ok(cbx.includes(want), `combobox.js: ${want}`);
    }
    if (BUILT_SECTIONS.includes('quests')) assert.match(read('encyclopedia/quests/index.html'), /<select id="grp" data-group>/);
  });

  it('is current (node tools/encyclopedia/build.mjs --check)', { skip: skipWithoutInventory }, () => {
    const run = spawnSync(process.execPath, [join(spike, 'tools/encyclopedia/build.mjs'), '--check'], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr || run.stdout);
  });
});
