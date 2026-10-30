/**
 * G155 cheap item follow-ups: Fortune Cookie / Fortune, Plate of Beans and
 * /beans, the Ball on Plexus and Nandu Pitha, the Class Axe, and The Great
 * Hog Haul Ticket. Each rule is checked against its GameServerJS source.
 * Run: node --test tests/small-items.test.js
 */
import { afterEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BALL_HIT,
  BALL_STREETS,
  BEANS_TEXT,
  FORTUNE_TEXT,
  addNoteToCookie,
  ballHitPose,
  ballStreet,
  breakCookie,
  chatCommand,
  cookieLabel,
  cookieVerbs,
  fortuneView,
  normalizeFortuneState,
  overthinkAnswer,
  overthinkPrompt,
  planBallHit,
  reconcileFortunes,
} from '../public/js/small-items.js?v=g155-1';
import { smallItemsFeature } from '../public/js/features/small-items-feature.js?v=g470-1';
import { streetFurnitureFeature } from '../public/js/features/street-furniture-feature.js?v=g470-1';
import { FEATURES } from '../public/js/features/index.js?v=registry-342';
import { countItem } from '../public/js/inventory.js?v=catalog-unified-7';
import { pickWoodTool, quoteWoodTreeHarvest, harvestWoodTree, woodToolLabel } from '../public/js/woodcutting.js?v=g414-1';
import { TOOL_CONDITION_CATALOG, createToolConditionState, getToolCondition, setToolRemaining } from '../public/js/tools.js?v=woodcutting-test-8';
import { HOG_HAUL_GAME_ID, HOG_HAUL_TICKET, RACE_STORE_ITEMS } from '../public/js/races.js?v=races-4';
import { racesFeature } from '../public/js/features/races-feature.js?v=g470-1';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const gsjs = join(root, '..', 'glitch-GameServerJS');
const src = (rel) => readFileSync(join(gsjs, rel), 'utf8');
const LOCATION_XML = decodeURIComponent(new URL('../../streets/mnt/stos/location_data', import.meta.url).pathname);

function fakeEngine(over = {}) {
  const data = {};
  const log = [];
  return {
    inv: {},
    pc: { energy: 100, mood: 100, currants: 500 },
    player: { x: 500, y: 600 },
    data,
    log,
    setData: (k, v) => { data[k] = v; },
    pushActivity: (t) => log.push(t),
    toast: () => {},
    refreshPack: () => {},
    save: () => {},
    updateHud: () => {},
    floatText: () => {},
    playSound: () => {},
    param: () => null,
    ...over,
  };
}

afterEach(() => {
  smallItemsFeature._reset();
  streetFurnitureFeature.restore({});
});

