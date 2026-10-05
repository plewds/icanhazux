// Store screenshots (1280×800) and the small promo tile (440×280), in
// store/screenshots/.
//
//   node scripts/screenshots.js        (needs Playwright + Chromium)
//
// Shot from the test stand-ins (test/mock), copied to a temporary folder and
// dressed for a store page: soft lit "rooms" with a blurred, featureless
// figure for cams, made-up usernames and ordinary chat. Nothing here is a
// real person or a real conversation. The extension is loaded the way the
// tests load it.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'store', 'screenshots');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const W = 1280;
const H = 800;

// ── The dressed-up stand-ins ────────────────────────────────────────────────

const CAM_NAMES = ['mika', 'northwind', 'lou_lou', 'bramble', 'teacup_tom', 'saltydog'];
const PEOPLE = [
    'mika', 'northwind', 'lou_lou', 'bramble', 'teacup_tom', 'saltydog', 'juniper', 'oatmilk', 'pixelpanda',
    'quietstorm', 'rosewater', 'sundaydrive', 'tangerine_t', 'velvetfox', 'wren', 'yellowbird', 'zigzag',
    'ambergris', 'birchbark', 'cloudberry', 'dandelion', 'ember', 'fernwood', 'glowworm', 'hazelnut',
    'inkwell', 'jellybean', 'kettlecorn', 'lanternfish', 'marigold', 'nightjar', 'olive_oyl', 'pepperjack',
];
const CHAT = [
    ['mika', '#c0392b', 'evening all 👋'],
    ['northwind', '#2471a3', 'hey mika, how was the trip?'],
    ['mika', '#c0392b', 'long. good though. the coast was gorgeous'],
    ['lou_lou', '#8e44ad', 'pics or it didn\'t happen'],
    ['mika', '#c0392b', 'posting some in a sec'],
    ['bramble', '#117a65', 'anyone watching the game tonight?'],
    ['teacup_tom', '#b9770e', 'only if snacks are involved'],
    ['saltydog', '#1f618d', 'snacks are always involved'],
    ['juniper', '#6c3483', 'is the music room open later? want to share a playlist'],
    ['northwind', '#2471a3', 'should be, it was busy last night'],
    ['oatmilk', '#a04000', 'first time here, hi!'],
    ['lou_lou', '#8e44ad', 'welcome oatmilk! grab a seat'],
    ['bramble', '#117a65', 'welcome 🙂'],
    ['oatmilk', '#a04000', 'thanks, this place is cozy'],
    ['teacup_tom', '#b9770e', 'brb, kettle\'s on'],
    ['saltydog', '#1f618d', 'tom and his tea, name checks out'],
    ['pixelpanda', '#1e8449', 'lol'],
    ['mika', '#c0392b', 'ok photos are up in the group'],
    ['juniper', '#6c3483', 'that sunset one is unreal'],
    ['northwind', '#2471a3', 'agreed, framing it'],
];

// Cam feeds: a soft gradient room, a warm lamp glow, and a blurred figure.
const FEED_SOURCE = `
    function makeFeed(camId, name, w, h) {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        const palettes = [
            ['#3a2f4f', '#7a5a8c', '#f2c38b'], ['#1f3b4d', '#4f7a8c', '#f5d6a1'], ['#40302a', '#8c6a55', '#ffd59e'],
            ['#233a2c', '#5c8c6a', '#f7e3a3'], ['#2e2a40', '#5a6a9c', '#f0b9a0'], ['#3d2b2b', '#9c6a5a', '#ffe0b0'],
        ];
        const [dark, mid, lamp] = palettes[counter++ % palettes.length];
        const feed = { canvas, running: true };
        const draw = () => {
            if (!feeds.has(camId)) { return; }
            if (!feed.running) {
                ctx.fillStyle = '#222';
                ctx.fillRect(0, 0, w, h);
            } else {
                const bg = ctx.createLinearGradient(0, 0, w, h);
                bg.addColorStop(0, mid);
                bg.addColorStop(1, dark);
                ctx.fillStyle = bg;
                ctx.fillRect(0, 0, w, h);
                const glow = ctx.createRadialGradient(w * .8, h * .25, 0, w * .8, h * .25, w * .45);
                glow.addColorStop(0, lamp + 'cc');
                glow.addColorStop(1, lamp + '00');
                ctx.fillStyle = glow;
                ctx.fillRect(0, 0, w, h);
                ctx.filter = 'blur(' + Math.round(h / 40) + 'px)';
                ctx.fillStyle = dark;
                ctx.beginPath();
                ctx.ellipse(w * .45, h * .45, h * .13, h * .16, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.ellipse(w * .45, h * 1.02, h * .42, h * .38, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.filter = 'none';
            }
            setTimeout(draw, 500);
        };
        feeds.set(camId, feed);
        draw();
        return canvas.captureStream(4);
    }

`;

