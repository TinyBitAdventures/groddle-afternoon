/**
 * PHONE LAYOUT (G1194, root R1; Austin 2026-11-23: direction C, Glitch-like compact): the phone's
 * HUD in named regions with one layout pass (js/ui/phone-layout.js). The street pill, the growing
 * actions pill, notices over the pills and sheets over the controls were R1's overlaps; here:
 * - the regions never overlap at 375x667, 402x812 and 812x402 in every sheet state (pure, and in
 *   Chrome on the real game: every piece measured, every pair checked);
 * - the pill holds four fixed icons (Full screen, Report a problem, Social, the Menu) and cannot grow:
 *   a button added to it does not show, Quests is a Menu row;
 * - the pinned quest stands over the stick upright and beside it sideways, clear of its ring;
 * - a sheet, the Social drawer and an open bag dock the stage (engine.setStageDock, owners);
 * - notices keep to their region (js/notify-view.js `region`);
 * - #595: nothing in the top row or the caption is cut (an ellipsis, or text wider than its box)
 *   with big counts at 360 to 402 px wide, and in the tutorial the pill is only as wide as its icons;
 * - #635: an open bag keeps every slot (and a long count) inside its tray at 360x629;
 * - #5: the verb menu and the chooser keep off the stick, Act and Jump, Act taps open and choose
 *   every time, and favor on the caption takes a real touch tap (a 44 px tall hit area);
 * - the chooser stands in the street above the controls (between the stick and Act sideways), off the
 *   pinned quest and the pack row, its tiles scrolling inside it, at 360x629 to 402x874 and sideways;
 * - the pinned quest never covers the stick (the tutorial too), and the action chip ("Tap · choose
 *   from 4", drawn on the canvas) keeps off Act, Jump, the stick and the card (R1 audit #5).
 * Run: node --test tests/phone-layout.test.js
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CHOOSER_MIN_W, GAP, PILL_IDS, STICK, TAP_H, boxesOverlap, chooserRoomOf, fullScreenWay, layoutProblems, menuRoomOf, phoneRegions, pillBadge, socialPillCount, stickRegionOf, streetFloorOf,
} from '../public/js/ui/phone-layout.js?v=351488b7';
import { phonePins } from '../public/js/ui/quest-pin-button.js?v=2931d81d';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const css = read('public/style.css');
const game = read('public/game.js');

const SIZES = [[375, 667], [402, 812], [812, 402]];
const STATES = ['', 'bag', 'map', 'half'];
const named = (r) => ({ strip: r.strip, caption: r.caption, notices: r.notices, pin: r.pin, stick: r.stick, act: r.act, jump: r.jump, pack: r.pack, sheet: r.sheet });

describe('phone layout: the regions (pure)', () => {
  it('nothing overlaps at three sizes in every sheet state, with a pinned quest and the pack row', () => {
    const bad = [];
    for (const [width, height] of SIZES) {
      for (const sheet of STATES) {
        const pack = { left: width / 2 - 165, right: width / 2 + 165, top: height - 66, bottom: height - 6 };
        const r = phoneRegions({ width, height, sheet, pack, bagTop: height - 66 - 150, caption: { w: 220, h: 26 }, captionUnder: height > width, pin: { w: 200, h: 50 } });
        for (const p of layoutProblems(named(r), { width, height, allow: height > width ? [] : [['strip', 'caption']] })) bad.push(`${width}x${height} ${sheet || 'street'}: ${p}`);
      }
    }
    assert.deepEqual(bad, []);
  });

  it('upright the caption sits under the stats and the notices under it; sideways the caption is in the top row', () => {
    const up = phoneRegions({ width: 402, height: 812, caption: { w: 200, h: 26 } });
    assert.ok(up.caption.top >= up.strip.bottom && up.notices.top >= up.caption.bottom + GAP);
    const side = phoneRegions({ width: 812, height: 402, caption: { w: 200, h: 26 } });
    assert.ok(side.caption.top >= side.strip.top && side.caption.bottom <= side.strip.bottom);
    assert.equal(side.notices.top, side.strip.bottom + GAP);
    // Sideways with no room between the pills (topbar.js .is-under) it drops under them.
    const under = phoneRegions({ width: 667, height: 375, caption: { w: 200, h: 26 }, captionUnder: true });
    assert.equal(under.notices.top, Math.ceil((under.caption.top + under.caption.bottom) / 2 + TAP_H / 2) + GAP);
  });

  it('G1222: the notices start under the caption\'s taps (favor\'s 44 px hit area), not only under the caption', () => {
    // A notice at the region's top cut favor's hit area to 41 px, and its 4 px slide in (notifyIn) reached further.
    for (const [width, height] of [...SIZES, [360, 780], [390, 844], [667, 375]]) {
      for (const sheet of ['', 'bag', 'half']) {
        const r = phoneRegions({ width, height, sheet, bagTop: height - 216, caption: { w: 220, h: 26 }, captionUnder: height > width || width < 700 });
        if (!r.caption) continue;
        const taps = (r.caption.top + r.caption.bottom) / 2 + TAP_H / 2;
        assert.ok(r.notices.top - 4 >= taps, `${width}x${height} ${sheet || 'street'}: notices at ${r.notices.top}, taps to ${taps}`);
      }
    }
    assert.match(css, /#street-nameplate > #favor-stat::before \{ content: ""; position: absolute; top: 50%; left: 0; right: 0; height: 44px; margin-top: -22px; \}/, 'favor\'s hit area is TAP_H tall');
    assert.equal(TAP_H, 44);
  });

  it('the pinned quest: under the stick, just above the pack row upright (G1307), beside it sideways (clear of its ring), gone under a sheet', () => {
    const rest = phoneRegions({ width: 375, height: 667 });
    const up = phoneRegions({ width: 375, height: 667, pin: { w: 200, h: 50 } });
    assert.equal(up.pin.left, up.stick.left);
    // #653: the card stands where the stick stood (on its band, over the pack row), the stick up over it.
    assert.equal(up.pin.bottom, rest.stick.bottom);
    assert.ok(up.pin.bottom <= up.pack.top, 'over the pack row');
    assert.equal(up.stick.bottom, up.pin.top - GAP, 'the stick just over the card');
    assert.equal(up.stickUp, 50 + GAP);
    assert.equal(rest.stickUp, 0, 'no card: the stick stays on its band');
    for (const k of ['stick', 'act', 'jump', 'pack']) assert.ok(!boxesOverlap(up.pin, up[k]), k);
    const side = phoneRegions({ width: 812, height: 402, pin: { w: 200, h: 50 } });
    assert.ok(side.pin.left >= side.stick.right, 'beside the stick');
    assert.equal(side.stick.right - side.stick.left, STICK);
    assert.ok(!boxesOverlap(side.pin, side.act) && !boxesOverlap(side.pin, side.stick));
    for (const sheet of ['bag', 'map', 'half']) assert.equal(phoneRegions({ width: 375, height: 667, sheet, bagTop: 400, pin: { w: 200, h: 50 } }).pin, null, sheet);
  });

  it('the pinned quest follows the controls where the page laid them out, and waits rather than cover the stick', () => {
    // The tutorial hides the pack row but the controls keep standing on its band: measured, they win.
    const stick = { left: 8, top: 520, right: 140, bottom: 652 };
    const r = phoneRegions({ width: 390, height: 844, packShown: false, pin: { w: 200, h: 50 }, controls: { stick, act: { left: 232, top: 576, right: 292, bottom: 636 }, jump: { left: 302, top: 564, right: 378, bottom: 640 } } });
    assert.equal(r.pin.bottom, stick.bottom, 'on the band the stick stood on');
    assert.deepEqual(r.stick, { ...stick, top: stick.top - 50 - GAP, bottom: stick.bottom - 50 - GAP }, 'the stick up over it');
    for (const k of ['stick', 'act', 'jump']) assert.ok(!boxesOverlap(r.pin, r[k]), k);
    // A stick so high that standing it up would reach the caption: the card waits and the stick stays.
    const highStick = { left: 8, top: 110, right: 140, bottom: 242 };
    const high = phoneRegions({ width: 390, height: 844, pin: { w: 200, h: 50 }, caption: { w: 200, h: 26 }, controls: { stick: highStick } });
    assert.equal(high.pin, null);
    assert.deepEqual(high.stick, highStick);
    assert.equal(high.stickUp, 0);
  });

  it('G1230 (#595, #632): with the float stick on, the card stands just over the stick\'s ring, not over its tall corner', () => {
    // style.css FLOAT STICK: the corner is up to 300 px tall and 45% wide; the ring rests in its foot's STICK px square.
    const corner = { left: 16, top: 360, right: 175, bottom: 660 };
    const stick = stickRegionOf(corner, { float: true });
    assert.deepEqual(stick, { left: 16, top: 660 - STICK, right: 16 + STICK, bottom: 660 });
    assert.deepEqual(stickRegionOf(corner), corner, 'the fixed stick is its own box');
    const r = phoneRegions({ width: 390, height: 844, pin: { w: 200, h: 50 }, controls: { stick } });
    // G1307: the card on the corner's foot, the ring's resting square up over it.
    assert.equal(r.pin.bottom, 660);
    assert.equal(r.stick.bottom, 660 - 50 - GAP, 'the ring just over the card');
    assert.equal(r.pin.left, stick.left);
    // As the game measured it before G1230 (the whole corner): the card went mid-left on the screen.
    const old = phoneRegions({ width: 390, height: 844, pin: { w: 200, h: 50 }, controls: { stick: corner } });
    assert.ok(old.stick.top < r.stick.top - 150);
  });

  it('G1307 (#653): at iPhone and Android sizes the card stands under the stick over the pack row, clear of everything; sideways it stays beside the stick', () => {
    const bad = [];
    for (const [name, width, height, safe] of [
      ['iPhone Home Screen app 402x874', 402, 874, { t: 86, b: 34 }],
      ['iPhone Safari 402x874', 402, 874, { t: 76 }],
      ['iPhone 390x844', 390, 844, { t: 14 }],
      ['Android 360x629', 360, 629, { t: 14 }],
      ['Android 384x748', 384, 748, { t: 14 }],
    ]) {
      // The pack row as pack-row.js centres it (56 tall, 8 px over the bottom inset), the card as tall as two lines.
      const pack = { left: width / 2 - 140, right: width / 2 + 140, top: height - (safe.b || 0) - 64, bottom: height - (safe.b || 0) - 8 };
      const r = phoneRegions({ width, height, safe, pack, caption: { w: 220, h: 26 }, pin: { w: 150, h: 50 } });
      if (!r.pin) {
        bad.push(`${name}: the card waits`);
        continue;
      }
      if (!(r.pin.top >= r.stick.bottom + GAP)) bad.push(`${name}: the card is not under the stick`);
      if (!(r.pin.bottom <= r.pack.top)) bad.push(`${name}: the card is not over the pack row`);
      for (const p of layoutProblems(named(r), { width, height })) bad.push(`${name}: ${p}`);
      // The street's floor is over the stick standing up, so the avatar never walks under the card.
      if (streetFloorOf(r) > r.pin.top - GAP) bad.push(`${name}: the street's floor is under the card's top`);
    }
    assert.deepEqual(bad, []);
    const side = phoneRegions({ width: 874, height: 402, pin: { w: 150, h: 50 } });
    assert.equal(side.stickUp, 0, 'sideways the stick stays on its band');
    assert.ok(side.pin.left >= side.stick.right && side.pin.bottom === side.stick.bottom, 'beside it, as before');
  });

  it('G1229 (#654): the free street area\'s floor is over the stick, Act, Jump and the pack row upright, over the pack row sideways, none under a sheet', () => {
    for (const [width, height] of [[390, 844], [384, 748], [375, 667]]) {
      const pack = { left: width / 2 - 165, right: width / 2 + 165, top: height - 66, bottom: height - 6 };
      const r = phoneRegions({ width, height, pack });
      assert.equal(streetFloorOf(r), Math.min(r.stick.top, r.act.top, r.jump.top) - GAP, `${width}x${height}`);
      assert.ok(Number.isNaN(streetFloorOf(phoneRegions({ width, height, pack, sheet: 'half' }))), 'none under a sheet');
    }
    const side = phoneRegions({ width: 748, height: 384, pack: { left: 209, right: 539, top: 318, bottom: 378 } });
    assert.equal(streetFloorOf(side), 318 - GAP);
    assert.ok(Number.isNaN(streetFloorOf(null)));
  });

  it('#5: a menu\'s room is above the controls upright and between the stick and Act sideways, none under a sheet', () => {
    const up = phoneRegions({ width: 390, height: 844, caption: { w: 200, h: 26 } });
    const r = menuRoomOf(up, { width: 390 });
    assert.equal(r.floor, Math.min(up.stick.top, up.act.top, up.jump.top) - GAP);
    assert.equal(r.top, up.notices.top);
    const side = phoneRegions({ width: 812, height: 402 });
    const s2 = menuRoomOf(side, { width: 812 });
    assert.equal(s2.left, side.stick.right + GAP);
    assert.equal(812 - s2.right, side.act.left - GAP);
    assert.equal(s2.floor, side.pack.top - GAP);
    assert.equal(menuRoomOf(phoneRegions({ width: 390, height: 844, sheet: 'half' }), { width: 390 }), null);
  });

  it('the chooser\'s room (lane pink 2026-11-25): in the street above the controls upright, beside or over the pinned quest sideways, none under a sheet', () => {
    const pin = { w: 150, h: 49 };
    const clear = (r, b, where) => {
      for (const k of ['stick', 'act', 'jump', 'pack', 'pin', 'strip', 'caption']) assert.ok(!boxesOverlap(b, r[k]), `${where}: the chooser's room overlaps ${k}`);
      assert.ok(b.left >= 0 && b.top >= 0 && b.right > b.left && b.bottom > b.top, `${where}: a room on the screen`);
    };
    for (const [w, h, safe] of [[360, 629], [384, 748], [390, 844], [402, 874, { t: 62, b: 34 }]]) {
      const up = phoneRegions({ width: w, height: h, safe, pin, caption: { w: 200, h: 26 } });
      assert.ok(up.pin, `${w}x${h}: the card shows`);
      const b = chooserRoomOf(up, { width: w });
      clear(up, b, `${w}x${h}`);
      assert.equal(b.bottom, Math.min(up.stick.top, up.act.top, up.jump.top) - GAP);
      assert.equal(b.top, up.notices.top);
    }
    // Sideways: beside the card, the room's whole height, when that leaves the chooser room enough...
    for (const [w, h, safe] of [[844, 390], [874, 402, { l: 62, r: 62, b: 21 }], [748, 384]]) {
      const side = phoneRegions({ width: w, height: h, safe, pin });
      assert.ok(side.pin, `${w}x${h}: the card shows`);
      const b = chooserRoomOf(side, { width: w });
      clear(side, b, `${w}x${h}`);
      assert.equal(b.left, side.pin.right + GAP, `${w}x${h}: beside the card`);
      assert.equal(b.bottom, side.pack.top - GAP);
    }
    // ...and over it when beside it is too narrow.
    const narrow = phoneRegions({ width: 640, height: 360, pin: { w: 200, h: 49 } });
    const over = chooserRoomOf(narrow, { width: 640 });
    assert.ok(narrow.act.left - GAP - (narrow.pin.right + GAP) < CHOOSER_MIN_W);
    clear(narrow, over, '640x360');
    assert.equal(over.bottom, narrow.pin.top - GAP);
    assert.equal(over.left, narrow.stick.right + GAP);
    assert.equal(chooserRoomOf(phoneRegions({ width: 390, height: 844, sheet: 'half' }), { width: 390 }), null);
  });

  it('the Map takes the whole height (sideways the whole screen) and leaves the notices no room', () => {
    const up = phoneRegions({ width: 402, height: 812, sheet: 'map' });
    assert.deepEqual([up.sheet.top, up.sheet.bottom], [up.strip.bottom + GAP, 812]);
    assert.equal(up.notices.bottom, up.notices.top);
    assert.equal(up.pack, null);
    const side = phoneRegions({ width: 812, height: 402, sheet: 'map' });
    assert.deepEqual(side.sheet, { left: 0, top: 0, right: 812, bottom: 402 });
    assert.equal(side.strip, null);
  });

  it('a sheet docks the stage (above the pack upright, a column sideways), an open bag too; the Map and the street do not', () => {
    const pack = { left: 30, right: 345, top: 600, bottom: 660 };
    const half = phoneRegions({ width: 375, height: 667, sheet: 'half', pack });
    assert.equal(half.sheet.bottom, pack.top - GAP);
    assert.deepEqual(half.dock, { side: 'bottom', css: 667 - half.sheet.top, zoom: true });
    const column = phoneRegions({ width: 812, height: 402, sheet: 'half' });
    assert.deepEqual(column.dock, { side: 'left', css: column.sheet.right, zoom: true });
    assert.ok(812 - column.sheet.right >= 240, 'the street keeps room beside the column');
    const bag = phoneRegions({ width: 812, height: 402, sheet: 'bag', bagTop: 190 });
    assert.deepEqual(bag.dock, { side: 'bottom', css: 212, zoom: true });
    assert.equal(phoneRegions({ width: 375, height: 667, sheet: 'map' }).dock, null);
    assert.equal(phoneRegions({ width: 375, height: 667 }).dock, null);
  });

  it('badges, full screen and the safe area', () => {
    assert.deepEqual([pillBadge(0), pillBadge(3), pillBadge(140)], ['', '3', '99+']);
    assert.equal(fullScreenWay({ canRequest: true }), 'api');
    assert.equal(fullScreenWay({ canRequest: false }), 'tip');
    assert.equal(fullScreenWay({ standalone: true, canRequest: true }), 'hide');
    // G1230 (#632): already full screen (display-mode fullscreen) or no way to it (no API, no Add to Home
    // Screen: not iPhone Safari): hidden. The button is hidden, not greyed (an empty square in the Home Screen app).
    assert.equal(fullScreenWay({ fullscreen: true, canRequest: true }), 'hide');
    assert.equal(fullScreenWay({ canRequest: false, canTip: false }), 'hide');
    const src = read('public/js/ui/phone-layout.js');
    assert.match(src, /full\.hidden = way === 'hide';/);
    assert.doesNotMatch(src, /full\.disabled/);
    assert.match(css, /\.top-actions :is\(#fullscreen-btn:not\(\[hidden\]\), #bug-btn, #social-btn, #more-btn\) \{/);
    assert.doesNotMatch(css, /#fullscreen-btn:disabled/);
    assert.match(game, /canTip: iosSafari\(navigator\)/);
    const r = phoneRegions({ width: 402, height: 874, safe: { t: 62, b: 34 } });
    assert.ok(r.strip.top >= 62 && r.pack.bottom <= 874 - 34);
  });
});

describe('G1230 (#595): the Social pill counts chat and IMs, not the Activity log', () => {
  it('Activity and new buddies stay off the pill; Local, Global and the Chats list (IMs, help channels) count', () => {
    const unread = { activity: 40, local: 1, global: 2, buddies: 3, chats: 4 };
    assert.equal(socialPillCount(['activity', 'local', 'global', 'buddies', 'chats'], (id) => unread[id]), 7);
    assert.equal(socialPillCount(['activity'], () => 99), 0, 'pickups and skills alone light no badge');
    assert.equal(socialPillCount(), 0);
    assert.match(game, /pill\?\.setBadge\(socialDrawer \? socialPillCount\(socialDrawer\.tabs, \(id\) => socialDrawer\.unread\(id\)\) : 0\)/);
  });
  it('the Activity tab keeps its own small count inside the drawer', () => {
    assert.match(css, /#local-chat-dock \.social-tab\[data-social-tab="activity"\] \.social-badge \{\n  min-width: 12px; height: 12px;/);
    // The drawer draws a count on every tab that is not showing (js/ui/social-drawer.js renderTabs).
    assert.match(read('public/js/ui/social-drawer.js'), /if \(n\) b\.append\(el\('span', \{ class: 'social-badge', 'aria-hidden': 'true' \}, badgeText\(n\)\)\);/);
  });
});

describe('G1230 (#595): favor\'s symbol on the caption reads on any street', () => {
  it('stands on its own cream disc (the symbol is drawn dark, for a cream pill)', () => {
    assert.match(read('public/assets/sprites/giant-symbols/spriggan.svg'), /fill="#71675b"/, 'the symbols are dark brown');
    const rule = css.match(/#street-nameplate > #favor-stat img \{([^}]*)\}/)?.[1] || '';
    assert.match(rule, /background: var\(--surface-card\)/);
    assert.match(rule, /border-radius: var\(--radius-round\)/);
    assert.doesNotMatch(rule, /opacity/);
  });
});

describe('phone layout: wiring', () => {
  it('the pill shows only its four icons, so it cannot grow', () => {
    assert.deepEqual([...PILL_IDS], ['fullscreen-btn', 'bug-btn', 'social-btn', 'more-btn']);
    assert.match(css, /:root\.phone-layout\[data-ui="modern"\] body:not\(\.nx-hide-actions\) \.top-bar \.top-actions > :not\(#fullscreen-btn, #bug-btn, #social-btn, \.more-menu\) \{ display: none !important; \}/);
    // Quests is a Menu row on the phone layout (js/ui/topbar.js fitTopActions).
    assert.match(read('public/js/ui/topbar.js'), /classList\.contains\('phone-layout'\) && !steps\.includes\('quest'\) \? \['quest', \.\.\.steps\] : steps/);
  });

  it('G1307 (#653): the stick stands up over the card upright (its float corner and the prompts too), and the card hides at once', () => {
    assert.match(css, /:root\.phone-layout\[data-ui="modern"\] #game-root \.touch-stick \{ bottom: var\(--pr-stick-up, 0px\); \}/);
    assert.match(css, /\.touch-controls\[data-float="on"\] \.touch-stick \{\n  height: clamp\(132px, 100dvh - var\(--pack-live-height, 72px\) - var\(--hud-h\) - 96px - var\(--pr-stick-up, 0px\), 300px\);/);
    assert.match(css, /\.prompt-stack \{ bottom: calc\([^}]*var\(--pr-stick-up, 0px\)/);
    // WebKit at times kept the card showing through the shared visibility fade, beside an open bag's tray.
    assert.match(css, /#game-root #quest-pins:not\(\[hidden\]\) \{\n  top: auto;[^}]*transition: none;\n\}/);
    const layout = read('public/js/ui/phone-layout.js');
    assert.match(layout, /set\('--pr-stick-up', stickUp\)/);
  });

  it('the pinned quest card stays out of the old phone button on the phone layout', () => {
    const doc = (cls) => ({ documentElement: { classList: { contains: (c) => cls.includes(c) }, dataset: { ui: 'modern' } } });
    assert.equal(phonePins(doc(['touch-phone'])), true);
    assert.equal(phonePins(doc(['touch-phone', 'phone-layout'])), false);
  });

  it('game.js: phones only, the stage dock has owners, the notices take the region', () => {
    assert.match(game, /function installPhoneLayout\(\) \{\s*if \(!TOUCH_PHONE \|\| phoneLayout\) return;/);
    assert.match(game, /active: \(\) => modernUi\(\),/);
    assert.match(game, /setStageDock\(dock = null, owner = 'window'\)/);
    assert.match(game, /const next = stageDockOf\(stageDocks\);/);
    assert.match(game, /closeup: dock && !dock\.zoom \? 0 : phoneCloseup\(\),/);
    assert.match(game, /region: \(\) => phoneLayout\?\.noticeRegion\(\) \|\| null,/);
    assert.match(read('public/js/notify-view.js'), /if \(zones\.region && !place\.wait && zones\.top \+ place\.dy \+/);
  });

  it('Classic keeps its own look: the layout is Modern and phones only, and classic.css never names it', () => {
    for (const line of css.split('\n').filter((l) => l.includes('phone-layout') && /\{/.test(l) && !l.trim().startsWith('/*') && !l.trim().startsWith('.phone-pill-btn'))) {
      assert.ok(/:root\.phone-layout(\[data-ui="modern"\])?/.test(line), line.slice(0, 120));
    }
    assert.ok(!read('public/css/classic.css').includes('phone-layout'));
  });
});

let chromium = null;
try { chromium = (await import('playwright')).chromium; } catch { /* no Playwright */ }

