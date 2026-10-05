# icanhazux

A browser extension that gives [icanhazchat.com](https://www.icanhazchat.com) rooms a usable cam grid.

It does a few things and tries to do them well. It builds on what
icanhazbetter worked out about the site's internals.

## What it does

- **Fills the window with cams.** Every cam keeps its real shape (4:3, 16:9, portrait phones) and the grid packs them to use the space.
- **Focus a cam.** Hover a cam and click the focus button, or double-click it. It becomes the big feed in the top-left and the others shrink and wrap around it. Do the same again to unfocus.
- **Drag to reorder.** Grab a cam and drop it where you want it. The order is remembered by username.
- **Refresh a cam.** Restarts just that one feed. Use it when a cam freezes or goes black.
- **Hide a cam.** The cam disappears and its stream is stopped, and it stays hidden whenever that user cams up again. Use **Hidden** under the cams to bring them back.
- **Resize cams vs. chat.** Drag the bar between the cams and the chat. Double-click it to reset.
- **The rest of the site matches.** The lobby, profiles, settings, messages, groups and dashboard get the same light and dark themes, accent and fonts as rooms. Their content sits on the same accent-edged cards as the cams and chat. Pages with a sidebar get two cards side by side. Room previews look like cam tiles. A profile's background picture becomes a cover banner.
- **ICHUX Settings in the header.** On every page, the last link in the site header opens the extension's theme (System / Light / Dark) and accent color. Settings that only affect chat stay in the chat bar's ⚙ in rooms.
- **Chat fixes the bigger layout needs.** Stops chat freezing when the log is tall, and stops scrolling chat from stealing focus from other text boxes.

Everything is saved in your browser's local storage for icanhazchat.com. There's no analytics and nothing leaves your browser.

## Install (unpacked)

1. Download or clone this repo.
2. **Chrome / Edge / Opera:** open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and pick the repo folder.
3. **Firefox (128+):** open `about:debugging` → **This Firefox** → **Load Temporary Add-on…** and pick `manifest.json`.

## Layout

```
manifest.json
src/
  core.js    shared helpers (storage, DOM, icons)
  pack.js    layout engine: pure math, unit tested
  shell.js   full-window stage and the cams/chat divider
  cams.js    cam grid: placement, focus, refresh, hide, drag
  page.js    runs in the page's own JS world; wraps two site functions
  site.js    every page: fonts, the shared header and footer
  pages.js   pages outside rooms: page type, cards, re-pointing hard-coded grays
  theme.js   light/dark and accent; lifts too-dark colors in the dark theme
  controls.js  settings controls shared by the chat bar and header panels
  menu.js    ICHUX Settings in the site header
styles/
  icanhazux.css
  pages.css  pages outside rooms
test/
  pack.test.js   layout engine unit tests
  e2e.test.js    browser tests against test/mock (stand-in room and settings pages)
```

No build step. `npm test` runs the unit tests. `npm run test:e2e` runs the browser tests and needs Playwright.

## License

MIT

The layout engine (`src/pack.js`) and the two chat fixes in `src/page.js` are adapted from icanhazbetter, which is MIT-licensed.
