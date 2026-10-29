/**
 * Password managers (1Password, LastPass, Bitwarden, Dashlane) put a fill button in every text box they
 * find, the street chat included (Austin 2026-10-29). The game's own boxes hold chat, searches, names and
 * counts, never a sign-in, so each one is marked for them to skip, including boxes features add later.
 * The sign-in and account forms (account-forms.js, .acct-form / .acct-forms) keep their autofill.
 */
export const IGNORE_ATTRS = Object.freeze({
  autocomplete: 'off',
  'data-1p-ignore': '',
  'data-lpignore': 'true',
  'data-bwignore': '',
  'data-form-type': 'other',
});

const FIELDS = 'input, textarea';

/** Fields a password manager should still fill: the account forms, and any password box. */
export function wantsAutofill(field) {
  return field.type === 'password' || Boolean(field.closest?.('.acct-form, .acct-forms, [data-autofill]'));
}

/** Marks one field for password managers to skip; returns whether it did. */
export function quiet(field) {
  if (wantsAutofill(field)) return false;
  for (const [name, value] of Object.entries(IGNORE_ATTRS)) {
    if (field.getAttribute(name) !== value) field.setAttribute(name, value);
  }
  return true;
}

/** Marks every field under root (and root itself when it is one). */
export function quietAll(root) {
  let n = 0;
  if (root.matches?.(FIELDS) && quiet(root)) n += 1;
  for (const field of root.querySelectorAll?.(FIELDS) || []) if (quiet(field)) n += 1;
  return n;
}

/** Marks the page's fields now and each one added later. */
export function startNoAutofill(doc = document) {
  quietAll(doc);
  const watch = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) if (node.nodeType === 1) quietAll(node);
    }
  });
  watch.observe(doc.documentElement, { childList: true, subtree: true });
  return watch;
}

if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') startNoAutofill();
