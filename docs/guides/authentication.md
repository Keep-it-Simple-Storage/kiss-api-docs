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

## Tenant sign-in (mobile apps)

Tenant apps sign the end user in with a phone number and a one-time SMS code, in two calls.

**1. Request a code.** Send the tenant's country code and phone number; KISS texts a 6-digit code.

```bash
curl -X POST https://api-app.keepitsimplestorage.com/api/v2/auth/otp \
  -H "Content-Type: application/json" \
  -d '{"country_code": "1", "phone_number": "5551234567"}'
```

**2. Exchange the code for a token.** Submit the phone and code with `grant: otp`. KISS returns a Bearer token and the signed-in user.

```bash
curl -X POST https://api-app.keepitsimplestorage.com/api/v2/auth/tokens \
  -H "Content-Type: application/json" \
  -d '{"grant": "otp", "country_code": "1", "phone_number": "5551234567", "otp": "123456"}'
```

The app stores that token and sends it as `Authorization: Bearer <token>` on every later call, starting with `GET /access`. To resolve the current user and company on relaunch, call `GET /auth/me`; to sign out, call `DELETE /auth/tokens/current`.

A few things worth knowing as you build:

- **Multiple accounts.** If a phone is linked to more than one tenant account (the same person renting at two facilities), the token call returns a `duplicated_tenants` list instead of a token, so the app can prompt the tenant to choose.
- **No refresh tokens.** Tenant tokens expire. On a `401`, send the tenant back through the two calls above; cache the token for the session in between.
- **Keep tenant tokens on the device.** They should never be sent to your backend; your server uses partner API tokens for server-side work.

:::note Manager sign-in uses the same token endpoint
Managers authenticate with `grant: password` (email plus password) on the same `POST /auth/tokens` call. Tenant apps use `grant: otp`.
:::

## Rate limits

Some requests are subject to rate limits. See **[Rate limits](/guides/rate-limits)** for how throttling works (`429` responses) and what is throttled today.

## Best practices

- **Store partner tokens securely.** Environment variables or a secrets manager, never source code. Use separate tokens per environment.
- **Cache the tenant token for the session.** Do not re-authenticate on every call.
- **Handle `401` gracefully.** A partner token may be revoked; a tenant token may have expired. Re-authenticate accordingly.
- **Keep tenant tokens on the device.** Server-side operations use partner API tokens.
