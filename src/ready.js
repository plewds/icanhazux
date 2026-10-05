// Last of the content scripts: everything is styled now, so lift the cloak
// early.js put on the page.
(function () {
    'use strict';

    delete document.documentElement.dataset.icxCloak;
})();
