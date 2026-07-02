---
sidebar_position: 3
sidebar_label: How access works
sidebar_custom_props:
  icon: concepts
---

# How KISS access works

This page explains the core model behind KISS: units, the facts you write, and how the access evaluator turns those facts into a decision the tenant's app can act on. Read it before making API calls so the rest of the docs make sense.

## Units and tenants

A **unit** is a storage space (for example "B204") with a smart lock on the door. Units belong to a location (a facility), and locations belong to a company.

A **tenant** is the person renting the unit. They use the ONELock Access app to tap their phone on the lock and open the door.

Units persist across tenants. When a tenant moves out, the unit resets (balance cleared, flags removed) but the lock stays. A new tenant can be assigned to the same unit later.

A tenant can rent multiple units, and a unit has one primary tenant at a time. Tenants can also have shared access to units they do not directly rent (for example, a business partner the primary tenant grants access to).

## The facts-based model

Instead of asking integrators to track a state machine, KISS asks you to keep a small set of **facts** about each unit current. KISS evaluates those facts to decide access.

Facts fall into three groups:

- **Occupancy:** Is the unit occupied? Who is the tenant?
- **Financial:** What is the balance due? Through what date is the account paid?
- **Flags:** Is the unit overlocked by the PMS? Exempt from lockout? In auction? Out of service?

Your job is to keep these up to date. You do not calculate whether a tenant should have access. You send the current facts, and KISS runs its evaluator to decide.

## Which facts gate access

These are the fields you control. Some directly gate access; others are informational or feed an optional delinquency calculation.

| Field | Gates access? | Meaning |
| --- | --- | --- |
| `pms_lockout` | Yes | The overlock switch. `true` revokes the tenant's lock access; `false` restores it. |
| `pms_lock_exempt` | Yes | Never deny this tenant for billing or overlock reasons: skips the balance checks and `pms_lockout`. Auction, out-of-service, and a future `move_in_date` still apply. |
| `pms_auction` | Yes | Unit is in auction status; tenant access is denied. |
| `pms_unrentable` | Yes | Unit is out of service; no tenant access. |
| `move_in_date` | Yes | A future date delays access until that date. Compared as a calendar date in the facility's timezone, so access starts at the beginning of the move-in day. |
| `balance_due` | Optional | The amount the tenant owes. With `paid_through_date`, KISS can compute delinquency against the location's threshold and grace period. Informational if you drive lockouts yourself. |
| `paid_through_date` | Optional | The date the account is paid through. Pairs with `balance_due` for KISS-computed delinquency. |
| `pms_status_raw` | No | Your system's own status label, stored verbatim so both support teams see the same word. |

:::tip Pick one delinquency owner
If your system owns the delinquency rules, drive the overlock explicitly: set `pms_lockout` on delinquency, clear it on payment, and treat `balance_due` / `paid_through_date` as informational. If you would rather KISS compute delinquency, send `balance_due` and `paid_through_date` on every change and KISS applies the location's threshold and grace period. Driving the overlock yourself is the recommended default.
:::

## The evaluator: precedence order

After every write, KISS evaluates a unit's facts in a fixed order. The **first** rule that matches decides the outcome:

1. A manager's on-site override (lockout or exemption), when present, beats everything below it.
2. `pms_unrentable`, then `pms_auction`: the unit resolves to that state (`unrentable` or `auction`) and the tenant cannot unlock.
3. Vacant unit (no active tenancy, or the tenant record cannot be resolved): no tenant access.
4. `move_in_date` in the future: access denied until that date.
5. `pms_lock_exempt`: access allowed.
6. `pms_lockout`: access denied (subject to a short grace window just after move-in).
7. Balance past the location's threshold and grace period: access denied as delinquent.
8. `blanket_delinquency`: tenant is delinquent on another unit at the same location: access denied.
9. Otherwise: access allowed.

Several rules are gated by location policy toggles (for example, whether the location respects `pms_lockout` or `pms_lock_exempt`, and whether blanket delinquency applies). Your KISS contact configures those per location with you.

## Access states and reasons

The evaluator resolves every unit that has a lock, or that sits in a zone with an entry point, into an `access_state` and an `access_reason`. This is what a read returns. A unit with neither a lock nor an entry point is not evaluated: both fields are `null`.

