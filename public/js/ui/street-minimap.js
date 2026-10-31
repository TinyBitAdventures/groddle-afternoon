/**
 * MINIMAP (G370): the street map, a small picture of the street you are on with a dot for you,
 * a dot for every other player here, the Rube when he visits, and the signposts.
 *
 * Source: glitch-client view/gameoverlay/maps/MiniMapView.as (Tiny Speck, CC0), placed by
 * TSMainView.as 283 at the viewport's top right (place 917-920). What it does, and how this
 * file keeps it:
 * - Size: 160 wide (MAX_ALLOWABLE_MAP_WIDTH), the street scaled to that width, so its height
 *   follows the street's shape. A tall street shows a 70 px slice (MAX_CONTRACTED_H, plus the
 *   10 px tab's height, addGraphic 360-364) kept centred on you (updateYou 674-680), and a
 *   30 x 10 tab under it with map_expand_arrow. The tab shows only when the full map is at
 *   least 14 px taller than the slice (shouldShowMapExpand 1106-1110).
 * - Expanding: hold the pointer over the map for 2 s (rollOverTimer) or click the tab. It
 *   unrolls to the full height in 0.4 s (easeOutCubic; easeInCubic back), with the bottom held
 *   so it looks like a classroom map unrolling (674-678), and rolls back up when the pointer
 *   leaves (endExpandTween 484-489).
 * - Bleed: signposts and dots may stand 20 px past the left, right and top edges
 *   (MAP_CONTAINER_BLEED); a mark whose foot is above the top edge is hidden (showHideIcons).
 * - Marks stand on their point: centred across, their foot on it (placeThingAt 519-534).
 * - You: a black r 4 dot, a 2 px white ring and a 0xFFD616 glow (addYou 610-623; the code fills
 *   0, not its unused YOU_DOT_COLOR; classic-spec assets.md agrees). No tip.
 * - Other players: white r 5 (circleSize 4 + half the 2 px stroke) with a 2 px black ring; a
 *   `color_group` colours the fill (ColorUtil.getDotColor: '#rrggbb', anything else black); with
 *   `game_text` the dot is 2 px bigger, its ring the fill colour and the text inside (colorPC
 *   566-603). The tip is their name.
 * - Items: only npc_rube (ITEMS_TO_TRACK), an orange 0xf8992a dot with a black ring; the tip is
 *   his label.
 * - Signposts: teensy_signpost art for posts with a visible connection; hidden and invisible
 *   posts are skipped (maybeAddSignpost 398-418). The tip lists where it goes, one per line
 *   (getTip 923-970).
 * - no_map: the street hides the map (Location.show_map, changeMiniMapVisibility). fog_map: a
 *   70% black wash over the picture and "No map: You're on your own" (addGraphic 330-337).
 * - The picture: the 2012 server sent a snapshot of the street (resnapMiniMap). Here the
 *   street's own layers are drawn small through Pixi (snapshotStreetView, every layer stretched
 *   to the street as a flat picture), over the sky gradient and the platform lines, which are
 *   all that shows if the snapshot fails.
 * - Hidden, as changeMiniMapVisibility hid it: while you move between streets, the Imagination
 *   menu or a full-screen moment is up, in decorate mode; and in this remake also in Camera
 *   Mode, during the tutorial and an arrival or exit scene.
 * - Left out: clicking the map to walk there (mouseUpHandler: startUserInitiatedPath), the GPS
 *   it carried (the route card is js/features/map-routes-feature.js), drawRangesFromCPLS (the
 *   white lines of an item's placement ranges while placing furniture, a placement aid), the
 *   editor's view rectangle and checkboxes.
 *
 * One DOM and one behaviour for both skins: style.css's MINIMAP block is the modern card,
 * css/classic.css the 2012 look. The width comes from CSS (--mm-w); everything scales by
 * u = width / 160 (the root's --mm-u).
 *
 * The setting: on by default, localStorage['groddle.streetMap'] ('on'/'off', in try/catch),
 * Shift+M (js/client-hotkeys.js), the Menu's Settings (js/ui/topbar.js), Preferences
 * (js/classic/classic-prefs.js) and the card's own hide button.
 *
 * QA (features/street-minimap-feature.js): canvas data streetMap (shown|off|hidden|no-map),
 * streetMapFog, streetMapExpanded, streetMapDots, streetMapSigns, streetMapPicture
 * (snapshot|lines), streetMapSnapMs.
 */

