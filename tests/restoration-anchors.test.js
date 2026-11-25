/**
 * A #link into /restoration/ lands on its heading (Austin 2026-11-16: /restoration/#made-h landed on the
 * Quest rooms cards, far above Made for Groddle). The browser jumped while the page was still short,
 * then restoration.js filled the sections above and the page grew by about 7,300 px; the page's smooth
 * scrolling glided Chrome to the stale place. public/restoration/hash-settle.js puts the target back
 * as the page settles; the pictures and the street diorama keep their shape before they load; the
 * theme pads the window's top by the sticky section bar's height, so the heading sits just under it.
 * Run: node --test tests/restoration-anchors.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SITE_DIR, skipWithoutSite } from '../tools/repos.mjs';
import { MAX_MS, QUIET_MS, READER_EVENTS, freshVisit, hashTarget, settleHash } from '../public/restoration/hash-settle.js?v=834e5782';
import { PHP } from './php.js';

const root = join(import.meta.dirname, '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const hasPhp = (() => {
  try {
    execFileSync(PHP, ['-v'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

/** A page with the given ids, a clock, timers, frames and a ResizeObserver the test drives. */
function fakePage({ hash = '#made-h', ids = ['made-h', 'rooms', 'honest-h'], navType = 'navigate', readyState = 'interactive' } = {}) {
  let t = 0;
  let observer = null;
  const listeners = {};
  let tick = null;
  const frames = [];
  const landed = [];
  const doc = {
    readyState,
    documentElement: { style: { scrollBehavior: '' } },
    body: {},
    getElementById: (id) => (ids.includes(id) ? { id, scrollIntoView: (opts) => landed.push({ id, opts, behavior: doc.documentElement.style.scrollBehavior }) } : null),
  };
  const win = {
    location: { hash },
    performance: { now: () => t, getEntriesByType: (type) => (type === 'navigation' && navType ? [{ type: navType }] : []) },
    requestAnimationFrame: (f) => frames.push(f),
    cancelAnimationFrame: () => {},
    setInterval: (f) => {
      tick = f;
      return 1;
    },
    clearInterval: () => {
      tick = null;
    },
    addEventListener: (type, f) => (listeners[type] ||= new Set()).add(f),
    removeEventListener: (type, f) => listeners[type]?.delete(f),
    ResizeObserver: class {
      constructor(cb) {
        this.cb = cb;
        observer = this;
      }
      observe() {
        this.on = true;
        this.cb([]);
      }
      disconnect() {
        this.on = false;
      }
    },
  };
  return {
    win,
    doc,
    landed,
    listeners,
    /** The page's height changes (a section filled, a picture loaded), then the next frame runs. */
    grow() {
      if (observer?.on) observer.cb([]);
      frames.splice(0).forEach((f) => f());
    },
    advance(ms) {
      for (let i = 0; i < ms; i += 100) {
        t += 100;
        tick?.();
      }
    },
    fire(type) {
      for (const f of [...(listeners[type] || [])]) f();
    },
    listening: () => Object.values(listeners).reduce((n, set) => n + set.size, 0),
  };
}

