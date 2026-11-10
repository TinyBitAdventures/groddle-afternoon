/**
 * The Social drawer's tab row and Chats list (option A, Austin 2026-11-02, after ticket 37: with many
 * chats open the row ran off the drawer and Local scrolled out of sight). The row is always Activity,
 * Local, Global, Buddies and Chats; every other conversation is a row in the Chats list (Private,
 * Groups, Channels), unread and newest first, opened under a "‹ Chats" bar with the Chats tab still
 * selected. The client kept Local on screen and picked the other chats from its contact list
 * (RightSideView.as 195-199, ContactList.as 120-307).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CHATS_TAB,
  CHAT_SECTIONS,
  FIXED_TABS,
  TAB_LABELS,
  chatSections,
  lastLineText,
  mountSocialDrawer,
  sectionOf,
  tabRow,
} from '../public/js/ui/social-drawer.js?v=8fd33c55';
import { createNotifier } from '../public/js/notify.js?v=37c6b748';
import { paneLayout } from '../public/js/classic/classic-panes.js?v=f5ac17db';
import { memoryStore, page } from './social-fake-dom.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

let clock = 1000;
function mount({ mode = 'online' } = {}) {
  const p = page();
  globalThis.document = p.doc;
  globalThis.CSS ||= { escape: (v) => String(v) };
  const winListeners = {};
  globalThis.addEventListener = (type, fn) => (winListeners[type] ||= []).push(fn);
  const notifier = createNotifier({ now: () => 0, clock: () => 0, onChange: () => drawer?.update() });
  const data = {};
  let drawer = null;
  drawer = mountSocialDrawer({ root: p.game, dock: p.dock, notifier, mode, storage: memoryStore(), width: () => 1920, canChat: () => true, streetName: () => 'Hechey Track', setData: (k, v) => { data[k] = v; } });
  const winKey = (key) => {
    const e = { key, target: p.doc.body, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
    for (const fn of winListeners.keydown || []) fn(e);
    return e;
  };
  const say = (id, name, text, extra = {}) => drawer.push(id, { name, text, at: (clock += 1000), ...extra });
  return { ...p, drawer, data, winKey, say };
}

/** Today's live mix: a party, the Butler, a group, Live Help and Trade, and Global as its tab. */
function busy() {
  const t = mount();
  t.drawer.channel('help', { label: 'Live Help', placeholder: 'Chat in Live Help', initial: '?' });
  t.drawer.channel('trade', { label: 'Trade Channel', placeholder: 'Chat in Trade Channel' });
  t.drawer.channel('global', { label: 'Global Chat', placeholder: 'Chat in Global Chat' });
  t.drawer.channel('group:3', { label: 'Groddle Gardeners', note: '3 members' });
  t.drawer.channel('party', { label: 'Party', prefix: '/p ', note: '2 members' });
  t.drawer.channel('butler', { label: 'Jeeves', section: 'private', note: 'Butler', placeholder: 'IM Jeeves (try help)' });
  t.say('trade', 'Friendly', 'selling 20 cherries, 2c each');
  t.say('help', 'calais', 'how do I get back to the subway?');
  t.say('group:3', 'Friendly', 'the bean patch is ready');
  t.drawer.open();
  return t;
}

const ids = (box, attr) => box.querySelectorAll(`[${attr}]`).map((b) => b.getAttribute(attr));

