---
sidebar_position: 5
sidebar_label: "Rate limits"
sidebar_custom_props:
  icon: limits
---

# Rate limits

The KISS API is rate-limited to keep it fast and fair for everyone. Stay within the limits and design your client to back off when it hits them. Sustained abuse can get a token throttled or revoked.

## How throttling works

When you exceed a limit, the API responds with `429 Too Many Requests` and a `Retry-After` header (seconds to wait). Treat `429` as a normal, recoverable signal, not an error to surface to users:

- Wait the `Retry-After` duration, then retry.
- Use **exponential backoff with jitter** for repeated `429`s.
- Never retry in a tight loop.

The body is the standard envelope: `{ "message": "Too many attempts. Please try again in 60 seconds." }`.

## Limits by surface

| Surface | Scope | Notes |
| --- | --- | --- |
| Tenant OTP sign-in | Per phone number | Protects the SMS pipeline |
| Unit writes: `PATCH /units`, `PUT`/`DELETE /units/{unit_id}/tenancy`, `PATCH /units/{unit_id}` | Per company | A bulk `PATCH /units` counts as one request regardless of item count |
| Reads: `GET /units`, `GET /access` | Per company / per token | Use `ETag` / `If-None-Match` so unchanged data does not burn quota |

:::note Exact numbers are being finalized
Specific request counts and windows are a product decision in progress and will be published here (and in the [API Reference](/reference/kiss-api-reference)) once locked. Design for retries and treat `429` + `Retry-After` as the contract.
:::

## Staying well under the limits

- **Cache reads** with `ETag` / `If-None-Match`. A `304 Not Modified` is cheap and does not count against you the same way.
- **Batch unit updates** through `PATCH /units` (bulk) instead of many per-unit calls.
- **Schedule full reconciliations off-peak**; use targeted events (assign/remove primary user, fact patches) the rest of the time.
- **Reuse one token per integration** rather than minting many.
