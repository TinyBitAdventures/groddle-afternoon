/**
 * G618 (report #162): the Map's "Puzzle streets" card sends a player to Piano Party, a real
 * street in Vortex of Random with no exit door. After a card arrival, and only then, the card
 * offers the way back to the street and spot the player left, as the colour streets' exit door
 * does. Walking in, a reload, a signpost out, a trip home and the colour streets are all covered.
 * Rules: js/puzzle-triggers.js cardDeparture / cardArrival / cardReturn; js/features/puzzles-feature.js.
 * Run: node --test tests/puzzle-card-return.test.js
 */
import { before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CARD_RETURN_TEXT,
  cardArrival,
  cardDeparture,
  cardReturn,
  normalizePuzzleData,
  normalizePuzzleSave,
} from '../public/js/puzzle-triggers.js?v=44eec9ea';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const raw = JSON.parse(readFileSync(join(root, 'public/assets/content/puzzle-triggers.json'), 'utf8'));
const defs = normalizePuzzleData(raw);
const index = JSON.parse(readFileSync(join(root, 'public/assets/streets/index.json'), 'utf8')).streets;

const PIANO = 'GA96OS42D6F3M9P';
const ORANGIAN = 'GHVCKEPHO403BN5';
const HECHEY = 'GLI2V0UN7RD1T2J'; // Hechey Track, the fresh start, stands in for "where you were"
const SHIVERING = 'GA9RFQBJ05F33D7'; // Piano Party's signpost_1

describe('G618 data: only Piano Party keeps its players', () => {
  it('Piano Party is the one card street with no door back, and its two signposts lead on', () => {
    const stay = Object.entries(defs).filter(([, d]) => d.exit?.stay).map(([k]) => k);
    assert.deepEqual(stay, [PIANO]);
    assert.equal(defs[PIANO].exit.flag, 'moon_done');
    assert.notEqual(defs[PIANO].mapCard, false, 'the card lists it');
    const street = JSON.parse(readFileSync(join(root, 'public/assets/streets', `${PIANO}.json`), 'utf8'));
    assert.deepEqual(street.signposts.flatMap((s) => s.connects.map((c) => c.label)), ['Shivering Isles', 'Bliss']);
    assert.ok(index[SHIVERING], 'Shivering Isles is a street');
    for (const [k, d] of Object.entries(defs)) if (d.exit?.door) assert.equal(cardReturn({ tsid: HECHEY, x: 1, y: 2, card: k }, d, k), null, `${d.name} keeps its exit door`);
  });
});

describe('G618 rules', () => {
  it('a card click from the world remembers the street, the spot and the street it sends to', () => {
    assert.deepEqual(cardDeparture(null, { here: HECHEY, dest: PIANO, x: 512.4, y: 300.6, name: 'Hechey Track' }), {
      tsid: HECHEY,
      x: 512,
      y: 301,
      card: PIANO,
      name: 'Hechey Track',
    });
  });

  it('card to card keeps the first place and moves the mark; a walked-in puzzle street gets no mark', () => {
    const first = cardDeparture(null, { here: HECHEY, dest: PIANO, x: 5, y: 6, name: 'Hechey Track' });
    const second = cardDeparture(first, { here: PIANO, onPuzzle: true, dest: ORANGIAN });
    assert.deepEqual(second, { ...first, card: ORANGIAN });
    // Walked into Piano Party carrying an old, unmarked return: the card to a colour street marks nothing.
    const stale = { tsid: HECHEY, x: 1, y: 2 };
    assert.deepEqual(cardDeparture(stale, { here: PIANO, onPuzzle: true, dest: ORANGIAN }), stale);
    // ... and one marked for some other street loses the mark.
    assert.deepEqual(cardDeparture({ ...stale, card: ORANGIAN }, { here: PIANO, onPuzzle: true, dest: PIANO }), stale);
    assert.equal(cardDeparture(null, { here: PIANO, onPuzzle: true, dest: ORANGIAN }), null);
  });

  it('entering the card street keeps the return; any other street ends a Piano Party return', () => {
    const r = { tsid: HECHEY, x: 5, y: 6, card: PIANO, name: 'Hechey Track' };
    assert.equal(cardArrival(r, PIANO, defs), r);
    assert.equal(cardArrival(r, SHIVERING, defs), null, 'out by a signpost');
    assert.equal(cardArrival(r, HECHEY, defs), null, 'out by a teleport');
    assert.equal(cardArrival(null, PIANO, defs), null);
    // A colour street's return stays for its exit door, as before, without the mark.
    assert.deepEqual(cardArrival({ tsid: HECHEY, x: 5, y: 6, card: ORANGIAN }, SHIVERING, defs), { tsid: HECHEY, x: 5, y: 6 });
  });

  it('the way back is offered only on Piano Party, only with its own mark', () => {
    const r = { tsid: HECHEY, x: 5, y: 6, card: PIANO };
    assert.equal(cardReturn(r, defs[PIANO], PIANO), r);
    assert.equal(cardReturn({ tsid: HECHEY, x: 5, y: 6 }, defs[PIANO], PIANO), null, 'walked in with an old return');
    assert.equal(cardReturn({ ...r, card: ORANGIAN }, defs[PIANO], PIANO), null, 'marked for another street');
    assert.equal(cardReturn(null, defs[PIANO], PIANO), null, 'walked in');
    assert.equal(cardReturn({ ...r, tsid: PIANO }, defs[PIANO], PIANO), null, 'never back to itself');
    assert.equal(cardReturn({ ...r, card: ORANGIAN }, defs[ORANGIAN], ORANGIAN), null, 'colour streets use their door');
  });

  it('the save keeps the mark and the name, and drops junk', () => {
    const kept = normalizePuzzleSave({ returnTo: { tsid: HECHEY, x: 5, y: 6, card: PIANO, name: ' Hechey Track ' } });
    assert.deepEqual(kept.returnTo, { tsid: HECHEY, x: 5, y: 6, card: PIANO, name: 'Hechey Track' });
    assert.deepEqual(normalizePuzzleSave(JSON.parse(JSON.stringify(kept))), kept, 'round trip');
    assert.deepEqual(normalizePuzzleSave({ returnTo: { tsid: HECHEY, x: 5, card: 'nope', name: 7 } }).returnTo, { tsid: HECHEY, x: 5, y: 0 });
  });

  it('the words (the remake\'s own)', () => {
    assert.equal(CARD_RETURN_TEXT.button('Hechey Track'), 'Back to Hechey Track');
    assert.equal(CARD_RETURN_TEXT.button(''), 'Back to where you were');
    assert.equal(CARD_RETURN_TEXT.toast('Hechey Track'), "Open the Map's Shortcuts to head back to Hechey Track.");
    assert.equal(CARD_RETURN_TEXT.toast(), "Open the Map's Shortcuts to head back to where you were.");
  });
});

