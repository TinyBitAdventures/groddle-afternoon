/**
 * The Maps page (/restoration/maps/, Austin 2026-11-14): tools/restoration-maps/build-data.mjs writes
 * public/restoration/maps.json from the provenance records and keeps each restored region's replaced
 * painting reachable, the site's src/RestorationMaps.php draws it, tools/restoration-maps/to-minn.mjs
 * made the page (its header menu link: tests/site-nav-maps-link.test.js). Only CC0 art ships:
 * nothing from research/ and no 2012 Encyclopedia picture.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { REPLACED_DIR, STATES, isRestored, playerWords, replacedFiles, wordProblems } from '../tools/restoration-maps/build-data.mjs';
import { PATH, SLUG, TEMPLATE, mapsContent } from '../tools/restoration-maps/to-minn.mjs';
import { GAME_DIR, SITE_DIR, skipWithoutSite } from '../tools/repos.mjs';

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const maps = readJson(join(GAME_DIR, 'public/restoration/maps.json'));
const provenance = readJson(join(GAME_DIR, 'tools/provenance/repainted-maps.json'));
const builder = join(GAME_DIR, 'tools/restoration-maps/build-data.mjs');
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const pub = (src) => join(GAME_DIR, 'public', src.replace(/^\//, ''));

let hasPhp = true;
try {
  execFileSync('php', ['-v'], { stdio: 'ignore' });
} catch {
  hasPhp = false;
}

/** Runs RestorationMaps::draw over `data` (a part, or all), returning the HTML. */
function draw(data, part = 'all') {
  const dir = mkdtempSync(join(tmpdir(), 'maps-'));
  const file = join(dir, 'in.json');
  writeFileSync(file, JSON.stringify(data));
  try {
    return execFileSync('php', ['-r', `require ${JSON.stringify(join(SITE_DIR, 'src/RestorationMaps.php'))}; echo Groddle\\Minn\\RestorationMaps::draw(json_decode(file_get_contents(${JSON.stringify(file)}), true), ${JSON.stringify(part)});`], { encoding: 'utf8' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('Maps page data (tools/restoration-maps/build-data.mjs)', () => {
  it('is current: maps.json and the kept replaced paintings match the provenance records', () => {
    execFileSync(process.execPath, [builder, '--check'], { stdio: 'pipe' });
  });

  it('lists every region in the provenance once, a restored one beside the painting it replaced', () => {
    assert.deepEqual(maps.regions.map((r) => r.id).sort(), Object.keys(provenance.regions).sort());
    for (const [id, r] of Object.entries(provenance.regions)) {
      const m = maps.regions.find((x) => x.id === id);
      assert.equal(m.name, r.hubName);
      assert.equal(m.after.src, `/${r.x1.file}`, id);
      assert.equal(m.after.src2, `/${r.x2.file}`, id);
      if (isRestored(r)) {
        assert.equal(m.state, 'restored', id);
        assert.ok(m.before.src.startsWith(`/${REPLACED_DIR}/`), `${id} keeps its replaced painting`);
        assert.equal(sha256(readFileSync(pub(m.before.src))), r.replaces.x1.sha256, `${id} replaced x1`);
        assert.equal(sha256(readFileSync(pub(m.before.src2))), r.replaces.x2.sha256, `${id} replaced x2`);
      } else {
        assert.notEqual(m.state, 'restored', id);
        if (m.before) assert.match(m.before.src, /^\/assets\/maps\/art\/thumbs\/sm_[a-z]+\.jpg$/, `${id} beside its CC0 thumbnail`);
      }
    }
    for (const s of Object.keys(STATES)) assert.equal(maps.counts[s], maps.regions.filter((r) => r.state === s).length, s);
    assert.ok(maps.counts.restored >= 4, 'Groddle Meadow, Alakol, Groddle Forest and Andra at least');
  });

  it('every picture is a file the site serves, and nothing comes from research/ or the 2012 Encyclopedia', () => {
    const srcs = [...maps.world.charts.flatMap((c) => [c.before, c.after]), ...maps.regions.flatMap((r) => [r.before, r.after, r.card])]
      .filter(Boolean).flatMap((p) => [p.src, p.src2].filter(Boolean));
    assert.ok(srcs.length > 100);
    for (const src of srcs) {
      assert.match(src, /^\/(assets\/maps\/art\/(bg|thumbs|world)\/|restoration\/maps\/replaced\/)/, src);
      assert.ok(existsSync(pub(src)), src);
      assert.doesNotMatch(src, /research|encyclopedia|maps_encyclopedia|2012/i, src);
    }
    const kept = readdirSync(join(GAME_DIR, 'public', REPLACED_DIR)).map((n) => `${REPLACED_DIR}/${n}`).sort();
    assert.deepEqual(kept, [...replacedFiles(provenance).keys()].sort(), 'only the replaced paintings the records name');
    // The 2012 picture's own sha256 (a restore's input) never ships.
    const inputs = new Set(Object.values(provenance.regions).filter(isRestored).flatMap((r) => (r.inputs || []).map((i) => i.sha256)));
    for (const n of readdirSync(join(GAME_DIR, 'public', REPLACED_DIR))) assert.ok(!inputs.has(sha256(readFileSync(join(GAME_DIR, 'public', REPLACED_DIR, n)))), n);
  });

  it('the words have no path, no @, no em-dash and no hash, and name the 2012 source in words', () => {
    assert.deepEqual(wordProblems(maps), []);
    const restored = maps.regions.find((r) => r.state === 'restored');
    assert.match(restored.caption, /2012 Encyclopedia/);
    assert.ok(playerWords(maps).length > 200);
    assert.doesNotMatch(JSON.stringify(maps), /research\/|https?:|—/);
  });

  it('links a region to its Encyclopedia place page when one is built', () => {
    const meadow = maps.regions.find((r) => r.name === 'Groddle Meadow');
    assert.equal(meadow.place, '/encyclopedia/places/groddle-meadow/');
    for (const r of maps.regions.filter((x) => x.place)) assert.ok(existsSync(join(GAME_DIR, 'public', r.place, 'index.html')), r.place);
  });
});

describe('the Maps page in Minn (tools/restoration-maps/to-minn.mjs)', () => {
  it('is a full-width child of the report, its words around the four parts, with a masthead and bands for the section menu', () => {
    assert.equal(PATH, '/restoration/maps/');
    assert.equal(SLUG, 'maps');
    assert.equal(TEMPLATE, 'page-wide');
    const content = mapsContent();
    for (const part of ['summary', 'world', 'restored', 'painted']) assert.ok(content.includes(`<!-- wp:groddle/restoration-maps {"part":"${part}"} /-->`), part);
    assert.match(content, /class="wp-block-group masthead"/);
    assert.match(content, /<p class="jump">/);
    assert.equal((content.match(/<section class="wp-block-group band/g) || []).length, 4);
    assert.doesNotMatch(content, /—/);
  });
});

describe('the Maps block (site src/RestorationMaps.php)', { skip: skipWithoutSite || (!hasPhp && 'needs php') }, () => {
  it('draws every map server-side: a card each, both pictures, the words and links, no script needed', () => {
    const html = draw(maps);
    assert.equal((html.match(/<article class="maps-card/g) || []).length, maps.regions.length + maps.world.charts.length);
    for (const r of maps.regions) {
      assert.ok(html.includes(`id="${r.anchor}"`), r.name);
      assert.ok(html.includes(`src="${r.after.src}"`), r.name);
      if (r.before) assert.ok(html.includes(`src="${r.before.src}"`), `${r.name} before`);
      if (r.place) assert.ok(html.includes(`href="${r.place}"`), `${r.name} place`);
    }
    assert.ok(html.includes('srcset="/assets/maps/art/bg/groddlemeadow.webp 1x, /assets/maps/art/bg/groddlemeadow@2x.webp 2x"'));
    assert.doesNotMatch(html, /<script/);
    assert.equal((html.match(/data-maps-pair/g) || []).length, maps.regions.filter((r) => r.before).length + maps.world.charts.length, 'a pair to compare wherever there is a picture before');
  });

  it('draws each part alone, and keeps anything but the game\'s pictures and site pages out of src and href', () => {
    assert.match(draw(maps, 'summary'), /<b>\d+<\/b> region maps and the World map/);
    assert.doesNotMatch(draw(maps, 'summary'), /maps-card/);
    assert.equal((draw(maps, 'world').match(/maps-card maps-world/g) || []).length, maps.world.charts.length);
    assert.equal((draw(maps, 'restored').match(/<article/g) || []).length, maps.counts.restored);
    assert.equal((draw(maps, 'painted').match(/<article/g) || []).length, maps.counts.painted + maps.counts.layout);
    const bad = structuredClone(maps);
    bad.regions[0].after.src = 'javascript:alert(1)';
    bad.regions[0].before.src = '/assets/../../wp-config.php';
    bad.regions[0].place = 'https://example.com/';
    bad.regions[0].name = '<b>x</b>';
    const out = draw(bad, 'restored');
    assert.doesNotMatch(out, /javascript:|wp-config|example\.com|<b>x<\/b>/);
  });

  it('is registered: block.json, minn.json and the extension', () => {
    const block = readJson(join(SITE_DIR, 'blocks/restoration-maps/block.json'));
    assert.equal(block.name, 'groddle/restoration-maps');
    assert.deepEqual(block.attributes.part.enum, ['all', 'summary', 'world', 'restored', 'painted']);
    assert.ok(readJson(join(SITE_DIR, 'minn.json')).blocks.includes('groddle/restoration-maps'));
    assert.match(readFileSync(join(SITE_DIR, 'src/Extension.php'), 'utf8'), /RestorationMaps::register\(\$minn, \$root\)/);
    assert.ok(existsSync(join(SITE_DIR, 'restoration/maps.js')));
  });
});
