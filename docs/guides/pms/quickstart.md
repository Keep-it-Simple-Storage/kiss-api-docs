---
sidebar_position: 1
sidebar_label: "Sync partners"
sidebar_custom_props:
  icon: pms
---

import {Cards, Card} from '@site/src/components/Cards';
import Method from '@site/src/components/Method';

# Sync partners

This guide is for **sync partners**: any system that pushes unit and tenant state into KISS, such as a property management system (or any source that knows who holds each unit). You keep each unit's facts current; KISS evaluates them into an access decision the holder's app acts on. Read [How access works](/guides/concepts) first for the model — this is the high-level integration overview.

:::tip Every call has a reference page
This guide is the overview. Each endpoint below links to its **reference page** for the full parameters, schema, and a Try it console.
:::

## Before you begin

Every request is JSON over HTTPS with a company-scoped Bearer token.

| | |
| --- | --- |
| Base URL | `https://api-app.keepitsimplestorage.com/api/v2` |
| Auth | `Authorization: Bearer <token>` (scopes `pms:read`, `pms:write`) |
| Writes | Require an `Idempotency-Key` header |

Create the token yourself in the web admin portal: **Company Settings → API**, name it, select the `pms:read` and `pms:write` scopes, and copy it (shown once). See [Authentication](/guides/authentication) for the full model.

## Identifiers and locations

Units are addressed by **ULID** (`unit_id`, a 26-character ID). Your own key, `crm_unit_id`, is what the bulk sync matches on, so you can write without ever storing KISS IDs. `GET /units` is the authoritative mapping between the two.

Every unit belongs to a **location**. If your company has one active location, omit it and the API infers it; otherwise pass `location_id` (a ULID) or your own `pms_location_code` (set per location in the admin portal).

## Endpoints

Every event in your system maps to one call. You can mix two cadences: bulk-sync the full roster on a schedule, and fire per-event calls in real time. Both run the same evaluation after every write.

| When | Call | What it does |
| --- | --- | --- |
| Discover your unit IDs | <Method m="get" /> [`/units`](/reference/v-2-units-index) | Lists your units with the `crm_unit_id` ↔ `unit_id` mapping. Supports `ETag` / `If-None-Match`. |
| Initial load, or nightly reconcile | <Method m="patch" /> [`/units`](/reference/v-2-units-sync) | Bulk upsert up to 500 units, matched on `crm_unit_id`. Per-item errors return in `data.errors` with a `200`. |
| New rental | <Method m="put" /> [`/units/{unit_id}/tenancy`](/reference/v-2-units-tenancy-put) | Assign the unit's primary user (replaces an existing one). Include a `tenant` block so they can claim it in the app. |
| Delinquency, payment, auction, status | <Method m="patch" /> [`/units/{unit_id}`](/reference/v-2-units-patch) | Set the access flags (`pms_lockout`, `pms_auction`, `pms_unrentable`, `balance_due`, …). Send only what changed. |
| Move-out | <Method m="delete" /> [`/units/{unit_id}/tenancy`](/reference/v-2-units-tenancy-delete) | Remove the primary user and reset the unit to vacant. |

:::note Primary user vs. guests
These manage a unit's single **primary user** (its owner). Sharing with a **guest** is a separate model and not yet a live API endpoint; today guests are added in the app or admin portal. Guest grants over the API are coming via Access Grants.
:::

## Example: bulk sync

The bulk upsert is the workhorse. Send each unit's known facts; KISS reconciles.

```bash
curl -X PATCH https://api-app.keepitsimplestorage.com/api/v2/units \
  -H "Authorization: Bearer $KISS_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: acme-roster-2026-06-12" \
  -d '{
    "units": [
      { "crm_unit_id": "A-142", "unit_name": "142", "occupied": true,
        "pms_tenant_id": "T-883920", "move_in_date": "2026-06-01",
        "balance_due": 0, "pms_lockout": false },
      { "crm_unit_id": "A-143", "unit_name": "143", "occupied": false }
    ]
  }'
```

A failing item does not abort the batch: it lands in `data.errors` and the response is still `200`, so always check that array. Full field list on the [reference page](/reference/v-2-units-sync).

## Idempotency

Every write requires an `Idempotency-Key` header (any opaque string up to 255 characters). Retry with the **same** key after a timeout or 5xx; the original response replays and nothing is applied twice. The same key with a different body returns `409`.

## Errors

Responses use the `{ message, data, meta }` envelope; validation failures add a field-keyed `errors` object on `422`. The two `409` cases (idempotency-key reuse vs. a unit owned by another sync source) are distinguishable by `message`. Full status table: [Error handling](/guides/error-handling).

## Integration checklist

1. Create your token (Company Settings → API) with `pms:read` + `pms:write`.
2. `GET /units` to see what is registered; load your roster with `PATCH /units` and store each `unit_id`.
3. Wire your events to the calls in the table above.
4. Retry on timeout / 5xx with the *same* `Idempotency-Key`; alert on 4xx.
5. Run a live test with KISS: overlock a unit, watch access revoke in the app, release it, watch it restore.

## Beyond the basics

Direct API calls are the right shape to start. As an integration matures, two extensions are worth a conversation: an event-feed option (your system or your PMS's native webhooks emit events and KISS maps them), and outbound webhooks from KISS for activity on our side (lock events, unit claims).

## Keep going

<Cards>
  <Card title="How access works" icon="concepts" href="/guides/concepts">
    The facts-based model and the precedence rules behind every decision.
  </Card>
  <Card title="Authentication" icon="auth" href="/guides/authentication">
    Tokens and scopes; OAuth for multi-company partners.
  </Card>
  <Card title="API Reference" icon="reference" href="/reference/kiss-api-reference">
    Every endpoint: parameters, schema, and a Try it console.
  </Card>
</Cards>
