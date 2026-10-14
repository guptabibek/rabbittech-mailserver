# RabbitTech Mailcow Customization

This branch keeps Mailcow close to upstream and applies a small RabbitTech UI layer.

## What changed

- Added the default RabbitTech Mail logo at `data/web/img/rabbittech_mailcow.svg`.
- Updated default logo references in the navbar, login pages, reset-password page, and dashboard.
- Added a small theme layer at the end of `data/web/css/build/014-mailcow.css`.
- Changed the browser theme color to RabbitTech teal.

Mailcow's existing admin UI customization still works. Uploaded logos stored in Redis will override this default logo.

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

## Keeping upstream updates

Keep the original Mailcow repo as `upstream`:

```bash
git remote add upstream https://github.com/mailcow/mailcow-dockerized.git
git fetch upstream
git merge upstream/master
```

Resolve conflicts, test, then deploy.
