/**
 * Happy New Ur's party pieces (register G1195, plan steps 4 to 8; js/new-ur-party.js and
 * features/new-ur-party-feature.js): the keepsake and badge (online only on the server's word), the
 * Confetti Popper (Toy Vendor and Tinkertool, Element colours, the burst for the street), Bubbly and
 * Toast, Sparkly Batterflies, party hats on street Chickens (Pot Luck Day's costumes), their art and
 * registrations, and the server's half (new_ur.go).
 * Run: node --test tests/new-ur-party.test.js (GRODDLE_SERVER_DIR=<server worktree> for the server checks)
 */
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BADGE,
  BUBBLY,
  BUBBLY_DRINK,
  CONFETTI,
  KEEPSAKE,
  MIDNIGHT_COUNTER,
  NEW_UR_BADGES,
  NEW_UR_ITEMS,
  NEW_UR_PARTY,
  NEW_UR_PARTY_TEXT,
  NEW_UR_RECIPES,
  NEW_UR_STOCK,
  POPPERS,
  bitAt,
  burstBits,
  createPartyState,
  keepsakeDue,
  listNames,
  popperColour,
} from '../public/js/new-ur-party.js?v=05952cd9';
import { bigMidnight, firstUrDay, hatsOn, sparklyBatterflies } from '../public/js/new-ur.js?v=cec82e41';
import { SEASONAL_STOCK, seasonalConversions, seasonalSources } from '../public/js/seasons.js?v=5d8f545a';
import { COSTUME_SHEETS, SHEET_COSTUMES, CHICKEN_SHEETS, costumeFrame } from '../public/js/pot-luck.js?v=e704c060';
import { canCraft, setSeasonalRecipeCheck } from '../public/js/making.js?v=d3571803';
import { newUrPartyFeature, PARTY_HAT } from '../public/js/features/new-ur-party-feature.js?v=f42ade79';
import { HIRES_ICONS } from '../public/js/icon-hires.js?v=60e2474b';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const BIG = bigMidnight(2026).at;

describe('the items, the stock and the recipes', () => {
  it('has the keepsake, five poppers and Bubbly, all out of trades, the keepsake never sold', () => {
    assert.deepEqual(Object.keys(NEW_UR_ITEMS).sort(), [BUBBLY, ...POPPERS, KEEPSAKE].sort());
    for (const [id, meta] of Object.entries(NEW_UR_ITEMS)) {
      assert.ok(meta.tags.includes('no_trade'), id);
      assert.doesNotMatch(`${meta.label} ${meta.desc}`, /\u2014/, id);
    }
    assert.equal(NEW_UR_ITEMS[KEEPSAKE].sellable, false);
    const trade = JSON.parse(read('public/assets/content/trade-items.json'));
    for (const id of Object.keys(NEW_UR_ITEMS)) assert.equal(trade.untradeable[id], 'no_trade', id);
  });

  it('the Toy Vendor sells the mixed popper for the season (as Glitchmas Crackers)', () => {
    assert.equal(SEASONAL_STOCK.new_ur, NEW_UR_STOCK);
    assert.deepEqual(NEW_UR_STOCK.toys.map((o) => [o.classTsid, o.cost]), [['confetti_popper', 25]]);
    assert.ok(seasonalSources().some(([id, src]) => id === 'confetti_popper' && src === 'season:vendor'));
    assert.ok(seasonalSources().some(([id, src]) => id === KEEPSAKE && src === 'season:new_ur_midnight'));
  });

  it('a Tinkertool makes each colour from Paper, a Sparkly and its Element; a Cocktail Shaker makes Bubbly; only in season', () => {
    for (const c of ['red', 'green', 'blue', 'shiny']) {
      const r = NEW_UR_RECIPES[`confetti_popper_${c}`];
      assert.equal(r.tool, 'tinkertool');
      assert.deepEqual(r.inputs.map((i) => [i.classTsid, i.qty]), [['paper', 1], ['sparkly', 1], [`element_${c}`, 50]]);
      assert.equal(r.season, 'new_ur');
    }
    assert.deepEqual(NEW_UR_RECIPES[BUBBLY].inputs.map((i) => i.classTsid), ['bunch_of_grapes', 'tiny_bubble']);
    assert.equal(NEW_UR_RECIPES[BUBBLY].tool, 'cocktail_shaker');
    assert.ok(seasonalConversions().filter((c) => c.source === 'season:new_ur_recipe').length === 5);
    setSeasonalRecipeCheck((s) => s !== 'new_ur');
    try {
      const out = canCraft({ paper: 1, sparkly: 1, element_red: 50, tinkertool: 1 }, NEW_UR_RECIPES.confetti_popper_red);
      assert.equal(out.reason, 'season');
      assert.match(out.msg, /Happy New Ur, December 26 to January 3/);
    } finally {
      setSeasonalRecipeCheck(() => true);
    }
  });

  it('Bubbly drinks like a drink, half a Slow Gin Fizz', () => {
    assert.deepEqual([BUBBLY_DRINK.kind, BUBBLY_DRINK.mood, BUBBLY_DRINK.energy], ['drink', 10, 5]);
  });
});

