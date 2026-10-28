/**
 * The administrators' teleport (v0.2.2): /tp in Local chat frees a stuck
 * player (one stranded on a street whose every road is still being built).
 * Multiplayer, administrators only: the site's groddle/v1/admin/teleport
 * (groddle-afternoon-site src/AdminTeleport.php, manage_options) decides who
 * may, writes the audit line and, for another player, has the realtime
 * server move them live (groddle-afternoon-server teleport.go: the
 * {"t":"teleport"} message realtime-feature handles) or rewrites their save
 * when they are offline.
 *
 *   /tp <street>            move yourself
 *   /tp <player> <street>   move another player
 *   /tp <player> here       bring a player to where you stand
 *   /tp <player>            the same, when no street goes by that name
 *
 * <street> is a street's name (letter case aside, or its start, or the start
 * of one of its words) or its tsid; a name that fits several streets is answered with the candidates.
 * <player> is a character's name, matched by the site. Anyone else gets
 * the ordinary "Unknown command" line (the site refuses them, 401 or 403),
 * so players never learn /tp is there. Solo has no /tp and says so.
 *
 * Pure apart from runTeleportCommand, which takes its fetch, engine and
 * store from the caller (js/features/slash-commands-feature.js).
 */

export const TP_TEXT = Object.freeze({
  solo: 'Teleporting with /tp is not available in solo.',
  usage: 'Use /tp <street>, /tp <player> <street>, or /tp <player> here.',
  noSpot: 'Stand on a street first, then bring them here.',
  offline: 'The Groddle site is not answering. Try again in a moment.',
  failed: 'That teleport did not work. Try again in a moment.',
  noStreet: (q) => `No street is called ${q}.`,
  noMatch: (q) => `No street or player is called ${q}.`,
  whichStreet: (names, more) => `Which street? ${names.join(', ')}${more > 0 ? `, and ${more} more` : ''}.`,
  moved: (label) => `An administrator moved you to ${label}.`,
});

/** How many candidates an ambiguous street name lists. */
export const TP_CANDIDATES = 6;

/** The arguments of a /tp line ('' for none), or null when the line is not /tp. */
export function parseTp(text) {
  const m = /^\/tp(?:\s+([\s\S]*))?$/i.exec(String(text || '').trim());
  return m ? (m[1] || '').trim().replace(/\s+/g, ' ') : null;
}

