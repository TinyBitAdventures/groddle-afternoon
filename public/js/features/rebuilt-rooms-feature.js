/**
 * The rooms rebuilt from players' pictures (register rows G157 Snowed In and
 * Growing Stuff, G158 Martleby Hare, G159 Ethereal Endeavour; street data in
 * js/rebuilt-rooms.js, written by tools/build-rebuilt-rooms.mjs).
 *
 * - Ecology: none of the four has location XML, so build-street-ecology.mjs
 *   has no row and the fallback would put piggies, a vendor and a shrine in
 *   them. Snowed In, Growing Stuff and Ethereal Endeavour are rooms (nothing spawned;
 *   Ethereal Endeavour keeps the quoins its snap shows); Martleby Hare is the
 *   bare cliff Zog's Glitchy Tools lists nothing on.
 * - QA data while in one: rebuiltRoom (its TSID, '' elsewhere).
 * - Winter Walk's caption line (G352, js/winter-walk-streets.js WINTER_WALK_CAPTION; Austin
 *   2026-10-28: one-off approval), placed in the street like the source's deco sign text.
 *   QA data: winterCaption ('1' while drawn).
 *
 * QA: ?autostart=1&questoffer=off&doordemo=GA9R6BM705F3L3N&doorautoplay=1 (Snowed In),
 *   doordemo=GA94GCF7H3D30IM&doorkey=1&doorautoplay=1 (Ethereal Endeavour),
 *   doordemo=GCR169OSLQL13JR&doorkey=2&doorautoplay=1 (Martleby Hare),
 *   doordemo=GA9R4OR505F3PSL&doorautoplay=1 (Growing Stuff),
 *   doordemo=GLIFIG7BP8G1MU9&doorautoplay=1 (Louise Pasture Villa, G371: js/louise-pasture-villa.js,
 *   an empty hall indoors like the others).
 * - G472: Winter Walk's big icicles fall when you walk under them and stand in the snow as
 *   pillars you can climb (js/winter-icicles.js, from the recording 2Xko9Hy-cLE 1:25-1:29).
 *   QA data: winterIcicles ("1:hang,2:down,..."). QA: ?autostart=1&fresh=1&resetgame=1&questoffer=off
 *   &questdemo=winter&wintericicles=near sets you down on the floor 220 px short of the first
 *   icicle (walk right under it); &wintericicles=drop drops them all on arrival (screenshots).
 * - G682: the two skill-quest practice streets (js/practice-streets.js) are empty too (the
 *   quest rooms place what their scripts did), and their wooden EXIT arrows carry the word the
 *   snaps show (drawn here, as the client drew a deco's sign text). QA data: practiceExit.
 *   QA: ?autostart=1&fresh=1&resetgame=1&questoffer=off&questdemo=ezcooking_1 (or
 *   soilappreciation_1); the tutorial's pick: &newxp=skill&newxpskill=ezcooking_1.
 */

import { isRebuiltRoomTsid, rebuiltRoomEcology } from '../rebuilt-rooms.js?v=8c2eaf24';
import { isLouiseVillaTsid, louiseVillaEcology } from '../louise-pasture-villa.js?v=9d267f7e';
import { isPracticeStreetTsid, practiceExitSign, practiceStreetEcology } from '../practice-streets.js?v=b170eb1d';
import { textureFromUrl } from '../textures.js?v=814d7926';
import {
  ICICLE_PILLAR_ASPECT,
  ICICLE_PILLAR_SPRITE,
  ICICLE_SOUND,
  createIcicleState,
  fallProgress,
  fallenIcicle,
  icicleSummary,
  stepIcicles,
} from '../winter-icicles.js?v=04c0780f';
import { WINTER_WALK_FLOOR_Y, WINTER_WALK_ICICLES, WINTER_WALK_BOUNDS, WINTER_WALK_CAPTION, WINTER_WALK_TSID, winterStreetEcology } from '../winter-walk-streets.js?v=d1c7d113';

export const REBUILT_ROOMS_FEATURE_ID = 'rebuilt-rooms';

const isRoom = (tsid) => isRebuiltRoomTsid(tsid) || isLouiseVillaTsid(tsid);

let caption = null;
let icicles = null;

/* ------------------------------------------------------------------ */
/* G472: Winter Walk's falling icicles                                 */
/* ------------------------------------------------------------------ */

const toScreen = (x, y) => ({ x: x - WINTER_WALK_BOUNDS.l, y: y - WINTER_WALK_BOUNDS.t });
const icicleView = (engine, i) => engine.decoViews?.get(`walk_icicle_${i + 1}`) || null;

