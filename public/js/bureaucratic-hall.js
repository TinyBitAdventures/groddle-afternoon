/**
 * The Bureaucratic Hall: the room, and the bureaucrats' greeting, waiting
 * area, Please Wait and help, shared by every hall (features/bureaucratic-halls-feature.js)
 * and by Legalize It's hall (game.js spawnLegalizeHall), so there is one flow.
 *
 * Source (glitch-GameServerJS, CC0):
 * - locations/location.js 1076-1094 hitbox bureaucratic_hall_entered: unless
 *   already started, the nearest free bureaucrat greets you (greetPlayer).
 * - items/npc_bureaucrat.js greeting_onEnter/onMsg 386-465: it walks to
 *   max(pc.x + 100, 384), says "<b>name</b>! We will be with you as soon as
 *   possible. Now please go and wait." (OK); the answer (or closing it) flags
 *   you as waiting and prompts "Please move into the waiting area to your
 *   right." when pc.x < -220, else "... to your left.", then it walks back.
 * - location.js 1096-1138 hitbox waiting_area, only while flagged waiting:
 *   the prompt goes; with the Card-Carrying Qualification badge and no
 *   Bureaucratic Arts I, a 10 s prompt and a bureaucrat helps at once;
 *   otherwise buffs_apply('please_wait'). The flag is cleared either way.
 * - items/catalog_buffs.js 1644-1665 please_wait: 10 s, "Do not move: just
 *   wait."; when it runs out (10 s after it started) the nearest free
 *   bureaucrat helps you (helpPlayer).
 * - players/player.js 1834, 1886-1904: any message but chat, buff ticks,
 *   conversation and prompt choices (and a move_xy that moved) removes the
 *   buff and prompts "You can't do anything while waiting. Just wait!"
 *   (timeout 3, OK); the prompt's callback (players/inc_prompts.js 282-287
 *   prompts_buff_callback) applies the buff again, so the wait starts over.
 * - npc_bureaucrat.js helping_onEnter/onMsg 467-711: the helper walks to
 *   min(450, max(pc.x + 100, one of -205/-105/-5/95)), stopping once it is
 *   within 150 px right of you (and left of 450). At step 1 it calls you
 *   (responses.helping_ready) and reminds you every 8 s (helping_reminder)
 *   until you talk to it; a card holder without Bureaucratic Arts is sent
 *   away. Talk to (verbs.talk_to 182-216, only while it helps you): the
 *   getItems list (store 17) and Nevermind. An item: purchasing_step1 names
 *   another free bureaucrat (getRandomBureaucrat, the first free one); OK and
 *   that one comes over and asks purchasing_step2 (YES), then a random
 *   question (getRandomQuestion); any answer has a 40% chance of a further
 *   transfer (purchasing_step3), else purchasing_confirm: Pay N / Nevermind.
 *   Paying gives the item and showEndPrompt ("Thank you for your business.
 *   To conduct another transaction, you must exit and re-enter the Hall.");
 *   so does Nevermind or closing the conversation.
 * - location.js 810-819: leaving the hall clears all of it and the buff.
 * - npc_bureaucrat.js idle_onMsg 733-745: an idle bureaucrat in a hall has a
 *   25% chance each interval of strolling to x 500-1060 at 20-40 px/s, else
 *   it may turn round; the next interval is 1-10 s away.
 * - npc_bureaucrat.js walks at npc_walk_speed 60 when greeting or helping
 *   (returnToStart's 75 is overwritten by the next pathing start, 60).
 *
 * The room (ours, from Tiny Speck's art): the hall's location XML is not in
 * the locations dump, but its bundle bldg_int_bhall.swf is, with the whole
 * backdrop bureaucratic_hall_bg (stage 2212 x 700): a desk room on the left,
 * the waiting wall with six orange chairs (and one tipped over), and the
 * counter opening on the right. It is drawn 1:1 with the hall's x centred on
 * the backdrop (stage x = hall x + 1106), which puts the source's numbers
 * where the art expects them: the door arrival (-857) in the desk room, the
 * -220 left/right line among the chairs, the greeting point (384) and the
 * helpers' limit (450) just left of the counter, and the bureaucrats' stroll
 * (500-1060) behind it. The floor is the source's path height, y -128, at
 * 700 - 128 = 572. The two hitboxes are lost: ours are the desk room (you
 * are greeted on arrival) and the stretch of floor in front of the chairs.
 * Where the signs hang is ours too (no placement survives).
 */

export const BUREAUCRAT_CLASS = 'npc_bureaucrat';
export const PLEASE_WAIT_BUFF = 'please_wait';
export const PLEASE_WAIT_MS = 10_000; // catalog_buffs.js please_wait duration 10
export const REMINDER_MS = 8_000; // helping_reminder every 8000 ms
export const HANDOFF_CHANCE = 0.4; // is_chance(0.4) after the random question
export const WALK_SPEED = 60; // npc_walk_speed while greeting / helping
export const TALK_VERB = 'talk_to';

