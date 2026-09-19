# Node-RED user config

Edit these files freely — they get bind-mounted into the container as the source for `env.json` / `rainAzureApi.json` and re-rendered on every container start.

## How it works

| Host file | Becomes inside container | Final path Node-RED reads |
|---|---|---|
| `nodered/user-config/env.json` | `/templates/env.json.tmpl` | `/data/projects/enviromental/data/env.json` |
| `nodered/user-config/rainAzureApi.json` | `/templates/rainAzureApi.json.tmpl` | `/data/projects/enviromental/data/rainAzureApi.json` |

The entrypoint runs `envsubst` over them so:

- **Hardcoded values pass through unchanged** — `"foo": 42` stays `"foo": 42`.
- **`${VARIABLE}` placeholders are replaced** with the matching env var from `.env` (only if also passed through in `docker-compose.yml` → `nodered.environment:`).

So you can mix: some fields hardcoded, others read from `.env`.

## Apply changes

```powershell
cd C:\Projects\Falcon-Docker
docker compose up -d nodered
```

(`up -d` reruns the entrypoint, which re-renders both files.)

## Verify

```powershell
docker compose exec nodered cat /data/projects/enviromental/data/env.json
```

## Adding a brand-new param

1. Edit `env.json` here, add the field. Either hardcode the value or use `${MI_VAR}`.
2. If you used `${MI_VAR}`: add `MI_VAR=somevalue` to `.env` AND add `MI_VAR: ${MI_VAR}` under `nodered.environment:` in `docker-compose.yml`.
3. `docker compose up -d nodered`.

## Secrets warning

These files are tracked by git. If you put real secrets here (Azure SAS keys, etc.) they'll get committed. Prefer the `${VAR}` pattern with values in `.env` (which is gitignored).
