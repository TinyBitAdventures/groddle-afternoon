/**
 * R26 (#506, G1024): the one online request helper (js/online-request.js). The wait starts when the
 * request goes out (after its save), is the server's worst case (hello's wait, else a fallback tied
 * to the server's ledger.go here), and a late answer still finds its request. And no online feature
 * keeps a request wait of its own: a new one fails the scan below.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import {
  ACT_ANSWER_MARGIN_MS,
  ACT_LEDGER_CHAIN,
  ANSWER_WAIT_FALLBACK_MS,
  ANSWER_WAIT_MAX_MS,
  DROP_SHIFT_CALL,
  LATE_KEEP_MS,
  LEDGER_CALL,
  SAVE_FIRST_MS,
  answerWaitMs,
  createOnlineRequests,
  ledgerCallWorstMs,
  shiftAnswerWaitMs,
} from '../public/js/online-request.js?v=5fa7a635';
import { serverPath, skipWithoutServer } from '../tools/repos.mjs';

const root = join(import.meta.dirname, '..');

function clock() {
  let t = 1_000_000;
  const timers = [];
  return {
    now: () => t,
    advance(ms) {
      t += ms;
      for (const x of timers.filter((x) => !x.done && x.at <= t)) {
        x.done = true;
        x.fn();
      }
    },
    later: (fn, ms) => {
      const x = { fn, at: t + ms, done: false };
      timers.push(x);
      return x;
    },
    cancel: (x) => {
      if (x) x.done = true;
    },
  };
}

const flush = () => new Promise((r) => setImmediate(r));

describe('R26 online requests: the wait follows the server', () => {
  it('the fallback is ledger.go\'s worst case: two calls of three 5 s tries and their pauses, plus the margin', () => {
    assert.equal(ledgerCallWorstMs(), 16_200);
    assert.equal(ANSWER_WAIT_FALLBACK_MS, 34_400);
  });

  it('ties the fallback to the server\'s own numbers (ledger.go)', { skip: skipWithoutServer }, () => {
    const go = readFileSync(serverPath('ledger.go'), 'utf8');
    const num = (re) => {
      const m = re.exec(go);
      assert.ok(m, `ledger.go no longer has ${re}`);
      return Number(m[1]);
    };
    assert.equal(num(/ledgerTimeout\s*=\s*(\d+)\s*\*\s*time\.Second/) * 1000, LEDGER_CALL.timeoutMs);
    assert.equal(num(/ledgerTries\s*=\s*(\d+)/), LEDGER_CALL.tries);
    assert.equal(num(/ledgerPauseStep\s*=\s*(\d+)\s*\*\s*time\.Millisecond/), LEDGER_CALL.pauseStepMs);
    assert.equal(num(/actLedgerChain\s*=\s*(\d+)/), ACT_LEDGER_CHAIN);
    assert.equal(num(/actAnswerMargin\s*=\s*(\d+)\s*\*\s*time\.Second/) * 1000, ACT_ANSWER_MARGIN_MS);
    assert.match(readFileSync(serverPath('hub.go'), 'utf8'), /"wait":\s*actAnswerWait\(\)\.Milliseconds\(\)/, 'hello says the wait');
  });

  it('G1327: an un-expand\'s shift waits drops_shift.go\'s worst case: 10 s for drops to land, 21 site calls, 20 pauses', () => {
    assert.equal(shiftAnswerWaitMs(), 10_000 + 21 * 16_200 + 20 * 15_000 + 2000);
  });

  it('ties the shift\'s wait to the server\'s own numbers (drops_shift.go, drops.go)', { skip: skipWithoutServer }, () => {
    const shift = readFileSync(serverPath('drops_shift.go'), 'utf8');
    const drops = readFileSync(serverPath('drops.go'), 'utf8');
    const num = (go, re) => {
      const m = re.exec(go);
      assert.ok(m, `the server no longer has ${re}`);
      return Number(m[1]);
    };
    assert.equal(num(shift, /shiftWait\s*=\s*(\d+)\s*\*\s*time\.Millisecond/), DROP_SHIFT_CALL.stillStepMs);
    assert.equal(num(shift, /shiftWaits\s*=\s*(\d+)/), DROP_SHIFT_CALL.stillSteps);
    assert.equal(num(shift, /shiftRetries\s*=\s*(\d+)/), DROP_SHIFT_CALL.retries);
    assert.equal(num(drops, /dropLoadRetry\s*=\s*(\d+)\s*\*\s*time\.Second/) * 1000, DROP_SHIFT_CALL.retryMs);
    assert.match(shift, /a := site\.dropShift\(call\)/, 'one site call per try (dropAsk: ledgerTries)');
  });

  it('takes hello\'s wait when the server says, within bounds', () => {
    assert.equal(answerWaitMs(null), ANSWER_WAIT_FALLBACK_MS);
    assert.equal(answerWaitMs({ answerWaitMs: 0 }), ANSWER_WAIT_FALLBACK_MS, 'an older server says nothing');
    assert.equal(answerWaitMs({ answerWaitMs: 40_000 }), 40_000);
    assert.equal(answerWaitMs({ answerWaitMs: 10 ** 9 }), ANSWER_WAIT_MAX_MS);
  });

  it('starts the clock when the request goes out, after a slow save', async () => {
    const c = clock();
    const reqs = createOnlineRequests({ now: c.now, later: c.later, cancel: c.cancel, waitMs: () => 10_000 });
    const sent = [];
    let saved;
    reqs.open(1, { id: 'plot' });
    const out = reqs.send(1, () => sent.push(1), { save: () => new Promise((r) => { saved = r; }) });
    c.advance(15_000); // the save is slow, under its own bound
    assert.deepEqual(reqs.expire(), [], 'nothing expires before it is sent');
    assert.equal(sent.length, 0);
    await flush();
    saved(true);
    assert.equal(await out, 'sent');
    assert.deepEqual(sent, [1]);
    c.advance(9_999);
    assert.deepEqual(reqs.expire(), []);
    c.advance(1);
    const late = reqs.expire();
    assert.equal(late.length, 1);
    assert.equal(reqs.size, 0, 'a late request no longer blocks a retry');
    assert.equal(reqs.take(1)?.late, true, 'but its answer still finds it');
  });

  it('a save that fails or runs out sends nothing and says so', async () => {
    const c = clock();
    const reqs = createOnlineRequests({ now: c.now, later: c.later, cancel: c.cancel });
    const sent = [];
    const heard = [];
    reqs.open(1, {});
    assert.equal(await reqs.send(1, () => sent.push(1), { save: async () => false, done: (o) => heard.push(o) }), 'save-failed');
    reqs.open(2, {});
    const slow = reqs.send(2, () => sent.push(2), { save: () => new Promise(() => {}), done: (o) => heard.push(o) });
    await flush();
    c.advance(SAVE_FIRST_MS);
    assert.equal(await slow, 'save-failed');
    assert.deepEqual(sent, []);
    assert.deepEqual(heard, ['save-failed', 'save-failed']);
    assert.equal(reqs.has(1) || reqs.has(2), false);
  });

  it('a socket that cannot take it is unsent at once; a left street keeps the record for its answer', () => {
    const c = clock();
    const reqs = createOnlineRequests({ now: c.now });
    reqs.open(1, {});
    let heard = '';
    assert.equal(reqs.send(1, () => false, { done: (o) => { heard = o; } }), 'unsent');
    assert.equal(heard, 'unsent');
    reqs.open(2, { id: 'x' });
    reqs.send(2, () => true);
    reqs.leave();
    assert.equal(reqs.size, 0);
    assert.equal(reqs.take(2)?.gone, true);
  });

  it('lets a late request go only long after', () => {
    const c = clock();
    const reqs = createOnlineRequests({ now: c.now, waitMs: () => 1000 });
    reqs.open(1, {});
    reqs.send(1, () => true);
    c.advance(1000);
    assert.equal(reqs.expire().length, 1);
    c.advance(LATE_KEEP_MS - 1);
    reqs.expire();
    assert.ok(reqs.has(1));
    c.advance(1);
    reqs.expire();
    assert.equal(reqs.has(1), false);
  });
});

/**
 * Request waits not on the helper yet (R26 siblings, each its own shape): the list may only shrink.
 * Move one onto js/online-request.js and take it off.
 */
