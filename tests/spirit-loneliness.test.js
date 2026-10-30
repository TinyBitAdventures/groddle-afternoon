/**
 * Street Spirit loneliness (register G185): the copy, timings and numbers
 * against GameServerJS items/include/loneliness.js and
 * players/inc_world_events.js, the solo rules (js/spirit-loneliness.js), the
 * cry and porthole strips, and the feature's invite -> prompt -> route ->
 * visit flow on a fake engine.
 */
import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  INVITE_ART,
  LONELY_RULES,
  LONELY_TEXT,
  arriveLine,
  canInvite,
  createLonelyState,
  expired,
  inviteBox,
  inviteText,
  isRunning,
  noteVisit,
  normalizeLonelyState,
  numberth,
  pickLonelySpirit,
  portraitStateAt,
  promptDue,
  raceConversation,
  raceXp,
  seedVisits,
  startEvent,
  visitEvent,
} from '../public/js/spirit-loneliness.js?v=9259917d';
import {
  PORTRAIT_STATES,
  STREET_SPIRIT_ART,
  STREET_SPIRIT_LONELY_ART,
  STREET_SPIRIT_VARIANTS,
  portraitBox,
  portraitLook,
  portraitSheet,
  spiritAnchor,
  spiritCell,
  spiritCryBox,
  spiritCrySheet,
} from '../public/js/street-spirits.js?v=f9e88445';
import { spiritLonelinessFeature } from '../public/js/features/spirit-loneliness-feature.js?v=61154b21';
import { ROUTE_SOURCES } from '../public/js/map-routes.js?v=3e8f84ad';
import { setStreetEcologyCatalog } from '../public/js/street-ecology.js?v=face8516';
import { applyStreetIndex } from '../public/js/street-loader.js?v=4b282477';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const GSJS = join(ROOT, '../glitch-GameServerJS');
const HAS_GSJS = existsSync(GSJS);
const read = (p) => readFileSync(p, 'utf8');
const lonelySrc = () => read(join(GSJS, 'items/include/loneliness.js'));
const eventsSrc = () => read(join(GSJS, 'players/inc_world_events.js'));
/** A source string literal ("..." with \" escapes) as it reads. */
const literals = (src) => [...src.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1].replace(/\\"/g, '"'));

describe('source copy', { skip: !HAS_GSJS && 'no GameServerJS checkout' }, () => {
  it('the nine pleas, ten replies and their buttons are the source lines, in order', () => {
    const src = lonelySrc();
    const stage0 = src.slice(src.indexOf('if (stage == 0)'), src.indexOf('} else if (stage == 1)'));
    assert.deepEqual(literals(stage0).filter((l) => l.includes('$LOCATION')), [...LONELY_TEXT.invite]);
    const stage1 = src.slice(src.indexOf('} else if (stage == 1)'), src.indexOf('} else if (stage == 2)'));
    const texts = [...stage1.matchAll(/text = "((?:[^"\\]|\\.)*)"/g)].map((m) => m[1].replace(/\\"/g, '"'));
    const choices = [...stage1.matchAll(/txt: "((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
    assert.deepEqual(texts, LONELY_TEXT.arrive.map((r) => r.text));
    assert.deepEqual(choices, LONELY_TEXT.arrive.map((r) => r.choice));
  });

  it('every other line is in the source word for word', () => {
    const src = lonelySrc() + eventsSrc();
    const lines = [
      LONELY_TEXT.thanks, LONELY_TEXT.forgot, LONELY_TEXT.partyStart.replace('$PLAYERNAME', ''), LONELY_TEXT.partyFinish,
      LONELY_TEXT.partyJabber, LONELY_TEXT.stillLonely, LONELY_TEXT.partyActivity, ...LONELY_TEXT.chatter,
      ...LONELY_TEXT.raceOverlay, ...LONELY_TEXT.partyOverlay.filter((l) => !l.includes('$')),
      'needs your help. Would you like to set that as your destination?', 'Looks like you missed your chance!',
      "You brightened a street spirit's day. You received ", "You brightened a street spirit's day! You received ",
      'I will die soon because too lonely.',
    ];
    for (const l of lines) assert.ok(src.includes(l), l);
    for (const l of LONELY_TEXT.partyRevisit) assert.ok(src.includes(l.replace('$PLAYERNAME', '').replace(/^!/, '!')), l);
    assert.ok(src.includes('BTW, you are kind people who came to here in the <b>$RANKING place</b> today.'));
    assert.ok(src.includes('Could you wait here until after <b>$NUMBEROFPLAYERS players</b>? Thank you!'));
  });

  it('player-facing copy has no em-dashes', () => {
    const all = JSON.stringify(LONELY_TEXT);
    assert.doesNotMatch(all, /—/);
  });
});

