# Falcon Docker Stack

> Fork independiente de "Guardian Docker Stack" (antes conocido también
> como "Riego Docker Stack"), separado para el proyecto Falcon (control de
> válvulas + rutinas + sensores). Sin conexión de git con el repo
> original — así los cambios acá nunca afectan a nadie más.
> Ver `nodered/riego-flow-backup/` para el respaldo del flujo de Node-RED.

Docker Compose stack for the **Environmental Monitoring / Node-RED Falcon** project. Bundles Node-RED (with the Falcon project auto-cloned from GitLab), ChirpStack v4 with LoRaWAN US915 support, MQTT broker, PostgreSQL, Redis, and a gateway bridge for the Dragino LPS8v2.

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
Falcon-Docker/
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
