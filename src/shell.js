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

    const { store, el, signal, onRetire } = globalThis.ICX;

    const DEFAULT_FRACTION = 0.62;   // share of the stage width given to cams
    const MIN_CAMS_PX = 320;
    const MIN_SIDE_PX = 300;

    function init(body) {
        const root = document.documentElement;
        root.classList.add('icx');
        // Nothing in a room submits its <form> on purpose: every button runs
        // through the site's scripts. But most of them are submit buttons (no
        // type), and the handlers that cancel that aren't always attached:
        // the cam buttons get theirs only once a stream connects, and the
        // broadcast panel's camera and mic buttons lose theirs after a camera
        // error. A click then reloads the page. (Script calls to
        // form.submit() don't fire this event, so they're unaffected.)
        const form = body.closest('form');
        if (form) { form.addEventListener('submit', e => e.preventDefault(), { signal }); }
        // Pieces left by an older copy of the extension (see core.js). The
        // site's own elements inside them get moved into the new ones below,
        // then these go.
        const stale = ['icx-divider', 'icx-bar', 'icx-drawer']
            .flatMap(id => [...document.querySelectorAll(`#${id}`)]);

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
        stale.forEach(n => n.remove());

        // `chosen` is the split you set; `fraction` is what's shown, the
        // chosen split squeezed to fit the window. A narrow window squeezes
        // only what's shown: widening it again brings back what you chose
        // (overwriting the choice left the chat the wrong width until a
        // reload).
        let chosen = Number(store.get('camsFraction', DEFAULT_FRACTION)) || DEFAULT_FRACTION;
        let fraction = clampFraction(chosen);
        apply();
        const choose = f => { fraction = clampFraction(f); chosen = fraction; apply(); };

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
            choose((e.clientX - rect.left) / rect.width);
        });
        const finish = () => {
            if (!dragging) { return; }
            dragging = false;
            root.classList.remove('icx-resizing');
            store.set('camsFraction', fraction);
            document.dispatchEvent(new CustomEvent('icx:divider-end'));
        };
        divider.addEventListener('pointerup', finish);
        divider.addEventListener('pointercancel', finish);
        divider.addEventListener('lostpointercapture', finish);
        divider.addEventListener('dblclick', () => {
            choose(DEFAULT_FRACTION);
            store.set('camsFraction', fraction);
        });
        divider.addEventListener('keydown', e => {
            const step = e.shiftKey ? 0.05 : 0.01;
            if (e.key === 'ArrowLeft') { choose(fraction - step); }
            else if (e.key === 'ArrowRight') { choose(fraction + step); }
            else { return; }
            e.preventDefault();
            store.set('camsFraction', fraction);
        });

        window.addEventListener('resize', () => {
            fitHeight();
            fraction = clampFraction(chosen);
            apply();
        }, { signal });
        fitHeight();
        // The site's header can settle a moment after load (logo, topic).
        setTimeout(fitHeight, 500);
        setTimeout(fitHeight, 2000);

        globalThis.ICX.shell = { bar };
        document.dispatchEvent(new CustomEvent('icx:shell-ready'));
    }

    // ── User list drawer ────────────────────────────────────────────────────
    // A bar under the chat showing the head count; clicking it opens the
    // people panel (people.js) over the bottom of the chat. The site's own
    // list moves in too, hidden: it's the panel's source.
    function initDrawer(body) {
        const list = document.getElementById('activeUserList');
        if (!list) { return; }
        const label = el('span', { class: 'icx-drawer-label', text: 'People' });
        const toggle = el('button', {
            type: 'button',
            id: 'icx-drawer-toggle',
            'aria-controls': 'icx-people',
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
        }, { signal });
        // Clicking elsewhere closes it, but not clicks in the site's popups
        // (user info, gifts), which open from names in the list.
        document.addEventListener('pointerdown', e => {
            if (!drawer.classList.contains('icx-open') || drawer.contains(e.target)) { return; }
            if (e.target.closest('.ui-dialog, .ui-widget-overlay, [role="dialog"]')) { return; }
            setOpen(false);
        }, { signal });
        // It stays open while you look through people (a profile and the
        // next), and closes once you act on one: the cursor lands in the
        // chat box (whisper and @ fill it in and put you there) or a PM's
        // box, or a PM conversation opens. Those start from the profile
        // popup, whose clicks the rule above lets through, and the drawer's
        // shade was left over the PM.
        document.addEventListener('focusin', e => {
            if (drawer.classList.contains('icx-open') && e.target.closest?.('#txtMsg, #tabs')) { setOpen(false); }
        }, { signal });
        const tabs = document.getElementById('tabs');
        if (tabs) {
            const convos = () => tabs.querySelectorAll('[role="tab"]').length;
            const showing = () => getComputedStyle(tabs).display !== 'none' && getComputedStyle(tabs).visibility !== 'hidden';
            let seen = convos();
            let shown = showing();
            const pmObserver = new MutationObserver(() => {
                const n = convos(), now = showing();
                if ((n > seen || (now && !shown)) && drawer.classList.contains('icx-open')) { setOpen(false); }
                seen = n;
                shown = now;
            });
            pmObserver.observe(tabs, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
            onRetire(() => pmObserver.disconnect());
        }
        // The text color picker (#colorDiv, in the chat bar) and the open
        // drawer take the same spot, and the drawer is a layer above the
        // whole chat card, so it covered the picker and its OK button. Only
        // one at a time: the picker showing closes the drawer, and opening
        // the drawer puts the picker away (as Cancel would; the site sets
        // the wheel back to your color whenever it opens it again).
        const picker = document.getElementById('colorDiv');
        if (picker) {
            const pickerShown = () => getComputedStyle(picker).display !== 'none';
            const pickerObserver = new MutationObserver(() => {
                if (pickerShown() && drawer.classList.contains('icx-open')) { setOpen(false); }
            });
            pickerObserver.observe(picker, { attributes: true, attributeFilter: ['style', 'class'] });
            onRetire(() => pickerObserver.disconnect());
            toggle.addEventListener('click', () => {
                if (drawer.classList.contains('icx-open') && pickerShown()) { picker.style.display = 'none'; }
            });
        }

        // The site's list text starts "172 people (refresh) [click for details]: …".
        const syncCount = () => {
            const m = (list.textContent || '').match(/(\d+)\s+people/i);
            label.textContent = m ? `${m[1]} people` : 'People';
        };
        const countObserver = new MutationObserver(syncCount);
        countObserver.observe(list, { childList: true, subtree: true, characterData: true });
        onRetire(() => countObserver.disconnect());
        syncCount();
    }

    // Only rooms get the stage (site.js decides); the rest of the site just
    // gets the shared header and footer.
    if (globalThis.ICX.isRoom) {
        init(document.getElementById('body_container'));
    }
})();
