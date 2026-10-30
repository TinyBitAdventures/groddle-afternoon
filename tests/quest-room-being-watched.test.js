/**
 * Being Watched (public/js/quest-rooms/being-watched.js): source constants
 * from quests/stale_but_necessary.js, the dark room after Arthur DentUre's
 * snap (Flickr 8270858639, reference only), its reach, and the veil flow on a
 * stub room context.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

import * as kit from '../public/js/quest-rooms/kit.js?v=g458-1';
import { JUMP_RISE, JUMP_GAP } from '../public/js/quest-rooms/puzzle-kit.js';
import {
  DAIS,
  DRINK_TEXT,
  FLAGS,
  FLOOR,
  MONITORS,
  NAP_MS,
  QUEST,
  SPAWN,
  TV,
  VEIL_TALK,
  VEIL_X,
  W,
  WATCH_RANGE,
  canPeek,
  facing,
  napPlatforms,
  room,
  watching,
} from '../public/js/quest-rooms/being-watched.js?v=g457-3';
import { QUEST_ROOMS } from '../public/js/quest-rooms/catalog.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const GSJS = join(homedir(), 'Documents/glitch-audit/glitch-GameServerJS');
const BAND = 160;

describe('Being Watched (stale_but_necessary) source', () => {
  it('keeps the quest, timer and flags', () => {
    assert.equal(QUEST_ROOMS[QUEST], room.id);
    assert.equal(room.id, 'being_watched');
    assert.equal(NAP_MS, 300_000);
    assert.equal(room.durationMs, NAP_MS);
    assert.deepEqual(FLAGS, { peek: 'convo_end', leave: 'leave' });
    const quests = JSON.parse(readFileSync(join(root, 'public/assets/content/quests.json'), 'utf8'));
    const def = (quests.quests || quests)[QUEST];
    assert.deepEqual(def.requirements.map((r) => r.name).sort(), ['convo_end', 'leave']);
    assert.deepEqual(def.rewards, { xp: 750, energy: 100, mood: 100 });
    assert.equal(def.acceptLabel, 'Take nap');
    const file = join(GSJS, 'quests/stale_but_necessary.js');
    if (!existsSync(file)) return;
    const src = readFileSync(file, 'utf8');
    assert.match(src, /questInstanceLocation\(pc, location_id, marker\.x, marker\.y, 5\*60\)/);
    assert.match(src, /"prod_tsid"\s*:\s*"LIFHAO6QB4A34MO"/);
    assert.match(src, /this\.set_flag\(pc, 'leave'\);\s*if \(!this\.is_complete\)\{\s*pc\.failQuest/);
    assert.match(readFileSync(join(GSJS, 'items/cup_of_water.js'), 'utf8'), new RegExp(DRINK_TEXT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });

  it('ships its icon and the recovered art it draws', () => {
    assert.ok(existsSync(join(root, 'public', room.icon)), room.icon);
    for (const deco of ['bureaucratic_hall_tv_1', 'light_spot', 'groddle_light_pool']) {
      assert.ok(existsSync(join(root, 'public/assets/decos/groddle', `${deco}.webp`)), deco);
    }
    const art = readFileSync(join(root, 'public/js/quest-rooms/being-watched.js'), 'utf8');
    for (const m of art.matchAll(/`\$\{LEGALIZE\}([^`]+)`/g)) {
      assert.ok(existsSync(join(root, 'public/assets/sprites/quests/legalize', m[1])), m[1]);
    }
  });
});

describe('Being Watched, dark as the snap shows it', () => {
  const src = readFileSync(join(root, 'public/js/quest-rooms/being-watched.js'), 'utf8');

  it('hangs the Bureaucratic Hall TV from the ceiling, as in the snap, at its own proportions', () => {
    // The snap's set has its pale screen lit: Tiny Speck's animated set, playing its own strip.
    assert.equal(TV.sprite, 'bureaucratic_hall_tv_1_animated');
    const strip = JSON.parse(readFileSync(join(root, 'public/assets/decos/animated', `${TV.sprite}.json`), 'utf8'));
    assert.deepEqual(strip.size, [TV.w, TV.h]);
    assert.equal(strip.frames, 17);
    assert.doesNotMatch(src, /kit\.deco\(PIXI, 'light_spot', -6/, 'no stand-in glow: the set glows itself');
    // The booth's monitors stay the hanging set (bureaucratic_hall_tv_1).
    assert.match(src, /kit\.deco\(PIXI, 'bureaucratic_hall_tv_1', VEIL_X/);
    assert.ok(MONITORS.length >= 3);
    for (const m of MONITORS) {
      assert.ok(m.x > SPAWN.x && m.x < DAIS.x1, `set at ${m.x} hangs over the walk`);
      // The snap: the set's foot well above the avatar's head, the whole set in the top of the view.
      assert.ok(FLOOR - m.y >= 150 && FLOOR - m.y <= 240, `set foot ${FLOOR - m.y} above the floor`);
    }
    // The first set hangs ahead of where you wake, clear of the room card (upper right in the snap).
    assert.ok(MONITORS[0].x - SPAWN.x > 600 && MONITORS[0].x - SPAWN.x < 800);
  });

  it('is black with no beige dream: no clouds, no wall eyes, the avatar keeps its colours', () => {
    assert.match(src, /'#020203'/);
    assert.doesNotMatch(src, /cloud_fluffy|block_cloud01|desaturate|setPlain|0xead6a8/);
  });

  it('each set turns to face you and counts as watching only then', () => {
    const m = MONITORS[1];
    assert.equal(facing(m, m.x - 200), 1);
    assert.equal(facing(m, m.x + 200), -1);
    assert.equal(facing(m, m.x + 4, -1), -1, 'no flapping right under the set');
    assert.equal(watching(m, m.x - 200), true);
    assert.equal(watching(m, m.x + 200), true);
    assert.equal(watching(m, m.x + 200, 1), false, 'facing away');
    assert.equal(watching(m, m.x - WATCH_RANGE - 50), false, 'too far');
  });
});

describe('Being Watched geometry', () => {
  const plats = napPlatforms(kit);
  const floor = plats.find((p) => p.id === 'bw_floor');

  it('is the floor and the dais, one ordinary jump up', () => {
    assert.equal(floor.x1, 0);
    assert.equal(floor.x2, W);
    assert.deepEqual(plats.map((p) => p.id), ['bw_floor', 'bw_dais']);
    for (const p of plats.filter((q) => q !== floor)) {
      const below = plats.filter((q) => q !== p && q.y1 > p.y1 && q.x2 >= p.x1 - JUMP_GAP && q.x1 <= p.x2 + JUMP_GAP);
      const rise = Math.min(...below.map((q) => q.y1 - p.y1));
      assert.ok(rise <= JUMP_RISE, `${p.id} rises ${rise}`);
    }
    assert.ok(FLOOR - DAIS.y <= JUMP_RISE);
  });

  it('keeps the veil and spawn where the player can see them', () => {
    assert.ok(SPAWN.x < 400 && SPAWN.y === FLOOR);
    assert.ok(VEIL_X > DAIS.x1 && VEIL_X < DAIS.x2);
    // The veil's foot is the dais: well inside the visible band above the floor.
    assert.ok(FLOOR - DAIS.y < BAND);
  });

  it('only peeks from the dais beside the veil', () => {
    assert.equal(canPeek(VEIL_X - 60, FLOOR), false);
    assert.equal(canPeek(VEIL_X - 60, DAIS.y), true);
    assert.equal(canPeek(VEIL_X - 400, DAIS.y), false);
  });

});

describe('Being Watched veil', () => {
  it('has a short reconstructed exchange ending on OK', () => {
    assert.equal(VEIL_TALK.length, 3);
    assert.equal(VEIL_TALK.at(-1).response, 'OK');
    assert.ok(VEIL_TALK.every((b) => !/—/.test(b.text)), 'no em dashes in reconstructed copy');
  });

  function stubCtx() {
    const log = { progress: [], solved: 0, left: 0, convos: 0 };
    const target = { classId: 'quest_veil' };
    const ctx = {
      data: { veilTarget: target },
      engine: {},
      player: { x: VEIL_X - 60, y: DAIS.y },
      sound() {},
      wait: () => Promise.resolve(),
      converse: async () => { log.convos += 1; return 'ok'; },
      progress: (name) => log.progress.push(name),
      solve: () => { log.solved += 1; },
      activity() {},
      fx: () => false,
      leave: () => { log.left += 1; },
    };
    return { ctx, target, log };
  }

  it('peeks from the dais: convo_end, solved, wakes up', async () => {
    const { ctx, target, log } = stubCtx();
    const verbs = room.verbs(ctx, target);
    assert.equal(verbs[0].id, 'peek');
    assert.equal(verbs[0].enabled, true);
    assert.equal(verbs[0].durationMs, 0);
    assert.equal(room.runVerb(ctx, target, 'peek'), true);
    await new Promise((r) => setTimeout(r, 10));
    assert.deepEqual(log.progress, ['convo_end']);
    assert.equal(log.solved, 1);
    assert.equal(log.left, 1);
    assert.equal(log.convos, 1);
    assert.equal(ctx.data.peeked, true);
    // Leaving after the peek lets the runtime set `leave` (no override).
    assert.deepEqual(room.onLeave(ctx), {});
  });

  it('will not peek from the floor', () => {
    const { ctx, target } = stubCtx();
    ctx.player = { x: VEIL_X - 60, y: FLOOR };
    const [peek] = room.verbs(ctx, target);
    assert.equal(peek.enabled, false);
    assert.match(peek.reason, /Climb up/);
  });
});
