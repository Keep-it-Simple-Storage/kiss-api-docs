---
sidebar_position: 1
sidebar_label: "App partners"
sidebar_custom_props:
  icon: mobile
---

import {Cards, Card} from '@site/src/components/Cards';
import Method from '@site/src/components/Method';

# App partners

This guide is for **app partners**: teams building their own tenant-facing app on KISS access. Your app signs users in with your own authentication, reads their access bundle, opens KISS smart locks over NFC through the KISS lock SDK for React Native, and reports the result. KISS handles the access decisions; you own the sign-in and the whole customer experience.

## What KISS handles for you

You build the tenant app; KISS runs the back office. You keep each unit's facts current, and KISS turns those facts into access decisions: the evaluation stack that handles delinquency, overlocks, auctions, and move-in timing; access grants for sharing a unit with guests; and employee management, including keeping staff out of units they should not enter based on a unit's status. Locks, units, tenants, and logs are managed in the ONELock Manager app and web portal.

:::note Keeping the facts current
KISS decides access from each unit's facts (who rents it, whether they are paid up, whether it is overlocked). If your facilities run on a property management system KISS already integrates with, that prebuilt integration keeps those facts current for you, and your app only needs the tenant-app loop below. **If not, you (or your PMS) have to push unit and tenant facts into KISS yourself**, following the [Sync partners](/guides/pms/quickstart) approach. In that case you build both halves: the sync that keeps facts fresh, and the tenant app that reads access and opens locks.
:::

Operators who use the KISS tenant app (ONELock Access) instead of building their own are on the Full Platform model and do not need this guide.

## The core loop

The tenant app does four things:

1. **Sign the user in.** Your users sign in through your app's own authentication, with no second KISS login. Your backend exchanges its company token plus the tenant's id in your system for a short-lived KISS access token (`POST /auth/tenant-tokens`, see [Authentication](/guides/authentication#mint-a-tenant-token)); the app uses it for the calls below.
2. **Fetch the user's access.** A single call, `GET /access`, returns everything the app needs to operate offline. Cache it, together with the token that fetched it, on launch; refresh it on pull-to-refresh and whenever the app is online before it shows lock actions.
3. **Open the lock.** The `key` on each lock is an **encrypted envelope**, not a usable key. Unwrap it with the KISS lock SDK, then hand the unwrapped key back to the SDK, which talks to the offline lock during a tap. Check that the lock the tenant tapped is the one you meant before you act on it.
4. **Report activity.** After each tap (success, failure, or blocked), report it back through the logs endpoints so managers and support see real lock activity. See [Reporting a tap](#reporting-a-tap) for how to fill in the log.

## Endpoints

| When | Call | What it does |
| --- | --- | --- |
| Sign a tenant in | <Method m="post" /> [`/auth/tenant-tokens`](/guides/authentication#mint-a-tenant-token) | Exchange your company token plus the tenant's id in your system for a short-lived tenant access token. |
| Fetch the user's access | <Method m="get" /> [`/access`](/reference/v-2-access) | The user's units, NFC keys, entry points, and timezone: everything to operate offline. |
| Report a lock tap | <Method m="post" /> [`/locks/{lock}/logs`](/reference/v-2-locks-logs-store) | Record open/close success, failure, or blocked. |
| Report an entry-point tap | <Method m="post" /> [`/entry-points/{entryPoint}/logs`](/reference/v-2-entry-points-logs-store) | Record a gate or door tap. |

Each call links to its reference page; tenant sign-in is covered in [Authentication](/guides/authentication). The access bundle is the heart of the integration, so it's detailed below.

:::caution Both log endpoints need an `Idempotency-Key`
They are writes, so the header is **required**, not optional: without it the call answers `422 Idempotency-Key header is required.` and the tap is never recorded. Send any opaque string up to 255 characters (a UUID per tap works well), and reuse the same value if you retry that tap. A successful log answers `201`. See the [Idempotency-Key](/guides/authentication#use-the-token) rules for what a retry replays.
:::

Both endpoints take the same body. `key` is required and must be one of the client-reportable values (`lock.open_successful`, `lock.open_failure`, `lock.open_blocked`, `lock.close_successful`, `lock.close_successful_confirmed`, `lock.close_failure`, `lock.close_blocked`, `lock.open_unconfirmed`, `lock.close_unconfirmed`, and the matching `entry_point.*` values). `reason` is required when `key` is a failure value for that endpoint (`lock.open_failure` or `lock.close_failure` on a lock, `entry_point.open_failure` or `entry_point.close_failure` on an entry point), and optional otherwise. `happened_at` lets you backfill a tap the device recorded while offline. The reference pages list the optional telemetry fields alongside those, and [Reporting a tap](#reporting-a-tap) covers the ones that matter most for a lock tap. The entry-point endpoint also accepts a `zone_id`: leave it out, because it is not used and a value the server does not recognise rejects the whole log, so the tap is never recorded.

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
            "lock": { "id": "01KTSD…", "name": "B204 Lock", "serial_number": "5769430201223439989", "key": "<encrypted>" }
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
- **The lock `key` is encrypted, and it must be unwrapped with the same token that fetched it.** Keep each envelope with that token, and unwrap it with the SDK before tapping; see [The lock SDK](#the-lock-sdk).
- **The lock `id` and `serial_number` do different jobs.** `id` (a ULID) is what you put in the path when you [report a tap](#reporting-a-tap), as `{lock}` in `POST /locks/{lock}/logs`. `serial_number` is a decimal number that identifies the physical lock, and it is what you compare against the lock the tenant actually tapped.
- **The `ETag` ignores the token.** It changes when the access data changes, not when the token does, so after you mint a new token a request with `If-None-Match` can answer `304` and leave you holding envelopes only the old token can unwrap. Keep each bundle with the token that fetched it, and fetch without `If-None-Match` after a token change if you want envelopes for the new one.
- **Entry-point `zones` carry `access_start_time` / `access_end_time`** so the app can enforce access hours offline.
- **`access_expires_at` is yours to enforce, and it is the one field you must not ignore.** When `offline_access_mode` is `server_expiry`, that timestamp is how long the cached decision may be trusted without talking to us. The lock is offline and cannot check it, so a cached key keeps physically working: if your app stops honouring the expiry, a tenant who stopped paying keeps opening the door. Refuse the tap yourself once it passes, and clear the cached key. `default` mode means no server-side expiry applies.
- **`zones` is the guest sharing section.** It is an empty array for an ordinary renter, and carries a shared zone with its own entry points and keys for someone given access to a zone rather than a unit.

Because the response is self-contained and cached, the app keeps working with no connectivity after the first successful fetch. Cache the bundle as it arrives, with its envelopes still encrypted: unwrap a key only at tap time, and never persist the unwrapped key. The SDK has no notion of expiry or revocation and opens with whatever key it is handed, so a revoked grant stops working on a device only once the app re-fetches (or `access_expires_at` passes).

:::note Machine schema in the reference
`GET /access` is live in production and its contract is settled. Build against the shape above; its [API Reference](/reference/v-2-access) page mirrors the same endpoint.
:::

## The lock SDK

The NFC key from `GET /access` is not something your app sends to the lock directly, and it is not usable as it arrives. A KISS smart lock is an **offline device with no network**, and opening it is a secure exchange over NFC. The **KISS lock SDK** is the piece that runs that exchange.

What the SDK does:

- **Unwraps the key.** `unwrapAccessKey()` turns the encrypted `lock.key` envelope from the bundle into the plain key the lock expects. It takes the envelope, the tenant access token that fetched it, and an encryption secret KISS gives you during onboarding. The envelope must be unwrapped with the same token that fetched it: if the token has changed since, refetch `GET /access` with the current one (without `If-None-Match`).
- **Runs the tap.** You call `connect()` to start a scan, and the SDK connects to whichever supported lock answers. You then call `unlock()` or `lock()` on the session with the unwrapped key and the lock's `name` from the bundle, and close the session on every path, including errors (it is not automatic). It speaks the lock's own protocol, which is the part you cannot build yourself, and needs no connectivity.
- **Tells you which lock answered.** `session.lockId` identifies the lock under the phone, so you can check it against the lock you meant before you act. See [Which lock was tapped?](#which-lock-was-tapped)
- **Reports structured results and errors.** A completed action resolves with a graded outcome (below). A genuine failure (wrong key, NFC disabled, scan timeout, lost contact) rejects with a stable error code you branch on rather than a message.

What it does not do: your sign-in, your API calls, your access decisions, or your UI. Those stay in your app; the SDK is only the lock-communication layer. It has no notion of expiry or revocation, so deciding whether to open (from `access_state` and `access_expires_at`) is your app's job, before any tap.

The SDK repository's README (you'll get access with the SDK) is the full reference: every function, option, outcome and error code, the platform setup, and a working example app.

### Results are graded, not pass/fail

This is the part most worth designing for. A completed tap does not return a simple success. It returns an outcome, and only one of them is a hard confirmation:

| Outcome | What it means |
| --- | --- |
| `confirmed` | The lock confirmed the action. The only hard guarantee. |
| `fieldLostAfterStart` | The lock started, then the phone moved away. The lock finishes on its own, so this is a real success. |
| Other `unconfirmed*` values | The lock could not confirm the action. Most of these probably completed, but not all, and for some the lock's position is unknown. |

**Do not render an unconfirmed outcome as a failure,** and where the lock's position is unknown, do not draw it as locked or unlocked either. These values exist so your UI and your telemetry can tell an observed success from an inferred one, and tell you whether asking for another tap can help. You do not need to classify them yourself: the SDK's `isSuccessfulOutcome()` is `true` for `confirmed` and `fieldLostAfterStart`, and `shouldRetryOutcome()` is `true` where another tap can help. The SDK can also retry for you (`unlock(keyHex, name, { retry: {} })`), within a bounded number of attempts and time. The SDK repository's README has a "What to do with each outcome" table that lists every outcome and what to show for it.

### Which lock was tapped?

Before you call `unlock()` or `lock()`, compare `session.lockId` with the `serial_number` of the lock you meant. They are the same number in two notations: `lockId` is 16 hex characters, and `serial_number` is decimal. `lockId` is **not** the lock's `id` (the ULID from `GET /access`), so never compare those two.

The SDK repository's README has a "Which lock was tapped?" section with a ready-made `isTappedLock()` helper for the comparison. Use it rather than writing your own: the values can be larger than JavaScript numbers hold exactly, so a naive comparison gets them wrong. It returns:

- `true`: the tenant tapped the lock you meant. Go ahead. For a unit with several locks, pick the lock whose serial matches and use its key.
- `false`, and no other lock on the unit matches: the wrong lock. Close the session without acting on it, tell the tenant, and log it as `lock.open_failure` (or `lock.close_failure`) with `error_code: "wrong_lock"`. There is no SDK error in this case, since nothing was sent to the lock.
- `null`: no evidence either way (for example, the serial is missing). Go ahead with the lock the tenant chose.

The SDK does not detect a wrong lock for you, so this check is yours to make.

### Platforms, requirements and access

The SDK ships as a **React Native** package, and it runs on both iOS and Android. **React Native is the only supported way to integrate.** There is no standalone native SDK for iOS (Swift) or Android (Kotlin), and no Flutter SDK; if your app is built that way, talk to your KISS contact.

| | |
| --- | --- |
| React Native | The New Architecture (the SDK is a Turbo Native Module, with no legacy-bridge fallback) |
| Expo | A custom development client or an EAS build. It will not load under Expo Go |
| iOS | iOS 15.1 or later, on a real device with NFC, plus the NFC Tag Reading capability and an NFC usage description |
| Android | Android 7.0 (API 24) or later, on a phone with NFC, plus the NFC permission |

The lock protocol inside the SDK is compiled in rather than shipped as source, so the sensitive part stays inside it while you build against a small, documented API.

:::caution Some lock types are not supported yet
The SDK opens KISS smart locks. Some KISS lock types are not supported yet: unsupported lock types are reported through `onUnsupportedChip`, and the scan carries on, so that lock never connects. Locks of those types can still appear in `GET /access`.
:::

:::info Access is by partnership agreement
The SDK is not on a public package registry. It lives in a private GitHub repository, and once your partnership agreement with KISS is signed, we give your team read-only access, either as GitHub collaborators or through a read-only deploy key. You then install it as a git dependency over SSH, pinned to a release tag:

```json
{
  "dependencies": {
    "kiss-lock-sdk": "git+ssh://git@github.com/Keep-it-Simple-Storage/kiss-lock-sdk-react-native.git#v1.1.0"
  }
}
```

Every machine that runs the install, including your CI and cloud builds, needs an SSH key GitHub accepts for that repository. To upgrade, change the tag and reinstall; each release's notes are on the repository's Releases page. **Reach out to your KISS contact (or [help@keepitsimplestorage.com](mailto:help@keepitsimplestorage.com)) to get started.**
:::

## Reporting a tap

After every tap, report what happened with <Method m="post" /> [`/locks/{lock}/logs`](/reference/v-2-locks-logs-store). This is how managers and support see real lock activity, and the fields below are what let KISS tell one kind of failure from another.

- **`{lock}` is the lock's `id`** from `GET /access` (the ULID in `bundles[].lock.id`), not its `serial_number` and not `session.lockId`.
- **`scanned_lock_serial`** is the lock the phone actually reached: `"0x" + session.lockId`. Send it whenever a session connected, including on failures, so a wrong-lock tap can be spotted.
- **`key`** says what the tenant was shown, from the outcome or error, as in the tables below. Send `lock.open_blocked` (or `lock.close_blocked`) when your app refused before any tap, for example because the unit is not `tenant_permitted` or the cached decision has expired.
- **`reason`** is required on `lock.open_failure` and `lock.close_failure`. Send short text that says what went wrong; the SDK error code works.
- **`error_code`** is optional, but it is the field KISS uses to group failures. The server accepts only its own snake_case values, listed below. **Anything else is accepted but stored as null**, so a raw SDK code such as `fieldLost` is lost rather than rejected.

### From an outcome

| Outcome | Log `key` (unlock / lock) | Also send |
| --- | --- | --- |
| `confirmed` | `lock.open_successful` / `lock.close_successful` | |
| `fieldLostAfterStart` | `lock.open_successful` / `lock.close_successful` | `field_lost_after_start: true` |
| Any `unconfirmed*` | `lock.open_unconfirmed` / `lock.close_unconfirmed` | `reason`: the cause token for that outcome (see below) |

On an unconfirmed log, `reason` is the only field that tells the causes apart, and **it must be the server's cause token for that outcome, not the outcome name.** The server recognises its own tokens only: an outcome name such as `unconfirmedPollTimeout` is stored as plain text and not counted by cause. Ask your KISS contact for the token that goes with each `unconfirmed*` outcome.

`lock.close_successful_confirmed` is not an SDK outcome: send it when the tenant confirms in your UI that the lock is physically shut.

### From an error

When `unlock()`, `lock()`, `connect()` or `unwrapAccessKey()` rejects, log `lock.open_failure` (or `lock.close_failure`) with a `reason`, and map the SDK's `error.code` to `error_code`:

| SDK error | `error_code` |
| --- | --- |
| `fieldLost` | `connection_lost` |
| `wrongKey` | `wrong_key` |
| `keyUnavailable` | `key_unavailable` |
| `unknown` from `unwrapAccessKey()` | `key_decrypt_failed` |
| `unknown` from anything else | `unknown` |
| `dpNotDefined`, when your serial check returned `true` | `dp_not_defined` |
| `dpNotDefined`, when your serial check returned `false` or `null` | `wrong_lock` |
| `sessionTimeout` | `session_timeout` |
| `systemIsBusy` | `system_busy` |
| `userCanceled` | `user_canceled` |
| `nfcDisabled` | `nfc_disabled` |
| `notInitialized` | `not_initialized` |
| `sessionInvalidated` | `session_invalidated` |

The SDK never produces `wrongLock`; a wrong lock is something you detect with the serial check. New SDK error codes can arrive in a minor release, so keep a default branch that sends `unknown`.

Entry-point taps follow the same rules on <Method m="post" /> [`/entry-points/{entryPoint}/logs`](/reference/v-2-entry-points-logs-store), with the matching `entry_point.*` keys.

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
