/**
 * Firefly Whistle (public/js/quest-rooms/firefly-whistle.js): the source
 * text, flags, timings and code from quests/firefly_whistle.js and the items
 * and location scripts it touches; the rebuilt Fireflex 3000 Lab layout
 * (firefly-whistle-scene.js); the Firefly that offers it and the jar gate
 * (features/resource-nodes-feature.js).
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';

import {
  ACTIVATION_CODE,
  ARRIVAL,
  BEAM,
  CONTROL_HIT,
  EXIT_PROMPT_MS,
  HINTS,
  LAYOUT,
  LOCATION_OPTIONS,
  MIDPOINT_PUSH,
  PAD_PUSH,
  PROMPT_AGAIN_MS,
  QUEST,
  STAND_HIT,
  STUCK_TEXT,
  SWALLOW_STEPS,
  TELEPORTER_HINT_AS_COMMENTED,
  TEMPLATE,
  TEXT,
  codeMatches,
  hintFor,
  room,
} from '../public/js/quest-rooms/firefly-whistle.js?v=3ca501b6';
import { DRESSING, ENTRY, FLOOR, FLOOR_Y, LAB, W, entryPath, labPlatforms, seamsToDraw, sx, sy } from '../public/js/quest-rooms/firefly-whistle-scene.js?v=e95b2c49';
import { FIREFLY_LAB_FILES } from '../public/js/quest-rooms/firefly-lab-art.js?v=481a55f9';
import * as kit from '../public/js/quest-rooms/kit.js?v=fd1eb817';
import { BUILT_ROOMS, OFFER_OVERRIDES, QUEST_ROOMS, questGiver } from '../public/js/quest-rooms/catalog.js?v=9ebeb502';
import { REMAKE_QUEST_NPCS } from '../public/js/quest-offers.js?v=6b6cbf22';
import { FIREFLY_OFFER_LINES, FIREFLY_WHISTLE_QUEST, fireflyTouches } from '../public/js/features/resource-nodes-feature.js?v=cf3bfa90';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const GS = join(homedir(), 'Documents/glitch-audit/glitch-GameServerJS');
const read = (p) => readFileSync(join(GS, p), 'utf8');
const hasGS = existsSync(GS);
// GSJS strings escape quotes and use …-free ellipses as typed; compare unescaped.
const unescape = (s) => s.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\//g, '/');

describe('Firefly Whistle source', () => {
  it('keeps the instance, arrival point, exit prompt and location options', () => {
    assert.equal(QUEST, 'firefly_whistle');
    assert.deepEqual(TEMPLATE, { prod: 'LM113UBSS8P18ET', dev: 'LHH11C4QUBP1DQD' });
    assert.deepEqual(ARRIVAL, { x: -2967, y: -283 });
    assert.equal(EXIT_PROMPT_MS, 180_000);
    assert.equal(PROMPT_AGAIN_MS, 120_000);
    assert.equal(STUCK_TEXT, 'Are you stuck? Do you want to leave this place?');
    assert.equal(room.durationMs, 0, 'exit_delay is a prompt, not a clock');
    assert.ok(Object.values(LOCATION_OPTIONS).every((v) => v === false));
    if (!hasGS) return;
    const src = read('quests/firefly_whistle.js');
    assert.match(src, /var tsid = 'LHH11C4QUBP1DQD'/);
    assert.match(src, /var tsid = 'LM113UBSS8P18ET'/);
    assert.match(src, /x: -2967, y:-283, exit_delay: 3\*60, options: \{no_auto_return: true\}/);
    for (const key of Object.keys(LOCATION_OPTIONS)) assert.match(src, new RegExp(`${key}: false`), key);
    assert.match(src, /"name"\t\t: "firefly_whistle_obtained"/);
    assert.match(src, /createItemFromFamiliar\("firefly_jar", 1\)/);
    assert.match(src, /var familiar_turnin = 1;/);
    assert.match(read('players/inc_instances.js'), /instances_schedule_exit_prompt\(details\.instance_id, 2\*60\)/);
  });

  it('uses the stand, whistle and control unit lines word for word', () => {
    if (!hasGS) return;
    const stand = unescape(read('items/whistle_stand_button.js'));
    for (const key of ['standLabel', 'standIntro', 'standConfirm', 'standPushed', 'standTooltip', 'forcefieldA']) {
      assert.ok(stand.includes(TEXT[key]), key);
    }
    for (const line of TEXT.forcefieldB) assert.ok(stand.includes(line), line);
    assert.match(stand, /apiSetHitBox\(500, 200\)/);
    assert.deepEqual(STAND_HIT, { w: 500, h: 200 });
    const whistle = unescape(read('items/firefly_whistle.js'));
    for (const key of ['whistleLabel', 'whistleDesc', 'whistleTooltip', 'glakk']) assert.ok(whistle.includes(TEXT[key]), key);
    assert.match(whistle, /announce_sound\('WHISTLE_SWALLOWED'\)/);
    const tele = unescape(read('items/teleporter_button.js'));
    for (const key of ['controlLabel', 'controlTooltip', 'controlInactive', 'controlPushed', 'teleporterA', 'teleporterB', 'codeTitle', 'codeLabel', 'codeAccepted', 'wrongFirst', 'wrongAgain']) {
      assert.ok(tele.includes(TEXT[key]), key);
    }
    for (const hint of HINTS) assert.ok(tele.includes(hint), hint);
    assert.match(tele, /apiSetHitBox\(200, 200\)/);
    assert.deepEqual(CONTROL_HIT, { w: 200, h: 200 });
    assert.match(tele, /value == 'FFW'/);
    assert.match(tele, /width: 275,\s*height: 530,\s*x: 990,\s*y:-130/);
    assert.deepEqual(BEAM, { x: 990, y: -130, w: 275, h: 530 });
    const player = unescape(read('players/player.js'));
    assert.ok(player.includes(TEXT.swallowed));
    assert.ok(player.includes(TEXT.swallowActivity));
    assert.match(player, /achievements_grant\('firefly_whistling'\)/);
    const loc = unescape(read('locations/location.js'));
    assert.ok(loc.includes(TEXT.midpoint));
    assert.match(loc, /moveAvatar\(pc\.x-500, pc\.y, 'right'\)/);
    assert.match(loc, /teleportToLocation\(this\.tsid, pc\.x-300, pc\.y\)/);
    assert.equal(MIDPOINT_PUSH, 500);
    assert.equal(PAD_PUSH, 300);
  });

  it('times the swallow like fireflyWhistleSwallowed', () => {
    assert.deepEqual([...SWALLOW_STEPS], [0.25, 0.25, 0.25, 0.25, 2, 2]);
    if (!hasGS) return;
    const src = read('players/player.js');
    const body = src.slice(src.indexOf('function fireflyWhistleSwallowed'), src.indexOf('function linkifyLabel'));
    const delays = [...body.matchAll(/step: \d+\}, ([\d.]+)\)/g)].map((m) => Number(m[1]));
    assert.deepEqual(delays.slice(0, 5), [0.25, 0.25, 0.25, 2, 2]);
    assert.match(read('items/firefly_whistle.js'), /fireflyWhistleSwallowed', step: 1\}, 0\.25/);
  });

  it('accepts FFW however it is typed and steps through six hints', () => {
    assert.equal(ACTIVATION_CODE, 'FFW');
    assert.ok(codeMatches('FFW'));
    assert.ok(codeMatches(' ffw '));
    assert.ok(!codeMatches('FFWW'));
    assert.ok(!codeMatches(''));
    assert.equal(HINTS.length, 6);
    assert.equal(hintFor(1), HINTS[0]);
    assert.equal(hintFor(4), 'The code is FFW.');
    assert.equal(hintFor(6), HINTS[5]);
    assert.equal(hintFor(9), HINTS[5]);
  });
});

describe('Fireflex 3000 Lab layout', () => {
  it('puts the teleporter where its beam overlay stands and the floor under it', () => {
    assert.equal(LAYOUT.pad, BEAM.x);
    assert.equal(FLOOR, sy(FLOOR_Y));
    assert.equal(FLOOR_Y, BEAM.y - 12, "Snap PIFISEG38S535GC_56214: the pad's foot 12 px under the avatar's feet");
    assert.equal(W, LAB.r - LAB.l);
    assert.ok(sx(ARRIVAL.x) > 0 && sx(LAB.r) === W);
  });

  it('runs arrival -> poster -> egg pod -> pillar -> stand -> pillar -> midpoint -> control unit -> pad (video 2Z76dO4DlJ4)', () => {
    const [, , p3, p4] = DRESSING.pillars;
    assert.ok(ARRIVAL.x < DRESSING.poster.x);
    assert.ok(DRESSING.poster.x < DRESSING.eggs[0] && DRESSING.eggs[0] < p3 && p3 < LAYOUT.stand, 't29-36');
    assert.ok(LAYOUT.stand < p4 && p4 < LAYOUT.midpoint, 't40.9: walked back just past the pillar right of the stand');
    assert.ok(LAYOUT.stand + STAND_HIT.w / 2 < LAYOUT.midpoint, 'the stand box ends before the midpoint');
    const landed = LAYOUT.midpoint - MIDPOINT_PUSH;
    assert.ok(landed < LAYOUT.stand && landed > DRESSING.eggs[0], 't43: the walk back lands just short of the stand');
    assert.ok(LAYOUT.midpoint < LAYOUT.control && LAYOUT.control < LAYOUT.pad);
    assert.ok(LAYOUT.pad - PAD_PUSH > LAYOUT.midpoint, 'the pad sends you back on the near side of the midpoint');
    assert.ok(LAYOUT.pad < LAB.r - 100);
    assert.ok(DRESSING.windows.at(-1).x > LAYOUT.pad, 'a window past the pad (t103)');
  });

  it('ends where the video camera stops: arrival 33 px from the left edge, the last window at the right', () => {
    assert.equal(LAB.l, -3000);
    assert.equal(LAB.r, 1270);
    assert.equal(ARRIVAL.x - LAB.l, 33);
    assert.equal(DRESSING.eggs.length, 1);
    assert.equal(DRESSING.pillars.length, 4);
    assert.deepEqual(DRESSING.signs.map((s) => s.text), ['G2', 'G2', 'G2']);
    assert.ok(DRESSING.windows.at(-1).x + DRESSING.windows.at(-1).w / 2 < LAB.r);
  });

  it('enters on a ledge in the doorway and walks down a ramp to the corridor floor', () => {
    assert.equal(ENTRY.x1, LAB.l);
    assert.ok(ENTRY.ledgeEnd > ARRIVAL.x, 'the arrival point is over the ledge');
    assert.ok(ENTRY.y < FLOOR_Y && ENTRY.y > ARRIVAL.y, 'the ledge is between the floor and the arrival y');
    assert.ok(ENTRY.rampEnd < DRESSING.pillars[0]);
    const plats = labPlatforms(kit);
    for (let i = 1; i < plats.length; i += 1) {
      assert.equal(plats[i].x1, plats[i - 1].x2, `segment ${i} starts where ${i - 1} ends`);
      assert.equal(plats[i].y1, plats[i - 1].y2);
      assert.ok(plats[i].y2 >= plats[i].y1, 'never climbs going right');
    }
    assert.deepEqual([plats[0].x1, plats[0].y1], entryPath()[0]);
    assert.deepEqual([plats.at(-1).x2, plats.at(-1).y2], [W, FLOOR]);
    for (const p of plats) assert.ok(Math.abs(p.y2 - p.y1) <= (p.x2 - p.x1) * 0.8, 'walkable slope');
  });

  it('never shows the control unit\'s collision lines (as written; video t90-93)', () => {
    assert.equal(TELEPORTER_HINT_AS_COMMENTED, false);
  });
});

describe('Firefly Whistle offer and room wiring', () => {
  before(async () => {
    const { loadContentCatalogsFromDir } = await import('../public/js/content-catalogs.js?v=10b118dd');
    loadContentCatalogsFromDir(join(root, 'public/assets/content'));
  });

  it('is a built room offered by bumping into a Firefly, delivered by the Magic Rock', () => {
    assert.equal(QUEST_ROOMS.firefly_whistle, 'firefly_whistle');
    assert.ok(BUILT_ROOMS.includes('firefly_whistle'));
    assert.deepEqual(OFFER_OVERRIDES.firefly_whistle.offerTriggers, [{ type: 'npc', npc: 'npc_firefly' }]);
    assert.ok(REMAKE_QUEST_NPCS.includes('npc_firefly'));
    const def = JSON.parse(readFileSync(join(root, 'public/assets/content/quests.json'), 'utf8')).firefly_whistle;
    assert.equal(def.solo, true);
    assert.equal(def.instanceRoom, 'firefly_whistle');
    assert.equal(def.soloReason, undefined);
    assert.equal(questGiver(def).label, 'Magic Rock');
    assert.equal(def.requirements[0].name, 'firefly_whistle_obtained');
    assert.equal(def.rewards.items['0'].class_tsid, 'firefly_jar');
    assert.equal(FIREFLY_WHISTLE_QUEST, QUEST);
    if (!hasGS) return;
    const fly = read('items/npc_firefly.js');
    assert.match(fly, /getQuestStatus\('firefly_whistle'\);\s*if \(status == 'none' && !pc\['!firefly_collision'\]\)/);
    assert.ok(fly.includes(FIREFLY_OFFER_LINES[0].lines[0]));
    assert.ok(fly.includes(FIREFLY_OFFER_LINES[1].lines[0]));
    assert.match(fly, /duration: 2500/);
    assert.equal(FIREFLY_OFFER_LINES[1].durationMs, 2500);
    assert.match(read('main.js'), /pc\.quests_offer\(msg\.done_payload\.quest_name, true\)/);
  });

  it('touches a Firefly that drifts into the avatar, not one far overhead', () => {
    const p = { x: 500, y: 600 };
    assert.ok(fireflyTouches(p, { x: 530, y: 520 }));
    assert.ok(fireflyTouches(p, { x: 450, y: 470 }));
    assert.ok(!fireflyTouches(p, { x: 620, y: 520 }));
    assert.ok(!fireflyTouches(p, { x: 500, y: 420 }));
  });

  it('gates the jar on the badge again instead of granting it on the first try', () => {
    const src = readFileSync(join(root, 'public/js/features/resource-nodes-feature.js'), 'utf8');
    assert.ok(!/grantWhistle|first try teaches/.test(src));
    assert.match(src, /requireAchievement: entity !== demoEntity/);
    if (!hasGS) return;
    assert.match(read('items/firefly_jar.js'), /if \(!pc\.achievements_has\('firefly_whistling'\)\)\{\s*return \{state:'disabled', reason: "You need the Firefly Whisperer achievement\."\}/);
  });

  it('ships its art', () => {
    const dir = join(root, 'public/assets/sprites/quest-rooms/firefly_whistle');
    for (const f of ['whistle_stand_on.webp', 'whistle_stand_off.webp', 'teleporter_control.webp', 'firefly_whistle@2x.webp', 'firefly_whistle_icon.png']) {
      assert.ok(existsSync(join(dir, f)), f);
    }
    assert.ok(room.icon.endsWith('firefly_whistle_icon.png'));
    for (const d of ['eggbooth', 'security_orb', 'Teleporter_Base', 'Teleporter_Beam']) {
      assert.ok(existsSync(join(root, 'public/assets/decos/groddle', `${d}.webp`)), d);
    }
  });
});

describe('Fireflex 3000 Lab art (G113)', () => {
  const plan = JSON.parse(readFileSync(join(root, 'tools/room-art/firefly_lab.json'), 'utf8'));
  const scene = readFileSync(join(root, 'public/js/quest-rooms/firefly-whistle-scene.js'), 'utf8');

  it('matches its room-art plan: starter.swf decos at their stage size (tools/room-art/build.py firefly_lab)', () => {
    assert.match(plan.source, /glitch-locations starter\.swf \(CC0\)/);
    assert.deepEqual(Object.keys(plan.pieces).sort(), Object.keys(FIREFLY_LAB_FILES).sort());
    for (const [name, row] of Object.entries(plan.pieces)) {
      const [file, w, h] = FIREFLY_LAB_FILES[name];
      assert.equal(file, row.file);
      assert.deepEqual([w, h], row.world);
      assert.equal(row.swf, `bundle:starter.swf#${name}`);
      assert.equal(row.scale, 1, `${name} drawn at world scale 1, as video 2Z76dO4DlJ4 shows it`);
      const bytes = readFileSync(join(root, 'public/assets/sprites/quest-rooms/firefly_lab', file));
      assert.equal(createHash('sha256').update(bytes).digest('hex').slice(0, 16), row.sha, `${file} changed since the build`);
    }
  });

  it('draws the lab from its own decos, not vectors', () => {
    for (const n of ['wall', 'wall_small', 'window_cutout', 'platform', 'ground_slice', 'doorway1', 'pillar', 'frame_cutout',
      'poster_alph', 'graffiti_tii_saves', 'graffiti_hell', 'torn_poster_1', 'crack', 'flyer', 'arrow_ground', 'arrow_ground2']) {
      assert.ok(FIREFLY_LAB_FILES[n], n);
      assert.ok(scene.includes(`'${n}'`), `${n} placed by the scene`);
    }
    // The graffiti deco reads "Tii Saves" (the earlier "Tri Saves" was misread off the video).
    assert.equal(DRESSING.graffiti.text, 'Tii Saves');
    assert.ok(!/Tri Saves|Church of Alph'|new PIXI\.Text/.test(scene), 'no drawn text: the poster and G2 are the decos');
    // The G2 walls' own seams stand for two of the video's seams; the one on the window glass is skipped.
    assert.deepEqual(seamsToDraw(), [-980, -150]);
  });

  it('keeps the stand and control unit as their recovered item art (the whistle_stand / teleporter_controller decos are button-less stand-ins)', () => {
    assert.ok(!FIREFLY_LAB_FILES.whistle_stand && !FIREFLY_LAB_FILES.teleporter_controller);
  });
});
