/**
 * Quest text as the client showed it. GSJS quest copy (desc, offer, completion and
 * each requirement's desc in quests/*.js) is Flash htmlText: the client set it with
 * tf.htmlText (QuestElementUI.as 159-176, QuestRequirementUI.as 104-107,
 * QuestTracker.as 212-216), so <b>, <i> and <br> were real formatting and
 * <a href="event:item|...">, the item and skill links, were clickable names
 * (TSLinkedTextField.as 74-104). The catalog carries <a>, <b>, <i>, <br> and <split>.
 *
 * Here the markup becomes segments, and the DOM is built from those with
 * createElement/createTextNode only: a small whitelist is drawn as formatting,
 * every other tag is dropped with its text kept, and no source string ever
 * reaches innerHTML.
 */
import { decodeEntities } from './html-text.js?v=6bbf4d1f';
import { currentPcLabel } from './pc-label.js?v=d54da634';

// G955: the one entity decoder (js/html-text.js); a non-breaking space reads as a space here.
const decodeText = (text) => decodeEntities(text).replace(/\u00a0/g, ' ');

/** Only these change how text looks; everything else is dropped, its text kept. */
const BOLD = new Set(['b', 'strong']);
const ITALIC = new Set(['i', 'em']);
/** These end a line (Flash's <br>, a closed <p>, and a <split> page break shown on one card). */
const BREAKS = new Set(['br', 'split']);

const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g;

