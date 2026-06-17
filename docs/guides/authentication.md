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

### Multi-company partners

A partner that serves many companies (a PMS vendor with dozens of operators, for example) still authenticates with a per-company token: you hold one token per company and send the matching one on each request. There is no cross-company token or refresh-token flow today. If you are integrating at this scale, contact KISS so we can help you provision and manage tokens across your operators. All tokens accept the same scopes and hit the same routes.

:::info Coming soon (KEEP-579)
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

:::info Coming soon (KEEP-958)
This partner-brokered token mint (your backend exchanges its company token plus a tenant identifier for a tenant access token) is being built so Back Office partners never have to stack a second login on top of their own. Until it ships, your tenant auth is set up directly with your KISS contact during onboarding.
:::

## Rate limits

Some requests are subject to rate limits. See **[Rate limits](/guides/rate-limits)** for how throttling works (`429` responses) and what is throttled today.

## Best practices

- **Store partner tokens securely.** Environment variables or a secrets manager, never source code. Use separate tokens per environment.
- **Cache the tenant token for the session.** Do not re-authenticate on every call.
- **Handle `401` gracefully.** A partner token may be revoked; a tenant token may have expired. Re-authenticate accordingly.
- **Keep tenant tokens on the device.** Server-side operations use partner API tokens.
