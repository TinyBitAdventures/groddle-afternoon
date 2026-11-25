/**
 * PHONE LAYOUT (G1194, root R1; Austin 2026-11-23: direction C, Glitch-like compact): the phone's
 * HUD as named screen regions, and one layout pass that puts every piece in its region, instead of
 * each piece placing itself against a few neighbours (the cause behind R1's overlaps: notices on the
 * street pill, the actions pill growing into the stats, sheets over the HUD and the controls, an
 * open bag over the avatar).
 *
 * Today's layout stays (Glitch's: stats top left, the pack row along the bottom, the stick, Act and
 * Jump), in fixed regions (phoneRegions, pure):
 * - strip: one top row: the stats pill at the left, and at the right a pill of four fixed icons:
 *   Full screen, Report a problem, Social (with its badge: chat and IMs, socialPillCount) and the Menu (installPhonePill). The pill
 *   never grows: Quests, Sound, Make and the rest are rows of the Menu, and so is anything new;
 * - caption: the street's name as a plain caption under the stats (between the pills sideways),
 *   with the street map's button on it, instead of a second row of pill, and favor with the
 *   street's Giant at its end, so the stats keep room for whole counts (#595);
 * - homes: at home (the street, the house, its yard, a Tower floor) the home's buttons (Decorate,
 *   Cultivate, Change Style), or Decoration Mode's banner while it is open: a row under the caption at
 *   the left, the buttons wrapping in it, the buff strip under it (Austin's iPhone 2026-11-24);
 * - play: a game's or a room's own bar while it shows (a party's clock and Leave party, a quest room's
 *   card and the caption under its pill, Game of Crowns' board and clock, a race's board and Leave race):
 *   top centre under the caption, the home's row and the buffs, one under another, the notices under
 *   them (G1247: each had a fixed top from before layout C that never took the status bar inset);
 * - notices: the top-centre stack under the caption, down to the controls, the pinned quest or the
 *   open sheet; notices, tips and toasts go here and never land on the strip (js/notify-view.js
 *   `region`);
 * - pin: the first pinned quest, a small card bottom left: upright just above the pack row, under the
 *   stick, which stands up the card's height (G1307, #653, a player's idea: over the stick it covered
 *   the street), beside the stick sideways, clear of its ring (the float stick's ring too,
 *   stickRegionOf); a tap opens its quest in Quests, as the old pin did (G1230);
 * - stick, act, jump: the touch controls, on the pack row;
 * - snap: Camera Mode's round Snap button (G1314, features/camera-mode-feature.js; the controls step
 *   aside while looking): upright at the right over Act and Jump, sideways left of Act at Jump's foot
 *   (style.css), clear of Done and the whole-house button in the middle; the notices keep above it;
 * - pack: the pack row (measured where js/ui/pack-row.js centres it);
 * - sheet: the room one open sheet takes. The Map takes the whole height (sideways the whole
 *   screen, its header floating over it); Quests, Social, the Menu and the other side sheets dock
 *   above the pack row upright and in a column at the left sideways; an open bag's tray is a sheet
 *   too. Only one is open at a time: one that opens closes the others.
 *
 * While a sheet or an open bag covers the bottom of the street, the street fits the room it leaves
 * (engine.setStageDock, generalised from the house picker, G1178), so the avatar stays in view.
 *
 * Phones only (html.touch-phone), Modern only: the Classic interface keeps its own phone look, and
 * computers and tablets never mount this. The sheets keep their own buttons, closers and ids (every
 * QA hook keeps working); this module only watches them. A new idea, not Glitch's: Glitch had no
 * phone layout.
 *
 * QA: html.phone-layout, data-phone-sheet (map | half | bag | ""), canvas data phoneRegions (the
 * regions as JSON) and phoneDock.
 */

/** Region sizes in CSS px: the strip's height (the HUD pills'), the caption's. */
export const STRIP_H = 44;
export const CAPTION_H = 26;
/**
 * A thumb-tall hit area: favor and the street map's button on the caption take taps 44 px tall,
 * centred on it (style.css #favor-stat::before), taller than the caption itself (G1222).
 */
export const TAP_H = 44;
/** The gap between regions, and the edge inset. */
export const GAP = 6;
export const EDGE = 8;
/** An upright half sheet takes this share of the room between the caption and the pack row. */
export const HALF_SHARE = 0.6;
/** A sideways column's width, leaving the street at least STREET_MIN_W beside it. */
export const COLUMN_W = 360;
export const STREET_MIN_W = 240;
/** The touch controls (style.css TOUCH): the stick's box, Jump and Act, and their insets. */
export const STICK = 132;
export const JUMP = 76;
export const ACT = 60;
/** The pack row's band when it cannot be measured, and the pinned quest card's widest. */
export const PACK_H = 72;
export const PIN_W = 200;

/**
 * G1247: the bars a game or a room puts top centre, in the order they stack: a party's (party-spaces),
 * a quest room's card (quest-instances, when the quest pill hasn't folded it) and the caption under the
 * pill (quest-plate), Game of Crowns' board and clock, a race's board and Leave race.
 */
export const PLAY_PIECES = Object.freeze([
  ['party', '#party-hud'],
  ['qroom', '#quest-instance-hud'],
  ['qcap', '#quest-caption'],
  ['crowns', '#crowns-hud'],
  ['race', '#race-hud'],
]);

/** The four icons of the pill, in order (installPhonePill); nothing else shows on it (Full screen hides where it has no use). */
export const PILL_IDS = Object.freeze(['fullscreen-btn', 'bug-btn', 'social-btn', 'more-btn']);

