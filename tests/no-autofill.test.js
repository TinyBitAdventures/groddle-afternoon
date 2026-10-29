/**
 * Password managers skip the game's own text boxes (Austin 2026-10-29: 1Password's button sat in the
 * street chat); the account forms keep their autofill. js/no-autofill.js.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IGNORE_ATTRS, quiet, quietAll, wantsAutofill } from '../public/js/no-autofill.js?v=g437-1';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

function field({ type = 'text', inAccount = false } = {}) {
  const attrs = new Map();
  return {
    type,
    attrs,
    matches: (sel) => sel === 'input, textarea',
    closest: (sel) => (inAccount && sel.includes('.acct-forms') ? {} : null),
    getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
    setAttribute: (k, v) => attrs.set(k, v),
  };
}

describe('no-autofill', () => {
  it('marks a game box for 1Password, LastPass, Bitwarden and Dashlane to skip', () => {
    const chat = field();
    assert.equal(quiet(chat), true);
    assert.deepEqual(Object.fromEntries(chat.attrs), { ...IGNORE_ATTRS });
    assert.equal(chat.attrs.get('data-1p-ignore'), '');
    assert.equal(chat.attrs.get('data-lpignore'), 'true');
  });

  it('leaves the account forms and password boxes alone', () => {
    const email = field({ type: 'email', inAccount: true });
    const pass = field({ type: 'password' });
    assert.equal(wantsAutofill(email), true);
    assert.equal(quiet(email), false);
    assert.equal(quiet(pass), false);
    assert.equal(email.attrs.size + pass.attrs.size, 0);
  });

  it('marks every field under a root', () => {
    const a = field();
    const b = field({ inAccount: true });
    const host = { querySelectorAll: () => [a, b] };
    assert.equal(quietAll(host), 1);
  });

  it('loads before the game on both play pages, and the chat box carries the marks in the markup', () => {
    for (const page of ['public/play/index.html', 'public/play/online/index.html']) {
      const html = read(page);
      assert.ok(html.indexOf('js/no-autofill.js?v=g437-1') > 0, page);
      assert.match(html, /<input id="local-chat-input"[^>]* autocomplete="off" data-1p-ignore data-lpignore="true" data-bwignore data-form-type="other" \/>/, page);
    }
  });
});