/** Backdrop stage size and the hall's x origin on it (see the header). */
export const HALL = Object.freeze({ width: 2212, height: 700, ground: 572, originX: 1106 });
/** A source hall x on the backdrop. */
export const hallX = (sourceX) => Math.round(Number(sourceX) + HALL.originX);

export const HALL_LAYOUT = Object.freeze({
  /** Door connect arrival (-857, -153) from the street doors (door.connect, hub 69). */
  arrival: Object.freeze({ x: hallX(-857), y: HALL.height - 153 }),
  /** The glass doors on the desk room's side wall (ours). */
  exitX: 72,
  /** bureaucratic_hall_entered (ours): the desk room, left of the partition at x 625. */
  enteredBox: Object.freeze([0, 625]),
  /** waiting_area (ours): the floor in front of the chairs (backdrop x 647-1233). */
  waitingArea: Object.freeze([647, 1233]),
  /** npc_bureaucrat.js 433: left of -220 you are sent right, else left. */
  waitingLine: hallX(-220),
  /** greeting_onEnter: max(pc.x + 100, 384). */
  greetMin: hallX(384),
  /** helping_onEnter: min(450, ...); pathing_check stops left of 450. */
  helpMax: hallX(450),
  helpPoints: Object.freeze([-205, -105, -5, 95].map(hallX)),
  /** idle_onMsg: randInt(500, 1060). */
  stroll: Object.freeze([hallX(500), hallX(1060)]),
  /** The counter's left end (ours, just right of the helpers' limit). */
  counterLeft: hallX(454),
  /** Where the four bureaucrats start, behind the counter (ours, inside the stroll). */
  clerkHomes: Object.freeze([1640, 1810, 1980, 2150]),
  /** Behind the counter the bureaucrats stand a little further back (ours). */
  clerkBackY: 538,
});

/** items/npc_bureaucrat.js getLabel: titles and names (instances without a label prop). */
export const BUREAUCRAT_TITLES = Object.freeze(['Prefect', 'Chamberlain', 'Deputy', 'Secretary', 'Assistant', 'Associate', 'Representative', 'Magister', 'Manager', 'Director', 'Overseer', 'Administrator', 'Probost']);
export const BUREAUCRAT_NAMES = Object.freeze(['Smithe', 'Wigglesbottom', 'Apfer', 'Naraiwaddleappali', 'Snifflenose', 'Sharpburger', 'Tummyford', 'Piksnixson', 'Nuter', 'Innifekki', 'Candnot', 'Chucklesmouth', 'Earwick']);

export const HALL_TEXT = Object.freeze({
  greeting: (label) => `<b>${label}</b>! We will be with you as soon as possible. Now please go and wait.`,
  waitRight: 'Please move into the waiting area to your right.',
  waitLeft: 'Please move into the waiting area to your left.',
  cardNoSkill: 'You have not learned any of Bureaucratic Arts and already have a Card-Carrying Qualification: the Bureaucrats have nothing for you.',
  justWait: "You can't do anything while waiting. Just wait!",
  goAway: (label) => `Go away, <b>${label}</b>, we don't have time to waste on people who have not learned any Bureaucratic Arts.`,
  approach: 'Please approach the counter for assistance.',
  talkTooltip: 'Attempt what is likely to be a maddening conversation',
  itemsIntro: 'The following items are available to you:',
  noOne: 'Hmmm. It seems no one is able to help you with this. Please come back another time.',
  lips: "Hmmm. I see your lips moving, but I don't understand the words. Maybe come back another time?",
  broke: "Oops, you don't have enough for that. Come back when you do.",
  noRoom: "Oops, you don't have enough space in your inventory. Come back when you do.",
  endPrompt: 'Thank you for your business. To conduct another transaction, you must exit and re-enter the Hall.',
});

