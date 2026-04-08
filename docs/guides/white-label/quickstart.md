---
sidebar_position: 1
---

# Quickstart: White-Label App Integration

This guide walks you from zero to your first successful API call. By the end, you'll have authenticated a tenant, retrieved their unit access, and reported a lock event — the core loop of a white-label app integration.

**Time to complete:** ~15 minutes

## Prerequisites

- A tenant phone number registered in KISS (ask your KISS contact for a test tenant)
- A tool to make HTTP requests (curl, Postman, or your app)

## Base URL

```
https://api.keepitsimplestorage.com/api/v1
```

---

## Step 1: Authenticate a tenant

Tenants authenticate with their phone number via OTP. Send the phone number to request a code:

```bash
curl -X POST https://api.keepitsimplestorage.com/api/v1/auth/phone \
  -H "Content-Type: application/json" \
  -d '{
    "country_code": "1",
    "phone_number": "5551234567"
  }'
```

**Response:**

```json
{
  "message": "OTP sent successfully."
}
```

The tenant receives a 6-digit code via SMS. Verify it:

```bash
curl -X POST https://api.keepitsimplestorage.com/api/v1/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{
    "country_code": "1",
    "phone_number": "5551234567",
    "otp": "482910"
  }'
```

**Response:**

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

Save the `token` — you'll use it for all subsequent requests.

:::tip
If the phone number is linked to multiple accounts, the API returns a list of accounts instead of a token. See the [Authentication guide](./authentication.md#handling-multiple-accounts) for how to handle this.
:::

---

## Step 2: Retrieve tenant access

This is the core endpoint. It returns everything your app needs in a single call: the tenant's units, their access status, NFC keys, and entry points.

```bash
curl https://api.keepitsimplestorage.com/api/v1/tenant/access \
  -H "Authorization: Bearer 1|abc123def456..."
```

**Response:**

```json
{
  "message": "Request successful.",
  "data": {
    "tenant_id": "01HQ0123456789ABCDEFGHJKMNPQRS",
    "synced_at": "2026-02-13T14:30:00Z",
    "units": [
      {
        "unit_id": "01HQ1234567890ABCDEFGHJKMNPQRS",
        "unit_name": "B204",
        "location_id": "01HQ9876543210ZYXWVUTSRQPONML",
        "grant_type": "tenant_primary",
        "state": "tenant_permitted",
        "reason": "active",
        "access": true,
        "has_unit_lock": true,
        "has_entry_point": true
      }
    ],
    "entry_points": [
      {
        "entry_point_id": "01HQ4567890123DEFGHJKMNPQRSTUV",
        "name": "Main Gate",
        "zone_id": "01HQ5678901234EFGHJKMNPQRSTUVW",
        "location_id": "01HQ9876543210ZYXWVUTSRQPONML",
        "would_have_access": true,
        "access": true
      }
    ]
  }
}
```

**Key fields to use in your app:**

| Field | What it means |
|---|---|
| `access` | **The final access decision.** `true` = tenant can unlock. |
| `state` | Why access was permitted or denied (e.g., `tenant_permitted`, `tenant_denied`) |
| `reason` | Specific reason (e.g., `active`, `delinquent`, `pms_lockout`) |
| `has_unit_lock` | Whether this unit has a physical NFC lock |
| `has_entry_point` | Whether this unit's zone has gates/doors |

:::note
Call this endpoint on app launch and on pull-to-refresh. Cache the response for offline NFC access.
:::

---

## Step 3: Report lock activity

After every NFC tap attempt (successful or failed), report it back to KISS:

```bash
curl -X POST https://api.keepitsimplestorage.com/api/v1/locks/LOCK_ID/logs \
  -H "Authorization: Bearer 1|abc123def456..." \
  -H "Content-Type: application/json" \
  -d '{
    "key": "lock.open_successful"
  }'
```

**Response:**

```json
{
  "message": "Log created successfully.",
  "data": {
    "id": "log_xyz789",
    "key": "lock.open_successful",
    "happened_at": "2026-02-13T14:35:22Z",
    "created_at": "2026-02-13T14:35:22Z"
  }
}
```

**Available log event keys:**

| Key | When to use |
|---|---|
| `lock.open_successful` | Lock opened successfully |
| `lock.open_failure` | Lock failed to open |
| `lock.open_blocked` | Lock open was blocked (access denied) |
| `lock.close_successful` | Lock closed successfully |
| `lock.close_successful_confirmed` | Lock close confirmed |
| `lock.close_failure` | Lock failed to close (include `reason` field) |
| `lock.close_blocked` | Lock close was blocked |

Entry points (gates, doors) work the same way — use `POST /entry-points/{entry_point_id}/logs` with `entry_point.*` event keys.

---

## What's next

- [Authentication guide](./authentication.md) — token expiration, rate limits, best practices
- [Concepts](../concepts.md) — understand units, tenants, access states, and the KISS data model
- [API Reference](/docs/api-reference/kiss-api) — full endpoint reference
- [Error handling](../error-handling.md) — standard error format and troubleshooting
- Flutter SDK setup — NFC lock interaction layer (coming soon)
