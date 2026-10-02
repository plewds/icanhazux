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

async function openRoom(page) {
    await page.goto(ROOM);
    for (const css of manifest.content_scripts[0].css) {
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

test('chat gets the full stage height; the user list is a drawer under it', async () => {
    const r = await page.evaluate(() => {
        const box = id => document.getElementById(id).getBoundingClientRect();
        return {
            chat: box('chat_container'), bar: box('icx-bar'), toggle: box('icx-drawer-toggle'),
            footer: box('footer'), label: document.getElementById('icx-drawer-toggle').textContent,
            listVisible: getComputedStyle(document.getElementById('activeUserList')).visibility,
            back: getComputedStyle(document.getElementById('back')).display,
            vh: window.innerHeight,
        };
    });
    assert.ok(r.chat.bottom <= r.toggle.top + 1, 'drawer bar directly under the chat');
    assert.ok(Math.abs(r.toggle.bottom - r.bar.bottom) < 2, 'lines up with the cam bar');
    assert.ok(r.toggle.height < 45, `only a bar tall (${r.toggle.height})`);
    assert.ok(r.toggle.bottom <= r.vh + 1, 'in the viewport');
    assert.strictEqual(r.label, '172 people');
    assert.strictEqual(r.listVisible, 'hidden', 'closed by default');
    assert.ok(r.footer.top >= r.toggle.bottom, 'footer below the stage');
    assert.strictEqual(r.back, 'none', 'site backdrop hidden');
});

test('the drawer opens over the chat, scrolls, and closes on Esc or a click elsewhere', async () => {
    await page.click('#icx-drawer-toggle');
    await page.waitForTimeout(250);
    let r = await page.evaluate(() => {
        const list = document.getElementById('activeUserList');
        const l = list.getBoundingClientRect();
        return { list: l, toggle: document.getElementById('icx-drawer-toggle').getBoundingClientRect(),
            chat: document.getElementById('chat_container').getBoundingClientRect(),
            visible: getComputedStyle(list).visibility, scrolls: list.scrollHeight > list.clientHeight };
    });
    assert.strictEqual(r.visible, 'visible');
    assert.ok(r.list.bottom <= r.toggle.top + 1 && r.list.top >= r.chat.top, 'rises from the bar over the chat');
    assert.ok(r.scrolls, 'long lists scroll inside the panel');
    if (SHOTS) { await page.screenshot({ path: path.join(SHOTS, '1b-drawer.png') }); }

    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    assert.strictEqual(await page.evaluate(() => getComputedStyle(document.getElementById('activeUserList')).visibility), 'hidden');

    await page.click('#icx-drawer-toggle');
    await page.mouse.click(200, 300);   // on the cams
    await page.waitForTimeout(250);
    assert.strictEqual(await page.evaluate(() => getComputedStyle(document.getElementById('activeUserList')).visibility), 'hidden');
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
    await page.click('#icx-drawer-toggle');
    await page.waitForTimeout(250);
    await page.focus('#other-input');
    await page.evaluate(() => window.as());
    assert.strictEqual(await page.evaluate(() => document.activeElement.id), 'other-input');
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
