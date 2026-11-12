/**
 * Player report 153 (Austin 2026-11-09: owners can put it away). The Mail Dispatcher is our own
 * addition to the home street, so its owner can take it off the street (Put away, from its verb
 * menu or its Cultivate actions) and stand it there again (Put out Mail Dispatcher in Cultivate),
 * at its last spot if it still fits, else the usual one. The choice is saved with the street
 * (cult.dispatcherAway), solo and online, and survives a reload; nothing else needs it: the
 * Mailbox's Write mail sends letters and items as before.
 * Run: node --test tests/home-dispatcher-away.test.js
 */
import assert from 'node:assert/strict';
import { after, before, describe, it, mock } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createBackYardState,
  createCultivationState,
  dispatcherRx,
  fixtureObstacles,
  fixtureRx,
  homeStreetLayout,
  normalizeCultivationState,
  placementCheck,
  putAwayDispatcher,
  putOutDispatcher,
} from '../public/js/home-cultivation.js?v=f1242621';
import {
  DISPATCHER_HALF,
  DISPATCHER_TEXT,
  dispatcherAway,
  dispatcherDefaultRx,
} from '../public/js/home-street-fixtures.js?v=bad831a1';
import { createMailboxState, listMailboxMessages, sendMail } from '../public/js/mailbox.js?v=a3e833ba';
import { homesFeature } from '../public/js/features/homes-feature.js?v=f361927d';
import { Display } from './fake-scene.js';

const root = join(import.meta.dirname, '..', 'public', 'js');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

describe('putting the Mail Dispatcher away (report 153)', () => {
  it('saves the choice with the street, and only a saved true counts', () => {
    assert.equal(dispatcherAway(normalizeCultivationState({ dispatcherAway: true })), true);
    for (const v of [undefined, false, 'yes', 1, null]) {
      assert.equal('dispatcherAway' in normalizeCultivationState({ dispatcherAway: v }), false, `${v} keeps it out`);
    }
    assert.equal('dispatcherAway' in createBackYardState({ dispatcherAway: true }), false, 'the back yard has none');
    const again = normalizeCultivationState(JSON.parse(JSON.stringify(normalizeCultivationState({ dispatcherAway: true, dispatcherRx: 400 }))));
    assert.equal(again.dispatcherAway, true);
    assert.equal(again.dispatcherRx, 400, 'its last spot is kept while it is away');
  });

  it('existing players keep it until they put it away', () => {
    const st = createCultivationState({ items: [] });
    assert.equal(dispatcherAway(st), false);
    assert.equal(dispatcherRx(st), dispatcherDefaultRx(homeStreetLayout(st)));
  });

  it('put away: it stands nowhere, and nothing keeps clear of it', () => {
    const st = createCultivationState({});
    const rx = dispatcherRx(st);
    assert.equal(putAwayDispatcher(st), true);
    assert.equal(putAwayDispatcher(st), false, 'already away');
    assert.equal(dispatcherRx(st), null);
    assert.equal(fixtureRx(st, 'dispatcher'), null);
    // A cultivation may now stand where it stood; the other fixtures no longer step around it.
    const where = placementCheck(st, 'proto_patch', rx);
    assert.notEqual(where.reason, 'dispatcher');
    assert.equal(fixtureObstacles(st, 'mailbox').fixtures.some((f) => f.id === 'dispatcher'), false);
    assert.equal(putAwayDispatcher(createBackYardState({})), false, 'nothing to put away in a back yard');
  });

  it('put out: back at its last spot when that still fits', () => {
    const st = createCultivationState({ dispatcherRx: 600 });
    putAwayDispatcher(st);
    const out = putOutDispatcher(st);
    assert.deepEqual([out.ok, out.kept, out.rx], [true, true, 600]);
    assert.equal(dispatcherAway(st), false);
    assert.equal(st.dispatcherRx, 600);
    assert.equal(putOutDispatcher(st).ok, false, 'already out');
  });

  it('put out: the usual spot when something took its last one while it was away', () => {
    const st = createCultivationState({ dispatcherRx: 600 });
    putAwayDispatcher(st);
    // A patch planted right where it stood.
    st.items.push({ id: st.nextId++, protoClass: 'proto_patch', rx: 600, uses: 0, lifeSteps: 20, placedAt: 0 });
    const out = putOutDispatcher(st);
    assert.equal(out.ok, true);
    assert.equal(out.kept, false);
    assert.equal('dispatcherRx' in st, false, 'the old spot is dropped');
    assert.equal(out.rx, dispatcherDefaultRx(homeStreetLayout(st)));
    assert.ok(Math.abs(out.rx - 600) >= DISPATCHER_HALF, 'clear of the patch');
  });

  it('put away survives the homes save and a reload (solo and online share the slice)', () => {
    homesFeature.restore({ decor: {}, cult: { dispatcherRx: 520, dispatcherAway: true } });
    const slice = JSON.parse(JSON.stringify(homesFeature.save()));
    assert.equal(slice.cult.dispatcherAway, true);
    homesFeature.restore(slice);
    assert.equal(dispatcherAway(homesFeature._state().cult), true);
    assert.equal(homesFeature._state().cult.dispatcherRx, 520);
    // Away from the home street nothing answers (the courier spawns nothing then anyway).
    assert.equal(homesFeature.homeDispatcherAway(), null);
    homesFeature.restore(undefined);
    assert.equal(dispatcherAway(homesFeature._state().cult), false);
  });

  it('uses plain words of our own, with no em-dashes', () => {
    for (const k of ['putAway', 'putAwayTitle', 'putAwayDone', 'putAwayBusy', 'putOut', 'putOutTitle', 'putOutDone']) {
      assert.ok(DISPATCHER_TEXT[k], k);
      assert.doesNotMatch(DISPATCHER_TEXT[k], /—|Glitch/, k);
    }
    assert.equal(DISPATCHER_TEXT.putOut, 'Put out Mail Dispatcher');
    assert.equal(DISPATCHER_TEXT.putAway, 'Put away');
  });

  it('is offered in Cultivate: Put away in its actions, Put out in the banner', () => {
    const src = read('features/homes-feature.js');
    assert.match(src, /'data-home-action': 'dispatcher-put-away'/);
    assert.match(src, /'data-home-dispatcher': 'put-out'/);
    assert.match(src, /\.\.\.\(id === 'dispatcher' \? \[dispatcherPutAwayAction\(engine\)\] : \[\]\)/);
  });
});

