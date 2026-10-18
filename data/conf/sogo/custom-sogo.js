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
/* Material Icons Outlined with two extra names (scripts/build-webmail-icons.py); lighter than
   SOGo's filled icons and drawn like the console's */
@font-face {
  font-family: "RabbitTech Icons";
  font-style: normal;
  font-weight: 400;
  font-display: block;
  src: url("/fonts/rabbittech-icons-outlined.woff2") format("woff2");
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
html .material-icons { font-family: "RabbitTech Icons", "Material Icons"; }
/* Filled where filling means something: a flagged star; avatars keep SOGo's person */
html md-icon.sg-icon-star,
html sg-avatar-image md-icon { font-family: "Material Icons"; }
/* The big faded icon SOGo puts behind search toolbars */
md-icon.sg-icon-toolbar-bg { display: none; }
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
:root[data-theme="dark"] .sg-has-form-sections { background-color: var(--rt-bg) !important; }
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

    // Installable webmail: the app's manifest (data/web/webmail.webmanifest, opens /webmail), the
    // iPhone home screen icon, and a window title bar in the page's own light or dark colour
    var head = document.head || root;
    var meta = function (tag, attrs) {
      var el = document.createElement(tag);
      Object.keys(attrs).forEach(function (name) { el.setAttribute(name, attrs[name]); });
      head.appendChild(el);
    };
    if (!document.querySelector('link[rel="manifest"]')) {
      meta('link', { rel: 'manifest', href: '/webmail.webmanifest' });
      meta('link', { rel: 'apple-touch-icon', href: '/img/app/apple-touch-icon.png' });
      meta('meta', { name: 'apple-mobile-web-app-title', content: 'Webmail' });
      meta('meta', { name: 'mobile-web-app-capable', content: 'yes' });
      meta('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' });
    }
    if (!document.querySelector('meta[name="theme-color"]')) meta('meta', { name: 'theme-color', content: '' });
    document.querySelector('meta[name="theme-color"]').setAttribute('content', dark ? '#0b0d12' : '#f5f6fa');

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

