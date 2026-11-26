/**
 * Constellation and Beam Me Down: two puzzle levels whose streets were never
 * archived, rebuilt as feature scenes (engine.enterScene) from their reference
 * videos and recovered CC0 art. Rules and layout: js/puzzle-scenes.js.
 *
 * - Constellation: click the sky's stars in order (the first one pulses) to
 *   draw a piggy; closing the outline lights its eye. A miss or a pause makes
 *   the next star twinkle. First finish: +150 iMG, +50 mood.
 * - Beam Me Down: step off the start cloud and steer through the saucers'
 *   tractor beams, which slow the fall and hold 21 quoins (1 each times your
 *   quoin multiplier, outside the day's limit). Landing shows "Bravo! You made it!"; the first
 *   landing pays +138 iMG. Entered with a Ticket To Beam Me Down (pack:
 *   Activate, or the Map's puzzle card), a Ticket to Paradise like the rest:
 *   it costs the ticket price and counts in the day's 11.
 * Both leave by their EXIT door back to the street they were entered from;
 * map travel waits for the door, and a reload resumes on that street.
 *
 * G904: a party teleporter taken in either scene holds it (Glitch kept an instance left for
 * another instance: groups/instance.js player_exited_location 343-363): the scene is parked whole
 * (engine.parkScene) and the party leads back to the spot you left, stars and quoins as they were.
 * A reload at the party keeps it (save.away): the scene is built again with the stars drawn so far
 * and the quoins already taken gone (Beam Me Down's skip the day's limit; never paid twice).
 *
 * QA: ?autostart=1&questoffer=off&scenedemo=constellation|beam_me_down;
 * &sceneautoplay=1 solves it (constellation: clicks every star in order;
 * beam: drops through each beam's quoins, lands, and leaves; &scenehold=1
 * stays for a screenshot). Canvas data:
 * sceneId, sceneStatus, sceneProgress, sceneQuoins, sceneReward, sceneDemo.
 */

import { countItem, ensureItem } from '../inventory.js?v=6414dbdc';
import { QUOIN_SHEET, QUOIN_TYPES, creditQuoinStat, quoinPay, quoinTouches } from '../quoins.js?v=5abad2c7';
import {
  BEAM_ME_DOWN,
  CONSTELLATION,
  SCENES,
  SKY_BOX,
  beamAt,
  beamPhysics,
  beamQuoins,
  clickConstellation,
  createConstellationRun,
  fieldStars,
  fieldStarsIn,
  doorBox,
  fitSky,
  skyPoint,
  isPuzzleSceneTsid,
  nextStarIndex,
  normalizeSceneSave,
  sceneTsid,
} from '../puzzle-scenes.js?v=04413a6d';
import { gainMetabolic } from '../metabolics.js?v=48f784bf';
import { frameTexture, isLoaded, onLoaded, sourceFromUrl, textureFromUrl } from '../textures.js?v=b8e38103';
import { grantMoodXp } from '../mood-xp.js?v=e311b45c';
import { partySpaceForStreet } from '../party-spaces.js?v=4e1ca2a5';
import { anchorBottomCentre } from '../sprite-feet.js?v=6358a697';
import { WORLD_FONT_FAMILY } from '../world-text.js?v=6b49f88c';

export const PUZZLE_SCENES_FEATURE_ID = 'puzzle-scenes';
const TICKET = 'paradise_ticket_beam_me_down';
const DECO = 'assets/decos/groddle/';
const ART = 'assets/sprites/puzzles/';

let save = normalizeSceneSave();
let active = null; // { id, scene, views, quoins, taken, ... }
let entering = false;
let demo = { stage: 'idle', at: 0, queue: [] };
let lastData = 0;
// G904: away at a party with the scene held ({ parked, x, y, scale }).
let away = null;
let resumeOnBoot = false;

ensureItem(TICKET, {
  label: 'Ticket To Beam Me Down',
  desc: 'A one-way trip down past some very friendly flying saucers.',
  baseCost: 0,
  stackMax: 11,
});

/* ------------------------------------------------------------------ */
/* Drawing                                                            */
/* ------------------------------------------------------------------ */

function skyTexture(PIXI, h, stops) {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  for (const [at, colour] of stops) grad.addColorStop(at, colour);
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  return PIXI.Texture.from(canvas);
}

function deco(PIXI, name, x, y, { w, h, alpha = 1, tint, ax = 0.5, ay = 1, rotation = 0 } = {}) {
  const spr = new PIXI.Sprite(textureFromUrl(`${DECO}${name}.png`));
  spr.anchor.set(ax, ay);
  spr.x = x;
  spr.y = y;
  spr.alpha = alpha;
  spr.rotation = rotation;
  if (tint != null) spr.tint = tint;
  const size = () => {
    if (w) spr.width = w;
    if (h) spr.height = h;
  };
  if (isLoaded(spr.texture)) size();
  else onLoaded(spr.texture.source, size);
  return spr;
}

function cloudBank(PIXI, root, scene, y, tint) {
  for (let x = -640, i = 0; x < scene.width + 700; x += 240, i += 1) {
    root.addChild(deco(PIXI, i % 2 ? 'cloud_fluffy_1' : 'cloud_fluffy_2', x, y + 120, { w: 420, h: 200, tint, alpha: 0.95 }));
  }
  const under = new PIXI.Graphics();
  under.rect(-640, y + 60, scene.width + 1280, 600).fill({ color: tint ?? 0xe8eef4, alpha: 1 });
  root.addChild(under);
}

/**
 * G962: Beam Me Down's pieces, from the Eleven collectors' full-street snaps (900 x 5000 at 1 px a
 * unit) and 22 players' snaps (reference only): newxp cloud banks for the floor and its two end banks,
 * door_asset_heights_interior darkened with a plank EXIT sign, and the tractor beams as soft light.
 */
