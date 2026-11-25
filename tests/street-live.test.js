/**
 * G1277 (report #686): a street page's "On the street now". A player found no Wood Trees on Thicket
 * where its Encyclopedia page lists 3: all three had been felled on the live server, and a felled
 * Wood Tree is a Patch, as in Glitch (wood_tree.js onDie 857-866). Austin 2026-11-25: "Maybe the live
 * count could say last check within last 24 hours, so a cached lookup rather then a realtime check.
 * Then mention trees can die and new ones can be planted so their locations overtime change."
 *
 * - The realtime server counts each street's trees, standing and gone, and its shared Patches
 *   (groddle-afternoon-server streetcounts.go, its own go tests).
 * - The site keeps that count, asks again at most once an hour, and serves one street of it with
 *   its time, never a count older than a day (groddle-afternoon-site src/StreetLive.php, run here
 *   through the php CLI).
 * - The page (tools/encyclopedia/streets.mjs liveBlock) carries the block hidden and the sentence
 *   always; public/encyclopedia/street-live.js fills and shows the block, or leaves it hidden.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SITE_DIR, sitePath, skipWithoutSite } from '../tools/repos.mjs';
import { LIVE_NOTE } from '../tools/encyclopedia/streets.mjs';
import { agoText, fill, liveLines, load } from '../public/encyclopedia/street-live.js?v=1df27e44';
import { HAS_PHP, PHP } from './php.js';

const root = join(import.meta.dirname, '..');
const page = (slug) => readFileSync(join(root, 'public/encyclopedia/streets', slug, 'index.html'), 'utf8');
const THICKET = 'GLI23Q4NDHD11EK';
const NAMES = { trant_bean: 'Bean Tree', trant_bubble: 'Bubble Tree', trant_gas: 'Gas Plant', wood_tree: 'Wood Tree', trant_spice: 'Spice Plant' };

/** A stand-in for the page's block: what fill() touches. */
function block(names = NAMES) {
  const when = { textContent: '' };
  const list = { innerHTML: '' };
  return {
    hidden: true,
    dataset: { liveNames: JSON.stringify(names), liveStreet: THICKET, liveUrl: '../../../wp-json/groddle/v1/streets/live' },
    querySelector: (sel) => ({ '.st-live-when': when, '.st-live-list': list })[sel],
    when,
    list,
  };
}

