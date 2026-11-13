// Austin's iPhone (2026-11-13): "Under settings I just see zoom and Night tint." The "Stick follows
// your thumb" switch went into the Menu's Settings group once, as the touch controls were built, and
// gave up when that group was not there yet. js/touch-controls.js keepFloatStickSwitch puts it in when
// the group appears, again after a rebuild, and as the Menu opens; never two rows.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { FLOAT_STICK_LABEL, createFloatStick, keepFloatStickSwitch } from '../public/js/touch-controls.js?v=6ae5adce';

/** A small tree: ids, data-menu-group, children, remove, and a MutationObserver fired by hand. */
function fakePage() {
  const observers = [];
  const clicks = [];
  const mk = (tag) => {
    const n = {
      tagName: tag.toUpperCase(), id: '', children: [], parent: null, dataset: {}, attrs: {}, hidden: false, className: '', textContent: '',
      append(...kids) { for (const k of kids) { k.parent?.children.splice(k.parent.children.indexOf(k), 1); k.parent = n; n.children.push(k); } mutate(n); },
      remove() { const p = n.parent; if (p) { p.children.splice(p.children.indexOf(n), 1); n.parent = null; mutate(p); } },
      setAttribute(k, v) { n.attrs[k] = String(v); },
      addEventListener() {},
      get isConnected() { let p = n; while (p.parent) p = p.parent; return p === doc.body; },
      closest(sel) { const cls = sel.startsWith('.') ? sel.slice(1) : null; for (let p = n; p; p = p.parent) if (cls && String(p.className).split(' ').includes(cls)) return p; return null; },
      walk(fn) { for (const c of n.children) { if (fn(c)) return c; const hit = c.walk(fn); if (hit) return hit; } return null; },
      querySelector(sel) {
        if (sel === '#menu-float-stick') return n.walk((c) => c.id === 'menu-float-stick');
        const m = sel.match(/^#more-list \[data-menu-group="(\w+)"\]$/);
        if (m) { const list = n.walk((c) => c.id === 'more-list'); return list ? list.walk((c) => c.dataset.menuGroup === m[1]) : null; }
        return null;
      },
    };
    return n;
  };
  // A change wakes only the observers watching a node at or above it.
  const mutate = (at) => { for (const o of observers) { for (let p = at; p; p = p.parent) if (p === o.target) { o.pending = true; break; } } };
  const doc = {
    createElement: mk,
    getElementById: (id) => doc.body.walk((c) => c.id === id),
    querySelector: (sel) => doc.body.querySelector(sel),
    addEventListener: (t, fn) => clicks.push(fn),
    removeEventListener: (t, fn) => clicks.splice(clicks.indexOf(fn), 1),
  };
  doc.body = mk('body');
  const win = {
    MutationObserver: class {
      constructor(fn) { this.fn = fn; }
      observe(target) { this.target = target; if (!observers.includes(this)) observers.push(this); }
      disconnect() { if (observers.includes(this)) observers.splice(observers.indexOf(this), 1); this.target = null; }
    },
  };
  /** Runs the observers that saw a change (as the browser does after the task). */
  const flush = () => { for (const o of [...observers]) if (o.pending) { o.pending = false; o.fn([]); } };
  const click = (target) => { for (const fn of [...clicks]) fn({ target }); };
  const menu = () => {
    const list = mk('div');
    list.id = 'more-list';
    const btn = mk('button');
    btn.id = 'more-btn';
    btn.closest = (sel) => (sel === '#more-btn' ? btn : null);
    doc.body.append(btn, list);
    return { list, btn };
  };
  const settingsGroup = (list) => {
    const g = mk('div');
    g.dataset.menuGroup = 'settings';
    g.hidden = true;
    list.append(g);
    return g;
  };
  return { doc, win, flush, click, menu, settingsGroup, observers };
}

const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };
const rows = (doc) => { const out = []; doc.body.walk((c) => { if (String(c.className).split(' ').includes('menu-float-stick')) out.push(c); return false; }); return out; };