/** G1160: Beam Me Down's sky, sampled from the players' full-street snaps (top 1e2c2f, 30% 272e33, 60% 1a1724, 90% 1f1424). */
export const BEAM_SKY = Object.freeze([[0, '#1e2c2f'], [0.3, '#242c31'], [0.6, '#1a1724'], [1, '#1f1424']]);

export const BEAM_ART = Object.freeze({
  clouds: Object.freeze(['clouds_bg_middleplus_01a_newxp', 'clouds_bg_middleplus_01b_newxp']),
  // The snaps' floor reads (188, 186, 173) to (159, 171, 163): the newxp clouds washed mint.
  cloudTint: 0xcfd9cb,
  door: 'assets/sprites/paradise/sky_plunge/door_asset_heights_interior@2x.webp',
  // The street snap's door is very dark wood: (76, 62, 13) lit, (14, 1, 0) in shade.
  doorTint: 0x5a4636,
  // 1.47 x a player in the snap (140 to 95); the avatar here is 0.6 of its size.
  doorHeight: 104,
  plank: 'groddle_sign_blank_plank',
  beamColour: [255, 244, 212],
});

/** A newxp cloud piece by its pixel width (the files are 2x, so scale 1 is 2x the stage size). */
function cloudPiece(PIXI, i, x, y, width, { flip = false, tint = BEAM_ART.cloudTint, alpha = 1, ay = 1, squash = 1 } = {}) {
  const name = BEAM_ART.clouds[i % 2];
  const px = i % 2 ? 646 : 1766;
  const spr = new PIXI.Sprite(textureFromUrl(`${DECO}${name}.png`));
  spr.anchor.set(0.5, ay);
  const sc = width / px;
  spr.scale.set(flip ? -sc : sc, sc * squash);
  spr.x = x;
  spr.y = y;
  spr.tint = tint;
  spr.alpha = alpha;
  return spr;
}

/**
 * The landing (the street snap's bottom 500 rows): a bumpy cloud floor whose tops stand about 50
 * over the walking line, three rows deep, and tall banks at both ends (the left to about 370 over
 * the floor, the right to about 300, the EXIT door at its foot).
 */
function beamLanding(PIXI, root, scene) {
  const y = scene.floorY;
  for (let x = -500, i = 0; x < scene.width + 600; x += 520, i += 1) {
    root.addChild(cloudPiece(PIXI, 1, x + 120, y + 125, 520, { flip: i % 2 === 1, alpha: 0.96 }));
  }
  const bank = (x, rise, flip) => {
    for (let k = 0, top = y - rise; top < y; k += 1, top += 110) {
      root.addChild(cloudPiece(PIXI, 1, x + (k % 2 ? 26 : -18) * (flip ? -1 : 1), top + 150, 340 - k * 12, { flip: (k % 2 === 1) !== flip }));
    }
  };
  bank(40, 370, false);
  bank(scene.width - 30, 300, true);
  for (const [row, dy, w] of [[0, 150, 900], [1, 290, 1100], [2, 430, 1100]]) {
    for (let x = -600 + row * 230, i = 0; x < scene.width + 700; x += w * 0.7, i += 1) {
      root.addChild(cloudPiece(PIXI, 0, x, y + dy, w, { flip: (i + row) % 2 === 1 }));
    }
  }
}

let beamTexture = null;
/**
 * The tractor beam: a soft cone of warm light, feathered at its edges, fading downward, with faint
 * streaks (snaps 101273, 95023, 94496, 95986, 58487). Light, not a picture: a canvas gradient, drawn
 * once at the cone's own size (beamTop wide at the saucer, beamBottom at the foot), so it still
 * matches beamAt's cone.
 */
function beamConeTexture(PIXI, scene) {
  if (beamTexture && !beamTexture.destroyed) return beamTexture;
  const W = Math.ceil(scene.beamBottom * 1.3);
  const H = Math.ceil(scene.beamLength);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  const [r, gr, b] = BEAM_ART.beamColour;
  const rgba = (a) => `rgba(${r},${gr},${b},${a})`;
  for (let y = 0; y < H; y += 1) {
    const t = y / (H - 1);
    const half = ((scene.beamTop + (scene.beamBottom - scene.beamTop) * t) / 2) * 1.2;
    const a = 0.05 + 0.5 * (1 - t) ** 1.4;
    const grad = g.createLinearGradient(W / 2 - half, 0, W / 2 + half, 0);
    grad.addColorStop(0, rgba(0));
    grad.addColorStop(0.22, rgba(a * 0.55));
    grad.addColorStop(0.5, rgba(a));
    grad.addColorStop(0.78, rgba(a * 0.55));
    grad.addColorStop(1, rgba(0));
    g.fillStyle = grad;
    g.fillRect(W / 2 - half, y, half * 2, 1);
  }
  g.globalCompositeOperation = 'lighter';
  for (const [u, a] of [[-0.55, 0.05], [-0.25, 0.08], [0.05, 0.07], [0.32, 0.06], [0.6, 0.04]]) {
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, rgba(a));
    grad.addColorStop(1, rgba(0));
    g.strokeStyle = grad;
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(W / 2 + u * scene.beamTop * 0.45, 0);
    g.lineTo(W / 2 + u * scene.beamBottom * 0.5, H);
    g.stroke();
  }
  beamTexture = PIXI.Texture.from(canvas);
  return beamTexture;
}

