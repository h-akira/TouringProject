#!/bin/sh
# Copy the shared docs (master: docs/) into each unit as docs-parent/,
# so that every unit can be read and built without the parent repository.
set -eu
cd "$(dirname "$0")/.."
for unit in App Backend Agent CICD; do
  [ -d "$unit" ] || continue
  rsync -a --delete --exclude sync.sh docs/ "$unit/docs-parent/"
  echo "synced: docs/ -> $unit/docs-parent/ (commit it in $unit/)"
done