describe('street-live.js: the line a street page shows', () => {
  it('says how long ago the count was taken', () => {
    assert.equal(agoText(5), 'checked just now');
    assert.equal(agoText(-30), 'checked just now', 'a clock a little ahead');
    assert.equal(agoText(60), 'checked 1 minute ago');
    assert.equal(agoText(59 * 60 + 59), 'checked 59 minutes ago');
    assert.equal(agoText(3 * 3600 + 100), 'checked 3 hours ago');
    assert.equal(agoText(3600), 'checked 1 hour ago');
    assert.equal(agoText(86400), 'checked a day ago');
  });

  it('Thicket with its three Wood Trees felled, as on the live server', () => {
    const row = { trees: { wood_tree: [0, 3], trant_bean: [1, 0], trant_bubble: [1, 0], trant_gas: [1, 0] } };
    assert.deepEqual(liveLines(row, NAMES), [
      'Bean Tree: standing',
      'Bubble Tree: standing',
      'Gas Plant: standing',
      'Wood Tree: none of 3 standing (all 3 felled, Patches now)',
    ]);
  });

  it('some standing, one tree, trants that died, and the shared Patches', () => {
    assert.deepEqual(liveLines({ trees: { wood_tree: [2, 1] } }, NAMES), ['Wood Tree: 2 of 3 standing (1 felled, a Patch now)']);
    assert.deepEqual(liveLines({ trees: { wood_tree: [1, 2] } }, NAMES), ['Wood Tree: 1 of 3 standing (2 felled, Patches now)']);
    assert.deepEqual(liveLines({ trees: { wood_tree: [0, 1] } }, NAMES), ['Wood Tree: none standing (it was felled and is a Patch now)']);
    assert.deepEqual(liveLines({ trees: { wood_tree: [3, 0] } }, NAMES), ['Wood Tree: all 3 standing']);
    assert.deepEqual(liveLines({ trees: { trant_bean: [0, 1], trant_gas: [1, 2] } }, NAMES), ['Bean Tree: none standing (it died)', 'Gas Plant: 1 of 3 standing (2 died)']);
    assert.deepEqual(liveLines({ patches: { empty: 4, seedlings: 1, dead: 2, grown: { trant_spice: 2, trant_bean: 1, trant_unknown: 1 } } }, NAMES), [
      'Grown since in its Patches: Bean Tree, Spice Plant 2',
      '1 Seedling growing in its Patches',
      '2 dead trees waiting to be cleared',
      '4 empty Patches',
    ]);
    assert.deepEqual(liveLines({ patches: { empty: 1 } }, NAMES), ['1 empty Patch']);
    assert.deepEqual(liveLines({ trees: { paper_tree: [1, 0] } }, NAMES), [], 'a class the page has no name for is left out');
    for (const l of liveLines({ trees: { wood_tree: [1, 2], trant_gas: [0, 1] }, patches: { empty: 2, seedlings: 2, dead: 1, grown: { trant_spice: 1 } } }, NAMES)) assert.doesNotMatch(l, /—/);
  });

  it('fills and shows the block from the site\'s answer', () => {
    const el = block();
    const checked = 1_764_000_000;
    assert.equal(fill(el, { checked, street: { trees: { wood_tree: [0, 3] } } }, (checked + 3 * 3600 + 5) * 1000), true);
    assert.equal(el.hidden, false);
    assert.equal(el.when.textContent, '(checked 3 hours ago)');
    assert.equal(el.list.innerHTML, '<li>Wood Tree: none of 3 standing (all 3 felled, Patches now)</li>');
  });

  it('leaves the block hidden without a count, a street row or anything named', () => {
    for (const answer of [null, {}, { checked: null }, { checked: 1, street: null }, { checked: '1', street: { trees: { wood_tree: [1, 0] } } }, { checked: 1, street: { trees: { paper_tree: [1, 0] } } }]) {
      const el = block();
      assert.equal(fill(el, answer, Date.now()), false, JSON.stringify(answer));
      assert.equal(el.hidden, true);
      assert.equal(el.list.innerHTML, '');
    }
  });

  it('asks the site for its street, and stays hidden when the site is not there or fails', async () => {
    globalThis.document = { baseURI: 'https://groddle.localhost/encyclopedia/streets/thicket/' };
    try {
      const asked = [];
      const now = () => 1_764_000_000_000;
      const ok = (body) => async (url, opts) => { asked.push([String(url), opts.credentials]); return { ok: true, json: async () => body }; };
      const el = block();
      assert.equal(await load(el, ok({ checked: 1_763_999_000, street: { trees: { wood_tree: [0, 3] } } }), now), true);
      assert.deepEqual(asked, [[`https://groddle.localhost/wp-json/groddle/v1/streets/live?street=${THICKET}`, 'omit']]);
      assert.equal(el.hidden, false);
      assert.equal(el.when.textContent, '(checked 16 minutes ago)');
      for (const fetchFn of [async () => ({ ok: false, json: async () => ({}) }), async () => { throw new TypeError('offline'); }, async () => ({ ok: true, json: async () => { throw new SyntaxError('html'); } }), ok({ checked: null })]) {
        const quiet = block();
        assert.equal(await load(quiet, fetchFn, now), false);
        assert.equal(quiet.hidden, true);
      }
    } finally {
      delete globalThis.document;
    }
  });
});

describe('the built street pages (tools/encyclopedia/streets.mjs liveBlock)', () => {
  it('Thicket carries the block hidden, its street id, the names, the script and the sentence', () => {
    const html = page('thicket');
    const m = /<div class="st-live" data-live-street="([^"]+)" data-live-url="([^"]+)" data-live-names="([^"]+)" hidden>/.exec(html);
    assert.ok(m, 'the block');
    assert.equal(m[1], THICKET);
    assert.equal(m[2], '../../../wp-json/groddle/v1/streets/live');
    assert.deepEqual(JSON.parse(m[3].replace(/&quot;/g, '"')), { trant_bean: 'Bean Tree', trant_bubble: 'Bubble Tree', trant_gas: 'Gas Plant', wood_tree: 'Wood Tree' });
    assert.match(html, /<script type="module" src="\.\.\/\.\.\/\.\.\/encyclopedia\/street-live\.js\?v=[0-9a-f]{8}"><\/script>/);
    assert.ok(html.includes(`<p class="ency-lead-small st-live-note">${LIVE_NOTE}</p>`));
    assert.doesNotMatch(LIVE_NOTE, /—/);
    // The starting counts stay as they were: Wood Tree 3.
    assert.match(html, /<span>Wood Tree <b>3<\/b>/);
  });

  it('a street with shared Patches names every tree that can grow in them', () => {
    const html = page('manggai-mile');
    const names = JSON.parse(/data-live-names="([^"]+)"/.exec(html)[1].replace(/&quot;/g, '"'));
    for (const c of ['trant_bean', 'trant_bubble', 'trant_egg', 'trant_fruit', 'trant_gas', 'trant_spice', 'wood_tree']) assert.ok(names[c], c);
  });

  it('a street with no trees and no Patches has neither the block, the script nor the sentence', () => {
    const html = page('afar-whence');
    assert.doesNotMatch(html, /st-live|street-live\.js/);
  });
});