function buildConstellation(engine) {
  const { PIXI } = engine;
  const scene = CONSTELLATION;
  const root = new PIXI.Container();
  const sky = new PIXI.Sprite(skyTexture(PIXI, scene.height, [[0, '#1c2030'], [0.7, '#2c2f42'], [1, '#4a4258']]));
  // Overscan: the chrome around the location view shows past the scene edges (a tall
  // portrait view too: the sky reaches 1400 px above it).
  sky.x = -600;
  sky.y = -1400;
  sky.width = scene.width + 1200;
  sky.height = scene.height + 1800;
  root.addChild(sky);
  // Ticket 61: the field stars are scattered over the clear sky and the piggy is one layer,
  // both laid out clear of the windows (layoutSky); until then, the field as it was.
  const fieldLayer = new PIXI.Container();
  root.addChild(fieldLayer);
  for (const s of fieldStars(scene)) {
    fieldLayer.addChild(deco(PIXI, 'star_asset_01', s.x, s.y, { w: 22 * s.size, h: 22 * s.size, ay: 0.5, alpha: 0.9 }));
  }
  const skyLayer = new PIXI.Container();
  root.addChild(skyLayer);
  const lines = new PIXI.Graphics();
  skyLayer.addChild(lines);
  const glows = new PIXI.Container();
  skyLayer.addChild(glows);
  const stars = scene.stars.map((s, i) => {
    const spr = deco(PIXI, 'star_asset_01', s.x, s.y, { w: scene.starSize, h: scene.starSize, ay: 0.5 });
    spr.eventMode = 'static';
    spr.cursor = 'pointer';
    spr.hitArea = new PIXI.Circle(0, 0, scene.hitRadius / Math.max(0.2, spr.scale.x || 1));
    spr.on('pointertap', () => clickStar(engine, s.x, s.y));
    spr.puzzleStar = i;
    skyLayer.addChild(spr);
    return spr;
  });
  const eye = new PIXI.Graphics();
  eye.circle(0, 0, 14).fill({ color: 0xfff4b0, alpha: 0.95 });
  eye.x = scene.eye.x;
  eye.y = scene.eye.y;
  eye.alpha = 0;
  skyLayer.addChild(eye);
  cloudBank(PIXI, root, scene, scene.floorY, 0xd8d0e8);
  return { root, fieldLayer, skyLayer, lines, glows, stars, eye };
}

function buildBeamMeDown(engine) {
  const { PIXI } = engine;
  const scene = BEAM_ME_DOWN;
  const root = new PIXI.Container();
  // G1160: the full-street snaps' sky (research/eleven-snaps/Upgrade Cards, reference only): a grey-teal
  // charcoal at the top darkening to a deep purple low down (the old one was a lighter lilac).
  const sky = new PIXI.Sprite(skyTexture(PIXI, scene.height, BEAM_SKY));
  sky.x = -600;
  sky.y = -400;
  sky.width = scene.width + 1200;
  sky.height = scene.height + 800;
  root.addChild(sky);
  // G1160: soft grey cloud banks drifting in at the edges beside the saucers, as the snaps show, not
  // faint puffs across the middle.
  for (let y = 300, i = 0; y < scene.height - 300; y += 340, i += 1) {
    const x = i % 2 ? scene.width - 90 - ((i * 37) % 60) : 90 + ((i * 53) % 60);
    root.addChild(deco(PIXI, i % 2 ? 'cloud_fluffy_1' : 'cloud_fluffy_2', x, y, { w: 460, h: 230, alpha: 0.7, tint: 0xb7baa6 }));
  }
  const beams = [];
  const cone = beamConeTexture(PIXI, scene);
  for (const s of scene.saucers) {
    const g = new PIXI.Sprite(cone);
    g.anchor.set(0.5, 0);
    g.x = s.x;
    g.y = s.y + 30;
    g.blendMode = 'add';
    root.addChild(g);
    beams.push(g);
    const ufo = new PIXI.Sprite(textureFromUrl(`${ART}ufo_1.webp`));
    ufo.anchor.set(0.5, 0.75);
    ufo.x = s.x;
    ufo.y = s.y + 30;
    ufo.scale.set(0.5);
    root.addChild(ufo);
  }
  // Start cloud with its sign, and the landing cloud floor.
  // The start: a cloud ledge running right from the left edge (street snap rows 450-560); the
  // snaps' cloud hoop at its left end waits for pack 2's ring to be taken in.
  // The snap's ledge is about 110 deep and flat on top: the pieces squashed to 0.7.
  root.addChild(cloudPiece(PIXI, 1, scene.startCloud.x0 + 60, scene.startCloud.y + 135, 560, { squash: 0.7 }));
  root.addChild(cloudPiece(PIXI, 1, scene.startCloud.x1 - 40, scene.startCloud.y + 120, 430, { flip: true, squash: 0.7 }));
  const sign = new PIXI.Text({ text: scene.sign.replace(' here!', '\nhere!'), style: { fontFamily: WORLD_FONT_FAMILY, fontSize: 22, fontWeight: '700', fill: 0xffffff, align: 'center' } });
  anchorBottomCentre(sign, 'text');
  sign.x = (scene.startCloud.x0 + scene.startCloud.x1) / 2;
  sign.y = scene.startCloud.y - 110;
  sign.alpha = 0.9;
  root.addChild(sign);
  beamLanding(PIXI, root, scene);
  const bravo = new PIXI.Text({ text: scene.completion.replace('! ', '!\n').replace('You made', 'You\nmade'), style: {
    fontFamily: WORLD_FONT_FAMILY, fontSize: 46, fontWeight: '800', fill: 0xe8d23a, align: 'center', lineHeight: 50,
  } });
  anchorBottomCentre(bravo, 'text');
  bravo.x = scene.width / 2;
  bravo.y = scene.floorY - 160;
  bravo.alpha = 0;
  root.addChild(bravo);
  return { root, beams, bravo };
}