function norm(s) {
  return String(s || '').toLowerCase().replace(/[’'"`]/g, '').replace(/\s+/g, ' ').trim();
}

/** The index key a tsid names, trying the G and L forms (js/street-loader.js resolveIndexTsid). */
export function streetKey(streets, tsid) {
  const t = String(tsid || '').trim().toUpperCase();
  if (!/^[A-Z0-9_-]{1,32}$/.test(t) || !streets) return null;
  const tries = [t];
  if (t.startsWith('L')) tries.push(`G${t.slice(1)}`);
  if (t.startsWith('G')) tries.push(`L${t.slice(1)}`);
  return tries.find((k) => Object.prototype.hasOwnProperty.call(streets, k)) || null;
}

function street(streets, tsid) {
  return { tsid, label: String(streets[tsid]?.label || tsid) };
}

/** Streets as candidates: a name that several streets share is told apart by its tsid. */
function candidates(streets, keys, query) {
  const q = norm(query);
  const sorted = [...keys].sort((a, b) => {
    const la = norm(streets[a]?.label);
    const lb = norm(streets[b]?.label);
    return (lb.startsWith(q) - la.startsWith(q)) || la.localeCompare(lb) || a.localeCompare(b);
  });
  const counts = new Map();
  for (const k of sorted) counts.set(norm(streets[k]?.label), (counts.get(norm(streets[k]?.label)) || 0) + 1);
  return sorted.map((k) => {
    const s = street(streets, k);
    return counts.get(norm(s.label)) > 1 ? { ...s, name: `${s.label} (${k})` } : { ...s, name: s.label };
  });
}

/**
 * The street a name or tsid means: { street } for one, { candidates } for
 * several, null for none. exact: only a tsid or a whole name counts.
 */
export function matchStreet(query, streets, { exact = false } = {}) {
  const q = norm(query);
  if (!q || !streets) return null;
  const key = streetKey(streets, query);
  if (key) return { street: street(streets, key) };
  const keys = Object.keys(streets);
  const whole = keys.filter((k) => norm(streets[k]?.label) === q);
  if (whole.length === 1) return { street: street(streets, whole[0]) };
  if (whole.length > 1) return { candidates: candidates(streets, whole, query) };
  if (exact) return null;
  // Part of a name: from the start of one of its words ("track" finds Hechey Track; "zz" is not part of Gazzi).
  const part = keys.filter((k) => ` ${norm(streets[k]?.label)}`.includes(` ${q}`));
  if (part.length === 1) return { street: street(streets, part[0]) };
  if (part.length > 1) return { candidates: candidates(streets, part, query) };
  return null;
}

function which(found) {
  const names = found.candidates.slice(0, TP_CANDIDATES).map((c) => c.name);
  return { kind: 'error', line: TP_TEXT.whichStreet(names, found.candidates.length - names.length), candidates: found.candidates };
}

/**
 * What a /tp line asks for:
 *   { kind: 'self', street }            /tp <street>
 *   { kind: 'player', player, street }  /tp <player> <street>
 *   { kind: 'bring', player, fallback } /tp <player> here (fallback: no street fit the words either)
 *   { kind: 'error', line }             nothing to do, with the line to show
 * A whole name or tsid wins over part of one; the player's name is the
 * shortest run of leading words that leaves a street.
 */
export function planTp(args, streets) {
  const text = String(args || '').trim().replace(/\s+/g, ' ');
  if (!text) return { kind: 'error', line: TP_TEXT.usage };
  const words = text.split(' ');
  if (words.length > 1 && words[words.length - 1].toLowerCase() === 'here') {
    return { kind: 'bring', player: words.slice(0, -1).join(' '), fallback: false };
  }
  const splits = [];
  for (let k = 1; k < words.length; k += 1) splits.push({ player: words.slice(0, k).join(' '), rest: words.slice(k).join(' ') });
  let found = matchStreet(text, streets, { exact: true });
  if (found?.street) return { kind: 'self', street: found.street };
  if (found?.candidates) return which(found);
  for (const s of splits) {
    found = matchStreet(s.rest, streets, { exact: true });
    if (found?.street) return { kind: 'player', player: s.player, street: found.street };
    if (found?.candidates) return which(found);
  }
  found = matchStreet(text, streets);
  if (found?.street) return { kind: 'self', street: found.street };
  if (found?.candidates) return which(found);
  for (const s of splits) {
    found = matchStreet(s.rest, streets);
    if (found?.street) return { kind: 'player', player: s.player, street: found.street };
    if (found?.candidates) return which(found);
  }
  return { kind: 'bring', player: text, fallback: true };
}

/** Where the caller stands, when others could be brought there (a shared street, not a private place). */
export function hereOf(engine) {
  if (!engine?.player || !engine.streetTsid) return null;
  if (engine.transientInstance?.() || engine.homeContext?.().inHome) return null;
  const x = Number(engine.player.x);
  const y = Number(engine.player.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { tsid: String(engine.streetTsid), x: Math.round(x), y: Math.round(y) };
}

/** The site route's address under the page's base (the site root). */
export function teleportRoute(baseUri) {
  return new URL('wp-json/groddle/v1/admin/teleport', baseUri).href;
}

/**
 * Runs one /tp line. deps: { engine, streets, fetch, baseUri, nonce,
 * nonceUrl, say(line), unknown(), flush() }. Resolves to what happened
 * (`<kind>:<outcome>`), for QA and tests.
 */
export async function runTeleportCommand(args, deps) {
  const { engine, streets, say, unknown } = deps;
  const call = siteCaller(deps);
  // The site says whether /tp is yours before anything else does (an answer about streets would give it away).
  const check = await call('GET');
  if (check.status === 401 || check.status === 403) {
    unknown();
    return 'refused';
  }
  if (!check.ok) {
    say(check.status === 0 ? TP_TEXT.offline : TP_TEXT.failed);
    return 'check-failed';
  }
  const plan = planTp(args, streets);
  if (plan.kind === 'error') {
    say(plan.line);
    return 'error';
  }
  let body;
  if (plan.kind === 'self') body = { tsid: plan.street.tsid };
  else if (plan.kind === 'player') body = { player: plan.player, tsid: plan.street.tsid };
  else {
    const here = hereOf(engine);
    if (!here) {
      say(plan.fallback ? TP_TEXT.noMatch(plan.player) : TP_TEXT.noSpot);
      return 'bring:no-spot';
    }
    body = { player: plan.player, tsid: here.tsid, x: here.x, y: here.y };
  }
  const r = await call('POST', body);
  if (r.status === 401 || r.status === 403) {
    unknown();
    return 'refused';
  }
  if (!r.ok) {
    const missing = plan.kind === 'bring' && plan.fallback && r.data?.code === 'groddle_tp_no_player';
    say(missing ? TP_TEXT.noMatch(plan.player) : (r.status === 0 ? TP_TEXT.offline : (typeof r.data?.message === 'string' && r.data.message) || TP_TEXT.failed));
    return `${plan.kind}:${r.data?.code || r.status}`;
  }
  say(String(r.data?.text || ''));
  if (r.data?.delivery === 'self') {
    const at = r.data.spot && r.data.at ? { spawnX: Number(r.data.at.x), spawnY: Number(r.data.at.y) } : {};
    try {
      await engine.enter?.(r.data.street?.tsid || body.tsid, at);
      engine.save?.();
      await deps.flush?.();
    } catch {
      say(TP_TEXT.failed);
      return 'self:enter-failed';
    }
  }
  return `${plan.kind}:${r.data?.delivery || 'done'}`;
}

/** One signed-in call to the route, with the REST nonce; a stale nonce is fetched again once. */
function siteCaller({ fetch: fetchFn, baseUri, nonce: given = '', nonceUrl = '' }) {
  let nonce = /^[0-9a-f]{10}$/.test(String(given)) ? String(given) : '';
  const url = teleportRoute(baseUri);
  async function fresh() {
    if (!nonceUrl) return false;
    try {
      const res = await fetchFn(nonceUrl, { credentials: 'same-origin', cache: 'no-store' });
      const text = String(await res.text()).trim();
      if (res.ok && /^[0-9a-f]{10}$/.test(text)) {
        nonce = text;
        return true;
      }
    } catch { /* offline */ }
    return false;
  }
  return async function call(method, body) {
    if (!nonce) await fresh();
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let res;
      try {
        res = await fetchFn(url, {
          method,
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { ...(nonce ? { 'X-WP-Nonce': nonce } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
          body: body ? JSON.stringify(body) : undefined,
        });
      } catch {
        return { status: 0, ok: false, data: null };
      }
      const next = res.headers?.get?.('X-WP-Nonce');
      if (next) nonce = next;
      let data = null;
      try { data = await res.json(); } catch { /* not JSON */ }
      if (res.status === 403 && data?.code === 'rest_cookie_invalid_nonce' && attempt === 0 && (await fresh())) continue;
      return { status: res.status, ok: res.ok, data };
    }
    return { status: 0, ok: false, data: null };
  };
}

/** The line a moved player sees, with the street's name from the index. */
export function movedLine(streets, tsid) {
  const key = streetKey(streets, tsid);
  return TP_TEXT.moved(String((key && streets[key]?.label) || tsid));
}
