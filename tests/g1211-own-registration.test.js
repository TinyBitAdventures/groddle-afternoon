/**
 * G1211 (root R49): Breakwater, the spam mu-plugin the fleet installs, refused every account the game
 * made on live through the registration_errors filter that the engine's AccountFlows::vetRegistration
 * runs for Accounts::registerQuietly (error code "breakwater"). The site extension now tells Breakwater
 * to skip the game's own registrations (its breakwater_skip filter), hooked through the engine's hook
 * table only for the length of that one call (groddle-afternoon-site src/OwnRegistration.php).
 *
 * The php case runs OwnRegistration against Minn's Runtime::hooks() with a stand-in Breakwater
 * (tests/fixtures/minn-accounts/own-registration.php); the rest reads the site's source.
 * Run: GRODDLE_SITE_DIR=<site> node --test tests/g1211-own-registration.test.js
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { SITE_DIR, sitePath, skipWithoutSite } from '../tools/repos.mjs';
import { PHP } from './php.js';

const root = join(import.meta.dirname, '..');
const src = (f) => readFileSync(sitePath('src', f), 'utf8');
const engine = process.env.MINN_ENGINE_DIR || join(homedir(), 'Cove/Sites/minn-engine.localhost/public/minn');
// -r, not -v: the FrankenPHP wrapper some machines have first on PATH answers -v with an error.
const hasPhp = spawnSync(PHP, ['-r', 'exit(0);']).status === 0;
const skipPhp = skipWithoutSite || (!hasPhp && 'no php') || (!existsSync(join(engine, 'src/Minn/Autoloader.php')) && 'Minn Engine not found (set MINN_ENGINE_DIR)');

describe('G1211: the game\'s own registrations skip Breakwater, nothing else does', { skip: skipWithoutSite }, () => {
  it('runs through the engine\'s hook table, last in line, and takes the skip off in a finally', () => {
    const own = src('OwnRegistration.php');
    assert.match(own, /public const SKIP = 'breakwater_skip';/);
    assert.match(own, /public const PRIORITY = PHP_INT_MAX;/);
    assert.match(own, /\$hooks = Runtime::hooks\(\);\s*\$skip = static fn \(mixed \$skip = false\): bool => true;\s*\$hooks->add\(self::SKIP, \$skip, self::PRIORITY, 1\);\s*try \{\s*return \$register\(\);\s*\} finally \{\s*\$hooks->remove\(self::SKIP, \$skip, self::PRIORITY\);\s*\}/);
    const code = own.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(code, /\b(?:add_filter|remove_filter|apply_filters|add_action|has_filter|get_option|wp_[a-z_]+)\s*\(/, 'no WordPress functions');
  });

  it('every registration the game makes is wrapped: a new character, the sign-up link, Google, a local QA sign-up', () => {
    const wrapped = /OwnRegistration::run\(static fn \(\) => \$accounts->registerQuietly(?:WithHash)?\(/g;
    assert.equal((src('CharacterRoutes.php').match(wrapped) || []).length, 1, 'CharacterRoutes::create');
    assert.equal((src('GoogleSignIn.php').match(wrapped) || []).length, 1, 'Continue with Google');
    assert.equal((src('PlayerAccount.php').match(wrapped) || []).length, 2, 'the sign-up link (registerQuietlyWithHash) and makeNow');
    for (const f of readdirSync(sitePath('src')).filter((n) => n.endsWith('.php'))) {
      for (const line of src(f).split('\n').filter((l) => /->registerQuietly(?:WithHash)?\(/.test(l))) {
        assert.match(line, /OwnRegistration::run\(/, `${f}: ${line.trim()}`);
      }
    }
  });

  it('with a stand-in Breakwater on registration_errors: the game\'s registration goes through, any other is still refused (php)', { skip: skipPhp }, () => {
    const out = JSON.parse(execFileSync(PHP, [join(root, 'tests/fixtures/minn-accounts/own-registration.php'), engine, SITE_DIR], { encoding: 'utf8' }));
    assert.deepEqual(out.plain, ['breakwater'], 'the stand-in refuses as Breakwater did on live');
    assert.deepEqual(out.own, [], 'the game\'s own registration is not refused');
    assert.equal(out.ownInside, true, 'the skip is hooked while the registration runs');
    assert.equal(out.skipLeftAfter, false, 'and gone right after');
    assert.deepEqual(out.plainAfter, ['breakwater'], 'another registration after it is judged again');
    assert.equal(out.thrown, 'the database went away');
    assert.equal(out.skipLeftAfterThrow, false, 'a registration that throws still takes the skip off');
    assert.deepEqual(out.ownWithOtherFilter, [], 'another plugin\'s skip filter that says no doesn\'t undo ours');
    assert.deepEqual(out.plainWithOtherFilter, ['breakwater']);
    assert.equal(out.asked, 5, 'Breakwater was asked every time; only the game\'s were skipped');
  });
});
