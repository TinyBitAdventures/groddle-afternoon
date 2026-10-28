/**
 * The game's own sign-in forms (Austin, 2026-10-26: "players should get a
 * login"; email is the login, never a username): Sign in, New player and
 * Forgot your password, drawn into a card by the multiplayer gate
 * (js/online-boot.js) and the solo Account panel
 * (js/features/account-backup-feature.js). They talk to the site through
 * js/minn-account.js (groddle-afternoon-site/src/PlayerAccount.php), so a player
 * never sees the site's admin sign-in page.
 *
 * New player asks for an email, a password and the character's name: the
 * name other players see. The account's username is made up by the site and
 * never shown. A hidden "website" field catches form-filling scripts.
 *
 * No account exists until its email is proven (Austin 2026-10-27): New
 * player's answer is "Check your email" (with Send it again, a minute
 * apart), and the mailed link, /play/online/#verify=<token>, opens the gate
 * on the finishing step (verifyLinkFrom(hash)), which makes the character
 * and signs the player in. A used link offers Sign in, an expired one Send a
 * new link, and a name someone else got first asks for another name.
 *
 * A password reset mails a link back to /play/online/#reset=<key>&login=<login>;
 * resetLinkFrom(hash) reads it and the gate opens on Choose a new password,
 * which saves it and signs the player in.
 *
 * Cloudflare Turnstile (Austin 2026-10-28): when the site has a Turnstile
 * site key (groddle/v1/account/options), the forms that send an email to an
 * address someone typed (New player, Send it again, Forgot your password)
 * each carry a managed widget, shown only when Cloudflare needs the player to
 * do something, and send its token with the form (createAccountRequests).
 * Without a key no script loads and the forms work as they always have.
 *
 * mountAccountForms(host, { account, start, reset, verify, onSignedIn })
 * replaces host's children; onSignedIn({ player, how: 'signin' | 'signup' |
 * 'reset' | 'verify' }) runs once the session and its nonce are in place.
 */

/** Cloudflare's widget script, loaded only when the site has a Turnstile site key. */
export const TURNSTILE_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

/**
 * The account calls the forms make beyond js/minn-account.js: the card's
 * options, and the three emailing forms with a Turnstile token. Public
 * routes only, sent without a nonce (a stale one would be refused). The
 * answers have minn-account's shapes.
 * @param {{ api: string, fetch?: typeof fetch }} opts api: account.urls.api
 */
