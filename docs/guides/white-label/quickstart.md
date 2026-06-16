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

## The core loop

A holder app does four things:

1. **Sign the user in.** Users authenticate with their mobile number and a one-time SMS code (OTP), and your app receives a Bearer token. If a number is linked to more than one account, the user picks which one. See [Authentication](/guides/authentication) for the token model.
2. **Fetch the user's access.** A single call, `GET /access`, returns everything the app needs to operate offline. Cache it on launch and refresh on pull-to-refresh.
3. **Open the lock.** Pass the NFC key to the KISS Flutter SDK, which talks to the offline lock during a tap. Keys are served per tap, never stored as a static dump.
4. **Report activity.** After each tap (success, failure, or blocked), report it back through the logs endpoints so managers and support see real lock activity.

:::note Sign-in endpoints are still being finalized
`GET /access` is live (documented below). The tenant OTP **sign-in** endpoints are still being finalized on `/api/v2`, so this guide describes that step conceptually; see [Authentication](/guides/authentication) or ask your KISS contact for current paths.
:::

## Endpoints

| When | Call | What it does |
| --- | --- | --- |
| Sign the user in | OTP sign-in *(finalizing)* | Phone + one-time code → a Bearer token. See [Authentication](/guides/authentication); paths are being finalized. |
| Fetch the user's access | <Method m="get" /> [`/access`](/reference/v-2-access) | The user's units, NFC keys, entry points, and timezone — everything to operate offline. |
| Report a lock tap | <Method m="post" /> [`/locks/{lock}/logs`](/reference/v-2-locks-logs-store) | Record open/close success, failure, or blocked. |
| Report an entry-point tap | <Method m="post" /> [`/entry-points/{id}/logs`](/reference/v-2-entry-points-logs-store) | Record a gate or door tap. |

Each call links to its reference page. The access bundle is the heart of the integration, so it's detailed below.

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
`GET /access` is in production now. Its machine-readable schema in the [API Reference](/reference/v-2-access) is being enriched; until then the shape above is the contract.
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
