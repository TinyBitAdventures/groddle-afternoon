// The multiplayer save pill (Austin 2026-10-28): it sits in the pack under its hint, not over the
// slots or the award and new-day screens, and a routine autosave stays "Saved" (js/online-boot.js).
// Its cloud is a button: in multiplayer it opens Your characters (js/character-switcher.js, 2026-11-12).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pillStateFor, SAVING_SHOWN_AFTER_MS } from '../public/js/online-boot.js?v=4ea71073';

const root = join(import.meta.dirname, '..');
const boot = readFileSync(join(root, 'public/js/online-boot.js'), 'utf8');
const build = readFileSync(join(root, 'tools/play-online/build.mjs'), 'utf8');

describe('save pill', () => {
  it('a routine autosave reads as Saved; only a slow save shows Saving', () => {
    assert.equal(pillStateFor('pending'), 'saved');
    assert.equal(pillStateFor('saving'), 'saved');
    assert.equal(pillStateFor('saving', { slow: true }), 'saving');
    assert.equal(SAVING_SHOWN_AFTER_MS, 1500);
  });
  it('problems show at once', () => {
    for (const s of ['offline', 'error', 'conflict', 'signed-out', 'saved']) assert.equal(pillStateFor(s), s);
  });
  it('mounts in the pack under its hint, the window corner only without a pack', () => {
    assert.match(boot, /document\.querySelector\('\.pack-hint'\)/);
    assert.match(boot, /side\.append\(hint, pill\);\n\s+pill\.classList\.add\('in-pack'\);/);
    assert.match(build, /\.save-pill\.in-pack \{ position: static; z-index: auto;/);
  });
  it('in the pack, only the cloud shows and the words are its tooltip, so the row keeps its width', () => {
    assert.match(boot, /class: 'save-pill-icon', 'aria-hidden': 'true'/);
    assert.match(boot, /pill\.dataset\.tip = `\$\{who\} · \$\{text\}`/);
    assert.match(boot, /tip\(text\);/, 'the tooltip follows every state');
    assert.match(boot, /cloud\.setAttribute\('aria-label', pill\.dataset\.tip\);/, 'the cloud is named by its words');
    assert.match(build, /\.save-pill\.in-pack:not\(\[data-state="conflict"\]\):not\(\[data-state="signed-out"\]\) \{ position: relative; inset: auto; width: 32px; height: 32px;/);
    assert.match(build, /:is\(\.save-pill-who, \.save-pill-state\) \{ position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset\(50%\);/, 'still read out, not shown');
    // As specific as the rule that hides it, or the hidden rule wins.
    assert.match(build, /\.save-pill\.in-pack:not\(\[data-state="conflict"\]\):not\(\[data-state="signed-out"\]\):is\(:hover, :has\(\.save-pill-btn:focus-visible\)\)::after \{ opacity: 1; \}/, 'on keyboard focus too');
    assert.match(build, /@media \(hover: none\) \{ \.save-pill\.in-pack::after \{ display: none; \} \}/, 'a mouse\'s tooltip: never left standing by a tap');
  });
  it('the cloud is a button the size of its pill (multiplayer: it opens Your characters), 44 px on touch', () => {
    assert.match(boot, /const cloud = el\('button', \{ type: 'button', class: 'save-pill-btn' \}\);/);
    assert.match(boot, /pill\.append\(cloud, el\('span', \{ class: 'save-pill-who' \}, who\), el\('span', \{ class: 'save-pill-state' \}, PILL_TEXT\.saved\)\);/, 'the words stay last (a conflict swaps in its link)');
    assert.doesNotMatch(boot, /pill\.tabIndex = 0;/, 'the button takes focus, not the pill');
    assert.match(build, /\.save-pill-icon, \.save-pill-btn \{ display: none; \}/, 'no empty button in the corner pill or a conflict');
    assert.match(build, /\.save-pill\.in-pack:not\(\[data-state="conflict"\]\):not\(\[data-state="signed-out"\]\) \.save-pill-btn \{ display: grid; place-items: center; position: absolute; inset: 0;/);
    assert.match(build, /@media \(pointer: coarse\) \{ #pack-row > \.save-pill\.in-row:not\(\[data-state="conflict"\]\):not\(\[data-state="signed-out"\]\) \{ width: 44px; height: 44px; \} \}/);
  });
  it('in the one-row pack it is the row\'s last button, beside search, styled like it', () => {
    assert.match(boot, /if \(row && hint\?\.parentNode === row\) \{\n[^\n]*\n\s+row\.insertBefore\(pill, hint\);\n\s+pill\.classList\.add\('in-pack', 'in-row'\);/);
    // Relative, so the corner pill's left and bottom offsets must not apply (they lifted it 10 px).
    assert.match(build, /position: relative; inset: auto;/);
    assert.match(build, /#pack-row > \.save-pill\.in-row:not\(\[data-state="conflict"\]\):not\(\[data-state="signed-out"\]\) \{ flex: none; width: 36px; height: 36px; border-radius: var\(--radius-lg\);/, 'the search button\'s size and corners');
  });
});
