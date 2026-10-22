/**
 * Client side of the nine reconstructed Ticket to Paradise courses
 * (data and body physics in paradise-courses.js).
 *
 * game.js keeps the shared Paradise run (ticket economy, HUD, pickups,
 * exit, timer, return) and calls in here through a small host object:
 * - buildParadiseCourseArt(root, course, { foreground }) paints the scene.
 * - paradiseCourseRuntime.input/physics step the avatar body for the
 *   platform, swim, glide, plunge and updraft courses (Cloud Flight keeps
 *   the shipped flight model).
 * - paradiseCourseRuntime.enter/tick/dataset handle QA placement, scenery
 *   animation and canvas QA attributes.
 *
 * Art is clean: recovered CoU deco PNGs (mountaineering crags, newxp
 * clouds, fir branches, oyster fungi, conifers, doors) and native Pixi
 * vectors. Nothing here reads or copies recording pixels.
 */

import { stepParadiseBody, usesParadiseBody } from './paradise-courses.js';

const DECO_ROOT = 'assets/decos/groddle';
const decoUrl = (name) => `${DECO_ROOT}/${name}.png`;

const FONT = 'Trebuchet MS, sans-serif';

/** Deco PNGs each course paints with (preloaded before the scene is built). */
export const PARADISE_COURSE_DECOS = Object.freeze({
  aerial_boost: ['clouds_bg_middleplus_01a_newxp', 'clouds_bg_middleplus_01b_newxp', 'cloud_fluffy_1', 'cloud_fluffy_2', 'door_asset_heights', 'firebog_sign_blank_plank'],
  mountain_scaling: [
    'craggyMountain_background_01', 'craggyMountain_background_03', 'craggyMountain_background_05',
    'craggyMountain_background_08', 'craggyMountain_mid_01', 'craggyMountain_mid_04',
    'cliff_face_mountaineering_01a_al1', 'cliff_face_mountaineering_01b_al1', 'cliff_face_mountaineering_01c_al1',
    'cliff_face_mountaineering_01d_al1', 'platform_horizontal_ledge_mountaineering_01a_al1',
    'platform_horizontal_ledge_mountaineering_01b_al1', 'clouds_bg_middleplus_01a_newxp',
    'mountain_flora_01a_al1', 'mountain_flora_01e_al1', 'mountain_flora_01f_al1', 'mountain_bonsai_01b_al1',
    'mountain_bonsai_01c_al1', 'tree_coniferous_1', 'heights_door_static', 'firebog_sign_blank_plank',
  ],
  abysmal_thrill: [
    'cliff_face_mountaineering_01c_al1', 'cliff_face_mountaineering_01d_al1',
    'platform_horizontal_ledge_mountaineering_01a_al1', 'platform_horizontal_ledge_mountaineering_01b_al1',
    'bureaucratic_hall_light_ray_1', 'boat', 'mountain_flora_01a_al1', 'mountain_flora_01e_al1',
    'bling_branchflowerbrush_red_1', 'bling_branchflowerbrush_red_2', 'heights_door_static', 'firebog_sign_blank_plank',
  ],
  arbor_hollow: [
    'tree_stack_trunk', 'tree_stack_leafy_1', 'tree_stack_leafy_2', 'platform_branch_a01', 'platform_branch_a02',
    'platform_branch_a04', 'platform_branch_4', 'fungus_oyster_01a_et1', 'fungus_oyster_01b_et1',
    'fungus_oyster_noshadow_01c_et1', 'fungus_oyster_noshadow_01d_et1', 'mushroom_amanita_1', 'tree_coniferous_1',
    'heights_coniferous_3', 'mountain_flora_01a_al1', 'mountain_flora_01e_al1', 'door_asset_heights', 'sign_blank_wide_firebog',
  ],
  bippity_bop: ['clouds_bg_middleplus_01a_newxp', 'clouds_bg_middleplus_01b_newxp', 'cloud_fluffy_1', 'door_asset_heights', 'firebog_sign_blank_plank'],
  cloud_flight: [
    'clouds_bg_middleplus_01a_newxp', 'cloud_fluffy_1', 'cloud_fluffy_2', 'heights_coniferous_1', 'heights_coniferous_3',
    'heights_coniferous_4', 'tree_coniferous_1', 'platform_branch_a04', 'platform_branch_a02', 'door_asset_alakol_door',
  ],
  updraft: ['clouds_bg_middleplus_01a_newxp', 'clouds_bg_middleplus_01b_newxp', 'cloud_fluffy_1', 'cloud_fluffy_2', 'door_asset_heights', 'firebog_sign_blank_plank'],
  sky_plunge: ['clouds_bg_middleplus_01a_newxp', 'clouds_bg_middleplus_01b_newxp', 'cloud_fluffy_1', 'cloud_fluffy_2', 'door_asset_heights', 'firebog_sign_blank_plank'],
  drafty_uplift: ['clouds_bg_middleplus_01a_newxp', 'clouds_bg_middleplus_01b_newxp', 'cloud_fluffy_1', 'freeny_cloud_2', 'door_asset_heights', 'firebog_sign_blank_plank'],
});

export function paradiseCoursePreloadUrls(course) {
  return (PARADISE_COURSE_DECOS[course?.art] || []).map(decoUrl);
}

// --- small drawing helpers ---------------------------------------------------

function makeArt(root, course) {
  const art = {
    course: course.id,
    decos: 0,
    signs: 0,
    bouncers: new Map(),
    animated: [],
    motes: [],
    streaks: [],
    rays: [],
  };
  root.paradiseCourseArt = art;
  return art;
}

