---
sidebar_position: 1
sidebar_label: "Sync partners"
sidebar_custom_props:
  icon: pms
---

import {Cards, Card} from '@site/src/components/Cards';

# Sync partners

This guide is for **sync partners**: any system that pushes unit and tenant state into KISS, such as a property management system (or any source that knows who holds each unit). You keep each unit's facts current (who holds it, whether they are paid up, whether it should be overlocked) and KISS evaluates them into an access decision the holder's app acts on.

It assumes you have skimmed [How access works](/guides/concepts), which explains the facts-based model and the access evaluator. Here we focus on the integration itself.

:::tip The reference has the exact shapes
This guide shows the shape of each call with working examples. Every endpoint links to its **full reference page** for the complete, always-current field lists and response schemas. The reference is generated from the live code, so it never drifts.
:::

## Before you begin

Every request is JSON over HTTPS, authenticated with a company-scoped Bearer token.

| | |
| --- | --- |
| Base URL | `https://api-app.keepitsimplestorage.com/api/v2` |
| Format | `Content-Type: application/json` |
| Auth | `Authorization: Bearer <token>` |
| Writes | Require an `Idempotency-Key` header |

You can create the token yourself in the KISS web admin portal:

1. Sign in and open **Company Settings**, then the **API** tab. (This needs company admin permission; if you do not see the tab, ask KISS to adjust your user or issue the token for you.)
2. Name the token, for example `acme-pms-integration`.
3. Select only the `pms:read` and `pms:write` scopes. The selector preselects every scope; deselect the others.
4. Copy the token when it appears. It is shown once; store it in your secrets manager.

| Scope | Grants |
| --- | --- |
| `pms:read` | Read your units (discovery) |
| `pms:write` | Unit sync, assigning and removing a unit's primary user, and unit fact updates |

See [Authentication](/guides/authentication) for the full token model.

## Identifiers and locations

Resources are addressed by **ULID**, a 26-character ID like `01KTSC4X57H4M49E661CW41BXE`. Two identifiers matter for units:

| Identifier | Owned by | Meaning |
| --- | --- | --- |
| `unit_id` | KISS | The unit's ULID. Used in every per-unit URL. Read it from `GET /units`. |
| `crm_unit_id` | You | Your system's key for the unit. The bulk sync matches on it, so you can write units without ever storing KISS IDs. Stored and echoed back on every read. |

Units enter the platform two ways: KISS registers them during lock installation, or your sync calls create them. Either way, `GET /units` is the authoritative mapping between your keys and ours.

Every unit belongs to a **location** (a facility). Payloads that create units accept a location in one of three ways:

1. **Omit it.** If your company has exactly one active location in KISS, the API infers it. The common case for a first integration.
2. **`location_id`**: the location's ULID, returned on every unit in `GET /units`.
3. **`pms_location_code`**: your own facility code. Set it per location in the admin portal (open the location, Integration tab), then address locations by the code your system already knows. `location_id` and `pms_location_code` are mutually exclusive in a payload.

## Map your events to API calls

Every event in your system maps to one call. This table is the heart of the integration.

| Event in your system | API call |
| --- | --- |
| Initial setup: discover existing units | `GET /units` (store the IDs) |
| Initial roster load, or periodic reconciliation | `PATCH /units` (bulk, up to 500 units) |
| New rental: assign the unit's primary user | `PUT /units/{unit_id}/tenancy` |
| Holder goes delinquent: overlock | `PATCH /units/{unit_id}` with `pms_lockout: true` |
| Holder pays: release overlock | `PATCH /units/{unit_id}` with `pms_lockout: false` |
| Unit moves to auction | `PATCH /units/{unit_id}` with `pms_auction: true` |
| Move-out: remove the unit's primary user | `DELETE /units/{unit_id}/tenancy` |

:::note Primary user vs. guests
These endpoints manage a unit's **single primary user** (its owner). Sharing a unit with a **guest** (a secondary holder, friend, vendor, or auction winner) is a separate model and is not yet a live API endpoint; today guests are added by the primary holder in the app or by staff in the admin portal. Guest grants over the API are coming via Access Grants.
:::

## Walking through the calls

Each call links to its full reference page for the complete field list and response schema.

### Discover your unit IDs

`GET /units` returns every unit in your company with the mapping between your `crm_unit_id` and our `unit_id`. Call it once during setup, store the IDs, and use them in the per-unit write paths.

```bash
curl https://api-app.keepitsimplestorage.com/api/v2/units \
  -H "Authorization: Bearer $KISS_TOKEN"
```

