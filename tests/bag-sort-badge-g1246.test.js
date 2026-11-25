/**
 * G1246 (Ideas board; Austin 2026-11-24, Option A of the Sorted Bag Badges design): a sorted bag shows
 * what it is sorted for. Glitch never did (glitch-client has no display for a bag's specialization;
 * items/bag.js doSpecialize only renamed an unnamed bag), so this is ours:
 * - Modern: a 17 px cream disc in the bag slot's top right corner, inside the slot, holding the icon
 *   of one thing the sort takes (pack-slots.js BAG_SORT_ICONS); none on an unsorted bag, and never on
 *   the one-kind bags (Toolbox, Spice Rack, Alchemistry Kit, Cubimal Case, Elemental Pouch);
 * - it sits with the full marker (backdrop, bar) and the open marker (ring, caret), covering neither;
 * - words back it up: the tip's "Sorted for food", the open bag's tray head "Sorted for mining" and
 *   what the sort takes (the Sort menu's tooltip words), ", sorted for food" on the bag's label;
 * - the Sort menu shows each sort's icon, the current one checked;
 * - Classic: the icon replaces the dot on the bag's count strip, at 14 px, with no disc.
 * Run: node --test tests/bag-sort-badge-g1246.test.js
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BAG_DEFS,
  BAG_SORTS,
  BAG_SORT_ICONS,
  SPECIALIZABLE_BAGS,
  bagSortIcon,
  bagSortText,
  layoutPack,
  sortTakes,
  sortWords,
} from '../public/js/pack-slots.js?v=38e4aea5';
import { ITEM_CATALOG, isToolItem } from '../public/js/inventory.js?v=6414dbdc';
import { bagsFeature } from '../public/js/features/bags-feature.js?v=3b0fb8a1';
import { packSlotTip } from '../public/js/ui/pack-row.js?v=615f7790';
import { CHECK_ICON, verbRowInner } from '../public/js/ui/verb-menu.js?v=4cb51d52';

const ROOT = join(import.meta.dirname, '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const game = read('public/game.js');
const style = read('public/style.css');
const classic = read('public/css/classic.css');
const OPTS = { catalog: ITEM_CATALOG, isTool: isToolItem, order: Object.keys(ITEM_CATALOG) };
const ONE_KIND = Object.keys(BAG_DEFS).filter((cls) => !SPECIALIZABLE_BAGS.includes(cls));

/** The body of the rule whose selector is exactly `selector`. */
function rule(css, selector) {
  const at = css.indexOf(`\n${selector} {`);
  assert.ok(at >= 0, `rule ${selector}`);
  const open = css.indexOf('{', at + selector.length);
  return css.slice(open + 1, css.indexOf('}', open));
}

describe('the sorts\' icons (pack-slots.js BAG_SORT_ICONS)', () => {
  it('Austin\'s picks, one per sort, each a thing the sort really takes, with art in the game', () => {
    assert.deepEqual(BAG_SORT_ICONS, {
      sort_keys: 'door_key_1', // Yellow-Purple Triangle Key
      sort_cards: 'upgrade_card_reshuffle', // Reshuffle Card
      sort_alchemy: 'sparkle_powder',
      sort_manufacturing: 'plank',
      sort_mining: 'metal_rock', // Chunk of Metal Rock
      sort_herbs: 'purple_flower',
      sort_crops: 'carrot',
      sort_musicblocks: 'musicblock_d_green_01', // Musicblock DG-1
      sort_emblems: 'emblem_friendly',
      sort_drinks: 'beer',
      sort_food: 'sammich',
      // Staples A+B: one icon, not two (Grain washes out at 13 px on the cream disc: Plain Bean).
      sort_staples_ab: 'bean_plain',
      sort_staples_b: 'cherry',
      sort_staples_a: 'meat',
    });
    assert.deepEqual(Object.keys(BAG_SORT_ICONS), BAG_SORTS.map((r) => r.id));
    for (const row of BAG_SORTS) {
      const cls = bagSortIcon(row.id);
      assert.ok(sortTakes(row.id, cls, OPTS), `${row.id} takes ${cls}`);
      assert.ok(existsSync(join(ROOT, 'public/assets/sprites/icons', `${cls}.webp`)), `${cls} has an icon`);
    }
    // Staples A+B's own: not A's Meat or B's Cherry, so the three read apart.
    assert.equal(new Set(Object.values(BAG_SORT_ICONS)).size, 14);
    assert.equal(bagSortIcon(''), '');
    assert.equal(bagSortIcon('sort_all'), '');
    assert.equal(bagSortIcon('sort_nonsense'), '');
  });

  it('the words: "Sorted for mining", and what the sort takes in the Sort menu\'s words', () => {
    assert.equal(sortWords('sort_mining'), 'mining');
    assert.equal(sortWords('sort_staples_a'), 'staples A', 'Glitch\'s "Sort: Staples A" name, in running words');
    assert.equal(sortWords('sort_staples_ab'), 'staples A+B');
    assert.deepEqual(bagSortText('sort_mining'), { words: 'mining', line: 'Sorted for mining', takes: 'ore chunks, rock chunks and metal ingots' });
    assert.deepEqual(bagSortText('sort_crops'), { words: 'crops', line: 'Sorted for crops', takes: 'crops and crop seeds' });
    // Nothing that only repeats the name.
    assert.deepEqual(bagSortText('sort_food'), { words: 'food', line: 'Sorted for food', takes: '' });
    assert.equal(bagSortText(''), null);
  });
});

