/**
 * Aggressive Hoeing on and off (report 121; see js/feature-host.js). The Hoe and the High-Class Hoe
 * carry two pack verbs with the Hoe Down card, one at a time (hoe.js 70-126, high_class_hoe.js
 * 48-126). The setting is pc.aggressiveOff in the save; js/garden.js and js/patches.js read it.
 */
import { aggressiveHoeingVerb, runAggressiveHoeingVerb } from '../garden.js?v=617db897';
import { HOE_TOOLS } from '../tools.js?v=5f482998';

export const aggressiveHoeingFeature = {
  id: 'aggressive-hoeing',

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
