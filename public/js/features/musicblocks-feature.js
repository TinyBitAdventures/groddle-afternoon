/**
 * Musicblocks in the world (see js/feature-host.js): collection badges from every source, the start
 * street's block and the GNG gift.
 *
 * - Badges: the collection_musicblocks_* trophies count `in_inventory` per block
 *   (GSJS achievements/collection_musicblocks_*.js). Blocks arrive in the pack from drop tables
 *   (Chicken squeezes, croppery, herbalism, tree petting and watering, refining, barnacles,
 *   jellisacs, peat), the soil (musicblocks_brown), the Spinning Wheel, quests, Gentle Island and
 *   the ground. This feature watches the pack once a second and emits `in_inventory:<block>` the
 *   first time a block shows up, so a series badge unlocks the moment its fifth tune lands.
 *   Counting an already-owned block again is harmless (each condition needs 1). A block that
 *   leaves the pack stays counted: the remake's own rule (Glitch wanted all five held at once),
 *   kept by Austin 2026-11-18 (G1001; invention collection-count-on-arrival).
 * - The start street's block (G938, locations/location.js 646-667): a player who owns no block
 *   and has none lying on a start street finds one of
 *   the twenty D and X blocks there a second after arriving (createItemStackDelayed(..., 1)),
 *   lying on the ground a short walk from where they arrived (startStreetSpot). It goes into the
 *   player's own dropped stacks
 *   (engine.dropWorldStack), so online it is theirs alone, as the greeting location's private
 *   instance made it. Once a save, on whichever start street comes first. The start streets: the
 *   one a new player is set down on when leaving the tutorial (newxp-feature's newxpExitStreet;
 *   Glitch's greeting locations were where a new player first arrived after it), and Hechey Track
 *   (the street index default, where a skipped tutorial and a lost exit land).
 * - The GNG gift (desk FUNPICKLE, js/musicblocks.js endgameGiftDue): all 25 series tunes owned
 *   sends Musicblock GNG once, the way giveAward sends it.
 *
 * QA: ?autostart=1&fresh=1&resetgame=1&questoffer=off&musicblockdemo=start takes every block out
 * of the pack (the solo kit holds DG-2) so Hechey Track lays one down; &musicblockdemo=gift puts
 * the 25 series tunes in the pack. Canvas data: musicblockStart (the class laid down, or none),
 * musicblockGift (given or none).
 */

import { addItem, countItem, removeItem } from '../inventory.js?v=3be7988a';
import { STREET_INDEX } from '../street-loader.js?v=10376267';
import {
  MUSICBLOCK_CATALOG,
  MUSICBLOCK_ENDGAME_GIFT,
  MUSICBLOCK_ENDGAME_GIFT_LINE,
  START_STREET_DELAY_MS,
  chooseStartStreetMusicblock,
  endgameGiftDue,
  startStreetMusicblockDue,
} from '../musicblocks.js?v=900c3245';
import { groundStacks } from '../ground-stacks.js?v=22792362';

const SYNC_MS = 1_000;
const BLOCK_IDS = Object.keys(MUSICBLOCK_CATALOG);
/**
 * config_prod.js greeting_locations, Alakol Start 1-4 (the first live entries): players arrive at
 * x -1378, y -195 and the block lies at musicblock_position -1085, -177, 293 px along at the same
 * height. Hechey Track has no musicblock_position, so the block lies as far from the arrival.
 */
export const START_BLOCK_OFFSET = 293;

let owned = null;
let nextSyncAt = 0;
let rng = Math.random;
let startTimer = null;
let demoDone = false;
/** Saved: startBlock { tsid, classTsid } once the start street's block was laid down; gift once GNG was sent or owned. */
let st = { startBlock: null, gift: false };

/** Block ids whose count went from 0 to at least 1 since the last look. */
export function newlyOwnedMusicblocks(before, inv) {
  const out = [];
  for (const id of BLOCK_IDS) {
    if ((Number(inv?.[id]) || 0) > 0 && !before.has(id)) out.push(id);
  }
  return out;
}

export function normalizeMusicblocksSlice(slice) {
  const b = slice?.startBlock;
  const startBlock = b && typeof b.tsid === 'string' && MUSICBLOCK_CATALOG[b.classTsid] ? { tsid: b.tsid, classTsid: b.classTsid } : null;
  return { startBlock, gift: slice?.gift === true };
}

/** The remake's start street: where a skipped tutorial and a lost exit land (street index default). */
export function startStreetTsid() {
  return STREET_INDEX.default;
}

/** Every start street for this player: Hechey Track, and the street the tutorial left them on. */
export function startStreets(engine) {
  const exit = engine?.query?.('newxpExitStreet', engine);
  return [startStreetTsid(), ...(typeof exit === 'string' && exit ? [exit] : [])];
}

/** The avatar stands (a tutorial exit drops the player in from above). */
const LAND_RETRY_MS = 250;
const LAND_WAIT_MS = 6000;

function publish(engine) {
  engine.setData?.('musicblockStart', st.startBlock?.classTsid || 'none');
  engine.setData?.('musicblockGift', st.gift ? 'given' : 'none');
}

