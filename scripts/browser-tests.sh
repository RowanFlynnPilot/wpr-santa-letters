#!/usr/bin/env bash
# Runs the browser tests (web/tests) the way CI does: in Playwright's own container image, so the
# screenshots match CI's pixel for pixel. Needs Docker; works from Git Bash on Windows.
#
#   scripts/browser-tests.sh           run the tests
#   scripts/browser-tests.sh update    re-approve the screenshots after a change that was meant to
#                                      change a page; look at the new ones (web/tests/__screenshots__)
#                                      before committing them
#   scripts/browser-tests.sh og        remake web/public/og-image.png, the picture a pasted link shows
#   scripts/browser-tests.sh sheet     print the sponsor sheet (docs/sponsor-sheet, after its build.py) to PDF
#   scripts/browser-tests.sh shots     retake the sales pictures in docs/media: the site in its preview
#                                      mode ("Your business here"), for the sponsor sheet
#
# The repo is copied into the container, so its Linux node_modules never touch the ones on this machine.
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION=$(node -p "require('./web/package.json').devDependencies['@playwright/test']")
IMAGE="mcr.microsoft.com/playwright:v${VERSION}-noble"
WEB="$(cd web && (pwd -W 2>/dev/null || pwd))"
ARGS=""
[ "${1:-run}" = "update" ] && ARGS="--update-snapshots"
RUN="CI=1 npx playwright test $ARGS"
[ "${1:-run}" = "shots" ] && RUN="SPONSOR_SHOTS=1 npx playwright test sponsor-shots --project=chromium && mkdir -p /repo-docs/media && cp sponsor-shots/* /repo-docs/media/"
[ "${1:-run}" = "sheet" ] && RUN="node tests/sponsor-sheet-pdf.mjs /repo-docs/sponsor-sheet"
[ "${1:-run}" = "og" ] && RUN="node tests/og-image.mjs && cp public/og-image.png /repo-web/public/og-image.png"

MSYS_NO_PATHCONV=1 docker run --rm --ipc=host -v "$WEB:/repo-web" -v "$WEB/../docs:/repo-docs" "$IMAGE" bash -c "
  set -e
  mkdir /work && cd /repo-web
  tar --exclude=./node_modules --exclude=./dist --exclude=./test-results --exclude=./playwright-report -cf - . | tar -xf - -C /work
  cd /work && npm ci --no-audit --no-fund >/dev/null
  status=0
  $RUN || status=\$?
  mkdir -p /repo-web/tests/__screenshots__
  cp -r tests/__screenshots__/. /repo-web/tests/__screenshots__/ 2>/dev/null || true
  rm -rf /repo-web/test-results && cp -r test-results /repo-web/test-results 2>/dev/null || true
  exit \$status
"
