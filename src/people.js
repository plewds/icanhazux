// People: the drawer's panel (shell.js makes the drawer). The site's own
// list (#activeUserList) is a run-on paragraph of names that it rewrites on
// every refresh; it stays in the drawer, hidden, as the source, and this
// renders it as names: who's active or idle, on cam, a mod or a site
// supporter, with search and a view of everyone or just who's on cam.
// Clicking a name opens the site's profile popup, as before.
//
// Made for browsing, not just searching: names wrap left to right like a
// paragraph (one per row took six screens of scrolling in a busy room),
// under a heading for each letter, and an A–Z strip above the list jumps
// to a letter.
//
// What the site's list carries, per name:
//   <a class="userlink" onclick='userInfoPopup("name", …)'>name</a>
//   idle: the name in <strike>; site supporter: wrapped in <b> with an
//   <img title="site supporter"> (a heart, or a custom trophy); mods: listed
//   again in a closing <p>N mods: …</p>. On cam: who's broadcasting, as the
//   server reports it (page.js), so it's right even with cams hidden; the
//   cam grid stands in until that first report.
(function () {
    'use strict';

    const { store, el, frameThrottle, icon, signal, onRetire, removeStale } = globalThis.ICX;

    const drawer = document.getElementById('icx-drawer');
    const source = document.getElementById('activeUserList');
    if (!globalThis.ICX.isRoom || !drawer || !source) { return; }

    // Views: everyone, or just who's on cam. Either way mods come first, then
    // everyone else, A–Z in each; idle people stay in place, just dimmed, so
    // a name is where you'd look for it whether or not they're active.
    const VIEWS = [['all', 'All'], ['cam', 'On cam']];
    let view = VIEWS.some(([key]) => key === store.get('peopleView')) ? store.get('peopleView') : 'all';
    let query = '';

    // ── Panel ────────────────────────────────────────────────────────────────

    removeStale('icx-people');
    const search = el('input', {
        type: 'search', class: 'icx-people-search', placeholder: 'Search people',
        'aria-label': 'Search people', autocomplete: 'off', spellcheck: 'false',
    });
    const refresh = el('button', {
        type: 'button', class: 'icx-chip icx-chip-icon', title: 'Refresh the list', 'aria-label': 'Refresh the list',
    }, [icon('refresh')]);
    const viewSeg = el('div', { class: 'icx-seg icx-people-view', role: 'radiogroup', 'aria-label': 'Show' });
    VIEWS.forEach(([key, text]) => {
        const b = el('button', { type: 'button', role: 'radio', 'data-view': key, text });
        b.addEventListener('click', () => { view = key; store.set('peopleView', key); render(); });
        viewSeg.append(b);
    });
    const summary = el('div', { class: 'icx-people-summary', 'aria-live': 'polite' });
    const list = el('div', { class: 'icx-people-list' });
    // A–Z: one button per letter (and # for names that don't start with
    // one), off where no one's name starts with it.
    const LETTERS = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];
    const jump = el('div', { class: 'icx-people-jump', role: 'toolbar', 'aria-label': 'Jump to a letter' },
        LETTERS.map(L => el('button', { type: 'button', 'data-jump': L, 'aria-label': `Jump to ${L}`, text: L })));
    const panel = el('div', { id: 'icx-people', role: 'dialog', 'aria-label': 'People in this room' }, [
        el('div', { class: 'icx-people-head' }, [search, refresh]),
        el('div', { class: 'icx-people-tools' }, [viewSeg, summary]),
        jump,
        list,
    ]);
    drawer.prepend(panel);

    search.addEventListener('input', () => { query = search.value.trim().toLowerCase(); render(); });
    // The site's refresh, through page.js (the list's own link is a
    // javascript: URL).
    refresh.addEventListener('click', () => {
        document.dispatchEvent(new CustomEvent('icx:chat-set', { detail: JSON.stringify({ key: 'refreshPeople' }) }));
    });
    // A letter scrolls its heading to the top of the list.
    jump.addEventListener('click', e => {
        const b = e.target.closest('[data-jump]');
        const head = b && !b.disabled && list.querySelector(`.icx-people-letter[data-letter="${b.dataset.jump}"]`);
        if (head) { list.scrollTop = head.offsetTop - list.offsetTop - 8; }
    });
    // A name opens the site's profile popup: press that name's own link,
    // looked up now since the site replaces its list on every refresh.
    list.addEventListener('click', e => {
        const row = e.target.closest('[data-name]');
        if (!row) { return; }
        const link = [...source.querySelectorAll('a.userlink')].find(a => nameOf(a) === row.dataset.name);
        link?.click();
    });

    // ── Reading the site's list ──────────────────────────────────────────────

    const nameOf = a => (a.textContent || '').trim();

    function read() {
        const mods = new Set();
        source.querySelectorAll('p').forEach(p => {
            if (/^\s*\d+\s+mods?\s*:/i.test(p.textContent)) { p.querySelectorAll('a.userlink').forEach(a => mods.add(nameOf(a).toLowerCase())); }
        });
        const onCam = broadcasters
            || new Set([...document.querySelectorAll('#cams .name-on-cam')].map(n => n.textContent.trim().toLowerCase()));
        const people = new Map();
        source.querySelectorAll('a.userlink').forEach(a => {
            const name = nameOf(a);
            const key = name.toLowerCase();
            if (!name || people.has(key)) { return; }
            const badge = a.closest('b')?.querySelector('img[title="site supporter" i]');
            people.set(key, {
                name,
                idle: !!a.querySelector('strike'),
                cam: onCam.has(key),
                mod: mods.has(key),
                badge: badge ? badge.src : '',
            });
        });
        return [...people.values()];
    }

    // ── Rendering ───────────────────────────────────────────────────────────

    const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });


    // A custom badge that fails to load falls back to the site's heart (one
    // that has loaded, from the site's list), or to nothing: never alt text.
    // A failed load isn't cached, and the rows are rebuilt on every refresh
    // of the site's list, so a badge that has failed once goes straight to
    // the fallback instead of being asked for (and failing) again.
    const brokenBadges = new Set();
    const loadedHeart = () => [...source.querySelectorAll('img.smicon[title="site supporter" i]')]
        .find(h => h.complete && h.naturalWidth && !brokenBadges.has(h.src));
    function badgeImg(src) {
        if (brokenBadges.has(src)) {
            const heart = loadedHeart();
            return heart ? el('img', { class: 'icx-person-badge', src: heart.src, alt: '', 'data-fallback': '1' }) : '';
        }
        const img = el('img', { class: 'icx-person-badge', src, alt: '' });
        img.addEventListener('error', () => {
            if (!img.dataset.fallback) { brokenBadges.add(src); }
            const heart = loadedHeart();
            if (heart && !img.dataset.fallback) { img.dataset.fallback = '1'; img.src = heart.src; } else { img.remove(); }
        });
        return img;
    }

    function row(p) {
        const status = p.idle ? 'Idle' : 'Active';
        return el('button', {
            type: 'button',
            class: 'icx-person' + (p.idle ? ' icx-idle' : ''),
            'data-name': p.name,
            title: `${p.name} · ${[status, p.cam && 'on cam', p.mod && 'mod', p.badge && 'site supporter'].filter(Boolean).join(' · ')}`,
        }, [
            el('span', { class: 'icx-person-dot', 'aria-label': status }),
            el('span', { class: 'icx-person-name', text: p.name }),
            p.cam ? el('span', { class: 'icx-person-tag icx-tag-cam', 'aria-label': 'On cam' }, [icon('cam')]) : '',
            p.mod ? el('span', { class: 'icx-person-tag icx-tag-mod', 'aria-label': 'Mod' }, [icon('mod')]) : '',
            p.badge ? badgeImg(p.badge) : '',
        ]);
    }

    function render() {
        viewSeg.querySelectorAll('button').forEach(b => {
            const on = b.dataset.view === view;
            b.classList.toggle('icx-on', on);
            b.setAttribute('aria-checked', String(on));
        });
        if (!drawer.classList.contains('icx-open')) { return; }   // rendered on open
        const everyone = read();
        const inView = everyone.filter(p => view === 'all' || p.cam);
        const shown = inView.filter(p => !query || p.name.toLowerCase().includes(query)).sort(byName);
        // Mods in one block; everyone else under a heading per letter.
        const rows = people => el('div', { class: 'icx-people-rows' }, people.map(row));
        const groupHead = (title, people) => el('div', { class: 'icx-people-group', text: `${title} · ${people.length}` });
        const mods = shown.filter(p => p.mod);
        const rest = shown.filter(p => !p.mod);
        const byLetter = new Map();
        rest.forEach(p => {
            const L = p.name.charAt(0).toUpperCase();
            const key = /[A-Z]/.test(L) ? L : '#';
            if (!byLetter.has(key)) { byLetter.set(key, []); }
            byLetter.get(key).push(p);
        });
        const letters = LETTERS.filter(L => byLetter.has(L));
        const empty = !everyone.length ? 'Loading…'
            : query ? `No one matches “${query}”`
                : 'No one is on cam';
        list.replaceChildren(
            ...(mods.length ? [groupHead('Mods', mods), rows(mods)] : []),
            ...(rest.length ? [groupHead('People', rest)] : []),
            ...letters.flatMap(L => [
                el('div', { class: 'icx-people-letter', 'data-letter': L, text: L }),
                rows(byLetter.get(L)),
            ]),
            ...(shown.length ? [] : [el('div', { class: 'icx-people-empty', text: empty })]),
        );
        jump.querySelectorAll('[data-jump]').forEach(b => { b.disabled = !byLetter.has(b.dataset.jump); });
        // # only when someone's name needs it.
        jump.querySelector('[data-jump="#"]').hidden = !byLetter.has('#');
        const active = everyone.filter(p => !p.idle).length;
        summary.textContent = query
            ? `${shown.length} of ${inView.length}`
            : `${active} active · ${everyone.filter(p => p.cam).length} on cam`;
    }

    const schedule = frameThrottle(render);
    // Who's broadcasting (page.js), lowercased names; null until reported.
    let broadcasters = null;
    document.addEventListener('icx:broadcasters', e => {
        try { broadcasters = new Set(JSON.parse(e.detail).map(n => String(n).toLowerCase())); } catch (_) { return; }
        schedule();
    }, { signal });
    document.dispatchEvent(new CustomEvent('icx:broadcasters-get'));
    // The site rewrites its list on refresh; cams come and go; and the
    // drawer opening is when the list is first needed.
    const observer = new MutationObserver(schedule);
    observer.observe(source, { childList: true, subtree: true, characterData: true });
    const cams = document.getElementById('cams');
    if (cams) { observer.observe(cams, { childList: true, subtree: true, characterData: true }); }
    observer.observe(drawer, { attributes: true, attributeFilter: ['class'] });
    onRetire(() => observer.disconnect());
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && document.activeElement === search && search.value) {
            search.value = '';
            query = '';
            render();
            e.stopImmediatePropagation();   // clear first; Esc again closes the drawer
        }
    }, { capture: true, signal });
    render();
})();
