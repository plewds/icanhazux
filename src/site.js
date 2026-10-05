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

    // Nunito (interface) and Source Sans 3 (chat) ship with the extension. A content-script stylesheet
    // can't name extension files portably (chrome-extension:// vs.
    // moz-extension://), so the faces are registered here.
    function registerFonts() {
        const api = globalThis.browser?.runtime || globalThis.chrome?.runtime;
        if (!api?.getURL) { return; }
        document.getElementById('icx-fonts')?.remove();
        const face = (family, file, style, weights) => `@font-face { font-family: "${family}"; font-style: ${style};
            font-weight: ${weights}; font-display: swap; src: url("${api.getURL(`fonts/${file}`)}") format("woff2"); }`;
        document.head.append(el('style', { id: 'icx-fonts', text:
            face('Nunito', 'Nunito-Variable.woff2', 'normal', '400 900') +
            face('Source Sans 3', 'SourceSans3-Variable.woff2', 'normal', '200 900') +
            face('Source Sans 3', 'SourceSans3-Italic-Variable.woff2', 'italic', '200 900') }));
    }

    root.classList.add('icx-site');
    registerFonts();
    if (!isRoom) {
        document.querySelectorAll('.page_section_white, .page_section').forEach(s => s.classList.add('icx-paper'));
    }
})();
