# Plataforma central en Oracle

Estado verificado el 2026-09-21. El proyecto remoto es `~/falcon-central`, independiente de `~/sistema-domotica`.

## Arquitectura desplegada

- Oracle: gateway/dashboard principal, Hub, usuarios, PostgreSQL y túnel público de water.riegocom.uk.
- PC local: Node-RED de Casa Principal y Casa Norte; mantienen control físico y ejecución de rutinas.
- `hub-nodered` local ahora es un enlace SSH persistente, no un Hub Node-RED. Conserva el nombre DNS para que los Edges lleguen al Hub central sin cambiar sus flows.
- El enlace publica únicamente en loopback de Oracle: Principal 18880, Norte 18882. Reenvía el puerto local 1880 al Hub remoto 18881. La clave dedicada limita los destinos permitidos.
- PostgreSQL remoto escucha en 127.0.0.1:15432; gateway en 127.0.0.1:3000; Hub en 127.0.0.1:18881. Cloudflared publica el gateway.

## Fuente de verdad y permisos

La base `falcon_central`, esquema `riego_hub`, es ahora la fuente de verdad. No volver a importar el antiguo esquema local: sobrescribiría cambios recientes. La copia local se conserva como respaldo histórico.

El gateway verifica el rol actual en la base en cada solicitud. `/hub` requiere administrador y envía una identidad firmada de corta duración; el Hub comprueba firma y rol nuevamente. Los Edges pueden enviar heartbeat, pero ya no crear estructura central mediante seed_structure. Los endpoints de preferencias/contraseña propia conservan sus permisos específicos.

## Operación

En Oracle, desde `~/falcon-central/deployment`:

```sh
sudo docker compose -f cloud.compose.yml --profile public ps
sudo docker exec falcon-central-gateway-1 node /app/verify-central.cjs
```

En la PC, `docker start falcon-hub-nodered-1` recupera el enlace si se detuvo manualmente. No iniciar el perfil `local-platform`: contiene el gateway y túnel público anteriores, detenidos tras la migración.

Los secretos están fuera de Git: `.deployment/` local y archivos `.env`/`tunnel.env` remotos. No imprimirlos ni incluirlos en handoffs. Los scripts prepare-cloud y centralize-compose son de migración inicial, no de actualización recurrente.

El volumen `hub_data` conserva flows/settings: reconstruir la imagen no reemplaza los archivos de un volumen existente. Antes de futuros despliegues, respaldar el volumen y copiar explícitamente los archivos revisados; validar sus hashes y reiniciar solamente el Hub. Nunca borrar el volumen para actualizar código.

Para otro sitio, crear un enlace con clave restringida y puerto remoto exclusivo, y registrar su URL privada desde el Hub administrador. Casa Sur sigue sin URL configurada.

## Alcance y validación

Se detuvo temporalmente solo el enlace local: Usuarios y Dashboard siguieron accesibles públicamente, mostrando las áreas sin conexión. Se restableció el enlace y ambas áreas volvieron a responder HTTP 200 y a aparecer En línea. No se accionó ningún equipo ni se reiniciaron los Edges.

El panel central y la administración de usuarios/áreas están disponibles sin la PC. Las pantallas de control, sensores y edición/ejecución de rutinas todavía pertenecen al Node-RED de cada área y requieren su conexión. No se implementó edición offline de rutinas ni una cola de órdenes.

Validaciones: cinco pruebas RBAC del Hub, pruebas integrales de aislamiento del gateway y rechazo GET/POST de usuario estándar, verificación real admin 200 / estándar 403 / anónimo 401 y coincidencia SHA256 entre fuente local y código desplegado.

La reconstrucción del Hub reporta avisos npm en dependencias de la imagen base; queda pendiente una revisión de dependencias compatible, sin aplicar actualizaciones forzadas al sistema productivo.