export function createAccountRequests({ api, fetch: fetchFn = globalThis.fetch?.bind(globalThis) } = {}) {
  async function call(path, body) {
    try {
      const res = await fetchFn(api + path, {
        method: body === undefined ? 'GET' : 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      let data = null;
      try { data = await res.json(); } catch { /* not JSON */ }
      return { status: res.status, ok: res.ok, data };
    } catch {
      return { status: 0, ok: false, data: { code: 'offline', message: 'The Groddle site is not answering. Try again in a moment.' } };
    }
  }
  const refusal = (r) => ({
    ok: false,
    code: r.data?.code || `http_${r.status}`,
    message: r.data?.message || 'That didn\'t work. Try again in a moment.',
    fields: r.data?.fields && typeof r.data.fields === 'object' ? r.data.fields : {},
  });
  const signedIn = (r) => (r.ok && r.data?.signedIn === true ? { ok: true, player: r.data.player } : refusal(r));
  return {
    /** { turnstile: site key | null }; {} when the site can't be asked (a static server). */
    async options() {
      const r = await call('account/options');
      return r.ok && r.data && typeof r.data === 'object' ? r.data : {};
    },
    async signUp({ email, password, name, website = '', turnstile = '' }) {
      const r = await call('players', { email, password, name, website, turnstile });
      if (r.status === 202 && r.data?.pending === true) {
        return { ok: true, pending: true, email: String(r.data.email || email), name: String(r.data.name || name), nameHeld: r.data.nameHeld === true };
      }
      return signedIn(r);
    },
    async resendSignUp({ email, turnstile = '' }) {
      const r = await call('players/resend', { email, turnstile });
      return r.ok ? { ok: true } : refusal(r);
    },
    async requestPasswordReset(email, turnstile = '') {
      const r = await call('password-reset', { email, turnstile });
      return r.ok ? { ok: true } : refusal(r);
    },
  };
}

const scripts = new Map();
/** Loads a script once; resolves when it has run (null when it could not load). */
function loadScript(src) {
  if (!scripts.has(src)) {
    scripts.set(src, new Promise((resolve) => {
      const tag = document.createElement('script');
      tag.src = src;
      tag.async = true;
      tag.onload = () => resolve(true);
      tag.onerror = () => { scripts.delete(src); resolve(null); };
      document.head.append(tag);
    }));
  }
  return scripts.get(src);
}

/**
 * Turnstile widgets in the card's slots (one per emailing form), drawn once
 * the script has loaded. token(which) waits a little for the widget's token
 * (Cloudflare may ask the player to tick a box); reset(which) after each
 * send, since a token works once.
 */
function turnstileWidgets(siteKey, slots) {
  const tokens = {};
  const waiters = {};
  const ids = {};
  const settle = (which) => { for (const done of waiters[which] || []) done(tokens[which] || ''); waiters[which] = []; };
  const ready = loadScript(TURNSTILE_SCRIPT).then((loaded) => {
    const ts = loaded && globalThis.turnstile;
    if (!ts) return null;
    for (const [which, slot] of Object.entries(slots)) {
      ids[which] = ts.render(slot, {
        sitekey: siteKey,
        action: which,
        appearance: 'interaction-only',
        callback: (t) => { tokens[which] = t; settle(which); },
        'expired-callback': () => { tokens[which] = ''; },
        'error-callback': () => { tokens[which] = ''; settle(which); },
      });
    }
    return ts;
  });
  return {
    async token(which, wait = 20000) {
      const ts = await ready;
      if (!ts) return '';
      if (tokens[which]) return tokens[which];
      return new Promise((resolve) => {
        (waiters[which] ||= []).push(resolve);
        setTimeout(() => resolve(tokens[which] || ''), wait);
      });
    },
    async reset(which) {
      const ts = await ready;
      tokens[which] = '';
      if (ts && ids[which] !== undefined) {
        try { ts.reset(ids[which]); } catch { /* the widget went with the card */ }
      }
    },
  };
}

/** The form copy (plain remake copy, no em-dashes). */
export const FORM_COPY = Object.freeze({
  tabs: { signin: 'Sign in', signup: 'New player' },
  signin: { submit: 'Sign in', busy: 'Signing in…', remember: 'Keep me signed in on this device', forgot: 'Forgot your password?' },
  signup: {
    submit: 'Make my character',
    busy: 'Making your character…',
    nameHelp: 'What other players see. 3 to 19 letters, numbers, spaces, - or _.',
    passwordHelp: 'At least 8 characters.',
    emailHelp: 'You sign in with it, and password resets go to it.',
  },
  forgot: {
    title: 'Reset your password',
    body: 'Enter the email you play with and we\'ll send a link to choose a new password.',
    submit: 'Send the link',
    busy: 'Sending…',
    sent: 'If that email has a character, a reset link is on its way. Check your inbox.',
    back: 'Back to sign in',
  },
  reset: {
    title: 'Choose a new password',
    body: 'Then you\'re signed straight in.',
    submit: 'Save and sign in',
    busy: 'Saving…',
    again: 'Ask for a new link',
  },
  check: {
    title: 'Check your email',
    body: 'We sent a link to {email}. Open it to finish making {name}. It works once, for a day.',
    bodyNew: 'We sent a new link to {email}. Open it to finish making your character. It works once, for a day.',
    held: 'Someone else is waiting to finish a character called {name} too. Whoever opens their link first keeps the name.',
    resend: 'Send it again',
    busy: 'Sending…',
    wait: 'Send it again ({s})',
    sent: 'Sent again. Check your inbox, and the spam folder.',
    other: 'Use a different email',
  },
  verify: {
    title: 'Finishing your character',
    busy: 'Finishing your character…',
    nameTitle: 'Choose another name',
    submit: 'Finish',
    newLink: 'Send a new link',
    retry: 'Try again',
  },
});

/** A sign-up link's token from a location hash (#verify=<48 hex>), or null. */
export function verifyLinkFrom(hash) {
  const m = /^#verify=([0-9a-f]{48})$/.exec(String(hash || ''));
  return m ? { token: m[1] } : null;
}

/** Fills {email} and {name} in a line of FORM_COPY. */
export function fillCopy(line, values = {}) {
  return String(line).replace(/\{(\w+)\}/g, (all, key) => (key in values ? String(values[key]) : all));
}

/** What a New player answer shows: 'signed-in' (a QA address made at once), 'check-email', or 'refused'. */
export function signUpOutcome(r) {
  if (!r?.ok) return 'refused';
  return r.pending ? 'check-email' : 'signed-in';
}

/**
 * What a sign-up link's answer shows: 'signed-in'; 'name' (choose another
 * name: someone got it first, or it doesn't fit); 'expired' (Send a new
 * link); 'signin' (the link was used, or the email has a character: sign in
 * instead); 'unknown' (an old or broken link); 'retry' (the site didn't
 * answer).
 */
export function verifyOutcome(r) {
  if (r?.ok) return 'signed-in';
  switch (r?.code) {
    case 'name_taken': return 'name';
    case 'signup_expired': return 'expired';
    case 'signup_used':
    case 'email_exists': return 'signin';
    case 'signup_unknown': return 'unknown';
    default: return r?.fields?.name ? 'name' : 'retry';
  }
}

/** The reset link's key and login from a location hash (#reset=<key>&login=<login>), or null. */
export function resetLinkFrom(hash) {
  const m = /^#reset=([A-Za-z0-9]+)&login=([^&]+)$/.exec(String(hash || ''));
  if (!m) return null;
  try {
    return { key: m[1], login: decodeURIComponent(m[2]) };
  } catch {
    return null;
  }
}

const STYLE_ID = 'account-forms-css';
const STYLE = `
.acct-forms { text-align: left; }
.acct-tabs { display: flex; gap: 0.3rem; margin: 0.4rem 0 0.8rem; padding: 0.25rem; border-radius: 12px; background: #e9f1dd; }
.acct-tabs[hidden] { display: none; }
.acct-tabs button { flex: 1; border: 0; border-radius: 9px; padding: 0.5rem 0.6rem; font: inherit; font-weight: 700; cursor: pointer;
  color: #2e5a20; background: transparent; box-shadow: none; }
.acct-tabs button[aria-selected="true"] { color: #24401b; background: #fff; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.18); }
.acct-form { display: grid; gap: 0.55rem; }
.acct-form[hidden] { display: none; }
.acct-field { display: grid; gap: 0.2rem; }
.acct-field label { font-weight: 700; font-size: 0.92rem; color: #2b3a22; }
.acct-field input { box-sizing: border-box; width: 100%; padding: 0.6rem 0.7rem; border-radius: 9px; border: 2px solid #c9d9b6; background: #fff;
  color: #1f2a19; font: inherit; font-size: 1rem; }
.acct-field input:focus { outline: none; border-color: #e07a35; box-shadow: 0 0 0 3px rgba(224, 122, 53, 0.22); }
.acct-field input[aria-invalid="true"] { border-color: #c8553d; }
.acct-field small { color: #5b6b4e; font-size: 0.82rem; }
.acct-field .acct-error { color: #a33b22; font-weight: 600; font-size: 0.85rem; }
.acct-field .acct-error:empty { display: none; }
.acct-check { display: flex; gap: 0.45rem; align-items: center; font-size: 0.9rem; color: #3b4a30; }
.acct-trap { position: absolute; left: -10000px; width: 1px; height: 1px; overflow: hidden; }
.acct-submit { display: block; width: 100%; margin-top: 0.3rem; border: 0; border-radius: 10px; padding: 0.7rem 1rem; cursor: pointer;
  font: inherit; font-size: 1rem; font-weight: 700; color: #fff; background: linear-gradient(180deg, #f09a55, #e07a35); box-shadow: 0 3px 0 #b85a24; }
.acct-submit:disabled { opacity: 0.6; cursor: default; }
.acct-link { justify-self: center; border: 0; padding: 0.2rem; background: none; box-shadow: none; font: inherit; font-weight: 700; color: #2e5a20;
  text-decoration: underline; cursor: pointer; }
.acct-message { margin: 0; font-weight: 600; color: #4c6b2e; }
.acct-message:empty { display: none; }
.acct-message[data-tone="bad"] { color: #a33b22; }
.acct-field[hidden], .acct-submit[hidden], .acct-message[hidden] { display: none; }
.acct-panel { display: grid; gap: 0.55rem; }
.acct-panel[hidden] { display: none; }
.acct-panel p { margin: 0; }
.acct-turnstile { display: flex; justify-content: center; }
.acct-turnstile:empty { display: none; }
.acct-forms[data-account-settings] .acct-form + .acct-form { margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #e3e8d6; }
`;

function el(tag, attrs = {}, text = '') {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === true) node.setAttribute(k, '');
    else if (v !== false && v != null) node.setAttribute(k, v);
  }
  if (text) node.textContent = text;
  return node;
}

