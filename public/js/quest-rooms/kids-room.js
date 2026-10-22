/**
 * Mr. Block's playroom (`kids_room`, template LIF149EVS2A22H1): Child's Play
 * (quests/letter_block_1.js) and Word Up (quests/letter_block_3.js).
 *
 * The same template hosts Four Letter Words (letter_block_2, game.js), so the
 * room matches that clean vector playroom and reuses its recovered blue
 * letter blocks (assets/sprites/quests/four-letter/letter-block-*.png, two
 * 139x197 frames). Mr. Block wears the red npc_letterblock_variant_<L> art
 * (two 121x117 frames, assets/sprites/quest-rooms/kids_room/mr-block-*.png),
 * hovering as in the source.
 *
 * Child's Play: onAccepted picks Mr. Block's letter from A B E M S T; walking
 * into him starts `blocks_request`; Give takes any pack item whose label
 * starts with that letter (npc_letterblock.js give: label.substring(0,1)),
 * sets `correct_letter_item` and he hands over the completion. With nothing
 * suitable, `no_items` re-embiggens you to go and find something.
 *
 * Word Up: `anagrams` (or `anagram_start` on Talk to) creates three blocks
 * showing M, S, B that each spin A, B, E, M, S, T; for three minutes every
 * new word from the 24-word list counts (callback_letterChanged checks after
 * each spin). doneSpelling picks the reply by count: <=2 spelling_fail (try
 * again), 3-9 done_spelling_1 (+200 iMG, 20 Friendly), 10-19
 * done_spelling_3 (+400, 40), 20+ done_spelling_5 (+800, 80); each then sets
 * `spell_words`, completing the quest (500 iMG, 500 currants, 250 mood).
 *
 * Both rooms carry the tea party between friend Bear and friend Thing
 * (callback_teaParty, exact lines and delays); the plush stand-ins are the
 * recovered Emotional Bear and a Yeti cubimal.
 */

import { applyRewards } from '../quests.js';
import { ITEM_CATALOG, isToolItem } from '../inventory.js?v=catalog-unified-3';

const W = 1150;
const H = 760;
const FLOOR = 620;
const BLOCK_ART = 'assets/sprites/quests/four-letter/letter-block-';
const ROOM_ART = 'assets/sprites/quest-rooms/kids_room/';

export const LETTERS = Object.freeze(['A', 'B', 'E', 'M', 'S', 'T']);
/** letter_block_3.js onAccepted valid_words (24, in source order). */
export const WORD_UP_WORDS = Object.freeze(['TEA', 'TAB', 'TAT', 'SET', 'SEA', 'SAT', 'MET', 'MAT', 'MAS', 'ETA', 'EMS', 'EAT', 'BET', 'BAT', 'BAM', 'ATE', 'ABS', 'BEE', 'TEE', 'SEE', 'BAA', 'EBB', 'MAB', 'ATM']);
export const SPELL_MS = 180_000;
/** callback_createBlocks: block_1..3 at x 0/150/300 showing M, S, B. */
export const START_LETTERS = Object.freeze(['M', 'S', 'B']);

/** letter_block.js nextLetter: the next of A,B,E,M,S,T, wrapping. */
export function nextLetter(letter) {
  const i = LETTERS.indexOf(letter);
  return LETTERS[(i + 1) % LETTERS.length];
}

/** doneSpelling tiers and the conversation bonus each pays. */
export function spellingTier(count) {
  if (count <= 2) return { id: 'fail', xp: 0, favor: 0 };
  if (count <= 9) return { id: 'done_spelling_1', xp: 200, favor: 20 };
  if (count <= 19) return { id: 'done_spelling_3', xp: 400, favor: 40 };
  return { id: 'done_spelling_5', xp: 800, favor: 80 };
}

/** Add a word to the run when it is valid and new (callback_letterChanged). */
export function recordWord(spelled, letters) {
  const word = letters.join('');
  if (!WORD_UP_WORDS.includes(word) || spelled.includes(word)) return null;
  spelled.push(word);
  return word;
}

/** Pack items Mr. Block will take: label starts with his letter (tools stay with you). */
export function giftable(inv, letter, catalog = ITEM_CATALOG) {
  const out = [];
  for (const [id, n] of Object.entries(inv || {})) {
    if (!(Number(n) > 0) || isToolItem(id)) continue;
    const label = catalog[id]?.label || id.replace(/_/g, ' ');
    if (label.slice(0, 1).toUpperCase() === letter) out.push({ id, label });
  }
  return out.sort((a, b) => a.label.localeCompare(b.label));
}

