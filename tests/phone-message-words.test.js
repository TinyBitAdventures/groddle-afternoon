/**
 * TOUCH: the messages audit's phone rows (2026-11-12). A phone (window.GRODDLE_DEVICE === 'phone')
 * reads the stick, Jump and taps; a computer keeps its keyboard words.
 * Run: node --test tests/phone-message-words.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXTRA_PARADISE_COURSES as PARADISE_COURSES, paradiseControls } from '../public/js/paradise-courses.js?v=b466613b';
import { BOARD_TEXT } from '../public/js/hi-signs-mp.js?v=09fa6076';
import { HI_TEXT } from '../public/js/hi-signs.js?v=f365ab8d';
import { PHONE_TEXT } from '../public/js/phone/companion-data.js?v=e9d3d3d4';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
// Case matters: "Down" is the key, "fall down" is not.
const KEY_WORDS = /Spacebar|\b[Aa]rrows?\b|\bDown\b|\bEnter\b|\bEsc\b|[Pp]ress(ing)? '?"?5/;

describe('phone message words', () => {
  it('every Paradise course has phone controls with no key names; a computer keeps the keys', () => {
    const courses = Object.values(PARADISE_COURSES);
    assert.ok(courses.length >= 8);
    for (const course of courses) {
      const phone = paradiseControls(course, true);
      assert.doesNotMatch(phone.controls, KEY_WORDS, course.id);
      assert.doesNotMatch(phone.hint, KEY_WORDS, course.id);
      assert.match(`${phone.controls} ${phone.hint}`, /Jump/, course.id);
      assert.equal(paradiseControls(course, false).controls, course.controls || paradiseControls({}, false).controls);
    }
    assert.match(paradiseControls({}, false).hint, /Spacebar/);
    assert.equal(paradiseControls({}, true).hint, 'Hold Jump to fly. The stick steers.');
    const game = read('public/game.js');
    assert.match(game, /paradiseControls\(course, TOUCH_PHONE\)\.controls/);
    assert.match(game, /paradiseControls\(course, TOUCH_PHONE\)\.hint/);
  });

  it('the phone page mail says nothing about a computer', () => {
    assert.equal(PHONE_TEXT.mailNoSave, 'Your mailbox opens once you have played online.');
  });

  it('hi signs: a phone types hi in chat', () => {
    assert.doesNotMatch(BOARD_TEXT.instructTouch, KEY_WORDS);
    assert.doesNotMatch(HI_TEXT.hintTouch, KEY_WORDS);
    const feature = read('public/js/features/hi-signs-feature.js');
    assert.match(feature, /isPhoneDevice\(\) \? HI_TEXT\.hintTouch : HI_TEXT\.hint/);
    assert.match(feature, /isPhoneDevice\(\) \? BOARD_TEXT\.instructTouch : BOARD_TEXT\.instruct/);
  });

  it('the ghost echo, the feed picker, the tutorial and the Map tap on a phone', () => {
    const game = read('public/game.js');
    assert.match(game, /Tap the faint shape to notice it\./);
    assert.match(game, /hint\.hidden = TOUCH_PHONE;/);
    const newxp = read('public/js/features/newxp-feature.js');
    assert.equal((newxp.match(/\$\{isPhoneDevice\(\) \? 'tap' : 'click'\} the \$\{ITEM_LABEL/g) || []).length, 2);
    assert.doesNotMatch(newxp, /: click the \$\{ITEM_LABEL/);
    assert.match(read('public/js/features/map-routes-feature.js'), /\$\{isPhoneDevice\(\) \? 'Tap' : 'Click'\} a street to set it as your destination\./);
  });
});