export const MAP_WIDTH = 160;
export const MAX_CONTRACTED_H = 70;
export const EXPAND_TAB = Object.freeze({ w: 30, h: 10 });
export const MAP_BLEED = 20;
/** shouldShowMapExpand: the full map must be at least this much taller than the slice. */
export const EXPAND_MIN_GROWTH = 14;
export const ROLLOVER_MS = 2000;
export const TWEEN_MS = 400;
/** ITEMS_TO_TRACK. */
export const TRACKED_ITEMS = Object.freeze(['npc_rube']);
export const NO_MAP_TEXT = "No map: You're on your own";

/** Mark sizes in map units (u = 1 at 160 wide): the drawn circle plus its ring. */
export const YOU_DOT = Object.freeze({ r: 4, ring: 2, fill: '#000000', stroke: '#ffffff', glow: '#ffd616' });
export const OTHER_DOT = Object.freeze({ r: 5, ring: 2, fill: '#ffffff', stroke: '#000000' });
export const ITEM_DOT = Object.freeze({ r: 5, ring: 2, fill: '#f8992a', stroke: '#000000' });
export const SIGNPOST_MARK = Object.freeze({ w: 10, h: 15 });

export const STREET_MAP_STORAGE_KEY = 'groddle.streetMap';
export const STREET_MAP_EVENT = 'groddle:street-map';
export const STREET_MAP_DEFAULT = true;
export const STREET_MAP_LABEL = 'Street map';
export const STREET_MAP_HINT = 'A small map of this street with a dot for everyone here. Shift+M shows or hides it.';

/* ------------------------------------------------------------------ pure */

/** The street's size in world px (its bounds). */
function streetSize(street) {
  const b = street?.bounds || {};
  const W = Number(b.r) - Number(b.l);
  const H = Number(b.b) - Number(b.t);
  return { W: Number.isFinite(W) && W > 0 ? W : 1, H: Number.isFinite(H) && H > 0 ? H : 1 };
}

/**
 * PURE: the map's geometry for a street at `width` CSS px (addGraphic 312-365). World points are
 * the game's (the street's own x/y less its bounds' left and top, street-model worldToScreen).
 * @returns {{ w: number, mapH: number, u: number, W: number, H: number, expandable: boolean,
 *   contractedH: number, bleed: number, tab: { w: number, h: number } }}
 */
export function mapGeometry(street, { width = MAP_WIDTH } = {}) {
  const { W, H } = streetSize(street);
  const w = Math.max(1, Number(width) || MAP_WIDTH);
  const u = w / MAP_WIDTH;
  const mapH = (H * w) / W;
  const expandable = mapH > (MAX_CONTRACTED_H + EXPAND_MIN_GROWTH) * u;
  return {
    w,
    mapH,
    u,
    W,
    H,
    expandable,
    contractedH: expandable ? (MAX_CONTRACTED_H + EXPAND_TAB.h) * u : mapH,
    bleed: MAP_BLEED * u,
    tab: { w: EXPAND_TAB.w * u, h: EXPAND_TAB.h * u },
  };
}

/** PURE: a world point on the map, rounded as translateX/translateY (509-515). */
export function toMap(geom, x, y) {
  return {
    x: Math.round((Number(x) / geom.W) * geom.w),
    y: Math.round((Number(y) / geom.H) * geom.mapH),
  };
}

/**
 * PURE: where a mark of mw x mh stands for a world point (placeThingAt 519-534): centred across,
 * its foot on the point, never more than its height above the map's top, and hidden when its foot
 * is above the top of what shows (`scrollY`, the map y at the window's top edge).
 */
export function placeMark(geom, x, y, mw, mh, scrollY = 0) {
  const p = toMap(geom, x, y);
  const left = p.x - Math.floor(mw / 2);
  const top = Math.max(1 - Math.round(mh), p.y - Math.round(mh));
  return { left, top, visible: scrollY < top + mh };
}

/**
 * PURE: the map y at the window's top, keeping you centred (updateYou 670-680). While the map
 * unrolls the bottom is held and you are kept in view.
 */
export function scrollFor(geom, youTop, containerH, tweening = false) {
  if (tweening) return Math.max(0, Math.min(youTop - (MAX_CONTRACTED_H * geom.u) / 2, geom.mapH - containerH));
  return Math.max(0, Math.min(geom.mapH - containerH, youTop - containerH / 2));
}

