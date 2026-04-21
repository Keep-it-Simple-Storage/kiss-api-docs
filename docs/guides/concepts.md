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

The `reason` field tells you why a unit ended up in its current state:

**Permitted reasons:**

| Reason | What happened |
|---|---|
| `active` | All checks passed — tenant is in good standing |
| `pms_exempt` | The PMS exempted this unit from lockout despite other flags |
| `system_exempt` | An operator exempted this unit via an ONELock override |

**Denied reasons:**

| Reason | What happened |
|---|---|
| `delinquent` | Tenant is past due on payment beyond the grace period |
| `future_move_in` | Tenant's lease hasn't started yet |
| `blanket_delinquency` | Tenant is delinquent on another unit at the same location |
| `pms_lockout` | The PMS flagged this unit for denied access (overlock, lien, legal hold) |
| `system_lockout` | An operator locked out the unit via the ONELock dashboard |

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
| **Push** | Your system sends data to KISS via write endpoints | PMS integrator, email-scraper integrator, or any source calling `/pms/events/*`, `PATCH /pms/units/{crm_unit_id}`, or `POST /pms/units/sync` |
| **Pull** | KISS fetches data from your PMS on demand | PMS with an API that KISS connects to (configured by KISS team) |
| **Standalone** | Data is managed directly in the KISS dashboard | Operators without a PMS integration |

If you're reading this documentation, you're most likely a **push** integrator or a **white-label app** developer. Pull integrations are configured server-side by the KISS team and don't require API calls from your end.

Once a unit is created under one source type, it stays under that source type. A push-owned unit will not be overwritten by a pull sync, and vice versa — attempts return `409 Conflict`.

---

## Integration Patterns for Push Sources

There are two ways to write into KISS as a push integrator. Pick the one that matches how your source produces data.

### State-oriented: `POST /pms/units/sync`

Use this when your source can produce the **full current state** of every unit on demand — most PMSs with an API fall here.

- One endpoint. Bulk upsert. Idempotent.
- You send the full unit object (all known facts). KISS reconciles.
- Typical cadence: every 15 minutes, or after a detected change event.
- Partial failures return `200` with per-unit errors in the `errors[]` array.

### Event-oriented: `/pms/events/*` + `PATCH /pms/units/{crm_unit_id}`

Use this when your source produces **sparse events** — a move-in email, a payment notification, an MCP tool call — and cannot reconstruct full unit state without a local cache.

- `POST /pms/events/move-in` — creates the unit if missing, upserts the tenant, sets `occupied=true`.
- `POST /pms/events/move-out` — triggers the documented 8-field reset (see move-out section below).
- `PATCH /pms/units/{crm_unit_id}` — partial update of any fact field. `occupied` and `tenant` go through the `/events/*` endpoints instead.
- Each endpoint takes only the fields the event actually carries. No state reconstruction required.

Both paths hit the same fact-apply service internally and run the same access evaluation after every write. You can mix them in one integration — use bulk sync for nightly reconciliation and events+patch for real-time updates.

### Idempotency

Every write endpoint accepts an optional `Idempotency-Key` header. Send a new unique value per logical operation (any opaque string up to 255 characters — UUIDs work well); reuse the same value when retrying. The server stores the key + request hash + response for 24 hours:

- Same key, same payload → returns cached response, no second write.
- Same key, different payload → `409 Conflict`.

This is stronger than the payload-hash idempotency an earlier draft of these docs promised, and it's the right primitive for at-least-once retry semantics.

---

## NFC Keys

When a tenant calls `GET /tenant/access`, the response includes a key string for each permitted lock and entry point. This key is the NFC credential — the app passes it to the KISS Flutter SDK, which uses it to communicate with the ONELock hardware during a tap.

Here's how it works:

1. App calls `GET /tenant/access` and receives unit/entry point data with key strings
2. App passes the key to the Flutter SDK
3. Tenant taps their phone on the lock
4. The SDK uses the key to authenticate with the lock via NFC
5. App reports the result back to KISS via the logs endpoint

The app should **cache the access response** for offline use. This way, tenants can still open their lock even without network connectivity. On the next app launch or pull-to-refresh, the app fetches fresh data from the API.

---

## Putting It Together

Here's how everything connects for the two main integration paths:

**If you're a PMS integrator (state-oriented):**
```
Your PMS syncs unit facts → KISS evaluates access → Tenant opens lock via app
```

**If you're an event-driven integrator (email scraper, MCP agent, webhook relay):**
```
Event arrives → You call /pms/events/* or PATCH /pms/units/{id} → KISS evaluates → Tenant sees update
```

**If you're a white-label app developer:**
```
Tenant logs in via one-time password (OTP) → App fetches access data → SDK handles NFC → App reports logs
```

Both paths rely on the same underlying data model. The PMS keeps facts current, and the app reads the evaluated result. KISS sits in the middle, turning raw facts into access decisions.
