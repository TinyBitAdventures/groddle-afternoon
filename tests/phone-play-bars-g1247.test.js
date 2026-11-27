/**
 * G1247 (found by lane homebtnk): on a phone (layout C) a game's or a room's own bar kept a fixed top
 * from before the phone layout that never took the status bar inset: the party bar with its clock and
 * Leave party (52 px), the quest room's card (66 px) and the caption under the quest pill, Game of
 * Crowns' clock (76 px into its board) and a race's board with Leave race. In the Home Screen app
 * (a 62 px inset) they stood in the status bar or over the stats; in a tab over the caption.
 * js/ui/phone-layout.js now gives each a spot (`play`): top centre under the caption, the home's row
 * and the buffs, one under another, the notices under them; under the Map they wait. Desktop and
 * Classic keep theirs. The quest caption stood right under the pill, inside the caption's 44 px taps
 * (G1222) and over the buff strip's slot.
 * A new idea, not Glitch's: Glitch had no phone layout.
 * Run: node --test tests/phone-play-bars-g1247.test.js
 */
import { after as afterAll, before as beforeAll, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAP, PLAY_PIECES, TAP_H, boxesOverlap, layoutProblems, phoneRegions } from '../public/js/ui/phone-layout.js?v=7ebe8992';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'public/style.css'), 'utf8');
const FOG_CLEAR = Number((/:root \{ --ios-fog-clear: (\d+)px; \}/.exec(css) || [])[1]);
const HOME_T = 62 + FOG_CLEAR;

describe('G1247: the play bars have their own spot (pure)', () => {
  const party = { id: 'party', w: 300, h: 32 };
  const race = { id: 'race', w: 380, h: 82 };
  const cases = [
    ['Home Screen app 402x874', { width: 402, height: 874, safe: { t: HOME_T, b: 34 } }],
    ['Safari tab 402x874', { width: 402, height: 874, safe: { t: 76, b: 34 } }],
    ['375x667', { width: 375, height: 667, safe: { t: 14 } }],
    ['sideways 874x402', { width: 874, height: 402, safe: { l: 62, r: 62, b: 21 }, captionUnder: false }],
  ];
  for (const [name, o] of cases) {
    it(`${name}: under the caption, the home's row and the buffs, the notices under them`, () => {
      const r = phoneRegions({ ...o, caption: { w: 220, h: 26 }, homes: { w: 260, h: 34 }, buffs: { w: 60, h: 38 }, play: [party, race] });
      const p = r.playAt.party;
      const q = r.playAt.race;
      assert.ok(p && q, 'both have a spot');
      assert.ok(p.top >= (o.safe.t || 0), 'below the status bar');
      for (const k of ['strip', 'caption', 'homes', 'buffs']) {
        assert.equal(boxesOverlap(p, r[k]), false, `party clear of ${k}`);
        assert.equal(boxesOverlap(q, r[k]), false, `race clear of ${k}`);
      }
      assert.equal(q.top, p.bottom + GAP, 'one under the other');
      assert.ok(r.notices.top >= q.bottom + GAP, 'the notices under them');
      assert.ok(Math.abs((p.left + p.right) / 2 - (r.notices.left + r.notices.right) / 2) <= 1, 'centred in the notices\' room');
      assert.deepEqual(layoutProblems(r, { width: o.width, height: o.height }).filter((x) => /play/.test(x)), []);
    });
  }

  it('nothing to place: no spot, the notices as before; under the Map they wait', () => {
    const o = { width: 402, height: 874, safe: { t: HOME_T, b: 34 }, caption: { w: 220, h: 26 } };
    const none = phoneRegions(o);
    assert.equal(none.play, null);
    assert.deepEqual(none.playAt, {});
    assert.equal(phoneRegions({ ...o, play: [party] }).notices.top, none.notices.top + party.h + GAP);
    assert.deepEqual(phoneRegions({ ...o, sheet: 'map', play: [party] }).playAt, {});
  });

  it('the pieces, and the style that puts them there on a phone only', () => {
    assert.deepEqual(PLAY_PIECES.map(([id]) => id), ['party', 'qroom', 'qcap', 'crowns', 'race']);
    for (const [id, sel] of PLAY_PIECES.filter(([id]) => id !== 'qcap')) {
      assert.match(css, new RegExp(`:root\\.phone-layout\\[data-ui="modern"\\] #game-root ${sel} \\{ top: var\\(--pr-${id}-t,`));
    }
    assert.match(readFileSync(join(root, 'public/js/features/quest-plate-feature.js'), 'utf8'), /html\.style\.getPropertyValue\('--pr-qcap-t'\)/);
  });
});

let chromium = null;
try { chromium = (await import('playwright')).chromium; } catch { /* no Playwright */ }

