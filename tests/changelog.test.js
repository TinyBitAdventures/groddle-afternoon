/**
 * The Notes blog (/changelog/) built from tools/changelog/posts.json by
 * tools/changelog/build.mjs. The 20 archived posts came out of the old build
 * archive word for word (tools/changelog/extract.mjs reads it from git), the
 * pages match what build.mjs writes now, links resolve, the draft stays
 * unlisted, and the old changelog.html#release-... anchors still land.
 * When this fails after editing posts.json, run node tools/changelog/build.mjs.
 * Run: node --test tests/changelog.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARCHIVE_COMMIT, archiveHtml, extractPosts } from '../tools/changelog/extract.mjs';
import { buildPages, loadPosts, staleFiles, historySince } from '../tools/changelog/build.mjs';
import { parse, findAll, hasClass, plain, textRuns } from '../tools/changelog/html.mjs';
import { servedByMinn } from './minn-served.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
const read = (p) => readFileSync(join(pub, p), 'utf8');

const archive = archiveHtml();
const extracted = extractPosts(archive);
const data = loadPosts();
const files = buildPages(data);
const archived = data.posts.filter((p) => p.archived);
const published = data.posts.filter((p) => !p.draft);
const drafts = data.posts.filter((p) => p.draft);
const pageOf = (post) => files[`changelog/${post.slug}/index.html`];

describe('notes: the archived posts', () => {
  it(`posts.json holds all 20 entries of the build archive at ${ARCHIVE_COMMIT}`, () => {
    const ids = [...archive.matchAll(/<details class="release-log" id="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(ids.length, 20);
    assert.equal(extracted.posts.length, 20);
    assert.equal(archived.length, 20);
    assert.deepEqual(archived.map((p) => p.archived.id).sort(), [...ids].sort());
  });

  it('posts.json still matches what the extractor reads from the archive', () => {
    for (const post of extracted.posts) {
      const kept = data.posts.find((p) => p.slug === post.slug);
      assert.ok(kept, post.slug);
      assert.deepEqual(kept, post, post.slug);
    }
  });

  it('slugs are unique, dated and named after the meta label', () => {
    const slugs = data.posts.map((p) => p.slug);
    assert.equal(new Set(slugs).size, slugs.length);
    for (const p of data.posts) {
      assert.match(p.slug, /^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/);
      assert.ok(p.slug.startsWith(p.date), p.slug);
    }
    assert.ok(slugs.includes('2026-07-27-red-tape'));
    assert.ok(slugs.includes('2026-07-27-first-snow'));
    assert.ok(slugs.includes('2026-10-19-whole-world'));
  });

  it('every word of every entry survives onto its post page', () => {
    const tree = parse(archive);
    for (const details of findAll(tree, (n) => n.tag === 'details' && hasClass(n, 'release-log'))) {
      const post = archived.find((p) => p.archived.id === details.attrs.id);
      const page = textRuns(pageOf(post)).join(' ');
      const runs = textRuns(archive.slice(details.start, details.end))
        .filter((t) => t !== 'entry' && !/^\d\d \/ \d\d$/.test(t)); // the toggle label and the quest map's "01 / 10" counter
      assert.ok(runs.length > 10, post.slug);
      for (const run of runs) {
        // The eyebrow line ("PARALLAX · 285 RECIPES · ...") is shown as one chip per tag.
        const pieces = run === post.eyebrow ? post.tags : [run];
        if (run === post.eyebrow) assert.equal(post.tags.join(' · '), run, post.slug);
        for (const piece of pieces) assert.ok(page.includes(piece), `${post.slug}: "${piece}"`);
      }
    }
  });

  it('the quest map details from the archive script are all on the July 25 to 26 post', () => {
    const script = archive.slice(archive.indexOf('const questData'));
    const strings = [...script.slice(0, script.indexOf('};')).matchAll(/: '([^']+)'/g)].map((m) => m[1]);
    assert.equal(strings.length, 60);
    const page = plain(pageOf(data.posts.find((p) => p.slug === '2026-07-25-world-woke-up')));
    for (const s of strings) assert.ok(page.includes(s), s);
  });

  it('keeps every card, stat and section', () => {
    const marks = (archive.match(/class="(feature|fix)-mark"/g) || []).length;
    const cards = archived.reduce((n, p) => n + (pageOf(p).match(/class="note-feature"/g) || []).length, 0);
    assert.equal(marks, 75); // 69 feature cards and 6 fix cards
    assert.equal(cards, marks);
    const stamps = (archive.match(/class="archive-stamp"/g) || []).length;
    assert.equal(archived.filter((p) => p.stat).length, stamps);
    const big = data.posts.find((p) => p.slug === '2026-07-25-world-woke-up');
    assert.deepEqual(big.blocks.map((b) => b.title), ['Journeys', 'World fixes', 'Systems', 'Ledger']);
    const page = pageOf(big);
    assert.match(page, /id="proof"/);
    for (const s of ['Seven races and Game of Crowns', 'Deployment parity', 'SHA-256', '521<small>/521</small>', 'Ramsley Sway', 'The clean-art promise']) {
      assert.ok(page.includes(s) || pageOf(data.posts.find((p) => p.slug === '2026-10-19-whole-world')).includes(s), s);
    }
    assert.ok(pageOf(data.posts.find((p) => p.slug === '2026-07-27-catalogue-scale')).includes('<strong>−1832</strong>'));
    assert.ok(pageOf(data.posts.find((p) => p.slug === '2026-07-26-night')).includes('<span class="code">&lt;split butt_txt&gt;</span>'));
  });
});

describe('notes: the pages', () => {
  it('are current (node tools/changelog/build.mjs)', () => {
    assert.deepEqual(staleFiles(files), []);
  });

  it('the list shows every published post, newest first, and no drafts', () => {
    const index = files['changelog/index.html'];
    const linked = [...index.matchAll(/<h3><a href="([^"]+)\/">/g)].map((m) => m[1]);
    assert.deepEqual(linked, published.map((p) => p.slug));
    const dates = published.map((p) => p.date);
    assert.deepEqual(dates, [...dates].sort().reverse());
    for (const d of drafts) assert.ok(!index.includes(d.slug), d.slug);
  });

  it('every post links to the history page and to its neighbours', () => {
    const since = historySince();
    for (const [i, post] of published.entries()) {
      const page = pageOf(post);
      if (post.date >= since) assert.ok(page.includes(`restoration/history/#d-${post.date}`), post.slug);
      else assert.ok(page.includes('href="../../restoration/history/"'), post.slug);
      if (published[i + 1]) assert.ok(page.includes(`href="../${published[i + 1].slug}/" rel="prev"`), post.slug);
      if (published[i - 1]) assert.ok(page.includes(`href="../${published[i - 1].slug}/" rel="next"`), post.slug);
    }
    assert.ok(pageOf(data.posts.find((p) => p.slug === '2026-10-19-whole-world')).includes('#d-2026-10-19'));
    assert.ok(!pageOf(data.posts.find((p) => p.slug === '2026-07-20-first-spark')).includes('#d-'));
  });

  it('drafts are built but unlisted, marked noindex and say Draft (when there are any)', () => {
    for (const d of drafts) {
      const page = pageOf(d);
      assert.match(page, /<meta name="robots" content="noindex" \/>/);
      assert.match(page, /class="note-draft"[^>]*><strong>Draft<\/strong>/);
      for (const other of published) assert.ok(!pageOf(other).includes(d.slug), `${other.slug} links ${d.slug}`);
      assert.ok(!files['changelog.html'].includes(d.slug));
    }
    for (const p of published) assert.ok(!pageOf(p).includes('noindex'), p.slug);
  });

  it('all internal links and images resolve', () => {
    for (const [path, html] of Object.entries(files)) {
      for (const [, ref] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
        if (/^(https?:|mailto:|#)/.test(ref)) continue;
        const clean = ref.replace(/[?#].*$/, '');
        if (!clean || servedByMinn(clean)) continue;
        const target = resolve(pub, path, '..', clean);
        const file = clean.endsWith('/') ? join(target, 'index.html') : target;
        assert.ok(existsSync(file) || files[file.slice(pub.length + 1)], `${path}: ${ref}`);
      }
    }
  });

  it('new copy has no em-dashes (archived text keeps its own)', () => {
    let index = files['changelog/index.html'];
    for (const p of archived) for (const s of [p.title, p.summary, p.stat?.caption]) if (s) index = index.replaceAll(s, '');
    assert.ok(!index.includes('—'), 'index');
    assert.ok(!files['changelog.html'].includes('—'), 'redirect');
    for (const d of drafts) assert.ok(!pageOf(d).includes('—'), d.slug);
  });
});

describe('notes: the old build archive address', () => {
  const redirect = files['changelog.html'];
  const map = JSON.parse(redirect.match(/var posts = (\{[\s\S]*?\});/)[1]);

  it('sends every old #release-... anchor to its post', () => {
    for (const post of archived) {
      assert.equal(map[post.archived.id], `${post.slug}/`);
      assert.ok(existsSync(join(pub, 'changelog', post.slug, 'index.html')), post.slug);
    }
    assert.equal(map.proof, '2026-07-25-world-woke-up/#proof');
  });

  it('falls back to the list without JavaScript', () => {
    assert.match(redirect, /<noscript><meta http-equiv="refresh" content="0; url=changelog\/" \/><\/noscript>/);
    assert.match(redirect, /<a href="changelog\/">Notes<\/a>/);
    assert.ok(redirect.length < 4000);
  });
});

describe('notes: the site header', () => {
  const navOf = (html) => html.match(/<nav class="site-nav"[\s\S]*?<\/nav>/)?.[0] || '';
  const normal = (nav, prefix) => nav
    .replace(/ aria-current="page"/g, '')
    .replaceAll(`href="${prefix || './'}"`, 'href="HOME"')
    .replaceAll(`href="${prefix || './'}#`, 'href="HOME#')
    .replaceAll(`="${prefix}`, '="');
  const home = normal(navOf(read('index.html')), '');
  const pages = [
    { file: 'index.html', prefix: '' },
    { file: 'restoration/index.html', prefix: '../', current: 'restoration' },
    { file: 'restoration/history/index.html', prefix: '../../', current: 'restoration' },
    { file: 'compare/index.html', prefix: '../', current: 'compare' },
    { file: 'changelog/index.html', prefix: '../', current: 'changelog' },
    ...data.posts.map((p) => ({ file: `changelog/${p.slug}/index.html`, prefix: '../../', current: 'changelog' })),
  ];

  it('is the same on every page, with Wiki and Notes between Compare and Development', () => {
    assert.match(home, /Compare<\/a>\n\s*<a href="wiki\/">Wiki<\/a>\n\s*<a href="changelog\/">Notes<\/a>\n\s*<a class="site-nav-dev"/);
    for (const p of pages) {
      const html = read(p.file);
      assert.match(html, new RegExp(`<link rel="stylesheet" href="${p.prefix}site/site-nav\\.css" />`), p.file);
      const nav = navOf(html);
      assert.equal(normal(nav, p.prefix), home, p.file);
      if (p.current) assert.match(nav, new RegExp(`href="${p.prefix.replace(/\./g, '\\.')}${p.current}/" aria-current="page"`), p.file);
      assert.equal((nav.match(/aria-current="page"/g) || []).length, 1, p.file);
    }
  });

  it('nothing links to changelog.html any more', () => {
    for (const p of pages) assert.ok(!read(p.file).includes('changelog.html'), p.file);
  });
});
