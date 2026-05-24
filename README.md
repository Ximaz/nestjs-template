# nestjs-template

A NestJS monorepo template managed with **pnpm workspaces**, running on **Fastify**, using **Prisma** + **PostgreSQL**, **Valkey** for caching and a separate Valkey instance for **BullMQ** queues. Hardened by default: zod-validated environment, Helmet, rate limiting with Valkey-backed distributed state, Terminus health checks, graceful shutdown, built-in JWT auth, Google OAuth2, Swagger/OpenAPI (dev-only), Docker, and a GitHub Actions CI pipeline.

---

## Tech stack

| Tool                         | Version          | Purpose                                                              |
| ---------------------------- | ---------------- | -------------------------------------------------------------------- |
| Node.js                      | 24.13.0          | JavaScript runtime                                                   |
| pnpm                         | 10.33.2          | Package manager & workspace orchestrator                             |
| NestJS                       | 11.1.23          | Backend framework                                                    |
| Fastify                      | 5.8.5            | HTTP server (via `@nestjs/platform-fastify`)                         |
| `@fastify/helmet`            | 13.0.2           | Security headers + CSP                                               |
| `@nestjs/throttler`          | 6.5.0            | Rate limiting (global guard, per-route overrides)                    |
| `@nest-lab/throttler-storage-redis` | 1.2.0     | Distributed throttler counters backed by Valkey                      |
| `@nestjs/terminus`           | 11.1.1           | Composable health checks (database, cache, queue-cache)              |
| `@nestjs/bullmq` / `bullmq`  | 11.0.4 / 5.x     | Job queues backed by a dedicated Valkey instance                     |
| Prisma                       | 7.8.0            | ORM & migration tool                                                 |
| PostgreSQL                   | 16.8-alpine3.20  | Database                                                             |
| Valkey                       | 8.1.7-alpine3.23 | In-memory cache + queue backing store (Redis-compatible)             |
| iovalkey                     | 0.3.3            | Valkey/Redis TypeScript client                                       |
| TypeScript                   | 5.9.3            | Language                                                             |
| Zod                          | 4.4.3            | Schema validation — DTOs (`nestjs-zod`) **and** environment at boot  |
| argon2                       | 0.44.0           | Password hashing                                                     |
| jose                         | 6.2.3            | JWT signing/verification                                             |
| pino / nestjs-pino           | 10.x / 4.6.1     | Structured logging with request-id propagation and secret redaction  |
| Jest                         | 29.7.0           | Testing framework                                                    |
| Husky                        | 9.1.7            | Git hooks (pre-commit lint & format)                                 |

Node version pinning is enforced through `.nvmrc` and matches the Docker base image.

---

## Repository layout

```
.
├── docker/
│   └── backend.Dockerfile      # Multi-stage build for the backend image
├── docker-compose.yml          # Orchestrates backend + PostgreSQL + Valkey
├── docs/                       # In-depth module/feature docs (see below)
├── packages/
│   ├── backend/                # NestJS application (@project/backend)
│   │   ├── src/
│   │   │   ├── auth/           # Local credentials (email + argon2 password)
│   │   │   ├── cache/          # Valkey client (CacheService, global module)
│   │   │   ├── config/         # Zod env schema + throttle constants + Valkey URL parser
│   │   │   ├── oauth/          # Google OAuth2 flow (with state CSRF in cache)
│   │   │   ├── queue/          # BullMQ wiring + dedicated queue-cache Valkey client
│   │   │   ├── users/          # User resource
│   │   │   ├── health/         # /health endpoint + Terminus indicators
│   │   │   │   └── indicators/ # Prisma + Valkey ping checks
│   │   │   ├── prisma/         # PrismaModule & PrismaService
│   │   │   ├── filters/        # Global exception filter
│   │   │   ├── generated/      # Prisma client output (gitignored)
│   │   │   ├── app.module.ts
│   │   │   └── main.ts
│   │   └── prisma/             # schema.prisma + migrations
│   └── shared/                 # @project/shared — Zod schemas & TS types
│       └── src/                # auth, user, oauth schemas
├── secrets/
│   ├── backend/                # Backend .env (gitignored, .env.example tracked)
│   ├── cache/                  # Valkey .env (gitignored, .env.example tracked)
│   ├── queue/                  # Queue-cache Valkey .env (gitignored, .env.example tracked)
│   └── database/               # PostgreSQL .env (gitignored, .env.example tracked)
├── .github/
│   ├── actions/setup/          # Composite action: Node + pnpm setup
│   └── workflows/backend-ci.yaml
├── .husky/                     # Git hooks
├── .nvmrc                      # Pinned Node version
├── pnpm-workspace.yaml
└── package.json                # Root workspace manifest
```