let formCount = 0;

/** One labelled input with its help and error lines. */
function field(id, label, attrs, help = '') {
  const wrap = el('div', { class: 'acct-field' });
  const input = el('input', { id, name: attrs.name, ...attrs });
  const error = el('span', { class: 'acct-error', id: `${id}-error`, 'aria-live': 'polite' });
  const described = [error.id];
  wrap.append(el('label', { for: id }, label), input);
  if (help) {
    const small = el('small', { id: `${id}-help` }, help);
    wrap.append(small);
    described.unshift(small.id);
  }
  wrap.append(error);
  input.setAttribute('aria-describedby', described.join(' '));
  return { wrap, input, error };
}

/**
 * Draws the forms into host.
 * @param {HTMLElement} host
 * @param {{ account: object, start?: 'signin' | 'signup', reset?: { key: string, login: string } | null, verify?: { token: string } | null, onSignedIn?: (r: { player: object, how: string }) => void }} opts
 *   account: createMinnAccount() from js/minn-account.js
 */
export function mountAccountForms(host, { account, start = 'signin', reset = null, verify = null, onSignedIn = () => {} } = {}) {
  if (!document.getElementById(STYLE_ID)) {
    const style = el('style', { id: STYLE_ID });
    style.textContent = STYLE;
    document.head.append(style);
  }
  const n = ++formCount;
  const root = el('div', { class: 'acct-forms', 'data-account-forms': '' });
  const tabs = el('div', { class: 'acct-tabs', role: 'tablist', 'aria-label': 'Your account' });
  const message = el('p', { class: 'acct-message', role: 'status', 'aria-live': 'polite' });
  const say = (text, tone = 'good') => {
    message.textContent = text;
    message.dataset.tone = tone;
  };

  // Sign in
  const signin = el('form', { class: 'acct-form', id: `acct-signin-${n}`, 'data-form': 'signin', novalidate: true });
  const siEmail = field(`acct-si-email-${n}`, 'Email', { name: 'email', type: 'email', autocomplete: 'email', inputmode: 'email', autocapitalize: 'none', spellcheck: 'false', required: true });
  const siPass = field(`acct-si-pass-${n}`, 'Password', { name: 'password', type: 'password', autocomplete: 'current-password', required: true });
  const remember = el('input', { type: 'checkbox', name: 'remember', id: `acct-remember-${n}`, checked: true });
  const rememberRow = el('label', { class: 'acct-check', for: remember.id });
  rememberRow.append(remember, document.createTextNode(FORM_COPY.signin.remember));
  const siSubmit = el('button', { type: 'submit', class: 'acct-submit', 'data-account-submit': 'signin' }, FORM_COPY.signin.submit);
  const forgotLink = el('button', { type: 'button', class: 'acct-link', 'data-account-forgot': '' }, FORM_COPY.signin.forgot);
  signin.append(siEmail.wrap, siPass.wrap, rememberRow, siSubmit, forgotLink);

  // New player
  const signup = el('form', { class: 'acct-form', id: `acct-signup-${n}`, 'data-form': 'signup', novalidate: true });
  const suEmail = field(`acct-su-email-${n}`, 'Email', { name: 'email', type: 'email', autocomplete: 'email', inputmode: 'email', autocapitalize: 'none', spellcheck: 'false', required: true }, FORM_COPY.signup.emailHelp);
  const suPass = field(`acct-su-pass-${n}`, 'Password', { name: 'password', type: 'password', autocomplete: 'new-password', minlength: '8', required: true }, FORM_COPY.signup.passwordHelp);
  const suName = field(`acct-su-name-${n}`, 'Character name', { name: 'name', type: 'text', autocomplete: 'nickname', maxlength: '19', autocapitalize: 'words', spellcheck: 'false', required: true }, FORM_COPY.signup.nameHelp);
  // Never shown, never filled by people: a script that fills every field fills this one too.
  const trap = el('div', { class: 'acct-trap', 'aria-hidden': 'true' });
  const trapInput = el('input', { type: 'text', name: 'website', tabindex: '-1', autocomplete: 'off' });
  trap.append(el('label', {}, 'Website'), trapInput);
  const suSubmit = el('button', { type: 'submit', class: 'acct-submit', 'data-account-submit': 'signup' }, FORM_COPY.signup.submit);
  // Turnstile's widget for each emailing form, empty (and hidden) unless the site has a site key.
  const slots = {
    signup: el('div', { class: 'acct-turnstile', 'data-account-turnstile': 'signup' }),
    resend: el('div', { class: 'acct-turnstile', 'data-account-turnstile': 'resend' }),
    forgot: el('div', { class: 'acct-turnstile', 'data-account-turnstile': 'forgot' }),
  };
  signup.append(suEmail.wrap, suPass.wrap, suName.wrap, trap, slots.signup, suSubmit);

  // Forgot your password
  const forgot = el('form', { class: 'acct-form', id: `acct-forgot-${n}`, 'data-form': 'forgot', novalidate: true, hidden: true });
  const fgEmail = field(`acct-fg-email-${n}`, 'Email', { name: 'email', type: 'email', autocomplete: 'email', inputmode: 'email', autocapitalize: 'none', spellcheck: 'false', required: true });
  const fgSubmit = el('button', { type: 'submit', class: 'acct-submit', 'data-account-submit': 'forgot' }, FORM_COPY.forgot.submit);
  const backLink = el('button', { type: 'button', class: 'acct-link', 'data-account-back': '' }, FORM_COPY.forgot.back);
  forgot.append(el('strong', {}, FORM_COPY.forgot.title), el('p', { class: 'acct-message' }, FORM_COPY.forgot.body), fgEmail.wrap, slots.forgot, fgSubmit, backLink);

  // Choose a new password (from a reset link)
  const renew = el('form', { class: 'acct-form', id: `acct-reset-${n}`, 'data-form': 'reset', novalidate: true, hidden: true });
  const rsPass = field(`acct-rs-pass-${n}`, 'New password', { name: 'password', type: 'password', autocomplete: 'new-password', minlength: '8', required: true }, FORM_COPY.signup.passwordHelp);
  const rsSubmit = el('button', { type: 'submit', class: 'acct-submit', 'data-account-submit': 'reset' }, FORM_COPY.reset.submit);
  const againLink = el('button', { type: 'button', class: 'acct-link', 'data-account-again': '' }, FORM_COPY.reset.again);
  renew.append(el('strong', {}, FORM_COPY.reset.title), el('p', { class: 'acct-message' }, FORM_COPY.reset.body), rsPass.wrap, rsSubmit, againLink);

  // Check your email (after New player): no character until the link is opened.
  const check = el('div', { class: 'acct-panel', 'data-form': 'check', hidden: true });
  const checkBody = el('p', { 'data-account-check': '' });
  const checkHeld = el('p', { class: 'acct-message', 'data-account-held': '', hidden: true });
  const resendButton = el('button', { type: 'button', class: 'acct-submit', 'data-account-resend': '' }, FORM_COPY.check.resend);
  const otherLink = el('button', { type: 'button', class: 'acct-link', 'data-account-other': '' }, FORM_COPY.check.other);
  check.append(el('strong', {}, FORM_COPY.check.title), checkBody, checkHeld, slots.resend, resendButton, otherLink);

  // Finishing a character from the emailed link: automatic, unless a name or a new link is needed.
  const finish = el('form', { class: 'acct-form', id: `acct-verify-${n}`, 'data-form': 'verify', novalidate: true, hidden: true });
  const finishTitle = el('strong', {}, FORM_COPY.verify.title);
  const vfName = field(`acct-vf-name-${n}`, 'Character name', { name: 'name', type: 'text', autocomplete: 'nickname', maxlength: '19', autocapitalize: 'words', spellcheck: 'false', required: true }, FORM_COPY.signup.nameHelp);
  const vfSubmit = el('button', { type: 'submit', class: 'acct-submit', 'data-account-submit': 'verify' }, FORM_COPY.verify.submit);
  const newLinkButton = el('button', { type: 'button', class: 'acct-submit', 'data-account-newlink': '' }, FORM_COPY.verify.newLink);
  finish.append(finishTitle, vfName.wrap, vfSubmit, newLinkButton);

  // What the site turns on for the card (a Turnstile site key), asked once; the emailing forms wait for it.
  const requests = createAccountRequests({ api: account.urls?.api || '' });
  let turnstile = null;
  const ready = (account.urls?.api ? requests.options() : Promise.resolve({})).then((options) => {
    if (typeof options.turnstile === 'string' && options.turnstile) {
      turnstile = turnstileWidgets(options.turnstile, slots);
      root.dataset.turnstile = 'on';
    }
    return options;
  });
  /** A Turnstile token for an emailing form ('' when Turnstile is off), and the widget reset after the send. */
  async function withTurnstile(which, plain, guarded) {
    await ready;
    if (!turnstile) return plain();
    const token = await turnstile.token(which);
    try {
      return await guarded(token);
    } finally {
      turnstile.reset(which);
    }
  }

  const panels = { signin, signup };
  const tabButtons = {};
  for (const key of ['signin', 'signup']) {
    const b = el('button', { type: 'button', role: 'tab', id: `acct-tab-${key}-${n}`, 'aria-controls': panels[key].id, 'data-account-tab': key }, FORM_COPY.tabs[key]);
    panels[key].setAttribute('role', 'tabpanel');
    panels[key].setAttribute('aria-labelledby', b.id);
    b.addEventListener('click', () => show(key, { focus: true }));
    tabs.append(b);
    tabButtons[key] = b;
  }
  tabs.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const next = tabButtons.signin.getAttribute('aria-selected') === 'true' ? 'signup' : 'signin';
    show(next);
    tabButtons[next].focus();
  });

  function clearErrors(form) {
    for (const input of form.querySelectorAll('input')) input.removeAttribute('aria-invalid');
    for (const error of form.querySelectorAll('.acct-error')) error.textContent = '';
  }

  function show(which, { focus = false } = {}) {
    say('');
    for (const [key, b] of Object.entries(tabButtons)) {
      b.setAttribute('aria-selected', String(key === which));
      b.tabIndex = key === which ? 0 : -1;
    }
    tabs.hidden = which === 'forgot' || which === 'reset' || which === 'check' || which === 'verify';
    signin.hidden = which !== 'signin';
    signup.hidden = which !== 'signup';
    forgot.hidden = which !== 'forgot';
    renew.hidden = which !== 'reset';
    check.hidden = which !== 'check';
    finish.hidden = which !== 'verify';
    if (which !== 'check') stopCooldown();
    root.dataset.showing = which;
    if (focus) ({ signin: siEmail, signup: suEmail, forgot: fgEmail, reset: rsPass, check: { input: resendButton }, verify: { input: vfName.input } })[which].input.focus();
  }

  // Send it again: once a minute (the site sends nothing sooner), counted down on the button.
  let cooldown = 0;
  let pending = { email: '', name: '' };
  function stopCooldown() {
    if (cooldown) clearInterval(cooldown);
    cooldown = 0;
    resendButton.disabled = false;
    resendButton.textContent = FORM_COPY.check.resend;
  }
  function startCooldown(seconds = 60) {
    stopCooldown();
    let left = seconds;
    resendButton.disabled = true;
    resendButton.textContent = fillCopy(FORM_COPY.check.wait, { s: left });
    cooldown = setInterval(() => {
      left -= 1;
      if (left <= 0 || !root.isConnected) return stopCooldown();
      resendButton.textContent = fillCopy(FORM_COPY.check.wait, { s: left });
    }, 1000);
  }
  function showCheck({ email, name, nameHeld = false }) {
    pending = { email, name };
    show('check');
    root.dataset.pending = 'true';
    checkBody.textContent = fillCopy(name ? FORM_COPY.check.body : FORM_COPY.check.bodyNew, { email, name });
    checkHeld.textContent = nameHeld ? fillCopy(FORM_COPY.check.held, { name }) : '';
    checkHeld.hidden = !nameHeld;
    startCooldown();
  }

  /** The finishing step in one of its states (verifyOutcome): busy, a name to choose, or a new link to ask for. */
  function showFinish(state, r = null) {
    show('verify');
    finish.dataset.state = state;
    finishTitle.textContent = state === 'name' ? FORM_COPY.verify.nameTitle : FORM_COPY.verify.title;
    vfName.wrap.hidden = state !== 'name';
    vfSubmit.hidden = state !== 'name';
    newLinkButton.hidden = state !== 'expired' && state !== 'retry';
    newLinkButton.textContent = state === 'retry' ? FORM_COPY.verify.retry : FORM_COPY.verify.newLink;
    if (state === 'busy') say(FORM_COPY.verify.busy);
    if (r && state !== 'name') say(r.message, 'bad');
    if (r && state === 'name') {
      vfName.input.value = '';
      showRefusal(r, { name: vfName });
    }
  }

  async function finishSignUp(name = '') {
    if (!verify?.token) return;
    const r = await account.verifySignUp({ token: verify.token, name });
    const outcome = verifyOutcome(r);
    if (outcome === 'signed-in') {
      root.dataset.signedIn = 'true';
      onSignedIn({ player: r.player, how: 'verify' });
      return;
    }
    if (outcome === 'signin' || outcome === 'unknown') {
      show('signin');
      say(r.message, outcome === 'unknown' ? 'bad' : 'good');
      return;
    }
    showFinish(outcome, r);
  }

  /** The site's refusals on their fields; the first bad field takes the focus. */
  function showRefusal(r, fields) {
    let first = null;
    for (const [name, text] of Object.entries(r.fields || {})) {
      const f = fields[name];
      if (!f) continue;
      f.input.setAttribute('aria-invalid', 'true');
      f.error.textContent = text;
      first ??= f.input;
    }
    if (!first) say(r.message, 'bad');
    first?.focus();
  }

  async function submit(form, button, busyText, work) {
    if (button.disabled) return;
    clearErrors(form);
    say('');
    const label = button.textContent;
    button.disabled = true;
    button.textContent = busyText;
    try {
      await work();
    } finally {
      button.disabled = false;
      button.textContent = label;
    }
  }

  signin.addEventListener('submit', (e) => {
    e.preventDefault();
    submit(signin, siSubmit, FORM_COPY.signin.busy, async () => {
      const email = siEmail.input.value.trim();
      const password = siPass.input.value;
      const missing = {};
      if (!email.includes('@')) missing.email = 'Enter your email.';
      if (!password) missing.password = 'Enter your password.';
      if (Object.keys(missing).length) return showRefusal({ fields: missing }, { email: siEmail, password: siPass });
      const r = await account.signIn({ email, password, remember: remember.checked });
      if (!r.ok) {
        siPass.input.value = '';
        return showRefusal(r, { email: siEmail, password: siPass });
      }
      root.dataset.signedIn = 'true';
      onSignedIn({ player: r.player, how: 'signin' });
    });
  });

  signup.addEventListener('submit', (e) => {
    e.preventDefault();
    submit(signup, suSubmit, FORM_COPY.signup.busy, async () => {
      const values = { email: suEmail.input.value.trim(), password: suPass.input.value, name: suName.input.value.trim().replace(/\s+/g, ' '), website: trapInput.value };
      const fields = { email: suEmail, password: suPass, name: suName };
      const missing = {};
      if (!values.email.includes('@')) missing.email = 'Enter your email.';
      if (values.password.length < 8) missing.password = 'Passwords need at least 8 characters.';
      if (!/^[A-Za-z0-9](?:[A-Za-z0-9 _-]{1,17})[A-Za-z0-9]$/.test(values.name)) missing.name = 'Names are 3 to 19 letters, numbers, spaces, - or _, starting and ending with a letter or number.';
      if (Object.keys(missing).length) return showRefusal({ fields: missing }, fields);
      const r = await withTurnstile('signup', () => account.signUp(values), async (token) => {
        const answer = await requests.signUp({ ...values, turnstile: token });
        // A QA address signed straight in: the account's nonce follows the new session.
        if (answer.ok && !answer.pending) await account.session?.();
        return answer;
      });
      const outcome = signUpOutcome(r);
      if (outcome === 'refused') return showRefusal(r, fields);
      if (outcome === 'check-email') {
        suPass.input.value = '';
        return showCheck(r);
      }
      root.dataset.signedIn = 'true';
      onSignedIn({ player: r.player, how: 'signup' });
    });
  });

  forgot.addEventListener('submit', (e) => {
    e.preventDefault();
    submit(forgot, fgSubmit, FORM_COPY.forgot.busy, async () => {
      const email = fgEmail.input.value.trim();
      if (!email.includes('@')) return showRefusal({ fields: { email: 'Enter your email.' } }, { email: fgEmail });
      const r = await withTurnstile('forgot', () => account.requestPasswordReset(email), (token) => requests.requestPasswordReset(email, token));
      if (!r.ok) return showRefusal(r, { email: fgEmail });
      show('signin');
      siEmail.input.value = email;
      say(FORM_COPY.forgot.sent);
    });
  });

  renew.addEventListener('submit', (e) => {
    e.preventDefault();
    submit(renew, rsSubmit, FORM_COPY.reset.busy, async () => {
      const password = rsPass.input.value;
      if (password.length < 8) return showRefusal({ fields: { password: 'Passwords need at least 8 characters.' } }, { password: rsPass });
      const r = await account.confirmPasswordReset({ ...reset, password });
      if (!r.ok) return showRefusal(r, { password: rsPass });
      root.dataset.signedIn = 'true';
      onSignedIn({ player: r.player, how: 'reset' });
    });
  });
  againLink.addEventListener('click', () => show('forgot', { focus: true }));

  resendButton.addEventListener('click', async () => {
    if (resendButton.disabled) return;
    resendButton.disabled = true;
    resendButton.textContent = FORM_COPY.check.busy;
    const r = await withTurnstile('resend', () => account.resendSignUp({ email: pending.email }), (token) => requests.resendSignUp({ email: pending.email, turnstile: token }));
    say(r.ok ? FORM_COPY.check.sent : r.message, r.ok ? 'good' : 'bad');
    startCooldown();
  });
  otherLink.addEventListener('click', () => {
    delete root.dataset.pending;
    show('signup', { focus: true });
  });

  finish.addEventListener('submit', (e) => {
    e.preventDefault();
    submit(finish, vfSubmit, FORM_COPY.verify.busy, async () => {
      const name = vfName.input.value.trim().replace(/\s+/g, ' ');
      if (!/^[A-Za-z0-9](?:[A-Za-z0-9 _-]{1,17})[A-Za-z0-9]$/.test(name)) return showRefusal({ fields: { name: 'Names are 3 to 19 letters, numbers, spaces, - or _, starting and ending with a letter or number.' } }, { name: vfName });
      await finishSignUp(name);
    });
  });
  newLinkButton.addEventListener('click', async () => {
    if (finish.dataset.state === 'retry') {
      showFinish('busy');
      return finishSignUp();
    }
    newLinkButton.disabled = true;
    const r = await account.resendSignUp({ token: verify?.token || '' });
    newLinkButton.disabled = false;
    if (r.ok) return showCheck({ email: r.email || '', name: '' });
    say(r.message, 'bad');
  });

  forgotLink.addEventListener('click', () => {
    fgEmail.input.value = siEmail.input.value;
    show('forgot', { focus: true });
  });
  backLink.addEventListener('click', () => show('signin', { focus: true }));

  root.append(tabs, message, signin, signup, forgot, renew, check, finish);
  host.replaceChildren(root);
  if (verify?.token) {
    showFinish('busy');
    finishSignUp();
  } else {
    show(reset ? 'reset' : start === 'signup' ? 'signup' : 'signin');
  }
  return { root, show };
}

