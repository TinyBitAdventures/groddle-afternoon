/**
 * The hub maps against the Tribute Blog's region and world maps of Nov 2012 (round 5, lane
 * R5MAPS; research/coverage/round5-tribute-blog, reference only). The street lines, names and
 * GO buttons all match Tiny Speck's map data; what differed was what the map drew:
 *
 * - the Start streets, apartment towers and basements, machine rooms and Muufo's forgotten floor,
 *   which the client left off the map unless you stood on them (MapHub.as drawStreet,
 *   tools/build-map-hidden.mjs);
 * - the region list, which offered test and template hubs the world map never showed
 *   (GSJS public_hubs, js/map-graph.js PUBLIC_HUBS).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hiddenReason, readHiddenSources, STRAYS, TOWERS } from '../tools/build-map-hidden.mjs';
import { buildHubMapView, listHubsFromIndex, PUBLIC_HUBS, renderHubMapSvg } from '../public/js/map-graph.js?v=6d46febe';
import { hubMapSubtitle } from '../public/js/panel-copy.js?v=1d8de080';
import { doorRooms } from '../public/js/map-routes.js?v=c7e7dc80';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const GSJS = join(root, '..', 'glitch-GameServerJS');
const read = (p) => readFileSync(join(root, p), 'utf8');
const hubDir = join(root, 'public/assets/maps/hubs');
const HUBS = readdirSync(hubDir).filter((f) => /^hub-\d+\.json$/.test(f)).map((f) => JSON.parse(readFileSync(join(hubDir, f), 'utf8')));
const hub = (id) => HUBS.find((h) => String(h.hubId) === String(id));
const MAP_INDEX = JSON.parse(read('public/assets/maps/index.json'));
const STREETS = JSON.parse(read('public/assets/streets/index.json')).streets;
const GRAPH = JSON.parse(read('public/assets/content/signpost-graph.json'));
const g = (tsid) => `G${String(tsid).slice(1)}`;
const byName = (hubId, name) => hub(hubId).streets.filter((s) => s.name === name);

/** The streets the blog's maps leave off, by hub (post ids in tools/build-map-hidden.mjs). */
const HIDDEN = {
  101: ['Sabudana Drama Towers', 'Sabudana Drama Towers Basement'],
  98: ['Besara Community Machine Room', 'Egret Taun Towers', 'Egret Taun Towers Basement'],
  75: ['Bortola Start', 'Bortola Start', 'Bortola Start', 'Bortola Start', 'Hauki Seeks Manor', 'Hauki Seeks Manor Basement'],
  76: ['Alakol Start', 'Alakol Start', 'Alakol Start', 'Alakol Start'],
  93: ['Salatu Start', 'Salatu Start', 'Salatu Start', 'Salatu Start'],
  97: ['Hakusan Heaps Towers', 'Hakusan Heaps Towers Basement', 'Muufo Start', 'Muufo Start', 'Muufo Start', 'The forgotten floor'],
  58: ['Gregarious Towers', 'Gregarious Towers Basement', 'Meadow Community Machine Room'],
};

/**
 * The GO buttons on the blog's 35 region maps (post id: hub id -> the hubs they lead to).
 * Six GO buttons the final map data has came after those screenshots (Jal to Samudra and
 * Nottis to Drifa, both "added" per post 45119695823; Aranna and Callopee to Massadoe; Muufo and
 * Karnata to Brillah) and are not listed.
 */
