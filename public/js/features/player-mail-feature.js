/**
 * Mail between real players in multiplayer (register G478). The rules and
 * words are js/player-mail.js; the site keeps the letters and moves
 * everything of value (groddle-afternoon-site src/LedgerMail.php); the
 * realtime server only nudges a receiver who is online (groddle-afternoon-
 * server mail.go). Solo has no player mail: there this feature answers
 * nothing and the mailbox writes to the companions as it always did.
 *
 * - Write mail (the mailbox's Write mail, the Mail Dispatcher's Send mail,
 *   Reply) goes to a real player: the To field offers your buddies
 *   (MailComposeUI.as:384-411) and takes any character's name; a letter
 *   carries words, one stack and currants, for the source's postage
 *   (mail_get_message_cost). Before it is sent the save is written, so the
 *   site's ledger knows what the pack holds; the site takes the postage, the
 *   currants and the stack out of your ledger at once (a receipt your save
 *   applies once, the trade slice's applied list) and holds them in the
 *   letter. Then the realtime server is told (mail_tell) so the receiver,
 *   if online, hears of it when it arrives.
 * - Arriving letters come from the site (GET mail): at the start, when the
 *   realtime server says one arrived (mail_arrived), when the next one is
 *   due, when the mailbox opens and every few minutes. Each goes into the
 *   mailbox once (slice.seen), from its sender; one with a stack is the AFLC
 *   Frog's to bring (features/mail-courier-feature.js), unless it arrived
 *   while you were away (mail_login: straight to the mailbox). New mail:
 *   "You have new messages in your mailbox!" (new_inbox_growl), the
 *   mailbox's has_mail look, the mail sound, and your Butler's IM "You have
 *   mail." (butler_data.js 384-386) when its IMs are on.
 * - Receive (the mailbox, or the Frog) asks the site, which puts the stack
 *   and the currants into your ledger; the receipt is applied once. A pack
 *   with no room keeps the letter as it is (get_mail_items 976).
 * - A letter with things in it that its receiver can't take (gone, or they
 *   blocked you first) comes back to you from the Post with the same things.
 *
 * QA: canvas data playerMail (letters in, waiting to be collected),
 * playerMailLast (the last thing said), playerMailSent (the last letter id
 * sent); window.groddlePlayerMail in multiplayer.
 */

import { ITEM_CATALOG, addItem, countItem, removeItem } from '../inventory.js?v=b0e33301';
import { TOOL_CONDITION_CATALOG, leavingToolWear, receiveToolCopy } from '../tools.js?v=3d109172';
import { createMinnAccount } from '../minn-account.js?v=ea900c51';
import { ITEM_BASE_COSTS } from '../store-catalog.js?v=79d4de8a';
import { saveStore } from '../save-store.js?v=8839ba7b';
import {
  LETTER_ROW,
  PLAYER_MAIL_RULES as R,
  PLAYER_MAIL_TEXT as T,
  composeRefusal,
  goodsWords,
  letterRow,
  mailReceiptEffects,
  newLetterId,
  normalizeMailReceipt,
  normalizePlayerMailSlice,
  playerMailCost,
  sentRow,
} from '../player-mail.js?v=a1d50656';

export const PLAYER_MAIL_FEATURE_ID = 'player-mail';
const SYNC_EVERY_MS = 5 * 60_000;

let multiplayer = false;
let slice = normalizePlayerMailSlice(null);

const label = (c, n = 1) => {
  const meta = ITEM_CATALOG[c];
  const name = meta ? (n === 1 ? meta.label : meta.namePlural || meta.label) : String(c).replace(/_/g, ' ');
  return n === 1 ? name : `${n} ${name}`;
};