function startIcicles(engine) {
  icicles = { state: createIcicleState(WINTER_WALK_ICICLES.length), from: [], pillars: [] };
  engine.setData('winterIcicles', icicleSummary(icicles.state));
}

/** The fallen icicle's pillar and its standable cap (re-made if the street view was rebuilt). */
function standIcicle(engine, i) {
  const ic = WINTER_WALK_ICICLES[i];
  const f = fallenIcicle(ic, WINTER_WALK_FLOOR_Y);
  const plats = engine.platforms;
  const id = `plat_ww_fallen_icicle_${i + 1}`;
  if (Array.isArray(plats) && !plats.some((p) => p.id === id)) {
    const a = toScreen(f.plat.x1, f.plat.y);
    const b = toScreen(f.plat.x2, f.plat.y);
    plats.push({ id, x1: a.x, y1: a.y, x2: b.x, y2: b.y, pcPerm: -1, itemPerm: -1 });
  }
  const view = icicleView(engine, i);
  if (view) {
    view.visible = false;
    view.renderable = false;
  }
  const old = icicles.pillars[i];
  if (old && !old.destroyed && old.parent) return;
  const PIXI = engine.PIXI;
  // With the walk's own pillars (their container and depth: behind the avatar, under the motes).
  const like = engine.decoViews?.get('walk_pillar_1') || view;
  const parent = like?.parent;
  if (!PIXI || !parent) return;
  // The walk's pillar art at its own shape, snow cap up: the cap's top just over the standable
  // line, the point stuck deep in the snow (the walk's front ground covers it past the floor).
  const h = Math.round(f.w * ICICLE_PILLAR_ASPECT);
  const foot = toScreen(f.x, f.top - 14 + h);
  const spr = new PIXI.Sprite(textureFromUrl(`assets/decos/groddle/${ICICLE_PILLAR_SPRITE}.png`));
  spr.anchor.set(0.5, 1);
  spr.x = foot.x;
  spr.y = foot.y;
  spr.width = f.w;
  spr.height = h;
  spr.zIndex = like.zIndex;
  spr.eventMode = 'none';
  parent.addChild(spr);
  // Snow heaped round its foot, as round the walk's pillars (snow_rubble_01c_al1).
  const heap = new PIXI.Sprite(textureFromUrl('assets/decos/groddle/snow_rubble_01c_al1.png'));
  const base = toScreen(f.x, WINTER_WALK_FLOOR_Y + 30);
  heap.anchor.set(0.5, 1);
  heap.x = base.x;
  heap.y = base.y;
  heap.width = Math.round(f.w * 1.15);
  heap.height = 70;
  heap.zIndex = like.zIndex + 1;
  heap.eventMode = 'none';
  parent.addChild(heap);
  spr.on?.('destroyed', () => { if (!heap.destroyed) heap.destroy(); });
  icicles.pillars[i] = spr;
}

function tickIcicles(engine, now) {
  if (!icicles) startIcicles(engine);
  const { state } = icicles;
  const qa = engine.param?.('wintericicles');
  if (qa === 'near' && !icicles.placed && engine.player) {
    icicles.placed = true;
    const at = toScreen(WINTER_WALK_ICICLES[0].x - 220, WINTER_WALK_FLOOR_Y - 4);
    Object.assign(engine.player, { x: at.x, y: at.y, vx: 0, vy: 0 });
    engine.snapCamera?.();
  }
  if (qa === 'drop') for (let i = 0; i < state.stage.length; i += 1) if (state.stage[i] === 'hang') state.stage[i] = 'down';
  const p = engine.player;
  const feet = p ? { x: p.x + WINTER_WALK_BOUNDS.l, y: p.y + WINTER_WALK_BOUNDS.t } : null;
  const { started, landed } = stepIcicles(state, WINTER_WALK_ICICLES, p?.onGround ? feet : null, WINTER_WALK_FLOOR_Y, now);
  for (const i of started) {
    const view = icicleView(engine, i);
    icicles.from[i] = view ? view.y : null;
  }
  state.stage.forEach((stage, i) => {
    if (stage !== 'fall') return;
    const view = icicleView(engine, i);
    if (!view || icicles.from[i] == null) return;
    // Its point drops to the snow, gathering speed.
    const land = toScreen(0, WINTER_WALK_FLOOR_Y + 6).y;
    view.y = icicles.from[i] + (land - icicles.from[i]) * fallProgress(state, i, now);
  });
  if (landed.length) engine.playSound?.(ICICLE_SOUND, { volume: 0.7 });
  state.stage.forEach((stage, i) => { if (stage === 'down') standIcicle(engine, i); });
  if (started.length || landed.length || engine.param?.('wintericicles')) engine.setData('winterIcicles', icicleSummary(state));
}
let exitWord = null;

