/**
 * Reward slugs: the little icon badges under a speech bubble when a tree,
 * animal or rock answers a verb (Tiny Speck's client, CC0):
 *
 * - LisChatBubbleManager.as 57-90: msg.rewards becomes one Slug per reward
 *   that is not an item and not 0, laid out left to right 4 px apart,
 *   wrapping at the bubble's width, then each slug runs SlugAnimator.
 * - item.js sendBubble 587-594 (GSJS): the server renames slugs.xp to
 *   imagination, so a bubble's iMG slug is the imagination slug.
 * - SortTools.as 96: the intended order is xp (iMG), energy, mood,
 *   currants, favor, items.
 * - Slug.as: 21 px tall, the amount's sign and number then the icon
 *   (161-171), the type's fill with a 2 px white border (50-68, 179-182),
 *   12 px corners, 4 px on the energy slug's right side (40-41, 174),
 *   '+' above 0 and '-' below (134, 161).
 * - SlugAnimator.as 57-156: one slug at a time, the first after 0.4 s; its
 *   amount grows to 3x over 0.4 s, then at 0.5 s flies to the stat it feeds
 *   while shrinking to 0.4x over 0.3 s; the slug's own text is dimmed to 0.5
 *   meanwhile.
 *
 * The icons are our vector redraws, matched by eye to the client's PNGs
 * TSEngineAssets/src/assets/graphics/slug_{mood,energy,imagination,xp,
 * currants,favor}_{pos,neg}.png (Assets.as 673-684), so they stay crisp at
 * any device pixel ratio. Only mood and energy have separate loss art.
 */

/** SortTools.as 96. */
export const SLUG_ORDER = Object.freeze(['imagination', 'xp', 'energy', 'mood', 'currants', 'favor']);

/** Slug.as 50-64 fills (the losses share the gain fill except mood and energy); text colours are ours. */
export const SLUG_STYLES = Object.freeze({
  imagination: Object.freeze({ pos: 0xccaedb, neg: 0xccaedb, text: 0x5a3a78, textNeg: 0x5a3a78, label: 'iMG' }),
  xp: Object.freeze({ pos: 0xc7dce0, neg: 0xc7dce0, text: 0x1f6874, textNeg: 0x1f6874, label: 'xp' }),
  energy: Object.freeze({ pos: 0xc1d76e, neg: 0xefc6c1, text: 0x3f5c14, textNeg: 0xa2382c, label: 'energy' }),
  mood: Object.freeze({ pos: 0xc1d76e, neg: 0xefc6c1, text: 0x3f5c14, textNeg: 0xa2382c, label: 'mood' }),
  currants: Object.freeze({ pos: 0xd4c6a3, neg: 0xd4c6a3, text: 0x5a4106, textNeg: 0x5a4106, label: 'currants' }),
  favor: Object.freeze({ pos: 0xebccd6, neg: 0xebccd6, text: 0x742141, textNeg: 0x742141, label: 'favor' }),
});

/** Slug.as 36-46, 67-68; LisChatBubbleManager.as 65 (padd). */
export const SLUG_LAYOUT = Object.freeze({
  height: 21,
  cornerRadius: 12,
  energyCornerRadius: 4,
  leftPadding: 5,
  signGap: 2,
  iconGap: 4,
  borderWidth: 2,
  borderColor: 0xffffff,
  rowGap: 4,
  fontSize: 12,
});

/** The client PNGs' sizes (width, height), which the redraws keep. */
export const SLUG_ICON_SIZES = Object.freeze({
  mood: Object.freeze([17, 17]),
  energy: Object.freeze([20, 15]),
  imagination: Object.freeze([14, 13]),
  xp: Object.freeze([17, 17]),
  currants: Object.freeze([17, 17]),
  favor: Object.freeze([12, 12]),
});

