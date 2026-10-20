// Long-session player simulation for https://groddle.localhost.
//
// Usage: node tools/playtest.mjs <scenario...> [--width=1280] [--height=860]
//          [--swiftshader] [--headed] [--out=shots/playtest] [--fresh]
// Scenarios: newplayer, travel, long, resize, perf, all.
//
// Plays like a real player: no demo/QA params beyond autostart/fresh/resetgame,
// keyboard walking, E menus, HUD buttons, signposts, the Map. It drives one
// browser context per scenario so localStorage survives reloads. Reads world
// positions through window.groddleQA.snapshot() (read-only) and the canvas
// data-* attributes. Headless Chrome uses the Metal GPU through ANGLE (60 fps)
// unless --swiftshader is given, so timers fire in real time.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const flags = Object.fromEntries(argv.filter((a) => a.startsWith('--')).map((a) => {
  const [k, v] = a.slice(2).split('=');
  return [k, v ?? true];
}));
let scenarios = argv.filter((a) => !a.startsWith('--'));
if (!scenarios.length || scenarios.includes('all')) scenarios = ['newplayer', 'travel', 'long', 'resize', 'perf'];
const OUT = flags.out || 'shots/playtest';
const BASE = 'https://groddle.localhost/';
const NOISE = /GL Driver Message|AudioContext was not allowed|WebGL: INVALID|GPU stall|swiftshader/i;

function log(...a) {
  const t = new Date().toISOString().slice(11, 19);
  console.log(`[${t}]`, ...a);
}

class Session {
  constructor(name, browser, { width = 1280, height = 860 } = {}) {
    this.name = name;
    this.browser = browser;
    this.viewport = { width: Number(width), height: Number(height) };
    this.dir = join(OUT, name);
    mkdirSync(this.dir, { recursive: true });
    this.issues = [];
    this.notes = [];
    this.shots = 0;
  }

