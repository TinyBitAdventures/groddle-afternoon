/**
 * The upgrade reveal: what buying an iMG upgrade card shows (Austin 2026-11-15).
 *
 * Source: glitch-client view/ui/imagination/ImaginationPurchaseUpgradeUI.as, shown from
 * ImaginationHandUI.as showPurchase 334-353 (the bought card zooms off, rotation 20 and scale 4
 * over .3 s easeInExpo, then the hand's card_holder fades out over .2 s while this fades in) and
 * closed by closePurchaseScreen 654-666 (the hand fades back in).
 * - show 213-233: alpha 0 to 1 over .2 s; the YOU_WIN sound; it is added to the main view.
 * - refresh 245-286: the whole location viewport (x gutter_w, y header_h, loc_vp_w x loc_vp_h),
 *   rounded on its left corners like the viewport (loc_vp_elipse_radius / 2), filled with the
 *   repeating_clouds bitmap, or plain white for a keepable card (config.bg keepable).
 * - buildBase 145-205: one centred column: "Got it!", the card's name, its art with a drop
 *   shadow and a soft white glow (blur 125, strength 2, alpha .75; none on a keepable), the
 *   description, "And also:" and the item's icon (ITEM_WH 90) when the card gives an item and is
 *   not a keepable (setItem 303-317), then one button.
 * - setCloseButton 319-332: the button's label is a random pick from BT_LABELS the first time,
 *   then the next one (wrapping) on each later purchase. The list is Tiny Speck's own words (CC0),
 *   copied verbatim.
 * - onCloseClick 335-338: CLICK_SUCCESS, then back to the hand.
 *
 * This module holds the pure parts (labels, content, the play-area rect) and the DOM view;
 * features/imagination-feature.js decides when it shows. The Modern look is the CSS below
 * (tokens only); Classic's is the imgreveal block in css/classic.css.
 */

/** ImaginationPurchaseUpgradeUI.as BT_LABELS 39-117, verbatim. */
export const BT_LABELS = Object.freeze([
  'Super!',
  'Great News',
  'Exciting!',
  'Wonderful!',
  'Stellar',
  'Superb',
  'Lovely',
  'Amazing!',
  'Golly',
  'Gawsh!',
  'Awesome!',
  'Neat',
  'Fresh!',
  'Sweet!',
  'Tight!',
  'Aiight',
  'Awww Yeah!',
  'Splendid',
  'Spectacular',
  'Indubitably',
  'Sublime',
  'Miraculous!',
  'Fantabulous',
  'Stupendulous!',
  'Gramazing',
  'Superific!',
  'Awesomazing',
  'Awesomezors',
  'Magnilliant',
  'Awesome Sauce',
  'Ridonkulous!',
  'Cray Cray',
  'Splentaculous!',
  'Brill!',
  'coolcoolcool',
  'Seriously?',
  'Me Gusta!',
  'Not Bad!',
  'Fuuuuuhhhhh!',
  'OMG!',
  'No way!',
  'Wow!',
  'Brilliant.',
  'Thanks!',
  'I can haz upgrade.',
  'True Story!',
  'You don’t say?',
  'WAT?!',
  'Kowabunga!',
  'Hot Damn!',
  'Yeah you did',
  'Well I’ll be ...',
  'Groovy baby!',
  'Oh you!',
  'Huzzah!',
  'Niiiiiice!',
  'Thanks, Kump!',
  'Great scott!',
  'Hot cherries!',
  'Bump it!',
  'Like A Boss!',
  'Impossibru!',
  'Yowza!',
  'I say!',
  'Tut Tut!',
  'Glorious!',
  'Rad!',
  'Inconceivable!',
  'S(iiiii)ick!',
  'Unbelievable!',
  'That’s hot',
  'Wicked!',
  'Tiiriffic',
  'Crazy',
  'Win!',
  'Holy Moly!',
  'Sugoi!',
]);

export const REVEAL_FADE_MS = 200;
/** showPurchase 339-347: the bought card's zoom before the reveal. */
export const CARD_ZOOM_MS = 300;
/** setItem: the item icon's size. */
export const ITEM_WH = 90;
/** The card art layers' frame (build-imagination.mjs: 230 x 310). */
export const CARD_FRAME = Object.freeze({ w: 230, h: 310 });
/** The art may grow to twice its own size (as the moment card caps small art), never more. */
export const ART_MAX_SCALE = 2;

/**
 * The button's label picker (setCloseButton): a random first label, then each next one in turn.
 * @param {() => number} rng a [0, 1) source
 */
