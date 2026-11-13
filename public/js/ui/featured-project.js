/**
 * The featured street project's small views (G656; js/featured-project.js has the rule's notes and
 * the words): a thin progress line along the bottom edge of the street name bubble, with the star
 * at its end, and a row in the Feat panel (H) under the shared Feat. Both are buttons: a click
 * opens the Projects panel (P) on the featured project, with its details and Set as Destination
 * (the guided path there). features/street-jobs-feature.js mounts and fills them, multiplayer only.
 *
 * The line (Austin 2026-11-13: the pill under the name was "very often overlaid by other info"; his
 * pick, fold it into the street name bubble): it lives inside #street-nameplate, so the notices and
 * the NPC lines that measure the bubble stack under one box. Hover or keyboard focus shows
 * "Featured: <project> · <n>%" in the bar's own tooltip (js/ui/topbar.js installTooltips, data-tip).
 * Glitch had no such line (Tiny Speck chose which streets opened); it is ours.
 *
 * Both skins: Modern's accent purple, Classic's 2012 tool-wear teal under "Current location"
 * (css/classic.css, block bubble). Text is set as text.
 * QA hooks: #featured-project-pill [data-featured-job] (the line keeps the pill's id),
 * #featured-project-row [data-featured-job].
 */

import { FEATURED_TEXT as T, featuredLabel, featuredPillText, featuredStatus, featuredWhere } from '../featured-project.js?v=4210bead';

/** The line in the street name bubble; it keeps the old pill's id so routes and QA still find it. */
export const FEATURED_PILL_ID = 'featured-project-pill';
export const FEATURED_ROW_ID = 'featured-project-row';
/** PHONE (Austin 2026-11-12): the Menu's row that stands in for the pill on a phone. */
export const FEATURED_MENU_ID = 'menu-featured-btn';
const STAR = 'm6 .8 1.6 3.3 3.6.5-2.6 2.5.6 3.6L6 9 2.8 10.7l.6-3.6L.8 4.6l3.6-.5z';

const STYLE = `
.featured-line { position: absolute; left: var(--space-4); right: var(--space-4); bottom: 0; height: var(--space-3); margin: 0; padding: 0;
  border: 0; border-radius: var(--radius-pill); background: none; color: var(--accent); cursor: pointer; pointer-events: auto; --p: 0%; }
.featured-line[hidden] { display: none; }
body.nx-tutorial .featured-line, body.nx-tutorial .featured-row { display: none; }
body.nx-tutorial #menu-featured-btn { display: none; }
.featured-line .fp-track { position: absolute; left: 0; right: 0; bottom: var(--space-1); height: 2px; border-radius: var(--radius-pill);
  background: color-mix(in srgb, currentColor 20%, transparent); overflow: hidden; }
.featured-line .fp-track i { display: block; height: 100%; width: var(--p); background: currentColor; border-radius: inherit; }
.featured-line .fp-star { position: absolute; left: var(--p); bottom: calc(var(--space-1) + 1px); width: 0.6rem; height: 0.6rem; transform: translate(-50%, 50%); }
.featured-line:hover .fp-track { height: 3px; }
.featured-line:focus-visible { outline: none; }
.featured-line:focus-visible .fp-track { height: 3px; box-shadow: 0 0 0 2px var(--focus); overflow: visible; }
.featured-row .fp-star { flex: none; width: 0.95em; height: 0.95em; color: var(--accent); }
.featured-row { display: grid; grid-template-columns: auto 1fr; gap: var(--space-1) var(--space-2); width: 100%; margin: 0 0 var(--space-3); padding: var(--space-2) var(--space-3);
  border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface-card); color: var(--text); text-align: left;
  font: var(--fs-sm)/var(--lh-tight) var(--font-ui); cursor: pointer; }
.featured-row[hidden] { display: none; }
.featured-row:hover { border-color: var(--accent); }
.featured-row:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--focus); }
.featured-row .fp-star { grid-row: span 2; align-self: center; width: 1.2em; height: 1.2em; }
.featured-row .fp-kicker { font-size: var(--fs-2xs); font-weight: var(--fw-heavy); letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-muted); }
.featured-row .fp-title { font-weight: var(--fw-heavy); }
.featured-row .fp-sub { grid-column: 2; color: var(--text-muted); font-size: var(--fs-xs); }
.featured-row .fp-bar { grid-column: 2; height: 0.35rem; border-radius: var(--radius-pill); background: var(--border); overflow: hidden; }
.featured-row .fp-bar i { display: block; height: 100%; width: var(--p, 0%); background: var(--accent); }
.featured-row .fp-needs { grid-column: 2; font-size: var(--fs-xs); color: var(--text); }
.featured-row .fp-open { grid-column: 2; font-size: var(--fs-xs); font-weight: var(--fw-bold); color: var(--accent); }
.pj-card.is-featured { box-shadow: inset 0 0 0 2px var(--accent); }
.pj-featured-tag { display: inline-flex; align-items: center; gap: 0.2em; margin-right: var(--space-1); padding: 0 var(--space-2); border-radius: var(--radius-pill);
  font-size: var(--fs-2xs); font-weight: var(--fw-heavy); vertical-align: middle; color: var(--text-inverse); background: var(--accent); }
.pj-featured-tag svg { width: 0.9em; height: 0.9em; }
`;

