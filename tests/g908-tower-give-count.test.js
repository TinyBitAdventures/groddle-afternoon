// G908 (#435): a Tower project's parts (wall segments, Urth blocks, girders) went in all or none:
// the row's one button said "Add <all you have>". Glitch's tower floors were jobs, and
// JobDetailsUI.as asked with a QuantityPicker (63-75: min 1 and a Max button) that started at 1
// (131) and went up to what you have and the step still needs (216). The project window now asks
// with the game's one How many chooser (js/ui/count-chooser.js) and gives that many.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { contributeItems } from '../public/js/home-tower.js?v=bb722397';

const root = join(import.meta.dirname, '..');
const src = readFileSync(join(root, 'public/js/features/home-tower-feature.js'), 'utf8');
const glitchUi = join(root, '..', 'glitch-client/com/tinyspeck/engine/view/ui/jobs/JobDetailsUI.as');

function body(name) {
  const at = src.indexOf(`function ${name}(`);
  assert.ok(at >= 0, `${name} is in home-tower-feature.js`);
  const next = src.indexOf('\nfunction ', at + 10);
  return src.slice(at, next < 0 ? undefined : next);
}

describe('G908: How many for a Tower part (#435)', () => {
  it('an item row asks with the shared chooser, not one all-or-none button', () => {
    const project = body('renderProject');
    assert.match(project, /givePicker\(engine, r, Math\.min\(countItem\(engine\.inv, r\.classId\), r\.need - r\.got\)\)/);
    assert.doesNotMatch(project, /`Add \$\{n\}`/, 'the old button gave everything you had');
    assert.match(src, /import \{[^}]*countStepMarkup[^}]*\} from '\.\.\/ui\/count-chooser\.js[^']*'/);
    const picker = body('givePicker');
    assert.match(picker, /countStepMarkup\(/);
    assert.match(picker, /bindCountField\(/);
    assert.match(picker, /giveQty\.get\(r\.id\) \?\? 1/, 'it starts at 1, as JobDetailsUI.as 131');
    assert.match(picker, /contribute\(engine, r\.classId, n\)/, 'it gives the chosen count');
    assert.match(picker, /go\.textContent = `Add \$\{n\}`/, 'the button says the count');
  });

  it('the chosen count is all that goes in (contributeItems takes n, the rest stays in the pack)', () => {
    const inv = { wall_segment: 12 };
    const got = {};
    const res = contributeItems('job_tower_floor_3', got, 'wall_segment', 3, inv);
    assert.equal(res.ok, true);
    assert.equal(res.amount, 3);
    assert.equal(inv.wall_segment, 9);
    assert.equal(got.r1706, 3);
    // Max: never more than the step still needs (8 for Floor 3).
    const more = contributeItems('job_tower_floor_3', got, 'wall_segment', 99, inv);
    assert.equal(more.amount, 5);
    assert.equal(inv.wall_segment, 4);
  });

  it("Glitch's job window starts its QuantityPicker at 1 (JobDetailsUI.as 131)", { skip: !exists(glitchUi) && 'glitch-client not beside the worktree' }, () => {
    const as = readFileSync(glitchUi, 'utf8');
    assert.match(as, /qty_picker\.value = 1;/);
    assert.match(as, /qty_picker\.max_value = Math\.min\(total_items, amount_left\);/);
  });
});

function exists(p) {
  try {
    readFileSync(p);
    return true;
  } catch {
    return false;
  }
}
