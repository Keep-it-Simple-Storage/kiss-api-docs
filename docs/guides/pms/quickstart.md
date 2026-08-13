---
sidebar_position: 1
sidebar_label: "Sync partners"
sidebar_custom_props:
  icon: pms
---

import {Cards, Card} from '@site/src/components/Cards';
import Method from '@site/src/components/Method';

# Sync partners

This guide is for **sync partners**: any system that pushes unit and tenant state into KISS, such as a property management system (or any source that knows who holds each unit). You keep each unit's facts current; KISS evaluates them into an access decision the tenant's app acts on. This page is the high-level integration overview. If you have not read [How access works](/guides/concepts) yet, start there for the model.

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

Every unit has **two** IDs:

- **`unit_id`**: the KISS identifier. KISS assigns it, and it never changes for the life of the unit. It is a ULID, a 26-character sortable ID that looks like `01K2E4M9XQ7T8VB3RY0DZC5NHF`. Treat it as an opaque string.
- **`external_unit_id`**: your own identifier, stored on the unit as reference metadata. You set it.

:::note You may see `crm_unit_id` in older examples
`external_unit_id` and `crm_unit_id` are the same field. Both are accepted, and responses carry both, so existing integrations keep working. New ones should use `external_unit_id`. The same applies to `external_tenant_id` (was `pms_tenant_id`) and `external_location_code` (was `pms_location_code`).
:::

| Endpoint | Addressed by |
| --- | --- |
| `PATCH /units` (bulk) | your **`external_unit_id`** |
| `PATCH /units/{unit_id}` (single) | the KISS **`unit_id`** |
| `PUT` / `DELETE /units/{unit_id}/tenancy` | the KISS **`unit_id`** |
| `GET /units/{unit_id}` | the KISS **`unit_id`** |

**Key your integration on `unit_id`.** It is the durable handle for every per-unit call, and it survives events your own IDs may not: it stays the same even when an operator moves to new management software and every external ID for the facility gets rebuilt.

Building the mapping takes one call. Load your roster with the bulk `PATCH /units`, matching items on your `external_unit_id`. The response lists every unit it applied in `data.results`, each with the `unit_id` KISS assigned:

```json
{
  "data": {
    "total": 2, "created": 2, "updated": 0, "failed": 0,
    "results": [
      { "unit_id": "01K2E4M9XQ7T8VB3RY0DZC5NHF", "external_unit_id": "A-142", "outcome": "created" },
      { "unit_id": "01K2E4M9XR2P6WD5FA1QJ8T4KN", "external_unit_id": "A-143", "outcome": "created" }
    ],
    "errors": []
  }
}
```

Store those pairs alongside your records and address units by `unit_id` from then on.

:::tip What is `external_unit_id` for, then?
It is your reference label: KISS stores it so you (and KISS support) can correlate a unit with your records, and it is how the bulk `PATCH /units` matches items. Keep it current, but treat it as metadata rather than the key your integration depends on. If you ever lose your mapping, `GET /units` returns both IDs for every unit, a page at a time.
:::

Every unit belongs to a **location**, which is one physical facility. If your token reaches exactly one active location, omit it and the API infers it; otherwise pass `location_id` (the KISS ULID for the location) or your own `external_location_code` (set per location in the admin portal).

