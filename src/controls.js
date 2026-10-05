// The extension's own settings controls, kept in this browser:
//
//   theme        System / Light / Dark      (theme.js)     chat bar + header
//   accent       the accent swatch          (theme.js)     chat bar + header
//   chatColor    a person's color on their whole message or name only (chat bar)
//   timestamps   none / relative / absolute (stamps.js)    (chat bar)
//   pmWindow     PMs docked in the chat or floating (pms.js) (chat bar)
//   upscale      sharper focused / full-screen cams (upscale.js) (chat bar)
//
// The chat bar's settings panel (chatbar.js) and the header's ICHUX
// Settings panel (menu.js) build theirs from here, so the two can't drift
// apart. Each builder returns { node, render }. Controls re-render
// themselves when a setting changes from either panel; render() is for a
// panel opening. The site's own chat settings (text color, size, PMs,
// sounds…) live in the room page's chat and stay in the chat bar's panel.
(function () {
    'use strict';

    const { el, store, signal } = globalThis.ICX;
    const root = document.documentElement;

    // A setting changed here: every control showing it re-renders.
    const changed = key => document.dispatchEvent(new CustomEvent('icx:pref', { detail: key }));
    const onChanged = (key, fn) => document.addEventListener('icx:pref', e => {
        if (e.detail === key) { fn(); }
    }, { signal });

    // A labelled setting: label above (or beside, for a row) its control.
    const setting = (label, control, row = false) => el('div', { class: `icx-setting${row ? ' icx-setting-row' : ''}` }, [
        el('div', { class: 'icx-setting-label', text: label }), control,
    ]);

    // A segmented choice (radio group semantics).
    function segmented(label, options, get, set, extraClass = '') {
        const group = el('div', { class: `icx-seg${extraClass}`, role: 'radiogroup', 'aria-label': label });
        const buttons = options.map(([value, text]) => {
            const b = el('button', { type: 'button', role: 'radio', 'data-value': value }, [
                el('span', { class: 'icx-seg-main', text }),
            ]);
            b.addEventListener('click', () => set(value));
            group.append(b);
            return b;
        });
        const render = () => buttons.forEach(b => {
            const on = b.dataset.value === get();
            b.classList.toggle('icx-on', on);
            b.setAttribute('aria-checked', String(on));
        });
        render();
        return { group, buttons, render };
    }

    // ── Theme and accent (theme.js) ─────────────────────────────────────────

    const theme = globalThis.ICX.theme;

    function themeControl() {
        if (!theme) { return null; }
        const seg = segmented('Theme', [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']],
            () => theme.get().pref, value => theme.set(value));
        seg.group.dataset.pref = 'theme';
        theme.onChange(seg.render);
        return { node: setting('Theme', seg.group), render: seg.render };
    }

    const ACCENT_NAMES = {
        grape: 'Grape', crimson: 'Crimson', tangerine: 'Tangerine', gold: 'Gold',
        forest: 'Forest', aqua: 'Aqua', cobalt: 'Cobalt', pink: 'Pink',
    };
    function accentControl() {
        if (!theme) { return null; }
        const swatches = el('div', { class: 'icx-swatches', role: 'radiogroup', 'aria-label': 'Accent color' });
        const buttons = theme.accents.map(name => {
            const b = el('button', {
                type: 'button', role: 'radio', class: 'icx-swatch-btn', 'data-accent': name,
                title: ACCENT_NAMES[name] || name, 'aria-label': ACCENT_NAMES[name] || name,
            });
            b.addEventListener('click', () => theme.setAccent(name));
            swatches.append(b);
            return b;
        });
        const render = () => buttons.forEach(b => b.setAttribute('aria-checked', String(b.dataset.accent === theme.get().accent)));
        theme.onChange(render);
        render();
        return { node: setting('Accent', swatches), render };
    }

    // ── Chat colors ─────────────────────────────────────────────────────────
    // Each person's color on their whole message (the site's way) or on
    // their name only; the stylesheet reads html[data-icx-chat-color].

    const CHAT_COLORS = [['all', 'Whole message'], ['name', 'Name only']];
    const chatColor = () => (CHAT_COLORS.some(([k]) => k === store.get('chatColor')) ? store.get('chatColor') : 'all');
    const applyChatColor = () => { root.dataset.icxChatColor = chatColor(); };
    applyChatColor();
    onChanged('chatColor', applyChatColor);
    signal.addEventListener('abort', () => { delete root.dataset.icxChatColor; });

    function chatColorControl() {
        const seg = segmented('Chat colors', CHAT_COLORS, chatColor, value => {
            store.set('chatColor', value);
            changed('chatColor');
        });
        seg.group.dataset.pref = 'chatColor';
        onChanged('chatColor', seg.render);
        return { node: setting('Chat colors', seg.group), render: seg.render };
    }

    // ── Timestamps ──────────────────────────────────────────────────────────
    // In a room, stamps.js owns the setting (and redraws the log); elsewhere
    // the choice is saved for the next room.

    const STAMP_MODES = [['none', 'None'], ['relative', 'Relative'], ['absolute', 'Absolute']];
    const stampGet = () => globalThis.ICX.stamps?.get() ||
        (STAMP_MODES.some(([k]) => k === store.get('timestamps')) ? store.get('timestamps') : 'relative');
    function stampExample(mode) {
        if (globalThis.ICX.stamps) { return globalThis.ICX.stamps.example(mode); }
        if (mode === 'relative') { return '37s ago'; }
        if (mode !== 'absolute') { return 'Off'; }
        return new Intl.DateTimeFormat([], { hour: '2-digit', minute: '2-digit' }).format(new Date());
    }

    function timestampsControl() {
        const seg = segmented('Timestamps', STAMP_MODES, stampGet, value => {
            if (globalThis.ICX.stamps) { globalThis.ICX.stamps.set(value); } else { store.set('timestamps', value); }
            changed('timestamps');
        }, ' icx-seg-2line');
        seg.group.dataset.pref = 'timestamps';
        // Each choice with an example under it.
        const subs = seg.buttons.map(b => {
            const sub = el('span', { class: 'icx-seg-sub' });
            b.append(sub);
            return sub;
        });
        const render = () => {
            seg.render();
            seg.buttons.forEach((b, i) => { subs[i].textContent = stampExample(b.dataset.value); });
        };
        onChanged('timestamps', render);
        render();
        return { node: setting('Timestamps', seg.group), render };
    }

    // ── PM window ───────────────────────────────────────────────────────────
    // Docked at the top of the chat, or a floating window (pms.js owns it).

    const PM_MODES = [['docked', 'Docked'], ['floating', 'Floating']];
    const pmGet = () => (store.get('pmMode') === 'floating' ? 'floating' : 'docked');

    function pmWindowControl() {
        const seg = segmented('PM window', PM_MODES, pmGet, value => {
            if (globalThis.ICX.pms) { globalThis.ICX.pms.setMode(value); } else { store.set('pmMode', value); changed('pmMode'); }
        });
        seg.group.dataset.pref = 'pmMode';
        onChanged('pmMode', seg.render);
        return { node: setting('PM window', seg.group), render: seg.render };
    }

    // ── Sharper big cams ────────────────────────────────────────────────────
    // upscale.js: the focused and full-screen cams enlarged with a sharper
    // method than the browser's, then lightly sharpened, on the GPU. No
    // detail is invented, so the note doesn't call it upscaling.
    // Shown greyed out, saying why, where the browser can't run it.

    function upscaleControl() {
        const up = globalThis.ICX.upscale;
        if (!up) { return null; }
        const label = 'Sharper big cams';
        const b = el('button', { type: 'button', role: 'switch', class: 'icx-switch', 'data-pref': 'upscale', 'aria-label': label });
        b.addEventListener('click', () => up.set(!up.get()));
        const note = el('div', { class: 'icx-setting-note' });
        const render = () => {
            const ok = up.supported();
            b.disabled = !ok;
            b.setAttribute('aria-checked', String(ok && up.get()));
            note.textContent = ok
                ? 'Crisper scaling and light sharpening for the focused and full-screen cams, on your graphics card.'
                : 'Needs graphics acceleration, which is off or unavailable in this browser.';
        };
        onChanged('upscale', render);
        render();
        return {
            node: el('div', { class: 'icx-setting' }, [
                el('div', { class: 'icx-setting-row' }, [el('div', { class: 'icx-setting-label', text: label }), b]),
                note,
            ]),
            render,
        };
    }

    globalThis.ICX.controls = {
        setting,
        theme: themeControl,
        accent: accentControl,
        chatColor: chatColorControl,
        timestamps: timestampsControl,
        pmWindow: pmWindowControl,
        upscale: upscaleControl,
        changed,
    };
})();
