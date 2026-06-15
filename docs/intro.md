---
sidebar_position: 1
sidebar_label: Start here
slug: /
---

# Start here

KISS is a smart-lock access platform for self-storage. Locks are NFC devices with no battery and no network connection: the tenant's phone powers and operates the lock through a tap, the same technology used for contactless payments. Because the lock itself is offline, everything intelligent happens in the apps and the platform behind them.

The **KISS API** is how external systems take part in that platform. Whether you run a property management system, build your own tenant app, or pull access data into your own tools, you talk to one versioned REST API.

**Base URL:**

```
https://api-app.keepitsimplestorage.com/api/v2
```

:::tip New to KISS?
Read [How access works](/docs/guides/concepts) first. It explains units, facts, and the access evaluator, which is the model everything else builds on.
:::

## One API, many writers

Reduced to its core, the product is a set of unit IDs matched to a set of keys, plus the logic that decides who may use them when. The API is organized around one idea:

> **The units table is the source of truth.** Every system that feeds KISS is a *writer* to it, and a `source` field records where each unit's data came from.

That keeps one mental model no matter who is integrating:

- **You write facts** about each unit: who rents it, whether they are paid up, whether it should be overlocked, whether it is in auction or out of service.
- **KISS evaluates** those facts into an access decision (the access evaluator), after every write.
- **The tenant's app reads** the evaluated result and opens the lock.

You never compute access yourself or hold key material. You keep the facts current; KISS does the rest and serves keys per tap.

## Who the API is for

The same endpoints serve every caller; a Bearer token's scope decides what each one can do. Most integrations fall into one of these shapes:

| You are | You want to | Start with |
| --- | --- | --- |
| A property management system or other data source | Push tenancy, balance, and overlock state into KISS | [PMS integration](/docs/guides/pms/quickstart) |
| A builder of your own tenant-facing app | Authenticate tenants and read their access bundle | [Mobile app integration](/docs/guides/white-label/quickstart) |
| A platform consumer | Pull logs, events, and reporting data | Talk to your KISS contact (guide coming) |

These describe the deepest layer KISS operates for you, from running everything (Full Platform), to running the back office while you bring your own tenant app (Back Office), to serving keys and logs into your own stack (API-Only). The contract is the same across all of them.

## Choose your path

- [How access works](/docs/guides/concepts) — the data model: units, tenants, facts, access states, entry points, and NFC keys.
- [Authentication](/docs/guides/authentication) — Bearer tokens and scopes for partners, one-time-password sign-in for tenants.
- [PMS integration](/docs/guides/pms/quickstart) — map your events to API calls and keep unit facts in sync.
- [Error handling](/docs/guides/error-handling) — the response envelope, status codes, idempotency, and troubleshooting.

:::info The full API reference is on its way
KISS generates a machine-readable reference (every endpoint, request and response schema, and error shape) directly from the running code, so it never drifts from the live API. We are publishing it for self-service access now. Until it is live, the guides above describe the contract for the endpoints in production. Ask your KISS contact if you need the OpenAPI spec or example collections in advance.
:::
