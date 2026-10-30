/**
 * The Classic interface's chrome (classic-spec build-plan §2-§4): each piece installs once, stays
 * mounted, and shows only under <html data-ui="classic"> (css/classic.css), so the interface can
 * switch both ways at runtime. classic-prefs.js installInterfaceSettings() (called once by game.js)
 * installs this, with the game's engine (its view snapshot, sounds and home) and the player's
 * avatar still (game.js ownerPortraitUrl) for the pictures the 2012 chrome showed.
 */
import { installClassicFrame } from './classic-frame.js?v=g468-9';
import { installClassicTopbar } from './classic-topbar.js?v=g468-10';
import { installClassicGrowl } from './classic-growl.js?v=g468-9';
import { installClassicPanes } from './classic-panes.js?v=g468-12';
import { installClassicPack } from './classic-pack.js?v=g468-15';
import { installClassicHub } from './classic-hub.js?v=g468-9';

let installed = null;

export function installClassicChrome({ doc = globalThis.document, win = globalThis, engine = null, avatarPortrait = null } = {}) {
  if (installed) return installed;
  installed = {
    frame: installClassicFrame({ doc, win }),
    topbar: installClassicTopbar({ doc, win, avatarPortrait }),
    growl: installClassicGrowl({ doc, win }),
    panes: installClassicPanes({ doc, win }),
    pack: installClassicPack({ doc }),
    hub: installClassicHub({ doc, win, engine, avatarPortrait }),
  };
  return installed;
}
