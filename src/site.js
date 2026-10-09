// Site-wide basics, on every icanhazchat.com page: the bundled fonts, and
// html.icx-site, which the shared header, footer and page background hang
// off. Rooms get html.icx on top of it (shell.js) for the cam stage and chat.
//
// Outside a room, the page's content panel is marked .icx-paper: it stays on
// light colors in either theme, since each page's markup is its own (inline
// white backgrounds, dark text) and only the header and footer are shared.
(function () {
    'use strict';

    const { el } = globalThis.ICX;
    const root = document.documentElement;

    // Content scripts run at document_idle, so the page's markup is all there.
    const isRoom = !!(document.getElementById('body_container') &&
        document.getElementById('cams') && document.getElementById('chat_container'));
    globalThis.ICX.isRoom = isRoom;

    // The fonts ship with the extension: the three interface fonts
    // (Settings → Font: Nunito, Atkinson Hyperlegible Next, Oxanium) and
    // Source Sans 3 for chat. A content-script stylesheet can't name
    // extension files portably (chrome-extension:// vs. moz-extension://),
    // so the faces are registered here.
    //
    // The interface fonts get their vertical metrics evened out (ascent and
    // descent overrides, same total height): each font file places its
    // letters differently in the line, and Oxanium's sat visibly high in
    // buttons and chips. These put the capitals in the middle of the line in
    // all three, so a button looks the same whichever font is picked.
    // Measured from the files (cap height and the font's own ascent and
    // descent): ascent = (ascent + descent + cap) / 2, descent = the rest.
    function registerFonts() {
        const api = globalThis.browser?.runtime || globalThis.chrome?.runtime;
        if (!api?.getURL) { return; }
        document.getElementById('icx-fonts')?.remove();
        const face = (family, file, style, weights, metrics = '') => `@font-face { font-family: "${family}"; font-style: ${style};
            font-weight: ${weights}; font-display: swap; src: url("${api.getURL(`fonts/${file}`)}") format("woff2");${metrics} }`;
        const centered = (ascent, descent) => ` ascent-override: ${ascent}%; descent-override: ${descent}%; line-gap-override: 0%;`;
        document.head.append(el('style', { id: 'icx-fonts', text:
            face('Nunito', 'Nunito-Variable.woff2', 'normal', '400 900', centered(104.6, 31.8)) +
            face('Atkinson Hyperlegible Next', 'AtkinsonHyperlegibleNext-Variable.woff2', 'normal', '200 800', centered(99.2, 30.8)) +
            face('Oxanium', 'Oxanium-Variable.woff2', 'normal', '200 800', centered(85.3, 14.7)) +
            face('Source Sans 3', 'SourceSans3-Variable.woff2', 'normal', '200 900') +
            face('Source Sans 3', 'SourceSans3-Italic-Variable.woff2', 'italic', '200 900') }));
    }

    root.classList.add('icx-site');
    registerFonts();
    if (!isRoom) {
        // (#pnlMain: the Get Hearted page, which has none of the usual
        // panels, nor the site header.)
        document.querySelectorAll('.page_section_white, .page_section, #pnlMain').forEach(s => s.classList.add('icx-paper'));
    }
})();
