# Guardian Docker Stack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Docker Compose stack that runs the Node-RED Guardian project (GitLab `costa4844917/enviromental` branch `release-5`), ChirpStack v4 with Dragino LPS8v2 US915 integration, MQTT broker, and supporting services, all reproducible from a single `git clone` + `docker compose up`.

**Architecture:** 7-service Docker Compose stack on a single bridge network. Node-RED image is a custom multi-stage build that preinstalls 12 npm packages (7 from the private `@heromatic/*` registry) and clones the Node-RED project from GitLab on first run. Secrets and runtime config (Azure IoT Hub SAS Key, Azure Maps API key, Modbus gateway IP) are injected at container start via environment variables, which an entrypoint script renders into `env.json` and `rainAzureApi.json` using `envsubst`. ChirpStack v4 uses the Semtech UDP packet forwarder (port 1700/UDP) to receive uplinks from the LPS8v2 and publishes them to Mosquitto, which Node-RED subscribes to.

**Tech Stack:** Docker Compose v2, Node-RED (Node.js 18), ChirpStack v4, Eclipse Mosquitto 2, PostgreSQL 14, Redis 7, Bash scripting, TOML config, envsubst (gettext-base).

**Host environment:** Windows 11 + Docker Desktop. All shell commands use bash (Git Bash / WSL-compatible). Working directory: `c:/Users/darie/Projects/guardian-docker`.

---

## File Structure

```
guardian-docker/
├── .gitattributes                    # force LF line endings for shell scripts
├── .gitignore
├── .env.example
├── README.md
├── docker-compose.yml
├── nodered/
│   ├── Dockerfile
│   ├── entrypoint.sh
│   ├── settings.js
│   └── templates/
│       ├── env.json.tmpl
│       └── rainAzureApi.json.tmpl
├── chirpstack/
│   ├── chirpstack.toml
│   └── chirpstack-gateway-bridge.toml
├── mosquitto/
│   └── config/
│       └── mosquitto.conf
├── postgres/
│   └── initdb/
│       └── 001-init-extensions.sh
└── docs/
    └── superpowers/
        ├── specs/
        │   └── 2026-04-24-guardian-docker-stack-design.md
        └── plans/
            └── 2026-04-24-guardian-docker-stack.md    (this file)
```

---

## Task 1: Initialize repository and ignore rules

**Files:**
- Create: `c:/Users/darie/Projects/guardian-docker/.gitignore`
- Create: `c:/Users/darie/Projects/guardian-docker/.gitattributes`

- [ ] **Step 1: Verify we're not already in a git repo**

Run: `cd c:/Users/darie/Projects/guardian-docker && git rev-parse --is-inside-work-tree 2>&1`
Expected: error "not a git repository" (if it IS already a repo, skip `git init` in step 2).

- [ ] **Step 2: Initialize git repository**

```bash
cd c:/Users/darie/Projects/guardian-docker
git init -b main
```

Expected: "Initialized empty Git repository in .git/".

- [ ] **Step 3: Create `.gitignore`**

Write file `c:/Users/darie/Projects/guardian-docker/.gitignore`:

```gitignore
# Secrets and local environment
.env
*.pem
*.key

# Docker runtime data (volumes are managed by docker, but guard against bind-mount leakage)
nodered/data/
mosquitto/data/
mosquitto/log/
postgres/data/

# Editor / OS
.DS_Store
Thumbs.db
*.swp
.vscode/
.idea/

# Logs
*.log
```

- [ ] **Step 4: Create `.gitattributes` to force LF line endings for shell scripts**

Write file `c:/Users/darie/Projects/guardian-docker/.gitattributes`:

```gitattributes
* text=auto
*.sh text eol=lf
entrypoint.sh text eol=lf
*.toml text eol=lf
*.conf text eol=lf
```

Rationale: `entrypoint.sh` will be executed inside a Linux container. Git on Windows defaults to CRLF, which breaks shebang parsing.

- [ ] **Step 5: Verify the files exist and commit**

Run:
```bash
ls -la c:/Users/darie/Projects/guardian-docker/.gitignore c:/Users/darie/Projects/guardian-docker/.gitattributes
git -C c:/Users/darie/Projects/guardian-docker add .gitignore .gitattributes
git -C c:/Users/darie/Projects/guardian-docker commit -m "chore: initialize repo with gitignore and line-ending rules"
```

Expected: Both files listed by `ls`, then a commit created with 2 files changed.

---

## Task 2: Create `.env.example` with every required variable

**Files:**
- Create: `c:/Users/darie/Projects/guardian-docker/.env.example`

- [ ] **Step 1: Verify the file is missing**

Run: `test ! -f c:/Users/darie/Projects/guardian-docker/.env.example && echo MISSING`
Expected: `MISSING`.

- [ ] **Step 2: Create `.env.example`**

Write file `c:/Users/darie/Projects/guardian-docker/.env.example`:

```dotenv
# ===== PostgreSQL (ChirpStack backend) =====
POSTGRES_USER=chirpstack
POSTGRES_PASSWORD=changeme
POSTGRES_DB=chirpstack

# ===== ChirpStack =====
CHIRPSTACK_REGION=us915_0
# Secret used to sign JWT tokens for the ChirpStack UI/API. Generate with: openssl rand -base64 32
CHIRPSTACK_API_SECRET=changeme-generate-random

# ===== Node-RED =====
# Used to encrypt flows_cred.json. Generate with: openssl rand -hex 32
NODERED_CREDENTIAL_SECRET=changeme-generate-random
TZ=America/New_York

# ===== GitLab (clones the Guardian project on first boot) =====
GITLAB_USER=
GITLAB_TOKEN=

# ===== Heromatic private npm registry (build-time only) =====
HEROMATIC_NPM_USER=
HEROMATIC_NPM_PASS=
HEROMATIC_NPM_REGISTRY=https://registry.npmjs.org/

# ===== Azure IoT Hub (rendered into env.json) =====
IOT_DEVICE_ID=
IOT_HUB_HOSTNAME=
IOT_SAS_KEY=
AREA_ID=

# ===== Azure Maps + Dragino rain sensor (rendered into rainAzureApi.json) =====
DRAGINO_RAIN_EUI=
AZURE_MAP_KEY=
SITE_LAT=0.0
SITE_LON=0.0

# ===== Modbus gateway (TCP → RS485) =====
MODBUS_GATEWAY_IP=192.168.1.254
MODBUS_GATEWAY_PORT=502
```