function ensureStyle(doc) {
  const into = doc.head || doc.body;
  if (!into?.append || doc.getElementById?.('featured-project-style')) return;
  const style = doc.createElement('style');
  style.id = 'featured-project-style';
  style.textContent = STYLE;
  into.append(style);
}

/** The star (CC0: the same five points the top bar's favor ring draws). */
export function starIcon(doc) {
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 12 12');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'fp-star');
  const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', STAR);
  path.setAttribute('fill', 'currentColor');
  svg.append(path);
  return svg;
}

function bar(doc, percent) {
  const b = doc.createElement('span');
  b.className = 'fp-bar';
  b.setAttribute('aria-hidden', 'true');
  const i = doc.createElement('i');
  i.style.setProperty('--p', `${pct(percent)}%`);
  b.append(i);
  return b;
}

function span(doc, cls, text) {
  const s = doc.createElement('span');
  s.className = cls;
  s.textContent = text;
  return s;
}

function pct(percent) {
  return Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
}

/**
 * The line in the street name bubble: made once in #street-nameplate, filled with `f` (hidden
 * when null). Its words ride on its tooltip (data-tip) and its accessible name; what is left
 * (ticket 240) is the tooltip's second part.
 * @param {Document} doc
 * @param {object|null} f featuredFromServer's answer
 * @param {{ onOpen?: Function, now?: number, needs?: string, hide?: boolean }} o
 */
export function renderFeaturedLine(doc, f, o = {}) {
  const plate = doc.getElementById('street-nameplate');
  if (!plate) return null;
  ensureStyle(doc);
  let line = doc.getElementById(FEATURED_PILL_ID);
  if (!line) {
    line = doc.createElement('button');
    line.type = 'button';
    line.id = FEATURED_PILL_ID;
    line.className = 'featured-line';
    line.hidden = true;
    line.addEventListener('click', (e) => {
      // The bubble's own click opens the Map (js/ui/topbar.js installLocationLink); this one is the project's.
      e?.stopPropagation?.();
      line._onOpen?.();
    });
    // Enter and Space are the game's keys (Space jumps): taken here, as the street name takes them.
    line.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      e.stopPropagation();
      line._onOpen?.();
    });
    const track = doc.createElement('span');
    track.className = 'fp-track';
    track.setAttribute('aria-hidden', 'true');
    track.append(doc.createElement('i'));
    line.append(track, starIcon(doc));
  }
  if (line.parentElement !== plate) plate.append(line);
  line._onOpen = o.onOpen;
  if (!f) {
    line.hidden = true;
    line.dataset.featuredJob = '';
    line.dataset.tip = '';
    renderFeaturedMenuRow(doc, null, o);
    return line;
  }
  line.style.setProperty('--p', `${pct(f.percent)}%`);
  line.dataset.featuredJob = f.jobId;
  line.dataset.percent = String(pct(f.percent));
  line.dataset.tip = featuredPillText(f);
  if (o.needs) line.dataset.sub = o.needs;
  else delete line.dataset.sub;
  line.setAttribute('aria-label', `${featuredLabel(f, o.now)}${o.needs ? ` ${o.needs}.` : ''}`);
  line.hidden = Boolean(o.hide);
  renderFeaturedMenuRow(doc, o.hide ? null : f, o);
  return line;
}

