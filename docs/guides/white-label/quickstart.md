---
sidebar_position: 1
sidebar_label: "App partners"
sidebar_custom_props:
  icon: mobile
---

import {Cards, Card} from '@site/src/components/Cards';
import Method from '@site/src/components/Method';

# App partners

This guide is for **app partners**: teams building their own holder-facing app on KISS access. Your app signs the user in, reads their access bundle, opens locks over NFC through the KISS SDK, and reports the result. KISS handles the access decisions; your app handles the experience.

## Two ways to integrate

App partners fall into two camps, depending on how much of the back office you run yourself. Both build the same holder app on the same core loop (below). They differ only in who manages units, tenants, and overlocks day to day.

### Back Office

You build the holder app and let KISS run the back office. Locks are installed and assigned with the ONELock Manager app; units, tenants, overlocks, and access logs live in the KISS web portal, or arrive from a [sync partner](/guides/pms/quickstart) feeding unit facts in. Your code does only the holder loop: sign in, read access, open locks, report taps. This is the lighter lift and the right starting point for most teams.

### API-Only

You build the holder app and also drive unit and tenant state yourself, through the API and into your own systems. On top of the holder loop you keep each unit's access facts current (`PATCH /units`), assign and remove a unit's primary user (`PUT` / `DELETE /units/{unit_id}/tenancy`), and read unit state (`GET /units`). That write surface is exactly the one in the [Sync partners](/guides/pms/quickstart) guide, so an API-only app partner is a sync partner and an app partner in a single integration. KISS narrows to evaluating your facts and serving keys per tap.

This model uses two kinds of token: a per-end-user tenant token (phone plus OTP) for the holder loop, and a per-company partner API token (scoped `pms:read` / `pms:write`) for the back-office writes. See [Authentication](/guides/authentication) for both.

Operators who use the KISS tenant app (ONELock Access) instead of building their own are on the Full Platform model and do not need this guide.

:::note Installing locks always uses the Manager app
In both camps, physically installing a lock, registering it to a unit, and configuring shared entry points and zones are done on-site with the ONELock Manager app and the web portal. KISS locks are offline NFC devices, so commissioning one needs a physical tap, and those steps sit outside the partner API token's surface. "API-only" describes who owns the tenant experience and day-to-day unit management, not the one-time physical setup.
:::

## The core loop

Whichever camp you are in, the holder app does the same four things:

1. **Sign the user in.** Request a code with `POST /auth/otp`, then exchange the user's phone number and code for a Bearer token with `POST /auth/tokens`. See [Authentication](/guides/authentication) for the full flow, including phones linked to more than one account.
2. **Fetch the user's access.** A single call, `GET /access`, returns everything the app needs to operate offline. Cache it on launch and refresh on pull-to-refresh.
3. **Open the lock.** Pass the NFC key to the KISS Flutter SDK, which talks to the offline lock during a tap. Keys are served per tap, never stored as a static dump.
4. **Report activity.** After each tap (success, failure, or blocked), report it back through the logs endpoints so managers and support see real lock activity.

## Endpoints

| When | Call | What it does |
| --- | --- | --- |
| Request a sign-in code | <Method m="post" /> `/auth/otp` | Send the user's phone number; KISS texts a 6-digit code. |
| Exchange the code for a token | <Method m="post" /> `/auth/tokens` | Phone plus code (`grant: otp`) returns the Bearer token your app uses for every call below. |
| Fetch the user's access | <Method m="get" /> [`/access`](/reference/v-2-access) | The user's units, NFC keys, entry points, and timezone: everything to operate offline. |
| Report a lock tap | <Method m="post" /> [`/locks/{lock}/logs`](/reference/v-2-locks-logs-store) | Record open/close success, failure, or blocked. |
| Report an entry-point tap | <Method m="post" /> [`/entry-points/{id}/logs`](/reference/v-2-entry-points-logs-store) | Record a gate or door tap. |

The access and log calls link to their reference pages; the sign-in calls are walked through in [Authentication](/guides/authentication). The access bundle is the heart of the integration, so it's detailed below.

:::tip API-only partners write too
The table above is the holder loop, which every app partner builds. On the **API-Only** model you also call the unit and tenancy write endpoints to manage state from your own stack; those are in the [Sync partners endpoints](/guides/pms/quickstart#endpoints) table.
:::

## What `GET /access` returns

Everything the signed-in user's app needs to operate offline, in one call: their units and the keys to open locks.

| | |
| --- | --- |
| Auth | `Authorization: Bearer <token>` — the signed-in user's token |
| Caching | `ETag` + `Cache-Control: private, max-age=14400` (4 hours); send `If-None-Match` for a cheap `304` |

```bash
curl https://api-app.keepitsimplestorage.com/api/v2/access \
  -H "Authorization: Bearer $USER_TOKEN"
```

The response contains the facility `timezone`, the user's `units`, and the `entry_points` for their zones:

```json
{
  "timezone": "America/Denver",
  "units": [
    {
      "unit_id": "01KTSC4X57H4M49E661CW41BXE",
      "unit_name": "B204",
      "access_state": "permitted",
      "access_reason": null,
      "evaluated_at": "2026-06-16T14:30:00Z",
      "bundles": [
        {
          "id": "01KTSD2Q…",
          "display_name": "Unit B204",
          "lock": { "id": "01KTSD…", "name": "B204 Lock", "serial_number": "KEY-ABC", "key": "<encrypted>" }
        }
      ]
    }
  ],
  "entry_points": [
    {
      "id": "01KTSE…",
      "name": "Main Gate",
      "serial_number": "EP-12",
      "type": "gate",
      "zones": [
        { "id": "01KTSZ…", "name": "Building B", "access_start_time": "06:00", "access_end_time": "22:00" }
      ]
    }
  ]
}
```

Key things to build against:

- **`access_state` + `access_reason`** per unit are the evaluator's decision (see [How access works](/guides/concepts)). Use the reason to explain *why* a unit is locked, not just that it is.
- **`bundles` are present only when access is permitted.** A denied, vacant, auction, or unrentable unit returns no bundles, so there is nothing to tap.
- **The lock `key` is encrypted and bound to the bearer token** that fetched it, so only that device can use it. Keys are served per tap, never exported.
- **Entry-point `zones` carry `access_start_time` / `access_end_time`** so the app can enforce access hours offline.

Because the response is self-contained and cached, the app keeps working with no connectivity after the first successful fetch.

:::note Machine schema in the reference
`GET /access` is live in production and its contract is settled. Build against the shape above; its [API Reference](/reference/v-2-access) page mirrors the same endpoint.
:::

## Keep going

<Cards>
  <Card title="How access works" icon="concepts" href="/guides/concepts">
    The data model and the precedence rules behind every access decision.
  </Card>
  <Card title="Authentication" icon="auth" href="/guides/authentication">
    The token model: user OTP sign-in and partner API tokens.
  </Card>
  <Card title="API Reference" icon="reference" href="/reference/kiss-api-reference">
    The complete, always-current endpoint and schema reference, generated from code.
  </Card>
</Cards>
