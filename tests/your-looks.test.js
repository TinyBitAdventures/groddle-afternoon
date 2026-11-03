// Ticket 59 (Austin 2026-11-03): Your looks, the original's list of past looks
// (glitch-client ImaginationYourLooksUI.as 54, 166-197, 426-500; AvatarLookUI.as;
// AvatarLook.as), rebuilt in the character builder and saved with the character.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  YOUR_LOOKS_KEEP_MS, YOUR_LOOKS_MAX, YOUR_LOOKS_TEXT, cleanLook, createYourLooks, findLook, lookId,
  normalizeYourLooks, noteWear, pastLooks, recordLook, removeLook, totalLine, wearLook,
} from '../public/js/your-looks.js?v=fd9949a4';
import { createFeatureHost } from '../public/js/feature-host.js?v=903263a4';
import { yourLooksFeature, YOUR_LOOKS_FEATURE_ID } from '../public/js/features/your-looks-feature.js?v=38cfe4e8';
import { createPlayerSave, parsePlayerSave, serializePlayerSave } from '../public/js/player-save.js?v=3da77f2b';
import { APPEARANCE_PRESETS } from '../public/js/character-builder.js?v=38301e2f';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(root, f), 'utf8');
const client = join(root, '..', 'glitch-client', 'com/tinyspeck/engine/view/ui/imagination/ImaginationYourLooksUI.as');

const A = { outfit: { hair: 'hair_01', shirt: 'shirt_02' }, variant: { shirt: 1 } };
const B = { outfit: { hair: 'hair_03', pants: 'pants_01' }, tint: { pants: 'ff0000' } };
const C = { outfit: { hat: 'hat_05' } };

