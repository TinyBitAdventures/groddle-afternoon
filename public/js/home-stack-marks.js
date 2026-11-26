/**
 * Decoration Mode marks (Austin 2026-11-23, on the day's calls: "visually allow owners to see which
 * are set as decoration and which are freebies"). The remake's own UI (inventions register:
 * home-stack-marks); Glitch's owner saw nothing to tell the two apart.
 *
 * Online, at the player's own home (their house with its back yard, their Tower floors and their
 * home street), two kinds of stack lie on the floor side by side:
 *
 * - decor: what the owner keeps in their own save, chiefly what they set down in Decoration Mode
 *   (house_lock, takeable.js 33-36: locked to the owner; visitors see Pick up greyed). Only the
 *   owner can pick it up. It carries a small lock pip, seen only by the owner: while the pointer is
 *   on it or its menu is open (a tap on a phone), and on every one of them in Decoration Mode.
 * - shared: what was dropped there (G1190, takeable_drop / takeable_pickup ran unchanged in a house):
 *   anyone there can pick it up. It stays plain; its menu's header says so, for the owner.
 *
 * Nowhere else (solo, a visit, a public street, offline) are stacks marked: there is no difference
 * to tell. The pip's colours are the tooltip tokens (--surface-tip, --text-tip) read from the page.
 */

export const HOME_MARK_TEXT = Object.freeze({
  decor: 'Set by you · only you can pick this up',
  shared: 'Anyone here can pick this up',
});

/**
 * PURE: the mark a stack drawn here carries: 'decor', 'shared' or ''.
 * ownHome: the player stands at their own home online (drops-mp-feature homeStackMarks);
 * fromSave: the stack is the player's own (game.js listDroppedStacks), not one the server shares;
 * shared: a stack the server shares (drops-mp.js normalizeGroundStack `shared`).
 */
export function homeStackMark({ ownHome = false, fromSave = false, shared = false } = {}) {
  if (!ownHome) return '';
  if (fromSave) return 'decor';
  return shared ? 'shared' : '';
}

/** PURE: the line a marked stack's menu header adds under its subtitle ('' for none). */
export function homeMarkNote(mark) {
  return HOME_MARK_TEXT[mark] || '';
}

/**
 * PURE: whether a decor stack's lock pip shows now: in Decoration Mode always, else while the
 * pointer is on it or its menu is open. A shared or unmarked stack never shows one.
 */
export function homePipShown(mark, { decorating = false, hovered = false, menuOpen = false } = {}) {
  return mark === 'decor' && Boolean(decorating || hovered || menuOpen);
}

/**
 * #669 (G1304, Austin 2026-11-25): the pip's words, beside it while the pointer is on the stack
 * (a tap on a phone): the padlock alone said nothing, its meaning was only in the menu header.
 */
export const HOME_PIP_WORDS = 'Only you can pick this up';

/** PURE: whether a shown pip has its words beside it: only on the stack under the pointer. */
export function homePipWordsShown(mark, { hovered = false } = {}) {
  return mark === 'decor' && Boolean(hovered);
}

/**
 * PURE: the words' dress, the game's tooltip in each skin. Modern: the bar's tip (style.css
 * .hud-tip: --surface-tip, --text-tip, --font-ui, bold). Classic: the client's pale yellow tip
 * (TipDisplayManager.as 28-32; classic.css .hud-tip: --c-classic-tip, --c-classic-text, a hairline
 * of --c-classic-ink at .37, --font-classic-body).
 */
export function pipWordsStyle(ui = 'modern', token = tokenColour) {
  if (ui === 'classic') {
    return {
      bg: token('--c-classic-tip', '#f8f6b4'),
      ink: token('--c-classic-text', '#4b5357'),
      rim: token('--c-classic-ink', '#000000'),
      rimAlpha: 0.37,
      font: token('--font-classic-body', 'Helvetica Neue, Helvetica, Arial, sans-serif'),
      weight: '400',
      radius: 4,
    };
  }
  return {
    bg: token('--surface-tip', '#3a332b'),
    ink: token('--text-tip', '#fbf7ef'),
    rim: null,
    rimAlpha: 0,
    font: token('--font-ui', 'Nunito, Trebuchet MS, sans-serif'),
    weight: '700',
    radius: 6,
  };
}

/**
 * The words in a tip pill, a Pixi container whose left edge sits at (0, 0), centred on y = 0 (the
 * pip's middle), so it goes just right of the pip.
 */
