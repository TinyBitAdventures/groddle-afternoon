/**
 * The Eleven Secret Locations (js/secret-spots.js) against the GSJS source
 * (players/inc_eleven_secrets.js, config_prod.js secret_spots,
 * location.js handleElevenSecrets) and the imported street boxes. The Tower
 * Secrets belong to the home Tower lane (tests/home-tower.test.js).
 * Run: node --test tests/secret-spots.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ELEVEN_CHOOSE,
  ELEVEN_GROUP,
  ELEVEN_START_LEVEL,
  ELEVEN_TOTAL,
  MARKER_BLOBS,
  SECRET_BODY,
  SECRET_GIANTS,
  SECRET_GIANT_GROWLS,
  SECRET_GIANT_MESSAGES,
  SECRET_INTRO,
  SECRET_SOUNDS,
  SECRET_SPOTS,
  SECRET_TIMING,
  announcementPages,
  blobPose,
  bodyHitsBox,
  createSecretState,
  giantForCount,
  growlText,
  isSecretBoxId,
  normalizeSecretState,
  pendingSpots,
  pendingSpotsOn,
  progressText,
  secretCounter,
  secretReward,
  spotBox,
  startSecretHunt,
  streetKeyFor,
  triggerSecretSpot,
} from '../public/js/secret-spots.js?v=0127532b';
import { loadContentCatalogsFromDir } from '../public/js/content-catalogs.js?v=10b118dd';
import { applyAchievementProgress, createAchievementState } from '../public/js/achievements.js?v=631d7daa';
import { SOUND_CATEGORIES } from '../public/js/sound-keys.js?v=2d82d399';
import { SYNTH_RECIPES, recipeForKey } from '../public/js/synth-sfx.js?v=9853c8e7';

const here = dirname(fileURLToPath(import.meta.url));
const publicRoot = join(here, '../public');
const GSJS = join(process.env.HOME || '', 'Documents/glitch-audit/glitch-GameServerJS');
const streetCache = new Map();
function street(key) {
  if (!streetCache.has(key)) {
    const file = join(publicRoot, 'assets/streets', `${key}.json`);
    streetCache.set(key, existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null);
  }
  return streetCache.get(key);
}

/** A seeded rng so selections are repeatable. */
function rngFrom(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function screenPlatforms(st) {
  const { l, t } = st.bounds;
  return st.platforms.filter((p) => p.pc_perm !== 1).map((p) => {
    const a = { x: p.x1 - l, y: p.y1 - t };
    const b = { x: p.x2 - l, y: p.y2 - t };
    return a.x <= b.x ? { x1: a.x, y1: a.y, x2: b.x, y2: b.y } : { x1: b.x, y1: b.y, x2: a.x, y2: a.y };
  });
}

describe('secret spots data', () => {
  it('has the 100 config_prod.js spots, ids unique, matching the source', () => {
    assert.equal(SECRET_SPOTS.length, 100);
    assert.equal(new Set(SECRET_SPOTS.map((s) => s.id)).size, 100);
    assert.ok(SECRET_SPOTS.every((s) => isSecretBoxId(s.id)));
    const cfgFile = join(GSJS, 'config_prod.js');
    if (!existsSync(cfgFile)) return;
    const cfg = readFileSync(cfgFile, 'latin1');
    const blk = cfg.slice(cfg.indexOf('var secret_spots'), cfg.indexOf('];', cfg.indexOf('var secret_spots')));
    const src = [...blk.matchAll(/id:\s*'([^']+)',\s*tsid:\s*'([^']+)',\s*x:\s*(-?\d+),\s*y:\s*(-?\d+)/g)]
      .map((m) => ({ id: m[1], tsid: m[2], x: Number(m[3]), y: Number(m[4]) }));
    assert.deepEqual(SECRET_SPOTS.map((s) => ({ ...s })), src);
  });

  it('maps every configured spot to an imported street box at the same place', () => {
    for (const spot of SECRET_SPOTS) {
      const st = street(streetKeyFor(spot.tsid));
      assert.ok(st, `${spot.id}: street ${streetKeyFor(spot.tsid)} imported`);
      const raw = (st.boxes || []).find((b) => b.id === spot.id);
      assert.ok(raw, `${spot.id}: hitbox on ${st.label}`);
      const box = spotBox(st, spot);
      const cx = spot.x - st.bounds.l;
      const cy = spot.y - st.bounds.t;
      // Two hitboxes were nudged after the config was written (groddleforest_01, chakraphool_04).
      assert.ok(Math.abs(box.x - cx) <= 40 && Math.abs(box.y - cy) <= 40, `${spot.id} box ${box.x},${box.y} vs config ${cx},${cy}`);
    }
  });

  it('every spot can be walked into: a floor under the box puts the avatar body inside it', () => {
    for (const spot of SECRET_SPOTS) {
      const st = street(streetKeyFor(spot.tsid));
      const box = spotBox(st, spot);
      const plats = screenPlatforms(st);
      let ok = false;
      for (let dx = -box.w / 2; dx <= box.w / 2 && !ok; dx += 10) {
        const x = box.x + dx;
        for (const p of plats) {
          if (x < p.x1 || x > p.x2) continue;
          const y = p.x2 === p.x1 ? p.y1 : p.y1 + ((x - p.x1) / (p.x2 - p.x1)) * (p.y2 - p.y1);
          if (bodyHitsBox(box, x, y)) { ok = true; break; }
        }
      }
      assert.ok(ok, `${spot.id} on ${st.label}: no standable floor overlaps the box`);
    }
  });

  it('body overlap uses the avatar body, not a point', () => {
    const box = { x: 500, y: 400, w: 80, h: 100 };
    assert.equal(bodyHitsBox(box, 500, 425), true, 'standing 25 px under a floating box');
    assert.equal(bodyHitsBox(box, 500 + 40 + SECRET_BODY.w / 2 + 1, 400), false);
    assert.equal(bodyHitsBox(box, 500, 400 + SECRET_BODY.h + 1), false);
    assert.equal(bodyHitsBox(box, 500, 290), false, 'feet above the box top');
  });
});

describe('the hunt', () => {
  it('starts at level 5, never with the badge, and only once', () => {
    const s = createSecretState();
    assert.equal(startSecretHunt(s, { level: ELEVEN_START_LEVEL - 1 }), false);
    assert.equal(s.started, false);
    assert.equal(startSecretHunt(s, { level: 5, rng: rngFrom(3) }), true);
    const first = s.spots.slice();
    assert.equal(startSecretHunt(s, { level: 9, rng: rngFrom(4) }), false);
    assert.deepEqual(s.spots, first);
    const held = createSecretState();
    assert.equal(startSecretHunt(held, { level: 20, hasBadge: true }), false);
    assert.equal(held.done, true);
    assert.deepEqual(pendingSpots(held), []);
  });

  it('chooses 20 distinct spots of the 100, and any spot can be chosen', () => {
    const seen = new Set();
    for (let seed = 1; seed <= 400; seed += 1) {
      const s = createSecretState();
      startSecretHunt(s, { level: 5, rng: rngFrom(seed) });
      assert.equal(s.spots.length, ELEVEN_CHOOSE);
      assert.equal(new Set(s.spots).size, ELEVEN_CHOOSE);
      for (const id of s.spots) seen.add(id);
    }
    assert.equal(seen.size, 100);
  });

  it('shuffles the ten Giants and keeps Lem for the eleventh', () => {
    const s = createSecretState();
    startSecretHunt(s, { level: 5, rng: rngFrom(7) });
    assert.deepEqual([...s.giants].sort(), [...SECRET_GIANTS].sort());
    assert.ok(!s.giants.includes('lem'));
    for (let n = 1; n <= 10; n += 1) assert.equal(giantForCount(s, n), s.giants[n - 1]);
    assert.equal(giantForCount(s, 11), 'lem');
  });

  it('finds spots only on their own street, in Giant order, done on the eleventh', () => {
    const s = createSecretState();
    startSecretHunt(s, { level: 5, rng: rngFrom(21) });
    const giants = [];
    const chosen = s.spots.map((id) => SECRET_SPOTS.find((x) => x.id === id));
    assert.equal(triggerSecretSpot(s, chosen[0].id, 'GXXXXXXXXXXXXXX'), null, 'wrong street');
    assert.equal(triggerSecretSpot(s, 'key_drop', streetKeyFor(chosen[0].tsid)), null, 'not a secret box');
    const outside = SECRET_SPOTS.find((x) => !s.spots.includes(x.id));
    assert.equal(triggerSecretSpot(s, outside.id, streetKeyFor(outside.tsid)), null, 'not one of mine');
    for (let i = 0; i < ELEVEN_TOTAL; i += 1) {
      const sp = chosen[i];
      assert.equal(pendingSpotsOn(s, streetKeyFor(sp.tsid)).some((x) => x.id === sp.id), true);
      const hit = triggerSecretSpot(s, sp.id, streetKeyFor(sp.tsid));
      assert.equal(hit.count, i + 1);
      giants.push(hit.giant);
      assert.equal(triggerSecretSpot(s, sp.id, streetKeyFor(sp.tsid)), null, 'a found spot is removed');
    }
    assert.deepEqual(giants.slice(0, 10), s.giants);
    assert.equal(giants[10], 'lem');
    assert.equal(s.done, true);
    assert.deepEqual(pendingSpots(s), [], 'the remaining nine markers are cleared');
  });

  it('awards the badge at the eleventh distinct counter, not before', async () => {
    await loadContentCatalogsFromDir(join(publicRoot, 'assets/content'));
    const ach = createAchievementState();
    const ids = SECRET_SPOTS.slice(0, 11).map((s) => s.id);
    for (let i = 0; i < 10; i += 1) {
      const ups = applyAchievementProgress(ach, secretCounter(ids[i]), 1);
      assert.ok(!ups.some((u) => u.unlocked && u.classTsid === 'eleven_secret_locations'));
    }
    // the same spot again does not count twice
    applyAchievementProgress(ach, secretCounter(ids[0]), 1);
    assert.ok(!ach.unlocked.includes('eleven_secret_locations'));
    const ups = applyAchievementProgress(ach, secretCounter(ids[10]), 1);
    assert.ok(ups.some((u) => u.unlocked && u.classTsid === 'eleven_secret_locations'));
    assert.equal(secretCounter('11spots_aranna_01'), `${ELEVEN_GROUP}:11spots_aranna_01`);
  });

  it('normalizes saves: unknown ids out, found kept to chosen, bad giants restart', () => {
    assert.deepEqual(normalizeSecretState(null), createSecretState());
    const s = createSecretState();
    startSecretHunt(s, { level: 5, rng: rngFrom(5) });
    s.found = [s.spots[0], 'bogus', SECRET_SPOTS.find((x) => !s.spots.includes(x.id)).id];
    const n = normalizeSecretState(JSON.parse(JSON.stringify(s)));
    assert.equal(n.started, true);
    assert.deepEqual(n.found, [s.spots[0]]);
    assert.equal(normalizeSecretState({ ...s, giants: ['alph'] }).started, false);
    assert.equal(normalizeSecretState({ ...s, done: true }).done, true);
  });
});

describe('copy and rewards', () => {
  it('uses the source text', () => {
    assert.equal(progressText(4), 'You stumbled on another unique cluster of genetic dust, triggering a DNA deja vu... (4/11)');
    assert.deepEqual(announcementPages(1, 'alph'), SECRET_INTRO);
    assert.equal(SECRET_INTRO.length, 5);
    assert.equal(SECRET_INTRO[0], 'Woah! Did you feel that? That was a DNA deja vu...');
    assert.deepEqual(announcementPages(3, 'mab', 1), [progressText(3), SECRET_GIANT_MESSAGES.mab[1]]);
    assert.equal(SECRET_GIANT_MESSAGES.alph[0], '*YOWCH!*\nWha…? What was that? Some kind of shock?');
    for (const g of [...SECRET_GIANTS, 'lem']) {
      assert.equal(SECRET_GIANT_MESSAGES[g].length, 3, g);
      assert.equal(SECRET_GIANT_GROWLS[g].length, 3, g);
    }
  });

  it('pays 50 favor + 100 iMG, Tii through `ti`, and Lem 100 favor with no iMG', () => {
    assert.deepEqual(secretReward('alph', 2), { favorGiant: 'alph', favor: 50, xp: 100 });
    assert.deepEqual(secretReward('tii', 5), { favorGiant: 'ti', favor: 50, xp: 100 });
    assert.deepEqual(secretReward('lem', 11), { favorGiant: 'lem', favor: 100, xp: 0 });
    assert.equal(growlText('tii', 0, { favor: 50, xp: 100 }), `${SECRET_GIANT_GROWLS.tii[0]} You gain 50 favor with Tii. You gain 100 iMG.`);
    assert.equal(growlText('lem', 2, { favor: 100 }), `${SECRET_GIANT_GROWLS.lem[2]} You gain 100 favor with Lem.`);
  });

  it('keeps the source timers and catalogued, audible sounds', () => {
    assert.deepEqual({ ...SECRET_TIMING }, { markerCancel: 600, rainbowDelay: 600, rainbow: 4000, announce: 3500, increment: 1000 });
    for (const key of Object.values(SECRET_SOUNDS)) {
      assert.ok(SOUND_CATEGORIES[key], `${key} catalogued`);
      assert.ok(SYNTH_RECIPES[recipeForKey(key, SOUND_CATEGORIES[key])], `${key} audible`);
    }
  });

  it('marker blobs rise from the base to the top of the 100 px column and fade at both ends', () => {
    assert.equal(MARKER_BLOBS.length, 16);
    for (const b of MARKER_BLOBS) {
      const born = blobPose(b, b.born);
      assert.ok(born.y > 39 && born.alpha < 0.01);
      const mid = blobPose(b, b.born + 45);
      assert.ok(Math.abs(mid.y) < 1 && mid.alpha > 0.99);
      const end = blobPose(b, b.born + 89);
      assert.ok(end.y < -38 && end.alpha < 0.03);
    }
  });
});