const box = (left, top, right, bottom) => ({ left: Math.round(left), top: Math.round(top), right: Math.round(right), bottom: Math.round(bottom) });
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

/**
 * PURE: the phone's regions for a window `width` x `height` (CSS px). `safe` the safe-area insets;
 * `sheet` the open sheet ('' | 'map' | 'half' | 'bag'); `pack` the pack row's box (null: the
 * fallback band, centred; `packShown: false` none, the tutorial's); `bagTop` the open bag tray's
 * top; `caption` and `pin` the measured { w, h } of the street's caption and the pinned quest card
 * (pin null when nothing is pinned; null in the result when it has no room clear of the controls);
 * `controls` the measured { stick, act, jump } boxes where the page has them; `captionUnder` whether the caption sits under the strip (upright,
 * and sideways when the pills leave it no room: topbar.js .is-under); `buffs` the buff strip's measured
 * { w, h } (null when no buff shows). Returns { upright, strip, caption, homes, buffs, notices, pin, stick, act,
 * jump, pack, sheet, dock } (boxes { left, top, right, bottom }, null where a piece has no room or
 * is covered; dock is what engine.setStageDock takes). `buffs` is the buff strip's slot: under the
 * caption at the left, as tall as the strip (0 tall with no buff), the notices under it. `homes` the
 * measured { w, h } of the home's buttons row (Decorate, Cultivate, Change Style; or Decoration Mode's
 * banner), null when none shows: its slot `homes` is under the caption at the left, the buff strip
 * under it (null in the result when none shows). `snap` the measured box of Camera Mode's Snap button
 * (G1314) while it shows: the notices keep above it (`snap` in the result, null under a sheet).
 */
