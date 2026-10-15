// RabbitTech Mail look for SOGo webmail (mounted as WebServerResources/js/custom-sogo.js and
// loaded on every SOGo page through SOGoUIAdditionalJSFiles, after theme.js).
//
// The stylesheet below is added before Angular starts, so pages never show SOGo's stock look
// first. It only changes colours, spacing, type and corners; list rows keep the heights SOGo's
// virtual scrolling expects (56px messages and contacts, 40px folders). Selectors follow the
// SOGo 5.12 markup; after a SOGo upgrade that renames something, that part falls back to
// SOGo's own styling rather than breaking.
(function () {
  'use strict';
  try {
    var root = document.documentElement;
    var dark = false;
    try { dark = localStorage.getItem('mailcow_theme') === 'dark'; } catch (e) {}
    if (dark) root.setAttribute('data-theme', 'dark');

    var style = document.createElement('style');
    style.id = 'rabbittech-sogo';
    style.textContent = String.raw`
/* ----------------------------------------------------------------- tokens */
@font-face {
  font-family: "Inter";
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url("/fonts/inter-latin-wght-normal.woff2") format("woff2");
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+20AC, U+2122, U+2212, U+FEFF, U+FFFD;
}
@font-face {
  font-family: "Inter";
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url("/fonts/inter-latin-ext-wght-normal.woff2") format("woff2");
  unicode-range: U+0100-02AF, U+1E00-1E9F, U+1EF2-1EFF, U+20A0-20AB, U+20AD-20C0, U+2C60-2C7F, U+A720-A7FF;
}
:root {
  color-scheme: light;
  --rt-font: "Inter", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif;
  --rt-bg: #f5f6fa;
  --rt-sidebar: #fbfbfd;
  --rt-surface: #ffffff;
  --rt-surface-2: #f8f9fc;
  --rt-surface-3: #f1f3f8;
  --rt-border: #e6e8ef;
  --rt-border-strong: #d5d9e3;
  --rt-control-border: #8d93a5;
  --rt-text: #10121b;
  --rt-text-2: #3c4256;
  --rt-muted: #5f667a;
  --rt-subtle: #686e82;
  --rt-hover: rgba(16, 18, 40, .045);
  --rt-primary: #7c3aed;
  --rt-primary-hover: #6d28d9;
  --rt-primary-soft: #f4f0ff;
  --rt-primary-soft-2: #e9e0ff;
  --rt-primary-text: #6d28d9;
  --rt-ring: rgba(124, 58, 237, .24);
  --rt-flag-soft: #fef6e7;
  --rt-flag: #d97706;
  --rt-danger-text: #be123c;
  --rt-neutral-soft: #eef0f5;
  --rt-tooltip: #12141c;
  --rt-tooltip-text: #f3f4f8;
  --rt-shadow-sm: 0 1px 2px rgba(16, 18, 40, .04), 0 1px 3px rgba(16, 18, 40, .06);
  --rt-shadow: 0 1px 2px rgba(16, 18, 40, .04), 0 4px 12px rgba(16, 18, 40, .06);
  --rt-shadow-lg: 0 2px 6px rgba(16, 18, 40, .06), 0 16px 40px rgba(16, 18, 40, .12);
  --rt-logo: url("/img/rabbittech_webmail.svg");

  /* CKEditor 5 (compose) */
  --ck-font-face: var(--rt-font);
  --ck-border-radius: 8px;
  --ck-color-base-background: var(--rt-surface);
  --ck-color-base-foreground: var(--rt-surface-2);
  --ck-color-base-border: var(--rt-border);
  --ck-color-base-text: var(--rt-text);
  --ck-color-text: var(--rt-text);
  --ck-color-toolbar-background: var(--rt-surface);
  --ck-color-toolbar-border: var(--rt-border);
  --ck-color-focus-border: var(--rt-primary);
  --ck-color-button-default-hover-background: var(--rt-surface-3);
  --ck-color-button-on-background: var(--rt-primary-soft);
  --ck-color-button-on-hover-background: var(--rt-primary-soft-2);
  --ck-color-button-on-color: var(--rt-primary-text);
  --ck-color-dropdown-panel-background: var(--rt-surface);
  --ck-color-dropdown-panel-border: var(--rt-border);
  --ck-color-panel-background: var(--rt-surface);
  --ck-color-panel-border: var(--rt-border);
  --ck-color-input-background: var(--rt-surface);
  --ck-color-input-border: var(--rt-control-border);
  --ck-color-input-text: var(--rt-text);
  --ck-color-list-background: var(--rt-surface);
  --ck-color-list-button-hover-background: var(--rt-surface-3);
  --ck-color-list-button-on-background: var(--rt-primary-soft);
  --ck-color-list-button-on-text: var(--rt-primary-text);
  --ck-color-labeled-field-label-background: var(--rt-surface);
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --rt-bg: #0b0d12;
  --rt-sidebar: #0e1016;
  --rt-surface: #12151c;
  --rt-surface-2: #161a23;
  --rt-surface-3: #1c212c;
  --rt-border: #232937;
  --rt-border-strong: #3a4257;
  --rt-control-border: #59627e;
  --rt-text: #eceef4;
  --rt-text-2: #c0c5d3;
  --rt-muted: #9aa1b4;
  --rt-subtle: #858ca0;
  --rt-hover: rgba(255, 255, 255, .05);
  --rt-primary: #8b5cf6;
  --rt-primary-hover: #7c3aed;
  --rt-primary-soft: rgba(139, 92, 246, .14);
  --rt-primary-soft-2: rgba(139, 92, 246, .26);
  --rt-primary-text: #c4b5fd;
  --rt-ring: rgba(139, 92, 246, .38);
  --rt-flag-soft: rgba(245, 158, 11, .12);
  --rt-flag: #fbbf24;
  --rt-danger-text: #fda4af;
  --rt-neutral-soft: rgba(148, 163, 184, .14);
  --rt-tooltip: #f3f4f8;
  --rt-tooltip-text: #12141c;
  --rt-shadow-sm: 0 1px 2px rgba(0, 0, 0, .3), 0 1px 3px rgba(0, 0, 0, .25);
  --rt-shadow: 0 1px 2px rgba(0, 0, 0, .3), 0 6px 16px rgba(0, 0, 0, .28);
  --rt-shadow-lg: 0 2px 6px rgba(0, 0, 0, .35), 0 20px 48px rgba(0, 0, 0, .5);
  --rt-logo: url("/img/rabbittech_webmail_dark.svg");
}

/* ------------------------------------------------------------------- base */
html,
body {
  background-color: var(--rt-bg);
  color: var(--rt-text);
}
html, body, button, input, select, textarea, .md-chips, .md-button, md-input-container, .md-subheader {
  font-family: var(--rt-font);
}
body { -webkit-font-smoothing: antialiased; }
a { color: var(--rt-primary-text); }
* { scrollbar-width: thin; scrollbar-color: var(--rt-border-strong) transparent; }
:focus-visible { outline: 2px solid var(--rt-primary); outline-offset: 2px; }
.md-whiteframe-z1, .md-whiteframe-1dp { box-shadow: none; }

/* Buttons: sentence case like the console; icon buttons get a soft hover */
html .md-button,
html .md-button.sg-icon-button { text-transform: none; letter-spacing: 0; font-weight: 600; }
.md-button:not(.md-icon-button):not(.md-fab):not(.sg-icon-button) { border-radius: 8px; }
.md-button.md-icon-button:not([disabled]):hover,
.md-button.sg-icon-button:not([disabled]):hover { background-color: var(--rt-hover); }
.md-button.md-raised.md-primary:not([disabled]),
.md-button.md-primary.md-raised:not([disabled]) {
  background-color: var(--rt-primary);
  color: #fff;
  box-shadow: none;
}
.md-button.md-raised:not(.md-primary):not(.md-warn):not([disabled]) {
  background-color: var(--rt-surface);
  color: var(--rt-text);
  border: 1px solid var(--rt-border-strong);
  box-shadow: none;
}

/* Menus, tooltips, toasts */
.md-open-menu-container {
  border-radius: 10px;
  border: 1px solid var(--rt-border);
  box-shadow: var(--rt-shadow-lg);
  background-color: var(--rt-surface);
}
md-menu-content.md-default-theme,
md-menu-content { background-color: var(--rt-surface); padding: 6px; }
md-menu-item > .md-button,
md-menu-item > .md-button.md-default-theme {
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  color: var(--rt-text);
}
md-menu-item > .md-button:not([disabled]):hover { background-color: var(--rt-surface-3); }
md-menu-divider { background-color: var(--rt-border); margin: 6px 0; }
.md-tooltip,
md-tooltip .md-content {
  background-color: var(--rt-tooltip);
  color: var(--rt-tooltip-text);
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
}
md-toast .md-toast-content {
  border-radius: 10px;
  background-color: var(--rt-tooltip);
  color: var(--rt-tooltip-text);
  box-shadow: var(--rt-shadow-lg);
}

/* Tabs (Preferences, contact and event editors) */
md-tabs .md-tab { text-transform: none; font-weight: 600; font-size: 14px; letter-spacing: 0; }
md-tabs.md-default-theme .md-tab:not(.md-active),
md-tabs .md-tab:not(.md-active) { color: var(--rt-muted); }

/* Chips */
md-chips md-chip,
.md-chips md-chip {
  height: 26px;
  line-height: 26px;
  border-radius: 999px;
  font-size: 12.5px;
  font-weight: 500;
  background-color: var(--rt-neutral-soft);
  color: var(--rt-text-2);
}
.md-chips { box-shadow: 0 1px var(--rt-border); }
md-chips.sg-readonly .md-chips,
md-chips.sg-readonly .md-chips.md-focused { box-shadow: none; }
md-chips md-chip.md-focused { background-color: var(--rt-primary); color: #fff; }

/* Dialogs (event, contact and folder dialogs; compose has its own section) */
body md-dialog {
  background-color: var(--rt-surface) !important;
  color: var(--rt-text);
  border-radius: 14px;
  border: 1px solid var(--rt-border);
  box-shadow: var(--rt-shadow-lg);
}
md-dialog > form > md-toolbar:not(.md-menu-toolbar),
md-dialog > md-toolbar:not(.md-menu-toolbar),
md-dialog md-toolbar.md-default-theme:not(.md-menu-toolbar) {
  background-color: var(--rt-surface);
  color: var(--rt-text);
  border-bottom: 1px solid var(--rt-border);
  border-radius: 14px 14px 0 0;
}
md-dialog md-toolbar:not(.md-menu-toolbar) md-icon { color: var(--rt-muted); }
md-dialog md-dialog-actions { border-top: 1px solid var(--rt-border); }
.md-dialog-container md-backdrop.md-opaque,
md-backdrop.md-dialog-backdrop.md-opaque { background-color: rgba(16, 18, 27, .45); opacity: 1; }

/* Form fields */
.pseudo-input-label,
.button-label,
md-input-container:not(.md-input-invalid) label { color: var(--rt-muted); }
md-progress-linear .md-container { border-radius: 999px; }

/* --------------------------------------------------------- top toolbar */
/* Hidden: the big date (the OS shows it). The current app is highlighted instead. */
md-toolbar.toolbar-main:not(.md-menu-toolbar),
md-toolbar.toolbar-main.md-default-theme:not(.md-menu-toolbar) {
  background-color: var(--rt-surface);
  color: var(--rt-text);
  box-shadow: inset 0 -1px 0 var(--rt-border);
}
.toolbar-main .sg-date-group,
.toolbar-main .sg-date-today { display: none; }
.toolbar-main .md-toolbar-tools .md-button.md-icon-button {
  width: 40px;
  height: 40px;
  margin: 0 2px;
  padding: 8px;
  border-radius: 10px;
}
md-toolbar.toolbar-main:not(.md-menu-toolbar) md-icon,
md-toolbar.toolbar-main.md-default-theme:not(.md-menu-toolbar) md-icon { color: var(--rt-muted); }
md-toolbar.toolbar-main:not(.md-menu-toolbar) .md-button.md-icon-button:not([disabled]):hover md-icon { color: var(--rt-text); }
.toolbar-main .md-button.md-icon-button[disabled] {
  background-color: var(--rt-primary-soft);
  opacity: 1;
}
md-toolbar.toolbar-main:not(.md-menu-toolbar) .md-button.md-icon-button[disabled] md-icon { color: var(--rt-primary-text); }
md-toolbar.toolbar-main:not(.md-menu-toolbar) md-icon.sg-icon--badge { color: #fff; }

/* ---------------------------------------------------------------- sidenav */
md-sidenav.md-sidenav-left {
  background-color: var(--rt-sidebar);
  box-shadow: inset -1px 0 0 var(--rt-border);
}
md-sidenav.md-sidenav-left > md-content,
md-sidenav.md-sidenav-left md-content#sidenav-content {
  background-color: var(--rt-sidebar) !important;
}

/* Header: RabbitTech logo on top, then the signed-in user */
md-sidenav > md-toolbar.md-tall:not(.md-menu-toolbar),
md-sidenav > md-toolbar.md-tall.md-default-theme:not(.md-menu-toolbar) {
  position: relative;
  justify-content: flex-end;
  padding: 0 12px 14px 16px;
  background-color: var(--rt-sidebar);
  color: var(--rt-text);
  box-shadow: inset -1px 0 0 var(--rt-border), inset 0 -1px 0 var(--rt-border);
}
md-sidenav > md-toolbar.md-tall::before {
  content: "";
  position: absolute;
  top: 18px;
  left: 16px;
  width: 168px;
  height: 34px;
  background: var(--rt-logo) no-repeat left center / contain;
}
md-sidenav > md-toolbar.md-tall > sg-avatar-image.md-tile-left {
  position: absolute;
  left: 16px;
  bottom: 16px;
  width: 36px;
  height: 36px;
  min-width: 0;
  margin: 0;
  padding: 0;
}
md-sidenav > md-toolbar.md-tall > div[layout="row"] { padding-left: 48px; min-height: 40px; }
md-sidenav > md-toolbar.md-tall .sg-md-title {
  margin: 0;
  font-size: 14px;
  line-height: 20px;
  font-weight: 600;
  color: var(--rt-text);
}
md-sidenav > md-toolbar.md-tall .md-caption {
  margin: 0;
  font-size: 12px;
  line-height: 16px;
  color: var(--rt-muted);
  opacity: 1;
}
/* Angular Material colours icons in a toolbar with (0,3,2) selectors */
md-sidenav > md-toolbar.md-tall.md-hue-2:not(.md-menu-toolbar) md-icon,
md-sidenav > md-toolbar.md-tall.md-default-theme:not(.md-menu-toolbar) .md-button md-icon { color: var(--rt-muted); }

/* Account row, quota, section headings */
md-sidenav .sg-account-section > md-list > md-list-item {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--rt-muted);
}
md-sidenav .sg-account-section > md-list > md-list-item md-icon { color: var(--rt-subtle); }
md-sidenav .sg-quota { padding: 2px 16px 12px; text-align: left; }
md-sidenav .sg-quota md-progress-linear > .md-container {
  height: 4px;
  background-color: var(--rt-border);
}
md-sidenav .sg-quota md-progress-linear .md-bar { border-radius: 999px; }
md-sidenav .sg-quota .sg-md-caption.md-fg,
md-sidenav .sg-quota .sg-md-caption {
  margin-top: 6px;
  font-size: 11.5px;
  color: var(--rt-muted);
}
md-sidenav .sg-quota .sg-md-caption.md-fg.md-warn { color: var(--rt-danger-text); }
md-sidenav md-subheader.md-default-theme,
md-sidenav .md-subheader,
md-sidenav md-subheader {
  background-color: transparent !important;
  color: var(--rt-muted) !important;
  font-size: 11px;
  font-weight: 650;
  letter-spacing: .06em;
  text-transform: uppercase;
}
md-sidenav md-divider { border-top-color: var(--rt-border); }

/* Folders (and calendars / address books): rounded rows inset from the edge */
md-sidenav.md-sidenav-left md-list-item.md-clickable,
md-sidenav.md-sidenav-left md-list-item[ui-sref],
md-sidenav.md-sidenav-left md-list-item.sg-calendar-list-item {
  margin: 0 8px;
  border-radius: 8px;
  color: var(--rt-text-2);
}
md-sidenav.md-sidenav-left md-list-item.md-clickable:not([disabled]):hover,
md-sidenav.md-sidenav-left md-list-item[ui-sref]:not([disabled]):hover,
md-sidenav.md-sidenav-left md-list-item.sg-calendar-list-item:not([disabled]):hover {
  background-color: var(--rt-hover);
}
md-sidenav .sg-item-name {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 2px;
  font-size: 14px;
  color: var(--rt-text-2);
}
md-sidenav .sg-item-name > span:not(.sg-counter-badge) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
md-sidenav .sg-item-name md-icon { color: var(--rt-subtle); font-size: 20px; }
md-sidenav .sg-item-name .sg-font-medium { color: var(--rt-text); font-weight: 650; }
md-sidenav .sg-counter-badge {
  flex: none;
  min-width: 20px;
  height: 20px;
  margin: 0 0 0 auto;
  padding: 0 7px;
  border: 0;
  border-radius: 999px;
  background-color: var(--rt-primary-soft-2);
  color: var(--rt-primary-text);
  font-size: 11px;
  font-weight: 650;
  line-height: 20px;
  text-align: center;
}
md-sidenav md-checkbox.sg-folder .md-container::after { color: var(--rt-subtle); }
md-sidenav md-list-item md-icon.md-menu { color: var(--rt-subtle); }
md-sidenav.md-sidenav-left md-list-item[disabled] { color: var(--rt-subtle) !important; }

/* Selected folder / address book (SOGo's colour sheet loads after this one) */
md-sidenav md-list-item.sg-mailbox-list-item.md-background.md-hue-1.md-bg,
md-sidenav md-list-item.md-default-theme.md-background.md-hue-1.md-bg {
  background-color: var(--rt-primary-soft) !important;
  color: var(--rt-primary-text) !important;
}
md-sidenav md-list-item.md-background.md-hue-1.md-bg .sg-item-name,
md-sidenav md-list-item.md-background.md-hue-1.md-bg .sg-item-name > span:not(.sg-counter-badge),
md-sidenav md-list-item.md-background.md-hue-1.md-bg .sg-item-name md-icon,
md-sidenav md-list-item.md-background.md-hue-1.md-bg > md-icon,
md-sidenav md-list-item.md-background.md-hue-1.md-bg p { color: var(--rt-primary-text); font-weight: 600; }
md-sidenav md-list-item.md-background.md-hue-1.md-bg .sg-counter-badge {
  background-color: var(--rt-primary);
  color: #fff;
}

/* --------------------------------------------------- message and contact lists */
.view-list {
  background-color: var(--rt-surface);
  box-shadow: inset -1px 0 0 var(--rt-border);
}
.view-list > md-toolbar.md-accent.md-hue-1:not(.md-menu-toolbar),
.view-list > md-toolbar.md-hue-1.sg-toolbar-secondary:not(.md-menu-toolbar),
.view-list md-toolbar.md-accent.md-hue-1.md-default-theme:not(.md-menu-toolbar) {
  background-color: var(--rt-surface);
  color: var(--rt-text);
}
.view-list > md-toolbar.md-hue-1.sg-toolbar-secondary:not(.md-menu-toolbar) {
  background-color: var(--rt-primary-soft);
  color: var(--rt-primary-text);
}
.view-list > md-toolbar:not(.md-menu-toolbar) md-icon,
.view-list md-toolbar.md-accent.md-hue-1.md-default-theme:not(.md-menu-toolbar) md-icon { color: var(--rt-muted); fill: var(--rt-muted); }
.view-list > md-toolbar.sg-toolbar-secondary:not(.md-menu-toolbar) md-icon,
.view-list md-toolbar.md-hue-1.sg-toolbar-secondary.md-default-theme:not(.md-menu-toolbar) md-icon { color: var(--rt-primary-text); fill: var(--rt-primary-text); }
.view-list .sg-folder-name {
  font-size: 16px;
  font-weight: 650;
  letter-spacing: -.01em;
  color: var(--rt-text);
  text-decoration: none;
}
.view-list > md-divider { border-top-color: var(--rt-border); }
.view-list md-toolbar md-input-container[md-no-float] .md-input,
.view-list md-toolbar.md-accent.md-hue-1 md-input-container[md-no-float] .md-input {
  height: 36px;
  padding: 0 12px;
  border: 1px solid var(--rt-border-strong);
  border-radius: 8px;
  background-color: var(--rt-surface);
  color: var(--rt-text);
}
.view-list md-toolbar md-input-container.md-input-focused .md-input { border-color: var(--rt-primary); box-shadow: 0 0 0 3px var(--rt-ring); }

/* "8 messages · Date" */
.view-list md-content > md-subheader,
.view-list md-content > .md-subheader-wrapper md-subheader,
.view-list md-subheader.md-default-theme {
  background-color: var(--rt-surface);
  color: var(--rt-muted);
  font-size: 12px;
  line-height: 18px;
  font-weight: 500;
  box-shadow: inset 0 -1px 0 var(--rt-border);
}
.view-list md-subheader md-icon { color: var(--rt-subtle); font-size: 16px; min-height: 16px; min-width: 16px; }
.view-list md-content.md-default-theme,
.view-list md-content { background-color: var(--rt-surface); }

/* Rows keep their 56px height; separators are shadows so they add no height */
.sg-section-list md-list-item,
md-list-item.sg-message-list-item {
  position: relative;
  background-color: var(--rt-surface);
  box-shadow: inset 0 -1px 0 var(--rt-border);
  color: var(--rt-text);
}
.sg-section-list md-list-item:not(.md-bg):hover,
md-list-item.sg-message-list-item:not(.md-bg):hover { background-color: var(--rt-surface-2); }
.sg-tile-content .sg-md-subhead { font-size: 14px; font-weight: 500; color: var(--rt-text); }
.sg-tile-content .sg-md-body { font-size: 13px; color: var(--rt-muted); }
.sg-tile-content .sg-tile-date { font-size: 12px; font-weight: 400; color: var(--rt-muted); }
.sg-tile-content .sg-tile-size { font-size: 11.5px; font-weight: 400; color: var(--rt-subtle); }
.sg-tile-icons md-icon { color: var(--rt-subtle); font-size: 14px; min-height: 14px; min-width: 14px; }
.sg-tile-icons md-icon.sg-icon-star,
md-icon.sg-icon-star { color: var(--rt-flag); }
.sg-tile-content .sg-md-subhead md-icon.md-warn { color: var(--rt-danger-text); }
.sg-label-outline {
  border: 0;
  border-radius: 4px;
  padding: 1px 5px;
  background-color: var(--rt-primary-soft);
  color: var(--rt-primary-text);
  font-size: 10.5px;
  font-weight: 650;
  text-transform: uppercase;
}

/* Unread: bold text and a violet bar on the left */
md-list-item.sg-message-list-item.unread .sg-md-subhead,
md-list-item.sg-message-list-item.unread .sg-md-body { color: var(--rt-text); font-weight: 650; }
md-list-item.sg-message-list-item.unread .sg-tile-date { color: var(--rt-primary-text); font-weight: 650; }
md-list-item.sg-message-list-item.unread::before {
  content: "";
  position: absolute;
  z-index: 1;
  top: 10px;
  bottom: 10px;
  left: 0;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background-color: var(--rt-primary);
}

/* Flagged */
md-list-item.sg-message-list-item.sg-star-bg:not(.md-bg) { background-color: var(--rt-flag-soft); }

/* Open / selected row. SOGo's colour sheet forces white text on it, which was unreadable
   on the light violet background. */
.sg-section-list md-list-item.md-default-theme.md-accent.md-hue-2.md-bg,
md-list-item.sg-message-list-item.md-default-theme.md-accent.md-hue-2.md-bg {
  background-color: var(--rt-primary-soft) !important;
  color: var(--rt-text) !important;
  box-shadow: inset 3px 0 0 var(--rt-primary), inset 0 -1px 0 var(--rt-border);
}
.sg-section-list md-list-item.md-bg .sg-tile-content .sg-md-subhead,
.sg-section-list md-list-item.md-bg .sg-tile-content .sg-md-body { color: var(--rt-text); }
.sg-section-list md-list-item.md-bg .sg-tile-content .sg-tile-date { color: var(--rt-primary-text); }

/* Accent hue-2 is a pale tint used for selected rows and today. SOGo also uses it as a text
   colour (today's date) and its colour sheet puts white text on it; keep both readable. */
html .md-default-theme.md-accent.md-hue-2.md-fg { color: var(--rt-primary-text); }
html .md-default-theme.md-accent.md-hue-2.md-bg { color: var(--rt-primary-text) !important; }

/* Avatars: a soft violet circle instead of a large grey icon */
sg-avatar-image {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
}
.sg-avatar-selectable sg-avatar-image,
md-sidenav > md-toolbar.md-tall > sg-avatar-image,
.view-detail sg-avatar-image.md-tile-left,
md-dialog sg-avatar-image {
  display: flex;
  flex: none;
  width: 36px;
  height: 36px;
  padding: 0;
  background-color: var(--rt-primary-soft-2);
}
.view-detail sg-avatar-image.md-tile-left { margin-right: 12px; }
sg-avatar-image .sg-icon-badge-container { display: flex; align-items: center; justify-content: center; }
sg-avatar-image md-icon,
.sg-avatar-selectable sg-avatar-image md-icon {
  color: var(--rt-primary-text) !important;
  font-size: 22px !important;
  width: 22px;
  height: 22px;
  min-width: 22px;
  min-height: 22px;
  line-height: 22px;
}
sg-avatar-image img { border-radius: 50%; }
.sg-avatar-selectable { color: var(--rt-subtle); }
.sg-avatar-selectable.sg-avatar-selected { color: var(--rt-primary); }
.view-list .sg-category-dot { border-color: var(--rt-surface); }
.sg-skeleton .sg-md-subhead > div,
.sg-skeleton .sg-md-body > div { background-color: var(--rt-surface-3) !important; }

/* Compose button */
.md-button.md-fab.md-accent:not([disabled]),
.md-button.md-fab.md-accent.md-default-theme:not([disabled]) {
  background-color: var(--rt-primary);
  color: #fff;
  border-radius: 16px;
  box-shadow: 0 2px 6px rgba(76, 29, 149, .25), 0 10px 24px rgba(124, 58, 237, .3);
}
.md-button.md-fab.md-accent:not([disabled]):hover { background-color: var(--rt-primary-hover); }
.md-button.md-fab.md-accent md-icon { color: #fff; }
md-fab-actions .md-button.md-fab.md-mini,
md-fab-actions .md-button.md-fab.md-mini.md-default-theme {
  border-radius: 12px;
  background-color: var(--rt-surface);
  color: var(--rt-text);
  box-shadow: var(--rt-shadow);
}
md-fab-actions .md-button.md-fab.md-mini md-icon { color: var(--rt-text-2); }

/* ------------------------------------------------------------ reading pane */
.view-detail,
#detailView,
.view-detail > md-content {
  background-color: var(--rt-bg) !important;
}
.view-detail > md-content .sg-md-title { color: var(--rt-subtle) !important; font-size: 15px; font-weight: 500; }
.view-detail md-card,
.view-detail md-card.md-default-theme {
  background-color: var(--rt-surface);
  color: var(--rt-text);
  border: 1px solid var(--rt-border);
  border-radius: 14px;
  box-shadow: var(--rt-shadow-sm);
}
.view-detail md-card > md-card-actions {
  margin: 0;
  padding: 6px 8px;
  border-bottom: 1px solid var(--rt-border);
}
.view-detail md-card > md-card-actions md-icon { color: var(--rt-muted); }
.view-detail md-card > md-card-actions md-icon.sg-icon-star { color: var(--rt-flag); }
.view-detail .sg-md-headline {
  margin-top: 8px;
  font-size: 22px;
  line-height: 30px;
  font-weight: 650;
  letter-spacing: -.015em;
  color: var(--rt-text);
}
.view-detail .msg-date { font-size: 13px; color: var(--rt-muted); }
.view-detail .pseudo-input-container--compact { color: var(--rt-text); }
.view-detail .pseudo-input-container--compact sg-avatar-image + div > span { font-weight: 600; }
.view-detail .pseudo-input-container--compact a.md-caption {
  margin-left: 4px;
  color: var(--rt-muted);
  font-size: 12.5px;
  text-decoration: none;
}
.view-detail .pseudo-input-container--compact a.md-caption:hover { color: var(--rt-primary-text); text-decoration: underline; }
.view-detail .pseudo-input-field a { color: var(--rt-text-2); text-decoration: none; }
.view-detail .pseudo-input-field a:hover { color: var(--rt-primary-text); text-decoration: underline; }
.view-detail md-card md-divider { border-top-color: var(--rt-border); }

/* Contact card header: SOGo uses 48px thin display type for the name */
.view-detail .msg-header .sg-md-display-2--thin {
  font-size: 24px;
  line-height: 32px;
  font-weight: 650;
  letter-spacing: -.015em;
  color: var(--rt-text);
}
.view-detail .msg-header .sg-md-display-2-subheader--thin { font-size: 14px; font-weight: 400; color: var(--rt-muted); }

/* Message body. The sender's own CSS and inline styles must win, so every rule that reaches
   inside the mail uses :where() (no specificity). HTML mail keeps the sender's colours and
   therefore sits on white in both themes. */
.msg-body { font-size: 14.5px; line-height: 1.6; color: var(--rt-text); }
:where(.msg-body .mailer_plaincontent) { font-size: 14px; color: var(--rt-text); }
:where(.msg-body) blockquote {
  margin: 12px 0;
  padding: 2px 0 2px 12px;
  border-left: 3px solid var(--rt-primary-soft-2);
  color: var(--rt-muted);
}

/* Attachments */
.msg-attachment-link md-card,
.msg-attachment-image md-card,
.msg-attachment-other md-card {
  border: 1px solid var(--rt-border);
  border-radius: 10px;
  box-shadow: none;
  background-color: var(--rt-surface-2);
  color: var(--rt-text);
  overflow: hidden;
}
.msg-attachment-link md-card:hover,
.msg-attachment-image md-card:hover { border-color: var(--rt-primary); }
.msg-body .sg-attachment-name { font-size: 13px; font-weight: 500; color: var(--rt-text); }
.msg-body .sg-attachment-size { font-size: 12px; color: var(--rt-muted); }
.msg-body md-dialog-actions,
.msg-body md-card md-dialog-actions { border-top: 0; }
.msg-body md-card md-icon { color: var(--rt-muted); }

/* ------------------------------------------------------------------- compose */
md-dialog#mailEditor > form > md-toolbar:not(.md-menu-toolbar),
md-dialog.sg-mail-editor md-toolbar.md-default-theme:not(.md-menu-toolbar) {
  background-color: var(--rt-surface);
  color: var(--rt-text);
}
md-dialog.sg-mail-editor md-toolbar md-autocomplete,
md-dialog.sg-mail-editor md-toolbar md-autocomplete.md-default-theme.md-bg.md-hue-1 {
  background-color: var(--rt-surface-3) !important;
  color: var(--rt-text) !important;
  border-radius: 8px;
}
md-dialog.sg-mail-editor md-toolbar md-autocomplete input { color: var(--rt-text); }
/* Send: the one filled button in the editor */
md-dialog.sg-mail-editor md-toolbar .md-button.sg-icon-button[ng-click^="editor.send"] {
  background-color: var(--rt-primary);
  border-radius: 999px;
  margin-left: 8px;
}
md-dialog.sg-mail-editor md-toolbar .md-button.sg-icon-button[ng-click^="editor.send"] md-icon { color: #fff; }
md-dialog.sg-mail-editor md-toolbar .md-button.sg-icon-button[ng-click^="editor.send"]:hover { background-color: var(--rt-primary-hover); }
md-dialog.sg-mail-editor header .pseudo-input-container { border-bottom: 1px solid var(--rt-border); }
md-dialog.sg-mail-editor md-dialog-actions.sg-mail-editor-attachments { border-top: 1px solid var(--rt-border); }
[ui-view="maileditor"] .ck.ck-editor__main > .ck-editor__editable,
.sg-mail-editor .ck-content {
  font-size: 15px;
  line-height: 1.6;
  color: var(--rt-text);
  background-color: var(--rt-surface);
}
[ui-view="maileditor"] .ck.ck-toolbar { background-color: var(--rt-surface); }

/* --------------------------------------------------------------- calendar */
[ui-view=calendars] md-toolbar.daysView,
[ui-view=calendars] md-toolbar.monthView,
[ui-view=calendars] md-content[sg-calendar-scroll-view] {
  background-color: var(--rt-surface);
  color: var(--rt-text);
}
[ui-view=calendars] md-toolbar.daysView,
[ui-view=calendars] md-toolbar.monthView { box-shadow: inset 0 -1px 0 var(--rt-border); }
[ui-view=calendars] .hours,
[ui-view=calendars] .hours .hour { color: var(--rt-muted); font-size: 11.5px; }
/* Grid lines: SOGo draws them in beige */
[ui-view=calendars] .allDaysView,
[ui-view=calendars] .allDaysView--sidenav,
[ui-view=calendars] .hours .hour,
[ui-view=calendars] .days .day .clickableHourCell { border-bottom-color: var(--rt-border); }
[ui-view=calendars] .days .day { border-left-color: var(--rt-border); }
[ui-view=calendars] .minutes30 { border-bottom-color: var(--rt-border); border-bottom-style: dashed; opacity: .7; }
[ui-view=calendars] .days .day .clickableHourCell.outOfDay,
[ui-view=calendars] .monthView md-grid-tile.dayOfAnotherMonth { background-color: var(--rt-surface-2); }
[ui-view=calendars] .days .day.weekEndDay { background-color: var(--rt-surface-2); }
[ui-view=calendars] .days .day.dayOfToday { background-color: var(--rt-primary-soft); }

/* Week and day headers: small weekday, clear date, today in a violet pill.
   The colours are set by SOGo's colour sheet, hence !important. */
[ui-view=calendars] .dayLabels .day { padding: 6px 8px 8px; color: var(--rt-muted); }
[ui-view=calendars] .dayLabels .day > .sg-md-caption {
  font-size: 11px;
  font-weight: 650;
  letter-spacing: .06em;
  text-transform: uppercase;
  color: var(--rt-muted) !important;
}
[ui-view=calendars] .dayLabels .day > [class*="sg-md-display"] {
  display: inline-block;
  min-width: 34px;
  margin: 2px 0;
  padding: 0 6px;
  border-radius: 999px;
  font-size: 22px;
  line-height: 34px;
  font-weight: 600;
  text-align: center;
  color: var(--rt-text) !important;
}
[ui-view=calendars] .dayLabels .day.dayOfToday > [class*="sg-md-display"] {
  background-color: var(--rt-primary);
  color: #fff !important;
}
[ui-view=calendars] .dayLabels .day > div:last-child,
[ui-view=calendars] .dayLabels .day > div:last-child span { font-size: 11.5px; color: var(--rt-muted) !important; }
[ui-view=calendars] sg-calendar-day-block .sg-event,
[ui-view=calendars] sg-calendar-month-day .sg-event { border-radius: 6px; }
[ui-view=calendars] md-card > md-card-actions { box-shadow: inset 0 -1px 0 var(--rt-border); }
md-sidenav md-toolbar.sg-toolbar-multiple:not(.md-menu-toolbar) {
  background-color: var(--rt-surface-2);
  color: var(--rt-text);
  box-shadow: inset 0 1px 0 var(--rt-border), inset -1px 0 0 var(--rt-border);
}
/* The filter bar's colour is set inline; the violet sort-mode bar keeps its colour */
md-sidenav md-toolbar.sg-toolbar-multiple > .md-toolbar-tools:first-child {
  background-color: var(--rt-surface-2) !important;
  color: var(--rt-text);
}
md-sidenav md-toolbar.sg-toolbar-multiple > .md-toolbar-tools:first-child md-icon { color: var(--rt-muted) !important; }
md-sidenav md-toolbar.sg-toolbar-multiple input { color: var(--rt-text); }

/* ---------------------------------------------------- dark mode leftovers */
/* SOGo hard-codes white or black in these places */
:root[data-theme="dark"] md-dialog md-dialog-content.sg-dialog-message.ng-hide,
:root[data-theme="dark"] .sg-form-section { background-color: var(--rt-surface) !important; }
:root[data-theme="dark"] .sg-droppable-over { background-color: var(--rt-surface-3) !important; }
:root[data-theme="dark"] .sg-over-dropzone .sg-dropzone {
  background-color: var(--rt-surface);
  border-color: var(--rt-primary);
}
:root[data-theme="dark"] .msg-body .mailer_htmlcontent {
  margin: 4px 0;
  padding: 16px;
  border-radius: 10px;
  background-color: #ffffff;
  color: #10121b;
}
:where(:root[data-theme="dark"] .msg-body .mailer_htmlcontent) a { color: #6d28d9; }
:where(:root[data-theme="dark"] .msg-body .mailer_htmlcontent) blockquote { color: #5f667a; border-left-color: #e9e0ff; }
:root[data-theme="dark"] mark { background-color: #fde68a; color: #10121b; }
/* Angular Material paints an off switch with background-50, our darkest tone */
:root[data-theme="dark"] md-switch:not(.md-checked) .md-thumb { background-color: var(--rt-text-2); }
:root[data-theme="dark"] md-switch:not(.md-checked) .md-bar { background-color: var(--rt-border-strong); }
/* Replies quote the original HTML with its own colours, so the editor stays white as well */
:root[data-theme="dark"] [ui-view="maileditor"] .ck.ck-editor__main > .ck-editor__editable,
:root[data-theme="dark"] .sg-mail-editor .ck-content {
  background-color: #ffffff;
  color: #10121b;
  --ck-color-base-background: #ffffff;
  --ck-color-text: #10121b;
}
:root[data-theme="dark"] .sg-mail-editor textarea.plain-text { color: var(--rt-text); }

/* -------------------------------------------------------------- small screens */
@media (max-width: 599px) {
  .view-detail md-card,
  .view-detail md-card.md-default-theme { border-radius: 0; border-width: 0; box-shadow: none; }
  .view-detail .sg-md-headline { font-size: 19px; line-height: 26px; }
}
/* iOS zooms into any field below 16px when it gets focus */
@media (pointer: coarse) {
  input:not([type="checkbox"]):not([type="radio"]):not([type="range"]),
  select,
  textarea { font-size: 16px !important; }
}
@media print {
  html, body { background: #fff; color: #000; }
}
`;
    (document.head || root).appendChild(style);
    window.rtSogoStyle = true;

    // SOGo's page sets maximum-scale=1, which blocks pinch-zoom on Android phones
    var viewport = document.querySelector('meta[name="viewport"]');
    if (viewport) viewport.setAttribute('content', 'width=device-width, initial-scale=1');

    // mailcow's patch to SOGo adds a button to the console labelled "mailcow Preferences" (the
    // second word is SOGo's own translation). Angular reads the label when it starts, which is
    // after this script, so rename it in the page templates and in the page itself.
    var brand = function (html) {
      return html.replace(/(<md-tooltip>\s*)mailcow /g, '$1RabbitTech Mail ');
    };
    Array.prototype.forEach.call(document.querySelectorAll('script[type="text/ng-template"]'), function (template) {
      if (template.text.indexOf('mailcow ') !== -1) template.text = brand(template.text);
    });
    Array.prototype.forEach.call(document.querySelectorAll('md-tooltip'), function (tooltip) {
      if (/^\s*mailcow /.test(tooltip.textContent)) tooltip.textContent = tooltip.textContent.replace('mailcow ', 'RabbitTech Mail ');
    });
  } catch (e) {
    if (window.console) console.warn('RabbitTech SOGo stylesheet not applied', e);
  }
})();

