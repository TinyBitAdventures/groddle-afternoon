/**
 * Firefly Whistle (quests/firefly_whistle.js) in the Fireflex 3000 Lab.
 *
 * Source:
 *  - Offer: bumping into a Firefly while the quest is new shows "What ho! ..."
 *    then "... Fireflies!" and the familiar offers it (items/npc_firefly.js
 *    wandering_onMsg -> done_payload quest_name -> main.js quests_offer). The
 *    remake's Fireflies do this in features/resource-nodes-feature.js.
 *  - onStarted makes instance `firefly_whistle` from template LM113UBSS8P18ET
 *    (dev LHH11C4QUBP1DQD) at -2967, -283 with exit_delay 3 * 60 (the "Are you
 *    stuck?" prompt, not a clock: players/inc_instances.js, again 2 * 60 after
 *    "No thanks"), no_auto_return ("you must find your own way back") and five
 *    location options, all false: teleporter_button_activated, whistle_taken,
 *    whistle_enabled (never read), forcefield_button_activated,
 *    teleporter_activated.
 *  - The Precious Equipment Protection Unit (items/whistle_stand_button.js):
 *    walking into its 500 x 200 hit box the first time shows "There's the
 *    whistle!" (click on) then "It seems to be protected by some sort of force
 *    field." / "I wonder how you turn it off?" (3 s). Push: its two lines,
 *    [OK] then [Push It]; the stand goes to button_off and the whistle above
 *    it can be clicked (items/firefly_whistle.js starts not_selectable).
 *  - Taking the whistle deletes it, shows "Glakkk-k-k-krhkphrmg!" (1.5 s),
 *    plays WHISTLE_SWALLOWED and players/player.js fireflyWhistleSwallowed:
 *    hit1, hit2, hit1, hit2 a quarter second apart, then surprise and "Gah.
 *    I've swallowed it!" (4 s); 2 s later the firefly_whistling badge and
 *    "Oops, you swallowed the whistle! I guess that still counts?"; 2 s later
 *    the firefly_whistle_obtained flag, and the familiar turns the quest in
 *    (familiar_turnin) with its completion text and a Firefly Jar.
 *  - locations/location.js 'midpoint': while the stand is still on, you are
 *    walked 500 px back and told "Whoops! You may not proceed without the
 *    whistle." (after 1 s, for 3 s).
 *  - The Teleporter Control Unit (items/teleporter_button.js, hit box 200 x
 *    200): "This machine is not yet active." until the whistle is taken. Push
 *    asks TELEPORTER SECURITY V2000 "What is the activation code?"; FFW turns
 *    the beam on ("Code accepted. You may proceed."); a wrong code offers six
 *    escalating hints. location.js 'teleporter': once it is on, stepping on
 *    the pad sends you to the falling room (players/player.js
 *    goToFallingLevel, js/quest-rooms/falling-room.js), whose teleporter
 *    takes you back to where you came from; before that you are put 300 px
 *    to its left.
 *  - Leaving before the quest is done fails it (location.js onExit).
 *
 * One reading: teleporter_button.js's collision lines ("A teleporter. Aha!" /
 * "It is off. You need to turn it on.") test `whistle_taken &&
 * teleporter_button_activated` and then set the flag, so as written they can
 * never show, though the comment above them describes first-visit lines. The
 * live game played it as written: in video 2Z76dO4DlJ4 the player stands at
 * the control unit with the whistle swallowed for two seconds (t90-93) and
 * no lines appear, so the remake keeps them off (TELEPORTER_HINT_AS_COMMENTED).
 *
 * The lab's template is lost: js/quest-rooms/firefly-whistle-scene.js rebuilds
 * it from three player Snaps and video 2Z76dO4DlJ4 (reference only); the
 * arrival point and the teleporter's x and foot come from the code, the stand,
 * the midpoint and the control unit from the video (LAYOUT). Art: the recovered whistle_stand_button
 * (button_on, every third of its 48 frames, and button_off) and
 * teleporter_button sheets, and the firefly_whistle item exported from its
 * Tiny Speck SWF (glitch-items/quest_items/firefly_whistle) at 2x.
 */

import { advanceVpOverlay, vpOverlay, vpSequence } from './vp-overlay.js?v=ffw-1';
import { ENTRY, FLOOR, H, W, buildFront, buildLab, labPlatforms, sx, sy } from './firefly-whistle-scene.js?v=ffw-3';
import { onLoaded, textureFromUrl } from '../textures.js';
import { goToFallingLevel, withFallingRoom } from './falling-room.js?v=fall-2';

