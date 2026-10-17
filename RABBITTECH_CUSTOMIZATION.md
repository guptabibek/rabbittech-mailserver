# RabbitTech Mailcow Customization

This branch keeps Mailcow close to upstream and applies a RabbitTech UI layer on top of the stock
Twig + Bootstrap 5.1 interface. Every Mailcow feature and its JavaScript keep working.

## What changed

### Design system

- `data/web/css/build/016-rabbittech.css` holds the whole theme. It is bundled after every upstream
  stylesheet, so it restyles the UI without editing upstream CSS. `014-mailcow.css` is back to its
  upstream version.
- It is token-based. `:root` holds the light theme (the default), and `:root[data-theme="dark"]`
  swaps the same tokens for dark mode.
- The theme covers Bootstrap components, DataTables, bootstrap-select, modals, alerts and
  notifications.
- Typography is Inter, self-hosted in `data/web/fonts/` (SIL Open Font License, see `inter-OFL.txt`).

### Dark mode

- The toggle sets `<html data-theme="dark">` and stores the choice in `localStorage.mailcow_theme`.
- An inline script in `base.twig` applies the stored choice before first paint, and
  `js/build/013-mailcow.js` handles the toggle.
- Light is the default; the OS dark-mode preference is not followed automatically.
- Upstream's `css/themes/mailcow-darkmode.css` is no longer loaded. That file was served with
  `expires max`, so browsers kept stale copies; the dark tokens are now part of the hashed CSS bundle.

### App shell and information architecture

The console is a sidebar application. mailcow's nested tab menus ("Access ▾", "Options ▾",
"Logs ▾") are reorganised into task-based sections that differ per role:

| Role | Sections |
|---|---|
| Admin | Overview · E-Mail (domains, mailboxes, aliases, resources, sync jobs, filters, address rewriting, templates, quarantine, mail queue) · Security (spam filter, DKIM, TLS policies, Fail2ban, password policy) · Access (administrators, identity provider, OAuth2 apps) · System (routing, notifications, Rspamd UI, branding, logs) |
| Domain admin | E-Mail (domains to quarantine) · Access (account settings) |
| User | E-Mail (overview, addresses, preferences, spam filter, quarantine) · Tools (app passwords, sync jobs, push notifications), filtered by the user's ACL |

How it works:

- **`templates/rabbittech/nav.twig`** defines the sidebar. Each entry lists the mailcow tab panes it
  covers. The first pane opens by default; several panes become a sub-navigation on the page, for
  example Logs → Postfix | Dovecot | ….
- **`js/build/014-rabbittech.js`** runs the shell:
  - It opens the right pane and keeps the URL in sync as `#/<pane>`, so back/forward and bookmarks work.
  - It fills the page header (section, title, description) and shows the entry's primary action
    (e.g. "Add mailbox") in the header, hiding the duplicate buttons inside the page.
  - It runs the command palette (Ctrl/⌘ K or `/`) for pages and actions.
  - It handles the collapsible icon rail and the mobile drawer.
  - It loads the live counts on the Overview page.
- **Upstream compatibility:** the sidebar hides each page's original tab strip (`.rt-managed-tabs`).
  If upstream adds a tab that `nav.twig` doesn't list, that strip reappears automatically, so the new
  page stays reachable until it gets a sidebar entry.