/** items/npc_bureaucrat.js var responses (word for word). */
export const HALL_RESPONSES = Object.freeze({
  helping_ready: Object.freeze([
    '{pc_label}! Your turn!',
    '{pc_label}! You’re up!',
    'NEXT, {pc_label}!',
    '{pc_label}! Come forward!',
    '{pc_label}! Step up',
    'Ready for you now, {pc_label}!',
    'Attention, {pc_label}! When you’re ready?',
    'Who’s Next? {pc_label}? Is {pc_label} here?',
    '{pc_label}! Ready for you now!',
  ]),
  helping_reminder: Object.freeze([
    '{pc_label}! It is now your turn. Come speak to me, or you will lose your turn.',
    '{pc_label}! Either come to the counter, or go to the back of the line.',
    'I haven’t got all day, {pc_label}! You can take your turn, or someone else can take theirs.',
    'Did you want something, {pc_label}? Now is your chance. Use it or lose it.',
    '{pc_label}! Come and speak to me now, if you please. Time is currants, {pc_label}!',
    '{pc_label}! Do you want to be seen today or not, {pc_label}? Come speak to me if you do.',
    'Time’s a’wasting, {pc_label}! Come speak to me or lose your place in line.',
    '{pc_label}! If you want your documentation, you need to come speak to me.',
    'Did you hear me, {pc_label}? Come take your turn, or lose your turn. Your choice.',
  ]),
  purchasing_confirm: Object.freeze([
    'Very well. The fee is {item_cost}. We only accept cash.',
    'Acceptable. The fee is {item_cost}. Cash up front, please.',
    'That will do. Your fee is {item_cost}. Cash only.',
    'Excellent. The bureau charges {item_cost}. Cash only, I’m afraid.',
    'Very well. In that case, the fee is {item_cost}, and we only take cash.',
    'I’ll take that. The fee is {item_cost}, and I’ll take that, as well. In cash.',
  ]),
  purchasing_step1: Object.freeze([
    '{pc_label}, as I understand, you are requesting {item_label}. You will have to speak to {bureaucrat_name} about that. Please wait a moment.',
    'I understand you’re hoping to attain {item_label}, {pc_label}. That’s a matter for {bureaucrat_name}. Let me find out if they’re in the office this week.',
    'So you’re requesting {item_label} are you, {pc_label}? {bureaucrat_name} is the official you need to speak to. Please bear with me a moment.',
    '{pc_label}, your request for {item_label} will have to be passed along to the correct department. Please wait while I ascertain the availability of – {bureaucrat_name}.',
    '{pc_label}? If you are seeking {item_label}, you must speak to {bureaucrat_name}. Please wait while I see if they’re taking appointments today.',
    'You wish to be granted {item_label} I understand, {pc_label}. That is a decision for {bureaucrat_name}, if they’re in today. Bear with me please…',
  ]),
  purchasing_step2: Object.freeze([
    'Let’s see here… You are interested in obtaining {item_label}, correct?',
    'I understand you’re here to procure yourself {item_label}, is that right?',
    'What’s this, then? You’re hoping to acquire {item_label}, correct?',
    'I’m led to believe you’re interested in receiving {item_label}, is that correct?',
    'What do we have here, then?… I see. So, it’s {item_label} you’re after, is it?',
    'Right then, let’s see… You’re here hoping to procure {item_label}, are you?',
  ]),
  purchasing_step3: Object.freeze([
    'I see. Perhaps you’d better talk to {bureaucrat_name} about this.',
    'Interesting. Perhaps you’d better talk to {bureaucrat_name} about this.',
    'Ah. In that case, you’ll need to speak with {bureaucrat_name}, this is outside my remit now.',
    'I see. It seems you’d be better off speaking to {bureaucrat_name} about this after all.',
    'Right. In that case, I think you’d better go speak to {bureaucrat_name} on this matter.',
    'Interesting. I believe the department you’re looking for is that of {bureaucrat_name}. Good day.',
  ]),
});