function exitDoor(engine, scene) {
  const { PIXI } = engine;
  const door = new PIXI.Container();
  if (scene.id === 'beam_me_down') {
    // G962: the street snap's EXIT is door_asset_heights_interior darkened, a pale plank across it.
    const wood = new PIXI.Sprite(textureFromUrl(BEAM_ART.door));
    anchorBottomCentre(wood, 'deco');
    wood.scale.set(BEAM_ART.doorHeight / 188);
    wood.tint = BEAM_ART.doorTint;
    door.addChild(wood);
    const plank = new PIXI.Container();
    plank.y = -BEAM_ART.doorHeight * 0.62;
    plank.rotation = -0.1;
    const board = new PIXI.Sprite(textureFromUrl(`${DECO}${BEAM_ART.plank}.png`));
    board.anchor.set(0.5, 0.5);
    board.scale.set(62 / 481);
    plank.addChild(board);
    // The snaps' plank is paler than this CC0 one, so the word is cream over a dark edge to read.
    const word = new PIXI.Text({ text: 'EXIT', style: { fontFamily: WORLD_FONT_FAMILY, fontSize: 14, fontWeight: '800', fill: 0xf6ead0, stroke: { color: 0x2b2216, width: 3 } } });
    word.anchor.set(0.5, 0.5);
    plank.addChild(word);
    door.addChild(plank);
  } else {
    const g = new PIXI.Graphics();
    g.roundRect(-34, -108, 68, 108, 26).fill(0x2b2230);
    g.roundRect(-26, -96, 52, 20, 4).fill(0xe2c34a);
    door.addChild(g);
    const label = new PIXI.Text({ text: 'EXIT', style: { fontFamily: WORLD_FONT_FAMILY, fontSize: 15, fontWeight: '800', fill: 0x2b2230 } });
    label.anchor.set(0.5, 0.5);
    label.y = -86;
    door.addChild(label);
  }
  door.x = scene.exit.x;
  door.y = scene.exit.y;
  door.zIndex = 20;
  engine.entityLayer.addChild(door);
  const target = engine.register({
    classId: 'puzzle_scene_exit',
    featureId: PUZZLE_SCENES_FEATURE_ID,
    label: 'Exit',
    subtitle: 'Back to where you came from',
    sprite: door,
  });
  return { door, target };
}

let quoinFrames = null;
function quoinTexture(engine, type) {
  const { PIXI } = engine;
  if (!quoinFrames) {
    const base = sourceFromUrl(QUOIN_SHEET.url);
    quoinFrames = {};
    for (const def of Object.values(QUOIN_TYPES)) {
      quoinFrames[def.id] = frameTexture(base, new PIXI.Rectangle(0, def.row * QUOIN_SHEET.frameHeight, QUOIN_SHEET.frameWidth, QUOIN_SHEET.frameHeight));
    }
  }
  return quoinFrames[type] || quoinFrames.xp;
}

/* ------------------------------------------------------------------ */
/* Enter / leave                                                      */
/* ------------------------------------------------------------------ */

function inMyScene(engine) {
  return Boolean(active) && engine.inScene() && engine.sceneTsid === sceneTsid(active.id);
}

function startScene(engine, id, opts = {}) {
  const scene = SCENES[id];
  if (!scene || entering) return false;
  // G904: built again after a party keeps its own way back (not the party space).
  if (opts.returnTo) save.returnTo = { ...opts.returnTo };
  else if (!engine.inScene() && !isPuzzleSceneTsid(engine.streetTsid)) {
    save.returnTo = { tsid: engine.streetTsid, x: Math.round(engine.player?.x || 0), y: Math.round(engine.player?.y || 0) };
  }
  engine.closeMap?.();
  const views = id === 'constellation' ? buildConstellation(engine) : buildBeamMeDown(engine);
  const platforms = id === 'constellation'
    ? [{ id: 'clouds', x1: 0, y1: scene.floorY, x2: scene.width, y2: scene.floorY }]
    : [
      { id: 'start-cloud', x1: scene.startCloud.x0, y1: scene.startCloud.y, x2: scene.startCloud.x1, y2: scene.startCloud.y },
      { id: 'floor-cloud', x1: 0, y1: scene.floorY, x2: scene.width, y2: scene.floorY },
    ];
  entering = true;
  try {
    engine.enterScene({
      tsid: sceneTsid(id),
      label: scene.name,
      hubName: id === 'beam_me_down' ? 'Paradise' : 'Puzzle',
      width: scene.width,
      height: scene.height,
      background: views.root,
      platforms,
      walls: [],
      spawn: scene.spawn,
      returnTo: save.returnTo,
    });
  } finally {
    entering = false;
  }
  active = {
    id,
    scene,
    views,
    run: id === 'constellation' ? createConstellationRun() : null,
    quoins: id === 'beam_me_down' ? beamQuoins(scene) : [],
    taken: new Set(),
    quoinSprites: new Map(),
    landed: false,
    complete: false,
    lastClickAt: Date.now(),
    status: id === 'constellation' ? 'connecting' : 'falling',
    reward: '',
  };
  // A smaller avatar so the whole sky (or beam) reads at once, as in the video.
  const p = engine.player;
  if (p && scene.avatarScale && !active.scaled) {
    active.scaled = { base: p.baseScale };
    p.baseScale *= scene.avatarScale;
  }
  active.exit = exitDoor(engine, scene);
  for (const q of active.quoins) {
    const spr = new engine.PIXI.Sprite(quoinTexture(engine, q.type));
    spr.anchor.set(0.5, 0.5);
    spr.scale.set(0.6);
    spr.x = q.x;
    spr.y = q.y;
    spr.zIndex = 30;
    engine.entityLayer.addChild(spr);
    active.quoinSprites.set(q.id, spr);
  }
  engine.toast(scene.objective, 3600);
  engine.save();
  return true;
}

