/**
 * One notification system (UI audit 2026-10-29, section 4 and top-10 item 1).
 *
 * Every message the game raises goes through one notifier, in one lane per kind,
 * as the original client kept one lane per kind (GrowlQueue.as: one growl line at
 * a time; Local Chat / Activity for game activity; screens queued in
 * TSFrontController.as screen_view_q):
 *
 * - notice: info, top centre under the street name, at most NOTICE_LIMIT showing,
 *   the newest replacing the oldest, gone after its time; the same words again
 *   within REPEAT_MS show once with a count instead of a second card.
 * - gain: a small reward or cost (iMG, currants, mood, energy, items). It rises
 *   from the avatar or the item (game.js floatText) and lands in the log; gains
 *   in one burst (GAIN_BATCH_MS) become one log line.
 * - moment: a big moment (quest complete, level, badge, skill) already has its
 *   screen in the screen queue (js/screen-queue.js); the notifier only logs it, so
 *   the same words never show as a notice under the screen.
 * - chat: a local chat line. Solo keeps it in the log (scrollback); multiplayer
 *   leaves it to the chat log, never in the notices.
 *
 * The log is the Activity log (js/notify-view.js draws it). This file has no DOM:
 * the view, the zones it measures and game.js call into it.
 */

export const NOTICE_LIMIT = 2;
/** GrowlQueue.as 25-30: a growl held 4 s. */
export const NOTICE_MS = 4000;
export const NOTICE_MIN_MS = 1500;
export const NOTICE_MAX_MS = 12000;
/** The same words again within this long count on the first card instead of raising a second. */
export const REPEAT_MS = 6000;
/** A repeat adds this much time to the card it counts on (capped at its own full time). */
export const REPEAT_EXTEND_MS = 2500;
export const LOG_LIMIT = 200;
/** Gains within this long of each other are one burst: one log line. */
export const GAIN_BATCH_MS = 450;
/** A notice and a gain with the same words this close together are one event (one log line). */
export const PAIR_MS = 1000;
/** The same words raised again this soon are the same event said twice (a toast and its activity line), not a repeat to count. */
export const SAME_EVENT_MS = 60;

/** Floats raised within this long of each other near one spot stack instead of overlapping. */
export const FLOAT_STACK_MS = 400;
export const FLOAT_STACK_PX = 70;
export const FLOAT_LINE_PX = 17;

const UNIT = '(energy|mood|iMG|imagination|xp|currants?|favor)';
const STAT_DELTA = new RegExp(`[+\\-−]\\s?\\d[\\d,]*(?:\\.\\d+)?\\s*${UNIT}\\b`, 'gi');

