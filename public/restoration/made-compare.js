/**
 * Made for Groddle on /restoration/: the compare popup.
 *
 * The band (the site's src/RestorationMade.php, from made.json) shows each made picture beside its
 * Tiny Speck original. A click on either picture (or Enter) opens the two in a dialog, one at a time
 * in one box at one size, so flipping between them (the arrow keys, the buttons, a click on the
 * picture, a swipe) shows the difference: the original first, then the made. A gallery card
 * (made.json `parts`: More region maps) steps through each region's two pictures in turn. Without
 * JavaScript the band stays as drawn: nothing here is in its markup. Styles: restoration.css
 * (.made-modal, .mm-*). Austin 2026-11-13: "a modal popup with left/right arrows to do a true compare".
 */

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, attrs = {}, ...kids) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) node.append(kid);
  return node;
};

/** Every picture of a card in order, as [pair, view]: each pair's original, then its made. */
export const compareSteps = (pairs) => pairs.flatMap((pair, pi) => pair.map((_, vi) => [pi, vi]));

/**
 * The step a card opens on: the picture clicked (`view`, 0 the original), and on a gallery the
 * region under the click (`frac`, 0 to 1 down the card's stacked picture, as the card stacks them).
 */
export function openingStep(pairs, view, frac = 0, gallery = false) {
  const pair = gallery ? Math.min(pairs.length - 1, Math.max(0, Math.floor(frac * pairs.length))) : 0;
  return Math.max(0, compareSteps(pairs).findIndex(([pi, vi]) => pi === pair && vi === Math.min(view, pairs[pi].length - 1)));
}

/** One step on from `at`, round the ends (a card of two flips back and forth on the same key). */
export const stepFrom = (at, d, count) => (count < 2 ? at : (at + d + count) % count);

/** The pair's display box: the larger picture's shape (by its pixels); the other fits inside it whole. */
export const boxOf = (pair) => pair.reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a));

/** A gallery region's picture from made.json parts. */
export const partView = (p, made) => ({ src: p.src, w: p.w, h: p.h, cols: 1, rows: 1, pixelated: !!p.pixelated, alt: p.alt || '', label: p.label || '', made });