/** Recovered deco sprite sized by width (keeps aspect) or explicit width/height. */
function deco(art, parent, name, x, y, o = {}) {
  const texture = PIXI.Assets.get(decoUrl(name)) || PIXI.Texture.from(decoUrl(name));
  const sprite = new PIXI.Sprite(texture);
  sprite.anchor.set(o.ax ?? 0.5, o.ay ?? 1);
  sprite.position.set(x, y);
  sprite.alpha = o.alpha ?? 1;
  if (o.tint != null) sprite.tint = o.tint;
  sprite.zIndex = o.z ?? -20;
  if (o.rotation) sprite.rotation = o.rotation;
  if (o.blend) sprite.blendMode = o.blend;
  const applySize = () => {
    const w0 = Math.max(1, texture.orig?.width || texture.width || 1);
    const h0 = Math.max(1, texture.orig?.height || texture.height || 1);
    if (o.width && o.height) {
      sprite.width = o.width;
      sprite.height = o.height;
    } else if (o.width) {
      sprite.width = o.width;
      sprite.height = o.width * (h0 / w0);
    } else if (o.height) {
      sprite.height = o.height;
      sprite.width = o.height * (w0 / h0);
    }
    if (o.flipX) sprite.scale.x = -Math.abs(sprite.scale.x);
    if (o.flipY) sprite.scale.y = -Math.abs(sprite.scale.y);
    sprite._baseScaleX = sprite.scale.x;
    sprite._baseScaleY = sprite.scale.y;
  };
  if (texture.baseTexture.valid) applySize();
  else texture.baseTexture.once('loaded', applySize);
  parent.addChild(sprite);
  art.decos += 1;
  return sprite;
}

/** Natural height of a deco at a given width (after preload). */
function decoHeightAt(name, width) {
  const texture = PIXI.Assets.get(decoUrl(name)) || PIXI.Texture.from(decoUrl(name));
  const w0 = Math.max(1, texture.orig?.width || texture.width || 1);
  const h0 = Math.max(1, texture.orig?.height || texture.height || 1);
  return width * (h0 / w0);
}

function rect(parent, x, y, w, h, color, alpha = 1, z = -20) {
  const g = new PIXI.Graphics();
  g.beginFill(color, alpha);
  g.drawRect(x, y, w, h);
  g.endFill();
  g.zIndex = z;
  parent.addChild(g);
  return g;
}

function textSign(art, parent, x, y, text, { size = 24, color = 0xffffff, stroke = 0x5b5a86, z = -2, align = 'center' } = {}) {
  const label = new PIXI.Text(text, {
    fontFamily: FONT,
    fontSize: size,
    fontWeight: '700',
    fill: color,
    align,
    stroke,
    strokeThickness: Math.max(2, Math.round(size / 8)),
    lineJoin: 'round',
    dropShadow: true,
    dropShadowColor: 0x1d1d34,
    dropShadowAlpha: 0.35,
    dropShadowBlur: 4,
    dropShadowDistance: 1,
  });
  label.anchor.set(0.5);
  label.position.set(x, y);
  label.zIndex = z;
  parent.addChild(label);
  art.signs += 1;
  return label;
}

/** A plank sign with the word EXIT, like the recorded course exits. */
function exitPlank(art, parent, x, y, { width = 104, rotation = -0.08, z = -4, tint } = {}) {
  const plank = deco(art, parent, 'firebog_sign_blank_plank', x, y, { width, ay: 0.5, rotation, z, tint });
  const label = new PIXI.Text('EXIT', {
    fontFamily: FONT, fontSize: 20, fontWeight: '900', fill: 0xfff4dc, stroke: 0x4a2c16, strokeThickness: 4,
  });
  label.anchor.set(0.5);
  label.position.set(x, y);
  label.rotation = rotation;
  label.zIndex = z + 1;
  parent.addChild(label);
  return plank;
}

/** A tiled band of the recovered newxp cumulus clouds. */
function cloudBand(art, parent, { x1, x2, y, width = 900, z = -20, tint = 0xffffff, alpha = 1, flipY = false, overlap = 0.72 }) {
  const step = width * overlap;
  const sprites = [];
  let index = 0;
  for (let x = x1 - width * 0.3; x < x2 + width * 0.3; x += step, index += 1) {
    sprites.push(deco(art, parent, 'clouds_bg_middleplus_01a_newxp', x, y, {
      width, z, tint, alpha, flipX: index % 2 === 1, flipY, ay: flipY ? 0 : 0.62,
    }));
  }
  return sprites;
}

/** One bouncy cloud whose top edge sits on the platform line. */
function bounceCloud(art, parent, plat, index, { tint = 0xffffff, z = -6 } = {}) {
  const width = (plat.x2 - plat.x1) * 1.12;
  const height = decoHeightAt('clouds_bg_middleplus_01b_newxp', width);
  const cloud = deco(art, parent, 'clouds_bg_middleplus_01b_newxp', (plat.x1 + plat.x2) / 2, plat.y - height * 0.16, {
    width, ay: 0, z, tint, flipX: index % 2 === 1,
  });
  cloud._squashAt = 0;
  art.bouncers.set(index, cloud);
  return cloud;
}

function motes(art, parent, course, count, { color = 0xffffff, alpha = 0.45, rise = 0.25, size = 2.2, z = -45, colors } = {}) {
  for (let index = 0; index < count; index += 1) {
    const dot = new PIXI.Graphics();
    const tint = colors ? colors[index % colors.length] : color;
    dot.beginFill(tint, alpha * (0.55 + (index % 4) * 0.15));
    dot.drawCircle(0, 0, size * (0.6 + (index % 5) * 0.22));
    dot.endFill();
    dot.position.set((index * 197 + 53) % course.width, (index * 389 + 71) % course.height);
    dot.zIndex = z;
    dot._rise = rise * (0.6 + (index % 7) * 0.12);
    dot._sway = index * 0.73;
    parent.addChild(dot);
    art.motes.push(dot);
  }
}

function windStreaks(art, parent, count, area, { vx = 0, vy = 0, length = 90, alpha = 0.32, z = -12, color = 0xffffff, vertical = false } = {}) {
  for (let index = 0; index < count; index += 1) {
    const streak = new PIXI.Graphics();
    streak.lineStyle(2 + (index % 2), color, alpha);
    if (vertical) {
      streak.moveTo(0, 0);
      streak.bezierCurveTo(6, -length * 0.35, -6, -length * 0.65, 0, -length);
    } else {
      streak.moveTo(0, 0);
      streak.bezierCurveTo(length * 0.35, -6, length * 0.65, 6, length, 0);
    }
    streak.position.set(
      area.x1 + ((index * 271) % Math.max(1, area.x2 - area.x1)),
      area.y1 + ((index * 157) % Math.max(1, area.y2 - area.y1))
    );
    streak.zIndex = z;
    streak._vx = vx * (0.7 + (index % 5) * 0.12);
    streak._vy = vy * (0.7 + (index % 5) * 0.12);
    streak._area = area;
    parent.addChild(streak);
    art.streaks.push(streak);
  }
}

