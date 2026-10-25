/**
 * The home-street Tower as a feature module (see js/feature-host.js).
 *
 * Rules and source notes live in js/home-tower.js. This file binds them to the
 * world:
 *  - the Tower on the home street: the cultivated proto (three scaffolding
 *    states from proto_furniture_tower_chassis.swf), its project panel
 *    (job_cult_tower: items, timed work at 1.5 s a unit), and once built the
 *    chassis exterior composed from the recovered SWF articles (base + five
 *    styles, one extra floor article per floor above two), Enter, Customize
 *    (style, one choice per part as the client's ConfiggerUI offered, Randomize,
 *    the sign name) and the name sign;
 *  - inside: one floor at a time, built by homes-feature.js (decorate reuses the
 *    house system); this module adds the elevator (tower_build_elevator: one
 *    stop per floor plus the construction floor, renamable floors), the exit
 *    door on the ground floor, and the Workbench (tower_expander) that runs
 *    the job_tower_floor_N project while the tower is expanding;
 *  - the Magic Rock's talk to on the home street (magic_rock.js
 *    setAvailableQuests: build_a_tower): offers the quest when its gates pass
 *    (level over 18, no tower) and stays while it runs; the flags
 *    cultivate_tower / build_tower advance it through the quest event stream.
 *    G231: homes-feature owns the street's one rock (inc_homes.js 2469-2471)
 *    and adds this talk to (towerApi.rockTalk / talkToRock) to its home verbs;
 *  - the Jethimadh Tower Base secret spots (location.js handleTowerSecrets):
 *    the archived TowerSpot boxes plus four reconstructed ones, the
 *    "nth of eleven" overlay, 50 currants at TowerSpot_03, and the
 *    tower_secrets group counter behind 11 Secrets of the Jethimadh Tower Base.
 *
 * homes-feature.js calls `towerApi` (spawnStreet / spawnFloor / currentFloor /
 * takeArrivalX / requestRemove / onCultivated) and hands it a bridge onto the
 * cultivation state; this module never imports homes-feature.
 *
 * QA (with ?autostart=1&fresh=1&resetgame=1&questoffer=off&homedemo=home):
 *   &towerdemo=proto    a fresh Tower proto and every project item in the pack
 *   &towerdemo=built    a built Tower (&towerfloors=2..9, &towerstyle=<style>,
 *                       &towerlook=-600 looks up the street like Camera Mode,
 *                       &towerconfig=floor_top:6,floor_1:10,... picks articles
 *                       (facing_right:0 flips it; or &towerfacing=left|right),
 *                       &towerpanel=customize opens the Customize panel)
 *   &towerdemo=inside   built, standing on its ground floor
 *   &towerdemo=expand   built, expanding, on the construction floor with the floor items
 *   &towerdemo=quest    level 19, no Tower: the Magic Rock offers Build a Tower
 *   &towerautoplay=1    runs the route (quest: accept, cultivate, build, complete;
 *                       proto: contribute + work to the finished Tower; expand: the
 *                       floor project to the new floor); &towerfast=1 shortens work units
 *   ?streetdemo=GIF1Q3IQM7122SP&towerdemo=secrets  stands on TowerSpot_02
 * Canvas data: towerState, towerFloors, towerStyle, towerConfig, towerFacing, towerProject, towerFloor, towerMark,
 *   towerWork, towerAutoplay, towerSecrets, towerRock, towerVisited, towerTopY (street).
 */

import { ITEM_CATALOG, countItem, ensureItem, itemIcon } from '../inventory.js?v=catalog-unified-6';
import { canUseTool, useToolCondition } from '../tools.js?v=woodcutting-test-2';
import { acceptOffer, npcQuestOffers } from '../quest-offers.js';
import { getQuestCatalog } from '../content-catalogs.js';
import { XP_FOR_LEVEL } from '../progression.js?v=progression-1';
import {
  BUILD_A_TOWER,
  ELEVATOR_MARK,
  PROTO_ART,
  TOWER_ART_DIR,
  TOWER_CHASSIS,
  TOWER_CONFIG,
  TOWER_DOOR_DX,
  TOWER_EXPANDER,
  TOWER_GEO,
  TOWER_JOB,
  TOWER_JOBS,
  TOWER_PROTO,
  TOWER_SECRETS_GROUP,
  TOWER_SECRET_CURRANTS,
  TOWER_SIGN,
  TOWER_STYLES,
  activeProject,
  applyWorkUnit,
  clampToExpansion,
  cleanTowerName,
  composeTower,
  contributeItems,
  towerBounds,
  createTowerState,
  elevatorMark,
  elevatorStops,
  endExpansion,
  expandCosts,
  extraFloors,
  finishTower,
  floorJobFor,
  flipTower,
  inTowerSpot,
  normalizeTowerState,
  ownerReloadFloor,
  parseTowerFacing,
  projectComplete,
  projectPercent,
  projectRequirements,
  protoArtState,
  randomTowerConfig,
  setFloorLabel,
  setTowerConfig,
  setTowerFacing,
  setTowerStyle,
  startExpansion,
  stepConfig,
  towerArticle,
  towerConfigRows,
  towerFacingX,
  towerLabel,
  towerSecretText,
  towerSpotsFor,
  workCheck,
} from '../home-tower.js?v=home-tower-2';
import { textureFromUrl } from '../textures.js';
import { pieceUrl } from '../home-wallpaper.js?v=home-wallpaper-2';
import { wantsHiresDecos } from '../deco-hires.js';
import { WOTD_TEXT } from '../wine-pour.js?v=g165-1';

/** 3x tower pieces where the screen has more than 2.25 backing pixels per world pixel. */
function hires(engine) {
  return wantsHiresDecos(engine?.app?.renderer?.resolution || globalThis.devicePixelRatio || 1);
}

export const HOME_TOWER_FEATURE_ID = 'home-tower';
const HOME_STREET_TSID = 'RH_HOME_EXT';
const HOME_INTERIOR_TSID = 'RH_HOME_INT';
/** items/include/jobs.js startJobWork unit_duration. */
const WORK_UNIT_MS = 1500;
const WALK_AWAY_PX = 260;

let tower = createTowerState();
let bridge = null;
let engineRef = null;
let work = null;
let arrivalX = null;
let floorArrival = null; // 'door' (from the street) | 'elevator'
let streetView = null; // { container, target, sign }
let floorView = null; // { floor, construction, targets }
let spots = [];
let panel = null;
let panelMode = null; // 'project' | 'elevator' | 'customize'
let demo = null;
let autoplay = null;
let lastPublish = 0;

const fast = () => engineRef?.param('towerfast') === '1';
const unitMs = () => (fast() ? 150 : WORK_UNIT_MS);

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

function itemLabel(cls, n = 1) {
  const def = ITEM_CATALOG[cls];
  if (!def) return String(cls || '').replace(/_/g, ' ');
  return n === 1 ? def.label : def.labelPlural || `${def.label}s`;
}

function questDef() {
  return getQuestCatalog()?.[BUILD_A_TOWER.id] || null;
}

function questActive(engine) {
  return Boolean(engine.questState?.active?.[BUILD_A_TOWER.id]);
}

/** build_a_tower prerequisites: over_level 18 and custom_code !pc.getTower(). */
function questCtx(engine) {
  return {
    level: engine.pc.level,
    xp: engine.pc.xp,
    skills: engine.learnedSkills,
    achievements: engine.unlockedAchievements,
    inv: engine.inv,
    pc: engine.pc,
    now: Date.now(),
    managedOnly: true,
    customPrereq: (id) => (id === BUILD_A_TOWER.id ? !tower.built : engine.questCustomPrereq?.(id) === true),
  };
}

function rockOffers(engine) {
  try {
    return npcQuestOffers(engine.questState, BUILD_A_TOWER.giver, engine.pc, questCtx(engine)).offered
      .filter((card) => card.classTsid === BUILD_A_TOWER.id);
  } catch {
    return [];
  }
}

/** quests_set_flag + the quest event stream (a flag named like the counter). */
function setFlag(engine, flag) {
  engine.questFlag?.(flag);
  engine.achievement(flag, 1);
}

function workCtx(engine) {
  return {
    inv: engine.inv,
    pc: engine.pc,
    energy: engine.pc.energy,
    toolOk: (tool, wear) => canUseTool(engine.toolState, tool, wear).ok,
    useTool: (tool, wear) => useToolCondition(engine.toolState, tool, wear),
  };
}

function publish(engine, force = false) {
  if (!engine) return;
  const now = Date.now();
  if (!force && now - lastPublish < 300) return;
  lastPublish = now;
  const item = bridge?.towerItem?.();
  const project = activeProject(tower);
  engine.setData('towerState', tower.built ? 'built' : item ? 'proto' : 'none');
  engine.setData('towerFloors', tower.built ? tower.floors : 0);
  engine.setData('towerExpanding', tower.expanding ? '1' : '0');
  engine.setData('towerStyle', tower.style);
  engine.setData('towerConfig', configString(tower.config));
  engine.setData('towerFacing', tower.facingRight === false ? 'left' : 'right');
  engine.setData('towerName', tower.name);
  engine.setData('towerProject', project && item ? `${project.jobId}:${projectPercent(project.jobId, project.got)}` : '');
  engine.setData('towerFloor', tower.floor == null ? '' : tower.floor);
  engine.setData('towerMark', tower.floor == null ? '' : elevatorMark(tower.floor));
  engine.setData('towerWork', work ? `${work.rid}:${work.units}` : '');
  engine.setData('towerSecrets', tower.secrets.length);
  engine.setData('towerRock', streetRock() && rockHasTalk(engine) ? '1' : '0');
  engine.setData('towerVisited', tower.visited ? '1' : '0');
}