A token reaches one location when it is either issued to a company that has a single active location, or [scoped to a single location](/guides/authentication#location-scoped-tokens). So a key bound to one store can leave the location out of every payload.

## Endpoints

Every event in your system maps to one call. You can mix two cadences: bulk-sync the full roster on a schedule, and fire per-event calls in real time. Both run the same evaluation after every write.

| When | Call | What it does |
| --- | --- | --- |
| Look up units you did not just write | <Method m="get" /> [`/units`](/reference/v-2-units-index) | Lists your units with the `external_unit_id` ↔ `unit_id` mapping. Returns a page at a time; narrow it with `filter[external_location_code]` to one store. Supports `ETag` / `If-None-Match`. |
| Look up tenants | <Method m="get" /> [`/tenants`](/reference/v-2-tenants-index) | Lists the tenants at your locations with the `external_tenant_id` ↔ `tenant_id` mapping, plus name, `phone_number`, and location. Paged and filterable; supports `ETag` / `If-None-Match`. Needs the `tenants:read` scope. |
| Tenant details changed | <Method m="patch" /> [`/tenants/{tenant_id}`](/reference/v-2-tenants-patch) | Update `first_name`, `last_name`, or `phone` on a tenant carrying your id, re-key its `external_tenant_id`, or claim one that has none by sending `external_tenant_id` with a matching `phone`. Returns `meta.warnings` when the phone number is shared with another account. Needs the `tenants:write` scope. |
| Bootstrap, or periodic reconcile | <Method m="patch" /> [`/units`](/reference/v-2-units-sync) | Create or update up to 500 units, matched on `external_unit_id`. Use it to load your roster and catch drift, then address units per-unit by `unit_id` for real-time changes. Applied units return in `data.results`, per-item errors in `data.errors`. A batch with at least one success answers `200`; a batch where every item failed answers `422` with the same body. |
| New rental | <Method m="put" /> [`/units/{unit_id}/tenancy`](/reference/v-2-units-tenancy-put) | Assign the primary user. Sets occupancy and the **move-in date**, and (with a `tenant` block) lets them claim the unit in the app. Replaces an existing primary user. |
| Delinquency, payment, auction, status | <Method m="patch" /> [`/units/{unit_id}`](/reference/v-2-units-patch) | Set the access flags (`lockout`, `auction`, `unrentable`, `balance_due`, and so on). Send only what changed. |
| Move-out | <Method m="delete" /> [`/units/{unit_id}/tenancy`](/reference/v-2-units-tenancy-delete) | Remove the primary user and reset the unit to vacant. Guests with inherited access are removed automatically. |

:::note Primary user vs. guests
These endpoints set a unit's single **primary user** (its owner). The primary can also share access with **guests**, managed in the app or admin portal rather than through these tenancy endpoints. Guests come in two scopes: **inherited** (access follows the primary user's, the common case) and **direct** (independent, for a vendor or an auction winner). When you move the primary user out, inherited guests lose access automatically, so you never need to remove them first; direct guests persist until separately revoked.
:::

:::info Coming soon
A bundle-grants API for managing guests programmatically exists but is behind a feature flag and is not in this reference yet. Ask your KISS contact if you need it enabled for your company.
:::

:::note Phone number format
This applies to the `tenant` block on the tenancy writes above. Store tenant phone numbers as plain digits, country code plus number, with no `+`, spaces, or punctuation (for example `15550101234`). KISS matches a tenant's sign-in number against what you sync, so a stored `+1 555 010 1234` will not match a sign-in of `15550101234`.