export function phoneRegions({ width, height, safe = {}, sheet = '', pack = null, packShown = true, bagTop = NaN, caption = null, captionUnder = null, pin = null, controls = null, buffs = null, homes = null, play = [], snap = null } = {}) {
  const W = Math.max(0, num(width));
  const H = Math.max(0, num(height));
  const st = Math.max(0, num(safe.t));
  const sr = Math.max(0, num(safe.r));
  const sb = Math.max(0, num(safe.b));
  const sl = Math.max(0, num(safe.l));
  const upright = H > W;
  const kind = ['map', 'half', 'bag'].includes(sheet) ? sheet : '';
  const strip = box(sl + EDGE, st + 4, W - sr - EDGE, st + 4 + STRIP_H);
  let packBox = null;
  if (packShown) {
    packBox = pack && pack.bottom > pack.top
      ? box(pack.left, pack.top, pack.right, pack.bottom)
      : box(Math.max(sl + EDGE, W / 2 - 180), H - sb - PACK_H, Math.min(W - sr - EDGE, W / 2 + 180), H - sb);
  }
  const floor = packBox ? packBox.top : H - sb;
  // The caption: under the stats upright, centred between the pills sideways (in the strip's row).
  const capW = Math.min(Math.max(0, num(caption?.w, 160)), W - sl - sr - 2 * EDGE);
  const capH = Math.max(0, num(caption?.h, CAPTION_H)) || CAPTION_H;
  const capUnder = captionUnder == null ? upright : Boolean(captionUnder);
  let captionBox = capUnder
    ? box(strip.left, strip.bottom + 2, strip.left + capW, strip.bottom + 2 + capH)
    : box(W / 2 - capW / 2, strip.top + (STRIP_H - capH) / 2, W / 2 + capW / 2, strip.top + (STRIP_H + capH) / 2);
  const under = capUnder ? captionBox.bottom : strip.bottom;

  // The controls stand on the pack row; Act a little higher, beside Jump (style.css TOUCH, #327).
  // Where the page has them laid out (`controls`, measured), those win: the tutorial hides the pack row
  // but the controls keep standing on its band.
  const real = (b) => b && b.right > b.left && b.bottom > b.top;
  let base = floor - 4;
  if (real(controls?.stick)) base = Math.round(controls.stick.bottom);
  let stick = real(controls?.stick) ? box(controls.stick.left, controls.stick.top, controls.stick.right, controls.stick.bottom) : box(sl + EDGE, base - STICK, sl + EDGE + STICK, base);
  let jump = real(controls?.jump) ? box(controls.jump.left, controls.jump.top, controls.jump.right, controls.jump.bottom) : box(W - sr - 12 - JUMP, base - 12 - JUMP, W - sr - 12, base - 12);
  let act = real(controls?.act) ? box(controls.act.left, controls.act.top, controls.act.right, controls.act.bottom) : box(jump.left - 10 - ACT, base - 12 - 44 - ACT, jump.left - 10, base - 12 - 44);

  // The buff strip (Austin's iPhone 2026-11-24: a buff chip lay over the stats and the street's name):
  // its own slot under the caption (under the strip sideways) at the left, clear of the caption's taps
  // (G1222); the notices start under it. Its width is the row's; the chips wrap in it.
  const capTapsAt = Math.ceil((captionBox.top + captionBox.bottom) / 2 + TAP_H / 2);
  const rowTop = Math.max(under, capTapsAt) + GAP;
  const buffLeft = sl + EDGE;
  // The home's buttons (Austin's iPhone 2026-11-24, "Your House": Decorate, Cultivate and Change Style
  // stood over the stats and the icon pill, at a fixed top from before layout C): their own row first
  // under the caption at the left (under the strip sideways), the buttons wrapping in it; the buff
  // strip under them. Decoration Mode's banner takes the same row while it is open.
  const homesH = Math.max(0, num(homes?.h));
  const homesW = Math.max(0, Math.min(num(homes?.w), W - sr - EDGE - buffLeft));
  let homesBox = homesH > 0 && homesW > 0 ? box(buffLeft, rowTop, buffLeft + homesW, rowTop + homesH) : null;
  const buffTop = homesBox ? homesBox.bottom + GAP : rowTop;
  const buffH = Math.max(0, num(buffs?.h));
  const buffW = Math.max(0, Math.min(num(buffs?.w), W - sr - EDGE - buffLeft));
  let buffBox = box(buffLeft, buffTop, buffLeft + (buffH ? buffW : W - sr - EDGE - buffLeft), buffTop + buffH);
  const buffShown = buffH > 0 && buffW > 0;
  const buffFloor = buffShown ? buffBox.bottom : under;

  // The pinned quest: upright just above the pack row, under the stick, which stands up the card's height
  // to make room (G1307, #653, Austin 2026-11-25: a player's idea; over the stick it covered the street);
  // beside the stick sideways, clear of its ring. `stickUp` is how far the stick stands up (style.css).
  let pinBox = null;
  let stickUp = 0;
  if (pin && num(pin.h) > 0) {
    const pw = Math.min(PIN_W, Math.max(0, num(pin.w, PIN_W)));
    const ph = num(pin.h);
    let lifted = stick;
    if (upright) {
      pinBox = box(stick.left, base - ph, stick.left + pw, base);
      lifted = box(stick.left, pinBox.top - GAP - (stick.bottom - stick.top), stick.right, pinBox.top - GAP);
    } else pinBox = box(stick.right + GAP, base - ph, stick.right + GAP + pw, base);
    // No room clear of the controls, the caption or the pack row: it waits (hidden) rather than cover one,
    // and the stick stays on its band.
    const keep = [lifted, act, jump, packBox, captionBox, strip, buffShown ? buffBox : null, homesBox].filter(Boolean);
    const high = Math.min(pinBox.top, lifted.top);
    const tops = [captionBox, strip, buffShown ? buffBox : null, homesBox].filter(Boolean);
    if (high < Math.max(capUnder ? captionBox.bottom : strip.bottom, buffFloor) + GAP || keep.some((b) => boxesOverlap(pinBox, b)) || tops.some((b) => boxesOverlap(lifted, b))) pinBox = null;
    else if (lifted !== stick) {
      stickUp = stick.bottom - lifted.bottom;
      stick = lifted;
    }
  }

  let sheetBox = null;
  if (kind === 'map') sheetBox = upright ? box(0, strip.bottom + GAP, W, H) : box(0, 0, W, H);
  else if (kind === 'half') {
    if (upright) sheetBox = box(0, floor - GAP - Math.round((floor - GAP - under - GAP) * HALF_SHARE), W, floor - GAP);
    else sheetBox = box(0, strip.bottom + GAP, sl + Math.max(0, Math.min(COLUMN_W, W - sl - STREET_MIN_W)), floor - GAP);
  } else if (kind === 'bag' && Number.isFinite(Number(bagTop))) sheetBox = box(0, Number(bagTop), W, floor);
  const covered = kind !== '';
  let snapBox = real(snap) ? box(snap.left, snap.top, snap.right, snap.bottom) : null;
  if (covered) {
    stick = null;
    act = null;
    jump = null;
    pinBox = null;
    snapBox = null;
  }
  // The Map covers the caption (and, sideways, the strip and the pack row: the whole screen).
  let stripBox = strip;
  if (kind === 'map') {
    captionBox = null;
    if (!upright) {
      stripBox = null;
      packBox = null;
    } else packBox = null;
  }

  // The notices: under the caption, over whatever stands lowest above the street's floor. The Map
  // leaves them no room (they wait, js/notify-view.js, until it closes).
  const left = (!upright && kind === 'half' ? sheetBox.right : sl) + EDGE;
  // G1222: under the caption's taps too (TAP_H, centred on it), which reach below the caption: a notice
  // at the region's top cut favor's 44 px hit area to 41 px, and its 4 px slide in reached further.
  const capTaps = captionBox ? Math.ceil((captionBox.top + captionBox.bottom) / 2 + TAP_H / 2) : 0;
  // A sideways half sheet's column takes the left: the buff strip stands beside it, as it did before.
  if (!upright && kind === 'half') buffBox = box(sheetBox.right + EDGE, buffBox.top, sheetBox.right + EDGE + (buffBox.right - buffBox.left), buffBox.bottom);
  // The home's row too, kept inside the room beside the column (it wraps there).
  if (!upright && kind === 'half' && homesBox) homesBox = box(sheetBox.right + EDGE, homesBox.top, Math.min(W - sr - EDGE, sheetBox.right + EDGE + (homesBox.right - homesBox.left)), homesBox.bottom);
  if (kind === 'map') {
    buffBox = null;
    homesBox = null;
  }
  let top = Math.max(under, capTaps, buffShown && buffBox ? buffBox.bottom : 0, homesBox ? homesBox.bottom : 0) + GAP;
  // G1247: a game's or a room's bars (`play`, measured { id, w, h } in order): top centre in the notices'
  // room, one under another; the notices start under the last. Under the Map they wait.
  const playAt = {};
  let playBox = null;
  if (kind !== 'map') {
    const roomR = W - sr - EDGE;
    for (const p of Array.isArray(play) ? play : []) {
      const ph = Math.max(0, num(p?.h));
      const pw = Math.max(0, Math.min(num(p?.w), roomR - left));
      if (!p?.id || !(ph > 0) || !(pw > 0)) continue;
      const x = Math.max(left, Math.round((left + roomR) / 2 - pw / 2));
      const b = box(x, top, x + pw, top + ph);
      playAt[p.id] = b;
      playBox = playBox ? box(Math.min(playBox.left, b.left), playBox.top, Math.max(playBox.right, b.right), b.bottom) : b;
      top = b.bottom + GAP;
    }
  }
  if (pinBox && playBox && (boxesOverlap(pinBox, playBox) || boxesOverlap(stick, playBox))) {
    pinBox = null;
    if (stickUp) stick = box(stick.left, stick.top + stickUp, stick.right, stick.bottom + stickUp);
    stickUp = 0;
  }
  let bottom = floor - GAP;
  if (kind === 'map') bottom = top;
  else if (kind === 'half' && upright) bottom = sheetBox.top - GAP;
  else if (kind === 'bag' && sheetBox) bottom = sheetBox.top - GAP;
  else {
    for (const b of [stick, act, jump, pinBox, snapBox]) if (b) bottom = Math.min(bottom, b.top - GAP);
  }
  const notices = box(left, top, W - sr - EDGE, Math.max(top, bottom));

  // The street fits the room the open sheet or bag leaves (G1178's dock), keeping the pinch level.
  let dock = null;
  if (sheetBox && kind !== 'map') {
    dock = upright || kind === 'bag'
      ? { side: 'bottom', css: H - sheetBox.top, zoom: true }
      : { side: 'left', css: sheetBox.right, zoom: true };
  }
  return { upright, strip: stripBox, caption: captionBox, homes: homesBox, buffs: buffBox, play: playBox, playAt, notices, pin: pinBox, stick, stickUp, act, jump, snap: snapBox, pack: packBox, sheet: sheetBox, dock };
}

