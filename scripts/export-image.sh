#!/bin/sh
# Exports the riego-docker:latest image (already built locally) to a
# compressed tarball that can be copied via USB/network/email to a fresh
# PC and loaded with scripts/import-image.sh.
#
# Usage:  ./scripts/export-image.sh
# Output: dist/riego-docker-<date>.tar.gz

set -eu

IMAGE="${IMAGE:-riego-docker:latest}"
OUT_DIR="${OUT_DIR:-dist}"
DATE_TAG=$(date +%Y%m%d-%H%M)
OUT_FILE="$OUT_DIR/riego-docker-$DATE_TAG.tar.gz"

if ! command -v docker >/dev/null 2>&1; then
    echo "ERROR: docker not found in PATH" >&2
    exit 1
fi

if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
    echo "ERROR: image '$IMAGE' not found locally."
    echo "Build it first with: docker compose build nodered"
    exit 1
fi

mkdir -p "$OUT_DIR"

echo "Exporting $IMAGE to $OUT_FILE..."
docker save "$IMAGE" | gzip > "$OUT_FILE"

SIZE=$(du -h "$OUT_FILE" | awk '{print $1}')
echo
echo "Done. File: $OUT_FILE ($SIZE)"
echo
echo "Next steps on the target PC:"
echo "  1. git clone <this repo>"
echo "  2. Copy $OUT_FILE into the cloned repo"
echo "  3. ./scripts/import-image.sh $OUT_FILE"
echo "  4. cp .env.example .env  (then edit per-site values)"
echo "  5. docker compose up -d --no-build"
