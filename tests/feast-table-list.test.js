/**
 * The Harvest Table's Look opens the list of everything on it (G982, Austin 2026-11-18: "show
 * whatever looks comfortable on the table, then everything else go into an overflow list view"):
 * every offering the table keeps, newest first, each with its icon, its name and who laid it, a
 * last line for the older ones it no longer keeps, in the storage windows' shell
 * (js/ui/storage-windows.js openListDialog, scrolled as the cabinet scrolls its rows). The real
 * feature on the vendored Pixi (in a vm) and a fake page.
 * Run: node --test tests/feast-table-list.test.js
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { page } from './social-fake-dom.js';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const saved = { document: globalThis.document, PIXI: globalThis.PIXI, Image: globalThis.Image };
const t = page();
t.doc.removeEventListener = () => {};
// textures.js draws its 1 x 1 placeholder on a canvas: the fake page's canvas gets a no-op context.
const make = t.doc.createElement;
t.doc.createElement = (tag) => Object.assign(make(tag), tag === 'canvas' ? { getContext: () => ({}) } : {});
globalThis.document = t.doc;
function loadPixi() {
  const g = { console, setTimeout, clearTimeout, navigator: { userAgent: 'node' }, performance };
  g.window = g;
  g.self = g;
  g.globalThis = g;
  vm.createContext(g);
  vm.runInContext(readFileSync(join(ROOT, 'public/vendor/pixi/pixi-8.23.0.min.js'), 'utf8'), g);
  return g.PIXI;
}
const PIXI = loadPixi();
globalThis.PIXI = PIXI;
// Icons never arrive here: the list reads the table, not the drawn sprites.
globalThis.Image = class { constructor() { this.naturalWidth = 40; this.naturalHeight = 40; } };

const { installPixiFixes } = await import('../public/js/pixi-fixes.js?v=0f42b75e');
installPixiFixes(PIXI);
const { addItem } = await import('../public/js/inventory.js?v=3be7988a');
const { TABLE_LINES, TABLE_RULES, TABLE_STREET, HARVEST_DISHES, tableList, createTableState, layOffering } = await import('../public/js/pot-luck-feast.js?v=971888be');
const { potLuckFeastFeature } = await import('../public/js/features/pot-luck-feast-feature.js?v=aee37b98');
const { storageWindowKind, closeStorageWindow } = await import('../public/js/ui/storage-windows.js?v=6b92c103');

let target = null;
const data = {};
const toasts = [];
const engine = {
  PIXI,
  mode: 'solo',
  streetTsid: TABLE_STREET,
  street: { bounds: { l: -3000, t: -1000, r: 3000, b: 0 } },
  platforms: [],
  groundY: 0,
  started: true,
  inv: {},
  entityLayer: new PIXI.Container(),
  param: (k) => (k === 'seasondate' ? '2026-11-26' : ''),
  register(x) {
    target = { ...x };
    return target;
  },
  unregister() {},
  setData(k, v) { data[k] = v; },
  pushActivity() {},
  toast(m) { toasts.push(m); },
  playSound() {},
  save() {},
  refreshPack() {},
  updateHud() {},
  achievement() {},
  query: () => null,
  inScene: () => false,
};

function lay(n) {
  for (let i = 0; i < n; i += 1) {
    const c = HARVEST_DISHES[i % HARVEST_DISHES.length];
    addItem(engine.inv, c, 1);
    potLuckFeastFeature.runVerb(target, `lay:${c}`, engine);
  }
}

const win = () => t.doc.body.querySelector('[data-hst="list"]');
const rows = () => win().querySelectorAll('[data-hst-row]');

describe('the table list (pot-luck-feast.js tableList)', () => {
  it('holds every kept offering newest first, and counts the older ones laid', () => {
    const tb = createTableState();
    for (let i = 0; i < TABLE_RULES.keep + 5; i += 1) layOffering(tb, { c: `c${i}`, who: 'a', day: 'd' });
    const l = tableList(tb);
    assert.equal(l.rows.length, TABLE_RULES.keep);
    assert.equal(l.rows[0].c, `c${TABLE_RULES.keep + 4}`, 'newest first');
    assert.equal(l.older, 5);
    assert.equal(tableList(createTableState()).older, 0);
    assert.equal(TABLE_LINES.listMore(5), 'and 5 more laid earlier');
    assert.equal(TABLE_LINES.listBy('', true), 'laid by you');
    assert.equal(TABLE_LINES.listBy('Pat', false), 'laid by Pat');
  });
});

describe('Look opens the list of everything on the Harvest Table (G982)', () => {
  before(() => {
    potLuckFeastFeature.init(engine);
    potLuckFeastFeature.onStreetEnter({}, engine);
    assert.ok(target, 'the table stands');
  });
  after(async () => {
    try { closeStorageWindow(); } catch { /* the fake page */ }
    await new Promise((r) => setTimeout(r, 5)); // the window's Done takes focus on the next tick
    for (const [k, v] of Object.entries(saved)) globalThis[k] = v;
  });

  it('a bare table says so instead of opening an empty list', () => {
    const look = potLuckFeastFeature.verbsFor(target, engine).find((v) => v.id === 'look');
    assert.equal(look.tooltip, 'See everything on the table');
    potLuckFeastFeature.runVerb(target, 'look', engine);
    assert.equal(storageWindowKind(), '');
    assert.equal(toasts.at(-1), TABLE_LINES.look0);
  });

  it('lists every dish newest first with its icon, its name and who laid it', () => {
    lay(7);
    potLuckFeastFeature.runVerb(target, 'look', engine);
    assert.equal(storageWindowKind(), 'list');
    assert.equal(data.feastList, '7');
    const r = rows();
    assert.equal(r.length, 7);
    const newest = HARVEST_DISHES[6 % HARVEST_DISHES.length];
    assert.equal(r[0].getAttribute('data-hst-row'), `${newest}:0`, 'the newest (the seventh laid) first');
    assert.match(r[0].textContent, /laid by you/);
    assert.match(r[0].querySelector('img').getAttribute('src'), new RegExp(newest));
    assert.equal(win().querySelector('[data-hst-last]'), null, 'nothing older yet');
    assert.match(win().querySelector('small').textContent, /7 dishes laid/);
  });

  it('grows while open, and past what the table keeps ends with the older ones', () => {
    lay(TABLE_RULES.keep);
    assert.equal(rows().length, TABLE_RULES.keep, 'redrawn in place as dishes are laid');
    const older = TABLE_RULES.keep + 7 - TABLE_RULES.keep;
    assert.equal(win().querySelector('[data-hst-last]').textContent, `and ${older} more laid earlier`);
    assert.match(win().querySelector('small').textContent, new RegExp(`${TABLE_RULES.keep + 7} dishes laid`));
  });

  it('Done and leaving the street close it', () => {
    win().querySelector('[data-hst-done]').click();
    assert.equal(storageWindowKind(), '');
    assert.equal(data.feastList, 'closed');
    potLuckFeastFeature.runVerb(target, 'look', engine);
    assert.equal(storageWindowKind(), 'list');
    potLuckFeastFeature.onStreetClear(engine);
    assert.equal(storageWindowKind(), '');
  });

  it('online, a row laid by this player reads "you" and another player by name', () => {
    const me = { id: 7, name: 'Me' };
    const handlers = {};
    const client = { state: 'online', me, on: (k, fn) => { handlers[k] = fn; return () => {}; }, send: () => true };
    const online = { ...engine, mode: 'multiplayer', query: (k) => (k === 'realtimeClient' ? client : null) };
    potLuckFeastFeature.onStreetEnter({}, online);
    handlers['msg:feast_state']({ on: true, total: 50, rows: [{ c: 'potcorn', by: 3, name: 'Pat' }, { c: 'pumpkin_pie', by: 7, name: 'Me' }] });
    potLuckFeastFeature.runVerb(target, 'look', online);
    const r = rows();
    assert.equal(r.length, 2);
    assert.match(r[0].textContent, /laid by you/, 'the newest is this player’s');
    assert.match(r[1].textContent, /laid by Pat/);
    assert.equal(win().querySelector('[data-hst-last]').textContent, 'and 48 more laid earlier');
  });

  it('has the list window’s look in both skins, on tokens only', () => {
    const css = readFileSync(join(ROOT, 'public/js/ui/storage-windows.js'), 'utf8');
    assert.match(css, /\.hst-read \{[^}]*max-height:/, 'the rows scroll inside the window');
    assert.match(css, /:root\[data-ui="classic"\] \.hst-read li \{/);
    const block = css.slice(css.indexOf('.hst-listwin'), css.indexOf(':root[data-ui="classic"] .hst-win {'));
    assert.doesNotMatch(block, /#[0-9a-f]{3,8}\b|rgba?\(/i, 'no raw colours');
    assert.doesNotMatch(block, /font-size:\s*\d/, 'no px font sizes');
  });
});
