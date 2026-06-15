---
sidebar_position: 3
sidebar_label: How access works
---

# How KISS access works

This page explains the core model behind KISS: units, the facts you write, and how the access evaluator turns those facts into a decision the tenant's app can act on. Read it before making API calls so the rest of the docs make sense.

---

## Units and tenants

A **unit** is a storage space (for example "B204") with a smart lock on the door. Units belong to a location (a facility), and locations belong to a company.

A **tenant** is the person renting the unit. They use the KISS Access app to tap their phone on the lock and open the door.

Units persist across tenants. When a tenant moves out, the unit resets (balance cleared, flags removed) but the lock stays. A new tenant can be assigned to the same unit later.

A tenant can rent multiple units, and a unit has one primary tenant at a time. Tenants can also have shared access to units they do not directly rent (for example, a business partner the primary tenant grants access to).

---

## The facts-based model

Instead of asking integrators to track a state machine, KISS asks you to keep a small set of **facts** about each unit current. KISS evaluates those facts to decide access.

Facts fall into three groups:

- **Occupancy:** Is the unit occupied? Who is the tenant?
- **Financial:** What is the balance due? Through what date is the account paid?
- **Flags:** Is the unit overlocked by the PMS? Exempt from lockout? In auction? Out of service?

Your job is to keep these up to date. You do not calculate whether a tenant should have access. You send the current facts, and KISS runs its evaluator to decide.

---

## Which facts gate access

These are the fields you control. Some directly gate access; others are informational or feed an optional delinquency calculation.

| Field | Gates access? | Meaning |
| --- | --- | --- |
| `pms_lockout` | Yes | The overlock switch. `true` revokes the tenant's lock access; `false` restores it. |
| `pms_lock_exempt` | Yes | Never deny this tenant for billing reasons, regardless of other flags. |
| `pms_auction` | Yes | Unit is in auction status; tenant access is denied. |
| `pms_unrentable` | Yes | Unit is out of service; no tenant access. |
| `move_in_date` | Yes | A future date delays access until that date. |
| `balance_due` / `paid_through_date` | Optional | KISS can compute delinquency from these against the location's threshold and grace period. Informational if you drive lockouts yourself. |
| `pms_status_raw` | No | Your system's own status label, stored verbatim so both support teams see the same word. |

:::tip Pick one delinquency owner
If your system owns the delinquency rules, drive the overlock explicitly: set `pms_lockout` on delinquency, clear it on payment, and treat `balance_due` / `paid_through_date` as informational. If you would rather KISS compute delinquency, send `balance_due` and `paid_through_date` on every change and KISS applies the location's threshold and grace period. Driving the overlock yourself is the recommended default.
:::

---

## The evaluator: precedence order

After every write, KISS evaluates a unit's facts in a fixed order. The **first** rule that matches decides the outcome:

1. A manager's on-site override (lockout or exemption), when present, beats everything below it.
2. `pms_unrentable`, then `pms_auction`: access denied.
3. Vacant unit (no active tenancy): no tenant access.
4. `move_in_date` in the future: access starts on that date.
5. `pms_lock_exempt`: access allowed.
6. `pms_lockout`: access denied.
7. Balance past the location's threshold and grace period: access denied as delinquent.
8. Otherwise: access allowed.

Location policy toggles (for example, whether the location respects `pms_lockout`) can adjust which rules apply. Your KISS contact configures those per location with you.

---

## Access states and reasons

The evaluator resolves every unit with a lock into a `state` and a `reason`. This is what a read returns.

| State | Meaning | Tenant can unlock? |
| --- | --- | --- |
| `vacant` | No tenant assigned to this unit | No |
| `tenant_permitted` | Tenant is assigned and all checks pass | Yes |
| `tenant_denied` | Tenant is assigned but access is denied (see reason) | No |
| `auction` | Unit is in the auction process | No |
| `unrentable` | Unit is marked as not available for rent (maintenance, damage) | No |

The `reason` field explains why a unit ended up in its state:

**Permitted reasons**

| Reason | What happened |
| --- | --- |
| `active` | All checks passed; tenant is in good standing |
| `pms_exempt` | The PMS exempted this unit from lockout despite other flags |
| `system_exempt` | An operator exempted this unit via an override |

**Denied reasons**

| Reason | What happened |
| --- | --- |
| `delinquent` | Tenant is past due on payment beyond the grace period |
| `future_move_in` | Tenant's lease has not started yet |
| `blanket_delinquency` | Tenant is delinquent on another unit at the same location |
| `pms_lockout` | The PMS flagged this unit for denied access (overlock, lien, legal hold) |
| `system_lockout` | An operator locked out the unit via the dashboard |

:::note Exact shapes live in the reference
This guide explains the model. The exact field names and enum values for any endpoint come from the API reference, which is generated from the live code. When a guide and the reference disagree, the reference wins.
:::

---

## Entry points and zones

