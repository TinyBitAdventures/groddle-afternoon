/**
 * Mail between real players (register G478): pure rules and words.
 * features/player-mail-feature.js runs them in multiplayer; the site
 * (groddle-afternoon-site src/LedgerMail.php) keeps the letters and moves
 * everything of value through the ledger; the realtime server
 * (groddle-afternoon-server mail.go) only nudges a receiver who is online.
 * Solo keeps js/mailbox.js's letters to the companions, untouched.
 *
 * Source rules (GameServerJS players/inc_mail.js, main.js, config_prod.js,
 * the AS3 client's mail windows):
 * - Postage, mail_get_message_cost 1295-1312: 2, plus 10% of the stack's
 *   base cost times its count (at least 1), plus 10% of the enclosed
 *   currants, at most 200; doMailSend (main.js 6680, 6708, 6735) takes that
 *   plus the currants. The base cost is the class's base_cost
 *   (store-catalog.js ITEM_BASE_COSTS, passed in so the phone companion
 *   never loads that table; the site reads the same one, tools/build-mail.mjs).
 * - Arrival, config_prod.js:45-46: words alone at once
 *   (mail_delivery_time 0), anything with a stack or currants 420 s later
 *   (mail_delivery_time_with_attachment; main.js 6689, 6728, 6742-6745).
 *   A letter with a stack is the AFLC Frog's (to_mailbox false, main.js
 *   6689); currants alone go to the mailbox (6747).
 * - Limits: one stack (build_mail_check_msg 1363-1364), at most 999 of it
 *   (MailItemSlot.as:167), no bag with things in it (mail_can_send 26-29,
 *   MailComposeUI.as:539-542), at most 999,999 currants (MailReplyUI.as:352),
 *   300 characters (MailComposeUI.as:39), something in it
 *   (MailComposeUI.as:527), someone in To (MailComposeUI.as:607-612),
 *   the To field searching your buddy list (MailComposeUI.as:384-411,
 *   WorldModel.as:377-389).
 * - No cash on delivery: the source had none (the sender pays the postage,
 *   the receiver pays nothing).
 * - Reading and collecting: get_message_goodies 628-655 (currants first,
 *   then the stack; a full pack keeps it: "You cannot receive your items
 *   because your bag is full..."), a letter can't be deleted while it holds
 *   things (MailReadUI.as:540-541), a reply quotes what it answers, one level
 *   (build_mail_check_msg 1403-1429).
 * - New mail: new_inbox_growl 670-695 ("You have new messages in your
 *   mailbox!"), the mailbox's has_mail state (npc_mailbox.js doIdle
 *   238-244), the Butler's "You have mail." (butler_data.js 369-386).
 */

import { MAIL_POST_SENDER } from './mailbox.js?v=18178bf5';

export const PLAYER_MAIL_RULES = Object.freeze({
  textMax: 300,
  countMax: 999,
  currantsMax: 999999,
  delay: 0,
  delayAttached: 420,
  baseCost: 2,
  postageMax: 200,
  mailboxMax: 50,
  sendPerHour: 60,
});

/** The mailbox row id of a letter from the site, and of one that came back. */
export const LETTER_ROW = (id) => `pm-${id}`;
export const RETURN_ROW = (id) => `pmr-${id}`;

export const PLAYER_MAIL_TEXT = Object.freeze({
  growl: 'You have new messages in your mailbox!', // inc_mail.js:675
  growlFrom: (name) => `You have new mail from ${name}.`,
  bagFull: 'You cannot receive your items because your bag is full. You will need to free up space in your bag first.', // inc_mail.js:646
  empty: 'You need to put *something* in this message!', // MailComposeUI.as:528
  noOne: 'You need someone in the "To" field!', // MailComposeUI.as:609
  needCurrants: 'You need more currants!', // MailComposeUI.as:621
  bagStuffed: "Tricky! But you can't mail bags with stuff inside!", // MailComposeUI.as:540
  stillAttached: 'You still have attachments!', // MailReadUI.as:541
  sent: 'Your letter is on its way.',
  sentParcel: 'Your parcel is on its way. It arrives in about 7 minutes.',
  offline: 'The post office is not answering. Try again in a moment.',
  returnedFrom: MAIL_POST_SENDER,
  toPlaceholder: 'A buddy\'s name',
});