// --- course scenes -----------------------------------------------------------

function paintAerialBoost(root, course, fg, art) {
  for (let index = 0; index < 14; index += 1) {
    deco(art, root, index % 2 ? 'cloud_fluffy_1' : 'cloud_fluffy_2',
      (index * 337 + 120) % course.width, 300 + index * 255,
      { width: 420 + (index % 3) * 120, alpha: 0.45, z: -60, flipX: index % 2 === 0 });
  }
  motes(art, root, course, 70, { color: 0xffffff, alpha: 0.5, rise: 0.18, size: 3, z: -40 });
  const plats = course.platforms;
  plats.forEach((plat, index) => {
    if (plat.bounce) bounceCloud(art, root, plat, index);
  });
  // Start cloud sea, and the long exit cloud at the top.
  cloudBand(art, root, { x1: 0, x2: course.width, y: 3700, width: 760, z: -8 });
  rect(root, 0, 3700, course.width, course.height - 3700, 0xf4f9fb, 1, -9);
  cloudBand(art, fg, { x1: 0, x2: course.width, y: 3790, width: 700, z: 52, alpha: 0.96 });
  const exitCloud = plats.find((plat) => plat.id === 'exit-cloud');
  deco(art, root, 'cloud_fluffy_1', 70, exitCloud.y + 20, { width: 200, height: 420, z: -9, alpha: 0.95 });
  deco(art, root, 'door_asset_heights', course.exit.x, course.exit.y + 6, { height: 140, z: -7 });
  exitPlank(art, root, course.exit.x, course.exit.y - 158, { width: 96, rotation: -0.06 });
  cloudBand(art, root, { x1: exitCloud.x1 + 80, x2: exitCloud.x2 - 80, y: exitCloud.y + 40, width: 520, z: -6 });
}

function rockBlock(art, root, plat, course, { tint = 0xffffff } = {}) {
  const width = plat.x2 - plat.x1;
  const cx = (plat.x1 + plat.x2) / 2;
  const capName = width > 220
    ? 'platform_horizontal_ledge_mountaineering_01a_al1'
    : 'platform_horizontal_ledge_mountaineering_01b_al1';
  const capWidth = width * (width > 220 ? 1.12 : 1.28);
  const capHeight = decoHeightAt(capName, capWidth);
  const faceName = width > 300
    ? 'cliff_face_mountaineering_01a_al1'
    : width > 180 ? 'cliff_face_mountaineering_01b_al1' : 'cliff_face_mountaineering_01d_al1';
  const faceWidth = width * (width > 180 ? 1.08 : 0.96);
  const faceHeight = decoHeightAt(faceName, faceWidth);
  const bottom = course.cloudY ? course.cloudY + 120 : course.height;
  let top = plat.y + capHeight * 0.18;
  let flip = false;
  while (top < bottom) {
    deco(art, root, faceName, cx, top, { width: faceWidth, ay: 0, z: -12, tint, flipX: flip });
    top += faceHeight * 0.86;
    flip = !flip;
  }
  // The cap's walking line sits about a fifth of the way down its art.
  deco(art, root, capName, cx, plat.y - capHeight * 0.2, { width: capWidth, ay: 0, z: -10, tint });
}

function paintMountainScaling(root, course, fg, art) {
  const far = ['craggyMountain_background_01', 'craggyMountain_background_03', 'craggyMountain_background_05', 'craggyMountain_background_08'];
  for (let index = 0; index < 9; index += 1) {
    deco(art, root, far[index % far.length], 180 + index * 520, 860, {
      height: 420 + (index % 3) * 110, tint: 0x9db3c6, alpha: 0.5, z: -80, flipX: index % 2 === 1,
    });
  }
  for (let index = 0; index < 6; index += 1) {
    deco(art, root, index % 2 ? 'craggyMountain_mid_04' : 'craggyMountain_mid_01', 420 + index * 760, 860, {
      height: 300 + (index % 2) * 90, tint: 0x8fa2b0, alpha: 0.62, z: -70, flipX: index % 3 === 0,
    });
  }
  cloudBand(art, root, { x1: 0, x2: course.width, y: 840, width: 1100, z: -40, alpha: 0.9, tint: 0xf0f5f8 });
  for (const plat of course.platforms) rockBlock(art, root, plat, course);
  // Plants on the rocks (behind the avatar).
  deco(art, root, 'tree_coniferous_1', 250, 652, { height: 250, z: -9 });
  deco(art, root, 'mountain_flora_01e_al1', 90, 648, { width: 210, z: -8 });
  deco(art, root, 'mountain_bonsai_01c_al1', 1180, 466, { width: 110, z: -8 });
  deco(art, root, 'mountain_flora_01f_al1', 760, 628, { width: 150, z: -8 });
  deco(art, root, 'mountain_flora_01a_al1', 3050, 448, { width: 150, z: -8 });
  deco(art, root, 'mountain_bonsai_01b_al1', 2930, 448, { width: 90, z: -8 });
  deco(art, root, 'mountain_flora_01e_al1', 4010, 528, { width: 190, z: -8 });
  deco(art, root, 'tree_coniferous_1', 4270, 532, { height: 230, z: -9 });
  // Exit door in the last crag with its EXIT plank.
  deco(art, root, 'heights_door_static', course.exit.x, course.exit.y + 8, { height: 150, z: -7 });
  exitPlank(art, root, course.exit.x - 92, course.exit.y - 150, { width: 112, rotation: -0.16 });
  // The cloud sea in front of the rock bases.
  rect(fg, 0, 905, course.width, course.height - 905, 0xf2f6f8, 1, 51);
  cloudBand(art, fg, { x1: 0, x2: course.width, y: 900, width: 900, z: 52, alpha: 0.98 });
}

