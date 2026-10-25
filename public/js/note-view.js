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
.note-view .note-card { background: #fffdf3; border: 1px solid #e3d9b8; border-radius: 6px; box-shadow: 0 16px 38px rgba(0,0,0,0.28), inset 0 0 0 6px #fffaf0; width: min(440px, 92vw); max-height: min(76vh, 620px); overflow: auto; padding: 1rem 1.1rem 0.9rem; position: relative; transform: rotate(-0.6deg); }
.note-view .note-card::before { content: ''; position: absolute; top: -9px; left: 50%; width: 18px; height: 18px; margin-left: -9px; border-radius: 50%; background: radial-gradient(circle at 35% 35%, #ff8a8a, #c43b3b 70%); box-shadow: 0 2px 3px rgba(0,0,0,0.3); }
.note-view .note-kicker { font-size: 0.72rem; letter-spacing: 0.08em; text-transform: uppercase; color: #9a8a5c; }
.note-view h2 { margin: 0.15rem 0 0.5rem; font-size: 1.2rem; color: #3d3423; overflow-wrap: anywhere; }
.note-view .note-body { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 0.98rem; line-height: 1.5; color: #3b3326; min-height: 3.2rem; background-image: repeating-linear-gradient(transparent, transparent 1.45rem, #efe6c9 1.45rem, #efe6c9 1.5rem); padding-bottom: 0.3rem; }
.note-view .note-byline { margin-top: 0.55rem; font-size: 0.78rem; color: #8a7b58; font-style: italic; }
.note-view .note-marker { display: inline-block; margin: 0.25rem 0 0.1rem; padding: 0.12rem 0.5rem; border: 1px dashed #b89b52; border-radius: 999px; background: #fff3c9; color: #6f5a22; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.02em; }
.note-view .board-pin .note-marker { margin: 0; align-self: flex-start; font-size: 0.62rem; padding: 0.05rem 0.4rem; }
.note-view .note-reason { margin-top: 0.4rem; font-size: 0.78rem; color: #a0503a; }
.note-view .note-actions { display: flex; gap: 0.5rem; justify-content: flex-end; flex-wrap: wrap; margin-top: 0.8rem; }
.note-view .note-actions button { font: inherit; font-size: 0.85rem; border: 1px solid #d8cba3; border-radius: 8px; padding: 0.38rem 0.85rem; background: #fff; color: #3d3423; cursor: pointer; }
.note-view .note-actions button.is-primary { background: #e8f0dc; border-color: #9cc47a; font-weight: 700; }
.note-view .note-actions button:disabled { opacity: 0.5; cursor: default; }
.note-view input, .note-view textarea { font: inherit; width: 100%; box-sizing: border-box; border: 1px solid #e0d4ad; border-radius: 6px; background: #fffef8; padding: 0.45rem 0.55rem; color: #3b3326; }
.note-view textarea { min-height: 9rem; resize: vertical; line-height: 1.45; }
.note-view label { display: block; font-size: 0.75rem; color: #8a7b58; margin: 0.45rem 0 0.2rem; }
.note-view .note-count { font-size: 0.72rem; color: #a99a72; text-align: right; }
.note-view .board-card { background: #c99e67 url('assets/sprites/street-furniture/notice-board-m0.png') center / cover; border: 10px solid #d9b77f; border-radius: 6px; box-shadow: 0 16px 38px rgba(0,0,0,0.3); width: min(600px, 94vw); max-height: min(78vh, 640px); overflow: auto; padding: 0.8rem; }
.note-view .board-head { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; background: rgba(255,250,235,0.92); border-radius: 6px; padding: 0.45rem 0.7rem; margin-bottom: 0.65rem; }
.note-view .board-head h2 { margin: 0; font-size: 1.05rem; }
.note-view .board-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 0.65rem; }
.note-view .board-pin { background: #fffdf3; border-radius: 3px; box-shadow: 0 4px 10px rgba(0,0,0,0.25); padding: 0.55rem 0.6rem 0.5rem; display: flex; flex-direction: column; gap: 0.3rem; min-height: 120px; }
.note-view .board-pin:nth-child(odd) { transform: rotate(-1.4deg); }
.note-view .board-pin:nth-child(even) { transform: rotate(1.1deg); }
.note-view .board-pin strong { font-size: 0.86rem; color: #3d3423; overflow-wrap: anywhere; }
.note-view .board-pin p { margin: 0; font-size: 0.76rem; color: #5b5038; flex: 1; overflow-wrap: anywhere; }
.note-view .board-pin .note-actions { margin-top: 0.2rem; justify-content: flex-start; gap: 0.3rem; }
.note-view .board-pin .note-actions button { padding: 0.2rem 0.55rem; font-size: 0.74rem; }
.note-view .board-empty { background: rgba(255,250,235,0.9); border-radius: 6px; padding: 0.8rem; font-size: 0.85rem; color: #5b5038; }
.note-view .note-list { display: grid; gap: 0.4rem; margin-top: 0.4rem; }
.note-view .note-list button { text-align: left; font: inherit; font-size: 0.86rem; border: 1px solid #e0d4ad; border-radius: 6px; background: #fff; padding: 0.45rem 0.6rem; cursor: pointer; overflow-wrap: anywhere; }
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
  wrap.appendChild(card);
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