  async open() {
    this.context = await this.browser.newContext({ viewport: this.viewport, ignoreHTTPSErrors: true });
    await this.context.addInitScript(() => {
      window.__pt = { longTasks: [], longTaskMs: 0 };
      try {
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) {
            window.__pt.longTasks.push(Math.round(e.duration));
            window.__pt.longTaskMs += e.duration;
          }
        }).observe({ type: 'longtask', buffered: true });
      } catch (_) { /* no longtask support */ }
    });
    this.page = await this.context.newPage();
    this.cdp = await this.context.newCDPSession(this.page);
    await this.cdp.send('Performance.enable');
    this.page.on('console', (m) => {
      const text = m.text();
      if (NOISE.test(text)) return;
      if (m.type() === 'error') this.issue('console-error', text);
      else if (m.type() === 'warning') this.issue('console-warning', text);
    });
    this.page.on('pageerror', (e) => this.issue('pageerror', `${e.message} @ ${String(e.stack || '').split('\n').slice(1, 4).join(' | ')}`));
    this.page.on('response', (r) => {
      if (r.status() >= 400) this.issue(`http-${r.status()}`, r.url().replace(BASE, ''));
    });
    return this;
  }

  issue(kind, text) {
    const last = this.issues[this.issues.length - 1];
    if (last && last.kind === kind && last.text === text) {
      last.count++;
      return;
    }
    this.issues.push({ kind, text: String(text).slice(0, 400), count: 1, step: this.step || '' });
    log(`  ! ${kind}: ${String(text).slice(0, 200)}`);
  }

  note(text) {
    this.notes.push({ step: this.step || '', text });
    log(`  * ${text}`);
  }

  async goto(query, waitMs = 9000) {
    this.step = `goto ${query}`;
    await this.page.goto(`${BASE}${query}`, { waitUntil: 'load' });
    await this.waitFor(() => !!window.groddleQA && !document.body.classList.contains('is-booting'), 30000);
    await this.wait(waitMs);
  }

  wait(ms) {
    return this.page.waitForTimeout(ms);
  }

  async waitFor(fn, timeout = 10000, arg) {
    try {
      await this.page.waitForFunction(fn, arg, { timeout, polling: 200 });
      return true;
    } catch (_) {
      return false;
    }
  }

  async snap() {
    return this.page.evaluate(() => window.groddleQA?.snapshot?.() || null).catch(() => null);
  }

  async data() {
    return this.page.evaluate(() => ({ ...(document.querySelector('canvas')?.dataset || {}) }));
  }

  /** Pack contents {classTsid: count} plus HUD currencies. */
  async pack() {
    return this.page.evaluate(() => {
      const out = {};
      for (const el of document.querySelectorAll('.pack-slot[data-tsid]')) {
        const m = /× (\d+)/.exec(el.getAttribute('aria-label') || '');
        out[el.dataset.tsid] = (out[el.dataset.tsid] || 0) + (m ? Number(m[1]) : 1);
      }
      const hud = document.querySelector('.chrome, header')?.innerText.replace(/\s+/g, ' ').slice(0, 200) || '';
      const quests = document.getElementById('quest-tracker-list')?.innerText.replace(/\s+/g, ' ') || '';
      return { items: out, hud, quests };
    });
  }

  diffPack(a, b) {
    const keys = new Set([...Object.keys(a.items), ...Object.keys(b.items)]);
    const d = [];
    for (const k of keys) if ((a.items[k] || 0) !== (b.items[k] || 0)) d.push(`${k} ${a.items[k] || 0}->${b.items[k] || 0}`);
    return d;
  }

  async shot(label) {
    const file = join(this.dir, `${String(++this.shots).padStart(2, '0')}-${label}.png`);
    await this.page.screenshot({ path: file });
    return file;
  }

  /** Visible DOM state of every popup that can block play. */
  async overlays() {
    return this.page.evaluate(() => {
      const vis = (el) => !!el && !el.hidden && getComputedStyle(el).display !== 'none' && el.getClientRects().length > 0;
      const out = {};
      for (const el of document.querySelectorAll('.side-panel, .glitch-modal, .home-panel, .mail-panel, .map-panel, .quest-dialogue, .verb-menu, #award-screen, .award-screen, #new-day, .new-day, [role="dialog"]')) {
        if (vis(el)) out[el.id || el.className.split(' ')[0]] = true;
      }
      const toast = document.getElementById('toast');
      if (vis(toast)) out.toast = toast.textContent.trim();
      return out;
    });
  }

  /** Close the Magic Rock (or any) quest offer with its decline button. */
  async declineOffer() {
    const open = await this.page.evaluate(() => {
      const d = document.getElementById('quest-dialogue');
      if (!d || d.hidden) return null;
      return { kicker: document.getElementById('quest-dialogue-kicker')?.textContent || '', title: document.getElementById('quest-dialogue-title')?.textContent || '' };
    });
    if (!open) return null;
    // Step through beats until the decline button shows.
    for (let i = 0; i < 6; i++) {
      const cancel = this.page.locator('#quest-dialogue-cancel');
      if (await cancel.isVisible()) {
        await cancel.click();
        break;
      }
      await this.page.click('#quest-dialogue-next').catch(() => {});
      await this.wait(300);
    }
    await this.wait(300);
    return open;
  }

  async acceptOffer() {
    const open = await this.page.evaluate(() => {
      const d = document.getElementById('quest-dialogue');
      if (!d || d.hidden) return null;
      return { kicker: document.getElementById('quest-dialogue-kicker')?.textContent || '', title: document.getElementById('quest-dialogue-title')?.textContent || '' };
    });
    if (!open) return null;
    for (let i = 0; i < 8; i++) {
      const hidden = await this.page.evaluate(() => document.getElementById('quest-dialogue')?.hidden !== false);
      if (hidden) break;
      await this.page.click('#quest-dialogue-next').catch(() => {});
      await this.wait(350);
    }
    return open;
  }

  /** Dismiss award screens / new-day screens that hold play. */
  async clearAwards() {
    for (let i = 0; i < 6; i++) {
      const clicked = await this.page.evaluate(() => {
        const vis = (el) => !!el && !el.hidden && el.getClientRects().length > 0;
        for (const sel of ['[data-award-next]', '[data-award-close]', '[data-nd-ok]']) {
          for (const el of document.querySelectorAll(sel)) {
            if (vis(el)) { el.click(); return sel; }
          }
        }
        return null;
      });
      if (!clicked) return;
      await this.wait(600);
    }
  }

  /** Hold a key until the player's x reaches target (screen-space street x). */
  async walkTo(targetX, { tol = 24, maxMs = 25000 } = {}) {
    const start = Date.now();
    let stuckSince = Date.now();
    let lastX = null;
    while (Date.now() - start < maxMs) {
      const s = await this.snap();
      if (!s) return false;
      if (s.busy) {
        await this.declineOffer();
        await this.clearAwards();
      }
      const dx = targetX - s.player.x;
      if (Math.abs(dx) <= tol) return true;
      const key = dx > 0 ? 'd' : 'a';
      await this.page.keyboard.down(key);
      await this.wait(Math.min(400, Math.max(60, Math.abs(dx) * 1.2)));
      await this.page.keyboard.up(key);
      if (lastX !== null && Math.abs(s.player.x - lastX) < 2) {
        if (Date.now() - stuckSince > 1200) {
          // Hop over a step or wall lip.
          await this.page.keyboard.down(key);
          await this.page.keyboard.press('Space');
          await this.wait(450);
          await this.page.keyboard.up(key);
          stuckSince = Date.now();
        }
      } else {
        stuckSince = Date.now();
      }
      lastX = s.player.x;
    }
    return false;
  }

  /** Find the nearest interactable whose class or label matches. */
  async find(re, { exclude = [] } = {}) {
    const s = await this.snap();
    if (!s) return null;
    const rx = re instanceof RegExp ? re : new RegExp(re);
    const hits = s.interactables
      .filter((it) => rx.test(it.classId) || rx.test(it.label))
      .filter((it) => !exclude.some((e) => Math.abs(e.x - it.x) < 4 && e.classId === it.classId))
      .sort((a, b) => Math.abs(a.x - s.player.x) - Math.abs(b.x - s.player.x));
    return hits[0] || null;
  }

  /** Nearest live interactable of the same class to a remembered one. */
  async relocate(target) {
    const s = await this.snap();
    const same = (s?.interactables || []).filter((it) => it.classId === target.classId)
      .sort((a, b) => Math.abs(a.x - target.x) - Math.abs(b.x - target.x));
    return same[0] || null;
  }

  /** Walk to a target and open its verb menu (click it, E as fallback). */
  async approach(target) {
    if (!target) return null;
    await this.walkTo(target.x, { tol: 30 });
    await this.wait(250);
    // Animals roam; follow the same one.
    let live = await this.relocate(target);
    if (live && Math.abs(live.x - target.x) > 40) {
      await this.walkTo(live.x, { tol: 30 });
      live = await this.relocate(live);
    }
    if (live) {
      await this.page.mouse.click(live.page.x, live.page.y);
      await this.wait(500);
      const menu = await this.verbs();
      const opened = (await this.snap())?.menu;
      if (menu && (!live.label || opened === live.label)) return { ...menu, target: live };
      if (menu) await this.closeMenus();
    }
    await this.page.keyboard.press('e');
    await this.wait(500);
    const menu = await this.verbs();
    return menu ? { ...menu, target: live || target, viaKey: true } : null;
  }

  async verbs() {
    return this.page.evaluate(() => {
      const m = document.getElementById('verb-menu');
      if (!m || m.hidden) return null;
      return {
        title: document.getElementById('verb-menu-title')?.textContent || '',
        sub: document.getElementById('verb-menu-sub')?.textContent || '',
        verbs: [...document.querySelectorAll('#verb-menu-list button')].map((b) => ({ text: b.textContent.trim().replace(/\s+/g, ' '), disabled: b.disabled })),
      };
    });
  }

  async chooseVerb(re) {
    const ok = await this.page.evaluate((src) => {
      const rx = new RegExp(src, 'i');
      const b = [...document.querySelectorAll('#verb-menu-list button')].find((el) => rx.test(el.textContent.trim().replace(/\s+/g, ' ')) && !el.disabled);
      if (!b) return false;
      b.click();
      return true;
    }, re.source || re);
    return ok;
  }

  async closeMenus() {
    await this.page.keyboard.press('Escape');
    await this.wait(200);
  }

  /** Wait until no timed action runs. */
  async waitAction(maxMs = 15000) {
    await this.wait(300);
    return this.waitFor(() => !window.groddleQA.snapshot().acting, maxMs);
  }

  async metrics() {
    const { metrics } = await this.cdp.send('Performance.getMetrics');
    const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
    const lt = await this.page.evaluate(() => ({ n: window.__pt?.longTasks.length || 0, ms: Math.round(window.__pt?.longTaskMs || 0), max: Math.max(0, ...(window.__pt?.longTasks || [0])) }));
    return { heapMB: +(m.JSHeapUsedSize / 1048576).toFixed(1), nodes: m.Nodes, listeners: m.JSEventListeners, longTasks: lt };
  }

  /** Assert there is no horizontal page scroll. */
  async checkNoHScroll(label) {
    const r = await this.page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    if (r.sw > r.cw + 1) this.issue('layout', `${label}: horizontal scroll ${r.sw} > ${r.cw}`);
    return r;
  }

  async close() {
    await this.context?.close();
  }

  report() {
    return { scenario: this.name, viewport: this.viewport, issues: this.issues, notes: this.notes };
  }
}

