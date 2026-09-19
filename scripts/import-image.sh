#!/bin/sh
# Loads a falcon-docker image tarball (produced by scripts/export-image.sh)
# into the local Docker engine, so `docker compose up -d --no-build` can use
# it without rebuilding.
#
# Usage:  ./scripts/import-image.sh <path-to-tarball>
# Example: ./scripts/import-image.sh dist/falcon-docker-20261015-1430.tar.gz

set -eu

if [ "$#" -lt 1 ]; then
    echo "Usage: $0 <path-to-tarball>" >&2
    echo "Example: $0 dist/falcon-docker-20261015-1430.tar.gz" >&2
    exit 1
fi

TARBALL="$1"

if ! command -v docker >/dev/null 2>&1; then
    echo "ERROR: docker not found in PATH" >&2
    exit 1
fi

if [ ! -f "$TARBALL" ]; then
    echo "ERROR: file not found: $TARBALL" >&2
    exit 1
fi

echo "Loading image from $TARBALL..."
gunzip -c "$TARBALL" | docker load

echo
echo "Loaded images:"
docker image ls falcon-docker

echo
echo "Next steps:"
echo "  1. Edit .env with per-site values (LPS8 EUI, area ID/key, etc.)"
echo "  2. docker compose up -d --no-build"