function paintAbysmalThrill(root, course, fg, art) {
  // Light from the surface: soft rays fading out with depth.
  for (let index = 0; index < 7; index += 1) {
    const ray = deco(art, root, 'bureaucratic_hall_light_ray_1', 300 + index * 150, -60 + (index % 2) * 80, {
      width: 520, height: 1700, ay: 0, alpha: 0.12, tint: 0x9fd4ff, z: -60,
      rotation: -0.18 + index * 0.06, blend: PIXI.BLEND_MODES.ADD,
    });
    ray._phase = index * 0.9;
    art.rays.push(ray);
  }
  // Rock walls either side, darker with depth.
  for (let side = 0; side < 2; side += 1) {
    let flip = side === 1;
    for (let y = -120, index = 0; y < course.height; y += 380, index += 1) {
      const depth = Math.min(1, Math.max(0, y / course.height));
      const shade = Math.round(160 - depth * 95);
      const tint = (shade << 16) | (Math.round(shade * 1.08) << 8) | Math.round(shade * 1.2);
      deco(art, root, index % 2 ? 'cliff_face_mountaineering_01c_al1' : 'cliff_face_mountaineering_01d_al1',
        side === 0 ? 72 : course.width - 72, y, { width: 300, height: 470, ay: 0, z: -14, tint, flipX: flip });
      flip = !flip;
    }
  }
  // Seabed.
  const bed = new PIXI.Graphics();
  bed.beginFill(0x1d2522);
  bed.drawPolygon([0, 3280, 300, 3272, 640, 3286, 980, 3270, 1400, 3282, 1400, course.height, 0, course.height]);
  bed.endFill();
  bed.zIndex = -9;
  root.addChild(bed);
  deco(art, root, 'boat', 1060, 3290, { width: 280, tint: 0x8e989b, rotation: 0.06, z: -8 });
  deco(art, root, 'mountain_flora_01e_al1', 300, 3292, { width: 230, tint: 0x9a8a3b, z: -7 });
  deco(art, root, 'bling_branchflowerbrush_red_1', 240, 3284, { width: 120, z: -7 });
  deco(art, root, 'bling_branchflowerbrush_red_2', 1180, 3284, { width: 110, z: -7 });
  deco(art, root, 'mountain_flora_01a_al1', 780, 3290, { width: 140, tint: 0x9a8a3b, z: -7 });
  const grass = new PIXI.Graphics();
  for (const [gx, count] of [[470, 7], [880, 6], [1250, 5]]) {
    for (let blade = 0; blade < count; blade += 1) {
      const lean = (blade - count / 2) * 9;
      grass.lineStyle(4, 0xd8e2df, 0.85);
      grass.moveTo(gx + blade * 7, 3286);
      grass.quadraticCurveTo(gx + blade * 7 + lean * 0.4, 3240, gx + blade * 7 + lean, 3214 - (blade % 3) * 12);
    }
  }
  grass.zIndex = -6;
  root.addChild(grass);
  // Outcrops and the exit ledge share the recovered ledge caps.
  for (const plat of course.platforms) {
    if (plat.kind === 'seabed') continue;
    const wide = plat.x2 - plat.x1 > 220;
    const name = wide ? 'platform_horizontal_ledge_mountaineering_01a_al1' : 'platform_horizontal_ledge_mountaineering_01b_al1';
    const width = (plat.x2 - plat.x1) * 1.18;
    const height = decoHeightAt(name, width);
    deco(art, root, name, (plat.x1 + plat.x2) / 2, plat.y - height * 0.2, {
      width, ay: 0, z: -10, tint: plat.kind === 'exit-ledge' ? 0xb7c4cc : 0x7f8e99, flipX: plat.side === 'left',
    });
  }
  deco(art, root, 'heights_door_static', course.exit.x, course.exit.y + 8, { height: 140, z: -8, tint: 0xc4ccd2 });
  exitPlank(art, root, course.exit.x - 104, course.exit.y - 112, { width: 96, rotation: -0.2, tint: 0xd8d8d8 });
  for (const sign of course.signs || []) {
    textSign(art, root, sign.x, sign.y, sign.text, { size: sign.size, color: 0xdbe6ff, stroke: 0x1b2a4a });
  }
  motes(art, root, course, 120, { colors: [0xffffff, 0xf2a6c8, 0xbfe2ff], alpha: 0.55, rise: 0.22, size: 2.4, z: -30 });
}

