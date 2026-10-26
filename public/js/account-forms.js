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
 * mountAccountForms(host, { account, start, onSignedIn }) replaces host's
 * children; onSignedIn({ player, how: 'signin' | 'signup' }) runs once the
 * session and its nonce are in place.
 */

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
});

const STYLE_ID = 'account-forms-css';
const STYLE = `
.acct-forms { text-align: left; }
.acct-tabs { display: flex; gap: 0.3rem; margin: 0.4rem 0 0.8rem; padding: 0.25rem; border-radius: 12px; background: #e9f1dd; }
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
 * @param {{ account: object, start?: 'signin' | 'signup', onSignedIn?: (r: { player: object, how: string }) => void }} opts
 *   account: createMinnAccount() from js/minn-account.js
 */
export function mountAccountForms(host, { account, start = 'signin', onSignedIn = () => {} } = {}) {
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
  signup.append(suEmail.wrap, suPass.wrap, suName.wrap, trap, suSubmit);

  // Forgot your password
  const forgot = el('form', { class: 'acct-form', id: `acct-forgot-${n}`, 'data-form': 'forgot', novalidate: true, hidden: true });
  const fgEmail = field(`acct-fg-email-${n}`, 'Email', { name: 'email', type: 'email', autocomplete: 'email', inputmode: 'email', autocapitalize: 'none', spellcheck: 'false', required: true });
  const fgSubmit = el('button', { type: 'submit', class: 'acct-submit', 'data-account-submit': 'forgot' }, FORM_COPY.forgot.submit);
  const backLink = el('button', { type: 'button', class: 'acct-link', 'data-account-back': '' }, FORM_COPY.forgot.back);
  forgot.append(el('strong', {}, FORM_COPY.forgot.title), el('p', { class: 'acct-message' }, FORM_COPY.forgot.body), fgEmail.wrap, fgSubmit, backLink);

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
    tabs.hidden = which === 'forgot';
    for (const [key, b] of Object.entries(tabButtons)) {
      b.setAttribute('aria-selected', String(key === which));
      b.tabIndex = key === which ? 0 : -1;
    }
    signin.hidden = which !== 'signin';
    signup.hidden = which !== 'signup';
    forgot.hidden = which !== 'forgot';
    root.dataset.showing = which;
    if (focus) ({ signin: siEmail, signup: suEmail, forgot: fgEmail })[which].input.focus();
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
      const r = await account.signUp(values);
      if (!r.ok) return showRefusal(r, fields);
      root.dataset.signedIn = 'true';
      onSignedIn({ player: r.player, how: 'signup' });
    });
  });

  forgot.addEventListener('submit', (e) => {
    e.preventDefault();
    submit(forgot, fgSubmit, FORM_COPY.forgot.busy, async () => {
      const email = fgEmail.input.value.trim();
      if (!email.includes('@')) return showRefusal({ fields: { email: 'Enter your email.' } }, { email: fgEmail });
      const r = await account.requestPasswordReset(email);
      if (!r.ok) return showRefusal(r, { email: fgEmail });
      show('signin');
      siEmail.input.value = email;
      say(FORM_COPY.forgot.sent);
    });
  });

  forgotLink.addEventListener('click', () => {
    fgEmail.input.value = siEmail.input.value;
    show('forgot', { focus: true });
  });
  backLink.addEventListener('click', () => show('signin', { focus: true }));

  root.append(tabs, message, signin, signup, forgot);
  host.replaceChildren(root);
  show(start === 'signup' ? 'signup' : 'signin');
  return { root, show };
}