/**
 * PURE: the signposts the map shows, each with its tip (maybeAddSignpost 398-418, getTip
 * 930-947): not hidden or invisible, with at least one visible connection (any post on a home
 * street), and not a quarter's styled post. World x/y as the game's.
 */
export function signpostMarks(street) {
  const l = Number(street?.bounds?.l) || 0;
  const t = Number(street?.bounds?.t) || 0;
  const out = [];
  for (const sign of street?.signposts || []) {
    if (!sign || sign.hidden || sign.invisible) continue;
    if (sign.quarterInfo && sign.quarterInfo.style && sign.quarterInfo.style !== 'normal') continue;
    const labels = (sign.connects || []).filter((c) => c && !c.hidden).map((c) => String(c.label || '')).filter(Boolean);
    if (!labels.length && !street?.isHome) continue;
    out.push({ kind: 'sign', id: String(sign.id || `sign-${out.length}`), x: Number(sign.x) - l, y: Number(sign.y) - t, tip: labels.join('\n') || null });
  }
  return out;
}

/** PURE: ColorUtil.getDotColor: a '#rrggbb' group colour, anything else black. */
export function dotColor(colorGroup) {
  const s = String(colorGroup || '');
  return /^#[0-9a-f]{6}$/i.test(s) ? s.toLowerCase() : '#000000';
}

/**
 * PURE: how a mark draws (addYou, colorPC, onLocItemstackAdds): fill, ring colour, radius and
 * ring in map units, the size it takes, and the text a game puts in a player's dot.
 * @param {{ kind: 'you'|'player'|'item', colorGroup?: string, gameText?: string }} mark
 */
export function dotLook(mark) {
  if (mark?.kind === 'you') return { fill: YOU_DOT.fill, stroke: YOU_DOT.stroke, r: YOU_DOT.r, ring: YOU_DOT.ring, glow: YOU_DOT.glow, size: 2 * (YOU_DOT.r + YOU_DOT.ring / 2), text: '' };
  if (mark?.kind === 'item') return { fill: ITEM_DOT.fill, stroke: ITEM_DOT.stroke, r: ITEM_DOT.r, ring: ITEM_DOT.ring, glow: null, size: 2 * (ITEM_DOT.r + ITEM_DOT.ring / 2), text: '' };
  const fill = mark?.colorGroup ? dotColor(mark.colorGroup) : OTHER_DOT.fill;
  const text = String(mark?.gameText || '');
  const r = text ? OTHER_DOT.r + 2 : OTHER_DOT.r;
  return { fill, stroke: text ? fill : OTHER_DOT.stroke, r, ring: OTHER_DOT.ring, glow: null, size: 2 * (r + OTHER_DOT.ring / 2), text };
}

/** PURE: a mark's tip (getTip 923-970): a post's places one per line, a player's or item's label, none for you. */
export function tipFor(mark) {
  if (!mark || mark.kind === 'you') return null;
  if (mark.kind === 'sign') return mark.tip || null;
  const label = String(mark.label || '').trim();
  return label || null;
}

/**
 * PURE: whether the map shows, and why not. `pref` the player's setting; the rest the moment's
 * state (changeMiniMapVisibility 2908-2934 plus the remake's Camera Mode, tutorial and scenes).
 * @returns {'shown'|'off'|'no-map'|'hidden'}
 */
export function minimapVisibility({ pref = true, street = null, started = true, moving = false, screenView = false, imagination = false, decorating = false, cameraMode = false, tutorial = false, cutscene = false } = {}) {
  if (!pref) return 'off';
  if (!street || !started) return 'hidden';
  if (street.noMap) return 'no-map';
  if (moving || screenView || imagination || decorating || cameraMode || tutorial || cutscene) return 'hidden';
  return 'shown';
}

/** PURE: the stored words as on or off; anything else is the default (on). */
export function parseStreetMap(v) {
  if (v === 'off' || v === false || v === '0' || v === 'false') return false;
  if (v === 'on' || v === true || v === '1' || v === 'true') return true;
  return STREET_MAP_DEFAULT;
}

export function loadStreetMap(storage) {
  try {
    return parseStreetMap(storage?.getItem(STREET_MAP_STORAGE_KEY) ?? null);
  } catch {
    return STREET_MAP_DEFAULT;
  }
}

