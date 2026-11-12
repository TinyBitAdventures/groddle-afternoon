/**
 * Aggressive Hoeing on and off (report 121): the Hoe and High-Class Hoe's two pack verbs and the
 * setting garden plots and patches read (hoe.js 70-126, high_class_hoe.js 48-126,
 * include/garden.js 244, patch.js 412).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AGGRESSIVE_HOEING_VERBS, aggressiveHoeingVerb, clearPlot, createGarden, gardenActionProfile, getPlot, runAggressiveHoeingVerb } from '../public/js/garden.js?v=788f2dbb';
import { plotVerbs, resolveTendPackage } from '../public/js/patches.js?v=7604d7f2';
import { createToolConditionState, setToolRemaining, getToolCondition } from '../public/js/tools.js?v=5f482998';
import { createInventory } from '../public/js/inventory.js?v=60dfc9ca';
import { getVerbsFor, runVerb } from '../public/content.js?v=5e5c70c4';
import { normalizePlayerSnapshot } from '../public/js/player-save.js?v=a7d1da05';
import { aggressiveHoeingFeature as feature } from '../public/js/features/aggressive-hoeing-feature.js?v=b8440eb4';

const GS = join(dirname(fileURLToPath(import.meta.url)), '../../glitch-GameServerJS');
const CARD = 'hoeing_more_img_more_wear';
const withCard = (extra = {}) => ({ imaginationUpgrades: [CARD], energy: 500, mood: 100, xp: 0, ...extra });

describe('Aggressive Hoeing verbs', () => {
  it('uses the source verb names, tooltips and lines on both hoes', { skip: !existsSync(GS) }, () => {
    for (const file of ['hoe', 'high_class_hoe']) {
      const src = readFileSync(join(GS, `items/${file}.js`), 'utf8');
      for (const verb of Object.values(AGGRESSIVE_HOEING_VERBS)) {
        assert.ok(src.includes(`verbs.${verb.id} =`), `${file} ${verb.id}`);
        assert.ok(src.includes(`"tooltip"\t\t\t: "${verb.tooltip}"`), `${file} ${verb.tooltip}`);
        assert.ok(src.includes(verb.line), `${file} ${verb.line}`);
      }
    }
    const garden = readFileSync(join(GS, 'items/include/garden.js'), 'utf8');
    assert.match(garden, /imagination_has_upgrade\('hoeing_more_img_more_wear'\) && !pc\.aggressive_off/);
    assert.match(readFileSync(join(GS, 'items/patch.js'), 'utf8'), /hoeing_more_img_more_wear'\) && !pc\.aggressive_off/);
  });

  it('offers nothing without the card, and one verb at a time with it', () => {
    assert.equal(aggressiveHoeingVerb({ imaginationUpgrades: [] }), null);
    const pc = withCard();
    assert.equal(aggressiveHoeingVerb(pc).id, 'aggressive_hoeing_off');
    assert.equal(runAggressiveHoeingVerb(pc, 'aggressive_hoeing_on'), null, 'the verb not on offer does nothing');
    assert.equal(pc.aggressiveOff, undefined);
    assert.equal(runAggressiveHoeingVerb(pc, 'aggressive_hoeing_off'), AGGRESSIVE_HOEING_VERBS.off.line);
    assert.equal(pc.aggressiveOff, true);
    assert.equal(aggressiveHoeingVerb(pc).id, 'aggressive_hoeing_on');
    assert.equal(runAggressiveHoeingVerb(pc, 'aggressive_hoeing_on'), AGGRESSIVE_HOEING_VERBS.on.line);
    assert.equal(pc.aggressiveOff, false);
  });

  it('the pack card shows it on both hoes and no other tool, and the save keeps it', () => {
    const lines = [];
    let saves = 0;
    const engine = { pc: withCard(), pushActivity: (l) => lines.push(l), save: () => { saves += 1; } };
    assert.equal(feature.packVerbs('hoe', engine)[0].id, 'aggressive_hoeing_off');
    assert.equal(feature.packVerbs('high_class_hoe', engine)[0].label, 'Aggressive hoeing off');
    assert.equal(feature.packVerbs('pick', engine), null);
    assert.equal(feature.runPackVerb('hoe', 'aggressive_hoeing_off', engine), true);
    assert.deepEqual(lines, [AGGRESSIVE_HOEING_VERBS.off.line]);
    assert.equal(saves, 1);
    assert.equal(feature.packVerbs('hoe', engine)[0].id, 'aggressive_hoeing_on');
    assert.equal(normalizePlayerSnapshot(engine.pc).aggressiveOff, true);
    assert.equal(normalizePlayerSnapshot({ imaginationUpgrades: [CARD] }).aggressiveOff, undefined);
  });
});

describe('the setting on garden plots', () => {
  it('off drops the multiplier and the iMG override, by every Croppery rank', () => {
    for (const known of [[], ['croppery_1'], ['croppery_1', 'croppery_2'], ['croppery_1', 'croppery_2', 'croppery_3']]) {
      const plain = gardenActionProfile('default', 'clear', known, []);
      const on = gardenActionProfile('default', 'clear', known, [CARD]);
      const off = gardenActionProfile('default', 'clear', known, [CARD], { aggressiveOff: true });
      assert.deepEqual(off, plain, known.join());
      assert.ok(on.toolWear > plain.toolWear, known.join());
    }
  });

  const dirtyPlot = () => {
    const garden = createGarden({ cols: 1, rows: 1, now: 0 });
    const plot = getPlot(garden, '1-1');
    plot.state = 'dirty';
    return { classId: 'garden_plot', state: { garden, plot, plotKey: '1-1' } };
  };
  const ctx = (pc) => {
    const tools = createToolConditionState();
    setToolRemaining(tools, 'hoe', 2);
    return { pc, inv: createInventory({ hoe: 1 }), tools, learned: [], skills: { learned: [] }, imaginationUpgrades: pc.imaginationUpgrades };
  };

  it('a Hoe at 2/50 is refused at once while aggressive and clears once switched off', () => {
    const pc = withCard();
    const target = dirtyPlot();
    const c = ctx(pc);
    assert.equal(getVerbsFor(target, c).find((v) => v.id === 'clear').durationMs, 0, 'the menu knows it will refuse');
    assert.equal(runVerb(target, 'clear', c).ok, false);
    assert.equal(target.state.plot.state, 'dirty');
    runAggressiveHoeingVerb(pc, 'aggressive_hoeing_off');
    assert.notEqual(getVerbsFor(target, c).find((v) => v.id === 'clear').durationMs, 0, 'the menu follows the setting');
    assert.equal(runVerb(target, 'clear', c).ok, true);
    assert.equal(target.state.plot.state, 'clean');
  });

  it('clearing while switched off wears the Hoe and pays as without the card', () => {
    const clearWith = (pc) => {
      const garden = createGarden({ cols: 1, rows: 1, now: 0 });
      getPlot(garden, '1-1').state = 'dirty';
      const tools = createToolConditionState();
      setToolRemaining(tools, 'hoe', 50);
      assert.equal(clearPlot(garden, '1-1', pc, { inv: createInventory({ hoe: 1 }), toolState: tools, learned: [], upgrades: pc.imaginationUpgrades }).ok, true);
      return { left: getToolCondition(tools, 'hoe').remaining, xp: pc.xp };
    };
    const off = clearWith({ ...withCard(), aggressiveOff: true });
    const plain = clearWith({ imaginationUpgrades: [], energy: 500, mood: 100, xp: 0 });
    const on = clearWith(withCard());
    assert.deepEqual(off, plain);
    assert.ok(on.left < off.left, 'the card wears it faster');
    assert.ok(on.xp > off.xp, 'and pays more');
  });
});

describe('the setting on patches', () => {
  it('off drops the Soil Appreciation override too', () => {
    const skills = ['soil_appreciation_3'];
    const on = resolveTendPackage(skills, [CARD]);
    const off = resolveTendPackage(skills, [CARD], { aggressiveOff: true });
    assert.equal(on.wearMultiplier, 4);
    assert.equal(off.wearMultiplier, 1);
    assert.equal(off.xp_bonus, resolveTendPackage(skills, []).xp_bonus);
  });

  it('a plot quote follows it', () => {
    const tools = createToolConditionState();
    const plot = { stage: 'dirty' };
    const worn = (remaining) => { setToolRemaining(tools, 'hoe', remaining); return tools; };
    const ctxFor = (pc, remaining) => ({ inv: { hoe: 1 }, pc, skills: ['soil_appreciation_3'], upgrades: pc.imaginationUpgrades, toolState: worn(remaining), hubId: null });
    const pc = withCard();
    const need = resolveTendPackage(ctxFor(pc, 1).skills, [CARD]);
    const wear = need.tool_wear * need.wearMultiplier;
    const row = (p, n) => plotVerbs(plot, ctxFor(p, n)).find((v) => v.id === 'tend');
    assert.equal(row(pc, wear - 1).enabled, false, 'aggressive needs the whole wear');
    assert.equal(row({ ...pc, aggressiveOff: true }, need.tool_wear).enabled, true);
  });
});
