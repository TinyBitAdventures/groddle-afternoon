/**
 * The phone page's Account tab (#636): what the game's Menu > Account holds, for a player on the
 * phone page who never opens the game. Loaded when the tab is first opened, so the page stays small.
 *
 * - Your email and password (js/account-forms.js mountAccountSettings, the same forms as the game's).
 * - Change name (js/change-name.js mountChangeName: its cost and wait come from the site, which
 *   charges the character's ledger; the game picks the new name up when it next loads).
 * - Your profile: the description other players read on the site (the game's Menu > Account,
 *   Your profile, features/profiles-feature.js; the site's /players/<name>/ page).
 *
 * Glitch kept both on its website, not in the client (TSFrontController.as opened
 * root_url + 'account/' and root_url + 'profiles/' + tsid): here they live in the game's Menu and
 * on this page.
 */
import { mountAccountSettings } from '../account-forms.js?v=683e1475';
import { mountChangeName } from '../change-name.js?v=4685ccda';
import { PROFILE_COPY, aboutCounter } from '../profiles.js?v=1daccbb9';

export const PHONE_ACCOUNT_TEXT = Object.freeze({
  playing: (name) => `Playing as ${name || 'you'}.`,
  where: 'The same settings are in the game, under Menu, then Account.',
});

const STYLE_ID = 'pc-account-css';
const STYLE = `.pc-panel[data-phone-panel="account"] .acct-forms { margin-top: 8px; }
.pc-profile { display: grid; gap: 8px; margin-top: 16px; }
.pc-profile h2 { margin: 0; font-size: var(--fs-lg); }
.pc-profile textarea { width: 100%; box-sizing: border-box; min-height: 6rem; padding: 8px; font: inherit; border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--surface); color: var(--fg); }
.pc-profile-count { justify-self: end; font-size: var(--fs-md); }`;

function el(doc, tag, attrs = {}, text = '') {
  const node = doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === true) node.setAttribute(k, '');
    else if (v !== false && v != null) node.setAttribute(k, v);
  }
  if (text) node.textContent = text;
  return node;
}

/** The description box: loads the profile, counts, saves (account.profile / account.saveAbout). */
export function mountPhoneProfile(host, { account, doc = globalThis.document } = {}) {
  const box = el(doc, 'section', { class: 'pc-profile', 'data-phone-profile': '' });
  const area = el(doc, 'textarea', { id: 'pc-profile-about', rows: '4', placeholder: PROFILE_COPY.placeholder, 'data-phone-profile-about': '', disabled: true });
  const count = el(doc, 'span', { class: 'pc-profile-count', 'aria-live': 'polite' });
  const save = el(doc, 'button', { type: 'button', class: 'pc-button', 'data-phone-profile-save': '', disabled: true }, PROFILE_COPY.save);
  const note = el(doc, 'p', { class: 'pc-note', role: 'status', 'aria-live': 'polite', 'data-phone-profile-note': '' });
  const link = el(doc, 'a', { class: 'pc-link', 'data-phone-profile-link': '', hidden: true }, PROFILE_COPY.see);
  box.append(el(doc, 'h2', {}, PROFILE_COPY.heading), el(doc, 'p', {}, PROFILE_COPY.intro), el(doc, 'label', { for: 'pc-profile-about' }, PROFILE_COPY.label), area, count, save, note, link);
  host.append(box);
  let max = 500;
  const recount = () => {
    const c = aboutCounter(area.value, max);
    count.textContent = c.label;
    save.disabled = c.over || area.disabled;
    return c;
  };
  const show = (p) => {
    max = Number(p?.aboutMax) || max;
    area.value = p?.about || '';
    area.disabled = false;
    if (p?.url) {
      link.href = new URL(p.url, doc.baseURI).href;
      link.hidden = false;
    }
    recount();
  };
  area.addEventListener('input', () => {
    note.textContent = '';
    recount();
  });
  save.addEventListener('click', async () => {
    const c = recount();
    if (c.over) {
      note.textContent = PROFILE_COPY.over(max);
      return;
    }
    save.disabled = true;
    save.textContent = PROFILE_COPY.saving;
    try {
      show(await account.saveAbout(area.value));
      note.textContent = PROFILE_COPY.saved;
    } catch {
      note.textContent = PROFILE_COPY.failed;
    } finally {
      save.textContent = PROFILE_COPY.save;
      recount();
    }
  });
  const ready = Promise.resolve()
    .then(() => account.profile())
    .then(show, () => {
      note.textContent = PROFILE_COPY.failed;
    });
  return { root: box, ready };
}

/** The whole tab into `host`: who you play as, email and password, Change name, Your profile. */
export function mountPhoneAccount(host, { account, session = null, doc = globalThis.document } = {}) {
  // Its styles come with it (the page's own phone.css stays the size it was).
  if (!doc.getElementById(STYLE_ID)) doc.head.append(el(doc, 'style', { id: STYLE_ID }, STYLE));
  host.replaceChildren();
  const playing = el(doc, 'p', { class: 'pc-account-playing', 'data-phone-account-playing': '' }, PHONE_ACCOUNT_TEXT.playing(session?.player?.name));
  const forms = el(doc, 'div', { class: 'pc-account-forms' });
  host.append(playing, el(doc, 'p', { class: 'pc-note' }, PHONE_ACCOUNT_TEXT.where), forms);
  mountAccountSettings(forms, { account, email: session?.account?.email || '' });
  mountChangeName(forms.querySelector('[data-account-settings]') || forms, {
    account,
    doc,
    onRenamed: ({ name }) => { playing.textContent = PHONE_ACCOUNT_TEXT.playing(name); },
  });
  return mountPhoneProfile(host, { account, doc });
}
