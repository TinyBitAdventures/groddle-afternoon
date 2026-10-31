/**
 * LEVEL BUILDER (spec 8.4): signed calls, the agent's side. The site's half is
 * groddle-afternoon-site src/BuilderKeys.php; tests/builder-keys.test.js holds the two to the same
 * bytes with shared vectors (as ServiceCall's tests do for the realtime server).
 *
 * A keyed request carries
 *
 *   X-Groddle-Builder: <key id>.<unix seconds>.<16 hex nonce>.<base64url HMAC-SHA256>
 *
 * signed with the key's secret over
 *
 *   "groddle-builder/1\n" METHOD "\n" route "\n" query "\n" seconds "\n" nonce "\n" hex(sha256(body))
 *
 * route: the REST route as the request names it (/groddle/v1/admin/builder/drafts/x/ops, no
 * /wp-json); query: the query's pairs sorted by name then value, each part RFC 3986 encoded, joined
 * by "&" (rest_route left out). A call is good for 60 s either side of the site's clock, and each
 * nonce is good once.
 *
 * A key's secret is HMAC-SHA256(master, "groddle-builder-key/1\n" key_id "\n" created_at), as hex;
 * the master lives in a file outside the webroot (option groddle_builder_secret_file) and the
 * database never holds a secret. The builder worker's own secret comes from the same master
 * (WORKER_LABEL), and the site signs its calls to the worker the ServiceCall way with it.
 */
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const HEADER = 'X-Groddle-Builder';
export const PREFIX = 'groddle-builder/1';
export const KEY_LABEL = 'groddle-builder-key/1';
export const WINDOW = 60;
export const WORKER_HEADER = 'X-Groddle-Worker';
export const WORKER_PREFIX = 'groddle-builder-worker/1';
export const WORKER_LABEL = 'groddle-builder-worker/1';

const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const sha256Hex = (body) => createHash('sha256').update(body ?? '').digest('hex');

/** RFC 3986 percent-encoding, as PHP's rawurlencode (encodeURIComponent leaves !'()* alone). */
export function rfc3986(s) {
  return encodeURIComponent(String(s)).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/**
 * PURE: the canonical query: pairs sorted by name then value, encoded, joined by "&".
 * Takes a string ("a=1&b=2"), URLSearchParams or a plain object. rest_route is left out.
 */
export function canonicalQuery(query) {
  let pairs;
  if (query == null || query === '') pairs = [];
  else if (typeof query === 'string') pairs = [...new URLSearchParams(query.replace(/^\?/, ''))];
  else if (query instanceof URLSearchParams) pairs = [...query];
  else pairs = Object.entries(query).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [k, String(v)]);
  return pairs.filter(([k]) => k !== 'rest_route')
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0))
    .map(([k, v]) => `${rfc3986(k)}=${rfc3986(v)}`).join('&');
}

/** PURE: the bytes a keyed call signs. */
export function message(method, route, query, at, nonce, body = '') {
  return `${PREFIX}\n${String(method).toUpperCase()}\n${route}\n${canonicalQuery(query)}\n${at}\n${nonce}\n${sha256Hex(body)}`;
}

/** PURE: the header value for a keyed call. */
export function signKey({ keyId, secret, method, route, query = '', body = '', at = Math.floor(Date.now() / 1000), nonce = randomBytes(8).toString('hex') }) {
  const sig = createHmac('sha256', secret).update(message(method, route, query, at, nonce, body)).digest();
  return `${keyId}.${at}.${nonce}.${b64url(sig)}`;
}

/** PURE: a key's secret from the master (hex). */
export function keySecret(master, keyId, createdAt) {
  return createHmac('sha256', master).update(`${KEY_LABEL}\n${keyId}\n${createdAt}`).digest('hex');
}

/** PURE: the worker's secret from the master (hex). */
export function workerSecret(master) {
  return createHmac('sha256', master).update(WORKER_LABEL).digest('hex');
}

/** PURE: the bytes a site-to-worker call signs (ServiceCall's shape, the worker's prefix). */
export function workerMessage(method, route, at, nonce, body = '') {
  return `${WORKER_PREFIX}\n${String(method).toUpperCase()}\n${route}\n${at}\n${nonce}\n${sha256Hex(body)}`;
}

/** PURE: the X-Groddle-Worker value. */
export function signWorker({ secret, method, route, body = '', at = Math.floor(Date.now() / 1000), nonce = randomBytes(8).toString('hex') }) {
  const sig = createHmac('sha256', secret).update(workerMessage(method, route, at, nonce, body)).digest();
  return `${at}.${nonce}.${b64url(sig)}`;
}

/** PURE: whether an X-Groddle-Worker value is good now. Returns { ok, nonce, reason }. */
export function verifyWorker(header, { secret, method, route, body = '', now = Math.floor(Date.now() / 1000) }) {
  const m = /^(\d{1,12})\.([0-9a-f]{16})\.([A-Za-z0-9_-]{43})$/.exec(String(header || '').trim());
  if (!m) return { ok: false, reason: 'shape' };
  const at = Number(m[1]);
  if (Math.abs(now - at) > WINDOW) return { ok: false, reason: 'stale' };
  const want = signWorker({ secret, method, route, body, at, nonce: m[2] });
  // Same length by construction; compare without an early exit.
  const a = Buffer.from(want);
  const b = Buffer.from(String(header).trim());
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) diff |= a[i] ^ b[i];
  return diff === 0 ? { ok: true, nonce: m[2], at } : { ok: false, reason: 'signature' };
}

/** PURE: parses a key line "<key id>.<secret>" (what the Builder tab shows once). */
export function parseKey(line) {
  const m = /^([0-9a-f]{16})\.([0-9a-f]{64})$/.exec(String(line || '').trim());
  return m ? { keyId: m[1], secret: m[2] } : null;
}

/** Where the builder's local files live (~/.config/groddle, or GRODDLE_BUILDER_HOME for tests). */
export function configDir(env = process.env) {
  return env.GRODDLE_BUILDER_HOME || join(homedir(), '.config', 'groddle');
}

/** The master secret file: GRODDLE_BUILDER_SECRET_FILE, else <config>/builder.secret. */
export function masterFile(env = process.env) {
  return env.GRODDLE_BUILDER_SECRET_FILE || join(configDir(env), 'builder.secret');
}

/** The master secret (the file's trimmed text, at least 32 characters), or null. */
export function readMaster(env = process.env) {
  try {
    const v = readFileSync(masterFile(env), 'utf8').trim();
    return v.length >= 32 ? v : null;
  } catch {
    return null;
  }
}

/** PURE: a builder.env's lines as { NAME: value } (KEY=value; # comments and blanks skipped). */
export function parseEnv(text) {
  const out = {};
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^(?:export\s+)?([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}
