/* Groddle Field Notes · the site's colour theme: light, dark, or the system's.
   Loaded as a plain script in every page's <head> (before the stylesheets
   paint), so the saved choice is on <html> before anything draws:
     data-theme="light|dark"  forces a theme (the stylesheets' :root[data-theme] rules)
     no data-theme             follows prefers-color-scheme (System)
     data-theme-mode           the choice itself, which shows the header button
   The button is in the shared site header (.site-nav-theme). Click switches
   between light and dark; right-click (or a long press, the context-menu key,
   Shift+F10 or ArrowDown) opens a menu with Light, Dark and System. One choice for the
   whole site, kept in localStorage; other tabs follow it. */
(() => {
  const KEY = 'groddle-theme';
  const OLD_KEY = 'groddle-compare-theme'; // the compare page's own toggle, before this
  const MODES = ['light', 'dark', 'system'];
  const LABELS = { light: 'Light', dark: 'Dark', system: 'System' };
  const root = document.documentElement;
  const media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  const read = () => {
    try {
      let mode = localStorage.getItem(KEY);
      if (!mode) {
        const old = localStorage.getItem(OLD_KEY);
        if (old) {
          mode = old === 'auto' ? 'system' : old;
          localStorage.setItem(KEY, mode);
          localStorage.removeItem(OLD_KEY);
        }
      }
      return MODES.includes(mode) ? mode : 'system';
    } catch {
      return 'system';
    }
  };
  const systemDark = () => Boolean(media && media.matches);
  const effective = (mode) => (mode === 'system' ? (systemDark() ? 'dark' : 'light') : mode);

  let mode = read();

  function apply() {
    if (mode === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', mode);
    root.setAttribute('data-theme-mode', mode);
    for (const button of document.querySelectorAll('.site-nav-theme')) label(button);
  }

  function label(button) {
    const now = effective(mode);
    const next = now === 'dark' ? 'light' : 'dark';
    const shown = mode === 'system' ? `System (${now})` : LABELS[mode];
    button.setAttribute('aria-label', `Colour theme: ${shown}. Switch to ${next}; right-click for more`);
    button.title = `Colour theme: ${shown}\nClick for ${next}, right-click for more`;
  }

  function choose(next) {
    mode = MODES.includes(next) ? next : 'system';
    try { localStorage.setItem(KEY, mode); } catch { /* storage blocked: this page only */ }
    apply();
  }

  apply();
  media?.addEventListener?.('change', () => { if (mode === 'system') apply(); });
  window.addEventListener('storage', (e) => { if (e.key === KEY) { mode = read(); apply(); } });

  // The menu, built on first use.
  let menu = null;
  let owner = null;

  function closeMenu(focusButton) {
    if (!menu || menu.hidden) return;
    menu.hidden = true;
    owner?.setAttribute('aria-expanded', 'false');
    if (focusButton) owner?.focus();
  }

  function openMenu(button) {
    if (!menu) {
      menu = document.createElement('div');
      menu.className = 'site-nav-theme-menu';
      menu.setAttribute('role', 'menu');
      menu.setAttribute('aria-label', 'Colour theme');
      menu.tabIndex = -1;
      menu.hidden = true;
      for (const m of MODES) {
        const item = document.createElement('button');
        item.type = 'button';
        item.setAttribute('role', 'menuitemradio');
        item.dataset.mode = m;
        item.textContent = LABELS[m];
        item.addEventListener('click', () => { choose(m); closeMenu(true); });
        menu.append(item);
      }
      menu.addEventListener('keydown', (e) => {
        const items = [...menu.querySelectorAll('[role="menuitemradio"]')];
        const i = items.indexOf(document.activeElement);
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus();
        } else if (e.key === 'Home' || e.key === 'End') {
          e.preventDefault();
          items[e.key === 'Home' ? 0 : items.length - 1].focus();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          closeMenu(true);
        } else if (e.key === 'Tab') {
          closeMenu(false);
        }
      });
      menu.addEventListener('focusout', (e) => {
        if (!menu.contains(e.relatedTarget) && e.relatedTarget !== owner) closeMenu(false);
      });
      document.body.append(menu);
    }
    owner = button;
    for (const item of menu.children) item.setAttribute('aria-checked', String(item.dataset.mode === mode));
    menu.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    // Under the button, right edges lined up, kept on screen.
    const r = button.getBoundingClientRect();
    const w = menu.offsetWidth;
    menu.style.top = `${Math.round(r.bottom + 6)}px`;
    menu.style.left = `${Math.round(Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8)))}px`;
    menu.querySelector(`[data-mode="${mode}"]`)?.focus({ preventScroll: true });
  }

  function wire(button) {
    if (button.dataset.themeWired) return;
    button.dataset.themeWired = '1';
    button.setAttribute('aria-haspopup', 'menu');
    button.setAttribute('aria-expanded', 'false');
    label(button);
    // Touch: a long press opens the menu too (iOS sends no contextmenu for it); the click after it is not a switch.
    let press = 0;
    let pressed = false;
    const cancelPress = () => clearTimeout(press);
    button.addEventListener('pointerdown', (e) => {
      pressed = false;
      if (e.pointerType !== 'touch') return;
      cancelPress();
      press = setTimeout(() => { pressed = true; openMenu(button); }, 500);
    });
    for (const type of ['pointerup', 'pointercancel', 'pointerleave']) button.addEventListener(type, cancelPress);
    button.addEventListener('click', () => {
      if (pressed) { pressed = false; return; }
      closeMenu(false);
      choose(effective(mode) === 'dark' ? 'light' : 'dark');
    });
    button.addEventListener('contextmenu', (e) => {
      e.preventDefault(); // right-click, long-press, the context-menu key or Shift+F10
      openMenu(button);
    });
    button.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); openMenu(button); }
    });
  }

  function wireAll() {
    for (const button of document.querySelectorAll('.site-nav-theme')) wire(button);
  }

  document.addEventListener('pointerdown', (e) => {
    if (menu && !menu.hidden && !menu.contains(e.target) && e.target !== owner) closeMenu(false);
  });
  window.addEventListener('resize', () => closeMenu(false));
  window.addEventListener('scroll', () => closeMenu(false), { passive: true });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireAll);
  else wireAll();
})();