const q = (txt, options) => Object.freeze({ txt, options: Object.freeze(options) });
/** npc_bureaucrat.js getRandomQuestion (word for word, in order). */
export const HALL_QUESTIONS = Object.freeze([
  q('I may be able to help you with that. But first, favorite colour?', ['Blue', 'Other']),
  q('That should be possible. But first, quick question: which number is better?', ['631', '11']),
  q('I may be able to help you with that. But first, which cloud is better?', ['Cirrus', 'Cumulonimbus']),
  q('I should think so, but first: Which is the superior number?', ['81', '19']),
  q('It sounds like the kind of thing I should be able to help with. First: Sandals or Flip-Flops?', ['Sandals', 'Flip-Flops']),
  q('I may be able to help. One question, though. Given the choice: Bowl or Plate?', ['Bowl', 'Plate']),
  q('I should be able to help with that. But first, favorite noise?', ['Duck', 'Not a Duck']),
  q('I may be able to help. Quick question first, though. Is it ever too late?', ['Yes', 'No']),
  q('I imagine we can help. One question first. Which came first?', ['The Chicken', 'The Grain']),
  q('I don’t see why not. But first, answer me this: Who let the dogs out?', ['A man called Graham', 'Someone else']),
  q('I may be able to sort that out for you. First: favorite colour?', ['Orange', 'Other']),
  q('I should think it possible. Before we sign off, quick question: Which is superior?', ['An apple', 'An orange']),
  q('It sounds I should be able to sign this off. First: Which is better?', ['Wool', 'Geometry']),
  q('I should be able to help you. First, however, answer me this. What time is love?', ['2pm', 'Before lunch']),
  q('Shouldn’t be a problem. Quick question first: Which colour is better?', ['Red', 'Taupe']),
  q('I may be able to assist you on this. But first, I have to ask you: which is optimal?', ['Hats', 'Salmon']),
  q('Sounds reasonable. Before we proceed, I must ask, which shelf-height do you prefer?', ['High shelves', 'Ankle-height shelves']),
  q('I don’t see why not. But first, one question. What’s my square root?', ['67?', 'I prefer not to say']),
  q('I may be able to help you out with this. First though, quick question. Which do you prefer?', ['Sailing', 'Ketchup']),
  q('That should be possible. First, however, can you just tell me your preferred shape?', ['Dodecahedron', 'Other']),
  q('I imagine I should be able to sign this off. Quick question though: which is the superior letter?', ['P', 'F']),
  q('I may be able to help you out. But first, which is better?', ['Laughter', 'Pants']),
  q('I think I can help you with this. One question first… Please choose between the following:', ['Daddy', 'Chips']),
  q('Sounds all in order. Answer me this first, please: What is the eminent shape?', ['Circle', 'Rectangle']),
  q('I may be able to help you with that. But first, please choose between the following:', ['Pirates', 'Ninjas']),
  q('That should be possible. Before we proceed, which number is preferable?', ['Six', 'Ninety-four']),
  q('I can’t see why not. One last thing before we proceed: which is the greater?', ['Antelopes', 'Capitalism']),
  q('It sounds like I may be able to help, but first, one more quick question:', ['Scrambled', 'Fried']),
  q('I should be able to help with that. First, however, one question:', ['Innie?', 'Outie?']),
  q('That might be within my jurisdiction. One final thing, which do you prefer?', ['Egg', 'Jasmine']),
  q('Sounds like something we can help with. Before that: your favourite shape?', ['Triangle', 'Dodecahedron']),
  q('I might be able to help with that. Before we proceed: which is superior?', ['Shelving', 'Polenta']),
  q('I may be prepared to sign this off. First, though: your favorite color?', ['Yellow', 'Black']),
  q('I should be able to rubber stamp this. Before that, though, your favorite color?', ['Purple', 'Not Purple']),
  q('This shouldn’t be a problem. One last question. Your favorite color?', ['Beige', 'Other']),
  q('I don’t see any issue with your application. But first, which do you prefer?', ['Velcro', 'Glory']),
  q('I may be able to deal with this. Final question, though, which number is better?', ['13', '44278']),
  q('It should be possible to sign this off. But one quick check, do you prefer:', ['Hairy hats', 'Other hats']),
  q('I may be able to do this for you. One quick question, though: which is better?', ['Logic', 'Swimming']),
  q('I might be able to help. One last thing: which is your preferred destination?', ['Ski Slopes', 'Cowboy Ranch']),
  q('I might be able to help with that. First though, which is superior?', ['Fast bus', 'Slow speedboat']),
  q('I may be able to help with that. One final question. Do you consider honey a dairy product?', ['Yes', 'No']),
  q('Shouldn’t be too much of a problem. Quick question first. Do you prefer:', ['Frozen bananas', 'A cornballer']),
  q('I should be able to help. But one final question before we do: Which is better?', ['Feathers', 'Gratitude']),
  q('Can’t see any issue with your application. One last thing. Your favourite fruit?', ['Lemon', 'Other']),
  q('I should be able to help. One last question: if bacon is wrong, do you want to be right?', ['No', 'The hypothesis is invalid']),
  q('I may be able to deal with this. Quick question, though. Does Sandy Claws exist?', ['Yes', 'No', 'Who?']),
  q('I can probably deal with your application. One final question, which is optimal?', ['Cake', 'Death']),
  q('I might be able to sign this off. One thing: Your favorite fruit?', ['Apples', 'Tomatoes']),
]);

/** Message types that leave Please Wait alone (players/player.js 1834 please_wait_ok_types). */
export const PLEASE_WAIT_OK = Object.freeze(['party_chat', 'groups_chat', 'local_chat', 'buff_tick', 'conversation_choice', 'buff_start', 'prompt_choice']);

/** catalog_stores.js store 17, in store order: class, label (name_single), cost. */
export const HALL_STORE = Object.freeze([
  Object.freeze({ classTsid: 'card_carrying_qualification', label: 'Card-Carrying Qualification', cost: 50 }),
  Object.freeze({ classTsid: 'your_papers', label: 'Your Papers', cost: 100 }),
  Object.freeze({ classTsid: 'general_building_permit', label: 'General Building Permit', cost: 500 }),
]);

/** npc_bureaucrat.js getItems: what the bureaucrats will deal in with you. */
export function hallItems(learned = [], achievements = []) {
  return HALL_STORE.filter((it) => {
    if (it.classTsid === 'card_carrying_qualification' && achievements.includes('card_carrying_qualification')) return false;
    if (it.classTsid !== 'card_carrying_qualification' && !learned.includes('bureaucraticarts_1')) return false;
    if (it.classTsid === 'general_building_permit' && !learned.includes('bureaucraticarts_2')) return false;
    return true;
  });
}

/** Fill a response's tokens. step1/step2 say "a <b>X</b>" unless the label starts "Your"; confirm says "<b>X</b>". */
export function fillHallText(text, { pcLabel = '', item = null, bureaucrat = '', article = false } = {}) {
  let out = String(text || '');
  if (item) {
    const label = `<b>${item.label}</b>`;
    out = out.replace(/{item_label}/g, article && item.label.substring(0, 4) !== 'Your' ? `a ${label}` : label);
    out = out.replace(/{item_cost}/g, `<b>${item.cost}</b>`);
  }
  if (bureaucrat) out = out.replace(/{bureaucrat_name}/g, `<b>${bureaucrat}</b>`);
  return out.replace(/{pc_label}/g, pcLabel);
}

