/**
 * LEVEL BUILDER: the site's builder routes (groddle-afternoon-site src/AdminBuilder.php) with the
 * session's REST nonce, as the console calls its routes (console/console.js createApi). Used by the
 * editor (/console/builder/) and the play-test (js/builder/draft-play.js). Every error keeps the
 * site's {code, message, data:{status, ...}} as err.code, err.message, err.status, err.data.
 */

const ROOT = '/wp-json/groddle/v1/';

/** The site's address for a path (root-absolute against the page's origin, never its <base>). */
function siteUrl(path) {
  const origin = globalThis.location?.origin || '';
  return `${origin}${path}`;
}

export function createBuilderApi({ fetchImpl = (...a) => globalThis.fetch(...a) } = {}) {
  let nonce = '';
  async function fresh() {
    const r = await fetchImpl(siteUrl('/wp-admin/admin-ajax.php?action=rest-nonce'), { credentials: 'same-origin', cache: 'no-store' });
    const t = (await r.text()).trim();
    nonce = r.ok && /^[0-9a-f]{10}$/.test(t) ? t : '';
    return nonce;
  }
  async function call(path, { method = 'GET', body, headers = {} } = {}, retried = false) {
    if (!nonce) await fresh();
    const r = await fetchImpl(siteUrl(`${ROOT}${path}`), {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'X-WP-Nonce': nonce, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (r.status === 304) return { notModified: true, etag: r.headers.get('ETag') };
    const data = await r.json().catch(() => null);
    if (r.status === 403 && data?.code === 'rest_cookie_invalid_nonce' && !retried) {
      await fresh();
      return call(path, { method, body, headers }, true);
    }
    if (!r.ok) {
      throw Object.assign(new Error(data?.message || 'That did not work. Try again in a moment.'), { status: r.status, code: data?.code || '', data: data?.data || {} });
    }
    const etag = r.headers.get('ETag');
    return etag && data && typeof data === 'object' ? Object.assign(data, { [ETAG]: etag }) : data;
  }
  const draftPath = (id) => `admin/builder/drafts/${encodeURIComponent(id)}`;
  return {
    call,
    drafts: () => call('admin/builder/drafts').then((r) => r.drafts || []),
    /** A new draft; `hub` is a new hub ({id, name, isNew, map}) or an existing one ({id, name}). */
    create: (id, title, hub = null) => call('admin/builder/drafts', { method: 'POST', body: hub ? { id, title, hub } : { id, title } }),
    /** The draft { zone, rev }, or null when `etag` is still its rev (304). */
    async draft(id, { etag } = {}) {
      const r = await call(draftPath(id), { headers: etag ? { 'If-None-Match': `"${etag}"` } : {} });
      if (r?.notModified) return null;
      const zone = r;
      delete zone[ETAG];
      return { zone, rev: zone.rev | 0 };
    },
    ops: (id, rev, ops, note = '') => call(`${draftPath(id)}/ops`, { method: 'POST', body: { ops, note }, headers: { 'If-Match': `"${rev}"` } }),
    play: (id) => call(`${draftPath(id)}/play`),
    /** New art through intake (spec 9.1): {report, asset, op}; a refusal throws with data.report. */
    intake: (body) => call('admin/builder/assets', { method: 'POST', body }),
    /** The shipped street index as the console has it: [{tsid, label, hub}]. */
    streets: () => call('admin/streets').then((r) => r.streets || []),
  };
}

const ETAG = Symbol('etag');
