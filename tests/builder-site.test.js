/**
 * LEVEL BUILDER P1 (spec 5, 6.1, 8.3, section 14): the site's half (groddle-afternoon-site).
 * The drafts' tables, the REST routes (AdminBuilder: manage_options, off unless
 * groddle_builder_enabled, If-Match and 409), the store (BuilderStore: revisions, the log line),
 * the gated /console/builder/ shell page (AdminBuilderPage), the console's Builder tab, and
 * php -l over src/.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { HAS_SITE, SITE_DIR, sitePath, skipWithoutSite } from '../tools/repos.mjs';

const hasPhp = spawnSync('php', ['-v']).status === 0;
const src = (f) => readFileSync(sitePath(f), 'utf8');

describe('the level builder on the site (groddle-afternoon-site)', { skip: skipWithoutSite }, async () => {
  const consoleJs = HAS_SITE ? await import(pathToFileURL(sitePath('console/console.js')).href) : {};

  it('php -l: every file in src/ parses', { skip: !hasPhp && 'no php' }, () => {
    const files = readdirSync(join(SITE_DIR, 'src')).filter((f) => f.endsWith('.php'));
    assert.ok(files.includes('AdminBuilder.php') && files.includes('BuilderOps.php') && files.includes('BuilderStore.php') && files.includes('AdminBuilderPage.php'));
    for (const f of files) {
      const r = spawnSync('php', ['-l', join(SITE_DIR, 'src', f)], { encoding: 'utf8' });
      assert.equal(r.status, 0, `${f}: ${r.stdout}${r.stderr}`);
    }
  });

  it('declares the drafts and their revisions, additively (minn.json)', () => {
    const manifest = JSON.parse(src('minn.json'));
    const cols = (t) => manifest.tables[t].map((l) => l.split(' ')[0]);
    assert.deepEqual(cols('groddle_builder_drafts').slice(0, 12), ['id', 'title', 'rev', 'zone', 'sha256', 'state', 'base_commit', 'created_by', 'updated_by', 'created_at', 'updated_at', 'published_commit']);
    assert.ok(manifest.tables.groddle_builder_drafts.includes('PRIMARY KEY  (id)'));
    assert.deepEqual(cols('groddle_builder_revisions').slice(0, 8), ['draft_id', 'rev', 'zone', 'sha256', 'author', 'at', 'note', 'ops_summary']);
    assert.ok(manifest.tables.groddle_builder_revisions.includes('PRIMARY KEY  (draft_id,rev)'));
    assert.match(manifest.tables.groddle_builder_revisions.find((l) => l.startsWith('zone ')), /longblob/);
    const [maj, min, patch] = manifest.version.split('.').map(Number);
    assert.ok(maj > 0 || min > 5 || (min === 5 && patch >= 24), `version ${manifest.version}`);
  });

  it('every builder route is an administrator\'s or a key\'s with its scope (BuilderAuth), under admin/builder, and off unless the option is on', () => {
    const s = src('src/AdminBuilder.php');
    const routes = [...s.matchAll(/#\[Route\(Method::(\w+), self::BASE \. '([^']+)', policy: new Policy\(([^)]*)\)\)\]\s*public function (\w+)\(/g)];
    assert.equal(routes.length, 9);
    assert.match(s, /private const BASE = '\/groddle\/v1\/admin\/builder';/);
    const scopes = { drafts: "'drafts:read'", draft: "'drafts:read'", revisions: "'drafts:read'", play: 'null', create: "'drafts:write', 'write'", replace: "'drafts:write', 'write'", ops: "'drafts:write', 'write'", restore: "'drafts:write', 'write'", archive: "'drafts:write', 'write'" };
    for (const [, , path, policy, fn] of routes) {
      // Public to the router: a key is no Minn sign-in. The gate is the handler's first line (P4).
      assert.equal(policy, 'Access::Public', path);
      const body = s.slice(s.indexOf(`public function ${fn}(`));
      assert.ok(body.slice(0, body.indexOf('{') + 90).includes(`$this->gate($request, ${scopes[fn]})`), `${fn} gates first with its scope`);
    }
    assert.deepEqual(routes.map((r) => `${r[1]} ${r[2]}`).sort(), [
      'Delete /drafts/{id:[a-z0-9-]+}', 'Get /drafts', 'Get /drafts/{id:[a-z0-9-]+}', 'Get /drafts/{id:[a-z0-9-]+}/play', 'Get /drafts/{id:[a-z0-9-]+}/revisions',
      'Post /drafts', 'Post /drafts/{id:[a-z0-9-]+}/ops', 'Post /drafts/{id:[a-z0-9-]+}/restore', 'Put /drafts/{id:[a-z0-9-]+}',
    ]);
    assert.match(s, /return \(new BuilderAuth\(\$this->minn\)\)->gate\(\$request, \$scope, \$kind\);/);
    const auth = src('src/BuilderAuth.php');
    assert.match(auth, /can\(\$user->id, 'manage_options'\)/);
    assert.match(s, /public const OPTION = 'groddle_builder_enabled';/);
    assert.match(s, /site->option\(self::OPTION\)/);
    assert.match(auth, /throw new RestError\('builder_disabled', [^;]+, 404\)/);
    assert.match(src('src/Extension.php'), /new AdminBuilder\(\$minn\)/);
    assert.match(src('src/Extension.php'), /routes\(new AdminBuilderPage\(\$minn\)\)/);
  });

  it('a write names its rev: none is 428, a stale one 409 with the current rev; a batch is all or nothing (422 with the op)', () => {
    const s = src('src/AdminBuilder.php');
    assert.match(s, /builder_rev_required', [^;]+, 428\)/);
    for (const fn of ['replace', 'ops', 'restore']) assert.match(s.slice(s.indexOf(`public function ${fn}(`)).slice(0, 400), /self::ifMatch\(\$request\)/, fn);
    const store = src('src/BuilderStore.php');
    assert.match(store, /FOR UPDATE/);
    assert.match(store, /throw new RestError\('builder_rev_conflict', "The draft has moved on to rev \{\$row\['rev'\]\}\.", 409, \['rev' => \$row\['rev'\]\]\);/);
    assert.ok(store.indexOf('builder_rev_conflict') < store.indexOf('$change($row'), 'refused before the ops run');
    assert.match(s, /throw new RestError\('builder_invalid', \$e->getMessage\(\), 422, \['op' => \$e->index/);
    assert.match(store, /BuilderOps::check\(\$zone, \$id\)/);
    assert.match(store, /builder_too_large', 'A draft is at most 4 MB\.', 413/);
  });

  it('keeps every rev (gzip, through FROM_BASE64), thins past 200, never deletes a draft, logs a run of saves as one line', () => {
    const store = src('src/BuilderStore.php');
    assert.match(store, /public const REVISIONS_KEPT = 200;/);
    assert.match(store, /VALUES \(\?, \?, FROM_BASE64\(\?\), \?, \?, \?, \?, \?\)", \[\$id, \$rev, base64_encode\(\(string\) gzencode\(\$json, 6\)\)/);
    assert.match(store, /SET state = 'archived'/);
    assert.doesNotMatch(store, /DELETE FROM ' \. \$this->db->table\(self::DRAFTS\)/);
    assert.match(store, /AdminConsole::recordAction\(\$this->db, \$admin, 0, 'builder'/);
    assert.match(store, /public const LOG_MERGE_S = 600;/);
  });

  it('the shell page: the console\'s gate, a 404 when off, then the game\'s renderer and the editor (spec 6.1)', () => {
    const page = src('src/AdminBuilderPage.php');
    assert.match(page, /public const PATH = '\/console\/builder\/';/);
    const handler = page.slice(page.indexOf('public function page('));
    const off = handler.indexOf('AdminBuilder::enabled');
    const signedOut = handler.indexOf("Response::redirect('/minn-admin/login?redirect_to='");
    const refused = handler.indexOf("can($user->id, 'manage_options')");
    const drawn = handler.indexOf('$this->document()');
    assert.ok(off > 0 && off < signedOut && signedOut < refused && refused < drawn, 'option, sign-in, capability, then the page');
    assert.match(handler, /return Response::html\(AdminConsolePage::refused\(\), 403\)/);
    const doc = page.slice(page.indexOf('private function document('));
    const order = ['<base href=\\"/\\" />', 'self::PIXI', "'js/data-versions.js'", "'js/data-urls.js'", '<script type="module" src="/\' . self::EDITOR'];
    let at = 0;
    for (const bit of order) {
      const i = doc.indexOf(bit, at);
      assert.ok(i > at, `${bit} in order`);
      at = i;
    }
    assert.match(page, /hash_file\('sha256', \$path\)/);
  });

  it('the console: a Builder tab only when the builder is on, and its helpers', () => {
    const page = src('src/AdminConsolePage.php');
    assert.match(page, /\$builder = AdminBuilder::enabled\(\$this->minn\);/);
    assert.match(page, /\(\$builder \? "\\n    <button type=\\"button\\" role=\\"tab\\" id=\\"console-tab-builder\\"/);
    assert.match(page, /\(\$builder \? self::builderPanel\(\) : ''\)/);
    assert.equal(consoleJs.draftIdFrom('Mossy Hollow!'), 'mossy-hollow');
    assert.equal(consoleJs.draftIdFrom('42 Élan'), 'elan');
    assert.equal(consoleJs.draftIdFrom('Ab'), 'ab-zone');
    assert.equal(consoleJs.draftIdOk('mossy-hollow'), true);
    assert.equal(consoleJs.draftIdOk('Mossy'), false);
    assert.equal(consoleJs.builderHref('mossy-hollow', 'lane'), '/console/builder/#draft=mossy-hollow&street=lane');
    assert.equal(consoleJs.draftWords({ rev: 3, streets: [{}, {}], updatedAt: 'x' }), 'rev 3 · 2 streets · saved x');
    const line = (detail) => consoleJs.logWords({ kind: 'builder', player: { id: 0 }, detail });
    assert.equal(line({ title: 'Mossy Hollow', from: 2, rev: 9, ops: 14 }), 'edited the draft “Mossy Hollow” (revs 2 to 9, 14 changes)');
    assert.equal(line({ title: 'Mossy Hollow', text: 'created' }), 'started the draft “Mossy Hollow”');
    assert.equal(line({ title: 'Mossy Hollow', text: 'archived' }), 'archived the draft “Mossy Hollow”');
    const css = src('console/console.css');
    assert.match(css, /\.console-builder\[hidden\] \{ display: none; \}/);
  });
});
