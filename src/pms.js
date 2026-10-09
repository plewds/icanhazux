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
//
// The window can also float (Floating, below): the same element, never
// moved out of the page, positioned by the stylesheet over the room.
(function () {
    'use strict';

    const { store, el, signal, onRetire, removeStale, icon } = globalThis.ICX;

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

    globalThis.ICX.pms = {
        reopen: name => reopen(name, { focus: true }),
        // Kept PMs (pmlog.js) brings conversations back closed, as if their × was clicked.
        close: name => { const li = tabOf(name); if (li && !li.classList.contains('icx-pm-closed')) { close(li); } },
    };

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

    // ── Floating ────────────────────────────────────────────────────────────
    // Docked (above) or floating over the room: html[data-icx-pm="floating"]
    // and the window's place and size in --icx-pmf-x/y/w/h on <html>. The
    // stylesheet does the rest: as with the cam grid, a stylesheet
    // !important rule outranks the site's inline rewrites of #tabs, and the
    // element stays where the site put it, so its PM code keeps working.
    //
    // Moved by its tab strip (a few pixels of slack, so a click on a tab is
    // still a click), resized from the corner grip, docked again by dropping
    // it on the top of the chat or with the button at the end of the strip.
    // On narrow windows the room is one column, and the PMs stay docked.

    const root = document.documentElement;
    const narrow = window.matchMedia('(max-width: 900px)');
    const MIN_W = 260;
    const MIN_H = 200;
    const DRAG_SLACK = 5;
    const DOCK_ZONE = 90;         // px from the top of the chat card that docks on drop

    let mode = store.get('pmMode') === 'floating' ? 'floating' : 'docked';
    let rect = store.get('pmFloat', null);
    const floating = () => mode === 'floating' && !narrow.matches;

    // Pop out / dock: a button at the end of the tab strip. Not a tab (the
    // site's tabs widget only counts <li>s), re-added if the site rebuilds
    // the strip.
    removeStale('icx-pm-mode');
    const modeBtn = el('button', { type: 'button', id: 'icx-pm-mode' });
    modeBtn.addEventListener('click', e => {
        e.stopPropagation();
        setMode(mode === 'floating' ? 'docked' : 'floating');
    });
    function placeButton() {
        const strip = tabs.querySelector(':scope > ul');
        if (strip && modeBtn.parentElement !== strip) { strip.append(modeBtn); }
    }
    const stripObserver = new MutationObserver(placeButton);
    stripObserver.observe(tabs, { childList: true });
    onRetire(() => stripObserver.disconnect());
    placeButton();

    removeStale('icx-pm-grip');
    const grip = el('div', {
        id: 'icx-pm-grip',
        role: 'separator',
        tabindex: '0',
        'aria-label': 'Resize private messages',
        title: 'Drag to resize',
    });
    tabs.after(grip);

    function defaultRect() {
        const c = chat.getBoundingClientRect();
        const w = Math.round(Math.min(420, Math.max(MIN_W, c.width - 32)));
        return { x: Math.round(c.right - w - 16), y: Math.round(c.top + 16), w, h: 360 };
    }
    // Keep it on screen, and at least its minimum size.
    function fit(r) {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const w = Math.round(Math.min(Math.max(MIN_W, r.w), vw - 8));
        const h = Math.round(Math.min(Math.max(MIN_H, r.h), vh - 8));
        return {
            w, h,
            x: Math.round(Math.min(Math.max(4, r.x), vw - w - 4)),
            y: Math.round(Math.min(Math.max(4, r.y), vh - Math.min(h, 48) - 4)),
        };
    }
    function applyFloat() {
        const on = floating();
        if (on) {
            rect = fit(rect || defaultRect());
            root.style.setProperty('--icx-pmf-x', `${rect.x}px`);
            root.style.setProperty('--icx-pmf-y', `${rect.y}px`);
            root.style.setProperty('--icx-pmf-w', `${rect.w}px`);
            root.style.setProperty('--icx-pmf-h', `${rect.h}px`);
        }
        if (mode === 'floating') { root.dataset.icxPm = 'floating'; } else { delete root.dataset.icxPm; }
        const label = on ? 'Dock in the chat' : 'Pop out into a window';
        modeBtn.replaceChildren(icon(on ? 'dock' : 'popout'));
        modeBtn.title = label;
        modeBtn.setAttribute('aria-label', label);
        modeBtn.hidden = narrow.matches;
    }
    function setMode(next) {
        mode = next === 'floating' ? 'floating' : 'docked';
        store.set('pmMode', mode);
        applyFloat();
        globalThis.ICX.controls?.changed('pmMode');
    }
    globalThis.ICX.pms.setMode = setMode;
    applyFloat();
    narrow.addEventListener('change', applyFloat, { signal });
    window.addEventListener('resize', () => { if (floating()) { applyFloat(); } }, { signal });
    signal.addEventListener('abort', () => {
        delete root.dataset.icxPm;
        ['x', 'y', 'w', 'h'].forEach(k => root.style.removeProperty(`--icx-pmf-${k}`));
    });

    const save = () => store.set('pmFloat', rect);

    // Moving: by the tab strip, tabs included, past a little slack.
    let move = null;
    let swallowClick = false;
    function overDock(e) {
        const c = chat.getBoundingClientRect();
        return e.clientX >= c.left && e.clientX <= c.right && e.clientY >= c.top && e.clientY <= c.top + DOCK_ZONE;
    }
    tabs.addEventListener('pointerdown', e => {
        if (!floating() || e.button !== 0) { return; }
        const strip = e.target.closest('ul');
        if (!strip || strip.parentElement !== tabs || e.target.closest('#icx-pm-mode, .ui-icon-close')) { return; }
        move = { x: e.clientX, y: e.clientY, from: { ...rect }, id: e.pointerId, moving: false };
    }, { signal });
    tabs.addEventListener('pointermove', e => {
        if (!move || e.pointerId !== move.id) { return; }
        const dx = e.clientX - move.x;
        const dy = e.clientY - move.y;
        if (!move.moving) {
            if (Math.hypot(dx, dy) < DRAG_SLACK) { return; }
            move.moving = true;
            tabs.setPointerCapture(e.pointerId);
            root.classList.add('icx-moving-pm');
        }
        rect = fit({ ...move.from, x: move.from.x + dx, y: move.from.y + dy });
        applyFloat();
        chat.classList.toggle('icx-pm-dock-target', overDock(e));
    }, { signal });
    const endMove = e => {
        if (!move) { return; }
        const moved = move.moving;
        move = null;
        root.classList.remove('icx-moving-pm');
        chat.classList.remove('icx-pm-dock-target');
        if (!moved) { return; }
        swallowClick = true;           // the click that ends a drag isn't a tab click
        setTimeout(() => { swallowClick = false; }, 0);
        if (e && e.type === 'pointerup' && overDock(e)) { setMode('docked'); } else { save(); }
    };
    // The tabs are links: dragging one would start the browser's own
    // drag-and-drop, which cancels the move.
    tabs.addEventListener('dragstart', e => {
        if (floating() && e.target.closest?.('ul')?.parentElement === tabs) { e.preventDefault(); }
    }, { signal });
    tabs.addEventListener('pointerup', endMove, { signal });
    tabs.addEventListener('pointercancel', endMove, { signal });
    tabs.addEventListener('click', e => {
        if (!swallowClick) { return; }
        swallowClick = false;
        e.preventDefault();
        e.stopImmediatePropagation();
    }, { capture: true, signal });

    // Resizing: the corner grip, or its arrow keys.
    let size = null;
    grip.addEventListener('pointerdown', e => {
        if (e.button !== 0) { return; }
        size = { x: e.clientX, y: e.clientY, from: { ...rect } };
        grip.setPointerCapture(e.pointerId);
        root.classList.add('icx-resizing-pmf');
        e.preventDefault();
    });
    grip.addEventListener('pointermove', e => {
        if (!size) { return; }
        rect = fit({ ...size.from, w: size.from.w + e.clientX - size.x, h: size.from.h + e.clientY - size.y });
        applyFloat();
    });
    const endSize = () => {
        if (!size) { return; }
        size = null;
        root.classList.remove('icx-resizing-pmf');
        save();
    };
    grip.addEventListener('pointerup', endSize);
    grip.addEventListener('pointercancel', endSize);
    grip.addEventListener('lostpointercapture', endSize);
    grip.addEventListener('keydown', e => {
        const step = e.shiftKey ? 40 : 10;
        const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
        if (!d) { return; }
        e.preventDefault();
        rect = fit({ ...rect, w: rect.w + d[0], h: rect.h + d[1] });
        applyFloat();
        save();
    });
})();
