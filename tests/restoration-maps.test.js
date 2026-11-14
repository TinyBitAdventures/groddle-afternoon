/**
 * The Maps page (/restoration/maps/, Austin 2026-11-14): tools/restoration-maps/build-data.mjs writes
 * public/restoration/maps.json from the provenance records, the site's src/RestorationMaps.php draws it,
 * tools/restoration-maps/to-minn.mjs made the page (its header menu link: tests/site-nav-maps-link.test.js).
 * Each region's "before" is Tiny Speck's own 2012 Encyclopedia map (Austin 2026-11-14, lane mapsbefore),
 * shipped from tools/provenance/encyclopedia-maps.json by path and sha256 only; nothing else from
 * research/ ships (tests/g316-provenance.test.js guards the bytes). Each pair opens in Wipe.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DIR_2012, ENCODE, MAPS_DIR, STATES, VIEW, build, files2012, isRestored, listProblems, playerWords, wordProblems } from '../tools/restoration-maps/build-data.mjs';
import { webpSize } from '../tools/made-art/build-data.mjs';
import { PATH, SLUG, TEMPLATE, mapsContent } from '../tools/restoration-maps/to-minn.mjs';
import { GAME_DIR, SITE_DIR, skipWithoutSite } from '../tools/repos.mjs';

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const maps = readJson(join(GAME_DIR, 'public/restoration/maps.json'));
const provenance = readJson(join(GAME_DIR, 'tools/provenance/repainted-maps.json'));
const encyclopedia = readJson(join(GAME_DIR, 'tools/provenance/encyclopedia-maps.json'));
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
  it('is current: maps.json and the 2012 maps match the provenance records', () => {
    execFileSync(process.execPath, [builder, '--check'], { stdio: 'pipe' });
  });

  it('lists every region in the provenance once, beside Tiny Speck\'s 2012 map of it (restored, painted and layout alike)', () => {
    assert.deepEqual(maps.regions.map((r) => r.id).sort(), Object.keys(provenance.regions).sort());
    for (const [id, r] of Object.entries(provenance.regions)) {
      const m = maps.regions.find((x) => x.id === id);
      assert.equal(m.name, r.hubName);
      assert.equal(m.after.src, `/${r.x1.file}`, id);
      assert.equal(m.after.src2, `/${r.x2.file}`, id);
      assert.equal(m.after.label, 'Now', id);
      assert.equal(m.state === 'restored', isRestored(r), id);
      const old = encyclopedia.regions[id];
      if (old) {
        assert.equal(m.before.src, `/${old.shipped.file}`, `${id} beside its 2012 map`);
        assert.equal(m.before.src2, undefined, `${id}: the 2012 map has no 2x`);
        assert.equal(m.before.label, '2012', id);
        assert.match(m.before.alt, /2012 Encyclopedia map .*roads and names/, id);
        assert.equal(sha256(readFileSync(pub(m.before.src))), old.shipped.sha256, `${id} 2012 map bytes`);
        assert.ok(m.facts.some((f) => f.label === '2012' && /Internet Archive saved it on \d+ \w+ 201[23]$/.test(f.text)), `${id} says when it was saved`);
      } else if (m.before) assert.match(m.before.src, /^\/assets\/maps\/art\/thumbs\/sm_[a-z]+\.jpg$/, `${id} beside its CC0 thumbnail`);
      // The paintings a restore replaced are no longer shown; their records stay.
      if (isRestored(r)) assert.ok(r.replaces.x1.sha256 && r.replaces.x2.sha256, `${id} keeps its replaces record`);
    }
    assert.ok(Object.keys(encyclopedia.regions).length >= 50, 'all 50 regions with a 2012 map in the regions-restore list');
    for (const s of Object.keys(STATES)) assert.equal(maps.counts[s], maps.regions.filter((r) => r.state === s).length, s);
    assert.ok(maps.counts.restored >= 4, 'Groddle Meadow, Alakol, Groddle Forest and Andra at least');
  });

  it('every picture is a file the site serves: the game\'s CC0 art, or a 2012 map the list names by path and sha256', () => {
    const srcs = [...maps.world.charts.flatMap((c) => [c.before, c.after]), ...maps.regions.flatMap((r) => [r.before, r.after, r.card])]
      .filter(Boolean).flatMap((p) => [p.src, p.src2].filter(Boolean));
    assert.ok(srcs.length > 100);
    const listed = files2012(encyclopedia);
    for (const src of srcs) {
      assert.match(src, /^\/(assets\/maps\/art\/(bg|thumbs|world)\/|restoration\/maps\/2012\/[a-z]+\.webp$)/, src);
      assert.ok(existsSync(pub(src)), src);
      if (src.startsWith(`/${DIR_2012}/`)) assert.ok(listed.has(src.slice(1)), `${src} is on the list`);
      else assert.doesNotMatch(src, /research|encyclopedia|maps_encyclopedia|2012/i, src);
    }
    // Only the listed 2012 maps sit under restoration/maps/ (the replaced paintings left on 2026-11-14).
    const kept = readdirSync(join(GAME_DIR, 'public', MAPS_DIR), { recursive: true }).map((n) => `${MAPS_DIR}/${n}`).filter((f) => !f.endsWith(DIR_2012)).sort();
    assert.deepEqual(kept, [...listed.keys()].sort());
  });

  it('the 2012 maps: only c1.glitch.bz Encyclopedia maps, each Tiny Speck\'s own pixels and size as WebP, recorded by sha256', () => {
    assert.deepEqual(listProblems(encyclopedia, provenance), []);
    assert.match(encyclopedia.policy, /Austin’s call \(2026-11-14/);
    assert.match(encyclopedia.policy, /Player snaps, videos and anything else from research\/ still never ship/);
    assert.equal(encyclopedia.encode, `cwebp ${ENCODE.filter((a) => a !== '-quiet').join(' ')} <local> -o public/<shipped.file>`);
    const sources = new Set();
    for (const [id, e] of Object.entries(encyclopedia.regions)) {
      const buf = readFileSync(pub(e.shipped.file));
      assert.equal(sha256(buf), e.shipped.sha256, id);
      assert.equal(buf.length, e.shipped.bytes, id);
      // Its own pixels and size: never upscaled (the page scales it to the painting now).
      assert.deepEqual(webpSize(buf), { w: e.w, h: e.h }, id);
      assert.deepEqual([e.shipped.w, e.shipped.h], [e.w, e.h], id);
      assert.ok(e.w === 760 && (e.h === 459 || e.h === 460), `${id}: ${e.w} x ${e.h}`);
      assert.equal(e.archived, `https://web.archive.org/web/${e.wayback}id_/${e.source}`, id);
      assert.notEqual(e.sha256, e.shipped.sha256, `${id}: re-encoded, not the saved JPEG`);
      assert.ok(!sources.has(e.sha256), `${id}: one 2012 map per region`);
      sources.add(e.sha256);
    }
  });

  it('a region with no 2012 map keeps its thumbnail (or nothing) and says so on its card', () => {
    const index = readJson(join(GAME_DIR, 'public/assets/maps/index.json'));
    const fs = { read: (f) => (existsSync(pub(f)) ? readFileSync(pub(f)) : null), exists: (f) => existsSync(pub(f)) };
    const only = { regions: Object.fromEntries(Object.entries(encyclopedia.regions).filter(([id]) => id !== '27' && id !== '40')) };
    const data = build(provenance, null, index, fs, only);
    const ix = data.regions.find((r) => r.id === '27');
    assert.equal(ix.before.src, `/${index.hubs['27'].thumbLocal}`);
    assert.match(ix.caption, /No 2012 Encyclopedia map of Ix survives, so it is shown beside that thumbnail\./);
    assert.ok(!ix.facts.some((f) => f.label === '2012'));
    const naraka = data.regions.find((r) => r.id === '40');
    assert.equal(naraka.before, null);
    assert.match(naraka.caption, /No 2012 Encyclopedia map of Naraka survives/);
    assert.deepEqual(wordProblems(data), []);
  });

  it('opens each pair in Wipe', () => {
    assert.equal(VIEW, 'wipe');
    assert.equal(maps.view, 'wipe');
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
  it('says the before pictures are Tiny Speck\'s 2012 Encyclopedia maps with the game\'s roads and names on them', () => {
    const content = mapsContent();
    assert.match(content, /The before pictures are Tiny Speck’s own 2012 Encyclopedia maps, shown as Tiny Speck made them, with the game’s roads and names on them/);
    assert.match(content, /Wipe across, flip or enlarge/);
    assert.doesNotMatch(content, /not shown|are kept out|beside the painting it replaced/);
  });

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
    const pairs = maps.regions.filter((r) => r.before).length + maps.world.charts.length;
    assert.equal((html.match(/data-maps-pair/g) || []).length, pairs, 'a pair to compare wherever there is a picture before');
    // Each pair opens in Wipe (the script starts from the mode drawn here).
    assert.equal((html.match(/data-maps-pair data-mode="wipe"/g) || []).length, pairs);
    assert.ok(html.includes('src="/restoration/maps/2012/groddlemeadow.webp"'));
    assert.ok(html.includes('alt="Tiny Speck’s 2012 Encyclopedia map of Groddle Meadow, with the game’s roads and names on it"'));
    assert.ok(html.includes('<figcaption>2012</figcaption>') && html.includes('<figcaption>Now</figcaption>'));
    // A 760 x 460 2012 map is no thumbnail: it fills its half.
    assert.doesNotMatch(draw(maps, 'painted'), /maps-fig-small/);
    const odd = structuredClone(maps);
    odd.view = 'nonsense"><b>';
    assert.match(draw(odd, 'restored'), /data-mode="wipe"/);
    odd.view = 'flip';
    assert.match(draw(odd, 'restored'), /data-mode="flip"/);
  });

  it('the script opens each pair, and the larger preview, in the mode drawn (Wipe), Flip and Side by side still there', () => {
    const js = readFileSync(join(SITE_DIR, 'restoration/maps.js'), 'utf8');
    assert.match(js, /modes: \[\['wipe', 'Wipe'\], \['flip', 'Flip'\], \['side', 'Side by side'\]\]/);
    assert.match(js, /modes: \[\['wipe', 'Wipe'\], \['flip', 'Flip'\]\]/);
    assert.match(js, /const startMode = \(pair, allowed = MODES\) => \(allowed\.includes\(pair\.dataset\.mode\) \? pair\.dataset\.mode : 'wipe'\)/);
    assert.match(js, /state = \{ mode: startMode\(pair\), pic: 'after', cut: 50 \}/);
    assert.match(js, /mode: previewMode,/);
    assert.doesNotMatch(js, /pair\.dataset\.mode = 'flip'/);
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
    bad.regions[0].before.alt = '"><script>x</script>';
    bad.regions[0].place = 'https://example.com/';
    bad.regions[0].name = '<b>x</b>';
    const out = draw(bad, 'restored');
    assert.doesNotMatch(out, /javascript:|wp-config|example\.com|<b>x<\/b>|<script/);
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
