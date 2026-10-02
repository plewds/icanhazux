// Plays the site's part in the mock room: fills slots with cams carrying canvas
// feeds, rewrites slot geometry inline every second (as the real site does),
// and implements the per-cam start/disable buttons. Exposes window.sim for tests.
(function () {
    'use strict';

    // Real feeds are 4:3; one 16:9 keeps mixed shapes covered.
    const CAMS = [
        ['alpha_cam', 640, 480],
        ['bravo', 1280, 720],
        ['charlie99', 640, 480],
        ['delta', 640, 480],
        ['echo_echo', 640, 480],
        ['foxtrot', 640, 480],
    ];

    const clicks = [];
    const feeds = new Map();   // camId -> { canvas, running }
    let counter = 0;

    function hex() { return (Math.random().toString(16) + '000000000000').slice(2, 14); }

    function makeFeed(camId, name, w, h) {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        const hue = (counter++ * 67) % 360;
        const feed = { canvas, running: true };
        const draw = () => {
            if (!feeds.has(camId)) { return; }
            ctx.fillStyle = feed.running ? `hsl(${hue} 45% 35%)` : '#222';
            ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = '#fff';
            ctx.font = `${Math.round(h / 8)}px sans-serif`;
            ctx.fillText(feed.running ? name : 'disabled', w * 0.08, h * 0.55);
            ctx.font = `${Math.round(h / 14)}px monospace`;
            ctx.fillText(`${w}×${h}`, w * 0.08, h * 0.75);
            setTimeout(draw, 250);
        };
        feeds.set(camId, feed);
        draw();
        return canvas.captureStream(4);
    }

    function addCam(name, w, h, slotNo) {
        const slot = slotNo
            ? document.getElementById('slot' + slotNo)
            : [...document.querySelectorAll('#cams > .rounded_square')].find(s => !s.children.length);
        const camId = hex();
        slot.style.visibility = 'visible';
        slot.innerHTML =
            `<div id="id-${camId}" class="no_touchy videocontainer">` +
            `<span id="name-${camId}" class="name-on-cam">${name}</span>` +
            `<span id="sym-${camId}" class="cam-syms">08bee0</span>` +
            `<button class="cam-button cam-report" id="report-${camId}">!</button>` +
            `<button class="cam-button cam-button1" id="cambtn1-${camId}">fullscreen</button>` +
            `<button class="cam-button cam-button1" id="cambtn1-${camId}-retry">start</button>` +
            `<button class="cam-button cam-button2" id="cambtn2-${camId}">disable</button>` +
            `<video id="vid-${camId}" autoplay playsinline muted style="height: 150px;"></video>` +
            `<span class="cam-logo"><img alt=""></span></div>`;
        slot.querySelector('video').srcObject = makeFeed(camId, name, w, h);
        return camId;
    }

    function removeCam(name) {
        const span = [...document.querySelectorAll('#cams .name-on-cam')].find(s => s.textContent === name);
        if (!span) { return; }
        const slot = span.closest('.rounded_square');
        feeds.delete(span.id.replace('name-', ''));
        slot.innerHTML = '';
        slot.style.visibility = 'hidden';
    }

    // Per-cam buttons, delegated like the site's jQuery handlers.
    document.getElementById('cams').addEventListener('click', e => {
        const btn = e.target.closest('button.cam-button');
        if (!btn) { return; }
        // These buttons sit in the page's <form> with no type, i.e. submit
        // buttons; the site's handlers cancel that, and so must this one.
        e.preventDefault();
        clicks.push(btn.id);
        const m = btn.id.match(/^cambtn(\d)-([0-9a-f]+)(-retry)?$/);
        if (!m) { return; }
        const feed = feeds.get(m[2]);
        if (!feed) { return; }
        if (m[1] === '2') { feed.running = false; }
        if (m[3]) { feed.running = true; }
    });

    // The site's own tile layout, reapplied periodically with plain inline
    // styles. The stage must win against this.
    function siteRelayout() {
        document.querySelectorAll('#cams > .rounded_square').forEach((slot, i) => {
            slot.style.top = `${Math.floor(i / 2) * 153}px`;
            slot.style.left = `${25 + (i % 2) * 204}px`;
            slot.style.width = '201px';
            slot.style.height = '150px';
        });
    }
    setInterval(siteRelayout, 1000);

    const txt = document.getElementById('txt');
    for (let i = 0; i < 60; i++) {
        const p = document.createElement('p');
        p.className = 'line';
        p.textContent = `user${i % 7}: chat line ${i}`;
        txt.append(p);
    }

    CAMS.forEach(([name, w, h], i) => addCam(name, w, h, i + 1));
    siteRelayout();

    window.sim = { addCam, removeCam, clicks, siteRelayout };
})();