const hasPhp = HAS_PHP;
const skipPhp = skipWithoutSite || (!hasPhp && 'needs the php CLI');

function php(op, args) {
  const code = `
    require ${JSON.stringify(SITE_DIR)} . '/src/StreetLive.php';
    use Groddle\\Minn\\StreetLive;
    $in = json_decode(stream_get_contents(STDIN), true);
    $a = $in['args'];
    $out = match ($in['op']) {
      'snapshot' => StreetLive::snapshot($a[0], $a[1]),
      'due' => StreetLive::due($a[0], $a[1], $a[2]),
      'answer' => StreetLive::answer($a[0], $a[1], $a[2]),
      'read' => StreetLive::read($a[0]),
      'consts' => [StreetLive::REFRESH, StreetLive::RETRY, StreetLive::KEEP, StreetLive::MAX_AGE],
    };
    echo json_encode($out);`;
  return JSON.parse(String(execFileSync(PHP, ['-r', code], { input: JSON.stringify({ op, args }) })));
}

describe('the site keeps the count and serves it with its time (src/StreetLive.php)', { skip: skipPhp }, () => {
  const now = 1_764_050_000;
  const server = {
    status: 'ok', http: 200, at: now * 1000,
    streets: {
      [THICKET]: { trees: { wood_tree: [0, 3], trant_bean: [1, 0] } },
      GM4103L52ID23: { trees: { trant_fruit: [1, 0] }, patches: { empty: 5, seedlings: 1, dead: 0, grown: { trant_spice: 1 } } },
      'bad street': { trees: { wood_tree: [1, 0] } },
      GA5BADVALUES0001: { trees: { wood_tree: [-1, 0], 'Bad Class': [1, 0], trant_gas: [1] }, patches: { empty: 'x', grown: { trant_bean: 0 } }, player: { id: 7 } },
    },
  };

  it('a good answer is kept with the site\'s time, every value checked, nothing else carried', () => {
    const snap = php('snapshot', [server, now]);
    assert.deepEqual(snap, {
      checked: now,
      streets: {
        GLI23Q4NDHD11EK: { trees: { trant_bean: [1, 0], wood_tree: [0, 3] } },
        GM4103L52ID23: { trees: { trant_fruit: [1, 0] }, patches: { empty: 5, seedlings: 1, grown: { trant_spice: 1 } } },
      },
    });
    assert.deepEqual(php('read', [JSON.stringify(snap)]), snap);
    for (const bad of [null, { status: 'refused', http: 401 }, { status: 'ok', http: 500, streets: {} }, { status: 'ok', http: 200 }]) assert.equal(php('snapshot', [bad, now]), null);
    for (const bad of ['', 'not json', '{"checked":"1","streets":{}}', '{"checked":1}']) assert.equal(php('read', [bad]), null);
  });

  it('asks again only once the count is an hour old, and not more than every five minutes', () => {
    assert.deepEqual(php('consts', []), [3600, 300, 86400, 600]);
    const snap = (age) => ({ checked: now - age, streets: {} });
    assert.equal(php('due', [null, 0, now]), true, 'no count yet');
    assert.equal(php('due', [snap(59 * 60), 0, now]), false);
    assert.equal(php('due', [snap(3600), 0, now]), true);
    assert.equal(php('due', [snap(3600), now - 299, now]), false, 'the server did not answer a moment ago');
    assert.equal(php('due', [null, now - 300, now]), true);
  });

  it('serves one street with the count\'s time; nothing past a day', () => {
    const snap = php('snapshot', [server, now - 3 * 3600]);
    assert.deepEqual(php('answer', [snap, THICKET, now]), { checked: now - 3 * 3600, street: { trees: { trant_bean: [1, 0], wood_tree: [0, 3] } } });
    assert.deepEqual(php('answer', [snap, 'GNOTHINGHERE001', now]), { checked: now - 3 * 3600, street: null });
    assert.deepEqual(php('answer', [{ ...snap, checked: now - 86401 }, THICKET, now]), { checked: null });
    assert.deepEqual(php('answer', [null, THICKET, now]), { checked: null });
  });

  it('the route is public, registered, cached and signed through RealtimeCall', () => {
    const src = readFileSync(sitePath('src/StreetLive.php'), 'utf8');
    assert.match(src, /#\[Route\(Method::Get, '\/groddle\/v1\/streets\/live', policy: new Policy\(Access::Public\)\)\]/);
    assert.match(src, /'Cache-Control', 'public, max-age='/);
    assert.match(src, /new RealtimeCall\(\$this->minn\)\)->post\('street_counts'/);
    assert.match(src, /setOption\(self::OPTION, .*'off'\)/);
    assert.match(readFileSync(sitePath('src/Extension.php'), 'utf8'), /new StreetLive\(\$minn\)/);
  });
});