/**
 * PURE (#5, Austin's iPhone 2026-11-23: the Piggy's menu covered Act, so the next tap on Act landed on
 * the menu): the room an interaction menu (the verb menu, a picker) may take on a phone, in the root's
 * px as js/ui/verb-menu.js placeVerbMenu reads it ({ top, floor, left, right }: right is the inset from
 * the right edge). Upright it stands above the controls, under the caption; sideways between the
 * stick and Act, over the pack row. null when the controls are covered (a sheet is open).
 */
export function menuRoomOf(regions, { width } = {}) {
  if (!regions?.stick || !regions.act || !regions.jump) return null;
  const top = regions.notices.top;
  const floorAbove = regions.pack ? regions.pack.top : Math.max(regions.stick.bottom, regions.jump.bottom);
  if (regions.upright) {
    return { top, floor: Math.min(regions.stick.top, regions.act.top, regions.jump.top) - GAP, left: EDGE, right: EDGE };
  }
  return { top, floor: floorAbove - GAP, left: regions.stick.right + GAP, right: Math.max(EDGE, num(width) - regions.act.left + GAP) };
}

/** The least width and height the chooser's room keeps beside or over the pinned quest. */
export const CHOOSER_MIN_W = 240;
export const CHOOSER_MIN_H = 120;

/**
 * PURE (lane pink 2026-11-25: centred on the screen, the chooser of several things covered Act, the stick
 * and Jump at 360x629 and 384x748, and reached into the raised stick at 390x844): the box the chooser
 * (js/enter-chooser.js, "Choose the thing you want to interact with:") stands in on a phone, in the root's
 * px ({ left, top, right, bottom }). It is a menu's room (menuRoomOf: above the controls upright, between
 * the stick and Act sideways), kept off the pinned quest too: sideways the card beside the stick takes the
 * room's foot, so the chooser goes beside the card (the room's whole height) when that leaves it
 * CHOOSER_MIN_W, else over it. The chooser is centred in it and its tiles scroll (style.css PHONE
 * LAYOUT). null when the controls are covered (a sheet is open): it stays centred on the screen. Glitch
 * put it in the middle of the location view (InteractionMenu.as 1149-1153), with no phone controls.
 */
export function chooserRoomOf(regions, { width } = {}) {
  const room = menuRoomOf(regions, { width });
  if (!room) return null;
  let b = box(room.left, room.top, num(width) - room.right, room.floor);
  const pin = regions.pin;
  if (pin && boxesOverlap(pin, b)) {
    const fits = (c) => c.right - c.left >= CHOOSER_MIN_W && c.bottom - c.top >= CHOOSER_MIN_H;
    // Beside the card when that is wide enough (the full height: the tiles scroll up and down), else over it.
    const ways = [box(pin.right + GAP, b.top, b.right, b.bottom), box(b.left, b.top, b.right, pin.top - GAP)];
    b = ways.find(fits) || ways[1];
  }
  return b;
}

/**
 * PURE (G1230, #595 and #632: an iPhone with "Stick follows your thumb" on): the stick's region from
 * its measured box. With the float stick on, the stick's box is the whole lower-left corner a thumb
 * may land in (up to 300 px tall, style.css FLOAT STICK), and the pinned quest stood over that, mid-left
 * on the screen. The stick's region is still where its ring stands when no thumb is down: the STICK px
 * square at the corner's foot, as with the fixed stick.
 */
export function stickRegionOf(rect, { float = false } = {}) {
  if (!rect || !(rect.right > rect.left) || !(rect.bottom > rect.top)) return null;
  if (!float || rect.bottom - rect.top <= STICK) return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
  return { left: rect.left, top: rect.bottom - STICK, right: rect.left + Math.min(STICK, rect.right - rect.left), bottom: rect.bottom };
}

