/**
 * The Butler: delivery box, naming, the owner greeting, visitor packages and
 * messages, the visitor gift, hints, chatter and the art table, against
 * items/bag_butler.js, items/include/butler_*.js, items/butler_box.js and
 * players/inc_butler.js.
 * Run: node --test tests/butler.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BUTLER,
  BUTLER_BOX,
  BUTLER_FRAMES,
  BUTLER_HINTS,
  BUTLER_JOKES,
  BUTLER_LOOKS,
  BUTLER_SERVICE,
  BUTLER_STRINGS,
  afterGreetingForOwner,
  ago,
  boxDue,
  butlerCounts,
  butlerName,
  butlerSheetUrl,
  butlerText,
  canTakeDelivery,
  clickAnim,
  clickResponse,
  createButler,
  createButlerState,
  giftOffer,
  giveGiftTo,
  hintDue,
  hintInterval,
  idleChatter,
  nearLevel,
  nextHandover,
  normalizeButlerState,
  ownerGreeting,
  packagesAndMessagesForOwner,
  pickHint,
  pluralize,
  recordVisitor,
  renameButler,
  retrieveVerbs,
  serializeButlerState,
  setGift,
  shortGreeting,
  takeVisitorDelivery,
  teachButler,
  visitorsReport,
} from '../public/js/butler.js';
import { canOptIn, stoneVog, STONE_TEXT } from '../public/js/street-furniture.js';
import { NEIGHBOURS, neighbourById, normalizeNeighbourState, visitorLetter } from '../public/js/neighbours.js';
import { butlerApi, butlerFeature } from '../public/js/features/butler-feature.js';
// The URL clubhouse.js imports, so these share its Butler.
import { butlerApi as clubButler, butlerFeature as clubButlerFeature } from '../public/js/features/butler-feature.js?v=butler-1';
import { PART_1 as JOIN_CLUB, REMINISCE as JOIN_CLUB_REMINISCE, room as clubRoom } from '../public/js/quest-rooms/clubhouse.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const NOW = 1_800_000_000_000;
const names = (cls, n) => pluralize(n, cls === 'cherry' ? 'Cherry' : cls, cls === 'cherry' ? 'Cherries' : `${cls}s`);

function owned(extra = {}) {
  const s = createButlerState();
  createButler(s, { post: 300, now: NOW - 60 * 60_000, rand: () => 0 });
  s.introDone = true;
  return Object.assign(s, extra);
}

function dorritDropBy(s, at = NOW - 5 * 60_000) {
  const d = neighbourById('dorrit');
  return takeVisitorDelivery(s, { from: d.id, fromName: d.name, attachment: d.visitorGift, text: d.visitor, now: at });
}

describe('butler box and creation (inc_butler.js, butler_box.js)', () => {
  it('is due with a home at level 3 and no Butler', () => {
    const s = createButlerState();
    assert.equal(boxDue(s, { homeOwned: true, level: 3 }), true);
    assert.equal(boxDue(s, { homeOwned: true, level: 2 }), false);
    assert.equal(boxDue(s, { homeOwned: false, level: 9 }), false);
    createButler(s, { post: 120, now: NOW });
    assert.equal(boxDue(s, { homeOwned: true, level: 9 }), false);
  });

  it('keeps the label conversation word for word', () => {
    assert.equal(BUTLER_BOX.label, 'Special One-Time Delivery');
    assert.equal(BUTLER_BOX.beats.length, 4);
    assert.match(BUTLER_BOX.beats[0].text, /^A special shipment from Tiny Speck, Inc\./);
    assert.deepEqual(BUTLER_BOX.beats.map((b) => b.response), ['Butler? What? Where?', 'And...?', 'That’s good!', 'Roger dodger.']);
    assert.equal(BUTLER.OPEN_DELAY_MS, 750);
    assert.equal(BUTLER.INTRO_DELAY_MS, 2000);
  });

  it('makes one Butler with a random look, posted where the box stood', () => {
    const s = createButlerState();
    assert.equal(createButler(s, { post: 287.4, now: NOW, rand: () => 0.99 }).ok, true);
    assert.equal(s.look, BUTLER_LOOKS[2].id);
    assert.equal(s.post, 287);
    assert.equal(s.introDone, false);
    assert.equal(createButler(s, { post: 0 }).reason, 'You already have a Butler.');
    assert.equal(butlerName(s), 'Butler');
  });
});

describe('naming and teaching', () => {
  it('names up to 19 characters with the source lines, tags stripped', () => {
    const s = owned();
    const out = renameButler(s, 'Jeeves', { rand: () => 0 });
    assert.equal(out.text, 'Delightful. From now on, I shall be known as Jeeves.');
    const long = renameButler(s, '<b>Sir Reginald Fluffington</b>', { rand: () => 0 });
    assert.equal(s.name, 'Sir Reginald Fluffi');
    assert.equal(s.name.length, BUTLER.NAME_MAX);
    assert.equal(long.shortened, true);
    assert.equal(long.text, 'Terribly sorry, but I can only remember Sir Reginald Fluffi.');
    assert.equal(renameButler(s, '   ').ok, false);
    assert.equal(butlerName(s), 'Sir Reginald Fluffi');
  });

  it('learns one greeting and one idle line (phrase_limit 1)', () => {
    const s = owned();
    assert.equal(teachButler(s, 'owner_greeting', 'Pip pip!').text, 'Ok, I will say Pip pip! to you.');
    teachButler(s, 'owner_greeting', 'Cheerio!');
    assert.equal(s.ownerGreeting, 'Cheerio!');
    assert.equal(teachButler(s, 'idle_comment', 'Dusting, dusting.').text, "Ok, I will say Dusting, dusting. when I'm bored.");
    assert.equal(teachButler(s, 'friend_greeting', 'x').ok, false);
  });
});

describe('greeting the owner', () => {
  it('says Welcome home., the taught greeting and how long you were away', () => {
    const s = owned({ lastOwnerVisit: NOW - 3 * BUTLER.GAME_DAY_MS });
    assert.equal(ownerGreeting(s, NOW), "Welcome home. You haven't been home for 3.00 days.");
    s.ownerGreeting = 'Cheerio!';
    s.lastOwnerVisit = NOW - 11 * BUTLER.GAME_DAY_MS;
    assert.equal(ownerGreeting(s, NOW), "Welcome home. Cheerio! You haven't been home for 11.00 days. I must admit I feel slightly neglected.");
    s.lastOwnerVisit = NOW - 60_000;
    s.ownerGreeting = '';
    assert.equal(ownerGreeting(s, NOW), 'Welcome home.');
  });

  it('tells you what is waiting and about mail (onPlayerEnter)', () => {
    const s = owned();
    assert.equal(packagesAndMessagesForOwner(s, { mail: false }), '');
    assert.equal(packagesAndMessagesForOwner(s, { mail: true }), 'You have mail.');
    dorritDropBy(s);
    assert.equal(packagesAndMessagesForOwner(s, { mail: true, now: NOW }), 'I have 1 package for you. Also, you have mail.');
    takeVisitorDelivery(s, { from: 'pemberton', fromName: 'Pemberton Fizz', text: 'Hello!', now: NOW });
    assert.equal(packagesAndMessagesForOwner(s, { mail: false, now: NOW }), 'I have 1 message for you, and 1 package.');
  });

  it('suggests packages first, then messages (getAfterGreetingForOwner)', () => {
    const s = owned();
    assert.equal(afterGreetingForOwner(s, NOW).suggest, 'none');
    takeVisitorDelivery(s, { from: 'pemberton', fromName: 'Pemberton Fizz', text: 'Hello!', now: NOW });
    let out = afterGreetingForOwner(s, NOW);
    assert.equal(out.text, 'Pemberton Fizz left you 1 message.');
    assert.equal(out.suggestion, 'Would you like to see your messages?');
    dorritDropBy(s);
    out = afterGreetingForOwner(s, NOW);
    assert.equal(out.text, 'Pemberton Fizz left you 1 message. And I have 1 package for you.');
    assert.equal(out.suggestion, BUTLER_STRINGS.ownerSuggestPackages);
  });
});

describe('visitor packages and messages', () => {
  it('takes a drop-by gift as a package with its line as a message', () => {
    const s = owned();
    const out = dorritDropBy(s, NOW);
    assert.equal(out.ok, true);
    assert.equal(out.message.withPackage, out.package.id);
    assert.deepEqual(butlerCounts(s, NOW), { packages: 1, messages: 1, withPackage: 1, plainMessages: 0, messagesToday: 0, packagesToday: 1 });
    assert.deepEqual(retrieveVerbs(s).map((v) => [v.id, v.tooltip]), [['retrieve_packages', 'You have 1 Package']]);
  });

  it('hands over loose messages first, then each package with its message', () => {
    const s = owned();
    dorritDropBy(s, NOW - 3 * 60 * 60_000);
    takeVisitorDelivery(s, { from: 'juniper', fromName: 'Juniper Quoinsworth', text: 'The birds say hi.', now: NOW - 30_000 });
    let out = nextHandover(s, { now: NOW, itemName: names });
    assert.equal(out.kind, 'message');
    assert.equal(out.text, 'Juniper Quoinsworth asked me to tell you: The birds say hi. (30 sec ago).');
    out = nextHandover(s, { now: NOW, itemName: names });
    assert.equal(out.kind, 'package');
    assert.deepEqual(out.give, { classTsid: 'cherry', count: 5 });
    assert.equal(out.text, `Dorrit Applewhistle left you 5 Cherries and told me to tell you: ${neighbourById('dorrit').visitor} (3 hr ago).`);
    assert.equal(nextHandover(s, { now: NOW }).kind, 'none');
    assert.equal(retrieveVerbs(s)[0].enabled, false);
    assert.equal(retrieveVerbs(s)[0].reason, 'I have no messages for you.');
  });

  it('says when a package came without a message', () => {
    const s = owned();
    takeVisitorDelivery(s, { from: 'fenwick', fromName: 'Wobbly Fenwick', attachment: { classTsid: 'cherry', count: 1 }, text: '', now: NOW - 120_000 });
    assert.equal(nextHandover(s, { now: NOW, itemName: names }).text, "Wobbly Fenwick left you 1 Cherry but didn't leave a message (2 min ago).");
  });

  it('stops at five packages (package_limit) and ten messages', () => {
    const s = owned();
    for (let i = 0; i < 5; i += 1) assert.equal(dorritDropBy(s).ok, true);
    const full = dorritDropBy(s);
    assert.equal(full.ok, false);
    assert.equal(full.reason, "Sorry, I can't carry any more packages.");
    const t = owned();
    for (let i = 0; i < 10; i += 1) assert.equal(takeVisitorDelivery(t, { from: 'a', fromName: 'A', text: `m${i}` }).ok, true);
    assert.equal(takeVisitorDelivery(t, { from: 'a', fromName: 'A', text: 'one more' }).reason, "Sorry, I can't remember any more messages.");
    assert.equal(canTakeDelivery(t).ok, false);
  });

  it('does nothing without a Butler', () => {
    assert.equal(takeVisitorDelivery(createButlerState(), { from: 'dorrit', fromName: 'D', text: 'x' }).ok, false);
  });

  it('lists who visited since you last asked (getVisitors)', () => {
    const s = owned();
    recordVisitor(s, { id: 'dorrit', name: 'Dorrit Applewhistle', now: NOW - 1000 });
    assert.equal(visitorsReport(s).output, 'Since the last time you asked me, the following people have visited your street: Dorrit Applewhistle.');
    recordVisitor(s, { id: 'juniper', name: 'Juniper Quoinsworth', now: NOW });
    recordVisitor(s, { id: 'hadwin', name: 'Old Hadwin Mossbottom', now: NOW });
    assert.equal(visitorsReport(s).output, 'Since the last time you asked me, the following people have visited your street: Dorrit Applewhistle, Juniper Quoinsworth and Old Hadwin Mossbottom.');
    s.lastWhoVisited = NOW;
    assert.equal(visitorsReport(s).count, 2);
    s.lastWhoVisited = NOW + 1;
    assert.equal(visitorsReport(s).count, 0);
    for (const n of NEIGHBOURS) recordVisitor(s, { id: n.id, name: n.name, now: NOW + 10 });
    assert.equal(visitorsReport(s).many, true);
  });
});

describe('the visitor gift (give, giveGift)', () => {
  it('asks, merges a same-class gift and hands back a different one', () => {
    const s = owned();
    assert.equal(giftOffer(s, { classTsid: 'cherry', count: 3, names }).text, 'If you give me something, I will hand it out to your visitors. Do you want me to take these 3 Cherries?');
    assert.equal(setGift(s, { classTsid: 'cherry', count: 3 }).text, "Thanks! I'll give these to visitors.");
    assert.equal(giftOffer(s, { classTsid: 'cherry', count: 1, names }).text, 'I already have 3 Cherries. Do you want me to take this 1 Cherry?');
    setGift(s, { classTsid: 'cherry', count: 1 });
    assert.deepEqual(s.gift, { classTsid: 'cherry', count: 4 });
    const offer = giftOffer(s, { classTsid: 'plum', count: 1, names });
    assert.match(offer.text, /^Right now I have 4 Cherries for visitors, which you will have to take back if you give me something new\. /);
    assert.deepEqual(setGift(s, { classTsid: 'plum', count: 1 }).returned, { classTsid: 'cherry', count: 4 });
  });

  it('gives each visitor one, once per class, until it runs out', () => {
    const s = owned();
    setGift(s, { classTsid: 'cherry', count: 2 });
    assert.deepEqual(giveGiftTo(s, 'dorrit'), { classTsid: 'cherry', count: 1 });
    assert.equal(giveGiftTo(s, 'dorrit'), null);
    assert.deepEqual(giveGiftTo(s, 'juniper'), { classTsid: 'cherry', count: 1 });
    assert.equal(s.gift, null);
    assert.equal(giveGiftTo(s, 'hadwin'), null);
  });
});

describe('clicks, chatter and hints', () => {
  it('gets annoyed when poked within 3 s (doClick, getShortGreeting)', () => {
    const clicks = [];
    const first = clickResponse(clicks, 1000, () => 0);
    assert.equal(first.num, 0);
    assert.equal(first.text, 'Hello, how can I help you?');
    for (let i = 1; i <= 7; i += 1) clickResponse(clicks, 1000 + i * 100, () => 0);
    assert.equal(clickResponse(clicks, 1900, () => 0).text, 'Hey, that tickles!');
    assert.equal(clickResponse(clicks, 9000, () => 0).num, 0);
    assert.equal(shortGreeting(30, () => 0), 'STOP IT!');
    assert.deepEqual(clickAnim(1), { anim: 'startle1', ms: 500 });
    assert.deepEqual(clickAnim(2), { anim: 'startle2', ms: 900 });
    assert.deepEqual(clickAnim(0, () => 0.6), { anim: 'bow', ms: 1333 });
  });

  it('chatters five minutes apart unless zipped, with the Tower line at 18', () => {
    const s = owned();
    assert.equal(idleChatter(s, { now: NOW, lastCommandAt: NOW - 1000 }), null);
    assert.equal(idleChatter(s, { now: NOW, lastCommandAt: NOW - 3 * 60_000, rand: () => 0 }), 'Lovely weather today.');
    assert.equal(idleChatter(s, { now: NOW + 60_000, lastCommandAt: 0 }), null);
    s.lastSpokeAt = 0;
    assert.equal(idleChatter(s, { now: NOW, level: 18, hasTower: false, rand: () => 0.1 }), 'You know what would look great cultivated here? A tower!');
    s.lastSpokeAt = 0;
    assert.equal(idleChatter(s, { now: NOW, level: 18, hasTower: true, rand: () => 0.1 }), 'I like it here.');
    s.muted = true;
    s.lastSpokeAt = 0;
    assert.equal(idleChatter(s, { now: NOW }), null);
    s.idleComment = 'Dusting.';
    assert.equal(idleChatter(s, { now: NOW, force: true, rand: () => 0.9 }), 'Dusting.');
  });

  it('hints from ten minutes after the intro, at the level interval', () => {
    const s = owned({ createdAt: NOW - 5 * 60_000 });
    assert.equal(hintDue(s, { now: NOW, level: 5 }), false);
    s.createdAt = NOW - 11 * 60_000;
    assert.equal(hintDue(s, { now: NOW, level: 5 }), true);
    s.lastHintAt = NOW - 6 * 60_000;
    assert.equal(hintDue(s, { now: NOW, level: 5 }), false);
    assert.equal(hintInterval(5), 7 * 60_000);
    assert.equal(hintInterval(12), 30 * 60_000);
    assert.equal(hintInterval(13), 60 * 60_000);
    s.hintsOff = true;
    assert.equal(hintDue(s, { now: NOW + 3_600_000, level: 5 }), false);
  });

  it('picks each hint once, the Jethimadh pair counting as one', () => {
    const s = owned();
    const ctx = { level: 14, learning: true, skillCount: 60, canOptIn: false, towerQuestNone: true, fiberArts: true, hasHoe: false, hasTower: true, sdbPlaced: true };
    const first = pickHint(s, ctx, { now: NOW, rand: () => 0 });
    assert.equal(first.id, 'tower_quest_1');
    assert.match(first.text, /Jethimadh Tower/);
    // The other Jethimadh line is now off the list, so the pool is empty and starts over.
    const again = pickHint(s, ctx, { now: NOW, rand: () => 0.99 });
    assert.ok(['tower_quest_1', 'tower_quest_2'].includes(again.id));
    const sdb = pickHint(owned(), { level: 11, learning: true, skillCount: 60, fiberArts: true, hasTower: false, sdbPlaced: false, sdbOwned: true }, { rand: () => 0 });
    assert.equal(sdb.text, "Speaking as a butler (and qualified neatfreak), I can highly recommend Storage Display Boxes. They're very handy for storing a lot of the same thing, and you can use them to sell things too. It looks like you have one already. Why don't you give it a try?");
    assert.deepEqual(nearLevel({ level: 9, next: 10_000, needed: 5000, remaining: 1600 }), null);
    assert.deepEqual(nearLevel({ level: 9, next: 10_000, needed: 50_000, remaining: 4600 }), { xp: 5000, next: 10 });
    assert.ok(BUTLER_HINTS.every((h) => !/<a /.test(typeof h.text === 'string' ? h.text : h.text({ nearLevel: { xp: 1, next: 2 } }))));
  });
});

describe('copy and source numbers', () => {
  it('keeps the classProps', () => {
    assert.deepEqual([BUTLER.NEAR_DIST, BUTLER.FAR_DIST, BUTLER.AT_DIST, BUTLER.STEP_AWAY_DIST, BUTLER.CAPACITY, BUTLER.PACKAGE_LIMIT, BUTLER.MESSAGE_LIMIT, BUTLER.WAIT_TIME, BUTLER.REQUIRED_CLICK_DELAY],
      [250, 550, 50, 100, 5, 5, 10, 15_000, 3000]);
  });

  it('substitutes each placeholder once like getTextString', () => {
    assert.equal(butlerText('nameResponse', { butler: 'Jeeves' }), 'My name is Jeeves.');
    assert.equal(butlerText('visitorNotifyOwnerHere', { pc: 'Dorrit Applewhistle' }), 'Dorrit Applewhistle is on your Home Street.');
    assert.equal(butlerText('nope'), '');
    assert.equal(ago(NOW - 40 * 3600_000, NOW), '2 days ago');
    assert.equal(ago(NOW - 1000, NOW), 'just now');
  });

  it('has the service menu and all twelve jokes', () => {
    assert.equal(BUTLER_SERVICE.text, 'How can I be of service?');
    assert.deepEqual(BUTLER_SERVICE.choices.map((c) => c.txt), ['Access my mailbox!', 'Give me my messages!', 'Give me my packages!', 'I just wanna chat.', "I don't need anything.", 'I have something to teach you.']);
    assert.equal(BUTLER_JOKES.length, 12);
    assert.equal(BUTLER_JOKES[1][1].text, 'To get to the chicken stick! HA HA HA!');
  });

  it('ships every sheet the looks use, at the measured grid', () => {
    for (const look of BUTLER_LOOKS) {
      for (const [clip, frames] of Object.entries(BUTLER_FRAMES)) {
        const file = join(PUBLIC, butlerSheetUrl(look.id, clip));
        assert.ok(existsSync(file), file);
        const cols = look.cols[clip];
        assert.ok(cols >= 1 && Math.ceil(frames / cols) >= 1, `${look.id} ${clip}`);
        // WebP VP8X canvas size: 24-bit width-1 / height-1 at bytes 24 and 27.
        const b = readFileSync(file);
        const w = 1 + b.readUIntLE(24, 3);
        const h = 1 + b.readUIntLE(27, 3);
        assert.equal(w % look.cell.w, 0, `${file} width ${w}`);
        assert.equal(h % look.cell.h, 0, `${file} height ${h}`);
        assert.ok(Math.floor(w / look.cell.w) === cols, `${file} cols`);
        assert.ok((h / look.cell.h) * cols >= frames, `${file} rows`);
      }
    }
    assert.ok(statSync(join(PUBLIC, 'assets/sprites/butler/butler_box.png')).size > 1000);
  });
});

describe('state and save', () => {
  it('round-trips and migrates a missing or broken slice', () => {
    const s = owned();
    dorritDropBy(s);
    setGift(s, { classTsid: 'cherry', count: 2 });
    renameButler(s, 'Jeeves');
    const back = normalizeButlerState(JSON.parse(JSON.stringify(serializeButlerState(s))));
    assert.equal(back.name, 'Jeeves');
    assert.equal(back.packages.length, 1);
    assert.equal(back.messages[0].withPackage, back.packages[0].id);
    assert.deepEqual(back.gift, { classTsid: 'cherry', count: 2 });
    const empty = normalizeButlerState(undefined);
    assert.equal(empty.owned, false);
    assert.equal(empty.look, 'v10');
    const odd = normalizeButlerState({ owned: true, look: 'v99', post: 'x', packages: [{ from: '', classTsid: 'a', count: 1 }, { from: 'b', classTsid: 'apple', count: 2 }], messages: [{ from: 'b', text: '' }] });
    assert.equal(odd.look, 'v10');
    assert.equal(odd.post, null);
    assert.equal(odd.packages.length, 1);
    assert.equal(odd.messages.length, 0);
    assert.equal(odd.boxRead, true);
  });
});

describe('Visiting Stone hand-off (street-furniture.js)', () => {
  it('needs an unboxed Butler to opt in when the caller says so', () => {
    assert.equal(canOptIn({ level: 4, homeOwned: true, hasButler: false }).error, 'no_butler');
    assert.equal(canOptIn({ level: 4, homeOwned: true, hasButler: false }).reason, "You haven't yet unboxed your butler in your front yard.");
    assert.equal(canOptIn({ level: 4, homeOwned: true, hasButler: true }).ok, true);
    assert.equal(canOptIn({ level: 4, homeOwned: true }).ok, true);
  });

  it('picks the stone VOG by has_butler and names the Butler in the reply', () => {
    assert.equal(stoneVog({ level: 9, homeOwned: true, hasButler: false })[2], 'Later, once you get a little higher level, you can get some visitors through the stones too.');
    assert.equal(stoneVog({ level: 1, hasButler: true })[2], 'And, if you want s’more visitors you can get them from the stones as well. Go look.');
    assert.equal(STONE_TEXT.optInDone('Jeeves'), 'Very well. I will put a word in for you and we’ll see what happens. I’m sure Jeeves will tell you if any new visitors drop by.');
  });

  it('wires the feature through one import line and the delivery hand-off', () => {
    const index = readFileSync(join(PUBLIC, 'js/features/index.js'), 'utf8');
    assert.match(index, /import \{ butlerFeature \} from '\.\/butler-feature\.js\?v=butler-1'; FEATURES\.push\(butlerFeature\);/);
    const sf = readFileSync(join(PUBLIC, 'js/features/street-furniture-feature.js'), 'utf8');
    assert.match(sf, /butlerApi\.receiveVisitor\(engine, letter\)\) engine\.deliverMail\?\.\(letter\)/);
    assert.match(sf, /optInDone\(butlerApi\.label\(\) \|\| STONE_BUTLER_STANDIN\)/);
  });
});

describe('butler feature: a neighbour drops by', () => {
  const fakeEngine = () => {
    const log = [];
    return { log, pushActivity: (t) => log.push(t), save() {}, setData() {}, param: () => null };
  };

  it('holds the visitor letter as a package and message, and saves it', () => {
    butlerFeature._reset();
    butlerFeature.restore({ owned: true, introDone: true, createdAt: NOW });
    const nb = normalizeNeighbourState({ allowVisits: true });
    const letter = visitorLetter(nb, { dayKey: 'd1', homeOwned: true, now: NOW });
    const engine = fakeEngine();
    assert.equal(butlerApi.owned(), true);
    assert.equal(butlerApi.label(), 'Butler');
    assert.equal(butlerApi.receiveVisitor(engine, letter), true);
    const slice = butlerFeature.save();
    assert.equal(slice.packages.length, 1);
    assert.equal(slice.packages[0].fromName, letter.sender);
    assert.deepEqual({ classTsid: slice.packages[0].classTsid, count: slice.packages[0].count }, letter.attachment);
    assert.equal(slice.messages[0].text, letter.text);
    assert.deepEqual(Object.keys(slice.visitors), [letter.neighbourId]);
    assert.equal(engine.log[0], `Butler: ${letter.sender} is on your Home Street.`);
  });

  it('hands the visitor your gift and lets the mailbox take the overflow', () => {
    butlerFeature._reset();
    butlerFeature.restore({ owned: true, gift: { classTsid: 'cherry', count: 1 } });
    const engine = fakeEngine();
    const d = neighbourById('dorrit');
    const letter = { neighbourId: d.id, sender: d.name, text: d.visitor, attachment: { ...d.visitorGift }, deliveryAt: NOW };
    assert.equal(butlerFeature._receiveVisitor(engine, letter), true);
    assert.equal(butlerFeature.save().gift, null);
    for (let i = 0; i < 4; i += 1) assert.equal(butlerFeature._receiveVisitor(engine, letter), true);
    assert.equal(butlerFeature._receiveVisitor(engine, letter), false);
  });

  it('leaves the letter to the mailbox without a Butler', () => {
    butlerFeature._reset();
    butlerFeature.restore(undefined);
    assert.equal(butlerApi.owned(), false);
    assert.equal(butlerApi.label(), '');
    assert.equal(butlerApi.receiveVisitor(fakeEngine(), { neighbourId: 'dorrit', sender: 'Dorrit Applewhistle', text: 'Hi' }), false);
  });
});

describe('Join the Club: Tell your Butler about the club (bag_butler.js doQuests)', () => {
  const leaveCtx = (questId) => {
    const flags = [];
    return { flags, questId, progress: (name) => flags.push(name) };
  };
  const worldCtx = (progress = {}) => {
    const turnIns = [];
    const data = {};
    return {
      progress,
      turnIns,
      data,
      engine: { setData: (k, v) => { data[k] = v; }, player: { x: 0 }, homeContext: () => ({ inHome: false }) },
      questActive: (id) => id === JOIN_CLUB,
      questProgress: (id, name) => Number(progress[name]) || 0,
      progressQuest: (id, name) => { progress[name] = 1; return true; },
      turnInQuest: (id, opts) => { turnIns.push({ id, opts }); return Promise.resolve(true); },
    };
  };
  const settle = () => new Promise((r) => setTimeout(r, 0));

  it('keeps the source requirement and the Butler as the end NPC', () => {
    const quests = JSON.parse(readFileSync(join(PUBLIC, 'assets/content/quests.json'), 'utf8'));
    const list = Array.isArray(quests) ? quests : Object.values(quests.quests || quests);
    const q = list.find((x) => (x.classTsid || x.id) === JOIN_CLUB);
    const req = q.requirements.find((r) => r.name === 'talk_to_butler');
    assert.equal(req.type, 'flag');
    assert.match(readFileSync(join(PUBLIC, 'js/quest-rooms/clubhouse.js'), 'utf8'), /end_npcs: bag_butler/);
  });

  it('tells it on the way out when you have no Butler', () => {
    clubButlerFeature._reset();
    const ctx = leaveCtx(JOIN_CLUB);
    assert.deepEqual(clubRoom.onLeave(ctx, 'complete'), { leaveFlag: 'instance_exit_via_signpost' });
    assert.deepEqual(ctx.flags, ['talk_to_butler']);
  });

  it('leaves the step for your Butler at home when you have one', () => {
    clubButlerFeature._reset();
    clubButlerFeature.restore({ owned: true, introDone: true });
    const ctx = leaveCtx(JOIN_CLUB);
    clubRoom.onLeave(ctx, 'complete');
    assert.deepEqual(ctx.flags, []);
    const rem = leaveCtx(JOIN_CLUB_REMINISCE);
    clubButlerFeature._reset();
    clubRoom.onLeave(rem, 'complete');
    assert.deepEqual(rem.flags, [], 'the reminisce has no talk_to_butler');
  });

  it('waits until you are home near the Butler, then it hears and the quest turns in', async () => {
    clubButlerFeature._reset();
    clubButlerFeature.restore({ owned: true, introDone: true, look: 'v22' });
    const w = worldCtx({ solved_puzzle: 1 });
    clubRoom.world.onTick(w);
    assert.equal(w.turnIns.length, 0, 'not back from the painting yet');
    w.progress.instance_exit_via_signpost = 1;
    clubRoom.world.onTick(w);
    assert.equal(clubButler.questReady(w.engine), false, 'away from the home street');
    assert.equal(w.turnIns.length, 0);
    assert.equal(w.progress.talk_to_butler, undefined);
    const ready = clubButler.questReady;
    const hear = clubButler.hearQuest;
    const heard = [];
    clubButler.questReady = () => true;
    clubButler.hearQuest = (engine, id) => { heard.push(id); return { name: 'Butler', portrait: 'assets/sprites/butler/butler_v22_idle0.webp' }; };
    try {
      clubRoom.world.onTick(w);
      clubRoom.world.onTick(w);
      assert.deepEqual(heard, [JOIN_CLUB]);
      assert.equal(w.progress.talk_to_butler, 1);
      assert.equal(w.data.clubButler, 'heard');
      assert.deepEqual(w.turnIns, [{ id: JOIN_CLUB, opts: { payload: { iconUrl: 'assets/sprites/butler/butler_v22_idle0.webp' } } }]);
      await settle();
      clubRoom.world.onTick(w);
      assert.equal(w.turnIns.length, 1, 'talk_to_butler set: nothing more to do');
    } finally {
      clubButler.questReady = ready;
      clubButler.hearQuest = hear;
    }
  });
});

describe('long Butler lines (shared speech-bubble placement)', () => {
  it('clear the street nameplate', () => {
    const game = readFileSync(join(PUBLIC, 'game.js'), 'utf8');
    const fn = game.slice(game.indexOf('function positionSpeechBubble'), game.indexOf('function showSpeechBubble'));
    assert.match(game, /getElementById\('street-nameplate'\)/);
    assert.match(fn, /nameplateViewBox\(\)/);
    assert.match(fn, /pill\.bottom \+ 8 \+ meta\.height \+ 11/);
  });
});