describe('a #link into the restoration report lands on its target (hash-settle.js)', () => {
  it('finds the element a hash names; a room link lands the page behind its dialog on the Quest rooms band', () => {
    const { doc } = fakePage({ ids: ['made-h', 'rooms', 'made-ez-cookin-counters-lamps-and-table-h'] });
    assert.equal(hashTarget('#made-h', doc).id, 'made-h');
    assert.equal(hashTarget('#made-ez-cookin-counters-lamps-and-table-h', doc).id, 'made-ez-cookin-counters-lamps-and-table-h');
    assert.equal(hashTarget('#room-hell_one', doc).id, 'rooms');
    assert.equal(hashTarget('#made%2Dh', doc).id, 'made-h', 'an encoded hash');
    for (const h of ['', '#', 'made-h', '#nothing-here', '#%E0%A4%A', null]) assert.equal(hashTarget(h, doc), null, String(h));
  });

  it('lands at once, instantly, and again each time the page grows, then lets go once loaded and still', () => {
    const p = fakePage();
    const s = settleHash({ win: p.win, doc: p.doc });
    assert.deepEqual(p.landed, [], 'the first land waits for the next frame');
    p.grow();
    assert.deepEqual(p.landed.map((l) => [l.id, l.opts.block, l.behavior]), [['made-h', 'start', 'auto']], 'the page\'s smooth scrolling is off while it settles');
    p.grow();
    p.grow();
    assert.equal(p.landed.length, 3, 'each fill puts the heading back');
    p.advance(QUIET_MS * 3);
    assert.equal(s.done(), false, 'still loading: it keeps hold however quiet');
    p.doc.readyState = 'complete';
    p.grow(); // a picture loads
    p.advance(QUIET_MS - 100);
    assert.equal(s.done(), false);
    p.advance(200);
    assert.equal(s.done(), true, 'loaded and still: settled');
    assert.equal(p.landed.at(-1).id, 'made-h', 'one last land as it lets go');
    assert.equal(p.doc.documentElement.style.scrollBehavior, '', 'smooth scrolling is back for the bar\'s links');
    assert.equal(p.listening(), 0, 'every listener removed');
    const n = p.landed.length;
    p.grow();
    assert.equal(p.landed.length, n, 'nothing moves the page afterwards');
  });

  it('never fights the reader: their first wheel, touch, click or key, or a link they follow, lets go', () => {
    for (const type of [...READER_EVENTS, 'hashchange']) {
      const p = fakePage();
      const s = settleHash({ win: p.win, doc: p.doc });
      p.grow();
      p.fire(type);
      assert.equal(s.done(), true, type);
      p.grow();
      assert.equal(p.landed.length, 1, `${type}: no land after the reader moved`);
      assert.equal(p.doc.documentElement.style.scrollBehavior, '');
    }
    assert.deepEqual(READER_EVENTS, ['wheel', 'touchstart', 'pointerdown', 'keydown']);
  });

  it('gives up after a few seconds even while the page keeps moving', () => {
    const p = fakePage();
    const s = settleHash({ win: p.win, doc: p.doc });
    for (let t = 0; t < MAX_MS - 200; t += 300) {
      p.grow();
      p.advance(300);
    }
    assert.equal(s.done(), false);
    p.advance(400);
    assert.equal(s.done(), true);
    assert.ok(MAX_MS >= 4000 && MAX_MS <= 10000, `${MAX_MS} ms`);
  });

  it('leaves a page with no target, a reload and a step back or forward to the browser', () => {
    for (const opts of [{ hash: '' }, { hash: '#nowhere' }, { navType: 'reload' }, { navType: 'back_forward' }]) {
      const p = fakePage(opts);
      const s = settleHash({ win: p.win, doc: p.doc });
      assert.equal(s.done(), true, JSON.stringify(opts));
      assert.equal(p.listening(), 0);
      assert.equal(p.doc.documentElement.style.scrollBehavior, '', 'smooth scrolling untouched');
    }
    assert.equal(freshVisit(fakePage({ navType: 'navigate' }).win), true);
    assert.equal(freshVisit(fakePage({ navType: null }).win), true, 'a browser without navigation timing');
  });

  it('starts from restoration.js before any section fills', () => {
    const js = read('public/restoration/restoration.js');
    assert.match(js, /^import \{ settleHash \} from '\.\/hash-settle\.js\?v=[0-9a-f]{8}';$/m);
    const call = js.indexOf('\nsettleHash();\n');
    assert.ok(call > 0, 'called at the top level');
    for (const later of ['\nsetupReportMenu();', 'await (await fetch(', '\nrenderRooms(data);']) assert.ok(call < js.indexOf(later), later);
  });
});

