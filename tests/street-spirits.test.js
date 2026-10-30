/**
 * Regional Street Spirits (register G181): placement against Tiny Speck's
 * location XML, and every difference js/street-spirits.js claims against the
 * GameServerJS item files.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  FIREBOG_HUBS,
  IX_HUBS,
  SPIRIT_VARIANT_IDS,
  STREET_SPIRIT_ART,
  STREET_SPIRIT_VARIANTS,
  URALIA_HUBS,
  spiritAnchor,
  spiritCell,
  spiritForStreet,
  spiritLookFor,
  spiritSheet,
  spiritSheets,
  spiritVariantForHub,
  zuttoNear,
  zuttoNextClip,
} from '../public/js/street-spirits.js';
import { dialoguePool, nextDialogue } from '../public/js/dialogue.js';
import {
  CONVO_BUBBLE_CHOICES,
  SPIRIT_CONVERSATIONS,
  TALK_CLASSES,
  TALK_ORDER,
  TALK_RULES,
  UNBUILT_GATES,
  canOffer,
  completeTalk,
  gateMet,
  hasCompleted,
  hasOffered,
  normalizeTalkState,
  offerBubble,
  offerNext,
  offeredFor,
  talkBeats,
} from '../public/js/street-spirit-talks.js';
import { runVerb } from '../public/content.js?v=g455-2';
import { CONVERSATIONS } from '../public/js/conversations-data.js?v=g202-1';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOCATIONS = join(ROOT, '../streets/mnt/stos/location_data');
const GSJS = join(ROOT, '../glitch-GameServerJS');
const item = (name) => readFileSync(join(GSJS, 'items', `${name}.js`), 'utf8');
const SPIRIT_FILES = ['street_spirit', ...SPIRIT_VARIANT_IDS.map((v) => `street_spirit_${v}`)];

/** Every archived street holding a Street Spirit: { tsid (G), hub, swf: [] }. */
function spiritStreets() {
  const out = [];
  for (const f of readdirSync(LOCATIONS)) {
    if (!f.startsWith('L')) continue;
    const text = readFileSync(join(LOCATIONS, f), 'utf8');
    if (!text.includes('label="Street Spirit"')) continue;
    const hub = text.match(/hubid="(\d+)"/)?.[1] || '';
    const g = join(LOCATIONS, `G${f.slice(1)}`);
    const swf = existsSync(g) ? (readFileSync(g, 'utf8').match(/<str id="swf_file">([^<]*)/)?.[1] || '').split(',').filter(Boolean) : [];
    out.push({ tsid: `G${f.slice(1, -4)}`, hub, swf });
  }
  return out;
}

/** The spirit's lines in a GSJS conversation function, in order (conversation_start / conversation_reply). */
function conversationLines(src) {
  return [...src.matchAll(/this\.conversation_(?:start|reply)\(pc, (?:msg, )?"((?:[^"\\]|\\.)*)", choices/g)].map((m) => m[1]);
}

const norm = (s) =>
  String(s)
    .replace(/\\n/g, ' ')
    .replace(/[’‘]/g, "'")
    .replace(/…/g, '...')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/[.\s]+$/, '');