/* ------------------------------------------------------------------ */
/* Street views                                                         */
/* ------------------------------------------------------------------ */

function chassisContainer(PIXI, style, extra, config, facingRight = true) {
  const box = new PIXI.Container();
  for (const op of composeTower(style, extra, config, facingRight)) {
    const spr = new PIXI.Sprite(textureFromUrl(`${TOWER_ART_DIR}${op.file}`));
    spr.anchor.set(op.anchorX, op.anchorY);
    // Articles are rasterised at 2x.
    spr.scale.set(op.scaleX * 0.5, op.scaleY * 0.5);
    spr.x = op.x;
    spr.y = op.y;
    box.addChild(spr);
  }
  return box;
}

function nameSign(PIXI, name) {
  // getExtraConfig sign_sd: the user name, upper case, on the scaffolding sign.
  const sign = new PIXI.Container();
  const text = new PIXI.Text({ text: name.toUpperCase(), style: {
    fontFamily: 'Trebuchet MS, sans-serif',
    fontSize: 15,
    fontWeight: '700',
    fill: 0xfff4d6,
    stroke: { color: 0x3b2a1f, width: 3 },
  } });
  text.anchor.set(0.5);
  const w = Math.max(90, text.width + 26);
  const g = new PIXI.Graphics();
  g.rect(-w / 2 + 10, 0, 6, 40).rect(w / 2 - 16, 0, 6, 40).fill(0x5b3d2b);
  g.roundRect(-w / 2, -16, w, 30, 6).fill(0x8d6444);
  g.roundRect(-w / 2 + 3, -13, w - 6, 24, 5).fill(0x6e4a32);
  sign.addChild(g, text);
  return sign;
}

function protoSprite(PIXI, state) {
  const spr = new PIXI.Sprite(textureFromUrl(`${TOWER_ART_DIR}${PROTO_ART[state]}`));
  spr.anchor.set(0.5, PROTO_ART.footY);
  spr.scale.set(0.5);
  return spr;
}

/** The built Tower's chassis and name sign into its street container. */
function drawExterior(engine, box) {
  const { PIXI } = engine;
  for (const child of box.removeChildren()) child.destroy({ children: true });
  box.addChild(chassisContainer(PIXI, tower.style, extraFloors(tower), tower.config, tower.facingRight));
  // QA: the world y of the Tower's top (the home street must show it; cameraY is on the canvas).
  const bounds = towerBounds(composeTower(tower.style, extraFloors(tower), tower.config, tower.facingRight));
  engine.setData('towerTopY', Math.round(box.y + bounds.t));
  engine.setData('towerSpan', `${Math.round(box.x + bounds.l)},${Math.round(box.x + bounds.r)}`);
  if (tower.name) {
    // sign_sd h_flipped with the chassis: mirrored to -delta_x, its text still reads normally.
    const sign = nameSign(PIXI, tower.name);
    sign.x = towerFacingX(TOWER_SIGN.dx, tower.facingRight);
    sign.y = TOWER_SIGN.dy;
    box.addChild(sign);
    engine.setData('towerSignX', Math.round(box.x + sign.x));
  } else {
    engine.setData('towerSignX', '');
  }
}

/**
 * homes-feature spawnCultivations: draw the Tower (proto or built) at its
 * cultivation spot. The Magic Rock is homes-feature's (G231).
 */
function spawnStreet(engine, { item, x, groundY }) {
  engineRef = engine;
  streetView = { container: null, target: null };
  tower.floor = null;
  const { PIXI } = engine;
  if (item) {
    const box = new PIXI.Container();
    box.x = x;
    box.y = groundY + 6;
    box.zIndex = 6;
    let label = 'Tower';
    let subtitle = '';
    if (tower.built && item.endClass === TOWER_CHASSIS) {
      drawExterior(engine, box);
      label = towerLabel(tower);
      subtitle = `${tower.floors} floors${tower.expanding ? ' · a new floor is going up' : ''}`;
    } else {
      const perc = projectPercent(TOWER_JOB, tower.project);
      box.addChild(protoSprite(PIXI, protoArtState(perc)));
      subtitle = perc > 0 ? `Tower project ${Math.round(perc * 100)}% done` : 'Start a project to build a tower here';
    }
    engine.entityLayer.addChild(box);
    streetView.container = box;
    streetView.target = engine.register({
      classId: tower.built ? TOWER_CHASSIS : TOWER_PROTO,
      featureId: HOME_TOWER_FEATURE_ID,
      label,
      subtitle,
      sprite: box,
      state: { itemId: item.id },
    });
  }
  demoStreet(engine);
  publish(engine, true);
}

/* ------------------------------------------------------------------ */
/* Inside: elevator, exit, workbench                                    */
/* ------------------------------------------------------------------ */

function currentFloor() {
  if (!tower.built) return null;
  return tower.floor;
}

function isConstructionFloor(floor = tower.floor) {
  return tower.built && tower.expanding && floor === tower.floors;
}

function floorTitle(floor = tower.floor) {
  const stop = elevatorStops(tower).find((row) => row.index === floor);
  return stop ? stop.label : `Floor ${floor + 1}`;
}

/** homes-feature homeScene('interior') while in the tower: register the floor's targets. */
function spawnFloor(engine, { width, groundY, doorX }) {
  engineRef = engine;
  const { PIXI } = engine;
  const floor = tower.floor;
  const targets = {};
  // Elevator: home_tower.swf signpost_asset_elevator_tower, 180 x 514 at x 90 (tower_build_elevator),
  // standing on the floor's bound (the walk line + 43 + the 28 px frame).
  const lift = new PIXI.Sprite(textureFromUrl(pieceUrl('signpost_asset_elevator_tower', hires(engine))));
  lift.anchor.set(0.5, 1);
  lift.width = 180;
  lift.height = 514;
  lift.x = 90;
  lift.y = groundY + 43 + 28;
  lift.zIndex = 5;
  engine.entityLayer.addChild(lift);
  // The floor's mark painted on the column above the call buttons (L, 1, 2, ...; the cutaways).
  const bound = groundY + 43 + 28;
  const mark = new PIXI.Text({ text: elevatorMark(floor), style: {
    fontFamily: 'Georgia, "Times New Roman", serif', fontSize: Math.round(ELEVATOR_MARK.capH / 0.7), fill: 0x2f2f2f,
  } });
  mark.anchor.set(0.5, 0);
  mark.x = ELEVATOR_MARK.x;
  // Place the glyph by its cap height: the text box's top sits above the caps by its ascent gap.
  mark.y = bound - ELEVATOR_MARK.footAboveBound - ELEVATOR_MARK.capH - (mark.height - ELEVATOR_MARK.capH) * 0.42;
  mark.alpha = 0.85;
  mark.zIndex = 6;
  engine.entityLayer.addChild(mark);
  // tower_reset_geometry: the tower's camera sits 220 px above the avatar (streets default to 150).
  if (engine.street) {
    const physics = engine.street.physics || {};
    engine.street.physics = { ...physics, setting: { ...(physics.setting || {}), y_cam_offset: TOWER_GEO.yCamOffset } };
  }
  targets.elevator = engine.register({
    classId: 'tower_elevator',
    featureId: HOME_TOWER_FEATURE_ID,
    label: 'Elevator',
    subtitle: `${floorTitle(floor)} · ${elevatorStops(tower).length} stops`,
    sprite: lift,
    state: { floor },
  });
  if (floor === 0) {
    // tower_build_exit: door_asset_entry_basic (75 x 236) at exit_door (w - 67, b - 53).
    const door = new PIXI.Sprite(textureFromUrl(pieceUrl('door_asset_entry_basic', hires(engine))));
    door.anchor.set(0.5, 1);
    door.width = 75;
    door.height = 236;
    door.x = doorX;
    door.y = groundY + 43 + 28 - 53;
    door.zIndex = 8;
    engine.entityLayer.addChild(door);
    targets.exit = engine.register({
      classId: 'tower_exit',
      featureId: HOME_TOWER_FEATURE_ID,
      label: 'Exit',
      subtitle: 'Back to your home street',
      sprite: door,
      state: {},
    });
  }
  if (isConstructionFloor(floor)) {
    const bench = new PIXI.Sprite(textureFromUrl(`${TOWER_ART_DIR}tower_expander.png`));
    bench.anchor.set(0.5, 1);
    bench.scale.set(1.25);
    // tower_get_bounds expansion.job: x 260 + 80, on the planks the floor is walkable to (290).
    bench.x = TOWER_GEO.workbenchX;
    bench.y = groundY + 2;
    bench.zIndex = 20;
    engine.entityLayer.addChild(bench);
    targets.workbench = engine.register({
      classId: TOWER_EXPANDER,
      featureId: HOME_TOWER_FEATURE_ID,
      label: 'Workbench',
      subtitle: `Construct ${TOWER_JOBS[floorJobFor(tower.floors)]?.title || 'a new floor'}`,
      sprite: bench,
      state: {},
    });
  }
  floorView = { floor, construction: isConstructionFloor(floor), targets };
  if (!tower.visited) {
    // location.js: has_visited_tower, butler_hint_counters visited_my_tower.
    tower.visited = true;
    engine.save();
  }
  // game.js labels every interior "Your House": name the floor instead.
  const label = `${towerLabel(tower)} · ${floorTitle(floor)}`;
  if (engine.street) {
    engine.street.label = towerLabel(tower);
    engine.street.hubName = floorTitle(floor);
  }
  // After renderHomeScene writes its own label.
  setTimeout(() => {
    const name = typeof document !== 'undefined' ? document.getElementById('street-name') : null;
    if (name && tower.floor === floor) name.textContent = label;
  }, 0);
  publish(engine, true);
  return targets;
}

