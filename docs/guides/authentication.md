---
sidebar_position: 2
sidebar_custom_props:
  icon: auth
---

# Authentication

Every request carries `Authorization: Bearer <token>`. How you obtain that token depends on who is calling.

| Caller | Token | Who authenticates |
| --- | --- | --- |
| **Partner / PMS server** | Per-company API token | Your server |
| **Tenant (your app's user)** | A short-lived KISS access token your backend obtains for them | Your app's own login, then your backend |

## Partner API tokens

API tokens authenticate server-to-server requests. Each token is scoped to a single company, and optionally to specific locations within that company.

### Create a token

You can self-serve in the KISS web admin portal:

1. Sign in to the [KISS Dashboard](https://app.keepitsimplestorage.com) and open **Company Settings**.
2. Click the **API** tab. (This needs company admin permission; if you do not see it, ask KISS to adjust your user or issue the token for you.)
3. Name the token (for example `acme-pms-integration`) and create it. A new token carries the unit and log scopes by default; the tenant scopes are opt-in, so open **Customize permissions** and tick the ones you need — `Tenants Read`, `Tenants Write`, or `Tenant Sign-In`. If your company has more than one location, you can also limit the token to specific ones under **Limit to locations**.
4. **Copy the token immediately.** It is shown once, in a dialog you cannot reopen, and it is not stored anywhere we can read it back — not even by KISS support. If you lose it, create a new token and revoke the old one.

### Location-scoped tokens

By default a token reaches **every location** in its company. You can instead bind it to one or more specific locations — useful when you want a key that touches your test store and cannot reach production.

A location-scoped token behaves as if the other locations do not exist:

| Operation | Out-of-scope location |
| --- | --- |
| `GET /units` and other lists | Filtered out of results |
| `GET /units/{unit_id}` | `404 Not Found` |
| Single-unit writes addressing a unit | `404 Not Found` |
| Single-unit writes naming a location (`location_id`, `external_location_code`) | `422 Unprocessable Entity` |
| Bulk `PATCH /units` | Per-item error in `data.errors`, see below |

Three things worth knowing:

- **Unscoped tokens are unchanged.** A token with no location binding reaches the whole company exactly as before.
- **A token bound to exactly one location can omit the location entirely** on writes — the API infers it, the same way it does for a single-location company. See the [PMS integration guide](/guides/pms/quickstart#identifiers-and-locations).
- **The bulk sync does not fail the whole request.** `PATCH /units` resolves a location per item, so an item pointing at a location your token cannot reach is rejected on its own and reported in `data.errors`, while the rest of the batch applies. The request still answers `200` unless *every* item failed, in which case it answers `422` with the same body. Check `data.failed` and `data.errors` rather than the status code alone.

:::caution A bulk scoping mistake still answers `200`
If you point a location-scoped key at a roster covering several stores, the out-of-scope rows are rejected while the rest apply, and the response still reads `200`. The rejections are reported, not swallowed: every one appears in `data.errors`. It is the status code that will not tell you. After each sync check `data.failed`, and read `data.errors` when it is non-zero. The counts always satisfy `data.total == data.created + data.updated + data.failed`.
:::

:::tip Isolating a test store
If you run a test facility alongside real ones under the same company, issue a separate token bound only to the test location. Without that binding, any unscoped token carrying a write scope (`units:write` or its `pms:write` alias) can write to production, regardless of how it is named.
:::

:::note No account yet?
If you do not have a KISS account, email [help@keepitsimplestorage.com](mailto:help@keepitsimplestorage.com) with your company details and why you want to integrate, and we will set you up with a sandbox company to build against.
:::

:::caution
API tokens grant access to your company's data. Never expose them in client-side code, public repos, or logs. Revoke a token from the same **API** tab if it is ever exposed; revocation takes effect immediately.
:::

For PMS integrations, scope the token to `pms:read` and `pms:write`. See the [PMS integration guide](/guides/pms/quickstart) for the end-to-end flow.

Add `tenants:read` if you need [`GET /tenants`](/reference/v-2-tenants-index) to reconcile tenant records before writing. It is separate from the unit scopes because that endpoint returns contact phone numbers, so no token reaches it unless you asked for it. `pms:read` and `units:read` do not imply it, and tokens issued before it existed do not carry it. Create a new token, or ask KISS to add it to yours.

Add `tenants:write` if you need [`PATCH /tenants/{tenant_id}`](/reference/v-2-tenants-patch) to update a tenant's name or phone number. It is a separate scope from `tenants:read`, `units:write`, and `pms:write`: none of them imply it, so a token that already syncs units cannot write to a tenant until you add it explicitly.

Add `tenants:auth` if your app signs its own users in and needs a KISS session for them — see [Signing in your tenants](#signing-in-your-tenants). It is separate from every other scope for the same reason: it mints a token that acts as one of your tenants.

### Use the token

Include it in the `Authorization` header of every request:

```bash
# Generate one key per logical write. Reuse the same value when retrying.
IDEMPOTENCY_KEY=$(uuidgen)

curl -X PATCH https://api-app.keepitsimplestorage.com/api/v2/units \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
  -d '{"units": [...]}'
```

:::tip Idempotency-Key
Every write accepts an `Idempotency-Key` header: any opaque string up to 255 characters (a UUID works well). The server stores the request hash and response of **successful** writes for 24 hours, so retrying the same key with the same payload returns the cached response without a second write. Failed and timed-out writes are not stored, so a retry re-runs them rather than replaying. Retrying the same key with a *different* payload returns `409 Conflict`. Use a fresh value per logical operation; reuse it only when retrying that operation.
:::

### Multi-company partners

A partner that serves many companies (a PMS vendor with dozens of operators, for example) still authenticates with a per-company token: you hold one token per company and send the matching one on each request. There is no cross-company token or refresh-token flow today. If you are integrating at this scale, contact KISS so we can help you provision and manage tokens across your operators. All tokens accept the same scopes and hit the same routes.

:::info Coming soon
OAuth 2.0 for multi-company partners (cross-company scopes and refresh tokens) is planned. Until it ships, use one per-company token each as above.
:::

### Errors

| Status | Meaning |
| --- | --- |
| `401 Unauthorized` | Missing or invalid token |
| `403 Forbidden` | Token is valid but lacks the required scope |

## Signing in your tenants

Your tenants sign in through **your own app's authentication**. KISS does not add a second login. Instead, your backend turns the user it has already authenticated into a KISS session: holding your company API token, it exchanges the tenant's id in your own system for a short-lived, tenant-scoped KISS access token, and hands that to your app. The app then sends it as `Authorization: Bearer <token>` on `GET /access` and passes it to the lock SDK.

Because the token is minted server to server for a tenant your system already knows, the user never sees a KISS login screen, and you keep full control of the experience in your own app.

### Mint a tenant token

`POST /auth/tenant-tokens`, authenticated with your company API token carrying the `tenants:auth` scope.

```bash
curl -X POST https://api-app.keepitsimplestorage.com/api/v2/auth/tenant-tokens \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"external_tenant_id": "YOUR-TENANT-ID"}'
```

`external_tenant_id` is the id **your** system holds for that tenant — the same value `GET /tenants` returns and `PATCH /tenants/{tenant_id}` writes. The response carries the token, the moment it expires, and the tenant it belongs to:

```json
{
  "message": "User logged in successfully.",
  "data": {
    "token": "1|xxxxxxxx",
    "expires_at": "2026-09-18T15:48:31.000000Z",
    "user": { "id": "01KTSC4X57H4M49E661CW41BXE", "type": "tenant" }
  },
  "meta": {}
}
```

Five things to build against:

- **The token is short-lived** (15 minutes) and carries the tenant's own authority, nothing of yours. Mint one when your app needs a KISS session and re-mint when it expires; do not hold one for the life of a user's session in your app.
- **`tenants:auth` is a separate scope.** Neither `tenants:read`, `tenants:write`, nor the unit scopes imply it, so a token that already syncs units cannot sign a tenant in until you add it explicitly. Tokens issued before it existed do not carry it — create a new one, or ask KISS to add it.
- **The tenant must already exist in KISS and carry your id.** An id your token cannot reach — another company, a location outside a location-scoped token, an archived account, or an id KISS has never seen — answers `404`. Attach your id to an account that has none with [`PATCH /tenants/{tenant_id}`](/reference/v-2-tenants-patch) first.
- **`409 tenant_profile_ambiguous`** means two separate tenant accounts your token reaches carry that id, so there is no single person to sign in. Reconcile the duplicate ids on your side, or ask your KISS contact to merge the records. A tenant renting at several of your locations under one id is unaffected and signs in normally.
- **What the session reaches.** It is the tenant's own session for reading access and opening locks: `GET /access`, their own units and entry points, and the log endpoints. It is deliberately *not* allowed to make a payment (`POST /units/{unit_id}/payments` answers `403`), cannot switch to another tenant account, and reaches nothing on the partner or manager surface.

| Status | Meaning |
| --- | --- |
| `403 Forbidden` | The token lacks the `tenants:auth` scope |
| `404 Not Found` | No tenant with that `external_tenant_id` at a location your token reaches |
| `409 Conflict` | That id answers for more than one tenant your token can reach |

## Rate limits

Some requests are subject to rate limits. See **[Rate limits](/guides/rate-limits)** for how throttling works (`429` responses) and what is throttled today.

## Best practices

- **Store partner tokens securely.** Environment variables or a secrets manager, never source code. Use separate tokens per environment, and scope a test token to your test location so it cannot reach production.
- **Cache the tenant token until it expires,** then mint a fresh one. Do not re-mint on every call.
- **Keep tenant tokens on the device.** Server-side operations use partner API tokens.
