# Store listing kit

Everything to paste into the Chrome Web Store and Firefox Add-ons (AMO)
forms. The packages come from `npm run build` (`dist/`); the images are in
`store/screenshots/` (`node scripts/screenshots.js` rebuilds them).

## Package and images

| | Chrome Web Store | Firefox Add-ons |
|---|---|---|
| Package | `dist/icanhazux-1.0.0-chrome.zip` | `dist/icanhazux-1.0.0-firefox.zip` |
| Icon | `icons/icon-128.png` (taken from the package) | from the package |
| Screenshots | `store/screenshots/1-…` to `5-…` (1280×800) | the same five |
| Small promo tile | `store/screenshots/promo-440x280.png` | not used |

## Name

icanhazux

## Short description

Chrome's summary (132 characters max) and AMO's summary (250 max) can both use:

> Restyles icanhazchat.com: a cam grid you can arrange, a cleaner chat, light and dark themes, and every page to match.

## Full description

> icanhazux gives icanhazchat.com a modern look and a room that fits your window.
>
> CAMS
> • Cams fill the room, each at its real shape, packed to use the space.
> • Focus a cam to make it the big feed, with the rest around it.
> • Drag cams into the order you like; it's remembered.
> • Refresh a single frozen cam, go full screen, or hide a cam (it stays hidden when they cam up again).
> • Drag the divider to give cams or chat more room.
>
> CHAT
> • A chat bar that shows its state: pause and resume, clear, PMs, settings.
> • Chat settings as clear choices: text color and size, line style, timestamps, who can message you, notices, sounds.
> • Colors stay readable in dark mode.
> • Emotimeme autocomplete, and image and video previews right in the chat.
>
> PEOPLE AND PMS
> • A people list you can search, showing who's idle, on cam, a mod or a supporter.
> • PMs docked in the chat, or popped out into a window you can move and resize.
>
> EVERYWHERE
> • Light and dark themes (or follow your system) with eight accent colors.
> • The lobby, profiles, settings, messages, groups and dashboard restyled to match.
> • Theme and accent from the "ichux" link in the site header.
>
> PRIVATE BY DESIGN
> No accounts, no analytics, no tracking. Your settings stay in your browser. The extension runs only on icanhazchat.com and asks for no other permissions.
>
> CREDITS
> icanhazux builds on icanhazbetter by sardistic (github.com/sardistic/icanhazbetter, MIT license), whose cam layout engine and chat fixes are adapted here.
>
> icanhazux is an unofficial extension. It isn't made by or affiliated with icanhazchat.com.
>
> Source code: https://github.com/plewds/icanhazux

## Screenshot captions

1. `1-room.png`: The room fills your window: cams packed at their real shapes, chat alongside.
2. `2-focus.png`: Focus a cam to make it the big feed (light theme).
3. `3-people-and-pms.png`: Search the people list, and pop PMs out into a window you can move.
4. `4-chat-settings.png`: Chat settings as clear choices, with themes and accent colors.
5. `5-lobby-and-settings.png`: Every page restyled to match, with theme and accent in the header.

## Links

- Homepage / source: https://github.com/plewds/icanhazux
- Support: https://github.com/plewds/icanhazux/issues
- Privacy policy: https://github.com/plewds/icanhazux/blob/main/PRIVACY.md

## Categories

- **Chrome:** Social & Communication
- **AMO:** Appearance, and Social & Communication

## Chrome: Privacy practices tab

- **Single purpose:** Improves the layout and appearance of icanhazchat.com: an arrangeable cam grid, a cleaner chat, and light and dark themes across the site.
- **Permission justification, host permission (www.icanhazchat.com):** The extension's scripts and styles run on icanhazchat.com pages to restyle them and rearrange the cam grid and chat. It runs on no other site.
- **Remote code:** No. All code is in the package.
- **Data usage:** Collects none of the listed data types (no personally identifiable information, health, financial, authentication, personal communications, location, web history, user activity or website content is collected or transmitted).
- **Certifications:** tick all three (not sold to third parties; not used or transferred for purposes unrelated to the single purpose; not used for creditworthiness or lending).
- **Privacy policy URL:** https://github.com/plewds/icanhazux/blob/main/PRIVACY.md

## Chrome: mature content

The extension itself contains no mature content, and the listing images don't either. icanhazchat.com, the site it runs on, hosts some rooms marked 18+. If the form asks whether the item contains mature content, the honest answer for the extension is no; mention the site's 18+ rooms in reviewer notes if asked.

## AMO: notes for the reviewer

> icanhazux restyles icanhazchat.com (content scripts only, no other permissions, no remote code, no build step: the submitted files are the source). To try it, open https://www.icanhazchat.com, which shows the restyled lobby without an account; joining a room shows the cam grid and chat. Some rooms on the site are marked 18+; non-adult rooms such as "studyhall" or "yoga" are fine for testing. The project's tests and tooling are at https://github.com/plewds/icanhazux.

- **Source code submission:** not needed. Nothing is minified or generated.
- **License:** MIT.

## Releasing an update

1. Bump `version` in `manifest.json` and `package.json` (for example 1.0.1).
2. `npm test` and `npm run test:e2e`.
3. `npm run build`.
4. Upload the new zip in each store's dashboard. Users get it automatically after review.
