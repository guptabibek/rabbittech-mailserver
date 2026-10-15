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
  - A "Needs attention" card, shown only when something is wrong: a stopped or unhealthy
    container, mail storage at 85% or more, a TLS certificate that expires within 14 days (checked
    against what nginx actually serves, cached for up to 6 hours), or 50+ messages in the mail queue.
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
- Headings follow the page outline (h1 page title, h2 cards, h3 items), logout and "Restart SOGo"
  are real buttons, and pinch-zoom is allowed.
- On touch screens, icon buttons, pagination and navigation links have larger hit areas. Motion is
  reduced when the OS asks for it, and pages print without the shell.
- The page stays usable without the shell script. mailcow's tab strips stay visible until
  `014-rabbittech.js` has started (`html.rt-shell-ready`), and if a script fails the header falls
  back to the plain back link. Layout rules that need `:has()` sit inside
  `@supports selector(:has(*))`.
- Two minutes before the session expires, a notice offers "Stay signed in" instead of the page
  reloading without warning.

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
tests that a release sync keeps runtime files and admin-edited maps.

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
- **Old releases are pruned.** Only the newest three are kept in `releases/`.

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
