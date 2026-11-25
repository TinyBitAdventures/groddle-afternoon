/**
 * The Our additions section of /restoration/ (Austin 2026-11-25, #699, G1308: "add a compare section
 * somewhere on the new website so we can document the original artwork next to our addition, then
 * standardize it"): tools/made-art/compare.json lists each addition of ours that has a Tiny Speck
 * original, tools/made-art/compare-art.mjs composes its pictures, tools/made-art/build-data.mjs
 * writes them into public/restoration/made.json `ours`, the site's groddle/restoration-ours block
 * draws them with the Made for Groddle cards, and the compare popup flips between the two.
 * Run: node --test tests/restoration-ours.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildOurs, playerWords, svgSize, wordProblems } from '../tools/made-art/build-data.mjs';
import { STATS, croppedSvg, oursGridSvg, oursIconSvg } from '../tools/made-art/compare-art.mjs';
import { FOOT, withMade, withOurs, withSections } from '../tools/made-art/to-minn.mjs';
import { madeBand, oursBand, restorationContent } from '../tools/restoration/to-minn.mjs';
import { COMPARE_MADE, compareProblems, loadCompare, loadRegister } from '../tools/inventions/scan.mjs';
import { GAME_DIR, SITE_DIR, sitePath, skipWithoutSite } from '../tools/repos.mjs';

const readJson = (path) => JSON.parse(readFileSync(join(GAME_DIR, path), 'utf8'));
const made = readJson('public/restoration/made.json');
const compare = readJson('tools/made-art/compare.json');
const catalog = readJson('public/assets/avatar/catalog.json');
const register = loadRegister();

let hasPhp = true;
try {
  execFileSync('php', ['-v'], { stdio: 'ignore' });
} catch {
  hasPhp = false;
}
const skipPhp = skipWithoutSite || (!hasPhp && 'no php on PATH');

/** Runs RestorationMade::drawOurs over `data`, returning the HTML. */
function drawOurs(data) {
  const dir = mkdtempSync(join(tmpdir(), 'ours-'));
  const file = join(dir, 'in.json');
  writeFileSync(file, JSON.stringify(data));
  try {
    return execFileSync('php', ['-r', `require ${JSON.stringify(join(SITE_DIR, 'src/RestorationMade.php'))}; echo Groddle\\Minn\\RestorationMade::drawOurs(json_decode(file_get_contents(${JSON.stringify(file)}), true));`], { encoding: 'utf8' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('Our additions data (made.json ours, from tools/made-art/compare.json)', () => {
  it('shows every compare entry, newest ruling first, each with its Tiny Speck original beside ours', () => {
    assert.deepEqual(made.ours.map((p) => p.id).sort(), compare.entries.map((c) => c.id).sort());
    const dates = made.ours.map((p) => p.decided);
    assert.deepEqual(dates, [...dates].sort().reverse());
    for (const p of made.ours) {
      assert.ok(p.original?.src && p.image?.src, p.id);
      assert.equal(p.original.kind, 'original');
      assert.match(p.when, /^Kept \d{1,2} [A-Z][a-z]+ 20\d\d$/);
      assert.match(p.anchor, /^ours-[a-z0-9-]+$/);
      assert.equal(p.facts.at(-1).label, 'Licence');
      for (const v of [p.original, p.image, ...(p.parts || []).flatMap((x) => [x.original, x.image])]) {
        assert.match(v.src, /^\/assets\/[A-Za-z0-9_@./-]+\.(?:webp|svg)$/, v.src);
        assert.ok(v.w > 0 && v.h > 0 && v.label && v.alt, v.src);
      }
    }
  });

  it('the stat icons: Tiny Speck\'s six slugs (and the cards\' iMG and currant marks) step by step against ours', () => {
    const stats = made.ours.find((p) => p.id === 'stat-icons');
    assert.ok(stats);
    assert.equal(stats.invention, 'stat-icons');
    assert.equal(stats.original.pixelated, true, 'the slugs keep their pixels');
    assert.deepEqual(stats.parts.map((p) => p.name), ['Energy', 'Mood', 'XP', 'iMG', 'iMG on the Imagination cards', 'Currants', 'Currants on the Imagination cards', 'Favor']);
    for (const [i, t] of STATS.entries()) {
      const part = stats.parts.filter((p) => !/cards/.test(p.name))[i];
      assert.equal(part.original.src, `/assets/classic/slug_${t}_pos.webp`, t);
      assert.equal(part.original.pixelated, true, t);
      assert.equal(part.image.src, `/assets/made-art/compare/stat-${t}-ours.svg`, t);
    }
    const coin = stats.parts.find((p) => p.name === 'Currants on the Imagination cards');
    assert.equal(coin.original.src, '/assets/made-art/compare/card-currant-original.svg');
  });

  it('our icons on the page are the code\'s own drawing: recompose when js/stat-icons.js changes', () => {
    const file = (name) => readFileSync(join(GAME_DIR, 'public/assets/made-art/compare', name), 'utf8');
    for (const t of STATS) assert.equal(file(`stat-${t}-ours.svg`), oursIconSvg(t), `${t}: run node tools/made-art/compare-art.mjs --only stats`);
    assert.equal(file('stat-icons-ours.svg'), oursGridSvg());
    // The currant coin the page shows carries the colon sign's two strokes (#699).
    assert.equal((file('stat-currants-ours.svg').match(/<path d="M[\d.]+ [\d.]+L/g) || []).length, 2);
    // The cards' currant is Tiny Speck's own vector, only its viewBox changed.
    const card = readFileSync(join(GAME_DIR, 'public/assets/imagination/cards/icon_currant.svg'), 'utf8');
    const cropped = file('card-currant-original.svg');
    const box = /viewBox="([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+)"/.exec(cropped).slice(1).map(Number);
    assert.equal(cropped, croppedSvg(card, box));
    assert.deepEqual(svgSize(Buffer.from(cropped)), { w: box[2], h: box[3] });
  });

  it('the reimagined clothes: every reimagined article, Tiny Speck\'s greyscale file beside our colours', () => {
    const clothes = made.ours.find((p) => p.id === 'wardrobe-reimagined');
    const reimagined = Object.values(catalog.types).flat().filter((i) => i.reimagined);
    assert.equal(clothes.parts.length, reimagined.length);
    assert.ok(clothes.caption.includes(`Tiny Speck left ${reimagined.length} clothing files`), 'the count comes from the catalog');
    for (const part of clothes.parts) {
      assert.match(part.original.src, /-original\.webp$/);
      assert.match(part.image.src, /-ours\.webp$/);
      assert.match(part.image.label, /^Ours, in colours (?:borrowed from the .+|chosen from the same palette)$/);
    }
  });

  it('only Tiny Speck\'s CC0 art and our own: no snap, footage or video frame', () => {
    const sources = Object.entries(compare.files).flatMap(([file, row]) => [file, ...(row.from || []).map((f) => f.file || f.shot || '')]);
    for (const s of sources) assert.doesNotMatch(s, /snap|shot|footage|video|frames?\//i, s);
    for (const p of made.ours) {
      for (const v of [p.original, p.image, ...(p.parts || []).flatMap((x) => [x.original, x.image])]) {
        assert.match(v.src, /^\/assets\/(?:made-art\/compare|classic|imagination)\//, v.src);
      }
    }
  });

  it('fails on a picture that no longer matches its record, a file no addition shows, or an unknown licence', () => {
    const odd = structuredClone(compare);
    const [first] = Object.keys(odd.files);
    odd.files[first].sha256 = '0'.repeat(64);
    assert.throws(() => buildOurs(odd, undefined, { catalog }), /no longer matches its hash/);
    const extra = structuredClone(compare);
    extra.files['public/assets/made-art/compare/nothing.svg'] = { sha256: 'x' };
    assert.throws(() => buildOurs(extra, undefined, { catalog }), /on no addition/);
    const licence = structuredClone(compare);
    licence.entries[0].licence = 'mystery';
    assert.throws(() => buildOurs(licence, undefined, { catalog }), /no words for the licence mystery/);
  });

  it('keeps paths, hashes and em-dashes out of what players read', () => {
    assert.deepEqual(wordProblems({ pieces: [], ours: made.ours }), []);
    const words = playerWords({ pieces: [], ours: made.ours }).flat().join(' ');
    assert.ok(words.includes('Kept 25 November 2026'));
  });
});

describe('The compare rule (tools/inventions/scan.mjs compareProblems)', () => {
  it('every kept visual invention names its compare entry or says why it has none', () => {
    assert.deepEqual(compareProblems(register, loadCompare()), []);
    const kept = register.entries.filter((e) => e.kind === 'visual' && e.status === 'kept');
    assert.ok(kept.length >= 10);
    for (const e of kept) assert.ok(e.compare !== undefined || e.noCompare !== undefined, e.id);
    assert.equal(register.entries.find((e) => e.id === 'stat-icons').compare, 'stat-icons');
    assert.equal(register.entries.find((e) => e.id === 'made-decos').compare, COMPARE_MADE);
    assert.match(register.about, /compare \/ noCompare/);
  });

  it('fails a new kept visual addition with neither, a compare that names nothing, and a one-sided pair', () => {
    const reg = (extra) => ({ entries: [...register.entries, extra] });
    const base = { id: 'new-glow', title: 'A glow', kind: 'visual', status: 'kept', where: [{ file: 'public/game.js' }], why: 'x', ruling: 'y', rows: [] };
    assert.match(compareProblems(reg(base), compare).join('\n'), /new-glow: a kept visual invention needs compare/);
    assert.match(compareProblems(reg({ ...base, compare: 'nope' }), compare).join('\n'), /compare nope is not an entry/);
    assert.match(compareProblems(reg({ ...base, noCompare: 'lost' }), compare).join('\n'), /noCompare must say why/);
    assert.match(compareProblems(reg({ ...base, compare: 'made', noCompare: 'Tiny Speck never drew one.' }), compare).join('\n'), /both compare and noCompare/);
    // A proposed one is not held to it yet.
    assert.deepEqual(compareProblems(reg({ ...base, status: 'proposed' }), compare), []);
    // A compare entry must point at a visual entry that points back.
    const loose = { ...compare, entries: [...compare.entries, { id: 'orphan', invention: 'quoin-shard-size' }] };
    assert.match(compareProblems(register, loose).join('\n'), /compare orphan: quoin-shard-size should say compare: "orphan"/);
  });
});

describe('Our additions on the site (src/RestorationMade.php drawOurs)', () => {
  it('draws each addition as a Made card, the original first, SVGs allowed, marked for the popup', { skip: skipPhp }, () => {
    const html = drawOurs(made);
    assert.match(html, /^<div class="made-list made-ours" data-kicker="Our addition">/);
    assert.equal((html.match(/<article class="made-piece"/g) || []).length, made.ours.length);
    assert.match(html, /<article class="made-piece" id="ours-stat-icons"/);
    assert.match(html, /<p class="made-when">Kept 25 November 2026<\/p>/);
    assert.match(html, /<img src="\/assets\/made-art\/compare\/stat-icons-ours\.svg"/);
    assert.match(html, /<img class="made-px" src="\/assets\/made-art\/compare\/stat-icons-original\.webp"/);
    for (const p of made.ours) assert.ok(html.indexOf(`id="${p.anchor}"`) >= 0, p.id);
    const stats = html.slice(html.indexOf('id="ours-stat-icons"'));
    assert.ok(stats.indexOf('made-fig-original') < stats.indexOf('made-fig-made'), 'the original comes first');
    assert.doesNotMatch(html, /<script|—/);
    // An svg from anywhere else still does not reach src.
    const odd = drawOurs({ ours: [{ ...made.ours[0], image: { ...made.ours[0].image, src: 'https://example.com/x.svg' } }] });
    assert.doesNotMatch(odd, /example\.com/);
  });

  it('is wired into the site: block.json, minn.json and the extension\'s register', { skip: skipWithoutSite }, () => {
    const block = JSON.parse(readFileSync(sitePath('blocks/restoration-ours/block.json'), 'utf8'));
    assert.equal(block.name, 'groddle/restoration-ours');
    const blocks = JSON.parse(readFileSync(sitePath('minn.json'), 'utf8')).blocks;
    assert.ok(blocks.indexOf('groddle/restoration-ours') === blocks.indexOf('groddle/restoration-made') + 1);
    const php = readFileSync(sitePath('src/RestorationMade.php'), 'utf8');
    assert.match(php, /\$minn->block\('blocks\/restoration-ours'/);
    assert.match(php, /DataKeys::html\(self::drawOurs\(\$decoded\), DataKeys::map\(\$root->dir\)\)/);
  });
});

describe('Our additions on the restoration page and in the popup', () => {
  it('is one band after Made for Groddle, added once to a page made before it', () => {
    const band = oursBand();
    assert.equal(band.split('<!-- wp:groddle/restoration-ours /-->').length, 2);
    assert.match(band, /<section class="wp-block-group band" id="ours">/);
    assert.match(band, /<h2 class="wp-block-heading" id="ours-h">Our additions, beside the originals<\/h2>/);
    assert.doesNotMatch(band, /wp:html|—/);
    const fresh = restorationContent();
    assert.ok(fresh.indexOf('id="made"') < fresh.indexOf('id="ours"') && fresh.indexOf('id="ours"') < fresh.indexOf('report-foot'));
    const page = `<p>Austin's words</p>\n\n${madeBand()}\n\n${FOOT}\n<div class="wp-block-group wrap report-foot">foot</div>\n<!-- /wp:group -->`;
    assert.equal(withMade(page), null);
    const added = withOurs(page);
    assert.equal(added.replace(`${band}\n\n`, ''), page, 'only the band is added');
    assert.ok(added.indexOf('id="made"') < added.indexOf('id="ours"') && added.indexOf('id="ours"') < added.indexOf('report-foot'));
    assert.equal(withSections(added), null, 'both there: left alone');
    assert.equal(withSections(fresh), null, 'a page made fresh carries both');
  });

  it('the popup reads the additions\' parts and says "Our addition" above their title', () => {
    const js = readFileSync(join(GAME_DIR, 'public/restoration/made-compare.js'), 'utf8');
    assert.match(js, /\[\.\.\.\(d\?\.pieces \|\| \[\]\), \.\.\.\(d\?\.ours \|\| \[\]\)\]/);
    assert.match(js, /piece\.closest\('\[data-kicker\]'\)\?\.dataset\.kicker \|\| 'Made for Groddle'/);
  });
});