/** tower_build_expansion: the floor under construction is walkable only from 130 to 290. */
function keepOnPlanks(engine) {
  if (!floorView?.construction || tower.floor !== floorView.floor) return;
  const p = engine.player;
  if (!p || !Number.isFinite(p.x)) return;
  const x = clampToExpansion(p.x);
  if (x === p.x) return;
  if ((x > p.x && p.vx < 0) || (x < p.x && p.vx > 0)) p.vx = 0;
  p.x = x;
}

async function goToFloor(engine, floor, via = 'elevator') {
  if (!tower.built) return false;
  const max = tower.floors + (tower.expanding ? 1 : 0);
  const idx = Math.max(0, Math.min(max - 1, Math.floor(Number(floor) || 0)));
  if (work) stopWork(engine, '');
  closePanel();
  // location.js:170-174: entering your own Tower (the door or /tower) counts
  // butler_hint_counters visited_my_tower; the elevator moves inside it.
  const entering = tower.floor == null;
  if (entering) {
    tower.visits = (tower.visits || 0) + 1;
    engine.setData?.('towerVisits', String(tower.visits));
  }
  tower.floor = idx;
  floorArrival = via;
  engine.save();
  engine.playSound?.('DOOR_OPEN', { volume: 0.4 });
  // G249: coming in from outside loads the Tower (pol_type tower, a named
  // Tower's custom_name: location.js 3395-3398) behind the home card.
  await engine.enter(HOME_INTERIOR_TSID, entering ? { pol: { type: 'tower', customName: tower.name || '', knownVisits: tower.visits - 1 } } : {});
  return true;
}

async function leaveTower(engine) {
  if (work) stopWork(engine, '');
  closePanel();
  const x = bridge?.towerWorldX?.();
  tower.floor = null;
  // FancyDoor: the door (and the spot you step out to) mirrors about the foot with the Tower.
  arrivalX = Number.isFinite(x) ? x + towerFacingX(TOWER_DOOR_DX, tower.facingRight) : null;
  engine.save();
  await engine.enter(HOME_STREET_TSID, { pol: { type: 'exterior' } });
  return true;
}

/* ------------------------------------------------------------------ */
/* Projects                                                             */
/* ------------------------------------------------------------------ */

function startWork(engine, rid) {
  const project = activeProject(tower);
  if (!project) return false;
  if (work) stopWork(engine, '');
  const check = workCheck(project.jobId, project.got, rid, workCtx(engine));
  if (!check.ok) {
    engine.toast(check.msg);
    return false;
  }
  const { PIXI } = engine;
  const icon = new PIXI.Sprite(textureFromUrl(itemIcon(check.tool)));
  icon.anchor.set(0.5, 1);
  icon.scale.set(0.8);
  icon.zIndex = 40;
  engine.entityLayer.addChild(icon);
  work = { rid, jobId: project.jobId, units: 0, energy: 0, nextAt: Date.now() + unitMs(), anchorX: engine.player.x, toolSprite: icon, tool: check.tool };
  engine.pushActivity(`You start to ${check.req.verb} with your ${itemLabel(check.tool)}.`);
  closePanel();
  publish(engine, true);
  return true;
}

function stopWork(engine, reason) {
  if (!work) return;
  const w = work;
  work = null;
  if (w.toolSprite && !w.toolSprite.destroyed) w.toolSprite.destroy();
  if (reason) engine.prompt({ kicker: 'Tower Project', title: 'Work stopped', text: reason });
  else if (w.units) engine.pushActivity(`You worked ${w.units} units on the ${TOWER_JOBS[w.jobId].title} project (${w.energy} energy).`);
  publish(engine, true);
}

function tickWork(engine, now) {
  if (!work) return;
  const p = engine.player;
  if (work.toolSprite && !work.toolSprite.destroyed && p) {
    work.toolSprite.x = p.x;
    work.toolSprite.y = p.y - 96 + Math.sin(now / 120) * 4;
  }
  if (p && Math.abs(p.x - work.anchorX) > WALK_AWAY_PX) {
    stopWork(engine, 'You walked away from the project.');
    return;
  }
  if (now < work.nextAt) return;
  work.nextAt = Math.max(work.nextAt + unitMs(), now + (fast() ? 0 : unitMs() / 2));
  const project = activeProject(tower);
  if (!project || project.jobId !== work.jobId) return stopWork(engine, '');
  // QA (&towerfast=1): keep the tank topped up so long work runs finish headless.
  if (fast()) engine.pc.energy = Math.max(engine.pc.energy || 0, 500);
  const res = applyWorkUnit(project.jobId, project.got, work.rid, workCtx(engine));
  if (!res.ok) return stopWork(engine, res.msg);
  work.units += 1;
  work.energy += res.energy;
  if (p) engine.floatText(p.x, p.y - 118, `+1 ${res.req.verbPast}`, 0xf2c14e);
  if (res.wear?.msg) engine.pushActivity(res.wear.msg);
  engine.updateHud();
  if (res.complete) {
    stopWork(engine, '');
    completeProject(engine);
    return;
  }
  if (res.left <= 0) stopWork(engine, '');
  refreshProtoArt(engine);
  publish(engine);
}

function contribute(engine, classId, n) {
  const project = activeProject(tower);
  if (!project) return false;
  const res = contributeItems(project.jobId, project.got, classId, n, engine.inv);
  if (!res.ok) {
    engine.toast(res.msg);
    return false;
  }
  engine.pushActivity(`You contributed ${res.amount} ${itemLabel(classId, res.amount)} to the ${TOWER_JOBS[project.jobId].title} project.`);
  engine.playSound?.('ITEM_GIVE', { volume: 0.55 });
  engine.updateHud();
  engine.refreshPack();
  if (res.complete) completeProject(engine);
  else refreshProtoArt(engine);
  engine.save();
  renderPanel(engine);
  publish(engine, true);
  return true;
}

/** proto onContribution: swap the scaffolding art at 1/3 and 2/3. */
function refreshProtoArt(engine) {
  if (tower.built || !streetView?.container || streetView.container.destroyed) return;
  const perc = projectPercent(TOWER_JOB, tower.project);
  const want = protoArtState(perc);
  if (streetView.protoState === want) return;
  streetView.protoState = want;
  const old = streetView.container.children[0];
  const spr = protoSprite(engine.PIXI, want);
  streetView.container.addChildAt(spr, 0);
  if (old) old.destroy();
  if (streetView.target) streetView.target.subtitle = `Tower project ${Math.round(perc * 100)}% done`;
}

function completeProject(engine) {
  const project = activeProject(tower);
  if (!project || !projectComplete(project.jobId, project.got)) return false;
  const def = TOWER_JOBS[project.jobId];
  if (project.key === 'project') {
    finishTower(tower);
    bridge?.markBuilt?.();
    setFlag(engine, BUILD_A_TOWER.buildFlag);
    engine.pushActivity('Your Tower is finished. Step inside!');
  } else {
    endExpansion(tower);
    engine.pushActivity(`Your Tower now has ${tower.floors} floors.`);
  }
  engine.playSound?.('COMPLETE_QUEST_REQUIREMENT', { volume: 0.6 });
  closePanel();
  engine.save();
  engine.prompt({ kicker: 'Tower Project', title: def.title, text: def.completion });
  // Rebuild the scene: the proto becomes the chassis, the construction floor a real floor.
  setTimeout(() => {
    // tower_end_expand -> tower_move_players: the owner goes to the (new) top floor.
    if (tower.floor != null) goToFloor(engine, ownerReloadFloor(tower));
    else engine.refreshHomeScene?.();
  }, 0);
  publish(engine, true);
  return true;
}

function beginExpansion(engine) {
  const res = startExpansion(tower);
  if (!res.ok) {
    engine.toast({ already_building: 'A new floor is already under construction.', max_size_already: 'Your Tower is as tall as it gets.' }[res.error] || 'You cannot build a new floor now.');
    return res;
  }
  engine.pushActivity(`You started building floor ${tower.floors + 1} of your Tower. The Workbench is up on the new floor.`);
  engine.save();
  publish(engine, true);
  // tower_start_expand -> tower_rebuild -> tower_move_players: the owner, if inside, is
  // reloaded on the top row, the floor under construction.
  if (tower.floor != null) setTimeout(() => goToFloor(engine, ownerReloadFloor(tower), 'elevator'), 0);
  return res;
}

