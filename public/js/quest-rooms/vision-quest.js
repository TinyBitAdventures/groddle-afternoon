/**
 * Vision Quest (quests/eyeballery_identify_object.js) in the Institute of
 * Ocular Testing.
 *
 * Geometry survives: production template LNVUCOIA1MJ2M54 was archived as its
 * instantiated copy LNV1T7PCUM53T25 (geometry GNV1T7PCUM53T25, imported
 * street). Its two walls keep the avatar on the right-hand landing
 * (x 715..1379 source), so the far-left object can only be seen, not
 * reached. Source rules:
 *  - onStarted: questInstanceLocation(pc, 'vision_quest', 1240, -197, 5 * 60).
 *  - onEnterLocation: createRandomItem() puts one of npc_piggy, pumpkin,
 *    trant_fruit, rock_sparkly_1, npc_crab, lemburger at -1381, -206
 *    (rock +20 y, tree +25 x / +15 y).
 *  - items/npc_myopic_frog.js: collision runs the three-beat introduction;
 *    Talk to asks "I’m pretty sure it’s <one of seven wrong things>. Can you
 *    give me a hint?" with six descriptions plus "I don't know". Right:
 *    "Of course, it's <item>. Thank you. I’m finally ready to enter the
 *    delivery service!" → "You're welcome!", the frog flies 1500 px right and
 *    100 up over 2 s, then identify_object is set. Wrong: "Would you like to
 *    borrow my glasses?"; "I don't know": "Did you press 'C' to enter the
 *    Camera Mode?".
 *  - onComplete_custom exits the instance; leaving early fails the quest.
 * The remake has no client Camera Mode, so the room provides one: C toggles a
 * viewfinder, arrows / A D pan the view across the whole room, C or Esc
 * returns. The avatar stays put while looking.
 */

import { frameTexture, onLoaded, sourceFromUrl } from '../textures.js';

export const STREET = 'GNV1T7PCUM53T25';
const BOUNDS = { l: -1500, t: -600 };
const sx = (x) => x - BOUNDS.l;
const sy = (y) => y - BOUNDS.t;
const ART = 'assets/sprites/quest-rooms/vision_quest/';

export const OBJECTS = Object.freeze({
  npc_piggy: { label: 'a Piggy', hint: 'It’s pink and piggly.' },
  pumpkin: { label: 'a Pumpkin', hint: 'It’s orange and gourdly.' },
  trant_fruit: { label: 'a Fruit Tree', hint: 'It’s tall and flowery.' },
  rock_sparkly_1: { label: 'a Sparkly Rock', hint: 'It’s dense and sparkly.' },
  npc_crab: { label: 'a Crab', hint: 'It’s red and crabby.' },
  lemburger: { label: 'a Lemburger', hint: 'It’s small and sandwichy.' },
});
export const WRONG_THINGS = Object.freeze([
  'a dancing circus bear',
  'the lost city of Atlantis',
  'a towering pillar of bees',
  'a kindly old farrier',
  'seven forbidden scrolls',
  'the concept of time',
  'a gateway to the porridge dimension',
]);
const INTRO = [
  { text: 'Thank goodness you’re here. I’m trying to qualify for my flight test, but I’m afraid I’ve run into a spot of trouble.', response: 'What’s wrong?' },
  { text: 'I’m on the vision test segment, but I can’t quite make out what’s on the other side of this room. I tried to get out of it, but when I told the agency I was myopic, they just said they don’t discriminate on the basis of race. “I have astigmatism,” I told them, but they replied they couldn’t accept bribes.', response: 'That makes my head hurt.' },
  { text: 'Can you press "C" to go to the Camera Mode and to look over, and then give me a hint as to what it is? I’m nearly certain I’ve got it, but this test is very important and I dread failing again. I’d have to go through another year of yoga instruction, and I have bad joints… and it makes my asthma act up.', response: 'I’ll do what I can.' },
];

/** Source object spot (createRandomItem) in street screen space. */
export function objectSpot(cls) {
  let x = -1381;
  let y = -206;
  if (cls === 'rock_sparkly_1') y += 20;
  else if (cls === 'trant_fruit') {
    x += 25;
    y += 15;
  }
  return { x: sx(x), y: sy(y) };
}

