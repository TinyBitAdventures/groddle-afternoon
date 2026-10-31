/**
 * Room 23 (G71) as a feature module (see js/feature-host.js): where
 * Gwendolyn's Task begins. The room is street JSON (js/gwendolyn-room-23.js,
 * written by tools/build-tower-rooms.mjs) behind Corridor Five's Red-Green
 * Triangle Key door; this file adds what a street JSON cannot carry:
 *
 * - Greeterbot Sentry G-42 (items/npc_widget.js; the Mezzanine's widgetWood
 *   art, js/tower-mid-rooms.js GREETERBOT). Coming within 200 px (its 400 x 400
 *   hit box) starts its conversation once a visit, chosen by level and quest
 *   state: under level 12 "not quite ready" (50 currants, back to Corridor
 *   Five); Gwendolyn's Task done, the paid repeat (100 currants, or 50 and
 *   back out if you decline or cannot pay); otherwise "Proceed upstairs". Then
 *   it leads you to x 1250 and says "That's it. Just up to your right."
 * - The Ghost of Gwendolyn (items/npc_gwendolyn.js): within 200 px she offers
 *   Gwendolyn's Task (its source offer, "Kind of."), each time you come close;
 *   accepting it is the quest's start: quest-instances-feature takes you to
 *   Area 42.
 * - The instance's "Are you stuck?" prompt 2 minutes after each greeting
 *   (players/inc_instances.js); Yes takes you back to Corridor Five.
 * - The up arrow over the ledges (firebog_up_arrows, tools/room-art set
 *   gwendolyn_room_23) and the room's interior ecology.
 *
 * QA (real door): ?autostart=1&questoffer=off&doordemo=GTJ10M515812V0C&doorindex=0&doorkey=5&doorautoplay=1
 *   &room23demo=first   level 12 and a fresh quest log (the first visit)
 *   &room23demo=repeat  level 12, the chain done, 200 currants (the paid repeat)
 *   &room23demo=young   level 5 (the default fresh save)
 * Canvas data: room23, room23Greeter (waiting | talking | leading | led |
 * sent | teleport | repeat_paid), room23Opening, room23Gwen (idle | offering |
 * accepted | declined | quiet), room23Last, room23RepeatPaid, room23ExitIn.
 */

import { acceptOffer, declineOffer, npcQuestOffers } from '../quest-offers.js?v=dbfa83c4';
import { XP_FOR_LEVEL } from '../progression.js?v=33462eaa';
import { textureFromUrl } from '../textures.js?v=db2ce452';
import * as kit from '../quest-rooms/kit.js?v=c7ea6e0e';
import { GREETERBOT } from '../tower-mid-rooms.js?v=15143f80';
import { ROOM_23_FILES } from '../gwendolyn-room-23-art.js?v=1de55db7';
import {
  EXIT_PROMPT,
  EXIT_PROMPT_MS,
  GREETER_LINES,
  GREETERBOT_LABEL,
  GWENDOLYN_LABEL,
  HIT_HALF,
  LEAD_SPEED,
  MIN_LEVEL,
  PART2,
  PART3,
  PART3_REPEAT,
  REPEAT_COST,
  REPEAT_DECLINE,
  ROOM_23,
  ROOM_23_ART_ROOT,
  ROOM_23_DOOR,
  ROOM_23_SOURCE_TSID,
  ROOM_23_TSID,
  TASK,
  TELEPORT_OUT,
  clearChainForRepeat,
  greeterOpening,
  greeterScript,
  gwendolynOffers,
  isRoom23,
  leadPath,
  toScreen,
} from '../gwendolyn-room-23.js?v=d371497b';

