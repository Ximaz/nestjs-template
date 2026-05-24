# Cache (Valkey) & Queue-cache

The template runs **two** independent Valkey instances:

| Service       | Purpose                                                                          | Backend client       | Env var      |
| ------------- | -------------------------------------------------------------------------------- | -------------------- | ------------ |
| `cache`       | App-level ephemeral storage: OAuth CSRF state, throttler counters, ad-hoc data   | `CacheService`       | `CACHE_URL`  |
| `queue-cache` | Dedicated backing store for BullMQ — owned by the queue, not for general use     | `QueueCacheService`  | `QUEUE_URL`  |

Both use [Valkey](https://valkey.io/), the Linux Foundation fork of Redis 7.2.x. The wire protocol and command surface stay Redis-compatible, so any Redis client and most Redis tooling work unchanged.

Keeping the queue-cache separate is deliberate: BullMQ assumes ownership of its keyspace (queues, jobs, scheduler keys), and a stray `FLUSHDB` from cache maintenance would wipe the queue along with it. Two instances with two ACL users keep the blast radius bounded.

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
| Published port    | `127.0.0.1:6379 → 6379` — loopback only, never exposed to the LAN           |
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

| Variable    | Description                                                                                |
| ----------- | ------------------------------------------------------------------------------------------ |
| `CACHE_URL` | Cache instance URL, e.g. `redis://user:pass@host:6379/0` or `valkey://user:pass@host:6379` |
| `QUEUE_URL` | Queue-cache instance URL (same format) — see [Queue-cache (BullMQ)](#queue-cache-bullmq)   |

Each backend takes a **single URL** per instance, not separate host/port/password vars. Username, password, host, port, and logical database number are all encoded in it.

### Scheme: `redis://` vs `valkey://`

[`iovalkey`](https://www.npmjs.com/package/iovalkey) is a fork of `ioredis` and inherits its URL parser, which only recognises `redis:` / `rediss:` natively. A `valkey://...` URL passed straight to the client makes it interpret `/0` as a Unix socket path instead of a database number, and silently drops credentials — connections then fail with `NOAUTH Authentication required`.

The template sidesteps this with a small helper, [`parseValkeyUrl`](../packages/backend/src/config/valkey-url.ts), which parses the URL manually and produces a `{ host, port, username, password, db }` options object. Every Valkey-touching site uses it: `CacheService`, `QueueCacheService`, the BullMQ connection in [`queue.module.ts`](../packages/backend/src/queue/queue.module.ts), and the throttler storage in [`app.module.ts`](../packages/backend/src/app.module.ts).

Either scheme works in `CACHE_URL` / `QUEUE_URL` — the helper accepts any URL that `new URL()` accepts.

### Host: `localhost` vs `cache`

`cache` and `queue-cache` both publish on loopback (`127.0.0.1:6379` and `127.0.0.1:6380` respectively), so the host port is reachable for `pnpm start:dev`-style development. The two reasonable setups:

| Backend runtime               | `CACHE_URL` host  | `QUEUE_URL` host  | Notes                                                       |
| ----------------------------- | ----------------- | ----------------- | ----------------------------------------------------------- |
| Inside Docker (`backend` svc) | `cache`           | `queue-cache`     | Docker DNS resolves the service name on `project-network`   |
| On the host (`pnpm start:dev`)| `localhost:6379`  | `localhost:6380`  | Uses the loopback publication                               |

The loopback bind keeps the cache invisible to anything other than the host itself — no LAN exposure, no firewall changes needed.

---

## Backend integration

### `CacheService`

[`packages/backend/src/cache/cache.service.ts`](../packages/backend/src/cache/cache.service.ts) extends `iovalkey`'s `Redis` class (re-imported as `Valkey` for clarity). Extending the client directly — the same pattern used by [`PrismaService`](../packages/backend/src/prisma/prisma.service.ts) — means every Redis/Valkey command is available on the injected service without a wrapper layer.

```ts
@Injectable()
export class CacheService extends Valkey implements OnModuleDestroy {
  constructor(configService: ConfigService) {
    super(parseValkeyUrl(configService.getOrThrow<string>('CACHE_URL')));
    this.on('connect', () => this.logger.log('Connected to Valkey'));
    this.on('error', (err) => this.logger.error(err.message));
  }

  async onModuleDestroy(): Promise<void> {
    await this.quit();
  }
}
```

`parseValkeyUrl` turns the URL into an explicit `{ host, port, username, password, db }` options object, sidestepping `iovalkey`'s scheme-restricted URL parser (see [Scheme: `redis://` vs `valkey://`](#scheme-redis-vs-valkey)). `OnModuleDestroy` + `app.enableShutdownHooks()` in [`main.ts`](../packages/backend/src/main.ts) ensures the connection drains on `SIGTERM`.

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

### Real usage — distributed throttler counters

`@nestjs/throttler` is wired with [`@nest-lab/throttler-storage-redis`](https://www.npmjs.com/package/@nest-lab/throttler-storage-redis) pointed at `CACHE_URL`, in [`app.module.ts`](../packages/backend/src/app.module.ts):

```ts
ThrottlerModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => ({
    throttlers: [ThrottleLimits.default],
    storage: new ThrottlerStorageRedisService(
      parseValkeyUrl(configService.getOrThrow<string>('CACHE_URL')),
    ),
  }),
})
```

This makes throttling counters survive horizontal scaling — every backend instance reads/writes the same bucket. The adapter opens its own Valkey connection rather than reusing `CacheService`: it does an `instanceof ioredis.Redis` check internally, and iovalkey (despite being a runtime-compatible fork) is a different class identity, so reuse would silently fail.

Throttle limits live in [`packages/backend/src/config/throttle.config.ts`](../packages/backend/src/config/throttle.config.ts) — see [`docs/auth.md`](auth.md#rate-limiting) for the auth-specific override.

---

## Queue-cache (BullMQ)

The second Valkey instance backs [BullMQ](https://docs.bullmq.io/) job queues. It's a separate container, separate ACL user, separate connection — same image and configuration shape as `cache`.

### Service definition

| Aspect            | Value                                                                       |
| ----------------- | --------------------------------------------------------------------------- |
| Image             | `valkey/valkey:8.1.7-alpine3.23`                                            |
| Container name    | `project-queue-cache`                                                       |
| Hostname (network)| `queue-cache`                                                               |
| Published port    | `127.0.0.1:6380 → 6379` (offset from `cache` to avoid host-port collision)  |
| Volume            | `project-queue-cache` mounted at `/data`                                    |
| Env file          | `secrets/queue/.env`                                                        |

### Backend integration

Two pieces sit in [`packages/backend/src/queue/`](../packages/backend/src/queue/):

- **`QueueModule`** ([`queue.module.ts`](../packages/backend/src/queue/queue.module.ts)) — `@Global()`. Wires `@nestjs/bullmq`'s `BullModule.forRootAsync` with the parsed connection options, and exposes `QueueCacheService`.
- **`QueueCacheService`** ([`queue-cache.service.ts`](../packages/backend/src/queue/queue-cache.service.ts)) — extends `Valkey` directly, like `CacheService`. Used by the health indicator to `PING` the queue-cache without going through BullMQ.

```ts
@Injectable()
export class QueueCacheService extends Valkey implements OnModuleDestroy {
  constructor(configService: ConfigService) {
    super({
      ...parseValkeyUrl(configService.getOrThrow<string>('QUEUE_URL')),
      maxRetriesPerRequest: null,
    });
  }
  async onModuleDestroy(): Promise<void> { await this.quit(); }
}
```

`maxRetriesPerRequest: null` is required by BullMQ for blocking commands (`BRPOPLPUSH`, etc.) — without it those commands time out after the default retry budget.

### Defining queues

`QueueModule` only wires the root connection. To add a queue, register it in a feature module and use `@Processor` / `@OnWorkerEvent` from `@nestjs/bullmq`:

```ts
@Module({
  imports: [BullModule.registerQueue({ name: 'emails' })],
  providers: [EmailsProcessor],
})
export class EmailsModule {}

@Processor('emails')
export class EmailsProcessor extends WorkerHost {
  async process(job: Job) { /* ... */ }
}
```

See the [`@nestjs/bullmq` docs](https://docs.nestjs.com/techniques/queues) for the full surface.

### When *not* to share the queue-cache connection

The `QueueCacheService` is exported so non-BullMQ code (e.g. the health indicator) can issue commands against the same instance. **Don't use it as a general-purpose cache** — BullMQ owns the keyspace and adding unrelated keys risks collisions with future queue features. Use `CacheService` for app-level caching.

---

## Health indicator

`/health` runs a `PING` against each Valkey instance via a shared `ValkeyHealthIndicator` ([`packages/backend/src/health/indicators/valkey.indicator.ts`](../packages/backend/src/health/indicators/valkey.indicator.ts)). The indicator is client-agnostic — it accepts any `Valkey` instance as an argument — which is why one indicator covers both `cache` and `queue-cache`:

```ts
this.health.check([
  () => this.valkeyIndicator.pingCheck('cache', this.cacheService),
  () => this.valkeyIndicator.pingCheck('queue-cache', this.queueCacheService),
]);
```

A non-`PONG` reply marks the indicator as `down` with the reply included in the response body. See [`docs/prisma.md`](prisma.md#health-indicator) for the database side.

---

## Operating the services

```bash
# Start the data services
docker compose up -d cache queue-cache
docker compose ps cache queue-cache       # Health status
docker compose logs -f cache              # Tail logs

# REPL into either instance as the ACL user
docker exec -it project-cache       valkey-cli --user "$VALKEY_USERNAME" -a "$VALKEY_PASSWORD"
docker exec -it project-queue-cache valkey-cli --user "$VALKEY_USERNAME" -a "$VALKEY_PASSWORD"
```

The `project-cache` and `project-queue-cache` named volumes persist data across container restarts. To wipe persisted state:

```bash
docker compose down
docker volume rm nestjs-template_project-cache
docker volume rm nestjs-template_project-queue-cache
```