test.describe('placement against the location XML', () => {
  const streets = spiritStreets();

  test('the dump names spirits only by label, never by class', () => {
    assert.equal(streets.length, 885);
    for (const f of readdirSync(LOCATIONS).filter((n) => n.startsWith('L'))) {
      assert.doesNotMatch(readFileSync(join(LOCATIONS, f), 'utf8'), /street_spirit_(groddle|firebog|zutto|ix)/);
    }
  });

  test('hub lists are the ambient regions in GSJS main.js', () => {
    const main = readFileSync(join(GSJS, 'main.js'), 'utf8');
    const map = main.slice(main.indexOf('rsp.ambient_hub_map'));
    const hubs = (style) => [...map.matchAll(new RegExp(`'(\\d+)':\\s*'${style}'`, 'g'))].map((m) => m[1]).sort();
    assert.deepEqual([...FIREBOG_HUBS].sort(), hubs('firebog'));
    assert.deepEqual([...IX_HUBS].sort(), hubs('ix'));
    // 'uralia' plus the caverns that are not the dev test hub 18.
    assert.deepEqual([...URALIA_HUBS].sort(), [...hubs('uralia'), ...hubs('caverns').filter((h) => h !== '18')].sort());
  });

  test('121 Firebog, 17 Uralia, 0 Ix and 747 Groddle spirit streets', () => {
    const counts = {};
    for (const s of streets) {
      const v = spiritVariantForHub(s.hub);
      counts[v] = (counts[v] || 0) + 1;
    }
    assert.deepEqual(counts, { groddle: 747, firebog: 121, zutto: 17 });
  });

  test('the hub rule agrees with each street’s own art set', () => {
    for (const s of streets) {
      const v = spiritVariantForHub(s.hub);
      if (v === 'firebog') assert.ok(s.swf.includes('firebog.swf'), `${s.tsid} firebog spirit on ${s.swf}`);
      if (v === 'zutto') assert.deepEqual(s.swf, ['zutto1.swf'], `${s.tsid} Uralia spirit on ${s.swf}`);
      // Streets built from one region set only get that region's spirit.
      if (s.swf.length === 1 && s.swf[0] === 'zutto1.swf') assert.equal(v, 'zutto', s.tsid);
      if (s.swf.includes('firebog.swf') && !s.swf.includes('groddle1.swf')) assert.equal(v, 'firebog', s.tsid);
    }
  });

  test('the remake places a spirit on the same 885 streets, under the same hub', () => {
    const ecology = JSON.parse(readFileSync(join(ROOT, 'public/assets/content/street-ecology.json'), 'utf8'));
    const index = JSON.parse(readFileSync(join(ROOT, 'public/assets/streets/index.json'), 'utf8')).streets;
    const byTsid = new Map(streets.map((s) => [s.tsid, s]));
    const placed = Object.entries(ecology.streets).filter(([, row]) => (row.counts?.street_spirit || 0) > 0);
    assert.equal(placed.length, 885);
    for (const [tsid] of placed) {
      const xml = byTsid.get(tsid);
      assert.ok(xml, `${tsid} has no Street Spirit in the XML`);
      // The index hub is the late-game XML hub (G184), so the region follows;
      // an instance copy off the map lists (The Greedy Street Spirit) has none.
      if (index[tsid].hubId !== '') assert.equal(index[tsid].hubId, xml.hub, tsid);
      assert.equal(spiritForStreet({ hubId: index[tsid].hubId, tsid }).variant, spiritVariantForHub(xml.hub), tsid);
    }
  });

  test('QA streets resolve to their region', () => {
    assert.equal(spiritVariantForHub('56'), 'groddle'); // Addingfoot Trip
    assert.equal(spiritVariantForHub('63'), 'firebog'); // Somewhat Sump, Shimla Mirch
    assert.equal(spiritVariantForHub('78'), 'zutto'); // Punar Grotta, Ilmenskie Deeps
    assert.equal(spiritVariantForHub('27'), 'ix');
    assert.equal(spiritVariantForHub(undefined), 'groddle');
    assert.equal(spiritForStreet({ hubId: '56', tsid: 'GCR10157DMK1L0G' }, 'zutto').variant, 'zutto');
  });
});

