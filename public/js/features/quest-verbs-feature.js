/**
 * Quest verbs: world verbs that show only while a quest needs them.
 *
 * G453, Slather (items/npc_shrine_grendaline.js 496-529): on a Grendaline
 * shrine, while A Slatheration of Jellisacs (jellisachands_donate_jellisacs) is
 * open and its super_harvest_jellisac counter is already above 0. It removes
 * up to 4 Jellisac clumps (removeItemStackClass('jellisac_clump', 4)), counts
 * jellisacs_slathered (quest event shrine_slathered:grendaline) and says the
 * source's activity line. The splatter overlay (showSplatterOverlay) is not
 * drawn here.
 *
 * G447, Give a cubimal to (items/street_spirit.js 132-215, the npc base verb,
 * hasCubimal 880-919): on a character a cubimal looks like, while Mini Me, Mini
 * You (mini_me_mini_you) is open and you carry that cubimal. Each cubimal
 * class can be given once (counters npcs_given_cubimals by cubimal, kept in
 * this feature's save). The cubimal is used up, the character says one of six
 * lines, and npcs_given_cubimals goes up (quest event cubimal_given:<cubimal>).
 * Feature-owned characters get it through the host's extraVerbs hook, the
 * rest through decorateVerbs. The three Street Spirit rows match only a
 * target of that class: the remake's vendor spirits are vendor-classed
 * (street_spirit_groceries and the rest), so they do not take one yet.
 */

import { removeItem, countItem } from '../inventory.js?v=85d4faba';

export const QUEST_VERB_PREFIX = 'questverb_';
export const SLATHER_QUEST = 'jellisachands_donate_jellisacs';
export const SLATHER_VERB = `${QUEST_VERB_PREFIX}slather`;
export const SLATHER_CLUMPS = 4;
export const SLATHER_COPY = Object.freeze({
  label: 'slather',
  tooltip: 'Slather the Shrine in Jellisacs',
  done: 'You slathered 4 Jellisacs on the front of the shrine. Grendaline will be so pleased! But eww, gross, your hands are all sticky.',
});

export const CUBIMAL_QUEST = 'mini_me_mini_you';
export const GIVE_CUBIMAL_VERB = `${QUEST_VERB_PREFIX}give_cubimal`;
/** street_spirit.js hasCubimal 880-919: the character class and the cubimal of it. */
export const CUBIMAL_LIKENESS = Object.freeze({
  hell_bartender: 'npc_cubimal_hellbartender',
  npc_batterfly: 'npc_cubimal_batterfly',
  npc_bureaucrat: 'npc_cubimal_bureaucrat',
  npc_butterfly: 'npc_cubimal_butterfly',
  npc_cactus: 'npc_cubimal_cactus',
  npc_cooking_vendor: 'npc_cubimal_mealvendor',
  npc_crab: 'npc_cubimal_crab',
  npc_crafty_bot: 'npc_cubimal_craftybot',
  npc_deimaginator: 'npc_cubimal_deimaginator',
  npc_firefly: 'npc_cubimal_firefly',
  npc_fox: 'npc_cubimal_fox',
  npc_fox_ranger: 'npc_cubimal_foxranger',
  npc_garden_gnome: 'npc_cubimal_gnome',
  npc_gardening_vendor: 'npc_cubimal_gardeningtoolsvendor',
  npc_gwendolyn: 'npc_cubimal_gwendolyn',
  npc_jabba2: 'npc_cubimal_helga',
  npc_jabba1: 'npc_cubimal_unclefriendly',
  npc_juju_black: 'npc_cubimal_juju',
  npc_juju_green: 'npc_cubimal_juju',
  npc_juju_red: 'npc_cubimal_juju',
  npc_juju_yellow: 'npc_cubimal_juju',
  npc_maintenance_bot: 'npc_cubimal_maintenancebot',
  npc_newxp_dustbunny: 'npc_cubimal_dustbunny',
  npc_piggy: 'npc_cubimal_piggy',
  npc_piggy_explorer: 'npc_cubimal_ilmenskiejones',
  npc_quest_giver_widget: 'npc_cubimal_greeterbot',
  npc_rube: 'npc_cubimal_rube',
  npc_sloth: 'npc_cubimal_sloth',
  npc_smuggler: 'npc_cubimal_smuggler',
  npc_sno_cone_vending_machine: 'npc_cubimal_snoconevendor',
  npc_squid: 'npc_cubimal_squid',
  npc_tool_vendor: 'npc_cubimal_toolvendor',
  npc_yoga_frog: 'npc_cubimal_frog',
  phantom_glitch: 'npc_cubimal_phantom',
  street_spirit_firebog: 'npc_cubimal_firebogstreetspirit',
  street_spirit_groddle: 'npc_cubimal_groddlestreetspirit',
  street_spirit_zutto: 'npc_cubimal_uraliastreetspirit',
});
/** street_spirit.js 177-184: what the character says. */
export const CUBIMAL_GIFT_RESPONSES = Object.freeze([
  'Pour moi? How kind of you! I feel all fluttery inside!',
  'Oh yes, this is very handsome. Thank you so much!',
  'A passable likeness. Always nice to know that someone is thinking of little old me!',
  'Well what have we here? It\'s a bit... square. But it captures the essence, doesn\'t it?',
  'Cubimals are my favorite! And this one is my favoritest favorite!',
  'I shall carry it with me always, and cherish the memory of your kindness',
]);

