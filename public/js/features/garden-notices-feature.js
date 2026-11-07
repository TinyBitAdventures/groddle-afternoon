/**
 * The home garden's prompts to its owner (js/garden-notices.js, register G405). Every second it
 * looks at the owner's gardens on the home street and in the back yard, wherever the owner is.
 * A garden drawn here grows through game.js tickAllGardens; one not drawn (the owner is on another
 * street, or in the house) is grown here, as the source's events ran with nobody there.
 * The first look at a garden only remembers it, so loading never brings a prompt about the time
 * away. A visit shows the other player's copy, never these: they are the owner's alone.
 *
 * QA: canvas data gardenNotice (the last line shown), gardenNoticeCount.
 * &gardennoticeqa=1: window.groddleGardenNotices lists the gardens (gardens) and forgets the
 * 10 minutes (clear).
 */

import { tickGarden } from '../garden.js?v=78aa3457';
import { GARDEN_NOTICE_TIMEOUT, gardenNoticeLines, noticeAllowed, plotMarks } from '../garden-notices.js?v=dc26dd82';
import { homesFeature } from './homes-feature.js?v=a31171ac';

export const GARDEN_NOTICES_FEATURE_ID = 'garden-notices';
const LOOK_MS = 1000;

let lastLook = 0;
let shown = 0;
const seen = new WeakMap();

function ownGardens() {
  const st = homesFeature._state?.();
  return [...Object.values(st?.cult?.gardens || {}), ...Object.values(st?.backCult?.gardens || {})];
}

export const gardenNoticesFeature = {
  id: GARDEN_NOTICES_FEATURE_ID,

  onTick(dtMs, now, engine) {
    if (!engine.started || now - lastLook < LOOK_MS) return;
    lastLook = now;
    const drawn = new Set();
    for (const t of engine.interactables || []) if (t.classId === 'garden_new' && t.state?.garden) drawn.add(t.state.garden);
    const at = Date.now();
    for (const garden of ownGardens()) {
      if (!drawn.has(garden)) tickGarden(garden, at);
      const after = plotMarks(garden);
      const before = seen.get(garden);
      seen.set(garden, after);
      if (!before) continue;
      const lines = gardenNoticeLines(before, after);
      if (!lines.length || !noticeAllowed(garden, at)) continue;
      garden.lastNoticeAt = at;
      shown += 1;
      engine.prompt?.({ text: lines[0], timeout: GARDEN_NOTICE_TIMEOUT, choices: [{ value: 'ok', label: 'ok' }] });
      engine.setData?.('gardenNotice', lines[0]);
      engine.setData?.('gardenNoticeCount', shown);
      engine.save?.();
    }
    if (engine.param?.('gardennoticeqa') && !globalThis.groddleGardenNotices) {
      globalThis.groddleGardenNotices = {
        gardens: () => ownGardens(),
        clear: () => ownGardens().forEach((g) => { delete g.lastNoticeAt; }),
        look: () => { lastLook = 0; },
      };
    }
  },
};
