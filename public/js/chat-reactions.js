/**
 * Reactions on chat lines (the remake's own addition, Austin 2026-11-04: "Another enhancement for chat,
 * can we add emoji responses?"). Glitch had none: its client turned a smiley typed in Local chat into
 * the avatar's happy, angry or surprised animation (port/Emotes.as, RightSideManager.as 470-474) and
 * its updates feed had replies, but a chat line could not be reacted to.
 *
 * Online only, through the realtime server (groddle-afternoon-server reactions.go, im.go im_react):
 * a Local, party, channel or group line carries its id ("lid"), an IM line its id in the conversation.
 * The drawer calls such a line's reaction key `rk`: "l:<lid>" or "im:<player>:<line id>". Lines without
 * an id (solo, notes, the Butler, a server from before reactions) have no reactions. Speech bubbles
 * over avatars never show them.
 *
 * The set is fixed; the server takes nothing else. Fifteen are the system's emoji (text, no art) and one
 * is Tiny Speck's own "Hi" sign (assets/sprites/hi-signs, CC0), as players said hi all day. "Thank you"
 * (the folded hands) came on 2026-11-10, Austin's ask, between Hooray and the Hi sign; eight everyday
 * ones (👏 😊 🤔 😍 🔥 👀 😅 💯) on 2026-11-27, his pick, after it, the Hi sign still last. A page from
 * before a reaction was added leaves it out of a line's chips (normalReactions keeps known keys only),
 * and a server from before it refuses it in words (error "react"), so the set can grow.
 *
 * This list is the only copy: tools/build-reactions.mjs writes it as data/reactions.json for the
 * realtime server (reactions.go reactionKeys) and the site (the boards' and reports' reactions). The
 * picker lays it out PICKER_COLUMNS to a row (two rows of eight), and its arrow keys follow that grid.
 */

/** The reactions, in the order they show: key (the server's word), glyph (text; '' for art), label. */
export const REACTIONS = Object.freeze([
  Object.freeze({ key: 'like', glyph: '👍', label: 'Thumbs up' }),
  Object.freeze({ key: 'heart', glyph: '❤️', label: 'Heart' }),
  Object.freeze({ key: 'laugh', glyph: '😂', label: 'Laughing' }),
  Object.freeze({ key: 'wow', glyph: '😮', label: 'Surprised' }),
  Object.freeze({ key: 'sad', glyph: '😢', label: 'Sad' }),
  Object.freeze({ key: 'tada', glyph: '🎉', label: 'Hooray' }),
  Object.freeze({ key: 'thanks', glyph: '🙏', label: 'Thank you' }),
  Object.freeze({ key: 'clap', glyph: '👏', label: 'Clapping' }),
  Object.freeze({ key: 'smile', glyph: '😊', label: 'Smiling' }),
  Object.freeze({ key: 'think', glyph: '🤔', label: 'Thinking' }),
  Object.freeze({ key: 'love', glyph: '😍', label: 'Heart eyes' }),
  Object.freeze({ key: 'fire', glyph: '🔥', label: 'Fire' }),
  Object.freeze({ key: 'eyes', glyph: '👀', label: 'Looking' }),
  Object.freeze({ key: 'phew', glyph: '😅', label: 'Phew' }),
  Object.freeze({ key: 'hundred', glyph: '💯', label: 'One hundred' }),
  Object.freeze({ key: 'hi', glyph: '', label: 'Hi', art: 'assets/sprites/hi-signs/hi_hi_1@3x.webp' }),
]);

/**
 * How many reactions the picker shows to a row (style.css and classic.css .react-picker, the site's
 * community.css .cpicker draw this many columns): two rows of eight fit a line's column of the chat
 * drawer in both skins and a 390 px phone.
 */
export const PICKER_COLUMNS = 8;

/** How many names a chip's label lists before "and N others". */
export const NAMES_SHOWN = 8;

/** PURE: the reaction for a key, or null. */
export function reactionOf(key) {
  return REACTIONS.find((r) => r.key === key) || null;
}

/** PURE: a Local, party or channel line's key, '' without an id. */
export function lineKey(lid) {
  const n = Math.floor(Number(lid));
  return n > 0 ? `l:${n}` : '';
}

/** PURE: an IM line's key: the other player and the line's id in the conversation, '' without either. */
export function imKey(withId, lineId) {
  const w = Math.floor(Number(withId));
  const n = Math.floor(Number(lineId));
  return w > 0 && n > 0 ? `im:${w}:${n}` : '';
}

/** PURE: what a key addresses: { kind: 'line', line } or { kind: 'im', with, line }, or null. */
export function parseKey(rk) {
  const s = String(rk || '');
  let m = /^l:(\d{1,16})$/.exec(s);
  if (m) return { kind: 'line', line: Number(m[1]) };
  m = /^im:(\d{1,12}):(\d{1,12})$/.exec(s);
  if (m) return { kind: 'im', with: Number(m[1]), line: Number(m[2]) };
  return null;
}

