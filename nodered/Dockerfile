# syntax=docker/dockerfile:1.4
# Guardian stack — Node-RED custom image.
#
# Build stages:
#   deps    — installs npm packages (including @heromatic/*)
#   project — clones gitlab.com/costa4844917/enviromental at GITLAB_BRANCH
#   final   — Alpine runtime with everything baked in (no clone at runtime)
#
# Build-time secrets (passed as build args, never persisted in final image):
#   HEROMATIC_NPM_USER / HEROMATIC_NPM_PASS — only if @heromatic/* needs auth
#   GITLAB_USER / GITLAB_TOKEN              — credentials for cloning the project
#
# Force-refresh the project clone with: docker compose build --no-cache nodered
# ---- Stage 1: npm deps ----
FROM nodered/node-red:latest-22 AS deps
USER root
ARG HEROMATIC_NPM_USER
ARG HEROMATIC_NPM_PASS
ARG HEROMATIC_NPM_REGISTRY=https://registry.npmjs.org/
WORKDIR /deps
RUN set -eu; \
    if [ -n "${HEROMATIC_NPM_USER:-}" ] && [ -n "${HEROMATIC_NPM_PASS:-}" ]; then \
        AUTH=$(echo -n "${HEROMATIC_NPM_USER}:${HEROMATIC_NPM_PASS}" | base64 -w0); \
        { \
          echo "registry=${HEROMATIC_NPM_REGISTRY}"; \
          echo "@heromatic:registry=${HEROMATIC_NPM_REGISTRY}"; \
          echo "_auth=${AUTH}"; \
          echo "always-auth=true"; \
          echo "email=ci@guardian.local"; \
        } > /root/.npmrc; \
    fi
RUN npm install --prefix /deps --omit=dev \
    @heromatic/mist-house-services \
    @heromatic/node-red-contrib-advanced-trigger-timer \
    @heromatic/node-red-contrib-hero-azure-iot \
    @heromatic/node-red-contrib-modbus-buffer-plus \
    @heromatic/node-red-contrib-hero-dx-resources \
    @heromatic/node-red-contrib-mdb-message-manager \
    @heromatic/node-red-contrib-mqtt-in-out \
    node-red-contrib-dx-resources \
    node-red-contrib-modbus \
    node-red-contrib-ui-media \
    node-red-dashboard \
    node-red-node-ui-table \
    @flowfuse/node-red-dashboard \
    node-red-contrib-cron-plus \
    express-session \
    connect-pg-simple \
    pg
RUN rm -f /root/.npmrc
# ---- Stage 2: clone the Guardian project from GitLab ----
FROM alpine/git:latest AS project
ARG GITLAB_USER
ARG GITLAB_TOKEN
ARG GITLAB_REPO=gitlab.com/costa4844917/enviromental.git
ARG GITLAB_BRANCH=release-5
RUN set -eu; \
    if [ -n "${GITLAB_USER:-}" ] && [ -n "${GITLAB_TOKEN:-}" ]; then \
        git clone --depth 1 -b "$GITLAB_BRANCH" \
            "https://${GITLAB_USER}:${GITLAB_TOKEN}@${GITLAB_REPO}" \
            /project; \
        rm -rf /project/.git; \
    else \
        echo "GITLAB_USER/GITLAB_TOKEN no proporcionados — se omite el clonado del proyecto Guardian (esta etapa es opcional)" >&2; \
        mkdir -p /project; \
    fi
# ---- Stage 3: final runtime image ----
FROM nodered/node-red:latest-22
USER root
# gettext provides envsubst (template rendering at startup).
# ca-certificates kept for any future HTTPS access from the container.
RUN apk add --no-cache gettext ca-certificates
# npm packages from the deps stage.
COPY --from=deps --chown=node-red:node-red /deps/node_modules /data/node_modules
COPY --from=deps --chown=node-red:node-red /deps/package.json /data/package.json
COPY --from=deps --chown=node-red:node-red /deps/package-lock.json /data/package-lock.json
# Pre-cloned Guardian project (no .git, no credentials).
COPY --from=project --chown=node-red:node-red /project /data/projects/enviromental
# settings.js, templates, entrypoint.
COPY --chown=node-red:node-red settings.js /data/settings.js
COPY --chown=node-red:node-red templates /templates
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh && chown -R node-red:node-red /data
USER node-red
WORKDIR /usr/src/node-red
ENTRYPOINT ["/entrypoint.sh"]
CMD ["npm", "start", "--cache", "/data/.npm", "--", "--userDir", "/data"]