#!/bin/sh
# Falcon Node-RED entrypoint.
#
# flows.json/riego.json are baked into the image at build time (no
# external project clone, no Node-RED "Projects" feature), so this
# script just patches the Modbus gateway address from env vars, then
# hands off to Node-RED.

set -eu

log() { echo "[falcon-entrypoint] $*"; }

# Patch all Modbus client configs in flows.json so they all point at the
# gateway IP/port from the env. Vestigial from an earlier TCP-gateway setup
# -- the Riego flow now talks Modbus RTU over serial (/dev/ttyUSB0), so
# these tcpHost/tcpPort fields are unused, but the patch is harmless.
FLOWS_FILE="/data/flows.json"
if [ -f "$FLOWS_FILE" ] && [ -n "${MODBUS_GATEWAY_IP:-}" ]; then
    PORT="${MODBUS_GATEWAY_PORT:-502}"
    log "Patching flows.json: tcpHost -> $MODBUS_GATEWAY_IP, tcpPort -> $PORT"
    sed -i \
        -e "s/\"tcpHost\": \"[^\"]*\"/\"tcpHost\": \"$MODBUS_GATEWAY_IP\"/g" \
        -e "s/\"tcpPort\": \"[^\"]*\"/\"tcpPort\": \"$PORT\"/g" \
        "$FLOWS_FILE"
fi

log "Starting Node-RED"
exec "$@"