test.describe('differences against GameServerJS', () => {
  test('the generic class becomes the Groddle spirit on load', () => {
    const src = item('street_spirit');
    assert.match(src, /if \(this\.class_tsid == 'street_spirit'\)\{\s*var item = apiNewItemStack\('street_spirit_groddle', this\.count\);/);
    const client = readFileSync(join(ROOT, '../glitch-client/com/tinyspeck/engine/data/item/Item.as'), 'utf8');
    assert.match(client, /street_spirit is being deprecated in favor of street_spirit_\*/);
  });

  test('verbs and stores are shared: every verb is defined by street_spirit, every store is the store_id prop', () => {
    for (const name of SPIRIT_FILES) {
      const src = item(name);
      const verbs = [...src.matchAll(/^verbs\.(\w+) = \{ \/\/ defined by (\w+)/gm)].map((m) => `${m[1]}:${m[2]}`);
      assert.deepEqual(verbs, ['debug:npc', 'give_cubimal:npc', 'reminisce:street_spirit', 'buy_sell:street_spirit', 'talk_to:street_spirit'], name);
      assert.match(src, /store_id : \["Id of the base store this spirit offers"\]/, name);
      assert.match(src, /var label = "Street Spirit";/, name);
    }
  });

  test('parents, tags and art bounds match each class', () => {
    for (const v of SPIRIT_VARIANT_IDS) {
      const def = STREET_SPIRIT_VARIANTS[v];
      const src = item(def.classTsid);
      assert.equal(def.gsjs, `items/${def.classTsid}.js`);
      assert.match(src, new RegExp(`var parent_classes = \\["${def.classTsid}", "street_spirit", "npc_walkable", "npc"\\];`));
      assert.deepEqual(JSON.parse(src.match(/^var tags = (\[[^\]]*\]);/m)[1]), def.tags);
      const pos = JSON.parse(src.match(/'position': (\{[^}]*\})/)[1]);
      assert.deepEqual(pos, def.asset, v);
      assert.match(src, new RegExp(`asset_swf_v\\s*: "[^"]*${def.classTsid}-\\d+\\.swf"`));
    }
  });

  test('idle, talk and movement differences', () => {
    const groddle = item('street_spirit_groddle');
    assert.match(groddle, /function onConversationEnding\(pc\)\{ \/\/ defined by street_spirit_groddle\s*this\.setAndBroadcastState\('idle_hold'\);/);
    const firebog = item('street_spirit_firebog');
    assert.match(firebog, /function onCreate\(\)\{ \/\/ defined by street_spirit_firebog[\s\S]{0,80}this\.idle_state = 'idle_move';/);
    assert.match(firebog, /function startMoving\(\)\{ \/\/ defined by street_spirit_firebog\s*return;/);
    const zutto = item('street_spirit_zutto');
    assert.match(zutto, /Math\.abs\(players\[p\]\.x - this\.x\) < 250 && Math\.abs\(players\[p\]\.y - this\.y\) < 250/);
    assert.equal(STREET_SPIRIT_VARIANTS.zutto.wakeRadius, 250);
    for (const state of ['raise', 'hoverIdle', 'lower', 'groundIdle', 'hoverTalk']) assert.ok(zutto.includes(`'${state}'`), state);
    assert.match(zutto, /function startMoving\(\)\{ \/\/ defined by street_spirit_zutto\s*\/\/ Don't move around!/);
    assert.match(zutto, /\/\/ Turn to face player\. Asset is backwards\./);
    const ix = item('street_spirit_ix');
    assert.match(ix, /this\.walk_left_state = this\.walk_right_state = 'move';\s*this\.idle_state = 'idle';\s*this\.talk_state = 'talk';/);
  });

  test('loneliness offsets and cry states are recorded as the source has them', () => {
    for (const v of ['groddle', 'firebog', 'zutto']) {
      const src = item(`street_spirit_${v}`);
      const want = STREET_SPIRIT_VARIANTS[v].loneliness;
      assert.match(src, new RegExp(`"loneliness_size"\\s*: "${want.size}"`), v);
      assert.match(src, new RegExp(`"loneliness_y_offset"\\s*: "${want.y}"`), v);
      assert.match(src, new RegExp(`"loneliness_state"\\s*: "${want.state}"`), v);
    }
    assert.doesNotMatch(item('street_spirit_ix'), /loneliness_size/);
  });

  test('each region’s conversations are its own, and the talk lines are the source’s', () => {
    for (const v of SPIRIT_VARIANT_IDS) {
      const src = item(`street_spirit_${v}`);
      const ids = [...src.matchAll(/^function conversation_run_(\w+)\(/gm)].map((m) => m[1]);
      assert.deepEqual(ids, STREET_SPIRIT_VARIANTS[v].conversations, v);
    }
    for (const v of ['firebog', 'zutto']) {
      const lines = conversationLines(item(`street_spirit_${v}`)).filter((l) => l !== 'Sorry, what?').map(norm);
      const pool = dialoguePool(STREET_SPIRIT_VARIANTS[v].dialogueKey).map(norm);
      assert.equal(pool.length, lines.length, v);
      pool.forEach((line, i) => assert.equal(line, lines[i], `${v} line ${i}`));
      for (const line of dialoguePool(`street_spirit_${v}`)) assert.doesNotMatch(line, /—/);
    }
  });
});

test.describe('art', () => {
  /** WebP canvas size (VP8X, VP8L or VP8). */
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

  test('every look ships every state, and each strip holds its frames', () => {
    for (const v of SPIRIT_VARIANT_IDS) {
      for (const look of Object.keys(STREET_SPIRIT_ART[v].looks)) {
        const sheets = spiritSheets(v, look);
        assert.equal(sheets.length, Object.keys(STREET_SPIRIT_ART[v].states).length);
        for (const def of sheets) {
          const file = join(ROOT, 'public', def.path);
          assert.ok(existsSync(file), def.path);
          const { w, h } = webpSize(file);
          assert.equal(w, def.fw * Math.min(def.cols, def.frames), def.path);
          assert.equal(h, def.fh * Math.ceil(def.frames / def.cols), def.path);
        }
        const a = spiritAnchor(v, look);
        assert.ok(a.x > 0 && a.x < 1 && a.y === 1);
      }
    }
  });

  test('the OGA source sheets exist for every look', () => {
    const oga = join(ROOT, '../opengameart/extracted_g174/glitch-assets');
    if (!existsSync(oga)) return;
    for (const [v, art] of Object.entries(STREET_SPIRIT_ART)) {
      const files = readdirSync(join(oga, art.dir));
      for (const prefix of Object.values(art.looks)) {
        for (const sheet of Object.values(art.states)) {
          assert.ok(files.some((f) => f.startsWith(`${art.dir}_${prefix}_x1_${sheet.oga}_png_`)), `${v} ${prefix} ${sheet.oga}`);
        }
      }
    }
  });

  test('looks are stable per street, G and L aliases agree', () => {
    assert.equal(spiritLookFor('groddle', 'GCR10157DMK1L0G'), spiritLookFor('groddle', 'LCR10157DMK1L0G'));
    assert.ok(STREET_SPIRIT_ART.zutto.looks[spiritLookFor('zutto', 'GA910DULG012JIE')] !== undefined);
    assert.equal(spiritSheet('groddle', 'nope', 'idle'), null);
    assert.equal(spiritSheet('ix', 'plain', 'talk').frames, 61);
  });
});

test.describe('behaviour helpers', () => {
  test('the Uralia spirit rises near a player and lowers when they leave', () => {
    assert.equal(zuttoNextClip('ground', false, false), 'ground');
    assert.equal(zuttoNextClip('ground', true, false), 'raise');
    assert.equal(zuttoNextClip('raise', true, false), 'raise');
    assert.equal(zuttoNextClip('raise', true, true), 'hover');
    assert.equal(zuttoNextClip('hover', true, false), 'hover');
    assert.equal(zuttoNextClip('hover', false, false), 'lower');
    assert.equal(zuttoNextClip('lower', false, true), 'ground');
    assert.equal(zuttoNextClip('lower', true, true), 'raise');
    assert.equal(zuttoNear({ x: 0, y: 0 }, { x: 249, y: -249 }), true);
    assert.equal(zuttoNear({ x: 0, y: 0 }, { x: 250, y: 0 }), false);
  });

  test('Talk speaks the region’s lines; store vendors keep the shared Groddle lines', () => {
    assert.equal(nextDialogue('street_spirit_groceries', {}).key, 'street_spirit');
    assert.equal(nextDialogue('street_spirit_firebog', {}).key, 'street_spirit_firebog');
    const ctx = { pc: { energy: 100, mood: 50, imagination: 0, xp: 0 }, inv: {}, skills: { learned: [] } };
    const target = { classId: 'street_spirit_kitchen_tools', state: { vendorLabel: 'Kitchen Tools Vendor', spiritDialogue: 'street_spirit_zutto' } };
    const spoken = runVerb(target, 'talk_to', ctx);
    assert.equal(spoken.speech.text, dialoguePool('street_spirit_zutto')[0]);
    assert.equal(spoken.speech.speaker, 'Kitchen Tools Vendor');
    const plain = runVerb({ classId: 'street_spirit_kitchen_tools', state: { vendorLabel: 'Kitchen Tools Vendor' } }, 'talk_to', ctx);
    assert.equal(plain.speech.text, dialoguePool('street_spirit')[0]);
  });

  test('the feature is registered and dresses only the vendor spirit', () => {
    const index = readFileSync(join(ROOT, 'public/js/features/index.js'), 'utf8');
    assert.match(index, /import \{ streetSpiritsFeature \} from '\.\/street-spirits-feature\.js\?v=[\w-]+'; FEATURES\.push\(streetSpiritsFeature\);/);
    const feature = readFileSync(join(ROOT, 'public/js/features/street-spirits-feature.js'), 'utf8');
    assert.match(feature, /startsWith\('street_spirit_'\) && it\.state\?\.vendorKey/);
    // runVerbOverride handles Talk to only when a conversation is offered; otherwise content.js speaks.
    const override = feature.slice(feature.indexOf('  runVerbOverride('), feature.indexOf('  save() {'));
    assert.match(override, /if \(verbId !== 'talk_to'\) return null;/);
    assert.match(override, /startConversation\(engine, target, Date\.now\(\)\)\) return true;\n    return null;/);
  });
});

/** One conversation_run_<id> body: its title and each step's spirit line and answer, decoded as JS strings. */
function gsjsConversation(src, id) {
  const start = src.indexOf(`function conversation_run_${id}(`);
  const body = src.slice(start, src.indexOf('\n}\n', start));
  const str = (raw) => JSON.parse(`"${raw}"`);
  const title = body.match(/var conversation_title = "([^"]+)"/)[1];
  const choices = [...body.matchAll(/= \{txt: "((?:[^"\\]|\\.)*)", value: '[\w-]+'\};/g)].map((m) => str(m[1]));
  const lines = [...body.matchAll(/this\.conversation_(?:start|reply)\(pc, (?:msg, )?"((?:[^"\\]|\\.)*)", choices\['(\d)'\], null, null, null, \{title: conversation_title\}\);/g)];
  const calls = (body.match(/this\.conversation_(?:start|reply)\(/g) || []).length;
  return { title, choices, lines: lines.map((m) => str(m[1])), steps: lines.map((m) => Number(m[2])), calls, body };
}

function gsjsGate(src, id) {
  const start = src.indexOf(`function conversation_canoffer_${id}(`);
  return src.slice(start, src.indexOf('\n}\n', start)).match(/conversations_has_completed\(null, "(\w+)"\)/)?.[1];
}

test.describe('conversations against GameServerJS (G185)', () => {
  const VARIANTS = ['groddle', 'firebog', 'zutto'];

  test('each region tells its own conversations, in its class order; Ix and the legacy class have none', () => {
    for (const v of VARIANTS) {
      const src = item(`street_spirit_${v}`);
      const list = src.slice(src.indexOf('var conversations = ['), src.indexOf('];', src.indexOf('var conversations = [')));
      assert.deepEqual([...list.matchAll(/"(\w+)"/g)].map((m) => m[1]), [...TALK_ORDER[v]], v);
      assert.deepEqual([...TALK_ORDER[v]], STREET_SPIRIT_VARIANTS[v].conversations, v);
      assert.equal(TALK_CLASSES[v], STREET_SPIRIT_VARIANTS[v].classTsid);
      for (const id of TALK_ORDER[v]) assert.equal(SPIRIT_CONVERSATIONS[id].variant, v, id);
    }
    assert.equal(Object.keys(SPIRIT_CONVERSATIONS).length, 8);
    for (const name of ['street_spirit', 'street_spirit_ix']) assert.doesNotMatch(item(name), /^function conversation_run_/m);
    assert.equal(TALK_ORDER.ix, undefined);
  });

  test('every step is verbatim: the spirit line and its one answer, in order', () => {
    for (const v of VARIANTS) {
      const src = item(`street_spirit_${v}`);
      for (const id of TALK_ORDER[v]) {
        const want = gsjsConversation(src, id);
        const have = SPIRIT_CONVERSATIONS[id];
        assert.equal(have.title, want.title, id);
        assert.equal(want.calls, want.lines.length, `${id}: every call parsed`);
        assert.deepEqual(want.steps, want.lines.map((_, i) => i), `${id}: one step per choice set`);
        assert.equal(have.steps.length, want.lines.length, id);
        assert.deepEqual(have.steps.map((s) => s.text), want.lines, id);
        assert.deepEqual(have.steps.map((s) => s.choice), want.choices, id);
        // The last answer completes the conversation.
        const lastValue = `${id}-${want.lines.length - 1}-2`;
        assert.match(want.body, new RegExp(`if \\(msg\\.choice == "${lastValue}"\\)\\{\\s*pc\\.conversations_complete\\(this\\.class_tsid, conversation_id, chain\\);`));
        assert.deepEqual(talkBeats(id), have.steps.map((s) => ({ text: s.text, response: s.choice })));
        const [from, to] = have.source.match(/(\d+)-(\d+)$/).slice(1).map(Number);
        const lines = src.split('\n');
        assert.match(lines[from - 1], new RegExp(`^function conversation_canoffer_${id}\\(`), `${id} source start`);
        assert.equal(lines[to - 1], '}', `${id} source end`);
      }
    }
  });

  test('no conversation gives a reward, and none needs a chain', () => {
    for (const v of VARIANTS) {
      const src = item(`street_spirit_${v}`);
      for (const id of TALK_ORDER[v]) {
        const { body } = gsjsConversation(src, id);
        assert.match(body, /var chain = null;/);
        assert.doesNotMatch(body, /self_effects\.push|apiGive|stats_add|xp_give|achievements_/, id);
      }
    }
  });

  test('gates: the first of each pair waits on a shrine conversation, the second on the first', () => {
    const want = {
      street_spirit_stories_1: 'facts_of_the_giants_4',
      street_spirit_stories_2: 'street_spirit_stories_1',
      sonnets_of_the_street_spirit_1: 'from_the_books_of_the_giants_3',
      sonnets_of_the_street_spirit_2: 'sonnets_of_the_street_spirit_1',
      street_spirit_mysteries_1: 'voicemail_of_the_giants_3',
      street_spirit_mysteries_2: 'street_spirit_mysteries_1',
      when_down_was_up_1: 'rituals_of_the_giants_3',
      when_down_was_up_2: 'when_down_was_up_1',
    };
    for (const [id, gate] of Object.entries(want)) {
      assert.equal(SPIRIT_CONVERSATIONS[id].gate, gate, id);
      assert.equal(gsjsGate(item(`street_spirit_${SPIRIT_CONVERSATIONS[id].variant}`), id), gate, id);
    }
    // The four shrine gates are conversations on the npc_shrine_* classes, not books, built since G189.
    const shrines = readdirSync(join(GSJS, 'items')).filter((f) => f.startsWith('npc_shrine_'));
    const gates = Object.values(want).filter((g) => !SPIRIT_CONVERSATIONS[g]);
    assert.equal(gates.length, 4);
    for (const gate of gates) {
      assert.ok(shrines.some((f) => readFileSync(join(GSJS, 'items', f), 'utf8').includes(`function conversation_run_${gate}(`)), gate);
      assert.ok(CONVERSATIONS[gate].tellers.every((cls) => cls.startsWith('npc_shrine_')), gate);
    }
    assert.deepEqual([...UNBUILT_GATES], []);
  });

  test('no gate is met by default any more (UNBUILT_GATES lists only gates the remake cannot tell)', () => {
    const files = [];
    const walk = (dir) => {
      for (const f of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, f.name);
        if (f.isDirectory()) walk(p);
        else if (/\.js$/.test(f.name) && !p.endsWith('street-spirit-talks.js') && !p.endsWith('street-spirits-feature.js')) files.push(p);
      }
    };
    walk(join(ROOT, 'public/js'));
    files.push(join(ROOT, 'public/game.js'), join(ROOT, 'public/content.js'));
    for (const gate of UNBUILT_GATES) {
      const hit = files.find((f) => readFileSync(f, 'utf8').includes(gate));
      assert.equal(hit, undefined, `${gate} is now tracked in ${hit}: drop it from UNBUILT_GATES`);
    }
  });

  test('offer rules and call-outs are the source’s (players/inc_conversations.js)', () => {
    const inc = readFileSync(join(GSJS, 'players/inc_conversations.js'), 'utf8');
    const offer = inc.slice(inc.indexOf('function conversations_offer('), inc.indexOf('function conversations_force_offer('));
    assert.match(inc, /var timeout = config\.is_dev \? 10 : 30\*60;/);
    assert.equal(TALK_RULES.offerTimeoutMs, 30 * 60 * 1000);
    assert.equal(TALK_RULES.devTimeoutMs, 10 * 1000);
    assert.match(offer, /now - this\.date_last_loggedin < \(5\*60\)/);
    assert.equal(TALK_RULES.loginGraceMs, 5 * 60 * 1000);
    assert.match(offer, /stats_get_last_street_visit\(this\.location\.tsid\) < 10\)/);
    assert.equal(TALK_RULES.streetDwellMs, 10 * 1000);
    assert.match(offer, /getQuestInstance\('donate_to_all_shrines'\)/);
    assert.equal(TALK_RULES.shrineQuest, 'donate_to_all_shrines');
    assert.match(inc, /source\.sendBubble\(choice, 10000, this\);/);
    assert.equal(TALK_RULES.bubbleMs, 10000);
    const list = inc.slice(inc.indexOf('var convo_bubble_choices = ['), inc.indexOf('];', inc.indexOf('var convo_bubble_choices')));
    assert.deepEqual([...list.matchAll(/^\t"(.*)",?$/gm)].map((m) => JSON.parse(`"${m[1]}"`)), [...CONVO_BUBBLE_CHOICES]);
    assert.equal(offerBubble(0), "Hey friend, come here, I've got something to tell you!");
    assert.equal(offerBubble(0.99), 'Friend! Pssssst! Talk to me! Friend!');
    assert.equal(offerBubble(8.5 / 13), 'Psst, friend… Pssst, talk to me!… Friend!');
    for (let i = 0; i < 13; i++) assert.doesNotMatch(offerBubble(i / 13), /\{pc_label\}|—/);
  });

  test('a player is offered each conversation once, in order, under the source timings', () => {
    const t0 = 1_000_000_000;
    const state = normalizeTalkState();
    const ctx = (now, extra = {}) => ({ now, sessionStart: t0, streetEnteredAt: t0, shrinesDone: true, ...extra });
    const M = 60 * 1000;
    assert.equal(canOffer(state, 'when_down_was_up_1', ctx(t0 + 4 * M)).reason, 'login');
    assert.equal(canOffer(state, 'when_down_was_up_1', ctx(t0 + 6 * M, { streetEnteredAt: t0 + 6 * M - 9000 })).reason, 'street');
    assert.equal(canOffer(state, 'when_down_was_up_1', ctx(t0 + 6 * M, { shrinesDone: false })).reason, 'donate_to_all_shrines');
    assert.equal(canOffer(state, 'when_down_was_up_1', ctx(t0 + 6 * M)).reason, 'gate:rituals_of_the_giants_3');
    assert.equal(canOffer(state, 'when_down_was_up_1', ctx(t0 + 6 * M, { strict: true })).reason, 'gate:rituals_of_the_giants_3');
    assert.equal(canOffer(state, 'when_down_was_up_2', ctx(t0 + 6 * M)).reason, 'gate:when_down_was_up_1');
    // Told at a Spriggan shrine well before: the gate holds for real (G189).
    state.completed.npc_shrine_spriggan = { rituals_of_the_giants_3: t0 - 40 * M };

    let now = t0 + 6 * M;
    assert.deepEqual(offerNext(state, 'zutto', ctx(now)), { id: 'when_down_was_up_1', reason: '' });
    assert.deepEqual(offeredFor(state, 'zutto'), ['when_down_was_up_1']);
    assert.deepEqual(offeredFor(state, 'firebog'), []);
    assert.equal(hasOffered(state, 'when_down_was_up_1', now + 29 * M), true);
    // Still offered: nothing new until it expires or is told.
    assert.equal(offerNext(state, 'zutto', ctx(now + M)).reason, 'offered');
    // The 30-minute gap after any offer holds every region.
    assert.equal(offerNext(state, 'firebog', ctx(now + M)).reason, 'cooldown');
    // An expired, untold offer stays runnable and can be offered again.
    assert.equal(offerNext(state, 'zutto', ctx(now + 31 * M)).id, 'when_down_was_up_1');
    now += 31 * M;
    completeTalk(state, 'zutto', 'when_down_was_up_1', now + 1000);
    assert.equal(hasCompleted(state, 'when_down_was_up_1'), true);
    assert.deepEqual(state.completed, { npc_shrine_spriggan: { rituals_of_the_giants_3: t0 - 40 * M }, street_spirit_zutto: { when_down_was_up_1: now + 1000 } });
    assert.deepEqual(offeredFor(state, 'zutto'), []);
    // 30 minutes after the last completion, the second opens; the first never returns.
    assert.equal(offerNext(state, 'zutto', ctx(now + 20 * M)).reason, 'cooldown');
    assert.deepEqual(offerNext(state, 'zutto', ctx(now + 31 * M)), { id: 'when_down_was_up_2', reason: '' });
    completeTalk(state, 'zutto', 'when_down_was_up_2', now + 32 * M);
    assert.deepEqual(offerNext(state, 'zutto', ctx(now + 90 * M)), { id: '', reason: 'none' });
  });

  test('dev rules, strict gates and the saved ledger', () => {
    const state = normalizeTalkState();
    const dev = { now: 50_000, dev: true, sessionStart: 49_000, streetEnteredAt: 30_000, shrinesDone: false };
    assert.equal(offerNext(state, 'groddle', dev).reason, 'gate:facts_of_the_giants_4');
    assert.equal(gateMet(state, 'facts_of_the_giants_4'), false);
    assert.equal(gateMet(state, 'facts_of_the_giants_4', { strict: true }), false);
    state.completed.npc_shrine_zille = { facts_of_the_giants_4: 1 };
    state.completed.npc_shrine_ti = { voicemail_of_the_giants_3: 1 };
    assert.equal(gateMet(state, 'facts_of_the_giants_4'), true);
    assert.equal(gateMet(state, 'facts_of_the_giants_4', { strict: true }), true);
    assert.equal(offerNext(state, 'groddle', dev).id, 'street_spirit_stories_1');
    assert.equal(offerNext(state, 'groddle', { ...dev, now: 55_000 }).reason, 'offered');
    assert.equal(offerNext(state, 'firebog', { ...dev, now: 61_000 }).id, 'street_spirit_mysteries_1');
    assert.equal(gateMet(state, 'street_spirit_stories_1'), false);
    // A conversation chain in progress holds the spirits (chain null), as every conversation outside one.
    // conversation_canoffer checks the chain before the gate.
    state.chainsInProgress.facts_of_the_giants = 60_000;
    assert.equal(canOffer(state, 'when_down_was_up_1', { ...dev, now: 90_000 }).reason, 'chain');
    state.chainsInProgress = {};
    assert.equal(canOffer(state, 'when_down_was_up_1', { ...dev, now: 90_000 }).reason, 'gate:rituals_of_the_giants_3');
    state.completed.npc_shrine_spriggan = { rituals_of_the_giants_3: 1 };
    assert.equal(canOffer(state, 'when_down_was_up_1', { ...dev, now: 90_000 }).ok, true);
    const round = normalizeTalkState(JSON.parse(JSON.stringify(state)));
    assert.deepEqual(round, state);
    const empty = { chainsCompleted: {}, chainsInProgress: {}, heard: {} };
    assert.deepEqual(normalizeTalkState({ completed: { a: { b: 'x', c: 5 } }, offered: [], lastOffer: -1 }), { completed: { a: { c: 5 } }, offered: {}, lastOffer: 0, ...empty });
    assert.deepEqual(normalizeTalkState(null), { completed: {}, offered: {}, lastOffer: 0, ...empty });
  });

  test('the feature saves the ledger, offers on approach and runs the talk in the shared dialogue', () => {
    const feature = readFileSync(join(ROOT, 'public/js/features/street-spirits-feature.js'), 'utf8');
    assert.match(feature, /from '\.\.\/street-spirit-talks\.js\?v=[\w-]+'/);
    // The spirit's lines from its saved line on (G202 resume), each answer saving the line reached.
    assert.match(feature, /const all = talkBeats\(id\);[\s\S]*?const beats = all\.slice\(start\)[\s\S]*?engine\.scriptedDialogue\(\{[\s\S]*?beats,[\s\S]*?cancelable: true,/);
    assert.match(feature, /saveState\(engine, variant, id, target, i \+ 1\);/);
    assert.match(feature, /completeTalk\(record\(\), variant, id, Date\.now\(\)\);\n      clearCurrentState\(record\(\)\);/);
    // conversations_login: once per load, the street's spirit in the source's 300 x 150 range.
    assert.match(feature, /function resumeTick\(engine, now\) \{[\s\S]*?resumeTarget\(record\(\), \{ street: engine\.streetTsid, player: engine\.player,[\s\S]*?startConversation\(engine, t, now, \{ id: st\.id, step: st\.step \}\);/);
    assert.match(feature, /shrinesDoneAt: questDoneAt\(engine\.questState \|\| \{\}, TALK_RULES\.shrineQuest\)/);
    assert.match(feature, /engine\.say\(t, offerBubble\(\), TALK_RULES\.bubbleMs\);/);
    // The ledger is the shared record (js/conversations.js); the old saved slice is handed over on restore.
    assert.match(feature, /const record = \(\) => conversationRecord\(\);/);
    assert.match(feature, /save\(\) \{\n    return \{ moved: 'conversations' \};/);
    assert.match(feature, /if \(slice\?\.moved !== 'conversations'\) adoptLegacyTalks\(slice\);/);
    assert.match(feature, /questStatus\(engine\.questState \|\| \{\}, TALK_RULES\.shrineQuest\) === 'done'/);
  });

  test('speech bubbles clamped onto a speaker hang under its feet instead', () => {
    const game = readFileSync(join(ROOT, 'public/game.js'), 'utf8');
    const fn = game.slice(game.indexOf('function positionSpeechBubble'), game.indexOf('function showSpeechBubble'));
    // G214: the client's push over the speaker first (js/speech-placement.js placeSpeechTip, tests/speech-placement.test.js).
    assert.match(fn, /belowFits: below \+ 11 \+ meta\.height <= cameraY \+ LOCATION_VIEW_H - 8,/);
    assert.match(fn, /const flip = place\.flip;[\s\S]*?bubble\.y = place\.tip;/);
    assert.match(fn, /bubble\.pivot\.y = flip \? -11 : meta\.height \+ 11;/);
    assert.match(game, /bubble\.addChild\(bg, speaker, body\);/);
  });

  test('a dressed spirit\'s bubble sits over its art, the 244 px Firebog too, not the 170 px cap (G202)', () => {
    const game = readFileSync(join(ROOT, 'public/game.js'), 'utf8');
    const fn = game.slice(game.indexOf('function positionSpeechBubble'), game.indexOf('function showSpeechBubble'));
    assert.match(fn, /const artHeight = Number\(meta\.target\.artHeight\);\n  const spriteHeight = artHeight > 0 \? artHeight : clamp\(Math\.abs\(spr\.height \|\| 60\), 36, 170\);/);
    const feature = readFileSync(join(ROOT, 'public/js/features/street-spirits-feature.js'), 'utf8');
    assert.match(feature, /const h = box\.crop\.h;[\s\S]*?target\.artHeight = h - 2;/);
    assert.equal(spiritCell('firebog', 'large').crop.h, 244);
  });

  test('&spiritautoplay=far keeps the spirit in view on a short deck (G239, Somewhat Sump)', async () => {
    const { spiritFarSpot } = await import('../public/js/features/street-spirits-feature.js?v=g464-2');
    // A flat street: 330 px to the right on the spirit's own floor, camera untouched.
    const flat = [{ x1: 0, y1: 900, x2: 3000, y2: 900 }];
    assert.deepEqual(spiritFarSpot(flat, 1000, 900), { x: 1330, y: 900, lookY: 0 });
    // A wall of nothing to the right: the left side.
    assert.deepEqual(spiritFarSpot([{ x1: 0, y1: 900, x2: 1100, y2: 900 }], 1000, 900), { x: 670, y: 900, lookY: 0 });
    // Somewhat Sump (GLI57DI72HI153U): the spirit stands on a deck x 4601-4933
    // near y 660 with the ground at y 902-920 on both sides; no floor at its
    // height 280-430 px away, so 330 px off on the ground with the camera lifted.
    const street = JSON.parse(readFileSync(join(ROOT, 'public/assets/streets/GLI57DI72HI153U.json'), 'utf8'));
    const { platformsScreen } = await import('../public/js/street-model.js?v=g442-6');
    const sump = platformsScreen(street);
    const spot = spiritFarSpot(sump, 4797, 650, { artHeight: 140, viewH: 408 });
    assert.equal(spot.x, 5127);
    assert.ok(spot.y > 900 && spot.y < 920, `ground ${spot.y}`);
    assert.ok(spot.y - 650 >= 250, 'outside the Uralia wake box (street_spirit_zutto.js 377)');
    assert.ok(spot.lookY < 0, 'camera lifted');
    // The view (top = feet + lookY - 0.75 * 408) reaches the spirit's head, or keeps the feet at its bottom edge.
    const top = spot.y + spot.lookY - 0.75 * 408;
    assert.ok(Math.abs(top - Math.max(650 - 140 - 12, spot.y - 408)) <= 1);
    assert.ok(spot.y <= top + 408 + 1, 'feet still in the view');
    // A short spirit fits whole.
    const small = spiritFarSpot(sump, 4797, 650, { artHeight: 60, viewH: 408 });
    assert.ok(small.y + small.lookY - 0.75 * 408 <= 650 - 60 - 12 + 1);
    const feature = readFileSync(join(ROOT, 'public/js/features/street-spirits-feature.js'), 'utf8');
    assert.match(feature, /engine\.setCameraLook\?\.\(0, spot\.lookY\);/);
    assert.match(feature, /if \(farLook\) \{\n      farLook = false;\n      engine\?\.setCameraLook\?\.\(0, 0\);/);
  });
});