function linkOf(attrs) {
  const href = /\bhref\s*=\s*(["'])(.*?)\1/i.exec(attrs || '')?.[2] || '';
  const m = /^event:([a-z_]+)\|?(.*)$/i.exec(href);
  if (!m) return { kind: 'external', id: '' };
  return { kind: m[1].toLowerCase(), id: m[2] || '' };
}

/**
 * Quest markup → segments: { text, bold?, italic?, link? } and { br: true }.
 * Line breaks in the source text (\r\n in offers) are breaks too, as in cleanQuestMarkup.
 * @param {string} raw
 * @param {{ playerLabel?: string }} [opts]  `{pc_label}`, the player's name in GSJS copy (default: your
 *   name online, "friend" solo, js/pc-label.js currentPcLabel)
 */
export function questTextSegments(raw = '', { playerLabel = currentPcLabel() } = {}) {
  const source = String(raw ?? '')
    .replace(/\{pc_label\}/g, playerLabel)
    .replace(/\r\n?/g, '\n');
  const out = [];
  let bold = 0;
  let italic = 0;
  const links = [];
  const pushText = (chunk) => {
    if (!chunk) return;
    const lines = decodeText(chunk).split('\n');
    lines.forEach((line, n) => {
      if (n > 0) out.push({ br: true });
      if (!line) return;
      const seg = { text: line };
      if (bold) seg.bold = true;
      if (italic) seg.italic = true;
      if (links.length && links[links.length - 1]) seg.link = links[links.length - 1];
      const prev = out[out.length - 1];
      if (prev && !prev.br && prev.bold === seg.bold && prev.italic === seg.italic && prev.link === seg.link) {
        prev.text += seg.text;
      } else out.push(seg);
    });
  };
  let cursor = 0;
  let m;
  TAG.lastIndex = 0;
  while ((m = TAG.exec(source))) {
    pushText(source.slice(cursor, m.index));
    cursor = TAG.lastIndex;
    const closing = m[1] === '/';
    const name = m[2].toLowerCase();
    if (BOLD.has(name)) bold = Math.max(0, bold + (closing ? -1 : 1));
    else if (ITALIC.has(name)) italic = Math.max(0, italic + (closing ? -1 : 1));
    else if (name === 'a') {
      if (closing) links.pop();
      else {
        const link = linkOf(m[3]);
        links.push(link.kind === 'external' ? null : link);
      }
    } else if (BREAKS.has(name) && !closing) out.push({ br: true });
    else if (name === 'p' && closing) out.push({ br: true });
  }
  pushText(source.slice(cursor));
  // As cleanQuestMarkup: no spaces before a break, at most one blank line, nothing at the ends.
  for (let i = 0; i < out.length - 1; i++) {
    if (!out[i].br && out[i + 1].br) out[i].text = out[i].text.replace(/[ \t]+$/, '');
  }
  const tidy = [];
  let run = 0;
  for (const seg of out) {
    if (!seg.br && !seg.text) continue;
    if (seg.br) {
      if (!tidy.length || run >= 2) continue;
      run += 1;
    } else run = 0;
    tidy.push(seg);
  }
  while (tidy.length && tidy[tidy.length - 1].br) tidy.pop();
  if (tidy[0]) tidy[0].text = tidy[0].text.replace(/^\s+/, '');
  const last = tidy[tidy.length - 1];
  if (last) last.text = last.text.replace(/\s+$/, '');
  return tidy.filter((s) => s.br || s.text);
}

/** The same text with no formatting (tooltips, data attributes, tests). */
export function questTextPlain(raw = '', opts = {}) {
  return questTextSegments(raw, opts).map((s) => (s.br ? '\n' : s.text)).join('');
}

/**
 * Replace `el`'s children with the quest text, formatted. Plain text is set as
 * textContent; formatted text is built from nodes only: <b>/<i> for the whitelist, a span.q-link for an item, skill or other in-game
 * link (data-quest-link="item|test_tube"), <br> for a break. Returns el.
 * @param {Element} el
 * @param {string} raw
 * @param {{ playerLabel?: string }} [opts]
 */
export function renderQuestText(el, raw = '', opts = {}) {
  if (!el) return el;
  const segments = questTextSegments(raw, opts);
  // Plain copy (most of it) is just text.
  if (segments.every((seg) => !seg.br && !seg.bold && !seg.italic && !seg.link)) {
    el.textContent = segments.map((seg) => seg.text).join('');
    return el;
  }
  const doc = el.ownerDocument || globalThis.document;
  el.textContent = '';
  for (const seg of segments) {
    if (seg.br) {
      el.appendChild(doc.createElement('br'));
      continue;
    }
    let node = doc.createTextNode(seg.text);
    if (seg.italic) {
      const i = doc.createElement('i');
      i.appendChild(node);
      node = i;
    }
    if (seg.bold) {
      const b = doc.createElement('b');
      b.appendChild(node);
      node = b;
    }
    if (seg.link) {
      const span = doc.createElement('span');
      span.className = 'q-link';
      span.setAttribute('data-quest-link', seg.link.id ? `${seg.link.kind}|${seg.link.id}` : seg.link.kind);
      // A place opens the Map (locationLinkTarget; game.js opens it), so it is a link you can reach and press.
      if (locationLinkTarget(seg.link)) {
        span.setAttribute('role', 'link');
        span.setAttribute('tabindex', '0');
        span.setAttribute('title', 'Show on the Map');
      }
      span.appendChild(node);
      node = span;
    }
    el.appendChild(node);
  }
  return el;
}

/**
 * A place in quest copy (<a href="event:location|95">Xalanga</a>): Glitch opened the Map on it
 * (TSLinkedTextField.as 141-162): "location|hub#street" on that region with the street shown,
 * "location|hub" on the region, "location|map" the Map as it opens. Spaces in a link are dropped
 * there too. Takes a segment's link ({ kind, id }) or a data-quest-link value ("location|95").
 * @returns {{ map: true } | { hubId: string, tsid: string } | null}
 */
export function locationLinkTarget(link) {
  const raw = typeof link === 'string' ? link : link && link.kind === 'location' ? `location|${link.id || ''}` : '';
  const m = /^location\|(.*)$/i.exec(String(raw || ''));
  if (!m) return null;
  const [hub = '', street = ''] = m[1].split('#').map((x) => x.split(' ').join(''));
  if (hub === 'map') return { map: true };
  if (!/^\d+$/.test(hub)) return null;
  return { hubId: hub, tsid: street ? street.replace(/^L/, 'G') : '' };
}

/**
 * A requirement line as the client's quest tracker wrote it: the desc, then
 * " (got/need)" only when more than one is needed (QuestTracker.as 212-214,
 * QuestQueue.as 156-157). Nothing is joined with ": ", so a desc ending in
 * ".", "!" or "?" never reads ".:". Returns markup: the desc keeps its tags.
 */
export function questRequirementText(desc, got, need) {
  const n = Math.max(0, Math.floor(Number(need) || 0));
  const g = Math.max(0, Math.min(n, Math.floor(Number(got) || 0)));
  const text = String(desc ?? '').trim();
  return n > 1 ? `${text} (${g}/${n})` : text;
}

/**
 * Give each conversation beat (parseQuestConversation's { text, response }) the
 * markup of its own page, so a dialogue can show the source's bold and italics.
 * Pages split on <split ... /> exactly as parseQuestConversation does; if the
 * count differs the beats are returned as they were (their plain text still shows).
 */
export function withQuestMarkup(beats, raw = '') {
  if (!Array.isArray(beats) || !beats.length) return beats;
  const source = String(raw || '').replace(/\r\n?/g, '\n').trim();
  const split = /<split\b[^>]*butt_txt=(["'])(.*?)\1[^>]*\/?>/gis;
  const pages = [];
  let cursor = 0;
  let m;
  while ((m = split.exec(source))) {
    const markup = source.slice(cursor, m.index);
    if (questTextPlain(markup) || questTextPlain(m[2])) pages.push(markup);
    cursor = split.lastIndex;
  }
  const tail = source.slice(cursor);
  if (questTextPlain(tail)) pages.push(tail);
  if (pages.length !== beats.length) return beats;
  return beats.map((beat, n) => ({ ...beat, markup: pages[n] }));
}
