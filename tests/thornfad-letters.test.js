/**
 * Thornfad Layers' letters (js/thornfad-letters.js, features/thornfad-letters-feature.js, register G678).
 * Run: node --test tests/thornfad-letters.test.js
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LETTER_BOX, LETTER_INDICATOR, THORNFAD_LAYERS_TSID, inLetterBox, isThornfadLayers, letterOverlayKey, parseForcedLetter, rollStreetLetter } from '../public/js/thornfad-letters.js?v=1efc7d8d';
import { LETTER_WEIGHTS } from '../public/js/potions.js?v=4f4c996d';
import { LETTER_WORDS, LETTER_WORD_OFF, OVERLAY_EMOTES, letterFromWord, letterWord } from '../public/js/realtime-client.js?v=2663e2d3';
import { thornfadLettersFeature, onRemoteLetter } from '../public/js/features/thornfad-letters-feature.js?v=60e6b364';
import { OVERLAY_USES } from '../public/js/overlays.js?v=219965d5';
import { LETTER_KEYS, OVERLAYS } from '../tools/overlays/build.mjs';

const spike = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(spike, 'public');
const street = JSON.parse(readFileSync(join(pub, 'assets/streets', `${THORNFAD_LAYERS_TSID}.json`), 'utf8'));
const manifest = JSON.parse(readFileSync(join(pub, 'assets/sprites/overlays/overlays-more.json'), 'utf8'));
const xml = join(spike, '../streets/mnt/stos/location_data', `L${THORNFAD_LAYERS_TSID.slice(1)}.xml`);
const W = 101;

function fakeEngine({ tsid = THORNFAD_LAYERS_TSID, client = null, params = {} } = {}) {
  const data = {};
  return {
    data,
    started: true,
    mode: client ? 'multiplayer' : 'solo',
    player: { x: 238, y: 1240 },
    setData(k, v) { data[k] = v; },
    param: (k) => params[k] ?? null,
    query: (what, id) => (what === 'realtimeClient' ? client : what === 'remoteAvatar' ? { x: 1000 + id, y: 1240 } : null),
    transientInstance: () => false,
    homeContext: () => ({ inHome: false }),
    street: { tsid },
  };
}

function fakeClient() {
  const sent = [];
  const listeners = {};
  return {
    sent,
    listeners,
    emote(e) { sent.push(e); return true; },
    on(type, fn) { (listeners[type] ||= []).push(fn); return () => {}; },
    fire(type, msg) { for (const fn of listeners[type] || []) fn(msg); },
  };
}

describe("Thornfad Layers' letters: the source", () => {
  it('the street keeps give_letters, remove_letters and player_exit, and one door that nothing opens', () => {
    assert.deepEqual(Object.keys(street.events).sort(), ['give_letters', 'player_exit', 'remove_letters']);
    assert.equal(street.doors.length, 1);
    assert.equal(street.doors[0].is_locked, true);
    assert.equal(street.doors[0].key_id, 1);
  });

  it('the location file has one Collision-triggered Event Box and the roll as described', { skip: !existsSync(xml) && 'locations dump not beside this worktree' }, () => {
    const text = readFileSync(xml, 'utf8');
    const boxes = [...text.matchAll(/tsid="(\w+)" label="Collision-triggered Event Box"/g)].map((m) => m[1]);
    assert.deepEqual(boxes, [LETTER_BOX.id]);
    assert.match(text, /weight\[Math\.floor\(\(Math\.random\(\)\*weight\.length\)\+1\)\]/);
    assert.match(text, /announce_add_indicator\('letter'\+ ran, 'letter_'\+ran\+'_overlay', false, '1', \{width: 42, height: 60\}\)/);
    assert.ok(!/door|unlock/i.test(text.slice(text.indexOf('<object id="events">'), text.indexOf('<object id="incantations">'))), 'no event touches the door');
  });
});

describe("Thornfad Layers' letters: the rules", () => {
  it('rolls as the street wrote it: slot 0 never, one in 101 reads past the end', () => {
    assert.equal(LETTER_WEIGHTS.length, W);
    assert.equal(rollStreetLetter(() => 0), 'A'); // slot 1
    assert.equal(rollStreetLetter(() => 0.999999), '1'); // slot 101: nothing
    assert.equal(rollStreetLetter(() => 99.5 / W), 'heart'); // slot 100
    assert.equal(rollStreetLetter(() => 98.5 / W), 'heart'); // slot 99
    const counts = {};
    for (let i = 0; i < W; i++) {
      const l = rollStreetLetter(() => (i + 0.5) / W);
      counts[l] = (counts[l] || 0) + 1;
    }
    assert.equal(counts.A, 9);
    assert.equal(counts.E, 12);
    assert.equal(counts.T, 11);
    assert.equal(counts.heart, 2);
    assert.equal(counts['1'], 1);
  });

  it('the box takes in the door and the first Egg Plant, the pillar middle, and not the signpost', () => {
    const door = street.doors[0];
    assert.ok(inLetterBox(door.x, 1240), 'at the door');
    assert.ok(inLetterBox(1316, 1230), 'under the Egg Plant');
    assert.ok(inLetterBox(550, 1250), 'behind the pillar');
    assert.ok(!inLetterBox(238, 1250), 'at the signpost');
    assert.ok(!inLetterBox(1598, 1240), 'the second Egg Plant');
    assert.ok(!inLetterBox(door.x, 500), 'the ledges above');
    assert.ok(isThornfadLayers('LCR12NU45AM12BB') && isThornfadLayers(THORNFAD_LAYERS_TSID) && !isThornfadLayers('GCR1516SFHM122V'));
  });

  it('every letter and the heart is built from its CC0 FLA at 3 texels a shown pixel', () => {
    assert.equal(LETTER_KEYS.length, 27);
    for (const key of LETTER_KEYS) {
      assert.ok(OVERLAYS[key], `${key} configured`);
      const m = manifest[key];
      assert.ok(m, `${key} built`);
      assert.equal(m.src, `glitch-overlays/${key}.fla`);
      assert.equal(m.frames, 1);
      assert.ok(existsSync(join(pub, 'assets/sprites/overlays', m.file)), `${key} sheet`);
      assert.ok(m.scale / (LETTER_INDICATOR.wh / Math.max(...m.stage)) >= 2.8, `${key} sharp at ${LETTER_INDICATOR.wh} px`);
    }
    assert.equal(letterOverlayKey('E'), 'letter_E_overlay');
    assert.equal(letterOverlayKey('heart'), 'letter_heart_overlay');
    assert.equal(letterOverlayKey('1'), null);
    assert.equal(OVERLAY_USES.letter_A_overlay.dy, -120);
    assert.equal(LETTER_INDICATOR.dy, -120);
    assert.ok(LETTER_INDICATOR.headDy < LETTER_INDICATOR.dy && LETTER_INDICATOR.remoteDy < -170, 'over the taller avatar and the name plate');
    assert.equal(parseForcedLetter('e'), 'E');
    assert.equal(parseForcedLetter('HEART'), 'heart');
    assert.equal(parseForcedLetter('ab'), null);
  });

  it('the wire words pass the server (hub.go word) and round-trip', () => {
    for (const w of LETTER_WORDS) {
      assert.match(w, /^[a-z0-9_]{1,24}$/);
      assert.ok(OVERLAY_EMOTES.includes(w));
    }
    assert.equal(LETTER_WORDS.length, 28);
    assert.equal(letterWord('E'), 'letter_e');
    assert.equal(letterWord('heart'), 'letter_heart');
    assert.equal(letterWord('1'), LETTER_WORD_OFF);
    assert.equal(letterFromWord('letter_q'), 'Q');
    assert.equal(letterFromWord('letter_heart'), 'heart');
    assert.equal(letterFromWord(LETTER_WORD_OFF), '');
    assert.equal(letterFromWord('eyeballing'), null);
  });
});

describe("Thornfad Layers' letters: the feature", () => {
  it('registers in the feature list', () => {
    assert.match(readFileSync(join(pub, 'js/features/index.js'), 'utf8'), /FEATURES\.push\(thornfadLettersFeature\)/);
  });

  it('walking in gives a letter, standing keeps it, walking out takes it, coming back rolls again', () => {
    const engine = fakeEngine({ params: { thornfadletter: 'E' } });
    thornfadLettersFeature.onStreetEnter(engine.street, engine);
    thornfadLettersFeature.onTick(16, 0, engine);
    assert.equal(thornfadLettersFeature._state().letter, null);
    engine.player.x = 893;
    thornfadLettersFeature.onTick(16, 0, engine);
    assert.equal(thornfadLettersFeature._state().letter, 'E');
    engine.player.x = 1300;
    thornfadLettersFeature.onTick(16, 0, engine);
    assert.equal(thornfadLettersFeature._state().rolls, 1);
    engine.player.x = 238;
    thornfadLettersFeature.onTick(16, 0, engine);
    assert.equal(thornfadLettersFeature._state().letter, null);
    engine.player.x = 893;
    thornfadLettersFeature.onTick(16, 0, engine);
    assert.equal(thornfadLettersFeature._state().rolls, 2);
    thornfadLettersFeature.onStreetClear(engine);
    assert.equal(thornfadLettersFeature._state().letter, null);
  });

  it('does nothing on other streets', () => {
    const engine = fakeEngine({ tsid: 'GCR1516SFHM122V' });
    thornfadLettersFeature.onStreetEnter(engine.street, engine);
    engine.player.x = 893;
    thornfadLettersFeature.onTick(16, 0, engine);
    assert.equal(thornfadLettersFeature._state().letter, null);
    thornfadLettersFeature.onStreetClear(engine);
  });

  it('online: says the letter, takes it down, repeats it to a newcomer, and draws other players\' letters', () => {
    const client = fakeClient();
    const engine = fakeEngine({ client, params: { thornfadletter: 'heart' } });
    thornfadLettersFeature.onStreetEnter(engine.street, engine);
    engine.player.x = 893;
    thornfadLettersFeature.onTick(16, 0, engine);
    assert.deepEqual(client.sent, ['letter_heart']);
    client.fire('joined', { id: 9 });
    assert.deepEqual(client.sent, ['letter_heart', 'letter_heart']);
    client.fire('overlay', { id: 7, e: 'letter_s' });
    assert.deepEqual(thornfadLettersFeature._state().remote, [[7, 'S']]);
    onRemoteLetter(engine, { id: 7, e: 'letter_off' });
    assert.deepEqual(thornfadLettersFeature._state().remote, []);
    client.fire('overlay', { id: 8, e: 'eyeballing' });
    assert.deepEqual(thornfadLettersFeature._state().remote, []);
    engine.player.x = 238;
    thornfadLettersFeature.onTick(16, 0, engine);
    assert.equal(client.sent.at(-1), LETTER_WORD_OFF);
    thornfadLettersFeature.onStreetClear(engine);
  });
});