/** Text with markup removed and spaces collapsed. */
export function plainText(value) {
  return String(value ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * What makes two messages "the same words": case, punctuation and the signed
 * stat amounts don't count, so "Harvested 3 Cherries." and "Harvested 3
 * Cherries. -2 energy, +1 mood." are one message.
 */
export function noticeKey(text) {
  return plainText(text)
    .replace(STAT_DELTA, ' ')
    .replace(/[·•,.;:!?…"'“”‘’()[\]×]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Minus signs as one character, for comparing float texts. */
export function floatKey(text) {
  return plainText(text).replace(/[−–]/g, '-').replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Signed amounts in a gain line: "You harvest a Cherry Tree. -2 energy, +1 mood, +3 Cherry."
 * → { base: 'You harvest a Cherry Tree.', tokens: [{ n: -2, unit: 'energy' }, ...] }.
 * Tokens follow the base as formatActivityLine (js/verb-rewards.js) writes them;
 * null when the tail is not a clean list of amounts.
 */
export function parseGainLine(text) {
  const plain = plainText(text);
  const at = plain.search(/(^|\s)[+\-−]\d/);
  if (at < 0) return { base: plain, tokens: [] };
  const base = plain.slice(0, at).trim();
  const tail = plain.slice(at).trim().replace(/\.$/, '');
  const tokens = [];
  for (const part of tail.split(/\s*(?:,|·)\s*/)) {
    // An amount and a short unit (a stat or an item's name, at most four words, no numbers in it).
    const m = /^([+\-−])\s?(\d[\d,]*)\s+([^\d+\-−\s][^\d+\-−]*?)\.?$/.exec(part.trim());
    if (m && m[3].split(/\s+/).length > 4) return null;
    if (!m) return null;
    const n = Number(m[2].replace(/,/g, '')) * (m[1] === '+' ? 1 : -1);
    tokens.push({ n, unit: m[3] });
  }
  return { base, tokens };
}

/** Effects ({ energy, mood, xp|img, currants, items }) as signed tokens. */
export function effectTokens(effects = {}, labelOf = (id) => id) {
  const out = [];
  const add = (n, unit) => {
    const v = Math.round(Number(n) || 0);
    if (v) out.push({ n: v, unit });
  };
  if (!effects || typeof effects !== 'object') return out;
  add(effects.energy, 'energy');
  add(effects.mood, 'mood');
  add(effects.xp || effects.img, 'iMG');
  add(effects.currants, 'currants');
  for (const [id, n] of Object.entries(effects.items || {})) add(n, labelOf(id));
  return out;
}

/** "+3 iMG", "-2 energy": as formatSignedDelta (js/verb-rewards.js) writes an amount. */
export function tokenText({ n, unit }) {
  return `${n > 0 ? '+' : ''}${n} ${unit}`;
}

/** Adds tokens of the same unit together, keeping first-seen order. */
export function sumTokens(a = [], b = []) {
  const out = a.map((t) => ({ ...t }));
  for (const t of b) {
    const same = out.find((o) => o.unit.toLowerCase() === t.unit.toLowerCase());
    if (same) same.n += t.n;
    else out.push({ ...t });
  }
  return out.filter((t) => t.n);
}

/** A gain line's text: its base, then its amounts. */
export function gainLineText(base, tokens = []) {
  const amounts = tokens.filter((t) => t.n).map(tokenText).join(', ');
  if (!amounts) return base || '';
  if (!base) return amounts;
  return `${/[.!?…]["'”’)]*$/.test(base) ? base : `${base}.`} ${amounts}.`;
}

/**
 * Where a new float goes: floats raised near the same spot within
 * FLOAT_STACK_MS stack upward a line apart, so a burst never draws text on
 * text. `recent` is [{ x, y, t }] of floats already raised (oldest first).
 */
export function stackFloat(recent, x, y, t, { ms = FLOAT_STACK_MS, px = FLOAT_STACK_PX, line = FLOAT_LINE_PX } = {}) {
  let out = y;
  for (const f of recent) {
    if (t - f.t > ms) continue;
    if (Math.abs(f.x - x) > px) continue;
    if (Math.abs(f.y - out) < line) out = f.y - line;
  }
  return out;
}

const defaultNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * The notifier. `now` is ms; `held()` true pauses the notices' clocks (a street
 * loading card, the multiplayer start card: GrowlQueue.as 243-253). `onChange`
 * runs after anything changes (the view redraws then).
 */
export function createNotifier({
  now = defaultNow,
  clock = () => Date.now(),
  held = () => false,
  limit = NOTICE_LIMIT,
  logLimit = LOG_LIMIT,
  repeatMs = REPEAT_MS,
  batchMs = GAIN_BATCH_MS,
  onChange = () => {},
} = {}) {
  /** Showing notices, oldest first. */
  const notices = [];
  /** key → { count, at, entry } of notices raised lately (for counts after a card has gone). */
  const recent = new Map();
  /** The Activity log, oldest first. */
  const entries = [];
  let unread = 0;
  let seq = 0;
  let lastTick = now();
  /** The open burst: the last gain line and when it was last added to. */
  let burst = null;
  const stats = { notices: 0, repeats: 0, gains: 0, batched: 0, moments: 0, chats: 0, dropped: 0 };

  function changed(what) {
    try {
      onChange(what);
    } catch (e) {
      console.warn('notify', e);
    }
  }

  function pushEntry(entry) {
    entries.push(entry);
    while (entries.length > logLimit) entries.shift();
    if (entry.kind !== 'chat') unread += 1;
    return entry;
  }

  /** Writes a line to the log (no notice). */
  function log(text, { kind = 'info', html = null } = {}) {
    const plain = plainText(text);
    if (!plain) return null;
    const entry = pushEntry({ id: ++seq, kind, text: plain, html, count: 1, at: clock() });
    changed('log');
    return entry;
  }

  /**
   * An info notice. Same words within REPEAT_MS (showing or lately gone) count
   * on one card ("×2") and one log line.
   */
  function notice(text, { ms = NOTICE_MS, html = null, log: toLog = true } = {}) {
    const plain = plainText(text);
    if (!plain) return null;
    const t = now();
    const key = noticeKey(plain) || plain.toLowerCase();
    const life = Math.min(NOTICE_MAX_MS, Math.max(NOTICE_MIN_MS, Number(ms) || NOTICE_MS));
    const showing = notices.find((n) => n.key === key);
    const before = recent.get(key);
    if (showing) {
      // The same event said twice at once (a toast and its activity line) is not a repeat.
      const sameEvent = t - (before?.at ?? showing.at) <= SAME_EVENT_MS;
      if (!sameEvent) showing.count += 1;
      // The longer wording wins (a toast and its activity line with the amounts).
      if (plain.length > showing.text.length) {
        showing.text = plain;
        showing.html = html;
      }
      showing.until = Math.max(showing.until, Math.min(t + REPEAT_EXTEND_MS, showing.at + showing.ms + REPEAT_EXTEND_MS * showing.count));
      if (!sameEvent) stats.repeats += 1;
      if (before?.entry) {
        before.entry.count = showing.count;
        if (plain.length > before.entry.text.length) {
          before.entry.text = plain;
          before.entry.html = html;
        }
      }
      recent.set(key, { count: showing.count, at: t, entry: before?.entry || null });
      changed('notice');
      return showing;
    }
    const count = before && t - before.at <= repeatMs ? before.count + 1 : 1;
    const n = { id: ++seq, key, text: plain, html, count, at: t, ms: life, until: t + life };
    notices.push(n);
    while (notices.length > limit) {
      notices.shift();
      stats.dropped += 1;
    }
    stats.notices += 1;
    let entry = null;
    // The same event's gain line just went in (a feature's gain, then its toast): one log line.
    const pairedGain = burst && t - burst.at <= PAIR_MS && burst.key === key && entries.includes(burst.entry);
    if (pairedGain) entry = burst.entry;
    else if (toLog) {
      if (count > 1 && before?.entry && entries.includes(before.entry)) {
        entry = before.entry;
        entry.count = count;
        entry.at = clock();
      } else {
        entry = pushEntry({ id: n.id, kind: 'info', text: plain, html, count: 1, at: clock() });
      }
    }
    recent.set(key, { count, at: t, entry });
    changed('notice');
    return n;
  }

  /**
   * A gain: one log line, merged into the open burst when it comes within
   * GAIN_BATCH_MS of the last (the same wording counts ×N with summed amounts;
   * bare amounts join the line before). Rising floats are game.js's.
   */
  function gain(text, { tokens = null, html = null } = {}) {
    let base;
    let toks;
    if (tokens) {
      base = plainText(text);
      toks = tokens.filter((tk) => tk && tk.n);
    } else {
      const parsed = parseGainLine(text);
      if (!parsed) {
        burst = null;
        return log(text, { kind: 'gain', html });
      }
      base = parsed.base;
      toks = parsed.tokens;
    }
    if (!base && !toks.length) return null;
    const t = now();
    stats.gains += 1;
    const key = noticeKey(base);
    if (burst && t - burst.at <= batchMs && entries.includes(burst.entry) && (!base || burst.key === key)) {
      const e = burst.entry;
      e.tokens = sumTokens(e.tokens, toks);
      if (base) e.count += 1;
      e.text = gainLineText(e.base, e.tokens);
      e.html = null;
      e.at = clock();
      burst.at = t;
      stats.batched += 1;
      changed('log');
      return e;
    }
    // A notice with the same words just went in (a toast, then its activity line): that log line becomes this one.
    const paired = recent.get(key);
    if (base && paired?.entry && t - paired.at <= PAIR_MS && entries.includes(paired.entry) && paired.entry.kind === 'info') {
      const e = paired.entry;
      Object.assign(e, { kind: 'gain', base, tokens: toks, text: gainLineText(base, toks), html, at: clock() });
      burst = { entry: e, key, at: t };
      changed('log');
      return e;
    }
    const entry = pushEntry({ id: ++seq, kind: 'gain', base, tokens: toks, text: gainLineText(base, toks), html, count: 1, at: clock() });
    burst = { entry, key, at: t };
    changed('log');
    return entry;
  }

  /** A big moment's line: logged only; its screen is the screen queue's. */
  function moment(text) {
    stats.moments += 1;
    // The words may already be on a notice (a feature's own toast): that card goes, the screen says it.
    const key = noticeKey(text);
    const i = notices.findIndex((n) => n.key === key);
    if (i >= 0) notices.splice(i, 1);
    return log(text, { kind: 'moment' });
  }

  /** A local chat line: the log in solo (scrollback), nothing in multiplayer (the chat log has it). */
  function chat(text, { online = false } = {}) {
    if (online) return null;
    stats.chats += 1;
    return log(text, { kind: 'chat' });
  }

  /**
   * Once a frame. Notices' clocks stop while `held()` or `hold` (no room, a
   * screen up); a notice raised before `dropBefore` (a panel opened after it)
   * goes early. Returns the notices showing.
   */
  function tick({ hold = false, dropBefore = -Infinity } = {}) {
    const t = now();
    const dt = Math.max(0, t - lastTick);
    lastTick = t;
    let gone = false;
    const paused = hold || held();
    for (let i = notices.length - 1; i >= 0; i--) {
      const n = notices[i];
      if (paused) {
        n.until += dt;
        continue;
      }
      if (t >= n.until || n.at < dropBefore) {
        notices.splice(i, 1);
        gone = true;
      }
    }
    for (const [key, r] of recent) if (t - r.at > repeatMs) recent.delete(key);
    if (gone) changed('notice');
    return notices;
  }

  function dismiss(id) {
    const i = notices.findIndex((n) => n.id === id);
    if (i < 0) return false;
    notices.splice(i, 1);
    changed('notice');
    return true;
  }

  function markRead() {
    if (!unread) return;
    unread = 0;
    changed('read');
  }

  /**
   * The old pushActivity contract: a string is an info notice (and its log line);
   * { base, effects } is a gain; { text|html } a notice with that markup.
   */
  function activity(msg, opts = {}) {
    if (!msg) return null;
    if (typeof msg === 'string') return notice(msg, opts);
    if (typeof msg === 'object') {
      if (msg.effects || msg.base) {
        const tokens = effectTokens(msg.effects || {}, opts.labelOf);
        return gain(msg.base || msg.text || '', { tokens });
      }
      return notice(msg.text || plainText(msg.html), { ...opts, html: msg.html || null });
    }
    return notice(String(msg), opts);
  }

  return {
    notice,
    activity,
    gain,
    moment,
    chat,
    log,
    tick,
    dismiss,
    markRead,
    get notices() {
      return notices;
    },
    get entries() {
      return entries;
    },
    get unread() {
      return unread;
    },
    stats,
  };
}

/* —— Reserved zones ——
 * Rects are { left, top, right, bottom } in one space (the view uses #game-root's
 * CSS px). Something that may move asks where it can sit clear of the zones it
 * must keep off; if nowhere fits it waits.
 */

export function rectsOverlap(a, b, margin = 0) {
  return Boolean(a && b) && a.left < b.right + margin && a.right > b.left - margin && a.top < b.bottom + margin && a.bottom > b.top - margin;
}

/**
 * Moves `rect` down (only down) until it clears every rect in `obstacles`
 * (with `margin`), as long as its bottom stays at or above `maxBottom`.
 * Returns { dy, wait }: wait is true when no spot fits.
 */
export function placeBelow(rect, obstacles = [], { margin = 6, maxBottom = Infinity } = {}) {
  const h = rect.bottom - rect.top;
  let top = rect.top;
  for (let guard = 0; guard < 16; guard++) {
    const now = { ...rect, top, bottom: top + h };
    // The margin keeps a gap above and below; side by side, touching is clear.
    const hit = obstacles.filter((o) => now.left < o.right && now.right > o.left && now.top < o.bottom + margin && now.bottom > o.top - margin);
    if (!hit.length) return { dy: top - rect.top, wait: false };
    top = Math.max(...hit.map((o) => o.bottom)) + margin;
    if (top + h > maxBottom) return { dy: 0, wait: true };
  }
  return { dy: 0, wait: true };
}

/** Space between a banner's art box and an offer card moved under it. */
export const OFFER_CARD_GAP = 8;

/**
 * How far down (px) the Magic Rock's offer card on the street moves to sit
 * under the banners (reserved zones such as the Qurazy line), as the 2012 client
 * stacked them: the in-window overlay at the top of the viewport and the
 * emergency card under it (QuestsDialog.as refresh 132-138: header_h + 80;
 * nothing queued one behind the other). `card` is the card's rect where it sits
 * with no drop. The drop only grows while the card is open (`was`), so a banner
 * fading away never jumps the card back up under the player's pointer. Where no
 * spot fits above `maxBottom` it goes as low as fits.
 */
export function offerCardDrop(card, banners = [], { was = 0, margin = OFFER_CARD_GAP, maxBottom = Infinity } = {}) {
  const prev = Math.max(0, Number(was) || 0);
  if (!card || !(card.bottom > card.top)) return prev;
  const fit = placeBelow(card, banners, { margin, maxBottom });
  let dy = fit.dy;
  if (fit.wait) {
    const hit = banners.filter((o) => card.left < o.right && card.right > o.left && card.top < o.bottom + margin && card.bottom > o.top - margin);
    const want = hit.length ? Math.max(...hit.map((o) => o.bottom)) + margin - card.top : 0;
    dy = Math.max(0, Math.min(want, maxBottom - card.bottom));
  }
  return Math.max(prev, Math.round(dy));
}

/**
 * Moves `rect` sideways (left or right, whichever is shorter and fits inside
 * [minLeft, maxRight]) to clear `obstacles`. Returns { dx, ok }.
 */
export function placeBeside(rect, obstacles = [], { margin = 8, minLeft = -Infinity, maxRight = Infinity } = {}) {
  const hit = obstacles.filter((o) => rectsOverlap(rect, o, margin));
  if (!hit.length) return { dx: 0, ok: true };
  const w = rect.right - rect.left;
  const left = Math.min(...hit.map((o) => o.left)) - margin - w;
  const right = Math.max(...hit.map((o) => o.right)) + margin;
  const options = [];
  if (left >= minLeft) options.push(left - rect.left);
  if (right + w <= maxRight) options.push(right - rect.left);
  if (!options.length) return { dx: 0, ok: false };
  options.sort((a, b) => Math.abs(a) - Math.abs(b));
  const dx = options[0];
  const moved = { ...rect, left: rect.left + dx, right: rect.right + dx };
  return obstacles.some((o) => rectsOverlap(moved, o, margin - 1)) ? { dx: 0, ok: false } : { dx, ok: true };
}
