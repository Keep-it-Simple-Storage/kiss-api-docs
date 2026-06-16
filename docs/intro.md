---
sidebar_position: 1
sidebar_label: Introduction
slug: /
sidebar_custom_props:
  icon: introduction
---

import {Cards, Card} from '@site/src/components/Cards';

# Introduction

Welcome to the KISS API. KISS is an access control platform for self-storage, and this is the one-stop home for everything you need to build on it.

## Overview

KISS locks are NFC devices with no battery and no network connection: the tenant's phone powers and operates the lock through a tap, the same technology used for contactless payments. Because the lock itself is offline, everything intelligent happens in the apps and the platform behind them.

The **KISS API** is how external systems take part in that platform. Whether you run a property management system, build your own tenant app, or pull access data into your own tools, you talk to one versioned REST API.

**Base URL:**

```
https://api-app.keepitsimplestorage.com/api/v2
```

## The KISS platform at a glance

<Cards columns={3}>
  <Card title="Tenant mobile app" subtitle="ONELock Access" icon="mobile">
    Tenants sign in with their mobile number and a one-time SMS code, then open their lock with an NFC tap. The app caches a signed access bundle so it keeps working offline.
  </Card>
  <Card title="Manager mobile app" subtitle="ONELock Manager" icon="manager">
    Site staff install and assign locks to units, open units when needed, and apply manual overrides such as an on-site lockout or an exemption.
  </Card>
  <Card title="Web portal" icon="admin">
    A browser console for company settings, locations, units, access logs, and API tokens. Managers sign in with email and password.
  </Card>
</Cards>

Your integration is the fourth piece. Your system keeps each unit's business facts current (who rents it, whether they are paid up, whether it should be overlocked) and KISS evaluates those facts into an access decision it delivers to the tenant's app. One business event becomes one HTTP call.

## One API, many writers

The API is organized around one idea: **the units table is the source of truth.** Every system that feeds KISS is a *writer* to it, and a `source` field records where each unit's data came from.

That keeps one mental model no matter who is integrating:

- **You write facts** about each unit: who rents it, whether they are paid up, whether it should be overlocked, whether it is in auction or out of service.
- **KISS evaluates** those facts into an access decision after every write.
- **The tenant's app reads** the evaluated result and opens the lock.

You never compute access yourself or hold key material. You keep the facts current; KISS does the rest and serves keys per tap.

## Choose your path

The same endpoints serve every caller; a Bearer token's scope decides what each one can do. Pick the path that matches what you are building.

<Cards>
  <Card title="How access works" icon="concepts" href="/guides/concepts">
    The data model: units, tenants, facts, access states, entry points, and NFC keys.
  </Card>
  <Card title="Authentication" icon="auth" href="/guides/authentication">
    Bearer tokens and scopes for partners, one-time-password sign-in for tenants.
  </Card>
  <Card title="PMS integration" icon="pms" href="/guides/pms/quickstart">
    Push tenancy, balance, and overlock state from your system, and keep unit facts in sync.
  </Card>
  <Card title="Mobile app integration" icon="mobile" href="/guides/white-label/quickstart">
    Authenticate tenants and read their access bundle to build your own app.
  </Card>
</Cards>

These paths describe the deepest layer KISS operates for you: from running everything (Full Platform), to running the back office while you bring your own tenant app (Back Office), to serving keys and logs into your own stack (API-Only). The contract is the same across all of them.

:::info Looking for the full API reference?
The complete, machine-readable reference (every endpoint, request and response schema, and error shape) is generated directly from the running code, so it never drifts from the live API. Browse it at **[app.keepitsimplestorage.com/docs/api](https://app.keepitsimplestorage.com/docs/api)**.
:::
