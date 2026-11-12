/**
 * The /play/online/ gate's session check, on its own so the phone companion (js/phone/companion.js,
 * under its 250 KB budget, tests/phone-companion.test.js) loads it without the gate's whole card
 * (js/online-boot.js re-exports all three).
 */

/**
 * Who is playing, without the console's 400 on a signed-out visit (G322). The heartbeat probe
 * that asks rest-nonce only of a signed-in page now lives in account.session() itself
 * (js/minn-account-core.js), so the solo Account panel and the phone companion ask it too; this
 * stays the gate's one name for it.
 */
export async function quietSession(account) {
  return account.session();
}

/**
 * Whether the signed-in account is suspended (groddle/v1/me "suspended", the
 * administrators' console's ban). account.session() does not carry it, so the
 * gate asks once more before it offers Play as <name>; a failed ask is false
 * (the save route refuses a suspended account anyway, and enter() says so).
 */
export async function suspendedNow(account, { fetch: fetchFn = globalThis.fetch?.bind(globalThis) } = {}) {
  try {
    const res = await fetchFn(`${account.urls.api}me`, { credentials: 'same-origin', cache: 'no-store', headers: account.nonce ? { 'X-WP-Nonce': account.nonce } : {} });
    const data = res.ok ? await res.json().catch(() => null) : null;
    return data?.signedIn === true && data.suspended === true;
  } catch {
    return false;
  }
}

/** Which gate a session answer leads to; 'ready' boots the game. */
export function gateFor(session) {
  if (session?.offline) return 'offline';
  if (!session?.minn) return 'no-server';
  if (!session.signedIn) return 'signed-out';
  return 'ready';
}