describe('Fortune Cookie and Fortune (fortune_cookie.js, fortune.js)', () => {
  it('keeps the source verb text', () => {
    const cookie = src('items/fortune_cookie.js');
    for (const text of [FORTUNE_TEXT.breakTooltip, FORTUNE_TEXT.addTooltip, FORTUNE_TEXT.noNotes, FORTUNE_TEXT.withNote, FORTUNE_TEXT.empty]) {
      assert.ok(cookie.includes(text), text);
    }
    assert.ok(cookie.includes('self_msgs.push("The fortune appears in your pack.")'));
    assert.ok(cookie.includes("this.replaceWith('fortune')"));
    assert.equal(FORTUNE_TEXT.broke, 'You broke a Fortune Cookie. The fortune appears in your pack.');
    const fortune = src('items/fortune.js');
    for (const text of [FORTUNE_TEXT.readTitle, FORTUNE_TEXT.readTooltip]) assert.ok(fortune.includes(text), text);
    assert.ok(fortune.includes(`disabled_reason:"${FORTUNE_TEXT.readReason}"`));
  });

  it('sells empty: break is hidden until a written note goes in', () => {
    let s = reconcileFortunes({}, 1, 0);
    assert.equal(cookieLabel(s), FORTUNE_TEXT.empty);
    assert.deepEqual(cookieVerbs(s, 0).map((v) => [v.id, v.enabled, v.reason]), [['add_note', false, FORTUNE_TEXT.noNotes]]);
    assert.deepEqual(cookieVerbs(s, 1).map((v) => [v.id, v.enabled]), [['add_note', true]]);
    const added = addNoteToCookie(s, { body: 'Beware of Rooks.', author: 'player' });
    assert.ok(added.ok);
    s = added.state;
    assert.equal(cookieLabel(s), FORTUNE_TEXT.withNote);
    assert.deepEqual(cookieVerbs(s, 1).map((v) => v.id), ['break_it']);
    const broke = breakCookie(s);
    assert.ok(broke.ok);
    assert.equal(broke.state.cookies.length, 0);
    assert.deepEqual(broke.state.fortunes, [{ text: 'Beware of Rooks.', author: 'player' }]);
    assert.deepEqual(fortuneView(broke.fortune), { title: 'A fortune!', body: 'Beware of Rooks.', reason: "This can't be edited.", author: 'you' });
  });

  it('refuses a note with no contents and keeps texts in step with the pack', () => {
    assert.equal(addNoteToCookie(reconcileFortunes({}, 1, 0), { body: '' }).ok, false);
    const two = { cookies: [null, { text: 'a', author: 'player' }], fortunes: [{ text: 'b' }] };
    const one = reconcileFortunes(two, 1, 0);
    assert.deepEqual(one.cookies, [{ text: 'a', author: 'player' }]);
    assert.deepEqual(one.fortunes, []);
    assert.deepEqual(normalizeFortuneState({ cookies: 'x', fortunes: [null, { text: '' }] }), { cookies: [], fortunes: [] });
  });

  it('runs add a note -> break -> read through the feature with a real carried note', () => {
    const engine = fakeEngine();
    engine.inv.fortune_cookie = 1;
    const notes = [];
    streetFurnitureFeature.restore({});
    // A note written on Paper, as the street-furniture feature carries it.
    streetFurnitureFeature.restore({ carried: [{ id: 'n1', title: 'Hi', body: 'You will be lucky.', lastEditor: 'player' }], nextNoteId: 2 });
    engine.inv.note = 1;
    assert.deepEqual(smallItemsFeature.packVerbs('fortune_cookie', engine).map((v) => [v.id, v.enabled]), [['add_note', true]]);
    assert.ok(smallItemsFeature.runPackVerb('fortune_cookie', 'add_note', engine));
    assert.equal(countItem(engine.inv, 'note'), 0, 'add_note deletes the note');
    assert.equal(smallItemsFeature.itemDisplayName('fortune_cookie').label, 'Cookie with Fortune');
    assert.ok(smallItemsFeature.runPackVerb('fortune_cookie', 'break_it', engine));
    assert.equal(countItem(engine.inv, 'fortune_cookie'), 0);
    assert.equal(countItem(engine.inv, 'fortune'), 1);
    assert.ok(engine.log.includes(FORTUNE_TEXT.broke));
    assert.deepEqual(smallItemsFeature.save().fortunes, [{ text: 'You will be lucky.', author: 'player' }]);
    assert.deepEqual(smallItemsFeature.packVerbs('fortune', engine).map((v) => v.id), ['read']);
    // Saved text survives a restore.
    smallItemsFeature.restore(smallItemsFeature.save());
    assert.equal(smallItemsFeature._state().fortunes.fortunes[0].text, 'You will be lucky.');
    assert.equal(notes.length, 0);
  });

  it('is registered and ships the CC0 icons', () => {
    assert.ok(FEATURES.includes(smallItemsFeature));
    for (const icon of ['fortune.png', 'fortune_cookie_withnote.png', 'plate_of_beans.png']) {
      assert.ok(existsSync(join(root, 'public/assets/sprites/icons', icon)), icon);
    }
  });
});

