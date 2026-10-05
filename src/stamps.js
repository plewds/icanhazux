// Timestamps on chat lines (Settings → Timestamps).
//
//   none       nothing
//   relative   "37s ago" in a column at the right, kept current, counted from
//              when the line arrived (so lines already there at load get
//              none). Drawn by the stylesheet (::after), so it stays out of
//              copied text.
//   absolute   the time before the message, as real text, so a copied log
//              keeps it: the site's own "[13:16]" stamp
//              (<font color="#999999">, first in the line), or this
//              browser's clock where a line has none.
//
// The stylesheet shows the chosen one from html[data-icx-stamps].
(function () {
    'use strict';

    const { store, el, signal, onRetire } = globalThis.ICX;

    if (!globalThis.ICX.isRoom) { return; }
    const log = document.getElementById('txt');
    if (!log) { return; }

    const MODES = ['none', 'relative', 'absolute'];
    let mode = MODES.includes(store.get('timestamps')) ? store.get('timestamps') : 'relative';

    const clockFormat = new Intl.DateTimeFormat([], { hour: '2-digit', minute: '2-digit' });
    const absolute = t => clockFormat.format(t);
    function relative(ms) {
        const s = Math.max(0, Math.floor(ms / 1000));
        if (s < 5) { return 'just now'; }
        if (s < 60) { return `${s}s ago`; }
        const m = Math.floor(s / 60);
        if (m < 60) { return `${m}m ago`; }
        return `${Math.floor(m / 60)}h ago`;
    }

    // For a narrow chat's slimmer column: "37s", "35m", "now".
    const short = text => text === 'just now' ? 'now' : text.replace(' ago', '');

    const SITE_STAMP = /^\s*\[\d{1,2}:\d{2}(:\d{2})?\]\s*$/;
    let siteStamps = false;     // has the site been stamping lines?
    // The site's own stamp, if the line starts with one.
    function siteStamp(line) {
        const first = line.firstElementChild;
        if (!first || !first.matches('font') || !SITE_STAMP.test(first.textContent)) { return null; }
        first.classList.add('icx-site-stamp');
        siteStamps = true;
        return first;
    }

    // live: arrived after load, so it can count "ago" from now.
    function stamp(line, live) {
        if (line.nodeType !== 1 || !line.matches('p') || 'icxStamped' in line.dataset) { return; }
        line.dataset.icxStamped = '';
        const at = Date.now();
        // Our own clock only for lines arriving now: older ones' times are unknown.
        if (!siteStamp(line) && live) {
            line.prepend(el('span', { class: 'icx-stamp icx-stamp-abs', text: `${absolute(at)} ` }));
        }
        if (live) {
            line.dataset.icxAt = String(at);
            // In the right-hand column (the stylesheet places it).
            line.prepend(el('span', { class: 'icx-stamp icx-stamp-rel', 'aria-hidden': 'true', 'data-ago': relative(0), 'data-short': short(relative(0)) }));
        }
    }

    function tick() {
        if (mode !== 'relative') { return; }
        const now = Date.now();
        log.querySelectorAll(':scope > p > .icx-stamp-rel').forEach(s => {
            const text = relative(now - Number(s.parentElement.dataset.icxAt));
            if (s.dataset.ago !== text) { s.dataset.ago = text; s.dataset.short = short(text); }
        });
    }

    function apply() {
        document.documentElement.dataset.icxStamps = mode;
        tick();
    }

    const observer = new MutationObserver(records => records.forEach(r => r.addedNodes.forEach(n => stamp(n, true))));
    observer.observe(log, { childList: true });
    log.querySelectorAll(':scope > p').forEach(line => stamp(line, false));
    const timer = setInterval(tick, 5000);
    onRetire(() => { observer.disconnect(); clearInterval(timer); });
    signal.addEventListener('abort', () => { delete document.documentElement.dataset.icxStamps; });

    globalThis.ICX.stamps = {
        modes: MODES,
        get: () => mode,
        set(value) {
            if (!MODES.includes(value)) { return; }
            mode = value;
            store.set('timestamps', mode);
            apply();
        },
        // Examples for the settings panel.
        example(value) {
            if (value === 'relative') { return '37s ago'; }
            if (value !== 'absolute') { return 'Off'; }
            const d = new Date();
            return siteStamps ? `[${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}]` : absolute(d);
        },
    };
    apply();
})();
