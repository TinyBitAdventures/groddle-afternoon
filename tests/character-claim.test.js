/**
 * An account made outside the game (the site's own people, administrators) has no character row,
 * so the Players page, its profile and the console skipped it. Playing online now claims its
 * display name as its character (groddle-afternoon-site src/Characters.php claimOwnName), from the
 * realtime ticket and the profile route. Checked against the site source.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { sitePath, skipWithoutSite } from '../tools/repos.mjs';

describe('an account without a character claims its display name (groddle-afternoon-site)', { skip: skipWithoutSite }, () => {
  const characters = () => readFileSync(sitePath('src/Characters.php'), 'utf8');

  it('claims only a name that fits the sign-up rules and nobody else has', () => {
    const src = characters();
    const fn = src.slice(src.indexOf('public function claimOwnName('), src.indexOf('public function claim('));
    assert.match(fn, /WHERE user_id = \?", \[\$user->id\]\) !== null\) \{\s*return;/);
    assert.match(fn, /preg_match\(PlayerAccount::NAME, \$name\) !== 1/);
    assert.match(fn, /LOWER\(display_name\) = \? AND ID <> \?/);
    assert.match(fn, /\$this->claim\(\$user->id, \$name\)/);
  });

  it('runs before the realtime ticket and the profile read', () => {
    assert.match(readFileSync(sitePath('src/RealtimeTicket.php'), 'utf8'), /claimOwnName\(\$user\);\s*\$now = time\(\);/);
    assert.match(readFileSync(sitePath('src/Profiles.php'), 'utf8'), /claimOwnName\(\$user\);\s*\}\s*\$name = \$db->value/);
  });
});