const BLOG_GO = {
  86: ['Kajuu', 'Zhambu', 'Choru', 'Tamila'], // 38021017813
  91: ['Xalanga', 'Baqala', 'Andra'], // 38028473497
  95: ['Zhambu', 'Choru'], // 38079401262
  90: ['Vantalu', 'Besara', 'Xalanga', 'Baqala'], // 38088251579
  137: ['Vantalu'], // 38254736828
  100: ['Nottis', 'Aranna', 'Choru'], // 39679365930
  101: ['Besara', 'Vantalu'], // 40106877686
  98: ['Choru', 'Tamila', 'Aranna', 'Callopee'], // 41130542933
  107: ['Pollokoo', 'Besara'], // 42058429434
  106: ['Muufo', 'Tamila', 'Callopee'], // 42455962208
  97: ['Tamila', 'Karnata', 'Bortola', 'Lida', 'Pollokoo'], // 42806514860
  105: ['Karnata', 'Muufo', 'Ormonos', 'Bortola'], // 43532591753
  88: ['Lida', 'Muufo'], // 44020514193
  102: ['Alakol', 'Bortola', 'Firozi', 'Lida'], // 44499834380
  114: ['Alakol', 'Ormonos', 'Jal'], // 45360279179
  136: ['Firozi'], // 45869840667
  76: ['Groddle Heights', 'Kajuu', 'Ormonos', 'Bortola', 'Salatu', 'Firozi'], // 46629431194
  75: ['Kajuu', 'Ormonos', 'Alakol', 'Lida', 'Muufo', 'Tamila'], // 47895873006
  92: ['Baqala', 'Pollokoo', 'Bortola', 'Muufo', 'Besara'], // 48864010406
  85: ['Andra', 'Alakol', 'Baqala', 'Bortola'], // 50180893364
  89: ['Zhambu', 'Kajuu', 'Salatu', 'Tahli', 'Rasana'], // 50663175819
  113: ['Folivoria', 'Andra', 'Rasana'], // 51174285248
  119: ['Tahli'], // 51742706668
  109: ['Andra', 'Salatu', 'Roobrik', 'Tahli'], // 52102221161
  93: ['Alakol', 'Andra', 'Haoma', 'Rasana'], // 52753082477
  58: ['Shimla Mirch', 'Groddle Forest', 'Ix', 'Groddle Heights'], // 53378454849
  56: ['Ix', 'Uralia', 'Groddle Meadow', 'Groddle Heights', 'Shimla Mirch'], // 54303075449
  64: ['Alakol', 'Groddle Forest', 'Groddle Meadow'], // 55287177264
  120: ['Sura', 'Shimla Mirch', 'Fenneq'], // 55721596224
  123: ['Cauda', 'Sura'], // 56168485069
  121: ['Fenneq', 'Cauda', 'Jethimadh'], // 56538858201
  71: ['Shimla Mirch', 'Jethimadh Tower: Base', 'Chakra Phool', 'Sura'], // 56985182466
  63: ['Groddle Meadow', 'Chakra Phool', 'Groddle Forest', 'Cauda', 'Jethimadh'], // 58198623091
  72: ['Jethimadh', 'Shimla Mirch', 'Balzare', 'Kalavana', 'Kloro'], // 58946948418
  99: ['Chakra Phool'], // 59729710001
};