// ---------------------------------------------------------------- helpers

const PANELS = [
  { name: 'Quests', btn: '#quest-btn', panel: '#quest-panel', close: '#quest-close' },
  { name: 'Badges', btn: '#achieve-btn', panel: '#achieve-panel', close: '#achieve-close' },
  { name: 'Feat', btn: '#feat-btn', panel: '#feat-panel', close: '#feat-close' },
  { name: 'Skills', btn: '#skills-btn', panel: '#skills-panel', close: '#skills-close' },
  { name: 'Buffs', btn: '#buffs-btn', panel: '#buffs-panel', close: '#buffs-close' },
  { name: 'Make', btn: '#make-btn', panel: '#make-panel', close: '#make-close' },
  { name: 'Map', btn: '#map-btn', panel: '#map-panel', close: '#map-close' },
  { name: 'Home', btn: '#home-btn', panel: '#home-panel', close: '#home-close' },
  { name: 'Vendor', btn: '#vendor-btn', panel: '#vendor-panel', close: '#vendor-close' },
  { name: 'Look', btn: '#avatar-btn', panel: '#avatar-panel', close: '#avatar-close' },
];

async function exercisePanels(t, label = '') {
  for (const p of PANELS) {
    t.step = `panel ${p.name}${label}`;
    await t.declineOffer();
    const btn = t.page.locator(p.btn);
    if (!(await btn.count())) {
      t.issue('ui', `${p.name}: button ${p.btn} missing`);
      continue;
    }
    const inView = await btn.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.right <= window.innerWidth + 1 && r.left >= -1 && r.bottom <= window.innerHeight + 1;
    });
    if (!inView) t.issue('layout', `${p.name}: HUD button not fully on screen${label}`);
    await btn.click({ timeout: 3000 }).catch((e) => t.issue('ui', `${p.name}: click failed ${e.message.split('\n')[0]}`));
    await t.wait(900);
    const state = await t.page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return { exists: false };
      const r = el.getBoundingClientRect();
      const card = el.querySelector('.side-card, .glitch-modal-card, .home-card, .mail-card, .map-card, .avatar-card') || el;
      const cr = card.getBoundingClientRect();
      return {
        exists: true,
        hidden: el.hidden || getComputedStyle(el).display === 'none',
        text: el.textContent.trim().length,
        card: { l: Math.round(cr.left), r: Math.round(cr.right), t: Math.round(cr.top), b: Math.round(cr.bottom) },
        vw: window.innerWidth,
        vh: window.innerHeight,
        rect: { w: Math.round(r.width), h: Math.round(r.height) },
      };
    }, p.panel);
    if (!state.exists) t.issue('ui', `${p.name}: panel ${p.panel} not in DOM`);
    else if (state.hidden) {
      // Some HUD buttons are disabled in instances; that is fine only if the button says so.
      const why = await btn.evaluate((el) => el.disabled ? 'disabled' : el.title);
      t.issue('ui', `${p.name}: panel did not open (${why})${label}`);
    } else {
      if (state.text < 20) t.issue('ui', `${p.name}: panel looks empty (${state.text} chars)`);
      if (state.card.r > state.vw + 2 || state.card.l < -2) t.issue('layout', `${p.name}: panel card overflows horizontally ${JSON.stringify(state.card)} vw=${state.vw}${label}`);
      await t.shot(`panel-${p.name.toLowerCase()}${label.replace(/\W+/g, '-')}`);
      const close = t.page.locator(p.close);
      if (await close.isVisible().catch(() => false)) await close.click().catch(() => {});
      else await t.page.keyboard.press('Escape');
      await t.wait(500);
      const still = await t.page.evaluate((sel) => {
        const el = document.querySelector(sel);
        return !!el && !el.hidden && getComputedStyle(el).display !== 'none';
      }, p.panel);
      if (still) t.issue('ui', `${p.name}: panel did not close`);
    }
  }
  // Mute toggles its own label.
  t.step = `mute${label}`;
  const before = await t.page.textContent('#mute-btn').catch(() => '');
  await t.page.click('#mute-btn', { timeout: 2000 }).catch((e) => t.issue('ui', `Mute click failed: ${e.message.split('\n')[0]}`));
  await t.wait(300);
  const after = await t.page.textContent('#mute-btn').catch(() => '');
  if (before === after) t.issue('ui', `Mute label did not change (${before})`);
  await t.page.click('#mute-btn', { timeout: 2000 }).catch(() => {});
}

