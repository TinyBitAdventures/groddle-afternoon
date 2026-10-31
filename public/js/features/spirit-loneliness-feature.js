/**
 * Street Spirit loneliness (register G185, loneliness lane). Rules, copy and
 * the solo reading are in js/spirit-loneliness.js; the cry clip and the
 * porthole art are js/street-spirits.js STREET_SPIRIT_LONELY_ART.
 *
 * - Now and then a Street Spirit you have met and left alone for a game day
 *   gets lonely. It calls you from the top right corner of the street in its
 *   porthole, crying, with one of nine pleas in a speech bubble
 *   (inc_world_events.js 16-72: loneliness_in, loneliness at 1 s,
 *   loneliness_out at 13 s, gone at 14.5 s; the class's loneliness_size and
 *   corner offsets; the bubble at corner offset 170 / 80, size 250).
 * - 15 s later: "A Street Spirit in X needs your help. Would you like to set
 *   that as your destination?" Yes sets the route through the map routes
 *   feature (engine.query('mapRoute', 'set', { to, source: 'loneliness' }),
 *   prompts_loneliness_callback 133-142). G304: it is a prompts_add
 *   (showLonelinessPrompt 118-131: Yes / No, no timeout, not modal), so it
 *   joins the bottom-right prompt stack (engine.prompt), not the centre card.
 * - On its street it cries (street-spirits-feature plays the cry clip through
 *   engine.query('spiritCry')); a race shows "There is a lonely street spirit
 *   here. Hurry! Hurry!", a party "End the loneliness with a party! 0/1
 *   players here now" and its activity line. The Uralia spirit cries in 5 s
 *   bursts and says a sad line every 10-15 s (street_spirit_zutto.js
 *   410-418).
 * - Walking into it is the visit (onPlayerCollision -> lonelinessVisit). A
 *   race: its thanks for your plea, "BTW, you are kind people who came to
 *   here in the 1st place today. This is in return for your kindness. Thank
 *   you!", 1000 iMG with the mood bonus and "You brightened a street
 *   spirit's day." A party (you are the only guest): "Finally you are here
 *   at last...", 5 s later the party line, 200 iMG and Party Time!, six
 *   fireworks with LONELINESS_FIREWORKS, and 55 s later its last line.
 * - Missed (15 minutes for a race, 5 for a party): "Someone else cheered up
 *   the Street Spirit in X. Looks like you missed your chance!"
 *
 * The fireworks are Tiny Speck's own overlays (glitch-overlays
 * fireworks_1/2/3.fla, recovered as vector frames by tools/overlay-art,
 * register G237), drawn through js/overlay-art.js at the source positions
 * and times; a plain burst of dots stands in only if their art fails to
 * load. The bubble is drawn from
 * loneliness_quest_bubble_overlay.fla's shape (a 246 x 90 white rounded box,
 * tail at the bottom right, Arial 12 text field 226 x 73, drop shadow).
 *
 * QA (canvas data lonely*):
 *   &lonelydemo=here        this street's spirit is lonely now (no invite)
 *   &lonelydemo=<tsid>      invite now to that street (the street rules apply, not the visit ones)
 *   &lonelydemo=pick        run the solo picker now (&lonelyseed=<tsid,tsid> marks those as met long ago)
 *   &lonelytype=A|B  &lonelyoption=0..8
 *   &lonelyautoplay=near    stand 330 px from the lonely spirit (here)
 *   &lonelyautoplay=close   stand 180 px off: inside the Uralia spirit's 250 px wake, outside the collision
 *   &lonelyautoplay=visit   walk into it (after &lonelywait ms, default 2500), leave the talk open
 *   &lonelyautoplay=yes     answer Yes to the prompt and stop
 *   &lonelyautoplay=1       Yes, then on its street walk in and answer every line
 *                           (add &routeautoplay=1 to travel the route)
 *   &lonelyhold=invite      keep the porthole on screen (frozen at the loop) for screenshots
 */

import { STREET_INDEX } from '../street-loader.js?v=390e4702';
import { getStreetEcologyCatalog } from '../street-ecology.js?v=7e30da8f';
import { graphKey, routeGraph, tsidAliases } from '../map-routes.js?v=5090dbb7';
import { STREET_SPIRIT_VARIANTS, portraitFit, portraitSheet, spiritForStreet } from '../street-spirits.js?v=f9e88445';
import { grantMoodXp } from '../mood-xp.js?v=958e7680';
import { denseFrame, denseSprite } from '../sprite-dense.js?v=8e0109eb';
import { loadVectorFrames, overlayAlpha, overlayFrameAt, overlayLifeMs, overlayPlacement, trackOverlay } from '../overlay-art.js?v=3753a0d2';
import {
  INVITE_ART,
  LONELY_RULES,
  LONELY_TEXT,
  between,
  canInvite,
  checkDue,
  clearEvent,
  createLonelyState,
  expired,
  inviteBox,
  inviteText,
  isRunning,
  missedText,
  noteVisit,
  normalizeLonelyState,
  partyOverlayLines,
  partyStartLine,
  pickLonelySpirit,
  portraitStateAt,
  promptDue,
  promptText,
  raceConversation,
  rewardText,
  seedVisits,
  startEvent,
  streetKey,
  visitEvent,
} from '../spirit-loneliness.js?v=9259917d';

export const SPIRIT_LONELINESS_FEATURE_ID = 'spirit-loneliness';
const GRAPH_URL = 'assets/content/signpost-graph.json?v=g198-1';
/** street-spirits-feature tickOffer: the collision box round the spirit. */
const VISIT_DX = 90;
const VISIT_DY = 120;
/** A new street settles (loading card, arrival) before the game looks for a lonely spirit. */
const SETTLE_MS = 8000;

let state = createLonelyState();
let graph = null;
let graphPromise = null;
let rt = freshRuntime();

