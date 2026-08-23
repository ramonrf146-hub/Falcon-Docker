# Guardian Docker Stack — Design Spec

**Fecha:** 2026-04-24
**Estado:** Aprobado por el usuario (revisión 2 tras incorporar Guía de Instalación Node-RED Guardian Release 15)

## Resumen

Stack Docker que aloja y orquesta los servicios necesarios para el proyecto **Environmental Monitoring / Node-RED Guardian** (Task-1667). El sistema combina:

- **Node-RED Guardian** (proyecto GitLab `costa4844917/enviromental`, rama `release-5`) ejecutándose con la funcionalidad de **Projects** habilitada, que:
  1. Lee sensores **Modbus TCP** a través del gateway `192.168.1.254` (RS485 bridge).
  2. Consume **uplinks LoRaWAN** desde ChirpStack (incluye sensor de lluvia Dragino configurado en `rainAzureApi.json`).
  3. Integra la API de **Azure Maps** para pronóstico meteorológico y condiciones climáticas.
  4. Envía telemetría consolidada a **Azure IoT Hub** usando SAS Key.
- **ChirpStack v4** como Network/Application Server LoRaWAN, conectado al gateway **Dragino LPS8v2** vía **Semtech UDP packet forwarder** (puerto 1700/UDP), región **US915** sub-banda 0.
- Servicios de soporte: PostgreSQL, Redis, Eclipse Mosquitto.

El proyecto se organiza como un repositorio Git `guardian-docker` que contiene el stack Docker y la configuración base versionada. El proyecto Node-RED en sí vive en su propio repo GitLab y se clona en un volumen durante el primer arranque.

Host de despliegue: **Windows con Docker Desktop**.

## Objetivos

1. Empaquetar todo el stack como un único `docker compose` reproducible.
2. Versionar el stack Docker en Git; el código Node-RED queda en su repo GitLab aparte.
3. Automatizar el clonado de `costa4844917/enviromental` rama `release-5` al primer arranque.
4. Preinstalar todas las dependencias `npm` (incluyendo paquetes privados `@heromatic/*` que requieren autenticación).
5. Habilitar `projects.enabled` en `settings.js` y configurar `sentinelPath` como variable de entorno.
6. Mantener separación clara entre configuración inicial versionada y runtime (devices LoRa registrados, datos, credenciales).
7. Permitir que `env.json` y `rainAzureApi.json` se rellenen desde plantillas y variables de entorno sin exponer secretos en Git.
8. Asegurar que el LPS8v2 pueda alcanzar el `chirpstack-gateway-bridge` desde la LAN con Docker Desktop Windows.

## No objetivos

- **No** se incluye base de datos para histórico local (Azure IoT Hub maneja el histórico).
- **No** se versiona la lista de gateways/devices LoRa registrados en ChirpStack.
- **No** se incluye dashboard externo (Grafana).
- **No** se mueve el repositorio `enviromental` — sigue en GitLab como single source of truth del código Node-RED.
- **No** se cubre provisión de recursos Azure (IoT Hub, Maps).

## Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│                    Host: Windows + Docker Desktop                │
│                                                                  │
│  ┌──────────────┐   ┌──────────────────────────────────────┐    │
│  │   Node-RED   │◄──┤  MQTT Broker (Eclipse Mosquitto)     │    │
│  │  Guardian    │   │  (puerto 1883)                       │    │
│  │  (1880)      │   └──────────────┬───────────────────────┘    │
│  └──┬────────┬──┘                  ▲                            │
│     │        │                     │ uplinks                    │
│     │        │             ┌───────┴──────────┐                 │
│     │        │             │   ChirpStack v4  │                 │
│     │        │             │   (8080)         │                 │
│     │        │             └───────┬──────────┘                 │
│     │        ▼                     │                            │
│     │  Azure IoT Hub       ┌───────┴──────────┐                 │
│     │  Azure Maps          │ gateway-bridge   │◄── UDP 1700 ◄── LPS8v2
│     │  (cloud)             └──────────────────┘                 │
│     │                                                            │
│     ▼                                                            │
│ Modbus TCP 192.168.1.254  (gateway TCP→RS485)                   │
│                                                                  │
│  ┌────────────┐  ┌─────────┐                                    │
│  │ PostgreSQL │  │  Redis  │  (backends de ChirpStack)          │
│  └────────────┘  └─────────┘                                    │
└─────────────────────────────────────────────────────────────────┘
```

### Servicios Docker

| Servicio | Imagen | Función |
|---|---|---|
| `nodered` | Custom build basado en `nodered/node-red:latest-18` (Node.js 18) | Ejecuta el proyecto Guardian con todos los nodos preinstalados |
| `mosquitto` | `eclipse-mosquitto:2` | Broker MQTT compartido |
| `chirpstack` | `chirpstack/chirpstack:4` | Network + Application Server LoRaWAN |
| `chirpstack-gateway-bridge` | `chirpstack/chirpstack-gateway-bridge:4` | Semtech UDP → MQTT |
| `chirpstack-rest-api` | `chirpstack/chirpstack-rest-api:4` | REST API (opcional) |
| `postgres` | `postgres:14` | Backend ChirpStack |
| `redis` | `redis:7-alpine` | Caché/sesiones ChirpStack |

### Flujo de datos

- **LoRa:** LPS8v2 → UDP/1700 → `gateway-bridge` → MQTT → `chirpstack` → MQTT (`application/<id>/device/<deveui>/event/up`) → Node-RED → Azure IoT Hub.
- **Modbus:** Gateway Modbus TCP `192.168.1.254` ← `node-red-contrib-modbus` (servers `246/unitId=4`, `247/unitId=1`, período 15s, formato `REARRANGE-R8`) → Node-RED → Azure IoT Hub.
- **Azure Maps:** Node-RED llama API Azure Maps con `azureMapKey` y `lat/lon` según `rainAzureApi.json`.

### Red Docker

Red bridge `guardian-net`. Resolución DNS interna por nombre de servicio.

### Puertos expuestos al host

| Servicio | Host | Contenedor | Protocolo |
|---|---|---|---|
| Node-RED | 1880 | 1880 | TCP |
| ChirpStack UI | 8080 | 8080 | TCP |
| ChirpStack REST API | 8090 | 8090 | TCP |
| Gateway Bridge | **1700** | **1700** | **UDP** |
| Mosquitto | 1883 | 1883 | TCP |
| PostgreSQL | — | 5432 | TCP |
| Redis | — | 6379 | TCP |

## Estructura del repositorio `guardian-docker`

```
guardian-docker/
├── docker-compose.yml
├── .env.example
├── .env                                 # local, no versionado
├── .gitignore
├── README.md
│
├── nodered/
│   ├── Dockerfile                       # imagen custom Node.js 18 + npm auth + deps
│   ├── entrypoint.sh                    # clona GitLab al primer arranque + renderiza plantillas
│   ├── settings.js                      # con projects.enabled=true + sentinelPath
│   ├── templates/
│   │   ├── env.json.tmpl                # plantilla con variables ${...}
│   │   └── rainAzureApi.json.tmpl
│   └── README.md
│
├── chirpstack/
│   ├── chirpstack.toml
│   ├── chirpstack-gateway-bridge.toml
│   └── region_us915_0.toml
│
├── mosquitto/
│   └── config/
│       └── mosquitto.conf
│
└── postgres/
    └── initdb/
        └── 001-create-chirpstack-db.sh
```

## Manejo del proyecto Node-RED Guardian

### Estrategia de clonado

El repo `gitlab.com/costa4844917/enviromental.git` **no** se empaqueta dentro de la imagen Docker (es código que evoluciona y contiene lógica del cliente). En su lugar:

1. El `entrypoint.sh` del contenedor `nodered` comprueba si `/data/projects/enviromental` existe en el volumen.
2. Si no existe, clona con `git clone -b release-5 https://<GITLAB_USER>:<GITLAB_TOKEN>@gitlab.com/costa4844917/enviromental.git /data/projects/enviromental`.
3. A partir de entonces, los `docker compose restart` reusan el clon del volumen. Actualizar a una versión nueva del repo se hace con `git pull` dentro del contenedor o borrando el volumen.

Credenciales GitLab: `GITLAB_USER` y `GITLAB_TOKEN` (o password) vienen de `.env`. Se recomienda usar **Personal Access Token con scope `read_repository`** en lugar de password.

### Renderizado de `env.json` y `rainAzureApi.json`

