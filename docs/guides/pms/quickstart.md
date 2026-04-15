---
sidebar_position: 1
---

# Quickstart: PMS Push Integration

This guide walks you from zero to successfully syncing unit data into KISS. By the end, you'll have synced a unit, moved in a tenant, and moved them out — all through a single endpoint.

**Time to complete:** ~10 minutes

## Prerequisites

- An API token generated from the KISS dashboard (see [Authentication guide](../white-label/authentication.md#generate-a-token))
- A mapping of your PMS unit and tenant identifiers to sync into KISS
- A tool to make HTTP requests (curl, Postman, or your integration code)

## Base URL

```
https://api.keepitsimplestorage.com/api/v1
```

---

## Step 1: Sync your first unit

The sync endpoint is the only endpoint you need. It accepts an array of units with their current state — KISS reconciles everything.

```bash
curl -X POST https://api.keepitsimplestorage.com/api/v1/pms/units/sync \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "units": [
      {
        "crm_unit_id": "PMS-U-1001",
        "name": "B204",
        "occupied": true,
        "tenant": {
          "pms_tenant_id": "PMS-T-5001",
          "first_name": "Jane",
          "last_name": "Smith",
          "phone": "+15551234567",
          "email": "jane.smith@email.com"
        },
        "move_in_date": "2024-03-01",
        "balance_due": 0.00,
        "paid_through_date": "2026-04-01",
        "pms_lockout": false,
        "pms_lock_exempt": false,
        "pms_auction": false,
        "pms_unrentable": false
      }
    ]
  }'
```

**Response:**

```json
{
  "message": "Sync completed.",
  "data": {
    "synced_at": "2026-04-07T14:30:00Z",
    "total": 1,
    "created": 1,
    "updated": 0,
    "unchanged": 0,
    "errors": []
  }
}
```

That's it. The unit and tenant now exist in KISS. Post the same payload again — you'll get `updated: 0, unchanged: 1`. The endpoint is fully idempotent.

:::tip
Units are matched by `crm_unit_id` within your company. Tenants are matched by `pms_tenant_id`. If no match exists, KISS creates them automatically.
:::

---

## Step 2: Move in a tenant

Moving in a tenant is just syncing with `occupied: true` and tenant info. There's no separate move-in endpoint.

```bash
curl -X POST https://api.keepitsimplestorage.com/api/v1/pms/units/sync \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "units": [
      {
        "crm_unit_id": "PMS-U-1002",
        "name": "C101",
        "occupied": true,
        "tenant": {
          "pms_tenant_id": "PMS-T-5002",
          "first_name": "Bob",
          "last_name": "Jones",
          "phone": "+15559876543"
        },
        "move_in_date": "2026-04-07",
        "balance_due": 0.00,
        "paid_through_date": "2026-05-01",
        "pms_lockout": false,
        "pms_lock_exempt": false,
        "pms_auction": false,
        "pms_unrentable": false
      }
    ]
  }'
```

**Response:**

```json
{
  "message": "Sync completed.",
  "data": {
    "synced_at": "2026-04-07T14:31:00Z",
    "total": 1,
    "created": 1,
    "updated": 0,
    "unchanged": 0,
    "errors": []
  }
}
```

:::info Required fields for move-in
When `occupied` is `true`, you must include `tenant` (with `pms_tenant_id`, `first_name`, `last_name`) and `move_in_date`. The `phone` field is required for tenants who need app access.
:::

---

## Step 3: Move out a tenant

Moving out is syncing with `occupied: false`. KISS automatically resets all tenant-related facts to defaults.

```bash
curl -X POST https://api.keepitsimplestorage.com/api/v1/pms/units/sync \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "units": [
      {
        "crm_unit_id": "PMS-U-1002",
        "name": "C101",
        "occupied": false
      }
    ]
  }'
```

**Response:**

```json
{
  "message": "Sync completed.",
  "data": {
    "synced_at": "2026-04-07T14:32:00Z",
    "total": 1,
    "created": 0,
    "updated": 1,
    "unchanged": 0,
    "errors": []
  }
}
```

When `occupied: false` is sent, KISS resets:

| Field | Reset value |
|---|---|
| `pms_tenant_id` | null |
| `move_in_date` | null |
| `balance_due` | 0.00 |
| `paid_through_date` | null |
| `pms_lockout` | false |
| `pms_lock_exempt` | false |
| `pms_auction` | false |
| `pms_unrentable` | false |

Fields that are **not** reset: `crm_unit_id`, `name`, lock associations, and access history.

---

## Step 4: Bulk sync

In production, you'll sync all your units at once:

```bash
curl -X POST https://api.keepitsimplestorage.com/api/v1/pms/units/sync \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "units": [
      {
        "crm_unit_id": "PMS-U-1001",
        "name": "B204",
        "occupied": true,
        "tenant": { "pms_tenant_id": "PMS-T-5001", "first_name": "Jane", "last_name": "Smith", "phone": "+15551234567" },
        "move_in_date": "2024-03-01",
        "balance_due": 0.00,
        "paid_through_date": "2026-04-01",
        "pms_lockout": false,
        "pms_lock_exempt": false,
        "pms_auction": false,
        "pms_unrentable": false
      },
      {
        "crm_unit_id": "PMS-U-1002",
        "name": "C101",
        "occupied": false
      },
      {
        "crm_unit_id": "PMS-U-1003",
        "name": "A305",
        "occupied": true,
        "tenant": { "pms_tenant_id": "PMS-T-5003", "first_name": "Alice", "last_name": "Wong", "phone": "+15555551234" },
        "move_in_date": "2026-01-15",
        "balance_due": 150.00,
        "paid_through_date": "2026-01-10",
        "pms_lockout": true,
        "pms_lock_exempt": false,
        "pms_auction": false,
        "pms_unrentable": false
      }
    ]
  }'
```

**Response:**

```json
{
  "message": "Sync completed.",
  "data": {
    "synced_at": "2026-04-07T14:33:00Z",
    "total": 3,
    "created": 1,
    "updated": 1,
    "unchanged": 1,
    "errors": []
  }
}
```

Units not included in the payload are **not** affected — this is an upsert, not a full replace.

---

## Typical production setup

1. Generate an API token from the KISS dashboard
2. Schedule a periodic sync (e.g., every 15 minutes)
3. Call `POST /pms/units/sync` with all units and their current state
4. KISS updates facts, runs evaluation, updates access states
5. Tenants see updated access in their app on next refresh

:::note
After syncing, KISS automatically runs its access evaluation engine on updated units. Tenants with a white-label app will see the changes on their next `GET /tenant/access` call.
:::

---

## What's next

- [Authentication guide](../white-label/authentication.md) — token management and rate limits
- [Concepts](../concepts.md) — understand the facts-based data model and access states
- [API Reference](/docs/api-reference/kiss-api) — full endpoint reference
- [Error handling](../error-handling.md) — standard error format and troubleshooting