describe('the keepsake and the badge', () => {
  it('gives one Midnight Sparkly a year and counts the badge at every midnight seen', () => {
    const s = createPartyState();
    assert.deepEqual(keepsakeDue(s, { year: 2026 }), { grant: true, badge: true });
    assert.deepEqual(keepsakeDue(s, { year: 2026 }), { grant: false, badge: true });
    assert.deepEqual(keepsakeDue(s, { year: 2027 }), { grant: true, badge: true });
    assert.deepEqual(createPartyState(JSON.parse(JSON.stringify(s))).keepsakes, ['2026', '2027']);
  });

  it('online, only the server\'s word that you were connected counts', () => {
    const s = createPartyState();
    assert.deepEqual(keepsakeDue(s, { year: 2026, online: true }), { grant: false, badge: false });
    assert.deepEqual(keepsakeDue(s, { year: 2026, online: true, server: true }), { grant: true, badge: true });
  });

  it('is in the badge catalog (one tier, seasonal) with art, the centre a marked placeholder until Grok Bot', () => {
    const cat = JSON.parse(read('public/assets/content/achievements.json'));
    assert.deepEqual(cat[BADGE].conditions[0], NEW_UR_BADGES[BADGE].conditions[0]);
    assert.equal(`${cat[BADGE].conditions[0].group}:${cat[BADGE].conditions[0].name}`, MIDNIGHT_COUNTER);
    assert.equal(cat[BADGE].category, 'seasonal');
    assert.ok(existsSync(join(ROOT, `public/assets/badges/${BADGE}.webp`)));
    const specs = JSON.parse(read('tools/badge-art/badge-specs.json'));
    const spec = Object.values(specs).find((v) => v && typeof v === 'object' && v[BADGE])[BADGE];
    assert.match(spec.subject, /^PLACEHOLDER until Grok Bot/);
    assert.match(spec.placeholder, /new-ur-2026-11-23/);
  });
});

describe('the Confetti Popper\'s burst', () => {
  it('bursts in its Element\'s colours, the Toy Vendor\'s in all of them', () => {
    assert.deepEqual(POPPERS.map(popperColour), ['mix', 'red', 'green', 'blue', 'shiny']);
    assert.equal(popperColour('apple'), '');
    let seed = 1;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const bits = burstBits('red', 40, rand);
    assert.equal(bits.length, 40);
    for (const b of bits) {
      assert.ok(CONFETTI.red.includes(b.colour));
      assert.ok(b.dy < 0, 'shot upward');
    }
    // Up, then down under gravity.
    const b = bits[0];
    assert.ok(bitAt(b, 0.3).y < 0);
    assert.ok(bitAt(b, 2.4).y > bitAt(b, 1.2).y);
  });

  it('names who you toasted plainly', () => {
    assert.equal(listNames(['Ada']), 'Ada');
    assert.equal(listNames(['Ada', 'Bo']), 'Ada and Bo');
    assert.equal(listNames(['Ada', 'Bo', 'Cy', 'Di', 'Ed']), 'Ada, Bo and 3 others');
    for (const v of Object.values(NEW_UR_PARTY_TEXT)) assert.doesNotMatch(typeof v === 'function' ? v('Ada') : v, /\u2014/);
  });
});

