/**
 * The featured street project's two small views (G656; js/featured-project.js has the rule's
 * notes and the words): a pill over the world under the street name, and a row in the Feat panel
 * (H) under the shared Feat. Both are buttons: a click opens the Projects panel (P) on the
 * featured project, with its details and Set as Destination (the guided path there).
 * features/street-jobs-feature.js mounts and fills them, multiplayer only.
 *
 * Both skins: Modern's Warm paper pill (tokens) and Classic's 2012 look (white panel, Arial, the
 * client's outline), every Classic rule under :root[data-ui="classic"]. Text is set as text.
 * QA hooks: #featured-project-pill [data-featured-job], #featured-project-row [data-featured-job].
 */

import { FEATURED_TEXT as T, featuredLabel, featuredPillText, featuredStatus, featuredWhere } from '../featured-project.js?v=3cc0565c';

export const FEATURED_PILL_ID = 'featured-project-pill';
export const FEATURED_ROW_ID = 'featured-project-row';
const STAR = 'm6 .8 1.6 3.3 3.6.5-2.6 2.5.6 3.6L6 9 2.8 10.7l.6-3.6L.8 4.6l3.6-.5z';

const STYLE = `
.featured-pill { position: absolute; z-index: var(--z-hud); top: calc(var(--hud-h, 2.4rem) + var(--space-2)); left: 50%; transform: translateX(-50%);
  display: inline-flex; align-items: center; gap: var(--space-2); max-width: min(26rem, calc(100% - 2rem)); padding: var(--space-1) var(--space-3);
  border: 1px solid var(--border); border-radius: var(--radius-pill); background: var(--surface); color: var(--text); box-shadow: var(--shadow-2);
  font: var(--fw-bold) var(--fs-xs)/var(--lh-tight) var(--font-ui); white-space: nowrap; cursor: pointer; pointer-events: auto; }
.featured-pill[hidden] { display: none; }
body.nx-tutorial .featured-pill, body.nx-tutorial .featured-row { display: none; }
.featured-pill:hover { border-color: var(--accent); }
.featured-pill:focus-visible { outline: none; box-shadow: var(--shadow-2), 0 0 0 2px var(--focus); }
.featured-pill .fp-star, .featured-row .fp-star { flex: none; width: 0.95em; height: 0.95em; color: var(--accent); }
.featured-pill .fp-text { overflow: hidden; text-overflow: ellipsis; }
.featured-pill .fp-bar { flex: none; width: 3rem; height: 0.35rem; border-radius: var(--radius-pill); background: var(--border); overflow: hidden; }
.featured-pill .fp-bar i { display: block; height: 100%; width: var(--p, 0%); background: var(--accent); }
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
  i.style.setProperty('--p', `${Math.max(0, Math.min(100, Math.round(percent)))}%`);
  b.append(i);
  return b;
}

function span(doc, cls, text) {
  const s = doc.createElement('span');
  s.className = cls;
  s.textContent = text;
  return s;
}

/**
 * The pill over the world: made once in #game-root, filled with `f` (hidden when null).
 * @param {Document} doc
 * @param {object|null} f featuredFromServer's answer
 * @param {{ onOpen?: Function, now?: number, needs?: string }} o
 */
export function renderFeaturedPill(doc, f, o = {}) {
  const root = doc.getElementById('game-root');
  if (!root) return null;
  ensureStyle(doc);
  let pill = doc.getElementById(FEATURED_PILL_ID);
  if (!pill) {
    pill = doc.createElement('button');
    pill.type = 'button';
    pill.id = FEATURED_PILL_ID;
    pill.className = 'featured-pill';
    pill.hidden = true;
    pill.addEventListener('click', () => pill._onOpen?.());
    root.append(pill);
  }
  pill._onOpen = o.onOpen;
  if (!f) {
    pill.hidden = true;
    pill.dataset.featuredJob = '';
    return pill;
  }
  const sig = `${f.jobId}|${f.label}|${f.percent}`;
  if (pill.dataset.sig !== sig) {
    pill.dataset.sig = sig;
    pill.replaceChildren(starIcon(doc), span(doc, 'fp-text', featuredPillText(f)), bar(doc, f.percent));
  }
  pill.dataset.featuredJob = f.jobId;
  // Ticket 240: what is left rides on the pill's tip and name (the pill itself stays short for phones).
  pill.title = o.needs ? `${T.pillTip} ${o.needs}.` : T.pillTip;
  pill.setAttribute('aria-label', `${featuredLabel(f, o.now)}${o.needs ? ` ${o.needs}.` : ''}`);
  pill.hidden = Boolean(o.hide);
  return pill;
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
