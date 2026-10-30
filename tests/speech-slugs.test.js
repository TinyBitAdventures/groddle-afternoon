/**
 * Reward slugs under a speech bubble (js/speech-slugs.js) and the verb
 * answers that carry them (js/verb-responses.js, content.js runVerb).
 * Run: node --test tests/speech-slugs.test.js
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SLUG_ANIMATION,
  SLUG_ICON_SIZES,
  SLUG_LAYOUT,
  SLUG_ORDER,
  SLUG_STYLES,
  drawSlugIcon,
  formatRawSlugs,
  formatSlugList,
  layoutSlugRow,
  slugBox,
  slugNumber,
  slugSign,
  slugsFromEffects,
  speechSlugList,
} from '../public/js/speech-slugs.js?v=g412-1';
import {
  VERB_RESPONSE_MS,
  animalResponseKey,
  responsePool,
  rockResponseKey,
  trantCareResponseKey,
  verbResponse,
} from '../public/js/verb-responses.js?v=g414-1';
import { VERB_RESPONSE_POOLS } from '../public/js/verb-responses-data.js?v=g414-1';
import { buildVerbResponses, render } from '../tools/build-verb-responses.mjs';
import { runVerb } from '../public/content.js?v=g454-1';
import { createAnimalState } from '../public/js/animals.js?v=g454-1';
import { createToolConditionState } from '../public/js/tools.js?v=woodcutting-test-8';
import { setTrantTables, createTrantState } from '../public/js/trants.js?v=trant-harvest-2';
import { createMineRock } from '../public/js/mining.js?v=g403-1';
import { createInventory } from '../public/js/inventory.js?v=catalog-unified-7';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLIENT = join(ROOT, '..', 'glitch-client');
const GSJS = join(ROOT, '..', 'glitch-GameServerJS');
const HAVE_CLIENT = existsSync(join(CLIENT, 'com/tinyspeck/engine/view/ui/Slug.as'));
const HAVE_GSJS = existsSync(join(GSJS, 'items/npc_piggy.js'));
const client = (rel) => readFileSync(join(CLIENT, rel), 'utf8');
const read = (rel) => readFileSync(join(ROOT, 'public', rel), 'utf8');

/** A Pixi Graphics stand-in that records every point drawn. */
function recorder() {
  const pts = [];
  const g = new Proxy({}, {
    get(_t, name) {
      if (name === 'pts') return pts;
      return (...args) => {
        if (name === 'poly') for (let i = 0; i < args[0].length; i += 2) pts.push([args[0][i], args[0][i + 1]]);
        else if (name === 'circle' || name === 'arc') pts.push([args[0] - args[2], args[1] - args[2]], [args[0] + args[2], args[1] + args[2]]);
        else if (name === 'rect' || name === 'roundRect') pts.push([args[0], args[1]], [args[0] + args[2], args[1] + args[3]]);
        else if (name === 'moveTo' || name === 'lineTo') pts.push([args[0], args[1]]);
        return g;
      };
    },
  });
  return g;
}