/**
 * Ticket To Beam Me Down is a Ticket to Paradise (paradise_ticket_beam_me_down.js, parent
 * paradise_ticket): Activate asks, costs calc_img_cost (20 x the quoin multiplier, more above x40)
 * and takes one of the day's 11 tickets (verbs.activate 154, modal_callback 330-331). game.js does
 * that for every Paradise ticket (engine.activateParadiseTicket); this only enters the scene.
 */
function activateTicket(engine) {
  if (countItem(engine.inv, TICKET) < 1 || engine.transientInstance()) return false;
  return engine.activateParadiseTicket('beam_me_down', () => {
    if (!startScene(engine, 'beam_me_down')) return false;
    // Report #126: paradise_ticket.js verbs.activate counts through item.js notifyVerb.
    engine.achievement?.(`${TICKET}:activate`, 1);
    return true;
  });
}

/** G904: hold the scene for a party trip; answers the party's way back. */
function departForParty(engine) {
  const p = engine.player;
  const spot = { x: Math.round(Number(p?.x) || 0), y: Math.round(Number(p?.y) || 0) };
  const scale = active.scaled && p?.baseScale ? p.baseScale / active.scaled.base : 1;
  if (active.scaled && p) p.baseScale = active.scaled.base;
  const sprites = [active.exit?.door, ...active.quoinSprites.values()];
  away = { ...spot, scale, parked: engine.parkScene?.({ sprites, targets: [active.exit?.target] }) || null };
  save.away = { id: active.id, ...spot, taken: [...active.taken], landed: active.landed, complete: active.complete, run: active.run };
  engine.save();
  const out = save.returnTo || engine.query?.('safeWayOut', engine, {}) || { tsid: 'GLI2V0UN7RD1T2J', x: 0, y: 0 };
  return { hold: PUZZLE_SCENES_FEATURE_ID, tsid: out.tsid, x: out.x, y: out.y, label: active.scene.name, at: spot };
}

/** G904: back from the party into the scene (parked, or after a reload built again as it was). */
function resumeFromParty(engine) {
  const held = save.away;
  if (away?.parked && active && engine.resumeScene?.(away.parked, { x: away.x, y: away.y })) {
    const p = engine.player;
    if (active.scaled && p && away.scale !== 1) p.baseScale = active.scaled.base * away.scale;
  } else if (held) {
    active = null;
    const back = save.returnTo;
    if (!back || !startScene(engine, held.id, { returnTo: back })) return false;
    for (const id of held.taken) {
      active.taken.add(id);
      const spr = active.quoinSprites.get(id);
      if (spr) spr.visible = false;
    }
    active.landed = held.landed;
    active.complete = held.complete;
    if (held.complete) active.status = 'complete';
    if (held.run && active.run) {
      active.run = { ...active.run, ...held.run };
      drawConstellation(engine);
    }
    const p = engine.player;
    if (p) {
      p.x = held.x;
      p.y = held.y;
      p.vx = 0;
      p.vy = 0;
      engine.snapCamera?.();
    }
  } else return false;
  away = null;
  save.away = null;
  engine.save();
  engine.setData('sceneStatus', active?.status || '');
  return true;
}

async function leaveScene(engine) {
  if (!active) return false;
  const back = save.returnTo;
  cleanup(engine);
  active = null;
  save.returnTo = null;
  engine.save();
  if (back?.tsid) await engine.enter(back.tsid, { spawnX: back.x, spawnY: back.y, quiet: true, bypassFeatureGates: true });
  engine.setData('sceneStatus', 'left');
  return true;
}

function cleanup(engine) {
  if (!active) return;
  const p = engine.player;
  if (active.scaled && p && !p.destroyed) p.baseScale = active.scaled.base;
  active.scaled = null;
  if (active.exit?.target) engine.unregister(active.exit.target);
  for (const spr of [active.exit?.door, ...active.quoinSprites.values()]) {
    if (spr?.parent) spr.parent.removeChild(spr);
    if (spr && !spr.destroyed) spr.destroy({ children: true });
  }
  active.quoinSprites.clear();
}

function payout(engine, r) {
  const pc = engine.pc;
  if (r.xp) {
    pc.xp = (pc.xp || 0) + r.xp;
    pc.imagination = (pc.imagination || 0) + r.xp;
  }
  // The scene's mood goes through metabolics_add_mood like every source gain:
  // nothing while dead (inc_metabolics.js 79-86). Returns the mood that landed.
  return r.mood > 0 ? gainMetabolic(pc, 'mood', r.mood) : 0;
}

function finish(engine) {
  if (!active || active.complete) return;
  active.complete = true;
  const { id, scene } = active;
  const first = !save.done[id];
  save.done[id] = (save.done[id] || 0) + 1;
  const bits = [];
  if (first) {
    const mood = payout(engine, scene.reward);
    if (scene.reward.xp) bits.push(`+${scene.reward.xp} iMG`);
    if (mood) bits.push(`+${mood} mood`);
  }
  active.reward = bits.join(' · ') || 'none';
  active.status = 'complete';
  engine.pushActivity(first ? `${scene.name}: ${scene.completion} ${bits.join(', ')}` : `${scene.name}: ${scene.completion}`);
  engine.award({ kind: 'quest', title: scene.completion, body: first ? 'Take the EXIT when you are ready.' : 'Another fine run.', subtitle: bits.join(' · ') || scene.name, primaryLabel: 'OK' });
  engine.updateHud();
  engine.save();
}

/* ------------------------------------------------------------------ */
/* Constellation                                                      */
/* ------------------------------------------------------------------ */

