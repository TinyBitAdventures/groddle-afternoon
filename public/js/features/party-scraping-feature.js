/**
 * Party Scraping on and off (see js/feature-host.js). The Scraper and the Super Scraper carry two
 * pack verbs with the card, one at a time (scraper.js 70-128, super_scraper.js). The setting is
 * pc.partyScraping in the save; js/resource-nodes.js reads it.
 */
import { partyScrapingVerb, runPartyScrapingVerb, SCRAPER_TOOLS } from '../resource-nodes.js?v=3685170a';

export const partyScrapingFeature = {
  id: 'party-scraping',

  packVerbs(classTsid, engine) {
    if (!SCRAPER_TOOLS.includes(classTsid)) return null;
    const verb = partyScrapingVerb(engine.pc);
    return verb ? [{ id: verb.id, label: verb.label, enabled: true, tooltip: verb.tooltip }] : null;
  },

  runPackVerb(classTsid, verbId, engine) {
    if (!SCRAPER_TOOLS.includes(classTsid)) return false;
    const line = runPartyScrapingVerb(engine.pc, verbId);
    if (!line) return false;
    engine.pushActivity(line);
    engine.refreshPack?.();
    engine.save?.();
    return true;
  },
};
