// End-to-end tests against the mock room (test/mock). The extension files are
// injected the way the browser would: stylesheet, then the content scripts in
// manifest order, once the page has loaded.
//
//   npm run test:e2e        (needs Playwright + Chromium)
// Set ICX_SHOTS=<dir> to save screenshots.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const ROOM = 'file://' + path.join(__dirname, 'mock', 'room.html');
const SHOTS = process.env.ICX_SHOTS;

async function openRoom(page, { setup } = {}) {
    await page.goto(ROOM);
    if (setup) { await page.evaluate(setup); }
    for (const css of manifest.content_scripts.flatMap(cs => cs.css || [])) {
        await page.addStyleTag({ path: path.join(ROOT, css) });
    }
    for (const cs of manifest.content_scripts) {
        for (const js of cs.js) { await page.addScriptTag({ path: path.join(ROOT, js) }); }
    }
    // Feeds report their size, then a layout frame runs.
    await page.waitForFunction(() =>
        [...document.querySelectorAll('#cams video[id^="vid-"]')].every(v => v.videoWidth > 0));
    await page.waitForTimeout(300);
}

// Geometry of every placed cam, keyed by username.
function readLayout(page) {
    return page.evaluate(() => {
        const cams = document.getElementById('cams').getBoundingClientRect();
        const out = {};
        document.querySelectorAll('#cams > .rounded_square[data-icx-placed]').forEach(slot => {
            const r = slot.getBoundingClientRect();
            const v = slot.querySelector('video[id^="vid-"]') || { videoWidth: 4, videoHeight: 3 };
            out[slot.querySelector('.name-on-cam').textContent] = {
                x: r.left - cams.left, y: r.top - cams.top, w: r.width, h: r.height,
                ar: v.videoWidth / v.videoHeight,
                focused: slot.classList.contains('icx-focused'),
            };
        });
        out.__box = { w: cams.width, h: cams.height };
        return out;
    });
}

// Wait until two reads 250ms apart agree: joins and reflows animate.
async function settle(page) {
    let prev = JSON.stringify(await readLayout(page));
    for (let i = 0; i < 20; i++) {
        await page.waitForTimeout(250);
        const next = JSON.stringify(await readLayout(page));
        if (next === prev) { return; }
        prev = next;
    }
}

function camsOf(layout) {
    return Object.fromEntries(Object.entries(layout).filter(([k]) => k !== '__box'));
}

function assertTidy(layout) {
    const box = layout.__box;
    const cams = Object.entries(camsOf(layout));
    for (const [name, r] of cams) {
        assert.ok(r.x >= -1 && r.y >= -1 && r.x + r.w <= box.w + 1 && r.y + r.h <= box.h + 1,
            `${name} inside #cams: ${JSON.stringify(r)} in ${JSON.stringify(box)}`);
    }
    for (let i = 0; i < cams.length; i++) {
        for (let j = i + 1; j < cams.length; j++) {
            const [an, a] = cams[i];
            const [bn, b] = cams[j];
            const overlap = a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1;
            assert.ok(!overlap, `${an} and ${bn} overlap`);
        }
    }
}

async function camButton(page, name, act) {
    const slot = page.locator('#cams > .rounded_square', { has: page.locator('.name-on-cam', { hasText: name }) });
    await slot.hover();
    return slot.locator(`.icx-btn[data-act="${act}"]`);
}

let browser;
let page;

test.before(async () => {
    browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
    page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
});
test.after(async () => { await browser?.close(); });

test('lays out every cam inside the panel, at its own aspect ratio, without overlaps', async () => {
    await openRoom(page);
    const layout = await readLayout(page);
    assert.strictEqual(Object.keys(camsOf(layout)).length, 6);
    assertTidy(layout);
    for (const [name, r] of Object.entries(camsOf(layout))) {
        assert.ok(Math.abs(r.w / r.h - r.ar) / r.ar < 0.03, `${name} keeps its aspect (${r.w}x${r.h} vs ${r.ar})`);
    }
    // Cams should use the space: at least half the panel area.
    const used = Object.values(camsOf(layout)).reduce((a, r) => a + r.w * r.h, 0);
    assert.ok(used > 0.5 * layout.__box.w * layout.__box.h, `uses the panel (${Math.round(used)})`);
    if (SHOTS) { await page.screenshot({ path: path.join(SHOTS, '1-grid.png') }); }
});

test('the site rewriting slot styles does not move anything', async () => {
    const before = await readLayout(page);
    await page.evaluate(() => window.sim.siteRelayout());
    await page.waitForTimeout(1200);   // also lets the periodic rewrite run
    assert.deepStrictEqual(await readLayout(page), before);
});

