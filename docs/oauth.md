# OAuth

The `oauth` module implements the OAuth 2.0 Authorization Code flow. It exchanges a provider's authorization code for an ID token, decodes it (verifying the signature against the provider's JWKS), provisions or links a local `User`, and returns a project-issued JWT.

Currently only **Google** is wired in. Adding a provider amounts to one entry in the `OAUTH_PROVIDERS` map in [`oauth.service.ts`](../packages/backend/src/oauth/oauth.service.ts).

---

## Endpoints

| Method | Path                  | Description                                                                  |
| ------ | --------------------- | ---------------------------------------------------------------------------- |
| `GET`  | `/api/oauth/authorization` | Build & return the provider's authorization URL (with CSRF `state`)     |
| `POST` | `/api/oauth/callback`      | Exchange the authorization `code` for an ID token, then return a JWT    |

Both endpoints are publicly accessible (no auth guard). The callback verifies the OAuth `state` returned by the provider (see below) before doing any token exchange.

---

## DTOs

Shared Zod schemas live in [`packages/shared/src/oauth.schema.ts`](../packages/shared/src/oauth.schema.ts) and are wrapped by `nestjs-zod` into NestJS DTOs.

### `CreateOAuthDto` — `GET /api/oauth/authorization` query

| Field         | Type     | Description                                              |
| ------------- | -------- | -------------------------------------------------------- |
| `provider`    | `string` | OAuth2 provider identifier (e.g. `google`)               |
| `redirectUri` | `string` | Frontend callback URL                                    |

### `CreateOAuthCallbackDto` — `POST /api/oauth/callback` body

| Field         | Type     | Description                                              |
| ------------- | -------- | -------------------------------------------------------- |
| `provider`    | `string` | OAuth2 provider identifier                               |
| `redirectUri` | `string` | Same URI used to obtain the code                         |
| `code`        | `string` | Authorization code returned by the provider              |
| `state`       | `string` | CSRF token returned by the provider, originally issued by `/authorization` |

### `OAuthResponseDto` — `GET /api/oauth/authorization` response

| Field | Type     | Description                            |
| ----- | -------- | -------------------------------------- |
| `url` | `string` | The provider's authorization URL       |

---

## CSRF state protection

OAuth callbacks are vulnerable to login-CSRF: an attacker can craft a callback URL with their own authorization code and trick the victim's browser into hitting it, ending the victim's session on the attacker's account. The standard mitigation is the `state` parameter — an unguessable token bound to the user agent that initiated the flow.

### Flow

```
┌──────────┐                                       ┌──────────┐
│ Frontend │                                       │  Google  │
└────┬─────┘                                       └────┬─────┘
     │  GET /api/oauth/authorization                    │
     │ ───────────────────────────────►                 │
     │                                                  │
     │  Backend:                                        │
     │    state = randomBytes(32).hex                   │
     │    cache.SET oauth:state:<state> "1" EX 300      │
     │    return { url: ".../auth?...&state=<state>" }  │
     │ ◄───────────────────────────────                 │
     │                                                  │
     │  redirect to url                                 │
     │ ────────────────────────────────────────────────►│
     │                                                  │
     │  redirect to redirect_uri?code=<code>&state=<s>  │
     │ ◄────────────────────────────────────────────────│
     │                                                  │
     │  POST /api/oauth/callback {code, state, ...}     │
     │ ───────────────────────────────►                 │
     │                                                  │
     │  Backend:                                        │
     │    consumed = cache.DEL oauth:state:<state>      │
     │    if consumed == 0 → 401                        │
     │    else continue: exchange code, issue JWT       │
     │ ◄───────────────────────────────                 │
```

### Implementation details

In [`oauth.service.ts`](../packages/backend/src/oauth/oauth.service.ts):

| Step                        | Code                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------- |
| State generation            | `crypto.randomBytes(32).toString('hex')` — 256 bits, hex-encoded                            |
| Cache key                   | `oauth:state:<state>`                                                                       |
| TTL                         | 300 s (5 min) — `OAUTH_STATE_TTL_SECONDS` constant; not env-configurable on purpose         |
| Storage                     | `cache.set(key, '1', 'EX', 300)` — the value itself is irrelevant; existence is the signal  |
| Verification                | `cache.del(key)` — returns 1 if consumed, 0 if absent                                       |
| Failure                     | `UnauthorizedException` (HTTP 401) when the count is 0                                      |

**Atomic check-and-consume.** Using `DEL` and inspecting the returned count is a single round-trip and intrinsically race-free. A `GET` followed by `DEL` would let two concurrent callbacks with the same state both pass the existence check before either deletes — a TOCTOU window. `DEL` collapses both operations into one.

**Why no env var for the TTL.** Five minutes is comfortably longer than any realistic round-trip through a consent screen, and short enough to limit the replay window. Treating it as configuration would invite drift; treating it as a security parameter keeps it pinned.

See [`docs/cache.md`](cache.md) for the cache service itself.

---

## Token exchange

After the state check passes the service:

1. `POST`s to the provider's `tokenUrl` with the standard `authorization_code` grant (client id/secret, code, redirect URI).
2. Calls `revoke` on the provider's `revokeUrl` to invalidate the short-lived access token immediately — the backend only needs the ID token to identify the user.
3. Fetches the provider's JWKS, finds the signing key matching the ID token's `kid` header, imports it via `crypto.subtle.importKey`, and verifies the JWT with `jose.jwtVerify`.
4. Reads `sub`, `email`, `email_verified`, `name`, `picture` from the payload. Refuses the login if `email_verified` is false.

---

## User provisioning

Three cases are handled, all keyed on the decoded `sub` + provider:

| Existing record(s)                              | Action                                                  |
| ----------------------------------------------- | ------------------------------------------------------- |
| No `OAuthCredential`, no `User`                 | Create both, link, issue JWT                            |
| No `OAuthCredential`, `User` with matching email| Create `OAuthCredential` linked to that `User`          |
| `OAuthCredential` already linked                | Update `User` fields (name, picture, email), issue JWT  |

Models are in [`schema.prisma`](../packages/backend/prisma/schema.prisma) — `OAuthCredential` has a `(provider, sub)` unique index and a one-to-one relation to `User` with cascade delete.

---

## Configuration

Required env vars in `secrets/backend/.env`:

| Variable               | Description                          |
| ---------------------- | ------------------------------------ |
| `GOOGLE_CLIENT_ID`     | Google OAuth2 client ID              |
| `GOOGLE_CLIENT_SECRET` | Google OAuth2 client secret          |
| `CACHE_URL`            | Required — state lives in the cache  |
| `JWT_SECRET`           | Signing secret for issued JWTs       |
| `JWT_DURATION`         | JWT lifetime ([ms](https://github.com/vercel/ms) format) |