- [ ] **Step 3: Verify and commit**

Run:
```bash
grep -c "^[A-Z]" c:/Users/darie/Projects/guardian-docker/.env.example
```
Expected: `20` (there are 20 non-blank, non-comment variable lines).

```bash
git -C c:/Users/darie/Projects/guardian-docker add .env.example
git -C c:/Users/darie/Projects/guardian-docker commit -m "chore: add .env.example with all required variables"
```

---

## Task 3: Create PostgreSQL init script

**Files:**
- Create: `c:/Users/darie/Projects/guardian-docker/postgres/initdb/001-init-extensions.sh`

- [ ] **Step 1: Create the file**

Write file `c:/Users/darie/Projects/guardian-docker/postgres/initdb/001-init-extensions.sh`:

```bash
#!/bin/bash
set -e

# ChirpStack v4 requires the pg_trgm extension for device search.
# The database and user are already created by the postgres image
# via POSTGRES_USER / POSTGRES_DB. This script just adds extensions.

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
    CREATE EXTENSION IF NOT EXISTS hstore;
EOSQL
```

- [ ] **Step 2: Verify LF line endings (critical on Windows)**

Run:
```bash
file c:/Users/darie/Projects/guardian-docker/postgres/initdb/001-init-extensions.sh
```
Expected: output mentions "Bourne-Again shell script" or "ASCII text" — must NOT say "CRLF line terminators". If it does, re-save the file with LF (your editor's EOL setting) or run `sed -i 's/\r$//' <file>`.

- [ ] **Step 3: Commit**

```bash
git -C c:/Users/darie/Projects/guardian-docker add postgres/initdb/001-init-extensions.sh
git -C c:/Users/darie/Projects/guardian-docker commit -m "feat(postgres): add init script for ChirpStack extensions"
```

---

## Task 4: Create Mosquitto configuration

**Files:**
- Create: `c:/Users/darie/Projects/guardian-docker/mosquitto/config/mosquitto.conf`

- [ ] **Step 1: Create the config**

Write file `c:/Users/darie/Projects/guardian-docker/mosquitto/config/mosquitto.conf`:

```conf
# Guardian stack — Mosquitto broker config
# Anonymous access is allowed on the internal docker network.
# For production, add an ACL and password file.

persistence true
persistence_location /mosquitto/data/
autosave_interval 60

log_dest stdout
log_dest file /mosquitto/log/mosquitto.log
log_type all
connection_messages true

listener 1883 0.0.0.0
protocol mqtt
allow_anonymous true

max_queued_messages 10000
```

- [ ] **Step 2: Validate the config syntactically**

Run:
```bash
docker run --rm -v c:/Users/darie/Projects/guardian-docker/mosquitto/config:/mosquitto/config eclipse-mosquitto:2 mosquitto -c /mosquitto/config/mosquitto.conf -v &
sleep 3
kill %1
```

Expected: log lines like `mosquitto version 2.x starting` and `Opening ipv4 listen socket on port 1883`. No errors about malformed config.

(If running in Windows bash without job control, use: `docker run --rm -v ... eclipse-mosquitto:2 mosquitto -c /mosquitto/config/mosquitto.conf -v` in one terminal and Ctrl+C after 3 seconds.)

- [ ] **Step 3: Commit**

```bash
git -C c:/Users/darie/Projects/guardian-docker add mosquitto/config/mosquitto.conf
git -C c:/Users/darie/Projects/guardian-docker commit -m "feat(mosquitto): add broker config with persistence and anonymous auth"
```

---

## Task 5: Create ChirpStack main configuration

**Files:**
- Create: `c:/Users/darie/Projects/guardian-docker/chirpstack/chirpstack.toml`

- [ ] **Step 1: Create `chirpstack.toml`**

Write file `c:/Users/darie/Projects/guardian-docker/chirpstack/chirpstack.toml`:

```toml
# Guardian stack — ChirpStack v4 main server config
# Env vars referenced as $VAR are resolved by chirpstack at startup.

[logging]
  level = "info"
  json = false

[postgresql]
  dsn = "postgres://$POSTGRES_USER:$POSTGRES_PASSWORD@postgres:5432/$POSTGRES_DB?sslmode=disable"
  automigrate = true

[redis]
  servers = ["redis://redis:6379/"]

[network]
  net_id = "000000"
  enabled_regions = ["$CHIRPSTACK_REGION"]

[network.scheduler]
  interval = "1s"

[api]
  bind = "0.0.0.0:8080"
  secret = "$CHIRPSTACK_API_SECRET"

[integration]
  enabled = ["mqtt"]

[integration.mqtt]
  event_topic = "application/+/device/+/event/+"
  command_topic_template = "application/{{ .ApplicationID }}/device/{{ .DevEUI }}/command/{{ .CommandType }}"
  server = "tcp://mosquitto:1883/"
  json = true
  clean_session = false
  client_id = "chirpstack"
```

- [ ] **Step 2: Validate TOML syntax**

Run:
```bash
docker run --rm -v c:/Users/darie/Projects/guardian-docker/chirpstack:/etc/chirpstack chirpstack/chirpstack:4 chirpstack --config /etc/chirpstack configfile 2>&1 | head -30
```

Expected: ChirpStack prints the parsed config without a "parse error" or "unknown field" message. (Note: with placeholder env vars this may warn about empty substitutions — that's fine; we only check the TOML parses.)

- [ ] **Step 3: Commit**

```bash
git -C c:/Users/darie/Projects/guardian-docker add chirpstack/chirpstack.toml
git -C c:/Users/darie/Projects/guardian-docker commit -m "feat(chirpstack): add main server config for US915 sub-band 0"
```

---

## Task 6: Create ChirpStack gateway-bridge configuration

**Files:**
- Create: `c:/Users/darie/Projects/guardian-docker/chirpstack/chirpstack-gateway-bridge.toml`

- [ ] **Step 1: Create the config**

Write file `c:/Users/darie/Projects/guardian-docker/chirpstack/chirpstack-gateway-bridge.toml`:

```toml
# Guardian stack — ChirpStack v4 gateway-bridge config
# Translates Semtech UDP packet forwarder (LPS8v2) → MQTT → ChirpStack.

[general]
  log_level = 4
  log_to_syslog = false

[backend]
  type = "semtech_udp"

[backend.semtech_udp]
  udp_bind = "0.0.0.0:1700"
  skip_crc_check = false
  fake_rx_time = false

[integration]
  marshaler = "protobuf"

[integration.mqtt]
  event_topic_template = "$CHIRPSTACK_REGION/gateway/{{ .GatewayID }}/event/{{ .EventType }}"
  state_topic_template = "$CHIRPSTACK_REGION/gateway/{{ .GatewayID }}/state/{{ .StateType }}"
  command_topic_template = "$CHIRPSTACK_REGION/gateway/{{ .GatewayID }}/command/#"

[integration.mqtt.auth]
  type = "generic"

[integration.mqtt.auth.generic]
  server = "tcp://mosquitto:1883/"
  clean_session = false
  client_id = "chirpstack-gateway-bridge"
```

- [ ] **Step 2: Validate TOML syntax with a Python one-liner (no ChirpStack CLI subcommand for this image)**

Run:
```bash
docker run --rm -v c:/Users/darie/Projects/guardian-docker/chirpstack:/cfg python:3.11-alpine python -c "import tomllib,sys; tomllib.loads(open('/cfg/chirpstack-gateway-bridge.toml').read()); print('OK')"
```

Expected: `OK`. Any parse error means the TOML is malformed.

- [ ] **Step 3: Commit**

```bash
git -C c:/Users/darie/Projects/guardian-docker add chirpstack/chirpstack-gateway-bridge.toml
git -C c:/Users/darie/Projects/guardian-docker commit -m "feat(chirpstack): add gateway-bridge config for Semtech UDP on 1700/udp"
```

---

## Task 7: Create Node-RED `settings.js`

**Files:**
- Create: `c:/Users/darie/Projects/guardian-docker/nodered/settings.js`

- [ ] **Step 1: Create the file**

Write file `c:/Users/darie/Projects/guardian-docker/nodered/settings.js`:

```javascript
// Guardian stack — Node-RED settings.js
// Enables the Projects feature and sets sentinelPath before module.exports.

process.env.sentinelPath = '/data/projects/enviromental';

module.exports = {
    uiPort: process.env.PORT || 1880,
    uiHost: '0.0.0.0',

    flowFile: 'flows.json',
    flowFilePretty: true,

    credentialSecret: process.env.NODERED_CREDENTIAL_SECRET,

    userDir: '/data/',
    nodesDir: '/data/nodes',

    diagnostics: { enabled: true, ui: true },
    runtimeState: { enabled: false, ui: false },

    logging: {
        console: {
            level: 'info',
            metrics: false,
            audit: false
        }
    },

    exportGlobalContextKeys: false,

    externalModules: {
        autoInstall: false,
        palette: { allowInstall: true, allowUpdate: true, allowUpload: true }
    },

    editorTheme: {
        projects: {
            enabled: true,
            workflow: { mode: 'manual' }
        },
        codeEditor: { lib: 'monaco' }
    },

    functionExternalModules: true,
    functionGlobalContext: {},

    debugMaxLength: 1000,
    mqttReconnectTime: 15000,
    serialReconnectTime: 15000
};
```

- [ ] **Step 2: Verify JavaScript syntax**

Run:
```bash
docker run --rm -v c:/Users/darie/Projects/guardian-docker/nodered:/w -w /w node:18-alpine node -c settings.js && echo OK
```

Expected: `OK`. A syntax error would print a stack trace.

- [ ] **Step 3: Commit**

```bash
git -C c:/Users/darie/Projects/guardian-docker add nodered/settings.js
git -C c:/Users/darie/Projects/guardian-docker commit -m "feat(nodered): add settings.js with projects enabled and sentinelPath"
```

---

## Task 8: Create Node-RED template for `env.json`

**Files:**
- Create: `c:/Users/darie/Projects/guardian-docker/nodered/templates/env.json.tmpl`

- [ ] **Step 1: Create the template**

Write file `c:/Users/darie/Projects/guardian-docker/nodered/templates/env.json.tmpl`:

```json
{
  "iotConfig": {
    "deviceid": "${IOT_DEVICE_ID}",
    "iothub": "${IOT_HUB_HOSTNAME}",
    "saskey": "${IOT_SAS_KEY}",
    "methods": [
      { "name": "loadArea" },
      { "name": "setActuatorsState" }
    ]
  },
  "areaParams": {
    "areaId": "${AREA_ID}",
    "hubDeviceId": "${IOT_DEVICE_ID}",
    "azureValidationPeriod": 7200,
    "azureMaxDelayResponse": 30,
    "powerOn": false,
    "notificationBlockTime": 5,
    "servers": [
      {
        "serverId": "246",
        "period": 15,
        "unitId": 4,
        "format": "REARRANGE-R8"
      },
      {
        "serverId": "247",
        "period": 15,
        "unitId": 1,
        "format": "REARRANGE-R8"
      }
    ]
  }
}
```

- [ ] **Step 2: Verify envsubst produces valid JSON**

Run:
```bash
IOT_DEVICE_ID=test-device IOT_HUB_HOSTNAME=test.azure-devices.net IOT_SAS_KEY=xxxx AREA_ID=42 \
  docker run --rm -i -v c:/Users/darie/Projects/guardian-docker/nodered/templates:/t \
  -e IOT_DEVICE_ID -e IOT_HUB_HOSTNAME -e IOT_SAS_KEY -e AREA_ID \
  alpine:3 sh -c 'apk add --no-cache gettext >/dev/null && envsubst < /t/env.json.tmpl | python3 -c "import sys,json; json.load(sys.stdin); print(\"OK\")" || (apk add --no-cache python3 >/dev/null && envsubst < /t/env.json.tmpl | python3 -c "import sys,json; json.load(sys.stdin); print(\"OK\")")'
```

Simpler alternative if that fails on Windows:
```bash
docker run --rm -v c:/Users/darie/Projects/guardian-docker/nodered/templates:/t \
  -e IOT_DEVICE_ID=test -e IOT_HUB_HOSTNAME=h -e IOT_SAS_KEY=k -e AREA_ID=42 \
  alpine:3 sh -c 'apk add --no-cache gettext python3 >/dev/null && envsubst < /t/env.json.tmpl > /tmp/out.json && python3 -m json.tool /tmp/out.json > /dev/null && echo OK'
```

Expected: `OK`. A malformed JSON would show a `json.decoder.JSONDecodeError`.

- [ ] **Step 3: Commit**

```bash
git -C c:/Users/darie/Projects/guardian-docker add nodered/templates/env.json.tmpl
git -C c:/Users/darie/Projects/guardian-docker commit -m "feat(nodered): add env.json template with Modbus servers and IoT Hub config"
```

---

## Task 9: Create Node-RED template for `rainAzureApi.json`

**Files:**
- Create: `c:/Users/darie/Projects/guardian-docker/nodered/templates/rainAzureApi.json.tmpl`

- [ ] **Step 1: Create the template**

Write file `c:/Users/darie/Projects/guardian-docker/nodered/templates/rainAzureApi.json.tmpl`:

```json
{
  "rainAzureApi": {
    "isRain": true,
    "isSensorsActivated": true,
    "sensorsInterval": 300,
    "monitoringForecastWT": {
      "start": "05:00",
      "end": "12:26"
    },
    "currentConditionsWT": {
      "start": "05:00",
      "end": "12:56"
    },
    "eui": "eui-rain",
    "eui-sensors": "${DRAGINO_RAIN_EUI}",
    "azureMapKey": "${AZURE_MAP_KEY}",
    "lat": ${SITE_LAT},
    "lon": ${SITE_LON}
  }
}
```

Note: `lat` and `lon` are numeric (no quotes). The env vars must be numbers like `41.389` — not strings. The `.env.example` already sets them to `0.0` as valid numeric defaults.

- [ ] **Step 2: Verify envsubst + JSON validity**

Run:
```bash
docker run --rm -v c:/Users/darie/Projects/guardian-docker/nodered/templates:/t \
  -e DRAGINO_RAIN_EUI=eui-rain-sensors -e AZURE_MAP_KEY=abc123 -e SITE_LAT=41.389 -e SITE_LON=2.182 \
  alpine:3 sh -c 'apk add --no-cache gettext python3 >/dev/null && envsubst < /t/rainAzureApi.json.tmpl > /tmp/out.json && python3 -m json.tool /tmp/out.json > /dev/null && echo OK'
```

Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git -C c:/Users/darie/Projects/guardian-docker add nodered/templates/rainAzureApi.json.tmpl
git -C c:/Users/darie/Projects/guardian-docker commit -m "feat(nodered): add rainAzureApi.json template with Azure Maps config"
```

---

## Task 10: Create Node-RED `entrypoint.sh`

**Files:**
- Create: `c:/Users/darie/Projects/guardian-docker/nodered/entrypoint.sh`

- [ ] **Step 1: Create the entrypoint**

Write file `c:/Users/darie/Projects/guardian-docker/nodered/entrypoint.sh`:

```bash
#!/bin/bash
set -eu

PROJECT_DIR="/data/projects/enviromental"
PROJECT_DATA_DIR="$PROJECT_DIR/data"
GITLAB_URL="gitlab.com/costa4844917/enviromental.git"
GITLAB_BRANCH="release-5"

log() { echo "[guardian-entrypoint] $*"; }

# 1. Clone the Guardian project on first boot (idempotent).
if [ ! -d "$PROJECT_DIR/.git" ]; then
    log "Cloning $GITLAB_URL branch $GITLAB_BRANCH into $PROJECT_DIR"
    mkdir -p /data/projects
    if [ -z "${GITLAB_USER:-}" ] || [ -z "${GITLAB_TOKEN:-}" ]; then
        log "ERROR: GITLAB_USER and GITLAB_TOKEN must be set in .env"
        exit 1
    fi
    git clone -b "$GITLAB_BRANCH" \
        "https://${GITLAB_USER}:${GITLAB_TOKEN}@${GITLAB_URL}" \
        "$PROJECT_DIR"
else
    log "Project already cloned at $PROJECT_DIR (skipping clone)"
fi

# 2. Render env.json and rainAzureApi.json from templates every boot.
#    This lets .env changes propagate with a simple `docker compose restart nodered`.
mkdir -p "$PROJECT_DATA_DIR"

log "Rendering env.json"
envsubst < /templates/env.json.tmpl > "$PROJECT_DATA_DIR/env.json"

log "Rendering rainAzureApi.json"
envsubst < /templates/rainAzureApi.json.tmpl > "$PROJECT_DATA_DIR/rainAzureApi.json"

# 3. Hand off to the default Node-RED CMD.
log "Starting Node-RED"
exec "$@"
```

- [ ] **Step 2: Verify shebang parses correctly (LF line endings)**

Run:
```bash
head -c 2 c:/Users/darie/Projects/guardian-docker/nodered/entrypoint.sh | od -c | head -1
```

Expected: first two characters are `#   !` (i.e. `#!`). If you see `# !\r` or similar with `\r`, re-save with LF line endings. The `.gitattributes` from Task 1 enforces this on commit.

- [ ] **Step 3: Commit**

```bash
git -C c:/Users/darie/Projects/guardian-docker add nodered/entrypoint.sh
git -C c:/Users/darie/Projects/guardian-docker commit -m "feat(nodered): add entrypoint that clones GitLab project and renders configs"
```

---

## Task 11: Create Node-RED `Dockerfile` (multi-stage, with npm auth)

**Files:**
- Create: `c:/Users/darie/Projects/guardian-docker/nodered/Dockerfile`

- [ ] **Step 1: Create the Dockerfile**

Write file `c:/Users/darie/Projects/guardian-docker/nodered/Dockerfile`:

```dockerfile
# syntax=docker/dockerfile:1.4
# Guardian stack — Node-RED custom image.
# Stage 1 (deps): authenticates to the Heromatic npm registry and installs
# all required node modules. The .npmrc with credentials lives only in this
# stage and never reaches the final image.

FROM nodered/node-red:latest-18 AS deps

USER root

# Build-time secrets passed from docker-compose build args.
ARG HEROMATIC_NPM_USER
ARG HEROMATIC_NPM_PASS
ARG HEROMATIC_NPM_REGISTRY=https://registry.npmjs.org/

WORKDIR /deps

# Write the auth file. _auth is basic-auth base64 of user:pass.
# always-auth=true ensures npm sends credentials on every scoped request.
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
    else \
        echo "WARNING: HEROMATIC_NPM_USER/PASS not set; @heromatic packages will fail to install" >&2; \
    fi

# Install every dependency listed in the install guide.
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
    node-red-node-ui-table

# Discard the .npmrc so no subsequent consumer inherits it.
RUN rm -f /root/.npmrc

# ---- Stage 2: final runtime image ----
FROM nodered/node-red:latest-18

USER root

# git — clones the Guardian project at entrypoint.
# gettext-base — provides envsubst for template rendering.
# ca-certificates — required for HTTPS git clone against gitlab.com.
RUN apt-get update && \
    apt-get install -y --no-install-recommends git gettext-base ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Pull node_modules + package-lock from the deps stage.
COPY --from=deps --chown=node-red:node-red /deps/node_modules /data/node_modules
COPY --from=deps --chown=node-red:node-red /deps/package.json /data/package.json
COPY --from=deps --chown=node-red:node-red /deps/package-lock.json /data/package-lock.json

# Install the custom settings.js, templates, and entrypoint.
COPY --chown=node-red:node-red settings.js /data/settings.js
COPY --chown=node-red:node-red templates /templates
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Ensure /data is writable by node-red (UID 1000).
RUN chown -R node-red:node-red /data

USER node-red
WORKDIR /usr/src/node-red

ENTRYPOINT ["/entrypoint.sh"]
# Default CMD from the base image, kept explicit for clarity.
CMD ["npm", "start", "--cache", "/data/.npm", "--", "--userDir", "/data"]
```

- [ ] **Step 2: Lint the Dockerfile with hadolint (optional sanity check)**

Run:
```bash
docker run --rm -i hadolint/hadolint < c:/Users/darie/Projects/guardian-docker/nodered/Dockerfile
```

Expected: a few style warnings (e.g. "pin apt package versions") are OK. Any `DL3006` (untagged FROM) or parse error is NOT OK.

- [ ] **Step 3: Commit**

```bash
git -C c:/Users/darie/Projects/guardian-docker add nodered/Dockerfile
git -C c:/Users/darie/Projects/guardian-docker commit -m "feat(nodered): add multi-stage Dockerfile with Heromatic npm auth"
```

---

## Task 12: Create `docker-compose.yml` with base services

**Files:**
- Create: `c:/Users/darie/Projects/guardian-docker/docker-compose.yml`

This task creates the compose file with ONLY `postgres`, `redis`, and `mosquitto` to validate the base layer works. ChirpStack and Node-RED are added in subsequent tasks.

- [ ] **Step 1: Create `docker-compose.yml`**

Write file `c:/Users/darie/Projects/guardian-docker/docker-compose.yml`:

```yaml
name: guardian

services:
  postgres:
    image: postgres:14
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./postgres/initdb:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - guardian-net

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - guardian-net

  mosquitto:
    image: eclipse-mosquitto:2
    restart: unless-stopped
    ports:
      - "1883:1883"
    volumes:
      - ./mosquitto/config:/mosquitto/config:ro
      - mosquitto_data:/mosquitto/data
      - mosquitto_log:/mosquitto/log
    healthcheck:
      test: ["CMD-SHELL", "timeout 3 mosquitto_sub -h localhost -t '$$SYS/broker/uptime' -C 1 -i hc || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3
    networks:
      - guardian-net

networks:
  guardian-net:
    driver: bridge

volumes:
  postgres_data:
  redis_data:
  mosquitto_data:
  mosquitto_log:
```

- [ ] **Step 2: Validate compose file**

Run:
```bash
cp c:/Users/darie/Projects/guardian-docker/.env.example c:/Users/darie/Projects/guardian-docker/.env
docker compose -f c:/Users/darie/Projects/guardian-docker/docker-compose.yml --env-file c:/Users/darie/Projects/guardian-docker/.env config > /dev/null && echo OK
```

Expected: `OK`. Any YAML parse error or missing variable would print an error.

- [ ] **Step 3: Start base services and verify they become healthy**

Run:
```bash
cd c:/Users/darie/Projects/guardian-docker
docker compose up -d postgres redis mosquitto
sleep 20
docker compose ps
```

Expected: three services listed, all `Up` and with `(healthy)` status (mosquitto healthcheck may take up to 30s to turn green on first run).

- [ ] **Step 4: Verify Postgres init script ran**

Run:
```bash
docker compose exec postgres psql -U ${POSTGRES_USER:-chirpstack} -d ${POSTGRES_DB:-chirpstack} -c "SELECT extname FROM pg_extension;"
```

Expected: `pg_trgm` and `hstore` both listed in the output.

- [ ] **Step 5: Commit**

```bash
docker compose down
git -C c:/Users/darie/Projects/guardian-docker add docker-compose.yml
git -C c:/Users/darie/Projects/guardian-docker commit -m "feat(compose): add postgres, redis, mosquitto services with healthchecks"
```

---

## Task 13: Add ChirpStack services to compose and verify UI

**Files:**
- Modify: `c:/Users/darie/Projects/guardian-docker/docker-compose.yml`

- [ ] **Step 1: Append ChirpStack services**

Edit `c:/Users/darie/Projects/guardian-docker/docker-compose.yml`. Find the line:

```yaml
  mosquitto:
    image: eclipse-mosquitto:2
```

Add these three services AFTER the `mosquitto` service block (before the `networks:` key at the bottom):

```yaml
  chirpstack:
    image: chirpstack/chirpstack:4
    restart: unless-stopped
    command: -c /etc/chirpstack
    ports:
      - "8080:8080"
    volumes:
      - ./chirpstack:/etc/chirpstack:ro
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
      CHIRPSTACK_REGION: ${CHIRPSTACK_REGION}
      CHIRPSTACK_API_SECRET: ${CHIRPSTACK_API_SECRET}
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      mosquitto:
        condition: service_started
    networks:
      - guardian-net

  chirpstack-gateway-bridge:
    image: chirpstack/chirpstack-gateway-bridge:4
    restart: unless-stopped
    ports:
      - "1700:1700/udp"
    volumes:
      - ./chirpstack/chirpstack-gateway-bridge.toml:/etc/chirpstack-gateway-bridge/chirpstack-gateway-bridge.toml:ro
    environment:
      CHIRPSTACK_REGION: ${CHIRPSTACK_REGION}
    depends_on:
      mosquitto:
        condition: service_started
    networks:
      - guardian-net

  chirpstack-rest-api:
    image: chirpstack/chirpstack-rest-api:4
    restart: unless-stopped
    command: --server chirpstack:8080 --bind 0.0.0.0:8090 --insecure
    ports:
      - "8090:8090"
    depends_on:
      - chirpstack
    networks:
      - guardian-net
```

- [ ] **Step 2: Validate compose**

Run:
```bash
docker compose -f c:/Users/darie/Projects/guardian-docker/docker-compose.yml --env-file c:/Users/darie/Projects/guardian-docker/.env config > /dev/null && echo OK
```

Expected: `OK`.

- [ ] **Step 3: Bring up the full stack so far (no Node-RED yet)**

Run:
```bash
cd c:/Users/darie/Projects/guardian-docker
docker compose up -d postgres redis mosquitto chirpstack chirpstack-gateway-bridge chirpstack-rest-api
sleep 40
docker compose ps
docker compose logs --tail=30 chirpstack | grep -iE "listening|started|ready|error" || true
```

Expected: all services `Up`. `chirpstack` logs should show "starting API listener" on `0.0.0.0:8080` and no `FATAL` or unrecoverable errors.

- [ ] **Step 4: Verify the ChirpStack UI is accessible**

Run:
```bash
curl -sI http://localhost:8080 | head -1
```

Expected: `HTTP/1.1 200 OK` (or a 3xx redirect — both indicate the service is responsive).

- [ ] **Step 5: Verify gateway-bridge is listening on UDP/1700**

Run:
```bash
docker compose logs chirpstack-gateway-bridge | grep -iE "listening|udp" | head -5
```

Expected: a log line like `starting gateway udp listener bind=0.0.0.0:1700`.

- [ ] **Step 6: Commit**

```bash
docker compose down
git -C c:/Users/darie/Projects/guardian-docker add docker-compose.yml
git -C c:/Users/darie/Projects/guardian-docker commit -m "feat(compose): add chirpstack, gateway-bridge, and rest-api services"
```

---

## Task 14: Add Node-RED service to compose and build image

**Files:**
- Modify: `c:/Users/darie/Projects/guardian-docker/docker-compose.yml`

- [ ] **Step 1: Append the `nodered` service**

Edit `c:/Users/darie/Projects/guardian-docker/docker-compose.yml`. Add this service AFTER `chirpstack-rest-api` and BEFORE the `networks:` key:

```yaml
  nodered:
    build:
      context: ./nodered
      args:
        HEROMATIC_NPM_USER: ${HEROMATIC_NPM_USER}
        HEROMATIC_NPM_PASS: ${HEROMATIC_NPM_PASS}
        HEROMATIC_NPM_REGISTRY: ${HEROMATIC_NPM_REGISTRY}
    image: guardian/nodered:latest
    restart: unless-stopped
    ports:
      - "1880:1880"
    environment:
      TZ: ${TZ}
      NODERED_CREDENTIAL_SECRET: ${NODERED_CREDENTIAL_SECRET}
      # GitLab clone creds
      GITLAB_USER: ${GITLAB_USER}
      GITLAB_TOKEN: ${GITLAB_TOKEN}
      # env.json render vars
      IOT_DEVICE_ID: ${IOT_DEVICE_ID}
      IOT_HUB_HOSTNAME: ${IOT_HUB_HOSTNAME}
      IOT_SAS_KEY: ${IOT_SAS_KEY}
      AREA_ID: ${AREA_ID}
      # rainAzureApi.json render vars
      DRAGINO_RAIN_EUI: ${DRAGINO_RAIN_EUI}
      AZURE_MAP_KEY: ${AZURE_MAP_KEY}
      SITE_LAT: ${SITE_LAT}
      SITE_LON: ${SITE_LON}
      # Modbus (exposed for flows that read it via env)
      MODBUS_GATEWAY_IP: ${MODBUS_GATEWAY_IP}
      MODBUS_GATEWAY_PORT: ${MODBUS_GATEWAY_PORT}
    volumes:
      - nodered_data:/data
    depends_on:
      mosquitto:
        condition: service_started
    networks:
      - guardian-net
```

And add `nodered_data:` under the `volumes:` block at the end:

```yaml
volumes:
  postgres_data:
  redis_data:
  mosquitto_data:
  mosquitto_log:
  nodered_data:
```

- [ ] **Step 2: Ensure `.env` has real values for everything the user can provide**

Before building, the user must populate `.env` with:
- `HEROMATIC_NPM_USER` / `HEROMATIC_NPM_PASS` (required for build)
- `GITLAB_USER` / `GITLAB_TOKEN` (required for first boot)
- `NODERED_CREDENTIAL_SECRET` (any random string)

Run:
```bash
grep -E "^(HEROMATIC_NPM_USER|HEROMATIC_NPM_PASS|GITLAB_USER|GITLAB_TOKEN|NODERED_CREDENTIAL_SECRET)=.+" c:/Users/darie/Projects/guardian-docker/.env | wc -l
```

Expected: `5`. If less, stop and populate `.env` before continuing.

- [ ] **Step 3: Build the Node-RED image**

Run:
```bash
cd c:/Users/darie/Projects/guardian-docker
DOCKER_BUILDKIT=1 docker compose build nodered
```

Expected: build completes successfully. Look for lines like `added 200 packages` and no `401 Unauthorized` errors from npm. If you see `401`, verify `HEROMATIC_NPM_USER` and `HEROMATIC_NPM_PASS` and also confirm with Heromatic whether the registry URL in `HEROMATIC_NPM_REGISTRY` is correct — the default in `.env.example` is the public npm registry which will fail for private scopes.

- [ ] **Step 4: Validate the image does NOT contain the `.npmrc`**

Run:
```bash
docker run --rm guardian/nodered:latest sh -c "ls -la /root/.npmrc /home/node-red/.npmrc 2>&1 | head -5"
```

Expected: "No such file or directory" for both. This confirms the multi-stage build did not leak credentials.

- [ ] **Step 5: Commit**

```bash
git -C c:/Users/darie/Projects/guardian-docker add docker-compose.yml
git -C c:/Users/darie/Projects/guardian-docker commit -m "feat(compose): add nodered service with build args and full env wiring"
```

---

## Task 15: Full stack boot and Node-RED project clone verification

**Files:** (no new files; validation task)

- [ ] **Step 1: Bring up the entire stack**

Run:
```bash
cd c:/Users/darie/Projects/guardian-docker
docker compose up -d
sleep 60
docker compose ps
```

Expected: all 7 services listed, all `Up`, postgres/redis/mosquitto `(healthy)`.

- [ ] **Step 2: Verify the entrypoint cloned the GitLab project**

Run:
```bash
docker compose exec nodered ls -la /data/projects/enviromental
```

Expected: directory listing showing `.git`, `data/`, etc. If empty or missing, check:
```bash
docker compose logs nodered | grep -iE "clone|error|gitlab" | head -20
```

Common failures:
- `Authentication failed` → wrong `GITLAB_USER`/`GITLAB_TOKEN`.
- `Repository not found` → token missing `read_repository` scope.
- `could not resolve host: gitlab.com` → Docker Desktop DNS issue; retry.

- [ ] **Step 3: Verify config files were rendered**

Run:
```bash
docker compose exec nodered cat /data/projects/enviromental/data/env.json | head -15
docker compose exec nodered cat /data/projects/enviromental/data/rainAzureApi.json | head -10
```

Expected: valid JSON with your real values (device id, hub hostname, etc.) substituted in — no `${...}` placeholders remaining.

- [ ] **Step 4: Verify Node-RED UI loads**

Run:
```bash
curl -sI http://localhost:1880 | head -1
```

Expected: `HTTP/1.1 200 OK` or a 302 redirect.

- [ ] **Step 5: Verify Projects feature is active in the UI**

Open `http://localhost:1880` in a browser. Expected: the Node-RED sidebar shows a "Projects" section and the Guardian project is loaded (top-right shows "enviromental"). If a "Welcome to Projects" wizard appears instead, the project loaded but was not auto-selected — open it from the Projects menu.

- [ ] **Step 6: Verify all 12 npm packages are installed**

Run:
```bash
docker compose exec nodered sh -c "ls /data/node_modules/@heromatic && ls /data/node_modules | grep node-red"
```

Expected: 7 Heromatic packages + `node-red-contrib-dx-resources`, `node-red-contrib-modbus`, `node-red-contrib-ui-media`, `node-red-dashboard`, `node-red-node-ui-table`.

- [ ] **Step 7: Commit a state marker (no code, just a note)**

Nothing to commit for this task unless you made config fixes. If you fixed something, commit it. Otherwise proceed.

---

## Task 16: End-to-end smoke tests

**Files:** (no new files; manual verification task)

- [ ] **Step 1: ChirpStack UI end-to-end**

1. Open `http://localhost:8080`, log in with `admin` / `admin`.
2. Change the admin password immediately (Users → admin → Change password).
3. Create a tenant (e.g. "Guardian").
4. Create an application under that tenant.
5. Create a Device Profile with region `US915`, MAC version `1.0.3`, Regional parameters `A`.
6. Register the LPS8v2 as a Gateway using its Gateway EUI (found on a sticker on the device or in its web UI).

Expected: After step 6, the gateway appears with a grey dot (offline) until it's configured.

- [ ] **Step 2: Point the LPS8v2 at this host**

From the LPS8v2 web UI (usually `http://<gateway-ip>/`):
1. LoRa → LoRaWAN → Packet Forwarder → Semtech UDP.
2. Server address: `<IP of your Windows machine on LAN>` (e.g. `192.168.1.50`). **Not** `127.0.0.1` or `localhost`.
3. Server port: `1700`.
4. Save and restart packet forwarder.

- [ ] **Step 3: Verify Windows firewall allows UDP/1700 inbound**

In PowerShell (Admin):
```powershell
New-NetFirewallRule -DisplayName "Docker UDP 1700 (ChirpStack)" -Direction Inbound -Protocol UDP -LocalPort 1700 -Action Allow
```

- [ ] **Step 4: Watch gateway-bridge logs for incoming packets**

Run:
```bash
docker compose logs -f chirpstack-gateway-bridge
```

Expected: within ~60 seconds, log lines like `gateway stats packet received` or `uplink frame received` with the LPS8v2's EUI. The gateway in ChirpStack UI should turn green (online).

- [ ] **Step 5: Verify Modbus connectivity from Node-RED container**

Run:
```bash
docker compose exec nodered sh -c "apt-get update >/dev/null && apt-get install -y iputils-ping >/dev/null 2>&1 || true; ping -c 3 ${MODBUS_GATEWAY_IP:-192.168.1.254}"
```

Expected: 3 successful pings. If `100% packet loss`, Docker Desktop cannot reach the LAN IP directly — this is a known Docker Desktop Windows limitation. Workaround: in Docker Desktop Settings → Resources → Network, ensure the Docker network can route to the LAN; or reconfigure the Modbus gateway so it's reachable via `host.docker.internal` by tunneling through the host. Document the resolution in the README.

- [ ] **Step 6: Verify a LoRa uplink reaches Node-RED via MQTT**

After a device has been joined to ChirpStack and has emitted at least one uplink:

In Node-RED (`http://localhost:1880`):
- Add a temporary debug flow: `mqtt-in` node subscribed to `application/+/device/+/event/up` pointing at `mosquitto:1883` → debug node.
- Deploy.

Expected: uplinks appear in the debug pane within seconds of device transmission.

---

## Task 17: Write the README

**Files:**
- Create: `c:/Users/darie/Projects/guardian-docker/README.md`

- [ ] **Step 1: Create the README**

Write file `c:/Users/darie/Projects/guardian-docker/README.md`:

````markdown
# Guardian Docker Stack

Docker Compose stack for the **Environmental Monitoring / Node-RED Guardian** project. Bundles Node-RED (with the Guardian project auto-cloned from GitLab), ChirpStack v4 with LoRaWAN US915 support, MQTT broker, PostgreSQL, Redis, and a gateway bridge for the Dragino LPS8v2.

## Architecture

See `docs/superpowers/specs/2026-04-24-guardian-docker-stack-design.md`.

## Prerequisites

- Docker Desktop (Windows/Mac) or Docker Engine + Compose v2 (Linux).
- Credentials for:
  - **GitLab**: user + Personal Access Token with `read_repository` scope.
  - **Heromatic npm registry**: user + password.
  - **Azure IoT Hub**: Device ID, Hostname, SAS Key.
  - **Azure Maps**: Primary Key.

## Quickstart

```bash
git clone <this-repo>
cd guardian-docker
cp .env.example .env
# Edit .env and fill every variable marked as blank.
docker compose build
docker compose up -d
```

Then:
- ChirpStack UI: http://localhost:8080 (default login `admin` / `admin` — change immediately).
- Node-RED: http://localhost:1880.

## Configure the LPS8v2

1. From the LPS8v2 web UI: **LoRa → LoRaWAN → Packet Forwarder → Semtech UDP**.
2. Server address = the LAN IP of this host (e.g. `192.168.1.50`). **Not `localhost`.**
3. Server port = `1700`.
4. Save and restart the packet forwarder.
5. On Windows, allow UDP/1700 inbound in the firewall:
   ```powershell
   New-NetFirewallRule -DisplayName "Docker UDP 1700" -Direction Inbound -Protocol UDP -LocalPort 1700 -Action Allow
   ```

## Common operations

| What | Command |
|---|---|
| Start everything | `docker compose up -d` |
| Stop everything | `docker compose down` |
| Stop and wipe volumes | `docker compose down -v` |
| Rebuild Node-RED after dep change | `docker compose build nodered && docker compose up -d nodered` |
| Re-render `env.json` / `rainAzureApi.json` after `.env` change | `docker compose restart nodered` |
| Pull latest GitLab changes | `docker compose exec nodered sh -c "cd /data/projects/enviromental && git pull"` then `docker compose restart nodered` |
| Switch GitLab branch | `docker compose exec nodered sh -c "cd /data/projects/enviromental && git fetch && git checkout <branch>"` |
| Backup ChirpStack DB | `docker compose exec postgres pg_dump -U chirpstack chirpstack > backup-$(date +%F).sql` |
| Follow logs of a service | `docker compose logs -f <service>` |

## Ports

| Port | Service | Notes |
|---|---|---|
| 1880/tcp | Node-RED editor | |
| 8080/tcp | ChirpStack UI | Default login `admin` / `admin` |
| 8090/tcp | ChirpStack REST API | OpenAPI UI at `/` |
| 1700/udp | Gateway Bridge | **Must be open on the Windows firewall** |
| 1883/tcp | Mosquitto | Anonymous auth enabled (LAN only) |

## Troubleshooting

**`npm install` fails with `401 Unauthorized` on `@heromatic/*`**
- Check `HEROMATIC_NPM_USER` and `HEROMATIC_NPM_PASS` in `.env`.
- Confirm `HEROMATIC_NPM_REGISTRY` is the correct URL — if Heromatic hosts a private registry (e.g. Verdaccio, GitLab npm registry), update this variable.

**LPS8v2 not showing up in ChirpStack**
- Verify Windows firewall allows UDP/1700.
- `docker compose logs chirpstack-gateway-bridge` should show received packets.
- Confirm the LPS8v2 points at the host's LAN IP (not `localhost`).

**Node-RED cannot reach Modbus gateway 192.168.1.254**
- `docker compose exec nodered ping 192.168.1.254` — if 100% loss, Docker Desktop cannot route to the LAN.
- Mitigation: configure Docker Desktop → Resources → Network, or move the Modbus gateway to a routable interface.

**`env.json` is empty or has `${VAR}` placeholders**
- The container started before variables were in `.env`. `docker compose restart nodered` re-renders the templates.

**ChirpStack UI doesn't load**
- First boot takes 30–60 seconds for Postgres schema migration. `docker compose logs chirpstack` should eventually show `starting api listener`.

## Layout

```
guardian-docker/
├── docker-compose.yml
├── .env.example
├── nodered/               # custom Node-RED image + settings + entrypoint + templates
├── chirpstack/            # TOML configs for server and gateway-bridge
├── mosquitto/config/      # MQTT broker config
├── postgres/initdb/       # DB extensions init script
└── docs/superpowers/      # design spec + implementation plan
```

## Secrets

All secrets live in `.env` (gitignored). Do NOT commit `.env`. If you rotate a secret, `docker compose restart nodered` re-renders the runtime config files.

## License

Internal — Heromatic.
````

- [ ] **Step 2: Verify the README renders (any markdown lint is fine; visual check)**

Open `c:/Users/darie/Projects/guardian-docker/README.md` in a markdown previewer. Confirm tables render and there are no broken links.

- [ ] **Step 3: Commit**

```bash
git -C c:/Users/darie/Projects/guardian-docker add README.md
git -C c:/Users/darie/Projects/guardian-docker commit -m "docs: add README with quickstart, operations, and troubleshooting"
```

---

## Task 18: Commit the spec and plan, tag initial release

**Files:** (already-created documentation files)

- [ ] **Step 1: Ensure both docs are tracked**

Run:
```bash
cd c:/Users/darie/Projects/guardian-docker
git add docs/superpowers/specs/2026-04-24-guardian-docker-stack-design.md docs/superpowers/plans/2026-04-24-guardian-docker-stack.md
git status
```

Expected: both files either already committed (nothing to add) or staged.

- [ ] **Step 2: Commit docs if not already tracked**

If `git status` shows them as new files:
```bash
git commit -m "docs: add design spec and implementation plan"
```

- [ ] **Step 3: Tag initial version**

Run:
```bash
git tag -a v0.1.0 -m "Initial Guardian Docker stack"
git log --oneline
```

Expected: linear history of commits from Task 1 through here, tag `v0.1.0` at HEAD.

- [ ] **Step 4: (Optional) Push to a remote**

If a remote has been set up:
```bash
git remote add origin <url>
git push -u origin main --tags
```

---

## Self-review notes

- **Spec coverage:** Every service in the spec has a dedicated task (postgres: T3/T12, mosquitto: T4/T12, chirpstack: T5/T13, gateway-bridge: T6/T13, rest-api: T13, nodered: T7-T11/T14-T15). The GitLab clone behavior is Task 10. The envsubst rendering is Task 10. The Heromatic npm auth is Task 11. The `.env` / secrets strategy is Task 2. The US915 sub-band 0 configuration lives in the TOML from Task 5 via `enabled_regions=["$CHIRPSTACK_REGION"]`. The smoke-test checklist (Task 16) exercises all 13 success criteria from the spec.
- **Placeholder scan:** All code blocks contain concrete content. The only "fill-in-before-build" is the user populating `.env` in Task 14 Step 2, which is explicitly checked before proceeding.
- **Type consistency:** Env variable names match across `.env.example`, compose file, Dockerfile build args, and entrypoint. Service names (`postgres`, `redis`, `mosquitto`, `chirpstack`, `chirpstack-gateway-bridge`, `chirpstack-rest-api`, `nodered`) are consistent throughout. Volume names (`postgres_data`, `redis_data`, `mosquitto_data`, `mosquitto_log`, `nodered_data`) are referenced identically in both `services:` and top-level `volumes:`.