/** E-menu loop on the nearest matching target: returns what happened. */
async function useTarget(t, re, verbRe, { wait = 9000, exclude = [], same = null } = {}) {
  const target = same ? await t.relocate(same) : await t.find(re, { exclude });
  if (!target) {
    t.note(`no ${re} on this street`);
    return null;
  }
  const menu = await t.approach(target);
  if (!menu) {
    t.issue('play', `E near ${target.classId} at x=${Math.round(target.x)} opened no menu`);
    return { target };
  }
  const pick = menu.verbs.find((v) => verbRe.test(v.text));
  if (!pick) {
    t.note(`${menu.title}: no ${verbRe} in [${menu.verbs.map((v) => v.text).join(' | ')}]`);
    await t.closeMenus();
    return { target, menu };
  }
  if (pick.disabled) {
    t.note(`${menu.title}: ${pick.text} disabled`);
    await t.closeMenus();
    return { target, menu, disabled: true };
  }
  const before = await t.snap();
  await t.chooseVerb(verbRe);
  await t.waitAction(wait);
  await t.wait(400);
  await t.clearAwards();
  const after = await t.snap();
  // A feed picker or similar may still be open.
  if (await t.page.evaluate(() => !document.getElementById('feed-picker')?.hidden)) {
    await t.page.keyboard.press('Enter');
    await t.waitAction(wait);
  }
  const line = await t.page.evaluate(() => document.querySelector('#activity-history > *')?.textContent.trim() || '');
  t.note(`${menu.title} ${pick.text.split(' ')[0]}: ${line}`);
  return { target: menu.target || target, menu, pick, line, energy: [before?.player.energy, after?.player.energy] };
}

async function packCount(t, id) {
  return t.page.evaluate((cls) => {
    const el = document.querySelector(`.pack-slot[data-tsid="${cls}"]`);
    if (!el) return 0;
    const n = el.querySelector('.pack-count, .count, .qty');
    return Number(n?.textContent?.replace(/\D/g, '')) || 1;
  }, id);
}