/** Cubimal classes already given (pc.counters npcs_given_cubimals), from this feature's save. */
let givenCubimals = [];

const questOpen = (questState, id) => Boolean(questState?.active?.[id]) && !questState?.offers?.failed?.[id];

/** The Give a cubimal row for a character, or null (conditions 147-160). */
export function giveCubimalVerb(target, questState, inv, given = givenCubimals) {
  const cubimal = CUBIMAL_LIKENESS[target?.classId];
  if (!cubimal || !questOpen(questState, CUBIMAL_QUEST)) return null;
  const label = target.label || target.classId;
  const row = { id: GIVE_CUBIMAL_VERB, label: 'Give a cubimal to', sort: 50, tooltip: `Give ${label} a cubimal likeness`, enabled: true, reason: '', energy: 0 };
  if (given.includes(cubimal)) return { ...row, enabled: false, reason: `You already gave away a ${label} cubimal` };
  if (countItem(inv, cubimal) < 1) return { ...row, enabled: false, reason: `You don't have a cubimal of ${label}` };
  return row;
}

/** The quest is todo (accepted, not failed) and the super harvest has landed. */
export function slatherOpen(questState) {
  const quest = questState?.active?.[SLATHER_QUEST];
  if (!quest || questState?.offers?.failed?.[SLATHER_QUEST]) return false;
  return (Number(quest.progress?.super_harvest_jellisac) || 0) > 0;
}

export function isGrendalineShrine(target) {
  return target?.classId === 'npc_shrine_grendaline' || (String(target?.classId || '').startsWith('npc_shrine_') && target?.state?.giantId === 'grendaline');
}

/** The slather row for a shrine's menu, or null. */
export function slatherVerb(target, questState) {
  if (!isGrendalineShrine(target) || !slatherOpen(questState)) return null;
  return { id: SLATHER_VERB, label: SLATHER_COPY.label, sort: 56, tooltip: SLATHER_COPY.tooltip, enabled: true, reason: '', energy: 0 };
}

/** The slather itself: up to 4 clumps go, the counter moves. */
export function performSlather(inv) {
  const removed = Math.min(SLATHER_CLUMPS, countItem(inv, 'jellisac_clump'));
  if (removed > 0) removeItem(inv, 'jellisac_clump', removed);
  return { ok: true, removed, msg: SLATHER_COPY.done };
}

export const questVerbsFeature = {
  id: 'quest-verbs',

  decorateVerbs(target, verbs, engine) {
    const rows = [slatherVerb(target, engine.questState), giveCubimalVerb(target, engine.questState, engine.inv)].filter(Boolean);
    if (!rows.length) return null;
    // In by sort_on, leaving the target's own rows in their order.
    const out = [...verbs];
    for (const row of rows) {
      const at = out.findIndex((v) => Number.isFinite(v.sort) && v.sort > row.sort);
      if (at < 0) out.push(row);
      else out.splice(at, 0, row);
    }
    return out;
  },

  /** feature-host verbsFor: the same rows on characters other features own (fox, crab, sloth...). */
  extraVerbs(target, engine) {
    const row = giveCubimalVerb(target, engine.questState, engine.inv);
    return row ? [row] : null;
  },

  save() {
    return { given: [...givenCubimals] };
  },

  restore(slice) {
    givenCubimals = Array.isArray(slice?.given) ? [...new Set(slice.given.filter((id) => typeof id === 'string' && id.startsWith('npc_cubimal_')))] : [];
  },

  runVerbOverride(target, verbId, engine) {
    if (verbId === GIVE_CUBIMAL_VERB) {
      const row = giveCubimalVerb(target, engine.questState, engine.inv);
      if (!row?.enabled) {
        if (row?.reason) engine.toast(row.reason, 2400);
        return true;
      }
      const cubimal = CUBIMAL_LIKENESS[target.classId];
      removeItem(engine.inv, cubimal, 1);
      givenCubimals = [...givenCubimals, cubimal];
      const line = CUBIMAL_GIFT_RESPONSES[Math.floor(Math.random() * CUBIMAL_GIFT_RESPONSES.length)];
      engine.say?.(target, line, 10000);
      engine.achievement(`cubimal_given:${cubimal}`, 1);
      engine.pushActivity(`You gave a cubimal to ${target.label || target.classId}.`);
      engine.setData('questVerbLast', `give_cubimal:${cubimal}`);
      engine.refreshPack?.();
      engine.updateHud?.();
      engine.save?.();
      return true;
    }
    if (verbId !== SLATHER_VERB) return null;
    if (!slatherVerb(target, engine.questState)) return true;
    const res = performSlather(engine.inv);
    engine.achievement('shrine_slathered:grendaline', 1);
    engine.pushActivity(res.msg);
    engine.toast(res.msg, 4200);
    engine.setData('questVerbLast', `slather:${res.removed}`);
    engine.refreshPack?.();
    engine.updateHud?.();
    engine.save?.();
    return true;
  },
};
