/**
 * The encyclopedia read as text (ticket 65): copied text, Reader mode, screen
 * readers and text extraction see the markup, not the CSS that lays a tile's
 * name over its role line. Two words in neighbouring elements with nothing
 * between them ("Beelzebooze" + "involves it") read as "Beelzeboozeinvolves it",
 * so every built page under public/encyclopedia/ is read the way inline
 * concatenation would (tags stripped, nothing inserted) and any such join
 * across inline elements fails. Joins across block elements (p, li, dt/dd ...)
 * are left alone: every reader breaks the line there. The parts put a real
 * space or a hidden comma/full stop (.ency-sep, catalog.css) between them.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { makeParts, sep, tsHtml } from '../tools/encyclopedia/parts.mjs';
import { gsjsHtml } from '../tools/catalog/build.mjs';

const spike = join(import.meta.dirname, '..');
const pub = join(spike, 'public');
const dir = join(pub, 'encyclopedia');

/** Elements every reader breaks a line at (the HTML block elements, plus <br>). */
const BLOCK = new Set('address article aside blockquote br caption dd details dialog div dl dt fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hgroup hr li main nav ol option p pre section select summary table tbody td tfoot th thead tr ul'.split(' '));
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', middot: '·', times: '×', rarr: '→', hellip: '…' };
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => (e[0] === '#'
  ? String.fromCodePoint(/^#x/i.test(e) ? parseInt(e.slice(2), 16) : Number(e.slice(1)))
  : ENTITIES[e.toLowerCase()] ?? m));
/** A word, a number or closing punctuation, then a word, a number or opening punctuation. */
const ENDS = /[\p{L}\p{N}\p{Pe}\p{Pf}.,;:!?%]$/u;
const STARTS = /^[\p{L}\p{N}\p{Ps}\p{Pi}]/u;

/** The text runs of an HTML fragment, each with the tags since the run before. */
function runs(html) {
  const re = /<!--[\s\S]*?-->|<(script|style|template|svg|noscript)\b[\s\S]*?<\/\1>|<\/?([a-zA-Z][\w-]*)[^>]*>|([^<]+)/g;
  const out = [];
  let tags = [];
  let m;
  while ((m = re.exec(html))) {
    if (m[2]) tags.push(m[2].toLowerCase());
    else if (m[3] !== undefined) { out.push({ text: decode(m[3]), tags }); tags = []; }
  }
  return out;
}

/** Places where two elements' texts join with no space or punctuation between them. */
function joins(html) {
  const found = [];
  let prev = null;
  for (const r of runs(html)) {
    if (!r.text.trim()) { if (prev) prev.spaced = true; continue; }
    if (prev && !prev.spaced && !/^\s/.test(r.text) && ENDS.test(prev.text) && STARTS.test(r.text)
      && r.tags.length && !r.tags.some((t) => BLOCK.has(t))) found.push(`…${prev.text.slice(-24)}|${r.text.slice(0, 24)}… across ${r.tags.join(' ')}`);
    prev = { text: r.text, spaced: /\s$/.test(r.text) };
  }
  return found;
}
/** The text inline concatenation reads (tags stripped, nothing inserted). */
const readAsText = (html) => runs(html).map((r) => r.text).join('').replace(/\s+/g, ' ').trim();

function* pages(d) {
  for (const x of readdirSync(d, { withFileTypes: true })) {
    if (x.isDirectory()) yield* pages(join(d, x.name));
    else if (x.name.endsWith('.html')) yield join(d, x.name);
  }
}

