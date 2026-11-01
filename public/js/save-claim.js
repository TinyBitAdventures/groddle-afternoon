/**
 * One window plays a character at a time (ticket 21, 2026-11-01). When a tab
 * of this browser is about to load a multiplayer character (js/online-boot.js),
 * it asks on a BroadcastChannel; any other tab playing that character answers,
 * writes its last change and stops writing (js/save-store.js yieldTo, which
 * says so on that page), and only then does the new tab read the save. So
 * the new tab starts from everything the old one did, and the old one never
 * saves over it. Other browsers and devices are covered on the site: the
 * boot read claims the save for the new page (MultiplayerSave.php), and the
 * old page's next write is refused with "elsewhere".
 *
 * A reload of the same tab (ticket 21, live 2026-11-01 05:51 and 06:52): the
 * old page's last write goes out as it unloads (keepalive), and Safari can
 * deliver it after the new page has read the save, or never (a body over the
 * keepalive limit is cancelled with the page). So the old page also leaves
 * that write in the tab's sessionStorage (leaveHandoff), and the new page
 * delivers it before it reads (takeHandoff, js/online-boot.js): the same
 * writer and seq, so whichever copy lands second changes nothing
 * (MultiplayerSave.php "superseded"), and the new page starts from the old
 * page's last seconds. A handoff whose page lost the save to another window
 * is refused like any write from it.
 *
 * Pure apart from BroadcastChannel and sessionStorage; with neither (an old
 * browser, tests) asking resolves at once and nothing is handed on.
 */

/** The tab's sessionStorage key for the last write of the page before (one at a time). */
export const HANDOFF_KEY = 'groddle-save-handoff';

/** Leaves a page's last write (the PUT body text) for the next page of this tab. */
export function leaveHandoff({ scope = globalThis, player, body }) {
  if (player == null || typeof body !== 'string') return false;
  try {
    scope.sessionStorage.setItem(HANDOFF_KEY, JSON.stringify({ player, body, at: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

/** Takes (and removes) the last write a page before left in this tab for this player: { body } or null. */
export function takeHandoff({ scope = globalThis, player } = {}) {
  let raw = null;
  try {
    raw = scope.sessionStorage.getItem(HANDOFF_KEY);
    scope.sessionStorage.removeItem(HANDOFF_KEY);
  } catch {
    return null;
  }
  try {
    const h = JSON.parse(raw || 'null');
    return h && String(h.player) === String(player) && typeof h.body === 'string' ? { body: h.body, at: Number(h.at) || 0 } : null;
  } catch {
    return null;
  }
}

export const SAVE_CHANNEL = 'groddle-save';

/** A page's name for itself on the save (MultiplayerSave.php WRITER): 16 random hex digits, new each page load. */
export function newWriterId(cryptoApi = globalThis.crypto) {
  const bytes = new Uint8Array(8);
  if (cryptoApi?.getRandomValues) cryptoApi.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function channel(scope) {
  try {
    return typeof scope?.BroadcastChannel === 'function' ? new scope.BroadcastChannel(SAVE_CHANNEL) : null;
  } catch {
    return null;
  }
}

/**
 * Asks other tabs playing this character to save and stand down. Resolves to how many
 * answered once each has said it is done (or flushMs passed); answerMs is how long it waits
 * for a first answer.
 */
export function claimCharacter({ scope = globalThis, player, writer, answerMs = 250, flushMs = 5000, timers = globalThis } = {}) {
  const ch = channel(scope);
  if (!ch || player == null) return Promise.resolve(0);
  return new Promise((resolve) => {
    const held = new Set();
    let firstWait = null;
    let lastWait = null;
    const done = () => {
      timers.clearTimeout(firstWait);
      timers.clearTimeout(lastWait);
      try { ch.close(); } catch { /* closed */ }
      resolve(held.size);
    };
    ch.onmessage = (e) => {
      const m = e?.data;
      if (!m || m.to !== writer || String(m.player) !== String(player)) return;
      if (m.t === 'held') held.add(m.from);
      if (m.t === 'done') {
        held.delete(m.from);
        if (!held.size) done();
      }
    };
    ch.postMessage({ t: 'claim', player, from: writer });
    firstWait = timers.setTimeout(() => {
      if (!held.size) done();
      else lastWait = timers.setTimeout(done, flushMs);
    }, answerMs);
  });
}

/**
 * Answers other tabs' claims on this character: onClaim() saves and stands down; the
 * claimer hears "held" at once and "done" when onClaim settles. Returns { close }.
 */
export function listenForClaims({ scope = globalThis, player, writer, onClaim }) {
  const ch = channel(scope);
  if (!ch || player == null) return { close() {} };
  ch.onmessage = async (e) => {
    const m = e?.data;
    if (!m || m.t !== 'claim' || m.from === writer || String(m.player) !== String(player)) return;
    ch.postMessage({ t: 'held', player, from: writer, to: m.from });
    try { await onClaim(); } catch { /* the claimer goes on */ }
    ch.postMessage({ t: 'done', player, from: writer, to: m.from });
  };
  return { close() { try { ch.close(); } catch { /* closed */ } } };
}