const NOT_YET_MOVED = Object.freeze([
  'public/js/feat-owed.js OWED_ANSWER_MS',
  'public/js/features/bags-feature.js TAKE_WAIT_MS',
  'public/js/features/boards-mp-feature.js WAIT_MS',
  'public/js/features/door-keys-feature.js PICK_WAIT_MS',
  'public/js/features/drops-mp-feature.js WAIT_MS',
  'public/js/features/home-crew-mp-feature.js LAND_WAIT_MS',
  'public/js/features/home-machines-feature.js ASK_MS',
  'public/js/features/meditation-feature.js START_WAIT_MS',
  'public/js/features/street-jobs-feature.js GIVE_WAIT_MS',
  'public/js/features/street-jobs-feature.js WORK_WAIT_MS',
  'public/js/features/yard-verbs-mp-feature.js ASK_MS',
  'public/js/peat-quest.js PEAT_ANSWER_GRACE_MS',
  'public/js/shared-quoins.js CLAIM_WAIT_MS',
  'public/js/subway-mp.js BOARD_ANSWER_MS',
]);

/** Waits with the same kind of name that are not a request to the realtime server. */
const NOT_A_REQUEST = Object.freeze([
  'public/game.js VECTOR_BAKE_ASKED_MS',
  'public/js/avatar-anims.js AFK_TIMEOUT_MS',
  'public/js/avatar-anims.js RANDOM_IDLE_WAIT_MS',
  'public/js/avatar-placeholder.js OWN_LOOK_WAIT_MS',
  'public/js/bureaucratic-hall.js PLEASE_WAIT_MS',
  'public/js/crabs.js CRAB_OFFER_TIMEOUT_MS',
  'public/js/crabs.js CRAB_REPLY_MS',
  'public/js/extension-marks.js BAIT_WAIT_MS',
  'public/js/familiar.js ROCK_SHEET_WAIT_MS',
  'public/js/features/animal-mood-feature.js ROOT_TREE_WAIT_MS',
  'public/js/features/bug-report-feature.js FONT_WAIT_MS',
  // G1312: out of a hall, how long the lot street waits for the hall's lot to be drawn before you stay
  // where you landed (street-jobs draws it from the rows it already holds); it sends no request.
  'public/js/features/group-hall-street-feature.js LOT_WAIT_MS',
  'public/js/features/home-live-feature.js FIRST_WAIT_MS',
  'public/js/features/musicblocks-feature.js LAND_WAIT_MS',
  'public/js/hell.js HELL_ENTRY_PROMPT_TIMEOUT_MS',
  // G1284: the whole-house picture waits for its textures to load, not for a server.
  'public/js/home-shot-render.js HOME_SHOT_WAIT_MS',
  'public/js/home-live.js HOME_LIVE_WAIT_MS',
  'public/js/machine-rooms.js MACHINE_EXTRA_WAIT_MS',
  'public/js/making.js MACHINE_EXTRA_WAIT_MS',
  'public/js/online-boot.js HANDOFF_WAIT_MS',
  'public/js/online-request.js ACT_ANSWER_MARGIN_MS',
  'public/js/online-request.js ANSWER_WAIT_MAX_MS',
  'public/js/online-request.js ANSWER_WAIT_MIN_MS',
  // #676: the socket's own liveness check (a ping's answer), not a request's.
  'public/js/realtime-client.js PROBE_TIMEOUT_MS',
  'public/js/street-move.js MAX_QUEUE_WAIT_MS',
  'public/js/test-tube.js EXPERIMENT_WAIT_MS',
  'public/js/ui/reports-sheet.js PICTURE_WAIT_MS',
  'public/js/winter-walk.js WINTER_WALK_OFFER_WAIT_MS',
  'public/js/world-text.js WORLD_FONT_WAIT_MS',
]);