Estos archivos contienen secretos (SAS Key Azure, Azure Maps Key) y no deben versionarse. Estrategia:

1. En `guardian-docker/nodered/templates/` viven plantillas `env.json.tmpl` y `rainAzureApi.json.tmpl` con marcadores `${VAR}`.
2. El `entrypoint.sh` usa `envsubst` para renderizar las plantillas con los valores de las variables de entorno del contenedor y escribirlas en `/data/projects/enviromental/data/env.json` y `rainAzureApi.json`.
3. Se renderizan en cada arranque del contenedor — así un cambio en `.env` se refleja sin tener que borrar volúmenes.
4. Las plantillas se versionan (sin secretos). Los archivos renderizados quedan solo en el volumen.

### Dependencias npm

Se preinstalan en la imagen Docker durante el `docker build` para evitar descargas en cada arranque:

- `@heromatic/mist-house-services`
- `@heromatic/node-red-contrib-advanced-trigger-timer`
- `@heromatic/node-red-contrib-hero-azure-iot`
- `@heromatic/node-red-contrib-modbus-buffer-plus`
- `@heromatic/node-red-contrib-hero-dx-resources`
- `@heromatic/node-red-contrib-mdb-message-manager`
- `@heromatic/node-red-contrib-mqtt-in-out`
- `node-red-contrib-dx-resources`
- `node-red-contrib-modbus`
- `node-red-contrib-ui-media`
- `node-red-dashboard`
- `node-red-node-ui-table`

### Autenticación registro npm privado `@heromatic`

Dado que el usuario tiene **usuario y contraseña** (no token), estrategia:

1. En el build se genera un `.npmrc` temporal con el token derivado de las credenciales, usando un build-arg pasado desde `.env`.
2. Opciones:
   - **(A)** Obtener un token de npm una sola vez (`npm login --scope=@heromatic --registry=<registry>`) y usar ese token en `.npmrc` vía build-arg `NPM_TOKEN`. **Recomendado.**
   - **(B)** Si el registro requiere basic auth con usuario/pass directo, se codifica como `_auth=$(echo -n "user:pass" | base64)` en el `.npmrc`.
3. El `.npmrc` se crea en build-time y se elimina tras `npm install` con un multi-stage build o `--mount=type=secret` para no filtrarlo al layer final.
4. El registry URL del scope se asume como el público de Heromatic (se documentará cuando el usuario lo confirme en el plan de implementación). Si es un registry interno con URL distinta, se parametriza vía `.env`.

### `settings.js` custom

- Proviene del repo `guardian-docker` (no del clon GitLab) y se monta en `/data/settings.js`.
- Contiene:
  - `editorTheme.projects.enabled = true`
  - `process.env.sentinelPath` se setea **antes** del `module.exports` apuntando a `/data/projects/enviromental`
  - Lectura del `credentialSecret` desde `process.env.NODERED_CREDENTIAL_SECRET`
  - Opcionalmente `adminAuth` si se configura en `.env`

## Variables de entorno (`.env.example`)

```dotenv
# === PostgreSQL (ChirpStack backend) ===
POSTGRES_USER=chirpstack
POSTGRES_PASSWORD=changeme
POSTGRES_DB=chirpstack

# === ChirpStack ===
CHIRPSTACK_REGION=us915_0

# === Node-RED ===
NODERED_CREDENTIAL_SECRET=changeme-please

# === GitLab (clonado del proyecto Guardian) ===
GITLAB_USER=
GITLAB_TOKEN=

# === Registro npm privado Heromatic (build-time) ===
HEROMATIC_NPM_USER=
HEROMATIC_NPM_PASS=
# o, preferido:
# HEROMATIC_NPM_TOKEN=

# === Azure IoT Hub (env.json) ===
IOT_DEVICE_ID=
IOT_HUB_HOSTNAME=
IOT_SAS_KEY=
AREA_ID=

# === Azure Maps + Dragino (rainAzureApi.json) ===
DRAGINO_RAIN_EUI=
AZURE_MAP_KEY=
SITE_LAT=
SITE_LON=

# === Modbus ===
MODBUS_GATEWAY_IP=192.168.1.254
MODBUS_GATEWAY_PORT=502
```

## Configuración ChirpStack

