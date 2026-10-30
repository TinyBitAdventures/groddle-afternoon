/**
 * The note_view and notice-board windows (DOM only, no game state): the
 * original client opened a paper note card for `note_view` (read, or edit with
 * a 150-character title and 1,000-character body) and a cork board for
 * `notice_board_start` / `notice_board_status` (read or take each pinned note,
 * capacity shown). Used by js/features/street-furniture-feature.js.
 *
 * The window uses the shared `.glitch-modal` shell, so engine.busy() and the
 * pack-safe layout treat it like every other panel.
 */

const STYLE_ID = 'note-view-style';
const CSS = `
.note-view .note-card { background: var(--surface-card); border: 1px solid var(--c-gold-87b); border-radius: var(--radius-sm); box-shadow: var(--shadow-4), inset 0 0 0 6px var(--c-cream-99); width: min(440px, 92vw); max-height: min(76vh, 620px); overflow: auto; padding: var(--sp-8) var(--sp-9) var(--sp-7); position: relative; }
.note-view .note-frame { position: relative; transform: rotate(-0.6deg); }
.note-view .note-frame::before { content: ''; position: absolute; z-index: var(--z-raised); top: -9px; left: 50%; width: 18px; height: 18px; margin-left: -9px; border-radius: var(--radius-round); background: radial-gradient(circle at 35% 35%, var(--c-red-76b), var(--c-red-56) 70%); box-shadow: 0 2px 3px color-mix(in srgb, var(--c-black) 30%, transparent); }
.note-view .note-kicker { font-size: var(--fs-sm); letter-spacing: 0.08em; text-transform: uppercase; color: var(--c-gold-63); }
.note-view h2 { margin: var(--sp-1) 0 var(--sp-4); font-size: var(--fs-2xl); color: var(--c-sand-33); overflow-wrap: anywhere; }
.note-view .note-body { white-space: pre-wrap; overflow-wrap: anywhere; font-size: var(--fs-lg); line-height: var(--lh-loose); color: var(--c-sand-33); min-height: 3.2rem; background-image: repeating-linear-gradient(transparent, transparent 1.45rem, var(--c-cream-91) 1.45rem, var(--c-cream-91) 1.5rem); padding-bottom: 0.3rem; }
.note-view .note-byline { margin-top: 0.55rem; font-size: var(--fs-sm); color: var(--c-gold-59); font-style: italic; }
.note-view .note-marker { display: inline-block; margin: var(--sp-2) 0 var(--sp-1); padding: var(--sp-1) var(--sp-4); border: 1px dashed var(--c-gold-70b); border-radius: var(--radius-pill); background: var(--c-yellow-98); color: var(--c-umber-48b); font-size: var(--fs-xs); font-weight: 700; letter-spacing: 0.02em; }
.note-view .board-pin .note-marker { margin: 0; align-self: flex-start; font-size: var(--fs-2xs); padding: 0.05rem var(--sp-3); }
.note-view .note-reason { margin-top: var(--sp-3); font-size: var(--fs-sm); color: var(--c-red-53c); }
.note-view .note-actions { display: flex; gap: var(--sp-4); justify-content: flex-end; flex-wrap: wrap; margin-top: 0.8rem; }
.note-view .note-actions button { font: inherit; font-size: var(--fs-base); border: 1px solid var(--c-gold-83); border-radius: var(--radius-md); padding: var(--sp-3) var(--sp-7); background: var(--surface-bright); color: var(--c-sand-33); cursor: pointer; }
.note-view .note-actions button.is-primary { background: var(--surface-moss); border-color: var(--c-lime-77b); font-weight: 700; }
.note-view .note-actions button:disabled { opacity: 0.5; cursor: default; }
.note-view input, .note-view textarea { font: inherit; width: 100%; box-sizing: border-box; border: 1px solid var(--c-gold-87b); border-radius: var(--radius-sm); background: var(--surface-card); padding: 0.45rem 0.55rem; color: var(--c-sand-33); }
.note-view textarea { min-height: 9rem; resize: vertical; line-height: var(--lh-loose); }
.note-view label { display: block; font-size: var(--fs-sm); color: var(--c-gold-59); margin: 0.45rem 0 0.2rem; }
.note-view .note-count { font-size: var(--fs-sm); color: var(--c-gold-69); text-align: right; }
.note-view .board-card { background: var(--c-gold-73b) url('assets/sprites/street-furniture/notice-board-m0.png') center / cover; border: 10px solid var(--c-gold-80); border-radius: var(--radius-sm); box-shadow: var(--shadow-4); width: min(600px, 94vw); max-height: min(78vh, 640px); overflow: auto; padding: 0.8rem; }
.note-view .board-head { display: flex; justify-content: space-between; align-items: center; gap: var(--sp-4); background: color-mix(in srgb, var(--surface-card) 92%, transparent); border-radius: var(--radius-sm); padding: 0.45rem 0.7rem; margin-bottom: var(--sp-5); }
.note-view .board-head h2 { margin: 0; font-size: var(--fs-lg); }
.note-view .board-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: var(--sp-5); }
.note-view .board-pin { background: var(--surface-card); border-radius: var(--radius-xs); box-shadow: 0 4px 10px color-mix(in srgb, var(--c-black) 25%, transparent); padding: 0.55rem var(--sp-5) var(--sp-4); display: flex; flex-direction: column; gap: 0.3rem; min-height: 120px; }
.note-view .board-pin:nth-child(odd) { transform: rotate(-1.4deg); }
.note-view .board-pin:nth-child(even) { transform: rotate(1.1deg); }
.note-view .board-pin strong { font-size: var(--fs-base); color: var(--c-sand-33); overflow-wrap: anywhere; }
.note-view .board-pin p { margin: 0; font-size: var(--fs-sm); color: var(--c-sand-44b); flex: 1; overflow-wrap: anywhere; }
.note-view .board-pin .note-actions { margin-top: 0.2rem; justify-content: flex-start; gap: 0.3rem; }
.note-view .board-pin .note-actions button { padding: 0.2rem 0.55rem; font-size: var(--fs-sm); }
.note-view .board-empty { background: color-mix(in srgb, var(--surface-card) 90%, transparent); border-radius: var(--radius-sm); padding: 0.8rem; font-size: var(--fs-base); color: var(--c-sand-44b); }
.note-view .note-list { display: grid; gap: var(--sp-3); margin-top: var(--sp-3); }
.note-view .note-list button { text-align: left; font: inherit; font-size: var(--fs-base); border: 1px solid var(--c-gold-87b); border-radius: var(--radius-sm); background: var(--surface-bright); padding: 0.45rem var(--sp-5); cursor: pointer; overflow-wrap: anywhere; }
`;

