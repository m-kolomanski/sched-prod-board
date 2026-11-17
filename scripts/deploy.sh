#!/usr/bin/env bash
# Builds dist/ (sha-stamped) plus media/ and publishes it to the gh-pages branch; enables Pages on first run.
set -euo pipefail
cd "$(dirname "$0")/.."
REPO=m-kolomanski/sched-prod-board
SHA=$(./scripts/build.sh)
[ -d media ] && cp -r media dist/media
touch dist/.nojekyll
TMP=$(mktemp -d)
cp -r dist/. "$TMP"
git -C "$TMP" init -q -b gh-pages
git -C "$TMP" add -A
git -C "$TMP" -c user.name="$(git config user.name)" -c user.email="$(git config user.email)" commit -qm "Deploy $SHA"
git -C "$TMP" push -qf "git@github.com:$REPO.git" gh-pages
rm -rf "$TMP"
gh api "repos/$REPO/pages" >/dev/null 2>&1 || gh api -X POST "repos/$REPO/pages" -f "source[branch]=gh-pages" -f "source[path]=/" >/dev/null
echo "deployed $SHA → https://m-kolomanski.github.io/sched-prod-board/"
