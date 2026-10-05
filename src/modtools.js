// Mod tools: for room mods and owners only (the site's du.ee, the same flag
// that adds the moderation actions to profile popups; page.js reports it as
// isMod). Two tags in the top-left corner of each cam, each switchable in
// the settings panel's Mod tools section:
//
//   Cam time   how long they've been on cam. Counted from when this
//              browser first saw the cam (kept across reloads while it
//              stays up), so it's a lower bound if you joined later.
//   Last chat  how long since they last said something in the room, with
//              the message on hover. "—" if nothing since you joined. Red
//              after ten minutes of quiet.
(function () {
    'use strict';

    const { store, el, signal, onRetire } = globalThis.ICX;

    if (!globalThis.ICX.isRoom) { return; }
    const cams = document.getElementById('cams');
    const log = document.getElementById('txt');
    if (!cams || !log) { return; }

    const TOOLS = { camTime: 'Cam time on cams', lastChat: 'Last chat on cams' };
    const prefs = { camTime: store.get('modCamTime', true), lastChat: store.get('modLastChat', true) };
    let isMod = false;

    const nameOf = slot => (slot.querySelector('.name-on-cam')?.textContent || '').trim().toLowerCase();

    // ── Cam time ─────────────────────────────────────────────────────────────
    // name → first seen (ms), in storage so a reload keeps counting.
    const since = store.get('camSince', {}) || {};
    function syncSince(live) {
        const now = Date.now();
        let changed = false;
        live.forEach(name => { if (!since[name] || now - since[name] > 864e5) { since[name] = now; changed = true; } });
        Object.keys(since).forEach(name => { if (!live.has(name)) { delete since[name]; changed = true; } });
        if (changed) { store.set('camSince', since); }
    }
    function clock(ms) {
        const s = Math.max(0, Math.floor(ms / 1000));
        const h = Math.floor(s / 3600);
        const mm = String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, '0');
        return `${h ? `${h}:` : ''}${mm}:${String(s % 60).padStart(2, '0')}`;
    }

    // ── Last chat ────────────────────────────────────────────────────────────
    // name → { at, text } for lines arriving after load.
    const lastChat = new Map();
    const joined = Date.now();
    function noteLine(line) {
        if (line.nodeType !== 1 || !line.matches('p')) { return; }
        const who = line.querySelector('a.userlink');
        if (!who) { return; }
        const name = who.textContent.trim().toLowerCase();
        const text = (line.textContent || '').split(/:\s/).slice(1).join(': ').trim() || line.textContent.trim();
        lastChat.set(name, { at: Date.now(), text });
    }
    function ago(ms) {
        const m = Math.floor(ms / 60000);
        if (m < 1) { return 'now'; }
        if (m < 60) { return `${m}m ago`; }
        return `${Math.floor(m / 60)}h ${m % 60}m ago`;
    }

    // ── Tags on the cams ─────────────────────────────────────────────────────

    function tag(cls, label) {
        return el('span', { class: `icx-modtag ${cls}` }, [el('span', { class: 'icx-modtag-k', text: label }), el('span', { class: 'icx-modtag-v' })]);
    }

    function render() {
        const slots = [...cams.querySelectorAll(':scope > .rounded_square[data-icx-placed]')];
        const live = new Set(slots.map(nameOf).filter(Boolean));
        syncSince(live);
        const on = isMod && (prefs.camTime || prefs.lastChat);
        cams.querySelectorAll('.icx-modtags').forEach(t => { if (!on || !slots.includes(t.parentElement)) { t.remove(); } });
        if (!on) { return; }
        const now = Date.now();
        slots.forEach(slot => {
            const name = nameOf(slot);
            if (!name) { return; }
            // The site rebuilds a cam's contents on restart; put the tags back.
            let tags = slot.querySelector(':scope > .icx-modtags');
            if (!tags) {
                tags = el('div', { class: 'icx-modtags', 'aria-hidden': 'true' }, [tag('icx-modtag-cam', 'cam'), tag('icx-modtag-chat', 'chat')]);
                slot.append(tags);
            }
            const camTag = tags.querySelector('.icx-modtag-cam');
            camTag.hidden = !prefs.camTime;
            camTag.querySelector('.icx-modtag-v').textContent = clock(now - since[name]);
            camTag.title = `On cam for at least ${clock(now - since[name])} (since this browser first saw it)`;
            const chatTag = tags.querySelector('.icx-modtag-chat');
            chatTag.hidden = !prefs.lastChat;
            const last = lastChat.get(name);
            chatTag.querySelector('.icx-modtag-v').textContent = last ? ago(now - last.at) : '—';
            // Red once they've been seen quiet for ten minutes: since their last
            // line, or since you joined if they haven't said anything.
            chatTag.classList.toggle('icx-modtag-quiet', now - (last ? last.at : joined) > 10 * 60000);
            chatTag.title = last ? `Last said, ${ago(now - last.at)}: ${last.text}` : 'Nothing said since you joined';
        });
    }

    // ── Wiring ───────────────────────────────────────────────────────────────

    // isMod comes with the chat state page.js reports (see chatbar.js).
    document.addEventListener('icx:chat-state', e => {
        let s;
        try { s = JSON.parse(e.detail); } catch (_) { return; }
        if (!!s.isMod !== isMod) { isMod = !!s.isMod; render(); }
    }, { signal });

    const lines = new MutationObserver(records => {
        records.forEach(r => r.addedNodes.forEach(noteLine));
        if (isMod && prefs.lastChat) { render(); }
    });
    lines.observe(log, { childList: true });
    const tick = setInterval(render, 1000);
    onRetire(() => { lines.disconnect(); clearInterval(tick); });

    globalThis.ICX.modtools = {
        tools: TOOLS,
        get: key => !!prefs[key],
        set(key, value) {
            if (!(key in prefs)) { return; }
            prefs[key] = !!value;
            store.set(key === 'camTime' ? 'modCamTime' : 'modLastChat', prefs[key]);
            render();
        },
    };
    document.dispatchEvent(new CustomEvent('icx:chat-get'));
    render();
})();
