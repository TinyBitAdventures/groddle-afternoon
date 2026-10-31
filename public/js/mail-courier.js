/**
 * Express mail by AFLC Frog, and the Mail Dispatcher's parcel run: the rules
 * from GameServerJS, pure (no DOM, no Pixi), over js/mailbox.js state.
 *
 * Sources
 * - players/inc_mail.js
 *   - a letter that carries an item goes "express": it is added with
 *     to_mailbox false (main.js 6677, 6716 doMailSend; inc_mail.js 1583
 *     mail_send_special_item; player.js 3254), so a frog brings it; letters
 *     with only words or currants land in the mailbox (main.js 6735);
 *   - schedule_next_delivery 894-953: the next pending express letter is due
 *     at its delivery time, never sooner than 30 s from scheduling (936-938);
 *   - mail_has_deliveries 345-373 / mail_get_next_player_message 509-530:
 *     a letter counts once it is due within the next 60 s;
 *   - deliver_mail 299-326: in an instance or Hell the run is put off three
 *     minutes (reschedule_mail 279-283); else the modal prompt "Special
 *     delivery! A package has arrived for you." and, on OK,
 *     answer_mail_prompt 328-343 drops a blue frog 500 px to one side,
 *     400 px up;
 *   - mail_login 1463-1468 / send_unsent_player_mail_to_inbox 813-830: what
 *     came due while you were away goes straight to the mailbox, marked
 *     expedited, with the growl "You have new messages in your mailbox!"
 *     (new_inbox_growl 685-710);
 *   - get_player_message 672-683 / get_message_goodies 628-670: currants
 *     first, then the item; a full pack keeps the item and the frog asks;
 *     a handed-over letter is read, expedited and in the mailbox
 *     (send_express_to_inbox 832-843).
 * - items/npc_yoga_frog.js (AFLC Frog): its lines, choices, the seven
 *   ramblings in turn (sayFunnyThings 552-581, delivery_order % 7), the
 *   epiphanies (894-901), the timings of fall (364-379), followPC (381-455),
 *   doYoga (294-339) and leave (472-511).
 * - items/npc_mail_dispatcher.js: doParcel 208-258 (prepare_package 600 ms,
 *   waiting_for_frog 1000 ms, the frog at x+250 / y-500, package_sent
 *   1000 ms) and the frog's pickup (npc_yoga_frog.js startPickup 721-728,
 *   doPickup 260-292).
 *
 * Copy: the source's words; its em-dashes became a comma or a colon (house
 * style), and a letter's sender stands in for getPlayer(sender).label.
 */

import { mailSender } from './mailbox.js?v=e62cffa6';

export const COURIER = Object.freeze({
  /** inc_mail.js 936-938. */
  minLeadMs: 30_000,
  /** inc_mail.js 360, 366, 527. */
  lookAheadMs: 60_000,
  /** reschedule_mail 279-283. */
  rescheduleMs: 180_000,
  /** answer_mail_prompt 333-334: choose_one([-500, 500]), y - 400. */
  spawnDx: 500,
  spawnDy: -400,
  /** fall 364-379: to 300 px short of you, speed 400. */
  fallDx: 300,
  fallSpeed: 400,
  /** followPC 381-455. */
  followNear: 100,
  followLeftDx: -100,
  followRightDx: 50,
  followDy: -50,
  followSpeed: 200,
  followSettleDx: 60,
  followStepMs: 100,
  followFlyMs: 500,
  /** doYoga 294-339. */
  yogaDx: 95,
  yogaDy: -50,
  yogaSpeed: 200,
  yogaInMs: 250,
  yogaHoldMs: 2000,
  yogaOutMs: 200,
  /** leave 472-511. */
  leaveStartMs: 150,
  leaveDx: 300,
  leaveDy: -75,
  leaveSpeed: 200,
  leaveDx2: 300,
  leaveDy2: -500,
  leaveSpeed2: 400,
  /** doYoga's chance of ramblings first (is_chance(0.33333), doDelivery 250/255). */
  rambleChance: 0.33333,
  /** talk_to 205-213: the frog's one-line bubbles last 3 s. */
  bubbleMs: 3000,
});

export const PARCEL = Object.freeze({
  /** doParcel 213-258. */
  prepareMs: 600,
  waitingMs: 1000,
  sentMs: 1000,
  nextMs: 1000,
  /** doParcel case 2: createItemStack('npc_yoga_frog', 1, this.x + 250, this.y - 500). */
  frogDx: 250,
  frogDy: -500,
  /** startPickup 727: to the station's x, y - 75 at 400. */
  arriveDy: -75,
  arriveSpeed: 400,
  /** doPickup 260-292. */
  moveEndMs: 500,
  boxMs: 500,
  outDx: -50,
  outDy: -50,
  outSpeed: 150,
  awayDx: -200,
  awayDy: -450,
  awaySpeed: 400,
});