function freshRuntime() {
  return {
    enteredAt: 0,
    here: '',
    target: null,
    wasNear: false,
    zuttoNextAt: 0,
    zuttoCryUntil: 0,
    invite: null, // { startAt, variant, look, sheets: { in, loop, out }, imgs: {}, text }
    promptOpen: false,
    promptUid: '', // G304: the invite's uid in the prompt stack
    convoOpen: false,
    dialogSeen: false,
    party: null, // { finishAt, finishedAt, jabberAt, fireworksAt, done: Set }
    fireworks: 0,
    fireworksArt: '',
    last: '',
    xp: 0,
    demoDone: false,
    autoAt: 0,
    autoStep: '',
  };
}

/* ------------------------------------------------------------ helpers */

function loadGraph() {
  if (graph) return Promise.resolve(graph);
  graphPromise ||= fetch(GRAPH_URL)
    .then((r) => r.json())
    .then((json) => {
      graph = routeGraph(json).graph;
      return graph;
    })
    .catch(() => {
      graph = {};
      return graph;
    });
  return graphPromise;
}

function indexMeta(tsid) {
  const streets = STREET_INDEX.streets || {};
  for (const a of tsidAliases(tsid)) if (streets[a]) return streets[a];
  return null;
}
const labelOf = (tsid) => indexMeta(tsid)?.label || tsid || '';

/** Every street whose archived location holds a Street Spirit (street-ecology.json counts). */
function spiritStreets() {
  const out = [];
  for (const [tsid, e] of Object.entries(getStreetEcologyCatalog()?.streets || {})) {
    if (Number(e?.counts?.street_spirit) > 0) out.push(streetKey(tsid));
  }
  return out;
}

function hasSpirit(tsid) {
  const key = streetKey(tsid);
  const e = getStreetEcologyCatalog()?.streets?.[key];
  return Number(e?.counts?.street_spirit) > 0;
}

/** Streets still under construction (street-jobs-feature closedRoads): not there yet, and no way through. */
function closedSet(engine) {
  const out = new Set();
  for (const t of engine?.query?.('closedRoads', engine) || []) for (const a of tsidAliases(t)) out.add(a);
  return out;
}

/** Route lengths (streets, both ends counted) from `from` to every street, over the signpost graph. */
function pathLengths(from, closed = new Set()) {
  const start = graphKey(graph, from);
  const out = new Map();
  if (!start) return out;
  out.set(start, 1);
  const queue = [start];
  while (queue.length) {
    const at = queue.shift();
    for (const next of graph[at] || []) {
      if (out.has(next) || closed.has(next)) continue;
      out.set(next, out.get(at) + 1);
      queue.push(next);
    }
  }
  return out;
}

function pathLength(from, to, closed) {
  const lengths = pathLengths(from, closed);
  const key = graphKey(graph, to);
  return key ? lengths.get(key) || 0 : 0;
}

function offWorld(engine) {
  return Boolean(engine.homeContext?.().inHome || engine.transientInstance?.());
}

function dialogFree(engine) {
  return !engine.questDialogueOpen?.() && !engine.busy?.() && !engine.acting?.() && !engine.vogOpen?.() && !engine.streetCardUp?.();
}

function qaRoute(engine) {
  if (typeof location === 'undefined') return false;
  return [...new URLSearchParams(location.search).keys()].some((k) => /demo$|autoplay$/.test(k) && k !== 'lonelydemo');
}

function playerName(engine) {
  return engine.pc?.label || engine.pc?.name || engine.whoIsHere?.()[0] || 'Ur';
}

function lonelyHere(engine) {
  const e = state.event;
  return Boolean(e && isRunning(e, Date.now()) && streetKey(engine.streetTsid) === e.tsid);
}

function vendorSpirit(engine) {
  return (engine.interactables || []).find(
    (it) => String(it.classId || '').startsWith('street_spirit_') && it.state?.vendorKey && it.sprite && !it.sprite.destroyed
  ) || null;
}

function publish(engine) {
  const e = state.event;
  const now = Date.now();
  engine.setData('lonelyEvent', e ? e.tsid : '');
  engine.setData('lonelyLabel', e ? e.label : '');
  engine.setData('lonelyType', e ? e.type : '');
  engine.setData('lonelyOption', e ? String(e.option) : '');
  engine.setData('lonelyVariant', e ? `${e.variant}:${e.look}` : '');
  engine.setData('lonelyPhase', !e ? 'none' : e.visitedAt ? 'visited' : !e.prompted ? 'invite' : `running:${e.answer || 'open'}`);
  engine.setData('lonelyLeft', e && !e.visitedAt ? String(Math.max(0, Math.round((e.endsAt - now) / 1000))) : '');
  engine.setData('lonelyHere', lonelyHere(engine) ? '1' : '');
  engine.setData('lonelyCry', engine.query?.('spiritCry', engine) ? '1' : '');
  engine.setData('lonelyFireworks', rt.fireworks ? `${rt.fireworks}:${rt.fireworksArt || 'loading'}` : '');
  engine.setData('lonelyPortrait', rt.invite ? portraitStateAt(inviteMs(now)) || 'gone' : '');
  engine.setData('lonelyPrompt', rt.promptOpen ? 'open' : e?.answer || '');
  engine.setData('lonelyLast', rt.last);
  engine.setData('lonelyXp', String(rt.xp || ''));
  engine.setData('lonelyCured', String(state.cured));
  engine.setData('lonelyParties', String(state.parties));
  engine.setData('lonelyMissed', String(state.missed));
  engine.setData('lonelyMet', String(Object.keys(state.visits).length));
  engine.setData('lonelyNextCheck', state.event ? '' : String(Math.max(0, Math.round((state.nextCheckAt - now) / 1000))));
}

/* ------------------------------------------------------------ DOM: invite, overlays, fireworks */