export const QUEST = 'firefly_whistle';
export const TEMPLATE = Object.freeze({ prod: 'LM113UBSS8P18ET', dev: 'LHH11C4QUBP1DQD' });
export const ARRIVAL = Object.freeze({ x: -2967, y: -283 });
export const EXIT_PROMPT_MS = 3 * 60 * 1000;
export const PROMPT_AGAIN_MS = 2 * 60 * 1000;
export const STUCK_TEXT = 'Are you stuck? Do you want to leave this place?';
export const LOCATION_OPTIONS = Object.freeze({
  teleporter_button_activated: false,
  whistle_taken: false,
  whistle_enabled: false,
  forcefield_button_activated: false,
  teleporter_activated: false,
});
export const ACTIVATION_CODE = 'FFW';
/** teleporter_button.js announce_location_overlay 'teleporter_beam' (centre_bottom). */
export const BEAM = Object.freeze({ x: 990, y: -130, w: 275, h: 530 });
export const STAND_HIT = Object.freeze({ w: 500, h: 200 });
export const CONTROL_HIT = Object.freeze({ w: 200, h: 200 });
export const MIDPOINT_PUSH = 500;
export const PAD_PUSH = 300;
/** players/player.js fireflyWhistleSwallowed: event delays (s) after the take. */
export const SWALLOW_STEPS = Object.freeze([0.25, 0.25, 0.25, 0.25, 2, 2]);
export const TELEPORTER_HINT_AS_COMMENTED = false;
/**
 * Source x of the pieces the code does not place, read off video 2Z76dO4DlJ4
 * at 2.21 world px per video px (see the scene's LAB): the stand just past
 * the egg pod and a pillar (t31-36); the midpoint just past the next pillar,
 * where the player is walked back to ~140 px short of the stand (t40.9-43);
 * the control unit beside the pad (t91-103, as Snap PIFISEG38S535GC_56214).
 */
export const LAYOUT = Object.freeze({ stand: -273, midpoint: 80, control: 818, pad: BEAM.x });

export const TEXT = Object.freeze({
  desc: 'Explore the lab and learn what you can about how to charm Fireflies.',
  standLabel: 'Precious Equipment Protection Unit (P.E.P.U.)',
  standTooltip: 'Push the button',
  standPushed: 'You already pushed it.',
  standIntro: 'I am protecting the Fireflex 3000 whistle, the pinnacle of firefly enchantment technology.  (Warning: choking hazard.)',
  standConfirm: 'Pushing this button will disable the force field and allow anyone to take the whistle. Are you sure to power off?',
  forcefieldA: "There's the whistle!",
  forcefieldB: ['It seems to be protected by some sort of force field.', 'I wonder how you turn it off?'],
  whistleLabel: 'Firefly Whistle',
  whistleDesc: "A Firefly Whistle, perfect for whistling at fireflies. I wonder if that's how it got its name.",
  whistleTooltip: 'Take the whistle',
  glakk: 'Glakkk-k-k-krhkphrmg!',
  swallowed: "Gah. I've swallowed it!",
  swallowActivity: 'Oops, you swallowed the whistle! I guess that still counts?',
  midpoint: 'Whoops! You may not proceed without the whistle.',
  controlLabel: 'Teleporter Control Unit',
  controlTooltip: 'Turn the teleporter on so you can get home',
  controlInactive: 'This machine is not yet active.',
  controlPushed: 'You already pushed it.',
  teleporterA: 'A teleporter. Aha!',
  teleporterB: 'It is off. You need to turn it on.',
  codeTitle: 'TELEPORTER SECURITY V2000',
  codeLabel: 'What is the activation code?',
  codeAccepted: 'Code accepted. You may proceed.',
  wrongFirst: "Er, sorry ... that's not it. Would you like a hint?",
  wrongAgain: "Yeah … no … that's also wrong. Would you like another hint?",
});

/** teleporter_button.js onConversation, one per "Yes" (the sixth repeats). */
export const HINTS = Object.freeze([
  'OK, you seem like an authorizedish person. The code is three letters long.',
  "Huh ... awkward. Um. The first letter is 'F' and it's an acronym.",
  "Not even sure why I'm even making you enter it at this point, but … think 'Fire Fly Whistle.",
  'The code is FFW.',
  'Type FFW in the box. C\'mon.',
  'Oy. This is boring. Type FFW so I can activate this thing!',
]);

