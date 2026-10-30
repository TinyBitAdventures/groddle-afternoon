/**
 * The Classic interface's chrome (classic-spec build-plan §2-§4): each piece installs once, stays
 * mounted, and shows only under <html data-ui="classic"> (css/classic.css), so the interface can
 * switch both ways at runtime. classic-prefs.js installInterfaceSettings() (called once by game.js)
 * installs this.
 */
import { installClassicFrame } from './classic-frame.js?v=g468-2';
import { installClassicTopbar } from './classic-topbar.js?v=g468-3';
import { installClassicGrowl } from './classic-growl.js?v=g468-4';
import { installClassicHub } from './classic-hub.js?v=g468-8';

let installed = null;

export function installClassicChrome({ doc = globalThis.document, win = globalThis } = {}) {
  if (installed) return installed;
  installed = {
    frame: installClassicFrame({ doc, win }),
    topbar: installClassicTopbar({ doc, win }),
    growl: installClassicGrowl({ doc, win }),
    hub: installClassicHub({ doc, win }),
  };
  return installed;
}
