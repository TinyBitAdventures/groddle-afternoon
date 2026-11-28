/**
 * #541: the Bean Seasoner's Make menu showed no red line on any tile for a player without Botany,
 * though each recipe said it once opened; an Egg Seasoner's tiles said "Missing 8 Blue Bubble".
 * The tile line was only for recipes you know, and nothing you can't use the tool for is known.
 * Glitch disabled the tool's verb with "You need to know Botany to use this."
 * (inc_making.js making_can_use 94-97); every tile now says that.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RECIPE_CATALOG, ensureMakingItems, loadRecipeCatalogFromFile, toolSkillLine, toolSkillMissing } from '../public/js/making.js?v=d3571803';

const root = join(import.meta.dirname, '..');
await loadRecipeCatalogFromFile(join(root, 'public/assets/content/recipes.json'));
ensureMakingItems();
const beans = Object.values(RECIPE_CATALOG).filter((r) => r.tool === 'bean_seasoner');

describe('#541 a tool you lack the skill for says so on its tiles', () => {
  it('every Bean Seasoner recipe names Botany when it is not learned', () => {
    assert.ok(beans.length >= 6);
    for (const r of beans) assert.equal(toolSkillMissing(r, { learned: [] }), 'botany_1', r.key || r.id);
    for (const r of beans) assert.equal(toolSkillMissing(r, { learned: ['botany_1'] }), null);
  });

  it('no line when skills are not asked about, or the tool needs none', () => {
    assert.equal(toolSkillMissing(beans[0], {}), null);
    assert.equal(toolSkillMissing(beans[0], { learned: [], requireSkill: false }), null);
    const free = Object.values(RECIPE_CATALOG).find((r) => r.toolSkillFree);
    if (free) assert.equal(toolSkillMissing(free, { learned: [] }), null);
  });

  it("Glitch's words, and the Make tiles use them before the ingredient line", () => {
    assert.equal(toolSkillLine('Botany'), 'You need to know Botany to use this.');
    const src = readFileSync(join(root, '..', 'glitch-GameServerJS', 'players', 'inc_making.js'), 'utf8');
    assert.ok(src.includes('reason:"You need to know "+this.skills_get_name(skill)+" to use this."'));
    const game = readFileSync(join(root, 'public/game.js'), 'utf8');
    assert.match(game, /const toolSkill = canMake \? null : toolSkillMissing\(recipe, recipeOpts\(recipe\)\);\n\s+const missingLine = canMake\n\s+\? ''\n\s+: toolSkill\n\s+\? toolSkillLine\(makeSkillName\(toolSkill\)\)\n\s+: !knowsRecipe\.get\(recipe\)/);
  });
});
