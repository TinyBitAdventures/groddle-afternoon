/**
 * The Social drawer (phase 2 modern skin, js/ui/social-drawer.js): the right-hand drawer that
 * holds the Activity log (the notifier's own entries), Local, Global, Buddies and the Chats
 * list (Party, the other chat channels, groups: tests/social-chats-list.test.js); a 44 px rail when collapsed; open by default from 1440 px, the player's choice
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
  PHONE_SIDE,
  phoneSized,
  readChoice,
  startsOpen,
  splitChat,
  withTimeLines,
  writeChoice,
} from '../public/js/ui/social-drawer.js?v=2aa33a1a';
import { createNotifier } from '../public/js/notify.js?v=1fb97b21';
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

  it('online: Activity, Local, Global, Buddies and Chats; chat lines count on a tab not in front; Party comes and goes in Chats', () => {
    const t = mount({ mode: 'online', width: 1920 });
    assert.equal(t.drawer.isOpen(), true, 'open at 1440 and up');
    assert.equal(t.dock.getAttribute('aria-label'), 'Social');
    assert.deepEqual(t.drawer.tabs, ['activity', 'local', 'global', 'buddies', 'chats']);
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
    assert.deepEqual(t.drawer.tabs, ['activity', 'local', 'global', 'buddies', 'chats'], 'the row never grows');
    assert.deepEqual(t.drawer.chats, ['party']);
    t.drawer.push('party', { name: 'Bramble', text: 'meet at Gregarious Grange in 5?' });
    t.drawer.localLine('Tiramisu', 'anyone got spare cherries?');
    assert.equal(t.drawer.unread('party'), 1);
    const tab = t.dock.querySelector('[data-social-tab="chats"]');
    assert.equal(tab.getAttribute('role'), 'tab');
    assert.equal(tab.getAttribute('aria-label'), 'Chats, 1 new');
    tab.click();
    assert.deepEqual(seen, ['chats']);
    assert.equal(t.drawer.unread('party'), 1, 'the list shows it, unread');
    t.dock.querySelector('[data-social-chat="party"]').click();
    assert.deepEqual(seen, ['chats', 'party']);
    assert.equal(t.drawer.tab, 'chats', 'Chats stays selected');
    assert.equal(t.drawer.chat, 'party');
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
    assert.equal(t.drawer.tab, 'chats', 'a party that ended goes, back to the list');
    assert.equal(t.drawer.chat, '');
    assert.deepEqual(t.drawer.chats, []);
    assert.equal(t.data.socialTabs, 'activity,local,global,buddies,chats');
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
    assert.equal(t.drawer.tab, 'global');
    assert.equal(t.doc.activeElement.getAttribute('data-social-tab'), 'global');
    t.dock.querySelector('[data-social-tab="global"]').dispatch('keydown', { key: 'End' });
    assert.equal(t.drawer.tab, 'chats');
    t.dock.querySelector('[data-social-tab="chats"]').dispatch('keydown', { key: 'Home' });
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
          { id: 4, name: 'Moss', online: true, where: 'Online: Groddle Meadow', actions: [], face: '/players/4/tile' },
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
    // Report #178: a buddy's own look over the lettered circle; the circle stays when there is no
    // picture (Pip's row has none) or it fails to load, and a miss is not asked for again.
    const av = (id) => log.querySelector(`[data-social-buddy="${id}"]`).querySelector('.social-av');
    const face = (id) => av(id).querySelector('img');
    assert.equal(face(4).getAttribute('src'), '/players/4/tile');
    assert.equal(face(5), null);
    assert.equal(av(4).textContent, 'M', 'the letter is still there under the picture');
    assert.equal(av(4).getAttribute('data-face'), null, 'not shown until it loads');
    for (const l of face(4).listeners.load) (l.fn || l)({});
    assert.equal(av(4).getAttribute('data-face'), '');
    t.drawer.refresh();
    assert.equal(av(4).getAttribute('data-face'), '', 'a redraw shows a loaded face at once');
    for (const l of face(4).listeners.error) (l.fn || l)({});
    assert.equal(av(4).getAttribute('data-face'), null);
    t.drawer.refresh();
    assert.equal(face(4), null, 'a picture that did not load is not asked for again');
    assert.equal(av(4).textContent, 'M');
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
    assert.match(game, /import \{ mountSocialDrawer \} from '\.\/js\/ui\/social-drawer\.js\?v=[0-9a-f]{8}';/);
    // Both skins mount it (Classic restyles it in place), so the interface can switch at runtime.
    assert.match(game, /const MODERN_UI = true;/);
    assert.match(game, /activityLog: !MODERN_UI,\n\s+sideInset: \(\) => socialDrawer\?\.inset\(\) \|\| null,/);
    assert.match(game, /dock: document\.getElementById\('local-chat-dock'\),\n\s+notifier: notify,/);
    assert.match(game, /socialDrawer\?\.update\(what\);/);
    assert.match(game, /!document\.body\.classList\.contains\('nx-hide-chat'\)/, '"/" waits out the tutorial');
  });

  it('every Local chat line goes to the drawer (Local online, the Activity log solo), logged once', () => {
    const fn = game.slice(game.indexOf('function showLocalChatBubble('), game.indexOf('function handleFeatResult('));
    assert.match(fn, /if \(socialDrawer\) \{\n\s+socialDrawer\.localLine\(participant, message, \{ feat, mine, playerId, rk \}\);\n\s+return;/);
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

describe('report #100: on a phone the drawer starts as the rail and its close arrow takes the tap', () => {
  it('a phone-sized window (short side under 500, either way round) starts as the rail, whatever was chosen', () => {
    assert.equal(PHONE_SIDE, 500);
    for (const [w, h] of [[375, 667], [390, 844], [844, 390], [667, 375], [932, 430]]) {
      assert.equal(phoneSized(w, h), true, `${w}x${h}`);
      assert.equal(startsOpen(w, h, true), false, `${w}x${h} after choosing open`);
      assert.equal(startsOpen(w, h, null), false);
    }
    // A tablet, a laptop and a desktop keep the choice and the 1440 default; an unknown height is not a phone.
    assert.equal(phoneSized(1024, 768), false);
    assert.equal(startsOpen(1024, 768, true), true);
    assert.equal(startsOpen(1280, 800, null), false);
    assert.equal(startsOpen(1440, 900, null), true);
    assert.equal(startsOpen(1440, 900, false), false);
    assert.equal(phoneSized(1280, 0), false);
    assert.equal(startsOpen(1600, undefined, null), true);
    const src = readFileSync(join(root, 'public/js/ui/social-drawer.js'), 'utf8');
    assert.match(src, /let open = startsOpen\(width\(\), height\(\), choice\);/);
    assert.match(src, /restore: \(\) => setOpen\(startsOpen\(width\(\), height\(\), choice\)\),/);
  });
});

let chromium = null;
try { chromium = (await import('playwright')).chromium; } catch { /* no Playwright */ }

