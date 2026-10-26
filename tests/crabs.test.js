/**
 * World crabs (register G154): js/crabs.js and features/crabs-feature.js.
 *
 * Sources: glitch-GameServerJS items/npc_crab.js (verbs, onPlayerCollision,
 * onConversation, blockListenCallback, blockPlayCallback, setHitBox,
 * npc_walkable roam), achievements/make_a_crab_happy.js,
 * items/crabato_juice.js, items/crabphones.js, items/catalog_buffs.js
 * crab_state_of_mind, and the archived location objects in
 * streets/mnt/stos/location_data.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CRAB_COPY,
  CRAB_HITBOX,
  CRAB_INSTANCE_ONLY,
  CRAB_ITEMS,
  CRAB_LISTEN_SEC,
  CRAB_MAX_BLOCKS,
  CRAB_OFFER_TIMEOUT_MS,
  CRAB_PLACEMENT_KEY,
  CRAB_STREETS,
  CRAB_WALK,
  CRABATO_JUICE_USE,
  canHugToday,
  crabCountFor,
  crabHearBlock,
  crabHugTooltip,
  crabPlacementGroups,
  crabRoamTarget,
  crabSettle,
  SOLO_KEEP_REPEATED_BLOCK,
  keepsRepeatedBlock,
  crabVerb,
  crabVerbMessage,
  crabVerbs,
  crabWalkSpeed,
  crabWantsMusic,
  hasFlatteredToday,
  ignoreToday,
  inCrabHitBox,
  musicblocksInPack,
  normalizeCrabMemory,
  playToday,
} from '../public/js/crabs.js';
import { MUSICBLOCK_CATALOG } from '../public/js/musicblocks.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const LOCATIONS = join(ROOT, '../streets/mnt/stos/location_data');
const GSJS = join(ROOT, '../glitch-GameServerJS');
const CRAB_JS = join(GSJS, 'items/npc_crab.js');

const BLOCKS = Object.keys(MUSICBLOCK_CATALOG);

/** A crab that heard the first n catalog tunes, one a minute, oldest first. */
function seeded(n) {
  const mem = normalizeCrabMemory();
  BLOCKS.slice(0, n).forEach((id, i) => {
    mem.blocksPlayed[id] = 1_000_000 + i * 60_000;
  });
  return mem;
}

describe('crab placement', () => {
  it('lists the eight archived crab streets, each in the street index', () => {
    assert.equal(CRAB_STREETS.length, 8);
    const index = JSON.parse(readFileSync(join(PUBLIC, 'assets/streets/index.json'), 'utf8')).streets;
    for (const row of CRAB_STREETS) {
      assert.ok(index[row.tsid], `${row.tsid} is an imported street`);
      assert.equal(index[row.tsid].label, row.label);
      assert.equal(row.sourceTsid, `L${row.tsid.slice(1)}`);
    }
  });

  it('matches the Crab objrefs in the location dump (eight streets plus the Vision Quest copy)', { skip: !existsSync(LOCATIONS) }, () => {
    const found = [];
    for (const file of readdirSync(LOCATIONS)) {
      if (!file.endsWith('.xml')) continue;
      const xml = readFileSync(join(LOCATIONS, file), 'utf8');
      const items = xml.match(/<objrefs id="items">([\s\S]*?)<\/objrefs>/)?.[1] || '';
      const n = [...items.matchAll(/<objref\b[^>]*\blabel="Crab"/g)].length;
      if (n) found.push([file.slice(0, -4), n]);
    }
    const expected = [...CRAB_STREETS.map((row) => row.sourceTsid), CRAB_INSTANCE_ONLY.sourceTsid].sort();
    assert.deepEqual(found.map(([tsid]) => tsid).sort(), expected);
    for (const [, n] of found) assert.equal(n, 1);
  });

  it('keeps the Institute of Ocular Testing crab to the Vision Quest room', () => {
    assert.equal(crabCountFor(CRAB_INSTANCE_ONLY.tsid), 0);
    const vq = readFileSync(join(PUBLIC, 'js/quest-rooms/vision-quest.js'), 'utf8');
    assert.match(vq, /STREET = 'GNV1T7PCUM53T25'/);
    assert.match(vq, /npc_crab/);
  });

  it('asks the shared planner for one spot on a crab street, by G or L tsid', () => {
    assert.deepEqual(crabPlacementGroups('GUVNNQQ9AOJ253J'), [{ key: CRAB_PLACEMENT_KEY, count: 1, clearance: 120 }]);
    assert.equal(crabCountFor('LUVNNQQ9AOJ253J'), 1);
    assert.deepEqual(crabPlacementGroups('GA5101HF7F429V5'), []);
    assert.deepEqual(crabPlacementGroups(''), []);
  });
});

