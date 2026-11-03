/**
 * The zoom keys, said where a player looks (player report on v0.7.0: "If I hit
 * the zero key the zoom goes back to Original. Is there a way to re-zoom out
 * on the keyboard, without opening the hamburger menu?").
 *
 * The keys were there (js/world-zoom.js zoomKeyAction: = or + closer, - wider,
 * 0 back to Original; the 2012 client's own, TSFrontController.as
 * startListeningToZoomKeys 3181-3192), but only the hold-? sheet and the
 * Zoomability card (newxp.js) said so. Now every Zoom slider (the Menu, the
 * Sound popover, Preferences) has the keys under it, and 0 says where it went
 * and the way back out.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ZOOM_KEYS_HINT, createWorldZoom, nextZoom, zoomKeyAction, zoomKeyToast } from '../public/js/world-zoom.js?v=b262a6c7';
import { zoomSlider } from '../public/js/ui/topbar.js?v=bd95d674';
import { hotkeySections, hotkeyText } from '../public/js/client-hotkeys.js?v=87795519';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, 'public', rel), 'utf8');

/** Just enough DOM for zoomSlider. */
function fakeDoc() {
  const make = (tag) => {
    const node = {
      tagName: tag.toUpperCase(), children: [], attrs: {}, dataset: {}, listeners: {}, textContent: '', innerHTML: '', className: '', id: '',
      append(...kids) { this.children.push(...kids); },
      setAttribute(k, v) { this.attrs[k] = String(v); },
      getAttribute(k) { return this.attrs[k] ?? null; },
      addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
    };
    return node;
  };
  return { activeElement: null, createElement: make };
}

describe('the zoom keys under the slider', () => {
  it('says the keys in plain words', () => {
    assert.equal(ZOOM_KEYS_HINT, 'Keys: - out, = in, 0 Original');
    assert.doesNotMatch(ZOOM_KEYS_HINT, /—|Glitch/);
  });

  it('the Menu and Sound sliders show it under the slider, and the slider names it for screen readers', () => {
    const zoom = createWorldZoom({ win: null, storage: null });
    for (const [id, where] of [['menu-zoom', 'menu'], ['sound-zoom', 'sound']]) {
      const { row, input } = zoomSlider(fakeDoc(), zoom, { id, where });
      const hint = row.children.find((n) => n.className === 'hud-zoom-keys');
      assert.ok(hint, `${where}: a hint row`);
      assert.equal(hint.textContent, ZOOM_KEYS_HINT);
      assert.equal(hint.id, `${id}-keys`);
      assert.equal(row.children.at(-1), hint, 'last, under the slider and its ends');
      assert.equal(input.getAttribute('aria-describedby'), `${id}-ends ${id}-keys`);
    }
  });

  it('Preferences (both skins) shows it too, and the modern sheet styles it', () => {
    const prefs = read('js/classic/classic-prefs.js');
    assert.match(prefs, /el\(doc, 'p', \{ id: 'prefs-zoom-keys', class: 'prefs-note prefs-zoom-keys' \}, ZOOM_KEYS_HINT\)/);
    assert.match(prefs, /'aria-describedby': 'prefs-zoom-ends prefs-zoom-keys'/);
    assert.match(read('style.css'), /\[data-ui="modern"\] \.hud-zoom-keys \{ grid-column: 1 \/ -1;/);
  });
});

describe('0 says where it went and the way back out', () => {
  it('only 0 has a notice', () => {
    assert.equal(zoomKeyToast('reset'), 'Zoom: Original (press - to zoom out)');
    assert.equal(zoomKeyToast('in'), '');
    assert.equal(zoomKeyToast('out'), '');
    assert.equal(zoomKeyToast(null), '');
    assert.doesNotMatch(zoomKeyToast('reset'), /—|Glitch/);
  });

  it('game.js shows it once per press (not on a held key)', () => {
    const game = read('game.js');
    assert.match(game, /const said = e\.repeat \? '' : zoomKeyToast\(zoomKey\);\n\s*if \(said\) toast\(said, 3000\);/);
  });

  it('and - does take you back out from Original', () => {
    assert.equal(zoomKeyAction({ key: '-' }), 'out');
    assert.equal(nextZoom(nextZoom(0.4, 'reset'), 'out'), 0.9);
  });
});

describe('= and + both zoom in', () => {
  it('+ with or without Shift, = on its own; Ctrl or Cmd stays the browser\'s', () => {
    assert.equal(zoomKeyAction({ key: '=' }), 'in');
    assert.equal(zoomKeyAction({ key: '+', shiftKey: true }), 'in');
    assert.equal(zoomKeyAction({ key: '+' }), 'in', 'a numpad + or a layout with its own + key');
    assert.equal(zoomKeyAction({ key: '+', ctrlKey: true }), null);
    assert.equal(zoomKeyAction({ key: '-', metaKey: true }), null);
  });

  it('the hold-? sheet lists both', () => {
    const view = hotkeySections().find((s) => s.title === 'View');
    const rows = Object.fromEntries(view.rows.map(([label, alts]) => [label, hotkeyText(alts)]));
    assert.equal(rows['Zoom In'], '= or +');
    assert.equal(rows['Zoom Out'], '-');
    assert.equal(rows['Zoom to Original'], '0');
  });
});