function clickStar(engine, x, y) {
  if (!active || active.id !== 'constellation') return;
  const out = clickConstellation(active.run, active.scene, x, y);
  active.lastClickAt = Date.now();
  if (out.result === 'connect' || out.result === 'close') {
    engine.playSound(`LITTLE_STAR_${(active.run.connected.length % 19) + 1}`, { volume: 0.5, allowMultiple: true });
    drawConstellation(engine);
    if (out.result === 'close') {
      engine.playSound('MOON_APPEARS', { volume: 0.6 });
      finish(engine);
    }
  } else if (out.result === 'miss') {
    engine.playSound('CLICK_FAILURE', { volume: 0.35 });
  }
}

function drawConstellation(engine) {
  const { lines, glows } = active.views;
  const { PIXI } = engine;
  const pts = active.run.connected.map((i) => active.scene.stars[i]);
  if (active.run.complete) pts.push(active.scene.stars[0]);
  lines.clear();
  pts.forEach((p, i) => (i ? lines.lineTo(p.x, p.y) : lines.moveTo(p.x, p.y)));
  lines.stroke({ width: 3, color: 0xf2efe0, alpha: 0.6 });
  glows.removeChildren();
  for (const p of pts) {
    const g = new PIXI.Graphics();
    g.circle(p.x, p.y, 15).fill({ color: 0xfff2a0, alpha: 0.28 });
    glows.addChild(g);
  }
}

/**
 * Ticket 61 (Friendly, 2026-11-03): stars were hidden under the top pills, the minimap, an
 * open side panel and the EXIT door. The scene is rebuilt (no archived geometry; the video
 * shows the whole sky at once), so the sky layer is fitted into the largest part of the
 * view no window covers (js/puzzle-scenes.js fitSky), at most its own size, and fitted
 * again when the windows or the view change (a panel opened, the minimap folded, a resize).
 */
const SKY_COVERS = ['#hud-stats', '.top-bar .top-actions', '#street-nameplate', '#street-minimap', '#local-chat-dock', '#play-context'];
const SKY_PAD = 10;

function skyObstacles(engine) {
  const canvas = engine.renderer?.canvas;
  if (!canvas?.getBoundingClientRect || typeof document === 'undefined') return null;
  const view = canvas.getBoundingClientRect();
  const cam = engine.camera;
  if (!view.width || !cam?.w) return null;
  const k = view.width / cam.w;
  const out = [];
  for (const sel of SKY_COVERS) {
    for (const el of document.querySelectorAll(sel)) {
      if (el.hidden || !el.getClientRects?.().length) continue;
      const style = globalThis.getComputedStyle?.(el);
      if (style && (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0)) continue;
      const b = el.getBoundingClientRect();
      if (b.width < 2 || b.height < 2) continue;
      out.push({
        x: cam.x + (b.left - view.left) / k - SKY_PAD,
        y: cam.y + (b.top - view.top) / k - SKY_PAD,
        w: b.width / k + 2 * SKY_PAD,
        h: b.height / k + 2 * SKY_PAD,
      });
    }
  }
  return { cam, view, k, out };
}

function layoutSky(engine, { force = false } = {}) {
  const layer = active?.views?.skyLayer;
  if (!layer || layer.destroyed) return;
  const seen = skyObstacles(engine);
  if (!seen) return;
  const { cam, view, out } = seen;
  const scene = active.scene;
  const sig = [cam.x, cam.y, cam.w, cam.h, view.width, view.height, ...out.flatMap((o) => [o.x, o.y, o.w, o.h])].map((v) => Math.round(v / 4)).join(',');
  if (!force && sig === active.skySig) return;
  active.skySig = sig;
  // The view above the cloud bank (the avatar's head stays clear of the lowest stars).
  const top = Math.max(cam.y, -40);
  // The sky art reaches 600 px past the scene's sides (buildConstellation's overscan).
  const left = Math.max(cam.x + 4, -560);
  const area = { x: left, y: top, w: Math.min(cam.x + cam.w - 4, scene.width + 560) - left, h: scene.floorY - 44 - top };
  const obstacles = [...out, doorBox(scene)];
  const fit = fitSky({ area, obstacles });
  // The layer draws the box's corner at (fit.x, fit.y).
  layer.scale.set(fit.scale);
  layer.position.set(fit.x - SKY_BOX.x * fit.scale, fit.y - SKY_BOX.y * fit.scale);
  active.skyFit = fit;
  // Stars stay big enough to see and click when the piggy is drawn small (the glow and lines scale).
  active.starBoost = Math.max(1, 0.8 / fit.scale);
  const { PIXI } = engine;
  const field = active.views.fieldLayer;
  const avoid = [...scene.stars, scene.eye].map((p) => skyPoint(fit, p));
  const placedField = fieldStarsIn(area, obstacles, avoid);
  // The sprites are kept and moved (a texture still loading sizes the one it was made for).
  placedField.forEach((f, i) => {
    let spr = field.children[i];
    if (!spr) {
      spr = deco(PIXI, 'star_asset_01', f.x, f.y, { ay: 0.5, alpha: 0.9 });
      spr.fieldSize = 22 * f.size;
      const size = () => { if (!spr.destroyed) spr.width = spr.height = spr.fieldSize; };
      if (isLoaded(spr.texture)) size(); else onLoaded(spr.texture.source, size);
      field.addChild(spr);
    }
    spr.visible = true;
    spr.position.set(f.x, f.y);
    spr.fieldSize = 22 * f.size;
    if (isLoaded(spr.texture)) spr.width = spr.height = spr.fieldSize;
  });
  for (let i = placedField.length; i < field.children.length; i += 1) field.children[i].visible = false;
  active.fieldCount = placedField.length;
  engine.setData('constellationFit', `${fit.scale.toFixed(3)},${Math.round(layer.x)},${Math.round(layer.y)}`);
  // QA: every star where it is drawn, in scene pixels (tools: the ticket 61 check).
  if (typeof window !== 'undefined') {
    const placed = { stars: avoid.slice(0, scene.stars.length), eye: avoid[scene.stars.length], field: placedField, door: doorBox(scene, 0), scale: fit.scale };
    window.groddlePuzzleSky = () => placed;
  }
}