describe('the Chats list: rules', () => {
  it('the row is the four fixed tabs and Chats; Global Chat shortens to Global', () => {
    assert.deepEqual(FIXED_TABS, ['activity', 'local', 'global', 'buddies']);
    assert.equal(CHATS_TAB, 'chats');
    assert.equal(TAB_LABELS.global, 'Global');
    assert.deepEqual(tabRow(['activity', 'local', 'global', 'buddies', 'party', 'help', 'group:3', 'trade', 'butler'], { online: true }), ['activity', 'local', 'global', 'buddies', 'chats']);
    assert.deepEqual(tabRow(['activity', 'local', 'global', 'buddies'], { online: true }), ['activity', 'local', 'global', 'buddies', 'chats'], 'Chats is there online even empty');
    assert.deepEqual(tabRow(['activity']), ['activity'], 'solo: Activity only');
  });

  it('sections: private first (party, Butler, IMs), then groups, then channels', () => {
    assert.deepEqual(CHAT_SECTIONS.map((s) => s.title), ['Private', 'Groups', 'Channels']);
    assert.deepEqual(['party', 'butler', 'im:9', 'group:3', 'help', 'trade', 'anything'].map((id) => sectionOf(id)), ['private', 'private', 'private', 'groups', 'channels', 'channels', 'channels']);
    assert.equal(sectionOf('whatever', 'private'), 'private', 'a feature may say');
    assert.equal(sectionOf('group:3', 'nonsense'), 'groups');
  });

  it('within a section: unread first, then newest, then by name', () => {
    const secs = chatSections([
      { id: 'help', label: 'Live Help', unread: 0, lastAt: 50 },
      { id: 'trade', label: 'Trade Channel', unread: 2, lastAt: 10 },
      { id: 'zeta', label: 'Zeta', unread: 0, lastAt: 50 },
      { id: 'group:1', label: 'B', unread: 0, lastAt: 5 },
      { id: 'group:2', label: 'A', unread: 0, lastAt: 9 },
      { id: 'party', label: 'Party', unread: 0, lastAt: 1 },
    ]);
    assert.deepEqual(secs.map((s) => [s.id, s.rows.map((r) => r.id)]), [
      ['private', ['party']],
      ['groups', ['group:2', 'group:1']],
      ['channels', ['trade', 'help', 'zeta']],
    ]);
    assert.deepEqual(chatSections([]), [], 'no empty sections');
  });

  it('a row\'s last line: who said it, only the words in a private chat with that one person', () => {
    assert.equal(lastLineText([]), '');
    assert.equal(lastLineText([{ name: 'Friendly', text: 'the bean patch is ready' }]), 'Friendly: the bean patch is ready');
    assert.equal(lastLineText([{ name: 'Ada', text: 'on my way', mine: true }]), 'You: on my way');
    assert.equal(lastLineText([{ name: 'Kukui', text: 'thanks for the teleport' }], { label: 'Kukui', section: 'private' }), 'thanks for the teleport');
    assert.equal(lastLineText([{ note: true, text: 'Fi joined the party.' }]), 'Fi joined the party.');
  });
});

