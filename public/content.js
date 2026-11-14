/**
 * Glitch-style verb catalog (mined from GSJS item defs).
 * Simplified conditions/handlers for the Groddle spike.
 */

import { getVerbReward, applyVerbReward, formatActivityLine } from './js/verb-rewards.js?v=202a9e37';
import { grantMoodXp } from './js/mood-xp.js?v=22648ec0';
import {
  TRANT_META,
  resolveArborologyPackage,
  canHarvestTrant,
  harvestTrant,
  maturityLabel,
} from './js/trants.js?v=4d6f5593';
import {
  quoteTrantCare,
  performTrantCare,
} from './js/trant-care.js?v=6ee0b0f5';
import {
  listPlantableSeeds,
  waterAllPlots,
  gardenActionProfile,
  plantPlot,
  waterPlot,
  harvestPlot,
  clearPlot,
  SEED_CATALOG,
  hasWateringCan,
  hasHoe,
  plotStatusLabel,
  gardenNeedsWater,
  plotNeedsWater,
  GARDEN_NO_DRY_PLOTS_LINE,
  GARDEN_FERTILIZER,
  GARDEN_FERTILIZE_MS,
  fertilizeCheck,
  fertilizePlot,
} from './js/garden.js?v=1420a6d6';
import { firstWorkingTool, HOE_TOOLS, WATERING_CAN_TOOLS } from './js/tools.js?v=48542c24';
import { miningGemHint } from './js/gem-hints.js?v=4b65f7ac';
import {
  ROCK_CATALOG,
  MINING_COSTS,
  miningProfile,
  miningToolWear,
  mineRock,
  tickMineRock,
  findWorkingPick,
  knowsMining,
  noPickLine,
  rockStatusLabel,
  ensureMiningItems,
} from './js/mining.js?v=b28fef74';
import { takeToolChoice } from './js/tool-choice.js?v=e0dcb60e';
import {
  ANIMAL_CLASS_IDS,
  ensureAnimalState,
  listAnimalFeedOptions,
  feedAnimal,
} from './js/animals.js?v=5af77017';
import {
  quoteAnimalKinship,
  ANIMAL_KINSHIP_CLICK_REFUSALS,
  performAnimalKinship,
  highestAnimalKinshipRank,
} from './js/animal-kinship.js?v=e2a94c13';
import {
  MUSICBLOCK_CATALOG,
  collectMusicblock,
  isMusicblock,
} from './js/musicblocks.js?v=c498f7c3';
import { nextDialogue, formatSpokenLine } from './js/dialogue.js?v=fcfed1af';
import {
  ensureWoodTreeState,
  quoteWoodTreeHarvest,
  harvestWoodTree,
  woodTreeStatusLabel,
} from './js/woodcutting.js?v=ee35a30a';
import { findWorkingRookTool } from './js/rook-woods.js?v=1b765560';
import {
  HERDKEEPING,
  INCUBATION,
  applyKinshipDrop,
  captureVerbState,
  incubateVerbState,
  namingVerbs,
  queuePlops,
  startIncubation,
} from './js/animal-husbandry.js?v=c1577210';
import { loseEnergy, metabolicGain, moodMax } from './js/metabolics.js?v=1383e6fd';
import { SET_FREE, setFreeVerbState } from './js/animal-set-free.js?v=55ad2f83';
import { BUTTER_UP, SING_TO, butterUpVerbState, butterUpChicken, singToVerbState, singToButterfly } from './js/animal-flattery.js?v=9700115b';
import { levelInfoForXp } from './js/progression.js?v=72b2b22a';
import { getGameDayKey } from './js/game-day.js?v=cf9afac0';
import { PACK_COPY, isElementClass } from './js/pack-slots.js?v=4d446d78';
import { hasPouch } from './js/elemental-pouch.js?v=42702eda';
import { ITEM_CATALOG, countItem } from './js/inventory.js?v=f49c8998';
import { slugsFromEffects } from './js/speech-slugs.js?v=130338f9';
import { animalResponseKey, failureResponseKey, trantCareResponseKey, rockResponseKey, verbResponse } from './js/verb-responses.js?v=3ceb8a8c';

/** Naming / capture context for an animal target (the back yard counts as yours). */
function husbandryCtx(ctx) {
  return {
    learned: ctx.skills?.learned || ctx.learned || [],
    playerId: 'player',
    nowS: Math.floor(Date.now() / 1000),
    ownYard: ctx.streetTsid === 'RH_HOME_EXT',
  };
}

/** OGA iconic pack — assets/sprites/icons/<class_tsid>.png */
export const ITEM_ICONS = {
  apple: 'assets/sprites/icons/apple.webp',
  milk_butterfly: 'assets/sprites/icons/milk_butterfly.webp',
  butterfly_lotion: 'assets/sprites/icons/butterfly_lotion.webp',
  grain: 'assets/sprites/icons/grain.webp',
  plank: 'assets/sprites/icons/plank.webp',
  cherry: 'assets/sprites/icons/cherry.webp',
  flour: 'assets/sprites/icons/flour.webp',
  bun: 'assets/sprites/icons/bun.webp',
  sammich: 'assets/sprites/icons/sammich.webp',
  meat: 'assets/sprites/icons/meat.webp',
  pinch_of_salt: 'assets/sprites/icons/pinch_of_salt.webp',
  egg_plain: 'assets/sprites/icons/egg_plain.webp',
  bean_plain: 'assets/sprites/icons/bean_plain.webp',
  plain_bubble: 'assets/sprites/icons/plain_bubble.webp',
  all_spice: 'assets/sprites/icons/all_spice.webp',
  general_vapour: 'assets/sprites/icons/general_vapour.webp',
};

export const ITEM_LABELS = {
  apple: 'Apple',
  milk_butterfly: 'Butterfly Milk',
  butterfly_lotion: 'Butterfly Lotion',
  grain: 'Grain',
  plank: 'Plank',
  cherry: 'Cherry',
  flour: 'Flour',
  bun: 'Bun',
  sammich: 'Sammich',
  meat: 'Meat',
  pinch_of_salt: 'Pinch of Salt',
  egg_plain: 'Egg',
  bean_plain: 'Bean',
  plain_bubble: 'Bubble',
  all_spice: 'Allspice',
  general_vapour: 'Vapour',
  orange: 'Orange',
  lemon: 'Lemon',
  plum: 'Plum',
  spinach: 'Spinach',
  carrot: 'Carrot',
  corn: 'Corn',
  potato: 'Potato',
};

for (const def of Object.values(MUSICBLOCK_CATALOG)) {
  ITEM_ICONS[def.classTsid] = `assets/sprites/icons/${def.classTsid}.webp`;
  ITEM_LABELS[def.classTsid] = def.label;
}

const LIVING_TRANT_IDS = new Set(Object.keys(TRANT_META));
const TREE_IDS = new Set([...LIVING_TRANT_IDS, 'wood_tree']);

function harvestTooltip(classId) {
  if (classId === 'wood_tree') return 'Collect some planks';
  const meta = TRANT_META[classId];
  return meta ? `Collect ${meta.fruitLabel || 'fruit'}` : 'Collect harvest';
}

/** @typedef {{ id: string, label: string, sort?: number, tooltip?: string, energy?: number }} VerbDef */

/**
 * Build available verbs for a target given world state.
 * Mirrors GSJS: conditions → {state: enabled|disabled|null, reason?}
 */