test('site cam chrome is tucked away and its buttons moved to the bar', async () => {
    const vis = await page.evaluate(() => ({
        ohhai: getComputedStyle(document.getElementById('ohhai')).display,
        mute: getComputedStyle(document.getElementById('camGlobalMute')).display,
        refreshInBar: document.getElementById('camRefresh').parentElement.id,
        nativeDisable: getComputedStyle(document.querySelector('#cams .cam-button2')).display,
    }));
    assert.deepStrictEqual(vis, { ohhai: 'none', mute: 'none', refreshInBar: 'icx-bar', nativeDisable: 'none' });
});

test('the extension\'s icons are drawn: real SVG with a size, not empty', async () => {
    await page.hover('#cams .rounded_square[data-icx-placed]');
    const icons = await page.evaluate(() =>
        [...document.querySelectorAll('.icx-tools svg, #icx-chatbar svg, #icx-people svg')].map(svg => ({
            svg: svg instanceof SVGSVGElement,
            size: svg.getBoundingClientRect().width,
            drawn: svg.querySelector('path, rect, circle') !== null,
        })));
    assert.ok(icons.length >= 6, `icons found (${icons.length})`);
    for (const i of icons) {
        assert.ok(i.svg && i.drawn, 'an SVG element with shapes in it');
    }
    assert.ok(icons.some(i => i.size > 0), 'the visible ones have a size');
});
test('chat gets the full stage height; the user list is a drawer under it', async () => {
    const r = await page.evaluate(() => {
        const box = id => document.getElementById(id).getBoundingClientRect();
        return {
            chat: box('chat_container'), bar: box('icx-bar'), toggle: box('icx-drawer-toggle'),
            footer: box('footer'), label: document.getElementById('icx-drawer-toggle').textContent,
            // The site's list stays in the drawer as people.js's source; the
            // people panel is what opens.
            siteList: getComputedStyle(document.getElementById('activeUserList')).display,
            panelVisible: getComputedStyle(document.getElementById('icx-people')).visibility,
            back: getComputedStyle(document.getElementById('back')).display,
            vh: window.innerHeight,
        };
    });
    assert.ok(r.chat.bottom <= r.toggle.top + 1, 'drawer bar directly under the chat');
    assert.ok(Math.abs(r.toggle.bottom - r.bar.bottom) < 2, 'lines up with the cam bar');
    assert.ok(r.toggle.height < 45, `only a bar tall (${r.toggle.height})`);
    assert.ok(r.toggle.bottom <= r.vh + 1, 'in the viewport');
    assert.strictEqual(r.label, '172 people');
    assert.strictEqual(r.siteList, 'none', "the site's own list is the hidden source");
    assert.strictEqual(r.panelVisible, 'hidden', 'closed by default');
    assert.ok(r.footer.top >= r.toggle.bottom, 'footer below the stage');
    assert.strictEqual(r.back, 'none', 'site backdrop hidden');
});

test('the drawer opens over the chat, scrolls, and closes on Esc or a click elsewhere', async () => {
    const panelVisibility = () => page.evaluate(() => getComputedStyle(document.getElementById('icx-people')).visibility);
    await page.click('#icx-drawer-toggle');
    await page.waitForTimeout(250);
    let r = await page.evaluate(() => {
        const panel = document.getElementById('icx-people');
        const list = panel.querySelector('.icx-people-list');
        return { panel: panel.getBoundingClientRect(), toggle: document.getElementById('icx-drawer-toggle').getBoundingClientRect(),
            chat: document.getElementById('chat_container').getBoundingClientRect(),
            visible: getComputedStyle(panel).visibility, scrolls: list.scrollHeight > list.clientHeight };
    });
    assert.strictEqual(r.visible, 'visible');
    assert.ok(r.panel.bottom <= r.toggle.top + 1 && r.panel.top >= r.chat.top, 'rises from the bar over the chat');
    assert.ok(r.scrolls, 'long lists scroll inside the panel');
    if (SHOTS) { await page.screenshot({ path: path.join(SHOTS, '1b-drawer.png') }); }

    // Esc closes it (from the search box, Esc clears it first; focus is on the toggle here).
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    assert.strictEqual(await panelVisibility(), 'hidden');

    await page.click('#icx-drawer-toggle');
    await page.waitForTimeout(250);
    assert.strictEqual(await panelVisibility(), 'visible');
    await page.mouse.click(200, 300);   // on the cams
    await page.waitForTimeout(250);
    assert.strictEqual(await panelVisibility(), 'hidden');
});
test('focus makes one cam the largest, pinned top-left; unfocus restores the grid', async () => {
    await (await camButton(page, 'bravo', 'focus')).click();
    await page.waitForTimeout(400);
    const layout = await readLayout(page);
    assertTidy(layout);
    const cams = camsOf(layout);
    assert.ok(cams.bravo.focused);
    assert.ok(cams.bravo.x < 12 && cams.bravo.y < 12, `top-left: ${cams.bravo.x},${cams.bravo.y}`);
    for (const [name, r] of Object.entries(cams)) {
        if (name !== 'bravo') { assert.ok(r.w * r.h < cams.bravo.w * cams.bravo.h / 1.3, `${name} smaller`); }
    }
    if (SHOTS) { await page.screenshot({ path: path.join(SHOTS, '2-focus.png') }); }

    await page.locator('#cams .rounded_square', { has: page.locator('.name-on-cam', { hasText: 'bravo' }) }).dblclick();
    await page.waitForTimeout(400);
    assert.ok(!camsOf(await readLayout(page)).bravo.focused, 'double-click unfocuses');
});

