// Private messages. The site's PM window (#tabs: jQuery UI tabs, one per
// conversation) floats where the site's old fixed layout put it, often off
// screen. The stylesheet docks it at the top of the chat card instead,
// splitting the card: the chat log shrinks below it, so the newest lines
// stay in view. Tabs run across the top.
//
// This adds the handle under the PMs for resizing the split (remembered),
// and a hint on the tab strip. It also changes what a tab's × does: the site
// deletes the conversation; here it's hidden instead (.icx-pm-closed), and
// comes back from the chat bar's Closed menu, when that person messages
// again, or when you start a PM with them from their profile (page.js tells
// this script about every PM delivered). The site's own PM code (sending,
// receiving, unread marking) is otherwise untouched.
(function () {
    'use strict';

    const { store, el, signal, removeStale } = globalThis.ICX;

    const container = document.getElementById('pm_container');
    const tabs = document.getElementById('tabs');
    const chat = document.getElementById('chat_container');
    if (!globalThis.ICX.isRoom || !container || !tabs || !chat) { return; }

    const MIN_PX = 120;
    const MIN_LOG_PX = 140;     // chat log kept below the PMs
    const DEFAULT_PX = 220;

    // ── Closing hides; reopening brings the conversation back ───────────────

    const tabOf = name => document.getElementById(`pm_${name}`);
    const visibleTabs = () => [...tabs.querySelectorAll(':scope > ul > li:not(.icx-pm-closed)')];
    const isOpen = li => li.getAttribute('aria-selected') === 'true';
    // Tab switches go through the tab's own link, so the site's tabs widget
    // stays in charge (clicking the open one collapses it).
    const press = li => li.querySelector('a')?.click();

    function close(li) {
        const wasOpen = isOpen(li);
        li.classList.add('icx-pm-closed');
        const rest = visibleTabs();
        if (wasOpen) { rest.length ? press(rest[0]) : press(li); }
        tabs.classList.toggle('icx-pm-none', !rest.length);
    }

    function reopen(name, { focus = false } = {}) {
        const li = tabOf(name);
        if (!li) { return; }
        li.classList.remove('icx-pm-closed');
        tabs.classList.remove('icx-pm-none');
        if (focus || visibleTabs().length === 1) {
            if (!isOpen(li)) { press(li); }
            if (focus) { document.getElementById(`txt_to_${name}`)?.focus(); }
        }
    }

    // Before the site's own handler (delegated on #tabs), which deletes it.
    tabs.addEventListener('click', e => {
        const x = e.target.closest('.ui-icon-close');
        const li = x && x.closest('li');
        if (!li || !tabs.contains(li)) { return; }
        e.preventDefault();
        e.stopImmediatePropagation();
        close(li);
    }, { capture: true, signal });

    // Every PM the site delivers (page.js). A closed conversation it lands
    // in comes back, unread; one started from a profile opens, focused.
    document.addEventListener('icx:pm', e => {
        let pm;
        try { pm = JSON.parse(e.detail); } catch (_) { return; }
        const li = tabOf(pm.name);
        if (!li) { return; }
        if (li.classList.contains('icx-pm-closed') || pm.explicit) { reopen(pm.name, { focus: pm.explicit }); }
        // A new conversation while every other one is closed: show the window.
        else if (tabs.classList.contains('icx-pm-none')) { reopen(pm.name); }
    }, { signal });

    globalThis.ICX.pms = { reopen: name => reopen(name, { focus: true }) };

    // ── Resizing the split ──────────────────────────────────────────────────

    removeStale('icx-pm-resize');
    const handle = el('div', {
        id: 'icx-pm-resize',
        role: 'separator',
        'aria-orientation': 'horizontal',
        'aria-label': 'Resize private messages',
        tabindex: '0',
        title: 'Drag to resize · double-click to reset',
    });
    tabs.after(handle);

    const nav = tabs.querySelector(':scope > ul');
    if (nav) { nav.title = 'Click a tab to open it, or the open one again to minimize · alt+1, alt+2… to switch'; }

    // Height of the open conversation (the tab strip sits above it).
    function clamp(px) {
        const log = document.getElementById('txt');
        const room = (log ? log.getBoundingClientRect().height : 0) + panelHeight();
        const max = Math.max(MIN_PX, room - MIN_LOG_PX);
        return Math.round(Math.min(max, Math.max(MIN_PX, Number(px) || DEFAULT_PX)));
    }
    function panelHeight() {
        const open = tabs.querySelector(':scope > .ui-tabs-panel[aria-hidden="false"]');
        return open ? open.getBoundingClientRect().height : 0;
    }
    let height = Number(store.get('pmHeight', DEFAULT_PX)) || DEFAULT_PX;
    const apply = () => {
        chat.style.setProperty('--icx-pm-h', `${height}px`);
        handle.setAttribute('aria-valuenow', String(height));
    };
    apply();

    let drag = null;
    handle.addEventListener('pointerdown', e => {
        if (e.button !== 0) { return; }
        drag = { y: e.clientY, from: panelHeight() || height };
        handle.setPointerCapture(e.pointerId);
        document.documentElement.classList.add('icx-resizing-pm');
        e.preventDefault();
    });
    handle.addEventListener('pointermove', e => {
        if (!drag) { return; }
        height = clamp(drag.from + e.clientY - drag.y);
        apply();
    });
    const finish = () => {
        if (!drag) { return; }
        drag = null;
        document.documentElement.classList.remove('icx-resizing-pm');
        store.set('pmHeight', height);
    };
    handle.addEventListener('pointerup', finish);
    handle.addEventListener('pointercancel', finish);
    handle.addEventListener('lostpointercapture', finish);
    handle.addEventListener('dblclick', () => {
        height = clamp(DEFAULT_PX);
        apply();
        store.set('pmHeight', height);
    });
    handle.addEventListener('keydown', e => {
        const step = e.shiftKey ? 40 : 10;
        if (e.key === 'ArrowUp') { height = clamp(height - step); }
        else if (e.key === 'ArrowDown') { height = clamp(height + step); }
        else { return; }
        e.preventDefault();
        apply();
        store.set('pmHeight', height);
    });
    // A shorter window leaves less room for the split.
    window.addEventListener('resize', () => {
        if (!panelHeight()) { return; }
        const fitted = clamp(height);
        if (fitted !== height) { height = fitted; apply(); }
    }, { signal });
})();