function sources() {
  const walk = (d) => readdirSync(d).flatMap((n) => {
    const p = join(d, n);
    if (statSync(p).isDirectory()) return n === 'vendor' ? [] : walk(p);
    return p.endsWith('.js') ? [p] : [];
  });
  return [...walk(join(root, 'public/js')), join(root, 'public/game.js')];
}

const WAIT_NAME = /^\s*(?:export\s+)?const\s+([A-Z][A-Z0-9_]*(?:TIMEOUT|ANSWER|ASK|WAIT|REPLY)[A-Z0-9_]*_MS|(?:ASK|WAIT|TIMEOUT)_MS)\s*=\s*[\d_]/;

describe('R26: no online feature keeps a request wait of its own', () => {
  const found = [];
  for (const f of sources()) {
    const rel = relative(root, f);
    readFileSync(f, 'utf8').split('\n').forEach((line) => {
      const m = WAIT_NAME.exec(line);
      if (m) found.push(`${rel} ${m[1]}`);
    });
  }

  it('finds no new request wait (put the request on js/online-request.js)', () => {
    const known = new Set([...NOT_YET_MOVED, ...NOT_A_REQUEST]);
    assert.deepEqual(found.filter((k) => !known.has(k)), []);
  });

  it('the lists name only waits still in the code', () => {
    const now = new Set(found);
    assert.deepEqual([...NOT_YET_MOVED, ...NOT_A_REQUEST].filter((k) => !now.has(k)), []);
  });

  it('gardens, Patches and street objects ask through the helper', () => {
    for (const f of ['shared-gardens-feature.js', 'shared-patches-feature.js', 'street-objects-feature.js']) {
      const src = readFileSync(join(root, 'public/js/features', f), 'utf8');
      assert.match(src, /createOnlineRequests\(\{ waitMs: \(\) => answerWaitMs\(client\)(?:, probe: \(\) => client\?\.probe\?\.\(\))? \}\)/, f);
      assert.doesNotMatch(src, /REQUEST_TIMEOUT|new Map\(\);\s*\n\s*let grant/, f);
    }
    assert.doesNotMatch(readFileSync(join(root, 'public/js/street-objects.js'), 'utf8'), /REQUEST_TIMEOUT_MS/);
  });
});