export const GWENDOLYN_ROOM_23_FEATURE_ID = 'gwendolyn-room-23';
const CHECK_MS = 120;
const ARRIVAL_GRACE_MS = 700;
/** Corridor Five's bounds (l -2250, t -1500): world -> its screen space. */
const C5 = Object.freeze({ l: -2250, t: -1500 });
const GWEN_ART = 'assets/sprites/quest-rooms/gwendolyn/gwendolyn_';
/** gwendolyn.js SHEETS.gwendolyn (116 x 191 cells) and its anchor. */
const GWEN_SHEETS = Object.freeze({ idle: [8, 10, 76], talk: [8, 10, 74] });
const GWEN_ANCHOR = [56 / 116, 171 / 191];
const TITLE = 'Room 23';

let save = { v: 1, repeatPaid: false, greetings: 0 };
let views = [];
let greeter = null; // { sprite, target, x, y, path, opening, state, sendOn, said }
let gwen = null; // { actor, glow, target, x, y, armed, offering }
let arrow = null;
let enteredAt = 0;
let lastCheck = 0;
let exitAt = 0;
let exitUid = ''; // G304: the "Are you stuck?" prompt in the stack
let last = '';
let teleporting = false;

const free = (engine) => !engine.acting?.() && !engine.questDialogueOpen?.() && !teleporting;

function setData(engine) {
  engine.setData('room23Greeter', greeter?.state || '');
  engine.setData('room23Opening', greeter?.opening || '');
  engine.setData('room23Gwen', gwen?.state || '');
  engine.setData('room23Last', last);
  engine.setData('room23RepeatPaid', save.repeatPaid ? '1' : '0');
  engine.setData('room23ExitIn', exitAt ? Math.max(0, Math.round((exitAt - Date.now()) / 1000)) : '');
  if (greeter) engine.setData('room23GreeterAt', `${Math.round(greeter.x)},${Math.round(greeter.y)}`);
}

/** instances_cancel_exit_prompt (inc_instances.js 359-370): prompts_remove the stuck prompt. */
function cancelExitPrompt(engine) {
  if (exitUid) engine?.removePrompt?.(exitUid);
  exitUid = '';
}

function clear(engine) {
  if (engine) cancelExitPrompt(engine);
  if (engine) {
    if (greeter?.target) engine.unregister(greeter.target);
    if (gwen?.target) engine.unregister(gwen.target);
  }
  for (const v of views) {
    if (v.parent) v.parent.removeChild(v);
    if (!v.destroyed) v.destroy({ children: true });
  }
  views = [];
  greeter = null;
  gwen = null;
  arrow = null;
  exitAt = 0;
}

function questCtx(engine) {
  return {
    level: engine.pc.level,
    xp: engine.pc.xp,
    skills: engine.learnedSkills,
    achievements: engine.unlockedAchievements,
    inv: engine.inv,
    pc: engine.pc,
    hub: engine.street?.hubId || '',
    now: Date.now(),
  };
}

/* ------------------------------------------------------------------ */
/* Drawing                                                              */
/* ------------------------------------------------------------------ */

function add(engine, child, z) {
  child.zIndex = z;
  engine.entityLayer.addChild(child);
  views.push(child);
  return child;
}

function drawGreeter(engine) {
  const { PIXI } = engine;
  const sprite = new PIXI.Sprite(textureFromUrl(GREETERBOT.art));
  sprite.anchor.set(0.5, 1);
  const x = ROOM_23.greeter.x;
  const y = ROOM_23.floor;
  const p = toScreen(x, y - ROOM_23.greeter.hover);
  sprite.x = p.x;
  sprite.y = p.y;
  add(engine, sprite, 30);
  const target = engine.register({
    classId: GREETERBOT.classId,
    featureId: GWENDOLYN_ROOM_23_FEATURE_ID,
    label: GREETERBOT_LABEL,
    subtitle: 'Room 23',
    sprite,
  });
  greeter = { sprite, target, x, y, path: [], opening: '', state: 'waiting', sendOn: false, said: false };
}

