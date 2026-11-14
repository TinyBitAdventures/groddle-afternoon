/**
 * The Made for Groddle section of /restoration/: tools/made-art/build-data.mjs
 * writes public/restoration/made.json from the provenance list
 * (tools/provenance/made-sprites.json) and the curated words
 * (tools/made-art/pieces.json), the site's src/RestorationMade.php draws it,
 * and tools/made-art/to-minn.mjs adds the band to a page made before it.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { build, dateLabel, playerWords, readMore, webpSize, wordProblems } from '../tools/made-art/build-data.mjs';
import { FOOT, withMade } from '../tools/made-art/to-minn.mjs';
import { madeBand, restorationContent } from '../tools/restoration/to-minn.mjs';
import { GAME_DIR, SITE_DIR, sitePath, skipWithoutSite } from '../tools/repos.mjs';

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const made = readJson(join(GAME_DIR, 'public/restoration/made.json'));
const provenance = readJson(join(GAME_DIR, 'tools/provenance/made-sprites.json'));
const curated = readJson(join(GAME_DIR, 'tools/made-art/pieces.json'));
const builder = join(GAME_DIR, 'tools/made-art/build-data.mjs');

let hasPhp = true;
try {
  execFileSync('php', ['-v'], { stdio: 'ignore' });
} catch {
  hasPhp = false;
}
const skipPhp = skipWithoutSite || (!hasPhp && 'no php on PATH');

/** Runs RestorationMade::draw over `data`, returning the HTML. */
function draw(data) {
  const dir = mkdtempSync(join(tmpdir(), 'made-'));
  const file = join(dir, 'in.json');
  writeFileSync(file, JSON.stringify(data));
  try {
    return execFileSync('php', ['-r', `require ${JSON.stringify(join(SITE_DIR, 'src/RestorationMade.php'))}; echo Groddle\\Minn\\RestorationMade::draw(json_decode(file_get_contents(${JSON.stringify(file)}), true));`], { encoding: 'utf8' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The text a reader sees: tags gone, and every attribute but src (alt words stay). */
const visible = (html) => [...html.matchAll(/\balt="([^"]*)"/g)].map((m) => m[1]).join(' ') + ' ' + html.replace(/<[^>]*>/g, ' ');

describe('Made for Groddle data (tools/made-art/build-data.mjs)', () => {
  it('is current: made.json matches the provenance list and the curated words', () => {
    execFileSync(process.execPath, [builder, '--check'], { stdio: 'pipe' });
  });

  it('lists every piece in the provenance list once, newest first, with its date, licence and the original it comes from', () => {
    // Every made sprite that is not an experiment (the Fire Dragon stays in the builder, off the page), plus the curated region map.
    const shown = Object.entries(provenance.sprites).filter(([, p]) => p.experiment !== true).map(([id]) => id);
    assert.deepEqual(made.pieces.map((p) => p.id).filter((id) => !/^(maps?|subway|world|decos):/.test(id)).sort(), shown.sort());
    assert.ok(!made.pieces.some((p) => p.id.startsWith('npc_fire_dragon')), 'the Fire Dragon experiment is not on the page');
    const dates = made.pieces.map((p) => p.made);
    assert.deepEqual(dates, [...dates].sort().reverse());
    // 2026-11-13 leads in the curated order: the Groddle Meadow map restored from 2012, EZ Cookin's props, its room, the subway paper, the World
    // map at 2x; then the quest book (2026-11-12).
    assert.deepEqual(made.pieces.map((p) => p.id), ['map:58', 'decos:ezc', 'decos:ezc:room', 'subway:paper', 'world:2x', 'quest_book_award', 'maps:27,107,131']);
    const book = made.pieces.find((p) => p.id === 'quest_book_award');
    assert.equal(book.madeLabel, '12 November 2026');
    assert.deepEqual([book.original.src, book.original.w, book.original.h, book.original.pixelated], ['/assets/ui/quest-book.webp', 86, 58, true]);
    assert.equal(book.image.src, '/assets/ui/quest-book-solid.webp');
    // Same shape as the original, so the two show at the same display size.
    assert.equal(book.image.w * book.original.h, book.original.w * book.image.h);
    assert.match(book.facts.find((f) => f.label === 'How it was checked').text, /overlaps the original's by 96%/);
    // A repainted region map beside Tiny Speck's surviving thumbnail (tools/provenance/repainted-maps.json).
    const map = made.pieces.find((p) => p.id === 'map:58');
    assert.deepEqual([map.original.src, map.original.w, map.original.h, map.original.pixelated], ['/assets/maps/art/thumbs/sm_groddlemeadow.jpg', 150, 91, true]);
    assert.equal(map.image.src, '/assets/maps/art/bg/groddlemeadow@2x.webp');
    // Groddle Meadow was restored from the 2012 Encyclopedia's picture (2026-11-13); the thumbnail stays beside it.
    assert.match(map.caption, /2012 Encyclopedia/);
    for (const p of made.pieces) {
      assert.match(p.facts.at(-1).text, /CC0 1\.0/, `${p.id} says its licence`);
      const tool = /^(maps?|subway|world|decos):/.test(p.id) ? 'GPT Image 2.6 Sunburst' : provenance.sprites[p.id].tool;
      assert.ok(p.facts.some((f) => f.label === 'How it was made' && f.text.includes(tool)), `${p.id} names its tool`);
    }
  });

  it('shows the subway paper, EZ Cookin\'s made props and a gallery of region maps beside what they come from, in composed pictures it can vouch for', () => {
    const more = readMore();
    const piece = (id) => made.pieces.find((p) => p.id === id);
    // The subway paper beside a crop of Tiny Speck's sign (its little map), its pixels kept.
    const sub = piece('subway:paper');
    assert.deepEqual([sub.original.src, sub.original.pixelated, sub.image.src], ['/assets/made-art/subway-sign-map.webp', true, '/assets/made-art/subway-map-paper-line.webp']);
    assert.equal(sub.made, more.subway.made);
    assert.match(sub.original.label, /232 by 158 pixels/);
    // The World map: Tiny Speck's 760 x 460 painted chart beside its sharpened 2x twin (tools/provenance/world-map-2x.json).
    const world = piece('world:2x');
    assert.deepEqual([world.original.src, world.original.w, world.original.h], ['/assets/maps/art/world/world_map_unlocked.jpg', 760, 460]);
    assert.deepEqual([world.image.src, world.image.w, world.image.h], ['/assets/maps/art/world/world_map_unlocked@2x.webp', 1520, 920]);
    assert.equal(world.made, more.world.made);
    assert.match(world.caption, /^Tiny Speck's World map, sharpened for Retina screens\./);
    assert.match(world.original.label, /760 by 460 pixels/);
    // Every made deco is on the page: the three EZ Cookin' props, beside our drawing of their sizes, and the room before and after.
    const ez = piece('decos:ezc');
    assert.deepEqual([ez.original.kind, ez.original.src, ez.image.src], ['guide', '/assets/made-art/ezc-props-outline.webp', '/assets/made-art/ezc-props.webp']);
    assert.ok(ez.facts.some((f) => f.label === 'What the 2012 street had' && /glass-topped serving counters/.test(f.text)));
    assert.deepEqual([piece('decos:ezc:room').original.src, piece('decos:ezc:room').image.src], ['/assets/made-art/ezc-room-stand-ins.webp', '/assets/made-art/ezc-room.webp']);
    assert.deepEqual(Object.keys(more.decos.art).filter((n) => n.startsWith('gz_ai_ezc_')).sort(), Object.keys(more.decos.art).sort());
    // The gallery: three thumbnails and their paintings, the same shape so they show at the same size.
    const gal = piece('maps:27,107,131');
    assert.equal(gal.image.w * gal.original.h, gal.original.w * gal.image.h);
    assert.match(gal.facts.find((f) => f.label === 'How it was checked').text, /51 regions in all were painted again, four of them with no thumbnail/);
    // Each composed picture is the one tools/made-art/showcase.json records, and every recorded one is shown.
    const shownFiles = made.pieces.flatMap((p) => [p.image.src, p.original?.src]).filter((f) => f?.startsWith('/assets/made-art/')).map((f) => `public${f}`);
    assert.deepEqual(shownFiles.sort(), Object.keys(more.showcase.files).sort());
    for (const [file, row] of Object.entries(more.showcase.files)) {
      assert.deepEqual(webpSize(readFileSync(join(GAME_DIR, file))), { w: row.w, h: row.h }, file);
      assert.ok(row.made && row.what, file);
    }
  });

  it('keeps the prompts, hashes and file names out of what players read', () => {
    assert.deepEqual(wordProblems(made), []);
    const raw = readFileSync(join(GAME_DIR, 'public/restoration/made.json'), 'utf8');
    assert.doesNotMatch(raw, /—/);
    assert.doesNotMatch(raw, /"prompt"|"sha256"|"inputs"/);
    for (const s of Object.values(provenance.sprites)) {
      assert.ok(!raw.includes(s.sha256) && !raw.includes(s.source.sheet_sha256), 'no provenance hash');
      assert.ok(!raw.includes(s.prompt.slice(0, 40)), 'no prompt text');
    }
    for (const s of playerWords(made).flat()) assert.doesNotMatch(s, /\.webp|\.png|\/|\{|\}/, s);
  });

  it('fails when the art no longer matches its provenance, or a piece has no words', () => {
    const files = new Map();
    const read = (file) => {
      if (!files.has(file)) files.set(file, readFileSync(join(GAME_DIR, file)));
      return files.get(file);
    };
    const maps = JSON.parse(readFileSync(join(GAME_DIR, 'tools/provenance/repainted-maps.json'), 'utf8'));
    const more = readMore();
    assert.equal(build(provenance, curated, read, maps, more).pieces.length, made.pieces.length);
    const changed = (file) => (f) => (f === file ? Buffer.concat([read(f), Buffer.from([0])]) : read(f));
    assert.throws(() => build(provenance, curated, changed(provenance.sprites.quest_book_award.file), maps, more), /no longer matches its provenance hash/);
    assert.throws(() => build(provenance, { pieces: curated.pieces.slice(1) }, read), /has no words/);
    const odd = structuredClone(curated);
    odd.pieces[0].facts[0].text = 'Made with {nothing}.';
    assert.throws(() => build(provenance, odd, read, maps, more), /nothing to fill \{nothing\}/);
    // A made deco changed, a composed picture changed or unrecorded, a made deco left off the page.
    assert.throws(() => build(provenance, curated, changed(more.decos.art.gz_ai_ezc_hanging_lamp.file3), maps, more), /gz_ai_ezc_hanging_lamp@1\.5x\.webp no longer matches its provenance hash/);
    assert.throws(() => build(provenance, curated, changed('public/assets/made-art/ezc-room.webp'), maps, more), /no longer matches its hash in tools\/made-art\/showcase\.json/);
    assert.throws(() => build(provenance, curated, read, maps, { ...more, showcase: { files: {} } }), /is not recorded in tools\/made-art\/showcase\.json/);
    const noEz = { pieces: curated.pieces.filter((p) => !p.id.startsWith('decos:')) };
    assert.throws(() => build(provenance, noEz, read, maps, more), /gz_ai_ezc_glass_counter: a made deco \(made-decos\.json\) on no piece/);
  });

  it('reads sizes from the WebP files and writes dates in words', () => {
    assert.deepEqual(webpSize(readFileSync(join(GAME_DIR, 'public/assets/ui/quest-book.webp'))), { w: 86, h: 58 });
    assert.deepEqual(webpSize(readFileSync(join(GAME_DIR, 'public/assets/ui/quest-book-solid.webp'))), { w: 516, h: 348 });
    assert.equal(dateLabel('2026-11-02'), '2 November 2026');
    assert.throws(() => dateLabel('soon'));
  });

  it('catches an em-dash, a path or a hash in the words', () => {
    const one = (caption) => wordProblems({ pieces: [{ name: 'A', caption, image: {}, facts: [] }] });
    assert.deepEqual(one('A plain line.'), []);
    assert.equal(one('A line — with a dash.').length, 1);
    assert.equal(one('See assets/ui/book.webp').length >= 1, true);
    assert.equal(one('Hash a53d6aca8fce48ba072b70').length, 1);
  });
});

describe('Made for Groddle on the site (src/RestorationMade.php)', () => {
  const fixture = {
    pieces: [
      {
        id: 'one', anchor: 'made-a-book', name: 'A <b>book</b>', made: '2026-11-12', madeLabel: '12 November 2026', caption: 'Redrawn & sharp.',
        display: { w: 258, h: 174 },
        image: { src: '/assets/ui/new.webp', w: 516, h: 348, label: 'Redrawn', alt: 'The new book' },
        original: { src: '/assets/ui/old.webp', w: 86, h: 58, kind: 'original', label: 'The original', alt: 'The old book', pixelated: true },
        facts: [{ label: 'How it was made', text: 'By hand' }, { label: 'Licence', text: 'CC0 1.0' }],
      },
      {
        id: 'two', anchor: 'made-a-walker', name: 'Walker', made: '2026-11-02', madeLabel: '2 November 2026', caption: 'It walks.',
        display: { w: 240, h: 152 },
        image: { src: '/assets/sprites/made/walk@3x.webp', w: 360, h: 228, sheet: { cols: 8, rows: 1, frames: 8, fps: 10 }, label: 'The walk', alt: 'Walking' },
        original: { src: '/assets/sprites/guide@3x.webp', w: 264, h: 186, sheet: { cols: 8, rows: 3, frames: 24 }, kind: 'guide', label: 'The guide', alt: 'A guide' },
        facts: [],
      },
      { id: 'bad', anchor: 'made-bad"><script>', name: 'Bad', caption: 'x', display: { w: 10, h: 10 }, image: { src: 'javascript:alert(1)', w: 1, h: 1 }, original: { src: '/assets/../x.webp', w: 1, h: 1 }, facts: [] },
    ],
  };

  it('draws each piece as a card: the original beside the made art at the same size, then the words, server-side', { skip: skipPhp }, () => {
    const html = draw(fixture);
    assert.match(html, /^<div class="made-list"><article class="made-piece" id="made-a-book" aria-labelledby="made-a-book-h" style="--pair:516">/);
    assert.match(html, /<figure class="made-fig made-fig-original" style="--w:258;--h:174"><span class="made-frame"><img class="made-px" src="\/assets\/ui\/old\.webp" alt="The old book" width="86" height="58"/);
    assert.match(html, /<figure class="made-fig made-fig-made" style="--w:258;--h:174"><span class="made-frame"><img src="\/assets\/ui\/new\.webp"/);
    assert.ok(html.indexOf('made-fig-original') < html.indexOf('made-fig-made'), 'the original comes first');
    assert.match(html, /<h3 id="made-a-book-h">A &lt;b&gt;book&lt;\/b&gt;<\/h3><p class="made-when">Made 12 November 2026<\/p><p class="made-caption">Redrawn &amp; sharp\.<\/p>/);
    assert.match(html, /<dl class="made-facts"><div><dt>How it was made<\/dt><dd>By hand<\/dd><\/div>/);
    // A walk sheet steps through its row; a guide sheet shows its first frame, the guide's own shape at the same height.
    assert.match(html, /<figure class="made-fig made-fig-made" style="--w:240;--h:152;--cols:8;--rows:1;--frames:8;--fps:10"><span class="made-frame made-sheet made-walk"><img src="\/assets\/sprites\/made\/walk@3x\.webp" alt="Walking" width="2880" height="228"/);
    assert.match(html, /<figure class="made-fig made-fig-guide" style="--w:216;--h:152;--cols:8;--rows:3"><span class="made-frame made-sheet"><img src/);
    // Only the game's images reach src, and nothing breaks out of an attribute.
    assert.doesNotMatch(html, /javascript:|\/assets\/\.\.|<script/);
    assert.match(html, /id="made-badscript"/);
    assert.doesNotMatch(html, /<script|onerror|<button/);
  });

  it('draws the real made.json with no path, hash or em-dash in what a reader sees', { skip: skipPhp }, () => {
    const html = draw(made);
    assert.equal((html.match(/<article class="made-piece"/g) || []).length, made.pieces.length);
    assert.equal((html.match(/class="made-px"/g) || []).length, made.pieces.filter((p) => p.original?.pixelated).length);
    const text = visible(html);
    assert.doesNotMatch(text, /—/);
    assert.doesNotMatch(text, /\b[0-9a-f]{12,}\b/i, 'no hash');
    assert.doesNotMatch(text, /[\w-]+\/[\w-]+|\.(?:webp|png|json|mjs|php)\b/, 'no path');
    for (const p of made.pieces) assert.ok(html.includes(p.caption.replace(/'/g, '&apos;')), p.id);
    for (const s of Object.values(provenance.sprites)) assert.ok(!html.includes(s.sha256), 'no provenance hash in the HTML');
  });

  it('is wired into the site: block.json, minn.json, the extension and the styles', { skip: skipWithoutSite }, () => {
    const block = readJson(sitePath('blocks/restoration-made/block.json'));
    assert.equal(block.name, 'groddle/restoration-made');
    assert.ok(readJson(sitePath('minn.json')).blocks.includes('groddle/restoration-made'));
    assert.match(readFileSync(sitePath('src/Extension.php'), 'utf8'), /RestorationMade::register\(\$minn, \$root\);/);
    const php = readFileSync(sitePath('src/RestorationMade.php'), 'utf8');
    assert.match(php, /\$root->dir \. '\/restoration\/made\.json'/, 'reads the built JSON through StaticRoot');
    assert.match(php, /DataKeys::html\(self::draw\(\$decoded\), DataKeys::map\(\$root->dir\)\)/, 'the images carry the game\'s content keys');
    assert.doesNotMatch(php, /<script/);
    const css = readFileSync(sitePath('style.css'), 'utf8');
    const from = css.indexOf('/* The restoration report\'s Made for Groddle band');
    assert.ok(from >= 0, 'style.css has the Made for Groddle section');
    const next = css.indexOf('\n/* ', from + 1);
    const rules = css.slice(from, next < 0 ? undefined : next).replace(/\/\*[\s\S]*?\*\//g, '');
    for (const sel of ['.made-piece', '.made-pair', '.made-frame', 'image-rendering: pixelated', 'prefers-reduced-motion: no-preference', '@media (max-width: 640px)']) assert.ok(rules.includes(sel), sel);
    // Colours only from restoration.css's tokens, so light and dark both hold.
    assert.doesNotMatch(rules, /#[0-9a-f]{3,8}\b|rgba?\(/i);
  });
});

describe('Made for Groddle on the restoration page (tools/made-art/to-minn.mjs)', () => {
  it('is one band of core blocks around the data block, in plain words', () => {
    const band = madeBand();
    assert.equal(band.split('<!-- wp:groddle/restoration-made /-->').length, 2);
    assert.match(band, /<section class="wp-block-group band band-alt" id="made">/);
    assert.match(band, /<h2 class="wp-block-heading" id="made-h">Made for Groddle<\/h2>/);
    assert.match(band, /Tiny Speck’s own art/);
    assert.doesNotMatch(band, /wp:html|—/);
  });

  it('adds the band before the footer once, changing nothing else', () => {
    const page = `<!-- wp:paragraph -->\n<p>Austin's own words</p>\n<!-- /wp:paragraph -->\n\n${FOOT}\n<div class="wp-block-group wrap report-foot">foot</div>\n<!-- /wp:group -->`;
    const added = withMade(page);
    assert.equal(added.replace(`${madeBand()}\n\n`, ''), page, 'only the band is added');
    assert.ok(added.indexOf('id="made"') < added.indexOf('report-foot'));
    assert.equal(withMade(added), null, 'a page with the section is left alone');
    assert.equal(withMade('<p>no foot</p>\n'), `<p>no foot</p>\n\n${madeBand()}`, 'no footer: at the end');
    assert.equal(withMade(restorationContent()), null, 'a page made fresh carries it');
  });
});