describe('Sparkly Batterflies and the party hats', () => {
  it('Batterflies glint from the big midnight to the end of January 1 on Ur\'s clock', () => {
    assert.equal(sparklyBatterflies(BIG - 1), false);
    assert.equal(sparklyBatterflies(BIG), true);
    assert.equal(firstUrDay(BIG), true);
    assert.equal(sparklyBatterflies(Date.parse('2027-01-01T20:00:00Z')), true); // noon Jan 1, Pacific
    assert.equal(sparklyBatterflies(Date.parse('2027-01-02T09:00:00Z')), false); // 1 AM Jan 2, Pacific
    assert.equal(sparklyBatterflies(Date.parse('2026-12-27T20:00:00Z')), false);
  });

  it('a party hat is a chicken costume with its own sheets, every clip drawn', () => {
    assert.ok(SHEET_COSTUMES.includes(PARTY_HAT));
    for (const s of CHICKEN_SHEETS) {
      const def = COSTUME_SHEETS[PARTY_HAT][s.clip];
      assert.equal(def.path, `assets/sprites/seasons/new-ur/chicken_party_hat_${s.clip}.webp`);
      for (const f of [def.path, def.path.replace('.webp', '@3x.webp')]) assert.ok(existsSync(join(ROOT, 'public', f)), f);
    }
    const r = costumeFrame(PARTY_HAT, CHICKEN_SHEETS[0].path, { x: 0, y: 0 });
    assert.equal(r.path, 'assets/sprites/seasons/new-ur/chicken_party_hat_walk.webp');
    // The hats are on December 31 and January 1 only.
    assert.equal(hatsOn(Date.parse('2026-12-31T20:00:00Z')), true);
    assert.equal(hatsOn(Date.parse('2026-12-30T20:00:00Z')), false);
  });

  it('pot-luck-feature asks for the season\'s costume beyond Pot Luck Day', () => {
    assert.match(read('public/js/features/pot-luck-feature.js'), /query\?\.\('chickenCostume', null, engine\)/);
  });
});

/* ------------------------------------------------------------ the feature */

function fakeClient() {
  const c = { state: 'online', sent: [], handlers: {}, on(k, fn) { (c.handlers[k] ||= []).push(fn); }, send(k, p) { c.sent.push([k, p]); }, emit(k, m) { for (const fn of c.handlers[k] || []) fn(m); } };
  return c;
}

function fakeEngine({ mode = 'solo', inv = {}, client = null, who = [] } = {}) {
  const e = {
    mode,
    inv: { ...inv },
    pc: { energy: 50, mood: 50, energyMax: 100 },
    player: { x: 500, y: 900 },
    counters: [],
    emotes: [],
    lines: [],
    sounds: [],
    data: {},
    started: true,
    interactables: [],
    query(name, ...args) {
      if (name === 'realtimeClient') return client;
      if (name === 'emote') return e.emotes.push(args[0]), true;
      return null;
    },
    param: () => '',
    whoIsHere: () => ['You', ...who],
    achievement: (c, n) => e.counters.push(`${c}=${n}`),
    toast: (l) => e.lines.push(l),
    pushActivity() {},
    playSound: (k) => e.sounds.push(k),
    refreshPack() {},
    updateHud() {},
    save() {},
    setData: (k, v) => { e.data[k] = v; },
  };
  return e;
}