- `chirpstack.toml`: conecta a `postgres:5432`, `redis:6379`, MQTT `mosquitto:1883`, región `us915_0`.
- `chirpstack-gateway-bridge.toml`: bind UDP `0.0.0.0:1700`, MQTT `tcp://mosquitto:1883`, `region_id="us915_0"`.
- `region_us915_0.toml`: US915 sub-banda 0 (canales 0-7).

## Healthchecks y dependencias

- `postgres`, `redis`, `mosquitto` con healthchecks nativos.
- `chirpstack` depende de postgres y redis healthy, mosquitto started.
- `chirpstack-gateway-bridge` depende de mosquitto.
- `nodered` arranca sin esperas (tolerante).

## Persistencia

| Recurso | Volumen | Versionado en Git |
|---|---|---|
| Proyecto clonado `enviromental/` | `nodered_data` en `/data/projects/` | No |
| `node_modules` de Node-RED | Dentro de imagen (preinstalados) + `nodered_data` para instalaciones runtime | No |
| Flujos runtime, `flows_cred.json` | `nodered_data` | No |
| `env.json`, `rainAzureApi.json` renderizados | `nodered_data` | No |
| PostgreSQL (gateways/devices ChirpStack) | `postgres_data` | No |
| Redis | `redis_data` | No |
| Mosquitto | `mosquitto_data`, `mosquitto_log` | No |
| `docker-compose.yml`, configs `.toml`, `settings.js`, `Dockerfile`, `entrypoint.sh`, plantillas | Bind mount / archivos en repo | **Sí** |

## `.gitignore`

```
.env
*.log
nodered/data/
mosquitto/data/
mosquitto/log/
postgres/data/
```

## Despliegue

1. Prerequisitos: Docker Desktop, Git, acceso a GitLab con user/token, credenciales npm Heromatic.
2. `git clone <guardian-docker-repo>` y entrar.
3. `cp .env.example .env`, rellenar todas las variables.
4. `docker compose build` (primera vez — instala dependencias npm, puede tardar).
5. `docker compose up -d`.
6. Primer arranque de `nodered`: clona `enviromental` desde GitLab, renderiza `env.json` y `rainAzureApi.json`.
7. ChirpStack UI `http://localhost:8080` → login `admin/admin` → registrar tenant, device profile US915, gateway LPS8v2, aplicación, devices.
8. Configurar LPS8v2: Semtech UDP → Server = IP LAN del host, Port = 1700.
9. Node-RED UI `http://localhost:1880` → validar proyecto Guardian cargado → deploy.

## Operaciones comunes

- Levantar / detener: `docker compose up -d` / `docker compose down`.
- Logs: `docker compose logs -f <servicio>`.
- Rebuildear Node-RED tras cambiar deps: `docker compose build nodered && docker compose up -d nodered`.
- Actualizar proyecto Node-RED a nueva versión GitLab: `docker compose exec nodered sh -c "cd /data/projects/enviromental && git pull"` y reiniciar Node-RED.
- Cambiar a otra rama GitLab: `docker compose exec nodered sh -c "cd /data/projects/enviromental && git checkout <rama>"`.
- Re-renderizar config tras cambiar `.env`: `docker compose restart nodered`.
- Backup ChirpStack: `docker compose exec postgres pg_dump -U chirpstack chirpstack > backup.sql`.

## Troubleshooting (en README)

- **Error `npm install` con `@heromatic/*`:** revisar `HEROMATIC_NPM_TOKEN` o user/pass en `.env` y que el registry URL sea correcto.
- **LPS8v2 no aparece en ChirpStack:** firewall Windows abre UDP/1700, gateway apuntando a IP LAN (no `localhost`), revisar logs de `gateway-bridge`.
- **Node-RED no conecta al Modbus TCP `192.168.1.254`:** verificar que Docker Desktop tenga acceso a la LAN (no solo NAT interno), probar `docker compose exec nodered ping 192.168.1.254`.
- **Clonado GitLab falla:** token con scope insuficiente, credenciales mal escritas en `.env`, rama `release-5` renombrada.
- **`env.json`/`rainAzureApi.json` vacíos:** variables de entorno no seteadas o `envsubst` no instalado en la imagen.
- **ChirpStack UI no carga:** esperar migración inicial Postgres (30-60s), revisar `docker compose logs chirpstack`.