const n0 = (v, max = Number.MAX_SAFE_INTEGER) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(max, n) : 0;
};

/** inc_mail.js mail_get_message_cost 1295-1312 (currants included, as doMailSend charges). */
export function playerMailCost({ c = null, n = 0, currants = 0 } = {}, base = {}) {
  let cost = PLAYER_MAIL_RULES.baseCost;
  const count = n0(n);
  if (c && count) cost += Math.round(Math.max(1, (Number(base?.[c]) || 0) * 0.1 * count));
  const enclosed = n0(currants);
  if (enclosed) cost += Math.round(enclosed * 0.1);
  return Math.min(PLAYER_MAIL_RULES.postageMax, cost) + enclosed;
}

/** When a letter sent now arrives (ms). */
export function arrivesAt({ item = null, currants = 0 } = {}, now = Date.now()) {
  const parcel = Boolean(item) || n0(currants) > 0;
  return now + 1000 * (parcel ? PLAYER_MAIL_RULES.delayAttached : PLAYER_MAIL_RULES.delay);
}

/** A letter's id: 16 hex, made by the sender's game so a letter asked twice is one letter. */
export function newLetterId(rand = Math.random) {
  let s = '';
  for (let i = 0; i < 16; i += 1) s += Math.floor(rand() * 16).toString(16);
  return s;
}

/**
 * The compose form's own checks (the client's, before the site's): the words
 * for the first thing wrong, or null.
 */
export function composeRefusal({ to = '', text = '', item = null, currants = 0, held = null, purse = null, bagHolds = false } = {}, base = {}) {
  const words = String(text || '').trim();
  const money = Math.floor(Number(currants) || 0);
  if (!String(to || '').trim()) return PLAYER_MAIL_TEXT.noOne;
  if (!words && !item && !money) return PLAYER_MAIL_TEXT.empty;
  if (words.length > PLAYER_MAIL_RULES.textMax) return `Keep it to ${PLAYER_MAIL_RULES.textMax} characters.`;
  if (money < 0 || money > PLAYER_MAIL_RULES.currantsMax) return 'Enclose from 0 to 999,999 currants.';
  if (item) {
    if (bagHolds) return PLAYER_MAIL_TEXT.bagStuffed;
    const n = Math.floor(Number(item.n) || 0);
    if (n < 1 || n > PLAYER_MAIL_RULES.countMax) return 'Choose how many to send, from 1 to 999.';
    if (held != null && n > held) return "You don't have that many.";
  }
  if (purse != null && purse < playerMailCost({ c: item?.c, n: item?.n, currants: money }, base)) return PLAYER_MAIL_TEXT.needCurrants;
  return null;
}

/** A site receipt for a mail move ({ op, gave, got }), checked: null when it is not one. */
export function normalizeMailReceipt(raw) {
  const op = String(raw?.op || '');
  if (!/^mail-[0-9a-f]{16}-[sc]$/.test(op)) return null;
  const goods = (g) => {
    const items = {};
    for (const it of Array.isArray(g?.items) ? g.items : []) {
      const c = String(it?.c || '');
      const n = n0(it?.n);
      if (/^[a-z0-9_]{1,64}$/.test(c) && n) items[c] = (items[c] || 0) + n;
    }
    return { items, currants: n0(g?.currants) };
  };
  return { op, kind: op.slice(-1), id: op.slice(5, 21), gave: goods(raw.gave), got: goods(raw.got) };
}

/** What a receipt does to the pack and the purse. */
export function mailReceiptEffects(receipt) {
  const pack = {};
  for (const [c, n] of Object.entries(receipt?.gave?.items || {})) pack[c] = (pack[c] || 0) - n;
  for (const [c, n] of Object.entries(receipt?.got?.items || {})) pack[c] = (pack[c] || 0) + n;
  for (const c of Object.keys(pack)) if (!pack[c]) delete pack[c];
  return { pack, currants: n0(receipt?.got?.currants) - n0(receipt?.gave?.currants) };
}