// Mail laid out like Gmail ----------------------------------------------------------------------
// The Mail screen's templates are <script type="text/ng-template"> blocks in the page, which
// Angular reads after this script. Before that, this section changes them:
//   search   SOGo's folder search moves into the top bar as a search box that is always there
//   compose  a Compose button at the top of the folder list, and one compose button on phones
//   rows     a star on every message and Archive, Delete and Read/Unread when the pointer is on it
//   back     the open message gets a back arrow and Archive; the list hides while one is open
//   layout   a top bar button to switch to SOGo's classic three-pane layout and back
// and its stylesheet (rt-gmail-mail below) does the rest: one-line rows, folders as pills, the
// list in a card, compose in a window at the bottom right. Each change first looks for all the
// markup it needs and is skipped (with a console warning) if a SOGo upgrade changed it; the html
// element carries an rt-gmail-<change> class for each change that was made, and the styles that
// depend on a change only apply with its class, so a mismatch leaves SOGo's own behaviour.
// localStorage rt_webmail_layout = "classic" turns all of it off except the switch back.
(function () {
  'use strict';
  var warn = function (what) { if (window.console) console.warn('RabbitTech mail layout: ' + what); };
  try {
    var body = document.body;
    if (!body || body.getAttribute('ng-app') !== 'SOGo.MailerUI' || !body.classList.contains('main')) return;
    var root = document.documentElement;
    var classic = false;
    try { classic = localStorage.getItem('rt_webmail_layout') === 'classic'; } catch (e) {}

    // SOGo's own translation of a label (the l() function and labels of the page), or the label
    var say = function (key) {
      try { return typeof window.l === 'function' ? window.l(key) : key; } catch (e) { return key; }
    };
    var esc = function (text) {
      return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    };

    window.rtSetWebmailLayout = function (layout) {
      try {
        if (layout === 'classic') localStorage.setItem('rt_webmail_layout', 'classic');
        else localStorage.removeItem('rt_webmail_layout');
      } catch (e) {}
      window.location.reload();
    };

    // Templates are parsed the way Angular parses them (innerHTML of an element), in a document
    // that never loads or runs anything, changed, and written back only if a change was made.
    var inert = document.implementation.createHTMLDocument('');
    var html = function (markup) {
      var t = inert.createElement('template');
      t.innerHTML = markup;
      return t.content;
    };
    var done = [];
    var rewrite = function (id, changes) {
      var script = document.getElementById(id), box, changed = false;
      if (!script) return warn(id + ' not found');
      box = inert.createElement('div');
      box.innerHTML = script.text;
      changes.forEach(function (change) {
        var ok = false;
        try { ok = change[1](box) === true; } catch (e) { warn(id + ': ' + change[0] + ': ' + e); }
        if (ok) {
          changed = true;
          if (done.indexOf(change[0]) < 0) done.push(change[0]);
        } else {
          warn(id + ': "' + change[0] + '" skipped, the template is not as expected');
        }
      });
      if (changed) script.text = box.innerHTML;
    };

    // ---- top bar (Mail screen and "No mailbox selected")
    var layoutSwitch = function (box) {
      var last = box.querySelector('md-toolbar.toolbar-main .sg-toolbar-group-last');
      if (!last) return false;
      var spacer = last.querySelector(':scope > div.hide-xs');
      var title = classic ? 'Switch to the new layout' : 'Switch to the classic layout';
      last.insertBefore(html(
        '<md-button class="md-icon-button rt-layout-switch" aria-label="' + title + '"' +
        ' onclick="rtSetWebmailLayout(\'' + (classic ? 'new' : 'classic') + '\')">' +
        '<md-icon>' + (classic ? 'view_list' : 'view_column') + '</md-icon>' +
        '<md-tooltip md-direction="bottom">' + title + '</md-tooltip></md-button>'), spacer);
      return true;
    };
    var brand = function (box) {
      var first = box.querySelector('md-toolbar.toolbar-main .sg-toolbar-group-1');
      var toggle = first && first.querySelector('md-button[ng-click="toggleLeft()"].show-gt-md md-icon');
      if (!toggle) return false;
      // The button that hides the folder list is Gmail's menu button
      toggle.textContent = 'menu';
      first.appendChild(html('<a class="rt-brand" ng-href="{{::activeUser.path.mail}}" aria-label="' + esc(say('Mail')) + '"></a>'));
      return true;
    };

    // ---- folder list: Compose at the top
    var composeLabel = window.UserLanguage === 'English' ? 'Compose' : say('Write');
    var compose = function (box) {
      var header = box.querySelector('md-sidenav.md-sidenav-left > md-toolbar');
      if (!header) return false;
      header.parentNode.insertBefore(html(
        '<div class="rt-compose-bar" flex-none="flex-none">' +
        '<button type="button" class="rt-compose" ng-click="rtCompose($event)">' +
        '<md-icon>edit</md-icon><span>' + esc(composeLabel) + '</span></button></div>'), header.nextSibling);
      return true;
    };
    // One compose button on phones instead of SOGo's two-button menu
    var fab = function (box) {
      var dial = box.querySelector('md-fab-speed-dial.sg-fab-bottom-center');
      var single = box.querySelector('md-button.md-fab.sg-fab-bottom-center[ng-if]');
      if (!dial || !single) return false;
      dial.parentNode.removeChild(dial);
      single.removeAttribute('ng-if');
      return true;
    };

    // ---- message list: search in the top bar
    var search = function (box) {
      var last = box.querySelector('md-toolbar.toolbar-main > .sg-toolbar-group-last');
      var form = box.querySelector('.view-list form[sg-search]');
      var input = form && form.querySelector('md-input-container > input[type="search"]');
      var cancel = form && form.querySelector('md-button[sg-search-cancel]');
      var tools = box.querySelector('.view-list md-toolbar > .md-toolbar-tools[ng-hide*="mode.search"]');
      // sgSearch wires up every md-button in the form as its cancel button, so there must be one
      if (!last || !input || !cancel || !tools || form.querySelectorAll('md-button').length !== 1) return false;
      form.removeAttribute('ng-show');
      form.classList.remove('md-toolbar-tools');
      form.classList.add('rt-search');
      form.insertBefore(html('<md-icon class="rt-search-icon" aria-hidden="true">search</md-icon>'), form.firstChild);
      // The back arrow that ended a search becomes the clear button after the text
      input.parentNode.parentNode.insertBefore(cancel, input.parentNode.nextSibling);
      cancel.setAttribute('ng-show', '$sgSearchController.searchText');
      cancel.setAttribute('aria-label', say('Close'));
      var icon = cancel.querySelector('md-icon');
      if (icon) icon.textContent = 'close';
      input.setAttribute('rt-search-reset', '');
      var more = form.querySelector('a.show-advanced-search md-icon');
      if (more) more.textContent = 'tune';
      last.parentNode.insertBefore(form, last);
      // The list toolbar no longer gives way to the search form; its search button goes
      tools.removeAttribute('ng-hide');
      var button = tools.querySelector('md-button[ng-click^="mailbox.searchMode"]');
      if (button) button.parentNode.removeChild(button);
      return true;
    };

    // ---- message list: star and actions in each row
    var rows = function (box) {
      var item = box.querySelector('md-list-item.sg-message-list-item[md-virtual-repeat]');
      var main = item && item.querySelector(':scope > .sg-message-list-item-main');
      var name = ((item && item.getAttribute('md-virtual-repeat')) || '').match(/^\s*([\w$]+)\s+in\s/);
      if (!main || !name) return false;
      var m = name[1];
      // Above the row's click target; mousedown stops here so a click doesn't start a drag
      item.insertBefore(html(
        '<div class="rt-star-cell" ng-mousedown="$event.stopPropagation()">' +
        '<button type="button" class="rt-star" ng-class="{ \'rt-on\': ' + m + '.isflagged }"' +
        ' ng-click="rtRow.star($event, ' + m + ')" aria-label="{{ ' + m + '.isflagged ? rtText.unflag : rtText.flag }}">' +
        '<md-icon>{{ ' + m + '.isflagged ? \'star\' : \'star_border\' }}</md-icon></button></div>'), main);
      item.appendChild(html(
        '<div class="rt-row-actions" ng-if="::!rtRow.virtual()" ng-mousedown="$event.stopPropagation()">' +
        '<button type="button" class="rt-act" ng-show="rtRow.canArchive(' + m + ')" ng-click="rtRow.archive($event, ' + m + ')"' +
        ' title="{{ ::rtText.archive }}" aria-label="{{ ::rtText.archive }}"><md-icon>archive</md-icon></button>' +
        '<button type="button" class="rt-act" ng-show="rtRow.canDelete(' + m + ')" ng-click="rtRow.remove($event, ' + m + ')"' +
        ' title="{{ ::rtText.remove }}" aria-label="{{ ::rtText.remove }}"><md-icon>delete</md-icon></button>' +
        '<button type="button" class="rt-act" ng-click="rtRow.read($event, ' + m + ')"' +
        ' title="{{ ' + m + '.isread ? rtText.unread : rtText.read }}" aria-label="{{ ' + m + '.isread ? rtText.unread : rtText.read }}">' +
        '<md-icon>{{ ' + m + '.isread ? \'markunread\' : \'drafts\' }}</md-icon></button></div>'));
      return true;
    };

    // ---- open message: back arrow and Archive
    var back = function (box) {
      var actions = box.querySelector('md-card-actions');
      var close = actions && actions.querySelector('md-button[ng-click="viewer.close()"]');
      var icon = close && close.querySelector('md-icon');
      if (!icon) return false;
      close.classList.remove('hide-gt-xs');
      close.classList.add('rt-back');
      close.setAttribute('aria-label', say('Back'));
      icon.textContent = 'arrow_back';
      // SOGo's button that hides the list; the list is already hidden while a message is open
      var center = actions.querySelector('md-button[ng-click^="toggleCenter"]');
      if (center) center.parentNode.removeChild(center);
      close.parentNode.insertBefore(html(
        '<md-button class="sg-icon-button rt-archive" ng-show="rtRow.canArchive(viewer.message)"' +
        ' ng-click="rtRow.archive($event, viewer.message)" aria-label="{{ ::rtText.archive }}">' +
        '<md-tooltip md-direction="bottom">{{ ::rtText.archive }}</md-tooltip><md-icon>archive</md-icon></md-button>'), close.nextSibling);
      return true;
    };

    var layout = ['layout', layoutSwitch];
    if (classic) {
      rewrite('UIxMailMainFrame', [layout]);
      rewrite('UIxMailFolderTemplate', [layout]);
      return;
    }

    // ---- Angular: the functions the new markup calls, and compose as a window. Registered
    // before any template changes, so if this fails nothing is changed.
    var mail = angular.module('SOGo.MailerUI');
    mail.directive('rtSearchReset', function () {
      // Emptying the search box shows the whole folder again
      return {
        restrict: 'A',
        link: function (scope, element) {
          element.on('input', function () {
            if (element.val()) return;
            scope.$evalAsync(function () {
              var list = window.$mailboxController;
              if (list && list.cancelSearch) list.cancelSearch();
            });
          });
        }
      };
    });

    mail.config(['$provide', function ($provide) {
      $provide.decorator('$mdDialog', ['$delegate', '$injector', function ($delegate, $injector) {
        var show = $delegate.show, open = 0;
        $delegate.show = function (options) {
          var o = options && options._options ? options._options : options;
          try {
            if (o && o.templateUrl === 'UIxMailEditor' && $injector.get('$mdMedia')('gt-sm')) {
              // A window at the bottom right; the mail behind it stays usable
              var index = open, showing = o.onShowing;
              o.hasBackdrop = false;
              o.disableParentScroll = false;
              o.multiple = true;
              o.onShowing = function (scope, element) {
                element.addClass('rt-float');
                element[0].style.setProperty('--rt-float-index', index);
                if (showing) return showing.apply(this, arguments);
              };
              open++;
              var closed = function () { open--; };
              var promise = show.apply(this, arguments);
              promise.then(closed, closed);
              return promise;
            }
            // Other dialogs would close an open compose window
            if (o && open > 0) o.multiple = true;
          } catch (e) {
            warn('compose window: ' + e);
          }
          return show.apply(this, arguments);
        };
        return $delegate;
      }]);
    }]);

    mail.run(['$rootScope', '$state', '$injector', function ($rootScope, $state, $injector) {
      var get = function (name) { return $injector.has(name) ? $injector.get(name) : null; };
      var Mailbox = get('Mailbox'), $mdToast = get('$mdToast'), $mdSidenav = get('$mdSidenav'), sgConstant = get('sgConstant');
      $rootScope.rtText = {
        archive: say('Archive'),
        remove: say('Delete'),
        read: say('Mark as Read'),
        unread: say('Mark as Unread'),
        flag: say('Flag'),
        unflag: say('Unflag')
      };
      var stop = function ($event) {
        if ($event) {
          $event.stopPropagation();
          $event.preventDefault();
        }
      };
      var toast = function (message) {
        if ($mdToast) $mdToast.show($mdToast.simple().textContent(message)
          .position(sgConstant ? sgConstant.toastPosition : 'bottom right').hideDelay(2000));
      };
      // mailcow creates an Archive folder (special-use \Archive) in every mailbox
      var archiveOf = function (message) {
        var account = message && message.$mailbox && message.$mailbox.$account;
        if (!account || !account.$getMailboxByPath) return null;
        if (account.$rtArchiveOf !== account.$mailboxes) {
          account.$rtArchiveOf = account.$mailboxes;
          account.$rtArchive = account.$getMailboxByPath('Archive') || null;
        }
        return account.$rtArchive;
      };
      // Removes a message from its folder; an open message closes and the list shows again
      var remove = function (message, action, done) {
        var folder = message.$mailbox;
        var open = folder.$selectedMessage == message.uid;
        action(folder).then(function () {
          if (open) $state.go('mail.account.mailbox');
          if (done) toast(done);
        }, function () {
          toast(say('Error'));
        });
      };
      $rootScope.rtRow = {
        virtual: function () { return !!(Mailbox && Mailbox.$virtualMode); },
        canArchive: function (message) {
          var archive = archiveOf(message);
          return !!archive && message.$mailbox.path !== archive.path && !this.virtual();
        },
        // In Trash, SOGo deletes for good; that stays behind its confirmation in the message view
        canDelete: function (message) { return !!(message && message.$mailbox) && message.$mailbox.type !== 'trash'; },
        star: function ($event, message) {
          stop($event);
          if (message && message.toggleFlag) message.toggleFlag();
        },
        read: function ($event, message) {
          stop($event);
          if (message && message.toggleRead) message.toggleRead();
        },
        remove: function ($event, message) {
          stop($event);
          if (!this.canDelete(message)) return;
          remove(message, function (folder) { return folder.$deleteMessages([message]); });
        },
        archive: function ($event, message) {
          stop($event);
          if (!this.canArchive(message)) return;
          var archive = archiveOf(message);
          remove(message, function (folder) { return folder.$moveMessages([message], '/' + archive.id); },
            say('%{0} message(s) moved').replace('%{0}', '1'));
        }
      };
      $rootScope.rtCompose = function ($event) {
        var list = window.$mailboxController;
        if (list && list.newMessage) list.newMessage($event);
        try {
          var nav = $mdSidenav && $mdSidenav('left');
          if (nav && !nav.isLockedOpen()) nav.close();
        } catch (e) {}
      };
    }]);

    rewrite('UIxMailMainFrame', [layout, ['brand', brand], ['compose', compose]]);
    rewrite('UIxMailFolderTemplate', [layout, ['brand', brand], ['search', search], ['rows', rows], ['fab', fab]]);
    rewrite('UIxMailViewTemplate', [['back', back]]);
    root.classList.add('rt-gmail');
    done.forEach(function (change) { root.classList.add('rt-gmail-' + change); });

    var style = document.createElement('style');
    style.id = 'rabbittech-sogo-mail';
    style.textContent = String.raw`
:root.rt-gmail {
  --rt-g-search: #eceef5;
  --rt-g-row: var(--rt-surface-2);
  --rt-g-row-unread: var(--rt-surface);
  --rt-g-lift: 0 1px 2px rgba(16, 18, 40, .16), 0 1px 3px 1px rgba(16, 18, 40, .1);
  --rt-g-gap: 16px;
  --rt-g-left: 0;
}
:root.rt-gmail[data-theme="dark"] {
  --rt-g-search: #1c212c;
  --rt-g-row: var(--rt-surface);
  --rt-g-row-unread: var(--rt-surface-2);
  --rt-g-lift: 0 1px 2px rgba(0, 0, 0, .5), 0 1px 4px 1px rgba(0, 0, 0, .35);
}
/* No folder list beside the mail (narrow window, or hidden with the menu button) */
html.rt-gmail body:not(:has(md-sidenav.md-locked-open:not(.sg-close))) { --rt-g-left: 1; }
@media (max-width: 599px) {
  :root.rt-gmail { --rt-g-gap: 0px; }
}

/* ------------------------------------------------------------ page and folders */
html.rt-gmail body,
html.rt-gmail main.view { background-color: var(--rt-bg); }
html.rt-gmail md-sidenav.md-sidenav-left,
html.rt-gmail md-sidenav.md-sidenav-left > md-content { background-color: var(--rt-bg) !important; box-shadow: none; }
html.rt-gmail md-sidenav.md-sidenav-left:not(.md-locked-open) { box-shadow: var(--rt-shadow-lg); }
@media (min-width: 960px) {
  html.rt-gmail md-sidenav.md-sidenav-left.md-locked-open { flex: 0 0 256px; width: 256px; min-width: 256px; max-width: 256px; }
  html.rt-gmail md-sidenav.md-sidenav-left.md-locked-open.sg-close { margin-right: -256px; }
}
/* The top of the folder list lines up with the top bar: logo and settings, the user is in the account row */
html.rt-gmail md-sidenav > md-toolbar.md-tall:not(.md-menu-toolbar),
html.rt-gmail md-sidenav > md-toolbar.md-tall.md-default-theme:not(.md-menu-toolbar) {
  height: 64px;
  min-height: 64px;
  max-height: 64px;
  justify-content: center;
  padding: 0 8px 0 16px;
  background-color: transparent;
  box-shadow: none;
}
html.rt-gmail md-sidenav > md-toolbar.md-tall::before { top: 15px; left: 22px; }
html.rt-gmail md-sidenav > md-toolbar.md-tall > sg-avatar-image,
html.rt-gmail md-sidenav > md-toolbar.md-tall > div[layout="row"] > div { display: none; }
html.rt-gmail md-sidenav > md-toolbar.md-tall > div[layout="row"] { justify-content: flex-end; padding-left: 0; }

.rt-compose-bar { padding: 4px 0 12px 8px; }
.rt-compose {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  height: 56px;
  min-width: 140px;
  padding: 0 24px 0 18px;
  border: 0;
  border-radius: 16px;
  background-color: var(--rt-primary-soft-2);
  color: var(--rt-primary-text);
  font: 600 14px/1 var(--rt-font);
  cursor: pointer;
  transition: box-shadow .15s;
}
.rt-compose:hover { box-shadow: var(--rt-g-lift); }
html .rt-compose md-icon { color: inherit; margin: 0; }

/* Account row and quota, quieter */
html.rt-gmail md-sidenav .sg-account-section > md-list > md-list-item { padding-left: 12px; }
/* Folders: pills against the left edge, unread counts as bold numbers */
html.rt-gmail md-sidenav.md-sidenav-left md-list-item.sg-mailbox-list-item.md-clickable {
  margin: 0 12px 0 0;
  padding-left: 12px;
  border-radius: 0 999px 999px 0;
}
html.rt-gmail md-sidenav md-list-item.sg-mailbox-list-item.md-background.md-hue-1.md-bg {
  background-color: var(--rt-primary-soft-2) !important;
}
html.rt-gmail md-sidenav md-list-item.sg-mailbox-list-item .sg-counter-badge,
html.rt-gmail md-sidenav md-list-item.sg-mailbox-list-item.md-bg .sg-counter-badge {
  min-width: 0;
  padding: 0 0 0 8px;
  background-color: transparent;
  color: inherit;
  font-size: 12px;
  font-weight: 700;
}

/* ---------------------------------------------------------------- top bar */
html.rt-gmail md-toolbar.toolbar-main:not(.md-menu-toolbar),
html.rt-gmail md-toolbar.toolbar-main.md-default-theme:not(.md-menu-toolbar) {
  background-color: var(--rt-bg);
  box-shadow: none;
}
html.rt-gmail .toolbar-main > .md-toolbar-tools { flex: 0 0 auto; width: auto; }
html.rt-gmail .toolbar-main > .sg-toolbar-group-1 { padding: 0 4px 0 8px; }
html.rt-gmail .toolbar-main > .sg-toolbar-group-last { padding: 0 8px 0 4px; }
html.rt-gmail .rt-brand {
  display: none;
  flex: none;
  width: 150px;
  height: 32px;
  margin: 0 8px 0 4px;
  background: var(--rt-logo) no-repeat left center / contain;
}
@media (min-width: 600px) {
  html.rt-gmail body:not(:has(md-sidenav.md-locked-open:not(.sg-close))) .rt-brand { display: block; }
}

/* Search box */
/* SOGo orders the top bar groups 1 and 3; the search box goes between them */
html.rt-gmail-search .toolbar-main > form.rt-search {
  position: relative;
  display: flex;
  order: 2;
  flex: 1 1 auto;
  align-items: center;
  min-width: 0;
  max-width: 720px;
  height: 48px;
  margin: 0 auto 0 8px;
  padding: 0 4px 0 6px;
  border-radius: 24px;
  background-color: var(--rt-g-search);
  transition: background-color .15s, box-shadow .15s;
}
html.rt-gmail-search .toolbar-main > form.rt-search:focus-within { background-color: var(--rt-surface); box-shadow: var(--rt-g-lift); }
html.rt-gmail-search form.rt-search md-icon,
html.rt-gmail-search form.rt-search .md-button md-icon { color: var(--rt-muted); }
html.rt-gmail-search form.rt-search .rt-search-icon { flex: none; margin: 0 6px 0 8px; }
html.rt-gmail-search form.rt-search md-input-container { margin: 0; padding: 0; }
html.rt-gmail-search form.rt-search md-input-container.md-flex { flex: 1 1 auto; min-width: 0; }
html.rt-gmail-search form.rt-search md-input-container .md-errors-spacer { display: none; }
html.rt-gmail-search form.rt-search md-input-container .md-input {
  height: 46px;
  padding: 0 4px;
  border: 0;
  background: transparent;
  color: var(--rt-text);
  font-size: 16px;
}
html.rt-gmail-search form.rt-search md-input-container .md-input::placeholder { color: var(--rt-muted); opacity: 1; }
/* Angular Material colours fields inside a toolbar for a dark toolbar (white text, white
   placeholder, light underline), with more specific selectors than the ones above */
html.rt-gmail-search md-toolbar.toolbar-main form.rt-search md-input-container[md-no-float] .md-input,
html.rt-gmail-search md-toolbar.toolbar-main form.rt-search md-input-container .md-input {
  padding: 0 4px !important;
  border: 0 !important;
  color: var(--rt-text) !important;
  caret-color: var(--rt-primary);
}
html.rt-gmail-search md-toolbar.toolbar-main form.rt-search md-input-container[md-no-float] .md-input::placeholder,
html.rt-gmail-search md-toolbar.toolbar-main form.rt-search md-input-container[md-no-float].md-input-focused .md-input::placeholder {
  color: var(--rt-muted) !important;
  opacity: 1;
}
/* "Enter at least N characters", under the box; the container is there even without a message */
html.rt-gmail-search form.rt-search [ng-messages] { position: absolute; z-index: 2; top: 52px; left: 48px; }
html.rt-gmail-search form.rt-search [ng-messages] > [ng-message] {
  padding: 4px 10px;
  border-radius: 6px;
  background-color: var(--rt-tooltip);
  color: var(--rt-tooltip-text);
  font-size: 12px;
}
html.rt-gmail-search form.rt-search md-input-container[flex] { flex: 0 0 auto; width: 168px; max-width: 168px; margin: 0 4px; }
html.rt-gmail-search form.rt-search md-select { width: 100%; margin: 0; }
html.rt-gmail-search md-toolbar.toolbar-main form.rt-search md-select .md-select-value {
  min-width: 0;
  min-height: 32px;
  padding: 0 4px 0 8px;
  border: 0 !important;
  border-radius: 8px;
  color: var(--rt-muted) !important;
  font-size: 13px;
}
html.rt-gmail-search md-toolbar.toolbar-main form.rt-search md-select .md-select-value .md-select-icon { color: var(--rt-muted); }
html.rt-gmail-search md-toolbar.toolbar-main form.rt-search md-select:not([disabled]):focus .md-select-value { color: var(--rt-text) !important; padding-bottom: 0; }
html.rt-gmail-search form.rt-search .md-button,
html.rt-gmail-search form.rt-search a.sg-icon-button {
  flex: none;
  width: 40px;
  height: 40px;
  min-width: 40px;
  margin: 0;
  padding: 8px;
  border-radius: 50%;
  line-height: 24px;
}
html.rt-gmail-search form.rt-search a.sg-icon-button:hover { background-color: var(--rt-hover); }
@media (max-width: 959px) {
  html.rt-gmail-search form.rt-search md-input-container[flex] { display: none; }
}
/* Phones: the search box gets its own row under the menu and app buttons */
@media (max-width: 759px) {
  html.rt-gmail-search md-toolbar.toolbar-main:not(.md-menu-toolbar) { flex-wrap: wrap; }
  html.rt-gmail-search .toolbar-main > .sg-toolbar-group-last { margin-left: auto; }
  html.rt-gmail-search .toolbar-main > form.rt-search { order: 4; flex: 1 0 calc(100% - 24px); max-width: none; margin: 0 12px 8px; }
}

/* ------------------------------------------------------------ message list */
html.rt-gmail [ui-view="mailbox"] .sg-block-print {
  position: relative;
  padding: 0 var(--rt-g-gap) var(--rt-g-gap) calc(var(--rt-g-gap) * var(--rt-g-left));
}
html.rt-gmail .view-list {
  border-radius: 16px;
  box-shadow: none;
  overflow: hidden;
}
@media (max-width: 599px) {
  html.rt-gmail .view-list { border-radius: 0; }
}
html.rt-gmail .view-list > md-toolbar:not(.md-menu-toolbar) { min-height: 48px; }
html.rt-gmail .view-list > md-toolbar > .md-toolbar-tools,
html.rt-gmail .view-list > md-toolbar > form.md-toolbar-tools { height: 48px; max-height: 48px; padding: 0 8px 0 12px; }
html.rt-gmail .view-list .sg-folder-name { margin: 0 4px; font-size: 15px; }
html.rt-gmail .view-list md-content > md-subheader,
html.rt-gmail .view-list md-subheader.md-default-theme { font-size: 11.5px; }

html.rt-gmail md-list-item.sg-message-list-item { background-color: var(--rt-g-row); }
html.rt-gmail md-list-item.sg-message-list-item.unread { background-color: var(--rt-g-row-unread); }
html.rt-gmail md-list-item.sg-message-list-item.unread::before { display: none; }
html.rt-gmail md-list-item.sg-message-list-item:not(.md-bg):hover { z-index: 2; background-color: var(--rt-g-row); box-shadow: var(--rt-g-lift); }
html.rt-gmail md-list-item.sg-message-list-item.unread:not(.md-bg):hover { background-color: var(--rt-g-row-unread); }
html.rt-gmail md-list-item.sg-message-list-item:not(.md-bg):has(.sg-avatar-selected) { background-color: var(--rt-primary-soft); }

/* Wide windows: one line per message, the avatar is a checkbox */
@media (min-width: 960px) {
  html.rt-gmail md-list-item.sg-message-list-item .sg-message-list-item-main { display: flex; align-items: center; min-width: 0; }
  html.rt-gmail md-list-item.sg-message-list-item:not(.sg-skeleton) .sg-tile-content,
  html.rt-gmail md-list-item.sg-message-list-item:not(.sg-skeleton) .sg-tile-content > .sg-md-subhead,
  html.rt-gmail md-list-item.sg-message-list-item:not(.sg-skeleton) .sg-tile-content > .sg-md-body { display: contents; }
  html.rt-gmail md-list-item.sg-message-list-item .sg-md-subhead > div:first-child {
    order: 1;
    flex: 0 0 200px;
    width: 200px;
    padding-right: 20px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  html.rt-gmail md-list-item.sg-message-list-item .sg-md-body > .sg-tile-btn { order: 2; margin: 0 6px 0 -14px !important; }
  html.rt-gmail md-list-item.sg-message-list-item .sg-md-body > .sg-category-dot-container { order: 3; }
  html.rt-gmail md-list-item.sg-message-list-item .sg-md-body > .sg-tile-subject {
    order: 4;
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 14px;
    color: var(--rt-text-2);
  }
  html.rt-gmail md-list-item.sg-message-list-item.unread .sg-md-body > .sg-tile-subject { color: var(--rt-text); }
  html.rt-gmail md-list-item.sg-message-list-item .sg-md-body > .sg-tile-size { display: none; }
  html.rt-gmail md-list-item.sg-message-list-item .sg-tile-icons { order: 5; flex-direction: row; width: auto; height: auto; padding-left: 8px; }
  html.rt-gmail-rows md-list-item.sg-message-list-item .sg-tile-icons .sg-icon-star { display: none; }
  html.rt-gmail md-list-item.sg-message-list-item .sg-md-subhead > .sg-tile-date {
    order: 6;
    flex: 0 0 auto;
    min-width: 64px;
    padding-left: 12px;
    text-align: right;
    font-size: 12.5px;
  }
  html.rt-gmail .view-list md-list-item.sg-message-list-item .sg-avatar-selectable {
    display: flex;
    align-items: center;
    height: 100%;
    font-family: "Material Icons";
    font-size: 40px;
  }
  html.rt-gmail .view-list md-list-item.sg-message-list-item .sg-avatar-selectable::before { content: "\e835"; margin: 0 8px; font-size: 20px; color: var(--rt-subtle); }
  html.rt-gmail .view-list md-list-item.sg-message-list-item .sg-avatar-selectable.sg-avatar-selected::before { content: "\e834"; color: var(--rt-primary); }
  html.rt-gmail .view-list md-list-item.sg-message-list-item .sg-avatar-selectable > * { display: none; }
}

/* Star, and the actions that take the date's place under the pointer */
html.rt-gmail-rows .rt-star-cell,
html.rt-gmail-rows .rt-row-actions { display: none; }
html.rt-gmail-rows .rt-star,
html.rt-gmail-rows .rt-act {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--rt-subtle);
  cursor: pointer;
}
html.rt-gmail-rows .rt-star md-icon,
html.rt-gmail-rows .rt-act md-icon { color: inherit; }
html.rt-gmail-rows .rt-star:hover,
html.rt-gmail-rows .rt-act:hover { background-color: var(--rt-hover); color: var(--rt-text); }
html.rt-gmail-rows .rt-star.rt-on { color: var(--rt-flag); }
@media (min-width: 960px) {
  html.rt-gmail-rows .rt-star-cell { position: relative; z-index: 2; display: flex; flex: none; margin: 0 6px 0 -4px; }
  html.rt-gmail-rows .rt-star { width: 32px; height: 32px; }
  html.rt-gmail-rows .rt-star md-icon { font-size: 20px; min-width: 20px; min-height: 20px; width: 20px; height: 20px; }
}
@media (min-width: 960px) and (hover: hover) {
  html.rt-gmail-rows md-list-item.sg-message-list-item:hover .rt-row-actions {
    position: absolute;
    z-index: 2;
    top: 0;
    right: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    padding: 0 8px 0 4px;
    background-color: var(--rt-g-row);
  }
  html.rt-gmail-rows md-list-item.sg-message-list-item.unread:hover .rt-row-actions { background-color: var(--rt-g-row-unread); }
  html.rt-gmail-rows md-list-item.sg-message-list-item:has(.sg-avatar-selected):hover .rt-row-actions { background-color: var(--rt-primary-soft); }
  html.rt-gmail-rows md-list-item.sg-message-list-item:hover .sg-tile-date,
  html.rt-gmail-rows md-list-item.sg-message-list-item:hover .sg-tile-icons { visibility: hidden; }
  html.rt-gmail-rows .rt-act { width: 40px; height: 40px; }
  html.rt-gmail-rows .rt-act md-icon { font-size: 20px; min-width: 20px; min-height: 20px; width: 20px; height: 20px; }
}

/* ------------------------------------------- the open message takes the list's place */
html.rt-gmail-back .view-list,
html.rt-gmail-back .view-list.view-list--close { flex: 1 1 auto; max-width: none; margin-right: 0; transform: none; }
html.rt-gmail-back #detailView.view-detail {
  position: absolute;
  z-index: 11;
  top: 0;
  right: var(--rt-g-gap);
  bottom: var(--rt-g-gap);
  left: calc(var(--rt-g-gap) * var(--rt-g-left));
  border-radius: 16px;
  background-color: var(--rt-surface) !important;
}
html.rt-gmail-back #detailView.view-detail.sg-close { display: none; }
html.rt-gmail-back .sg-block-print:has(> #detailView:not(.sg-close)) > .view-list { visibility: hidden; }
html.rt-gmail-back .sg-block-print:has(> #detailView:not(.sg-close)) > .sg-fab-bottom-center { display: none; }
html.rt-gmail-back .view-detail md-card,
html.rt-gmail-back .view-detail md-card.md-default-theme { border: 0; border-radius: 0; box-shadow: none; }
@media (max-width: 599px) {
  html.rt-gmail-back #detailView.view-detail { border-radius: 0; }
}

/* Compose button on narrow windows; the Compose pill replaces it when the folder list shows */
html.rt-gmail .sg-fab-bottom-center,
html.rt-gmail .sg-fab-bottom-center.sg-center-close,
html.rt-gmail .sg-fab-bottom-center.sg-sidenav-close { top: auto; right: calc(var(--rt-g-gap) + 16px); bottom: calc(var(--rt-g-gap) + 16px); left: auto; }
html.rt-gmail-compose body:has(md-sidenav.md-locked-open:not(.sg-close)) .sg-fab-bottom-center { display: none; }

/* ---------------------------------------------- compose window at the bottom right */
.md-dialog-container.rt-float {
  justify-content: flex-end;
  align-items: flex-end;
  padding-right: 24px;
  pointer-events: none;
}
.md-dialog-container.rt-float > md-dialog.sg-mail-editor {
  flex: none;
  width: 560px;
  max-width: calc(100vw - 48px);
  height: min(640px, calc(100vh - 72px));
  min-height: 0;
  max-height: none;
  margin-right: calc(var(--rt-float-index, 0) * 576px);
  border-radius: 14px 14px 0 0;
  border-bottom: 0;
  box-shadow: 0 8px 10px 1px rgba(16, 18, 40, .14), 0 3px 14px 2px rgba(16, 18, 40, .12), 0 5px 5px -3px rgba(16, 18, 40, .2);
  pointer-events: auto;
}
/* SOGo's expand button makes it large and centred */
.md-dialog-container.rt-float:has(> md-dialog.sg-mail-editor.flex-100) { justify-content: center; align-items: center; padding: 0; }
.md-dialog-container.rt-float > md-dialog.sg-mail-editor.flex-100 {
  width: min(1100px, calc(100vw - 96px));
  height: calc(100vh - 96px);
  margin: 0;
  border-radius: 14px;
  border-bottom: 1px solid var(--rt-border);
}
`;
    (document.head || root).appendChild(style);
  } catch (e) {
    warn('not applied: ' + e);
  }
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

// Change the visible font-size in the editor, this does not change the font of a html message by default.
// CKEditor 4 only: SOGo 5 ships CKEditor 5, which has no CKEDITOR global (the compose font size is
// set in the stylesheet above). Unguarded, this line threw an error on every page.
if (window.CKEDITOR) {
  CKEDITOR.addCss("body {font-size: 16px !important}");
}

// Enable scayt by default
//CKEDITOR.config.scayt_autoStartup = true;