## Decisiones clave (revisadas)

| Decisión | Alternativa | Razón |
|---|---|---|
| Imagen Node-RED basada en Node.js 18 | Node.js latest | Guía explícitamente pide v18+ LTS |
| Clonar `enviromental` en volumen al arranque | Baked-in a la imagen | El repo evoluciona independiente; re-build no debería requerirse para nuevas releases |
| Plantillas + `envsubst` para `env.json`/`rainAzureApi.json` | Copiar archivos completos con secretos | Evita versionar secretos y permite parametrizar por despliegue |
| Preinstalar `node_modules` en la imagen | Instalar en arranque cada vez | Arranque más rápido y determinista; rebuildeable con `docker compose build` |
| `.npmrc` vía build-arg + multi-stage o secret mount | `.npmrc` persistente en imagen | Evita filtrar credenciales al layer final |
| `settings.js` custom en el repo | Usar el default del clon GitLab | El default no tiene `projects.enabled` ni `sentinelPath` |
| ChirpStack v4 | v3 | Rama actual, más simple |
| Semtech UDP | Basic Station, MQTT forwarder | Default del LPS8v2, cero config extra |
| Mosquitto dedicado | MQTT embebido de ChirpStack | Desacopla Node-RED del internals de ChirpStack |
| Sin InfluxDB local | Añadir Timescale/Influx | Azure IoT Hub gestiona histórico |

## Riesgos y mitigaciones

- **Riesgo:** Docker Desktop Windows tiene limitaciones de red; `node-red-contrib-modbus` podría no alcanzar `192.168.1.254`.
  **Mitigación:** Verificar en el plan la opción de usar `host.docker.internal` o configurar Docker Desktop para compartir red LAN. Documentar troubleshooting con `ping` desde el contenedor.
- **Riesgo:** Credenciales npm Heromatic quedan en layers de imagen si no se usa multi-stage/secret mount.
  **Mitigación:** Build con `--mount=type=secret,id=npmrc` (BuildKit) o multi-stage donde solo el stage final lleva `node_modules`.
- **Riesgo:** El `git clone` al arranque falla si GitLab está caído → el contenedor no tiene proyecto.
  **Mitigación:** El `entrypoint.sh` diferencia "primer arranque" de "ya clonado"; en primer arranque fallido registra error claro; en arranques sucesivos usa el volumen existente.
- **Riesgo:** Usuario/pass npm Heromatic no generan un token válido.
  **Mitigación:** Documentar cómo obtener token ejecutando `npm login` una vez antes del build.
- **Riesgo:** Sub-banda US915 incorrecta (si el LPS8v2 usa otra).
  **Mitigación:** Variable `CHIRPSTACK_REGION` parametrizable en `.env`.
- **Riesgo:** `NODERED_CREDENTIAL_SECRET` se pierde → credenciales Node-RED irrecuperables.
  **Mitigación:** Se documenta respaldar el `.env` fuera del repo.

## Criterios de éxito

1. `docker compose build` completa sin errores, con paquetes `@heromatic/*` instalados.
2. `docker compose up -d` levanta los 7 servicios healthy.
3. En primer arranque, `nodered` clona `enviromental` rama `release-5` y renderiza `env.json` + `rainAzureApi.json` desde variables de entorno.
4. ChirpStack UI accesible en `http://localhost:8080`, login funcional.
5. LPS8v2 configurado contra IP LAN aparece online en ChirpStack.
6. Un device LoRa registrado emite uplinks visibles en ChirpStack.
7. Node-RED carga el proyecto Guardian sin errores, con todos los nodos `@heromatic/*` y públicos reconocidos.
8. Node-RED suscrito a MQTT ChirpStack recibe uplinks.
9. Node-RED conecta al Modbus TCP `192.168.1.254` y lee servers 246/247.
10. Node-RED envía datos a Azure IoT Hub usando las credenciales de `env.json`.
11. Node-RED consulta Azure Maps con la key de `rainAzureApi.json`.
12. Tras `docker compose down && up -d`: persisten gateways/devices ChirpStack y flujos runtime.
13. Tras `docker compose down -v && up -d`: stack arranca limpio, re-clona GitLab, re-renderiza configs.