function stepConstellation() {
  const { stars, eye } = active.views;
  const t = Date.now() / 1000;
  const hint = nextStarIndex(active.run, active.scene);
  const showHint = active.run.connected.length === 0 || active.run.misses > 0 || Date.now() - active.lastClickAt > 6000;
  stars.forEach((spr, i) => {
    const pulse = showHint && i === hint ? 1 + Math.sin(t * 6) * 0.18 : 1;
    if (isLoaded(spr.texture)) spr.scale.set((active.scene.starSize / spr.texture.width) * pulse * (active.starBoost || 1));
  });
  if (active.run.complete) eye.alpha = Math.min(1, eye.alpha + 0.02);
}

/* ------------------------------------------------------------------ */
/* Beam Me Down                                                       */
/* ------------------------------------------------------------------ */

function stepBeam(engine) {
  const p = engine.player;
  if (!p) return;
  const scale = engine.query?.('avatarBodyScale', engine) ?? 1;
  for (const q of active.quoins) {
    // Ticket 37: Beam Me Down's quoins take the street quoin's box (items/quoin.js onPlayerCollision 156-159, js/quoins.js quoinTouches).
    const quoinScale = Math.abs(active.quoinSprites.get(q.id)?.scale?.y || 0.6);
    if (active.taken.has(q.id) || !quoinTouches({ x: q.x, y: q.y, typeId: q.type }, p.x, p.y, { scale, quoinScale })) continue;
    active.taken.add(q.id);
    const spr = active.quoinSprites.get(q.id);
    if (spr) spr.visible = false;
    // Paradise pickups skip the daily quoin limit (the shipped courses do too).
    const pc = engine.pc;
    // #560: the benefit times the player's own quoin multiplier (items/quoin.js 171-174), Paradise included.
    const pay = quoinPay(q.benefit, engine.quoinState?.multiplier);
    let amount = pay;
    // items/quoin.js 184: an iMG quoin takes the mood bonus.
    if (q.type === 'xp') amount = grantMoodXp(pc, pay);
    // G970 (the G608 #156 pattern): energy and mood credit through the quoin path (items/quoin.js
    // 185-186 metabolics_add_*): the tank, never a flat 100, refused while dead.
    else amount = creditQuoinStat(pc, q.type, pay);
    const label = QUOIN_TYPES[q.type]?.label || 'iMG';
    engine.floatText(q.x, q.y - 14, `+${amount} ${label}`, '#ffffff');
    engine.playSound(`QUOIN_${q.type.toUpperCase()}`, { volume: 0.45 });
    engine.updateHud();
  }
  const { beams, bravo } = active.views;
  const lit = beamAt(active.scene, p.x, p.y);
  beams.forEach((g, i) => {
    g.alpha = active.scene.saucers[i] === lit ? 1 : 0.78 + Math.sin(Date.now() / 400 + i) * 0.08;
  });
  if (!active.landed && p.onGround && p.y >= active.scene.floorY - 4) {
    active.landed = true;
    finish(engine);
  }
  if (active.landed) bravo.alpha = Math.min(1, bravo.alpha + 0.03);
}

/* ------------------------------------------------------------------ */
/* QA                                                                 */
/* ------------------------------------------------------------------ */

function publish(engine, now) {
  if (now - lastData < 250) return;
  lastData = now;
  engine.setData('sceneId', active?.id || '');
  engine.setData('sceneStatus', active?.status || '');
  engine.setData('sceneProgress', active?.run ? `${active.run.connected.length + (active.run.complete ? 1 : 0)}/${active.scene.stars.length}` : active?.landed ? 'landed' : '');
  engine.setData('sceneQuoins', active?.quoins.length ? `${active.taken.size}/${active.quoins.length}` : '');
  engine.setData('sceneReward', active?.reward || '');
}

function demoStep(engine, now) {
  const want = engine.param('scenedemo');
  if (!want || demo.stage === 'done' || now < demo.at) return;
  if (demo.stage === 'idle') {
    if (!SCENES[want]) {
      demo.stage = 'done';
      engine.setData('sceneDemo', 'unknown-scene');
      return;
    }
    if (!engine.street || engine.busy()) return;
    startScene(engine, want);
    demo = { stage: 'entered', at: now + 1200, queue: [] };
    engine.setData('sceneDemo', 'entered');
    return;
  }
  if (!active || engine.param('sceneautoplay') !== '1') {
    demo.stage = 'done';
    return;
  }
  if (demo.stage === 'entered') {
    if (active.id === 'constellation') {
      demo.queue = [...active.scene.stars.map((s) => ({ click: s })), { click: active.scene.stars[0] }, { wait: true }];
      if (engine.param('scenehold') !== '1') demo.queue.push({ leave: true });
    } else {
      demo.queue = [...active.quoins.map((q) => ({ place: q })), { place: { x: 800, y: active.scene.floorY - 40 } }, { wait: true }];
      if (engine.param('scenehold') !== '1') demo.queue.push({ leave: true });
    }
    demo.stage = 'run';
  }
  const step = demo.queue.shift();
  if (!step) {
    demo.stage = 'done';
    return;
  }
  if (step.click) clickStar(engine, step.click.x, step.click.y);
  if (step.place && engine.player) {
    engine.player.x = step.place.x;
    engine.player.y = step.place.y + 12;
    engine.player.vy = 0;
    engine.snapCamera();
  }
  if (step.leave) {
    engine.setData('sceneDemo', active.complete ? 'complete' : 'incomplete');
    leaveScene(engine);
  }
  demo.at = now + (step.wait ? 2500 : 450);
}

