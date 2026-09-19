# syntax=docker/dockerfile:1.4
# Falcon stack — Node-RED custom image.
#
# Build stages:
#   deps  — installs npm packages
#   final — Alpine runtime with node_modules + our own flows.json/riego.json
#           baked in (no external clone at build or run time)
#
# Force-refresh the baked-in flows with: docker compose build --no-cache nodered
# ---- Stage 1: npm deps ----
FROM nodered/node-red:latest-22 AS deps
USER root
WORKDIR /deps
RUN npm install --prefix /deps --omit=dev \
    node-red-contrib-modbus \
    node-red-dashboard \
    @flowfuse/node-red-dashboard \
    node-red-contrib-cron-plus \
    express-session \
    connect-pg-simple \
    pg \
    bcryptjs
# ---- Stage 2: final runtime image ----
FROM nodered/node-red:latest-22
USER root
# gettext provides envsubst (template rendering at startup).
# ca-certificates kept for any future HTTPS access from the container.
RUN apk add --no-cache gettext ca-certificates
# npm packages from the deps stage.
COPY --from=deps --chown=node-red:node-red /deps/node_modules /data/node_modules
COPY --from=deps --chown=node-red:node-red /deps/package.json /data/package.json
COPY --from=deps --chown=node-red:node-red /deps/package-lock.json /data/package-lock.json
# Our own flows + app data, baked in directly (no Node-RED "Projects"
# feature, no external clone — this repo is the single source of truth).
COPY --chown=node-red:node-red riego-flow-backup/flows.json /data/flows.json
COPY --chown=node-red:node-red riego-flow-backup/riego.json /data/riego.json
# settings.js, entrypoint.
COPY --chown=node-red:node-red settings.js /data/settings.js
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh && chown -R node-red:node-red /data
USER node-red
WORKDIR /usr/src/node-red
ENTRYPOINT ["/entrypoint.sh"]
CMD ["npm", "start", "--cache", "/data/.npm", "--", "--userDir", "/data"]