export function hintFor(attempts) {
  const n = Math.max(1, Math.floor(Number(attempts) || 1));
  return HINTS[Math.min(n, HINTS.length) - 1];
}

/** onInputBoxResponse: utils.trim(value).toUpperCase() == 'FFW'. */
export function codeMatches(value) {
  return String(value ?? '').trim().toUpperCase() === ACTIVATION_CODE;
}

const ART = 'assets/sprites/quest-rooms/firefly_whistle/';
const STAND_FRAMES = { cols: 8, rows: 2, count: 16 };
/** The whistle's bottom-centre above the stand's foot (whistle_stand_button sheet: the gap under the dome). */
const WHISTLE_LIFT = 150;

const P = (x) => sx(x);

function hit(ctx, x, w, h) {
  const p = ctx.player;
  return Boolean(p) && Math.abs(p.x - x) <= w / 2 && p.y <= FLOOR + 20 && p.y >= FLOOR - h;
}

/* ------------------------------------------------------------------ */
/* Pieces                                                               */
/* ------------------------------------------------------------------ */

function addStand(ctx) {
  const { PIXI, kit } = ctx;
  const d = ctx.data;
  d.standOn = kit.sheetFrames(PIXI, `${ART}whistle_stand_on.webp`, STAND_FRAMES.cols, STAND_FRAMES.rows, STAND_FRAMES.count);
  const stand = new PIXI.AnimatedSprite([PIXI.Texture.EMPTY]);
  stand.anchor.set(0.5, 1);
  stand.animationSpeed = 0.25;
  stand.x = P(LAYOUT.stand);
  stand.y = FLOOR - 10; // Snap PIFISEG38S535GC_56237: its foot a little behind the avatar's
  const ready = () => {
    if (stand.destroyed || d.standPushed || !d.standOn.frames.length) return;
    stand.textures = d.standOn.frames;
    stand.play();
  };
  if (d.standOn.frames.length) ready();
  else onLoaded(d.standOn.base, () => setTimeout(ready, 0));
  d.stand = stand;
  ctx.add(stand, 30);
  d.standTarget = ctx.register({ classId: 'whistle_stand_button', label: TEXT.standLabel, subtitle: 'Guarding the whistle', sprite: stand });

  const whistle = new PIXI.Sprite(textureFromUrl(`${ART}firefly_whistle@2x.webp`));
  whistle.anchor.set(0.5, 0.5);
  whistle.x = stand.x;
  whistle.y = stand.y - WHISTLE_LIFT;
  whistle.baseY = whistle.y;
  whistle.rotation = -0.08;
  whistle._worldHitW = 64;
  whistle._worldHitH = 52;
  d.whistle = whistle;
  ctx.add(whistle, 29);
}

function addControl(ctx) {
  const { PIXI } = ctx;
  const d = ctx.data;
  const unit = new PIXI.Sprite(textureFromUrl(`${ART}teleporter_control.webp`));
  unit.anchor.set(0.5, 1);
  unit.x = P(LAYOUT.control);
  unit.y = FLOOR - 4; // just behind the walking line, so the avatar passes in front
  d.control = unit;
  ctx.add(unit, 26);
  d.controlTarget = ctx.register({ classId: 'teleporter_button', label: TEXT.controlLabel, subtitle: 'TELEPORTER SECURITY V2000', sprite: unit });

  const beam = new PIXI.Sprite(textureFromUrl('assets/decos/groddle/Teleporter_Beam.png'));
  beam.anchor.set(0.5, 1);
  beam.scale.set(BEAM.w / 550);
  beam.x = P(BEAM.x);
  beam.y = sy(BEAM.y);
  beam.alpha = 0;
  beam.visible = false;
  d.beam = beam;
  ctx.add(beam, 60);
}

function setStandOff(ctx) {
  const d = ctx.data;
  const stand = d.stand;
  if (!stand || stand.destroyed) return;
  stand.stop();
  stand.textures = [textureFromUrl(`${ART}whistle_stand_off.webp`)];
  stand.gotoAndStop(0);
  if (d.standTarget) d.standTarget.subtitle = 'Powered off';
}

