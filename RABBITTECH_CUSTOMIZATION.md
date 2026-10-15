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
    - mail DNS, for every active domain: MX pointing here, SPF including this server's IP (`ip4:`
      ranges included), the DKIM key published, a DMARC record, and reverse DNS of the server's IP.
      Domains with the same problem share one alert.
  - The certificate and DNS results are cached in Redis (6 hours when fine, 1 hour while something
    is wrong); "Check again" (`?recheck=1`) clears them. A check that can't run raises no alert.
  - The server card shows when the last backup was made.
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
  - List rows keep the heights SOGo's virtual scrolling relies on (56px messages and contacts,
    40px folders); separators are drawn with shadows so they add no height.
  - HTML mail keeps the sender's styling: rules that reach into a message use `:where()`, so the
    sender's CSS always wins. In dark mode, HTML mail and the compose area stay on a white sheet,
    because replies and newsletters carry their own dark text colours.
  - Webmail follows the console's light/dark choice (`localStorage.mailcow_theme`, same origin);
    switch it in the console and reload webmail.
  - The upstream `CKEDITOR.addCss(...)` line is guarded: SOGo 5 ships CKEditor 5, which has no
    `CKEDITOR` global, so that line threw an error on every page.
- **Mail laid out like Gmail** (also `custom-sogo.js`; the Mail screen only):
  - Top bar: the folder search is a search box in the middle that is always there (the `s` key
    still focuses it, and emptying it shows the whole folder again). The menu button hides the
    folder list; the logo then moves into the top bar.
  - Folder list: a Compose button at the top, folders as pills with bold unread counts.
  - Message list, in a card: from 960px wide one line per message (checkbox, star, sender,
    subject, icons, date). Read messages are tinted, unread ones white and bold. Under the pointer,
    Archive, Delete and Mark as read/unread take the date's place, and the star flags a message.
    Archive moves it to the `Archive` folder mailcow creates in every mailbox (not offered inside
    Archive); Delete is not offered in Trash, where SOGo deletes for good.
  - The list fills the width and an open message takes its place, with a back arrow and Archive.
  - Compose opens as a window at the bottom right (960px and wider) and the mail behind it stays
    usable; SOGo's expand button makes it large. Phones keep SOGo's full-screen editor, with one
    compose button instead of SOGo's two-button menu.
  - `SOGoRefreshViewCheck = "every_minute"` in `sogo.conf`, so new mail shows up without
    reloading (users can change it in Preferences).
  - **How it works:** SOGo's Mail templates are `<script type="text/ng-template">` blocks in the
    page. Before Angular starts, `custom-sogo.js` parses them, changes them and writes them back,
    and registers the few Angular functions the new buttons call; those use SOGo's own services
    (`toggleFlag`, `toggleRead`, `$deleteMessages`, `$moveMessages`, `newMessage`).
  - **Fail-safe:** each change first checks that the markup it needs is there. If a SOGo upgrade
    changed it, that change is skipped with a console warning ("RabbitTech mail layout: …"), and
    the styles that depend on it don't apply either (`html.rt-gmail-<change>`), so that part stays
    as SOGo has it instead of breaking.
  - **Classic layout:** a top bar button (columns icon) switches to SOGo's three-pane layout with
    the RabbitTech look, and back. The choice is kept per browser (`localStorage.rt_webmail_layout`).
  - **Limits:** SOGo sends no preview text, so rows show the subject without Gmail's snippet.
    There are no inbox tabs, snooze or Gmail-style conversations. Rows stay 56px high, because
    SOGo's scrolling code relies on that height.
  - **After a SOGo upgrade**, run the UI tests (they run SOGo's real Mail app, see below) and look
    for "RabbitTech mail layout" warnings in the browser console on `/webmail`.
- **Caching:** these two files keep the same URL across releases, so nginx sends them with
  `Cache-Control: no-cache` (`data/conf/nginx/templates/sites-default.conf.j2`). A deploy restarts
  `sogo-mailcow` (which copies them into the web volume) and `nginx-mailcow`.
- **If an upgrade breaks webmail styling**, restore the stock look with
  `git checkout fd58a71 -- data/conf/sogo/custom-sogo.js data/conf/sogo/custom-theme.js` and
  `docker compose restart sogo-mailcow`.
- `custom-fulllogo.svg/png`, `custom-shortlogo.svg` and `custom-favicon.ico` carry the RabbitTech logo.

### CI

`.github/workflows/ci.yml` checks the theme assets, runs `node --check` on the touched JavaScript,
parses every Twig template with `scripts/check-twig-templates.php`, checks that every language file
is valid JSON and every RabbitTech string in use exists (`scripts/check-rabbittech-lang.php`), and
tests that a release sync keeps runtime files and admin-edited maps. It also runs the backup
script against a fake mailcow helper (`tests/backup/test-backup.sh`), the health check and a full
deploy and rollback with fake Docker (`tests/deploy/test-deploy.sh`), and the ACME log reader and
SPF range check behind the Overview alerts (`tests/php/overview-checks.php`).

A second job runs the UI smoke tests and uploads their screenshots as the `ui-screenshots` artifact.

### UI tests

`tests/ui` checks the console and webmail in a real browser (Playwright, Chromium) without a mail
server:

- `router.php` renders the real templates and CSS/JS bundles from `data/web` with stub data and a
  stub API. Environment switches select 2FA, a language, a session lifetime or Overview problem
  states: certificate, ACME reason, backups, mail DNS (see the top of the file). Run it on its own with
  `php -S 127.0.0.1:8088 tests/ui/router.php` to look at pages by hand.
- `sogo/prepare.sh` builds a webmail mock from SOGo's own stylesheets and scripts at the version in
  `docker-compose.yml`, plus `data/conf/sogo`, with page markup copied from SOGo's templates.
- `smoke.mjs` starts both and checks every main page in light, dark and phone width (no errors, the
  shell starts, no sideways scrolling). It also checks the behaviour that broke before: select-all,
  the bulk toolbars, the 2FA status, the Overview alerts, the session warning across tabs, and the
  webmail palette, top bar and selected message. Pages for mailbox users and domain admins must not
  name mailcow, SOGo or Rspamd, closed dialogs included.

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

### Behind another nginx

When another nginx on the server owns ports 80 and 443 and passes `mail.<domain>` on to mailcow
(`HTTP_BIND=127.0.0.1`, `HTTP_PORT=8088`, `HTTPS_PORT=8448` or similar):

- **Pass the visitor's address on**, or every console and webmail login looks like it comes from
  Docker's network: the logs can't tell who signed in and Fail2ban never bans anyone for web
  logins. In each `location` that proxies to mailcow:
  ```nginx
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  ```
  mailcow's nginx trusts these headers from private networks, which includes Docker's.
- **Certificates:** Let's Encrypt follows the usual port 80 to HTTPS redirect, so ACME works as long
  as the HTTPS server block passes `/.well-known/acme-challenge/` on to mailcow. Don't publish an
  AAAA record unless mailcow runs with IPv6 (`ENABLE_IPV6=true`): ACME checks IPv6 first and gives
  up.
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
