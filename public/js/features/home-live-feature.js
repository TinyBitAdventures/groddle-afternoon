/**
 * G944 (M1, M4, M33): the owner's side of a live home. Rules and sources in
 * js/home-live.js.
 *
 * game.js calls onSaved with every save it captures (savePlayerState, once
 * the save changed). This feature prints the parts of it visitors read
 * (homeLivePrints); when a part changed since visitors last read it, it
 * writes the save to the site now (savedThrough: the site judges visitors'
 * acts and draws their view from the stored save) and then names the part to
 * the realtime server (home_refresh "yard" | "home" | "boxes",
 * homes_street.go), which tells everyone at this home to read it again.
 * A run of acts goes out as one refresh: the first after a quiet spell at
 * once, then at most one per HOME_LIVE_WAIT_MS.
 *
 * The visitors' side: features/yard-verbs-mp-feature.js ("yard"),
 * features/neighbours-mp-feature.js ("home": the scene, or its gardens in
 * place), features/home-storage-feature.js ("boxes": the boxes and an open
 * cabinet window).
 *
 * Multiplayer only: in solo onSaved returns at once and nothing is sent.
 *
 * QA: window.groddleHomeLive in multiplayer: state() ({ sent: { yard, home,
 * boxes }, pending, last }).
 */

import { exposeQA } from '../qa-gate.js?v=f4e2cd82';
import { saveStore, savedThrough } from '../save-store.js?v=71f717ea';
import { HOME_LIVE_STACK_PLACES, HOME_LIVE_WAIT_MS, changedHomeKinds, homeLivePrints, homeRefreshFrames } from '../home-live.js?v=9c7abae7';
import { ownGroundRows } from '../ground-stacks.js?v=22792362';

export const HOME_LIVE_FEATURE_ID = 'home-live';

/** The first refresh after a quiet spell waits this long, so the act's own follow-up saves join it. */
const FIRST_WAIT_MS = 300;

/**
 * One owner's publisher. `store` and `now` are swappable for tests.
 * @param {{ store?: object, now?: () => number, timers?: { setTimeout: Function, clearTimeout: Function } }} [opts]
 */
export function createHomeLive({ store = saveStore, now = () => Date.now(), timers = globalThis } = {}) {
  let published = null; // the prints visitors last read (or the first seen)
  let latest = null;
  const pending = new Set();
  let timer = 0;
  let busy = false;
  let lastSentAt = -Infinity;
  const sent = { yard: 0, home: 0, boxes: 0 };
  let last = '';

  function schedule(engine) {
    if (timer || busy || !pending.size) return;
    const wait = Math.max(FIRST_WAIT_MS, lastSentAt + HOME_LIVE_WAIT_MS - now());
    timer = timers.setTimeout(() => {
      timer = 0;
      publish(engine);
    }, wait);
  }

  async function publish(engine) {
    const client = engine?.query?.('realtimeClient');
    // Offline: kept until the next save finds the socket back (visitors read the stored save then).
    if (!pending.size || client?.state !== 'online') return false;
    busy = true;
    const kinds = [...pending];
    pending.clear();
    const prints = latest;
    let ok = false;
    try {
      ok = await savedThrough(store);
    } catch {
      ok = false;
    }
    busy = false;
    if (!ok || client.state !== 'online') {
      for (const k of kinds) pending.add(k);
      last = 'unsaved';
      return false;
    }
    for (const what of homeRefreshFrames(kinds)) {
      client.send('home_refresh', { what });
      sent[what] += 1;
    }
    published = { ...published, ...prints };
    lastSentAt = now();
    last = `sent:${homeRefreshFrames(kinds).join(',')}`;
    // Changes made while the write was out go next.
    for (const k of changedHomeKinds(published, latest)) pending.add(k);
    schedule(engine);
    return true;
  }

  return {
    saved(save, engine) {
      // R50: the owner's own stacks in the house and Tower, as the site shows them to visitors.
      const stacks = engine ? Object.fromEntries(HOME_LIVE_STACK_PLACES.map((k) => [k, ownGroundRows(engine, k)])) : null;
      const prints = homeLivePrints(save, stacks);
      if (!prints.yard) {
        published = null;
        latest = null;
        pending.clear();
        return [];
      }
      latest = prints;
      if (!published) {
        published = prints;
        return [];
      }
      const kinds = changedHomeKinds(published, prints);
      for (const k of kinds) pending.add(k);
      schedule(engine);
      return kinds;
    },
    publish,
    state() {
      return { sent: { ...sent }, pending: [...pending], last };
    },
  };
}

let live = null;

export const homeLiveFeature = {
  id: HOME_LIVE_FEATURE_ID,

  /** game.js savePlayerState: the save it just captured (only when it changed). */
  onSaved(save, engine) {
    if (engine?.mode !== 'multiplayer') return null;
    if (!live) {
      live = createHomeLive();
      exposeQA('groddleHomeLive', live);
    }
    live.saved(save, engine);
    return null;
  },
};
