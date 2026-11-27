/**
 * #401 (iPhone Home Screen app): a way into the Encyclopedia took the app's one window out of the
 * game. There, and only there, it opens in a sheet over the game (js/ui/encyclopedia-sheet.js); a
 * browser tab keeps the client's own window (js/encyclopedia-links.js, TSFrontController.as 4398).
 * Run: node --test tests/r401-encyclopedia-home-screen.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHEET_TEXT, isHomeScreenApp, sheetLinkPlan } from '../public/js/ui/encyclopedia-sheet.js?v=ea3b0ad5';
import { createEncyclopedia } from '../public/js/encyclopedia-links.js?v=b2caa8de';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const game = readFileSync(join(ROOT, 'game.js'), 'utf8');
const sheetSrc = readFileSync(join(ROOT, 'js/ui/encyclopedia-sheet.js'), 'utf8');

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5.2 Mobile/15E148 Safari/604.1';
const win = ({ standalone, ua = IPHONE, displayMode = false, search = '' } = {}) => ({
  location: { search },
  navigator: { standalone, userAgent: ua, platform: 'iPhone', maxTouchPoints: 5 },
  matchMedia: (q) => ({ matches: displayMode && q === '(display-mode: standalone)' }),
});

describe('#401: the Encyclopedia from a Home Screen app', () => {
  it('only an iPhone or iPad Home Screen app counts (navigator.standalone, or iOS in standalone display)', () => {
    assert.equal(isHomeScreenApp(win({ standalone: true })), true);
    assert.equal(isHomeScreenApp(win({ standalone: false, displayMode: true })), true, 'a manifest app on iOS');
    assert.equal(isHomeScreenApp(win({ standalone: false })), false, 'Safari in a tab');
    assert.equal(isHomeScreenApp(win({ standalone: undefined, ua: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/140', displayMode: true })), false, 'an installed desktop app keeps its new window');
    assert.equal(isHomeScreenApp(win({ standalone: undefined, ua: 'Mozilla/5.0 (Windows NT 10.0) Firefox/157.0', search: '?homescreen=1' })), true, 'the QA switch');
    assert.equal(isHomeScreenApp(null), false);
  });

  it("the sheet's own links: pages stay in it, a play page goes back to the game, another site leaves the app", () => {
    const at = { origin: 'https://groddleafternoon.com', playRoot: 'https://groddleafternoon.com/play/' };
    assert.equal(sheetLinkPlan('https://groddleafternoon.com/encyclopedia/items/cherry/', at), 'frame');
    assert.equal(sheetLinkPlan('https://groddleafternoon.com/changelog/', at), 'frame');
    assert.equal(sheetLinkPlan('https://groddleafternoon.com/play/online/', at), 'game', 'never a second game in the frame');
    assert.equal(sheetLinkPlan('https://example.org/x', at), 'out');
    assert.equal(sheetLinkPlan('mailto:a@b.c', at), '');
    assert.equal(sheetLinkPlan('not a url', at), '');
  });

  it('createEncyclopedia opens through the sheet when given it: now, or once the index answers', async () => {
    const shown = [];
    const handle = { closed: false, focus() {}, location: { set href(u) { shown.push(`later ${u}`); } } };
    const ency = createEncyclopedia({
      fetchJson: async () => ({ entries: [{ s: 'items', id: 'cherry', n: 'Cherry', h: 'encyclopedia/items/cherry/' }] }),
      openWindow: (url) => { shown.push(`open ${url}`); return handle; },
      resolve: (h) => `https://g.test/${h}`,
      wait: 50,
    });
    assert.equal(ency.open(null), 'https://g.test/encyclopedia/');
    await ency.open({ id: 'cherry', name: 'Cherry' });
    assert.deepEqual(shown, ['open https://g.test/encyclopedia/', 'open ', 'later https://g.test/encyclopedia/items/cherry/']);
  });

  it('game.js uses the sheet only in a Home Screen app, for the Menu row, i and the links (one rule since #741, js/site-pages.js)', () => {
    assert.match(game, /const sitePageSheet = isHomeScreenApp\(window\) \? createEncyclopediaSheet\(/);
    assert.match(game, /setSitePageViewer\(\(url, opts\) => sitePageSheet\.open\(url, opts\)\);\n\s*catchSiteLinks\(window\);/);
    // createEncyclopedia opens through openSitePage, which is the sheet once the viewer is set; its links are caught as every site link.
    assert.match(readFileSync(join(ROOT, 'js/encyclopedia-links.js'), 'utf8'), /openWindow = \(url, name\) => openSitePage\(url, \{ name, features: '' \}\)/);
    assert.doesNotMatch(sheetSrc, /catchLinks/);
  });

  it('the sheet never adds to the app\'s history, and gives a way back to the game', () => {
    assert.match(sheetSrc, /frame\.contentWindow\.location\.replace\(current\)/);
    assert.doesNotMatch(sheetSrc, /history\.(back|go|pushState)/);
    assert.equal(SHEET_TEXT.close, 'Back to the game');
    // Its colours, sizes and layer are the game's tokens.
    const css = sheetSrc.slice(sheetSrc.indexOf('const CSS = `'), sheetSrc.indexOf('`;', sheetSrc.indexOf('const CSS = `')));
    assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|rgba?\(|font-size: \d|z-index: \d/i);
    assert.match(css, /z-index: var\(--z-viewer\)/);
  });
});