describe('ticket 59: the rules (js/your-looks.js)', () => {
  it('37 on file, five minutes to keep one, the client\'s words', () => {
    assert.equal(YOUR_LOOKS_MAX, 37, 'MAX_OUTFITS');
    assert.equal(YOUR_LOOKS_KEEP_MS, 300000);
    assert.equal(YOUR_LOOKS_TEXT.auto, 'Any look you keep for more than 5 minutes is auto-saved.');
    assert.equal(YOUR_LOOKS_TEXT.confirmTitle, 'Remove this look from your history?');
    assert.equal(totalLine(0), 'All we have on file is your current look, so no switching!');
    assert.equal(totalLine(1), 'You have 1 look from your past that you can quickly switch to');
    assert.equal(totalLine(12), 'You have 12 looks from your past that you can quickly switch to');
    for (const t of Object.values(YOUR_LOOKS_TEXT)) if (typeof t === 'string') assert.doesNotMatch(t, /—/);
  });

  it('the words and the 37 are the client\'s own (when glitch-client is beside the game)', (t) => {
    let src = '';
    try { src = readFileSync(client, 'utf8'); } catch { t.skip('glitch-client not beside the game'); return; }
    assert.match(src, /MAX_OUTFITS:uint = 37;/);
    assert.match(src, /Any look you keep for more than 5 minutes is auto-saved\./);
    assert.match(src, /cdVO\.title = 'Remove this look from your history\?';/);
    assert.ok(src.includes(YOUR_LOOKS_TEXT.confirmText));
    for (const w of [YOUR_LOOKS_TEXT.confirmNo, YOUR_LOOKS_TEXT.confirmYes, YOUR_LOOKS_TEXT.none]) assert.ok(src.includes(w), w);
  });

  it('a look is the same look whatever order its fields came in', () => {
    assert.equal(lookId({ variant: { shirt: 1 }, outfit: { shirt: 'shirt_02', hair: 'hair_01' } }), lookId(A));
    assert.notEqual(lookId(A), lookId(B));
    assert.deepEqual(cleanLook({ outfit: { hair: 'x' }, junk: 1 }), { outfit: { hair: 'x' } }, 'parts and colours only');
  });

  it('a look goes on file after five minutes worn, not before; a new look starts its own count', () => {
    const s = createYourLooks();
    assert.equal(noteWear(s, A, 299_000, 1000), '');
    assert.equal(s.list.length, 0);
    assert.equal(noteWear(s, A, 1000, 2000), 'kept');
    assert.equal(findLook(s, A).n, 1);
    assert.equal(noteWear(s, A, 60_000, 3000), '', 'kept once');
    assert.equal(noteWear(s, B, 200_000, 4000), '');
    assert.equal(s.wearing.ms, 200_000);
    assert.equal(s.list.length, 1, 'B was not kept five minutes');
  });

  it('newest worn first; switching moves one to the front and counts a wear; the worn one is not offered', () => {
    const s = createYourLooks();
    recordLook(s, A, 100);
    recordLook(s, B, 200);
    recordLook(s, C, 300);
    assert.deepEqual(s.list.map((e) => lookId(e.look)), [C, B, A].map(lookId));
    assert.ok(wearLook(s, A, 400));
    assert.equal(lookId(s.list[0].look), lookId(A));
    assert.equal(s.list[0].n, 2);
    assert.deepEqual(pastLooks(s, A).map((e) => lookId(e.look)), [C, B].map(lookId));
    assert.equal(wearLook(s, { outfit: { hat: 'never_kept' } }, 500), null, 'only looks on file');
  });

  it('remove takes one off file', () => {
    const s = createYourLooks();
    recordLook(s, A, 1);
    recordLook(s, B, 2);
    assert.equal(removeLook(s, A), true);
    assert.equal(removeLook(s, A), false);
    assert.deepEqual(s.list.map((e) => lookId(e.look)), [lookId(B)]);
  });

  it('at most 37: the oldest falls off', () => {
    const s = createYourLooks();
    for (let i = 0; i < 40; i += 1) recordLook(s, { outfit: { hair: `hair_${i}` } }, i);
    assert.equal(s.list.length, 37);
    assert.equal(s.list[0].look.outfit.hair, 'hair_39');
    assert.equal(s.list.at(-1).look.outfit.hair, 'hair_3');
  });

  it('a saved record is cleaned: duplicates, junk, order and the cap', () => {
    const n = normalizeYourLooks({
      v: 1,
      list: [{ look: A, at: 5, n: 2 }, { look: { outfit: { shirt: 'shirt_02', hair: 'hair_01' }, variant: { shirt: 1 } }, at: 9, n: 3 }, null, { at: 4 }, { look: B, at: 7 }],
      wearing: { id: lookId(B), ms: 99_999_999 },
      extra: 'dropped',
    });
    assert.deepEqual(n.list.map((e) => [lookId(e.look), e.at, e.n]), [[lookId(A), 9, 3], [lookId(B), 7, 1]]);
    assert.equal(n.wearing.ms, YOUR_LOOKS_KEEP_MS);
    assert.equal(n.extra, undefined);
    assert.deepEqual(normalizeYourLooks(null), createYourLooks());
  });
});