describe('the Stick follows your thumb switch, whenever the Menu is built', () => {
  it('goes in at once when the Settings group is already there (the lane\'s WebKit order)', () => {
    const page = fakePage();
    const { list } = page.menu();
    const g = page.settingsGroup(list);
    const keep = keepFloatStickSwitch(page.doc, createFloatStick({ win: {}, storage: memory() }), { win: page.win });
    assert.equal(rows(page.doc).length, 1);
    assert.equal(keep.row().parent, g);
    assert.equal(g.hidden, false);
    assert.equal(keep.row().children[1].textContent, FLOAT_STICK_LABEL);
  });

  it('goes in when the Menu is built after the controls (the real iPhone\'s order)', () => {
    const page = fakePage();
    const keep = keepFloatStickSwitch(page.doc, createFloatStick({ win: {}, storage: memory() }), { win: page.win });
    assert.equal(keep.row(), null, 'no Menu yet');
    const { list } = page.menu();
    page.flush();
    assert.equal(rows(page.doc).length, 0, 'a Menu with no Settings group yet');
    const g = page.settingsGroup(list);
    page.flush();
    assert.equal(rows(page.doc).length, 1);
    assert.equal(keep.row().parent, g);
    page.flush();
    page.flush();
    assert.equal(rows(page.doc).length, 1, 'never two rows');
  });

  it('comes back after the Settings group is rebuilt', () => {
    const page = fakePage();
    const { list } = page.menu();
    const old = page.settingsGroup(list);
    keepFloatStickSwitch(page.doc, createFloatStick({ win: {}, storage: memory() }), { win: page.win });
    page.flush();
    old.remove();
    page.flush();
    assert.equal(rows(page.doc).length, 0);
    const fresh = page.settingsGroup(list);
    page.flush();
    assert.equal(rows(page.doc).length, 1);
    assert.equal(rows(page.doc)[0].parent, fresh);
  });

  it('goes in as the Menu opens, even with no page watch', () => {
    const page = fakePage();
    delete page.win.MutationObserver;
    const was = globalThis.MutationObserver;
    globalThis.MutationObserver = undefined;
    try {
      keepFloatStickSwitch(page.doc, createFloatStick({ win: {}, storage: memory() }), { win: page.win });
      const { list, btn } = page.menu();
      page.settingsGroup(list);
      assert.equal(rows(page.doc).length, 0);
      page.click(btn);
      assert.equal(rows(page.doc).length, 1);
      page.click(btn);
      assert.equal(rows(page.doc).length, 1, 'never two rows');
    } finally {
      globalThis.MutationObserver = was;
    }
  });

  it('watches only the Menu once it is there, so the page\'s own changes never wake it', () => {
    const page = fakePage();
    keepFloatStickSwitch(page.doc, createFloatStick({ win: {}, storage: memory() }), { win: page.win });
    assert.equal(page.observers[0].target, page.doc.body, 'the page until the Menu comes');
    const { list } = page.menu();
    page.flush();
    assert.equal(page.observers[0].target, list);
    const toast = page.doc.createElement('div');
    page.doc.body.append(toast);
    assert.ok(!page.observers[0].pending, 'a change elsewhere on the page');
    page.settingsGroup(list);
    assert.equal(page.observers[0].pending, true);
    page.flush();
    assert.equal(rows(page.doc).length, 1);
  });

  it('destroy takes the row and the watch away', () => {
    const page = fakePage();
    const { list } = page.menu();
    page.settingsGroup(list);
    const keep = keepFloatStickSwitch(page.doc, createFloatStick({ win: {}, storage: memory() }), { win: page.win });
    keep.destroy();
    assert.equal(rows(page.doc).length, 0);
    assert.equal(page.observers.length, 0);
  });
});
