/**
 * A small DOM for the Social drawer's tests (tests/social-drawer*.test.js): elements with
 * attributes, classes, data-*, tree edits, listeners with capture and bubble, and the
 * selectors the drawer and the multiplayer features use (tag, #id, .class, [attr], [attr="v"]).
 */
export function matches(node, sel) {
  return sel.split(',').some((one) => {
    const m = /^([a-z]+)?(?:#([\w-]+))?((?:\.[\w-]+)*)((?:\[[^\]]+\])*)$/i.exec(one.trim());
    if (!m) throw new Error(`selector ${one}`);
    if (m[1] && node.tagName !== m[1].toUpperCase()) return false;
    if (m[2] && node.id !== m[2]) return false;
    for (const c of m[3].split('.').filter(Boolean)) if (!node.classList.contains(c)) return false;
    for (const a of m[4].matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)) {
      const v = node.getAttribute(a[1]);
      if (v === null) return false;
      if (a[2] !== undefined && v !== a[2]) return false;
    }
    return true;
  });
}

export class FakeEl {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.attrs = {};
    this.listeners = {};
    this.parentElement = null;
    this._text = '';
    this.value = '';
    this.placeholder = '';
    this.scrollTop = 0;
    this.scrollHeight = 0;
    this.clientHeight = 0;
    this.style = { props: {}, setProperty(k, v) { this.props[k] = v; }, getPropertyValue(k) { return this.props[k] || ''; } };
    const self = this;
    this.dataset = new Proxy({}, {
      set(t, k, v) { t[k] = String(v); self.attrs[`data-${String(k).replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`] = String(v); return true; },
      deleteProperty(t, k) { delete t[k]; delete self.attrs[`data-${String(k).replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`]; return true; },
    });
    this.classList = {
      add: (...c) => { const s = new Set((this.attrs.class || '').split(' ').filter(Boolean)); c.forEach((x) => s.add(x)); this.attrs.class = [...s].join(' '); },
      toggle: (c, on) => { const s = new Set((this.attrs.class || '').split(' ').filter(Boolean)); if (on ?? !s.has(c)) s.add(c); else s.delete(c); this.attrs.class = [...s].join(' '); },
      contains: (c) => (this.attrs.class || '').split(' ').includes(c),
    };
    this.rect = { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
  }
  get id() { return this.attrs.id || ''; }
  set id(v) { this.attrs.id = v; }
  get hidden() { return 'hidden' in this.attrs; }
  set hidden(v) { if (v) this.attrs.hidden = ''; else delete this.attrs.hidden; }
  get title() { return this.attrs.title || ''; }
  set title(v) { this.attrs.title = v; }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this._text = String(v); this.children = []; }
  set innerHTML(v) { this._html = String(v); this.children = []; this._text = String(v).replace(/<[^>]+>/g, ''); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  removeAttribute(k) { delete this.attrs[k]; }
  adopt(kids) { for (const k of kids) { if (k.parentElement) k.parentElement.children = k.parentElement.children.filter((c) => c !== k); k.parentElement = this; } }
  append(...kids) { const ks = kids.map((k) => (typeof k === 'string' ? new FakeText(k) : k)); this.adopt(ks); this.children.push(...ks); }
  prepend(...kids) { this.adopt(kids); this.children.unshift(...kids); }
  replaceChildren(...kids) { for (const c of this.children) c.parentElement = null; this.children = []; this.append(...kids); }
  addEventListener(type, fn, capture) { (this.listeners[type] ||= []).push({ fn, capture: Boolean(capture) }); }
  dispatch(type, init = {}) {
    // Capture from the top, then bubble from the target (enough for submit and keydown here).
    const path = [];
    for (let n = this; n; n = n.parentElement) path.unshift(n);
    const e = { type, target: this, defaultPrevented: false, stopped: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; }, ...init };
    for (const n of path) for (const l of n.listeners[type] || []) if (l.capture && !e.stopped) l.fn(e);
    for (const n of path.reverse()) for (const l of n.listeners[type] || []) if (!l.capture && !e.stopped) l.fn(e);
    return e;
  }
  click() { return this.dispatch('click'); }
  focus() { globalThis.document.activeElement = this; }
  matches(sel) { return matches(this, sel); }
  contains(n) { return n === this || this.all().includes(n); }
  all() { return this.children.flatMap((c) => (c instanceof FakeEl ? [c, ...c.all()] : [])); }
  querySelector(sel) { return this.all().find((n) => matches(n, sel)) || null; }
  querySelectorAll(sel) { return this.all().filter((n) => matches(n, sel)); }
  getBoundingClientRect() { return this.rect; }
  checkVisibility() { return !this.hidden; }
  scrollIntoView() {}
  setSelectionRange() {}
}
export class FakeText { constructor(t) { this.textContent = String(t); this.parentElement = null; } }

export function page() {
  const doc = {
    hidden: false,
    activeElement: null,
    listeners: {},
    createElement: (t) => new FakeEl(t),
    createTextNode: (t) => new FakeText(t),
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
    getElementById: (id) => doc.body.all().find((n) => n.id === id) || null,
    querySelector: (sel) => doc.body.querySelector(sel),
    baseURI: 'https://groddle.localhost/',
    head: new FakeEl('head'),
    body: new FakeEl('body'),
  };
  const game = new FakeEl('div');
  game.id = 'game-root';
  game.rect = { left: 0, top: 60, right: 1280, bottom: 800, width: 1280, height: 740 };
  const dock = new FakeEl('section');
  dock.id = 'local-chat-dock';
  const stream = new FakeEl('div');
  stream.id = 'local-chat-stream';
  const form = new FakeEl('form');
  form.id = 'local-chat-form';
  const label = new FakeEl('label');
  label.setAttribute('for', 'local-chat-input');
  label.textContent = 'Local chat';
  const input = new FakeEl('input');
  input.id = 'local-chat-input';
  input.placeholder = 'Local chat…';
  const send = new FakeEl('button');
  send.setAttribute('type', 'submit');
  send.textContent = 'Say';
  form.append(label, input, send);
  dock.append(stream, form);
  game.append(dock);
  doc.body.append(game);
  return { doc, game, dock, form, input, send };
}

export function memoryStore(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m };
}

