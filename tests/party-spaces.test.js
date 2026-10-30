/**
 * Party Spaces: packs, timed private spaces, the Party ATM (GSJS numbers).
 * Run: node --test tests/party-spaces.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PARTY_FULL_SECONDS,
  PARTY_PACKS,
  PARTY_PACK_CLASSES,
  PARTY_SPACES,
  PARTY_STORE_THEMES,
  PARTY_TASTER_SECONDS,
  PARTY_TEXT,
  createPartyTeleporter,
  extendParty,
  formatPartyClock,
  normalizePartyRecord,
  partyAlive,
  partyArrival,
  partyEcologyEntry,
  partyExitSignpost,
  partyExtendOptions,
  partyPackDurationSeconds,
  partyPhysics,
  partyRejoinEnergyCost,
  partySpaceForStreet,
  partyStackGroups,
  partyWarningDue,
  stackAvailable,
  startParty,
  teleporterPhase,
} from '../public/js/party-spaces.js?v=459a8597';
import { OWNED_STREETS } from '../public/js/location-events.js?v=b45cd9c3';
import { populationForStreet } from '../public/js/street-ecology.js?v=dbcefe18';

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, '../public');
const street = (tsid) => JSON.parse(readFileSync(join(publicDir, 'assets/streets', `${tsid}.json`), 'utf8'));

describe('party packs (items/party_pack*.js, catalog_stores.js store 19)', () => {
  it('has a full and a taster pack for all eight themes, with icons', () => {
    assert.equal(PARTY_PACK_CLASSES.length, 16);
    for (const classTsid of PARTY_PACK_CLASSES) {
      assert.ok(existsSync(join(publicDir, 'assets/sprites/icons', `${classTsid}.png`)), classTsid);
    }
  });

  it('times full packs at 60 minutes and tasters at 10', () => {
    assert.equal(partyPackDurationSeconds('party_pack_toxic_moon'), PARTY_FULL_SECONDS);
    assert.equal(partyPackDurationSeconds('party_pack_taster_toxic_moon'), PARTY_TASTER_SECONDS);
    assert.equal(PARTY_FULL_SECONDS, 3600);
    assert.equal(PARTY_TASTER_SECONDS, 600);
  });

  it('prices the seven stocked themes at 1100c / 220c and leaves Winter Wingding unsold', () => {
    const sold = PARTY_PACK_CLASSES.filter((c) => PARTY_PACKS[c].storePrice);
    assert.equal(sold.length, 14);
    assert.equal(PARTY_PACKS.party_pack_val_holla.storePrice, 1100);
    assert.equal(PARTY_PACKS.party_pack_taster_aquarius.storePrice, 220);
    assert.equal(PARTY_PACKS.party_pack_winter_wingding.storePrice, null);
    assert.equal(PARTY_PACKS.party_pack_mazzala_gala.baseCost, 1000);
    assert.equal(PARTY_PACKS.party_pack_taster_mazzala_gala.baseCost, 200);
    assert.deepEqual([...PARTY_STORE_THEMES].sort(), ['aquarius', 'mazzala', 'moon', 'nylon', 'pitchen', 'rainbow', 'val_holla']);
  });
});

describe('party spaces (config_prod.js party_spaces)', () => {
  it('maps every template to its imported street, which the location-events lane leaves to us', () => {
    for (const space of Object.values(PARTY_SPACES)) {
      const data = street(space.streetTsid);
      assert.equal(data.tsid, space.streetTsid);
      assert.equal(OWNED_STREETS[space.streetTsid], 'party');
      assert.equal(partySpaceForStreet(space.templateTsid), space);
      const sign = data.signposts[0];
      assert.deepEqual([sign.x, sign.y], [space.exit.x, space.exit.y], `${space.id} exit is signpost_1`);
      assert.deepEqual({ l: data.bounds.l, t: data.bounds.t, r: data.bounds.r }, { ...space.bounds }, `${space.id} bounds`);
      assert.deepEqual(partyArrival(space.id), partyArrival(space.id, data.bounds));
    }
  });

  it('reads each street physics block: low-gravity moon, swimming Nylon/Val Holla/Aquarius', () => {
    const moon = partyPhysics(street('GDOBUP8IR8E2IPH').physics.setting);
    assert.ok(Math.abs(moon.gravity - 346 / 1190) < 1e-9);
    assert.ok(Math.abs(moon.jump - 332 / 570) < 1e-9);
    assert.equal(moon.jetpack, false);
    for (const tsid of ['GDOK0A8OG1E2C7O', 'GUVNGTHAGP93U34', 'GUVU11R1HP9341R']) {
      assert.equal(partyPhysics(street(tsid).physics.setting).jetpack, true, tsid);
    }
    // Val Holla caps vertical speed at 351 (vy_max), below its 371 jump.
    assert.ok(Math.abs(partyPhysics(street('GUVNGTHAGP93U34').physics.setting).jump - 351 / 570) < 1e-9);
    assert.equal(partyPhysics(null), null);
    assert.equal(street('GDOE67MFL6E2FBR').physics, undefined);
  });

  it('applies the booster / waterjet event boxes as gravity multipliers', () => {
    const setting = street('GUVNGTHAGP93U34').physics.setting;
    const boosted = partyPhysics(setting, { gravity: PARTY_SPACES.val_holla.event.gravity });
    assert.ok(boosted.gravity < 0);
    assert.ok(Math.abs(boosted.gravity - (-4 * 280) / 1190) < 1e-9);
    assert.equal(PARTY_SPACES.aquarius.event.gravity, -7);
    assert.equal(PARTY_SPACES.aquarius.event.durationMs, 1200);
    assert.deepEqual(street('GUVU11R1HP9341R').events.waterjet[0].value, -7);
  });

  it('builds a private ecology row: exact rocks and quoins, no spawners or companions', () => {
    const moon = populationForStreet('GDOBUP8IR8E2IPH', partyEcologyEntry('moon'));
    assert.deepEqual(moon.rockClasses, ['rock_sparkly_1', 'rock_sparkly_1', 'rock_sparkly_1']);
    assert.equal(moon.quoins, 24);
    assert.equal(moon.apples, 0);
    assert.equal(moon.musicblocks, 0);
    assert.equal(moon.companions, false);
    assert.equal(moon.vendor, false);
    assert.equal(moon.shrine, false);
    assert.equal(moon.piggies + moon.chickens + moon.butterflies, 0);
    const nylon = populationForStreet('GDOK0A8OG1E2C7O', partyEcologyEntry('nylon'));
    assert.deepEqual(nylon.resourceNodeClasses, ['npc_salmon']);
    const rainbow = populationForStreet('GDOGBH4BG1E2BM0', partyEcologyEntry('rainbow'));
    assert.deepEqual(rainbow.treeClasses, ['trant_fruit']);
    // Ordinary rows keep their defaults.
    assert.equal(populationForStreet('X', { counts: {} }).quoins, 8);
  });

  it('groups each space goods into respawning stacks and tools into one-time stacks', () => {
    const groups = partyStackGroups('moon');
    const hooch = groups.find((g) => g.classTsid === 'hooch');
    assert.deepEqual(hooch, { classTsid: 'hooch', kind: 'goods', max: 2, respawns: true });
    const shaker = groups.find((g) => g.classTsid === 'cocktail_shaker');
    assert.equal(shaker.respawns, false);
    const now = 100000;
    assert.equal(stackAvailable(hooch, [now - 1000], now), 1);
    assert.equal(stackAvailable(hooch, [now - 10000], now), 2);
    assert.equal(stackAvailable(shaker, [], now, 2), 0);
    for (const space of Object.values(PARTY_SPACES)) {
      for (const g of partyStackGroups(space.id)) {
        assert.ok(existsSync(join(publicDir, 'assets/sprites/icons', `${g.classTsid}.png`)), `${space.id}: ${g.classTsid}`);
      }
    }
  });

  it('exits through signpost_1 to the saved street and arrives beside it', () => {
    const back = { tsid: 'GA5101HF7F429V5', label: 'Hechey Track', x: 812, y: 990 };
    const sign = partyExitSignpost('moon', back);
    assert.equal(sign.id, 'signpost_1');
    assert.deepEqual(sign.connects[0], { tsid: back.tsid, label: 'Hechey Track', arrive: { x: 812, y: 990 } });
    assert.equal(partyExitSignpost('moon', null), null);
    const arrive = partyArrival('moon', street('GDOBUP8IR8E2IPH').bounds);
    assert.deepEqual(arrive, { x: 142 + 150, y: 1373 });
    const glitchmas = partyArrival('glitchmas', street('GDOOS17UPNJ2HT7').bounds);
    assert.equal(glitchmas.x, 2270 + 2500 - 150);
  });
});

describe('party lifecycle (groups/party.js, party_atm.js)', () => {
  it('starts one party at a time and announces it', () => {
    const now = 1_000_000;
    const res = startParty(null, 'party_pack_taster_val_holla', { now });
    assert.equal(res.ok, true);
    assert.equal(res.party.template, 'val_holla');
    assert.equal(res.party.taster, true);
    assert.equal(res.party.expiresAt, now + 600_000);
    assert.equal(res.announce, 'You made us a new Party Space!');
    const again = startParty(res.party, 'party_pack_toxic_moon', { now: now + 1000 });
    assert.deepEqual(again, { ok: false, error: PARTY_TEXT.alreadyGoing });
    assert.equal(startParty(res.party, 'party_pack_toxic_moon', { now: now + 600_000 }).ok, true);
  });

  it('warns five minutes before expiry, once', () => {
    const party = startParty(null, 'party_pack_toxic_moon', { now: 0 }).party;
    assert.equal(partyWarningDue(party, 54 * 60_000), false);
    assert.equal(partyWarningDue(party, 55 * 60_000), true);
    party.warned = true;
    assert.equal(partyWarningDue(party, 56 * 60_000), false);
    assert.equal(partyAlive(party, 60 * 60_000), false);
  });

  it('extends at the template prices: tasters 5m/15m, full packs 10m/30m', () => {
    const now = 0;
    const taster = startParty(null, 'party_pack_taster_aquarius', { now }).party;
    assert.deepEqual(partyExtendOptions(taster).map((o) => o.label), ['5m for 5000c', '15m for 15000c']);
    const full = startParty(null, 'party_pack_double_rainbow', { now }).party;
    assert.deepEqual(partyExtendOptions(full).map((o) => o.label), ['10m for 3000c', '30m for 9250c']);
    const pc = { currants: 3500 };
    const ok = extendParty(full, 10, pc, { now: 1000 });
    assert.equal(ok.reply, 'Party on, Wayne.');
    assert.equal(ok.announce, 'You extended the party time!');
    assert.equal(pc.currants, 500);
    assert.equal(full.expiresAt, 70 * 60_000);
    assert.equal(extendParty(full, 30, pc, { now: 1000 }).reply, "You don't have enough currants to do that.");
    assert.equal(extendParty(full, 10, { currants: 1e6 }, { now: 71 * 60_000 }).reply, 'Down low, too slow.');
  });

  it('re-arms the warning when an extension pushes expiry back out', () => {
    const party = startParty(null, 'party_pack_taster_toxic_moon', { now: 0 }).party;
    party.warned = true;
    extendParty(party, 15, { currants: 9000 }, { now: 6 * 60_000 });
    assert.equal(party.warned, false);
  });

  it('opens the single-use teleporter 100px to the right: wait 1 s, appear 0.5 s, portal for 2 min', () => {
    const tp = createPartyTeleporter({ tsid: 'GDOBUP8IR8E2IPH', x: 400, y: 900, now: 0 });
    assert.equal(tp.x, 500);
    assert.equal(teleporterPhase(tp, 500), 'waiting');
    assert.equal(teleporterPhase(tp, 1200), 'appear');
    assert.equal(teleporterPhase(tp, 1600), 'portal');
    assert.equal(teleporterPhase(tp, 120_000), 'gone');
  });

  it('charges the teleport skill cost to rejoin, else 40% of max energy', () => {
    assert.equal(partyRejoinEnergyCost(null, 100), 40);
    assert.equal(partyRejoinEnergyCost(25, 100), 25);
    assert.equal(partyRejoinEnergyCost(null, 250), 100);
  });

  it('formats the party clock', () => {
    assert.equal(formatPartyClock(0), '0:00');
    assert.equal(formatPartyClock(599_001), '10:00');
    assert.equal(formatPartyClock(3_600_000), '1:00:00');
  });

  it('keeps a live party across reloads and drops expired ones', () => {
    const party = startParty(null, 'party_pack_nylon_phool', { now: 0 }).party;
    party.inside = true;
    party.returnTo = { tsid: 'GA5101HF7F429V5', label: 'Hechey Track', x: 1, y: 2 };
    party.taken = { blender: 1, junk: 0 };
    const saved = normalizePartyRecord(JSON.parse(JSON.stringify({ instructionsRead: true, partiesThrown: 2, party })), 1000);
    assert.equal(saved.instructionsRead, true);
    assert.equal(saved.partiesThrown, 2);
    assert.equal(saved.party.inside, true);
    assert.deepEqual(saved.party.taken, { blender: 1 });
    assert.equal(saved.party.returnTo.label, 'Hechey Track');
    assert.equal(normalizePartyRecord({ party }, 3_600_000).party, null);
    const fromParty = normalizePartyRecord({ party: { ...party, returnTo: { tsid: 'GDOK0A8OG1E2C7O', x: 0, y: 0 } } }, 1000);
    assert.equal(fromParty.party.returnTo, null);
  });
});

describe('party spaces feature wiring', async () => {
  const { partySpacesFeature } = await import('../public/js/features/party-spaces-feature.js?v=3392a54d');
  const { FEATURES } = await import('../public/js/features/index.js?v=92eec465');

  it('is registered with the feature host', () => {
    assert.ok(FEATURES.some((f) => f.id === partySpacesFeature.id));
  });

  it('keeps party streets private and freezes travel inside except the exit signpost', () => {
    const outside = { streetTsid: 'GA5101HF7F429V5' };
    assert.equal(partySpacesFeature.travelGate('GDOBUP8IR8E2IPH', outside).ok, false);
    assert.equal(partySpacesFeature.travelGate('GA510IHD1F426DS', outside), null);
    const now = Date.now();
    const party = startParty(null, 'party_pack_toxic_moon', { now }).party;
    party.inside = true;
    party.returnTo = { tsid: 'GA5101HF7F429V5', label: 'Hechey Track', x: 10, y: 20 };
    partySpacesFeature.restore({ party });
    const inside = { streetTsid: 'GDOBUP8IR8E2IPH' };
    assert.equal(partySpacesFeature.travelGate('GA510IHD1F426DS', inside, {}).ok, false);
    assert.equal(partySpacesFeature.travelGate('GA5101HF7F429V5', inside, { via: 'signpost' }), null);
    assert.equal(partySpacesFeature.travelGate('GDOBUP8IR8E2IPH', inside, {}), null, 'same-street doors');
    const data = street('GDOBUP8IR8E2IPH');
    partySpacesFeature.prepareStreet(data);
    assert.equal(data.signposts[0].connects[0].tsid, 'GA5101HF7F429V5');
    assert.equal(data.musicFile, 'TOXIC_MOON');
    const rainbow = street('GDOGBH4BG1E2BM0');
    partySpacesFeature.prepareStreet(rainbow);
    assert.equal(rainbow.musicFile, 'PARTY_LIVELY');
    assert.deepEqual(rainbow.signposts, []);
    // A reload inside the live party stays; any other party street goes home.
    assert.equal(partySpacesFeature.reloadLocation({ tsid: 'GDOBUP8IR8E2IPH', x: 1, y: 1 }), null);
    assert.deepEqual(partySpacesFeature.reloadLocation({ tsid: 'GDOGBH4BG1E2BM0', x: 1, y: 1 }), { tsid: 'GA5101HF7F429V5', x: 10, y: 20 });
    partySpacesFeature.restore({});
  });

  it('offers Activate on every pack', () => {
    const engine = {
      streetTsid: 'GA5101HF7F429V5',
      transientInstance: () => false,
      homeContext: () => ({ inHome: false }),
      streetExists: () => true,
      travelGate: () => null,
    };
    const [verb] = partySpacesFeature.packVerbs('party_pack_taster_aquarius', engine);
    assert.equal(verb.id, 'activate');
    assert.equal(verb.enabled, true);
    assert.equal(verb.tooltip, PARTY_TEXT.activateTooltip);
    assert.deepEqual(partySpacesFeature.packVerbs('apple', engine), []);
  });
});
