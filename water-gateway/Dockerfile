# Water Gateway -- punto de entrada publico unico (water.riegocom.uk).
# Servicio Node.js/Express propio, separado de Node-RED a proposito: hace
# falta control directo sobre el servidor HTTP crudo para poder reenviar
# WebSockets (Node-RED Dashboard 2.0 usa Socket.IO), algo que no se puede
# enganchar limpiamente desde un settings.js de Node-RED.
FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.js ./
COPY dashboard-shell.js ./
EXPOSE 3000
CMD ["node", "server.js"]
