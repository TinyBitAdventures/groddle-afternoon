// Austin 2026-11-12: "opening the bug report shifts the popups, which makes it hard to report an
// issue spotted on a modal popup." The Reports window is a [role=dialog]; js/notify-view.js took it
// for a conversation card, so the interaction menus (the Enter chooser, the verb menu, the item
// pickers) stepped aside from it (keepMenusClear) and the notices moved down under it. It now
// opens over them and nothing moves: its picture shows them where they were.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { isZoneDialog } from '../public/js/notify-view.js?v=f40de936';
import { REPORT_WINDOW_SELECTOR } from '../public/js/window-stack.js?v=a7104f02';
import { REPORT_LEAVE_OUT } from '../public/js/features/bug-report-feature.js?v=35a740cc';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

/** An element-like: its id, classes and the ancestors `closest` finds (selectors it sits in). */
function fake(id, { classes = [], inside = [] } = {}) {
  const own = new Set(classes);
  return {
    id,
    classList: { contains: (c) => own.has(c) },
    closest: (sel) => (sel === `#${id}` || inside.includes(sel) ? {} : null),
  };
}

describe('the report window moves nothing under it', () => {
  it('is not a zone: menus do not step aside from it, notices do not move down for it', () => {
    assert.equal(REPORT_WINDOW_SELECTOR, '#bug-report-panel');
    assert.equal(isZoneDialog(fake('bug-report-panel', { classes: ['reports-panel', 'ui-sheet', 'ui-sheet-center'] })), false);
    // Its picture lightbox lives inside it (js/ui/picture-lightbox.js host).
    assert.equal(isZoneDialog(fake('', { inside: ['#bug-report-panel'] })), false);
  });

  it('a feature\'s conversation card still is one', () => {
    assert.equal(isZoneDialog(fake('crab-talk')), true);
    assert.equal(isZoneDialog(fake('quest-dialogue')), true);
  });

  it('keeps what was never a zone', () => {
    assert.equal(isZoneDialog(fake('activity-log')), false);
    assert.equal(isZoneDialog(fake('enter-chooser', { classes: ['verb-menu', 'feed-picker', 'enter-chooser'] })), false);
    assert.equal(isZoneDialog(fake('verb-menu', { classes: ['verb-menu'] })), false);
    assert.equal(isZoneDialog(fake('x', { classes: ['glitch-modal'] })), false);
    assert.equal(isZoneDialog(fake('', { inside: ['#pack-bar'] })), false);
    for (const id of ['award-screen', 'new-day-screen', 'giant-screen-panel', 'overlay']) assert.equal(isZoneDialog(fake(id)), false, id);
    assert.equal(isZoneDialog(null), false);
  });

  it('notify-view measures zones through isZoneDialog only', () => {
    const view = read('public/js/notify-view.js');
    const at = view.indexOf('function measure(');
    const body = view.slice(at, view.indexOf('\n  }\n', at));
    assert.match(body, /for \(const d of root\.querySelectorAll\('\[role="dialog"\]'\)\) \{[\s\S]*?if \(!isZoneDialog\(d\)\) continue;/);
    assert.match(body, /blockers\.push\(\.\.\.keepMenusClear\(root, dialogs, rr\)\);/);
  });

  it('the picture still leaves the report window out', () => {
    assert.ok(REPORT_LEAVE_OUT.includes('bug-report-panel'));
    assert.ok(REPORT_LEAVE_OUT.includes('bug-btn-lift'));
  });
});