const pick = (list, rng = Math.random) => list[Math.floor(rng() * list.length) % list.length];

function objectSprite(ctx, cls) {
  const { PIXI, kit } = ctx;
  const { x, y } = objectSpot(cls);
  if (cls === 'npc_piggy') {
    const sheet = kit.animated(PIXI, 'assets/sprites/npc_piggy__x1_walk_png_1354829432.png', 8, 3, { count: 24, speed: 0.12 });
    sheet.x = x;
    sheet.y = y + 2;
    sheet.scale.set(0.9);
    return sheet;
  }
  if (cls === 'npc_crab') {
    const crab = kit.animated(PIXI, `${ART}crab_idle.png`, 6, 5, { count: 30, speed: 0.2 });
    crab.x = x;
    crab.y = y + 4;
    crab.scale.set(0.55);
    return crab;
  }
  if (cls === 'trant_fruit') return kit.deco(PIXI, 'trant_fruit_m7', x, y + 4, { dir: 'assets/sprites/trants/frames/', scale: 0.85 });
  if (cls === 'rock_sparkly_1') {
    const base = sourceFromUrl('assets/sprites/mining/rock_sparkly.png');
    const tex = frameTexture(base, new PIXI.Rectangle(0, 0, 131, 127));
    const spr = new PIXI.Sprite(tex);
    spr.anchor.set(0.5, 1);
    spr.x = x;
    spr.y = y + 4;
    return spr;
  }
  return kit.icon(PIXI, cls, x, y + 2, { scale: 1.6 });
}

/* ------------------------------------------------------------------ */
/* Camera Mode                                                         */
/* ------------------------------------------------------------------ */

const keys = new Set();
let listeners = null;

function attachKeys(ctx) {
  if (listeners || typeof window === 'undefined') return;
  const down = (e) => {
    if (!ctx.run || ctx.dialogOpen() || ctx.cardOpen()) return;
    const k = e.key;
    if (k === 'c' || k === 'C') {
      e.stopImmediatePropagation();
      e.preventDefault();
      toggleCamera(ctx);
      return;
    }
    if (ctx.data.camera && (k === 'Escape')) {
      e.stopImmediatePropagation();
      toggleCamera(ctx, false);
      return;
    }
    if (ctx.data.camera) {
      keys.add(k.toLowerCase());
      if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'a', 'd', 'w', 's', ' '].includes(k.toLowerCase())) {
        e.stopImmediatePropagation();
        e.preventDefault();
      }
    }
  };
  const up = (e) => keys.delete(String(e.key).toLowerCase());
  window.addEventListener('keydown', down, true);
  window.addEventListener('keyup', up, true);
  listeners = { down, up };
}

function detachKeys() {
  if (!listeners) return;
  window.removeEventListener('keydown', listeners.down, true);
  window.removeEventListener('keyup', listeners.up, true);
  listeners = null;
  keys.clear();
}

function viewfinder(ctx, on) {
  if (typeof document === 'undefined') return;
  let el = document.getElementById('qi-camera-mode');
  if (!el) {
    const host = document.getElementById('rook-woods-hud')?.parentElement || document.body;
    el = document.createElement('div');
    el.id = 'qi-camera-mode';
    el.setAttribute('aria-live', 'polite');
    el.style.cssText = 'position:absolute;inset:0;z-index:78;pointer-events:none;box-shadow:inset 0 0 0 9999px rgba(0,0,0,0)';
    el.innerHTML = `
      <div style="position:absolute;inset:18px 18px 150px 18px;border-radius:14px;box-shadow:0 0 0 2000px rgba(10,20,30,.28)"></div>
      ${['top:30px;left:30px;border-width:4px 0 0 4px', 'top:30px;right:30px;border-width:4px 4px 0 0', 'bottom:162px;left:30px;border-width:0 0 4px 4px', 'bottom:162px;right:30px;border-width:0 4px 4px 0']
        .map((pos) => `<i style="position:absolute;${pos};width:46px;height:46px;border-style:solid;border-color:rgba(255,255,255,.92)"></i>`).join('')}
      <div style="position:absolute;left:50%;bottom:172px;transform:translateX(-50%);padding:6px 14px;border-radius:999px;background:rgba(20,30,40,.72);color:#fff;font-weight:800;font-size:.8rem;letter-spacing:.06em">CAMERA MODE · ← → to look · C to return</div>
      <i style="position:absolute;left:50%;top:40%;width:22px;height:22px;margin:-11px 0 0 -11px;border:2px solid rgba(255,255,255,.85);border-radius:50%"></i>`;
    host.appendChild(el);
  }
  el.hidden = !on;
}