describe('blockListenCallback', () => {
  it('pays 10 iMG and 25 currants per remembered tune, plus 100 each, for a tune it never heard (5 s)', () => {
    const empty = normalizeCrabMemory();
    const first = crabHearBlock(empty, BLOCKS[0], 10);
    assert.equal(first.outcome, 'fresh');
    assert.equal(first.reply, "Ooooh. I've never heard this one before. Here's a little something by way of appreciation.");
    assert.deepEqual(first.rewards, { xp: 100, currants: 100 });
    assert.equal(first.delaySec, 5);
    assert.equal(first.state, 'like_on');
    const mem = seeded(3);
    const fourth = crabHearBlock(mem, BLOCKS[3], 9_999_999);
    assert.deepEqual(fourth.rewards, { xp: 130, currants: 175 });
    assert.equal(Object.keys(mem.blocksPlayed).length, 4);
  });

  it('hates the tune it heard last: no reward, dislike, 3 s', () => {
    const mem = seeded(3);
    const heard = crabHearBlock(mem, BLOCKS[2], 9_999_999);
    assert.equal(heard.outcome, 'repeat');
    assert.equal(heard.reply, 'Damn! I just heard this one! Argh!!!');
    assert.deepEqual(heard.rewards, {});
    assert.equal(heard.state, 'dislike_on');
    assert.equal(heard.settleState, 'dislike_off');
    assert.equal(heard.delaySec, 3);
  });

  it('pays 10 iMG / 25 currants for each tune played since, for an older tune (3 s)', () => {
    const mem = seeded(5);
    // BLOCKS[1]: three tunes (2, 3, 4) since; queue 5 -> (5 - 3) = 2.
    const heard = crabHearBlock(mem, BLOCKS[1], 9_999_999);
    assert.equal(heard.outcome, 'liked');
    assert.equal(heard.reply, "Huh, yeah. This is not a bad little number. Here's something for you.");
    assert.deepEqual(heard.rewards, { xp: 20, currants: 50 });
    assert.equal(heard.delaySec, 3);
  });

  it('is happy with its least recent tune once it remembers at least 24 (max_blocks 25 - 1)', () => {
    assert.equal(CRAB_MAX_BLOCKS, 25);
    const mem = seeded(24);
    const heard = crabHearBlock(mem, BLOCKS[0], 9_999_999);
    assert.equal(heard.outcome, 'happy');
    assert.equal(heard.achievement, 'make_a_crab_happy');
    assert.equal(heard.reply, "Wow! I haven't heard this in forever. Love it! Thank you - take this gift!");
    assert.deepEqual(heard.rewards, { mood: 99999, energy: 99999, xp: 1000, currants: 2000 });
  });

  it('is only mildly pleased with its oldest tune when it remembers 23', () => {
    const heard = crabHearBlock(seeded(23), BLOCKS[0], 9_999_999);
    assert.equal(heard.outcome, 'liked');
    assert.deepEqual(heard.rewards, { xp: 10, currants: 25 });
  });

  it('is not happy with the second-oldest tune of 27', () => {
    const heard = crabHearBlock(seeded(27), BLOCKS[1], 9_999_999);
    assert.equal(heard.outcome, 'liked');
    assert.deepEqual(heard.rewards, { xp: 20, currants: 50 });
  });
});

