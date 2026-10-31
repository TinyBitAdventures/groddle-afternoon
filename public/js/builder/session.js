/**
 * LEVEL BUILDER (spec 6.6): one open draft in the editor. Undo and redo over op groups (a drag is
 * one group), the pending ops autosaved as a batch every SAVE_MS with If-Match, and what happens
 * when someone else (another tab, an agent) wrote first:
 *
 * - 409 builder_rev_conflict: fetch the draft at its new rev and re-apply the unsent ops on top.
 *   If they still apply, send them again; if not (a deco they touch is gone), keep them as the
 *   stash (`stash`, re-applicable later with applyStash) and show the draft as it is now.
 *   Either way the undo history is cleared: its inverses were made against the old rev.
 * - poll(): while nothing is pending, ask for the draft with If-None-Match; a newer rev (an
 *   agent's edit) replaces the zone and clears the history.
 *
 * The api is injected ({ ops(id, rev, ops, note), draft(id, { etag }) }), so tests drive it.
 */
import { applyOps } from './ops.js?v=28c0d569';

export const SAVE_MS = 2000;
export const POLL_MS = 5000;

const clone = (v) => JSON.parse(JSON.stringify(v));

export class DraftSession {
  /**
   * @param {object} zone the draft as fetched (its `rev` is the store's)
   * @param {{ api: object, onChange?: (e: { kind: string, changed?: string[], status?: string }) => void }} opts
   */
  constructor(zone, { api, onChange = () => {} } = {}) {
    this.zone = zone;
    this.rev = zone.rev | 0;
    this.api = api;
    this.onChange = onChange;
    this.undoStack = [];
    this.redoStack = [];
    this.pending = [];
    this.stash = [];
    this.inflight = null;
    this.status = 'saved';
    this.error = '';
  }

  get id() { return this.zone.id; }
  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }

  setStatus(status, error = '') {
    this.status = status;
    this.error = error;
    this.onChange({ kind: 'status', status });
  }

  /** Apply a group of ops locally (one undo step unless history is false) and queue them. */
  apply(ops, { label = '', history = true } = {}) {
    if (!ops.length) return [];
    const { inverses, changed } = applyOps(this.zone, ops);
    if (history) {
      this.undoStack.push({ ops: clone(ops), inverses, label });
      this.redoStack.length = 0;
    }
    this.pending.push(...clone(ops));
    this.setStatus('unsaved');
    this.onChange({ kind: 'apply', changed });
    return changed;
  }

  undo() {
    const group = this.undoStack.pop();
    if (!group) return null;
    const { changed } = applyOps(this.zone, group.inverses);
    this.redoStack.push(group);
    this.pending.push(...clone(group.inverses));
    this.setStatus('unsaved');
    this.onChange({ kind: 'undo', changed });
    return group;
  }

  redo() {
    const group = this.redoStack.pop();
    if (!group) return null;
    const { inverses, changed } = applyOps(this.zone, group.ops);
    this.undoStack.push({ ...group, inverses });
    this.pending.push(...clone(group.ops));
    this.setStatus('unsaved');
    this.onChange({ kind: 'redo', changed });
    return group;
  }

  /** Send the pending ops (one batch). Resolves when saved, rebased, or stashed. */
  async flush(note = '') {
    if (this.inflight) return this.inflight;
    if (!this.pending.length) return null;
    const batch = this.pending.splice(0);
    this.setStatus('saving');
    this.inflight = (async () => {
      try {
        const r = await this.api.ops(this.id, this.rev, batch, note);
        this.rev = r.rev;
        this.zone.rev = r.rev;
        this.setStatus(this.pending.length ? 'unsaved' : 'saved');
        return r;
      } catch (err) {
        if (err?.code === 'builder_rev_conflict') return this.rebase(batch);
        // Refused for good (an op the store will not take): keep it aside, show the stored draft.
        if (err?.status === 422 || err?.status === 413) return this.reload([...batch, ...this.pending.splice(0)], err);
        this.pending.unshift(...batch);
        this.setStatus('offline', err?.message || 'Not saved yet.');
        return null;
      } finally {
        this.inflight = null;
      }
    })();
    return this.inflight;
  }

  /** Someone wrote first: re-apply our unsent ops over the current rev, or stash them. */
  async rebase(batch) {
    const fresh = await this.api.draft(this.id);
    const mine = [...batch, ...this.pending.splice(0)];
    const next = clone(fresh.zone);
    try {
      applyOps(next, mine);
    } catch {
      this.stash = mine;
      this.replace(fresh.zone, fresh.rev);
      this.setStatus('conflict', 'Someone else changed this draft. Your last changes no longer fit; they are kept aside.');
      this.onChange({ kind: 'conflict', changed: [] });
      return null;
    }
    this.replace(next, fresh.rev);
    this.pending = mine;
    this.onChange({ kind: 'rebased', changed: [] });
    return this.flush();
  }

  async reload(stash, err) {
    this.stash = stash;
    const fresh = await this.api.draft(this.id);
    this.replace(fresh.zone, fresh.rev);
    this.setStatus('conflict', err?.message || 'The site did not take your last changes; they are kept aside.');
    this.onChange({ kind: 'conflict', changed: [] });
    return null;
  }

  replace(zone, rev) {
    this.zone = zone;
    this.zone.rev = rev;
    this.rev = rev;
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }

  /** Re-apply the stash as a new undo step (it throws when it still does not fit). */
  applyStash() {
    const ops = this.stash;
    if (!ops.length) return [];
    const changed = this.apply(ops, { label: 'stash' });
    this.stash = [];
    return changed;
  }

  /** An agent's edit or another tab's: fetch when the rev moved and nothing local is pending. */
  async poll() {
    if (this.pending.length || this.inflight) return false;
    const fresh = await this.api.draft(this.id, { etag: this.rev });
    if (!fresh || fresh.rev === this.rev || this.pending.length || this.inflight) return false;
    this.replace(fresh.zone, fresh.rev);
    this.onChange({ kind: 'remote', changed: [] });
    this.setStatus('saved');
    return true;
  }
}

/** PURE: the status line's words. */
export function statusWords(session) {
  const rev = `rev ${session.rev}`;
  switch (session.status) {
    case 'saved': return `${rev} · saved`;
    case 'unsaved': return `${rev} · unsaved changes`;
    case 'saving': return `${rev} · saving`;
    case 'offline': return `${rev} · not saved: ${session.error || 'the site did not answer'}`;
    case 'conflict': return `${rev} · ${session.error}`;
    default: return rev;
  }
}