describe('source timings and numbers', { skip: !HAS_GSJS && 'no GameServerJS checkout' }, () => {
  it('the invite: 14.5 s porthole, loop at 1 s, out at 13 s, prompt at 15 s, path of 3', () => {
    const src = eventsSrc();
    assert.match(src, /args\.duration = 14500;/);
    assert.match(src, /this\.events_add\(state_event1, 1\);\s*this\.events_add\(state_event2, 13\);/);
    assert.match(src, /apiSetTimer\('showLonelinessPrompt', 15000\)/);
    assert.match(src, /option: randInt\(0, 8\)/);
    assert.match(src, /path\.length >= 3/);
    assert.equal(LONELY_RULES.announceMs, 14500);
    assert.equal(LONELY_RULES.loopAtMs, 1000);
    assert.equal(LONELY_RULES.outAtMs, 13000);
    assert.equal(LONELY_RULES.promptDelayMs, 15000);
    assert.equal(LONELY_RULES.minPath, 3);
  });

  it('race 15 min, party 5 min (declared, never armed), 70% races, party 5 s / 55 s, 200 XP and Party Time!', () => {
    const src = lonelySrc();
    assert.match(src, /is_chance\(0\.7\) \? 'A' : 'B'/);
    assert.match(src, /case 'A':\s*this\.loneliness\.duration = 60 \* 15;\s*this\.apiSetTimer\('clearLoneliness'/);
    assert.match(src, /case 'B':\s*this\.loneliness\.duration = 60 \* 5;\s*this\.lonelinessShowPartyOverlay/);
    assert.match(src, /apiSetTimer\('lonelinessFinishParty', 5000\)/);
    assert.match(src, /apiSetTimer\('lonelinessPartyJabber', 55000\)/);
    assert.match(src, /stats_add_xp\(200\)/);
    assert.match(src, /buffs_apply\('party_time'\)/);
    assert.equal(LONELY_RULES.raceMs, 15 * 60 * 1000);
    assert.equal(LONELY_RULES.partyMs, 5 * 60 * 1000);
    assert.equal(LONELY_RULES.raceChance, 0.7);
    assert.equal(LONELY_RULES.partyStartMs, 5000);
    assert.equal(LONELY_RULES.partyJabberMs, 55000);
    assert.equal(LONELY_RULES.partyXp, 200);
    assert.equal(LONELY_RULES.partyBuff, 'party_time');
  });

  it('race XP: 1000 first; the later tiers read an undefined field, so 100', () => {
    const src = lonelySrc();
    assert.match(src, /if \(this\.loneliness\.num_visitors == 1\) \{\s*give_xp = 1000;/);
    assert.match(src, /\} else if \(this\.loneliness_num_visitors <= 5\) \{/);
    assert.equal(raceXp(1), 1000);
    assert.equal(raceXp(2), 100);
    assert.equal(raceXp(12), 100);
  });

  it('fireworks: six, at 0, 4, 8, 35, 39, 43 s', () => {
    const src = lonelySrc();
    const gaps = [...src.matchAll(/apiSetTimerX\('lonelinessEndPartyOverlay', (\d+), \d\)/g)].map((m) => Number(m[1]));
    assert.deepEqual(gaps, [4000, 4000, 27000, 4000, 4000]);
    let at = 0;
    const want = [0, ...gaps.map((g) => (at += g))];
    assert.deepEqual(LONELY_RULES.fireworks.map((f) => f.at), want);
    assert.equal((src.match(/announce_sound_to_all\('LONELINESS_FIREWORKS', 0\)/g) || []).length, 6);
  });

  it('the cry cadence: 5-10 s and 8 s (generic), 10-15 s and 5 s (Uralia)', () => {
    const generic = read(join(GSJS, 'items/street_spirit_groddle.js'));
    assert.match(generic, /this\.setAndBroadcastState\('idle_cry'\);\s*this\.sendBubble\(this\.lonelinessGetChatter\(\)\);\s*this\.apiSetTimer\('stopCrying', 8000\);/);
    const zutto = read(join(GSJS, 'items/street_spirit_zutto.js'));
    assert.match(zutto, /this\.apiSetTimer\('declareLoneliness', randInt\(10000, 15000\)\);/);
    assert.match(zutto, /this\.setAndBroadcastState\('hoverCry'\);\s*this\.apiSetTimer\('stopCrying', 5000\);/);
    assert.deepEqual([...LONELY_RULES.zuttoEveryMs], [10000, 15000]);
    assert.equal(LONELY_RULES.zuttoCryMs, 5000);
    assert.equal(LONELY_RULES.cryMs, 8000);
  });

  it('the invite box reads loneliness_size and the offsets; Firebog’s misnamed x falls back to 65', () => {
    const ann = read(join(GSJS, 'players/inc_announcements.js'));
    assert.match(ann, /corner_offset_x: 65,\s*corner_offset_y: 45,\s*size: 300/);
    assert.match(ann, /corner_offset_x: 170,\s*corner_offset_y: 80,/);
    assert.match(read(join(GSJS, 'items/street_spirit_firebog.js')), /"loneliness_offset_x"\s*: "60"/);
    assert.match(eventsSrc(), /getClassProp\('loneliness_x_offset'\)/);
    assert.deepEqual(inviteBox(STREET_SPIRIT_VARIANTS.groddle.loneliness), { size: 250, x: 55, y: 85 });
    assert.deepEqual(inviteBox(STREET_SPIRIT_VARIANTS.zutto.loneliness), { size: 215, x: 55, y: 95 });
    assert.deepEqual(inviteBox(STREET_SPIRIT_VARIANTS.firebog.loneliness), { size: 325, x: 65, y: 85 });
    assert.deepEqual(inviteBox(null), { size: 300, x: 65, y: 45 });
    assert.equal(INVITE_ART.bubble.size, 250);
  });

  it('the race overlay and the prompt are the route source for loneliness', () => {
    const row = ROUTE_SOURCES.find((r) => r.id === 'loneliness');
    assert.equal(row.playable, true);
    assert.equal(row.wired, 'js/features/spirit-loneliness-feature.js');
    assert.match(read(join(PUBLIC, row.wired)), /mapRoute', 'set', \{ to: e\.tsid, source: 'loneliness' \}/);
  });
});

describe('rules', () => {
  it('text fills its placeholders once, and the reply follows the plea', () => {
    assert.equal(inviteText(4, 'Ur', 'Addingfoot Trip'), '.... Please ...... Ur ......... Please ..... Come ... to .... Addingfoot Trip .......');
    assert.equal(arriveLine(4, 'Ur').choice, 'Whoooop!');
    assert.equal(arriveLine(undefined, 'Ur').text, 'Ur!! I was crying because I was loneliness, but seeing you as a friend made me happy again.');
    assert.deepEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '102nd'], [1, 2, 3, 4, 11, 12, 13, 21, 102].map(numberth));
  });

  it('the race talk: the reply, the ranking and the thanks, 1000 iMG', () => {
    const c = raceConversation({ option: 0, name: 'Ur' });
    assert.equal(c.xp, 1000);
    assert.deepEqual(c.beats, [
      { text: 'Wow unbelievable! Ur is here! Thank you for coming!', response: "You're welcome!" },
      { text: 'BTW, you are kind people who came to here in the 1st place today. This is in return for your kindness. Thank you!', response: 'OK' },
    ]);
    const many = raceConversation({ option: 3, name: 'Ur', numVisitors: 5, others: ['A', 'B', 'C', 'D'] });
    assert.equal(many.beats.length, 3);
    assert.match(many.beats[1].text, /5th place today\. I was also visited today by B, C and D!$/);
    assert.equal(many.xp, 100);
  });

  it('starts a race or a party by the 70% roll, with a plea from 0 to 8', () => {
    const s = createLonelyState();
    const a = startEvent(s, { tsid: 'LCR10157DMK1L0G', label: 'Addingfoot Trip', variant: 'groddle', look: 'dirt', now: 1000, rng: () => 0.69 });
    assert.equal(a.type, 'A');
    assert.equal(a.tsid, 'GCR10157DMK1L0G');
    assert.equal(a.option, 6);
    assert.equal(a.endsAt, 1000 + LONELY_RULES.raceMs);
    assert.equal(s.nextCheckAt, 1000 + LONELY_RULES.eventGapMs);
    const b = startEvent(createLonelyState(), { tsid: 'G1', now: 0, rng: () => 0.7 });
    assert.equal(b.type, 'B');
    assert.equal(b.endsAt, LONELY_RULES.partyMs);
    assert.equal(startEvent(createLonelyState(), { tsid: 'G1', type: 'B', option: 8 }).option, 8);
  });

  it('the porthole, the prompt and the end follow the clock', () => {
    assert.deepEqual([0, 999, 1000, 12999, 13000, 14499, 14500].map(portraitStateAt), ['in', 'in', 'loop', 'loop', 'out', 'out', '']);
    const s = createLonelyState();
    const e = startEvent(s, { tsid: 'G1', type: 'A', now: 0 });
    assert.equal(promptDue(e, 14999), false);
    assert.equal(promptDue(e, 15000), true);
    e.prompted = true;
    assert.equal(promptDue(e, 16000), false);
    assert.equal(isRunning(e, LONELY_RULES.raceMs - 1), true);
    assert.equal(expired(e, LONELY_RULES.raceMs), true);
    const out = visitEvent(s, 1000);
    assert.deepEqual(out, { kind: 'race', numVisitors: 1 });
    assert.equal(isRunning(e, 2000), false);
    assert.equal(expired(e, LONELY_RULES.raceMs), false);
    assert.equal(s.cured, 1);
    const p = createLonelyState();
    startEvent(p, { tsid: 'G2', type: 'B', now: 0 });
    assert.deepEqual(visitEvent(p, 10), { kind: 'party', partyAt: 10 + LONELY_RULES.partyStartMs });
  });

  it('picks a spirit you met and left alone a game day, 3+ streets away, the one left longest', () => {
    const now = 100 * LONELY_RULES.quietMs;
    const s = createLonelyState();
    noteVisit(s, 'LAAA', now - 2 * LONELY_RULES.quietMs); // met, quiet, far
    noteVisit(s, 'GBBB', now - 3 * LONELY_RULES.quietMs); // met, quietest, but too close
    noteVisit(s, 'GCCC', now - 1000); // visited recently
    noteVisit(s, 'GEEE', now - 5 * LONELY_RULES.quietMs); // quietest and far
    const cands = [
      { tsid: 'GAAA', pathLength: 4 },
      { tsid: 'GBBB', pathLength: 2 },
      { tsid: 'GCCC', pathLength: 6 },
      { tsid: 'GDDD', pathLength: 6 }, // never met
      { tsid: 'GEEE', pathLength: 3 },
    ];
    assert.equal(pickLonelySpirit(s, cands, { now }), 'GEEE');
    delete s.visits.GEEE;
    assert.equal(pickLonelySpirit(s, cands, { now }), 'GAAA');
    assert.equal(pickLonelySpirit(createLonelyState(), cands, { now }), null);
    assert.equal(canInvite({ here: 'LAAA', lonely: 'GAAA', pathLength: 0 }), false);
    assert.equal(canInvite({ here: 'GX', lonely: 'GAAA', pathLength: 3 }), true);
    assert.equal(canInvite({ here: 'GX', lonely: 'GAAA', pathLength: 3, offWorld: true }), false);
  });

  it('an old save’s streets count as met long ago; the slice survives a round trip', () => {
    const s = seedVisits(createLonelyState(), ['LAAA', 'GBBB']);
    assert.deepEqual(s.visits, { GAAA: { n: 1, lastAt: 0 }, GBBB: { n: 1, lastAt: 0 } });
    seedVisits(s, ['GCCC']);
    assert.equal(s.visits.GCCC, undefined);
    startEvent(s, { tsid: 'GAAA', type: 'B', option: 2, now: 5 });
    const back = normalizeLonelyState(JSON.parse(JSON.stringify(s)));
    assert.deepEqual(back, s);
    assert.equal(normalizeLonelyState({ event: { tsid: '' } }).event, null);
  });
});

describe('art', () => {
  function webpSize(file) {
    const b = readFileSync(file);
    const kind = b.toString('ascii', 12, 16);
    if (kind === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
    if (kind === 'VP8L') {
      const bits = b.readUInt32LE(21);
      return { w: 1 + (bits & 0x3fff), h: 1 + ((bits >> 14) & 0x3fff) };
    }
    return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
  }
  const check = (def) => {
    const file = join(PUBLIC, def.path);
    assert.ok(existsSync(file), def.path);
    const { w, h } = webpSize(file);
    assert.equal(w, def.fw * Math.min(def.cols, def.frames), def.path);
    assert.equal(h, def.fh * Math.ceil(def.frames / def.cols), def.path);
  };

  it('every look has a cry strip and its region’s porthole strips', () => {
    for (const v of Object.keys(STREET_SPIRIT_LONELY_ART)) {
      for (const look of Object.keys(STREET_SPIRIT_ART[v].looks)) {
        const cry = spiritCrySheet(v, look);
        check(cry);
        // The ground can sit a little below a cry crop (leafhat: the tears stop short of the roots).
        assert.ok(cry.anchor.x > 0 && cry.anchor.x < 1 && cry.anchor.y > 0.5 && cry.anchor.y < 1.1, `${v} ${look}`);
        for (const s of PORTRAIT_STATES) check(portraitSheet(v, look, s));
      }
    }
    assert.equal(spiritCrySheet('ix', 'plain'), null);
    assert.equal(portraitSheet('ix', 'plain', 'loop'), null);
    // Firebog only exported the porthole for size_large.
    assert.equal(portraitLook('firebog', 'medium'), 'large');
    assert.equal(portraitSheet('firebog', 'medium', 'loop').path, portraitSheet('firebog', 'large', 'loop').path);
  });

  it('the cry keeps the look’s ground line and centre', () => {
    for (const v of Object.keys(STREET_SPIRIT_LONELY_ART)) {
      for (const look of Object.keys(STREET_SPIRIT_ART[v].looks)) {
        const base = spiritCell(v, look);
        const cry = spiritCryBox(v, look);
        const groundInCell = cry.crop.y + cry.anchor.y * cry.crop.h;
        assert.ok(Math.abs(groundInCell - (base.crop.y + base.crop.h)) < 1e-9, `${v} ${look} ground`);
        assert.ok(Math.abs(cry.crop.x + cry.anchor.x * cry.crop.w - base.cell.w / 2) < 1e-9, `${v} ${look} centre`);
        if (v === 'zutto') assert.deepEqual(cry.anchor, spiritAnchor(v, look));
      }
    }
  });

  it('the OGA sheets exist and hold the declared grids', { skip: !existsSync(join(ROOT, '../opengameart/extracted_g174/glitch-assets')) && 'no OGA dump' }, () => {
    const oga = join(ROOT, '../opengameart/extracted_g174/glitch-assets');
    const pngSize = (f) => {
      const b = readFileSync(f);
      return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
    };
    for (const [v, lonely] of Object.entries(STREET_SPIRIT_LONELY_ART)) {
      const art = STREET_SPIRIT_ART[v];
      const files = readdirSync(join(oga, art.dir));
      const find = (look, state) => files.find((f) => f.startsWith(`${art.dir}_${art.looks[look]}_x1_${state}_png_`));
      for (const look of Object.keys(art.looks)) {
        const cryFile = find(look, lonely.cry.oga);
        assert.ok(cryFile, `${v} ${look} ${lonely.cry.oga}`);
        const box = spiritCryBox(v, look);
        const size = pngSize(join(oga, art.dir, cryFile));
        assert.equal(size.w % box.cell.w, 0, `${v} ${look} cry width`);
        assert.equal(size.h % box.cell.h, 0, `${v} ${look} cry height`);
        assert.ok((size.w / box.cell.w) * (size.h / box.cell.h) >= lonely.cry.frames);
        for (const s of PORTRAIT_STATES) {
          const pl = portraitLook(v, look);
          const f = find(pl, lonely.portrait[s].oga);
          assert.ok(f, `${v} ${pl} ${s}`);
          const pb = portraitBox(v, look, s);
          const ps = pngSize(join(oga, art.dir, f));
          assert.equal(ps.w % pb.cell.w, 0, `${v} ${pl} ${s} width`);
          assert.equal(ps.h % pb.cell.h, 0, `${v} ${pl} ${s} height`);
          assert.ok((ps.w / pb.cell.w) * (ps.h / pb.cell.h) >= lonely.portrait[s].frames);
          assert.ok(pb.crop.x + pb.crop.w <= pb.cell.w && pb.crop.y + pb.crop.h <= pb.cell.h);
        }
      }
    }
  });
});

describe('feature', () => {
  const GRAPH = { streets: { GHOME: ['GA'], GA: ['GHOME', 'GB'], GB: ['GA', 'GLONE'], GLONE: ['GB'] } };

  function fakeEngine(tsid = 'GHOME') {
    const calls = { dialogs: [], prompts: [], activity: [], routes: [], said: [], buffs: [], sounds: [] };
    const spirit = { classId: 'street_spirit_groddle', state: { vendorKey: 'groceries', vendorLabel: 'Street Spirit' }, sprite: { x: 1000, y: 500, destroyed: false } };
    let dialogOpen = false;
    let stack = [];
    const engine = {
      started: true,
      streetTsid: tsid,
      player: { x: 100, y: 500, vx: 0, vy: 0 },
      pc: { label: 'Ur', xp: 0, imagination: 0 },
      interactables: [spirit],
      data: {},
      calls,
      spirit,
      param: () => null,
      setData(k, v) { this.data[k] = v; },
      save() {},
      busy: () => false,
      acting: () => false,
      vogOpen: () => false,
      streetCardUp: () => false,
      questDialogueOpen: () => dialogOpen,
      homeContext: () => ({ inHome: false }),
      transientInstance: () => false,
      visitedStreets: () => [],
      pushActivity: (a) => calls.activity.push(a),
      say: (t, text) => calls.said.push(text),
      applyBuff: (b) => calls.buffs.push(b),
      playSound: (k) => calls.sounds.push(k),
      // G304: engine.prompt is the bottom-right stack; it returns the prompt's uid.
      prompt(o) { const uid = `p${calls.prompts.length + 1}`; calls.prompts.push({ ...o, uid }); stack.push(uid); return uid; },
      prompts: () => ({ shown: stack.map((uid) => ({ uid })), queued: [] }),
      removePrompt(uid) { stack = stack.filter((u) => u !== uid); },
      scriptedDialogue(o) { dialogOpen = true; calls.dialogs.push(o); },
      closeDialog() { dialogOpen = false; },
      query(hook, ...args) {
        if (hook === 'mapRoute') {
          calls.routes.push(args);
          return { ok: true };
        }
        return spiritLonelinessFeature[hook]?.(...args);
      },
    };
    return engine;
  }

  /** Answer the last stacked prompt with this value (the stack drops it, then onChoice). */
  function choose(engine, value) {
    const p = engine.calls.prompts.at(-1);
    engine.removePrompt(p.uid);
    p.onChoice?.(value);
  }

  /** Answer the open dialog with its first (or cancel) button. */
  function answer(engine, cancel = false) {
    const d = engine.calls.dialogs.at(-1);
    engine.closeDialog();
    if (cancel) d.onCancel?.();
    else d.onComplete?.();
  }

  beforeEach(() => {
    mock.timers.enable({ apis: ['Date'], now: 1_000_000_000 });
    spiritLonelinessFeature._reset();
    spiritLonelinessFeature._setGraph(GRAPH);
    setStreetEcologyCatalog({ streets: { GHOME: { counts: { street_spirit: 1 } }, GLONE: { counts: { street_spirit: 1 } }, GA: { counts: {} } } });
    applyStreetIndex({ default: 'GHOME', streets: { GHOME: { label: 'Home Lane', hubId: '58' }, GA: { label: 'A Way' }, GB: { label: 'B Way' }, GLONE: { label: 'Lonely Lane', hubId: '58' } } });
  });
  afterEach(() => mock.timers.reset());

  it('is registered after the street spirits feature, with its key', () => {
    const idx = read(join(PUBLIC, 'js/features/index.js'));
    assert.match(idx, /import \{ spiritLonelinessFeature \} from '\.\/spirit-loneliness-feature\.js\?v=[0-9a-f]{8}'; FEATURES\.push\(spiritLonelinessFeature\);/);
    assert.ok(idx.indexOf('spiritLonelinessFeature') > idx.indexOf('streetSpiritsFeature'));
    const spirits = read(join(PUBLIC, 'js/features/street-spirits-feature.js'));
    assert.match(spirits, /engine\.query\?\.\('spiritLonelyHere', engine\)/);
    assert.match(spirits, /engine\.query\?\.\('spiritCry', engine\) === true/);
  });

  it('invite, prompt at 15 s, Yes routes to the lonely street', () => {
    const engine = fakeEngine();
    spiritLonelinessFeature.onStreetEnter({}, engine);
    const e = spiritLonelinessFeature._begin(engine, 'GLONE', { type: 'A', option: 1, now: Date.now() });
    assert.equal(e.label, 'Lonely Lane');
    assert.equal(engine.data.lonelyPhase, 'invite');
    mock.timers.tick(14_999);
    spiritLonelinessFeature.onTick(16, 0, engine);
    assert.equal(engine.calls.prompts.length, 0);
    mock.timers.tick(1);
    spiritLonelinessFeature.onTick(16, 0, engine);
    // G304: showLonelinessPrompt is a prompts_add: the stack, not the card.
    assert.equal(engine.calls.dialogs.length, 0);
    const d = engine.calls.prompts[0];
    assert.equal(d.text, 'A Street Spirit in Lonely Lane needs your help. Would you like to set that as your destination?');
    assert.deepEqual(d.choices, [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]);
    assert.equal(d.modal, undefined);
    mock.timers.tick(300); // publish runs every 250 ms
    spiritLonelinessFeature.onTick(16, 0, engine);
    assert.equal(engine.data.lonelyPrompt, 'open', 'still open while it sits in the stack');
    choose(engine, 'yes');
    assert.deepEqual(engine.calls.routes[0], ['set', { to: 'GLONE', source: 'loneliness' }, engine]);
    assert.equal(spiritLonelinessFeature._state().event.answer, 'yes');
  });

  it('on the lonely street it cries; walking in is the visit: the talk, 1000 iMG, and no more crying', () => {
    const engine = fakeEngine('GHOME');
    spiritLonelinessFeature.onStreetEnter({}, engine);
    spiritLonelinessFeature._begin(engine, 'GLONE', { type: 'A', option: 0, now: Date.now() });
    engine.streetTsid = 'GLONE';
    spiritLonelinessFeature.onStreetEnter({}, engine);
    assert.equal(engine.query('spiritCry', engine), true);
    assert.equal(engine.query('spiritLonelyHere', engine), true);
    mock.timers.tick(20_000);
    // The prompt still comes (you can arrive before answering); say No.
    spiritLonelinessFeature.onTick(16, 0, engine);
    choose(engine, 'no');
    engine.player.x = engine.spirit.sprite.x + 60;
    spiritLonelinessFeature.onTick(16, 0, engine);
    const talk = engine.calls.dialogs.at(-1);
    assert.equal(talk.kicker, 'Street Spirit');
    assert.equal(talk.beats[0].text, 'Wow unbelievable! Ur is here! Thank you for coming!');
    assert.equal(engine.query('spiritCry', engine), false);
    answer(engine);
    assert.equal(engine.pc.xp, 1000);
    assert.deepEqual(engine.calls.activity, ["You brightened a street spirit's day. You received 1000 iMG."]);
    assert.equal(spiritLonelinessFeature._state().event, null);
    assert.equal(spiritLonelinessFeature._state().cured, 1);
  });

  it('a party: the arrival line, 5 s later 200 iMG and Party Time!, fireworks, and the last line 55 s on', () => {
    const engine = fakeEngine('GLONE');
    spiritLonelinessFeature.onStreetEnter({}, engine);
    spiritLonelinessFeature._begin(engine, 'GLONE', { type: 'B', now: Date.now() });
    assert.deepEqual(engine.calls.activity, ['The street spirit here is having a party! Invite all your friends.']);
    engine.player.x = engine.spirit.sprite.x;
    spiritLonelinessFeature.onTick(16, 0, engine);
    assert.equal(engine.calls.said[0], 'Ur!! Finally you are here at last and now we can start a party! Please everyone be friends and enjoy a party together.');
    mock.timers.tick(5000);
    spiritLonelinessFeature.onTick(16, 0, engine);
    assert.equal(engine.calls.said[1], LONELY_TEXT.partyFinish);
    assert.equal(engine.pc.xp, 200);
    assert.deepEqual(engine.calls.buffs, ['party_time']);
    assert.equal(engine.calls.activity.at(-1), "You brightened a street spirit's day! You received 200 iMG.");
    for (const step of [4000, 4000, 27000, 4000, 4000, 12000]) {
      mock.timers.tick(step);
      spiritLonelinessFeature.onTick(16, 0, engine);
    }
    assert.equal(engine.calls.sounds.filter((k) => k === 'LONELINESS_FIREWORKS').length, 6);
    assert.equal(engine.calls.said.at(-1), LONELY_TEXT.partyJabber);
  });

  it('missed: after 15 minutes the source says someone else cheered it up', () => {
    const engine = fakeEngine();
    spiritLonelinessFeature.onStreetEnter({}, engine);
    spiritLonelinessFeature._begin(engine, 'GLONE', { type: 'A', now: Date.now() });
    mock.timers.tick(15_000);
    spiritLonelinessFeature.onTick(16, 0, engine);
    choose(engine, 'no');
    mock.timers.tick(LONELY_RULES.raceMs);
    spiritLonelinessFeature.onTick(16, 0, engine);
    assert.equal(engine.calls.prompts[1].text, 'Someone else cheered up the Street Spirit in Lonely Lane. Looks like you missed your chance!');
    assert.equal(spiritLonelinessFeature._state().missed, 1);
  });

  it('G304: an unanswered invite stays in the stack, the missed prompt stacks over it, and one taken away counts as No', () => {
    const engine = fakeEngine();
    spiritLonelinessFeature.onStreetEnter({}, engine);
    spiritLonelinessFeature._begin(engine, 'GLONE', { type: 'A', now: Date.now() });
    mock.timers.tick(15_000);
    spiritLonelinessFeature.onTick(16, 0, engine);
    assert.equal(engine.prompts().shown.length, 1);
    mock.timers.tick(LONELY_RULES.raceMs);
    spiritLonelinessFeature.onTick(16, 0, engine);
    assert.equal(engine.prompts().shown.length, 2, 'cancelLoneliness adds its prompt and leaves the invite');
    assert.match(engine.calls.prompts[1].text, /^Someone else cheered up/);
    // Yes on the stale invite finds no event: no route.
    const invite = engine.calls.prompts[0];
    engine.removePrompt(invite.uid);
    invite.onChoice('yes');
    assert.equal(engine.calls.routes.length, 0);

    spiritLonelinessFeature._reset();
    spiritLonelinessFeature._setGraph(GRAPH);
    const e2 = fakeEngine();
    spiritLonelinessFeature.onStreetEnter({}, e2);
    spiritLonelinessFeature._begin(e2, 'GLONE', { type: 'A', now: Date.now() });
    mock.timers.tick(15_000);
    spiritLonelinessFeature.onTick(16, 0, e2);
    e2.removePrompt(e2.calls.prompts[0].uid);
    spiritLonelinessFeature.onTick(16, 0, e2);
    assert.equal(spiritLonelinessFeature._state().event.answer, 'no');
  });

  it('the solo picker: a met spirit left alone a game day, 3 streets away, after 15 minutes of play', () => {
    const engine = fakeEngine('GHOME');
    engine.visitedStreets = () => ['GLONE', 'GA'];
    spiritLonelinessFeature.onStreetEnter({}, engine);
    const s = spiritLonelinessFeature._state();
    assert.deepEqual(Object.keys(s.visits).sort(), ['GHOME', 'GLONE']);
    assert.equal(s.nextCheckAt, Date.now() + LONELY_RULES.checkEveryMs);
    mock.timers.tick(LONELY_RULES.checkEveryMs - 1);
    spiritLonelinessFeature.onTick(16, 0, engine);
    assert.equal(s.event, null);
    mock.timers.tick(1);
    spiritLonelinessFeature.onTick(16, 0, engine);
    assert.equal(spiritLonelinessFeature._state().event?.tsid, 'GLONE');
    assert.equal(spiritLonelinessFeature._state().nextCheckAt, Date.now() + LONELY_RULES.eventGapMs);
  });

  it('a street still under construction is not there yet: no spirit to miss you, no way through', () => {
    const engine = fakeEngine('GHOME');
    engine.visitedStreets = () => ['GLONE'];
    const query = engine.query;
    engine.query = (hook, ...args) => (hook === 'closedRoads' ? ['LLONE'] : query(hook, ...args));
    spiritLonelinessFeature.onStreetEnter({}, engine);
    mock.timers.tick(LONELY_RULES.checkEveryMs);
    spiritLonelinessFeature.onTick(16, 0, engine);
    assert.equal(spiritLonelinessFeature._state().event, null);
  });

  it('a spirit you visited today is not lonely', () => {
    const engine = fakeEngine('GLONE');
    spiritLonelinessFeature.onStreetEnter({}, engine);
    engine.streetTsid = 'GHOME';
    spiritLonelinessFeature.onStreetEnter({}, engine);
    mock.timers.tick(LONELY_RULES.checkEveryMs);
    spiritLonelinessFeature.onTick(16, 0, engine);
    assert.equal(spiritLonelinessFeature._state().event, null);
    assert.equal(engine.data.lonelyLast, 'picked:none');
  });
});
