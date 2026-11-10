/**
 * Your own chat line brings its log to the end (report #171): a line long enough to wrap the
 * input made the log shorter, so the log no longer counted as "at its end" and stayed put,
 * while another player's line (arriving with a one-row input) followed. Every chat with an
 * input goes through the drawer's push (Local, Global and other channels, the party, groups,
 * IMs, the Butler) or its threads' push; solo, Local is the Activity log. The Classic skin's
 * lower pane reads the drawer's ownSaid for the same rule.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { page, memoryStore } from './social-fake-dom.js';
import { mountSocialDrawer } from '../public/js/ui/social-drawer.js?v=82bcf45b';
import { createNotifier } from '../public/js/notify.js?v=1fb97b21';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

function mount(mode) {
  const t = page();
  globalThis.document = t.doc;
  const store = memoryStore();
  let drawer = null;
  const notifier = createNotifier({ onChange: () => drawer?.update() });
  drawer = mountSocialDrawer({ root: t.game, dock: t.dock, notifier, mode, storage: store, width: () => 1920, streetName: () => 'Hechey Track' });
  const log = t.dock.querySelector('.social-log');
  // A tall log scrolled up from its end (as after the input grew by two rows).
  const away = () => Object.assign(log, { scrollHeight: 1000, clientHeight: 400, scrollTop: 300 });
  return { drawer, log, away };
}

describe('your own chat line brings the log to its end', () => {
  const saved = {};
  before(() => {
    for (const k of ['document', 'addEventListener', 'CSS', 'requestAnimationFrame']) saved[k] = globalThis[k];
    globalThis.addEventListener = () => {};
    globalThis.CSS = { escape: (s) => s };
    globalThis.requestAnimationFrame = (fn) => fn();
  });
  after(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete globalThis[k];
      else globalThis[k] = v;
    }
  });

  it('online: Local follows your line from anywhere, and leaves another player\'s where you were reading', () => {
    const { drawer, log, away } = mount('online');
    drawer.select('local');
    away();
    drawer.localLine('Fi', 'hello', { playerId: 6 });
    assert.equal(log.scrollTop, 300, 'someone else\'s line does not pull a reader down');
    drawer.localLine('Ada', 'hello back', { mine: true });
    assert.equal(log.scrollTop, 1000, 'your own line does');
    assert.deepEqual(drawer.ownSaid, { n: 1, id: 'local' });
  });

  it('online: a channel, the party or an IM (any conversation with an input) does the same', () => {
    const { drawer, log, away } = mount('online');
    drawer.channel('party', { label: 'Party' });
    drawer.select('party');
    away();
    drawer.push('party', { name: 'Fi', text: 'over here', playerId: 6 });
    assert.equal(log.scrollTop, 300);
    drawer.push('party', { name: 'Ada', text: 'coming', mine: true });
    assert.equal(log.scrollTop, 1000);
    // A line of yours in a chat that is not in front moves nothing here.
    drawer.select('local');
    away();
    drawer.push('party', { name: 'Ada', text: 'from elsewhere', mine: true });
    assert.equal(log.scrollTop, 300);
    assert.equal(drawer.ownSaid.id, 'party');
  });

  it('online: your reply in an open thread', () => {
    const { drawer, log, away } = mount('online');
    drawer.channel('global', { label: 'Global Chat', threads: true });
    drawer.select('global');
    drawer.push('global', { name: 'Fi', text: 'a question', playerId: 6, rk: 'c1' });
    drawer.threads.connect({ send: () => true, load: () => {} });
    assert.equal(drawer.threads.open('global', 'c1'), true);
    away();
    drawer.threads.push('c1', { name: 'Fi', text: 'more', playerId: 6, rk: 'c2' });
    assert.equal(log.scrollTop, 300);
    drawer.threads.push('c1', { name: 'Ada', text: 'an answer', mine: true, rk: 'c3' });
    assert.equal(log.scrollTop, 1000);
  });

  it('solo: your Local line is in the Activity log, which follows it', () => {
    const { drawer, log, away } = mount('solo');
    drawer.select('activity');
    away();
    drawer.localLine('Amp', 'hello');
    assert.equal(log.scrollTop, 300);
    drawer.localLine('Ur', 'hello back', { mine: true });
    assert.equal(log.scrollTop, 1000);
    assert.deepEqual(drawer.ownSaid, { n: 1, id: 'activity' });
  });

  it('the end is measured after the input shows or hides (it changes the log\'s height)', () => {
    const src = read('public/js/ui/social-drawer.js');
    const view = src.slice(src.indexOf('function renderView()'), src.indexOf('function publish()'));
    assert.ok(view.indexOf('compose.hidden = !showCompose') < view.indexOf('log.scrollTop = log.scrollHeight'), 'input first, then the scroll');
  });

  it('Classic: the lower Local Chat / Activity pane follows your line too', () => {
    const panes = read('public/js/classic/classic-panes.js');
    assert.match(panes, /const mine = own\.n !== ownSeen && LOCAL_TABS\.includes\(own\.id\);/);
    assert.match(panes, /if \(atEnd \|\| mine\) lowerLog\.scrollTop = lowerLog\.scrollHeight;/);
  });
});
