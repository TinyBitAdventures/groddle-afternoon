/**
 * Report #709: in Glitch a player's name was coloured in the chat panel and in their speech bubble
 * (RightSideManager.as 803-822 getPCColorIndex, AvaChatBubbleManager.as 117-119); Modern drew every
 * other name in --text and every bubble name in one brown. Austin 2026-11-26: one fixed colour per
 * player from Glitch's palette, keyed by the stable player id (ours: Glitch went by session order),
 * your own name violet in Modern; one helper (js/name-colours.js) for Modern chat, Classic chat and
 * the bubbles.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NAME_PALETTE, YOU_CLASSIC, YOU_MODERN, nameColourKey, nameColourSlot, playerNameColour, playerNameSlot } from '../public/js/name-colours.js?v=9819bb8a';
import { mountSocialDrawer } from '../public/js/ui/social-drawer.js?v=dca299d0';
import { createNotifier } from '../public/js/notify.js?v=c9d79ec5';
import { memoryStore, page } from './social-fake-dom.js';
import { readTokens } from '../tools/tokens/css-sources.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const tokens = readTokens(root);
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;

function luminance(h) {
  const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const contrast = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

describe('#709 name colours: the helper', () => {
  it('the same player id is the same colour every time, whatever name they show', () => {
    for (const id of [1, 7, 42, 1009, 250000]) {
      const slot = playerNameSlot(id, 'Kukui');
      assert.equal(playerNameSlot(id, 'Someone Else'), slot, `id ${id} ignores the name`);
      assert.equal(playerNameSlot(String(id), ''), slot, `id ${id} as a string`);
      assert.equal(playerNameColour(id, 'x'), NAME_PALETTE[slot]);
    }
    assert.equal(nameColourKey(12, 'Ada'), 'id:12');
    assert.equal(nameColourKey(0, 'Ada'), 'name:Ada', 'no id: the name');
    assert.equal(playerNameSlot(0, 'Ada'), playerNameSlot(0, 'Ada'));
  });

  it('spreads players over all six colours', () => {
    assert.equal(NAME_PALETTE.length, 6);
    const counts = new Array(6).fill(0);
    for (let id = 1; id <= 600; id++) counts[playerNameSlot(id)] += 1;
    for (const [i, n] of counts.entries()) assert.ok(n >= 70 && n <= 130, `slot ${i}: ${n} of 600`);
    const first12 = new Set(Array.from({ length: 12 }, (_, i) => playerNameSlot(i + 1)));
    assert.ok(first12.size >= 5, `the first 12 ids use ${first12.size} colours`);
    for (const k of ['', 'a', 'id:1']) assert.ok(nameColourSlot(k) >= 0 && nameColourSlot(k) < 6);
  });

  it('yours is violet in Modern, Glitch\'s chat_element_you in Classic', () => {
    assert.equal(playerNameColour(5, 'Ur', { mine: true }), YOU_MODERN);
    assert.equal(playerNameColour(5, 'Ur', { mine: true, classic: true }), YOU_CLASSIC);
    assert.equal(hex(YOU_MODERN), tokens.get('--c-violet-49'));
    assert.equal(tokens.get('--accent'), 'var(--c-violet-49)');
    assert.equal(hex(YOU_CLASSIC), tokens.get('--c-classic-you'));
  });

  it('the palette is the chat tokens, each readable on the cream panel', () => {
    for (const [i, c] of NAME_PALETTE.entries()) {
      assert.equal(tokens.get(`--c-chat-name-${i}`), hex(c), `--c-chat-name-${i}`);
      assert.ok(contrast(hex(c), '#fbf5ea') >= 4.5, `${hex(c)} on cream: ${contrast(hex(c), '#fbf5ea').toFixed(2)}`);
    }
  });
});

describe('#709 name colours: the chat panel', () => {
  const saved = {};
  before(() => {
    for (const k of ['document', 'addEventListener', 'innerWidth', 'CSS', 'requestAnimationFrame']) saved[k] = globalThis[k];
    globalThis.CSS = { escape: (s) => s };
    globalThis.requestAnimationFrame = (fn) => fn();
  });
  after(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete globalThis[k];
      else globalThis[k] = v;
    }
  });

  function mount(mode) {
    const p = page();
    globalThis.document = p.doc;
    globalThis.addEventListener = () => {};
    let drawer = null;
    const notifier = createNotifier({ now: () => 1, clock: () => 1, onChange: () => drawer?.update() });
    drawer = mountSocialDrawer({ root: p.game, dock: p.dock, notifier, mode, storage: memoryStore(), width: () => 1920, canChat: () => true, streetName: () => 'Hechey Track', setData: () => {} });
    drawer.open();
    return { ...p, drawer };
  }
  const names = (log) => log.children.filter((c) => c.classList.contains('social-msg')).map((p) => p.children.find((n) => n.tagName === 'B'));

  it('online Local: each other player\'s name carries their slot; yours none (violet)', () => {
    const t = mount('online');
    t.drawer.localLine('Kukui', 'morning', { playerId: 11 });
    t.drawer.localLine('Ada', 'hi', { mine: true, playerId: 3 });
    t.drawer.localLine('Bramble', 'yo', { playerId: 12 });
    t.drawer.localLine('Kukui Renamed', 'still me', { playerId: 11 });
    const [kukui, mine, bramble, again] = names(t.dock.querySelector('[data-social-log]'));
    assert.equal(kukui.getAttribute('data-name-colour'), String(playerNameSlot(11)));
    assert.equal(bramble.getAttribute('data-name-colour'), String(playerNameSlot(12)));
    assert.equal(again.getAttribute('data-name-colour'), kukui.getAttribute('data-name-colour'), 'by id, not name');
    assert.equal(mine.getAttribute('data-name-colour'), null);
    assert.equal(mine.textContent, 'You');
  });

  it('solo Activity: your own line keeps the is-mine violet, a companion\'s takes a colour', () => {
    const t = mount('solo');
    t.drawer.localLine('Ur', 'hello street', { mine: true });
    t.drawer.localLine('Pip', 'hello back');
    const rows = t.dock.querySelector('[data-social-log]').children.filter((c) => c.classList.contains('social-msg'));
    assert.ok(rows[0].classList.contains('is-mine'));
    assert.equal(rows[0].children[0].getAttribute('data-name-colour'), null);
    assert.match(rows[0].textContent, /^Ur hello street/, 'still your name');
    assert.equal(rows[1].children[0].getAttribute('data-name-colour'), String(playerNameSlot(0, 'Pip')));
  });

  it('Modern CSS colours each slot from the chat tokens; Classic reads the same slot', () => {
    const css = read('public/style.css');
    for (let i = 0; i < 6; i++) assert.match(css, new RegExp(`\\.social-msg b\\[data-name-colour="${i}"\\] \\{ color: var\\(--c-chat-name-${i}\\); \\}`));
    assert.match(css, /\.social-msg\.is-mine b \{ color: var\(--accent\); \}/);
    assert.match(read('public/js/classic/classic-panes.js'), /const slot = b\.dataset\.nameColour \?\? String\(nameSlot\(seen, b\.textContent\)\);/);
  });
});

describe('#709 name colours: speech bubbles', () => {
  const game = read('public/game.js');
  const fn = game.slice(game.indexOf('function showSpeechBubble('), game.indexOf('function showSpeechBubble(') + 4000);

  it('the bubble draws its speaker in the helper\'s colour, not one brown', () => {
    assert.match(game, /import \{ playerNameColour \} from '\.\/js\/name-colours\.js\?v=[0-9a-f]{8}';/);
    assert.match(fn, /const speakerFill = playerNameColour\(speech\.speakerId \?\? target\.playerId, speakerName, \{\n\s+mine: target\.classId === 'pc_player',\n\s+classic: document\.documentElement\.dataset\.ui === 'classic',/);
    assert.match(fn, /fill: speakerFill,/);
    assert.doesNotMatch(fn, /0x7f6c55/);
  });

  it('another player\'s bubble online carries their id', () => {
    assert.match(read('public/js/features/realtime-feature.js'), /engine\.say\?\.\(r\.target, chatBubbleText\(text\), BUBBLE_MS, \{ speaker: name, speakerId: Number\(id\) \|\| 0 \}\)/);
    assert.match(read('public/js/features/party-feature.js'), /classId: 'pc_remote', label: p\.name, playerId: p\.id/);
  });
});
