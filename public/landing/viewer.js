/**
 * The home page's photo viewer (Austin 2026-10-31: "each of the photos on the homepage could
 * expand into a modal popup full size preview").
 *
 * Every photo is a <button class="shot" data-full="landing/full/<name>.webp" data-title="...">
 * around its <img>, so a click, Enter or Space opens it. The viewer is the page's
 * <dialog id="viewer">, opened with showModal(): the rest of the page goes inert behind it.
 *
 * - It shows the photo the page already has at once, then swaps in the full-size copy
 *   (tools/landing/shots.mjs writes one per shot, 1920 wide) when that has loaded, so the
 *   big files are fetched only when someone opens a photo. js/data-urls.js keys the URL.
 * - The caption is the card's title and the photo's alt text; "3 of 9" counts them.
 * - Left and right arrows (the buttons, or the arrow keys) step through every photo on the
 *   page, wrapping around; Home and End go to the first and the last.
 * - Esc, the close button, or a click on the dark backdrop closes it. Focus moves to the close
 *   button on open, Tab and Shift+Tab stay among the viewer's buttons, and focus goes back to
 *   the photo that opened it on close.
 * - The page behind does not scroll while it is open (html.viewer-open), and the scrollbar's
 *   width is kept as padding so nothing shifts.
 * - Motion is CSS only (landing.css), and off under prefers-reduced-motion.
 */

/** "3 of 9". */
export function countLabel(index, total) {
  return `${index + 1} of ${total}`;
}

/** The index `step` places from `index`, wrapping around `total`. */
export function stepIndex(index, step, total) {
  return total ? (((index + step) % total) + total) % total : 0;
}

/** The viewer's action for a key while it is open ('prev', 'next', 'first', 'last' or ''). Esc is the dialog's own. */
export function keyAction(key) {
  if (key === 'ArrowLeft') return 'prev';
  if (key === 'ArrowRight') return 'next';
  if (key === 'Home') return 'first';
  if (key === 'End') return 'last';
  return '';
}

/**
 * Wires the viewer on `doc`. Returns { open(index, opener), close(), get index() } or null
 * when the page has no viewer, no photos, or a browser without <dialog>.
 */
export function mountViewer(doc = document) {
  const dialog = doc.getElementById('viewer');
  const shots = [...doc.querySelectorAll('.shot[data-full]')];
  if (!dialog || !shots.length || typeof dialog.showModal !== 'function') return null;
  const html = doc.documentElement;
  const img = dialog.querySelector('.viewer-img');
  const title = dialog.querySelector('.viewer-title');
  const text = dialog.querySelector('.viewer-text');
  const count = dialog.querySelector('.viewer-count');
  const closeBtn = dialog.querySelector('.viewer-close');
  const prevBtn = dialog.querySelector('.viewer-prev');
  const nextBtn = dialog.querySelector('.viewer-next');
  /** In page order, for Tab. */
  const buttons = [prevBtn, nextBtn, closeBtn].filter(Boolean);
  let index = 0;
  let opener = null;
  /** Bumped on every show and on close, so a late full-size load never lands on another photo. */
  let token = 0;

  function show(i) {
    index = stepIndex(i, 0, shots.length);
    const shot = shots[index];
    const thumb = shot.querySelector('img');
    const w = Number(thumb?.getAttribute('width')) || 16;
    const h = Number(thumb?.getAttribute('height')) || 9;
    dialog.style.setProperty('--ar', String(w / h));
    // The page's copy first: it is already loaded, so the viewer never opens empty.
    if (thumb) img.src = thumb.currentSrc || thumb.src;
    title.textContent = shot.dataset.title || '';
    text.textContent = thumb?.alt || '';
    count.textContent = countLabel(index, shots.length);
    const mine = ++token;
    dialog.classList.add('is-loading');
    const full = new Image();
    full.decoding = 'async';
    full.onload = () => {
      if (mine !== token) return;
      img.src = full.src;
      dialog.classList.remove('is-loading');
    };
    full.onerror = () => {
      if (mine === token) dialog.classList.remove('is-loading');
    };
    full.src = shot.dataset.full;
  }

  function open(i, from = null) {
    opener = from || shots[stepIndex(i, 0, shots.length)];
    show(i);
    if (!dialog.open) {
      html.style.setProperty('--viewer-gutter', `${Math.max(0, window.innerWidth - html.clientWidth)}px`);
      html.classList.add('viewer-open');
      dialog.showModal();
    }
    closeBtn?.focus();
  }

  function close() {
    if (dialog.open) dialog.close();
  }

  // Every way it closes (Esc too: the dialog's cancel ends in close) comes through here.
  dialog.addEventListener('close', () => {
    token += 1;
    dialog.classList.remove('is-loading');
    html.classList.remove('viewer-open');
    html.style.removeProperty('--viewer-gutter');
    const back = opener;
    opener = null;
    back?.focus({ preventScroll: true });
  });

  shots.forEach((shot, i) => shot.addEventListener('click', () => open(i, shot)));
  closeBtn?.addEventListener('click', close);
  prevBtn?.addEventListener('click', () => show(index - 1));
  nextBtn?.addEventListener('click', () => show(index + 1));

  // A click on the backdrop (the dialog or its stage, not the photo, the caption or a button) closes it.
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog || e.target.classList?.contains('viewer-stage')) close();
  });

  dialog.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const action = keyAction(e.key);
    if (action) {
      e.preventDefault();
      if (action === 'prev') show(index - 1);
      else if (action === 'next') show(index + 1);
      else if (action === 'first') show(0);
      else show(shots.length - 1);
      return;
    }
    // Focus stays inside: Tab from the last button goes to the first, Shift+Tab the other way.
    if (e.key === 'Tab' && buttons.length) {
      const at = buttons.indexOf(doc.activeElement);
      const next = e.shiftKey ? (at <= 0 ? buttons.length - 1 : at - 1) : (at === -1 || at === buttons.length - 1 ? 0 : at + 1);
      e.preventDefault();
      buttons[next].focus();
    }
  });

  return {
    open,
    close,
    get index() { return index; },
  };
}