/** Wires every card on the page; `madeUrl` is made.json (its gallery parts). */
export function setupMadeCompare(madeUrl) {
  const pieces = [...document.querySelectorAll('.made-piece')];
  if (!pieces.length) return;
  // A gallery's regions one by one; without made.json each card compares its two pictures as drawn.
  const partsFor = fetch(madeUrl)
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => Object.fromEntries((d?.pieces || []).filter((p) => p.parts?.length).map((p) => [p.anchor, p.parts])))
    .catch(() => ({}));

  /** A picture as drawn on the card: its keyed src, one frame's size, and its caption. */
  const figView = (fig) => {
    const img = $('img', fig);
    const cols = Number(fig.style.getPropertyValue('--cols')) || 1;
    const rows = Number(fig.style.getPropertyValue('--rows')) || 1;
    return {
      src: img.getAttribute('src'), w: Number(img.getAttribute('width')) / cols, h: Number(img.getAttribute('height')) / rows, cols, rows,
      pixelated: img.classList.contains('made-px'), alt: img.alt, label: $('figcaption', fig)?.textContent || '', made: fig.classList.contains('made-fig-made'),
    };
  };

  const title = el('h3', { class: 'mm-title', id: 'made-modal-title' });
  const close = el('button', { type: 'button', class: 'mm-close', 'aria-label': 'Close' }, '\u00d7');
  const stage = el('div', { class: 'mm-stage' });
  const prev = el('button', { type: 'button', class: 'mm-step mm-prev', 'aria-label': 'Previous picture' });
  const next = el('button', { type: 'button', class: 'mm-step mm-next', 'aria-label': 'Next picture' });
  const label = el('p', { class: 'mm-label', 'aria-live': 'polite' });
  const count = el('p', { class: 'mm-count' });
  const modal = el('dialog', { class: 'made-modal', id: 'made-modal', 'aria-labelledby': 'made-modal-title', tabindex: '-1' },
    el('div', { class: 'mm-head' }, el('div', {}, el('p', { class: 'mm-kicker' }, 'Made for Groddle'), title), close),
    el('div', { class: 'mm-media' }, stage, prev, next),
    el('div', { class: 'mm-foot' }, label, count));
  document.body.append(modal);

  let pairs = [];
  let steps = [];
  let at = 0;
  let drawn = -1;
  let opener = null;

  /** Both pictures of a pair in the box, stacked in one place: the box takes the larger one's shape. */
  const drawPair = (pair) => {
    const big = boxOf(pair);
    stage.style.setProperty('--ar', `${big.w} / ${big.h}`);
    stage.replaceChildren(...pair.map((v) => el('span', { class: 'mm-frame', style: `--w:${v.w};--h:${v.h};--cols:${v.cols};--rows:${v.rows}` },
      el('img', { src: v.src, alt: v.alt, class: v.pixelated ? 'made-px' : null, draggable: 'false' }))));
  };
  const show = () => {
    const [pi, vi] = steps[at];
    if (pi !== drawn) {
      drawPair(pairs[pi]);
      drawn = pi;
      // The next region's pictures load while this one is looked at.
      if (pairs.length > 1) for (const v of pairs[(pi + 1) % pairs.length]) new Image().src = v.src;
    }
    [...stage.children].forEach((frame, i) => { frame.hidden = i !== vi; });
    const v = pairs[pi][vi];
    label.textContent = v.label;
    label.classList.toggle('is-made', v.made);
    count.textContent = `${at + 1} of ${steps.length}`;
    prev.hidden = next.hidden = steps.length < 2;
  };
  const step = (d) => {
    if (steps.length < 2) return;
    at = stepFrom(at, d, steps.length);
    show();
  };

  async function open(piece, view, frac, from) {
    const figs = [...piece.querySelectorAll('.made-pair > .made-fig')];
    const parts = (await partsFor)[piece.id];
    pairs = parts ? parts.map((p) => [partView(p.original, false), partView(p.image, true)]) : [figs.map(figView)];
    steps = compareSteps(pairs);
    at = openingStep(pairs, view, frac, !!parts);
    drawn = -1;
    opener = from;
    title.textContent = $('.made-words h3', piece)?.textContent || '';
    show();
    if (!modal.open) {
      modal.showModal();
      // The dialog itself takes focus (the arrow keys flip from the start), not the close button.
      modal.focus();
    }
  }

  for (const piece of pieces) {
    const figs = [...piece.querySelectorAll('.made-pair > .made-fig')];
    const name = $('.made-words h3', piece)?.textContent || '';
    figs.forEach((fig, view) => {
      const frame = $('.made-frame', fig);
      if (!frame || !$('img', frame)) return;
      frame.tabIndex = 0;
      frame.setAttribute('role', 'button');
      frame.setAttribute('aria-haspopup', 'dialog');
      frame.setAttribute('aria-label', `${name}, ${$('figcaption', fig)?.textContent || ''}: open to compare`);
      frame.dataset.compare = '';
      frame.addEventListener('click', (e) => {
        const r = frame.getBoundingClientRect();
        open(piece, view, r.height ? (e.clientY - r.top) / r.height : 0, frame);
      });
      frame.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        open(piece, view, 0, frame);
      });
    });
  }

  close.addEventListener('click', () => modal.close());
  prev.addEventListener('click', () => step(-1));
  next.addEventListener('click', () => step(1));
  modal.addEventListener('close', () => opener?.focus());
  // Click on the backdrop (outside the dialog box) closes it.
  modal.addEventListener('click', (e) => {
    const r = modal.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) modal.close();
  });
  modal.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      step(e.key === 'ArrowLeft' ? -1 : 1);
    }
  });
  // A sideways swipe flips (left for the next, as a page turns); a plain click or tap on the picture flips on.
  let down = null;
  let swiped = false;
  stage.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; swiped = false; });
  stage.addEventListener('pointerup', (e) => {
    if (!down) return;
    const dx = e.clientX - down.x;
    const dy = e.clientY - down.y;
    down = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      swiped = true;
      step(dx < 0 ? 1 : -1);
    }
  });
  stage.addEventListener('pointercancel', () => { down = null; });
  stage.addEventListener('click', () => {
    if (!swiped) step(1);
    swiped = false;
  });
}