/* ------------------------------------------------------------------ */
/* Panel                                                                */
/* ------------------------------------------------------------------ */

/**
 * TSEngineAssets graphics chassis_flip(_hover).png and chassis_randomize(_hover).png
 * (tinyspeck/glitch-client, CC0), metadata stripped, pixels unchanged: the
 * icons ConfiggerChoiceElementUI puts left of the Flip and Randomize labels.
 */
const CHASSIS_ICONS = Object.freeze({
  chassis_flip: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAQCAMAAAAhxq8pAAABIFBMVEX///8Ya4AYa4AYa4AYa4AYa4AYa4AYa4AYa4AYa4AYa4AYa4AYa4AYa4AYa4AYa4AYa4AYa4AYa4AYa4AYa4D///////8Ya4AYa4D///8Ya4AYa4AYa4D///////////8Ya4AYa4D///+YvcYYa4AdboP///////////////////////////////////////////////////////////////////////8Ya4D///+gwsvU4+dDh5hXk6K20Nc2fpDh7O9hmqhBhZb8/f4gcITG2uBfmKdGiZlJipt9q7fv9fYmdIeCr7pZlaSSucO40tjR4ebO4OSav8hUkaEueYwdboPs8/VypLGNtsBcl6UjcoZMjJx0prOwzdTx9vj6/PzP8dTgAAAAOHRSTlMAABJyn0IJ8MAwS978kAwbq+FI1SFmz+3bdeQGk9Jp3sNpt9nSfY0hlpx+55AzNrTM+fPGmVcPBtkbn1sAAADPSURBVBjTY2BgYEQHDAwwQSZmFlY0QTZmdgsLCw5OZEEubgsw4OHlgwnyC1jAgaAQVFDYAhlwQgRFkMVYQSpBJiMLgs1kFBWztALxxCUQgpLWNhaWQI6UNKOMhYWtnaWlrByDvL0DWKUCI6OihYWdo4WFkyyDs4urkrKbu70KI6Oqu4enlzdIUM3HwtfPP8DB0tLSOSAwKNjCGyiormEXgmR5qE9YuCbQSVragRGR7u6hUe7RMbFxOrrxumB36mnpGxgYGhkYm5iaMTCYMwAAnLwtVjnNO/YAAAAASUVORK5CYII=',
  chassis_flip_hover: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAQCAMAAAAhxq8pAAABIFBMVEX////YgwPYgwPYgwPYgwPYgwPYgwPYgwPYgwPYgwPYgwPYgwPYgwPYgwPYgwPYgwPYgwPYgwPYgwPYgwPYgwP////////YgwPYgwP////YgwPYgwPYgwP////////////YgwPYgwP////uyI7YgwPZhgn////////////////////////////////////////////////////////////////////////YgwP////vzJf46NDfmjLjpUfz2K/dkyT6797kqlPfmS///vzZhwz14MHkqVDgnDXgnTjpuXH89u3aihLqvHfjpkrtxYjz2bL35s335cruyZHio0TcjxvZhgn89erns2XswoLjp03aiQ/hnzvotWjy1an9+PD+/PmgaiSKAAAAOHRSTlMAABJyn0IJ8MAwS978kAwbq+FI1SFmz+3bdeQGk9Jp3sNpt9nSfY0hlpx+55AzNrTM+fPGmVcPBtkbn1sAAADQSURBVBjTY2BgYEQHDAwwQSZmFlY0QTZmdgsLCw5OZEEubgsw4OHlgwoy8AtYwIGgEFRQ2AIZcEIERZDFWEEqQSYjC4LNZBQVs7QC8cQlEIKS1jYWlkCOlDSjjIWFrZ2lpawcg7y9A1ilAiOjooWFnaOFhZMsg7OLq5Kym7u9CiOjqruHp5c3SFDNx8LXzz/AwdLS0jkgMCjYwhsoqK5hF4JkeahPWLgm0Ela2oERke7uoVHu0TGxcTq68bpgd+pp6RsYGBoZGJuYmjEwmDMAAJoQLVPoSJCnAAAAAElFTkSuQmCC',
  chassis_randomize: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABIAAAAOCAMAAAAVBLyFAAABCFBMVEX4+vsYa4D///8Ya4D4+vv4+vv4+vv4+vv4+vsYa4AYa4AYa4D3+vvr8vQYa4AYa4AYa4D2+fr1+PrE2d8Ya4D0+Pn0+Pnx9viPt8Hz9/jz9/jz9/jz9/jz9/jz9/gYa4DZ5+vx9vjx9vgYa4DI3OHu9Pbu9Pbu9Pbu9Pbu9Pbu9Pbt8/Xt8/Xt8/Xs8/Xs8/X4+vvq8vQYa4Alc4dFiJlxpLHV5Ojp8fMicobP4ORhmqj1+Prw9ffJ3OJuoq9Rj6Dn8PIqd4obbYHe6u2zztVDh5hdl6bG2uDk7vHx9vhYlKNsoa6709ogcISKtL/r8vTT4+d7qrbi7e/u9PZNjZ3L3ePq8fSpyNBs6adXAAAAMHRSTlMAAABalvDMmTDwtxsPkofM+Q+W8kIGM+2L/EUPh7RLDOWND8CsIYrM/JYtA8BXA1FBtMkCAAAArElEQVQY012N1RLCQAxFm6LF3d1dglO0uBSX//8TdhfKDJyX5J6Z3HDcHwC/WcUUqGs1jVanB4pgMBJlqiM2mq222WK1IaKgAs7eQUq312eTKnCI4mA4wrHTpRzSCrdnglMvWXw0MQXgl3AWCIbm4YiiorEFLlfrTWPbjieIEkjrbi+zdpQPx49Kpk7nhUQWqXX5dAGkM9ncFW/3fOGrCMXHs1T+fnxTqQLw/AvSuxhTnDsg+wAAAABJRU5ErkJggg==',
  chassis_randomize_hover: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABIAAAAOCAMAAAAVBLyFAAABEVBMVEX4+vvYgwP////YgwP4+vv4+vv4+vv4+vv4+vvYgwPYgwPYgwP3+vv18+3YgwPYgwPYgwP2+fr1+Prv3sTYgwP0+Pn0+Pn09/bnwojz9/jz9/jz9/jz9/jz9/jz9/jYgwPu6d3x9vjx9vjYgwPr4Mru9Pbu9Pbu9Pbu9Pbu9Pbu9Pbt8/Xt8/Xt8/Xs8/Xs8/X4+vv18+zYgwPaihLemzXks2by6NX08uvZiQ/x5M7iqlT1+Pr09fTv4cnjsGPgoUPy8evajRfYhAbw7OHr1bDdmjTgqFHs38fw7+rx9vjZihHfpUvu59jhr2Lq2bvZhwzlv4Tv8vHs5tfjt3Lhsmfu7uju9Pbdnz/q4c7t8vLmz6j3RdUPAAAAMHRSTlMAAABalvDMmTDwtxsPkofM+Q+W8kIGM+2L/EUPh7RLDOWND8CsIYrM/JYtA8BXA1FBtMkCAAAArUlEQVQY012N1RLCUAwFG4oVd3d3Ce5QKA7F7f8/hHuLzMC+JGdncsIwfwD8ZlZSIC+VFEqVGiicRkuUroxYqdbqeoPRhIgcC4y5gZRmqy1NqsDS6XR7fRxYbZ9DWmF3DHHkJIuLJkkBuHkce7y+iT/wUcGQgNPZfLFcrcMRojjSutmKUjuKu/1bRWOHo8CThT+d310A8UQydcHrLZ35KkL2/sjlvx9fFIoAMtkT81EYwjycfQsAAAAASUVORK5CYII=',
});

