// Light and dark themes.
//
// Sets html[data-icx-theme] to "light" or "dark": the system setting by
// default, or whatever the user picks in chat settings (System / Light /
// Dark, remembered). Also html[data-icx-accent], the accent swatch picked in
// settings. All colors in styles/icanhazux.css hang off those two.
//
// Chat colors are each user's own choice. The site limits them so they read
// on a white background, which is what the light theme shows them on,
// exactly as chosen. On the dark theme the darker picks (navy, black, deep
// purple) would vanish, so any color that doesn't reach readable contrast is
// lightened, keeping its hue, just enough to read. Originals are kept and
// restored when switching back to light.
(function () {
    'use strict';

    const { store, signal, onRetire } = globalThis.ICX;

    const root = document.documentElement;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const MIN_CONTRAST = 4.5;          // WCAG AA for body text
    const DARK_SURFACE = [43, 38, 45]; // --icx-surface in the dark theme (#2b262d)

    let pref = ['system', 'light', 'dark'].includes(store.get('theme')) ? store.get('theme') : 'system';
    const ACCENTS = ['grape', 'crimson', 'tangerine', 'gold', 'forest', 'aqua', 'cobalt', 'pink'];
    // Swatches from the first palette, to their nearest in this one.
    const RENAMED = { coral: 'tangerine', amber: 'gold', teal: 'aqua', blue: 'cobalt' };
    const saved = RENAMED[store.get('accent')] || store.get('accent');
    let accent = ACCENTS.includes(saved) ? saved : 'grape';
    const listeners = new Set();

    function resolved() {
        return pref === 'system' ? (media.matches ? 'dark' : 'light') : pref;
    }

    function apply() {
        root.dataset.icxAccent = accent;
        const theme = resolved();
        if (root.dataset.icxTheme !== theme) {
            root.dataset.icxTheme = theme;
            fixAll();
        }
        listeners.forEach(fn => fn({ pref, theme, accent }));
    }

    // ── Color math ──────────────────────────────────────────────────────────

    function parseRgb(css) {
        const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(css || '');
        return m ? [+m[1], +m[2], +m[3]] : null;
    }

    function luminance([r, g, b]) {
        const lin = c => {
            c /= 255;
            return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    }

    function contrast(a, b) {
        const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
        return (hi + 0.05) / (lo + 0.05);
    }

    function toHsl([r, g, b]) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const l = (max + min) / 2;
        if (max === min) { return [0, 0, l]; }
        const d = max - min;
        const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
        return [h / 6, s, l];
    }

    function fromHsl([h, s, l]) {
        if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        const ch = t => {
            if (t < 0) { t += 1; }
            if (t > 1) { t -= 1; }
            if (t < 1 / 6) { return p + (q - p) * 6 * t; }
            if (t < 1 / 2) { return q; }
            if (t < 2 / 3) { return p + (q - p) * (2 / 3 - t) * 6; }
            return p;
        };
        return [ch(h + 1 / 3), ch(h), ch(h - 1 / 3)].map(v => Math.round(v * 255));
    }

    // Raise lightness, hue and saturation kept, until the color reads on bg.
    const memo = new Map();
    function readableOn(rgb, bg) {
        const key = rgb.join(',');
        if (memo.has(key)) { return memo.get(key); }
        let out = null;
        if (contrast(rgb, bg) < MIN_CONTRAST) {
            const [h, s, l0] = toHsl(rgb);
            for (let l = l0; l <= 1.0001; l += 0.02) {
                const c = fromHsl([h, s, Math.min(1, l)]);
                if (contrast(c, bg) >= MIN_CONTRAST) { out = c; break; }
            }
            out = out || [235, 235, 235];
        }
        memo.set(key, out);
        return out;
    }

    // ── Applying it to chat ─────────────────────────────────────────────────
    // Elements carrying a user color: inline style="color:…" (chat lines,
    // names) and the occasional <font color>. Originals live in data-icx-color.

    const SCOPES = ['#txt', '#activeUserList', '#tabs', '#userinfo_dialog', '#gift_dialog', '#picture_dialog'];
    const SELECTOR = '[style*="color"], font[color]';

    function fixEl(node) {
        let orig = node.dataset.icxColor;
        if (orig === undefined) {
            orig = node.style.color || (node.getAttribute('color') ? `color:${node.getAttribute('color')}` : '');
            if (!orig) { return; }
            node.dataset.icxColor = orig;
        }
        if (resolved() !== 'dark') {
            // Light theme: exactly as chosen.
            if (node.dataset.icxLifted) {
                if (orig.startsWith('color:')) { node.style.removeProperty('color'); } else { node.style.color = orig; }
                delete node.dataset.icxLifted;
            }
            return;
        }
        const rgb = parseRgb(cssColor(orig.startsWith('color:') ? orig.slice(6) : orig));
        const lifted = rgb && readableOn(rgb, DARK_SURFACE);
        if (lifted) {
            node.style.color = `rgb(${lifted.join(', ')})`;
            node.dataset.icxLifted = '1';
        }
    }

    // Normalize any CSS color (from <font color>: names like 'black', hex)
    // to rgb(). A canvas reports what it was given as #rrggbb or rgba().
    const ctx = document.createElement('canvas').getContext('2d');
    function cssColor(value) {
        if (!ctx) { return ''; }
        ctx.fillStyle = '#010203';
        ctx.fillStyle = String(value).trim();
        const out = ctx.fillStyle;
        if (out === '#010203' && !/^#?010203$/i.test(String(value).trim())) { return ''; }   // not a color
        if (out.startsWith('#')) {
            const n = parseInt(out.slice(1), 16);
            return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
        }
        return out;
    }

    function fixWithin(el) {
        if (el.nodeType !== 1) { return; }
        if (el.matches(SELECTOR)) { fixEl(el); }
        el.querySelectorAll(SELECTOR).forEach(fixEl);
    }

    function fixAll() {
        SCOPES.forEach(sel => { const el = document.querySelector(sel); if (el) { fixWithin(el); } });
    }

    function watch() {
        SCOPES.forEach(sel => {
            const el = document.querySelector(sel);
            if (!el) { return; }
            const observer = new MutationObserver(records => {
                for (const r of records) { r.addedNodes.forEach(fixWithin); }
            });
            observer.observe(el, { childList: true, subtree: true });
            onRetire(() => observer.disconnect());
        });
    }

    // ── Public API (chat settings uses it) ──────────────────────────────────

    globalThis.ICX.theme = {
        get: () => ({ pref, theme: resolved(), accent }),
        accents: ACCENTS,
        setAccent(next) {
            if (!ACCENTS.includes(next)) { return; }
            accent = next;
            store.set('accent', next);
            apply();
        },
        set(next) {
            if (!['system', 'light', 'dark'].includes(next)) { return; }
            pref = next;
            store.set('theme', next);
            apply();
        },
        onChange(fn) { listeners.add(fn); },
        // A chat color as it shows in the current theme: lifted in dark mode
        // if it's too dark to read. { color, lifted } in rgb().
        displayColor(css) {
            const rgb = parseRgb(cssColor(css));
            if (!rgb) { return { color: css, lifted: false }; }
            const lifted = resolved() === 'dark' && readableOn(rgb, DARK_SURFACE);
            return { color: `rgb(${(lifted || rgb).join(', ')})`, lifted: !!lifted };
        },
        // Exposed for tests.
        _readableOn: readableOn,
        _contrast: contrast,
    };

    media.addEventListener('change', () => { if (pref === 'system') { apply(); } }, { signal });
    apply();
    watch();
    fixAll();
})();
