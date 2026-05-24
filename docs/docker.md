# Docker

Four services orchestrated by [`docker-compose.yml`](../docker-compose.yml), one shared network, three named volumes (one per stateful service). All non-application services keep generic names (`database`, `cache`, `queue-cache`) so swapping the underlying implementation later doesn't ripple into compose / backend / network references.

---

## Topology

```
┌────────────────────────────────────────────────────────────────────────┐
│                          project-network                               │
│                                                                        │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────────┐         │
│  │ backend  │──▶│ database │   │  cache   │   │ queue-cache  │         │
│  │ project- │   │ project- │   │ project- │   │ project-     │         │
│  │ backend  │   │ database │   │ cache    │   │ queue-cache  │         │
│  │   :3000  │   │   :5432  │   │   :6379  │   │     :6379    │         │
│  └────┬─────┘   └────┬─────┘   └────┬─────┘   └──────┬───────┘         │
│       │              │              │                │                 │
└───────┼──────────────┼──────────────┼────────────────┼─────────────────┘
        ▼              ▼              ▼                ▼
   host :8080   127.0.0.1:5432   127.0.0.1:6379   127.0.0.1:6380
                                                                  volumes
                                project-database   project-cache  project-queue-cache
```

| Service       | Image                              | Container             | Ports                  | Volume                 |
| ------------- | ---------------------------------- | --------------------- | ---------------------- | ---------------------- |
| `database`    | `postgres:16.8-alpine3.20`         | `project-database`    | `127.0.0.1:5432:5432`  | `project-database`     |
| `cache`       | `valkey/valkey:8.1.7-alpine3.23`   | `project-cache`       | `127.0.0.1:6379:6379`  | `project-cache`        |
| `queue-cache` | `valkey/valkey:8.1.7-alpine3.23`   | `project-queue-cache` | `127.0.0.1:6380:6379`  | `project-queue-cache`  |
| `backend`     | `project-backend` (built locally)  | `project-backend`     | `3000 → 8080`          | none                   |

All data-service publications are bound to `127.0.0.1` so the ports are reachable from the host (for `pnpm start:dev`, psql, valkey-cli) but never exposed to the LAN.

Declaration order in compose is `database → cache → queue-cache → backend`; the backend `depends_on: [database, cache, queue-cache]` so it waits for all three.

The `cache` and `queue-cache` services use the same image but separate ACL credentials, volumes, and host ports — see [`docs/cache.md`](cache.md#queue-cache-bullmq) for the rationale.

For service-specific deep dives, see:
- [`docs/cache.md`](cache.md)
- [`docs/prisma.md`](prisma.md)

---

## Backend Dockerfile

[`docker/backend.Dockerfile`](../docker/backend.Dockerfile) is a four-stage build aimed at minimum runtime image size.

| Stage          | Base                          | Purpose                                                                  |
| -------------- | ----------------------------- | ------------------------------------------------------------------------ |
| `base`         | `node:24.13.0-alpine3.23`     | Enables pnpm via Corepack at the pinned version.                         |
| `dependencies` | `base`                        | Copies the lockfile + every workspace `package.json` and runs `pnpm install --frozen-lockfile`. Cached as long as those files don't change. |
| `build`        | `base`                        | Copies the sources + the dependency `node_modules` from the previous stage, builds `@project/shared`, runs `prisma:generate`, builds `@project/backend`, and produces a pruned `/runtime/` tree via `pnpm deploy --prod --legacy`. |
| `runtime`      | `node:24.13.0-alpine3.23`     | Fresh base, copies only `/runtime/`. `EXPOSE 3000`, `ENTRYPOINT ["node"]`, `CMD ["dist/src/main.js"]`, and a `HEALTHCHECK` curling `/health` every 30 s — the Terminus endpoint validates Postgres + both Valkey instances in one round-trip. |

### Why `pnpm deploy --prod --legacy`

It resolves the workspace dependency on `@project/shared` into a regular `node_modules/` entry (no workspace symlinks), prunes devDependencies, and copies only what's needed to run the backend. The result is a self-contained tree the runtime image can ship without any pnpm tooling.

---

## Building & running

```bash
# Backend image
docker compose build backend

# Full stack (database + cache + backend)
docker compose up

# A single service in the background
docker compose up -d cache
docker compose up -d database

# Tear down everything (keeps volumes)
docker compose down

# Tear down and wipe persisted data
docker compose down -v
```

### Platform

`docker-compose.yml` builds `linux/arm64` by default. Uncomment the `linux/amd64` line in the `backend.platforms` block to produce a multi-arch image locally.

---

## Published images

`.github/workflows/backend-ci.yaml` pushes the backend image to GitHub Container Registry on every merge to `main`:

```
ghcr.io/<owner>/<repo>/backend:latest
ghcr.io/<owner>/<repo>/backend:<short-sha>
```

Buildx + GHA cache shorten subsequent builds. The full workflow lives at [`.github/workflows/backend-ci.yaml`](../.github/workflows/backend-ci.yaml).
