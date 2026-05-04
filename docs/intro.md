---
sidebar_position: 1
slug: /
---

# KISS API Documentation

Welcome to the KISS API documentation. This site hosts the conceptual guides and quickstarts you need to integrate with Keep It Simple Storage for smart-lock access and property-management sync.

**Base URL:**

```
https://api.keepitsimplestorage.com/api/v2
```

:::info API reference is moving
The full machine-readable API reference (endpoints, request/response schemas, error envelopes) is being consolidated onto a code-derived OpenAPI viewer published directly from the live API. While that's being made public, the guides below describe the contract for the endpoints currently in production. Reach out to your KISS contact if you need the latest OpenAPI spec or example collections in advance.
:::

:::tip New to KISS?
Start with [Concepts](/docs/guides/concepts) to understand units, tenants, access states, and the facts-based data model before diving into the quickstarts.
:::

## Choose your integration path

### White-Label App Operators

You have your own tenant-facing mobile app and need to integrate with KISS for lock access.

- Authenticate tenants via phone + OTP
- Retrieve units, access status, and entry points in a single call
- Report lock activity back to KISS

[Get Started](/docs/guides/white-label/quickstart)

### PMS Push Integrators

You're a property management software company (or any other system) that needs to sync unit and tenant data into KISS.

- **Event-driven sources** (email notifications, webhooks, MCP tool calls): use `PUT /units/{crm_unit_id}/tenancy` (move-in), `DELETE /units/{crm_unit_id}/tenancy` (move-out), and `PATCH /units/{crm_unit_id}` (sparse fact updates) to push just the fields a single event carries.
- **State-oriented sources** (traditional PMS with an API that can produce full unit state on demand): use `PATCH /units` to bulk-upsert idempotently.
- Every write endpoint accepts an `Idempotency-Key` header for safe retries.
- KISS handles access evaluation automatically after every write.

[Get Started](/docs/guides/pms/quickstart)

## Supporting guides

- [Authentication](/docs/guides/authentication) — API tokens for PMS, OTP flow for tenants
- [Error Handling](/docs/guides/error-handling) — error formats, status codes, troubleshooting