function freeWhistle(ctx) {
  const d = ctx.data;
  if (d.whistleTarget || d.opts.whistle_taken || !d.whistle) return;
  d.whistleTarget = ctx.register({ classId: 'firefly_whistle', label: TEXT.whistleLabel, subtitle: TEXT.whistleDesc, sprite: d.whistle });
}

/* ------------------------------------------------------------------ */
/* Verbs                                                                */
/* ------------------------------------------------------------------ */

async function pushStand(ctx) {
  const d = ctx.data;
  if (d.standPushed || d.talking) return;
  d.talking = true;
  try {
    const first = await ctx.converse({ title: TEXT.standLabel, kicker: 'Fireflex 3000', text: TEXT.standIntro, choices: [{ label: 'OK', value: 'whistle-ok' }] });
    if (first !== 'whistle-ok' || !ctx.run) return;
    const second = await ctx.converse({ title: TEXT.standLabel, kicker: 'Fireflex 3000', text: TEXT.standConfirm, choices: [{ label: 'Push It', value: 'whistle-push' }] });
    if (second !== 'whistle-push' || !ctx.run) return;
    d.standPushed = true;
    setStandOff(ctx);
    freeWhistle(ctx);
    ctx.activity('You pushed the P.E.P.U. button. The force field is off.');
  } finally {
    d.talking = false;
  }
}

async function takeWhistle(ctx) {
  const d = ctx.data;
  if (!d.standPushed || d.opts.whistle_taken) return;
  d.opts.whistle_taken = true;
  d.step = 'taken';
  if (d.whistleTarget) ctx.unregister(d.whistleTarget);
  d.whistleTarget = null;
  if (d.whistle && !d.whistle.destroyed) d.whistle.visible = false;
  const eng = ctx.engine;
  vpOverlay(ctx, { lines: [TEXT.glakk], durationMs: 1500 });
  ctx.sound('WHISTLE_SWALLOWED', { volume: 0.7 });
  eng.playHit?.('hit1', 2000);
  const wait = (s) => ctx.wait(s * 1000);
  await wait(SWALLOW_STEPS[0]);
  eng.playHit?.('hit2', 2000);
  await wait(SWALLOW_STEPS[1]);
  eng.playHit?.('hit1', 2000);
  await wait(SWALLOW_STEPS[2]);
  eng.playHit?.('hit2', 2000);
  await wait(SWALLOW_STEPS[3]);
  eng.stopHit?.();
  eng.playEmotion?.('surprise');
  if (eng.player) ctx.say({ sprite: eng.player, label: eng.pc?.label || 'You' }, TEXT.swallowed, 4000);
  d.step = 'swallowed';
  await wait(SWALLOW_STEPS[4]);
  if (!ctx.run) return;
  eng.grantAchievement?.('firefly_whistling');
  ctx.activity(TEXT.swallowActivity);
  d.step = 'badge';
  await wait(SWALLOW_STEPS[5]);
  if (!ctx.run) return;
  ctx.progress('firefly_whistle_obtained');
  d.step = 'flag';
  // familiar_turnin: the Magic Rock turns it in here; the way home is still yours to find.
  if (ctx.complete()) {
    await ctx.turnIn();
    d.done = true;
    d.step = 'done';
    ctx.solve();
  }
}

