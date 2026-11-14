/**
 * The Test Tube's experiment screens inside the Make window (Modern and Classic share them; Classic
 * styles them in css/classic.css). The flow is the client's (glitch-client MakingDialog.as):
 *   - "Try to make something new" leads the Test Tube's recipes (MakingRecipeUI.as 59-77);
 *   - the try screen (MakingTryUI.as): up to four slots, one per element, each with a count and
 *     -/+ (MakingSlot.as), "Try it!" once a slot is filled. The original dragged elements from the
 *     pouch; here the pouch's four elements are buttons under the slots (a tap adds one), which
 *     works with a mouse, a keyboard and at phone width;
 *   - the wait: the Test Tube's tool_animation for try_wait, "Trying something new"
 *     (MakingToolAnimator.as 54-70); the window can't go back meanwhile (animateTool 320);
 *   - a discovery: "You discovered X!", the iMG, what was used, the extra line, "Back to recipes"
 *     and "Done" (MakingCompleteUI.as 105-140, MakingDialog.as showComplete 352-392);
 *   - nothing made: the server's message, "Try again?" (MakingErrorUI.as 25) back to empty slots,
 *     and "Pfft, I'm done with the Test Tube" (showError 397-428).
 * The rules are js/test-tube.js. The DOM is the Make window's own (#make-detail, #make-progress,
 * #make-result), so nothing is added to the pages.
 */
import { countItem, ITEM_CATALOG } from './inventory.js?v=f49c8998';
import {
  EXPERIMENT_ELEMENTS,
  EXPERIMENT_PROGRESS_LINE,
  EXPERIMENT_SLOTS,
  EXPERIMENT_SUBTITLE,
  EXPERIMENT_TOOL,
  EXPERIMENT_WAIT_MS,
  addToSlots,
  experimentBlockedLine,
  runExperiment,
  setSlotCount,
  slotMax,
  slotsToInputs,
} from './test-tube.js?v=4447e633';

/** MakingRecipeUI.as 64. */
export const TRY_TILE_LABEL = 'Try to make something new';

/**
 * @param {{
 *   inv: () => object, pc: () => object, learned: () => string[], known: () => string[],
 *   iconUrl: (cls: string) => string, escape: (s: string) => string, toolVisual: () => string,
 *   onStart?: () => void, onResult: (outcome: object) => void, onBack: () => void, onDone: () => void,
 *   rng?: () => number,
 * }} ctx
 */