/** Which way the greeting's prompt sends you (npc_bureaucrat.js 433-438). */
export function waitPromptFor(playerX) {
  return Number(playerX) < HALL_LAYOUT.waitingLine ? HALL_TEXT.waitRight : HALL_TEXT.waitLeft;
}

export const inWaitingArea = (x) => x >= HALL_LAYOUT.waitingArea[0] && x <= HALL_LAYOUT.waitingArea[1];
export const inEnteredBox = (x) => x >= HALL_LAYOUT.enteredBox[0] && x <= HALL_LAYOUT.enteredBox[1];

/** Behind the counter a bureaucrat stands at the back line; out on the floor, at the floor (ours). */
export function clerkYAt(x) {
  const edge = HALL_LAYOUT.counterLeft;
  const t = Math.max(0, Math.min(1, (x - (edge - 60)) / 60));
  return Math.round(HALL.ground + (HALL_LAYOUT.clerkBackY - HALL.ground) * t);
}
export const clerkBehindCounter = (x) => x > HALL_LAYOUT.counterLeft - 30;

const pick = (list, rng) => list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
const randInt = (a, b, rng) => a + Math.floor(rng() * (b - a + 1));

/**
 * One hall visit. `host` draws and asks (see features/bureaucratic-halls-feature.js
 * hallHost); `script` (Legalize It) may fix the random picks and hear each step:
 *   pick(kind, list) -> index; question() -> index into HALL_QUESTIONS;
 *   handoff() -> bool; helperFor(reason) -> clerk index; onHelp(i, step);
 *   onTalk(i); onItem(classTsid); onAnswer(index); onPurchase(item) -> result | null;
 *   onEnd(bought).
 * host: now(), player() {x, y}, pcLabel(), clerkCount, clerkLabel(i), drawClerk(i, pose),
 *   say(i, text), converse(i, { text, choices }) -> Promise<value|null>,
 *   prompt({ text, timeout, timeoutValue, onChoice }) -> uid, removePrompt(uid),
 *   applyBuff(), removeBuff(), acting(), learned(), achievements(), currants(),
 *   buy(item) -> 'ok' | 'broke' | 'room', activity(text), setData(key, value), rng().
 */