/**
 * PHONE (Austin 2026-11-12 on his iPhone): the pill covered the street's name under the top bar, so a
 * phone shows no pill, and now no line (style.css PHONE6) and the Menu's first group carries it instead: "Featured:
 * Tuntsa Coze · 92%" with its bar, opening the same Projects card. Made in #more-list (js/ui/topbar.js
 * MENU_ROWS places it in the phone's Now group); shown only on a phone in Modern, by style.css.
 * @param {Document} doc
 * @param {object|null} f
 * @param {{ onOpen?: Function, now?: number, needs?: string }} o
 */
export function renderFeaturedMenuRow(doc, f, o = {}) {
  const list = doc.getElementById?.('more-list');
  // Computers and tablets keep the line in the bubble and never get the row.
  if (!list || !doc.documentElement?.classList?.contains('touch-phone')) return null;
  let row = doc.getElementById(FEATURED_MENU_ID);
  if (!row) {
    row = doc.createElement('button');
    row.type = 'button';
    row.id = FEATURED_MENU_ID;
    row.className = 'chrome-btn menu-phone-row menu-featured-row';
    row.hidden = true;
    row.addEventListener('click', () => {
      const more = doc.getElementById('more-btn');
      if (more && !list.hidden) more.click();
      row._onOpen?.();
    });
    list.append(row);
  }
  row._onOpen = o.onOpen;
  if (!f) {
    row.hidden = true;
    row.dataset.featuredJob = '';
    return row;
  }
  const sig = `${f.jobId}|${f.label}|${f.percent}`;
  if (row.dataset.sig !== sig) {
    row.dataset.sig = sig;
    row.replaceChildren(starIcon(doc), span(doc, 'fp-text', featuredPillText(f)), bar(doc, f.percent));
  }
  row.dataset.featuredJob = f.jobId;
  row.setAttribute('aria-label', `${featuredLabel(f, o.now)}${o.needs ? ` ${o.needs}.` : ''}`);
  row.hidden = false;
  return row;
}

/**
 * The Feat panel's row (H): under the shared Feat, made again when the Feat panel draws its own box.
 * @param {Document} doc
 * @param {object|null} f
 * @param {{ onOpen?: Function, now?: number, needs?: string }} o
 */
export function renderFeaturedRow(doc, f, o = {}) {
  const body = doc.querySelector('#feat-panel .ui-sheet-body') || doc.querySelector('#feat-panel .feat-card');
  if (!body) return null;
  ensureStyle(doc);
  let row = doc.getElementById(FEATURED_ROW_ID);
  if (!row) {
    row = doc.createElement('button');
    row.type = 'button';
    row.id = FEATURED_ROW_ID;
    row.className = 'featured-row';
    row.addEventListener('click', () => row._onOpen?.());
  }
  // Under the shared Feat (features/solo-feats-feature.js #solo-feats), else first in the panel.
  const feat = body.querySelector('#solo-feats');
  if (feat && feat.nextSibling !== row) feat.after(row);
  else if (!feat && row.parentElement !== body) body.prepend(row);
  row._onOpen = o.onOpen;
  if (!f) {
    row.hidden = true;
    row.dataset.featuredJob = '';
    return row;
  }
  row.replaceChildren(
    starIcon(doc),
    span(doc, 'fp-kicker', T.heading),
    span(doc, 'fp-title', f.label),
    span(doc, 'fp-sub', `${featuredWhere(f)}. ${featuredStatus(f, o.now)}.`),
    bar(doc, f.percent),
    // Ticket 240: what is left, before the trip there.
    ...(o.needs ? [span(doc, 'fp-needs', o.needs)] : []),
    span(doc, 'fp-open', `${T.open} (P)`),
  );
  row.dataset.featuredJob = f.jobId;
  row.setAttribute('aria-label', `${featuredLabel(f, o.now)}${o.needs ? ` ${o.needs}.` : ''}`);
  row.hidden = false;
  return row;
}

/** The Projects panel's "Featured" tag before a card's title. */
export function featuredTag(doc) {
  ensureStyle(doc);
  const tag = doc.createElement('span');
  tag.className = 'pj-featured-tag';
  tag.append(starIcon(doc), doc.createTextNode(T.tag));
  return tag;
}