export function createTestTubePanel(ctx) {
  /** null (closed) | 'try' | 'wait' | 'done' | 'nothing' */
  let view = null;
  let slots = [];
  let elapsed = 0;
  let given = [];
  let outcome = null;
  const esc = ctx.escape;
  const label = (cls) => ITEM_CATALOG[cls]?.label || cls;
  const el = (id) => document.getElementById(id);

  function hide(id) {
    const node = el(id);
    if (node) {
      node.hidden = true;
      node.innerHTML = '';
    }
  }

  function show(id, html) {
    const node = el(id);
    if (!node) return null;
    node.hidden = false;
    node.innerHTML = html;
    return node;
  }

  function setMeta(text) {
    const meta = el('make-meta');
    if (meta) meta.textContent = text;
  }

  function slotHtml(slot, i) {
    const inv = ctx.inv();
    const max = slotMax(slots, i, inv);
    const name = label(slot.cls);
    return `<div class="tt-slot" data-tt-slot="${i}" data-cls="${esc(slot.cls)}">
      <button type="button" class="tt-slot-x" data-tt-remove="${i}" aria-label="Take the ${esc(name)} out">×</button>
      <img src="${ctx.iconUrl(slot.cls)}" alt="" width="40" height="40" />
      <span class="tt-slot-name">${esc(name)}</span>
      <span class="tt-step" role="group" aria-label="How many ${esc(name)}">
        <button type="button" data-tt-dec="${i}" aria-label="One fewer">−</button>
        <input type="number" inputmode="numeric" min="1" max="${max}" value="${slot.n}" data-tt-num="${i}" aria-label="${esc(name)} count" />
        <button type="button" data-tt-inc="${i}" aria-label="One more" ${slot.n >= max ? 'disabled' : ''}>+</button>
      </span>
    </div>`;
  }

  function renderTry() {
    hide('make-progress');
    hide('make-result');
    el('make-list')?.setAttribute('hidden', '');
    const inv = ctx.inv();
    const blocked = experimentBlockedLine(inv, ctx.learned());
    const filled = slots.map(slotHtml).join('');
    const empty = slots.length < EXPERIMENT_SLOTS
      ? `<div class="tt-slot tt-empty" aria-hidden="true"><span>${slots.length ? '+' : 'Pick elements below'}</span></div>`
      : '';
    const pouch = EXPERIMENT_ELEMENTS.map((cls) => {
      const inSlots = slots.filter((s) => s.cls === cls).reduce((n, s) => n + s.n, 0);
      const left = countItem(inv, cls) - inSlots;
      const full = !slots.some((s) => s.cls === cls) && slots.length >= EXPERIMENT_SLOTS;
      return `<button type="button" class="tt-element" data-tt-add="${cls}" ${left <= 0 || full || blocked ? 'disabled' : ''} aria-label="Add a ${esc(label(cls))} (${left} left)">
        <img src="${ctx.iconUrl(cls)}" alt="" width="28" height="28" />
        <span class="tt-element-name">${esc(label(cls))}</span>
        <b class="tt-element-count">${Math.max(0, left)}</b>
      </button>`;
    }).join('');
    const node = show('make-detail', `
      <div class="tt-try" data-tt-view="try">
        <p class="tt-sub">${esc(EXPERIMENT_SUBTITLE)}</p>
        <div class="tt-slots" role="group" aria-label="Test Tube slots">${filled}${empty}</div>
        ${blocked ? `<p class="make-why tt-why" data-make-why>${esc(blocked)}</p>` : ''}
        <button type="button" class="btn-glitch-primary tt-go" data-tt-go ${slots.length && !blocked ? '' : 'disabled'}>Try it!</button>
        <p class="tt-pouch-title">Your pouch</p>
        <div class="tt-pouch" role="group" aria-label="Elements in your pouch">${pouch}</div>
      </div>`);
    if (!node) return;
    node.style.display = 'block';
    node.querySelectorAll('[data-tt-add]').forEach((b) => b.addEventListener('click', () => {
      slots = addToSlots(slots, b.dataset.ttAdd, ctx.inv());
      renderKeepFocus(`[data-tt-add="${b.dataset.ttAdd}"]`);
    }));
    node.querySelectorAll('[data-tt-remove]').forEach((b) => b.addEventListener('click', () => {
      slots = setSlotCount(slots, Number(b.dataset.ttRemove), 0, ctx.inv());
      renderKeepFocus('[data-tt-add]:not(:disabled)');
    }));
    node.querySelectorAll('[data-tt-dec]').forEach((b) => b.addEventListener('click', () => {
      const i = Number(b.dataset.ttDec);
      slots = setSlotCount(slots, i, (slots[i]?.n || 0) - 1, ctx.inv());
      renderKeepFocus(slots[i] ? `[data-tt-dec="${i}"]` : '[data-tt-add]:not(:disabled)');
    }));
    node.querySelectorAll('[data-tt-inc]').forEach((b) => b.addEventListener('click', () => {
      const i = Number(b.dataset.ttInc);
      slots = setSlotCount(slots, i, (slots[i]?.n || 0) + 1, ctx.inv());
      renderKeepFocus(`[data-tt-inc="${i}"]`);
    }));
    node.querySelectorAll('[data-tt-num]').forEach((input) => input.addEventListener('change', () => {
      const i = Number(input.dataset.ttNum);
      slots = setSlotCount(slots, i, Number(input.value) || 0, ctx.inv());
      renderKeepFocus(`[data-tt-num="${i}"]`);
    }));
    node.querySelector('[data-tt-go]')?.addEventListener('click', start);
    setMeta(`${slots.reduce((n, s) => n + s.n, 0)} elements in the tube · energy ${Math.floor(ctx.pc().energy || 0)}`);
  }

  function renderKeepFocus(selector) {
    renderTry();
    document.querySelector(`#make-detail ${selector}`)?.focus({ preventScroll: true });
  }

  function start() {
    const inv = ctx.inv();
    if (experimentBlockedLine(inv, ctx.learned())) return;
    given = slotsToInputs(slots);
    if (!given.length) return;
    view = 'wait';
    elapsed = 0;
    ctx.onStart?.();
    renderWait();
  }

  function renderWait() {
    hide('make-detail');
    hide('make-result');
    const ingredients = given.map(([cls, n]) => `<span class="mp-ingredient"><img src="${ctx.iconUrl(cls)}" alt="" /><b>${n}</b></span>`).join('');
    show('make-progress', `
      <p class="mp-label">${esc(EXPERIMENT_PROGRESS_LINE)}</p>
      <div class="mp-stage" aria-hidden="true">
        <div class="mp-ingredients">${ingredients}</div>
        <div class="mp-tool-wrap"><span class="mp-spark mp-spark-a">✦</span>${ctx.toolVisual()}<span class="mp-spark mp-spark-b">✦</span></div>
        <div class="mp-output-wrap"><span class="mp-arrow">→</span><span class="mp-output-item tt-unknown">?</span></div>
      </div>
      <div class="mp-bar mp-unit-bar" role="progressbar" aria-label="${esc(EXPERIMENT_PROGRESS_LINE)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i data-tt-bar></i></div>`);
    document.querySelector('#make-panel .make-card')?.classList.add('is-crafting');
    setMeta(`Trying ${given.length} ${given.length === 1 ? 'element' : 'elements'} in the Test Tube`);
  }

  function finish() {
    document.querySelector('#make-panel .make-card')?.classList.remove('is-crafting');
    outcome = runExperiment(ctx.inv(), ctx.pc(), given, { known: ctx.known(), learned: ctx.learned(), rng: ctx.rng });
    view = outcome.ok ? 'done' : 'nothing';
    slots = [];
    ctx.onResult(outcome);
    render();
  }

  function renderDone() {
    hide('make-detail');
    hide('make-progress');
    const o = outcome;
    const outCls = o.outputs[0]?.classTsid;
    const used = o.used.map((u) => `<div class="mr-used-item"><img src="${ctx.iconUrl(u.classTsid)}" alt="" /><span>${u.qty}</span><span class="mr-used-left">${u.remain} left</span></div>`).join('');
    const node = show('make-result', `
      <div class="make-detail-icon"><img src="${ctx.iconUrl(outCls)}" alt="" /></div>
      <p class="mr-kicker">New compound</p>
      <p class="mr-headline" data-tt-view="done">You discovered ${esc(o.recipe.name)}!</p>
      <div class="mr-deltas">
        ${o.energy ? `<span class="mr-delta loss">${o.energy} energy</span>` : ''}
        ${o.xp ? `<span class="mr-delta gain">+${o.xp} iMG</span>` : ''}
      </div>
      <p class="mr-used">You used</p>
      <div class="mr-used-list">${used}</div>
      ${o.extraLine ? `<p class="mr-got tt-extra">${esc(o.extraLine)}</p>` : ''}
      <div class="mr-actions">
        <button type="button" class="btn-glitch-back" data-tt-recipes>Back to recipes</button>
        <button type="button" class="btn-glitch-primary" data-tt-done>Done</button>
      </div>`);
    node?.querySelector('[data-tt-recipes]')?.addEventListener('click', back);
    node?.querySelector('[data-tt-done]')?.addEventListener('click', () => ctx.onDone());
    setMeta(`You have discovered ${ctx.known().length} of 16 compounds`);
  }

  function renderNothing() {
    hide('make-detail');
    hide('make-progress');
    const [head, ...rest] = outcome.lines;
    const node = show('make-result', `
      <div class="tt-nothing" data-tt-view="nothing" role="status">
        <p class="tt-error">${esc(head)}</p>
        ${rest.map((line) => `<p class="tt-error-line">${esc(line)}</p>`).join('')}
        <button type="button" class="btn-glitch-primary tt-again" data-tt-again>Try again?</button>
      </div>
      <div class="mr-actions">
        <button type="button" class="btn-glitch-back" data-tt-done>Pfft, I'm done with the Test Tube</button>
      </div>`);
    node?.querySelector('[data-tt-again]')?.addEventListener('click', () => {
      view = 'try';
      render();
      document.querySelector('#make-detail [data-tt-add]:not(:disabled)')?.focus({ preventScroll: true });
    });
    node?.querySelector('[data-tt-done]')?.addEventListener('click', () => ctx.onDone());
    setMeta(`You have discovered ${ctx.known().length} of 16 compounds`);
  }

  function render() {
    if (view === 'try') renderTry();
    else if (view === 'wait') renderWait();
    else if (view === 'done') renderDone();
    else if (view === 'nothing') renderNothing();
  }

  function back() {
    close();
    ctx.onBack();
  }

  function close() {
    if (view === 'wait') document.querySelector('#make-panel .make-card')?.classList.remove('is-crafting');
    view = null;
    slots = [];
    given = [];
    outcome = null;
  }

  return {
    open() {
      view = 'try';
      slots = [];
      render();
    },
    render,
    close,
    back,
    isOpen: () => view != null,
    busy: () => view === 'wait',
    view: () => view,
    /** The game loop's step: the wait runs on game time, like a recipe's. */
    tick(deltaMs) {
      if (view !== 'wait') return;
      elapsed += Math.max(0, Number(deltaMs) || 0);
      const pct = Math.min(100, Math.round((elapsed / EXPERIMENT_WAIT_MS) * 100));
      const bar = document.querySelector('#make-progress [data-tt-bar]');
      if (bar) {
        bar.style.width = `${pct}%`;
        bar.parentElement?.setAttribute('aria-valuenow', String(pct));
      }
      if (elapsed >= EXPERIMENT_WAIT_MS) finish();
    },
  };
}

/** The try tile's spoken line and title, with the verb's tooltip (test_tube.js 283). */
export function tryTileHtml(iconUrl, escape, knownCount) {
  return `<img src="${iconUrl(EXPERIMENT_TOOL)}" alt="" />
      <span class="tile-label">${escape(TRY_TILE_LABEL)}</span>
      <span class="tile-req">You have discovered ${knownCount} of 16 compounds</span>`;
}
