import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COMPANION_FOLLOW_MAX_DISTANCE,
  LAST_FEAT_STREET_IDS,
  LAST_FEAT_STREET_LABELS,
  LOCAL_COMPANION_PROFILES,
  STALKER_ACHIEVEMENT_ID,
  approachCompanionX,
  companionFollowVelocity,
  createCompanionFollowState,
  localCompanionGatherTarget,
  localCompanionProfile,
  planLocalCompanionSpawns,
  recordCompanionFollowStreet,
  startCompanionFollow,
  stopCompanionFollow,
} from '../public/js/local-companions.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicRoot = join(__dirname, '../public');

describe('local street companions', () => {
  it('shares the three named social companions with distinct clean avatar looks', () => {
    assert.deepEqual(
      LOCAL_COMPANION_PROFILES.map((profile) => profile.name),
      ['Amp', 'Bumbishfish', 'Lily Linguistic']
    );
    assert.equal(new Set(LOCAL_COMPANION_PROFILES.map((profile) => profile.preset)).size, 3);
    assert.equal(localCompanionProfile('Bumbishfish')?.preset, 'blueberry');
    assert.equal(localCompanionProfile('nobody'), null);
  });

  it('keeps ordinary and gathered positions inside the street', () => {
    const left = planLocalCompanionSpawns(20, 600);
    const right = planLocalCompanionSpawns(580, 600);
    for (const row of [...left, ...right]) {
      assert.ok(row.x >= 42 && row.x <= 558);
    }
    assert.equal(localCompanionGatherTarget('Amp', 20, 600), 42);
    assert.equal(localCompanionGatherTarget('Lily Linguistic', 580, 600), 558);
  });

  it('approaches a social target smoothly without overshooting', () => {
    assert.deepEqual(approachCompanionX(10, 20, 2, 3), {
      x: 16,
      vx: 3,
      arrived: false,
    });
    assert.deepEqual(approachCompanionX(18, 20, 2, 3), {
      x: 20,
      vx: 0,
      arrived: true,
    });
    assert.deepEqual(approachCompanionX(20, 10, 1, 4), {
      x: 16,
      vx: -4,
      arrived: false,
    });
  });

  it('follows the original range, activity copy, and three-distinct-street badge contract', () => {
    assert.deepEqual(
      LAST_FEAT_STREET_IDS.map((id) => LAST_FEAT_STREET_LABELS[id]),
      ['Lunae Hubaye', 'Flavus Muss', 'Cytron Monn']
    );
    const state = createCompanionFollowState();
    const tooFar = startCompanionFollow(state, 'Bumbishfish', {
      distance: COMPANION_FOLLOW_MAX_DISTANCE + 1,
      streetTsid: LAST_FEAT_STREET_IDS[0],
    });
    assert.equal(tooFar.ok, false);
    assert.equal(tooFar.reason, 'too_far');
    assert.equal(state.active, false);

    const started = startCompanionFollow(state, 'Bumbishfish', {
      distance: 58,
      streetTsid: LAST_FEAT_STREET_IDS[0],
      now: 123,
    });
    assert.equal(started.activity, 'You started following Bumbishfish.');
    assert.equal(state.active, true);
    assert.equal(state.streetsFollowed, 1);
    assert.equal(state.startedAt, 123);

    assert.equal(
      recordCompanionFollowStreet(state, LAST_FEAT_STREET_IDS[0]).counted,
      false
    );
    assert.equal(
      recordCompanionFollowStreet(state, LAST_FEAT_STREET_IDS[1]).achievementReady,
      false
    );
    const third = recordCompanionFollowStreet(state, LAST_FEAT_STREET_IDS[2]);
    assert.equal(third.achievementReady, true);
    assert.equal(state.streetsFollowed, 3);
    assert.equal(STALKER_ACHIEVEMENT_ID, 'stalker_noncreepy_designation');

    const stopped = stopCompanionFollow(state);
    assert.equal(stopped.activity, 'You stopped following Bumbishfish.');
    assert.deepEqual(state, createCompanionFollowState());
  });

  it('auto-walks toward a trailing gap while allowing a settled stop', () => {
    assert.ok(companionFollowVelocity(100, 250, 0) > 0);
    assert.ok(companionFollowVelocity(250, 100, 0) < 0);
    assert.equal(companionFollowVelocity(176, 250, 0), 0);
    assert.ok(companionFollowVelocity(100, 500, 4.3) <= 4.4);
  });
});

describe('world integration', () => {
  it('renders companions, anchors speech, and exposes deterministic QA state', () => {
    const game = readFileSync(join(publicRoot, 'game.js'), 'utf8');
    assert.match(game, /spawnLocalCompanions/);
    assert.match(game, /updateLocalCompanions/);
    assert.match(game, /showLocalCompanionSpeech/);
    assert.match(game, /dataset\.localCompanionCount/);
    assert.match(game, /dataset\.localCompanionSpeaker/);
    assert.match(game, /companiondemo/);
  });

  it('wires companion verbs, assisted movement, street counting, and the original badge', () => {
    const game = readFileSync(join(publicRoot, 'game.js'), 'utf8');
    const content = readFileSync(join(publicRoot, 'content.js'), 'utf8');
    assert.match(content, /classId === 'pc_local'/);
    assert.match(content, /stop_following/);
    assert.match(game, /handleLocalCompanionTarget/);
    assert.match(game, /companionFollowVelocity/);
    assert.match(game, /recordCompanionFollowStreet/);
    assert.match(game, /STALKER_ACHIEVEMENT_ID/);
    assert.match(game, /dataset\.followStreets/);
  });
});
