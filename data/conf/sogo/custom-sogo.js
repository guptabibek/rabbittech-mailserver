// RabbitTech: use the Inter font shipped with the mailcow web UI (served from /fonts)
(function () {
    try {
        var style = document.createElement('style');
        style.textContent =
            '@font-face{font-family:"Inter";font-style:normal;font-weight:100 900;font-display:swap;' +
            'src:url("/fonts/inter-latin-wght-normal.woff2") format("woff2");' +
            'unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122,U+2212,U+FEFF,U+FFFD;}' +
            '@font-face{font-family:"Inter";font-style:normal;font-weight:100 900;font-display:swap;' +
            'src:url("/fonts/inter-latin-ext-wght-normal.woff2") format("woff2");' +
            'unicode-range:U+0100-02AF,U+1E00-1E9F,U+1EF2-1EFF,U+20A0-20AB,U+20AD-20C0,U+2C60-2C7F,U+A720-A7FF;}' +
            'body,input,textarea,select,button{font-family:"Inter","Roboto","Helvetica Neue",Arial,sans-serif;}';
        (document.head || document.documentElement).appendChild(style);
    } catch (e) {}
})();

// redirect to mailcow login form
document.addEventListener('DOMContentLoaded', function () {
    var loginForm = document.forms.namedItem("loginForm");
    if (loginForm) {
        window.location.href = '/user';
    }
});
// logout function
function mc_logout() {
    fetch("/", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: "logout=1"
    }).then(() => window.location.href = '/');
}

// Custom SOGo JS

// Change the visible font-size in the editor, this does not change the font of a html message by default
CKEDITOR.addCss("body {font-size: 16px !important}");

// Enable scayt by default
//CKEDITOR.config.scayt_autoStartup = true;