/**
 * PURE (G1229, #654): the free street area's floor in the root's px: the lowest the avatar's feet may
 * stand and stay clear of the controls and the pack row (game.js gives it to the camera). Upright the
 * stick, Act and Jump stand over the pack row across the narrow screen, so it is over all of them;
 * sideways they stand at the sides and the street's middle runs down to the pack row. NaN under a
 * sheet or a bag (the street is docked above it) and with neither controls nor a pack row.
 */
export function streetFloorOf(regions) {
  if (!regions || regions.sheet) return NaN;
  const tops = [regions.pack];
  if (regions.upright) tops.push(regions.stick, regions.act, regions.jump);
  const shown = tops.filter((b) => b && b.bottom > b.top).map((b) => b.top);
  return shown.length ? Math.min(...shown) - GAP : NaN;
}

/** PURE: true when two boxes share any area. */
export function boxesOverlap(a, b) {
  return Boolean(a && b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top);
}

/** The pieces the layout keeps apart. */
export const REGION_NAMES = Object.freeze(['strip', 'caption', 'homes', 'buffs', 'play', 'notices', 'pin', 'stick', 'act', 'jump', 'pack', 'sheet']);

/**
 * PURE: what is wrong with a layout: every pair of named boxes that overlap and any box off the
 * window. `boxes` maps names to boxes (phoneRegions, or rects measured in the page); `allow` lists
 * pairs that may share room (sideways the caption stands in the strip's row, between its pills,
 * which phoneRegions does not measure). Empty when good (tests/phone-layout.test.js, at three sizes in every sheet state).
 */
export function layoutProblems(boxes, { width, height, allow = [] } = {}) {
  const allowed = (a, b) => allow.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  const named = Object.entries(boxes || {}).filter(([, r]) => r && typeof r === 'object' && Number.isFinite(r.left) && r.right > r.left && r.bottom > r.top);
  const out = [];
  for (let i = 0; i < named.length; i++) {
    const [n, r] = named[i];
    if (r.left < -0.5 || r.top < -0.5 || r.right > width + 0.5 || r.bottom > height + 0.5) out.push(`${n} off the window`);
    for (let j = i + 1; j < named.length; j++) if (boxesOverlap(r, named[j][1]) && !allowed(n, named[j][0])) out.push(`${n} overlaps ${named[j][0]}`);
  }
  return out;
}

/** PURE: a badge's words (up to 99, then 99+), '' for none. */
export function pillBadge(n) {
  const v = Math.floor(num(n));
  if (!(v > 0)) return '';
  return v > 99 ? '99+' : String(v);
}

/**
 * The Social drawer's tabs whose news is not the pill's (G1230, #595): the Activity log (pickups,
 * skills, quests: many a minute, it swamped the badge so IMs and help requests went unseen) and new
 * buddies. Their counts stay on their own tabs inside the drawer.
 */
export const PILL_BADGE_SKIP = Object.freeze(['activity', 'buddies']);

/** PURE (G1230): the Social pill's count: chat, IMs and the Chats list (mentions are chat lines), from the drawer's tabs. */
export function socialPillCount(tabs = [], unread = () => 0) {
  let n = 0;
  for (const id of Array.isArray(tabs) ? tabs : []) if (!PILL_BADGE_SKIP.includes(id)) n += Math.max(0, num(unread(id)));
  return n;
}

/** The pill's words (FULL SCREEN, G1194 call 3). */
export const PILL_TEXT = Object.freeze({ full: 'Full screen', leave: 'Leave full screen', social: 'Social' });

/**
 * PURE: how Full screen works here: 'hide' when the game is already full screen by itself (a Home
 * Screen app: `standalone`, or display-mode fullscreen) or where there is no way to it, 'api' where
 * the browser has full screen for a page, 'tip' where it has none but Add to Home Screen gives it
 * (`canTip`, iPhone Safari: the tip instead, js/home-screen-tip.js). G1230 (#632): hidden, not
 * greyed: in the iPhone Home Screen app the greyed button read as an empty square that did nothing.
 */
export function fullScreenWay({ standalone = false, fullscreen = false, canRequest = false, canTip = true } = {}) {
  if (standalone || fullscreen) return 'hide';
  if (canRequest) return 'api';
  return canTip ? 'tip' : 'hide';
}

const ICONS = {
  full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  leave: '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>',
  social: '<path d="M4 5h16v11H9l-5 4z"/>',
};

/**
 * The pill's own two icons (Full screen and Social), put in the actions pill before the Menu; the
 * page's Report a problem (features/bug-report-feature.js) and Menu make the four. style.css
 * (PHONE LAYOUT) shows only these four there; Full screen hides where the game is already full
 * screen or cannot be (fullScreenWay). Returns { full, social, setBadge(n) }.
 * @param {Document} doc
 * @param {{ standalone?: boolean, canTip?: boolean, showTip?: () => void, onSocial?: () => void }} o
 */