// ---------------------------------------------------------------- scenarios

const SCENARIOS = {
  async newplayer(t) {
    await t.goto('?autostart=1&resetgame=1&fresh=1', 6000);
    t.step = 'boot';
    const s0 = await t.snap();
    t.note(`street ${s0?.street?.label} x=${Math.round(s0?.player.x)} interactables=${s0?.interactables.length}`);
    await t.shot('arrival');
    // Arrival toast should be gone within a few seconds of real time.
    await t.wait(5000);
    const ov = await t.overlays();
    if (ov.toast && /loaded\. Press L/.test(ov.toast)) t.issue('ux', `arrival toast still showing after 11 s: ${ov.toast}`);
    // First Magic Rock offer arrives ~12 s after load.
    const appeared = await t.waitFor(() => !document.getElementById('quest-dialogue')?.hidden, 15000);
    t.step = 'magic rock offer 1';
    if (!appeared) t.note('no Magic Rock offer within 26 s');
    else {
      await t.shot('offer-1');
      const o = await t.acceptOffer();
      t.note(`accepted offer: ${o?.title}`);
    }
    await t.clearAwards();

    t.step = 'pet piggy';
    const pig = await useTarget(t, /^npc_piggy$/, /^pet/i);
    t.note(`piggy pet: energy ${JSON.stringify(pig?.energy)}`);
    t.step = 'nibble piggy';
    if (pig?.target) await useTarget(t, /^npc_piggy$/, /^nibble/i, { same: pig.target });
    t.step = 'butterfly massage';
    const fly = await useTarget(t, /^npc_butterfly$/, /^massage/i);
    t.step = 'butterfly milk';
    if (fly?.target) await useTarget(t, /^npc_butterfly$/, /^milk/i, { same: fly.target });
    t.step = 'chicken squeeze';
    await useTarget(t, /^npc_chicken$/, /^squeeze/i);
    t.step = 'harvest tree';
    const tree = await useTarget(t, /^trant_/, /^harvest/i, { wait: 12000 });
    t.note(`tree harvest: ${tree?.menu?.title} ${JSON.stringify(tree?.energy)}`);
    t.step = 'pet tree';
    if (tree?.target) await useTarget(t, /^trant_/, /^pet/i, { same: tree.target });
    t.step = 'water tree';
    if (tree?.target) await useTarget(t, /^trant_/, /^water/i, { same: tree.target });
    t.step = 'mine rock';
    await useTarget(t, /^rock_/, /^mine/i, { wait: 12000 });
    t.step = 'pick up item';
    await useTarget(t, /^(apple|musicblock_)/, /pick ?up|take|collect/i);
    t.step = 'activity';
    const feed = await t.page.evaluate(() => [...document.querySelectorAll('#activity-history > *')].map((e) => e.textContent.trim()).slice(0, 12));
    t.note(`activity: ${feed.join(' / ')}`);
    await t.shot('after-verbs');

    // Eat something from the pack (F eats an apple).
    t.step = 'eat';
    const e0 = (await t.snap()).player.energy;
    await t.page.keyboard.press('f');
    await t.wait(800);
    const e1 = (await t.snap()).player.energy;
    t.note(`eat (F): energy ${e0} -> ${e1}`);

    // Panels.
    await t.declineOffer();
    await exercisePanels(t);

    // Vendor: walk to the street spirit and buy + sell.
    t.step = 'vendor';
    const vendor = await t.find(/street_spirit|vendor/);
    if (vendor) {
      const menu = await t.approach(vendor);
      t.note(`vendor menu: ${menu?.title} [${menu?.verbs.map((v) => v.text).join(' | ')}]`);
      if (menu && (await t.chooseVerb(/buy|shop|browse/i))) {
        await t.wait(800);
        const offers = await t.page.$$('#vendor-list [role="listitem"], #vendor-list button, #vendor-list .vendor-item');
        t.note(`vendor shelf items: ${offers.length}`);
        if (offers.length) {
          await offers[0].click();
          await t.wait(500);
          await t.shot('vendor-detail');
          const buy = t.page.locator('#vendor-detail button', { hasText: /buy/i }).first();
          const cur0 = await t.page.textContent('#vendor-currants');
          if (await buy.isVisible().catch(() => false)) {
            await buy.click();
            await t.wait(700);
          }
          const cur1 = await t.page.textContent('#vendor-currants');
          t.note(`buy: currants ${cur0} -> ${cur1}`);
          if (cur0 === cur1) t.issue('play', 'vendor buy did not change currants');
          // Sell tab.
          await t.page.click('.vendor-tab[data-tab="sell"]').catch(() => {});
          await t.wait(600);
          const sellables = await t.page.$$('#vendor-list [role="listitem"], #vendor-list button, #vendor-list .vendor-item');
          t.note(`sellable rows: ${sellables.length}`);
          if (sellables.length) {
            await sellables[0].click();
            await t.wait(500);
            const sell = t.page.locator('#vendor-detail button', { hasText: /sell/i }).first();
            if (await sell.isVisible().catch(() => false)) {
              await sell.click();
              await t.wait(500);
              const confirm = t.page.locator('#vendor-detail button', { hasText: /sell|confirm|yes/i }).first();
              if (await confirm.isVisible().catch(() => false)) await confirm.click().catch(() => {});
              await t.wait(700);
            }
            const cur2 = await t.page.textContent('#vendor-currants');
            t.note(`sell: currants ${cur1} -> ${cur2}`);
            if (cur2 === cur1) t.issue('play', 'vendor sell did not change currants');
            await t.shot('vendor-sell');
          }
        }
        await t.page.click('#vendor-close').catch(() => {});
      } else {
        await t.closeMenus();
      }
    } else t.note('no vendor on street');

    // Craft: open Make and run the first available recipe.
    t.step = 'craft';
    await t.declineOffer();
    await t.page.click('#make-btn').catch(() => {});
    await t.wait(800);
    const makeInfo = await t.page.evaluate(() => {
      const p = document.getElementById('make-panel');
      const btns = [...p.querySelectorAll('button')].filter((b) => !b.disabled && b.offsetParent && !/close|×/.test(b.textContent + b.id));
      return btns.slice(0, 30).map((b) => b.textContent.trim().replace(/\s+/g, ' ').slice(0, 50));
    });
    t.note(`make buttons: ${makeInfo.slice(0, 12).join(' | ')}`);
    await t.shot('make');
    await t.page.click('#make-close').catch(() => t.page.keyboard.press('Escape'));
    await t.wait(400);

    // Persistence: reload without reset and compare.
    t.step = 'reload';
    const packBefore = await t.pack();
    const before = await t.data();
    const sBefore = await t.snap();
    await t.goto('?autostart=1', 6000);
    const after = await t.data();
    const sAfter = await t.snap();
    const packAfter = await t.pack();
    const pd = t.diffPack(packBefore, packAfter);
    if (pd.length) t.issue('persist', `pack changed on reload: ${pd.join(', ')}`);
    if (packBefore.quests !== packAfter.quests) t.issue('persist', `quest tracker changed on reload: "${packBefore.quests}" -> "${packAfter.quests}"`);
    t.note(`hud before: ${packBefore.hud}`);
    t.note(`hud after:  ${packAfter.hud}`);
    t.note(`reload: street ${sBefore?.street?.tsid} -> ${sAfter?.street?.tsid}, x ${Math.round(sBefore?.player.x)} -> ${Math.round(sAfter?.player.x)}, energy ${sBefore?.player.energy} -> ${sAfter?.player.energy}`);
    if (sBefore?.street?.tsid !== sAfter?.street?.tsid) t.issue('persist', `street changed on reload ${sBefore?.street?.tsid} -> ${sAfter?.street?.tsid}`);
    for (const k of ['meditationTotalSeconds', 'rookArmor', 'teleportPoints', 'mailTotal']) {
      if (before[k] !== after[k]) t.note(`data ${k}: ${before[k]} -> ${after[k]}`);
    }
    await t.shot('after-reload');
  },

  async travel(t) {
    await t.goto('?autostart=1&resetgame=1&fresh=1&questoffer=off', 5000);
    const visited = [];
    // Signposts: go right twice, then back left.
    for (const dir of ['right', 'right', 'left', 'left']) {
      t.step = `signpost ${dir}`;
      const s = await t.snap();
      const posts = s.signposts.filter((p) => p.to).sort((a, b) => a.x - b.x);
      if (!posts.length) {
        t.note(`${s.street.label}: no navigable signposts`);
        break;
      }
      const post = dir === 'right' ? posts[posts.length - 1] : posts[0];
      await t.walkTo(post.x, { tol: 40, maxMs: 40000 });
      await t.page.keyboard.press('t');
      const moved = await t.waitFor((tsid) => window.groddleQA.snapshot().street?.tsid !== tsid, 20000, s.street.tsid);
      await t.wait(3000);
      const s2 = await t.snap();
      if (!moved) {
        t.issue('travel', `T at ${s.street.label} signpost x=${Math.round(post.x)} (to ${post.to}) did not travel`);
        await t.shot(`signpost-stuck-${dir}`);
        continue;
      }
      visited.push(s2.street.label);
      t.note(`${s.street.label} -> ${s2.street.label} (expected ${post.to}) at x=${Math.round(s2.player.x)} onGround=${s2.player.onGround}`);
      if (post.to && s2.street.label !== post.to) t.issue('travel', `signpost said ${post.to} but arrived at ${s2.street.label}`);
      await t.shot(`arrive-${s2.street.label.replace(/\W+/g, '-')}`);
    }
    // Map travel to another hub.
    t.step = 'map travel';
    await t.page.keyboard.press('g');
    await t.wait(1200);
    await t.shot('map');
    const mapInfo = await t.page.evaluate(() => {
      const sel = document.getElementById('map-hub-select');
      return { hubs: sel ? [...sel.options].map((o) => o.textContent) : [], streets: document.querySelectorAll('#map-canvas [data-tsid], #map-canvas .map-street').length };
    });
    t.note(`map hubs=${mapInfo.hubs.length} street nodes=${mapInfo.streets}`);
    await t.page.keyboard.press('g');
    await t.wait(400);

    const streetVisit = async (tsid, label, extra = '') => {
      t.step = `visit ${label}`;
      await t.goto(`?autostart=1&questoffer=off&streetdemo=${tsid}${extra}`, 7000);
      const s = await t.snap();
      const d = await t.data();
      t.note(`${label}: ${s?.street?.label} x=${Math.round(s?.player.x)} y=${Math.round(s?.player.y)} onGround=${s?.player.onGround} jetpack=${d.physicsJetpack} doors=${d.doorCount}`);
      await t.shot(`street-${label.replace(/\W+/g, '-')}`);
      return s;
    };
    // Doors: Gregarious Grange -> Towers. (streetdemo is the plain street entry, not a scripted demo.)
    const grange = await streetVisit('GLI32G3NUTD100I', 'Gregarious Grange');
    if (grange) {
      t.step = 'door';
      const door = await t.find(/door/);
      if (door) {
        const menu = await t.approach(door);
        t.note(`door menu ${menu?.title} [${menu?.verbs.map((v) => v.text).join(' | ')}]`);
        if (menu && (await t.chooseVerb(/enter|open|go/i))) {
          const moved = await t.waitFor((tsid) => window.groddleQA.snapshot().street?.tsid !== tsid, 15000, grange.street.tsid);
          await t.wait(2500);
          const s = await t.snap();
          t.note(`door -> ${s?.street?.label} moved=${moved}`);
          if (!moved) t.issue('travel', 'door Enter on Gregarious Grange did not move streets');
          await t.shot('door-arrive');
        }
      } else t.issue('travel', 'no door interactable on Gregarious Grange');
    }
    // Ladder climb on the same-street door street (GIF1QBNPP7123J0 has walls too).
    const walls = await streetVisit('GIF1QBNPP7123J0', 'Walls street');
    if (walls) {
      t.step = 'walls';
      const x0 = walls.player.x;
      await t.walkTo(x0 + 3000, { maxMs: 15000 });
      const s = await t.snap();
      t.note(`walked right from ${Math.round(x0)} to ${Math.round(s.player.x)}`);
    }
    // Underwater Jal street (jetpack physics).
    const jal = await streetVisit('GHVECS766MC3LHP', 'Distant End (Jal)');
    if (jal) {
      t.step = 'swim';
      const y0 = (await t.snap()).player.y;
      for (let i = 0; i < 4; i++) {
        await t.page.keyboard.press('Space');
        await t.wait(220);
      }
      const y1 = (await t.snap()).player.y;
      t.note(`swim strokes: y ${Math.round(y0)} -> ${Math.round(y1)}`);
      if (y1 >= y0 - 10) t.issue('play', `swimming did not rise (y ${y0} -> ${y1})`);
      await t.wait(2500);
      await t.shot('jal-swim');
    }
    // Naraka: drain energy to croak.
    t.step = 'croak';
    await t.goto('?autostart=1&questoffer=off', 5000);
    const drained = await t.page.evaluate(() => {
      // There is no player-facing drain other than spending energy; walk the
      // real path below instead if this hook ever disappears.
      return !!window.groddleQA;
    });
    t.note(`drain via repeated actions (hook=${drained})`);
    let croaked = false;
    for (let i = 0; i < 60 && !croaked; i++) {
      const d = await t.data();
      if (d.hellDead === '1') { croaked = true; break; }
      const s = await t.snap();
      if (s.player.energy <= 0) {
        await t.wait(3000);
        croaked = (await t.data()).hellDead === '1';
        break;
      }
      const r = await useTarget(t, /^(npc_piggy|npc_chicken|npc_butterfly|trant_)/, /^(pet|squeeze|massage)/i, { wait: 6000 });
      if (!r?.pick) await t.wait(500);
    }
    const s = await t.snap();
    t.note(`after drain: energy=${s.player.energy} hellDead=${(await t.data()).hellDead} street=${s.street.label}`);
    await t.shot('croak');
  },

  async long(t) {
    await t.goto('?autostart=1&resetgame=1&fresh=1', 5000);
    const minutes = Number(flags.minutes || 11);
    const end = Date.now() + minutes * 60000;
    let offers = 0;
    let lastPhase = '';
    let i = 0;
    const timeline = [];
    while (Date.now() < end) {
      i++;
      t.step = `long t+${Math.round((Date.now() - (end - minutes * 60000)) / 1000)}s`;
      const ov = await t.overlays();
      const d = await t.data();
      if (d.rookPhase !== lastPhase) {
        timeline.push(`${t.step} rook ${lastPhase} -> ${d.rookPhase}`);
        lastPhase = d.rookPhase;
      }
      if (ov['quest-dialogue']) {
        offers++;
        // Alternate accept / decline.
        if (offers % 2) await t.acceptOffer();
        else await t.declineOffer();
        timeline.push(`${t.step} offer #${offers}`);
      }
      // Two overlays at once is a stacking bug.
      const blocking = Object.keys(ov).filter((k) => k !== 'toast');
      if (blocking.length > 1) t.issue('overlap', `${blocking.join(' + ')} open together`);
      await t.clearAwards();
      // Wander and do something every so often.
      if (i % 5 === 0) await useTarget(t, /^(npc_piggy|npc_butterfly|trant_|npc_chicken)/, /^(pet|talk|massage)/i, { wait: 6000 });
      else {
        await t.page.keyboard.down(i % 2 ? 'd' : 'a');
        await t.wait(1200);
        await t.page.keyboard.up(i % 2 ? 'd' : 'a');
      }
      if (i % 20 === 0) {
        await t.page.click('#skills-btn').catch(() => {});
        await t.wait(800);
        await t.shot(`skills-${i}`);
        await t.page.keyboard.press('Escape');
      }
      await t.wait(1500);
    }
    t.note(`offers seen: ${offers}`);
    for (const line of timeline) t.note(line);
    const d = await t.data();
    t.note(`rookNextAttack=${d.rookNextAttack} skill=${d.skillActive || ''}`);
    await t.goto('?autostart=1', 6000);
    await t.shot('long-reload');
  },

  async resize(t) {
    for (const width of [390, 1280, 1600]) {
      const height = width === 390 ? 844 : 900;
      await t.page.setViewportSize({ width, height });
      await t.goto('?autostart=1&resetgame=1&fresh=1&questoffer=off', 5000);
      t.step = `resize ${width}`;
      await t.checkNoHScroll(`${width}px`);
      await t.shot(`hud-${width}`);
      await exercisePanels(t, ` @${width}`);
      await t.checkNoHScroll(`${width}px after panels`);
    }
  },

  async perf(t) {
    await t.goto('?autostart=1&resetgame=1&fresh=1&questoffer=off', 6000);
    const m0 = await t.metrics();
    t.note(`start ${JSON.stringify(m0)}`);
    const route = [];
    for (let n = 0; n < 10; n++) {
      t.step = `perf street ${n + 1}`;
      const s = await t.snap();
      const posts = s.signposts.filter((p) => p.to);
      if (!posts.length) break;
      const post = posts[n % posts.length];
      // Jump next to the signpost (walking is covered by `travel`).
      await t.walkTo(post.x, { tol: 40, maxMs: 30000 });
      await t.page.keyboard.press('t');
      await t.waitFor((tsid) => window.groddleQA.snapshot().street?.tsid !== tsid, 20000, s.street.tsid);
      await t.wait(2500);
      const m = await t.metrics();
      const s2 = await t.snap();
      route.push(`${s2.street.label} heap=${m.heapMB}MB nodes=${m.nodes} lt=${m.longTasks.n}/${m.longTasks.ms}ms`);
      log(`  ${route[route.length - 1]}`);
    }
    await t.cdp.send('HeapProfiler.collectGarbage').catch(() => {});
    await t.wait(1500);
    const m1 = await t.metrics();
    t.note(`end ${JSON.stringify(m1)}`);
    for (const r of route) t.note(r);
    if (m1.heapMB > m0.heapMB * 2 + 50) t.issue('perf', `heap grew ${m0.heapMB} -> ${m1.heapMB} MB over ${route.length} streets`);
    if (m1.nodes > m0.nodes * 2 + 2000) t.issue('perf', `DOM nodes grew ${m0.nodes} -> ${m1.nodes}`);
  },
};

