---
sidebar_position: 1
sidebar_label: "Mobile app integration"
sidebar_custom_props:
  icon: mobile
---

import {Cards, Card} from '@site/src/components/Cards';

# Mobile app integration

This path is for teams building their own tenant-facing app on top of KISS access. Your app signs the tenant in, reads their access bundle, opens locks over NFC through the KISS SDK, and reports the result. KISS handles the access decisions; your app handles the experience.

:::note The V2 mobile surface is being finalized
The tenant sign-in and access endpoints are moving onto the versioned `/api/v2` surface under the Mobile Migration work. The concrete request and response shapes are converging now, so this guide describes the flow rather than freezing endpoint details that would drift. For the exact, current paths and schemas, see the **[API Reference](https://app.keepitsimplestorage.com/docs/api)** or ask your KISS contact. The conceptual model below is stable.
:::

## The core loop

A tenant app does four things:

1. **Sign the tenant in.** Tenants authenticate with their mobile number and a one-time SMS code (OTP), and your app receives a Bearer token. If a number is linked to more than one account, the tenant picks which one. See [Authentication](/guides/authentication) for the token model.
2. **Fetch the access bundle.** A single call (`GET /access`) returns everything the app needs to operate offline: the tenant's units with their evaluated `state` and `reason`, the entry points for their zones, the NFC keys, and the facility timezone. Cache it on launch and refresh on pull-to-refresh.
3. **Open the lock.** Pass the NFC key to the KISS Flutter SDK, which talks to the offline lock during a tap. Keys are served per tap, never stored as a static dump.
4. **Report activity.** After each tap (success, failure, or blocked), report it back through the logs endpoint so managers and support see real lock activity.

## What the access bundle gives you

The bundle is the same evaluated output described in [How access works](/guides/concepts). For each unit you get the final `access` decision plus the `state` and `reason` behind it, so your UI can explain *why* a unit is locked (for example `delinquent` or `future_move_in`), not just that it is. Entry points carry a `would_have_access` flag so you can tell "denied because of a unit denial in this zone" apart from "no access here at all."

Because the bundle is self-contained and cached, the app keeps working with no connectivity after the first successful fetch.

## Reporting lock activity

Each NFC interaction maps to a log event (opened, failed, blocked, and the close-side equivalents) sent to the logs endpoint for the lock or entry point. The exact event keys live in the [API Reference](https://app.keepitsimplestorage.com/docs/api); report every attempt so the activity feed reflects reality.

## Keep going

<Cards>
  <Card title="How access works" icon="concepts" href="/guides/concepts">
    The data model and the precedence rules behind every access decision.
  </Card>
  <Card title="Authentication" icon="auth" href="/guides/authentication">
    The token model: tenant OTP sign-in and partner API tokens.
  </Card>
  <Card title="API Reference" icon="reference" href="https://app.keepitsimplestorage.com/docs/api">
    The complete, always-current endpoint and schema reference, generated from code.
  </Card>
</Cards>
