---
sidebar_position: 4
---

# Error Handling

This guide documents the standard error response format, what each HTTP status code means in the KISS API, and how to troubleshoot common issues.

---

## Error Response Format

All error responses follow a consistent JSON structure:

```json
{
  "message": "A human-readable description of what went wrong."
}
```

For validation errors, the response includes field-level details:

```json
{
  "message": "Validation failed.",
  "errors": {
    "units.0.crm_unit_id": ["The crm_unit_id field is required."],
    "units.0.occupied": ["The occupied field is required."]
  }
}
```

The `errors` object maps field paths to arrays of error messages. For nested fields, the path uses dot notation (e.g., `units.0.tenant.phone`).

---

## HTTP Status Codes

| Status | Name | When you'll see it |
|---|---|---|
| `200` | OK | Request succeeded |
| `201` | Created | Resource created (e.g., log entry) |
| `400` | Bad Request | Malformed JSON or invalid request structure |
| `401` | Unauthorized | Missing, invalid, or expired token |
| `403` | Forbidden | Token is valid but lacks permission for this resource |
| `404` | Not Found | The resource doesn't exist (e.g., wrong lock ID or entry point ID) |
| `422` | Unprocessable Entity | Request is well-formed but fails validation (missing required fields, invalid values) |
| `409` | Conflict | Source-type collision (a push write against a pull-owned unit, or vice versa) **or** `Idempotency-Key` reused with a different payload. |
| `429` | Too Many Requests | Rate limit exceeded. Wait and retry. |
| `500` | Server Error | Something went wrong on our end. If this persists, contact support. |
| `501` | Not Implemented | Endpoint exists but isn't available yet (e.g., webhook registration) |

---

## Common Mistakes and Fixes

### Syncing a unit without required fields

**Error:**
```json
{
  "message": "Validation failed.",
  "errors": {
    "units.0.crm_unit_id": ["The crm_unit_id field is required."],
    "units.0.occupied": ["The occupied field is required."]
  }
}
```

**Fix:** Every unit in the sync payload must include `crm_unit_id` and `occupied`. If `occupied` is `true`, you also need a `tenant` object with `pms_tenant_id`, `first_name`, and `last_name`.

---

### Syncing an occupied unit without tenant info

**Error:**
```json
{
  "message": "Validation failed.",
  "errors": {
    "units.0.tenant": ["The tenant field is required when occupied is true."]
  }
}
```

**Fix:** When `occupied` is `true`, include the `tenant` object:
```json
{
  "crm_unit_id": "PMS-U-1001",
  "occupied": true,
  "tenant": {
    "pms_tenant_id": "PMS-T-5001",
    "first_name": "Jane",
    "last_name": "Smith"
  }
}
```

---

### Syncing a move-in without move_in_date

**Error:**
```json
{
  "message": "Validation failed.",
  "errors": {
    "units.0.move_in_date": ["The move_in_date field is required when occupied is true."]
  }
}
```

**Fix:** When `occupied` is `true`, include `move_in_date` alongside the `tenant` object.

---

### Using an expired or invalid OTP

**Error:**
```json
{
  "message": "The OTP code is invalid or has expired."
}
```

**Fix:** The OTP has expired or was entered incorrectly. Request a new one via `POST /auth/phone` and try again.

---

### Using an expired Bearer token

**Error:**
```json
{
  "message": "Unauthorized."
}
```

**Fix:** The tenant's Bearer token has expired. Re-authenticate through the OTP flow (`POST /auth/phone` then `POST /auth/verify-otp`) to get a new token. There is no refresh token mechanism.

---

### Sending a request without a token

**Error:**
```json
{
  "message": "Unauthorized."
}
```

**Fix:** Include the token in the `Authorization` header:
```
Authorization: Bearer YOUR_TOKEN
```

---

### Phone number not found

**Error:**
```json
{
  "message": "A tenant with the submitted phone number does not exist."
}
```

**Fix:** The phone number is not associated with any tenant in KISS. Verify the tenant was synced from the PMS with a valid phone number, or check for typos in the country code / phone number.

---

### Lock not found

**Error:**
```json
{
  "message": "Lock not found."
}
```

**Fix:** The `lock_id` in the URL doesn't match any resource. Double-check the ID from the `GET /tenant/access` response.

---

### Entry point not found

**Error:**
```json
{
  "message": "Entry point not found."
}
```

**Fix:** The `entry_point_id` in the URL doesn't match any resource. Double-check the ID from the `GET /tenant/access` response.

---

### Rate limited

**Error:**
```json
{
  "message": "Too many attempts. Please try again in 60 seconds."
}
```

**Fix:** You've exceeded the rate limit. Wait for the window to reset and retry. See the [rate limits table](./authentication.md#rate-limits) for limits per endpoint. The response includes a `Retry-After` header indicating how long to wait.

---

### Idempotency-Key reused with a different payload

**Error (HTTP 409):**
```json
{
  "message": "Idempotency-Key reused with a different request."
}
```

**Fix:** You sent two requests with the same `Idempotency-Key` header but different bodies. The key is tied to a specific logical operation — reusing it with different data is a client-side bug. Generate a new UUID for each new logical operation; reuse the same UUID only when retrying the *exact same* request.

---

### Source-type conflict

**Error (HTTP 409):**
```json
{
  "message": "This unit is managed by a pull-mode PMS integration. Contact KISS support to change."
}
```

**Fix:** The unit you're trying to write to was created by a different integration mode (pull, standalone). A push write cannot silently take over a pull-owned unit — the source-of-truth rule protects partner data. If you need to migrate a unit between source types, reach out to KISS support.

---

### Sending duplicate sync data

This is **not** an error. The sync endpoint is idempotent. Posting the same data multiple times produces the same result with no side effects. The response will show `unchanged` for units that didn't change:

```json
{
  "message": "Sync completed.",
  "data": {
    "synced_at": "2026-04-07T14:30:00Z",
    "total": 3,
    "created": 0,
    "updated": 0,
    "unchanged": 3,
    "errors": []
  }
}
```

No need to check if a unit or tenant exists before syncing. Just send your current state and KISS reconciles.

---

## Debugging Tips

### 1. Check the health endpoint first

If something isn't working, start here:

```bash
curl https://api.keepitsimplestorage.com/api/v1/health
```

If this returns a `200`, the API is up and the issue is in your request. If it doesn't respond, the API may be down.

### 2. Check your token

A `401` on every request usually means your token is wrong or expired. For PMS integrators, verify the API token in the KISS dashboard under Company > API. For tenant tokens, re-run the OTP flow.

### 3. Read the error message

KISS error messages are specific. "The crm_unit_id field is required" tells you exactly what's missing. Check your payload against the [API Reference](/docs/api-reference/kiss-api).

### 4. Check field paths in validation errors

Validation errors include the exact path to the problem field. `units.2.tenant.phone` means the third unit in your array has an issue with the tenant's phone field.

### 5. Test with a minimal payload

If a large sync is failing, reduce to a single unit with only required fields to isolate the problem:

```json
{
  "units": [
    {
      "crm_unit_id": "TEST-001",
      "occupied": false
    }
  ]
}
```

If this works, add fields back one at a time until you find what's causing the error.
