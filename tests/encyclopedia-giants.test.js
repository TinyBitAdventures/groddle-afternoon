/**
 * The encyclopedia's Giants section (tools/encyclopedia/giants.mjs, Austin
 * 2026-11-05, in place of the separate /giants/ page): one page per Giant
 * with its display name, Tiny Speck's own description, the remake's shrine
 * streets, the skills it favors and its Emblem and Icon; the shrine and skill
 * pages link to it; and the old /giants/ addresses answer a 301 to the section
 * (the site repo's src/MovedPages.php).
 *
 * 2026-11-12 (Austin): each page shows the Giant's portrait, cut from Tiny Speck's CC0
 * Giants_All.ai by tools/giants/portraits.py, and the section list shows it small; the
 * retired Groddle Wiki's public/giants/data.json and its builder are gone.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { GSJS } from '../tools/catalog/build.mjs';
import { gsjsVar } from '../tools/encyclopedia/giants.mjs';
import { esc } from '../tools/encyclopedia/parts.mjs';
import { sitePath, skipWithoutSite } from '../tools/repos.mjs';

const root = join(import.meta.dirname, '..');
const pub = join(root, 'public');
const dir = join(pub, 'encyclopedia', 'giants');
const read = (rel) => readFileSync(join(pub, rel), 'utf8');
const page = (id) => read(`encyclopedia/giants/${id}/index.html`);
const IDS = ['alph', 'cosma', 'friendly', 'grendaline', 'humbaba', 'lem', 'mab', 'pot', 'spriggan', 'ti', 'zille'];
const skipWithoutGsjs = existsSync(join(GSJS, 'config_base.js')) ? false : `needs GameServerJS at ${GSJS}`;

describe('encyclopedia: Giants', () => {
  it('has a page for each of the eleven Giants, in the search and on the home page', () => {
    const have = readdirSync(dir, { withFileTypes: true }).filter((x) => x.isDirectory()).map((x) => x.name).sort();
    assert.deepEqual(have, IDS);
    const search = JSON.parse(read('encyclopedia/search.json'));
    assert.deepEqual(search.entries.filter((x) => x.s === 'giants').map((x) => x.id).sort(), IDS);
    assert.match(read('encyclopedia/index.html'), /<a class="ency-card" href="giants\/">[\s\S]*?Giants <span class="count">11<\/span>/);
  });

  it('shows the display name and Tiny Speck\'s words for each Giant', { skip: skipWithoutGsjs }, () => {
    const info = gsjsVar('config_base.js', 'giants_info');
    for (const id of IDS) {
      const html = page(id);
      assert.ok(html.includes(esc(info[id].desc)), `${id}: description`);
      assert.ok(html.includes(`Giant of ${esc(info[id].giant_of)}`), `${id}: giant of`);
      assert.ok(html.includes(`<dt>Followers</dt><dd>${esc(info[id].followers)}</dd>`), `${id}: followers`);
    }
    assert.match(page('ti'), /<h1>Tii<\/h1>/);
  });

  it('counts the remake\'s shrine streets and links their regions', () => {
    const ecology = JSON.parse(read('assets/content/street-ecology.json')).streets;
    for (const id of IDS) {
      const n = Object.values(ecology).filter((r) => r.giantId === id).length;
      assert.ok(n > 50, `${id}: ${n} shrines`);
      assert.ok(page(id).includes(`${n.toLocaleString('en-US')} streets in the remake have a shrine to`), id);
    }
    assert.match(page('lem'), /class="ency-chip ency-place" href="\.\.\/\.\.\/\.\.\/encyclopedia\/places\/[a-z-]+\/#L[A-Z0-9]+"/);
  });

  it('lists the skills each Giant favors, its Emblem and Icon, and links the shrine both ways', () => {
    const skills = JSON.parse(read('assets/content/skills.json'));
    const tii = page('ti');
    for (const s of Object.values(skills)) {
      if (s.giants?.ti?.primary && existsSync(join(pub, `encyclopedia/skills/${s.classTsid}/index.html`))) assert.ok(tii.includes(`href="../../../encyclopedia/skills/${s.classTsid}/"`), s.classTsid);
    }
    assert.match(tii, /href="\.\.\/\.\.\/\.\.\/encyclopedia\/items\/emblem_ti\/"/);
    assert.match(tii, /href="\.\.\/\.\.\/\.\.\/encyclopedia\/items\/icon_tii\/"/);
    assert.match(tii, /href="\.\.\/\.\.\/\.\.\/encyclopedia\/people\/npc_shrine_ti\/"/);
    assert.match(read('encyclopedia/people/npc_shrine_ti/index.html'), /<h3>The Giant<\/h3>[\s\S]*?href="\.\.\/\.\.\/\.\.\/encyclopedia\/giants\/ti\/"/);
    // A skill's Giants now open the Giant's own page.
    assert.match(read('encyclopedia/skills/alchemy_1/index.html'), /<a class="ency-chip" href="\.\.\/\.\.\/\.\.\/encyclopedia\/giants\/ti\/">/);
  });
});

describe('encyclopedia: the Giants\' portraits', () => {
  const portraits = join(pub, 'assets/sprites/giant-portraits');

  it('every Giant\'s page shows its portrait beside the name, with alt text', () => {
    for (const id of IDS) {
      const html = page(id);
      const hero = /<div class="cat-hero-frame ency-giant-frame"><img class="cat-hero-icon ency-giant-portrait" src="\.\.\/\.\.\/\.\.\/assets\/sprites\/giant-portraits\/([a-z]+)\.webp\?v=[0-9a-f]{8}" alt="([^"]+)"[^>]*\/><\/div>\s*<div>\s*<h1>([^<]+)<\/h1>/.exec(html);
      assert.ok(hero, `${id}: portrait hero beside the name`);
      assert.equal(hero[1], id, `${id}: its own portrait`);
      assert.equal(hero[2], `Tiny Speck’s portrait of ${hero[3]}, Giant of ${/Giant of ([^<]+)<\/p>/.exec(html)[1]}`, `${id}: alt`);
      assert.ok(existsSync(join(portraits, `${id}.webp`)), `${id}: file`);
      assert.match(html, /The portrait is Tiny Speck’s own painting of /, `${id}: source line`);
    }
  });

  it('the section list shows each portrait small, and the Icon stays the picture in search', () => {
    const index = read('encyclopedia/giants/index.html');
    assert.match(index, /href="\.\.\/\.\.\/encyclopedia\/sections\.css"/);
    for (const id of IDS) {
      assert.match(index, new RegExp(`<a class="ency-tile ency-tile-portrait" href="\\.\\./\\.\\./encyclopedia/giants/${id}/"><span class="ency-tile-pic"><img class="ency-ic" src="\\.\\./\\.\\./assets/sprites/giant-portraits/${id}\\.webp\\?v=[0-9a-f]{8}" alt="" width="\\d+" height="120"`), id);
    }
    const search = JSON.parse(read('encyclopedia/search.json'));
    for (const x of search.entries.filter((e) => e.s === 'giants')) assert.match(x.ic, /^assets\/sprites\/giant-icons\/icon_[a-z]+\.webp$/, x.id);
    const css = read('encyclopedia/sections.css');
    const rules = css.slice(css.indexOf('.cat-hero-frame.ency-giant-frame'));
    assert.match(rules, /\.ency-tile-portrait \.ency-ic/);
    assert.doesNotMatch(rules, /#[0-9a-f]{3,8}\b|rgba?\(|hsl/i, 'no colours of its own: both themes come from the tokens');
  });

  it('records the portraits\' provenance: Tiny Speck\'s CC0 Giants_All.ai, each file\'s bytes', () => {
    const note = readFileSync(join(portraits, 'SOURCE.txt'), 'utf8');
    assert.match(note, /tinyspeck\/glitch-items giants\/Giants_All\.ai/);
    assert.match(note, /CC0 1\.0/);
    assert.match(note, /Cut, not drawn or\s+generated/);
    const shipped = readdirSync(portraits).filter((f) => f.endsWith('.webp')).sort();
    assert.deepEqual(shipped, IDS.map((id) => `${id}.webp`));
    for (const f of shipped) {
      const sum = createHash('sha256').update(readFileSync(join(portraits, f))).digest('hex');
      assert.ok(note.includes(`${f}  sha256 ${sum}`), `${f}: sha256 in SOURCE.txt`);
    }
    assert.match(readFileSync(join(root, 'tools/giants/portraits.py'), 'utf8'), /tools\/encyclopedia\/giants\.mjs/);
  });

  it('the retired Groddle Wiki\'s giants data is gone and nothing asks for it', () => {
    assert.ok(!existsSync(join(pub, 'giants/data.json')));
    assert.ok(!existsSync(join(root, 'tools/giants/build-data.mjs')));
    assert.ok(!read('js/data-versions.js').includes('"giants/data.json"'));
    for (const rel of ['tools/encyclopedia/giants.mjs', 'tools/giants/portraits.py', 'public/js/data-versions.js']) {
      assert.doesNotMatch(readFileSync(join(root, rel), 'utf8'), /giants\/data\.json|giants\/build-data/, rel);
    }
  });
});

const engine = process.env.MINN_ENGINE_DIR || join(homedir(), 'Cove/Sites/minn-engine.localhost/public/minn');
const skipPhp = skipWithoutSite || (!existsSync(join(engine, 'src/Minn/Autoloader.php')) && 'Minn Engine not found (set MINN_ENGINE_DIR)');

describe('the old /giants/ addresses (site src/MovedPages.php)', { skip: skipPhp }, () => {
  it('answer a 301 to the same path under /encyclopedia/giants/', () => {
    const paths = ['/giants', '/giants/', '/giants/ti/', '/giants/?x=1', '/giantsx/', '/giants/../x'];
    let out;
    try {
      out = JSON.parse(execFileSync('php', [join(root, 'tests/fixtures/moved-pages/moved-pages.php'), engine, sitePath(''), ...paths], { encoding: 'utf8' }));
    } catch (err) {
      if (err.code === 'ENOENT') return; // no php here
      throw err;
    }
    assert.equal(out['/giants']?.location, '/encyclopedia/giants/');
    assert.equal(out['/giants/']?.location, '/encyclopedia/giants/');
    assert.equal(out['/giants/ti/']?.location, '/encyclopedia/giants/ti/');
    assert.equal(out['/giants/?x=1']?.location, '/encyclopedia/giants/?x=1');
    assert.equal(out['/giantsx/'], null);
    assert.equal(out['/giants/../x'], 'miss');
  });
});
