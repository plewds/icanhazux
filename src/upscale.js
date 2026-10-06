// Sharper big cams: the focused cam, and a cam in full screen, drawn through
// an upscaler on the graphics card instead of the browser's own scaling.
//
// Cams arrive small (about 320×240), so a big cam is a 3–6× blow-up, and the
// browser's bilinear scaling makes it soft. Here each frame goes through two
// passes in WebGL 2:
//   1. Catmull-Rom (bicubic) scaling to the size it's shown at: keeps edges
//      that bilinear smears.
//   2. Contrast-adaptive sharpening, after AMD FidelityFX FSR's RCAS: sharpens
//      edges and detail, held back where it would overshoot or where the
//      picture is flat noise (compression blocks).
// It's drawn on a <canvas> laid over the cam's <video> inside its
// .videocontainer, letterboxed like the video (object-fit: contain). The
// video keeps playing underneath. The site's name and anti-capture
// watermark (.cam-syms, z-index 99) stay above it.
//
// Off by default (Settings → Sharper big cams), and only where it can run
// properly: a WebGL 2 context is asked for with failIfMajorPerformanceCaveat,
// which the browser refuses when it would be drawing on the CPU (hardware
// acceleration off, a blocklisted driver). If the graphics card drops the
// context mid-session, it's switched off for the rest of the visit and the
// plain video shows, as it always did.
(function () {
    'use strict';

    const { store, el, signal, onRetire, frameThrottle } = globalThis.ICX;

    const cams = document.getElementById('cams');
    if (!cams) { return; }

    const MAX_PIXELS = 3840 * 2160;     // canvas size cap (a 4K screen)
    const SHARPNESS = 0.4;              // RCAS, in stops: 0 is strongest

    // One triangle that covers the picture, from a buffer in attribute 0.
    // (Making its corners up from gl_VertexID, with no attribute, makes
    // Firefox on a Mac emulate attribute 0, and say so in the console.)
    const VERT = `#version 300 es
        layout(location = 0) in vec2 p;
        out vec2 uv;
        void main() {
            uv = p * 0.5 + 0.5;
            gl_Position = vec4(p, 0.0, 1.0);
        }`;

    // Pass 1: Catmull-Rom from the video frame, in 9 bilinear taps.
    const SCALE = `#version 300 es
        precision highp float;
        uniform sampler2D src;
        uniform vec2 srcSize;
        in vec2 uv;
        out vec4 color;
        void main() {
            vec2 pos = vec2(uv.x, 1.0 - uv.y) * srcSize;
            vec2 t1 = floor(pos - 0.5) + 0.5;
            vec2 f = pos - t1;
            vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
            vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
            vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f));
            vec2 w3 = f * f * (-0.5 + 0.5 * f);
            vec2 w12 = w1 + w2;
            vec2 t0 = (t1 - 1.0) / srcSize;
            vec2 t3 = (t1 + 2.0) / srcSize;
            vec2 t12 = (t1 + w2 / w12) / srcSize;
            vec3 c =
                texture(src, vec2(t0.x, t0.y)).rgb * w0.x * w0.y +
                texture(src, vec2(t12.x, t0.y)).rgb * w12.x * w0.y +
                texture(src, vec2(t3.x, t0.y)).rgb * w3.x * w0.y +
                texture(src, vec2(t0.x, t12.y)).rgb * w0.x * w12.y +
                texture(src, vec2(t12.x, t12.y)).rgb * w12.x * w12.y +
                texture(src, vec2(t3.x, t12.y)).rgb * w3.x * w12.y +
                texture(src, vec2(t0.x, t3.y)).rgb * w0.x * w3.y +
                texture(src, vec2(t12.x, t3.y)).rgb * w12.x * w3.y +
                texture(src, vec2(t3.x, t3.y)).rgb * w3.x * w3.y;
            color = vec4(clamp(c, 0.0, 1.0), 1.0);
        }`;

    // Pass 2: RCAS on the scaled picture, pixel for pixel.
    const SHARPEN = `#version 300 es
        precision highp float;
        uniform sampler2D src;
        uniform float con;
        uniform ivec2 origin;     // where the picture starts on the canvas (letterboxing)
        out vec4 color;
        float luma(vec3 c) { return c.g + 0.5 * (c.r + c.b); }
        void main() {
            ivec2 p = ivec2(gl_FragCoord.xy) - origin;
            ivec2 hi = textureSize(src, 0) - 1;
            vec3 b = texelFetch(src, clamp(p + ivec2(0, -1), ivec2(0), hi), 0).rgb;
            vec3 d = texelFetch(src, clamp(p + ivec2(-1, 0), ivec2(0), hi), 0).rgb;
            vec3 e = texelFetch(src, p, 0).rgb;
            vec3 f = texelFetch(src, clamp(p + ivec2(1, 0), ivec2(0), hi), 0).rgb;
            vec3 h = texelFetch(src, clamp(p + ivec2(0, 1), ivec2(0), hi), 0).rgb;
            vec3 mn4 = min(min(b, d), min(f, h));
            vec3 mx4 = max(max(b, d), max(f, h));
            vec3 hitMin = min(mn4, e) / max(4.0 * mx4, vec3(1e-4));
            vec3 hitMax = (1.0 - max(mx4, e)) / min(4.0 * min(mn4, e) - 4.0, vec3(-1e-4));
            vec3 lobeRGB = max(-hitMin, hitMax);
            float lobe = max(-0.1875, min(max(lobeRGB.r, max(lobeRGB.g, lobeRGB.b)), 0.0)) * con;
            // Less sharpening on noise: a pixel unlike all four neighbours.
            float bL = luma(b), dL = luma(d), eL = luma(e), fL = luma(f), hL = luma(h);
            float range = max(max(max(bL, dL), max(fL, hL)), eL) - min(min(min(bL, dL), min(fL, hL)), eL);
            float nz = abs(0.25 * (bL + dL + fL + hL) - eL) / max(range, 1e-4);
            lobe *= 1.0 - 0.5 * clamp(nz, 0.0, 1.0);
            color = vec4(clamp((lobe * (b + d + f + h) + e) / (4.0 * lobe + 1.0), 0.0, 1.0), 1.0);
        }`;

    // ── Can it run here? ──────────────────────────────────────────────────

    const CONTEXT = { alpha: true, antialias: false, depth: false, stencil: false,
        premultipliedAlpha: true, preserveDrawingBuffer: false, failIfMajorPerformanceCaveat: true };
    let available = null;
    function supported() {
        // The test context is just dropped for the browser to clean up:
        // releasing it outright (loseContext) logs "WebGL context was lost"
        // in Firefox's console on every room, upscaling on or off.
        if (available === null) {
            available = !!document.createElement('canvas').getContext('webgl2', CONTEXT);
        }
        return available;
    }
    let lostThisVisit = false;

    // ── One cam's upscaler ──────────────────────────────────────────────────

    function compile(gl, vert, frag) {
        const program = gl.createProgram();
        for (const [type, source] of [[gl.VERTEX_SHADER, vert], [gl.FRAGMENT_SHADER, frag]]) {
            const shader = gl.createShader(type);
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            gl.attachShader(program, shader);
        }
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { throw new Error(gl.getProgramInfoLog(program) || 'link failed'); }
        return program;
    }
    function texture(gl, filter) {
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return tex;
    }

    function upscaler(video) {
        const canvas = el('canvas', { class: 'icx-upscale', 'aria-hidden': 'true' });
        const gl = canvas.getContext('webgl2', CONTEXT);
        if (!gl) { return null; }
        let scale, sharpen, frame, scaled, fbo;
        try {
            scale = compile(gl, VERT, SCALE);
            sharpen = compile(gl, VERT, SHARPEN);
        } catch (_) {
            return null;
        }
        frame = texture(gl, gl.LINEAR);
        scaled = texture(gl, gl.NEAREST);
        fbo = gl.createFramebuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        let scaledSize = '';
        let stopped = false;

        function draw() {
            if (stopped || gl.isContextLost()) { return; }
            const vw = video.videoWidth, vh = video.videoHeight;
            if (!vw || !vh || video.readyState < 2) { return; }
            // The canvas at the screen's pixel size, within the cap.
            const dpr = Math.min(window.devicePixelRatio || 1, Math.sqrt(MAX_PIXELS / Math.max(1, canvas.clientWidth * canvas.clientHeight)));
            const cw = Math.max(1, Math.round(canvas.clientWidth * dpr));
            const ch = Math.max(1, Math.round(canvas.clientHeight * dpr));
            if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
            // Letterboxed like the video.
            const k = Math.min(cw / vw, ch / vh);
            const w = Math.max(1, Math.round(vw * k)), h = Math.max(1, Math.round(vh * k));
            const x = Math.round((cw - w) / 2), y = Math.round((ch - h) / 2);

            gl.bindTexture(gl.TEXTURE_2D, frame);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);

            if (scaledSize !== `${w}x${h}`) {
                scaledSize = `${w}x${h}`;
                gl.bindTexture(gl.TEXTURE_2D, scaled);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
                gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
                gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, scaled, 0);
            }

            gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
            gl.viewport(0, 0, w, h);
            gl.useProgram(scale);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, frame);
            gl.uniform1i(gl.getUniformLocation(scale, 'src'), 0);
            gl.uniform2f(gl.getUniformLocation(scale, 'srcSize'), vw, vh);
            gl.drawArrays(gl.TRIANGLES, 0, 3);

            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.viewport(0, 0, cw, ch);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.viewport(x, ch - y - h, w, h);
            gl.useProgram(sharpen);
            gl.bindTexture(gl.TEXTURE_2D, scaled);
            gl.uniform1i(gl.getUniformLocation(sharpen, 'src'), 0);
            gl.uniform1f(gl.getUniformLocation(sharpen, 'con'), Math.pow(2, -SHARPNESS));
            gl.uniform2i(gl.getUniformLocation(sharpen, 'origin'), x, ch - y - h);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
        }

        // A new frame from the video, where the browser can say (most); else
        // a steady 30 a second, which is more than any cam sends.
        let timer = 0;
        function next() {
            if (stopped) { return; }
            if (typeof video.requestVideoFrameCallback === 'function') {
                video.requestVideoFrameCallback(() => { draw(); next(); });
            } else {
                timer = setTimeout(() => requestAnimationFrame(() => { draw(); next(); }), 1000 / 30);
            }
        }
        const resized = new ResizeObserver(() => draw());
        resized.observe(canvas);

        // Lost by the graphics card (not by stop(), which lets it go itself).
        canvas.addEventListener('webglcontextlost', e => {
            if (stopped) { return; }
            e.preventDefault();
            lostThisVisit = true;
            sync();
        });

        video.after(canvas);
        next();
        draw();

        return {
            video,
            canvas,
            stop() {
                stopped = true;
                clearTimeout(timer);
                resized.disconnect();
                canvas.remove();
                gl.getExtension('WEBGL_lose_context')?.loseContext();
            },
        };
    }

    // ── Which cams ──────────────────────────────────────────────────────────

    let enabled = store.get('upscale', false) === true;
    const running = new Map();   // slot → upscaler

    function wanted() {
        if (!enabled || lostThisVisit || !supported()) { return new Map(); }
        const out = new Map();
        cams.querySelectorAll(':scope > .rounded_square[data-icx-placed]').forEach(slot => {
            if (!slot.classList.contains('icx-focused') && document.fullscreenElement !== slot) { return; }
            const video = slot.querySelector('.videocontainer > video[id^="vid-"]');
            if (video) { out.set(slot, video); }
        });
        return out;
    }

    function sync() {
        const want = wanted();
        for (const [slot, up] of running) {
            if (want.get(slot) !== up.video || !up.canvas.isConnected) {
                up.stop();
                running.delete(slot);
            }
        }
        for (const [slot, video] of want) {
            if (running.has(slot)) { continue; }
            const up = upscaler(video);
            if (up) { running.set(slot, up); }
        }
    }
    const later = frameThrottle(sync);

    // Focus moving, full screen, a cam rebuilt (a new <video>). Our own
    // canvases going in and out don't count.
    const ours = r => r.type === 'childList' &&
        [...r.addedNodes, ...r.removedNodes].every(n => n.classList?.contains('icx-upscale'));
    const observer = new MutationObserver(records => {
        if (!records.every(ours)) { later(); }
    });
    observer.observe(cams, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true });
    document.addEventListener('fullscreenchange', later, { signal });
    onRetire(() => {
        observer.disconnect();
        running.forEach(up => up.stop());
        running.clear();
    });

    globalThis.ICX.upscale = {
        supported: () => supported() && !lostThisVisit,
        get: () => enabled,
        set(on) {
            enabled = !!on;
            store.set('upscale', enabled);
            document.dispatchEvent(new CustomEvent('icx:pref', { detail: 'upscale' }));
            sync();
        },
    };
    sync();
})();