---

## Documentation

Deep dives per topic live under [`docs/`](docs/):

| Doc                              | Topic                                                                   |
| -------------------------------- | ----------------------------------------------------------------------- |
| [`docs/auth.md`](docs/auth.md)   | Local credentials (argon2) and JWT issuance                             |
| [`docs/cache.md`](docs/cache.md) | Valkey service, ACL setup, `CacheService`, URL scheme notes             |
| [`docs/docker.md`](docs/docker.md) | Compose topology and the backend multi-stage Dockerfile               |
| [`docs/oauth.md`](docs/oauth.md) | Google OAuth2 flow + CSRF `state` protection backed by the cache       |
| [`docs/prisma.md`](docs/prisma.md) | PostgreSQL service, schema, `PrismaService`, migration commands       |

---

## Getting started

### 1. Prerequisites

- Node.js (see `.nvmrc`) — `nvm use` will pick it up
- pnpm 10.33.2 — `corepack enable && corepack prepare pnpm@10.33.2 --activate`
- Docker & Docker Compose (for the database, cache, and containerized builds)

### 2. Install dependencies

From the repository root:

```bash
pnpm install
```

This installs dependencies for all workspace packages (`@project/backend` and `@project/shared`) and sets up the Husky pre-commit hook (which runs `pnpm format` and `pnpm lint`).

### 3. Configure environment variables

Four `.env` files are required, all gitignored. Copy the examples and fill them in:

```bash
cp secrets/backend/.env.example  secrets/backend/.env
cp secrets/cache/.env.example    secrets/cache/.env
cp secrets/queue/.env.example    secrets/queue/.env
cp secrets/database/.env.example secrets/database/.env
```

**`secrets/backend/.env`** — used by the backend service. Validated at boot by a Zod schema ([`packages/backend/src/config/env.schema.ts`](packages/backend/src/config/env.schema.ts)); the app refuses to start if any variable is missing, mistyped, or out of range, and prints every issue at once.

