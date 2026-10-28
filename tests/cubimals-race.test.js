/**
 * Cubimal figures out of the box (G95): Race, Name / Rename, the set-free
 * conversation and farewell, from npc_cubimal_base (items/npc_cubimal_*.js).
 * Run: node --test tests/cubimals-race.test.js
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CUBIMAL_FREE,
  CUBIMAL_FREE_RESPONSES,
  CUBIMAL_NAMING,
  CUBIMAL_RACE,
  CUBIMAL_RACE_CELLS,
  CUBIMAL_RACE_SHEET,
  CUBIMAL_SERIES,
  advanceCubimalRacer,
  cubimalArticle,
  cubimalFreeQuestion,
  cubimalFreeResponseIndex,
  cubimalNameVerb,
  cubimalRaceEndMessage,
  cubimalRaceOutcome,
  cubimalRacePlanks,
  cubimalRacePxPerSec,
  cubimalRaceSheet,
  cubimalRaceVerbMessage,
  ensureCubimalItems,
  nameCubimal,
  rollCubimalRace,
  sanitizeCubimalName,
  setCubimalFree,
} from '../public/js/cubimals.js';
import { addItem, countItem, createInventory } from '../public/js/inventory.js?v=catalog-unified-7';
import { applyAchievementProgress, createAchievementState } from '../public/js/achievements.js?v=g403-1';
import { loadContentCatalogsFromDir } from '../public/js/content-catalogs.js?v=g403-1';
import { FEATURES } from '../public/js/features/index.js?v=registry-242';
import { cubimalRaceFeature, CUBIMAL_RACE_FEATURE_ID } from '../public/js/features/cubimal-race-feature.js?v=g413-1';
import { FIRST_DRAW_SPRITES, HIRES_SPRITES } from '../public/js/sprite-hires.js?v=g405-1';

const here = dirname(fileURLToPath(import.meta.url));
const publicRoot = join(here, '../public');
const GSJS = join(process.env.HOME || '', 'Documents/glitch-audit/glitch-GameServerJS');
const ALL = [...CUBIMAL_SERIES[1], ...CUBIMAL_SERIES[2]].map((row) => row.classTsid);

/** Lossless WebP (VP8L) or extended (VP8X) canvas size. */
function webpSize(file) {
  const b = readFileSync(file);
  assert.equal(b.subarray(0, 4).toString(), 'RIFF');
  assert.equal(b.subarray(8, 12).toString(), 'WEBP');
  const chunk = b.subarray(12, 16).toString();
  if (chunk === 'VP8L') {
    return {
      width: 1 + (((b[22] & 0x3f) << 8) | b[21]),
      height: 1 + (((b[24] & 0x0f) << 10) | (b[23] << 2) | ((b[22] & 0xc0) >> 6)),
    };
  }
  assert.equal(chunk, 'VP8X');
  return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
}

before(async () => {
  ensureCubimalItems();
  await loadContentCatalogsFromDir(join(publicRoot, 'assets/content'));
});

