// Runs in the PAGE's JavaScript world (manifest "world": "MAIN") so it can wrap
// the site's own functions. Each patch is small, guarded, and a no-op if the
// site's scripts change shape.
//
// Names below (onChatHistoryScroll, scrollOff, cR, as, du) are globals from the
// site's scripts110725.js. Most are minified and may change if the site
// redeploys; every patch checks before touching anything.
(function () {
    'use strict';

    // ── Chat pausing is broken once the chat log is taller than 450px ──────
    // The site's scroll handler (bound inline on #txt as onscroll="…
    // onChatHistoryScroll();") decides with a fixed pixel test:
    //     if (du.fp.scrollTop < du.fp.scrollHeight - 450) scrollOff();   // pause
    //     else if (!du.eo) cR();                                         // resume
    // That's only right while the log is shorter than 450px. The stage makes
    // it much taller, and then at the very bottom the first test is always
    // true: every scroll pauses chat (new messages are held back in du.en
    // until resumed), and the resume branch can never be reached.
    // The handler is replaced with the same logic measured from the bottom of
    // the visible area. scrollOff() and cR() are the site's own; the pause
    // button keeps working because scrollOff() itself is left alone.
    // (cR() with no argument doesn't move focus.)
    const BOTTOM_SLOP = 60;

    function patchChatScroll() {
        if (!window.du || ['onChatHistoryScroll', 'scrollOff', 'cR'].some(f => typeof window[f] !== 'function')) { return false; }
        if (window.onChatHistoryScroll.__icx) { return true; }
        const replacement = function () {
            const du = window.du;
            if (!du.fp) { du.fp = document.getElementById('txt'); }
            const log = du.fp;
            if (!log) { return; }
            const fromBottom = log.scrollHeight - log.scrollTop - log.clientHeight;
            if (fromBottom > BOTTOM_SLOP) {
                if (du.eo) {
                    du.gY = !log.scrollTop;
                    window.scrollOff();
                }
            } else if (!du.eo) {
                window.cR();
            }
        };
        replacement.__icx = true;
        window.onChatHistoryScroll = replacement;
        keepNewestInView();
        return true;
    }

    // The log changes size (PMs docking above it, the window resizing), and a
    // shrinking scroll box keeps its scroll position, sliding the newest
    // lines out of view until the next message. While chat is following,
    // stay on the newest line. Started only once the handler above is in
    // place: the site's own would take this scroll as scrolling up.
    function keepNewestInView() {
        const log = document.getElementById('txt');
        if (!log || log.__icxPinned || typeof ResizeObserver !== 'function') { return; }
        log.__icxPinned = true;
        new ResizeObserver(() => {
            if (window.du && window.du.eo) { log.scrollTop = log.scrollHeight; }
        }).observe(log);
    }

    // ── Chat steals focus from whatever you're typing in ───────────────────
    // as() focuses the chat input; the site calls it all over (pausing chat,
    // disabling a cam, after sending). It's not disabled — it just won't take
    // focus away from another text field.
    function patchFocusSteal() {
        const orig = window.as;
        if (typeof orig !== 'function') { return false; }
        if (orig.__icx) { return true; }
        const wrapped = function () {
            try {
                const a = document.activeElement;
                const typingElsewhere = a && a !== document.body && (
                    a.isContentEditable ||
                    ((a.tagName === 'INPUT' || a.tagName === 'TEXTAREA') && a.id !== 'txtMsg'));
                if (typingElsewhere) { return; }
            } catch (_) {}
            return orig.apply(this, arguments);
        };
        wrapped.__icx = true;
        window.as = wrapped;
        return true;
    }

    // ── Chat settings bridge ───────────────────────────────────────────────
    // The site keeps its chat settings in its own globals and changes them
    // through toggle functions that cycle states and only report the result
    // as a line in chat. The chat bar (chatbar.js, isolated world) can't see
    // page globals, so it talks to this over DOM events with JSON strings:
    //   icx:chat-get             → reply with icx:chat-state
    //   icx:chat-set {key,value} → change one setting, then reply
    // Settings are changed through the site's own functions, so it saves them
    // (cookies / server) and posts its usual confirmation line.
    //
    // du fields, from scripts110725.js:
    //   eo  1 = chat following, 0 = paused          (scrollOff / cR)
    //   fe  0 PMs+whispers, 1 whispers only, 2 PMs only, 3 neither (togglePMPrefs)
    //   ee  you're a room mod (can't pick "neither")
    //   et  0 no notices, 1 all, 2 nick changes only (toggleNotifications)
    //   ev  notification sounds                      (toggleChatSound)
    //   eK  graphical emoticons                      (toggleEmoticons)
    //   fM  line style 1 striped+box, 2 plain, 3 striped (setLineStyles)
    //   eY  your text color, hex without '#'      (pickColor / onColorSave)
    //   eI  your username
    const call = (name, ...args) => {
        if (typeof window[name] === 'function') { window[name](...args); return true; }
        return false;
    };

    function readChatState() {
        const du = window.du;
        if (!du) { return null; }
        const log = du.fp || document.getElementById('txt');
        const pmToggle = document.getElementById('togglePMViewing');
        const pmText = pmToggle ? pmToggle.textContent : '';
        const pms = readPms();
        return {
            following: !!du.eo,
            pm: Number(du.fe) || 0,
            isMod: !!du.ee,
            notices: Number(du.et) || 0,
            sound: !!du.ev,
            emoticons: !!du.eK,
            lineStyle: Number(du.fM) || 2,
            fontSize: log ? parseInt(log.style.fontSize, 10) || null : null,
            color: du.eY ? '#' + String(du.eY).replace(/^#/, '') : null,
            name: du.eI || null,
            // Messages the site is holding back while paused (buffered in du.en).
            held: du.eo ? 0 : ((String(du.en || '').match(/<p[\s>]/g) || []).length),
            // Show/Hide applies once there are open conversations. (The site
            // leaves its link saying "Hide" after hiding the window itself.)
            pmsVisible: !pms.open ? null : /hide private/i.test(pmText) ? true : /show private/i.test(pmText) ? false : null,
            // Conversations closed from their tab (pms.js keeps them, hidden).
            closedPms: pms.closed,
        };
    }

    // PM conversations: one tab each in #tabs. Closing one from its tab only
    // hides it (pms.js marks it .icx-pm-closed), so it can be reopened.
    function readPms() {
        const win = document.getElementById('tabs');
        const tabs = win && win.style.display !== 'none' ? [...win.querySelectorAll(':scope > ul > li')] : [];
        const closed = tabs.filter(li => li.classList.contains('icx-pm-closed'));
        return { open: tabs.length - closed.length, closed: closed.map(li => li.id.replace(/^pm_/, '')) };
    }

    function emitChatState() {
        const state = readChatState();
        if (state) { document.dispatchEvent(new CustomEvent('icx:chat-state', { detail: JSON.stringify(state) })); }
    }

    function setChatSetting(key, value) {
        const du = window.du;
        if (!du) { return; }
        switch (key) {
            case 'following': call(value ? 'cR' : 'scrollOff'); break;
            case 'clear': call('clearChatHistory'); break;
            case 'pm':
                if (![0, 1, 2, 3].includes(value) || (value === 3 && du.ee)) { return; }
                du.fe = value - 1;          // togglePMPrefs() steps once, onto value
                call('togglePMPrefs');
                break;
            case 'notices':
                if (![0, 1, 2].includes(value)) { return; }
                du.et = (value + 2) % 3;    // toggleNotifications() steps once, onto value
                call('toggleNotifications');
                break;
            case 'sound': if (!!du.ev !== !!value) { call('toggleChatSound'); } break;
            case 'emoticons': if (!!du.eK !== !!value) { call('toggleEmoticons'); } break;
            case 'lineStyle':
                if (![1, 2, 3].includes(value)) { return; }
                du.fM = value - 1;          // setLineStyles(true) steps once, onto value
                call('setLineStyles', true);
                break;
            case 'fontSize': {
                const size = Math.round(Number(value));
                const log = du.fp || document.getElementById('txt');
                if (!(size >= 9 && size <= 32) || !log) { return; }
                // The site's '/font name size' command saves it server-side.
                // Keep the current family; the command takes a single-word name.
                const family = (log.style.fontFamily || '').replace(/["']/g, '').split(',')[0].trim();
                call('send_command', `/font ${family && !/\s/.test(family) ? family : 'calibri'} ${size}`);
                log.style.fontSize = size + 'px';
                log.style.lineHeight = (size * 1.4) + 'px';
                break;
            }
            case 'color': {
                // Open the site's picker (color wheel and hex box). pickColor()
                // toggles it, so only call it while it's closed; and if it
                // fails or doesn't open it, show it anyway.
                const picker = document.getElementById('colorDiv');
                const isOpen = () => !!picker && getComputedStyle(picker).display !== 'none';
                if (!isOpen()) {
                    try { call('pickColor'); } catch (e) { console.warn('icanhazux: the site\'s color picker failed to open', e); }
                }
                if (picker && !isOpen()) { picker.style.display = 'block'; }
                document.getElementById('colorTxt')?.focus();
                break;
            }
            case 'pmsVisible': value ? call('show_pms', 1) : call('hide_pms'); break;
            case 'refreshPeople': {
                // What the list's own "refresh" link does.
                const list = document.getElementById('activeUserList');
                if (list) { list.innerHTML = ''; }
                call('updateMembers', true);
                return;
            }
            default: return;
        }
        emitChatState();
    }

    // ── PM conversations closed from their tab ──────────────────────────────
    // bO() delivers every PM, and opens a conversation from a profile
    // ("Send Private Message", explicit). For a conversation that was closed
    // it only appends to the hidden tab, so tell pms.js to bring it back.
    // bM() is alt+1, alt+2…: count only the conversations on screen.
    function patchPms() {
        if (typeof window.bO !== 'function' || typeof window.bM !== 'function') { return false; }
        if (window.bO.__icx) { return true; }
        const deliver = window.bO;
        const wrappedDeliver = function (color, from, msg, tab, explicit) {
            const out = deliver.apply(this, arguments);
            const name = tab === undefined ? from : tab;
            document.dispatchEvent(new CustomEvent('icx:pm', { detail: JSON.stringify({ name: String(name), explicit: !!explicit }) }));
            return out;
        };
        wrappedDeliver.__icx = true;
        window.bO = wrappedDeliver;
        const goTo = window.bM;
        window.bM = function (index) {
            const tabs = [...document.querySelectorAll('#tabs > ul > li')];
            const target = tabs.filter(li => !li.classList.contains('icx-pm-closed'))[index];
            // Out of range does nothing (bM checks against its own count).
            return goTo.call(this, target ? tabs.indexOf(target) : tabs.length + 1);
        };
        return true;
    }

    // ── Who's broadcasting ──────────────────────────────────────────────────
    // The cam grid only shows cams you're watching: hide cams (or idle out)
    // and the site empties it, and stops tracking cams at all. The server
    // keeps telling it, though: a full list (c~ → bi), a cam up (c+ → cu)
    // and a cam down (c- → cv). Those are read here, whatever you're
    // watching, and the names reported to the people list.
    //   WebRTC entry: "<stream>-<app>-<host>-<nick>[-x]"; a cam down
    //   names the stream ("<stream>-…"). Flash entry (old): one letter,
    //   12-character id, then "<nick>.<flags>".
    const broadcasting = new Map();   // entry → nick
    function entryNick(entry) {
        const e = String(entry || '');
        if (!e) { return ''; }
        if (window.du && window.du.dU) { return e.split('-')[3] || ''; }
        return e.substring(13).split('.')[0];
    }
    let lastBroadcasters = '';
    function emitBroadcasters() {
        const names = [...new Set(broadcasting.values())].filter(Boolean).sort();
        const now = JSON.stringify(names);
        if (now === lastBroadcasters) { return; }
        lastBroadcasters = now;
        document.dispatchEvent(new CustomEvent('icx:broadcasters', { detail: now }));
    }
    function patchBroadcasters() {
        const du = window.du;
        if (!du || ['bi', 'cu', 'cv'].some(f => typeof window[f] !== 'function')) { return false; }
        if (window.bi.__icx) { return true; }
        const wrap = (name, before) => {
            const orig = window[name];
            const wrapped = function (data) {
                try { before(data); } catch (_) {}
                const out = orig.apply(this, arguments);
                emitBroadcasters();
                return out;
            };
            wrapped.__icx = true;
            window[name] = wrapped;
        };
        wrap('bi', list => {
            broadcasting.clear();
            String(list || '').split('|').filter(Boolean).forEach(e => broadcasting.set(e, entryNick(e)));
        });
        wrap('cu', entry => { if (entry) { broadcasting.set(String(entry), entryNick(entry)); } });
        wrap('cv', down => {
            const id = du.dU ? String(down || '').split('-')[0] : String(down || '');
            if (!id) { return; }
            [...broadcasting.keys()].filter(e => e.indexOf(id) === 0 || (!du.dU && e.substring(1, 13) === id)).forEach(e => broadcasting.delete(e));
        });
        // Cams already up when this loaded: the site's own list, if it's
        // tracking them (cams shown).
        (du.fu || []).forEach((entry, i) => broadcasting.set(String(entry), (du.ft || [])[i] || entryNick(entry)));
        document.addEventListener('icx:broadcasters-get', () => {
            lastBroadcasters = '';
            emitBroadcasters();
        });
        emitBroadcasters();
        return true;
    }

    // ── Nickname changes ───────────────────────────────────────────────────
    // The server tells every browser in the room when someone changes their
    // nick ("nick" message → cq([old, new, …])); the site relabels their cam
    // and PM tab. Pass the two names on (icx:nick) so a hidden cam stays
    // hidden under its new name. Only what the room was told: nothing here
    // links a nick to an account.
    function patchNicks() {
        if (typeof window.cq !== 'function') { return false; }
        if (window.cq.__icx) { return true; }
        const orig = window.cq;
        const bare = name => {   // the site's bU(): drop the mod marker
            const n = String(name || '');
            const at = window.du && window.du.gc ? n.indexOf(window.du.gc) : -1;
            return at >= 0 ? n.substring(0, at) : n;
        };
        const wrapped = function (a) {
            const out = orig.apply(this, arguments);
            try {
                const from = bare(a && a[0]);
                const to = bare(a && a[1]);
                if (from && to && from !== to) {
                    broadcasting.forEach((nick, entry) => { if (nick === from) { broadcasting.set(entry, to); } });
                    emitBroadcasters();
                    document.dispatchEvent(new CustomEvent('icx:nick', { detail: JSON.stringify({ from, to }) }));
                }
            } catch (_) {}
            return out;
        };
        wrapped.__icx = true;
        window.cq = wrapped;
        return true;
    }

    // ── Is this name a nickname? ───────────────────────────────────────────
    // Asked when you hide a cam (cams.js: icx:nick-check). The same request
    // the site makes when you open that profile, from this page, as you.
    // Only one thing is read from the reply: whether the profile says it's
    // using a nick ("using a nick" or "using a nickname"). Nothing else
    // (account_name included) is looked at or kept.
    function installNickCheck() {
        document.addEventListener('icx:nick-check', e => {
            let name;
            try { name = JSON.parse(e.detail).name; } catch (_) { return; }
            if (!name) { return; }
            const answer = nick => document.dispatchEvent(new CustomEvent('icx:nick-result', { detail: JSON.stringify({ name, nick }) }));
            fetch(`/profile.aspx?embed=1&user=${encodeURIComponent(name)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json;charset=utf-8' },
                body: '{}',
                credentials: 'same-origin',
            }).then(r => r.json()).then(f => {
                const doc = new DOMParser().parseFromString(String((f && f.html) || ''), 'text/html');
                answer(/using a nick(name)?\b/i.test(doc.body.textContent || ''));
            }).catch(() => answer(null));
        });
        return true;
    }

    // ── Refresh after the idle timeout ─────────────────────────────────────
    // When you've been idle a while the site hides the cams (toggleCams(),
    // as the Hide cams button does) and says so in #lurkMessageDiv, with a
    // Restart link (hideLurkMessage(); toggleCams()). refreshCams() only asks
    // the server for the cam list again, which shows nothing while they're
    // hidden. So while that notice is up, refresh restarts them the way the
    // link does. Cams you hid yourself stay hidden.
    function patchIdleRefresh() {
        const refresh = window.refreshCams;
        if (typeof refresh !== 'function' || typeof window.toggleCams !== 'function') { return false; }
        if (refresh.__icx) { return true; }
        const wrapped = function () {
            const notice = document.getElementById('lurkMessageDiv');
            const idledOut = notice && notice.style.visibility === 'visible' && notice.textContent.trim() && window.du && window.du.eA;
            if (idledOut) {
                call('hideLurkMessage');
                window.toggleCams();
                return undefined;
            }
            return refresh.apply(this, arguments);
        };
        wrapped.__icx = true;
        window.refreshCams = wrapped;
        return true;
    }

    // ── Picking a camera (or mic) to broadcast ─────────────────────────────
    // The broadcast panel's camera list (ichc-rtc.js, ichcWebRTCPublish.js)
    // asks for the chosen device as a preference, not a requirement:
    //     video: { deviceId: id, width: { min: 240, ideal: 320, max: 480 },
    //              height: { min: 180, ideal: 240, max: 360 }, frameRate: 8 }
    // The size limits are hard, the device isn't. A camera that can't offer
    // a size in that range on its own (OBS's virtual camera only runs at
    // its output size) doesn't qualify, so the browser quietly opens one
    // that does: in Firefox, which honors the limits strictly, that's the
    // default camera whatever you pick.
    // So when the site names a device, it becomes required, with the site's
    // size limits as they were: an ordinary webcam opens in the same small
    // mode it always did. Only if that device can't meet the limits is it
    // asked for again with them as a preference (their ideal), and then it
    // runs at its own size. It's never resized once running: changing a live
    // camera's mode in Firefox can hang it (light on, no picture) until it's
    // unplugged. If the device can't be opened either way, the site's own
    // request runs unchanged.
    //
    // The frame rate (the server's, 5 to 8) isn't asked of the camera: on a
    // Mac that sets the device itself to run that slowly, and OBS's virtual
    // camera then stutters in OBS too, until OBS is restarted (other apps
    // ask for ~30 and are smooth). The camera runs at its own rate and the
    // broadcast is held to the site's rate when it's sent instead (the
    // connection's maxFramerate, set as the site adds the camera to it).
    //
    // The list also reads each device's id back out of the option's id
    // ("CameraMobile_<id>") by splitting on "_", which cuts short any id
    // that has an underscore in it; such an id is matched back to its device.
    function patchCameraChoice() {
        const md = navigator.mediaDevices;
        if (!md || typeof md.getUserMedia !== 'function') { return false; }
        if (md.getUserMedia.__icx) { return true; }
        const orig = md.getUserMedia.bind(md);

        // The id the site meant, given what it passed.
        async function fullId(id, kind) {
            try {
                const devices = (await md.enumerateDevices()).filter(d => d.kind === kind);
                if (devices.some(d => d.deviceId === id)) { return id; }
                const cut = devices.find(d => d.deviceId.startsWith(id + '_'));
                return cut ? cut.deviceId : id;
            } catch (_) {
                return id;
            }
        }
        const named = c => c && typeof c === 'object' && typeof c.deviceId === 'string' &&
            c.deviceId && c.deviceId !== 'screen';
        const asIdeal = c => (c && typeof c === 'object' && !Array.isArray(c))
            ? { ideal: c.ideal ?? c.max ?? c.min } : c;

        // Camera tracks opened here → the frame rate the site wanted.
        const rates = new WeakMap();
        const wanted = c => {
            const n = parseFloat(c && typeof c === 'object' ? (c.ideal ?? c.max ?? c.exact) : c);
            return n > 0 ? n : 0;
        };
        const opened = (stream, fps) => {
            const track = fps && stream.getVideoTracks()[0];
            if (track) { rates.set(track, fps); }
            return stream;
        };

        const wrapped = async function (constraints) {
            const video = constraints && constraints.video;
            const audio = constraints && constraints.audio;
            if (!named(video) && !named(audio)) { return orig(constraints); }
            const asked = { ...constraints };
            let fps = 0;
            if (named(video)) {
                asked.video = { ...video, deviceId: { exact: await fullId(video.deviceId, 'videoinput') } };
                fps = wanted(video.frameRate);
                delete asked.video.frameRate;
            }
            if (named(audio)) {
                asked.audio = { ...audio, deviceId: { exact: await fullId(audio.deviceId, 'audioinput') } };
            }
            // Permission refused is the answer for the site's request too.
            const refused = e => e && e.name === 'NotAllowedError';
            try {
                return opened(await orig(asked), fps);
            } catch (e) {
                if (refused(e)) { throw e; }
                if (!named(video) || e.name !== 'OverconstrainedError') { return orig(constraints); }
            }
            // The camera can't do the site's sizes: take it at its own.
            const relaxed = { ...asked, video: { ...asked.video } };
            for (const k of ['width', 'height']) { relaxed.video[k] = asIdeal(video[k]); }
            try {
                return opened(await orig(relaxed), fps);
            } catch (e) {
                if (refused(e)) { throw e; }
                return orig(constraints);
            }
        };
        wrapped.__icx = true;
        md.getUserMedia = wrapped;

        // Holding the broadcast to that rate. The publisher adds the camera
        // with addTrack() and swaps it with replaceTrack(). Best effort: if
        // the browser won't take it, the site's own bitrate limit still holds
        // the stream down, just at more frames of lower quality.
        async function cap(sender, track) {
            const fps = track && rates.get(track);
            if (!fps || !sender || typeof sender.getParameters !== 'function') { return; }
            try {
                const params = sender.getParameters();
                if (!params.encodings || !params.encodings.length) { return; }
                params.encodings.forEach(enc => { enc.maxFramerate = fps; });
                await sender.setParameters(params);
            } catch (_) {}
        }
        const PC = window.RTCPeerConnection;
        if (PC && PC.prototype.addTrack && !PC.prototype.addTrack.__icx) {
            const addTrack = PC.prototype.addTrack;
            const add = function (track) {
                const sender = addTrack.apply(this, arguments);
                if (track && rates.has(track)) {
                    cap(sender, track);
                    // Some browsers only fill in the encodings once connected.
                    this.addEventListener('connectionstatechange', () => {
                        if (this.connectionState === 'connected') { cap(sender, sender.track); }
                    });
                }
                return sender;
            };
            add.__icx = true;
            PC.prototype.addTrack = add;
        }
        const Sender = window.RTCRtpSender;
        if (Sender && Sender.prototype.replaceTrack && !Sender.prototype.replaceTrack.__icx) {
            const replaceTrack = Sender.prototype.replaceTrack;
            const replace = function (track) {
                return replaceTrack.apply(this, arguments).then(out => { cap(this, track); return out; });
            };
            replace.__icx = true;
            Sender.prototype.replaceTrack = replace;
        }
        return true;
    }

    // ── Cam watermarks after full screen ───────────────────────────────────
    // aQ(width) sizes every cam's name, buttons and anti-capture watermark
    // (.cam-syms) inline, from a cam width; while anything is full screen it
    // uses 0.8 of the screen's width instead, so they all go huge (the
    // stylesheet keeps the full-screen cam's own in check). Leaving full
    // screen doesn't call it again: they stayed huge until the cams were
    // next laid out. So the last width it was given outside full screen is
    // kept, and given back as soon as full screen ends.
    // (Scripts110725.js has a second, unrelated aQ inside swfobject; the
    // global one is the one that mentions fullscreenElement.)
    function patchCamLabelSize() {
        const size = window.aQ;
        if (typeof size !== 'function' || !String(size).includes('fullscreenElement')) { return false; }
        if (size.__icx) { return true; }
        // Cams built before this ran: their names were set to width / 15.
        const name = document.querySelector('.name-on-cam');
        let lastWidth = (!document.fullscreenElement && parseFloat(name && name.style.fontSize) * 15) || 0;
        const wrapped = function (width) {
            if (!document.fullscreenElement && width > 0) { lastWidth = width; }
            return size.apply(this, arguments);
        };
        wrapped.__icx = true;
        window.aQ = wrapped;
        document.addEventListener('fullscreenchange', () => {
            if (!document.fullscreenElement && lastWidth) { size(lastWidth); }
        });
        return true;
    }

    // ── Remembering the camera ─────────────────────────────────────────────
    // When the broadcast panel opens it starts the camera saved in the
    // "cam-id" cookie, else the first in the list (often the built-in one).
    // Two things stop that working, so it opened the first camera every
    // time, and opening it can upset whatever else is using it (a webcam
    // OBS is capturing, under its virtual camera):
    //   - get_cookie() turns every "+" into a space. Firefox's device ids
    //     are base64 and often have a "+", so the saved id never matched.
    //     For "cam-id" the cookie is read as written.
    //   - It's saved only when broadcasting stops (stop_camera()), not when
    //     you pick a camera, so a tab closed mid-broadcast forgot it. It's
    //     now saved, the site's way (set_cookie()), as soon as you pick one.
    function patchCameraMemory() {
        const get = window.get_cookie;
        if (typeof get !== 'function' || typeof window.set_cookie !== 'function') { return false; }
        if (get.__icx) { return true; }
        const wrapped = function (name) {
            if (name === 'cam-id') {
                const m = /(?:^|;\s*)cam-id=([^;]*)/.exec(document.cookie);
                return m ? m[1] : '';
            }
            return get.apply(this, arguments);
        };
        wrapped.__icx = true;
        window.get_cookie = wrapped;
        // The list's options are "CameraMobile_<id>" (or "screen_screen").
        document.addEventListener('change', e => {
            const select = e.target;
            if (!select || select.id !== 'camera-list-select') { return; }
            const value = String(select.value || '');
            const id = value.startsWith('CameraMobile_') ? value.slice('CameraMobile_'.length) : '';
            if (id) { window.set_cookie('cam-id', id); }
        }, true);
        return true;
    }

    function installChatBridge() {
        if (!window.du || typeof window.togglePMPrefs !== 'function') { return false; }
        if (window.__icxChatBridge) { return true; }
        window.__icxChatBridge = true;
        document.addEventListener('icx:chat-get', emitChatState);
        document.addEventListener('icx:chat-set', e => {
            let req;
            try { req = JSON.parse(e.detail); } catch (_) { return; }
            if (req && typeof req.key === 'string') { setChatSetting(req.key, req.value); }
        });
        // Pausing and resuming happen all the time (scrolling, sending), so
        // report them as they happen. Both are looked up by global name.
        for (const name of ['scrollOff', 'cR']) {
            const orig = window[name];
            if (typeof orig !== 'function' || orig.__icxEmit) { continue; }
            const wrapped = function () {
                const out = orig.apply(this, arguments);
                emitChatState();
                return out;
            };
            wrapped.__icxEmit = true;
            Object.keys(orig).forEach(k => { wrapped[k] = orig[k]; });
            window[name] = wrapped;
        }
        // While paused, the held-message count grows as messages arrive.
        let lastHeld = -1;
        setInterval(() => {
            const du = window.du;
            if (!du || du.eo) { lastHeld = -1; return; }
            const held = (String(du.en || '').match(/<p[\s>]/g) || []).length;
            if (held !== lastHeld) { lastHeld = held; emitChatState(); }
        }, 1000);
        // The PM-window toggle and color change outside our calls.
        const pmToggle = document.getElementById('togglePMViewing');
        if (pmToggle) { new MutationObserver(emitChatState).observe(pmToggle, { childList: true, subtree: true }); }
        // Conversations opening, closing and reopening, and the window shown
        // or hidden. Tab classes also change on hover, so only report a change.
        const pmWindow = document.getElementById('tabs');
        if (pmWindow) {
            let last = '';
            const pmObserver = new MutationObserver(() => {
                const now = JSON.stringify([readPms(), pmWindow.style.visibility, pmWindow.style.display]);
                if (now !== last) { last = now; emitChatState(); }
            });
            pmObserver.observe(pmWindow, { attributes: true, attributeFilter: ['style'] });
            const list = pmWindow.querySelector(':scope > ul');
            if (list) { pmObserver.observe(list, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] }); }
        }
        emitChatState();
        return true;
    }

    // The site's scripts normally load before this runs (document_idle);
    // retry for a while in case they're late. The chat bridge goes last so it
    // wraps the already-patched functions.
    let pending = [patchChatScroll, patchFocusSteal, patchPms, patchIdleRefresh, patchBroadcasters, patchNicks, installNickCheck, patchCameraChoice, patchCameraMemory, patchCamLabelSize, installChatBridge].filter(p => !p());
    let tries = 0;
    const timer = pending.length && setInterval(() => {
        pending = pending.filter(p => !p());
        if (!pending.length || ++tries > 60) { clearInterval(timer); }
    }, 500);
})();
