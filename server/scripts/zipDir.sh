#!/usr/bin/env bash
# scripts/zipDir.sh — zip the *contents* of a directory
# Usage: ./scripts/zipDir.sh /path/to/dir [archive-name.zip]
# Example: ./scripts/zipDir.sh ./test/query

set -euo pipefail

# ────────────────────────── argument checks ─────────────────────────
if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <directory> [zipfile]" >&2
  exit 1
fi
[[ -d $1 ]] || { echo "'$1' is not a directory"; exit 1; }

# ─────────────────────── resolve paths and names ────────────────────
DIR="$(realpath "${1%/}")"        # absolute, no trailing slash
BASENAME="$(basename "$DIR")"     # e.g. query

# Archive path: inside the directory unless user supplied one
if [[ $# -ge 2 ]]; then
  # If user gave a path, keep absolute; otherwise place inside DIR
  [[ $2 = /* ]] && ZIPFILE="$2" || ZIPFILE="${DIR}/${2}"
else
  ZIPFILE="${DIR}/${BASENAME}.zip"
fi

# ─────────────────────────── dependency check ───────────────────────
command -v zip >/dev/null 2>&1 || { echo "'zip' not found; install it"; exit 1; }

# ────────────────────────── create the archive ──────────────────────
echo "Creating archive: $ZIPFILE"

# Work inside the target directory so we zip its *contents* only
pushd "$DIR" >/dev/null
# -r recursive  -q quiet  -X strip extra attrs
zip -r -q -X "$(basename "$ZIPFILE")" . -x "$(basename "$ZIPFILE")"
popd >/dev/null

echo "Done – $(du -h "$ZIPFILE" | cut -f1) written."

