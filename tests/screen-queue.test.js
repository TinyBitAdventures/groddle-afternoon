/**
 * The screen queue's gates (G364, js/screen-queue.js), against glitch-client:
 *   control/TSFrontController.as 3344-3356 addToScreenViewQ, 3358-3436
 *     tryShowScreenViewFromQ (the gates and their order), 3335-3342
 *     screenViewClosed (next try 500 ms later), 2081-2160
 *     startFamiliarConversationWithPayload (familiar talk waits for an open screen)
 *   model/StateModel.as 115 screen_view_retry_timer (1000 ms)
 *   control/engine/NCMsgHandler.as 1017-1048, 2651-2655, 2764-2768 (requires_client_focus)
 *   view/gameoverlay/NewDayView.as 47-56, 162, 216-265 (the day's bubble)
 *   view/avatar/AvaChatBubbleManager.as 18-20, 51 (how long a bubble stays)
 *   view/gameoverlay/GiantView.as 128, BaseScreenView.as 224-226 (no Space)
 * Run: node --test tests/screen-queue.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SLUG_STYLES, speechSlugList } from '../public/js/speech-slugs.js?v=g412-1';
import {
  NEW_DAY_MESSAGES,
  SCREEN_CLOSED_RETRY_MS,
  SCREEN_GATES,
  SCREEN_RETRY_MS,
  chatBubbleShowMs,
  newDayBubble,
  screenQueueHold,
  shuffleNewDayMessages,
  waitForScreenGates,
} from '../public/js/screen-queue.js?v=g459-1';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(root, 'public');
const ENGINE = join(root, '..', 'glitch-client', 'com', 'tinyspeck', 'engine');
const HAVE_CLIENT = existsSync(ENGINE);
const read = (p) => readFileSync(join(PUBLIC, p), 'utf8');
const client = (p) => readFileSync(join(ENGINE, p), 'utf8');
const lines = (text) => text.split('\n');

/** Fake clock: timers run when advanced. */
function clock() {
  let t = 0;
  let timers = [];
  return {
    now: () => t,
    setTimer: (fn, ms) => timers.push({ at: t + ms, fn }),
    pending: () => timers.length,
    async advance(ms) {
      const end = t + ms;
      for (;;) {
        timers.sort((a, b) => a.at - b.at);
        const next = timers[0];
        if (!next || next.at > end) break;
        timers.shift();
        t = next.at;
        next.fn();
        await Promise.resolve();
      }
      t = end;
      await Promise.resolve();
    },
  };
}