describe('round 5 maps: streets the client left off the hub map', () => {
  it('the hub files are current (node tools/build-map-hidden.mjs --check)', { skip: !existsSync(join(GSJS, 'config_prod.js')) && 'no glitch-GameServerJS beside the game' }, () => {
    execFileSync(process.execPath, [join(root, 'tools/build-map-hidden.mjs'), '--check'], { stdio: 'pipe' });
  });

  it('flags exactly the streets the blog maps leave off, and nothing else', () => {
    const flagged = {};
    for (const h of HUBS) for (const s of h.streets) if (s.invisible_to_outsiders) (flagged[h.hubId] ||= []).push(s.name);
    for (const v of Object.values(flagged)) v.sort();
    const want = Object.fromEntries(Object.entries(HIDDEN).map(([k, v]) => [k, [...v].sort()]));
    assert.deepEqual(flagged, want);
  });

  it('names each one for its reason (GSJS rules, then the blog for the towers and the stray floor)', { skip: !existsSync(join(GSJS, 'config_prod.js')) && 'no glitch-GameServerJS beside the game' }, () => {
    const src = readHiddenSources(GSJS);
    assert.equal(src.greeting.size, 15, 'greeting_locations');
    for (const [id, names] of Object.entries(HIDDEN)) {
      for (const name of new Set(names)) {
        for (const s of byName(id, name)) {
          const why = hiddenReason(s.tsid, src);
          const expect = / Start$/.test(name) ? 'greeting street' : /Machine Room/.test(name) ? 'machine room' : /Basement/.test(name) ? 'apartment basement' : /forgotten/.test(name) ? 'stray floor' : 'apartment tower';
          assert.equal(why, expect, `${name} ${s.tsid}`);
        }
      }
    }
    assert.equal(Object.keys(TOWERS).length, 5);
    assert.deepEqual(Object.keys(STRAYS), ['LDOOSA8V29J24I3']);
  });

  it('Muufo draws none of them, but draws the rest and the one you stand on', () => {
    const muufo = hub(97);
    const svg = renderHubMapSvg(buildHubMapView(muufo, '', STREETS));
    for (const name of ['Muufo Start', 'The forgotten floor', 'Hakusan Heaps Towers']) assert.doesNotMatch(svg, new RegExp(`>${name}<`), name);
    for (const name of ['Hakusan Heaps', 'Baeli Bray', 'Chima Chore', 'Mimosa Mix']) assert.match(svg, new RegExp(`>${name}<`), name);
    const drawn = muufo.streets.filter((s) => !s.invisible_to_outsiders).length;
    assert.equal(drawn, 32, 'the blog map draws 32 streets');
    assert.equal((svg.match(/class="map-seg /g) || []).length, drawn);
    // Inside the tower the map shows where you are (MapHub.as highlight_it).
    const tower = muufo.streets.find((s) => s.name === 'Hakusan Heaps Towers');
    const inside = buildHubMapView(muufo, g(tower.tsid), STREETS);
    assert.equal(inside.streets.find((s) => s.tsid === tower.tsid).hidden, false);
    assert.match(renderHubMapSvg(inside), />Hakusan Heaps Towers</);
    assert.match(hubMapSubtitle(buildHubMapView(muufo, '', STREETS)), /^32 streets/);
  });

  it('the hidden towers, basements and machine rooms are rooms behind their doors, both ways', () => {
    const rooms = doorRooms(GRAPH);
    const label = (t) => STREETS[t]?.label;
    const want = {
      'Sabudana Drama Towers': 'Sabudana Drama',
      'Sabudana Drama Towers Basement': 'Sabudana Drama Towers',
      'Egret Taun Towers': 'Egret Taun',
      'Egret Taun Towers Basement': 'Egret Taun Towers',
      'Hauki Seeks Manor': 'Hauki Seeks',
      'Hauki Seeks Manor Basement': 'Hauki Seeks Manor',
      'Hakusan Heaps Towers': 'Hakusan Heaps',
      'Hakusan Heaps Towers Basement': 'Hakusan Heaps Towers',
      'Gregarious Towers': 'Gregarious Grange',
      'Gregarious Towers Basement': 'Gregarious Towers',
      'Besara Community Machine Room': 'Canary Send',
      'Meadow Community Machine Room': 'Otterlane',
    };
    for (const [room, via] of Object.entries(want)) {
      const r = rooms.find((x) => label(x.room) === room);
      assert.ok(r, `${room} is listed behind a door`);
      assert.equal(label(r.via), via, `${room} through ${via}`);
      assert.ok(GRAPH.doors[r.via].includes(r.room), `a door from ${via} into ${room}`);
      assert.ok((GRAPH.doors[r.room] || []).includes(r.via), `and a door back from ${room} to ${via}`);
      assert.ok(GRAPH.offMap.includes(r.room));
    }
    // The Start streets are not destinations (GSJS get_map not_a_destination).
    for (const s of hub(76).streets.filter((x) => x.name === 'Alakol Start')) assert.ok(!rooms.some((r) => r.room === g(s.tsid)));
  });
});

describe('round 5 maps: GO buttons and regions against the blog maps', () => {
  it('every GO button on the blog maps is on ours, to that region, with one back', () => {
    const idOf = (name) => Object.values(MAP_INDEX.hubs).find((h) => h.hubName === name)?.hubId;
    for (const [id, names] of Object.entries(BLOG_GO)) {
      const here = hub(id);
      for (const name of names) {
        const go = here.hubs.find((x) => x.hubName === name);
        assert.ok(go, `${here.hubName}: To: ${name}`);
        assert.equal(String(go.hub_id), String(idOf(name)), `${here.hubName}: To: ${name} goes to that region`);
        assert.equal(String(STREETS[g(go.tsid)]?.hubId), String(go.hub_id), `${here.hubName}: To: ${name} lands on a street there`);
        // The street it lands on links back here (a signpost, or the tower base's door).
        const back = [...(GRAPH.streets[g(go.tsid)] || []), ...(GRAPH.doors[g(go.tsid)] || [])].some((t) => String(STREETS[t]?.hubId) === String(id));
        assert.ok(back, `${name} links back to ${here.hubName}`);
      }
    }
  });

  it('the region list is the world map\'s regions (GSJS public_hubs)', { skip: !existsSync(join(GSJS, 'config_prod.js')) && 'no glitch-GameServerJS beside the game' }, () => {
    const cfg = readFileSync(join(GSJS, 'config_prod.js'), 'utf8');
    const pub = cfg.match(/var public_hubs = \[([^\]]*)\];/)[1].split(',').map((s) => s.trim());
    assert.deepEqual([...PUBLIC_HUBS].sort(), pub.sort());
  });

  it('lists the blog\'s 35 regions and none of the test hubs; a hub on show stays listed', () => {
    const listed = listHubsFromIndex(MAP_INDEX);
    const names = new Set(listed.map((h) => h.hubName));
    for (const id of Object.keys(BLOG_GO)) assert.ok(names.has(hub(id).hubName), hub(id).hubName);
    for (const name of ['Abbasid', 'Old Groddle Forest', 'POLs', 'Shimla Mirch POLs', 'Gentle Island', 'Jethimadh Tower: Base', 'Jethimadh Tower: Mid']) assert.ok(!names.has(name), name);
    assert.ok(listHubsFromIndex(MAP_INDEX, { keep: '77' }).some((h) => h.hubId === '77'), 'the tower base opens from its GO button');
    assert.equal(listed.length, 54);
  });
});
