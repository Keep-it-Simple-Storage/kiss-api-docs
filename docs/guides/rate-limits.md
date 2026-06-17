---
sidebar_position: 5
sidebar_label: "Rate limits"
sidebar_custom_props:
  icon: limits
---

# Rate limits

The KISS API may rate-limit requests to keep it fast and fair for everyone. Design your client to back off when it hits a limit. Sustained abuse can get a token throttled or revoked.

## How throttling works

When you exceed a limit, the API responds with `429 Too Many Requests`. The body is the standard envelope and tells you how long to wait:

```json
{ "message": "Too many attempts. Please try again in 60 seconds." }
```

Treat `429` as a normal, recoverable signal, not an error to surface to users:

- Wait for the window to reset (the message states the delay), then retry.
- Use **exponential backoff with jitter** for repeated `429`s.
- Never retry in a tight loop.

## What is throttled today

| Surface | Scope | Limit |
| --- | --- | --- |
| Tenant OTP sign-in (`POST /auth/otp`, `POST /auth/tokens`) | Per IP address | 5 attempts per minute |

Other surfaces (unit writes and reads) are **not** rate-limited today, but that may change. Build your client to handle `429` everywhere regardless, and keep reads cheap with `ETag` / `If-None-Match`.

:::info Coming soon (KEEP-952)
Throttling on writes and reads, plus the exact counts and windows, is a product decision in progress and will be published here (and in the [API Reference](/reference/kiss-api-reference)) once locked. Design for retries and treat `429` as the contract.
:::

## Staying well under the limits

- **Cache reads** with `ETag` / `If-None-Match`. A `304 Not Modified` is cheap and avoids re-downloading unchanged data.
- **Batch unit updates** through `PATCH /units` (bulk) instead of many per-unit calls.
- **Schedule full reconciliations off-peak**; use targeted events (assign/remove primary user, fact patches) the rest of the time.
- **Reuse one token per integration** rather than minting many.
