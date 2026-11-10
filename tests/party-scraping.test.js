/**
 * Party Scraping on and off (G402): the Scraper and Super Scraper's two pack verbs and the setting
 * barnacles and ice knobs read (scraper.js 70-128, mortar_barnacle.js 345, ice_knob.js 373).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PARTY_SCRAPING_VERBS,
  createResourceNode,
  harvestResourceNode,
  partyScrapingVerb,
  resolveResourceSkillPackage,
  runPartyScrapingVerb,
} from '../public/js/resource-nodes.js?v=7a77fd73';
import { createToolConditionState } from '../public/js/tools.js?v=5f482998';
import { normalizePlayerSnapshot } from '../public/js/player-save.js?v=cc58c43a';
import { partyScrapingFeature as feature } from '../public/js/features/party-scraping-feature.js?v=d7f5a759';

const GS = join(dirname(fileURLToPath(import.meta.url)), '../../glitch-GameServerJS');
const CARD = 'barnacle_scraping_speed_1';
const withCard = (extra = {}) => ({ imaginationUpgrades: [CARD], energy: 500, mood: 100, xp: 0, ...extra });

describe('Party Scraping verbs', () => {
  it('uses the source names, tooltips and lines on both scrapers, and the nodes pass no_img_upgrades', { skip: !existsSync(GS) }, () => {
    for (const file of ['scraper', 'super_scraper']) {
      const src = readFileSync(join(GS, `items/${file}.js`), 'utf8');
      for (const verb of Object.values(PARTY_SCRAPING_VERBS)) {
        assert.ok(src.includes(`verbs.${verb.id} =`), `${file} ${verb.id}`);
        assert.ok(src.includes(`"tooltip"\t\t\t: "${verb.tooltip}"`), `${file} ${verb.tooltip}`);
        assert.ok(src.includes(verb.line), `${file} ${verb.line}`);
      }
    }
    for (const file of ['mortar_barnacle', 'ice_knob']) {
      const src = readFileSync(join(GS, `items/${file}.js`), 'utf8');
      assert.match(src, /var no_upgrade = pc\.party_scraping;/, file);
      assert.match(src, /no_img_upgrades: no_upgrade/, file);
    }
  });

  it('offers nothing without the card, and one verb at a time with it', () => {
    assert.equal(partyScrapingVerb({ imaginationUpgrades: [] }), null);
    const pc = withCard();
    assert.equal(partyScrapingVerb(pc).id, 'party_scraping_on');
    assert.equal(runPartyScrapingVerb(pc, 'party_scraping_off'), null, 'the verb not on offer does nothing');
    assert.equal(pc.partyScraping, undefined);
    assert.equal(runPartyScrapingVerb(pc, 'party_scraping_on'), PARTY_SCRAPING_VERBS.on.line);
    assert.equal(pc.partyScraping, true);
    assert.equal(partyScrapingVerb(pc).id, 'party_scraping_off');
    assert.equal(runPartyScrapingVerb(pc, 'party_scraping_off'), PARTY_SCRAPING_VERBS.off.line);
    assert.equal(pc.partyScraping, false);
  });

  it('the pack card shows it on both scrapers and no other tool, and the save keeps it', () => {
    const lines = [];
    let saves = 0;
    const engine = { pc: withCard(), pushActivity: (l) => lines.push(l), save: () => { saves += 1; } };
    assert.equal(feature.packVerbs('scraper', engine)[0].id, 'party_scraping_on');
    assert.equal(feature.packVerbs('super_scraper', engine)[0].label, 'Party scraping on');
    assert.equal(feature.packVerbs('hoe', engine), null);
    assert.equal(feature.runPackVerb('hoe', 'party_scraping_on', engine), false);
    assert.equal(feature.runPackVerb('scraper', 'party_scraping_on', engine), true);
    assert.deepEqual(lines, [PARTY_SCRAPING_VERBS.on.line]);
    assert.equal(saves, 1);
    assert.equal(feature.packVerbs('scraper', engine)[0].id, 'party_scraping_off');
    assert.equal(normalizePlayerSnapshot(engine.pc).partyScraping, true);
    assert.equal(normalizePlayerSnapshot(withCard()).partyScraping, undefined);
  });
});

describe('the setting on the scrape itself', () => {
  const scrape = (classTsid, pc) => harvestResourceNode(createResourceNode(classTsid), { scraper: 1 }, pc, {
    verbId: 'scrape', now: 1000, skills: [], upgrades: pc.imaginationUpgrades, achievements: [],
    toolState: createToolConditionState(), rng: () => 0.99,
  });

  it('no_img_upgrades skips every card on the package: time and the barnacle drop', () => {
    const cards = [CARD, 'barnacle_scraping_drop_1'];
    assert.equal(resolveResourceSkillPackage('scraping', [], cards).duration, 2000);
    assert.equal(resolveResourceSkillPackage('scraping', [], cards).drop_chance, 6);
    const slow = resolveResourceSkillPackage('scraping', [], cards, { noImgUpgrades: true });
    assert.equal(slow.duration, 4000);
    assert.equal(slow.drop_chance, undefined);
    assert.equal(resolveResourceSkillPackage('ice_scraping', [], cards, { noImgUpgrades: true }).duration, 4000);
    assert.equal(resolveResourceSkillPackage('ice_scraping', [], cards).duration, 2000);
  });

  it('a real scrape runs at the full time with the switch on, half with it off', () => {
    for (const classTsid of ['mortar_barnacle', 'ice_knob']) {
      assert.equal(scrape(classTsid, withCard()).durationMs, 2000, classTsid);
      assert.equal(scrape(classTsid, withCard({ partyScraping: true })).durationMs, 4000, classTsid);
    }
  });
});
