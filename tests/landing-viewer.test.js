// The home page's photos and their full-size viewer (Austin 2026-10-31): the shot tool's outputs,
// the page's markup, and the viewer's open, close, keys and focus return on a small fake DOM.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SHOTS, FULL_W, shotFiles, clipToAspect } from '../tools/landing/shots.mjs';
import { mountViewer, stepIndex, countLabel, keyAction } from '../public/landing/viewer.js?v=9a919381';

const pub = join(import.meta.dirname, '..', 'public');
const read = (p) => readFileSync(join(pub, p), 'utf8');

/** A WebP's width and height from its header (VP8, VP8L or VP8X). */
function webpSize(file) {
  const b = readFileSync(file);
  assert.equal(b.toString('ascii', 0, 4), 'RIFF', file);
  assert.equal(b.toString('ascii', 8, 12), 'WEBP', file);
  const chunk = b.toString('ascii', 12, 16);
  if (chunk === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  if (chunk === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  if (chunk === 'VP8L') {
    const bits = b.readUInt32LE(21);
    return [(bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1];
  }
  throw new Error(`${file}: unknown chunk ${chunk}`);
}

describe('the shot tool and its outputs', () => {
  it('writes a page copy and a 1920 wide full-size copy of every shot, at their sizes', () => {
    for (const key of Object.keys(SHOTS)) {
      const files = shotFiles(key);
      for (const out of [files.page, files.full]) {
        const file = join(pub, 'landing', out.path);
        assert.ok(existsSync(file), out.path);
        assert.deepEqual(webpSize(file), out.size, out.path);
      }
      assert.equal(files.full.size[0], FULL_W, key);
      const ratio = (s) => s[0] / s[1];
      assert.ok(Math.abs(ratio(files.page.size) / ratio(files.full.size) - 1) < 0.005, `${key}: both copies keep one aspect`);
      // A full-size copy is worth opening: at least as wide as the page's copy.
      assert.ok(files.full.size[0] >= files.page.size[0], key);
      // The capture is big enough for the full-size copy, not stretched up to it.
      assert.ok(SHOTS[key].viewport[0] * SHOTS[key].scale >= FULL_W * 0.99 || SHOTS[key].frame.startsWith('#'), `${key}: captured at ${SHOTS[key].viewport[0] * SHOTS[key].scale} px`);
    }
  });

  it('the hero is the whole 16:9 game; the cards keep the street view shape', () => {
    assert.equal(SHOTS.hero.frame, 'root');
    assert.deepEqual(SHOTS.hero.size, [1600, 900]);
    assert.equal(SHOTS.hero.viewport[0] / SHOTS.hero.viewport[1], 16 / 9);
    for (const [key, spec] of Object.entries(SHOTS)) if (key !== 'hero') assert.deepEqual(spec.size, [1200, 511], key);
  });

  it('carries the waits the new game needs (the Rook past its flash, the race under way, no cut-off button)', () => {
    assert.ok(SHOTS.rook.wait >= 17000);
    assert.ok(SHOTS.races.wait >= 24000);
    assert.match(SHOTS.skills.hide, /\.img-foot/);
  });

  it('clips to the output aspect from the sides, the bottom, or both ends', () => {
    assert.deepEqual(clipToAspect({ x: 0, y: 0, width: 2000, height: 500 }, [1000, 500]), { x: 500, y: 0, width: 1000, height: 500 });
    assert.deepEqual(clipToAspect({ x: 0, y: 0, width: 1000, height: 800 }, [1000, 500]), { x: 0, y: 0, width: 1000, height: 500 });
    assert.deepEqual(clipToAspect({ x: 0, y: 100, width: 1000, height: 800 }, [1000, 500], 'center'), { x: 0, y: 250, width: 1000, height: 500 });
  });

  it('shoots under the one-browser lock', () => {
    const src = readFileSync(join(import.meta.dirname, '..', 'tools', 'landing', 'shots.mjs'), 'utf8');
    assert.match(src, /openBrowser\(/);
    assert.ok(!/chromium\.launch\(/.test(src));
  });
});

describe('the home page photos', () => {
  const home = read('index.html');
  const buttons = [...home.matchAll(/<button class="(?:hero-shot )?shot"([^>]*)>\s*<img ([^>]*)\/>\s*<\/button>/g)];

  it('every photo is a button that opens its full-size copy, one per shot', () => {
    assert.equal(buttons.length, Object.keys(SHOTS).length);
    for (const key of Object.keys(SHOTS)) {
      const files = shotFiles(key);
      const b = buttons.find((m) => m[1].includes(`data-full="landing/${files.full.path}"`));
      assert.ok(b, `${key}: a button with data-full`);
      assert.match(b[1], /type="button"/);
      assert.match(b[1], /aria-haspopup="dialog"/);
      assert.match(b[1], /data-title="[^"]+"/);
      assert.match(b[2], new RegExp(`src="landing/${files.page.path.replace('.', '\\.')}\\?v=[0-9a-f]{8}"`), key);
      assert.match(b[2], new RegExp(`width="${files.page.size[0]}" height="${files.page.size[1]}"`), key);
      assert.match(b[2], /alt="[^"]{20,}"/, `${key}: alt text for the caption`);
    }
  });

  it('the full-size copies are not loaded with the page (only data-full names them)', () => {
    assert.ok(!/(?:src|href|srcset)="landing\/full\//.test(home));
    assert.ok(!/<link[^>]+preload[^>]+landing\/full/.test(home));
  });

  it('has one viewer dialog with a title, a caption, a count and labelled buttons, and no em dashes', () => {
    assert.match(home, /<dialog class="viewer" id="viewer" aria-labelledby="viewer-title" aria-describedby="viewer-text">/);
    for (const want of ['class="viewer-img"', 'id="viewer-title"', 'id="viewer-text"', 'id="viewer-count"',
      'class="viewer-btn viewer-prev" type="button" aria-label="Previous picture"',
      'class="viewer-btn viewer-next" type="button" aria-label="Next picture"',
      'class="viewer-btn viewer-close" type="button" aria-label="Close"']) {
      assert.ok(home.includes(want), want);
    }
    assert.ok(!home.includes('—'));
    assert.match(read('landing/landing.js'), /import \{ mountViewer \} from '\.\/viewer\.js\?v=[0-9a-f]{8}';[\s\S]*mountViewer\(\);/);
  });

  it('styles the viewer from tokens, locks the page scroll, and drops motion when asked', () => {
    const css = read('landing/landing.css');
    const viewer = css.slice(css.indexOf('/* —— Photos that open full size'));
    assert.ok(viewer.length > 200);
    assert.ok(!/#[0-9a-f]{3,8}\b|rgba?\(/i.test(viewer.replace(/url\("data:[^"]*"\)/g, '')), 'colours come from tokens');
    assert.match(viewer, /html\.viewer-open \{ overflow: hidden; \}/);
    assert.match(viewer, /@media \(prefers-reduced-motion: reduce\) \{\s*\.viewer\[open\], \.viewer\[open\] \.viewer-figure \{ animation: none; \}/);
    assert.match(viewer, /@media \(max-width: 899px\)/);
    // --scrim is defined for light, system dark and chosen dark.
    assert.equal((css.match(/--scrim:/g) || []).length, 3);
  });
});

describe('the viewer', () => {
  it('steps, counts and maps keys', () => {
    assert.equal(stepIndex(8, 1, 9), 0);
    assert.equal(stepIndex(0, -1, 9), 8);
    assert.equal(stepIndex(3, 0, 9), 3);
    assert.equal(countLabel(2, 9), '3 of 9');
    assert.equal(keyAction('ArrowLeft'), 'prev');
    assert.equal(keyAction('ArrowRight'), 'next');
    assert.equal(keyAction('Home'), 'first');
    assert.equal(keyAction('End'), 'last');
    assert.equal(keyAction('Escape'), '');
  });

  /** A small DOM: elements with listeners, classList, style and focus, and a dialog with showModal. */
  function fakePage(n = 3) {
    const doc = { activeElement: null };
    const el = (props = {}) => {
      const listeners = {};
      const classes = new Set(props.classes || []);
      const vars = {};
      const node = {
        ...props,
        dataset: props.dataset || {},
        style: { setProperty: (k, v) => { vars[k] = v; }, removeProperty: (k) => { delete vars[k]; }, vars },
        classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c), has: (c) => classes.has(c) },
        addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
        fire: (type, ev = {}) => {
          const e = { target: node, key: '', shiftKey: false, preventDefault() { e.prevented = true; }, ...ev };
          for (const fn of listeners[type] || []) fn(e);
          return e;
        },
        focus: () => { doc.activeElement = node; },
        getAttribute: (k) => props.attrs?.[k] ?? null,
      };
      return node;
    };
    const img = el();
    const title = el();
    const text = el();
    const count = el();
    const prev = el();
    const next = el();
    const closeBtn = el();
    const stage = el({ classes: ['viewer-stage'] });
    const dialog = el({ open: false });
    dialog.showModal = () => { dialog.open = true; };
    dialog.close = () => { if (!dialog.open) return; dialog.open = false; dialog.fire('close'); };
    const parts = { '.viewer-img': img, '.viewer-title': title, '.viewer-text': text, '.viewer-count': count, '.viewer-prev': prev, '.viewer-next': next, '.viewer-close': closeBtn };
    dialog.querySelector = (sel) => parts[sel] || null;
    const shots = Array.from({ length: n }, (_, i) => {
      const thumb = el({ src: `landing/card-${i}.webp?v=00000000`, currentSrc: '', alt: `Photo ${i}`, attrs: { width: '1200', height: '511' } });
      const b = el({ dataset: { full: `landing/full/card-${i}.webp`, title: `Card ${i}` } });
      b.querySelector = () => thumb;
      return b;
    });
    const html = el({ clientWidth: 1425 });
    Object.assign(doc, {
      documentElement: html,
      getElementById: (id) => (id === 'viewer' ? dialog : null),
      querySelectorAll: (sel) => (sel === '.shot[data-full]' ? shots : []),
    });
    return { doc, dialog, stage, shots, img, title, text, count, prev, next, closeBtn, html };
  }

  /** Image stubs: each new Image() is recorded; load() finishes it. */
  function withImages(run) {
    const made = [];
    const saved = { Image: globalThis.Image, window: globalThis.window };
    globalThis.Image = class { constructor() { made.push(this); } load() { this.onload?.(); } };
    globalThis.window = { innerWidth: 1440 };
    try { run(made); } finally { globalThis.Image = saved.Image; globalThis.window = saved.window; }
  }

  it('opens on a click with the page copy, swaps in the full-size copy, and locks the scroll', () => withImages((made) => {
    const p = fakePage();
    const viewer = mountViewer(p.doc);
    assert.ok(viewer);
    assert.equal(made.length, 0, 'nothing full-size loads until a photo is opened');
    p.shots[1].focus();
    p.shots[1].fire('click');
    assert.equal(p.dialog.open, true);
    assert.equal(p.img.src, 'landing/card-1.webp?v=00000000');
    assert.equal(p.title.textContent, 'Card 1');
    assert.equal(p.text.textContent, 'Photo 1');
    assert.equal(p.count.textContent, '2 of 3');
    assert.equal(p.dialog.style.vars['--ar'], String(1200 / 511));
    assert.equal(made.length, 1);
    assert.equal(made[0].src, 'landing/full/card-1.webp');
    assert.ok(p.dialog.classList.has('is-loading'));
    made[0].load();
    assert.equal(p.img.src, 'landing/full/card-1.webp');
    assert.ok(!p.dialog.classList.has('is-loading'));
    assert.ok(p.html.classList.has('viewer-open'));
    assert.equal(p.html.style.vars['--viewer-gutter'], '15px');
    assert.equal(p.doc.activeElement, p.closeBtn, 'focus moves into the viewer');
  }));

  it('steps with the buttons and the arrow keys, wrapping, and ignores a late load', () => withImages((made) => {
    const p = fakePage();
    mountViewer(p.doc);
    p.shots[0].fire('click');
    p.prev.fire('click');
    assert.equal(p.count.textContent, '3 of 3');
    p.next.fire('click');
    assert.equal(p.count.textContent, '1 of 3');
    const e = p.dialog.fire('keydown', { key: 'ArrowRight' });
    assert.ok(e.prevented);
    assert.equal(p.title.textContent, 'Card 1');
    p.dialog.fire('keydown', { key: 'End' });
    assert.equal(p.count.textContent, '3 of 3');
    p.dialog.fire('keydown', { key: 'Home' });
    assert.equal(p.count.textContent, '1 of 3');
    // The first photo's full copy arrives after the viewer moved on: it must not replace this one.
    made[0].load();
    assert.equal(p.img.src, 'landing/card-0.webp?v=00000000');
  }));

  it('keeps Tab among its buttons', () => withImages(() => {
    const p = fakePage();
    mountViewer(p.doc);
    p.shots[0].fire('click');
    assert.equal(p.doc.activeElement, p.closeBtn);
    const tab = p.dialog.fire('keydown', { key: 'Tab' });
    assert.ok(tab.prevented);
    assert.equal(p.doc.activeElement, p.prev, 'Tab from the last button wraps to the first');
    p.dialog.fire('keydown', { key: 'Tab', shiftKey: true });
    assert.equal(p.doc.activeElement, p.closeBtn, 'Shift+Tab from the first wraps to the last');
  }));

  it('closes by the close button, a backdrop click or Esc, and gives focus back to the photo', () => withImages(() => {
    const p = fakePage();
    mountViewer(p.doc);
    // The close button.
    p.shots[2].fire('click');
    p.closeBtn.fire('click');
    assert.equal(p.dialog.open, false);
    assert.equal(p.doc.activeElement, p.shots[2]);
    assert.ok(!p.html.classList.has('viewer-open'));
    assert.equal(p.html.style.vars['--viewer-gutter'], undefined);
    // A click on the photo or the caption keeps it open; one on the backdrop closes it.
    p.shots[0].fire('click');
    p.dialog.fire('click', { target: p.img });
    assert.equal(p.dialog.open, true);
    p.dialog.fire('click', { target: p.stage });
    assert.equal(p.dialog.open, false);
    assert.equal(p.doc.activeElement, p.shots[0]);
    // Esc: the browser's cancel closes the dialog, which fires close.
    p.shots[1].fire('click');
    p.dialog.close();
    assert.equal(p.doc.activeElement, p.shots[1]);
    assert.ok(!p.html.classList.has('viewer-open'));
  }));

  it('does nothing on a page without the viewer', () => {
    const p = fakePage();
    p.doc.getElementById = () => null;
    assert.equal(mountViewer(p.doc), null);
  });
});