let wrap = null;
let keyHandler = null;
let onCloseCb = null;

function ensureStyle() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

function host() {
  return document.getElementById('mail-panel')?.parentElement || document.body;
}

function el(tag, attrs = {}, text = '') {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'className') node.className = value;
    else if (value != null) node.setAttribute(key, value);
  }
  if (text) node.textContent = text;
  return node;
}

function button(label, onClick, { primary = false, disabled = false, title = '' } = {}) {
  const b = el('button', { type: 'button', className: primary ? 'is-primary' : '' }, label);
  b.disabled = Boolean(disabled);
  if (title) b.title = title;
  b.addEventListener('click', onClick);
  return b;
}

function mount(card, { label = 'Note', onClose } = {}) {
  closeNoteView({ silent: true });
  ensureStyle();
  wrap = el('div', { className: 'glitch-modal note-view', role: 'dialog', 'aria-modal': 'true', 'aria-label': label });
  // The card scrolls, so its pin sits on a frame around it, where the card's overflow can't clip it.
  if (card.classList?.contains('note-card')) {
    const frame = el('div', { className: 'note-frame' });
    frame.appendChild(card);
    wrap.appendChild(frame);
  } else {
    wrap.appendChild(card);
  }
  wrap.addEventListener('click', (event) => {
    if (event.target === wrap) closeNoteView();
  });
  keyHandler = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeNoteView();
    }
  };
  document.addEventListener('keydown', keyHandler, true);
  onCloseCb = onClose || null;
  host().appendChild(wrap);
  return wrap;
}

export function noteViewOpen() {
  return Boolean(wrap?.parentElement);
}

export function closeNoteView({ silent = false } = {}) {
  if (keyHandler) document.removeEventListener('keydown', keyHandler, true);
  keyHandler = null;
  if (wrap?.parentElement) wrap.parentElement.removeChild(wrap);
  wrap = null;
  const cb = onCloseCb;
  onCloseCb = null;
  if (!silent && cb) cb();
}

/**
 * Read a note, or write on it.
 * opts: { kicker, title, body, byline, reason, editable, startEdit,
 *         maxTitle, maxBody, onSave(title, body) -> string|true, extra: [{ label, onClick, primary, disabled, title }], onClose }
 */
