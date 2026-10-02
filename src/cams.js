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

    const { store, frameThrottle, el, ICONS } = globalThis.ICX;
    const { packGrid, packFocused, quantize } = globalThis.ICX_PACK;

    const DEFAULT_AR = 4 / 3;
    const FOCUS_ABSENT_MS = 2 * 60 * 1000;  // forget a focus whose cam has been gone this long
    const DRAG_THRESHOLD = 6;

    // Hiding a cam also presses the site's own "disable" on it, so a hidden
    // feed stops downloading instead of streaming into an invisible box.
    const STOP_HIDDEN_STREAMS = true;

    const state = {
        hidden: new Set(loadHidden()),
        order: store.get('order', []),
        focus: store.get('focus', null),
        focusMissingSince: 0,
        drag: null,
        menuOpen: false,
    };

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

    function clickNative(id) {
        const btn = document.getElementById(id);
        if (btn) { btn.click(); return true; }
        return false;
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
        if (hidden) { state.hidden.add(key); } else { state.hidden.delete(key); }
        store.set('hidden', [...state.hidden]);
        if (hidden && state.focus === key) { setFocus(null); }
        renderMenu();
        schedule();
    }

    function setFocus(key) {
        state.focus = key;
        state.focusMissingSince = 0;
        if (key) { store.set('focus', key); } else { store.remove('focus'); }
        schedule();
    }

    // Keep hidden cams hidden (and stopped) as they come and go.
    function applyHidden(cam) {
        const hidden = state.hidden.has(cam.key);
        cam.slot.classList.toggle('icx-hidden', hidden);
        if (!STOP_HIDDEN_STREAMS) { return; }
        if (hidden && cam.slot.dataset.icxStopped !== cam.camId) {
            cam.slot.dataset.icxStopped = cam.camId;
            clickNative(`cambtn2-${cam.camId}`);
        } else if (!hidden && cam.slot.dataset.icxStopped === cam.camId) {
            delete cam.slot.dataset.icxStopped;
            clickNative(`cambtn1-${cam.camId}-retry`);
        }
    }

    // ── Hidden-cams menu (in the bar under the cams) ────────────────────────

    let menuBtn = null;
    let menu = null;

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
        menu.addEventListener('click', e => {
            e.stopPropagation();
            const btn = e.target.closest('[data-show]');
            if (btn) { setHidden(btn.dataset.show, false); }
        });
        document.addEventListener('click', () => {
            if (state.menuOpen) { state.menuOpen = false; renderMenu(); }
        });
        bar.append(el('div', { id: 'icx-hidden' }, [menuBtn, menu]));
        renderMenu();
    }

    function renderMenu(live = null) {
        if (!menuBtn) { return; }
        live = live || new Set(readCams(document.getElementById('cams')).map(c => c.key));
        const names = [...state.hidden].sort((a, b) =>
            (live.has(b) - live.has(a)) || a.localeCompare(b));
        menuBtn.textContent = `Hidden · ${names.length}`;
        menuBtn.disabled = names.length === 0;
        menuBtn.setAttribute('aria-expanded', String(state.menuOpen && names.length > 0));
        menu.hidden = !(state.menuOpen && names.length > 0);
        menu.replaceChildren(...names.map(name => el('div', { class: 'icx-hidden-row' }, [
            el('span', { class: live.has(name) ? 'icx-live' : '', text: name, title: live.has(name) ? 'On cam now' : '' }),
            el('button', { type: 'button', 'data-show': name, html: ICONS.show + '<span>Show</span>' }),
        ])));
    }

    // ── Layout ──────────────────────────────────────────────────────────────

    function orderedVisible(cams) {
        const all = readCams(cams);
        const rank = new Map(state.order.map((k, i) => [k, i]));
        const visible = all.filter(c => !state.hidden.has(c.key));
        // Known names keep their saved order; newcomers follow in slot order.
        visible.sort((a, b) => (rank.get(a.key) ?? Infinity) - (rank.get(b.key) ?? Infinity) ||
            all.indexOf(a) - all.indexOf(b));
        return { all, visible };
    }

    function update() {
        const cams = document.getElementById('cams');
        if (!cams) { return; }
        const { all, visible } = orderedVisible(cams);
        all.forEach(cam => { decorate(cam); applyHidden(cam); });

        // Focus survives short absences (a cam reconnecting) but not long ones.
        let focused = state.focus ? visible.find(c => c.key === state.focus) : null;
        if (state.focus && !focused && !state.hidden.has(state.focus)) {
            if (!state.focusMissingSince) { state.focusMissingSince = Date.now(); }
            else if (Date.now() - state.focusMissingSince > FOCUS_ABSENT_MS) { setFocus(null); }
        } else {
            state.focusMissingSince = 0;
        }
        all.forEach(cam => syncFocusButton(cam, cam === focused));
        cams.classList.toggle('icx-has-focus', !!focused);

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
        });
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
        cams.addEventListener('dragstart', e => e.preventDefault());

        cams.addEventListener('pointerdown', e => {
            if (e.button !== 0 || e.target.closest('button, a, input, .icx-tools')) { return; }
            const slot = e.target.closest('.rounded_square[data-icx-placed]');
            if (!slot || slot.classList.contains('icx-focused')) { return; }
            state.drag = { slot, startX: e.clientX, startY: e.clientY, active: false, target: null, after: false };
        });

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
        });

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
        document.addEventListener('pointerup', end);
        document.addEventListener('pointercancel', end);
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
        });
        cams.addEventListener('dblclick', e => {
            if (e.target.closest('button, a')) { return; }
            const cam = readSlot(e.target.closest('.rounded_square') || document.body);
            if (cam) { setFocus(state.focus === cam.key ? null : cam.key); }
        });
        bindDrag(cams);

        // Cams arriving/leaving and names filling in are child-list and text
        // changes. Attributes are NOT observed: the site rewrites slot styles
        // constantly, and our own placement writes would feed back.
        new MutationObserver(schedule).observe(cams, { childList: true, subtree: true, characterData: true });
        new ResizeObserver(schedule).observe(cams);
        // Media events don't bubble, but a capturing listener on an ancestor
        // still sees them. `resize` fires when a feed changes dimensions.
        for (const type of ['loadedmetadata', 'resize']) {
            cams.addEventListener(type, schedule, true);
        }
        // Re-check an absent focus now and then even if nothing else changes.
        setInterval(() => { if (state.focusMissingSince) { schedule(); } }, 15000);

        buildMenu();
        document.addEventListener('icx:shell-ready', buildMenu);
        schedule();
    }

    const cams = document.getElementById('cams');
    if (cams) { init(cams); }
})();
