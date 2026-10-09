# icanhazux

A browser extension that seeks to add a more modernized experience to [icanhazchat.com](https://www.icanhazchat.com) without necessarily overhauling the core layout. You get a more intuitive settings menu, a cam grid you can arrange, a cleaner chat, light and dark themes, and the rest of the site restyled to match.

icanhazux builds on [icanhazbetter](https://github.com/sardistic/icanhazbetter) by sardistic, which worked out much of the site's internals and whose cam layout engine and chat fixes are adapted here. See [Credits](#credits).

icanhazux is unofficial: it isn't made by or affiliated with icanhazchat.com.

## Features

### Rooms

**Cams**

- **Fill the window.** Cams take the whole left side of the room. Each keeps its real shape (4:3, 16:9, portrait phones), and the grid packs them to provide the biggest cams possible.
- **Focus a cam.** Hover a cam and click the focus button, or double-click it. It becomes the big feed in the top-left, with the others wrapped around it. Do the same again to unfocus.
- **Drag to reorder.** Grab a cam and drop it where you want it. The order is remembered by username.
- **Frozen and black cams fix themselves.** When a cam's video freezes, never starts, or comes through as solid black, it's refreshed for you, up to three tries, spaced out over a few minutes. Nothing is checked while the tab is in the background. On by default; switch it off in the chat bar's ⚙.
- **Open their profile.** The person button in a cam's hover controls opens the site's profile popup for whoever's on that cam.
- **Sharper big cams** (optional, in the chat bar's ⚙). The focused and full-screen cams get crisper scaling and very light sharpening on your graphics card, instead of the browser's soft enlargement. It sharpens what's there; it doesn't invent detail. Off by default, and only available where the browser has graphics acceleration.
- **Hide a cam.** The cam disappears and its stream stops, and it stays hidden when that person cams up again. **Hidden** under the cams lists who you've hidden and brings them back. Nicknames can change hands, so a hidden nickname stays hidden only for your visit, unless you mark it as someone's regular nick.
- **Resize cams vs. chat.** Drag the bar between them. Double-click it to reset. Shrinking the window squeezes the split to fit; widening it again brings back the split you chose.
- **Refresh all and Hide cams** sit under the cams as buttons. After the idle timeout, Refresh all brings the cams back.

**Chat**

- **A chat bar that shows its state.** Pause and resume (with a count of new lines while paused), clear, your PMs, and settings, in place of the site's row of icons.
- **Chat settings as real choices with clear selections:** your text color, text size, line style, chat colors, timestamps, who can PM or whisper you, join and leave notices, sounds, and emotimemes.
- **Timestamps.** None, relative ("37s ago"), or absolute ("04:20", kept when you copy the log).
- **Chat colors.** Each person's color on their whole message, as the site does, or on their name only.
- **Readable in dark mode.** Chat colors too dark to read on the dark theme are lightened just enough, keeping their hue.
- **Emotimeme autocomplete.** Type `:` and a few letters to pick from the room's emotimemes.
- **Inline previews.** Image and video links open a small preview under the message on click, instead of a popup window. Nothing loads until you click. Links that can't be previewed, like Tenor's short links, open as plain links.

**People and PMs**

- **People drawer.** Under the chat: everyone in the room as a list, with who's idle, on cam, a mod or a site supporter. Search it, or show only who's on cam. Click a name for their profile, as before. Whisper, chat or open a PM from there and the drawer closes so you're back in the conversation.
- **PMs docked or floating.** Private messages open at the top of the chat; drag the bar under them to resize. Or pop them out (the button at the end of the PM tabs, or **PM window** in the chat bar's ⚙) into a window you can move by its tabs, resize from the corner and park anywhere over the room. Drop it on the top of the chat to dock it again. It's remembered, and on narrow windows the PMs stay docked.
- **Closed, not lost.** Closing a PM tab hides it instead of disappearing the conversation; reopen it from **Closed** on the chat bar.
- **Keep PMs** (optional, in the chat bar's ⚙). Your PM conversations survive a reload, open or closed as you left them. In a later visit they wait in **Closed** on the chat bar instead of all opening at once: pick one to carry on, or it opens when that person messages you, with your earlier messages above the new one. Kept in your browser for 7 days, up to 30 conversations. Nicknames can pass to someone else, so a conversation with a nickname is kept only until you close the tab. Off by default; turning it off deletes what was saved.

**Broadcasting**

- **The camera you pick is the one you get.** The site's camera list could quietly open your default camera instead, especially in Firefox. Virtual cameras like OBS's now work too.
- **Your camera is remembered.** Pick one once and Broadcast opens it from then on, without waking up your built-in camera first.
- **Smoother video, especially in Firefox.** The site asked your camera itself to run at 5–8 frames a second, which on a Mac slows the camera for every app using it. The camera now runs at its normal speed, and the broadcast is held to the site's frame rate as it's sent, so it uses no more bandwidth.

**Mod tools** (room mods and owners only)

- **Cam time** and **last chat** on each cam: how long someone's been on cam, and how long since they last said something.

### Across the site

- **Light and dark themes.** Follows your system setting, or pick one, plus eight accent colors.
- **Three fonts.** Friendly (Nunito), Modern (Atkinson Hyperlegible Next, designed for low-vision readers) or Tech (Oxanium), for headings, buttons and names. Chat text stays easy to read in Source Sans 3. In the chat bar's ⚙ or the **ichux** menu.
- **Every page restyled.** The lobby, profiles, settings, messages, groups and dashboard use the same themes, fonts and accent-edged cards as rooms. A profile's background picture becomes a cover banner. The room emotimemes page becomes a searchable grid.
- **Settings in the header.** The **ichux** link (after an accent bar, at the end of the site header's links) opens theme, accent and font on any page. Chat settings stay on the chat bar in rooms.
- **Works in a narrow window.** Under about 760px wide, the header's links fold into a ☰ menu (with a dot when you have new messages), and the settings panels fit the window.

## Privacy

Your settings, hidden cams and cam order are kept in your browser's storage for icanhazchat.com, and so are your PM conversations if you turn on **Keep PMs**. There are no analytics, and the extension talks to no one but icanhazchat.com, the way the site's own pages do.

One request worth knowing about: when you hide a cam (or, with **Keep PMs** on, first PM someone), the extension opens that person's profile, as you would, to see whether the name is a nickname. Image and video previews load from the link's host, only when you click them.

The full policy is in [PRIVACY.md](PRIVACY.md).

## Respecting site ownership

There are no features here that put a deeper bandwidth burden on the site. Cams still timeout if you're idle (a change from icanhazbetter), nothing is changed as far as the quality of broadcast streams. This extension is intended to improve the end-user experience, not put further stress on ICHC's servers.

## Install

- **Firefox (140+):** [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/icanhazux/)
- **Chrome, Edge, Brave and other Chromium browsers:** [Chrome Web Store](https://chromewebstore.google.com/detail/icanhazux/fkoahgkihpghdikhhndcaopmoifngbbh)

Updates install automatically from either store.

If you used icanhazbetter, your hidden-cam list carries over the first time icanhazux runs.

### From source

Build the packages with `npm run build`. It writes two zips to `dist/`, one per browser:

- **Firefox:** `icanhazux-<version>-firefox.zip`. Open `about:debugging`, choose **This Firefox**, click **Load Temporary Add-on…** and pick the zip. Temporary add-ons are removed when Firefox restarts.
- **Chromium browsers:** `icanhazux-<version>-chrome.zip`. Unzip it into a folder you'll keep. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick the folder. To update, replace the folder's contents and click the reload arrow on the extension's card.

You can also load the repo folder itself the same way (in Firefox, pick `manifest.json`).

## Credits

icanhazux started from [icanhazbetter](https://github.com/sardistic/icanhazbetter) by sardistic, an MIT-licensed extension that reshapes icanhazchat.com into a customizable chat and cam room. Its work on the site's internals made this one possible. Adapted from it:

- the cam layout engine (`src/pack.js`), ported from its freeform packer;
- the two chat fixes in `src/page.js`: chat freezing when the log is tall, and chat stealing focus from other text boxes;
- reading its saved hidden-cam list, so hidden cams carry over.

Fonts: [Nunito](https://fonts.google.com/specimen/Nunito), [Atkinson Hyperlegible Next](https://fonts.google.com/specimen/Atkinson+Hyperlegible+Next), [Oxanium](https://fonts.google.com/specimen/Oxanium) and [Source Sans 3](https://fonts.google.com/specimen/Source+Sans+3), under the SIL Open Font License (`fonts/OFL-*.txt`).

## License

MIT. See [LICENSE](LICENSE), which also carries the notice for the parts adapted from icanhazbetter.
