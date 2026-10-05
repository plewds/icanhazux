// Builds the store packages: dist/icanhazux-<version>-chrome.zip and
// dist/icanhazux-<version>-firefox.zip.
//
//   npm run build
//
// Both hold only what the extension runs on (manifest, code, styles, fonts,
// icons) plus the LICENSE; tests and dev files stay out. They differ in one
// thing: Firefox needs browser_specific_settings (its add-on id and
// data-collection declaration), which Chrome reports as an unrecognized key,
// so the Chrome manifest leaves it out.
//
// No dependencies: the zip is written here (deflate from Node's zlib).
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));

// What goes in, besides the manifest.
const INCLUDE = ['src', 'styles', 'fonts', 'LICENSE'];
const ICONS = Object.values(manifest.icons || {});

function walk(rel) {
    const abs = path.join(ROOT, rel);
    if (fs.statSync(abs).isDirectory()) {
        return fs.readdirSync(abs).sort().flatMap(name => walk(path.posix.join(rel, name)));
    }
    return [rel];
}

// Check that everything the manifest names is there.
function checkManifest(files) {
    const named = [
        ...ICONS,
        ...manifest.content_scripts.flatMap(cs => [...(cs.js || []), ...(cs.css || [])]),
    ];
    const missing = named.filter(f => !files.includes(f));
    if (missing.length) { throw new Error(`manifest names missing files: ${missing.join(', ')}`); }
}

// ── A minimal zip writer ─────────────────────────────────────────────────────

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) { c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; }
    return c >>> 0;
});
function crc32(buf) {
    let c = 0xffffffff;
    for (const byte of buf) { c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8); }
    return (c ^ 0xffffffff) >>> 0;
}

// A fixed timestamp, so the same sources always build the same zip.
const DOS_TIME = 0;
const DOS_DATE = (2026 - 1980) << 9 | 1 << 5 | 1;

function zip(entries) {
    const locals = [];
    const centrals = [];
    let offset = 0;
    for (const { name, data } of entries) {
        const nameBuf = Buffer.from(name, 'utf8');
        const deflated = zlib.deflateRawSync(data, { level: 9 });
        const stored = deflated.length >= data.length;
        const body = stored ? data : deflated;
        const crc = crc32(data);

        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);                  // version needed
        local.writeUInt16LE(0x0800, 6);              // UTF-8 names
        local.writeUInt16LE(stored ? 0 : 8, 8);      // stored / deflate
        local.writeUInt16LE(DOS_TIME, 10);
        local.writeUInt16LE(DOS_DATE, 12);
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(body.length, 18);
        local.writeUInt32LE(data.length, 22);
        local.writeUInt16LE(nameBuf.length, 26);
        local.writeUInt16LE(0, 28);
        locals.push(local, nameBuf, body);

        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE(20, 4);                // version made by
        central.writeUInt16LE(20, 6);
        central.writeUInt16LE(0x0800, 8);
        central.writeUInt16LE(stored ? 0 : 8, 10);
        central.writeUInt16LE(DOS_TIME, 12);
        central.writeUInt16LE(DOS_DATE, 14);
        central.writeUInt32LE(crc, 16);
        central.writeUInt32LE(body.length, 20);
        central.writeUInt32LE(data.length, 24);
        central.writeUInt16LE(nameBuf.length, 28);
        central.writeUInt32LE(offset, 42);           // the other fields stay 0
        centrals.push(central, nameBuf);

        offset += 30 + nameBuf.length + body.length;
    }
    const centralSize = centrals.reduce((n, b) => n + b.length, 0);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(centralSize, 12);
    end.writeUInt32LE(offset, 16);
    return Buffer.concat([...locals, ...centrals, end]);
}

// ── Build ───────────────────────────────────────────────────────────────────

const files = [...INCLUDE.flatMap(walk), ...ICONS].filter((f, i, all) => all.indexOf(f) === i);
checkManifest(files);
const contents = files.map(name => ({ name, data: fs.readFileSync(path.join(ROOT, name)) }));

const chromeManifest = { ...manifest };
delete chromeManifest.browser_specific_settings;

fs.mkdirSync(DIST, { recursive: true });
for (const [target, m] of [['chrome', chromeManifest], ['firefox', manifest]]) {
    const out = path.join(DIST, `icanhazux-${manifest.version}-${target}.zip`);
    const entries = [{ name: 'manifest.json', data: Buffer.from(JSON.stringify(m, null, 2) + '\n') }, ...contents];
    fs.writeFileSync(out, zip(entries));
    console.log(`${path.relative(ROOT, out)}  (${entries.length} files, ${Math.round(fs.statSync(out).size / 1024)} KB)`);
}