describe('G1247 in Chrome: no play bar over the pills, the caption, the buffs or the notices', { skip: !chromium && 'no playwright' }, () => {
  const LOCK_WAIT_MS = 30 * 60_000;
  const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
  let server = null;
  let chrome = null;
  beforeAll(async () => {
    const { openBrowser } = await import('../tools/qa/browser.mjs');
    const { startServer } = await import('../tools/qa/serve.mjs');
    chrome = await openBrowser({ label: 'phone-play-bars g1247 test', waitMs: LOCK_WAIT_MS });
    server = await startServer({ root: join(root, 'public') });
  }, { timeout: LOCK_WAIT_MS + 60_000 });
  afterAll(async () => {
    await chrome?.close();
    await server?.stop();
  });

  // The Home Screen app: the class hook and its inset (Chrome has no env() inset, so --safe-t is set as
  // style.css resolves it there); a Safari tab: 62 + 14; sideways: 62 at the sides.
  const SIZES = [
    ['Home Screen app 402x874', 402, 874, HOME_T, 0, true],
    ['Safari tab 402x874', 402, 874, 62 + 14, 0, false],
    ['375x667', 375, 667, 14, 0, false],
    ['sideways 874x402', 874, 402, 0, 62, false],
  ];
  const SCENES = [
    ['a party', 'partydemo=moon&partyautoplay=hold', ['#party-hud'], 8000],
    ['a quest room\'s caption', 'questdemo=numismatic_hustle&questautoplay=ready', ['#quest-caption'], 0],
    ['Game of Crowns with the crown', 'racedemo=it_game&raceassist=1&raceautoplay=1', ['#crowns-hud', '[data-crowns-clock]'], 9000],
    ['a race', 'racedemo=space_race&raceassist=1', ['#race-hud', '.race-forfeit'], 9000],
  ];
  for (const [scene, q, sels, wait] of SCENES) {
    it(`${scene}: at 402x874 (app and tab), 375x667 and sideways`, { timeout: 180_000 }, async () => {
      const base = `http://127.0.0.1:${server.address().port}`;
      const ctx = await chrome.browser.newContext({ viewport: { width: 402, height: 874 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, userAgent: UA });
      await ctx.addInitScript(() => { try { localStorage.setItem('groddle-play-device', 'qa-game'); } catch { /* none */ } });
      const tab = await ctx.newPage();
      const errors = [];
      tab.on('pageerror', (e) => errors.push(e.message));
      await tab.goto(`${base}/play/?autostart=1&questoffer=off&hstip=0&fresh=1&resetgame=1&${q}`);
      await tab.waitForFunction(() => !document.body.classList.contains('is-booting') && document.documentElement.classList.contains('phone-layout'), null, { timeout: 60_000 });
      await tab.waitForTimeout(wait);
      // The quest caption comes a few seconds into the room: the check starts once it shows.
      if (sels[0] === '#quest-caption') await tab.waitForFunction(() => document.querySelector('#quest-caption.is-on'), null, { timeout: 15_000 });
      const bad = [];
      let checked = 0;
      for (const [name, w, h, st, sx, app] of SIZES) {
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
        const got = await tab.evaluate(([sels, tapH]) => {
          const seen = (el) => el && el.checkVisibility({ visibilityProperty: true }) && el.getBoundingClientRect().width > 0;
          const rect = (el) => {
            const r = el.getBoundingClientRect();
            return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
          };
          const hud = {
            stats: document.getElementById('hud-stats'),
            pill: document.querySelector('.top-bar .top-actions'),
            caption: document.getElementById('street-nameplate'),
            homes: document.getElementById('homes-modes'),
            buffs: document.getElementById('buff-strip'),
            notices: document.querySelector('.notify-notices:not(.is-waiting)'),
          };
          const out = { hud: {}, bars: {} };
          for (const [k, el] of Object.entries(hud)) if (seen(el) && (k !== 'notices' || el.children.length)) out.hud[k] = rect(el);
          // G1222: the caption's taps (favor, the street map's button) are TAP_H tall, centred on it.
          if (out.hud.caption) {
            const c = out.hud.caption;
            const mid = (c.top + c.bottom) / 2;
            out.hud.captionTaps = { left: c.left, right: c.right, top: mid - tapH / 2, bottom: mid + tapH / 2 };
          }
          for (const s of sels) {
            const el = document.querySelector(s);
            if (seen(el)) out.bars[s] = rect(el);
          }
          return out;
        }, [sels, TAP_H]);
        for (const [sel, b] of Object.entries(got.bars)) {
          checked++;
          if (b.top < st) bad.push(`${name}: ${sel} top ${Math.round(b.top)} is in the status bar (${st})`);
          for (const [k, r] of Object.entries(got.hud)) {
            // A piece inside its own bar is not an overlap with it; the rest must stay clear.
            if (boxesOverlap(b, r)) bad.push(`${name}: ${sel} ${JSON.stringify(b)} overlaps ${k} ${JSON.stringify(r)}`);
          }
        }
      }
      await ctx.close();
      assert.ok(checked > 0, `${scene}: a bar showed`);
      assert.deepEqual(bad, []);
      assert.deepEqual(errors, []);
    });
  }
});
