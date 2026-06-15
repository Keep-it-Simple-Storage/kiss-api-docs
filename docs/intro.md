---
sidebar_position: 1
sidebar_label: Start here
slug: /
---

import {Cards, Card} from '@site/src/components/Cards';

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

Reduced to its core, the product is a set of unit IDs matched to a set of keys, plus the logic that decides who may use them when. The API is organized around one idea: **the units table is the source of truth.** Every system that feeds KISS is a *writer* to it, and a `source` field records where each unit's data came from.

That keeps one mental model no matter who is integrating:

- **You write facts** about each unit: who rents it, whether they are paid up, whether it should be overlocked, whether it is in auction or out of service.
- **KISS evaluates** those facts into an access decision after every write.
- **The tenant's app reads** the evaluated result and opens the lock.

You never compute access yourself or hold key material. You keep the facts current; KISS does the rest and serves keys per tap.

## Choose your path

The same endpoints serve every caller; a Bearer token's scope decides what each one can do. Pick the path that matches what you are building.

<Cards>
  <Card title="How access works" icon="concepts" href="/docs/guides/concepts">
    The data model: units, tenants, facts, access states, entry points, and NFC keys.
  </Card>
  <Card title="Authentication" icon="auth" href="/docs/guides/authentication">
    Bearer tokens and scopes for partners, one-time-password sign-in for tenants.
  </Card>
  <Card title="PMS integration" icon="pms" href="/docs/guides/pms/quickstart">
    Push tenancy, balance, and overlock state from your system, and keep unit facts in sync.
  </Card>
  <Card title="Mobile app integration" icon="mobile" href="/docs/guides/white-label/quickstart">
    Authenticate tenants and read their access bundle to build your own app.
  </Card>
</Cards>

These paths describe the deepest layer KISS operates for you: from running everything (Full Platform), to running the back office while you bring your own tenant app (Back Office), to serving keys and logs into your own stack (API-Only). The contract is the same across all of them.

:::info The full API reference is on its way
KISS generates a machine-readable reference (every endpoint, request and response schema, and error shape) directly from the running code, so it never drifts from the live API. We are publishing it for self-service access now. Until it is live, the guides above describe the contract for the endpoints in production. Ask your KISS contact if you need the OpenAPI spec or example collections in advance.
:::
