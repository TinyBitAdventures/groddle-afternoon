/**
 * G806 (chat 2026-11-12): players running back-to-back parties could not tell when the current Party
 * Space would end so the next could start. Glitch only said "Our Party Space will expire in 5
 * minutes." (GSJS groups/party.js 729); the readout is the remake's own: the HUD in the space says
 * "59:55 left", and the party panel (Classic's party box, the Social drawer's Party chat) says
 * "Party Space: Toxic Moon · 23:14 left" while the party has one, from the clock the client already
 * keeps (online, the server's `left`: js/party-spaces-mp.js normalizeSpace).
 * Run: node --test tests/party-space-left.test.js
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PARTY_LEFT_TEXT, PARTY_SPACES, partySpaceLeftLine } from '../public/js/party-spaces.js?v=91ce15c5';
import { partySpacesFeature } from '../public/js/features/party-spaces-feature.js?v=7cdb53d7';
import { partyFeature } from '../public/js/features/party-feature.js?fresh=party-space-left';
import { FakeEl } from './fake-scene.js';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, 'public', rel), 'utf8');

describe('G806: a Party Space says its time left', () => {
  it('the words: plain, short, the clock the HUD and the ATM use', () => {
    assert.equal(PARTY_LEFT_TEXT.left(23 * 60_000 + 14_000), '23:14 left');
    assert.equal(PARTY_LEFT_TEXT.left(3_600_000), '1:00:00 left');
    assert.equal(partySpaceLeftLine('Toxic Moon', 59_000), 'Party Space: Toxic Moon · 0:59 left');
    assert.equal(PARTY_LEFT_TEXT.tip, 'Time left in this Party Space');
    for (const t of [PARTY_LEFT_TEXT.tip, PARTY_LEFT_TEXT.left(1), partySpaceLeftLine('X', 1)]) assert.doesNotMatch(t, /[–—]/);
  });

  it('the feature answers partySpaceLeft from the live party, null without one or once it ended', () => {
    const now = Date.now();
    partySpacesFeature.restore({ party: { template: 'moon', expiresAt: now + 600_000, startedAt: now } });
    const left = partySpacesFeature.partySpaceLeft(now);
    assert.equal(left.label, PARTY_SPACES.moon.label);
    assert.equal(left.ms, 600_000);
    assert.equal(left.line, `Party Space: ${PARTY_SPACES.moon.label} · 10:00 left`);
    assert.equal(partySpacesFeature.partySpaceLeft(now + 600_000), null);
    partySpacesFeature.restore({});
    assert.equal(partySpacesFeature.partySpaceLeft(now), null);
  });

  it('the HUD clock says "left" and has its tip', () => {
    const src = read('js/features/party-spaces-feature.js');
    assert.match(src, /<span data-party-clock title="\$\{PARTY_LEFT_TEXT\.tip\}"><\/span>/);
    assert.match(src, /clock\.textContent = PARTY_LEFT_TEXT\.left\(left\);/);
  });
});

describe('G806: the party panel shows it (features/party-feature.js)', () => {
  const saved = {};
  let client;
  let engine;
  let space = null;
  const listeners = new Map();

  before(() => {
    for (const k of ['document', 'groddleParty']) saved[k] = globalThis[k];
    const els = new Map();
    const body = new FakeEl('body');
    const dock = new FakeEl('div');
    const form = new FakeEl('form');
    dock.append(form);
    els.set('local-chat-dock', dock);
    els.set('local-chat-form', form);
    globalThis.document = {
      createElement: (t) => new FakeEl(t),
      createTextNode: (t) => ({ text: t, textContent: t }),
      head: new FakeEl('head'),
      body,
      getElementById: (id) => els.get(id) || null,
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener() {},
    };
    client = {
      state: 'online',
      me: { id: 1, name: 'Ada' },
      players: [],
      on(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); return () => listeners.get(type).delete(fn); },
      send() { return true; },
    };
    engine = {
      mode: 'multiplayer',
      started: true,
      data: {},
      query: (hook) => (hook === 'realtimeClient' ? client : hook === 'partySpaceLeft' ? space : null),
      setData: (k, v) => { engine.data[k] = v; },
      toast() {},
      chatLine() {},
    };
    partyFeature.onTick(16, 0, engine);
    for (const fn of listeners.get('msg:party') || []) fn({ t: 'party', party: { members: [{ id: 1, name: 'Ada', leader: true, online: true }, { id: 6, name: 'Fi', online: true }] } });
  });

  after(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete globalThis[k];
      else globalThis[k] = v;
    }
  });

  const line = () => globalThis.document.getElementById('local-chat-dock').all().find((n) => n.attrs?.['data-party-space-left'] !== undefined);

  it('no space: no line', () => {
    assert.equal(engine.data.partyState, 'in');
    assert.equal(line().hidden, true);
    assert.equal(engine.data.partySpaceLeft || '', '');
  });

  it('a space: its name and time left, kept up as the clock runs', async () => {
    space = { label: 'Toxic Moon', ms: 1_394_000, line: partySpaceLeftLine('Toxic Moon', 1_394_000) };
    await new Promise((r) => setTimeout(r, 520));
    partyFeature.onTick(16, 0, engine);
    assert.equal(line().hidden, false);
    assert.equal(line().textContent, 'Party Space: Toxic Moon · 23:14 left');
    assert.equal(engine.data.partySpaceLeft, 'Party Space: Toxic Moon · 23:14 left');
    space = null;
    await new Promise((r) => setTimeout(r, 520));
    partyFeature.onTick(16, 0, engine);
    assert.equal(line().hidden, true);
  });
});