/**
 * R1 (Chrome, the real game): every HUD piece measured at three sizes in every sheet state; any two
 * that overlap, or one off the screen, fail.
 */
describe('phone layout: no overlaps on the real game (Chrome)', { skip: !chromium && 'no playwright' }, () => {
  const LOCK_WAIT_MS = 30 * 60_000;
  const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
  let server = null;
  let chrome = null;
  before(async () => {
    const { openBrowser } = await import('../tools/qa/browser.mjs');
    const { startServer } = await import('../tools/qa/serve.mjs');
    chrome = await openBrowser({ label: 'phone-layout overlap test', waitMs: LOCK_WAIT_MS });
    server = await startServer({ root: join(root, 'public') });
  }, { timeout: LOCK_WAIT_MS + 60_000 });
  after(async () => {
    await chrome?.close();
    await server?.stop();
  });

  it('375x667, 402x812 and 812x402: street, open bag, Map, Quests, Social and the Menu', { timeout: 180_000 }, async () => {
    const base = `http://127.0.0.1:${server.address().port}`;
    const ctx = await chrome.browser.newContext({ viewport: { width: 402, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, userAgent: UA });
    await ctx.addInitScript(() => { try { localStorage.setItem('groddle-play-device', 'qa-game'); } catch { /* none */ } });
    const tab = await ctx.newPage();
    const errors = [];
    tab.on('pageerror', (e) => errors.push(e.message));
    await tab.goto(`${base}/play/?autostart=1&questoffer=off&hstip=0`);
    await tab.waitForFunction(() => !document.body.classList.contains('is-booting') && document.getElementById('overlay')?.classList.contains('hidden') && document.documentElement.classList.contains('phone-layout'), null, { timeout: 60_000 });
    await tab.evaluate(() => {
      for (const b of document.querySelectorAll('button')) if (b.textContent.trim() === 'Got it' && b.offsetParent) b.click();
      window.groddleQA?.questPins?.pin('animalkinship_pet_piggies');
      // The pill cannot grow: a button some feature adds to it does not show.
      const extra = Object.assign(document.createElement('button'), { id: 'phone-layout-test-extra', type: 'button', className: 'chrome-btn hud-ibtn', textContent: 'X' });
      document.querySelector('.top-bar .top-actions').append(extra);
    });
    const open = {
      street: () => {},
      bag: () => document.querySelector('#pack-bags .pack-bag')?.click(),
      map: () => document.getElementById('menu-map-btn').click(),
      quests: () => document.getElementById('menu-quest-btn').click(),
      social: () => document.getElementById('social-btn').click(),
      menu: () => document.getElementById('more-btn').click(),
    };
    const shut = {
      bag: () => document.querySelector('#pack-bags .pack-bag')?.click(),
      map: () => document.getElementById('map-close').click(),
      quests: () => document.getElementById('quest-close').click(),
      social: () => window.groddleSocial.close(),
      menu: () => document.getElementById('more-btn').click(),
    };
    const bad = [];
    for (const [w, h] of SIZES) {
      await tab.setViewportSize({ width: w, height: h });
      await tab.waitForTimeout(500);
      for (const state of Object.keys(open)) {
        await tab.evaluate(`(${open[state]})()`);
        await tab.evaluate(() => window.groddleQA?.notify?.notice('A notice for the layout check, long enough for two lines on a phone.', 6000));
        await tab.waitForTimeout(600);
        const got = await tab.evaluate((st) => {
          const seen = (el) => el && el.checkVisibility({ visibilityProperty: true, opacityProperty: true }) && el.getBoundingClientRect().width > 0;
          const rect = (el) => {
            const r = el.getBoundingClientRect();
            return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
          };
          const pieces = {
            stats: document.getElementById('hud-stats'),
            pill: document.querySelector('.top-bar .top-actions'),
            caption: document.getElementById('street-nameplate'),
            notices: document.querySelector('.notify-notices:not(.is-waiting)'),
            pin: document.getElementById('quest-pins'),
            prompt: null,
            stick: document.querySelector('.touch-stick'),
            act: document.querySelector('.touch-act'),
            jump: document.querySelector('.touch-jump'),
            pack: document.getElementById('pack-row'),
            bag: document.querySelector('#pack-bar .pack-bag-row:not([hidden])'),
            sheet: st === 'map' ? document.querySelector('#map-panel .map-card') : st === 'quests' ? document.querySelector('#quest-panel') : st === 'social' ? document.getElementById('local-chat-dock') : st === 'menu' ? document.getElementById('more-list') : null,
          };
          const boxes = {};
          for (const [k, el] of Object.entries(pieces)) if (seen(el) && (k !== 'notices' || el.children.length)) boxes[k] = rect(el);
          // The action chip ("Tap · choose from 4") is drawn on the canvas: its box is canvas data promptCss.
          const pc = document.querySelector('#game-root canvas')?.dataset.promptCss;
          // Under the Map it is covered, as the street is.
          if (pc && st !== 'map') {
            const [left, top, right, bottom] = pc.split(',').map(Number);
            boxes.prompt = { left, top, right, bottom };
          }
          // The Map covers everything under it (sideways the top row too): only what is in front counts.
          const front = (k) => {
            const b = boxes[k];
            const at = document.elementFromPoint(Math.min(innerWidth - 1, Math.max(0, (b.left + b.right) / 2)), Math.min(innerHeight - 1, Math.max(0, (b.top + b.bottom) / 2)));
            return st !== 'map' || k === 'sheet' || Boolean(at && (pieces[k].contains(at) || at.contains(pieces[k])));
          };
          for (const k of Object.keys(boxes)) if (k !== 'prompt' && !front(k)) delete boxes[k];
          const pillShown = [...document.querySelectorAll('.top-bar .top-actions > *, .top-bar .top-actions .more-menu > button')].filter((b) => seen(b) && (b.tagName === 'BUTTON' || b.tagName === 'A')).sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left).map((b) => b.id);
          return { boxes, pillShown, sheet: document.documentElement.dataset.phoneSheet, dock: document.querySelector('#game-root canvas')?.dataset.phoneDock || '' };
        }, state);
        const where = `${w}x${h} ${state}`;
        if (!got.boxes.sheet && state !== 'street' && state !== 'bag') bad.push(`${where}: the sheet did not open`);
        if (state === 'bag' && !got.boxes.bag) bad.push(`${where}: the bag did not open`);
        for (const p of layoutProblems(got.boxes, { width: w, height: h })) bad.push(`${where}: ${p}${/prompt/.test(p) ? ` ${JSON.stringify(got.boxes.prompt)}` : ''}`);
        if (state !== 'map' && got.pillShown.join(',') !== 'fullscreen-btn,bug-btn,social-btn,more-btn') bad.push(`${where}: the pill shows ${got.pillShown.join(',')}`);
        if (['bag', 'quests', 'social', 'menu'].includes(state) && !got.dock) bad.push(`${where}: the stage did not dock`);
        // Every piece is there to be checked (a missing one would pass by not being measured).
        if (state === 'street') for (const k of ['stats', 'pill', 'caption', 'notices', 'pin', 'stick', 'act', 'jump', 'pack']) if (!got.boxes[k]) bad.push(`${where}: no ${k} to measure`);
        if (shut[state]) await tab.evaluate(`(${shut[state]})()`);
        await tab.waitForTimeout(300);
      }
    }
    await ctx.close();
    assert.deepEqual(bad, []);
    assert.deepEqual(errors, []);
  });

  it('#595: the top row and the caption never cut a count or a name, with big counts at 360 to 402 wide, and in the tutorial', { timeout: 180_000 }, async () => {
    const base = `http://127.0.0.1:${server.address().port}`;
    const ctx = await chrome.browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, userAgent: UA });
    await ctx.addInitScript(() => { try { localStorage.setItem('groddle-play-device', 'qa-game'); } catch { /* none */ } });
    const tab = await ctx.newPage();
    const errors = [];
    tab.on('pageerror', (e) => errors.push(e.message));
    const ready = () => !document.body.classList.contains('is-booting') && document.getElementById('overlay')?.classList.contains('hidden') && document.documentElement.classList.contains('phone-layout');
    /** Text cut short (an ellipsis, or content wider than its box), and the top row's pieces overlapping or empty. */
    const look = () => {
      const seen = (el) => el && el.checkVisibility({ visibilityProperty: true }) && el.getBoundingClientRect().width > 0;
      const rect = (el) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
      };
      const cut = [];
      const sel = '#hud-stats, #hud-stats .hud-cur strong, #hud-stats .ring-num, .top-bar .top-actions, #street-nameplate, #street-name, #street-name > *, #dametime-clock, #favor-stat strong, #newxp-pill, #newxp-pill [data-nx-label], #newxp-pill button';
      for (const el of document.querySelectorAll(sel)) {
        if (!seen(el)) continue;
        const name = el.id || el.className || el.tagName;
        if (/…|\.\.\./.test(el.textContent)) cut.push(`${name} "${el.textContent.trim().slice(0, 30)}"`);
        else if (el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1) cut.push(`${name} ${el.scrollWidth}>${el.clientWidth}`);
        else if (getComputedStyle(el).textOverflow === 'ellipsis' && el.clientWidth > 0 && el.scrollWidth > el.clientWidth) cut.push(`${name} ellipsis`);
      }
      const boxes = {};
      for (const [k, el] of Object.entries({ stats: document.getElementById('hud-stats'), tutorial: document.getElementById('newxp-pill'), pill: document.querySelector('.top-bar .top-actions'), caption: document.getElementById('street-nameplate'), pin: document.getElementById('quest-pins'), stick: document.querySelector('.touch-stick'), act: document.querySelector('.touch-act'), jump: document.querySelector('.touch-jump') })) if (seen(el)) boxes[k] = rect(el);
      const pc = document.querySelector('#game-root canvas')?.dataset.promptCss;
      if (pc) {
        const [left, top, right, bottom] = pc.split(',').map(Number);
        boxes.prompt = { left, top, right, bottom };
      }
      // The pill is as wide as what it shows (the tutorial left it four icons wide holding only Sound).
      const pill = document.querySelector('.top-bar .top-actions');
      const shown = [...pill.querySelectorAll('button, a')].filter((b) => seen(b) && b.closest('.more-list') == null);
      const used = shown.reduce((n, b) => n + b.getBoundingClientRect().width, 0);
      return { cut, boxes, pillW: pill.getBoundingClientRect().width, used, shown: shown.length, counts: [document.getElementById('stat-img')?.textContent, document.getElementById('stat-currants')?.textContent, document.querySelector('#favor-stat strong')?.textContent] };
    };
    const bad = [];
    const check = (where, got, w, h) => {
      for (const c of got.cut) bad.push(`${where}: cut ${c}`);
      for (const p of layoutProblems(got.boxes, { width: w, height: h })) bad.push(`${where}: ${p}${/prompt/.test(p) ? ` ${JSON.stringify(got.boxes.prompt)}` : ''}`);
      if (got.pillW - got.used > 24) bad.push(`${where}: the pill is ${Math.round(got.pillW)} px wide for ${Math.round(got.used)} px of ${got.shown} icons`);
      // Pills that do not touch: at least a few px apart.
      const left = got.boxes.stats || got.boxes.tutorial;
      if (left && got.boxes.pill && got.boxes.pill.left - left.right < 4) bad.push(`${where}: the pills touch (${Math.round(got.boxes.pill.left - left.right)} px apart)`);
    };
    await tab.goto(`${base}/play/?autostart=1&questoffer=off&hstip=0`);
    await tab.waitForFunction(ready, null, { timeout: 60_000 });
    const set = await tab.evaluate(() => window.groddleQA.hudStats({ currants: 123456, imagination: 61234, favor: 1302 }));
    assert.equal(set.currants, 123456);
    for (const [w, h] of [[360, 780], [375, 667], [390, 844], [402, 812]]) {
      await tab.setViewportSize({ width: w, height: h });
      await tab.waitForTimeout(700);
      const got = await tab.evaluate(look);
      if (!got.boxes.stats || !got.boxes.caption || !got.boxes.pill) bad.push(`${w}x${h}: the top row is missing a piece`);
      if (got.counts[2] == null) bad.push(`${w}x${h}: no favor shown`);
      check(`${w}x${h} play ${got.counts.join(' ')}`, got, w, h);
    }
    await tab.goto(`${base}/play/?autostart=1&questoffer=off&hstip=0&newxp=clouds`);
    await tab.waitForFunction(() => document.getElementById('newxp-pill') && !document.getElementById('newxp-pill').hidden, null, { timeout: 60_000 });
    // A quest pinned before the tutorial (its card stood on the stick there, Austin's iPhone).
    await tab.evaluate(() => window.groddleQA?.questPins?.pin('animalkinship_pet_piggies'));
    for (const [w, h] of [[360, 780], [390, 844], [844, 390]]) {
      await tab.setViewportSize({ width: w, height: h });
      await tab.waitForTimeout(700);
      const got = await tab.evaluate(look);
      if (!got.boxes.stick) bad.push(`${w}x${h} tutorial: no stick to measure`);
      check(`${w}x${h} tutorial`, got, w, h);
    }
    await ctx.close();
    assert.deepEqual(bad, []);
    assert.deepEqual(errors, []);
  });

  it('#5 (Austin\'s iPhone): menus keep off the stick, Act and Jump, Act taps open and choose every time, and the caption\'s favor takes a real tap', { timeout: 240_000 }, async () => {
    const base = `http://127.0.0.1:${server.address().port}`;
    const ctx = await chrome.browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, userAgent: UA });
    await ctx.addInitScript(() => { try { localStorage.setItem('groddle-play-device', 'qa-game'); } catch { /* none */ } });
    const tab = await ctx.newPage();
    const errors = [];
    tab.on('pageerror', (e) => errors.push(e.message));
    await tab.goto(`${base}/play/?autostart=1&questoffer=off&hstip=0`);
    await tab.waitForFunction(() => !document.body.classList.contains('is-booting') && document.getElementById('overlay')?.classList.contains('hidden') && document.documentElement.classList.contains('phone-layout'), null, { timeout: 60_000 });
    await tab.evaluate(() => {
      for (const b of document.querySelectorAll('button')) if (b.textContent.trim() === 'Got it' && b.offsetParent) b.click();
      window.groddleQA.hudStats({ favor: 52 });
    });
    const centre = (sel) => tab.evaluate((q) => {
      const el = document.querySelector(q);
      if (!el || !el.getClientRects().length) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, h: r.height };
    }, sel);
    /**
     * G1222: a reading taken again every 150 ms (longer than the layout pass's 120 ms beat, phone-layout.js
     * frame) until two in a row agree, up to 3 s: a menu the layout pass has not placed yet, or a notice
     * still sliding in, is not measured; anything that stays where it is (a real overlap) still is.
     * Two animation frames were not enough: the pass runs at most every 120 ms, and later on a busy machine.
     */
    const settled = async (read) => {
      let prev = await read();
      for (let i = 0; i < 20; i++) {
        await tab.waitForTimeout(150);
        const next = await read();
        if (JSON.stringify(next) === JSON.stringify(prev)) return next;
        prev = next;
      }
      return prev;
    };
    /** What is open now, and every menu card against the controls, once they stand still. */
    const menus = () => settled(() => tab.evaluate(() => {
      const seen = (el) => el && !el.hidden && el.checkVisibility({ visibilityProperty: true }) && el.getBoundingClientRect().width > 0;
      const rect = (el) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
      };
      const verb = document.getElementById('verb-menu');
      const chooser = document.getElementById('enter-chooser');
      const boxes = {};
      if (seen(verb)) boxes.verbMenu = rect(verb.querySelector('.verb-menu-card') || verb);
      if (seen(chooser)) boxes.chooser = rect(chooser.querySelector('.feed-picker-card, .verb-menu-card') || chooser);
      for (const k of ['stick', 'act', 'jump']) {
        const el = document.querySelector(`.touch-${k}`);
        if (seen(el)) boxes[k] = rect(el);
      }
      return { verb: seen(verb), chooser: seen(chooser), boxes };
    }));
    const bad = [];
    const tapAct = async () => {
      const a = await centre('.touch-act');
      await tab.touchscreen.tap(a.x, a.y);
      await tab.waitForTimeout(450);
    };
    for (const [w, h] of [[360, 780], [390, 844], [402, 812], [812, 402]]) {
      await tab.setViewportSize({ width: w, height: h });
      await tab.waitForTimeout(700);
      const where = `${w}x${h}`;
      // The caption's favor: a finger on it opens the Giants' panel; its hit area is a thumb tall.
      // G1222: with a notice up (the worst case: one at its region's top cut favor's hit area to 41 px).
      await tab.evaluate(() => window.groddleQA?.notify?.notice('A notice beside favor for the hit area check.', 6000));
      const fav = await settled(() => centre('#street-nameplate > #favor-stat'));
      if (!fav) bad.push(`${where}: no favor on the caption`);
      else {
        const hit = await settled(() => tab.evaluate(({ x, y }) => {
          const el = document.getElementById('favor-stat');
          const r = el.getBoundingClientRect();
          // The hit area, top to bottom: the element under each point, and what stands on its band instead.
          const band = [...Array(60).keys()].map((i) => y - 30 + i);
          const top = band.filter((py) => el.contains(document.elementFromPoint(x, py)));
          const over = band.filter((py) => py > y - 22 && py < y + 22 && !el.contains(document.elementFromPoint(x, py))).map((py) => `${Math.round(py)}:${document.elementFromPoint(x, py)?.className || '?'}`);
          // Every notice card stays off favor's band (centred, 44 px), across its whole width.
          const cards = [...document.querySelectorAll('.notify-notices .notify-card')].map((c) => c.getBoundingClientRect()).filter((c) => c.width && c.left < r.right && c.right > r.left && c.top < y + 22 && c.bottom > y - 22).map((c) => `${Math.round(c.top)}-${Math.round(c.bottom)}`);
          return { tall: top.length ? top.at(-1) - top[0] + 1 : 0, w: r.width, over: over.slice(0, 3), cards };
        }, fav));
        if (hit.tall < 44) bad.push(`${where}: favor's hit area is ${hit.tall} px tall (${hit.over.join(' ')})`);
        if (hit.cards.length) bad.push(`${where}: a notice stands on favor's hit area (${hit.cards.join(' ')})`);
        await tab.touchscreen.tap(fav.x, fav.y);
        await tab.waitForTimeout(300);
        if (!(await tab.evaluate(() => !document.getElementById('favor-pop')?.hidden))) bad.push(`${where}: a tap on favor did not open the Giants' panel`);
        await tab.keyboard.press('Escape');
        await tab.waitForTimeout(200);
      }
      // Tap 1 opens (the chooser of several things, or the verb menu); each tap on Act then chooses, until
      // an action runs; once it is over a tap opens again. Every menu keeps off the controls.
      let opened = 0;
      for (let round = 0; round < 2; round++) {
        await tapAct();
        let m = await menus();
        if (!m.verb && !m.chooser) {
          bad.push(`${where} round ${round + 1}: Act opened nothing`);
          break;
        }
        opened += 1;
        for (let step = 0; step < 4 && (m.verb || m.chooser); step++) {
          for (const p of layoutProblems(m.boxes, { width: w, height: h })) bad.push(`${where} round ${round + 1} ${m.chooser ? 'chooser' : 'verb menu'}: ${p}`);
          await tapAct();
          m = await menus();
        }
        if (m.verb || m.chooser) bad.push(`${where} round ${round + 1}: taps on Act did not choose`);
        await tab.keyboard.press('Escape');
        // Let the chosen action finish (Pet, Talk to...) before the next round.
        await tab.waitForFunction(() => !document.getElementById('action-progress') || document.getElementById('action-progress').hidden, null, { timeout: 15_000 }).catch(() => {});
        await tab.waitForTimeout(900);
      }
      if (opened < 2) bad.push(`${where}: Act opened a menu ${opened} of 2 times`);
    }
    await ctx.close();
    assert.deepEqual(bad, []);
    assert.deepEqual(errors, []);
  });

  it('#635 (an Android phone, 360x629): an open bag keeps every slot inside its tray, a full 16-slot bag and long counts too', { timeout: 120_000 }, async () => {
    const base = `http://127.0.0.1:${server.address().port}`;
    const ctx = await chrome.browser.newContext({ viewport: { width: 360, height: 629 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, userAgent: UA });
    await ctx.addInitScript(() => { try { localStorage.setItem('groddle-play-device', 'qa-game'); } catch { /* none */ } });
    const tab = await ctx.newPage();
    const errors = [];
    tab.on('pageerror', (e) => errors.push(e.message));
    await tab.goto(`${base}/play/?autostart=1&questoffer=off&hstip=0`);
    await tab.waitForFunction(() => !document.body.classList.contains('is-booting') && document.getElementById('overlay')?.classList.contains('hidden') && document.documentElement.classList.contains('phone-layout'), null, { timeout: 60_000 });
    // The starter pack's bags arrive a moment after the street (the 16-slot notice).
    await tab.waitForFunction(() => document.querySelectorAll('#pack-bags .pack-bag').length > 0, null, { timeout: 20_000 }).catch(() => {});
    const bad = [];
    for (const [w, h] of [[360, 629], [375, 667], [812, 402]]) {
      await tab.setViewportSize({ width: w, height: h });
      await tab.waitForTimeout(500);
      const bags = await tab.evaluate(() => document.querySelectorAll('#pack-bags .pack-bag').length);
      if (!bags) bad.push(`${w}x${h}: no bag to open`);
      for (let i = 0; i < bags; i++) {
        await tab.evaluate((n) => document.querySelectorAll('#pack-bags .pack-bag')[n].click(), i);
        await tab.waitForTimeout(500);
        const got = await tab.evaluate(() => {
          const tray = document.querySelector('#pack-bar .pack-bag-row:not([hidden])');
          if (!tray) return null;
          // A long stack count on the rightmost slot of the first row (the widest a count gets: 9,999).
          const slots = [...tray.querySelectorAll('.pack-bag-slots .pack-slot')];
          const right = slots.reduce((a, b) => (b.getBoundingClientRect().right > (a?.getBoundingClientRect().right ?? -1) ? b : a), null);
          if (right) {
            let c = right.querySelector('.count');
            if (!c) right.append(c = Object.assign(document.createElement('span'), { className: 'count' }));
            c.textContent = '9,999';
          }
          const t = tray.getBoundingClientRect();
          const out = [...tray.querySelectorAll('.pack-slot, .pack-slot *')].filter((e) => {
            const r = e.getBoundingClientRect();
            return r.width > 0 && (r.left < t.left - 0.5 || r.right > t.right + 0.5);
          }).map((e) => `${e.className || e.tagName}@${Math.round(e.getBoundingClientRect().right)}`);
          return { slots: slots.length, out: out.slice(0, 4), tray: [t.left, t.right].map(Math.round), screen: innerWidth };
        });
        if (!got) bad.push(`${w}x${h} bag ${i + 1}: did not open`);
        else {
          if (got.out.length) bad.push(`${w}x${h} bag ${i + 1} (${got.slots} slots): past the tray ${got.tray}: ${got.out.join(' ')}`);
          if (got.tray[0] < 0 || got.tray[1] > got.screen) bad.push(`${w}x${h} bag ${i + 1}: the tray runs off the screen ${got.tray}`);
        }
        await tab.evaluate((n) => document.querySelectorAll('#pack-bags .pack-bag')[n].click(), i);
        await tab.waitForTimeout(250);
      }
    }
    await ctx.close();
    assert.deepEqual(bad, []);
    assert.deepEqual(errors, []);
  });

  /** A phone tab on Kala Close (its lowest floor sits low, close over the street's bottom: #654), the avatar standing still. */
  async function kalaClose(width, height) {
    const base = `http://127.0.0.1:${server.address().port}`;
    const ctx = await chrome.browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, userAgent: UA });
    await ctx.addInitScript(() => { try { localStorage.setItem('groddle-play-device', 'qa-game'); } catch { /* none */ } });
    const tab = await ctx.newPage();
    const errors = [];
    tab.on('pageerror', (e) => errors.push(e.message));
    await tab.goto(`${base}/play/?autostart=1&questoffer=off&hstip=0`);
    await tab.waitForFunction(() => !document.body.classList.contains('is-booting') && document.getElementById('overlay')?.classList.contains('hidden') && document.documentElement.classList.contains('phone-layout'), null, { timeout: 60_000 });
    await tab.evaluate(() => {
      for (const b of document.querySelectorAll('button')) if (b.textContent.trim() === 'Got it' && b.offsetParent) b.click();
      return window.groddleQA.audio.travel('GIFGR4QG5IV1QPI');
    });
    await tab.waitForTimeout(2500);
    return { ctx, tab, errors };
  }
  /** The avatar's feet and the tops of the controls and the pack row, in page px. */
  const feetAndControls = (tab) => tab.evaluate(() => {
    const c = document.querySelector('#game-root canvas');
    const r = c.getBoundingClientRect();
    const top = (sel) => {
      const el = document.querySelector(sel);
      return el && el.getClientRects().length ? el.getBoundingClientRect().top : NaN;
    };
    // The float stick's corner is taller than its ring (stickRegionOf); these tabs keep the fixed stick.
    const controls = Math.min(top('#game-root .touch-stick'), top('#game-root .touch-act'), top('#game-root .touch-jump'));
    return { feet: r.top + Number(c.dataset.playerScreenY) * Number(c.dataset.stageScale), controls, pack: top('#pack-row'), dock: c.dataset.phoneDock || '' };
  });

  it('G1229 (#654): on a low-floor street (Kala Close) the avatar\'s feet stand over the controls at 390x844, 384x748 and 375x667', { timeout: 120_000 }, async () => {
    const { ctx, tab, errors } = await kalaClose(390, 844);
    const bad = [];
    for (const [w, h] of [[390, 844], [384, 748], [375, 667]]) {
      await tab.setViewportSize({ width: w, height: h });
      await tab.waitForTimeout(1500);
      const m = await feetAndControls(tab);
      if (!(m.feet < m.controls)) bad.push(`${w}x${h}: the feet at ${Math.round(m.feet)}, the controls from ${Math.round(m.controls)}`);
    }
    await ctx.close();
    assert.deepEqual(bad, []);
    assert.deepEqual(errors, []);
  });

  it('G1228 (#653): closing a sheet, the Menu, Social or a bag gives the street back and the camera returns (the avatar never sinks under the pack row)', { timeout: 120_000 }, async () => {
    const { ctx, tab, errors } = await kalaClose(384, 748);
    const open = {
      skills: () => document.getElementById('skills-btn').click(),
      quests: () => document.getElementById('menu-quest-btn').click(),
      social: () => document.getElementById('social-btn').click(),
      menu: () => document.getElementById('more-btn').click(),
      bag: () => document.querySelector('#pack-bags .pack-bag')?.click(),
    };
    const shut = {
      skills: () => document.getElementById('skills-close').click(),
      quests: () => document.getElementById('quest-close').click(),
      social: () => window.groddleSocial.close(),
      menu: () => document.getElementById('more-btn').click(),
      bag: () => document.querySelector('#pack-bags .pack-bag')?.click(),
    };
    const bad = [];
    const before = await feetAndControls(tab);
    if (before.feet > before.pack - 8) bad.push(`street: the feet (${Math.round(before.feet)}) under the pack row (${Math.round(before.pack)})`);
    for (const k of Object.keys(open)) {
      await tab.evaluate(`(${open[k]})()`);
      await tab.waitForTimeout(900);
      const docked = await feetAndControls(tab);
      if (!docked.dock) bad.push(`${k}: the stage did not dock`);
      await tab.evaluate(`(${shut[k]})()`);
      await tab.waitForTimeout(1500);
      const after = await feetAndControls(tab);
      if (after.dock) bad.push(`${k}: the dock stayed (${after.dock})`);
      if (Math.abs(after.feet - before.feet) > 8) bad.push(`${k}: the feet at ${Math.round(after.feet)} after closing, ${Math.round(before.feet)} before`);
      if (after.feet > after.pack - 8) bad.push(`${k}: the feet (${Math.round(after.feet)}) under the pack row (${Math.round(after.pack)})`);
    }
    await ctx.close();
    assert.deepEqual(bad, []);
    assert.deepEqual(errors, []);
  });
});

