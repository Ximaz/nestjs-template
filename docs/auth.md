# Auth

The `auth` module handles local email + password credentials and issues the project's JWTs (used by both local and OAuth login).

Two responsibilities:

- **Local credentials** — stored as argon2 hashes in the `LocalCredential` table, never plaintext.
- **JWT issuance & verification** — `JwtService` from `@nestjs/jwt`, signed with `HS256` via `JWT_SECRET`.

OAuth login also goes through this module — see [`docs/oauth.md`](oauth.md) — to produce the same JWT shape regardless of login method.

---

## Endpoints

| Method | Path                          | Description                                          | Auth required | Throttle           |
| ------ | ----------------------------- | ---------------------------------------------------- | ------------- | ------------------ |
| `POST` | `/api/auth/register`          | Create a local credential + `User` and return a JWT  | No            | 5 req/min          |
| `POST` | `/api/auth/login`             | Verify credentials and return a JWT                  | No            | 5 req/min          |
| `PUT`  | `/api/auth/update-credential` | Change email and/or password for the current user    | Yes (JWT)     | 100 req/min (global default) |

The `JwtGuard` at [`packages/backend/src/auth/guards/jwt.guard.ts`](../packages/backend/src/auth/guards/jwt.guard.ts) is applied per-endpoint via `@UseGuards(JwtGuard)`.

---

## Rate limiting

The unauthenticated credential endpoints (`/register`, `/login`) carry a per-route override that tightens the global throttler from 100 req/min down to 5 req/min — narrow enough to make credential stuffing impractical while staying well above legitimate user retry behaviour.

```ts
@Post('/login')
@Throttle({ default: ThrottleLimits.auth })
@UseGuards(LocalAuthGuard)
async login(@Req() req: FastifyRequest): Promise<AuthResponseDto> { ... }
```

Both limits live in [`packages/backend/src/config/throttle.config.ts`](../packages/backend/src/config/throttle.config.ts) so changes are made in one place. Counters are stored in the cache (`CACHE_URL`) via [`@nest-lab/throttler-storage-redis`](https://www.npmjs.com/package/@nest-lab/throttler-storage-redis), so the budget is shared across backend instances — see [`docs/cache.md`](cache.md#real-usage--distributed-throttler-counters).

`AuthController` declares `@ApiTooManyRequestsResponse({...})` at the class level, propagating the 429 response shape to every endpoint in the controller's OpenAPI spec.

---

## Password hashing

[`argon2`](https://www.npmjs.com/package/argon2) with the `argon2id` variant — the OWASP-recommended default. Hashes are stored in `LocalCredential.hashedPassword`; the salt is part of the encoded hash string, so no separate column is needed.

```ts
const hashedPassword = await hash(plain, { type: argon2id });
const ok = await verify(stored, plain);
```

---

## JWT shape

| Claim   | Value                                          |
| ------- | ---------------------------------------------- |
| `sub`   | `User.id` (cuid2)                              |
| `email` | `User.email`                                   |
| `iat`   | issued-at (automatic)                          |
| `exp`   | `iat` + `JWT_DURATION` (parsed by [`ms`](https://github.com/vercel/ms)) |

Signed with `HS256` using `JWT_SECRET`. The duration is supplied in `ms`-format strings (e.g. `1h`, `7d`).

`AuthService.forgeToken(user)` is the single entry point for issuing tokens — it's reused by the OAuth callback so both flows produce identical JWTs.

---

## Configuration

Required env vars in `secrets/backend/.env`:

| Variable       | Description                                                     |
| -------------- | --------------------------------------------------------------- |
| `JWT_SECRET`   | Symmetric signing secret (e.g. `openssl rand -hex 16`)          |
| `JWT_DURATION` | Token lifetime as an `ms`-format string (e.g. `1d`, `2h`)       |

---

## DTOs

Shared schemas live in [`packages/shared/src/auth.schema.ts`](../packages/shared/src/auth.schema.ts) and are wrapped via `nestjs-zod` into NestJS DTOs in `packages/backend/src/auth/dto/`:

| DTO                | Endpoint                       | Fields                                         |
| ------------------ | ------------------------------ | ---------------------------------------------- |
| `CreateAuthDto`    | `POST /api/auth/register`      | `email`, `password`, profile fields            |
| `VerifyAuthDto`    | `POST /api/auth/login`         | `email`, `password`                            |
| `UpdateAuthDto`    | `PUT /api/auth/update-credential` | partial — new `email` and/or `password`    |
| `AuthResponseDto`  | response shape                 | `token`, `expiresAt`                           |