describe('blockPlayCallback', () => {
  it('solo: refuses a repeat with the source line but keeps the block, still 20 mood in a Crab State of Mind', () => {
    assert.equal(SOLO_KEEP_REPEATED_BLOCK, true);
    const repeat = crabHearBlock(seeded(2), BLOCKS[1], 9_999_999);
    assert.equal(repeat.reply, 'Damn! I just heard this one! Argh!!!');
    assert.equal(repeat.state, 'dislike_on');
    assert.deepEqual(crabSettle(repeat), { rewards: {}, moodLoss: 0, destroyBlock: null, removeCrabphones: 1 });
    assert.deepEqual(crabSettle(repeat, { crabStateOfMind: true }), { rewards: {}, moodLoss: 20, destroyBlock: null, removeCrabphones: 1 });
  });

  it('with the flag off, takes the disliked block as the source does (npc_crab.js:530)', () => {
    const repeat = crabHearBlock(seeded(2), BLOCKS[1], 9_999_999);
    assert.deepEqual(crabSettle(repeat, { keepRepeatedBlock: false }), { rewards: {}, moodLoss: 0, destroyBlock: BLOCKS[1], removeCrabphones: 1 });
    assert.equal(crabSettle(repeat, { crabStateOfMind: true, keepRepeatedBlock: false }).moodLoss, 20);
  });

  it('multiplayer takes the repeated block, solo keeps it (Austin 2026-10-26, G196)', () => {
    assert.equal(keepsRepeatedBlock('multiplayer'), false);
    assert.equal(keepsRepeatedBlock('solo'), true);
    assert.equal(keepsRepeatedBlock(undefined), true);
    const src = readFileSync(join(PUBLIC, 'js/features/crabs-feature.js'), 'utf8');
    assert.match(src, /keepRepeatedBlock: keepsRepeatedBlock\(engine\.mode\)/);
  });

  it('doubles every liked reward in a Crab State of Mind', () => {
    const happy = crabHearBlock(seeded(24), BLOCKS[0], 9_999_999);
    assert.deepEqual(crabSettle(happy, { crabStateOfMind: true }).rewards, { mood: 199998, energy: 199998, xp: 2000, currants: 4000 });
    const fresh = crabHearBlock(normalizeCrabMemory(), BLOCKS[0], 1);
    const settled = crabSettle(fresh);
    assert.deepEqual(settled.rewards, { xp: 100, currants: 100 });
    assert.equal(settled.destroyBlock, null);
  });
});

describe('the call-out', () => {
  const inv = { [BLOCKS[0]]: 1, apple: 3 };

  it('asks once a game day, not after Never mind, and only with a Musicblock', () => {
    const mem = normalizeCrabMemory();
    assert.deepEqual(crabWantsMusic(mem, { inv, dayKey: 'd1' }), { ok: true, reason: 'ask' });
    assert.equal(crabWantsMusic(mem, { inv: { apple: 1 }, dayKey: 'd1' }).reason, 'no_blocks');
    assert.equal(crabWantsMusic(mem, { inv, dayKey: 'd1', offering: true }).reason, 'offering');
    playToday(mem, 'd1');
    assert.equal(crabWantsMusic(mem, { inv, dayKey: 'd1' }).reason, 'played_today');
    assert.equal(crabWantsMusic(mem, { inv, dayKey: 'd2' }).ok, true);
    ignoreToday(mem, 'd2');
    assert.equal(crabWantsMusic(mem, { inv, dayKey: 'd2' }).reason, 'ignored_today');
    assert.equal(crabWantsMusic(mem, { inv, dayKey: 'd3' }).ok, true);
  });

  it('lists the carried Musicblocks by label', () => {
    assert.deepEqual(musicblocksInPack({ musicblock_d_red_01: 2, musicblock_d_green_02: 1 }), [
      { classTsid: 'musicblock_d_green_02', label: 'Musicblock DG-2' },
      { classTsid: 'musicblock_d_red_01', label: 'Musicblock DR-1' },
    ]);
  });

  it('uses the 500x200 hit box, the 30 s timeout and the 4 s listen', () => {
    assert.deepEqual(CRAB_HITBOX, { w: 500, h: 200 });
    assert.equal(CRAB_OFFER_TIMEOUT_MS, 30_000);
    assert.equal(CRAB_LISTEN_SEC, 4);
    assert.equal(inCrabHitBox({ x: 1000, y: 500 }, { x: 1250, y: 300 }), true);
    assert.equal(inCrabHitBox({ x: 1000, y: 500 }, { x: 1251, y: 500 }), false);
    assert.equal(inCrabHitBox({ x: 1000, y: 500 }, { x: 1000, y: 299 }), false);
  });
});