const CSS = `
.lonely-invite,.lonely-street,.lonely-fireworks{position:absolute;pointer-events:none;z-index:var(--z-dialog)}
.lonely-invite[hidden],.lonely-street[hidden],.lonely-fireworks[hidden]{display:none!important}
.lonely-invite canvas{position:absolute;left:0;top:0}
#game-root .lonely-invite canvas.lonely-portrait,#game-root canvas.lonely-fireworks.lonely-fireworks{width:var(--lw)!important;height:var(--lh)!important;display:block}
.lonely-bubble{position:absolute;box-sizing:border-box;background:var(--surface-bright);border-radius:var(--radius-xl);
  padding:calc(var(--k,1)*9px) calc(var(--k,1)*11px);transform:translateY(-100%);
  filter:drop-shadow(1.4px 1.4px 1px color-mix(in srgb, var(--c-black) 65%, transparent))}
.lonely-bubble::after{content:'';position:absolute;right:8%;bottom:calc(var(--k,1)*-10.4px);width:10.6%;height:calc(var(--k,1)*11.5px);background:var(--surface-bright);
  clip-path:polygon(0 0,100% 0,100% 100%)}
.lonely-bubble p{margin:0;font-family:var(--font-arial);color:var(--c-black);line-height:var(--lh-tight);text-wrap:pretty}
.lonely-street{left:0;top:0;text-align:center;color:var(--text-inverse);font-weight:900;font-family:var(--font-round);
  text-shadow:0 2px 0 var(--c-navy-30),0 0 3px var(--c-navy-30),0 0 10px color-mix(in srgb, var(--c-black) 45%, transparent);transition:opacity 300ms linear}
.lonely-street p{margin:0;line-height:var(--lh-tight)}
.lonely-street .big{font-size:1.5em}
`;

function rootEl() {
  return typeof document === 'undefined' ? null : document.getElementById('game-root');
}

function ensureCss() {
  if (typeof document === 'undefined' || document.getElementById('spirit-loneliness-css')) return;
  const style = document.createElement('style');
  style.id = 'spirit-loneliness-css';
  style.textContent = CSS;
  document.head.appendChild(style);
}

/** The location viewport inside #game-root, in CSS px, and the logical-px scale (the view's width, g458). */
function viewport() {
  const root = rootEl();
  const canvas = root?.querySelector('canvas:not(.lonely-portrait):not(.lonely-fireworks)');
  if (!root || !canvas) return null;
  const r = root.getBoundingClientRect();
  const c = canvas.getBoundingClientRect();
  if (!c.width) return null;
  const scale = c.width / (Number(canvas.dataset?.viewWidth) || 960);
  const rail = document.getElementById('play-context');
  const railRect = rail && rail.offsetParent !== null ? rail.getBoundingClientRect() : null;
  const right = railRect && railRect.left > c.left && railRect.left < c.right ? railRect.left : c.right;
  const pack = document.getElementById('pack-bar')?.getBoundingClientRect();
  const bottom = pack && pack.height > 0 && pack.top > c.top && pack.top < c.bottom ? pack.top : c.bottom;
  return { left: c.left - r.left, top: c.top - r.top, width: right - c.left, height: bottom - c.top, scale };
}

function el(id, cls) {
  const root = rootEl();
  if (!root) return null;
  let node = document.getElementById(id);
  if (!node) {
    ensureCss();
    node = document.createElement('div');
    node.id = id;
    node.className = cls;
    node.hidden = true;
    root.appendChild(node);
  }
  return node;
}

function inviteMs(now = Date.now()) {
  if (!rt.invite) return -1;
  if (rt.invite.hold) return LONELY_RULES.loopAtMs + 500;
  return now - rt.invite.startAt;
}

/** Device px across the porthole canvas (the loneliness_size in CSS px x the density, at most 3). */
function portholeBackingPx(variant) {
  const vp = viewport();
  const box = inviteBox(STREET_SPIRIT_VARIANTS[variant]?.loneliness);
  return Math.round(box.size * (vp?.scale || 1) * Math.min(3, globalThis.devicePixelRatio || 1));
}

/**
 * The porthole's art: the 1x strips, plus their 5x renders (js/sprite-dense.js) when the canvas
 * draws 1.5+ device px per 1x pixel. A dense sheet is split into parts; each loads on the first
 * frame that needs it, and the 1x strip stands in until then.
 */
function portraitArt(variant, look, sheets) {
  const fit = portraitFit(variant, look) || 1;
  const pxPerTexel = portholeBackingPx(variant) / fit;
  const imgs = {};
  const dense = {};
  const parts = new Map();
  if (typeof Image !== 'undefined') {
    for (const [s, def] of Object.entries(sheets)) {
      if (!def) continue;
      const img = new Image();
      img.src = def.path;
      imgs[s] = img;
      dense[s] = denseSprite(def.path, pxPerTexel);
      // Each clip's first part now (the in clip plays at once, the loop 1 s later).
      const first = dense[s] && denseFrame(dense[s], 0);
      if (first) {
        const p = new Image();
        p.decoding = 'async';
        p.src = first.url;
        parts.set(first.url, p);
      }
    }
  }
  return { imgs, dense, parts, pxPerTexel };
}

/** The loaded image and source rect for frame f of a state: the dense part when it is in, else the 1x strip. */
function portraitFrame(inv, clip, f) {
  const def = inv.sheets[clip];
  const d = inv.art.dense[clip] && denseFrame(inv.art.dense[clip], f);
  if (d && typeof Image !== 'undefined') {
    let img = inv.art.parts.get(d.url);
    if (!img) {
      img = new Image();
      img.decoding = 'async';
      img.src = d.url;
      inv.art.parts.set(d.url, img);
      // The next part too, so the loop never waits on a load.
      const part = inv.art.dense[clip].parts.find(([u]) => u === d.url);
      const next = part && denseFrame(inv.art.dense[clip], part[1] + part[2]);
      if (next && !inv.art.parts.has(next.url)) {
        const n = new Image();
        n.decoding = 'async';
        n.src = next.url;
        inv.art.parts.set(next.url, n);
      }
    }
    if (img.complete && img.naturalWidth) return { img, sx: d.x, sy: d.y, sw: d.w, sh: d.h, density: inv.art.dense[clip].density };
  }
  const img = inv.art.imgs[clip];
  if (!def || !img?.complete || !img.naturalWidth) return null;
  return { img, sx: (f % def.cols) * def.fw, sy: Math.floor(f / def.cols) * def.fh, sw: def.fw, sh: def.fh, density: 1 };
}

