// G217 chooser follow-ups: the hint chip with several things in reach, offers
// that wait for the chooser or a verb menu, and the chooser over the chat dock.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildEnterChoices, enterPromptLabel, planEnter } from '../public/js/enter-chooser.js?v=g217-1';

const here = dirname(fileURLToPath(import.meta.url));
const pub = join(here, '../public');
const read = (rel) => readFileSync(join(pub, rel), 'utf8');
const game = read('game.js');
const css = read('style.css');
const client = join(here, '../../glitch-client/com/tinyspeck/engine');

const t = (classId, extra = {}) => ({ classId, label: classId, sprite: {}, ...extra });
const near = (...rows) => rows.map(([target, distance]) => ({ target, distance }));

describe('the hint chip', () => {
  it('the client named nothing: everything in reach glows and Enter asks', { skip: !existsSync(client) && 'no client checkout' }, () => {
    const mg = readFileSync(join(client, 'view/renderer/MiddleGroundRenderer.as'), 'utf8');
    assert.match(mg, /public function _findInteractionSprites\(apo:AvatarPhysicsObject\):void \{/);
    assert.match(mg, /glowItemstacks\(lq\.resultItemstacks\);/);
  });

  it('says Enter will ask when several things are in reach, and names a lone one', () => {
    const several = planEnter(buildEnterChoices({ near: near([t('apple', { label: 'Apple' }), 20], [t('npc_butterfly', { label: 'Butterfly' }), 40]) }));
    assert.equal(enterPromptLabel(several, 'Apple'), 'choose from 2');
    const one = planEnter(buildEnterChoices({ near: near([t('apple', { label: 'Apple' }), 20]) }));
    assert.equal(enterPromptLabel(one, 'x'), 'Apple');
    assert.equal(enterPromptLabel(planEnter([]), 'interact'), 'interact');
    assert.doesNotMatch(enterPromptLabel(several), /—/);
  });

  it('game.js uses it only where Enter would open the chooser (not a recent or hovered target)', () => {
    assert.match(game, /if \(near !== recent && near !== nearHover && !ENTER_CHOOSER_OFF\) \{\s*const plan = enterPlanForPrompt\(\);\s*if \(plan\.mode === 'chooser'\) label = enterPromptLabel\(plan, label\);/);
    assert.match(game, /if \(now - enterPromptPlan\.at > 150\) enterPromptPlan = \{ at: now, plan: planEnter\(enterChoicesHere\(\)\) \};/);
  });
});

describe('offers wait for the chooser and verb menus', () => {
  it('a scripted dialog opened over either is held and shown once both have closed', () => {
    const open = game.slice(game.indexOf('function openScriptedQuestDialogue({'));
    assert.match(open, /^function openScriptedQuestDialogue\(\{[\s\S]{0,600}?\}\) \{\s*\/\/ G217[^\n]*\n\s*if \(holdScriptedDialog\(arguments\[0\]\)\) return;\s*(?:\/\/ G225[^\n]*\n\s*if \(!inLog\) )?closeQuestPanel\(\);/);
    // G267: also held while an emergency offer is up (a prompt or line, not another offer);
    // G364: familiar talk also waits for an open screen (TSFrontController.as 2134).
    assert.match(game, /function holdScriptedDialog\(opts\) \{(?:\s*\/\/[^\n]*)*\s*const underEmergency = !opts\?\.offer && isQuestDialogueOpen\(\) && questDialogueState\?\.urgent === true;\s*if \(!opts \|\| !\(menuTarget \|\| enterChooser\?\.isOpen\(\) \|\| underEmergency(?: \|\| familiarWaitsForScreen\(opts\))?\)\) return false;/);
    assert.match(game, /function releaseHeldScriptedDialog\(\) \{\s*if \(!heldScriptedDialogs\.length \|\| menuTarget \|\| enterChooser\?\.isOpen\(\) \|\| isQuestDialogueOpen\(\) \|\| isVogOpen\(\)\) return;/);
    assert.match(game, /features\.tick\(\(1000 \/ 60\) \* dt, Date\.now\(\), engine\);\s*releaseHeldScriptedDialog\(\);/);
  });

  it('the crab\'s own call-out already waits: busy() covers the verb menu and the chooser', () => {
    const crabs = read('js/features/crabs-feature.js');
    assert.match(crabs, /if \(talk \|\| !p \|\| crab\.mode === 'busy' \|\| engine\.busy\(\)\) continue;/);
    assert.match(game, /currentAction \|\|\s*menuTarget \|\|\s*isQuestDialogueOpen\(\) \|\|\s*isScreenFxBlocking\(\)/);
    assert.match(game, /\(mp && !mp\.hidden\) \|\|\s*Boolean\(enterChooser\?\.isOpen\(\)\)/);
  });
});

describe('the chooser at 390 px', () => {
  it('sits above the local chat dock (z 26) and below the modals (z 40)', () => {
    const dock = Number(css.match(/\.local-chat-dock \{[^}]*z-index: (\d+);/)[1]);
    const chooser = Number(css.match(/\.enter-chooser \{\s*z-index: (\d+);/)[1]);
    const modal = Number(css.match(/\.glitch-modal \{[^}]*z-index: (\d+);/)[1]);
    assert.ok(chooser > dock, `${chooser} > ${dock}`);
    assert.ok(chooser < modal, `${chooser} < ${modal}`);
    assert.ok(css.indexOf('.enter-chooser {') > css.indexOf('.feed-picker {'), 'after .feed-picker, so it wins');
  });
});
