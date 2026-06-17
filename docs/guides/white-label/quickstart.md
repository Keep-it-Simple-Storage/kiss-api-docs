---
sidebar_position: 1
sidebar_label: "App partners"
sidebar_custom_props:
  icon: mobile
---

import {Cards, Card} from '@site/src/components/Cards';
import Method from '@site/src/components/Method';

# App partners

This guide is for **app partners**: teams building their own tenant-facing app on KISS access. Your app signs users in with your own authentication, reads their access bundle, opens locks over NFC through the KISS SDK, and reports the result. KISS handles the access decisions; you own the sign-in and the whole customer experience.

## What KISS handles for you

You build the tenant app; KISS runs the back office. You keep each unit's facts current, and KISS turns those facts into access decisions: the evaluation stack that handles delinquency, overlocks, auctions, and move-in timing; access grants for sharing a unit with guests; and employee management, including keeping staff out of units they should not enter based on a unit's status. Locks, units, tenants, and logs are managed in the ONELock Manager app and web portal.

:::note Keeping the facts current
KISS decides access from each unit's facts (who rents it, whether they are paid up, whether it is overlocked). If your facilities run on a property management system KISS already integrates with, that prebuilt integration keeps those facts current for you, and your app only needs the tenant-app loop below. **If not, you (or your PMS) have to push unit and tenant facts into KISS yourself**, following the [Sync partners](/guides/pms/quickstart) approach. In that case you build both halves: the sync that keeps facts fresh, and the tenant app that reads access and opens locks.
:::

Operators who use the KISS tenant app (ONELock Access) instead of building their own are on the Full Platform model and do not need this guide.

## The core loop

The tenant app does four things:

1. **Sign the user in.** Your users sign in through your app's own authentication, with no second KISS login. Your backend obtains a short-lived KISS access token for the signed-in user (see [Authentication](/guides/authentication)); the app uses it for the calls below.
2. **Fetch the user's access.** A single call, `GET /access`, returns everything the app needs to operate offline. Cache it on launch and refresh on pull-to-refresh.
3. **Open the lock.** Pass the NFC key to the KISS Flutter SDK, which talks to the offline lock during a tap. Keys are served per tap, never stored as a static dump.
4. **Report activity.** After each tap (success, failure, or blocked), report it back through the logs endpoints so managers and support see real lock activity.

:::info Coming soon (KEEP-958)
Step 1 keeps your own login: a partner-brokered token mint (your backend exchanges its company token for a tenant access token) is being built so you never stack a second sign-in on top of your app's. Until it ships, set up tenant auth with your KISS contact. See [Authentication](/guides/authentication).
:::

## Endpoints

| When | Call | What it does |
| --- | --- | --- |
| Fetch the user's access | <Method m="get" /> [`/access`](/reference/v-2-access) | The user's units, NFC keys, entry points, and timezone: everything to operate offline. |
| Report a lock tap | <Method m="post" /> [`/locks/{lock}/logs`](/reference/v-2-locks-logs-store) | Record open/close success, failure, or blocked. |
| Report an entry-point tap | <Method m="post" /> [`/entry-points/{id}/logs`](/reference/v-2-entry-points-logs-store) | Record a gate or door tap. |

Each call links to its reference page; tenant sign-in is covered in [Authentication](/guides/authentication). The access bundle is the heart of the integration, so it's detailed below.

## What `GET /access` returns

Everything the signed-in user's app needs to operate offline, in one call: their units and the keys to open locks.

| | |
| --- | --- |
| Auth | `Authorization: Bearer <token>` — the signed-in user's token |
| Caching | `ETag` + `Cache-Control: private, max-age=28800` (8 hours); send `If-None-Match` for a cheap `304` |

```bash
curl https://api-app.keepitsimplestorage.com/api/v2/access \
  -H "Authorization: Bearer $USER_TOKEN"
```

The response uses the standard `{ message, data, meta }` envelope; the facility `timezone`, the user's `units`, and the `entry_points` for their zones all live under `data`:

```json
{
  "message": "...",
  "meta": {},
  "data": {
    "timezone": "America/Denver",
    "units": [
      {
        "unit_id": "01KTSC4X57H4M49E661CW41BXE",
        "unit_name": "B204",
        "access_state": "tenant_permitted",
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
        "key": "<encrypted>",
        "zones": [
          { "id": "01KTSZ…", "name": "Building B", "display_name": "Building B", "access_start_time": "06:00", "access_end_time": "22:00" }
        ]
      }
    ]
  }
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
    The token model: partner API tokens and how your tenants get a KISS access token.
  </Card>
  <Card title="API Reference" icon="reference" href="/reference/kiss-api-reference">
    Endpoint and schema reference for the core integration surface.
  </Card>
</Cards>
