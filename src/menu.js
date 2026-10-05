// "| ichux" in the site header, on every page (rooms included), opening
// ICHUX Settings: the
// extension's appearance settings, theme and accent (controls.js), which
// apply everywhere. Settings that only change chat stay in the chat bar's
// panel in rooms.
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
        'aria-label': 'ICHUX Settings', title: 'ICHUX Settings: theme and accent', text: 'ichux',
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
    const shared = [theme, accent].filter(Boolean);

    const close = el('button', { type: 'button', class: 'icx-panel-close', 'aria-label': 'Close', text: '\u00d7' });
    const panel = el('div', { id: 'icx-site-settings', role: 'dialog', 'aria-label': 'ICHUX Settings', hidden: '' }, [
        el('div', { class: 'icx-panel-head' }, [el('div', { class: 'icx-panel-title', text: 'ICHUX Settings' }), close]),
        ...shared.map(c => c.node),
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
})();