const CSS = `
.ht-card{width:min(600px,94vw);background:radial-gradient(circle at 92% 0%,rgba(242,193,78,.18),transparent 36%),#f7f4ed}
.ht-kicker{font-size:.72rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#8a6d2b;margin:0}
.ht-desc{margin:.1rem 0 .55rem;padding-left:.6rem;border-left:4px solid #e0b443;color:#53534d;font-size:.84rem}
.ht-phase{display:flex;align-items:center;gap:.5rem;margin:.2rem 0 .45rem;font-size:.85rem;font-weight:700;color:#4a4336}
.ht-bar{flex:1;height:8px;border-radius:4px;background:#e4ddd0;overflow:hidden}
.ht-bar>i{display:block;height:100%;background:linear-gradient(90deg,#e8b23d,#f6d36b)}
.ht-list{list-style:none;margin:0;padding:0;display:grid;gap:.35rem;max-height:52vh;overflow:auto}
.ht-row{display:grid;grid-template-columns:34px 1fr auto;gap:.5rem;align-items:center;background:rgba(255,255,255,.86);border:1px solid #e1d9c9;border-radius:8px;padding:.35rem .5rem}
.ht-row img{width:32px;height:32px;object-fit:contain}
.ht-mark{display:grid;place-items:center;width:32px;height:32px;border-radius:6px;background:linear-gradient(#c9c9c6,#a9a9a5);color:#2f2f2f;font:400 1.15rem/1 Georgia,"Times New Roman",serif}
.ht-row b{display:block;font-size:.82rem;color:#3a352c}
.ht-row small{display:block;font-size:.72rem;color:#7a7264}
.ht-row.is-done{opacity:.6}
.ht-row.is-locked{opacity:.55;background:rgba(240,236,228,.8)}
.ht-card button{font:inherit;font-size:.76rem;font-weight:700;border-radius:7px;border:1px solid #c9b48a;background:#fff;color:#6a4f17;padding:.3rem .6rem;cursor:pointer;white-space:nowrap}
.ht-card button.primary{background:#e8b23d;border-color:#c99525;color:#3a2a08}
.ht-card button[disabled]{opacity:.45;cursor:not-allowed}
.ht-card button.is-on{background:#fff6dc;border-color:#e0b443;box-shadow:0 0 0 2px rgba(224,180,67,.35)}
.ht-styles{display:grid;grid-template-columns:repeat(3,1fr);gap:.4rem;margin:.2rem 0 .6rem}
.ht-styles button{display:flex;flex-direction:column;align-items:center;gap:.2rem;padding:.4rem;white-space:normal}
.ht-styles img{height:62px;width:100%;object-fit:contain}
.home-tower-panel.ht-docked{justify-content:flex-start;align-items:stretch;background:transparent;pointer-events:none;padding:8px}
.home-tower-panel.ht-docked .ht-card{pointer-events:auto;width:min(380px,94vw);max-height:none;overflow:auto}
.ht-docked .ht-styles img{height:44px}
.ht-config{display:grid;gap:.25rem;max-height:40vh;overflow:auto;margin:.1rem 0 .4rem}
.ht-opt{display:grid;grid-template-columns:1fr auto 30px 30px;gap:.35rem;align-items:center;background:rgba(255,255,255,.86);border:1px solid #e1d9c9;border-radius:8px;padding:.25rem .45rem}
.ht-opt-label b{display:block;font-size:.8rem;color:#3a352c}
.ht-dots{display:flex;flex-wrap:wrap;gap:3px;margin-top:3px}
.ht-dots i{width:6px;height:6px;border-radius:50%;background:#8fafbf;opacity:.4}
.ht-dots i.is-on{opacity:1}
.ht-opt small{font-size:.7rem;color:#7a7264}
.ht-opt button{padding:.15rem 0;font-size:1rem;line-height:1}
.ht-name{display:flex;gap:.4rem;align-items:center;margin:.3rem 0 .2rem}
.ht-special{display:flex;justify-content:center;gap:10px;margin:.3rem 0 .2rem}
.ht-special button{display:inline-flex;align-items:center;gap:4px;padding:.3rem .6rem .3rem .45rem}
.ht-special button>i{display:block;background:var(--ht-icon) center/contain no-repeat;opacity:.4}
.ht-special button:hover>i,.ht-special button:focus-visible>i{background-image:var(--ht-icon-hover);opacity:1}
.ht-special [data-ht-flip]>i{width:20px;height:16px}
.ht-special [data-ht-random]>i{width:18px;height:14px}
.ht-styles.is-left img{transform:scaleX(-1)}
.ht-name input{flex:1;font:inherit;font-size:.85rem;padding:.3rem .45rem;border:1px solid #c9b48a;border-radius:7px}
.ht-note{margin:.45rem 0 0;font-size:.76rem;color:#6d6555}
@media (max-width:480px){.ht-styles{grid-template-columns:repeat(2,1fr)}.ht-row{grid-template-columns:28px 1fr}.ht-row>div:last-child{grid-column:1/-1}}
`;

function el(tag, attrs = {}, text = '') {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (v === true) node.setAttribute(k, '');
    else if (v !== false && v != null) node.setAttribute(k, v);
  }
  if (text) node.textContent = text;
  return node;
}

function ensurePanel() {
  if (panel || typeof document === 'undefined') return panel;
  if (!document.getElementById('ht-css')) {
    const style = document.createElement('style');
    style.id = 'ht-css';
    style.textContent = CSS;
    document.head.appendChild(style);
  }
  panel = document.createElement('div');
  panel.id = 'home-tower-panel';
  panel.className = 'glitch-modal home-tower-panel';
  panel.hidden = true;
  panel.innerHTML = `<div class="glitch-modal-card ht-card" role="dialog" aria-modal="true" aria-labelledby="ht-title">
    <div class="glitch-modal-head"><div style="flex:1 1 auto"><p class="ht-kicker" data-ht-kicker></p><h2 id="ht-title" data-ht-title></h2></div>
    <button type="button" class="verb-menu-x" data-ht-close aria-label="Close">×</button></div>
    <div data-ht-body></div>
  </div>`;
  const host = document.getElementById('make-panel')?.parentElement || document.body;
  host.appendChild(panel);
  panel.addEventListener('click', (e) => {
    if (e.target === panel || e.target.closest('[data-ht-close]')) closePanel();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel && !panel.hidden) {
      e.stopPropagation();
      closePanel();
    }
  }, true);
  return panel;
}

function openPanel(engine, mode) {
  if (!ensurePanel()) return;
  panelMode = mode;
  panel.hidden = false;
  // ChassisManager: the configger docks at the side, with no dimming, and the
  // camera centres the Tower in the rest of the view (scaleVP).
  panel.classList.toggle('ht-docked', mode === 'customize');
  if (mode === 'customize') lookAtTower(engine);
  renderPanel(engine);
}

function closePanel() {
  if (panel) panel.hidden = true;
  panelMode = null;
  releaseTowerLook();
}

/**
 * scaleVP: itemstack_pt.x = tower x - WIDTH_OF_CONFIG_UI / 2, and y the
 * Tower's middle (the remake does not zoom out, so it frames the middle).
 */
const CONFIG_UI_W = 380;
let towerLook = null;

function lookAtTower(engine) {
  const box = streetView?.container;
  const p = engine?.player;
  if (!box || box.destroyed || !p || typeof engine.setCameraLook !== 'function') return;
  const now = engine.cameraLook || { x: 0, y: 0 };
  if ((now.x || now.y) && !(towerLook && now.x === towerLook.x && now.y === towerLook.y)) return;
  const b = towerBounds(composeTower(tower.style, extraFloors(tower), tower.config, tower.facingRight));
  const mid = box.y + (b.t + b.b) / 2;
  // cameraTargetY puts the target 75% down the 408 px view: centre `mid` instead.
  const dy = Math.round(mid - p.y + 408 * 0.25);
  const dx = Math.round(box.x - p.x - CONFIG_UI_W / 2);
  towerLook = { x: dx, y: dy, engine };
  engine.setCameraLook(dx, dy);
}

function releaseTowerLook() {
  if (!towerLook) return;
  const { engine } = towerLook;
  const now = engine?.cameraLook;
  if (now && now.x === towerLook.x && now.y === towerLook.y) engine.setCameraLook(0, 0);
  towerLook = null;
}

function renderPanel(engine) {
  if (!panel || panel.hidden) return;
  const q = (s) => panel.querySelector(s);
  const body = q('[data-ht-body]');
  body.replaceChildren();
  if (panelMode === 'project') renderProject(engine, q, body);
  else if (panelMode === 'elevator') renderElevator(engine, q, body);
  else if (panelMode === 'customize') renderCustomize(engine, q, body);
}