test('refresh drives the site\'s own disable → start for that cam', async () => {
    const start = await page.evaluate(() => window.sim.effects.length);
    await (await camButton(page, 'alpha_cam', 'refresh')).click();
    await page.waitForTimeout(500);
    assert.deepStrictEqual(await page.evaluate(n => window.sim.effects.slice(n), start),
        ['disable alpha_cam', 'start alpha_cam']);
    // The rebuilt cam gets its controls back.
    await page.waitForTimeout(300);
    assert.ok(await page.evaluate(() =>
        [...document.querySelectorAll('.name-on-cam')].find(s => s.textContent === 'alpha_cam')
            .closest('.rounded_square').querySelector('.icx-tools')));
});

test('hide removes a cam, stops its stream, and lists it; show brings it back', async () => {
    const start = await page.evaluate(() => window.sim.effects.length);
    await (await camButton(page, 'delta', 'hide')).click();
    await page.waitForTimeout(300);
    let layout = await readLayout(page);
    assert.ok(!('delta' in layout), 'delta not placed');
    assert.strictEqual(Object.keys(camsOf(layout)).length, 5);
    assertTidy(layout);
    assert.deepStrictEqual(await page.evaluate(n => window.sim.effects.slice(n), start), ['disable delta']);
    assert.strictEqual(await page.textContent('#icx-hidden-btn'), 'Hidden · 1');

    await page.click('#icx-hidden-btn');
    if (SHOTS) { await page.screenshot({ path: path.join(SHOTS, '3-hidden-menu.png') }); }
    await page.click('#icx-hidden-menu [data-show="delta"]');
    await page.waitForTimeout(300);
    layout = await readLayout(page);
    assert.ok('delta' in layout, 'delta back');
    assert.deepStrictEqual(await page.evaluate(n => window.sim.effects.slice(n), start), ['disable delta', 'start delta']);
    assert.strictEqual(await page.textContent('#icx-hidden-btn'), 'Hidden · 0');
});

test('a hidden user stays hidden — and stopped — when they come back on a new cam', async () => {
    await (await camButton(page, 'echo_echo', 'hide')).click();
    await page.evaluate(() => { window.sim.removeCam('echo_echo'); });
    await page.waitForTimeout(200);
    const start = await page.evaluate(() => window.sim.effects.length);
    await page.evaluate(() => window.sim.addCam('echo_echo', 640, 480));
    await page.waitForTimeout(300);
    assert.ok(!('echo_echo' in await readLayout(page)), 'hidden straight away');
    // Its disable button doesn't work until the stream connects; the stop is
    // retried until it takes.
    await page.waitForFunction(n => window.sim.effects.slice(n).includes('disable echo_echo'), start, { timeout: 8000 });
    await page.click('#icx-hidden-btn');
    await page.click('#icx-hidden-menu [data-show="echo_echo"]');
    await page.waitForTimeout(500);
    assert.ok('echo_echo' in await readLayout(page));
    assert.ok((await page.evaluate(() => window.sim.effects)).at(-1) === 'start echo_echo');
});

test('chat: pauses when scrolled up, resumes at the bottom, in a tall chat log', async () => {
    const state = () => page.evaluate(() => window.du.eo);
    await page.evaluate(() => { const t = document.getElementById('txt'); t.scrollTop = t.scrollHeight; });
    await page.waitForTimeout(100);
    assert.ok(await page.evaluate(() => document.getElementById('txt').clientHeight > 450), 'log is tall');
    assert.strictEqual(await state(), 1, 'at the bottom: still following');
    await page.evaluate(() => { document.getElementById('txt').scrollTop -= 300; });
    await page.waitForTimeout(100);
    assert.strictEqual(await state(), 0, 'scrolled up: paused');
    await page.evaluate(() => { const t = document.getElementById('txt'); t.scrollTop = t.scrollHeight; });
    await page.waitForTimeout(100);
    assert.strictEqual(await state(), 1, 'back at the bottom: resumed');
});

