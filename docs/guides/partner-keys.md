---
sidebar_position: 2
sidebar_label: "Partner keys"
sidebar_custom_props:
  icon: manager
---

# One key for many companies

This guide is for a partner that sends data for many storage companies, for example a property management or operations platform that works with several storage operators. Instead of holding one API key per company, you get a single partner key from KISS and pick the company per request with a header.

## Getting a partner key

A partner key is issued by KISS. Email [help@keepitsimplestorage.com](mailto:help@keepitsimplestorage.com) and we will set one up for you.

**Copy it as soon as you receive it.** Like a per-company token, it is shown once and cannot be retrieved afterwards by anyone, including KISS support. Store it in a secrets manager, not in source code.

A partner key can carry these scopes:

| Scope | Lets you |
| --- | --- |
| `units:read` | Read units |
| `units:write` | Create and update units |
| `tenants:read` | Read tenants |
| `tenants:write` | Update tenants |
| `read:logs` | Read access logs |
| `read:events` | Read events |

A partner key can never carry `tenants:auth`, the scope that signs a tenant in. That stays on per-company keys, so a partner key cannot sign tenants in and `POST /auth/tenant-tokens` answers `401` for one. See [Signing in your tenants](/guides/authentication#signing-in-your-tenants) if your app also needs that flow for a company you hold a per-company key for.

::::note Legacy scopes
The older `pms:*` scope names are not available on partner keys. Use `units:read` and `units:write` instead.
::::

## How a company turns you on

A partner key only reaches a company once that company turns you on. No key is ever shared with the company, only an on/off switch and a location list.

1. A company admin opens their company in the [KISS Dashboard](https://app.keepitsimplestorage.com) and goes to the **Connectors** tab.
2. Under **Data partners**, they choose **Enable** on your card to let you reach every location, or **Choose locations** to pick specific ones.
3. They can edit the location list, or choose **Disable** and confirm with **Turn off**, at any time. The change takes effect on your next request.

::::tip You cannot force this
There is no call that turns a company on for you. If a company is not showing up in the discovery call below, ask the company admin to enable you from their Connectors tab.
::::

## Discovering companies

`GET /vendor/companies`, authenticated with your partner key and no extra header, lists the companies that have turned you on, ordered by name:

```bash
curl https://api-app.keepitsimplestorage.com/api/v2/vendor/companies \
  -H "Authorization: Bearer $KISS_PARTNER_TOKEN"
```

```json
{
  "message": "Request successful.",
  "data": [
    {
      "company_id": "01JATXQ1KZ7P4RN82VC9EWY30M",
      "name": "Lakeside Storage",
      "enabled_at": "2026-10-05T14:03:11+00:00",
      "locations": null
    },
    {
      "company_id": "01JATXQ8H6D3KXW0B7T5MN2VRF",
      "name": "Northbend Self Storage",
      "enabled_at": "2026-09-28T09:12:44+00:00",
      "locations": [
        { "location_id": "01JATXR2P9F7Q3VZC8H1WM5KBN", "name": "Northbend Main St", "external_location_code": "NB-01" }
      ]
    }
  ],
  "meta": {}
}
```

`locations` is `null` when the company allowed all of its locations, as with Lakeside Storage above. It is an array of `{ "location_id", "name", "external_location_code" }` when the company picked specific ones, as with Northbend Self Storage. Poll this endpoint on a schedule, or whenever a call for a company you expected starts answering `403`, rather than assuming the roster never changes.

## Calling the API for a company

Every other partner request adds one header: `KISS-Company: <company_id>`, using the `company_id` from the discovery call above. The rest of the request is identical to a per-company key: same endpoints, same bodies, same responses, same `Idempotency-Key` rules.

### List units

```bash
curl "https://api-app.keepitsimplestorage.com/api/v2/units?per_page=100" \
  -H "Authorization: Bearer $KISS_PARTNER_TOKEN" \
  -H "KISS-Company: 01JATXQ1KZ7P4RN82VC9EWY30M"
```

### Look up a tenant by your id

```bash
curl "https://api-app.keepitsimplestorage.com/api/v2/tenants?filter[external_tenant_id]=LKS-T-20931" \
  -H "Authorization: Bearer $KISS_PARTNER_TOKEN" \
  -H "KISS-Company: 01JATXQ1KZ7P4RN82VC9EWY30M"
```

### Move a tenant in

```bash
curl -X PUT https://api-app.keepitsimplestorage.com/api/v2/units/01JATXS4N6WXK8T2VC0H9PQB3L/tenancy \
  -H "Authorization: Bearer $KISS_PARTNER_TOKEN" \
  -H "KISS-Company: 01JATXQ1KZ7P4RN82VC9EWY30M" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{
    "external_tenant_id": "LKS-T-20931",
    "move_in_date": "2026-10-05",
    "tenant": {
      "external_tenant_id": "LKS-T-20931",
      "first_name": "Priya",
      "last_name": "Nolan",
      "phone": "+15125550199"
    }
  }'
```

See [Assign primary user](/reference/v-2-units-tenancy-put) for the full field list. This call only updates a unit that already exists. A `unit_id` the company does not have, or one outside the locations it allowed you, answers `404` and nothing is created. Create units first with `POST /units` below.

### Move a tenant out

```bash
curl -X DELETE https://api-app.keepitsimplestorage.com/api/v2/units/01JATXS4N6WXK8T2VC0H9PQB3L/tenancy \
  -H "Authorization: Bearer $KISS_PARTNER_TOKEN" \
  -H "KISS-Company: 01JATXQ1KZ7P4RN82VC9EWY30M" \
  -H "Idempotency-Key: $(uuidgen)"
```

### Create a vacant unit

`POST /units` creates one unit with no tenant attached. Send `location_id` or `external_location_code` to place it, a `name`, and optionally your own `external_unit_id`:

```bash
curl -X POST https://api-app.keepitsimplestorage.com/api/v2/units \
  -H "Authorization: Bearer $KISS_PARTNER_TOKEN" \
  -H "KISS-Company: 01JATXQ8H6D3KXW0B7T5MN2VRF" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{
    "external_location_code": "NB-01",
    "name": "214",
    "external_unit_id": "NB-214"
  }'
```

It answers `201` with the new unit, in the same shape `GET /units` returns. Keep its `unit_id` for later calls:

```json
{
  "message": "Request successful.",
  "data": {
    "unit_id": "01JATXT6V2N9K4HQ7B1M8RWC5X",
    "unit_name": "214",
    "external_unit_id": "NB-214",
    "occupied": false
  },
  "meta": {}
}
```

The response above is shortened. If `external_unit_id` already belongs to another unit for that company, the call answers `409` with `code` set to `external_unit_id_conflict`; look that unit up with `GET /units` and use its `unit_id` instead.

## Location limits

If a company only enabled specific locations, your partner key behaves exactly like a location-scoped company key for that company: list calls are filtered to those locations, a unit outside them answers `404`, a write naming an out-of-scope location answers `422`, and a bulk `PATCH /units` reports the out-of-scope items in `data.errors` while the rest of the batch applies. See [Location-scoped tokens](/guides/authentication#location-scoped-tokens) for the full behavior; it applies here company by company, based on what each company chose.

## Rate limits

Each company you act for has its own per-minute budget, the same as a per-company key would have for that company. Your key as a whole is also capped at that budget times the number of companies that have enabled you. Every request your key makes counts toward that cap, including requests that are refused because the company has not enabled you. Going over either limit answers `429`. See [Rate limits](/guides/rate-limits) for how throttling works.

## Errors

| Status | Meaning |
| --- | --- |
| `401` | The partner key is missing, invalid, or has been revoked |
| `403` | `KISS-Company` is missing from the request; the company named has not enabled you, has disabled you, or has been closed; or the key lacks the scope the call needs |
| `404` | The unit or location is not reachable for that company, including a location the company did not allow, and a unit that belongs to a different company than the one named in `KISS-Company` |
| `429` | You went over the per-company budget or the cap for your key as a whole |

403, 404 and 429 responses follow the standard envelope described in [Error handling](/guides/error-handling):

```json
{ "message": "...", "data": [], "meta": [] }
```

A partner key answers `401` on `POST /auth/tenant-tokens`, since partner keys cannot carry `tenants:auth`.

## Moving from per-company keys

Existing per-company keys keep working unchanged. Getting a partner key does not revoke or affect them, and you can move one company at a time rather than all at once:

1. Confirm the company has enabled you: it appears in `GET /vendor/companies`.
2. Send the partner key with `KISS-Company` set to that company's id, in place of the per-company key.
3. Once all of your traffic for that company uses the partner key, ask the company admin, or KISS, to revoke the old per-company key.

`KISS-Company` is ignored when the request carries a per-company key instead of a partner key, so it is safe to add the header to your client before you have a partner key at all, and roll the switch out gradually.

## Security

Treat a partner key like a password, and a more sensitive one than a single per-company key: it reaches every company that has enabled you, not just one. Keep it server-side, store it in a secrets manager, and ask KISS to rotate it if it is ever exposed.