/** askPlayer 'TELEPORTER SECURITY V2000' input box; resolves the text, or null on cancel. */
function askCode(ctx) {
  if (typeof document === 'undefined') return Promise.resolve(null);
  closeCode(ctx);
  const host = document.getElementById('quest-dialogue')?.parentNode || document.body;
  const wrap = document.createElement('div');
  wrap.className = 'quest-dialogue glitch-modal ffw-code';
  wrap.id = 'ffw-code';
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-modal', 'true');
  wrap.innerHTML = `
    <div class="quest-dialogue-shade"></div>
    <div class="quest-dialogue-card">
      <div class="quest-dialogue-orb" aria-hidden="true">✦</div>
      <p class="mr-kicker"></p>
      <h2></h2>
      <form style="display:grid;gap:.6rem;margin-top:.4rem">
        <label style="font-weight:800"></label>
        <input type="text" maxlength="12" autocomplete="off" spellcheck="false" autocapitalize="characters"
          style="font:inherit;font-size:1.1rem;letter-spacing:.2em;text-align:center;padding:.5rem .7rem;border:1px solid #c9d3dc;border-radius:10px;background:#fff" />
        <div class="quest-dialogue-actions" style="display:flex;gap:.5rem;justify-content:center">
          <button type="submit" class="btn-glitch-primary">OK</button>
          <button type="button" class="quest-dialogue-cancel" data-cancel>Cancel</button>
        </div>
      </form>
    </div>`;
  wrap.querySelector('.mr-kicker').textContent = TEXT.controlLabel;
  wrap.querySelector('h2').textContent = TEXT.codeTitle;
  wrap.querySelector('label').textContent = TEXT.codeLabel;
  const input = wrap.querySelector('input');
  host.appendChild(wrap);
  ctx.setData('ffwCodeBox', 'open');
  return new Promise((resolve) => {
    const done = (value) => {
      if (ctx.data.codeBox !== box) return;
      closeCode(ctx);
      resolve(value);
    };
    const box = { el: wrap, submit: (v) => done(v), cancel: () => done(null) };
    ctx.data.codeBox = box;
    wrap.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      done(input.value);
    });
    wrap.querySelector('[data-cancel]').addEventListener('click', () => done(null));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        done(null);
      }
    });
    input.focus();
    requestAnimationFrame(() => input.focus());
  });
}

function closeCode(ctx) {
  const box = ctx.data.codeBox;
  ctx.data.codeBox = null;
  box?.el?.remove();
  ctx.setData?.('ffwCodeBox', '');
}

async function useControl(ctx) {
  const d = ctx.data;
  if (!d.opts.whistle_taken || d.opts.teleporter_activated || d.codeBusy) return;
  d.codeBusy = true;
  const talk = (text, choices) => ctx.converse({ title: TEXT.controlLabel, kicker: TEXT.codeTitle, text, choices });
  try {
    for (;;) {
      const value = await askCode(ctx);
      if (value == null || !ctx.run) return;
      if (!String(value).trim()) return; // onInputBoxResponse ignores an empty box
      d.codeTries = (d.codeTries || 0) + 1;
      if (codeMatches(value)) {
        activateTeleporter(ctx);
        await talk(TEXT.codeAccepted);
        return;
      }
      const choice = await talk(d.hintAttempts ? TEXT.wrongAgain : TEXT.wrongFirst, [{ label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }]);
      if (!ctx.run) return;
      if (choice === 'yes') {
        d.hintAttempts = (d.hintAttempts || 0) + 1;
        await talk(hintFor(d.hintAttempts), [{ label: 'OK', value: 'ok' }]);
        if (!ctx.run) return;
      }
      // Either way the conversation ends and the code box comes back.
    }
  } finally {
    d.codeBusy = false;
  }
}

function activateTeleporter(ctx) {
  const d = ctx.data;
  d.opts.teleporter_activated = true;
  if (d.controlTarget) d.controlTarget.subtitle = 'Code accepted';
  if (d.beam) {
    d.beam.visible = true;
    d.beamAt = Date.now();
  }
  ctx.activity('The teleporter hums into life.');
}

async function exitByTeleporter(ctx) {
  const d = ctx.data;
  if (d.exiting) return;
  d.exiting = true;
  // goToFallingLevel(instances_get_exit): the falling room, whose teleporter leads back where you came from.
  goToFallingLevel(ctx);
}

/* ------------------------------------------------------------------ */
/* Ticking                                                              */
/* ------------------------------------------------------------------ */