[`PATCH /tenants/{tenant_id}`](/reference/v-2-tenants-patch) is the exception: it accepts E.164 with a leading `+`, and that is the form to prefer there. See [Updating a tenant](#updating-a-tenant).
:::

:::tip Use the right write for the job
Send individual changes (an overlock, a payment, a status flag) in real time as they happen, and reserve full 500-unit batches for the initial load and periodic reconciliation. A big batch to flip one flag is wasteful and slower to take effect. For a single change, prefer `PATCH /units/{unit_id}`; a one-item `PATCH /units` (matched on `external_unit_id`) also works when you don't have the `unit_id` at hand.
:::

## Example: bulk sync

The bulk upsert is the workhorse. Send each unit's known facts; KISS reconciles.

The example below omits the location, so it assumes a token that reaches exactly one active location. If yours reaches more than one, add `location_id` or `external_location_code` to each item, or the items come back rejected in `data.errors`.

```bash
curl -X PATCH https://api-app.keepitsimplestorage.com/api/v2/units \
  -H "Authorization: Bearer $KISS_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: acme-roster-2026-06-12" \
  -d '{
    "units": [
      { "external_unit_id": "A-142", "unit_name": "142", "occupied": true,
        "external_tenant_id": "T-883920", "move_in_date": "2026-06-01",
        "balance_due": 0, "lockout": false },
      { "external_unit_id": "A-143", "unit_name": "143", "occupied": false }
    ]
  }'
```

A failing item does not abort the batch: it lands in `data.errors` while the rest still apply, so always check that array rather than trusting the status code. Applied units land in `data.results` with their `unit_id`.

The status tells you how much got through: `200` when at least one item applied, `422` when every item failed. The body is the same either way, so `data.errors` is what you read in both cases. Full field list on the [reference page](/reference/v-2-units-sync).

## Reading the unit list

`GET /units` returns one page at a time, 15 units by default. Ask for more per page with `per_page` (up to 100), and walk the pages with `page`:

```bash
curl "https://api-app.keepitsimplestorage.com/api/v2/units?per_page=100&page=2" \
  -H "Authorization: Bearer $KISS_TOKEN"
```

Each response tells you where you are, so keep asking until `current_page` reaches `last_page`:

```json
{ "meta": { "pagination": { "current_page": 2, "per_page": 100, "total": 340, "last_page": 4 } } }
```

If you only care about one facility, filter by your own store code with `filter[external_location_code]`, or by the KISS location with `filter[location]`.

:::tip You usually do not need this endpoint
The bulk `PATCH /units` already returns the `unit_id` of everything it applied, so the common case (loading your roster and recording the mapping) needs no list call at all. Reach for `GET /units` when you are reconciling, recovering a lost mapping, or inspecting units you did not write.
:::

## Reading the tenant list

`GET /tenants` returns the tenants at your locations, one page at a time, 15 by default. Each row carries both ids: your own `external_tenant_id` and the KISS `tenant_id` (a ULID), plus the tenant's name, `phone_number`, and location.

```bash
curl "https://api-app.keepitsimplestorage.com/api/v2/tenants?per_page=100" \
  -H "Authorization: Bearer $KISS_TOKEN"
```

```json
{
  "data": [
    { "tenant_id": "01J8ZQK3M7V2XPB4NRTC6H9DSE", "external_tenant_id": "T-883920",
      "first_name": "Dana", "last_name": "Whitfield", "phone_number": "+15125550142",
      "location_id": "01J8ZQ2A4WY7RK5MF3TDN6XBQV", "external_location_code": "STORE-01",
      "type": "primary" },
    { "tenant_id": "01J8ZR7T1K9F3XW5PDNB2QH4CV", "external_tenant_id": null,
      "first_name": "Marcus", "last_name": "Ferreira", "phone_number": "+15125559981",
      "location_id": "01J8ZQ2A4WY7RK5MF3TDN6XBQV", "external_location_code": "STORE-01",
      "type": "primary" }
  ],
  "meta": { "pagination": { "current_page": 1, "per_page": 100, "total": 2, "last_page": 1 } }
}
```

Walk the pages with `page` and size them with `per_page` (up to 100), the same as `GET /units`. Narrow the list with `filter[location]` or `filter[external_location_code]` for one store, or `filter[external_tenant_id]` to look up specific tenants by your own id. The endpoint honours `ETag` / `If-None-Match`, so a periodic sweep can re-request each page and skip the ones that answer `304`. [`GET /tenants/{tenant_id}`](/reference/v-2-tenants-show) returns one tenant with the same fields, and takes the same conditional request.

`type` tells you how the tenant holds their access: `primary` for the renter, `secondary-tenant` for someone on the same rental, `unit-accessor` for a guest given access to a unit. The same values work as `filter[type]`.

### Tenants you did not create

Not every row will be one of yours. A tenant can exist in KISS with no id from your system: they may have signed up in the app, been added at the counter, or come from an integration you replaced. Those rows come back with `external_tenant_id: null`, and `phone_number` (country code plus number, leading `+`) is what identifies them.

:::caution Pushing your own id over one of these creates a second record
Tenancy writes match on `external_tenant_id` alone. Send your own id for a tenant listed here with `external_tenant_id: null` and KISS has no way to tell it is the same person, so it creates a second tenant on the same phone number. Both records then exist and access can end up split across them.

If a `phone_number` in this list matches someone in your own records, claim the tenant instead of writing blind: send `external_tenant_id` and `phone` to `PATCH /tenants/{tenant_id}` and KISS links it by matching the phone number already on file. See [Claiming a tenant with no id from you](#claiming-a-tenant-with-no-id-from-you). Tenants you create yourself always carry your id and match normally. A write to one of these that omits `external_tenant_id` still answers `409 tenant_not_externally_linked` rather than silently attaching your id.
:::

## Updating a tenant

`PATCH /tenants/{tenant_id}` updates a tenant's name or phone number, or re-keys the id you gave them. Send at least one of `first_name`, `last_name`, `phone`, or `external_tenant_id`. It does not onboard a tenant or move one between units, which the tenancy endpoints above do.

```bash
curl -X PATCH https://api-app.keepitsimplestorage.com/api/v2/tenants/01J8ZQK3M7V2XPB4NRTC6H9DSE \
  -H "Authorization: Bearer $KISS_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"phone": "+15125550142"}'
```

```json
{
  "message": "Request successful.",
  "data": {
    "tenant_id": "01J8ZQK3M7V2XPB4NRTC6H9DSE", "external_tenant_id": "T-883920",
    "first_name": "Dana", "last_name": "Whitfield", "phone_number": "+15125550142",
    "location_id": "01J8ZQ2A4WY7RK5MF3TDN6XBQV", "external_location_code": "STORE-01",
    "type": "primary"
  },
  "meta": { "warnings": [] }
}
```

`phone` is also the tenant's sign-in credential. Send it in E.164 (`+15125550142`) to be unambiguous, or as a bare national number, which is read against the tenant's location. A tenant with no location on file has no country to read a bare number against, so a bare number for one of these answers `422`; send E.164 instead.

`meta.warnings` is always present, even when empty. A write that lands on a phone number another account also answers on comes back `200` with a `phone_number_shared` entry rather than being rejected, since the number really is shared and blocking the write would not fix that:

```json
{ "code": "phone_number_shared", "message": "...", "tenant_ids": ["01J8ZR7T1K9F3XW5PDNB2QH4CV"] }
```

`tenant_ids` lists only the accounts your token can see; a collision with a tenant outside your reach still raises the warning, just without an id you could look up.

This endpoint only reaches a tenant that carries an id from your system, unless the write is a claim (see [below](#claiming-a-tenant-with-no-id-from-you)). Any other write to one with `external_tenant_id: null` (see [above](#tenants-you-did-not-create)) answers `409 tenant_not_externally_linked`. If your token reaches more than one of the tenant's records, it answers `409 tenant_profile_ambiguous` instead: narrow the token to a single location and retry.

Names carry one more condition. `first_name` and `last_name` live on the tenant's shared account rather than the per-location record, so they hold the same value everywhere that tenant appears. If the tenant has records at more than one of your locations, a name change answers `409 tenant_spans_locations`. Narrowing the token does not help, because the name is still shared with a location the narrower token cannot reach. `phone` is held per location, so it still updates for these tenants, but only in a request of its own. A request carrying both is rejected whole, and nothing is written.

### Re-keying `external_tenant_id`

If the id you gave a tenant changes on your side, send the new value as `external_tenant_id` (the old `pms_tenant_id` name still works). KISS carries it across everything keyed on that id: the tenant's records at each of your locations, their units, and any guests linked to them. Because the id is the match key your tenancy writes use, keep sending the new value from then on. A later write with the old id would not find the tenant, and would create a second one.

If another tenant in your account already holds the new id, the write answers `409 external_tenant_id_conflict` and nothing changes. Pick an id no other tenant uses, or ask support to merge the two.

A re-key changes the id everywhere the tenant appears, so it needs a token that reaches every location the tenant is at. One scoped to fewer answers `409 tenant_spans_locations`; widen the token, or ask support to run it. Setting `external_tenant_id` on a tenant that has none is a different operation, claiming an account KISS already holds; see [Claiming a tenant with no id from you](#claiming-a-tenant-with-no-id-from-you).

If KISS still syncs this company from another system, the response also carries an `external_tenant_id_cutover` entry in `meta.warnings`: a later sync could still send the old id and re-create the tenant as a separate record. Change it at the source too, so the two stay in step. The same warning, worded for the case at hand, can also follow a claim; see [Claiming a tenant with no id from you](#claiming-a-tenant-with-no-id-from-you).

### Claiming a tenant with no id from you

A tenant with `external_tenant_id: null` (see [Tenants you did not create](#tenants-you-did-not-create)) can be linked to your system directly, no request to support needed. Send `external_tenant_id` (the `pms_tenant_id` alias also works) together with `phone`, and KISS matches it against the phone number already on file for that tenant, the same `phone_number` `GET /tenants` returns on the null-id row. This is a claim: an assertion that a tenant KISS already holds is a person you know by that id, and the phone number is the proof.

Only a tenant's own primary record can be claimed. Shared-access guests (`type: secondary-tenant`) and classified guest records (`type: unit-accessor`) carry no id from your system by design, and each points at the primary it was shared from rather than standing on its own. `GET /tenants` lists these rows alongside primaries, and `filter[type]=secondary-tenant` will even narrow a request to them, so a partner reconciling a full roster will run into them. A claim against one still answers `409 tenant_not_externally_linked`. Claim only the rows with `type: primary`.

```bash
curl -X PATCH https://api-app.keepitsimplestorage.com/api/v2/tenants/01J8ZR7T1K9F3XW5PDNB2QH4CV \
  -H "Authorization: Bearer $KISS_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"external_tenant_id": "T-990214", "phone": "+15125559981"}'
```

`phone` here is proof, not a change: it is not written, and the tenant's number on file stays whatever it already was. `first_name` and `last_name` sent in the same request are still applied.

No `phone` in the body of a claim answers `409 claim_phone_required`. A phone that does not parse, that the tenant has none on record, or that differs from what KISS holds answers `409 claim_phone_mismatch`; neither path creates a phone record on the tenant.

A claim attaches the id everywhere the tenant appears, the same reach a re-key needs, so it also needs a token that covers every location the tenant is at. One scoped to fewer answers `409 tenant_spans_locations`. If another tenant in your account already holds the id, the write answers `409 external_tenant_id_conflict`, the same collision a re-key can hit.

Another write can link the tenant to a different id between the moment a claim is accepted and the moment it applies. When that happens the claim answers `409 claim_raced` rather than reporting success on an id that never actually landed, and nothing changes. Re-read the tenant: if the id now on it is not the one you meant to set, send that value as a re-key instead of retrying the claim.

On success the id also lands on the tenant's units, wherever `tenant_id` matches and no id was already stamped there, archived units included, so a tenancy write for that tenant matches correctly from then on. This is the fix for the duplicate-record risk in [Tenants you did not create](#tenants-you-did-not-create): claim the tenant first instead of writing your id blind.

A successful claim can carry two entries in `meta.warnings`. A `phone_number_shared` entry means the phone you sent as proof also answers for another account: since the phone is the entire proof on a claim, a shared number means the match could not tell the two accounts apart, and the id may have landed on the wrong person. Check `tenant_ids` on the warning and, if it names the wrong account, correct it with a re-key. An `external_tenant_id_cutover` entry means your account still has an inbound sync that does not yet know this id, and a sync before it learns could re-create the tenant separately; see [Re-keying `external_tenant_id`](#re-keying-external_tenant_id) for the same warning on a re-key.

Needs the `tenants:write` scope. Full field list and error shapes on the [reference page](/reference/v-2-tenants-patch).

## Idempotency

Every write requires an `Idempotency-Key` header (any opaque string up to 255 characters). The same key with a different body returns `409`.

Only **successful** responses are stored, and only for 24 hours. That determines what a retry actually does:

- **After a success**, a same-key retry replays the stored response and writes nothing.
- **After a timeout or a 5xx**, nothing was stored, so a same-key retry re-runs the request from scratch rather than replaying it. Retrying is still the right move, but the work is repeated in full: a large batch that timed out costs the same again. Back off between attempts rather than retrying tightly, and prefer a smaller batch if one keeps timing out.

## When changes take effect

Every write is evaluated immediately: the moment you set `lockout`, the unit's access state flips on our side. Tenant apps, though, operate **offline**: each device caches its access bundle and keys for up to **8 hours** (the `GET /access` cache window). So a change you write can take up to 8 hours to reach a device that already holds a cached bundle, unless the app refreshes sooner. Apps refresh on launch, on pull-to-refresh, and whenever the cache expires.

In practice:

- **Granting access** is effectively immediate, once the tenant's app next refreshes.
- **Revoking access** (an overlock, auction, or move-out) takes effect on our side at once, but a device that already pulled a key keeps working until it refreshes or its 8-hour cache expires. Treat 8 hours as the worst case for a revocation to reach every device.

There is no callback to force an offline device to refresh sooner; the cache window is the contract. If a revocation is time-critical, that timing is worth discussing with your KISS contact.

## Errors

Responses use the `{ message, data, meta }` envelope; validation failures add a field-keyed `errors` object on `422`. The two `409` cases (idempotency-key reuse vs. a unit owned by a pull-mode integration) are distinguishable by `message`. Full status table: [Error handling](/guides/error-handling).

## Testing your integration

Before you wire up production data:

- **Check connectivity** with the public health endpoint: `GET /health` returns `200` when the API is up.
- **Isolate problems** by starting from a minimal payload (one unit, required fields only) and adding fields back until a `422` appears; validation errors name the exact field path. See [Error handling](/guides/error-handling).
- **Work against a non-production roster.** Ask your KISS contact to set you up with a test company and a scoped token so you can exercise move-in, overlock, and move-out without touching live tenants. A self-serve partner sandbox is on the way; until then KISS provisions a test company for you.
- **Run the end-to-end check** in the checklist below: overlock a unit and watch access revoke in the app, then release it and watch it restore.

## Integration checklist

1. Create your token (Company Settings → API) with `pms:read` + `pms:write`.
2. `GET /units` to see what is registered; load your roster with `PATCH /units` and store each `unit_id`.
3. Wire your events to the calls in the table above.
4. Retry on timeout / 5xx with the *same* `Idempotency-Key`, backing off between attempts; alert on 4xx.
5. Run a live test with KISS: overlock a unit, watch access revoke in the app, release it, watch it restore.

## Staying in sync: events and webhooks

You drive KISS by writing facts as your events happen, so there is nothing to poll for access decisions. To learn about activity **on KISS's side** (a tenant claimed a unit in the app, a lock was opened), today you reconcile by reading: poll `GET /units` on a schedule, cheaply, with `ETag` / `If-None-Match` so unchanged data comes back as a `304`. **Outbound webhooks** (KISS calling you on lock events and unit claims) are on the roadmap and will replace that polling; ask your KISS contact about availability for your integration.

As an integration matures, an event-feed option is also worth a conversation: your system or your PMS's native webhooks emit events and KISS maps them.

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
