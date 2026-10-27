/**
 * Local player mail modeled on GameServerJS/players/inc_mail.js.
 *
 * Original rules preserved here:
 * - base postage is 2 currants;
 * - one item stack may be attached;
 * - item postage is 10% of base cost, minimum 1;
 * - currant postage is 10% of the enclosed amount;
 * - postage is capped at 200 before enclosed currants are added;
 * - messages have delivery times, read/archive/reply state, and attachments
 *   are claimed independently from reading.
 */

export const MAIL_BASE_COST = 2;
export const MAIL_TEXT_LIMIT = 500;
export const MAIL_COMPANIONS = Object.freeze([
  'Amp',
  'Bumbishfish',
  'Lily Linguistic',
]);

const COMPANION_SET = new Set(MAIL_COMPANIONS);

function finiteInt(value, fallback = 0, max = 999_999) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) ? Math.max(0, Math.min(max, number)) : fallback;
}

function finiteTimestamp(value, fallback = 0) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number)
    ? Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, number))
    : fallback;
}

function cleanId(value) {
  return String(value || '').trim().replace(/[^a-zA-Z0-9_:-]/g, '').slice(0, 100);
}

function cleanText(value, max = MAIL_TEXT_LIMIT) {
  return String(value || '').trim().slice(0, max);
}

function cleanParty(value, fallback = 'Tiny Speck Post') {
  return cleanText(value, 80) || fallback;
}

function normalizeAttachment(seed) {
  const classTsid = cleanId(seed?.classTsid || seed?.class_tsid);
  const count = finiteInt(seed?.count, 0, 999);
  if (!classTsid || count < 1) return null;
  return { classTsid, count };
}

function normalizeMessage(seed = {}, index = 0) {
  const sentAt = finiteTimestamp(seed?.sentAt ?? seed?.received);
  const deliveryAt = finiteTimestamp(seed?.deliveryAt ?? seed?.delivery_time, sentAt);
  const attachment = normalizeAttachment(seed?.attachment || seed?.item);
  const currants = finiteInt(seed?.currants);
  return {
    id: cleanId(seed?.id || seed?.message_id) || `mail-${index + 1}`,
    sender: cleanParty(seed?.sender?.label || seed?.sender),
    recipient: cleanParty(seed?.recipient, 'You'),
    text: cleanText(seed?.text),
    sentAt,
    deliveryAt,
    read: seed?.read === true || seed?.is_read === true,
    archived: seed?.archived === true,
    deleted: seed?.deleted === true,
    replied: seed?.replied === true || finiteInt(seed?.replied) > 0,
    replyTo: cleanId(seed?.replyTo || seed?.in_reply_to?.message_id) || null,
    attachment,
    currants,
    attachmentsClaimed: seed?.attachmentsClaimed === true || (!attachment && currants === 0),
    outgoing: seed?.outgoing === true,
    // Multiplayer only (G333): an attachment the site's ledger holds until it is received
    // (features/auctions-feature.js mailReceive). Solo letters never carry one.
    ...(/^auc-[0-9a-f]{16}-d$/.test(String(seed?.ledger || '')) ? { ledger: String(seed.ledger) } : {}),
  };
}

export function normalizeMailboxState(seed = {}) {
  const messages = (Array.isArray(seed?.messages) ? seed.messages : [])
    .slice(0, 250)
    .map(normalizeMessage);
  const ids = new Set();
  for (const message of messages) {
    if (ids.has(message.id)) message.id = `${message.id}-${ids.size + 1}`;
    ids.add(message.id);
  }
  return {
    messages,
    nextId: Math.max(finiteInt(seed?.nextId, 1), messages.length + 1),
    totalSent: finiteInt(seed?.totalSent),
    totalReceived: finiteInt(seed?.totalReceived),
  };
}

export function createMailboxState(seed = {}) {
  return normalizeMailboxState(seed);
}

export function mailCost({
  itemBaseCost = 0,
  itemCount = 0,
  currants = 0,
  includeEnclosedCurrants = true,
} = {}) {
  let postage = MAIL_BASE_COST;
  if (itemCount > 0) {
    postage += Math.round(Math.max(1, finiteInt(itemBaseCost) * 0.1 * finiteInt(itemCount)));
  }
  const enclosed = finiteInt(currants);
  if (enclosed > 0) postage += Math.round(enclosed * 0.1);
  postage = Math.min(200, postage);
  return postage + (includeEnclosedCurrants ? enclosed : 0);
}

function nextMessageId(state) {
  const id = `mail-${finiteInt(state.nextId, 1)}`;
  state.nextId = finiteInt(state.nextId, 1) + 1;
  return id;
}

function findMessage(state, id) {
  return state.messages.find((message) => message.id === cleanId(id)) || null;
}

export function deliverMail(state, message = {}) {
  const normalized = normalizeMailboxState(state);
  Object.assign(state, normalized);
  const row = normalizeMessage({
    ...message,
    id: message.id || nextMessageId(state),
    outgoing: false,
  }, state.messages.length);
  state.messages.push(row);
  state.totalReceived += 1;
  return row;
}

