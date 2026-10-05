// Shared helpers for the content scripts. Every content script file runs in the
// same isolated world, so they share this one namespace.
(function () {
    'use strict';

    const PREFIX = 'icx_';

    const store = {
        get(key, fallback) {
            try {
                const raw = localStorage.getItem(PREFIX + key);
                return raw == null ? fallback : JSON.parse(raw);
            } catch (_) {
                return fallback;
            }
        },
        set(key, value) {
            try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch (_) {}
        },
        remove(key) {
            try { localStorage.removeItem(PREFIX + key); } catch (_) {}
        },
    };

    // Coalesce many requests into one call on the next animation frame.
    function frameThrottle(fn) {
        let queued = false;
        return () => {
            if (queued) { return; }
            queued = true;
            requestAnimationFrame(() => { queued = false; fn(); });
        };
    }

    function el(tag, props = {}, children = []) {
        const node = document.createElement(tag);
        for (const [k, v] of Object.entries(props)) {
            if (k === 'class') { node.className = v; }
            else if (k === 'text') { node.textContent = v; }
            else if (k.startsWith('on')) { node.addEventListener(k.slice(2), v); }
            else { node.setAttribute(k, v); }
        }
        for (const child of children) { node.append(child); }
        return node;
    }

    // Icons are inline SVG so they inherit currentColor.
    const svg = body => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
    const ICONS = {
        // Focus: one big tile with small ones around it. Unfocus: even grid.
        focus: svg('<rect x="3" y="3" width="12" height="12" rx="1.5"/><rect x="18" y="3" width="3" height="5" rx="1"/><rect x="18" y="11" width="3" height="4" rx="1"/><rect x="3" y="18" width="5" height="3" rx="1"/><rect x="11" y="18" width="10" height="3" rx="1"/>'),
        unfocus: svg('<rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"/>'),
        fullscreen: svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
        refresh: svg('<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>'),
        hide: svg('<path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c5 0 9 4.5 10 7a13 13 0 0 1-3 4.2M6.6 6.6A13 13 0 0 0 2 12c1 2.5 5 7 10 7a9.6 9.6 0 0 0 4.4-1.1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'),
        show: svg('<path d="M2 12c1-2.5 5-7 10-7s9 4.5 10 7c-1 2.5-5 7-10 7S3 14.5 2 12z"/><circle cx="12" cy="12" r="3"/>'),
        pause: svg('<path d="M9 5v14M15 5v14"/>'),
        play: svg('<path d="M7 5l12 7-12 7z"/>'),
        clear: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
        gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
        message: svg('<path d="M21 12a8 8 0 0 1-11.8 7L4 20l1.1-4.6A8 8 0 1 1 21 12z"/>'),
        cam: svg('<rect x="2" y="6" width="14" height="12" rx="2"/><path d="M16 10.5l6-3.5v10l-6-3.5z"/>'),
        mod: svg('<path d="M12 3l8 3v6c0 4.6-3.4 8.3-8 9-4.6-.7-8-4.4-8-9V6z"/>'),
        // PM window: pop out to float, or dock back into the chat.
        popout: svg('<path d="M14 4h6v6M20 4l-8 8"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'),
        dock: svg('<rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M4 10h16"/>'),
    };

    // ── One live copy at a time ──────────────────────────────────────────
    // When the extension is updated or reloaded while a room tab is open,
    // the browser injects the new copy into that tab. The old copy's elements
    // stay in the page, and (in Chrome) its scripts keep running. So each
    // copy stamps itself as current; an older copy that sees it has been
    // replaced aborts its listeners and stops its observers, and the new copy
    // clears the old one's elements as it builds its own.
    const root = document.documentElement;
    const generation = Math.random().toString(36).slice(2);
    const retire = new AbortController();
    const cleanups = [];
    root.dataset.icxGeneration = generation;
    const alive = () => root.dataset.icxGeneration === generation;
    document.addEventListener('icx:replaced', () => {
        if (alive()) { return; }
        retire.abort();
        cleanups.splice(0).forEach(fn => { try { fn(); } catch (_) {} });
    }, { signal: retire.signal });
    // Tell older copies (registered above in their own world) to stand down.
    queueMicrotask(() => document.dispatchEvent(new CustomEvent('icx:replaced')));

    // Listeners on the page, the document or the site's own elements take
    // { signal } so they go away with this copy; observers and timers
    // register a cleanup.
    const signal = retire.signal;
    const onRetire = fn => { cleanups.push(fn); };
    // Remove an element left behind by an older copy.
    const removeStale = id => { document.querySelectorAll(`#${id}`).forEach(n => n.remove()); };

    // An icon as an <svg> element. Parsed as SVG rather than set as HTML:
    // the markup is the fixed strings above, and nothing is written as HTML.
    const svgParser = new DOMParser();
    function icon(name) {
        const doc = svgParser.parseFromString(ICONS[name], 'image/svg+xml');
        return document.importNode(doc.documentElement, true);
    }

    globalThis.ICX = { store, frameThrottle, el, ICONS, icon, alive, signal, onRetire, removeStale };
})();
