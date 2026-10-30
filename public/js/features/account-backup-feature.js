/**
 * Solo backups on the player's account (multiplayer phase 2, Austin's plan of
 * 2026-10-25): when the solo game runs on the Groddle site (Minn), the Menu
 * gets an Account item. Signed in, it backs this browser's solo game up to
 * one of a few slots on the account and restores one into the browser, so a
 * solo game can move to another browser or survive a cleared one. A backup
 * stays a solo game: it is only ever restored here, never played online
 * (groddle-afternoon-site/src/SoloBackups.php keeps them apart from the multiplayer
 * save). Restoring over a local game that was saved later than the backup
 * asks first.
 *
 * Signed out, the panel holds the game's own sign-in forms (js/account-forms.js:
 * email and password, or a new player), and signed in it has Sign out.
 *
 * The Menu also gets Multiplayer, the way to /play/online/ from a solo game
 * already under way (the start card only offers the choice on a new game).
 *
 * In multiplayer the Menu gets Account (change the sign-in email or the
 * password, each with the current password; Your profile, from
 * profiles-feature) and Sign out: the save is
 * written first, then the session ends and the page goes back to the gate.
 *
 * Off in practice copies (?practice=1 swaps the storage) and on a plain
 * static server (no account routes answer).
 *
 * Solo asks who is playing the quiet way (online-boot.js quietSession, G322):
 * a signed-out page never asks admin-ajax for a REST nonce, whose "0" with
 * 400 showed in the console (Austin 2026-10-28). Only a signed-in page does.
 * QA: /play/ on groddle.localhost, Menu, Account; /play/online/, Menu, Sign out.
 */

import { createMinnAccount } from '../minn-account.js?v=nbhome-10';
import { mountAccountForms, mountAccountSettings } from '../account-forms.js?v=g463-1';
import { createBrowserSaveStore, freezeSoloSaves, restoreSoloSave, saveStore, savedAtOf, soloSaveSnapshot } from '../save-store.js?v=mp2-2';
import { formatGameDayLabel } from '../game-day.js?v=dametime-4';
import { multiplayerEntryUrl } from '../game-mode.js?v=mp2-1';
import { quietSession } from '../online-boot.js?v=g477-2';

/** Which slot a new backup goes to: the first empty one, else the oldest (which then needs a yes). */
export function slotForNewBackup(backups, slots) {
  const used = new Map((backups || []).map((b) => [b.slot, b]));
  for (let slot = 1; slot <= slots; slot++) if (!used.has(slot)) return { slot, replaces: null };
  const oldest = [...used.values()].sort((a, b) => String(a.madeAt).localeCompare(String(b.madeAt)) || a.slot - b.slot)[0];
  return { slot: oldest.slot, replaces: oldest };
}

/**
 * Whether restoring would replace a local game saved after the backup.
 * @returns {{ ask: boolean, localAt: number, backupAt: number }}
 */
export function restoreNeedsAsking(localEntries, backupEntries) {
  const localAt = savedAtOf(localEntries);
  const backupAt = savedAtOf(backupEntries);
  return { ask: localAt > 0 && localAt > backupAt, localAt, backupAt };
}

