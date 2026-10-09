// Kept PMs (Settings → Keep PMs, off by default). The site drops every PM
// conversation when the page reloads. With this on, conversations are saved
// in this browser and come back:
//
//   - after a reload: as you left them, the open ones open, the rest in the
//     chat bar's Closed menu;
//   - in a later visit: all in the Closed menu, ready to pick up;
//   - when someone you've talked to messages you again (or you PM them):
//     your earlier messages with them show above the new one.
//
// Saved for 7 days from the last message, at most 30 conversations and the
// last 150 lines of each. Turning the setting off deletes everything saved.
//
// Names, not people: a nickname can pass to someone else, and their old
// conversation shouldn't greet the next person to use it. So, with the same
// knowledge cams.js uses for hidden cams (the session's list of names known
// to be nicknames, and your "Perma-nick" marks):
//   - a registered name, or a nickname you've marked Perma-nick, is kept for
//     the full 7 days (localStorage);
//   - a nickname is kept only for this tab's session (sessionStorage): it
//     survives a reload, not a new visit;
//   - a name not yet known either way starts as session-only, and its
//     profile is checked once (as opening it would; page.js icx:nick-check).
//     If it isn't a nickname, it moves to the long-term store.
//
// Lines are saved cleaned: text, bold/italic, colors, web links and the
// site's own emoticon images. Everything else is dropped, and restoring
// builds the elements one by one from that allowlist (nothing is written
// into the page as HTML). Opening a conversation goes through the site's
// own PM code (page.js icx:pm-restore), so sending from it is the site's
// as ever.
(function () {
    'use strict';

    const { store, el, signal, onRetire } = globalThis.ICX;

    const tabs = document.getElementById('tabs');
    if (!globalThis.ICX.isRoom || !tabs) { return; }

    const TTL_MS = 7 * 24 * 60 * 60 * 1000;
    const MAX_CONVOS = 30;
    const MAX_LINES = 150;
    const LONG_KEY = 'pmLog';                 // store: icx_pmLog
    const SESSION_KEY = 'icx_pmLog';          // sessionStorage
    const CHECKED_KEY = 'icx_pmNotNick';      // sessionStorage: names checked, not nicknames

    const keeping = () => store.get('pmKeep', false) === true;

    // ── Storage ─────────────────────────────────────────────────────────────
    // Both stores: { name: { t, open, lines: [html…] } }.

    const readSession = key => {
        try { return JSON.parse(sessionStorage.getItem(key) || 'null'); } catch (_) { return null; }
    };
    const writeSession = (key, value) => {
        try { sessionStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
    };
    const loadLong = () => { const v = store.get(LONG_KEY, {}); return v && typeof v === 'object' ? v : {}; };
    const loadShort = () => { const v = readSession(SESSION_KEY); return v && typeof v === 'object' ? v : {}; };

    // Drop what's past 7 days, then all but the 30 most recent.
    function prune(map) {
        const now = Date.now();
        return Object.fromEntries(Object.entries(map)
            .filter(([, c]) => c && Array.isArray(c.lines) && now - (Number(c.t) || 0) < TTL_MS)
            .sort(([, a], [, b]) => b.t - a.t)
            .slice(0, MAX_CONVOS));
    }

    // ── Which store a name belongs in ───────────────────────────────────────
    // cams.js keeps the session's nicknames in sessionStorage icx_nicks and
    // the Perma-nick marks in icx_permaNicks; read here at the moment of
    // saving, so a name found to be a nickname moves straight away.

    const sessionNicks = () => new Set(readSession('icx_nicks') || []);
    const permaNicks = () => new Set(store.get('permaNicks', []) || []);
    const notNicks = () => new Set(readSession(CHECKED_KEY) || []);
    const asked = new Set();

    function longTerm(name) {
        if (permaNicks().has(name)) { return true; }
        if (sessionNicks().has(name)) { return false; }
        if (notNicks().has(name)) { return true; }
        if (!asked.has(name)) {
            asked.add(name);
            document.dispatchEvent(new CustomEvent('icx:nick-check', { detail: JSON.stringify({ name }) }));
        }
        return false;
    }

    document.addEventListener('icx:nick-result', e => {
        let r;
        try { r = JSON.parse(e.detail); } catch (_) { return; }
        if (!r || !r.name || r.nick !== false) { schedule(); return; }   // a nickname, or couldn't tell
        const set = notNicks();
        set.add(r.name);
        writeSession(CHECKED_KEY, [...set]);
        schedule();
    }, { signal });
    // "jeff is now bob": both are nicknames now (cams.js records that).
    document.addEventListener('icx:nick', () => schedule(), { signal });

    // ── Cleaning ────────────────────────────────────────────────────────────

    const TAGS = new Set(['P', 'B', 'I', 'U', 'S', 'STRIKE', 'EM', 'STRONG', 'FONT', 'SPAN', 'A', 'IMG', 'BR', 'SMALL']);
    const COLOR = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|[a-z]{3,20})$/i;
    const SITE_IMG = /^https:\/\/([a-z0-9-]+\.)*icanhazchat\.com\//i;

    function colorOf(node) {
        const c = (node.style?.color || '').trim();
        return COLOR.test(c) ? c : '';
    }

    // A clean copy of node, built from the allowlist. Unknown elements keep
    // their text; a link that isn't to the web, or a picture not from the
    // site, becomes its text.
    function clean(node) {
        if (node.nodeType === 3) { return document.createTextNode(node.textContent); }
        if (node.nodeType !== 1) { return null; }
        const tag = node.tagName.toUpperCase();
        if (tag === 'SCRIPT' || tag === 'STYLE') { return null; }
        if (tag === 'IMG') {
            const src = node.getAttribute('src') || '';
            if (!SITE_IMG.test(src)) { return document.createTextNode(node.getAttribute('alt') || ''); }
            const img = el('img', { src, alt: node.getAttribute('alt') || '' });
            for (const a of ['title', 'width', 'height']) {
                const v = node.getAttribute(a);
                if (v && /^[\w\s.%:'-]{1,80}$/.test(v)) { img.setAttribute(a, v); }
            }
            return img;
        }
        let out;
        if (!TAGS.has(tag)) {
            out = document.createDocumentFragment();
        } else if (tag === 'A') {
            const href = node.getAttribute('href') || '';
            out = /^https?:\/\//i.test(href)
                ? el('a', { href, target: '_blank', rel: 'noopener noreferrer' })
                : el('span');
        } else {
            out = document.createElement(tag.toLowerCase());
            if (tag === 'FONT') {
                const c = node.getAttribute('color') || '';
                if (COLOR.test(c)) { out.setAttribute('color', c); }
            }
            if (tag === 'P') {
                const kept = [...node.classList].filter(c => c === 'line' || /^odd_row[123]$/.test(c));
                if (kept.length) { out.className = kept.join(' '); }
            }
        }
        const color = out.nodeType === 1 ? colorOf(node) : '';
        if (color) { out.style.color = color; }
        for (const child of node.childNodes) {
            const c = clean(child);
            if (c) { out.append(c); }
        }
        return out;
    }

    // A conversation's lines (restored ones included, not the site's hint at
    // the top), as cleaned HTML strings.
    function snapshot(msgs) {
        return [...msgs.querySelectorAll('p.line')]
            .slice(-MAX_LINES)
            .map(p => { const c = clean(p); return c && c.outerHTML; })
            .filter(Boolean);
    }

    const parser = new DOMParser();
    function rebuild(html) {
        const doc = parser.parseFromString(`<body>${html}</body>`, 'text/html');
        return [...doc.body.childNodes].map(clean).filter(Boolean);
    }

    // ── Saving ──────────────────────────────────────────────────────────────

    const nameOf = li => li.id.replace(/^pm_/, '');
    const msgsOf = name => document.getElementById(`msgs_${name}`);

    function save() {
        if (!keeping()) { return; }
        const long = loadLong();
        const short = loadShort();
        for (const li of tabs.querySelectorAll(':scope > ul > li[id^="pm_"]')) {
            const name = nameOf(li);
            const msgs = msgsOf(name);
            if (!name || !msgs) { continue; }
            const lines = snapshot(msgs);
            if (!lines.length) { continue; }
            const before = long[name] || short[name];
            const changed = !before || before.lines.length !== lines.length || before.lines[before.lines.length - 1] !== lines[lines.length - 1];
            const entry = {
                t: changed ? Date.now() : Number(before.t) || Date.now(),
                open: !li.classList.contains('icx-pm-closed'),
                lines,
            };
            if (longTerm(name)) { long[name] = entry; delete short[name]; } else { short[name] = entry; delete long[name]; }
        }
        // A conversation saved long-term whose name has since turned out to
        // be a nickname moves to the session.
        const nicks = sessionNicks();
        const perma = permaNicks();
        for (const name of Object.keys(long)) {
            if (nicks.has(name) && !perma.has(name)) { short[name] = long[name]; delete long[name]; }
        }
        store.set(LONG_KEY, prune(long));
        writeSession(SESSION_KEY, prune(short));
    }

    let timer = 0;
    function schedule() {
        clearTimeout(timer);
        timer = setTimeout(save, 600);
    }
    onRetire(() => clearTimeout(timer));
    const observer = new MutationObserver(schedule);
    observer.observe(tabs, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    onRetire(() => observer.disconnect());
    window.addEventListener('pagehide', () => { clearTimeout(timer); save(); }, { signal });

    // ── Restoring ───────────────────────────────────────────────────────────

    function saved(name) {
        return loadShort()[name] || loadLong()[name] || null;
    }

    const dateFormat = new Intl.DateTimeFormat([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

    // The saved lines go in above everything since the tab opened, under a
    // heading saying when they're from, with a rule between them and what's
    // new. Once per conversation per page.
    function fill(name) {
        const msgs = msgsOf(name);
        const entry = saved(name);
        if (!msgs || !entry || msgs.querySelector(':scope > .icx-pm-earlier')) { return; }
        const lines = entry.lines.flatMap(rebuild);
        if (!lines.length) { return; }
        const block = el('div', { class: 'icx-pm-earlier' }, [
            el('div', { class: 'icx-pm-earlier-head', text: `Earlier · last message ${dateFormat.format(new Date(Number(entry.t)))}` }),
            ...lines,
        ]);
        const first = msgs.querySelector(':scope > p.line');
        if (first) { first.before(block); } else { msgs.append(block); }
        msgs.scrollTop = msgs.scrollHeight;
    }

    // A conversation the site opens (a message in, or one you start):
    // its earlier lines, if any.
    document.addEventListener('icx:pm', e => {
        if (!keeping()) { return; }
        let pm;
        try { pm = JSON.parse(e.detail); } catch (_) { return; }
        if (pm && pm.name) { fill(String(pm.name)); }
    }, { signal });

    // On load, once page.js has the site's PM code in hand, every saved
    // conversation comes back, oldest first:
    //   - after a reload (or another room in the same tab): as you left them,
    //     the open ones open and the rest in the chat bar's Closed menu;
    //   - in a new visit: all in the Closed menu, so nothing opens by
    //     itself. Pick one to carry on, or it opens when they message you.
    // The tab's sessionStorage tells the two apart: it survives a reload, not
    // a closed tab.
    const SEEN_KEY = 'icx_pmSeen';
    let sameTab = false;
    try { sameTab = sessionStorage.getItem(SEEN_KEY) === '1'; sessionStorage.setItem(SEEN_KEY, '1'); } catch (_) {}

    let restored = false;
    function restore() {
        if (restored || !keeping()) { return; }
        restored = true;
        const all = Object.entries(prune({ ...loadLong(), ...loadShort() }))
            .sort(([, a], [, b]) => a.t - b.t);
        for (const [name, convo] of all) {
            const existed = !!document.getElementById(`pm_${name}`);
            if (!existed) {
                document.dispatchEvent(new CustomEvent('icx:pm-restore', { detail: JSON.stringify({ name }) }));
            }
            fill(name);
            if (!existed && !(sameTab && convo.open)) { globalThis.ICX.pms?.close(name); }
        }
        document.dispatchEvent(new CustomEvent('icx:chat-get'));   // the chat bar's Closed menu
    }
    document.addEventListener('icx:pm-ready', restore, { signal });
    document.dispatchEvent(new CustomEvent('icx:pm-ping'));

    // ── Setting ─────────────────────────────────────────────────────────────

    function clearSaved() {
        store.remove(LONG_KEY);
        try { sessionStorage.removeItem(SESSION_KEY); } catch (_) {}
    }

    globalThis.ICX.pmLog = {
        get: keeping,
        set(on) {
            store.set('pmKeep', !!on);
            if (on) { save(); } else { clearSaved(); }
            globalThis.ICX.controls?.changed('pmKeep');
        },
        clear() {
            clearSaved();
            globalThis.ICX.controls?.changed('pmKeep');
        },
        count: () => Object.keys(loadLong()).length + Object.keys(loadShort()).length,
    };
})();