function startDue(engine, tsid) {
  return startStreetMusicblockDue({
    made: Boolean(st.startBlock),
    onStartStreet: Boolean(tsid) && startStreets(engine).includes(tsid) && engine.streetTsid === tsid,
    inv: engine.inv,
    stacks: groundStacks(engine, engine.dropTsid),
  });
}

/**
 * Where the block lies: START_BLOCK_OFFSET from the player's feet toward the middle of the street,
 * dropped from a little above so it comes to rest on the line under it (engine.dropWorldStack).
 */
export function startStreetSpot(player, worldW) {
  const px = Number(player?.x) || 0;
  const w = Math.max(0, Number(worldW) || 0);
  const toward = w && px > w / 2 ? -1 : 1;
  const x = w ? Math.max(60, Math.min(w - 60, px + toward * START_BLOCK_OFFSET)) : px + START_BLOCK_OFFSET;
  return { x, y: (Number(player?.y) || 0) - 40 };
}

/** location.js 663-665: choose_one of the twenty, a ground stack near the arrival. */
export function layStartStreetMusicblock(engine, tsid) {
  if (!startDue(engine, tsid)) return null;
  const classTsid = chooseStartStreetMusicblock(rng);
  const { x, y } = startStreetSpot(engine.player, engine.worldW);
  const res = engine.dropWorldStack?.(classTsid, 1, x, y);
  if (!res?.ok) return null;
  st.startBlock = { tsid, classTsid };
  engine.save?.();
  publish(engine);
  return classTsid;
}

/** giveAward 372-378: the activity line, then the block into the pack. */
export function sendEndgameGift(engine) {
  if (countItem(engine.inv, MUSICBLOCK_ENDGAME_GIFT) > 0) st.gift = true;
  if (!endgameGiftDue(engine.inv, st.gift)) return false;
  st.gift = true;
  engine.pushActivity?.(MUSICBLOCK_ENDGAME_GIFT_LINE);
  engine.toast?.(MUSICBLOCK_ENDGAME_GIFT_LINE, 6000);
  addItem(engine.inv, MUSICBLOCK_ENDGAME_GIFT, 1);
  engine.refreshPack?.();
  engine.save?.();
  publish(engine);
  return true;
}

function setupDemo(engine) {
  const demo = engine.param?.('musicblockdemo');
  if (demoDone || !demo || !engine.inv) return;
  demoDone = true;
  if (demo === 'start') {
    for (const id of BLOCK_IDS) removeItem(engine.inv, id, countItem(engine.inv, id));
    st.startBlock = null;
  } else if (demo === 'gift') {
    for (const def of Object.values(MUSICBLOCK_CATALOG)) if (def.collection && countItem(engine.inv, def.classTsid) < 1) addItem(engine.inv, def.classTsid, 1);
    removeItem(engine.inv, MUSICBLOCK_ENDGAME_GIFT, countItem(engine.inv, MUSICBLOCK_ENDGAME_GIFT));
    st.gift = false;
  }
  engine.refreshPack?.();
}

export const musicblocksFeature = {
  id: 'musicblocks',

  onStreetEnter(street, engine) {
    setupDemo(engine);
    clearTimeout(startTimer);
    startTimer = null;
    const tsid = street?.tsid || engine.streetTsid;
    if (startDue(engine, tsid)) {
      const since = Date.now();
      const lay = () => {
        startTimer = null;
        // Dropped in from above at a tutorial exit: wait until the avatar is down, so the block
        // lies on the ground beside them, not on whatever line is under them mid-fall.
        if (engine.player && engine.player.onGround === false && Date.now() - since < LAND_WAIT_MS) {
          startTimer = setTimeout(lay, LAND_RETRY_MS);
          return;
        }
        layStartStreetMusicblock(engine, tsid);
      };
      startTimer = setTimeout(lay, START_STREET_DELAY_MS);
    }
    publish(engine);
  },

  onStreetClear() {
    clearTimeout(startTimer);
    startTimer = null;
  },

  onTick(dtMs, now, engine) {
    if (now < nextSyncAt || !engine.inv) return;
    nextSyncAt = now + SYNC_MS;
    if (!owned) {
      // game.js already counts the blocks owned at boot.
      owned = new Set(BLOCK_IDS.filter((id) => (Number(engine.inv[id]) || 0) > 0));
    } else {
      for (const id of newlyOwnedMusicblocks(owned, engine.inv)) {
        owned.add(id);
        engine.achievement(`in_inventory:${id}`, 1);
      }
      for (const id of owned) if (!((Number(engine.inv[id]) || 0) > 0)) owned.delete(id);
    }
    sendEndgameGift(engine);
  },

  save() {
    return { startBlock: st.startBlock, gift: st.gift };
  },

  restore(slice) {
    st = normalizeMusicblocksSlice(slice);
  },

  /** Tests. */
  _reset() {
    owned = null;
    nextSyncAt = 0;
    rng = Math.random;
    clearTimeout(startTimer);
    startTimer = null;
    demoDone = false;
    st = { startBlock: null, gift: false };
  },
  _setRng(fn) {
    rng = fn;
  },
};
