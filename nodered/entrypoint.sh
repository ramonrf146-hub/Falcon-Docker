#!/bin/sh
# Riego Node-RED entrypoint.
#
# The project is baked into the image at build time, so this script
# only renders runtime config files (env.json, rainAzureApi.json) from
# templates using environment variables, then hands off to Node-RED.

set -eu

PROJECT_DIR="/data/projects/Riego-Docker"
PROJECT_DATA_DIR="$PROJECT_DIR/data"

log() { echo "[riego-entrypoint] $*"; }

# Sanity check: project must exist (baked at build time, copied into the
# volume on first start). If missing, the volume is corrupted or someone
# wiped /data without recreating the container.
if [ ! -d "$PROJECT_DIR" ]; then
    log "ERROR: $PROJECT_DIR not found."
    log "       The volume is missing the baked-in project."
    log "       Run: docker compose down -v && docker compose up -d"
    exit 1
fi

mkdir -p "$PROJECT_DATA_DIR"

log "Rendering env.json"
envsubst < /templates/env.json.tmpl > "$PROJECT_DATA_DIR/env.json"

log "Rendering rainAzureApi.json"
envsubst < /templates/rainAzureApi.json.tmpl > "$PROJECT_DATA_DIR/rainAzureApi.json"

# Patch all Modbus client configs in flows.json so they all point at the
# gateway IP/port from the env. Vestigial from an earlier TCP-gateway setup
# -- the Riego flow now talks Modbus RTU over serial (/dev/ttyUSB0), so
# these tcpHost/tcpPort fields are unused, but the patch is harmless.
PROJECT_FLOWS="$PROJECT_DIR/flows.json"
if [ -f "$PROJECT_FLOWS" ] && [ -n "${MODBUS_GATEWAY_IP:-}" ]; then
    PORT="${MODBUS_GATEWAY_PORT:-502}"
    log "Patching flows.json: tcpHost -> $MODBUS_GATEWAY_IP, tcpPort -> $PORT"
    sed -i \
        -e "s/\"tcpHost\": \"[^\"]*\"/\"tcpHost\": \"$MODBUS_GATEWAY_IP\"/g" \
        -e "s/\"tcpPort\": \"[^\"]*\"/\"tcpPort\": \"$PORT\"/g" \
        "$PROJECT_FLOWS"
fi

log "Starting Node-RED"
exec "$@"