function toggleCamera(ctx, force) {
  const on = force ?? !ctx.data.camera;
  ctx.data.camera = on;
  if (!on) ctx.data.look = 0;
  viewfinder(ctx, on);
  ctx.sound(on ? 'CAMERA_MODE_ON' : 'CAMERA_MODE_OFF', { volume: 0.4 });
  ctx.setData('visionCamera', on ? '1' : '0');
}

/* ------------------------------------------------------------------ */
/* Frog conversation                                                   */
/* ------------------------------------------------------------------ */

async function intro(ctx) {
  if (ctx.data.introDone || ctx.data.talking) return;
  ctx.data.talking = true;
  ctx.data.frogTalk?.();
  await ctx.converse({ title: 'Myopic Delivery Frog', kicker: 'Institute of Ocular Testing', beats: INTRO });
  ctx.data.introDone = true;
  ctx.data.talking = false;
  ctx.data.frogIdle?.();
}

async function askForHelp(ctx) {
  if (ctx.data.talking || ctx.data.leaving) return;
  ctx.data.talking = true;
  ctx.data.frogTalk?.();
  const wrong = pick(WRONG_THINGS, ctx.data.rng);
  const choices = [
    ...Object.entries(OBJECTS).map(([value, o]) => ({ label: o.hint, value })),
    { label: "I don't know", value: 'none' },
  ];
  const answer = await ctx.converse({
    title: 'Myopic Delivery Frog',
    kicker: 'Vision test',
    text: `I’m pretty sure it’s ${wrong}. Can you give me a hint?`,
    choices,
  });
  ctx.data.guesses = (ctx.data.guesses || 0) + 1;
  ctx.setData('visionLastGuess', answer);
  if (answer === ctx.data.object) {
    await ctx.converse({
      title: 'Myopic Delivery Frog',
      kicker: 'Vision test',
      text: `Of course, it's ${OBJECTS[ctx.data.object].label}. Thank you. I’m finally ready to enter the delivery service!`,
      choices: [{ label: "You're welcome!", value: 'complete' }],
    });
    ctx.data.talking = false;
    flyAway(ctx);
    return;
  }
  await ctx.converse({
    title: 'Myopic Delivery Frog',
    kicker: 'Vision test',
    text: answer === 'none'
      ? "No, I’m pretty sure that’s not right. Did you press 'C' to enter the Camera Mode?"
      : 'No, I’m pretty sure that’s not right. Would you like to borrow my glasses?',
    choices: [{ label: 'I can do this, honest!', value: 'finished' }],
  });
  ctx.data.talking = false;
  ctx.data.frogIdle?.();
}

async function flyAway(ctx) {
  ctx.data.leaving = { at: Date.now(), x0: ctx.data.frog.x, y0: ctx.data.frog.y };
  ctx.data.frogMove?.();
  await ctx.wait(2500);
  ctx.progress('identify_object');
  ctx.solve();
  if (ctx.complete()) await ctx.turnIn();
  ctx.leave({ transition: ctx.fx() });
}

/* ------------------------------------------------------------------ */
/* Room                                                                */
/* ------------------------------------------------------------------ */