function clearExitWord(engine) {
  if (exitWord && !exitWord.destroyed) {
    exitWord.parent?.removeChild(exitWord);
    exitWord.destroy();
  }
  exitWord = null;
  engine?.setData?.('practiceExit', '');
}

/** The practice street's EXIT arrow word (street-screen space; the streets' top-left is 0, -1000). */
function drawExitWord(engine, street) {
  const PIXI = engine.PIXI;
  const sign = practiceExitSign(street?.tsid);
  const layer = engine.entityLayer;
  if (!PIXI || !layer || !sign) return;
  const t = new PIXI.Text({ text: sign.text, style: {
    fontFamily: 'Nunito, "Trebuchet MS", sans-serif',
    fontSize: sign.size,
    fontWeight: '900',
    fill: 0xf6e7b8,
    letterSpacing: 1,
    stroke: { color: 0x5a3a1c, width: 3, join: 'round' },
  } });
  t.resolution = 3;
  t.anchor.set(0.5, 0.5);
  t.x = sign.x - (street.bounds?.l || 0);
  t.y = sign.y - (street.bounds?.t || 0);
  t.zIndex = 3;
  t.eventMode = 'none';
  layer.addChild(t);
  exitWord = t;
  engine.setData('practiceExit', sign.text);
}

function clearCaption(engine) {
  if (caption && !caption.destroyed) {
    caption.parent?.removeChild(caption);
    caption.destroy();
  }
  caption = null;
  engine?.setData?.('winterCaption', '');
}

/** Winter Walk's placed caption (street-screen space: world minus the street's top-left). */
function drawCaption(engine) {
  const PIXI = engine.PIXI;
  // Over the world. The background trunks scroll behind the text as you walk (parallax), so a soft
  // snow-coloured edge keeps the dark letters readable where a trunk passes (ours: the snaps show
  // the text over thin branches only).
  const layer = engine.fxLayer || engine.entityLayer;
  if (!PIXI || !layer) return;
  const c = WINTER_WALK_CAPTION;
  const t = new PIXI.Text({ text: c.lines.join('\n'), style: {
    fontFamily: 'Nunito, "Trebuchet MS", sans-serif',
    fontSize: 17,
    fontWeight: '800',
    fill: c.fill,
    align: 'center',
    lineHeight: 21,
    stroke: { color: 0xf3f5f7, width: 4, join: 'round' },
  } });
  t.resolution = 3;
  t.anchor.set(0.5, 0.5);
  t.x = c.x - WINTER_WALK_BOUNDS.l;
  t.y = c.y - WINTER_WALK_BOUNDS.t;
  t.zIndex = 1;
  t.eventMode = 'none';
  layer.addChild(t);
  caption = t;
  engine.setData('winterCaption', '1');
}

export const rebuiltRoomsFeature = {
  id: REBUILT_ROOMS_FEATURE_ID,

  ecologyOverride(street) {
    // Winter Walk and Winter Haven (js/winter-walk-streets.js) are empty too: the route clears them.
    return rebuiltRoomEcology(street?.tsid) || louiseVillaEcology(street?.tsid) || winterStreetEcology(street?.tsid) || practiceStreetEcology(street?.tsid);
  },

  onStreetEnter(street, engine) {
    engine.setData('rebuiltRoom', isRoom(street?.tsid) ? String(street.tsid) : '');
    clearCaption(engine);
    if (street?.tsid === WINTER_WALK_TSID) drawCaption(engine);
    icicles = null;
    engine.setData('winterIcicles', '');
    if (street?.tsid === WINTER_WALK_TSID) startIcicles(engine);
    clearExitWord(engine);
    if (isPracticeStreetTsid(street?.tsid)) drawExitWord(engine, street);
  },

  onStreetClear(engine) {
    engine.setData('rebuiltRoom', '');
    clearCaption(engine);
    clearExitWord(engine);
    icicles = null;
    engine.setData('winterIcicles', '');
  },

  /** The walk's stages clear the world after the street is entered (game.js setupWinterWalkStage): put it back. */
  onTick(dtMs, now, engine) {
    if (isPracticeStreetTsid(engine.streetTsid) && (!exitWord || exitWord.destroyed || !exitWord.parent)) {
      clearExitWord(engine);
      drawExitWord(engine, engine.street);
    }
    if (engine.streetTsid !== WINTER_WALK_TSID) return;
    tickIcicles(engine, now);
    if (!caption || caption.destroyed || !caption.parent) {
      clearCaption(engine);
      drawCaption(engine);
    }
  },
};
