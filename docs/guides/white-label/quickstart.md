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

1. **Sign the user in.** Your users sign in through your app's own authentication, with no second KISS login. Your backend exchanges its company token plus the tenant's id in your system for a short-lived KISS access token (`POST /auth/tenant-tokens`, see [Authentication](/guides/authentication#mint-a-tenant-token)); the app uses it for the calls below.
2. **Fetch the user's access.** A single call, `GET /access`, returns everything the app needs to operate offline. Cache it on launch and refresh on pull-to-refresh.
3. **Open the lock.** The `key` on each lock is an **encrypted envelope**, not a usable key. Unwrap it with the KISS SDK, then hand the unwrapped key back to the SDK, which talks to the offline lock during a tap.
4. **Report activity.** After each tap (success, failure, or blocked), report it back through the logs endpoints so managers and support see real lock activity.

## Endpoints

| When | Call | What it does |
| --- | --- | --- |
| Sign a tenant in | <Method m="post" /> [`/auth/tenant-tokens`](/guides/authentication#mint-a-tenant-token) | Exchange your company token plus the tenant's id in your system for a short-lived tenant access token. |
| Fetch the user's access | <Method m="get" /> [`/access`](/reference/v-2-access) | The user's units, NFC keys, entry points, and timezone: everything to operate offline. |
| Report a lock tap | <Method m="post" /> [`/locks/{lock}/logs`](/reference/v-2-locks-logs-store) | Record open/close success, failure, or blocked. |
| Report an entry-point tap | <Method m="post" /> [`/entry-points/{id}/logs`](/reference/v-2-entry-points-logs-store) | Record a gate or door tap. |

Each call links to its reference page; tenant sign-in is covered in [Authentication](/guides/authentication). The access bundle is the heart of the integration, so it's detailed below.

:::caution Both log endpoints need an `Idempotency-Key`
They are writes, so the header is **required**, not optional: without it the call answers `422 Idempotency-Key header is required.` and the tap is never recorded. Send any opaque string up to 255 characters (a UUID per tap works well), and reuse the same value if you retry that tap. A successful log answers `201`. See the [Idempotency-Key](/guides/authentication#use-the-token) rules for what a retry replays.
:::

Both endpoints take the same body. `key` is required and must be one of the client-reportable values (`lock.open_successful`, `lock.open_failure`, `lock.open_blocked`, `lock.close_successful`, `lock.close_successful_confirmed`, `lock.close_failure`, `lock.close_blocked`, `lock.open_unconfirmed`, `lock.close_unconfirmed`, and the matching `entry_point.*` values). `reason` is required when `key` is either failure value, and optional otherwise. `happened_at` lets you backfill a tap the device recorded while offline. The reference pages list the optional telemetry fields alongside those.

## What `GET /access` returns

Everything the signed-in user's app needs to operate offline, in one call: their units and the keys to open locks.

| | |
| --- | --- |
| Auth | `Authorization: Bearer <token>`, the signed-in user's token |
| Caching | `ETag` + `Cache-Control: private, max-age=28800` (8 hours); send `If-None-Match` for a cheap `304` |

```bash
curl https://api-app.keepitsimplestorage.com/api/v2/access \
  -H "Authorization: Bearer $USER_TOKEN"
```

The response uses the standard `{ message, data, meta }` envelope; the facility `timezone`, the user's `units`, any `zones` shared with them, and the `entry_points` for their zones all live under `data`:

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
        "offline_access_mode": "server_expiry",
        "access_expires_at": "2026-06-21T23:59:59+00:00",
        "access_hours": { "start": "06:00", "end": "22:00" },
        "evaluated_at": "2026-06-16T14:30:00+00:00",
        "bundles": [
          {
            "id": "01KTSD2Q…",
            "display_name": "Unit B204",
            "closed_at": null,
            "lock": { "id": "01KTSD…", "name": "B204 Lock", "serial_number": "KEY-ABC", "key": "<encrypted>" }
          }
        ]
      }
    ],
    "zones": [],
    "entry_points": [
      {
        "id": "01KTSE…",
        "name": "Main Gate",
        "serial_number": "EP-12",
        "type": "gate",
        "key": "<encrypted>",
        "access_state": null,
        "access_reason": null,
        "access_hours": { "start": "06:00", "end": "22:00" },
        "offline_access_mode": "server_expiry",
        "access_expires_at": "2026-06-21T23:59:59+00:00",
        "is_remotely_openable": false,
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
- **On this endpoint a permitted unit has `access_reason: null`.** The reason is filled in only when the unit is denied. Gate your tap UI on `access_state`, never on a particular reason value.
- **Entry points invert that.** A gate the user may open reports `access_state: null` and `access_reason: null`; a value in either field means the user is blocked, and `key` is then `null` too.
- **`bundles` are present only when access is permitted.** A denied, vacant, auction, or unrentable unit returns no bundles, so there is nothing to tap.
- **The lock `key` is encrypted and bound to the bearer token** that fetched it, so only the session that fetched it can unwrap it. Unwrap it with the SDK before tapping; see [The lock SDK](#the-lock-sdk).
- **Entry-point `zones` carry `access_start_time` / `access_end_time`** so the app can enforce access hours offline.
- **`access_expires_at` is yours to enforce, and it is the one field you must not ignore.** When `offline_access_mode` is `server_expiry`, that timestamp is how long the cached decision may be trusted without talking to us. The lock is offline and cannot check it, so a cached key keeps physically working: if your app stops honouring the expiry, a tenant who stopped paying keeps opening the door. Refuse the tap yourself once it passes, and clear the cached key. `default` mode means no server-side expiry applies.
- **`zones` is the guest sharing section.** It is an empty array for an ordinary renter, and carries a shared zone with its own entry points and keys for someone given access to a zone rather than a unit.

Because the response is self-contained and cached, the app keeps working with no connectivity after the first successful fetch.

:::note Machine schema in the reference
`GET /access` is live in production and its contract is settled. Build against the shape above; its [API Reference](/reference/v-2-access) page mirrors the same endpoint.
:::

## The lock SDK

The NFC key from `GET /access` is not something your app sends to the lock directly, and it is not usable as it arrives. A KISS lock is an **offline device with no network**, and opening it is a secure exchange over NFC. The **KISS lock SDK** is the piece that runs that exchange.

What the SDK does:

- **Unwraps the key.** `unwrapAccessKey()` turns the encrypted `lock.key` envelope from the bundle into the plain key the lock expects. It takes the envelope, the same tenant access token you fetched it with, and an encryption secret KISS gives you during onboarding. The token is part of the decryption, so a rotated or expired token cannot unwrap an envelope fetched under a different one.
- **Runs the tap.** You start a scan, the SDK connects to whichever lock answers, and you call unlock or lock with the unwrapped key. It speaks the lock's own protocol, which is the part you cannot build yourself, and needs no connectivity.
- **Reports structured results and errors.** A genuine failure (wrong key, NFC disabled, scan timeout, wrong lock) rejects with a stable error code you branch on rather than a message.

What it does not do: your sign-in, your API calls, or your UI. Those stay in your app; the SDK is only the lock-communication layer.

### Results are graded, not pass/fail

This is the part most worth designing for. A completed tap does not return a simple success. It returns an outcome, and only one of them is a hard confirmation:

| Outcome | What it means |
| --- | --- |
| `confirmed` | The motor reported completion. The only observed guarantee. |
| `fieldLostAfterStart` | The phone was pulled away mid-cycle. The lock finishes on its own, so this is a real success. |
| Other `unconfirmed*` values | The actuation almost certainly ran, but the SDK could not observe it finishing. |

**Do not render anything other than `confirmed` as a failure.** These values exist so your UI and your telemetry can tell an observed success from an inferred one. Two are worth special handling: a lock that reports no motor progress at all is deterministic for that lock, and an undervolt or a mid-stroke reset leaves the bolt position genuinely unknown, so neither should be drawn as locked or unlocked. The SDK reference lists the full set.

The outcomes map onto what you report in step 4: a confirmed tap logs `lock.open_successful`, and an unconfirmed one logs `lock.open_unconfirmed` with the telemetry fields that describe it.

It is built as **native iOS and Android** components, with the lock protocol compiled in rather than shipped as source, so the sensitive part stays inside the SDK while you build against a small, documented API. What partners consume today is the **React Native Turbo Native Module**, which wraps those compiled native components for an RN app. Building a fully native iOS or Android app? The native components exist, but they are not packaged for standalone distribution yet — reach out to your KISS contact to talk through timing.

:::info Access is by partnership agreement
The SDK isn't on a public package registry. Once your partnership agreement with KISS is signed, we add your team to the private SDK repository as a GitHub collaborator or via a deploy key, and you install it as a normal git dependency, pinned to a release tag. **Reach out to your KISS contact (or [help@keepitsimplestorage.com](mailto:help@keepitsimplestorage.com)) to get started.**
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
