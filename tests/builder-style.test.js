/**
 * LEVEL BUILDER P5 (spec 7.3, 9.2, 10, section 14): the style guide and new art in the game.
 * tools/builder/style-profile.mjs (--check) and its style-profiles.json, the library palette
 * (tools/builder/deco-palette.mjs --check), js/builder/colour-stats.js, the style rules STY-001 to
 * STY-005 (js/builder/style-rules.js, one fixture per rule that passes and one that fails, in the
 * 7.2 finding format) and js/builder/new-art.js (the licence policy, provenance rows, the art route).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { band, weightedBand, hexHsl, showProfile } from '../tools/builder/style-profile.mjs';
import { colourStats, hsl, hueOverlap } from '../public/js/builder/colour-stats.js?v=30f71984';
import { STY_RULES, styleFindings, sty001, sty002, sty003, sty004, sty005, namedRole, bandOf, fingerprint } from '../public/js/builder/style-rules.js?v=abf9bfae';
import { LICENCE_POLICY, isNewArtName, provenanceProblems, provenanceRows, provenanceSection, newArtUrl, withNewArt } from '../public/js/builder/new-art.js?v=b2411f6f';

const root = join(import.meta.dirname, '..');
const json = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const profiles = json('public/assets/content/style-profiles.json');
const catalog = new Map(json('public/assets/content/deco-catalog.json').decos.map((d) => [d.name, d]));
const run = ([file, ...args]) => execFileSync(process.execPath, [join(root, file), ...args], { stdio: 'pipe' }).toString();

/** A small builder street: sky, bg_1, middleground, middleplus, foreground. */
function lane(over = {}) {
  const deco = (id, sprite, x) => ({ id, sprite, x, y: -40, w: 100, h: 80, z: 1, r: 0 });
  return {
    key: 'lane',
    street: {
      source: 'groddle-builder test', tsid: 'GZ0000000000001', label: 'Mossy Lane', hubId: '900', hubName: 'Mossy Hollow',
      bounds: { l: -1500, r: 1500, t: -1000, b: 0 }, gradient: { top: '87A8C9', bottom: 'FFE7A0' },
      layers: [
        { id: 'sky', name: 'sky', z: -3, w: 2250, h: 1000, filters: { saturation: -40, blur: 3 }, decos: Array.from({ length: 9 }, (_, i) => deco(`d_${i + 1}`, 'bush_3', i * 200)) },
        { id: 'bg_1', name: 'bg_1', z: -1, w: 2700, h: 1000, filters: { brightness: 0 }, decos: Array.from({ length: 22 }, (_, i) => deco(`d_${i + 20}`, 'bush_3', i * 100)) },
        { id: 'middleground', name: 'middleground', z: 0, decos: Array.from({ length: 80 }, (_, i) => deco(`d_${i + 50}`, 'bush_3', i * 30 - 1400)) },
        { id: 'middleplus', name: 'middleplus', z: 1, w: 3000, h: 1000, decos: Array.from({ length: 12 }, (_, i) => deco(`d_${i + 200}`, 'bush_3', i * 200)) },
        { id: 'foreground', name: 'foreground', z: 2, w: 3240, h: 1000, decos: Array.from({ length: 6 }, (_, i) => deco(`d_${i + 300}`, 'bush_3', i * 400)) },
      ],
      platforms: [], signposts: [], stats: {},
      ...over,
    },
  };
}
const FIELDS = ['rule', 'severity', 'street', 'at', 'message', 'data', 'fix', 'fingerprint'];

