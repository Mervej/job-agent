#!/usr/bin/env bash
# Packages a local-dev variant of the extension.
# Forces the backend URL to localhost:3000 and appends -local to the name.
# Usage: bash extension/scripts/package-local.sh
# Output: job-agent-extension-v<version>-local.zip (project root)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ROOT_DIR="$(cd "$EXT_DIR/.." && pwd)"
TMP_DIR="$(mktemp -d)"

VERSION=$(node -p "require('${EXT_DIR}/manifest.json').version")
OUT="${ROOT_DIR}/job-agent-extension-v${VERSION}-local.zip"

# Copy extension into temp dir
cp -r "$EXT_DIR/." "$TMP_DIR/"

# Patch manifest: append (local) to name
node -e "
  const fs = require('fs');
  const p = '${TMP_DIR}/manifest.json';
  const m = JSON.parse(fs.readFileSync(p, 'utf8'));
  m.name = m.name + ' (local)';
  fs.writeFileSync(p, JSON.stringify(m, null, 2));
"

# Patch background.js: always use LOCAL_URL
node -e "
  const fs = require('fs');
  const p = '${TMP_DIR}/background.js';
  let src = fs.readFileSync(p, 'utf8');
  // Replace the auto-detect IIFE with a direct LOCAL_URL return
  src = src.replace(
    /const backendReady = \(async \(\) => \{[\s\S]*?\}\)\(\);/,
    'const backendReady = Promise.resolve(LOCAL_URL);'
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