/* ------------------------------------------------------------------ */
/* Feature                                                            */
/* ------------------------------------------------------------------ */

export const puzzleScenesFeature = {
  id: PUZZLE_SCENES_FEATURE_ID,

  init(engine) {
    if (engine.param('scenedemo')) engine.setData('sceneDemo', 'idle');
  },

  onStreetEnter(street) {
    // Any real street means the scene is over (left by door, reload, or travel); G904: not while
    // the scene is held for a party.
    if (active && !away && !isPuzzleSceneTsid(street?.tsid)) active = null;
  },

  onStreetClear(engine) {
    if (entering || !active || away) return;
    cleanup(engine);
  },

  /** G904: the party teleporter's contract (party-spaces-feature partyTeleporterSpot). */
  partyTrip(action, engine, back) {
    if (action === 'plan') return active && !away && inMyScene(engine) ? { kind: 'hold', label: active.scene.name } : null;
    if (action === 'depart') return active && !away && inMyScene(engine) ? departForParty(engine) : null;
    if (action === 'resume') return back?.hold === PUZZLE_SCENES_FEATURE_ID ? resumeFromParty(engine) : null;
    return null;
  },

  onTick(dtMs, now, engine) {
    if (!engine.started) return;
    if (resumeOnBoot && !active) {
      resumeOnBoot = false;
      resumeFromParty(engine);
    }
    demoStep(engine, now);
    if (active && inMyScene(engine)) {
      if (active.id === 'constellation') {
        // Once the piggy is closed it stays put (the award hides the minimap: no jump as it winks).
        if (!active.run?.complete && (!active.skyAt || now - active.skyAt > 500)) {
          active.skyAt = now;
          layoutSky(engine);
        }
        stepConstellation();
      }
      else stepBeam(engine);
    }
    publish(engine, now);
  },

  physics(engine) {
    if (!active || active.id !== 'beam_me_down' || !inMyScene(engine)) return null;
    const p = engine.player;
    return beamPhysics(Boolean(p && beamAt(active.scene, p.x, p.y)));
  },

  verbsFor(target) {
    if (target?.classId !== 'puzzle_scene_exit') return [];
    return [{ id: 'leave', label: 'Leave', enabled: true, tooltip: 'Back to where you came from', durationMs: 0 }];
  },

  runVerb(target, verbId, engine) {
    if (target?.classId !== 'puzzle_scene_exit' || verbId !== 'leave') return false;
    leaveScene(engine);
    return true;
  },

  travelGate(tsid, engine) {
    if (active && inMyScene(engine)) return { ok: false, msg: 'Take the EXIT to head back.' };
    return null;
  },

  reloadLocation(saved, engine) {
    // G904: held for a party that has ended meanwhile: back into the scene from where it was entered.
    if (save.away && partySpaceForStreet(saved?.tsid) && engine?.query?.('partyTrip', 'inside', engine) !== true) {
      resumeOnBoot = true;
      const back = save.returnTo;
      return back ? { tsid: back.tsid, x: back.x, y: back.y } : null;
    }
    if (isPuzzleSceneTsid(saved?.tsid)) {
      const back = save.returnTo;
      return back ? { tsid: back.tsid, x: back.x, y: back.y } : null;
    }
    return null;
  },

  packVerbs(classTsid, engine) {
    if (classTsid !== TICKET) return [];
    const quote = engine.paradiseTicketQuote?.('beam_me_down');
    const block = engine.transientInstance() ? 'Not from here.' : quote?.reason || '';
    const used = quote ? ` You have used ${quote.ticketsToday} ${quote.ticketsToday === 1 ? 'ticket' : 'tickets'} today.` : '';
    return [{ id: 'activate', label: 'Activate', primary: true, enabled: !block, reason: block, tooltip: `Be whisked away to Beam Me Down.${used}` }];
  },

  runPackVerb(classTsid, verbId, engine) {
    if (classTsid !== TICKET || verbId !== 'activate') return false;
    activateTicket(engine);
    return true;
  },

  mapCards(engine) {
    if (typeof document === 'undefined') return [];
    const card = document.createElement('section');
    card.className = 'map-feature-card puzzle-scene-card';
    card.style.cssText = 'padding:8px 10px;margin:0 0 8px;border-radius:10px;background:#eef3ff;border:1px solid #c8d4f0;font-size:13px';
    const head = document.createElement('div');
    head.textContent = 'Lost puzzle levels';
    head.style.cssText = 'font-weight:700;margin-bottom:6px;color:#2f3f75';
    card.appendChild(head);
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px';
    const tickets = countItem(engine.inv, TICKET);
    for (const [id, scene] of Object.entries(SCENES)) {
      const b = document.createElement('button');
      b.type = 'button';
      const needsTicket = id === 'beam_me_down';
      b.textContent = `${save.done[id] ? '✓ ' : ''}${scene.name}${needsTicket ? ` (ticket: ${tickets})` : ''}`;
      b.disabled = (needsTicket && tickets < 1) || engine.transientInstance();
      b.style.cssText = `padding:3px 9px;border-radius:999px;border:1px solid #a8b8e0;background:${save.done[id] ? '#e3f4d8' : '#fff'};cursor:pointer`;
      b.addEventListener('click', () => {
        if (needsTicket) {
          engine.closeMap?.();
          activateTicket(engine);
        }
        else startScene(engine, id);
      });
      row.appendChild(b);
    }
    card.appendChild(row);
    return [card];
  },

  save() {
    return save;
  },

  restore(slice) {
    save = normalizeSceneSave(slice);
  },
};