describe('report #100: the open drawer and the top bar on phone screens (Chrome)', { skip: !chromium && 'no playwright' }, () => {
  // The browser lock is waited for on its own budget (other lanes' Chrome may hold it for minutes).
  const LOCK_WAIT_MS = 30 * 60_000;
  let server = null;
  let chrome = null;
  before(async () => {
    const { openBrowser } = await import('../tools/qa/browser.mjs');
    const { startServer } = await import('../tools/qa/serve.mjs');
    chrome = await openBrowser({ label: 'social-drawer phone test', waitMs: LOCK_WAIT_MS });
    server = await startServer({ root: join(root, 'public') });
  }, { timeout: LOCK_WAIT_MS + 60_000 });
  after(async () => {
    await chrome?.close();
    await server?.stop();
  });

  it('portrait and landscape phones: the rail first; open, the close arrow is the element under a finger on it; Report a problem is on screen', { timeout: 180_000 }, async () => {
    const base = `http://127.0.0.1:${server.address().port}`;
    const html = readFileSync(join(root, 'public/play/online/index.html'), 'utf8');
    // The real top bar and dock markup of the online page.
    const header = html.slice(html.indexOf('<header class="top-bar"'), html.indexOf('</header>') + '</header>'.length);
    const dockAt = html.indexOf('<section id="local-chat-dock"');
    const dock = html.slice(dockAt, html.indexOf('</section>', dockAt) + '</section>'.length);
    assert.ok(header.includes('hud-actions') && dock.includes('local-chat-form'));
    const bad = [];
    for (const [w, h] of [[375, 667], [390, 844], [844, 390], [667, 375]]) {
      const ctx = await chrome.browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
      const tab = await ctx.newPage();
      await tab.goto(`${base}/style.css`);
      await tab.setContent(`<!doctype html><html data-ui="modern"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css">
<style>html,body{margin:0;height:100%;overflow:hidden}#wrap{position:fixed;inset:0}#game-root{position:absolute;inset:0}</style></head>
<body><div id="wrap" class="glitch-chrome">${header}<div id="game-root">${dock}</div></div></body></html>`, { waitUntil: 'load' });
      const r = await tab.evaluate(async () => {
        const { mountSocialDrawer } = await import('/js/ui/social-drawer.js');
        const { createNotifier } = await import('/js/notify.js');
        // As the player had it: online, playing somewhere else too, with people around.
        window.groddleRealtime = { client: { state: 'online', here: 3, players: [{ name: 'Ada' }, { name: 'Bo' }] } };
        const store = new Map([['groddle-social-drawer', 'open']]);
        const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };
        const d = mountSocialDrawer({ root: document.getElementById('game-root'), dock: document.getElementById('local-chat-dock'), notifier: createNotifier({}), mode: 'online', storage });
        const startedOpen = d.isOpen();
        d.statusSlot.append(Object.assign(document.createElement('span'), { className: 'mp-state', textContent: 'Playing somewhere else' }), Object.assign(document.createElement('button'), { type: 'button', textContent: 'Play here' }));
        d.setOnline(12);
        // The report button goes before Sound, as features/bug-report-feature.js puts it.
        const bug = Object.assign(document.createElement('button'), { id: 'bug-btn', type: 'button', className: 'chrome-btn mute-btn bug-btn' });
        bug.append(Object.assign(document.createElement('img'), { alt: '', width: 23, height: 20 }));
        const sound = document.getElementById('sound-btn');
        sound.parentElement.insertBefore(bug, sound);
        document.getElementById('study-chip').hidden = false;
        document.getElementById('study-chip').textContent = 'Skills · 4 available';
        d.open();
        await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
        // G552: the drawer grows from the 44 px rail for 180 ms, with the arrow pushed out of it and off the
        // screen at the start. Two frames in is usually far enough along, so wait for the open drawer itself.
        const drawerMoving = document.getElementById('local-chat-dock').getAnimations();
        await Promise.all(drawerMoving.map((a) => a.finished));
        const x = document.querySelector('[data-social-collapse]');
        const b = x.getBoundingClientRect();
        const cx = b.left + b.width / 2;
        const cy = b.top + b.height / 2;
        // The centre and a finger's width round it (the 44 px round button: 20 px out straight, 15 px on
        // the diagonals) all land on the arrow.
        const misses = [];
        for (const [dx, dy] of [[0, 0], [-15, -15], [15, -15], [-15, 15], [15, 15], [0, 20], [0, -20], [20, 0], [-20, 0]]) {
          const at = document.elementFromPoint(cx + dx, cy + dy);
          if (!at?.closest?.('[data-social-collapse]')) misses.push(`${dx},${dy}:${at?.className || at?.tagName}`);
        }
        const status = document.querySelector('.social-status').getBoundingClientRect();
        const bb = bug.getBoundingClientRect();
        const bugAt = document.elementFromPoint(bb.left + bb.width / 2, bb.top + bb.height / 2);
        const more = document.getElementById('more-btn').getBoundingClientRect();
        x.click();
        return {
          startedOpen,
          size: [Math.round(b.width), Math.round(b.height)],
          gap: Math.round(status.top - b.bottom),
          misses,
          bugOnScreen: bb.left >= 0 && bb.right <= innerWidth && bb.top >= 0 && bb.bottom <= innerHeight,
          bugHit: Boolean(bugAt?.closest?.('#bug-btn')),
          menuOnScreen: more.right <= innerWidth,
          closed: !d.isOpen(),
        };
      });
      const where = `${w}x${h}`;
      if (r.startedOpen) bad.push(`${where}: started open`);
      if (r.size[0] < 44 || r.size[1] < 44) bad.push(`${where}: close arrow ${r.size.join('x')}`);
      if (r.misses.length) bad.push(`${where}: taps near the arrow missed it: ${r.misses.join(' ')}`);
      if (r.gap < 0) bad.push(`${where}: the status row overlaps the arrow by ${-r.gap}px`);
      if (!r.bugOnScreen || !r.bugHit) bad.push(`${where}: Report a problem not reachable`);
      if (!r.menuOnScreen) bad.push(`${where}: Menu off screen`);
      if (!r.closed) bad.push(`${where}: the arrow did not close the drawer`);
      await ctx.close();
    }
    assert.deepEqual(bad, []);
  });
});