- **Overview** (`dashboard.twig`):
  - A "Needs attention" card, shown only when something is wrong, most severe first:
    - a stopped or unhealthy container, mail storage at 85% or more, or 50+ messages in the queue;
    - the TLS certificate nginx actually serves: still mailcow's placeholder (no certificate issued
      yet), expired, or expiring within 14 days. The reason comes from the ACME container's own log
      (for example "DNS has an IPv6 (AAAA) record … but mailcow runs without IPv6"), with a link to
      that log;
    - backups: none yet, turned off, failed (with the reason), older than 36 hours, or the
      off-site copy failed (see [Backups](#backups));
    - the restore test: failed (naming the check that failed), or not run for the interval plus
      3 days while backups do run (see [Restore test](#restore-test));
    - mail DNS, for every active domain: MX pointing here, SPF including this server's IP (`ip4:`
      ranges included), the DKIM key published, a DMARC record, and reverse DNS of the server's IP.
      With an MTA-STS policy: its TXT record with the current id, the policy reachable over HTTPS
      at `mta-sts.<domain>` with a valid certificate, and every MX host listed in it (a danger in
      enforce mode, where senders refuse the others), plus a TLS reporting record. When reports
      are collected (see [Mail reports](#mail-reports)): DMARC and TLS reports sent to the reports
      mailbox, and other domains' consent records for it. Domains with the same problem share one
      alert, which links to the domain's Mail security tab when only one domain has it;
    - mail reports: reading them failed (with the reason) or stopped, this server's own mail
      failed DMARC at a provider in the last 7 days, or servers couldn't deliver over TLS (with the
      most common failure).
  - The certificate and DNS results are cached in Redis (6 hours when fine, 1 hour while something
    is wrong); "Check again" (`?recheck=1`) clears them. A check that can't run raises no alert.
  - The server card shows when the last backup was made, and when the last restore test ran,
    with ✓ or ✗ ("Off" when restore tests are turned off).
  - A Mail reports card: the last 30 days of DMARC and TLS reports. Per domain the messages
    providers saw and how many passed DMARC, and secure deliveries out of all; then who sends mail
    as your domains (reverse DNS name, this server marked, failures counted). Until reports are
    collected it says how to start.
  - Live counts of domains, mailboxes, aliases, queued mail and quarantine. The quarantine is
    counted on the server; the others are read from `/api/v1`.
  - A server status card and quick actions.
  - CPU and memory charts.
  - A service grid, where expanding a container shows its I/O charts.
- **Edit pages** show a back link to their list and the edited object as the page title.
- **Sign-in pages** (`*_index.twig`, `reset-password.twig`) use a split screen: brand panel
  (`templates/rabbittech/auth-hero.twig`) and form. Form fields and IDs are unchanged.
- **Pages without a signed-in user** (quarantine release links) get a simple branded header.
- **Brand mark** (`templates/rabbittech/brand.twig`): an inline SVG plus wordmark. A logo uploaded
  under Branding replaces it, with separate light and dark logos.
- **`inc/header.inc.php`** exposes the session ACL as `rt_acl`, so the sidebar shows only the
  modules a user may use.

### Page designs

The content of every page follows the same patterns, so the console reads as one product:

- **Tables** (all DataTables, `js/build/014-rabbittech.js`):
  - Search and page size without label clutter.
  - A select-all checkbox in the header replaces "Toggle all", and the toolbar shows "N selected".
  - Row actions are icon buttons with tooltips.
  - Mailboxes, domains and aliases show an avatar or icon with the name, usage bars for storage and
    limits, "last active 2 hours ago via IMAP" and alias targets as chips. The renderers
    (`window.rt.identity`, `rt.usage`, `rt.lastActive`, `rt.chips`) are used from `js/site/mailbox.js`.
  - After the row actions shrink to icons, the responsive columns are measured again, so more
    columns fit.
- **Forms** (CSS only, no template changes):
  - Dialogs stack their labels above the fields.
  - Settings pages use a fixed label column with a divider between rows.
  - On/off checkboxes are switches.
  - On long forms, the save button stays visible at the bottom.
- **Edit pages** for a mailbox or domain open with a summary (`templates/rabbittech/summary-*.twig`):
  - Mailbox: avatar, name, status, storage, messages, last login and dates, plus "Log in as".
  - Domain: mailboxes, aliases and quota used against their limits, and stored mail.
- **User pages:**
  - Overview: account summary with the webmail button, then sign-in security (password, recovery
    email, 2FA, FIDO2), mail apps and devices (protocol access, Apple profiles, setup guides) and
    recent sign-ins.
  - Addresses: grouped into "Receiving" and "Sending".
  - Preferences: grouped into "Mail handling", "Quarantine" and "Reset", with segmented controls.
- **Administrators** lists administrators and domain administrators first. Your own 2FA/FIDO2 is
  in its own card, and the API keys are a collapsible card. The 2FA/FIDO2 rows are shared with the
  user overview and the domain-admin account page (`templates/rabbittech/security-settings.twig`).
- **Mail security** is a tab on each domain's edit page (`templates/rabbittech/mail-security*.twig`),
  see [Mail security](#mail-security).
- **DKIM** shows one bordered row per domain. This also fixes an upstream bug: domains without a
  key were hidden although the "Key missing" filter was on.

### Languages

- Every string the RabbitTech layer adds lives in a `rabbittech` section of
  `data/web/lang/lang.en-gb.json`. mailcow loads English first and merges the page language over it,
  so the other 32 languages show these strings in English until a `rabbittech` section is added to
  their file. Existing mailcow keys are reused wherever one fits.
- Templates read them as `lang.rabbittech.*` (aliased to `t`). Scripts read them from the
  `lang_rt` object through `rt.t('key')`, set up in `base.twig` from `inc/footer.inc.php`.
- Dates, relative times ("2 hours ago") and numbers are formatted in the browser with `Intl` for the
  page language. Templates print plain values marked `data-rt-date`, `data-rt-time` or
  `data-rt-number`; sizes use binary units (KiB, MiB, GiB).

### Accessibility and resilience

- Colours meet WCAG AA contrast in both themes. Buttons use separate, darker fill tokens
  (`--rt-primary-fill`, `--rt-danger-fill`), and form controls use `--rt-control-border`.
- Every focusable element shows a 2px outline when reached by keyboard. A "Skip to content" link
  jumps past the sidebar, and the closed mobile drawer is `inert`.
- Headings follow the page outline (h1 page title, h2 cards, h3 items), logout and "Restart webmail"
  are real buttons, and pinch-zoom is allowed.
- On touch screens, icon buttons, pagination and navigation links have larger hit areas. Motion is
  reduced when the OS asks for it, and pages print without the shell.
- The page stays usable without the shell script. mailcow's tab strips stay visible until
  `014-rabbittech.js` has started (`html.rt-shell-ready`), and if a script fails the header falls
  back to the plain back link. Layout rules that need `:has()` sit inside
  `@supports selector(:has(*))`.
- Two minutes before the session expires, a notice offers "Stay signed in" instead of the page
  reloading without warning.

### Emails

The default quota warning, quarantine digest and password reset emails
(`data/assets/templates/quota.tpl`, `quarantine.tpl`, `pw_reset_html.tpl`) use the RabbitTech
look: a text wordmark (no remote images, so nothing is blocked), a single violet button and
table-based, inline-styled markup that works across mail apps and on phones. They are read on
every send, so no restart is needed. A template saved in the admin UI takes
precedence over these files; reset it there to use them.

### Branding

People see RabbitTech names, not mailcow, SOGo or Rspamd. The technical names stay where only
admins act on them (container names, `/SOGo` URLs, Rspamd settings).

- **Console wording**: `data/web/lang/rabbittech.en-gb.json` replaces the mailcow strings that name
  mailcow, SOGo or Rspamd ("Restart webmail", "Spam filter result", "Back to sign-in"…). It has
  the same sections and keys as `lang.en-gb.json` and is applied in `inc/prerequisites.inc.php`
  wherever the page shows the English text, so a language that hasn't translated a string gets the
  RabbitTech wording too; real translations are kept. For another language, add
  `rabbittech.<locale>.json` with the translated replacements. `scripts/check-rabbittech-lang.php`
  checks that every key exists. UI texts and email templates saved in the admin UI take precedence.
- **Overview**: services are listed by what they do ("Spam filter", "Mailboxes (IMAP & POP3)"),
  with the container name underneath. mailcow's GUID and support-license card is left out.
  The log source "Mailcow UI" is "Console", and the System menu calls the Rspamd UI
  "Spam filter engine".
- **Mailboxes**: the authentication source "mailcow" shows as "Built-in" (the stored value is
  unchanged), and the SOGo column and row action are "Webmail".
- **Webmail address**: `/webmail` (`data/web/webmail.php`) signs a mailbox user into webmail and
  sends everyone else to the sign-in page. The Apps menu, the user page and the account setup files
  for mail apps link there. Webmail itself still runs under `/SOGo/so/…`: that path is built into
  SOGo and into the DAV and ActiveSync addresses mail apps already use.
- **Webmail**: the browser tab says "RabbitTech Webmail" (`SOGoPageTitle` in `sogo.conf`), and
  `custom-sogo.js` renames the "mailcow Preferences" button tooltip to "RabbitTech Mail
  Preferences" before Angular starts (the button comes from a patch baked into the SOGo image).
- **Mail apps**: autodiscover reports "RabbitTech Mail" (`$autodiscover_config` in
  `inc/vars.inc.php`), and the Apple configuration profile names it as the organization.
- **Mail headers**: Postfix introduces itself as RabbitTech (`mail_name` in
  `data/conf/postfix/main.cf`), in the SMTP greeting and in `Received` headers.
  `anonymize_headers.pcre` matches that name, so keep both in step.
- **Starting-up page**: `data/web/_status.502.html` is what nginx shows while the console or
  webmail is restarting. It retries every 20 seconds and keeps the troubleshooting commands in a
  collapsed "For administrators" section (no retries while it is open).
- **Kept on purpose**: SOGo's `User-Agent` header on outgoing mail, container and service names in
  `docker compose`, and mailcow's names inside admin-only Rspamd and Keycloak settings.

### Assets

- `data/web/img/rabbittech_mailcow.svg` (light background) and `rabbittech_mailcow_dark.svg`:
  lockups with outlined text, so they render the same without the web font.
- `data/web/img/rabbittech_webmail.svg` and `rabbittech_webmail_dark.svg`: the same lockups with
  "Webmail" as the subtitle, used in SOGo.
- `data/web/img/rabbittech_mark.svg`: the mark on its own.
- `data/web/fonts/rabbittech-icons-outlined.woff2`: the webmail icon font (licence next to it).
- `data/web/img/app/`: the installable webmail's icons; `data/web/webmail.webmanifest` lists them.
- `data/web/favicon.png`: generated from the mark.

### SOGo webmail

Webmail keeps SOGo 5.12 for mail, calendar, contacts and ActiveSync. It is restyled through SOGo's
two supported hooks, both loaded on every SOGo page (`SOGoUIAdditionalJSFiles` in
`data/conf/sogo/sogo.conf`):

- **`data/conf/sogo/custom-theme.js`** (mounted as `js/theme.js`): the colour palettes.
  - Light uses the console's violet and greys. Dark uses a dark background palette, and only when
    the stylesheet below is present.
  - In production SOGo also links `css/theme-default.css`, a pre-built copy of its stock teal and
    green theme. It loads after the colours generated from `theme.js` and wins, which is why
    webmail used to look stock. Once the palette is configured, that link is removed.
  - Any error leaves SOGo's own theme in place.
- **`data/conf/sogo/custom-sogo.js`**: the RabbitTech stylesheet, embedded and added before
  Angular starts, so pages never flash the stock look and no extra file or mount is needed.
  - It covers the top bar, the folder sidebar, message and contact lists, the reading pane,
    compose (including CKEditor 5), dialogs, menus, Preferences controls, calendar and contacts.
  - The top bar becomes an app switcher that highlights the current app, and the big date is hidden.
    The sidebar starts with the RabbitTech webmail logo (`data/web/img/rabbittech_webmail*.svg`).
  - Icons are outlined instead of SOGo's heavy filled set: `data/web/fonts/rabbittech-icons-outlined.woff2`
    is Google's Material Icons Outlined (Apache-2.0) with two extra names, built by
    `scripts/build-webmail-icons.py`. SOGo writes icons as names ("inbox", "delete"); every name in
    SOGo 5.12's templates and scripts exists in it. A flagged star stays filled, so flagged
    messages still stand out.
  - List rows keep the heights SOGo's virtual scrolling relies on (56px messages and contacts,
    40px folders); separators are drawn with shadows so they add no height.
  - HTML mail keeps the sender's styling: rules that reach into a message use `:where()`, so the
    sender's CSS always wins. In dark mode, HTML mail and the compose area stay on a white sheet,
    because replies and newsletters carry their own dark text colours.
  - Webmail follows the console's light/dark choice (`localStorage.mailcow_theme`, same origin);
    switch it in the console and reload webmail.
  - The upstream `CKEDITOR.addCss(...)` line is guarded: SOGo 5 ships CKEditor 5, which has no
    `CKEDITOR` global, so that line threw an error on every page.
- **Mail, Calendar, Contacts and Settings laid out like Gmail** (also `custom-sogo.js`). In all
  four apps the top bar has the menu button and logo and the outlined app icons, and the sidebar
  items are pills. Mail, Calendar and Contacts also have a search box in the middle of the top
  bar that is always there. Mail:
  - Top bar: the folder search is a search box in the middle that is always there (the `s` key
    still focuses it, and emptying it shows the whole folder again). The menu button hides the
    folder list; the logo then moves into the top bar.
  - Folder list: a solid violet Compose button at the top, and folders as pills with bold unread counts.
  - Message list, in a card: from 960px wide one line per message (checkbox, star, sender,
    subject, icons, date). Read messages are tinted, unread ones white and bold. Under the pointer,
    Archive, Delete and Mark as read/unread take the date's place, and the star flags a message.
    Archive moves it to the `Archive` folder mailcow creates in every mailbox (not offered inside
    Archive); Delete is not offered in Trash, where SOGo deletes for good.
  - The list fills the width and an open message takes its place, with a back arrow and Archive.
  - The line above the list says the order in words ("Newest first", "Subject A–Z", "Largest
    first") instead of SOGo's "Order Received" and a sort icon. The Sort menu says "Date received"
    (when the message reached the mailbox) and "Date sent" (the date in the message) instead of
    "Order Received" and "Date". In English only; other languages keep SOGo's translated words.
  - Compose opens as a window at the bottom right (960px and wider) and the mail behind it stays
    usable. Phones keep SOGo's full-screen editor, with one compose button instead of SOGo's
    two-button menu.
  - The compose window is laid out like Gmail's:
    - A slim bar with the subject (or "New Message") and minimise, full screen and close. A
      minimised window is just that bar at the bottom right; a click on it opens it again.
    - From shows only when the account has more than one identity. To is one line with Cc and
      Bcc at its right, and Subject is a plain line.
    - The writing area fills the window and scrolls on its own.
    - CKEditor's toolbar is a rounded formatting bar under it, in Gmail's order: undo, redo,
      font, size, bold, italic, underline, text colour, alignment, numbered and bulleted lists,
      outdent, indent, then "more" (quote, clear formatting, table, source and HTML). In a
      narrow window the tail folds into "more" rather than wrapping.
    - A bottom bar has Send as a violet pill, Aa to hide or show the formatting bar (remembered
      in the browser), attach, link, emoji and image. The last ⋮ holds Save draft and SOGo's
      options (return receipt, priority, signing). Emoji opens CKEditor's characters on the
      emoticons. Attachments show above the formatting bar once there are some.
    - All of it is SOGo's and CKEditor's own controls, moved: sending, drafts, autosave,
      attachments, recipients and signatures work as before. Plain-text compose gets the same
      window without the formatting and editor buttons.
    - SOGo fetches this window's template over HTTP, so it isn't in the page. An `$http`
      interceptor changes its markup as it arrives, before Angular caches it, with the same
      fail-safe as the page templates: each part checks for the markup it needs and is skipped
      with a warning if SOGo's has changed.
  - `SOGoRefreshViewCheck = "every_minute"` in `sogo.conf`, so new mail shows up without
    reloading (users can change it in Preferences).
- Calendar, like Google Calendar:
  - A Create button at the top of the sidebar offers Event or Task. The add button stays on
    phones.
  - The search box searches the event list, and opens the list if it was folded away.
  - The calendar is a card. Its header has a Today pill, round back and forward buttons, the date
    and the day, week, month and columns views as one group, with the current one marked.
  - Events are rounded blocks. The event list on the left is an agenda, with a dot in each
    calendar's colour instead of a coloured card; month view has small weekday headings.
  - Event and task dialogs have a white header; the editor's title field reads as text.
- Contacts, like Google Contacts:
  - A Create contact button at the top of the sidebar offers Contact or Contact list. It is
    greyed out in address books you can't add to, like a global address book.
  - The contact list and the open contact are cards, with 56px rows that lift under the pointer.
  - A contact opens with a large avatar, the name and description, then label and value rows.
    The editor gets a white header with Save as the one coloured button.
- Settings (SOGo's Preferences), like Gmail's settings:
  - The top bar is the other apps' (no tall violet bar or big date), with "Settings" as the
    title. The logo leads to Mail, and the settings button by the logo shows as the current place.
  - The sections (General, Calendar, Address Book, Mail) are pills in the sidebar. Each section's
    tabs are text tabs with a violet underline on one card, with the settings in a readable
    column, sub-options indented and the Create, Add and Reset buttons as outlined pills.
  - Save is no longer a round button in the top bar: a bar under the page shows "Unsaved
    changes" and Save while something has changed. It runs SOGo's own save, and SOGo's
    "Preferences saved" message follows.
  - The account and filter dialogs (SOGo fetches them over HTTP) are only restyled: white
    header, the name field as the title, pill buttons.
  - The settings themselves stay where SOGo puts them, so upgrades keep working.
- How the layout works, in all four apps:
  - **How it works:** each app's main templates are `<script type="text/ng-template">` blocks in
    the page. Before Angular starts, `custom-sogo.js` parses them, changes them and writes them
    back, and registers the few Angular functions the new buttons call. Those use SOGo's own
    services (`toggleFlag`, `toggleRead`, `$deleteMessages`, `$moveMessages`, `newMessage`,
    the lists' `newComponent`). Settings needs none: its new markup calls SOGo's own
    `app.save` and `app.confirmChanges`.
  - Templates SOGo fetches over HTTP are only restyled, not rewritten: the calendar's day, week
    and month views, the event, task and contact editors, and Settings' account and filter
    dialogs. Each calendar's colour is also
    published as `--rt-folder` (a decorator on SOGo's `sgFolderStylesheet`), so the agenda can
    draw dots in it.
  - **Fail-safe:** each change first checks that the markup it needs is there. If a SOGo upgrade
    changed it, that change is skipped with a console warning ("RabbitTech mail layout: …",
    "RabbitTech calendar layout: …", "RabbitTech contacts layout: …", "RabbitTech prefs
    layout: …"). The styles that depend on
    it don't apply either (`html.rt-gmail-<change>`), so that part stays as SOGo has it instead
    of breaking.
  - **Classic layout:** a top bar button (columns icon) switches to SOGo's classic layout with the
    RabbitTech look, and back, in all four apps at once. The choice is kept per browser
    (`localStorage.rt_webmail_layout`). On Settings the button is a link (`?rt-layout=classic`
    or `?rt-layout=new`), so SOGo first asks whether to save unsaved changes, as it does for its
    other top bar buttons.
  - **Limits:** SOGo sends no preview text, so rows show the subject without Gmail's snippet.
    There are no inbox tabs, snooze or Gmail-style conversations. Rows stay 56px high, because
    SOGo's scrolling code relies on that height. Calendar has no mini month in the sidebar, and
    Today, back and forward stay in the calendar's header (they belong to the view SOGo fetches).
  - **After a SOGo upgrade**, run the UI tests (they run SOGo's real Mail, Calendar, Contacts
    and Settings apps, see below) and look for "RabbitTech … layout" warnings in the browser console on
    `/webmail`.
- **Caching:** these two files keep the same URL across releases, so nginx sends them with
  `Cache-Control: no-cache` (`data/conf/nginx/templates/sites-default.conf.j2`). A deploy restarts
  `sogo-mailcow` (which copies them into the web volume) and `nginx-mailcow`.
- **If an upgrade breaks webmail styling**, restore the stock look with
  `git checkout fd58a71 -- data/conf/sogo/custom-sogo.js data/conf/sogo/custom-theme.js` and
  `docker compose restart sogo-mailcow`.
- `custom-fulllogo.svg/png`, `custom-shortlogo.svg` and `custom-favicon.ico` carry the RabbitTech logo.

### Installable webmail

Webmail can be installed as an app: it gets its own icon on the phone's home screen or in the
computer's app list, and opens in its own window without tabs and an address bar. It is the same
webmail with the same sign-in.

- **Install:**
  - Android (Chrome): open `/webmail`, then menu → **Install app**.
  - iPhone/iPad (Safari): **Share → Add to Home Screen**.
  - Windows, macOS, Linux (Chrome or Edge): the install icon at the right of the address bar.
- **What opens:** `/webmail`. A signed-in user goes straight into webmail; anyone else signs in
  first and then lands in webmail (`index.php` already does that for mailbox users).
- **How:**
  - `data/web/webmail.webmanifest` describes the app: name "RabbitTech Webmail", short name
    "Webmail", start `/webmail`, scope the whole site (so signing in again stays in the window),
    and standalone display.
  - `custom-sogo.js` links it from every webmail page, adds the iPhone icon, and sets a window
    title bar colour that follows the light or dark theme.
- **Icons:** `data/web/img/app/` is built from the RabbitTech mark by `scripts/build-app-icons.mjs`.
  It holds the standard icons (192 and 512), a maskable one for Android's round and squircle
  shapes, and the iPhone icon. `/img/` is cached for a long time, so give changed icons new file
  names.
- **No service worker.** Chromium offers installation without one (the UI tests check its own
  verdict), so nothing sits in front of the console or SOGo's requests.

### CI

`.github/workflows/ci.yml` checks the theme assets, runs `node --check` on the touched JavaScript,
parses every Twig template with `scripts/check-twig-templates.php`, checks that every language file
is valid JSON and every RabbitTech string in use exists (`scripts/check-rabbittech-lang.php`), and
tests that a release sync keeps runtime files and admin-edited maps. It also runs the backup
script against a fake mailcow helper, including when it runs the restore test
(`tests/backup/test-backup.sh`), the health check and a full deploy and rollback with fake Docker
(`tests/deploy/test-deploy.sh`), the ACME log reader and SPF range check behind the Overview
alerts (`tests/php/overview-checks.php`), the mail security checks against a fake DNS and the
reading of real-world DMARC and TLS reports (`tests/php/mail-security.php`), and the report reader
with fake Docker (`tests/reports/test-mail-reports.sh`), and the front nginx site's helper and
deploy step with fake nginx (`tests/deploy/test-front-nginx.sh`).

A second job runs the UI smoke tests and uploads their screenshots as the `ui-screenshots` artifact.

A third job runs the restore test in real containers with the images the server runs
(`tests/backup/restore-e2e.sh`). It builds a small backup the way mailcow does (a `mariabackup`
copy of a database with mailcow's tables, mail saved by Dovecot compressed and encrypted like
mailcow's, DKIM keys in a Redis dump), checks that the restore test passes, then breaks copies of
it (a cut-off archive, other encryption keys, a missing DKIM key, no `mailcow.conf`…) and checks
that each is caught. It runs anywhere with Docker:
`bash tests/backup/restore-e2e.sh`.

A fourth job runs the front nginx site in real nginx (1.24) in front of a stub mailcow
(`tests/deploy/front-nginx-e2e.sh`). It checks:
- `nginx -t` passes without warnings;
- HTTP redirects, except Let's Encrypt checks;
- HTTPS reaches mailcow with the right name and the right certificate, including `mta-sts.` and
  `autodiscover.` names;
- the visitor's address is passed on;
- a 20 MB upload goes through;
- the image's own default site still answers other names.

### UI tests

`tests/ui` checks the console and webmail in a real browser (Playwright, Chromium) without a mail
server:

- `router.php` renders the real templates and CSS/JS bundles from `data/web` with stub data and a
  stub API. Environment switches select 2FA, a language, a session lifetime or Overview problem
  states: certificate, ACME reason, backups, mail DNS, mail reports (see the top of the file). The
  reports and a domain's Mail security checks are built with the real helpers, on fake reports and
  a fake DNS zone. Run it on its own with
  `php -S 127.0.0.1:8088 tests/ui/router.php` to look at pages by hand.
- `sogo/prepare.sh` builds a webmail mock from SOGo's own stylesheets and scripts at the version in
  `docker-compose.yml`, plus `data/conf/sogo`, with page markup copied from SOGo's templates.
- It also builds the **live Mail, Calendar, Contacts and Settings pages**:
  - `sogo/wox.py` renders SOGo's own `.wox` templates the way SOGo's framework does (patched with
    mailcow's toolbar change), and `sogo/live.py` assembles the pages with SOGo's real scripts.
  - The calendar's day, week and month views are rendered for the weeks around Thursday 15
    October 2026, the date the tests pin the browser's clock to.
  - `sogo/backend.mjs` and `sogo/backend-apps.mjs` answer the apps' requests like SOGo does, from
    an in-memory mailbox, calendars with a week of events, and address books, which really flag,
    move, delete and save. Settings' Save is recorded, and its account and filter dialogs are
    served like SOGo's.
  - So SOGo's real apps run in the browser, with or without our `custom-sogo.js`.
    `node sogo/live-check.mjs` walks through Mail on its own and prints anything the fake server
    doesn't know.
- `smoke.mjs` starts both and checks every main page in light, dark and phone width (no errors, the
  shell starts, no sideways scrolling). It also checks the behaviour that broke before: select-all,
  the bulk toolbars, the 2FA status, the Overview alerts, the session warning across tabs, and the
  webmail palette, top bar and selected message. Pages for mailbox users and domain admins must not
  name mailcow, SOGo or Rspamd, closed dialogs included.
- Mail security: the Overview's MTA-STS, TLS and DMARC reporting alerts and their links, the Mail
  reports card in every state, and a domain's Mail security tab: it loads only when opened, shows
  what is wrong with the records to publish, copies them, opens the MTA-STS tab with a safe
  start, and works in dark mode and at phone width.
- In the live Mail app it checks the Gmail-style layout end to end:
  - Stock SOGo runs against the fake server without errors.
  - Every layout change applies.
  - The search box is readable, filters the folder, and resets when emptied.
  - Rows are one line and 56px tall, and no icon shows as its name.
  - The order is in words and follows the Sort menu: subject, ascending and back to newest
    first, sorted by the server. Other languages keep SOGo's label.
  - Star, read/unread, Archive and Delete reach the server and the message really moves.
  - An open message replaces the list, and back returns to it.
  - Compose opens as a window, and the mail behind it stays usable.
  - The compose window:
    - Its bar has the title and the three buttons, with no Send or Save. Cc and Bcc are on the
      To line, and From is hidden for one identity.
    - The formatting bar is one row between the writing area and the bottom bar, and Aa hides
      and shows it.
    - The bottom bar's buttons come in order. Send is off without a recipient and on with one.
    - Emoji inserts one; Save draft saves; minimise and full screen work.
    - Send sends the message and closes the window.
    - In dark mode the bars are dark around a white writing area. At phone width the bottom bar
      is on screen. Plain text gets no formatting.
    - With the compose template broken on purpose, that part is skipped with a warning and the
      window still sends.
  - The classic layout switch works both ways.
  - Dark mode works; at phone width the search box wraps, back is reachable, and compose is full
    screen.
  - Installable: the page links the manifest; its icons load at their stated sizes; the title bar
    colour follows the theme; and Chromium itself reads the manifest without errors.
  - Fail-safe: with templates broken on purpose, those changes are skipped with a warning and
    that part keeps SOGo's own layout.
- In the live Calendar and Contacts apps it checks the same way:
  - Stock SOGo runs, each event is on its day at its time and length, and the address book lists
    its contacts.
  - Every layout change applies, with the search box, the Create button and no add button on a
    wide screen.
  - Search filters and resets.
  - Create → Event, Task, Contact and Contact list open the editors. Saving reaches the server,
    and the new event or contact shows up.
  - Calendar: the header's Today pill and view group; agenda dots in each calendar's colour;
    back, forward, Today, month and day views; switching a calendar off; an event's dialog.
  - Contacts: 56px rows; the contact card; Create greyed out in a read-only address book.
  - The classic switch, dark mode, phone width and the fail-safe, as in Mail.
- In live Settings:
  - Stock SOGo runs. Every change applies: the other apps' top bar with the title, the logo to
    Mail and the console button's name; no Save button in the bar; and no icon shows as its name.
  - The sidebar opens a section as a pill.
  - Vacation: turning it on and writing the reply shows the Save bar. Save sends both to the
    server, then the bar goes and "Preferences saved" shows. Forward: an added address is saved.
  - Create Filter and Edit account open SOGo's dialogs, restyled.
  - With unsaved changes, the layout switch shows SOGo's prompt first. The classic layout keeps
    the section and has a way back.
  - Dark mode, phone width (the Save bar spans the screen, the menu opens the sections) and the
    fail-safe.

Run locally:

```sh
cd tests/ui && npm ci && npx playwright install chromium
bash sogo/prepare.sh && node smoke.mjs   # screenshots in tests/ui/output
```

## Deployment

Use this repo exactly like upstream Mailcow:

```bash
cd /opt
git clone <your-rabbittech-repo-url> mailcow-dockerized
cd mailcow-dockerized
git checkout rabbittech-theme
./generate_config.sh
docker compose pull
docker compose up -d
```

Recommended hostname:

```text
mail.rabbittech.com.np
```

### Automated deploys (GitHub Actions)

`.github/workflows/deploy-vps.yml` uploads the release and runs `scripts/deploy-vps.sh` on the
server, which calls `scripts/sync-release.sh` to copy it into `/opt/rabbittech-mailserver/app`:

- **Only release files are written.** Files the containers generate at runtime are never touched:
  Postfix/Dovecot SQL maps, rspamd network maps, certificates, the ACME challenge directory and the
  Twig cache. A file is deleted only when the previous release shipped it and the new one doesn't
  (tracked in `shared/release-manifest`).
- **The rspamd global filter maps are seeded, not overwritten.** These are the maps in
  `data/conf/rspamd/custom/` that admins edit under System > Configuration > Global filter maps.
  They are installed when missing and otherwise left alone.
- **Root access comes from Docker, not sudo.** Containers re-own several bind-mounted directories,
  so the sync runs as root. When the deploy user isn't root, it runs inside a throwaway
  `alpine:3.20` container, using the `docker` group membership the deploy user already has.
- **Services restart only when their config changed.** A changed file under `data/conf/<service>/`
  restarts that service. SOGo copies its web files into a volume at start, so theme and logo
  changes need this.
- **Missing runtime files are regenerated.** Some services write config into `data/` when they
  start: Dovecot creates the master user and the SOGo single sign-on password that webmail needs to
  open mailboxes, and Postfix creates its SQL and transport maps. If those files are missing, the
  deploy restarts the service that owns them. If they still don't appear, the deploy fails and names
  the files.
- **Template and PHP changes restart PHP-FPM.** mailcow's PHP never re-reads a file it has already
  compiled (`opcache.validate_timestamps=0`), and compiled templates keep their file names, so the
  deploy clears the Twig cache and restarts `php-fpm-mailcow` whenever `data/web/templates/`,
  `data/web/inc/` or any `data/web/**/*.php` changed. CSS and JS bundles are named by their content
  and update without a restart.
- **Every deploy ends with a health check** (`scripts/check-health.sh`): all services in
  `docker-compose.yml` running, the console rendering a complete page (so PHP, the database and
  Redis answer), and SMTP and IMAP greeting. It allows up to 5 minutes for slow starts.
- **An unhealthy release is rolled back.** The deploy records the last healthy release
  (`shared/current-release`) and the `mailcow.conf` it ran with (`shared/last-good-mailcow.conf`).
  When a new release fails its health check, that release is deployed again: its files come back
  exactly, its images are started, and the GitHub deploy is marked failed with "Rolled back" in its
  log. Data (mailboxes, the database) is not rolled back. If the previous release fails too, the
  deploy stops and says so. `RT_SKIP_HEALTH_CHECK=1` skips the check.
- **Old releases are pruned.** Only the newest three are kept in `releases/`.

### Backups

`scripts/backup-mail.sh` backs up everything needed to restore the server: mailboxes, the database,
DKIM and other keys (crypt), Redis, spam filter and Postfix data, plus `mailcow.conf`. It wraps
mailcow's `helper-scripts/backup_and_restore.sh`.

- **Schedule:** the deploy adds an hourly entry to the deploy user's crontab (between
  `# BEGIN rabbittech-backup` and `# END` markers). The script backs up once a day after
  `RT_BACKUP_HOUR` (default 2) in the mail server's `TZ`, and catches up right away when the last
  backup is more than 26 hours old. After a failure it tries again after 4 hours.
- **Where:** `/opt/rabbittech-mailserver/backups/mail/mailcow-<date>/`. The cron log is
  `backups/backup.log`; the full output of the last run is `backups/backup-last-run.log`.
- **Checks:** every archive must exist and be non-empty, or the backup counts as failed and its
  folder is removed. Before starting, there must be room for half again the size of the last
  backup; older backups are deleted to make room, but the last one is kept.
- **Retention:** backups older than `RT_BACKUP_KEEP_DAYS` (default 7) are deleted, never the newest
  two.
- **Off-site copy:** set `RT_BACKUP_RSYNC_TARGET` (e.g. `backup@nas.example.com:/srv/mail`) and allow
  the deploy user's SSH key there; the backups folder is mirrored after each backup.
- **Status:** written to Redis (`RT_BACKUP_STATUS`) for the Overview.
- **Settings** go in the GitHub secret `MAILCOW_ENV_FILE` (see `deploy/mailcow.conf.example`):
  `RT_BACKUP=n` turns backups off.
- **Back up now:** `cd /opt/rabbittech-mailserver/app && RT_BACKUP_NOW=1 bash scripts/backup-mail.sh`
- **Restore:** `cd /opt/rabbittech-mailserver/app && MAILCOW_BACKUP_LOCATION=/opt/rabbittech-mailserver/backups/mail bash helper-scripts/backup_and_restore.sh restore`
  asks which backup and which parts to restore.

#### Restore test

A backup that can't be restored is otherwise only found out in an emergency. Once a week,
`scripts/restore-test.sh` restores the night's backup into throwaway containers and checks what
comes back. The containers have no network and one CPU, and they and their volumes are removed
afterwards. The live server is only read, never changed.

| Check | Passes when |
|---|---|
| config | the backup's `mailcow.conf` has `MAILCOW_HOSTNAME`, `DBNAME`, `DBUSER`, `DBPASS` and `DBROOT` |
| archives | all six archives are there, and the five small ones decompress without errors |
| database | MariaDB (the server's image) starts from the database copy, and every domain and mailbox that existed a day before the backup is in it |
| mail | the mail archive reads to the end; every mailbox with an inbox message from a day before the backup has mail in it; and one message (the smallest in the first thousand) opens with the backup's own keys, the way Dovecot reads it (mailcow compresses stored mail, then encrypts it) |
| dkim | Redis loads the copy, and every domain with a DKIM key a day before the backup has its selector and private key in it |

- **Schedule:** `backup-mail.sh` runs it right after a good backup, under the backup's lock, when
  the last test is `RT_RESTORE_TEST_DAYS` (default 7) old. After a failed test it runs again after
  the next backup. A failed restore test doesn't mark the backup failed; it has its own alert.
- **Settings:** `RT_RESTORE_TEST=n` turns it off; `RT_RESTORE_TEST_DAYS` sets the interval.
- **Room:** it unpacks the database copy, so Docker's disk needs the live database's size plus
  20% and 200 MiB free. Otherwise the test fails with "Not enough disk space" and unpacks nothing.
  The mail is only listed, not unpacked.
- **Time:** listing the mail archive reads all of it, so expect a few minutes per 10 GB of mail.
- **Results:** each check is one line in `backups/restore-test-last-run.log`, e.g.
  `ok    mail: 52310 messages in 14 mailboxes; a message to bibek@rabbittech.com.np opens with the
  backup's keys`. The result goes to Redis (`RT_RESTORE_TEST`) for the Overview, and to
  `backups/.last-restore-test`.
- **Run it now**, on the last good backup or a folder you name:
  `cd /opt/rabbittech-mailserver/app && bash scripts/restore-test.sh [../backups/mail/mailcow-<date>]`

### Mail security

Each domain's edit page has a **Mail security** tab with what other mail servers check before
they trust mail from the domain and deliver mail to it securely. It loads when it opens
(`inc/ajax/rt_mail_security.php`, for admins and the domain's admins) and "Check again" runs it
again. The Overview's DNS alerts link here.

| Check | OK when |
|---|---|
| MX record | the domain's MX points to this server |
| SPF | the SPF record allows this server (one record only) |
| DKIM | the published key is the one mail is signed with |
| DMARC | there is exactly one DMARC record |
| DMARC reports | its `rua=` includes the reports mailbox (when reports are collected) |
| Consent for DMARC reports | for a reports mailbox at another domain: `<domain>._report._dmarc.<reports domain>` says `v=DMARC1` |
| MTA-STS record | `_mta-sts.<domain>` has the id of the current policy (with or without spaces) |
| MTA-STS policy | `https://mta-sts.<domain>/.well-known/mta-sts.txt` answers with this policy and a valid certificate, no redirects |
| MX hosts in the policy | every MX host matches one of the policy's `mx` lines |
| TLS reports | `_smtp._tls.<domain>` has a `v=TLSRPTv1` record (sending to the reports mailbox when reports are collected) |

- A check that needs a fix says what is wrong and shows the DNS records to publish, with copy
  buttons. A record that is there but incomplete is shown with the missing part added (for
  example the reports address added to `rua=`, or this server added to SPF before its `all`).
- A lookup that fails shows "Couldn't check", never a problem. The policy check fetches the
  policy the way senders do, from this server; if it can't connect at all it can't tell.
- **Guided MTA-STS setup:** with no policy, "Set up MTA-STS" opens the MTA-STS tab with a safe
  start: mode `testing`, this server as the MX host, a one-day max age, active. After saving,
  publish the `_mta-sts` TXT and `mta-sts.<domain>` CNAME records the tab shows. With
  `AUTODISCOVER_SAN=y` (the default) the certificate gets `mta-sts.<domain>` at the next daily
  certificate check once the name resolves here. When the TLS reports show no failures for a few
  weeks, switch the mode to `enforce`.
- The checks themselves are `rabbittech_domain_checks()` in `inc/functions.rabbittech.inc.php`,
  given the DNS, HTTPS and console lookups from `inc/functions.rabbittech-mail.inc.php`; the
  Overview uses the same checks for every domain.

### Mail reports

Mail providers such as Gmail, Outlook and Yahoo send daily reports to the address in a domain's
DMARC (`rua=`) and TLS reporting records: who sent mail as the domain and whether it passed SPF
and DKIM, and whether their servers could deliver to yours over TLS. `scripts/mail-reports.sh`
reads them, and the Overview shows a 30-day summary and warns about failures.

- **Set up:**
  1. Create a mailbox for the reports in the console, e.g. `reports@rabbittech.com.np`.
  2. Set `RT_REPORTS_MAILBOX=reports@rabbittech.com.np` in the GitHub secret `MAILCOW_ENV_FILE`
     and deploy.
  3. Publish the DMARC and TLS reporting records each domain's Mail security tab shows. A domain
     other than the mailbox's also needs the consent record the tab shows.
  The first reports arrive within a day or two.
- **Schedule:** the deploy adds an entry to the deploy user's crontab that runs it every 15
  minutes. Its log is `shared/mail-reports.log` (a line per run that read something, and errors).
- **What it does:** each new message in the mailbox's inbox is read once
  (`doveadm fetch` in the Dovecot container) and gets the keyword `rtreport`. Reports (zip, gzip or
  plain XML and JSON attachments) are parsed in the PHP container
  (`inc/lib/rabbittech-mail-reports.php`, not reachable over HTTP) and marked as read; other
  messages stay unread for you. Nothing is deleted from the mailbox. A run reads at most 500
  messages, so a full mailbox is caught up over a few runs.
- **Kept:** 31 days of reports in Redis (`RT_MAIL_REPORTS`), the same report sent twice once, the
  busiest 500 senders per report, and the reverse DNS names of the senders.
- **Status:** a run that fails (no such mailbox, Dovecot errors) is shown on the Overview with the
  reason; so is no run for a day.
- **Run it now:** `cd /opt/rabbittech-mailserver/app && bash scripts/mail-reports.sh`
- With `RT_REPORTS_MAILBOX` empty, nothing is read and the Overview says reports aren't collected.

### Behind another nginx

When another nginx on the server owns ports 80 and 443 for other sites, mailcow runs behind it
(`HTTP_BIND=127.0.0.1`, `HTTP_PORT=8088`, `HTTPS_BIND=127.0.0.1`, `HTTPS_PORT=8448` or similar), and
the deploy keeps that nginx's mail site in step with the repo.

- **The site** is `deploy/nginx/mail-front.conf.template`, with the host name, mailcow's ports and the
  certificate paths filled in from `mailcow.conf`:
  - It serves the mail hostname plus every mail domain's `autodiscover.`, `autoconfig.` and `mta-sts.`
    names (wildcards, which rank below the exact names of the server's other sites).
  - It serves them with **mailcow's own Let's Encrypt certificate** (`data/assets/ssl`), which
    already covers all those names (`AUTODISCOVER_SAN=y`) and renews itself. No certbot is needed
    for the mail names.
  - Port 80 sends Let's Encrypt checks (`/.well-known/acme-challenge/`) straight to mailcow and
    redirects the rest to HTTPS.
  - Port 443 proxies to mailcow's HTTPS port. It passes the name on in `Host` and in TLS (SNI), so
    mailcow answers `mta-sts.<domain>` and the others correctly. It also passes the visitor's
    address (`X-Real-IP`, `X-Forwarded-For`; mailcow trusts them from Docker's network, so logins
    are logged and Fail2ban works).
  - It has no upload limit (mailcow has its own), mailcow's documented buffers for webmail, and
    hour-long ActiveSync requests for push mail.
- **Turn it on:**
  1. Once a release with this is deployed, run this once on the server, as root:
     `bash /opt/rabbittech-mailserver/app/scripts/front-nginx.sh setup <VPS_USER>`.
     It installs the root helper `/usr/local/sbin/rabbittech-front-nginx` and a sudo rule that lets
     the deploy user run that helper, and nothing else.
  2. Set `RT_FRONT_NGINX=y` in `MAILCOW_ENV_FILE`.
  3. Deploy.

  The first install replaces the site you set up by hand, `sites-available/<hostname>` and
  `sites-enabled/<hostname>`.
- **Every deploy**, after the health check passes:
  - The helper installs the site and runs `nginx -t`. It reloads nginx only if the test passes;
    otherwise it puts the previous files back exactly and the deploy fails with nginx's error.
  - Another site file that also serves the mail hostname is refused too, because nginx would only
    warn and then serve whichever it read first.
  - Then the deploy fetches `https://<hostname>/` through the new site. A 502 or no answer puts the
    previous site back and fails the deploy.
  - The server's other sites are never touched.
  - Until mailcow has a real certificate (on a new server it starts with a placeholder), the
    current site stays.
- **Certificate renewals:** cron runs `scripts/front-nginx.sh reload` every 15 minutes. It reloads
  nginx only when mailcow's certificate changed.
- **Backups:** the previous files are kept in `/var/backups/rabbittech-front-nginx/` (the newest
  10). `sudo rabbittech-front-nginx restore <hostname>` puts the last one back.
- **Changing it:** edit the template in the repo and deploy; edits on the server are overwritten.
  When `deploy/nginx/rabbittech-front-nginx` itself changes, the deploy prints a note: run `setup`
  again to install the new helper.
- **The old certbot certificate** for the mail hostname isn't used any more:
  `certbot delete --cert-name mail.rabbittech.com.np` removes it.
- **IPv6:** don't publish an AAAA record unless mailcow runs with IPv6 (`ENABLE_IPV6=true`). ACME
  checks IPv6 first and gives up.
- **Alerts by email:** set `WATCHDOG_NOTIFY_EMAIL` so mailcow's health monitor emails you when a
  service stops.

### Manual updates

On a manual `git pull`, run `docker compose restart php-fpm-mailcow` so updated templates and PHP
code show up (PHP keeps serving the old compiled files until it restarts).
Run `docker compose restart sogo-mailcow` after SOGo theme or logo changes.

## Keeping upstream updates

Keep the original Mailcow repo as `upstream`:

```bash
git remote add upstream https://github.com/mailcow/mailcow-dockerized.git
git fetch upstream
git merge upstream/master
```

Most of the theme lives in new files (`016-rabbittech.css`, `templates/rabbittech/`, fonts and
images), so conflicts are limited to the templates listed above, `inc/header.inc.php` (one global),
`013-mailcow.js` (dark-mode toggle), `dashboard.js` (chart colors) and `mailbox.js` (table cell
renderers). The page redesigns also rewrote `user/tab-user-*.twig`, `domainadmin.twig` and
`admin/tab-config-admins.twig`, and touched `edit/mailbox.twig`, `edit/domain.twig` and
`admin/tab-config-dkim.twig`. If upstream changes those, carry its new fields or IDs over to the
RabbitTech layout.

After merging, check that new upstream tabs have a sidebar entry in `nav.twig`; until they do,
their tab strip stays visible. Resolve conflicts, test, then deploy.