describe('Plate of Beans and /beans (plate_of_beans.js, main.js:1913)', () => {
  it('gives a plate for /beans, before the god-only commands', () => {
    const main = src('main.js');
    const beans = main.indexOf("words[0] == '/beans'");
    assert.ok(beans > 0);
    assert.ok(main.slice(beans, beans + 120).includes("pc.createItemFromFamiliar('plate_of_beans', 1)"));
    assert.ok(beans < main.indexOf('if (!pc.is_god && !pc.is_help'));
    assert.deepEqual(chatCommand('/beans'), { command: 'beans', give: { plate_of_beans: 1 } });
    assert.deepEqual(chatCommand('  /beans please'), { command: 'beans', give: { plate_of_beans: 1 } });
    assert.equal(chatCommand('/beansy'), null);
    assert.equal(chatCommand('beans'), null);
    const engine = fakeEngine();
    assert.equal(smallItemsFeature.chatCommand('/beans', engine), true);
    assert.equal(countItem(engine.inv, 'plate_of_beans'), 1);
    assert.equal(smallItemsFeature.chatCommand('/house', engine), null);
  });

  it('overthinks with doubling waits and one more really each time', () => {
    const beans = src('items/plate_of_beans.js');
    assert.ok(beans.includes(BEANS_TEXT.first));
    assert.ok(beans.includes(BEANS_TEXT.tooltip));
    assert.deepEqual(overthinkPrompt(), { text: BEANS_TEXT.first, yes: 'Yes!', no: 'Cancel', delayMs: 0 });
    let out = overthinkAnswer(0, 'ok');
    assert.deepEqual(out, { count: 1, next: { text: "You're really sure you want to overthink this?", yes: 'Yes!', no: 'No', delayMs: 1000 } });
    out = overthinkAnswer(out.count, 'ok');
    assert.equal(out.next.delayMs, 2000);
    assert.equal(out.next.text, "You're really, really sure you want to overthink this?");
    out = overthinkAnswer(out.count, 'ok');
    assert.equal(out.next.delayMs, 4000);
    assert.deepEqual(overthinkAnswer(3, 'cancel'), { count: 0, next: null });
  });

  it('asks again through the feature after the source delay', () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
      const asked = [];
      const engine = fakeEngine({ scriptedDialogue: (o) => asked.push(o) });
      engine.inv.plate_of_beans = 1;
      assert.deepEqual(smallItemsFeature.packVerbs('plate_of_beans', engine).map((v) => v.label), ['Overthink']);
      smallItemsFeature.runPackVerb('plate_of_beans', 'overthink', engine);
      assert.equal(asked.length, 1);
      assert.equal(asked[0].beats[0].text, BEANS_TEXT.first);
      assert.equal(asked[0].cancelLabel, 'Cancel');
      asked[0].onComplete();
      mock.timers.tick(999);
      assert.equal(asked.length, 1);
      mock.timers.tick(1);
      assert.equal(asked.length, 2);
      assert.equal(asked[1].cancelLabel, 'No');
      asked[1].onComplete();
      mock.timers.tick(2000);
      assert.equal(asked.length, 3);
      asked[2].onCancel();
      assert.equal(smallItemsFeature._state().thinkCount, 0);
    } finally {
      mock.timers.reset();
    }
  });
});

