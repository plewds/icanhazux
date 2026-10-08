// Pages outside rooms: the lobby, profiles, settings, messages, groups and the
// dashboard. They share the site header and footer (site.js themes those) and
// little else: each page's content is its own markup, full of hard-coded
// whites and grays (inline styles, <style> blocks, the site's stylesheet). So:
//
//   - html[data-icx-page] names the page, for the per-page rules in the CSS.
//   - A two-column page (a sidebar and the main content, which is most of
//     them) gets its columns marked .icx-side / .icx-main, and the CSS makes
//     each a card, like the cam and chat cards in a room. A one-column page
//     is a single card.
//   - Neutral colors are re-pointed at the theme: a white or gray background
//     becomes the card or an inset, gray text becomes the text or muted color,
//     a gray border the border color. That works off computed styles, so it
//     catches colors from anywhere, and leaves real colors (a red warning,
//     a user's pick) alone. theme.js lifts those in the dark theme if they
//     would be too dark to read.
(function () {
    'use strict';

    const { el, frameThrottle, onRetire } = globalThis.ICX;

    if (globalThis.ICX.isRoom) { return; }
    const paper = document.querySelector('.icx-paper');
    if (!paper) { return; }
    const root = document.documentElement;
    const part = id => document.getElementById(`ctl00_ContentPlaceHolder1_${id}`);

    // ── Which page ──────────────────────────────────────────────────────────
    // By landmarks in the markup rather than the URL: the site serves the same
    // page under several paths (/settings, /Settings/, /settings.aspx…).
    const KINDS = [
        ['settings', () => part('divSettings')],
        ['dashboard', () => part('pnlScratchPad')],
        ['home', () => part('txtRoomName')],
        ['profile', () => part('lblKarma') || part('labelBio')],
        ['thread', () => part('divMessageViewControls')],
        ['messages', () => part('divMessages')],
        ['group', () => part('labelGroupName')],
        // One group post and its replies (the list of posts has no title).
        ['post', () => part('labelPageContent')?.querySelector('.message_subject_block')],
        ['groups', () => paper.querySelector('.group_entry')],
        // A room's sign-in, before you join: the nick to use, the password.
        ['join', () => part('txtUserName')],
        ['signin', () => part('pnlSignInForm')],
        // Get Hearted (becoming a site supporter): its own page, ids unprefixed.
        ['gethearted', () => document.getElementById('labelRecentPayments')],
    ];
    const kind = (KINDS.find(([, test]) => test()) || ['other'])[0];
    root.dataset.icxPage = kind;

    // ── Layout: sidebar card + main card ────────────────────────────────────
    // The two-column pages are a Bootstrap row near the top of the panel with
    // a narrow col-lg-* and a wide one. Most get two cards. A "sidebar"
    // holding only the page's name (the groups list, a message thread) is
    // a title over a single card instead.
    //
    // Known pages get their layout by kind, not by what the sidebar holds
    // right now: the site's own scripts fill some sidebars in after load
    // (the inbox's filters and shortcut keys), so a sidebar that looks bare
    // at this moment may not be. Other pages are judged by content, again
    // whenever their sidebar changes.
    const LAYOUTS = {
        settings: 'split', dashboard: 'split', home: 'split', profile: 'split',
        messages: 'split', group: 'split', thread: 'titled', groups: 'titled',
    };
    // The join page's two columns are a form, a label beside each field
    // ("Name/nick to use in <room>:" and its box, the supporter note and the
    // password), not a sidebar: it stays one card with its columns as they are.
    // A post's two columns are its breadcrumb and an empty "new post" slot:
    // also one card.
    const PLAIN = new Set(['join', 'signin', 'gethearted', 'post']);

    // The sign-in form centers itself with empty columns (blank, or just
    // &nbsp;) either side of each field; they're marked so the CSS can drop
    // them and lay the form out as one centered column.
    if (kind === 'signin') {
        paper.querySelectorAll('.row > [class*="col-"]').forEach(col => {
            if (!col.textContent.trim() && !col.querySelector('img, input, button, select, textarea, a')) { col.classList.add('icx-spacer'); }
        });
    }
    //
    // The room settings pages are the odd ones out: plain col-2 and col-10,
    // the narrow one a .page_name ("Room Settings"). They're matched by that
    // name rather than by any two-column row, which plenty of pages have
    // inside their content.
    const lgCols = row => [...row.children].filter(c => /\bcol-lg-\d/.test(c.className));
    const anyCols = row => [...row.children].filter(c => /\bcol-(?:(?:sm|md|lg|xl)-)?\d/.test(c.className));
    const rows = [...paper.querySelectorAll(':scope > .row, :scope > div > .row, :scope > div > div > .row')];
    let split = PLAIN.has(kind) ? null : rows.find(row => lgCols(row).length === 2);
    let [side, main] = split ? lgCols(split) : [];
    if (!split && !PLAIN.has(kind)) {
        split = rows.find(row => anyCols(row).length === 2 && anyCols(row)[0].classList.contains('page_name'));
        if (split) { [side, main] = anyCols(split); }
    }

    function layout() {
        const bare = !side.querySelector('img, input, textarea, select, table, ul, a') &&
            side.textContent.trim().length < 40;
        const titled = (LAYOUTS[kind] || (bare ? 'titled' : 'split')) === 'titled';
        split.classList.toggle('icx-titled', titled);
        side.classList.toggle('icx-page-title', titled);
        split.classList.toggle('icx-split', !titled);
        side.classList.toggle('icx-side', !titled);
        side.classList.toggle('icx-card', !titled);
        main.classList.toggle('icx-main', !titled);
        main.classList.toggle('icx-card', !titled);
        paper.classList.toggle('icx-paper-split', !titled);
        paper.classList.toggle('icx-card', titled);
    }
    if (split) {
        layout();
        if (!LAYOUTS[kind]) {
            const sideObserver = new MutationObserver(frameThrottle(layout));
            sideObserver.observe(side, { childList: true, subtree: true, characterData: true });
            onRetire(() => sideObserver.disconnect());
        }
    } else {
        paper.classList.add('icx-card');
    }

    // ── Settings ────────────────────────────────────────────────────────────
    // Each settings page opens with a dark bar: "⌂ Settings » Your Password".
    // It becomes a breadcrumb: the link back, then this page's name as the
    // card's title.
    if (kind === 'settings') {
        for (const h3 of paper.querySelectorAll('h3')) {
            const back = h3.querySelector(':scope > a[href*="ettings"]');
            if (!back) { continue; }
            h3.classList.add('icx-crumb');
            for (const node of [...h3.childNodes]) {
                if (node.nodeType === 3 && /»/.test(node.textContent)) {
                    const here = node.textContent.replace(/^[\s»]+/, '').trim();
                    node.replaceWith(el('span', { class: 'icx-crumb-here', text: here }));
                }
            }
        }
        // The index: four groups of links.
        const index = part('panelMain');
        if (index) { index.classList.add('icx-settings-index'); }
    }

    // ── Profile ─────────────────────────────────────────────────────────────
    // A profile's background picture (the owner's pick, which the theme
    // otherwise hides behind its plain page color) becomes a cover banner
    // across the top of the main card.
    // The site keeps the picture's address in a hidden field (backImgUrl)
    // and sets it on <body> from a script (setPageBackground), which may not
    // have run yet: the field first, then <body>. A "~" in the address
    // means tiled; the address is what's before it.
    // Someone without a picture of their own can still have an address
    // there that doesn't give one (a placeholder, a dead link), which made
    // an empty banner. So the banner only goes up once the picture has
    // loaded and is a real one, not a pixel-sized spacer.
    if (kind === 'profile' && split) {
        const field = (part('backImgUrl')?.value || '').split('~')[0].trim();
        const m = /url\(["']?([^"')]+)["']?\)/.exec(document.body.style.backgroundImage || '');
        // Made absolute: the site writes "//images.icanhazchat.com/…", and a
        // relative address in --icx-cover would be read against the
        // extension's stylesheet that uses it (moz-extension://images…),
        // which drew an empty banner.
        let src = field || (m && m[1]);
        try { src = src && new URL(src, location.href).href; } catch (_) { src = ''; }
        if (src) {
            const probe = new Image();
            probe.onload = () => {
                if (probe.naturalWidth < 64 || probe.naturalHeight < 32) { return; }
                main.style.setProperty('--icx-cover', `url("${src.replace(/"/g, '%22')}")`);
                main.classList.add('icx-has-cover');
            };
            probe.src = src;
        }
    }

    // ── A post ──────────────────────────────────────────────────────────────
    // Posts are spaced with stacked <br>s: two or three either side of each
    // heading (and of the rule over a reply's picture), and runs of three or
    // more between paragraphs. Their own margins do that job, so the breaks
    // next to a heading or rule, and any past
    // the second in a row, are marked to hide (not removed: the site's reply
    // button quotes a post from its markup).
    if (kind === 'post') {
        const solid = n => n.nodeType === 1 || (n.nodeType === 3 && n.textContent.trim());
        const near = (n, dir) => { do { n = n[dir]; } while (n && !solid(n)); return n; };
        const isBr = n => n?.nodeName === 'BR';
        const isHead = n => /^(H[1-4]|HR)$/.test(n?.nodeName || '');
        paper.querySelectorAll('.message_body').forEach(body => {
            let run = 0;
            for (const br of body.querySelectorAll(':scope > br')) {
                const before = near(br, 'previousSibling');
                run = isBr(before) ? run + 1 : 0;
                let after = br;
                while (isBr(after)) { after = near(after, 'nextSibling'); }
                let back = br;
                while (isBr(back)) { back = near(back, 'previousSibling'); }
                if (run >= 2 || isHead(after) || isHead(back)) { br.classList.add('icx-gap'); }
            }
        });
    }

    // ── Colors ──────────────────────────────────────────────────────────────

    function rgba(css) {
        const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?/.exec(css || '');
        if (!m) { return null; }
        let a = m[4] === undefined ? 1 : parseFloat(m[4]);
        if (String(m[4]).endsWith('%')) { a /= 100; }
        return [+m[1], +m[2], +m[3], a];
    }
    // The color theme.js saved before lifting it: an rgb() from style.color,
    // or "color:<value>" from <font color>, where the value is usually hex.
    function original(node) {
        let c = node.dataset.icxColor;
        if (!c) { return null; }
        if (c.startsWith('color:')) { c = c.slice(6).trim(); }
        const hex = /^#?([\da-f]{3}|[\da-f]{6})$/i.exec(c);
        if (hex) {
            const h = hex[1].length === 3 ? hex[1].replace(/./g, ch => ch + ch) : hex[1];
            const n = parseInt(h, 16);
            return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`;
        }
        return c;
    }

    // Gray (any shade, white and black included) vs. a real color.
    const isNeutral = ([r, g, b]) => Math.max(r, g, b) - Math.min(r, g, b) <= 24;
    const lightness = ([r, g, b]) => (Math.max(r, g, b) + Math.min(r, g, b)) / 510;

    // The theme's own colors, as computed rgb() strings: anything already
    // wearing one of these is styled by our CSS and left alone. Kept apart
    // for backgrounds and text: white is a text token (on the accent), but a
    // white background is the page's.
    const bgTokens = new Set();
    const fgTokens = new Set();
    function readTokens() {
        const probe = el('span', { style: 'position:absolute;visibility:hidden' });
        paper.append(probe);
        const read = (set, names) => names.forEach(name => {
            probe.style.color = `var(${name})`;
            set.add(getComputedStyle(probe).color);
        });
        read(bgTokens, ['--icx-bg', '--icx-surface', '--icx-surface-2', '--icx-stage', '--icx-accent',
            '--icx-accent-soft', '--icx-live', '--icx-border', '--icx-border-strong']);
        read(fgTokens, ['--icx-text', '--icx-text-muted', '--icx-accent', '--icx-accent-text', '--icx-accent-fg',
            '--icx-live-fg']);
        probe.remove();
    }

    // Nothing to re-point in media, form controls and buttons (the CSS styles
    // those outright), or in our own elements.
    const SKIP = 'img, svg, video, audio, iframe, object, embed, canvas, input, select, textarea, option, ' +
        'button, .btn, br, script, style, link, [class*="icx-"]:not(.icx-paper):not(.icx-card)';

    // The background a piece of text actually sits on: the nearest one that
    // isn't (nearly) transparent.
    function backdrop(node) {
        for (let n = node; n && n !== document.documentElement; n = n.parentElement) {
            const c = rgba(getComputedStyle(n).backgroundColor);
            if (c && c[3] > 0.5) { return c; }
        }
        return null;
    }

    function tame(node) {
        // Cards are drawn whole by the CSS (fill, gradient edge); their old
        // inline borders and backgrounds are overridden there.
        if (node.matches(SKIP) || node.classList.contains('icx-card')) { return; }
        const cs = getComputedStyle(node);

        const bg = rgba(cs.backgroundColor);
        if (bg && bg[3] > 0.08 && isNeutral(bg) && !bgTokens.has(cs.backgroundColor)) {
            const l = lightness(bg);
            if (l > 0.96) {
                node.classList.add('icx-t-clear');                   // white (or a white haze): the card itself
            } else {
                node.classList.add('icx-t-soft');                    // gray: an inset
                if (l < 0.6) { node.classList.add('icx-t-ink'); }    // dark gray bar with light text on it
            }
        }

        // Text color: only where this element sets its own (not inherited).
        // theme.js may already have lifted it for the dark theme; judge the
        // color the page asked for.
        const parent = node.parentElement;
        if (parent && cs.color !== getComputedStyle(parent).color && !fgTokens.has(cs.color)) {
            const fg = rgba(original(node)) || rgba(cs.color);
            if (fg && isNeutral(fg)) {
                const l = lightness(fg);
                if (l > 0.9) {
                    // White text belongs to whatever colored thing it sits on.
                    const under = backdrop(node);
                    if (!under || isNeutral(under)) { node.classList.add('icx-t-ink'); }
                } else if (l >= 0.4) {
                    node.classList.add('icx-t-muted');
                } else {
                    node.classList.add('icx-t-ink');
                }
            }
        }

        if (parseFloat(cs.borderTopWidth) || parseFloat(cs.borderLeftWidth)) {
            const line = rgba(cs.borderTopColor) || rgba(cs.borderLeftColor);
            if (line && isNeutral(line) && !bgTokens.has(cs.borderTopColor)) { node.classList.add('icx-t-line'); }
        }
    }

    function tameWithin(node) {
        if (node.nodeType !== 1 || !node.isConnected) { return; }
        tame(node);
        node.querySelectorAll('*').forEach(tame);
    }

    readTokens();
    tameWithin(paper);
    paper.classList.remove('icx-t-clear', 'icx-t-soft', 'icx-t-ink', 'icx-t-muted', 'icx-t-line');

    // Update panels (ASP.NET partial postbacks) and the site's scripts replace
    // parts of the page; tame what they add.
    const pending = new Set();
    const flush = frameThrottle(() => {
        pending.forEach(tameWithin);
        pending.clear();
    });
    const observer = new MutationObserver(records => {
        for (const r of records) { r.addedNodes.forEach(n => { if (n.nodeType === 1) { pending.add(n); } }); }
        if (pending.size) { flush(); }
    });
    observer.observe(paper, { childList: true, subtree: true });
    onRetire(() => observer.disconnect());
})();