function stepTriggers(ctx, now) {
  const d = ctx.data;
  const p = ctx.player;
  if (!p) return;
  // Walking back from the midpoint (moveAvatar pc.x - 500).
  if (d.push) {
    const t = Math.min(1, (now - d.push.at) / d.push.ms);
    const e = 1 - (1 - t) * (1 - t);
    p.x = d.push.from + (d.push.to - d.push.from) * e;
    p.vx = 0;
    if (t >= 1) d.push = null;
    return;
  }
  const busy = ctx.dialogOpen() || ctx.engine.acting?.() || d.codeBox;
  // P.E.P.U. hit box: the first visit's lines.
  if (!d.opts.forcefield_button_activated && hit(ctx, P(LAYOUT.stand), STAND_HIT.w, STAND_HIT.h)) {
    d.opts.forcefield_button_activated = true;
    vpSequence(ctx, [{ lines: [TEXT.forcefieldA], clickToAdvance: true }, { lines: TEXT.forcefieldB, durationMs: 3000 }]);
  }
  // Teleporter Control Unit hit box (see TELEPORTER_HINT_AS_COMMENTED).
  const teleHint = TELEPORTER_HINT_AS_COMMENTED ? !d.opts.teleporter_button_activated : d.opts.teleporter_button_activated;
  if (d.opts.whistle_taken && teleHint && hit(ctx, P(LAYOUT.control), CONTROL_HIT.w, CONTROL_HIT.h)) {
    d.opts.teleporter_button_activated = true;
    vpSequence(ctx, [{ lines: [TEXT.teleporterA], clickToAdvance: true }, { lines: [TEXT.teleporterB], durationMs: 3000 }]);
  }
  // 'midpoint': no further while the stand is still on.
  if (!d.standPushed && p.x >= P(LAYOUT.midpoint) && !busy) {
    d.pushes = (d.pushes || 0) + 1;
    d.push = { at: now, ms: 900, from: p.x, to: p.x - MIDPOINT_PUSH };
    vpOverlay(ctx, { lines: [TEXT.midpoint], durationMs: 3000, delayMs: 1000, topY: '25%' });
    return;
  }
  // 'teleporter': the pad's event box.
  const onPad = Math.abs(p.x - P(LAYOUT.pad)) <= 40 && Math.abs(p.y - FLOOR) < 24;
  if (onPad && !d.onPad) {
    if (d.opts.teleporter_activated) exitByTeleporter(ctx);
    else {
      d.bounces = (d.bounces || 0) + 1;
      ctx.place(p.x - PAD_PUSH, FLOOR);
    }
  }
  d.onPad = onPad;
}

function maybePromptStuck(ctx, now) {
  const d = ctx.data;
  if (d.prompting || d.exiting || now < d.promptAt) return;
  if (ctx.dialogOpen?.() || ctx.cardOpen?.() || d.codeBox) return;
  d.prompting = true;
  ctx.converse({
    title: 'Firefly Whistle',
    kicker: 'Are you stuck?',
    text: STUCK_TEXT,
    choices: [
      { label: 'Yes, please', value: 'yes' },
      { label: 'No thanks', value: 'no' },
    ],
  }).then((choice) => {
    d.prompting = false;
    if (choice === 'yes') ctx.leave({ transition: ctx.fx() });
    else d.promptAt = Date.now() + PROMPT_AGAIN_MS;
  });
}

/* ------------------------------------------------------------------ */
/* Room                                                                 */
/* ------------------------------------------------------------------ */