describe('the party in the world (features/new-ur-party-feature.js)', () => {
  beforeEach(() => newUrPartyFeature._reset());

  it('solo: a midnight seen gives the keepsake once and counts the badge', () => {
    const e = fakeEngine();
    newUrPartyFeature.init(e);
    newUrPartyFeature.newUrMidnight({ year: 2026, index: 4, big: true }, e);
    newUrPartyFeature.newUrMidnight({ year: 2026, index: 5, big: false }, e);
    assert.equal(e.inv[KEEPSAKE], 1);
    assert.deepEqual(e.counters, [`${MIDNIGHT_COUNTER}=1`, `${MIDNIGHT_COUNTER}=1`]);
  });

  it('online: the page\'s own clock gives nothing; the server\'s "seen" midnight or sync list does', () => {
    const c = fakeClient();
    const e = fakeEngine({ mode: 'multiplayer', client: c });
    newUrPartyFeature.init(e);
    newUrPartyFeature.onTick(16, 0, e);
    newUrPartyFeature.newUrMidnight({ year: 2026, index: 4, big: true }, e);
    assert.equal(e.inv[KEEPSAKE] || 0, 0);
    c.emit('msg:new_ur', { t: 'new_ur', ev: 'midnight', at: BIG, index: 4, big: true });
    assert.equal(e.inv[KEEPSAKE] || 0, 0, 'no seen mark, no keepsake');
    c.emit('msg:new_ur', { t: 'new_ur', ev: 'midnight', at: BIG, index: 4, big: true, seen: true });
    assert.equal(e.inv[KEEPSAKE], 1);
    newUrPartyFeature._reset();
    const c2 = fakeClient();
    const e2 = fakeEngine({ mode: 'multiplayer', client: c2 });
    newUrPartyFeature.onTick(16, 0, e2);
    c2.emit('msg:new_ur', { t: 'new_ur', midnights: [BIG - 4 * 3600e3, BIG], big: BIG, seen: [2] });
    assert.equal(e2.inv[KEEPSAKE], 1);
  });

  it('Pop uses one popper, bangs, jumps you, and online tells the server its colour', () => {
    const c = fakeClient();
    const e = fakeEngine({ mode: 'multiplayer', client: c, inv: { confetti_popper_blue: 2 } });
    newUrPartyFeature.init(e);
    newUrPartyFeature.onTick(16, 0, e);
    assert.deepEqual(newUrPartyFeature.packVerbs('confetti_popper_blue', e).map((v) => [v.id, v.label, v.enabled]), [['new_ur:pop', 'Pop', true]]);
    assert.equal(newUrPartyFeature.runPackVerb('confetti_popper_blue', 'new_ur:pop', e), true);
    assert.equal(e.inv.confetti_popper_blue, 1);
    assert.ok(e.sounds.includes('GLITCHMAS_CRACKER'));
    assert.deepEqual(e.emotes, ['surprise']);
    assert.deepEqual(c.sent.at(-1), ['new_ur_pop', { c: 'blue' }]);
    // Someone else's popper near you: you jump too; far off you only see the burst.
    c.emit('msg:new_ur_popped', { id: 9, name: 'Ada', x: 100, y: 900, c: 'red', near: false });
    assert.deepEqual(e.emotes, ['surprise']);
    c.emit('msg:new_ur_popped', { id: 9, name: 'Ada', x: 100, y: 900, c: 'red', near: true });
    assert.deepEqual(e.emotes, ['surprise', 'surprise']);
  });

  it('Toast online waits for the server: alone it keeps the Bubbly; with friends it drinks it with them', () => {
    const c = fakeClient();
    const e = fakeEngine({ mode: 'multiplayer', client: c, inv: { bubbly: 1 } });
    newUrPartyFeature.init(e);
    newUrPartyFeature.onTick(16, 0, e);
    newUrPartyFeature.runPackVerb(BUBBLY, 'new_ur:toast', e);
    assert.deepEqual(c.sent.at(-1), ['new_ur_toast', {}]);
    c.emit('msg:new_ur_toast', { ok: false, why: 'alone' });
    assert.equal(e.inv.bubbly, 1);
    assert.equal(e.lines.at(-1), NEW_UR_PARTY_TEXT.toastAlone);
    newUrPartyFeature.runPackVerb(BUBBLY, 'new_ur:toast', e);
    c.emit('msg:new_ur_toast', { ok: true, with: ['Bo'] });
    assert.equal(e.inv.bubbly || 0, 0);
    assert.equal(e.pc.mood, 50 + BUBBLY_DRINK.mood + NEW_UR_PARTY.toastMood);
    assert.deepEqual(e.emotes, ['happy']);
    // Toasted by another: mood and a happy.
    c.emit('msg:new_ur_toasted', { from: { id: 4, name: 'Bo' } });
    assert.equal(e.pc.mood, 50 + BUBBLY_DRINK.mood + 2 * NEW_UR_PARTY.toastMood);
    assert.equal(e.lines.at(-1), NEW_UR_PARTY_TEXT.toastedBy('Bo'));
  });

  it('Toast solo needs a street companion near', () => {
    const lone = fakeEngine({ inv: { bubbly: 1 } });
    newUrPartyFeature.init(lone);
    assert.equal(newUrPartyFeature.packVerbs(BUBBLY, lone)[0].enabled, false);
    const e = fakeEngine({ inv: { bubbly: 1 }, who: ['Amp'] });
    assert.equal(newUrPartyFeature.packVerbs(BUBBLY, e)[0].enabled, true);
    newUrPartyFeature.runPackVerb(BUBBLY, 'new_ur:toast', e);
    assert.equal(e.inv.bubbly || 0, 0);
    assert.equal(e.lines.at(-1), NEW_UR_PARTY_TEXT.toasted(['Amp']));
  });

  it('answers pot-luck-feature with the party hat on December 31 and January 1 (?seasondate=)', () => {
    const e = fakeEngine();
    e.param = (k) => (k === 'seasondate' ? '2026-12-31' : '');
    newUrPartyFeature.onTick(16, 0, e);
    assert.equal(newUrPartyFeature.chickenCostume(null, e), PARTY_HAT);
    e.param = (k) => (k === 'seasondate' ? '2026-12-27' : '');
    newUrPartyFeature.onTick(16, 0, e);
    assert.equal(newUrPartyFeature.chickenCostume(null, e), null);
  });
});