describe('race rules (npc_cubimal_base verbs.race, onRaceStart, onRaceEnd)', () => {
  it('keeps the source timings, rolls and thresholds', () => {
    assert.equal(CUBIMAL_RACE.windUpMs, 2000);
    assert.deepEqual([CUBIMAL_RACE.speedMin, CUBIMAL_RACE.speedMax], [15, 85]);
    assert.deepEqual([CUBIMAL_RACE.secsMin, CUBIMAL_RACE.secsMax], [2, 10]);
    assert.equal(CUBIMAL_RACE.returnMs, 3000);
    assert.equal(CUBIMAL_RACE.plankPx, 100);
    assert.equal(CUBIMAL_RACE.rightMargin, 200);
    assert.equal(CUBIMAL_RACE.longDistancePlanks, 8.9);
    assert.equal(CUBIMAL_RACE.swarmSize, 31);
  });

  it('matches the GSJS numbers in every figure file', { skip: !existsSync(GSJS) }, () => {
    for (const classTsid of ALL) {
      const src = readFileSync(join(GSJS, `items/${classTsid}.js`), 'utf8');
      for (const re of [
        /apiSetTimer\('onRaceStart', 2000\)/,
        /npc_walk_speed = randInt\(15, 85\)/,
        /apiSetTimer\('onRaceEnd', randInt\(2, 10\)\*1000\)/,
        /var distance = \(this\.x - this\.start_point\) \/ 100;/,
        /" planks before stopping\."/,
        /if \(distance >= 8\.9\)/,
        /apiSetTimer\('returnToPack', 3000\)/,
        /swarm\.length >= 31/,
        /createItemStackWithPoof\(this\.class_tsid, 1, pc\.x\+80, pc\.y-60\)/,
        /apiMoveToXY\(this\.x, this\.y-1000, 1500, "setFreeEnd"\)/,
        /'Really, you want to set me free\? I\\'ll give you '\+img_gained\+' Imagination\.'/,
        /var article = "(an?)";/,
      ]) {
        assert.ok(re.test(src), `${classTsid}: ${re}`);
      }
      const article = src.match(/var article = "(an?)";/)[1];
      assert.equal(cubimalArticle(classTsid), article, classTsid);
    }
  });

  it('names like include/animal_naming.js', { skip: !existsSync(GSJS) }, () => {
    const src = readFileSync(join(GSJS, 'items/include/animal_naming.js'), 'utf8');
    assert.ok(src.includes(`value = value.substr(0, 32).replace(/[^a-z0-9 ]/gi,'');`));
    assert.ok(src.includes(`this.sendBubble('And they shall call me "'+value+'"', 5000);`));
    assert.ok(src.includes(`if (!this.has_parent('npc_cubimal_base') && !pc.skills_has('animalkinship_5')) return false;`));
  });

  it('rolls randInt(15, 85) and randInt(2, 10) inclusive, and lets QA pin them', () => {
    assert.deepEqual(rollCubimalRace(() => 0), { speed: 15, secs: 2 });
    assert.deepEqual(rollCubimalRace(() => 0.9999), { speed: 85, secs: 10 });
    assert.deepEqual(rollCubimalRace(() => 0.5, { speed: '40', secs: '4' }), { speed: 40, secs: 4 });
    assert.deepEqual(rollCubimalRace(() => 0.5, { speed: 500, secs: 0 }), { speed: 85, secs: 2 });
    assert.deepEqual(rollCubimalRace(() => 0, { speed: null, secs: '' }), { speed: 15, secs: 2 });
  });

  it('runs at two pixels per speed point, so 8.9 planks is reachable and the record is 17', () => {
    assert.equal(cubimalRacePxPerSec(85), 170);
    assert.equal((cubimalRacePxPerSec(85) * 10) / CUBIMAL_RACE.plankPx, 17);
    // Literal px/s would cap at 8.5 planks, below the 8.9-plank badge.
    assert.ok((85 * 10) / 100 < CUBIMAL_RACE.longDistancePlanks);
    let reach = 0;
    let all = 0;
    for (let s = 15; s <= 85; s += 1) {
      for (let t = 2; t <= 10; t += 1) {
        all += 1;
        if ((cubimalRacePxPerSec(s) * t) / 100 >= 8.9) reach += 1;
      }
    }
    // A long run is a minority result, not a given.
    assert.ok(reach / all > 0.15 && reach / all < 0.4, `${reach}/${all}`);
  });

  it('measures whole pixels in planks with up to two decimals', () => {
    assert.equal(cubimalRacePlanks(100, 247), 1.47);
    assert.equal(cubimalRacePlanks(100, 824.4), 7.24);
    assert.equal(cubimalRacePlanks(100, 1120), 10.2);
    assert.equal(cubimalRacePlanks(300, 200), 0);
  });

  it('writes the verb and end messages with the source article and label', () => {
    assert.equal(cubimalRaceVerbMessage('npc_cubimal_butterfly'), 'You raced a Butterfly Cubimal.');
    assert.equal(cubimalRaceVerbMessage('npc_cubimal_emobear'), 'You raced an Emo-Bear Cubimal.');
    assert.equal(
      cubimalRaceEndMessage('npc_cubimal_butterfly', 1.47),
      'Your Butterfly Cubimal went 1.47 planks before stopping.'
    );
    assert.equal(
      cubimalRaceEndMessage('npc_cubimal_snoconevendor', 7.24, "Morticia Addams's"),
      "Morticia Addams's Sno Cone Vendor Cubimal went 7.24 planks before stopping."
    );
  });

  it('counts long distance at 8.9 planks and the feat points at 5', () => {
    assert.deepEqual(cubimalRaceOutcome(8.89), { longDistance: false, featPoints: 2 });
    assert.deepEqual(cubimalRaceOutcome(8.9), { longDistance: true, featPoints: 2 });
    assert.deepEqual(cubimalRaceOutcome(4.99), { longDistance: false, featPoints: 0 });
  });

  it('awards The Loneliness of the Long Distance Cubimal from its counter', () => {
    const state = createAchievementState();
    const pc = { xp: 0, imagination: 0, favor: {} };
    const updates = applyAchievementProgress(state, CUBIMAL_RACE.longDistanceCounter, 1, pc);
    const hit = updates.find((u) => u.classTsid === 'loneliness_of_the_long_distance_cubimal');
    assert.ok(hit?.unlocked);
    assert.equal(hit.rewards.xp, 350);
  });

  it('walks the platform under its feet and stops at an edge or the path end', () => {
    const platforms = [{ x1: 0, y1: 500, x2: 600, y2: 500 }, { x1: 600, y1: 500, x2: 900, y2: 470 }];
    const surface = (x, y) => {
      let best = null;
      for (const p of platforms) {
        const minX = Math.min(p.x1, p.x2);
        const maxX = Math.max(p.x1, p.x2);
        if (x < minX || x > maxX) continue;
        const py = p.y1 + ((x - p.x1) / (p.x2 - p.x1)) * (p.y2 - p.y1);
        if (py < y - 24 || py > y + 24) continue;
        if (best == null || Math.abs(py - y) < Math.abs(best - y)) best = py;
      }
      return best;
    };
    const slope = advanceCubimalRacer({ x: 500, y: 500 }, 750, surface, 2000);
    assert.equal(slope.x, 750);
    assert.ok(slope.y < 500 && slope.y > 470);
    assert.equal(slope.blocked, false);
    const edge = advanceCubimalRacer({ x: 800, y: 480 }, 1200, surface, 2000);
    assert.equal(edge.x, 900);
    assert.equal(edge.blocked, true);
    const end = advanceCubimalRacer({ x: 100, y: 500 }, 900, surface, 400);
    assert.equal(end.x, 400);
    assert.equal(end.blocked, true);
  });
});

