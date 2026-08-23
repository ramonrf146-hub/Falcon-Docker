# Respaldo del flujo Riego

Copia de seguridad de `flows.json` y `package.json` del proyecto Node-RED
"Riego-Docker", que vive normalmente **adentro del volumen Docker
`nodered_data`** (no en esta carpeta) y se edita en vivo entrando al
contenedor `guardian-nodered-1`.

Esta carpeta existe para que el flujo completo (control de riego, sensores,
rutinas, idioma, todo) tenga una copia versionada con git fuera de Docker,
por si el volumen se corrompe o se borra por accidente.

También incluye `riego.json` (zonas, válvulas, rutinas, sensores) — los
datos reales de la app, separados del flujo, que viven en `/data/riego.json`
dentro del volumen.

## Cómo actualizar este respaldo

Después de hacer cambios importantes (vía editor de Node-RED, la app, o
scripts), corré esto para traer la copia más reciente:

```bash
docker cp guardian-nodered-1:/data/projects/Riego-Docker/flows.json ./flows.json
docker cp guardian-nodered-1:/data/projects/Riego-Docker/package.json ./package.json
docker cp guardian-nodered-1:/data/riego.json ./riego.json
```

Después commiteá los cambios como cualquier archivo del repo.

## Cómo restaurar (si el volumen se pierde)

1. Levantá el contenedor de Node-RED nuevo (`docker compose up -d nodered`).
2. Copiá estos archivos de vuelta:
   ```bash
   docker cp ./flows.json guardian-nodered-1:/data/projects/Riego-Docker/flows.json
   docker cp ./package.json guardian-nodered-1:/data/projects/Riego-Docker/package.json
   docker cp ./riego.json guardian-nodered-1:/data/riego.json
   ```
3. Redeployá desde el editor de Node-RED, o forzá un full-deploy vía la Admin API.

Nota: los usuarios (ramon, operador1, etc.) NO están acá — viven en
Postgres (`riego_auth.users`), no en estos archivos. Eso necesita su
propio respaldo de base de datos si te importa (`pg_dump`).