function drawGwendolyn(engine) {
  const { PIXI } = engine;
  const mound = ROOM_23.tiers.find((t) => t.id === 'mound');
  const x = ROOM_23.gwen.x;
  const y = mound.y;
  const p = toScreen(x, y);
  const glow = new PIXI.Graphics();
  for (let i = 6; i >= 1; i--) glow.circle(0, -90, 40 + i * 22).fill({ color: 0xa9f0ff, alpha: 0.035 * (7 - i) });
  glow.x = p.x;
  glow.y = p.y;
  glow.eventMode = 'none';
  add(engine, glow, 28);
  const sheets = {};
  for (const [name, [cols, rows, count]] of Object.entries(GWEN_SHEETS)) sheets[name] = kit.sheetFrames(PIXI, `${GWEN_ART}${name}.webp`, cols, rows, count);
  const spr = new PIXI.AnimatedSprite([PIXI.Texture.EMPTY]);
  spr.anchor.set(GWEN_ANCHOR[0], GWEN_ANCHOR[1]);
  spr.animationSpeed = 0.4;
  const c = new PIXI.Container();
  c.addChild(spr);
  c.x = p.x;
  c.y = p.y;
  add(engine, c, 29);
  const actor = { c, spr, sheets, state: '' };
  const target = engine.register({
    classId: 'npc_gwendolyn',
    featureId: GWENDOLYN_ROOM_23_FEATURE_ID,
    label: GWENDOLYN_LABEL,
    subtitle: 'Speak. With words',
    sprite: c,
  });
  gwen = { actor, glow, target, x, y, baseY: p.y, armed: true, offering: false, state: 'idle' };
  play(actor, 'idle');
}

function play(actor, state) {
  if (!actor) return;
  const sheet = actor.sheets[state];
  actor.state = state;
  const apply = () => {
    if (actor.spr.destroyed || actor.state !== state || !sheet.frames.length) return;
    actor.spr.textures = sheet.frames;
    actor.spr.loop = true;
    actor.spr.gotoAndPlay(0);
  };
  if (sheet.ready()) apply();
  else {
    const wait = () => (sheet.ready() ? apply() : setTimeout(wait, 120));
    setTimeout(wait, 0);
  }
}

function drawArrow(engine) {
  const { PIXI } = engine;
  // The @1.5x file is its world size (js/textures.js); drawn a little smaller, like S1's.
  const [file] = ROOM_23_FILES.firebog_up_arrows;
  const sprite = new PIXI.Sprite(textureFromUrl(`${ROOM_23_ART_ROOT}${file}`));
  sprite.anchor.set(0.5, 1);
  sprite.scale.set(0.8);
  const p = toScreen(ROOM_23.arrow.x, ROOM_23.arrow.y);
  sprite.x = p.x;
  sprite.y = p.y;
  sprite.alpha = 0.55;
  sprite.eventMode = 'none';
  arrow = add(engine, sprite, -5);
}

/* ------------------------------------------------------------------ */
/* The Greeterbot                                                       */
/* ------------------------------------------------------------------ */

function giveCurrants(engine, amount) {
  engine.pc.currants = Math.max(0, (Number(engine.pc.currants) || 0) + amount);
  const p = engine.player;
  if (p) engine.floatText(p.x, p.y - 100, `${amount > 0 ? '+' : ''}${amount} currants`, amount > 0 ? '#ffe08a' : '#ffffff');
  engine.updateHud?.();
  engine.save();
}

/** teleportToLocationDelayed('LTJ10M515812V0C', 102, -534): out to Corridor Five. */
async function teleportOut(engine, why) {
  if (teleporting) return;
  teleporting = true;
  last = `teleport:${why}`;
  if (greeter) greeter.state = 'teleport';
  setData(engine);
  try {
    engine.playSound?.('TELEPORT_AWAY', { volume: 0.5 });
    await engine.enter(TELEPORT_OUT.tsid, { spawnX: TELEPORT_OUT.x - C5.l, spawnY: TELEPORT_OUT.y - C5.t });
    engine.save();
  } finally {
    teleporting = false;
  }
}

