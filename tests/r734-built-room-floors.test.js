/**
 * #734 (Bureaucratic Hall, phone 384 x 748 and desktop): the player stood 128 px under the floor the
 * bureaucrats walk on. The hall's floor line (game.js legalizeRoomBase) was pc_perm 1, an underside
 * that is never standable (street-model.js isStandable, PlatformLine.as pc_solid_from_top). Before
 * #714 (0c9fa9e3ae9) a missing standable line fell back to the deepest line; since then the feet
 * fall to the room's bottom (bounds.b, 700 in the hall), as Glitch's location.b. Six more built
 * rooms had the same floor: the Back Alley, the rook museum, the home ground, the Purple Journey,
 * the neighbour scene and the kids room. A built room's floor is solid from the top (pc_perm -1, as
 * Tiny Speck's own built floors, inc_homes.js platform_pc_perm -1).
 *
 * This stands the player in every built room (the game.js rooms, the scene modules and every quest
 * room) and checks the feet are on its floor line, not at the room's bottom.
 *
 * Second, the hall's lizards called the player "Ur": engine.playerLabel was always the player's
 * speech target's label, set once to 'Ur'. Glitch's {pc_label} is the player's name (items/item.js
 * 1054, npc_bureaucrat.js 425 "Attention, <name>!"). Online it is now the account name
 * (realtime-feature playerChatName). Solo has no character name, so the lizards say "friend", as
 * the other solo speakers (conversations, Street Spirits, quests) do: one fallback, js/pc-label.js.
 * Run: node --test tests/r734-built-room-floors.test.js
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';

import { avatarGround } from '../public/js/avatar-step.js?v=8415ee96';
import { isStandable, platformYAt } from '../public/js/street-model.js?v=a9a05f9d';
import { HALL, fillHallText } from '../public/js/bureaucratic-hall.js?v=074510f2';
import { ALLEY } from '../public/js/quest-rooms/back-alley-set.js?v=4e04295a';
import { ROOK_MUSEUM_WORLD } from '../public/js/rook-museum.js?v=cc091e1c';
import { NEIGHBOUR_SCENE } from '../public/js/neighbours.js?v=13f35acd';
import { neighbourPlatforms } from '../public/js/features/neighbour-scene.js?v=7ceb761e';
import { buildVoyageScene, VOYAGE_FLOOR, VOYAGE_H, VOYAGE_W } from '../public/js/purple-journey-scene.js?v=917b5905';
import { buildKidsRoomScene, KIDS_ROOM_FLOOR, KIDS_ROOM_H, KIDS_ROOM_W } from '../public/js/kids-room-scene.js?v=30860f0d';
import * as kit from '../public/js/quest-rooms/kit.js?v=68db2a09';
import { FakeEl, fakePixi } from './fake-scene.js';
import { SOLO_PC_LABEL, pcLabel } from '../public/js/pc-label.js?v=e19212a2';
import { offerBubble } from '../public/js/conversations.js?v=1c039467';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const game = read('public/game.js');

/** The pc_perm game.js gives a floor line, read from its literal (game.js can't be imported). */
function gamePerm(idPattern) {
  const m = game.match(new RegExp(`\\{ id: ${idPattern},[^}]*pc_perm: (-?\\d+|null) \\}`));
  assert.ok(m, `game.js floor ${idPattern}`);
  return m[1] === 'null' ? null : Number(m[1]);
}

/** Where the feet land standing at x on `floor` in a room width x height (game.js enterScene's street). */
function feetAt(platforms, width, height, x, floor) {
  const street = { tsid: 'ROOM', bounds: { l: 0, r: width, t: 0, b: height }, platforms };
  return avatarGround(platforms, x, floor, 0, { street, fallback: floor });
}

function assertStands(name, platforms, width, height, floor) {
  for (const x of [Math.round(width * 0.1), Math.round(width / 2), Math.round(width * 0.9)]) {
    assert.equal(feetAt(platforms, width, height, x, floor), floor, `${name} at x ${x}: the feet on the floor (${floor}), room bottom ${height}`);
  }
}

