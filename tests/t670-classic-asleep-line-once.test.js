/**
 * #670 review (2026-11-26): the Classic interface printed "This window was asleep. Play here?" twice
 * in its Local Chat / Activity pane. realtime-feature.js says the asleep state as a note on Local
 * (addLog) and as a notice (engine.toast), which the notifier also logs in Activity; the Classic pane
 * is Local's lines and the Activity log together (social-drawer.js logNodes), so the one event showed
 * twice. Glitch's client printed it once. Now a Local note and an Activity notice with the same words
 * within SAID_TWICE_MS are one line in the merged pane (the "replaced" and "other character" lines too).
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { ASLEEP_TEXT } from '../public/js/features/realtime-feature.js?v=d6f4ef39';
import { mountSocialDrawer } from '../public/js/ui/social-drawer.js?v=a45b925c';
import { createNotifier } from '../public/js/notify.js?v=c9d79ec5';
import { memoryStore, page as fakePage } from './social-fake-dom.js';

describe('#670: the Classic Local Chat / Activity pane says the asleep line once', () => {
  const saved = {};
  let drawer;
  let notifier;
  before(() => {
    for (const k of ['document', 'addEventListener', 'CSS', 'requestAnimationFrame', 'groddleSocial', 'groddleBuddies', 'groddleRealtime']) saved[k] = globalThis[k];
    const t = fakePage();
    globalThis.document = t.doc;
    globalThis.addEventListener = () => {};
    globalThis.CSS = { escape: (s) => s };
    globalThis.requestAnimationFrame = (fn) => fn();
    notifier = createNotifier({ onChange: () => drawer?.update() });
    drawer = mountSocialDrawer({ root: t.game, dock: t.dock, notifier, mode: 'online', storage: memoryStore(), width: () => 1920, streetName: () => 'Hechey Track', playerMenu: () => true });
  });
  after(() => {
    for (const [k, v] of Object.entries(saved)) globalThis[k] = v;
  });

  it('the Local note and its toast are one line', () => {
    // realtime-feature.js on 'asleep': addLog (a note on Local), then engine.toast (a notice, logged in Activity).
    drawer.push('local', { note: true, text: ASLEEP_TEXT.note });
    notifier.notice(ASLEEP_TEXT.note, { ms: 5200 });
    const said = drawer.logNodes(['local', 'activity'], { cache: 'classic-lower' }).filter((n) => String(n.textContent).includes(ASLEEP_TEXT.note));
    assert.equal(said.length, 1, 'the asleep line shows once');
    // Activity on its own (the Modern drawer's tab) still has it.
    assert.equal(drawer.logNodes(['activity'], { cache: 'act' }).filter((n) => String(n.textContent).includes(ASLEEP_TEXT.note)).length, 1);
  });

  it('the same words later are a new event and show again', () => {
    const at = Date.now() + 60_000;
    drawer.push('local', { note: true, text: 'Petted a Piggy.', at });
    notifier.notice('Petted a Piggy.');
    assert.equal(drawer.logNodes(['local', 'activity'], { cache: 'later' }).filter((n) => String(n.textContent).includes('Petted a Piggy.')).length, 2);
  });
});
