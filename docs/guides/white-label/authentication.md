---
sidebar_position: 2
---

# Authentication

KISS uses two authentication methods depending on your integration type:

| Integration | Auth method | Who authenticates |
|---|---|---|
| **PMS Push** | API token (Bearer) | Your server |
| **White-Label App** | Phone + OTP | Your app's end user (tenant) |

---

## API Tokens (PMS Integrators)

API tokens authenticate server-to-server requests from your PMS to KISS. Each token is scoped to a single company.

### Generate a token

1. Log in to the [KISS Dashboard](https://app.keepitsimplestorage.com)
2. Navigate to your **Company** page from the sidebar
3. Click the **API** tab
4. Enter a name for your token (e.g., `production-sync`, `staging`)
5. Click **Create a new token**
6. **Copy the token immediately** — it won't be shown again

:::caution
API tokens grant full access to your company's data. Store them securely and never expose them in client-side code, public repos, or logs.
:::

### Use the token

Include the token in the `Authorization` header of every request:

```bash
curl -X POST https://api.keepitsimplestorage.com/api/v1/pms/units/sync \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"units": [...]}'
```

### Manage tokens

You can view all active tokens in the **API** tab of your Company page. Each token shows its name and creation date. To revoke a token, click the delete icon next to it — this takes effect immediately.

You can create multiple tokens (e.g., separate tokens for production and staging environments).

### Error responses

| Status | Meaning |
|---|---|
| `401 Unauthorized` | Missing or invalid token |

```json
{
  "message": "Unauthorized."
}
```

---

## Tenant OTP Flow (White-Label Apps)

White-label app integrators authenticate tenants using a phone number + OTP (one-time password) flow. The tenant receives an SMS, verifies the code, and your app receives a Bearer token.

### How it works

1. App calls `POST /auth/phone` with tenant's phone number
2. Tenant receives a 6-digit OTP via SMS
3. App calls `POST /auth/verify-otp` with the OTP
4. API returns a Bearer token
5. App uses the token for all subsequent requests

### Step 1: Request OTP

```bash
curl -X POST https://api.keepitsimplestorage.com/api/v1/auth/phone \
  -H "Content-Type: application/json" \
  -d '{
    "country_code": "1",
    "phone_number": "5551234567"
  }'
```

| Field | Type | Required | Description |
|---|---|---|---|
| `country_code` | string | Yes | Country calling code without `+` (1-3 digits) |
| `phone_number` | string | Yes | Phone number without country code (7-15 digits) |

**Success — 200 OK:**

```json
{
  "message": "OTP sent successfully."
}
```

**Error — 422:** The phone number is not associated with any tenant in KISS.

```json
{
  "message": "A tenant with the submitted phone number does not exist."
}
```

:::tip
OTPs expire after 5 minutes. A new OTP cannot be requested until the resend cooldown (30 seconds) has passed.
:::

### Step 2: Verify OTP

```bash
curl -X POST https://api.keepitsimplestorage.com/api/v1/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{
    "country_code": "1",
    "phone_number": "5551234567",
    "otp": "482910"
  }'
```

| Field | Type | Required | Description |
|---|---|---|---|
| `country_code` | string | Yes | Country calling code without `+` |
| `phone_number` | string | Yes | Phone number |
| `otp` | string | Yes | 6-digit code received via SMS |
| `tenant_id` | string | No | Required on second call when multiple accounts exist |

**Success — 200 OK (single account):**

```json
{
  "message": "Login successful.",
  "data": {
    "token": "1|abc123def456...",
    "user": {
      "id": "usr_abc123",
      "name": "Jane Smith",
      "email": null,
      "phone": "+15551234567"
    }
  }
}
```

### Handling multiple accounts

If a phone number is linked to multiple tenant accounts (e.g., a tenant renting at two locations), the API returns `token: null` and a list of accounts:

```json
{
  "message": "Multiple accounts found.",
  "data": {
    "token": null,
    "accounts": [
      {
        "tenant_id": "01HQA123456789ABCDEFGHJKMNPQRS",
        "name": "Jane Smith",
        "location": "Downtown Storage",
        "company": "ABC Storage Co."
      },
      {
        "tenant_id": "01HQB234567890BCDEFGHJKMNPQRST",
        "name": "Jane Smith",
        "location": "Uptown Storage",
        "company": "ABC Storage Co."
      }
    ]
  }
}
```

Prompt the tenant to select an account, then call the same endpoint again with the selected `tenant_id`:

```bash
curl -X POST https://api.keepitsimplestorage.com/api/v1/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{
    "country_code": "1",
    "phone_number": "5551234567",
    "otp": "482910",
    "tenant_id": "01HQA123456789ABCDEFGHJKMNPQRS"
  }'
```

This returns the standard success response with a token.

:::note
The OTP is **not** consumed on the first call when multiple accounts are returned — it stays valid so your app can call again with the selected `tenant_id`.
:::

### Step 3: Use the token

Include the Bearer token in all subsequent API requests:

```bash
curl https://api.keepitsimplestorage.com/api/v1/tenant/access \
  -H "Authorization: Bearer 1|abc123def456..."
```

### Token expiration

Tenant Bearer tokens have a limited lifetime. When a token expires, the API returns `401 Unauthorized`. There is no refresh token mechanism. The tenant must re-authenticate via the OTP flow to get a new token.

:::tip
Cache the token for the duration of the session and handle 401 responses by redirecting the tenant back to the OTP login screen.
:::

### Error responses

| Status | Meaning |
|---|---|
| `401 Unauthorized` | Missing, invalid, or expired token |
| `403 Forbidden` | Token is valid but lacks permission for this resource (e.g., accessing a unit that doesn't belong to this tenant) |
| `422 Unprocessable` | Invalid or expired OTP |
| `429 Too Many Requests` | Rate limited. Retry after 60 seconds. |

```json
{
  "message": "The OTP code is invalid or has expired."
}
```

---

## Rate Limits

| Endpoint | Limit | Window | Notes |
|---|---|---|---|
| `POST /auth/phone` | 5 requests | 60 seconds | Per phone number |
| `POST /auth/verify-otp` | 5 attempts | 60 seconds | Per phone number |

When rate limited, the API returns `429 Too Many Requests`:

```json
{
  "message": "Too many attempts. Please try again in 60 seconds."
}
```

---

## Best Practices

- **Store tokens securely.** API tokens belong in environment variables or a secrets manager, never in source code.
- **Use separate tokens per environment.** Create distinct tokens for production, staging, and development.
- **Cache the tenant Bearer token.** After OTP verification, cache the token in the app for the session. Don't re-authenticate on every API call.
- **Handle 401 gracefully.** If a request returns 401, the token has expired or been revoked. Prompt the tenant to re-authenticate via OTP.
- **Never send tokens to your backend.** Tenant Bearer tokens should stay on the device. Your server should use API tokens for server-side operations.