export function installPhonePill(doc, { standalone = false, canTip = true, showTip = () => {}, onSocial = () => {} } = {}) {
  const pill = doc?.querySelector?.('header.top-bar .top-actions');
  const menu = pill?.querySelector('.more-menu');
  if (!pill || !menu) return null;
  const make = (id, label, icon) => {
    const b = doc.getElementById(id) || doc.createElement('button');
    b.type = 'button';
    b.id = id;
    b.className = 'chrome-btn hud-ibtn phone-pill-btn';
    b.setAttribute('aria-label', label);
    b.dataset.tip = label;
    b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg>`;
    pill.insertBefore(b, menu);
    return b;
  };
  const el = doc.documentElement;
  const request = el.requestFullscreen || el.webkitRequestFullscreen;
  let fullscreen = false;
  try {
    fullscreen = Boolean(doc.defaultView?.matchMedia?.('(display-mode: fullscreen)')?.matches);
  } catch { /* none */ }
  const way = fullScreenWay({ standalone, fullscreen, canRequest: typeof request === 'function', canTip });
  const full = make('fullscreen-btn', PILL_TEXT.full, ICONS.full);
  // G1230 (#632): already full screen (the Home Screen app), or no way to it: no button, the pill keeps three.
  full.hidden = way === 'hide';
  const isFull = () => Boolean(doc.fullscreenElement || doc.webkitFullscreenElement);
  const paintFull = () => {
    const on = isFull();
    const label = on ? PILL_TEXT.leave : PILL_TEXT.full;
    full.setAttribute('aria-label', label);
    full.dataset.tip = label;
    full.setAttribute('aria-pressed', String(on));
    full.querySelector('svg').innerHTML = on ? ICONS.leave : ICONS.full;
  };
  full.addEventListener('click', () => {
    if (way === 'hide') return;
    if (way === 'tip') {
      showTip();
      return;
    }
    if (isFull()) {
      (doc.exitFullscreen || doc.webkitExitFullscreen)?.call(doc)?.catch?.(() => {});
      return;
    }
    try {
      const p = request.call(el, { navigationUI: 'hide' });
      p?.catch?.(() => showTip());
    } catch {
      showTip();
    }
  });
  doc.addEventListener('fullscreenchange', paintFull);
  doc.addEventListener('webkitfullscreenchange', paintFull);
  paintFull();
  const social = make('social-btn', PILL_TEXT.social, ICONS.social);
  const badge = doc.createElement('span');
  badge.className = 'hud-badge phone-pill-badge';
  badge.setAttribute('aria-hidden', 'true');
  badge.hidden = true;
  social.append(badge);
  social.setAttribute('aria-controls', 'local-chat-dock');
  social.addEventListener('click', () => onSocial());
  return {
    full,
    social,
    setBadge(n) {
      const text = pillBadge(n);
      if (badge.textContent !== text) badge.textContent = text;
      if (badge.hidden !== !text) badge.hidden = !text;
      const label = text ? `${PILL_TEXT.social}, ${text} new` : PILL_TEXT.social;
      if (social.getAttribute('aria-label') !== label) social.setAttribute('aria-label', label);
    },
  };
}

/**
 * Mount the layout pass. `sheets` maps a sheet id (map, quests, social, menu) to { isOpen(), close() }
 * with its kind ('map' or 'half'); `others()` lists any other open side sheet (Skills, Make, Mail...)
 * as { id, close() }. `engine` takes the dock (setStageDock(dock, 'phone')). `onBand(px)` hears the
 * bottom band the controls stand on. Returns { frame(), layout(), regions(), noticeRegion(),
 * isActive(), destroy() }.
 * @param {{ doc?: Document, root: HTMLElement, sheets?: Record<string, { kind: 'map'|'half', isOpen: () => boolean, close: () => void }>,
 *   others?: () => { id: string, close: () => void }[], engine?: any, setData?: (k: string, v: string) => void,
 *   active?: () => boolean, onFrame?: () => void }} opts
 */
export function mountPhoneLayout({ doc = globalThis.document, root, sheets = {}, others = () => [], engine = null, setData = () => {}, active = () => true, onFrame = () => {} } = {}) {
  if (!doc || !root) return null;
  const html = doc.documentElement;
  const win = doc.defaultView || globalThis;
  const ids = Object.keys(sheets);
  let last = null;
  let lastAt = -Infinity;
  let seenOpen = new Set();
  let on = false;
  let current = null;
  /** G1307: how far the stick stands up over the pinned quest's row (style.css --pr-stick-up). */
  let stickUp = 0;

  const shown = (el) => Boolean(el && !el.hidden && el.getClientRects?.().length);
  const rectOf = (el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  };
  // #653: --safe-t upright is a calc() (the inset plus 14 px, or --ios-fog-clear in the Home Screen app), and a
  // custom property's computed value is that calc() unresolved: parseFloat read 0, so the notices sat
  // over the pills on a phone with a notch. A probe's padding resolves the four to px.
  let insetProbe = null;
  function safeInsets() {
    try {
      if (!insetProbe || !insetProbe.isConnected) {
        insetProbe = doc.createElement('div');
        insetProbe.setAttribute('aria-hidden', 'true');
        insetProbe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;'
          + 'padding:var(--safe-t,0px) var(--safe-r,0px) var(--safe-b,0px) var(--safe-l,0px)';
        (doc.body || html).appendChild(insetProbe);
      }
      const cs = win.getComputedStyle(insetProbe);
      const px = (n) => parseFloat(cs[n]) || 0;
      return { t: px('paddingTop'), r: px('paddingRight'), b: px('paddingBottom'), l: px('paddingLeft') };
    } catch {
      return {};
    }
  }
  const openSet = () => {
    const open = new Set(ids.filter((id) => sheets[id].isOpen()));
    for (const o of others()) open.add(`other:${o.id}`);
    return open;
  };

  /** One sheet at a time: one that opened since the last look closes the others. */
  function keepOne() {
    const open = openSet();
    const fresh = [...open].filter((id) => !seenOpen.has(id));
    if (open.size > 1 && fresh.length) {
      const keep = fresh[fresh.length - 1];
      for (const id of ids) if (id !== keep && open.has(id)) sheets[id].close();
      for (const o of others()) if (`other:${o.id}` !== keep) o.close?.();
    }
    seenOpen = openSet();
  }

  function sheetNow() {
    let kind = '';
    for (const id of ids) if (sheets[id].isOpen()) kind = kind === 'map' ? 'map' : sheets[id].kind;
    if (!kind && others().length) kind = 'half';
    if (kind) return { kind };
    const tray = doc.querySelector('#pack-bar .pack-bag-row:not([hidden])');
    if (shown(tray)) return { kind: 'bag', top: tray.getBoundingClientRect().top };
    return { kind: '' };
  }

  // Favor with the street's Giant stands at the caption's end on the phone layout, its home in the
  // stats elsewhere (#595: the stats keep room for whole counts).
  let favorHome = null;
  function seatFavor(inCaption) {
    const favor = doc.getElementById('favor-stat');
    const plate = doc.getElementById('street-nameplate');
    if (!favor || !plate) return;
    if (inCaption && favor.parentElement !== plate) {
      favorHome = { parent: favor.parentElement, next: favor.nextSibling };
      plate.append(favor);
    } else if (!inCaption && favorHome && favor.parentElement === plate) {
      favorHome.parent.insertBefore(favor, favorHome.next?.parentElement === favorHome.parent ? favorHome.next : null);
    }
  }

  function off() {
    if (!on) return;
    on = false;
    seatFavor(false);
    html.classList.remove('phone-layout');
    delete html.dataset.phoneSheet;
    engine?.setStageDock?.(null, 'phone');
    html.style.removeProperty('--pr-stick-up');
    for (const k of ['t', 'l', 'r', 'b']) html.style.removeProperty(`--pr-chooser-${k}`);
    stickUp = 0;
    current = null;
    last = null;
  }

  function layout() {
    if (!active()) {
      off();
      return;
    }
    if (!on) {
      on = true;
      html.classList.add('phone-layout');
      seatFavor(true);
    }
    keepOne();
    const s = sheetNow();
    const rr = root.getBoundingClientRect();
    const shift = (r) => r && { left: r.left - rr.left, top: r.top - rr.top, right: r.right - rr.left, bottom: r.bottom - rr.top };
    const packEl = doc.getElementById('pack-row');
    const packShown = shown(packEl) && doc.defaultView?.getComputedStyle?.(doc.getElementById('pack-bar'))?.visibility !== 'hidden';
    const plate = doc.getElementById('street-nameplate');
    const pins = doc.getElementById('quest-pins');
    const buffEl = doc.getElementById('buff-strip');
    // The home's buttons, or Decoration Mode's banner (its note under it too) while it is open.
    const homesEl = doc.getElementById('homes-modes');
    const banner = doc.querySelector('#game-root .hb-builder:not([hidden]) .hb-banner');
    let homes = null;
    if (shown(homesEl)) homes = { w: homesEl.offsetWidth, h: homesEl.offsetHeight };
    else if (shown(banner)) {
      const b = rectOf(banner);
      const note = banner.querySelector('.hb-banner-note');
      const foot = shown(note) ? Math.max(b.bottom, rectOf(note).bottom) : b.bottom;
      homes = { w: b.right - b.left, h: foot - b.top };
    }
    // G1247: a game's or a room's own bars, measured with what hangs out of them (Leave race, the crowns clock).
    const play = [];
    for (const [id, sel] of PLAY_PIECES) {
      const el = doc.querySelector(sel);
      if (!shown(el) || el.classList.contains('is-covered')) continue;
      const r = rectOf(el);
      let { left: l, right: rt, bottom: b } = r;
      for (const kid of el.querySelectorAll('.race-forfeit, [data-crowns-clock]')) {
        if (!shown(kid)) continue;
        const k = rectOf(kid);
        l = Math.min(l, k.left);
        rt = Math.max(rt, k.right);
        b = Math.max(b, k.bottom);
      }
      play.push({ id, w: rt - l, h: b - r.top, dx: r.left - l });
    }
    const regions = phoneRegions({
      width: rr.width,
      height: rr.height,
      safe: safeInsets(),
      sheet: s.kind,
      pack: packShown ? shift(rectOf(packEl)) : null,
      packShown,
      bagTop: Number.isFinite(s.top) ? s.top - rr.top : NaN,
      caption: shown(plate) ? { w: plate.offsetWidth, h: plate.offsetHeight } : null,
      captionUnder: rr.height > rr.width || Boolean(plate?.classList.contains('is-under')),
      pin: pins && !pins.hidden && pins.getClientRects().length ? { w: pins.offsetWidth, h: pins.offsetHeight } : null,
      buffs: shown(buffEl) ? { w: buffEl.offsetWidth, h: buffEl.offsetHeight } : null,
      homes,
      play,
      // G1314: Camera Mode's Snap button while it shows (the notices keep above it).
      snap: (() => {
        const el = doc.querySelector('#game-root .camera-mode:not([hidden]) .camera-mode-snap:not([hidden])');
        return el?.getClientRects().length ? shift(rectOf(el)) : null;
      })(),
      controls: Object.fromEntries(['stick', 'act', 'jump'].map((k) => {
        const el = doc.querySelector(`#game-root .touch-${k}`);
        let r = el?.getClientRects().length ? shift(rectOf(el)) : null;
        // G1307: measured where it stands on its band, before the pinned quest's room under it (stickUp).
        if (r && k === 'stick' && stickUp) r = { ...r, top: r.top + stickUp, bottom: r.bottom + stickUp };
        // G1230: the float stick's corner is not its region; its ring's resting square is.
        return [k, k === 'stick' ? stickRegionOf(r, { float: el?.closest?.('.touch-controls')?.dataset.float === 'on' }) : r];
      })),
    });
    const key = JSON.stringify([s.kind, regions]);
    if (key === last) return;
    last = key;
    current = regions;
    html.dataset.phoneSheet = s.kind;
    // The pinned quest waits (hidden) where it has no room clear of the controls.
    if (pins && !pins.hidden) html.dataset.phonePin = regions.pin ? 'on' : 'off';
    else delete html.dataset.phonePin;
    const set = (name, v) => {
      const px = `${Math.round(v)}px`;
      if (html.style.getPropertyValue(name) !== px) html.style.setProperty(name, px);
    };
    const sh = regions.sheet;
    set('--pr-under', regions.notices.top - GAP);
    // The buff strip's slot (style.css PHONE LAYOUT), and its foot for the route card under it.
    if (regions.buffs) {
      set('--pr-buffs-t', regions.buffs.top);
      set('--pr-buffs-l', regions.buffs.left);
      set('--pr-buffs-b', Math.max(regions.buffs.bottom > regions.buffs.top ? regions.buffs.bottom : 0, regions.homes ? regions.homes.bottom : 0));
    }
    // The home's buttons' row (style.css PHONE LAYOUT): its top and left; with nothing shown yet it
    // still has a place (the caption's foot) so the row first measures where it will stand.
    const homesAt = regions.homes || regions.buffs;
    if (homesAt) {
      set('--pr-homes-t', homesAt.top);
      set('--pr-homes-l', homesAt.left);
    }
    // G1247: each bar's spot (style.css PHONE LAYOUT): its top, left (the box less what hangs out at the left) and width.
    for (const p of play) {
      const b = regions.playAt[p.id];
      if (!b) continue;
      set(`--pr-${p.id}-t`, b.top);
      set(`--pr-${p.id}-l`, b.left + p.dx);
      set(`--pr-${p.id}-w`, b.right - b.left);
    }
    set('--pr-notice-t', regions.notices.top);
    set('--pr-sheet-t', sh ? sh.top : 0);
    set('--pr-sheet-l', sh ? sh.left : 0);
    set('--pr-sheet-w', sh ? sh.right - sh.left : 0);
    set('--pr-sheet-h', sh ? sh.bottom - sh.top : 0);
    // The pinned quest's spot (it stays where it was while covered: style.css hides it then).
    if (regions.pin) {
      set('--pr-pin-l', regions.pin.left);
      set('--pr-pin-b', rr.height - regions.pin.bottom);
    }
    // The chooser of several things stands in the street above the controls (chooserRoomOf); under a sheet,
    // with no controls showing, it stays centred on the screen.
    const ch = chooserRoomOf(regions, { width: rr.width });
    if (ch) {
      set('--pr-chooser-t', ch.top);
      set('--pr-chooser-l', ch.left);
      set('--pr-chooser-r', rr.width - ch.right);
      set('--pr-chooser-b', rr.height - ch.bottom);
    } else for (const k of ['t', 'l', 'r', 'b']) html.style.removeProperty(`--pr-chooser-${k}`);
    // G1307: the stick stands up over the card's row (it keeps its spot while covered, hidden then, so it
    // does not jump as a sheet or a bag closes).
    if (!s.kind && regions.stickUp !== stickUp) {
      stickUp = regions.stickUp;
      set('--pr-stick-up', stickUp);
    }
    engine?.setStageDock?.(regions.dock, 'phone');
    setData('phoneRegions', JSON.stringify(regions));
    setData('phoneDock', regions.dock ? `${regions.dock.side}:${regions.dock.css}` : '');
  }

  const onResize = () => {
    last = null;
    layout();
  };
  win.addEventListener?.('resize', onResize);
  win.addEventListener?.('orientationchange', onResize);
  layout();

  return {
    /** Once a frame from game.js: a sheet or bag opened or closed elsewhere (a key, a feature), the badge. */
    frame(now = globalThis.performance?.now?.() ?? Date.now()) {
      if (now - lastAt < 120) return;
      lastAt = now;
      layout();
      if (on) onFrame();
    },
    layout: () => {
      last = null;
      layout();
    },
    regions: () => current,
    /** The room an interaction menu may take (menuRoomOf), in the root's px; null when not laid out. */
    menuRoom: () => (on && current ? menuRoomOf(current, { width: root.getBoundingClientRect().width }) : null),
    /** G1229: the free street area's floor in page px (streetFloorOf), NaN when not laid out or under a sheet. */
    streetFloor: () => {
      if (!on || !current) return NaN;
      const y = streetFloorOf(current);
      return Number.isFinite(y) ? y + root.getBoundingClientRect().top : NaN;
    },
    /** The notices' region in page px (js/notify-view.js), null when not laid out. */
    noticeRegion: () => {
      if (!on || !current) return null;
      const rr = root.getBoundingClientRect();
      const n = current.notices;
      return { left: n.left + rr.left, top: n.top + rr.top, right: n.right + rr.left, bottom: n.bottom + rr.top };
    },
    isActive: () => on,
    destroy() {
      win.removeEventListener?.('resize', onResize);
      win.removeEventListener?.('orientationchange', onResize);
      off();
    },
  };
}
