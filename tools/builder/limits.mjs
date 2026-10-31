/**
 * LEVEL BUILDER (spec 8.4, 8.5, 12): the agent interface's limits, as the site enforces them
 * (groddle-afternoon-site src/BuilderKeys.php SCOPES and RATES, src/AdminBuilderAgent.php render
 * parameters); tests/builder-keys.test.js holds the two sides together.
 */
export const SCOPES = Object.freeze(['drafts:read', 'drafts:write', 'assets:write', 'validate', 'render']);
/** Calls a key may make a minute, by kind (art: new art's bytes, for publish); other reads are not limited. */
export const RATES = Object.freeze({ write: 120, render: 20, validate: 60, art: 300 });
export const RENDER = Object.freeze({ scale: [0.05, 1], maxSide: 4096, overlays: Object.freeze(['geometry', 'reach', 'findings', 'arrivals', 'populations', 'grid', 'effects']), views: Object.freeze(['full', 'camera']), seconds: 5 });
