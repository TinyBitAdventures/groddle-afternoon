/**
 * Pot Luck Day's notices (lane potluckk): one moment card per player when the festival begins (the
 * first time they play during it) and one on Thanksgiving Day for the feast, plain words with the
 * place and the dates (js/pot-luck-feast.js SEASON_NOTICES, the feature's tellSeason), kept in the
 * player's save so each shows once. The real feature on the vendored Pixi (in a vm) and a fake page.
 * Run: node --test tests/pot-luck-notices.test.js
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
const { SEASON_NOTICES, TABLE_STREET, noticesDue } = await import('../public/js/pot-luck-feast.js?v=971888be');
const { potLuckFeastFeature } = await import('../public/js/features/pot-luck-feast-feature.js?v=1dc56dd3');

let date = '2026-11-21';
const awards = [];
const log = [];
const engine = {
  PIXI,
  mode: 'solo',
  streetTsid: 'GOTHER',
  street: { bounds: { l: -3000, t: -1000, r: 3000, b: 0 } },
  platforms: [],
  groundY: 0,
  started: true,
  inv: {},
  entityLayer: new PIXI.Container(),
  param: (k) => (k === 'seasondate' ? date : ''),
  register(x) { return { ...x }; },
  unregister() {},
  setData() {},
  pushActivity(line) { log.push(line); },
  toast() {},
  playSound() {},
  save() {},
  award(p) { awards.push(p); },
  offerQuestDialogue: null,
  query: () => null,
  inScene: () => false,
};
const realNow = Date.now;
let clock = realNow();
Date.now = () => clock;
// The quest's offer is held off (the 20 s delay is never reached: the clock moves 3 s a tick).
const tick = () => { clock += 3000; potLuckFeastFeature.onTick(16, 0, engine); };

describe('the notices\' words', () => {
  it('say the place and the dates, plainly, with no em dashes', () => {
    const s = SEASON_NOTICES.season(29);
    assert.equal(s.title, 'Pot Luck Day is here!');
    assert.match(s.body, /Harvest Table at Groddle Forest Junction\. Until November 29\./);
    assert.match(SEASON_NOTICES.feast.title, /Thanksgiving feast today/);
    assert.match(SEASON_NOTICES.feast.body, /Groddle Forest Junction/);
    for (const t of [s.title, s.body, SEASON_NOTICES.feast.title, SEASON_NOTICES.feast.body]) assert.doesNotMatch(t, /\u2014/);
  });

  it('are due once a season, the feast once on its day', () => {
    assert.deepEqual(noticesDue({}, '', ''), []);
    assert.deepEqual(noticesDue({}, 'pot_luck_day:2026', ''), ['season']);
    assert.deepEqual(noticesDue({ season: 'pot_luck_day:2026' }, 'pot_luck_day:2026', ''), []);
    assert.deepEqual(noticesDue({ season: 'pot_luck_day:2026' }, 'pot_luck_day:2026', 'feast_day:2026'), ['feast']);
    assert.deepEqual(noticesDue({ season: 'pot_luck_day:2025', feast: 'feast_day:2025' }, 'pot_luck_day:2026', 'feast_day:2026'), ['season', 'feast']);
  });
});

describe('the feature shows them once each', () => {
  before(() => {
    potLuckFeastFeature.init(engine);
    potLuckFeastFeature.restore({}, engine);
  });

  it('nothing before the festival', () => {
    tick();
    assert.equal(awards.length, 0);
  });

  it('Pot Luck Day\'s card the first time the player plays during it, anywhere, and not again', () => {
    date = '2026-11-22';
    tick();
    assert.equal(awards.length, 1);
    assert.equal(awards[0].title, 'Pot Luck Day is here!');
    assert.equal(awards[0].kicker, 'New festival', 'not Well done!');
    assert.match(awards[0].body, /Until November 29\./);
    tick();
    assert.equal(awards.length, 1);
    // Kept in the save: a reload does not show it again.
    const saved = JSON.parse(JSON.stringify(potLuckFeastFeature.save()));
    potLuckFeastFeature.restore(saved, engine);
    tick();
    assert.equal(awards.length, 1);
  });

  it('the feast\'s card on Thanksgiving Day, once', () => {
    date = '2026-11-26';
    tick();
    assert.equal(awards.length, 2);
    assert.equal(awards[1].title, 'Thanksgiving feast today');
    assert.match(log.at(-1), /^Thanksgiving feast today\. The week/);
    tick();
    assert.equal(awards.length, 2);
    Date.now = realNow;
  });
});