export function createLabelPicker(rng = Math.random) {
  let index = -1;
  return {
    next() {
      if (index === -1) index = Math.min(BT_LABELS.length - 1, Math.floor(rng() * BT_LABELS.length));
      else index = (index + 1) % BT_LABELS.length;
      return BT_LABELS[index];
    },
    get index() {
      return index;
    },
  };
}

/**
 * What the reveal shows for a bought card.
 * @param {{ name?: string, desc?: string, notes?: string[], config?: object, artBase?: string }} card
 */
export function revealContent({ name = '', desc = '', notes = [], config = {}, artBase = 'assets/imagination/cards/' } = {}) {
  const keepable = config.bg === 'keepable';
  // setItem 305: an item shows only for a card that is not a keepable (every item card in the
  // data is a keepable today, so this stays empty until one is not).
  const item = config.item_tsid && !keepable ? String(config.item_tsid) : '';
  return {
    gotIt: 'Got it!',
    title: String(name || 'Upgrade'),
    desc: String(desc || ''),
    notes: (notes || []).filter(Boolean).map(String),
    art: config.art ? `${artBase}art_${config.art}.svg` : '',
    keepable,
    item,
    itemIcon: item ? `assets/sprites/icons/${item}.webp` : '',
  };
}

/**
 * The play area the reveal fills, in #game-root px. `view` is the location viewport (the canvas
 * above the pack, game.js locationViewRect). Classic fills it all, as the client did. Modern covers
 * the whole game window, top bar, pack and Social rail included (Austin 2026-11-15: like the other
 * award moments), so nothing of the HUD shows through.
 */
export function playAreaRect({ view = null, classic = false, rootW = 0, rootH = 0, topBarBottom = 0, insetL = 0, insetR = 0, gap = 8 } = {}) {
  const base = view && view.width > 0 && view.height > 0
    ? view
    : { left: 0, top: 0, width: Math.max(0, rootW), height: Math.max(0, rootH) };
  if (classic) return { left: Math.round(base.left), top: Math.round(base.top), width: Math.round(base.width), height: Math.round(base.height) };
  const w = rootW || base.left + base.width;
  const h = rootH || base.top + base.height;
  return { left: 0, top: 0, width: Math.max(0, Math.round(w)), height: Math.max(0, Math.round(h)) };
}

/** The art's own box inside the card frame, padded a little; the whole frame when unknown. */
export function artViewBox(box, pad = 4) {
  if (!box || !(box.width > 0) || !(box.height > 0)) return { x: 0, y: 0, w: CARD_FRAME.w, h: CARD_FRAME.h };
  return {
    x: Math.floor(box.x - pad),
    y: Math.floor(box.y - pad),
    w: Math.ceil(box.width + pad * 2),
    h: Math.ceil(box.height + pad * 2),
  };
}