/** A size for people: 12 KB, 1.4 MB. */
export function sizeLabel(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function when(ms) {
  if (!ms) return 'unknown time';
  try {
    return new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' });
  } catch {
    return new Date(ms).toISOString();
  }
}

const STYLE = `
.account-shade { position: fixed; inset: 0; z-index: var(--z-screen); display: grid; place-items: center; padding: var(--sp-8); background: color-mix(in srgb, var(--c-sage-23) 45%, transparent); }
.account-shade[hidden] { display: none; }
.account-panel { width: min(30rem, 100%); max-height: calc(100vh - 2rem); overflow: auto; border-radius: var(--radius-2xl); padding: var(--sp-8) var(--sp-9) var(--sp-9);
  background: var(--surface-card); color: var(--c-sand-28); box-shadow: var(--shadow-3); font: var(--fs-base)/var(--lh-loose) var(--font-system); }
.account-panel h2 { margin: 0 0 var(--sp-3); font-size: var(--fs-xl); }
.account-panel p { margin: var(--sp-3) 0; }
.account-panel .account-actions { display: flex; flex-wrap: wrap; gap: var(--sp-4); margin: var(--sp-6) 0 var(--sp-2); }
.account-panel button, .account-panel a.account-link { font: inherit; font-weight: 700; border: 0; border-radius: var(--radius-md); padding: var(--sp-4) var(--sp-7); cursor: pointer;
  text-decoration: none; color: var(--text-inverse); background: linear-gradient(180deg, var(--c-orange-76), var(--c-orange-68)); box-shadow: 0 2px 0 var(--c-orange-57); }
.account-panel button.alt, .account-panel a.account-link.alt { color: var(--text-moss); background: var(--surface-moss); box-shadow: inset 0 0 0 2px var(--c-lime-85); }
.account-panel button:disabled { opacity: 0.55; cursor: default; }
.account-panel .account-slots { list-style: none; margin: var(--sp-6) 0 0; padding: 0; display: grid; gap: 0.45rem; }
.account-panel .account-slots li { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-3) var(--sp-5); padding: var(--sp-4) var(--sp-5); border-radius: var(--radius-md); background: var(--surface-parchment); }
.account-panel .account-slots .slot-what { flex: 1 1 14rem; }
.account-panel .account-slots .slot-what small { display: block; opacity: 0.75; }
.account-panel .account-slots button { padding: var(--sp-3) var(--sp-5); }
.account-panel .account-note { min-height: 1.4em; margin-top: var(--sp-5); font-weight: 600; color: var(--c-lime-49); }
.account-panel .account-note[data-tone="bad"] { color: var(--text-danger); }
.account-panel .account-close { float: right; padding: 0.2rem 0.55rem; color: var(--c-sand-28); background: transparent; box-shadow: none; font-size: var(--fs-2xl); line-height: var(--lh-none); }
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

function createPanel(engine, account, signedInSession) {
  let session = signedInSession;
  const style = el('style', { id: 'account-backup-css' });
  style.textContent = STYLE;
  document.head.append(style);
  const shade = el('div', { id: 'account-shade', class: 'account-shade', hidden: true });
  const panel = el('div', { id: 'account-panel', class: 'account-panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'account-title' });
  shade.append(panel);
  document.body.append(shade);
  let busy = false;
  let list = null;

  const close = () => {
    shade.hidden = true;
    engine.setData?.('accountPanel', 'closed');
  };
  shade.addEventListener('pointerdown', (e) => { if (e.target === shade) close(); });
  // Keys pressed in the panel stay in it: the game's movement keys must not fire under it.
  shade.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') close();
  });

  const note = el('p', { class: 'account-note', role: 'status', 'aria-live': 'polite' });
  const say = (text, tone = 'good') => {
    note.textContent = text;
    note.dataset.tone = tone;
  };

  function frame(title) {
    panel.replaceChildren();
    const x = el('button', { type: 'button', class: 'account-close', 'aria-label': 'Close' }, '×');
    x.addEventListener('click', close);
    panel.append(x, el('h2', { id: 'account-title' }, title));
  }

  function signedOut() {
    frame('Back up your solo game');
    panel.append(
      el('p', {}, 'Sign in to keep copies of this browser\'s solo game on your Groddle account, then carry on in another browser.'),
    );
    const host = el('div', { class: 'account-forms' });
    panel.append(host);
    mountAccountForms(host, {
      account,
      onSignedIn: async ({ player }) => {
        session = { ...session, signedIn: true, player };
        engine.setData?.('accountSession', 'signed-in');
        await render();
        say(`Signed in as ${player?.name || 'you'}.`);
        panel.querySelector('button')?.focus();
      },
    });
  }

  async function signOut() {
    if (busy) return;
    busy = true;
    await account.signOut();
    busy = false;
    session = { ...session, signedIn: false, player: null };
    engine.setData?.('accountSession', 'signed-out');
    signedOut();
  }

  function localEntries() {
    try { return soloSaveSnapshot(createBrowserSaveStore()).entries; } catch { return null; }
  }

  async function backUp() {
    if (busy) return;
    const target = slotForNewBackup(list?.backups, list?.slots || 3);
    if (target.replaces && !(await ask(`All ${list.slots} slots are full. Replace the oldest backup (slot ${target.slot}, ${when(Date.parse(target.replaces.madeAt))})?`, 'Replace it'))) return;
    await backUpTo(target.slot);
  }

  async function backUpTo(slot) {
    busy = true;
    say('Backing up…');
    try {
      try { engine.save?.(); } catch { /* the store says what it can */ }
      const data = soloSaveSnapshot(createBrowserSaveStore());
      const day = formatGameDayLabel(savedAtOf(data.entries) || Date.now());
      await account.writeBackup(slot, data, day);
      busy = false;
      await render();
      say(`Backed up to slot ${slot}.`);
      engine.setData?.('accountBackup', `slot-${slot}`);
    } catch (err) {
      busy = false;
      say(err?.code === 'groddle_save_too_large' ? 'This game is too big to back up.' : `The backup did not save: ${err?.message || err}`, 'bad');
    }
  }

  async function restore(slot) {
    if (busy) return;
    busy = true;
    say('Fetching the backup…');
    let backup;
    try {
      backup = await account.readBackup(slot);
    } catch (err) {
      busy = false;
      say(`The backup did not load: ${err?.message || err}`, 'bad');
      return;
    }
    busy = false;
    say('');
    const local = localEntries();
    const { ask: newer, localAt, backupAt } = restoreNeedsAsking(local, backup.data?.entries);
    if (newer && !(await ask(`The game in this browser was saved ${when(localAt)}. This backup holds the game as it was ${when(backupAt)}. Restoring replaces the newer game here. Restore anyway?`, 'Restore anyway'))) {
      say('Nothing changed.');
      return;
    }
    try {
      freezeSoloSaves();
      restoreSoloSave(backup.data);
    } catch (err) {
      say(`That backup cannot be restored: ${err?.message || err}`, 'bad');
      return;
    }
    say('Restored. Starting the game again…');
    engine.setData?.('accountRestore', `slot-${slot}`);
    setTimeout(() => location.reload(), 250);
  }

  async function remove(slot) {
    if (busy || !(await ask(`Delete the backup in slot ${slot}?`, 'Delete'))) return;
    try {
      await account.deleteBackup(slot);
      await render();
      say(`Slot ${slot} is empty now.`);
    } catch (err) {
      say(`The backup was not deleted: ${err?.message || err}`, 'bad');
    }
  }

  /** An in-panel yes or no (no browser dialog, which would stop the game loop). */
  function ask(question, yes) {
    return new Promise((resolve) => {
      const box = el('div', { class: 'account-ask', role: 'alertdialog' });
      box.append(el('p', {}, question));
      const actions = el('div', { class: 'account-actions' });
      const ok = el('button', { type: 'button', 'data-account-yes': '' }, yes);
      const no = el('button', { type: 'button', class: 'alt', 'data-account-no': '' }, 'Cancel');
      actions.append(ok, no);
      box.append(actions);
      const done = (answer) => {
        box.remove();
        resolve(answer);
      };
      ok.addEventListener('click', () => done(true));
      no.addEventListener('click', () => done(false));
      note.before(box);
      ok.focus();
    });
  }

  async function render() {
    frame('Your account');
    panel.append(el('p', {}, `Signed in as ${session.player?.name || 'you'}. Backups keep copies of this browser's solo game on your account. They stay solo games and never go online.`));
    try {
      list = await account.listBackups();
    } catch (err) {
      panel.append(note);
      say(`Your backups did not load: ${err?.message || err}`, 'bad');
      return;
    }
    const local = localEntries();
    const out = el('button', { type: 'button', class: 'alt', 'data-account-signout': '' }, 'Sign out');
    out.addEventListener('click', signOut);
    const actions = el('div', { class: 'account-actions' });
    const backBtn = el('button', { type: 'button', 'data-account-backup': '', disabled: !local }, 'Back up to my account');
    backBtn.addEventListener('click', backUp);
    const newest = [...list.backups].sort((a, b) => String(b.madeAt).localeCompare(String(a.madeAt)))[0];
    const restoreBtn = el('button', { type: 'button', class: 'alt', 'data-account-restore': '', disabled: !newest }, 'Restore from my account');
    restoreBtn.addEventListener('click', () => newest && restore(newest.slot));
    actions.append(backBtn, restoreBtn, out);
    panel.append(actions);
    if (!local) panel.append(el('p', {}, 'There is no solo game in this browser yet, so there is nothing to back up.'));
    const slots = el('ul', { class: 'account-slots' });
    const bySlot = new Map(list.backups.map((b) => [b.slot, b]));
    for (let slot = 1; slot <= list.slots; slot++) {
      const b = bySlot.get(slot);
      const row = el('li', { 'data-slot': String(slot), 'data-filled': b ? 'true' : 'false' });
      const what = el('span', { class: 'slot-what' });
      what.append(document.createTextNode(b ? `Slot ${slot}: ${b.gameDay || 'a solo game'}` : `Slot ${slot}: empty`));
      if (b) what.append(el('small', {}, `Backed up ${when(Date.parse(b.madeAt))} · ${sizeLabel(b.size)}`));
      row.append(what);
      const here = el('button', { type: 'button', class: 'alt', 'data-account-backup-slot': String(slot), disabled: !local }, 'Back up here');
      here.addEventListener('click', async () => {
        if (b && !(await ask(`Replace the backup in slot ${slot}?`, 'Replace it'))) return;
        backUpTo(slot);
      });
      row.append(here);
      if (b) {
        const r = el('button', { type: 'button', 'data-account-restore-slot': String(slot) }, 'Restore');
        r.addEventListener('click', () => restore(slot));
        const d = el('button', { type: 'button', class: 'alt', 'data-account-delete-slot': String(slot) }, 'Delete');
        d.addEventListener('click', () => remove(slot));
        row.append(r, d);
      }
      slots.append(row);
    }
    panel.append(slots, note);
  }

  return {
    async open() {
      shade.hidden = false;
      engine.setData?.('accountPanel', 'open');
      if (session.signedIn) await render();
      else signedOut();
      panel.querySelector('button, a')?.focus();
    },
  };
}

