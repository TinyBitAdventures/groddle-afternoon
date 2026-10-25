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
  spiritForStreet,
  spiritLookFor,
  spiritSheet,
  spiritSheets,
  spiritVariantForHub,
  zuttoNear,
  zuttoNextClip,
} from '../public/js/street-spirits.js';
import { dialoguePool, nextDialogue } from '../public/js/dialogue.js';
import { runVerb } from '../public/content.js?v=street-spirits-test-1';

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
    assert.match(feature, /return null;\n  \},/); // runVerbOverride never handles the verb
  });
});
