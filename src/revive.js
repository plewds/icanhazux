// Stalled cams refresh themselves: a cam whose stream has died gets the
// same refresh as its hover button, the site's own disable → start for that
// cam (cams.js). That only reconnects this viewer's copy of the stream;
// the broadcaster never knows.
//
// A cam counts as stalled when, past its first GRACE_MS, it's been STALL_MS:
//   - frozen: no new decoded frames (a still scene at the site's 5–8 fps
//     keeps adding them; a dead stream adds none);
//   - never started: no frames at all since it appeared. Only judged once
//     some cam's count has moved, which shows this browser counts frames
//     for live streams (Firefox's getVideoPlaybackQuality doesn't; its
//     requestVideoFrameCallback does). Without that, nothing is judged;
//   - blacked out: frames arriving, but every one pure black (a 16×12
//     sample, every channel under BLACK). A dark room still has noise and
//     color in it; this is the black of a broken connection.
//
// Guardrails:
//   - nothing while the tab is in the background (browsers stop drawing
//     video there, which looks just like a stall); the clocks restart when
//     you come back;
//   - hidden cams and cams the site shows as disabled have no live <video>
//     (#vid-…), so they're never touched;
//   - at most three tries per cam: one as soon as it's stalled, then a
//     minute, then five minutes later; after that it's left alone (someone
//     really sitting in the dark, say). A cam that runs well for two
//     minutes after a try starts over.
// Settings → Auto-refresh stalled cams, on by default.
(function () {
    'use strict';

    const { store, signal, onRetire } = globalThis.ICX;

    const cams = document.getElementById('cams');
    if (!cams) { return; }

    // Tests shorten these (globalThis.ICX_REVIVE_TIMES).
    const T = Object.assign({
        CHECK_MS: 5000,              // how often to look
        STALL_MS: 15000,             // frozen or black for this long: stalled
        GRACE_MS: 20000,             // a new or refreshed cam's time to start
        HEALTHY_MS: 120000,          // running this long after a try clears its tries
        TRIES: 3,
        BACKOFF_MS: [60000, 300000], // the wait after the first try, and the second
        BLACK: 12,                   // a sample brighter than this anywhere isn't black
    }, globalThis.ICX_REVIVE_TIMES || {});

    let enabled = store.get('autoRefresh', true) !== false;

    // Per <video>: its frame count and when it last moved. A refresh makes a
    // new <video>, so a refreshed cam starts fresh here.
    const watched = new WeakMap();
    // Per cam name: tries so far and when the next is allowed.
    const tries = new Map();

    function track(video, now) {
        let rec = watched.get(video);
        if (rec) { return rec; }
        rec = { born: now, last: now, frames: -1, moved: false, presented: 0 };
        watched.set(video, rec);
        if (typeof video.requestVideoFrameCallback === 'function') {
            const tick = () => { rec.presented++; if (video.isConnected) { video.requestVideoFrameCallback(tick); } };
            video.requestVideoFrameCallback(tick);
        }
        return rec;
    }
    const frames = (video, rec) => (video.getVideoPlaybackQuality?.().totalVideoFrames || 0) + rec.presented;
    // Some cam's count has moved: this browser counts frames.
    let counting = false;

    // Pure black, from a tiny sample of the current frame.
    const probe = document.createElement('canvas');
    probe.width = 16;
    probe.height = 12;
    const probeCtx = probe.getContext('2d', { willReadFrequently: true });
    let canSample = !!probeCtx;
    function black(video) {
        if (!canSample || video.readyState < 2 || !video.videoWidth) { return false; }
        try {
            probeCtx.drawImage(video, 0, 0, probe.width, probe.height);
            const px = probeCtx.getImageData(0, 0, probe.width, probe.height).data;
            for (let i = 0; i < px.length; i += 4) {
                if (px[i] > T.BLACK || px[i + 1] > T.BLACK || px[i + 2] > T.BLACK) { return false; }
            }
            return true;
        } catch (_) {
            canSample = false;   // the browser won't let the frame be read
            return false;
        }
    }

    function check() {
        const now = Date.now();
        cams.querySelectorAll(':scope > .rounded_square[data-icx-placed]:not(.icx-hidden)').forEach(slot => {
            const video = slot.querySelector('.videocontainer > video[id^="vid-"]');
            const name = (slot.querySelector('.name-on-cam')?.textContent || '').trim().toLowerCase();
            if (!video || !name) { return; }
            const rec = track(video, now);
            const n = frames(video, rec);
            if (n !== rec.frames) {
                if (rec.frames >= 0) { rec.moved = true; counting = true; }
                rec.frames = n;
                rec.last = now;
            }
            if (!black(video)) { rec.blackSince = 0; }
            else if (!rec.blackSince) { rec.blackSince = now; }

            const frozen = rec.moved && now - rec.last >= T.STALL_MS;
            const neverStarted = !rec.moved && counting;
            const blackedOut = rec.blackSince && now - rec.blackSince >= T.STALL_MS;
            if (rec.moved && !frozen && !rec.blackSince) {
                const t = tries.get(name);
                if (t && now - t.since > T.HEALTHY_MS) { tries.delete(name); }
                return;
            }
            if (!enabled || now - rec.born < T.GRACE_MS || !(frozen || neverStarted || blackedOut)) { return; }
            const t = tries.get(name) || { count: 0, next: 0, since: now };
            if (t.count >= T.TRIES || now < t.next) { return; }
            t.count++;
            t.since = now;
            t.next = now + (T.BACKOFF_MS[t.count - 1] || 0);
            tries.set(name, t);
            // The cam's own refresh button: the same path, and the same
            // shimmer, as pressing it.
            slot.querySelector('.icx-tools .icx-btn[data-act="refresh"]')?.click();
        });
    }

    // While the tab is in the background nothing is judged; coming back,
    // every cam's clock starts again.
    function restart() {
        const now = Date.now();
        cams.querySelectorAll('.videocontainer > video[id^="vid-"]').forEach(video => {
            const rec = watched.get(video);
            if (rec) { rec.last = now; rec.blackSince = rec.blackSince && now; }
        });
    }
    const timer = setInterval(() => { if (!document.hidden) { check(); } }, T.CHECK_MS);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { restart(); } }, { signal });
    onRetire(() => clearInterval(timer));

    globalThis.ICX.revive = {
        get: () => enabled,
        set(on) {
            enabled = !!on;
            store.set('autoRefresh', enabled);
            if (enabled) { restart(); }
            document.dispatchEvent(new CustomEvent('icx:pref', { detail: 'autoRefresh' }));
        },
    };
})();