describe('race art (OGA npc_cubimal_*__x1_race)', () => {
  it('has a 20 x 3, 60-frame sheet for each of the 43 figures', () => {
    assert.equal(Object.keys(CUBIMAL_RACE_CELLS).length, 43);
    assert.deepEqual(Object.keys(CUBIMAL_RACE_CELLS).sort(), [...ALL].sort());
    for (const classTsid of ALL) {
      const def = cubimalRaceSheet(classTsid);
      assert.equal(def.cols, 20);
      assert.equal(def.frames, CUBIMAL_RACE_SHEET.frames);
      const file = join(publicRoot, def.path);
      assert.ok(existsSync(file), def.path);
      const size = webpSize(file);
      assert.deepEqual(size, { width: def.fw * 20, height: def.fh * 3 }, def.path);
    }
    assert.equal(cubimalRaceSheet('npc_piggy'), null);
  });

  it('has a 3x render of each sheet from its vector SWF, same frames, same order (tools/vector-sprites/cubimals.json)', () => {
    const manifest = JSON.parse(readFileSync(join(here, '../tools/vector-sprites/cubimals.json'), 'utf8'));
    const results = JSON.parse(readFileSync(join(here, '../tools/vector-sprites/results.json'), 'utf8'));
    const sheets = manifest.jobs.flatMap((job) => job.sheets.map((sheet) => ({ job, sheet })));
    assert.equal(manifest.firstDraw, true);
    assert.deepEqual(sheets.map(({ sheet }) => sheet.path).sort(), ALL.map((id) => cubimalRaceSheet(id).path).sort());
    for (const classTsid of ALL) {
      const def = cubimalRaceSheet(classTsid);
      const { job, sheet } = sheets.find((row) => row.sheet.path === def.path);
      assert.equal(job.swf, `cubimals/${classTsid}/${classTsid}.swf`);
      assert.deepEqual([sheet.label, sheet.fw, sheet.fh, sheet.cols, sheet.frames], ['race', def.fw, def.fh, 20, 60], def.path);
      const r = results[def.path];
      assert.equal(r?.status, 'ok', def.path);
      // The race label is SWF frames 2-61: cell k is frame k + 2, unmirrored, unshifted.
      assert.deepEqual([r.swfFrames, r.shift, r.mirror, r.cells], [[2, 61], 0, false, 60], def.path);
      const hires = def.path.replace(/\.webp$/, '@3x.webp');
      assert.equal(HIRES_SPRITES.get(def.path), hires);
      assert.ok(FIRST_DRAW_SPRITES.has(def.path), def.path);
      assert.deepEqual(webpSize(join(publicRoot, hires)), { width: def.fw * 60, height: def.fh * 9 }, hires);
    }
  });
});