```json
{
  "message": "Request successful",
  "data": [
    {
      "unit_id": "01KTSC4X57H4M49E661CW41BXE",
      "crm_unit_id": "A-142",
      "unit_name": "142",
      "location_id": "01KTSC1K93D0Z2EVHVDPZHGJ5B",
      "source_type": "push"
    }
  ],
  "meta": { "count": 1 }
}
```

Responses carry `ETag` and `Cache-Control`; send `If-None-Match` to get a cheap `304` when nothing changed. `crm_unit_id` is `null` for units KISS registered that you have not synced yet.

→ Full reference: [List units](/reference/v-2-units-index)

### Bulk sync your roster

`PATCH /units` upserts up to 500 units in one call, matched on your `crm_unit_id`: unknown IDs create units, known IDs update them. Use it for the initial roster load and for periodic reconciliation (nightly is typical).

```bash
curl -X PATCH https://api-app.keepitsimplestorage.com/api/v2/units \
  -H "Authorization: Bearer $KISS_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: acme-roster-sync-2026-06-12" \
  -d '{
    "units": [
      {
        "crm_unit_id": "A-142",
        "unit_name": "142",
        "occupied": true,
        "pms_tenant_id": "T-883920",
        "move_in_date": "2026-06-01",
        "balance_due": 0,
        "paid_through_date": "2026-07-01",
        "pms_lockout": false,
        "pms_status_raw": "CURRENT"
      },
      { "crm_unit_id": "A-143", "unit_name": "143", "occupied": false }
    ]
  }'
```

A failing item does not abort the batch: it lands in `data.errors` as `{ "crm_unit_id": ..., "error": ... }` and the response is still `200`, so always check that array. The sync maintains unit facts but does not create user identities; use the assign-primary-user call when someone should be able to claim the unit in the app.

→ Full reference: [Bulk upsert units](/reference/v-2-units-sync)

### Assign the unit's primary user

`PUT /units/{unit_id}/tenancy` sets the unit's **single primary user** (its owner): it marks the unit occupied, clears any lockout, and (when you include the `user` block) creates or updates that person's identity so they can claim the unit in the **ONELock Access** app. Send their mobile phone in E.164 format; it is how they authenticate.

```bash
curl -X PUT https://api-app.keepitsimplestorage.com/api/v2/units/01KTSC4X57H4M49E661CW41BXE/tenancy \
  -H "Authorization: Bearer $KISS_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: acme-movein-A142-2026-06-15" \
  -d '{
    "pms_tenant_id": "T-883920",
    "ledger_id": "L-102233",
    "move_in_date": "2026-06-15",
    "tenant": {
      "first_name": "Jordan",
      "last_name": "Avery",
      "phone": "+18015550123",
      "email": "jordan.avery@example.com"
    }
  }'
```

:::caution This replaces an existing primary user
If the unit already has a primary user, this call **replaces** them: the prior primary link is overwritten. Any guest / secondary accessors stay attached. This endpoint is for the primary holder only; it does not add a guest.
:::

`pms_tenant_id` and `ledger_id` are your own references, stored and echoed back for reconciliation. Discover or bulk-sync the unit first; this call expects a unit that already exists.