function renderProject(engine, q, body) {
  const project = activeProject(tower);
  if (!project) return closePanel();
  const def = TOWER_JOBS[project.jobId];
  q('[data-ht-kicker]').textContent = project.key === 'project' ? 'Tower Project · Your Home Street' : `Tower Project · ${towerLabel(tower)}`;
  q('[data-ht-title]').textContent = def.title;
  body.append(el('p', { class: 'ht-desc' }, def.desc));
  const perc = projectPercent(project.jobId, project.got);
  const phase = el('div', { class: 'ht-phase' });
  const bar = el('div', { class: 'ht-bar' });
  const fill = el('i');
  fill.style.width = `${Math.round(perc * 100)}%`;
  bar.append(fill);
  phase.append(el('span', {}, `${Math.round(perc * 100)}% done`), bar);
  body.append(phase);
  const list = el('ul', { class: 'ht-list' });
  const ctx = workCtx(engine);
  for (const r of projectRequirements(project.jobId, project.got)) {
    const li = el('li', { class: `ht-row${r.done ? ' is-done' : ''}${!r.done && !r.open ? ' is-locked' : ''}`, dataset: { htReq: r.id } });
    const img = el('img', { src: itemIcon(r.type === 'work' ? r.classIds[0] : r.classId), alt: '' });
    img.onerror = () => {
      img.style.visibility = 'hidden';
    };
    const text = el('div');
    text.append(el('b', {}, r.type === 'work' ? `${r.desc}: ${r.verb} with a ${itemLabel(r.classIds[0])}` : `${r.desc}: ${r.need} ${itemLabel(r.classId, r.need)}`));
    const meta = [`${r.got.toLocaleString()} / ${r.need.toLocaleString()}`];
    if (r.type === 'item') meta.push(`you have ${countItem(engine.inv, r.classId)}`);
    if (r.type === 'work') meta.push(`${r.energy} energy · ${r.wear} wear a unit`);
    if (!r.done && !r.open) meta.push('opens after the earlier steps');
    text.append(el('small', {}, meta.join(' · ')));
    const acts = el('div');
    if (r.open && r.type === 'item') {
      const n = Math.min(countItem(engine.inv, r.classId), r.need - r.got);
      const b = el('button', { type: 'button', class: 'primary', dataset: { htAct: 'give' } }, n ? `Add ${n}` : 'Add');
      b.disabled = !n;
      b.addEventListener('click', () => contribute(engine, r.classId, n));
      acts.append(b);
    } else if (r.open && r.type === 'work') {
      const check = workCheck(project.jobId, project.got, r.id, ctx);
      const b = el('button', { type: 'button', class: 'primary', dataset: { htAct: 'work' } }, 'Work');
      b.disabled = !check.ok;
      b.title = check.ok ? `${r.need - r.got} units, 1.5s each` : check.msg;
      b.addEventListener('click', () => startWork(engine, r.id));
      acts.append(b);
    } else if (r.done) acts.append(el('small', {}, '✓'));
    li.append(img, text, acts);
    list.append(li);
  }
  body.append(list);
  body.append(el('p', { class: 'ht-note' }, project.key === 'project'
    ? 'Your Tower opens with two floors. Add more from inside, up to nine.'
    : `When this project is done your Tower has ${tower.floors + 1} floors.`));
}

function renderElevator(engine, q, body) {
  q('[data-ht-kicker]').textContent = `${TOWER_GEO.elevatorLabel} · ${towerLabel(tower)}`;
  q('[data-ht-title]').textContent = 'Elevator';
  const list = el('ul', { class: 'ht-list' });
  for (const stop of [...elevatorStops(tower)].reverse()) {
    const li = el('li', { class: 'ht-row', dataset: { htStop: stop.index } });
    // The mark the column shows on that floor (L, 1, 2, ...).
    const icon = el('span', { class: 'ht-mark', 'aria-hidden': 'true' }, stop.mark);
    const text = el('div');
    text.append(el('b', {}, stop.label));
    if (stop.construction) text.append(el('small', {}, 'Under construction: the Workbench is here'));
    const acts = el('div');
    const here = stop.index === tower.floor;
    const b = el('button', { type: 'button', class: here ? 'is-on' : 'primary', dataset: { htAct: 'go' } }, here ? 'You are here' : 'Go');
    b.disabled = here;
    b.addEventListener('click', () => goToFloor(engine, stop.index));
    acts.append(b);
    li.append(icon, text, acts);
    list.append(li);
  }
  body.append(list);
  // tower_set_floor_name: rename the floor you stand on.
  const row = el('div', { class: 'ht-name' });
  const input = el('input', { type: 'text', maxlength: '25', placeholder: 'Name this floor', value: tower.floorLabels[tower.floor] || '', 'aria-label': 'Floor name' });
  const save = el('button', { type: 'button' }, 'Rename floor');
  save.addEventListener('click', () => {
    setFloorLabel(tower, tower.floor, input.value);
    engine.save();
    renderPanel(engine);
    publish(engine, true);
  });
  row.append(input, save);
  body.append(row);
  const costs = expandCosts(tower);
  body.append(el('p', { class: 'ht-note' }, costs.count
    ? `${costs.count} more floor${costs.count === 1 ? '' : 's'} can be added. Start one from Decorate → Tower.`
    : 'Your Tower is as tall as it gets.'));
}

/** QA / canvas form of a config: "floor_top:3,floor_1:2,...". */
function configString(config) {
  return Object.entries(config || {}).map(([k, v]) => `${k}:${v}`).join(',');
}

function parseConfigString(text) {
  const out = {};
  for (const pair of String(text || '').split(',')) {
    const [k, v] = pair.split(':');
    if (k && v) out[k.trim()] = Number.isFinite(Number(v)) ? Number(v) : v.trim();
  }
  return out;
}

/**
 * Re-draw the street Tower after a Customize change and keep the panel open
 * (ChassisManager previews every change in place until the player is done).
 */
function applyCustomize(engine) {
  engine.save();
  publish(engine, true);
  if (streetView?.container && !streetView.container.destroyed && tower.built) {
    drawExterior(engine, streetView.container);
    if (streetView.target) streetView.target.label = towerLabel(tower);
    if (panelMode === 'customize') lookAtTower(engine);
  } else {
    engine.refreshHomeScene?.();
  }
  renderPanel(engine);
}

/**
 * ChassisManager / ConfiggerUI: the style picker, then one row per part with
 * its label, a dot per choice (the current one lit) and < > buttons that wrap,
 * a Randomize button, and the tower name (TowerNameUI, 25 chars).
 */
function renderCustomize(engine, q, body) {
  q('[data-ht-kicker]').textContent = towerLabel(tower);
  q('[data-ht-title]').textContent = 'Customize your Tower';
  // ChassisPickerUI.as 294: the style thumbnails face the way the Tower does.
  const grid = el('div', { class: `ht-styles${tower.facingRight === false ? ' is-left' : ''}` });
  for (const style of Object.values(TOWER_STYLES)) {
    const b = el('button', { type: 'button', class: tower.style === style.id ? 'is-on' : '', dataset: { htStyle: style.id } });
    const thumb = towerArticle(style.id, 'floor_top', normalizeTowerState({ style: style.id }).config.floor_top);
    b.append(el('img', { src: thumb ? `${TOWER_ART_DIR}${thumb[0]}` : '', alt: '' }), el('span', {}, style.name));
    b.addEventListener('click', () => {
      if (tower.style === style.id) return;
      setTowerStyle(tower, style.id);
      engine.pushActivity(`Your Tower is now a ${style.name}.`);
      applyCustomize(engine);
    });
    grid.append(b);
  }
  body.append(grid);
  const list = el('div', { class: 'ht-config', dataset: { htConfig: tower.style } });
  for (const row of towerConfigRows(tower.style, extraFloors(tower))) {
    const cur = tower.config[row.key];
    const line = el('div', { class: 'ht-opt', dataset: { htOpt: row.key } });
    const dots = el('span', { class: 'ht-dots', 'aria-hidden': 'true' });
    for (let i = 1; i <= row.choices; i += 1) dots.append(el('i', { class: i === cur ? 'is-on' : '' }));
    const label = el('div', { class: 'ht-opt-label' });
    label.append(el('b', {}, row.label), dots);
    const step = (dir) => {
      setTowerConfig(tower, stepConfig(tower.style, tower.config, row.key, dir));
      applyCustomize(engine);
    };
    const prev = el('button', { type: 'button', 'aria-label': `Previous ${row.label}`, dataset: { htStep: `${row.key}:-1` } }, '‹');
    const next = el('button', { type: 'button', 'aria-label': `Next ${row.label}`, dataset: { htStep: `${row.key}:1` } }, '›');
    prev.addEventListener('click', () => step(-1));
    next.addEventListener('click', () => step(1));
    const count = el('small', {}, `${cur} of ${row.choices}`);
    line.append(label, count, prev, next);
    list.append(line);
  }
  body.append(list);
  // ConfiggerUI "toss in the flip": after the rows, one centred row with Flip
  // and Randomize (ConfiggerChoiceElementUI flip_bt / randomize_bt, 10 px apart).
  const tools = el('div', { class: 'ht-special' });
  const iconButton = (label, data, icon, hover, title) => {
    const b = el('button', { type: 'button', dataset: data, title });
    const i = el('i', { 'aria-hidden': 'true' });
    i.style.setProperty('--ht-icon', `url("${icon}")`);
    i.style.setProperty('--ht-icon-hover', `url("${hover}")`);
    b.append(i, el('span', {}, label));
    return b;
  };
  const flip = iconButton('Flip', { htFlip: tower.facingRight === false ? 'left' : 'right' }, CHASSIS_ICONS.chassis_flip, CHASSIS_ICONS.chassis_flip_hover, 'Turn it around');
  flip.addEventListener('click', () => {
    flipTower(tower);
    applyCustomize(engine);
  });
  const random = iconButton('Randomize', { htRandom: '1' }, CHASSIS_ICONS.chassis_randomize, CHASSIS_ICONS.chassis_randomize_hover, '');
  random.addEventListener('click', () => {
    setTowerConfig(tower, randomTowerConfig(tower.style));
    applyCustomize(engine);
  });
  tools.append(flip, random);
  body.append(tools);
  const row = el('div', { class: 'ht-name' });
  const input = el('input', { type: 'text', maxlength: '25', placeholder: 'Name your Tower (shown on its sign)', value: tower.name, 'aria-label': 'Tower name' });
  const save = el('button', { type: 'button', class: 'primary' }, 'Set name');
  save.addEventListener('click', () => {
    tower.name = cleanTowerName(input.value);
    applyCustomize(engine);
  });
  row.append(input, save);
  body.append(row);
  body.append(el('p', { class: 'ht-note' }, 'Tower styles cost credits in the original; here they are free, like wallpaper. Floor rows appear as your Tower grows.'));
}

