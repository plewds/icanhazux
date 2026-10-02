// The site's chat scroll/focus functions, transcribed from scripts110725.js
// (de-minified, side effects not needed for the tests dropped). Top-level
// declarations so they're globals, exactly as on the real site.
/* eslint-disable no-var */
var du = { fp: null, fq: null, eo: 1, en: '', gY: false };

function as() { if (du.fq) { du.fq.focus(); } }

function scrollOff() {
    if (!du.eo) { return; }
    if (!du.fq) { du.fq = document.getElementById('txtMsg'); }
    as();
    du.eo = 0;
}

function cR(b) {
    if (b === 'undefined') { b = 1; }   // sic: the site compares to the string
    if (b) { as(); }
    du.eo = 1;
    du.en = '';
}

function onChatHistoryScroll() {
    if (du.fp === null) { du.fp = document.getElementById('txt'); }
    if (du.fp.scrollTop < du.fp.scrollHeight - 450) {
        if (du.eo) { du.gY = !du.fp.scrollTop; scrollOff(); }
    } else if (!du.eo) {
        cR();
    }
}

du.fq = document.getElementById('txtMsg');
