// The upgrade reveal (js/img-reveal.js): Glitch's ImaginationPurchaseUpgradeUI, shown when an
// iMG upgrade card is bought in the shop (features/imagination-feature.js).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ART_MAX_SCALE,
  BT_LABELS,
  CARD_ZOOM_MS,
  REVEAL_FADE_MS,
  artViewBox,
  opaqueBox,
  createImgReveal,
  createLabelPicker,
  playAreaRect,
  revealContent,
} from '../public/js/img-reveal.js?v=4356662d';

const here = dirname(fileURLToPath(import.meta.url));
const pub = join(here, '..', 'public');
const read = (rel) => readFileSync(join(pub, rel), 'utf8');
const SOURCE = join(here, '../../glitch-client/com/tinyspeck/engine/view/ui/imagination/ImaginationPurchaseUpgradeUI.as');

/** Just enough DOM for the view. */
function fakeDom() {
  const timers = [];
  const make = (tag) => {
    const node = {
      tagName: tag,
      style: { setProperty(k, v) { this[k] = v; } },
      hidden: false,
      textContent: '',
      children: [],
      attrs: {},
      dataset: {},
      handlers: {},
      classes: new Set(),
      focused: false,
      offsetWidth: 10,
      parent: null,
      set className(v) { node.classes = new Set(String(v).split(/\s+/).filter(Boolean)); },
      get className() { return [...node.classes].join(' '); },
      classList: {
        add: (c) => node.classes.add(c),
        remove: (c) => node.classes.delete(c),
        contains: (c) => node.classes.has(c),
        toggle: (c, on) => (on ? node.classes.add(c) : node.classes.delete(c)),
      },
      setAttribute(k, v) { node.attrs[k] = v; },
      appendChild(child) { child.parent = node; node.children.push(child); return child; },
      replaceChildren() { node.children = []; },
      addEventListener(type, fn) { node.handlers[type] = fn; },
      focus() { node.focused = true; },
      closest(sel) {
        for (let n = node; n; n = n.parent) {
          if (sel === '[data-img-continue]' && n.dataset.imgContinue) return n;
        }
        return null;
      },
    };
    return node;
  };
  const all = (n, out = []) => { out.push(n); n.children.forEach((c) => all(c, out)); return out; };
  const head = make('head');
  const body = make('body');
  const win = {
    addEventListener() {},
    removeEventListener() {},
    setTimeout(fn, ms) { timers.push({ fn, ms }); return timers.length; },
    clearTimeout() {},
  };
  const doc = { head, body, createElement: make, createElementNS: (_ns, tag) => make(tag), getElementById: () => null, defaultView: win };
  return { doc, body, timers, find: (root, cls) => all(root).find((n) => n.classes.has(cls)) };
}

describe('upgrade reveal: the button labels (setCloseButton)', () => {
  it('copies Tiny Speck\'s BT_LABELS verbatim', () => {
    assert.equal(BT_LABELS.length, 77);
    assert.equal(BT_LABELS[0], 'Super!');
    assert.equal(BT_LABELS[76], 'Sugoi!');
    assert.ok(BT_LABELS.includes('You don’t say?'), 'keeps the curly apostrophe');
    if (!existsSync(SOURCE)) return;
    const as = readFileSync(SOURCE, 'utf8');
    const block = as.slice(as.indexOf('BT_LABELS:Array = ['), as.indexOf('];', as.indexOf('BT_LABELS:Array = [')));
    const fromSource = [...block.matchAll(/'([^']*)'/g)].map((m) => m[1]);
    assert.deepEqual([...BT_LABELS], fromSource);
  });

  it('picks a random first label, then steps to the next one each purchase, wrapping', () => {
    const picker = createLabelPicker(() => 0.5);
    const first = picker.next();
    const i = BT_LABELS.indexOf(first);
    assert.equal(i, Math.floor(0.5 * BT_LABELS.length));
    assert.equal(picker.next(), BT_LABELS[i + 1]);
    assert.equal(picker.next(), BT_LABELS[i + 2]);
    const last = createLabelPicker(() => 0.99999);
    assert.equal(last.next(), 'Sugoi!');
    assert.equal(last.next(), 'Super!', 'wraps to the first');
    assert.equal(createLabelPicker(() => 0).next(), 'Super!');
  });
});