/* ------------------------------------------------------------------ */
/* Magic Rock                                                           */
/* ------------------------------------------------------------------ */

/** G231: the home street's rock (homes-feature, through the bridge), or null. */
function streetRock() {
  return bridge?.rock?.() || null;
}

/** The rock has the Tower quest to give, or it is running. */
function rockHasTalk(engine) {
  return rockOffers(engine).length > 0 || questActive(engine);
}

function talkToRock(engine) {
  const offers = rockOffers(engine);
  if (offers.length) {
    const card = offers[0];
    engine.offerQuestDialogue({
      title: card.title,
      kicker: 'Magic Rock',
      beats: card.beats,
      acceptLabel: card.acceptLabel,
      declineLabel: card.declineLabel,
      onAccept: () => acceptTowerQuest(engine),
    });
    return true;
  }
  const text = !questActive(engine)
    ? 'Keep it up, lil\' Glitch. I\'ll let you know when I think of something.'
    : bridge?.towerItem?.()
      ? 'Gather the requirements and finish the project. Bigger, bigger!'
      : 'Go to your home street and Cultivate a Tower to get started.';
  engine.say?.(streetRock(), text, 4200);
  return true;
}

function acceptTowerQuest(engine) {
  const result = acceptOffer(engine.questState, BUILD_A_TOWER.id, questCtx(engine));
  if (!result.ok) return false;
  engine.pushActivity(`New quest: ${questDef()?.title || 'Build a Tower'}`);
  // build_a_tower.onCreate: a Tower already cultivated counts at once.
  if (bridge?.towerItem?.()) setFlag(engine, BUILD_A_TOWER.cultivateFlag);
  const rock = streetRock();
  if (rock) rock.subtitle = 'Build a Tower';
  engine.save();
  publish(engine, true);
  return true;
}

/* ------------------------------------------------------------------ */
/* homes-feature hooks                                                  */
/* ------------------------------------------------------------------ */

function onCultivated(engine, item) {
  tower.project = {};
  setFlag(engine, BUILD_A_TOWER.cultivateFlag);
  engine.pushActivity('You imagined the plans for a Tower. Start the project to build it.');
  publish(engine, true);
  return item;
}