**Entry points** are shared access points such as gates, building doors, or elevator readers. They are separate from unit locks but connected through **zones**.

A **zone** is a grouping within a location. A unit belongs to a zone, and entry points are assigned to zones. If a tenant has access to a unit in Zone B, they also get access to Zone B's entry points (for example, "Building B Door").

Entry point access depends on unit access. If a tenant is denied on all their units in a zone, they lose entry point access for that zone too. Reads include a `would_have_access` field on entry points so you can distinguish "access denied because of a unit denial" from "no access at all."

---

## How unit data gets in: source types

KISS supports three integration models. A `source` field records which one owns each unit.

| Source type | How data flows | Who you are |
| --- | --- | --- |
| **Push** | Your system sends data to KISS via the write endpoints | A PMS integrator, an email-scraper integrator, or any source calling `PUT/DELETE /units/{unit_id}/tenancy`, `PATCH /units/{unit_id}`, or `PATCH /units` |
| **Pull** | KISS fetches data from your PMS on demand | A PMS with an API that KISS connects to (configured by the KISS team) |
| **Standalone** | Data is managed directly in the KISS dashboard | Operators with no PMS integration |

If you are reading these docs, you are most likely a **push** integrator or a **mobile app** developer. Pull integrations are configured server-side by the KISS team and need no API calls from you.

Once a unit exists under one source type it stays there. A push-owned unit is not overwritten by a pull sync, and the reverse is also true; conflicting writes return `409 Conflict`.

---

## Two ways to write as a push integrator

Pick the shape that matches how your source produces data. Both hit the same fact-apply logic internally and run the same evaluation after every write, so you can mix them.

### State-oriented: `PATCH /units`

Use this when your source can produce the **full current state** of every unit on demand, which is where most PMSs with an API land.

- One endpoint. Bulk upsert, matched on your `crm_unit_id` in the body. Idempotent. Up to 500 units per request.
- You send each unit's known facts; KISS reconciles.
- Typical cadence: every 15 minutes, or after a detected change event.
- Partial failures return `200` with per-unit problems in an `errors` array, so always check it.

### Event-oriented: `PUT/DELETE /units/{unit_id}/tenancy` plus `PATCH /units/{unit_id}`

Use this when your source produces **sparse events** (a move-in email, a payment notification, an MCP tool call) and cannot reconstruct full unit state without a local cache.

- `PUT /units/{unit_id}/tenancy` records a move-in: marks the unit occupied and, when you include a tenant block, sets up the tenant so they can claim the unit in the app.
- `DELETE /units/{unit_id}/tenancy` records a move-out and resets the unit to vacant.
- `PATCH /units/{unit_id}` is the workhorse for sparse fact updates such as overlock on delinquency and release on payment.
- Each call carries only the fields the event actually changed. No state reconstruction required.

Per-unit paths address the unit by its KISS **ULID** (`unit_id`). The bulk endpoint matches on your own `crm_unit_id` in the body, so you can sync without ever storing KISS IDs. The [PMS integration guide](/docs/guides/pms/quickstart) walks through both shapes end to end.

### Idempotency

Every write accepts an `Idempotency-Key` header. Send a fresh opaque value (up to 255 characters; a UUID works well) per logical operation, and reuse the same value when retrying. KISS remembers the key, request, and response for 24 hours, scoped to your company:

- Same key, same payload: the original response is replayed and nothing is applied twice. Safe to retry on timeouts or 5xx.
- Same key, different payload: `409 Conflict`. Generate a new key for each distinct event.

---

## NFC keys

When a tenant's app calls `GET /access`, the response includes a key string for each permitted lock and entry point. That key is the NFC credential: the app passes it to the KISS Flutter SDK, which uses it to talk to the lock during a tap.

The flow:

1. App calls `GET /access` and receives units and entry points with key strings.
2. App passes the key to the Flutter SDK.
3. Tenant taps their phone on the lock.
4. The SDK uses the key to authenticate with the lock over NFC.
5. App reports the result back to KISS via the logs endpoints.

Keys are **served, never exported**. The app caches the access bundle for offline use, so tenants can open their lock without connectivity, and refreshes it on the next launch or pull-to-refresh. Because callers borrow keys rather than holding a static dump, KISS can revoke and rotate them.

---

## Putting it together

The same data model serves every path:

**State-oriented PMS integrator**

```text
Your PMS syncs unit facts -> KISS evaluates access -> Tenant opens lock via app
```

**Event-driven integrator (email scraper, MCP agent, webhook relay)**

```text
Event arrives -> You call PUT/DELETE /units/{unit_id}/tenancy or PATCH /units/{unit_id} -> KISS evaluates -> Tenant sees the update
```

**Mobile app developer**

```text
Tenant signs in with a one-time password -> App calls GET /access -> SDK handles NFC -> App reports logs
```

In every case the writer keeps facts current and the app reads the evaluated result. KISS sits in the middle, turning raw facts into access decisions.