test('chat: the site can\'t pull focus out of another text box', async () => {
    // Typing in the people search while the site calls as() (pausing
    // chat, disabling a cam, after sending): focus stays in the search.
    await page.click('#icx-drawer-toggle');
    await page.waitForTimeout(250);
    await page.focus('#icx-people .icx-people-search');
    await page.evaluate(() => window.as());
    assert.ok(await page.evaluate(() => document.activeElement.matches('#icx-people .icx-people-search')), 'focus stays in the search box');
    await page.evaluate(() => document.activeElement.blur());
    await page.evaluate(() => window.as());
    assert.strictEqual(await page.evaluate(() => document.activeElement.id), 'txtMsg', 'still focuses chat otherwise');
    await page.keyboard.press('Escape');
});

test('cams joining and leaving reflow the grid', async () => {
    await page.evaluate(() => { window.sim.addCam('golf', 640, 480); window.sim.addCam('hotel', 1280, 720); });
    await page.waitForFunction(() => document.querySelectorAll('#cams > [data-icx-placed]').length === 8);
    await page.waitForTimeout(500);
    assertTidy(await readLayout(page));
    await page.evaluate(() => window.sim.removeCam('golf'));
    await page.waitForTimeout(300);
    const layout = await readLayout(page);
    assert.strictEqual(Object.keys(camsOf(layout)).length, 7);
    assertTidy(layout);
});

test('dragging a cam onto another reorders them, and the order is saved', async () => {
    const orderOf = l => Object.entries(camsOf(l)).sort((a, b) => (a[1].y - b[1].y) || (a[1].x - b[1].x)).map(e => e[0]);
    const before = orderOf(await readLayout(page));
    const moving = before[before.length - 1];
    const target = before[0];
    const box = n => page.locator('#cams .rounded_square', { has: page.locator('.name-on-cam', { hasText: n }) }).boundingBox();
    const from = await box(moving);
    const to = await box(target);
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) {
        await page.mouse.move(
            from.x + from.width / 2 + (to.x + to.width / 4 - from.x - from.width / 2) * i / 12,
            from.y + from.height / 2 + (to.y + to.height / 2 - from.y - from.height / 2) * i / 12);
        await page.waitForTimeout(16);
    }
    if (SHOTS) { await page.screenshot({ path: path.join(SHOTS, '4-dragging.png') }); }
    await page.mouse.up();
    await page.waitForTimeout(400);
    const after = orderOf(await readLayout(page));
    assert.strictEqual(after[0], moving, `${moving} moved to the front: ${after}`);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('icx_order')));
    assert.strictEqual(saved[0], moving);
    assertTidy(await readLayout(page));
});

test('the divider resizes cams vs chat and remembers it', async () => {
    const camsW = () => page.evaluate(() => document.getElementById('cams').getBoundingClientRect().width);
    const before = await camsW();
    const d = await page.locator('#icx-divider').boundingBox();
    await page.mouse.move(d.x + d.width / 2, d.y + 200);
    await page.mouse.down();
    await page.mouse.move(d.x - 250, d.y + 200, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    const after = await camsW();
    assert.ok(before - after > 200, `cams narrowed: ${before} → ${after}`);
    assertTidy(await readLayout(page));
    const chatW = await page.evaluate(() => document.getElementById('chat_container').getBoundingClientRect().width);
    assert.ok(chatW > 500, `chat widened: ${chatW}`);
    if (SHOTS) { await page.screenshot({ path: path.join(SHOTS, '5-divider.png') }); }
});

test('a full room (15 cams) still fits, and every cam\'s controls stay inside it', async () => {
    await page.evaluate(() => {
        let i = 0;
        while (document.querySelector('#cams > .rounded_square:empty')) {
            window.sim.addCam(`extra${i}`, 640, 480);
            i += 1;
        }
    });
    await page.waitForFunction(() => [...document.querySelectorAll('#cams video[id^="vid-"]')].every(v => v.videoWidth > 0));
    await settle(page);
    const layout = await readLayout(page);
    assert.strictEqual(Object.keys(camsOf(layout)).length, 15);
    assertTidy(layout);
    const escaped = await page.evaluate(() => [...document.querySelectorAll('#cams > [data-icx-placed]')]
        .filter(slot => {
            const s = slot.getBoundingClientRect();
            return [...slot.querySelectorAll('.icx-btn')].some(b => {
                const r = b.getBoundingClientRect();
                return r.left < s.left || r.right > s.right || r.top < s.top || r.bottom > s.bottom;
            });
        })
        .map(slot => slot.querySelector('.name-on-cam').textContent));
    assert.deepStrictEqual(escaped, []);
    if (SHOTS) { await page.screenshot({ path: path.join(SHOTS, '6-full-room.png') }); }
});

test('focus, hidden cams, order and divider survive a reload', async () => {
    await (await camButton(page, 'charlie99', 'focus')).click();
    await (await camButton(page, 'foxtrot', 'hide')).click();
    const fraction = await page.evaluate(() => localStorage.getItem('icx_camsFraction'));
    const order = await page.evaluate(() => localStorage.getItem('icx_order'));
    await page.reload();
    await openRoom(page);
    const layout = await readLayout(page);
    assert.ok(layout.charlie99.focused, 'focus restored');
    assert.ok(!('foxtrot' in layout), 'hidden restored');
    await page.waitForFunction(() => {
        const n = [...document.querySelectorAll('.name-on-cam')].find(s => s.textContent === 'foxtrot');
        return n && document.getElementById(n.id.replace('name-', 'id-') + '-disabled');
    }, null, { timeout: 8000 });
    assert.strictEqual(await page.evaluate(() => localStorage.getItem('icx_order')), order);
    const style = await page.evaluate(() => document.documentElement.style.getPropertyValue('--icx-cams-fraction'));
    assert.ok(Math.abs(Number(style) - Number(fraction)) < 1e-9, 'divider restored');
    assertTidy(layout);
    if (SHOTS) { await page.screenshot({ path: path.join(SHOTS, '7-reloaded.png') }); }
});

// ── Pages outside rooms ─────────────────────────────────────────────────────

const SETTINGS = 'file://' + path.join(__dirname, 'mock', 'settings.html');

async function openPage(page, url) {
    await page.goto(url);
    for (const css of manifest.content_scripts.flatMap(cs => cs.css || [])) {
        await page.addStyleTag({ path: path.join(ROOT, css) });
    }
    // Colors are read straight after they're re-pointed, and some fade in:
    // read mid-fade, they're a shade off. The tests want where they end up.
    await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; }' });
    for (const js of manifest.content_scripts[0].js) { await page.addScriptTag({ path: path.join(ROOT, js) }); }
    await page.waitForTimeout(100);
}