export function getVerbsFor(target, ctx) {
  const { pc, inv } = ctx;
  const classId = target.classId;
  const s = ANIMAL_CLASS_IDS.includes(classId)
    ? ensureAnimalState(classId, target.state || (target.state = {}))
    : target.state || {};
  if (classId === 'wood_tree') ensureWoodTreeState(s);
  /** @type {{ id: string, label: string, sort: number, tooltip: string, enabled: boolean, reason?: string }[]} */
  const out = [];

  const add = (id, label, opts = {}) => {
    const energy = opts.energy || 0;
    let enabled = opts.enabled !== false;
    let reason = opts.reason || '';
    let tooltip = opts.tooltip || '';
    if (enabled && energy > 0 && pc.energy < energy && opts.energyGate !== false) {
      enabled = false;
      reason = `Needs ${energy} energy (you have ${Math.floor(pc.energy)}).`;
    }
    out.push({
      id,
      label,
      sort: opts.sort ?? 50,
      tooltip,
      enabled,
      reason,
      energy,
      durationMs: Number.isFinite(opts.durationMs) ? opts.durationMs : undefined,
      ...(opts.picker ? { picker: opts.picker } : {}),
    });
  };

  if (classId === 'pc_local') {
    const isFollowee = Boolean(s.following);
    add(isFollowee ? 'stop_following' : 'follow', isFollowee ? 'stop following' : 'follow', {
      sort: 5,
      durationMs: 0,
      tooltip: isFollowee
        ? `Stop following ${target.label || 'this player'}`
        : `Follow ${target.label || 'this player'} from street to street`,
    });
  }

  if (classId === 'npc_mailbox') {
    add('view_inbox', 'open mailbox', {
      sort: 10,
      tooltip: s.unread > 0
        ? `Check your mail · ${s.unread} unread`
        : 'Check your mail',
    });
  }

  if (classId === 'home_door') {
    add(s.room === 'interior' ? 'leave_house' : 'enter_house',
      s.room === 'interior' ? 'leave house' : 'enter house', {
        sort: 10,
        tooltip: s.room === 'interior'
          ? 'Step back onto your home street'
          : 'Go inside your house',
      });
  }

  if (classId === 'home_return_marker') {
    // GATESIGN2: the home signpost's top arm, Back to Ur (homes-feature makeHomeSignpost).
    const where = s.returnLabel ? `${s.returnLabel}${s.returnHub && s.returnHub !== s.returnLabel ? `, ${s.returnHub}` : ''}` : '';
    add('return_to_world', s.returnLabel ? `back to ${s.returnLabel}` : 'back to the world', {
      sort: 10,
      tooltip: where ? `Teleport back to ${where}` : 'Teleport back to the world',
    });
  }

  if (classId === 'letter_block') {
    const puzzle = s.puzzleState;
    add('spin', 'spin', {
      sort: 10,
      enabled: puzzle?.status === 'running',
      reason:
        puzzle?.status === 'staging'
          ? 'Talk to Mr. Block first.'
          : puzzle?.status === 'solved'
            ? 'The riddles are solved.'
            : '',
      tooltip: 'Click to spin this letter block and see what you get!', // G318: letter_block.js verbs.spin
    });
  }

  if (classId === 'npc_letterblock') {
    const puzzle = s.puzzleState;
    add('talk_to', 'talk to', {
      sort: 10,
      enabled: Boolean(puzzle),
      tooltip: 'Talk to Mr. Block', // G318: npc_letterblock.js verbs.talk_to (and leave, below)
    });
    add('leave', 'leave playroom', {
      sort: 90,
      enabled: puzzle?.status !== 'solved',
      tooltip: 'Get yourself out of here!',
    });
  }

  if (classId === 'legalize_transit_gate') {
    const action = target?.state?.routeAction;
    // game.js legalizeRealTarget: Gregarious Grange Subway Station's stairs once back from The Back Alley.
    const expectedStage = action === 'depart_back_alley' ? 'gregarious_departure' : 'gregarious_arrival';
    const verbId = action === 'exit_gregarious_station' ? 'exit' : 'travel';
    add(verbId, verbId === 'exit' ? 'exit station' : 'travel', {
      sort: 10,
      enabled: Boolean(s.legalizeState) && s.legalizeState.stage === expectedStage,
      tooltip: action === 'depart_back_alley' ? 'Travel to The Back Alley' : 'Exit to Gregarious Grange',
    });
  }

  if (classId === 'npc_back_alley_bureaucrat') {
    add('talk_to', 'talk to', {
      sort: 10,
      enabled:
        Boolean(s.legalizeState) &&
        s.legalizeState.stage === 'back_alley',
      reason:
        s.legalizeState?.stage === 'back_alley_briefed'
          ? 'The Bureaucratic Hall is already marked on your route.'
          : '',
      tooltip: 'Ask about becoming qualified in the Bureaucratic Arts',
    });
  }

  if (classId === 'npc_bureaucrat') {
    const legalize = s.legalizeState;
    const isCurrent = Number(s.clerkIndex) === Number(legalize?.clerkIndex);
    add('talk_to', 'talk to', {
      sort: 10,
      enabled:
        Boolean(legalize) &&
        isCurrent &&
        ['hall_called', 'hall_processing'].includes(legalize.stage),
      reason:
        legalize?.stage === 'hall_waiting'
          ? 'Please move into the waiting area.'
          : !isCurrent
            ? 'This clerk is not handling your application.'
            : legalize?.stage === 'card_owned'
              ? 'Your transaction is complete. Activate the card in your pack.'
              : '',
      tooltip: 'Attempt what is likely to be a maddening conversation',
    });
  }

  if (classId === 'rook_hall_speaker') {
    const museum = s.museumState;
    add('push', 'push', {
      sort: 10,
      durationMs: 1000,
      enabled:
        Boolean(museum) &&
        ['touring', 'ready'].includes(museum.status),
      reason:
        museum?.status === 'arrival'
          ? 'Speak with Greeterbot Sentry G-42 first.'
          : museum?.status === 'complete'
            ? 'The lesson is complete.'
            : '',
      tooltip: 'Push the button to learn about this exhibit',
    });
  }

  if (classId === 'npc_quest_widget') {
    const museum = s.museumState;
    add('talk_to', 'talk to', {
      sort: 10,
      enabled: Boolean(museum) && museum.status !== 'complete',
      reason: museum?.status === 'complete' ? 'Greeterbot has sent you back into Ur.' : '',
      tooltip:
        museum?.status === 'ready'
          ? 'Complete your Rook training'
          : 'Ask Greeterbot Sentry G-42 about the museum',
    });
  }

  if (classId === 'npc_dustbunny') {
    const miniature = s.deEmbiggenifyState;
    add('talk_to', 'talk to', {
      sort: 10,
      enabled: Boolean(miniature) && !['complete', 'expired'].includes(miniature.status),
      reason:
        miniature?.status === 'expired'
          ? 'The catalogue page has closed.'
          : miniature?.status === 'complete'
            ? 'Mr. Hairball has already thanked you.'
            : '',
      tooltip: 'Address the hairball ... er, Dust Bunny',
    });
  }

  if (classId === 'small_worthless') {
    const miniature = s.deEmbiggenifyState;
    add('pickup', 'pick up', {
      sort: 10,
      durationMs: 500,
      enabled: miniature?.status === 'searching',
      reason:
        miniature?.status === 'arrival'
          ? 'Ask Mr. Hairball what he needs first.'
          : miniature?.status === 'found'
            ? 'You already picked it up.'
            : '',
      tooltip: 'Pick up the small shiny object with no intrinsic value',
    });
  }

  if (classId === 'npc_piggy_explorer') {
    const rescue = s.rescueState;
    add('talk_to', 'talk to', {
      sort: 10,
      enabled: Boolean(rescue) && !rescue.releasedJones,
      tooltip: 'Hear the famous explorer explain his predicament',
    });
    add('pickup', 'pick up', {
      sort: 20,
      durationMs: 650,
      enabled: Boolean(rescue?.metJones) && !rescue?.pickedUpJones,
      reason: rescue?.metJones ? '' : 'Talk to Ilmenskie Jones first.',
      tooltip: 'Carry Ilmenskie Jones out of the sealed cavern',
    });
    add('nibble', 'nibble', {
      sort: 80,
      enabled: Boolean(rescue) && !rescue.releasedJones,
      tooltip: "Just a little nibbly-wibbly can't hurt",
    });
  }

  if (classId === 'race_pig_bait') {
    const race = s.raceState;
    add('pickup', 'pick up', {
      sort: 10,
      enabled:
        s.available !== false &&
        race?.status === 'running' &&
        !race?.hasBait &&
        !race?.carryingPig,
      reason:
        race?.status !== 'running'
          ? 'Wait for the race to start.'
          : race?.hasBait || race?.carryingPig
            ? 'You can carry only one race item at a time.'
            : '',
      tooltip: 'Grab this bait, then find a loose Piggy',
    });
  }

  if (classId === 'race_piggy') {
    const race = s.raceState;
    add('hogtie', 'hogtie', {
      sort: 10,
      durationMs: 650,
      enabled:
        s.available !== false &&
        race?.status === 'running' &&
        race?.hasBait &&
        !race?.carryingPig,
      reason:
        race?.status !== 'running'
          ? 'Wait for the race to start.'
          : race?.carryingPig
            ? 'Return your Piggy to the pen first.'
            : !race?.hasBait
              ? 'You need Pig Bait first!'
              : '',
      tooltip: 'Trade one Pig Bait for one hogtied Piggy',
    });
  }

  if (classId === 'race_pig_pen') {
    const race = s.raceState;
    add('deliver', 'put Piggy in pen', {
      sort: 10,
      enabled: race?.status === 'running' && race?.carryingPig,
      reason:
        race?.status !== 'running'
          ? 'The race is not running.'
          : 'Bring a hogtied Piggy here.',
      tooltip: 'Score one Piggy',
    });
  }

  if (classId === 'winter_portal') {
    add('enter', s.stage === 'surface' ? 'enter Winter Haven' : 'finish Winter Walk', {
      sort: 10,
      enabled: s.active !== false,
      reason: s.active === false ? 'The icy path is shifting.' : '',
      tooltip:
        s.stage === 'surface'
          ? 'Continue into the vertical ice cavern'
          : 'Leave the winter path and return home',
    });
  }

  if (classId === 'rook_egg') {
    const run = s.rookState;
    const tool = findWorkingRookTool(inv, ctx.tools);
    add('smash', 'smash', {
      sort: 10,
      durationMs: tool.ok ? tool.profile.durationMs : 0,
      enabled:
        run?.status === 'running' &&
        run?.eggSmashed !== true &&
        tool.ok,
      reason:
        run?.eggSmashed || run?.status === 'complete'
          ? "It's been smashed already. Any more would be overkill, don't you think?"
          : !tool.ok
            ? tool.msg
            : run?.status !== 'running'
              ? 'The Rooks’ Woods are not ready.'
              : '',
      tooltip: tool.ok
        ? `Smash with your ${tool.profile.label}`
        : 'Do it! Smash it open!',
    });
  }

  // A kinship refusal the source makes in the handler stays clickable and says why, no timed action.
  const kinshipState = (q) => (ANIMAL_KINSHIP_CLICK_REFUSALS.includes(q.reason)
    ? { enabled: true, reason: '', durationMs: 0, energyGate: false }
    : { enabled: q.ok, reason: q.ok ? '' : q.msg });

  if (classId === 'npc_piggy') {
    const kinshipCtx = {
      pc,
      inv,
      learned: ctx.skills?.learned || ctx.learned || [],
    };
    const pet = quoteAnimalKinship(s, classId, 'pet', kinshipCtx);
    add('pet', 'pet', {
      sort: 10,
      energy: pet.profile?.energyCost || 4,
      durationMs: pet.profile?.durationMs,
      tooltip: pet.ok
        ? `Make it feel better · ${pet.profile.intervalLimit}× per game day at your rank`
        : 'Make it feel better',
      ...kinshipState(pet),
    });
    const nibble = quoteAnimalKinship(s, classId, 'nibble', kinshipCtx);
    add('nibble', 'nibble', {
      sort: 20,
      energy: nibble.profile?.energyCost || 5,
      durationMs: nibble.profile?.durationMs,
      tooltip: nibble.ok
        ? `Just a little nibbly-wibbly · yields ${nibble.profile.bonusAmount} Meat`
        : 'Just a little nibbly-wibbly · yields Meat',
      ...kinshipState(nibble),
    });
    const feedOptions = listAnimalFeedOptions(classId, inv);
    add('feed', 'feed', {
      sort: 30,
      enabled: feedOptions.length > 0,
      reason: feedOptions.length ? '' : "You don't have anything this Piggy wants to eat.",
      tooltip: feedOptions.length
        ? `Choose from ${feedOptions.length} eligible pack item${feedOptions.length === 1 ? '' : 's'}`
        : 'Feed it fruit, crops, grain, or something you made',
    });
    const hk = husbandryCtx(ctx);
    const capture = captureVerbState({
      inv,
      learned: hk.learned,
      energy: pc?.energy || 0,
      streetTsid: ctx.streetTsid || '',
      ownYard: hk.ownYard,
    });
    add('capture', 'capture', {
      sort: 55,
      energy: HERDKEEPING.energy,
      tooltip: HERDKEEPING.tooltip,
      enabled: capture.enabled,
      reason: capture.reason,
    });
    for (const verb of namingVerbs(classId, s, hk)) add(verb.id, verb.label, verb);
    add('talk_to', 'talk to', {
      sort: 90,
      tooltip: 'I have something to tell you!',
    });
  }

  if (classId === 'greedy_story_button') {
    const story = s.storyState;
    const actIndex = Number(s.actIndex);
    const act = story && Number.isInteger(actIndex) ? story.actSteps?.[actIndex] : null;
    const total = Number.isInteger(actIndex) ? (s.totalSteps || 0) : 0;
    add('press', 'press', {
      sort: 5,
      durationMs: 350,
      enabled: story?.status === 'running' && Number(act) < total,
      reason:
        story?.status === 'ready'
          ? 'The whole story has been read.'
          : Number(act) >= total
            ? 'This act is complete.'
            : '',
      tooltip: `Read ${s.actTitle || 'the next act'} · ${Number(act) || 0}/${total}`,
    });
  }

  if (classId === 'greedy_story_exit') {
    const story = s.storyState;
    add('leave_storyland', 'return to Ur', {
      sort: 5,
      enabled: story?.status === 'ready',
      reason: story?.status === 'ready'
        ? ''
        : "You've missed some of the story! It's much more rewarding if you read it all the way through.",
      tooltip: story?.repeat
        ? 'Finish reminiscing and return to Ur'
        : 'Return to the Piggy and wrap up the story',
    });
  }

  if (classId === 'npc_chicken') {
    const squeeze = quoteAnimalKinship(s, classId, 'squeeze', {
      pc,
      inv,
      learned: ctx.skills?.learned || ctx.learned || [],
    });
    add('squeeze', 'squeeze', {
      sort: 10,
      energy: squeeze.profile?.energyCost || 1,
      durationMs: squeeze.profile?.durationMs,
      tooltip: squeeze.ok
        ? `Obtain ${squeeze.profile.bonusAmount} Grain · ${squeeze.profile.intervalLimit}× per game day at your rank`
        : 'Obtain Grain',
      ...kinshipState(squeeze),
    });
    // No Feed: npc_chicken.js has no feed verb (Austin, desk FEED, register G280).
    // G279: npc_chicken.js 163-236 (js/animal-flattery.js): no daily limit.
    const butter = butterUpVerbState(s);
    if (butter) {
      add('butter_up', BUTTER_UP.label, {
        sort: 60,
        // No energy field: the source has no energy check (it may spend you to 0).
        tooltip: BUTTER_UP.tooltip,
        enabled: butter.enabled,
        reason: butter.reason,
      });
    }
    const hk = husbandryCtx(ctx);
    const incubate = incubateVerbState(s, hk.learned);
    if (incubate) {
      add('incubate', 'request incubation', {
        sort: 56,
        tooltip: INCUBATION.tooltip,
        enabled: incubate.enabled,
        reason: incubate.reason,
        picker: 'incubate',
      });
    }
    for (const verb of namingVerbs(classId, s, hk)) add(verb.id, verb.label, verb);
    // G284: set free in a place you own (npc_chicken.js 359-414); features/animal-husbandry-feature.js runs it.
    const free = setFreeVerbState(classId, s, hk);
    if (free) add('set_free', SET_FREE.verb, free);
    add('talk_to', 'talk to', { sort: 90, tooltip: 'I have something to tell you!' });
  }

  if (classId === 'npc_butterfly') {
    const kinshipCtx = {
      pc,
      inv,
      tools: ctx.tools,
      learned: ctx.skills?.learned || ctx.learned || [],
    };
    const milk = quoteAnimalKinship(s, classId, 'milk', kinshipCtx);
    add('milk', 'milk', {
      sort: 10,
      energy: milk.profile?.energyCost || 5,
      durationMs: milk.profile?.durationMs,
      tooltip: milk.ok
        ? `Extract ${milk.profile.bonusAmount} Butterfly Milk · ${milk.profile.intervalLimit}× per game day at your rank`
        : 'Extract Butterfly Milk',
      ...kinshipState(milk),
    });
    const massage = quoteAnimalKinship(s, classId, 'massage', kinshipCtx);
    add('massage', 'massage', {
      sort: 20,
      energy: massage.profile?.energyCost || 5,
      durationMs: massage.profile?.durationMs,
      tooltip: massage.rank >= 6
        ? `Optional warmup · ${massage.profile?.intervalLimit || 2}× per game day`
        : massage.profile?.toolWear
          ? 'Advised before milking · uses 1/5 of a Butterfly Lotion tube'
          : 'Advised before milking · no lotion required at your rank',
      ...kinshipState(massage),
    });
    // G279: npc_butterfly.js 543-693 (js/animal-flattery.js): Butterfly Whisperer only.
    const sing = singToVerbState(s, {
      achievements: ctx.achievements || [],
      energy: pc?.energy,
      dayKey: getGameDayKey(ctx.now ?? Date.now()),
    });
    if (sing) {
      add('sing_to', SING_TO.label, {
        sort: 30,
        // No energy field: the menu only checks > 2 (576); the handler refuses the rest (637-640).
        tooltip: SING_TO.tooltip,
        enabled: sing.enabled,
        reason: sing.reason,
      });
    }
    for (const verb of namingVerbs(classId, s, husbandryCtx(ctx))) add(verb.id, verb.label, verb);
    // G284: set free in a place you own (npc_butterfly.js 320-370); features/animal-husbandry-feature.js runs it.
    const free = setFreeVerbState(classId, s, husbandryCtx(ctx));
    if (free) add('set_free', SET_FREE.verb, free);
    add('talk_to', 'talk to', { sort: 40, tooltip: 'I have something to tell you!' });
  }

  if (classId === 'phantom_glitch') {
    if (s.kind === 'final') {
      add('talk_to', 'talk to', {
        sort: 10,
        tooltip: "I've got something for you…",
      });
    } else {
      add('notice', 'notice', {
        sort: 10,
        tooltip: 'Look directly at what can barely be seen',
      });
    }
  }

  if (TREE_IDS.has(classId)) {
    const careCtx = {
      pc,
      inv,
      tools: ctx.tools,
      learned: ctx.skills?.learned || ctx.learned || [],
    };
    const petCare = quoteTrantCare(s, classId, 'pet', careCtx);
    add('pet', 'pet', {
      sort: 10,
      energy: petCare.profile?.energyCost || 2,
      tooltip: 'Give love',
      durationMs: petCare.profile?.durationMs,
      enabled: petCare.ok,
      reason: petCare.ok ? '' : petCare.msg,
    });
    const waterCare = quoteTrantCare(s, classId, 'water', careCtx);
    add('water', 'water', {
      sort: 20,
      energy: waterCare.profile?.energyCost || 5,
      tooltip: waterCare.ok
        ? `Give water · ${waterCare.toolLabel || 'Watering Can'} · ${waterCare.profile.toolWear} condition`
        : 'Give water · Watering Can required',
      durationMs: waterCare.profile?.durationMs,
      enabled: waterCare.ok,
      reason: waterCare.ok ? '' : waterCare.msg,
    });
    if (classId === 'wood_tree') {
      const harvest = quoteWoodTreeHarvest(s, inv, pc, ctx.tools || {});
      // wood_tree.js 442-466 / 474-490: a wee tree (maturity 1) offers "Harvest and Clear"
      // in place of harvest, with the warning; the id stays harvest (same handler, doHarvest).
      const wee = Number(s.maturity) === 1;
      add('harvest', wee ? 'Harvest and Clear' : 'harvest', {
        sort: 30,
        energy: harvest.energyCost || 20,
        tooltip: wee
          ? 'Harvesting this wee tree will also kill it!'
          : harvest.ok
          ? `Extract ${harvest.plankYield} planks with your ${harvest.toolLabel || 'Hatchet'} · ${harvest.hatchetWear} condition`
          : `${harvestTooltip(classId)} · Hatchet required`,
        enabled: harvest.ok,
        reason: harvest.ok ? '' : harvest.msg,
      });
    } else {
      // Living trants: Arborology package from skills (ctx.skills / learned)
      const learned = ctx.skills?.learned || ctx.learned || [];
      const arbor = resolveArborologyPackage(learned);
      const check = canHarvestTrant(s, arbor);
      const mat = s.maturity != null ? maturityLabel(s.maturity) : '';
      const fruitHint =
        s.fruitCount != null
          ? ` · ${s.fruitCount}/${s.fruitCapacity || '?'} on tree`
          : '';
      add('harvest', 'harvest', {
        sort: 30,
        energy: arbor.energyCost || 5,
        durationMs: arbor.durationMs,
        tooltip: `${harvestTooltip(classId)}${mat ? ` (${mat})` : ''}${fruitHint}`,
        enabled: check.ok,
        reason: check.ok ? '' : check.reason,
      });
    }
    add('talk_to', 'talk to', { sort: 40, tooltip: 'I have something to tell you!' });
  }

  if (classId === 'apple') {
    add('pickup', 'pick up', {
      sort: 10,
      tooltip: 'Put it in your pack',
    });
  }

  if (classId === 'dropped_item') {
    const count = Math.max(1, Math.floor(Number(s.count) || 1));
    const itemLabel = s.label || target.label || 'item';
    // element_base canPickup returns {ok: 0} (element_red.js 147-149): the source never let an element
    // reach the ground. Stacks v0.20.0-v0.23.0 let down (#139) go back, straight into a pouch only
    // (bag_elemental_pouch.js 651-659; game.js pickupDroppedWorldItem refuses a full one).
    if (isElementClass(s.classTsid)) {
      const pouch = hasPouch(inv || {});
      add('pickup', 'pick up', {
        sort: 10,
        enabled: pouch,
        reason: pouch ? '' : PACK_COPY.elementNoPouch,
        tooltip: PACK_COPY.elementPickupTip(count, itemLabel),
      });
    } else {
      add('pickup', 'pick up', {
        sort: 10,
        tooltip: `Put ${count > 1 ? `${count} × ` : ''}${itemLabel} in your pack`,
      });
    }
    if (s.classTsid === 'stoot_barfield_pullstring_doll') {
      add('pull_string', 'pull string', {
        sort: 20,
        tooltip: 'You suspect the doll might say something',
      });
    }
  }

  if (isMusicblock(classId)) {
    add('pickup', 'pick up', {
      sort: 10,
      tooltip: 'Add this playable tune to your collection',
    });
  }

  if (classId.startsWith('street_spirit_')) {
    add('browse', 'browse goods', {
      sort: 10,
      tooltip: 'Open buy/sell with this street spirit',
    });
    add('talk_to', 'talk to', {
      sort: 20,
      tooltip: 'Exchange pleasantries',
    });
  }

  if (classId.startsWith('npc_shrine_')) {
    add('donate_to', 'donate', {
      sort: 10,
      tooltip: 'Offer pack goods for iMG, mood, and Giant favor',
    });
    // npc_shrine_base check_favor tooltip (npc_shrine_*.js:472): the panel's
    // Learn Faster? block spends favor on the skill being studied.
    add('check_favor', 'check favor', {
      sort: 20,
      tooltip: 'View & spend favor points',
    });
  }

  if (classId === 'npc_spinning_wheel') {
    const wheel = target.state?.wheel;
    const ready = wheel?.phase === 'ready' && !wheel?.spun;
    add('spin', 'spin', {
      sort: 10,
      enabled: ready,
      reason: wheel?.spun ? 'This wheel has already been spun.' : 'The wheel is still appearing.',
      tooltip: 'Test your luck',
    });
  }

  if (classId === 'stoot_barfield_pullstring_doll') {
    add('pull_string', 'pull string', {
      sort: 10,
      tooltip: 'You suspect the doll might say something',
    });
  }

  // Whole garden bed — water-all only (no dialog). Plots are tended individually on the street.
  // Ticket 63: a garden with only a broken can or hoe refuses at once with its talkback
  // (include/garden.js 125-130, 217-228: no working one, sendResponse('broken_watering_can')
  // before any skill package runs), so the verb takes no time and plays no animation.
  // Report 121: the check takes the action's real wear, so a worn tool Aggressive Hoeing asks too much of
  // refuses at once as well (inc_skill_packages.js 169, runSkillPackage's first check, before any overlay).
  const brokenOnly = (tools, wear = 1) => {
    const found = firstWorkingTool(ctx.tools || null, inv, tools, wear);
    return found.owned && !found.tool;
  };
  if (classId === 'garden_new' || classId === 'garden') {
    const canWater = hasWateringCan(inv);
    // G537: every dry plot takes water, empty ones too; a bed with none dry offers the verb
    // greyed with onPour's line (potion_garden_water.js canPour/onPour), so it never plays
    // the can or costs energy for nothing.
    const dry = gardenNeedsWater(s.garden || s);
    const waterAllCost = gardenActionProfile((s.garden || s).gardenType, 'water', ctx.skills?.learned || ctx.learned || []).energy;
    add('water_all', 'water all', {
      sort: 10,
      energy: 2,
      ...(brokenOnly(WATERING_CAN_TOOLS) || (pc.energy || 0) <= waterAllCost ? { durationMs: 0 } : {}),
      enabled: canWater && dry,
      reason: !canWater ? 'Need a Watering Can' : dry ? '' : GARDEN_NO_DRY_PLOTS_LINE,
      tooltip: canWater
        ? 'Water every dry plot'
        : 'Requires a Watering Can in your pack',
    });
  }

  // Individual on-map plot (original Glitch: click plot → menu, not only a modal)
  if (classId === 'garden_plot') {
    const plot = target.state?.plot;
    const garden = target.state?.garden;
    const gType = garden?.gardenType || 'default';
    const seeds = listPlantableSeeds(inv, gType);
    const st = plot?.state || 'clean';
    const gardenLearned = ctx.skills?.learned || ctx.learned || [];
    const gardenCost = (action) => gardenActionProfile(gType, action, gardenLearned).energy;
    const gardenUpgrades = ctx.imaginationUpgrades || pc.imaginationUpgrades || [];
    // Report 121: an action the plot will refuse takes no time, so no word bar or tool runs for a
    // refusal: a tool that can't take its wear, or energy not above its cost (include/garden.js 263-266).
    const refusedAtOnce = (action, tools = null) => (tools && brokenOnly(tools, gardenActionProfile(gType, action, gardenLearned, gardenUpgrades, { aggressiveOff: pc.aggressiveOff === true }).toolWear))
      || (pc.energy || 0) <= gardenCost(action);
    if (st === 'clean') {
      add('plant', 'plant', {
        sort: 10,
        energy: gardenCost('plant'),
        ...(refusedAtOnce('plant') ? { durationMs: 0 } : {}),
        enabled: seeds.length > 0,
        reason: seeds.length ? '' : gType === 'herb' ? 'Need herb seeds' : 'Need crop seeds',
        tooltip: seeds.length > 1
          ? 'Choose which seeds to plant'
          : seeds.length
            ? `Plant ${seeds[0].label}`
            : 'Buy seeds from the street spirit',
        // #197: more than one kind of seed asks which (the original's "What would you like to
        // plant?", InteractionMenuController.as 1531-1556); the choice runs plant:<seed>.
        ...(seeds.length > 1 ? { picker: 'plant' } : {}),
      });
    }
    // G537: a dry empty plot takes water too (GardenView: a click on a dry plot with nothing in
    // it waters it), so a seed planted there grows at once.
    // GardenView.as 540-543: a wet plot takes water again once it has lost an hour of its watering.
    if ((st === 'seeds' || st === 'shoots' || st === 'clean') && plotNeedsWater(plot, Date.now(), garden)) {
      add('water', 'water', {
        sort: st === 'clean' ? 20 : 10,
        energy: gardenCost('water'),
        ...(refusedAtOnce('water', WATERING_CAN_TOOLS) ? { durationMs: 0 } : {}),
        enabled: hasWateringCan(inv),
        reason: hasWateringCan(inv) ? '' : 'Need a Watering Can',
        tooltip: st === 'clean' ? 'Water this plot' : 'Water so this plot can grow',
      });
    }
    if (st === 'crop') {
      const harvestProfile = gardenActionProfile(gType, 'harvest', gardenLearned);
      add('harvest', 'harvest', {
        sort: 10,
        energy: harvestProfile.energy,
        ...(refusedAtOnce('harvest') ? { durationMs: 0 } : {}),
        tooltip: harvestProfile.halfHarvest
          ? `Pick the crop (half yield without ${gType === 'herb' ? 'Herbalism' : 'Croppery'})`
          : 'Pick the crop',
      });
    }
    if (st === 'dirty') {
      add('clear', 'clear', {
        sort: 10,
        energy: gardenCost('clear'),
        ...(refusedAtOnce('clear', HOE_TOOLS) ? { durationMs: 0 } : {}),
        enabled: hasHoe(inv),
        reason: hasHoe(inv) ? '' : 'Need a Hoe',
        tooltip: 'Hoe the dirt so you can plant again',
      });
    }
    // GardenView.as onPlotClick 521-528, GardenPlotDetails.as 170-175: with Guano, a watered plot offers it.
    if (countItem(inv, GARDEN_FERTILIZER) > 0 && fertilizeCheck(plot).ok) {
      add('fertilize', 'fertilize', {
        sort: 20,
        energy: 0,
        durationMs: GARDEN_FERTILIZE_MS,
        tooltip: 'Speed up the growing',
      });
    }
    if ((st === 'seeds' || st === 'shoots') && plot?.wet) {
      add('talk_to', 'check', {
        sort: 40,
        tooltip: 'Growing, come back when ripe',
      });
    }
  }

  // Mineable rocks (GSJS rock_metal / dullite / beryl / sparkly + include/mining.js)
  if (ROCK_CATALOG[classId] || classId === 'mineable_rock') {
    const rock = s.rock || s;
    tickMineRock(rock);
    // Ticket 63: a broken pick is no pick. The rock's mine verb counts only a working one
    // (rock_beryl_1.js verbs.mine conditions 193-214: it.is_pick && it.isWorking(), else
    // disabled "You'll need a pick first."), so the swing never starts.
    const learned = ctx.learned || ctx.skills?.learned || [];
    const hasSkill = knowsMining(learned);
    // G553: the check takes this rank's real wear, 1 at Mining III and IV. A pick that works but can't
    // take the swing keeps the verb and refuses at once (isWorking() is 1 point in the verb's conditions,
    // the wear refusal comes from runSkillPackage: inc_skill_packages.js 169, include/mining.js 236-237).
    // A Metal Rock takes only a Fancy Pick (rock_metal_1.js conditions 198-202).
    const rockType = rock.rockType || ROCK_CATALOG[classId]?.rockType;
    const pick = findWorkingPick(inv, ctx.tools || null, miningToolWear(hasSkill ? learned : undefined), { rockType });
    const worn = !pick && Boolean(findWorkingPick(inv, ctx.tools || null, 1, { rockType }));
    const depleted = !!(rock.depleted || rock.chunksRemaining <= 0);
    const mineUpgrades = ctx.imaginationUpgrades || pc.imaginationUpgrades || [];
    const swing = (hasSkill && miningProfile(learned, pick || 'pick', mineUpgrades))
      || miningProfile(undefined, pick || 'pick', mineUpgrades);
    // G617: tell a player with no Truly Outrageous card how gems are found (the remake's own line).
    const gemHint = miningGemHint(swing);
    add('mine', 'mine', {
      sort: 10,
      energy: swing?.energy ?? MINING_COSTS.energy,
      durationMs: worn ? 0 : swing?.durationMs,
      enabled: !depleted && (!!pick || worn) && hasSkill,
      // rock_metal_1.js conditions 191-210: Mining I first, then the pick.
      reason: depleted
        ? rockStatusLabel(rock) || 'Depleted'
        : !hasSkill
          ? 'You need to know Mining I to use this.'
          : !pick && !worn
            ? noPickLine(rockType)
            : '',
      tooltip: depleted
        ? 'This rock is mined out'
        : worn
          ? 'Your pick does not have enough uses left.'
        : pick
          ? `Swing your ${pick.replace(/_/g, ' ')} (${rock.chunksRemaining ?? '?'} chunks left)${gemHint ? `. ${gemHint}` : ''}`
          : rockType === 'metal_rock' ? 'Requires a Fancy Pick in your pack' : 'Requires a Pick in your pack',
    });
    add('talk_to', 'inspect', {
      sort: 40,
      tooltip: rockStatusLabel(rock) || 'A mineable rock',
    });
  }

  out.sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label));
  return out;
}

