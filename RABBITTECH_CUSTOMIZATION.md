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

### Layout and templates

- **Top bar** (`templates/base.twig`): brand, icon navigation with active states, theme toggle,
  language menu and a user menu with sign-out. It collapses into a drawer on mobile.
- **Brand mark** (`templates/rabbittech/brand.twig`): an inline SVG plus wordmark. A logo uploaded
  under System > Configuration > Customize replaces it, with separate light and dark logos.
- **Login and reset-password pages** (`*_index.twig`, `reset-password.twig`): a centered card under
  the brand lockup. Form fields and IDs are unchanged.
- **System > Information** (`dashboard.twig`): host overview with stat tiles, CPU and memory chart
  cards, and a container status grid. Expanding a container opens its I/O charts full-width. All
  element IDs used by `js/site/dashboard.js` are kept, and the chart colors match the brand.

### Assets

- `data/web/img/rabbittech_mailcow.svg` (light background) and `rabbittech_mailcow_dark.svg`:
  lockups with outlined text, so they render the same without the web font.
- `data/web/img/rabbittech_mark.svg`: the mark on its own.
- `data/web/favicon.png`: generated from the mark.

### SOGo webmail

- `data/conf/sogo/custom-theme.js`: violet primary and accent palettes with a cool grey background.
  It is wrapped in `try/catch`, so a problem falls back to SOGo's default theme instead of breaking
  webmail.
- `data/conf/sogo/custom-sogo.js`: loads the Inter font from `/fonts`.
- `custom-fulllogo.svg/png`, `custom-shortlogo.svg` and `custom-favicon.ico` carry the RabbitTech logo.

### CI

`.github/workflows/ci.yml` checks the theme assets, runs `node --check` on the touched JavaScript,
parses every Twig template with `scripts/check-twig-templates.php`, and tests that a release sync
keeps runtime files and admin-edited maps.

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
- **Template changes clear the Twig cache.** CSS and JS bundles are re-hashed on the next request
  anyway.
- **Old releases are pruned.** Only the newest three are kept in `releases/`.

### Manual updates

On a manual `git pull`, run `docker compose restart php-fpm-mailcow` so updated templates show up.
Run `docker compose restart sogo-mailcow` after SOGo theme or logo changes.

## Keeping upstream updates

Keep the original Mailcow repo as `upstream`:

```bash
git remote add upstream https://github.com/mailcow/mailcow-dockerized.git
git fetch upstream
git merge upstream/master
```

Most of the theme lives in new files (`016-rabbittech.css`, `templates/rabbittech/`, fonts and
images), so conflicts are limited to the templates listed above, `013-mailcow.js` (dark-mode toggle)
and `dashboard.js` (chart colors). Resolve conflicts, test, then deploy.