for (const scheme of ['light', 'dark']) {
    test(`pages: a settings page is two theme cards with its grays re-pointed (${scheme})`, async () => {
        const browser = await chromium.launch();
        const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, colorScheme: scheme });
        await openPage(page, SETTINGS);
        const r = await page.evaluate(() => {
            const css = (sel, prop) => getComputedStyle(document.querySelector(sel))[prop];
            const token = name => {
                const probe = document.createElement('span');
                probe.style.color = `var(${name})`;
                document.querySelector('.icx-paper').append(probe);
                const value = getComputedStyle(probe).color;
                probe.remove();
                return value;
            };
            return {
                kind: document.documentElement.dataset.icxPage,
                theme: document.documentElement.dataset.icxTheme,
                side: document.querySelector('.icx-side.icx-card') !== null,
                main: document.querySelector('.icx-main.icx-card') !== null,
                paperBg: css('.icx-paper', 'backgroundColor'),
                crumb: document.querySelector('h3.icx-crumb .icx-crumb-here')?.textContent,
                crumbBg: css('h3.icx-crumb', 'backgroundColor'),
                box: css('#box', 'backgroundColor'),
                note: css('#note', 'color'),
                dark: css('#dark', 'color'),
                warn: css('#warn', 'color'),
                field: css('#field', 'backgroundColor'),
                save: css('#save', 'backgroundColor'),
                surface2: token('--icx-surface-2'),
                text: token('--icx-text'),
                muted: token('--icx-text-muted'),
                accent: token('--icx-accent'),
            };
        });
        await browser.close();

        assert.strictEqual(r.kind, 'settings');
        assert.strictEqual(r.theme, scheme);
        assert.ok(r.side && r.main, 'sidebar and main are cards');
        assert.strictEqual(r.paperBg, 'rgba(0, 0, 0, 0)', 'the white panel gives way to the cards');
        assert.strictEqual(r.crumb, 'Your Password');
        assert.strictEqual(r.crumbBg, 'rgba(0, 0, 0, 0)', 'no dark title bar');
        assert.strictEqual(r.box, r.surface2, 'gray box → inset');
        assert.strictEqual(r.note, r.muted, 'light gray text → muted');
        assert.strictEqual(r.dark, r.text, 'dark gray text → text');
        assert.notStrictEqual(r.warn, r.text, 'a real color is kept');
        assert.strictEqual(r.field, r.surface2);
        assert.strictEqual(r.save, r.accent, 'primary button in the accent');
    });
}

