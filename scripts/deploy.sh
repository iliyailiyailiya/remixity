#!/bin/sh
# Build and deploy to Cloudflare Pages.
#
# Every earlier version's files (dist/assets, all named by content hash) stay
# online too: a page opened before an update (a home-screen app can stay open
# for days) still finds the pieces it loads later, like the story encoder.
# They're kept in .deploy-assets (not committed); files unused for 60 days go.
set -e
cd "$(dirname "$0")/.."
python3 scripts/build-pages.py              # feature pages + sitemap.xml
npm run build
rm -rf dist/_test
mkdir -p .deploy-assets
cp dist/assets/* .deploy-assets/            # current files (refreshes their date)
find .deploy-assets -type f -mtime +60 -delete
cp -n .deploy-assets/* dist/assets/ 2>/dev/null || true   # earlier versions alongside
npx wrangler@4 pages deploy dist --project-name remixity --branch main

# Tell IndexNow search engines (Bing, Yandex, Seznam, Naver…) the pages changed.
# Only our own public URLs are sent. The key file lives in public/.
KEY=$(ls public | grep -E '^[0-9a-f]{32}\.txt$' | head -1 | sed 's/\.txt$//')
if [ -n "$KEY" ]; then
  URLS=$(grep -o '<loc>[^<]*' public/sitemap.xml | sed 's/<loc>/"/; s/$/"/' | paste -sd, -)
  curl -s -o /dev/null -w "IndexNow: HTTP %{http_code}\n" -X POST https://api.indexnow.org/indexnow \
    -H 'Content-Type: application/json; charset=utf-8' \
    --data "{\"host\":\"remixity.app\",\"key\":\"$KEY\",\"keyLocation\":\"https://remixity.app/$KEY.txt\",\"urlList\":[$URLS]}" || true
fi
