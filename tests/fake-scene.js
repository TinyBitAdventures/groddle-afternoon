/**
 * A fake Pixi and page for running a scene's real drawing code in Node (the visited home street,
 * its Butler and signpost): display objects keep children, parent, destroyed and x/y; any other
 * call or read is a no-op that returns itself (never a thenable, 0 as a number). Canvases hand
 * back the same no-op context. Used by visitor-butler-leaves, home-signpost-after-visit and street-project-work-bubble.
 */
export const noop = () => chain;
export const chain = new Proxy(function chainFn() {}, {
  get: (t, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'then' ? undefined : k === Symbol.iterator ? [][Symbol.iterator].bind([]) : chain),
  apply: () => chain,
  construct: () => chain,
});

export class Display {
  constructor() {
    this.children = [];
    this.parent = null;
    this.destroyed = false;
    this.x = 0;
    this.y = 0;
    this.zIndex = 0;
    this.visible = true;
    this.alpha = 1;
    this.rotation = 0;
    this.width = 0;
    this.height = 0;
    this.scale = { x: 1, y: 1, set(a, b = a) { this.x = a; this.y = b; } };
    this.anchor = { x: 0, y: 0, set(a, b = a) { this.x = a; this.y = b; } };
    this.pivot = { x: 0, y: 0, set(a, b = a) { this.x = a; this.y = b; } };
    this.position = { set: (a, b = a) => { this.x = a; this.y = b; } };
    return new Proxy(this, { get: (t, k) => (k in t || typeof k === 'symbol' ? t[k] : noop) });
  }
  addChild(...kids) {
    for (const k of kids) {
      k.parent?.removeChild?.(k);
      k.parent = this;
      this.children.push(k);
    }
    return kids[0];
  }
  addChildAt(k, i) {
    k.parent?.removeChild?.(k);
    k.parent = this;
    this.children.splice(i, 0, k);
    return k;
  }
  removeChild(k) {
    const i = this.children.indexOf(k);
    if (i >= 0) this.children.splice(i, 1);
    if (k) k.parent = null;
    return k;
  }
  removeChildren() {
    const out = this.children.splice(0);
    for (const k of out) k.parent = null;
    return out;
  }
  destroy() {
    this.destroyed = true;
    this.parent?.removeChild(this);
    for (const k of [...this.children]) k.destroy?.();
  }
  getBounds() { return { x: this.x, y: this.y, width: 0, height: 0 }; }
}
export const fakePixi = new Proxy({ Container: Display, Graphics: Display, Sprite: Display, Text: Display, TilingSprite: Display }, {
  get: (t, k) => (k in t ? t[k] : typeof k === 'symbol' ? undefined : chain),
});

export class FakeEl {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.attrs = {};
    this.listeners = {};
    this.hidden = false;
    this.textContent = '';
    this.style = {};
    this.dataset = {};
    this.classList = { add() {}, remove() {}, toggle() {}, contains: () => false };
  }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'hidden') this.hidden = true; }
  append(...kids) { this.children.push(...kids); }
  appendChild(kid) { this.children.push(kid); return kid; }
  prepend(...kids) { this.children.unshift(...kids); }
  removeAttribute(k) { delete this.attrs[k]; }
  getAttribute(k) { return this.attrs[k] ?? null; }
  closest() { return null; }
  contains() { return false; }
  insertBefore(kid) { this.children.push(kid); }
  replaceChildren(...kids) { this.children = kids; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  /** A selector on an element made from innerHTML (a panel's slots): one element per selector, made on first ask. */
  querySelector(sel) {
    this.slots ||= new Map();
    if (!this.slots.has(sel)) this.slots.set(sel, new FakeEl('div'));
    return this.slots.get(sel);
  }
  querySelectorAll() { return []; }
  getContext() { return chain; }
  remove() {}
  focus() {}
  /** This element and every element under it. */
  all() { return [this, ...[...this.children, ...(this.slots?.values() || [])].flatMap((c) => (c instanceof FakeEl ? c.all() : []))]; }
  fire(type, e = {}) { for (const fn of this.listeners[type] || []) fn({ preventDefault() {}, stopPropagation() {}, target: this, ...e }); }
}
