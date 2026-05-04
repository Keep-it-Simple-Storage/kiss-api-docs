---
sidebar_position: 1
sidebar_label: "PMS Quickstart"
---

# Quickstart: PMS Push Integration

This guide walks you from zero to syncing unit data into KISS. There are two integration patterns depending on how your source produces data:

- **Event-driven** (email notifications, webhooks, MCP tool calls, anything that receives sparse events): use `PUT /units/{crm_unit_id}/tenancy` (move-in), `DELETE /units/{crm_unit_id}/tenancy` (move-out), and `PATCH /units/{crm_unit_id}` (sparse fact updates).
- **State-oriented** (traditional PMS with an API that can produce full unit state on demand): use `PATCH /units` (bulk upsert).

Both paths hit the same underlying data model — you can mix them.

**Time to complete:** ~10 minutes

## Prerequisites

- An API token generated from the KISS dashboard (see [Authentication guide](../authentication.md#generate-a-token))
- A mapping of your unit and tenant identifiers to sync into KISS
- A tool to make HTTP requests (curl, Postman, or your integration code)

## Base URL

```text
https://api.keepitsimplestorage.com/api/v2
```

:::note Idempotency
Every write endpoint accepts an `Idempotency-Key` header. We strongly recommend setting one on every request — send a new unique value per logical operation (any opaque string up to 255 characters; `uuidgen` is used in the examples below but any unique identifier from your system works), reuse the same value when retrying that operation. See [Authentication → Use the token](../authentication.md#use-the-token) for details.
:::

:::note Body schema is in flight
The endpoints' URL paths and methods are stable. The **body shape** is being aligned alongside [KEEP-665](https://linear.app/keep-it-simple-storage/issue/KEEP-665) (path keys migrating from `crm_unit_id` to ulid) — in particular, tenant identity fields (name, email, phone) are not yet accepted by the move-in endpoint. The examples below match what the controllers accept today; partner-facing identity creation will be added in a follow-up.
:::

---

## Path A — Event-driven integration

Use this path when your source produces one event at a time and can't reconstruct full unit state. Examples: an inbox that receives move-in / lockout / payment emails from a PMS, an MCP server translating agent tool calls, an integration relaying webhooks from another platform.

### Move in a tenant

A single event email arrives: *"Jane Smith moved into B204 on 2026-05-01."* One call:

```bash
# Generate one key per logical operation. Reuse the same value when retrying.
IDEMPOTENCY_KEY=$(uuidgen)

curl -X PUT https://api.keepitsimplestorage.com/api/v2/units/PMS-U-1001/tenancy \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
  -d '{
    "pms_tenant_id": "PMS-T-5001",
    "ledger_id": "LEDGER-9911",
    "move_in_date": "2026-05-01",
    "unit_name": "B204",
    "pms_location_code": "MAIN-ST"
  }'
```

**Response (201 if the unit was created, 200 if it already existed):**

```json
{
  "message": "Request successful.",
  "data": {
    "unit_id": "01HQ1234567890ABCDEFGHJKMNPQRS",
    "applied_at": "2026-05-01T14:30:00Z"
  }
}
```

The unit is created if it doesn't exist (using `unit_name` as the display name and `pms_location_code` to resolve the location). `occupied` is set to `true`. `pms_tenant_id` and `ledger_id` are recorded so subsequent payments and lockouts can reference this tenancy. No other facts are touched — if the unit had a prior balance, it stays until you update it.

### Update a fact

A payment posts — the email carries the new balance and paid-through date, nothing else. You patch just those two fields:

```bash
# Generate one key per logical operation. Reuse the same value when retrying.
IDEMPOTENCY_KEY=$(uuidgen)

curl -X PATCH https://api.keepitsimplestorage.com/api/v2/units/PMS-U-1001 \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
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

`PATCH /units/{crm_unit_id}` accepts any subset of `balance_due`, `paid_through_date`, `pms_lockout`, `pms_lock_exempt`, `pms_auction`, `pms_unrentable`, `pms_status_raw`. Fields not present in the body are untouched. `occupied`, `tenant_id`, `pms_tenant_id`, and `move_in_date` are rejected — tenancy changes go through the `/tenancy` endpoints instead.

### Set a lockout

Overlock email arrives. One field changes:

```bash
# Generate one key per logical operation. Reuse the same value when retrying.
IDEMPOTENCY_KEY=$(uuidgen)

curl -X PATCH https://api.keepitsimplestorage.com/api/v2/units/PMS-U-1001 \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
  -d '{
    "pms_lockout": true,
    "pms_status_raw": "Overlocked per facility manager 2026-05-20"
  }'
```

After the PATCH applies, KISS re-evaluates the unit — `pms_lockout: true` flips the access decision to denied. The tenant will see the lockout on their next access refresh in the white-label app.

### Move out a tenant

```bash
# Generate one key per logical operation. Reuse the same value when retrying.
IDEMPOTENCY_KEY=$(uuidgen)

curl -X DELETE https://api.keepitsimplestorage.com/api/v2/units/PMS-U-1001/tenancy \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Idempotency-Key: $IDEMPOTENCY_KEY"
```

**Response (200):**

```json
{
  "message": "Request successful.",
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

Preserved: `crm_unit_id`, `name`, lock associations, access history, `last_accessed_at`. **Does not create units** — if the `crm_unit_id` doesn't exist for your company, the request returns `404`.

---

## Path B — State-oriented bulk sync

Use this path when your source can produce the full current state of every unit on demand. Most PMSs with a complete API fall here.

```bash
# Generate one key per logical operation. Reuse the same value when retrying.
IDEMPOTENCY_KEY=$(uuidgen)

curl -X PATCH https://api.keepitsimplestorage.com/api/v2/units \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
  -d '{
    "units": [
      {
        "crm_unit_id": "PMS-U-1001",
        "unit_name": "B204",
        "pms_location_code": "MAIN-ST",
        "occupied": true,
        "pms_tenant_id": "PMS-T-5001",
        "ledger_id": "LEDGER-9911",
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
        "unit_name": "C101",
        "pms_location_code": "MAIN-ST",
        "occupied": false
      },
      {
        "crm_unit_id": "PMS-U-1003",
        "unit_name": "A305",
        "pms_location_code": "MAIN-ST",
        "occupied": true,
        "pms_tenant_id": "PMS-T-5003",
        "ledger_id": "LEDGER-9913",
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

Within a bulk payload, `occupied: true` with a `pms_tenant_id` and `move_in_date` is a move-in. `occupied: false` is a move-out (triggers the same 8-field reset as `DELETE /units/{crm_unit_id}/tenancy`).

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

Only when the whole request is malformed (e.g., missing `units` key, duplicate `crm_unit_id` values, or more than 500 units) do you get `422`.

### Batch size

Up to **500 units per request**. Sync your property in pages if it exceeds the cap. Duplicate `crm_unit_id` values within a single request are rejected.

---

## Mixing patterns

You can mix the two paths. A typical operational setup:

- **Tenancy + patch** for real-time updates as they happen (a webhook listener, an email parser, an MCP agent).
- **Bulk sync** for nightly reconciliation to catch any events that were missed or dropped.

Both paths converge on the same data model internally. The bulk sync's `occupied: false` and `DELETE /units/{crm_unit_id}/tenancy` run the same reset logic.

---

## Typical production setup

1. Generate an API token from the KISS dashboard.
2. Decide your pattern:
   - Event-driven source → wire your integration to call `PUT/DELETE /units/{crm_unit_id}/tenancy` and `PATCH /units/{crm_unit_id}` as events arrive.
   - State-oriented source → schedule `PATCH /units` periodically (every 15 minutes is a typical cadence).
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
- [Error handling](../error-handling.md) — standard error format, status codes, `409` cases, troubleshooting
