/**
 * EDGE TO EDGE (Austin 2026-11-13): the play pages ask for viewport-fit=cover, so the street runs
 * under an iPhone's notch and home indicator, and the HUD at each screen edge keeps inside the safe
 * area (style.css LANDSCAPE-HUD, --safe-* = env(safe-area-inset-*), 0 on computers).
 * Browser check: Chromium's Emulation.setSafeAreaInsetsOverride gives real env() values (WebKit can't
 * fake them); the lane's QA sweep found no HUD control inside a 59 px notch on either side, the 21 px
 * home indicator sideways, or a 62 / 34 px top and bottom upright.
 * Run: node --test tests/landscape-safe-area.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { phoneStage, stageFor } from '../public/js/location-view.js?v=b178fe66';
import { STREET_GROUND_LINES } from '../public/js/street-ground-lines.js?v=ded4ee4e';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const css = read('public/style.css');
const start = css.indexOf('/* === LANDSCAPE-HUD (land1) === */');
const end = css.indexOf('/* === end LANDSCAPE-HUD === */');
const block = css.slice(start, end);
const rule = (sel) => {
  const i = block.indexOf(`${sel} {`);
  assert.ok(i >= 0, `rule for ${sel}`);
  return block.slice(i, block.indexOf('}', i));
};

/**
 * #653: the --safe-t a phone gets, from the block's rules in cascade order: each `--safe-t:` declaration
 * with the selector, @media and @supports round it, evaluated with env(safe-area-inset-top) = inset and
 * 1rem = 16 px. `c`: { portrait, standalone, ios (-webkit-touch-callout), homeClass, touch }.
 */