const DIALOG = {
  blocks_request(letter) {
    const ask = {
      A: ['Why, all my games are fun games! I need you to find me something that starts with the letter A for my collection of vocalic objects. Would you have anything of that nature about your person? Can you give me an apple? An airplane? Perhaps a captive aardvark?', 'Hm… let me check.'],
      B: ['Why, all my games are fun games! I need you to find me something that starts with the letter B for my collection of consonantal objects. Would you have anything of that nature about your person? Can you give me a banana? A balloon? Perhaps a small bazooka?', 'Maybe I can!'],
      E: ['Why, all my games are fun games! I need you to find me something that starts with the letter E for my collection of vocalic objects. Would you have anything of that nature about your person? Can you give me an egg? An earwig? Even a stately equestrian?', "I'm not sure!"],
      M: ['Why, all my games are fun games! I need you to find me something that starts with the letter M for my collection of consonantal objects. Would you have anything of that nature about your person? Can you give me a mangosteen? A mole? Possibly a pail of molten magma?', "It's possible…"],
      S: ['Why, all my games are fun games! I need you to find me something that starts with the letter S for my collection of consonantal objects. Would you have anything of that nature about your person? Can you give me a strawberry? A shrug? Maybe a slithering serpent?', 'Let me check my pack…'],
      T: ['Why, all my games are fun games! I need you to find me something that starts with the letter T for my collection of consonantal objects. Would you have anything of that nature about your person? Can you give me a tomato? a tomahawk? Just some miscellaneous tchotchke?', 'I might have something like that…'],
    }[letter];
    return [
      { text: 'Hello! Hello! Young person!', response: 'Me?' },
      { text: 'Yes, you. You have the look of a promising young abecedarian about you. Perhaps you would like to play a game?', response: 'Is it a fun game?' },
      { text: ask[0], response: ask[1] },
    ];
  },
  letter_match_explain: [{ text: "You see, I'm trying to start a collection of items that start with my particular letter of choice. If you could bring me one, I would be most grateful. Plus, I believe the entire exercise will be terrific fun!", response: 'OK' }],
  no_items: [
    { text: "Oh dear, you don't seem to have any items beginning with the correct letter, not one.", response: 'Sorry.' },
    { text: "No, it's fine. In fact, the game will be more fun this way! You're going to need to be re-embiggened to go find an item beginning with the correct letter.", response: 'Sounds like a plan.' },
    { text: 'You can talk to your Magic Rock whenever you please to return here. Please keep an eye out for an appropriately named item.', response: 'Will do.' },
  ],
  want_leave: [{ text: 'Oh, are you not having fun here? Would you prefer to leave?', response: 'Leave' }],
  want_leave_yes: [{ text: 'Well, if you decide to come back later, tell your Magic Rock and it will help you find your way.', response: 'Thanks.' }],
  anagrams: [
    { text: 'Hello! Hello! My friend, I am so glad to see you again. I have a game of utmost import, and you simply must assist me!', response: 'Well, OK!' },
    { text: 'The game is simple, but at the same time oh so difficult! From a pool of six different letters—A, B, E, M, S and T—you must make as many three letter words as you can within the space of three minutes.', response: 'Sounds simple enough.' },
    { text: 'Is it? Many have tried, only to face the embarrassment of crushing defeat.', response: "I'm certain I can do it." },
    { text: "Then I wish you luck, my young friend. I'm exceptionally excited about this one. All my hopes and dreams are riding on your shoulders.", response: 'Yeah, no pressure or anything.' },
    { text: 'Remember, you will only have three minutes to spell as many three letter words using only A, B, E, M, S and T. Are you ready to start now?', response: '' },
  ],
  anagrams_choices: [{ label: "Yes, I'm ready.", value: 'yes' }, { label: "No, I'm not ready.", value: 'no' }],
  anagrams_no: [{ text: 'Very well. Come talk to me when you feel you are ready.', response: 'OK' }],
  anagram_start: [{ text: 'Ah, are you ready to begin?', response: '' }],
  anagram_start_choices: [{ label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }],
  anagram_start_yes: [{ text: 'Then you have three minutes to spell as many words as you can with the letters A, B, E, M, S and T. Begin!', response: 'OK!' }],
  anagram_start_no: [{ text: "Hrmph. Take your time, then. It's better that you be prepared, after all.", response: 'Thanks!' }],
  done_spelling_1: [
    { text: 'Oh.', response: 'Was that not good?' },
    { text: 'No. That was… well, it was fine. You tried admirably against impossible odds.', response: 'Well, I did what I could.' },
    { text: '… Which is all that can be asked of anyone! As a reward, please accept 200 iMG and 20 favor with Friendly, the Giant of writing.', response: 'Gladly.' },
  ],
  done_spelling_3: [
    { text: 'Excellent work!', response: 'Thanks.' },
    { text: 'Yes, quite splendid indeed. As a reward, please accept 400 iMG and 40 favor with Friendly, the Giant of writing.', response: 'Gladly!' },
  ],
  done_spelling_5: [
    { text: 'Oh my.', response: 'Was that good?' },
    { text: 'Good? My young friend, that was simply magnificent. Breathtaking!', response: 'Aw, shucks.' },
    { text: 'For your outstanding accomplishments in the field of spelling, please accept 800 iMG and 80 favor with Friendly, the Giant of writing.', response: 'Gladly!' },
  ],
  spelling_fail: [
    { text: 'Hm…', response: "That wasn't very good, was it?" },
    { text: "Well, you are very young. Perhaps you don't know many words yet?", response: 'I can do better! I got distracted.' },
    { text: 'Distracted you say? Of course. Would you like to try again, then?', response: '' },
  ],
  spelling_fail_choices: [{ label: "Yes, I'm ready.", value: 'yes' }, { label: "No, I'd like to think about this.", value: 'no' }],
  spelling_fail_no: [{ text: 'Very well, please talk to me when you are ready to try again.', response: 'OK' }],
  anagram_explain: [{ text: "Yes, you'll need to make as many three-letter words as you possibly can using only the letters A, B, E, M, S and T. It's trickier than it sounds!", response: 'Gotcha.' }],
};

