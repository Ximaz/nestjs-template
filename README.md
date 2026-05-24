# nestjs-template

A NestJS monorepo template managed with **pnpm workspaces**, running on **Fastify**, using **Prisma** + **PostgreSQL** and **Valkey** for caching, with built-in JWT auth, Google OAuth2, Swagger/OpenAPI, Docker, and a GitHub Actions CI pipeline.

---

## Tech stack

| Tool         | Version          | Purpose                                       |
| ------------ | ---------------- | --------------------------------------------- |
| Node.js      | 24.13.0          | JavaScript runtime                            |
| pnpm         | 10.33.2          | Package manager & workspace orchestrator      |
| NestJS       | 11.1.23          | Backend framework                             |
| Fastify      | 5.8.5            | HTTP server (via `@nestjs/platform-fastify`)  |
| Prisma       | 7.8.0            | ORM & migration tool                          |
| PostgreSQL   | 16.8-alpine3.20  | Database                                      |
| Valkey       | 8.1.7-alpine3.23 | In-memory cache (Redis-compatible)            |
| iovalkey     | 0.3.3            | Valkey/Redis TypeScript client                |
| TypeScript   | 5.9.3            | Language                                      |
| Zod          | 4.4.3            | Schema validation (via `nestjs-zod`)          |
| argon2       | 0.44.0           | Password hashing                              |
| jose         | 6.2.3            | JWT signing/verification                      |
| Jest         | 29.7.0           | Testing framework                             |
| Husky        | 9.1.7            | Git hooks (pre-commit lint & format)          |

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
│   │   │   ├── oauth/          # Google OAuth2 flow (with state CSRF in cache)
│   │   │   ├── users/          # User resource
│   │   │   ├── health/         # /health endpoint
│   │   │   ├── prisma/         # PrismaModule & PrismaService
│   │   │   ├── filters/        # Global exception filter
│   │   │   ├── generated/      # Prisma client output (gitignored)
│   │   │   ├── app.module.ts
│   │   │   └── main.ts
│   │   └── prisma/             # schema.prisma + migrations
│   └── shared/                 # @project/shared — Zod schemas & TS types
│       └── src/                # auth, user, oauth, health schemas
├── secrets/
│   ├── backend/                # Backend .env (gitignored, .env.example tracked)
│   ├── cache/                  # Valkey .env (gitignored, .env.example tracked)
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

Three `.env` files are required, all gitignored. Copy the examples and fill them in:

```bash
cp secrets/backend/.env.example  secrets/backend/.env
cp secrets/cache/.env.example    secrets/cache/.env
cp secrets/database/.env.example secrets/database/.env
```

**`secrets/backend/.env`** — used by the backend service:

| Variable              | Description                                           |
| --------------------- | ----------------------------------------------------- |
| `PORT`                | Port the NestJS app listens on (default `3000`)       |
| `DATABASE_URL`        | PostgreSQL connection string                          |
| `CACHE_URL`           | Valkey connection URL (`redis://user:pass@host:6379/0`) — see [`docs/cache.md`](docs/cache.md#scheme-redis-vs-valkey) |
| `GOOGLE_CLIENT_ID`    | Google OAuth2 client ID                               |
| `GOOGLE_CLIENT_SECRET`| Google OAuth2 client secret                           |
| `JWT_SECRET`          | Secret used to sign JWTs (e.g. `openssl rand -hex 16`)|
| `JWT_DURATION`        | JWT lifetime, [ms](https://github.com/vercel/ms)-format (e.g. `1d`) |

**`secrets/cache/.env`** — consumed by the Valkey container:

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

When running the backend from your host (not Docker), set the host portion of `DATABASE_URL` and `CACHE_URL` to `localhost` rather than `database` / `cache`. The database container publishes `5432`; the cache container does **not** publish anything by default — see [`docs/cache.md`](docs/cache.md#host-localhost-vs-cache).

### 4. Build the shared package

The backend depends on `@project/shared` at `workspace:*`; it must be built before the backend can typecheck or run.

```bash
pnpm --filter @project/shared build
```

### 5. Spin up the data services

```bash
docker compose up -d database cache
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

- `GET /health` — health check
- `GET /openapi` — Swagger UI
- `/api/*` — every other route (global prefix)

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

Three services orchestrated by [`docker-compose.yml`](docker-compose.yml): `database` (PostgreSQL), `cache` (Valkey), and `backend` (NestJS). Compose binds:

- Backend: container `3000` → host `8080`
- Database: container `5432` → host `5432`
- Cache: not published (network-internal only)

The Compose file builds `linux/arm64` by default; uncomment the `linux/amd64` line in `docker-compose.yml` for multi-arch. Full Dockerfile breakdown in [`docs/docker.md`](docs/docker.md).

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

| Module       | Responsibilities                                                | Deep dive |
| ------------ | --------------------------------------------------------------- | --------- |
| `health`     | Liveness endpoint (`GET /health`), excluded from `/api` prefix  | —         |
| `auth`       | Local email + password registration & login (argon2 + JWT)      | [`docs/auth.md`](docs/auth.md) |
| `oauth`      | Google OAuth2 authorization-code flow with cache-backed state CSRF, issues a JWT | [`docs/oauth.md`](docs/oauth.md) |
| `users`      | CRUD for the `User` resource                                    | —         |
| `prisma`     | `PrismaService` wrapping the generated Prisma client            | [`docs/prisma.md`](docs/prisma.md) |
| `cache`      | `CacheService` wrapping the Valkey client (`@Global()` module)  | [`docs/cache.md`](docs/cache.md) |

The Prisma schema defines `User`, `LocalCredential`, and `OAuthCredential` models with one-to-one relations and cascade deletes — see [`packages/backend/prisma/schema.prisma`](packages/backend/prisma/schema.prisma).

---

## License

Released under the [MIT License](LICENSE). Copyright (c) 2026 DURAND Malo.