/** QA &towervisits=N (a fresh game runs no restore, so init reads it too). */
function qaTowerVisits(engine) {
  const raw = engine?.param?.('towervisits');
  const n = raw == null || raw === '' ? NaN : Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

/** items/include/jobs.js hasInProgressJob: something has gone into the Tower project. */
function projectStarted() {
  return !tower.built && projectPercent(TOWER_JOB, tower.project) > 0;
}

/**
 * proto remove verb (proto_furniture_tower_chassis.js:49-77): an untouched
 * proto goes after "Please Confirm!"; a started project first needs Wine of the
 * Dead poured on it (homes-feature pour, js/wine-pour.js). A built Tower stays.
 */
function requestRemove(engine, item, doRemove) {
  if (!item) return false;
  if (item.endClass === TOWER_CHASSIS) {
    engine.toast('Your Tower is built; it stays.');
    return false;
  }
  if (projectStarted()) {
    engine.toast(WOTD_TEXT.pourFirst, 3200);
    return false;
  }
  engine.offerQuestDialogue({
    title: 'Please Confirm!',
    kicker: 'Tower',
    beats: [{ text: 'Are you really sure you want to remove this Tower?', response: 'Yes' }],
    acceptLabel: 'Yes',
    declineLabel: 'Nevermind',
    onAccept: () => {
      tower.project = {};
      if (work) stopWork(engine, '');
      doRemove();
      publish(engine, true);
    },
  });
  return true;
}

/** Wine of the Dead on the Tower proto: proto resetJob, everything put in is lost. */
function cancelProject(engine) {
  if (!projectStarted()) return false;
  if (work) stopWork(engine, '');
  tower.project = {};
  if (panelMode === 'project') closePanel();
  engine.save();
  refreshProtoArt(engine);
  publish(engine, true);
  return true;
}

export const towerApi = {
  connect(b) {
    bridge = b;
  },
  state: () => tower,
  currentFloor,
  isConstructionFloor,
  floorTitle,
  spawnStreet,
  spawnFloor,
  /** `via` 'door' lands at the teleport point (tower_get_teleport_point), as /tower does; default the elevator. */
  goToFloor: (engine, floor, via) => goToFloor(engine, floor, via),
  leaveTower: (engine) => leaveTower(engine),
  /** homes-feature: a street scene resets the floor pointer. */
  clearFloor() {
    tower.floor = null;
  },
  /** How the avatar reached this floor: 'door' (ground floor, from outside) or 'elevator'. */
  takeFloorArrival() {
    const via = floorArrival;
    floorArrival = null;
    return via;
  },
  takeArrivalX() {
    const x = arrivalX;
    arrivalX = null;
    return x;
  },
  onCultivated,
  requestRemove,
  /**
   * G231: the talk to row homes-feature adds to the street rock while the
   * rock has Build a Tower to give or it is running (magic_rock.js talk_to
   * 360-386, sort_on 61), with the rock's subtitle; null otherwise.
   */
  rockTalk(engine) {
    if (!rockHasTalk(engine)) return null;
    return { tooltip: 'Talk to the Magic Rock!', subtitle: questActive(engine) ? 'Build a Tower' : 'Has an idea for you' };
  },
  talkToRock: (engine) => talkToRock(engine),
  /** G232: Build a Tower is on offer now (homes-feature puts the offer before the rock's iMG). */
  rockOffer: (engine) => rockOffers(engine).length > 0,
  projectStarted,
  cancelProject: (engine) => cancelProject(engine),
  /** butler_hints.js:393: how many times you have gone into your Tower. */
  visits: () => tower.visits || 0,
  expandCosts: () => expandCosts(tower),
  beginExpansion: (engine) => beginExpansion(engine),
  label: () => towerLabel(tower),
  config: TOWER_CONFIG,
};

/* ------------------------------------------------------------------ */
/* Tower secrets (Jethimadh Tower Base)                                 */
/* ------------------------------------------------------------------ */

function tickSecrets(engine) {
  if (!spots.length) return;
  const p = engine.player;
  if (!p) return;
  for (const box of spots) {
    if (tower.secrets.includes(box.id) || !inTowerSpot(box, p.x, p.y)) continue;
    tower.secrets.push(box.id);
    engine.achievement(`${TOWER_SECRETS_GROUP}:${box.id}`, 1);
    const count = tower.secrets.length;
    const bonus = TOWER_SECRET_CURRANTS[box.id] || 0;
    if (bonus && count !== 11) {
      engine.pc.currants = (engine.pc.currants || 0) + bonus;
      engine.updateHud();
    }
    const text = towerSecretText(count);
    if (text) engine.prompt({ kicker: 'Jethimadh Tower Base', title: 'A secret spot!', text });
    engine.playSound?.('ACHIEVEMENT_UNLOCKED', { volume: 0.4 });
    engine.save();
    publish(engine, true);
  }
}

/* ------------------------------------------------------------------ */
/* QA demo and autoplay                                                 */
/* ------------------------------------------------------------------ */

const PROJECT_KIT = {
  grade_aa_earth_block: 20, general_building_permit: 1, snail: 200, girder: 4, wall_segment: 16, shovel: 1, construction_tool: 1,
};

function grantFor(engine, jobId) {
  for (const r of TOWER_JOBS[jobId].requirements) {
    if (r.type === 'item') engine.inv[r.classId] = Math.max(engine.inv[r.classId] || 0, r.num);
    else engine.inv[r.classIds[0]] = Math.max(engine.inv[r.classIds[0]] || 0, 1);
  }
  engine.pc.energy = Math.max(engine.pc.energy || 0, 900);
  engine.refreshPack();
}

function ensureLevel(engine, level) {
  if ((engine.pc.level || 1) >= level) return;
  engine.pc.xp = Math.max(engine.pc.xp || 0, XP_FOR_LEVEL[level - 1] || 0);
  engine.pc.level = level;
  engine.updateHud();
}

function demoStreet(engine) {
  if (!demo || demo.street) return;
  demo.street = true;
  const kind = demo.kind;
  if (kind === 'quest') {
    ensureLevel(engine, 19);
    engine.pc.imagination = Math.max(engine.pc.imagination || 0, 25_000);
    const def = questDef();
    // Until build-quests.mjs flips it solo (lead integration), QA lifts the gate in memory.
    if (def && !def.solo) def.solo = true;
    for (const [cls, n] of Object.entries(PROJECT_KIT)) engine.inv[cls] = Math.max(engine.inv[cls] || 0, n);
    engine.pc.energy = Math.max(engine.pc.energy || 0, 900);
    engine.refreshPack();
    engine.updateHud();
    setTimeout(() => engine.refreshHomeScene?.().then(() => startAutoplay(engine)), 0);
    return;
  }
  if (!bridge) return;
  ensureLevel(engine, 19);
  const built = kind !== 'proto';
  if (!bridge.towerItem()) bridge.seedTower(built);
  if (built) {
    tower.built = true;
    tower.builtAt = Date.now();
    const floors = Number(engine.param('towerfloors'));
    tower.floors = Number.isFinite(floors) ? Math.max(2, Math.min(9, floors)) : tower.floors;
    if (TOWER_STYLES[engine.param('towerstyle')]) setTowerStyle(tower, engine.param('towerstyle'));
    if (engine.param('towerconfig')) {
      const qa = parseConfigString(engine.param('towerconfig'));
      // facing_right rides along in the QA string, as it did beside user_config.
      const facing = parseTowerFacing(qa.facing_right ?? qa.facing);
      if (facing != null) setTowerFacing(tower, facing);
      setTowerConfig(tower, { ...tower.config, ...qa });
    }
    const facing = parseTowerFacing(engine.param('towerfacing'));
    if (facing != null) setTowerFacing(tower, facing);
    if (engine.param('towername')) tower.name = cleanTowerName(engine.param('towername'));
    tower.project = {};
  } else {
    for (const [cls, n] of Object.entries(PROJECT_KIT)) engine.inv[cls] = Math.max(engine.inv[cls] || 0, n);
    engine.pc.energy = Math.max(engine.pc.energy || 0, 900);
  }
  if (kind === 'expand') {
    if (tower.floors >= TOWER_CONFIG.MAX_FLOORS) tower.floors = TOWER_CONFIG.MAX_FLOORS - 1;
    tower.expanding = true;
    tower.expansion = {};
    grantFor(engine, floorJobFor(tower.floors));
  }
  engine.save();
  setTimeout(() => {
    const go = kind === 'inside' || kind === 'expand'
      ? goToFloor(engine, kind === 'expand' ? tower.floors : 0, kind === 'expand' ? 'elevator' : 'door')
      : engine.refreshHomeScene?.();
    Promise.resolve(go).then(() => {
      // QA &towerlook=<dy>: look up the street the way Camera Mode does (engine.setCameraLook).
      const look = Number(engine.param('towerlook'));
      if (kind !== 'inside' && kind !== 'expand' && Number.isFinite(look)) engine.setCameraLook?.(0, look);
      // QA &towerpanel=customize: open the Customize panel (the Tower's customize verb).
      if (built && engine.param('towerpanel') === 'customize') openPanel(engine, 'customize');
      startAutoplay(engine);
    });
  }, 0);
}

function startAutoplay(engine) {
  if (!demo || demo.autoplayStarted || engine.param('towerautoplay') !== '1') return;
  demo.autoplayStarted = true;
  autoplay = { at: Date.now() + 1200, step: 0 };
}

function autoplayStep(engine, now) {
  if (!autoplay || now < autoplay.at || engine.questDialogueOpen()) return;
  autoplay.at = now + 700;
  const kind = demo.kind;
  const project = activeProject(tower);
  const say = (s) => engine.setData('towerAutoplay', s);
  if (kind === 'quest' && !questActive(engine) && !engine.questState?.completed?.includes(BUILD_A_TOWER.id)) {
    if (!rockOffers(engine).length) return say('waiting-offer');
    acceptTowerQuest(engine);
    return say('accepted');
  }
  if ((kind === 'quest') && !bridge.towerItem()) {
    const res = bridge.cultivateTower(engine);
    say(res?.ok ? 'cultivated' : `cultivate-failed:${res?.reason || ''}`);
    if (res?.ok) for (const [cls, n] of Object.entries(PROJECT_KIT)) engine.inv[cls] = Math.max(engine.inv[cls] || 0, n);
    engine.pc.energy = Math.max(engine.pc.energy || 0, 900);
    return;
  }
  if (work) return;
  if (project && bridge.towerItem()) {
    const rows = projectRequirements(project.jobId, project.got).filter((r) => r.open);
    const item = rows.find((r) => r.type === 'item');
    if (item) {
      contribute(engine, item.classId, item.need - item.got);
      return say(`give:${item.classId}`);
    }
    const job = rows.find((r) => r.type === 'work');
    if (job) {
      engine.pc.energy = Math.max(engine.pc.energy || 0, 900);
      startWork(engine, job.id);
      return say(`work:${job.id}`);
    }
    return;
  }
  if (kind === 'quest' && engine.questState?.completed?.includes(BUILD_A_TOWER.id)) {
    autoplay = null;
    return say('done');
  }
  if (kind !== 'quest') {
    autoplay = null;
    say('done');
  }
}

/* ------------------------------------------------------------------ */
/* Feature                                                              */
/* ------------------------------------------------------------------ */

export const homeTowerFeature = {
  id: HOME_TOWER_FEATURE_ID,

  init(engine) {
    engineRef = engine;
    ensureItem(TOWER_PROTO, { label: 'Tower', desc: 'Plans for a Tower on your home street.', stackMax: 1, donatable: false });
    ensureItem(TOWER_EXPANDER, { label: 'Workbench', desc: 'Where a new Tower floor gets built.', stackMax: 1, donatable: false });
    const kind = String(engine.param('towerdemo') || '');
    if (kind) demo = { kind };
    const qaVisits = qaTowerVisits(engine);
    if (qaVisits != null) tower.visits = qaVisits;
    publish(engine, true);
  },

  save() {
    return tower;
  },

  restore(slice, engine) {
    tower = normalizeTowerState(slice || {});
    // butler_hint_counters visited_my_tower, saved with the Tower (QA: &towervisits=N).
    tower.visits = qaTowerVisits(engine) ?? Math.max(0, Math.floor(Number(slice?.visits) || 0));
  },

  onStreetEnter(street, engine) {
    // Ordinary streets: no tower floor, and maybe a secret spot or two.
    tower.floor = null;
    spots = towerSpotsFor(engine.street);
    if (demo?.kind === 'secrets' && !demo.placed && spots.length && engine.player) {
      demo.placed = true;
      const box = spots.find((b) => b.id === 'TowerSpot_02') || spots[0];
      engine.player.x = box.x + 160;
      engine.player.y = box.y - 4;
      engine.snapCamera?.();
      if (engine.param('towerautoplay') === '1') {
        setTimeout(() => {
          if (!engine.player) return;
          engine.player.x = box.x;
        }, 1500);
      }
    }
    engine.setData('towerSpots', spots.map((b) => `${b.id}:${b.source}`).join(','));
    publish(engine, true);
  },

  onStreetClear(engine) {
    if (work) stopWork(engine, '');
    closePanel();
    streetView = null;
    floorView = null;
    spots = [];
  },

  onTick(dtMs, now, engine) {
    keepOnPlanks(engine);
    tickWork(engine, now);
    tickSecrets(engine);
    autoplayStep(engine, now);
    publish(engine);
  },

  verbsFor(target, engine) {
    switch (target.classId) {
      case TOWER_PROTO: {
        const started = projectPercent(TOWER_JOB, tower.project) > 0;
        return [
          { id: 'build_tower', label: started ? 'view project' : 'build tower', enabled: true, tooltip: 'Start a project to build a tower here', durationMs: 0 },
          // proto.js remove conditions: a started project needs Wine of the Dead first.
          { id: 'remove', label: 'remove', enabled: !started, reason: started ? WOTD_TEXT.pourFirst : '', tooltip: 'Remove from the location', durationMs: 0 },
        ];
      }
      case TOWER_CHASSIS:
        return [
          { id: 'enter', label: 'enter', enabled: true, tooltip: `Go inside ${towerLabel(tower)}`, durationMs: 0 },
          // furniture_base verbs.flip (sort_on 51, before customize's 54).
          { id: 'flip', label: 'flip', enabled: true, tooltip: 'Turn it around', durationMs: 0 },
          { id: 'customize', label: 'customize', enabled: true, tooltip: 'Change it', durationMs: 0 },
        ];
      case 'tower_elevator':
        return [{ id: 'ride', label: 'ride', enabled: true, tooltip: 'Go to another floor', durationMs: 0 }];
      case 'tower_exit':
        return [{ id: 'leave', label: 'leave tower', enabled: true, tooltip: 'Back to your home street', durationMs: 0 }];
      case TOWER_EXPANDER:
        return [{ id: 'construct', label: 'construct', enabled: Boolean(activeProject(tower)), tooltip: 'Construct a new floor', durationMs: 0 }];
      default:
        return [];
    }
  },

  runVerb(target, verbId, engine) {
    switch (target.classId) {
      case TOWER_PROTO:
        if (verbId === 'remove') {
          bridge?.removeTower?.(engine);
          return true;
        }
        openPanel(engine, 'project');
        return true;
      case TOWER_CHASSIS:
        if (verbId === 'customize') openPanel(engine, 'customize');
        else if (verbId === 'flip') {
          flipTower(tower);
          applyCustomize(engine);
        } else goToFloor(engine, 0, 'door');
        return true;
      case 'tower_elevator':
        openPanel(engine, 'elevator');
        return true;
      case 'tower_exit':
        leaveTower(engine);
        return true;
      case TOWER_EXPANDER:
        openPanel(engine, 'project');
        return true;
      default:
        return false;
    }
  },

  /** QA / tests. */
  _state() {
    return { tower, work, panelMode, spots, demo, streetView: Boolean(streetView), floorView };
  },
};