/** callback_teaParty lines: [speaker, text, delay s, bubble s]. */
const TEA_PARTY = {
  letter_block_1: [
    ['bear', 'This tea is delicious.', 0, 3],
    ['thing', 'Why, thank you. I try to make sure never to steep it for too long.', 3, 5],
    ['bear', 'You are a very gracious host.', 8, 3],
    ['thing', 'Yes, I am hosting a tea party.', 11, 3],
    ['bear', 'We are having fun.', 14, 3],
  ],
  letter_block_3: [
    ['bear', 'I have a confession, friend Bear.', 0, 3],
    ['thing', 'The tea party is a time of unburdening, friend. Let your confession be heard.', 3, 5],
    ['bear', 'Over the past several years, I feel I have lost my enthusiasm for the tea party.', 8, 6],
    ['thing', 'I also have a confession, friend Thing.', 14, 3],
    ['bear', 'It is unwise to trouble your soul with heavy thoughts.', 17, 5],
    ['thing', 'Over the past several years I too have lost my enthusiasm for the tea party.', 23, 6],
    ['bear', 'Let us be done with this ridiculous farce.', 29, 3],
    ['thing', 'The tea party is over.', 32, 3],
    ['bear', 'Please pass the sugar.', 37, 3],
  ],
};

const BLOCK_X = [430, 580, 730];
const MR_BLOCK = { x: 905, y: 512 };
const TEA_X = 205;