describe('crab verbs', () => {
  it('flatter: +1 mood, -1 energy, then hug once a day for a Crabato Juice', () => {
    const mem = normalizeCrabMemory();
    assert.equal(crabHugTooltip(mem, 'd1'), 'Better to butter it up first');
    const early = crabVerb(mem, 'hug', 'd1');
    assert.equal(early.failed, true);
    assert.equal(early.energy, -2);
    assert.equal(early.state, 'dislike_off');
    assert.equal(crabVerbMessage(early), "You tried to hug a Crab. Hey, hey, hey. Keep your claws to yourself. If you want to get friendly, try saying something friendly, why don't you.");
    const flatter = crabVerb(mem, 'flatter', 'd1');
    assert.equal(flatter.mood, 1);
    assert.equal(flatter.energy, -1);
    assert.equal(flatter.state, 'like_off');
    assert.match(crabVerbMessage(flatter), /^You flattered a Crab\. You know how to talk to a crab\./);
    assert.equal(hasFlatteredToday(mem, 'd1'), true);
    assert.equal(crabHugTooltip(mem, 'd1'), 'This crab is ripe for a hug');
    const hug = crabVerb(mem, 'hug', 'd1');
    assert.equal(hug.failed, false);
    assert.deepEqual(hug.items, { crabato_juice: 1 });
    assert.equal(canHugToday(mem, 'd1'), false);
    assert.equal(crabHugTooltip(mem, 'd1'), 'Over over-hugging');
    const again = crabVerb(mem, 'hug', 'd1');
    assert.equal(again.failed, true);
    assert.equal(again.energy, -2);
    assert.match(again.msg, /^Now you're being pushy\./);
    // A new game day starts both over.
    assert.equal(crabHugTooltip(mem, 'd2'), 'Better to butter it up first');
  });

  it('pinch and insult each cost 2 mood; only pinch makes the crab wince', () => {
    const mem = normalizeCrabMemory();
    const pinch = crabVerb(mem, 'pinch', 'd1');
    assert.equal(pinch.mood, -2);
    assert.equal(pinch.state, 'dislike_off');
    const insult = crabVerb(mem, 'insult', 'd1');
    assert.equal(insult.mood, -2);
    assert.equal(insult.state, null);
    assert.equal(crabVerbMessage(insult), "You insulted a Crab. Don't you know you can catch more crabs with honey than with vinegar? Crabs hate vinegar.");
    assert.deepEqual(crabVerbs(mem, 'd1').map((v) => v.label), ['flatter', 'hug', 'insult', 'pinch']);
  });
});

describe('roaming', () => {
  it('walks 250 or 400 px in go_dir, 100 px inside the street', () => {
    assert.deepEqual(crabRoamTarget(1000, 'left', { l: 0, r: 6000 }, () => 0), { distance: -400, x: 600 });
    assert.deepEqual(crabRoamTarget(1000, 'right', { l: 0, r: 6000 }, () => 0.99), { distance: 400, x: 1400 });
    assert.deepEqual(crabRoamTarget(300, 'left', { l: 0, r: 6000 }, () => 0), { distance: -200, x: 100 });
    assert.equal(crabRoamTarget(100, 'left', { l: 0, r: 6000 }, () => 0).distance, 0);
    assert.equal(crabWalkSpeed(() => 0), 50);
    assert.equal(crabWalkSpeed(() => 0.999), 55);
    assert.equal(CRAB_WALK.arriveWaitMs, 10_000);
  });
});

describe('source copy and data', () => {
  it('quotes items/npc_crab.js', { skip: !existsSync(CRAB_JS) }, () => {
    const src = readFileSync(CRAB_JS, 'utf8').replace(/\\'/g, "'");
    for (const [key, text] of Object.entries(CRAB_COPY)) {
      if (key === 'insultTooltip') continue;
      const probe = key === 'offer' ? 'I want to listen to some tunes! What do you have for me?' : text;
      assert.ok(src.includes(probe), `${key} is in npc_crab.js`);
    }
    assert.match(src, /var max_blocks = 25;/);
    assert.match(src, /apiSetHitBox\(500, 200\)/);
    assert.match(src, /apiSetTimer\('timeoutRequest', 30000\)/);
    assert.match(src, /'xp' : 10 \* queue_size \+ 100,/);
    assert.match(src, /'currants': 25 \* queue_size \+ 100,/);
    assert.match(src, /mood_loss = pc\.metabolics_lose_mood\(20\)/);
  });

  it('ships Crabato Juice (drink_mood 20) and the CrabPod Headphones', { skip: !existsSync(GSJS) }, () => {
    const juice = readFileSync(join(GSJS, 'items/crabato_juice.js'), 'utf8');
    assert.match(juice, /"drink_mood"\s*: "20"/);
    assert.match(juice, /var stackmax = 24;/);
    assert.match(juice, /var base_cost = 50;/);
    assert.match(juice, new RegExp(CRAB_ITEMS.crabato_juice.desc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.equal(CRABATO_JUICE_USE.mood, 20);
    const phones = readFileSync(join(GSJS, 'items/crabphones.js'), 'utf8');
    assert.match(phones, /var label = "CrabPod Headphones";/);
    assert.ok(phones.includes(CRAB_ITEMS.crabphones.desc));
  });

  it('has the art, icons, buff, badge and feature registration', () => {
    for (const s of ['idle1', 'idle2', 'walk', 'listen', 'like_on', 'like_off', 'dislike_on', 'dislike_off']) {
      assert.ok(existsSync(join(PUBLIC, `assets/sprites/crabs/npc_crab_${s}.webp`)), s);
    }
    assert.ok(existsSync(join(PUBLIC, 'assets/sprites/icons/crabato_juice.png')));
    assert.ok(existsSync(join(PUBLIC, 'assets/sprites/icons/crabphones.png')));
    const buffs = JSON.parse(readFileSync(join(PUBLIC, 'assets/content/buffs.json'), 'utf8'));
    const som = buffs.crab_state_of_mind || buffs.buffs?.crab_state_of_mind;
    assert.equal(som.duration, 30);
    const badges = JSON.parse(readFileSync(join(PUBLIC, 'assets/content/achievements.json'), 'utf8'));
    assert.deepEqual(badges.make_a_crab_happy.conditions, []);
    assert.equal(badges.make_a_crab_happy.rewards.xp, 800);
    assert.ok(existsSync(join(PUBLIC, 'assets/badges/make_a_crab_happy.png')));
    const index = readFileSync(join(PUBLIC, 'js/features/index.js'), 'utf8');
    assert.match(index, /crabs-feature\.js/);
  });
});
