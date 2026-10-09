const test = require('node:test');
const assert = require('node:assert');
const { packGrid, packFocused, quantize } = require('../src/pack.js');

const overlaps = (a, b) =>
    a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 &&
    a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;

function assertSane(rects, W, H) {
    for (const r of rects) {
        assert.ok(r.w > 0 && r.h > 0, 'positive size');
        assert.ok(r.x >= -0.5 && r.y >= -0.5, 'inside top-left');
        assert.ok(r.x + r.w <= W + 0.5 && r.y + r.h <= H + 0.5, `inside box: ${JSON.stringify(r)}`);
    }
    for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
            assert.ok(!overlaps(rects[i], rects[j]), `no overlap ${i}/${j}`);
        }
    }
}

test('grid: every cam placed once, inside the box, no overlaps, aspect kept', () => {
    for (const n of [1, 2, 3, 6, 9, 15]) {
        const ars = Array.from({ length: n }, (_, i) => [4 / 3, 16 / 9, 9 / 16, 1][i % 4]);
        const rects = packGrid(1200, 800, 4, ars);
        assert.strictEqual(rects.length, n);
        assert.deepStrictEqual(rects.map(r => r.index).sort((a, b) => a - b), [...Array(n).keys()]);
        assertSane(rects, 1200, 800);
        for (const r of rects) {
            assert.ok(Math.abs(r.w / r.h - ars[r.index]) < 1e-6, 'aspect preserved');
        }
    }
});

test('grid: a narrow, tall box keeps every cam watchable', () => {
    // 12 cams at 300×800 once came out as three full-width cams over a row
    // of nine slivers.
    const rects = packGrid(300, 800, 4, Array(12).fill(4 / 3));
    assertSane(rects, 300, 800);
    const areas = rects.map(r => r.w * r.h);
    assert.ok(Math.max(...areas) / Math.min(...areas) < 2, 'cams of one shape come out about the same size');
});

test('grid: unusable input returns null', () => {
    assert.strictEqual(packGrid(0, 800, 4, [1]), null);
    assert.strictEqual(packGrid(800, 800, 4, []), null);
});

test('focus: focused cam is the largest and nothing overlaps it', () => {
    for (const n of [1, 3, 5, 8, 14]) {
        const ars = Array.from({ length: n }, (_, i) => (i % 3 === 0 ? 9 / 16 : 4 / 3));
        const out = packFocused(1400, 820, 2, 4 / 3, ars);
        assert.ok(out, `packed n=${n}`);
        assert.strictEqual(out.rects.length, n);
        const all = [out.focus, ...out.rects];
        assertSane(all, 1400, 820);
        const focusArea = out.focus.w * out.focus.h;
        for (const r of out.rects) { assert.ok(r.w * r.h < focusArea, 'focus is largest'); }
    }
});

test('focus: in a narrow panel the focus spans the width and the rest fill the space under it', () => {
    // 8 cams in the narrowest cam panel: this used to be the focus at 60% of
    // the width and the other 7 in one thin column beside it.
    const out = packFocused(300, 700, 6, 4 / 3, Array(7).fill(4 / 3));
    assertSane([out.focus, ...out.rects], 300, 700);
    assert.strictEqual(Math.round(out.focus.w), 300, 'focus spans the panel');
    for (const r of out.rects) { assert.ok(r.y >= out.focus.h, 'the rest are under it'); }
    assert.ok(new Set(out.rects.map(r => Math.round(r.x))).size > 1, 'more than one column');
});

test('focus with no other cams fills the box at its aspect', () => {
    const out = packFocused(1000, 600, 2, 4 / 3, []);
    assert.strictEqual(out.rects.length, 0);
    assert.strictEqual(Math.round(out.focus.h), 600);
});

test('quantize keeps integer edges inside the box', () => {
    const q = quantize({ x: 99.6, y: -3, w: 1000.7, h: 50.2 }, 1000, 40);
    assert.deepStrictEqual(q, { x: 100, y: 0, w: 900, h: 40 });
});
