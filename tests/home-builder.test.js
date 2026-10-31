/**
 * BUILDER: Decorate and Cultivate as a visual builder (js/ui/home-builder.js, wired by
 * features/homes-feature.js): the furniture bag's categories (DecorateModel.as furniture_panesA,
 * FurnitureBagFilterUI), the decorate camera (HandOfDecorator maybeScrollVPByKeys /
 * maybeScrollVPByDragging / onMouseWheel), where a pack item rests indoors
 * (calculateTargetPlatformLineForRegStackFromPt), the DOM's tabs, tiles and drags, and the wiring
 * that keeps every drop on the existing rules.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ALL_PANE,
  BUILDER_TEXT,
  DRAG_DIST,
  FURNITURE_PANES,
  clampRoomX,
  createHomeBuilder,
  cultChooseText,
  decorLook,
  edgePan,
  filterTiles,
  furniturePane,
  panDirection,
  panKey,
  placeCostText,
  trayFilters,
} from '../public/js/ui/home-builder.js?v=2e0c377b';
import {
  INTERIOR,
  createHomeDecorState,
  furnishDemoRoom,
  listPlaceable,
  pickUpFurniture,
  placeFurniture,
  stackSurfaceAt,
  surfaceHeight,
} from '../public/js/home-decor.js?v=cbf17565';
import { FURNITURE_CATALOG } from '../public/js/homes-catalog.js?v=29713fa8';

const root = join(import.meta.dirname, '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const client = join(root, '..', 'glitch-client', 'com', 'tinyspeck', 'engine');

describe('the furniture bag (DecorateModel furniture_panesA, FurnitureBagFilterUI)', () => {
  it('keeps the source panes, in order, with their labels', () => {
    assert.deepEqual(FURNITURE_PANES.map((p) => p.id), ['seating', 'beds', 'fireplaces', 'tables', 'shelves', 'storage', 'lights', 'rugs', 'windows', 'doors', 'decorations', 'trophies']);
    assert.equal(ALL_PANE.plural, 'furniture items');
    let src = null;
    try { src = readFileSync(join(client, 'model', 'DecorateModel.as'), 'utf8'); } catch { /* the client clone is optional */ }
    if (src) {
      for (const pane of FURNITURE_PANES) {
        assert.ok(src.includes(`{id:'${pane.id}', label:'${pane.label}', label_plural:'${pane.plural}'`), pane.id);
        for (const cls of pane.items) assert.ok(src.includes(`'${cls}'`), cls);
      }
    }
  });

  it('puts every catalog class the source names in its pane, and the rest by family', () => {
    assert.equal(furniturePane('furniture_armchair'), 'seating');
    assert.equal(furniturePane('furniture_bookcase'), 'shelves');
    assert.equal(furniturePane('bag_furniture_sdb'), 'storage');
    assert.equal(furniturePane('trophy_anything'), 'trophies');
    assert.equal(furniturePane('furniture_largewindow'), 'windows');
    assert.equal(furniturePane('furniture_painting'), 'decorations');
    assert.equal(furniturePane('furniture_smallwalldeco'), 'decorations');
    assert.equal(furniturePane('furniture_lamp'), 'lights');
    assert.equal(furniturePane('furniture_cabinet'), 'storage');
    // Every class the remake sells finds a pane.
    for (const cls of Object.keys(FURNITURE_CATALOG)) assert.ok(furniturePane(cls), cls);
  });

  it('counts each category from the tiles, All first, the rest by name', () => {
    const rows = [
      { classTsid: 'furniture_chair', total: 2 },
      { classTsid: 'furniture_sofa', total: 1 },
      { classTsid: 'furniture_shelf', total: 1 },
      { classTsid: 'bag_furniture_sdb', total: 3 },
      { classTsid: 'furniture_rug', total: 0 },
    ];
    assert.deepEqual(trayFilters(rows), [
      { id: 'all', count: 7, label: '7 furniture items' },
      { id: 'seating', count: 3, label: '3 seating' },
      { id: 'shelves', count: 1, label: '1 shelf' },
      { id: 'storage', count: 3, label: '3 storage' },
    ]);
    assert.deepEqual(trayFilters([{ classTsid: 'furniture_bed', total: 1 }]).map((f) => f.label), ['1 furniture item', '1 bed']);
    assert.deepEqual(filterTiles(rows, 'seating').map((r) => r.classTsid), ['furniture_chair', 'furniture_sofa']);
    assert.equal(filterTiles(rows, 'all').length, rows.length);
  });

  it('lists the real bag: a furnished room with pieces in storage', () => {
    const state = createHomeDecorState();
    furnishDemoRoom(state);
    state.storage.furniture_armchair = 2;
    state.storage.furniture_bed = 1;
    const list = listPlaceable(state, { furniture_chair: 1 });
    const f = trayFilters(list);
    assert.equal(f[0].id, 'all');
    assert.equal(f[0].count, list.reduce((n, r) => n + r.total, 0));
    assert.ok(f.some((x) => x.id === 'beds' && x.count === 1));
    assert.ok(f.find((x) => x.id === 'seating').count >= 3);
  });
});