describe('the art', () => {
  it('every item has a 1x and 3x icon in the hi-res list, rebuilt from Tiny Speck\'s icons (tools/new-ur-art --check)', () => {
    for (const id of Object.keys(NEW_UR_ITEMS)) {
      for (const f of [`${id}.webp`, `${id}@3x.webp`]) assert.ok(existsSync(join(ROOT, 'public/assets/sprites/icons', f)), f);
      assert.ok(HIRES_ICONS.has(id), id);
    }
    execFileSync(process.execPath, [join(ROOT, 'tools/new-ur-art/build.mjs'), '--check'], { stdio: 'pipe' });
  });

  it('the party hat sheets are current (tools/pot-luck-art --check) and recorded as made art', () => {
    execFileSync(process.execPath, [join(ROOT, 'tools/pot-luck-art/build.mjs'), '--check'], { stdio: 'pipe' });
    const prov = JSON.parse(read('tools/provenance/made-sprites.json'));
    assert.ok(prov.sprites.chicken_party_hat.inputs.some((i) => /party_hat\.swf/.test(i)));
  });
});

describe('the server\'s half (new_ur.go)', () => {
  const dir = process.env.GRODDLE_SERVER_DIR || join(ROOT, '..', 'groddle-afternoon-server');
  const file = join(dir, 'new_ur.go');
  it('marks each midnight seen, and carries pops and toasts', { skip: !existsSync(file) && 'no server checkout' }, () => {
    const go = readFileSync(file, 'utf8');
    assert.match(go, /msg\["seen"\] = true/);
    assert.match(go, /r\.Handle\("new_ur_pop"/);
    assert.match(go, /r\.Handle\("new_ur_toast"/);
    assert.match(go, new RegExp(`newUrPopReach = ${NEW_UR_PARTY.popReach}\\.0`));
    assert.match(go, new RegExp(`newUrToastReach = ${NEW_UR_PARTY.toastReach}\\.0`));
    assert.match(go, /"t": "new_ur_popped"/);
    assert.match(go, /"t": "new_ur_toasted"/);
  });
});