/** The settings copy (plain remake copy, no em-dashes). */
export const SETTINGS_COPY = Object.freeze({
  email: { title: 'Email', help: 'You sign in with it, and password resets go to it.', submit: 'Change email', busy: 'Changing…', done: 'Your email changed. The old address was told.' },
  password: { title: 'Password', submit: 'Change password', busy: 'Changing…', done: 'Your password changed. Other devices were signed out.' },
});

/**
 * The signed-in player's settings (the multiplayer Account panel): a new
 * email or a new password, each confirmed with the current password.
 * onChanged({ what, email }) after a change.
 */
export function mountAccountSettings(host, { account, email = '', onChanged = () => {} } = {}) {
  if (!document.getElementById(STYLE_ID)) {
    const style = el('style', { id: STYLE_ID });
    style.textContent = STYLE;
    document.head.append(style);
  }
  const n = ++formCount;
  const root = el('div', { class: 'acct-forms', 'data-account-settings': '' });
  const message = el('p', { class: 'acct-message', role: 'status', 'aria-live': 'polite' });
  const say = (text, tone = 'good') => {
    message.textContent = text;
    message.dataset.tone = tone;
  };
  let shownEmail = email;

  const mailForm = el('form', { class: 'acct-form', 'data-form': 'email', novalidate: true });
  const mailNow = el('p', { class: 'acct-message', 'data-account-email': '' }, shownEmail ? `Now: ${shownEmail}` : '');
  const mailNew = field(`acct-ch-email-${n}`, 'New email', { name: 'email', type: 'email', autocomplete: 'email', inputmode: 'email', autocapitalize: 'none', spellcheck: 'false', required: true }, SETTINGS_COPY.email.help);
  const mailCurrent = field(`acct-ch-email-current-${n}`, 'Current password', { name: 'current', type: 'password', autocomplete: 'current-password', required: true });
  const mailSubmit = el('button', { type: 'submit', class: 'acct-submit', 'data-account-submit': 'email' }, SETTINGS_COPY.email.submit);
  mailForm.append(el('strong', {}, SETTINGS_COPY.email.title), mailNow, mailNew.wrap, mailCurrent.wrap, mailSubmit);

  const passForm = el('form', { class: 'acct-form', 'data-form': 'password', novalidate: true });
  const passCurrent = field(`acct-ch-pass-current-${n}`, 'Current password', { name: 'current', type: 'password', autocomplete: 'current-password', required: true });
  const passNew = field(`acct-ch-pass-new-${n}`, 'New password', { name: 'password', type: 'password', autocomplete: 'new-password', minlength: '8', required: true }, FORM_COPY.signup.passwordHelp);
  const passSubmit = el('button', { type: 'submit', class: 'acct-submit', 'data-account-submit': 'password' }, SETTINGS_COPY.password.submit);
  passForm.append(el('strong', {}, SETTINGS_COPY.password.title), passCurrent.wrap, passNew.wrap, passSubmit);

  const clear = (form) => {
    for (const input of form.querySelectorAll('input')) input.removeAttribute('aria-invalid');
    for (const error of form.querySelectorAll('.acct-error')) error.textContent = '';
  };
  const show = (r, fields) => {
    let first = null;
    for (const [name, text] of Object.entries(r.fields || {})) {
      const f = fields[name];
      if (!f) continue;
      f.input.setAttribute('aria-invalid', 'true');
      f.error.textContent = text;
      first ??= f.input;
    }
    if (!first) say(r.message, 'bad');
    first?.focus();
  };
  const busy = async (button, text, work) => {
    if (button.disabled) return;
    const label = button.textContent;
    button.disabled = true;
    button.textContent = text;
    try { await work(); } finally { button.disabled = false; button.textContent = label; }
  };

  mailForm.addEventListener('submit', (e) => {
    e.preventDefault();
    clear(mailForm);
    say('');
    busy(mailSubmit, SETTINGS_COPY.email.busy, async () => {
      const fields = { email: mailNew, current: mailCurrent };
      const value = mailNew.input.value.trim();
      if (!value.includes('@')) return show({ fields: { email: 'Enter the new email.' } }, fields);
      if (!mailCurrent.input.value) return show({ fields: { current: 'Enter your current password.' } }, fields);
      const r = await account.changeEmail({ current: mailCurrent.input.value, email: value });
      if (!r.ok) return show(r, fields);
      shownEmail = r.email;
      mailNow.textContent = `Now: ${shownEmail}`;
      mailForm.reset();
      say(SETTINGS_COPY.email.done);
      onChanged({ what: 'email', email: shownEmail });
    });
  });

  passForm.addEventListener('submit', (e) => {
    e.preventDefault();
    clear(passForm);
    say('');
    busy(passSubmit, SETTINGS_COPY.password.busy, async () => {
      const fields = { current: passCurrent, password: passNew };
      if (!passCurrent.input.value) return show({ fields: { current: 'Enter your current password.' } }, fields);
      if (passNew.input.value.length < 8) return show({ fields: { password: 'Passwords need at least 8 characters.' } }, fields);
      const r = await account.changePassword({ current: passCurrent.input.value, password: passNew.input.value });
      if (!r.ok) return show(r, fields);
      passForm.reset();
      say(SETTINGS_COPY.password.done);
      onChanged({ what: 'password' });
    });
  });

  root.append(message, mailForm, passForm);
  host.replaceChildren(root);
  return { root };
}