function createSession(engine) {
  const boot = globalThis.GRODDLE_MP_BOOT || {};
  const account = createMinnAccount({ baseUri: document.baseURI, nonce: boot.nonce || '' });
  const sessionStart = Date.now();
  let syncing = null;
  let syncedAt = 0;
  let nextAt = 0;
  let wasOpen = false;
  let last = '';
  let lastSent = '';
  let rules = { ...R };
  let client = null;

  function publish() {
    const waiting = (engine.mailMessages?.() || []).filter((m) => m.playerMail && m.ledger && !m.deleted && !m.attachmentsClaimed);
    engine.setData?.('playerMail', waiting.map((m) => m.playerMail).join(','));
    engine.setData?.('playerMailLast', last);
    engine.setData?.('playerMailSent', lastSent);
  }

  function say(text, ms = 3200) {
    last = text;
    engine.toast?.(text, ms);
    publish();
  }

  /** The save as the site will compare it (trade-feature's persist). */
  async function persist() {
    engine.save?.();
    if (typeof saveStore?.flush !== 'function') return;
    for (let i = 0; i < 3; i += 1) {
      try { await saveStore.flush(); } catch { return; }
      if (saveStore.state === 'saved') return;
    }
  }

  function rowFor(id) {
    return (engine.mailMessages?.() || []).find((m) => m.id === id) || null;
  }

  /** One settled move, once (the trade slice's applied list): true when applied now. */
  function applyReceipt(raw, { quiet = false, r = null } = {}) {
    const receipt = normalizeMailReceipt(raw);
    if (!receipt) return false;
    if (engine.query?.('ledgerReceipt', receipt.op, engine) !== true) return false;
    const fx = mailReceiptEffects(receipt);
    const inv = engine.inv;
    for (const [c, d] of Object.entries(fx.pack)) {
      if (d > 0) {
        addItem(inv, c, d);
        if (r != null && TOOL_CONDITION_CATALOG[c] && engine.toolState) receiveToolCopy(engine.toolState, c, r, d);
      } else removeItem(inv, c, Math.min(countItem(inv, c), -d));
    }
    if (fx.currants) engine.pc.currants = Math.max(0, Math.floor(Number(engine.pc.currants) || 0) + fx.currants);
    if (receipt.kind === 'c') {
      for (const m of engine.mailMessages?.() || []) {
        if (m.ledger === receipt.op) {
          m.attachmentsClaimed = true;
          m.read = true;
          if (m.express) m.inMailbox = true;
        }
      }
    }
    engine.updateHud?.();
    engine.refreshPack?.();
    if (!quiet) engine.save?.();
    return true;
  }

  /** The site's letters into the mailbox, once each; new ones told. */
  function take(letters, sent) {
    const seen = new Set(slice.seen);
    const fresh = [];
    for (const letter of letters) {
      const row = letterRow(letter, { sessionStart });
      if (!row) continue;
      const have = rowFor(row.id);
      if (have) {
        // HOMES2: a parcel a save still had waiting for the Frog waits in the mailbox now.
        if (have.playerMail && have.express && !have.inMailbox) have.express = false;
        if (letter.collected && row.ledger) {
          have.attachmentsClaimed = true;
          if (have.express) have.inMailbox = true;
        }
        seen.add(row.id);
        continue;
      }
      if (seen.has(row.id)) continue;
      engine.deliverMail?.(row);
      seen.add(row.id);
      fresh.push({ row, letter });
    }
    for (const letter of sent) {
      const row = sentRow(letter);
      if (!row || rowFor(row.id) || seen.has(row.id)) continue;
      engine.recordSentMail?.(row);
      seen.add(row.id);
    }
    slice.seen = [...seen].slice(-300);
    if (fresh.length) tell(fresh);
    return fresh.length;
  }

  /** new_inbox_growl: once for letters that came while you were away, and for each one that comes now. */
  function tell(fresh) {
    const away = fresh.filter((f) => f.row.deliveryAt <= sessionStart);
    const now = fresh.filter((f) => f.row.deliveryAt > sessionStart);
    if (away.length) {
      engine.pushActivity?.(T.growl);
      say(T.growl, 4600);
    }
    for (const f of now) {
      // HOMES2: a parcel says where it waits.
      const text = f.letter.box === 'returned' ? T.growl : f.row.ledger ? T.parcelFrom(f.row.sender) : T.growlFrom(f.row.sender);
      engine.pushActivity?.(text);
      say(text, 4200);
    }
    engine.playSound?.('HAS_MAIL', { volume: 0.5 });
    // butler_data.js 384-386: "You have mail."
    engine.query?.('butlerImNotice', 'You have mail.', engine);
    slice.toldAt = Math.max(slice.toldAt, ...fresh.map((f) => f.row.deliveryAt));
    engine.save?.();
  }

  async function sync() {
    if (syncing) return syncing;
    syncing = (async () => {
      syncedAt = Date.now();
      let d;
      try {
        d = await account.playerMail();
      } catch {
        return false;
      }
      if (d?.rules) rules = { ...rules, ...d.rules };
      for (const receipt of Array.isArray(d?.receipts) ? d.receipts : []) applyReceipt(receipt, { quiet: true });
      take(Array.isArray(d?.letters) ? d.letters : [], Array.isArray(d?.sent) ? d.sent : []);
      nextAt = Number(d?.next) > 0 ? Number(d.next) - (Number(d.now) || Date.now()) + Date.now() + 1000 : 0;
      engine.save?.();
      publish();
      return true;
    })().finally(() => { syncing = null; });
    return syncing;
  }

  function hookClient() {
    if (client) return;
    client = engine.query?.('realtimeClient') || null;
    client?.on?.('msg:mail_arrived', () => { sync(); });
  }

  // —— Sending ——

  /** Whether that many of a bag class can go: bags with things inside cannot (mail_can_send 26-29). */
  function bagHolds(c, n) {
    const layout = engine.query?.('packLayout', engine);
    const boxes = Object.values(layout?.bags || {}).filter((b) => b?.cls === c);
    if (!boxes.length) return false;
    const full = boxes.filter((b) => Array.isArray(b.slots) && b.slots.length).length;
    return n > countItem(engine.inv, c) - full;
  }

  async function send({ to, text, item = null, currants = 0, reply = null }) {
    const money = Math.max(0, Math.floor(Number(currants) || 0));
    const stack = item?.c ? { c: String(item.c), n: Math.floor(Number(item.n) || 0) } : null;
    const why = composeRefusal({
      to, text, item: stack, currants: money,
      held: stack ? countItem(engine.inv, stack.c) : null,
      purse: Math.floor(Number(engine.pc?.currants) || 0),
      bagHolds: stack ? bagHolds(stack.c, stack.n) : false,
    }, ITEM_BASE_COSTS);
    if (why) return { ok: false, text: why };
    if (stack && TOOL_CONDITION_CATALOG[stack.c] && engine.toolState) {
      const r = leavingToolWear(engine.toolState, stack.c, stack.n);
      if (r != null) stack.r = r;
    }
    const id = newLetterId();
    await persist();
    let d;
    try {
      d = await account.sendMail({ id, to: typeof to === 'number' ? to : String(to).trim(), text: String(text || '').trim(), item: stack, currants: money, reply: reply || null });
    } catch (err) {
      const data = err?.data && typeof err.data === 'object' ? err.data : null;
      return { ok: false, text: String(data?.text || data?.message || err?.message || T.offline), why: data?.why || '' };
    }
    if (d?.status !== 'sent' || !d.letter) return { ok: false, text: T.offline };
    applyReceipt(d.receipt);
    const row = sentRow(d.letter);
    if (row && !rowFor(row.id)) {
      engine.recordSentMail?.(row);
      slice.seen = [...slice.seen, row.id].slice(-300);
    }
    if (reply) {
      const answered = (engine.mailMessages?.() || []).find((m) => m.playerMail === reply && !m.outgoing);
      if (answered) answered.replied = true;
    }
    hookClient();
    if (d.tell && client?.state === 'online') client.send('mail_tell', { token: d.tell });
    lastSent = d.letter.id;
    const parcel = Boolean(stack) || money > 0;
    last = parcel ? T.sentParcel : T.sent;
    engine.save?.();
    publish();
    return { ok: true, id: d.letter.id, row: row?.id || LETTER_ROW(d.letter.id), cost: playerMailCost({ c: stack?.c, n: stack?.n, currants: money }, ITEM_BASE_COSTS), postage: Number(d.letter.postage) || 0, parcel, to: d.letter.to?.name || String(to) };
  }

  // —— Receiving ——

  async function receive(message, { quiet = false } = {}) {
    const id = String(message.ledger || '').slice(5, 21);
    // HOMES2: things in a player's letter are collected only at a mailbox (js/player-mail.js).
    if (!engine.atMailbox?.()) {
      if (!quiet) say(T.notHere);
      last = T.notHere;
      publish();
      return false;
    }
    const item = message.attachmentsClaimed ? null : message.attachment || null;
    if (item) {
      const room = engine.query?.('packRoom', item.classTsid, item.count, engine);
      if (room != null && Number(room) < item.count) {
        if (!quiet) engine.prompt?.({ text: T.bagFull, choices: [{ label: 'OK', value: 'ok' }] });
        last = T.bagFull;
        publish();
        return false;
      }
    }
    let d;
    try {
      d = await account.collectMail(id);
    } catch (err) {
      const data = err?.data && typeof err.data === 'object' ? err.data : null;
      say(String(data?.text || data?.message || T.offline));
      return false;
    }
    if (!['collected', 'done'].includes(d?.status)) return false;
    const applied = applyReceipt(d.receipt, { r: d.letter?.item?.r ?? null });
    message.attachmentsClaimed = true;
    message.read = true;
    if (message.express) message.inMailbox = true;
    if (applied && !quiet) {
      const what = goodsWords(item, Number(message.currants) || 0, (c, n) => label(c, n));
      say(`Received ${what}.`);
      engine.pushActivity?.(`Mail collected: ${what}`);
      engine.playSound?.('ITEM_GIVEN_TO_YOU', { volume: 0.55 });
    }
    engine.save?.();
    publish();
    return true;
  }

  sync();
  hookClient();

  return {
    get rules() { return rules; },
    get sessionStart() { return sessionStart; },
    sync,
    send,
    receive,
    buddies: () => engine.query?.('buddyNames') || [],
    tick(now) {
      hookClient();
      const open = Boolean(engine.mailboxOpen?.());
      if (open && !wasOpen) sync();
      wasOpen = open;
      if (nextAt && now >= nextAt) {
        nextAt = 0;
        sync();
        return;
      }
      if (now - syncedAt > SYNC_EVERY_MS) sync();
    },
  };
}