describe('the style profile (tools/builder/style-profile.mjs, assets/content/style-profiles.json)', () => {
  it('--check: the file is what the shipped streets measure', () => {
    assert.match(run(['tools/builder/style-profile.mjs', '--check']), /is current/);
  });

  it('the library palette covers every deco as its file is now (deco-palette --check)', () => {
    assert.match(run(['tools/builder/deco-palette.mjs', '--check']), /is current/);
    const pal = json('tools/builder/deco-palette.json');
    assert.equal(pal.count, json('public/assets/decos/manifest.json').length);
    for (const r of pal.decos.slice(0, 50)) assert.equal(r.hue.length, 12);
  });

  it('measures the whole world and every hub with streets; the figures spec 9.2 quotes', () => {
    const streets = readdirSync(join(root, 'public/assets/streets')).filter((f) => /^[GL][A-Z0-9]+\.json$/.test(f)).length;
    assert.equal(profiles.streetsScanned, streets);
    const world = profiles.profiles.default;
    assert.equal(world.streets, streets);
    assert.deepEqual(Object.keys(world.roles), ['sky', 'bg', 'middleground', 'middleplus', 'foreground']);
    assert.deepEqual(world.size.w, [2500, 6000, 6000, 8000]);
    assert.deepEqual(world.size.h.slice(0, 3), [1000, 1000, 2400]);
    assert.deepEqual(world.roles.middleground.density, [0.4, 27.7, 86.8]);
    assert.deepEqual(world.roles.middleground.decoW, [87, 250, 702]);
    assert.ok(world.roles.sky.filters.saturation.band[1] < world.roles.middleground.filters.saturation.band[1], 'further back is greyer');
    for (const role of Object.values(world.roles)) {
      assert.equal(role.palette.hue.length, 12);
      assert.ok(Math.abs(role.palette.hue.reduce((a, b) => a + b, 0) - 1) < 0.01);
    }
    const hubs = Object.keys(profiles.profiles).filter((k) => k.startsWith('hub-'));
    assert.ok(hubs.length >= 50, `hubs ${hubs.length}`);
    assert.ok(hubs.every((h) => profiles.profiles[h].streets > 0));
  });

  it('prints bands for five hubs (--show)', () => {
    const out = run(['tools/builder/style-profile.mjs', '--show', 'hub-58', 'hub-56', 'hub-76', 'hub-86', 'hub-27']);
    for (const hub of ['hub-58', 'hub-56', 'hub-76', 'hub-86', 'hub-27']) assert.match(out, new RegExp(`^${hub}: \\d+ streets`, 'm'));
    assert.match(out, /middleground +\d+ streets, z 0/);
    assert.match(out, /lightness [\d.]+ \/ [\d.]+ \/ [\d.]+/);
    assert.deepEqual(showProfile('hub-nope', undefined), ['hub-nope: no such profile']);
  });

  it('bands and colours (pure helpers)', () => {
    assert.deepEqual(band([5, 1, 3, 2, 4, 6, 7, 8, 9, 10]), [2, 6, 9]);
    assert.equal(band([]), null);
    assert.deepEqual(weightedBand([[0.1, 1], [0.5, 8], [0.9, 1]]), [0.1, 0.5, 0.5]);
    assert.deepEqual(weightedBand([[0.9, 1], [0.1, 1], [0.5, 1], [0.7, 1], [0.3, 1]]), [0.1, 0.5, 0.9]);
    assert.deepEqual(hexHsl('FF0000').map((n) => Math.round(n * 100) / 100), [0, 1, 0.5]);
    assert.deepEqual(hsl(0, 128, 255).map((n) => Math.round(n)), [210, 1, 1]);
    const red = new Uint8Array([255, 0, 0, 255, 255, 0, 0, 255, 0, 0, 0, 0, 128, 128, 128, 255]);
    const s = colourStats(red, 2, 2);
    assert.equal(s.hue[0], 1);
    assert.equal(s.cover, 0.75);
    assert.deepEqual(colourStats(new Uint8Array([90, 90, 90, 255]), 1, 1).hue, new Array(12).fill(0));
    assert.equal(hueOverlap([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0.5, 0.5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), 0.5);
  });
});

describe('the style rules (js/builder/style-rules.js)', () => {
  const ctx = { profiles, catalog };

  it('a street in the usual ranges raises none, and every rule is warn or info (spec 9.2: advice)', () => {
    assert.deepEqual(styleFindings(lane(), ctx), []);
    assert.deepEqual(STY_RULES.map((r) => `${r.id} ${r.severity}`), ['STY-001 warn', 'STY-002 info', 'STY-003 info', 'STY-004 warn', 'STY-005 info']);
  });

  it('STY-001 layer order: a sky in front, a foreground behind, a sky over a bg', () => {
    assert.deepEqual(sty001(lane()), []);
    const s = lane();
    s.street.layers[0].z = 1;
    const [f] = sty001(s);
    assert.deepEqual(Object.keys(f), FIELDS);
    assert.equal(f.rule, 'STY-001');
    assert.equal(f.at, 'lane/sky');
    assert.match(f.message, /sky layer sky \(z 1\) is in front of the middleground/);
    const fg = lane();
    fg.street.layers[4].z = -0.5;
    assert.match(sty001(fg)[0].message, /foreground layer foreground .* is behind the middleground/);
    const over = lane();
    over.street.layers[0].z = -0.5;
    assert.match(sty001(over)[0].message, /in front of the bg layer bg_1/);
    assert.equal(namedRole({ id: 'T_1303509543155' }), null);
    assert.equal(namedRole({ id: 'x', name: 'clouds and stars light' }), 'sky');
  });

  it('STY-002 filters outside the role\'s p10 to p90', () => {
    assert.deepEqual(sty002(lane(), ctx), []);
    const s = lane();
    s.street.layers[1].filters = { brightness: 95, blur: 40 };
    const [f] = sty002(s, ctx);
    assert.equal(f.severity, 'info');
    assert.equal(f.at, 'lane/bg_1');
    assert.deepEqual(f.data.off.map((o) => o.filter), ['brightness', 'blur']);
    assert.equal(f.data.profile, 'default', 'a new hub uses the world\'s bands');
    assert.match(f.message, /brightness 95 \(usual -?\d+ to \d+\)/);
  });

  it('STY-003 density outside the role\'s band, from the hub when it has enough streets', () => {
    assert.deepEqual(sty003(lane(), ctx), []);
    const s = lane();
    s.street.layers[2].decos = s.street.layers[2].decos.slice(0, 1);
    const [f] = sty003(s, ctx);
    assert.equal(f.rule, 'STY-003');
    assert.equal(f.data.density, 0.3);
    assert.match(f.fix, /Add decos/);
    const hub = lane({ hubId: '58' });
    assert.equal(bandOf(profiles, '58', 'middleground').from, 'hub-58');
    assert.equal(bandOf(profiles, '900', 'middleground').from, 'default');
    assert.ok(Array.isArray(sty003(hub, ctx)));
  });

  it('STY-004 no sky gradient', () => {
    assert.deepEqual(sty004(lane()), []);
    const [f] = sty004(lane({ gradient: undefined }));
    assert.equal(f.severity, 'warn');
    assert.equal(f.at, 'lane');
    assert.match(f.message, /Mossy Lane has no sky gradient/);
  });

  it('STY-005 a library deco on a role Tiny Speck never put it on (one finding per sprite per layer)', () => {
    assert.deepEqual(sty005(lane(), ctx), []);
    const skyOnly = [...catalog.values()].find((d) => d.placements > 50 && Object.keys(d.layers).join() === 'sky');
    assert.ok(skyOnly, 'a sky-only deco');
    const s = lane();
    s.street.layers[2].decos.push({ id: 'd_900', sprite: skyOnly.name, x: 0, y: -50, w: 100, h: 50, z: 1, r: 0 }, { id: 'd_901', sprite: skyOnly.name, x: 300, y: -50, w: 100, h: 50, z: 1, r: 0 }, { id: 'd_902', sprite: 'gz_mossy_bush', x: 0, y: -10, w: 10, h: 10, z: 1, r: 0 });
    const out = sty005(s, ctx);
    assert.equal(out.length, 1);
    assert.deepEqual(out[0].data.ids, ['d_900', 'd_901']);
    assert.deepEqual(out[0].where, { x: 0, y: -50, space: 'world', layer: 'middleground' });
    assert.match(out[0].message, new RegExp(`${skyOnly.name} is on a middleground layer`));
  });

  it('fingerprints follow what a finding is about', () => {
    assert.match(fingerprint('x'), /^[0-9a-f]{16}$/);
    const a = lane();
    a.street.layers[0].z = 1;
    const b = structuredClone(a);
    b.street.layers[0].z = 2;
    assert.notEqual(sty001(a)[0].fingerprint, sty001(b)[0].fingerprint);
    assert.equal(sty001(a)[0].fingerprint, sty001(structuredClone(a))[0].fingerprint);
  });

  it('calibration: over the 1,460 shipped streets STY-001 is rare and STY-005 never fires', () => {
    const counts = {};
    for (const f of readdirSync(join(root, 'public/assets/streets')).filter((n) => /^[GL][A-Z0-9]+\.json$/.test(n))) {
      const street = json(`public/assets/streets/${f}`);
      for (const x of styleFindings({ key: street.tsid, street }, ctx)) counts[x.rule] = (counts[x.rule] || 0) + 1;
    }
    assert.ok((counts['STY-001'] || 0) <= 10, `STY-001 ${counts['STY-001']}`);
    assert.equal(counts['STY-005'] || 0, 0);
    assert.equal(counts['STY-004'], 196, 'the shipped streets with no gradient (spec 14.1)');
  });
});

describe('new art (js/builder/new-art.js)', () => {
  const own = { origin: 'new', licence: 'own-work-CC0', source: 'Austin Ginder', author: 'Austin Ginder', sha256: 'a'.repeat(64), w: 120, h: 85, registration: { x: 60, y: 85 }, inputs: ['own:a sketch', 'deco:bush_3'], intake: 'in-aaaaaaaaaaaaaaaa' };
  const ai = { ...own, licence: 'ai-generated', tool: 'An image model 2', prompt: 'a mossy stump' };

  it('names: gz_ and lowercase words', () => {
    assert.equal(isNewArtName('gz_mossy_stump'), true);
    assert.equal(isNewArtName('gz_ai_moss_2'), true);
    for (const bad of ['bush_3', 'gz_', 'gz_Moss', 'gz_moss__x', `gz_${'a'.repeat(95)}`]) assert.equal(isNewArtName(bad), false, bad);
    assert.equal(LICENCE_POLICY.licences['ai-generated'].prefix, 'gz_ai_');
  });

  it('provenance problems: licence, missing fields, the prefix rule, inputs', () => {
    assert.deepEqual(provenanceProblems('gz_moss', own, { library: catalog }), []);
    assert.deepEqual(provenanceProblems('gz_ai_moss', ai, { library: catalog }), []);
    assert.deepEqual(provenanceProblems('bush_3', { origin: 'tinyspeck-cc0', licence: 'CC0-1.0', source: 'groddle1.swf#bush_3' }), []);
    const code = (name, row) => provenanceProblems(name, row, { library: catalog }).map((p) => p.code);
    assert.deepEqual(code('gz_moss', { ...own, licence: 'CC-BY-4.0' }), ['licence']);
    assert.deepEqual(code('gz_ai_moss', { ...ai, tool: '', prompt: undefined }), ['missing']);
    assert.deepEqual(code('gz_moss', ai), ['name']);
    assert.deepEqual(code('gz_ai_moss', own), ['name']);
    assert.deepEqual(code('gz_moss', { ...own, inputs: ['https://example.com/x.png', 'deco:not_a_deco'] }), ['inputs', 'inputs']);
    assert.deepEqual(code('gz_moss', { ...own, origin: 'tinyspeck-cc0' }), ['origin']);
  });

  it('the inspector\'s rows: who or what made it, from what, and the licence', () => {
    const rows = Object.fromEntries(provenanceRows('gz_ai_moss', ai).map((r) => [r.label, r.value]));
    assert.equal(rows.Licence, 'AI-generated, dedicated CC0 1.0');
    assert.equal(rows['Made by (person)'], 'Austin Ginder');
    assert.equal(rows.Model, 'An image model 2');
    assert.equal(rows['Made from'], 'own work: a sketch; library deco bush_3');
    assert.match(provenanceRows('gz_x', null)[0].value, /None recorded/);
    const h = (tag, attrs = {}, ...kids) => ({ tag, attrs, kids, append(...k) { this.kids.push(...k); } });
    assert.equal(provenanceSection(h, 'bush_3', { origin: 'tinyspeck-cc0' }), null, 'library decos get no section');
    const sec = provenanceSection(h, 'gz_moss', { ...own, author: '' });
    assert.equal(sec.attrs['aria-label'], 'Provenance');
    assert.ok(sec.kids.some((k) => k.attrs?.role === 'note' && /missing author/.test(k.attrs.text)));
  });

  it('draws a gz_ sprite from /builder-art/<sha256>, and only one with a kept file', () => {
    const assets = { gz_moss: own, gz_bad: { ...own, sha256: 'nope' }, bush_3: { origin: 'tinyspeck-cc0', licence: 'CC0-1.0' } };
    assert.equal(newArtUrl('assets/decos/groddle/gz_moss.webp', assets), `/builder-art/${'a'.repeat(64)}`);
    assert.equal(newArtUrl('assets/decos/groddle/gz_moss.png?v=1', assets), `/builder-art/${'a'.repeat(64)}`);
    assert.equal(newArtUrl('assets/decos/groddle/gz_bad.webp', assets), null);
    assert.equal(newArtUrl('assets/decos/groddle/bush_3.webp', assets), null);
    assert.deepEqual([...withNewArt(new Set(['bush_3']), assets)].sort(), ['bush_3', 'gz_moss']);
  });
});