describe('upgrade reveal: content', () => {
  it('shows Got it!, the name, the art and the words; no item for a keepable', () => {
    const c = revealContent({ name: 'Grain Hoocher', desc: 'More hooch.', config: { bg: 'gold', art: 'hooch' } });
    assert.equal(c.gotIt, 'Got it!');
    assert.equal(c.title, 'Grain Hoocher');
    assert.equal(c.art, 'assets/imagination/cards/art_hooch.svg');
    assert.equal(c.keepable, false);
    assert.equal(c.item, '');
    const k = revealContent({ name: 'Reshuffle', config: { bg: 'keepable', art: 'keepable_reshuffle', item_tsid: 'upgrade_card_reshuffle' } });
    assert.equal(k.keepable, true);
    assert.equal(k.item, '', 'setItem: no "And also:" for a keepable');
    const it2 = revealContent({ name: 'X', config: { bg: 'blue', item_tsid: 'apple' } });
    assert.equal(it2.item, 'apple');
    assert.equal(it2.itemIcon, 'assets/sprites/icons/apple.webp');
  });

  it('finds the painted pixels (the layers hold invisible full-frame shapes)', () => {
    const w = 10;
    const h = 8;
    const data = new Uint8ClampedArray(w * h * 4);
    for (const [x, y] of [[3, 2], [6, 5], [4, 3]]) data[(y * w + x) * 4 + 3] = 255;
    data[(0 * w + 0) * 4 + 3] = 5; // nearly clear: ignored
    assert.deepEqual(opaqueBox(data, w, h), { x: 3, y: 2, width: 4, height: 4 });
    assert.equal(opaqueBox(new Uint8ClampedArray(w * h * 4), w, h), null);
  });

  it('crops the art to its own box and caps it at twice its size', () => {
    assert.deepEqual(artViewBox(null), { x: 0, y: 0, w: 230, h: 310 });
    assert.deepEqual(artViewBox({ x: 40, y: 50, width: 150, height: 140 }), { x: 36, y: 46, w: 158, h: 148 });
    assert.equal(ART_MAX_SCALE, 2);
    const src = read('js/img-reveal.js');
    assert.match(src, /max-width:calc\(var\(--art-w, 115px\) \* 2\)/);
    assert.match(src, /flex:0 1 calc\(var\(--art-h, 155px\) \* 2\)/);
  });
});

describe('upgrade reveal: the play area', () => {
  const view = { left: 0, top: 0, width: 1280, height: 700 };
  it('fills the whole location viewport in Classic', () => {
    assert.deepEqual(playAreaRect({ view: { left: 20, top: 0, width: 960, height: 520 }, classic: true, topBarBottom: 90 }), { left: 20, top: 0, width: 960, height: 520 });
  });
  it('covers the whole Modern game window, the top bar, side sheets and pack included', () => {
    const r = playAreaRect({ view, rootW: 1280, rootH: 800, topBarBottom: 60, insetL: 0, insetR: 300, gap: 8 });
    assert.deepEqual(r, { left: 0, top: 0, width: 1280, height: 800 });
  });
  it('covers the root on a phone too', () => {
    const r = playAreaRect({ view: null, rootW: 402, rootH: 660, topBarBottom: 50, gap: 8 });
    assert.deepEqual(r, { left: 0, top: 0, width: 402, height: 660 });
  });
});

