/**
 * The Contribute page (/contribute/, Austin 2026-11-03): a Minn page made once
 * by tools/contribute/to-minn.mjs, with two theme blocks drawn by the site's
 * src/Contribute.php from public/contribute/data.json
 * (tools/contribute/build-data.mjs, from the hand-kept ledger.json): the street
 * with Pot's shrine, whose Donate opens GitHub Sponsors, and the open ledger,
 * worked out on the day the page is read. The PHP's arithmetic is held to the
 * builder's ledgerTotals here, on fixed dates.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { charges, contributeData, ledgerTotals, parseDate, toCents } from '../tools/contribute/build-data.mjs';
import { BANDS, EMAIL, SPONSORS, contributeContent } from '../tools/contribute/to-minn.mjs';
import { servedByMinn } from './minn-served.js';
import { sitePath, skipWithoutSite } from '../tools/repos.mjs';

const root = join(import.meta.dirname, '..');
const data = JSON.parse(readFileSync(join(root, 'public/contribute/data.json'), 'utf8'));
const ledger = JSON.parse(readFileSync(join(root, 'tools/contribute/ledger.json'), 'utf8'));

let php = true;
try { execFileSync('php', ['-v'], { stdio: 'ignore' }); } catch { php = false; }
const skipPhp = skipWithoutSite || (php ? false : 'no php on PATH');

/**
 * Runs the site's Contribute class under plain PHP (no engine): a stand-in for
 * the two Minn\Html helpers it draws with, then `body` with $d the data.
 */
