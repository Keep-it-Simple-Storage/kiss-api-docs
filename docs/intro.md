---
sidebar_position: 1
slug: /
---

# KISS API Documentation

Welcome to the KISS API documentation. This API allows you to integrate with Keep It Simple Storage for smart lock access and property management.

**Base URL:**

```
https://api.keepitsimplestorage.com/api/v1
```

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

You're a property management software company that needs to sync unit and tenant data into KISS.

- Push all your unit data in a single idempotent call
- KISS handles access evaluation automatically
- No multi-step dance, no order dependency

[Get Started](/docs/guides/pms/quickstart)

## Supporting guides

- [Authentication](/docs/guides/authentication) — API tokens for PMS, OTP flow for tenants
- [Error Handling](/docs/guides/error-handling) — error formats, status codes, troubleshooting
- [API Reference](/docs/api-reference/kiss-api) — full endpoint reference
