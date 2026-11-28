/**
 * #759 (part): online, the lines where Glitch used the player's label (pc.label / pc.getLabel())
 * said "friend". They now say the name you play under online (js/pc-label.js pcLabel), and
 * "friend" in solo, which has no character name.
 * - Butler intro (bag_butler.js 2083) and its hi reply "Oh, thank you <label>." (butler_emotes.js 187)
 * - Juju Bandits' calls (npc_juju_bandit.js 288-293): a line opening on the label keeps a name as
 *   written; solo's "friend" there is "Friend"
 * - Fox Ranger greetings (npc_fox_ranger.js 383-415)
 * - The Rube's "Hey, <label>!" (npc_rube.js 312, 417)
 * - The Magic Rock's iMG bubble (magic_rock.js 1000) and its ticket talk (newxp_training2.js 714)
 * - Quest copy {pc_label} (quests/*.js), filled by cleanQuestMarkup and the quest text renderer
 * Run: node --test tests/r759-pc-label-online.test.js
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, describe, it } from 'node:test';

import { SOLO_PC_LABEL, currentPcLabel, pcLabel, setPcLabelSource } from '../public/js/pc-label.js?v=d54da634';
import { BUTLER_INTRO } from '../public/js/butler.js?v=bea39213';
import { butlerHiResponse } from '../public/js/hi-signs.js?v=19ce6a48';
import { JUJU_TEXT, jujuLine } from '../public/js/juju-bandits.js?v=c350ebba';
import { FOX_RANGER_TEXT, fillName } from '../public/js/foxes.js?v=c0ce235f';
import { RUBE_TEXT } from '../public/js/rube.js?v=0b98cc11';
import { imgBubbleText } from '../public/js/magic-rock-home.js?v=11f070be';
import { rockTicketBeats } from '../public/js/home-ticket.js?v=47d10c75';
import { cleanQuestMarkup } from '../public/js/quests.js?v=73ccda70';
import { questTextPlain } from '../public/js/quest-text.js?v=92213536';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const NAME = 'zed rover';
const online = { query: (hook) => (hook === 'playerChatName' ? NAME : null) };
const solo = { query: () => null };

describe('#759 the player label online', () => {
  afterEach(() => setPcLabelSource(null));

  it('pcLabel: the name online, friend solo', () => {
    assert.equal(pcLabel(online), NAME);
    assert.equal(pcLabel(solo), SOLO_PC_LABEL);
  });

  it('the Butler intro and hi reply use the label, and the features pass pcLabel(engine)', () => {
    assert.equal(BUTLER_INTRO(pcLabel(online)), `Thank you. I am very happy to be here with you, ${NAME}. I look forward to being of service.`);
    assert.equal(butlerHiResponse({ variant: 'hi' }, {}, { label: pcLabel(online), rand: () => 0 }), `Oh, thank you ${NAME}.`);
    assert.match(read('public/js/features/butler-feature.js'), /BUTLER_INTRO\(pcLabel\(engine\)\)/);
    const hi = read('public/js/features/hi-signs-feature.js');
    assert.match(hi, /butlerHiResponse\(bb, p, \{ now: nowMs\(\), label: pcLabel\(engine\)/);
    assert.doesNotMatch(hi, /const PC_LABEL = 'friend'/);
  });

  it('Juju Bandits: the name as written online, Friend opening a line solo', () => {
    assert.equal(jujuLine(JUJU_TEXT.offerLines[0], pcLabel(online)), `${NAME}! The Juju Bandits need your help.`);
    assert.equal(jujuLine(JUJU_TEXT.offerLines[1], pcLabel(online)), `We need your help, ${NAME}!`);
    assert.equal(jujuLine(JUJU_TEXT.offerLines[0], pcLabel(solo)), 'Friend! The Juju Bandits need your help.');
    assert.equal(jujuLine(JUJU_TEXT.offerLines[1], pcLabel(solo)), 'We need your help, friend!');
    const feat = read('public/js/features/juju-bandits-feature.js');
    assert.doesNotMatch(feat, /const pcLabel = \(\) => JUJU_PLAYER_LABEL/);
    assert.match(feat, /import \{ pcLabel \} from '\.\.\/pc-label\.js\?v=[0-9a-f]{8}'/);
  });

  it('the Fox Ranger, the Rube and the Magic Rock say the name', () => {
    assert.equal(fillName(FOX_RANGER_TEXT.firstVisit, pcLabel(online)).slice(0, 16), `Hello ${NAME}.`);
    assert.equal(RUBE_TEXT.hello(pcLabel(online)), `Hey, ${NAME}! Come talk to me if you'd like to trade.`);
    assert.equal(imgBubbleText(pcLabel(online)), `Hey ${NAME}, I have some iMG for you. Click on me and I’ll hand it over.`);
    assert.match(read('public/js/features/foxes-feature.js'), /fillName\(text, pcLabel\(engine\)\)/);
    assert.match(read('public/js/features/rube-feature.js'), /RUBE_TEXT\.hello\(pcLabel\(engine\)\)/);
    assert.match(read('public/js/features/homes-feature.js'), /imgBubbleText\(pcLabel\(engine\)\)/);
  });

  it('the rock ticket talk opens on the name as written online, Friend solo', () => {
    assert.equal(rockTicketBeats(pcLabel(online))[0].text, `${NAME}, my new chum. I have a ticket for you.`);
    assert.equal(rockTicketBeats(pcLabel(solo))[0].text, 'Friend, my new chum. I have a ticket for you.');
    assert.match(read('public/game.js'), /function homeTicketHost\(\) \{[\s\S]{0,300}name: pcLabel\(engine\),/);
  });

  it('quest copy {pc_label} follows the label source game.js sets at boot', () => {
    assert.equal(currentPcLabel(), SOLO_PC_LABEL);
    assert.equal(cleanQuestMarkup('Welcome back, {pc_label}.'), 'Welcome back, friend.');
    setPcLabelSource(() => pcLabel(online));
    assert.equal(cleanQuestMarkup('Welcome back, {pc_label}.'), `Welcome back, ${NAME}.`);
    assert.equal(questTextPlain('Did you enjoy yourself, {pc_label}?'), `Did you enjoy yourself, ${NAME}?`);
    setPcLabelSource(() => pcLabel(solo));
    assert.equal(cleanQuestMarkup('{pc_label}'), 'friend');
    assert.match(read('public/game.js'), /setPcLabelSource\(\(\) => pcLabel\(engine\)\);/);
  });
});