| State | Meaning | Tenant can unlock? |
| --- | --- | --- |
| `vacant` | No tenant assigned to this unit | No |
| `tenant_permitted` | Tenant is assigned and all checks pass | Yes |
| `tenant_denied` | Tenant is assigned but access is denied (see reason) | No |
| `auction` | Unit is in the auction process | No |
| `unrentable` | Unit is marked as not available for rent (maintenance, damage) | No |

The `access_reason` field explains why a unit ended up in its state. It is populated whenever a tenant is assigned, so for both `tenant_permitted` and `tenant_denied`; for `vacant`, `auction`, and `unrentable` it is `null`.

**Permitted reasons**

| Reason | What happened |
| --- | --- |
| `active` | All checks passed; tenant is in good standing |
| `pms_exempt` | The `pms_lock_exempt` flag skipped the billing checks |
| `system_exempt` | An operator granted access via an on-site override |

**Denied reasons**

| Reason | What happened |
| --- | --- |
| `delinquent` | Tenant is past due on payment beyond the grace period |
| `future_move_in` | Tenant's lease has not started yet |
| `blanket_delinquency` | Tenant is delinquent on another unit at the same location |
| `pms_lockout` | The PMS flagged this unit for denied access (overlock, lien, legal hold) |
| `system_lockout` | An operator locked out the unit via the dashboard |

:::note Exact shapes live in the reference
This guide explains the model. The exact field names and enum values for any endpoint come from the API reference. When a guide and the reference disagree, the reference wins.
:::

## Entry points and zones

**Entry points** are shared access points such as gates, building doors, or elevator readers. They are separate from unit locks but connected through **zones**.

A **zone** is a grouping within a location. A unit belongs to a zone, and entry points are assigned to zones. If a tenant has access to a unit in Zone B, they also get access to Zone B's entry points (for example, "Building B Door").

Entry point access depends on unit access. If a tenant is denied on all their units in a zone, they lose entry point access for that zone too. A unit does not need its own smart lock for this: a unit without a lock still counts toward its zone's entry points, so keeping its facts current matters even when there is no lock on the door.

## How unit data gets in: source types

KISS supports three integration models. A `source` field records which one owns each unit.

| Source type | How data flows | Who you are |
| --- | --- | --- |
| **Push** | Your system sends data to KISS via the write endpoints | A PMS integrator, an email-scraper integrator, or any source calling `PUT/DELETE /units/{unit_id}/tenancy`, `PATCH /units/{unit_id}`, or `PATCH /units` |
| **Pull** | KISS fetches data from your PMS on demand | A PMS with an API that KISS connects to (configured by the KISS team) |
| **Standalone** | Data is managed directly in the KISS dashboard | Operators with no PMS integration |

If you are reading these docs, you are most likely a **push** integrator or a **mobile app** developer. Pull integrations are configured server-side by the KISS team and need no API calls from you.

A push write will not silently take over a unit owned by a pull-mode integration: that conflict returns `409 Conflict`. Units with no integration owner (standalone, managed only in the dashboard) are adopted by the first push write.

## NFC keys

When the tenant app calls `GET /access`, the response includes an NFC key for each permitted lock and entry point. The app passes the key to the KISS SDK to open the lock on a tap, then reports the result. Keys are **served, never exported** (borrowed per tap), so KISS can revoke and rotate them, and the app caches the bundle to keep working offline.

:::note Locks are installed in the Manager app
The API manages unit facts and tenancy, not lock hardware. Installing a physical lock and pairing it to a unit (the unit-and-lock pairing KISS calls a **bundle**) is done on-site with the ONELock Manager app, which registers the lock over NFC. There is no API call to attach a lock to a unit; once a lock is paired, its key flows to permitted tenants through `GET /access`.
:::

## Where to go next

That is the whole model: you keep facts current, KISS evaluates them, and the apps act on the result. From here, follow the path that matches what you are building:

- **[Sync partners](/guides/pms/quickstart)** — push unit and tenant facts into KISS from a PMS or any data source.
- **[App partners](/guides/white-label/quickstart)** — build your own tenant app on the access bundle and NFC keys.

Every endpoint also has its own page in the [API Reference](/reference/kiss-api-reference).