async function install(engine) {
  const account = createMinnAccount({ baseUri: document.baseURI });
  const session = await quietSession(account);
  engine.setData?.('accountSession', session.minn ? (session.signedIn ? 'signed-in' : 'signed-out') : 'none');
  if (!session.minn) return;
  const list = document.getElementById('more-list');
  if (!list) return;
  // The way into multiplayer from a solo game in progress (the start card only asks on a new game).
  const online = el('button', { id: 'multiplayer-btn', type: 'button', class: 'chrome-btn', title: 'Play with others: sign in and play a separate character, saved on the Groddle site' }, 'Multiplayer');
  online.addEventListener('click', () => { location.href = multiplayerEntryUrl(document.baseURI); });
  list.append(online);
  const panel = createPanel(engine, account, session);
  const btn = el('button', { id: 'account-btn', type: 'button', class: 'chrome-btn', title: 'Back up or restore your solo game' }, 'Account');
  btn.addEventListener('click', () => { panel.open(); });
  list.append(btn);
}

/** Signs a multiplayer player out once the save is written, back to the gate. */
async function signOutMultiplayer(engine, account, button) {
  if (button) {
    button.disabled = true;
    button.textContent = 'Signing out…';
  }
  try { engine.save?.(); } catch { /* the store writes what it has */ }
  // Twice: a write already in flight resolves the first, the newest change goes in the second.
  try { await saveStore.flush?.(); await saveStore.flush?.(); } catch { /* signed out regardless */ }
  await account.signOut();
  engine.setData?.('accountSession', 'signed-out');
  location.href = account.urls.online;
}