// Mail, Calendar, Contacts and Settings laid out like Gmail -----------------------------------------
// Each app's templates are <script type="text/ng-template"> blocks in the page, which Angular
// reads after this script. Before that, this section changes them. In all four apps:
//   brand    a menu button and the logo at the left of the top bar
//   layout   a top bar button to switch to SOGo's classic layout and back
// Mail, Calendar and Contacts:
//   search   SOGo's search moves into the top bar as a search box that is always there
// Mail:
//   compose  a Compose button at the top of the folder list, and one compose button on phones
//   rows     a star on every message and Archive, Delete and Read/Unread when the pointer is on it
//   back     the open message gets a back arrow and Archive; the list hides while one is open
//   sort     the order in words ("Subject A–Z"), and the sort menu says Date received and Date
//            sent (in English; other languages keep SOGo's)
//   count    no line above the list: the count goes into the list's header, and a filter or an
//            order other than newest first shows there as a chip whose × undoes it
// Mail's compose window (UIxMailEditor, which SOGo fetches over HTTP; an $http interceptor
// changes its markup on the way in, before $templateCache keeps it):
//   composer a slim bar (the subject or "New Message", minimise, full screen, close), then From
//            (only with more than one identity), To with Cc and Bcc on its line, and Subject
//   actions  a bottom bar: Send as a pill, Aa to show or hide the formatting bar (CKEditor's
//            toolbar, moved above it), attach, CKEditor's link, emoji and image buttons, and
//            SOGo's options with Save draft
// Calendar and Contacts:
//   create   a Create button at the top of the sidebar: Event or Task, Contact or List
//   colors   (Calendar) each calendar's colour as --rt-folder, for dots instead of filled cards
// Settings (SOGo's Preferences):
//   toolbar  the top bar is the other apps' (toolbar-main, without SOGo's tall bar and date),
//            with the page's title
//   save     Save leaves the top bar for a bar under the page that shows while there are
//            unsaved changes
//   here     the settings button by the logo shows as the current place
// The layout switch on Settings is a link (?rt-layout=classic|new) that SOGo's own
// unsaved-changes prompt handles like its other top bar buttons.
// The stylesheets (rabbittech-sogo-layout for all four, then one per app) do the rest:
// sidebar items as pills, the list in a card, compose in a window at the bottom right, the
// calendar's header, the contact card, each settings tab on a card. Each change first looks for
// all the markup it needs and is skipped (with a console warning) if a SOGo upgrade changed it;
// the html element carries an rt-gmail-<change> class for each change that was made, and the
// styles that depend on a change only apply with its class, so a mismatch leaves SOGo's own
// behaviour. Other templates SOGo
// fetches over HTTP (the calendar's views, the event and contact editors, the account and
// filter dialogs of Settings) are only styled.
// localStorage rt_webmail_layout = "classic" turns all of it off, in all four apps, except the
// switch back.
(function () {
  'use strict';
  var body = document.body;
  var app = body && body.classList.contains('main') &&
    { 'SOGo.MailerUI': 'mail', 'SOGo.SchedulerUI': 'calendar', 'SOGo.ContactsUI': 'contacts', 'SOGo.PreferencesUI': 'prefs' }[body.getAttribute('ng-app')];
  var warn = function (what) { if (window.console) console.warn('RabbitTech ' + app + ' layout: ' + what); };
  try {
    if (!app) return;
    var root = document.documentElement;
    var classic = false;
    // Settings' layout switch is a link to the page with ?rt-layout=classic or ?rt-layout=new
    var asked = /[?&]rt-layout=(classic|new)(?=&|$)/.exec(window.location.search);
    if (asked) {
      try {
        if (asked[1] === 'classic') localStorage.setItem('rt_webmail_layout', 'classic');
        else localStorage.removeItem('rt_webmail_layout');
      } catch (e) {}
      try {
        var query = window.location.search.replace(/([?&])rt-layout=[^&]*(&|$)/, '$1').replace(/[?&]$/, '');
        window.history.replaceState(window.history.state, '', window.location.pathname + query + window.location.hash);
      } catch (e) {}
    }
    try { classic = localStorage.getItem('rt_webmail_layout') === 'classic'; } catch (e) {}

    // SOGo's own translation of a label (the l() function and labels of the page), or the label
    var say = function (key) {
      try { return typeof window.l === 'function' ? window.l(key) : key; } catch (e) { return key; }
    };
    var esc = function (text) {
      return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    };
    var english = window.UserLanguage === 'English';

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
    // The changes to one template's markup; returns the new markup, or null if none was made.
    // applied(name) runs for each change that was made.
    var change = function (id, markup, changes, applied) {
      var box = inert.createElement('div'), changed = false;
      box.innerHTML = markup;
      changes.forEach(function (change) {
        var ok = false;
        try { ok = change[1](box) === true; } catch (e) { warn(id + ': ' + change[0] + ': ' + e); }
        if (ok) {
          changed = true;
          applied(change[0]);
        } else {
          warn(id + ': "' + change[0] + '" skipped, the template is not as expected');
        }
      });
      return changed ? box.innerHTML : null;
    };
    var rewrite = function (id, changes) {
      var script = document.getElementById(id);
      if (!script) return warn(id + ' not found');
      var markup = change(id, script.text, changes, function (name) {
        if (done.indexOf(name) < 0) done.push(name);
      });
      if (markup !== null) script.text = markup;
    };

    // ---- top bar (every screen of the app). Settings' bar is found by its place, so the
    // switch is there in the classic layout too, where it isn't a toolbar-main.
    var topBar = app === 'prefs' ? 'form[name="preferencesForm"] > section > md-toolbar' : 'md-toolbar.toolbar-main';
    var layoutSwitch = function (box) {
      var last = box.querySelector(topBar + ' .sg-toolbar-group-last');
      if (!last) return false;
      var spacer = last.querySelector(':scope > div.hide-xs');
      var title = classic ? 'Switch to the new layout' : 'Switch to the classic layout';
      var to = classic ? 'new' : 'classic';
      // On Settings, a link that SOGo's prompt about unsaved changes handles before it is followed
      var action = app === 'prefs'
        ? ' href="?rt-layout=' + to + '" onclick="this.href = \'?rt-layout=' + to + '\' + location.hash"' +
          ' ng-click="app.confirmChanges($event, preferencesForm)"'
        : ' onclick="rtSetWebmailLayout(\'' + to + '\')"';
      last.insertBefore(html(
        '<md-button class="md-icon-button rt-layout-switch" aria-label="' + title + '"' + action + '>' +
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
      // The logo leads to the app; from Settings, to Mail
      var to = app === 'prefs' ? 'mail' : app;
      first.appendChild(html('<a class="rt-brand" ng-href="{{::activeUser.path.' + to + '}}" aria-label="' +
        esc(say({ mail: 'Mail', calendar: 'Calendar', contacts: 'Address Book' }[to])) + '"' +
        (app === 'prefs' ? ' ng-click="app.confirmChanges($event, preferencesForm)"' : '') + '></a>'));
      // Clearer icons for the console link (a wrench) and signing out (a power symbol)
      Array.prototype.forEach.call(box.querySelectorAll('md-toolbar.toolbar-main .sg-toolbar-group-last md-icon'), function (icon) {
        var name = icon.textContent.trim();
        if (name === 'build') icon.textContent = 'manage_accounts';
        else if (name === 'settings_power') icon.textContent = 'logout';
      });
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
    // ---- message list: the order in words. SOGo's own label stays as the fallback, for other
    // languages and sort keys rtSortText doesn't know.
    var sortLine = function (box) {
      var label = box.querySelector('#messagesList md-subheader span[ng-bind="mailbox.sort() | loc"]');
      if (!label) return false;
      label.setAttribute('ng-bind', 'rtSortText(mailbox.service.$query.sort, mailbox.ascending()) || (mailbox.sort() | loc)');
      if (window.UserLanguage === 'English') {
        [['arrival', 'Date received'], ['date', 'Date sent']].forEach(function (item) {
          var button = box.querySelector('md-menu-item > md-button[ng-click="mailbox.sort(\'' + item[0] + '\')"]');
          var icon = button && button.querySelector(':scope > md-icon');
          var text = icon && icon.nextSibling;
          if (!text || text.nodeType !== 3) return;
          text.nodeValue = ' ' + item[1] + ' ';
          icon.setAttribute('aria-label', item[1]);
        });
      }
      return true;
    };
    // ---- message list: no line above it. The count moves into the list's header, like Gmail's,
    // and what changes the view (Unread or Flagged only, labels, an order other than newest
    // first) shows there as a chip that undoes it. Runs after sort, whose words it reuses.
    var count = function (box) {
      var line = box.querySelector('#messagesList > md-subheader');
      var total = line && line.querySelector('div[ng-switch="mailbox.service.selectedFolder.getLength()"]');
      var number = total && total.querySelector('span[ng-bind="mailbox.service.selectedFolder.getLength()"]');
      var unread = line && line.querySelector('span[ng-show="mailbox.selectedFolder.$unseenOnly"]');
      var flagged = line && line.querySelector('span[ng-show="mailbox.selectedFolder.$flaggedOnly"]');
      var order = line && line.querySelector('span[ng-bind^="rtSortText("], span[ng-bind="mailbox.sort() | loc"]');
      var name = box.querySelector('.view-list md-toolbar > .md-toolbar-tools > a.sg-folder-name');
      var advanced = box.querySelector('.view-list md-toolbar.advanced-search-clickable-toolbar form > a.show-advanced-search');
      if (!number || !unread || !flagged || !order || !name || !advanced) return false;
      var f = 'mailbox.selectedFolder';
      var chip = function (show, click, inside, title) {
        return '<button type="button" class="rt-chip" ng-show="' + show + '" ng-click="' + click + '" title="' + esc(title) + '">' +
          inside + '<md-icon class="rt-chip-x" aria-hidden="true">close</md-icon></button>';
      };
      var words = order.getAttribute('ng-bind');
      var clear = english ? 'Show all messages' : say('Close');
      name.parentNode.insertBefore(html('<div class="rt-list-chips">' +
        chip(f + '.$unseenOnly', 'rtFilter.clear(' + f + ', \'unseen\')', '<span>' + esc(unread.textContent.trim()) + '</span>', clear) +
        chip(f + '.$flaggedOnly', 'rtFilter.clear(' + f + ', \'flagged\')', '<span>' + esc(flagged.textContent.trim()) + '</span>', clear) +
        chip(f + '.filteredByLabel()', 'rtFilter.clear(' + f + ', \'labels\')',
          '<md-icon aria-hidden="true">label_outline</md-icon><span ng-bind="rtFilter.labels(' + f + ')"></span>', clear) +
        // Words say the direction ("Subject A–Z"); SOGo's own label needs an arrow
        chip('!rtFilter.usualOrder()', 'rtFilter.newestFirst(' + f + ')',
          '<md-icon aria-hidden="true" ng-if="!rtSortText(mailbox.service.$query.sort, mailbox.ascending())">{{ mailbox.ascending() ? \'arrow_upward\' : \'arrow_downward\' }}</md-icon>' +
          '<span ng-bind="' + esc(words) + '"></span>', english ? 'Back to newest first' : say('Close')) +
        '</div>'), name.nextSibling);
      // SOGo's count with thousands separators ("2,254 messages"), in the header and in
      // advanced search's bar
      number.setAttribute('ng-bind', 'mailbox.service.selectedFolder.getLength() | number');
      total.classList.add('rt-list-count');
      advanced.parentNode.insertBefore(total.cloneNode(true), advanced);
      name.parentNode.insertBefore(total, name.nextSibling.nextSibling);
      line.parentNode.removeChild(line);
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

    // ---- the list's search in the top bar. The list's own search button goes; the input empties
    // the search (Mail: rt-search-reset; Calendar and Contacts: rt-search-input, see below).
    var searchMode = { mail: 'mailbox.searchMode', calendar: 'list.searchMode', contacts: 'addressbook.searchMode' }[app];
    var searchInput = {
      mail: { 'rt-search-reset': '' },
      // The event list may be folded away; typing shows it
      calendar: { 'rt-search-input': '', 'rt-search-empty': 'list.cancelSearch()', 'rt-search-text': 'app.centerIsClose(centerIsClose) && toggleCenter()' },
      contacts: { 'rt-search-input': '', 'rt-search-empty': 'addressbook.cancelSearch()' }
    }[app];
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
      Object.keys(searchInput).forEach(function (name) { input.setAttribute(name, searchInput[name]); });
      var more = form.querySelector('a.show-advanced-search md-icon');
      if (more) more.textContent = 'tune';
      last.parentNode.insertBefore(form, last);
      // The list toolbar no longer gives way to the search form; its search button goes
      tools.removeAttribute('ng-hide');
      var button = tools.querySelector('md-button[ng-click^="' + searchMode + '"]');
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

    // ---- compose, like Gmail's. SOGo fetches its window (UIxMailEditor) over HTTP; an $http
    // interceptor (mail.config below) runs these on it. actions runs first, so that if
    // composer can't apply, Send and Save stay where SOGo put them.
    // The bottom bar: Send, formatting on and off, attach, the editor's link, emoji and image
    // buttons (rtComposer.ready puts them in .rt-compose-tools), and SOGo's options with Save draft
    var actions = function (box) {
      var form = box.querySelector('md-dialog.sg-mail-editor > form');
      var top = form && form.querySelector(':scope > md-toolbar');
      var send = top && top.querySelector('md-button[ng-click="editor.send()"]');
      var save = top && top.querySelector('md-button[ng-click="editor.save()"]');
      var attachments = form && form.querySelector(':scope > md-dialog-actions.sg-mail-editor-attachments');
      var attach = attachments && attachments.querySelector('label[for="fileInput"]');
      var file = attachments && attachments.querySelector('input#fileInput[type="file"]');
      var menu = form && form.querySelector('md-dialog-content > header > .msg-header-buttons > md-menu');
      var options = menu && menu.querySelector(':scope > md-menu-content');
      if (!send || !save || !attach || !file || !options) return false;
      var formatting = english ? 'Formatting options' : say('Options');
      var bar = html(
        '<div class="rt-compose-format" ng-show="editor.composeType == \'html\' && !editor.rtNoFormat"></div>' +
        '<div class="rt-compose-actions" ng-init="editor.rtNoFormat = rtComposer.formatOff()">' +
        '<md-button class="md-icon-button rt-format-toggle" ng-if="editor.composeType == \'html\'" ng-class="{ \'rt-on\': !editor.rtNoFormat }"' +
        ' ng-click="rtComposer.toggleFormat(editor)" aria-label="' + esc(formatting) + '"><md-icon>text_format</md-icon>' +
        '<md-tooltip md-direction="top">' + esc(formatting) + '</md-tooltip></md-button>' +
        '<span class="rt-compose-tools"></span></div>');
      var row = bar.lastChild;
      // Send: SOGo's own button, with its conditions and sending animation, as a pill
      send.classList.remove('sg-icon-button');
      send.classList.add('md-raised', 'md-primary', 'rt-send');
      send.textContent = say('Send');
      row.insertBefore(send, row.firstChild);
      row.insertBefore(attach, row.querySelector('.rt-compose-tools'));
      row.insertBefore(file, row.querySelector('.rt-compose-tools'));
      // Save draft leads SOGo's options menu; the menu goes to the end of the bar
      save.parentNode.removeChild(save);
      options.insertBefore(html('<md-menu-item><md-button ng-click="editor.save()"><md-icon>drafts</md-icon> ' +
        esc(english ? 'Save draft' : say('Save')) + '</md-button></md-menu-item><md-menu-divider></md-menu-divider>'), options.firstChild);
      menu.setAttribute('md-position-mode', 'target-right bottom');
      row.appendChild(menu);
      var emptied = attachments.querySelector('.msg-header-buttons');
      if (emptied && !emptied.querySelector('*:not(md-icon)')) emptied.parentNode.removeChild(emptied);
      attachments.parentNode.insertBefore(bar, attachments.nextSibling);
      // The editor's own toolbar and buttons move into the bar once CKEditor has started
      var editor = form.querySelector('sg-ckeditor[on-instance-ready]');
      if (editor) editor.setAttribute('on-instance-ready', editor.getAttribute('on-instance-ready') + '; rtComposer.ready($editor)');
      return true;
    };
    // A slim bar (the subject or "New Message", minimise, full screen, close), then From (when
    // there is a choice), To with Cc and Bcc on its line, and Subject as plain lines
    var composer = function (box) {
      var dialog = box.querySelector('md-dialog.sg-mail-editor');
      var top = dialog && dialog.querySelector(':scope > form > md-toolbar');
      var tools = top && top.querySelector(':scope > .md-toolbar-tools');
      var full = tools && tools.querySelector('md-button[ng-click^="editor.toggleFullscreen"]');
      var close = tools && tools.querySelector('md-button[ng-click="editor.cancel()"]');
      var from = tools && tools.querySelector('md-autocomplete[md-input-name="from"]');
      var lines = dialog && dialog.querySelector('md-dialog-content > header > .msg-header-content');
      var to = lines && lines.querySelector(':scope > .pseudo-input-container > md-chips[ng-model="editor.message.editable.to"]');
      var header = lines && lines.parentNode;
      var cc = header && header.querySelector('.msg-header-buttons > md-button[ng-click="editor.hideCc = false"]');
      var bcc = header && header.querySelector('.msg-header-buttons > md-button[ng-click="editor.hideBcc = false"]');
      var subject = lines && lines.querySelector('md-input-container > input[name="subject"]');
      var fullIcon = full && full.querySelector('md-icon');
      if (!close || !fullIcon || !from || !to || !cc || !bcc || !subject) return false;
      // The bar: whatever actions left in it (Send and Save if it couldn't move them) stays
      var kept = [].slice.call(tools.querySelectorAll(':scope > md-button[ng-click="editor.send()"], :scope > md-button[ng-click="editor.save()"]'));
      tools.textContent = '';
      tools.appendChild(html('<span class="rt-compose-title" flex="flex">{{ editor.message.editable.subject || rtText.newMessage }}</span>'));
      kept.forEach(function (button) { tools.appendChild(button); });
      tools.appendChild(html('<md-button class="md-icon-button rt-compose-min" ng-click="editor.rtMin = !editor.rtMin; $event.stopPropagation()"' +
        ' aria-label="{{ editor.rtMin ? rtText.restore : rtText.minimise }}"><md-icon>{{ editor.rtMin ? \'expand_less\' : \'minimize\' }}</md-icon>' +
        '<md-tooltip md-direction="top">{{ editor.rtMin ? rtText.restore : rtText.minimise }}</md-tooltip></md-button>'));
      fullIcon.textContent = "{{ editor.isFullscreen ? 'close_fullscreen' : 'open_in_full' }}";
      [].slice.call(full.querySelectorAll(':scope > md-tooltip')).forEach(function (tip) { full.removeChild(tip); });
      full.removeAttribute('aria-hidden');
      full.setAttribute('aria-label', '{{ editor.isFullscreen ? rtText.exitFull : rtText.fullScreen }}');
      full.insertBefore(html('<md-tooltip md-direction="top">{{ editor.isFullscreen ? rtText.exitFull : rtText.fullScreen }}</md-tooltip>'), full.firstChild);
      close.setAttribute('aria-label', say('Close'));
      close.insertBefore(html('<md-tooltip md-direction="top">' + esc(say('Close')) + '</md-tooltip>'), close.firstChild);
      tools.appendChild(full);
      tools.appendChild(close);
      // A minimised window is only its bar; clicking the bar opens it again
      top.setAttribute('ng-click', 'editor.rtMin && (editor.rtMin = false)');
      dialog.setAttribute('ng-class', "{ 'rt-min': editor.rtMin }");
      // From, as a line, when the account has more than one identity
      var fromLine = html('<div class="pseudo-input-container rt-from-line" ng-show="editor.identities.length > 1">' +
        '<label class="pseudo-input-label">' + esc(say('From')) + '</label></div>').firstChild;
      fromLine.appendChild(from);
      lines.insertBefore(fromLine, lines.firstChild);
      // Cc and Bcc at the end of the To line
      var links = html('<span class="rt-cc-bcc"></span>').firstChild;
      links.appendChild(cc);
      links.appendChild(bcc);
      to.parentNode.appendChild(links);
      // Subject: a plain line with a placeholder instead of a floating label
      var container = subject.parentNode;
      var label = container.querySelector(':scope > label');
      if (label) container.removeChild(label);
      container.classList.add('rt-subject');
      container.setAttribute('md-no-float', '');
      subject.setAttribute('placeholder', say('Subject'));
      // SOGo's column of buttons beside the lines goes once it is empty
      var rest = header.querySelector(':scope > .msg-header-buttons');
      if (rest && !rest.querySelector('md-button, md-menu')) header.removeChild(rest);
      return true;
    };

    // ---- Calendar and Contacts: Create at the top of the sidebar, a menu of what to create.
    // The sidebar and the list are in different scopes; rt-list-ref on the top bar (in the
    // list's scope) hands the list's controller to the sidebar as rtList.
    var createItems = {
      calendar: [['appointment', 'event', say('Event')], ['task', 'assignment_turned_in', say('Task')]],
      contacts: [['card', 'person', say('Contact')], ['list', 'group', english ? 'Contact list' : say('New List'), 'rtList.selectedFolder.isRemote']]
    }[app];
    var createLabel = app === 'calendar' ? say('Create') : english ? 'Create contact' : say('New Contact');
    var create = function (box) {
      var header = box.querySelector('md-sidenav.md-sidenav-left > md-toolbar');
      if (!header || !createItems) return false;
      header.parentNode.insertBefore(html(
        '<div class="rt-compose-bar" flex-none="flex-none"><md-menu md-position-mode="target-left target" md-offset="0 60">' +
        '<button type="button" class="rt-compose rt-create" ng-click="$mdMenu.open($event)" ng-disabled="!rtCanCreate()">' +
        '<md-icon>add</md-icon><span>' + esc(createLabel) + '</span></button>' +
        '<md-menu-content width="3" class="rt-create-menu">' + createItems.map(function (item) {
          return '<md-menu-item' + (item[3] ? ' ng-hide="' + item[3] + '"' : '') + '><md-button ng-click="rtCreate($event, \'' + item[0] + '\')">' +
            '<md-icon>' + item[1] + '</md-icon><span>' + esc(item[2]) + '</span></md-button></md-menu-item>';
        }).join('') + '</md-menu-content></md-menu></div>'), header.nextSibling);
      return true;
    };
    var listRef = function (box) {
      var bar = box.querySelector('md-toolbar.toolbar-main');
      if (!bar) return false;
      bar.setAttribute('rt-list-ref', app === 'calendar' ? 'list' : 'addressbook');
      return true;
    };

    // ---- Settings: the other apps' top bar, Save under the page, the current place
    var toolbar = function (box) {
      var bar = box.querySelector(topBar + '.md-tall');
      var first = bar && bar.querySelector(':scope > .sg-toolbar-group-1');
      if (!first || !bar.querySelector(':scope > .sg-toolbar-group-last')) return false;
      bar.classList.remove('md-tall');
      bar.classList.add('toolbar-main');
      bar.setAttribute('layout-align', 'space-between center');
      first.parentNode.insertBefore(html('<h1 class="rt-page-title">' +
        esc(window.UserLanguage === 'English' ? 'Settings' : say('Preferences')) + '</h1>'), first.nextSibling);
      return true;
    };
    var save = function (box) {
      var button = box.querySelector(topBar + ' > md-button.md-fab[ng-click^="app.save("]');
      var content = box.querySelector('form[name="preferencesForm"] > section > md-content');
      if (!button || !content) return false;
      button.classList.remove('md-fab', 'md-fab-bottom-right', 'md-fab-overlap-bottom');
      button.classList.add('md-raised', 'md-primary', 'rt-save');
      button.textContent = say('Save');
      var bar = html('<div class="rt-save-bar" layout="row" layout-align="end center" ng-show="preferencesForm.$dirty">' +
        '<span class="rt-save-note">' + esc(window.UserLanguage === 'English' ? 'Unsaved changes' : say('Unsaved Changes')) + '</span></div>');
      bar.firstChild.appendChild(button);
      content.parentNode.insertBefore(bar, content.nextSibling);
      return true;
    };
    var here = function (box) {
      var button = box.querySelector('md-sidenav > md-toolbar md-button[ng-hide*="/Preferences"]');
      if (!button) return false;
      button.removeAttribute('ng-hide');
      button.removeAttribute('ng-href');
      button.setAttribute('ng-disabled', 'true');
      button.classList.add('rt-here');
      return true;
    };

    var layout = ['layout', layoutSwitch];
    var mainTemplates = {
      mail: ['UIxMailMainFrame', 'UIxMailFolderTemplate'], calendar: ['UIxCalMainView'], contacts: ['addressbook'], prefs: ['preferences.html']
    }[app];
    if (classic) {
      mainTemplates.forEach(function (id) { rewrite(id, [layout]); });
      return;
    }

    if (app === 'prefs') {
      // The markup it adds uses SOGo's own controller (app.save, app.confirmChanges)
      rewrite('preferences.html', [['toolbar', toolbar], layout, ['brand', brand], ['save', save], ['here', here]]);
    }

    if (app === 'calendar' || app === 'contacts') {
      // ---- Angular for Calendar and Contacts: the functions the new markup calls. Registered
      // before any template changes, so if this fails nothing is changed.
      var appModule = angular.module(app === 'calendar' ? 'SOGo.SchedulerUI' : 'SOGo.ContactsUI');
      appModule.directive('rtListRef', ['$rootScope', function ($rootScope) {
        return {
          restrict: 'A',
          link: function (scope, element, attrs) {
            var list = scope.$eval(attrs.rtListRef);
            $rootScope.rtList = list;
            scope.$on('$destroy', function () { if ($rootScope.rtList === list) $rootScope.rtList = null; });
          }
        };
      }]);
      // Typing in the search box (rt-search-text) and emptying it (rt-search-empty)
      appModule.directive('rtSearchInput', function () {
        return {
          restrict: 'A',
          link: function (scope, element, attrs) {
            element.on('input', function () {
              var expression = element.val() ? attrs.rtSearchText : attrs.rtSearchEmpty;
              if (expression) scope.$evalAsync(expression);
            });
          }
        };
      });
      if (app === 'calendar') {
        appModule.config(['$provide', function ($provide) {
          // Each calendar's colour as a CSS variable on the elements SOGo colours with it
          $provide.decorator('sgFolderStylesheetDirective', ['$delegate', function ($delegate) {
            var directive = $delegate[0];
            if (directive && typeof directive.template === 'string' && directive.template.indexOf('</style>') > 0) {
              directive.template = directive.template.replace('</style>',
                ' .bg-folder{{ cssCtrl.ngModel.id }} { --rt-folder: {{ cssCtrl.ngModel.color }}; }</style>');
              root.classList.add('rt-gmail-colors');
            } else {
              warn('"colors" skipped, sgFolderStylesheet is not as expected');
            }
            return $delegate;
          }]);
        }]);
      }
      appModule.run(['$rootScope', '$injector', function ($rootScope, $injector) {
        var $mdSidenav = $injector.has('$mdSidenav') ? $injector.get('$mdSidenav') : null;
        $rootScope.rtCanCreate = function () {
          var list = $rootScope.rtList, folder = list && list.selectedFolder;
          if (!list) return false;
          return app === 'calendar' || !!(folder && (folder.isOwned || (folder.acls && folder.acls.objectCreator)));
        };
        $rootScope.rtCreate = function ($event, type) {
          var list = $rootScope.rtList;
          if (!list || !list.newComponent || !$rootScope.rtCanCreate()) return;
          if (app === 'calendar') list.newComponent($event, type);
          else list.newComponent(type);
          try {
            var nav = $mdSidenav && $mdSidenav('left');
            if (nav && !nav.isLockedOpen()) nav.close();
          } catch (e) {}
        };
      }]);
      if (app === 'calendar') {
        rewrite('UIxCalMainView', [layout, ['brand', brand], ['search', search], ['create', create], ['listref', listRef]]);
      } else {
        rewrite('UIxContactFoldersView', [['create', create]]);
        rewrite('addressbook', [layout, ['brand', brand], ['search', search], ['listref', listRef]]);
      }
    }

    if (app === 'mail') {
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

      // The compose window's template, changed on its way in (once: $templateCache keeps the result)
      mail.config(['$httpProvider', function ($httpProvider) {
        $httpProvider.interceptors.push(function () {
          return {
            response: function (response) {
              var url = response && response.config && response.config.url;
              if (typeof url === 'string' && /(^|\/)UIxMailEditor(\?|$)/.test(url) &&
                  typeof response.data === 'string' && response.data.indexOf('rt-compose-done') < 0) {
                var markup = change('UIxMailEditor', response.data, [['actions', actions], ['composer', composer]], function (name) {
                  root.classList.add('rt-gmail-' + name);
                });
                if (markup !== null) response.data = markup.replace('<md-dialog ', '<md-dialog rt-compose-done="" ');
              }
              return response;
            }
          };
        });
      }]);

      mail.config(['$provide', function ($provide) {
        $provide.decorator('$mdDialog', ['$delegate', '$injector', function ($delegate, $injector) {
          var show = $delegate.show, open = 0;
          $delegate.show = function (options) {
            var o = options && options._options ? options._options : options;
            try {
              // SOGo's dialogs have an isolated scope; this one gets the helpers its new markup calls
              var $rootScope = $injector.get('$rootScope');
              if (o && o.templateUrl === 'UIxMailEditor' && !o.scope && $rootScope.rtComposer) {
                o.scope = $rootScope.$new(true);
                o.scope.rtText = $rootScope.rtText;
                o.scope.rtComposer = $rootScope.rtComposer;
              }
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
          unflag: say('Unflag'),
          newMessage: english ? 'New Message' : say('Write'),
          minimise: english ? 'Minimise' : say('Reduce'),
          restore: english ? 'Restore' : say('Expand'),
          fullScreen: english ? 'Full screen' : say('Expand'),
          exitFull: english ? 'Exit full screen' : say('Reduce')
        };

        // ---- compose: the editor's toolbar in Gmail's order, unless SOGo set one
        var ckConfig = get('sgCkeditorConfig');
        if (ckConfig && ckConfig.config && !ckConfig.config.toolbar) {
          ckConfig.config.toolbar = {
            items: ['undo', 'redo', '|', 'fontFamily', 'fontSize', '|', 'bold', 'italic', 'underline', 'fontColor', '|',
              'alignment', '|', 'numberedList', 'bulletedList', '|', 'outdent', 'indent', '|',
              { label: english ? 'More formatting' : say('Options'), icon: 'threeVerticalDots', withText: false,
                items: ['blockQuote', 'removeFormat', 'insertTable', 'sourceEditing', 'htmlEmbed'] }],
            shouldNotGroupWhenFull: false
          };
        }
        $rootScope.rtComposer = {
          // Formatting on or off, as the user last left it
          formatOff: function () {
            try { return localStorage.getItem('rt_compose_format') === 'off'; } catch (e) { return false; }
          },
          toggleFormat: function (editor) {
            editor.rtNoFormat = !editor.rtNoFormat;
            try {
              if (editor.rtNoFormat) localStorage.setItem('rt_compose_format', 'off');
              else localStorage.removeItem('rt_compose_format');
            } catch (e) {}
          }
        };
        // Once CKEditor has started: its toolbar goes into the formatting bar above the bottom
        // bar, and its link, emoji and image buttons into the bottom bar. They are CKEditor's own
        // buttons, so the link balloon, the emoji panel and image upload work as usual.
        // Material's "mood" icon, for the emoji button
        var smiley = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10' +
          'C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5' +
          'S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5' +
          'c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/></svg>';
        $rootScope.rtComposer.ready = function (ck) {
          try {
            var source = ck && ck.sourceElement;
            var dialog = source && source.closest && source.closest('md-dialog.sg-mail-editor');
            var pill = dialog && dialog.querySelector('.rt-compose-format');
            var slot = dialog && dialog.querySelector('.rt-compose-tools');
            if (!pill || !slot || !ck.ui || !ck.ui.view || !ck.ui.view.toolbar) return warn('compose: the editor is not as expected');
            var toolbar = ck.ui.view.toolbar.element;
            pill.appendChild(toolbar);
            dialog.classList.add('rt-toolbar-moved');
            // The window opens with a zoom, and CKEditor measures its toolbar while it is scaled
            // down, folding every button into "more". A 1px change in width after each of the
            // window's transitions makes it measure again.
            var remeasure = function () {
              toolbar.style.width = 'calc(100% - 1px)';
              setTimeout(function () { toolbar.style.width = ''; }, 50);
            };
            dialog.addEventListener('transitionend', function (event) { if (event.target === dialog) remeasure(); });
            remeasure();
            var views = [];
            ['link', 'specialCharacters', 'imageUpload'].forEach(function (name) {
              if (!ck.ui.componentFactory.has(name)) return;
              var view = ck.ui.componentFactory.create(name);
              if (!view.isRendered) view.render();
              slot.appendChild(view.element);
              ck.ui.focusTracker.add(view.element);
              if (name === 'specialCharacters') view.set({ icon: smiley, label: english ? 'Insert emoji' : view.label });
              views.push(view);
            });
            ck.on('destroy', function () { views.forEach(function (view) { view.destroy(); }); });
            var panels = ck.plugins.has('Dialog') ? ck.plugins.get('Dialog') : null;
            var characters = ck.plugins.has('SpecialCharacters') ? ck.plugins.get('SpecialCharacters') : null;
            if (panels) {
              // The emoji button opens CKEditor's characters on SOGo's emoticons; other groups stay a choice away
              panels.on('show:specialCharacters', function (event, definition) {
                var categories = definition && definition.content && definition.content.categoriesView;
                if (categories && characters && characters.getGroups().has('Emoji')) categories.currentGroupName = 'Emoji';
              }, { priority: 'low' });
              // A minimised window takes its open panel (link, characters) with it
              new MutationObserver(function () {
                if (panels.id && dialog.classList.contains('rt-min')) panels.hide();
              }).observe(dialog, { attributes: true, attributeFilter: ['class'] });
            }
          } catch (e) {
            warn('compose: ' + e);
          }
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
        // The order of the message list in words (English); '' leaves SOGo's own label
        var sortWords = {
          arrival: ['Oldest first', 'Newest first'],
          date: ['Oldest first, by date sent', 'Newest first, by date sent'],
          subject: ['Subject A\u2013Z', 'Subject Z\u2013A'],
          from: ['Sender A\u2013Z', 'Sender Z\u2013A'],
          to: ['Recipient A\u2013Z', 'Recipient Z\u2013A'],
          size: ['Smallest first', 'Largest first']
        };
        $rootScope.rtSortText = function (key, asc) {
          var words = window.UserLanguage === 'English' && sortWords[key];
          return words ? words[Number(asc) === 1 ? 0 : 1] : '';
        };
        // The list header's chips: what a filter shows, and undoing a filter or the order
        $rootScope.rtFilter = {
          labels: function (folder) {
            var on = (folder && folder.$filteredLabels) || {};
            return ((folder && folder.$labels) || []).filter(function (label) { return !!on[label.imapName]; })
              .map(function (label) { return label.name || label.imapName; }).join(', ');
          },
          clear: function (folder, what) {
            if (!folder || !Mailbox) return;
            if (what === 'unseen') folder.$unseenOnly = 0;
            if (what === 'flagged') folder.$flaggedOnly = 0;
            if (what === 'labels') angular.forEach(folder.$filteredLabels, function (value, key) { folder.$filteredLabels[key] = 0; });
            folder.$filter(Mailbox.$query);
          },
          // SOGo's usual order: by arrival, newest first
          usualOrder: function () {
            return !Mailbox || !Mailbox.$query || (Mailbox.$query.sort === 'arrival' && !Number(Mailbox.$query.asc));
          },
          newestFirst: function (folder) {
            if (folder) folder.$filter({ sort: 'arrival', asc: 0 });
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
      rewrite('UIxMailFolderTemplate', [layout, ['brand', brand], ['search', search], ['rows', rows], ['fab', fab], ['sort', sortLine], ['count', count]]);
      rewrite('UIxMailViewTemplate', [['back', back]]);
    }
    root.classList.add('rt-gmail', 'rt-app-' + app);
    done.forEach(function (change) { root.classList.add('rt-gmail-' + change); });

    // ---- the stylesheets: the shared layout, then the app's
    var sheet = function (id, css) {
      var style = document.createElement('style');
      style.id = id;
      style.textContent = css;
      (document.head || root).appendChild(style);
    };
    sheet('rabbittech-sogo-layout', String.raw`
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

.rt-compose-bar { padding: 4px 0 16px 12px; }
.rt-compose {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  height: 52px;
  min-width: 136px;
  padding: 0 24px 0 18px;
  border: 0;
  border-radius: 16px;
  background-color: var(--rt-primary);
  color: #fff;
  font: 600 14.5px/1 var(--rt-font);
  letter-spacing: -.005em;
  cursor: pointer;
  box-shadow: 0 1px 2px rgba(76, 29, 149, .22), 0 4px 12px -4px rgba(124, 58, 237, .5);
  transition: background-color .15s, box-shadow .15s;
}
.rt-compose:hover {
  background-color: var(--rt-primary-hover);
  box-shadow: 0 2px 4px rgba(76, 29, 149, .25), 0 8px 20px -6px rgba(124, 58, 237, .6);
}
.rt-compose:active { box-shadow: 0 1px 2px rgba(76, 29, 149, .25); }
html .rt-compose md-icon {
  width: 20px;
  height: 20px;
  min-width: 20px;
  min-height: 20px;
  margin: 0;
  color: #fff;
  font-size: 20px;
}

/* Calendar and Contacts: what Create offers; it replaces the add button where the sidebar shows */
.rt-create-menu md-menu-item > .md-button { display: flex; align-items: center; gap: 4px; }
.rt-create-menu md-menu-item > .md-button md-icon { margin: auto 12px auto 0; color: var(--rt-muted); }
.rt-create[disabled] { opacity: .45; cursor: default; box-shadow: none; }
html.rt-gmail-create.rt-gmail-listref body:has(md-sidenav.md-locked-open:not(.sg-close)) .sg-fab-bottom-center { display: none; }

/* Contacts' address books and Settings' sections: pills against the left edge, like Mail's folders */
html.rt-gmail:is(.rt-app-contacts, .rt-app-prefs) md-sidenav.md-sidenav-left md-list-item.md-clickable {
  margin: 0 12px 0 0;
  padding-left: 12px;
  border-radius: 0 999px 999px 0;
}
html.rt-gmail:is(.rt-app-contacts, .rt-app-prefs) md-sidenav md-list-item.md-clickable.md-background.md-hue-1.md-bg { background-color: var(--rt-primary-soft-2) !important; }
html.rt-gmail:is(.rt-app-contacts, .rt-app-prefs) md-sidenav md-list-item.md-clickable > .md-no-style > .md-list-item-inner { flex: 1 1 auto; min-width: 0; }
html.rt-gmail:is(.rt-app-contacts, .rt-app-prefs) md-sidenav md-list-item.md-clickable .sg-item-name { display: block; flex: 1 1 auto; min-width: 0; max-width: none; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
html.rt-gmail:is(.rt-app-contacts, .rt-app-prefs) md-sidenav md-list-item.md-clickable > .md-no-style > .md-list-item-inner > md-icon { margin-right: 16px; font-size: 20px; color: var(--rt-muted); }
html.rt-gmail:is(.rt-app-contacts, .rt-app-prefs) md-sidenav md-list-item.md-bg > .md-no-style > .md-list-item-inner > md-icon { color: var(--rt-primary-text); }

/* Calendar's event and task editors and Settings' account and filter dialogs: the title field
   in the dialog's white header reads as the title */
html.rt-gmail:is(.rt-app-calendar, .rt-app-prefs) md-dialog md-toolbar md-input-container .md-input,
html.rt-gmail:is(.rt-app-calendar, .rt-app-prefs) md-dialog md-toolbar.md-default-theme:not(.md-menu-toolbar) md-input-container .md-input {
  color: var(--rt-text) !important;
  border-color: var(--rt-border-strong) !important;
  font-size: 20px;
  font-weight: 650;
}
html.rt-gmail:is(.rt-app-calendar, .rt-app-prefs) md-dialog md-toolbar md-input-container label,
html.rt-gmail:is(.rt-app-calendar, .rt-app-prefs) md-dialog md-toolbar.md-default-theme:not(.md-menu-toolbar) md-input-container label { color: var(--rt-muted) !important; }
html.rt-gmail:is(.rt-app-calendar, .rt-app-prefs) md-dialog md-toolbar md-input-container.md-input-focused .md-input { border-color: var(--rt-primary) !important; }
html.rt-gmail:is(.rt-app-calendar, .rt-app-prefs) md-dialog md-toolbar md-icon.sg-icon-toolbar-bg { display: none; }

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
html.rt-gmail md-sidenav .sg-account-section > md-list > md-list-item { font-size: 12px; font-weight: 500; letter-spacing: 0; }
html.rt-gmail md-sidenav .sg-quota { padding: 0 16px 14px; }
html.rt-gmail md-sidenav .sg-quota .sg-md-caption { font-size: 11px; }
html.rt-gmail md-sidenav .sg-item-name { gap: 0; font-size: 14px; font-weight: 450; color: var(--rt-text-2); }
html.rt-gmail md-sidenav .sg-item-name md-icon {
  width: 20px;
  height: 20px;
  min-width: 20px;
  min-height: 20px;
  margin: 0 16px 0 2px;
  font-size: 20px;
  color: var(--rt-muted);
}
html.rt-gmail md-sidenav .sg-item-name .sg-font-medium { font-weight: 650; color: var(--rt-text); }
html.rt-gmail md-sidenav md-list-item.md-bg .sg-item-name,
html.rt-gmail md-sidenav md-list-item.md-bg .sg-item-name > span:not(.sg-counter-badge) { font-weight: 650; }
html.rt-gmail md-sidenav md-list-item.md-bg .sg-item-name md-icon { color: var(--rt-primary-text); }
html.rt-gmail md-sidenav md-list-item md-icon.md-menu { font-size: 20px; }
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
html.rt-gmail .toolbar-main .md-toolbar-tools .md-button.md-icon-button { border-radius: 50%; }
html.rt-gmail .toolbar-main .md-toolbar-tools .md-button.md-icon-button md-icon { font-size: 22px; }
html.rt-gmail .toolbar-main .md-button.md-icon-button[disabled] { background-color: var(--rt-primary-soft-2); }
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
/* Angular Material shows the placeholder as a label over the field, in the toolbar's 20px type */
html.rt-gmail-search md-toolbar.toolbar-main form.rt-search md-input-container > label {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: auto;
  display: flex;
  align-items: center;
  margin: 0;
  padding: 0 4px;
  transform: none;
  color: var(--rt-muted) !important;
  font-size: 15px;
  font-weight: 400;
  line-height: 1;
  pointer-events: none;
}
html.rt-gmail-search md-toolbar.toolbar-main form.rt-search md-input-container.md-input-has-value > label { visibility: hidden; }
/* Angular Material colours fields inside a toolbar for a dark toolbar (white text, white
   placeholder, light underline), with more specific selectors than the ones above */
html.rt-gmail-search md-toolbar.toolbar-main form.rt-search md-input-container[md-no-float] .md-input,
html.rt-gmail-search md-toolbar.toolbar-main form.rt-search md-input-container .md-input {
  padding: 0 4px !important;
  border: 0 !important;
  font-size: 15px;
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

`);

    if (app === 'mail') sheet('rabbittech-sogo-mail', String.raw`
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
html.rt-gmail .view-list .sg-folder-name { margin: 0 8px 0 4px; font-size: 16px; font-weight: 650; letter-spacing: -.01em; }
html.rt-gmail .view-list > md-toolbar .md-button md-icon,
html.rt-gmail .view-list > md-toolbar a.sg-icon-button md-icon { font-size: 20px; }
/* Advanced search results: a plain bar instead of SOGo's coloured one */
html.rt-gmail .view-list > md-toolbar.advanced-search-clickable-toolbar:not(.md-menu-toolbar) {
  background-color: var(--rt-surface);
  color: var(--rt-text);
  box-shadow: inset 0 -1px 0 var(--rt-border);
}
html.rt-gmail .view-list > md-toolbar.advanced-search-clickable-toolbar md-input-container { font-size: 15px; font-weight: 600; }
/* "30 messages · Order received": one compact line */
html.rt-gmail #messagesList > .md-subheader .md-subheader-inner { padding: 6px 16px; }
html.rt-gmail #messagesList > .md-subheader { font-size: 12px; font-weight: 500; }
html.rt-gmail #messagesList > .md-subheader md-icon { font-size: 16px; }
/* Instead of that line (count): chips for a filter or order after the name, taking the free
   space, then "30 messages" by the buttons */
html.rt-gmail-count .view-list .sg-folder-name {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
html.rt-gmail-count .view-list .rt-list-chips {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  gap: 6px;
  min-width: 0;
  overflow: hidden;
}
html.rt-gmail-count .view-list .rt-chip {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 6px 0 10px;
  border: 0;
  border-radius: 999px;
  background-color: var(--rt-primary-soft);
  color: var(--rt-primary-text);
  font: 500 13px/28px var(--rt-font);
  white-space: nowrap;
  cursor: pointer;
}
html.rt-gmail-count .view-list .rt-chip:hover { background-color: var(--rt-primary-soft-2); }
html.rt-gmail-count .view-list .rt-chip:focus-visible { outline: 2px solid var(--rt-ring); outline-offset: 1px; }
html.rt-gmail-count .view-list .rt-chip md-icon {
  width: 16px;
  min-width: 16px;
  height: 16px;
  min-height: 16px;
  font-size: 16px;
  line-height: 16px;
  color: inherit;
}
html.rt-gmail-count .view-list .rt-chip .rt-chip-x { opacity: .7; }
/* Angular Material centres menus in toolbars (margin: auto); here they sit with the count */
html.rt-gmail-count .view-list > md-toolbar > .md-toolbar-tools > md-menu { margin: 0; }
html.rt-gmail-count .view-list .rt-list-count {
  flex: 0 4 auto;
  min-width: 0;
  padding: 0 8px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 13px;
  font-weight: 500;
  color: var(--rt-muted);
}
/* Phones: a chip says more than the count, and the folder's name keeps its room */
@media (max-width: 599px) {
  html.rt-gmail-count .view-list .rt-list-chips:has(.rt-chip:not(.ng-hide)) ~ .rt-list-count { display: none; }
}

/* SOGo's scrolling places rows 56px apart, so a row must stay 56px even on one line */
html.rt-gmail md-list-item.sg-message-list-item { height: 56px; min-height: 56px; background-color: var(--rt-g-row); }
html.rt-gmail md-list-item.sg-message-list-item > .md-no-style.md-button { height: 100%; padding-right: 16px; }
/* Angular Material's grey hover and focus wash on list buttons; rows lift instead */
html.rt-gmail md-list-item.sg-message-list-item .md-no-style.md-button:not([disabled]):hover,
html.rt-gmail md-list-item.sg-message-list-item .md-no-style.md-button:not([disabled]).md-focused,
html.rt-gmail md-list-item.sg-message-list-item .md-no-style.md-button:not([disabled]):focus { background-color: transparent; }
html.rt-gmail md-list-item.sg-message-list-item .sg-md-subhead { font-weight: 450; color: var(--rt-text-2); }
html.rt-gmail md-list-item.sg-message-list-item.unread .sg-md-subhead,
html.rt-gmail md-list-item.sg-message-list-item.unread .sg-md-body { font-weight: 650; color: var(--rt-text); }
html.rt-gmail md-list-item.sg-message-list-item .sg-tile-date { font-weight: 500; color: var(--rt-muted); }
html.rt-gmail md-list-item.sg-message-list-item.unread .sg-tile-date { font-weight: 650; color: var(--rt-text); }
html.rt-gmail md-list-item.sg-message-list-item.unread { background-color: var(--rt-g-row-unread); }
/* The star shows a flagged message; no tinted row */
html.rt-gmail md-list-item.sg-message-list-item.sg-star-bg:not(.md-bg) { background-color: var(--rt-g-row); }
html.rt-gmail md-list-item.sg-message-list-item.sg-star-bg.unread:not(.md-bg) { background-color: var(--rt-g-row-unread); }
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
  /* Eleven actions don't fit a phone: back and Archive stay at the left, the rest scrolls */
  html.rt-gmail-back .view-detail md-card > md-card-actions {
    justify-content: flex-start;
    overflow-x: auto;
    scrollbar-width: none;
  }
  html.rt-gmail-back .view-detail md-card > md-card-actions > * { flex-shrink: 0; }
  html.rt-gmail-back .view-detail md-card > md-card-actions > .md-flex { flex: 1 0 0; min-width: 8px; }
}

/* Compose button on narrow windows; the Compose pill replaces it when the folder list shows */
html.rt-gmail .sg-fab-bottom-center,
html.rt-gmail .sg-fab-bottom-center.sg-center-close,
html.rt-gmail .sg-fab-bottom-center.sg-sidenav-close { top: auto; right: calc(var(--rt-g-gap) + 16px); bottom: calc(var(--rt-g-gap) + 16px); left: auto; }
html.rt-gmail-compose body:has(md-sidenav.md-locked-open:not(.sg-close)) .sg-fab-bottom-center { display: none; }

/* Advanced search dialog: Search is the main action, Cancel isn't a warning */
html.rt-gmail md-dialog-actions .md-button[ng-click="dialogCtrl.search()"] {
  padding: 0 18px;
  background-color: var(--rt-primary);
  color: #fff;
}
html.rt-gmail md-dialog-actions .md-button[ng-click="dialogCtrl.search()"]:hover { background-color: var(--rt-primary-hover); }
html.rt-gmail md-dialog-actions .md-button.md-warn[ng-click*="closeDialog"] { color: var(--rt-text-2); }

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

/* ------------------------------------------------- compose, like Gmail (composer) */
/* The bar: title, minimise, full screen, close */
html.rt-gmail-composer md-dialog.sg-mail-editor { overflow: hidden; }
html.rt-gmail-composer md-dialog#mailEditor.sg-mail-editor > form > md-toolbar:not(.md-menu-toolbar) {
  flex: none;
  min-height: 40px;
  height: 40px;
  background-color: var(--rt-surface-3);
  color: var(--rt-text);
}
html.rt-gmail-composer md-dialog.sg-mail-editor > form > md-toolbar > .md-toolbar-tools {
  height: 40px;
  min-height: 40px;
  max-height: 40px;
  padding: 0 4px 0 16px;
}
html.rt-gmail-composer .rt-compose-title {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 14px;
  font-weight: 600;
}
html.rt-gmail-composer md-dialog.sg-mail-editor > form > md-toolbar .md-button {
  flex: none;
  width: 32px;
  min-width: 32px;
  height: 32px;
  min-height: 32px;
  margin: 0;
  padding: 0;
  border-radius: 8px;
  color: var(--rt-text-2);
}
html.rt-gmail-composer md-dialog.sg-mail-editor > form > md-toolbar .md-button:hover { background-color: var(--rt-hover); }
html.rt-gmail-composer md-dialog.sg-mail-editor > form > md-toolbar .md-button md-icon {
  width: 18px;
  min-width: 18px;
  height: 18px;
  min-height: 18px;
  font-size: 18px;
  line-height: 18px;
  color: inherit;
}
/* Minimised: only the bar, at the bottom right; a click on it opens the window again */
html.rt-gmail-composer md-dialog.sg-mail-editor.rt-min > form > md-toolbar { cursor: pointer; }
html.rt-gmail-composer md-dialog.sg-mail-editor.rt-min > form > :not(md-toolbar) { display: none !important; }
html.rt-gmail-composer .md-dialog-container.rt-float:has(> md-dialog.sg-mail-editor.rt-min) {
  justify-content: flex-end;
  align-items: flex-end;
  padding-right: 24px;
}
html.rt-gmail-composer .md-dialog-container.rt-float > md-dialog.sg-mail-editor.rt-min {
  width: 320px;
  height: 40px;
  margin: 0 calc(var(--rt-float-index, 0) * 336px) 0 0;
  border-radius: 14px 14px 0 0;
  border-bottom: 0;
}
/* From, To, Cc, Bcc and Subject as quiet lines */
html.rt-gmail-composer md-dialog.sg-mail-editor md-dialog-content > header.sg-padded {
  flex: none;
  padding: 0 16px;
}
html.rt-gmail-composer md-dialog.sg-mail-editor .msg-header-content > .pseudo-input-container,
html.rt-gmail-composer md-dialog.sg-mail-editor .msg-header-content > md-input-container.rt-subject {
  display: flex;
  align-items: flex-start;
  min-height: 40px;
  margin: 0;
  padding: 0;
  border-bottom: 1px solid var(--rt-border);
}
html.rt-gmail-composer md-dialog.sg-mail-editor .msg-header-content > .pseudo-input-container.ng-hide { display: none; }
html.rt-gmail-composer md-dialog.sg-mail-editor .msg-header-content .pseudo-input-label {
  position: static;
  flex: none;
  margin: 0 8px 0 0;
  transform: none;
  font-size: 14px;
  line-height: 40px;
  color: var(--rt-muted);
}
html.rt-gmail-composer md-dialog.sg-mail-editor .msg-header-content > .pseudo-input-container > md-chips,
html.rt-gmail-composer md-dialog.sg-mail-editor .rt-from-line > md-autocomplete { flex: 1 1 auto; min-width: 0; }
html.rt-gmail-composer md-dialog.sg-mail-editor .msg-header-content md-chips .md-chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  min-height: 40px;
  padding: 0;
  box-shadow: none !important;
}
html.rt-gmail-composer md-dialog.sg-mail-editor .msg-header-content md-chips md-chip {
  height: 28px;
  margin: 6px 6px 6px 0;
  line-height: 28px;
  font-size: 13px;
}
html.rt-gmail-composer md-dialog.sg-mail-editor .msg-header-content md-chips .md-chip-input-container {
  flex: 1 1 120px;
  margin: 0;
}
html.rt-gmail-composer md-dialog.sg-mail-editor .msg-header-content md-chips .md-chip-input-container input,
html.rt-gmail-composer md-dialog.sg-mail-editor .rt-from-line md-autocomplete input {
  height: 38px;
  line-height: 38px;
  padding: 0;
  font-size: 14px;
  color: var(--rt-text);
}
html.rt-gmail-composer md-dialog.sg-mail-editor .rt-from-line > md-autocomplete,
html.rt-gmail-composer md-dialog.sg-mail-editor .rt-from-line > md-autocomplete md-autocomplete-wrap {
  height: 40px;
  margin: 0;
  background-color: transparent !important;
  box-shadow: none;
}
html.rt-gmail-composer md-dialog.sg-mail-editor .rt-cc-bcc {
  display: flex;
  flex: none;
  gap: 2px;
  margin-top: 6px;
}
html.rt-gmail-composer md-dialog.sg-mail-editor .rt-cc-bcc .md-button {
  width: auto;
  min-width: 0;
  height: 28px;
  min-height: 28px;
  margin: 0;
  padding: 0 8px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  line-height: 28px;
  text-transform: none;
  color: var(--rt-text-2);
}
html.rt-gmail-composer md-dialog.sg-mail-editor .rt-cc-bcc .md-button:hover { background-color: var(--rt-hover); color: var(--rt-text); }
html.rt-gmail-composer md-dialog.sg-mail-editor md-input-container.rt-subject .md-input {
  height: 40px;
  padding: 0;
  border-width: 0;
  font-size: 14px;
  line-height: 40px;
  color: var(--rt-text);
}
html.rt-gmail-composer md-dialog.sg-mail-editor md-input-container.rt-subject .md-input::placeholder { color: var(--rt-muted); }
html.rt-gmail-composer md-dialog.sg-mail-editor md-input-container.rt-subject .md-errors-spacer,
html.rt-gmail-composer md-dialog.sg-mail-editor md-input-container.rt-subject [ng-messages] { display: none; }

/* -------------------------------------------------- compose, like Gmail (actions) */
/* The writing area fills the window and scrolls on its own; the bars stay below it */
html.rt-gmail-actions md-dialog.sg-mail-editor > form { flex: 1 1 auto; min-height: 0; overflow: hidden; }
html.rt-gmail-actions md-dialog.sg-mail-editor > form > md-dialog-content {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  padding: 0;
  overflow: hidden;
}
html.rt-gmail-actions md-dialog.sg-mail-editor md-input-container.sg-mail-editor-content {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  margin: 0;
  padding: 0;
  overflow: auto;
}
/* The editor fills the area, so a click anywhere in it starts writing */
html.rt-gmail-actions md-dialog.sg-mail-editor .sg-mail-editor-content > sg-ckeditor,
html.rt-gmail-actions md-dialog.sg-mail-editor .sg-mail-editor-content .ck.ck-editor,
html.rt-gmail-actions md-dialog.sg-mail-editor .sg-mail-editor-content .ck.ck-editor__main {
  display: flex;
  flex: 1 0 auto;
  flex-direction: column;
}
html.rt-gmail-actions md-dialog.sg-mail-editor .sg-mail-editor-content .ck.ck-editor__main > .ck-editor__editable,
html.rt-gmail-actions md-dialog.sg-mail-editor .sg-mail-editor-content > textarea { flex: 1 0 auto; }
html.rt-gmail-actions md-dialog.sg-mail-editor.rt-toolbar-moved .ck.ck-editor__top { display: none; }
html.rt-gmail-actions md-dialog.sg-mail-editor .sg-mail-editor-content .ck.ck-editor__main > .ck-editor__editable {
  min-height: 160px;
  padding: 4px 16px 12px;
  border: 0 !important;
  border-radius: 0;
  box-shadow: none !important;
}
/* Dark: the HTML editor stays white (see the dark rules above), as a sheet of paper */
html.rt-gmail-actions[data-theme="dark"] md-dialog.sg-mail-editor md-input-container.sg-mail-editor-content:has(sg-ckeditor) {
  margin: 8px 12px 0;
  border-radius: 10px;
  background-color: #ffffff;
}
html.rt-gmail-actions md-dialog.sg-mail-editor .sg-mail-editor-content textarea {
  min-height: 160px;
  padding: 12px 16px;
  border: 0;
  font-size: 15px;
  line-height: 1.6;
}
/* Attachments under the writing area, only when there are some */
html.rt-gmail-actions md-dialog.sg-mail-editor md-dialog-actions.sg-mail-editor-attachments {
  flex: none;
  min-height: 0;
  padding: 4px 16px 0;
  border-top: 0;
}
html.rt-gmail-actions md-dialog.sg-mail-editor md-dialog-actions.sg-mail-editor-attachments:not(:has(md-chip)) { display: none; }
/* The formatting bar: CKEditor's toolbar as a pill */
html.rt-gmail-actions md-dialog.sg-mail-editor .rt-compose-format {
  order: 3;
  flex: none;
  padding: 6px 12px 0;
}
html.rt-gmail-actions md-dialog.sg-mail-editor .rt-compose-format > .ck.ck-toolbar {
  --ck-ui-component-min-height: 30px;
  --ck-icon-size: 18px;
  padding: 0 8px;
  border: 0;
  border-radius: 999px;
  background-color: var(--rt-surface-3);
}
html.rt-gmail-actions md-dialog.sg-mail-editor .rt-compose-format > .ck.ck-toolbar .ck.ck-toolbar__separator {
  margin: 8px 4px;
  background-color: var(--rt-border-strong);
}
html.rt-gmail-actions md-dialog.sg-mail-editor .rt-compose-format > .ck.ck-toolbar .ck.ck-button {
  min-width: 30px;
  padding: 0 4px;
  border-radius: 8px;
}
/* The bottom bar: Send, Aa, attach, link, emoji, image, then more options */
html.rt-gmail-actions md-dialog.sg-mail-editor .rt-compose-actions {
  display: flex;
  order: 4;
  flex: none;
  align-items: center;
  gap: 2px;
  padding: 8px 8px 10px 16px;
}
html.rt-gmail-actions md-dialog.sg-mail-editor .rt-compose-tools {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  gap: 2px;
  min-width: 0;
}
html.rt-gmail-actions md-dialog.sg-mail-editor .rt-compose-actions .md-button.rt-send {
  min-width: 0;
  height: 36px;
  min-height: 36px;
  margin: 0 8px 0 0;
  padding: 0 24px;
  border-radius: 999px;
  background-color: var(--rt-primary);
  box-shadow: none;
  font-size: 14px;
  font-weight: 600;
  line-height: 36px;
  text-transform: none;
  color: #fff;
}
html.rt-gmail-actions md-dialog.sg-mail-editor .rt-compose-actions .md-button.rt-send:not([disabled]):hover { background-color: var(--rt-primary-hover); }
html.rt-gmail-actions md-dialog.sg-mail-editor .rt-compose-actions .md-button.rt-send[disabled] { opacity: .55; }
html.rt-gmail-actions md-dialog.sg-mail-editor .rt-compose-actions .md-button:not(.rt-send),
html.rt-gmail-actions md-dialog.sg-mail-editor .rt-compose-tools .ck.ck-button {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 36px;
  min-width: 36px;
  height: 36px;
  min-height: 36px;
  margin: 0;
  padding: 0;
  border-radius: 8px;
  color: var(--rt-text-2);
}
html.rt-gmail-actions md-dialog.sg-mail-editor .rt-compose-actions .md-button:not(.rt-send):hover { background-color: var(--rt-hover); color: var(--rt-text); }
html.rt-gmail-actions md-dialog.sg-mail-editor .rt-compose-actions .md-button md-icon {
  width: 20px;
  min-width: 20px;
  height: 20px;
  min-height: 20px;
  font-size: 20px;
  line-height: 20px;
  color: inherit;
}
html.rt-gmail-actions md-dialog.sg-mail-editor .rt-compose-tools .ck.ck-button .ck-icon { width: 20px; height: 20px; color: inherit; }
html.rt-gmail-actions md-dialog.sg-mail-editor .rt-compose-tools .ck.ck-dropdown__arrow { display: none; }
html.rt-gmail-actions md-dialog.sg-mail-editor .rt-compose-actions .md-button.rt-format-toggle.rt-on {
  background-color: var(--rt-surface-3);
  color: var(--rt-text);
}
html.rt-gmail-actions md-dialog.sg-mail-editor .rt-compose-actions > md-menu { margin-left: auto; }
@media (max-width: 599px) {
  html.rt-gmail-composer md-dialog.sg-mail-editor .rt-compose-min { display: none; }
  html.rt-gmail-actions md-dialog.sg-mail-editor .rt-compose-actions { padding-bottom: calc(10px + env(safe-area-inset-bottom)); }
}
`);
    if (app === 'contacts') sheet('rabbittech-sogo-contacts', String.raw`
/* ---------------------------------------------------- list and contact cards */
html.rt-gmail [ui-view="addressbook"] > .sg-block-print {
  position: relative;
  gap: var(--rt-g-gap);
  padding: 0 var(--rt-g-gap) var(--rt-g-gap) calc(var(--rt-g-gap) * var(--rt-g-left));
}
html.rt-gmail [ui-view="addressbook"] .view-list,
html.rt-gmail [ui-view="addressbook"] #detailView.view-detail {
  border-radius: 16px;
  background-color: var(--rt-surface) !important;
  box-shadow: none;
  overflow: hidden;
}
html.rt-gmail [ui-view="addressbook"] .view-list > md-toolbar:not(.md-menu-toolbar) { min-height: 48px; }
html.rt-gmail [ui-view="addressbook"] .view-list > md-toolbar > .md-toolbar-tools { height: 48px; max-height: 48px; padding: 0 8px 0 12px; }
html.rt-gmail [ui-view="addressbook"] .view-list .sg-folder-name { margin: 0 8px 0 4px; font-size: 16px; font-weight: 650; letter-spacing: -.01em; }
html.rt-gmail #contactsList > .md-subheader .md-subheader-inner { padding: 6px 16px; }
html.rt-gmail #contactsList > .md-subheader { font-size: 12px; font-weight: 500; }
html.rt-gmail #contactsList > .md-subheader md-icon { font-size: 16px; }
/* Rows stay 56px apart (md-item-size); they lift under the pointer, the open one is a tint */
html.rt-gmail #contactsList md-list-item { height: 56px; min-height: 56px; border: 0; background-color: var(--rt-surface); }
html.rt-gmail #contactsList md-list-item::before { display: none; }
html.rt-gmail #contactsList md-list-item:not(.md-bg):hover { z-index: 2; box-shadow: var(--rt-g-lift); }
html.rt-gmail #contactsList md-list-item .md-no-style.md-button:not([disabled]):hover,
html.rt-gmail #contactsList md-list-item .md-no-style.md-button:not([disabled]):focus { background-color: transparent; }
html.rt-gmail .sg-section-list md-list-item.md-default-theme.md-accent.md-hue-2.md-bg,
html.rt-gmail #contactsList md-list-item.md-bg {
  border-left: 0;
  background-color: var(--rt-primary-soft) !important;
  box-shadow: none;
}
html.rt-gmail #contactsList md-list-item .sg-md-subhead { font-size: 14px; font-weight: 600; color: var(--rt-text); }
html.rt-gmail #contactsList md-list-item .sg-md-body { font-size: 13px; color: var(--rt-muted); }
@media (max-width: 599px) {
  html.rt-gmail [ui-view="addressbook"] .view-list,
  html.rt-gmail [ui-view="addressbook"] #detailView.view-detail { border-radius: 0; }
}

/* The open contact, like Google Contacts: a large avatar and the name, then label and value rows */
html.rt-gmail #detailView md-card,
html.rt-gmail #detailView md-card.md-default-theme { margin: 0; border: 0; border-radius: 0; box-shadow: none; background: transparent; }
html.rt-gmail #detailView md-card > md-card-actions { min-height: 56px; padding: 4px 8px; border-bottom: 0; }
html.rt-gmail #detailView md-card > md-card-content { padding: 0 32px 32px; }
html.rt-gmail #detailView .msg-header { display: flex; align-items: center; gap: 24px; padding: 8px 0 24px; border-bottom: 1px solid var(--rt-border); }
html.rt-gmail #detailView .msg-header > sg-avatar-image {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 88px;
  height: 88px;
  margin: 0;
  border-radius: 50%;
  background-color: var(--rt-primary-soft);
  overflow: hidden;
}
html.rt-gmail #detailView .msg-header > sg-avatar-image md-icon:first-child { font-size: 48px !important; width: 48px; height: 48px; color: var(--rt-primary-text); }
html.rt-gmail #detailView .msg-header > sg-avatar-image img { width: 88px !important; height: 88px !important; border-radius: 50%; }
html.rt-gmail #detailView .msg-header-content { padding: 0; }
html.rt-gmail #detailView .msg-header .sg-md-display-2--thin { font-size: 28px; font-weight: 650; line-height: 1.2; letter-spacing: -.02em; color: var(--rt-text); }
html.rt-gmail #detailView .msg-header .sg-md-display-2-subheader--thin { margin-top: 4px; font-size: 15px; color: var(--rt-muted); }
html.rt-gmail #detailView .msg-header md-chips .md-chips { padding: 6px 0 0; }
html.rt-gmail #detailView .msg-body { padding-top: 12px; }
html.rt-gmail #detailView .msg-body .pseudo-input-container {
  display: grid;
  grid-template-columns: 140px 1fr;
  align-items: baseline;
  gap: 16px;
  min-height: 0;
  margin: 0;
  padding: 12px 0;
  border-bottom: 1px solid var(--rt-border);
}
html.rt-gmail #detailView .msg-body .pseudo-input-label {
  position: static;
  transform: none;
  margin: 0;
  padding: 0;
  font-size: 13px;
  font-weight: 500;
  color: var(--rt-muted);
  text-transform: capitalize;
}
html.rt-gmail #detailView .msg-body .pseudo-input-field { min-height: 0; padding: 0; font-size: 15px; color: var(--rt-text); }
html.rt-gmail #detailView .msg-body .pseudo-input-field a { color: var(--rt-primary-text); text-decoration: none; }
html.rt-gmail #detailView .msg-body .pseudo-input-field a:hover { text-decoration: underline; }
/* The editor's header: the card's own colours instead of a violet bar; Save stands out */
html.rt-gmail #detailView md-card > md-toolbar:not(.md-menu-toolbar),
html.rt-gmail #detailView md-card > md-toolbar.md-default-theme:not(.md-menu-toolbar) {
  min-height: 64px;
  border-bottom: 1px solid var(--rt-border);
  background-color: var(--rt-surface);
  color: var(--rt-text);
  box-shadow: none;
}
html.rt-gmail #detailView md-card > md-toolbar .md-toolbar-tools { color: var(--rt-text); font-size: 20px; font-weight: 650; letter-spacing: -.01em; }
html.rt-gmail #detailView md-card > md-toolbar md-icon { color: var(--rt-muted); }
html.rt-gmail #detailView md-card > md-toolbar .md-button.md-icon-button:not([disabled]):hover { background-color: var(--rt-hover); }
html.rt-gmail #detailView md-card > md-toolbar .md-button[ng-click^="editor.save"]:not([disabled]) { background-color: var(--rt-primary); }
html.rt-gmail #detailView md-card > md-toolbar .md-button[ng-click^="editor.save"]:not([disabled]) md-icon { color: #fff; }
html.rt-gmail #detailView md-card > md-toolbar .md-button[ng-click^="editor.save"]:not([disabled]):hover { background-color: var(--rt-primary-hover); }
@media (max-width: 599px) {
  html.rt-gmail #detailView md-card > md-card-content { padding: 0 16px 24px; }
  html.rt-gmail #detailView .msg-body .pseudo-input-container { grid-template-columns: 1fr; gap: 2px; }
}
`);
    if (app === 'calendar') sheet('rabbittech-sogo-calendar', String.raw`
/* -------------------------------------------------------------- sidebar */
html.rt-gmail md-sidenav md-list-item.sg-calendar-list-item {
  height: 40px;
  min-height: 40px;
  margin: 0 12px 0 0;
  padding-left: 8px;
  border-radius: 0 999px 999px 0;
}
html.rt-gmail md-sidenav md-list-item.sg-calendar-list-item:hover { background-color: var(--rt-hover); }
html.rt-gmail md-sidenav md-list-item.sg-calendar-list-item .sg-item-name { display: block; flex: 1 1 auto; min-width: 0; max-width: none; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }

/* ------------------------------------------------- the event list and the calendar, as cards */
html.rt-gmail [ui-view="calendars"] .view-main > div.md-flex {
  position: relative;
  gap: var(--rt-g-gap);
  padding: 0 var(--rt-g-gap) var(--rt-g-gap) calc(var(--rt-g-gap) * var(--rt-g-left));
}
html.rt-gmail [ui-view="calendars"] .view-list,
html.rt-gmail [ui-view="calendars"] #detailView.view-detail {
  position: relative;
  border-radius: 16px;
  background-color: var(--rt-surface) !important;
  box-shadow: none;
  overflow: hidden;
}
html.rt-gmail [ui-view="calendars"] .view-list.view-list--close { margin-right: calc(-25vw - var(--rt-g-gap)); }
html.rt-gmail [ui-view="calendars"] .view-list > md-toolbar:not(.md-menu-toolbar) { min-height: 48px; }
html.rt-gmail [ui-view="calendars"] .view-list > md-toolbar > .md-toolbar-tools { height: 48px; max-height: 48px; padding: 0 8px 0 12px; }
html.rt-gmail [ui-view="calendars"] #detailView md-card,
html.rt-gmail [ui-view="calendars"] #detailView md-card.md-default-theme {
  inset: 0;
  margin: 0;
  border: 0;
  border-radius: 0;
  box-shadow: none;
  background: transparent;
}
@media (max-width: 599px) {
  html.rt-gmail [ui-view="calendars"] .view-list { border-radius: 0; }
}

/* The calendar's header, like Google Calendar's: Today, back and forward, the date, the views */
html.rt-gmail [ui-view="calendars"] #detailView md-card > md-card-actions {
  gap: 4px;
  min-height: 64px;
  margin: 0;
  padding: 0 12px;
  border-bottom: 1px solid var(--rt-border);
}
html.rt-gmail #detailView md-card > md-card-actions > .md-button[ng-click^="toggleCenter"] { order: -2; }
html.rt-gmail #detailView md-card > md-card-actions > .md-button[ng-click="calendar.changeDate($event, null, true)"] {
  order: -1;
  height: 36px;
  min-height: 36px;
  margin: 0 8px 0 4px;
  padding: 0 18px;
  border: 1px solid var(--rt-border-strong);
  border-radius: 999px;
  color: var(--rt-text);
  font-size: 14px;
  font-weight: 600;
  line-height: 34px;
  text-transform: none;
}
html.rt-gmail #detailView md-card > md-card-actions > .md-button[ng-click="calendar.changeDate($event, null, true)"]:hover { background-color: var(--rt-hover); }
html.rt-gmail #detailView md-card > md-card-actions > .md-button.md-icon-button { border-radius: 50%; }
html.rt-gmail #detailView md-card > md-card-actions md-datepicker { margin-left: 4px; }
html.rt-gmail #detailView md-card > md-card-actions md-datepicker .md-datepicker-input-container { border-bottom: 0; }
html.rt-gmail #detailView md-card > md-card-actions md-datepicker .md-datepicker-input {
  min-width: 0;
  max-width: none;
  color: var(--rt-text);
  font-size: 20px;
  font-weight: 650;
  letter-spacing: -.01em;
}
html.rt-gmail #detailView md-card > md-card-actions md-datepicker .md-datepicker-button md-icon { color: var(--rt-muted); }
/* Day, week, month and columns as one group; the current view is marked */
html.rt-gmail #detailView md-card > md-card-actions > a.md-button[ng-click^="calendar.changeView"] {
  width: 44px;
  height: 36px;
  min-height: 36px;
  margin: 0 0 0 -4px;
  border-radius: 0;
  background-color: var(--rt-surface-2);
}
html.rt-gmail #detailView md-card > md-card-actions > a.md-button[ng-click*="'day'"] { margin-left: 0; border-radius: 999px 0 0 999px; }
html.rt-gmail #detailView md-card > md-card-actions > a.md-button[ng-click*="'multicolumnday'"] { margin-right: 8px; border-radius: 0 999px 999px 0; }
html.rt-gmail #detailView md-card > md-card-actions > a.md-button[ng-click^="calendar.changeView"]:not([disabled]):hover { background-color: var(--rt-hover); }
html.rt-gmail #detailView md-card > md-card-actions > a.md-button[ng-click^="calendar.changeView"][disabled] { background-color: var(--rt-primary-soft-2); opacity: 1; }
html.rt-gmail #detailView md-card > md-card-actions > a.md-button[ng-click^="calendar.changeView"][disabled] md-icon { color: var(--rt-primary-text); }

/* The grid: events as rounded blocks with a hairline between neighbours */
html.rt-gmail [ui-view="calendars"] sg-calendar-day .sg-event,
html.rt-gmail [ui-view="calendars"] sg-calendar-month-day .sg-event { border-radius: 6px; box-shadow: 0 0 0 1px var(--rt-surface); }
html.rt-gmail [ui-view="calendars"] sg-calendar-day .sg-event .eventInside .text { top: 2px; padding: 0 6px; font-size: 12px; font-weight: 600; line-height: 1.35; }
html.rt-gmail [ui-view="calendars"] .hours .hour { font-size: 11px; color: var(--rt-muted); }

/* Month: weekday names as small column headings, day numbers in the text colour */
html.rt-gmail [ui-view="calendars"] md-toolbar.monthView .dayLabels {
  padding: 8px 0 6px;
  color: var(--rt-muted);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: .06em;
  text-align: center;
  text-transform: uppercase;
}
html.rt-gmail [ui-view="calendars"] .sg-calendar-tile-header { color: var(--rt-text-2); font-size: 12px; font-weight: 600; }

/* The event list as an agenda: a dot in the calendar's colour instead of a coloured card */
html.rt-gmail-colors [ui-view="calendars"] .view-list .sg-event[class*="bg-folder"] {
  position: relative;
  margin: 0 8px 2px 0;
  padding: 8px 8px 8px 30px;
  border-radius: 8px;
  background-color: transparent !important;
  color: var(--rt-text) !important;
  box-shadow: none;
}
html.rt-gmail-colors [ui-view="calendars"] .view-list .sg-event[class*="bg-folder"]::before {
  content: "";
  position: absolute;
  top: 13px;
  left: 10px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background-color: var(--rt-folder, var(--rt-primary));
}
html.rt-gmail-colors [ui-view="calendars"] .view-list .sg-event[class*="bg-folder"]:hover { background-color: var(--rt-hover) !important; }
html.rt-gmail-colors [ui-view="calendars"] .view-list .sg-event[class*="bg-folder"] md-icon,
html.rt-gmail-colors [ui-view="calendars"] .view-list .sg-event[class*="bg-folder"] .secondary { color: var(--rt-muted) !important; }
html.rt-gmail [ui-view="calendars"] .view-list .sg-event .text { font-size: 14px; font-weight: 600; }
html.rt-gmail [ui-view="calendars"] .view-list .sg-calendar-date { color: var(--rt-text-2); }
`);
    if (app === 'prefs') sheet('rabbittech-sogo-prefs', String.raw`
/* ---------------------------------------------------------------- top bar */
html.rt-gmail-toolbar .toolbar-main > .rt-page-title {
  order: 2;
  flex: 1 1 auto;
  min-width: 0;
  margin: 0 0 0 8px;
  overflow: hidden;
  color: var(--rt-text);
  font-size: 22px;
  font-weight: 500;
  letter-spacing: -.01em;
  white-space: nowrap;
  text-overflow: ellipsis;
}
/* Phones: the app buttons need the room; the tabs say where you are */
@media (max-width: 599px) {
  html.rt-gmail-toolbar .toolbar-main > .rt-page-title { display: none; }
}
/* The settings button by the logo: the current place, like the current app in the top bar */
html.rt-gmail-here md-sidenav > md-toolbar .md-button.rt-here[disabled] { background-color: var(--rt-primary-soft-2); opacity: 1; }
html.rt-gmail-here md-sidenav > md-toolbar .md-button.rt-here[disabled] md-icon { color: var(--rt-primary-text); }

/* ------------------------------------------------- each section's tabs on a card */
html.rt-gmail form[name="preferencesForm"] > section > md-content {
  flex: 1 1 auto;
  min-height: 0;
  padding: 0 var(--rt-g-gap) var(--rt-g-gap) calc(var(--rt-g-gap) * var(--rt-g-left));
  background-color: var(--rt-bg);
}
html.rt-gmail [ui-view="module"] { display: flex; flex: 1 0 auto; flex-direction: column; }
html.rt-gmail [ui-view="module"] md-tabs {
  flex: 1 0 auto;
  border-radius: 16px;
  background-color: var(--rt-surface);
  overflow: hidden;
}
@media (max-width: 599px) {
  html.rt-gmail [ui-view="module"] md-tabs { border-radius: 0; }
}
html.rt-gmail [ui-view="module"] md-tabs-wrapper {
  padding: 0 12px;
  border-bottom: 1px solid var(--rt-border);
  background-color: transparent;
}
html.rt-gmail [ui-view="module"] md-tabs[md-border-bottom] md-tabs-wrapper { border-bottom-color: var(--rt-border); }
html.rt-gmail [ui-view="module"] md-tabs-canvas md-tab-item:not([disabled]) {
  min-width: 0;
  max-width: none;
  padding: 12px 16px;
  color: var(--rt-muted);
  font-size: 14px;
  font-weight: 600;
}
html.rt-gmail [ui-view="module"] md-tabs-canvas md-tab-item:not([disabled]):hover { color: var(--rt-text); }
html.rt-gmail [ui-view="module"] md-tabs-canvas md-tab-item.md-active:not([disabled]) { color: var(--rt-primary-text); }
html.rt-gmail [ui-view="module"] md-tabs md-ink-bar {
  height: 3px;
  border-radius: 3px 3px 0 0;
  background-color: var(--rt-primary);
  color: var(--rt-primary);
}
/* A tab's settings: one readable column */
html.rt-gmail [ui-view="module"] md-tab-content > div { padding: 12px 24px 24px; }
html.rt-gmail [ui-view="module"] md-tab-content > div > * { max-width: 880px; box-sizing: border-box; }
@media (max-width: 599px) {
  html.rt-gmail [ui-view="module"] md-tab-content > div { padding: 8px 4px 16px; }
}
html.rt-gmail [ui-view="module"] md-content.md-default-theme,
html.rt-gmail [ui-view="module"] md-content { background-color: transparent; }
/* Sub-options sit a fixed step in from the option they belong to */
html.rt-gmail [ui-view="module"] [flex-offset="5"] { margin-left: 32px; }
@media (max-width: 599px) {
  html.rt-gmail [ui-view="module"] [flex-offset="5"] { margin-left: 16px; }
}
html.rt-gmail [ui-view="module"] .md-title {
  margin: 24px 0 4px;
  color: var(--rt-text);
  font-size: 15px;
  font-weight: 650;
  letter-spacing: 0;
}
html.rt-gmail [ui-view="module"] .sub-information,
html.rt-gmail [ui-view="module"] .sg-hint { color: var(--rt-muted); font-size: 12.5px; line-height: 1.5; }
/* Create, Add and Reset buttons: outlined pills at the start of the row */
html.rt-gmail [ui-view="module"] md-tab-content [layout-align="end center"]:has(> .md-button:not(.sg-icon-button):not(.md-icon-button)) { justify-content: flex-start; }
html.rt-gmail [ui-view="module"] md-tab-content .md-button:not(.md-icon-button):not(.sg-icon-button):not(.md-fab) {
  min-height: 36px;
  height: 36px;
  margin: 8px 8px 0 0;
  padding: 0 18px;
  border: 1px solid var(--rt-border-strong);
  border-radius: 999px;
  background-color: var(--rt-surface);
  color: var(--rt-primary-text);
  font-size: 14px;
  line-height: 34px;
}
html.rt-gmail [ui-view="module"] md-tab-content .md-button:not(.md-icon-button):not(.sg-icon-button):not(.md-fab):not([disabled]):hover {
  border-color: transparent;
  background-color: var(--rt-primary-soft);
}
html.rt-gmail [ui-view="module"] md-tab-content .md-button.sg-icon-button md-icon { color: var(--rt-muted); }

/* ------------------------------------------------------------- Save bar */
html.rt-gmail-save .rt-save-bar {
  flex: none;
  gap: 16px;
  margin: 0 var(--rt-g-gap) var(--rt-g-gap) calc(var(--rt-g-gap) * var(--rt-g-left));
  padding: 10px 12px 10px 24px;
  border-radius: 16px;
  background-color: var(--rt-surface);
  box-shadow: var(--rt-g-lift);
}
html.rt-gmail-save form[name="preferencesForm"] > section > md-content:has(+ .rt-save-bar:not(.ng-hide)) { padding-bottom: 12px; }
html.rt-gmail-save .rt-save-note { color: var(--rt-text-2); font-size: 14px; font-weight: 500; }
html.rt-gmail-save .rt-save-bar .md-button.rt-save {
  min-width: 96px;
  height: 40px;
  margin: 0;
  padding: 0 24px;
  border-radius: 999px;
  line-height: 40px;
}
@media (max-width: 599px) {
  html.rt-gmail-save .rt-save-bar { justify-content: space-between; border-radius: 0; }
}

/* ------------------------------------------- account and filter dialogs (fetched, CSS only) */
html.rt-gmail :is(#accountForm, #filterForm) md-dialog-actions .md-button {
  min-height: 36px;
  height: 36px;
  margin: 0 0 0 8px;
  padding: 0 18px;
  border-radius: 999px;
  line-height: 36px;
}
/* OK: the account dialog's md-primary button, the filter dialog's submit button */
html.rt-gmail :is(#accountForm .md-button.md-primary, #filterForm .md-button[type="submit"]):not([disabled]) {
  background-color: var(--rt-primary);
  color: #fff;
}
html.rt-gmail :is(#accountForm .md-button.md-primary, #filterForm .md-button[type="submit"]):not([disabled]):hover { background-color: var(--rt-primary-hover); }
html.rt-gmail :is(#accountForm, #filterForm) md-dialog-content .md-button:not(.md-icon-button):not(.sg-icon-button) { border-radius: 999px; color: var(--rt-primary-text); }
/* The filter's rules and actions: one white sheet with a line between them */
html.rt-gmail #filterForm md-dialog-content.sg-has-form-sections { background-color: var(--rt-surface) !important; }
html.rt-gmail #filterForm .sg-form-section { margin: 0; box-shadow: none; }
html.rt-gmail #filterForm .sg-form-section + .sg-form-section { border-top: 1px solid var(--rt-border); }
`);
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
