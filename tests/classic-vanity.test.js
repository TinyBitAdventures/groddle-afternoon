/**
 * The character builder toward the 2012 Vanity page (glitch-client Vanity.as, VanityModel.as 70-136,
 * VanityMirror.as, DimsPane.as 35-48, LeavingVanityDialog.as):
 *  - Size / Height / Width per feature with the 2012 client's ranges, saved with the look;
 *  - the mirror's four emote tests, each an animation the avatar sheets already have;
 *  - leaving with unsaved changes asks first (Stay here, Save Changes, Leave without saving);
 *  - Classic lays #avatar-panel out as Vanity's columns, in its own block of css/classic.css.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FakeEl } from './social-fake-dom.js';
import { FACE_DIMS, normalizeVectorFields, resolveLook } from '../public/js/avatar-looks.js?v=76eb9653';
import { ANIMS, CORE_FRAMES } from '../public/js/avatar-anims.js?v=fb921bf4';
import { EMOTE_TESTS, LEAVING_TEXT, leavingDialogOpen, renderEmoteTests, renderFaceDims, showLeavingDialog } from '../public/js/avatar-builder-ui.js?v=4e57b8c5';
import { appearanceToJson, loadAppearance, migrateAppearance, normalizeAppearance, saveAppearance } from '../public/js/character-builder.js?v=91805f9c';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const game = read('public/game.js');
const classic = read('public/css/classic.css');

/** FakeEl with className (the builder pieces set it). */
class El extends FakeEl {
  get className() { return this.attrs.class || ''; }
  set className(v) { this.attrs.class = String(v); }
  appendChild(k) { this.append(k); return k; }
}
beforeEach(() => {
  globalThis.document = { activeElement: null, createElement: (t) => new El(t) };
});

describe('Vanity face sliders', () => {
  it('the groups, labels and ranges of DimsPane.as and the 2012 ava_settings', () => {
    const shape = FACE_DIMS.map((g) => [g.part, g.settings.map((d) => `${d.key}:${d.label}:${d.min}..${d.max}`)]);
    assert.deepEqual(shape, [
      ['eyes', ['eye_scale:Size:0.65..1.2', 'eye_height:Height:-5..5', 'eye_dist:Width:-3..2']],
      ['nose', ['nose_scale:Size:0.65..1.45', 'nose_height:Height:-5..6']],
      ['mouth', ['mouth_scale:Size:0.75..1.45', 'mouth_height:Height:-3..4']],
      ['ears', ['ears_scale:Size:0.6..1.2', 'ears_height:Height:-4..1']],
    ]);
    // Heights and widths were whole pixels ("int"), scales a number.
    for (const g of FACE_DIMS) for (const d of g.settings) assert.equal(d.step, d.key.endsWith('_scale') ? 0.01 : 1, d.key);
  });

  it('a look keeps every slider value, the nose to its 2012 height of 6, and clamps past it', () => {
    const face = { eye_scale: 1.2, eye_height: -5, eye_dist: 2, nose_scale: 0.65, nose_height: 6, mouth_scale: 1.45, mouth_height: -3, ears_scale: 0.6, ears_height: 1 };
    assert.deepEqual(normalizeVectorFields({ face }).face, face);
    assert.equal(normalizeVectorFields({ face: { nose_height: 9 } }).face.nose_height, 6);
    assert.equal(normalizeVectorFields({ face: { eye_height: 9 } }).face.eye_height, 5, 'the old -5..5 still holds the rest');
    assert.equal(normalizeVectorFields({ face: { eye_scale: 'x' } }).face.eye_scale, undefined);
  });

  it('the face saves with the look and loads back (solo save, Your looks record, online save text)', () => {
    const face = { eye_scale: 0.8, eye_dist: -2, nose_height: 6, mouth_scale: 1.3, ears_height: -4 };
    const look = normalizeAppearance({ vector: { outfit: { eyes: 'eyes_02' }, face } });
    const map = new Map();
    const storage = { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)) };
    saveAppearance(look, { storage });
    assert.deepEqual(loadAppearance({ storage }).vector.face, face);
    assert.deepEqual(migrateAppearance(JSON.parse(appearanceToJson(look))).vector.face, face);
    assert.equal(resolveLook(look.vector, null).face.nose_height, 6, 'the compositor gets it');
  });

  it('renders upright groups with the part names; heights run so up is higher on the face', () => {
    const box = new El('div');
    const changes = [];
    renderFaceDims(box, { face: { eye_scale: 0.9, eye_height: 2 }, onChange: (k, v) => changes.push([k, v]) });
    assert.deepEqual(box.querySelectorAll('.avatar-dims-part').map((p) => p.dataset.part), ['eyes', 'nose', 'mouth', 'ears']);
    assert.deepEqual(box.querySelectorAll('.avatar-dims-name').map((n) => n.textContent), ['Eyes', 'Nose', 'Mouth', 'Ears']);
    assert.equal(box.querySelectorAll('.avatar-dim-range').length, 9);
    const size = box.querySelector('[data-dim="eye_scale"]');
    const height = box.querySelector('[data-dim="eye_height"]');
    assert.equal(size.value, '0.9');
    assert.deepEqual([height.min, height.max, height.value], ['-5', '5', '-2'], 'shown inverted');
    assert.equal(height.getAttribute('aria-label'), 'Eyes height');
    height.value = '-4';
    height.dispatch('input');
    assert.deepEqual(changes, [['eye_height', 4]]);
    // An unset value shows the rig's default; a second render only updates.
    renderFaceDims(box, { face: {}, onChange: () => {} });
    assert.equal(box.querySelectorAll('.avatar-dim-range').length, 9);
    assert.equal(box.querySelector('[data-dim="nose_scale"]').value, '1');
    assert.equal(box.querySelector('[data-dim="ears_height"]').value, '0');
  });
});