describe('ticket 59: the save (solo and online alike: the player save\'s feature slice)', () => {
  const engine = (worn) => ({ wornLook: worn, started: true, setData() {}, param: () => null, save() {} });

  it('a save from before Your looks starts with its current look on file (migration)', () => {
    const host = createFeatureHost([yourLooksFeature]);
    host.restore({}, engine(A));
    const slice = host.save()[YOUR_LOOKS_FEATURE_ID];
    assert.deepEqual(slice.list.map((e) => lookId(e.look)), [lookId(A)]);
    assert.equal(slice.wearing.ms, YOUR_LOOKS_KEEP_MS, 'its five minutes are long done');
  });

  it('round-trips through the player save, small: 37 full looks in a few kilobytes', () => {
    const host = createFeatureHost([yourLooksFeature]);
    host.restore({}, engine(A));
    const looks = Object.values(APPEARANCE_PRESETS).map((p) => p.appearance.vector);
    const slice = host.save()[YOUR_LOOKS_FEATURE_ID];
    const s = normalizeYourLooks(slice);
    for (let i = 0; i < 40; i += 1) recordLook(s, { ...looks[i % looks.length], face: { eye_scale: (i % 9) / 2 } }, i);
    const save = createPlayerSave({ inventory: { apple: 1 }, systems: { features: { [YOUR_LOOKS_FEATURE_ID]: s } } });
    const text = serializePlayerSave(save);
    const back = parsePlayerSave(text).systems.features[YOUR_LOOKS_FEATURE_ID];
    assert.equal(back.list.length, 37);
    const host2 = createFeatureHost([yourLooksFeature]);
    host2.restore({ [YOUR_LOOKS_FEATURE_ID]: back }, engine(A));
    assert.deepEqual(host2.save()[YOUR_LOOKS_FEATURE_ID].list, normalizeYourLooks(s).list);
    const bytes = JSON.stringify(back).length;
    assert.ok(bytes < 24_000, `${bytes} bytes for 37 looks (site SaveShape.php MAX_BYTES is 4 MiB)`);
  });

  it('counts only while the game runs, on the worn look', () => {
    const host = createFeatureHost([yourLooksFeature]);
    const e = engine(A);
    host.restore({ [YOUR_LOOKS_FEATURE_ID]: { v: 1, list: [], wearing: { id: '', ms: 0 } } }, e);
    e.wornLook = B;
    e.started = false;
    host.tick(YOUR_LOOKS_KEEP_MS, 10, e);
    assert.equal(host.save()[YOUR_LOOKS_FEATURE_ID].list.length, 0, 'not before the game starts');
    e.started = true;
    for (let i = 0; i < 10; i += 1) host.tick(YOUR_LOOKS_KEEP_MS / 10, 10 + i, e);
    assert.deepEqual(host.save()[YOUR_LOOKS_FEATURE_ID].list.map((x) => lookId(x.look)), [lookId(B)]);
  });
});

describe('ticket 59: wiring', () => {
  const game = read('public/game.js');
  const feature = read('public/js/features/your-looks-feature.js');
  it('registered, and the engine gives the worn look, wears one and draws its picture', () => {
    assert.match(read('public/js/features/index.js'), /import \{ yourLooksFeature \} from '\.\/your-looks-feature\.js[^']*'; FEATURES\.push\(yourLooksFeature\);/);
    assert.match(game, /get wornLook\(\) \{\s+return wornAppearance\?\.vector \|\| \{\};/);
    assert.match(game, /wearLook\(vector\) \{[\s\S]{0,400}wornAppearance = playerAppearance;\s+saveAppearance\(playerAppearance\);\s+applyPlayerAppearance\(\);/);
    assert.match(game, /function commitAvatarAppearance\(\) \{\s+playerAppearance = normalizeAppearance\(playerAppearance\);\s+wornAppearance = playerAppearance;/);
    assert.match(game, /lookPortrait: \(vector, size, pad\) => lookPortraitUrl\(vector, size, pad\),/);
    assert.match(game, /function ownerPortraitUrl\(\) \{\s+return lookPortraitUrl\(playerAppearance\.vector\);/);
  });

  it('Shift+L opens the builder at Your looks', () => {
    assert.match(game, /action === 'looks'\) \{\s+if \(!e\.repeat && !isAvatarOpen\(\)\) openAvatarPanel\(\);[\s\S]{0,200}features\.query\('showYourLooks', engine\)/);
  });

  it('pictures at the client\'s 100x144, Remove asks first with No the default and Esc', () => {
    assert.match(feature, /LOOK_TILE = Object\.freeze\(\{ w: 100, h: 144 \}\)/);
    assert.match(feature, /no\.focus\(\{ preventScroll: true \}\);/);
    assert.match(feature, /if \(e\.key === 'Escape' && !confirm\.hidden\) \{\s+e\.preventDefault\(\);\s+e\.stopPropagation\(\);\s+closeConfirm\(true\);/);
    assert.match(feature, /wear\.title = YOUR_LOOKS_TEXT\.switchTip;/);
  });
});
