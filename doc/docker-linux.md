# Kingpin master — Linux + Docker

## Understanding

- Linux build of [hypov8/kingpin_master_server](https://github.com/hypov8/kingpin_master_server) (`src/` layout) + Docker image for VPS / Compose
- Optional Node dashboard in `web/` (shavargo) on the same host
- Publish UDP 27900 (KP), UDP 27950 (KPQ3), TCP 28900 (GameSpy)

## Build layout (upstream)

- Sources: `src/*.c`
- Config / data files: `config/*.txt` (copied to `bin/` by `make`)
- Binary: `bin/master`

## Quick start

```bash
make                    # → bin/master + config txt in bin/
docker build -t kingpin-master .
docker compose up -d
```

Optional env: `LISTEN_ADDR`, `PORT_KP`, `PORT_KPQ3`, `VERBOSE`, `MAX_SERVERS`, `HASH_SIZE`, `STATIC_IP`, `MAP_ADDR`.

## Compose

- `kingpin-master` — C master (hypov8)
- `web` — Node public server list (`PUBLIC_MASTER_HOST`, queries master over Docker network)
