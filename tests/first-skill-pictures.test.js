/**
 * G393, the skill half: the first-skill choice shows Tiny Speck's three pictures
 * (magic_rock.js showSkillChooser 1174-1272), not cards built from our parts. The flow stays.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIRST_SKILLS } from '../public/js/newxp.js?v=85922204';
import { skillPictureUrl } from '../public/js/features/newxp-feature.js?v=b90085ee';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const GS = join(root, '../glitch-GameServerJS');
const manifest = JSON.parse(readFileSync(join(root, 'public/assets/sprites/overlays/overlays-more.json'), 'utf8'));
const feature = readFileSync(join(root, 'public/js/features/newxp-feature.js'), 'utf8');

describe('first skill pictures', () => {
  it('every first skill has its CC0 picture on disk', () => {
    assert.equal(FIRST_SKILLS.length, 3);
    for (const s of FIRST_SKILLS) {
      const url = skillPictureUrl(s);
      assert.ok(existsSync(join(root, 'public', url)), url);
      const key = `newxpchooseskill_${s.art}_overlay`;
      assert.equal(manifest[key].src, `glitch-overlays/${key}.fla`);
      assert.equal(`assets/sprites/overlays/${manifest[key].file}`, url);
    }
  });

  it('the same three the source lays out', { skip: !existsSync(GS) }, () => {
    const src = readFileSync(join(GS, 'items/magic_rock.js'), 'utf8');
    for (const s of FIRST_SKILLS) {
      assert.match(src, new RegExp(`overlay_key_to_url\\('newxpchooseskill_${s.art}_overlay'\\)`), s.id);
      assert.match(src, new RegExp(`choice: '${s.choice}'`), s.id);
    }
  });

  it('the chooser shows the picture at its own size and resolves the same skill ids', () => {
    const at = feature.indexOf('async function skillChooser(t)');
    const fn = feature.slice(at, feature.indexOf('ui.card.hidden = true;', at));
    assert.match(fn, /class="nx-skill" data-nx-skill="\$\{s\.id\}" aria-label="\$\{s\.name\}"/);
    assert.match(fn, /<img srcset="\$\{url\} 2x" alt="">/, 'no src: a src would count as 1x and draw it double on any 1x screen');
    assert.match(feature, /\.nx-card \.nx-skill\{width:150px;[^}]*background:none!important/, 'magic_rock.js x -150, 0, 150, on no button face');
    assert.match(fn, /querySelectorAll\('\[data-nx-skill\]'\)/);
    assert.doesNotMatch(fn, /art_skill_|bg_green|suit_skill|pattern_skill/);
    assert.match(fn, /<h2>Choose a skill<\/h2>/, 'the rest of the card stays');
  });
});
