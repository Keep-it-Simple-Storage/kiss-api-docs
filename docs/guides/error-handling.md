---
sidebar_position: 4
sidebar_custom_props:
  icon: errors
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
    "units.2.crm_unit_id": ["The crm_unit_id field is required."]
  }
}
```

The `errors` object maps field paths to arrays of error messages. For items in an array, the path includes the index in dot notation (e.g., `units.2.crm_unit_id` is the third unit in the array).

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
| `409` | Conflict | Source-type collision (a push write against a pull-owned unit) **or** `Idempotency-Key` reused with a different payload. |
| `429` | Too Many Requests | Rate limit exceeded. Wait and retry. |
| `500` | Server Error | Something went wrong on our end. If this persists, contact support. |

---

## Common Mistakes and Fixes

### Syncing a unit without `crm_unit_id`

**Error:**
```json
{
  "message": "Validation failed.",
  "errors": {
    "units.0.crm_unit_id": ["The crm_unit_id field is required."]
  }
}
```

**Fix:** `crm_unit_id` is the **only** required field on a sync item. Everything else (`occupied`, `move_in_date`, `pms_tenant_id`, `balance_due`, the `pms_*` flags) is optional, so send only what you know. To mark a unit occupied, set `occupied: true` and include the tenant's `pms_tenant_id`. Note that `pms_tenant_id` is a **flat** field on the unit, not a nested `tenant` object:
```json
{
  "crm_unit_id": "PMS-U-1001",
  "occupied": true,
  "pms_tenant_id": "PMS-T-5001",
  "move_in_date": "2026-06-01"
}
```

---

### Sending duplicate `crm_unit_id` values, or both location fields

**Error:**
```json
{
  "message": "Validation failed.",
  "errors": {
    "units": ["Duplicate crm_unit_id values are not allowed."]
  }
}
```

**Fix:** Each `crm_unit_id` may appear at most once per `PATCH /units` request, so de-duplicate the batch before sending. Separately, a single item may set `location_id` **or** `pms_location_code` to place a unit, but not both; sending both fails with `The units.0.location_id field cannot be present together with units.0.pms_location_code.`

---

### Using an expired or invalid OTP

**Error:** the message depends on what went wrong, and is one of:
```json
{ "message": "Invalid otp." }
```
```json
{ "message": "Otp expired. Please request a new one." }
```
```json
{ "message": "No otp request found. Please resend the login link." }
```

**Fix:** Request a fresh code through the OTP sign-in flow and try again.

---

### Using an expired Bearer token

**Error:**
```json
{
  "message": "Unauthorized."
}
```

**Fix:** The tenant's Bearer token has expired. Re-authenticate through the OTP sign-in flow to get a new token. There is no refresh token mechanism.

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

### Lock not found or not accessible

A `lock` ID in the URL that doesn't exist returns `404` with a generic not-found message. A lock that exists but isn't yours returns `403`:
```json
{
  "message": "You do not have access to this lock."
}
```

**Fix:** Use the lock `id` from the access response (`GET /access`). If you own the lock and still get `404`, double-check the ULID.

---

### Entry point not found or not accessible

An `entryPoint` ID that doesn't exist returns `404` with a generic not-found message. An entry point that exists but isn't yours returns `403`:
```json
{
  "message": "You do not have access to this entry point."
}
```

**Fix:** Use the entry-point `id` from the access response (`GET /access`). If you own it and still get `404`, double-check the ULID.

---

### Rate limited

**Error:**
```json
{
  "message": "Too many attempts. Please try again in 60 seconds."
}
```

**Fix:** You've exceeded the rate limit. Wait for the window to reset (the message states the delay) and retry. See [Rate limits](/guides/rate-limits) for what is throttled today.

---

### Idempotency-Key reused with a different payload

**Error (HTTP 409):**
```json
{
  "message": "Idempotency-Key reused with a different request."
}
```

**Fix:** You sent two requests with the same `Idempotency-Key` header but different bodies. The key is tied to a specific logical operation — reusing it with different data is a client-side bug. Generate a new unique value for each new logical operation; reuse the same value only when retrying the *exact same* request.

---

### Source-type conflict

**Error (HTTP 409):**
```json
{
  "message": "This unit is managed by a pull-mode PMS integration. Contact KISS support to change."
}
```

**Fix:** The unit you're trying to write to is owned by a pull-mode integration. A push write cannot silently take it over; the source-of-truth rule protects partner data. (Standalone units, managed only in the dashboard, are adopted by a push write and do not conflict.) If you need to migrate a pull-owned unit to push, reach out to KISS support.

---

### Re-sending the same sync data

This is **not** an error. `PATCH /units` is an upsert keyed on `crm_unit_id`, so re-sending your current roster is safe: KISS reconciles each unit to the state you send. There is no separate "unchanged" count; a unit that already exists is reported under `updated`:

```json
{
  "message": "Sync completed.",
  "meta": {},
  "data": {
    "synced_at": "2026-04-07T14:30:00Z",
    "total": 3,
    "created": 0,
    "updated": 3,
    "errors": []
  }
}
```

No need to check whether a unit exists before syncing. Send your current state and KISS reconciles.

---

## Debugging Tips

### 1. Check the health endpoint first

If something isn't working, start here:

```bash
curl https://api-app.keepitsimplestorage.com/api/v2/health
```

If this returns a `200`, the API is up and the issue is in your request. If it doesn't respond, the API may be down.

### 2. Check your token

A `401` on every request usually means your token is wrong or expired. For PMS integrators, verify the API token in the KISS dashboard under Company > API. For tenant tokens, re-run the OTP flow.

### 3. Read the error message

KISS error messages are specific. "The crm_unit_id field is required" tells you exactly what's missing. Check your payload against the [API Reference](/reference/kiss-api-reference).

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
