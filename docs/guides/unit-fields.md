---
sidebar_position: 2
sidebar_label: "What to send"
sidebar_custom_props:
  icon: concepts
---

# What to send for each unit

KISS decides who can open a unit from the facts you send about it. The API accepts a write that carries only a few fields, and it does not reject one that leaves the rest out. Do not read that as "the rest are optional": each field below powers a feature, and a field you never send switches that feature off for every customer you serve, without an error on either side.

Send everything under **Required**. Send everything under **Recommended** that your system has.

## Required

| Field | Send it on | What goes wrong without it |
| --- | --- | --- |
| `occupied` | [`PATCH /units`](/reference/v-2-units-sync) | The unit reads as vacant and its tenant cannot open it. [`PUT /units/{unit_id}/tenancy`](/reference/v-2-units-tenancy-put) sets it for you. |
| The tenant: `external_tenant_id` plus a `tenant` block, or a KISS `tenant_id` | `PUT /units/{unit_id}/tenancy` | Nobody can open the unit. Setting `occupied` and `external_tenant_id` on a sync records who rents it in your system, but does not give anyone access. |
| `tenant.phone` | `PUT /units/{unit_id}/tenancy` | Tenants sign in to the app with their phone number, and the welcome text goes to it. Without it the tenant gets no welcome text and cannot sign in. |
| `move_in_date` | `PUT /units/{unit_id}/tenancy`, `PATCH /units` | A tenant with a future move-in date can open the unit from the start of that day, in the facility's timezone. Without the date, a reserved tenant can open it right away. Send it as a plain date (`2026-10-28`) in the facility's calendar, not a timestamp: a timestamp is read by its UTC date, so an evening move-in in the Americas reads as the next day. Send it on every tenancy write: a tenancy write without it clears the date. |
| `paid_through_date` | [`PATCH /units/{unit_id}`](/reference/v-2-units-patch), `PATCH /units` | The location's grace period counts from this date. Without it a tenant is never past grace, so someone who stopped paying keeps access. It also sets how long the app keeps working offline at locations that use that setting, and starts the location's automatic auction countdown if it has one. |
| `balance_due` | `PATCH /units/{unit_id}`, `PATCH /units` | KISS denies a tenant who owes more than the location's threshold and is past the grace period. Without a balance, KISS never sees anyone as owing. Site staff also see the balance on the tenant's page. |
| `lockout` | `PATCH /units/{unit_id}`, `PATCH /units` | The switch for any denial your system decides: an overlock, a lien, a legal hold. Without it those decisions never reach the lock. |
| `auction` | `PATCH /units/{unit_id}`, `PATCH /units` | While a unit is in auction its tenant cannot open it. Without the flag, the tenant keeps access through the sale unless you also set `lockout`, or the location has an auction window and the paid-through date is past it. |
| `location_id` or `external_location_code` | `POST /units`, `PATCH /units`, `PUT /units/{unit_id}/tenancy` | Only if your key reaches more than one location: without it the write is rejected. |

## Recommended

| Field | What it does |
| --- | --- |
| `lock_exempt` | Marks a tenant who must never be locked out (for example under a court order or a military-service protection). Without it, KISS's balance rule can deny them. At locations that respect it, it also overrides your `lockout` and the location's auction window, so don't set it on a tenant you also need to overlock. |
| `unrentable` | Shows the unit as out of service to site staff, and blocks any tenant still attached to it. |
| `unit_name` (sync) / `name` (`POST /units`) | The name tenants see in the app and in their welcome text. A unit created by sync without one is named after your `external_unit_id`. |
| `external_unit_id` | Lets you address units by your own id in syncs and look them up with [`GET /units`](/reference/v-2-units-index). Without it you must store the KISS `unit_id`. |
| `external_tenant_id` on a sync | Lets KISS notice when the occupant changes, so an on-site overlock a manager placed on the previous tenant ends automatically. |
| `tenant.first_name`, `tenant.last_name` | The welcome text greets the tenant by name, and site staff see who rents the unit. |
| `status_raw` | Your own status word, shown to support so both teams can talk about the same unit in the same terms. It does not affect access. |

## Optional

| Field | Why it doesn't matter to KISS |
| --- | --- |
| `ledger_id` | Stored and returned on reads. Nothing in KISS reads it for an integration that writes through this API. |
| `tenant.email` | Stored on the tenant's profile. Tenants sign in with their phone number. |

## Who decides delinquency

Send `balance_due` and `paid_through_date` in either case: they set the offline window and the auction countdown, and site staff rely on them.

- **Your system decides.** Set `lockout` when you would overlock and clear it on payment. KISS denies as soon as you set it, at locations that respect your lockout flag. KISS's grace period does not apply to `lockout`.
- **KISS decides.** Use `lockout` only for liens and legal holds, and let KISS apply the location's balance threshold and grace period. Use this when a location must keep a past-due tenant's access for a set number of days, for example because state law requires it: the grace period does that, and a `lockout` you set on day one would override it.

Your KISS contact sets the threshold, the grace period, and whether your `lockout` and `lock_exempt` flags are respected, per location.

## Keeping the facts current

- A field you leave out of a sync item or a `PATCH /units/{unit_id}` keeps its stored value. Leaving a field out never clears it.
- `PUT /units/{unit_id}/tenancy` does not take `balance_due` or `paid_through_date`. Follow every move-in with a `PATCH /units/{unit_id}` that sets both.
- A tenancy write sets `lock_exempt` to false unless you send it, and clears `auction` and `unrentable`. It keeps `lockout` only when the same tenant already occupies the unit; a move-in for anyone else clears it. Send `lock_exempt` with the move-in if it applies.
- Send payments and status changes as they happen with `PATCH /units/{unit_id}`. To record a paid-off balance, send `balance_due: 0` there.
- In every `PATCH /units` sync item, send the unit's full current facts, including `balance_due` and `paid_through_date`, even when only one of them changed. `PATCH /units/{unit_id}` takes only what changed.
- Re-send every occupied unit with [`PATCH /units`](/reference/v-2-units-sync) at least once a day, early in the facility's day, with a new `Idempotency-Key` for each day's send (a request repeating a key used in the last 24 hours with the same body is answered from the earlier response and not applied again, and one with a different body is rejected with `409`; reuse a key only to retry the same request after a timeout or error). KISS applies move-in days, grace periods and auction countdowns when it receives a write for the unit, so this re-send is when they take effect: a tenant whose move-in day starts at midnight can open the unit from your morning send, not from midnight. Batches carry up to 500 units.
- On move-out, call [`DELETE /units/{unit_id}/tenancy`](/reference/v-2-units-tenancy-delete). It clears the tenant, move-in date, balance, paid-through date, and the lockout, auction and out-of-service flags, so the next renter starts clean. `lock_exempt` is not cleared; the next tenancy write resets it unless you send it.