describe('the gates (TSFrontController.as tryShowScreenViewFromQ)', () => {
  it('names each gate at its client line, in the client order', { skip: !HAVE_CLIENT && 'glitch-client not present' }, () => {
    const src = lines(client('control/TSFrontController.as'));
    const needles = {
      cult_mode: 'model.stateModel.cult_mode)',
      decorator_mode: 'model.stateModel.decorator_mode)',
      '!flash_has_focus': '!StageBeacon.flash_has_focus && vo && vo.requires_client_focus',
      CameraMan: 'isCompInFocusHistory(CameraMan.instance)) {',
      InteractionMenu: 'isCompInFocusHistory(InteractionMenu.instance)) {',
      GetInfoDialog: 'isCompInFocusHistory(GetInfoDialog.instance)) {',
      ChoicesDialog: 'isCompInFocusHistory(ChoicesDialog.instance)) {',
      screen_view_open: '} else if (model.stateModel.screen_view_open) {',
      ImgMenuView: '} else if (ImgMenuView.instance.parent) {',
      fam_dialog_open: '} else if (model.stateModel.fam_dialog_open) {',
      moving: '} else if (model.moveModel.moving) {',
    };
    let last = 0;
    for (const [, line, why] of SCREEN_GATES) {
      assert.ok(src[line - 1].includes(needles[why]), `${why} at TSFrontController.as ${line}: ${src[line - 1].trim()}`);
      assert.ok(line > last, `${why} after the gate before it`);
      last = line;
    }
    // Camera control mode is the queue's last gate; Camera Mode stands for both here.
    assert.match(src[3397], /in_camera_control_mode\) \{/);
    assert.match(src[3411], /screen_view_retry_timer\.running\) model\.stateModel\.screen_view_retry_timer\.start\(\)/);
  });

  it('retries every second, and 500 ms after a screen closes', { skip: !HAVE_CLIENT && 'glitch-client not present' }, () => {
    assert.equal(SCREEN_RETRY_MS, 1000);
    assert.equal(SCREEN_CLOSED_RETRY_MS, 500);
    assert.match(lines(client('model/StateModel.as'))[114], /screen_view_retry_timer:Timer = new Timer\(1000\)/);
    const fc = lines(client('control/TSFrontController.as'));
    assert.match(fc[3335], /screen_view_open = false;/);
    assert.match(fc[3340], /StageBeacon\.setTimeout\(tryShowScreenViewFromQ, 500\);/);
  });

  it('only award-type screens wait for focus; the new day does not', { skip: !HAVE_CLIENT && 'glitch-client not present' }, () => {
    const nc = client('control/engine/NCMsgHandler.as');
    for (const view of ['AchievementView', 'GiantView', 'LevelUpView', 'CollectionCompleteView']) {
      assert.match(nc, new RegExp(`${view}\\.instance\\.show,\\s*im\\.payload,\\s*true`), view);
    }
    assert.match(nc, /NewDayView\.instance\.show,\s*im\.payload,\s*false/);
    const state = { unfocused: true };
    assert.equal(screenQueueHold(state), '!flash_has_focus');
    assert.equal(screenQueueHold(state, { requiresFocus: false }), '');
  });

  it('reports the first gate that holds', () => {
    assert.equal(screenQueueHold({}), '');
    assert.equal(screenQueueHold({ moving: true, choicesDialog: true }), 'ChoicesDialog');
    assert.equal(screenQueueHold({ decorating: true, cameraMode: true }), 'decorator_mode');
    assert.equal(screenQueueHold({ familiarDialog: true }), 'fam_dialog_open');
  });

  it('waits while a gate holds, looking again each second', async () => {
    const c = clock();
    const state = { choicesDialog: true };
    const seen = [];
    let done = false;
    waitForScreenGates(() => state, { now: c.now, setTimer: c.setTimer, onHold: (w) => seen.push(w) }).then(() => { done = true; });
    await Promise.resolve();
    assert.deepEqual(seen, ['ChoicesDialog'], 'tried at once (addToScreenViewQ 3355)');
    await c.advance(999);
    assert.equal(done, false);
    assert.equal(seen.length, 1);
    await c.advance(1);
    assert.equal(seen.length, 2);
    state.choicesDialog = false;
    state.decorating = true;
    await c.advance(1000);
    assert.equal(seen.at(-1), 'decorator_mode');
    state.decorating = false;
    await c.advance(1000);
    await Promise.resolve();
    assert.equal(done, true);
    assert.equal(seen.at(-1), '');
  });

  it('starts 500 ms after the last screen closed', async () => {
    const c = clock();
    await c.advance(10_000);
    let done = false;
    waitForScreenGates(() => ({}), { now: c.now, setTimer: c.setTimer, closedAt: 9_800 }).then(() => { done = true; });
    await Promise.resolve();
    assert.equal(done, false);
    await c.advance(299);
    assert.equal(done, false);
    await c.advance(1);
    await Promise.resolve();
    assert.equal(done, true);
  });
});