function drawPlayroom(PIXI, kit) {
  const root = kit.sceneRoot(PIXI, W, H);
  const room = new PIXI.Graphics();
  room.rect(0, 0, W, FLOOR).fill(0xf7f0d9);
  const colors = [0x72c8c8, 0xeba75f, 0xcf6179, 0x9bc761, 0x7aa9d1];
  for (let x = -70, i = 0; x < 1220; x += 165, i += 1) {
    room.roundRect(x, 40 + (i % 2) * 20, 96, 72, 30);
    room.circle(x + 26, 35 + (i % 2) * 20, 23);
    room.circle(x + 76, 35 + (i % 2) * 20, 23);
    room.fill({ color: colors[i % colors.length], alpha: 0.9 });
  }
  for (const x of [40, 960]) {
    room.roundRect(x, 155, 150, 300, 8).fill(0x9fe1e7).stroke({ width: 8, color: 0xffffff, alpha: 0.9 });
    room.moveTo(x + 75, 160);
    room.lineTo(x + 75, 450);
    room.moveTo(x + 5, 305);
    room.lineTo(x + 145, 305);
    room.stroke({ width: 5, color: 0xffffff, alpha: 0.85 });
  }
  room.rect(0, FLOOR, W, H - FLOOR).fill(0x8b5f42);
  room.rect(0, FLOOR - 16, W, 18).fill(0x6d4936);
  for (let y = 646; y < H; y += 28) {
    room.moveTo(0, y);
    room.lineTo(W, y);
  }
  for (let x = 0; x < W; x += 145) {
    room.moveTo(x, FLOOR);
    room.lineTo(x + 35, H);
  }
  room.stroke({ width: 2, color: 0xb88962, alpha: 0.45 });
  // Tea table, two little chairs and cups for friend Bear and friend Thing.
  room.roundRect(TEA_X - 110, 520, 220, 24, 9);
  room.rect(TEA_X - 80, 542, 20, 78);
  room.rect(TEA_X + 60, 542, 20, 78);
  room.roundRect(TEA_X - 190, 560, 64, 14, 5);
  room.rect(TEA_X - 186, 572, 10, 48);
  room.rect(TEA_X - 140, 572, 10, 48);
  room.rect(TEA_X - 190, 500, 10, 62);
  room.roundRect(TEA_X + 126, 560, 64, 14, 5);
  room.rect(TEA_X + 130, 572, 10, 48);
  room.rect(TEA_X + 176, 572, 10, 48);
  room.rect(TEA_X + 180, 500, 10, 62);
  room.fill(0x694b38);
  room.ellipse(TEA_X - 45, 514, 18, 8);
  room.ellipse(TEA_X + 45, 514, 18, 8);
  room.roundRect(TEA_X - 16, 488, 32, 28, 10);
  room.fill(0xf6f1df);
  room.circle(TEA_X - 45, 500, 10).fill(0xcd4f68);
  room.circle(TEA_X + 45, 500, 10).fill(0x79b8c7);
  root.addChild(room);
  root.addChild(kit.label(PIXI, "MR. BLOCK'S PLAYROOM", 580, 140, { size: 22, fill: 0x8d7357, alpha: 0.42, weight: '900' }));
  return root;
}

function blockTexture(PIXI, letter, frame = 0) {
  const base = PIXI.BaseTexture.from(`${BLOCK_ART}${letter}.png`);
  const make = () => new PIXI.Texture(base, new PIXI.Rectangle(frame * 139, 0, 139, 197));
  return base.valid ? make() : null;
}

function setBlockLetter(ctx, block, letter) {
  const { PIXI } = ctx;
  block.letter = letter;
  const url = `${BLOCK_ART}${letter}.png`;
  const tex = blockTexture(PIXI, letter);
  if (tex) block.sprite.texture = tex;
  else {
    const base = PIXI.BaseTexture.from(url);
    base.once('loaded', () => {
      if (block.letter === letter && !block.sprite.destroyed) block.sprite.texture = blockTexture(PIXI, letter);
    });
  }
  block.target.subtitle = `Shows ${letter}`;
}

function mrBlockSprite(ctx, letter) {
  const { PIXI } = ctx;
  const base = PIXI.BaseTexture.from(`${ROOM_ART}mr-block-${letter}.png`);
  const spr = new PIXI.Sprite(PIXI.Texture.EMPTY);
  const apply = () => { spr.texture = new PIXI.Texture(base, new PIXI.Rectangle(0, 0, 121, 117)); };
  if (base.valid) apply();
  else base.once('loaded', apply);
  spr.anchor.set(0.5, 1);
  spr.scale.set(1.15);
  return spr;
}

/* ------------------------------------------------------------------ */
/* Conversations                                                       */
/* ------------------------------------------------------------------ */

const talk = (ctx, beats, choices) => ctx.converse({ title: 'Mr. Block', kicker: ctx.def?.title || '', beats: beats.map((b) => ({ ...b })), choices });

async function blocksRequest(ctx) {
  ctx.data.talked = true;
  await talk(ctx, DIALOG.blocks_request(ctx.data.letter));
}

