import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { canCraft, setSeasonalRecipeCheck, SEASONAL_RECIPES } from '../public/js/making.js';

after(() => setSeasonalRecipeCheck(null));

// inc_making.js: recipe 288 (Pi) is known only while `isPiDay()`.
const pi = { id: '288', inputs: [], tool: null };

test('Pi cooks only on Pi Day once the season test is installed', () => {
  assert.equal(SEASONAL_RECIPES[288], 'pi_day');
  setSeasonalRecipeCheck((season) => season !== 'pi_day');
  const off = canCraft({}, pi, { requireTool: false, requireSkill: false });
  assert.equal(off.ok, false);
  assert.equal(off.reason, 'season');
  assert.match(off.msg, /Pi Day/);

  setSeasonalRecipeCheck(() => true);
  assert.notEqual(canCraft({}, pi, { requireTool: false, requireSkill: false }).reason, 'season');
});

test('without a season test every recipe is in season', () => {
  setSeasonalRecipeCheck(null);
  assert.notEqual(canCraft({}, pi, { requireTool: false, requireSkill: false }).reason, 'season');
});
