/**
 * Being Watched (public/js/quest-rooms/being-watched.js): source constants
 * from quests/stale_but_necessary.js, the reconstructed dream's reach, and the
 * veil flow on a stub room context.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

import * as kit from '../public/js/quest-rooms/kit.js';
import { JUMP_RISE, JUMP_GAP } from '../public/js/quest-rooms/puzzle-kit.js';
import {
  DAIS,
  DRINK_TEXT,
  EYES,
  FLAGS,
  FLOOR,
  NAP_MS,
  PILLOWS,
  QUEST,
  SPAWN,
  VEIL_TALK,
  VEIL_X,
  W,
  canPeek,
  napPlatforms,
  pupilOffset,
  room,
} from '../public/js/quest-rooms/being-watched.js';
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
    for (const deco of ['cloud_fluffy_1', 'cloud_fluffy_2', 'block_cloud01', 'bureaucratic_hall_tv_1']) {
      assert.ok(existsSync(join(root, 'public/assets/decos/groddle', `${deco}.webp`)), deco);
    }
    const art = readFileSync(join(root, 'public/js/quest-rooms/being-watched.js'), 'utf8');
    for (const m of art.matchAll(/`\$\{LEGALIZE\}([^`]+)`/g)) {
      assert.ok(existsSync(join(root, 'public/assets/sprites/quests/legalize', m[1])), m[1]);
    }
  });
});

describe('Being Watched dream geometry', () => {
  const plats = napPlatforms(kit);
  const floor = plats.find((p) => p.id === 'bw_floor');

  it('lets an ordinary jump reach every ledge and the dais', () => {
    assert.equal(floor.x1, 0);
    assert.equal(floor.x2, W);
    for (const p of plats.filter((q) => q !== floor)) {
      const below = plats.filter((q) => q !== p && q.y1 > p.y1 && q.x2 >= p.x1 - JUMP_GAP && q.x1 <= p.x2 + JUMP_GAP);
      const rise = Math.min(...below.map((q) => q.y1 - p.y1));
      assert.ok(rise <= JUMP_RISE, `${p.id} rises ${rise}`);
    }
    assert.ok(FLOOR - DAIS.y <= JUMP_RISE);
    assert.ok(DAIS.x1 > PILLOWS.at(-1).x2, 'the dais is past the last pillow');
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

  it('keeps pupils inside their eyes', () => {
    for (const e of EYES) {
      for (const [x, y] of [[0, FLOOR], [W, FLOOR], [e.x, e.y + 400], [e.x + 1, e.y - 900]]) {
        const o = pupilOffset(e, x, y);
        assert.ok(Math.hypot(o.x, o.y) <= e.r * 0.45 + 1e-9);
      }
    }
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