export function saveStreetMap(on, storage) {
  try {
    storage?.setItem(STREET_MAP_STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    /* the choice just won't be remembered */
  }
}

/** The setting for one window ({ get, set, toggle, onChange }); tests pass a fake storage. */
export function createStreetMapPref({ win = globalThis, storage } = {}) {
  const store = storage !== undefined ? storage : (() => { try { return win?.localStorage; } catch { return null; } })();
  let on = loadStreetMap(store);
  const listeners = new Set();
  const api = {
    get: () => on,
    set(v) {
      const next = Boolean(v);
      if (next === on) return on;
      on = next;
      saveStreetMap(on, store);
      for (const fn of [...listeners]) {
        try { fn(on); } catch (err) { console.error(err); }
      }
      try {
        if (typeof win?.CustomEvent === 'function') win.dispatchEvent(new win.CustomEvent(STREET_MAP_EVENT, { detail: { on } }));
      } catch { /* no window events (tests) */ }
      return on;
    },
    toggle: () => api.set(!on),
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
  return api;
}

const pref = createStreetMapPref();
/** This window's choice: true shows the street map. */
export const streetMapOn = () => pref.get();
export const setStreetMap = (on) => pref.set(on);
export const toggleStreetMap = () => pref.toggle();
export const onStreetMapChange = (fn) => pref.onChange(fn);
/** The shared setting object ({ get, set, onChange }) the Menu's switch takes. */
export const streetMapSetting = pref;

/* ------------------------------------------------------------------ picture */

const hex = (v) => `#${String(v || '').replace(/^#/, '').slice(0, 6).padStart(6, '0')}`;

/**
 * The fallback picture (and the backdrop under the snapshot): the street's sky gradient and its
 * platform lines (game world px, x1 y1 x2 y2), drawn into `canvas` at its own size.
 */
export function drawLinesPicture(canvas, street, platforms = []) {
  const ctx = canvas?.getContext?.('2d');
  if (!ctx) return false;
  const { W, H } = streetSize(street);
  const cw = canvas.width;
  const ch = canvas.height;
  ctx.clearRect(0, 0, cw, ch);
  if (street?.gradient?.top && street?.gradient?.bottom) {
    const g = ctx.createLinearGradient(0, 0, 0, ch);
    g.addColorStop(0, hex(street.gradient.top));
    g.addColorStop(1, hex(street.gradient.bottom));
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = '#c9dce4';
  }
  ctx.fillRect(0, 0, cw, ch);
  ctx.strokeStyle = 'rgba(52, 40, 24, 0.75)';
  ctx.lineWidth = Math.max(1, cw / MAP_WIDTH);
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const p of platforms || []) {
    if (!p || p.pc_perm === 1 || p.pcPerm === 1) continue;
    ctx.moveTo((p.x1 / W) * cw, (p.y1 / H) * ch);
    ctx.lineTo((p.x2 / W) * cw, (p.y2 / H) * ch);
  }
  ctx.stroke();
  return true;
}

/**
 * The street's own picture, small: every layer of the street view (js/street-render.js
 * buildStreetView) stretched over the street as one flat picture, its sky left out (the
 * gradient is drawn under it), its culled decos drawn too. Returns a canvas of width x height
 * device px, or null when the view can't be drawn. The view is put back as it was.
 */
export function snapshotStreetView(PIXI, renderer, view, { width, height } = {}) {
  if (!PIXI || !renderer || !view || view.destroyed || !(width > 0) || !(height > 0)) return null;
  const W = view.worldW || 0;
  const H = view.sourceWorldH || view.worldH || 0;
  if (!(W > 0) || !(H > 0)) return null;
  const restore = [];
  const set = (obj, key, value) => {
    restore.push([obj, key, obj[key]]);
    obj[key] = value;
  };
  let rt = null;
  try {
    for (const lc of view.parallaxLayers || []) {
      const layer = lc.parallaxLayer || {};
      restore.push([lc.position, 'x', lc.position.x], [lc.position, 'y', lc.position.y], [lc.scale, 'x', lc.scale.x], [lc.scale, 'y', lc.scale.y]);
      lc.position.set(0, 0);
      lc.scale.set(layer.w > 0 ? W / layer.w : 1, layer.h > 0 ? H / layer.h : 1);
    }
    for (const lc of view.layerContainers || []) {
      for (const child of lc.children || []) if (child.culled) set(child, 'culled', false);
    }
    if (view.skyView) set(view.skyView, 'visible', false);
    const front = view.frontView && !view.frontView.destroyed ? view.frontView : null;
    rt = PIXI.RenderTexture.create({ width, height, resolution: 1 });
    const m = new PIXI.Matrix().scale(width / W, height / H);
    renderer.render({ container: view, target: rt, clear: true, transform: m });
    if (front) renderer.render({ container: front, target: rt, clear: false, transform: m });
    return renderer.extract.canvas(rt);
  } catch (err) {
    console.warn('street map snapshot', err);
    return null;
  } finally {
    for (let i = restore.length - 1; i >= 0; i--) {
      const [obj, key, value] = restore[i];
      obj[key] = value;
    }
    rt?.destroy(true);
  }
}

/* ------------------------------------------------------------------ view */

const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const easeOut = (k) => 1 - (1 - k) ** 3;
const easeIn = (k) => k ** 3;

const MAP_SVG = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 5l5-2 5 2 5-2v12l-5 2-5-2-5 2z" /><path d="M7.5 3v12M12.5 5v12" /></svg>';

/**
 * The street map's DOM in `host` (#game-root): the card (#street-minimap) and its show button
 * (#street-minimap-show). `opts`:
 *   artUrl(name)       the classic art's url (js/classic/classic-art.js classicArtUrl)
 *   reducedMotion()    true: expand and contract without the tween
 *   onHide()           the card's hide button (the setting goes off)
 *   onShow()           the show button (the setting goes on)
 *   onLayout(px)       the height the card takes now (0 hidden), for what stacks under it
 *   now()              ms clock (tests)
 */
export function createStreetMinimap(doc, host, opts = {}) {
  const artUrl = opts.artUrl || (() => '');
  const reducedMotion = opts.reducedMotion || (() => false);
  const now = opts.now || (() => performance.now());
  const raf = opts.raf || ((fn) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(fn) : setTimeout(() => fn(now()), 16)));

  const root = doc.createElement('section');
  root.id = 'street-minimap';
  root.className = 'street-minimap';
  root.setAttribute('aria-label', 'Street map');
  root.hidden = true;
  root.dataset.expanded = 'false';
  root.innerHTML = `
    <div class="smm-card">
      <div class="smm-window"><img class="smm-pic" alt="" /><div class="smm-fogwash" hidden></div></div>
      <div class="smm-marks"><div class="smm-marks-in">
        <div class="smm-dots"></div><div class="smm-signs"></div>
        <span class="smm-dot smm-you" data-kind="you" aria-hidden="true"></span>
      </div></div>
      <p class="smm-fog" hidden>${esc(NO_MAP_TEXT)}</p>
      <button type="button" class="smm-hide" aria-label="Hide the street map (Shift+M)" title="Hide the street map (Shift+M)"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 6h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg></button>
    </div>
    <button type="button" class="smm-tab" aria-expanded="false" aria-label="Show the whole street map" title="Show the whole street map"><img class="smm-arrow" alt="" src="${esc(artUrl('map_expand_arrow'))}" /></button>
    <div class="smm-tip" role="tooltip" id="street-minimap-tip" hidden></div>`;
  const showBtn = doc.createElement('button');
  showBtn.type = 'button';
  showBtn.id = 'street-minimap-show';
  showBtn.className = 'smm-show';
  showBtn.hidden = true;
  showBtn.setAttribute('aria-label', 'Show the street map (Shift+M)');
  showBtn.title = 'Show the street map (Shift+M)';
  showBtn.innerHTML = MAP_SVG;
  host.append(root, showBtn);

  const q = (s) => root.querySelector(s);
  const card = q('.smm-card');
  const win = q('.smm-window');
  // The picture is drawn off the page and shown as an image: tools read the first canvas on the page.
  const picImg = q('.smm-pic');
  const pic = doc.createElement('canvas');
  const showPic = () => {
    try {
      picImg.src = pic.toDataURL('image/png');
    } catch {
      picImg.removeAttribute('src');
    }
  };
  const wash = q('.smm-fogwash');
  const marks = q('.smm-marks');
  const marksIn = q('.smm-marks-in');
  const signsEl = q('.smm-signs');
  const dotsEl = q('.smm-dots');
  const youEl = q('.smm-you');
  const fog = q('.smm-fog');
  const tab = q('.smm-tab');
  const tip = q('.smm-tip');
  const hideBtn = q('.smm-hide');

  let street = null;
  let geom = null;
  let expanded = false;
  let tween = null;
  let containerH = 0;
  let scrollY = 0;
  let you = null;
  let rollTimer = null;
  let shown = false;
  let state = 'hidden';
  let tipFor_ = null;
  const signs = new Map();
  const dots = new Map();
  let lastLayout = -1;

  const widthPx = () => {
    const w = win.getBoundingClientRect?.().width || win.clientWidth || 0;
    return w > 0 ? w : MAP_WIDTH;
  };

  function layout() {
    if (!geom) return;
    root.style.setProperty('--mm-u', String(geom.u));
    root.style.setProperty('--mm-h', `${containerH}px`);
    root.style.setProperty('--mm-bleed', `${geom.bleed}px`);
    root.style.setProperty('--mm-scroll', `${-scrollY}px`);
    root.style.setProperty('--mm-map-h', `${geom.mapH}px`);
    tab.hidden = !geom.expandable;
    reportLayout();
  }

  function reportLayout() {
    // The card (and its tab), or the show button where the card was, or nothing.
    let h = 0;
    if (shown) h = Math.round(root.getBoundingClientRect?.().height || containerH + (geom?.expandable ? geom.tab.h : 0));
    else if (!showBtn.hidden) h = Math.round(showBtn.getBoundingClientRect?.().height || 0);
    if (h !== lastLayout) {
      lastLayout = h;
      opts.onLayout?.(h);
    }
  }

  function placeEl(el, x, y, w, h) {
    const p = placeMark(geom, x, y, w, h, scrollY);
    el.style.transform = `translate(${p.left}px, ${p.top}px)`;
    el.hidden = !p.visible;
    return p;
  }

  function refreshScroll() {
    if (!geom) return;
    const youSize = dotLook({ kind: 'you' }).size * geom.u;
    const youTop = you ? placeMark(geom, you.x, you.y, youSize, youSize, 0).top : 0;
    scrollY = scrollFor(geom, youTop, containerH, Boolean(tween));
    root.style.setProperty('--mm-scroll', `${-scrollY}px`);
    root.style.setProperty('--mm-h', `${containerH}px`);
  }

  function placeAll() {
    if (!geom) return;
    refreshScroll();
    const sw = SIGNPOST_MARK.w * geom.u;
    const sh = SIGNPOST_MARK.h * geom.u;
    for (const s of signs.values()) placeEl(s.el, s.mark.x, s.mark.y, sw, sh);
    for (const d of dots.values()) {
      const size = dotLook(d.mark).size * geom.u;
      placeEl(d.el, d.mark.x, d.mark.y, size, size);
    }
    if (you) {
      const size = dotLook({ kind: 'you' }).size * geom.u;
      const p = placeEl(youEl, you.x, you.y, size, size);
      youEl.hidden = !p.visible;
    }
  }

  function setTarget(h, { animate = true } = {}) {
    if (!geom) return;
    const from = containerH;
    if (!animate || reducedMotion() || Math.abs(h - from) < 0.5) {
      tween = null;
      containerH = h;
      layout();
      placeAll();
      return;
    }
    const start = now();
    const ease = h > from ? easeOut : easeIn;
    const t = { from, to: h, start };
    tween = t;
    const step = () => {
      if (tween !== t) return;
      const k = Math.min(1, (now() - start) / TWEEN_MS);
      containerH = from + (h - from) * ease(k);
      if (k >= 1) tween = null;
      layout();
      placeAll();
      if (tween === t) raf(step);
    };
    raf(step);
  }

  function setExpanded(on, { animate = true } = {}) {
    if (!geom?.expandable) on = false;
    if (expanded === on && !tween) return;
    expanded = on;
    root.dataset.expanded = on ? 'true' : 'false';
    tab.setAttribute('aria-expanded', on ? 'true' : 'false');
    const words = on ? 'Roll up the street map' : 'Show the whole street map';
    tab.setAttribute('aria-label', words);
    tab.title = words;
    setTarget(on ? fullHeight() : geom?.contractedH || 0, { animate });
    opts.onExpand?.(on);
  }

  /** The full map, but never past the window (a very tall street). */
  function fullHeight() {
    const room = Number(opts.maxHeight?.()) || Infinity;
    return Math.max(geom.contractedH, Math.min(geom.mapH, room));
  }

  // —— Tips ——
  function showTip(el, text) {
    if (!text) return hideTip();
    tip.textContent = text;
    tip.hidden = false;
    tipFor_ = el;
    el.setAttribute('aria-describedby', 'street-minimap-tip');
    const rb = root.getBoundingClientRect?.();
    const eb = el.getBoundingClientRect?.();
    if (rb && eb) {
      // Centred under the mark (getTip: POINTER_TOP_CENTER, 15 below), kept inside the window.
      const tw = tip.offsetWidth || 0;
      // Inside the world cell (Classic clips it at the chat column), else the window.
      const hb = root.parentElement?.getBoundingClientRect?.();
      const vw = Math.min(doc.documentElement?.clientWidth || rb.right, hb?.width ? hb.right : Infinity);
      const centre = eb.left + eb.width / 2;
      const left = Math.max(4, Math.min(vw - 4 - tw, centre - tw / 2));
      tip.style.setProperty('--tip-x', `${left - rb.left}px`);
      tip.style.setProperty('--tip-y', `${eb.bottom - rb.top}px`);
    }
  }
  function hideTip() {
    tipFor_?.removeAttribute?.('aria-describedby');
    tipFor_ = null;
    tip.hidden = true;
  }
  const tipText = (el) => {
    const id = el?.dataset?.mark;
    if (!id) return null;
    const row = signs.get(id) || dots.get(id);
    return row ? tipFor(row.mark) : null;
  };
  for (const type of ['pointerover', 'focusin']) {
    marks.addEventListener(type, (e) => {
      const el = e.target?.closest?.('[data-mark]');
      if (el) showTip(el, tipText(el));
    });
  }
  for (const type of ['pointerout', 'focusout']) {
    marks.addEventListener(type, (e) => {
      const el = e.target?.closest?.('[data-mark]');
      if (el && el === tipFor_) hideTip();
    });
  }

  // —— Expanding (onRollOver / onRollOut / expandContractMap) ——
  card.addEventListener('pointerenter', () => {
    if (expanded || tween || !geom?.expandable) return;
    clearTimeout(rollTimer);
    rollTimer = setTimeout(() => setExpanded(true), ROLLOVER_MS);
  });
  card.addEventListener('pointerleave', () => clearTimeout(rollTimer));
  root.addEventListener('pointerleave', () => {
    clearTimeout(rollTimer);
    if (expanded && !root.contains(doc.activeElement)) setExpanded(false);
  });
  root.addEventListener('focusout', (e) => {
    if (expanded && !root.contains(e.relatedTarget)) setExpanded(false);
  });
  tab.addEventListener('click', () => {
    clearTimeout(rollTimer);
    setExpanded(!expanded);
  });
  root.addEventListener('keydown', (e) => {
    // A focused control's Enter or Space is its own (never a verb or a jump).
    if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
    if (e.key === 'Escape' && expanded) {
      e.stopPropagation();
      setExpanded(false);
      tab.focus?.();
    }
  });
  hideBtn.addEventListener('click', () => opts.onHide?.());
  showBtn.addEventListener('click', () => opts.onShow?.());
  showBtn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
  });

  function markButton(kind, id) {
    const el = doc.createElement('button');
    el.type = 'button';
    el.className = kind === 'sign' ? 'smm-sign' : `smm-dot smm-${kind}`;
    el.dataset.mark = id;
    el.dataset.kind = kind;
    if (kind === 'sign') el.innerHTML = `<img alt="" src="${esc(artUrl('teensy_signpost'))}" />`;
    return el;
  }

  const api = {
    root,
    showBtn,
    get expanded() { return expanded; },
    get geometry() { return geom; },
    get state() { return state; },
    /** A new street: its geometry, signposts and the fallback picture until a snapshot lands. */
    setStreet(next, { platforms = [] } = {}) {
      street = next || null;
      api._platforms = Array.isArray(platforms) ? platforms : [];
      hideTip();
      clearTimeout(rollTimer);
      tween = null;
      signs.clear();
      dots.clear();
      signsEl.replaceChildren();
      dotsEl.replaceChildren();
      you = null;
      if (!street) {
        geom = null;
        return;
      }
      geom = mapGeometry(street, { width: widthPx() });
      expanded = false;
      root.dataset.expanded = 'false';
      tab.setAttribute('aria-expanded', 'false');
      containerH = geom.contractedH;
      pic.width = Math.max(1, Math.round(geom.w * 2));
      pic.height = Math.max(1, Math.round(geom.mapH * 2));
      drawLinesPicture(pic, street, platforms);
      showPic();
      root.dataset.picture = 'lines';
      const fogged = Boolean(street.fogMap);
      fog.hidden = !fogged;
      wash.hidden = !fogged;
      root.dataset.fog = fogged ? 'true' : 'false';
      for (const mark of signpostMarks(street)) {
        const el = markButton('sign', mark.id);
        if (mark.tip) el.setAttribute('aria-label', `Signpost to ${mark.tip.split('\n').join(', ')}`);
        signsEl.append(el);
        signs.set(mark.id, { mark, el });
      }
      root.dataset.signs = String(signs.size);
      layout();
    },
    /** The size of the picture canvas in device px (the snapshot's target). */
    pictureSize() {
      return { width: pic.width, height: pic.height };
    },
    /** Lay a snapshot (a canvas) over the lines picture. */
    setPicture(canvas) {
      if (!canvas || !street) return false;
      const ctx = pic.getContext?.('2d');
      if (!ctx) return false;
      drawLinesPicture(pic, street, api._platforms || []);
      ctx.drawImage(canvas, 0, 0, pic.width, pic.height);
      showPic();
      root.dataset.picture = 'snapshot';
      return true;
    },
    /**
     * Your point and every other mark: [{ kind: 'player'|'item', id, label, x, y, colorGroup?,
     * gameText? }] in world px. Dots come and go by id.
     */
    update(youAt, rows = []) {
      if (!geom) return;
      you = youAt && Number.isFinite(youAt.x) && Number.isFinite(youAt.y) ? { x: youAt.x, y: youAt.y } : null;
      const seen = new Set();
      for (const row of rows) {
        if (!row || !Number.isFinite(row.x) || !Number.isFinite(row.y)) continue;
        const id = `${row.kind}:${row.id}`;
        seen.add(id);
        let d = dots.get(id);
        if (!d) {
          d = { el: markButton(row.kind === 'item' ? 'item' : 'player', id), mark: null, key: '' };
          dots.set(id, d);
          dotsEl.append(d.el);
        }
        d.mark = { ...row };
        const look = dotLook(d.mark);
        const key = `${look.fill}|${look.stroke}|${look.r}|${look.text}|${row.label}`;
        if (key !== d.key) {
          d.key = key;
          d.el.style.setProperty('--dot', look.fill);
          d.el.style.setProperty('--dot-ring', look.stroke);
          d.el.style.setProperty('--dot-d', String(look.size));
          d.el.textContent = look.text;
          d.el.classList.toggle('has-text', Boolean(look.text));
          d.el.dataset.colour = look.fill;
          d.el.setAttribute('aria-label', String(row.label || (row.kind === 'item' ? 'Something' : 'Someone')));
        }
      }
      for (const [id, d] of dots) {
        if (seen.has(id)) continue;
        if (tipFor_ === d.el) hideTip();
        d.el.remove();
        dots.delete(id);
      }
      youEl.hidden = !you;
      placeAll();
      root.dataset.dots = String(dots.size);
    },
    /** 'shown' | 'off' | 'no-map' | 'hidden' (minimapVisibility). */
    setState(next) {
      state = next;
      shown = next === 'shown';
      root.hidden = !shown;
      root.dataset.state = next;
      // The show button stands where the card was when the player turned it off.
      showBtn.hidden = next !== 'off' || !street;
      if (!shown) {
        hideTip();
        clearTimeout(rollTimer);
        if (expanded) setExpanded(false, { animate: false });
      }
      if (shown && geom) {
        // The card's width can change with the skin or the window: measure again.
        const w = widthPx();
        if (Math.abs(w - geom.w) > 0.5) {
          const plats = api._platforms || [];
          const pics = root.dataset.picture;
          api.setStreet(street, { platforms: plats });
          if (pics === 'snapshot') opts.onResnap?.();
        }
        layout();
        placeAll();
      }
      reportLayout();
    },
    expand: (on = true) => setExpanded(Boolean(on)),
    relayout() {
      if (!shown || !street) return;
      const w = widthPx();
      if (geom && Math.abs(w - geom.w) > 0.5) {
        api.setStreet(street, { platforms: api._platforms || [] });
        opts.onResnap?.();
      }
      layout();
      placeAll();
    },
    tipText: (id) => {
      const row = signs.get(id) || dots.get(id);
      return row ? tipFor(row.mark) : null;
    },
    _platforms: [],
    destroy() {
      clearTimeout(rollTimer);
      root.remove();
      showBtn.remove();
    },
  };
  return api;
}
