// G294: the non-modal prompt stack (js/prompt-stack.js, PromptView.as) and engine.prompt's routing.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_PROMPT_CHOICES,
  PROMPT_DOCK,
  PROMPT_PAD,
  PROMPT_RECHECK_MS,
  PROMPT_REMOVE_MS,
  PROMPT_STACK_CSS,
  PROMPT_WIDTH,
  buttonsBelowText,
  createPromptStack,
  normalizePrompt,
  promptChoices,
  promptStackHasRoom,
  usesIconButtons,
} from '../public/js/prompt-stack.js?v=g378-1';

const here = dirname(fileURLToPath(import.meta.url));
const pub = join(here, '../public');
const read = (rel) => readFileSync(join(pub, rel), 'utf8');
const game = read('game.js');
const client = join(here, '../../glitch-client/com/tinyspeck/engine');
const gsjs = join(here, '../../glitch-GameServerJS');

/** Just enough DOM for the stack. */
function fakeDom() {
  const byId = new Map();
  const make = (tag) => {
    const node = {
      tagName: tag.toUpperCase(),
      style: {},
      dataset: {},
      attrs: {},
      children: [],
      parent: null,
      textContent: '',
      handlers: {},
      classes: new Set(),
      get isConnected() { return Boolean(node.parent); },
      set id(v) { node._id = v; byId.set(v, node); },
      get id() { return node._id; },
      set className(v) { node.classes = new Set(String(v).split(/\s+/).filter(Boolean)); },
      get className() { return [...node.classes].join(' '); },
      classList: {
        add: (c) => node.classes.add(c),
        remove: (c) => node.classes.delete(c),
        contains: (c) => node.classes.has(c),
        toggle: (c, on) => (on ? node.classes.add(c) : node.classes.delete(c)),
      },
      setAttribute(k, v) { node.attrs[k] = v; },
      appendChild(child) { child.parent = node; node.children.push(child); return child; },
      prepend(child) { child.parent = node; node.children.unshift(child); },
      remove() {
        if (!node.parent) return;
        node.parent.children = node.parent.children.filter((c) => c !== node);
        node.parent = null;
      },
      addEventListener(type, fn) { (node.handlers[type] ||= []).push(fn); },
      removeEventListener(type, fn) { node.handlers[type] = (node.handlers[type] || []).filter((f) => f !== fn); },
      fire(type) { for (const fn of node.handlers[type] || []) fn({ stopPropagation() {} }); },
      querySelectorAll(sel) {
        const out = [];
        const walk = (n) => n.children.forEach((c) => { if (sel === '[data-prompt-choice]' && c.dataset.promptChoice !== undefined) out.push(c); walk(c); });
        walk(node);
        return out;
      },
      getBoundingClientRect: () => ({ width: 0, height: 0 }),
    };
    return node;
  };
  const head = make('head');
  const body = make('body');
  body.parent = { children: [body] };
  const doc = { head, body, createElement: make, getElementById: (id) => byId.get(id) || null };
  return { doc, body };
}

/** Hand-driven later() / every() and a prompt-timeout timer. */
function clock() {
  let now = 0;
  const rows = new Set();
  const at = (fn, ms, every = 0) => {
    const row = { fn, at: now + ms, every };
    rows.add(row);
    return () => rows.delete(row);
  };
  return {
    later: (fn, ms) => at(fn, ms),
    every: (fn, ms) => at(fn, ms, ms),
    timer: (fn, ms) => at(fn, ms),
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const due = [...rows].filter((r) => r.at <= end).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        now = due.at;
        if (due.every) due.at += due.every;
        else rows.delete(due);
        due.fn();
      }
      now = end;
    },
  };
}

