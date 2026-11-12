/**
 * The public Known gaps page (/restoration/gaps/): tools/gaps/build-data.mjs
 * writes public/restoration/gaps.json from the curated tools/gaps/public-gaps.json
 * and the private coverage register, the site's src/RestorationGaps.php draws
 * it, and tools/gaps/to-minn.mjs made the page. None of this needs the
 * research files: without the register, --check checks the committed JSON
 * against the curated list and the page's rules.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { STATES, citedHashes, contentProblems, curatedProblems } from '../tools/gaps/build-data.mjs';
import { LINK, PATH, gapsContent, withLink } from '../tools/gaps/to-minn.mjs';
import { restorationContent } from '../tools/restoration/to-minn.mjs';
import { GAME_DIR, SITE_DIR, sitePath, skipWithoutSite } from '../tools/repos.mjs';

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const gaps = readJson(join(GAME_DIR, 'public/restoration/gaps.json'));
const curated = readJson(join(GAME_DIR, 'tools/gaps/public-gaps.json'));
const builder = join(GAME_DIR, 'tools/gaps/build-data.mjs');
const listed = gaps.areas.flatMap((a) => a.items);

let hasPhp = true;
try {
  execFileSync('php', ['-v'], { stdio: 'ignore' });
} catch {
  hasPhp = false;
}

/** Runs RestorationGaps::draw over `data` (a part, or all), returning the HTML. */
function draw(data, part = 'all') {
  const dir = mkdtempSync(join(tmpdir(), 'gaps-'));
  const file = join(dir, 'in.json');
  writeFileSync(file, JSON.stringify(data));
  try {
    return execFileSync('php', ['-r', `require ${JSON.stringify(join(SITE_DIR, 'src/RestorationGaps.php'))}; echo Groddle\\Minn\\RestorationGaps::draw(json_decode(file_get_contents(${JSON.stringify(file)}), true), ${JSON.stringify(part)});`], { encoding: 'utf8' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('Known gaps data (tools/gaps/build-data.mjs)', () => {
  it('is current: gaps.json matches the curated list and the register (or, with no register here, the curated list alone)', () => {
    execFileSync(process.execPath, [builder, '--check'], { stdio: 'pipe' });
  });

  it('checks without the research files, as a public clone does', () => {
    const out = execFileSync(process.execPath, [builder, '--check'], { encoding: 'utf8', env: { ...process.env, GRODDLE_REGISTER: join(tmpdir(), 'no-register-here.md') } });
    assert.match(out, /no register here/);
  });

  it('lists every curated gap once, in its own words, with a state players are told about', () => {
    const ids = [...listed, ...gaps.purpose, ...gaps.ideas].map((g) => g.id);
    assert.deepEqual([...ids].sort(), curated.gaps.map((g) => g.id).sort());
    const byId = new Map(curated.gaps.map((g) => [g.id, g]));
    for (const it of [...listed, ...gaps.purpose, ...gaps.ideas]) assert.equal(it.text, byId.get(it.id).text, it.id);
    for (const it of listed) {
      assert.ok(['fixing', 'known', 'unreleased', 'fixed', 'lost'].includes(it.state), `${it.id} ${it.state}`);
      if (it.state === 'fixed') assert.match(it.version || '', /^v\d+\.\d+\.\d+$/, `${it.id} names its release`);
    }
    for (const g of curated.gaps.filter((x) => x.show === 'purpose')) assert.ok(gaps.purpose.some((p) => p.id === g.id), g.id);
    assert.deepEqual(Object.keys(gaps.states), Object.keys(STATES));
    for (const s of ['fixing', 'known', 'unreleased', 'fixed', 'lost']) assert.equal(gaps.counts[s], listed.filter((it) => it.state === s).length, s);
    assert.equal(gaps.counts.purpose, gaps.purpose.length);
    assert.equal(gaps.counts.idea, gaps.ideas.length);
    assert.deepEqual(curatedProblems(curated), []);
  });

  it('publishes no path, no @, no em-dash and no name on the deny list (built from the register\'s player references)', () => {
    assert.deepEqual(contentProblems(gaps), []);
    const raw = readFileSync(join(GAME_DIR, 'public/restoration/gaps.json'), 'utf8');
    assert.doesNotMatch(raw, /—/);
    assert.doesNotMatch(raw, /@/);
    // Hashed so the public repo never spells a player's name; each entry is 16 hex.
    const deny = readJson(join(GAME_DIR, 'tools/gaps/deny.json'));
    assert.ok(deny.any.length >= 20 && deny.exact.length >= 1);
    for (const h of [...deny.any, ...deny.exact]) assert.match(h, /^[0-9a-f]{16}$/);
  });

  it('catches each kind of forbidden content', () => {
    const hash = (w) => createHash('sha256').update(w).digest('hex').slice(0, 16);
    const deny = { any: [hash('zorblax')], exact: [hash('Quux')] };
    const one = (s) => contentProblems({ areas: [{ items: [{ text: s }] }] }, deny);
    assert.deepEqual(one('A plain line about Piggies.'), []);
    assert.equal(one('A line — with a dash.').length, 1);
    assert.equal(one('Fixed in js/quoins.js').length, 1);
    assert.equal(one('See game.js:120').length, 1);
    assert.equal(one('Thanks to someone@example.com').length, 1);
    assert.equal(one('Reported by ZorBlax on live').length, 1, 'any: matched in any case');
    assert.equal(one('Quux found it').length, 1, 'exact: the name as written');
    assert.deepEqual(one('quux is an ordinary word here'), [], 'exact: an ordinary word in lower case passes');
    // The file's own note may name the builder's path; players never see it.
    assert.deepEqual(contentProblems({ note: 'Written by tools/gaps/build-data.mjs' }, deny), []);
  });

  it('takes commit hashes, not numbers or ids, from a register row', () => {
    assert.deepEqual(citedHashes('done game a0d80a8da1 landed; server 7fab6a9; blog 57203525070; tsid LIFII3UBRFB3KBE; v0.30.0'), ['a0d80a8da1', '7fab6a9']);
  });
});

describe('Known gaps on the site (src/RestorationGaps.php)', () => {
  const fixture = {
    release: 'v9.8.7',
    states: STATES,
    counts: { fixing: 1, known: 1, unreleased: 0, fixed: 1, lost: 1, purpose: 1, idea: 1 },
    areas: [
      { name: 'Quests & rooms', items: [
        { id: 'F1', text: 'A <b>bold</b> claim', state: 'fixing' },
        { id: 'G1', text: 'Something known', state: 'known', report: 42 },
      ] },
      { name: 'Sounds', items: [
        { id: 'G2', text: 'A fixed thing', state: 'fixed', version: 'v1.2.3' },
        { id: 'G3', text: 'Nothing survived', state: 'lost' },
      ] },
    ],
    purpose: [{ id: 'P1', area: 'Trees', text: 'One pet a day' }],
    ideas: [{ id: 'G4', area: 'Items', text: 'A never-given item' }],
  };

  it('draws the counts, the areas with each gap\'s state, and the two lists, server-side', { skip: skipWithoutSite || (!hasPhp && 'no php on PATH') }, () => {
    const html = draw(fixture);
    assert.match(html, /<p class="gaps-total"><b>4<\/b> gaps listed, as of v9\.8\.7<\/p>/);
    assert.match(html, /<li class="gaps-count" style="--tone:var\(--sky\)"><b>1<\/b> Being fixed<\/li>/);
    assert.doesNotMatch(html, /Fixed, not released yet/, 'a state with nothing in it gets no chip');
    assert.match(html, /Below them: 1 difference on purpose, and 1 thing Glitch never built\./);
    assert.match(html, /<section class="gaps-area" aria-labelledby="gaps-area-1"><h3 id="gaps-area-1">Quests &amp; rooms<\/h3>/);
    assert.match(html, /data-state="fixed" style="--tone:var\(--moss\)"><span class="gaps-state">Fixed in v1\.2\.3<\/span>/);
    assert.match(html, /<span class="gaps-state">Not possible<\/span>/);
    assert.match(html, /<span class="gaps-report">Report #42<\/span>/);
    assert.match(html, /A &lt;b&gt;bold&lt;\/b&gt; claim/, 'words are escaped');
    assert.match(html, /<h2 class="gaps-h">On purpose<\/h2><ul class="gaps-plain gaps-plain-purpose"[^>]*><li><b>Trees<\/b> One pet a day<\/li>/);
    assert.match(html, /<h2 class="gaps-h">Never built in Glitch<\/h2><ul class="gaps-plain gaps-plain-idea"/);
    // The filter row waits hidden for the script; without it the whole list shows.
    assert.match(html, /<div class="filters gaps-filters" role="toolbar" aria-label="Show gaps by state" hidden><\/div>/);
    assert.doesNotMatch(html, /<script/);
  });

  it('draws each part on its own, and every gap in the real gaps.json', { skip: skipWithoutSite || (!hasPhp && 'no php on PATH') }, () => {
    assert.match(draw(fixture, 'summary'), /^<div class="gaps-summary">.*<\/div>$/s);
    assert.doesNotMatch(draw(fixture, 'summary'), /gaps-area/);
    assert.match(draw(fixture, 'list'), /^<div class="gaps-board" data-gaps-board>/);
    assert.match(draw(fixture, 'purpose'), /^<ul class="gaps-plain gaps-plain-purpose"/);
    assert.match(draw(fixture, 'ideas'), /^<ul class="gaps-plain gaps-plain-idea"/);
    const html = draw(gaps);
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
    for (const it of [...listed, ...gaps.purpose, ...gaps.ideas]) assert.ok(html.includes(esc(it.text)), it.id);
    assert.equal((html.match(/class="gaps-item"/g) || []).length, listed.length);
    assert.equal((html.match(/<section class="gaps-area"/g) || []).length, gaps.areas.length);
  });

  it('is wired into the site: block.json, minn.json, the extension, the script and the styles', { skip: skipWithoutSite }, () => {
    const block = readJson(sitePath('blocks/restoration-gaps/block.json'));
    assert.equal(block.name, 'groddle/restoration-gaps');
    assert.deepEqual(block.attributes.part.enum, ['all', 'summary', 'list', 'purpose', 'ideas']);
    assert.ok(readJson(sitePath('minn.json')).blocks.includes('groddle/restoration-gaps'));
    assert.match(readFileSync(sitePath('src/Extension.php'), 'utf8'), /RestorationGaps::register\(\$minn, \$root\);/);
    const php = readFileSync(sitePath('src/RestorationGaps.php'), 'utf8');
    assert.match(php, /\$root->dir \. '\/restoration\/gaps\.json'/, 'reads the built JSON through StaticRoot');
    assert.match(php, /SCRIPT = '\/wp-content\/themes\/groddle\/restoration\/gaps\.js'/);
    const js = readFileSync(sitePath('restoration/gaps.js'), 'utf8');
    for (const hook of ['data-gaps-board', '.gaps-filters', '.gaps-item', '.gaps-area', 'aria-pressed']) assert.ok(js.includes(hook), hook);
    // The page's own section of the theme's style.css, up to the next section's comment.
    const css = readFileSync(sitePath('style.css'), 'utf8');
    const from = css.indexOf('/* The Known gaps page');
    assert.ok(from >= 0, 'style.css has the Known gaps section');
    const next = css.indexOf('\n/* ', from + 1);
    const rules = css.slice(from, next < 0 ? undefined : next).replace(/\/\*[\s\S]*?\*\//g, '');
    for (const cls of ['.gaps-summary', '.gaps-area', '.gaps-state', '.gaps-plain', '@media (max-width: 640px)']) assert.ok(rules.includes(cls), cls);
    // Colours only from restoration.css's tokens, so light and dark both hold.
    assert.doesNotMatch(rules, /#[0-9a-f]{3,8}\b|rgba?\(/i);
  });
});

describe('Known gaps page in Minn (tools/gaps/to-minn.mjs)', () => {
  const content = gapsContent();

  it('draws the list from the block in four parts, with the words as core blocks', () => {
    for (const part of ['summary', 'list', 'purpose', 'ideas']) assert.equal(content.split(`<!-- wp:groddle/restoration-gaps {"part":"${part}"} /-->`).length, 2, part);
    assert.doesNotMatch(content, /wp:html/);
    assert.doesNotMatch(content, /—/, 'no em-dashes in page copy');
    const bands = [...content.matchAll(/<section class="wp-block-group band[^"]*" id="([a-z]+)">/g)].map((m) => m[1]);
    for (const [, id] of content.matchAll(/<a href="#([a-z]+)">/g)) assert.ok(bands.includes(id), id);
  });

  it('says how to report something missing and that the list follows the releases', () => {
    assert.match(content, /Report a bug/);
    assert.match(content, /<a href="\/chat\/bugs\/">Bugs board<\/a>/);
    assert.match(content, /updated with every release/);
  });

  it('links from the restoration page under Gone for good, once, keeping the page\'s own words', () => {
    assert.ok(restorationContent().includes(LINK), 'a page made fresh carries the link');
    const edited = '<!-- wp:paragraph -->\n<p>Austin\'s own words</p>\n<!-- /wp:paragraph -->\n\n<!-- wp:groddle/restoration-lost /-->\n\n<!-- wp:paragraph {"className":"note"} -->\n<p class="note">Edited note</p>\n<!-- /wp:paragraph -->';
    const linked = withLink(edited);
    assert.equal(linked.replace(`\n\n${LINK}`, ''), edited, 'only the link is added');
    assert.equal(linked.split(`href="${PATH}"`).length, 2);
    assert.equal(withLink(linked), null, 'a page that links here is left alone');
    assert.equal(withLink('<p>no list here</p>'), null);
  });
});
