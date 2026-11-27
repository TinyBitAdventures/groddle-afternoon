/**
 * Pot Luck Day starts at midnight Pacific with players already standing at Groddle Forest Junction
 * (lane potluckk): online the table is the server's to set out (harvest_table.go sets it out on a
 * timer at the season's first second and tells the street), so a page that joined the day before
 * draws it when told, without a rejoin, even before its own calendar turns; and when its calendar
 * turns it asks the server again (feast_sync) rather than keep the "packed away" from its join.
 * The real feature on the vendored Pixi (in a vm) and a fake page, as feast-table-list.test.js.
 * Run: node --test tests/feast-season-start.test.js
 */
import { describe, it, before } from 'node:test';
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
const { TABLE_STREET } = await import('../public/js/pot-luck-feast.js?v=971888be');
const { potLuckFeastFeature } = await import('../public/js/features/pot-luck-feast-feature.js?v=c369a1bb');

let date = '2026-11-21';
const data = {};
const sent = [];
const handlers = {};
const client = { state: 'online', me: { id: 7, name: 'Me' }, on: (k, fn) => { handlers[k] = fn; return () => {}; }, send: (k, body) => { sent.push(k); return true; } };
const engine = {
  PIXI,
  mode: 'multiplayer',
  streetTsid: TABLE_STREET,
  street: { bounds: { l: -3000, t: -1000, r: 3000, b: 0 } },
  platforms: [],
  groundY: 0,
  started: true,
  inv: {},
  entityLayer: new PIXI.Container(),
  param: (k) => (k === 'seasondate' ? date : k === 'questoffer' ? 'off' : ''),
  register(x) { return { ...x }; },
  unregister() {},
  setData(k, v) { data[k] = v; },
  pushActivity() {},
  toast() {},
  playSound() {},
  save() {},
  query: (k) => (k === 'realtimeClient' ? client : null),
  inScene: () => false,
};

// refreshSeason reads the calendar at most every 2 s of Date.now: the test moves it.
const realNow = Date.now;
let clock = realNow();
Date.now = () => clock;
const tick = () => { clock += 3000; potLuckFeastFeature.onTick(16, clock, engine); };

describe('the Harvest Table at the season start, online', () => {
  before(() => {
    potLuckFeastFeature.init(engine);
    potLuckFeastFeature.onStreetEnter({}, engine);
    handlers['msg:feast_state']({ on: false, rows: [], total: 0 });
  });

  it('the day before, the server says packed away and no table stands', () => {
    tick();
    assert.equal(data.feastTable, 'off');
  });

  it('is drawn when the server sets it out at midnight, before this page’s calendar turns', () => {
    handlers['msg:feast_state']({ on: true, rows: [], total: 0 });
    assert.equal(data.feastTable, 'on', 'drawn on the server’s word, no rejoin');
    handlers['msg:feast_state']({ on: false, rows: [], total: 0 });
    assert.equal(data.feastTable, 'off');
  });

  it('asks the server again when its own calendar turns to Pot Luck Day', () => {
    sent.length = 0;
    date = '2026-11-22';
    tick();
    assert.ok(sent.includes('feast_sync'), `sent ${sent.join(',')}`);
    handlers['msg:feast_state']({ on: true, rows: [], total: 0 });
    assert.equal(data.feastTable, 'on');
    Date.now = realNow;
  });
});
