// The multiplayer save pill (Austin 2026-10-28): it sits in the pack under its hint, not over the
// slots or the award and new-day screens, and a routine autosave stays "Saved" (js/online-boot.js).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pillStateFor, SAVING_SHOWN_AFTER_MS } from '../public/js/online-boot.js?v=g477-2';

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
    assert.match(boot, /pill\.tabIndex = 0;/, 'the tooltip opens on keyboard focus too');
    assert.match(build, /\.save-pill\.in-pack:not\(\[data-state="conflict"\]\):not\(\[data-state="signed-out"\]\) \{ position: relative; inset: auto; width: 32px; height: 32px;/);
    assert.match(build, /:is\(\.save-pill-who, \.save-pill-state\) \{ position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset\(50%\);/, 'still read out, not shown');
    // As specific as the rule that hides it, or the hidden rule wins.
    assert.match(build, /\.save-pill\.in-pack:not\(\[data-state="conflict"\]\):not\(\[data-state="signed-out"\]\):is\(:hover, :focus-visible\)::after \{ opacity: 1; \}/);
  });
  it('in the one-row pack it is the row\'s last button, beside search, styled like it', () => {
    assert.match(boot, /if \(row && hint\?\.parentNode === row\) \{\n[^\n]*\n\s+row\.insertBefore\(pill, hint\);\n\s+pill\.classList\.add\('in-pack', 'in-row'\);/);
    // Relative, so the corner pill's left and bottom offsets must not apply (they lifted it 10 px).
    assert.match(build, /position: relative; inset: auto;/);
    assert.match(build, /#pack-row > \.save-pill\.in-row:not\(\[data-state="conflict"\]\):not\(\[data-state="signed-out"\]\) \{ flex: none; width: 36px; height: 36px; border-radius: var\(--radius-lg\);/, 'the search button\'s size and corners');
  });
});