function paintArborHollow(root, course, fg, art) {
  const floor = course.platforms.find((plat) => plat.kind === 'forest-floor').y;
  // Distant firs against the sky at the top of the canopy.
  for (let index = 0; index < 9; index += 1) {
    deco(art, root, index % 2 ? 'heights_coniferous_3' : 'tree_coniferous_1', 60 + index * 190, 820, {
      height: 560 + (index % 3) * 120, tint: 0x2f5a3a, alpha: 0.9, z: -80,
    });
  }
  // Shadowed background trunks and boughs.
  const back = new PIXI.Graphics();
  for (const [x, w] of [[140, 70], [420, 110], [1250, 120], [1500, 80]]) {
    back.beginFill(0x1a2a1c, 0.85);
    back.drawRect(x - w / 2, 600, w, course.height);
  }
  back.endFill();
  back.zIndex = -70;
  root.addChild(back);
  for (let index = 0; index < 16; index += 1) {
    deco(art, root, index % 2 ? 'tree_stack_leafy_1' : 'tree_stack_leafy_2', (index * 433 + 90) % course.width, 900 + index * 150, {
      width: 420 + (index % 3) * 120, tint: 0x2c4a2a, alpha: 0.75, z: -60, flipX: index % 2 === 0,
    });
  }
  // The great trunk, stacked from the forest floor to the nest.
  const trunkWidth = 190;
  const trunkSegment = decoHeightAt('tree_stack_trunk', trunkWidth);
  for (let y = floor + 40; y > course.platforms.find((plat) => plat.id === 'nest').y + 20; y -= trunkSegment * 0.98) {
    deco(art, root, 'tree_stack_trunk', course.trunkX, y, { width: trunkWidth, z: -30, tint: 0x9b7a5c });
  }
  // A second, darker trunk on the drop side.
  for (let y = floor + 40; y > 700; y -= trunkSegment * 0.98) {
    deco(art, root, 'tree_stack_trunk', course.dropX + 180, y, { width: 150, z: -40, tint: 0x5d4a3a });
  }
  // Fir branches: the stub meets the trunk, the foliage top is the walking line.
  const branchNames = ['platform_branch_a01', 'platform_branch_a04', 'platform_branch_a02', 'platform_branch_4'];
  course.platforms.forEach((plat, index) => {
    if (plat.kind === 'branch') {
      const name = branchNames[index % branchNames.length];
      const width = (plat.x2 - plat.x1) * 1.2;
      const height = decoHeightAt(name, width);
      const cx = plat.side === 'left' ? plat.x1 + width / 2 - (plat.x2 - plat.x1) * 0.12 : plat.x2 - width / 2 + (plat.x2 - plat.x1) * 0.12;
      deco(art, root, name, cx, plat.y - height * 0.22, { width, ay: 0, z: -20, flipX: plat.side === 'right' });
    } else if (plat.kind === 'fungus') {
      const name = index % 2 ? 'fungus_oyster_01a_et1' : 'fungus_oyster_01b_et1';
      const width = (plat.x2 - plat.x1) * 1.18;
      const height = decoHeightAt(name, width);
      deco(art, root, name, (plat.x1 + plat.x2) / 2, plat.y - height * 0.22, { width, ay: 0, z: -20 });
    }
  });
  // Decorative fungi on the trunks.
  deco(art, root, 'fungus_oyster_noshadow_01c_et1', course.trunkX + 70, 1900, { width: 110, z: -25 });
  deco(art, root, 'fungus_oyster_noshadow_01d_et1', course.dropX + 120, 2600, { width: 110, z: -35, flipX: true });
  deco(art, root, 'fungus_oyster_noshadow_01c_et1', course.dropX + 110, 1400, { width: 100, z: -35, flipX: true });
  // The nest and its egg on top of the trunk.
  const nest = course.platforms.find((plat) => plat.id === 'nest');
  const nestArt = new PIXI.Graphics();
  const nx = (nest.x1 + nest.x2) / 2;
  nestArt.beginFill(0x5b3a1f);
  nestArt.drawEllipse(nx, nest.y + 18, 104, 34);
  nestArt.endFill();
  for (let twig = 0; twig < 26; twig += 1) {
    const angle = (twig / 26) * Math.PI * 2;
    nestArt.lineStyle(4, twig % 2 ? 0x7a5230 : 0x93683c, 1);
    nestArt.moveTo(nx + Math.cos(angle) * 96, nest.y + 18 + Math.sin(angle) * 26);
    nestArt.lineTo(nx + Math.cos(angle + 0.9) * 112, nest.y + 8 + Math.sin(angle + 0.9) * 34);
  }
  nestArt.lineStyle(0);
  nestArt.zIndex = -18;
  root.addChild(nestArt);
  const egg = new PIXI.Graphics();
  egg.beginFill(0xf3e7c4);
  egg.drawEllipse(nx + 38, nest.y - 16, 30, 38);
  egg.endFill();
  egg.beginFill(0xd9c48f, 0.8);
  for (const [ex, ey, r] of [[28, -30, 4], [46, -12, 3], [34, 2, 3.5], [50, -34, 2.5]]) egg.drawCircle(nx + ex, nest.y + ey, r);
  egg.endFill();
  egg.zIndex = -19;
  root.addChild(egg);
  // Forest floor.
  const ground = new PIXI.Graphics();
  ground.beginFill(0x24331c);
  ground.drawRect(0, floor, course.width, course.height - floor);
  ground.beginFill(0x3b5226);
  ground.drawPolygon([0, floor + 6, 220, floor - 4, 520, floor + 4, 900, floor - 6, 1300, floor + 4, 1600, floor - 2, 1600, floor + 18, 0, floor + 22]);
  ground.endFill();
  ground.zIndex = -9;
  root.addChild(ground);
  deco(art, root, 'mushroom_amanita_1', 560, floor + 4, { height: 128, z: -11 });
  deco(art, root, 'mushroom_amanita_1', 1300, floor + 4, { height: 96, z: -11, flipX: true });
  deco(art, root, 'mountain_flora_01e_al1', 980, floor + 8, { width: 240, tint: 0x4d7a3c, z: -8 });
  deco(art, root, 'door_asset_heights', course.exit.x, course.exit.y + 6, { height: 150, z: -10 });
  const sign = deco(art, root, 'sign_blank_wide_firebog', course.exit.x - 120, course.exit.y + 4, { width: 92, z: -9 });
  sign.alpha = 0.95;
  textSign(art, root, course.exit.x - 120, course.exit.y - 34, 'Exit', { size: 20, color: 0xfff4dc, stroke: 0x4a2c16, z: -8 });
  deco(art, fg, 'mountain_flora_01a_al1', 160, floor + 24, { width: 170, tint: 0x2f5626, z: 53 });
  deco(art, fg, 'mountain_flora_01a_al1', 1080, floor + 24, { width: 150, tint: 0x2f5626, z: 53, flipX: true });
  motes(art, root, course, 40, { color: 0xe8f7b0, alpha: 0.45, rise: 0.08, size: 2, z: -15 });
}

function paintBippityBop(root, course, fg, art) {
  for (let index = 0; index < 18; index += 1) {
    const ray = new PIXI.Graphics();
    const x = index * 270 + 60;
    ray.beginFill(0xffffff, 0.05 + (index % 3) * 0.025);
    ray.drawPolygon([x, 110, x + 60 + (index % 4) * 20, 110, x + 260, 820, x + 150, 820]);
    ray.endFill();
    ray.zIndex = -70;
    ray._phase = index * 0.8;
    root.addChild(ray);
    art.rays.push(ray);
  }
  // Cloud ceiling and the cloud floor.
  rect(root, 0, 0, course.width, 120, 0xcbbbe3, 1, -22);
  cloudBand(art, root, { x1: 0, x2: course.width, y: 92, width: 820, z: -21, tint: 0xd9cbee, flipY: true });
  cloudBand(art, root, { x1: 0, x2: course.width, y: 820, width: 760, z: -8, tint: 0xfbe8dc });
  rect(fg, 0, 860, course.width, 60, 0xf8e3d6, 1, 51);
  cloudBand(art, fg, { x1: 0, x2: course.width, y: 900, width: 700, z: 52, tint: 0xfdeee4, alpha: 0.96 });
  course.platforms.forEach((plat, index) => {
    if (plat.id === 'start-cloud') bounceCloud(art, root, plat, index, { tint: 0xfff2e2 });
  });
  // The exit cloud pillar and its door.
  for (let index = 0; index < 4; index += 1) {
    deco(art, root, 'clouds_bg_middleplus_01b_newxp', course.exit.x - 10 + (index % 2) * 30, course.exit.y + 40 - index * 95, {
      width: 300 - index * 30, ay: 1, z: -12, tint: 0xfff0e2, flipX: index % 2 === 1,
    });
  }
  cloudBand(art, root, { x1: 4280, x2: 4600, y: 730, width: 460, z: -9, tint: 0xfff2e6 });
  deco(art, root, 'door_asset_heights', course.exit.x, course.exit.y + 6, { height: 140, z: -7 });
  exitPlank(art, root, course.exit.x, course.exit.y - 158, { width: 96, rotation: -0.08 });
  for (const sign of course.signs || []) {
    textSign(art, root, sign.x, sign.y, sign.text, { size: sign.size, color: 0xffffff, stroke: 0x8a6ea8 });
  }
  motes(art, root, course, 50, { color: 0xffffff, alpha: 0.4, rise: 0.12, size: 2.6, z: -40 });
}

