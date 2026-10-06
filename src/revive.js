// Stalled cams refresh themselves: a cam whose stream has died (its last
// picture frozen on screen) gets the same refresh as its hover button, the
// site's own disable → start for that cam (cams.js).
//
// "Stalled" is counted in decoded frames, not in what the picture looks
// like: a still scene at the site's 5–8 fps keeps adding frames, a dead
// stream adds none. The count is the video's own (getVideoPlaybackQuality)
// plus requestVideoFrameCallback where the browser has it. A video whose
// count has never moved isn't judged at all: either it never connected
// (the site retries that itself) or this browser doesn't count frames for
// live streams, and a cam can't be told dead from not-counted.
//
// Guardrails, so it never makes things worse:
//   - nothing while the tab is in the background (browsers stop drawing
//     video there, which looks just like a stall); the clocks restart when
//     you come back;
//   - a cam that's new or just refreshed gets GRACE_MS to start;
//   - hidden cams and cams the site shows as disabled have no live <video>
//     (#vid-…), so they're never touched;
//   - at most three tries per cam: one as soon as it's stalled, then a
//     minute, then five minutes later; after that it's left alone. A cam
//     that runs well for two minutes after a try starts over;
//   - a refreshed cam that never starts sending isn't judged again (as
//     above), so a broadcaster who's really gone isn't hammered.
// Settings → Auto-refresh stalled cams, on by default.
(function () {
    'use strict';

    const { store, signal, onRetire } = globalThis.ICX;

    const cams = document.getElementById('cams');
    if (!cams) { return; }

    // Tests shorten these (globalThis.ICX_REVIVE_TIMES).
    const T = Object.assign({
        CHECK_MS: 5000,              // how often to look
        STALL_MS: 15000,             // no new frames for this long: stalled
        GRACE_MS: 20000,             // a new or refreshed cam's time to start
        HEALTHY_MS: 120000,          // running this long after a try clears its tries
        TRIES: 3,
        BACKOFF_MS: [60000, 300000], // the wait after the first try, and the second
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

    function check() {
        const now = Date.now();
        cams.querySelectorAll(':scope > .rounded_square[data-icx-placed]:not(.icx-hidden)').forEach(slot => {
            const video = slot.querySelector('.videocontainer > video[id^="vid-"]');
            const name = (slot.querySelector('.name-on-cam')?.textContent || '').trim().toLowerCase();
            if (!video || !name) { return; }
            const rec = track(video, now);
            const n = frames(video, rec);
            if (n !== rec.frames) {
                if (rec.frames >= 0) { rec.moved = true; }
                rec.frames = n;
                rec.last = now;
                const t = tries.get(name);
                if (t && now - t.since > T.HEALTHY_MS) { tries.delete(name); }
                return;
            }
            if (!enabled || !rec.moved || now - rec.born < T.GRACE_MS || now - rec.last < T.STALL_MS) { return; }
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
            if (rec) { rec.last = now; }
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
