FROM nodered/node-red:latest-22
USER root
RUN cd /usr/src/node-red && npm install --omit=dev pg bcryptjs && npm install --prefix /data --omit=dev pg bcryptjs && chown -R node-red:node-red /data
COPY --chown=node-red:node-red nodered/hub-flow-backup/flows.json /data/flows.json
COPY --chown=node-red:node-red nodered/hub-settings.js /data/settings.js
USER node-red
