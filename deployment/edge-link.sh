#!/bin/sh
set -eu
cp /keys/id_ed25519 /tmp/falcon-link-key
chmod 600 /tmp/falcon-link-key
# Outbound authenticated connection only. Cloud listeners remain loopback-only.
while true; do
  ssh -NT -i /tmp/falcon-link-key -o UserKnownHostsFile=/keys/known_hosts \
    -o StrictHostKeyChecking=yes -o BatchMode=yes -o ExitOnForwardFailure=yes \
    -o ServerAliveInterval=15 -o ServerAliveCountMax=3 \
    -L 0.0.0.0:1880:127.0.0.1:18881 \
    -R 127.0.0.1:18880:nodered:1880 \
    -R 127.0.0.1:18882:casa-norte-nodered:1880 \
    opc@150.230.161.145 || true
  sleep 5
done