describe('Name / Rename (animal_naming.js)', () => {
  it('sanitizes like onInputBoxResponse and answers with the source bubble', () => {
    assert.equal(sanitizeCubimalName('Sprocket!! the 2nd ✓'), 'Sprocket the 2nd ');
    assert.equal(sanitizeCubimalName('x'.repeat(40)).length, 32);
    const names = {};
    assert.equal(cubimalNameVerb(names, 'npc_cubimal_chick').label, 'Name');
    assert.equal(cubimalNameVerb(names, 'npc_cubimal_chick').title, 'Name Me!');
    const res = nameCubimal(names, 'npc_cubimal_chick', 'Sprocket');
    assert.equal(res.ok, true);
    assert.equal(res.bubble, 'And they shall call me "Sprocket"');
    assert.equal(res.bubbleMs, 5000);
    assert.equal(res.counter, 'animals_named:npc_cubimal_chick');
    const rename = cubimalNameVerb(names, 'npc_cubimal_chick');
    assert.deepEqual([rename.label, rename.title, rename.value], ['Rename', 'Rename Me!', 'Sprocket']);
    assert.equal(rename.tooltip, "Change this Cubimal's name");
    assert.equal(nameCubimal(names, 'npc_cubimal_chick', 'Sprocket').reason, 'unchanged');
    assert.equal(nameCubimal(names, 'npc_cubimal_chick', '!!!').reason, 'empty');
    assert.equal(nameCubimal(names, 'npc_piggy', 'Wilbur').ok, false);
    assert.equal(CUBIMAL_NAMING.inputLabel, 'My new name:');
  });
});

describe('set free, with love (conversation and farewell)', () => {
  it('asks the source question with the class reward, and rare figures have none', () => {
    assert.equal(cubimalFreeQuestion('npc_cubimal_chick'), "Really, you want to set me free? I'll give you 400 Imagination.");
    assert.equal(cubimalFreeQuestion('npc_cubimal_bureaucrat'), "Really, you want to set me free? I'll give you 1000 Imagination.");
    assert.equal(cubimalFreeQuestion('npc_cubimal_rook'), null);
    assert.equal(CUBIMAL_FREE.yes, "Yes, go on, you're free now!");
    assert.equal(CUBIMAL_FREE.no, 'No, I love you too much.');
    assert.deepEqual(
      [CUBIMAL_FREE.offsetX, CUBIMAL_FREE.offsetY, CUBIMAL_FREE.responseMs, CUBIMAL_FREE.flyAtMs, CUBIMAL_FREE.riseY, CUBIMAL_FREE.riseMs],
      [80, -60, 300, 2500, 1000, 1500]
    );
  });

  it('picks the same farewell the reward uses for a roll', () => {
    for (const roll of [0, 0.25, 0.5, 0.75, 0.99]) {
      const inv = createInventory({});
      addItem(inv, 'npc_cubimal_chick', 1);
      const result = setCubimalFree(inv, { xp: 0, imagination: 0 }, 'npc_cubimal_chick', roll);
      assert.equal(result.response, CUBIMAL_FREE_RESPONSES[cubimalFreeResponseIndex(roll)]);
    }
  });
});