function paintCloudFlight(root, course, fg, art) {
  for (let index = 0; index < 10; index += 1) {
    deco(art, root, index % 2 ? 'cloud_fluffy_1' : 'cloud_fluffy_2', 200 + index * 420, 260 + (index % 3) * 90, {
      width: 380 + (index % 3) * 90, alpha: 0.4, z: -70,
    });
  }
  const firs = ['heights_coniferous_1', 'heights_coniferous_3', 'heights_coniferous_4', 'tree_coniferous_1'];
  for (let index = 0; index < 22; index += 1) {
    const x = 90 + ((index * 389) % (course.width - 180));
    deco(art, root, firs[index % firs.length], x, 1000, {
      height: 230 + ((index * 53) % 190), z: -32 - (index % 3), alpha: 0.96, flipX: index % 2 === 0,
    });
  }
  cloudBand(art, root, { x1: 0, x2: course.width, y: 975, width: 1000, z: -28, alpha: 0.92, tint: 0xf3f8fb });
  for (let index = 0; index < 7; index += 1) {
    deco(art, fg, firs[index % firs.length], 380 + index * 560, 1045, { height: 170 + (index % 3) * 40, z: 50, flipX: index % 2 === 1 });
  }
  rect(fg, 0, 990, course.width, 20, 0xf5f9fb, 1, 51);
  cloudBand(art, fg, { x1: 0, x2: course.width, y: 1040, width: 900, z: 52, alpha: 0.97 });
  // Start and exit fir branches (scenery: Cloud Flight keeps free flight).
  deco(art, root, 'platform_branch_a04', 170, course.spawn.y - 18, { width: 380, ay: 0, z: -10, flipX: true });
  deco(art, root, 'platform_branch_a02', 3810, course.exit.y - 18, { width: 420, ay: 0, z: -10 });
  deco(art, root, 'door_asset_alakol_door', course.exit.x, course.exit.y + 4, { height: 120, z: -8 });
  textSign(art, root, course.exit.x, course.exit.y - 146, 'EXIT', { size: 22, color: 0xffffff, stroke: 0x4b6e86 });
}

function paintUpdraft(root, course, fg, art) {
  for (let index = 0; index < 14; index += 1) {
    deco(art, root, index % 2 ? 'cloud_fluffy_1' : 'cloud_fluffy_2', 300 + index * 340, 300 + (index % 4) * 140, {
      width: 360 + (index % 3) * 110, alpha: 0.45, z: -70,
    });
  }
  // The mysterious cloud-hole the wind pours out of.
  const hole = new PIXI.Container();
  hole.position.set(course.holeX, course.holeY);
  hole.zIndex = -16;
  const dark = new PIXI.Graphics();
  dark.beginFill(0x203c6e, 0.95);
  dark.drawEllipse(0, 0, 120, 82);
  dark.beginFill(0x10234a, 1);
  dark.drawEllipse(-10, 4, 76, 50);
  dark.endFill();
  hole.addChild(dark);
  const swirl = new PIXI.Graphics();
  for (let arm = 0; arm < 4; arm += 1) {
    swirl.lineStyle(5, 0xdcecff, 0.75);
    const start = (arm / 4) * Math.PI * 2;
    for (let step = 0; step <= 18; step += 1) {
      const angle = start + step * 0.22;
      const radius = 18 + step * 5.2;
      const px = Math.cos(angle) * radius * 1.4;
      const py = Math.sin(angle) * radius;
      if (step === 0) swirl.moveTo(px, py);
      else swirl.lineTo(px, py);
    }
  }
  hole.addChild(swirl);
  hole._swirl = swirl;
  root.addChild(hole);
  art.animated.push(hole);
  for (let index = 0; index < 10; index += 1) {
    const angle = (index / 10) * Math.PI * 2;
    deco(art, root, 'clouds_bg_middleplus_01b_newxp', course.holeX + Math.cos(angle) * 150, course.holeY + Math.sin(angle) * 100 + 40, {
      width: 200, z: -15, rotation: angle * 0.2, flipX: index % 2 === 0,
    });
  }
  for (const zone of course.zones || []) {
    const column = new PIXI.Graphics();
    column.beginFill(0xffffff, 0.08);
    column.drawRoundedRect(zone.x1, 80, zone.x2 - zone.x1, course.height - 160, 60);
    column.endFill();
    column.zIndex = -50;
    root.addChild(column);
    windStreaks(art, root, 10, { x1: zone.x1 + 10, x2: zone.x2 - 10, y1: 120, y2: course.height - 120 }, { vy: -4.5, vertical: true, length: 70, alpha: 0.45 });
  }
  windStreaks(art, root, 46, { x1: 0, x2: course.width, y1: 140, y2: 960 }, { vx: 7, length: 110, alpha: 0.35 });
  course.platforms.forEach((plat, index) => {
    if (plat.id === 'start-cloud') bounceCloud(art, root, plat, index);
  });
  cloudBand(art, root, { x1: 0, x2: course.width, y: 1030, width: 900, z: -8 });
  rect(fg, 0, 1060, course.width, 60, 0xf4f9fb, 1, 51);
  cloudBand(art, fg, { x1: 0, x2: course.width, y: 1100, width: 800, z: 52, alpha: 0.96 });
  cloudBand(art, root, { x1: 4480, x2: 4800, y: 800, width: 440, z: -9 });
  deco(art, root, 'door_asset_heights', course.exit.x, course.exit.y + 6, { height: 140, z: -7 });
  exitPlank(art, root, course.exit.x, course.exit.y - 158, { width: 96 });
}