function safeTop(css, c, inset) {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let best = null;
  const re = /([^{};]*)\{\s*--safe-t:\s*([^;]+);/g;
  for (let m; (m = re.exec(src));) {
    const sel = m[1].trim();
    const before = src.slice(0, m.index);
    // The open @media / @supports blocks round this declaration.
    const open = [];
    for (const t of before.matchAll(/(@(?:media|supports)[^{]*)\{|\{|\}/g)) {
      if (t[1]) open.push(t[1].trim());
      else if (t[0] === '{') open.push('');
      else open.pop();
    }
    const at = open.filter(Boolean);
    const okMedia = at.every((q) => {
      if (/orientation: portrait/.test(q) && !c.portrait) return false;
      if (/display-mode: standalone/.test(q) && !c.standalone) return false;
      if (/-webkit-touch-callout/.test(q) && !c.ios) return false;
      return true;
    });
    const okSel = sel === ':root' || (sel === ':root.touch-phone' && c.touch !== false)
      || (sel === ':root.touch-phone.ios-home-app' && c.touch !== false && c.homeClass);
    if (!okMedia || !okSel) continue;
    const spec = sel.split('.').length;
    if (!best || spec >= best.spec) best = { spec, value: m[2] };
  }
  assert.ok(best, 'a --safe-t applies');
  const fog = /:root \{ --ios-fog-clear: ([^;]+); \}/.exec(css);
  const expr = best.value
    .replace(/var\(--ios-fog-clear\)/g, fog ? fog[1] : 'NaN')
    .replace(/env\(safe-area-inset-top, 0px\)/g, `${inset}px`)
    .replace(/([\d.]+)rem/g, (_, n) => `${Number(n) * 16}px`)
    .replace(/px/g, '')
    .replace(/calc\(/g, '(')
    .replace(/min\(/g, 'Math.min(');
  return Function(`return ${expr}`)();
}

describe('edge to edge on a phone', () => {
  it('both play pages cover the whole screen', () => {
    for (const page of ['public/play/index.html', 'public/play/online/index.html']) {
      assert.match(read(page), /<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" \/>/, page);
    }
  });
  it('one block, above the tickets, with the four insets as tokens', () => {
    assert.ok(start > 0 && end > start);
    const tickets = css.indexOf('/* == TICKETS ==');
    if (tickets >= 0) assert.ok(end < tickets);
    for (const side of ['top', 'right', 'bottom', 'left']) {
      assert.match(block, new RegExp(`--safe-${side[0]}: env\\(safe-area-inset-${side}, 0px\\);`));
    }
  });
  // #595 follow-up (G1177): the installed iPhone app (iOS 26+) fades its status bar past the inset,
  // over the pills. Not checkable without an iPhone: the rule's shape is.
  // G1230 (#595 again): a Safari tab fades the same way (its Liquid Glass edge), so the rule is upright, not only standalone.
  it('upright on a phone (Safari or the installed app) the top takes 14 px more, nothing else changes', () => {
    const media = '@media (orientation: portrait) {\n  :root.touch-phone { --safe-t:';
    const i = block.indexOf(media);
    assert.ok(i >= 0, 'an upright rule');
    assert.ok(!block.includes('@media (display-mode: standalone) and (orientation: portrait) {\n  :root.touch-phone { --safe-t:'), 'not only in the installed app');
    const body = block.slice(i, block.indexOf('}\n}', i) + 3);
    assert.match(body, /:root\.touch-phone \{ --safe-t: calc\(env\(safe-area-inset-top, 0px\) \+ min\(14px, env\(safe-area-inset-top, 0px\) \* 1000\)\); \}/);
    assert.doesNotMatch(body, /--safe-[rbl]/, 'only the top inset grows');
    // Outside that media rule --safe-t stays the plain inset (sideways, computers), and the
    // dark strip under the status bar is as tall as --safe-t, so it grows with it.
    const plain = block.slice(0, i);
    assert.match(plain, /:root \{\n  --safe-t: env\(safe-area-inset-top, 0px\);/);
    // The plain inset, the upright 14 px, and the Home Screen app's two hooks (#653, below).
    assert.equal((block.match(/--safe-t:/g) || []).length, 4, 'set in four places only');
    assert.match(block, /:root\.touch-phone body::before \{[^}]*height: var\(--safe-t\);/);
  });
  // #632, #653, #595: since iOS 26.1 a Home Screen web app (black-translucent, viewport-fit=cover) gets the
  // system's Liquid Glass edge over its top, about 40 px past the status bar, above the web view. Austin
  // 2026-11-24 chose clearance: in the iOS Home Screen app held upright, the top is the inset plus the fog's
  // clearance. v0.65.0 took 40 px; Austin's iPhone after it ("I think we cut off too much space up top. Can we
  // trim that some?"): 24 px now, one property (--ios-fog-clear) to tune from a device report.
  it('#653: upright in the iOS Home Screen app the top clears the fade: the inset plus 24 px (--ios-fog-clear), still 0 at inset 0', () => {
    const cases = {
      tab: { portrait: true, standalone: false, ios: true, homeClass: false },
      home: { portrait: true, standalone: true, ios: true, homeClass: false },
      homeByClass: { portrait: true, standalone: true, ios: true, homeClass: true },
      homeSideways: { portrait: false, standalone: true, ios: true, homeClass: true },
      androidApp: { portrait: true, standalone: true, ios: false, homeClass: false },
      computer: { portrait: false, standalone: false, ios: false, homeClass: false, touch: false },
    };
    const want = {
      tab: [62 + 14, 0], home: [62 + 24, 0], homeByClass: [62 + 24, 0],
      homeSideways: [62, 0], androidApp: [62 + 14, 0], computer: [62, 0],
    };
    for (const [name, c] of Object.entries(cases)) {
      for (const [k, inset] of [[0, 62], [1, 0]]) {
        assert.equal(safeTop(block, { touch: true, ...c }, inset), want[name][k], `${name} at inset ${inset}`);
      }
    }
    const i = block.indexOf('@media (orientation: portrait) and (display-mode: standalone) {');
    assert.ok(i > block.indexOf('min(14px'), 'after the 14 px rule, so it wins in the app');
    const note = block.slice(block.lastIndexOf('/*', i), i).replace(/\s+/g, ' ');
    for (const w of ['iOS 26.1', 'Liquid Glass', 'cannot turn it off', 'Austin', '2026-11-24', 'Not checked on an iPhone', 'cut off too much space up top']) assert.ok(note.includes(w), w);
    // One value to tune: set once, read by both Home Screen hooks and nowhere else.
    assert.equal((css.match(/--ios-fog-clear:/g) || []).length, 1, 'declared once');
    assert.match(block, /:root \{ --ios-fog-clear: 24px; \}/);
    assert.equal((block.match(/min\(var\(--ios-fog-clear\), env\(safe-area-inset-top, 0px\) \* 1000\)/g) || []).length, 2, 'both hooks read it');
    assert.doesNotMatch(block, /min\(2\.5rem/, 'no 40 px clearance left');
  });
  // The same report: the street started at about 130 px on a 402 x 874 iPhone, under the pills. The app's
  // screen is taller than a Safari tab's, so phoneStage's width floor (560) held the street with a dark band
  // over it. In the app the strip's bottom is --stage-top, and a held street reaches up to it.
  it('#653: in the Home Screen app a held street reaches up to the dark strip, not down past the pills', () => {
    // --stage-top only beside the two Home Screen hooks' --safe-t (so a Safari tab, sideways and computers keep 0).
    const tops = [...css.matchAll(/--stage-top:\s*([^;]+);/g)].map((m) => m[1]);
    assert.deepEqual(tops, ['var(--safe-t)', 'var(--safe-t)']);
    for (const m of block.matchAll(/\{ --safe-t: calc\(env\(safe-area-inset-top, 0px\) \+ min\(var\(--ios-fog-clear\)[^}]*\}/g)) assert.match(m[0], /--stage-top: var\(--safe-t\);/);
    const game = read('public/game.js');
    assert.match(game, /topBand: dock \? 0 : phoneTopBand\(\),/);
    assert.match(game, /height:var\(--stage-top,0px\)/);
    // Awasa Wash at 402 x 874 (Austin's screenshot): the canvas started at 132 px, the strip ended at 102.
    const W = 402;
    const H = 874;
    const strip = 62 + 24;
    const awasa = { width: W, height: H, sceneHeight: 980, groundLine: STREET_GROUND_LINES.GHFET4I773D2OUU, phone: true };
    const tab = stageFor(awasa);
    assert.equal(Math.round(H - tab.cssHeight), 132, 'a Safari tab keeps its band (unchanged)');
    const app = stageFor({ ...awasa, topBand: strip });
    assert.ok(Math.abs(H - app.cssHeight - strip) < 1, `the street starts at the strip's bottom (${(H - app.cssHeight).toFixed(1)} px)`);
    assert.ok(app.viewW >= Math.floor(560 * (H - strip) / H), `the view narrows by the strip's share at most (${app.viewW})`);
    // A tall street already fills the screen: the strip changes nothing.
    assert.deepEqual(stageFor({ ...awasa, sceneHeight: 1000, groundLine: undefined, height: 700, topBand: strip }), stageFor({ ...awasa, sceneHeight: 1000, groundLine: undefined, height: 700 }));
    // A short room keeps a band (shorter), never a keyhole view.
    const room = phoneStage({ width: W, height: H, sceneHeight: 408, topBand: strip });
    assert.ok(H - room.cssHeight > strip, 'a short room still has a band');
    assert.ok(room.viewW >= Math.floor(560 * (H - strip) / H), `the room's view stays wide (${room.viewW})`);
    // Sideways the strip is 0 and the stage is the landscape rule anyway.
    assert.deepEqual(stageFor({ ...awasa, width: H, height: W, topBand: strip }), stageFor({ ...awasa, width: H, height: W }));
  });
  it('#653: navigator.standalone (iOS only) sets the class hook; layout C reads --safe-t resolved to px', () => {
    const tc = read('public/js/touch-controls.js');
    assert.match(tc, /if \(win\?\.navigator\?\.standalone === true\) doc\.documentElement\.classList\.add\('ios-home-app'\);/);
    assert.match(tc, /classList\.remove\('touch-phone', 'ios-home-app'\)/);
    // A custom property's computed value is its calc() unresolved: parseFloat read 0 and the notices sat over the pills.
    const pl = read('public/js/ui/phone-layout.js');
    assert.doesNotMatch(pl, /getPropertyValue\(n\)/);
    assert.match(pl, /padding:var\(--safe-t,0px\) var\(--safe-r,0px\) var\(--safe-b,0px\) var\(--safe-l,0px\)/);
  });
  it('the top bar, the name, the drawer, the pack, the buffs and the route card keep inside it', () => {
    const bar = rule('html:not(.stage-pinned)[data-ui="modern"] #wrap > .top-bar');
    assert.match(bar, /top: calc\(var\(--space-1\) \+ var\(--safe-t\)\)/);
    assert.match(bar, /left: calc\(var\(--hud-inset\) \+ var\(--safe-l\)\)/);
    assert.match(bar, /right: calc\(var\(--hud-inset\) \+ var\(--safe-r\)\)/);
    assert.match(rule('[data-ui="modern"] .street-nameplate'), /var\(--safe-t\)/);
    assert.match(rule('[data-ui="modern"] .street-nameplate.is-placed.is-under'), /var\(--safe-t\)/);
    assert.match(rule('[data-ui="modern"] .local-chat-dock.social-drawer'), /right: calc\(var\(--hud-inset, 8px\) \+ var\(--safe-r\)\)/);
    const pack = rule('[data-ui="modern"] #game-root .pack-bar:not([data-hb-dock])');
    assert.match(pack, /bottom: var\(--safe-b\)/);
    assert.match(pack, /padding-left: max\(calc\(var\(--pack-inset\) \+ var\(--safe-l\)\), var\(--pack-clear-l, 0px\)\)/);
    assert.match(pack, /padding-right: max\(calc\(var\(--pack-inset\) \+ var\(--safe-r\)\), var\(--pack-clear-r, 0px\)\)/);
    assert.match(rule('[data-ui="modern"] #game-root:not([data-sheet]) #buff-strip'), /left: calc\(var\(--hud-inset\) \+ var\(--safe-l\)\)/);
    assert.match(rule('[data-ui="modern"] #game-root .route-gps'), /right: max\(calc\(var\(--hud-inset\) \+ var\(--safe-r\)\), var\(--inset-r\)\)/);
  });
  it('the stick, Jump and the prompts over them already add the insets', () => {
    assert.match(css, /\.touch-stick \{[^}]*left: max\(var\(--sp-4\), env\(safe-area-inset-left, 0px\)\)/);
    assert.match(css, /\.touch-jump \{[^}]*right: max\(var\(--sp-6\), env\(safe-area-inset-right, 0px\)\)/);
    assert.match(css, /\.touch-controls \{[^}]*bottom: calc\(var\(--pack-live-height, 72px\) \+ env\(safe-area-inset-bottom, 0px\)\)/);
  });
});