// Austin's iPhone 2026-11-24 (upright, Xhola Mades): a buff chip lay over the left end of the stats pill
// and the start of the street's name. Its top never took the top inset (style.css #buff-strip under
// 760 px: 2 x hud-h + 16 px), and layout C gave it no region. Now it has its own slot under the caption.
// The Home Screen app's top (#653 follow-up, Austin's iPhone after v0.65.0: "I think we cut off too much
// space up top"): a 62 px inset plus style.css --ios-fog-clear, 24 px (40 in v0.65.0).
const FOG_CLEAR = Number((/:root \{ --ios-fog-clear: (\d+)px; \}/.exec(css) || [])[1]);
const HOME_T = 62 + FOG_CLEAR;
// G1307 (#653, a player's idea; Austin 2026-11-25: "try it just above the pack row, under the stick, checked
// at iPhone and Android sizes"): the pinned quest stood over the stick and covered the street at every zoom.
// Upright it stands just above the pack row, under the stick (the stick stands up its height); it waits while
// a bag is open and a tap still opens the quest. Sideways it stays beside the stick.
describe('G1307 (#653): the pinned quest under the stick on the real game (Chrome)', { skip: !chromium && 'no playwright' }, () => {
  const LOCK_WAIT_MS = 30 * 60_000;
  const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
  const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
  let server = null;
  let chrome = null;
  before(async () => {
    const { openBrowser } = await import('../tools/qa/browser.mjs');
    const { startServer } = await import('../tools/qa/serve.mjs');
    chrome = await openBrowser({ label: 'phone-layout pinned quest test', waitMs: LOCK_WAIT_MS });
    server = await startServer({ root: join(root, 'public') });
  }, { timeout: LOCK_WAIT_MS + 60_000 });
  after(async () => {
    await chrome?.close();
    await server?.stop();
  });

  // [place, width, height, user agent, the Home Screen app (navigator.standalone and its insets), the float stick]
  const PLACES = [
    ['iPhone Home Screen app 402x874', 402, 874, IOS, true, false],
    ['iPhone 390x844', 390, 844, IOS, false, false],
    ['iPhone 390x844, stick follows your thumb', 390, 844, IOS, false, true],
    ['Android 360x629', 360, 629, ANDROID, false, false],
    ['Android 384x748', 384, 748, ANDROID, false, false],
  ];
  it('upright at iPhone and Android sizes: under the stick, over the pack row, clear of Act, Jump, the chooser and the action chip; gone while a bag is open; a tap opens the quest', { timeout: 300_000 }, async () => {
    const base = `http://127.0.0.1:${server.address().port}`;
    const bad = [];
    for (const [place, w, h, ua, app, float] of PLACES) {
      const ctx = await chrome.browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, userAgent: ua });
      await ctx.addInitScript(([standalone, fl]) => {
        try {
          localStorage.setItem('groddle-play-device', 'qa-game');
          if (fl) localStorage.setItem('groddle.floatStick', 'on');
        } catch { /* none */ }
        if (standalone) Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true, configurable: true });
      }, [app, float]);
      const tab = await ctx.newPage();
      const cdp = await ctx.newCDPSession(tab);
      await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: app ? { top: 62, bottom: 34, left: 0, right: 0 } : { top: 0, bottom: 0, left: 0, right: 0 } });
      const errors = [];
      tab.on('pageerror', (e) => errors.push(e.message));
      await tab.goto(`${base}/play/?autostart=1&questoffer=off&hstip=0&fresh=1&resetgame=1`);
      await tab.waitForFunction(() => !document.body.classList.contains('is-booting') && document.getElementById('overlay')?.classList.contains('hidden') && document.documentElement.classList.contains('phone-layout'), null, { timeout: 60_000 });
      await tab.evaluate(() => {
        for (const b of document.querySelectorAll('button')) if (b.textContent.trim() === 'Got it' && b.offsetParent) b.click();
        window.groddleQA?.questPins?.pin('animalkinship_pet_piggies');
      });
      // Read again every 150 ms (the layout pass beats at 120 ms) until two readings agree.
      const settled = async (read) => {
        let prev = await read();
        for (let i = 0; i < 20; i++) {
          await tab.waitForTimeout(150);
          const next = await read();
          if (JSON.stringify(next) === JSON.stringify(prev)) return next;
          prev = next;
        }
        return prev;
      };
      const measure = () => settled(() => tab.evaluate(() => {
        const seen = (el) => el && !el.hidden && el.checkVisibility({ visibilityProperty: true, opacityProperty: true }) && el.getBoundingClientRect().width > 0;
        const rect = (el) => {
          const r = el.getBoundingClientRect();
          return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
        };
        const chooser = document.getElementById('enter-chooser');
        const verb = document.getElementById('verb-menu');
        const pieces = {
          pin: document.getElementById('quest-pins'),
          stick: document.querySelector('.touch-stick'),
          act: document.querySelector('.touch-act'),
          jump: document.querySelector('.touch-jump'),
          pack: document.getElementById('pack-row'),
          chooser: seen(chooser) ? chooser.querySelector('.feed-picker-card, .verb-menu-card') || chooser : null,
          verbMenu: seen(verb) ? verb.querySelector('.verb-menu-card') || verb : null,
        };
        const boxes = {};
        for (const [k, el] of Object.entries(pieces)) if (seen(el)) boxes[k] = rect(el);
        const pc = document.querySelector('#game-root canvas')?.dataset.promptCss;
        if (pc) {
          const [left, top, right, bottom] = pc.split(',').map(Number);
          if (right > left) boxes.prompt = { left, top, right, bottom };
        }
        return boxes;
      }));
      // With a menu open only the card's pairs count here: the #5 test owns the menus against the controls,
      // and 'the chooser keeps off the controls on a phone' the chooser against them, the card and the pack row.
      const check = (boxes, when, only = null) => {
        for (const p of layoutProblems(boxes, { width: w, height: h })) if (!only || p.split(' ').includes(only)) bad.push(`${place} ${when}: ${p}`);
      };
      const street = await measure();
      if (!street.pin) bad.push(`${place}: no pinned quest shows`);
      else {
        if (!street.stick || street.pin.top < street.stick.bottom) bad.push(`${place}: the card ${JSON.stringify(street.pin)} is not under the stick ${JSON.stringify(street.stick)}`);
        if (!street.pack || street.pin.bottom > street.pack.top) bad.push(`${place}: the card is not over the pack row`);
        if (street.pin.left > 20) bad.push(`${place}: the card is not at the left`);
      }
      check(street, 'on the street');
      // Act opens the chooser of several things (or the verb menu): its card keeps off the card and the controls.
      const act = street.act;
      if (act) {
        await tab.touchscreen.tap((act.left + act.right) / 2, (act.top + act.bottom) / 2);
        await tab.waitForTimeout(450);
        const menu = await measure();
        if (!menu.chooser && !menu.verbMenu) bad.push(`${place}: Act opened nothing`);
        check(menu, 'with a menu open', 'pin');
        await tab.keyboard.press('Escape');
        await tab.waitForTimeout(400);
      }
      // A bag open: the card waits (Friendly: "it temporarily collapses while a bag is opened").
      await tab.evaluate(() => document.querySelector('#pack-bags .pack-bag')?.click());
      await tab.waitForTimeout(600);
      const bag = await measure();
      if (bag.pin) bad.push(`${place}: the card shows over an open bag`);
      await tab.evaluate(() => document.querySelector('#pack-bags .pack-bag')?.click());
      await tab.waitForTimeout(600);
      const back = await measure();
      if (JSON.stringify(back.pin) !== JSON.stringify(street.pin) || JSON.stringify(back.stick) !== JSON.stringify(street.stick)) bad.push(`${place}: the card or the stick moved after the bag closed`);
      // A tap on the card opens its quest in Quests.
      if (back.pin) {
        await tab.touchscreen.tap(back.pin.left + 30, (back.pin.top + back.pin.bottom) / 2);
        await tab.waitForTimeout(500);
        const opened = await tab.evaluate(() => document.documentElement.dataset.phoneSheet === 'half' && Boolean(document.getElementById('quest-panel')?.checkVisibility()));
        if (!opened) bad.push(`${place}: a tap on the card did not open Quests`);
      }
      if (errors.length) bad.push(`${place}: ${errors.join('; ')}`);
      await ctx.close();
    }
    assert.deepEqual(bad, []);
  });
});