describe('Vanity mirror emote tests', () => {
  it('surprise, angry, happy and the sleepy idle3, as VanityMirror.as maps its buttons', () => {
    assert.deepEqual(EMOTE_TESTS.map((t) => [t.id, t.anim]), [['surprise', 'surprise'], ['angry', 'angry'], ['happy', 'happy'], ['sleepy', 'idle3']]);
    for (const t of EMOTE_TESTS) assert.ok(ANIMS[t.anim]?.length > 10, `${t.anim} is an avatar animation`);
    assert.ok(ANIMS.idle3.some((fn) => !CORE_FRAMES.includes(fn)), 'idle3 needs the idle frames (the preview loads them)');
    const box = new El('div');
    const played = [];
    renderEmoteTests(box, { onPlay: (a) => played.push(a) });
    const buttons = box.querySelectorAll('.avatar-emote');
    assert.equal(buttons.length, 4);
    assert.equal(buttons[3].getAttribute('aria-label'), 'Test sleepy');
    buttons[1].click();
    assert.deepEqual(played, ['angry']);
  });

  it('the preview plays a test once at 30 fps, loading the idle frames first, then walks on', () => {
    const fn = game.slice(game.indexOf('async function paintVectorAvatarPreview('), game.indexOf('/** The preview walks unless reduced motion'));
    assert.match(fn, /prep\.idleLoading \?\?= prepareIdle\(prep\)/);
    assert.match(fn, /if \(emote\.i >= emote\.frames\.length\) \{\s*avatarPreviewEmote = null;/);
    assert.match(fn, /setInterval\(step, 1000 \/ 30\)/);
    assert.match(game, /function playAvatarPreviewEmote\(anim\) \{[\s\S]{0,200}const frames = ANIMS\[anim\];/);
    assert.match(game, /renderEmoteTests\(emotes, \{ onPlay: playAvatarPreviewEmote \}\);\s*canvas\.after\(emotes\);/);
  });
});

describe('Vanity: leaving with unsaved changes asks first', () => {
  it('the dialog says what LeavingVanityDialog said; Stay here is the default; Esc on it stays', () => {
    assert.equal(LEAVING_TEXT.title, 'You have unsaved changes');
    assert.match(LEAVING_TEXT.body, /^If you leave now, you.ll lose your changes!$/);
    const host = new El('div');
    const calls = [];
    showLeavingDialog(host, { onStay: () => calls.push('stay'), onSave: () => calls.push('save'), onLeave: () => calls.push('leave') });
    assert.ok(leavingDialogOpen(host));
    assert.equal(globalThis.document.activeElement?.dataset.leaving, 'stay');
    host.querySelector('[data-leaving="leave"]').onclick();
    assert.ok(!leavingDialogOpen(host));
    showLeavingDialog(host, { onStay: () => calls.push('stay2'), onSave: () => {}, onLeave: () => {} });
    assert.equal(host.querySelectorAll('.avatar-leaving').length, 1, 'one box, shown again');
    host.querySelector('[data-leaving="stay"]').onclick();
    assert.deepEqual(calls, ['leave', 'stay2']);
  });

  it('every way the player leaves the builder asks; leaving without saving keeps the look worn', () => {
    const ask = game.slice(game.indexOf('function askCloseAvatarPanel()'), game.indexOf('/** Builder tabs:'));
    assert.match(game, /function avatarLookDirty\(\) \{\s*return appearanceCacheKey\(playerAppearance\) !== appearanceCacheKey\(wornAppearance\);/);
    assert.match(ask, /if \(leavingDialogOpen\(panel\)\) \{\s*panel\.querySelector\('\.avatar-leaving'\)\.hidden = true;/);
    assert.match(ask, /if \(!avatarLookDirty\(\)\) \{\s*closeAvatarPanel\(\);/);
    assert.match(ask, /onSave: \(\) => \{[\s\S]*?commitAvatarAppearance\(\);/);
    assert.match(ask, /onLeave: \(\) => \{[\s\S]*?playerAppearance = wornAppearance;[\s\S]*?closeAvatarPanel\(\);/);
    assert.match(game, /'avatar-panel': \(\) => askCloseAvatarPanel\(\),/);
    assert.match(game, /if \(isPlainKey\(e, 'l'\)\) askCloseAvatarPanel\(\);/);
    assert.match(game, /closeGardenPanel\(\);\s*askCloseAvatarPanel\(\);\s*closeShrinePanel\(\);/);
    assert.match(game, /if \(isAvatarOpen\(\)\) askCloseAvatarPanel\(\);\s*else openAvatarPanel\(\);/);
    assert.match(game, /getElementById\('avatar-close'\)\?\.addEventListener\('click', askCloseAvatarPanel\)/);
    assert.match(game, /if \(e\.target\?\.id === 'avatar-panel'\) askCloseAvatarPanel\(\);/);
    // Saving still ends with the panel shut (commitAvatarAppearance closes it, so nothing is dirty).
    assert.match(game, /function commitAvatarAppearance\(\) \{[\s\S]*?wornAppearance = playerAppearance;[\s\S]*?closeAvatarPanel\(\);/);
  });

  it('a slider change edits the draft like any other part (setVectorFields), so it counts as a change', () => {
    assert.match(game, /onChange: \(key, value\) => setVectorFields\(\(v\) => \{\s*v\.face = \{ \.\.\.\(v\.face \|\| \{\}\), \[key\]: value \};/);
    assert.match(game, /function setVectorFields\(mutate\) \{[\s\S]*?renderAvatarSwatches\(\);\s*renderAvatarDims\(\);\s*paintAvatarPreview\(\);/);
  });
});

describe('Classic vanity layout (css/classic.css)', () => {
  const start = classic.indexOf('/* === Classic vanity (lane) === */');
  const end = classic.indexOf('/* === end Classic vanity === */');
  const block = classic.slice(start, end);

  it('one block, its rules only for the builder (and the tutorial pill behind it)', () => {
    assert.ok(start > 0 && end > start, 'the block');
    assert.equal(classic.indexOf('/* === Classic vanity (lane) === */', start + 1), -1, 'once');
    assert.equal(classic.match(/#avatar-panel/g).length, block.match(/#avatar-panel/g).length, 'no builder rule outside it');
    const selectors = block.replace(/\/\*[\s\S]*?\*\//g, '').match(/[^{}]+(?=\{)/g).map((s) => s.trim());
    for (const sel of selectors) for (const part of sel.split(/,\s*(?![^()]*\))/)) assert.match(part.trim(), /^:root\[data-ui="classic"\][^ ]*\s+#(avatar-panel|newxp-pill)\b/, part);
  });

  it("Vanity's columns: parts left, the mirror with its tests, Reset and Save in the middle, Your looks right, sliders below", () => {
    assert.match(block, /grid-template-areas:\s*"head\s+head\s+head"\s*"tabs\s+emotes\s+looks"\s*"swatches mirror\s+looks"\s*"swatches actions looks"\s*"dims\s+presets looks";/);
    assert.match(block, /:is\(\.avatar-builder-layout, \.avatar-preview-col, \.avatar-controls-col\) \{ display: contents; \}/);
    for (const [sel, area] of [['\\.avatar-tabs', 'tabs'], ['#avatar-preview', 'mirror'], ['\\.avatar-emotes', 'emotes'], ['\\.avatar-actions', 'actions'], ['\\.avatar-presets', 'presets'], ['\\.avatar-dims', 'dims'], ['\\.your-looks', 'looks']]) {
      assert.match(block, new RegExp(`#avatar-panel ${sel} \\{[^}]*grid-area: ${area};`), area);
    }
    assert.match(block, /\.avatar-swatches\[data-mode="parts"\] \{\s*grid-area: swatches;\s*contain: size;/, 'a long parts list never pushes Your looks or the sliders down');
    assert.match(block, /\.avatar-dim-range \{\s*writing-mode: vertical-lr;\s*direction: rtl;/, 'upright sliders');
    assert.match(block, /#avatar-panel:not\(\[hidden\]\) \{\s*inset: 0;\s*bottom: 0;/, 'the whole world cell, as the page had the window');
  });

  it('Modern keeps its builder: sliders on the Face tab only, no Classic colours', () => {
    const style = read('public/style.css');
    assert.match(style, /\.avatar-panel:not\(\[data-tab="face"\]\) \.avatar-dims \{ display: none; \}/);
    assert.match(game, /if \(panel\) panel\.dataset\.tab = avatarBuilderSlot;/);
    const modern = style.slice(style.indexOf('/* From the 2012 Vanity page'), style.indexOf('.avatar-leaving-actions'));
    assert.doesNotMatch(modern, /--c-classic-/);
  });
});
