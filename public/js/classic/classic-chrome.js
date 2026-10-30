/**
 * The Classic interface's chrome (classic-spec build-plan §2-§4): each piece installs once, stays
 * mounted, and shows only under <html data-ui="classic"> (css/classic.css), so the interface can
 * switch both ways at runtime. classic-prefs.js installInterfaceSettings() (called once by game.js)
 * installs this.
 */
import { installClassicFrame } from './classic-frame.js?v=g468-2';

let installed = null;

export function installClassicChrome({ doc = globalThis.document, win = globalThis } = {}) {
  if (installed) return installed;
  installed = {
    frame: installClassicFrame({ doc, win }),
  };
  return installed;
}
