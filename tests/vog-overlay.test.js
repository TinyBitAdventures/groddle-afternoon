// G228: location VOGs in their own overlay, the chooser on a street change,
// Enter during the crab's call-out, and prompts with no kicker.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  VOG_ADVANCE_LABEL,
  VOG_FADE_ALPHA,
  VOG_WIDTH,
  createVogOverlay,
  vogKeyAction,
  vogLines,
} from '../public/js/vog-overlay.js?v=g228-1';

const here = dirname(fileURLToPath(import.meta.url));
const pub = join(here, '../public');
const read = (rel) => readFileSync(join(pub, rel), 'utf8');
const game = read('game.js');
const gsjs = join(here, '../../glitch-GameServerJS');
const client = join(here, '../../glitch-client/com/tinyspeck/engine');

/** Just enough DOM for the overlay. */
function fakeDom() {
  const listeners = new Map();
  const make = (tag) => {
    const node = {
      tagName: tag,
      style: {},
      hidden: false,
      textContent: '',
      children: [],
      attrs: {},
      handlers: {},
      classes: new Set(),
      set className(v) { node.classes = new Set(String(v).split(/\s+/).filter(Boolean)); },
      get className() { return [...node.classes].join(' '); },
      classList: {
        add: (c) => node.classes.add(c),
        remove: (c) => node.classes.delete(c),
        contains: (c) => node.classes.has(c),
      },
      setAttribute(k, v) { node.attrs[k] = v; },
      appendChild(child) { node.children.push(child); return child; },
      addEventListener(type, fn) { node.handlers[type] = fn; },
    };
    return node;
  };
  const head = make('head');
  const body = make('body');
  const doc = { head, body, createElement: make, getElementById: () => null };
  const win = {
    addEventListener(type, fn) { listeners.set(type, fn); },
    removeEventListener(type) { listeners.delete(type); },
    requestAnimationFrame(fn) { fn(); },
  };
  doc.defaultView = win;
  return { doc, win, listeners, body };
}

function key(k, extra = {}) {
  const ev = { key: k, stopped: false, prevented: false, ...extra };
  ev.stopImmediatePropagation = () => { ev.stopped = true; };
  ev.preventDefault = () => { ev.prevented = true; };
  return ev;
}

function setup() {
  const dom = fakeDom();
  const data = {};
  const ui = createVogOverlay({ document: dom.doc, win: dom.win, setData: (k, v) => { data[k] = v; } });
  const root = () => dom.body.children[0];
  const lineText = () => root().children[0].children[0].textContent;
  return { ...dom, data, ui, root, lineText };
}