/** One scripted conversation (single-button beats) with the Greeterbot. */
function converse(engine, beats, onDone, extra = {}) {
  engine.scriptedDialogue?.({
    title: TITLE,
    kicker: GREETERBOT_LABEL,
    beats: beats.map((b) => ({ text: b.text, response: b.button })),
    onComplete: onDone,
    ...extra,
  });
}

/** The end of a script: the paid-out teleport, or the lead to x 1250. */
function finishScript(engine, script) {
  const pay = script.beats.reduce((n, b) => n + (b.currants || 0), 0);
  if (script.end === 'teleport') {
    if (pay) giveCurrants(engine, pay);
    teleportOut(engine, greeter?.opening || 'greeter');
    return;
  }
  if (script.end === 'lead-on') startLead(engine);
}

function startLead(engine) {
  if (!greeter) return;
  greeter.path = leadPath().slice(1);
  greeter.state = 'leading';
  last = 'lead';
  setData(engine);
}

/** The paid repeat: 'out-of-touch' asks, with "I'll do it!" and "Too rich for my blood." (on_cancel). */
function askRepeat(engine) {
  const ask = GREETER_LINES['out-of-touch'];
  engine.scriptedDialogue?.({
    title: TITLE,
    kicker: GREETERBOT_LABEL,
    beats: [{ text: ask[0], response: ask[1] }],
    cancelable: true,
    primaryLabel: ask[1],
    cancelLabel: REPEAT_DECLINE,
    onComplete: () => {
      const canPay = (Number(engine.pc.currants) || 0) >= REPEAT_COST;
      if (canPay) {
        clearChainForRepeat(engine.questState);
        save.repeatPaid = true;
        giveCurrants(engine, -REPEAT_COST);
        if (greeter) greeter.state = 'repeat_paid';
        last = 'repeat_paid';
      }
      const script = greeterScript('go-again', { canPay });
      converse(engine, script.beats, () => finishScript(engine, script));
    },
    onCancel: () => {
      const script = greeterScript('take-currants');
      converse(engine, script.beats, () => finishScript(engine, script));
    },
  });
}

/** npc_widget onPlayerCollision: the opening by level and quest state, once a visit. */
export function greet(engine) {
  if (!greeter || greeter.state !== 'waiting') return false;
  const opening = greeterOpening(engine.questState, engine.pc.level);
  greeter.opening = opening;
  greeter.state = 'talking';
  save.greetings += 1;
  last = `greet:${opening}`;
  // instances_schedule_exit_prompt('tower_quest', 2*60).
  exitAt = Date.now() + EXIT_PROMPT_MS;
  faceGreeter(engine);
  setData(engine);
  if (opening === 'done') {
    const script = greeterScript('done');
    // Stop before 'out-of-touch': its two buttons are their own dialogue.
    converse(engine, script.beats.slice(0, 2), () => askRepeat(engine));
    return true;
  }
  const script = greeterScript(opening);
  converse(engine, script.beats, () => finishScript(engine, script));
  return true;
}

function faceGreeter(engine) {
  const p = engine.player;
  if (!greeter || !p) return;
  const sx = toScreen(greeter.x, 0).x;
  // The widget art faces left; mirror it when you stand to its right.
  greeter.sprite.scale.x = Math.abs(greeter.sprite.scale.x) * (p.x > sx ? -1 : 1);
}