describe('slug row: which keys show, their signs and order', () => {
  it('orders iMG, energy, mood, currants, favor as the client means to (SortTools.as 96)', () => {
    const list = speechSlugList({ favor: 5, mood: 4, currants: 20, energy: 3, xp: 7 });
    assert.deepEqual(list.map((s) => s.type), ['imagination', 'energy', 'mood', 'currants', 'favor']);
    assert.deepEqual(list.map((s) => s.amount), [7, -3, 4, 20, 5]);
    assert.equal(formatSlugList(list), 'imagination:+7,energy:-3,mood:+4,currants:+20,favor:+5');
    assert.deepEqual(SLUG_ORDER.slice(2), ['energy', 'mood', 'currants', 'favor']);
  });

  it('reads energy as spent, energyGain as gained, and drops zeros (Slug.as 118)', () => {
    assert.deepEqual(speechSlugList({ energy: 5 }), [{ type: 'energy', amount: -5 }]);
    assert.deepEqual(speechSlugList({ energyGain: 62, mood: 30 }), [{ type: 'energy', amount: 62 }, { type: 'mood', amount: 30 }]);
    assert.deepEqual(speechSlugList({ mood: 0, energy: 0, xp: 0 }), []);
    assert.deepEqual(speechSlugList({ moodLoss: 2 }), [{ type: 'mood', amount: -2 }]);
    assert.deepEqual(speechSlugList({ currants: -50 }), [{ type: 'currants', amount: -50 }]);
    assert.deepEqual(speechSlugList(null), []);
  });

  it('gives each favor entry its own slug, as Rewards.fromAnonymous does', () => {
    const list = speechSlugList({ favor: [{ giant: 'spriggan', points: 4 }, { giant: 'mab', points: 0 }, { giant: 'pot', points: 2 }] });
    assert.deepEqual(list, [{ type: 'favor', amount: 4, giant: 'spriggan' }, { type: 'favor', amount: 2, giant: 'pot' }]);
    assert.equal(formatRawSlugs({ xp: 3, favor: [{ giant: 'pot', points: 2 }] }), 'xp=3,favor=pot:2');
  });

  it('signs and numbers as the client prints them (Slug.as 134-135, 161-162)', () => {
    assert.equal(slugSign(7), '+');
    assert.equal(slugSign(-3), '-');
    assert.equal(slugNumber(-1200), '1,200');
  });

  it('turns signed verb effects into bubble slugs, never items', () => {
    assert.deepEqual(slugsFromEffects({ energy: -2, mood: 3, img: 4, xp: 4, items: { cherry: 3 } }), { xp: 4, energy: 2, mood: 3 });
    assert.deepEqual(slugsFromEffects({ energy: 60, mood: -1 }), { energyGain: 60, moodLoss: 1 });
    assert.deepEqual(slugsFromEffects({ currants: 25, favor: [{ giant: 'grendaline', points: 40 }] }), { currants: 25, favor: [{ giant: 'grendaline', points: 40 }] });
    assert.equal(slugsFromEffects({ energy: 0, mood: 0, img: 0, items: { meat: 2 } }), null);
  });

  it('lays a slug out as sign, number, icon, 21 px tall, the energy slug squarer on the right', () => {
    const mood = slugBox('mood', 7, 10);
    assert.equal(mood.height, 21);
    assert.equal(mood.signX, 5);
    assert.equal(mood.numberX, 14);
    assert.equal(mood.iconX, 28);
    assert.equal(mood.iconY, 2);
    assert.equal(mood.width, 28 + 17 + 2);
    assert.equal(mood.rightRadius, 12);
    assert.equal(slugBox('energy', 7, 10).rightRadius, 4);
    const row = layoutSlugRow([50, 50, 50], 120);
    assert.deepEqual(row.at, [{ x: 0, y: 0 }, { x: 54, y: 0 }, { x: 0, y: 25 }]);
    assert.equal(row.height, 46);
  });

  it('keeps every redrawn icon inside its PNG size', () => {
    for (const [type, [w, h]] of Object.entries(SLUG_ICON_SIZES)) {
      for (const neg of [false, true]) {
        const g = recorder();
        drawSlugIcon(g, type, neg);
        assert.ok(g.pts.length > 4, type);
        for (const [x, y] of g.pts) {
          assert.ok(x >= -0.5 && x <= w + 0.5 && y >= -0.5 && y <= h + 0.5, `${type} ${neg} ${x},${y}`);
        }
      }
    }
  });

  it('matches the client: fills, sizes, animation timings', { skip: !HAVE_CLIENT && 'glitch-client not present' }, () => {
    const slug = client('com/tinyspeck/engine/view/ui/Slug.as');
    for (const [type, style] of Object.entries(SLUG_STYLES)) {
      const hex = (n) => `0x${n.toString(16).padStart(6, '0')}`;
      assert.match(slug, new RegExp(`${type}_pos_bg_color:uint = ${hex(style.pos)};`), type);
      assert.match(slug, new RegExp(`${type}_neg_bg_color:uint = ${hex(style.neg)};`), type);
    }
    assert.match(slug, /HEIGHT:uint = 21;/);
    assert.match(slug, /CORNER_RADIUS:uint = 12;/);
    assert.match(slug, /ENERGY_CORNER_RADIUS:uint = 4;/);
    assert.match(slug, /border_width:uint = 2;/);
    assert.equal(SLUG_LAYOUT.borderWidth, 2);
    const anim = client('com/tinyspeck/engine/port/SlugAnimator.as');
    assert.match(anim, /animate\(slug, \.4\);/);
    assert.match(anim, /scaleX:3, scaleY:3, time:\.4, delay:start_delay/);
    assert.match(anim, /scaleX:\.4, scaleY:\.4, x:end_point\.x, y:end_point\.y, delay:\.5 \+ start_delay, time:\.3/);
    assert.deepEqual([SLUG_ANIMATION.firstDelayMs, SLUG_ANIMATION.growMs, SLUG_ANIMATION.flyAtMs, SLUG_ANIMATION.flyMs], [400, 400, 500, 300]);
    assert.equal(SLUG_ANIMATION.growScale, 3);
    assert.equal(SLUG_ANIMATION.endScale, 0.4);
    const bubbles = client('com/tinyspeck/engine/view/itemstack/LisChatBubbleManager.as');
    assert.match(bubbles, /rewards\[int\(i\)\]\.type != Reward\.ITEMS && rewards\[int\(i\)\]\.amount != 0/);
    assert.match(bubbles, /var padd:int = 4;/);
    assert.equal(SLUG_LAYOUT.rowGap, 4);
    // The icon sizes are the client PNGs' (TSEngineAssets/src/assets/graphics/slug_*.png).
    const png = (name) => readFileSync(join(CLIENT, 'TSEngineAssets/src/assets/graphics', name));
    for (const [type, [w, h]] of Object.entries(SLUG_ICON_SIZES)) {
      const b = png(`slug_${type}_pos.png`);
      assert.deepEqual([b.readUInt32BE(16), b.readUInt32BE(20)], [w, h], type);
    }
  });

  it('draws slugs with icons in the bubble and keeps the QA attributes', () => {
    const game = read('game.js');
    assert.match(game, /const slugRow = speechSlugRow\(speech\.slugs, 256\);/);
    assert.match(game, /drawSlugIcon\(new PIXI\.Graphics\(\), slug\.type, neg\)/);
    assert.match(game, /app\.canvas\.dataset\.lastSpeechSlugs = formatRawSlugs\(speech\.slugs\);/);
    assert.match(game, /app\.canvas\.dataset\.lastSpeechSlugRow = slugRow \? formatSlugList\(slugRow\._slugList\) : '';/);
    assert.match(game, /if \(slugRow\) animateSpeechSlugs\(slugRow\);/);
    assert.match(game, /if \(slugRow\) app\.canvas\.dataset\.lastSlugBubble = `\$\{target\.classId \|\| ''\}\|\$\{app\.canvas\.dataset\.lastSpeechSlugRow\}`;/);
    assert.match(game, /if \(result\.ok && result\.effects && !\(spoke && result\.speech\?\.slugs\)\) \{/);
    assert.doesNotMatch(game, /\['energyGain', '\+', 'energy'/);
  });
});

describe('verb answers (GSJS responses) and the slugs they carry', () => {
  before(() => {
    setTrantTables(JSON.parse(readFileSync(join(ROOT, 'public/assets/content/trants.json'), 'utf8')));
  });

  it('the response data is current with GSJS', { skip: !HAVE_GSJS && 'glitch-GameServerJS not present' }, () => {
    const built = buildVerbResponses(GSJS);
    assert.equal(render(built), read('js/verb-responses-data.js'));
    assert.ok(VERB_RESPONSE_POOLS.npc_piggy.pet_ak1.includes('Respect the pot belly, dude!'));
    assert.equal(VERB_RESPONSE_POOLS.rock.mine_dullite.length, 10);
    const item = readFileSync(join(GSJS, 'items/item.js'), 'utf8');
    assert.match(item, /this\.sendBubble\(choice, 3500, pc, slugs\);/);
    assert.equal(VERB_RESPONSE_MS, 3500);
    assert.match(item, /if \(rewards\.xp\)\{\s*if \(!rewards\.imagination\) rewards\.imagination = 0;\s*rewards\.imagination \+= rewards\.xp;/);
  });

  it('picks keys by the source rules', () => {
    assert.equal(animalResponseKey('npc_piggy', 'pet', {}), 'pet_ak1');
    assert.equal(animalResponseKey('npc_piggy', 'pet', { learned: ['animalkinship_2'] }), 'pet_ak2_ak3');
    assert.equal(animalResponseKey('npc_piggy', 'nibble', { learned: ['animalkinship_5'], bonus: true }), 'nibble_bonus_ak3');
    assert.equal(animalResponseKey('npc_chicken', 'squeeze', { learned: ['animalkinship_1'] }), 'squeeze_ak1');
    assert.equal(animalResponseKey('npc_butterfly', 'milk', { learned: ['animalkinship_2'] }), 'milk_ak2_ak3_gibberish');
    assert.equal(animalResponseKey('npc_butterfly', 'milk', { learned: ['animalkinship_2'], achievements: ['butterfly_whisperer'] }), 'milk_ak2_ak3');
    assert.equal(animalResponseKey('npc_butterfly', 'massage', { achievements: ['butterfly_whisperer'], bonus: true }), 'massage_bonus_ak4');
    assert.equal(trantCareResponseKey('pet', {}), 'pet_na');
    assert.equal(trantCareResponseKey('water', { learned: ['light_green_thumb_1', 'light_green_thumb_2'] }), 'water_lgt2');
    assert.equal(rockResponseKey('beryl', 8), 'mine_max_beryl');
    assert.equal(rockResponseKey('dullite', 8), 'mine_dullite');
    assert.equal(rockResponseKey('sparkly', 3, { gem: 'gem_ruby' }), 'gem_drop_ruby');
    assert.equal(rockResponseKey('metal_rock', 3, { cleared: true }), 'metal_rock_disappeared');
    assert.ok(responsePool('rock_beryl_2', 'mine_beryl').length);
    for (const cls of Object.keys(VERB_RESPONSE_POOLS)) {
      for (const [key, pool] of Object.entries(VERB_RESPONSE_POOLS[cls])) assert.ok(pool.length, `${cls}.${key}`);
    }
    const r = verbResponse('npc_piggy', 'pet_ak1', { rng: () => 0, slugs: { mood: 1 } });
    assert.deepEqual(r, { speaker: '', key: 'pet_ak1', text: VERB_RESPONSE_POOLS.npc_piggy.pet_ak1[0], durationMs: 3500, slugs: { mood: 1 } });
  });

  it('a piggy pet answers with the energy, mood and iMG it actually moved', () => {
    const target = { classId: 'npc_piggy', state: {} };
    const pc = { energy: 100, mood: 40, imagination: 0, xp: 0 };
    const r = runVerb(target, 'pet', { pc, inv: {}, skills: { learned: ['animalkinship_2'] }, rng: () => 0.5, talkRng: () => 0 });
    assert.equal(r.ok, true);
    assert.equal(r.speech.key, 'pet_ak2_ak3');
    assert.equal(r.speech.text, VERB_RESPONSE_POOLS.npc_piggy.pet_ak2_ak3[0]);
    assert.deepEqual(r.speech.slugs, slugsFromEffects(r.effects));
    assert.equal(r.speech.slugs.energy, 100 - pc.energy);
    assert.equal(r.speech.slugs.mood, pc.mood - 40);
    assert.ok(r.speech.slugs.energy > 0 && r.speech.slugs.mood > 0);
    assert.ok(!r.msgs.includes('♥ oink'));
  });

  it('a butterfly milk answers with slugs, never the milk itself', () => {
    const target = { classId: 'npc_butterfly', state: createAnimalState('npc_butterfly') };
    const pc = { energy: 100, mood: 40, imagination: 0, xp: 0 };
    const inv = { butterfly_lotion: 1 };
    const tools = createToolConditionState();
    const skills = { learned: ['animalkinship_2'] };
    const massage = runVerb(target, 'massage', { pc, inv, tools, skills, rng: () => 0.5 });
    assert.match(massage.speech.key, /^massage_ak2_ak3_gibberish$/);
    const milk = runVerb(target, 'milk', { pc, inv, tools, skills, achievements: ['butterfly_whisperer'], rng: () => 0.5 });
    assert.equal(milk.ok, true);
    assert.equal(milk.speech.key, 'milk_ak2_ak3');
    assert.equal(milk.speech.slugs.items, undefined);
    assert.ok(milk.speech.slugs.energy > 0);
    assert.equal(inv.milk_butterfly, 2);
  });

  it('a fruit tree harvest ("Aa\'ight?") and a pet carry their slugs', () => {
    const tree = { classId: 'trant_fruit', state: createTrantState('trant_fruit', { maturity: 7, health: 8, fruitCount: 40 }) };
    const pc = { energy: 40, mood: 40, imagination: 0 };
    const r = runVerb(tree, 'harvest', { pc, inv: {}, learned: ['gardening_1', 'gardening_2'], rng: () => 0.99 });
    assert.equal(r.ok, true);
    assert.ok(r.speech.text);
    assert.deepEqual(r.speech.slugs, slugsFromEffects(r.effects));
    assert.ok(r.speech.slugs.energy > 0);
    const pet = runVerb(tree, 'pet', { pc, inv: {}, learned: [], rng: () => 0 });
    assert.equal(pet.ok, true);
    assert.equal(pet.speech.key, 'pet_na');
    assert.ok(VERB_RESPONSE_POOLS.trant_fruit.pet_na.includes(pet.speech.text));
    assert.deepEqual(pet.speech.slugs, slugsFromEffects(pet.effects));
  });

  it('a rock answers a swing with energy and iMG; talking has no slugs', () => {
    const rock = { classId: 'rock_dullite_1', state: { rock: createMineRock('rock_dullite_1') } };
    const pc = { energy: 100, mood: 50, imagination: 0, xp: 0 };
    const inv = createInventory({ pick: 1 });
    const r = runVerb(rock, 'mine', { pc, inv, learned: ['mining_1'], rng: () => 0 });
    assert.equal(r.ok, true);
    // include/mining.js 444-452: under 9 chunks mine_dullite, else mine_max_dullite.
    assert.match(r.speech.key, /^mine_(max_)?dullite$/);
    assert.ok(VERB_RESPONSE_POOLS.rock[r.speech.key].includes(r.speech.text));
    assert.equal(r.speech.slugs.energy, 100 - pc.energy);
    assert.ok(r.speech.slugs.xp > 0);
    const talk = runVerb({ classId: 'npc_piggy', state: {} }, 'talk_to', { pc, inv: {} });
    assert.equal(talk.speech?.slugs ?? null, null);
  });

  it('feeding a piggy says nothing with slugs (npc_piggy.js 676 sendResponse(\'feed\', pc))', () => {
    const content = read('content.js');
    const feed = content.slice(content.indexOf("if (classId === 'npc_piggy' && verbBase === 'feed')"), content.indexOf('// --- Chicken: Request incubation'));
    assert.doesNotMatch(feed, /slugsFromEffects/);
  });
});
