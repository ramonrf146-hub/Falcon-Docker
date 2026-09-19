# Respaldo del flujo Riego

Copia de seguridad de `flows.json`, `package.json` y `riego.json` de la
app de riego. Esta es la fuente de verdad: el `Dockerfile` copia
`flows.json` y `riego.json` de acá directo a `/data/` **al construir la
imagen**, así que cualquier instalación nueva (`docker compose build`)
ya arranca con el flujo completo (control de riego, sensores, rutinas,
cortinas, idioma, todo).

## Cómo actualizar este respaldo

Si editaste el flujo en vivo (vía el editor de Node-RED en un contenedor
ya corriendo) y querés que ese cambio quede guardado acá para el próximo
build:

```bash
docker cp falcon-nodered-1:/data/flows.json ./flows.json
docker cp falcon-nodered-1:/data/riego.json ./riego.json
```

Después commiteá los cambios como cualquier archivo del repo.

## Cómo aplicar un cambio sin reconstruir la imagen

Si ya tenés un contenedor corriendo y querés empujarle una versión más
nueva de `flows.json` sin rebuildear:

```bash
docker cp ./flows.json falcon-nodered-1:/data/flows.json
docker cp ./riego.json falcon-nodered-1:/data/riego.json
```

Después redeployá desde el editor de Node-RED, o forzá un full-deploy
vía la Admin API.

Nota: los usuarios (ramon, operador1, etc.) NO están acá — viven en
Postgres (`riego_auth.users`), no en estos archivos. Eso necesita su
propio respaldo de base de datos si te importa (`pg_dump`).