describe('G618 in the game (puzzles-feature)', () => {
  let feature;
  let engine;
  let log;

  const el = (tag) => ({
    tag,
    style: { cssText: '' },
    children: [],
    listeners: {},
    appendChild(c) { this.children.push(c); return c; },
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
    click() { for (const fn of this.listeners.click || []) fn(); },
  });
  const buttons = (node) => (node ? [...(node.tag === 'button' ? [node] : []), ...node.children.flatMap(buttons)] : []);
  /** The Map opens: the card is built with a document, which the street's own art must not see. */
  const card = () => {
    globalThis.document = { createElement: el };
    try {
      return feature.mapCards(engine)[0];
    } finally {
      delete globalThis.document;
    }
  };
  const cardButton = (text) => buttons(card()).find((b) => b.textContent.replace(/^✓ /, '') === text);
  const backButton = () => buttons(card()).find((b) => b.className === 'puzzle-map-back');
  const settle = () => new Promise((r) => setTimeout(r, 15));

  before(async () => {
    class Display {
      constructor() {
        this.anchor = { set() {} };
        this.scale = { set() {} };
        this.children = [];
        this.x = 0;
        this.y = 0;
      }
      addChild(c) { this.children.push(c); return c; }
      destroy() { this.destroyed = true; }
    }
    class Texture { constructor(o) { Object.assign(this, o); } }
    class ImageSource { constructor(o) { Object.assign(this, o, { width: 1, height: 1 }); } on() { return this; } }
    class Sprite extends Display { constructor(texture) { super(); this.texture = texture; } }
    globalThis.PIXI = { Sprite, Container: Display, Graphics: Display, Texture, ImageSource, Rectangle: class {} };
    globalThis.Image = class { set src(v) { this._s = v; } decode() { return Promise.resolve(); } };
    globalThis.fetch = async () => ({ json: async () => raw });
    ({ puzzlesFeature: feature } = await import('../public/js/features/puzzles-feature.js?fresh=card-return'));
  });

  beforeEach(async () => {
    log = { enters: [], toasts: [], closed: 0 };
    const state = { inHome: false, instance: false, gate: null };
    engine = {
      PIXI: globalThis.PIXI,
      state,
      streetTsid: HECHEY,
      street: { tsid: HECHEY, label: 'Hechey Track' },
      player: { x: 512, y: 300, vx: 0, vy: 0 },
      entityLayer: { addChild() {} },
      transientInstance: () => state.instance,
      homeContext: () => ({ inHome: state.inHome }),
      streetExists: (tsid) => Boolean(index[tsid]),
      travelGate: () => state.gate,
      closeMap: () => { log.closed += 1; },
      register: (t) => t,
      setData() {},
      param: () => null,
      toast: (msg) => log.toasts.push(msg),
      /** A street load: the old street is cleared, then the feature hears the new one. */
      enter(tsid, opts = {}) {
        log.enters.push({ tsid, ...opts });
        feature.onStreetClear(engine);
        engine.streetTsid = tsid;
        engine.street = { tsid, label: index[tsid]?.label || tsid };
        if (opts.spawnX != null) engine.player = { x: opts.spawnX, y: opts.spawnY, vx: 0, vy: 0 };
        feature.onStreetEnter(engine.street, engine);
      },
    };
    feature.restore(null);
    feature.onStreetClear(engine);
    feature.onStreetEnter(engine.street, engine);
    await settle(); // the trigger data loads on the first street
  });

  /** A reload: the save goes through JSON and the game starts on the saved street. */
  const reload = () => {
    const slice = JSON.parse(JSON.stringify(feature.save()));
    feature.onStreetClear(engine);
    feature.restore(slice);
    feature.onStreetEnter(engine.street, engine);
  };

  it('card to Piano Party, then "Back to Hechey Track" lands on the spot the player left', () => {
    assert.equal(backButton(), undefined, 'nothing to go back to in the world');
    cardButton('Piano Party').click();
    assert.deepEqual(log.enters.at(-1), { tsid: PIANO, spawnX: defs[PIANO].start.x, spawnY: defs[PIANO].start.y });
    assert.deepEqual(feature.save().returnTo, { tsid: HECHEY, x: 512, y: 300, card: PIANO, name: 'Hechey Track' });
    assert.deepEqual(log.toasts, ["Open the Map's Shortcuts to head back to Hechey Track."]);
    const back = backButton();
    assert.equal(back.textContent, 'Back to Hechey Track');
    assert.equal(cardButton('Piano Party').disabled, true, 'already here');
    back.click();
    assert.deepEqual(log.enters.at(-1), { tsid: HECHEY, spawnX: 512, spawnY: 300 });
    assert.equal(feature.save().returnTo, null);
    assert.equal(backButton(), undefined);
    assert.equal(log.closed, 2, 'the Map closes for both trips');
  });

  it('survives a reload on the street', () => {
    cardButton('Piano Party').click();
    reload();
    assert.equal(backButton().textContent, 'Back to Hechey Track');
    assert.equal(log.toasts.length, 2, 'the reminder shows again');
    backButton().click();
    assert.deepEqual(log.enters.at(-1), { tsid: HECHEY, spawnX: 512, spawnY: 300 });
  });

  it('never offers it to a player who walked in', () => {
    engine.enter(PIANO); // a signpost, a teleport, a follow: no card
    assert.equal(backButton(), undefined);
    assert.deepEqual(log.toasts, []);
    // Nor with a return an older build remembered (no mark), even after a reload there.
    feature.restore({ returnTo: { tsid: HECHEY, x: 512, y: 300 } });
    reload();
    assert.equal(backButton(), undefined);
    assert.deepEqual(log.toasts, []);
    assert.deepEqual(feature.save().returnTo, { tsid: HECHEY, x: 512, y: 300 }, 'left as it was for the colour streets');
  });

  it('walking out through a signpost forgets the return, and walking back in offers nothing', () => {
    cardButton('Piano Party').click();
    engine.enter(SHIVERING);
    assert.equal(feature.save().returnTo, null);
    engine.enter(PIANO);
    assert.equal(backButton(), undefined);
    assert.equal(log.toasts.length, 1, 'only the card arrival was told');
  });

  it('a trip home or into a private instance and back keeps it', () => {
    cardButton('Piano Party').click();
    engine.state.inHome = true;
    feature.onStreetClear(engine);
    feature.onStreetEnter({ tsid: 'HOME' }, engine);
    engine.state.inHome = false;
    engine.state.instance = true;
    feature.onStreetClear(engine);
    feature.onStreetEnter({ tsid: ORANGIAN }, engine);
    engine.state.instance = false;
    feature.onStreetClear(engine);
    feature.onStreetEnter(engine.street, engine);
    assert.equal(backButton().textContent, 'Back to Hechey Track');
  });

  it('a refused trip says why and keeps the return', () => {
    cardButton('Piano Party').click();
    engine.state.gate = { ok: false, msg: 'Not while you are pooped.' };
    backButton().click();
    assert.equal(log.toasts.at(-1), 'Not while you are pooped.');
    assert.equal(log.enters.at(-1).tsid, PIANO);
    assert.equal(feature.save().returnTo.card, PIANO);
    engine.state.gate = null;
    backButton().click();
    assert.equal(log.enters.at(-1).tsid, HECHEY);
  });

  it('colour streets are as before: no button, and the card on from Piano Party keeps the first place', () => {
    cardButton('Piano Party').click();
    cardButton('Orangian').click();
    assert.deepEqual(feature.save().returnTo, { tsid: HECHEY, x: 512, y: 300, card: ORANGIAN, name: 'Hechey Track' });
    assert.equal(backButton(), undefined, 'Orangian has its exit door');
    assert.equal(log.toasts.length, 1);
    // And back to Piano Party by the card: still a card arrival, still the first place.
    cardButton('Piano Party').click();
    assert.equal(backButton().textContent, 'Back to Hechey Track');
  });
});
