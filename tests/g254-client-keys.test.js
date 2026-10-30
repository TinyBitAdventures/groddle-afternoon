/**
 * G254 (lane KEYS): the client's keys the remake still lacked. TSMainView.as
 * startListeningtoKeys 639-661 registers M (mKeyHandler 733-741), Shift+L
 * (shiftLKeyHandler 980-994), Shift+D (shiftDKeyHandler 831-844), Shift+F and
 * backquote (shiftFKeyHandler 846-855), Shift+K (shiftKKeyHandler 962-978),
 * Shift+M (shiftMKeyHandler 925-940), Shift+/ (shiftSlashKeyHandler 942-960),
 * I (iKeyHandler 870-891), Z (zKeyHandler 1031-1042) and comma
 * (commaKeyHandler 806-814). The remake answers M (map, G kept), Z (player
 * menu), Shift+L (looks), Shift+K (multiplayer keyring), Shift+D (decorate where
 * you can), Shift+F and backquote (the pack's search, phase 2) and holding ? (the
 * hotkey sheet, view/ui/Hotkeys.as + hotkeys.png) and comma (Preferences,
 * js/classic/classic-prefs.js); I and Shift+M have no
 * panel here and stay unbound.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTokens } from './css-tokens.js';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CLIENT_KEY_TABLE,
  HOTKEYS_FOOTER,
  HOTKEYS_TITLE,
  clientKeyAction,
  createHotkeysSheet,
  hotkeySections,
  hotkeyText,
  isHotkeySheetRelease,
  isPlainKey,
} from '../public/js/client-hotkeys.js?v=b45e776c';

const here = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(here, '../public');
const read = (p) => readFileSync(join(PUBLIC, p), 'utf8');
const CLIENT = join(here, '../../glitch-client');
const MAIN_VIEW = join(CLIENT, 'com/tinyspeck/engine/view/TSMainView.as');
const noClient = !existsSync(MAIN_VIEW) && 'no client checkout';

const key = (k, mods = {}) => ({ key: k, code: '', shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, ...mods });

function keyBlock(game) {
  const start = game.indexOf("window.addEventListener('keydown', (e) => {\n    if (e.target?.matches?.('input, textarea, select, [contenteditable=\"true\"]')) {");
  assert.ok(start > 0, 'main keydown handler');
  return game.slice(start, game.indexOf("window.addEventListener('keyup'", start));
}

describe('G254: the client key table', () => {
  it('TSMainView registers each key with the handler the table names', { skip: noClient }, () => {
    const src = readFileSync(MAIN_VIEW, 'utf8');
    const reg = {
      M: 'KEY_DOWN_+Keyboard.M, mKeyHandler',
      'Shift+L': 'SHIFT_PLUS_+KeyBeacon.KEY_DOWN_+Keyboard.L, shiftLKeyHandler',
      'Shift+D': 'SHIFT_PLUS_+KeyBeacon.KEY_DOWN_+Keyboard.D, shiftDKeyHandler',
      'Shift+F': 'SHIFT_PLUS_+KeyBeacon.KEY_DOWN_+Keyboard.F, shiftFKeyHandler',
      '`': 'KEY_DOWN_+Keyboard.BACKQUOTE, shiftFKeyHandler',
      'Shift+K': 'SHIFT_PLUS_+KeyBeacon.KEY_DOWN_+Keyboard.K, shiftKKeyHandler',
      'Shift+M': 'SHIFT_PLUS_+KeyBeacon.KEY_DOWN_+Keyboard.M, shiftMKeyHandler',
      'Shift+/': 'SHIFT_PLUS_+KeyBeacon.KEY_DOWN_+Keyboard.SLASH, shiftSlashKeyHandler',
      I: 'KEY_DOWN_+Keyboard.I, iKeyHandler',
      Z: 'KEY_DOWN_+Keyboard.Z, zKeyHandler',
      ',': 'KEY_DOWN_+Keyboard.COMMA, commaKeyHandler',
    };
    assert.deepEqual(CLIENT_KEY_TABLE.map((row) => row.key).sort(), Object.keys(reg).sort());
    for (const row of CLIENT_KEY_TABLE) {
      assert.ok(src.includes(`KeyBeacon.instance.addEventListener(KeyBeacon.${reg[row.key]})`), row.key);
      assert.ok(reg[row.key].endsWith(row.handler), row.key);
    }
    // The handlers' targets: the hub map, the looks cloud, decorator mode, the keyring,
    // the hotkey sheet and the player menu (the ones the remake answers).
    assert.match(src, /mKeyHandler[\s\S]{0,400}TSFrontController\.instance\.toggleHubMapDialog\(\);/);
    assert.match(src, /shiftLKeyHandler[\s\S]{0,600}Cloud\.TYPE_YOUR_LOOKS/);
    assert.match(src, /if ?\(model\.stateModel\.decorator_mode\) \{\s+SoundMaster\.instance\.playSound\('CLICK_SUCCESS'\);\s+TSFrontController\.instance\.stopDecoratorMode\(\);\s+\} else \{\s+TSFrontController\.instance\.startDecoratorMode\(\);/);
    assert.match(src, /if ?\(!ACLDialog\.instance\.parent\)\{\s+ACLDialog\.instance\.start\(\);\s+\}\s+else \{\s+ACLDialog\.instance\.end\(true\);/);
    assert.match(src, /Hotkeys\.instance\.show\(\);\s+KeyBeacon\.instance\.addEventListener\(KeyBeacon\.KEY_UP_\+Keyboard\.SHIFT, shiftSlashKeyHandler/);
    assert.match(src, /zKeyHandler[\s\S]{0,400}TSFrontController\.instance\.togglePlayerMenu\(\);/);
    assert.match(src, /shiftFKeyHandler[\s\S]{0,400}\/\/inventory search\s+YouDisplayManager\.instance\.pack_tabber\.showInventorySearch\(\);/);
    // Every one of them returns while a text field has focus.
    for (const h of ['mKeyHandler', 'shiftLKeyHandler', 'shiftDKeyHandler', 'shiftKKeyHandler', 'shiftSlashKeyHandler', 'zKeyHandler']) {
      const at = src.indexOf(`private function ${h}(`);
      assert.match(src.slice(at, at + 500), /if \(checkAndCorrectIfInputFieldIsStageFocus\(\)\) return;/, h);
    }
  });

  it('KeyBeacon sends a shifted letter as SHIFT_PLUS_ only, never the plain key too', { skip: noClient }, () => {
    const src = readFileSync(join(CLIENT, 'com/tinyspeck/core/beacon/KeyBeacon.as'), 'utf8');
    const fire = src.slice(src.indexOf('private function _keyDownFire'), src.indexOf('private function _keyDownRepeatFire'));
    assert.match(fire, /var ck:String = KeyBeacon\.KEY_DOWN_\+k;[\s\S]*ck = KeyBeacon\.SHIFT_PLUS_\+ck;/);
    assert.match(fire, /if \(hasEventListener\(ck\)\) dispatchEvent\(getEvent\(ck, k\)\);/);
  });

  it('the hotkey sheet: a 40% black shade over the game, 0.1 s fades, the art', { skip: noClient }, () => {
    const src = readFileSync(join(CLIENT, 'com/tinyspeck/engine/view/ui/Hotkeys.as'), 'utf8');
    assert.match(src, /private static const ANI_TIME:Number = \.1;/);
    assert.match(src, /g\.beginFill\(0, \.4\);/);
    assert.match(src, /asset = new AssetManager\.instance\.assets\.hotkeys\(\);/);
    assert.ok(existsSync(join(CLIENT, 'TSEngineAssets/src/assets/graphics/hotkeys.png')));
  });
});

describe('G254: clientKeyAction', () => {
  it('answers the bound keys and nothing for the ones with no panel', () => {
    const cases = [
      [key('m'), 'map'], [key('M'), 'map'],
      [key('z'), 'player-menu'],
      [key('L', { shiftKey: true }), 'looks'],
      [key('K', { shiftKey: true }), 'keyring'],
      [key('D', { shiftKey: true }), 'decorate'],
      [key('?', { shiftKey: true, code: 'Slash' }), 'hotkeys'],
      [key('/', { shiftKey: true, code: 'Slash' }), 'hotkeys'],
      [key(','), 'preferences'], [key('i'), null],
      [key('`'), 'pack-search'], [key('F', { shiftKey: true }), 'pack-search'],
      [key('f'), null], [key('~', { shiftKey: true, code: 'Backquote' }), null],
      [key('M', { shiftKey: true }), null],
      [key('Z', { shiftKey: true }), null],
      [key('l'), null], [key('k'), null], [key('d'), null],
    ];
    for (const [e, want] of cases) assert.equal(clientKeyAction(e), want, JSON.stringify(e));
    for (const row of CLIENT_KEY_TABLE) {
      if (row.action) continue;
      assert.ok(row.why, `${row.key} says why it is unbound`);
    }
  });

  it('browser shortcuts are never the game\'s (Cmd+, Ctrl+Z, Alt+M)', () => {
    assert.equal(clientKeyAction(key(',', { metaKey: true })), null);
    assert.equal(clientKeyAction(key('z', { ctrlKey: true })), null);
    assert.equal(clientKeyAction(key('m', { altKey: true })), null);
    assert.equal(clientKeyAction(key('?', { shiftKey: true, metaKey: true })), null);
    assert.equal(isPlainKey(key('m', { metaKey: true }), 'm'), false);
    assert.equal(isPlainKey(key('M'), 'm'), true, 'caps lock');
    assert.equal(isPlainKey(key('M', { shiftKey: true }), 'm'), false);
  });

  it('the sheet goes when ? or Shift comes up', () => {
    for (const k of ['?', '/', 'Shift']) assert.equal(isHotkeySheetRelease({ key: k }), true, k);
    assert.equal(isHotkeySheetRelease({ key: 'a' }), false);
  });
});

describe('G254: the hotkey sheet lists only keys the remake answers', () => {
  it('the client\'s title, sections and footer', () => {
    assert.equal(HOTKEYS_TITLE, 'Hotkeys and Shortcuts');
    assert.equal(HOTKEYS_FOOTER, "Open this list by holding the '?' Key.");
    assert.deepEqual(hotkeySections().map((s) => s.title), ['Menus', 'Interface', 'Modes', 'Emotions', 'View']);
  });

  it('no row for a key with no panel; the keyring row only with a keyring', () => {
    const text = (opts) => hotkeySections(opts).flatMap((s) => s.rows.map(([label, alts]) => `${label}: ${hotkeyText(alts)}`));
    const solo = text();
    const mp = text({ keyring: true });
    assert.ok(solo.includes('Show Map: M or G'));
    assert.ok(solo.includes('Player Menu: Z'));
    assert.ok(solo.includes('Looks: L or Shift+L'));
    assert.ok(solo.includes('Decorate Mode: Shift+D'));
    assert.ok(!solo.some((row) => row.startsWith('Key Ring')));
    assert.ok(mp.includes('Key Ring: Shift+K'));
    const all = mp.join('\n');
    assert.ok(solo.includes('Inventory Search: Shift+F or `'), 'hotkeys.png: Inventory Search: Shift+F');
    assert.ok(solo.includes('Preferences: ,'), 'commaKeyHandler: Preferences (js/classic/classic-prefs.js)');
    // ZOOM: the remake answers the client's zoom keys now (TSFrontController.as startListeningToZoomKeys
    // 3181-3192: 0, minus, equal), with its own world zoom (js/world-zoom.js).
    assert.ok(solo.includes('Zoom In: =') && solo.includes('Zoom Out: -') && solo.includes('Zoom to Original: 0'));
    for (const gone of [/Info-getting/, /Shift\+M/, /\bI\b$/m]) {
      assert.doesNotMatch(all, gone);
    }
    assert.doesNotMatch(all, /—/, 'no em-dashes in player copy');
  });

  it('builds once and shows, hides and adds the keyring row live', () => {
    const doc = fakeDocument();
    let keyring = false;
    const sheet = createHotkeysSheet(doc, { keyring: () => keyring });
    assert.equal(sheet.isOpen(), false);
    sheet.show();
    assert.equal(sheet.isOpen(), true);
    assert.equal(doc.body.children.length, 1);
    const shade = doc.body.children[0];
    assert.equal(shade.id, 'hotkeys-shade');
    assert.match(shade.text(), /Hotkeys and Shortcuts/);
    assert.doesNotMatch(shade.text(), /Key Ring/);
    sheet.hide();
    assert.equal(sheet.isOpen(), false);
    keyring = true;
    sheet.show();
    assert.equal(doc.body.children.length, 1, 'one sheet, reused');
    assert.match(shade.text(), /Key Ring: Shift\+K/);
  });
});

describe('G254: game.js wiring', () => {
  const game = read('game.js');
  const keys = keyBlock(game);

  it('imports the module under one key, and nothing else imports it under another', () => {
    assert.match(game, /from '\.\/js\/client-hotkeys\.js\?v=[0-9a-f]{8}';/);
    const keysUsed = new Set([...game.matchAll(/client-hotkeys\.js\?v=([\w-]+)/g)].map((m) => m[1]));
    assert.equal(keysUsed.size, 1);
  });

  it('typing in a field never reaches the new keys', () => {
    const guard = keys.indexOf("if (e.target?.matches?.('input, textarea, select, [contenteditable=\"true\"]')) {");
    assert.equal(guard > 0, true);
    for (const use of ["clientKeyAction(e) === 'hotkeys'", 'clientShortcutKey(e)', "isPlainKey(e, 'm')"]) {
      assert.ok(keys.indexOf(use) > guard, use);
    }
    assert.match(keys.slice(guard, guard + 220), /return;\s+\}/);
  });

  it('? before dialogs and panels; Z, Shift+L/K/D after Shift+T and before F', () => {
    const sheet = keys.indexOf("clientKeyAction(e) === 'hotkeys'");
    assert.ok(sheet > keys.indexOf('if (!state.started) return;'));
    assert.ok(sheet < keys.indexOf('if (isQuestDialogueOpen()) return;'));
    const shiftT = keys.indexOf("if (e.shiftKey && (e.key === 't' || e.key === 'T')) {");
    const client = keys.indexOf('if (clientShortcutKey(e)) return;');
    const apple = keys.indexOf("if (e.key === 'f' || e.key === 'F') eatApple();");
    assert.ok(shiftT > 0 && client > shiftT && apple > client);
  });

  it('M opens and closes the map beside G, not while Gentle Island hides it', () => {
    assert.match(keys, /if \(e\.key === 'g' \|\| e\.key === 'G' \|\| isPlainKey\(e, 'm'\)\) closeMap\(\);/);
    assert.match(keys, /if \(e\.key === 'g' \|\| e\.key === 'G' \|\| isPlainKey\(e, 'm'\)\) \{[\s\S]{0,400}if \(!document\.body\.classList\.contains\('nx-hide-map'\)\) openMap\(\);/);
  });

  it('Shift+K and Shift+L never close a panel the plain keys close', () => {
    assert.match(keys, /if \(isPlainKey\(e, 'k'\)\) closeSkillsPanel\(\);/);
    assert.match(keys, /if \(isPlainKey\(e, 'l'\)\) closeAvatarPanel\(\);/);
    assert.doesNotMatch(keys, /e\.key === 'k' \|\| e\.key === 'K'\) closeSkillsPanel/);
  });

  it('clientShortcutKey: player menu, looks, keyring, decorate (falls back to walking)', () => {
    const fn = game.slice(game.indexOf('function clientShortcutKey(e) {'), game.indexOf('function installPlayerMenu() {'));
    assert.match(fn, /action === 'player-menu'[\s\S]{0,300}getElementById\('player-menu-btn'\)[\s\S]{0,200}nx-hide-mood/);
    assert.match(fn, /action === 'looks'\) \{\s+if \(!e\.repeat && !isAvatarOpen\(\)\) openAvatarPanel\(\);/);
    assert.match(fn, /action === 'keyring'[\s\S]{0,300}getElementById\('keys-shade'\)[\s\S]{0,200}\.keys-close[\s\S]{0,120}getElementById\('keys-btn'\)\?\.click\(\)/);
    const dec = fn.slice(fn.indexOf("action === 'decorate'"));
    assert.match(dec, /features\.query\('homeEditMode', engine\)/);
    assert.match(dec, /if \(!close && !shownElement\(open\)\) return false;/, 'away from a room you can decorate, Shift+D still walks');
    assert.match(dec, /keys\.delete\('d'\);\s+keys\.delete\('D'\);/);
    assert.match(dec, /playSound\('CLICK_SUCCESS'/);
    // The ids it clicks are homes-feature's own.
    const homes = read('js/features/homes-feature.js');
    assert.match(homes, /id: 'homes-decorate-btn'/);
    assert.match(homes, /id: 'homes-bar'/);
    assert.match(homes, /class: 'hb-close'/);
    assert.match(homes, /homeEditMode\(\) \{/);
    const mp = read('js/features/neighbours-mp-feature.js');
    assert.match(mp, /id: 'keys-shade'/);
    assert.match(mp, /id: 'keys-btn'/);
    assert.match(mp, /class: 'keys-close'/);
  });

  it('the sheet hides on keyup, after the held keys are cleared', () => {
    assert.match(game, /keys\.delete\(e\.key\.toUpperCase\(\)\);\s+\}\s+\/\/ G254[^\n]*\n\s+if \(hotkeysSheet\.isOpen\(\) && isHotkeySheetRelease\(e\)\) hotkeysSheet\.hide\(\);/);
  });

  it('style.css draws the sheet in the art\'s colours; the page names the new keys', () => {
    const css = resolveTokens(read('style.css'));
    const at = css.indexOf('.hotkeys-shade {');
    assert.ok(at > 0);
    assert.match(css.slice(at, css.indexOf('}', at)), /background: rgba\(0, 0, 0, 0\.4\);/);
    assert.match(css, /\.hotkeys-section b \{ color: #9ccc1c; \}/);
    const html = read('play/index.html');
    assert.match(html, /href="style\.css\?v=[0-9a-f]{8}"/);
    assert.match(html, /src="game\.js\?v=[0-9a-f]{8}"/);
    assert.match(html, /<kbd>M<\/kbd> or <kbd>G<\/kbd> map ·/);
    assert.match(html, /<kbd>Z<\/kbd> player menu ·/);
    assert.match(html, /hold <kbd>\?<\/kbd> for every key/);
    // The modern bar's Map button: its key cap and tooltip (js/ui/topbar.js).
    assert.match(html, /id="map-btn"[^>]*data-sub="G opens it too" data-key="M" aria-label="Map \(M or G\)"/);
  });
});

/** Just enough DOM for createHotkeysSheet. */
function fakeDocument() {
  class Node {
    constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.hidden = false; this._text = ''; }
    get firstChild() { return this.children[0] || null; }
    set textContent(v) { this._text = String(v); this.children = []; }
    get textContent() { return this.text(); }
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.children = nodes; }
    setAttribute(k, v) { this.attrs[k] = v; }
    text() { return this._text + this.children.map((c) => c.text()).join(''); }
  }
  class TextNode { constructor(t) { this.t = t; } text() { return this.t; } }
  return {
    body: new Node('body'),
    createElement: (tag) => new Node(tag),
    createTextNode: (t) => new TextNode(t),
  };
}