describe('the VOG overlay (inc_events.js events_VOGPlayer 556-600)', () => {
  it('matches the source announcement', { skip: !existsSync(gsjs) && 'no GSJS checkout' }, () => {
    const src = readFileSync(join(gsjs, 'locations/inc_events.js'), 'utf8');
    const fn = src.slice(src.indexOf('function events_VOGPlayer('), src.indexOf('pc.apiSendAnnouncement(args);'));
    assert.match(fn, /var lines = args_in\.text\.split\('\/\/'\);/);
    assert.match(fn, /var width = args_in\.width \? args_in\.width : 500;/);
    assert.match(fn, /y: args_in\.y \? args_in\.y : '50%',/);
    assert.match(fn, /click_to_advance: true,/);
    assert.match(fn, /click_to_advance_bottom: true,/);
    assert.match(fn, /background_alpha: args_in\.fade_alpha \? args_in\.fade_alpha : 0\.3,/);
    assert.equal(VOG_WIDTH, 500);
    assert.equal(VOG_FADE_ALPHA, 0.3);
  });

  it('the client shades the location view, centres the text and says "Click anywhere..."', { skip: !existsSync(client) && 'no client checkout' }, () => {
    const iw = readFileSync(join(client, 'view/gameoverlay/InWindowAnnouncementOverlay.as'), 'utf8');
    assert.match(iw, /label: 'Click anywhere\.\.\.',/);
    assert.match(iw, /g\.beginFill\(ColorUtil\.colorStrToNum\(annc\.background_color\), annc\.background_alpha\);\s*g\.drawRect\(0, 0, center_in_w, center_in_h\);/);
    assert.match(iw, /center_in_h = model\.layoutModel\.loc_vp_h;/);
    const annc = readFileSync(join(client, 'data/client/Announcement.as'), 'utf8');
    // at_bottom is a layering flag, not a position.
    assert.match(annc, /public var at_bottom:Boolean; \/\/ adds the LOCATION_OVERLAY below all dynamic stuff/);
    assert.equal(VOG_ADVANCE_LABEL, 'Click anywhere...');
    const abs = readFileSync(join(client, 'view/gameoverlay/AbstractAnnouncementOverlay.as'), 'utf8');
    assert.match(abs, /if \(KeyBeacon\.instance\.anyWASDorArrowKeysPressed\(\)\) \{\s*return;\s*\}\s*if \(e\.keyCode == Keyboard\.SPACE\) \{\s*return\s*\}\s*advance\(\);/);
    const main = readFileSync(join(client, 'view/TSMainView.as'), 'utf8');
    assert.match(main, /public function moveMoveStarted\(\):void \{[\s\S]{0,900}AnnouncementController\.instance\.cancelAllOverlaysWeCan\(\);/);
  });

  it('splits text on // and drops empty lines', () => {
    assert.deepEqual(vogLines('One// Two //'), ['One', 'Two']);
    assert.deepEqual(vogLines(['A', ' ', 'B']), ['A', 'B']);
    assert.deepEqual(vogLines(''), []);
  });

  it('shows one line a click, then runs the next event', () => {
    const t = setup();
    let done = 0;
    assert.equal(t.ui.show({ lines: ['First line', 'Second line'], onComplete: () => { done += 1; } }), true);
    assert.equal(t.root().hidden, false);
    assert.equal(t.root().style.background, 'rgba(0, 0, 0, 0.3)');
    assert.equal(t.lineText(), 'First line');
    assert.equal(t.data.vogOverlay, '1/2:First line');
    assert.equal(t.root().children[0].children[1].textContent, 'Click anywhere...');
    t.root().handlers.click({ stopPropagation() {} });
    assert.equal(t.lineText(), 'Second line');
    assert.equal(done, 0);
    t.root().handlers.click({ stopPropagation() {} });
    assert.equal(done, 1);
    assert.equal(t.root().hidden, true);
    assert.equal(t.data.vogOverlay, '');
    assert.equal(t.ui.isOpen(), false);
  });

  it('locks the keys: movement and Space are swallowed, any other key advances', () => {
    const t = setup();
    t.ui.show({ lines: ['A', 'B'] });
    const onKey = t.listeners.get('keydown');
    const walk = key('ArrowLeft');
    onKey(walk);
    assert.equal(walk.stopped, true, 'the avatar stays put');
    assert.equal(t.lineText(), 'A');
    onKey(key(' '));
    assert.equal(t.lineText(), 'A');
    const enter = key('Enter');
    onKey(enter);
    assert.equal(enter.stopped, true, 'Enter does not reach the chooser');
    assert.equal(t.lineText(), 'B');
    const typing = key('x', { target: { matches: () => true } });
    onKey(typing);
    assert.equal(typing.stopped, false, 'chat typing passes');
    assert.equal(vogKeyAction(key('r', { metaKey: true })), 'pass');
    assert.equal(vogKeyAction(key('Shift')), 'hold');
    assert.equal(vogKeyAction(key('Enter', { repeat: true })), 'hold');
    onKey(key('Escape'));
    assert.equal(t.ui.isOpen(), false);
    assert.equal(t.listeners.has('keydown'), false);
  });

  it('a second VOG waits its turn; a street change drops both without their next events', () => {
    const t = setup();
    const ran = [];
    t.ui.show({ lines: ['one'], onComplete: () => ran.push('one') });
    t.ui.show({ lines: ['two'], onComplete: () => ran.push('two') });
    t.ui.advance();
    assert.deepEqual(ran, ['one']);
    assert.equal(t.lineText(), 'two');
    t.ui.show({ lines: ['three'], onComplete: () => ran.push('three') });
    assert.equal(t.ui.cancel(), true);
    assert.deepEqual(ran, ['one']);
    assert.equal(t.ui.isOpen(), false);
    assert.equal(t.data.vogLast, 'cancelled');
  });
});

describe('game.js wiring', () => {
  it('location events send VOGs to engine.vog', () => {
    const src = read('js/features/location-events-feature.js');
    const vog = src.slice(src.indexOf("case 'vog': {"), src.indexOf("case 'activity':"));
    assert.match(vog, /engine\.vog\?\.\(\{ lines: fx\.lines, onComplete: next \}\);/);
    assert.match(game, /vog: \(opts\) => openLocationVog\(opts\),/);
  });

  it('a VOG waits for the chooser and verb menus, then for the loading card', () => {
    assert.match(game, /function openLocationVog\(opts\) \{\s*if \(holdScriptedDialog\(\{ \.\.\.opts, vog: true \}\)\) return;\s*if \(streetCardUp\(\)\) \{/);
    assert.match(game, /if \(next\?\.vog\) openLocationVog\(next\);\s*else openScriptedQuestDialogue\(next\);/);
  });

  it('it locks the avatar and counts as busy', () => {
    const blocked = game.slice(game.indexOf('function gameplayInputBlocked()'), game.indexOf('function publishJumpState('));
    assert.match(blocked, /isVogOpen\(\) \|\|/);
    const busy = game.slice(game.indexOf('  busy({ ignoreHome = false } = {}) {'), game.indexOf('  /** A verb in progress or the verb menu open'));
    assert.match(busy, /isVogOpen\(\) \|\|/);
  });

  it('a street change closes the chooser and drops VOGs, at the move and at the teardown', () => {
    assert.match(game, /function endStreetOverlays\(reason = 'street-change'\) \{\s*if \(enterChooser\?\.isOpen\(\)\) enterChooser\.close\(reason\);\s*vogOverlay\?\.cancel\(\);/);
    assert.match(game, /function clearWorldEntities\(\) \{\s*cancelCurrentAction\(\{ quiet: true \}\);\s*endStreetOverlays\(\);/);
    assert.match(game, /document\.documentElement\.addEventListener\(STREET_CARD_UP, \(\) => endStreetOverlays\(\)\);/);
    assert.match(read('js/screen-fx.js'), /export const STREET_CARD_UP = /);
  });
});

describe('Enter during the crab\'s call-out', () => {
  it('the source call-out never took focus', { skip: !existsSync(gsjs) && 'no GSJS checkout' }, () => {
    const crab = readFileSync(join(gsjs, 'items/npc_crab.js'), 'utf8');
    assert.match(crab, /this\.conversation_start\(pc, txt, choices, null, null, null, \{required_distance: 100, dont_take_focus: true\}\);/);
  });

  it('Enter still reached the client\'s location handler, which opened the menu (G230, Austin 2026-10-28)', { skip: !existsSync(client) && 'no client checkout' }, () => {
    const lih = readFileSync(join(client, 'view/renderer/LocationInputHandler.as'), 'utf8');
    // enterKeyHandler 193-207 returns only for a focused input or cult mode, then begins the interaction.
    assert.match(lih, /private function enterKeyHandler\(e:KeyboardEvent = null\):void \{[\s\S]*?if \(model\.stateModel\.focus_is_in_input\) return;[\s\S]*?_beginInteractionAfterEnterKey\(\);/);
    assert.match(lih, /TSFrontController\.instance\.startInteractionWith\(interaction_spritesV\[0\]\);/);
  });

  it('the crab holds no Enter, so Enter opens its menu while the call-out is up', async () => {
    const crabs = read('js/features/crabs-feature.js');
    assert.doesNotMatch(crabs, /holdsEnter\(/);
    const { crabsFeature } = await import('../public/js/features/crabs-feature.js?v=g464-2');
    assert.equal(crabsFeature.holdsEnter, undefined);
    // The generic hook stays for any later feature; nothing answers it now.
    assert.match(game, /function enterHeldBy\(\) \{\s*return features\.query\('holdsEnter', engine\) \|\| null;\s*\}/);
  });
});

describe('prompts with no kicker', () => {
  it('the client drew only the text, with a title only when the prompt has one', { skip: !existsSync(client) && 'no client checkout' }, () => {
    const pv = readFileSync(join(client, 'view/gameoverlay/PromptView.as'), 'utf8');
    assert.match(pv, /tf\.htmlText = '<span class="prompt_default">'\+prompt_txt\+'<\/span>';/);
    assert.match(pv, /if \(prompt\.title\) cdVO\.title = prompt\.title;/);
  });

  it('engine.prompt passes null for a missing kicker or title, and the card hides them', () => {
    const body = game.slice(game.indexOf('  prompt({ title = '), game.indexOf('  /** Enter the Museum of the Rook instance'));
    assert.match(body, /title: title \|\| null,\s*kicker: kicker \|\| null,/);
    assert.match(game, /kicker\.hidden = questDialogueState\.kicker === null;/);
    assert.match(game, /title\.hidden = !def && questDialogueState\.title === null;/);
  });
});