async function giveItem(ctx, preset) {
  const items = giftable(ctx.engine.inv, ctx.data.letter);
  if (!items.length) {
    await talk(ctx, DIALOG.no_items);
    ctx.leave();
    return false;
  }
  const choice = preset || await ctx.converse({
    title: 'Mr. Block',
    kicker: 'Give Mr. Block an item',
    text: `Give Mr. Block something that starts with ${ctx.data.letter}:`,
    choices: [...items.slice(0, 7).map((it) => ({ label: it.label, value: it.id })), { label: 'Never mind', value: '' }],
  });
  const item = items.find((it) => it.id === choice);
  if (!item) return false;
  ctx.take(item.id, 1);
  ctx.data.gave = item.id;
  ctx.activity(`You give Mr. Block your ${item.label}.`);
  ctx.progress('correct_letter_item');
  ctx.solve();
  ctx.sound('QUEST_COMPLETE', { volume: 0.4 });
  await ctx.turnIn();
  ctx.leave();
  return true;
}

async function wantLeave(ctx) {
  const answer = await talk(ctx, DIALOG.want_leave, [{ label: 'Leave', value: 'leave' }, { label: 'Stay', value: 'stay' }]);
  if (answer !== 'leave') return;
  await talk(ctx, DIALOG.want_leave_yes);
  ctx.leave();
}

async function anagrams(ctx) {
  ctx.data.talked = true;
  const answer = await talk(ctx, DIALOG.anagrams, DIALOG.anagrams_choices);
  if (answer === 'yes') createBlocks(ctx);
  else await talk(ctx, DIALOG.anagrams_no);
}

async function anagramStart(ctx) {
  const answer = await talk(ctx, DIALOG.anagram_start, DIALOG.anagram_start_choices);
  if (answer === 'yes') {
    await talk(ctx, DIALOG.anagram_start_yes);
    createBlocks(ctx);
  } else await talk(ctx, DIALOG.anagram_start_no);
}

/* ------------------------------------------------------------------ */
/* Word Up blocks                                                      */
/* ------------------------------------------------------------------ */

function createBlocks(ctx) {
  removeBlocks(ctx);
  const { PIXI } = ctx;
  ctx.data.spelled = [];
  ctx.data.blocks = START_LETTERS.map((letter, i) => {
    const spr = new PIXI.Sprite(PIXI.Texture.EMPTY);
    spr.anchor.set(0.5, 1);
    spr.scale.set(0.74);
    spr.x = BLOCK_X[i];
    spr.y = FLOOR;
    spr.zIndex = 45;
    const target = ctx.register({ classId: 'letter_block', label: `Letter Block ${i + 1}`, subtitle: `Shows ${letter}`, sprite: spr, qiBlock: i });
    const block = { sprite: spr, target, letter, spin: 0 };
    setBlockLetter(ctx, block, letter);
    return block;
  });
  ctx.data.spelling = true;
  ctx.data.spellEndsAt = Date.now() + SPELL_MS;
  // instances_schedule_exit_prompt('kids_room', 5*60): the room stays open 5 more minutes.
  const left = ctx.remaining();
  if (Number.isFinite(left) && left < 5 * 60_000) ctx.extend(5 * 60_000 - left);
  // move_avatar x 150 (the middle block), facing left.
  ctx.place(BLOCK_X[1], FLOOR);
  ctx.sound('QUEST_ACCEPT', { volume: 0.4 });
  drawBoard(ctx);
}

function removeBlocks(ctx) {
  for (const b of ctx.data.blocks || []) ctx.unregister(b.target);
  ctx.data.blocks = [];
}

export function spinBlock(ctx, index) {
  const block = ctx.data.blocks?.[index];
  if (!block || !ctx.data.spelling) return null;
  setBlockLetter(ctx, block, nextLetter(block.letter));
  block.spin = Date.now();
  ctx.sound('CLICK_SUCCESS', { volume: 0.32 });
  const word = recordWord(ctx.data.spelled, ctx.data.blocks.map((b) => b.letter));
  if (word) {
    ctx.floatText(BLOCK_X[1], FLOOR - 170, `${word}!`, 0xffe066);
    ctx.sound('QUOIN_XP', { volume: 0.35 });
    drawBoard(ctx);
  }
  return word;
}