let session = null;

function ensure(engine) {
  if (session) return session;
  if (engine?.mode !== 'multiplayer' || typeof document === 'undefined') return null;
  session = createSession(engine);
  globalThis.groddlePlayerMail = session;
  return session;
}

export const playerMailFeature = {
  id: PLAYER_MAIL_FEATURE_ID,

  init(engine) {
    multiplayer = engine?.mode === 'multiplayer';
  },

  onTick(dtMs, now, engine) {
    if (engine.mode !== 'multiplayer' || !engine.started) return;
    ensure(engine)?.tick(Date.now());
  },

  /**
   * game.js renderMailboxCompose in multiplayer: the To field's buddies and
   * the source's limits, and the postage for what is in the form.
   */
  mailCompose(engine) {
    const s = ensure(engine);
    if (!s) return null;
    return {
      buddies: s.buddies(),
      rules: s.rules,
      cost: (form) => playerMailCost(form, ITEM_BASE_COSTS),
      placeholder: T.toPlaceholder,
    };
  },

  /** game.js: Send mail in multiplayer, a Promise of { ok, text } or { ok, id, row, postage, parcel, to }. */
  mailSend(form, engine) {
    const s = ensure(engine);
    return s ? s.send(form) : null;
  },

  /** The mailbox's Receive (game.js) and the Frog's hand-over on a player's letter: settled by the site. */
  mailReceive(message, engine, opts = {}) {
    if (!multiplayer || !session || !/^mail-[0-9a-f]{16}-c$/.test(String(message?.ledger || ''))) return null;
    return session.receive(message, opts);
  },

  save() {
    if (!multiplayer || (!slice.seen.length && !slice.toldAt)) return undefined;
    return { seen: slice.seen, toldAt: slice.toldAt };
  },

  restore(s, engine) {
    multiplayer = engine?.mode === 'multiplayer';
    slice = multiplayer ? normalizePlayerMailSlice(s) : normalizePlayerMailSlice(null);
  },
};