function stepGreeter(engine, dtMs, now) {
  if (!greeter || greeter.sprite.destroyed) return;
  if (greeter.state === 'leading' && greeter.path.length) {
    const to = greeter.path[0];
    const step = (LEAD_SPEED * dtMs) / 1000;
    const dx = to.x - greeter.x;
    const dy = to.y - greeter.y;
    const d = Math.hypot(dx, dy);
    if (d <= step) {
      greeter.x = to.x;
      greeter.y = to.y;
      greeter.path.shift();
      if (!greeter.path.length) {
        // stopPathing: sendPlayerOn.
        greeter.state = 'led';
        greeter.sendOn = true;
        last = 'led';
        setData(engine);
      }
    } else {
      greeter.x += (dx / d) * step;
      greeter.y += (dy / d) * step;
    }
    greeter.sprite.scale.x = Math.abs(greeter.sprite.scale.x) * (dx > 0 ? -1 : 1);
  }
  const p = toScreen(greeter.x, greeter.y - ROOM_23.greeter.hover);
  greeter.sprite.x = p.x;
  greeter.sprite.y = p.y + Math.sin(now / 420) * 4;
}

/* ------------------------------------------------------------------ */
/* Gwendolyn                                                            */
/* ------------------------------------------------------------------ */

/**
 * G313: pc.repeatingTower (npc_widget.js 376) lasts until part3repeat is done
 * (tower_quest_part3repeat.js onComplete_custom 54), so a repeat that fails
 * (location.js 443-456 removes the chain) is offered again without paying twice.
 */
function repeatPaid(qs) {
  if (save.repeatPaid && (qs?.completed || []).includes(PART3_REPEAT)) save.repeatPaid = false;
  return save.repeatPaid;
}

/** npc_gwendolyn onPlayerCollision -> offerQuests (tower_quest), unless part 3 is done. */
export function offerTask(engine) {
  if (!gwen || gwen.offering) return false;
  const qs = engine.questState;
  if (!gwendolynOffers(qs, { repeatPaid: repeatPaid(qs) })) {
    gwen.state = 'quiet';
    setData(engine);
    return false;
  }
  const card = npcQuestOffers(qs, 'npc_gwendolyn', engine.pc, questCtx(engine)).offered.find((c) => c.classTsid === TASK);
  if (!card) {
    gwen.state = 'quiet';
    setData(engine);
    return false;
  }
  gwen.offering = true;
  gwen.state = 'offering';
  last = 'offer';
  play(gwen.actor, 'talk');
  setData(engine);
  const done = (state) => {
    if (!gwen) return;
    gwen.offering = false;
    gwen.state = state;
    last = state;
    // resumeIdling after 3000 ms.
    setTimeout(() => { if (gwen && !gwen.actor.spr.destroyed) play(gwen.actor, 'idle'); }, 3000);
    setData(engine);
  };
  engine.offerQuestDialogue({
    title: card.def.title,
    kicker: GWENDOLYN_LABEL,
    beats: card.beats,
    acceptLabel: card.acceptLabel,
    declineLabel: card.declineLabel,
    onAccept: () => {
      const res = acceptOffer(engine.questState, TASK, questCtx(engine));
      if (res.ok) {
        exitAt = 0;
        // tower_quest.js onAccepted 38-39: instances_cancel_exit_prompt('tower_quest').
        cancelExitPrompt(engine);
        engine.pushActivity(`New quest: ${card.def.title}`);
        engine.updateHud?.();
        engine.save();
      }
      done(res.ok ? 'accepted' : 'declined');
    },
    onDecline: () => {
      declineOffer(engine.questState, TASK, Date.now(), { source: 'npc' });
      done('declined');
    },
  });
  return true;
}

function stepGwendolyn(now) {
  if (!gwen || gwen.actor.c.destroyed) return;
  gwen.actor.c.y = gwen.baseY + Math.sin(now / 1100) * 4;
  gwen.glow.alpha = 0.8 + Math.sin(now / 900) * 0.2;
}

/* ------------------------------------------------------------------ */
/* Collisions and the exit prompt                                       */
/* ------------------------------------------------------------------ */

const near = (engine, x, y) => {
  const p = engine.player;
  if (!p) return false;
  const s = toScreen(x, y);
  return Math.abs(p.x - s.x) <= HIT_HALF && Math.abs(p.y - s.y) <= HIT_HALF;
};