export const FROG_POSES = Object.freeze(['tree', 'dancer', 'warrior']);

export const COURIER_TEXT = Object.freeze({
  label: 'AFLC Frog',
  /** npc_yoga_frog.js 6. */
  description: 'These frogs deliver parcels for both the Auction Fulfillment and Logistics Corporation and the General Inter-Giant Postal Delivery Service to fund their yoga classes, organic produce addictions and respective degrees in alternative healing. As a rule, they experience a high degree of spiritual oneness.',
  /** talk_to tooltip, 200. */
  talkTip: 'Get your mail',
  /** inc_mail.js 319. */
  prompt: 'Special delivery! A package has arrived for you.',
  /** inc_mail.js 690. */
  growl: 'You have new messages in your mailbox!',
  /** doDelivery 270. */
  gotMail: 'Got your mail, brah.',
  thanks: 'Thanks!',
  /** onConversation 'deliver', 597. */
  namaste: 'Whatever. Namaste, dude.',
  namasteReply: 'Uh, thanks?',
  /** deliveryFailed 216. */
  packFull: "Dude, you don't have room in your pack for this stuff. Do you want to make some room, or should I send it to your mailbox?",
  makeRoom: "Hold on. I'll make some room.",
  toMailbox: 'Just send it to my mailbox.',
  /** 'make-room', 612 (the source's spelling). */
  comeBack: "Just come talk to me when you're ready.",
  willDo: 'WIll do!.',
  /** 'to-mailbox', 615 (em-dash to a comma). */
  karma: "'Kay, brah, but you shouldn't be so attached to material possessions, it's like major bad karma.",
  karmaReply: "I'll keep that in mind.",
  /** doDelivery 235 (em-dash to a colon). */
  epiphany: 'While I was waiting I had this, like, epiphany: ',
  epiphanyReply: 'I… what?',
  /** doYoga 297. */
  yoga: 'My yoga is killer. Check this out.',
  yogaReply: 'OK',
  /** talk_to 207 (em-dash to a comma). */
  offToYoga: "Off to my yoga session, dude. You should drop in sometime, it's good for your, like, chi.",
  /** nextPlayerMailItem 664-688. */
  cool: 'Cool.',
  /** Dispatcher: send_mail verb, 176-186. */
  dispatcher: 'Mail Dispatcher',
  sendMail: 'Send mail',
  sendTip: 'Send mail to your friends',
});

/** sayFunnyThings 552-581: [line, reply] by delivery_order. */
export const FROG_RAMBLINGS = Object.freeze([
  ["I'm not really into all this, you know, like capitalism and stuff. Don't you think people should just give things away?", 'Sure. Can I have my mail now?'],
  ["You know, sometimes I look at these deliveries and I'm just like, \"Why are we so obsessed with material, like, possessions when nature is all around us?\"", 'Can I just have my mail now?'],
  ['Backpacking through Shimla Mirch changed my whole worldview. You should try it sometime.', 'Can I please just have my mail now?'],
  ['Dude, your chakras are in need of some like major adjustment. You should drop by for a yoga session sometime.', "Why can't I just get my mail?"],
  ["If you think about it, it's like you've already got your mail, because we're like one with everything, right?", 'Can I have my mail for real, please?'],
  ['So I said to my boss, "Ever seen an eagle take a shower? Ever seen a, like, bear use soap?" and he was all like, "But you smell like feet."', 'Can I seriously please just have my mail?'],
  ["Sometimes I get the feeling like you don't appreciate my wisdom.", "I'd appreciate my mail."],
]);

/** responses.epiphanies, npc_yoga_frog.js 894-901. */
export const FROG_EPIPHANIES = Object.freeze([
  "if we're all just vibrations, and light is a kind of vibration, and light comes from the sun, then aren't sunbeams all like our brothers and sisters, or whatever, you know?",
  "what if, like, we are the giants, and we're really imagining ourselves?",
  'maybe all music should be called "world" music, because aren\'t we all like citizens of the world?',
  "if you need butterflies to make butter, shouldn't you need batterflies to make batter?",
  "when you think about it, aren't all trees really wood trees?",
  "why do they call them pants when you're only wearing one? Shouldn't it just be pant?",
]);

const int = (v, d = 0) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? n : d;
};

/** A letter the frog brings: express, not yet in the mailbox, nothing settled through the site's ledger. */
export function isExpressPending(message) {
  return Boolean(message) &&
    message.express === true &&
    message.inMailbox !== true &&
    message.outgoing !== true &&
    message.deleted !== true &&
    !message.ledger;
}

/** mail_get_next_player_message: the earliest pending express letter due within 60 s (or any, with `future`). */
export function nextExpress(messages, now = Date.now(), { future = false } = {}) {
  let best = null;
  for (const m of Array.isArray(messages) ? messages : []) {
    if (!isExpressPending(m)) continue;
    if (!best || int(m.deliveryAt) < int(best.deliveryAt)) best = m;
  }
  if (!best) return null;
  return future || int(best.deliveryAt) < now + COURIER.lookAheadMs ? best : null;
}