describe('game.js wires the gates', () => {
  const game = read('game.js');
  const fn = (name) => {
    const start = game.indexOf(`function ${name}(`);
    assert.ok(start >= 0, name);
    return game.slice(start, game.indexOf('\n}\n', start));
  };

  it('every gate has a remake equivalent', () => {
    const body = fn('screenGateState');
    for (const [key] of SCREEN_GATES) assert.match(body, new RegExp(`\\n\\s*${key}:`), key);
    assert.match(body, /cultivating: editMode === 'cultivate',/);
    assert.match(body, /decorating: editMode === 'decorate',/);
    assert.match(body, /cameraMode: app\?\.canvas\?\.dataset\?\.cameraMode === '1',/);
    assert.match(body, /choicesDialog: isQuestDialogueOpen\(\),/);
    assert.match(body, /getInfo: isPackPopoverOpen\(\),/);
    assert.match(body, /imgMenu: elementShown\('imagination-panel'\),/);
    assert.match(body, /familiarDialog: elementShown\('familiar-dialog'\),/);
    assert.match(body, /menuTarget && elementShown\('verb-menu'\)/);
    assert.match(body, /enterChooser\?\.isOpen\(\)/);
    assert.match(body, /streetCardUp\(\)/);
  });

  it('the award, new-day and Giant screens share one queue; queued screens still hold offers', () => {
    assert.match(fn('enqueueAward'), /return queueScreen\(async \(\) => \{/);
    const q = fn('queueScreen');
    assert.match(q, /awardsPending \+= 1;/);
    assert.match(q, /waitForScreenGates\(screenGateState, \{ requiresFocus, closedAt: screenClosedAt, onHold: noteScreenHold \}\)/);
    assert.match(q, /screenClosedAt = performance\.now\(\);/);
    assert.match(game, /function isAwardScreenUp\(\) \{\s*if \(awardsPending > 0\) return true;/);
    assert.match(fn('maybeNewDay'), /await queueScreen\(async \(\) => \{\n\s*playSfx\('newDay', \{ volume: 0\.75 \}\);\n\s*await showNewDayScreen\(el\);\n\s*\}, \{ requiresFocus: false \}\);\n\s*showNewDayBubble\(refill\);/);
    assert.match(game, /queueScreen: \(show, opts\) => queueScreen\(show, opts\),/);
    // The screen modules load under one key each.
    assert.match(game, /from '\.\/js\/screen-queue\.js\?v=g459-1';/);
  });

  it('no deadlock with quest offers: an open offer holds screens, queued screens hold the next offer only', { skip: !HAVE_CLIENT && 'glitch-client not present' }, () => {
    // The client: screens wait for an open conversation (3388) or familiar dialog (3394);
    // familiar talk (quest offers) waits only for a screen that is open (2134), not one queued.
    const fc = lines(client('control/TSFrontController.as'));
    assert.match(fc[2080], /startFamiliarConversationWithPayload/);
    assert.match(fc[2133], /if \(sm\.screen_view_open\) \{/);
    // The remake's offers wait for queued screens too (G213), but never while one is open:
    // so an award waits for the open offer, and the offer engine never waits on itself.
    const qo = read('js/features/quest-offers-feature.js');
    assert.match(qo, /\} else if \(!offerOpen && engine\.screenFxScreenUp\?\.\(\) === true\) \{/);
    // The gates read only what is open on screen, never pending offers.
    assert.doesNotMatch(fn('screenGateState'), /awardsPending|waitingOffers|questOffer/);
  });
});

describe('the new day bubble (NewDayView.as showChatBubble)', () => {
  it('has the source messages, shuffled once and taken in turn', { skip: !HAVE_CLIENT && 'glitch-client not present' }, () => {
    const src = client('view/gameoverlay/NewDayView.as');
    const block = /MESSAGES:Array = new Array\(([\s\S]*?)\);/.exec(src)[1];
    const msgs = [...block.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1].replace(/\\'/g, "'"));
    assert.deepEqual([...NEW_DAY_MESSAGES], msgs);
    assert.match(src, /shuffled_msgs = SortTools\.shuffleArray\(MESSAGES\);/);
    assert.match(src, /current_msg_index = \(current_msg_index < shuffled_msgs\.length-1 \? current_msg_index\+1 : 0\);/);
    assert.match(src, /\/\/put a bubble above the avatar giving out some stats for the day\n\s*showChatBubble\(\);/);
    const order = shuffleNewDayMessages(() => 0.5);
    assert.deepEqual([...order].sort(), [...NEW_DAY_MESSAGES].sort());
    const game = read('game.js');
    assert.match(game, /newDayMessageIndex = newDayMessageIndex < newDayMessages\.length - 1 \? newDayMessageIndex \+ 1 : 0;/);
  });

  it('puts energy and mood above 0 in slugs, energy first, and stays as long as the client bubble', { skip: !HAVE_CLIENT && 'glitch-client not present' }, () => {
    const ava = client('view/avatar/AvaChatBubbleManager.as');
    assert.match(ava, /SHOW_TIME_PER_WORD_MS:uint = 300;/);
    assert.match(ava, /MIN_SHOW_TIME_MS:uint = 4000;/);
    assert.match(ava, /MAX_SHOW_TIME_MS:uint = 10000;/);
    const b = newDayBubble('<b>*deep sniff*</b> now that smells like progress!', { energy: 61.6, mood: 30 });
    assert.equal(b.text, '*deep sniff* now that smells like progress!');
    assert.deepEqual(Object.keys(b.slugs), ['energyGain', 'mood']);
    assert.deepEqual(b.slugs, { energyGain: 62, mood: 30 });
    assert.equal(b.durationMs, 4000 + 7 * 300, "the raw htmlText split on spaces");
    assert.equal(newDayBubble('Alright, refreshed!', { energy: 0, mood: 0 }).slugs, null);
    assert.equal(chatBubbleShowMs(Array(40).fill('w').join(' ')), 10_000);
    // GSJS player.js 917-920: stats_today is energy and mood.
    const gsjs = join(root, '..', 'glitch-GameServerJS', 'players', 'player.js');
    if (existsSync(gsjs)) assert.match(readFileSync(gsjs, 'utf8'), /"stats_today"\s*: \{\s*energy: energy,\s*mood: mood\s*\}/);
    const game = read('game.js');
    // Slug.as 50-51, 58: gains are energy/mood_pos_bg_color 0xc1d76e, an energy loss energy_neg_bg_color 0xefc6c1.
    const slug = client('view/ui/Slug.as');
    assert.match(slug, /energy_pos_bg_color:uint = 0xc1d76e;/);
    assert.match(slug, /mood_pos_bg_color:uint = 0xc1d76e;/);
    assert.match(slug, /energy_neg_bg_color:uint = 0xefc6c1;/);
    // js/speech-slugs.js draws them: the gain fill for +energy, energy before mood.
    assert.equal(SLUG_STYLES.energy.pos, 0xc1d76e);
    assert.equal(SLUG_STYLES.mood.pos, 0xc1d76e);
    assert.equal(SLUG_STYLES.energy.neg, 0xefc6c1);
    assert.deepEqual(speechSlugList(b.slugs), [{ type: 'energy', amount: 62 }, { type: 'mood', amount: 30 }]);
    assert.match(game, /const slugRow = speechSlugRow\(speech\.slugs/);
  });
});

describe('the Giant screen (GiantView.as)', () => {
  it('closes on a click anywhere, Enter or Escape, never Space, and waits in the queue', { skip: !HAVE_CLIENT && 'glitch-client not present' }, () => {
    const giant = client('view/gameoverlay/GiantView.as');
    assert.match(lines(giant)[127], /addEventListener\(MouseEvent\.CLICK, onOkClick/);
    assert.doesNotMatch(giant, /Keyboard\.SPACE|KEY_DOWN_/);
    const base = lines(client('view/gameoverlay/BaseScreenView.as'));
    assert.match(base[224], /KEY_DOWN_\+Keyboard\.ESCAPE, onOkClick/);
    assert.match(base[225], /KEY_DOWN_\+Keyboard\.ENTER, onOkClick/);
    assert.doesNotMatch(base.join('\n'), /Keyboard\.SPACE/);
    assert.match(client('control/engine/NCMsgHandler.as'), /do_GIANT_SCREEN[\s\S]{0,120}addToScreenViewQ/);
    const src = read('js/features/shrine-hint-feature.js');
    assert.doesNotMatch(src, /\['Enter', 'Escape', ' '\]/);
    assert.match(src, /const input = screenInput\(el, \{ button: el \}\);/);
    assert.match(src, /import \{ screenInput \} from '\.\.\/screen-fx\.js\?v=g434-1';/);
    assert.match(src, /engine\.queueScreen\(run\)/);
    assert.match(read('js/features/index.js'), /shrine-hint-feature\.js\?v=g449-1'/);
  });
});
