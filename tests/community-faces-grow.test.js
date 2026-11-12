/**
 * Website boards (Friendly's Bugs threads 6 and 8, 2026-11-12), groddle-afternoon-site:
 * - thread 6: the words box for a new topic and a reply grows with the text (community/community.js
 *   grow: up to GROW_ROWS lines or the box's CSS max-height, half the screen, then it scrolls), so a long
 *   post can be read back before it goes; the new-topic form had no grow at all.
 * - thread 8: a board's topic list and a topic's head show the starter's avatar picture (the tile their
 *   posts already show, Community::authors), not the first letter of their name or of the subject; the
 *   letter stays for a player with no public picture.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { SITE_DIR, sitePath, skipWithoutSite } from '../tools/repos.mjs';

const hasPhp = spawnSync('php', ['-v']).status === 0;
const engine = process.env.MINN_ENGINE_DIR || join(homedir(), 'Cove/Sites/minn-engine.localhost/public/minn');
const noEngine = !existsSync(join(engine, 'src/Minn/Autoloader.php')) && 'Minn Engine not found (set MINN_ENGINE_DIR)';
const skipPhp = skipWithoutSite || (!hasPhp && 'no php') || noEngine;
const src = (p) => readFileSync(sitePath(p), 'utf8');
function php(body) {
  const code = `define('ABSPATH', sys_get_temp_dir() . '/'); define('MINN_ENGINE_DIR', ${JSON.stringify(engine)}); require ${JSON.stringify(engine)} . '/src/Minn/Autoloader.php'; Minn\\Autoloader::register(); foreach (['WordFilter', 'BugReports', 'AdminConsole', 'CommunityText', 'Community', 'ChatHistory', 'Notifications', 'CommunityPages'] as $c) require ${JSON.stringify(SITE_DIR)} . "/src/$c.php"; use Groddle\\Minn\\CommunityPages as P; echo json_encode(${body}, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);`;
  return JSON.parse(execFileSync('php', ['-r', code]).toString());
}

describe('the boards\' words box grows (Bugs thread 6)', { skip: skipWithoutSite }, () => {
  it('grow: up to GROW_ROWS lines or the CSS max-height, whichever is less, then it scrolls', () => {
    const js = src('community/community.js');
    assert.match(js, /\nconst GROW_ROWS = 18;\nfunction grow\(field, maxRows = GROW_ROWS\) \{/);
    assert.match(js, /const cap = parseFloat\(cs\.maxHeight\);\n\s*const max = Math\.min\(line \* maxRows \+ extra, Number\.isFinite\(cap\) && cap > 0 \? cap : Infinity\);/);
    assert.match(js, /field\.style\.overflowY = field\.scrollHeight \+ extra > max \? 'auto' : 'hidden';/);
    const css = src('community/community.css');
    assert.match(css, /textarea\.cx-field \{ display: block; height: 36px; max-height: 50vh; max-height: 50dvh; overflow-y: hidden; \}/);
  });

  it('the new topic\'s box, the reply box and an edit all grow', () => {
    const js = src('community/community.js');
    const newForm = js.slice(js.indexOf("const newForm = document.querySelector('form[data-community-new]');"), js.indexOf('// —— A thread ——'));
    assert.match(newForm, /grow\(newForm\.querySelector\('textarea'\)\);/);
    assert.match(js, /const fit = grow\(field\);/, 'the reply box');
    assert.match(js.slice(js.indexOf('function editPost(')), /grow\(field\);/, 'an edit');
    assert.match(src('src/CommunityPages.php'), /<textarea class="ctext cx-field" id="cthread-body"/);
    assert.match(src('src/CommunityPages.php'), /public const ASSET_KEY = 'community-15';/);
  });
});

describe('topics show their starter\'s picture (Bugs thread 8)', () => {
  it('avatar(): the picture when there is one, else the initial in its colour', { skip: skipPhp }, () => {
    const [pic, letter, blank] = php("[P::avatar('Ada', 'cx-av-lg', '/players/ada/tile.webp?v=1&x=<2>'), P::avatar('ada', 'cx-av-lg'), P::avatar('Bo', '', '')]");
    assert.match(pic, /^<span class="cx-av cx-av-lg" data-hue="\d" aria-hidden="true"><img src="\/players\/ada\/tile\.webp\?v=1&amp;x=&lt;2&gt;" alt="" loading="lazy" decoding="async" \/><\/span>$/);
    assert.match(letter, /^<span class="cx-av cx-av-lg" data-hue="\d" aria-hidden="true">A<\/span>$/);
    assert.match(blank, />B<\/span>$/, 'an empty picture is no picture');
  });

  it('a board\'s rows and a topic\'s head ask Community::authors for the starter\'s tile', { skip: skipWithoutSite }, () => {
    const pages = src('src/CommunityPages.php');
    const board = pages.slice(pages.indexOf('public function board('), pages.indexOf('public function newThread('));
    assert.match(board, /\$authors = \$community->authors\(array_values\(array_unique\(array_filter\(array_map\(static fn \(array \$t\): int => \(int\) \$t\['author_id'\], \$threads\)\)\)\)\);/);
    assert.match(board, /self::avatar\(\(string\) \$t\['author_name'\], 'cx-av-lg', \$authors\[\(int\) \$t\['author_id'\]\]\['tile'\] \?\? null\)/);
    const topic = pages.slice(pages.indexOf('private function threadPage('), pages.indexOf('private function replyBox('));
    assert.match(topic, /\$face = self::avatar\(\(string\) \$thread\['author_name'\], 'cx-av-md', \$community->authors\(\[\$starter\]\)\[\$starter\]\['tile'\] \?\? null\);/);
    assert.match(topic, /'<p class="cmeta">' \. \$meta \. '<\/p>', \$face\)/);
    assert.match(pages, /\. \(\$face !== '' \? \$face : self::avatar\(\$name, 'cx-av-md'\)\)/);
    // The picture is the one posts show (public profile only), drawn as the chat app's buddies are.
    assert.match(src('src/Community.php'), /'tile' => \$public && \$at !== null \? Profiles::imageUrl\(\$id, 'tile', \$at\) : null,/);
    assert.match(src('community/community.css'), /\.cx-av img \{ width: 100%; height: 100%; border-radius: 50%; object-fit: cover;/);
  });
});

describe('the website chat names the day where it changes (Austin 2026-11-12)', { skip: skipWithoutSite }, () => {
  it('puts a day line before the first line of each day', () => {
    const app = src('community/chat-app.js');
    assert.match(app, /function dayLabel\(ms, now = Date\.now\(\)\)/);
    assert.match(app, /return 'Today';/);
    assert.match(app, /return 'Yesterday';/);
    assert.match(app, /if \(day !== lastDay\) \{/);
    assert.match(src('community/community.css'), /\.cx-day \{/);
  });
});
