/**
 * G1198: Activity (pickups, gains, notices: js/notify.js) has a tab of its own in the online Social
 * drawer, and its lines stay there: Local and Global show only what was said in them. The Classic
 * layout's bottom pane shows Local and Activity together, as Glitch's "Local Chat / Activity"
 * pane did (classic-panes.js, drawer.logNodes); the Modern drawer keeps them apart.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mountSocialDrawer } from '../public/js/ui/social-drawer.js?v=25697b7e';
import { createNotifier } from '../public/js/notify.js?v=c9d79ec5';
import { memoryStore, page } from './social-fake-dom.js';

describe('G1198: Activity lines stay in the Activity tab online', () => {
  const saved = {};
  let t;
  let drawer;
  let notifier;
  const logText = () => t.dock.querySelector('[data-social-log]').textContent;

  before(() => {
    for (const k of ['document', 'addEventListener', 'CSS', 'requestAnimationFrame', 'groddleSocial', 'groddleBuddies', 'groddleRealtime']) saved[k] = globalThis[k];
    t = page();
    globalThis.document = t.doc;
    globalThis.addEventListener = () => {};
    globalThis.CSS = { escape: (s) => s };
    globalThis.requestAnimationFrame = (fn) => fn();
    notifier = createNotifier({ onChange: () => drawer?.update() });
    drawer = mountSocialDrawer({ root: t.game, dock: t.dock, notifier, mode: 'online', storage: memoryStore(), width: () => 1920, streetName: () => 'Hechey Track' });
  });
  after(() => {
    for (const [k, v] of Object.entries(saved)) globalThis[k] = v;
  });

  it('a pickup shows in Activity and not in Local or Global', () => {
    drawer.setOpen?.(true);
    drawer.push('local', { name: 'Ada', text: 'hello street', mine: true, at: Date.now() });
    notifier.gain('You harvested a Fruit Tree.', { tokens: [{ n: 3, unit: 'Cherry' }] });
    notifier.activity('Your Gardening Tools wore out.');
    assert.ok(notifier.entries.length >= 2, 'the notifier logged them');
    assert.deepEqual(drawer.tabs.slice(0, 3), ['activity', 'local', 'global'], 'Activity is a tab of its own');
    drawer.select('activity');
    assert.match(logText(), /harvested a Fruit Tree/);
    assert.match(logText(), /Gardening Tools wore out/);
    drawer.select('local');
    assert.match(logText(), /hello street/);
    assert.doesNotMatch(logText(), /harvested|wore out/);
    assert.equal(drawer.lines('local').length, 1);
    assert.equal(drawer.lines('global').length, 0);
  });
});
