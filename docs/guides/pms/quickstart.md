---
sidebar_position: 1
sidebar_label: "PMS Quickstart"
---

# Quickstart: PMS Push Integration

This guide walks you from zero to syncing unit data into KISS. There are two integration patterns depending on how your source produces data:

- **Event-driven** (email notifications, webhooks, MCP tool calls, anything that receives sparse events): use the `/pms/events/*` and `PATCH /pms/units/{crm_unit_id}` endpoints.
- **State-oriented** (traditional PMS with an API that can produce full unit state on demand): use `POST /pms/units/sync`.

Both paths hit the same underlying data model — you can mix them.

**Time to complete:** ~10 minutes

## Prerequisites

- An API token generated from the KISS dashboard (see [Authentication guide](../authentication.md#generate-a-token))
- A mapping of your unit and tenant identifiers to sync into KISS
- A tool to make HTTP requests (curl, Postman, or your integration code)

## Base URL

```
https://api.keepitsimplestorage.com/api/v2
```

:::note Idempotency
Every write endpoint accepts an optional `Idempotency-Key` header. We strongly recommend setting one on every request — send a new UUID per logical operation, reuse the same UUID when retrying that operation. See [Authentication → API Tokens](../authentication.md#idempotency-key) for details.
:::

:::note Location binding
The `location_code` field shown in examples below is a placeholder for how units are bound to a facility/location. The final contract is in design — whether partners send a `pms_location_code`, whether a one-location-per-company assumption applies, or whether locations are pre-registered through a separate endpoint is a decision in progress. Check back before you build.
:::

---

## Path A — Event-driven integration

Use this path when your source produces one event at a time and can't reconstruct full unit state. Examples: an inbox that receives move-in / lockout / payment emails from a PMS, an MCP server translating agent tool calls, an integration relaying webhooks from another platform.

### Move in a tenant

A single event email arrives: *"Jane Smith moved into B204 on 2026-05-01."* One call:

```bash
curl -X POST https://api.keepitsimplestorage.com/api/v2/pms/events/move-in \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{
    "unit_ref": {
      "crm_unit_id": "PMS-U-1001",
      "name": "B204"
    },
    "tenant": {
      "pms_tenant_id": "PMS-T-5001",
      "first_name": "Jane",
      "last_name": "Smith",
      "phone": "+15551234567",
      "email": "jane.smith@email.com"
    },
    "move_in_date": "2026-05-01"
  }'
```

**Response (201):**

```json
{
  "message": "Move-in applied.",
  "data": {
    "unit_id": "01HQ1234567890ABCDEFGHJKMNPQRS",
    "applied_at": "2026-05-01T14:30:00Z"
  }
}
```

The unit is created if it doesn't exist. The tenant is upserted (matched by `pms_tenant_id`). `occupied` is set to `true`. No other facts are touched — if the unit had a prior balance, it stays until you update it.

### Update a fact

A payment posts — the email carries the new balance and paid-through date, nothing else. You patch just those two fields:

```bash
curl -X PATCH https://api.keepitsimplestorage.com/api/v2/pms/units/PMS-U-1001 \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{
    "balance_due": 0.00,
    "paid_through_date": "2026-06-01"
  }'
```

**Response (200):**

```json
{
  "message": "Unit updated.",
  "data": {
    "unit_id": "01HQ1234567890ABCDEFGHJKMNPQRS",
    "applied_at": "2026-05-14T09:12:34Z"
  }
}
```

`PATCH /pms/units/{crm_unit_id}` accepts any subset of `balance_due`, `paid_through_date`, `pms_lockout`, `pms_lock_exempt`, `pms_auction`, `pms_unrentable`, `pms_status_raw`. Fields not present in the body are untouched. `occupied` and `tenant` go through the event endpoints instead — this keeps tenancy changes in named endpoints.

### Set a lockout

Overlock email arrives. One field changes:

```bash
curl -X PATCH https://api.keepitsimplestorage.com/api/v2/pms/units/PMS-U-1001 \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{
    "pms_lockout": true,
    "pms_status_raw": "Overlocked per facility manager 2026-05-20"
  }'
```

KISS's evaluation engine picks up `pms_lockout: true` on the next access check and denies the tenant.

### Move out a tenant

```bash
curl -X POST https://api.keepitsimplestorage.com/api/v2/pms/events/move-out \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{
    "unit_ref": { "crm_unit_id": "PMS-U-1001" }
  }'
```

**Response (200):**

```json
{
  "message": "Move-out applied.",
  "data": {
    "unit_id": "01HQ1234567890ABCDEFGHJKMNPQRS",
    "applied_at": "2026-07-15T16:05:00Z"
  }
}
```

When move-out is applied, KISS resets the following fields to defaults:

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

Preserved: `crm_unit_id`, `name`, lock associations, access history, `last_accessed_at`.

---

## Path B — State-oriented bulk sync

Use this path when your source can produce the full current state of every unit on demand. Most PMSs with a complete API fall here.

```bash
curl -X POST https://api.keepitsimplestorage.com/api/v2/pms/units/sync \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
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
        "tenant": {
          "pms_tenant_id": "PMS-T-5003",
          "first_name": "Alice",
          "last_name": "Wong",
          "phone": "+15555551234"
        },
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

**Response (200):**

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

### Move in and move out via bulk sync

Within a bulk payload, `occupied: true` with a `tenant` object and `move_in_date` is a move-in. `occupied: false` is a move-out (triggers the same 8-field reset as the event endpoint).

Units not included in the payload are **not** affected — this is an upsert, not a full replace.

### Partial failures

If one unit's validation fails, the rest still apply. The response returns `200` with per-unit errors:

```json
{
  "message": "Sync completed with errors.",
  "data": {
    "synced_at": "2026-04-02T14:30:00Z",
    "total": 3,
    "created": 1,
    "updated": 1,
    "unchanged": 0,
    "errors": [
      {
        "crm_unit_id": "PMS-U-1002",
        "error": "Invalid value for balance_due: must be a number."
      }
    ]
  }
}
```

Only when the whole request is malformed (e.g., missing `units` key) do you get `422`.

### Batch size

There is a cap on `units.length` per request (exact number TBD, expected in the 1000 range). Sync your property in pages if it exceeds the cap.

---

## Mixing patterns

You can mix the two paths. A typical operational setup:

- **Events + patch** for real-time updates as they happen (a webhook listener, an email parser, an MCP agent).
- **Bulk sync** for nightly reconciliation to catch any events that were missed or dropped.

Both paths converge on the same data model internally. The bulk sync's `occupied:false` and the `/events/move-out` endpoint run the same reset logic.

---

## Typical production setup

1. Generate an API token from the KISS dashboard.
2. Decide your pattern:
   - Event-driven source → wire your integration to call `/pms/events/*` and `PATCH /pms/units/{crm_unit_id}` as events arrive.
   - State-oriented source → schedule `POST /pms/units/sync` periodically (every 15 minutes is a typical cadence).
3. Always include an `Idempotency-Key` header so retries are safe.
4. Handle `429 Too Many Requests` with `Retry-After` honored.
5. Handle `409 Conflict` (source-type collision or idempotency-key reuse) by logging and alerting — these indicate configuration issues, not transient errors.

:::note
After every write, KISS automatically runs its access evaluation engine on affected units. Tenants with a white-label app will see the changes on their next access refresh.
:::

---

## What's next

- [Authentication guide](../authentication.md) — token management, `Idempotency-Key`, rate limits
- [Concepts](../concepts.md) — facts-based data model, access states, source types, integration patterns
- [API Reference](/docs/api-reference/kiss-api) — full endpoint reference
- [Error handling](../error-handling.md) — standard error format, status codes, `409` cases, troubleshooting