describe('upgrade reveal: show and close', () => {
  it('builds the column, focuses the button, closes from it, and fades out', () => {
    const { doc, body, timers, find } = fakeDom();
    const data = {};
    let closed = 0;
    const reveal = createImgReveal({ document: doc, onClose: () => { closed++; }, setData: (k, v) => { data[k] = v; } });
    const content = revealContent({ name: 'Energy Tank', desc: 'More energy.', notes: ['Your Energy Tank is now 120.'], config: { bg: 'blue' } });
    const btn = reveal.show(content, { label: 'Huzzah!' });
    const root = reveal.element();
    assert.equal(root.parent, body);
    assert.equal(root.hidden, false);
    assert.ok(root.classes.has('is-shown'));
    assert.equal(find(root, 'img-reveal-got').textContent, 'Got it!');
    assert.equal(find(root, 'img-reveal-title').textContent, 'Energy Tank');
    assert.equal(find(root, 'img-reveal-desc').textContent, 'More energy.');
    assert.equal(find(root, 'img-reveal-note').textContent, 'Your Energy Tank is now 120.');
    assert.equal(btn.textContent, 'Huzzah!');
    assert.ok(btn.focused, 'the button has the focus (Enter and Space press it)');
    assert.equal(data.imgReveal, 'Energy Tank|Huzzah!');
    assert.equal(reveal.isOpen(), true);
    root.handlers.click({ target: btn, stopPropagation() {} });
    assert.equal(closed, 1);
    assert.equal(reveal.hide(), true);
    assert.equal(reveal.isOpen(), false);
    assert.equal(root.classes.has('is-shown'), false);
    const fade = timers.find((t) => t.ms === REVEAL_FADE_MS);
    assert.ok(fade, 'hides after the .2 s fade');
    fade.fn();
    assert.equal(root.hidden, true);
    assert.equal(reveal.hide(), false, 'closing twice is a no-op');
  });

  it('paints a keepable on plain white', () => {
    const { doc } = fakeDom();
    const reveal = createImgReveal({ document: doc });
    reveal.show(revealContent({ name: 'Reshuffle', config: { bg: 'keepable' } }));
    assert.ok(reveal.element().classes.has('is-keepable'));
    assert.match(read('js/img-reveal.js'), /\.img-reveal\.is-keepable\{background:color-mix\(in srgb,var\(--c-white\) 86%,transparent\)\}/);
  });
});

describe('upgrade reveal: the shop wires it', () => {
  const src = read('js/features/imagination-feature.js');
  it('replaces the old in-window "Nice!" card', () => {
    assert.doesNotMatch(src, /img-celebrate|'Nice!'/);
    assert.match(src, /ensureReveal\(\)\.show\(content, \{ label: labels\.next\(\) \}\)/);
  });
  it('zooms the bought card off first, then fades the hand out under the reveal', () => {
    assert.equal(CARD_ZOOM_MS, 300);
    assert.match(src, /to\{transform:rotate\(20deg\) scale\(4\);opacity:0\}/);
    assert.match(src, /panel\.classList\.add\('img-revealing'\)/);
    assert.match(src, /#imagination-panel\.img-revealing\{opacity:0;pointer-events:none\}/);
  });
  it('Esc and Enter close the reveal, back to the hand with CLICK_SUCCESS', () => {
    assert.match(src, /if \(reveal\?\.isOpen\(\)\) \{[\s\S]{0,200}e\.key === 'Escape' \|\| e\.key === 'Enter'[\s\S]{0,80}closeReveal\(\)/);
    assert.match(src, /function closeReveal[\s\S]{0,400}play\('CLICK_SUCCESS'\)[\s\S]{0,40}render\(true\)/);
    assert.match(src, /function closePanel\(\)[\s\S]{0,200}reveal\?\.hide\(\{ immediate: true \}\)/);
  });
  it('announces once: the open shop logs the line without a notice over the reveal', () => {
    assert.match(src, /if \(panel && !panel\.hidden && engine\.notify\?\.log\) engine\.notify\.log\(`You got the \$\{name\} upgrade!`/);
    assert.match(src, /else engine\.pushActivity\(`You got the \$\{name\} upgrade!`\)/);
  });
  it('the engine hands out the location viewport', () => {
    assert.match(read('game.js'), /locationViewRect: \(\) => locationViewRect\(\),/);
  });
});
