/* Groddle Field Notes · the site's colour theme: light, dark, or the system's.
   Loaded as a plain script in every page's <head> (before the stylesheets
   paint), so the saved choice is on <html> before anything draws:
     data-theme="light|dark"  forces a theme (the stylesheets' :root[data-theme] rules)
     no data-theme             follows prefers-color-scheme (System)
     data-theme-mode           the choice itself, which shows the header button
   The button is in the shared site header (.site-nav-theme). Click switches
   between light and dark; right-click (or a long press, the context-menu key,
   Shift+F10 or ArrowDown) opens a menu with Light, Dark and System. One choice for the
   whole site, kept in localStorage; other tabs follow it.
   It also opens the header's submenus (.site-nav-sub: a link, its .site-nav-toggle
   and the .site-nav-panel of its links, drawn from the Minn menu): hover with a
   mouse, the toggle with anything; Escape closes back to the toggle, and so do a
   click outside and Tab out. Without this script the link is a plain link. */
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

// The header's submenus. The panel hangs from .site-nav-row (site-nav.css): wide, it
// sits under its link through --site-nav-panel-left; narrow, CSS spans the row.
(() => {
  const subs = new Set();
  const canHover = window.matchMedia ? window.matchMedia('(hover: hover)') : null;

  function place(sub) {
    const row = sub.el.closest('.site-nav-row');
    if (!row || sub.panel.hidden) return;
    const r = row.getBoundingClientRect();
    const a = sub.link.getBoundingClientRect();
    const w = sub.panel.offsetWidth;
    const left = Math.max(0, Math.min(a.left - r.left - 19, r.width - w)); // its links' words under the link's
    sub.panel.style.setProperty('--site-nav-panel-left', `${Math.round(left)}px`);
  }

  function open(sub, how) {
    for (const other of subs) if (other !== sub) close(other, false);
    clearTimeout(sub.timer);
    sub.how = sub.how === 'click' ? 'click' : how;
    if (!sub.panel.hidden) return;
    sub.panel.hidden = false;
    sub.toggle.setAttribute('aria-expanded', 'true');
    place(sub);
  }

  function close(sub, focusToggle) {
    clearTimeout(sub.timer);
    sub.how = '';
    if (sub.panel.hidden) return;
    sub.panel.hidden = true;
    sub.toggle.setAttribute('aria-expanded', 'false');
    if (focusToggle) sub.toggle.focus();
  }

  function wire(el) {
    if (el.dataset.subWired) return;
    const link = el.querySelector(':scope > a');
    const toggle = el.querySelector(':scope > .site-nav-toggle');
    const panel = toggle && document.getElementById(toggle.getAttribute('aria-controls'));
    if (!link || !panel) return;
    el.dataset.subWired = '1';
    const sub = { el, link, toggle, panel, how: '', timer: 0, held: false, quiet: false };
    subs.add(sub);
    const links = () => [...panel.querySelectorAll('a')];

    // A mouse opens it on hover and lets go a moment after leaving; a click on the toggle keeps it open.
    el.addEventListener('pointerenter', (e) => {
      if (e.pointerType !== 'mouse' || (canHover && !canHover.matches)) return;
      clearTimeout(sub.timer);
      if (!sub.quiet) open(sub, 'hover');
    });
    el.addEventListener('pointerleave', (e) => {
      if (e.pointerType !== 'mouse') return;
      sub.quiet = false;
      if (sub.how === 'hover') sub.timer = setTimeout(() => close(sub, false), 200);
    });
    el.addEventListener('pointerdown', () => { sub.held = true; });
    document.addEventListener('pointerup', () => { sub.held = false; });

    toggle.addEventListener('click', () => {
      if (!panel.hidden && sub.how === 'click') {
        close(sub, false);
        sub.quiet = true; // stays shut while the mouse is still over it
      } else {
        open(sub, 'click');
        sub.how = 'click';
      }
    });
    toggle.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        open(sub, 'click');
        sub.how = 'click';
        links()[0]?.focus();
      }
    });
    panel.addEventListener('keydown', (e) => {
      const items = links();
      const i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (i < 0) return items[0]?.focus();
        if (e.key === 'ArrowUp' && i === 0) return toggle.focus();
        items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus();
      } else if (e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        items[e.key === 'Home' ? 0 : items.length - 1]?.focus();
      }
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !panel.hidden) {
        e.preventDefault();
        e.stopPropagation();
        close(sub, true);
      }
    });
    // Tab out (or focus moving anywhere else) closes it; a press inside it does not.
    el.addEventListener('focusout', (e) => {
      if (!sub.held && !el.contains(e.relatedTarget)) close(sub, false);
    });
  }

  function wireAll() {
    for (const el of document.querySelectorAll('.site-nav-sub')) wire(el);
  }

  document.addEventListener('pointerdown', (e) => {
    for (const sub of subs) if (!sub.panel.hidden && !sub.el.contains(e.target)) close(sub, false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    for (const sub of subs) {
      if (sub.panel.hidden) continue;
      close(sub, sub.el.contains(document.activeElement));
    }
  });
  window.addEventListener('resize', () => { for (const sub of subs) place(sub); });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireAll);
  else wireAll();
})();