→ Full reference: [Assign the unit's primary user](/reference/v-2-units-tenancy-put)

### Overlock, release, and status flags

`PATCH /units/{unit_id}` is the workhorse: send only the fields that changed. Delinquency and payment events both land here.

```bash
# Overlock on delinquency
curl -X PATCH https://api-app.keepitsimplestorage.com/api/v2/units/01KTSC4X57H4M49E661CW41BXE \
  -H "Authorization: Bearer $KISS_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: acme-overlock-A142-2026-07-02" \
  -d '{ "pms_lockout": true, "balance_due": 189.00, "pms_status_raw": "DELINQUENT" }'

# Release after payment
curl -X PATCH https://api-app.keepitsimplestorage.com/api/v2/units/01KTSC4X57H4M49E661CW41BXE \
  -H "Authorization: Bearer $KISS_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: acme-payment-784421" \
  -d '{ "pms_lockout": false, "balance_due": 0, "paid_through_date": "2026-08-01", "pms_status_raw": "CURRENT" }'
```

Accepted fields are the access flags from [How access works](/guides/concepts#which-facts-gate-access) (`pms_lockout`, `pms_lock_exempt`, `pms_auction`, `pms_unrentable`, `balance_due`, `paid_through_date`, `pms_status_raw`). Primary-user fields (`occupied`, `pms_tenant_id`, `move_in_date`) are rejected here with `422`; use the tenancy endpoints for those.

→ Full reference: [Update unit facts](/reference/v-2-units-patch)

### Remove the unit's primary user

`DELETE /units/{unit_id}/tenancy` ends the primary tenancy and resets the unit to vacant. No body; the URL is the whole instruction. It clears these unit fields:

- `occupied` → `false`, and the unit's status → vacant
- the primary-user link and `pms_tenant_id` → cleared
- `move_in_date` → cleared
- `balance_due` → `0`, `paid_through_date` → cleared
- `pms_lockout`, `pms_auction`, `pms_unrentable` → `false`
- `pms_status_raw` → cleared
- any **secondary accessors** are detached

It does **not** change `pms_lock_exempt`. Access state is then re-evaluated (the unit becomes vacant).

```bash
curl -X DELETE https://api-app.keepitsimplestorage.com/api/v2/units/01KTSC4X57H4M49E661CW41BXE/tenancy \
  -H "Authorization: Bearer $KISS_TOKEN" \
  -H "Idempotency-Key: acme-moveout-A142-2026-09-30"
```

Returns `404` for an unknown `unit_id`; this call never creates units.

→ Full reference: [Remove the unit's primary user](/reference/v-2-units-tenancy-delete)

## Idempotency

Every write requires an `Idempotency-Key` header: any opaque string up to 255 characters (an event ID, a transaction ID, or a composed key like the examples above). Keys are remembered for 24 hours, scoped to your company.

- **Same key, same request:** the original response is replayed and nothing is applied twice. Safe to retry on timeouts or 5xx.
- **Same key, different body:** `409 Conflict`. Generate a fresh key for each distinct event.

## Responses and errors

Every response uses the same envelope: `{ "message": ..., "data": ..., "meta": ... }`. Errors are `{ "message": ... }`, and validation failures add an `errors` object keyed by field.

| Status | Meaning |
| --- | --- |
| `200` | Applied (bulk sync returns `200` even with per-item errors, check `data.errors`) |
| `304` | Not modified (conditional `GET /units`) |
| `401` | Missing or invalid token |
| `403` | Token lacks the required scope |
| `404` | Unknown `unit_id` |
| `409` | Two distinct cases, distinguishable by `message` (see below) |
| `422` | Validation failure (details in `errors`) |

The two `409` cases:

- `"Idempotency-Key reused with a different request."` Reuse the response you already have, or send a new key.
- `"This unit is managed by a pull-mode PMS integration..."` Another sync source owns the record; contact KISS to resolve ownership. In the bulk sync this surfaces as a per-item error instead.

Full envelope and troubleshooting: [Error handling](/guides/error-handling).

## Integration checklist

1. Create your API token (Company Settings, API tab) with `pms:read` and `pms:write`, and store it in your secrets manager.
2. If you have more than one location, decide how to address them and, if you choose `pms_location_code`, set the codes in the admin portal.
3. `GET /units` to see what is registered, then load your roster with `PATCH /units` and store each `unit_id`.
4. Wire your events: new rental to `PUT .../tenancy`, delinquency and payment to `PATCH /units/{unit_id}`, move-out to `DELETE .../tenancy`.
5. Retry on timeout or 5xx with the *same* `Idempotency-Key`; alert on 4xx (those will not succeed on retry).
6. Run a live test with KISS on the line: overlock a unit, watch access revoke in the app, release it, watch access restore.

## Beyond the basics

Direct API calls are the right shape to start: your team gets synchronous validation on every call, and the contract above is already in production with multiple partners. As an integration matures, two natural extensions are worth a conversation: an event-feed option, where your system (or your PMS's native webhooks) emits events and KISS handles the mapping, and outbound webhooks from KISS, notifying your systems of activity on our side such as lock events and unit claims.

## Keep going

<Cards>
  <Card title="How access works" icon="concepts" href="/guides/concepts">
    The facts-based model and the precedence rules behind every decision.
  </Card>
  <Card title="Authentication" icon="auth" href="/guides/authentication">
    The full token model: scopes, per-company tokens, and OAuth for multi-company partners.
  </Card>
  <Card title="Error handling" icon="errors" href="/guides/error-handling">
    Response envelope, status codes, and troubleshooting.
  </Card>
  <Card title="API Reference" icon="reference" href="/reference/kiss-api-reference">
    The complete, always-current endpoint and schema reference, generated from code.
  </Card>
</Cards>
