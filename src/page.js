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
        return true;
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

    // The site's scripts normally load before this runs (document_idle);
    // retry for a while in case they're late.
    let pending = [patchChatScroll, patchFocusSteal].filter(p => !p());
    let tries = 0;
    const timer = pending.length && setInterval(() => {
        pending = pending.filter(p => !p());
        if (!pending.length || ++tries > 60) { clearInterval(timer); }
    }, 500);
})();