describe('encyclopedia text', () => {
  it('finds the joins of ticket 65 in the old markup', () => {
    assert.deepEqual(joins('<a class="ency-tile"><span class="ency-tile-name">Beelzebooze</span><span class="ency-tile-sub">involves it</span></a>').length, 1);
    assert.deepEqual(joins('<a class="ency-card"><span class="ency-card-name">Items <span class="count">988</span></span><span class="ency-card-blurb">Every item</span></a>').length, 1);
    assert.deepEqual(joins('<a><span>Previous</span>Wicked Bolognese Sauce</a>').length, 1);
    assert.deepEqual(joins('<ul><li>Apple</li><li>Banana</li></ul><dl><dt>Kind</dt><dd>Animals</dd></dl>'), []);
    assert.deepEqual(joins('<span>Apple</span> <span>Banana</span>, <em>cherry</em>.'), []);
  });

  it('has no words that run together on any built page, items included', () => {
    const bad = [];
    let n = 0;
    for (const f of pages(dir)) {
      n++;
      const html = readFileSync(f, 'utf8');
      for (const j of joins(html.slice(html.indexOf('<body')))) bad.push(`${f.slice(pub.length + 1)}: ${j}`);
    }
    assert.ok(n > 2000, `only ${n} pages`);
    assert.deepEqual(bad.slice(0, 20), [], `${bad.length} joins`);
  });

  it('reads the reported pages with commas and full stops', () => {
    const page = (rel) => readAsText(readFileSync(join(dir, rel), 'utf8'));
    const wine = page('items/wine_of_the_dead/index.html');
    for (const s of ['Day of the Undead Butlers, a reward', 'Beelzebooze, involves it', "Hell's Bartender, trade a Drink Ticket", 'Previous: ', 'Next: ']) assert.ok(wine.includes(s), s);
    assert.ok(page('quests/hell_quest/index.html').includes('in a Hell Hole, finish it first'));
    const home = page('index.html');
    assert.match(home, /Items [\d,]+\. Every item, how to get it/);
    for (const s of ['Quests', 'Animals and creatures', 'People', 'Skills', 'Places', 'Achievements']) assert.match(home, new RegExp(`${s} [\\d,]+\\. [A-Z]`), s);
  });

  it('gives the parts real separators: tiles, counts, chips, store cards and prices', () => {
    const info = (k) => ({ 'item:apple': { name: 'Apple', status: 'source' }, 'skills:x': { name: 'Cheffery I', status: 'source' }, 'item:knife_and_board': { name: 'Knife & Board', status: 'source' } }[k] || null);
    const P = makeParts('../', info);
    assert.equal(readAsText(P.tile('item:apple', { sub: 'a reward', n: 3 })), '×3 Apple, a reward');
    assert.equal(readAsText(P.tile('item:apple')), 'Apple');
    assert.equal(readAsText(P.chips([P.chip('75 iMG'), P.currants(50, 'ency-chip'), P.chip('Tii <b>3</b>', { link: '#' })])), '75 iMG, 50 currants, Tii 3');
    assert.equal(readAsText(P.vendorCard('item:apple', { price: 12, label: 'Produce Vendor' })), 'Produce Vendor, 12 currants');
    assert.equal(readAsText(P.recipeRow({ inputs: [{ classTsid: 'apple', qty: 2 }], outputs: [{ classTsid: 'apple', qty: 1 }], tool: 'knife_and_board', skill: 'x' })),
      '×2 Apple → Apple with a Knife & Board, needs Cheffery I');
    // The separator is inline (not the absolute .visually-hidden), so Chrome keeps it on its word.
    assert.equal(sep('.'), '<span class="ency-sep">.</span>');
    const css = readFileSync(join(dir, 'items/catalog.css'), 'utf8');
    assert.match(css, /\.ency-sep \{ display: inline-block; width: 1px; height: 1px; margin-right: -1px; overflow: hidden; clip-path: inset\(50%\);/);
  });

  it('spaces a link that Tiny Speck ran into the next word (peat: "Shovel</a>or")', () => {
    const src = 'This can be dug with <a glitch="item|shovel">Shovel</a>or <a glitch="item|ace_of_spades">Ace of Spades</a>.';
    assert.equal(readAsText(gsjsHtml(src, (id) => `../${id}/`).join('')), 'This can be dug with Shovel or Ace of Spades.');
    assert.equal(readAsText(tsHtml(src, (id) => `../${id}/`).join('')), 'This can be dug with Shovel or Ace of Spades.');
    assert.equal(readAsText(gsjsHtml('Two <a glitch="item|apple">Apple</a>, please', (id) => id).join('')), 'Two Apple, please');
  });

  it('draws the search tiles and the item grid with the same separators', () => {
    const ency = readFileSync(join(dir, 'encyclopedia.js'), 'utf8');
    assert.match(ency, /<\/span> <span class="ency-tile-name">\$\{esc\(e\.n\)\}<span class="ency-sep">,<\/span><\/span> <span class="ency-tile-sub">/);
    const grid = readFileSync(join(dir, 'items/catalog.js'), 'utf8');
    assert.match(grid, /<span class="cat-name">\$\{esc\(item\.name\)\}<span class="ency-sep">,<\/span><\/span> <span class="cat-st/);
  });
});
