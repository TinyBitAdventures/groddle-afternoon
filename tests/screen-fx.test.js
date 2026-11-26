/**
 * Screen transition helpers (shipped module).
 * Run: node --test tests/screen-fx.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  LOAD_FADE_IN,
  LOAD_FADE_OUT,
  LOAD_HOLD_MS,
  AWARD_FADE_IN,
  AWARD_FADE_OUT,
  AWARD_QA_HOLD_MS,
  NEW_DAY_QA_HOLD_MS,
  wait,
  nextFrame,
  normalizeAwardPages,
  awardRewardTokens,
  runStreetTransition,
  showAwardScreen,
} from '../public/js/screen-fx.js?v=29b5b3e1';

describe('screen-fx timings (LoadingLocationView / BaseScreenView)', () => {
  it('uses the street card windows and the BaseScreenView fades (seconds)', () => {
    // #478: Glitch's own: LoadingLocationView.as 383 fade in .2, TSMainView.as 1766 200 ms after
    // the street is ready, LoadingLocationView.as 389 fade out .5.
    assert.equal(LOAD_FADE_IN, 0.2);
    assert.equal(LOAD_FADE_OUT, 0.5);
    assert.equal(LOAD_HOLD_MS, 200);
    // BaseScreenView.as 33-34: fade_in_secs .4, fade_out_secs .3.
    assert.equal(AWARD_FADE_IN, 0.4);
    assert.equal(AWARD_FADE_OUT, 0.3);
    // Award screens wait for the player; these holds only serve QA auto-close (awardAutoCloseMs).
    assert.equal(AWARD_QA_HOLD_MS, 3800);
    assert.equal(NEW_DAY_QA_HOLD_MS, 4500);
  });

  it('wait resolves after the requested delay', async () => {
    const t0 = Date.now();
    await wait(40);
    assert.ok(Date.now() - t0 >= 35);
  });

  it('runStreetTransition calls onMid between fades when DOM is present', async () => {
    // Minimal DOM stubs (jsdom not required — create elements in memory)
    const { JSDOM } = await import('jsdom').catch(() => ({ JSDOM: null }));
    if (!JSDOM) {
      // Environment without jsdom: still exercise mid callback via null el path
      let mid = false;
      await runStreetTransition(null, {
        toLabel: 'Test Street',
        onMid: async () => {
          mid = true;
        },
      });
      assert.equal(mid, true);
      return;
    }
    const dom = new JSDOM(`<!DOCTYPE html><div id="st" hidden>
      <span data-st-leave></span><span data-st-leave-hub></span>
      <span data-st-enter></span><span data-st-enter-hub></span>
      <i data-st-bar></i><span data-st-status></span>
    </div>`);
    globalThis.document = dom.window.document;
    globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
    const el = dom.window.document.getElementById('st');
    let mid = false;
    await runStreetTransition(el, {
      fromLabel: 'A',
      fromHub: 'Hub A',
      toLabel: 'B',
      toHub: 'Hub B',
      onMid: async () => {
        mid = true;
      },
    });
    assert.equal(mid, true);
    assert.equal(el.querySelector('[data-st-enter]').textContent, 'B');
  });

  it('showAwardScreen no-ops without element', async () => {
    await showAwardScreen(null, { title: 'x' });
  });

  it('normalizes authored quest-completion pages and gives the final page an OK action', () => {
    assert.deepEqual(
      normalizeAwardPages({
        steps: [
          { text: 'Where did he go?', response: 'I dunno.' },
          { text: 'Anything is possible.', response: '' },
        ],
        primaryLabel: 'OK',
      }),
      [
        { text: 'Where did he go?', response: 'I dunno.' },
        { text: 'Anything is possible.', response: 'OK' },
      ]
    );
  });

  it('rejects malformed pages so ordinary awards keep their single OK button', () => {
    assert.deepEqual(normalizeAwardPages({ steps: null }), []);
    assert.deepEqual(normalizeAwardPages({ steps: [{ text: '  ', response: '' }] }), []);
  });

  it('classifies source-style reward pills without changing their authored order', () => {
    assert.deepEqual(
      awardRewardTokens('+500 iMG · +50 Lem favor · +300 currants · +200 mood'),
      [
        { text: '+500 iMG', kind: 'img' },
        { text: '+50 Lem favor', kind: 'favor' },
        { text: '+300 currants', kind: 'currants' },
        { text: '+200 mood', kind: 'mood' },
      ]
    );
  });
});

describe('badge + loading asset maps (local pack)', () => {
  it('maps exist and include priority streets when present on disk', async () => {
    const { readFileSync, existsSync } = await import('node:fs');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const root = join(dirname(fileURLToPath(import.meta.url)), '../public');
    const badgeMapPath = join(root, 'assets/content/badge-icons.json');
    const loadMapPath = join(root, 'assets/content/loading-images.json');
    assert.ok(existsSync(badgeMapPath), 'badge-icons.json');
    assert.ok(existsSync(loadMapPath), 'loading-images.json');
    const badges = JSON.parse(readFileSync(badgeMapPath, 'utf8'));
    const loads = JSON.parse(readFileSync(loadMapPath, 'utf8'));
    assert.ok(typeof badges === 'object');
    assert.ok(typeof loads === 'object');
    // Hechey / Guillermo snaps were priority-fetched from Wayback
    if (loads.GLI2V0UN7RD1T2J?.local) {
      assert.ok(existsSync(join(root, loads.GLI2V0UN7RD1T2J.local)));
    }
    if (loads.GM4109NI2R640?.local) {
      assert.ok(existsSync(join(root, loads.GM4109NI2R640.local)));
    }
    // Any badge entry must point at a real file
    for (const [id, path] of Object.entries(badges).slice(0, 20)) {
      assert.ok(existsSync(join(root, path)), `missing badge file ${id} ${path}`);
    }
  });

  it('ships the original quest book and routes every authored completion through pages', async () => {
    const { readFileSync, existsSync } = await import('node:fs');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const root = join(dirname(fileURLToPath(import.meta.url)), '../public');
    const game = readFileSync(join(root, 'game.js'), 'utf8');
    assert.ok(existsSync(join(root, 'assets/ui/quest-book.webp')));
    assert.match(
      game,
      /const completionPages = parseQuestConversation\(update\.def\.completion\)/
    );
    assert.match(game, /steps: completionPages/);
    assert.doesNotMatch(game, /const phantomCompletion/);
    assert.match(game, /onDismiss: \(\) => leaveFourLetterQuest\(\{ abandon: false \}\)/);
    assert.match(game, /onDismiss: \(\) => leaveLegalizeIt\(\{ abandon: false \}\)/);
    assert.match(game, /onDismiss: \(\) => returnFromRookWoods\(\)/);
    assert.match(game, /onDismiss: \(\) => returnFromRookMuseum\(\)/);
    assert.match(game, /onDismiss: \(\) => returnFromDeEmbiggenify\(\)/);
  });
});

describe('award card text', () => {
  it('drops GSJS item links and tags but keeps the words', async () => {
    const { awardText, normalizeAwardPages } = await import('../public/js/screen-fx.js?v=29b5b3e1');
    assert.equal(
      awardText('Give 6 <a href="event:item|npc_piggy">Piggies</a> the pleasuring of a lifetime. By petting them, of course.'),
      'Give 6 Piggies the pleasuring of a lifetime. By petting them, of course.',
    );
    assert.equal(awardText('<b>Bold</b> &amp; brave<br>next &quot;line&quot;'), 'Bold & brave\nnext "line"');
    assert.equal(awardText(undefined), '');
    assert.equal(normalizeAwardPages({ steps: [{ text: 'A <a href="event:item|apple">Apple</a>' }] })[0].text, 'A Apple');
  });
});

import { LOAD_STATUS, loadStatusLabel, loadingSplit, cssColor } from '../public/js/screen-fx.js?v=29b5b3e1';

describe('loading card status and hub split (LoadingLocationView.as)', () => {
  it('uses the client status labels with the TimerBar percent', () => {
    assert.equal(LOAD_STATUS.loading, 'loading...');
    assert.equal(LOAD_STATUS.preparing, 'preparing...');
    assert.equal(LOAD_STATUS.splines, 'reticulating splines...');
    assert.equal(loadStatusLabel(LOAD_STATUS.splines, 39), 'reticulating splines... 39%');
    assert.equal(loadStatusLabel(LOAD_STATUS.splines, 0), 'reticulating splines...');
  });

  it('splits only when the hub changes; Leaving needs different colours', () => {
    assert.deepEqual(loadingSplit({ fromHub: 'Kajuu', toHub: 'Kajuu' }).split, false);
    assert.deepEqual(loadingSplit({ fromHub: 'Kajuu', toHub: 'The Seams', fromTop: 0x7b8c6d, toTop: 0x8aa0a0 }),
      { split: true, leaving: true, welcome: true });
    assert.equal(loadingSplit({ fromHub: 'A', toHub: 'B', fromTop: '#111', toTop: '#111', fromBottom: '#222', toBottom: '#222' }).leaving, false);
    assert.equal(cssColor(0x0a0b0c), '#0a0b0c');
    assert.equal(cssColor('', '#fff'), '#fff');
  });
});

describe('loading card without a picture', () => {
  it('drops the empty picture box and lets the title stand on its own', async () => {
    const { readFileSync } = await import('node:fs');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const pub = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
    const fx = readFileSync(join(pub, 'js/screen-fx.js'), 'utf8');
    // With a picture, "Entering" sits 42 px over its foot (LoadingLocationView.as 589); without one, no box.
    assert.match(fx, /snapWrap\.hidden = true;\n\s+card\?\.classList\.add\('no-snap'\);/);
    assert.match(fx, /snap\.onerror = noPicture;/);
    const css = readFileSync(join(pub, 'style.css'), 'utf8');
    assert.match(css, /\.st-title \{\n  position: relative;\n  margin-top: -42px;/);
    assert.match(css, /\.st-card\.no-snap \.st-title \{ margin-top: 0; \}/);
  });
});

import {
  POL_LAYOUT,
  POL_OWNER_SIZE,
  POL_TYPES,
  nameApostrophe,
  polCardLayout,
  polCardTitle,
  polFeaturesLine,
  polGradient,
  polNeighbours,
  polVisitLine,
} from '../public/js/screen-fx.js?v=29b5b3e1';

describe('home loading card (G249, LoadingLocationPOLView.as)', () => {
  it('names the place as setText does (215-235)', () => {
    assert.deepEqual(POL_TYPES, ['interior', 'exterior', 'tower']);
    assert.deepEqual(polCardTitle({ type: 'exterior' }), { entering: 'Entering', name: 'Your', street: 'Home Street' });
    assert.equal(polCardTitle({ type: 'interior' }).street, 'House');
    assert.equal(polCardTitle({ type: 'tower' }).street, 'Tower');
    assert.deepEqual(polCardTitle({ type: 'exterior', ownerName: 'Dorrit Applewhistle' }),
      { entering: 'Entering', name: 'Dorrit Applewhistle’s', street: 'Home Street' });
    // A custom name takes the name's place; a Tower keeps whose it is in brackets.
    assert.deepEqual(polCardTitle({ type: 'tower', customName: 'The Spire' }), { entering: 'Entering', name: 'The Spire', street: '(Your Tower)' });
    assert.equal(polCardTitle({ type: 'tower', ownerName: 'Bob', customName: 'Bobhenge' }).street, '(Bob’s Tower)');
    assert.equal(polCardTitle({ type: 'street' }), null);
    // StringUtil.nameApostrophe 586: always ’s, even after an s.
    assert.equal(nameApostrophe('Jess'), 'Jess’s');
    assert.equal(nameApostrophe(''), '');
  });

  it('writes the last-here box as setDetails does (282-310)', () => {
    assert.equal(polVisitLine({ firstVisit: true }), '<b>First time here!</b>');
    assert.equal(polVisitLine({ visitCount: 3, lastVisitMins: 90 }), 'Last here <b>1 hour 30 mins ago</b> &#8212; this is your 4th visit');
    // No time known: "just moments ago".
    assert.equal(polVisitLine({ visitCount: 1, lastVisitMins: 0 }), 'Last here <b>just moments ago</b> &#8212; this is your 2nd visit');
    // Two parts under ten days, one past it (max_to_show 2 or 1, "~" when trimmed).
    assert.equal(polVisitLine({ visitCount: 1, lastVisitMins: 1440 + 61 }), 'Last here <b>~1 day 1 hour ago</b> &#8212; this is your 2nd visit');
    assert.equal(polVisitLine({ visitCount: 21, lastVisitMins: 1440 * 12 + 300 }), 'Last here <b>~12 days ago</b> &#8212; this is your 22nd visit');
    assert.equal(polVisitLine({ visitCount: 0, lastVisitMins: 5 }), 'Last here <b>5 mins ago</b>');
  });

  it('shows only the first feature and up to five neighbour faces outside', () => {
    assert.equal(polFeaturesLine(['A <b>Magic Rock</b>.', 'Plus <b>2 Piggies</b>']), 'Features: A <b>Magic Rock</b>.');
    assert.equal(polFeaturesLine([]), '');
    const six = Array.from({ length: 6 }, (_, i) => ({ name: `N${i}`, faceUrl: `f${i}.png` }));
    assert.equal(polNeighbours('exterior', six).length, POL_LAYOUT.maxNeighbours);
    assert.deepEqual(polNeighbours('exterior', [{ name: 'Dorrit' }]), []);
    assert.deepEqual(polNeighbours('interior', six), []);
  });

  it('lays the card out with the client offsets (refresh 147-187, setAvatar 337-347)', () => {
    const house = polCardLayout('interior');
    assert.equal(house.textX, 290);
    assert.equal(house.allWidth, 290 + 326);
    assert.deepEqual(house.owner, { x: -20, y: 15 });
    assert.equal(house.door.src, 'assets/sprites/loading/enter_home_door.webp');
    assert.equal(house.enterY, 50);
    assert.equal(house.featuresPad, 20);
    assert.equal(house.artHeight, 380);
    const tower = polCardLayout('tower');
    assert.deepEqual([tower.door.x, tower.door.y], [-105, -10]);
    assert.equal(tower.door.src, 'assets/sprites/loading/enter_tower_door.webp');
    const street = polCardLayout('exterior');
    assert.equal(street.textX, 135);
    assert.equal(street.door, null);
    assert.deepEqual(street.owner, { x: -40, y: -20 });
    assert.equal(street.artHeight, -20 + POL_OWNER_SIZE.h);
    assert.equal(polCardLayout('street'), null);
    // The 200 px radial fill sits 30 px right of the holder's left edge.
    assert.equal(polGradient(street), 'radial-gradient(circle 200px at calc(50% - 201px) 50%, #d5ede1 35.3%, #adccbd 100%)');
  });

  it('ships the two door pictures and reads the card from the game', async () => {
    const { existsSync, readFileSync } = await import('node:fs');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const pub = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
    assert.ok(existsSync(join(pub, 'assets/sprites/loading/enter_home_door.webp')));
    assert.ok(existsSync(join(pub, 'assets/sprites/loading/enter_tower_door.webp')));
    const game = readFileSync(join(pub, 'game.js'), 'utf8');
    assert.match(game, /pol: \{ type: homeState\.room === 'interior' \? 'interior' : 'exterior' \}/);
    assert.match(game, /pol: \{ type: room === 'interior' \? 'interior' : 'exterior' \}/);
    // R46: the home card's trip runs under engine.enter's failure contract (enterResult).
    assert.match(game, /enterResult\(\(\) => \(opts\.pol \? showLocationTransition\(\{ pol: opts\.pol, load \}\) : load\(\)\),/);
    const tower = readFileSync(join(pub, 'js/features/home-tower-feature.js'), 'utf8');
    assert.match(tower, /pol: \{ type: 'tower', customName: tower\.name \|\| ''/);
    assert.match(tower, /engine\.enter\(HOME_STREET_TSID, \{ pol: \{ type: 'exterior' \} \}\)/);
  });
});

describe('home loading card on a narrow screen', () => {
  it('scales the holder and the fill to fit with 16 px gutters', async () => {
    const { polCardScale } = await import('../public/js/screen-fx.js?v=29b5b3e1');
    const house = polCardLayout('interior');
    assert.equal(polCardScale(house, 1280), 1);
    assert.equal(polCardScale(house, 390), (390 - 32) / 616);
    assert.equal(polCardScale(house, 0), 1);
    assert.equal(polGradient(house, 0.5), 'radial-gradient(circle 100px at calc(50% - 139px) 50%, #d5ede1 35.3%, #adccbd 100%)');
  });
});

import { LOAD_LIST_MAX_MS, LOAD_LIST_MIN_MS, loadCardHoldMs, loadListReadMs } from '../public/js/screen-fx.js?v=29b5b3e1';

describe('#478 the loading card holds its Home to: list (G993, invention loading-card-min-hold)', () => {
  const list = (n) => `<b>Home to:</b><ul>${Array.from({ length: n }, (_, i) => `<li>${i + 2} Piggies</li>`).join('')}</ul>`;

  it('a list wants 300 ms a word, at least 1 s, at most 4 s on screen; no list keeps Glitch hold', () => {
    // Austin 2026-11-19: cut from 2.5 s to 10 s.
    assert.equal(LOAD_LIST_MIN_MS, 1000);
    assert.equal(LOAD_LIST_MAX_MS, 4000);
    assert.equal(loadListReadMs(''), 0);
    assert.equal(loadListReadMs('<b>Home to:</b><ul><li>Vendor</li></ul>'), 1000);
    assert.equal(loadListReadMs('<b>Home to:</b><ul><li>A Shrine to Mab</li></ul>'), 6 * 300);
    assert.equal(loadListReadMs(list(4)), 10 * 300);
    assert.equal(loadListReadMs(list(12)), 4000);
    assert.equal(loadCardHoldMs(''), LOAD_HOLD_MS);
    assert.equal(loadCardHoldMs('', 0), 0);
    assert.equal(loadCardHoldMs(list(12)), 4000);
    // The caller's own longer hold still wins.
    assert.equal(loadCardHoldMs('<b>Home to:</b><ul><li>Vendor</li></ul>', 6000), 6000);
  });

  it('the time the list was already up counts against the hold, never under Glitch 200 ms', () => {
    assert.equal(loadCardHoldMs(list(12), LOAD_HOLD_MS, 2500), 1500);
    assert.equal(loadCardHoldMs(list(12), LOAD_HOLD_MS, 3900), LOAD_HOLD_MS);
    assert.equal(loadCardHoldMs(list(12), LOAD_HOLD_MS, 9000), LOAD_HOLD_MS);
    assert.equal(loadCardHoldMs(list(4), LOAD_HOLD_MS, 1000), 2000);
  });

  describe('on the card', () => {
    const saved = {};
    const setUp = () => {
      saved.document = globalThis.document;
      saved.raf = globalThis.requestAnimationFrame;
      saved.window = globalThis.window;
      globalThis.document = { documentElement: Object.assign(new EventTarget(), { dataset: {} }) };
      globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
      globalThis.window = new EventTarget();
    };
    const tearDown = () => {
      globalThis.document = saved.document;
      globalThis.requestAnimationFrame = saved.raf;
      globalThis.window = saved.window;
    };
    const card = () => {
      // A page's textContent: the list's words without its tags (the card reads textContent, G955).
      const home = { innerHTML: '', hidden: true, get textContent() { return this.innerHTML.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(); } };
      const el = Object.assign(new EventTarget(), {
        dataset: {},
        style: {},
        hidden: true,
        setAttribute() {},
        querySelector: (sel) => (sel === '[data-st-home]' ? home : null),
        classList: {
          add: (c) => {
            if (c === 'is-visible') el.fadeInAt = Date.now();
          },
          remove: (c) => {
            if (c === 'is-visible') el.fadeOutAt = Date.now();
          },
        },
      });
      el.home = home;
      return el;
    };
    const key = (k, repeat = false) => Object.assign(new Event('keydown'), { key: k, repeat });

    it('shows the list from the street data as the card fades in, and counts that time (fails before 2026-11-19)', async () => {
      setUp();
      try {
        const el = card();
        let atLoad = null;
        const t0 = Date.now();
        await runStreetTransition(el, {
          toLabel: 'Test Street',
          early: () => ({ features: ['A Shrine to Mab', 'A Street Spirit'] }),
          onMid: async () => {
            // The list is up before the street loads, as Glitch's card had it from the start.
            atLoad = { hidden: el.home.hidden, text: el.home.textContent };
            await wait(1200);
          },
          details: () => ({ features: ['A Shrine to Mab', 'A Street Spirit'] }),
        });
        assert.deepEqual(atLoad, { hidden: false, text: 'Home to: A Shrine to Mab A Street Spirit' });
        assert.equal(el.dataset.stHomeToEarly, 'A Shrine to Mab | A Street Spirit');
        // 9 words: 2.7 s in all, 1.4 s of it already up (fade-in and load): about 1.3 s more.
        const hold = Number(el.dataset.stHoldMs);
        assert.ok(hold >= LOAD_HOLD_MS && hold < 1600, `hold ${hold}`);
        const listMs = Number(el.dataset.stListMs);
        assert.ok(listMs >= 2650 && listMs < 3100, `list up ${listMs} ms`);
        assert.ok(el.fadeOutAt - t0 < 3200, `fade-out ${el.fadeOutAt - t0} ms after the start`);
      } finally {
        tearDown();
      }
    });

    it('a long list is up 4 s at most, then the card fades', async () => {
      setUp();
      try {
        const el = card();
        const features = Array.from({ length: 12 }, (_, i) => `${i + 2} Piggies`);
        await runStreetTransition(el, { toLabel: 'Test Street', early: () => ({ features }), details: () => ({ features }) });
        const listMs = Number(el.dataset.stListMs);
        assert.ok(listMs >= 3950 && listMs <= 4150, `list up ${listMs} ms`);
      } finally {
        tearDown();
      }
    });

    it('the built street list replaces the early one where they differ; with none it keeps Glitch pace', async () => {
      setUp();
      try {
        const el = card();
        await runStreetTransition(el, {
          toLabel: 'Test Street',
          early: () => ({ features: ['A Shrine to Mab'] }),
          details: () => ({ features: ['A Shrine to Mab', 'Plus <b>2 Piggies</b>.'] }),
        });
        assert.equal(el.dataset.stHomeTo, 'A Shrine to Mab | Plus 2 Piggies.');
        assert.match(el.home.innerHTML, /2 Piggies/);

        const bare = card();
        let readyAt = 0;
        await runStreetTransition(bare, {
          toLabel: 'Test Street',
          early: () => ({ features: [] }),
          details: () => {
            readyAt = Date.now();
            return { features: [] };
          },
        });
        assert.equal(bare.home.hidden, true);
        assert.equal(bare.dataset.stHoldMs, String(LOAD_HOLD_MS));
        assert.ok(bare.fadeOutAt - readyAt < 1000);
      } finally {
        tearDown();
      }
    });

    it('a key or a click ends the hold; a held key repeating or a lone Shift does not', async () => {
      setUp();
      try {
        const features = Array.from({ length: 12 }, (_, i) => `${i + 2} Piggies`);
        const el = card();
        let readyAt = 0;
        const going = runStreetTransition(el, {
          toLabel: 'Test Street',
          early: () => ({ features }),
          details: () => {
            readyAt = Date.now();
            return { features };
          },
        });
        await wait(600);
        globalThis.window.dispatchEvent(key('ArrowRight', true));
        globalThis.window.dispatchEvent(key('Shift'));
        await wait(300);
        assert.equal(el.dataset.stHoldSkipped, undefined, 'a repeat or Shift skipped');
        globalThis.window.dispatchEvent(key('ArrowRight'));
        await going;
        assert.equal(el.dataset.stHoldSkipped, '1');
        assert.ok(el.fadeOutAt - readyAt < 1300, `fade-out ${el.fadeOutAt - readyAt} ms after ready`);

        const clicked = card();
        const going2 = runStreetTransition(clicked, { toLabel: 'Test Street', early: () => ({ features }), details: () => ({ features }) });
        await wait(600);
        clicked.dispatchEvent(new Event('pointerdown'));
        const t = Date.now();
        await going2;
        assert.equal(clicked.dataset.stHoldSkipped, '1');
        assert.ok(clicked.fadeOutAt - t < 200, 'the click ended the hold');
      } finally {
        tearDown();
      }
    });
  });
});