describe('which bags carry one (the layout\'s box.sort)', () => {
  it('every sortable bag kind, sorted for each sort, carries that sort\'s icon; unsorted, none', () => {
    for (const cls of SPECIALIZABLE_BAGS) {
      const plain = layoutPack({ [cls]: 1, apple: 2 }, { bags: [{ key: 'b1', cls }], place: { pack: ['@b1', 'apple'] } }, OPTS);
      assert.equal(bagSortIcon(plain.bags.b1.sort), '', `${cls} unsorted`);
      for (const row of BAG_SORTS) {
        const layout = layoutPack({ [cls]: 1, apple: 2 }, { bags: [{ key: 'b1', cls, sort: row.id }], place: { pack: ['@b1', 'apple'] } }, OPTS);
        assert.equal(layout.bags.b1.sort, row.id, `${cls} ${row.id}`);
        assert.equal(bagSortIcon(layout.bags.b1.sort), BAG_SORT_ICONS[row.id]);
      }
    }
  });

  it('the one-kind bags never carry one, even with a sort in an old save', () => {
    assert.deepEqual(ONE_KIND.sort(), ['bag_alchemistry_kit', 'bag_cubimal_case', 'bag_elemental_pouch', 'bag_spicerack', 'bag_toolbox_chrome', 'bag_toolbox_green', 'bag_toolbox_red']);
    for (const cls of ONE_KIND) {
      const layout = layoutPack({ [cls]: 1 }, { bags: [{ key: 'b1', cls, sort: 'sort_keys' }], place: { pack: ['@b1'] } }, OPTS);
      assert.equal(bagSortIcon(layout.bags.b1.sort), '', cls);
    }
  });

  it('a renamed sorted bag keeps its badge: the name is the player\'s, the sort still shows', () => {
    const layout = layoutPack({ bag_generic_pink: 1 }, { bags: [{ key: 'b1', cls: 'bag_generic_pink', sort: 'sort_food', name: 'Snacks' }], place: { pack: ['@b1'] } }, OPTS);
    assert.equal(layout.bags.b1.label, 'Snacks');
    assert.equal(bagSortIcon(layout.bags.b1.sort), 'sammich');
  });
});