describe('Ball (ball.js) on Plexus and Nandu Pitha', () => {
  it('reads the hit verb and the placements from the source', () => {
    const ball = src('items/ball.js');
    assert.ok(ball.includes('this.apiHitTheBall(200,10,0.5);'));
    assert.deepEqual(BALL_HIT.args, [200, 10, 0.5]);
    assert.ok(ball.includes(`"tooltip"			: "${BALL_HIT.tooltip}"`));
    assert.equal(ballStreet('LHVDIELDQQ7228K').label, 'Plexus');
    assert.equal(ballStreet('GA9DURMSIAA2S1T').label, 'Nandu Pitha');
    assert.equal(ballStreet('GLI2V0UN7RD1T2J'), null);
    if (existsSync(LOCATION_XML)) {
      for (const row of Object.values(BALL_STREETS)) {
        const xml = readFileSync(join(LOCATION_XML, `${row.source}.xml`), 'utf8');
        assert.ok(xml.includes(`<objref tsid="${row.item}" label="Ball"/>`), row.label);
      }
    }
    for (const tsid of Object.keys(BALL_STREETS)) assert.ok(existsSync(join(root, 'public/assets/streets', `${tsid}.json`)), tsid);
    assert.ok(existsSync(join(root, 'public', BALL_HIT.art.url)));
  });

  it('knocks the ball 200 px away from the hitter, clamped to the street, with a half-height bounce', () => {
    const right = planBallHit(1000, 900, { minX: 40, maxX: 3000 });
    assert.equal(right.to, 1200);
    assert.equal(right.dir, 1);
    const left = planBallHit(1000, 1100, { minX: 40, maxX: 3000 });
    assert.equal(left.to, 800);
    assert.equal(planBallHit(100, 300, { minX: 40, maxX: 3000 }).to, 40);
    assert.equal(right.arc[1], right.arc[0] * 0.5);
    assert.equal(right.frames, 40);
    assert.equal(ballHitPose(right, 0).lift, 0);
    assert.ok(ballHitPose(right, 10).lift > ballHitPose(right, 30).lift);
    const end = ballHitPose(right, right.frames);
    assert.equal(Math.round(end.x), 1200);
    assert.ok(end.done);
  });

  it('asks for one placement on the two streets only and offers Hit', () => {
    assert.deepEqual(smallItemsFeature.placementGroups({}, { tsid: 'GHVDIELDQQ7228K' }), [{ key: 'smallItemsBall', count: 1, clearance: 60 }]);
    assert.deepEqual(smallItemsFeature.placementGroups({}, { tsid: 'GLI2V0UN7RD1T2J' }), []);
    assert.deepEqual(smallItemsFeature.verbsFor({ classId: 'ball', featureId: 'small-items' }).map((v) => [v.id, v.label, v.enabled]), [['hit', 'Hit', true]]);
    assert.equal(smallItemsFeature.verbsFor({ classId: 'ball', featureId: 'other' }), null);
  });
});

describe('Class Axe (class_axe.js, recipe 301)', () => {
  const tree = () => ({ maturity: 6 });
  it('is a 300-point, 900-currant hatchet the woodcutting loop accepts', () => {
    const axe = src('items/class_axe.js');
    assert.ok(axe.includes('"points_capacity"	: "300"'));
    assert.ok(axe.includes('var base_cost = 900;'));
    assert.ok(axe.includes('var parent_classes = ["class_axe", "hatchet", "tool_base", "takeable"];'));
    assert.ok(src('items/wood_tree.js').includes("(it.class_tsid == 'hatchet' || it.class_tsid == 'class_axe') && it.isWorking()"));
    assert.deepEqual(TOOL_CONDITION_CATALOG.class_axe, { label: 'Class Axe', capacity: 300, baseCost: 900, source: 'class_axe.js' });
    const tools = createToolConditionState();
    const inv = { class_axe: 1, plank: 0 };
    const pc = { energy: 100 };
    const quote = quoteWoodTreeHarvest(tree(), inv, pc, tools);
    assert.ok(quote.ok);
    assert.equal(quote.tool, 'class_axe');
    assert.equal(quote.toolLabel, 'Class Axe');
    const out = harvestWoodTree(tree(), inv, pc, tools);
    assert.ok(out.ok);
    assert.equal(inv.plank, 80);
    assert.equal(getToolCondition(tools, 'class_axe').remaining, 295);
  });

  it('takes the first working one: Hatchet, then the Class Axe', () => {
    const tools = createToolConditionState();
    assert.equal(pickWoodTool({ hatchet: 1, class_axe: 1 }, tools), 'hatchet');
    setToolRemaining(tools, 'hatchet', 0);
    assert.equal(pickWoodTool({ hatchet: 1, class_axe: 1 }, tools), 'class_axe');
    assert.equal(pickWoodTool({ hatchet: 1 }, tools), 'hatchet', 'a broken Hatchet still names itself');
    assert.equal(pickWoodTool({}, tools), null);
    assert.equal(woodToolLabel('class_axe'), 'Class Axe');
  });

  it('is made from recipe 301 and ships its CC0 art', () => {
    const recipes = JSON.parse(readFileSync(join(root, 'public/assets/content/recipes.json'), 'utf8'));
    const r = recipes.class_axe;
    assert.equal(r.id, '301');
    assert.equal(r.tool, 'tinkertool');
    assert.deepEqual(r.skills, ['tinkering_5', 'engineering_1']);
    assert.deepEqual(r.inputs, [{ classTsid: 'metal_post', qty: 1 }, { classTsid: 'molybdenum', qty: 3 }]);
    assert.equal(r.energyCost, 50);
    assert.equal(r.waitMs, 10000);
    const skipped = readFileSync(join(root, 'public/assets/content/recipes-skipped.json'), 'utf8');
    assert.ok(!skipped.includes('"class_axe"'));
    const items = JSON.parse(readFileSync(join(root, 'public/assets/content/making-items.json'), 'utf8'));
    assert.equal(items.items.class_axe.isTool, true);
    for (const f of ['icons/class_axe.png', 'icons/class_axe_broken.png', 'tools/class-axe-tool.png']) {
      assert.ok(existsSync(join(root, 'public/assets/sprites', f)), f);
    }
    const game = readFileSync(join(root, 'public/game.js'), 'utf8');
    assert.ok(game.includes("url: 'assets/sprites/tools/class-axe-tool.png'"));
    assert.ok(game.includes("class_axe: 'assets/sprites/icons/class_axe_broken.png'"));
  });
});

