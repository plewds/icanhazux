# icanhazux

A browser extension that seeks to add a more modernized experience to [icanhazchat.com](https://www.icanhazchat.com) without necessarily overhauling the core layout. You get a more intuitive settings menu, a cam grid you can arrange, a cleaner chat, light and dark themes, and the rest of the site restyled to match.

icanhazux builds on [icanhazbetter](https://github.com/sardistic/icanhazbetter) by sardistic, which worked out much of the site's internals and whose cam layout engine and chat fixes are adapted here. See [Credits](#credits).

icanhazux is unofficial: it isn't made by or affiliated with icanhazchat.com.

## Features

### Rooms

**Cams**

- **Fill the window.** Cams take the whole left side of the room. Each keeps its real shape (4:3, 16:9, portrait phones), and the grid packs them to use the space.
- **Focus a cam.** Hover a cam and click the focus button, or double-click it. It becomes the big feed in the top-left, with the others wrapped around it. Do the same again to unfocus.
- **Drag to reorder.** Grab a cam and drop it where you want it. The order is remembered by username.
- **Refresh one cam.** Restarts just that feed, for when a cam freezes or goes black.
- **Full screen.** Any cam, from its hover controls, with the site's watermark kept to a sensible size.
- **Hide a cam.** The cam disappears and its stream stops, and it stays hidden when that person cams up again. **Hidden** under the cams lists who you've hidden and brings them back. Nicknames can change hands, so a hidden nickname stays hidden only for your visit, unless you mark it as someone's regular nick.
- **Resize cams vs. chat.** Drag the bar between them. Double-click it to reset.
- **Refresh all and Hide cams** sit under the cams as buttons. After the idle timeout, Refresh all brings the cams back.

**Chat**

- **A chat bar that shows its state.** Pause and resume (with a count of new lines while paused), clear, your PMs, and settings, in place of the site's row of icons.
- **Chat settings as real choices:** your text color, text size, line style, chat colors, timestamps, who can PM or whisper you, join and leave notices, sounds, and emotimemes.
- **Timestamps.** None, relative ("37s ago", kept current), or absolute (kept when you copy the log).
- **Chat colors.** Each person's color on their whole message, as the site does, or on their name only.
- **Readable in dark mode.** Chat colors too dark to read on the dark theme are lightened just enough, keeping their hue.
- **Emotimeme autocomplete.** Type `:` and a few letters to pick from the room's emotimemes.
- **Inline previews.** Image and video links open a small preview under the message on click, instead of a popup window. Nothing loads until you click.
- **Fixes.** Chat no longer freezes when the log is tall, and scrolling chat no longer pulls focus out of other text boxes.

**People and PMs**

- **People drawer.** Under the chat: everyone in the room as a list, with who's idle, on cam, a mod or a site supporter. Search it, or show only who's on cam. Click a name for their profile, as before.
- **PMs docked or floating.** Private messages open at the top of the chat instead of wherever the site's old layout put them; drag the bar under them to resize. Or pop them out (the button at the end of the PM tabs, or **PM window** in the chat bar's ⚙) into a window you can move by its tabs, resize from the corner and park anywhere over the room. Drop it on the top of the chat to dock it again. It's remembered, and on narrow windows the PMs stay docked.
- **Closed, not deleted.** Closing a PM tab hides it instead of deleting the conversation; reopen it from **Closed** on the chat bar.

**Broadcasting**

- **The camera you pick is the one you get.** The site's camera list could quietly open your default camera instead, especially in Firefox. Virtual cameras like OBS's now work too.
- **Your camera is remembered.** Pick one once and Broadcast opens it from then on, without waking up your built-in camera first.
- **Smoother video, especially in Firefox.** The site asked your camera itself to run at 5–8 frames a second, which on a Mac slows the camera for every app using it (the reason opening Photo Booth used to help). The camera now runs at its normal speed, and the broadcast is held to the site's frame rate as it's sent, so it uses no more bandwidth.

**Mod tools** (room mods and owners only)

- **Cam time** and **last chat** on each cam: how long someone's been on cam, and how long since they last said something.

### Across the site

- **Light and dark themes.** Follows your system setting, or pick one, plus eight accent colors.
- **Every page restyled.** The lobby, profiles, settings, messages, groups and dashboard use the same themes, fonts and accent-edged cards as rooms. Room previews look like cam tiles. A profile's background picture becomes a cover banner. The room emotimemes page becomes a searchable grid.
- **Settings in the header.** The **ichux** link (after an accent bar, at the end of the site header's links) opens theme and accent on any page. Chat settings stay on the chat bar in rooms.

## Privacy

Your settings, hidden cams and cam order are kept in your browser's storage for icanhazchat.com. There are no analytics, and the extension talks to no one but icanhazchat.com, the way the site's own pages do.

One request worth knowing about: when you hide a cam, the extension opens that person's profile, as you would, to see whether the name is a nickname. Image and video previews load from the link's host, only when you click them.

The full policy is in [PRIVACY.md](PRIVACY.md).

## Install

Build the packages with `npm run build`. It writes two zips to `dist/`, one per browser:

- **Firefox (140+):** `icanhazux-<version>-firefox.zip`. Open `about:debugging`, choose **This Firefox**, click **Load Temporary Add-on…** and pick the zip. Temporary add-ons are removed when Firefox restarts; a permanent install comes from Firefox Add-ons.
- **Chrome / Edge / Opera:** `icanhazux-<version>-chrome.zip`. Unzip it into a folder you'll keep. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick the folder. To update, replace the folder's contents and click the reload arrow on the extension's card.

You can also load the repo folder itself the same way (in Firefox, pick `manifest.json`).

If you used icanhazbetter, your hidden-cam list carries over the first time icanhazux runs.

## Credits

icanhazux started from [icanhazbetter](https://github.com/sardistic/icanhazbetter) by sardistic, an MIT-licensed extension that reshapes icanhazchat.com into a customizable chat and cam room. Its work on the site's internals made this one possible. Adapted from it:

- the cam layout engine (`src/pack.js`), ported from its freeform packer;
- the two chat fixes in `src/page.js`: chat freezing when the log is tall, and chat stealing focus from other text boxes;
- reading its saved hidden-cam list, so hidden cams carry over.

Fonts: [Nunito](https://fonts.google.com/specimen/Nunito) and [Source Sans 3](https://fonts.google.com/specimen/Source+Sans+3), under the SIL Open Font License (`fonts/OFL-*.txt`).

## License

MIT. See [LICENSE](LICENSE), which also carries the notice for the parts adapted from icanhazbetter.
