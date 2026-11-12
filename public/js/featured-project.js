/**
 * The featured street project (register G656, Austin 2026-11-11): "One featured street project at
 * a time, shown with the Feat and announced in Global. It might take many days before a project
 * is finished, so keep it until it's finished before opening the next one." Report #183 (Osprey):
 * with the whole world waiting to be rebuilt, projects get lost; Glitch ran one well-publicised
 * project at a time. Glitch had no featured-project screen (Tiny Speck chose which streets opened),
 * so the screen and its words are ours.
 *
 * Multiplayer only: the realtime server picks it and keeps it (groddle-afternoon-server
 * projects_featured.go, its rule in that file's header) and sends project_featured on every
 * project_sync and when it changes or moves. Solo has no shared world to rebuild together, so it
 * shows nothing.
 *
 * Pure: the message read into a plain object, and the words the pill, the Feat panel's row, the
 * Projects panel and the giver's bubble show. features/street-jobs-feature.js draws them
 * (js/ui/featured-project.js).
 */

export const FEATURED_TEXT = Object.freeze({
  tag: 'Featured',
  heading: 'Featured street project',
  copy: 'One street project at a time, for everyone to build together. It stays featured until it is built.',
  open: 'See the project',
  toast: (label) => `New featured street project: ${label}.`,
  pillTip: 'The featured street project. Click for its details and the way there.',
  waiting: 'Opens soon',
  needs: 'Needs',
});

const whole = (v) => Math.max(0, Math.floor(Number(v) || 0));
const clean = (v, n = 64) => String(v ?? '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, n);
const words = (v, n = 80) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);

/**
 * project_featured into { jobId, kind, street, board, label, hub, boardLabel, phase, phases, perc,
 * percent, since, by, readyAt, row } in this page's clock, or null when nothing is featured.
 * `row` is the server's row as it came (street-jobs-mp.js rowFromServer reads it).
 * @param {object} msg
 * @param {number} offset server ms minus this page's ms
 */
export function featuredFromServer(msg, offset = 0) {
  const jobId = clean(msg?.job, 16);
  if (!jobId) return null;
  const local = (t) => (whole(t) ? whole(t) - offset : 0);
  const phases = Math.max(1, whole(msg.phases));
  return {
    jobId,
    kind: msg.kind === 'upgrade' ? 'upgrade' : 'street',
    street: clean(msg.street),
    board: clean(msg.board),
    label: words(msg.label) || jobId,
    hub: words(msg.hub),
    boardLabel: words(msg.boardLabel),
    phase: Math.min(phases - 1, whole(msg.phase)),
    phases,
    perc: Math.max(0, Math.min(1, Number(msg.perc) || 0)),
    percent: Math.min(100, whole(msg.percent)),
    since: local(msg.since),
    by: msg.by === 'admin' ? 'admin' : 'auto',
    readyAt: local(msg.ready),
    row: msg.row && typeof msg.row === 'object' ? msg.row : null,
  };
}

/** Did the featured project itself change (not only its progress)? */
export function featuredChanged(prev, next) {
  return (prev?.jobId || '') !== (next?.jobId || '');
}

/** The pill's words: "Featured: Lowland Slough · 25%". */
export function featuredPillText(f) {
  if (!f) return '';
  return `${FEATURED_TEXT.tag}: ${f.label} · ${f.percent}%`;
}

/** How it stands: "Phase 2 of 3 · 40% built", or "Phase 2 of 3 opens in 12 min". */
export function featuredStatus(f, now = Date.now()) {
  if (!f) return '';
  const phase = f.phases > 1 ? `Phase ${f.phase + 1} of ${f.phases}` : '';
  if (f.readyAt > now) {
    const mins = Math.max(1, Math.ceil((f.readyAt - now) / 60000));
    return `${phase || 'The next phase'} opens in ${mins} min`;
  }
  return [phase, `${f.percent}% built`].filter(Boolean).join(' · ');
}

/** Where it is: "A new street in Groddle Forest, from Hechey Track", "An upgrade of Grand Mile, Groddle Forest". */
export function featuredWhere(f) {
  if (!f) return '';
  if (f.kind === 'upgrade') return `An upgrade of ${f.label}${f.hub ? `, ${f.hub}` : ''}`;
  const from = f.boardLabel ? `, from ${f.boardLabel}` : '';
  return `A new street${f.hub ? ` in ${f.hub}` : ''}${from}`;
}

/** The pill's and the row's accessible name. */
export function featuredLabel(f, now = Date.now()) {
  if (!f) return '';
  return `${FEATURED_TEXT.heading}: ${f.label}. ${featuredWhere(f)}. ${featuredStatus(f, now)}.`;
}

/**
 * Ticket 240: what is left, in one line, so a player can tell before travelling whether they can
 * help: the first need of the phase you can do now ("Needs: Clear with a Pick (Mining IV) · 7
 * units, and 2 more"). `entry` is the Projects panel's entry for it (js/projects-tracker.js
 * projectEntry: needs with their needLine words). '' when it is not known or nothing is left.
 */
export function featuredNeedsLine(entry) {
  if (!entry || entry.known === false || entry.finished) return '';
  const open = (entry.needs || []).filter((n) => n.open && n.text);
  if (!open.length) return '';
  const more = open.length - 1;
  return `${FEATURED_TEXT.needs}: ${open[0].text}${more ? `, and ${more} more` : ''}`;
}