export function drawPipWords(PIXI, ui = 'modern', token = tokenColour) {
  const st = pipWordsStyle(ui, token);
  const box = new PIXI.Container();
  box.label = 'home-lock-words';
  box.eventMode = 'none';
  const text = new PIXI.Text({ text: HOME_PIP_WORDS, style: { fontFamily: st.font, fontSize: 11, fontWeight: st.weight, fill: st.ink } });
  const padX = 6;
  const h = 18;
  const w = Math.ceil((text.width || 0) + padX * 2);
  const g = new PIXI.Graphics();
  g.roundRect(0, -h / 2, w, h, st.radius).fill({ color: st.bg, alpha: 0.96 });
  if (st.rim) g.stroke({ width: 1, color: st.rim, alpha: st.rimAlpha });
  text.position?.set?.(padX, Math.round(-(text.height || 0) / 2));
  box.addChild(g);
  box.addChild(text);
  box.ui = ui;
  return box;
}

/** The pip's size, screen px: a disc this wide at the art's top left corner. */
export const HOME_PIP_PX = 14;

/** A CSS colour token's value on the page ('#rrggbb' or rgb()), or the fallback off a page. */
export function tokenColour(name, fallback) {
  try {
    const v = globalThis.getComputedStyle?.(globalThis.document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  } catch {
    return fallback;
  }
}

/**
 * The lock pip, a Pixi container centred on (0, 0), HOME_PIP_PX across: a tooltip-dark disc with a
 * thin light rim and a small padlock (a body and its shackle) in the tooltip's text colour.
 */
export function drawLockPip(PIXI) {
  const bg = tokenColour('--surface-tip', '#3a332b');
  const ink = tokenColour('--text-tip', '#fbf7ef');
  const r = HOME_PIP_PX / 2;
  const pip = new PIXI.Container();
  pip.label = 'home-lock-pip';
  pip.eventMode = 'none';
  const g = new PIXI.Graphics();
  g.circle(0, 0, r).fill({ color: bg, alpha: 0.88 }).stroke({ width: 1, color: ink, alpha: 0.7 });
  // The shackle: an arch over the body.
  g.moveTo(-2.2, -0.5).lineTo(-2.2, -2.2).arc(0, -2.2, 2.2, Math.PI, 0).lineTo(2.2, -0.5).stroke({ width: 1.3, color: ink });
  // The body.
  g.roundRect(-3.4, -0.8, 6.8, 4.8, 1).fill({ color: ink });
  pip.addChild(g);
  return pip;
}

/**
 * #730 (G1333, Austin 2026-11-26): ours. While a machine is dragged in Decoration Mode a faint mark
 * shows where your Glitch stands, the spot the 200 px between machines is measured from
 * (js/home-machines.js placeCheck `from`): a ring on the floor at your feet and a soft upright
 * outline your height above it (Decoration Mode's view can put the floor under its tray). Decoration
 * Mode hides the avatar (homes-feature setAvatarHidden), so nothing showed where that was; Glitch hid
 * the player too and said only "cannot be placed here". Its colours are tokens (style.css
 * --decor-stand-mark and its rim; classic.css gives the Classic skin its own), read from the page.
 */
export const STAND_MARK_SIZE = Object.freeze({ w: 64, h: 16, tall: 112, wide: 40 });

/** PURE: the mark's dress from the tokens (token(name, fallback) reads one). */
export function standMarkStyle(token = tokenColour) {
  return {
    fill: token('--decor-stand-mark', '#fff8ee'),
    rim: token('--decor-stand-mark-rim', '#1e1a16'),
    fillAlpha: 0.2,
    rimAlpha: 0.35,
  };
}

/** The mark, a Pixi container with the feet at (0, 0): the floor ring and the upright outline over it. */
export function drawStandMark(PIXI, token = tokenColour) {
  const st = standMarkStyle(token);
  const { w, h, tall, wide } = STAND_MARK_SIZE;
  const mark = new PIXI.Container();
  mark.label = 'home-stand-mark';
  mark.eventMode = 'none';
  const g = new PIXI.Graphics();
  // The upright: a rounded outline your height, the light line inside a dark one so it shows on any wall.
  g.roundRect(-wide / 2, -tall, wide, tall - h / 2, wide / 2).fill({ color: st.fill, alpha: st.fillAlpha * 0.6 }).stroke({ width: 3, color: st.rim, alpha: st.rimAlpha * 0.5 });
  g.roundRect(-wide / 2 + 1.5, -tall + 1.5, wide - 3, tall - h / 2 - 3, wide / 2 - 1.5).stroke({ width: 1.5, color: st.fill, alpha: 0.6 });
  // The ring on the floor.
  g.ellipse(0, 0, w / 2, h / 2).fill({ color: st.fill, alpha: st.fillAlpha }).stroke({ width: 3, color: st.rim, alpha: st.rimAlpha * 0.5 });
  g.ellipse(0, 0, w / 2 - 2, h / 2 - 1.5).stroke({ width: 1.5, color: st.fill, alpha: 0.7 });
  mark.addChild(g);
  return mark;
}