test('pages: the inbox keeps its two columns when the site fills its sidebar in late', async () => {
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
        await openPage(page, 'file://' + path.join(__dirname, 'mock', 'messages.html'));
        const read = () => page.evaluate(() => {
            const side = document.querySelector('.icx-paper .col-lg-2');
            const main = document.getElementById('ctl00_ContentPlaceHolder1_divMessages');
            return {
                kind: document.documentElement.dataset.icxPage,
                side: side.classList.contains('icx-side') && side.classList.contains('icx-card'),
                main: main.classList.contains('icx-main') && main.classList.contains('icx-card'),
                titled: !!document.querySelector('.icx-titled'),
                edge: getComputedStyle(main).borderTopColor,
                sideBox: side.getBoundingClientRect().toJSON(),
                mainBox: main.getBoundingClientRect().toJSON(),
            };
        });

        const before = await read();
        assert.strictEqual(before.kind, 'messages');
        assert.ok(before.side && before.main && !before.titled, 'two cards, even with a bare sidebar');
        assert.ok(before.mainBox.left >= before.sideBox.right, 'side by side');
        assert.strictEqual(before.edge, 'rgba(0, 0, 0, 0)', 'the card keeps its gradient edge');

        // The site's inbox script fills the sidebar in.
        await page.evaluate(() => {
            document.getElementById('links').innerHTML =
                'Showing<br><b class="rounded">recent</b><p><a href="#">unread</a></p><p><a href="#">all</a></p>';
        });
        await page.waitForTimeout(100);
        const after = await read();
        assert.ok(after.side && after.main && !after.titled);
        assert.ok(after.mainBox.left >= after.sideBox.right);
    } finally {
        await browser.close();
    }
});

test('pages: the logged-in lobby shows every room tile, whatever the site does to #rooms', async () => {
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        await openPage(page, 'file://' + path.join(__dirname, 'mock', 'home.html'));
        const r = await page.evaluate(() => ({
            kind: document.documentElement.dataset.icxPage,
            tiles: [...document.querySelectorAll('#rooms .preview_room')].map(t => {
                const b = t.getBoundingClientRect();
                const cs = getComputedStyle(t);
                return {
                    name: t.querySelector('.preview_name').textContent,
                    x: b.left, y: b.top, w: b.width, h: b.height,
                    shown: cs.visibility === 'visible' && cs.opacity === '1' && cs.display !== 'none',
                };
            }),
            rooms: document.getElementById('rooms').getBoundingClientRect().height,
        }));
        assert.strictEqual(r.kind, 'home');
        assert.strictEqual(r.tiles.length, 7);
        for (const t of r.tiles) {
            assert.ok(t.shown, `${t.name} is visible`);
            assert.ok(t.w >= 150 && t.h >= 90, `${t.name} is tile-sized (${t.w}×${t.h})`);
        }
        // Each tile in its own spot, and the list tall enough to hold them.
        for (let i = 0; i < r.tiles.length; i++) {
            for (let j = i + 1; j < r.tiles.length; j++) {
                const a = r.tiles[i];
                const b = r.tiles[j];
                const overlap = a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1;
                assert.ok(!overlap, `${a.name} and ${b.name} don't overlap`);
            }
        }
        const bottom = Math.max(...r.tiles.map(t => t.y + t.h)) - Math.min(...r.tiles.map(t => t.y));
        assert.ok(r.rooms >= bottom - 1, 'the list holds all its tiles');
    } finally {
        await browser.close();
    }
});

// ── ICHUX Settings in the header ────────────────────────────────────────────

test('header: ICHUX Settings opens from the header and changes the theme, logged in or out', async () => {
    const browser = await chromium.launch();
    try {
        for (const [file, signedIn] of [['settings.html', true], ['messages.html', false]]) {
            const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, colorScheme: 'light' });
            await openPage(page, 'file://' + path.join(__dirname, 'mock', file));
            await page.evaluate(() => localStorage.clear());
            const where = await page.evaluate(() => {
                const link = document.getElementById('icx-menu-link');
                return {
                    text: link?.textContent,
                    label: link?.getAttribute('aria-label'),
                    bar: link && (() => {
                        const before = getComputedStyle(link, '::before');
                        return { color: before.backgroundColor, width: parseFloat(before.width), height: parseFloat(before.height) };
                    })(),
                    accent: (() => {
                        const probe = document.createElement('span');
                        probe.style.color = 'var(--icx-accent)';
                        document.body.append(probe);
                        const c = getComputedStyle(probe).color;
                        probe.remove();
                        return c;
                    })(),
                    lastInRow: link?.parentElement.classList.contains('header_links') && !link.nextElementSibling,
                    inLinks: !!link?.closest('.page_header_userlinks'),
                };
            });
            assert.strictEqual(where.text, 'ichux', file);
            assert.strictEqual(where.label, 'ICHUX Settings');
            assert.strictEqual(where.bar.color, where.accent, 'marked by an accent bar');
            assert.ok(where.bar.height > where.bar.width * 3, 'a vertical bar, not a dot');
            assert.ok(where.inLinks, `${file}: in the header`);
            if (signedIn) { assert.ok(where.lastInRow, 'last in the row of links'); }

            await page.click('#icx-menu-link');
            assert.ok(await page.isVisible('#icx-site-settings'));
            await page.click('#icx-site-settings [data-pref="theme"] [data-value="dark"]');
            const after = await page.evaluate(() => ({
                theme: document.documentElement.dataset.icxTheme,
                saved: localStorage.getItem('icx_theme'),
                checked: document.querySelector('#icx-site-settings [data-value="dark"]').getAttribute('aria-checked'),
            }));
            assert.deepStrictEqual(after, { theme: 'dark', saved: '"dark"', checked: 'true' }, file);

            await page.keyboard.press('Escape');
            assert.ok(!(await page.isVisible('#icx-site-settings')), 'Esc closes it');
            await page.evaluate(() => localStorage.clear());
            await page.close();
        }
    } finally {
        await browser.close();
    }
});