export function seedMailbox(state, now = Date.now()) {
  const normalized = normalizeMailboxState(state);
  Object.assign(state, normalized);
  if (state.messages.length) return state;
  deliverMail(state, {
    sender: 'Tiny Speck Post',
    text: 'Your mailbox is ready. Messages may carry one item stack and a little bundle of currants. Open a message to collect either.',
    sentAt: now - 120_000,
    deliveryAt: now - 120_000,
    currants: 25,
  });
  deliverMail(state, {
    sender: 'Amp',
    text: 'Home already? Lovely. Send me a note when the kettle has decided what it wants to be.',
    sentAt: now - 60_000,
    deliveryAt: now - 60_000,
    attachment: { classTsid: 'apple', count: 1 },
  });
  return state;
}

export function sendMail(
  state,
  player,
  inventory,
  {
    recipient,
    text,
    attachment = null,
    attachmentBaseCost = 0,
    currants = 0,
    replyTo = null,
    now = Date.now(),
    replyDelayMs = 8_000,
  } = {}
) {
  const normalized = normalizeMailboxState(state);
  Object.assign(state, normalized);
  const to = cleanParty(recipient, '');
  const body = cleanText(text);
  if (!COMPANION_SET.has(to)) return { ok: false, reason: 'recipient' };
  if (!body) return { ok: false, reason: 'empty' };

  const item = normalizeAttachment(attachment);
  if (attachment && !item) return { ok: false, reason: 'attachment' };
  if (item && finiteInt(inventory?.[item.classTsid]) < item.count) {
    return { ok: false, reason: 'missing_item', item };
  }
  const enclosed = finiteInt(currants);
  const cost = mailCost({
    itemBaseCost: attachmentBaseCost,
    itemCount: item?.count || 0,
    currants: enclosed,
  });
  if (finiteInt(player?.currants) < cost) {
    return { ok: false, reason: 'no_money', cost, shortfall: cost - finiteInt(player?.currants) };
  }

  player.currants = finiteInt(player.currants) - cost;
  if (item) inventory[item.classTsid] = finiteInt(inventory[item.classTsid]) - item.count;
  const id = nextMessageId(state);
  const sent = normalizeMessage({
    id,
    sender: 'You',
    recipient: to,
    text: body,
    sentAt: finiteTimestamp(now),
    deliveryAt: finiteTimestamp(now),
    replyTo,
    attachment: item,
    currants: enclosed,
    attachmentsClaimed: true,
    read: true,
    outgoing: true,
  });
  state.messages.push(sent);
  state.totalSent += 1;
  const original = findMessage(state, replyTo);
  if (original) original.replied = true;

  const reply = deliverMail(state, {
    sender: to,
    text: companionReply(to, body),
    sentAt: finiteTimestamp(now),
    deliveryAt: finiteTimestamp(now + Math.max(0, Number(replyDelayMs) || 0)),
    replyTo: id,
  });
  return { ok: true, id, cost, postage: cost - enclosed, replyId: reply.id };
}

function companionReply(name, body) {
  const subject = cleanText(body, 44);
  if (name === 'Amp') return `I got your note about “${subject}”. It arrived with all its corners intact.`;
  if (name === 'Bumbishfish') return `Mail received! I read “${subject}” aloud to a rock. The rock had no corrections.`;
  return `Your message about “${subject}” found me. Words travel surprisingly well in little envelopes.`;
}

export function listMailboxMessages(state, { now = Date.now(), archived = false, outgoing = false } = {}) {
  const mailbox = normalizeMailboxState(state);
  return mailbox.messages
    .filter((message) =>
      !message.deleted &&
      message.archived === archived &&
      message.outgoing === outgoing &&
      message.deliveryAt <= now
    )
    .sort((a, b) => b.deliveryAt - a.deliveryAt);
}

export function unreadMailCount(state, now = Date.now()) {
  return listMailboxMessages(state, { now })
    .filter((message) => !message.read)
    .length;
}

export function readMail(state, id, now = Date.now()) {
  const message = findMessage(state, id);
  if (!message || message.deleted || message.outgoing || message.deliveryAt > now) {
    return { ok: false, reason: 'missing' };
  }
  message.read = true;
  return { ok: true, message };
}

export function receiveMailAttachments(state, inventory, player, id, now = Date.now()) {
  const result = readMail(state, id, now);
  if (!result.ok) return result;
  const message = result.message;
  if (message.attachmentsClaimed || (!message.attachment && !message.currants)) {
    return { ok: false, reason: 'nothing_to_receive', message };
  }
  if (message.attachment) {
    inventory[message.attachment.classTsid] =
      finiteInt(inventory?.[message.attachment.classTsid]) + message.attachment.count;
  }
  player.currants = finiteInt(player?.currants) + finiteInt(message.currants);
  message.attachmentsClaimed = true;
  return {
    ok: true,
    item: message.attachment,
    currants: message.currants,
    message,
  };
}

export function archiveMail(state, id, archived = true) {
  const message = findMessage(state, id);
  if (!message || message.deleted || message.outgoing) return { ok: false, reason: 'missing' };
  message.archived = archived === true;
  return { ok: true, message };
}

export function deleteMail(state, id) {
  const message = findMessage(state, id);
  if (!message || message.deleted || message.outgoing) return { ok: false, reason: 'missing' };
  message.deleted = true;
  return { ok: true, message };
}
