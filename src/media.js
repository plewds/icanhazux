// Image and video links in chat and PMs preview inline, on demand.
//
// The site already turns links ending in .jpg/.jpeg/.png/.gif/.gifv into
// javascript:bm('<url>'), which opens the picture in a popup window. Here a
// click instead shows a small preview under the message; clicking the link
// again collapses it. "Open full size" (or the picture itself) opens the
// original in a new tab and collapses the preview: you've seen it.
//
// Plain links to .webp, .mp4 and .webm get the same treatment; the site
// doesn't know those as pictures. Nothing loads until it's clicked.
(function () {
    'use strict';

    const { el, frameThrottle, signal, onRetire } = globalThis.ICX;

    if (!globalThis.ICX.isRoom) { return; }
    const log = document.getElementById('txt');
    if (!log) { return; }
    const pmWindow = document.getElementById('tabs');

    const IMAGE = /\.(jpe?g|png|gif|webp)$/i;
    const VIDEO = /\.(mp4|webm)$/i;
    const SCOPE = '#txt a, #tabs .pm_convo a';

    // The address a link points at, unwrapped from the site's bm() popup.
    function urlOf(a) {
        const href = a.getAttribute('href') || '';
        const site = /^javascript:\s*bm\('([^']+)'\)/i.exec(href);
        try { return new URL(site ? site[1] : href, location.href); } catch (_) { return null; }
    }

    // tenor.com links ending in .gif (tenor.com/wJF8.gif) are short links to
    // Tenor's page for the GIF, not the picture, which lives on
    // media.tenor.com. They open as plain links instead.
    const isTenorPage = u => /^(www\.)?tenor\.com$/i.test(u.hostname);

    // { kind: 'image' | 'video', src, url } for a previewable link, or null.
    function mediaOf(a) {
        const u = urlOf(a);
        if (!u || !/^https?:$/.test(u.protocol) || isTenorPage(u)) { return null; }
        const path = u.pathname;
        if (IMAGE.test(path)) { return { kind: 'image', src: u.href, url: u.href }; }
        if (VIDEO.test(path)) { return { kind: 'video', src: u.href, url: u.href }; }
        // imgur's .gifv is a page; the video behind it is the same name in .mp4
        // (what the site's own popup plays).
        if (/\.gifv$/i.test(path) && /(^|\.)imgur\.com$/i.test(u.hostname)) {
            return { kind: 'video', src: u.href.replace(/\.gifv/i, '.mp4'), url: u.href };
        }
        return null;
    }

    // Tag previewable links (for the stylesheet's "image"/"video" marker).
    function mark(root) {
        const links = root.matches?.(SCOPE) ? [root] : [...(root.querySelectorAll?.(SCOPE) || [])];
        links.forEach(a => {
            if (a.dataset.icxMedia !== undefined || a.closest('.icx-media-preview')) { return; }
            const media = mediaOf(a);
            a.dataset.icxMedia = media ? media.kind : '';
            // The site's popup would show a page as a broken picture.
            const u = urlOf(a);
            if (!media && u && isTenorPage(u) && /^javascript:/i.test(a.getAttribute('href'))) {
                a.href = u.href;
                a.target = '_blank';
                a.rel = 'noopener noreferrer';
            }
            if (media) { a.setAttribute('aria-expanded', 'false'); a.title = `Preview this ${media.kind}`; }
        });
    }

    const lineOf = a => a.closest('p, .line') || a.parentElement;
    const nearBottom = box => box.scrollHeight - box.scrollTop - box.clientHeight < 60;

    function collapse(a) {
        a.icxPreview?.remove();
        a.icxPreview = null;
        a.setAttribute('aria-expanded', 'false');
    }

    function expand(a, media) {
        const box = a.closest('#txt, .pm_convo');
        const pinned = box && nearBottom(box);
        const keepPinned = () => { if (pinned) { box.scrollTop = box.scrollHeight; } };

        // The picture and the "full size" link both open the original in a
        // new tab, then the preview folds away.
        const full = (child, extra = {}) => el('a', {
            href: media.url, target: '_blank', rel: 'noopener noreferrer', ...extra,
        }, child ? [child] : []);
        let shown;
        if (media.kind === 'image') {
            const img = el('img', { src: media.src, alt: '', referrerpolicy: 'no-referrer' });
            img.addEventListener('load', keepPinned, { once: true });
            img.addEventListener('error', () => preview.classList.add('icx-media-failed'), { once: true });
            shown = full(img, { class: 'icx-media-frame', title: 'Open full size' });
        } else {
            const video = el('video', { src: media.src, muted: '', loop: '', autoplay: '', playsinline: '', controls: '', preload: 'metadata' });
            video.muted = true;
            video.addEventListener('loadedmetadata', keepPinned, { once: true });
            video.addEventListener('error', () => preview.classList.add('icx-media-failed'), { once: true });
            shown = el('div', { class: 'icx-media-frame' }, [video]);
        }
        const preview = el('div', { class: 'icx-media-preview' }, [
            shown,
            el('div', { class: 'icx-media-bar' }, [
                el('span', { class: 'icx-media-error', text: `Couldn’t load this ${media.kind}.` }),
                full(null, { class: 'icx-media-open', text: 'Open full size ↗' }),
                el('button', { type: 'button', class: 'icx-media-close', 'aria-label': 'Hide preview', text: 'Hide' }),
            ]),
        ]);
        preview.addEventListener('click', e => {
            if (e.target.closest('.icx-media-close')) { collapse(a); return; }
            // After the browser has followed the link to the new tab.
            if (e.target.closest('a[target="_blank"]')) { setTimeout(() => collapse(a), 0); }
        });
        lineOf(a).append(preview);
        a.icxPreview = preview;
        a.setAttribute('aria-expanded', 'true');
        keepPinned();
    }

    // Capture phase, ahead of the site's javascript:bm() popup (and a plain
    // link opening a tab).
    document.addEventListener('click', e => {
        if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey) { return; }
        const a = e.target.closest?.(SCOPE);
        if (!a || a.closest('.icx-media-preview')) { return; }
        const media = mediaOf(a);
        if (!media) { return; }
        e.preventDefault();
        e.stopImmediatePropagation();
        if (a.icxPreview?.isConnected) { collapse(a); } else { expand(a, media); }
    }, { capture: true, signal });

    // New chat lines and PM messages.
    const pending = new Set();
    const flush = frameThrottle(() => { pending.forEach(mark); pending.clear(); });
    const observer = new MutationObserver(records => {
        records.forEach(r => r.addedNodes.forEach(n => { if (n.nodeType === 1) { pending.add(n); } }));
        if (pending.size) { flush(); }
    });
    observer.observe(log, { childList: true, subtree: true });
    if (pmWindow) { observer.observe(pmWindow, { childList: true, subtree: true }); }
    onRetire(() => observer.disconnect());
    mark(log);
    if (pmWindow) { mark(pmWindow); }
})();
