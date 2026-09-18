# Respaldo del flujo del Hub

Copia de seguridad de `flows.json` del Node-RED del **Hub central de areas**
(Etapa 2), que corre en el contenedor `hub-nodered` (puerto 1881) y vive
normalmente en el volumen Docker `hub_nodered_data`, no en esta carpeta.

Contiene el flujo `Hub Areas`: las paginas de administracion (`/hub/areas`,
crear/revocar/reactivar/rotar key) y el endpoint que cada Edge consulta
periodicamente (`POST /api/areas/heartbeat`).

## Como actualizar este respaldo

Despues de cambios en el flujo del Hub (via su editor en `localhost:1881`
o por Admin API):

```bash
docker exec hub-nodered sh -c "cat /data/flows.json" > nodered/hub-flow-backup/flows.json
```

## Como restaurar

Con el contenedor `hub-nodered` corriendo:

```bash
docker cp nodered/hub-flow-backup/flows.json hub-nodered:/data/flows.json
docker restart hub-nodered
```
