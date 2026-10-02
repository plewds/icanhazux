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
            else if (k === 'html') { node.innerHTML = v; }
            else if (k.startsWith('on')) { node.addEventListener(k.slice(2), v); }
            else { node.setAttribute(k, v); }
        }
        for (const child of children) { node.append(child); }
        return node;
    }

    // Icons are inline SVG so they inherit currentColor.
    const svg = body => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
    const ICONS = {
        // Focus: one big tile with small ones around it. Unfocus: even grid.
        focus: svg('<rect x="3" y="3" width="12" height="12" rx="1.5"/><rect x="18" y="3" width="3" height="5" rx="1"/><rect x="18" y="11" width="3" height="4" rx="1"/><rect x="3" y="18" width="5" height="3" rx="1"/><rect x="11" y="18" width="10" height="3" rx="1"/>'),
        unfocus: svg('<rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"/>'),
        fullscreen: svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
        refresh: svg('<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>'),
        hide: svg('<path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c5 0 9 4.5 10 7a13 13 0 0 1-3 4.2M6.6 6.6A13 13 0 0 0 2 12c1 2.5 5 7 10 7a9.6 9.6 0 0 0 4.4-1.1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'),
        show: svg('<path d="M2 12c1-2.5 5-7 10-7s9 4.5 10 7c-1 2.5-5 7-10 7S3 14.5 2 12z"/><circle cx="12" cy="12" r="3"/>'),
    };

    globalThis.ICX = { store, frameThrottle, el, ICONS };
})();