describe('the Chats list: in the drawer', () => {
  it('five tabs whatever is open; the Chats badge is the total of the other conversations', () => {
    const t = busy();
    assert.deepEqual(ids(t.dock.querySelector('[data-social-tabs]'), 'data-social-tab'), ['activity', 'local', 'global', 'buddies', 'chats']);
    assert.equal(t.dock.querySelector('[data-social-tab="global"]').textContent, 'Global');
    assert.equal(t.dock.querySelector('[data-social-tab="global"]').title, 'Global Chat', 'its whole name on hover');
    const chats = t.dock.querySelector('[data-social-tab="chats"]');
    assert.match(chats.textContent, /Chats3$/, 'the label and the total');
    assert.equal(chats.getAttribute('aria-label'), 'Chats, 3 new');
    assert.equal(t.data.socialTabs, 'activity,local,global,buddies,chats');
    assert.equal(t.data.socialUnread.split(',').includes('chats:3'), true);
  });

  it('the list: Private, Groups, Channels, each row its circle, name, note, last line and count', () => {
    const t = busy();
    t.dock.querySelector('[data-social-tab="chats"]').click();
    assert.equal(t.drawer.tab, 'chats');
    assert.equal(t.drawer.chat, '');
    assert.equal(t.dock.querySelector('[data-social-compose]').hidden, true, 'no input over the list');
    const log = t.dock.querySelector('[data-social-log]');
    assert.equal(log.getAttribute('aria-label'), 'Chats');
    assert.deepEqual(ids(log, 'data-social-chat-section'), ['private', 'groups', 'channels']);
    assert.deepEqual(ids(log, 'data-social-chat'), ['butler', 'party', 'group:3', 'help', 'trade']);
    assert.equal(t.data.socialChats, 'butler,party,group:3,help,trade');
    const help = log.querySelector('[data-social-chat="help"]');
    assert.equal(help.querySelector('.social-chat-av').textContent, '?');
    assert.equal(help.querySelector('.social-chat-note').textContent, 'Everyone', 'channels are everyone');
    assert.equal(help.querySelector('.social-chat-last').textContent, 'calais: how do I get back to the subway?');
    assert.equal(help.classList.contains('is-unread'), true);
    assert.equal(help.querySelector('.social-badge').textContent, '1');
    const group = log.querySelector('[data-social-chat="group:3"]');
    assert.equal(group.querySelector('.social-chat-note').textContent, '3 members');
    const butler = log.querySelector('[data-social-chat="butler"]');
    assert.equal(butler.querySelector('.social-chat-note').textContent, 'Butler');
    assert.equal(butler.classList.contains('is-unread'), false);
    assert.equal(butler.querySelector('.social-chat-last').classList.contains('is-empty'), true);
  });

  it('a row opens its conversation under "‹ Chats" with Chats still selected; back goes to the list', () => {
    const t = busy();
    t.drawer.select('chats');
    const seen = [];
    t.drawer.onTab((id) => seen.push(id));
    t.dock.querySelector('[data-social-chat="trade"]').click();
    assert.deepEqual(seen, ['trade'], 'the features hear which conversation');
    assert.equal(t.drawer.tab, 'chats');
    assert.equal(t.drawer.chat, 'trade');
    assert.equal(t.data.socialTab, 'chats');
    assert.equal(t.data.socialChat, 'trade');
    assert.equal(t.dock.querySelector('[data-social-tab="chats"]').getAttribute('aria-selected'), 'true');
    const head = t.dock.querySelector('[data-social-conv-head]');
    assert.equal(head.hidden, false);
    assert.equal(head.querySelector('.social-conv-name').textContent, 'Trade Channel');
    assert.equal(head.querySelector('[data-social-back]').textContent, 'Chats');
    assert.equal(t.drawer.unread('trade'), 0);
    assert.equal(t.drawer.unread('chats'), 2);
    assert.equal(t.input.placeholder, 'Chat in Trade Channel', 'the channel\'s own words');
    assert.match(t.dock.querySelector('[data-social-log]').textContent, /Friendly selling 20 cherries/);
    t.dock.querySelector('[data-social-back]').click();
    assert.equal(t.drawer.chat, '');
    assert.equal(t.drawer.tab, 'chats');
    assert.equal(t.dock.querySelector('[data-social-conv-head]').hidden, true);
    // A conversation with no words of its own says "Message <name>".
    t.drawer.channel('im:9', { label: 'Kukui', note: 'Buddy' });
    t.drawer.select('im:9');
    assert.equal(t.input.placeholder, 'Message Kukui');
    assert.equal(t.dock.querySelector('[data-social-compose]').hidden, false);
  });

  it('opened from anywhere else (select, a Buddies or player menu) a conversation opens inside Chats', () => {
    const t = busy();
    t.drawer.select('local');
    t.drawer.select('group:3');
    assert.equal(t.drawer.tab, 'chats');
    assert.equal(t.drawer.chat, 'group:3');
    assert.equal(t.dock.querySelector('[data-social-conv-head]').hidden, false);
    // Global is a tab of its own: never in the list.
    t.drawer.select('global');
    assert.equal(t.drawer.tab, 'global');
    assert.equal(t.drawer.chat, '');
    assert.equal(t.drawer.chats.includes('global'), false);
  });

  it('a new message in a closed conversation raises the Chats count and moves it up; seen ones do not count', () => {
    const t = busy();
    t.drawer.select('local');
    t.say('butler', 'Jeeves', 'Kukui is on your Home Street.');
    assert.equal(t.drawer.unread('chats'), 4);
    assert.match(t.dock.querySelector('[data-social-tab="chats"]').textContent, /Chats4$/);
    assert.equal(t.drawer.tab, 'local', 'it never takes you off Local');
    assert.deepEqual(t.drawer.chats.slice(0, 2), ['butler', 'party'], 'unread first in Private');
    t.say('group:3', 'Bo', 'and the peppers');
    t.drawer.channel('group:7', { label: 'Aardvarks' });
    t.say('group:7', 'Zed', 'hello');
    assert.deepEqual(t.drawer.chats.filter((id) => id.startsWith('group:')), ['group:7', 'group:3'], 'the newest unread first');
    // Your own lines are not news.
    t.say('trade', 'Ada', 'I will take them', { mine: true });
    assert.equal(t.drawer.unread('trade'), 1);
  });

  it('the rail: the same five, Chats one button with the total that opens the list', () => {
    const t = busy();
    t.drawer.close();
    const rail = t.dock.querySelector('[data-social-rail]');
    assert.deepEqual(ids(rail, 'data-social-rail-tab'), ['activity', 'local', 'global', 'buddies', 'chats']);
    const chats = rail.querySelector('[data-social-rail-tab="chats"]');
    assert.equal(chats.getAttribute('aria-label'), 'Chats, 3 new');
    assert.equal(chats.querySelector('.social-badge').textContent, '3');
    chats.click();
    assert.equal(t.drawer.isOpen(), true);
    assert.equal(t.drawer.tab, 'chats');
    assert.equal(t.drawer.chat, '');
  });

  it('keys: Tab reaches the rows, Up and Down move between them, Enter opens one and the input takes the keyboard', () => {
    const t = busy();
    t.drawer.select('chats');
    const log = t.dock.querySelector('[data-social-log]');
    const first = log.querySelector('[data-social-chat="butler"]');
    assert.equal(first.getAttribute('tabindex'), null, 'a plain button: in the Tab order');
    assert.equal(log.getAttribute('tabindex'), '-1', 'Tab from the tabs lands on a row, not the list around them');
    first.focus();
    const down = first.dispatch('keydown', { key: 'ArrowDown' });
    assert.equal(down.defaultPrevented, true);
    assert.equal(down.stopped, true, 'never the avatar');
    assert.equal(t.doc.activeElement.getAttribute('data-social-chat'), 'party');
    t.doc.activeElement.dispatch('keydown', { key: 'End' });
    assert.equal(t.doc.activeElement.getAttribute('data-social-chat'), 'trade');
    t.doc.activeElement.dispatch('keydown', { key: 'Home' });
    assert.equal(t.doc.activeElement.getAttribute('data-social-chat'), 'butler');
    t.doc.activeElement.dispatch('keydown', { key: 'ArrowUp' });
    assert.equal(t.doc.activeElement.getAttribute('data-social-chat'), 'butler', 'stops at the top');
    // Enter on a focused button is its click.
    const help = log.querySelector('[data-social-chat="help"]');
    help.focus();
    help.click();
    assert.equal(t.drawer.chat, 'help');
    assert.equal(t.doc.activeElement, t.input);
  });

  it('Escape in a conversation goes back to the list on its row; Escape there gives the keys back', () => {
    const t = busy();
    t.drawer.select('help');
    t.input.focus();
    const esc = t.input.dispatch('keydown', { key: 'Escape' });
    assert.equal(esc.stopped, true, 'the game does not also take it');
    assert.equal(t.drawer.chat, '');
    assert.equal(t.drawer.tab, 'chats');
    const row = t.doc.activeElement;
    assert.equal(row.getAttribute('data-social-chat'), 'help');
    let blurred = false;
    row.blur = () => { blurred = true; };
    const again = row.dispatch('keydown', { key: 'Escape' });
    assert.equal(blurred, true);
    assert.equal(again.stopped, false, 'the game sees it');
    // Escape on a focused tab still lets go at once (ticket 37), conversation open or not.
    t.drawer.select('help');
    const tab = t.dock.querySelector('[data-social-tab="chats"]');
    tab.focus();
    let let_go = false;
    tab.blur = () => { let_go = true; };
    tab.dispatch('keydown', { key: 'Escape' });
    assert.equal(let_go, true);
    assert.equal(t.drawer.chat, 'help', 'the conversation stays');
  });

  it('a click on a row or the back pill never takes the keyboard', () => {
    const t = busy();
    t.drawer.select('chats');
    t.doc.activeElement = t.doc.body;
    const row = t.dock.querySelector('[data-social-chat="group:3"]');
    assert.equal(row.dispatch('pointerdown').defaultPrevented, true);
    row.click();
    assert.equal(t.doc.activeElement, t.doc.body);
    assert.equal(t.winKey('ArrowLeft').defaultPrevented, false, 'the arrows walk');
    const back = t.dock.querySelector('[data-social-back]');
    assert.equal(back.dispatch('pointerdown').defaultPrevented, true);
    back.click();
    assert.equal(t.doc.activeElement, t.doc.body);
  });

  it('Global waits for Global Chat: no input until it is joined, and closing it leaves the tab', () => {
    const t = mount();
    t.drawer.open();
    t.drawer.select('global');
    assert.equal(t.dock.querySelector('[data-social-compose]').hidden, true, 'a line typed now would go to Local');
    assert.match(t.dock.querySelector('[data-social-log]').textContent, /Joining Global Chat/);
    t.drawer.channel('global', { label: 'Global Chat', placeholder: 'Chat in Global Chat', empty: 'Nobody has said anything here yet.' });
    assert.equal(t.dock.querySelector('[data-social-compose]').hidden, false);
    assert.equal(t.input.placeholder, 'Chat in Global Chat');
    assert.equal(t.dock.querySelector('[data-social-tab="global"]').textContent, 'Global');
    t.drawer.drop('global');
    assert.deepEqual(t.drawer.tabs, ['activity', 'local', 'global', 'buddies', 'chats']);
    assert.equal(t.drawer.tab, 'local');
  });

  it('solo has no Chats (Activity only), as before', () => {
    const t = mount({ mode: 'solo' });
    assert.deepEqual(t.drawer.tabs, ['activity']);
    assert.equal(t.dock.querySelector('[data-social-tabs]').hidden, true);
    assert.equal(t.dock.querySelector('[data-social-rail-tab="chats"]'), null);
  });

  it('Classic: Chats and a conversation open as the pane above Local Chat / Activity, titled with their names', () => {
    const t = busy();
    t.drawer.select('chats');
    assert.equal(paneLayout({ online: true, tab: t.drawer.showing }).upper, true);
    assert.equal(t.drawer.label(t.drawer.showing), 'Chats');
    t.drawer.select('trade');
    assert.equal(t.drawer.showing, 'trade');
    assert.equal(t.drawer.label(t.drawer.showing), 'Trade Channel');
    assert.match(read('public/js/classic/classic-panes.js'), /const tab = d\.showing \?\? d\.tab;/);
    const css = read('public/css/classic.css');
    assert.match(css, /:root\[data-ui="classic"\] \.social-drawer \.social-chat-row\[data-social-chat="trade"\] \.social-chat-av \{ background-image: url\("\.\.\/assets\/classic\/contact_trade\.webp/);
    assert.match(css, /:root\[data-ui="classic"\] \.social-drawer \.social-conv-who \{ display: none; \}/);
  });

  it('style.css: the five tabs share the row and never scroll; the list and the back pill are drawn', () => {
    const css = read('public/style.css');
    assert.match(css, /\.social-tabs \{[^}]*overflow: hidden;/);
    assert.doesNotMatch(css, /\.social-tabs \{[^}]*overflow-x: auto/);
    assert.match(css, /\.social-drawer \.social-tab \{[^}]*flex: 1 1 auto;[^}]*min-width: 0;/);
    assert.match(css, /\.social-tab\.is-chats \{ flex: 0 0 auto;/);
    assert.match(css, /\.social-tabs\.is-tight \.social-tab:not\(\.is-chats\) \.social-badge \{[^}]*font-size: 0;/, 'counts become dots when tight');
    for (const sel of ['.social-chat-row', '.social-chat-sec-title', '.social-conv-head', '.social-back']) assert.ok(css.includes(`${sel} {`), sel);
  });
});