function itemOf(raw) {
  const c = String(raw?.c || '');
  const n = n0(raw?.n, PLAYER_MAIL_RULES.countMax);
  return /^[a-z0-9_]{1,64}$/.test(c) && n ? { classTsid: c, count: n } : null;
}

/**
 * A site letter (GET groddle/v1/mail) as a mailbox row (js/mailbox.js
 * deliverMail): a letter to you from its sender, or one of yours that came
 * back from the Post. Things in it wait in the site's ledger (ledger:
 * mail-<id>-c) until the mailbox's Receive. A letter with a stack is the
 * Frog's (express) unless it arrived before this session began (mail_login:
 * straight to the mailbox, expedited).
 */
export function letterRow(letter, { sessionStart = 0 } = {}) {
  if (!letter || !/^[0-9a-f]{16}$/.test(String(letter.id || ''))) return null;
  const returned = letter.box === 'returned';
  if (!returned && letter.box !== 'in') return null;
  const item = itemOf(letter.item);
  const currants = n0(letter.currants, PLAYER_MAIL_RULES.currantsMax);
  const goods = Boolean(item) || currants > 0;
  const at = n0(letter.at) || n0(letter.sent);
  const row = {
    id: returned ? RETURN_ROW(letter.id) : LETTER_ROW(letter.id),
    sender: returned ? PLAYER_MAIL_TEXT.returnedFrom : String(letter.from?.name || 'Someone').slice(0, 80),
    text: returned ? String(letter.returned || `Your letter to ${letter.to?.name || 'them'} came back.`) + (letter.text ? `\n\n"${letter.text}"` : '') : String(letter.text || ''),
    sentAt: n0(letter.sent) || at,
    deliveryAt: at,
    attachment: item,
    currants,
    attachmentsClaimed: !goods || letter.collected === true,
    playerMail: letter.id,
    ...(returned ? {} : { fromId: n0(letter.from?.id) }),
    ...(letter.reply?.text && !returned ? { quote: { text: String(letter.reply.text).slice(0, 500), from: String(letter.reply.from?.name || '').slice(0, 80) } } : {}),
    ...(goods ? { ledger: `mail-${letter.id}-c` } : {}),
  };
  if (item && !returned) {
    row.express = true;
    row.inMailbox = letter.collected === true || at < sessionStart;
    if (row.inMailbox) row.expedited = true;
  } else {
    row.express = false;
  }
  return row;
}

/** One of your sent letters as a Sent row. */
export function sentRow(letter) {
  if (!letter || !/^[0-9a-f]{16}$/.test(String(letter.id || ''))) return null;
  return {
    id: LETTER_ROW(letter.id),
    sender: 'You',
    recipient: String(letter.to?.name || 'Someone').slice(0, 80),
    text: String(letter.text || ''),
    sentAt: n0(letter.sent),
    deliveryAt: n0(letter.sent),
    attachment: itemOf(letter.item),
    currants: n0(letter.currants, PLAYER_MAIL_RULES.currantsMax),
    attachmentsClaimed: true,
    read: true,
    outgoing: true,
    playerMail: letter.id,
  };
}

/** The save slice: the site letters already put in the mailbox (so a deleted one stays deleted). */
export const SEEN_KEEP = 300;
export function normalizePlayerMailSlice(s) {
  const seen = (Array.isArray(s?.seen) ? s.seen : []).map(String).filter((x) => /^pmr?-[0-9a-f]{16}$/.test(x));
  return { seen: [...new Set(seen)].slice(-SEEN_KEEP), toldAt: n0(s?.toldAt) };
}

/** The words for an attached stack and currants: "3 Cherries and 25 currants". */
export function goodsWords(item, currants, label = (c, n) => `${n} × ${c}`) {
  const bits = [];
  if (item) bits.push(label(item.classTsid, item.count));
  if (currants) bits.push(`${currants.toLocaleString('en-US')} ${currants === 1 ? 'currant' : 'currants'}`);
  return bits.join(' and ');
}