/** schedule_next_delivery 933-950: when the frog is called for `message`, scheduled at `now`. */
export function courierDueAt(message, now = Date.now()) {
  return Math.max(int(message?.deliveryAt), now + COURIER.minLeadMs);
}

/**
 * mail_login / send_unsent_player_mail_to_inbox: every express letter already
 * due goes to the mailbox, expedited (the frog does not fly to a player who
 * was away). Returns how many moved.
 */
export function sendDueToMailbox(messages, now = Date.now()) {
  let moved = 0;
  for (const m of Array.isArray(messages) ? messages : []) {
    if (!isExpressPending(m) || int(m.deliveryAt) >= now) continue;
    m.inMailbox = true;
    m.expedited = true;
    moved += 1;
  }
  return moved;
}

/** sendMailToInbox ('to-mailbox'): every letter the frog was carrying goes to the mailbox. */
export function sendCarriedToMailbox(messages, now = Date.now()) {
  let moved = 0;
  for (const m of Array.isArray(messages) ? messages : []) {
    if (!isExpressPending(m) || int(m.deliveryAt) >= now + COURIER.lookAheadMs) continue;
    m.inMailbox = true;
    m.expedited = true;
    moved += 1;
  }
  return moved;
}

/**
 * get_player_message: hand one letter over. Currants come first (and leave the
 * envelope even if the item cannot); the item only when `room` (how many the
 * pack can take, null = no limit) covers the stack. A letter fully handed over
 * is read, expedited and in the mailbox with nothing left to receive.
 */
export function handOver(message, inventory, player, { room = null } = {}) {
  if (!isExpressPending(message)) return { ok: false, reason: 'missing' };
  const currants = message.attachmentsClaimed ? 0 : Math.max(0, int(message.currants));
  if (currants && player) {
    player.currants = Math.max(0, int(player.currants)) + currants;
    message.currants = 0;
  }
  const item = message.attachmentsClaimed ? null : message.attachment || null;
  if (item && room != null && int(room) < int(item.count)) {
    return { ok: false, reason: 'pack_full', currants, item };
  }
  if (item && inventory) inventory[item.classTsid] = Math.max(0, int(inventory[item.classTsid])) + int(item.count);
  message.attachmentsClaimed = true;
  message.read = true;
  message.inMailbox = true;
  message.expedited = true;
  return { ok: true, currants, item };
}

/** sayFunnyThings: delivery_order starts at 0 and steps on each time (mod 7). */
export function nextRamble(order) {
  const next = order == null || order < 0 ? 0 : (int(order) + 1) % FROG_RAMBLINGS.length;
  return { order: next, line: FROG_RAMBLINGS[next][0], reply: FROG_RAMBLINGS[next][1] };
}

/** nextPlayerMailItem 664-688: the frog's words for the n-th letter (0-based). */
export function letterLine(index, { sender = '', text = '', stuff = false } = {}) {
  const from = mailSender(sender);
  let line;
  if (!index) line = `OK, so there's like… an express message for you from ${from}.`;
  else if (index === 1) line = `Oh, right. There's also a message from ${from}.`;
  else line = `And you've got something from ${from}.`;
  const said = String(text || '').trim();
  if (said && stuff) line += ` They said, "${said}" and they sent you all this stuff, too.`;
  else if (said) line += ` They said, "${said}"`;
  else if (stuff) line += ' They sent you all this stuff.';
  return line;
}

/** finishDelivery 384-394: choose_one(['tree', 'dancer', 'warrior']). */
export function pickPose(roll = Math.random()) {
  return FROG_POSES[Math.min(FROG_POSES.length - 1, Math.floor(Math.max(0, roll) * FROG_POSES.length))];
}

/** One step of linear flight (apiMoveToXY at `speed` px/s). Returns true on arrival. */
export function flyStep(body, to, speed, dtMs) {
  const dx = to.x - body.x;
  const dy = to.y - body.y;
  const dist = Math.hypot(dx, dy);
  const step = (speed * Math.max(0, dtMs)) / 1000;
  if (dist <= step || dist < 0.5) {
    body.x = to.x;
    body.y = to.y;
    return true;
  }
  body.x += (dx / dist) * step;
  body.y += (dy / dist) * step;
  return false;
}

/** The courier's save slice (delivery_order and the next call). */
export function normalizeCourierState(seed = {}) {
  const order = seed?.order == null ? null : int(seed.order, 0) % FROG_RAMBLINGS.length;
  return {
    order: order == null || order < 0 ? null : order,
    delivered: Math.max(0, int(seed?.delivered)),
    parcels: Math.max(0, int(seed?.parcels)),
  };
}