/**
 * The chooser of several things on a phone (lane pink 2026-11-25: centred on the screen it covered Act,
 * the stick and Jump at 360x629 and 384x748, and reached into the raised stick at 390x844): it stands in
 * the street above the controls (between the stick and Act sideways), clear of the pinned quest and the
 * pack row, and with many tiles it scrolls inside itself. Glitch's disambiguator sat in the middle of the
 * location view (InteractionMenu.as 1149-1153); Glitch had no phone controls to keep off.
 */
describe('the chooser keeps off the controls on a phone (Chrome)', { skip: !chromium && 'no playwright' }, () => {
  const LOCK_WAIT_MS = 30 * 60_000;
  const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
  const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
  let server = null;
  let chrome = null;
  before(async () => {
    const { openBrowser } = await import('../tools/qa/browser.mjs');
    const { startServer } = await import('../tools/qa/serve.mjs');
    chrome = await openBrowser({ label: 'phone-layout chooser test', waitMs: LOCK_WAIT_MS });
    server = await startServer({ root: join(root, 'public') });
  }, { timeout: LOCK_WAIT_MS + 60_000 });
  after(async () => {
    await chrome?.close();
    await server?.stop();
  });

  // [place, width, height, user agent, safe-area insets (the Home Screen app's) or null]
  const PLACES = [
    ['Android 360x629', 360, 629, ANDROID, null],
    ['Android 384x748', 384, 748, ANDROID, null],
    ['iPhone 390x844', 390, 844, IOS, null],
    ['iPhone Home Screen app 402x874', 402, 874, IOS, { top: 62, bottom: 34, left: 0, right: 0 }],
    ['Android sideways 748x384', 748, 384, ANDROID, null],
    ['iPhone sideways 844x390', 844, 390, IOS, null],
    ['iPhone Home Screen app sideways 874x402', 874, 402, IOS, { top: 0, bottom: 21, left: 62, right: 62 }],
  ];
  it('stands clear of the stick, Act, Jump, the pack row and the pinned quest, and scrolls its tiles when they are many', { timeout: 400_000 }, async () => {
    const base = `http://127.0.0.1:${server.address().port}`;
    const bad = [];
    for (const [place, w, h, ua, insets] of PLACES) {
      const ctx = await chrome.browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, userAgent: ua });
      await ctx.addInitScript((standalone) => {
        try { localStorage.setItem('groddle-play-device', 'qa-game'); } catch { /* none */ }
        if (standalone) Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true, configurable: true });
      }, Boolean(insets));
      const tab = await ctx.newPage();
      const cdp = await ctx.newCDPSession(tab);
      await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: insets || { top: 0, bottom: 0, left: 0, right: 0 } });
      const errors = [];
      tab.on('pageerror', (e) => errors.push(e.message));
      await tab.goto(`${base}/play/?autostart=1&questoffer=off&hstip=0&fresh=1&resetgame=1`);
      await tab.waitForFunction(() => !document.body.classList.contains('is-booting') && document.getElementById('overlay')?.classList.contains('hidden') && document.documentElement.classList.contains('phone-layout'), null, { timeout: 60_000 });
      await tab.evaluate(() => {
        for (const b of document.querySelectorAll('button')) if (b.textContent.trim() === 'Got it' && b.offsetParent) b.click();
        window.groddleQA?.questPins?.pin('animalkinship_pet_piggies');
      });
      const settled = async (read) => {
        let prev = await read();
        for (let i = 0; i < 20; i++) {
          await tab.waitForTimeout(150);
          const next = await read();
          if (JSON.stringify(next) === JSON.stringify(prev)) return next;
          prev = next;
        }
        return prev;
      };
      const measure = () => settled(() => tab.evaluate(() => {
        const seen = (el) => el && !el.hidden && el.checkVisibility({ visibilityProperty: true, opacityProperty: true }) && el.getBoundingClientRect().width > 0;
        const rect = (el) => {
          const r = el.getBoundingClientRect();
          return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
        };
        const chooser = document.getElementById('enter-chooser');
        const grid = chooser?.querySelector('.feed-picker-grid');
        const pieces = {
          chooser: seen(chooser) ? chooser.querySelector('.feed-picker-card') : null,
          pin: document.getElementById('quest-pins'),
          stick: document.querySelector('.touch-stick'),
          act: document.querySelector('.touch-act'),
          jump: document.querySelector('.touch-jump'),
          pack: document.getElementById('pack-row'),
        };
        const boxes = {};
        for (const [k, el] of Object.entries(pieces)) if (seen(el)) boxes[k] = rect(el);
        return { boxes, tiles: grid?.children.length || 0, scrolls: grid ? grid.scrollHeight > grid.clientHeight + 1 : false, gridH: grid?.clientHeight || 0 };
      }));
      const check = (got, when) => {
        if (!got.boxes.chooser) {
          bad.push(`${place} ${when}: no chooser`);
          return;
        }
        for (const k of ['pin', 'stick', 'act', 'jump', 'pack']) if (!got.boxes[k]) bad.push(`${place} ${when}: no ${k} to check against`);
        // The chooser's pairs only (the HUD's own pairs are the tests above), and the card on the screen.
        for (const p of layoutProblems(got.boxes, { width: w, height: h })) if (p.split(' ').includes('chooser')) bad.push(`${place} ${when}: ${p}`);
      };
      const street = await measure();
      if (street.boxes.act) {
        await tab.touchscreen.tap((street.boxes.act.left + street.boxes.act.right) / 2, (street.boxes.act.top + street.boxes.act.bottom) / 2);
        await tab.waitForTimeout(450);
      }
      const few = await measure();
      check(few, `${few.tiles} tiles`);
      // Many things in reach: the tiles scroll inside the card, which stays in its room.
      await tab.evaluate(() => {
        const grid = document.querySelector('#enter-chooser .feed-picker-grid');
        const tile = grid?.firstElementChild;
        for (let i = 0; tile && i < 18; i++) grid.insertBefore(tile.cloneNode(true), grid.lastElementChild);
      });
      const many = await measure();
      check(many, `${many.tiles} tiles`);
      if (many.boxes.chooser && !many.scrolls) bad.push(`${place} ${many.tiles} tiles: the tiles do not scroll inside the card`);
      if (many.boxes.chooser && many.gridH < 90) bad.push(`${place} ${many.tiles} tiles: the tiles' box is ${many.gridH} px tall, less than a tile`);
      if (errors.length) bad.push(`${place}: ${errors.join('; ')}`);
      await ctx.close();
    }
    assert.deepEqual(bad, []);
  });
});

