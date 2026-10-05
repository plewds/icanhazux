// Chat bar: replaces the site's row of mystery icons under the message box
// with controls that show their current state.
//
//   [Pause / Resume] [Clear]                       [Closed · 2] [PMs] [⚙]
//
// The settings panel holds the multi-state toggles as real choices: your
// text color, who can message you, join/leave notices, sounds, emoticons,
// text size, line style.
//
// The settings live in the site's page globals, which this (isolated-world)
// script can't see; page.js reads and changes them and talks to this over DOM
// events (icx:chat-get / icx:chat-set / icx:chat-state, JSON in `detail`).
(function () {
    'use strict';

    const { el, ICONS, store, signal, onRetire, removeStale } = globalThis.ICX;

    const bar = document.getElementById('room_command_bar');
    if (!bar) { return; }

    let state = null;
    removeStale('icx-chatbar');   // left by an older copy (see core.js)

    const send = (key, value) =>
        document.dispatchEvent(new CustomEvent('icx:chat-set', { detail: JSON.stringify({ key, value }) }));

    // ── Toolbar ──────────────────────────────────────────────────────────────

    const pauseBtn = el('button', { type: 'button', class: 'icx-chip', id: 'icx-chat-pause' });
    const clearBtn = el('button', {
        type: 'button', class: 'icx-chip', id: 'icx-chat-clear',
        title: 'Clear the chat window (only on your screen)',
        html: ICONS.clear + '<span>Clear</span>',
    });
    const pmBtn = el('button', { type: 'button', class: 'icx-chip', id: 'icx-chat-pms', hidden: '' });
    // PM conversations closed from their tab (pms.js keeps them): a menu to
    // reopen one.
    const closedBtn = el('button', {
        type: 'button', class: 'icx-chip', id: 'icx-chat-pm-closed', hidden: '',
        'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-controls': 'icx-pm-closed-menu',
        title: 'Reopen a closed private conversation',
    });
    const closedMenu = el('div', { id: 'icx-pm-closed-menu', role: 'menu', 'aria-label': 'Closed conversations', hidden: '' });
    const gearBtn = el('button', {
        type: 'button', class: 'icx-chip icx-chip-icon', id: 'icx-chat-settings-btn', title: 'Settings',
        'aria-label': 'Settings', 'aria-haspopup': 'true', 'aria-expanded': 'false', 'aria-controls': 'icx-chat-settings',
        html: ICONS.gear,
    });

    const panel = el('div', { id: 'icx-chat-settings', role: 'dialog', 'aria-label': 'Chat settings', hidden: '' });

    const toolbar = el('div', { id: 'icx-chatbar' }, [
        el('div', { class: 'icx-chatbar-group' }, [pauseBtn, clearBtn]),
        el('div', { class: 'icx-chatbar-group' }, [closedBtn, pmBtn, gearBtn]),
        panel,
        closedMenu,
    ]);
    bar.prepend(toolbar);
    bar.classList.add('icx-chatbar-host');

    // The site's send button has no label on desktop (see the stylesheet).
    const sendBtn = document.getElementById('btn');
    if (sendBtn && !sendBtn.value.trim()) { sendBtn.value = 'Send'; }

    pauseBtn.addEventListener('click', () => state && send('following', !state.following));
    clearBtn.addEventListener('click', () => send('clear'));
    pmBtn.addEventListener('click', () => state && state.pmsVisible !== null && send('pmsVisible', !state.pmsVisible));

    const setClosedOpen = open => {
        closedMenu.hidden = !open;
        closedBtn.setAttribute('aria-expanded', String(open));
    };
    closedBtn.addEventListener('click', e => { e.stopPropagation(); setOpen(false); setClosedOpen(closedMenu.hidden); });
    closedMenu.addEventListener('click', e => {
        e.stopPropagation();
        const item = e.target.closest('[data-name]');
        if (!item) { return; }
        setClosedOpen(false);
        // Hidden PMs (Hide PMs) come back too, or the reopened one wouldn't show.
        if (state && state.pmsVisible === false) { send('pmsVisible', true); }
        globalThis.ICX.pms?.reopen(item.dataset.name);
    });
    document.addEventListener('click', () => { if (!closedMenu.hidden) { setClosedOpen(false); } }, { signal });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && !closedMenu.hidden) { setClosedOpen(false); closedBtn.focus(); }
    }, { signal });

    // ── Settings panel ───────────────────────────────────────────────────────

    // A labelled set of mutually exclusive choices (radio group semantics).
    function choice(key, label, options) {
        const group = el('div', { class: 'icx-seg', role: 'radiogroup', 'aria-label': label });
        options.forEach(([value, text]) => {
            const b = el('button', { type: 'button', role: 'radio', 'data-key': key, 'data-value': String(value), text });
            b.addEventListener('click', () => send(key, value));
            group.append(b);
        });
        return el('div', { class: 'icx-setting' }, [
            el('div', { class: 'icx-setting-label', text: label }),
            group,
        ]);
    }

    function toggle(key, label) {
        const b = el('button', { type: 'button', role: 'switch', class: 'icx-switch', 'data-key': key, 'aria-label': label });
        b.addEventListener('click', () => state && send(key, !state[key]));
        return el('div', { class: 'icx-setting icx-setting-row' }, [
            el('div', { class: 'icx-setting-label', text: label }), b,
        ]);
    }

    // Timestamps (stamps.js): each choice with an example under it. Kept in
    // this browser, not the site, so it has its own buttons (data-stamp).
    const stamps = globalThis.ICX.stamps;
    const STAMP_LABELS = { none: 'None', relative: 'Relative', absolute: 'Absolute' };
    const stampSeg = el('div', { class: 'icx-seg icx-seg-2line', role: 'radiogroup', 'aria-label': 'Timestamps' });
    function renderStamps() {
        if (!stamps) { return; }
        stampSeg.querySelectorAll('button').forEach(b => {
            const on = b.dataset.stamp === stamps.get();
            b.classList.toggle('icx-on', on);
            b.setAttribute('aria-checked', String(on));
            b.querySelector('.icx-seg-sub').textContent = stamps.example(b.dataset.stamp);
        });
    }
    (stamps ? stamps.modes : []).forEach(mode => {
        const b = el('button', { type: 'button', role: 'radio', 'data-stamp': mode }, [
            el('span', { class: 'icx-seg-main', text: STAMP_LABELS[mode] }),
            el('span', { class: 'icx-seg-sub' }),
        ]);
        b.addEventListener('click', () => { stamps.set(mode); renderStamps(); });
        stampSeg.append(b);
    });
    // Chat colors: each person's color on their whole message (the site's
    // way) or on their name only. Kept in this browser.
    const CHAT_COLORS = [['all', 'Whole message'], ['name', 'Name only']];
    let chatColor = CHAT_COLORS.some(([k]) => k === store.get('chatColor')) ? store.get('chatColor') : 'all';
    const chatColorSeg = el('div', { class: 'icx-seg', role: 'radiogroup', 'aria-label': 'Chat colors' });
    function renderChatColor() {
        document.documentElement.dataset.icxChatColor = chatColor;
        chatColorSeg.querySelectorAll('button').forEach(b => {
            const on = b.dataset.chatColor === chatColor;
            b.classList.toggle('icx-on', on);
            b.setAttribute('aria-checked', String(on));
        });
    }
    CHAT_COLORS.forEach(([key, text]) => {
        const b = el('button', { type: 'button', role: 'radio', 'data-chat-color': key, text });
        b.addEventListener('click', () => { chatColor = key; store.set('chatColor', key); renderChatColor(); });
        chatColorSeg.append(b);
    });
    renderChatColor();
    signal.addEventListener('abort', () => { delete document.documentElement.dataset.icxChatColor; });
    const chatColorSetting = el('div', { class: 'icx-setting' }, [
        el('div', { class: 'icx-setting-label', text: 'Chat colors' }), chatColorSeg,
    ]);

    const stampSetting = stamps ? el('div', { class: 'icx-setting' }, [
        el('div', { class: 'icx-setting-label', text: 'Timestamps' }), stampSeg,
    ]) : '';

    // Mod tools (modtools.js): only for room mods and owners.
    const modSection = el('div', { class: 'icx-mod-tools', hidden: '' }, [
        el('div', { class: 'icx-panel-subtitle', text: 'Mod tools' }),
        ...Object.entries(globalThis.ICX.modtools?.tools || { camTime: 'Cam time on cams', lastChat: 'Last chat on cams' }).map(([key, label]) => {
            const b = el('button', { type: 'button', role: 'switch', class: 'icx-switch', 'data-mod': key, 'aria-label': label });
            b.addEventListener('click', () => {
                const tools = globalThis.ICX.modtools;
                if (tools) { tools.set(key, !tools.get(key)); render(); }
            });
            return el('div', { class: 'icx-setting icx-setting-row' }, [el('div', { class: 'icx-setting-label', text: label }), b]);
        }),
    ]);

    const sizeValue = el('span', { class: 'icx-size-value' });
    const sizeDown = el('button', { type: 'button', class: 'icx-step', 'aria-label': 'Smaller text', text: '−' });
    const sizeUp = el('button', { type: 'button', class: 'icx-step', 'aria-label': 'Larger text', text: '+' });
    sizeDown.addEventListener('click', () => state?.fontSize && send('fontSize', state.fontSize - 1));
    sizeUp.addEventListener('click', () => state?.fontSize && send('fontSize', state.fontSize + 1));

    // Your text color: a swatch that opens the site's own picker (color
    // wheel and hex box), and a sample line showing how it reads here (dark
    // mode lifts colors too dark to read).
    const colorSwatch = el('button', {
        type: 'button', class: 'icx-color-swatch', id: 'icx-color-swatch',
        title: 'Change your text color', 'aria-label': 'Change your text color',
    });
    const colorSample = el('div', { class: 'icx-color-sample' });
    function renderColor(hex) {
        const shown = globalThis.ICX.theme?.displayColor(hex) || { color: hex };
        colorSwatch.style.background = hex || 'transparent';
        colorSample.style.color = shown.color;
        colorSample.textContent = `${state?.name || 'you'}: this is how your messages look`;
    }
    colorSwatch.addEventListener('click', () => { setOpen(false); send('color'); });

    const helpHref = document.querySelector('#showHelp a')?.href || '/help';

    // Theme is this extension's own setting (theme.js), not the site's.
    const themeApi = globalThis.ICX.theme;
    const themeSeg = el('div', { class: 'icx-seg', role: 'radiogroup', 'aria-label': 'Theme' });
    [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']].forEach(([value, text]) => {
        const b = el('button', { type: 'button', role: 'radio', 'data-theme': value, text });
        b.addEventListener('click', () => themeApi?.set(value));
        themeSeg.append(b);
    });
    const ACCENT_NAMES = {
        grape: 'Grape', crimson: 'Crimson', tangerine: 'Tangerine', gold: 'Gold',
        forest: 'Forest', aqua: 'Aqua', cobalt: 'Cobalt', pink: 'Pink',
    };
    const swatches = el('div', { class: 'icx-swatches', role: 'radiogroup', 'aria-label': 'Accent color' });
    (themeApi?.accents || []).forEach(name => {
        const b = el('button', {
            type: 'button', role: 'radio', class: 'icx-swatch-btn', 'data-accent': name,
            title: ACCENT_NAMES[name] || name, 'aria-label': ACCENT_NAMES[name] || name,
        });
        b.addEventListener('click', () => themeApi.setAccent(name));
        swatches.append(b);
    });
    function renderTheme() {
        const { pref, accent } = themeApi?.get() || {};
        themeSeg.querySelectorAll('button').forEach(b => {
            const on = b.dataset.theme === pref;
            b.classList.toggle('icx-on', on);
            b.setAttribute('aria-checked', String(on));
        });
        swatches.querySelectorAll('button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.accent === accent)));
    }
    themeApi?.onChange(renderTheme);
    themeApi?.onChange(() => renderColor(state?.color));

    // Two columns: how chat looks on the left, how it behaves on the right
    // (one column on a narrow window).
    const column = (title, items) => el('div', { class: 'icx-settings-col' }, [
        el('div', { class: 'icx-settings-col-title', text: title }), ...items,
    ]);
    panel.append(
        el('div', { class: 'icx-panel-title', text: 'Settings' }),
        el('div', { class: 'icx-settings-cols' }, [
            column('Appearance', [
                themeApi ? el('div', { class: 'icx-setting' }, [
                    el('div', { class: 'icx-setting-label', text: 'Theme' }), themeSeg,
                ]) : '',
                themeApi ? el('div', { class: 'icx-setting' }, [
                    el('div', { class: 'icx-setting-label', text: 'Accent' }), swatches,
                ]) : '',
                el('div', { class: 'icx-setting' }, [
                    el('div', { class: 'icx-setting-label', text: 'My color' }),
                    el('div', { class: 'icx-color-row' }, [colorSwatch, colorSample]),
                ]),
                el('div', { class: 'icx-setting icx-setting-row' }, [
                    el('div', { class: 'icx-setting-label', text: 'Text size' }),
                    el('div', { class: 'icx-stepper' }, [sizeDown, sizeValue, sizeUp]),
                ]),
                choice('lineStyle', 'Line style', [[3, 'Striped'], [1, 'Boxed'], [2, 'Plain']]),
                chatColorSetting,
                stampSetting,
            ]),
            column('Chat', [
                choice('pm', 'Currently accepting', [
                    [0, 'PMs & Whispers'], [2, 'PMs'], [1, 'Whispers'], [3, 'None'],
                ]),
                choice('notices', 'Join & leave notices', [[1, 'All'], [2, 'Name changes'], [0, 'Off']]),
                toggle('sound', 'Notification sounds'),
                toggle('emoticons', 'Show emotimemes (GIFs)'),
                modSection,
                el('a', { class: 'icx-panel-link', href: helpHref, target: '_blank', rel: 'noopener', text: 'Chat commands help ↗' }),
            ]),
        ]),
    );

    const setOpen = open => {
        panel.hidden = !open;
        gearBtn.setAttribute('aria-expanded', String(open));
        if (open) { renderStamps(); document.dispatchEvent(new CustomEvent('icx:chat-get')); }
    };
    gearBtn.addEventListener('click', e => { e.stopPropagation(); setClosedOpen(false); setOpen(panel.hidden); });
    panel.addEventListener('click', e => e.stopPropagation());
    document.addEventListener('click', () => { if (!panel.hidden) { setOpen(false); } }, { signal });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) { setOpen(false); gearBtn.focus(); } }, { signal });

    // ── Rendering state ──────────────────────────────────────────────────────

    function render() {
        const s = state;
        toolbar.classList.toggle('icx-ready', !!s);
        if (!s) { return; }

        pauseBtn.classList.toggle('icx-chip-alert', !s.following);
        const held = s.held || 0;
        pauseBtn.innerHTML = s.following ? ICONS.pause + '<span>Pause</span>'
            : ICONS.play + `<span>${held ? `Paused · ${held} new ↓` : 'Paused · Resume'}</span>`;
        pauseBtn.title = s.following ? 'Pause chat scrolling'
            : 'Chat is paused. New messages are held until you resume. Click to resume.';
        pauseBtn.setAttribute('aria-pressed', String(!s.following));

        renderColor(s.color);

        const closed = s.closedPms || [];
        closedBtn.hidden = !closed.length;
        closedBtn.innerHTML = ICONS.message + `<span>Closed · ${closed.length}</span>`;
        if (!closed.length) { setClosedOpen(false); }
        const names = closed.join('\n');
        if (closedMenu.dataset.names !== names) {
            closedMenu.dataset.names = names;
            closedMenu.replaceChildren(
                el('div', { class: 'icx-menu-title', text: 'Reopen a conversation' }),
                ...closed.map(name => el('button', { type: 'button', role: 'menuitem', class: 'icx-menu-item', 'data-name': name, text: name })),
            );
        }

        pmBtn.hidden = s.pmsVisible === null;
        if (s.pmsVisible !== null) {
            pmBtn.innerHTML = ICONS.message + `<span>${s.pmsVisible ? 'Hide PMs' : 'Show PMs'}</span>`;
            pmBtn.setAttribute('aria-pressed', String(s.pmsVisible));
        }

        panel.querySelectorAll('[role="radio"][data-key]').forEach(b => {
            const on = String(s[b.dataset.key]) === b.dataset.value;
            b.setAttribute('aria-checked', String(on));
            b.classList.toggle('icx-on', on);
        });
        const nobody = panel.querySelector('[data-key="pm"][data-value="3"]');
        if (nobody) { nobody.disabled = s.isMod; }
        panel.querySelectorAll('[role="switch"][data-key]').forEach(b => {
            b.setAttribute('aria-checked', String(!!s[b.dataset.key]));
        });
        modSection.hidden = !s.isMod;
        modSection.querySelectorAll('[data-mod]').forEach(b => {
            b.setAttribute('aria-checked', String(!!globalThis.ICX.modtools?.get(b.dataset.mod)));
        });
        sizeValue.textContent = s.fontSize ? `${s.fontSize}px` : '—';
        sizeDown.disabled = !s.fontSize || s.fontSize <= 9;
        sizeUp.disabled = !s.fontSize || s.fontSize >= 32;
    }

    document.addEventListener('icx:chat-state', e => {
        try { state = JSON.parse(e.detail); } catch (_) { return; }
        render();
    }, { signal });

    // The color is saved from the site's picker; refresh once it closes.
    const picker = document.getElementById('colorDiv');
    if (picker) {
        const pickerObserver = new MutationObserver(() => document.dispatchEvent(new CustomEvent('icx:chat-get')));
        pickerObserver.observe(picker, { attributes: true, attributeFilter: ['style'] });
        onRetire(() => pickerObserver.disconnect());
    }

    render();
    renderTheme();
    document.dispatchEvent(new CustomEvent('icx:chat-get'));
})();