describe('the words', () => {
  it('uses the client toolbars and picker text, without em dashes', () => {
    assert.equal(BUILDER_TEXT.decorateTitle, 'You are in Decoration Mode');
    assert.equal(BUILDER_TEXT.cultivateTitle, 'You are in Cultivation Mode');
    assert.equal(cultChooseText(false), 'Choose an item to see where you can add it on your street.');
    assert.equal(cultChooseText(true), 'Choose an item to see where you can add it in your yard.');
    assert.equal(placeCostText(1250), 'Place (1,250 iMG)');
    assert.equal(BUILDER_TEXT.moveHere, 'Move Here');
    for (const text of [...Object.values(BUILDER_TEXT), cultChooseText(), placeCostText(1)]) {
      assert.ok(!/—/.test(text), text);
      assert.ok(!/Glitch/.test(text), text);
    }
    let src = null;
    try { src = readFileSync(join(client, 'view', 'CultCarryUI.as'), 'utf8'); } catch { /* optional */ }
    if (src) assert.match(src, /invoke_bt\.label = 'Place \('\+current_choice\.imagination_cost\+' iMG\)';/);
  });
});

describe('the decorate camera', () => {
  it('scrolls with the arrows and WASD (maybeScrollVPByKeys)', () => {
    assert.deepEqual(panKey('ArrowLeft'), [-1, 0]);
    assert.deepEqual(panKey('d'), [1, 0]);
    assert.deepEqual(panKey('W'), [0, -1]);
    assert.deepEqual(panKey('s'), [0, 1]);
    assert.equal(panKey('x'), null);
    assert.deepEqual(panDirection(['ArrowRight', 'w']), { dx: 1, dy: -1 });
    assert.deepEqual(panDirection(['a', 'd']), { dx: 0, dy: 0 });
  });

  it('stays inside the room, and a narrow room sits centred', () => {
    const span = { left: 1000, right: 4150, view: 1000 };
    assert.equal(clampRoomX(0, span), 1000 - 40 + 500);
    assert.equal(clampRoomX(99999, span), 4150 + 40 - 500);
    assert.equal(clampRoomX(2500, span), 2500);
    assert.equal(clampRoomX(0, { left: 0, right: 600, view: 1000 }), 300);
  });

  it('pans between the ceiling band under the banner and the floor over the tray', () => {
    const short = decorLook({ playerY: INTERIOR.floorY, anchor: 0.75, view: 520, top: 60, bottom: 120, ceilingTop: INTERIOR.ceilingTop, floorFront: INTERIOR.floorFront });
    assert.ok(short.ceiling < short.floor, 'the ceiling look is above the floor look');
    assert.equal(short.lo, short.ceiling);
    assert.equal(short.hi, short.floor);
    // A view that holds the whole room needs no panning.
    const tall = decorLook({ playerY: INTERIOR.floorY, anchor: 0.75, view: 900, top: 60, bottom: 120, ceilingTop: INTERIOR.ceilingTop, floorFront: INTERIOR.floorFront });
    assert.equal(tall.lo, tall.hi);
  });

  it('scrolls while dragging at the stage edge (maybeScrollVPByDragging)', () => {
    const rect = { left: 0, top: 100, right: 1000, bottom: 600 };
    assert.deepEqual(edgePan(10, 300, rect), { dx: -1, dy: 0 });
    assert.deepEqual(edgePan(990, 300, rect), { dx: 1, dy: 0 });
    assert.deepEqual(edgePan(500, 120, rect), { dx: 0, dy: -1 });
    assert.deepEqual(edgePan(500, 590, rect), { dx: 0, dy: 1 });
    // Down in the tray itself it never scrolls down (a drop there puts the piece away).
    assert.deepEqual(edgePan(500, 700, rect), { dx: 0, dy: 0 });
    assert.deepEqual(edgePan(500, 300, rect), { dx: 0, dy: 0 });
  });
});

