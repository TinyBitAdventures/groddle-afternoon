/**
 * The hub map's street icons (vendor, shrine, subway station; js/map-graph.js renderHubMapSvg):
 * their tooltips and keyboard use, in both skins.
 *
 * The client gave each icon a tip on roll over (MapHub.as drawStreet, TipDisplayManager:
 * "<Store> Vendor", "Shrine to <Giant>", "Subway Station"). Here the same tip shows on hover
 * and on keyboard focus. The icons are one tab stop: Tab lands on the first, the arrow keys
 * (and Home, End) move between them left to right, and the tip follows the focus.
 */

const ICON = '.map-icon';

/**
 * The next icon's index for a key, or -1 when the key is not one of ours (pure).
 * @param {string} key
 * @param {number} at the focused icon's index
 * @param {number} count
 */
export function mapIconStep(key, at, count) {
  if (!count) return -1;
  if (key === 'ArrowRight' || key === 'ArrowDown') return (at + 1) % count;
  if (key === 'ArrowLeft' || key === 'ArrowUp') return (at - 1 + count) % count;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return -1;
}

/**
 * Where the tip goes (pure): centred over the icon, inside the map; under it when there is no
 * room above. Rects are { left, top, width, height } in px.
 * @returns {{ left:number, top:number, below:boolean }}
 */
export function mapIconTipPlace(icon, canvas, tip, gap = 6) {
  const cx = icon.left - canvas.left + icon.width / 2;
  let left = cx - tip.width / 2;
  left = Math.max(4, Math.min(left, canvas.width - tip.width - 4));
  const above = icon.top - canvas.top - gap - tip.height;
  const below = above < 4;
  const top = below ? icon.top - canvas.top + icon.height + gap : above;
  return { left: Math.round(left), top: Math.round(top), below };
}

/** Wires the icons of the map now in `canvas` (call after each render). */
export function bindMapIconTips(canvas) {
  if (!canvas) return;
  const icons = [...canvas.querySelectorAll(ICON)];
  let tip = canvas.querySelector('.map-icon-tip');
  if (!icons.length) {
    tip?.remove();
    return;
  }
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'map-icon-tip';
    tip.setAttribute('role', 'tooltip');
    tip.id = 'map-icon-tip';
  }
  tip.hidden = true;
  canvas.appendChild(tip);

  let hovered = null;
  const show = (icon) => {
    tip.textContent = icon.getAttribute('data-tip') || '';
    tip.hidden = false;
    tip.dataset.kind = icon.getAttribute('data-kind') || '';
    const place = mapIconTipPlace(icon.getBoundingClientRect(), canvas.getBoundingClientRect(), tip.getBoundingClientRect());
    tip.style.left = `${place.left}px`;
    tip.style.top = `${place.top}px`;
    tip.classList.toggle('below', place.below);
    if (canvas.dataset) canvas.dataset.mapIconTip = tip.textContent;
  };
  const hide = () => {
    tip.hidden = true;
    if (canvas.dataset) delete canvas.dataset.mapIconTip;
  };
  const settle = () => {
    const focused = icons.find((el) => el === document.activeElement);
    if (hovered) show(hovered);
    else if (focused) show(focused);
    else hide();
  };

  icons.forEach((icon, i) => {
    icon.addEventListener('pointerenter', () => { hovered = icon; show(icon); });
    icon.addEventListener('pointerleave', () => { if (hovered === icon) hovered = null; settle(); });
    icon.addEventListener('focus', () => {
      for (const el of icons) el.setAttribute('tabindex', el === icon ? '0' : '-1');
      icon.setAttribute('aria-describedby', tip.id);
      show(icon);
    });
    icon.addEventListener('blur', () => {
      icon.removeAttribute('aria-describedby');
      // The next focus lands after blur; settle once it has.
      setTimeout(settle, 0);
    });
    icon.addEventListener('keydown', (e) => {
      const next = mapIconStep(e.key, i, icons.length);
      if (next < 0) return;
      e.preventDefault();
      e.stopPropagation();
      icons[next].focus();
    });
  });
}