function setup({ height = 0, view = 0 } = {}) {
  const dom = fakeDom();
  const c = clock();
  const data = {};
  const sounds = [];
  const h = { value: height };
  const stack = createPromptStack({
    document: dom.doc,
    win: {},
    mount: () => dom.body,
    viewHeight: () => view,
    measure: () => h.value,
    playSound: (k) => sounds.push(k),
    setData: (k, v) => { data[k] = v; },
    later: c.later,
    every: c.every,
    timer: c.timer,
  });
  const root = () => dom.doc.getElementById('prompt-stack');
  const texts = () => root().children.map((el) => el.children[0].textContent);
  const button = (i, b = 0) => root().children[i].children[1].children[b];
  return { ...dom, clock: c, data, sounds, stack, root, texts, button, h };
}

describe('the source prompt (inc_prompts.js, PromptView.as)', () => {
  it('matches the client view', { skip: !existsSync(client) && 'no client checkout' }, () => {
    const pv = readFileSync(join(client, 'view/gameoverlay/PromptView.as'), 'utf8');
    assert.match(pv, /private var padd:int = 7;\s*private var overall_w:int = 300;/);
    assert.match(pv, /x = model\.layoutModel\.loc_vp_w-overall_w-30;\s*y = model\.layoutModel\.loc_vp_h-30;/);
    assert.match(pv, /active_holder\.addChildAt\(sp, 0\);/);
    assert.match(pv, /if \(height<model\.layoutModel\.loc_vp_h\/2 \|\| prompt\.is_modal\)/);
    assert.match(pv, /private const MAX_BUTTON_WIDTHS:uint = 100;/);
    assert.match(pv, /SoundMaster\.instance\.playSound\('CLICK_FAILURE'\);/);
    assert.match(pv, /StageBeacon\.setInterval\(checkForNewPrompts, 5000\);/);
    assert.equal(PROMPT_WIDTH, 300);
    assert.equal(PROMPT_PAD, 7);
    assert.equal(PROMPT_DOCK, 30);
    assert.equal(PROMPT_RECHECK_MS, 5000);
    assert.equal(PROMPT_REMOVE_MS, 200);
  });

  it('prompts_add_simple is text and one OK', { skip: !existsSync(gsjs) && 'no GSJS checkout' }, () => {
    const src = readFileSync(join(gsjs, 'players/inc_prompts.js'), 'utf8');
    assert.match(src, /choices\s*: \[\s*\{ value : 'ok', label : 'OK' \}\s*\]/);
    assert.deepEqual(DEFAULT_PROMPT_CHOICES.map((c) => ({ ...c })), [{ label: 'OK', value: 'ok' }]);
  });

  it('keeps labelled choices in order, else one OK; icon buttons only for two', () => {
    assert.deepEqual(promptChoices(null), [{ label: 'OK', value: 'ok' }]);
    assert.deepEqual(promptChoices([{ label: 'Yes', value: 'yes' }, null, { value: 'x' }, { label: 'No', value: 'no' }]), [{ label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }]);
    assert.equal(usesIconButtons({ iconButtons: true, choices: [{ label: 'Yes' }, { label: 'No' }] }), true);
    assert.equal(usesIconButtons({ iconButtons: true, choices: [{ label: 'OK' }] }), false);
    const p = normalizePrompt({ txt: 'Hi', timeout: 10, timeout_value: 'no', icon_buttons: true }, 'u1');
    assert.equal(p.text, 'Hi');
    assert.equal(p.timeoutMs, 10000);
    assert.equal(p.timeoutValue, 'no');
    assert.equal(p.iconButtons, true);
  });

  it('buttons wider than 100 px go under the text; room while under half the view', () => {
    assert.equal(buttonsBelowText([40, 40]), false);
    assert.equal(buttonsBelowText([60, 50]), true);
    assert.equal(promptStackHasRoom(199, 400), true);
    assert.equal(promptStackHasRoom(200, 400), false);
    assert.equal(promptStackHasRoom(900, 0), true, 'no layout: no limit');
  });

  it('docks bottom right, 300 px, stacked 7 px apart, hidden under the street card', () => {
    assert.match(PROMPT_STACK_CSS, /\.prompt-stack \{ position: absolute; z-index: 95; right: 30px; bottom: calc\(var\(--pack-live-height, 112px\) \+ 30px\);/);
    assert.match(PROMPT_STACK_CSS, /width: min\(300px, calc\(100% - 32px\)\); display: flex; flex-direction: column; gap: 7px;/);
    assert.match(PROMPT_STACK_CSS, /background: rgba\(57,59,50,\.9\)/);
    assert.match(PROMPT_STACK_CSS, /html\[data-street-cards\] \.prompt-stack \{ visibility: hidden; \}/);
  });
});

describe('the stack', () => {
  it('puts the newest prompt on top and takes no focus', () => {
    const t = setup();
    const a = t.stack.add({ text: 'First' });
    const b = t.stack.add({ text: 'Second' });
    assert.ok(a && b && a !== b);
    assert.deepEqual(t.texts(), ['Second', 'First']);
    const el = t.root().children[0];
    assert.equal(el.attrs.role, 'dialog');
    assert.equal(el.attrs['aria-modal'], 'false');
    assert.equal(t.button(0).textContent, 'OK');
    assert.equal(t.data.promptStack, '2');
  });

  it('ignores a prompt with no text (prompts_add 59)', () => {
    const t = setup();
    assert.equal(t.stack.add({ text: '' }), '');
  });

  it('a click plays CLICK_SUCCESS, sends the value, fades and goes', () => {
    const t = setup();
    const got = [];
    t.stack.add({ text: 'Go?', choices: [{ label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }], onChoice: (v) => got.push(v) });
    t.button(0, 1).fire('click');
    assert.deepEqual(got, ['no']);
    assert.deepEqual(t.sounds, ['CLICK_SUCCESS']);
    assert.ok(t.root().children[0].classes.has('is-leaving'));
    // A second click while it fades: CLICK_FAILURE, nothing sent.
    t.button(0, 0).fire('click');
    assert.deepEqual(got, ['no']);
    assert.deepEqual(t.sounds, ['CLICK_SUCCESS', 'CLICK_FAILURE']);
    t.clock.advance(PROMPT_REMOVE_MS);
    assert.equal(t.root().children.length, 0);
  });

  it('times out on its own: the timeout_value, or nothing', () => {
    const t = setup();
    const got = [];
    const timeouts = [];
    t.stack.add({ text: 'Pooped', timeout: 10, onChoice: (v) => got.push(v) });
    t.stack.add({ text: 'Knock knock', timeout: 5, timeoutValue: 'no', onChoice: (v) => got.push(v) });
    t.stack.add({ text: 'Timed', timeoutMs: 3000, onTimeout: (c) => timeouts.push(c) });
    t.clock.advance(3000);
    assert.deepEqual(timeouts, [null]);
    t.clock.advance(2000);
    assert.deepEqual(got, ['no']);
    t.clock.advance(5000);
    assert.deepEqual(got, ['no'], 'no timeout_value: no choice');
    t.clock.advance(PROMPT_REMOVE_MS);
    assert.equal(t.root().children.length, 0);
  });

  it('holds expired prompts while the pointer is over the stack, until 2 s after it leaves', () => {
    const t = setup();
    t.stack.add({ text: 'Hold me', timeout: 1 });
    t.root().fire('pointerenter');
    t.clock.advance(5000);
    assert.equal(t.stack.shown().length, 1);
    t.root().fire('pointerleave');
    t.clock.advance(1999);
    assert.equal(t.stack.shown().length, 1);
    t.clock.advance(1);
    assert.equal(t.stack.shown().length, 0);
  });

  it('waits for room under half the view, then shows the next (and on the 5 s check)', () => {
    const t = setup({ height: 0, view: 400 });
    t.stack.add({ text: 'One' });
    t.h.value = 250;
    t.stack.add({ text: 'Two' });
    assert.deepEqual(t.texts(), ['One']);
    assert.equal(t.data.promptQueued, '1');
    t.h.value = 100; // the view grew, say
    t.clock.advance(PROMPT_RECHECK_MS);
    assert.deepEqual(t.texts(), ['Two', 'One']);
    t.h.value = 250;
    t.stack.add({ text: 'Three' });
    assert.equal(t.stack.queued().length, 1);
    t.h.value = 120;
    t.button(0).fire('click');
    t.clock.advance(PROMPT_REMOVE_MS);
    assert.deepEqual(t.texts(), ['Three', 'One']);
  });

  it('prompts_remove takes one away unanswered, shown or waiting', () => {
    const t = setup({ height: 0, view: 400 });
    const got = [];
    const a = t.stack.add({ text: 'A', onChoice: (v) => got.push(v) });
    t.h.value = 300;
    const b = t.stack.add({ text: 'B' });
    assert.equal(t.stack.remove(b), true);
    assert.equal(t.stack.queued().length, 0);
    assert.equal(t.stack.remove(a), true);
    assert.equal(t.stack.has(a), false);
    t.clock.advance(PROMPT_REMOVE_MS);
    assert.deepEqual(got, []);
    assert.equal(t.stack.remove('nope'), false);
  });

  it('two icon_buttons choices are a check and an X with the labels as tips', () => {
    const t = setup();
    t.stack.add({ text: 'Can Gene come in?', iconButtons: true, choices: [{ label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }] });
    assert.equal(t.button(0, 0).children[0].src, 'assets/ui/prompt/prompt_check.png');
    assert.equal(t.button(0, 1).children[0].src, 'assets/ui/prompt/prompt_x.png');
    assert.equal(t.button(0, 1).title, 'No');
    assert.ok(existsSync(join(pub, 'assets/ui/prompt/prompt_check.png')));
    assert.ok(existsSync(join(pub, 'assets/ui/prompt/prompt_x.png')));
  });
});

describe('engine.prompt and its callers', () => {
  it('a normal prompt joins the stack and returns its uid; modal: true keeps the card', () => {
    const body = game.slice(game.indexOf('  prompt({ title = '), game.indexOf('  /** Enter the Museum of the Rook instance'));
    assert.match(body, /if \(modal !== true\) return promptStackUi\(\)\.add\(/);
    assert.match(body, /removePrompt: \(uid\) => promptStackUi\(\)\.remove\(uid\),/);
    assert.match(game, /import \{ createPromptStack \} from '\.\/js\/prompt-stack\.js\?v=g378-1';/);
    assert.match(game, /viewHeight: \(\) => locationViewRect\(\)\?\.height \|\| 0,/);
  });

  it('quest completions, the Magic Rock and the tower job keep the card; the tower secret is a VOG', () => {
    assert.match(read('js/features/seasons-feature.js'), /engine\.scriptedDialogue\?\.\(\{ title: q\.title, kicker: 'Quest complete'/);
    assert.match(read('js/features/smuggling-feature.js'), /engine\.scriptedDialogue\?\.\(\{ title: 'Warm and Smuggly', kicker: 'Magic Rock'/);
    const tower = read('js/features/home-tower-feature.js');
    assert.match(tower, /engine\.scriptedDialogue\?\.\(\{ kicker: 'Tower Project', title: def\.title, beats: \[\{ text: def\.completion, response: 'OK' \}\] \}\);/);
    assert.match(tower, /if \(text\) engine\.vog\?\.\(\{ lines: \[text\], fadeAlpha: 0 \}\);/);
  });

  it('the Bureaucrat end prompt is a stacked prompt (npc_bureaucrat.js 909-917)', { skip: !existsSync(gsjs) && 'no GSJS checkout' }, () => {
    assert.match(readFileSync(join(gsjs, 'items/npc_bureaucrat.js'), 'utf8'), /function showEndPrompt\(pc\)\{[\s\S]{0,80}pc\.prompts_add\(\{/);
    assert.match(game, /engine\.prompt\(\{\s*text: 'Thank you for your business\./);
  });
});
