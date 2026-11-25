/**
 * Aggressive Hoeing on and off (report 121; see js/feature-host.js). The Hoe and the High-Class Hoe
 * carry two pack verbs with the Hoe Down card, one at a time (hoe.js 70-126, high_class_hoe.js
 * 48-126). The setting is pc.aggressiveOff in the save; js/garden.js and js/patches.js read it.
 */
import { GARDEN_HOEING_UPGRADE, aggressiveHoeingVerb, gardenActionProfile, runAggressiveHoeingVerb } from '../garden.js?v=9c4cc027';
import { HOE_TOOLS } from '../tools.js?v=4156bba8';

/**
 * The mode line on a Hoe's pack card and slot (#503): Glitch showed the mode only through which verb
 * the Hoe offered (hoe.js 70-126), so players lost track of why one plot took 4 wear. Ours says it
 * outright, with the wear a cleared plot costs at the player's Croppery rank (garden.js 244-256).
 */
export function hoeModeNote(pc, learned = [], upgrades = []) {
  if (!Array.isArray(upgrades) || !upgrades.includes(GARDEN_HOEING_UPGRADE)) return '';
  const off = pc?.aggressiveOff === true;
  const wear = gardenActionProfile('crop', 'clear', learned, upgrades, { aggressiveOff: off }).toolWear;
  return `Aggressive hoeing ${off ? 'off' : 'on'} · ${wear} wear a plot${off ? '' : ', more iMG'}`;
}

export const aggressiveHoeingFeature = {
  id: 'aggressive-hoeing',

  packKindNote(classTsid, engine) {
    if (!HOE_TOOLS.includes(classTsid)) return '';
    return hoeModeNote(engine.pc, engine.learnedSkills || [], engine.pc?.imaginationUpgrades || []);
  },

  packVerbs(classTsid, engine) {
    if (!HOE_TOOLS.includes(classTsid)) return null;
    const verb = aggressiveHoeingVerb(engine.pc);
    return verb ? [{ id: verb.id, label: verb.label, enabled: true, tooltip: verb.tooltip }] : null;
  },

  runPackVerb(classTsid, verbId, engine) {
    if (!HOE_TOOLS.includes(classTsid)) return false;
    const line = runAggressiveHoeingVerb(engine.pc, verbId);
    if (!line) return false;
    engine.pushActivity(line);
    engine.refreshPack?.();
    engine.save?.();
    return true;
  },
};