export function createHallFlow(host, { script = null, start = null } = {}) {
  const rng = () => (typeof host.rng === 'function' ? host.rng() : Math.random());
  const now = () => host.now();
  const L = HALL_LAYOUT;
  const clerks = [];
  for (let i = 0; i < host.clerkCount; i++) {
    const x = L.clerkHomes[i % L.clerkHomes.length];
    clerks.push({ i, x, dir: 'left', state: 'idle', anim: 'idle', target: null, speed: 0, nextAt: now() + 1000, home: null, willHelp: false, talkUntil: 0 });
  }
  const v = {
    started: false, // pc['!bureaucracy_started']
    waiting: false, // pc['!bureaucracy_waiting']
    waitPrompt: '', // pc['!bureaucracy_waiting_prompt']
    step: 0, // pc['!bureaucracy_step']
    item: null, // pc['!bureaucracy_item']
    helperIndex: -1, // pc['!bureaucracy_helper']
    greeter: -1,
    helping: -1, // the bureaucrat in its helping state for you
    helpingStarted: false,
    buffAt: 0, // please_wait args.start
    buffOn: false,
    lastPos: null,
    refusals: 0,
    refusing: false,
    conversing: false,
    done: false,
    ended: false,
    phase: 'arrived',
    last: '',
  };
  if (start === 'done') {
    v.started = true;
    v.done = true;
    v.phase = 'done';
  }

  const label = (i) => host.clerkLabel(i);
  const pcLabel = () => host.pcLabel();
  const isBusy = (c) => c.state !== 'idle' || c.willHelp;
  const respond = (kind, extra = {}) => {
    const list = HALL_RESPONSES[kind];
    const idx = script?.pick ? script.pick(kind, list) : null;
    const text = Number.isInteger(idx) ? list[idx] : pick(list, rng);
    return fillHallText(text, { pcLabel: pcLabel(), ...extra });
  };
  const publish = () => {
    host.setData?.('hallFlow', v.phase);
    host.setData?.('hallStep', String(v.step));
    host.setData?.('hallHelper', String(v.helping));
    host.setData?.('hallBuff', v.buffOn ? '1' : '0');
    host.setData?.('hallRefusals', String(v.refusals));
    host.setData?.('hallLast', v.last);
    host.setData?.('hallClerks', clerks.map((c) => `${c.state[0]}${Math.round(c.x)}`).join(','));
  };
  const setPhase = (phase, last = '') => {
    v.phase = phase;
    if (last) v.last = last;
    publish();
  };

  /** pc.findCloseStack(is_bureaucrat): the nearest free bureaucrat to you. */
  function nearestFree(reason) {
    if (script?.helperFor) {
      const i = script.helperFor(reason);
      if (Number.isInteger(i) && clerks[i] && !isBusy(clerks[i])) return clerks[i];
    }
    const px = host.player().x;
    let best = null;
    for (const c of clerks) if (!isBusy(c) && (!best || Math.abs(c.x - px) < Math.abs(best.x - px))) best = c;
    return best;
  }
  /** getRandomBureaucrat: the first free one in the room's item order. */
  function firstFree() {
    return clerks.find((c) => !isBusy(c)) || null;
  }

  function walk(c, x, speed = WALK_SPEED, anim = 'walk1') {
    c.target = Math.round(x);
    c.speed = speed;
    c.anim = anim;
  }
  function returnToStart(c) {
    if (!c.home) return;
    c.phase = 'return';
    walk(c, c.home, WALK_SPEED, c.state === 'helping' ? 'walk2' : 'walk1');
  }
  function face(c) {
    c.dir = host.player().x > c.x ? 'right' : 'left';
  }
  function talkAnim(c, ms = 5000) {
    c.anim = 'talk';
    c.talkUntil = now() + ms;
  }

  /** greetPlayer: left_from, then greeting_onEnter's walk. */
  function greet(c) {
    c.home = c.x;
    c.state = 'greeting';
    c.phase = 'go';
    v.greeter = c.i;
    walk(c, Math.max(host.player().x + 100, L.greetMin));
    setPhase('greeting', `greet:${c.i}`);
  }

  async function greetingArrived(c) {
    face(c);
    talkAnim(c, 6000);
    c.phase = 'talk';
    v.conversing = true;
    const answer = await host.converse(c.i, { text: HALL_TEXT.greeting(pcLabel()), choices: [{ label: 'OK', value: 'greeting-ok' }] });
    v.conversing = false;
    if (v.ended) return;
    // greeting_onMsg 427-447: OK or closing it flags you as waiting.
    if (answer === 'greeting-ok' || answer === null) {
      v.waiting = true;
      const text = waitPromptFor(host.player().x);
      v.waitPrompt = host.prompt({ text, choices: [{ label: 'OK', value: 'ok' }] }) || '';
      setPhase('go_wait', text === HALL_TEXT.waitRight ? 'wait:right' : 'wait:left');
    }
    returnToStart(c);
  }

  /** helpPlayer: left_from, then helping_onEnter's walk. */
  function help(c) {
    c.home = c.x;
    c.state = 'helping';
    c.phase = 'go';
    c.willHelp = false;
    v.helping = c.i;
    v.helpingStarted = false;
    const px = host.player().x;
    walk(c, Math.min(L.helpMax, Math.max(px + 100, pick(L.helpPoints, rng))), WALK_SPEED, 'walk2');
    script?.onHelp?.(c.i, v.step);
    setPhase('helped', `help:${c.i}:${v.step}`);
  }

  function endPrompt() {
    host.prompt({ text: HALL_TEXT.endPrompt, choices: [{ label: 'OK', value: 'ok' }], timeout: 10 });
  }

  /** The conversation's 'nevermind' / cancel: step cleared, the helper goes back, the end prompt. */
  function cancel(c, bought = false) {
    v.step = 0;
    v.helping = -1;
    c.willHelp = false;
    returnToStart(c);
    v.done = true;
    endPrompt();
    script?.onEnd?.(bought);
    setPhase('done', bought ? 'bought' : 'nevermind');
  }

  async function ask(c, text, choices) {
    face(c);
    talkAnim(c, 7000);
    v.conversing = true;
    const answer = await host.converse(c.i, { text, choices });
    v.conversing = false;
    return v.ended ? undefined : answer;
  }

  async function helpingArrived(c) {
    c.phase = 'talk';
    face(c);
    if (v.step > 1) {
      // helping_onMsg 504-515: the second bureaucrat asks at once.
      script?.onTalk?.(c.i);
      const text = respond('purchasing_step2', { item: v.item, article: true });
      const answer = await ask(c, text, [{ label: 'YES', value: 'yes' }]);
      if (answer === undefined) return;
      if (answer === 'yes') return question(c);
      return cancel(c);
    }
    if (host.achievements().includes('card_carrying_qualification') && !host.learned().includes('bureaucraticarts_1')) {
      const answer = await ask(c, HALL_TEXT.goAway(pcLabel()), [{ label: 'OK', value: 'nevermind' }]);
      if (answer === undefined) return;
      return cancel(c);
    }
    talkAnim(c, 3000);
    host.say(c.i, respond('helping_ready'));
    c.remindAt = now() + REMINDER_MS;
    setPhase('called', `ready:${c.i}`);
  }

  async function question(c) {
    const list = HALL_QUESTIONS;
    const idx = script?.question ? script.question() : Math.floor(rng() * list.length);
    const qn = list[Math.max(0, Math.min(list.length - 1, idx))];
    setPhase('question', `question:${idx}`);
    const answer = await ask(c, qn.txt, qn.options.map((o, k) => ({ label: o, value: `random-${k}` })));
    if (answer === undefined) return;
    if (!answer || !String(answer).startsWith('random-')) return cancel(c);
    script?.onAnswer?.(Number(String(answer).slice(7)));
    const handoff = script?.handoff ? script.handoff() : rng() < HANDOFF_CHANCE;
    if (handoff) {
      const next = firstFree();
      let text;
      if (next) {
        next.willHelp = true;
        v.helperIndex = next.i;
        text = respond('purchasing_step3', { bureaucrat: label(next.i) });
      } else text = HALL_TEXT.noOne;
      const ok = await ask(c, text, [{ label: 'OK', value: 'ok' }]);
      if (ok === undefined) return;
      return ok === 'ok' ? passOn(c) : cancel(c);
    }
    const text = respond('purchasing_confirm', { item: v.item });
    setPhase('confirm', 'confirm');
    const pay = await ask(c, text, [
      { label: `Pay ${v.item.cost}`, value: 'purchase' },
      { label: 'Nevermind', value: 'nevermind' },
    ]);
    if (pay === undefined) return;
    if (pay !== 'purchase') return cancel(c);
    const result = script?.onPurchase ? script.onPurchase(v.item) : host.buy(v.item);
    if (result === 'ok') return cancel(c, true);
    const sorry = await ask(c, result === 'room' ? HALL_TEXT.noRoom : HALL_TEXT.broke, [{ label: 'OK', value: 'nevermind' }]);
    if (sorry === undefined) return;
    return cancel(c);
  }

  /** choice 'ok' (helping_onMsg 541-552): next step, this one goes back, the named one comes over. */
  function passOn(c) {
    v.step += 1;
    v.helping = -1;
    c.willHelp = false;
    returnToStart(c);
    const next = clerks[v.helperIndex];
    if (next) help(next);
    else setPhase('stuck', 'no-helper');
  }

  /** verbs.talk_to: enabled only for the bureaucrat helping you, before any step. */
  function talkState(i) {
    const c = clerks[i];
    if (c && !v.step && c.state === 'helping' && v.helping === i && !v.conversing) return { enabled: true, reason: '' };
    return { enabled: false, reason: HALL_TEXT.approach };
  }

  async function talk(i) {
    const c = clerks[i];
    if (!talkState(i).enabled) return false;
    v.helpingStarted = true;
    script?.onTalk?.(i);
    const items = hallItems(host.learned(), host.achievements());
    setPhase('talking', `talk:${i}`);
    const choice = items.length
      ? await ask(c, HALL_TEXT.itemsIntro, [...items.map((it) => ({ label: `${it.label} (${it.cost}c)`, value: it.classTsid })), { label: 'Nevermind', value: 'nevermind' }])
      : await ask(c, HALL_TEXT.goAway(pcLabel()), [{ label: 'OK', value: 'nevermind' }]);
    if (choice === undefined) return true;
    const it = items.find((row) => row.classTsid === choice);
    if (!it) {
      cancel(c);
      return true;
    }
    if (!v.step) v.step = 1;
    v.item = it;
    script?.onItem?.(it.classTsid);
    const next = firstFree();
    let text = HALL_TEXT.noOne;
    if (next) {
      next.willHelp = true;
      v.helperIndex = next.i;
      text = respond('purchasing_step1', { item: it, article: true, bureaucrat: label(next.i) });
    }
    setPhase('handoff', `step1:${next ? next.i : -1}`);
    const ok = await ask(c, text, [{ label: 'OK', value: 'ok' }]);
    if (ok === undefined) return true;
    if (ok === 'ok') passOn(c);
    else cancel(c);
    return true;
  }

  function applyWait() {
    host.applyBuff();
    v.buffOn = true;
    v.buffAt = now();
    v.lastPos = null;
    v.refusing = false;
    setPhase('waiting', 'please_wait');
  }

  /** player.js 1886-1904: the buff goes, "Just wait!" (3 s), and its callback starts it again. */
  function interrupt(why) {
    if (!v.buffOn) return false;
    host.removeBuff();
    v.buffOn = false;
    v.refusing = true;
    v.refusals += 1;
    setPhase('refused', `refused:${why}`);
    host.prompt({
      text: HALL_TEXT.justWait,
      choices: [{ label: 'OK', value: 'ok' }],
      timeout: 3,
      timeoutValue: 'ok',
      onChoice: () => !v.ended && applyWait(),
      onTimeout: () => !v.ended && applyWait(),
    });
    return true;
  }

  function stepClerk(c, dtMs) {
    if (c.target == null) return false;
    const d = c.target - c.x;
    const stepPx = (c.speed * dtMs) / 1000;
    c.dir = d > 0 ? 'right' : d < 0 ? 'left' : c.dir;
    if (Math.abs(d) <= stepPx) {
      c.x = c.target;
      c.target = null;
      return true;
    }
    c.x += Math.sign(d) * stepPx;
    // helping pathing_check: stop once within 150 px right of you, left of 450.
    if (c.state === 'helping' && c.phase === 'go' && c.x <= host.player().x + 150 && c.x < L.helpMax) {
      c.target = null;
      return true;
    }
    return false;
  }

  function tickClerk(c, dtMs, t) {
    const arrived = stepClerk(c, dtMs);
    if (arrived) {
      if (c.phase === 'return') {
        // fsm_pop_stack: back to idle.
        c.state = 'idle';
        c.phase = '';
        c.anim = 'idle';
        c.nextAt = t + 1000;
      } else if (c.state === 'greeting' && c.phase === 'go') {
        c.anim = 'idle';
        greetingArrived(c);
      } else if (c.state === 'helping' && c.phase === 'go') {
        c.anim = 'idle';
        helpingArrived(c);
      } else if (c.state === 'idle') {
        c.anim = 'idle';
        c.nextAt = t + 1000;
      }
    }
    if (c.anim === 'talk' && c.talkUntil && t >= c.talkUntil) {
      c.anim = 'idle';
      c.talkUntil = 0;
    }
    if (c.state === 'helping' && c.phase === 'talk' && c.remindAt && !v.helpingStarted && t >= c.remindAt) {
      talkAnim(c, 3000);
      host.say(c.i, respond('helping_reminder'));
      c.remindAt = t + REMINDER_MS;
    }
    if (c.state === 'idle' && c.target == null && t >= c.nextAt) {
      // idle_onMsg interval: a stroll (25%), else maybe turn round.
      if (rng() < 0.25) walk(c, randInt(L.stroll[0], L.stroll[1], rng), randInt(20, 40, rng), 'walk1');
      else {
        if (rng() < 0.1) c.dir = c.dir === 'left' ? 'right' : 'left';
        c.nextAt = t + randInt(1000, 10000, rng);
      }
    }
    host.drawClerk(c.i, { x: c.x, y: clerkYAt(c.x), dir: c.dir, anim: c.target != null ? c.anim : c.anim === 'talk' ? 'talk' : 'idle', behind: clerkBehindCounter(c.x) });
  }

  return {
    get state() {
      return v;
    },
    clerks,
    talkState,
    talk,
    /** Every frame. */
    tick(dtMs) {
      if (v.ended) return;
      const t = now();
      const p = host.player();
      // bureaucratic_hall_entered.
      if (!v.started && inEnteredBox(p.x)) {
        const c = nearestFree('greet');
        if (c) {
          v.started = true;
          greet(c);
        }
      }
      // waiting_area (only while flagged waiting).
      if (v.waiting && inWaitingArea(p.x)) {
        v.waiting = false;
        if (v.waitPrompt) host.removePrompt?.(v.waitPrompt);
        v.waitPrompt = '';
        if (host.achievements().includes('card_carrying_qualification') && !host.learned().includes('bureaucraticarts_1')) {
          host.prompt({ text: HALL_TEXT.cardNoSkill, choices: [{ label: 'OK', value: 'ok' }], timeout: 10 });
          const c = nearestFree('help');
          if (c) help(c);
        } else applyWait();
      }
      if (v.buffOn) {
        const moved = v.lastPos && (Math.abs(p.x - v.lastPos.x) > 0.5 || Math.abs(p.y - v.lastPos.y) > 0.5);
        // The avatar's coast after the key comes up is the walk into the area, not a new move.
        if (t - v.buffAt > 500 && (moved || host.acting?.())) interrupt(moved ? 'move' : 'act');
        else if (t - v.buffAt >= PLEASE_WAIT_MS) {
          // please_wait on_remove after its full 10 s: the nearest free bureaucrat helps.
          host.removeBuff();
          v.buffOn = false;
          const c = nearestFree('help');
          if (c) help(c);
          else setPhase('stuck', 'no-helper');
        }
        v.lastPos = { x: p.x, y: p.y };
      }
      for (const c of clerks) tickClerk(c, dtMs, t);
      if (t - (v.publishedAt || 0) > 500) {
        v.publishedAt = t;
        publish();
      }
    },
    /** A game event (a verb, a pack use): Please Wait does not allow it. */
    noteAction(kind) {
      if (PLEASE_WAIT_OK.includes(kind)) return false;
      return interrupt(kind || 'act');
    },
    /** location.js 810-819: out of the hall, every flag and the buff go. */
    end() {
      if (v.ended) return;
      v.ended = true;
      if (v.waitPrompt) host.removePrompt?.(v.waitPrompt);
      if (v.buffOn) host.removeBuff();
      v.buffOn = false;
      v.waiting = false;
      v.step = 0;
      v.started = false;
      v.phase = 'left';
      publish();
    },
    /** QA: the wait's 10 s are up now. */
    hurryWait() {
      if (v.buffOn) v.buffAt = now() - PLEASE_WAIT_MS;
    },
    /** QA: bureaucrats walking somewhere arrive now. */
    hurryClerks() {
      for (const c of clerks) if (c.target != null) c.x = c.target;
    },
  };
}