export function openNoteView(opts = {}) {
  if (typeof document === 'undefined') return null;
  const card = el('div', { className: 'note-card' });
  const render = (editing) => {
    card.innerHTML = '';
    card.appendChild(el('div', { className: 'note-kicker' }, opts.kicker || 'Note'));
    if (!editing) {
      // Remake text (street-furniture.js isRemakeNote): said so on the note itself (G175).
      if (opts.marker) card.appendChild(el('div', { className: 'note-marker', 'data-remake': '1' }, opts.marker));
      card.appendChild(el('h2', {}, opts.title || 'A note!'));
      card.appendChild(el('div', { className: 'note-body' }, opts.body || ''));
      if (opts.byline) card.appendChild(el('div', { className: 'note-byline' }, opts.byline));
      if (opts.reason) card.appendChild(el('div', { className: 'note-reason' }, opts.reason));
      const actions = el('div', { className: 'note-actions' });
      for (const extra of opts.extra || []) actions.appendChild(button(extra.label, extra.onClick, extra));
      if (opts.editable) actions.appendChild(button('Write on it', () => render(true)));
      actions.appendChild(button('Close', () => closeNoteView(), { primary: !opts.editable }));
      card.appendChild(actions);
      return;
    }
    const form = el('form');
    form.appendChild(el('label', { for: 'note-view-title' }, 'Title'));
    const title = el('input', { id: 'note-view-title', type: 'text', maxlength: String(opts.maxTitle || 150), autocomplete: 'off', spellcheck: 'true' });
    title.value = opts.editTitle ?? (opts.title === 'A note!' ? '' : opts.title || '');
    form.appendChild(title);
    form.appendChild(el('label', { for: 'note-view-body' }, 'What it says'));
    const body = el('textarea', { id: 'note-view-body', maxlength: String(opts.maxBody || 1000), spellcheck: 'true' });
    body.value = opts.editBody ?? opts.body ?? '';
    form.appendChild(body);
    const count = el('div', { className: 'note-count' });
    const updateCount = () => { count.textContent = `${body.value.length} / ${opts.maxBody || 1000}`; };
    body.addEventListener('input', updateCount);
    updateCount();
    form.appendChild(count);
    const error = el('div', { className: 'note-reason' });
    form.appendChild(error);
    const actions = el('div', { className: 'note-actions' });
    actions.appendChild(button('Cancel', () => (opts.startEdit ? closeNoteView() : render(false))));
    const save = el('button', { type: 'submit', className: 'is-primary' }, 'Save');
    actions.appendChild(save);
    form.appendChild(actions);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const out = opts.onSave ? opts.onSave(title.value, body.value) : true;
      if (typeof out === 'string' && out) {
        error.textContent = out;
        return;
      }
      closeNoteView();
    });
    card.appendChild(form);
    requestAnimationFrame(() => (opts.startEdit && !title.value ? title : body).focus());
  };
  mount(card, { label: opts.title || 'Note', onClose: opts.onClose });
  render(Boolean(opts.startEdit));
  return wrap;
}

/**
 * The notice board: pinned notes with Read / Take, plus Add a note.
 * opts: { title, count, capacity, pins: [{ id, title, preview, marker? }], addLabel,
 *         addEnabled, addReason, onRead(id), onTake(id), onAdd(), onClose }
 */
export function openBoardView(opts = {}) {
  if (typeof document === 'undefined') return null;
  const card = el('div', { className: 'board-card' });
  const head = el('div', { className: 'board-head' });
  head.appendChild(el('h2', {}, `${opts.title || 'Notice Board'} · ${opts.count ?? (opts.pins || []).length}/${opts.capacity || 10}`));
  const headActions = el('div', { className: 'note-actions' });
  headActions.style.marginTop = '0';
  headActions.appendChild(button(opts.addLabel || 'Add a note', () => opts.onAdd?.(), { primary: true, disabled: !opts.addEnabled, title: opts.addReason || '' }));
  headActions.appendChild(button('Close', () => closeNoteView()));
  head.appendChild(headActions);
  card.appendChild(head);
  if (!opts.addEnabled && opts.addReason) {
    const why = el('div', { className: 'board-empty' }, opts.addReason);
    why.style.marginBottom = '0.6rem';
    why.style.padding = '0.45rem 0.7rem';
    card.appendChild(why);
  }
  const pins = opts.pins || [];
  if (!pins.length) {
    card.appendChild(el('div', { className: 'board-empty' }, 'Nothing pinned here yet. A good board is a hungry board.'));
  } else {
    const grid = el('div', { className: 'board-grid' });
    for (const pin of pins) {
      const box = el('div', { className: 'board-pin' });
      if (pin.marker) box.appendChild(el('span', { className: 'note-marker', 'data-remake': '1' }, pin.marker));
      box.appendChild(el('strong', {}, pin.title));
      box.appendChild(el('p', {}, pin.preview));
      const actions = el('div', { className: 'note-actions' });
      actions.appendChild(button('Read', () => opts.onRead?.(pin.id)));
      actions.appendChild(button('Take', () => opts.onTake?.(pin.id)));
      box.appendChild(actions);
      grid.appendChild(box);
    }
    card.appendChild(grid);
  }
  mount(card, { label: opts.title || 'Notice Board', onClose: opts.onClose });
  return wrap;
}

/** Choose one carried note ({ id, title }) for posting or reading. */
export function openNotePicker(opts = {}) {
  if (typeof document === 'undefined') return null;
  const card = el('div', { className: 'note-card' });
  card.appendChild(el('div', { className: 'note-kicker' }, opts.kicker || 'Your notes'));
  card.appendChild(el('h2', {}, opts.title || 'Which note?'));
  const list = el('div', { className: 'note-list' });
  for (const row of opts.notes || []) {
    list.appendChild(button(row.title, () => {
      closeNoteView({ silent: true });
      opts.onPick?.(row.id);
    }));
  }
  card.appendChild(list);
  const actions = el('div', { className: 'note-actions' });
  actions.appendChild(button('Cancel', () => closeNoteView()));
  card.appendChild(actions);
  mount(card, { label: opts.title || 'Your notes', onClose: opts.onClose });
  return wrap;
}
