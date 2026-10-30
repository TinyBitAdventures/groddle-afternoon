/**
 * The Social drawer (phase 2 modern skin, js/ui/social-drawer.js): the right-hand drawer that
 * holds the Activity log (the notifier's own entries), Local, Party, the chat channels and
 * Buddies; a 44 px rail when collapsed; open by default from 1440 px, the player's choice
 * remembered; "/" and Up/Down in its input. And the wiring: game.js mounts it on
 * #local-chat-dock in the modern skin with no old Activity panel, the notices centre beside
 * it, and the multiplayer features hand their lines and views over (engine.social).
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  OPEN_MIN_WIDTH,
  SOCIAL_STORE_KEY,
  TIME_GAP_MS,
  avatarOf,
  badgeText,
  clockLabel,
  createHistory,
  defaultOpen,
  mountSocialDrawer,
  readChoice,
  splitChat,
  withTimeLines,
  writeChoice,
} from '../public/js/ui/social-drawer.js?v=g468-2';
import { createNotifier } from '../public/js/notify.js?v=g459-1';
import { resolveTokens } from './css-tokens.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

import { FakeEl, memoryStore, page } from './social-fake-dom.js';

describe('the Social drawer: rules', () => {
  it('opens by default at 1440 px wide and up, the rail below', () => {
    assert.equal(OPEN_MIN_WIDTH, 1440);
    assert.equal(defaultOpen(1440), true);
    assert.equal(defaultOpen(1920), true);
    assert.equal(defaultOpen(1439), false);
    assert.equal(defaultOpen(1024), false);
  });

  it('keeps the player\'s choice, and a store that throws (a private window) is only the default again', () => {
    const s = memoryStore();
    assert.equal(readChoice(s), null);
    assert.equal(writeChoice(s, true), true);
    assert.equal(s.m.get(SOCIAL_STORE_KEY), 'open');
    assert.equal(readChoice(s), true);
    writeChoice(s, false);
    assert.equal(readChoice(s), false);
    const bad = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
    assert.equal(readChoice(bad), null);
    assert.equal(writeChoice(bad, true), false);
    assert.equal(readChoice(null), null);
  });

  it('puts a time line before the first line and after each gap of five minutes', () => {
    assert.equal(TIME_GAP_MS, 5 * 60 * 1000);
    const t0 = new Date(2026, 9, 29, 9, 31).getTime();
    const lines = [{ at: t0 }, { at: t0 + 60_000 }, { at: t0 + 9 * 60_000 }, { at: t0 + 10 * 60_000 }];
    const out = withTimeLines(lines);
    assert.deepEqual(out.map((x) => x.sep || 'line'), ['9:31 AM', 'line', 'line', '9:40 AM', 'line', 'line']);
    assert.equal(clockLabel(new Date(2026, 9, 29, 0, 5).getTime()), '12:05 AM');
    assert.equal(clockLabel(new Date(2026, 9, 29, 13, 0).getTime()), '1:00 PM');
  });

  it('walks back through what you said with Up and forward with Down', () => {
    const h = createHistory(3);
    assert.equal(h.up(), null);
    for (const t of ['one', 'two', 'two', 'three', 'four']) h.push(t);
    assert.deepEqual(h.lines, ['two', 'three', 'four'], 'no repeats in a row, the newest kept');
    assert.equal(h.up(), 'four');
    assert.equal(h.up(), 'three');
    assert.equal(h.up(), 'two');
    assert.equal(h.up(), 'two', 'stops at the oldest');
    assert.equal(h.down(), 'three');
    assert.equal(h.down(), 'four');
    assert.equal(h.down(), '', 'past the newest: an empty input');
    assert.equal(h.down(), null);
  });

  it('badges, initials and solo chat lines', () => {
    assert.equal(badgeText(7), '7');
    assert.equal(badgeText(120), '99+');
    assert.equal(avatarOf('kukui').initial, 'K');
    assert.ok(avatarOf('Kukui').hue >= 0 && avatarOf('Kukui').hue < 8);
    assert.equal(avatarOf('Kukui').hue, avatarOf('Kukui').hue);
    assert.deepEqual(splitChat('Ur: hi there'), { name: 'Ur', text: 'hi there' });
    assert.equal(splitChat('no speaker here'), null);
  });
});

describe('the Social drawer: mounted', () => {
  const saved = {};
  before(() => {
    for (const k of ['document', 'addEventListener', 'innerWidth', 'groddleSocial', 'groddleRealtime', 'groddleBuddies', 'CSS', 'requestAnimationFrame']) saved[k] = globalThis[k];
    globalThis.CSS = { escape: (s) => s };
    globalThis.requestAnimationFrame = (fn) => fn();
  });
  after(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete globalThis[k];
      else globalThis[k] = v;
    }
  });

  function mount({ mode = 'solo', width = 1280, storage = memoryStore(), canChat = () => true } = {}) {
    const p = page();
    globalThis.document = p.doc;
    const winListeners = {};
    globalThis.addEventListener = (type, fn) => (winListeners[type] ||= []).push(fn);
    let clock = new Date(2026, 9, 29, 9, 31).getTime();
    const notifier = createNotifier({ now: () => clock, clock: () => clock, onChange: () => drawer?.update() });
    const data = {};
    let drawer = null;
    drawer = mountSocialDrawer({ root: p.game, dock: p.dock, notifier, mode, storage, width: () => width, canChat, streetName: () => 'Hechey Track', setData: (k, v) => { data[k] = v; } });
    const key = (k, target = p.doc.body) => {
      const e = { key: k, target, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
      for (const fn of winListeners.keydown || []) fn(e);
      return e;
    };
    return { ...p, drawer, notifier, data, key, winListeners, advance: (ms) => { clock += ms; }, storage };
  }

  it('solo: Activity only, the chat input under it, no tabs or presence, the Say button a labelled send icon', () => {
    const t = mount({ mode: 'solo', width: 1280 });
    assert.equal(t.drawer.mode, 'solo');
    assert.deepEqual(t.drawer.tabs, ['activity']);
    assert.equal(t.drawer.isOpen(), false, 'the rail below 1440');
    assert.equal(t.dock.getAttribute('aria-label'), 'Activity');
    assert.ok(t.dock.classList.contains('social-drawer'));
    assert.equal(t.form.parentElement.getAttribute('data-social-compose'), '', 'the form moved into the drawer, ids kept');
    assert.equal(t.send.getAttribute('aria-label'), 'Send');
    t.drawer.open();
    assert.equal(t.dock.querySelector('[data-social-tabs]').hidden, true);
    assert.equal(t.dock.querySelector('[data-social-status]').hidden, true);
    assert.equal(t.dock.querySelector('[data-social-compose]').hidden, false);
    assert.equal(t.input.placeholder, 'Say something on Hechey Track');
    assert.equal(t.storage.m.get(SOCIAL_STORE_KEY), 'open');
    // game.js panelOnScreen() counts any [id$="-panel"] as an open panel (busy): the open drawer is not one.
    assert.deepEqual(t.dock.all().filter((n) => /-panel$/.test(n.id)).map((n) => n.id), []);
  });

  it('solo: the Activity tab draws the notifier\'s entries (no second log) and its unread count', () => {
    const t = mount({ mode: 'solo', width: 1280 });
    t.notifier.notice('Your pack has 16 slots now.');
    t.notifier.gain('You harvest a Cherry Tree. -2 energy, +3 Cherry.');
    t.advance(6 * 60_000);
    t.drawer.localLine('Ur', 'hello street', { mine: true });
    assert.equal(t.notifier.entries.at(-1).kind, 'chat', 'a solo chat line is the notifier\'s own chat entry');
    assert.equal(t.data.socialUnread, 'activity:2', 'chat lines are not counted');
    const rail = t.dock.querySelector('[data-social-rail-tab="activity"]');
    assert.equal(rail.getAttribute('aria-label'), 'Activity, 2 new');
    t.drawer.open();
    assert.equal(t.notifier.unread, 0, 'seen once the tab is open');
    const log = t.dock.querySelector('[data-social-log]');
    assert.equal(log.getAttribute('role'), 'log');
    assert.equal(log.getAttribute('aria-label'), 'Activity log');
    const kinds = log.children.map((c) => c.getAttribute('data-kind') || (c.getAttribute('data-social-time') !== null ? 'time' : 'msg'));
    assert.deepEqual(kinds, ['time', 'info', 'gain', 'time', 'msg']);
    assert.match(log.children[4].textContent, /Ur hello street/);
  });

  it('online: Activity, Local and Buddies; chat lines count on a tab not in front; Party comes and goes', () => {
    const t = mount({ mode: 'online', width: 1920 });
    assert.equal(t.drawer.isOpen(), true, 'open at 1440 and up');
    assert.equal(t.dock.getAttribute('aria-label'), 'Social');
    assert.deepEqual(t.drawer.tabs, ['activity', 'local', 'buddies']);
    assert.equal(t.drawer.tab, 'local');
    t.drawer.localLine('Kukui', 'morning, Hechey!');
    t.drawer.localLine('Ada', 'got 20, one sec', { mine: true });
    assert.equal(t.drawer.unread('local'), 0, 'in front and open');
    const log = t.dock.querySelector('[data-social-log]');
    assert.match(log.textContent, /Kukui morning, Hechey!/);
    assert.match(log.textContent, /You got 20, one sec/, 'your own lines say You');
    assert.equal(log.getAttribute('aria-live'), 'polite');
    const seen = [];
    t.drawer.onTab((id) => seen.push(id));
    t.drawer.channel('party', { label: 'Party', prefix: '/p ', placeholder: 'Message your party' });
    assert.deepEqual(t.drawer.tabs, ['activity', 'local', 'party', 'buddies']);
    t.drawer.push('party', { name: 'Bramble', text: 'meet at Gregarious Grange in 5?' });
    t.drawer.localLine('Tiramisu', 'anyone got spare cherries?');
    assert.equal(t.drawer.unread('party'), 1);
    const tab = t.dock.querySelector('[data-social-tab="party"]');
    assert.equal(tab.getAttribute('role'), 'tab');
    assert.equal(tab.getAttribute('aria-label'), 'Party, 1 new');
    tab.click();
    assert.deepEqual(seen, ['party']);
    assert.equal(t.drawer.unread('party'), 0);
    assert.equal(t.input.placeholder, 'Message your party');
    // What you type in the Party tab goes to the party.
    t.input.value = 'on my way';
    t.form.dispatch('submit');
    assert.equal(t.input.value, '/p on my way');
    t.input.value = '/happy';
    t.form.dispatch('submit');
    assert.equal(t.input.value, '/happy', 'commands stay commands');
    t.drawer.drop('party');
    assert.equal(t.drawer.tab, 'local', 'a party that ended takes its tab away');
    assert.equal(t.data.socialTabs, 'activity,local,buddies');
  });

  it('online: the rail\'s buttons open the drawer on their tab, with the badges in their names', () => {
    const t = mount({ mode: 'online', width: 1280 });
    assert.equal(t.drawer.isOpen(), false);
    t.drawer.localLine('Kukui', 'hi');
    t.drawer.localLine('Kukui', 'anyone?');
    const local = t.dock.querySelector('[data-social-rail-tab="local"]');
    assert.equal(local.getAttribute('aria-label'), 'Local, 2 new');
    assert.equal(t.dock.querySelector('[data-social-expand]').getAttribute('aria-expanded'), 'false');
    local.click();
    assert.equal(t.drawer.isOpen(), true);
    assert.equal(t.drawer.unread('local'), 0);
    assert.equal(t.data.socialOpen, 'open');
    t.dock.querySelector('[data-social-collapse]').click();
    assert.equal(t.drawer.isOpen(), false);
    assert.equal(t.storage.m.get(SOCIAL_STORE_KEY), 'rail', 'the choice is kept');
  });

  it('"/" opens the drawer on a chat tab and focuses the input, unless typing elsewhere or the game says no', () => {
    let ready = true;
    const t = mount({ mode: 'online', width: 1280, canChat: () => ready });
    t.drawer.select('activity');
    const e = t.key('/');
    assert.equal(e.defaultPrevented, true);
    assert.equal(t.drawer.isOpen(), true);
    assert.equal(t.drawer.tab, 'local', 'Activity has no input online: Local');
    assert.equal(t.doc.activeElement, t.input);
    const other = new FakeEl('input');
    t.drawer.close();
    assert.equal(t.key('/', other).defaultPrevented, false, 'typing in another field');
    ready = false;
    assert.equal(t.key('/').defaultPrevented, false, 'the tutorial or a dialog');
    assert.equal(t.drawer.isOpen(), false);
  });

  it('a redraw (a new line, a new count) gives the keyboard back to the button that had it', () => {
    const t = mount({ mode: 'online', width: 1280 });
    t.dock.querySelector('[data-social-rail-tab="local"]').focus();
    t.drawer.localLine('Kukui', 'hi');
    const now = t.doc.activeElement;
    assert.equal(now.getAttribute('data-social-rail-tab'), 'local');
    assert.equal(now.getAttribute('aria-label'), 'Local, 1 new');
    assert.ok(t.dock.contains(now), 'the new copy, in the drawer');
    t.drawer.open();
    t.dock.querySelector('[data-social-tab="buddies"]').focus();
    t.notifier.notice('A new afternoon begins on Hechey Track.');
    assert.equal(t.doc.activeElement.getAttribute('data-social-tab'), 'buddies');
  });

  it('Up and Down in the input walk back through what you sent', () => {
    const t = mount({ mode: 'solo', width: 1920 });
    for (const line of ['hello', '/beans']) {
      t.input.value = line;
      t.form.dispatch('submit');
      t.input.value = '';
    }
    const up = t.input.dispatch('keydown', { key: 'ArrowUp' });
    assert.equal(t.input.value, '/beans');
    assert.equal(up.defaultPrevented, true);
    t.input.dispatch('keydown', { key: 'ArrowUp' });
    assert.equal(t.input.value, 'hello');
    t.input.dispatch('keydown', { key: 'ArrowDown' });
    t.input.dispatch('keydown', { key: 'ArrowDown' });
    assert.equal(t.input.value, '');
  });

  it('keys pressed in the drawer stay there (never the avatar), except Escape; arrows move along the tabs', () => {
    const t = mount({ mode: 'online', width: 1920 });
    const tab = t.dock.querySelector('[data-social-tab="local"]');
    const right = tab.dispatch('keydown', { key: 'ArrowRight' });
    assert.equal(right.stopped, true);
    assert.equal(t.drawer.tab, 'buddies');
    assert.equal(t.doc.activeElement.getAttribute('data-social-tab'), 'buddies');
    t.dock.querySelector('[data-social-tab="buddies"]').dispatch('keydown', { key: 'Home' });
    assert.equal(t.drawer.tab, 'activity');
    assert.equal(tab.dispatch('keydown', { key: 'Escape' }).stopped, false);
  });

  it('a stored choice wins over the width, and the width decides until there is one', () => {
    const t = mount({ mode: 'online', width: 1920, storage: memoryStore({ [SOCIAL_STORE_KEY]: 'rail' }) });
    assert.equal(t.drawer.isOpen(), false);
    const u = mount({ mode: 'solo', width: 1024 });
    assert.equal(u.drawer.isOpen(), false);
  });

  it('says how much of the right edge it covers, and nothing when hidden (the tutorial) or not on the right', async () => {
    const t = mount({ mode: 'online', width: 1920 });
    t.dock.rect = { left: 1612, top: 68, right: 1912, bottom: 668, width: 300, height: 600 };
    t.game.rect = { left: 0, top: 60, right: 1920, bottom: 1080, width: 1920, height: 1020 };
    assert.deepEqual(t.drawer.inset(), { left: 0, right: 316 });
    t.drawer.refresh();
    await Promise.resolve();
    assert.equal(t.game.style.getPropertyValue('--inset-r'), '316px', 'the pack centres clear of it (--inset-r)');
    t.dock.rect = { left: 12, top: 400, right: 402, bottom: 500, width: 390, height: 100 };
    assert.deepEqual(t.drawer.inset(), { left: 0, right: 0 });
    t.dock.rect = { left: 1612, top: 68, right: 1912, bottom: 668, width: 300, height: 600 };
    t.dock.hidden = true;
    assert.deepEqual(t.drawer.inset(), { left: 0, right: 0 });
    t.drawer.refresh();
    await Promise.resolve();
    assert.equal(t.game.style.getPropertyValue('--inset-r'), '0px', 'hidden (the tutorial): nothing covered');
  });

  it('the Buddies tab draws the buddies feature\'s view and counts who added you', () => {
    const t = mount({ mode: 'online', width: 1920 });
    let managed = 0;
    globalThis.groddleBuddies = {
      drawerView: () => ({
        rows: [
          { id: 4, name: 'Moss', online: true, where: 'Online: Groddle Meadow', actions: [] },
          { id: 5, name: 'Pip', online: false, where: 'Offline', actions: [] },
        ],
        empty: 'No buddies yet.',
        addedYou: ['Bramble'],
        newAdds: [9],
        manage: () => { managed += 1; },
      }),
    };
    t.drawer.refresh();
    assert.equal(t.drawer.unread('buddies'), 1);
    t.drawer.select('buddies');
    assert.equal(t.drawer.unread('buddies'), 0);
    const log = t.dock.querySelector('[data-social-log]');
    assert.deepEqual(log.querySelectorAll('[data-social-buddy]').map((li) => [li.getAttribute('data-social-buddy'), li.getAttribute('data-online')]), [['4', 'true'], ['5', 'false']]);
    assert.match(log.textContent, /Online: Groddle Meadow/);
    assert.match(log.textContent, /Added you: Bramble/);
    assert.equal(t.dock.querySelector('[data-social-compose]').hidden, true, 'no input on Buddies (no buddy IMs)');
    log.querySelector('[data-social-manage-buddies]').click();
    assert.equal(managed, 1);
    t.drawer.refresh();
    assert.equal(t.drawer.unread('buddies'), 0, 'seen stays seen');
    delete globalThis.groddleBuddies;
  });
});

describe('the Social drawer: wiring', () => {
  const game = read('public/game.js');

  it('game.js mounts it on #local-chat-dock in the modern skin, with no old Activity panel or button', () => {
    assert.match(game, /import \{ mountSocialDrawer \} from '\.\/js\/ui\/social-drawer\.js\?v=g468-2';/);
    // Both skins mount it (Classic restyles it in place), so the interface can switch at runtime.
    assert.match(game, /const MODERN_UI = true;/);
    assert.match(game, /activityLog: !MODERN_UI,\n\s+sideInset: \(\) => socialDrawer\?\.inset\(\) \|\| null,/);
    assert.match(game, /dock: document\.getElementById\('local-chat-dock'\),\n\s+notifier: notify,/);
    assert.match(game, /socialDrawer\?\.update\(what\);/);
    assert.match(game, /!document\.body\.classList\.contains\('nx-hide-chat'\)/, '"/" waits out the tutorial');
  });

  it('every Local chat line goes to the drawer (Local online, the Activity log solo), logged once', () => {
    const fn = game.slice(game.indexOf('function showLocalChatBubble('), game.indexOf('function handleFeatResult('));
    assert.match(fn, /if \(socialDrawer\) \{\n\s+socialDrawer\.localLine\(participant, message, \{ feat, mine \}\);\n\s+return;/);
    const say = game.slice(game.indexOf('function sayLocalChat('), game.indexOf('function finishAssistedFeatChain('));
    assert.match(say, /mine: participant === 'Ur' \}\);/);
    assert.match(say, /participant === 'Ur' && !socialDrawer\) \{/);
  });

  it('the tutorial keeps it hidden: the drawer is #local-chat-dock, which newxp hides in the clouds', () => {
    assert.match(read('public/js/features/newxp-feature.js'), /body\.nx-hide-chat #local-chat-dock\{visibility:hidden\}/);
    assert.match(read('public/play/index.html'), /<section id="local-chat-dock" class="local-chat-dock" aria-label="Local chat">/);
  });

  it('style.css: 300 px open, 44 px rail, at most 600 px tall, under the top bar, over the world; the notices centre beside it', () => {
    const css = resolveTokens(read('public/style.css'));
    const block = css.slice(css.indexOf('/* —— SOCIAL —— '), css.indexOf('/* —— end SOCIAL —— */'));
    assert.ok(block.length > 1000);
    assert.match(block, /\.local-chat-dock\.social-drawer \{[^}]*top: var\(--social-top, 8px\);[^}]*width: var\(--rail-w, 44px\);/);
    assert.match(block, /\.local-chat-dock\.social-drawer\.is-open \{[^}]*width: var\(--drawer-w, 300px\);[^}]*height: min\(600px, /);
    assert.match(css, /--inset-l: 0px;\n\s+--inset-r: 0px;\n\}/, 'the token block defaults both insets');
    assert.match(block, /\.notify-notices \{\n\s+left: calc\(50% \+ var\(--notify-shift, 0px\)\);/);
    assert.match(block, /@media \(prefers-reduced-motion: reduce\) \{\n\s+\.local-chat-dock\.social-drawer \{ transition: none; \}/);
    // Still the HUD layer: over the world, under panels and notices (the dock's old z).
    assert.match(css, /\.local-chat-dock \{[^}]*z-index: 26;/);
  });

  it('notify-view leaves the Activity panel to the drawer and centres the notices in what it leaves', () => {
    const view = read('public/js/notify-view.js');
    assert.match(view, /const logView = activityLog \? mountActivityLog\(/);
    assert.match(view, /dockEl\?\.classList\.contains\('social-drawer'\) \? null : relRect\(dockEl, rr\)/);
    assert.match(view, /const left = \(zones\.rootW - w\) \/ 2 \+ shift;/);
  });

  it('the multiplayer features hand their lines and views to the drawer when there is one, else the old dock', () => {
    const rt = read('public/js/features/realtime-feature.js');
    assert.match(rt, /social\.statusSlot\?\.append\(pill, hereBtn\);\n\s+social\.channel\('local', \{ header: emoteRow \}\);\n\s+\} else if \(dock && form\) \{/);
    assert.match(rt, /if \(line\.note\) social\?\.push\('local', \{ note: true, text: line\.text \}\);/);
    assert.match(rt, /if \(!social\) window\.addEventListener\('keydown'/);
    const party = read('public/js/features/party-feature.js');
    assert.match(party, /social\.channel\('party', \{ label: 'Party', header: box, prefix: '\/p '/);
    assert.match(party, /social\?\.push\('party', \{ name, text, mine:/);
    const groups = read('public/js/features/groups-feature.js');
    assert.match(groups, /function handOver\(\) \{/);
    assert.match(groups, /social\?\.push\(ch, drawerLine\(line\)\);/);
    const buddies = read('public/js/features/buddies-feature.js');
    assert.match(buddies, /drawerView\(\) \{/);
    assert.match(buddies, /engine\.social\?\.refresh\(\);/);
    assert.match(game, /get social\(\) \{\n\s+return socialDrawer;/);
  });
});
