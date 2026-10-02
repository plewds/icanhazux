// Page shell: turns the site's fixed-width room into a full-window two-column
// stage — cams on the left, chat on the right — with a draggable divider.
//
// The room markup is:
//   #body_container
//     #cams            (cam slots, plus the site's cam buttons)
//     #chat_container  (chat log, input, command bar)
//     #activeUserList
//     #footer
// #body_container becomes a CSS grid and the existing children are placed
// into it. Only two things move: the site's cam buttons (into the bar under
// the cams) and the user list (into a drawer under the chat). Both keep their
// ids, which is how the site finds them.
(function () {
    'use strict';

    const { store, el } = globalThis.ICX;

    const DEFAULT_FRACTION = 0.62;   // share of the stage width given to cams
    const MIN_CAMS_PX = 320;
    const MIN_SIDE_PX = 300;

    function init(body) {
        const root = document.documentElement;
        root.classList.add('icx');

        const divider = el('div', {
            id: 'icx-divider',
            role: 'separator',
            'aria-orientation': 'vertical',
            'aria-label': 'Resize cams and chat',
            tabindex: '0',
            title: 'Drag to resize · double-click to reset',
        });
        const bar = el('div', { id: 'icx-bar' });
        body.append(divider, bar);

        // The site's own cam buttons live inside #cams with absolute offsets it
        // keeps rewriting. Move the useful ones into the bar under the cams.
        // They keep their ids and javascript: hrefs, so the site still drives them.
        for (const id of ['camRefresh', 'camVisibility']) {
            const btn = document.getElementById(id);
            if (btn) { bar.append(btn); }
        }

        initDrawer(body);

        let fraction = clampFraction(store.get('camsFraction', DEFAULT_FRACTION));
        apply();

        function stageWidth() {
            return body.getBoundingClientRect().width || window.innerWidth;
        }

        function clampFraction(f) {
            const w = stageWidth();
            const min = Math.min(0.9, MIN_CAMS_PX / w);
            const max = Math.max(min, 1 - MIN_SIDE_PX / w);
            return Math.min(max, Math.max(min, Number(f) || DEFAULT_FRACTION));
        }

        function apply() {
            root.style.setProperty('--icx-cams-fraction', String(fraction));
            divider.setAttribute('aria-valuenow', String(Math.round(fraction * 100)));
        }

        function fitHeight() {
            // Stage fills the window below whatever header sits above it.
            const top = Math.max(0, body.getBoundingClientRect().top + window.scrollY);
            root.style.setProperty('--icx-stage-top', `${Math.round(top)}px`);
        }

        let dragging = false;
        divider.addEventListener('pointerdown', e => {
            if (e.button !== 0) { return; }
            dragging = true;
            divider.setPointerCapture(e.pointerId);
            root.classList.add('icx-resizing');
            e.preventDefault();
        });
        divider.addEventListener('pointermove', e => {
            if (!dragging) { return; }
            const rect = body.getBoundingClientRect();
            fraction = clampFraction((e.clientX - rect.left) / rect.width);
            apply();
        });
        const finish = () => {
            if (!dragging) { return; }
            dragging = false;
            root.classList.remove('icx-resizing');
            store.set('camsFraction', fraction);
        };
        divider.addEventListener('pointerup', finish);
        divider.addEventListener('pointercancel', finish);
        divider.addEventListener('lostpointercapture', finish);
        divider.addEventListener('dblclick', () => {
            fraction = clampFraction(DEFAULT_FRACTION);
            apply();
            store.set('camsFraction', fraction);
        });
        divider.addEventListener('keydown', e => {
            const step = e.shiftKey ? 0.05 : 0.01;
            if (e.key === 'ArrowLeft') { fraction = clampFraction(fraction - step); }
            else if (e.key === 'ArrowRight') { fraction = clampFraction(fraction + step); }
            else { return; }
            e.preventDefault();
            apply();
            store.set('camsFraction', fraction);
        });

        window.addEventListener('resize', () => {
            fitHeight();
            fraction = clampFraction(fraction);
            apply();
        });
        fitHeight();
        // The site's header can settle a moment after load (logo, topic).
        setTimeout(fitHeight, 500);
        setTimeout(fitHeight, 2000);

        globalThis.ICX.shell = { bar };
        document.dispatchEvent(new CustomEvent('icx:shell-ready'));
    }

    // ── User list drawer ────────────────────────────────────────────────────
    // A bar under the chat showing the head count; clicking it opens the
    // site's user list as a panel over the bottom of the chat.
    function initDrawer(body) {
        const list = document.getElementById('activeUserList');
        if (!list) { return; }
        const label = el('span', { class: 'icx-drawer-label', text: 'People' });
        const toggle = el('button', {
            type: 'button',
            id: 'icx-drawer-toggle',
            'aria-controls': 'activeUserList',
            'aria-expanded': 'false',
        }, [label, el('span', { class: 'icx-drawer-chevron', 'aria-hidden': 'true' })]);
        const drawer = el('div', { id: 'icx-drawer' }, [toggle]);
        body.append(drawer);
        drawer.prepend(list);

        const setOpen = open => {
            drawer.classList.toggle('icx-open', open);
            toggle.setAttribute('aria-expanded', String(open));
            store.set('drawerOpen', open);
        };
        setOpen(!!store.get('drawerOpen', false));
        toggle.addEventListener('click', () => setOpen(!drawer.classList.contains('icx-open')));
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && drawer.classList.contains('icx-open')) { setOpen(false); }
        });
        // Clicking elsewhere closes it, but not clicks in the site's popups
        // (user info, gifts), which open from names in the list.
        document.addEventListener('pointerdown', e => {
            if (!drawer.classList.contains('icx-open') || drawer.contains(e.target)) { return; }
            if (e.target.closest('.ui-dialog, .ui-widget-overlay, [role="dialog"]')) { return; }
            setOpen(false);
        });

        // The site's list text starts "172 people (refresh) [click for details]: …".
        const syncCount = () => {
            const m = (list.textContent || '').match(/(\d+)\s+people/i);
            label.textContent = m ? `${m[1]} people` : 'People';
        };
        new MutationObserver(syncCount).observe(list, { childList: true, subtree: true, characterData: true });
        syncCount();
    }

    // Content scripts run at document_idle, so a room page's markup is all
    // there; anything else (lobby, profile pages) is left alone.
    const body = document.getElementById('body_container');
    if (body && document.getElementById('cams') && document.getElementById('chat_container')) {
        init(body);
    }
})();
