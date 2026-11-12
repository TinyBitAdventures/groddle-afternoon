/**
 * Austin 2026-11-12: the character chip said "Your characters didn't load". Its account helper
 * (features/account-backup-feature.js, which keeps away from the multiplayer boot data on purpose) starts
 * without a REST nonce, so its first call went out signed out and the site answered 401 rest_not_logged_in;
 * the helper only retried a stale nonce (403). Now a 401 before any nonce fetches one and tries once more,
 * for reads (the chip's list) and writes (Switch, create, retire).
 * Run: node --test tests/account-nonce-401.test.js
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createMinnAccountCore } from '../public/js/minn-account-core.js?v=63758d34';

describe('the account helper never stays signed out by mistake', () => {
  it('fetches a nonce and retries once when a call made without one gets 401', async () => {
    const seen = [];
    const fetch = async (url, init = {}) => {
      if (String(url).includes('rest-nonce')) return { ok: true, status: 200, text: async () => 'abcdef1234', headers: { get: () => null } };
      const nonce = init.headers?.['X-WP-Nonce'] || '';
      seen.push(nonce);
      const ok = Boolean(nonce);
      return { ok, status: ok ? 200 : 401, headers: { get: () => null }, json: async () => (ok ? { login: 1, current: 2, limit: 3, characters: [] } : { code: 'rest_not_logged_in', message: 'You are not currently logged in.' }) };
    };
    const account = createMinnAccountCore({ baseUri: 'https://groddle.example/play/online/', fetch });
    const list = await account.characters();
    assert.equal(list.login, 1);
    assert.deepEqual(seen, ['', 'abcdef1234'], 'once without, once with the fetched nonce');
  });

  it('does the same for a write (Switch character)', async () => {
    const seen = [];
    const fetch = async (url, init = {}) => {
      if (String(url).includes('rest-nonce')) return { ok: true, status: 200, text: async () => 'abcdef1234', headers: { get: () => null } };
      const nonce = init.headers?.['X-WP-Nonce'] || '';
      seen.push(nonce);
      const ok = Boolean(nonce);
      return { ok, status: ok ? 200 : 401, headers: { get: () => null }, json: async () => (ok ? { ok: true, nonce: 'feedface99' } : { code: 'rest_not_logged_in' }) };
    };
    const account = createMinnAccountCore({ baseUri: 'https://groddle.example/play/online/', fetch });
    const r = await account.playCharacter(2);
    assert.equal(r.ok, true);
    assert.deepEqual(seen, ['', 'abcdef1234']);
  });
});