/** The word list overlay (doSpellingOverlays), as a board on the wall: ??? until spelled. */
function drawBoard(ctx) {
  const { PIXI, kit } = ctx;
  if (ctx.data.board && !ctx.data.board.destroyed) ctx.data.board.destroy({ children: true });
  const board = new PIXI.Container();
  const g = new PIXI.Graphics();
  g.roundRect(330, 170, 500, 266, 12).fill(0x2f5a4a).stroke({ width: 10, color: 0x9b6b3f, alpha: 1 });
  board.addChild(g);
  board.addChild(kit.label(PIXI, `WORDS  ${ctx.data.spelled.length}/${WORD_UP_WORDS.length}`, 580, 194, { size: 17, fill: 0xf4f0d6, weight: '900' }));
  WORD_UP_WORDS.forEach((word, i) => {
    const col = Math.floor(i / 6);
    const row = i % 6;
    const done = ctx.data.spelled.includes(word);
    board.addChild(kit.label(PIXI, done ? word : '???', 395 + col * 124, 232 + row * 32, {
      size: 19, fill: done ? 0xffe066 : 0x8fb3a3, weight: done ? '900' : '700', alpha: done ? 1 : 0.7,
    }));
  });
  board.zIndex = 5;
  ctx.data.board = ctx.add(board, 5);
}

async function doneSpelling(ctx) {
  ctx.data.spelling = false;
  removeBlocks(ctx);
  const count = ctx.data.spelled.length;
  ctx.data.lastCount = count;
  // move_avatar x 471, facing right (toward Mr. Block).
  ctx.place(BLOCK_X[2] + 40, FLOOR);
  const tier = spellingTier(count);
  ctx.data.tier = tier.id;
  if (tier.id === 'fail') {
    const answer = await talk(ctx, DIALOG.spelling_fail, DIALOG.spelling_fail_choices);
    if (answer === 'yes') createBlocks(ctx);
    else await talk(ctx, DIALOG.spelling_fail_no);
    return;
  }
  await talk(ctx, DIALOG[tier.id]);
  applyRewards(ctx.engine.pc, { xp: tier.xp, favor: { giant: 'friendly', points: tier.favor } });
  ctx.floatText(ctx.player.x, ctx.player.y - 90, `+${tier.xp} iMG`, 0xc9a7ff);
  ctx.engine.updateHud();
  ctx.progress('spell_words');
  ctx.solve();
  await ctx.turnIn();
  ctx.leave();
}

/* ------------------------------------------------------------------ */
/* Tea party                                                           */
/* ------------------------------------------------------------------ */

function teaParty(ctx) {
  if (ctx.data.teaDone) return;
  ctx.data.teaDone = true;
  const lines = TEA_PARTY[ctx.questId] || TEA_PARTY.letter_block_1;
  for (const [who, text, delay, secs] of lines) {
    const t = setTimeout(() => {
      const speaker = ctx.data.tea?.[who];
      if (speaker && !speaker.sprite.destroyed && ctx.run) ctx.say(speaker, text, secs * 1000);
    }, delay * 1000);
    (ctx.data.timers ||= []).push(t);
  }
}

/* ------------------------------------------------------------------ */
/* Room                                                                */
/* ------------------------------------------------------------------ */

