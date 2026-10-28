// G301: the eleven-skills badge's login check runs on a fresh game's first
// boot too (the source's onLoggedin runs on every login_end, the first
// included). G306 (Austin 2026-10-26): a new solo game starts with 11+ starter
// skills, which don't count; solo and multiplayer both earn the badge, its card
// and rewards at the eleventh skill the player learns.
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadContentCatalogsFromDir } from '../public/js/content-catalogs.js?v=g403-1';
import { createSkillState, grantSkillWithPrereqs } from '../public/js/skills.js';
import { STARTER_MINING_SKILLS } from '../public/js/mining.js?v=g403-1';

const here = dirname(fileURLToPath(import.meta.url));
const game = readFileSync(join(here, '../public/game.js'), 'utf8');
const gsjs = join(here, '../../glitch-GameServerJS');
const haveGsjs = existsSync(gsjs);
const src = (rel) => readFileSync(join(gsjs, rel), 'utf8');

describe('what the source does', () => {
  it('login_end calls onLoggedin on every login, and onLoggedin checks for eleven skills', { skip: !haveGsjs && 'no GSJS checkout' }, () => {
    const main = src('main.js');
    assert.match(main, /case 'login_end':\s*return doLoginEnd\(pc, msg, false\);/);
    assert.match(main, /if \(msg\.type == 'login_end'\)\{\s*pc\.announce_sound\('CLIENT_LOADED'\);\s*pc\.onLoggedin\(\);/);
    const player = src('players/player.js');
    const loggedIn = player.slice(player.indexOf('function onLoggedin()'), player.indexOf('function onLogout()'));
    assert.match(loggedIn, /if \(this\.skills_get_count\(\) >= 11\) this\.achievements_grant\('first_eleven_skills'\);/);
    // Nothing in onLoggedin tells a first login from a later one.
    assert.doesNotMatch(loggedIn, /first_login|is_new|date_last_loggedin\s*\)/);
  });

  it('skills_give grants it at the eleventh skill', { skip: !haveGsjs && 'no GSJS checkout' }, () => {
    const skills = src('players/inc_skills.js');
    const give = skills.slice(skills.indexOf('function skills_give(id)'), skills.indexOf('function skills_remove_notify'));
    assert.match(give, /if \(this\.skills_get_count\(\) == 11\)\{\s*this\.achievements_grant\('first_eleven_skills'\);/);
  });
});

describe('the remake', () => {
  before(async () => {
    await loadContentCatalogsFromDir(join(here, '../public/assets/content'));
  });

  it('a new solo game starts with 11 or more starter skills', () => {
    const state = createSkillState();
    for (const id of ['animalkinship_1', 'ezcooking_1', 'cheffery_1', 'blending_1', 'blending_2', ...STARTER_MINING_SKILLS]) {
      grantSkillWithPrereqs(state, id);
    }
    assert.ok(state.learned.length >= 11, String(state.learned.length));
    const boot = game.indexOf('const savedPlayerState = loadPlayerState();');
    assert.ok(game.lastIndexOf("grantSkillWithPrereqs(skillState, 'animalkinship_1');", boot) > 0, 'starter skills come before the boot check');
  });

  it("a new multiplayer player's fresh boot runs the same check a save does", () => {
    assert.match(game, /handleSkillCompletions\(tickSkillStudy\(skillState, Date\.now\(\)\)\.completed, \{ offline: true \}\);\s*backfillStreetVisits\(\);\s*(?:\/\/[^\n]*\n\s*if \(pc\.startedFresh\) starterSkills = new Set\(\);\s*)?\} else if \(bootParams\.has\('resetgame'\) \|\| !NEW_PLAYER\) \{/);
    assert.match(game, /\} else \{\s*(?:\/\/[^\n]*\n\s*)+handleSkillCompletions\(\[\]\);\s*\}/);
    assert.match(game, /if \(skillsLearnedCount\(\) >= 11\) engine\.grantAchievement\('first_eleven_skills'\);/);
  });

  it('the demo kit\'s starter skills never count: a new solo game holds no badge until the eleventh learned skill', () => {
    assert.match(game, /function skillsLearnedCount\(\) \{\n\s+return skillState\.learned\.filter\(\(id\) => !starterSkills\.has\(id\)\)\.length;/);
    assert.match(game, /grantSkillWithPrereqs\(skillState, sk\);\n\s+\}\n\s+starterSkills = new Set\(skillState\.learned\);/);
    const at = game.indexOf("} else if (bootParams.has('resetgame') || !NEW_PLAYER) {");
    assert.ok(at > 0);
    const body = game.slice(at, game.indexOf('} else {', at));
    assert.doesNotMatch(body, /first_eleven_skills'\)|grantAchievement|handleSkillCompletions/);
    assert.match(game, /if \(knownTarget >= 11 && !achieveState\.unlocked\.includes\('first_eleven_skills'\)\) \{\s*achieveState\.unlocked\.push\('first_eleven_skills'\);/);
  });
});