/** Multiplayer's Account panel: who you play as, your email and password, Sign out. */
function createMultiplayerPanel(engine, account) {
  if (!document.getElementById('account-backup-css')) {
    const style = el('style', { id: 'account-backup-css' });
    style.textContent = STYLE;
    document.head.append(style);
  }
  const shade = el('div', { id: 'account-shade', class: 'account-shade', hidden: true });
  const panel = el('div', { id: 'account-panel', class: 'account-panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'account-title' });
  shade.append(panel);
  document.body.append(shade);
  const close = () => {
    shade.hidden = true;
    engine.setData?.('accountPanel', 'closed');
  };
  shade.addEventListener('pointerdown', (e) => { if (e.target === shade) close(); });
  shade.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') close();
  });
  return {
    async open() {
      shade.hidden = false;
      engine.setData?.('accountPanel', 'open');
      panel.replaceChildren();
      const x = el('button', { type: 'button', class: 'account-close', 'aria-label': 'Close' }, '×');
      x.addEventListener('click', close);
      panel.append(x, el('h2', { id: 'account-title' }, 'Your account'));
      const session = await account.session();
      if (!session.signedIn) {
        location.href = account.urls.online;
        return;
      }
      panel.append(el('p', {}, `Playing as ${session.player?.name || 'you'}. Your character saves on the Groddle site.`));
      const host = el('div', { class: 'account-forms' });
      panel.append(host);
      mountAccountSettings(host, { account, email: session.account?.email || '', onChanged: ({ what }) => engine.setData?.('accountChanged', what) });
      // Your profile (features/profiles-feature.js, G338): the description and a link to the public page.
      const profile = el('div', { class: 'account-profile-host' });
      panel.append(profile);
      if (!engine.query?.('accountProfile', profile, engine)) profile.remove();
      const actions = el('div', { class: 'account-actions' });
      const out = el('button', { type: 'button', class: 'alt', 'data-account-signout': '' }, 'Sign out');
      out.addEventListener('click', () => signOutMultiplayer(engine, account, out));
      actions.append(out);
      panel.append(actions);
      panel.querySelector('input')?.focus();
    },
  };
}

/** Multiplayer's Menu: Account (email, password) and Sign out, once the save is written. */
function installSignOut(engine) {
  const list = document.getElementById('more-list');
  if (!list) return;
  const account = createMinnAccount({ baseUri: document.baseURI });
  const panel = createMultiplayerPanel(engine, account);
  const acct = el('button', { id: 'account-btn', type: 'button', class: 'chrome-btn', title: 'Your email and password' }, 'Account');
  acct.addEventListener('click', () => { panel.open(); });
  const btn = el('button', { id: 'signout-btn', type: 'button', class: 'chrome-btn', title: 'Save, sign out and go back to the sign-in' }, 'Sign out');
  btn.addEventListener('click', () => signOutMultiplayer(engine, account, btn));
  list.append(acct, btn);
}

export const accountBackupFeature = {
  id: 'account-backup',

  init(engine) {
    if (typeof document === 'undefined' || globalThis.groddlePractice === true) return;
    if (engine.mode === 'multiplayer') {
      installSignOut(engine);
      return;
    }
    if (engine.mode !== 'solo') return;
    install(engine).catch((err) => console.warn('[account-backup]', err));
  },
};
