// Room emotimemes page (/<room>/roomsettings?what=emotimemes): lays the
// memes out as a grid of tiles instead of one long vertical stack, with a
// filter box.
//
// The site renders each meme as
//   <div style="border:…"><b>:code</b> <br><a href="javascript:copyToClipboard(':code')">copy to clipboard</a> <br><img …></div>
// separated by <br><br>, inside a <center>. The tiles are moved into a grid
// container; clicking an image still toggles its animation (the site's own
// showAnimated), and the copy link still copies.
(function () {
    'use strict';

    const { el } = globalThis.ICX;

    const page = document.getElementById('ctl00_ContentPlaceHolder1_divEmotiMemesPage');
    if (!page) { return; }

    const items = [...page.querySelectorAll('div')].filter(d =>
        d.querySelector(':scope > b') &&
        d.querySelector(':scope > img') &&
        d.querySelector(':scope > a[href*="copyToClipboard"]'));
    if (!items.length) { return; }

    document.documentElement.classList.add('icx-memes-page');

    // An older copy of the extension may already have built a grid (see
    // core.js); its tiles are picked up above, and its emptied shell goes.
    const grid = el('div', { class: 'icx-meme-grid' });
    items[0].before(grid);
    items.forEach(item => {
        item.classList.add('icx-meme-card');
        item.dataset.code = (item.querySelector(':scope > b').textContent || '').trim().toLowerCase();
        const copy = item.querySelector(':scope > a[href*="copyToClipboard"]');
        if (copy) { copy.textContent = 'copy'; copy.title = 'Copy to clipboard'; }
        grid.append(item);
    });
    // The <br><br> spacers the site put between tiles.
    grid.parentElement.querySelectorAll(':scope > br').forEach(br => br.remove());
    document.querySelectorAll('.icx-meme-grid').forEach(g => { if (g !== grid && !g.children.length) { g.remove(); } });
    document.querySelectorAll('.icx-meme-filter').forEach(n => n.remove());

    // GIF previews play on hover. The site shows a still thumbnail
    // ("…_sqr.ext"; the animated file drops the "_sqr") and toggles it on
    // click; with a mouse, hover does it instead. Touch screens have no
    // hover, so a tap still toggles.
    const animatedSrc = src => src.replace('_sqr.', '.');
    items.forEach(item => {
        const img = item.querySelector(':scope > img');
        if (!img || !img.src.includes('_sqr.')) { return; }
        const still = img.src;
        img.removeAttribute('onclick');
        img.onclick = null;
        img.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') { img.src = animatedSrc(still); } });
        img.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') { img.src = still; } });
        img.addEventListener('click', e => {
            if (e.pointerType === 'mouse') { return; }
            img.src = img.src === still ? animatedSrc(still) : still;
        });
    });
    // The page's "(click image to toggle animation)" hint; hover does it now.
    const hint = [...page.querySelectorAll('center')].map(c => c.firstChild)
        .find(n => n && n.nodeType === 3 && /toggle animation/i.test(n.textContent));
    if (hint) { hint.textContent = '(hover an image to play it)'; }

    // Filter by code.
    const count = el('span', { class: 'icx-meme-count' });
    const input = el('input', {
        type: 'search', class: 'icx-meme-filter-input', placeholder: 'Filter memes…',
        'aria-label': 'Filter emotimemes', autocomplete: 'off',
    });
    const filter = el('div', { class: 'icx-meme-filter' }, [input, count]);
    grid.before(filter);

    function apply() {
        const q = input.value.trim().toLowerCase().replace(/^:/, '');
        let shown = 0;
        items.forEach(item => {
            const match = !q || item.dataset.code.replace(/^:/, '').includes(q);
            item.hidden = !match;
            if (match) { shown += 1; }
        });
        count.textContent = q ? `${shown} of ${items.length}` : `${items.length} memes`;
    }
    input.addEventListener('input', apply);
    apply();
})();