test('header: ICHUX Settings holds appearance only; in a room it stays in step with the chat bar panel', async () => {
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
        await openRoom(page);
        await page.click('#icx-menu-link');
        const prefs = await page.evaluate(() =>
            [...document.querySelectorAll('#icx-site-settings [data-pref], #icx-site-settings .icx-swatches')]
                .map(n => n.dataset.pref || 'accent'));
        assert.deepStrictEqual(prefs, ['theme', 'accent'], 'no chat-only settings in the header panel');
        const note = await page.textContent('#icx-site-settings .icx-panel-note');
        assert.match(note, /chat bar/, 'says where the chat settings are');

        await page.click('#icx-site-settings [data-accent="forest"]');
        await page.click('#icx-site-settings [data-pref="theme"] [data-value="dark"]');
        const r = await page.evaluate(() => ({
            accent: document.documentElement.dataset.icxAccent,
            theme: document.documentElement.dataset.icxTheme,
            barAccent: document.querySelector('#icx-chat-settings [data-accent="forest"]').getAttribute('aria-checked'),
            barTheme: document.querySelector('#icx-chat-settings [data-pref="theme"] [data-value="dark"]').getAttribute('aria-checked'),
        }));
        assert.deepStrictEqual(r, { accent: 'forest', theme: 'dark', barAccent: 'true', barTheme: 'true' });
        await page.evaluate(() => localStorage.clear());
    } finally {
        await browser.close();
    }
});

// ── PMs: docked or floating ─────────────────────────────────────────────────

// The site's PM window, as its jQuery UI tabs widget leaves it: absolutely
// positioned where the old layout wanted it, two conversations, alice open.
// Tab clicks are recorded (the widget's job on the real site).
function addPmWindow() {
    const convo = (name, open) => `
        <div id="pmtab_${name}" class="ui-tabs-panel ui-widget-content" aria-hidden="${!open}">
          <div class="pm_convo"><div><b>${name}:</b> hi there</div></div>
          <div class="pm_outgoing"><input type="text" id="txt_to_${name}"></div>
        </div>`;
    document.getElementById('pm_container').innerHTML = `
      <div id="tabs" class="ui-tabs ui-widget ui-widget-content" style="position:absolute; left:600px; top:80px; width:400px; height:300px;">
        <ul class="ui-tabs-nav ui-helper-reset ui-widget-header" role="tablist">
          <li id="pm_alice" role="tab" aria-selected="true"><a href="#pmtab_alice" class="ui-tabs-anchor">alice</a><span class="ui-icon ui-icon-close">Remove Tab</span></li>
          <li id="pm_bob" role="tab" aria-selected="false"><a href="#pmtab_bob" class="ui-tabs-anchor">bob</a><span class="ui-icon ui-icon-close">Remove Tab</span></li>
        </ul>${convo('alice', true)}${convo('bob', false)}
      </div>`;
    window.__tabClicks = [];
    document.querySelectorAll('#tabs .ui-tabs-anchor').forEach(a => a.addEventListener('click', e => {
        e.preventDefault();
        window.__tabClicks.push(a.textContent);
    }));
}

function pmBox(page) {
    return page.evaluate(() => {
        const t = document.getElementById('tabs').getBoundingClientRect();
        const log = document.getElementById('txt').getBoundingClientRect();
        return {
            x: Math.round(t.left), y: Math.round(t.top), w: Math.round(t.width), h: Math.round(t.height),
            position: getComputedStyle(document.getElementById('tabs')).position,
            log: Math.round(log.height),
            mode: document.documentElement.dataset.icxPm || 'docked',
            clicks: [...window.__tabClicks],
        };
    });
}

test('pms: pop out into a floating window that the site can\'t move, and it\'s remembered', async () => {
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
        await page.goto(ROOM);
        await page.evaluate(() => localStorage.clear());
        await openRoom(page, { setup: addPmWindow });
        const docked = await pmBox(page);
        assert.strictEqual(docked.mode, 'docked');
        assert.notStrictEqual(docked.position, 'fixed');

        await page.click('#icx-pm-mode');
        const floating = await pmBox(page);
        assert.strictEqual(floating.mode, 'floating');
        assert.strictEqual(floating.position, 'fixed');
        assert.ok(floating.log > docked.log + 50, `the chat log takes back the space (${docked.log} → ${floating.log})`);
        assert.ok(floating.w >= 260 && floating.h >= 200, 'a usable size');

        // The site rewrites the window's inline position and size.
        await page.evaluate(() => Object.assign(document.getElementById('tabs').style, { left: '5px', top: '5px', width: '120px', height: '90px' }));
        const after = await pmBox(page);
        assert.deepStrictEqual([after.x, after.y, after.w, after.h], [floating.x, floating.y, floating.w, floating.h], 'the site can\'t move it');

        // Reload: still floating, in the same place.
        await openRoom(page, { setup: addPmWindow });
        const again = await pmBox(page);
        assert.strictEqual(again.mode, 'floating');
        assert.deepStrictEqual([again.x, again.y, again.w, again.h], [floating.x, floating.y, floating.w, floating.h]);
        await page.evaluate(() => localStorage.clear());
    } finally {
        await browser.close();
    }
});