describe('pack items on shelves and tables (the dropped-stack model)', () => {
  const room = () => {
    const state = createHomeDecorState();
    state.storage.furniture_shelf = 1;
    state.storage.furniture_table = 1;
    state.storage.furniture_chair = 1;
    placeFurniture(state, {}, 'furniture_shelf', { x: 260, y: 380 });
    placeFurniture(state, {}, 'furniture_table', { x: 520, y: INTERIOR.floorY });
    placeFurniture(state, {}, 'furniture_chair', { x: 780, y: INTERIOR.floorY });
    return state;
  };

  it('rests on the shelf or table top under the point', () => {
    const state = room();
    const shelf = state.placed.find((r) => r.classTsid === 'furniture_shelf');
    const table = state.placed.find((r) => r.classTsid === 'furniture_table');
    const onShelf = stackSurfaceAt(state, shelf.x + 10, shelf.y - 80);
    assert.equal(onShelf.on, shelf.id);
    assert.equal(onShelf.y, shelf.y - surfaceHeight('furniture_shelf'));
    const onTable = stackSurfaceAt(state, table.x, 300);
    assert.equal(onTable.on, table.id);
    assert.equal(onTable.y, table.y - surfaceHeight('furniture_table'));
  });

  it('falls to the floor under a chair, below a shelf, or in open space', () => {
    const state = room();
    const shelf = state.placed.find((r) => r.classTsid === 'furniture_shelf');
    const chair = state.placed.find((r) => r.classTsid === 'furniture_chair');
    assert.deepEqual(stackSurfaceAt(state, chair.x, 400), { x: chair.x, y: INTERIOR.floorY, on: null });
    assert.equal(stackSurfaceAt(state, shelf.x, shelf.y + 40).on, null, 'under the shelf it lands on the floor');
    assert.equal(stackSurfaceAt(state, 860, 200).on, null);
  });

  it('stays inside the room', () => {
    const state = room();
    assert.ok(stackSurfaceAt(state, -500, 300).x > 0);
    assert.ok(stackSurfaceAt(state, 99999, 300).x < 99999);
  });

  it('drops through game.js as Drop does: the same block reasons and the same dropped-stack record', () => {
    const game = read('public/game.js');
    const fn = game.slice(game.indexOf('dropPackStackAt(classTsid, count, x, y) {'));
    assert.match(fn.slice(0, 900), /const blocked = packDropBlockReason\(classTsid\);/);
    assert.match(fn.slice(0, 900), /dropInventoryStack\(droppedItemState, inv, droppedStacksTsid\(\), classTsid, n, \{ x, y \}/);
    assert.match(fn.slice(0, 900), /saveDroppedItems\(\);\s+refreshDroppedWorldItems\(\);/);
    const homes = read('public/js/features/homes-feature.js');
    assert.match(homes, /engine\.dropPackStackAt\?\.\(was\.classTsid, was\.count, target\.x \+ roomX0\(\), target\.y\)/);
    // The pack's dragstart reaches the decorate drag through the pour hook.
    assert.match(homes, /function startPourDrag\(classTsid, event, engine\) \{\n[^\n]*\n  if \(mode === 'decorate'\) return startPackDrag\(classTsid, event, engine\);/);
  });
});

describe('drags go through the existing rules', () => {
  it('a piece dropped on the tray is picked up by furniture_pickup', () => {
    const homes = read('public/js/features/homes-feature.js');
    const end = homes.slice(homes.indexOf('function endDrag(engine, e,'));
    assert.match(end.slice(0, 1600), /selected = \{ kind: 'furniture', id \};\s+const res = runFurnitureAction\(engine, 'pickup'\);/);
    assert.match(end.slice(0, 1600), /placeAtPointer\(engine, placing\.kind === 'furniture' \? toRoom\(pointer\) : pointer\)/);
    // runFurnitureAction's pickup holds the Door and for-sale checks and pickUpFurniture.
    assert.match(homes, /: typeof sale === 'string' && sale \? \{ ok: false, reason: 'sale', msg: sale \} : pickUpFurniture\(decor, id\);/);
  });

  it('a storage box still holding things stays put', () => {
    const state = createHomeDecorState();
    state.storage.bag_furniture_sdb = 1;
    const box = placeFurniture(state, {}, 'bag_furniture_sdb', { x: 500, y: 400 }).item;
    box.display = { classTsid: 'apple', count: 3 };
    const res = pickUpFurniture(state, box.id);
    assert.equal(res.ok, false);
    assert.equal(res.reason, 'not_empty');
    assert.ok(state.placed.some((r) => r.id === box.id));
  });

  it('holds the avatar while decorating and lets the builder buttons take Enter and Space', () => {
    const game = read('public/game.js');
    const blocked = game.slice(game.indexOf('function gameplayInputBlocked() {'));
    assert.match(blocked.slice(0, 1400), /features\.query\('homeEditMode', engine\) === 'decorate'/);
    const fdb = game.slice(game.indexOf('function focusedDialogButton() {'));
    assert.match(fdb.slice(0, 700), /#pack-bar, #homes-bar, #homes-pop, #homes-place'/);
  });

  it('keeps the keys: arrows scroll, Shift+D still leaves, [ ] choose a piece, Enter places what the keys carry', () => {
    const homes = read('public/js/features/homes-feature.js');
    assert.match(homes, /if \(dir && !\(e\.shiftKey && \(e\.key === 'D' \|\| e\.key === 'd'\)\)\) \{/);
    assert.match(homes, /if \(e\.key === '\[' \|\| e\.key === '\]'\) \{/);
    assert.match(homes, /if \(placing && carryBy === 'keys'\) \{\s+e\.preventDefault\(\);\s+ui\?\.builder\?\.place\?\.click\(\);/);
    assert.ok(BUILDER_TEXT.keys.includes('[ and ]'));
  });
});

// ---------------------------------------------------------------------------
// A small DOM for the module's own drawing and drags.
// ---------------------------------------------------------------------------

function fakeDom() {
  const listeners = new Map();
  const on = (target, type, fn) => {
    const key = target;
    if (!listeners.has(key)) listeners.set(key, []);
    listeners.get(key).push({ type, fn });
  };
  const off = (target, type, fn) => {
    const rows = listeners.get(target) || [];
    const i = rows.findIndex((r) => r.type === type && r.fn === fn);
    if (i >= 0) rows.splice(i, 1);
  };
  const fire = (target, type, extra = {}) => {
    const ev = { type, target, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, ...extra };
    for (const r of [...(listeners.get(target) || [])]) if (r.type === type) r.fn(ev);
    return ev;
  };
  const matches = (node, sel) => {
    if (!node?.tagName) return false;
    const re = /([.#]?[\w-]+)|\[([\w-]+)(?:="([^"]*)")?\]/g;
    let m;
    while ((m = re.exec(sel))) {
      if (m[1]) {
        if (m[1][0] === '.') { if (!node.classList.contains(m[1].slice(1))) return false; } else if (m[1][0] === '#') { if (node.getAttribute('id') !== m[1].slice(1)) return false; } else if (node.tagName.toLowerCase() !== m[1]) return false;
      } else if (m[2]) {
        const v = node.getAttribute(m[2]);
        if (v == null || (m[3] != null && v !== m[3])) return false;
      }
    }
    return true;
  };
  const walk = (node, out = []) => {
    for (const c of node.children) {
      out.push(c);
      walk(c, out);
    }
    return out;
  };
  let doc;
  class El {
    constructor(tag) {
      this.tagName = tag.toUpperCase();
      this.children = [];
      this.parentNode = null;
      this.attrs = {};
      this.dataset = {};
      this.style = { props: {}, setProperty(k, v) { this.props[k] = v; }, getPropertyValue(k) { return this.props[k] || ''; } };
      this._text = '';
      this.nodeType = 1;
      this.rect = { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
      const self = this;
      this.classList = {
        add: (...c) => { const s = new Set(self.className.split(' ').filter(Boolean)); c.forEach((x) => s.add(x)); self.className = [...s].join(' '); },
        remove: (...c) => { self.className = self.className.split(' ').filter((x) => x && !c.includes(x)).join(' '); },
        contains: (c) => self.className.split(' ').includes(c),
        toggle: (c, on) => { const want = on ?? !self.classList.contains(c); if (want) self.classList.add(c); else self.classList.remove(c); return want; },
      };
    }
    get className() { return this.attrs.class || ''; }
    set className(v) { this.attrs.class = v; }
    get ownerDocument() { return doc; }
    get hidden() { return 'hidden' in this.attrs; }
    set hidden(v) { if (v) this.attrs.hidden = ''; else delete this.attrs.hidden; }
    get disabled() { return 'disabled' in this.attrs; }
    set disabled(v) { if (v) this.attrs.disabled = ''; else delete this.attrs.disabled; }
    get id() { return this.attrs.id || ''; }
    get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
    set textContent(v) { this._text = String(v); this.children = []; }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
    removeAttribute(k) { delete this.attrs[k]; }
    append(...nodes) { for (const n of nodes) { if (typeof n === 'string') { this._text += n; continue; } n.parentNode = this; this.children.push(n); } }
    replaceChildren(...nodes) { this.children = []; this._text = ''; this.append(...nodes); }
    contains(n) { while (n) { if (n === this) return true; n = n.parentNode; } return false; }
    querySelector(sel) { return walk(this).find((n) => matches(n, sel)) || null; }
    querySelectorAll(sel) { return walk(this).filter((n) => matches(n, sel)); }
    addEventListener(t, fn) { on(this, t, fn); }
    removeEventListener(t, fn) { off(this, t, fn); }
    getBoundingClientRect() { return this.rect; }
    focus() { doc.activeElement = this; }
    click() { fire(this, 'click', { detail: 1 }); }
    scrollBy() {}
    scrollIntoView() {}
    get clientWidth() { return 600; }
    get scrollWidth() { return 1200; }
    scrollLeft = 0;
  }
  const win = { addEventListener: (t, fn) => on(win, t, fn), removeEventListener: (t, fn) => off(win, t, fn), matchMedia: () => ({ matches: false }) };
  doc = { createElement: (t) => new El(t), documentElement: new El('html'), defaultView: win, activeElement: null };
  return { doc, win, fire, El };
}

describe('the builder DOM', () => {
  const setup = () => {
    const dom = fakeDom();
    const root = dom.doc.createElement('div');
    root.rect = { left: 0, top: 0, right: 1280, bottom: 800, width: 1280, height: 800 };
    const b = createHomeBuilder({ root, doc: dom.doc });
    b.tray.rect = { left: 20, top: 620, right: 1200, bottom: 790, width: 1180, height: 170 };
    return { ...dom, root, b };
  };
  const model = (calls) => ({
    mode: 'decorate',
    title: BUILDER_TEXT.decorateTitle,
    hint: BUILDER_TEXT.decorateHint,
    onClose: () => calls.push('close'),
    bannerActions: [{ label: 'Expand', attrs: { 'data-home-expand': 'house' }, onClick: () => calls.push('expand') }],
    tabs: [{ id: 'pack', label: 'Pack' }, { id: 'furniture', label: 'Furniture' }, { id: 'wall', label: 'Walls' }],
    tab: 'furniture',
    onTab: (id) => calls.push(`tab:${id}`),
    filters: [{ id: 'all', label: '2 furniture items' }, { id: 'seating', label: '2 seating' }],
    filter: 'all',
    onFilter: (id) => calls.push(`filter:${id}`),
    tiles: [{
      label: 'Chair',
      img: 'x.png',
      count: 2,
      attrs: { 'data-furniture': 'furniture_chair' },
      onActivate: ({ keyboard }) => calls.push(`activate:${keyboard}`),
      onDragStart: () => calls.push('dragstart'),
      onDragMove: () => calls.push('dragmove'),
      onDragEnd: (e, how) => calls.push(`dragend:${how.overTray}`),
    }],
    footActions: [{ label: 'Furniture Store', attrs: { 'data-home-store': '1' }, onClick: () => calls.push('store') }],
  });

  it('keeps the old bar id and close class that Shift+D clicks', () => {
    const { b } = setup();
    assert.equal(b.bar.getAttribute('id'), 'homes-bar');
    const src = read('public/js/ui/home-builder.js');
    assert.match(src, /id: 'homes-bar'/);
    assert.match(src, /class: 'hb-close'/);
  });

  it('draws the banner, tabs, filters and tiles, and marks the page for the skins', () => {
    const calls = [];
    const { b, doc } = setup();
    b.render(model(calls));
    assert.equal(b.bar.hidden, false);
    assert.equal(doc.documentElement.dataset.homeBuilder, 'decorate');
    assert.equal(doc.documentElement.dataset.homeTray, 'furniture');
    assert.equal(b.banner.querySelector('.hb-title').textContent, 'You are in Decoration Mode');
    const tabs = b.tray.querySelectorAll('[role="tab"]');
    assert.deepEqual(tabs.map((t) => t.getAttribute('data-home-tab')), ['pack', 'furniture', 'wall']);
    assert.equal(tabs[1].getAttribute('aria-selected'), 'true');
    tabs[2].click();
    const filters = b.tray.querySelectorAll('[data-home-filter]');
    assert.equal(filters[0].getAttribute('aria-pressed'), 'true');
    filters[1].click();
    b.banner.querySelector('[data-home-expand="house"]').click();
    b.banner.querySelector('.hb-close').click();
    b.tray.querySelector('[data-home-store="1"]').click();
    assert.deepEqual(calls, ['tab:wall', 'filter:seating', 'expand', 'close', 'store']);
    const tile = b.tray.querySelector('[data-furniture="furniture_chair"]');
    assert.equal(tile.getAttribute('aria-label'), null);
    assert.equal(tile.querySelector('.hb-count').textContent, '2');
    b.render(null);
    assert.equal(b.bar.hidden, true);
    assert.equal(doc.documentElement.dataset.homeBuilder, undefined);
  });

  it('a tile clicked from the keyboard says so (click to carry stays)', () => {
    const calls = [];
    const { b, fire } = setup();
    b.render(model(calls));
    const tile = b.tray.querySelector('[data-furniture="furniture_chair"]');
    fire(tile, 'click', { detail: 0 });
    fire(tile, 'click', { detail: 1 });
    assert.deepEqual(calls, ['activate:true', 'activate:false']);
  });

  it('a tile pressed and moved is a drag, dropped on the room or back on the tray', () => {
    const calls = [];
    const { b, fire, win } = setup();
    b.render(model(calls));
    const tile = b.tray.querySelector('[data-furniture="furniture_chair"]');
    fire(tile, 'pointerdown', { button: 0, clientX: 100, clientY: 700, pointerId: 1 });
    fire(win, 'pointermove', { clientX: 100 + DRAG_DIST - 1, clientY: 700, pointerId: 1 });
    assert.deepEqual(calls, [], 'a small wobble is still a click');
    fire(win, 'pointermove', { clientX: 400, clientY: 300, pointerId: 1 });
    assert.equal(b.dragging, true);
    fire(win, 'pointerup', { clientX: 400, clientY: 300, pointerId: 1 });
    assert.deepEqual(calls, ['dragstart', 'dragmove', 'dragend:false']);
    // The click after a drag is not a second activation.
    fire(tile, 'click', { detail: 1 });
    assert.equal(calls.includes('activate:false'), false);
    // Released over the tray: the drop puts it back.
    calls.length = 0;
    const tile2 = b.tray.querySelector('[data-furniture="furniture_chair"]');
    fire(tile2, 'pointerdown', { button: 0, clientX: 100, clientY: 700, pointerId: 2 });
    fire(win, 'pointermove', { clientX: 300, clientY: 400, pointerId: 2 });
    fire(win, 'pointerup', { clientX: 300, clientY: 700, pointerId: 2 });
    assert.deepEqual(calls, ['dragstart', 'dragmove', 'dragend:true']);
  });

  it('the Place button stays focusable on a bad spot and refuses there', () => {
    const { b } = setup();
    const calls = [];
    b.setPlace({ label: placeCostText(250), disabled: true, onClick: () => calls.push('place'), onRefused: () => calls.push('refused') }, { x: 400, y: 500 });
    assert.equal(b.place.hidden, false);
    assert.equal(b.place.textContent, 'Place (250 iMG)');
    assert.equal(b.place.getAttribute('aria-disabled'), 'true');
    assert.equal(b.place.disabled, false);
    b.place.onclick({});
    b.setPlace({ label: placeCostText(250), disabled: false, onClick: () => calls.push('place') }, { x: 400, y: 500 });
    b.place.onclick({});
    assert.deepEqual(calls, ['refused', 'place']);
    b.setPlace(null);
    assert.equal(b.place.hidden, true);
  });

  it('the floating actions show by the piece and hide with no selection', () => {
    const { b } = setup();
    const calls = [];
    b.setPop({ key: 'f:1', title: 'Chair', actions: [{ label: 'Move', attrs: { 'data-home-action': 'move' }, onClick: () => calls.push('move') }] }, { x: 400, y: 300, bottom: 420 });
    assert.equal(b.pop.hidden, false);
    assert.equal(b.pop.getAttribute('role'), 'toolbar');
    b.pop.querySelector('[data-home-action="move"]').click();
    assert.deepEqual(calls, ['move']);
    b.setPop(null);
    assert.equal(b.pop.hidden, true);
  });
});

describe('two skins, one DOM', () => {
  it('styles the builder for Modern in style.css and for Classic in classic.css', () => {
    const style = read('public/style.css');
    const classic = read('public/css/classic.css');
    assert.match(style, /\/\* —— BUILDER —— /);
    assert.match(style, /\[data-ui="modern"\] #game-root \.hb-tray \{/);
    assert.match(classic, /:root\[data-ui="classic"\] #game-root \.hb-tray \{/);
    // The old side sheet is gone.
    assert.doesNotMatch(style, /#game-root \.homes-bar \{\s*left: var\(--hud-inset\)/);
    // Classic uses the 2012 bag's own art for its paging arrows.
    assert.match(classic, /assets\/classic\/furn_scroll\.png/);
  });

  it('keeps the tray tabs on one row, and the Pack tab clear of the pack and an open bag', () => {
    const style = read('public/style.css');
    const classic = read('public/css/classic.css');
    assert.match(style, /#game-root \.hb-tray \.hb-tabs \{[^}]*flex-wrap: nowrap;[^}]*min-width: max-content;/);
    assert.match(style, /#game-root \.hb-tray \.hb-tabs button \{ white-space: nowrap; \}/);
    assert.match(style, /\.hb-tray\[data-tab="pack"\] \{ right: auto; width: max-content;/);
    assert.doesNotMatch(style, /\.hb-tray\[data-tab="pack"\] \.hb-tabs \{ flex-wrap: wrap; \}/);
    // Classic: the bag rises over the tabs that hang 17 above the pack band.
    assert.match(classic, /:root\[data-ui="classic"\]\[data-home-tray="pack"\] #game-root \.pack-bag-row \{ bottom: calc\(100% \+ 8px \+ 21 \* var\(--cu\)\); \}/);
  });

  it('respects reduced motion', () => {
    const style = read('public/style.css');
    assert.match(style, /@media \(prefers-reduced-motion: no-preference\) \{\s*\[data-ui="modern"\] #game-root :is\(\.hb-tile/);
    assert.match(read('public/js/ui/home-builder.js'), /prefers-reduced-motion: reduce/);
  });
});