/** SlugAnimator.as 63, 135-136 (TSTweener's default ease is easeOutExpo). */
export const SLUG_ANIMATION = Object.freeze({
  firstDelayMs: 400,
  growMs: 400,
  flyAtMs: 500,
  flyMs: 300,
  growScale: 3,
  endScale: 0.4,
  dimAlpha: 0.5,
  ease: 'cubic-bezier(0.19, 1, 0.22, 1)',
});

/** Where each slug's amount flies (SlugAnimator.as 110-132): the HUD element ids, or the avatar. */
export const SLUG_TARGETS = Object.freeze({
  imagination: 'stat-img',
  xp: 'stat-xp',
  energy: 'bar-energy',
  mood: 'bar-mood',
  currants: 'stat-currants',
  favor: null,
});

const whole = (v) => {
  const n = Math.round(Number(v) || 0);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Signed verb effects ({ energy, mood, img|xp, currants, favor }, as runVerb
 * returns them, the amounts actually applied) -> the bubble's slugs, in the
 * keys the remake's bubbles take: xp, energy (spent, above 0), energyGain,
 * mood, moodLoss, currants, favor. Items never get a slug in a bubble
 * (LisChatBubbleManager.as 72). Returns null when nothing moved.
 */
export function slugsFromEffects(effects) {
  if (!effects) return null;
  const out = {};
  const xp = whole(effects.img || effects.xp || effects.imagination);
  if (xp) out.xp = xp;
  const energy = whole(effects.energy);
  if (energy < 0) out.energy = -energy;
  else if (energy > 0) out.energyGain = energy;
  const mood = whole(effects.mood);
  if (mood > 0) out.mood = mood;
  else if (mood < 0) out.moodLoss = -mood;
  const currants = whole(effects.currants);
  if (currants) out.currants = currants;
  if (Array.isArray(effects.favor)) {
    const favor = effects.favor
      .map((f) => ({ giant: String(f?.giant || ''), points: whole(f?.points) }))
      .filter((f) => f.points);
    if (favor.length) out.favor = favor;
  } else if (whole(effects.favor)) {
    out.favor = whole(effects.favor);
  }
  return Object.keys(out).length ? out : null;
}

/**
 * A bubble's slugs -> the slugs to draw, in the client's order:
 * [{ type, amount, giant? }]. Takes the remake's keys (xp or imagination,
 * energy = spent, energyGain, mood, moodLoss, currants, favor as a number or
 * [{ giant, points }]); zero amounts are dropped (Slug.as 118).
 */
export function speechSlugList(slugs) {
  if (!slugs || typeof slugs !== 'object') return [];
  const out = [];
  const add = (type, amount, extra = null) => {
    const n = whole(amount);
    if (n) out.push(extra ? { type, amount: n, ...extra } : { type, amount: n });
  };
  add('imagination', slugs.imagination ?? slugs.xp);
  add('energy', whole(slugs.energyGain) - Math.abs(whole(slugs.energy)));
  add('mood', whole(slugs.mood) - Math.abs(whole(slugs.moodLoss)));
  add('currants', slugs.currants);
  if (Array.isArray(slugs.favor)) {
    for (const f of slugs.favor) add('favor', f?.points, f?.giant ? { giant: String(f.giant) } : null);
  } else {
    add('favor', slugs.favor);
  }
  return out.sort((a, b) => SLUG_ORDER.indexOf(a.type) - SLUG_ORDER.indexOf(b.type));
}

/** '+' above 0, '-' below, the number without its sign (Slug.as 134-135, 161-162). */
export function slugSign(amount) {
  return Number(amount) > 0 ? '+' : '-';
}

export function slugNumber(amount) {
  return Math.abs(whole(amount)).toLocaleString('en-US');
}

/** "imagination:+7,energy:-3,mood:+4" for the canvas QA attribute. */
export function formatSlugList(list) {
  return (list || []).map((s) => `${s.type}:${slugSign(s.amount)}${slugNumber(s.amount)}${s.giant ? `@${s.giant}` : ''}`).join(',');
}

/** The raw slugs as "k=v" pairs (favor lists as giant:points|...), kept for data-last-speech-slugs. */
export function formatRawSlugs(slugs) {
  if (!slugs || typeof slugs !== 'object') return '';
  return Object.entries(slugs).map(([k, v]) => {
    if (Array.isArray(v)) return `${k}=${v.map((f) => `${f?.giant || ''}:${whole(f?.points)}`).join('|')}`;
    return `${k}=${v}`;
  }).join(',');
}

/**
 * One slug's box (Slug.as 157-182): widths of the sign and number text in,
 * x of each part and the pill's size out.
 */
export function slugBox(type, signWidth, numberWidth) {
  const [iconW, iconH] = SLUG_ICON_SIZES[type] || [16, 16];
  const L = SLUG_LAYOUT;
  const gap = (L.height - iconH) / 2;
  const signX = L.leftPadding;
  const numberX = signX + signWidth + L.signGap;
  const iconX = Math.round(numberX + numberWidth + L.iconGap);
  const iconY = Math.floor(gap);
  const width = Math.round(iconX + iconW + gap);
  return {
    signX,
    numberX,
    iconX,
    iconY,
    width,
    height: L.height,
    rightRadius: type === 'energy' ? L.energyCornerRadius : L.cornerRadius,
  };
}

/** Rows of slugs inside maxWidth, 4 px apart (LisChatBubbleManager.as 69-83). */
export function layoutSlugRow(widths, maxWidth) {
  const L = SLUG_LAYOUT;
  const at = [];
  let x = 0;
  let y = 0;
  let width = 0;
  for (const w of widths) {
    if (x > 0 && x + w > maxWidth) {
      x = 0;
      y += L.height + L.rowGap;
    }
    at.push({ x, y });
    width = Math.max(width, x + w);
    x += w + L.rowGap;
  }
  return { at, width, height: widths.length ? y + L.height : 0 };
}

/** A rounded rect with its own left and right corner radii (drawRoundRectComplex, Slug.as 181). */
export function slugPillPath(g, w, h, left, right) {
  const l = Math.min(left, h / 2, w / 2);
  const r = Math.min(right, h / 2, w / 2);
  g.moveTo(l, 0)
    .lineTo(w - r, 0)
    .arcTo(w, 0, w, r, r)
    .lineTo(w, h - r)
    .arcTo(w, h, w - r, h, r)
    .lineTo(l, h)
    .arcTo(0, h, 0, h - l, l)
    .lineTo(0, l)
    .arcTo(0, 0, l, 0, l)
    .closePath();
  return g;
}

function star(cx, cy, outer, inner, points = 5) {
  const out = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    out.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  return out;
}

/**
 * Draw one slug icon into a Pixi Graphics at (0,0), at the PNG's size.
 * Redrawn from slug_<type>_<pos|neg>.png (Tiny Speck, CC0).
 */
export function drawSlugIcon(g, type, negative = false) {
  if (type === 'mood') {
    // slug_mood_pos.png: a green face, two upright eyes, a toothy grin;
    // slug_mood_neg.png: the same face in red with a grimace.
    const face = negative ? 0xdd4a2e : 0x95bc09;
    const rim = negative ? 0x97211e : 0x5e7704;
    const dark = negative ? 0x89181b : 0x556c03;
    g.circle(8.5, 8.9, 8).fill({ color: rim });
    g.circle(8.5, 8.4, 7.7).fill({ color: face });
    g.roundRect(5, 4.4, 2.2, 3.4, 0.8).fill({ color: dark });
    g.roundRect(9.8, 4.4, 2.2, 3.4, 0.8).fill({ color: dark });
    if (negative) {
      g.poly([4.6, 13, 5.2, 10, 11.8, 10, 12.4, 13]).fill({ color: dark });
      g.roundRect(5.4, 10.2, 6.2, 1.6, 0.5).fill({ color: 0xf3d9d1 });
      g.rect(5.6, 12, 5.8, 0.6).fill({ color: 0xc03927 });
    } else {
      g.poly([4.2, 10, 12.8, 10, 11.6, 12.6, 8.5, 13.6, 5.4, 12.6]).fill({ color: dark });
      g.roundRect(5, 10.2, 7, 1.6, 0.5).fill({ color: 0xf4f8e2 });
    }
    return g;
  }
  if (type === 'energy') {
    // slug_energy_{pos,neg}.png: a battery with a thick frame and a lighter
    // face, a dark lightning bolt across it.
    const frame = negative ? 0xdd4a2e : 0x95bc09;
    const shade = negative ? 0x842c1b : 0x597005;
    const face = negative ? 0xe46e58 : 0xb5d053;
    const bolt = negative ? 0x7c051e : 0x597005;
    g.roundRect(0.5, 1, 19, 14, 3).fill({ color: shade });
    g.roundRect(0.5, 0.5, 19, 13.6, 3).fill({ color: frame });
    g.roundRect(3, 2.6, 14, 9.2, 1.4).fill({ color: face });
    g.poly([13.4, 2.4, 9.4, 7.3, 11.2, 7.3, 7.2, 12.2, 8.2, 12.2, 13, 6.5, 11.1, 6.5, 14.4, 2.4]).fill({ color: bolt });
    g.moveTo(13.9, 2.9).lineTo(11.6, 6).stroke({ width: 0.8, color: 0xffffff, alpha: 0.55 });
    return g;
  }
  if (type === 'imagination') {
    // slug_imagination_*.png: a purple rounded pentagon with a pale "i".
    const pent = [7, 0.8, 13.3, 5.1, 11.2, 12.3, 2.8, 12.3, 0.7, 5.1];
    g.poly(pent).fill({ color: 0x8a5fa0 }).stroke({ width: 1.2, color: 0x8a5fa0, join: 'round' });
    g.poly([2.8, 12.3, 11.2, 12.3, 11.8, 10.4, 2.2, 10.4]).fill({ color: 0x7a5090, alpha: 0.7 });
    g.circle(7, 3.6, 1.25).fill({ color: 0xeedcf5 });
    g.roundRect(6, 5.6, 2, 5, 0.5).fill({ color: 0xeedcf5 });
    return g;
  }
  if (type === 'xp') {
    // slug_xp_*.png: a teal disc with a white "xp".
    g.circle(8.5, 8.7, 8).fill({ color: 0x2e7e8c });
    g.circle(8.5, 8.4, 7.8).fill({ color: 0x3797a8 });
    g.moveTo(3.3, 6.4).lineTo(7.1, 10.8).moveTo(7.1, 6.4).lineTo(3.3, 10.8)
      .stroke({ width: 1.7, color: 0xffffff, cap: 'round' });
    g.moveTo(9.4, 6.4).lineTo(9.4, 13.2).stroke({ width: 1.6, color: 0xffffff, cap: 'round' });
    g.circle(11.5, 8.5, 2).stroke({ width: 1.5, color: 0xffffff });
    return g;
  }
  if (type === 'currants') {
    // slug_currants_*.png: a brown coin with a cream C.
    g.circle(8.5, 8.6, 8.1).fill({ color: 0x5c4205 });
    g.circle(8.5, 8.4, 7.6).fill({ color: 0x7a5a0c });
    g.circle(8.5, 8.4, 6.2).fill({ color: 0x8e6c18 });
    g.circle(8.5, 8.6, 2.2).fill({ color: 0xa8916a, alpha: 0.8 });
    g.arc(8.5, 8.6, 3.9, Math.PI * 0.3, Math.PI * 1.7).stroke({ width: 2.3, color: 0xe7e1d2, cap: 'round' });
    return g;
  }
  if (type === 'favor') {
    // slug_favor_*.png: a maroon star.
    g.poly(star(6, 6.5, 5.9, 2.6)).fill({ color: 0x651c39 }).stroke({ width: 0.9, color: 0x651c39, join: 'round' });
    g.poly(star(6, 6.2, 3.2, 1.4)).fill({ color: 0x7a2c4c, alpha: 0.6 });
    return g;
  }
  return g;
}