describe('#734 the player stands on every built room floor', () => {
  const saved = {};
  before(() => {
    saved.document = globalThis.document;
    saved.PIXI = globalThis.PIXI;
    globalThis.PIXI = fakePixi;
    globalThis.document = { baseURI: 'https://groddle.localhost/', createElement: (t) => new FakeEl(t), head: new FakeEl('head'), body: new FakeEl('body'), getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] };
  });
  after(() => {
    globalThis.document = saved.document;
    globalThis.PIXI = saved.PIXI;
  });
  const flat = (id, width, y, pc_perm) => [{ id, x1: 0, y1: y, x2: width, y2: y, pc_perm }];

  it('the Bureaucratic Hall (legalizeRoomBase): on 572, where the bureaucrats stand, not 700', () => {
    const plats = flat('legalize-bureaucratic-hall-floor', HALL.width, HALL.ground, gamePerm('`\\$\\{name\\}-floor`'));
    assertStands('hall', plats, HALL.width, HALL.height, HALL.ground);
    // The spot #734's trace stood in.
    assert.equal(feetAt(plats, HALL.width, HALL.height, 249, HALL.ground), 572);
  });

  it('the Back Alley, the rook museum and the home ground (game.js)', () => {
    assertStands('back alley', flat('ba_floor', ALLEY.W, ALLEY.FLOOR, gamePerm("'ba_floor'")), ALLEY.W, 760, ALLEY.FLOOR);
    const museumW = ROOK_MUSEUM_WORLD.right - ROOK_MUSEUM_WORLD.left;
    assertStands('rook museum', flat('rook-museum-floor', museumW, ROOK_MUSEUM_WORLD.floorY, gamePerm("'rook-museum-floor'")), museumW, ROOK_MUSEUM_WORLD.height, ROOK_MUSEUM_WORLD.floorY);
    assertStands('home ground', flat('home-ground', 1500, 620, gamePerm("'home-ground'")), 1500, 760, 620);
  });

  it('the neighbour scene, the Purple Journey and the kids room (scene modules)', () => {
    const { width, height, groundY } = NEIGHBOUR_SCENE;
    assertStands('neighbour', neighbourPlatforms(), width, height, groundY);
    assertStands('purple journey', buildVoyageScene(fakePixi).platforms, VOYAGE_W, VOYAGE_H, VOYAGE_FLOOR);
    assertStands('kids room', buildKidsRoomScene(fakePixi).platformsScreen, KIDS_ROOM_W, KIDS_ROOM_H, KIDS_ROOM_FLOOR);
  });

  describe('every quest room (quest-instances enterScene)', () => {
    it('stands on the deepest floor line, at its middle, not at the room bottom', async () => {
      const stages = { 'esquibeth.js': 'waterfall_01' };
      const bad = [];
      let rooms = 0;
      for (const file of readdirSync(new URL('../public/js/quest-rooms/', import.meta.url))) {
        const { room } = await import(`../public/js/quest-rooms/${file}`);
        if (!room?.build) continue;
        const stage = stages[file] ?? (typeof room.firstStage === 'function' ? room.firstStage({ data: {}, param: () => null, state: {} }) : room.firstStage);
        const scene = room.build({ PIXI: fakePixi, kit, data: {}, param: () => null, stage, questId: null, engine: {}, state: {} }, stage);
        const plats = scene.platforms || [];
        const deepest = Math.max(...plats.filter(isStandable).map((p) => Math.max(p.y1, p.y2)));
        const line = plats.find((p) => isStandable(p) && Math.max(p.y1, p.y2) === deepest);
        assert.ok(line, `${file}: a standable floor`);
        const x = Math.round((line.x1 + line.x2) / 2);
        const y = platformYAt(line, x, 0);
        const feet = feetAt(plats, scene.width, scene.height, x, y);
        rooms += 1;
        if (feet >= scene.height || Math.abs(feet - y) > 40) bad.push(`${file}: feet ${feet}, floor ${y}, bottom ${scene.height}`);
      }
      assert.ok(rooms >= 20, `${rooms} rooms`);
      assert.deepEqual(bad, []);
    });
  });

  it('no built room in the game draws its floor or ground as an underside (pc_perm 1)', () => {
    const files = ['public/game.js', ...readdirSync(new URL('../public/js/', import.meta.url), { recursive: true })
      .filter((f) => f.endsWith('.js')).map((f) => `public/js/${f}`)];
    const bad = [];
    for (const f of files) {
      for (const m of read(f).matchAll(/\{ id: [^,]*(floor|ground)[^,]*,[^}]*pc_perm: 1 \}/gi)) bad.push(`${f}: ${m[0]}`);
    }
    assert.deepEqual(bad, []);
  });
});

describe('#734 the world calls you by your name ({pc_label})', () => {
  const getter = game.match(/get playerLabel\(\) \{([\s\S]*?)\n  \},/)[1];
  /** game.js's own getter, run with the features the page has (online: realtime-feature's playerChatName). */
  const playerLabel = (chatName) => new Function('features', 'engine', 'playerSpeechTarget', getter)(
    { query: (hook) => (hook === 'playerChatName' ? chatName : null) }, {}, { name: 'Ur', label: 'Ur' },
  );

  it('engine.playerLabel is your account name online; solo, with no character name, you are "Ur"', () => {
    assert.equal(playerLabel('Pickle'), 'Pickle');
    assert.equal(fillHallText('Attention, {pc_label}! When you’re ready?', { pcLabel: playerLabel('Pickle') }), 'Attention, Pickle! When you’re ready?');
    assert.equal(playerLabel(null), 'Ur');
  });

  it('the loading card and the new-day bubble show you as engine.playerLabel', () => {
    assert.match(game, /playerLabel: engine\.playerLabel,/);
    assert.match(game, /speaker: engine\.playerLabel,/);
  });

  it('solo the lizards say "friend", the one solo fallback the other speakers share', () => {
    const engine = (chatName) => ({ query: (hook) => (hook === 'playerChatName' ? chatName : null) });
    assert.equal(SOLO_PC_LABEL, 'friend');
    assert.equal(pcLabel(engine(null)), 'friend');
    assert.equal(pcLabel(engine('Pickle')), 'Pickle');
    assert.equal(fillHallText('Attention, {pc_label}! When you’re ready?', { pcLabel: pcLabel(engine(null)) }), 'Attention, friend! When you’re ready?');
    assert.match(read('public/js/features/bureaucratic-halls-feature.js'), /pcLabel: \(\) => escapeHtml\(pcLabel\(engine\)\),/);
    assert.match(offerBubble(0.99), /friend/i);
  });

  it('online the call-out bubbles of conversations and street spirits say your name too', () => {
    for (const f of ['public/js/features/conversations-feature.js', 'public/js/features/street-spirits-feature.js']) {
      assert.match(read(f), /offerBubble\(undefined, pcLabel\(engine\)\)/, f);
    }
  });
});
