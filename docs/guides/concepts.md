---
sidebar_position: 3
---

# Concepts

This page explains the core concepts behind KISS. Read this before making API calls so you understand how the pieces fit together.

---

## Units and Tenants

A **unit** is a storage space (e.g., "B204") with a smart lock on the door. Units belong to a location (facility), and locations belong to a company.

A **tenant** is the person renting the unit. They use a mobile app to tap their phone on the lock and open the door.

Units persist across tenants. When a tenant moves out, the unit resets (balance cleared, flags removed) but the lock stays. A new tenant can be assigned to the same unit later.

A tenant can rent multiple units, and a unit can only have one primary tenant at a time. Tenants can also have **shared access** to units they don't directly rent (e.g., a business partner granted access by the primary tenant).

---

## Facts-Based Model

KISS uses a facts-based approach to manage unit data. Instead of tracking complex state machines, integrators simply write **facts** about a unit and KISS evaluates them to determine access.

Facts include:

- **Occupancy:** Is the unit occupied? Who is the tenant?
- **Financial:** What is the balance due? When is the account paid through?
- **Flags:** Is the unit locked out by the PMS? Exempt from lockout? In auction? Unrentable?

As an integrator, your job is to keep these facts up to date. KISS handles the rest. You don't need to calculate whether a tenant should have access. You just send the current state of the unit and KISS runs its evaluation engine to decide.

---

## Access States

Every unit with a lock is evaluated into one of five access states. This is what you'll see in the `state` field of the API response.

| State | Meaning | Tenant can unlock? |
|---|---|---|
| `vacant` | No tenant assigned to this unit | No |
| `tenant_permitted` | Tenant is assigned and all checks pass | Yes |
| `tenant_denied` | Tenant is assigned but access is denied (see reason) | No |
| `auction` | Unit is in the auction process | No |
| `unrentable` | Unit is marked as not available for rent (maintenance, damage, etc.) | No |

When access is denied, the `reason` field tells you why:

| Reason | What happened |
|---|---|
| `active` | All checks passed. Access granted. |
| `delinquent` | Tenant is past due on payment beyond the grace period |
| `future_move_in` | Tenant's lease hasn't started yet |
| `blanket_delinquency` | Tenant is delinquent on another unit at the same location |
| `pms_lockout` | The PMS flagged this unit for denied access (overlock, lien, legal hold) |
| `system_lockout` | An operator locked out the unit via the ONELock dashboard |
| `pms_exempt` | The PMS exempted this unit from lockout despite other flags |
| `system_exempt` | An operator exempted this unit via an ONELock override |

---

## Entry Points and Zones

**Entry points** are shared access points like gates, building doors, or elevator readers. They are separate from unit locks but connected through **zones**.

A **zone** is a grouping within a location. A unit belongs to a zone, and entry points are assigned to zones. If a tenant has access to a unit in Zone B, they also get access to Zone B's entry points (e.g., "Building B Door").

However, entry point access depends on unit access. If a tenant is denied on all their units in a zone, they lose entry point access for that zone too. The API response includes a `would_have_access` field on entry points to distinguish between "access denied because of a unit denial" and "no access at all."

---

## Source Types

KISS supports three integration models for how unit data gets into the system. As an integrator, you'll be using one of these:

| Source type | How data flows | Who you are |
|---|---|---|
| **Push** | Your PMS sends data to KISS via the sync API | PMS integrator calling `POST /pms/units/sync` |
| **Pull** | KISS fetches data from your PMS on demand | PMS with an API that KISS connects to (configured by KISS team) |
| **Standalone** | Data is managed directly in the KISS dashboard | Operators without a PMS integration |

If you're reading this documentation, you're most likely a **push** integrator or a **white-label app** developer. Pull integrations are configured server-side by the KISS team and don't require API calls from your end.

---

## NFC Keys

When a tenant calls `GET /tenant/access`, the response includes everything needed for NFC lock interaction. The app passes this data to the KISS Flutter SDK, which handles the actual NFC communication with the ONELock hardware.

Here's how it works:

1. App calls `GET /tenant/access` and receives the unit/entry point data
2. App passes the access data to the Flutter SDK
3. Tenant taps their phone on the lock
4. The SDK communicates with the lock via NFC
5. App reports the result back to KISS via the logs endpoint

The app should **cache the access response** for offline use. This way, tenants can still open their lock even without network connectivity. On the next app launch or pull-to-refresh, the app fetches fresh data from the API.

---

## Putting It Together

Here's how everything connects for the two main integration paths:

**If you're a PMS integrator:**
```
Your PMS syncs unit facts → KISS evaluates access → Tenant opens lock via app
```

**If you're a white-label app developer:**
```
Tenant logs in via OTP → App fetches access data → SDK handles NFC → App reports logs
```

Both paths rely on the same underlying data model. The PMS keeps facts current, and the app reads the evaluated result. KISS sits in the middle, turning raw facts into access decisions.