function runPhp(d, body) {
  const dir = mkdtempSync(join(tmpdir(), 'contribute-'));
  try {
    writeFileSync(join(dir, 'data.json'), JSON.stringify(d));
    writeFileSync(join(dir, 'run.php'), `<?php
namespace Minn { if (!class_exists('Minn\\\\Html')) { final class Html {
  public static function esc($s): string { return htmlspecialchars((string) $s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }
  public static function attr($s): string { return htmlspecialchars((string) $s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }
  public static function split(string $s): array { return preg_split('/(<[^>]*>)/', $s, -1, PREG_SPLIT_DELIM_CAPTURE | PREG_SPLIT_NO_EMPTY); }
} } }
namespace {
require ${JSON.stringify(sitePath('src/Inline.php'))};
require ${JSON.stringify(sitePath('src/Contribute.php'))};
use Groddle\\Minn\\Contribute;
$d = json_decode(file_get_contents(${JSON.stringify(join(dir, 'data.json'))}), true);
${body}
}
`);
    return execFileSync('php', [join(dir, 'run.php')], { encoding: 'utf8' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Data with gifts and a month-end start, for the arithmetic's edges. */
const EDGES = {
  ...data,
  start: '2026-01-31',
  costs: [
    { id: 'monthly', name: 'Monthly', every: 'month', cents: 1250 },
    { id: 'yearly', name: 'Yearly', every: 'year', cents: 999 },
  ],
  in: [
    { date: '2026-02-01', source: 'GitHub Sponsors', cents: 500 },
    { date: '2026-03-10', source: 'GitHub Sponsors', cents: 2550 },
  ],
};
const DAYS = ['2026-10-31', '2026-11-01', '2026-11-03', '2026-11-30', '2026-12-01', '2027-03-15', '2027-10-31', '2027-11-01', '2028-02-29'];
const EDGE_DAYS = ['2026-01-30', '2026-01-31', '2026-02-27', '2026-02-28', '2026-03-09', '2026-03-10', '2026-03-31', '2027-01-30', '2027-01-31', '2028-02-29'];

describe('the Contribute page data (tools/contribute/build-data.mjs)', () => {
  it('is current: data.json is what the builder writes from ledger.json', () => {
    execFileSync(process.execPath, [join(root, 'tools/contribute/build-data.mjs'), '--check'], { stdio: 'pipe' });
  });

  it('holds the ledger Austin set out: from 1 November 2026, the domain yearly and three monthly costs, money in by hand', () => {
    assert.equal(ledger.start, '2026-11-01');
    assert.equal(ledger.sponsors, SPONSORS);
    assert.deepEqual(data.costs.map((c) => [c.id, c.every, c.cents]), [['domain', 'year', 1000], ['server', 'month', 600], ['hosting', 'month', 2000], ['ai', 'month', 5000]]);
    assert.ok(Array.isArray(ledger.in), 'money in is a list kept by hand');
    assert.equal(data.shrine.name, 'Pot');
    for (const key of ['sheet', 'sheet3x']) assert.ok(existsSync(join(root, 'public', data.shrine[key])), key);
  });

  it('charges a monthly cost on the start day of each month and a yearly one on each anniversary', () => {
    const t = (iso) => ledgerTotals(data, iso);
    assert.equal(t('2026-10-31').out, 0);
    assert.equal(t('2026-11-01').out, 8600, 'the first day: $76 of monthly costs and the $10 domain');
    assert.deepEqual([t('2026-11-03').out, t('2026-11-03').months], [8600, 1]);
    assert.deepEqual([t('2026-12-01').out, t('2026-12-01').months], [16200, 2]);
    const march = t('2027-03-15');
    assert.deepEqual([march.out, march.months, march.in, march.difference], [39000, 5, 0, -39000]);
    assert.deepEqual(march.costs.map((c) => c.times), [1, 5, 5, 5]);
    assert.deepEqual([t('2027-10-31').out, t('2027-11-01').out], [92200, 100800], 'the domain renews on the anniversary');
    // A start on the 31st: a short month is charged on its last day, a leap day's anniversary on 28 February.
    const s = parseDate('2026-01-31');
    assert.deepEqual(['2026-01-30', '2026-01-31', '2026-02-27', '2026-02-28', '2026-03-30', '2026-03-31'].map((iso) => charges(s, 'month', parseDate(iso))), [0, 1, 1, 2, 2, 3]);
    const leap = parseDate('2028-02-29');
    assert.deepEqual(['2029-02-27', '2029-02-28', '2032-02-28', '2032-02-29'].map((iso) => charges(leap, 'year', parseDate(iso))), [1, 2, 4, 5]);
    // Money in counts from the day it came.
    assert.deepEqual([ledgerTotals(EDGES, '2026-03-09').in, ledgerTotals(EDGES, '2026-03-10').in, ledgerTotals(EDGES, '2026-03-10').gifts], [500, 3050, 2]);
  });

  it('refuses a ledger it cannot draw honestly', () => {
    const bad = (change) => () => contributeData({ ...ledger, ...change });
    assert.throws(bad({ start: '2026-02-30' }), /start/);
    assert.throws(bad({ costs: [{ id: 'x', name: 'X', amount: 5, every: 'week' }] }), /every/);
    assert.throws(bad({ costs: [{ id: 'x', name: 'X', amount: 0, every: 'month' }] }), /amount/);
    assert.throws(bad({ in: [{ date: '2026-10-01', amount: 5, source: 'GitHub Sponsors' }] }), /on or after/);
    assert.throws(bad({ in: [{ date: '2026-11-10', amount: 5, source: '' }] }), /source/);
    assert.throws(() => toCents(1.005, 'x'), /two decimals/);
    assert.throws(() => toCents('5', 'x'), /amount/);
    assert.equal(toCents(5.5, 'x'), 550);
    assert.deepEqual(contributeData({ ...ledger, in: [{ date: '2026-12-02', amount: 25, source: 'GitHub Sponsors' }, { date: '2026-11-20', amount: 5, source: 'GitHub Sponsors' }] }).in.map((e) => e.date), ['2026-11-20', '2026-12-02']);
  });
});

describe('the site draws the ledger and the shrine (groddle-afternoon-site src/Contribute.php)', () => {
  it('works out the same totals as the builder on every day tried', { skip: skipPhp }, () => {
    for (const [d, days] of [[data, DAYS], [EDGES, EDGE_DAYS]]) {
      const out = runPhp(d, `foreach (${JSON.stringify(days)} as $day) echo json_encode(Contribute::totals($d, $day)), "\\n";`).trim().split('\n').map((l) => JSON.parse(l));
      assert.deepEqual(out, days.map((day) => ledgerTotals(d, day)));
    }
  });

  it('draws the ledger for a fixed day: totals, each cost, and nothing in yet', { skip: skipPhp }, () => {
    const html = runPhp(data, `echo Contribute::ledger($d, '2027-03-15', 'Updated automatically each month. Money in is added by hand when it arrives.');`);
    const num = (label) => html.match(new RegExp(`<p class="tile-label">${label}</p><div class="tile-num">([^<]+)</div>`))?.[1];
    assert.equal(num('Money in, all time'), '$0');
    assert.equal(num('Money out, all time'), '$390');
    assert.equal(num('Difference'), '\u2212$390');
    assert.equal(num('Months counted'), '5');
    assert.match(html, /<th scope="row">Domain \(groddleafternoon\.com\)<span class="ct-every">Every year, on 1 November<\/span><\/th><td class="ct-when">Every year, on 1 November<\/td><td class="ct-num">\$10<\/td><td class="ct-num ct-times">1<\/td><td class="ct-num">\$10<\/td>/);
    assert.match(html, /<th scope="row">AI tokens<span class="ct-every">Every month, on the 1st<\/span><\/th><td class="ct-when">Every month, on the 1st<\/td><td class="ct-num">\$50<\/td><td class="ct-num ct-times">5<\/td><td class="ct-num">\$250<\/td>/);
    assert.match(html, /<th scope="row">Money out<span class="ct-every">\$76 a month and \$10 a year<\/span><\/th><td class="ct-when">\$76 a month and \$10 a year<\/td><td><\/td><td class="ct-times"><\/td><td class="ct-num">\$390<\/td>/);
    assert.match(html, /Nothing has come in yet\./);
    assert.match(html, /As of 15 March 2027\. Updated automatically each month\. Money in is added by hand when it arrives\./);
    const gifts = runPhp(EDGES, `echo Contribute::ledger($d, '2026-03-10', '');`);
    assert.match(gifts, /<td><time datetime="2026-03-10">10 March 2026<\/time><\/td><td>GitHub Sponsors<\/td><td class="ct-num">\$25\.50<\/td>/);
    assert.match(gifts, /<p class="tile-label">Money in, all time<\/p><div class="tile-num">\$30\.50<\/div><p class="tile-note">From 2 gifts<\/p>/);
  });

  it('draws the shrine as a link to Sponsors that the script turns into the game\'s verb menu', { skip: skipPhp }, () => {
    const html = runPhp(data, `$m = new ReflectionMethod(Contribute::class, 'shrine'); echo $m->invoke(null, $d, 'Click the shrine', 'Opens GitHub Sponsors in a new tab.');`);
    assert.match(html, new RegExp(`<a class="ct-shrine" id="ct-shrine" href="${SPONSORS}" target="_blank" rel="noopener" data-ct-shrine>`));
    assert.match(html, /<span class="ct-nameplate">Shrine to Pot<\/span>/);
    assert.match(html, /<div class="ct-menu" id="ct-shrine-menu" role="menu" aria-labelledby="ct-shrine-menu-title" hidden>/);
    assert.match(html, new RegExp(`<a class="ct-menu-row" role="menuitem" href="${SPONSORS}" target="_blank" rel="noopener" aria-keyshortcuts="1"><span class="ct-key" aria-hidden="true">1</span><span class="ct-label">Donate</span>`));
    assert.ok(html.includes(data.shrine.description));
    const script = readFileSync(join(root, 'public/contribute/contribute.js'), 'utf8');
    for (const hook of ['[data-ct-street]', '[data-ct-shrine]', '.ct-menu', '[role="menuitem"]', '[data-ct-sr]']) assert.ok(script.includes(`'${hook}'`), hook);
    for (const hook of ['data-ct-street', 'data-ct-shrine', 'data-ct-sr']) assert.ok(html.includes(hook), hook);
    // Every picture on the street is the game's own art.
    const pictures = [...html.matchAll(/src="([^"]+)"/g), ...html.matchAll(/url\(&#039;([^&]+)&#039;\)/g)].map((m) => m[1]);
    assert.ok(pictures.length >= 10);
    for (const src of pictures) {
      assert.match(src, /^\/assets\/(decos|sprites)\//, src);
      assert.ok(existsSync(join(root, 'public', src)), src);
    }
  });

  it('styles it from the site\'s tokens, both themes, and its art from the game', { skip: skipWithoutSite }, () => {
    const css = readFileSync(sitePath('style.css'), 'utf8');
    const ours = css.slice(css.indexOf('/* The Contribute page'), css.indexOf('/* The Known gaps page') > 0 ? css.indexOf('/* The Known gaps page') : undefined); // later pages' own sections follow
    assert.ok(ours.length > 2000);
    const tokens = new Set([...readFileSync(join(root, 'public/restoration/restoration.css'), 'utf8').matchAll(/(--[a-z-]+):/g)].map((m) => m[1]));
    const local = new Set(['--u', '--x', '--b', '--w', '--fw', '--fh', '--sheet']);
    for (const [, name] of ours.matchAll(/var\((--[a-z-]+)/g)) assert.ok(tokens.has(name) || local.has(name), `${name} is a restoration.css token`);
    for (const [, url] of ours.matchAll(/url\("([^"]+)"\)/g)) assert.ok(existsSync(join(root, 'public', url)), url);
    assert.match(ours, /@media \(prefers-reduced-motion: reduce\)/);
  });
});

describe('the Contribute page (tools/contribute/to-minn.mjs)', () => {
  const content = contributeContent();

  it('is words in core blocks around its three data blocks, in the house style', { skip: skipWithoutSite }, () => {
    const names = new Set([...content.matchAll(/<!-- wp:([a-z0-9/-]+)/g)].map((m) => m[1]));
    assert.deepEqual([...names].sort(), ['groddle/contribute-credits', 'groddle/contribute-ledger', 'groddle/contribute-shrine', 'group', 'heading', 'list', 'list-item', 'paragraph']);
    const declared = JSON.parse(readFileSync(sitePath('minn.json'), 'utf8')).blocks;
    for (const name of names) if (name.startsWith('groddle/')) assert.ok(declared.includes(name), name);
    assert.doesNotMatch(content, /\u2014/, 'no em-dashes');
    assert.doesNotMatch(content, /wp:html/);
    const bands = [...content.matchAll(/<section class="wp-block-group band[^"]*" id="([a-z]+)">/g)].map((m) => m[1]);
    assert.deepEqual(bands, BANDS.map(([id]) => id));
    for (const [, id] of content.matchAll(/<a href="#([a-z]+)">/g)) assert.ok(bands.includes(id), id);
  });

  it('points at the ways to help: the repos, playing and reporting, the address for materials, and Sponsors', () => {
    for (const repo of ['groddle-afternoon', 'groddle-afternoon-server', 'groddle-afternoon-site']) assert.ok(content.includes(`href="https://github.com/TinyBitAdventures/${repo}"`), repo);
    assert.ok(content.includes('href="/play/"') && content.includes('href="/play/online/"'));
    assert.match(content, /press R\b/);
    assert.ok(content.includes(`<a href="mailto:${EMAIL}">${EMAIL}</a>`), 'the address as a mail link and as text');
    assert.ok(content.includes(`href="${SPONSORS}"`));
    assert.match(content, /free to play and open source\. I have no plans to charge for it or to run ads\./);
    assert.match(content, /CC0/);
  });

  it('refuses to overwrite the page without --force, makes it full width, and is served by Minn over a data folder', () => {
    const src = readFileSync(join(root, 'tools/contribute/to-minn.mjs'), 'utf8');
    assert.match(src, /if \(found\[0\] && !args\.force\) \{/);
    assert.match(src, /slug: 'contribute', status: 'publish', template: 'page-wide'/);
    assert.ok(servedByMinn('/contribute/'));
    assert.ok(!existsSync(join(root, 'public/contribute/index.html')), 'no built page shadows the Minn page');
  });
});
