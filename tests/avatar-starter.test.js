/**
 * "Start fresh": Tiny Speck's new-player avatar picker (js/avatar-starter.js).
 * Run: node --test tests/avatar-starter.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  STARTER_BREAKS,
  STARTER_CHOICES,
  STARTER_CHOICE_COUNT,
  STARTER_DEFAULT_CHOICES,
  STARTER_SLOTS,
  applyStarterChoice,
  randomStarterChoices,
  starterChoiceOf,
  starterChoicesOf,
  starterFields,
  starterRowFields,
} from '../public/js/avatar-starter.js';
import { APPEARANCE_PRESETS, PRESET_GROUPS } from '../public/js/character-builder.js';
import { expandCatalog, normalizeVectorFields, resolveLook } from '../public/js/avatar-looks.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const catalog = expandCatalog(JSON.parse(readFileSync(join(root, 'public/assets/avatar/catalog.json'), 'utf8')));
const item = (type, name) => catalog.types[type]?.find((i) => i.name === name);
const CLOTHES = ['hat', 'coat', 'shirt', 'dress', 'pants', 'skirt', 'shoes'];

describe('Start fresh choices', () => {
  it('are GSJS inc_data_default_avatars.js, choice for choice (catalog.json defaults)', () => {
    assert.deepEqual(STARTER_SLOTS.map((s) => s.id).sort(), Object.keys(catalog.defaults).sort());
    for (const { id: slot } of STARTER_SLOTS) {
      assert.equal(STARTER_CHOICES[slot].length, STARTER_CHOICE_COUNT, slot);
      STARTER_CHOICES[slot].forEach((c, i) => {
        for (const [k, v] of Object.entries(catalog.defaults[slot][String(i)])) {
          let mine;
          if (k === 'hair') mine = item('hair', c.outfit.hair)?.gsjsId;
          else if (k === 'hair_color') mine = c.hairColor;
          else if (k === 'skin_color') mine = c.skinColor;
          else if (['eyes', 'nose', 'mouth', 'ears'].includes(k)) mine = c.outfit[k] === 'none' ? 0 : item(k, c.outfit[k])?.gsjsId;
          else if (CLOTHES.includes(k)) mine = c.outfit[k] === 'none' ? 0 : item(k, c.outfit[k])?.variants?.[c.variant?.[k] ?? 0]?.id;
          else if (slot === 'ears' && i === 3) mine = 0; // no ears: the scale stays at the default
          else mine = c.face[k];
          assert.equal(mine, v, `${slot} choice ${i} ${k}`);
        }
      });
    }
  });

  it('use real palette ids and catalog articles only', () => {
    for (const { id: slot } of STARTER_SLOTS) {
      for (const c of STARTER_CHOICES[slot]) {
        if (c.hairColor) assert.ok(catalog.palettes.hair.some((p) => p.id === c.hairColor), slot);
        if (c.skinColor) assert.ok(catalog.palettes.skin.some((p) => p.id === c.skinColor), slot);
        for (const [type, name] of Object.entries(c.outfit || {})) if (name !== 'none') assert.ok(item(type, name), `${type}/${name}`);
      }
    }
  });

  it('keep the picker copy, order, groups and default picks of main.js doAvatarGetChoices', () => {
    assert.deepEqual(STARTER_SLOTS.map((s) => s.label), ['Hair Style', 'Hair Color', 'Skin Color', 'Eyes', 'Nose', 'Mouth', 'Ears', 'Clothing: Top', 'Clothing: Bottom']);
    assert.deepEqual([...STARTER_BREAKS], [2, 6]);
    const main = join(root, '../glitch-GameServerJS/main.js');
    if (!existsSync(main)) return;
    const src = readFileSync(main, 'utf8');
    const fn = src.slice(src.indexOf('function doAvatarGetChoices'), src.indexOf('function doEmote'));
    for (const { id, label } of STARTER_SLOTS) assert.match(fn, new RegExp(`${id}: '${label}'`), id);
    assert.match(fn, /option_names_sort = \['hair_style','hair_color','skin_color','eyes','nose','mouth','ears','top','bottom'\]/);
    assert.match(fn, /option_names_breaks = \[2,6\]/);
    for (const [id, i] of Object.entries(STARTER_DEFAULT_CHOICES)) assert.match(fn, new RegExp(`"${id}":"choice${i}"`), id);
  });
});

describe('Start fresh fields', () => {
  it('merge one slot at a time like avatar_build_default', () => {
    const fresh = starterFields(STARTER_DEFAULT_CHOICES);
    assert.deepEqual(starterChoicesOf(fresh), { ...STARTER_DEFAULT_CHOICES });
    // top: hat and coat cleared, then the slot's shirt or dress.
    const coated = { ...fresh, outfit: { ...fresh.outfit, hat: 'cap', coat: 'pea_coat' }, tint: { shirt: 'ff0000' } };
    const dressed = applyStarterChoice(coated, 'top', 1);
    assert.equal(dressed.outfit.hat, 'none');
    assert.equal(dressed.outfit.coat, 'none');
    assert.equal(dressed.outfit.shirt, 'none');
    assert.equal(dressed.outfit.dress, 'plain_trimmed_dress');
    assert.equal(dressed.tint.shirt, undefined);
    assert.equal(starterChoiceOf(dressed, 'top'), 1);
    // A slot owns its face numbers; no ears drops the ears' numbers.
    const earless = applyStarterChoice(fresh, 'ears', 3);
    assert.equal(earless.outfit.ears, 'none');
    assert.ok(!Object.keys(earless.face).some((k) => k.startsWith('ears_')));
    assert.equal(starterChoiceOf(earless, 'ears'), 3);
    // Untouched slots stay put; a part picked elsewhere reads as no choice.
    assert.equal(starterChoiceOf(earless, 'eyes'), STARTER_DEFAULT_CHOICES.eyes);
    assert.equal(starterChoiceOf({ ...fresh, outfit: { ...fresh.outfit, hair: 'Mullet' } }, 'hair_style'), -1);
  });

  it('survive the saved-look round trip and resolve every part', () => {
    for (let row = 0; row < STARTER_CHOICE_COUNT; row += 1) {
      const saved = normalizeVectorFields(JSON.parse(JSON.stringify(starterRowFields(row))), catalog);
      for (const { id } of STARTER_SLOTS) assert.equal(starterChoiceOf(saved, id), row, `row ${row} ${id}`);
      const look = resolveLook(saved, catalog);
      for (const type of ['hair', 'eyes', 'mouth', 'nose', 'shoes']) assert.ok(look.outfit[type], `row ${row} ${type}`);
      assert.ok(look.colors.skin.tint && look.colors.hair.color_1, `row ${row} colours`);
    }
  });

  it('randomize picks a choice in range for every slot', () => {
    let n = 0;
    const picks = randomStarterChoices(() => ((n += 0.37) % 1));
    for (const { id } of STARTER_SLOTS) assert.ok(picks[id] >= 0 && picks[id] < STARTER_CHOICE_COUNT, id);
    assert.deepEqual(starterChoicesOf(starterFields(picks)), picks);
  });
});

describe('Starter presets', () => {
  it('are the four choice rows, in their own preset group', () => {
    assert.ok(PRESET_GROUPS.some((g) => g.id === 'starter'));
    for (let row = 0; row < 4; row += 1) {
      const p = APPEARANCE_PRESETS[`starter${row + 1}`];
      assert.equal(p.label, `Starter ${row + 1}`);
      assert.equal(p.group, 'starter');
      assert.equal(p.appearance.bodyStyle, 'vector');
      for (const { id } of STARTER_SLOTS) assert.equal(starterChoiceOf(p.appearance.vector, id), row, `${p.id} ${id}`);
    }
  });

  it('builder wires the Start fresh tab and grouped chips', () => {
    const game = readFileSync(join(root, 'public/game.js'), 'utf8');
    assert.match(game, /\['fresh', 'Start fresh'\]/);
    for (const s of ['renderStarterPicker', 'renderPresetGroups', 'PRESET_GROUPS']) assert.ok(game.includes(s), s);
    const css = readFileSync(join(root, 'public/style.css'), 'utf8');
    for (const s of ['.avatar-starter-row', '.avatar-starter-dot.active', '.avatar-preset-group.active']) assert.ok(css.includes(s), s);
  });
});