function dressMocks() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'icx-shots-'));
    for (const f of fs.readdirSync(path.join(ROOT, 'test', 'mock'))) {
        fs.copyFileSync(path.join(ROOT, 'test', 'mock', f), path.join(dir, f));
    }

    let sim = fs.readFileSync(path.join(dir, 'site-sim.js'), 'utf8');
    const a = sim.indexOf('    function makeFeed');
    const b = sim.indexOf('    // Mirrors the site');
    if (a < 0 || b < 0) { throw new Error('site-sim.js changed shape: update scripts/screenshots.js'); }
    sim = sim.slice(0, a) + FEED_SOURCE + sim.slice(b);
    ['alpha_cam', 'bravo', 'charlie99', 'delta', 'echo_echo', 'foxtrot'].forEach((old, i) => {
        sim = sim.replace(`'${old}'`, `'${CAM_NAMES[i]}'`);
    });
    const lines = JSON.stringify(CHAT);
    sim = sim.replace(/for \(let i = 0; i < 60; i\+\+\) \{[\s\S]*?txt\.append\(p\);\s*\}/,
        `${lines}.forEach(([name, color, text]) => {
            const p = document.createElement('p');
            p.className = 'line';
            const span = document.createElement('span');
            span.style.color = color;
            const b = document.createElement('b');
            b.textContent = name + ': ';
            span.append(b, text);
            p.append(span);
            txt.append(p);
        });`);
    fs.writeFileSync(path.join(dir, 'site-sim.js'), sim);

    let room = fs.readFileSync(path.join(dir, 'room.html'), 'utf8');
    // The people list: everyone in PEOPLE, a few idle (<strike>), two mods
    // (listed again in a closing "N mods:" paragraph, as the site does).
    const IDLE = new Set(['olive_oyl', 'kettlecorn', 'inkwell', 'nightjar']);
    const link = name => `<a class="userlink" href="javascript:void 0">${IDLE.has(name) ? `<strike>${name}</strike>` : name}</a>`;
    room = room.replace(/(<div id="activeUserList"[^>]*>)[\s\S]*?(<\/div>)/, (_, open, close) =>
        `${open}${PEOPLE.length} people (<a href="javascript:void 0">refresh</a>) [click for details]: ` +
        `<input id="other-input" placeholder="some other text box"> ${PEOPLE.map(link).join(' ')}` +
        `<p>2 mods: ${link('northwind')} ${link('mika')}</p>${close}`);
    room = room.replace('mock topic', 'The Lounge · be kind, have fun');
    room = room.replace('>command bar</div>', '></div>');   // the stand-in's placeholder text
    room = room.replace(/<img id="ichc-logo"[^>]*>/, '');
    fs.writeFileSync(path.join(dir, 'room.html'), room);

    let home = fs.readFileSync(path.join(dir, 'home.html'), 'utf8');
    const ROOMS = { alpha: 'the_lounge', bravo: 'night_owls', charlie: 'studyhall', delta: 'music_room', echo: 'dashcams', foxtrot: 'movie_night', golf: 'yoga' };
    for (const [from, to] of Object.entries(ROOMS)) { home = home.replaceAll(from, to); }
    // No 18+ tags in a store listing, and no logo: the stand-in's is an empty
    // image, and the site's isn't ours to show.
    home = home.replaceAll('<p><span>18+</span></p>', '');
    home = home.replace(/<img id="ichc-logo"[^>]*>/, '');
    fs.writeFileSync(path.join(dir, 'home.html'), home);
    return dir;
}

