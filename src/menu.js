// "| ichux" in the site header, on every page (rooms included), opening
// ICHUX Settings: the extension's appearance settings, theme, accent and
// font (controls.js), which apply everywhere. Settings that only change chat
// stay in the chat bar's panel in rooms, and the panel says so.
//
// The header's links are
//   logged in:  .page_header_userlinks … .header_links: (signout)<br>messages posts … dashboard
//   logged out: .page_header_userlinks: Sign-In or Join
// The link goes at the end of the second row, or under Sign-In / Join.
(function () {
    'use strict';

    const { el, signal, removeStale } = globalThis.ICX;
    const controls = globalThis.ICX.controls;

    const links = document.querySelector('.page_header_userlinks');
    if (!links || !controls) { return; }
    removeStale('icx-menu-link');   // left by an older copy (see core.js)
    removeStale('icx-site-settings');

    // Marked as the add-on's by an accent-colored bar in place of the
    // header's separator dot before it (the stylesheet draws it).
    const link = el('a', {
        href: '#', id: 'icx-menu-link', role: 'button',
        'aria-haspopup': 'dialog', 'aria-expanded': 'false', 'aria-controls': 'icx-site-settings',
        'aria-label': 'ICHUX Settings', title: 'ICHUX Settings: theme, accent and font', text: 'ichux',
    });
    const row = links.querySelector('.header_links');
    if (row) {
        row.append(' ', link);
    } else {
        links.classList.add('icx-signed-out');
        links.append(link);
    }

    const theme = controls.theme();
    const accent = controls.accent();
    const font = controls.font();
    const shared = [theme, accent, font].filter(Boolean);

    const close = el('button', { type: 'button', class: 'icx-panel-close', 'aria-label': 'Close', text: '\u00d7' });
    const panel = el('div', { id: 'icx-site-settings', role: 'dialog', 'aria-label': 'ICHUX Settings', hidden: '' }, [
        el('div', { class: 'icx-panel-head' }, [el('div', { class: 'icx-panel-title', text: 'ICHUX Settings' }), close]),
        ...shared.map(c => c.node),
        el('p', {
            class: 'icx-panel-note',
            text: 'Chat settings (your text color and size, chat colors, timestamps, PMs, notices and sounds) ' +
                'are in the \u2699 on the chat bar in any room.',
        }),
    ]);
    document.body.append(panel);

    // Opens under the link, right-aligned with the header.
    function place() {
        const r = link.getBoundingClientRect();
        const header = link.closest('#panelHeader, #ctl00_panelHeader')?.getBoundingClientRect();
        panel.style.top = `${Math.round(Math.max(r.bottom, header ? header.bottom : r.bottom) + 6)}px`;
    }
    function setOpen(open) {
        panel.hidden = !open;
        link.setAttribute('aria-expanded', String(open));
        link.classList.toggle('icx-open', open);
        if (open) {
            place();
            shared.forEach(c => c.render());
            (panel.querySelector('.icx-on, [aria-checked="true"]') || close).focus({ preventScroll: true });
        }
    }

    link.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); setOpen(panel.hidden); });
    close.addEventListener('click', () => { setOpen(false); link.focus(); });
    panel.addEventListener('click', e => e.stopPropagation());
    document.addEventListener('click', () => { if (!panel.hidden) { setOpen(false); } }, { signal });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && !panel.hidden) { setOpen(false); link.focus(); }
    }, { signal });
    window.addEventListener('resize', () => { if (!panel.hidden) { place(); } }, { signal });
    signal.addEventListener('abort', () => { link.remove(); panel.remove(); });

    // ── Narrow windows: the links behind ☰ ──────────────────────────────────
    // Under 760px the header keeps "Hey name [karma]" and a ☰ button; the
    // links (sign out, messages … dashboard, ichux) open under it as a list.
    // They're the site's own links, laid out differently by the stylesheet
    // (html.icx-nav-open), not copies, so everything they do still works.
    // New messages (.unread) put a dot on the button while it's closed.
    if (!row) { return; }
    removeStale('icx-nav-toggle');
    const header = links.closest('#panelHeader, #ctl00_panelHeader');
    const toggle = el('button', {
        type: 'button', id: 'icx-nav-toggle', 'aria-label': 'Menu', 'aria-expanded': 'false',
        title: 'Menu',
    }, [el('span', { class: 'icx-nav-bars', 'aria-hidden': 'true' })]);
    links.append(toggle);
    const root = document.documentElement;
    const setNav = open => {
        root.classList.toggle('icx-nav-open', open);
        toggle.setAttribute('aria-expanded', String(open));
    };
    toggle.addEventListener('click', e => { e.stopPropagation(); setNav(!root.classList.contains('icx-nav-open')); });
    // A link in the list closes it (ichux opens its own panel, below the bar).
    // Caught on the way down: the ichux link stops its click from going on.
    row.addEventListener('click', () => setNav(false), true);
    document.addEventListener('click', e => {
        if (root.classList.contains('icx-nav-open') && !header?.contains(e.target)) { setNav(false); }
    }, { signal });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && root.classList.contains('icx-nav-open')) { setNav(false); toggle.focus(); }
    }, { signal });
    // Widening past the breakpoint puts the links back in the bar.
    window.matchMedia('(max-width: 759px)').addEventListener('change', e => { if (!e.matches) { setNav(false); } }, { signal });
    signal.addEventListener('abort', () => { toggle.remove(); root.classList.remove('icx-nav-open'); });
})();
