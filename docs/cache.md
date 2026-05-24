# Cache (Valkey)

The `cache` service provides an in-memory key/value store for ephemeral data — OAuth state tokens, throttling counters, session-style payloads, etc.

It uses [Valkey](https://valkey.io/), the Linux Foundation fork of Redis 7.2.x. The wire protocol and command surface stay Redis-compatible, so any Redis client and most Redis tooling work unchanged.

---

## Why "cache" and not "valkey"

Every Docker name in this project — service, container, volume, hostname — uses the generic `cache` identifier rather than the product name. Switching to KeyDB, DragonflyDB, or back to Redis later only requires changing the `image:` line; no compose-network, env, or backend-side reference has to change.

---

## Service definition

Declared in [`docker-compose.yml`](../docker-compose.yml) **before** the backend so the backend's `depends_on` is satisfied at startup.

| Aspect            | Value                                                                       |
| ----------------- | --------------------------------------------------------------------------- |
| Image             | `valkey/valkey:8.1.7-alpine3.23`                                            |
| Container name    | `project-cache`                                                             |
| Hostname (network)| `cache`                                                                     |
| Network           | `project-network`                                                           |
| Volume            | `project-cache` mounted at `/data` (RDB / AOF persistence)                  |
| Exposed ports     | **None** — reachable only by other services on `project-network`            |
| Restart policy    | `unless-stopped`                                                            |

### Image choice

- `valkey/valkey:<X.Y.Z>-alpine<N.NN>` pins both the Valkey version (`8.1.7`) and the Alpine base (`3.23`), the same pattern used for [`postgres:16.8-alpine3.20`](../docker-compose.yml).
- The `alpine` variant is ~17 MB compressed — significantly smaller than the Debian-slim variant.
- The 8.x branch is the current Valkey LTS line.

---

## Authentication (ACL user)

`--requirepass` is intentionally **not** used. It only authenticates the built-in `default` user, with no username at the protocol level. Instead the service starts a dedicated ACL user and disables `default`:

```yaml
command:
  - sh
  - -c
  - 'valkey-server --user "$$VALKEY_USERNAME" on ">$$VALKEY_PASSWORD" "~*" "&*" "+@all" --user default off'
```

The ACL rules grant the new user:

| Rule    | Effect                                       |
| ------- | -------------------------------------------- |
| `on`    | Enable the user                              |
| `>pwd`  | Set the password (`>` prefix = add password) |
| `~*`    | All keys                                     |
| `&*`    | All pub/sub channels                         |
| `+@all` | All command categories                       |

`--user default off` disables anonymous-username `AUTH password` connections; clients must send `AUTH <username> <password>` (the ACL form).

Compose interpolates `$$VAR` → `$VAR` before handing the string to `sh -c`, which then expands the variables from the container's environment populated by `env_file`. The same `$${VAR}` escape is used in the healthcheck for `CMD-SHELL`.

### Healthcheck

```yaml
healthcheck:
  test: ["CMD-SHELL", "valkey-cli --user $${VALKEY_USERNAME} -a $${VALKEY_PASSWORD} ping | grep -q PONG"]
  interval: 5s
  timeout:  5s
  retries:  5
```

Same cadence as the database healthcheck so `depends_on` semantics stay uniform.

---

## Secrets

### `secrets/cache/.env` — consumed by the Valkey container

| Variable          | Description                          |
| ----------------- | ------------------------------------ |
| `VALKEY_USERNAME` | ACL username created at boot         |
| `VALKEY_PASSWORD` | ACL user password                    |

### `secrets/backend/.env` — consumed by the backend

| Variable    | Description                                         |
| ----------- | --------------------------------------------------- |
| `CACHE_URL` | Connection URL, e.g. `redis://user:pass@host:6379/0`|

The backend takes a **single URL**, not separate host/port/password vars. Username, password, host, port, and logical database number are all encoded in it.

### Scheme: `redis://` vs `valkey://`

The official Valkey TypeScript client used here ([`iovalkey`](https://www.npmjs.com/package/iovalkey)) is a fork of `ioredis` and inherits its URL parser, which only recognises `redis:` and `rediss:` (TLS). A `valkey://...` URL would make `iovalkey` interpret `/0` as a Unix socket path instead of a database number, breaking the connection.

Until `iovalkey` adds native `valkey://` support, **use `redis://`** in `CACHE_URL`.

### Host: `localhost` vs `cache`

The shipped example uses `localhost`, suitable for running the backend on the host while the cache container exposes nothing publicly — except that **the cache exposes no ports**. The two reasonable setups:

| Backend runtime              | `CACHE_URL` host  | Notes                                                          |
| ---------------------------- | ----------------- | -------------------------------------------------------------- |
| Inside Docker (`backend` svc)| `cache`           | Docker DNS resolves the service name on `project-network`      |
| On the host (`pnpm start:dev`)| `localhost` + a published port | The cache must publish `6379` first; default compose does not |

If you develop on the host, either add `ports: ["6379:6379"]` to the `cache` service or run the backend in Docker too.

---

## Backend integration

### `CacheService`

[`packages/backend/src/cache/cache.service.ts`](../packages/backend/src/cache/cache.service.ts) extends `iovalkey`'s `Redis` class (re-imported as `Valkey` for clarity). Extending the client directly — the same pattern used by [`PrismaService`](../packages/backend/src/prisma/prisma.service.ts) — means every Redis/Valkey command is available on the injected service without a wrapper layer.

```ts
@Injectable()
export class CacheService extends Valkey implements OnModuleDestroy {
  constructor(configService: ConfigService) {
    super(configService.getOrThrow<string>('CACHE_URL'));
    this.on('connect', () => this.logger.log('Connected to Valkey'));
    this.on('error', (err) => this.logger.error(err.message));
  }

  async onModuleDestroy(): Promise<void> {
    await this.quit();
  }
}
```

`iovalkey` parses the URL into its option set (`host`, `port`, `username`, `password`, `db`) automatically.

### Why `import { Redis as Valkey } from 'iovalkey'`

Under TypeScript `module: NodeNext`, `import Valkey from 'iovalkey'` resolves the default export of a CJS module to the *namespace object*, not the class itself — `class Foo extends Valkey {}` then fails with `TS2507: ... is not a constructor function type`. `iovalkey` re-exports the same class as a named `Redis` export, and named imports typecheck correctly. The local alias keeps the semantics readable.

### `CacheModule`

[`packages/backend/src/cache/cache.module.ts`](../packages/backend/src/cache/cache.module.ts) is decorated `@Global()` and imported once in [`AppModule`](../packages/backend/src/app.module.ts). `CacheService` can be injected anywhere without re-importing the module:

```ts
constructor(private readonly cache: CacheService) {}
```

---

## Usage examples

### Set with TTL, atomic consume

```ts
await this.cache.set('foo:42', 'bar', 'EX', 300); // 5-minute TTL

const consumed = await this.cache.del('foo:42');  // returns 1 or 0
if (consumed === 0) {
  throw new UnauthorizedException();              // not present (expired or replay)
}
```

`DEL` returns the number of keys actually removed, which gives a single-round-trip atomic check-and-consume. This is preferable to `GET` + `DEL` (two round-trips + TOCTOU race) for one-shot tokens.

### Real usage — OAuth CSRF state

The OAuth flow uses this exact pattern. See [`docs/oauth.md`](oauth.md#csrf-state-protection) for the full integration.

---

## Operating the service

```bash
docker compose up -d cache              # Start only the cache
docker compose ps cache                 # Show health status
docker compose logs -f cache            # Tail logs

# REPL into the cache as the ACL user
docker exec -it project-cache \
  valkey-cli --user "$VALKEY_USERNAME" -a "$VALKEY_PASSWORD"
```

The `project-cache` named volume persists data across container restarts. To wipe persisted state:

```bash
docker compose down
docker volume rm nestjs-template_project-cache
```