function openInvite(engine, e, now) {
  const sheets = {};
  for (const s of ['in', 'loop', 'out']) sheets[s] = portraitSheet(e.variant, e.look, s);
  const art = portraitArt(e.variant, e.look, sheets);
  rt.invite = {
    startAt: now,
    variant: e.variant,
    look: e.look,
    sheets,
    art,
    text: inviteText(e.option, playerName(engine), e.label),
    hold: engine.param('lonelyhold') === 'invite',
  };
  rt.last = `invite:${e.tsid}:${e.option}`;
  // G313: the porthole and its bubble are overlays (announce_remote_item_speech: a vp_overlay pair,
  // inc_announcements.js 708-742, from inc_world_events.js 67): a move takes them down at its start.
  inviteRelease ||= trackOverlay(() => {
    inviteRelease = null;
    closeInvite();
  });
  drawInvite(now);
}

let inviteRelease = null;
let streetRelease = null;

function closeInvite() {
  rt.invite = null;
  inviteRelease?.();
  inviteRelease = null;
  const node = typeof document === 'undefined' ? null : document.getElementById('lonely-invite');
  if (node) node.hidden = true;
}

/** The porthole and the bubble, placed as InWindowAnnouncementOverlay.placeInCorner does. */
function drawInvite(now) {
  const inv = rt.invite;
  if (!inv) return;
  const ms = inviteMs(now);
  const clip = portraitStateAt(ms);
  if (!clip) {
    closeInvite();
    return;
  }
  const node = el('lonely-invite', 'lonely-invite');
  const vp = viewport();
  if (!node || !vp) return;
  if (!node.firstChild) {
    node.innerHTML = '<canvas class="lonely-portrait"></canvas><div class="lonely-bubble"><p></p></div>';
  }
  const canvas = node.querySelector('canvas');
  const bubble = node.querySelector('.lonely-bubble');
  const k = vp.scale;
  const box = inviteBox(STREET_SPIRIT_VARIANTS[inv.variant]?.loneliness);
  Object.assign(node.style, { left: `${vp.left}px`, top: `${vp.top}px`, width: `${vp.width}px`, height: `${vp.height}px` });
  node.hidden = false;
  // The porthole: art_w = art_h = size; centre at vp_w - size/2 - x, size/2 + y.
  const size = box.size * k;
  // Up to 3 device px per CSS px: the 5x art fills a DPR 3 screen (Austin 10-28: it was blurry).
  const pxRatio = Math.min(3, globalThis.devicePixelRatio || 1);
  canvas.width = Math.round(size * pxRatio);
  canvas.height = Math.round(size * pxRatio);
  Object.assign(canvas.style, { left: `${vp.width - size - box.x * k}px`, top: `${box.y * k}px` });
  canvas.style.setProperty('--lw', `${size}px`);
  canvas.style.setProperty('--lh', `${size}px`);
  const def = inv.sheets[clip];
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (def) {
    const start = clip === 'in' ? 0 : clip === 'loop' ? LONELY_RULES.loopAtMs : LONELY_RULES.outAtMs;
    let f = Math.floor(((ms - start) * def.fps) / 1000);
    f = clip === 'loop' ? f % def.frames : Math.min(def.frames - 1, Math.max(0, f));
    const src = portraitFrame(inv, clip, f);
    if (src) {
      // ItemIconView fits the art to wh: one scale for all three clips, centred.
      const fit = portraitFit(inv.variant, inv.look) || def.fw;
      const s = (canvas.width / fit);
      const w = def.fw * s;
      const h = def.fh * s;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(src.img, src.sx, src.sy, src.sw, src.sh, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
      canvas.dataset.density = String(src.density);
    }
  }
  // The bubble (loneliness_quest_bubble_overlay: 255 x 111 stage fitted to 250). Its width and the
  // bottom edge, where the tail points at the porthole, are the source's; its height fits the plea
  // (Austin 10-28: the fixed 246 x 90 box read as too large around two lines), growing upward.
  const bw = INVITE_ART.bubble.size * k;
  const bh = (INVITE_ART.bubble.size * 90 / 255) * k;
  Object.assign(bubble.style, { width: `${bw * 246 / 250}px`, left: `${vp.width - bw - INVITE_ART.bubble.x * k}px`, top: `${INVITE_ART.bubble.y * k + bh}px` });
  bubble.style.setProperty('--k', String(k));
  const p = bubble.querySelector('p');
  p.style.fontSize = `${Math.max(9, 12 * k)}px`;
  if (p.textContent !== inv.text) p.textContent = inv.text;
}

function showStreetOverlay(lines, widthPx) {
  const node = el('lonely-street', 'lonely-street');
  const vp = viewport();
  if (!node) return;
  node.innerHTML = lines.map((l, i) => `<p${lines.length === 3 && i === 1 ? ' class="big"' : ''}>${String(l).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])}</p>`).join('');
  if (vp) {
    const w = widthPx * vp.scale;
    // top_y 25 in the source; the remake's street nameplate sits there, so the text goes under it.
    let top = vp.top + 25 * vp.scale;
    const plate = document.getElementById('street-nameplate');
    const root = rootEl();
    if (plate && root && plate.offsetParent !== null) {
      const pr = plate.getBoundingClientRect();
      top = Math.max(top, pr.bottom - root.getBoundingClientRect().top + 6);
    }
    Object.assign(node.style, { left: `${vp.left + (vp.width - w) / 2}px`, top: `${top}px`, width: `${w}px`, fontSize: `${Math.max(10, 12 * vp.scale)}px` });
  }
  node.style.opacity = '1';
  node.hidden = false;
  node.dataset.text = lines.join(' ');
  // G313: lonelinessShowRaceOverlay 498-520 and the party lines are vp_overlays: gone at move start.
  streetRelease ||= trackOverlay(() => {
    streetRelease = null;
    hideStreetOverlay();
  });
  clearTimeout(node._dim);
  // opacity 1, then 0.5 after 3 s over 300 ms (lonelinessShowRaceOverlay 497-507).
  node._dim = setTimeout(() => { node.style.opacity = String(LONELY_RULES.overlayDim); }, LONELY_RULES.overlayDimAfterMs);
}

function hideStreetOverlay() {
  streetRelease?.();
  streetRelease = null;
  const node = typeof document === 'undefined' ? null : document.getElementById('lonely-street');
  if (node) {
    node.hidden = true;
    node.dataset.text = '';
  }
}

/**
 * lonelinessEndPartyOverlay's vp_overlay: the fireworks SWF at 1:1 on the
 * 960-wide viewport, its stage centred on the x/y percentages, shown for
 * fireworkMs. A burst of dots stands in if the art cannot load.
 * Austin, 2026-10-25 (desk FIREWORKS, register G250): keep them 1:1 but
 * under speech bubbles and prompts, so the spirit's lines stay readable. The
 * client drew a vp_overlay over the whole location; here each frame is
 * drawn into a canvas texture at the bottom of the world's fx layer (the
 * bubbles, the verb prompt and floating text all sit above it), kept on the
 * camera.
 */
function fireworks(engine, at) {
  const vp = viewport();
  if (!vp) return;
  ensureCss();
  rt.fireworks = (rt.fireworks || 0) + 1;
  fireworksUnder(engine, at, vp, LONELY_RULES.fireworkMs).then((ok) => {
    if (ok === null) {
      rt.fireworksArt = 'cancelled'; // a street change took it down (G311)
      return;
    }
    if (!ok) burst(at);
    rt.fireworksArt = ok ? 'under' : 'dots';
  });
}

/**
 * One firework under the fx layer (see fireworks). Resolves true once played, false without art,
 * null when a street change cancelled it, loading or playing: each is a vp_overlay
 * (loneliness.js lonelinessEndPartyOverlay 355-430), and cancelAllOverlaysWeCan (193-215)
 * takes every one down on a move, so it joins overlay-art's cancel (G311).
 */
export async function fireworksUnder(engine, at, vp, durationMs) {
  const PIXI = engine?.PIXI;
  const layer = engine?.fxLayer;
  if (!PIXI?.Sprite || !PIXI.Texture?.from || !layer || typeof document === 'undefined') return false;
  let cancelled = false;
  let sprite = null;
  const release = trackOverlay(() => {
    cancelled = true;
    if (sprite && !sprite.destroyed) sprite.visible = false;
  });
  let art;
  try {
    art = await loadVectorFrames(at.key);
  } catch {
    release();
    return false;
  }
  if (cancelled) return null;
  if (layer.destroyed) {
    release();
    return false;
  }
  const { meta, imgs } = art;
  // The viewport in logical px (the view's width), drawn at the screen's resolution.
  const w = Math.max(1, Math.round(vp.width / vp.scale));
  const h = Math.max(1, Math.round(vp.height / vp.scale));
  const res = Math.min(2, Math.max(1, vp.scale * (globalThis.devicePixelRatio || 1)));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * res);
  canvas.height = Math.round(h * res);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    release();
    return false;
  }
  const texture = PIXI.Texture.from(canvas);
  sprite = new PIXI.Sprite(texture);
  sprite.eventMode = 'none';
  sprite.label = `overlay:${at.key}`;
  sprite.alpha = 0;
  sprite.width = w;
  sprite.height = h;
  layer.addChildAt(sprite, 0);
  const place = overlayPlacement(meta, w * at.x, h * at.y, 1);
  const life = overlayLifeMs(durationMs);
  const t0 = performance.now();
  let shown = -1;
  await new Promise((resolve) => {
    const step = (t) => {
      const ms = t - t0;
      if (ms >= life || sprite.destroyed || cancelled) {
        resolve();
        return;
      }
      const cam = engine.camera;
      sprite.x = cam.x;
      sprite.y = cam.y;
      const f = overlayFrameAt(meta, ms);
      if (f !== shown && imgs[f]?.complete) {
        shown = f;
        ctx.setTransform(res, 0, 0, res, 0, 0);
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(imgs[f], place.left, place.top, place.width, place.height);
        texture.source?.update?.();
      }
      sprite.alpha = overlayAlpha(ms, durationMs);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  release();
  if (!sprite.destroyed) sprite.destroy();
  texture.destroy(true);
  return cancelled ? null : true;
}

/** Load the three fireworks before the party ends (the client loaded each SWF on announce). */
function preloadFireworks() {
  for (const key of new Set(LONELY_RULES.fireworks.map((fw) => fw.key))) loadVectorFrames(key).catch(() => {});
}

function burst(at) {
  const root = rootEl();
  const vp = viewport();
  if (!root || !vp || typeof document === 'undefined') return;
  ensureCss();
  const c = document.createElement('canvas');
  c.className = 'lonely-fireworks';
  const w = Math.round(vp.width);
  const h = Math.round(vp.height);
  c.width = w;
  c.height = h;
  Object.assign(c.style, { left: `${vp.left}px`, top: `${vp.top}px` });
  c.style.setProperty('--lw', `${w}px`);
  c.style.setProperty('--lh', `${h}px`);
  root.appendChild(c);
  // The stand-in goes with the street too (G311).
  let cancelled = false;
  const release = trackOverlay(() => {
    cancelled = true;
    c.remove();
  });
  const ctx = c.getContext('2d');
  const cx = w * at.x;
  const cy = h * at.y;
  const colors = ['#ffd54a', '#ff7a59', '#7fd3ff', '#b58cff', '#8be07a'];
  const dots = Array.from({ length: 48 }, (_, i) => ({ a: (i / 48) * Math.PI * 2, v: 0.6 + (i % 5) * 0.12, c: colors[i % colors.length] }));
  const t0 = performance.now();
  const step = (t) => {
    if (cancelled) return;
    const p = Math.min(1, (t - t0) / LONELY_RULES.fireworkMs);
    ctx.clearRect(0, 0, w, h);
    const r = 150 * vp.scale * Math.sqrt(p);
    ctx.globalAlpha = 1 - p;
    for (const d of dots) {
      ctx.fillStyle = d.c;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(d.a) * r * d.v, cy + Math.sin(d.a) * r * d.v + 40 * vp.scale * p * p, 3 * vp.scale, 0, Math.PI * 2);
      ctx.fill();
    }
    if (p < 1) requestAnimationFrame(step);
    else {
      release();
      c.remove();
    }
  };
  requestAnimationFrame(step);
}

/* ------------------------------------------------------------ the event */

function begin(engine, tsid, now, { type = '', option = null } = {}) {
  const pick = spiritForStreet({ hubId: indexMeta(tsid)?.hubId, tsid: streetKey(tsid) });
  const e = startEvent(state, {
    tsid,
    label: labelOf(tsid),
    variant: pick.variant,
    look: pick.look,
    now,
    type: type || engine.param('lonelytype') || '',
    option: option ?? (engine.param('lonelyoption') !== null && engine.param('lonelyoption') !== '' ? Number(engine.param('lonelyoption')) : null),
  });
  engine.save?.();
  if (streetKey(engine.streetTsid) === e.tsid) {
    // Lonely where you stand (QA &lonelydemo=here): no invite, as canDoLoneliness skips you.
    e.prompted = true;
    e.answer = 'here';
    arriveOnLonelyStreet(engine, now);
  } else {
    openInvite(engine, e, now);
  }
  publish(engine);
  return e;
}

/** onLonelinessPlayerEnter for the invited player, before any visit. */
function arriveOnLonelyStreet(engine, now) {
  const e = state.event;
  rt.zuttoNextAt = now + between(LONELY_RULES.zuttoFirstMs);
  rt.zuttoCryUntil = 0;
  // Shown once the loading card has gone, so its 3 s at full strength are seen.
  if (e.type === 'A') rt.pendingOverlay = { lines: LONELY_TEXT.raceOverlay, width: 200 };
  else {
    engine.pushActivity?.(LONELY_TEXT.partyActivity);
    rt.pendingOverlay = { lines: partyOverlayLines(0, 1), width: 300 };
  }
  rt.last = `arrived:${e.tsid}`;
}

function showPrompt(engine) {
  const e = state.event;
  e.prompted = true;
  rt.promptOpen = true;
  rt.last = 'prompt';
  engine.save?.();
  // inc_world_events.js showLonelinessPrompt 118-131: prompts_add, choices yes / no.
  rt.promptUid = engine.prompt?.({
    text: promptText(e.label),
    choices: [{ value: 'yes', label: LONELY_TEXT.promptYes }, { value: 'no', label: LONELY_TEXT.promptNo }],
    onChoice: (value) => answerPrompt(engine, value === 'yes' ? 'yes' : 'no'),
  }) || '';
}

/** The invite prompt went from the stack without an answer (prompts_remove, a cleared stack): count it as No. */
function promptGone(engine) {
  if (!rt.promptOpen || !rt.promptUid || typeof engine.prompts !== 'function') return false;
  const { shown = [], queued = [] } = engine.prompts() || {};
  return ![...shown, ...queued].some((p) => p.uid === rt.promptUid);
}

function answerPrompt(engine, answer) {
  if (!rt.promptOpen) return;
  rt.promptOpen = false;
  rt.promptUid = '';
  const e = state.event;
  if (!e) return;
  e.answer = answer;
  rt.last = `prompt:${answer}`;
  if (answer === 'yes') {
    // prompts_loneliness_callback: buildPath(location, here) -> get_path_to_location.
    const res = engine.query?.('mapRoute', 'set', { to: e.tsid, source: 'loneliness' }, engine);
    if (res && res.ok === false && res.error) engine.toast?.(res.error);
    rt.last = `route:${res?.ok ? 'set' : res?.error || 'none'}`;
  }
  engine.save?.();
  publish(engine);
}

function missed(engine) {
  const e = state.event;
  // G304: the invite is a stacked prompt now, so the missed prompt stacks over it
  // (cancelLoneliness 73-84 adds its own and leaves the invite); an answer to the
  // old invite then finds no event and does nothing.
  if (streetKey(engine.streetTsid) === e.tsid) hideStreetOverlay();
  closeInvite();
  engine.prompt?.({ text: missedText(e.label), choices: [{ label: 'OK', value: 'ok' }] });
  rt.last = `missed:${e.tsid}`;
  clearEvent(state, { missed: true });
  engine.save?.();
  publish(engine);
}

/** lonelinessVisit: the one invited player walks into the spirit. */
function visit(engine, target, now) {
  const e = state.event;
  const out = visitEvent(state, now);
  if (!out) return;
  hideStreetOverlay();
  rt.pendingOverlay = null;
  const name = playerName(engine);
  if (out.kind === 'race') {
    const convo = raceConversation({ option: e.option, name, numVisitors: out.numVisitors });
    rt.convoOpen = true;
    rt.last = `visit:race:${e.option}`;
    // The loneliness ends with the only visitor (clearLoneliness): the spirit stops crying now.
    clearEvent(state);
    engine.save?.();
    engine.scriptedDialogue({
      title: null,
      kicker: target?.state?.vendorLabel || 'Street Spirit',
      beats: convo.beats,
      cancelable: false,
      onComplete: () => {
        rt.convoOpen = false;
        // lonelinessGiveRaceXP: stats_add_xp(1000) with the mood bonus.
        const xp = engine.pc ? grantMoodXp(engine.pc, convo.xp) : 0;
        rt.xp = xp;
        rt.last = `cured:race:${xp}`;
        engine.pushActivity?.(rewardText('race', xp));
        engine.playSound?.('QUEST_COMPLETE', { volume: 0.4 });
        engine.updateHud?.();
        engine.save?.();
        publish(engine);
      },
    });
  } else {
    rt.last = 'visit:party';
    engine.say?.(target, partyStartLine(name), LONELY_RULES.partyStartBubbleMs);
    rt.party = { finishAt: out.partyAt, finishedAt: 0, jabberAt: 0, done: new Set(), street: streetKey(engine.streetTsid), target };
    preloadFireworks();
    clearEvent(state);
    engine.save?.();
  }
  publish(engine);
}

/** lonelinessFinishParty, the fireworks and the jabber. */
function tickParty(engine, now) {
  const p = rt.party;
  if (!p) return;
  const here = streetKey(engine.streetTsid) === p.street;
  const target = p.target?.sprite && !p.target.sprite.destroyed ? p.target : vendorSpirit(engine);
  if (!p.finishedAt && now >= p.finishAt) {
    p.finishedAt = now;
    p.jabberAt = now + LONELY_RULES.partyJabberMs;
    if (here && target) engine.say?.(target, LONELY_TEXT.partyFinish, 5000);
    // Only guests still on the street get the reward (loneliness.js 231).
    if (here && engine.pc) {
      const xp = grantMoodXp(engine.pc, LONELY_RULES.partyXp);
      rt.xp = xp;
      engine.pushActivity?.(rewardText('party', xp));
      engine.applyBuff?.(LONELY_RULES.partyBuff);
      engine.updateHud?.();
      rt.last = `cured:party:${xp}`;
    } else rt.last = 'party:away';
    engine.save?.();
  }
  if (p.finishedAt) {
    LONELY_RULES.fireworks.forEach((fw, i) => {
      if (p.done.has(i) || now < p.finishedAt + fw.at) return;
      p.done.add(i);
      if (streetKey(engine.streetTsid) !== p.street) return;
      fireworks(engine, fw);
      engine.playSound?.(LONELY_RULES.fireworkSound, { volume: 0.6 });
    });
    if (p.jabberAt && now >= p.jabberAt) {
      if (streetKey(engine.streetTsid) === p.street && target) engine.say?.(target, LONELY_TEXT.partyJabber, 5000);
      rt.party = null;
    }
  }
}

/** street_spirit_zutto.js declareLoneliness: a sad line every 10-15 s, hoverCry for 5 s. */
function tickZutto(engine, now, target) {
  if (!rt.zuttoNextAt || now < rt.zuttoNextAt) return;
  rt.zuttoNextAt = now + between(LONELY_RULES.zuttoEveryMs);
  if (rt.convoOpen || engine.questDialogueOpen?.()) return;
  engine.say?.(target, LONELY_TEXT.chatter[Math.floor(Math.random() * LONELY_TEXT.chatter.length)], 4000);
  rt.zuttoCryUntil = now + LONELY_RULES.zuttoCryMs;
}

function tickHere(engine, now) {
  const e = state.event;
  const target = rt.target?.sprite && !rt.target.sprite.destroyed ? rt.target : (rt.target = vendorSpirit(engine));
  if (!target || !engine.player) return;
  if (e.variant === 'zutto') tickZutto(engine, now, target);
  const p = engine.player;
  const near = Math.abs(p.x - target.sprite.x) <= VISIT_DX && Math.abs(p.y - target.sprite.y) <= VISIT_DY;
  const entering = near && !rt.wasNear;
  rt.wasNear = near;
  if (!near) return;
  if (!dialogFree(engine)) {
    // Collision fires on the way in; a dialog in the way holds it until it closes.
    rt.wasNear = false;
    return;
  }
  if (entering) visit(engine, target, now);
}

/* ------------------------------------------------------------ the solo picker */

function lookForLonely(engine, now) {
  state.nextCheckAt = now + LONELY_RULES.checkEveryMs;
  const here = engine.streetTsid;
  const closed = closedSet(engine);
  const lengths = pathLengths(here, closed);
  const candidates = [];
  for (const tsid of spiritStreets()) {
    const key = graphKey(graph, tsid);
    candidates.push({ tsid, pathLength: key ? lengths.get(key) || 0 : 0 });
  }
  const pick = pickLonelySpirit(state, candidates, { now });
  rt.last = pick ? `picked:${pick}` : 'picked:none';
  if (!pick || !canInvite({ here, lonely: pick, offWorld: offWorld(engine), pathLength: pathLength(here, pick, closed) })) {
    engine.save?.();
    return null;
  }
  return begin(engine, pick, now);
}

/* ------------------------------------------------------------ QA */

function demo(engine, now) {
  if (rt.demoDone) return;
  const mode = engine.param('lonelydemo');
  if (!mode) {
    rt.demoDone = true;
    return;
  }
  if (!graph || now - rt.enteredAt < 1500 || !engine.player) return;
  rt.demoDone = true;
  for (const t of String(engine.param('lonelyseed') || '').split(',').map((s) => s.trim()).filter(Boolean)) {
    state.visits[streetKey(t)] = { n: 1, lastAt: 0 };
  }
  if (state.event) clearEvent(state);
  if (mode === 'here') begin(engine, engine.streetTsid, now);
  else if (mode === 'pick') lookForLonely(engine, now);
  else if (/^[GL][A-Z0-9]+$/.test(mode)) {
    const ok = canInvite({ here: engine.streetTsid, lonely: mode, offWorld: offWorld(engine), pathLength: pathLength(engine.streetTsid, mode) });
    rt.last = ok ? 'demo' : 'demo:too-close';
    begin(engine, mode, now);
  }
}

function autoplay(engine, now) {
  const mode = engine.param('lonelyautoplay');
  if (!mode || typeof document === 'undefined') return;
  const next = document.getElementById('quest-dialogue-next');
  if (rt.promptOpen && (mode === 'yes' || mode === '1')) {
    if (!rt.autoAt) rt.autoAt = now + 1500;
    if (now >= rt.autoAt) {
      rt.autoAt = 0;
      // The stacked prompt's first choice (Yes).
      document.querySelector(`[data-prompt-uid="${rt.promptUid}"] [data-prompt-choice="0"]`)?.click();
    }
    return;
  }
  if (rt.convoOpen && mode === '1') {
    if (!rt.autoAt) rt.autoAt = now + 1200;
    if (now >= rt.autoAt) {
      rt.autoAt = 0;
      next?.click();
    }
    return;
  }
  if (!lonelyHere(engine) || !['near', 'close', 'visit', '1'].includes(mode)) return;
  const target = rt.target;
  if (!target?.sprite || !engine.player) return;
  const key = `${engine.streetTsid}:${mode}`;
  if (rt.autoStep !== key) {
    rt.autoStep = key;
    rt.autoAt = now + Math.max(0, Number(engine.param('lonelywait')) || 2500);
    // Stand off first so the walk in is a real collision.
    engine.player.x = target.sprite.x + (mode === 'close' ? 180 : 330);
    engine.player.y = target.sprite.y - 4;
    engine.player.vx = 0;
    engine.snapCamera?.();
    return;
  }
  if (mode !== 'near' && mode !== 'close' && rt.autoAt && now >= rt.autoAt) {
    rt.autoAt = 0;
    engine.player.x = target.sprite.x + 60;
    engine.player.vx = 0;
  }
}

/* ------------------------------------------------------------ feature */

export const spiritLonelinessFeature = {
  id: SPIRIT_LONELINESS_FEATURE_ID,

  init(engine) {
    rt = freshRuntime();
    loadGraph();
    publish(engine);
  },

  save() {
    return state;
  },

  restore(slice) {
    state = normalizeLonelyState(slice || {});
    // A party or race that was under way when the game closed has finished.
    if (state.event?.visitedAt) clearEvent(state);
  },

  onStreetEnter(_street, engine) {
    const now = Date.now();
    rt.enteredAt = now;
    rt.here = streetKey(engine.streetTsid);
    rt.target = vendorSpirit(engine);
    rt.wasNear = false;
    rt.autoStep = '';
    hideStreetOverlay();
    if (!state.seeded) seedVisits(state, (engine.visitedStreets?.() || []).filter(hasSpirit));
    // onLonelinessPlayerEnter: recent_visits++ (your own visit).
    if (hasSpirit(engine.streetTsid) && !offWorld(engine)) noteVisit(state, engine.streetTsid, now);
    if (!state.nextCheckAt) state.nextCheckAt = now + LONELY_RULES.checkEveryMs;
    if (lonelyHere(engine)) arriveOnLonelyStreet(engine, now);
    publish(engine);
  },

  onStreetClear() {
    rt.pendingOverlay = null;
    rt.target = null;
    rt.wasNear = false;
    hideStreetOverlay();
  },

  onTick(_dtMs, _t, engine) {
    if (!engine.started) return;
    const now = Date.now();
    demo(engine, now);
    // A talk closed some other way (Escape, a forced close) counts as unanswered.
    // (A dialog held behind a menu, G217, has not been seen yet.)
    const open = Boolean(engine.questDialogueOpen?.());
    if (open && rt.convoOpen) rt.dialogSeen = true;
    if (!open && rt.dialogSeen) {
      rt.dialogSeen = false;
      rt.convoOpen = false;
    }
    // The invite taken from the stack unanswered counts as No.
    if (promptGone(engine)) answerPrompt(engine, 'no');
    if (rt.invite) drawInvite(now);
    if (rt.pendingOverlay && !engine.streetCardUp?.()) {
      if (lonelyHere(engine)) showStreetOverlay(rt.pendingOverlay.lines, rt.pendingOverlay.width);
      rt.pendingOverlay = null;
    }
    tickParty(engine, now);
    const e = state.event;
    if (e) {
      if (expired(e, now)) {
        missed(engine);
      } else if (promptDue(e, now) && dialogFree(engine)) {
        showPrompt(engine);
      } else if (lonelyHere(engine)) {
        tickHere(engine, now);
      }
    } else if (graph && checkDue(state, now) && now - rt.enteredAt > SETTLE_MS && dialogFree(engine) && !offWorld(engine) && !qaRoute(engine)) {
      lookForLonely(engine, now);
    }
    autoplay(engine, now);
    if (now - (rt.publishedAt || 0) > 250) {
      rt.publishedAt = now;
      publish(engine);
    }
  },

  /** street-spirits-feature: play the cry clip (Groddle and Firebog while lonely, Uralia in its bursts). */
  spiritCry(engine) {
    if (!lonelyHere(engine)) return false;
    if (state.event.variant === 'zutto') return Date.now() < rt.zuttoCryUntil;
    return true;
  },

  /** street-spirits-feature: no conversation offers while this street's spirit is lonely. */
  spiritLonelyHere(engine) {
    return lonelyHere(engine) || null;
  },

  /** QA / tests. */
  _state() {
    return state;
  },
  _runtime() {
    return rt;
  },
  _reset() {
    state = createLonelyState();
    rt = freshRuntime();
  },
  _setGraph(g) {
    graph = g && g.streets ? routeGraph(g).graph : g;
  },
  _begin(engine, tsid, opts = {}) {
    return begin(engine, tsid, opts.now || Date.now(), opts);
  },
  _visit(engine, target) {
    return visit(engine, target, Date.now());
  },
  _look(engine, now = Date.now()) {
    return lookForLonely(engine, now);
  },
};