/** A fake Pixi with an AnimatedSprite that keeps x/y (fake-scene's Display). */
const PIXI = new Proxy({ AnimatedSprite: Display, Texture: class { static EMPTY = {}; once() {} }, Rectangle: class { constructor(x, y, w, h) { Object.assign(this, { x, y, w, h }); } } }, {
  get: (t, k) => (k in t ? t[k] : class { constructor() { return new Display(); } }),
});

describe('the courier without its Mail Dispatcher (report 153)', () => {
  const saved = {};
  before(() => {
    for (const k of ['PIXI', 'Image', 'document']) saved[k] = globalThis[k];
    globalThis.PIXI = PIXI;
    globalThis.Image = class { set src(v) { this._src = v; } };
    mock.timers.enable({ apis: ['Date'], now: 5_000_000 });
  });
  after(() => {
    mock.timers.reset();
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete globalThis[k];
      else globalThis[k] = v;
    }
  });

  it('puts it away from its verb menu, spawns none while away, and stands it again when put out', async () => {
    const { mailCourierFeature } = await import('../public/js/features/mail-courier-feature.js?fresh=dispatcher-away');
    const mail = createMailboxState();
    const data = {};
    const toasts = [];
    let away = false;
    let interactables = [{ classId: 'npc_mailbox', sprite: { x: 1400, y: 870, destroyed: false } }];
    const engine = {
      started: true,
      PIXI,
      entityLayer: new Display(),
      player: { x: 900, y: 870 },
      streetTsid: 'RH_HOME_EXT',
      get interactables() { return interactables; },
      mailMessages: () => mail.messages,
      param: () => null,
      prompt: () => {},
      busy: () => false,
      acting: () => false,
      questDialogueOpen: () => false,
      streetCardUp: () => false,
      transientInstance: () => false,
      homeContext: () => ({ inHome: true, room: 'street' }),
      register: (t) => { interactables.push(t); return t; },
      unregister: (t) => { interactables = interactables.filter((x) => x !== t); },
      query: (hook) => {
        if (hook === 'homeDispatcherAway') return away ? true : null;
        if (hook === 'homeDispatcherX') return 640;
        if (hook === 'homeDispatcherPutAway') { away = true; return { ok: true }; }
        return null;
      },
      setData: (k, v) => { data[k] = v; },
      toast: (t) => toasts.push(t),
      pushActivity: () => {},
      playSound: () => {},
      refreshPack: () => {},
      openMailbox: () => {},
      mailboxOpen: () => true,
      save: () => {},
    };
    const dispatcher = () => interactables.find((t) => t.classId === 'npc_mail_dispatcher') || null;
    mailCourierFeature.restore({});
    mailCourierFeature.onTick(16, 0, engine);
    const target = dispatcher();
    assert.ok(target, 'existing players keep it');
    assert.equal(target.sprite.x, 640);
    assert.deepEqual(mailCourierFeature.verbsFor(target, engine).map((v) => [v.id, v.label, v.enabled]), [['send_mail', 'Send mail', true], ['put_away', 'Put away', true]]);

    // Not while its Send mail window (or a parcel run) is under way.
    mailCourierFeature.runVerb(target, 'send_mail', engine);
    assert.equal(mailCourierFeature.mailDispatcherBusy(), true);
    const held = mailCourierFeature.verbsFor(target, engine).find((v) => v.id === 'put_away');
    assert.deepEqual([held.enabled, held.reason], [false, 'Waiting for the frog.']);
    engine.mailboxOpen = () => false;
    mock.timers.tick(500);
    mailCourierFeature.onTick(16, 0, engine);
    assert.equal(mailCourierFeature.mailDispatcherBusy(), null);

    assert.equal(mailCourierFeature.runVerb(target, 'put_away', engine), true);
    assert.equal(away, true);
    assert.equal(dispatcher(), null, 'off the street at once');
    assert.equal(data.mailDispatcher, '');
    assert.equal(data.mailCourierLast, 'dispatcher:away');
    for (let i = 0; i < 3; i += 1) {
      mock.timers.tick(500);
      mailCourierFeature.onTick(16, 0, engine);
    }
    assert.equal(dispatcher(), null, 'none while it is away');

    // Mail without it: the Mailbox sends a letter with an item; no parcel run, nothing breaks.
    const inv = { apple: 3 };
    const sent = sendMail(mail, { currants: 100 }, inv, { recipient: 'Amp', text: 'An apple for you.', attachment: { classTsid: 'apple', count: 1 }, attachmentBaseCost: 5 });
    assert.equal(sent.ok, true);
    assert.equal(inv.apple, 2);
    assert.equal(listMailboxMessages(mail, { outgoing: true }).length, 1);
    mock.timers.tick(500);
    mailCourierFeature.onTick(16, 0, engine);
    assert.equal(mailCourierFeature._state().state.parcels, 0);
    assert.equal(dispatcher(), null);

    // Put out (homes-feature's Cultivate banner) asks the courier to look again now.
    away = false;
    mailCourierFeature.mailDispatcherSync(engine);
    assert.ok(dispatcher(), 'back on the street at once');
  });

  it('asks homes-feature before standing it, and homes-feature asks before putting it away', () => {
    const courier = read('features/mail-courier-feature.js');
    assert.match(courier, /engine\.query\?\.\('homeDispatcherAway', engine\) === true/);
    assert.match(courier, /engine\.query\?\.\('homeDispatcherPutAway', engine\)/);
    const homes = read('features/homes-feature.js');
    assert.match(homes, /engine\?\.query\?\.\('mailDispatcherBusy', engine\) === true/);
    assert.match(homes, /engine\.query\?\.\('mailDispatcherSync', engine\)/);
  });
});
