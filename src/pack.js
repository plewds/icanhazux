// Cam layout engine. Pure functions, no DOM: given a box and each cam's aspect
// ratio, return pixel rectangles. Loaded as a content script (exposes
// globalThis.ICX_PACK) and required directly by the unit tests.
//
// Ported from icanhazbetter's freeform packer, minus its per-cam size levels.
//
// Cams are rectangles with FIXED aspect ratios that may be scaled freely, so
// this is not bin packing — it is the justified-gallery problem. A line of
// items can be solved in closed form to exactly fill the strip's main axis,
// and a small DP picks the line breaks whose cross sizes stay nearest a
// target.
//
// Line math: item i has main-axis extent e_i per unit of cross size
// (e = w/h for a horizontal row, e = h/w for a vertical column). A line
// holding items S fills the main axis exactly when
//     cross(S) = (stripMain − (|S|−1)·gap) / Σ_{i∈S} e_i
// and the DP minimizes Σ_lines (cross − target)² over contiguous partitions,
// with target = (stripCross − (L−1)·gap) / L for L lines.
(function (root) {
    'use strict';

    // exts: per-item main-axis extent per unit cross. Returns the best line
    // count and break points, or null when the strip is unusable.
    function solveLines(exts, stripMain, stripCross, gap, maxLines) {
        const m = exts.length;
        if (!m || !(stripMain > 0) || !(stripCross > 0)) { return null; }
        const pre = new Array(m + 1).fill(0);
        for (let i = 0; i < m; i++) { pre[i + 1] = pre[i] + exts[i]; }
        const crossOf = (i, j) => (stripMain - (j - i - 1) * gap) / (pre[j] - pre[i]);
        const lim = Math.min(m, Math.max(1, maxLines));
        let best = null;
        for (let L = 1; L <= lim; L++) {
            const target = (stripCross - (L - 1) * gap) / L;
            if (target <= 0) { break; }
            const dp = [new Array(m + 1).fill(Infinity)];
            dp[0][0] = 0;
            const cut = [];
            for (let l = 1; l <= L; l++) {
                dp[l] = new Array(m + 1).fill(Infinity);
                cut[l] = new Array(m + 1).fill(0);
                for (let j = l; j <= m; j++) {
                    for (let i = l - 1; i < j; i++) {
                        if (dp[l - 1][i] === Infinity) { continue; }
                        const d = crossOf(i, j) - target;
                        const cost = dp[l - 1][i] + d * d;
                        if (cost < dp[l][j]) { dp[l][j] = cost; cut[l][j] = i; }
                    }
                }
            }
            if (dp[L][m] === Infinity) { continue; }
            if (!best || dp[L][m] < best.cost) {
                const bounds = [];
                let j = m;
                for (let l = L; l >= 1; l--) { bounds.unshift([cut[l][j], j]); j = cut[l][j]; }
                best = {
                    cost: dp[L][m],
                    lines: bounds.map(([i, jj]) => ({ start: i, end: jj, cross: crossOf(i, jj) })),
                };
            }
        }
        return best;
    }

    // Turn a line solution into rects inside `strip` ({x,y,w,h}).
    // axis 'row': lines stack top→bottom, items flow left→right.
    // axis 'col': lines stack left→right, items flow top→bottom.
    // Lines are only ever DOWN-scaled (upscaling would overflow the main axis);
    // leftover cross space is spread evenly around the lines, and each line's
    // main-axis slack centers it in the strip.
    function realizeStrip(items, strip, gap, axis, maxLines) {
        if (!strip || !(strip.w > 0) || !(strip.h > 0)) { return null; }
        const exts = items.map(it => axis === 'row' ? it.ar : 1 / it.ar);
        const main = axis === 'row' ? strip.w : strip.h;
        const cross = axis === 'row' ? strip.h : strip.w;
        const solved = solveLines(exts, main, cross, gap, maxLines);
        if (!solved) { return null; }
        const L = solved.lines.length;
        const sumCross = solved.lines.reduce((a, l) => a + l.cross, 0);
        const usedCross = sumCross + (L - 1) * gap;
        const scale = usedCross > cross ? (cross - (L - 1) * gap) / sumCross : 1;
        if (!(scale > 0)) { return null; }
        const pad = Math.max(0, cross - (sumCross * scale + (L - 1) * gap)) / (L + 1);
        const rects = [];
        let crossPos = pad;
        for (const line of solved.lines) {
            const lineCross = line.cross * scale;
            let mainLen = (line.end - line.start - 1) * gap;
            for (let i = line.start; i < line.end; i++) { mainLen += exts[i] * lineCross; }
            let mainPos = Math.max(0, (main - mainLen) / 2);
            for (let i = line.start; i < line.end; i++) {
                const len = exts[i] * lineCross;
                rects.push(axis === 'row'
                    ? { index: items[i].index, x: strip.x + mainPos, y: strip.y + crossPos, w: len, h: lineCross }
                    : { index: items[i].index, x: strip.x + crossPos, y: strip.y + mainPos, w: lineCross, h: len });
                mainPos += len + gap;
            }
            crossPos += lineCross + gap + pad;
        }
        return rects;
    }

    // Every cam justified into rows across the whole box.
    // ars: aspect ratio (w/h) per cam. Returns rects tagged with their index.
    function packGrid(W, H, gap, ars) {
        if (!(W > 0) || !(H > 0) || !ars.length) { return null; }
        const items = ars.map((ar, index) => ({ index, ar }));
        return realizeStrip(items, { x: 0, y: 0, w: W, h: H }, gap, 'row', Math.min(8, items.length));
    }

    // Focus mode: the focused cam is pinned top-left at its real aspect ratio
    // and the rest are packed into the L-shaped region beside and below it.
    //
    // Full search: focus width candidates × two L-decompositions (right strip
    // full-height vs focus-height) × how many cams go beside vs below. The
    // right strip is claimed by the TALLEST cams because they stack
    // efficiently in a narrow column; everything keeps its order within its
    // strip so cams don't shuffle when aspect ratios drift.
    // Score = 4·focusArea + Σ thumbArea + n·minThumbArea − penalties. The
    // focus weight is deliberately heavy: focus should claim most of the
    // panel, with the thumbnails sharing what's left — but never shrinking
    // below a usable size (MINDIM), which caps how far the focus can grow.
    function packFocused(W, H, gap, focusAR, thumbARs) {
        if (!(W > 0) || !(H > 0) || !(focusAR > 0)) { return null; }
        const n = thumbARs.length;
        const fitW = Math.min(W, H * focusAR);
        if (!n) {
            return { focus: { x: 0, y: 0, w: fitW, h: fitW / focusAR }, rects: [] };
        }
        const byTallness = thumbARs.map((ar, index) => ({ index, ar }))
            .sort((a, b) => a.ar - b.ar || a.index - b.index);
        const all = thumbARs.map((ar, index) => ({ index, ar }));
        const FOCUS_WEIGHT = 3;
        const FOCUS_LEAD = 3;   // focus area vs. the biggest thumbnail
        // Thumbnails' short side must reach this. First try a floor scaled to
        // the panel; if nothing fits (tiny panel, crowded room), fall back to
        // a fixed small floor.
        const floors = [Math.max(72, Math.min(W, H) * 0.14), 48];
        for (const MINDIM of floors) {
            const best = searchFocused(MINDIM);
            if (best) { return best; }
        }
        return null;

        function searchFocused(MINDIM) {
        const step = n > 12 ? 0.05 : 0.025;
        const widths = [];
        for (let f = 0.45; f <= 0.901; f += step) { widths.push(f * W); }
        widths.push(fitW);
        const seen = new Set();
        let best = null;
        for (const fwRaw of widths) {
            // Floor, never round up: a 1px overshoot would push the strips
            // out of bounds with it.
            let fw = Math.floor(Math.min(fwRaw, fitW));
            let fh = Math.round(fw / focusAR);
            if (fh > H) { fh = Math.floor(H); fw = Math.min(fw, Math.floor(fh * focusAR)); }
            if (fw <= 0 || fh <= 0 || seen.has(fw)) { continue; }
            seen.add(fw);
            const rightW = W - fw - gap;
            const bottomH = H - fh - gap;
            const canRight = rightW >= MINDIM * 0.7;
            const canBottom = bottomH >= MINDIM * 0.7;
            if (!canRight && !canBottom) { continue; }
            for (const fullHeightRight of [true, false]) {
                if (!canRight && fullHeightRight) { continue; }
                const right = canRight
                    ? { x: fw + gap, y: 0, w: rightW, h: fullHeightRight ? H : fh }
                    : null;
                const bottom = canBottom
                    ? { x: 0, y: fh + gap, w: fullHeightRight ? fw : W, h: bottomH }
                    : null;
                const sMin = bottom ? 0 : n;
                const sMax = right ? Math.min(n, 12) : 0;
                for (let s = sMin; s <= Math.max(sMin, sMax); s++) {
                    if (!right && s > 0) { break; }
                    if (!bottom && s < n) { continue; }
                    const chosen = new Set(byTallness.slice(0, s).map(it => it.index));
                    const rects = [];
                    // Line caps keep the strips reading as margins around the
                    // focus, unless a strip is the only region.
                    if (s > 0) {
                        const colLim = bottom ? 3 : Math.min(8, s);
                        const rr = realizeStrip(all.filter(it => chosen.has(it.index)), right, gap, 'col', colLim);
                        if (!rr) { continue; }
                        rects.push(...rr);
                    }
                    if (s < n) {
                        const rowLim = right ? 5 : Math.min(8, n - s);
                        const br = realizeStrip(all.filter(it => !chosen.has(it.index)), bottom, gap, 'row', rowLim);
                        if (!br) { continue; }
                        rects.push(...br);
                    }
                    let sum = 0;
                    let min = Infinity;
                    let max = 0;
                    let penalty = 0;
                    let unusable = false;
                    for (const r of rects) {
                        if (Math.min(r.w, r.h) < MINDIM) { unusable = true; break; }
                        const a = r.w * r.h;
                        sum += a;
                        if (a < min) { min = a; }
                        if (a > max) { max = a; }
                    }
                    if (unusable) { continue; }
                    // The focused feed should be clearly the largest.
                    const focusArea = fw * fh;
                    if (focusArea < FOCUS_LEAD * max) { penalty += (FOCUS_LEAD * max - focusArea) * 3; }
                    const score = FOCUS_WEIGHT * focusArea + sum + n * min - penalty;
                    if (!best || score > best.score) {
                        best = { score, focus: { x: 0, y: 0, w: fw, h: fh }, rects };
                    }
                }
            }
        }
        return best;
        }
    }

    // Round a fractional rect to integer edges (so rounding never accumulates)
    // and clamp it inside a W×H box.
    function quantize(r, W, H) {
        const left = Math.max(0, Math.min(W - 1, Math.round(r.x)));
        const top = Math.max(0, Math.min(H - 1, Math.round(r.y)));
        const right = Math.max(left + 1, Math.min(Math.floor(W), Math.round(r.x + r.w)));
        const bottom = Math.max(top + 1, Math.min(Math.floor(H), Math.round(r.y + r.h)));
        return { x: left, y: top, w: right - left, h: bottom - top };
    }

    const api = { solveLines, realizeStrip, packGrid, packFocused, quantize };
    if (typeof module === 'object' && module.exports) { module.exports = api; }
    root.ICX_PACK = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