describe('the buff strip has its own slot (Austin 2026-11-24)', () => {
  const chip = 60;
  it('the Home Screen app\'s top is the inset plus 24 px: the pills at 90, the caption at 136 (106 and 152 in v0.65.0)', () => {
    assert.equal(HOME_T, 86);
    const r = phoneRegions({ width: 402, height: 874, safe: { t: HOME_T, b: 34 }, caption: { w: 220, h: 26 } });
    assert.equal(r.strip.top, 90);
    assert.equal(r.caption.top, 136);
  });
  const cases = [
    ['Safari tab upright', { width: 402, height: 812, safe: { t: 76, b: 34 } }],
    ['Home Screen app upright', { width: 402, height: 812, safe: { t: HOME_T, b: 34 } }],
    ['Home Screen app upright, 874 tall', { width: 402, height: 874, safe: { t: HOME_T, b: 34 } }],
    ['sideways', { width: 812, height: 402, safe: { l: 62, r: 62, b: 21 }, captionUnder: false }],
  ];
  for (const [name, at] of cases) {
    for (const n of [1, 3]) {
      it(`${name}, ${n} buff${n > 1 ? 's' : ''}: clear of the pills, the caption and its taps, the notices and the pinned quest`, () => {
        const r = phoneRegions({ ...at, caption: { w: 220, h: 26 }, pin: { w: 200, h: 56 }, buffs: { w: n * (chip + 5) - 5, h: 38 } });
        assert.ok(r.buffs && r.buffs.bottom - r.buffs.top === 38, 'a slot as tall as the strip');
        for (const k of ['strip', 'caption', 'notices', 'pin', 'stick', 'act', 'jump', 'pack']) {
          assert.equal(boxesOverlap(r.buffs, r[k]), false, `buffs vs ${k}`);
        }
        const capTaps = Math.ceil((r.caption.top + r.caption.bottom) / 2 + TAP_H / 2);
        assert.ok(r.buffs.top >= Math.max(r.caption.bottom, r.strip.bottom, at.captionUnder === false ? 0 : capTaps), 'under the caption and its taps');
        assert.ok(r.notices.top >= r.buffs.bottom + GAP, 'the notices start under it');
        assert.equal(r.buffs.left, (at.safe.l || 0) + 8, 'at the left, inside the safe area');
        assert.deepEqual(layoutProblems(r, { width: at.width, height: at.height, allow: at.captionUnder === false ? [['strip', 'caption']] : [] }), []);
      });
    }
  }
  it('no buff: an empty slot, the notices where they were', () => {
    const a = phoneRegions({ width: 402, height: 812, safe: { t: 76 }, caption: { w: 220, h: 26 } });
    assert.equal(a.buffs.bottom, a.buffs.top);
    const capTaps = Math.ceil((a.caption.top + a.caption.bottom) / 2 + TAP_H / 2);
    assert.equal(a.notices.top, Math.max(a.caption.bottom, capTaps) + GAP);
  });
  it('style.css seats it in the slot, over the older top rules, and the route card under it', () => {
    const css = readFileSync(join(root, 'public/style.css'), 'utf8');
    assert.match(css, /:root\.phone-layout\[data-ui="modern"\] #game-root:not\(\[data-sheet\]\) :is\(#buff-strip, #quest-pins ~ #buff-strip\) \{\n  top: var\(--pr-buffs-t,/);
    assert.match(css, /#game-root:not\(\[data-sheet\]\) \.route-gps \{\n  top: max\([^;]*calc\(var\(--pr-buffs-b, 0px\) \+ var\(--space-2\)\)\);/);
    const pl = readFileSync(join(root, 'public/js/ui/phone-layout.js'), 'utf8');
    assert.match(pl, /set\('--pr-buffs-t', regions\.buffs\.top\);/);
    assert.match(pl, /buffs: shown\(buffEl\) \? \{ w: buffEl\.offsetWidth, h: buffEl\.offsetHeight \} : null,/);
  });
});

// Austin's iPhone 2026-11-24 (the Home Screen app upright, "Your House", a yard with a Crop Garden):
// Decorate, Cultivate and Change Style stood over the stats and the icon pill (about 108 to 138 pt),
// hiding the counts and icons. #homes-modes kept a fixed top from before layout C (homes-feature 92 px,
// style.css PHONE6 2 x hud-h + 20 px), never taking the top inset, and layout C gave it no region. Now
// the home's buttons (and Decoration Mode's banner) have their own row under the caption, the buff
// strip and the notices under it.
describe('the home\'s buttons have their own row (Austin 2026-11-24)', () => {
  const ROW = { w: 274, h: 26 }; // Decorate, Cultivate, Change Style
  const cases = [
    ['Safari tab, 402x874', { width: 402, height: 874, safe: { t: 76, b: 34 } }],
    ['Home Screen app, 402x874', { width: 402, height: 874, safe: { t: HOME_T, b: 34 } }],
    ['375x667', { width: 375, height: 667, safe: { t: 14 } }],
    ['sideways', { width: 874, height: 402, safe: { l: 62, r: 62, b: 21 }, captionUnder: false }],
  ];
  for (const [name, at] of cases) {
    for (const buffs of [null, { w: 60, h: 38 }]) {
      it(`${name}${buffs ? ', with a buff' : ''}: clear of the pills, the caption and its taps, the buffs, the notices, the pinned quest and the controls`, () => {
        const r = phoneRegions({ ...at, caption: { w: 220, h: 26 }, pin: { w: 200, h: 56 }, buffs, homes: ROW });
        assert.ok(r.homes, 'a row for the home\'s buttons');
        assert.equal(r.homes.bottom - r.homes.top, ROW.h);
        assert.equal(r.homes.left, (at.safe.l || 0) + 8, 'at the left, inside the safe area');
        const capTaps = Math.ceil((r.caption.top + r.caption.bottom) / 2 + TAP_H / 2);
        assert.ok(r.homes.top >= Math.max(r.strip.bottom, at.captionUnder === false ? 0 : Math.max(r.caption.bottom, capTaps)), 'under the pills, the caption and its taps');
        if (buffs) assert.ok(r.buffs.top >= r.homes.bottom + GAP, 'the buff strip under it');
        assert.ok(r.notices.top >= r.homes.bottom + GAP, 'the notices under it');
        assert.deepEqual(layoutProblems(r, { width: at.width, height: at.height, allow: at.captionUnder === false ? [['strip', 'caption']] : [] }), []);
      });
    }
  }
  it('wraps on a narrow phone rather than run off it, and none shows: no row, the buffs where they were', () => {
    const narrow = phoneRegions({ width: 320, height: 568, caption: { w: 200, h: 26 }, homes: { w: 400, h: 60 } });
    assert.ok(narrow.homes.right <= 320 - 8);
    const none = phoneRegions({ width: 402, height: 874, safe: { t: 76 }, caption: { w: 220, h: 26 } });
    const homes = phoneRegions({ width: 402, height: 874, safe: { t: 76 }, caption: { w: 220, h: 26 }, homes: ROW });
    assert.equal(none.homes, null);
    assert.equal(homes.homes.top, none.buffs.top, 'the row takes the slot the buffs had');
  });
  it('beside a sideways half sheet it stands right of the column; under the Map it waits', () => {
    const half = phoneRegions({ width: 874, height: 402, safe: { l: 62, r: 62 }, sheet: 'half', captionUnder: false, caption: { w: 220, h: 26 }, homes: ROW, buffs: { w: 60, h: 38 } });
    assert.ok(half.homes.left >= half.sheet.right && !boxesOverlap(half.homes, half.buffs) && !boxesOverlap(half.homes, half.notices));
    assert.equal(phoneRegions({ width: 402, height: 874, sheet: 'map', homes: ROW }).homes, null);
  });
  it('the layout pass measures the row (or the banner) and style.css seats both in it, over the old fixed tops', () => {
    const pl = read('public/js/ui/phone-layout.js');
    assert.match(pl, /const homesEl = doc\.getElementById\('homes-modes'\);/);
    assert.match(pl, /set\('--pr-homes-t', homesAt\.top\);/);
    assert.match(css, /:root\.phone-layout\[data-ui="modern"\] #game-root #homes-modes \{\n  top: var\(--pr-homes-t,/);
    assert.match(css, /:root\.phone-layout\[data-ui="modern"\] #game-root \.hb-builder \.hb-banner \{\n  top: var\(--pr-homes-t,/);
    assert.match(css, /:root\.phone-layout\[data-ui="modern"\] #game-root #homes-sign \{ top: var\(--pr-notice-t,/);
  });
});

describe('the home\'s buttons on the real game (Chrome, Austin 2026-11-24)', { skip: !chromium && 'no playwright' }, () => {
  const LOCK_WAIT_MS = 30 * 60_000;
  const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
  let server = null;
  let chrome = null;
  before(async () => {
    const { openBrowser } = await import('../tools/qa/browser.mjs');
    const { startServer } = await import('../tools/qa/serve.mjs');
    chrome = await openBrowser({ label: 'phone-layout home buttons test', waitMs: LOCK_WAIT_MS });
    server = await startServer({ root: join(root, 'public') });
  }, { timeout: LOCK_WAIT_MS + 60_000 });
  after(async () => {
    await chrome?.close();
    await server?.stop();
  });

  // The Home Screen app: the class hook and a 62 px inset (Chrome has no env() inset, so --safe-t is set
  // as style.css resolves it there: 62 + --ios-fog-clear); a Safari tab: 62 + 14.
  const SIZES_HOME = [
    ['Safari tab 402x874', 402, 874, 62 + 14, 0, false],
    ['Home Screen app 402x874', 402, 874, HOME_T, 0, true],
    ['375x667', 375, 667, 14, 0, false],
    ['sideways 874x402', 874, 402, 0, 62, false],
  ];
  for (const [place, q] of [['in the house', 'homedemo=interior'], ['Decoration Mode', 'homedemo=decorate']]) {
    it(`${place}: the row keeps off the pills, the caption, the notices, the controls and the pack row`, { timeout: 180_000 }, async () => {
      const base = `http://127.0.0.1:${server.address().port}`;
      const ctx = await chrome.browser.newContext({ viewport: { width: 402, height: 874 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, userAgent: UA });
      await ctx.addInitScript(() => { try { localStorage.setItem('groddle-play-device', 'qa-game'); } catch { /* none */ } });
      const tab = await ctx.newPage();
      const errors = [];
      tab.on('pageerror', (e) => errors.push(e.message));
      await tab.goto(`${base}/play/?autostart=1&questoffer=off&hstip=0&fresh=1&resetgame=1&${q}`);
      await tab.waitForFunction(() => !document.body.classList.contains('is-booting') && document.getElementById('overlay')?.classList.contains('hidden') && document.documentElement.classList.contains('phone-layout'), null, { timeout: 60_000 });
      await tab.waitForTimeout(2000);
      const bad = [];
      for (const [name, w, h, st, sx, app] of SIZES_HOME) {
        await tab.setViewportSize({ width: w, height: h });
        await tab.evaluate(([st, sx, app]) => {
          const html = document.documentElement;
          html.classList.toggle('ios-home-app', app);
          html.style.setProperty('--safe-t', `${st}px`);
          html.style.setProperty('--safe-l', `${sx}px`);
          html.style.setProperty('--safe-r', `${sx}px`);
          dispatchEvent(new Event('resize'));
          window.groddleQA?.notify?.notice('A notice for the layout check, long enough for two lines on a phone.', 6000);
        }, [st, sx, app]);
        await tab.waitForTimeout(900);
        const boxes = await tab.evaluate(() => {
          const seen = (el) => el && el.checkVisibility({ visibilityProperty: true, opacityProperty: true }) && el.getBoundingClientRect().width > 0;
          const rect = (el) => {
            const r = el.getBoundingClientRect();
            return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
          };
          const pieces = {
            stats: document.getElementById('hud-stats'),
            pill: document.querySelector('.top-bar .top-actions'),
            caption: document.getElementById('street-nameplate'),
            homes: document.getElementById('homes-modes'),
            banner: document.querySelector('#game-root .hb-builder:not([hidden]) .hb-banner'),
            buffs: document.getElementById('buff-strip'),
            notices: document.querySelector('.notify-notices:not(.is-waiting)'),
            stick: document.querySelector('.touch-stick'),
            act: document.querySelector('.touch-act'),
            jump: document.querySelector('.touch-jump'),
            pack: document.getElementById('pack-row'),
          };
          const out = {};
          for (const [k, el] of Object.entries(pieces)) if (seen(el) && (k !== 'notices' || el.children.length)) out[k] = rect(el);
          return out;
        });
        const row = boxes.homes || boxes.banner;
        if (!row) bad.push(`${name}: no home row`);
        else {
          // The builder's own tray and controls are its business (Decoration Mode's tray takes the pack's place).
          for (const k of ['stats', 'pill', 'caption', 'buffs', 'notices', 'stick', 'act', 'jump', 'pack']) {
            if (boxes[k] && boxesOverlap(row, boxes[k])) bad.push(`${name}: the home row ${JSON.stringify(row)} overlaps ${k} ${JSON.stringify(boxes[k])}`);
          }
        }
      }
      await ctx.close();
      assert.deepEqual(bad, []);
      assert.deepEqual(errors, []);
    });
  }
});

// SKY FILL (Austin's iPhone 2026-11-24, the Home Screen app upright, in his back yard: "Go ahead and
// fill the top part for my screen"): the yard is shorter than the screen, so the stage held it under a
// flat dark band (#2a2a2a) from the strip at 62 pt down to the yard's sky at about 245 pt. Now the house
// reaches up to the strip (js/location-view.js PHONE_HOME_MIN_VIEW_W), and whatever band a short scene
// still leaves under the strip is the scene carried on up: the colour the canvas draws at its top edge
// (game.js sampleStageSkyEdge), the yard's sky or a Towers hall's wall, never the dark border.
describe('a short scene on an upright phone leaves no flat dark band (Chrome, Austin 2026-11-24)', { skip: !chromium && 'no playwright' }, () => {
  const LOCK_WAIT_MS = 30 * 60_000;
  const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
  let server = null;
  let chrome = null;
  before(async () => {
    const { openBrowser } = await import('../tools/qa/browser.mjs');
    const { startServer } = await import('../tools/qa/serve.mjs');
    chrome = await openBrowser({ label: 'phone-layout sky fill test', waitMs: LOCK_WAIT_MS });
    server = await startServer({ root: join(root, 'public') });
  }, { timeout: LOCK_WAIT_MS + 60_000 });
  after(async () => {
    await chrome?.close();
    await server?.stop();
  });

  // [place, width, height, Home Screen app (navigator.standalone and a 62 px inset)]
  const PLACES = [
    ['Home Screen app 402x874', 402, 874, true],
    ['Safari tab 402x874', 402, 874, false],
    ['375x667', 375, 667, false],
  ];
  const SCENES = [
    ['the back yard', 'homedemo=interior&homex=-330'],
    // A Towers hall: its far layer is the hall's wall, so its blue sky gradient never shows (the band once took that blue).
    ['Hakusan Heaps Towers', 'streetdemo=GHVUFJ6HGRU2V0E'],
  ];
  for (const [scene, q] of SCENES) {
    it(`${scene}: at 402x874 (the Home Screen app and a Safari tab) and 375x667 the top is the scene, not a flat dark band`, { timeout: 240_000 }, async () => {
      const base = `http://127.0.0.1:${server.address().port}`;
      const bad = [];
      for (const [place, w, h, app] of PLACES) {
        const ctx = await chrome.browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, userAgent: UA });
        await ctx.addInitScript((standalone) => {
          try { localStorage.setItem('groddle-play-device', 'qa-game'); } catch { /* none */ }
          if (standalone) Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true, configurable: true });
        }, app);
        const tab = await ctx.newPage();
        const cdp = await ctx.newCDPSession(tab);
        await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: app ? { top: 62, bottom: 34, left: 0, right: 0 } : { top: 0, bottom: 0, left: 0, right: 0 } });
        const errors = [];
        tab.on('pageerror', (e) => errors.push(e.message));
        await tab.goto(`${base}/play/?autostart=1&questoffer=off&hstip=0&fresh=1&resetgame=1&${q}`);
        await tab.waitForFunction(() => !document.body.classList.contains('is-booting') && document.getElementById('overlay')?.classList.contains('hidden') && document.documentElement.classList.contains('phone-layout'), null, { timeout: 60_000 });
        await tab.waitForTimeout(3500);
        const m = await tab.evaluate(() => {
          const c = document.querySelector('#game-root > canvas[role="application"]').getBoundingClientRect();
          const strip = parseFloat(getComputedStyle(document.body, '::before').height) || 0;
          const hud = [...document.querySelectorAll('#hud-stats, .top-bar .top-actions, #street-nameplate, #homes-modes, #buff-strip, .notify-notices > *, .touch-stick, .touch-act, .touch-jump, .street-prompt, .quoin-notice')]
            .filter((el) => el.checkVisibility() && el.getBoundingClientRect().width > 0)
            .map((el) => { const r = el.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; });
          // #654: upright the canvas stands in the street's band, under the top bar; the band over it carries the
          // canvas's own top edge on up (the colour read back there, game.js sampleStageSkyEdge).
          const canvas = document.querySelector('#game-root > canvas[role="application"]');
          const framed = document.getElementById('game-root').hasAttribute('data-stage-framed');
          const edge = /^#[0-9a-f]{6}$/i.test(canvas.dataset.stageSkyEdge || '') ? [1, 3, 5].map((i) => parseInt(canvas.dataset.stageSkyEdge.slice(i, i + 2), 16)) : null;
          return { top: c.top, strip, hud, app: document.documentElement.classList.contains('ios-home-app'), framed, edge };
        });
        if (m.app !== app) bad.push(`${place}: the Home Screen hook is ${m.app}`);
        // The scene reaches the strip, or the band left over it is the scene carried on up.
        if (m.top - m.strip > 2) {
          const covered = (x, y) => m.hud.some(([l, t, r, b]) => x >= l - 2 && x <= r + 2 && y >= t - 2 && y <= b + 2);
          const under = Math.round(m.top + 30); // the canvas's top colour, under the band's fade (28 px)
          const spots = [];
          for (const y of [m.top - 3, (m.strip + m.top) / 2]) {
            for (let x = 6; x < w; x += 12) if (!covered(x, y)) spots.push([x, Math.round(y)]);
          }
          const shot = (await tab.screenshot()).toString('base64');
          const got = await tab.evaluate(async ([b64, spots, under, w]) => {
            const img = new Image();
            img.src = `data:image/png;base64,${b64}`;
            await img.decode();
            const c = document.createElement('canvas');
            c.width = img.width;
            c.height = img.height;
            const g = c.getContext('2d');
            g.drawImage(img, 0, 0);
            const at = (x, y) => [...g.getImageData(x, y, 1, 1).data.slice(0, 3)];
            // The canvas row's main colour (the most common, 16 levels a channel).
            const groups = new Map();
            for (let x = 4; x < w; x += 8) {
              const p = at(x, under);
              const k = p.map((v) => v >> 4).join(',');
              groups.set(k, [...(groups.get(k) || []), p]);
            }
            const main = [...groups.values()].sort((a, b) => b.length - a.length)[0];
            return { band: spots.map(([x, y]) => at(x, y)), row: [0, 1, 2].map((i) => Math.round(main.reduce((t, p) => t + p[i], 0) / main.length)) };
          }, [shot, spots, under, w]);
          // #654: under the top bar the canvas's top row 30 px down is often under the notices; its edge as read back is the scene's top colour.
          if (m.framed) {
            if (!m.edge) bad.push(`${place}: no colour read back from the canvas's top edge`);
            else got.row = m.edge;
          }
          if (spots.length < 4) bad.push(`${place}: only ${spots.length} spots of the band clear of the HUD`);
          for (const [i, [x, y]] of spots.entries()) {
            const px = got.band[i];
            if (px.every((v) => Math.abs(v - 0x2a) <= 3)) bad.push(`${place}: (${x}, ${y}) is the flat dark band ${px}`);
            else if (px.some((v, k) => Math.abs(v - got.row[k]) > 24)) bad.push(`${place}: (${x}, ${y}) ${px} is not the scene's top colour ${got.row}`);
          }
        }
        if (errors.length) bad.push(`${place}: ${errors.join('; ')}`);
        await ctx.close();
      }
      assert.deepEqual(bad, []);
    });
  }

  // Coordinator 2026-11-24: reading the canvas back is a GPU sync that can hitch a phone's frame. It
  // reads on a scene's arrival (and once as its art loads), then never while the camera holds still.
  // #681 (Austin's ruling 2026-11-25): a short scene's canvas grows up by the camera's drop, so the back
  // yard fills a Safari tab whole with no band left; the read-back budget is kept on scenes that still
  // leave one (a Towers hall, Hell Bar).
  const BAND_SCENES = [SCENES[1], ['Hell Bar', 'streetdemo=GA5FPUNAI7P2NVF']];
  // #654 (Austin's ruling 2026-11-25): upright the street stands between the top bar and the controls, so the
  // yard fills that band (the street's room) with no held band left inside it, not the screen from its top.
  it('#681: the back yard fills a Safari tab 402x874 whole from its top, with no band left', { timeout: 120_000 }, async () => {
    const base = `http://127.0.0.1:${server.address().port}`;
    const ctx = await chrome.browser.newContext({ viewport: { width: 402, height: 874 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, userAgent: UA });
    await ctx.addInitScript(() => { try { localStorage.setItem('groddle-play-device', 'qa-game'); } catch { /* none */ } });
    const tab = await ctx.newPage();
    await tab.goto(`${base}/play/?autostart=1&questoffer=off&hstip=0&fresh=1&resetgame=1&${SCENES[0][1]}`);
    await tab.waitForFunction(() => !document.body.classList.contains('is-booting') && document.getElementById('overlay')?.classList.contains('hidden') && document.documentElement.classList.contains('phone-layout'), null, { timeout: 60_000 });
    await tab.waitForTimeout(3500);
    const m = await tab.evaluate(() => {
      const c = document.querySelector('#game-root > canvas[role="application"]');
      const root = document.getElementById('game-root');
      const regions = JSON.parse(c.dataset.phoneRegions || '{}');
      return { top: c.getBoundingClientRect().top - root.getBoundingClientRect().top, bottom: c.getBoundingClientRect().bottom - root.getBoundingClientRect().top, band: regions.street };
    });
    await ctx.close();
    assert.ok(m.band, 'an upright street band');
    assert.ok(Math.abs(m.top - m.band.top) <= 1, `the canvas reaches the band's top (${m.top} vs ${m.band.top})`);
    assert.ok(Math.abs(m.bottom - m.band.bottom) <= 1, `the canvas reaches the band's foot (${m.bottom} vs ${m.band.bottom})`);
  });
  it('the band reads the canvas back on arrival, then not at all while the camera holds still (Safari tab 402x874)', { timeout: 180_000 }, async (t) => {
    const base = `http://127.0.0.1:${server.address().port}`;
    const bad = [];
    for (const [scene, q] of BAND_SCENES) {
      const ctx = await chrome.browser.newContext({ viewport: { width: 402, height: 874 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, userAgent: UA });
      await ctx.addInitScript(() => { try { localStorage.setItem('groddle-play-device', 'qa-game'); } catch { /* none */ } });
      const tab = await ctx.newPage();
      await tab.goto(`${base}/play/?autostart=1&questoffer=off&hstip=0&fresh=1&resetgame=1&${q}`);
      await tab.waitForFunction(() => !document.body.classList.contains('is-booting') && document.getElementById('overlay')?.classList.contains('hidden') && document.documentElement.classList.contains('phone-layout'), null, { timeout: 60_000 });
      await tab.waitForTimeout(4000);
      const read = () => tab.evaluate(() => {
        const c = document.querySelector('#game-root > canvas[role="application"]');
        return { reads: Number(c.dataset.stageSkyReads || 0), ms: c.dataset.stageSkyReadMs || '', fill: document.getElementById('game-root').hasAttribute('data-stage-sky-fill'), cam: [c.dataset.cameraX, c.dataset.cameraY].join(',') };
      });
      const first = await read();
      await tab.waitForTimeout(3000);
      const later = await read();
      t.diagnostic(`${scene}: ${first.reads} read(s) after arrival, ${later.reads - first.reads} in 3 s standing still; read cost ${later.ms} ms`);
      if (!first.fill) bad.push(`${scene}: no band to fill`);
      if (!(first.reads >= 1 && first.reads <= 3)) bad.push(`${scene}: ${first.reads} reads in the first 4 s (arrival and settle only)`);
      if (later.reads !== first.reads) bad.push(`${scene}: ${later.reads - first.reads} reads while nothing moved`);
      await ctx.close();
    }
    assert.deepEqual(bad, []);
  });
});

describe('G1314: the notices keep above Camera Mode\'s Snap button (pure)', () => {
  it('upright and sideways, the notices end above the Snap button while it shows, and under a sheet it is covered', () => {
    for (const [w, h] of [[390, 844], [360, 629], [844, 390]]) {
      const plain = phoneRegions({ width: w, height: h });
      // Where style.css stands it: upright over Act at the right, sideways left of Act at Jump's foot.
      const snap = h > w
        ? { left: w - 12 - 68, top: plain.act.top - 12 - 68, right: w - 12, bottom: plain.act.top - 12 }
        : { left: w - 170 - 68, top: plain.jump.bottom - 68, right: w - 170, bottom: plain.jump.bottom };
      const r = phoneRegions({ width: w, height: h, snap });
      assert.deepEqual(r.snap, snap);
      assert.ok(r.notices.bottom <= snap.top - GAP, `${w}x${h}: notices end at ${r.notices.bottom}, the Snap button's top ${snap.top}`);
      for (const k of ['stick', 'act', 'jump', 'pack', 'strip', 'caption']) assert.equal(boxesOverlap(snap, r[k]), false, `${w}x${h}: the Snap button on ${k}`);
      assert.equal(phoneRegions({ width: w, height: h, snap, sheet: 'half' }).snap, null);
    }
  });
});

/**
 * G1314 (Austin 2026-11-25: phone players could not snap, Enter was the only way): Camera Mode's round
 * Snap button on a phone with the Snapshottery card keeps off the stick, Act and Jump (measured before
 * Camera Mode, where they stand), Done, the whole-house button and every other piece, at 390x844,
 * 360x629 and sideways, in the street and in the house; a tap takes the Snap (solo: the Download card).
 */
describe('G1314: Camera Mode\'s Snap button on a phone (Chrome)', { skip: !chromium && 'no playwright' }, () => {
  const LOCK_WAIT_MS = 30 * 60_000;
  const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
  let server = null;
  let chrome = null;
  before(async () => {
    const { openBrowser } = await import('../tools/qa/browser.mjs');
    const { startServer } = await import('../tools/qa/serve.mjs');
    chrome = await openBrowser({ label: 'phone-layout camera snap test', waitMs: LOCK_WAIT_MS });
    server = await startServer({ root: join(root, 'public') });
  }, { timeout: LOCK_WAIT_MS + 60_000 });
  after(async () => {
    await chrome?.close();
    await server?.stop();
  });

  const ready = () => !document.body.classList.contains('is-booting') && document.getElementById('overlay')?.classList.contains('hidden') && document.documentElement.classList.contains('phone-layout');
  /** Every piece on screen, and where the controls stand (Camera Mode hides them). */
  const measure = () => {
    const seen = (el) => el && el.checkVisibility({ visibilityProperty: true, opacityProperty: true }) && el.getBoundingClientRect().width > 0;
    const rect = (el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    };
    const pieces = {
      stats: document.getElementById('hud-stats'),
      pill: document.querySelector('.top-bar .top-actions'),
      caption: document.getElementById('street-nameplate'),
      homes: document.getElementById('homes-modes'),
      buffs: document.getElementById('buff-strip'),
      notices: document.querySelector('.notify-notices:not(.is-waiting)'),
      pin: document.getElementById('quest-pins'),
      stick: document.querySelector('.touch-stick'),
      act: document.querySelector('.touch-act'),
      jump: document.querySelector('.touch-jump'),
      pack: document.getElementById('pack-row'),
      label: document.querySelector('.camera-mode-label'),
      done: document.querySelector('.camera-mode-done'),
      whole: document.querySelector('.camera-mode-whole'),
      snap: document.querySelector('.camera-mode-snap'),
    };
    const out = {};
    for (const [k, el] of Object.entries(pieces)) if (seen(el) && (k !== 'notices' || el.children.length)) out[k] = rect(el);
    return out;
  };
  const open = async (q, w, h) => {
    const base = `http://127.0.0.1:${server.address().port}`;
    const ctx = await chrome.browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, userAgent: UA });
    await ctx.addInitScript(() => { try { localStorage.setItem('groddle-play-device', 'qa-game'); } catch { /* none */ } });
    const tab = await ctx.newPage();
    const errors = [];
    tab.on('pageerror', (e) => errors.push(e.message));
    await tab.goto(`${base}/play/?autostart=1&questoffer=off&hstip=0&fresh=1&resetgame=1&${q}`);
    await tab.waitForFunction(ready, null, { timeout: 60_000 });
    await tab.waitForTimeout(2000);
    await tab.evaluate(() => { for (const b of document.querySelectorAll('button')) if (b.textContent.trim() === 'Got it' && b.offsetParent) b.click(); });
    return { ctx, tab, errors };
  };
  /** Camera Mode by the Menu's row, as a phone player opens it. */
  const enterCamera = async (tab) => {
    await tab.tap('#more-btn');
    await tab.tap('#menu-camera-btn');
    await tab.waitForFunction(() => document.querySelector('#game-root canvas')?.dataset.cameraMode === '1', null, { timeout: 10_000 });
    await tab.waitForTimeout(300);
  };
  const leaveCamera = async (tab) => {
    await tab.tap('.camera-mode-done');
    await tab.waitForFunction(() => document.querySelector('#game-root canvas')?.dataset.cameraMode === '0', null, { timeout: 10_000 });
    await tab.waitForTimeout(300);
  };

  for (const [place, q, whole] of [['on a street', 'snapcard=1', false], ['in the house', 'snapcard=1&homedemo=interior', true]]) {
    it(`${place}: the Snap button keeps off the controls' places and every other piece at 390x844, 360x629 and 844x390`, { timeout: 240_000 }, async () => {
      const { ctx, tab, errors } = await open(q, 390, 844);
      const bad = [];
      for (const [w, h] of [[390, 844], [360, 629], [844, 390]]) {
        await tab.setViewportSize({ width: w, height: h });
        await tab.evaluate(() => {
          dispatchEvent(new Event('resize'));
          window.groddleQA?.questPins?.pin('animalkinship_pet_piggies');
        });
        await tab.waitForTimeout(900);
        const before = await tab.evaluate(measure);
        await enterCamera(tab);
        // Notices while looking (a toast such as "Get the Snapshottery upgrade first." shows here) keep above it.
        await tab.evaluate(() => {
          for (let i = 0; i < 3; i++) window.groddleQA?.notify?.notice(`Notice ${i + 1} for the layout check, long enough for two lines on a phone.`, 6000);
        });
        await tab.waitForTimeout(700);
        const during = await tab.evaluate(measure);
        const where = `${w}x${h} ${place}`;
        if (!during.snap) bad.push(`${where}: no Snap button`);
        else {
          for (const k of ['stick', 'act', 'jump']) if (!before[k]) bad.push(`${where}: no ${k} to measure`);
          // Where the controls stand when they show (Camera Mode hides them).
          for (const k of ['stick', 'act', 'jump', 'pin']) if (before[k] && boxesOverlap(during.snap, before[k])) bad.push(`${where}: the Snap button ${JSON.stringify(during.snap)} is on ${k}'s place ${JSON.stringify(before[k])}`);
          for (const [k, b] of Object.entries(during)) if (k !== 'snap' && boxesOverlap(during.snap, b)) bad.push(`${where}: the Snap button ${JSON.stringify(during.snap)} overlaps ${k} ${JSON.stringify(b)}`);
          if (during.snap.left < 0 || during.snap.top < 0 || during.snap.right > w || during.snap.bottom > h) bad.push(`${where}: the Snap button is off the screen`);
          if (during.snap.right - during.snap.left < 44 || during.snap.bottom - during.snap.top < 44) bad.push(`${where}: the Snap button is under 44 px`);
          // Upright: the Snap button stands where the thumb is, in the lower half, at the right.
          if (h > w && (during.snap.top < h / 2 || during.snap.left < w / 2)) bad.push(`${where}: the Snap button is not in the lower right`);
        }
        if (!during.done) bad.push(`${where}: no Done`);
        if (whole && !during.whole) bad.push(`${where}: no whole-house button at home`);
        if (!whole && during.whole) bad.push(`${where}: a whole-house button away from home`);
        await leaveCamera(tab);
      }
      await ctx.close();
      assert.deepEqual(bad, []);
      assert.deepEqual(errors, []);
    });
  }

  it('a tap on Snap takes the Snap (solo: the Download card); without the card there is no button', { timeout: 180_000 }, async () => {
    for (const [w, h] of [[390, 844], [360, 629]]) {
      const { ctx, tab, errors } = await open('snapcard=1', w, h);
      await enterCamera(tab);
      await tab.tap('.camera-mode-snap');
      await tab.waitForFunction(() => window.groddleSnaps?.state?.().dialog !== 'closed', null, { timeout: 10_000 });
      const st = await tab.evaluate(() => ({ snaps: window.groddleSnaps.state(), taps: document.querySelector('#game-root canvas')?.dataset.cameraSnapTaps }));
      assert.notEqual(st.snaps.dialog, 'closed', `${w}x${h}: the Snap's card opened`);
      assert.match(String(st.snaps.size), /^\d+x\d+$/, `${w}x${h}: a picture was drawn`);
      assert.equal(st.taps, '1');
      assert.deepEqual(errors, []);
      await ctx.close();
    }
    const { ctx, tab } = await open('', 390, 844);
    await enterCamera(tab);
    assert.equal(await tab.evaluate(() => Boolean(document.querySelector('.camera-mode-snap')?.checkVisibility())), false, 'no Snap button without the card');
    await ctx.close();
  });

  it('computers keep Enter and no Snap button', { timeout: 120_000 }, async () => {
    const base = `http://127.0.0.1:${server.address().port}`;
    const ctx = await chrome.browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    const tab = await ctx.newPage();
    await tab.goto(`${base}/play/?autostart=1&questoffer=off&hstip=0&fresh=1&resetgame=1&snapcard=1&camerademo=1`);
    await tab.waitForFunction(() => document.querySelector('#game-root canvas')?.dataset.cameraMode === '1', null, { timeout: 60_000 });
    await tab.waitForTimeout(300);
    assert.equal(await tab.evaluate(() => Boolean(document.querySelector('.camera-mode-snap')?.checkVisibility())), false);
    await ctx.close();
  });
});
