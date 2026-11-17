#!/usr/bin/env bash
# Stamps the current git sha into a copy of app/ (R6) and writes it to dist/.
set -euo pipefail
cd "$(dirname "$0")/.."
SHA=$(git rev-parse HEAD)
rm -rf dist && cp -r app dist
sed -i "s|<meta name=\"build\" content=\"[^\"]*\" />|<meta name=\"build\" content=\"$SHA\" />|; s|<code data-testid=\"build-sha\">[^<]*</code>|<code data-testid=\"build-sha\">$SHA</code>|" dist/index.html
grep -c "$SHA" dist/index.html >/dev/null
echo "$SHA"
