/**
 * The Test Tube compounds a character has discovered (js/test-tube.js, audit rules-a #15). Holds the
 * list in the save and installs it for making.js (setCompoundKnowledge), so every recipe list, the
 * pack's recipe counts and the Craftybot leave an undiscovered compound out.
 *
 * Telling old saves from new characters: the slice carries `stamped`. game.js calls stampOnce after
 * the save loads, with the stored save or null when there was none. A save with no stamped slice was
 * written before this rule, when the remake listed all sixteen from the start, so it keeps all sixteen
 * (Austin: never take away what a save already has). A character with no save starts with none and
 * learns them by experimenting. The stamp never runs twice for a save.
 * Canvas: compoundsKnown (the count), compoundsStamped.
 */
import { setCompoundKnowledge } from '../making.js?v=eddcceac';
import { normalizeKnownCompounds, stampKnownCompounds } from '../test-tube.js?v=2537c05b';

export const COMPOUND_DISCOVERY_FEATURE_ID = 'compound-discovery';

let stamped = false;
let known = [];

function install() {
  // Until the stamp has run every compound counts as known, as before this rule.
  setCompoundKnowledge(() => (stamped ? known : null));
}
install();

function publish(engine) {
  engine?.setData?.('compoundsStamped', stamped ? '1' : '0');
  engine?.setData?.('compoundsKnown', String(known.length));
}

export const compoundDiscoveryFeature = {
  id: COMPOUND_DISCOVERY_FEATURE_ID,

  save() {
    return { stamped, known: [...known] };
  },

  restore(slice) {
    stamped = slice?.stamped === true;
    known = stamped ? normalizeKnownCompounds(slice.known) : [];
    install();
  },

  /** Once per save, ever: a stamp already in the save stands. */
  stampOnce(rawSave, engine) {
    if (!stamped) {
      known = stampKnownCompounds(rawSave);
      stamped = true;
    }
    install();
    publish(engine);
  },

  /** Recipe ids discovered so far (engine.query('knownCompounds')). */
  knownCompounds() {
    return stamped ? known : null;
  },

  /** A discovery (finishMakingUnknown 1274: this.recipes.recipes[match_id] = time()). */
  learnCompound(recipeId, engine) {
    const id = String(recipeId);
    if (!known.includes(id)) known = normalizeKnownCompounds([...known, id]);
    stamped = true;
    install();
    publish(engine);
    return true;
  },
};
