#!/bin/sh
# Copy a release tree into the live mailcow directory. Must run as root; Mailcow
# containers re-own several bind-mounted directories.
#
# Usage: sync-release.sh <release-dir> <app-dir> <state-dir>
#
# - Only files that are part of the release are written; files the containers
#   generate at runtime (SQL maps, certificates, caches) are never touched.
# - A file is deleted only if the previous release shipped it and this one does not
#   (tracked in <state-dir>/release-manifest).
# - Files are overwritten in place, so single-file bind mounts see the new content.
# - Paths of written or deleted files are listed in <state-dir>/release-changes.
#
# POSIX sh and busybox tools only: deploy-vps.sh may run this inside an Alpine container.
set -eu

SRC=${1:?release directory is required}
DST=${2:?app directory is required}
STATE=${3:?state directory is required}

MANIFEST="$STATE/release-manifest"
NEXT="$STATE/release-manifest.next"
CHANGES="$STATE/release-changes"

# Configured on the server, never taken from a release.
is_protected() {
  case "$1" in
    mailcow.conf|.env|data/assets/ssl/*) return 0 ;;
  esac
  return 1
}

# Defaults that admins edit in the UI (System > Configuration > Global filter maps):
# installed when missing, never overwritten or deleted.
is_seed_only() {
  case "$1" in
    data/conf/rspamd/custom/*) return 0 ;;
  esac
  return 1
}

mkdir -p "$DST" "$STATE"
: > "$CHANGES"

(cd "$SRC" && find . \( -type f -o -type l \) | sed 's|^\./||' | LC_ALL=C sort) > "$NEXT"

written=0
while IFS= read -r f; do
  is_protected "$f" && continue
  src="$SRC/$f"
  dst="$DST/$f"

  if [ -L "$src" ]; then
    target=$(readlink "$src")
    if [ -L "$dst" ] && [ "$(readlink "$dst")" = "$target" ]; then
      continue
    fi
    mkdir -p "$(dirname "$dst")"
    rm -rf "$dst"
    ln -s "$target" "$dst"
  else
    if [ -e "$dst" ] || [ -L "$dst" ]; then
      is_seed_only "$f" && continue
      if [ -f "$dst" ] && [ ! -L "$dst" ] && cmp -s "$src" "$dst"; then
        mode=$(stat -c %a "$src")
        [ "$(stat -c %a "$dst")" = "$mode" ] || chmod "$mode" "$dst"
        continue
      fi
      if [ -d "$dst" ] || [ -L "$dst" ]; then
        rm -rf "$dst"
      fi
    fi
    mkdir -p "$(dirname "$dst")"
    cp "$src" "$dst"
    chmod "$(stat -c %a "$src")" "$dst"
  fi
  printf '%s\n' "$f" >> "$CHANGES"
  written=$((written + 1))
done < "$NEXT"

deleted=0
if [ -f "$MANIFEST" ]; then
  REMOVED="$STATE/release-removed"
  grep -Fxv -f "$NEXT" "$MANIFEST" > "$REMOVED" || true
  while IFS= read -r f; do
    if is_protected "$f" || is_seed_only "$f"; then
      continue
    fi
    if [ -e "$DST/$f" ] || [ -L "$DST/$f" ]; then
      rm -f "$DST/$f"
      printf '%s\n' "$f" >> "$CHANGES"
      deleted=$((deleted + 1))
    fi
  done < "$REMOVED"
  rm -f "$REMOVED"
fi

# Compiled Twig templates are only rebuilt when the cache is cleared.
TWIG_CACHE="$DST/data/web/templates/cache"
if [ -d "$TWIG_CACHE" ] && grep -q '^data/web/templates/' "$CHANGES"; then
  find "$TWIG_CACHE" -mindepth 1 -maxdepth 1 ! -name .gitkeep -exec rm -rf {} +
  echo "Cleared the Twig template cache"
fi

mv "$NEXT" "$MANIFEST"
echo "Synced release: $written file(s) written, $deleted file(s) deleted"