function paintSkyPlunge(root, course, fg, art) {
  const sun = new PIXI.Graphics();
  sun.beginFill(0xfff6d8, 0.35);
  sun.drawCircle(1120, 260, 170);
  sun.beginFill(0xfff8e4, 0.9);
  sun.drawCircle(1120, 260, 82);
  sun.endFill();
  sun.zIndex = -90;
  root.addChild(sun);
  for (let index = 0; index < 30; index += 1) {
    const front = index % 6 === 0;
    deco(art, front ? fg : root, index % 2 ? 'cloud_fluffy_1' : 'clouds_bg_middleplus_01b_newxp',
      (index * 311 + 80) % course.width, 700 + index * 120, {
        width: front ? 360 : 280 + (index % 4) * 90,
        alpha: front ? 0.55 : 0.75,
        tint: index % 3 ? 0xffffff : 0xfdf1e6,
        z: front ? 54 : -40,
        flipX: index % 2 === 0,
      });
  }
  course.platforms.forEach((plat, index) => {
    if (plat.id === 'start-cloud') {
      cloudBand(art, root, { x1: plat.x1 + 40, x2: plat.x2 - 40, y: plat.y + 40, width: 380, z: -8 });
    } else if (plat.id === 'exit-cloud') {
      cloudBand(art, root, { x1: plat.x1 + 40, x2: plat.x2 - 40, y: plat.y + 40, width: 420, z: -8 });
    }
  });
  cloudBand(art, root, { x1: 0, x2: course.width, y: 4340, width: 760, z: -9 });
  rect(fg, 0, 4340, course.width, 60, 0xfbf3ec, 1, 51);
  cloudBand(art, fg, { x1: 0, x2: course.width, y: 4400, width: 700, z: 52, alpha: 0.96 });
  deco(art, root, 'door_asset_heights', course.exit.x, course.exit.y + 6, { height: 140, z: -7 });
  exitPlank(art, root, course.exit.x, course.exit.y - 158, { width: 96 });
  motes(art, root, course, 50, { color: 0xffffff, alpha: 0.5, rise: -0.1, size: 2.4, z: -35 });
}

function paintDraftyUplift(root, course, fg, art) {
  for (let index = 0; index < 16; index += 1) {
    deco(art, root, index % 2 ? 'cloud_fluffy_1' : 'clouds_bg_middleplus_01b_newxp', (index * 293 + 140) % course.width, 300 + index * 220, {
      width: 300 + (index % 3) * 120, alpha: 0.4, tint: 0xf3e9ff, z: -70, flipX: index % 2 === 1,
    });
  }
  windStreaks(art, root, 60, { x1: 140, x2: course.width - 140, y1: 200, y2: course.height - 150 }, {
    vy: -3.2, vertical: true, length: 90, alpha: 0.3, color: 0xffffff,
  });
  for (const sign of course.signs || []) {
    deco(art, root, 'freeny_cloud_2', sign.x, sign.y + 70, { width: 470, alpha: 0.82, tint: 0xfdf8ff, z: -6 });
    textSign(art, root, sign.x, sign.y, sign.text, { size: sign.size, color: 0x6b57a3, stroke: 0xffffff, z: -5 });
  }
  cloudBand(art, root, { x1: 0, x2: course.width, y: 3740, width: 760, z: -8, tint: 0xf6efff });
  rect(fg, 0, 3760, course.width, 40, 0xf6f0fc, 1, 51);
  cloudBand(art, fg, { x1: 0, x2: course.width, y: 3810, width: 700, z: 52, alpha: 0.96, tint: 0xfbf6ff });
  const exitCloud = course.platforms.find((plat) => plat.id === 'exit-cloud');
  cloudBand(art, root, { x1: exitCloud.x1 + 60, x2: exitCloud.x2 - 60, y: exitCloud.y + 40, width: 480, z: -8, tint: 0xfbf6ff });
  deco(art, root, 'door_asset_heights', course.exit.x, course.exit.y + 6, { height: 140, z: -7 });
  exitPlank(art, root, course.exit.x, course.exit.y - 158, { width: 96 });
}

const PAINTERS = {
  aerial_boost: paintAerialBoost,
  mountain_scaling: paintMountainScaling,
  abysmal_thrill: paintAbysmalThrill,
  arbor_hollow: paintArborHollow,
  bippity_bop: paintBippityBop,
  cloud_flight: paintCloudFlight,
  updraft: paintUpdraft,
  sky_plunge: paintSkyPlunge,
  drafty_uplift: paintDraftyUplift,
};

/** Paint a course scene into the Paradise background root (and foreground). */
export function buildParadiseCourseArt(root, course, { foreground } = {}) {
  const art = makeArt(root, course);
  const painter = PAINTERS[course?.art];
  if (!painter) return art;
  painter(root, course, foreground || root, art);
  return art;
}

// --- per-frame runtime -------------------------------------------------------

function readInput(keys) {
  return {
    left: keys.has('ArrowLeft') || keys.has('a') || keys.has('A'),
    right: keys.has('ArrowRight') || keys.has('d') || keys.has('D'),
    up: keys.has('ArrowUp') || keys.has('w') || keys.has('W'),
    down: keys.has('ArrowDown') || keys.has('s') || keys.has('S'),
    jumpHeld: keys.has(' ') || keys.has('ArrowUp') || keys.has('w') || keys.has('W'),
  };
}

const runtimeState = { respawns: 0, bounces: 0, lastEvent: '', previewHeld: false };

