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
import { EXTRA_PARADISE_COURSES as PARADISE_COURSES, paradiseControls } from '../public/js/paradise-courses.js?v=eb5c7fd9';
import { BOARD_TEXT } from '../public/js/hi-signs-mp.js?v=3948e7ab';
import { HI_TEXT, hiHintText, hiWay } from '../public/js/hi-signs.js?v=19ce6a48';
import { PHONE_TEXT } from '../public/js/phone/companion-data.js?v=78b7629a';

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

  it('hi signs: a phone taps Hi online, types hi solo; a computer keeps key 5 (G823 follow-up)', () => {
    for (const t of [BOARD_TEXT.instructTouch, BOARD_TEXT.instructTouchButton, BOARD_TEXT.instructTouchButtonClassic, HI_TEXT.hintTouch, HI_TEXT.hintTouchButton, HI_TEXT.hintTouchButtonClassic]) {
      assert.doesNotMatch(t, KEY_WORDS, t);
    }
    // A new player on a phone online (chat 2026-11-25) was told to type hi; the Hi button G823 added is where it says.
    assert.equal(hiHintText({ phone: true, online: true, drawer: true }), HI_TEXT.hintTouchButton);
    assert.match(HI_TEXT.hintTouchButton, /tapping the Hi button: tap the speech bubble \(Social\), open the Local tab, and Hi is at the top, next to the emotes\./);
    assert.doesNotMatch(HI_TEXT.hintTouchButton, /typing hi/);
    assert.equal(hiHintText({ phone: true, online: true, drawer: false }), HI_TEXT.hintTouchButtonClassic);
    assert.match(HI_TEXT.hintTouchButtonClassic, /tapping the Hi button, next to the emotes just above local chat\./);
    // Solo has no Hi button: a chat line that is just hi.
    assert.equal(hiHintText({ phone: true, online: false }), HI_TEXT.hintTouch);
    assert.match(HI_TEXT.hintTouch, /typing hi in local chat/);
    // A computer: the Butler's own words, key 5.
    assert.equal(hiHintText({ phone: false, online: true }), HI_TEXT.hint);
    assert.equal(hiHintText({}), HI_TEXT.hint);
    assert.match(HI_TEXT.hint, /pressing '5'/);
    for (const t of Object.values(HI_TEXT).filter((x) => typeof x === 'string')) assert.doesNotMatch(t, /\u2014/);
    const feature = read('public/js/features/hi-signs-feature.js');
    assert.match(feature, /butlerApi\.hiSay\(engine, hiHintText\(hiWayHere\(engine\)\), HI\.BUTLER_BUBBLE_MS\)/);
    assert.match(feature, /return \{ phone: isPhoneDevice\(\), online: engine\?\.mode === 'multiplayer', drawer: Boolean\(engine\?\.social\) \};/);
    assert.match(feature, /el\('p', '', boardInstruct\(engine\)\)/);
    assert.equal(hiWay({ phone: true, online: true }), 'button');
    // The button itself: on a phone, with the Local tab's emotes (realtime-feature.js).
    const rt = read('public/js/features/realtime-feature.js');
    assert.match(rt, /if \(isPhoneDevice\(\)\) emoteRow\.append\(el\('button', \{ type: 'button', 'data-say-hi': ''/);
    assert.match(rt, /social\.channel\('local', \{ header: emoteRow \}\)/);
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
