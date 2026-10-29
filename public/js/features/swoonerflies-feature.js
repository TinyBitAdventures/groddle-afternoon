/**
 * World Swoonerflies (register G121): the three archived street Swoonerflies
 * (Parsin's Trail SW, Tower St West, Pandhal Pegs; street-ecology.json
 * `swoonerflies`) sit where the street planner puts them, looping their
 * 'fly-rooked' state. Rules and source lines live in js/swoonerflies.js:
 * onCreate sets 'fly-rooked', nothing in GSJS but Gwendolyn's squid makes
 * one fall, and the item has no verbs and is not selectable, so this draws a
 * sprite and registers no target.
 *
 * QA: ?autostart=1&fresh=1&resetgame=1&questoffer=off&streetdemo=GA51450HIC42Q4I
 * (or GIF5UU8FO3029OK, GUVNIF7Q9KR2382); &swoonerflydemo=1 also stands one
 * 160 px right of the player on any street; &swoonerflygo=1 stands the
 * player beside the first one. Canvas data: swoonerflies (how
 * many are drawn), swoonerflyAt (x,y of the first).
 */

import { createSheetLoader, pixiSpeed } from '../sprite-sheets.js?v=g446-1';
import { loadWildlifeCatalog, wildlifeCatalog } from '../wildlife.js';
import {
  SWOONERFLY_CLASS,
  SWOONERFLY_PLACEMENT_KEY,
  SWOONERFLY_SHEET,
  swoonerflyPlacementGroups,
  swoonerfliesFor,
} from '../swoonerflies.js?v=g369-1';
import { itemZ } from '../item-bands.js?v=g429-1';

export const SWOONERFLIES_FEATURE_ID = 'swoonerflies';

let loader = null;
let generation = 0;
let sprites = [];
let demoUsed = false;

function spawn(engine, point) {
  const { PIXI } = engine;
  const frames = loader.frames(SWOONERFLY_SHEET);
  const spr = new PIXI.AnimatedSprite(frames.length ? frames : [PIXI.Texture.EMPTY]);
  spr.anchor.set(0.5, 1);
  spr.x = point.x;
  spr.y = point.y;
  // npc_swoonerfly sets neither flag (items/npc_swoonerfly.js itemDef): a normal item.
  spr.zIndex = itemZ(SWOONERFLY_CLASS, 10);
  spr.eventMode = 'none';
  spr.loop = true;
  spr.animationSpeed = pixiSpeed(SWOONERFLY_SHEET.fps);
  // Each one starts at its own frame, so two on one street do not flap in step.
  spr.gotoAndPlay((sprites.length * 5) % SWOONERFLY_SHEET.frames);
  engine.entityLayer.addChild(spr);
  sprites.push(spr);
  return spr;
}

function publish(engine) {
  const live = sprites.filter((s) => !s.destroyed);
  engine.setData('swoonerflies', String(live.length));
  engine.setData('swoonerflyAt', live[0] ? `${Math.round(live[0].x)},${Math.round(live[0].y)}` : '');
}

export const swoonerfliesFeature = {
  id: SWOONERFLIES_FEATURE_ID,

  init(engine) {
    loader = createSheetLoader(engine.PIXI);
    loadWildlifeCatalog();
    publish(engine);
  },

  placementGroups(population, street) {
    const catalog = wildlifeCatalog();
    if (!catalog || !street?.tsid) return [];
    return swoonerflyPlacementGroups(swoonerfliesFor(catalog, street.tsid));
  },

  onStreetEnter(street, engine) {
    generation += 1;
    const mine = generation;
    sprites = [];
    if (engine.transientInstance?.()) {
      publish(engine);
      return;
    }
    loadWildlifeCatalog().then((catalog) => {
      if (mine !== generation) return null;
      const count = swoonerfliesFor(catalog, engine.streetTsid);
      const demo = engine.param('swoonerflydemo') === '1' && !demoUsed;
      if (!count && !demo) {
        publish(engine);
        return null;
      }
      // A sheet that fails to load still places them (an empty texture), as a missing file would.
      return Promise.resolve().then(() => loader.load(SWOONERFLY_SHEET)).catch(() => null).then(() => {
        if (mine !== generation) return;
        const points = engine.placement(SWOONERFLY_PLACEMENT_KEY);
        for (let i = 0; i < count; i += 1) if (points[i]) spawn(engine, points[i]);
        if (demo && engine.player) {
          demoUsed = true;
          spawn(engine, { x: engine.player.x + 160, y: engine.player.y });
        }
        // QA: &swoonerflygo=1 stands the player on the first one's platform, 140 px left of it.
        const first = sprites[0];
        if (first && engine.player && engine.param('swoonerflygo') === '1') {
          engine.player.x = first.x - 140;
          engine.player.y = first.y - 4;
          engine.player.vx = 0;
          engine.player.vy = 0;
          engine.snapCamera?.();
        }
        publish(engine);
      });
    });
  },

  /** Street clear destroys the entity layer; only drop references (feature-host onStreetClear). */
  onStreetClear() {
    generation += 1;
    sprites = [];
  },

  /** QA / tests. */
  _state() {
    return { count: sprites.filter((s) => !s.destroyed).length, at: sprites.map((s) => ({ x: s.x, y: s.y, playing: s.playing })) };
  },
};