/**
 * Apply GSJS-aligned verb reward if defined; sets effects.energy/mood/img.
 * @returns {{ ok: boolean, msgs?: string[] }}
 */
function applyRewardIfAny(classId, verbId, pc, effects) {
  const reward = getVerbReward(classId, verbId);
  if (!reward) return { ok: true };
  const r = applyVerbReward(pc, reward);
  if (!r.ok) {
    return {
      ok: false,
      msgs: [
        `You don't have enough energy (need ${reward.energyCost}, have ${Math.floor(pc.energy || 0)}).`,
      ],
    };
  }
  effects.energy += r.energy;
  effects.mood += r.mood;
  effects.img += r.xp;
  effects.xp = (effects.xp || 0) + r.xp;
  effects._activityBase = reward.activity;
  return { ok: true };
}

/**
 * A garden plot's answer (js/garden.js talkbacks, 3.5 s: items/item.js sendResponse 1064) with the
 * mark that its time is the source's own, so it stays up exactly that long (G629, js/read-time.js bubbleMs).
 */
function plotSpeech(speech) {
  return speech ? { ...speech, exact: true } : null;
}

function finalizeMsgs(msgs, effects) {
  const base = effects._activityBase || msgs[0] || 'You did a thing.';
  const line = formatActivityLine(
    base,
    {
      energy: effects.energy,
      mood: effects.mood,
      xp: effects.img || effects.xp,
      items: effects.items,
    },
    (id) => ITEM_LABELS[id] || ITEM_CATALOG[id]?.label || id
  );
  // Put activity line first for feed/toast
  if (line && (!msgs.length || msgs[0] !== line)) {
    msgs.unshift(line);
  }
  effects.activityLine = line;
  return msgs;
}

