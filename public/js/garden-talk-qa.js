/**
 * QA for the garden talkbacks (G96): runs the real plot verbs on one plot so
 * each action's bubble and slugs can be screenshotted.
 *
 *   ?autostart=1&fresh=1&resetgame=1&questoffer=off&gardentalkdemo=herb|crop
 *     &gardentalkstop=clear|plant|water|harvest   stop after that action (default harvest)
 *     &gardentalkupgrades=herbalism_super_harvest_2,...   imagination upgrades for the suffixes
 *     &gardentalkskill=0   no Croppery I / Herbalism I (water and plant stay silent)
 *     &gardentalkstep=manual   wait for window.groddleGardenTalk.next() (one action per call, for screenshots)
 *
 * Canvas: data-garden-talk (running|done|missing), data-garden-talk-step,
 * data-last-speech, data-last-speech-slugs.
 */
import { SEED_CATALOG } from './garden.js?v=g403-1';

const STEPS = ['clear', 'plant', 'water', 'harvest'];
const STEP_MS = 2600;

export function runGardenTalkDemo({ engine, executeVerb, params }) {
  const kind = params.get('gardentalkdemo') === 'crop' ? 'crop' : 'herb';
  const herb = kind === 'herb';
  const stop = STEPS.includes(params.get('gardentalkstop')) ? params.get('gardentalkstop') : 'harvest';
  const skilled = params.get('gardentalkskill') !== '0';
  const upgrades = String(params.get('gardentalkupgrades') || '').split(',').map((s) => s.trim()).filter(Boolean);
  const seedId = herb ? 'herb_seed_rookswort' : 'seed_spinach';
  let target = null;
  let step = 0;

  const setup = () => {
    if (!engine.started || !engine.player || !engine.street) return false;
    if (skilled) engine.grantSkill?.(herb ? 'herbalism_1' : 'croppery_1');
    const pc = engine.pc;
    pc.imaginationUpgrades = [...new Set([...(pc.imaginationUpgrades || []), ...upgrades])];
    pc.energy = Math.max(pc.energy || 0, 300);
    const inv = engine.inv;
    for (const id of ['hoe', 'watering_can']) inv[id] = Math.max(1, Number(inv[id]) || 0);
    if (SEED_CATALOG[seedId]) inv[seedId] = Math.max(6, Number(inv[seedId]) || 0);
    let garden = null;
    for (const t of engine.interactables || []) {
      if (t.classId === 'garden_new' && (t.state?.garden?.gardenType === 'herb') === herb) garden = t;
    }
    const p = engine.player;
    if (garden) {
      p.x = garden.sprite.x - 60;
      p.y = garden.sprite.y;
    } else {
      garden = engine.spawnGarden?.({ x: p.x + 120, y: p.y + 2, gardenType: herb ? 'herb' : 'default' });
    }
    target = garden?.state?.plotTargets?.[0] || null;
    if (!target) {
      engine.setData('gardenTalk', 'missing');
      return true;
    }
    const plot = target.state.plot;
    plot.state = 'dirty';
    plot.seed = null;
    plot.wet = false;
    engine.refreshGarden?.(garden);
    engine.refreshPack?.();
    engine.updateHud?.();
    engine.setData('gardenTalk', 'running');
    return true;
  };

  const manual = params.get('gardentalkstep') === 'manual';
  const next = () => {
    const action = STEPS[step];
    if (!action || !target) return null;
    if (action === 'harvest') {
      // QA only: ripen the watered plot now.
      const plot = target.state.garden.plots[target.state.plotKey];
      plot.state = 'crop';
      plot.stageStartedAt = Date.now();
    }
    executeVerb(target, action);
    engine.setData('gardenTalkStep', action);
    step += 1;
    if (action === stop) engine.setData('gardenTalk', 'done');
    else if (!manual) setTimeout(next, STEP_MS);
    return action;
  };
  if (manual) {
    globalThis.groddleGardenTalk = {
      next: () => {
        const action = next();
        const d = globalThis.document?.querySelector('canvas')?.dataset || {};
        return { action, speech: d.lastSpeech || '', slugs: d.lastSpeechSlugs || '' };
      },
    };
  }

  const wait = setInterval(() => {
    if (!setup()) return;
    clearInterval(wait);
    if (target && !manual) setTimeout(next, 1200);
  }, 400);
}
