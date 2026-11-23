#!/bin/sh
# Build and deploy to Cloudflare Pages.
#
# Every earlier version's files (dist/assets, all named by content hash) stay
# online too: a page opened before an update (a home-screen app can stay open
# for days) still finds the pieces it loads later, like the story encoder.
# They're kept in .deploy-assets (not committed); files unused for 60 days go.
set -e
cd "$(dirname "$0")/.."
npm run build
rm -rf dist/_test
mkdir -p .deploy-assets
cp dist/assets/* .deploy-assets/            # current files (refreshes their date)
find .deploy-assets -type f -mtime +60 -delete
cp -n .deploy-assets/* dist/assets/ 2>/dev/null || true   # earlier versions alongside
npx wrangler@4 pages deploy dist --project-name remixity --branch main
