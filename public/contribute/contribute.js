/**
 * The Contribute page's shrine (groddle-afternoon-site src/Contribute.php draws
 * it, the .ct-* styles in its style.css). Without this script the shrine is a
 * plain link to GitHub Sponsors. With it, a click, Enter, Space or ArrowDown
 * opens the game's verb menu over the shrine instead, as the game does for a
 * shrine (InteractionMenu: the thing's name, what it is, one line per verb with
 * its 1-9 key, and a footer line): its one verb, Donate, opens Sponsors in a
 * new tab. 1 or Enter picks it; Escape, a press outside or Tab away closes the
 * menu, and Escape puts focus back on the shrine. While open the bowl tips
 * forward (the sheet's open cells); closing tips it back. A click with a
 * modifier key (a new tab, say) still follows the link.
 *
 * QA: the street carries data-ct-menu="open" or "closed".
 */

const street = document.querySelector('[data-ct-street]');
const shrine = street?.querySelector('[data-ct-shrine]');
const menu = street?.querySelector('.ct-menu');
const row = menu?.querySelector('[role="menuitem"]');

if (street && shrine && menu && row) {
  shrine.setAttribute('role', 'button');
  shrine.setAttribute('aria-haspopup', 'menu');
  shrine.setAttribute('aria-expanded', 'false');
  shrine.setAttribute('aria-controls', menu.id);
  const sr = shrine.querySelector('[data-ct-sr]');
  if (sr) sr.textContent = ': help with the costs';
  street.dataset.ctMenu = 'closed';

  const isOpen = () => !menu.hidden;

  const open = () => {
    if (isOpen()) return;
    menu.hidden = false;
    shrine.setAttribute('aria-expanded', 'true');
    street.classList.remove('is-shut');
    street.classList.add('is-open');
    street.dataset.ctMenu = 'open';
    // After this frame, so the key that opened the menu does not also pick Donate.
    requestAnimationFrame(() => { if (isOpen()) row.focus(); });
  };

  const close = (refocus) => {
    if (!isOpen()) return;
    menu.hidden = true;
    shrine.setAttribute('aria-expanded', 'false');
    street.classList.remove('is-open');
    street.classList.add('is-shut');
    street.dataset.ctMenu = 'closed';
    if (refocus) shrine.focus();
  };

  shrine.addEventListener('click', (e) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (isOpen()) close(true);
    else open();
  });
  shrine.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'ArrowDown') {
      e.preventDefault();
      open();
    } else if (e.key === 'Escape') {
      close(true);
    }
  });
  menu.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
    } else if (e.key === '1') {
      e.preventDefault();
      row.click();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      row.focus();
    }
  });
  // Donate follows its link (a new tab); the menu closes behind it.
  row.addEventListener('click', () => close(false));
  street.addEventListener('focusout', (e) => {
    if (isOpen() && !menu.contains(e.relatedTarget) && e.relatedTarget !== shrine && e.relatedTarget !== null) close(false);
  });
  document.addEventListener('pointerdown', (e) => {
    if (isOpen() && !menu.contains(e.target) && !shrine.contains(e.target)) close(false);
  });
  street.addEventListener('animationend', (e) => { if (e.animationName === 'ct-shrine-shut') street.classList.remove('is-shut'); });
}