export const paradiseCourseRuntime = {
  /** Whether this course's avatar is stepped here rather than by game.js. */
  owns(course) {
    return usesParadiseBody(course);
  },

  /** After the course is built and the avatar placed at the spawn. */
  enter(host, course) {
    runtimeState.respawns = 0;
    runtimeState.bounces = 0;
    runtimeState.lastEvent = '';
    const player = host.player;
    if (!player || !course) return;
    player.safe = { x: course.spawn.x, y: course.spawn.y };
    player.onGround = usesParadiseBody(course) && course.platforms?.some((plat) =>
      !plat.bounce && Math.abs(plat.y - course.spawn.y) < 1 && course.spawn.x >= plat.x1 && course.spawn.x <= plat.x2
    );
    const preview = host.preview;
    runtimeState.previewHeld = false;
    if (preview === 'exit' || preview === 'mid') {
      const target = preview === 'exit'
        ? { x: course.exit.x - 150, y: course.exit.y }
        : course.pickups[Math.floor(course.pickups.length / 2)];
      player.x = Math.max(40, target.x);
      player.y = preview === 'exit' ? target.y : target.y + 30;
      player.vx = 0;
      player.vy = 0;
      runtimeState.previewHeld = preview === 'exit';
      if (preview === 'exit' && usesParadiseBody(course)) {
        const plat = course.platforms.find((entry) => player.x >= entry.x1 && player.x <= entry.x2 && Math.abs(entry.y - target.y) < 1);
        if (!plat) player.x = course.exit.x - 60;
        player.onGround = true;
      }
    }
  },

  input(host, course) {
    if (!usesParadiseBody(course) || !host.player) return;
    const input = readInput(host.keys);
    // Keep a buffered press for the landing (the shipped 140 ms jump buffer);
    // in water every press is a stroke.
    input.jumpPressed = course.movement === 'swim' || host.player.onGround ? host.consumeJump() : false;
    host.player._paradiseInput = input;
  },

  physics(host, course, dt) {
    const player = host.player;
    if (!usesParadiseBody(course) || !player) return;
    if (runtimeState.previewHeld) {
      player.vx = 0;
      player.vy = 0;
      return;
    }
    const input = player._paradiseInput || {};
    player._paradiseInput = { ...input, jumpPressed: false };
    const { events } = stepParadiseBody(course, player, input, dt);
    for (const event of events) {
      runtimeState.lastEvent = event;
      if (event === 'jump') host.playSfx('jump', { volume: 0.45 });
      else if (event === 'stroke') {
        host.playSfx('jump', { volume: 0.3, rate: 0.72 });
        host.burst(player.x, player.y - 40, 0xcfe9ff, 7);
      } else if (event === 'bounce') {
        runtimeState.bounces += 1;
        host.playSfx('jump', { volume: 0.42, rate: 1.28 });
        host.burst(player.x, player.y, 0xffffff, 10);
        const cloud = host.bgLayer?.paradiseCourseArt?.bouncers?.get(player.lastBounce);
        if (cloud) cloud._squashAt = host.now();
      } else if (event === 'land') host.playSfx('step', { volume: 0.2, rate: 1.1 });
      else if (event === 'respawn') {
        runtimeState.respawns += 1;
        host.toast('Whoops! Back to the last rock.', 1800);
        host.burst(player.x, player.y - 30, 0xffffff, 14);
      }
    }
    const swimming = course.movement === 'swim' || course.movement === 'glide' ||
      course.movement === 'plunge' || course.movement === 'updraft';
    const tilt = swimming ? Math.max(-0.2, Math.min(0.2, player.vx * 0.035 + player.vy * 0.01)) : 0;
    player.rotation += (tilt - player.rotation) * host.dampingAlpha(0.16, dt);
    player.pivot.y = swimming && !player.onGround ? Math.sin(host.time() * 0.12) * 1.5 : 0;
    host.applyPlayerFacing();
    host.setPlayerAnim(Math.abs(player.vx) > 0.35 ? 'walk' : 'idle');
  },

  /** Scenery animation; runs every frame while the course is up. */
  tick(host, course, dt) {
    const art = host.bgLayer?.paradiseCourseArt;
    if (!art || art.course !== course?.id) return;
    const now = host.now();
    const t = host.time();
    for (const dot of art.motes) {
      dot.y -= dot._rise * dt;
      dot.x += Math.sin(t * 0.02 + dot._sway) * 0.15 * dt;
      if (dot.y < -10) dot.y = course.height + 10;
      if (dot.y > course.height + 10) dot.y = -10;
    }
    for (const streak of art.streaks) {
      const area = streak._area;
      streak.x += streak._vx * dt;
      streak.y += streak._vy * dt;
      if (streak.x > area.x2) streak.x = area.x1;
      if (streak.y < area.y1) streak.y = area.y2;
    }
    for (const ray of art.rays) {
      ray.alpha = (ray._baseAlpha ??= ray.alpha) * (0.75 + Math.sin(t * 0.02 + ray._phase) * 0.25);
    }
    for (const thing of art.animated) {
      if (thing._swirl) thing._swirl.rotation = t * 0.03;
    }
    for (const cloud of art.bouncers.values()) {
      if (cloud._baseScaleY == null) continue;
      const age = cloud._squashAt ? now - cloud._squashAt : 9999;
      const squash = age < 260 ? Math.sin((age / 260) * Math.PI) * 0.12 : 0;
      cloud.scale.y = cloud._baseScaleY * (1 - squash);
      cloud.scale.x = cloud._baseScaleX * (1 + squash * 0.5);
    }
  },

  /** Canvas QA attributes for the HUD pass. */
  dataset(host, course) {
    const art = host.bgLayer?.paradiseCourseArt;
    const player = host.player;
    return {
      paradiseCourseArt: art?.course === course.id ? `clean-${course.art.replace(/_/g, '-')}` : '',
      paradiseCourseDecos: String(art?.decos || 0),
      paradiseCourseSigns: String(art?.signs || 0),
      paradiseCourseReference: course.reference || '',
      paradiseMovement: course.movement || 'flight',
      paradiseGrounded: player?.onGround ? '1' : '0',
      paradiseSpeed: Math.abs(player?.vx || 0).toFixed(2),
      paradiseRespawns: String(runtimeState.respawns),
      paradiseBounces: String(runtimeState.bounces),
      paradiseLastEvent: runtimeState.lastEvent,
    };
  },
};
