# Falcon Docker Stack

> Stack de Docker para el proyecto Falcon (control de válvulas + rutinas +
> sensores de riego). Ver `nodered/riego-flow-backup/` para el respaldo
> del flujo de Node-RED.

Docker Compose stack bundling Node-RED (with the Falcon irrigation flow
baked into the image), ChirpStack v4 with LoRaWAN US915 support, MQTT
broker, PostgreSQL, Redis, Home Assistant bridge, and a gateway bridge
for the Dragino LPS8v2.

## Prerequisites

- Docker Desktop (Windows/Mac) or Docker Engine + Compose v2 (Linux).
- No external credentials needed to build — everything the image needs
  is baked in from this repo.

## Quickstart

```bash
git clone <this-repo>
cd Falcon-Docker
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
| Rebuild Node-RED after dep/flow change | `docker compose build --no-cache nodered && docker compose up -d nodered` |
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

**LPS8v2 not showing up in ChirpStack**
- Verify Windows firewall allows UDP/1700.
- `docker compose logs chirpstack-gateway-bridge` should show received packets.
- Confirm the LPS8v2 points at the host's LAN IP (not `localhost`).

**Node-RED cannot reach Modbus gateway**
- `docker compose exec nodered ping <gateway-ip>` — if 100% loss, Docker Desktop cannot route to the LAN.
- Mitigation: configure Docker Desktop → Resources → Network, or move the Modbus gateway to a routable interface.

**ChirpStack UI doesn't load**
- First boot takes 30–60 seconds for Postgres schema migration. `docker compose logs chirpstack` should eventually show `starting api listener`.

## Layout

```
Falcon-Docker/
├── docker-compose.yml
├── .env.example
├── nodered/               # custom Node-RED image + settings + entrypoint + our flows
├── chirpstack/            # TOML configs for server and gateway-bridge
├── mosquitto/config/      # MQTT broker config
└── postgres/initdb/       # DB extensions init script
```

## Secrets

All secrets live in `.env` (gitignored). Do NOT commit `.env`. If you rotate a secret, `docker compose restart nodered` re-renders the runtime config files.