describe('the row, the tip and the tray (game.js, js/ui/pack-row.js)', () => {
  it('a bag slot draws the badge from its sort, and its label says what for', () => {
    assert.match(game, /entry\.bag = \{[^}]*sort: box\?\.sort \|\| '' \};/);
    assert.match(game, /const sortIcon = bagSortIcon\(s\.bag\.sort\);\n\s+if \(sortIcon\) \{[\s\S]{0,400}badge\.className = 'pack-bag-sort';/);
    assert.match(game, /\$\{sortWords \? `, sorted for \$\{sortWords\}` : ''\}, \$\{s\.bag\.used\} of \$\{s\.bag\.capacity\} slots used/);
    // A changed sort redraws the row.
    assert.match(game, /s\.bag \? \[s\.bag\.used, s\.bag\.capacity, s\.bag\.open, s\.bag\.label, s\.bag\.sort \|\| ''\] : 0/);
  });

  it('the tip: the name, then "Sorted for food" with its icon, then the slots line', () => {
    const tip = packSlotTip({ bag: { label: 'Snacks', used: 4, capacity: 10, open: false, sortLine: 'Sorted for food', sortIcon: 'x/sammich.webp' } });
    assert.deepEqual(tip, { title: 'Snacks', note: 'Sorted for food', noteIcon: 'x/sammich.webp', sub: '4 of 10 slots · Click to open' });
    assert.deepEqual(packSlotTip({ bag: { label: 'Bigger Bag', used: 0, capacity: 16, open: false } }), { title: 'Bigger Bag', sub: '0 of 16 slots · Click to open' });
    assert.match(game, /sortLine: bagSortText\(box\.sort\)\?\.line \|\| ''/);
  });

  it('the badge sits inside the slot\'s top right corner, over the full and open markers, not on them', () => {
    const badge = rule(style, '.pack-bag-sort');
    const px = (prop) => Number(badge.match(new RegExp(`\\n\\s*${prop}: (-?\\d+)px;`))?.[1]);
    assert.ok(px('top') >= 0 && px('right') >= 0, 'never overhangs (the phone\'s scrolling row would clip it)');
    assert.equal(px('width'), 17);
    assert.equal(px('height'), 17);
    const slot = Number(rule(style, '.pack-slots .pack-slot.pack-bag').match(/width: (\d+)px/)[1]);
    assert.ok(px('right') + px('width') <= slot / 2 + 4, 'in the right corner of the slot, clear of its left half');
    assert.match(badge, /background: var\(--pack-sort-icon\) center \/ contain no-repeat content-box, var\(--surface-raised\);/, 'the icon on its own cream disc');
    assert.match(badge, /box-shadow: 0 0 0 1px var\(--border-strong\)/, 'an edge that reads on a full bag\'s grey');
    assert.match(badge, /z-index: var\(--z-raised\)/);
    // The full and open markers stay as they were and never style the badge.
    assert.ok(!/is-bag-full[^{]*pack-bag-sort|is-open[^{]*pack-bag-sort/.test(style));
  });

  it('Classic: the strip\'s dot turns into the sort\'s icon at 14 px, no disc; unsorted bags keep the dot', () => {
    assert.match(game, /opener\.querySelector\('i'\)\.classList\.add\('is-sorted'\);/);
    assert.match(classic, /\.pack-bag-opener i\.is-sorted \{ width: 14px; height: 14px; border-radius: 0; background: var\(--pack-sort-icon\) center \/ contain no-repeat; \}/);
    assert.match(classic, /\.pack-bag-opener i \{ display: block; width: 5px; height: 5px;[^}]*background: var\(--c-classic-bag-dot\); \}/);
    assert.match(classic, /:root\[data-ui="classic"\] #game-root \.pack-bag-sort \{ display: none; \}/);
    assert.doesNotMatch(classic, /Glitch/);
  });
});

describe('the Sort menu teaches the symbols (features/bags-feature.js sortVerbs)', () => {
  it('each sort\'s row shows its icon, All keeps the room, the current one is checked', () => {
    const inv = { bag_bigger: 1, apple: 3 };
    const prefs = layoutPack(inv, null, OPTS).prefs;
    const data = {};
    const engine = { mode: 'solo', started: true, inv, data, pc: { imaginationUpgrades: ['pack_internal_sortitude'] }, setData: (k, v) => { data[k] = v; }, param: () => null, pushActivity() {}, toast() {}, updateHud() {}, refreshPack() {}, playSound() {}, save() {} };
    engine.query = (hook, ...args) => (typeof bagsFeature[hook] === 'function' ? bagsFeature[hook](...args) : null);
    bagsFeature.init(engine);
    bagsFeature.restore({ v: 1, prefs, migrated: true }, engine);
    const key = prefs.bags[0].key;
    bagsFeature.packBagMenu(key);
    assert.equal(bagsFeature.runPackVerb('bag_bigger', 'bags_sort:sort_food', engine), true);
    const row = bagsFeature.packVerbs('bag_bigger', engine).find((v) => v.id === 'bags_sort');
    assert.equal(row.sub[0].icon, '');
    for (const sort of BAG_SORTS) {
      const sub = row.sub.find((v) => v.id === `bags_sort:${sort.id}`);
      assert.match(sub.icon, new RegExp(`/${BAG_SORT_ICONS[sort.id]}\\.webp(\\?|$)`), sort.id);
    }
    assert.deepEqual(row.sub.filter((v) => v.current).map((v) => v.id), ['bags_sort:sort_food']);
    assert.equal(row.tooltip, 'Sorted for food · choose another sort');
    // The pack menu passes the picture through and draws it before the words.
    assert.match(game, /\.\.\.\(typeof verb\.icon === 'string' \? \{ icon: verb\.icon \} : \{\}\),/);
    const food = verbRowInner({ key: '', label: 'Food', icon: 'assets/sprites/icons/sammich.webp', current: true, disabled: true });
    assert.match(food, /<img class="vm-icon" src="assets\/sprites\/icons\/sammich\.webp" alt="" \/><span class="vm-label">Food<\/span>/);
    assert.ok(food.includes(CHECK_ICON));
    assert.match(verbRowInner({ key: '1', label: 'All', icon: '' }), /<span class="vm-icon" aria-hidden="true"><\/span><span class="vm-label">All/);
    assert.doesNotMatch(verbRowInner({ key: '1', label: 'Drop' }), /vm-icon/);
  });
});

let chromium = null;
try { chromium = (await import('playwright')).chromium; } catch { /* no Playwright */ }

/** A save with sorted, renamed, full, unsorted and one-kind bags (the design's row). */
function seedSave(st) {
  st.inventory = {
    bag_bigger: 1, bag_generic_green: 1, bag_generic_pink: 1, bag_toolbox_red: 1, bag_bigger_blue: 1, bag_spicerack: 1,
    carrot: 24, seed_carrot: 8, metal_rock: 500, sammich: 4, cherry: 20, pick: 1, hatchet: 1, grain: 12, meat: 6, apple: 3, black_pepper: 10,
  };
  st.player.imaginationUpgrades = [...new Set([...(st.player.imaginationUpgrades || []), 'pack_internal_sortitude'])];
  st.systems.features = st.systems.features || {};
  st.systems.features.bags = { v: 1, migrated: true, open: '', prefs: {
    bags: [
      { key: 'b1', cls: 'bag_bigger', sort: 'sort_crops', sortNamed: true },
      { key: 'b2', cls: 'bag_generic_green', sort: 'sort_mining', sortNamed: true },
      { key: 'b3', cls: 'bag_generic_pink', sort: 'sort_food', name: 'Snacks' },
      { key: 'b4', cls: 'bag_toolbox_red', sort: 'sort_keys' },
      { key: 'b5', cls: 'bag_bigger_blue' },
      { key: 'b6', cls: 'bag_spicerack' },
    ],
    place: { pack: ['@b1', '@b2', '@b3', '@b4', '@b5', '@b6', 'grain', 'meat', 'apple'], b1: ['carrot', 'seed_carrot'], b2: Array(10).fill('metal_rock'), b3: ['sammich', 'cherry'], b4: ['pick', 'hatchet'], b6: ['black_pepper'] },
    n: { pack: [0, 0, 0, 0, 0, 0, 12, 6, 3], b1: [24, 8], b2: Array(10).fill(50), b3: [4, 20], b4: [1, 1], b6: [10] },
  } };
  return st;
}

describe('the badges on the real game (Chrome)', { skip: !chromium && 'no playwright' }, () => {
  const LOCK_WAIT_MS = 30 * 60_000;
  const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
  const QUERY = '/play/?autostart=1&questoffer=off&hstip=0';
  let server = null;
  let chrome = null;
  let base = '';
  let save = '';
  const ready = (tab) => tab.waitForFunction(() => !document.body.classList.contains('is-booting') && document.getElementById('overlay')?.classList.contains('hidden'), null, { timeout: 60_000 });
  /** A tab on the seeded save. */
  async function open({ width, height, phone = false, ui = 'modern' }) {
    const ctx = await chrome.browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, ...(phone ? { isMobile: true, hasTouch: true, userAgent: UA } : {}) });
    await ctx.addInitScript(([s, skin]) => {
      if (sessionStorage.getItem('g1246-seeded')) return;
      sessionStorage.setItem('g1246-seeded', '1');
      localStorage.setItem('groddle_player_state_v1', s);
      localStorage.setItem('groddle-play-device', 'qa-game');
      if (skin === 'classic') localStorage.setItem('groddle_ui', 'classic');
    }, [save, ui]);
    const tab = await ctx.newPage();
    await tab.goto(`${base}${QUERY}${ui === 'classic' ? '&ui=classic' : ''}`);
    await ready(tab);
    await tab.waitForFunction(() => document.querySelectorAll('.pack-slot.pack-bag').length === 6, null, { timeout: 30_000 });
    await tab.evaluate(() => { for (const b of document.querySelectorAll('button')) if (b.textContent.trim() === 'Got it' && b.offsetParent) b.click(); });
    return { ctx, tab };
  }
  const bags = (tab) => tab.evaluate(() => Object.fromEntries([...document.querySelectorAll('.pack-slot.pack-bag')].map((s) => {
    const badge = s.querySelector('.pack-bag-sort');
    const a = s.getBoundingClientRect();
    const b = badge?.getBoundingClientRect();
    const row = s.closest('.pack-slots')?.getBoundingClientRect();
    const dot = s.querySelector('.pack-bag-opener i');
    return [s.dataset.packBag, {
      label: s.getAttribute('aria-label'),
      cls: s.className,
      badge: badge ? getComputedStyle(badge).backgroundImage : '',
      badgeShown: Boolean(badge && getComputedStyle(badge).display !== 'none'),
      inside: b ? b.left >= a.left && b.right <= a.right && b.top >= a.top && b.bottom <= a.bottom : null,
      inRow: b && row ? b.top >= row.top && b.bottom <= row.bottom : null,
      size: b ? [Math.round(b.width), Math.round(b.height)] : null,
      dot: dot ? { bg: getComputedStyle(dot).backgroundImage, w: Math.round(dot.getBoundingClientRect().width) } : null,
    }];
  })));

  before(async () => {
    const { openBrowser } = await import('../tools/qa/browser.mjs');
    const { startServer } = await import('../tools/qa/serve.mjs');
    chrome = await openBrowser({ label: 'G1246 sort badge test', waitMs: LOCK_WAIT_MS });
    server = await startServer({ root: join(ROOT, 'public') });
    base = `http://127.0.0.1:${server.address().port}`;
    // A fresh save from the real game, then the bags put into it.
    const ctx = await chrome.browser.newContext({ viewport: { width: 1280, height: 800 } });
    const tab = await ctx.newPage();
    await tab.goto(`${base}${QUERY}`);
    await ready(tab);
    await tab.waitForFunction(() => localStorage.getItem('groddle_player_state_v1'), null, { timeout: 30_000 });
    save = JSON.stringify(seedSave(JSON.parse(await tab.evaluate(() => localStorage.getItem('groddle_player_state_v1')))));
    await ctx.close();
  }, { timeout: LOCK_WAIT_MS + 120_000 });
  after(async () => {
    await chrome?.close();
    await server?.stop();
  });

  it('Modern desktop: badges on the sorted bags only, the words, the full and open markers, the Sort menu', { timeout: 120_000 }, async () => {
    const { ctx, tab } = await open({ width: 1280, height: 800 });
    try {
      const got = await bags(tab);
      assert.match(got.b1.badge, /carrot\.webp/);
      assert.match(got.b2.badge, /metal_rock\.webp/);
      assert.match(got.b3.badge, /sammich\.webp/, 'the renamed bag keeps its badge');
      for (const k of ['b4', 'b5', 'b6']) assert.equal(got[k].badge, '', `${k}: no badge (one-kind or unsorted)`);
      for (const k of ['b1', 'b2', 'b3']) {
        assert.ok(got[k].badgeShown && got[k].inside, `${k}: inside its slot`);
        assert.deepEqual(got[k].size, [17, 17]);
      }
      assert.equal(got.b3.label, 'Snacks, sorted for food, 2 of 10 slots used, closed');
      assert.equal(got.b5.label, 'Bigger Blue Bag, 0 of 16 slots used, closed');
      assert.match(got.b2.cls, /is-bag-full/);
      // The tip.
      await tab.hover('.pack-slot[data-pack-bag="b3"]');
      await tab.waitForFunction(() => !document.getElementById('pack-tip')?.hidden, null, { timeout: 5000 });
      const tip = await tab.evaluate(() => [...document.getElementById('pack-tip').children].map((c) => c.textContent));
      assert.deepEqual(tip, ['Snacks', 'Sorted for food', '2 of 10 slots · Click to open']);
      // Open the full sorted bag: full, open and the badge all at once.
      await tab.evaluate(() => document.querySelector('.pack-slot[data-pack-bag="b2"]').click());
      await tab.waitForFunction(() => document.getElementById('pack-bag') && !document.getElementById('pack-bag').hidden, null, { timeout: 5000 });
      const open = await tab.evaluate(() => {
        const s = document.querySelector('.pack-slot[data-pack-bag="b2"]');
        const cs = getComputedStyle(s);
        return { cls: s.className, ring: cs.boxShadow, caret: getComputedStyle(s, '::before').content, line: document.querySelector('#pack-bag .pack-bag-sort-line')?.textContent, headBadge: Boolean(document.querySelector('#pack-bag .pack-bag-head .pack-bag-sort')), aria: document.getElementById('pack-bag').getAttribute('aria-label') };
      });
      assert.match(open.cls, /is-bag-full/);
      assert.match(open.cls, /is-open/);
      assert.notEqual(open.ring, 'none', 'the gold ring');
      assert.equal(open.caret, '""', 'the caret');
      assert.equal(open.line, 'Sorted for mining · ore chunks, rock chunks and metal ingots');
      assert.ok(open.headBadge, 'the tray head repeats the badge');
      assert.equal(open.aria, 'Mining, etc., sorted for mining, 10 of 10 slots used');
      const again = await bags(tab);
      assert.ok(again.b2.badgeShown && again.b2.inside, 'the badge still shows on the full, open bag');
      await tab.evaluate(() => document.querySelector('.pack-slot[data-pack-bag="b2"]').click());
      // The Sort menu.
      await tab.click('.pack-slot[data-pack-bag="b3"]', { button: 'right' });
      await tab.waitForSelector('[data-feature-pack-sub="bags_sort"]', { timeout: 5000 });
      await tab.click('[data-feature-pack-sub="bags_sort"]');
      await tab.waitForSelector('#pack-popover .vm-row img.vm-icon', { timeout: 5000 });
      const menu = await tab.evaluate(() => [...document.querySelectorAll('#pack-popover .vm-row[role="menuitemradio"]')].map((r) => ({ label: r.querySelector('.vm-label').textContent, icon: r.querySelector('img.vm-icon')?.getAttribute('src') || '', ok: !r.querySelector('img.vm-icon') || r.querySelector('img.vm-icon').naturalWidth > 0, current: r.getAttribute('aria-checked') === 'true' })));
      assert.equal(menu.length, 15);
      assert.equal(menu[0].icon, '');
      for (const [i, sort] of BAG_SORTS.entries()) {
        assert.match(menu[i + 1].icon, new RegExp(`/${BAG_SORT_ICONS[sort.id]}\\.webp(\\?|$)`), sort.id);
      }
      assert.ok(menu.every((m) => m.ok), 'every icon loads');
      assert.deepEqual(menu.filter((m) => m.current).map((m) => m.label), ['Food']);
    } finally {
      await ctx.close();
    }
  });

  it('Classic: the sort\'s icon on the count strip in place of the dot, no disc', { timeout: 120_000 }, async () => {
    const { ctx, tab } = await open({ width: 1280, height: 800, ui: 'classic' });
    try {
      assert.equal(await tab.evaluate(() => document.documentElement.dataset.ui), 'classic');
      const got = await bags(tab);
      for (const [k, cls] of [['b1', 'carrot'], ['b2', 'metal_rock'], ['b3', 'sammich']]) {
        assert.equal(got[k].badgeShown, false, `${k}: no disc in Classic`);
        assert.match(got[k].dot.bg, new RegExp(`${cls}\\.webp`), `${k}: the strip shows the icon`);
        assert.equal(got[k].dot.w, 14);
      }
      for (const k of ['b4', 'b5', 'b6']) {
        assert.equal(got[k].dot.bg, 'none', `${k} keeps the dot`);
        assert.equal(got[k].dot.w, 5);
      }
    } finally {
      await ctx.close();
    }
  });

  for (const [width, height] of [[402, 874], [375, 667]]) {
    it(`a ${width}x${height} phone: the badge stays inside its slot and the scrolling row; the tray head says the sort`, { timeout: 120_000 }, async () => {
      const { ctx, tab } = await open({ width, height, phone: true });
      try {
        assert.ok(await tab.evaluate(() => document.documentElement.classList.contains('phone-layout')));
        const got = await bags(tab);
        for (const k of ['b1', 'b2', 'b3']) {
          assert.ok(got[k].badgeShown, `${k} shows`);
          assert.equal(got[k].inside, true, `${k}: inside its slot`);
          assert.equal(got[k].inRow, true, `${k}: not clipped by the row`);
        }
        await tab.evaluate(() => document.querySelector('.pack-slot[data-pack-bag="b1"]').click());
        await tab.waitForFunction(() => document.querySelector('#pack-bag .pack-bag-sort-line'), null, { timeout: 5000 });
        assert.equal(await tab.evaluate(() => document.querySelector('#pack-bag .pack-bag-sort-line').textContent), 'Sorted for crops · crops and crop seeds');
      } finally {
        await ctx.close();
      }
    });
  }
});