const CSS = `
.img-reveal{position:absolute;z-index:var(--z-screen);box-sizing:border-box;display:flex;overflow:hidden auto;overscroll-behavior:contain;
  border-radius:0;padding:var(--safe-t,0px) var(--safe-r,0px) var(--safe-b,0px) var(--safe-l,0px);background:color-mix(in srgb,var(--c-sky-88) 72%,transparent);
  -webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);box-shadow:var(--shadow-3);opacity:0;transition:opacity ${REVEAL_FADE_MS}ms linear;font-family:var(--font-round);color:var(--text);text-align:center}
.img-reveal[hidden]{display:none!important}
.img-reveal.is-shown{opacity:1}
/* Austin 2026-11-15: the street shows faintly through, as behind the other award moments; the clouds at half strength. */
.img-reveal::before{content:"";position:absolute;inset:0;background:url(assets/classic/repeating_clouds.webp) 0 0 / 204px 156px repeat;opacity:.5;pointer-events:none}
.img-reveal.is-keepable{background:color-mix(in srgb,var(--c-white) 86%,transparent)}
.img-reveal.is-keepable::before{display:none}
.img-reveal-col{position:relative;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;gap:var(--sp-4);width:100%;max-width:40rem;height:100%;margin:0 auto;padding:var(--sp-8) var(--sp-8)}
.img-reveal-col > :first-child{margin-top:auto}
.img-reveal-col > :last-child{margin-bottom:auto}
.img-reveal-col > *{flex:none;max-width:100%}
/* The art's glow is a filter (its own layer, painted after the flow): the words sit above it. */
.img-reveal-col > :not(.img-reveal-art){position:relative;z-index:var(--z-raised)}
.img-reveal-got{margin:0;font-size:clamp(var(--fs-lg),2.4vmin,var(--fs-2xl));font-weight:var(--fw-heavy);letter-spacing:.02em;color:var(--c-sky-41);
  text-shadow:0 1px 0 var(--c-white)}
.img-reveal-title{margin:0;font-size:clamp(var(--fs-2xl),4.6vmin,var(--fs-5xl));font-weight:900;line-height:var(--lh-tight);color:var(--text);
  overflow-wrap:anywhere;text-wrap:balance;text-shadow:0 1px 0 var(--c-white)}
.img-reveal-art{flex:0 1 calc(var(--art-h, 155px) * 2);min-height:4.5rem;width:100%;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity ${REVEAL_FADE_MS}ms linear}
.img-reveal-art.is-ready{opacity:1}
.img-reveal-art svg{display:block;width:100%;height:100%;max-width:calc(var(--art-w, 115px) * 2);overflow:visible;
  filter:drop-shadow(0 4px 3px color-mix(in srgb, var(--c-black) 20%, transparent)) drop-shadow(0 0 1.5rem color-mix(in srgb, var(--c-white) 80%, transparent)) drop-shadow(0 0 3rem color-mix(in srgb, var(--c-white) 55%, transparent))}
.img-reveal.is-keepable .img-reveal-art svg{filter:none}
.img-reveal-desc{margin:0;max-width:34rem;font-size:clamp(var(--fs-base),2.2vmin,var(--fs-xl));font-weight:var(--fw-bold);line-height:var(--lh-normal);color:var(--text);
  overflow-wrap:anywhere;text-shadow:0 1px 0 var(--c-white)}
.img-reveal-note{margin:0;max-width:34rem;font-size:var(--fs-md);font-weight:var(--fw-bold);line-height:var(--lh-normal);color:var(--text-muted);text-shadow:0 1px 0 var(--c-white)}
.img-reveal-item{display:flex;align-items:center;justify-content:center;gap:var(--sp-6);font-weight:var(--fw-heavy);font-size:var(--fs-lg)}
.img-reveal-item img{width:${ITEM_WH}px;height:${ITEM_WH}px;object-fit:contain;filter:drop-shadow(0 4px 3px color-mix(in srgb, var(--c-black) 20%, transparent))}
.img-reveal-btn{min-height:44px;min-width:8rem;margin-top:var(--sp-2);padding:0 var(--space-5);border:0;border-radius:var(--radius-pill);background:var(--accent);
  box-shadow:var(--shadow-1);color:var(--accent-text);font:inherit;font-size:var(--fs-lg);font-weight:var(--fw-heavy);cursor:pointer}
.img-reveal-btn:hover,.img-reveal-btn:focus-visible{background:var(--accent-hover)}
.img-reveal-btn:focus-visible{outline:2px solid var(--focus);outline-offset:3px}
@media (max-height:520px){.img-reveal-col{gap:var(--sp-2);padding:var(--sp-5) var(--sp-6)}.img-reveal-art{min-height:3.5rem}.img-reveal-btn{min-height:40px;margin-top:0}}
@media (prefers-reduced-motion: reduce){.img-reveal,.img-reveal-art{transition:none}}
`;

const SVG_NS = 'http://www.w3.org/2000/svg';
const boxCache = new Map();

/**
 * Measure where a card art layer paints inside its 230 x 310 frame (the layers are whole-card
 * frames, and many hold an invisible full-frame shape, so the SVG's own bbox is the frame): the
 * art drawn once on a small canvas, its opaque pixels' box. Cached per url.
 */
export function measureArt(doc, url) {
  if (!url || !doc) return Promise.resolve(null);
  if (boxCache.has(url)) return boxCache.get(url);
  const p = new Promise((resolve) => {
    try {
      const img = new (doc.defaultView?.Image || Image)();
      img.decoding = 'async';
      img.onerror = () => resolve(null);
      img.onload = () => {
        try {
          const { w, h } = CARD_FRAME;
          const canvas = doc.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const g = canvas.getContext('2d', { willReadFrequently: true });
          g.drawImage(img, 0, 0, w, h);
          resolve(opaqueBox(g.getImageData(0, 0, w, h).data, w, h));
        } catch {
          resolve(null);
        }
      };
      img.src = url;
    } catch {
      resolve(null);
    }
  });
  boxCache.set(url, p);
  return p;
}

/** The box of the pixels whose alpha passes `min` in RGBA data (null for none). */
export function opaqueBox(data, w, h, min = 16) {
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] < min) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

/**
 * The reveal view.
 * @param {{
 *   document: Document,
 *   mount?: () => Element | null,
 *   rect?: () => { left: number, top: number, width: number, height: number } | null,
 *   onClose?: () => void,
 *   setData?: (key: string, value: string) => void,
 * }} opts
 */
