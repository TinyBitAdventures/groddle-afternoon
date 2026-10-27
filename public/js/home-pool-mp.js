/**
 * The Magic Rock's daily iMG in multiplayer (register G201): what visitors
 * do on your home street fills a pool the rock hands over the next game day.
 * The rules are the source's (locations/inc_cultivation.js
 * cultivation_add_img_rewards 168-178, cultivation_get_img_rewards 244-277,
 * cultivation_reset_img_rewards 284-292; locations/home.js home_log_visitor
 * 435-458; items/magic_rock.js 427-446) and live on the site
 * (groddle-afternoon-site src/HomePool.php): it keeps the pool, counts each
 * visitor once a game day (the realtime server's home_pool.go tells it who
 * stood on the street) and a key-holder's harvest of a garden there
 * (include/garden.js:579), and decides what the rock hands over from the
 * owner's level. The game only shows it and puts the iMG in its own save.
 *
 * Solo keeps js/magic-rock-home.js imgRewards (the stipend alone: nobody
 * visits).
 */

/** How often the owner's game asks again while on its home street. */
export const HOME_POOL_REFRESH_MS = 60 * 1000;

const int = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.floor(Number(v))) : 0);

/** GET groddle/v1/homes/pool as the game keeps it, or null when it is not one. */
export function normalizePool(raw) {
  if (!raw || typeof raw !== 'object' || !Number.isFinite(Number(raw.day))) return null;
  return {
    day: Math.floor(Number(raw.day)),
    collect: int(raw.collect),
    cashed: raw.cashed === true,
    today: int(raw.today),
    cap: int(raw.cap),
    stipend: int(raw.stipend),
  };
}

/**
 * POST groddle/v1/homes/pool/collect: the iMG to put in the save now. A
 * second answer for a game day already handed over (again) is applied only
 * when this save has not marked the day yet (the first answer was lost).
 */
export function collectAmount(raw, { cashedToday = false } = {}) {
  const amount = int(raw?.amount);
  if (!amount) return 0;
  if (raw?.again === true && cashedToday) return 0;
  return amount;
}

/** QA (canvas data homePool): collect:cashed?:today, or '' before the site answered. */
export function poolView(pool) {
  if (!pool) return '';
  return `${pool.collect}:${pool.cashed ? 'c' : ''}:${pool.today}`;
}

/** The site's two routes (the cookie with its REST nonce, refreshed once when stale), as home-street-mp-feature calls its own. */
export function createPoolSite({ baseUri = globalThis.document?.baseURI, nonce: given = '', nonceUrl = '', fetch: fetchFn = globalThis.fetch?.bind(globalThis) } = {}) {
  let nonce = /^[0-9a-f]{10}$/.test(String(given || '')) ? String(given) : '';
  const api = new URL('wp-json/groddle/v1/', baseUri).href;
  const nonceAt = nonceUrl || new URL('wp-admin/admin-ajax.php?action=rest-nonce', baseUri).href;
  async function refresh() {
    try {
      const res = await fetchFn(nonceAt, { credentials: 'same-origin', cache: 'no-store' });
      const text = String(await res.text()).trim();
      if (res.ok && /^[0-9a-f]{10}$/.test(text)) {
        nonce = text;
        return true;
      }
    } catch { /* the answer below stands */ }
    return false;
  }
  async function call(path, method = 'GET') {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const headers = nonce ? { 'X-WP-Nonce': nonce } : {};
      const res = await fetchFn(api + path, { method, credentials: 'same-origin', cache: 'no-store', headers });
      const fresh = res.headers?.get?.('X-WP-Nonce');
      if (fresh) nonce = fresh;
      let data = null;
      try { data = await res.json(); } catch { /* not JSON */ }
      if (res.status === 403 && data?.code === 'rest_cookie_invalid_nonce' && attempt === 0 && (await refresh())) continue;
      if (!res.ok) throw Object.assign(new Error(`homes/pool ${res.status}`), { status: res.status, code: data?.code || '' });
      return data;
    }
    throw new Error('homes/pool failed');
  }
  return {
    mine: () => call('homes/pool'),
    collect: () => call('homes/pool/collect', 'POST'),
  };
}
