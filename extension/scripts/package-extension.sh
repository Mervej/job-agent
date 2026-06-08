#!/usr/bin/env bash
# Packages the extension/ folder into a release .zip, excluding dev-only files.
# Usage: bash extension/scripts/package-extension.sh
# Output: job-agent-extension-v<version>.zip (project root)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ROOT_DIR="$(cd "$EXT_DIR/.." && pwd)"

VERSION=$(node -p "require('${EXT_DIR}/manifest.json').version")
OUT="${ROOT_DIR}/job-agent-extension-v${VERSION}.zip"

cd "$EXT_DIR"

zip -r "$OUT" . \
  --exclude "scripts/*" \
  --exclude "*.sh" \
  --exclude ".DS_Store" \
  --exclude "__MACOSX/*"

echo "Created: $OUT"
