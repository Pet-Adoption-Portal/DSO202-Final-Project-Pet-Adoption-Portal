#!/usr/bin/env bash
# Create a new microservice from services/template.
#   ./scripts/new-service.sh pet
# Then: replace src/routes.js, src/consumers.js and migrations/ with the real ones from docs/API-CONTRACT.md.
set -euo pipefail

name="${1:-}"
if [[ ! "$name" =~ ^[a-z][a-z0-9-]*$ ]]; then
  echo "usage: $0 <service-name>   (lowercase letters, digits and dashes, e.g. pet or email-worker)" >&2
  exit 1
fi

root="$(cd "$(dirname "$0")/.." && pwd)"
dest="$root/services/$name"
if [[ -e "$dest" ]]; then echo "services/$name already exists" >&2; exit 1; fi

cp -r "$root/services/template" "$dest"
rm -rf "$dest/node_modules" "$dest/.env"

# Rename the service everywhere it appears.
sed -i.bak "s/@pet-portal\/template/@pet-portal\/$name/; s/Template microservice. Copy it with scripts\/new-service.sh; do not deploy it./$name service/" "$dest/package.json"
sed -i.bak "s/export const SERVICE_NAME = 'template';/export const SERVICE_NAME = '$name';/" "$dest/src/app.js"
find "$dest" -name '*.bak' -delete

# Register the folder as an npm workspace.
node -e "
  const fs = require('fs'), p = '$root/services/package.json';
  const pkg = JSON.parse(fs.readFileSync(p));
  if (!pkg.workspaces.includes('$name')) pkg.workspaces.push('$name');
  fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + '\n');
"
(cd "$root/services" && npm install --silent)

echo "Created services/$name"
echo "Next: edit services/$name/src/routes.js, src/consumers.js and migrations/, then:"
echo "  cd services/$name && npm run dev"
