---
sidebar_position: 2
sidebar_custom_props:
  icon: auth
---

# Authentication

Every request carries `Authorization: Bearer <token>`. How you obtain that token depends on who is calling.

| Caller | Token | Who authenticates |
| --- | --- | --- |
| **Partner / PMS server** | Per-company API token (or OAuth 2.0 for multi-company partners) | Your server |
| **Tenant app** | Phone + one-time password (OTP) | Your app's end user |

## Partner API tokens

API tokens authenticate server-to-server requests. Each token is scoped to a single company.

### Create a token

You can self-serve in the KISS web admin portal:

1. Sign in to the [KISS Dashboard](https://app.keepitsimplestorage.com) and open **Company Settings**.
2. Click the **API** tab. (This needs company admin permission; if you do not see it, ask KISS to adjust your user or issue the token for you.)
3. Name the token (for example `acme-pms-integration`), select the scopes the integration needs, and create it.
4. **Copy the token immediately.** It is shown once; store it in a secrets manager.

:::caution
API tokens grant access to your company's data. Never expose them in client-side code, public repos, or logs. Revoke a token from the same **API** tab if it is ever exposed; revocation takes effect immediately.
:::

For PMS integrations, scope the token to `pms:read` and `pms:write`. See the [PMS integration guide](/guides/pms/quickstart) for the end-to-end flow.

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
Every write accepts an `Idempotency-Key` header: any opaque string up to 255 characters (a UUID works well). The server stores the request hash and response for 24 hours, so retrying the same key with the same payload returns the cached response without a second write. Retrying the same key with a *different* payload returns `409 Conflict`. Use a fresh value per logical operation; reuse it only when retrying that operation.
:::

### Multi-company partners (OAuth 2.0)

A partner that serves many companies (a PMS vendor with dozens of operators, for example) uses OAuth 2.0 rather than a per-company token, with cross-tenant scopes and refresh tokens. If that is you, contact KISS to set up an OAuth client. All flavors accept the same scopes and hit the same routes.

### Errors

| Status | Meaning |
| --- | --- |
| `401 Unauthorized` | Missing or invalid token |
| `403 Forbidden` | Token is valid but lacks the required scope |

## Tenant sign-in (mobile apps)

Tenant apps authenticate the end user with a **phone number plus a one-time password**. The app sends the tenant's mobile number, the tenant receives a 6-digit SMS code, the app submits that code, and KISS returns a Bearer token the app uses for subsequent requests.

A few things worth knowing as you build:

- **Multiple accounts.** If a phone number is linked to more than one tenant account (for example, the same person renting at two facilities), KISS returns the list of accounts instead of a token. Prompt the tenant to choose, then complete sign-in for the selected account.
- **No refresh tokens.** Tenant tokens expire. When a request returns `401`, send the tenant back through OTP sign-in to get a new token; cache the token for the session in between.
- **Keep tenant tokens on the device.** They should never be sent to your backend; your server uses partner API tokens for server-side work.

:::note Endpoints are finalizing under Mobile Migration
The exact tenant sign-in and `GET /access` paths and payloads are converging onto `/api/v2` now. For current request and response shapes, see the [API Reference](https://app.keepitsimplestorage.com/docs/api) or the [Mobile app integration guide](/guides/white-label/quickstart). The flow above is stable; the URLs are not yet frozen here to avoid drift.
:::

## Rate Limits

KISS rate-limits abusive traffic and returns `429 Too Many Requests` with a `Retry-After` header. Design clients for retries: exponential backoff with jitter is the expected behavior.

| Endpoint group | Notes |
| --- | --- |
| Tenant OTP sign-in | Limited per phone number |
| `PATCH /units` (bulk), `PUT/DELETE /units/{unit_id}/tenancy`, `PATCH /units/{unit_id}` | Per company |

:::note Exact limits are a product decision in progress
Treat `429` with a `Retry-After` header as a recoverable state. Final numbers will be published in the [API Reference](https://app.keepitsimplestorage.com/docs/api) when locked.
:::

## Best practices

- **Store partner tokens securely.** Environment variables or a secrets manager, never source code. Use separate tokens per environment.
- **Cache the tenant token for the session.** Do not re-authenticate on every call.
- **Handle `401` gracefully.** A partner token may be revoked; a tenant token may have expired. Re-authenticate accordingly.
- **Keep tenant tokens on the device.** Server-side operations use partner API tokens.