export const room = {
  id: 'vision_quest',
  title: 'Institute of Ocular Testing',
  kicker: 'Vision test',
  icon: `${ART}frog_icon.png`,
  theme: 'memory',
  // G315: template in hub 61 'Simple Level Quests' (inc_data_maps_prod.js 245), a dev label; plain remake wording.
  hubName: 'Quest',
  durationMs: 5 * 60 * 1000,
  leaveText: 'Leave the Institute? The frog still needs your eyes.',
  travelText: 'You are in the middle of a vision test.',

  street() {
    return { tsid: STREET, x: sx(1240), y: sy(-197) };
  },

  start(ctx) {
    ctx.data.rng = ctx.param('visionseed') != null ? (() => (Number(ctx.param('visionseed')) % 1000) / 1000) : Math.random;
    const forced = ctx.param('visionobject');
    ctx.data.object = OBJECTS[forced] ? forced : pick(Object.keys(OBJECTS), ctx.data.rng);
  },

  enter(ctx) {
    const { PIXI, kit } = ctx;
    attachKeys(ctx);
    ctx.data.camera = false;
    ctx.data.look = 0;
    // The object across the room.
    const obj = objectSprite(ctx, ctx.data.object);
    obj.zIndex = 12;
    ctx.add(obj, 12);
    ctx.data.objectX = objectSpot(ctx.data.object).x;
    // The examiner crab (archived on the location) and the frog.
    const crab = kit.animated(PIXI, `${ART}crab_idle.png`, 6, 5, { count: 30, speed: 0.18 });
    crab.x = sx(1330);
    crab.y = sy(-194);
    crab.scale.set(-0.42, 0.42);
    ctx.add(crab, 14);
    const frogIdle = kit.sheetFrames(PIXI, `${ART}frog_idle.png`, 16, 3, 48);
    const frogTalk = kit.sheetFrames(PIXI, `${ART}frog_talk.png`, 16, 4, 62); // OGA npc_myopic_frog talk: 62 cells (G276)
    const frogMove = kit.sheetFrames(PIXI, `${ART}frog_move.png`, 12, 2, 24);
    const frog = new PIXI.AnimatedSprite([PIXI.Texture.EMPTY]);
    frog.anchor.set(0.5, 1);
    frog.animationSpeed = 0.3;
    frog.x = sx(1000);
    frog.y = sy(-200);
    frog.scale.set(1.1);
    const use = (sheet) => () => {
      const set = () => {
        if (frog.destroyed || !sheet.frames.length) return;
        frog.textures = sheet.frames;
        frog.play();
      };
      if (sheet.frames.length) set();
      else onLoaded(sheet.base, () => setTimeout(set, 0));
    };
    ctx.data.frogIdle = use(frogIdle);
    ctx.data.frogTalk = use(frogTalk);
    ctx.data.frogMove = use(frogMove);
    ctx.data.frogIdle();
    ctx.data.frog = frog;
    ctx.data.frogTarget = ctx.register({
      classId: 'npc_myopic_frog',
      label: 'Myopic Delivery Frog',
      subtitle: 'Needs your eyes',
      sprite: frog,
    });
  },

  clear() {
    detachKeys();
    viewfinder(null, false);
  },

  verbs(ctx, target) {
    if (target.classId !== 'npc_myopic_frog') return [];
    return [{ id: 'talk_to', label: 'Talk to', enabled: !ctx.data.leaving, tooltip: 'See what this curious fellow has to say' }];
  },

  runVerb(ctx, target, verbId) {
    if (target.classId !== 'npc_myopic_frog' || verbId !== 'talk_to') return false;
    if (!ctx.data.introDone) intro(ctx).then(() => askForHelp(ctx));
    else askForHelp(ctx);
    return true;
  },

  physics(ctx) {
    return ctx.data.camera ? { speed: 0, jump: 0 } : null;
  },

  tick(ctx, dtMs) {
    const p = ctx.player;
    // onPlayerCollision: 200 x 100 hit box around the frog.
    if (!ctx.data.introDone && !ctx.data.talking && ctx.data.frog && Math.abs(p.x - ctx.data.frog.x) < 100 && Math.abs(p.y - ctx.data.frog.y) < 80) {
      intro(ctx);
    }
    if (ctx.data.leaving && ctx.data.frog && !ctx.data.frog.destroyed) {
      const t = Math.min(1, (Date.now() - ctx.data.leaving.at) / 2000);
      ctx.data.frog.x = ctx.data.leaving.x0 + 1500 * t;
      ctx.data.frog.y = ctx.data.leaving.y0 - 100 * t;
    }
    if (ctx.data.camera) {
      const dir = (keys.has('arrowleft') || keys.has('a') ? -1 : 0) + (keys.has('arrowright') || keys.has('d') ? 1 : 0);
      ctx.data.look = (ctx.data.look || 0) + dir * 0.9 * Math.max(1, dtMs);
      const cam = ctx.engine.camera;
      const minLook = -cam.x;
      const maxLook = Math.max(0, ctx.engine.worldW - cam.w - cam.x);
      ctx.data.look = Math.max(minLook, Math.min(maxLook, ctx.data.look));
      ctx.engine.nudgeCamera(-ctx.data.look, 0);
      const viewL = cam.x + ctx.data.look;
      if (ctx.data.objectX > viewL + 40 && ctx.data.objectX < viewL + cam.w - 40) {
        if (!ctx.data.seen) ctx.setData('visionSeen', ctx.data.object);
        ctx.data.seen = true;
      }
    }
  },

  objective(ctx) {
    if (ctx.data.leaving) return { text: 'Off to the delivery service!' };
    if (!ctx.data.introDone) return { text: 'Say hello to the Myopic Delivery Frog.' };
    if (!ctx.data.seen) return { text: 'Press C for Camera Mode and look across the room.' };
    return { text: 'Talk to the frog and describe what you saw.', stats: [['hints given', ctx.data.guesses || 0]] };
  },

  onLeave(ctx) {
    detachKeys();
    viewfinder(ctx, false);
    return {};
  },

  publish(ctx) {
    ctx.setData('visionObject', ctx.data.object || '');
    ctx.setData('visionIntro', ctx.data.introDone ? '1' : '0');
    ctx.setData('visionCameraLook', String(Math.round(ctx.data.look || 0)));
    ctx.setData('visionStreet', ctx.engine.streetTsid || '');
  },

  async autoplay(ctx, mode) {
    // Walk into the frog for the introduction.
    for (let i = 0; i < 40 && !ctx.data.frog; i++) await ctx.wait(150);
    ctx.place(ctx.data.frog.x + 40, ctx.data.frog.y);
    for (let i = 0; i < 40 && !ctx.dialogOpen(); i++) await ctx.wait(150);
    while (ctx.dialogOpen()) {
      ctx.advanceDialog();
      await ctx.wait(300);
    }
    // Camera Mode: look all the way left.
    toggleCamera(ctx, true);
    keys.add('arrowleft');
    for (let i = 0; i < 80 && !ctx.data.seen; i++) await ctx.wait(150);
    keys.delete('arrowleft');
    if (mode === 'camera') return 'camera';
    await ctx.wait(400);
    toggleCamera(ctx, false);
    if (mode === 'wrong') {
      askForHelp(ctx);
      for (let i = 0; i < 20 && !ctx.dialogOpen(); i++) await ctx.wait(100);
      // Choose a wrong description, then accept the reply.
      const wrong = Object.keys(OBJECTS).find((k) => k !== ctx.data.object);
      clickChoice(wrong);
      await ctx.wait(500);
      ctx.advanceDialog();
      await ctx.wait(500);
    }
    askForHelp(ctx);
    for (let i = 0; i < 20 && !ctx.dialogOpen(); i++) await ctx.wait(100);
    clickChoice(ctx.data.object);
    await ctx.wait(500);
    ctx.advanceDialog();
    // Close the completion award pages as they appear (the room leaves after).
    for (let i = 0; i < 100 && ctx.run; i++) {
      ctx.advanceAward();
      await ctx.wait(300);
    }
    return 'complete';
  },
};

function clickChoice(value) {
  const OBJ = Object.keys(OBJECTS);
  const buttons = [...document.querySelectorAll('#qi-dialogue [data-qi-choices] button')];
  const idx = value === 'none' ? OBJ.length : OBJ.indexOf(value);
  buttons[idx]?.click();
}