export function createImgReveal(opts) {
  const doc = opts.document;
  const win = doc.defaultView;
  const setData = opts.setData || (() => {});
  let root = null;
  let open = false;
  let hideTimer = 0;
  let token = 0;

  function build() {
    if (root) return;
    if (!doc.getElementById('img-reveal-css')) {
      const style = doc.createElement('style');
      style.id = 'img-reveal-css';
      style.textContent = CSS;
      doc.head.appendChild(style);
    }
    root = doc.createElement('div');
    root.id = 'img-reveal';
    root.className = 'img-reveal';
    root.hidden = true;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'img-reveal-title');
    root.addEventListener('click', (e) => {
      e.stopPropagation();
      if (e.target.closest('[data-img-continue]')) opts.onClose?.();
    });
    root.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  function place() {
    if (!root || root.hidden) return;
    const r = opts.rect?.();
    if (!r || !(r.width > 0) || !(r.height > 0)) {
      Object.assign(root.style, { left: '0px', top: '0px', width: '100%', height: '100%' });
    } else {
      Object.assign(root.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    }
  }

  function node(tag, cls, text) {
    const n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }

  function fillArt(holder, url, mine) {
    if (!url) {
      holder.hidden = true;
      return;
    }
    const svg = doc.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const img = doc.createElementNS(SVG_NS, 'image');
    img.setAttribute('href', url);
    img.setAttribute('width', String(CARD_FRAME.w));
    img.setAttribute('height', String(CARD_FRAME.h));
    svg.appendChild(img);
    holder.appendChild(svg);
    const apply = (box) => {
      if (mine !== token) return;
      const vb = artViewBox(box);
      svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
      // The art's own size in CSS px; it grows to ART_MAX_SCALE times that at most.
      holder.style.setProperty('--art-w', `${vb.w}px`);
      holder.style.setProperty('--art-h', `${vb.h}px`);
      holder.classList.add('is-ready');
      setData('imgRevealArt', `${vb.x},${vb.y},${vb.w},${vb.h}`);
    };
    // Unmeasured art shows whole after a beat rather than never.
    const fallback = win?.setTimeout?.(() => apply(null), 600);
    measureArt(doc, url).then((box) => {
      win?.clearTimeout?.(fallback);
      if (!holder.classList.contains('is-ready')) apply(box);
    });
  }

  function show(content, { label = BT_LABELS[0] } = {}) {
    build();
    win?.clearTimeout?.(hideTimer);
    const mine = ++token;
    root.replaceChildren();
    root.classList.toggle('is-keepable', Boolean(content.keepable));
    const col = node('div', 'img-reveal-col');
    col.appendChild(node('p', 'img-reveal-got', content.gotIt || 'Got it!'));
    const title = node('h2', 'img-reveal-title', content.title);
    title.id = 'img-reveal-title';
    col.appendChild(title);
    const art = node('div', 'img-reveal-art');
    col.appendChild(art);
    if (content.desc) col.appendChild(node('p', 'img-reveal-desc', content.desc));
    for (const note of content.notes || []) col.appendChild(node('p', 'img-reveal-note', note));
    if (content.item) {
      const item = node('div', 'img-reveal-item');
      item.appendChild(node('span', '', 'And also:'));
      const icon = node('img');
      icon.src = content.itemIcon;
      icon.alt = '';
      item.appendChild(icon);
      col.appendChild(item);
    }
    const btn = node('button', 'img-reveal-btn', label);
    btn.type = 'button';
    btn.dataset.imgContinue = '1';
    col.appendChild(btn);
    root.appendChild(col);
    (opts.mount?.() || doc.body).appendChild(root);
    root.hidden = false;
    open = true;
    place();
    fillArt(art, content.art, mine);
    root.classList.remove('is-shown');
    // Force the start state so the fade runs (show 218-220).
    void root.offsetWidth;
    root.classList.add('is-shown');
    btn.focus({ preventScroll: true });
    win?.addEventListener?.('resize', place);
    setData('imgReveal', `${content.title}|${label}`);
    return btn;
  }

  function hide({ immediate = false } = {}) {
    if (!root || !open) return false;
    open = false;
    token++;
    win?.removeEventListener?.('resize', place);
    root.classList.remove('is-shown');
    setData('imgReveal', '');
    const done = () => {
      if (!open && root) root.hidden = true;
    };
    win?.clearTimeout?.(hideTimer);
    if (immediate) done();
    else hideTimer = win?.setTimeout?.(done, REVEAL_FADE_MS) ?? 0;
    return true;
  }

  return {
    show,
    hide,
    place,
    isOpen: () => open,
    element: () => root,
  };
}