// ── Shooting ─────────────────────────────────────────────────────────────────

async function open(browser, url, { theme = 'dark', room = false, setup } = {}) {
    const page = await browser.newPage({ viewport: { width: W, height: H }, colorScheme: theme, deviceScaleFactor: 1 });
    await page.addInitScript(root => {
        globalThis.chrome = { runtime: { getURL: p => `file://${root}/${p}` } };
        try { localStorage.clear(); } catch (_) {}
    }, ROOT);
    await page.goto(url);
    if (setup) { await page.evaluate(setup); }
    for (const css of manifest.content_scripts[0].css) { await page.addStyleTag({ path: path.join(ROOT, css) }); }
    for (const cs of manifest.content_scripts) {
        for (const js of cs.js) { await page.addScriptTag({ path: path.join(ROOT, js) }); }
    }
    if (room) {
        await page.waitForFunction(() =>
            [...document.querySelectorAll('#cams video[id^="vid-"]')].every(v => v.videoWidth > 0));
        // The chat bar shows once the site reports its chat state (page.js),
        // which the stand-in doesn't: report a plausible one. Then scroll
        // the chat to its newest lines.
        await page.evaluate(() => {
            document.dispatchEvent(new CustomEvent('icx:chat-state', { detail: JSON.stringify({
                following: true, held: 0, closedPms: [], pmsVisible: null, isMod: false,
                name: 'someone', color: '#2471a3', fontSize: 15, lineStyle: 3, pm: 0, notices: 1, sound: true, emoticons: true,
            }) }));
            const log = document.getElementById('txt');
            log.scrollTop = log.scrollHeight;
        });
    }
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(900);
    return page;
}

// A PM window, as the site's jQuery UI tabs widget builds it.
function addPms() {
    const convo = (name, open, lines) => `
        <div id="pmtab_${name}" class="ui-tabs-panel ui-widget-content" aria-hidden="${!open}">
          <div class="pm_convo">${lines.map(([who, t]) => `<div><b>${who}:</b> ${t}</div>`).join('')}</div>
          <div class="pm_outgoing"><input type="text" id="txt_to_${name}"></div>
        </div>`;
    document.getElementById('pm_container').innerHTML = `
      <div id="tabs" class="ui-tabs ui-widget ui-widget-content">
        <ul class="ui-tabs-nav ui-helper-reset ui-widget-header" role="tablist">
          <li id="pm_juniper" role="tab" aria-selected="true"><a href="#pmtab_juniper" class="ui-tabs-anchor">juniper</a><span class="ui-icon ui-icon-close">Remove Tab</span></li>
          <li id="pm_bramble" role="tab" aria-selected="false" style="color:red"><a href="#pmtab_bramble" class="ui-tabs-anchor">bramble</a><span class="ui-icon ui-icon-close">Remove Tab</span></li>
        </ul>${convo('juniper', true, [['juniper', 'sending you that playlist now'], ['you', 'amazing, thank you!'], ['juniper', 'track 4 is the best one']])}${convo('bramble', false, [['bramble', 'game starts at 8']])}
      </div>`;
}

