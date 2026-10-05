// Emotimeme autocomplete for the message box.
//
// Each room has its own emotimemes: ":code" words that the site turns into a
// GIF or image. The room page lists them in a hidden field, as the site's own
// parser (cg in scripts110725.js) reads it:
//   <input id="hdnMemes" value=":code,file,size|:code,file,size|…">
// with the image at https://www.vidble.com/<file>.
//
// Typing ":" plus a letter or more opens a list of matching memes above the
// message box. ↑/↓ move, Tab or Enter insert, Esc closes. The keys are only
// taken over while the list is open, so the site's Tab nick-completion and
// Enter-to-send work as before otherwise.
(function () {
    'use strict';

    const { store, el, signal, removeStale } = globalThis.ICX;

    const input = document.getElementById('txtMsg');
    const field = document.getElementById('hdnMemes');
    const container = document.getElementById('chat_container');
    if (!input || !field || !container) { return; }

    const MAX_SHOWN = 8;

    const memes = parseMemes(field.value);
    if (!memes.length) { return; }

    function parseMemes(raw) {
        const seen = new Set();
        const out = [];
        (raw || '').split('|').forEach((entry, i) => {
            const parts = entry.split(',');
            if (parts.length !== 3) { return; }
            let code = parts[0].trim();
            if (code === '') {
                if (i === 0) { return; }   // the site skips an empty first entry…
                code = ':|';               // …and maps other empty codes to ":|"
            }
            if (!code.startsWith(':') || seen.has(code.toLowerCase())) { return; }
            seen.add(code.toLowerCase());
            out.push({ code, src: `https://www.vidble.com/${parts[1].trim()}` });
        });
        return out;
    }

    // How often you've used each meme, so favourites rank first.
    const usage = store.get('memeUsage', {});
    function recordUse(code) {
        usage[code] = (usage[code] || 0) + 1;
        store.set('memeUsage', usage);
    }

    // ── Popup ────────────────────────────────────────────────────────────────

    removeStale('icx-memes');   // left by an older copy (see core.js)
    const list = el('div', { id: 'icx-memes', role: 'listbox', 'aria-label': 'Emotimemes', hidden: '' });
    container.append(list);
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-controls', 'icx-memes');

    let matches = [];
    let active = 0;
    let token = null;   // { start, end, text } of the ":word" being typed

    function currentToken() {
        const pos = input.selectionStart;
        if (pos == null || pos !== input.selectionEnd) { return null; }
        const before = input.value.slice(0, pos);
        const m = before.match(/(?:^|\s)(:[^\s:]+)$/);
        if (!m) { return null; }
        return { start: pos - m[1].length, end: pos, text: m[1] };
    }

    function rank(query) {
        // Match on the part after the colon, so ":ye" finds ":awyeah" too.
        const q = query.slice(1).toLowerCase();
        const scored = [];
        for (const meme of memes) {
            const c = meme.code.slice(1).toLowerCase();
            const at = c.indexOf(q);
            if (at < 0) { continue; }
            // Prefix matches first, then by how often you use it, then shortest.
            scored.push({ meme, key: [at === 0 ? 0 : 1, -(usage[meme.code] || 0), c.length, c] });
        }
        scored.sort((a, b) => {
            for (let i = 0; i < a.key.length; i++) {
                if (a.key[i] < b.key[i]) { return -1; }
                if (a.key[i] > b.key[i]) { return 1; }
            }
            return 0;
        });
        return scored.slice(0, MAX_SHOWN).map(s => s.meme);
    }

    function open() {
        // Sit just above the message box, wherever the chat column puts it.
        list.style.bottom = `${container.clientHeight - input.offsetTop + 4}px`;
        list.hidden = false;
        input.setAttribute('aria-expanded', 'true');
    }

    function close() {
        list.hidden = true;
        matches = [];
        token = null;
        input.setAttribute('aria-expanded', 'false');
        input.removeAttribute('aria-activedescendant');
    }

    function render() {
        list.replaceChildren(...matches.map((meme, i) => {
            const img = el('img', { src: meme.src, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' });
            img.addEventListener('error', () => img.remove(), { once: true });
            const row = el('div', {
                id: `icx-meme-${i}`,
                class: 'icx-meme' + (i === active ? ' icx-active' : ''),
                role: 'option',
                'aria-selected': String(i === active),
            }, [el('span', { class: 'icx-meme-thumb' }, [img]), el('span', { class: 'icx-meme-code', text: meme.code })]);
            // pointerdown, not click: keep focus in the message box.
            row.addEventListener('pointerdown', e => { e.preventDefault(); accept(i); });
            row.addEventListener('pointermove', () => { if (active !== i) { active = i; highlight(); } });
            return row;
        }));
        highlight();
    }

    function highlight() {
        [...list.children].forEach((row, i) => {
            row.classList.toggle('icx-active', i === active);
            row.setAttribute('aria-selected', String(i === active));
        });
        const row = list.children[active];
        if (row) {
            input.setAttribute('aria-activedescendant', row.id);
            row.scrollIntoView({ block: 'nearest' });
        }
    }

    function update() {
        token = currentToken();
        const found = token && token.text.length >= 2 ? rank(token.text) : [];
        // A finished code with nothing longer to offer needs no list.
        if (!found.length || (found.length === 1 && found[0].code === token.text)) { close(); return; }
        const same = found.length === matches.length && found.every((m, i) => m === matches[i]);
        matches = found;
        if (!same) { active = 0; render(); }
        open();
    }

    function accept(i) {
        const meme = matches[i];
        if (!meme || !token) { return; }
        const v = input.value;
        const after = v.slice(token.end);
        const insert = meme.code + (after.startsWith(' ') ? '' : ' ');
        input.value = v.slice(0, token.start) + insert + after;
        const caret = token.start + insert.length;
        input.setSelectionRange(caret, caret);
        recordUse(meme.code);
        close();
        input.focus();
    }

    // ── Wiring ───────────────────────────────────────────────────────────────

    input.addEventListener('input', update, { signal });
    input.addEventListener('click', update, { signal });
    // Late, so a click on a meme lands first; and only if focus hasn't come
    // back meanwhile, or it would close a list that has reopened since.
    input.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== input) { close(); } }, 100), { signal });

    // Capture phase on the window, so this runs before the site's own key
    // handlers on the message box (Tab completes nicknames, Enter sends).
    window.addEventListener('keydown', e => {
        if (e.target !== input) { return; }
        if (list.hidden) {
            // Count memes in a message as it's sent, for ranking.
            if (e.key === 'Enter') {
                (input.value.match(/(?:^|\s)(:[^\s:]+)/g) || [])
                    .map(s => s.trim())
                    .filter(code => memes.some(m => m.code === code))
                    .forEach(recordUse);
            }
            return;
        }
        let handled = true;
        if (e.key === 'ArrowDown') { active = (active + 1) % matches.length; highlight(); }
        else if (e.key === 'ArrowUp') { active = (active - 1 + matches.length) % matches.length; highlight(); }
        else if (e.key === 'Tab' || e.key === 'Enter') { accept(active); }
        else if (e.key === 'Escape') { close(); }
        else { handled = false; }
        if (handled) {
            e.preventDefault();
            e.stopImmediatePropagation();
        }
    }, { capture: true, signal });
    // Arrow keys move the caret on keyup in some browsers; re-check after.
    input.addEventListener('keyup', e => {
        if (!['ArrowDown', 'ArrowUp', 'Tab', 'Enter', 'Escape'].includes(e.key)) { update(); }
    }, { signal });
})();