/**
 * G304: instances_show_exit_prompt (inc_instances.js 322-344) is a prompts_add
 * (icon_buttons, no timeout, not modal): it joins the bottom-right prompt
 * stack with a check and an X, and the room goes on under it.
 */
function exitPrompt(engine) {
  exitAt = 0;
  last = 'exit_prompt';
  cancelExitPrompt(engine);
  exitUid = engine.prompt?.({
    text: EXIT_PROMPT.text,
    iconButtons: true,
    choices: [{ value: 'yes', label: EXIT_PROMPT.yes }, { value: 'no', label: EXIT_PROMPT.no }],
    onChoice: async (value) => {
      exitUid = '';
      if (value !== 'yes') {
        // instances_exit_via_prompt 'no': ask again in 2 * 60.
        exitAt = Date.now() + EXIT_PROMPT_MS;
        return;
      }
      // instances_exit_via_prompt 'yes': back where you came in (Corridor Five, at Room 23's door).
      teleporting = true;
      last = 'exit';
      try {
        await engine.enter(TELEPORT_OUT.tsid, { spawnX: ROOM_23_DOOR.x - C5.l, spawnY: ROOM_23_DOOR.y - C5.t });
        engine.save();
      } finally {
        teleporting = false;
      }
    },
  }) || '';
}

function check(engine, now) {
  if (!engine.player || now - enteredAt < ARRIVAL_GRACE_MS || !free(engine)) return;
  if (greeter) {
    if (greeter.state === 'waiting' && near(engine, greeter.x, greeter.y)) {
      greet(engine);
      return;
    }
    if (greeter.state === 'led' && greeter.sendOn && near(engine, greeter.x, greeter.y)) {
      greeter.sendOn = false;
      greeter.state = 'sent';
      last = 'go-right';
      faceGreeter(engine);
      const [text, button] = GREETER_LINES['go-right'];
      converse(engine, [{ text, button }], () => {});
      setData(engine);
      return;
    }
  }
  if (gwen) {
    const close = near(engine, gwen.x, gwen.y);
    if (close && gwen.armed && !gwen.offering) {
      gwen.armed = false;
      offerTask(engine);
      return;
    }
    if (!close) gwen.armed = true;
  }
  if (exitAt && now >= exitAt) exitPrompt(engine);
}

/* ------------------------------------------------------------------ */
/* QA                                                                   */
/* ------------------------------------------------------------------ */

/** &room23demo=first|repeat|young sets up the quest log and level for the three openings. */
function applyDemo(engine) {
  const mode = engine.param('room23demo');
  if (!mode) return;
  const qs = engine.questState;
  const pc = engine.pc;
  if (mode === 'first' || mode === 'repeat') {
    if ((Number(pc.level) || 1) < MIN_LEVEL) {
      pc.xp = Math.max(Number(pc.xp) || 0, XP_FOR_LEVEL[MIN_LEVEL - 2]);
      pc.level = MIN_LEVEL;
    }
    clearChainForRepeat(qs);
    qs.completed = (qs.completed || []).filter((id) => id !== PART3);
    if (qs.offers?.declined) delete qs.offers.declined[TASK];
    save.repeatPaid = false;
    if (mode === 'repeat') {
      for (const id of [TASK, PART2, PART3]) if (!qs.completed.includes(id)) qs.completed.push(id);
      pc.currants = Math.max(Number(pc.currants) || 0, 200);
    }
  }
  engine.updateHud?.();
}

/* ------------------------------------------------------------------ */
/* Feature                                                              */
/* ------------------------------------------------------------------ */

let demoApplied = false;