async function main() {
    fs.mkdirSync(OUT, { recursive: true });
    const mocks = dressMocks();
    const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
    const shot = async (page, name) => {
        await page.mouse.move(W - 2, H - 2);   // no stray hover
        await page.waitForTimeout(200);
        await page.screenshot({ path: path.join(OUT, name) });
        console.log(`store/screenshots/${name}`);
        await page.close();
    };
    const room = `file://${mocks}/room.html`;

    // 1. The room: cams filling the stage, chat beside them.
    await shot(await open(browser, room, { theme: 'dark', room: true }), '1-room.png');

    // 2. A focused cam, light theme.
    let page = await open(browser, room, { theme: 'light', room: true });
    await page.dblclick('#cams .rounded_square[data-icx-placed] >> nth=1');
    await page.waitForTimeout(600);
    await shot(page, '2-focus.png');

    // 3. People drawer open, with PMs floating over the cams.
    page = await open(browser, room, { theme: 'dark', room: true, setup: addPms });
    await page.click('#icx-pm-mode');
    await page.evaluate(() => {
        const r = document.getElementById('cams').getBoundingClientRect();
        document.documentElement.style.setProperty('--icx-pmf-x', `${Math.round(r.right - 420 - 24)}px`);
        document.documentElement.style.setProperty('--icx-pmf-y', `${Math.round(r.top + 60)}px`);
        document.documentElement.style.setProperty('--icx-pmf-h', '320px');
    });
    await page.click('#icx-drawer-toggle');
    await page.waitForTimeout(400);
    await shot(page, '3-people-and-pms.png');

    // 4. Chat settings, from the chat bar.
    page = await open(browser, room, { theme: 'dark', room: true });
    await page.evaluate(() => { document.getElementById('icx-chat-settings').hidden = false; });
    await page.evaluate(() => document.getElementById('icx-chat-settings').querySelector('[data-accent="aqua"]')?.click());
    await shot(page, '4-chat-settings.png');

    // 5. The lobby, light theme, with theme and accent from the header.
    page = await open(browser, `file://${mocks}/home.html`, {
        theme: 'light',
        setup: () => {
            const scenes = [['#7a5a8c', '#3a2f4f'], ['#4f7a8c', '#1f3b4d'], ['#8c6a55', '#40302a'], ['#5c8c6a', '#233a2c'],
                ['#5a6a9c', '#2e2a40'], ['#9c6a5a', '#3d2b2b'], ['#6a8c8c', '#253d3d']];
            document.querySelectorAll('.preview_room').forEach((tile, i) => {
                const [a, b] = scenes[i % scenes.length];
                tile.style.backgroundImage = `radial-gradient(circle at 78% 28%, #ffe2b0aa, transparent 45%), linear-gradient(135deg, ${a}, ${b})`;
            });
        },
    });
    await page.click('#icx-menu-link');
    await page.waitForTimeout(300);
    await shot(page, '5-lobby-and-settings.png');

    // Small promo tile (440×280): the icon and the name.
    page = await browser.newPage({ viewport: { width: 440, height: 280 }, deviceScaleFactor: 1 });
    const iconSvg = fs.readFileSync(path.join(ROOT, 'icons', 'icon.svg'), 'utf8').replace(/width="128" height="128"/, 'width="112" height="112"');
    const font = f => `file://${ROOT}/fonts/${f}`;
    const tile = path.join(mocks, 'promo.html');   // a file, so it can load the bundled font
    fs.writeFileSync(tile, `<!doctype html><html><head><style>
        @font-face { font-family: Nunito; font-weight: 400 900; src: url("${font('Nunito-Variable.woff2')}") format("woff2"); }
        body { margin: 0; width: 440px; height: 280px; display: grid; place-items: center;
            background: radial-gradient(circle at 80% 15%, #3a2f52, transparent 60%), #1d1720; font-family: Nunito, sans-serif; color: #efe8ec; }
        .row { display: flex; align-items: center; gap: 22px; }
        h1 { margin: 0; font-size: 46px; font-weight: 800; letter-spacing: -.02em; }
        p { margin: 6px 0 0; font-size: 16px; color: #c9bfd1; line-height: 1.35; }
        .bar { display: inline-block; width: 5px; height: 1em; margin-right: 10px; border-radius: 3px; background: #a78bfa; vertical-align: -.12em; }
    </style></head><body><div class="row">${iconSvg}<div><h1><span class="bar"></span>icanhazux</h1>
        <p>A better icanhazchat:<br>cam grid, cleaner chat, light &amp; dark</p></div></div></body></html>`);
    await page.goto(`file://${tile}`);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(OUT, 'promo-440x280.png') });
    console.log('store/screenshots/promo-440x280.png');

    await browser.close();
    fs.rmSync(mocks, { recursive: true, force: true });
}

main().catch(e => { console.error(e); process.exit(1); });