export const room = {
  id: 'kids_room',
  title: "Mr. Block's Playroom",
  icon: 'assets/sprites/quests/four-letter/quest-icon.png',
  theme: 'warm',
  hubName: 'A very small room',
  durationMs: 5 * 60_000,
  leaveText: 'Oh, are you not having fun here? Would you prefer to leave?',

  start(ctx) {
    const forced = String(ctx.param('kidsletter') || '').toUpperCase();
    ctx.data.letter = LETTERS.includes(forced) ? forced : LETTERS[Math.floor(Math.random() * LETTERS.length)];
  },

  stageLabel: () => "Mr. Block's Playroom",

  build(ctx) {
    const background = drawPlayroom(ctx.PIXI, ctx.kit);
    return {
      label: "Mr. Block's Playroom",
      hubName: 'A very small room',
      width: W,
      height: H,
      background,
      platforms: [ctx.kit.plat(0, FLOOR, W, FLOOR, 'invisible', { id: 'kids_floor' })],
      spawn: { x: 520, y: FLOOR },
    };
  },

  enter(ctx) {
    const { PIXI, kit } = ctx;
    ctx.scalePlayer(0.42);
    ctx.data.talked = false;
    ctx.data.teaDone = false;
    // The word board is drawn on entry, before anagrams() starts the game.
    if (!Array.isArray(ctx.data.spelled)) ctx.data.spelled = [];
    const spr = mrBlockSprite(ctx, ctx.data.letter);
    spr.x = MR_BLOCK.x;
    spr.y = MR_BLOCK.y;
    spr.zIndex = 44;
    ctx.data.mrBlock = ctx.register({
      classId: 'npc_letterblock',
      label: 'Mr. Block',
      subtitle: ctx.questId === 'letter_block_3' ? 'Has a game of utmost import' : `Collects things that start with ${ctx.data.letter}`,
      sprite: spr,
    });
    const bear = kit.roomArt(PIXI, 'kids_room', 'bear', TEA_X - 158, 562, { scale: 1.1 });
    const thing = kit.icon(PIXI, 'npc_cubimal_yeti', TEA_X + 158, 562, { scale: 0.9, flip: true });
    ctx.add(bear, 30);
    ctx.add(thing, 30);
    ctx.data.tea = { bear: { sprite: bear, label: 'Bear' }, thing: { sprite: thing, label: 'Thing' } };
    if (ctx.data.spelling) createBlocks(ctx);
    else if (ctx.questId === 'letter_block_3') drawBoard(ctx);
    ctx.activity('You shrink down and arrive in Mr. Block’s Playroom.');
  },

  clear(ctx) {
    for (const t of ctx.data.timers || []) clearTimeout(t);
    ctx.data.timers = [];
  },

  clock(ctx) {
    return ctx.data.spelling ? Math.max(0, ctx.data.spellEndsAt - Date.now()) : undefined;
  },
  lowMs: 20_000,

  tick(ctx) {
    const p = ctx.player;
    if (!p) return;
    const t = Date.now();
    const mb = ctx.data.mrBlock?.sprite;
    if (mb && !mb.destroyed) mb.y = MR_BLOCK.y + Math.sin(t / 420) * 6;
    for (const b of ctx.data.blocks || []) {
      if (!b.spin || b.sprite.destroyed) continue;
      const k = Math.min(1, (t - b.spin) / 450);
      b.sprite.scale.x = 0.74 * Math.abs(Math.cos(k * Math.PI));
      if (k >= 1) {
        b.sprite.scale.x = 0.74;
        b.spin = 0;
      }
    }
    // engine.busy() is always true inside a room scene; only a verb, menu or dialogue interrupts here.
    const interrupted = ctx.engine.acting() || ctx.engine.questDialogueOpen();
    if (!ctx.data.talked && !ctx.dialogOpen() && !interrupted && Math.abs(p.x - MR_BLOCK.x) < 120) {
      if (ctx.questId === 'letter_block_3') anagrams(ctx);
      else blocksRequest(ctx);
    }
    if (!ctx.data.teaDone && p.x < TEA_X + 210) teaParty(ctx);
    if (ctx.data.spelling && t >= ctx.data.spellEndsAt) doneSpelling(ctx);
  },

  verbs(ctx, target) {
    if (target.classId === 'letter_block') {
      return [{ id: 'spin', label: 'Spin', enabled: ctx.data.spelling === true, tooltip: 'Click to spin this letter block and see what you get!' }];
    }
    if (target.classId !== 'npc_letterblock') return [];
    const out = [];
    if (!ctx.data.spelling) out.push({ id: 'talk_to', label: 'Talk to', enabled: true, tooltip: 'Talk to Mr. Block' });
    if (ctx.questId === 'letter_block_1') out.push({ id: 'give', label: 'Give', enabled: true, tooltip: 'Give Mr. Block an item' });
    out.push({ id: 'leave', label: 'Leave', enabled: true, tooltip: 'Get yourself out of here!' });
    return out;
  },

  runVerb(ctx, target, verbId) {
    if (target.classId === 'letter_block') {
      if (verbId === 'spin') spinBlock(ctx, target.qiBlock);
      return true;
    }
    if (verbId === 'leave') wantLeave(ctx);
    else if (verbId === 'give') giveItem(ctx);
    else if (verbId === 'talk_to') {
      if (ctx.questId === 'letter_block_3') {
        if (!ctx.data.talked) anagrams(ctx);
        else anagramStart(ctx);
      } else if (!ctx.data.talked) blocksRequest(ctx);
      else talk(ctx, DIALOG.letter_match_explain);
    }
    return true;
  },

  objective(ctx) {
    if (ctx.questId === 'letter_block_3') {
      if (ctx.data.spelling) {
        return { text: 'Spin the blocks to spell three-letter words from A, B, E, M, S and T.', stats: [['words', `${ctx.data.spelled.length}/${WORD_UP_WORDS.length}`]] };
      }
      return { text: ctx.data.talked ? 'Talk to Mr. Block when you are ready.' : 'Find Mr. Block.', stats: [['words', `${ctx.data.lastCount ?? 0}/${WORD_UP_WORDS.length}`]] };
    }
    return {
      text: ctx.data.talked ? `Give Mr. Block something that starts with ${ctx.data.letter}.` : 'Find Mr. Block.',
      stats: [['letter', ctx.data.letter]],
    };
  },

  publish(ctx) {
    ctx.setData('kidsLetter', ctx.data.letter || '');
    ctx.setData('kidsTalked', ctx.data.talked ? '1' : '0');
    ctx.setData('kidsGave', ctx.data.gave || '');
    ctx.setData('kidsSpelling', ctx.data.spelling ? '1' : '0');
    ctx.setData('kidsWords', (ctx.data.spelled || []).join(','));
    ctx.setData('kidsTier', ctx.data.tier || '');
    ctx.setData('kidsTea', ctx.data.teaDone ? '1' : '0');
    ctx.setData('kidsBlocks', (ctx.data.blocks || []).map((b) => b.letter).join(''));
  },

  async autoplay(ctx, mode) {
    const settle = async (pred, ms = 15_000) => {
      const end = Date.now() + ms;
      while (!pred() && Date.now() < end) await ctx.wait(120);
    };
    const pressThrough = async (pick) => {
      // Advance the open conversation; on the last page take `pick` (index) if given.
      for (let i = 0; i < 20 && ctx.dialogOpen(); i++) {
        const buttons = [...document.querySelectorAll('#qi-dialogue [data-qi-choices] button')];
        if (buttons.length > 1 && pick != null) buttons[pick]?.click();
        else ctx.advanceDialog();
        await ctx.wait(250);
      }
    };
    const dismissAward = async () => {
      for (let i = 0; i < 40; i++) {
        const el = document.getElementById('award-screen');
        if (el && !el.hidden) el.querySelector('[data-award-next]:not([hidden])')?.click() || el.querySelector('[data-award-close]')?.click();
        await ctx.wait(300);
        if (!ctx.run) return;
      }
    };
    await ctx.wait(800);
    // Tea party first, then walk into Mr. Block.
    ctx.place(TEA_X + 60, FLOOR);
    await settle(() => ctx.data.teaDone, 4000);
    await ctx.wait(1200);
    ctx.place(MR_BLOCK.x - 60, FLOOR);
    await settle(() => ctx.dialogOpen());
    if (ctx.questId === 'letter_block_1') {
      await pressThrough();
      if (mode === 'talk') return 'talked';
      const item = giftable(ctx.engine.inv, ctx.data.letter)[0];
      if (!item && mode !== 'none') return 'no-item';
      const giving = giveItem(ctx, item?.id);
      await ctx.wait(400);
      await pressThrough();
      if (mode === 'award') return 'award';
      await dismissAward();
      await giving;
      return 'complete';
    }
    await pressThrough(0); // Yes, I'm ready.
    await settle(() => ctx.data.spelling);
    if (mode === 'blocks') return 'spelling';
    const target = mode === 'fail' ? 2 : mode === 'some' ? 5 : 21;
    const words = [...WORD_UP_WORDS];
    while (ctx.data.spelling && ctx.data.spelled.length < target && words.length) {
      const word = words.shift();
      for (let i = 0; i < 3; i++) {
        let guard = 0;
        while (ctx.data.blocks[i].letter !== word[i] && guard++ < 6) spinBlock(ctx, i);
      }
      await ctx.wait(60);
    }
    await ctx.wait(1500);
    ctx.data.spellEndsAt = Date.now();
    await settle(() => ctx.dialogOpen());
    await ctx.wait(400);
    if (mode === 'fail') {
      await pressThrough(1);
      return 'failed';
    }
    await pressThrough();
    if (mode === 'award') return 'award';
    await ctx.wait(800);
    await dismissAward();
    return 'complete';
  },
};