describe('The Great Hog Haul Ticket (race_ticket_hogtie_piggy.js)', () => {
  it('keeps the source item text and sells at the dispenser', () => {
    const t = src('items/race_ticket_hogtie_piggy.js');
    assert.ok(t.includes(`var label = "${HOG_HAUL_TICKET.label}";`));
    assert.ok(t.includes(`var description = "${HOG_HAUL_TICKET.desc}";`));
    assert.ok(t.includes('"game_id"	: "hogtie_piggy"'));
    assert.ok(src('config_prod.js').includes("hogtie_piggy: {locations: ['LHVLC8CI3Q62P8T'], min_players: 2, max_players: 2, name: 'The Great Hog Haul'"));
    assert.equal(HOG_HAUL_GAME_ID, 'hogtie_piggy');
    assert.ok(RACE_STORE_ITEMS.some((row) => row.classTsid === HOG_HAUL_TICKET.classTsid));
  });

  it('activates into the Hog Haul after the five-second start, spending the ticket', async () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
      const started = [];
      const engine = fakeEngine({
        transientInstance: () => false,
        homeContext: () => ({ inHome: false }),
        travelGate: () => null,
        startHogHaulRace: (opts) => { started.push(opts); return Promise.resolve({}); },
      });
      engine.inv.race_ticket_hogtie_piggy = 1;
      const verbs = racesFeature.packVerbs('race_ticket_hogtie_piggy', engine);
      assert.deepEqual(verbs.map((v) => [v.id, v.enabled, v.tooltip]), [['activate', true, 'Challenge nearby players to The Great Hog Haul']]);
      assert.ok(racesFeature.runPackVerb('race_ticket_hogtie_piggy', 'activate', engine));
      assert.equal(countItem(engine.inv, 'race_ticket_hogtie_piggy'), 0);
      assert.match(engine.log[0], /^You activated a The Great Hog Haul Ticket\. .+ accepted your challenge!$/);
      mock.timers.tick(4999);
      assert.equal(started.length, 0);
      mock.timers.tick(1);
      assert.equal(started.length, 1);
      assert.equal(started[0].ticket, 'race_ticket_hogtie_piggy');
      assert.equal(racesFeature._state().record.pendingTicket, null);
      await Promise.resolve();
    } finally {
      mock.timers.reset();
    }
  });
});
