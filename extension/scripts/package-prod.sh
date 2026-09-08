#!/usr/bin/env bash
# Packages a prod build of the extension always pointing to the deployed backend.
# Usage: bash extension/scripts/package-prod.sh
# Output: job-agent-extension-v<version>-prod.zip (project root)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ROOT_DIR="$(cd "$EXT_DIR/.." && pwd)"
TMP_DIR="$(mktemp -d)"

VERSION=$(node -p "require('${EXT_DIR}/manifest.json').version")
OUT="${ROOT_DIR}/job-agent-extension-v${VERSION}-prod.zip"

# Copy extension into temp dir
cp -r "$EXT_DIR/." "$TMP_DIR/"

# Patch background.js: always use PROD_URL, skip localhost health check
node -e "
  const fs = require('fs');
  const p = '${TMP_DIR}/background.js';
  let src = fs.readFileSync(p, 'utf8');
  src = src.replace(
    /const backendReady = \(async \(\) => \{[\s\S]*?\}\)\(\);/,
    'const backendReady = Promise.resolve(PROD_URL);'
  );
  fs.writeFileSync(p, src);
"

cd "$TMP_DIR"
zip -r "$OUT" . \
  --exclude "scripts/*" \
  --exclude "*.sh" \
  --exclude ".DS_Store" \
  --exclude "__MACOSX/*"

rm -rf "$TMP_DIR"
echo "Created: $OUT"
