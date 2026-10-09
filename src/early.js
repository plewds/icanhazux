// Runs at document_start, before the page has drawn anything. The rest of
// the extension runs at document_idle, and every style hangs off what those
// scripts mark (html.icx-site, html.icx, data-icx-page…), so until then the
// site would show its own look for a moment and then snap to ours.
//
// So this sets the theme, accent and font straight away (the same choice
// theme.js and controls.js make, from the same saved settings) and cloaks
// the page:
// html[data-icx-cloak] paints the theme's background and keeps the body
// invisible (still laid out, so measurements work) until ready.js, last in
// the list, lifts it. If that never happens (a script failed), the cloak
// comes off by itself once the page has loaded.
//
// The stylesheets are listed with this script in the manifest, not with the
// others: Firefox injects a content script's CSS at its run_at, so on the
// document_idle list they'd arrive too late for the cloak (Chrome injects
// them before the page draws either way).
//
// Skipped when the page has already loaded: the browser injecting a fresh
// copy into an open tab after an update, or the e2e tests adding scripts.
(function () {
    'use strict';

    if (document.readyState !== 'loading') { return; }
    const read = key => {
        try { return JSON.parse(localStorage.getItem('icx_' + key)); } catch (_) { return null; }
    };

    function cloak(root) {
        const pref = read('theme');
        const dark = pref === 'dark' ||
            (pref !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
        root.dataset.icxTheme = dark ? 'dark' : 'light';
        // Accent names are checked by theme.js; an unknown one just leaves
        // the default until then.
        const accent = read('accent');
        if (typeof accent === 'string') { root.dataset.icxAccent = accent; }
        // And the font (controls.js checks the name).
        const font = read('font');
        if (typeof font === 'string') { root.dataset.icxFont = font; }

        root.dataset.icxCloak = '';
        window.addEventListener('load', () => {
            setTimeout(() => { delete root.dataset.icxCloak; }, 1000);
        }, { once: true });
    }

    // This early, even <html> may not have been parsed yet.
    if (document.documentElement) {
        cloak(document.documentElement);
    } else {
        const wait = new MutationObserver(() => {
            if (!document.documentElement) { return; }
            wait.disconnect();
            cloak(document.documentElement);
        });
        wait.observe(document, { childList: true });
    }
})();