describe('cubimal-race feature', () => {
  const realNow = Date.now;
  let clock = 1_000_000;
  after(() => {
    Date.now = realNow;
  });

  class Sprite {
    constructor() {
      this.anchor = { set() {} };
      this.scale = { set() {} };
      this.x = 0;
      this.y = 0;
      this.destroyed = false;
      this.playing = false;
    }
    gotoAndStop() { this.playing = false; }
    gotoAndPlay() { this.playing = true; }
    play() { this.playing = true; }
    destroy() { this.destroyed = true; }
  }

  class Shape extends Sprite {
    circle() { return this; }
    fill() { return this; }
  }

  function fakeEngine(params = {}) {
    const data = {};
    const log = [];
    const engine = {
      PIXI: { AnimatedSprite: Sprite, Graphics: Shape, Texture: { EMPTY: {} } },
      started: true,
      inv: createInventory({}),
      player: { x: 300, y: 500 },
      platforms: [{ x1: 0, y1: 500, x2: 3000, y2: 500 }],
      worldW: 3000,
      entityLayer: { addChild() {} },
      registered: [],
      busy: () => false,
      register(t) { engine.registered.push(t); return t; },
      unregister(t) { engine.registered = engine.registered.filter((r) => r !== t); t.sprite?.destroy(); },
      playSound: (k) => log.push(`sound:${k}`),
      playSoundLoop: (k) => { log.push(`loop:${k}`); return { stop: () => log.push(`stop:${k}`) }; },
      pushActivity: (m) => log.push(`activity:${m}`),
      toast: () => {},
      refreshPack: () => {},
      save: () => {},
      say: (t, text) => log.push(`say:${text}`),
      achievement: (c) => log.push(`achievement:${c}`),
      grantAchievement: (c) => log.push(`grant:${c}`),
      setData: (k, v) => { data[k] = v; },
      param: (k) => (k in params ? params[k] : null),
      scriptedDialogue: (opts) => { engine.dialogue = opts; },
    };
    return { engine, data, log };
  }

  it('is registered in the feature list', () => {
    assert.ok(FEATURES.some((f) => f.id === CUBIMAL_RACE_FEATURE_ID));
    const src = readFileSync(join(publicRoot, 'js/features/index.js'), 'utf8');
    assert.match(src, /cubimal-race-feature\.js\?v=/);
  });

  it('offers Name then Race on a figure in the pack, and Rename once named', () => {
    const { engine } = fakeEngine();
    cubimalRaceFeature.restore({}, engine);
    assert.deepEqual(cubimalRaceFeature.packVerbs('npc_cubimal_chick', engine), []);
    addItem(engine.inv, 'npc_cubimal_chick', 1);
    assert.deepEqual(cubimalRaceFeature.packVerbs('npc_cubimal_chick', engine).map((v) => v.label), ['Name', 'Race']);
    cubimalRaceFeature.restore({ names: { npc_cubimal_chick: 'Sprocket' } }, engine);
    assert.deepEqual(cubimalRaceFeature.packVerbs('npc_cubimal_chick', engine).map((v) => v.label), ['Rename', 'Race']);
    assert.deepEqual(cubimalRaceFeature.packVerbs('apple', engine), []);
  });

  it('a named figure goes by its name in the pack and on the ground, its type beside it', () => {
    const { engine } = fakeEngine();
    cubimalRaceFeature.restore({}, engine);
    assert.equal(cubimalRaceFeature.itemDisplayName('npc_cubimal_chick'), null);
    cubimalRaceFeature.restore({ names: { npc_cubimal_chick: 'Sprocket', npc_cubimal_emobear: 'Teddy' } }, engine);
    assert.deepEqual(cubimalRaceFeature.itemDisplayName('npc_cubimal_chick'), { label: 'Sprocket', kind: 'Chick Cubimal' });
    assert.deepEqual(cubimalRaceFeature.itemDisplayName('npc_cubimal_emobear'), { label: 'Teddy', kind: 'Emo-Bear Cubimal' });
    assert.equal(cubimalRaceFeature.itemDisplayName('npc_cubimal_fox'), null);
    assert.equal(cubimalRaceFeature.itemDisplayName('apple'), null);
    // game.js asks for it on the pack card, the pack slot tooltip and the dropped stack.
    const game = readFileSync(join(publicRoot, 'game.js'), 'utf8');
    assert.equal(game.match(/features\.query\('itemDisplayName'/g)?.length, 3);
    assert.match(game, /pack-pop-kind">\$\{named \? escapeHtml\(named\.kind\) : kind\}/);
    assert.match(game, /label: named\?\.label \|\| item\.label \|\| stack\.classTsid/);
  });

  it('races out of the pack: wind up, run right, stop, message, then back in the pack', () => {
    Date.now = () => clock;
    const { engine, data, log } = fakeEngine({ cubimalracespeed: '85', cubimalracesecs: '6' });
    cubimalRaceFeature.restore({}, engine);
    addItem(engine.inv, 'npc_cubimal_chick', 1);
    assert.equal(cubimalRaceFeature.runPackVerb('npc_cubimal_chick', 'cubimal_race', engine), true);
    assert.equal(countItem(engine.inv, 'npc_cubimal_chick'), 0);
    assert.equal(data.cubimalRaceState, 'windup');
    assert.ok(log.includes('sound:CUBIMAL_WIND_UP'));
    assert.ok(log.includes('activity:You raced a Chick Cubimal.'));
    // Nothing to do with a racing figure (canPickup refuses while is_racing).
    const racer = engine.registered.find((t) => t.classId === 'cubimal_racer');
    assert.deepEqual(cubimalRaceFeature.verbsFor(racer, engine), []);
    // Mid-race save keeps the figure for a reload.
    assert.deepEqual(cubimalRaceFeature.save().out, ['npc_cubimal_chick']);

    clock += 1999;
    cubimalRaceFeature.onTick(16, clock, engine);
    assert.equal(data.cubimalRaceState, 'windup');
    clock += 1;
    cubimalRaceFeature.onTick(16, clock, engine);
    assert.equal(data.cubimalRaceState, 'racing');
    assert.ok(log.includes('loop:CUBIMAL_RACE'));
    clock += 3000;
    cubimalRaceFeature.onTick(16, clock, engine);
    assert.equal(Math.round(racer.sprite.x), 300 + 510);
    clock += 3000;
    cubimalRaceFeature.onTick(16, clock, engine);
    assert.equal(data.cubimalRaceState, 'stopped');
    assert.equal(data.cubimalRacePlanks, '10.2');
    assert.equal(data.cubimalRaceMessage, 'Your Chick Cubimal went 10.2 planks before stopping.');
    assert.ok(log.includes('sound:CUBIMAL_WIND_DOWN'));
    assert.ok(log.includes('stop:CUBIMAL_RACE'));
    assert.ok(log.includes(`achievement:${CUBIMAL_RACE.longDistanceCounter}`));
    clock += 2999;
    cubimalRaceFeature.onTick(16, clock, engine);
    assert.equal(countItem(engine.inv, 'npc_cubimal_chick'), 0);
    clock += 1;
    cubimalRaceFeature.onTick(16, clock, engine);
    assert.equal(countItem(engine.inv, 'npc_cubimal_chick'), 1);
    assert.equal(engine.registered.length, 0);
    assert.deepEqual(cubimalRaceFeature.save().out, []);
  });

  it('stops early at a platform edge, and leaving the street returns racing figures', () => {
    Date.now = () => clock;
    const { engine, data } = fakeEngine({ cubimalracespeed: '85', cubimalracesecs: '10' });
    engine.platforms = [{ x1: 0, y1: 500, x2: 450, y2: 500 }];
    cubimalRaceFeature.restore({}, engine);
    addItem(engine.inv, 'npc_cubimal_fox', 1);
    cubimalRaceFeature.runPackVerb('npc_cubimal_fox', 'cubimal_race', engine);
    clock += 2000;
    cubimalRaceFeature.onTick(16, clock, engine);
    clock += 2000;
    cubimalRaceFeature.onTick(16, clock, engine);
    assert.equal(data.cubimalRaceState, 'stopped');
    assert.equal(data.cubimalRacePlanks, '1.5');
    cubimalRaceFeature.onStreetClear(engine);
    assert.equal(countItem(engine.inv, 'npc_cubimal_fox'), 1);
  });

  it('a reload mid-race puts the figure back in the pack and keeps names', () => {
    const { engine } = fakeEngine();
    cubimalRaceFeature.restore({ names: { npc_cubimal_chick: 'Sprocket', apple: 'x' }, out: ['npc_cubimal_chick', 'apple'] }, engine);
    assert.equal(countItem(engine.inv, 'npc_cubimal_chick'), 1);
    assert.equal(countItem(engine.inv, 'apple'), 0);
    assert.deepEqual(cubimalRaceFeature.save().names, { npc_cubimal_chick: 'Sprocket' });
  });

  it('31 figures racing at once earn The Swarm', () => {
    Date.now = () => clock;
    const { engine, log } = fakeEngine();
    cubimalRaceFeature.restore({}, engine);
    const figures = ALL.slice(0, 31);
    for (const id of figures) addItem(engine.inv, id, 1);
    for (const id of figures) cubimalRaceFeature.runPackVerb(id, 'cubimal_race', engine);
    clock += 2000;
    cubimalRaceFeature.onTick(16, clock, engine);
    assert.ok(log.includes(`grant:${CUBIMAL_RACE.swarmAchievement}`));
    cubimalRaceFeature.onStreetClear(engine);
    for (const id of figures) assert.equal(countItem(engine.inv, id), 1, id);
  });

  it('set free: the conversation, the figure leaves the pack, says goodbye, and is paid at 2.5 s', () => {
    Date.now = () => clock;
    const { engine, log } = fakeEngine({ cubimalfreeroll: '0.7' });
    cubimalRaceFeature.restore({ names: { npc_cubimal_chick: 'Sprocket' } }, engine);
    addItem(engine.inv, 'npc_cubimal_chick', 1);
    const calls = [];
    const done = (extra) => {
      calls.push(extra);
      const pc = { xp: 0, imagination: 0 };
      return setCubimalFree(engine.inv, pc, 'npc_cubimal_chick', extra.responseRoll);
    };
    assert.equal(cubimalRaceFeature.confirmCubimalFree('npc_cubimal_rook', engine, done), null);
    assert.equal(cubimalRaceFeature.confirmCubimalFree('npc_cubimal_chick', engine, done), true);
    assert.equal(engine.dialogue.title, 'Sprocket');
    assert.equal(engine.dialogue.kicker, 'Chick Cubimal');
    assert.equal(engine.dialogue.beats[0].text, "Really, you want to set me free? I'll give you 400 Imagination.");
    assert.equal(engine.dialogue.primaryLabel, "Yes, go on, you're free now!");
    assert.equal(engine.dialogue.cancelLabel, 'No, I love you too much.');
    engine.dialogue.onComplete();
    assert.equal(countItem(engine.inv, 'npc_cubimal_chick'), 0);
    assert.deepEqual(cubimalRaceFeature.save().out, ['npc_cubimal_chick']);
    clock += 300;
    cubimalRaceFeature.onTick(16, clock, engine);
    assert.ok(log.includes(`say:${CUBIMAL_FREE_RESPONSES[3]}`));
    assert.equal(calls.length, 0);
    clock += 2200;
    cubimalRaceFeature.onTick(16, clock, engine);
    assert.ok(log.includes('sound:SPINACHJUMP'));
    assert.deepEqual(calls, [{ responseRoll: 0.7 }]);
    assert.equal(countItem(engine.inv, 'npc_cubimal_chick'), 0);
    assert.deepEqual(cubimalRaceFeature.save(), { names: {}, out: [] });
    clock += 1500;
    cubimalRaceFeature.onTick(16, clock, engine);
  });
});
