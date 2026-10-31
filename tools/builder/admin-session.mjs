/**
 * LEVEL BUILDER: an administrator's session on a local Minn site, for the steps a builder key may
 * never take (making and revoking keys, deleting a test draft for good). Signs in through a one-time
 * link minted on this machine (`php <webroot>/minn/bin/minn login <webroot> <user> --format=json`, no
 * password), keeps the cookies, and calls the builder routes with the session's REST nonce, as the
 * console does. Used by tools/builder/example-session.mjs.
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

/** PURE: the name=value pairs from Set-Cookie headers, merged into a jar. */
export function mergeCookies(jar, setCookies) {
  for (const line of setCookies || []) {
    const [pair] = String(line).split(';');
    const eq = pair.indexOf('=');
    if (eq < 1) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (value === '' || value === 'deleted') jar.delete(name);
    else jar.set(name, value);
  }
  return jar;
}

export async function adminSession({ webroot, user = '', url = 'https://groddle.localhost' } = {}) {
  const out = execFileSync('php', [join(webroot, 'minn/bin/minn'), 'login', webroot, ...(user ? [user] : []), '--format=json'], { encoding: 'utf8' });
  const link = JSON.parse(out).url;
  const jar = new Map();
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  let next = link;
  for (let hop = 0; hop < 6 && next; hop += 1) {
    const r = await fetch(next, { redirect: 'manual', headers: { Cookie: cookie() } });
    mergeCookies(jar, r.headers.getSetCookie?.() || []);
    const loc = r.headers.get('location');
    next = loc ? new URL(loc, next).href : null;
    if (!next || !next.startsWith(url)) break;
  }
  if (![...jar.keys()].some((k) => k.startsWith('wordpress_logged_in'))) throw new Error('The one-time sign-in link did not sign in.');
  const nonceRes = await fetch(`${url}/wp-admin/admin-ajax.php?action=rest-nonce`, { headers: { Cookie: cookie() } });
  const nonce = (await nonceRes.text()).trim();
  if (!/^[0-9a-f]{10}$/.test(nonce)) throw new Error('No REST nonce for the session.');
  async function call(method, path, body) {
    const r = await fetch(`${url}/wp-json/groddle/v1/${path}`, {
      method,
      headers: { Cookie: cookie(), 'X-WP-Nonce': nonce, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await r.json().catch(() => null);
    return { status: r.status, data };
  }
  return { call, cookie, nonce };
}