/** PURE: the frame that puts (on) or takes off one reaction, or null for a bad key or reaction. */
export function reactFrame(rk, key, on) {
  const at = parseKey(rk);
  if (!at || !reactionOf(key)) return null;
  if (at.kind === 'im') return { t: 'im_react', payload: { with: at.with, line: at.line, e: key, on: Boolean(on) } };
  return { t: 'react', payload: { line: at.line, e: key, on: Boolean(on) } };
}

/**
 * PURE: a server's reactions ("r": [{ e, by: [{ id, name }] }]) as the drawer keeps them: the set's
 * order, known reactions only, each player once, and none by a player `hidden(id)` says you block.
 */
export function normalReactions(raw, { hidden = () => false } = {}) {
  const out = [];
  if (!Array.isArray(raw)) return out;
  for (const def of REACTIONS) {
    const r = raw.find((x) => x?.e === def.key);
    if (!r || !Array.isArray(r.by)) continue;
    const seen = new Set();
    const by = [];
    for (const b of r.by) {
      const id = Math.floor(Number(b?.id));
      if (!(id > 0) || seen.has(id) || hidden(id)) continue;
      seen.add(id);
      by.push({ id, name: String(b?.name || '').slice(0, 40) || 'Someone' });
    }
    if (by.length) out.push({ key: def.key, by });
  }
  return out;
}

/** PURE: whether `me` is among a chip's players. */
export function isMine(chip, me) {
  const id = Number(me) || 0;
  return id > 0 && Boolean(chip?.by?.some((b) => b.id === id));
}

/**
 * PURE: who reacted, in words: "you and mr granberry", "Ada, Bo and 3 others". You first (as "you",
 * or "You" at the start with `capital`), the rest in the order they reacted.
 */
export function whoText(by, me, { capital = false, max = NAMES_SHOWN } = {}) {
  const id = Number(me) || 0;
  const names = [];
  if ((by || []).some((b) => b.id === id && id > 0)) names.push(capital ? 'You' : 'you');
  for (const b of by || []) if (b.id !== id) names.push(b.name);
  if (!names.length) return '';
  if (names.length > max) {
    const more = names.length - (max - 1);
    return `${names.slice(0, max - 1).join(', ')} and ${more} others`;
  }
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/** PURE: a chip's spoken name: "👍 2, you and mr granberry" (the Hi sign is "Hi 2, …"). */
export function chipLabel(chip, me) {
  const def = reactionOf(chip?.key);
  if (!def) return '';
  const n = chip.by?.length || 0;
  return `${def.glyph || def.label} ${n}, ${whoText(chip.by, me)}`;
}

/** PURE: a chip's tooltip: "Thumbs up: You and mr granberry". */
export function chipTip(chip, me) {
  const def = reactionOf(chip?.key);
  if (!def) return '';
  return `${def.label}: ${whoText(chip.by, me, { capital: true })}`;
}

/** PURE: the add button's spoken name: "React to mr granberry's message" ("your message" for yours). */
export function addLabel(line) {
  if (line?.mine) return 'React to your message';
  const name = String(line?.name || '').trim();
  return name ? `React to ${name}'s message` : 'React to this message';
}

/**
 * PURE: the picker's next item for a key in its grid of `cols` a row: ArrowLeft / ArrowRight step
 * through the set (on to the next row at a row's end, wrapping), ArrowUp / ArrowDown move a row in
 * the same column (wrapping to the column's other end), Home / End go to the first and the last;
 * -1 for a key it does not move on.
 */
export function pickerMove(index, key, n = REACTIONS.length, cols = PICKER_COLUMNS) {
  const i = Math.max(0, Math.min(n - 1, Math.floor(Number(index)) || 0));
  const c = Math.max(1, Math.min(n, Math.floor(Number(cols)) || 1));
  switch (key) {
    case 'ArrowRight':
      return (i + 1) % n;
    case 'ArrowLeft':
      return (i - 1 + n) % n;
    case 'ArrowDown':
      return i + c < n ? i + c : i % c;
    case 'ArrowUp': {
      if (i - c >= 0) return i - c;
      const col = i % c;
      return col + c * Math.floor((n - 1 - col) / c);
    }
    case 'Home':
      return 0;
    case 'End':
      return n - 1;
    default:
      return -1;
  }
}

/** PURE: two lists of reactions the same (to skip a redraw that changes nothing). */
export function sameReactions(a, b) {
  if ((a?.length || 0) !== (b?.length || 0)) return false;
  return (a || []).every((x, i) => x.key === b[i].key && x.by.length === b[i].by.length && x.by.every((p, j) => p.id === b[i].by[j].id && p.name === b[i].by[j].name));
}

/** PURE: a chat line's words compared as the server keeps them (one line, single spaces). */
export function sameWords(a, b) {
  const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
  return norm(a) === norm(b);
}
