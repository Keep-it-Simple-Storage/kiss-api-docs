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
3. Name the token (for example `acme-pms-integration`), select the scopes the integration needs, and create it. If your company has more than one location, you can also limit the token to specific ones under **Limit to locations**.
4. **Copy the token immediately.** It is shown once; store it in a secrets manager.

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

Add `tenants:write` if you need [`PATCH /tenants/{tenant_id}`](/reference/v-2-tenants-patch) to correct a name or phone number your system got wrong. It is a separate scope from `tenants:read`, `units:write`, and `pms:write`: none of them imply it, so a token that already syncs units cannot correct a tenant until you add it explicitly.

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

Your tenants sign in through **your own app's authentication**. KISS does not add a second login. Instead, your backend turns the user it has already authenticated into a KISS session: holding your company API token, it requests a short-lived, tenant-scoped KISS access token for that tenant, and hands it to your app. The app then sends that token as `Authorization: Bearer <token>` on `GET /access` and the lock SDK.

Because the token is minted server to server from a tenant your system already knows, the user never sees a KISS login screen, and you keep full control of the experience in your own app.

:::info Coming soon
This partner-brokered token mint (your backend exchanges its company token plus a tenant identifier for a tenant access token) is being built so Back Office partners never have to stack a second login on top of their own. Until it ships, your tenant auth is set up directly with your KISS contact during onboarding.
:::

## Rate limits

Some requests are subject to rate limits. See **[Rate limits](/guides/rate-limits)** for how throttling works (`429` responses) and what is throttled today.

## Best practices

- **Store partner tokens securely.** Environment variables or a secrets manager, never source code. Use separate tokens per environment, and scope a test token to your test location so it cannot reach production.
- **Cache the tenant token for the session.** Do not re-authenticate on every call.
- **Handle `401` gracefully.** A partner token may be revoked; a tenant token may have expired. Re-authenticate accordingly.
- **Keep tenant tokens on the device.** Server-side operations use partner API tokens.
