/**
 * Glitch-style verb catalog (mined from GSJS item defs).
 * Simplified conditions/handlers for the Groddle spike.
 */

import { getVerbReward, applyVerbReward, formatActivityLine } from './js/verb-rewards.js?v=woodcutting-1';
import {
  TRANT_META,
  resolveArborologyPackage,
  canHarvestTrant,
  harvestTrant,
  maturityLabel,
} from './js/trants.js?v=trant-harvest-2';
import {
  quoteTrantCare,
  performTrantCare,
} from './js/trant-care.js?v=trant-care-2';
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
} from './js/garden.js?v=tool-condition-1';
import {
  ROCK_CATALOG,
  MINING_COSTS,
  miningProfile,
  mineRock,
  tickMineRock,
  findWorkingPick,
  rockStatusLabel,
  ensureMiningItems,
} from './js/mining.js?v=rock-cells-2';
import {
  ANIMAL_CLASS_IDS,
  ensureAnimalState,
  listAnimalFeedOptions,
  feedAnimal,
} from './js/animals.js?v=husbandry-1';
import {
  quoteAnimalKinship,
  performAnimalKinship,
} from './js/animal-kinship.js?v=butterfly-care-1';
import {
  MUSICBLOCK_CATALOG,
  collectMusicblock,
  isMusicblock,
} from './js/musicblocks.js?v=musicblocks-note-2';
import { nextDialogue, formatSpokenLine } from './js/dialogue.js?v=dialogue-1';
import {
  ensureWoodTreeState,
  quoteWoodTreeHarvest,
  harvestWoodTree,
  woodTreeStatusLabel,
} from './js/woodcutting.js?v=woodcutting-2';
import { findWorkingRookTool } from './js/rook-woods.js?v=rook-woods-1';
import {
  HERDKEEPING,
  INCUBATION,
  applyKinshipDrop,
  captureVerbState,
  incubateVerbState,
  namingVerbs,
  queuePlops,
  startIncubation,
} from './js/animal-husbandry.js';
import { moodMax } from './js/metabolics.js';
import { ITEM_CATALOG } from './js/inventory.js?v=catalog-unified-3';

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
  apple: 'assets/sprites/icons/apple.png',
  milk_butterfly: 'assets/sprites/icons/milk_butterfly.png',
  butterfly_lotion: 'assets/sprites/icons/butterfly_lotion.png',
  grain: 'assets/sprites/icons/grain.png',
  plank: 'assets/sprites/icons/plank.png',
  cherry: 'assets/sprites/icons/cherry.png',
  flour: 'assets/sprites/icons/flour.png',
  bun: 'assets/sprites/icons/bun.png',
  sammich: 'assets/sprites/icons/sammich.png',
  meat: 'assets/sprites/icons/meat.png',
  pinch_of_salt: 'assets/sprites/icons/pinch_of_salt.png',
  egg_plain: 'assets/sprites/icons/egg_plain.png',
  bean_plain: 'assets/sprites/icons/bean_plain.png',
  plain_bubble: 'assets/sprites/icons/plain_bubble.png',
  all_spice: 'assets/sprites/icons/all_spice.png',
  general_vapour: 'assets/sprites/icons/general_vapour.png',
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
  ITEM_ICONS[def.classTsid] = `assets/sprites/icons/${def.classTsid}.png`;
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
    if (enabled && energy > 0 && pc.energy < energy) {
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
        ? `Stop following ${target.label || 'this Glitch'}`
        : `Follow ${target.label || 'this Glitch'} from street to street`,
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
    add('return_to_world', 'return to Ur', {
      sort: 10,
      tooltip: s.returnLabel ? `Teleport back to ${s.returnLabel}` : 'Teleport back to the world',
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
      tooltip: 'Spin to the next letter',
    });
  }

  if (classId === 'npc_letterblock') {
    const puzzle = s.puzzleState;
    add('talk_to', 'talk to', {
      sort: 10,
      enabled: Boolean(puzzle),
      tooltip: 'Ask Mr. Block about the current riddle',
    });
    add('leave', 'leave playroom', {
      sort: 90,
      enabled: puzzle?.status !== 'solved',
      tooltip: 'Return to the street and abandon this attempt',
    });
  }

  if (classId === 'legalize_transit_gate') {
    const action = target?.state?.routeAction;
    const expectedStage = action === 'depart_back_alley'
      ? 'gregarious_departure'
      : action === 'travel_gregarious'
        ? 'back_alley_station'
        : 'gregarious_arrival';
    const verbId = action === 'exit_gregarious_station' ? 'exit' : 'travel';
    add(verbId, verbId === 'exit' ? 'exit station' : 'travel', {
      sort: 10,
      enabled: Boolean(s.legalizeState) && s.legalizeState.stage === expectedStage,
      tooltip:
        action === 'depart_back_alley'
          ? 'Travel to The Back Alley'
          : action === 'travel_gregarious'
            ? 'Travel to Gregarious Grange'
            : 'Exit to Gregarious Grange',
    });
  }

  if (classId === 'legalize_subway_entrance') {
    add('enter', 'enter station', {
      sort: 10,
      enabled:
        Boolean(s.legalizeState) &&
        s.legalizeState.stage === 'back_alley_briefed',
      reason:
        s.legalizeState?.stage === 'back_alley'
          ? 'Speak with the Shady Bureaucrat first.'
          : '',
      tooltip: 'Enter The Back Alley Subway Station',
    });
  }

  if (classId === 'legalize_hall_entrance') {
    add('enter', 'enter hall', {
      sort: 10,
      enabled:
        Boolean(s.legalizeState) &&
        s.legalizeState.stage === 'grange_exterior',
      tooltip: 'Enter the Bureaucratic Hall',
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
      enabled: pet.ok,
      reason: pet.ok ? '' : pet.msg,
    });
    const nibble = quoteAnimalKinship(s, classId, 'nibble', kinshipCtx);
    add('nibble', 'nibble', {
      sort: 20,
      energy: nibble.profile?.energyCost || 5,
      durationMs: nibble.profile?.durationMs,
      tooltip: nibble.ok
        ? `Just a little nibbly-wibbly · yields ${nibble.profile.bonusAmount} Meat`
        : 'Just a little nibbly-wibbly · yields Meat',
      enabled: nibble.ok,
      reason: nibble.ok ? '' : nibble.msg,
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
      enabled: squeeze.ok,
      reason: squeeze.ok ? '' : squeeze.msg,
    });
    const feedOptions = listAnimalFeedOptions(classId, inv);
    add('feed', 'feed', {
      sort: 20,
      enabled: feedOptions.length > 0,
      reason: feedOptions.length ? '' : "You don't have anything this Chicken wants to eat.",
      tooltip: feedOptions.length
        ? `Choose from ${feedOptions.length} eligible pack item${feedOptions.length === 1 ? '' : 's'}`
        : 'Feed it grain or corn',
    });
    add('butter_up', 'butter up', {
      sort: 60,
      tooltip: 'Tell this chicken how wonderful it is',
      enabled: !s.buttered,
      reason: s.buttered ? 'This Chicken has received enough compliments today.' : '',
    });
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
      enabled: milk.ok,
      reason: milk.ok ? '' : milk.msg,
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
      enabled: massage.ok,
      reason: massage.ok ? '' : massage.msg,
    });
    add('sing_to', 'sing to', {
      sort: 30,
      energy: 1,
      tooltip: 'Your song might scare them or charm them',
    });
    for (const verb of namingVerbs(classId, s, husbandryCtx(ctx))) add(verb.id, verb.label, verb);
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
        ? `Give water · Watering Can · ${waterCare.profile.toolWear} condition`
        : 'Give water · Watering Can required',
      durationMs: waterCare.profile?.durationMs,
      enabled: waterCare.ok,
      reason: waterCare.ok ? '' : waterCare.msg,
    });
    if (classId === 'wood_tree') {
      const harvest = quoteWoodTreeHarvest(s, inv, pc, ctx.tools || {});
      add('harvest', 'harvest', {
        sort: 30,
        energy: harvest.energyCost || 20,
        tooltip: harvest.ok
          ? `Extract ${harvest.plankYield} planks with your Hatchet · ${harvest.hatchetWear} condition`
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
    add('pickup', 'pick up', {
      sort: 10,
      tooltip: `Put ${count > 1 ? `${count} × ` : ''}${itemLabel} in your pack`,
    });
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
    add('check_favor', 'check favor', {
      sort: 20,
      tooltip: 'Review favor and claim a Giant emblem when ready',
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
  if (classId === 'garden_new' || classId === 'garden') {
    const canWater = hasWateringCan(inv);
    add('water_all', 'water all', {
      sort: 10,
      energy: 2,
      enabled: canWater,
      reason: canWater ? '' : 'Need a Watering Can',
      tooltip: canWater
        ? 'Water every dry growing plot'
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
    if (st === 'clean') {
      add('plant', 'plant', {
        sort: 10,
        energy: gardenCost('plant'),
        enabled: seeds.length > 0,
        reason: seeds.length ? '' : gType === 'herb' ? 'Need herb seeds' : 'Need crop seeds',
        tooltip: seeds.length
          ? `Plant ${seeds[0].label}`
          : 'Buy seeds from the street spirit',
      });
    }
    if ((st === 'seeds' || st === 'shoots') && !plot?.wet) {
      add('water', 'water', {
        sort: 10,
        energy: gardenCost('water'),
        enabled: hasWateringCan(inv),
        reason: hasWateringCan(inv) ? '' : 'Need a Watering Can',
        tooltip: 'Water so this plot can grow',
      });
    }
    if (st === 'crop') {
      const harvestProfile = gardenActionProfile(gType, 'harvest', gardenLearned);
      add('harvest', 'harvest', {
        sort: 10,
        energy: harvestProfile.energy,
        tooltip: harvestProfile.halfHarvest
          ? `Pick the crop (half yield without ${gType === 'herb' ? 'Herbalism' : 'Croppery'})`
          : 'Pick the crop',
      });
    }
    if (st === 'dirty') {
      add('clear', 'clear', {
        sort: 10,
        energy: gardenCost('clear'),
        enabled: hasHoe(inv),
        reason: hasHoe(inv) ? '' : 'Need a Hoe',
        tooltip: 'Hoe the dirt so you can plant again',
      });
    }
    if ((st === 'seeds' || st === 'shoots') && plot?.wet) {
      add('talk_to', 'check', {
        sort: 40,
        tooltip: 'Growing — come back when ripe',
      });
    }
  }

  // Mineable rocks (GSJS rock_metal / dullite / beryl / sparkly + include/mining.js)
  if (ROCK_CATALOG[classId] || classId === 'mineable_rock') {
    const rock = s.rock || s;
    tickMineRock(rock);
    const pick = findWorkingPick(inv);
    const learned = ctx.learned || ctx.skills?.learned || [];
    const hasSkill =
      learned.includes('mining_1') ||
      learned.includes('mining_2') ||
      learned.includes('mining_3') ||
      learned.includes('mining_4');
    const depleted = !!(rock.depleted || rock.chunksRemaining <= 0);
    const mineUpgrades = ctx.imaginationUpgrades || pc.imaginationUpgrades || [];
    const swing = (hasSkill && miningProfile(learned, pick || 'pick', mineUpgrades))
      || miningProfile(undefined, pick || 'pick', mineUpgrades);
    add('mine', 'mine', {
      sort: 10,
      energy: swing?.energy ?? MINING_COSTS.energy,
      durationMs: swing?.durationMs,
      enabled: !depleted && !!pick && hasSkill,
      reason: depleted
        ? rockStatusLabel(rock) || 'Depleted'
        : !pick
          ? "You'll need a pick first."
          : !hasSkill
            ? 'Need Mining I'
            : '',
      tooltip: depleted
        ? 'This rock is mined out'
        : pick
          ? `Swing your ${pick.replace(/_/g, ' ')} (${rock.chunksRemaining ?? '?'} chunks left)`
          : 'Requires a Pick in your pack',
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
      pc.imagination = (pc.imagination || 0) + fed.xp;
      pc.xp = (pc.xp || 0) + fed.xp;
      effects.img = fed.xp;
      effects.xp = fed.xp;
    }
    if (fed.plops.length) queuePlops(target, fed.plops);
    effects._activityBase = fed.msg;
    msgs.push(fed.msg);
    finalizeMsgs(msgs, effects);
    return { ok: true, msgs, effects, anim: 'feed', animalChanged: true, fedCount: fed.count, plops: fed.plops };
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

  // --- animal feeding (GSJS target-item verb, flattened into pack-backed choices) ---
  if (classId === 'npc_chicken' && verbBase === 'feed') {
    const fed = feedAnimal(classId, s, inv, verbTarget);
    if (!fed.ok) return { ok: false, msgs: [fed.msg], effects };
    effects.items[fed.classTsid] = -1;
    const moodBefore = pc.mood || 0;
    pc.mood = Math.min(moodMax(pc), moodBefore + 2);
    effects.mood = pc.mood - moodBefore;
    pc.imagination = (pc.imagination || 0) + 2;
    pc.xp = (pc.xp || 0) + 2;
    effects.img = 2;
    effects.xp = 2;
    msgs.push(`You fed the ${classId === 'npc_piggy' ? 'Piggy' : 'Chicken'} one ${fed.label}.`);
    finalizeMsgs(msgs, effects);
    return { ok: true, msgs, effects, anim: 'feed', animalChanged: true };
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

  // --- piggy ---
  if (classId === 'npc_piggy' && verbId === 'pet') {
    const care = performKinship('pet');
    effects._activityBase = care.ok ? 'You pet a Piggy.' : 'You try to pet a Piggy.';
    msgs.push(care.ok ? '♥ oink' : care.msg);
    finalizeMsgs(msgs, effects);
    return {
      ok: care.ok,
      msgs,
      effects,
      anim: 'pet',
      animalChanged: care.ok,
      animalKinshipAttempted: care.attempted,
      animalKinship: care,
    };
  }
  if (classId === 'npc_piggy' && verbId === 'nibble') {
    const care = performKinship('nibble');
    const drop = care.ok ? applyKinshipDrop(care.profile, { pc, inv, rng: ctx.rng || Math.random }) : null;
    for (const [itemId, amount] of Object.entries(drop?.items || {})) {
      effects.items[itemId] = (effects.items[itemId] || 0) + amount;
    }
    effects._activityBase = care.ok ? 'You nibble a Piggy.' : 'You try to nibble a Piggy.';
    msgs.push(care.ok
      ? `${care.superHarvest ? 'Super Harvest! ' : ''}The Piggy looks philosophical about it.`
      : care.msg);
    finalizeMsgs(msgs, effects);
    return {
      ok: care.ok,
      msgs,
      effects,
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
    const drop = care.ok ? applyKinshipDrop(care.profile, { pc, inv, rng: ctx.rng || Math.random }) : null;
    for (const [itemId, amount] of Object.entries(drop?.items || {})) {
      effects.items[itemId] = (effects.items[itemId] || 0) + amount;
    }
    effects._activityBase = care.ok ? 'You squeeze a Chicken.' : 'You try to squeeze a Chicken.';
    msgs.push(care.ok ? `${care.superHarvest ? 'Super Harvest! ' : ''}Buk!` : care.msg);
    finalizeMsgs(msgs, effects);
    return {
      ok: care.ok,
      msgs,
      effects,
      anim: 'squeeze',
      animalChanged: care.ok,
      animalKinshipAttempted: care.attempted,
      animalKinship: care,
      skillPackageDrop: drop,
    };
  }
  if (classId === 'npc_chicken' && verbId === 'butter_up') {
    ensureAnimalState(classId, s);
    if (s.buttered) return { ok: false, msgs: ['This Chicken has received enough compliments today.'], effects };
    s.buttered = true;
    const moodBefore = pc.mood || 0;
    pc.mood = Math.min(moodMax(pc), moodBefore + 6);
    effects.mood += pc.mood - moodBefore;
    msgs.push('You tell the chicken it is magnificent. It pretends not to care.');
    finalizeMsgs(msgs, effects);
    return { ok: true, msgs, effects, animalChanged: true };
  }
  if (classId === 'npc_chicken' && verbId === 'talk_to') {
    return spokenResult(classId, s, effects, { speaker: 'Chicken' });
  }

  // --- butterfly ---
  if (classId === 'npc_butterfly' && verbId === 'massage') {
    const care = performKinship('massage');
    effects._activityBase = care.ok ? 'You massage a Butterfly.' : 'You try to massage a Butterfly.';
    msgs.push(care.ok
      ? `${care.bonusTriggered ? 'Expert touch! ' : ''}The Butterfly shimmers appreciatively.`
      : care.msg);
    finalizeMsgs(msgs, effects);
    return {
      ok: care.ok,
      msgs,
      effects,
      anim: 'massage',
      animalChanged: care.ok,
      animalKinshipAttempted: care.attempted,
      animalKinship: care,
    };
  }
  if (classId === 'npc_butterfly' && verbId === 'milk') {
    const care = performKinship('milk');
    effects._activityBase = care.ok ? 'You milk a Butterfly.' : 'You try to milk a Butterfly.';
    msgs.push(care.ok
      ? `${care.superHarvest ? 'Super Harvest! ' : ''}The Butterfly offers its most precious essence.`
      : care.msg);
    finalizeMsgs(msgs, effects);
    return {
      ok: care.ok,
      msgs,
      effects,
      anim: 'milk',
      animalChanged: care.ok,
      animalKinshipAttempted: care.attempted,
      animalKinship: care,
    };
  }
  if (classId === 'npc_butterfly' && verbId === 'sing_to') {
    pc.energy = Math.max(0, pc.energy - 1);
    effects.energy -= 1;
    pc.mood = Math.min(moodMax(pc), pc.mood + 4);
    effects.mood += 4;
    msgs.push('You sing. The butterfly wafts thoughtfully.');
    return { ok: true, msgs, effects };
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
    });
    if (care.effects) {
      effects.energy += care.effects.energy || 0;
      effects.mood += care.effects.mood || 0;
      effects.img += care.effects.xp || 0;
      effects.xp += care.effects.xp || 0;
    }
    effects._activityBase = care.ok
      ? `You pet a ${TRANT_META[classId]?.label || 'Wood Tree'}.`
      : `You try to pet a ${TRANT_META[classId]?.label || 'Wood Tree'}.`;
    msgs.push(care.msg || 'Could not pet this tree.');
    finalizeMsgs(msgs, effects);
    return {
      ok: care.ok,
      msgs,
      effects,
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
    });
    if (care.effects) {
      effects.energy += care.effects.energy || 0;
      effects.mood += care.effects.mood || 0;
      effects.img += care.effects.xp || 0;
      effects.xp += care.effects.xp || 0;
    }
    effects._activityBase = care.ok
      ? `You water a ${TRANT_META[classId]?.label || 'Wood Tree'}.`
      : `You try to water a ${TRANT_META[classId]?.label || 'Wood Tree'}.`;
    msgs.push(care.msg || 'Could not water this tree.');
    finalizeMsgs(msgs, effects);
    return {
      ok: care.ok,
      msgs,
      effects,
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
    // Energy check before mutating tree (harvestTrant is not pure)
    if ((pc.energy || 0) < arbor.energyCost) {
      return {
        ok: false,
        msgs: [
          `You don't have enough energy (need ${arbor.energyCost}, have ${Math.floor(pc.energy || 0)}).`,
        ],
        effects,
      };
    }
    const gate = canHarvestTrant(s, arbor);
    if (!gate.ok) {
      return { ok: false, msgs: [gate.reason || 'Cannot harvest.'], effects };
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
    pc.energy -= result.energyCost;
    effects.energy -= result.energyCost;
    if (result.moodBonus) {
      pc.mood = Math.min(moodMax(pc), (pc.mood || 0) + result.moodBonus);
      effects.mood += result.moodBonus;
    }
    if (result.xpBonus) {
      pc.imagination = (pc.imagination || 0) + result.xpBonus;
      pc.xp = (pc.xp || 0) + result.xpBonus;
      effects.img += result.xpBonus;
      effects.xp = (effects.xp || 0) + result.xpBonus;
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
      speech: result.reaction
        ? {
            speaker: TRANT_META[classId]?.label || 'Tree',
            text: result.reaction,
            durationMs: 4200,
          }
        : null,
    };
  }
  if (classId === 'wood_tree' && verbId === 'harvest') {
    const result = harvestWoodTree(s, inv, pc, ctx.tools || {});
    if (!result.ok) return { ok: false, msgs: [result.msg || 'Cannot harvest this Wood Tree.'], effects };
    effects.energy -= result.energyCost;
    effects.items.plank = result.plankYield;
    effects._activityBase = 'You harvest a Wood Tree with your Hatchet.';
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
      speech: { speaker: 'Wood Tree', text: result.line, durationMs: 4600 },
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
    return spokenResult(classId, s, effects, {
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
    const r = mineRock(rock, inv, pc, {
      learned,
      requireSkill: true,
      now: Date.now(),
      toolState: ctx.tools,
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
    return {
      ok: true,
      msgs,
      effects,
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
    const preferSeed =
      ctx.seedId ||
      listPlantableSeeds(inv, garden.gardenType || 'default')[0]?.seedId;
    const opts = {
      inv,
      now: Date.now(),
      seedId: preferSeed,
      toolState: ctx.tools,
      learned: ctx.skills?.learned || ctx.learned || [],
      upgrades: ctx.imaginationUpgrades || pc.imaginationUpgrades || [],
    };
    let r = null;
    if (verbId === 'plant') r = plantPlot(garden, key, inv, pc, preferSeed, opts);
    else if (verbId === 'water') r = waterPlot(garden, key, pc, opts);
    else if (verbId === 'harvest') r = harvestPlot(garden, key, inv, pc, opts);
    else if (verbId === 'clear') r = clearPlot(garden, key, pc, opts);
    else if (verbId === 'talk_to') {
      msgs.push(plotStatusLabel(s.plot) || 'A garden plot.');
      return { ok: true, msgs, effects };
    } else {
      return { ok: false, msgs: [`Cannot ${verbId} this plot.`], effects };
    }
    if (!r.ok) return { ok: false, msgs: r.msgs || ['Cannot do that.'], effects };
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
      anim: verbId,
      gardenChanged: true,
      gardenTarget: s.gardenEntity,
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