const lab = {
  id: 'firefly_whistle',
  title: 'Firefly Whistle',
  kicker: 'The Fireflex 3000 Lab',
  icon: `${ART}firefly_whistle_icon.png`,
  theme: 'lab',
  // The offer's "the last days of the Alphite Age".
  hubName: 'The last days of the Alphite Age',
  ownLight: true,
  // exit_delay 3 * 60 is the "Are you stuck?" prompt, not a clock (see tick).
  durationMs: 0,
  leaveText: 'Leave the lab without the whistle? You will have to start over.',
  travelText: 'You must find your own way back.',

  build(ctx) {
    const { PIXI, kit } = ctx;
    const { root } = buildLab(PIXI, kit);
    // QA: ?ffwstart=stand|control puts you beside a piece instead of at the arrival point.
    const qa = ctx.param('ffwstart');
    const at = qa === 'stand' ? LAYOUT.stand - 260 : qa === 'control' ? LAYOUT.control - 220 : ARRIVAL.x;
    return {
      label: 'Fireflex 3000 Lab',
      width: W,
      height: H,
      background: root,
      platforms: labPlatforms(kit),
      // The arrival point is over the entry ledge (ENTRY): you start on it.
      spawn: { x: P(at), y: at === ARRIVAL.x ? sy(ENTRY.y) : FLOOR },
    };
  },

  enter(ctx) {
    const d = ctx.data;
    // A lower camera anchor (y_cam_offset 240, as Mental Block): more of the Snaps' tall wall shows.
    if (ctx.engine.street) {
      const phys = ctx.engine.street.physics || {};
      ctx.engine.street.physics = { ...phys, setting: { ...(phys.setting || {}), y_cam_offset: 240 } };
    }
    d.opts = { ...LOCATION_OPTIONS };
    d.standPushed = false;
    d.done = false;
    d.step = '';
    d.hintAttempts = 0;
    d.codeTries = 0;
    d.pushes = 0;
    d.bounces = 0;
    d.promptAt = Date.now() + EXIT_PROMPT_MS;
    addStand(ctx);
    addControl(ctx);
    // The pillars stand in front of the avatar (video t20, t30, t41, t89).
    ctx.add(buildFront(ctx.PIXI), 60);
    const qa = ctx.param('ffwstart');
    if (qa === 'control') {
      // QA: the stand pushed and the whistle swallowed already (no badge, no flag).
      d.standPushed = true;
      d.opts.forcefield_button_activated = true;
      d.opts.whistle_taken = true;
      setStandOff(ctx);
      if (d.whistle) d.whistle.visible = false;
    }
  },

  verbs(ctx, target) {
    const d = ctx.data;
    if (target === d.standTarget) {
      return [{ id: 'push', label: 'Push', enabled: !d.standPushed && !d.talking, tooltip: TEXT.standTooltip, reason: d.standPushed ? TEXT.standPushed : '', durationMs: 0 }];
    }
    if (target === d.whistleTarget) {
      return [{ id: 'take', label: 'Take', enabled: !d.opts.whistle_taken, tooltip: TEXT.whistleTooltip, durationMs: 0 }];
    }
    if (target === d.controlTarget) {
      const reason = !d.opts.whistle_taken ? TEXT.controlInactive : d.opts.teleporter_activated ? TEXT.controlPushed : '';
      return [{ id: 'push', label: 'Push', enabled: !reason && !d.codeBusy, tooltip: TEXT.controlTooltip, reason, durationMs: 0 }];
    }
    return [];
  },

  runVerb(ctx, target, verbId) {
    const d = ctx.data;
    if (target === d.standTarget && verbId === 'push') {
      pushStand(ctx);
      return true;
    }
    if (target === d.whistleTarget && verbId === 'take') {
      takeWhistle(ctx);
      return true;
    }
    if (target === d.controlTarget && verbId === 'push') {
      useControl(ctx);
      return true;
    }
    return false;
  },

  tick(ctx, dtMs, now = Date.now()) {
    const d = ctx.data;
    stepTriggers(ctx, now);
    maybePromptStuck(ctx, now);
    if (d.whistle && !d.whistle.destroyed && d.whistle.visible) {
      // The item SWF's own 48-frame bob, a few px.
      d.whistle.y = d.whistle.baseY + Math.sin(now / 480) * 3;
    }
    if (d.beam?.visible) d.beam.alpha = Math.min(0.9, (now - d.beamAt) / 600) * (0.82 + 0.08 * Math.sin(now / 220));
  },

  objective(ctx) {
    const d = ctx.data;
    let text = TEXT.desc;
    if (d.opts?.teleporter_activated) text = 'The teleporter is on. Step onto it.';
    else if (d.done) text = 'You must find your own way back.';
    else if (d.opts?.whistle_taken) text = 'Gulp.';
    else if (d.standPushed) text = 'The force field is off. Take the whistle.';
    else if (d.opts?.forcefield_button_activated) text = 'The whistle is behind a force field. How do you turn it off?';
    const whistle = d.opts?.whistle_taken ? 'swallowed' : d.standPushed ? 'unguarded' : 'guarded';
    return { text, stats: [['whistle', whistle], ['teleporter', d.opts?.teleporter_activated ? 'on' : 'off']] };
  },

  onLeave(ctx) {
    closeCode(ctx);
    advanceVpOverlay();
    return {};
  },

  clear(ctx) {
    closeCode(ctx);
  },

  publish(ctx) {
    const d = ctx.data;
    const o = d.opts || {};
    ctx.setData('ffwStand', d.standPushed ? 'off' : 'on');
    ctx.setData('ffwWhistle', o.whistle_taken ? 'taken' : d.whistleTarget ? 'free' : 'guarded');
    ctx.setData('ffwStep', d.step || '');
    ctx.setData('ffwOptions', Object.keys(LOCATION_OPTIONS).filter((k) => o[k]).join(','));
    ctx.setData('ffwHints', String(d.hintAttempts || 0));
    ctx.setData('ffwCodeTries', String(d.codeTries || 0));
    ctx.setData('ffwPushes', String(d.pushes || 0));
    ctx.setData('ffwBounces', String(d.bounces || 0));
    ctx.setData('ffwDone', d.done ? '1' : '0');
    ctx.setData('ffwPlayerX', String(Math.round((ctx.player?.x ?? 0) + (-sx(0)))));
  },

  /**
   * QA (&questautoplay=full|stand|swallow|beam|look): places the avatar beside
   * each piece, proves the midpoint and pad push-backs, answers the dialogue (a
   * wrong code and one hint before FFW) and leaves by the teleporter. `look`
   * only stands you by the guarded whistle (the restoration picture).
   */
  async autoplay(ctx, mode = 'full') {
    const d = ctx.data;
    const until = async (fn, ms = 12000) => {
      const end = Date.now() + ms;
      while (!fn() && Date.now() < end && ctx.run) await ctx.wait(120);
      return fn();
    };
    const clickThrough = async (ms = 9000) => {
      const end = Date.now() + ms;
      while (Date.now() < end && ctx.run) {
        if (ctx.advanceAward()) await ctx.wait(500);
        else if (ctx.dialogOpen()) {
          ctx.advanceDialog();
          await ctx.wait(350);
        } else return;
      }
    };
    await ctx.wait(900);
    if (mode === 'look') {
      ctx.place(P(LAYOUT.stand) - 230, FLOOR);
      // The first-visit lines stay off the picture.
      d.opts.forcefield_button_activated = true;
      return 'look';
    }
    if (!d.standPushed) {
      // The midpoint walks you back while the stand is on.
      ctx.place(P(LAYOUT.midpoint) + 6, FLOOR);
      await until(() => d.pushes > 0 && !d.push, 4000);
      advanceVpOverlay();
      // The stand's hit box and its two lines.
      ctx.place(P(LAYOUT.stand) - 120, FLOOR);
      await until(() => d.opts.forcefield_button_activated, 3000);
      await ctx.wait(500);
      advanceVpOverlay();
      await ctx.wait(400);
      advanceVpOverlay();
      room.runVerb(ctx, d.standTarget, 'push');
      await until(() => ctx.dialogOpen(), 3000);
      ctx.advanceDialog();
      await ctx.wait(400);
      ctx.advanceDialog();
      await until(() => d.standPushed, 3000);
    }
    if (mode === 'stand') return 'stand';
    if (!d.opts.whistle_taken) {
      await ctx.wait(600);
      room.runVerb(ctx, d.whistleTarget, 'take');
      if (mode === 'swallow') {
        await until(() => d.step === 'swallowed', 4000);
        return 'swallow';
      }
      await until(() => d.step === 'flag' || d.step === 'done', 9000);
      await until(() => ctx.cardOpen?.() || ctx.advanceAward() || d.done, 6000);
      await clickThrough(8000);
      await until(() => d.done, 6000);
      await clickThrough(4000);
    }
    // Before the code: the pad puts you back.
    ctx.place(P(LAYOUT.pad) - 140, FLOOR);
    await ctx.wait(300);
    ctx.place(P(LAYOUT.pad), FLOOR);
    await until(() => d.bounces > 0, 2000);
    // The control unit: its first-visit lines, a wrong code, one hint, then FFW.
    ctx.place(P(LAYOUT.control) - 60, FLOOR);
    await until(() => d.opts.teleporter_button_activated, 2000);
    await ctx.wait(400);
    advanceVpOverlay();
    await ctx.wait(300);
    advanceVpOverlay();
    room.runVerb(ctx, d.controlTarget, 'push');
    await until(() => d.codeBox, 3000);
    d.codeBox?.submit('abc');
    await until(() => ctx.dialogOpen(), 3000);
    ctx.advanceDialog(); // Yes, a hint
    await ctx.wait(400);
    ctx.advanceDialog(); // OK
    await until(() => d.codeBox, 3000);
    d.codeBox?.submit(' ffw ');
    await until(() => ctx.dialogOpen(), 3000);
    if (mode === 'beam') {
      await ctx.wait(700);
      ctx.advanceDialog();
      await ctx.wait(900);
      return 'beam';
    }
    ctx.advanceDialog();
    await ctx.wait(500);
    ctx.place(P(LAYOUT.pad) - 90, FLOOR);
    await ctx.wait(300);
    ctx.place(P(LAYOUT.pad), FLOOR);
    await until(() => !ctx.run, 6000);
    return ctx.run ? 'stuck' : 'complete';
  },
};

/** The lab, with the falling room as its second stage (falling-room.js). */
export const room = withFallingRoom(lab);