export const gwendolynRoom23Feature = {
  id: GWENDOLYN_ROOM_23_FEATURE_ID,

  save() {
    return { v: 1, repeatPaid: save.repeatPaid === true, greetings: save.greetings || 0 };
  },

  restore(slice) {
    save = { v: 1, repeatPaid: slice?.repeatPaid === true, greetings: Number(slice?.greetings) || 0 };
  },

  /**
   * G363: Room 23 is a tower_quest instance (npc_widget.js 423, 431 and 499 check
   * container.isInstance('tower_quest')), and getLoadingInfo sends an instance no
   * hub_name (location.js 3311): the loading card and location bar show no hub line.
   */
  labelFor(tsid) {
    return isRoom23(tsid) ? { street: 'Room 23', hub: '', hubId: '79' } : null;
  },

  prepareStreet(street) {
    if (isRoom23(street?.tsid)) street.hubName = '';
  },

  /** Indoors like the tower rooms: nothing archived, so no animals, apples, Musicblocks or quoins. */
  ecologyOverride(street) {
    if (!isRoom23(street?.tsid)) return null;
    return { label: 'Room 23', sourceTsid: ROOM_23_SOURCE_TSID, counts: {}, interior: true, quoins: 0 };
  },

  onStreetEnter(street, engine) {
    clear(engine);
    teleporting = false;
    const inRoom = street?.tsid === ROOM_23_TSID;
    engine.setData('room23', inRoom ? ROOM_23_TSID : '');
    if (!inRoom) {
      setData(engine);
      return;
    }
    if (!demoApplied) {
      demoApplied = true;
      applyDemo(engine);
    }
    enteredAt = Date.now();
    last = 'arrived';
    drawArrow(engine);
    drawGreeter(engine);
    drawGwendolyn(engine);
    setData(engine);
  },

  onStreetClear(engine) {
    clear(engine);
  },

  onTick(dtMs, now, engine) {
    if (!greeter && !gwen) return;
    stepGreeter(engine, dtMs, now);
    stepGwendolyn(now);
    if (arrow && !arrow.destroyed) arrow.alpha = 0.4 + 0.2 * Math.sin(now / 700);
    if (now - lastCheck < CHECK_MS) return;
    lastCheck = now;
    check(engine, now);
    if (exitAt) engine.setData('room23ExitIn', Math.max(0, Math.round((exitAt - Date.now()) / 1000)));
  },

  /**
   * Both talk_to verbs are hidden in the source (npc_widget.js 211: talk_to returns
   * state null off the dev server; npc_gwendolyn.js 184-187 always): the bot and
   * the ghost talk on collision. The remake keeps Talk to as a shortcut while it
   * would do what the collision does (tooltips: npc_quest_giver_widget.js 188,
   * npc_gwendolyn.js 182) and hides it, as state null does, when it would not:
   * no disabled reason of our own (G318).
   */
  verbsFor(target, engine) {
    if (greeter && target === greeter.target) {
      if (greeter.state !== 'waiting') return [];
      return [{ id: 'talk_to', label: 'Talk to', sort: 50, tooltip: 'Listen to what they have to say', enabled: true, durationMs: 0 }];
    }
    if (gwen && target === gwen.target) {
      const can = !gwen.offering && gwendolynOffers(engine?.questState, { repeatPaid: repeatPaid(engine?.questState) });
      if (!can) return [];
      return [{ id: 'talk_to', label: 'Talk to', sort: 50, tooltip: 'Speak. With words', enabled: true, durationMs: 0 }];
    }
    return null;
  },

  runVerb(target, verbId, engine) {
    if (greeter && target === greeter.target) {
      if (verbId === 'talk_to') greet(engine);
      return true;
    }
    if (gwen && target === gwen.target) {
      if (verbId === 'talk_to') offerTask(engine);
      return true;
    }
    return false;
  },

  /** QA / tests. */
  _state() {
    return {
      greeter: greeter ? { x: greeter.x, y: greeter.y, state: greeter.state, opening: greeter.opening, path: greeter.path.length } : null,
      gwen: gwen ? { x: gwen.x, y: gwen.y, state: gwen.state, armed: gwen.armed } : null,
      exitAt,
      last,
      save: { ...save },
    };
  },
};