describe('the report keeps its shape before pictures and data arrive', () => {
  const css = read('public/restoration/restoration.css');
  const rule = (sel) => {
    const m = new RegExp(`(?:^|\\n)${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`).exec(css);
    return m ? m[1] : '';
  };

  it('every picture restoration.js makes has a shape in restoration.css before it loads', () => {
    const js = read('public/restoration/restoration.js');
    const classes = new Set([...js.matchAll(/el\('img', \{ class: '([^']+)'/g)].map((m) => m[1]));
    assert.deepEqual([...classes].sort(), ['item-shot', 'room-shot']);
    for (const cls of classes) assert.match(rule(`.${cls}`), /aspect-ratio: \d+ \/ \d+/, cls);
  });

  it('the report blocks\' pictures have a size or a shape: the diorama keeps its stage\'s, the cards their width and height', { skip: skipWithoutSite }, () => {
    const php = readFileSync(join(SITE_DIR, 'src/Restoration.php'), 'utf8');
    const street = php.slice(php.indexOf('private static function street('), php.indexOf('private static function systems('));
    const imgs = [...php.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
    assert.ok(imgs.length > 10);
    for (const img of imgs) {
      if (street.includes(img) && !/detail-shot/.test(img)) continue; // inside the 1200 by 440 stage, checked below
      const cls = /class="([\w-]+)"/.exec(img)?.[1];
      assert.ok(/ width="\d+" height="\d+"/.test(img) || (cls && /aspect-ratio:/.test(rule(`.${cls}`))), img);
    }
    // The diorama's art sits in an absolute 1200 by 440 stage, out of the flow; its frame keeps that shape before the script scales it.
    assert.match(rule('.diorama'), /position: absolute;[\s\S]*width: 1200px; height: 440px;/);
    assert.match(readFileSync(join(SITE_DIR, 'style.css'), 'utf8'), /\n\.report-menu ~ \.band \.diorama-frame \{ width: 100%; aspect-ratio: 1200 \/ 440; \}/);
    // The seasons' icons and badges carry their size.
    const seasons = readFileSync(join(SITE_DIR, 'src/Seasons.php'), 'utf8');
    const seasonImgs = [...seasons.matchAll(/'<img [\s\S]*?\/>'/g)].map((m) => m[0]);
    assert.equal(seasonImgs.length, 2);
    for (const img of seasonImgs) assert.match(img, / width="' \. \$size \. '" height="' \. \$size \. '"| width="36" height="36"/);
  });

  it('every Made for Groddle picture carries its width and height', { skip: skipWithoutSite || (!hasPhp && 'no php on PATH') }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'groddle-anchors-'));
    try {
      const file = join(dir, 'made.json');
      writeFileSync(file, read('public/restoration/made.json'));
      const html = execFileSync(PHP, ['-r', `require ${JSON.stringify(join(SITE_DIR, 'src/RestorationMade.php'))}; echo Groddle\\Minn\\RestorationMade::draw(json_decode(file_get_contents(${JSON.stringify(file)}), true));`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      const imgs = html.match(/<img\b[^>]*>/g) || [];
      assert.ok(imgs.length >= 10, `${imgs.length} pictures`);
      for (const img of imgs) assert.match(img, / width="\d+" height="\d+"/, img);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('anchors land just under the sticky section bar: the window\'s top is padded by the bar\'s height', { skip: skipWithoutSite }, () => {
    const style = readFileSync(join(SITE_DIR, 'style.css'), 'utf8');
    const rules = style.slice(style.indexOf("/* The restoration report's section menu"), style.indexOf('/* The Musicblocks page'));
    // The bar is the row's height (a min-height of --report-menu-h) plus its 1px border; the padding clears it with room to spare.
    assert.match(rules, /\.report-menu \{\s*position: sticky; top: 0;[^}]*border-bottom: 1px solid/);
    assert.match(rules, /\.report-menu-row \{[^}]*min-height: var\(--report-menu-h\);/);
    assert.match(rules, /\nhtml:has\(\.report-menu\) \{ scroll-padding-top: calc\(var\(--report-menu-h\) \+ 14px\); \}/);
    // Nothing adds a scroll-margin on top of it (the two add up and the heading would land far below the bar).
    assert.doesNotMatch(rules, /scroll-margin/);
  });
});