test('pms: drag the strip to move it, the corner to resize it; a tab click is still a click', async () => {
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
        await page.goto(ROOM);
        await page.evaluate(() => localStorage.clear());
        await openRoom(page, { setup: addPmWindow });
        await page.click('#icx-pm-mode');
        const start = await pmBox(page);

        // A plain click on a tab reaches the site.
        await page.click('#pm_bob a');
        assert.deepStrictEqual((await pmBox(page)).clicks, ['bob']);

        // Dragging from that same tab moves the window and isn't a click.
        const tab = await page.locator('#pm_bob a').boundingBox();
        await page.mouse.move(tab.x + 10, tab.y + 8);
        await page.mouse.down();
        await page.mouse.move(tab.x - 60, tab.y + 48, { steps: 6 });
        await page.mouse.move(tab.x - 110, tab.y + 88, { steps: 6 });
        await page.mouse.up();
        const moved = await pmBox(page);
        assert.deepStrictEqual([moved.x - start.x, moved.y - start.y], [-120, 80], 'moved with the pointer');
        assert.deepStrictEqual(moved.clicks, ['bob'], 'the drag was not a tab click');

        // The corner grip resizes it, no smaller than its minimum.
        const grip = await page.locator('#icx-pm-grip').boundingBox();
        await page.mouse.move(grip.x + 8, grip.y + 8);
        await page.mouse.down();
        await page.mouse.move(grip.x + 8 + 60, grip.y + 8 + 40, { steps: 5 });
        await page.mouse.up();
        const bigger = await pmBox(page);
        assert.deepStrictEqual([bigger.w - moved.w, bigger.h - moved.h], [60, 40]);
        await page.mouse.move(grip.x + 68, grip.y + 48);
        await page.mouse.down();
        await page.mouse.move(grip.x - 900, grip.y - 900, { steps: 5 });
        await page.mouse.up();
        const smallest = await pmBox(page);
        assert.deepStrictEqual([smallest.w, smallest.h], [260, 200]);
        await page.evaluate(() => localStorage.clear());
    } finally {
        await browser.close();
    }
});

test('pms: drop it on the top of the chat to dock; the chat bar\'s setting follows; narrow windows dock', async () => {
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
        await page.goto(ROOM);
        await page.evaluate(() => localStorage.clear());
        await openRoom(page, { setup: addPmWindow });
        await page.click('#icx-pm-mode');
        const chosen = () => page.evaluate(() =>
            document.querySelector('#icx-chat-settings [data-pref="pmMode"] [aria-checked="true"]')?.dataset.value);
        assert.strictEqual(await chosen(), 'floating');

        // Drag it by the strip's empty end onto the top of the chat card.
        const strip = await page.locator('#tabs > ul').boundingBox();
        const chat = await page.locator('#chat_container').boundingBox();
        await page.mouse.move(strip.x + strip.width - 60, strip.y + strip.height / 2);
        await page.mouse.down();
        await page.mouse.move(chat.x + chat.width / 2, chat.y + 300, { steps: 8 });
        await page.mouse.move(chat.x + chat.width / 2, chat.y + 30, { steps: 8 });
        assert.ok(await page.evaluate(() => document.getElementById('chat_container').classList.contains('icx-pm-dock-target')), 'shows where it will dock');
        await page.mouse.up();
        const docked = await pmBox(page);
        assert.strictEqual(docked.mode, 'docked');
        assert.notStrictEqual(docked.position, 'fixed');
        assert.strictEqual(await chosen(), 'docked');

        // Floating again, then a narrow window: docked layout, no pop-out button.
        await page.click('#icx-pm-mode');
        await page.setViewportSize({ width: 800, height: 900 });
        await page.waitForTimeout(100);
        const narrow = await page.evaluate(() => ({
            position: getComputedStyle(document.getElementById('tabs')).position,
            button: !document.getElementById('icx-pm-mode').hidden,
        }));
        assert.deepStrictEqual(narrow, { position: 'relative', button: false });
        await page.evaluate(() => localStorage.clear());
    } finally {
        await browser.close();
    }
});
