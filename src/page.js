// Runs in the PAGE's JavaScript world (manifest "world": "MAIN") so it can wrap
// the site's own functions. Each patch is small, guarded, and a no-op if the
// site's scripts change shape.
//
// Function names below are from the site's minified scripts110725.js and may
// change if the site redeploys; every patch checks before wrapping.
(function () {
    'use strict';

    // ── Chat stops updating once the chat log is taller than 450px ─────────
    // The site decides you've scrolled away from the bottom with a fixed test
    // in onChatHistoryScroll:
    //     if (du.fp.scrollTop < du.fp.scrollHeight - 450) { ... scrollOff() }
    // That's only right while the log is shorter than 450px. The stage makes it
    // much taller, so at the very bottom the test is always true and the site
    // pauses on every scroll event: incoming messages are buffered (du.en)
    // instead of shown until something calls cR().
    // scrollOff() is wrapped to refuse when the log really is at the bottom.
    // Scrolling up still pauses as before.
    const BOTTOM_SLOP = 150;

    function patchScrollOff() {
        const orig = window.scrollOff;
        if (typeof orig !== 'function') { return false; }
        if (orig.__icx) { return true; }
        const wrapped = function () {
            try {
                const log = (window.du && window.du.fp) || document.getElementById('txt');
                if (log && log.scrollHeight - log.scrollTop - log.clientHeight < BOTTOM_SLOP) { return; }
            } catch (_) {}
            return orig.apply(this, arguments);
        };
        wrapped.__icx = true;
        window.scrollOff = wrapped;
        return true;
    }

    // ── Scrolling chat steals focus from whatever you're typing in ─────────
    // scrollOff() calls as(), which focuses the chat input. as() is also used
    // legitimately after sending a message, so it isn't disabled — it just
    // won't take focus away from another text field.
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

    // The site's scripts may load after this one; retry for a while.
    const patches = [patchScrollOff, patchFocusSteal];
    let tries = 0;
    const timer = setInterval(() => {
        const pending = patches.filter(p => !p());
        patches.length = 0;
        patches.push(...pending);
        if (!pending.length || ++tries > 60) { clearInterval(timer); }
    }, 500);
})();
