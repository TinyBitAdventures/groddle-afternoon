/**
 * The Classic chat column's panes (classic-spec spec §7a-§7d; RightSideView.as, ChatArea.as), on the
 * Social drawer (js/ui/social-drawer.js), which stays the one owner of the chats, the input and the
 * keys.
 *
 * - "Local Chat / Activity" is always the bottom pane, and it is Local's lines and the Activity log
 *   together, as the client's was (drawer.logNodes): solo that is the drawer's Activity tab itself;
 *   online, with Local picked, the drawer's own log shows both.
 * - Another chat picked online (a party, a group, Global Chat, Buddies) opens as the pane above it:
 *   the drawer's view, titled with that chat's name and a close that goes back to Local; the
 *   Local Chat / Activity pane stays under it with its own field, which says its words on Local.
 * - Each pane has the client's title row: the options chevron, the title, the unread pill (#b1b7ba,
 *   "∞" past 99) and, on the upper pane, the close.
 * Everything here shows only under Classic (inline display, so Modern is untouched).
 */
import { uiState, onUiModeChange } from './ui-mode.js?v=g468-9';
import { classicArtUrl } from './classic-art.js?v=g468-9';

/** The tabs that are the bottom pane, not a pane above it. */
export const LOCAL_TABS = Object.freeze(['local', 'activity']);

/** PURE: the unread pill's words (ChatArea.as: "∞" above 99), '' for none. */
export function pillText(n) {
  const v = Math.max(0, Math.floor(Number(n) || 0));
  if (!v) return '';
  return v > 99 ? '∞' : String(v);
}

/** PURE: which panes show: the upper one only online, for a tab that is not Local or Activity. */
export function paneLayout({ online, tab }) {
  const upper = Boolean(online) && !LOCAL_TABS.includes(tab);
  return { upper, lowerOwn: upper, mergeLocal: Boolean(online) && tab === 'local' };
}

function el(doc, tag, attrs = {}, text = '') {
  const node = doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === true) node.setAttribute(k, '');
    else if (v !== false && v != null) node.setAttribute(k, v);
  }
  if (text) node.textContent = text;
  return node;
}

export function installClassicPanes({ doc = globalThis.document, win = globalThis } = {}) {
  const d = win.groddleSocial;
  const dock = doc.getElementById('local-chat-dock');
  if (!d || !dock) return null;
  const online = d.mode === 'online';
  const body = dock.querySelector('.social-body');
  const head = dock.querySelector('.social-head');
  const title = dock.querySelector('.social-title');
  const log = dock.querySelector('.social-log');
  if (!body || !head || !title || !log) return null;
  const classic = () => uiState().mode === 'classic';
  const added = [];

  // The upper pane's (the drawer's) title row: chevron, the pill, the close.
  const chev = el(doc, 'img', { class: 'classic-pane-chev', src: classicArtUrl('back_arrow'), alt: '' });
  const pill = el(doc, 'span', { class: 'classic-pane-pill', 'aria-hidden': 'true' });
  const close = el(doc, 'button', { type: 'button', class: 'classic-pane-close', 'aria-label': 'Close this chat' });
  close.append(el(doc, 'img', { src: classicArtUrl('chat_close'), alt: '' }));
  close.addEventListener('click', () => d.select('local'));
  head.prepend(chev);
  title.after(pill);
  head.append(close);
  added.push(chev, pill, close);

  // The bottom pane, under another chat: Local Chat / Activity with its own field.
  const lower = el(doc, 'section', { class: 'classic-lower', 'aria-label': 'Local Chat / Activity' });
  const lowerHead = el(doc, 'div', { class: 'classic-lower-head' });
  const lowerPill = el(doc, 'span', { class: 'classic-pane-pill', 'aria-hidden': 'true' });
  lowerHead.append(el(doc, 'img', { class: 'classic-pane-chev', src: classicArtUrl('back_arrow'), alt: '' }), el(doc, 'h2', { class: 'classic-lower-title' }, 'Local Chat / Activity'), lowerPill);
  const lowerLog = el(doc, 'div', { class: 'classic-lower-log social-log', role: 'log', tabindex: '0', 'aria-live': 'polite' });
  const lowerForm = el(doc, 'form', { class: 'classic-lower-form', autocomplete: 'off' });
  const lowerInput = el(doc, 'input', { type: 'text', class: 'classic-lower-input', maxlength: '180', 'aria-label': 'Local chat', placeholder: 'Local chat', 'data-1p-ignore': '', 'data-lpignore': 'true', 'data-bwignore': '', 'data-form-type': 'other' });
  lowerForm.append(lowerInput);
  // Words said here go to Local through the drawer's own field and form (the game's submit handler).
  lowerForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = lowerInput.value.trim();
    const real = doc.getElementById('local-chat-input');
    const form = doc.getElementById('local-chat-form');
    if (!text || !real || !form) return;
    const back = d.tab;
    d.select('local');
    real.value = text;
    form.requestSubmit();
    lowerInput.value = '';
    if (back && back !== 'local') d.select(back);
    lowerInput.focus({ preventScroll: true });
  });
  lowerInput.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') lowerInput.blur();
  });
  lower.append(lowerHead, lowerLog, lowerForm);
  dock.append(lower);
  added.push(lower);

  let busy = false;
  function sync() {
    if (busy || !classic()) return;
    busy = true;
    try {
      const tab = d.tab;
      const layout = paneLayout({ online, tab });
      dock.dataset.classicUpper = layout.upper ? 'on' : 'off';
      // The upper pane's title is its chat's name; the bottom pane is Local Chat / Activity.
      const name = layout.upper ? d.label(tab) : 'Local Chat / Activity';
      if (title.dataset.classicTitle !== name) title.dataset.classicTitle = name;
      close.style.display = layout.upper ? '' : 'none';
      const up = layout.upper ? d.unread(tab) : d.unread('local') + d.unread('activity');
      pill.textContent = pillText(up);
      pill.style.display = pill.textContent ? '' : 'none';
      lower.style.display = layout.lowerOwn ? '' : 'none';
      if (layout.lowerOwn) {
        const atEnd = lowerLog.scrollHeight - lowerLog.scrollTop - lowerLog.clientHeight < 24;
        lowerLog.replaceChildren(...d.logNodes(LOCAL_TABS));
        if (atEnd) lowerLog.scrollTop = lowerLog.scrollHeight;
        lowerPill.textContent = pillText(d.unread('local') + d.unread('activity'));
        lowerPill.style.display = lowerPill.textContent ? '' : 'none';
        const street = (doc.getElementById('street-name')?.textContent || '').split('·')[0].trim();
        lowerInput.placeholder = street && street !== '…' ? `Say something on ${street}` : 'Local chat';
      }
      // Local picked online: its pane is Local's lines and the Activity log together.
      if (layout.mergeLocal) {
        const atEnd = log.scrollHeight - log.scrollTop - log.clientHeight < 24;
        log.replaceChildren(...d.logNodes(LOCAL_TABS));
        if (atEnd) log.scrollTop = log.scrollHeight;
      }
    } finally {
      busy = false;
    }
  }
  d.onRender(sync);
  d.onTab(sync);

  const show = (state) => {
    const on = state.mode === 'classic';
    for (const n of added) n.style.display = on ? '' : 'none';
    if (on) sync();
    else {
      delete dock.dataset.classicUpper;
      d.refresh?.();
    }
  };
  onUiModeChange(show);
  show(uiState());
  return { sync };
}