// ---------------------------------------------------------------- main

export { Session, SCENARIOS, useTarget, exercisePanels };

export function launchArgs() {
  const a = ['--ignore-certificate-errors'];
  if (flags.swiftshader) a.push('--use-angle=swiftshader', '--enable-unsafe-swiftshader');
  else a.push('--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist');
  return a;
}

if (import.meta.url === `file://${process.argv[1]}`) await main();

async function main() {

const browser = await chromium.launch({ headless: !flags.headed, args: launchArgs() });
const results = [];
for (const name of scenarios) {
  const fn = SCENARIOS[name];
  if (!fn) {
    console.error(`unknown scenario ${name}`);
    continue;
  }
  log(`== ${name}`);
  const t = await new Session(name, browser, { width: flags.width, height: flags.height }).open();
  try {
    await fn(t);
  } catch (e) {
    t.issue('harness', `${e.message.split('\n')[0]}`);
    await t.shot('harness-error').catch(() => {});
  }
  results.push(t.report());
  await t.close();
}
await browser.close();
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'report.json'), JSON.stringify(results, null, 2));
log('== summary');
for (const r of results) {
  const counts = {};
  for (const i of r.issues) counts[i.kind] = (counts[i.kind] || 0) + i.count;
  log(`${r.scenario}: ${r.issues.length} issue rows ${JSON.stringify(counts)}`);
}
log(`report: ${join(OUT, 'report.json')}`);
}