| Variable              | Description                                                                                  |
| --------------------- | -------------------------------------------------------------------------------------------- |
| `NODE_ENV`            | `development` (default) \| `test` \| `production`. Gates Swagger and CSP strictness.         |
| `PORT`                | Port the NestJS app listens on (default `3000`)                                              |
| `LOG_LEVEL`           | `fatal` \| `error` \| `warn` \| `info` (default) \| `debug` \| `trace` \| `silent`           |
| `DATABASE_URL`        | PostgreSQL connection string                                                                 |
| `CACHE_URL`           | Cache Valkey URL (`redis://user:pass@host:6379/0` or `valkey://…`) — see [`docs/cache.md`](docs/cache.md#scheme-redis-vs-valkey) |
| `QUEUE_URL`           | Queue-cache Valkey URL — separate instance dedicated to BullMQ                               |
| `GOOGLE_CLIENT_ID`    | Google OAuth2 client ID                                                                      |
| `GOOGLE_CLIENT_SECRET`| Google OAuth2 client secret                                                                  |
| `JWT_SECRET`          | Secret used to sign JWTs — must be ≥ 32 characters (e.g. `openssl rand -hex 32`)             |
| `JWT_DURATION`        | JWT lifetime, [ms](https://github.com/vercel/ms)-format (e.g. `1d`)                          |

**`secrets/cache/.env`** and **`secrets/queue/.env`** — consumed by the two Valkey containers. Same variable shape; the two services are isolated so the queue-cache (owned by BullMQ) can have its own credentials and keyspace.

| Variable          | Description                          |
| ----------------- | ------------------------------------ |
| `VALKEY_USERNAME` | ACL username created at boot         |
| `VALKEY_PASSWORD` | ACL user password                    |

**`secrets/database/.env`** — consumed by the PostgreSQL container:

| Variable            | Description           |
| ------------------- | --------------------- |
| `POSTGRES_USER`     | DB superuser name     |
| `POSTGRES_PASSWORD` | DB superuser password |
| `POSTGRES_DB`       | Default database name |

When running the backend from your host (not Docker), set the host portion of `DATABASE_URL`, `CACHE_URL`, and `QUEUE_URL` to `localhost` rather than `database` / `cache` / `queue-cache`. Compose publishes `5432`, `6379`, and `6380` on `127.0.0.1` for that purpose — see [`docs/cache.md`](docs/cache.md#host-localhost-vs-cache) and [`docs/docker.md`](docs/docker.md).

### 4. Build the shared package

The backend depends on `@project/shared` at `workspace:*`; it must be built before the backend can typecheck or run.

```bash
pnpm --filter @project/shared build
```

### 5. Spin up the data services

```bash
docker compose up -d database cache queue-cache
```

### 6. Run Prisma migrations & generate the client

```bash
pnpm --filter @project/backend prisma:generate
pnpm --filter @project/backend prisma:migrate
```

### 7. Start the backend in watch mode

```bash
pnpm --filter @project/backend start:dev
```

The API is then reachable at `http://localhost:3000`:

- `GET /health` — Terminus composite check (Postgres `SELECT 1`, cache `PING`, queue-cache `PING`). Excluded from the global `/api` prefix and from the global throttler.
- `GET /openapi` — Swagger UI. **Only mounted when `NODE_ENV !== 'production'`** — production builds 404 this route by design.
- `/api/*` — every other route (global prefix). Subject to the global throttler (100 req/min); auth endpoints add their own 5 req/min override.

---

## Common scripts

### Root

```bash
pnpm test       # Runs the backend test suite
pnpm lint       # Runs ESLint on the backend
pnpm format     # Runs Prettier on the backend
```

### Backend (`pnpm --filter @project/backend <script>`)

| Script            | What it does                                       |
| ----------------- | -------------------------------------------------- |
| `start`           | Run the app once                                   |
| `start:dev`       | Run the app in watch mode                          |
| `start:debug`     | Run with the Node inspector attached               |
| `start:prod`      | Run the compiled output from `dist/`               |
| `build`           | Compile with `nest build` + `tsc-alias`            |
| `test`            | Unit tests (Jest)                                  |
| `test:cov`        | Unit tests with coverage report                    |
| `test:e2e`        | End-to-end tests                                   |
| `prisma:generate` | Generate the Prisma client into `src/generated/`   |
| `prisma:migrate`  | Create & apply a migration in dev                  |
| `prisma:deploy`   | Apply pending migrations (prod-style)              |
| `prisma:reset`    | Drop and re-apply everything (destructive)         |
| `prisma:studio`   | Open Prisma Studio                                 |
| `prisma:format`   | Format `schema.prisma`                             |

### Shared (`pnpm --filter @project/shared <script>`)

| Script   | What it does                                       |
| -------- | -------------------------------------------------- |
| `build`  | Bundle CJS + ESM + types via `tsup`                |
| `dev`    | Same, in watch mode                                |
| `lint`   | ESLint                                             |

---

## Docker

Four services orchestrated by [`docker-compose.yml`](docker-compose.yml): `database` (PostgreSQL), `cache` (Valkey), `queue-cache` (Valkey, dedicated to BullMQ), and `backend` (NestJS). Compose binds:

- Backend: container `3000` → host `8080`
- Database: container `5432` → host `127.0.0.1:5432`
- Cache: container `6379` → host `127.0.0.1:6379`
- Queue-cache: container `6379` → host `127.0.0.1:6380`

All data-service publications are `127.0.0.1`-only, so nothing leaks to the LAN. The Compose file builds `linux/arm64` by default; uncomment the `linux/amd64` line in `docker-compose.yml` for multi-arch. Full Dockerfile breakdown in [`docs/docker.md`](docs/docker.md).

### Published images

CI publishes the backend image to GitHub Container Registry as `ghcr.io/<owner>/<repo>/backend` on every push to `main`, tagged with both `latest` and the short commit SHA.

---

## Continuous Integration

[`.github/workflows/backend-ci.yaml`](.github/workflows/backend-ci.yaml) runs on every push and pull request that touches `packages/backend/**`, `secrets/backend/**`, or the backend Dockerfile.

Two jobs:

1. **`check-lint-and-format`** — installs deps, builds `@project/shared`, generates the Prisma client, runs lint, format check, build, and tests with coverage.
2. **`build-and-push`** — (only on pushes to `main`) builds and pushes the backend image to GHCR using Docker Buildx and GitHub Actions cache.

Node and pnpm are set up through the composite action at [`.github/actions/setup/action.yaml`](.github/actions/setup/action.yaml).

---

## Git hooks

A Husky `pre-commit` hook runs:

```bash
pnpm format
pnpm lint
```

before every commit. Setup is automatic — `pnpm install` invokes the `prepare` script which calls `husky`.

---

## Modules at a glance

| Module       | Responsibilities                                                                                     | Deep dive |
| ------------ | ---------------------------------------------------------------------------------------------------- | --------- |
| `health`     | `GET /health` — Terminus composite check (Postgres, cache, queue-cache). Bypasses throttling.        | [`docs/prisma.md`](docs/prisma.md#health-indicator), [`docs/cache.md`](docs/cache.md#health-indicator) |
| `auth`       | Local email + password registration & login (argon2 + JWT). Per-route 5 req/min throttle.            | [`docs/auth.md`](docs/auth.md) |
| `oauth`      | Google OAuth2 authorization-code flow with cache-backed state CSRF, issues a JWT                     | [`docs/oauth.md`](docs/oauth.md) |
| `users`      | CRUD for the `User` resource                                                                         | —         |
| `prisma`     | `PrismaService` wrapping the generated Prisma client. Disconnects on shutdown.                       | [`docs/prisma.md`](docs/prisma.md) |
| `cache`      | `CacheService` (Valkey client, `@Global()`). Also storage for the throttler's distributed counters.  | [`docs/cache.md`](docs/cache.md) |
| `queue`      | BullMQ wiring + dedicated `QueueCacheService` Valkey client pointed at `QUEUE_URL`                   | [`docs/cache.md`](docs/cache.md#queue-cache-bullmq) |
| `config`     | Zod env schema (`validateEnv`), centralized throttle limits, shared `parseValkeyUrl` helper          | —         |

The Prisma schema defines `User`, `LocalCredential`, and `OAuthCredential` models with one-to-one relations and cascade deletes — see [`packages/backend/prisma/schema.prisma`](packages/backend/prisma/schema.prisma).

---

## Hardening

The template ships with these defaults baked in:

| Concern                  | What's wired up                                                                                                                    |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Env validation**       | `validateEnv` (zod) runs inside `ConfigModule.forRoot({ validate })`. Bootstrap fails with a single multi-issue report on misconfig. |
| **HTTP security headers**| `@fastify/helmet` with an env-aware CSP — strict in production, relaxed in dev only for Swagger UI's needs.                        |
| **Rate limiting**        | `@nestjs/throttler` as an `APP_GUARD` (100 req/min default), per-route override of 5 req/min on `/auth/register` and `/auth/login`. Counters live in Valkey via [`@nest-lab/throttler-storage-redis`](https://www.npmjs.com/package/@nest-lab/throttler-storage-redis) so multi-instance deployments share state. Limits centralized in [`packages/backend/src/config/throttle.config.ts`](packages/backend/src/config/throttle.config.ts). The 429 response is documented in OpenAPI via class-level `@ApiTooManyRequestsResponse` on every throttled controller. |
| **Health checks**        | `/health` runs a Postgres `SELECT 1`, a cache `PING`, and a queue-cache `PING` via Terminus. Container `HEALTHCHECK` curls this endpoint every 30 s. |
| **Graceful shutdown**    | `app.enableShutdownHooks()` plus `OnModuleDestroy` on Prisma + both Valkey clients — connections drain cleanly on `SIGTERM`.       |
| **Structured logging**   | `nestjs-pino` with `x-request-id` propagation and redaction of `authorization`, `cookie`, `password`, `token`. Pretty-printed in dev, JSON in production. |
| **Swagger gating**       | `SwaggerModule.setup('openapi', …)` only runs when `NODE_ENV !== 'production'`. Production builds don't expose the spec.           |

---

## License

Released under the [MIT License](LICENSE). Copyright (c) 2026 DURAND Malo.
