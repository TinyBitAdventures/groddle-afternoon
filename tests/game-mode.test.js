/**
 * Multiplayer phase 1: the mode flag (js/game-mode.js), the start card's
 * Solo / Multiplayer choice (newxp-feature.js showStartCard) and the
 * /play/online/ entry page that strips demo and QA params in multiplayer
 * (phase 2: generated from play/index.html with a sign-in gate over the shell).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';

import {
  GAME_MODE,
  GAME_MODES,
  MODE_CHOICE_HTML,
  MULTIPLAYER,
  MULTIPLAYER_ENTRY_PATH,
  SOLO,
  isSolo,
  mountModeChoice,
  multiplayerEntryUrl,
  offersModeChoice,
  resolveGameMode,
} from '../public/js/game-mode.js?v=mp2-1';

const pub = join(import.meta.dirname, '..', 'public');
const read = (rel) => readFileSync(join(pub, rel), 'utf8');

describe('mode flag', () => {
  it('is solo unless an entry page declares multiplayer', () => {
    assert.deepEqual(GAME_MODES, ['solo', 'multiplayer']);
    assert.equal(GAME_MODE, SOLO, 'node, like /play/, declares nothing');
    assert.equal(resolveGameMode({}), SOLO);
    assert.equal(resolveGameMode(undefined), SOLO);
    assert.equal(resolveGameMode({ GRODDLE_MODE: 'multiplayer' }), MULTIPLAYER);
    for (const odd of ['Multiplayer', 'online', '1', true, { toString: () => 'multiplayer' }]) {
      assert.equal(resolveGameMode({ GRODDLE_MODE: odd }), SOLO, String(odd));
    }
    assert.equal(resolveGameMode({ GRODDLE_MODE: 'multiplayer', groddlePractice: true }), SOLO, 'practice copies are solo');
    const hostile = Object.defineProperty({}, 'GRODDLE_MODE', { get() { throw new Error('no'); } });
    assert.equal(resolveGameMode(hostile), SOLO);
    assert.equal(isSolo(SOLO), true);
    assert.equal(isSolo(MULTIPLAYER), false);
  });

  it('no query param can switch a page to multiplayer', () => {
    const src = read('js/game-mode.js').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
    assert.doesNotMatch(src, /location\.search|URLSearchParams\(location/);
  });

  it('is engine.mode and the canvas data-mode in game.js', () => {
    const game = read('game.js');
    assert.match(game, /import \{ GAME_MODE \} from '\.\/js\/game-mode\.js\?v=mp2-1';/);
    assert.match(game, /const engine = \{\n\s*PIXI,\n(?:\s*\/\*\*[^\n]*\*\/\n)?\s*mode: GAME_MODE,/);
    assert.match(game, /app\.canvas\.dataset\.mode = GAME_MODE;/);
  });

  it('picks the save store', () => {
    // Multiplayer gets the Minn store; solo the browser store (frozen by a backup restore).
    assert.match(read('js/save-store.js'), /export const saveStore = GAME_MODE === MULTIPLAYER\n\s*\? createSaveStore\(GAME_MODE\)\n\s*: \(\(\) => \{\n\s*const browser = createBrowserSaveStore\(\);/);
  });
});

describe('start card: Solo or Multiplayer', () => {
  it('asks only on a plain solo /play/', () => {
    assert.equal(offersModeChoice({ mode: SOLO, search: '' }), true);
    assert.equal(offersModeChoice({ mode: SOLO, search: '?' }), true);
    assert.equal(offersModeChoice({ mode: MULTIPLAYER, search: '' }), false);
    for (const q of ['?autostart=1', '?fresh=1', '?resetgame=1', '?practice=1', '?questdemo=phantom', '?sound=1', '?newxp=1', '?companions=0', '?x']) {
      assert.equal(offersModeChoice({ mode: SOLO, search: q }), false, q);
    }
  });

  it('Solo continues to the tutorial choice and Multiplayer leaves for /play/online/', () => {
    const buttons = {};
    const box = {
      innerHTML: '',
      dataset: {},
      querySelector(sel) {
        const attr = sel.slice(1, -1);
        assert.ok(this.innerHTML.includes(attr), `${sel} is in the card`);
        buttons[attr] ||= { handlers: [], addEventListener(type, fn) { assert.equal(type, 'click'); this.handlers.push(fn); }, click() { this.handlers.forEach((fn) => fn()); } };
        return buttons[attr];
      },
    };
    const calls = [];
    mountModeChoice(box, { onSolo: () => calls.push('solo'), onMultiplayer: () => calls.push('multiplayer') });
    assert.equal(box.dataset.step, 'mode');
    assert.match(box.innerHTML, />Solo<\/button>/);
    assert.match(box.innerHTML, />Multiplayer<\/button>/);
    buttons['data-mode-solo'].click();
    buttons['data-mode-multiplayer'].click();
    assert.deepEqual(calls, ['solo', 'multiplayer']);
    assert.equal(MULTIPLAYER_ENTRY_PATH, 'play/online/');
    // play/index.html has <base href="../">, so document.baseURI is the site root.
    assert.equal(multiplayerEntryUrl('https://groddle.localhost/'), 'https://groddle.localhost/play/online/');
    assert.equal(multiplayerEntryUrl('http://127.0.0.1:8790/sub/'), 'http://127.0.0.1:8790/sub/play/online/');
  });

  it('uses plain copy with no em-dashes', () => {
    assert.doesNotMatch(MODE_CHOICE_HTML, /—/);
    // Player-facing words only: comments copied from play/index.html are not shown.
    assert.doesNotMatch(read('play/online/index.html').replace(/<!--[\s\S]*?-->/g, ''), /—/);
  });

  it('newxp shows it before the tutorial choice, only for brand-new saves', () => {
    const f = read('js/features/newxp-feature.js');
    assert.match(f, /import \{ mountModeChoice, multiplayerEntryUrl, offersModeChoice \} from '\.\.\/game-mode\.js\?v=mp2-1';/);
    // Existing saves (hadSave) and autostart/newxp routes never get a card, as before.
    assert.match(f, /if \(!engine\.started && !hadSave && !engine\.param\('autostart'\) && !engine\.param\('newxp'\)\) showStartCard\(engine\);/);
    const card = f.slice(f.indexOf('function showStartCard'), f.indexOf('/* Feature  '));
    assert.match(card, /if \(!offersModeChoice\(\{ mode: engine\.mode, search: location\.search \}\)\) \{\n\s*tutorialChoice\(\);\n\s*return;\n\s*\}/);
    assert.match(card, /onSolo: \(\) => \{[\s\S]*?tutorialChoice\(\);/);
    assert.match(card, /onMultiplayer: \(\) => \{[\s\S]*?location\.assign\(multiplayerEntryUrl\(document\.baseURI\)\);/);
    assert.match(card, /Start with the tutorial<\/button>[\s\S]*Skip to Ur<\/button>/);
  });
});

describe('/play/online/ entry page', () => {
  const html = read('play/online/index.html');
  const markup = html.replace(/<!--[\s\S]*?-->/g, '');
  const script = html.match(/<script id="mode-entry">([\s\S]*?)<\/script>/)[1];

  function run({ mode = 'multiplayer', search = '', hash = '', replaceThrows = false } = {}) {
    const calls = [];
    const location = { pathname: '/play/online/', search, hash, replace(url) { calls.push(['replace', url]); } };
    const history = {
      state: null,
      replaceState(state, title, url) {
        calls.push(['replaceState', url]);
        if (replaceThrows) throw new Error('SecurityError');
        const u = new URL(url, 'https://groddle.localhost');
        location.pathname = u.pathname;
        location.search = u.search;
        location.hash = u.hash;
      },
    };
    const window = { location, history };
    const document = { documentElement: { getAttribute: (n) => (n === 'data-mode' ? mode : null) } };
    vm.runInNewContext(script, { window, document });
    return { window, location, calls };
  }

  it('declares multiplayer and strips every demo/QA param before game.js', () => {
    const { window, location, calls } = run({ search: '?autostart=1&questdemo=phantom&resetgame=1&practice=1', hash: '#top' });
    assert.equal(window.GRODDLE_MODE, 'multiplayer');
    assert.equal(resolveGameMode(window), MULTIPLAYER);
    assert.deepEqual(calls, [['replaceState', '/play/online/#top']]);
    assert.equal(location.search, '');
    assert.equal([...new URLSearchParams(location.search).keys()].length, 0, 'engine.param sees nothing');
  });

  it('does nothing to a clean URL', () => {
    const { calls } = run({ search: '' });
    assert.deepEqual(calls, []);
  });

  it('stays behind the mode flag: a solo page keeps its query', () => {
    const { window, calls } = run({ mode: 'solo', search: '?questdemo=phantom' });
    assert.equal(window.GRODDLE_MODE, 'solo');
    assert.deepEqual(calls, []);
    assert.equal(run({ mode: null, search: '?x=1' }).window.GRODDLE_MODE, 'solo');
  });

  it('reloads without the query when replaceState is refused', () => {
    const { calls } = run({ search: '?autostart=1', replaceThrows: true });
    assert.deepEqual(calls, [['replaceState', '/play/online/'], ['replace', '/play/online/']]);
  });

  it('runs first, before any other script, and never loads practice-mode', () => {
    const scripts = [...html.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]);
    assert.equal(scripts[0], '<script id="mode-entry">');
    assert.ok(html.indexOf('<script id="mode-entry">') < html.indexOf('<link'), 'ahead of every stylesheet and asset');
    assert.doesNotMatch(markup, /practice-mode\.js/);
    assert.match(html, /<html lang="en" data-mode="multiplayer">/);
    assert.match(html, /<base href="\.\.\/\.\.\/" \/>/);
  });

  it('phase 2: a sign-in gate over the game shell; game.js loads only through online-boot', () => {
    assert.match(html, /<body class="is-booting online-gated">\n\s*<!--[^\n]*-->\n\s*<main id="online-gate" class="online-gate" data-online="checking">/);
    assert.match(html, /body\.online-gated #wrap \{ display: none; \}/);
    assert.doesNotMatch(markup, /<script type="module" src="game\.js/, 'no direct game.js module');
    const boot = html.match(/<script type="module" id="online-boot" src="(js\/online-boot\.js\?v=[^"]+)" data-game="(game\.js\?[^"]+)"><\/script>/);
    assert.ok(boot, 'online-boot names game.js');
    assert.equal(boot[2], read('play/index.html').match(/<script type="module" src="(game\.js\?[^"]+)"><\/script>/)[1], 'the same game.js the solo page loads');
    assert.match(markup, /<a href="play\/">Play solo<\/a>/, 'noscript still links back to solo');
  });

  it('is generated from play/index.html and is current', () => {
    execFileSync('node', [join(import.meta.dirname, '..', 'tools/play-online/build.mjs'), '--check'], { stdio: 'pipe' });
  });
});