function spokenResult(classId, state, effects, options = {}) {
  const speech = nextDialogue(classId, state, options);
  if (!speech) return { ok: false, msgs: ['It has nothing to say right now.'], effects };
  return { ok: true, msgs: [formatSpokenLine(speech)], effects, speech };
}

/**
 * Execute a verb. Mutates inv/pc/target.state. Returns activity strings.
 */
export function runVerb(target, verbId, ctx) {
  const { pc, inv } = ctx;
  const classId = target.classId;
  const s = target.state || (target.state = {});
  const msgs = [];
  const effects = { energy: 0, mood: 0, img: 0, xp: 0, items: {} };

  const give = (id, n = 1) => {
    inv[id] = (inv[id] || 0) + n;
    effects.items[id] = (effects.items[id] || 0) + n;
  };
  const [verbBase, verbTarget, verbCount] = String(verbId || '').split(':');

  // --- Piggy feeding (npc_animal feed: up to one stack, crops queue Piggy Plops) ---
  if (classId === 'npc_piggy' && verbBase === 'feed') {
    const fed = feedAnimal(classId, s, inv, verbTarget, Number(verbCount) || 1);
    if (!fed.ok) return { ok: false, msgs: [fed.msg], effects };
    effects.items[fed.classTsid] = -fed.count;
    if (fed.xp) {
      // npc_piggy.js 673: stats_add_xp(2, false) takes the mood bonus.
      const xp = grantMoodXp(pc, fed.xp);
      effects.img = xp;
      effects.xp = xp;
    }
    if (fed.plops.length) queuePlops(target, fed.plops);
    effects._activityBase = fed.msg;
    msgs.push(fed.msg);
    finalizeMsgs(msgs, effects);
    // `snack`: the food did not fill a hungry Piggy (js/animal-husbandry.js piggySnackLine); game.js shows it after the feed.
    return { ok: true, msgs, effects, anim: 'feed', animalChanged: true, fedCount: fed.count, plops: fed.plops, snack: fed.snack || '' };
  }

  // --- Chicken: Request incubation (Animal Husbandry) ---
  if (classId === 'npc_chicken' && verbBase === 'incubate') {
    const started = startIncubation(s, inv, verbTarget, Date.now(), ctx.rng || Math.random);
    if (!started.ok) {
      return { ok: false, msgs: [started.msg], effects, speech: started.bubble ? { speaker: 'Chicken', text: started.bubble } : null };
    }
    effects.items[started.egg] = -1;
    msgs.push(started.msg);
    return {
      ok: true,
      msgs,
      effects,
      animalChanged: true,
      incubation: started,
      speech: { speaker: target.label || 'Chicken', text: started.bubble, durationMs: 6000 },
    };
  }

  const performKinship = (verb) => {
    const care = performAnimalKinship(s, classId, verb, {
      pc,
      inv,
      tools: ctx.tools,
      learned: ctx.skills?.learned || ctx.learned || [],
      rng: ctx.rng || Math.random,
    });
    effects.energy += care.effects?.energy || 0;
    effects.mood += care.effects?.mood || 0;
    effects.img += care.effects?.xp || 0;
    effects.xp += care.effects?.xp || 0;
    for (const [itemId, amount] of Object.entries(care.effects?.items || {})) {
      effects.items[itemId] = (effects.items[itemId] || 0) + amount;
    }
    return care;
  };
  // A verb that missed its success roll: the source's failure line, no slugs, marked failed.
  const failedSpeech = (verb, speaker = target.label || '') => {
    const said = verbResponse(classId, failureResponseKey(classId, verb), { rng: ctx.talkRng || Math.random, speaker });
    return said ? { ...said, failed: true } : null;
  };
  // The animal's answer to a finished verb, with that verb's slugs (sendResponse(key, pc, slugs)).
  // Austin 2026-11-13 (a Butterfly milked with no massage drew its refusal as one screen-wide float):
  // a refused or missed care verb's line goes after "You try to ..." in the activity, as the source's
  // buildVerbMessage did (item.js 26-37; npc_butterfly.js 743-746, npc_piggy.js 892-900 and 1779:
  // pc.sendActivity), so it shows in the notice and the log, never as a float.
  // A missed success roll adds its line only where the source's handler did (npc_piggy.js 1779, 1672:
  // `missLine`); elsewhere a miss keeps its short line as before.
  const triedLine = (tried, care, missLine = false) => (care.msg && (care.reason !== 'success_rate' || missLine) ? `${tried} ${care.msg}` : tried);
  const missFloat = (care, speech) => (!speech && !care.ok && care.reason === 'success_rate' && care.msg ? care.msg : '');
  const kinshipSpeech = (care, verb, bonus) => {
    // A missed success roll answers without slugs (npc_piggy.js 1774, 1676); a missed squeeze
    // says nothing (npc_chicken.js 1565-1572: CLICK_FAILURE, no response).
    if (!care.ok) return care.reason === 'success_rate' && verb !== 'squeeze' ? failedSpeech(verb) : null;
    const key = animalResponseKey(classId, verb, {
      learned: ctx.skills?.learned || ctx.learned || [],
      achievements: ctx.achievements || [],
      bonus,
    });
    return verbResponse(classId, key, {
      rng: ctx.talkRng || Math.random,
      slugs: slugsFromEffects(effects),
      speaker: target.label || '',
    });
  };

  // --- piggy ---
  if (classId === 'npc_piggy' && verbId === 'pet') {
    const care = performKinship('pet');
    const speech = kinshipSpeech(care, 'pet', false);
    // buildVerbMessage (item.js 26-37): a miss adds its line to the activity (npc_piggy.js 1779).
    effects._activityBase = care.ok ? 'You pet a Piggy.' : triedLine('You try to pet a Piggy.', care, true);
    if (!speech && care.ok) msgs.push('♥ oink');
    finalizeMsgs(msgs, effects);
    return {
      ok: care.ok,
      msgs,
      effects,
      speech,
      anim: 'pet',
      animalChanged: care.ok,
      animalKinshipAttempted: care.attempted,
      animalKinship: care,
    };
  }
  if (classId === 'npc_piggy' && verbId === 'nibble') {
    const care = performKinship('nibble');
    const drop = care.ok ? applyKinshipDrop(care.profile, { pc, inv, rng: ctx.rng || Math.random, rubeweed: ctx.rubeweed === true }) : null;
    for (const [itemId, amount] of Object.entries(drop?.items || {})) {
      effects.items[itemId] = (effects.items[itemId] || 0) + amount;
    }
    const speech = kinshipSpeech(care, 'nibble', care.superHarvest);
    effects._activityBase = care.ok ? 'You nibble a Piggy.' : triedLine('You try to nibble a Piggy.', care, true);
    if (!speech && care.ok) msgs.push(`${care.superHarvest ? 'Super Harvest! ' : ''}The Piggy looks philosophical about it.`);
    finalizeMsgs(msgs, effects);
    return {
      ok: care.ok,
      msgs,
      effects,
      speech,
      anim: 'nibble',
      animalChanged: care.ok,
      animalKinshipAttempted: care.attempted,
      animalKinship: care,
      skillPackageDrop: drop,
    };
  }
  if (classId === 'npc_piggy' && verbId === 'talk_to') {
    return spokenResult(classId, s, effects, { speaker: 'Piggy' });
  }

  // --- chicken ---
  if (classId === 'npc_chicken' && verbId === 'squeeze') {
    const care = performKinship('squeeze');
    const drop = care.ok ? applyKinshipDrop(care.profile, { pc, inv, rng: ctx.rng || Math.random, rubeweed: ctx.rubeweed === true }) : null;
    for (const [itemId, amount] of Object.entries(drop?.items || {})) {
      effects.items[itemId] = (effects.items[itemId] || 0) + amount;
    }
    const speech = kinshipSpeech(care, 'squeeze', care.superHarvest);
    effects._activityBase = care.ok ? 'You squeeze a Chicken.' : triedLine('You try to squeeze a Chicken.', care);
    if (!speech && care.ok) msgs.push(`${care.superHarvest ? 'Super Harvest! ' : ''}Buk!`);
    else if (missFloat(care, speech)) msgs.push(missFloat(care, speech));
    finalizeMsgs(msgs, effects);
    return {
      ok: care.ok,
      msgs,
      effects,
      speech,
      anim: 'squeeze',
      animalChanged: care.ok,
      animalKinshipAttempted: care.attempted,
      animalKinship: care,
      skillPackageDrop: drop,
    };
  }
  if (classId === 'npc_chicken' && verbId === 'butter_up') {
    ensureAnimalState(classId, s);
    // G279: npc_chicken.js 197-232 (js/animal-flattery.js); the mood takes the metabolic gate.
    const butter = butterUpChicken(s, pc);
    if (!butter.ok) return { ok: false, msgs: [butter.msg], effects };
    effects.energy += butter.effects.energy;
    effects.mood += butter.effects.mood;
    effects.img += butter.effects.xp;
    effects.xp += butter.effects.xp;
    effects._activityBase = butter.msg;
    finalizeMsgs(msgs, effects);
    return {
      ok: true,
      msgs,
      effects,
      animalChanged: true,
      // npc_chicken.js 225-230: slugs xp, mood, energy.
      speech: { speaker: target.label || 'Chicken', text: butter.bubble, durationMs: butter.bubbleMs, exact: true, slugs: slugsFromEffects(effects) },
    };
  }
  if (classId === 'npc_chicken' && verbId === 'talk_to') {
    return spokenResult(classId, s, effects, { speaker: 'Chicken' });
  }

  // --- butterfly ---
  if (classId === 'npc_butterfly' && verbId === 'massage') {
    const care = performKinship('massage');
    const speech = kinshipSpeech(care, 'massage', care.bonusTriggered);
    effects._activityBase = care.ok ? 'You massage a Butterfly.' : triedLine('You try to massage a Butterfly.', care);
    if (!speech && care.ok) msgs.push(`${care.bonusTriggered ? 'Expert touch! ' : ''}The Butterfly shimmers appreciatively.`);
    else if (missFloat(care, speech)) msgs.push(missFloat(care, speech));
    finalizeMsgs(msgs, effects);
    return {
      ok: care.ok,
      msgs,
      effects,
      speech,
      anim: 'massage',
      animalChanged: care.ok,
      animalKinshipAttempted: care.attempted,
      animalKinship: care,
    };
  }
  if (classId === 'npc_butterfly' && verbId === 'milk') {
    const care = performKinship('milk');
    const speech = kinshipSpeech(care, 'milk', care.superHarvest);
    effects._activityBase = care.ok ? 'You milk a Butterfly.' : triedLine('You try to milk a Butterfly.', care);
    if (!speech && care.ok) msgs.push(`${care.superHarvest ? 'Super Harvest! ' : ''}The Butterfly offers its most precious essence.`);
    else if (missFloat(care, speech)) msgs.push(missFloat(care, speech));
    finalizeMsgs(msgs, effects);
    return {
      ok: care.ok,
      msgs,
      effects,
      speech,
      anim: 'milk',
      animalChanged: care.ok,
      animalKinshipAttempted: care.attempted,
      animalKinship: care,
    };
  }
  if (classId === 'npc_butterfly' && verbId === 'sing_to') {
    // G279: npc_butterfly.js 594-687 (js/animal-flattery.js): iMG worth 5% of
    // the tank for twice that in energy, no mood, once a game day.
    const sung = singToButterfly(s, pc, {
      achievements: ctx.achievements || [],
      level: levelInfoForXp(pc.xp).level,
      akRank: highestAnimalKinshipRank(ctx.skills?.learned || ctx.learned || []),
      dayKey: getGameDayKey(ctx.now ?? Date.now()),
      rng: ctx.rng || Math.random,
    });
    if (!sung.ok) return { ok: false, msgs: [sung.msg], effects };
    effects.energy += sung.effects.energy;
    effects.img += sung.effects.xp;
    effects.xp += sung.effects.xp;
    effects._activityBase = sung.msg;
    finalizeMsgs(msgs, effects);
    return {
      ok: true,
      msgs,
      effects,
      animalChanged: true,
      wisdom: sung.wisdom,
      // npc_butterfly.js 661-677: slugs xp, energy.
      speech: { speaker: target.label || 'Butterfly', text: sung.bubble, durationMs: sung.bubbleMs, exact: true, slugs: slugsFromEffects(effects) },
    };
  }
  if (classId === 'npc_butterfly' && verbId === 'talk_to') {
    return spokenResult(classId, s, effects, { speaker: 'Butterfly' });
  }

  // --- trees / trants ---
  if (TREE_IDS.has(classId) && verbId === 'pet') {
    const care = performTrantCare(s, classId, 'pet', {
      pc,
      inv,
      tools: ctx.tools,
      learned: ctx.skills?.learned || ctx.learned || [],
      rng: ctx.rng || Math.random,
      // A Wood Tree the realtime server granted this on counts there (js/trant-care.js).
      woodCareShared: ctx.woodCareShared === true,
    });
    if (care.effects) {
      effects.energy += care.effects.energy || 0;
      effects.mood += care.effects.mood || 0;
      effects.img += care.effects.xp || 0;
      effects.xp += care.effects.xp || 0;
    }
    // include/trants.js / wood_tree.js: the tree answers with the package's slugs.
    const speech = care.ok
      ? verbResponse(classId, trantCareResponseKey('pet', { learned: ctx.skills?.learned || ctx.learned || [] }), {
          rng: ctx.talkRng || Math.random,
          slugs: slugsFromEffects(effects),
          speaker: TRANT_META[classId]?.label || 'Wood Tree',
        })
      : care.attempted && care.reason === 'failed'
        ? failedSpeech('pet', TRANT_META[classId]?.label || 'Wood Tree')
        : null;
    effects._activityBase = care.ok
      ? `You pet a ${TRANT_META[classId]?.label || 'Wood Tree'}.`
      : speech
        // include/trants.js 94-103: the failure's activity line, the tree's line in the bubble.
        ? care.msg
        : `You try to pet a ${TRANT_META[classId]?.label || 'Wood Tree'}.`;
    if (!speech) msgs.push(care.msg || 'Could not pet this tree.');
    finalizeMsgs(msgs, effects);
    return {
      ok: care.ok,
      msgs,
      effects,
      speech,
      anim: 'pet',
      trantCareChanged: care.ok,
      trantCareAttempted: care.attempted === true,
      trantCare: care,
    };
  }
  if (TREE_IDS.has(classId) && verbId === 'water') {
    const care = performTrantCare(s, classId, 'water', {
      pc,
      inv,
      tools: ctx.tools,
      learned: ctx.skills?.learned || ctx.learned || [],
      rng: ctx.rng || Math.random,
      // A Wood Tree the realtime server granted this on counts there (js/trant-care.js).
      woodCareShared: ctx.woodCareShared === true,
    });
    if (care.effects) {
      effects.energy += care.effects.energy || 0;
      effects.mood += care.effects.mood || 0;
      effects.img += care.effects.xp || 0;
      effects.xp += care.effects.xp || 0;
    }
    // include/trants.js / wood_tree.js: the tree answers with the package's slugs.
    const speech = care.ok
      ? verbResponse(classId, trantCareResponseKey('water', { learned: ctx.skills?.learned || ctx.learned || [] }), {
          rng: ctx.talkRng || Math.random,
          slugs: slugsFromEffects(effects),
          speaker: TRANT_META[classId]?.label || 'Wood Tree',
        })
      : care.attempted && care.reason === 'failed'
        ? failedSpeech('water', TRANT_META[classId]?.label || 'Wood Tree')
        : null;
    effects._activityBase = care.ok
      ? `You water a ${TRANT_META[classId]?.label || 'Wood Tree'}.`
      : speech
        // include/trants.js 94-103: the failure's activity line, the tree's line in the bubble.
        ? care.msg
        : `You try to water a ${TRANT_META[classId]?.label || 'Wood Tree'}.`;
    if (!speech) msgs.push(care.msg || 'Could not water this tree.');
    finalizeMsgs(msgs, effects);
    return {
      ok: care.ok,
      msgs,
      effects,
      speech,
      anim: 'water',
      trantCareChanged: care.ok,
      trantCareAttempted: care.attempted === true,
      toolChanged: care.attempted === true,
      trantCare: care,
    };
  }
  if (LIVING_TRANT_IDS.has(classId) && verbId === 'harvest') {
    const learned = ctx.skills?.learned || ctx.learned || [];
    const upgrades = ctx.imaginationUpgrades || pc.imaginationUpgrades || [];
    const arbor = resolveArborologyPackage(learned);
    // include/trants.js performHarvest 233-243: the fruit and the day's limit first, then
    // runSkillPackage's energy check, which refuses at energy <= cost (inc_skill_packages.js 177-178),
    // so a harvest never takes the last of your energy. harvestTrant is not pure: check before it.
    const gate = canHarvestTrant(s, arbor);
    if (!gate.ok) {
      return { ok: false, msgs: [gate.reason || 'Cannot harvest.'], effects };
    }
    if ((pc.energy || 0) <= arbor.energyCost) {
      return { ok: false, msgs: ["You're too tired to do that."], effects };
    }
    const result = harvestTrant(
      s,
      { learned, imaginationUpgrades: upgrades },
      { rng: ctx.rng || Math.random }
    );
    if (!result.ok) {
      return { ok: false, msgs: [result.reason || 'Cannot harvest.'], effects };
    }
    // Spend energy / gain mood & xp from Arborology package
    // G282: inc_skill_packages.js 486-488 metabolics_lose_energy: nothing lost while dead
    // (inc_metabolics.js 108-122, js/metabolics.js loseEnergy).
    effects.energy -= loseEnergy(pc, result.energyCost);
    // inc_skill_packages.js 524: the mood bonus is metabolics_add_mood,
    // nothing while dead (inc_metabolics.js 79-86).
    if (result.moodBonus > 0 && metabolicGain('mood').ok) {
      const moodBefore = Number(pc.mood) || 0;
      pc.mood = Math.min(moodMax(pc), moodBefore + result.moodBonus);
      // apiInc's change: what landed under the tank (the slug shows it).
      effects.mood += Math.max(0, pc.mood - moodBefore);
    }
    if (result.xpBonus) {
      // inc_skill_packages.js 532 (gardening_harvest): xp_bonus takes the mood bonus.
      const xp = grantMoodXp(pc, result.xpBonus);
      effects.img += xp;
      effects.xp = (effects.xp || 0) + xp;
    }
    give(result.fruitClass, result.amount);
    const label = result.fruitLabel || result.fruitClass;
    let line = `Harvested ${result.amount} ${label}.`;
    if (result.superHarvest) {
      line = `SUPER harvest! ${result.amount} ${label} (${result.superMultiplier}×).`;
    }
    msgs.push(line);
    if (result.remainingOnTree <= 0) {
      msgs.push('The tree is bare for now.');
    } else {
      msgs.push(`${result.remainingOnTree} left on the tree.`);
    }
    effects._activityBase =
      result.superHarvest
        ? `You super-harvest a ${TRANT_META[classId]?.label || 'tree'}.`
        : `You harvest a ${TRANT_META[classId]?.label || 'tree'}.`;
    finalizeMsgs(msgs, effects);
    return {
      ok: true,
      msgs,
      effects,
      anim: 'harvest',
      harvest: result,
      // include/trants.js 380-416: harvest talkbacks carry the package's slugs.
      speech: result.reaction
        ? {
            speaker: TRANT_META[classId]?.label || 'Tree',
            text: result.reaction,
            durationMs: 4200,
            slugs: slugsFromEffects(effects),
          }
        : null,
    };
  }
  if (classId === 'wood_tree' && verbId === 'harvest') {
    const result = harvestWoodTree(s, inv, pc, ctx.tools || {});
    if (!result.ok) return { ok: false, msgs: [result.msg || 'Cannot harvest this Wood Tree.'], effects };
    effects.energy -= result.energyCost;
    effects.items.plank = result.plankYield;
    effects._activityBase = `You harvest a Wood Tree with your ${result.toolLabel || 'Hatchet'}.`;
    msgs.push(result.line);
    msgs.push(`Harvested ${result.plankYield} planks. ${woodTreeStatusLabel(s)}.`);
    finalizeMsgs(msgs, effects);
    return {
      ok: true,
      msgs,
      effects,
      anim: 'harvest',
      woodTreeChanged: true,
      woodHarvest: result,
      // wood_tree.js 761: sendResponse(resp_type, pc, ret.slugs).
      speech: { speaker: 'Wood Tree', text: result.line, durationMs: 4600, slugs: slugsFromEffects(effects) },
    };
  }
  if (TREE_IDS.has(classId) && verbId === 'talk_to') {
    const meta = TRANT_META[classId];
    const mat = s.maturity != null ? maturityLabel(s.maturity) : 'unknown';
    const fallback = classId === 'wood_tree'
      ? 'I am wood. You are not. That is fine.'
      : meta
        ? `I am ${mat}, health ${s.health ?? '?'}, with ${s.fruitCount ?? 0} ${meta.fruitLabel} waiting.`
        : 'The fruit is patient. Are you?';
    return spokenResult(classId, s, effects, {
      speaker: meta?.label || (classId === 'wood_tree' ? 'Tree' : 'Fruit Tree'),
      fallback,
    });
  }

  if (classId === 'apple' && verbId === 'pickup') {
    give('apple', 1);
    msgs.push('Apple acquired. Boldly red.');
    return { ok: true, msgs, effects, remove: true };
  }

  if (isMusicblock(classId) && verbId === 'pickup') {
    const picked = collectMusicblock(ctx.musicblocks, inv, classId, ctx.streetTsid);
    if (!picked.ok) return { ok: false, msgs: ['That tune slipped away.'], effects };
    effects.items[classId] = 1;
    effects._activityBase = `You found ${picked.def.label}.`;
    msgs.push(
      picked.newDiscovery
        ? `${picked.def.label} acquired. A new tune for the collection!`
        : `${picked.def.label} acquired again.`
    );
    finalizeMsgs(msgs, effects);
    return {
      ok: true,
      msgs,
      effects,
      remove: true,
      musicblockPickup: picked,
    };
  }

  if (classId.startsWith('street_spirit_') && verbId === 'browse') {
    msgs.push(`${s.vendorLabel || 'The street spirit'} unfurls a tray of goods.`);
    return { ok: true, msgs, effects, openVendor: true };
  }
  if (classId.startsWith('street_spirit_') && verbId === 'talk_to') {
    // A regional spirit speaks its own region's lines (features/street-spirits-feature.js sets spiritDialogue).
    return spokenResult(s.spiritDialogue || classId, s, effects, {
      speaker: s.vendorLabel || 'Street Spirit',
    });
  }

  // Mineable rock node
  if ((ROCK_CATALOG[classId] || classId === 'mineable_rock') && (verbId === 'mine' || verbId === 'talk_to')) {
    ensureMiningItems();
    const rock = s.rock || s;
    tickMineRock(rock);
    if (verbId === 'talk_to') {
      const def = ROCK_CATALOG[classId];
      msgs.push(
        `${def?.label || 'Rock'}: ${rockStatusLabel(rock)}. Yields ${def?.chunkLabel || rock.chunkId || 'ore'}.`
      );
      return { ok: true, msgs, effects };
    }
    const learned = ctx.learned || ctx.skills?.learned || [];
    // A pick the player named: a dragged stack or a Pick's own Use (js/tool-choice.js).
    const chosen = takeToolChoice(target);
    const r = mineRock(rock, inv, pc, {
      learned,
      requireSkill: true,
      tool: chosen?.cls || null,
      copy: chosen?.copy ?? null,
      force: chosen?.force === true,
      now: Date.now(),
      toolState: ctx.tools,
      // Multiplayer: the realtime server rolled this swing (groddle-afternoon-server/objects.go).
      chunks: ctx.sharedChunks,
    });
    if (!r.ok) return { ok: false, msgs: r.msgs || ['Cannot mine.'], effects };
    if (r.effects) {
      effects.energy += r.effects.energy || 0;
      effects.xp = (effects.xp || 0) + (r.effects.xp || 0);
      effects.img += r.effects.xp || 0;
      if (r.chunkId && r.got) {
        effects.items[r.chunkId] = (effects.items[r.chunkId] || 0) + r.got;
      }
    }
    effects._activityBase = r.msgs?.[0] || 'You mine.';
    msgs.push(...(r.msgs || []));
    finalizeMsgs(msgs, effects);
    s.rock = rock;
    // include/mining.js 420-495: the rock answers the swing with its slugs.
    const speech = verbResponse(classId, rockResponseKey(rock.rockType || ROCK_CATALOG[classId]?.rockType, r.got, { cleared: r.cleared, gem: r.gem }), {
      rng: ctx.talkRng || Math.random,
      slugs: slugsFromEffects(effects),
      speaker: ROCK_CATALOG[classId]?.label || 'Rock',
    });
    return {
      ok: true,
      msgs,
      effects,
      speech,
      anim: 'mine',
      miningChanged: true,
      rock,
    };
  }

  // Per-plot world interaction (original: plot menus on the street)
  if (classId === 'garden_plot') {
    const garden = s.garden;
    const key = s.plotKey;
    if (!garden || !key) {
      return { ok: false, msgs: ['That plot is not ready.'], effects };
    }
    // #197: plant:<seed> is the seed the player chose (the Plant menu, a seed dropped on the plot).
    const chosenSeed = verbBase === 'plant' && verbTarget ? verbTarget : '';
    const preferSeed =
      chosenSeed ||
      ctx.seedId ||
      listPlantableSeeds(inv, garden.gardenType || 'default')[0]?.seedId;
    const opts = {
      inv,
      now: Date.now(),
      seedId: preferSeed,
      exactSeed: Boolean(chosenSeed),
      toolState: ctx.tools,
      learned: ctx.skills?.learned || ctx.learned || [],
      upgrades: ctx.imaginationUpgrades || pc.imaginationUpgrades || [],
      // G368: a shared public garden's verb runs with the page's own draws (features/shared-gardens-feature.js).
      ...(ctx.sharedGarden ? { rng: ctx.rng } : {}),
    };
    let r = null;
    if (verbBase === 'plant') r = plantPlot(garden, key, inv, pc, preferSeed, opts);
    else if (verbId === 'water') r = waterPlot(garden, key, pc, opts);
    else if (verbId === 'harvest') r = harvestPlot(garden, key, inv, pc, opts);
    else if (verbId === 'clear') r = clearPlot(garden, key, pc, opts);
    else if (verbId === 'fertilize') r = fertilizePlot(garden, key, inv, opts);
    else if (verbId === 'talk_to') {
      msgs.push(plotStatusLabel(s.plot) || 'A garden plot.');
      return { ok: true, msgs, effects };
    } else {
      return { ok: false, msgs: [`Cannot ${verbId} this plot.`], effects };
    }
    if (!r.ok) return { ok: false, msgs: r.msgs || ['Cannot do that.'], effects, speech: plotSpeech(r.speech), toastWithSpeech: Boolean(r.toastWithSpeech) };
    if (r.effects) {
      effects.energy += r.effects.energy || 0;
      effects.mood += r.effects.mood || 0;
      effects.xp = (effects.xp || 0) + (r.effects.xp || 0);
      effects.img += r.effects.xp || 0;
      if (r.effects.items) {
        for (const [id, n] of Object.entries(r.effects.items)) {
          effects.items[id] = (effects.items[id] || 0) + n;
        }
      }
    }
    // Sync plot ref after mutation
    s.plot = garden.plots[key];
    effects._activityBase = r.msgs?.[0] || 'You tend a plot';
    msgs.push(...(r.msgs || []));
    finalizeMsgs(msgs, effects);
    return {
      ok: true,
      msgs,
      effects,
      anim: verbBase,
      gardenChanged: true,
      gardenTarget: s.gardenEntity,
      // Ticket 68: what the plot did, for its quest and badge counters (quest-offers.js gardenPlotEvents).
      gardenPlot: {
        verb: verbBase,
        gardenType: garden.gardenType || 'default',
        home: Boolean(s.gardenEntity?.state?.detached),
        seedId: r.seedId || null,
        cropId: r.cropId || null,
        count: r.count || 0,
        baseCount: r.baseCount || 0,
        superHarvest: Boolean(r.superHarvest),
      },
      // garden_new.js talkback: the plot answers with a line and the slugs.
      speech: plotSpeech(r.speech),
    };
  }

  // Crop garden (state lives on target.state = garden model) — no tend dialog
  if ((classId === 'garden_new' || classId === 'garden') && verbId === 'water_all') {
    const garden = s.garden || s;
    if (!garden.plots) {
      return { ok: false, msgs: ['This garden has no plots.'], effects };
    }
    const r = waterAllPlots(garden, pc, {
      inv,
      toolState: ctx.tools,
      learned: ctx.skills?.learned || ctx.learned || [],
      upgrades: ctx.imaginationUpgrades || pc.imaginationUpgrades || [],
      ...(ctx.sharedGarden ? { rng: ctx.rng } : {}),
    });
    if (!r.ok) return { ok: false, msgs: r.msgs || ['Could not water.'], effects };
    effects.energy += r.effects?.energy || 0;
    effects._activityBase = `You water the garden (${r.watered} plots)`;
    msgs.push(...(r.msgs || []));
    finalizeMsgs(msgs, effects);
    return { ok: true, msgs, effects, anim: 'water', gardenChanged: true };
  }
  if ((classId === 'garden_new' || classId === 'garden') && verbId === 'talk_to') {
    const garden = s.garden || s;
    const n = garden.plots ? Object.keys(garden.plots).length : 0;
    const herb = garden.gardenType === 'herb';
    const crops = Object.values(SEED_CATALOG)
      .filter((x) => x.gardenType === (herb ? 'herb' : 'default'))
      .map((x) => x.cropLabel)
      .slice(0, 4)
      .join(', ');
    msgs.push(
      herb
        ? `Herb garden: ${garden.cols || '?'}×${garden.rows || '?'} plots (${n}). Try ${crops}.`
        : `Crop garden: ${garden.cols || '?'}×${garden.rows || '?'} plots (${n}). Try ${crops}.`
    );
    return { ok: true, msgs, effects };
  }

  return { ok: false, msgs: [`No handler for ${classId}.${verbId}`], effects };
}
