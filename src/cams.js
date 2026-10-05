// Cam grid: justified layout, focus mode, per-cam refresh and hide, and
// drag-to-reorder.
//
// The site's cam markup (one per slot, 15 fixed slots):
//   #cams > div#slotN.rounded_square            ← site rewrites inline top/left/width/height
//     div#id-<camId>.videocontainer             ← present only while the slot holds a cam
//       span#name-<camId>.name-on-cam           ← username
//       button#cambtn1-<camId>                  "fullscreen"
//       button#cambtn1-<camId>-retry            "start"
//       button#cambtn2-<camId>                  "disable"
//       video#vid-<camId>
// Empty slots have no children. A slot is reused for a different cam later,
// so everything here is keyed by username, never by slot.
//
// Placement is written as custom properties and applied by a stylesheet
// !important rule (styles/icanhazux.css). The site periodically rewrites
// left/top/width/height inline on every slot without !important, which a
// stylesheet !important outranks, and it never touches custom properties.
(function () {
    'use strict';

    const { store, frameThrottle, el, ICONS, alive, signal, onRetire } = globalThis.ICX;
    const { packGrid, packFocused, quantize } = globalThis.ICX_PACK;

    const DEFAULT_AR = 4 / 3;
    const FOCUS_ABSENT_MS = 2 * 60 * 1000;  // forget a focus whose cam has been gone this long
    const DRAG_THRESHOLD = 6;

    // Hiding a cam also presses the site's own "disable" on it. The site's
    // disable (aT in scripts110725.js) stops that cam's WebRTC connection and
    // shows a poster, so a hidden feed stops downloading instead of streaming
    // into an invisible box. Its "start" (aW) rebuilds the cam from scratch.
    const STOP_HIDDEN_STREAMS = true;
    // The disable button only gets its handler once the stream has connected,
    // so a click on a cam that has just appeared can do nothing. Retry until
    // the site's disabled marker shows up.
    const STOP_RETRY_MS = 2500;

    const state = {
        hidden: new Set(loadHidden()),
        // Nicknames: hiding one lasts only while you're here (the name can
        // pass to someone else later). See "Nicknames" below.
        // Perma-nicks: nicknames you've said someone always uses (the
        // checkbox in the Hidden menu). Their hides are saved like any name.
        permaNicks: new Set(store.get('permaNicks', []) || []),
        nicks: new Set(loadSession('nicks')),
        sessionHidden: new Set(loadSession('hiddenNicks')),
        order: store.get('order', []),
        focus: store.get('focus', null),
        focusMissingSince: 0,
        drag: null,
        menuOpen: false,
        offCamOpen: false,
        seen: new Set(),       // cam ids that have been placed, for the pop-in
        lastPlaced: new Map(), // key → { rect, name } from the previous layout
        laidOut: false,
    };

    // Per-visit lists, in this tab's sessionStorage (gone when it closes).
    function loadSession(key) {
        try { const v = JSON.parse(sessionStorage.getItem(`icx_${key}`) || '[]'); return Array.isArray(v) ? v : []; } catch (_) { return []; }
    }
    function saveSession(key, set) {
        try { sessionStorage.setItem(`icx_${key}`, JSON.stringify([...set])); } catch (_) {}
    }
    const isHidden = key => state.hidden.has(key) || state.sessionHidden.has(key);
    const isNick = key => state.nicks.has(key) || state.permaNicks.has(key);

    function loadHidden() {
        const saved = store.get('hidden', null);
        if (Array.isArray(saved)) { return saved; }
        // First run: carry over icanhazbetter's hidden-cam list if there is one.
        try {
            const legacy = JSON.parse(localStorage.getItem('ichc_blocked') || '[]');
            if (Array.isArray(legacy) && legacy.length) {
                store.set('hidden', legacy);
                return legacy;
            }
        } catch (_) {}
        return [];
    }

    // ── Reading the site's cams ─────────────────────────────────────────────

    function readSlot(slot) {
        const vc = slot.querySelector(':scope > .videocontainer');
        if (!vc) { return null; }
        const camId = vc.id.replace(/^id-/, '');
        const name = (vc.querySelector('.name-on-cam')?.textContent || '').trim();
        if (!camId || !name) { return null; }
        return { slot, vc, camId, name, key: name.toLowerCase(), video: vc.querySelector('video') };
    }

    function readCams(cams) {
        return [...cams.querySelectorAll(':scope > .rounded_square')].map(readSlot).filter(Boolean);
    }

    function aspectOf(cam) {
        const v = cam.video;
        const ar = v && v.videoWidth > 0 && v.videoHeight > 0 ? v.videoWidth / v.videoHeight : DEFAULT_AR;
        // Clamp pathological feeds so one cam can't wreck the layout.
        return Math.min(2.4, Math.max(0.5, ar));
    }

    // Press one of the site's own cam buttons. They sit inside the page's
    // <form> with no type, so to the browser they're submit buttons. The
    // site's click handlers cancel that, but they're only attached once the
    // stream connects; pressing earlier submitted the form and reloaded the
    // page (and with a hidden cam in the room, the retry loop kept doing it).
    // So the form submit is always blocked here; the site's handler, when
    // it's there, still runs.
    function clickNative(id) {
        const btn = document.getElementById(id);
        if (!btn) { return false; }
        btn.addEventListener('click', e => e.preventDefault(), { capture: true, once: true });
        btn.click();
        return true;
    }

    // ── Per-cam controls ────────────────────────────────────────────────────

    function decorate(cam) {
        const { slot } = cam;
        if (slot.dataset.icxCam === cam.camId && slot.querySelector(':scope > .icx-tools')) { return; }
        slot.dataset.icxCam = cam.camId;
        slot.querySelector(':scope > .icx-tools')?.remove();
        slot.append(el('div', { class: 'icx-tools' }, [
            el('button', { type: 'button', class: 'icx-btn', 'data-act': 'focus', title: 'Focus', 'aria-label': 'Focus cam', html: ICONS.focus }),
            el('button', { type: 'button', class: 'icx-btn', 'data-act': 'refresh', title: 'Refresh feed', 'aria-label': 'Refresh cam feed', html: ICONS.refresh }),
            el('button', { type: 'button', class: 'icx-btn', 'data-act': 'fullscreen', title: 'Full screen', 'aria-label': 'Full screen', html: ICONS.fullscreen }),
            el('button', { type: 'button', class: 'icx-btn', 'data-act': 'hide', title: 'Hide this cam', 'aria-label': 'Hide cam', html: ICONS.hide }),
        ]));
    }

    function syncFocusButton(cam, focused) {
        const btn = cam.slot.querySelector('.icx-btn[data-act="focus"]');
        if (!btn || btn.dataset.on === String(focused)) { return; }
        btn.dataset.on = String(focused);
        btn.innerHTML = focused ? ICONS.unfocus : ICONS.focus;
        btn.title = focused ? 'Unfocus' : 'Focus';
        btn.setAttribute('aria-label', focused ? 'Unfocus cam' : 'Focus cam');
    }

    // Restart one feed with the site's own disable → start sequence. That tears
    // down just this inbound connection and negotiates a fresh one.
    function refresh(cam) {
        cam.slot.classList.add('icx-refreshing');
        setTimeout(() => cam.slot.classList.remove('icx-refreshing'), 2500);
        clickNative(`cambtn2-${cam.camId}`);
        setTimeout(() => clickNative(`cambtn1-${cam.camId}-retry`), 200);
    }

    function setHidden(key, hidden) {
        if (hidden && state.permaNicks.has(key)) { state.hidden.add(key); }
        else if (hidden && state.nicks.has(key)) { state.sessionHidden.add(key); }
        else if (hidden) { state.hidden.add(key); checkNick(key); }
        else { state.hidden.delete(key); state.sessionHidden.delete(key); state.permaNicks.delete(key); }
        store.set('hidden', [...state.hidden]);
        store.set('permaNicks', [...state.permaNicks]);
        saveSession('hiddenNicks', state.sessionHidden);
        if (hidden && state.focus === key) { setFocus(null); }
        renderMenu();
        schedule();
    }

    // Perma-nick on: a nickname's hide is saved for future visits. Off:
    // back to this visit only.
    function setPerma(key, on) {
        if (on) { state.permaNicks.add(key); state.sessionHidden.delete(key); state.hidden.add(key); }
        else { state.permaNicks.delete(key); state.hidden.delete(key); state.sessionHidden.add(key); state.nicks.add(key); saveSession('nicks', state.nicks); }
        store.set('hidden', [...state.hidden]);
        store.set('permaNicks', [...state.permaNicks]);
        saveSession('hiddenNicks', state.sessionHidden);
        renderMenu();
    }

    function setFocus(key) {
        state.focus = key;
        state.focusMissingSince = 0;
        if (key) { store.set('focus', key); } else { store.remove('focus'); }
        schedule();
    }

    // The site marks a disabled cam by putting <video id="id-<camId>-disabled">
    // in its container.
    function isStopped(cam) {
        return !!document.getElementById(`id-${cam.camId}-disabled`);
    }

    // Keep hidden cams hidden (and stopped) as they come and go. Returns true
    // while a stop is still pending, so the caller can check back.
    function applyHidden(cam) {
        const hidden = isHidden(cam.key);
        cam.slot.classList.toggle('icx-hidden', hidden);
        if (!STOP_HIDDEN_STREAMS) { return false; }
        const stopped = isStopped(cam);
        if (hidden && !stopped) {
            const last = Number(cam.slot.dataset.icxStopTry || 0);
            if (Date.now() - last >= STOP_RETRY_MS) {
                cam.slot.dataset.icxStopTry = String(Date.now());
                clickNative(`cambtn2-${cam.camId}`);
            }
            return true;
        }
        if (!hidden && stopped) {
            // Only cams this extension stopped come back; the site's own
            // disable button is replaced by ours, so that's all of them.
            clickNative(`cambtn1-${cam.camId}-retry`);
        }
        delete cam.slot.dataset.icxStopTry;
        return false;
    }

    // ── Hidden-cams menu (in the bar under the cams) ────────────────────────

    let menuBtn = null;
    let menu = null;

    // Who's broadcasting, as the server reports it (page.js): right even
    // with the site's cams hidden. Lowercased; null until the first report.
    let broadcasters = null;
    document.addEventListener('icx:broadcasters', e => {
        try { broadcasters = new Set(JSON.parse(e.detail).map(n => String(n).toLowerCase())); } catch (_) { return; }
        renderMenu();
    }, { signal });
    document.dispatchEvent(new CustomEvent('icx:broadcasters-get'));

    // The hidden list is kept across rooms. The menu splits it by whether
    // Show can do anything: people on cam here now (Show), and the rest,
    // folded away (Unhide: off the list, so they show next time they cam
    // up). The button counts only the first group.
    function buildMenu() {
        const bar = globalThis.ICX.shell?.bar;
        if (!bar || menuBtn) { return; }
        menuBtn = el('button', { type: 'button', id: 'icx-hidden-btn', 'aria-expanded': 'false' });
        menu = el('div', { id: 'icx-hidden-menu', hidden: '' });
        menuBtn.addEventListener('click', e => {
            e.stopPropagation();
            state.menuOpen = !state.menuOpen;
            renderMenu();
        });
        menu.addEventListener('change', e => {
            const box = e.target.closest('[data-perma]');
            if (box) { setPerma(box.dataset.perma, box.checked); }
        });
        menu.addEventListener('click', e => {
            e.stopPropagation();
            const show = e.target.closest('[data-show]');
            if (show) { setHidden(show.dataset.show, false); return; }
            if (e.target.closest('[data-offcam-toggle]')) { state.offCamOpen = !state.offCamOpen; renderMenu(); return; }
            if (e.target.closest('[data-unhide-all]')) {
                const { off } = splitHidden();
                off.forEach(name => { state.hidden.delete(name); state.sessionHidden.delete(name); state.permaNicks.delete(name); });
                store.set('hidden', [...state.hidden]);
                store.set('permaNicks', [...state.permaNicks]);
                saveSession('hiddenNicks', state.sessionHidden);
                renderMenu();
            }
        });
        // Only real clicks close it: stopping a hidden cam presses the site's
        // own button for it, which would otherwise shut the menu.
        document.addEventListener('click', e => {
            if (e.isTrusted && state.menuOpen) { state.menuOpen = false; renderMenu(); }
        }, { signal });
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && state.menuOpen) { state.menuOpen = false; renderMenu(); menuBtn.focus(); }
        }, { signal });
        bar.append(el('div', { id: 'icx-hidden' }, [menuBtn, menu]));
        renderMenu();
    }

    // Hidden names on cam here now, and the rest; each A–Z.
    function splitHidden(live = null) {
        live = live || new Set(readCams(document.getElementById('cams')).map(c => c.key));
        const onCam = name => live.has(name) || !!broadcasters?.has(name.toLowerCase());
        const names = [...new Set([...state.hidden, ...state.sessionHidden])].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
        return { on: names.filter(onCam), off: names.filter(n => !onCam(n)) };
    }

    function renderMenu(live = null) {
        if (!menuBtn) { return; }
        const { on, off } = splitHidden(live);
        const any = on.length + off.length > 0;
        if (!any) { state.menuOpen = false; }   // nothing to list: closed, so the button opens it next time
        menuBtn.textContent = `Hidden · ${on.length}`;
        menuBtn.title = off.length ? `${off.length} more hidden, not on cam` : '';
        menuBtn.disabled = !any;
        menuBtn.classList.toggle('icx-none-on', on.length === 0);
        menuBtn.setAttribute('aria-expanded', String(state.menuOpen && any));
        menu.hidden = !(state.menuOpen && any);
        // This runs on every layout pass, many times a second in a busy room.
        // Only rebuild the rows when they actually change: replacing them
        // between a press and its release swallowed the click.
        const signature = `${on.join('|')}/${off.join('|')}/${state.offCamOpen ? 1 : 0}/${[...state.nicks].join('|')}/${[...state.permaNicks].join('|')}`;
        if (menu.dataset.signature === signature) { return; }
        menu.dataset.signature = signature;
        // A nickname gets a "nick" pill and the Perma-nick box.
        const row = (name, label, icon) => el('div', { class: 'icx-hidden-row' }, [
            el('span', { text: name }, isNick(name) ? [el('em', { class: 'icx-nick-tag', text: 'nick' })] : []),
            el('span', { class: 'icx-hidden-actions' }, [
                isNick(name) ? el('label', {
                    class: 'icx-perma',
                    title: 'They always use this nickname: keep them hidden on future visits. Unchecked, hidden only while you’re here, since someone else could use it later.',
                }, [
                    el('input', { type: 'checkbox', 'data-perma': name, ...(state.permaNicks.has(name) ? { checked: '' } : {}) }),
                    'Perma-nick',
                ]) : '',
                el('button', { type: 'button', 'data-show': name, html: icon + `<span>${label}</span>` }),
            ]),
        ]);
        menu.replaceChildren(
            el('div', { class: 'icx-menu-title', text: 'Hidden, on cam now' }),
            ...(on.length ? on.map(name => row(name, 'Show', ICONS.show))
                : [el('div', { class: 'icx-hidden-empty', text: 'No one you’ve hidden is on cam.' })]),
            ...(off.length ? [
                el('button', {
                    type: 'button', class: 'icx-hidden-more', 'data-offcam-toggle': '',
                    'aria-expanded': String(!!state.offCamOpen),
                    text: `${off.length} more, not on cam ${state.offCamOpen ? '▾' : '▸'}`,
                }),
                ...(state.offCamOpen ? [
                    ...off.map(name => row(name, 'Unhide', '')),
                    el('button', { type: 'button', class: 'icx-hidden-more icx-hidden-clear', 'data-unhide-all': '', text: 'Unhide all not on cam' }),
                ] : []),
            ] : []),
        );
    }

    // ── Nicknames ───────────────────────────────────────────────────────────
    // Hiding is by the name on the cam. A nickname can change, and can pass
    // to someone else later, so:
    //   - when the room is told "jeff is now bob" (page.js: icx:nick), a hide
    //     on jeff moves to bob, and both count as nicknames;
    //   - hiding a name checks its profile (as opening it would), and a
    //     profile you open that says it's a nickname marks that name too;
    //   - hiding a nickname lasts only while you're here (this tab).
    // Only what the site already shows you; nothing links a nick to an
    // account.
    function markNick(name) {
        if (!name || state.nicks.has(name)) { return; }
        state.nicks.add(name);
        saveSession('nicks', state.nicks);
        renderMenu();
    }
    document.addEventListener('icx:nick', e => {
        let n;
        try { n = JSON.parse(e.detail); } catch (_) { return; }
        if (!n.from || !n.to) { return; }
        const wasHidden = isHidden(n.from);
        state.nicks.add(n.from);
        markNick(n.to);
        if (wasHidden) {
            // A saved hide on the old name stays (it may be their own name);
            // the new one is hidden while you're here.
            state.sessionHidden.delete(n.from);
            state.sessionHidden.add(n.to);
            saveSession('hiddenNicks', state.sessionHidden);
            if (state.focus === n.to) { setFocus(null); }
        }
        renderMenu();
        schedule();
    }, { signal });
    // Hiding a name not yet known as a nickname asks its profile (page.js),
    // once per visit; if it is one, the hide becomes this visit's only.
    const checked = new Set(loadSession('nickChecked'));
    function checkNick(name) {
        if (checked.has(name)) { return; }
        document.dispatchEvent(new CustomEvent('icx:nick-check', { detail: JSON.stringify({ name }) }));
    }
    document.addEventListener('icx:nick-result', e => {
        let r;
        try { r = JSON.parse(e.detail); } catch (_) { return; }
        if (!r.name || r.nick === null) { return; }   // couldn't tell: left as it was
        checked.add(r.name);
        saveSession('nickChecked', checked);
        if (!r.nick) { return; }
        markNick(r.name);
        if (state.hidden.has(r.name) && !state.permaNicks.has(r.name)) {
            state.hidden.delete(r.name);
            state.sessionHidden.add(r.name);
            store.set('hidden', [...state.hidden]);
            saveSession('hiddenNicks', state.sessionHidden);
            renderMenu();
        }
    }, { signal });

    // The site's profile popup says so when someone is using a nickname.
    const profile = document.getElementById('userinfo_dialog');
    if (profile) {
        const readProfile = () => {
            if (!/using a nickname/i.test(profile.textContent || '')) { return; }
            const title = profile.parentElement?.querySelector('.ui-dialog-title')?.textContent.trim();
            markNick(title);
        };
        const profileWatch = new MutationObserver(readProfile);
        profileWatch.observe(profile, { childList: true, subtree: true, characterData: true });
        onRetire(() => profileWatch.disconnect());
    }

    // ── Layout ──────────────────────────────────────────────────────────────

    function orderedVisible(cams) {
        const all = readCams(cams);
        const rank = new Map(state.order.map((k, i) => [k, i]));
        const visible = all.filter(c => !isHidden(c.key));
        // Known names keep their saved order; newcomers follow in slot order.
        visible.sort((a, b) => (rank.get(a.key) ?? Infinity) - (rank.get(b.key) ?? Infinity) ||
            all.indexOf(a) - all.indexOf(b));
        return { all, visible };
    }

    function update() {
        const cams = document.getElementById('cams');
        if (!cams || !alive()) { return; }
        const { all, visible } = orderedVisible(cams);
        all.forEach(decorate);
        const stopPending = all.map(applyHidden).some(Boolean);
        if (stopPending) { setTimeout(schedule, STOP_RETRY_MS); }

        // Focus survives short absences (a cam reconnecting) but not long ones.
        let focused = state.focus ? visible.find(c => c.key === state.focus) : null;
        if (state.focus && !focused && !isHidden(state.focus)) {
            if (!state.focusMissingSince) { state.focusMissingSince = Date.now(); }
            else if (Date.now() - state.focusMissingSince > FOCUS_ABSENT_MS) { setFocus(null); }
        } else {
            state.focusMissingSince = 0;
        }
        all.forEach(cam => syncFocusButton(cam, cam === focused));
        cams.classList.toggle('icx-has-focus', !!focused);

        // While the cams/chat divider is being dragged, the cams stay put:
        // re-packing at every pixel flickers. They settle once on release
        // (shell.js sends icx:divider-end).
        if (document.documentElement.classList.contains('icx-resizing')) { return; }

        const cs = getComputedStyle(cams);
        const padL = parseFloat(cs.paddingLeft) || 0;
        const padT = parseFloat(cs.paddingTop) || 0;
        const W = cams.clientWidth - padL - (parseFloat(cs.paddingRight) || 0);
        const H = cams.clientHeight - padT - (parseFloat(cs.paddingBottom) || 0);
        const gapRaw = parseFloat(cs.getPropertyValue('--icx-gap'));
        const gap = Number.isFinite(gapRaw) ? gapRaw : 4;
        // Unmeasurable (cams hidden by the site's eye toggle, or mid-load):
        // leave whatever is on screen alone.
        if (W < 40 || H < 40) { return; }

        const placed = new Map();
        if (focused) {
            const thumbs = visible.filter(c => c !== focused);
            const out = packFocused(W, H, gap, aspectOf(focused), thumbs.map(aspectOf));
            if (out) {
                placed.set(focused, out.focus);
                out.rects.forEach(r => placed.set(thumbs[r.index], r));
            }
        } else {
            const rects = packGrid(W, H, gap, visible.map(aspectOf));
            if (rects) { rects.forEach(r => placed.set(visible[r.index], r)); }
        }

        const placedSlots = new Set();
        const nowPlaced = new Map();
        placed.forEach((r, cam) => {
            const q = quantize(r, W, H);
            const s = cam.slot.style;
            s.setProperty('--icx-x', `${q.x + padL}px`);
            s.setProperty('--icx-y', `${q.y + padT}px`);
            s.setProperty('--icx-w', `${q.w}px`);
            s.setProperty('--icx-h', `${q.h}px`);
            cam.slot.dataset.icxPlaced = '';
            cam.slot.classList.toggle('icx-focused', cam === focused);
            placedSlots.add(cam.slot);
            nowPlaced.set(cam.key, { rect: { x: q.x + padL, y: q.y + padT, w: q.w, h: q.h }, name: cam.name });
            // Pop in the first time a cam appears (not on the first layout,
            // where everything would pop at once).
            if (!state.seen.has(cam.camId)) {
                state.seen.add(cam.camId);
                if (state.laidOut) {
                    cam.slot.classList.add('icx-enter');
                    cam.slot.addEventListener('animationend', () => cam.slot.classList.remove('icx-enter'), { once: true });
                }
            }
        });
        // Cams that were on screen and are gone now: fade a stand-in out.
        if (state.laidOut) {
            state.lastPlaced.forEach((prev, key) => {
                if (nowPlaced.has(key)) { return; }
                const ghost = el('div', { class: 'icx-ghost', 'aria-hidden': 'true' }, [el('span', { text: prev.name })]);
                Object.assign(ghost.style, {
                    left: `${prev.rect.x}px`, top: `${prev.rect.y}px`, width: `${prev.rect.w}px`, height: `${prev.rect.h}px`,
                });
                cams.append(ghost);
                ghost.addEventListener('animationend', () => ghost.remove(), { once: true });
                setTimeout(() => ghost.remove(), 1000);   // in case animations are off
            });
        }
        state.lastPlaced = nowPlaced;
        state.laidOut = true;
        cams.querySelectorAll(':scope > .rounded_square').forEach(slot => {
            if (placedSlots.has(slot)) { return; }
            delete slot.dataset.icxPlaced;
            slot.classList.remove('icx-focused');
        });
        cams.classList.toggle('icx-empty', visible.length === 0);
        renderMenu(new Set(all.map(c => c.key)));
    }

    const schedule = frameThrottle(update);

    // ── Drag to reorder ─────────────────────────────────────────────────────

    function saveOrder(visibleKeys) {
        const rest = state.order.filter(k => !visibleKeys.includes(k));
        state.order = [...visibleKeys, ...rest].slice(0, 300);
        store.set('order', state.order);
    }

    function bindDrag(cams) {
        cams.addEventListener('dragstart', e => e.preventDefault(), { signal });

        cams.addEventListener('pointerdown', e => {
            if (e.button !== 0 || e.target.closest('button, a, input, .icx-tools')) { return; }
            const slot = e.target.closest('.rounded_square[data-icx-placed]');
            if (!slot || slot.classList.contains('icx-focused')) { return; }
            state.drag = { slot, startX: e.clientX, startY: e.clientY, active: false, target: null, after: false };
        }, { signal });

        document.addEventListener('pointermove', e => {
            const d = state.drag;
            if (!d) { return; }
            if (!d.active) {
                if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < DRAG_THRESHOLD) { return; }
                const r = d.slot.getBoundingClientRect();
                d.grabX = d.startX - r.left;
                d.grabY = d.startY - r.top;
                d.active = true;
                d.slot.classList.add('icx-dragging');
                document.documentElement.classList.add('icx-dragging-cam');
            }
            const box = cams.getBoundingClientRect();
            d.slot.style.setProperty('--icx-drag-x', `${e.clientX - box.left - d.grabX}px`);
            d.slot.style.setProperty('--icx-drag-y', `${e.clientY - box.top - d.grabY}px`);

            // Mark where the cam would land: before or after the cam under the
            // pointer, by which half it's over. Nothing moves until release —
            // reordering live reshapes the justified rows, so the cam under
            // the pointer would keep changing.
            const target = document.elementsFromPoint(e.clientX, e.clientY)
                .map(n => n.closest?.('.rounded_square[data-icx-placed]'))
                .find(s => s && s !== d.slot && !s.classList.contains('icx-focused')) || null;
            let after = false;
            if (target) {
                const r = target.getBoundingClientRect();
                after = e.clientX > r.left + r.width / 2;
            }
            if (target !== d.target || after !== d.after) {
                d.target?.classList.remove('icx-drop-before', 'icx-drop-after');
                target?.classList.add(after ? 'icx-drop-after' : 'icx-drop-before');
                d.target = target;
                d.after = after;
            }
        }, { signal });

        const end = () => {
            const d = state.drag;
            state.drag = null;
            if (!d?.active) { return; }
            d.slot.classList.remove('icx-dragging');
            document.documentElement.classList.remove('icx-dragging-cam');
            // A drag ends with a click on the cam; don't let it reach the site.
            window.addEventListener('click', ev => ev.stopPropagation(), { capture: true, once: true });
            d.slot.style.removeProperty('--icx-drag-x');
            d.slot.style.removeProperty('--icx-drag-y');
            if (d.target) {
                d.target.classList.remove('icx-drop-before', 'icx-drop-after');
                const keys = orderedVisible(cams).visible.map(c => c.key);
                const moving = readSlot(d.slot)?.key;
                const onto = readSlot(d.target)?.key;
                if (moving && onto && keys.includes(moving)) {
                    keys.splice(keys.indexOf(moving), 1);
                    keys.splice(keys.indexOf(onto) + (d.after ? 1 : 0), 0, moving);
                    saveOrder(keys);
                }
            }
            schedule();
        };
        document.addEventListener('pointerup', end, { signal });
        document.addEventListener('pointercancel', end, { signal });
    }

    // ── Wiring ──────────────────────────────────────────────────────────────

    function init(cams) {
        cams.classList.add('icx-cams');

        cams.addEventListener('click', e => {
            const btn = e.target.closest('.icx-btn[data-act]');
            if (!btn) { return; }
            e.preventDefault();
            e.stopPropagation();
            const cam = readSlot(btn.closest('.rounded_square'));
            if (!cam) { return; }
            const act = btn.dataset.act;
            if (act === 'focus') { setFocus(state.focus === cam.key ? null : cam.key); }
            else if (act === 'refresh') { refresh(cam); }
            else if (act === 'fullscreen') { cam.slot.requestFullscreen?.().catch(() => {}); }
            else if (act === 'hide') { setHidden(cam.key, true); }
        }, { signal });
        cams.addEventListener('dblclick', e => {
            if (e.target.closest('button, a')) { return; }
            const cam = readSlot(e.target.closest('.rounded_square') || document.body);
            if (cam) { setFocus(state.focus === cam.key ? null : cam.key); }
        }, { signal });
        bindDrag(cams);

        // Cams arriving/leaving and names filling in are child-list and text
        // changes. Attributes are NOT observed: the site rewrites slot styles
        // constantly, and our own placement writes would feed back.
        const mo = new MutationObserver(schedule);
        mo.observe(cams, { childList: true, subtree: true, characterData: true });
        const ro = new ResizeObserver(schedule);
        document.addEventListener('icx:divider-end', schedule, { signal });
        ro.observe(cams);
        onRetire(() => { mo.disconnect(); ro.disconnect(); });
        // Media events don't bubble, but a capturing listener on an ancestor
        // still sees them. `resize` fires when a feed changes dimensions.
        for (const type of ['loadedmetadata', 'resize']) {
            cams.addEventListener(type, schedule, { capture: true, signal });
        }
        // Re-check an absent focus now and then even if nothing else changes.
        const focusTimer = setInterval(() => { if (state.focusMissingSince) { schedule(); } }, 15000);
        onRetire(() => clearInterval(focusTimer));

        buildMenu();
        document.addEventListener('icx:shell-ready', buildMenu, { signal });
        schedule();
    }

    const cams = document.getElementById('cams');
    if (cams) { init(cams); }
})();
